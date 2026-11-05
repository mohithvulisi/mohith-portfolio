// Draws manga pages onto canvases: ink borders, screentones, focus lines,
// speech bubbles, vertical Japanese and photos converted to halftone ink.
// Every page is drawn from its layout blocks; nothing here invents content.

import { PAGE_ASPECT } from "../content/layout";

export const INK = "#17120e";
export const PAPER = "#f3f0e8";
const INK_RGB = [23, 18, 14];
const PAPER_RGB = [243, 240, 232];

export const FONT = {
  display: '"Dela Gothic One", "Arial Black", sans-serif',
  ui: '"Zen Kaku Gothic New", system-ui, sans-serif',
  bubble: '"Comic Neue", "Comic Sans MS", cursive'
};

// ── shared utilities ────────────────────────────────────────────────────────

export const makeCanvas = (w, h) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  return canvas;
};

export const seeded = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const images = new Map();

export const preloadImages = (sources) =>
  Promise.all(
    sources.filter(Boolean).map(
      (src) =>
        new Promise((resolve) => {
          if (images.has(src)) return resolve();
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            images.set(src, img);
            resolve();
          };
          img.onerror = () => resolve(); // a missing photo falls back to ink art
          img.src = src;
        })
    )
  );

export const getImage = (src) => images.get(src);

export const font = (size, family = "display", weight = "") => `${weight} ${Math.round(size)}px ${FONT[family]}`.trim();

export const fitSize = (ctx, text, maxWidth, maxSize, family = "display", weight = "", minSize = 8) => {
  let size = maxSize;
  ctx.font = font(size, family, weight);
  const width = ctx.measureText(text).width;
  if (width > maxWidth) size = Math.max(minSize, Math.floor((size * maxWidth) / width));
  return size;
};

export const wrapText = (ctx, text, maxWidth) => {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  return lines;
};

// Largest size at which `text` wraps into at most `maxLines` lines inside the box.
const fitWrapped = (ctx, text, maxWidth, maxHeight, maxSize, family, weight = "", maxLines = 3, leading = 1.05) => {
  for (let size = maxSize; size > 10; size -= 2) {
    ctx.font = font(size, family, weight);
    const lines = wrapText(ctx, text, maxWidth);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= maxLines && widest <= maxWidth && lines.length * size * leading <= maxHeight) return { size, lines };
  }
  ctx.font = font(10, family, weight);
  return { size: 10, lines: wrapText(ctx, text, maxWidth) };
};

// ── ink primitives ──────────────────────────────────────────────────────────

const inkPath = (ctx, points, rand, amp) => {
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(len / 60));
    const nx = -(y1 - y0) / (len || 1);
    const ny = (x1 - x0) / (len || 1);
    for (let k = 1; k <= steps; k += 1) {
      const t = k / steps;
      const j = k === steps ? 0 : (rand() - 0.5) * amp;
      ctx.lineTo(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
  }
};

export const inkRect = (g, x, y, w, h, width = 3.4) => {
  const { ctx, u, rand } = g;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width * u;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  inkPath(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], rand, 0.9 * u);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

const panelClip = (g, r, fn) => {
  const { ctx } = g;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  fn();
  ctx.restore();
};

