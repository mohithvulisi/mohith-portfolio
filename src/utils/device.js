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
export const maxDpr = () => Math.min(window.devicePixelRatio || 1, 2);

// "high" | "medium" | "low": decides page texture size, dust and baked shadows.
// Chosen once at load; frame-rate dips only lower the canvas resolution.
export const initialQuality = () => {
  if (isMobile()) return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores <= 2) return "low";
  return "high";
};

export const QUALITY_ORDER = ["low", "medium", "high"];

export const qualitySettings = (tier) =>
  ({
    high: { pageTexture: 2048, dust: 700, shadows: true },
    medium: { pageTexture: 2048, dust: 450, shadows: true },
    low: { pageTexture: 1536, dust: 200, shadows: false }
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
