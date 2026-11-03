// Every timeline in the experience lives here. The FSM in useStore decides
// whether a transition is legal; the director animates it and reports back.

import gsap from "gsap";
import { Euler, MathUtils, Quaternion, Vector3 } from "three";
import { book, motion, PHASE, useStore } from "../store/useStore";
import { leafBackPage, leafFrontPage } from "../content/layout";
import { sfx } from "../audio/sfx";
import { BOOK, SHELF } from "./metrics";

// ── easing ──────────────────────────────────────────────────────────────────

export const cubicBezier = (x1, y1, x2, y2) => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x) => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i += 1) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
};

const DOLLY_EASE = cubicBezier(0.16, 1, 0.3, 1);
// Travels the same curve backwards in time: s(t) = ease(1 - t).
const reversed = (ease) => (t) => 1 - ease(1 - t);

const reduced = () => useStore.getState().reducedMotion;
const ease = (name) => (reduced() ? "none" : name);
const dur = (seconds) => (reduced() ? Math.min(seconds, 0.6) * 0.6 : seconds);

// ── poses ───────────────────────────────────────────────────────────────────

const quat = (x, y, z) => new Quaternion().setFromEuler(new Euler(x, y, z));

export const BOOK_POSES = {
  shelf: {
    position: new Vector3(SHELF.heroSlot[0], SHELF.heroSlot[1], SHELF.front - 0.03 - BOOK.coverW / 2 - BOOK.spineT),
    quaternion: quat(0, -Math.PI / 2, 0)
  },
  // a touch high and back, leaving room under the cover for the prompt
  inspect: { position: new Vector3(0, 0.13, -0.42), quaternion: quat(0.05, -0.26, 0.02) },
  reading: { position: new Vector3(0, -0.02, 0), quaternion: quat(-0.1, 0, 0) },
  back: { position: new Vector3(0, 0.13, -0.42), quaternion: quat(0.05, 0.26, -0.02) }
};

export const SHELF_SLIDE = 0.4; // 3.5 cm at tankobon scale
const DOLLY_ARC = new Vector3(-0.8, 0.4, 1.2);
const BOOK_FLIGHT_ARC = new Vector3(0, 0.22, 1.05);
const P0 = new Vector3(4.2, 1.8, 7.5);
const T0 = new Vector3(1.1, 0.9, 0);

const viewport = { aspect: 16 / 9, fov: 38 };
export const setViewport = (aspect, fov) => {
  viewport.aspect = aspect;
  viewport.fov = fov;
};

const fitDistance = (width, height) => {
  const t = Math.tan(MathUtils.degToRad(viewport.fov) / 2);
  return Math.max(height / 2 / t, width / 2 / (t * viewport.aspect));
};

const CAMERA_POSES = {
  shelf: (out) => {
    const k = viewport.aspect < 1 ? 1.22 : 1;
    out.p.copy(P0).sub(T0).multiplyScalar(k).add(T0);
    out.t.copy(T0);
  },
  inspect: (out) => {
    out.p.set(0, 0, Math.max(3.8, fitDistance(BOOK.coverW * 1.45, BOOK.coverH * 1.3)));
    out.t.set(0, 0, 0);
  },
  reading: (out, options = {}) => {
    const state = useStore.getState();
    const singlePage = options.singlePage ?? state.singlePage;
    const pageSide = options.pageSide ?? state.pageSide;
    // room below the spread for the pager
    const width = singlePage ? BOOK.pageW * 1.1 : (BOOK.pageW * 2 + 0.06) * 1.08;
    const d = fitDistance(width, BOOK.pageH * 1.3);
    const x = singlePage ? (pageSide === "right" ? 1 : -1) * BOOK.pageW * 0.5 : 0;
    out.p.set(x, d * 0.1 - 0.1, d);
    out.t.set(x, -0.13, 0);
  },
  back: (out) => CAMERA_POSES.inspect(out)
};

// Also used by the render pipeline to fit its room captures.
export const cameraPose = (name, out, options) => CAMERA_POSES[name](out, options);

const scratchPose = { p: new Vector3(), t: new Vector3() };

// ── primitive tweens ────────────────────────────────────────────────────────

// Re-roots the camera path at wherever the camera is now, then heads to `pose`.
const prepareCamera = (pose, arc) => {
  const c = motion.camera;
  c.from.p.copy(c.current.p);
  c.from.t.copy(c.current.t);
  CAMERA_POSES[pose](scratchPose);
  c.to.p.copy(scratchPose.p);
  c.to.t.copy(scratchPose.t);
  c.arc.copy(arc ?? new Vector3());
  c.s = 0;
};

