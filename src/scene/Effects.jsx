import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { KawaseBlurPass, KernelSize } from "postprocessing";
import {
  AlwaysDepth,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget
} from "three";
import { motion, useStore } from "../store/useStore";
import { cameraPose } from "./director";
import { sceneParts } from "./registry";
import { maxDpr } from "../utils/device";

// The library never changes, so it is rendered once per viewpoint ("shelf"
// and "near") into a colour + depth texture. Every frame draws that capture
// on one full-screen quad, reprojected through the plane of the shelf so small
// camera moves (mouse sway, page pans, pinch) stay correct, and writes its
// depth so the live book and dust are still occluded properly. Only the book,
// its glow and the dust render for real. While the camera flies between
// viewpoints the room renders live at reduced resolution.
//
// Depth of field becomes a blurred copy of the near capture (a focus pull is a
// crossfade); bloom becomes a halo mesh; tone mapping runs in the renderer.

const SHELF_PLANE_Z = -0.75; // spines sit at ~-0.62, back panel at ~-2.2
const MAX_CAPTURE_PIXELS = 7.5e6;
const LIVE_RESOLUTION = 0.62; // fraction of the resting DPR while flying

const BACKDROP_VERTEX = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

const BACKDROP_FRAGMENT = /* glsl */ `
  uniform sampler2D uSharp;
  uniform sampler2D uBlurred;
  uniform sampler2D uDepth;
  uniform mat4 uInvViewProj;
  uniform mat4 uCaptureViewProj;
  uniform float uPlaneZ;
  uniform float uBlur;
  uniform float uDim;
  varying vec2 vNdc;

  void main() {
    // ray through this pixel, hit the shelf plane, look it up in the capture
    vec4 nearP = uInvViewProj * vec4(vNdc, -1.0, 1.0);
    vec4 farP = uInvViewProj * vec4(vNdc, 1.0, 1.0);
    nearP /= nearP.w;
    farP /= farP.w;
    vec3 dir = farP.xyz - nearP.xyz;
    float t = (uPlaneZ - nearP.z) / min(dir.z, -1e-4);
    vec4 clip = uCaptureViewProj * vec4(nearP.xyz + dir * t, 1.0);
    vec2 uv = clamp(clip.xy / clip.w * 0.5 + 0.5, 0.0005, 0.9995);
    vec3 sharp = texture2D(uSharp, uv).rgb;
    vec3 soft = texture2D(uBlurred, uv).rgb;
    gl_FragColor = vec4(mix(sharp, soft, uBlur) * uDim, 1.0);
    gl_FragDepth = texture2D(uDepth, uv).r;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const createContext = (blurred) => ({
  target: null,
  blurTarget: null,
  blurred,
  camera: new PerspectiveCamera(),
  viewProj: new Matrix4(),
  valid: false
});

// Viewpoints each capture has to serve; the capture frustum is fitted to all of
// their footprints on the shelf plane.
const viewpointsFor = (context) =>
  context === "shelf"
    ? [
        { pose: "shelf", sway: [0, 0] },
        { pose: "shelf", sway: [1, 1] },
        { pose: "shelf", sway: [-1, -1] },
        { pose: "shelf", sway: [1, -1] },
        { pose: "shelf", sway: [-1, 1] },
        { pose: "shelf", zoom: 1.07 }
      ]
    : [
        { pose: "inspect" },
        { pose: "reading", singlePage: false },
        { pose: "reading", singlePage: false, zoom: 1.24 },
        { pose: "reading", singlePage: true, pageSide: "right", zoom: 1.24 },
        { pose: "reading", singlePage: true, pageSide: "left", zoom: 1.24 }
      ];

const scratch = { pose: { p: new Vector3(), t: new Vector3() }, camera: new PerspectiveCamera(), v: new Vector3(), dir: new Vector3() };

// Fits an asymmetric frustum, seen from the first viewpoint, around everything
// the listed viewpoints can see of the shelf plane.
const fitCapture = (context, fov, aspect, ctx) => {
  const corners = [];
  viewpointsFor(context).forEach((view, index) => {
    cameraPose(view.pose, scratch.pose, view);
    const zoom = view.zoom ?? 1;
    const cam = scratch.camera;
    cam.fov = fov;
    cam.aspect = aspect;
    cam.near = 0.05;
    cam.far = 80;
    cam.updateProjectionMatrix();
    cam.position.copy(scratch.pose.p).sub(scratch.pose.t).multiplyScalar(zoom).add(scratch.pose.t);
    if (view.sway) {
      cam.position.x += view.sway[0] * 0.3;
      cam.position.y += view.sway[1] * 0.18;
    }
    cam.lookAt(scratch.pose.t);
    cam.updateMatrixWorld();
    if (index === 0) {
      ctx.camera.position.copy(cam.position);
      ctx.camera.quaternion.copy(cam.quaternion);
      ctx.camera.updateMatrixWorld();
    }
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ].forEach(([x, y]) => {
      const v = scratch.v.set(x, y, 0.5).unproject(cam);
      const dir = scratch.dir.subVectors(v, cam.position);
      const t = (SHELF_PLANE_Z - cam.position.z) / Math.min(dir.z, -1e-4);
      corners.push(cam.position.clone().addScaledVector(dir, t));
    });
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  corners.forEach((p) => {
    const v = p.applyMatrix4(ctx.camera.matrixWorldInverse);
    const tx = v.x / -v.z;
    const ty = v.y / -v.z;
    minX = Math.min(minX, tx);
    maxX = Math.max(maxX, tx);
    minY = Math.min(minY, ty);
    maxY = Math.max(maxY, ty);
  });
  const padX = (maxX - minX) * 0.03;
  const padY = (maxY - minY) * 0.03;
  const near = 0.05;
  const far = 80;
  const cam = ctx.camera;
  cam.near = near;
  cam.far = far;
  cam.projectionMatrix.makePerspective((minX - padX) * near, (maxX + padX) * near, (maxY + padY) * near, (minY - padY) * near, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  return { spanX: maxX - minX + padX * 2, spanY: maxY - minY + padY * 2 };
};

export function Effects() {
  const { gl, scene, camera, size, setDpr } = useThree();
  const state = useRef({ frames: 0, needsCapture: true, live: false, baseDpr: maxDpr(), resizeTimer: 0 });

  const pipeline = useMemo(() => {
    const uniforms = {
      uSharp: { value: null },
      uBlurred: { value: null },
      uDepth: { value: null },
      uInvViewProj: { value: new Matrix4() },
      uCaptureViewProj: { value: new Matrix4() },
      uPlaneZ: { value: SHELF_PLANE_Z },
      uBlur: { value: 0 },
      uDim: { value: 1 }
    };
    const backdrop = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({ uniforms, vertexShader: BACKDROP_VERTEX, fragmentShader: BACKDROP_FRAGMENT, depthFunc: AlwaysDepth, depthWrite: true })
    );
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -1000;
    backdrop.visible = false;
    const blur = new KawaseBlurPass({ kernelSize: KernelSize.HUGE, resolutionScale: 0.25 });
    return { uniforms, backdrop, blur, contexts: { shelf: createContext(false), near: createContext(true) } };
  }, []);

  useEffect(() => {
    scene.add(pipeline.backdrop);
    return () => {
      scene.remove(pipeline.backdrop);
      Object.values(pipeline.contexts).forEach((ctx) => {
        ctx.target?.dispose();
        ctx.blurTarget?.dispose();
      });
      pipeline.blur.dispose();
    };
  }, [scene, pipeline]);

  // a new viewport needs new captures; debounce so dragging a window edge is cheap
  useEffect(() => {
    const s = state.current;
    clearTimeout(s.resizeTimer);
    s.resizeTimer = setTimeout(() => {
      s.needsCapture = true;
    }, s.frames ? 250 : 0);
    return () => clearTimeout(s.resizeTimer);
  }, [size.width, size.height]);

  // adaptive resolution: sustained frame-time changes move the resting DPR
  // between 0.75 and the device maximum (textures are never rebuilt)
  useEffect(() => {
    const adjust = (factor) => () => {
      const s = state.current;
      s.baseDpr = Math.min(maxDpr(), Math.max(0.75, s.baseDpr * factor));
      setDpr(s.live ? s.baseDpr * LIVE_RESOLUTION : s.baseDpr);
    };
    const onDecline = adjust(0.85);
    const onIncline = adjust(1.12);
    window.addEventListener("chronicles:perf-decline", onDecline);
    window.addEventListener("chronicles:perf-incline", onIncline);
    return () => {
      window.removeEventListener("chronicles:perf-decline", onDecline);
      window.removeEventListener("chronicles:perf-incline", onIncline);
    };
  }, [setDpr]);

  const captureContext = (name) => {
    const ctx = pipeline.contexts[name];
    const captureDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const aspect = size.width / size.height;
    const { spanX, spanY } = fitCapture(name, camera.fov, aspect, ctx);
    const pxPerTan = (size.height * captureDpr) / (2 * Math.tan((camera.fov * Math.PI) / 360));
    let w = spanX * pxPerTan;
    let h = spanY * pxPerTan;
    const limit = Math.min(gl.capabilities.maxTextureSize, 4096);
    const scale = Math.min(1, limit / w, limit / h, Math.sqrt(MAX_CAPTURE_PIXELS / (w * h)));
    w = Math.max(64, Math.round(w * scale));
    h = Math.max(64, Math.round(h * scale));

    if (!ctx.target || ctx.target.width !== w || ctx.target.height !== h) {
      ctx.target?.dispose();
      ctx.target = new WebGLRenderTarget(w, h, { type: HalfFloatType, depthTexture: new DepthTexture(w, h) });
      ctx.target.texture.minFilter = LinearFilter;
      ctx.target.texture.generateMipmaps = false;
      if (ctx.blurred) {
        ctx.blurTarget?.dispose();
        ctx.blurTarget = new WebGLRenderTarget(Math.round(w / 2), Math.round(h / 2), { type: HalfFloatType, depthBuffer: false });
      }
    }

    const { room, hero, dust, halo, glowLight } = sceneParts;
    const visibility = [room?.visible, hero?.visible, dust?.visible, halo?.visible];
    const glowIntensity = glowLight?.intensity ?? 0;
    if (room) room.visible = true;
    if (hero) hero.visible = false;
    if (dust) dust.visible = false;
    if (halo) halo.visible = false;
    if (glowLight) glowLight.intensity = name === "shelf" ? 1.6 : 0;
    pipeline.backdrop.visible = false;

    gl.shadowMap.needsUpdate = true;
    gl.setRenderTarget(ctx.target);
    gl.clear();
    gl.render(scene, ctx.camera);
    if (ctx.blurred) {
      pipeline.blur.setSize(w, h);
      pipeline.blur.render(gl, ctx.target, ctx.blurTarget);
    }
    gl.setRenderTarget(null);

    [room, hero, dust, halo].forEach((part, i) => {
      if (part) part.visible = visibility[i];
    });
    if (glowLight) glowLight.intensity = glowIntensity;
    ctx.viewProj.multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse);
    ctx.valid = true;
  };

  useFrame(() => {
    const s = state.current;
    s.frames += 1;
    const { room } = sceneParts;
    if (!room) return gl.render(scene, camera);

    // first captures wait a few frames so contact shadows and the environment exist
    if (s.needsCapture && s.frames > 3) {
      captureContext("shelf");
      captureContext("near");
      s.needsCapture = false;
      if (!useStore.getState().sceneReady) {
        gl.compile(scene, camera);
        setTimeout(() => useStore.setState({ sceneReady: true }), 60);
      }
    }

    const r = motion.room;
    const ctx = pipeline.contexts[r.context];
    const live = r.live > 0.5 || !ctx.valid;
    if (live !== s.live) {
      s.live = live;
      setDpr(live ? s.baseDpr * LIVE_RESOLUTION : s.baseDpr);
    }
    room.visible = live;
    pipeline.backdrop.visible = !live;
    if (!live) {
      const u = pipeline.uniforms;
      camera.updateMatrixWorld();
      u.uInvViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
      u.uCaptureViewProj.value.copy(ctx.viewProj);
      u.uSharp.value = ctx.target.texture;
      u.uDepth.value = ctx.target.depthTexture;
      u.uBlurred.value = ctx.blurred ? ctx.blurTarget.texture : ctx.target.texture;
      u.uBlur.value = ctx.blurred ? r.blur : 0;
      u.uDim.value = r.dim;
    }
    gl.render(scene, camera);
  }, 1);

  return null;
}