// Tapered brush stroke along a gentle curve; reads as a sumi brush underline.
const brushStroke = (g, x0, y0, x1, y1, thickness, color = INK) => {
  const { ctx, rand } = g;
  const steps = 28;
  const top = [];
  const bottom = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * thickness * 0.25;
    const w = thickness * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.95 + 0.05), 0.6) * (0.85 + rand() * 0.15);
    top.push([x, y - w / 2]);
    bottom.push([x, y + w / 2]);
  }
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  bottom.reverse().forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// Uniform dot screentone (45 degrees, like Letraset/IC screen sheets).
const dotTone = (g, r, spacing, coverage) => {
  const { ctx, u } = g;
  const step = spacing * u;
  const radius = Math.sqrt(clamp(coverage, 0, 0.9) / Math.PI) * step;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(Math.PI / 4);
  const reach = Math.hypot(r.w, r.h) / 2 + step;
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let y = -reach; y <= reach; y += step) {
    for (let x = -reach; x <= reach; x += step) {
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
};

// Dot screentone whose coverage follows coverageAt(nx, ny) in panel space.
const gradientTone = (g, r, spacing, coverageAt) => {
  const { ctx, u } = g;
  const step = spacing * u;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.beginPath();
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const reach = Math.hypot(r.w, r.h) / 2 + step;
  const c = Math.SQRT1_2;
  for (let a = -reach; a <= reach; a += step) {
    for (let b = -reach; b <= reach; b += step) {
      const x = cx + (a - b) * c;
      const y = cy + (a + b) * c;
      if (x < r.x - step || x > r.x + r.w + step || y < r.y - step || y > r.y + r.h + step) continue;
      const cov = clamp(coverageAt((x - r.x) / r.w, (y - r.y) / r.h), 0, 0.92);
      if (cov < 0.02) continue;
      const radius = Math.sqrt(cov / Math.PI) * step;
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
};

const hatch = (g, r, spacing, angle, width = 1.2, alpha = 1) => {
  const { ctx, u } = g;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = INK;
  ctx.lineWidth = width * u;
  const reach = Math.hypot(r.w, r.h) / 2;
  ctx.beginPath();
  for (let x = -reach; x <= reach; x += spacing * u) {
    ctx.moveTo(x, -reach);
    ctx.lineTo(x, reach);
  }
  ctx.stroke();
  ctx.restore();
};

// 集中線: focus lines converging on (cx, cy), stopping short of an empty core.
export const focusLines = (g, r, cx, cy, { count = 140, inner = 0.3, color = INK, width = 1 } = {}) => {
  const { ctx, rand } = g;
  const outer = Math.hypot(r.w, r.h);
  const core = inner * Math.min(r.w, r.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.04;
    const spread = (0.004 + rand() * 0.012) * width;
    const stop = core * (0.75 + rand() * 0.7);
    const tipX = cx + Math.cos(angle) * stop;
    const tipY = cy + Math.sin(angle) * stop;
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(cx + Math.cos(angle - spread) * outer, cy + Math.sin(angle - spread) * outer);
    ctx.lineTo(cx + Math.cos(angle + spread) * outer, cy + Math.sin(angle + spread) * outer);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
};

// 流線: parallel speed lines with tapered ends.
const speedLines = (g, r, angle, { count = 60, color = INK, fade = 0.5 } = {}) => {
  const { ctx, rand, u } = g;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
  ctx.rotate(angle);
  const reach = Math.hypot(r.w, r.h) / 2;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const y = (rand() * 2 - 1) * reach;
    const len = reach * (0.5 + rand() * 1.3);
    const start = reach - len * (1 - fade * rand());
    const thick = (0.8 + rand() * 2.6) * u;
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.lineTo(reach + 10, y - thick / 2);
    ctx.lineTo(reach + 10, y + thick / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};

const SMALL_KANA = new Set("ッャュョァィゥェォっゃゅょぁぃぅぇぉ");
const ROTATE_IN_VERTICAL = new Set("ー〜…");

// Japanese set vertically (tategaki), one glyph per cell.
export const verticalText = (g, text, x, y, size, { family = "display", color = INK, outline = 0, outlineColor = PAPER } = {}) => {
  const { ctx } = g;
  ctx.save();
  ctx.font = font(size, family);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [...text].forEach((ch, i) => {
    let cx = x;
    let cy = y + size * 0.55 + i * size * 1.04;
    ctx.save();
    if (SMALL_KANA.has(ch)) {
      cx += size * 0.12;
      cy -= size * 0.12;
    }
    ctx.translate(cx, cy);
    if (ROTATE_IN_VERTICAL.has(ch)) ctx.rotate(Math.PI / 2);
    if (outline) {
      ctx.lineJoin = "round";
      ctx.lineWidth = outline;
      ctx.strokeStyle = outlineColor;
      ctx.strokeText(ch, 0, 0);
    }
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.restore();
  return [...text].length * size * 1.04;
};

const outlinedText = (g, text, x, y, size, { fill = PAPER, stroke = INK, strokeWidth = 0.16, family = "display", align = "left", baseline = "alphabetic" } = {}) => {
  const { ctx } = g;
  ctx.save();
  ctx.font = font(size, family);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.lineWidth = size * strokeWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
};

const blackTag = (g, text, x, y, size, { family = "ui", weight = "700", invert = false, padX = 0.55, align = "left" } = {}) => {
  const { ctx } = g;
  ctx.save();
  ctx.font = font(size, family, weight);
  const w = ctx.measureText(text).width + size * padX * 2;
  const h = size * 1.55;
  const left = align === "right" ? x - w : x;
  ctx.fillStyle = invert ? PAPER : INK;
  ctx.beginPath();
  ctx.moveTo(left + size * 0.35, y);
  ctx.lineTo(left + w, y);
  ctx.lineTo(left + w - size * 0.35, y + h);
  ctx.lineTo(left, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = invert ? INK : PAPER;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, left + size * padX, y + h / 2 + size * 0.04);
  ctx.restore();
  return { w, h };
};

// Speech or thought balloon centred at (cx, cy); the tail points at (tx, ty).
export const balloon = (g, text, cx, cy, { size = 30, maxWidth = 260, style = "speech", tx, ty, family = "bubble", upper = true } = {}) => {
  const { ctx, u, rand } = g;
  const label = upper ? String(text).toUpperCase() : String(text);
  ctx.save();
  ctx.font = font(size, family, "700");
  const lines = wrapText(ctx, label, maxWidth);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const textH = lines.length * size * 1.08;
  const rx = textW / 2 + size * 1.05;
  const ry = textH / 2 + size * 0.85;

  ctx.lineWidth = 2.6 * u;
  ctx.strokeStyle = INK;
  ctx.fillStyle = "#fbfaf6";

  if (style === "thought") {
    // Cloud edge made of overlapping puffs, then a trail of shrinking bubbles.
    const puffs = 14;
    ctx.beginPath();
    for (let i = 0; i < puffs; i += 1) {
      const a = (i / puffs) * Math.PI * 2;
      const pr = size * (0.55 + rand() * 0.2);
      ctx.moveTo(cx + Math.cos(a) * rx + pr, cy + Math.sin(a) * ry);
      ctx.arc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, pr, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (tx !== undefined) {
      [0.28, 0.17, 0.1].forEach((r, i) => {
        const t = 0.35 + i * 0.22;
        const bx = cx + (tx - cx) * t + rx * 0.2 * (1 - t);
        const by = cy + ry * 0.7 + (ty - cy - ry * 0.7) * t;
        ctx.beginPath();
        ctx.arc(bx, by, size * r * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    }
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (tx !== undefined) {
      const a = Math.atan2(ty - cy, tx - cx);
      const base = 0.22;
      const p1 = [cx + Math.cos(a - base) * rx * 0.92, cy + Math.sin(a - base) * ry * 0.92];
      const p2 = [cx + Math.cos(a + base) * rx * 0.92, cy + Math.sin(a + base) * ry * 0.92];
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.quadraticCurveTo((p1[0] + tx) / 2 + 6 * u, (p1[1] + ty) / 2, tx, ty);
      ctx.quadraticCurveTo((p2[0] + tx) / 2, (p2[1] + ty) / 2 - 4 * u, p2[0], p2[1]);
      ctx.fill();
      ctx.stroke();
      // hide the outline where tail meets balloon
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(cx + Math.cos(a) * rx * 0.6, cy + Math.sin(a) * ry * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(size, family, "700");
  lines.forEach((line, i) => ctx.fillText(line, cx, cy - textH / 2 + size * 0.56 + i * size * 1.08));
  ctx.restore();
  return { rx, ry };
};

const narrationBox = (g, text, x, y, maxW, size, { family = "ui", weight = "500", maxLines = 4 } = {}) => {
  const { ctx, u } = g;
  ctx.save();
  ctx.font = font(size, family, weight);
  const lines = wrapText(ctx, text, maxW - size * 1.4).slice(0, maxLines);
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + size * 1.4);
  const h = lines.length * size * 1.35 + size * 0.9;
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  inkRect(g, x, y, w, h, 2.2);
  ctx.save();
  ctx.font = font(size, family, weight);
  ctx.fillStyle = INK;
  ctx.textBaseline = "top";
  lines.forEach((line, i) => ctx.fillText(line, x + size * 0.7, y + size * 0.5 + i * size * 1.35));
  ctx.restore();
  return { w, h, u };
};

// ── photographs → ink ───────────────────────────────────────────────────────

const photoCache = new Map();

// Converts a photo into manga ink: solid blacks, 45° AM halftone midtones and
// Sobel contour lines, printed on paper. Cached per size so re-renders are free.
export const inkPhoto = (src, width, height, { focus = [0.5, 0.5], tone = "normal", zoom = 1, cellScale = 1, ink = INK_RGB, paper = PAPER_RGB, transparentPaper = false } = {}) => {
  const img = images.get(src);
  if (!img) return null;
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round(height));
  const key = `${src}|${w}|${h}|${tone}|${zoom}|${cellScale}|${focus.join(",")}|${ink.join(",")}|${transparentPaper}`;
  if (photoCache.has(key)) return photoCache.get(key);

  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = clamp(w / 2 - focus[0] * dw, w - dw, 0);
  const dy = clamp(h / 2 - focus[1] * dh, h - dh, 0);
  ctx.drawImage(img, dx, dy, dw, dh);

  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;
  const n = w * h;
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i += 1) {
    const l = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    lum[i] = l / 255;
    hist[l | 0] += 1;
  }
  const percentile = (p) => {
    let acc = 0;
    for (let v = 0; v < 256; v += 1) {
      acc += hist[v];
      if (acc >= n * p) return v / 255;
    }
    return 1;
  };
  const lo = percentile(0.02);
  const hi = Math.max(lo + 0.1, percentile(0.985));
  const gamma = tone === "soft" ? 0.78 : tone === "hard" ? 1.18 : 0.95;
  for (let i = 0; i < n; i += 1) lum[i] = Math.pow(clamp((lum[i] - lo) / (hi - lo), 0, 1), gamma);

  // light blur before edge detection so skin texture does not turn to noise
  const blur = new Float32Array(n);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const yy = y + oy;
        if (yy < 0 || yy >= h) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const xx = x + ox;
          if (xx < 0 || xx >= w) continue;
          sum += lum[yy * w + xx];
          count += 1;
        }
      }
      blur[y * w + x] = sum / count;
    }
  }

  const cell = Math.max(3.5, (Math.min(w, h) / 78) * cellScale);
  const black = tone === "soft" ? 0.09 : tone === "hard" ? 0.24 : 0.16;
  const white = tone === "soft" ? 0.8 : 0.87;
  const edgeThreshold = tone === "soft" ? 0.42 : 0.32;
  const aa = 0.9 / cell;
  const k = Math.SQRT1_2 / cell;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      const l = lum[i];
      let inkAmount;
      if (l < black) inkAmount = 1;
      else if (l > white) inkAmount = 0;
      else {
        const coverage = ((white - l) / (white - black)) * 0.86;
        const u = (x + y) * k;
        const v = (x - y) * k;
        const fu = u - Math.floor(u) - 0.5;
        const fv = v - Math.floor(v) - 0.5;
        const d = Math.sqrt(fu * fu + fv * fv);
        const r = Math.sqrt(coverage / Math.PI);
        inkAmount = 1 - smoothstep(r - aa, r + aa, d);
      }
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
        const tl = blur[i - w - 1];
        const t = blur[i - w];
        const tr = blur[i - w + 1];
        const l1 = blur[i - 1];
        const r1 = blur[i + 1];
        const bl = blur[i + w - 1];
        const b = blur[i + w];
        const br = blur[i + w + 1];
        const gx = tr + 2 * r1 + br - tl - 2 * l1 - bl;
        const gy = bl + 2 * b + br - tl - 2 * t - tr;
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > edgeThreshold) inkAmount = Math.max(inkAmount, Math.min(1, (mag - edgeThreshold) * 4));
      }
      const o = i * 4;
      if (transparentPaper) {
        px[o] = ink[0];
        px[o + 1] = ink[1];
        px[o + 2] = ink[2];
        px[o + 3] = inkAmount * 255;
      } else {
        px[o] = paper[0] + (ink[0] - paper[0]) * inkAmount;
        px[o + 1] = paper[1] + (ink[1] - paper[1]) * inkAmount;
        px[o + 2] = paper[2] + (ink[2] - paper[2]) * inkAmount;
        px[o + 3] = 255;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  photoCache.set(key, canvas);
  return canvas;
};

// ── page furniture ──────────────────────────────────────────────────────────

const paper = (g) => {
  const { ctx, W, H, rand, page } = g;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // fibres and specks
  ctx.save();
  for (let i = 0; i < 2600; i += 1) {
    ctx.globalAlpha = 0.03 + rand() * 0.05;
    ctx.fillStyle = rand() > 0.5 ? "#8b7d63" : "#ffffff";
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 1.5);
  }
  ctx.restore();
  // faint ageing toward the outer edge (spine side stays clean)
  const outerX = page.side === "right" ? W : 0;
  const grad = ctx.createLinearGradient(outerX, 0, page.side === "right" ? W * 0.82 : W * 0.18, 0);
  grad.addColorStop(0, "rgba(150,120,70,0.10)");
  grad.addColorStop(1, "rgba(150,120,70,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
};

const pageNumber = (g) => {
  const { ctx, W, H, u, page } = g;
  ctx.save();
  ctx.font = font(17 * u, "ui", "700");
  ctx.fillStyle = INK;
  ctx.textBaseline = "middle";
  const y = H - 30 * u;
  if (page.side === "right") {
    ctx.textAlign = "right";
    ctx.fillText(String(page.number), W - 40 * u, y);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(String(page.number), 40 * u, y);
  }
  ctx.restore();
};

// ── block drawers ───────────────────────────────────────────────────────────

// the hyacinths are busy: crop in on him and print light so the shirt pops
const CLOSING_INK = { focus: [0.5, 0.74], zoom: 1.5, tone: "soft", cellScale: 1.3 };
const CLOSING_PANEL = 0.8;

// Inks every photograph a page will need, at its exact size, ahead of time.
// The pixel work (tens of ms per photo) then never lands mid-page-turn.
export const warmPagePhotos = (page, height) => {
  const H = Math.round(height);
  const W = Math.round(H * PAGE_ASPECT);
  page.blocks.forEach(({ kind, rect, data }) => {
    if (!data?.src) return;
    const w = rect[2] * W;
    const h = rect[3] * H;
    if (kind === "photoPanel") inkPhoto(data.src, w, h, { focus: data.focus, tone: data.tone });
    if (kind === "closing") inkPhoto(data.src, w, h * CLOSING_PANEL, CLOSING_INK);
  });
};

const DRAW = {
  header(g, { data }, r) {
    const { ctx, u } = g;
    const tagSize = data.compact ? 15 * u : 17 * u;
    blackTag(g, data.label, r.x, r.y, tagSize);
    const jpSize = data.compact ? 22 * u : 30 * u;
    const jpCol = data.jp ? jpSize * 1.6 : 0;
    if (data.compact) {
      const size = fitSize(ctx, data.title, r.w - jpCol - 210 * u, 34 * u);
      ctx.save();
      ctx.font = font(size);
      ctx.fillStyle = INK;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(data.title, r.x + 200 * u, r.y + tagSize * 0.8);
      if (data.jp) {
        ctx.font = font(jpSize * 0.8, "ui", "700");
        ctx.textAlign = "right";
        ctx.fillText(data.jp, r.x + r.w, r.y + tagSize * 0.8);
      }
      ctx.restore();
      brushStroke(g, r.x, r.y + r.h - 6 * u, r.x + r.w, r.y + r.h - 8 * u, 5 * u);
      return;
    }
    const maxTitle = Math.min(data.big ? 96 * u : 70 * u, r.h - tagSize * 1.7 - 16 * u);
    const glyphs = [...(data.jp ?? "")].length;
    const fitJp = glyphs ? Math.min(jpSize, (r.h - 4 * u) / (glyphs * 1.04 + 0.45)) : 0;
    const titleSize = fitSize(ctx, data.title, r.w - (glyphs ? fitJp * 1.7 : 0) - 6 * u, maxTitle);
    const baseline = r.y + tagSize * 1.55 + titleSize * 0.98;
    ctx.save();
    ctx.font = font(titleSize);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(data.title, r.x, baseline);
    ctx.restore();
    brushStroke(g, r.x - 4 * u, baseline + 12 * u, r.x + r.w * 0.86, baseline + 8 * u, 8 * u);
    if (glyphs) {
      const jx = r.x + r.w - fitJp * 0.6;
      const height = glyphs * fitJp * 1.04;
      gradientTone(g, { x: jx - fitJp * 0.75, y: r.y, w: fitJp * 1.5, h: height + fitJp * 0.4 }, 7, () => 0.18);
      verticalText(g, data.jp, jx, r.y + fitJp * 0.15, fitJp, { outline: 6 * u });
    }
  },

  tocHeader(g, { data }, r) {
    const { ctx, u } = g;
    const kanjiSize = 120 * u;
    const kx = r.x + r.w - kanjiSize * 0.62;
    gradientTone(g, { x: r.x + r.w - kanjiSize * 1.35, y: r.y - 10 * u, w: kanjiSize * 1.45, h: r.h + 10 * u }, 8, (nx, ny) => 0.05 + ny * 0.45);
    verticalText(g, data.jp, kx, r.y + 4 * u, kanjiSize * 0.78, { outline: 10 * u });
    blackTag(g, data.label, r.x, r.y, 17 * u);
    const size = fitSize(ctx, data.title, r.w - kanjiSize * 1.5, 78 * u);
    ctx.font = font(size);
    ctx.fillStyle = INK;
    ctx.fillText(data.title, r.x, r.y + 27 * u + size);
    brushStroke(g, r.x - 4 * u, r.y + 50 * u + size, r.x + r.w - kanjiSize * 1.45, r.y + 46 * u + size, 8 * u);
    ctx.font = font(18 * u, "ui", "500");
    ctx.fillText("Tap a chapter to jump there.", r.x, r.y + 92 * u + size);
  },

  tocEntry(g, { data }, r) {
    const { ctx, u } = g;
    const mid = r.y + r.h / 2;
    const numberSize = Math.min(34 * u, r.h * 0.55);
    ctx.save();
    ctx.textBaseline = "middle";
    ctx.font = font(numberSize);
    ctx.textAlign = "right";
    ctx.fillStyle = INK;
    ctx.fillText(String(data.pageNumber), r.x + r.w, mid + 2 * u);
    const numberW = ctx.measureText(String(data.pageNumber)).width;
    ctx.textAlign = "left";
    const labelSize = Math.min(14 * u, r.h * 0.22);
    ctx.font = font(labelSize, "ui", "700");
    ctx.fillStyle = "#5b5148";
    const labelText = data.label ? `${data.label}  ${data.jp}` : data.jp;
    ctx.fillText(labelText, r.x, r.y + labelSize * 0.9);
    const titleSize = fitSize(ctx, data.title, r.w - numberW - 70 * u, Math.min(32 * u, r.h * 0.48));
    ctx.font = font(titleSize);
    ctx.fillStyle = INK;
    const titleY = r.y + labelSize * 1.8 + titleSize * 0.5;
    ctx.fillText(data.title, r.x, titleY);
    const titleW = ctx.measureText(data.title).width;
    // dotted leader
    ctx.fillStyle = INK;
    for (let x = r.x + titleW + 14 * u; x < r.x + r.w - numberW - 14 * u; x += 11 * u) {
      ctx.beginPath();
      ctx.arc(x, titleY + titleSize * 0.18, 1.8 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.stroke();
    ctx.restore();
  },

  tocFooter(g, _block, r) {
    const { ctx, u } = g;
    dotTone(g, r, 7, 0.16);
    inkRect(g, r.x, r.y, r.w, r.h, 2.6);
    const cx = r.x + r.w * 0.5;
    const cy = r.y + r.h * 0.5;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.fillRect(cx - r.w * 0.36, cy - 24 * u, r.w * 0.72, 48 * u);
    ctx.font = font(19 * u, "ui", "700");
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("This volume reads right to left", cx + 16 * u, cy);
    // little right-to-left arrow
    const ax = cx - r.w * 0.31;
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(ax + 30 * u, cy);
    ctx.lineTo(ax, cy);
    ctx.moveTo(ax + 10 * u, cy - 9 * u);
    ctx.lineTo(ax, cy);
    ctx.lineTo(ax + 10 * u, cy + 9 * u);
    ctx.stroke();
    ctx.restore();
  },

  photoPanel(g, { data }, r) {
    const { ctx, u } = g;
    const photo = data.src ? inkPhoto(data.src, r.w, r.h, { focus: data.focus, tone: data.tone }) : null;
    if (photo) ctx.drawImage(photo, r.x, r.y, r.w, r.h);
    else
      panelClip(g, r, () => {
        gradientTone(g, r, 8, (nx, ny) => 0.1 + ny * 0.5);
        focusLines(g, r, r.x + r.w / 2, r.y + r.h / 2, { count: 120, inner: 0.35 });
      });
    if (data.sfx) {
      ctx.save();
      ctx.translate(r.x + r.w * 0.8, r.y + r.h * 0.2);
      ctx.rotate(-0.16);
      outlinedText(g, data.sfx, 0, 0, 58 * u, { fill: INK, stroke: PAPER, strokeWidth: 0.22, align: "center", baseline: "middle" });
      ctx.restore();
    }
    inkRect(g, r.x, r.y, r.w, r.h, 3.6);
    if (data.bubble) {
      const [bx, by] = data.bubble.at;
      balloon(g, data.bubble.text, r.x + r.w * bx, r.y + r.h * by, {
        size: (data.bubble.size ?? 34) * u,
        maxWidth: r.w * 0.34,
        style: data.bubble.style,
        tx: r.x + r.w * (bx + 0.2),
        ty: r.y + r.h * (by + 0.24)
      });
    }
  },

  nameCard(g, { data }, r) {
    const { ctx, u } = g;
    panelClip(g, r, () => speedLines(g, { x: r.x, y: r.y, w: r.w, h: r.h * 0.6 }, 0, { count: 46, fade: 0.8 }));
    const nameFit = fitWrapped(ctx, data.name, r.w * 0.98, r.h * 0.46, 84 * u, "display", "", 2, 1.02);
    ctx.save();
    let y = r.y + nameFit.size * 0.95;
    nameFit.lines.forEach((line) => {
      outlinedText(g, line, r.x, y, nameFit.size, { fill: INK, stroke: PAPER, strokeWidth: 0.2 });
      y += nameFit.size * 1.02;
    });
    ctx.restore();
    const box = narrationBox(g, data.role, r.x, y - nameFit.size * 0.45 + 10 * u, r.w, 21 * u, { maxLines: 3 });
    blackTag(g, data.college, r.x, y - nameFit.size * 0.45 + box.h + 24 * u, 17 * u);
  },

  badge(g, { data }, r) {
    const { ctx, u, rand } = g;
    ctx.save();
    ctx.font = font(24 * u, "ui", "700");
    const tw = ctx.measureText(data.text).width;
    const w = tw + 70 * u;
    const h = Math.min(r.h, 62 * u);
    const x = r.x + r.w - w - 6 * u;
    const y = r.y + (r.h - h) / 2;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-0.045);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.2 * u;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.lineWidth = 1.4 * u;
    ctx.strokeRect(-w / 2 + 6 * u, -h / 2 + 6 * u, w - 12 * u, h - 12 * u);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(data.text, 0, 2 * u);
    // worn-stamp specks
    ctx.fillStyle = PAPER;
    for (let i = 0; i < 70; i += 1) {
      ctx.globalAlpha = 0.5 + rand() * 0.5;
      ctx.fillRect((rand() - 0.5) * w, (rand() - 0.5) * h, 1.5 * u, 1.5 * u);
    }
    ctx.restore();
  },

  certCard(g, { data }, r) {
    const { ctx, u } = g;
    const flip = data.index % 2 === 1;
    const sealW = r.w * 0.3;
    const sealRect = { x: flip ? r.x + r.w - sealW : r.x, y: r.y, w: sealW, h: r.h };
    gradientTone(g, sealRect, 7, (nx, ny) => 0.12 + (flip ? nx : 1 - nx) * 0.25 + ny * 0.2);
    const sx = sealRect.x + sealW / 2;
    const sy = r.y + r.h / 2;
    const sr = Math.min(sealW, r.h) * 0.34;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.arc(sx, sy, sr - 6 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    verticalText(g, "修了", sx, sy - sr * 0.78, sr * 0.72);
    inkRect(g, r.x, r.y, r.w, r.h, 3.2);
    const textX = flip ? r.x + 22 * u : r.x + sealW + 22 * u;
    const textW = r.w - sealW - 44 * u;
    const nameFit = fitWrapped(ctx, data.name, textW, r.h * 0.5, 44 * u, "display", "", 2);
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = font(nameFit.size);
    const blockH = nameFit.lines.length * nameFit.size * 1.05 + (data.issuer ? 34 * u : 0);
    let y = r.y + (r.h - blockH) / 2 + nameFit.size * 0.85;
    nameFit.lines.forEach((line) => {
      ctx.fillText(line, textX, y);
      y += nameFit.size * 1.05;
    });
    if (data.issuer) blackTag(g, data.issuer, textX, y - nameFit.size * 0.55 + 8 * u, 17 * u);
    if (data.certificateUrl) {
      ctx.font = font(15 * u, "ui", "700");
      ctx.textAlign = "right";
      ctx.fillText("Open certificate", r.x + r.w - 16 * u, r.y + r.h - 16 * u);
    }
    ctx.restore();
  },

  hackCard(g, { data }, r) {
    const { ctx, u } = g;
    panelClip(g, r, () => {
      speedLines(g, r, 0, { count: 26, fade: 0.9 });
      ctx.fillStyle = PAPER;
      ctx.fillRect(r.x, r.y, r.w * 0.72, r.h);
    });
    inkRect(g, r.x, r.y, r.w, r.h, 3);
    const nameFit = fitWrapped(ctx, data.name, r.w * 0.66, r.h * (data.note ? 0.52 : 0.72), 40 * u, "display", "", 2);
    ctx.save();
    ctx.fillStyle = INK;
    ctx.font = font(nameFit.size);
    const blockH = nameFit.lines.length * nameFit.size * 1.05 + (data.note ? 30 * u : 0);
    let y = r.y + (r.h - blockH) / 2 + nameFit.size * 0.85;
    nameFit.lines.forEach((line) => {
      ctx.fillText(line, r.x + 20 * u, y);
      y += nameFit.size * 1.05;
    });
    ctx.restore();
    if (data.note) blackTag(g, data.note, r.x + 20 * u, y - nameFit.size * 0.6 + 6 * u, 15 * u);
  },

  splash(g, { data }, r) {
    const { ctx, u } = g;
    panelClip(g, r, () => {
      ctx.fillStyle = PAPER;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      gradientTone(g, r, 7, (nx, ny) => 0.65 - ny * 0.55 + (1 - nx) * 0.1);
      focusLines(g, r, r.x + r.w * 0.38, r.y + r.h * 0.62, { count: 170, inner: 0.24 });
    });
    inkRect(g, r.x, r.y, r.w, r.h, 4);
    blackTag(g, data.label, r.x + 16 * u, r.y + 16 * u, 18 * u, { invert: false });
    const kanjiSize = 54 * u;
    ctx.save();
    ctx.fillStyle = PAPER;
    const kh = [...data.kanji].length * kanjiSize * 1.04 + kanjiSize * 0.3;
    ctx.fillRect(r.x + r.w - kanjiSize * 1.55, r.y + 14 * u, kanjiSize * 1.3, kh);
    ctx.restore();
    inkRect(g, r.x + r.w - kanjiSize * 1.55, r.y + 14 * u, kanjiSize * 1.3, kh, 2.4);
    verticalText(g, data.kanji, r.x + r.w - kanjiSize * 0.9, r.y + 14 * u + kanjiSize * 0.1, kanjiSize);
    const titleSize = fitSize(ctx, data.title, r.w * 0.78, 132 * u);
    outlinedText(g, data.title, r.x + 24 * u, r.y + r.h * 0.72, titleSize, { fill: PAPER, stroke: INK, strokeWidth: 0.2 });
    if (data.jp) {
      ctx.save();
      ctx.font = font(26 * u, "display");
      const w = ctx.measureText(data.jp).width + 24 * u;
      ctx.fillStyle = INK;
      ctx.fillRect(r.x + 24 * u, r.y + r.h * 0.72 + 18 * u, w, 40 * u);
      ctx.fillStyle = PAPER;
      ctx.textBaseline = "middle";
      ctx.fillText(data.jp, r.x + 36 * u, r.y + r.h * 0.72 + 39 * u);
      ctx.restore();
    }
    ctx.save();
    ctx.font = font(18 * u, "ui", "700");
    ctx.textAlign = "right";
    const countText = `${data.count} ${data.count === 1 ? "project" : "projects"}`;
    const cw = ctx.measureText(countText).width;
    ctx.fillStyle = PAPER;
    ctx.fillRect(r.x + r.w - cw - 36 * u, r.y + r.h - 50 * u, cw + 20 * u, 32 * u);
    ctx.fillStyle = INK;
    ctx.textBaseline = "middle";
    ctx.fillText(countText, r.x + r.w - 26 * u, r.y + r.h - 34 * u);
    ctx.restore();
  },

  projectPanel(g, { data }, r) {
    const { ctx, u } = g;
    const variant = data.variant % 4;
    const inverted = variant === 2;
    panelClip(g, r, () => {
      ctx.fillStyle = inverted ? INK : PAPER;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (variant === 0) focusLines(g, r, r.x + r.w * 0.72, r.y + r.h * 0.5, { count: 110, inner: 0.42 });
      if (variant === 1) gradientTone(g, r, 7, (nx, ny) => Math.max(0, 0.55 - nx * 0.5 - (1 - ny) * 0.25));
      if (variant === 2) focusLines(g, r, r.x + r.w * 0.3, r.y + r.h * 0.5, { count: 90, inner: 0.5, color: PAPER, width: 0.7 });
      if (variant === 3) {
        speedLines(g, r, -0.35, { count: 40, fade: 0.8 });
        ctx.fillStyle = PAPER;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y + r.h * 0.42);
        ctx.lineTo(r.x + r.w, r.y + r.h * 0.22);
        ctx.lineTo(r.x + r.w, r.y + r.h);
        ctx.lineTo(r.x, r.y + r.h);
        ctx.closePath();
        ctx.fill();
      }
    });
    inkRect(g, r.x, r.y, r.w, r.h, 3.6);

    const pad = 22 * u;
    const hasNote = Boolean(data.note);
    const titleArea = { w: r.w - pad * 2 - (hasNote ? r.w * 0.06 : 0), h: r.h * (data.description ? 0.32 : 0.42) };
    const fit = fitWrapped(ctx, data.title, titleArea.w, titleArea.h, 62 * u, "display", "", 3, 1.02);
    const titleBlockH = fit.lines.length * fit.size * 1.02;
    const anchorY = variant === 1 ? r.y + pad + fit.size * 0.9 : r.y + r.h - pad - titleBlockH + fit.size * 0.86 - (data.stack?.length ? 40 * u : 0);
    let y = anchorY;
    fit.lines.forEach((line) => {
      outlinedText(g, line, r.x + pad, y, fit.size, inverted ? { fill: PAPER, stroke: INK, strokeWidth: 0.12 } : { fill: INK, stroke: PAPER, strokeWidth: 0.24 });
      y += fit.size * 1.02;
    });
    blackTag(g, data.year, r.x + pad, variant === 1 ? r.y + r.h - pad - 26 * u : r.y + pad, 14 * u, { invert: inverted });

    if (data.description) {
      narrationBox(g, data.description, r.x + pad, variant === 1 ? y : r.y + pad + 36 * u, r.w * 0.62, 17 * u, { maxLines: 3 });
    }
    if (data.stack?.length) {
      let x = r.x + pad;
      data.stack.slice(0, 5).forEach((item) => {
        const { w } = blackTag(g, item, x, r.y + r.h - pad - 26 * u, 13 * u, { invert: !inverted, weight: "500" });
        x += w + 6 * u;
      });
    }
    if (hasNote) {
      const bx = variant === 1 ? r.x + r.w * 0.7 : r.x + r.w * 0.68;
      const by = variant === 1 ? r.y + r.h * 0.62 : r.y + r.h * 0.3;
      balloon(g, data.note, bx, by, { size: 24 * u, maxWidth: r.w * 0.34, tx: bx - r.w * 0.16, ty: by + r.h * 0.2 });
    }
    // open-details mark
    const mx = r.x + r.w - 26 * u;
    const my = r.y + r.h - 26 * u;
    ctx.save();
    ctx.fillStyle = inverted ? PAPER : INK;
    ctx.beginPath();
    ctx.arc(mx, my, 13 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = inverted ? INK : PAPER;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(mx - 6 * u, my);
    ctx.lineTo(mx + 6 * u, my);
    ctx.moveTo(mx, my - 6 * u);
    ctx.lineTo(mx, my + 6 * u);
    ctx.stroke();
    ctx.restore();
  },

  teaser(g, { data }, r) {
    const { ctx, u } = g;
    panelClip(g, r, () => {
      ctx.fillStyle = INK;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      focusLines(g, r, r.x + r.w * 0.42, r.y + r.h * 0.42, { count: 200, inner: 0.3, color: PAPER, width: 0.8 });
      gradientTone(g, { x: r.x, y: r.y + r.h * 0.62, w: r.w, h: r.h * 0.38 }, 8, (nx, ny) => ny * 0.7);
    });
    inkRect(g, r.x, r.y, r.w, r.h, 4);
    const size = fitSize(ctx, data.title, r.w * 0.7, 140 * u);
    outlinedText(g, data.title, r.x + r.w * 0.42, r.y + r.h * 0.42, size, { fill: PAPER, stroke: INK, strokeWidth: 0.2, align: "center", baseline: "middle" });
    if (data.jp) {
      ctx.save();
      ctx.font = font(30 * u);
      ctx.fillStyle = PAPER;
      ctx.textAlign = "center";
      ctx.fillText(data.jp, r.x + r.w * 0.42, r.y + r.h * 0.42 + size * 0.75);
      ctx.restore();
    }
    balloon(g, "To be continued...", r.x + r.w * 0.38, r.y + r.h * 0.7, { size: 30 * u, maxWidth: r.w * 0.5, upper: false });
    const ts = 96 * u;
    ctx.save();
    ctx.fillStyle = PAPER;
    ctx.fillRect(r.x + r.w - ts * 1.35, r.y + r.h * 0.5, ts * 1.2, ts * 2.4);
    ctx.restore();
    verticalText(g, "続く", r.x + r.w - ts * 0.75, r.y + r.h * 0.5 + ts * 0.12, ts);
    brushStroke(g, r.x + r.w - ts * 1.4, r.y + r.h * 0.5 + ts * 2.55, r.x + r.w - ts * 0.05, r.y + r.h * 0.5 + ts * 2.35, 14 * u);
  },

  interlude(g, { data }, r) {
    const rand = g.rand;
    const split = 0.36 + rand() * 0.1;
    const a = { x: r.x, y: r.y, w: r.w, h: r.h * split - 9 * g.u };
    const b = { x: r.x, y: r.y + r.h * split + 9 * g.u, w: r.w * 0.48, h: r.h * (1 - split) - 9 * g.u };
    const c = { x: r.x + r.w * 0.52, y: b.y, w: r.w * 0.48, h: b.h };
    panelClip(g, a, () => speedLines(g, a, data.seed % 2 ? 0.2 : -0.2, { count: 80 }));
    panelClip(g, b, () => gradientTone(g, b, 7, (nx, ny) => ny * 0.75));
    panelClip(g, c, () => {
      g.ctx.fillStyle = INK;
      g.ctx.fillRect(c.x, c.y, c.w, c.h);
      focusLines(g, c, c.x + c.w / 2, c.y + c.h / 2, { count: 90, inner: 0.25, color: PAPER, width: 0.7 });
    });
    [a, b, c].forEach((p) => inkRect(g, p.x, p.y, p.w, p.h, 3.4));
  },

  contactRow(g, { data }, r) {
    const { ctx, u } = g;
    inkRect(g, r.x, r.y, r.w, r.h, 2.4);
    const s = r.h * 0.8;
    const sx = r.x + (r.h - s) / 2;
    const sy = r.y + (r.h - s) / 2;
    ctx.save();
    ctx.fillStyle = INK;
    ctx.fillRect(sx, sy, s, s);
    ctx.fillStyle = PAPER;
    ctx.font = font(s * 0.42);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const [a, b] = [...data.jp];
    ctx.fillText(a, sx + s / 2, sy + s * 0.28);
    if (b) ctx.fillText(b, sx + s / 2, sy + s * 0.73);
    const tx = sx + s + 20 * u;
    ctx.fillStyle = "#5b5148";
    ctx.textAlign = "left";
    ctx.font = font(15 * u, "ui", "700");
    ctx.textBaseline = "alphabetic";
    ctx.fillText(data.label, tx, r.y + r.h * 0.38);
    ctx.fillStyle = INK;
    const valueSize = fitSize(ctx, data.value, r.x + r.w - tx - 50 * u, 24 * u, "ui", "700");
    ctx.font = font(valueSize, "ui", "700");
    ctx.fillText(data.value, tx, r.y + r.h * 0.76);
    // outbound mark
    const ax = r.x + r.w - 30 * u;
    const ay = r.y + r.h / 2;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(ax - 9 * u, ay + 9 * u);
    ctx.lineTo(ax + 9 * u, ay - 9 * u);
    ctx.moveTo(ax - 4 * u, ay - 9 * u);
    ctx.lineTo(ax + 9 * u, ay - 9 * u);
    ctx.lineTo(ax + 9 * u, ay + 4 * u);
    ctx.stroke();
    ctx.restore();
  },

  closing(g, { data }, r) {
    const { ctx, u } = g;
    const panel = { x: r.x, y: r.y, w: r.w, h: r.h * CLOSING_PANEL };
    const photo = data.src ? inkPhoto(data.src, panel.w, panel.h, CLOSING_INK) : null;
    if (photo) ctx.drawImage(photo, panel.x, panel.y, panel.w, panel.h);
    else
      panelClip(g, panel, () => {
        gradientTone(g, panel, 7, (nx, ny) => 0.1 + ny * 0.4);
        focusLines(g, panel, panel.x + panel.w / 2, panel.y + panel.h * 0.45, { count: 150, inner: 0.3 });
      });
    inkRect(g, panel.x, panel.y, panel.w, panel.h, 4);
    const cy = r.y + r.h * 0.9;
    const cx = r.x + r.w / 2;
    const cr = 42 * u;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = font(48 * u);
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("完", cx, cy + 3 * u);
    ctx.restore();
    brushStroke(g, r.x + r.w * 0.08, cy, cx - cr - 16 * u, cy - 2 * u, 6 * u);
    brushStroke(g, cx + cr + 16 * u, cy - 2 * u, r.x + r.w * 0.92, cy, 6 * u);
  }
};

// ── entry point ─────────────────────────────────────────────────────────────

export const renderPage = (page, height) => {
  const H = Math.round(height);
  const W = Math.round(H * PAGE_ASPECT);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const g = { ctx, W, H, u: H / 1000, rand: seeded(page.index * 7919 + 101), page };
  paper(g);
  page.blocks.forEach((block) => {
    const [x, y, w, h] = block.rect;
    const draw = DRAW[block.kind];
    if (draw) draw(g, block, { x: x * W, y: y * H, w: w * W, h: h * H });
  });
  pageNumber(g);
  return canvas;
};

// Cheap stand-in used while a page whizzes past during a direct jump.
export const renderSketchPage = (page, height) => {
  const H = Math.round(height);
  const W = Math.round(H * PAGE_ASPECT);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const g = { ctx, W, H, u: H / 1000, rand: seeded(page.index * 31 + 7), page };
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  page.blocks.forEach((block) => {
    const [x, y, w, h] = block.rect;
    const r = { x: x * W, y: y * H, w: w * W, h: h * H };
    if (block.kind === "tocEntry" || block.kind === "contactRow") {
      ctx.fillStyle = INK;
      ctx.fillRect(r.x, r.y + r.h * 0.45, r.w * 0.6, Math.max(2, r.h * 0.12));
    } else if (block.kind === "header" || block.kind === "tocHeader") {
      ctx.fillStyle = INK;
      ctx.fillRect(r.x, r.y + r.h * 0.35, r.w * 0.7, r.h * 0.25);
    } else {
      gradientTone(g, r, 9, (nx, ny) => 0.1 + ny * 0.3);
      inkRect(g, r.x, r.y, r.w, r.h, 3);
    }
  });
  pageNumber(g);
  return canvas;
};