const prepareBook = (pose) => {
  const b = motion.book;
  b.from.position.copy(b.current.position);
  b.from.quaternion.copy(b.current.quaternion);
  b.to.position.copy(BOOK_POSES[pose].position);
  b.to.quaternion.copy(BOOK_POSES[pose].quaternion);
  b.arc.set(0, 0, 0);
  b.rotWindow = [0, 1];
  b.fromShelf = false;
  b.s = 0;
};

// Lays both paths on the shelf ↔ inspect dolly curve without moving anything.
const prepareDolly = () => {
  const c = motion.camera;
  CAMERA_POSES.shelf(scratchPose);
  c.from.p.copy(scratchPose.p);
  c.from.t.copy(scratchPose.t);
  CAMERA_POSES.inspect(scratchPose);
  c.to.p.copy(scratchPose.p);
  c.to.t.copy(scratchPose.t);
  c.arc.copy(reduced() ? new Vector3() : DOLLY_ARC);
  const b = motion.book;
  b.from.position.copy(BOOK_POSES.shelf.position);
  b.from.quaternion.copy(BOOK_POSES.shelf.quaternion);
  b.to.position.copy(BOOK_POSES.inspect.position);
  b.to.quaternion.copy(BOOK_POSES.inspect.quaternion);
  b.arc.copy(reduced() ? new Vector3() : BOOK_FLIGHT_ARC);
  b.rotWindow = [0.3, 0.95]; // clear the neighbours before turning
  b.fromShelf = true;
};

const moveTo = (tl, at, { camera, book: bookPose, duration, easing = "power2.inOut", arc }) => {
  if (camera) {
    tl.call(() => prepareCamera(camera, arc), null, at);
    tl.to(motion.camera, { s: 1, duration: dur(duration), ease: ease(easing) }, at);
  }
  if (bookPose) {
    tl.call(() => prepareBook(bookPose), null, at);
    tl.to(motion.book, { s: 1, duration: dur(duration), ease: ease(easing) }, at);
  }
};

const BEND = 1.15;
const bendFor = (leaf) => () => {
  leaf.bend = reduced() ? 0 : BEND * Math.sin(2 * Math.PI * leaf.progress);
};

// Waterfall of leaves with log-staggered starts: t(k) = T ln(k+1) / ln(N+1).
const waterfall = (tl, at, fromSpread, toSpread, { total = 0.85, perLeaf = 0.5 } = {}) => {
  const forward = toSpread > fromSpread;
  const indices = [];
  if (forward) for (let j = fromSpread - 1; j <= toSpread - 2; j += 1) indices.push(j);
  else for (let j = fromSpread - 2; j >= toSpread - 1; j -= 1) indices.push(j);
  const n = indices.length;
  if (!n) return 0;
  indices.forEach((j, k) => {
    const leaf = motion.leaves[j];
    const offset = reduced() ? 0 : (total * Math.log(k + 1)) / Math.log(n + 1);
    tl.to(leaf, { progress: forward ? 1 : 0, duration: dur(perLeaf), ease: ease("power2.inOut"), onUpdate: bendFor(leaf) }, at + offset);
    tl.call(() => sfx.pageTurn(0.85, 0, forward ? 1 : -1), null, at + offset);
  });
  return (reduced() ? 0 : total * Math.log(n) / Math.log(n + 1)) + dur(perLeaf);
};

let veil = null;
export const registerVeil = (el) => {
  veil = el;
};
const fadeVeil = () => {
  if (veil) gsap.fromTo(veil, { opacity: 0.85 }, { opacity: 0, duration: 0.32, ease: "power1.out" });
};

let textures = null;
export const attachTextures = (manager) => {
  textures = manager;
  if (import.meta.env.DEV) window.__textures = manager;
};

const store = () => useStore.getState();

const runBusy = (tl, onDone) => {
  store().set({ busy: true });
  tl.eventCallback("onComplete", () => {
    store().set({ busy: false });
    onDone?.();
  });
  return tl;
};

// ── shelf & dolly ───────────────────────────────────────────────────────────

const hoverOn = () => {
  if (!store().dispatch("HOVER_ON")) return;
  sfx.slide();
  gsap.to(motion, { hoverSlide: 1, duration: dur(0.45), ease: "power3.out", overwrite: "auto" });
};

