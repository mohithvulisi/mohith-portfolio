// Sliding-window texture manager. Only spreads n-1, n and n+1 keep full-size
// page textures; everything else is disposed. Pages render one per idle slot so
// turning a page never stalls the frame loop.

import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from "three";
import { portfolio } from "../content/portfolio";
import { makeCanvas, preloadImages, renderPage, renderSketchPage, warmPagePhotos, PAPER } from "./pageRenderer";

const JAPANESE_GLYPHS =
  "目次続く開拓接続挑戦伝令修了完第一二三四五六七八九十零章年目序次巻予告連絡先電話ハッカソンクロニクル開発者ゴ";

export const loadFonts = async () => {
  if (!document.fonts?.load) return;
  const loads = [
    document.fonts.load('64px "Dela Gothic One"', `ABCabc0123 ${JAPANESE_GLYPHS}`),
    document.fonts.load('700 32px "Comic Neue"', "WHAT AM I? abc"),
    document.fonts.load('400 24px "Zen Kaku Gothic New"', "abc ABC 123"),
    document.fonts.load('500 24px "Zen Kaku Gothic New"', "abc ABC 123"),
    document.fonts.load('700 24px "Zen Kaku Gothic New"', `abc ABC 123 ${JAPANESE_GLYPHS}`)
  ];
  // offline or blocked: draw with fallbacks rather than wait forever
  await Promise.race([Promise.allSettled(loads), new Promise((resolve) => setTimeout(resolve, 4500))]);
};

export const photoSources = () => [...Object.values(portfolio.media?.photos ?? {})];

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16));

const toTexture = (canvas, renderer) => {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() ?? 16;
  texture.anisotropy = Math.max(maxAniso, 16);
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

export class TextureManager {
  // canWork: background rendering waits while it returns false (a page is in
  // the air), so canvas work and uploads never compete with an animation.
  constructor(book, { pageHeight = 2048, renderer = null, canWork = () => true } = {}) {
    this.book = book;
    this.pageHeight = pageHeight;
    this.renderer = renderer;
    this.canWork = canWork;
    this.full = new Map(); // pageIndex -> texture
    this.sketches = new Map();
    this.queue = [];
    this.pumping = false;
    this.listeners = new Set();
    this.blank = toTexture(this.paperCanvas(), renderer);
  }

  paperCanvas() {
    const canvas = makeCanvas(64, 98);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, 64, 98);
    return canvas;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(pageIndex) {
    this.listeners.forEach((fn) => fn(pageIndex));
  }

  // Best texture available for a page: full, then sketch, then blank paper.
  get(pageIndex) {
    return this.full.get(pageIndex) ?? this.sketches.get(pageIndex) ?? this.blank;
  }

  pagesForSpread(spread) {
    const s = this.book.spreads[spread - 1];
    return s ? [s.right, s.left] : [];
  }

  // Ink every photo in the book at its final size; run behind the loader.
  warmPhotos() {
    this.book.pages.forEach((page) => warmPagePhotos(page, this.pageHeight));
  }

  // Render and upload synchronously (the upload happens here, not inside the
  // next animation frame).
  renderNow(pageIndex) {
    if (this.full.has(pageIndex) || !this.book.pages[pageIndex]) return;
    const texture = toTexture(renderPage(this.book.pages[pageIndex], this.pageHeight), this.renderer);
    this.renderer?.initTexture?.(texture);
    this.full.set(pageIndex, texture);
    this.emit(pageIndex);
  }

  // Keep spreads n-1..n+1 resident; dispose the rest.
  setWindow(spread) {
    const wanted = new Set();
    const order = [];
    [spread, spread + 1, spread - 1].forEach((s) =>
      this.pagesForSpread(s).forEach((p) => {
        wanted.add(p);
        order.push(p);
      })
    );
    [...this.full.keys()].forEach((pageIndex) => {
      if (!wanted.has(pageIndex)) {
        this.full.get(pageIndex).dispose();
        this.full.delete(pageIndex);
        this.emit(pageIndex);
      }
    });
    this.queue = order.filter((p) => !this.full.has(p));
    this.pump();
  }

  pump() {
    if (this.pumping) return;
    this.pumping = true;
    const step = () => {
      if (!this.queue.length) {
        this.pumping = false;
        return;
      }
      if (!this.canWork()) {
        setTimeout(step, 140);
        return;
      }
      this.renderNow(this.queue.shift());
      idle(step);
    };
    idle(step);
  }

  // Low-res stand-ins for leaves that fly past during a multi-leaf jump.
  prepareSketches(pageIndices) {
    pageIndices.forEach((pageIndex) => {
      if (this.full.has(pageIndex) || this.sketches.has(pageIndex) || !this.book.pages[pageIndex]) return;
      const texture = toTexture(renderSketchPage(this.book.pages[pageIndex], 384), this.renderer);
      this.renderer?.initTexture?.(texture);
      this.sketches.set(pageIndex, texture);
      this.emit(pageIndex);
    });
  }

  releaseSketches() {
    this.sketches.forEach((texture, pageIndex) => {
      texture.dispose();
      this.sketches.delete(pageIndex);
      this.emit(pageIndex);
    });
  }

  setPageHeight(height) {
    if (height === this.pageHeight) return;
    this.pageHeight = height;
    const resident = [...this.full.keys()];
    resident.forEach((pageIndex) => {
      this.full.get(pageIndex).dispose();
      this.full.delete(pageIndex);
    });
    this.queue = resident;
    this.pump();
  }

  dispose() {
    this.full.forEach((t) => t.dispose());
    this.sketches.forEach((t) => t.dispose());
    this.blank.dispose();
    this.full.clear();
    this.sketches.clear();
    this.listeners.clear();
  }
}

export const preloadAssets = async (onProgress) => {
  const steps = [loadFonts(), preloadImages(photoSources())];
  let done = 0;
  await Promise.all(
    steps.map((p) =>
      p.then(() => {
        done += 1;
        onProgress?.(done / steps.length);
      })
    )
  );
};
