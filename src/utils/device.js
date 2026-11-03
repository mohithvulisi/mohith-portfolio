// Capability probes and the initial quality tier. Everything here is read once.

export const hasWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};

export const isCoarsePointer = () => window.matchMedia?.("(pointer: coarse)").matches ?? false;

export const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export const isMobile = () => isCoarsePointer() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Resting resolution. The page textures carry the fine detail, so the canvas
// itself does not need the full retina density to look crisp.
export const maxDpr = () => Math.min(window.devicePixelRatio || 1, isMobile() ? 1.5 : 1.75);

// "high" | "medium" | "low": decides page texture size, dust and baked shadows.
// Chosen once at load; frame-rate dips only lower the canvas resolution.
export const initialQuality = () => {
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = navigator.deviceMemory ?? 4;
  if (cores <= 4 || memory <= 2) return "low";
  if (isMobile() || cores <= 6 || memory <= 4) return "medium";
  return "high";
};

export const QUALITY_ORDER = ["low", "medium", "high"];

export const qualitySettings = (tier) =>
  ({
    high: { pageTexture: 1536, dust: 700, shadows: true },
    medium: { pageTexture: 1280, dust: 450, shadows: true },
    low: { pageTexture: 1024, dust: 200, shadows: false }
  })[tier];

export const storage = {
  get(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode: preferences simply do not persist */
    }
  }
};