const hoverOff = () => {
  if (!store().dispatch("HOVER_OFF")) return;
  gsap.to(motion, { hoverSlide: 0, duration: dur(0.5), ease: "power2.inOut", overwrite: "auto" });
};

// Arriving in front of the shelf: swap the live room for the near capture (same
// pixels), then pull focus onto the book and sweep a light across the foil.
const arriveNear = () => {
  Object.assign(motion.room, { context: "near", live: 0, blur: 0 });
  gsap.to(motion.room, { blur: 1, dim: 0.9, duration: reduced() ? 0.2 : 0.9, ease: "power2.inOut" });
  if (!reduced()) gsap.fromTo(motion, { glint: -0.35 }, { glint: 1.35, duration: 1.6, ease: "power2.inOut", delay: 0.2 });
};

const select = () => {
  if (!store().dispatch("SELECT")) return;
  store().markHintSeen();
  prepareDolly();
  sfx.slide();
  sfx.whoosh();
  const tl = gsap.timeline();
  tl.set(motion.room, { live: 1 }, 0);
  tl.to(motion, { hoverSlide: 1, duration: 0.25, ease: "power2.out", overwrite: "auto" }, 0);
  tl.fromTo(motion.camera, { s: 0 }, { s: 1, duration: dur(2.1), ease: reduced() ? "none" : DOLLY_EASE, immediateRender: false }, 0.12);
  tl.fromTo(motion.book, { s: 0 }, { s: 1, duration: dur(2.1), ease: reduced() ? "none" : DOLLY_EASE, immediateRender: false }, 0.12);
  tl.to(motion, { glow: 0.25, lamp: 0.45, duration: dur(1.4), ease: "power2.out" }, 0.12);
  runBusy(tl, () => {
    arriveNear();
    store().dispatch("DOLLY_IN_DONE");
  });
};

// Focus racks back to the room, then the room goes live for the flight home.
const dollyOut = (tl, at) => {
  tl.to(motion.room, { blur: 0, dim: 1, duration: 0.3, ease: "power1.out" }, at);
  tl.set(motion.room, { live: 1 }, at + 0.3);
  tl.call(prepareDolly, null, at);
  tl.fromTo(motion.camera, { s: 1 }, { s: 0, duration: dur(2.1), ease: reduced() ? "none" : reversed(DOLLY_EASE), immediateRender: false }, at);
  tl.fromTo(motion.book, { s: 1 }, { s: 0, duration: dur(2.1), ease: reduced() ? "none" : reversed(DOLLY_EASE), immediateRender: false }, at);
  tl.to(motion, { glow: 1, lamp: 0, duration: dur(1.6), ease: "power2.inOut" }, at + 0.3);
  tl.call(() => sfx.whoosh(true), null, at);
  tl.call(() => Object.assign(motion.room, { context: "shelf", live: 0, blur: 0, dim: 1 }), null, at + dur(2.1));
  tl.to(motion, { hoverSlide: 0, duration: dur(0.45), ease: "power2.inOut" }, at + dur(2.1));
  tl.call(() => sfx.slide(), null, at + dur(2.1));
  return dur(2.1) + dur(0.45);
};

// The opening shot: a slow push-in while the spine's glow ignites.
const intro = () => {
  if (reduced()) {
    motion.intro = 0;
    motion.glow = 1;
    return;
  }
  gsap.to(motion, { intro: 0, duration: 3, ease: "power2.out" });
  gsap.to(motion, { glow: 1, duration: 1.8, ease: "power2.inOut", delay: 0.6 });
};

// ── opening & closing ───────────────────────────────────────────────────────

const open = () => {
  if (!store().dispatch("OPEN")) return;
  textures?.renderNow(0);
  textures?.renderNow(1);
  textures?.setWindow(1);
  sfx.coverOpen();
  store().set({ spread: 1, pageSide: "right" });
  const tl = gsap.timeline();
  tl.to(motion, { frontCover: 1, duration: dur(1.35), ease: ease("power2.inOut") }, 0);
  tl.to(motion.room, { dim: 0.68, duration: dur(1.6), ease: "power2.inOut" }, 0);
  tl.to(motion, { lamp: 1, duration: dur(1.6), ease: "power2.inOut" }, 0);
  moveTo(tl, 0, { book: "reading", duration: 1.35 });
  moveTo(tl, 0.05, { camera: "reading", duration: 1.45 });
  runBusy(tl, () => store().dispatch("OPEN_DONE"));
};

