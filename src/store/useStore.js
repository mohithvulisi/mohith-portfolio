import { create } from "zustand";
import { Quaternion, Vector3 } from "three";
import { portfolio } from "../content/portfolio";
import { buildBook } from "../content/layout";
import { initialQuality, prefersReducedMotion, storage } from "../utils/device";

export const book = buildBook(portfolio);

// ── finite state machine ────────────────────────────────────────────────────
// Every phase lists the events it accepts. Anything else is ignored, so a
// double click during a camera move can never skip or corrupt a transition.

export const PHASE = {
  SHELF_AMBIENT: "SHELF_AMBIENT",
  BOOK_HOVER: "BOOK_HOVER",
  CAMERA_DOLLY: "CAMERA_DOLLY",
  COVER_INSPECT: "COVER_INSPECT",
  BOOK_OPEN: "BOOK_OPEN",
  READING: "READING",
  DIRECT_JUMP: "DIRECT_JUMP",
  BOOK_CLOSE: "BOOK_CLOSE",
  RETURN_TO_SHELF: "RETURN_TO_SHELF"
};

const TRANSITIONS = {
  SHELF_AMBIENT: { HOVER_ON: PHASE.BOOK_HOVER, SELECT: PHASE.CAMERA_DOLLY },
  BOOK_HOVER: { HOVER_OFF: PHASE.SHELF_AMBIENT, SELECT: PHASE.CAMERA_DOLLY },
  CAMERA_DOLLY: { DOLLY_IN_DONE: PHASE.COVER_INSPECT, DOLLY_OUT_DONE: PHASE.SHELF_AMBIENT },
  COVER_INSPECT: { OPEN: PHASE.BOOK_OPEN, ESCAPE: PHASE.CAMERA_DOLLY },
  BOOK_OPEN: { OPEN_DONE: PHASE.READING, SHUT_DONE: PHASE.COVER_INSPECT },
  READING: { JUMP: PHASE.DIRECT_JUMP, CLOSE: PHASE.BOOK_CLOSE, ESCAPE: PHASE.BOOK_OPEN },
  DIRECT_JUMP: { JUMP_DONE: PHASE.READING },
  BOOK_CLOSE: { CLOSE_DONE: PHASE.BOOK_CLOSE, REOPEN: PHASE.READING, RETURN: PHASE.RETURN_TO_SHELF },
  RETURN_TO_SHELF: { RETURN_DONE: PHASE.SHELF_AMBIENT }
};

export const canDispatch = (phase, event) => Boolean(TRANSITIONS[phase]?.[event]);

export const useStore = create((set, get) => ({
  phase: PHASE.SHELF_AMBIENT,
  lastEvent: null,
  busy: false, // a timeline is running; reading input is held until it lands

  spread: 1, // 1-based spread on display while the book is open
  pageSide: "right", // single-page mode: which half of the spread is centred
  singlePage: typeof window !== "undefined" ? window.innerWidth / window.innerHeight < 1 : false,

  ready: false, // fonts and photos loaded: the volume can be built
  sceneReady: false, // room captured, shaders warm, first pages uploaded: lift the loader
  loadProgress: 0,
  muted: storage.get("dc.muted", false),
  quality: initialQuality(),
  reducedMotion: typeof window !== "undefined" ? prefersReducedMotion() : false,

  plain: false,
  help: false,
  detail: null, // { type, item, year } for the project / card overlay
  hintSeen: storage.get("dc.hintSeen", false),
  hoveredHit: null, // { key, pageIndex, rect } under the pointer
  focusedHit: null, // same shape, for keyboard focus
  cursor: "default", // custom cursor mode
  toast: null, // short status line, e.g. after tapping a certificate

  dispatch: (event, patch = {}) => {
    const { phase } = get();
    const next = TRANSITIONS[phase]?.[event];
    if (!next) return false;
    set({ phase: next, lastEvent: event, ...patch });
    return true;
  },

  set: (patch) => set(patch),
  toggleMute: () =>
    set((s) => {
      storage.set("dc.muted", !s.muted);
      return { muted: !s.muted };
    }),
  markHintSeen: () => {
    storage.set("dc.hintSeen", true);
    set({ hintSeen: true });
  }
}));

// ── animated values ─────────────────────────────────────────────────────────
// GSAP tweens these plain numbers; useFrame reads them. Nothing here triggers
// a React render, and the frame loop never allocates.

const pose = (position, target) => ({ p: new Vector3(...position), t: new Vector3(...target) });
const bookPose = () => ({ position: new Vector3(), quaternion: new Quaternion() });

// On the shelf both paths rest at s = 0 of the dolly (from = shelf, to = inspect),
// so the dolly and its reverse are one curve travelled in either direction.
export const motion = {
  camera: {
    from: pose([4.2, 1.8, 7.5], [1.1, 0.9, 0]),
    to: pose([0, 0, 3.8], [0, 0, 0]),
    arc: new Vector3(-0.8, 0.4, 1.2),
    s: 0,
    zoomOut: 0, // extra pull-back used by direct jumps
    pinch: 1, // user zoom while reading (clamped)
    current: pose([4.2, 1.8, 7.5], [1.1, 0.9, 0])
  },
  book: {
    from: bookPose(),
    to: bookPose(),
    current: bookPose(),
    arc: new Vector3(),
    rotWindow: [0, 1], // slice of s over which the rotation happens
    fromShelf: true, // hover slide-out only applies on the shelf leg
    s: 0
  },
  hoverSlide: 0,
  glow: 0, // multiplier on the emissive pulse; ignites after loading, dims once the book is in hand
  frontCover: 0, // 0 = closed over the pages, 1 = open on the right
  backCover: 0, // 0 = lying under the left stack, 1 = swung shut on top
  leaves: Array.from({ length: book.leafCount }, () => ({ progress: 0, bend: 0 })),
  // The room is rendered once into a texture per context and reprojected.
  // live = 1 renders it for real (only while the camera flies).
  room: { live: 0, context: "shelf", blur: 0, dim: 1 },
  lamp: 0, // reading light, 0..1
  glint: -1, // position of the light sweep across the cover foil
  intro: 1, // 1 = pulled back before the opening push-in
  highlight: 0 // eased hover-highlight strength on the page under the pointer
};

// DOM nodes of the accessible hit-region buttons, positioned every frame.
export const hitElements = new Map();

if (import.meta.env.DEV) window.__chronicles = { useStore, motion, book };
