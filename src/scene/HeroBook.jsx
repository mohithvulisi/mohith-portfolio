import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  Euler,
  FrontSide,
  LinearFilter,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Plane,
  Quaternion,
  Ray,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  VideoTexture
} from "three";
import { book, hitElements, motion, PHASE, useStore } from "../store/useStore";
import { leafBackPage, leafFrontPage } from "../content/layout";
import { portfolio } from "../content/portfolio";
import { BOOK } from "./metrics";
import { createLeafGeometry, createPageMaterial, GUTTER_BULGE, Leaf } from "./Leaf";
import { activateHit, attachTextures, beginDrag, director, dragTo, endDrag, peel, settlePeel, SHELF_SLIDE } from "./director";
import { sceneParts } from "./registry";
import { TextureManager } from "../textures/TextureManager";
import { COVER_WINDOW, renderBackCoverArt, renderCoverArt, renderSpineArt } from "../textures/proceduralArt";
import { qualitySettings } from "../utils/device";
import { sfx } from "../audio/sfx";

const GLOW = new Color(0.12, 1.0, 0.52);
const W = BOOK.pageW;
const H = BOOK.pageH;
const LEAF_T = BOOK.blockT / Math.max(book.leafCount, 1);

// Stack bookkeeping: item 0 = front cover, 1..n = leaves, n+1 = back cover.
const ITEM_T = [BOOK.coverT, ...Array.from({ length: book.leafCount }, () => LEAF_T), BOOK.coverT];
const BOTTOM_LEFT = ITEM_T.map((_, j) => ITEM_T.slice(j + 1).reduce((a, b) => a + b, 0));
const BOTTOM_RIGHT = ITEM_T.map((_, j) => ITEM_T.slice(0, j).reduce((a, b) => a + b, 0));

// Hinge height while turning: rise to the taller stack, then settle on the
// destination. Keeps a leaf from cutting through the stack it lands on.
const hingeCentre = (j, p) => {
  const left = BOTTOM_LEFT[j] + ITEM_T[j] / 2;
  const right = BOTTOM_RIGHT[j] + ITEM_T[j] / 2;
  const top = Math.max(left, right) + 0.004;
  return p < 0.5 ? left + (top - left) * p * 2 : top + (right - top) * (p * 2 - 1);
};

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const textureFrom = (canvas, srgb) => {
  const texture = new CanvasTexture(canvas);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 16;
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

// R = spot varnish (clearcoat), G = roughness, B = metalness: one texture, three
// slots. A warm band sweeps across the foil (emissive mask) when uGlint passes.
const physicalFrom = (art, glint) => {
  const orm = textureFrom(art.orm, false);
  const material = new MeshPhysicalMaterial({
    map: textureFrom(art.color, true),
    normalMap: textureFrom(art.normal, false),
    roughnessMap: orm,
    metalnessMap: orm,
    clearcoatMap: orm,
    emissiveMap: textureFrom(art.emissive, true),
    roughness: 1,
    metalness: 1,
    envMapIntensity: 2.4, // the foil needs the room's highlights to read as gold
    clearcoat: 1,
    clearcoatRoughness: 0.16,
    emissive: GLOW,
    emissiveIntensity: 0,
    toneMapped: false
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlint = glint;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlint;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         #ifdef USE_EMISSIVEMAP
           float foil = texture2D( emissiveMap, vEmissiveMapUv ).r;
           float sweep = ( vEmissiveMapUv.x * 0.55 + ( 1.0 - vEmissiveMapUv.y ) ) * 0.66;
           float band = 1.0 - smoothstep( 0.0, 0.08, abs( sweep - uGlint ) );
           totalEmissiveRadiance += vec3( 1.0, 0.84, 0.52 ) * foil * band * 2.4;
         #endif`
      );
  };
  material.customProgramCacheKey = () => "foil-cover";
  return material;
};

const HALO_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Soft emerald glow around the spine's outline, standing in for a bloom pass.
const HALO_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform vec3 uColor;
  uniform vec2 uHalf;
  uniform vec2 uCore;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * uHalf;
    vec2 d = abs(p) - uCore;
    float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
    float outside = smoothstep(-0.015, 0.02, dist);
    float r = max(dist, 0.0);
    float glow = exp(-r * 5.5) * 0.55 + exp(-r * 20.0) * 0.7;
    gl_FragColor = vec4(uColor, glow * outside * uIntensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const makeBlockMaterial = () => {
  const uniforms = { uStripes: { value: 60 } };
  const material = new MeshLambertMaterial({ color: "#efe7d4" });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBlockZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBlockZ = position.z;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBlockZ;\nuniform float uStripes;")
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nfloat stripe = fract((vBlockZ + 0.5) * uStripes);\ndiffuseColor.rgb *= 0.84 + 0.16 * smoothstep(0.1, 0.45, stripe);"
      );
  };
  material.customProgramCacheKey = () => "page-block";
  material.userData.uniforms = uniforms;
  return material;
};