const shutToInspect = () => {
  const { spread } = store();
  if (!store().dispatch("ESCAPE")) return;
  const tl = gsap.timeline();
  const waterfallTime = waterfall(tl, 0, spread, 1, { total: 0.6, perLeaf: 0.45 });
  textures?.setWindow(1);
  const at = waterfallTime + (waterfallTime ? 0.05 : 0);
  tl.call(() => sfx.coverClose(), null, at + 0.25);
  tl.to(motion, { frontCover: 0, duration: dur(1.1), ease: ease("power2.inOut") }, at);
  tl.to(motion.room, { dim: 0.9, duration: dur(1.1), ease: "power2.inOut" }, at);
  tl.to(motion, { lamp: 0.45, duration: dur(1.1), ease: "power2.inOut" }, at);
  moveTo(tl, at, { book: "inspect", camera: "inspect", duration: 1.2 });
  runBusy(tl, () => {
    store().set({ spread: 1, pageSide: "right" });
    store().dispatch("SHUT_DONE");
  });
};

const closeBack = () => {
  if (!store().dispatch("CLOSE")) return;
  const tl = gsap.timeline();
  tl.call(() => sfx.coverClose(), null, 0.55);
  tl.to(motion, { backCover: 1, duration: dur(1.2), ease: ease("power2.inOut") }, 0);
  tl.to(motion.room, { dim: 0.84, duration: dur(1.3), ease: "power2.inOut" }, 0);
  tl.to(motion, { lamp: 0.6, duration: dur(1.3), ease: "power2.inOut" }, 0);
  moveTo(tl, 0, { book: "back", camera: "back", duration: 1.35 });
  runBusy(tl, () => store().dispatch("CLOSE_DONE"));
};

const reopen = () => {
  if (!store().dispatch("REOPEN")) return;
  const tl = gsap.timeline();
  sfx.coverOpen();
  store().set({ pageSide: store().singlePage ? "left" : "right" });
  tl.to(motion, { backCover: 0, duration: dur(1.1), ease: ease("power2.inOut") }, 0);
  tl.to(motion.room, { dim: 0.68, duration: dur(1.2), ease: "power2.inOut" }, 0);
  tl.to(motion, { lamp: 1, duration: dur(1.2), ease: "power2.inOut" }, 0);
  moveTo(tl, 0, { book: "reading", camera: "reading", duration: 1.2 });
  runBusy(tl);
};

// Plays the whole visit backwards: back cover, every leaf, front cover, dolly.
const returnToShelf = () => {
  const { spread } = store();
  if (!store().dispatch("RETURN")) return;
  const tl = gsap.timeline();
  tl.to(motion, { backCover: 0, duration: dur(0.8), ease: ease("power2.inOut") }, 0);
  moveTo(tl, 0, { book: "reading", camera: "reading", duration: 0.85 });
  const leavesAt = dur(0.75);
  const pages = [];
  for (let j = 0; j < book.leafCount; j += 1) pages.push(leafFrontPage(j), leafBackPage(j));
  textures?.prepareSketches(pages);
  const waterfallTime = waterfall(tl, leavesAt, spread, 1, { total: 0.85, perLeaf: 0.42 });
  const coverAt = leavesAt + waterfallTime;
  tl.call(() => sfx.coverClose(), null, coverAt + 0.3);
  tl.to(motion, { frontCover: 0, duration: dur(0.95), ease: ease("power2.inOut") }, coverAt);
  tl.to(motion.room, { dim: 0.9, duration: dur(0.95), ease: "power2.inOut" }, coverAt);
  moveTo(tl, coverAt, { book: "inspect", camera: "inspect", duration: 1.0 });
  const dollyAt = coverAt + dur(1.05);
  dollyOut(tl, dollyAt);
  runBusy(tl, () => {
    textures?.releaseSketches();
    textures?.setWindow(1);
    store().set({ spread: 1, pageSide: "right" });
    store().dispatch("RETURN_DONE");
  });
};

const backToShelf = () => {
  if (!store().dispatch("ESCAPE")) return;
  const tl = gsap.timeline();
  dollyOut(tl, 0);
  runBusy(tl, () => store().dispatch("DOLLY_OUT_DONE"));
};

// ── reading ─────────────────────────────────────────────────────────────────

const panCamera = () => {
  const tl = gsap.timeline();
  moveTo(tl, 0, { camera: "reading", duration: 0.55 });
};

