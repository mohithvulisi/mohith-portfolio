import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { motion, PHASE, useStore } from "../store/useStore";
import { director, setViewport } from "./director";

// Position P(s) and look-at target T(s) are interpolated separately and the
// camera is aimed with lookAt: Euler angles are never tweened.
//   P(s) = lerp(P0, P1, s) + A_arc * sin(pi * s)
//   T(s) = lerp(T0, T1, s)
// GSAP only animates s (with the dolly ease); this single frame loop does the rest.
export function CameraRig() {
  const { camera, size } = useThree();
  const v = useMemo(() => ({ p: new Vector3(), t: new Vector3(), dir: new Vector3(), sway: new Vector3(), pointer: { x: 0, y: 0 } }), []);

  useEffect(() => {
    const aspect = size.width / size.height;
    setViewport(aspect, camera.fov);
    const singlePage = aspect < 1;
    const st = useStore.getState();
    if (singlePage !== st.singlePage) {
      useStore.setState({ singlePage, pageSide: "right" });
    }
    director.refresh();
  }, [size.width, size.height, camera]);

  useEffect(() => {
    const onMove = (e) => {
      v.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      v.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [v]);

  useFrame((_, delta) => {
    const c = motion.camera;
    const s = c.s;
    v.p.lerpVectors(c.from.p, c.to.p, s).addScaledVector(c.arc, Math.sin(Math.PI * s));
    v.t.lerpVectors(c.from.t, c.to.t, s);
    c.current.p.copy(v.p);
    c.current.t.copy(v.t);

    // transient offsets: jump pull-back, pinch zoom, gentle parallax on the shelf
    v.dir.subVectors(v.p, v.t);
    const { phase, reducedMotion } = useStore.getState();
    const reading = phase === PHASE.READING || phase === PHASE.DIRECT_JUMP;
    const zoom = (reading ? c.pinch : 1) * (1 + c.zoomOut * 0.22) * (1 + motion.intro * 0.07);
    v.p.copy(v.t).addScaledVector(v.dir, zoom);
    const onShelf = phase === PHASE.SHELF_AMBIENT || phase === PHASE.BOOK_HOVER;
    const swayTarget = onShelf && !reducedMotion ? 1 : 0;
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 2.5);
    v.sway.x += (v.pointer.x * 0.28 * swayTarget - v.sway.x) * k;
    v.sway.y += (-v.pointer.y * 0.16 * swayTarget - v.sway.y) * k;
    v.p.x += v.sway.x;
    v.p.y += v.sway.y;
    if (!reading && c.pinch !== 1) c.pinch += (1 - c.pinch) * k;

    camera.position.copy(v.p);
    camera.lookAt(v.t);
  });

  return null;
}
