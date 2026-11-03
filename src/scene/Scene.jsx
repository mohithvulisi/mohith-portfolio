import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { motion, useStore } from "../store/useStore";
import { Bookshelf } from "./Bookshelf";
import { HeroBook } from "./HeroBook";
import { CameraRig } from "./CameraRig";
import { Effects } from "./Effects";

// A spot light's target is not in the scene graph, so aim it once by hand.
// Shadow maps only update when the room is captured, so they can be generous.
const AimedSpot = ({ aim, shadowSize, ...props }) => {
  const light = useRef();
  useLayoutEffect(() => {
    const spot = light.current;
    spot.target.position.set(...aim);
    spot.target.updateMatrixWorld();
    spot.shadow.mapSize.set(shadowSize, shadowSize);
    spot.shadow.bias = -0.0003;
    spot.shadow.normalBias = 0.02;
    spot.shadow.radius = 6;
    spot.shadow.camera.near = 4;
    spot.shadow.camera.far = 30;
  }, [aim, shadowSize]);
  return <spotLight ref={light} decay={2} castShadow {...props} />;
};

const KEY_AIM = [0.5, 0.2, -1];
const SHAFT_AIM = [1.4, -2.2, -1.2];

// Warm key, cool sky fill and the window shaft; the reading lamp rises once
// the book is in hand. The light count never changes, so shaders never recompile.
const Lights = () => {
  const reading = useRef();
  const shadows = useStore((s) => s.quality) !== "low";
  useFrame(() => {
    if (reading.current) reading.current.intensity = 0.2 + motion.lamp * 2.9;
  });
  return (
    <>
      <hemisphereLight args={["#40597c", "#1c130d", 0.6]} />
      <AimedSpot position={[6, 7, 7]} aim={KEY_AIM} angle={0.55} penumbra={0.9} intensity={230} color="#ffb877" castShadow={shadows} shadowSize={2048} />
      <AimedSpot position={[-6.5, 9.5, 5.5]} aim={SHAFT_AIM} angle={0.2} penumbra={0.7} intensity={280} color="#ffd29a" castShadow={shadows} shadowSize={1024} />
      <directionalLight ref={reading} position={[1.2, 3.2, 6]} intensity={0.2} color="#fff7ec" />
    </>
  );
};

const Room = () => {
  const quality = useStore((s) => s.quality);
  return (
    <>
      <color attach="background" args={["#0c0907"]} />
      <fog attach="fog" args={["#0c0907", 10, 28]} />
      <Environment resolution={quality === "low" ? 64 : 128} frames={1} environmentIntensity={0.45}>
        <Lightformer form="rect" intensity={3} color="#ffcf9a" position={[0, 5, 4]} scale={[8, 2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#7fa6d6" position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} />
        <Lightformer form="ring" intensity={2} color="#ffe2b8" position={[4, 2, 5]} scale={2} />
      </Environment>
    </>
  );
};

const DevHandle = () => {
  const state = useThree();
  useEffect(() => {
    if (import.meta.env.DEV) window.__r3f = state;
  }, [state]);
  return null;
};

// Sustained frame-rate changes move the resting resolution (handled in Effects).
const declined = () => window.dispatchEvent(new Event("chronicles:perf-decline"));
const inclined = () => window.dispatchEvent(new Event("chronicles:perf-incline"));

export function Scene() {
  const ready = useStore((s) => s.ready);
  return (
    <>
      <PerformanceMonitor onDecline={declined} onIncline={inclined} flipflops={Infinity} bounds={() => [45, 58]} />
      <DevHandle />
      <Room />
      <Lights />
      <CameraRig />
      <Bookshelf />
      {ready && <HeroBook />}
      <Effects />
    </>
  );
}