export const flipLeaf = (index, target, { duration = 0.62, speed = 0.5 } = {}) => {
  const leaf = motion.leaves[index];
  if (!leaf) return;
  if (peeled?.index === index) peeled = null;
  settlePeel();
  if (reduced()) {
    gsap.killTweensOf(leaf);
    leaf.progress = target;
    leaf.bend = 0;
    fadeVeil();
    sfx.pageTurn(0.2, 0, target === 1 ? 1 : -1);
    return;
  }
  sfx.pageTurn(speed, 0, target === 1 ? 1 : -1);
  gsap.to(leaf, { progress: target, duration, ease: "power2.inOut", overwrite: true, onUpdate: bendFor(leaf) });
};

// Hovering near a page's free edge lifts its corner, inviting a drag.
let peeled = null; // { index, rest }

export const peel = (side) => {
  const { phase, spread, reducedMotion } = store();
  if (phase !== PHASE.READING || reducedMotion) return;
  const index = side === "left" ? spread - 1 : spread - 2;
  const leaf = motion.leaves[index];
  if (!leaf || peeled?.index === index) return;
  settlePeel();
  const rest = side === "left" ? 0 : 1;
  if (Math.abs(leaf.progress - rest) > 0.001 || gsap.isTweening(leaf)) return;
  const direction = side === "left" ? 1 : -1;
  peeled = { index, rest };
  sfx.hover();
  gsap.to(leaf, { progress: rest + direction * 0.05, bend: direction * 0.6, duration: 0.45, ease: "power3.out", overwrite: true });
};

export const settlePeel = () => {
  if (!peeled) return;
  const leaf = motion.leaves[peeled.index];
  const { rest } = peeled;
  peeled = null;
  if (Math.abs(leaf.progress - rest) < 0.08) gsap.to(leaf, { progress: rest, bend: 0, duration: 0.35, ease: "power2.inOut", overwrite: true });
};

const goToSpread = (spread, side) => {
  store().set({ spread, pageSide: side });
  textures?.setWindow(spread);
};

const next = () => {
  const { phase, spread, singlePage, pageSide } = store();
  if (phase === PHASE.COVER_INSPECT) return open();
  if (phase !== PHASE.READING) return;
  settlePeel();
  if (singlePage && pageSide === "right") {
    store().set({ pageSide: "left" });
    sfx.tick();
    return panCamera();
  }
  if (spread >= book.spreadCount) return closeBack();
  flipLeaf(spread - 1, 1);
  goToSpread(spread + 1, "right");
  if (singlePage) panCamera();
};

const prev = () => {
  const { phase, spread, singlePage, pageSide } = store();
  if (phase === PHASE.BOOK_CLOSE) return reopen();
  if (phase !== PHASE.READING) return;
  settlePeel();
  if (singlePage && pageSide === "left") {
    store().set({ pageSide: "right" });
    sfx.tick();
    return panCamera();
  }
  if (spread <= 1) return;
  flipLeaf(spread - 2, 0);
  goToSpread(spread - 1, singlePage ? "left" : "right");
  if (singlePage) panCamera();
};

const jump = (target) => {
  const { phase, spread, singlePage } = store();
  if (phase !== PHASE.READING) return;
  const clamped = MathUtils.clamp(target, 1, book.spreadCount);
  if (clamped === spread) {
    if (singlePage && store().pageSide !== "right") {
      store().set({ pageSide: "right" });
      panCamera();
    }
    return;
  }
  if (!store().dispatch("JUMP")) return;
  settlePeel();
  const pages = [];
  const lo = Math.min(spread, clamped);
  const hi = Math.max(spread, clamped);
  for (let s = lo; s <= hi; s += 1) pages.push(2 * (s - 1), 2 * (s - 1) + 1);
  textures?.prepareSketches(pages);
  goToSpread(clamped, "right");
  const tl = gsap.timeline();
  const time = waterfall(tl, 0, spread, clamped, { total: 0.85, perLeaf: 0.5 });
  if (!reduced()) {
    tl.to(motion.camera, { zoomOut: 1, duration: time * 0.45, ease: "power2.out" }, 0);
    tl.to(motion.camera, { zoomOut: 0, duration: time * 0.55, ease: "power2.inOut" }, time * 0.45);
  }
  if (singlePage) moveTo(tl, 0, { camera: "reading", duration: time });
  runBusy(tl, () => {
    textures?.releaseSketches();
    store().dispatch("JUMP_DONE");
  });
};

