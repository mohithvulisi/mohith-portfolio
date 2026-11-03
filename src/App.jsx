import { Suspense, useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { AgXToneMapping } from "three";
import { useStore } from "./store/useStore";
import { Scene } from "./scene/Scene";
import { director } from "./scene/director";
import { Overlay } from "./ui/Overlay";
import { Cursor } from "./ui/Cursor";
import { PlainVersion } from "./ui/PlainVersion";
import { preloadAssets } from "./textures/TextureManager";
import { unlockAudio } from "./audio/sfx";
import { hasWebGL, maxDpr } from "./utils/device";

const useKeyboard = () => {
  useEffect(() => {
    const onKey = (e) => {
      const st = useStore.getState();
      if (st.plain) return;
      if (e.key === "Escape") {
        if (st.detail) return useStore.setState({ detail: null });
        if (st.help) return useStore.setState({ help: false });
        return director.escape();
      }
      if (st.detail || st.help) return;
      const onButton = e.target instanceof HTMLElement && e.target.closest("button, a, input");
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        director.next();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        director.prev();
      } else if ((e.key === "Enter" || e.key === " ") && !onButton) {
        e.preventDefault();
        unlockAudio();
        director.primary();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
};

const useReducedMotion = () => {
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const update = () => useStore.setState({ reducedMotion: query.matches });
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
};

export default function App() {
  const webgl = useMemo(hasWebGL, []);
  const plain = useStore((s) => s.plain);

  useKeyboard();
  useReducedMotion();

  useEffect(() => {
    if (!webgl) return;
    preloadAssets((progress) => useStore.setState({ loadProgress: progress })).then(() => useStore.setState({ ready: true }));
  }, [webgl]);

  // the opening shot plays once the room is captured and the loader lifts
  const sceneReady = useStore((s) => s.sceneReady);
  useEffect(() => {
    if (sceneReady) director.intro();
  }, [sceneReady]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  if (!webgl) return <PlainVersion canReturn={false} />;

  return (
    <>
      <div className="stage" aria-hidden={plain}>
        <Canvas
          shadows
          dpr={maxDpr()}
          frameloop={plain ? "never" : "always"}
          camera={{ fov: 38, near: 0.05, far: 80, position: [4.2, 1.8, 7.5] }}
          gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
          onCreated={({ gl }) => {
            gl.toneMapping = AgXToneMapping;
            gl.toneMappingExposure = 1.05;
            gl.shadowMap.autoUpdate = false; // shadows are baked into the room captures
          }}
          aria-label="A 3D library shelf holding the portfolio volume"
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>
      {!plain && <Overlay />}
      {!plain && <Cursor />}
      {plain && <PlainVersion canReturn />}
    </>
  );
}