const REEL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The reel printed as a live screentone: 45° AM halftone sampled per cell,
// solid ink in the shadows, the red title kept as vermilion dots.
const REEL_FRAGMENT = /* glsl */ `
  uniform sampler2D uVideo;
  uniform float uHasVideo;
  uniform float uTime;
  uniform float uAspect;
  uniform vec4 uCrop;
  uniform float uBrightness;
  varying vec2 vUv;

  vec3 procedural(vec2 uv) {
    vec2 c = uv - 0.5;
    c.x *= uAspect;
    float ang = atan(c.y, c.x);
    float rad = length(c);
    float rays = 0.5 + 0.5 * sin(ang * 22.0 + uTime * 0.7);
    float ring = 0.5 + 0.5 * sin(rad * 16.0 - uTime * 1.8);
    return vec3(mix(ring, rays, 0.55) * smoothstep(0.95, 0.05, rad));
  }

  void main() {
    float cells = 64.0;
    vec2 g = vec2(vUv.x * uAspect, vUv.y) * cells;
    vec2 r = vec2(g.x + g.y, g.x - g.y) * 0.70710678;
    vec2 cell = floor(r) + 0.5;
    vec2 f = r - cell;
    vec2 cg = vec2(cell.x + cell.y, cell.x - cell.y) * 0.70710678 / cells;
    vec2 sampleUv = clamp(vec2(cg.x / uAspect, cg.y), 0.0, 1.0);
    vec3 src = uHasVideo > 0.5 ? texture2D(uVideo, uCrop.zw + sampleUv * uCrop.xy).rgb : procedural(sampleUv);
    float l = dot(src, vec3(0.2126, 0.7152, 0.0722));
    l = smoothstep(0.03, 0.8, pow(clamp(l, 0.0, 1.0), 0.4545));
    float radius = sqrt((1.0 - l) / 3.14159);
    float d = length(f);
    float inkAmount = 1.0 - smoothstep(radius - 0.07, radius + 0.07, d);
    inkAmount = max(inkAmount, 1.0 - step(0.05, l));
    float red = clamp((src.r - max(src.g, src.b)) * 4.0, 0.0, 1.0);
    vec3 paper = vec3(0.87, 0.83, 0.74);
    vec3 ink = vec3(0.005, 0.028, 0.02);
    vec3 shu = vec3(0.78, 0.1, 0.045);
    vec3 col = mix(paper, ink, inkAmount);
    col = mix(col, shu, red * (1.0 - smoothstep(0.55, 0.64, d)));
    vec2 e = min(vUv, 1.0 - vUv);
    col *= 0.72 + 0.28 * smoothstep(0.0, 0.08, min(e.x / uAspect * 2.0, e.y));
    gl_FragColor = vec4(col * uBrightness, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const VIDEO_PHASES = new Set([PHASE.CAMERA_DOLLY, PHASE.COVER_INSPECT, PHASE.BOOK_OPEN, PHASE.RETURN_TO_SHELF]);

export function HeroBook() {
  const { gl, camera, raycaster } = useThree();
  const quality = useStore((s) => s.quality);
  const pageHeight = qualitySettings(quality).pageTexture;

  const root = useRef();
  const body = useRef();
  const frontCover = useRef();
  const backCover = useRef();
  const leftBlock = useRef();
  const rightBlock = useRef();
  const spine = useRef();
  const glowLight = useRef();
  const halo = useRef();

  useEffect(() => {
    sceneParts.hero = root.current;
    sceneParts.halo = halo.current;
    sceneParts.glowLight = glowLight.current;
    return () => {
      sceneParts.hero = null;
      sceneParts.halo = null;
      sceneParts.glowLight = null;
    };
  }, []);

  const manager = useMemo(
    () =>
      new TextureManager(book, {
        pageHeight,
        renderer: gl,
        canWork: () => !useStore.getState().busy && motion.leaves.every((leaf) => leaf.progress < 0.06 || leaf.progress > 0.94)
      }),
    [gl] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const art = useMemo(() => {
    const height = 2048;
    const back = renderBackCoverArt(height);
    return { cover: renderCoverArt(height), spine: renderSpineArt(height), back };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    manager.setPageHeight(pageHeight);
  }, [manager, pageHeight]);

  const parts = useMemo(() => {
    const leafGeometry = createLeafGeometry();
    const leaves = Array.from({ length: book.leafCount }, () => createPageMaterial(manager.blank));
    // the inside of the front cover rests on the right, so its gutter curves the other way
    const frontInner = createPageMaterial(manager.blank, { bulge: -GUTTER_BULGE });
    const backInner = createPageMaterial(manager.blank);
    const turnShadow = new Vector4(0, 0, 0, 0.08);
    [...leaves, frontInner, backInner].forEach((m) => {
      m.userData.uniforms.uTurnShadow.value = turnShadow;
    });
    const cloth = new MeshStandardMaterial({ color: "#0b4a37", roughness: 0.85, emissive: GLOW, emissiveIntensity: 0 });
    const hidden = new MeshBasicMaterial({ visible: false });
    const glint = { value: -1 };
    const coverOuter = physicalFrom(art.cover, glint);
    const spineMat = physicalFrom(art.spine, glint);
    const backOuter = physicalFrom(art.back, glint);
    const haloUniforms = {
      uIntensity: { value: 0 },
      uColor: { value: new Color(0.16, 1.0, 0.55) },
      uHalf: { value: new Vector2(0.75, 1.55) },
      uCore: { value: new Vector2(BOOK.totalT / 2 - 0.02, BOOK.coverH / 2 - 0.02) }
    };
    const halo = new ShaderMaterial({
      uniforms: haloUniforms,
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending
    });
    const winAspect = (COVER_WINDOW.w * BOOK.coverW) / (COVER_WINDOW.h * BOOK.coverH);
    const reelUniforms = {
      uVideo: { value: null },
      uHasVideo: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: winAspect },
      uCrop: { value: new Vector4(1, 1, 0, 0) },
      uBrightness: { value: 0.92 }
    };
    const reel = new ShaderMaterial({ uniforms: reelUniforms, vertexShader: REEL_VERTEX, fragmentShader: REEL_FRAGMENT, side: FrontSide });
    const [bx, by, bw, bh] = art.cover.balloon.rect;
    const balloon = {
      geometry: new PlaneGeometry(bw * BOOK.coverW, bh * BOOK.coverH),
      material: new MeshStandardMaterial({ map: textureFrom(art.cover.balloon.canvas, true), transparent: true, alphaTest: 0.02, roughness: 0.35 }),
      position: [-BOOK.coverW + (bx + bw / 2) * BOOK.coverW, BOOK.coverH / 2 - (by + bh / 2) * BOOK.coverH]
    };
    return {
      balloon,
      leafGeometry,
      leaves,
      frontInner,
      backInner,
      allPages: [...leaves, frontInner, backInner],
      turnShadow,
      glint,
      halo,
      haloUniforms,
      haloPlane: new PlaneGeometry(1.5, 3.1),
      cloth,
      coverBox: [cloth, cloth, cloth, cloth, hidden, hidden],
      coverGeometry: new BoxGeometry(BOOK.coverW, BOOK.coverH, BOOK.coverT),
      facePlane: new PlaneGeometry(BOOK.coverW, BOOK.coverH),
      spinePlane: new PlaneGeometry(1, BOOK.coverH),
      unitBox: new BoxGeometry(1, 1, 1),
      reelPlane: new PlaneGeometry(COVER_WINDOW.w * BOOK.coverW, COVER_WINDOW.h * BOOK.coverH),
      coverOuter,
      spineMat,
      backOuter,
      reel,
      reelUniforms,
      winAspect,
      blockLeft: makeBlockMaterial(),
      blockRight: makeBlockMaterial()
    };
  }, [art, manager]);

  // ── textures → materials ──────────────────────────────────────────────────
  useEffect(() => {
    attachTextures(manager);
    const apply = () => {
      parts.leaves.forEach((material, j) => {
        material.map = manager.get(leafFrontPage(j));
        material.userData.uniforms.uBackMap.value = manager.get(leafBackPage(j));
      });
      parts.frontInner.userData.uniforms.uBackMap.value = manager.get(0);
      parts.backInner.map = manager.get(book.pageCount - 1);
    };
    const off = manager.onChange(apply);
    // all of this runs behind the loader: no photo inking or uploads later
    manager.warmPhotos();
    [0, 1, 2, 3].forEach((page) => manager.renderNow(page));
    manager.setWindow(useStore.getState().spread);
    apply();
    return () => {
      off();
      manager.dispose();
    };
  }, [manager, parts]);

  useEffect(() => manager.setPageHeight(pageHeight), [manager, pageHeight]);

  // ── the reel on the cover ─────────────────────────────────────────────────
  useEffect(() => {
    const src = portfolio.media?.reel;
    if (!src) return undefined;
    let cancelled = false;
    let video = null;
    let texture = null;
    const sync = (phase, lastEvent) => {
      if (!video) return;
      if (VIDEO_PHASES.has(phase)) {
        if (phase === PHASE.CAMERA_DOLLY && lastEvent === "SELECT") video.currentTime = 0;
        video.play().catch(() => {});
      } else video.pause();
    };
    fetch(src, { method: "HEAD" })
      .then((res) => {
        const type = res.headers.get("content-type") ?? "";
        if (cancelled || !res.ok || !type.includes("video")) return;
        video = document.createElement("video");
        video.src = src;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.addEventListener("loadedmetadata", () => {
          const videoAspect = video.videoWidth / video.videoHeight;
          const scaleX = Math.min(1, parts.winAspect / videoAspect);
          const scaleY = Math.min(1, videoAspect / parts.winAspect);
          parts.reelUniforms.uCrop.value.set(scaleX, scaleY, (1 - scaleX) / 2, (1 - scaleY) / 2);
        });
        texture = new VideoTexture(video);
        texture.colorSpace = SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        parts.reelUniforms.uVideo.value = texture;
        // keep the procedural halftone until frames actually flow (autoplay can be blocked)
        video.addEventListener("playing", () => {
          parts.reelUniforms.uHasVideo.value = 1;
        });
        const { phase, lastEvent } = useStore.getState();
        sync(phase, lastEvent);
      })
      .catch(() => {});
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (state.phase !== prev.phase) sync(state.phase, state.lastEvent);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      texture?.dispose();
    };
  }, [parts]);

  // ── picking & gestures ────────────────────────────────────────────────────
  const scratch = useMemo(
    () => ({
      ndc: new Vector2(),
      inverse: new Matrix4(),
      ray: new Ray(),
      plane: new Plane(new Vector3(0, 0, 1), 0),
      hit: new Vector3(),
      corner: new Vector3()
    }),
    []
  );

  const stackTops = () => {
    let left = 0;
    let right = 0;
    motion.leaves.forEach((leaf) => {
      left += LEAF_T * (1 - leaf.progress);
      right += LEAF_T * leaf.progress;
    });
    return { left: BOOK.coverT + left, right: BOOK.coverT + right };
  };

  const rayInBody = (clientX, clientY) => {
    const rect = gl.domElement.getBoundingClientRect();
    scratch.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(scratch.ndc, camera);
    scratch.inverse.copy(body.current.matrixWorld).invert();
    scratch.ray.copy(raycaster.ray).applyMatrix4(scratch.inverse);
    return scratch.ray;
  };

  const planeX = (ray, z) => {
    scratch.plane.constant = -z;
    return ray.intersectPlane(scratch.plane, scratch.hit) ? scratch.hit : null;
  };

  // Which page (and where on it) sits under the pointer.
  const pick = (clientX, clientY) => {
    const { phase, spread } = useStore.getState();
    if (!body.current) return null;
    const ray = rayInBody(clientX, clientY);
    if (phase === PHASE.BOOK_CLOSE) {
      const p = planeX(ray, BOOK.totalT + 0.002);
      if (!p || p.x < 0 || p.x > BOOK.coverW || Math.abs(p.y) > BOOK.coverH / 2) return null;
      return { side: "back", u: p.x / BOOK.coverW, v: (BOOK.coverH / 2 - p.y) / BOOK.coverH, x: p.x };
    }
    const tops = stackTops();
    for (const side of ["left", "right"]) {
      const p = planeX(ray, side === "left" ? tops.left : tops.right);
      if (!p || Math.abs(p.y) > H / 2) continue;
      if (side === "left" && p.x >= -W && p.x <= 0) {
        return { side, page: 2 * (spread - 1) + 1, u: (p.x + W) / W, v: (H / 2 - p.y) / H, x: p.x };
      }
      if (side === "right" && p.x >= 0 && p.x <= W) {
        return { side, page: 2 * (spread - 1), u: p.x / W, v: (H / 2 - p.y) / H, x: p.x };
      }
    }
    return null;
  };

  const inside = (rect, u, v) => u >= rect[0] && u <= rect[0] + rect[2] && v >= rect[1] && v <= rect[1] + rect[3];

  const hitAt = (spot) => {
    if (!spot) return null;
    if (spot.side === "back") {
      const index = art.back.seals.findIndex((seal) => inside(seal.rect, spot.u, spot.v));
      if (index < 0) return null;
      const seal = art.back.seals[index];
      return { key: `seal:${index}`, page: -1, rect: seal.rect, action: { type: "link", href: seal.href } };
    }
    const blocks = book.pages[spot.page]?.blocks ?? [];
    const index = blocks.findIndex((block) => block.action && inside(block.rect, spot.u, spot.v));
    if (index < 0) return null;
    return { key: `${spot.page}:${index}`, page: spot.page, rect: blocks[index].rect, action: blocks[index].action };
  };

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map();
    let gesture = null;
    let pinch = null;

    const setCursor = (cursor) => {
      if (useStore.getState().cursor !== cursor) useStore.setState({ cursor });
    };

    const hover = (e) => {
      const { phase, spread, hoveredHit } = useStore.getState();
      if (phase !== PHASE.READING && phase !== PHASE.BOOK_CLOSE) return;
      const spot = pick(e.clientX, e.clientY);
      const hit = hitAt(spot);
      if ((hit?.key ?? null) !== (hoveredHit?.key ?? null)) {
        useStore.setState({ hoveredHit: hit });
        if (hit) sfx.hover();
      }
      // near a free edge the page lifts its corner, asking to be dragged
      const nearEdge =
        e.pointerType === "mouse" &&
        phase === PHASE.READING &&
        spot &&
        !hit &&
        ((spot.side === "left" && spot.u < 0.15 && spread < book.spreadCount) || (spot.side === "right" && spot.u > 0.85 && spread > 1));
      if (nearEdge) peel(spot.side);
      else settlePeel();

      if (hit) setCursor("link");
      else if (nearEdge) setCursor("grab");
      else if (!spot || phase === PHASE.BOOK_CLOSE) setCursor("default");
      else if (spot.side === "left") setCursor(spread >= book.spreadCount ? "close" : "next");
      else setCursor(spread > 1 ? "prev" : "default");
    };

    const down = (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), start: motion.camera.pinch };
        if (gesture?.drag) endDrag(gesture.drag, 0);
        gesture = null;
        return;
      }
      const { phase } = useStore.getState();
      if (phase !== PHASE.READING && phase !== PHASE.BOOK_CLOSE) return;
      const spot = pick(e.clientX, e.clientY);
      gesture = { id: e.pointerId, x0: e.clientX, y0: e.clientY, last: e.clientX, lastT: performance.now(), velocity: 0, spot, moved: false, drag: null };
    };

    const move = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        motion.camera.pinch = Math.min(1.2, Math.max(0.62, (pinch.start * pinch.distance) / Math.max(d, 1)));
        return;
      }
      if (!gesture || gesture.id !== e.pointerId) return hover(e);
      const now = performance.now();
      const dt = Math.max(1, now - gesture.lastT) / 1000;
      gesture.velocity = gesture.velocity * 0.6 + (((e.clientX - gesture.last) / window.innerWidth) / dt) * 0.4;
      gesture.last = e.clientX;
      gesture.lastT = now;
      const dx = e.clientX - gesture.x0;
      if (!gesture.moved && Math.hypot(dx, e.clientY - gesture.y0) > 8) {
        gesture.moved = true;
        const { phase, singlePage, pageSide } = useStore.getState();
        const side = gesture.spot?.side;
        const swipeOnly = singlePage && pageSide === "right";
        if (phase === PHASE.READING && side && !swipeOnly) {
          if (side === "left" && dx > 0) gesture.drag = beginDrag("left");
          if (side === "right" && dx < 0) gesture.drag = beginDrag("right");
          if (gesture.drag) {
            gesture.angle0 = Math.acos(Math.min(1, Math.max(-1, -gesture.spot.x / W)));
            setCursor("grabbing");
          }
        }
      }
      if (gesture.drag) {
        const tops = stackTops();
        const p = planeX(rayInBody(e.clientX, e.clientY), (tops.left + tops.right) / 2);
        if (p) {
          const angle = Math.acos(Math.min(1, Math.max(-1, -p.x / W)));
          dragTo(gesture.drag, gesture.drag.start + (angle - gesture.angle0) / Math.PI);
        }
      }
    };

    const up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!gesture || gesture.id !== e.pointerId) return;
      const g = gesture;
      gesture = null;
      if (g.drag) {
        endDrag(g.drag, g.velocity);
        hover(e);
        return;
      }
      const dx = e.clientX - g.x0;
      if (!g.moved) {
        const hit = hitAt(g.spot);
        if (hit) return activateHit(hit.action);
        if (!g.spot || g.spot.side === "back") return;
        if (g.spot.side === "left") director.next();
        else director.prev();
        return;
      }
      if (Math.abs(dx) > 40 && useStore.getState().phase === PHASE.READING) {
        if (dx > 0) director.next();
        else director.prev();
      }
    };

    const leave = () => {
      settlePeel();
      if (useStore.getState().hoveredHit) useStore.setState({ hoveredHit: null });
    };

    const wheel = (e) => {
      if (useStore.getState().phase !== PHASE.READING) return;
      motion.camera.pinch = Math.min(1.2, Math.max(0.62, motion.camera.pinch * (1 + e.deltaY * 0.0008)));
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, camera, raycaster]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── per-frame: pose, stack, curl uniforms, glow, highlight, a11y overlay ─
  const frame = useMemo(
    () => ({
      position: new Vector3(),
      quaternion: new Quaternion(),
      wobble: new Quaternion(),
      euler: new Euler(),
      tiltX: 0,
      tiltY: 0,
      float: 0,
      pulsePhase: 0,
      pulseSpeed: 3.2,
      highlightKey: null,
      highlightTarget: null,
      projected: new Vector3()
    }),
    []
  );

  const facesForPage = (page) => {
    if (page === 0) return { material: parts.frontInner, uniform: "uHighlightBack" };
    if (page === book.pageCount - 1) return { material: parts.backInner, uniform: "uHighlightFront" };
    if (page % 2 === 1) return { material: parts.leaves[(page - 1) / 2], uniform: "uHighlightFront" };
    return { material: parts.leaves[(page - 2) / 2], uniform: "uHighlightBack" };
  };

  const projectHit = (key, el, tops) => {
    const [first, second] = key.split(":");
    let rect;
    let toBody;
    if (first === "seal") {
      rect = art.back.seals[Number(second)]?.rect;
      toBody = (u, v) => scratch.corner.set(u * BOOK.coverW, BOOK.coverH / 2 - v * BOOK.coverH, BOOK.totalT);
    } else {
      const page = Number(first);
      rect = book.pages[page]?.blocks[Number(second)]?.rect;
      const right = page % 2 === 0;
      toBody = (u, v) => scratch.corner.set(right ? u * W : -W + u * W, H / 2 - v * H, right ? tops.right : tops.left);
    }
    if (!rect) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    [
      [rect[0], rect[1]],
      [rect[0] + rect[2], rect[1]],
      [rect[0], rect[1] + rect[3]],
      [rect[0] + rect[2], rect[1] + rect[3]]
    ].forEach(([u, v]) => {
      const p = toBody(u, v).applyMatrix4(body.current.matrixWorld).project(camera);
      const x = (p.x * 0.5 + 0.5) * w;
      const y = (-p.y * 0.5 + 0.5) * h;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    el.style.transform = `translate(${minX.toFixed(1)}px, ${minY.toFixed(1)}px)`;
    el.style.width = `${(maxX - minX).toFixed(1)}px`;
    el.style.height = `${(maxY - minY).toFixed(1)}px`;
  };

  useFrame((state, delta) => {
    if (!root.current) return;
    const dt = Math.min(delta, 0.05);
    const st = useStore.getState();
    const time = state.clock.elapsedTime;

    // book root pose along its current path
    const b = motion.book;
    const s = b.s;
    frame.position.lerpVectors(b.from.position, b.to.position, s).addScaledVector(b.arc, Math.sin(Math.PI * s));
    if (b.fromShelf) frame.position.z += SHELF_SLIDE * motion.hoverSlide * (1 - s);
    frame.quaternion.slerpQuaternions(b.from.quaternion, b.to.quaternion, smoothstep(b.rotWindow[0], b.rotWindow[1], s));
    b.current.position.copy(frame.position);
    b.current.quaternion.copy(frame.quaternion);
    // held in the hand: it breathes, and turns a little toward the pointer
    const holding = !st.reducedMotion && (st.phase === PHASE.COVER_INSPECT || st.phase === PHASE.BOOK_CLOSE);
    const k = 1 - Math.exp(-dt * 3);
    frame.tiltX += ((holding ? -state.pointer.y * 0.09 : 0) - frame.tiltX) * k;
    frame.tiltY += ((holding ? state.pointer.x * 0.16 : 0) - frame.tiltY) * k;
    frame.float += ((holding ? 1 : 0) - frame.float) * k;
    frame.position.y += Math.sin(time * 1.1) * 0.012 * frame.float;
    frame.wobble.setFromEuler(frame.euler.set(frame.tiltX, frame.tiltY + Math.sin(time * 0.7) * 0.02 * frame.float, 0));
    frame.quaternion.multiply(frame.wobble);
    root.current.position.copy(frame.position);
    root.current.quaternion.copy(frame.quaternion);

    // body offset keeps the closed book centred and the open spread on its spine
    const fc = motion.frontCover;
    const bc = motion.backCover;
    const openness = Math.min(fc, 1 - bc);
    body.current.position.x = (BOOK.coverW / 2) * (1 - fc) - (BOOK.coverW / 2) * bc;
    body.current.position.z = (-BOOK.totalT / 2) * (1 - openness);

    // covers
    frontCover.current.position.z = hingeCentre(0, fc);
    frontCover.current.rotation.y = fc * Math.PI;
    const last = ITEM_T.length - 1;
    backCover.current.position.z = hingeCentre(last, bc);
    backCover.current.rotation.y = bc * Math.PI;

    // leaves; a leaf in the air takes its slab with it, so the paper blocks
    // only count leaves resting on their side
    let leftT = 0;
    let rightT = 0;
    let shadowStrength = 0;
    const casting = (progress, bend) => {
      if (progress <= 0.002 || progress >= 0.998) return;
      const theta = progress * Math.PI;
      const edgeAngle = Math.min(Math.PI, Math.max(0, theta + bend * 0.5));
      const strength = 0.42 * Math.pow(Math.abs(Math.cos(theta)), 0.6);
      if (strength <= shadowStrength) return;
      shadowStrength = strength;
      parts.turnShadow.set(edgeAngle < Math.PI / 2 ? -1 : 1, Math.abs(Math.cos(edgeAngle)), strength, 0.04 + 0.22 * Math.sin(theta));
    };
    motion.leaves.forEach((leaf, j) => {
      const u = parts.leaves[j].userData.uniforms;
      u.uProgress.value = leaf.progress;
      u.uBend.value = leaf.bend;
      u.uPivotZ.value = hingeCentre(j + 1, leaf.progress) + LEAF_T / 2;
      u.uRestSide.value = leaf.progress < 0.001 ? -1 : leaf.progress > 0.999 ? 1 : 0;
      if (leaf.progress < 0.001) leftT += LEAF_T;
      else if (leaf.progress > 0.999) rightT += LEAF_T;
      casting(leaf.progress, leaf.bend);
    });
    casting(fc, 0);
    casting(bc, 0);
    if (!shadowStrength) parts.turnShadow.z = 0;
    parts.frontInner.userData.uniforms.uRestSide.value = fc > 0.999 ? 1 : 0;
    parts.backInner.userData.uniforms.uRestSide.value = bc < 0.001 ? -1 : 0;
    const placeBlock = (mesh, material, thickness, sign) => {
      mesh.visible = thickness > 0.004;
      mesh.scale.set(W - 0.004, H - 0.004, Math.max(thickness - 0.003, 0.0001));
      mesh.position.set((sign * W) / 2, 0, BOOK.coverT + thickness / 2 - 0.0015);
      material.userData.uniforms.uStripes.value = Math.max(4, thickness / 0.0022);
    };
    placeBlock(leftBlock.current, parts.blockLeft, leftT, -1);
    placeBlock(rightBlock.current, parts.blockRight, rightT, 1);

    // spine squashes flat under the gutter while the book lies open
    const depth = BOOK.totalT * (1 - 0.86 * openness);
    spine.current.position.set((BOOK.spineT / 2) * (1 - 2 * bc), 0, depth / 2);
    spine.current.rotation.y = bc * Math.PI;
    spine.current.scale.set(1, 1, depth);

    // emissive pulse: I(t) = 1.8 + 2.4 (1 + sin wt) / 2, w eased 3.2 ↔ 6.4 rad/s
    const targetSpeed = st.phase === PHASE.BOOK_HOVER ? 6.4 : 3.2;
    frame.pulseSpeed += (targetSpeed - frame.pulseSpeed) * (1 - Math.exp(-dt * 2.5));
    frame.pulsePhase += frame.pulseSpeed * dt;
    const intensity = st.reducedMotion ? 2.6 : 1.8 + (2.4 * (1 + Math.sin(frame.pulsePhase))) / 2;
    const glow = intensity * motion.glow;
    parts.spineMat.emissiveIntensity = glow * 0.6;
    parts.coverOuter.emissiveIntensity = glow * 0.42;
    parts.backOuter.emissiveIntensity = glow * 0.2;
    parts.cloth.emissiveIntensity = glow * 0.035;
    const onShelf = Math.pow(1 - s, 3) * (b.fromShelf ? 1 : 0);
    if (glowLight.current) {
      glowLight.current.intensity = intensity * 0.55 * onShelf * motion.glow;
      glowLight.current.position.set(frame.position.x, frame.position.y + 0.2, frame.position.z + BOOK.coverW / 2 + 0.55);
    }
    // halo sits on the spine's face, turned to the camera, and fades as the book leaves
    if (halo.current) {
      const hover = 1 + motion.hoverSlide * 0.35;
      parts.haloUniforms.uIntensity.value = (0.45 + 0.55 * ((intensity - 1.8) / 2.4)) * onShelf * motion.glow * hover;
      halo.current.visible = parts.haloUniforms.uIntensity.value > 0.002;
      halo.current.position.set(frame.position.x, frame.position.y, frame.position.z + BOOK.coverW / 2 + BOOK.spineT + 0.012);
      halo.current.quaternion.copy(state.camera.quaternion);
    }
    parts.glint.value = motion.glint;

    // highlight on the hovered / focused / stamped hit region
    const target = st.focusedHit ?? st.hoveredHit;
    if ((target?.key ?? null) !== frame.highlightKey) {
      if (frame.highlightTarget) frame.highlightTarget.material.userData.uniforms[frame.highlightTarget.uniform].value.set(0, 0, 0, 0);
      frame.highlightKey = target?.key ?? null;
      frame.highlightTarget = target && target.page >= 0 ? facesForPage(target.page) : null;
      if (frame.highlightTarget) {
        const [x, y, w, h] = target.rect;
        frame.highlightTarget.material.userData.uniforms[frame.highlightTarget.uniform].value.set(x, y, w, h);
      }
      motion.highlight = Math.min(motion.highlight, 0.2);
    }
    const wanted = target ? 1 : 0;
    motion.highlight += (wanted - motion.highlight) * (1 - Math.exp(-dt * (motion.highlight > 1 ? 4 : 10)));
    parts.allPages.forEach((m) => {
      m.userData.uniforms.uHighlightAmount.value = 0;
    });
    if (frame.highlightTarget) frame.highlightTarget.material.userData.uniforms.uHighlightAmount.value = motion.highlight;

    parts.reelUniforms.uTime.value = time;

    // accessible hit buttons follow the printed regions on screen
    if (hitElements.size && (st.phase === PHASE.READING || st.phase === PHASE.BOOK_CLOSE)) {
      const tops = stackTops();
      hitElements.forEach((el, key) => projectHit(key, el, tops));
    }
  });

  // ── R3F events for the shelf and the closed cover ────────────────────────
  const onOver = (e) => {
    e.stopPropagation();
    const { phase } = useStore.getState();
    if (phase === PHASE.SHELF_AMBIENT) {
      director.hoverOn();
      useStore.setState({ cursor: "book" });
    } else if (phase === PHASE.COVER_INSPECT) useStore.setState({ cursor: "open" });
  };
  const onOut = () => {
    const { phase } = useStore.getState();
    if (phase === PHASE.BOOK_HOVER) director.hoverOff();
    if (phase === PHASE.BOOK_HOVER || phase === PHASE.SHELF_AMBIENT || phase === PHASE.COVER_INSPECT) useStore.setState({ cursor: "default" });
  };
  const onClick = (e) => {
    const { phase } = useStore.getState();
    if (phase === PHASE.SHELF_AMBIENT || phase === PHASE.BOOK_HOVER) {
      e.stopPropagation();
      director.select();
    } else if (phase === PHASE.COVER_INSPECT) {
      e.stopPropagation();
      director.open();
    }
  };

  const half = BOOK.coverT / 2 + 0.0012;
  const win = COVER_WINDOW;

  return (
    <>
      <pointLight ref={glowLight} color="#39f0a0" distance={3.2} decay={2} intensity={0} />
      <mesh ref={halo} geometry={parts.haloPlane} material={parts.halo} renderOrder={10} frustumCulled={false} />
      <group ref={root} onPointerEnter={onOver} onPointerLeave={onOut} onClick={onClick}>
        <group ref={body}>
          {/* front cover: hinge at x = 0, swings over to the right */}
          <group ref={frontCover}>
            <mesh geometry={parts.coverGeometry} material={parts.coverBox} position={[-BOOK.coverW / 2, 0, 0]} />
            <mesh geometry={parts.facePlane} material={parts.coverOuter} position={[-BOOK.coverW / 2, 0, half]} />
            <mesh
              geometry={parts.reelPlane}
              material={parts.reel}
              position={[-BOOK.coverW + (win.x + win.w / 2) * BOOK.coverW, BOOK.coverH / 2 - (win.y + win.h / 2) * BOOK.coverH, half + 0.0008]}
            />
            <mesh geometry={parts.balloon.geometry} material={parts.balloon.material} position={[...parts.balloon.position, half + 0.0016]} />
            <Leaf geometry={parts.leafGeometry} material={parts.frontInner} position={[0, 0, -half]} />
          </group>

          {parts.leaves.map((material, j) => (
            <Leaf key={j} geometry={parts.leafGeometry} material={material} />
          ))}

          <mesh ref={leftBlock} geometry={parts.unitBox} material={parts.blockLeft} />
          <mesh ref={rightBlock} geometry={parts.unitBox} material={parts.blockRight} />

          {/* back cover: lies under the left stack, swings shut onto the right */}
          <group ref={backCover}>
            <mesh geometry={parts.coverGeometry} material={parts.coverBox} position={[-BOOK.coverW / 2, 0, 0]} />
            <Leaf geometry={parts.leafGeometry} material={parts.backInner} position={[0, 0, half]} />
            <mesh geometry={parts.facePlane} material={parts.backOuter} position={[-BOOK.coverW / 2, 0, -half]} rotation={[0, Math.PI, 0]} />
          </group>

          <group ref={spine}>
            <mesh geometry={parts.unitBox} material={parts.cloth} scale={[BOOK.spineT, BOOK.coverH, 1]} />
            <mesh geometry={parts.spinePlane} material={parts.spineMat} position={[BOOK.spineT / 2 + 0.0008, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
          </group>
        </group>
      </group>
    </>
  );
}