// ── dragging a leaf by its free edge ────────────────────────────────────────

export const beginDrag = (side) => {
  const { phase, spread } = store();
  if (phase !== PHASE.READING) return null;
  const index = side === "left" ? spread - 1 : spread - 2;
  if (index < 0 || index >= book.leafCount) return null;
  const leaf = motion.leaves[index];
  if (peeled?.index === index) peeled = null; // the lifted corner is now in hand
  settlePeel();
  gsap.killTweensOf(leaf);
  return { index, direction: side === "left" ? 1 : -1, start: leaf.progress };
};

export const dragTo = (drag, progress) => {
  const leaf = motion.leaves[drag.index];
  leaf.progress = MathUtils.clamp(progress, 0, 1);
  leaf.bend = reduced() ? 0 : drag.direction * 0.85 * Math.sin(Math.PI * leaf.progress);
};

export const endDrag = (drag, velocity) => {
  const leaf = motion.leaves[drag.index];
  const { spread, singlePage } = store();
  const forward = drag.direction > 0;
  const commit = forward ? leaf.progress > 0.5 || velocity > 0.9 : leaf.progress < 0.5 || velocity < -0.9;
  const target = forward === commit ? 1 : 0;
  const remaining = Math.abs(target - leaf.progress);
  gsap.to(leaf, {
    progress: target,
    duration: 0.18 + remaining * 0.45,
    ease: "power2.out",
    overwrite: true,
    onUpdate: () => {
      leaf.bend *= 0.86;
    }
  });
  if (!commit) return;
  sfx.pageTurn(MathUtils.clamp(Math.abs(velocity) / 2, 0.2, 1), 0, drag.direction);
  if (forward) goToSpread(spread + 1, "right");
  else goToSpread(spread - 1, singlePage ? "left" : "right");
  if (singlePage) panCamera();
};

// ── hit regions ─────────────────────────────────────────────────────────────

export const activateHit = (action) => {
  if (!action) return;
  switch (action.type) {
    case "jump":
      sfx.tick();
      jump(action.spread);
      break;
    case "link":
      sfx.stamp();
      if (/^(mailto|tel):/.test(action.href)) window.location.href = action.href;
      else window.open(action.href, "_blank", "noopener,noreferrer");
      break;
    case "project":
      sfx.tick();
      store().set({ detail: action });
      break;
    case "certificate":
    case "hackathon": {
      sfx.stamp();
      const url = action.item.certificateUrl ?? action.item.liveUrl ?? action.item.repoUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else {
        store().set({ toast: action.type === "certificate" ? `${action.item.name}${action.item.issuer ? `, ${action.item.issuer}` : ""}` : action.item.name });
        motion.highlight = 2.4; // stamp-flash on the card
      }
      break;
    }
    default:
      break;
  }
};

// ── keyboard & escape ───────────────────────────────────────────────────────

const escape = () => {
  settlePeel();
  const { phase } = store();
  if (phase === PHASE.COVER_INSPECT) backToShelf();
  else if (phase === PHASE.READING) shutToInspect();
  else if (phase === PHASE.BOOK_CLOSE) reopen();
};

const primary = () => {
  const { phase } = store();
  if (phase === PHASE.SHELF_AMBIENT || phase === PHASE.BOOK_HOVER) select();
  else if (phase === PHASE.COVER_INSPECT) open();
};

// Keeps the camera framed after a resize or orientation change.
const refresh = () => {
  const { phase, busy } = store();
  if (busy) return;
  const c = motion.camera;
  if (phase === PHASE.SHELF_AMBIENT || phase === PHASE.BOOK_HOVER) {
    prepareDolly();
    c.s = 0;
    motion.book.s = 0;
    return;
  }
  const pose = { COVER_INSPECT: "inspect", READING: "reading", BOOK_CLOSE: "back" }[phase];
  if (!pose) return;
  CAMERA_POSES[pose](scratchPose);
  c.from.p.copy(scratchPose.p);
  c.from.t.copy(scratchPose.t);
  c.to.p.copy(scratchPose.p);
  c.to.t.copy(scratchPose.t);
  c.s = 1;
};

export const director = {
  hoverOn,
  hoverOff,
  select,
  open,
  next,
  prev,
  jump,
  closeBack,
  reopen,
  returnToShelf,
  escape,
  primary,
  refresh,
  intro
};

if (import.meta.env.DEV) {
  window.__director = director;
  window.__gsap = gsap;
}
