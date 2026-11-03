// Cover, spine, back cover and library textures, all drawn in code.
// Each material layer (colour, height → normal, clearcoat/roughness/metal,
// emissive) is painted from the same shapes so foil, varnish and glow line up.

import { portfolio } from "../content/portfolio";
import { BOOK } from "../scene/metrics";
import { PAPER, INK, font, fitSize, makeCanvas, seeded, wrapText, inkPhoto, getImage } from "./pageRenderer";

const EMERALD = "#0d5a42";
const EMERALD_DEEP = "#06291e";
const GOLD = ["#f6e2a1", "#c9a24a", "#8d6a22", "#e7c877"];
const SHU = "#c2412d";

export const COVER_ASPECT = BOOK.coverW / BOOK.coverH;

// The reel window on the front cover, in cover UV space (origin top-left).
export const COVER_WINDOW = { x: 0.075, y: 0.315, w: 0.85, h: 0.85 * (COVER_ASPECT / 2.12) };

const goldGradient = (ctx, x0, y0, x1, y1) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD[0]);
  g.addColorStop(0.35, GOLD[1]);
  g.addColorStop(0.55, GOLD[2]);
  g.addColorStop(0.75, GOLD[3]);
  g.addColorStop(1, GOLD[1]);
  return g;
};

// Fills `layers` (color/height/orm/emissive contexts) in lock-step.
const layered = (w, h) => {
  const make = () => {
    const canvas = makeCanvas(w, h);
    return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) };
  };
  return { color: make(), height: make(), orm: make(), emissive: make() };
};

// Linen: crossing threads with random tension, painted into colour and height.
const linen = (L, w, h, base, rand) => {
  const { color, height, orm, emissive } = L;
  color.ctx.fillStyle = base;
  color.ctx.fillRect(0, 0, w, h);
  height.ctx.fillStyle = "#808080";
  height.ctx.fillRect(0, 0, w, h);
  orm.ctx.fillStyle = "rgb(0, 214, 0)"; // no clearcoat, rough cloth, not metal
  orm.ctx.fillRect(0, 0, w, h);
  emissive.ctx.fillStyle = "#000";
  emissive.ctx.fillRect(0, 0, w, h);
  const pitch = Math.max(2, Math.round(w / 340));
  for (let y = 0; y < h; y += pitch) {
    const a = rand();
    color.ctx.fillStyle = `rgba(${a > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + rand() * 0.05})`;
    color.ctx.fillRect(0, y, w, pitch * 0.6);
    height.ctx.fillStyle = `rgba(255,255,255,${0.12 + rand() * 0.18})`;
    height.ctx.fillRect(0, y, w, pitch * 0.55);
  }
  for (let x = 0; x < w; x += pitch) {
    const a = rand();
    color.ctx.fillStyle = `rgba(${a > 0.5 ? "255,255,255" : "0,0,0"},${0.025 + rand() * 0.045})`;
    color.ctx.fillRect(x, 0, pitch * 0.6, h);
    height.ctx.fillStyle = `rgba(0,0,0,${0.08 + rand() * 0.16})`;
    height.ctx.fillRect(x, 0, pitch * 0.5, h);
  }
  // slubs: the odd thicker thread
  for (let i = 0; i < 180; i += 1) {
    const y = rand() * h;
    const x = rand() * w;
    const len = 20 + rand() * 120;
    color.ctx.fillStyle = "rgba(255,255,255,0.05)";
    color.ctx.fillRect(x, y, len, pitch);
    height.ctx.fillStyle = "rgba(255,255,255,0.25)";
    height.ctx.fillRect(x, y, len, pitch);
  }
};

// Paint one shape into every layer: `paint(ctx, layer)` draws the shape path.
const foil = (L, paint, bounds) => {
  const { color, height, orm, emissive } = L;
  color.ctx.save();
  color.ctx.fillStyle = goldGradient(color.ctx, bounds.x, bounds.y, bounds.x + bounds.w, bounds.y + bounds.h);
  color.ctx.strokeStyle = color.ctx.fillStyle;
  paint(color.ctx, "color");
  color.ctx.restore();
  height.ctx.save();
  height.ctx.fillStyle = height.ctx.strokeStyle = "#3a3a3a"; // stamped into the cloth
  paint(height.ctx, "height");
  height.ctx.restore();
  orm.ctx.save();
  orm.ctx.fillStyle = orm.ctx.strokeStyle = "rgb(255, 70, 255)"; // varnished, polished, metal
  paint(orm.ctx, "orm");
  orm.ctx.restore();
  emissive.ctx.save();
  emissive.ctx.fillStyle = emissive.ctx.strokeStyle = "#fff";
  paint(emissive.ctx, "emissive");
  emissive.ctx.restore();
};

// Spot varnish: glossy clear layer only (no colour change).
const varnish = (L, paint) => {
  L.orm.ctx.save();
  L.orm.ctx.fillStyle = L.orm.ctx.strokeStyle = "rgb(255, 90, 0)";
  paint(L.orm.ctx);
  L.orm.ctx.restore();
  L.height.ctx.save();
  L.height.ctx.fillStyle = L.height.ctx.strokeStyle = "rgba(255,255,255,0.35)";
  paint(L.height.ctx);
  L.height.ctx.restore();
};

export const heightToNormal = (source, strength = 2.2) => {
  const w = source.width;
  const h = source.height;
  const src = source.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext("2d");
  const img = octx.createImageData(w, h);
  const d = img.data;
  const at = (x, y) => src[((Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4)] / 255;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      d[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[o + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      d[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
};

const finish = (L, { normalStrength = 2.2 } = {}) => ({
  color: L.color.canvas,
  normal: heightToNormal(L.height.canvas, normalStrength),
  orm: L.orm.canvas,
  emissive: L.emissive.canvas
});

// Halftone dots in a darker shade of the cloth: the screentone art layer.
const clothTone = (ctx, x, y, w, h, spacing, coverageAt, color = EMERALD_DEEP) => {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  const c = Math.SQRT1_2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const reach = Math.hypot(w, h) / 2 + spacing;
  for (let a = -reach; a <= reach; a += spacing) {
    for (let b = -reach; b <= reach; b += spacing) {
      const px = cx + (a - b) * c;
      const py = cy + (a + b) * c;
      const cov = Math.min(0.9, Math.max(0, coverageAt((px - x) / w, (py - y) / h)));
      if (cov < 0.02) continue;
      const r = Math.sqrt(cov / Math.PI) * spacing;
      ctx.moveTo(px + r, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
};

// ── front cover ─────────────────────────────────────────────────────────────

export const renderCoverArt = (height = 1600) => {
  const H = Math.round(height);
  const W = Math.round(H * COVER_ASPECT);
  const u = H / 1000;
  const rand = seeded(2025);
  const L = layered(W, H);
  linen(L, W, H, EMERALD, rand);
  const { ctx } = L.color;

  // screentone art: a halftone sun rising behind the reel window
  const win = { x: COVER_WINDOW.x * W, y: COVER_WINDOW.y * H, w: COVER_WINDOW.w * W, h: COVER_WINDOW.h * H };
  clothTone(ctx, 0, 0, W, H, 13 * u, (nx, ny) => {
    const d = Math.hypot(nx - 0.5, (ny - 0.45) * 1.5);
    return d > 0.62 ? 0 : 0.55 * (1 - d / 0.62);
  });
  // focus lines radiating from the window, in deep green ink
  ctx.save();
  ctx.fillStyle = "rgba(4,30,22,0.55)";
  const fx = win.x + win.w / 2;
  const fy = win.y + win.h / 2;
  for (let i = 0; i < 90; i += 1) {
    const a = (i / 90) * Math.PI * 2 + rand() * 0.03;
    const s = 0.006 + rand() * 0.01;
    const r0 = win.w * (0.62 + rand() * 0.2);
    ctx.beginPath();
    ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0 * 0.75);
    ctx.lineTo(fx + Math.cos(a - s) * W * 1.4, fy + Math.sin(a - s) * W * 1.4);
    ctx.lineTo(fx + Math.cos(a + s) * W * 1.4, fy + Math.sin(a + s) * W * 1.4);
    ctx.fill();
  }
  ctx.restore();
  // bottom screentone band
  clothTone(ctx, 0, H * 0.74, W, H * 0.26, 10 * u, (nx, ny) => 0.1 + ny * 0.55);

  // title in gold foil
  const lines = ["DEVELOPER", "CHRONICLES"];
  const titleSize = Math.min(...lines.map((l) => fitSize(ctx, l, W * 0.86, 118 * u)));
  const titleY = [62 * u + titleSize * 0.88, 62 * u + titleSize * 1.9];
  foil(
    L,
    (c) => {
      c.font = font(titleSize);
      c.textAlign = "left";
      lines.forEach((line, i) => c.fillText(line, W * 0.07, titleY[i]));
    },
    { x: W * 0.07, y: 40 * u, w: W * 0.86, h: titleSize * 2 }
  );
  // thin foil rules
  foil(
    L,
    (c) => {
      c.fillRect(W * 0.07, 38 * u, W * 0.86, 4 * u);
      c.fillRect(W * 0.07, titleY[1] + 22 * u, W * 0.86, 4 * u);
    },
    { x: 0, y: 0, w: W, h: H * 0.3 }
  );

  // reel window frame: ink border with a foil keyline (video plays inside)
  ctx.save();
  ctx.fillStyle = INK;
  ctx.fillRect(win.x - 12 * u, win.y - 12 * u, win.w + 24 * u, win.h + 24 * u);
  ctx.fillStyle = "#0a0f0c";
  ctx.fillRect(win.x, win.y, win.w, win.h);
  ctx.restore();
  foil(
    L,
    (c) => {
      c.lineWidth = 3 * u;
      c.strokeRect(win.x - 6 * u, win.y - 6 * u, win.w + 12 * u, win.h + 12 * u);
    },
    win
  );

  // "What am I?" balloon breaks out over the reel window, so it is printed on
  // its own transparent sheet that sits above the video plane.
  const bubble = { x: win.x + win.w * 0.76, y: win.y - 4 * u, rx: 150 * u, ry: 60 * u };
  const pad = 10 * u;
  const box = {
    x: bubble.x - bubble.rx * 1.05 - pad,
    y: bubble.y - bubble.ry - pad,
    w: bubble.rx * 2.1 + pad * 2,
    h: bubble.ry * 3.2 + pad * 2
  };
  const bubbleCanvas = makeCanvas(box.w, box.h);
  const bctx = bubbleCanvas.getContext("2d");
  bctx.translate(-box.x, -box.y);
  bctx.beginPath();
  bctx.ellipse(bubble.x, bubble.y, bubble.rx, bubble.ry, -0.05, 0, Math.PI * 2);
  bctx.moveTo(bubble.x - bubble.rx * 0.42, bubble.y + bubble.ry * 0.6);
  bctx.lineTo(bubble.x - bubble.rx * 0.78, bubble.y + bubble.ry * 2.15);
  bctx.lineTo(bubble.x - bubble.rx * 0.08, bubble.y + bubble.ry * 0.86);
  bctx.closePath();
  bctx.fillStyle = PAPER;
  bctx.fill();
  bctx.lineWidth = 5 * u;
  bctx.strokeStyle = INK;
  bctx.stroke();
  bctx.beginPath();
  bctx.ellipse(bubble.x, bubble.y, bubble.rx - 3 * u, bubble.ry - 3 * u, -0.05, 0, Math.PI * 2);
  bctx.fill();
  bctx.font = font(44 * u, "bubble", "700");
  bctx.fillStyle = INK;
  bctx.textAlign = "center";
  bctx.textBaseline = "middle";
  bctx.fillText(portfolio.tagline.toUpperCase(), bubble.x, bubble.y + 2 * u);

  // name and role
  const nameY = win.y + win.h + 112 * u;
  const nameSize = fitSize(ctx, portfolio.name, W * 0.86, 84 * u);
  ctx.save();
  ctx.font = font(nameSize);
  ctx.fillStyle = PAPER;
  ctx.textAlign = "left";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowOffsetY = 3 * u;
  ctx.fillText(portfolio.name, W * 0.07, nameY);
  ctx.restore();
  varnish(L, (c) => {
    c.font = font(nameSize);
    c.fillText(portfolio.name, W * 0.07, nameY);
  });
  ctx.save();
  ctx.font = font(25 * u, "ui", "500");
  ctx.fillStyle = "rgba(236,229,211,0.86)";
  wrapText(ctx, portfolio.role, W * 0.6).forEach((line, i) => ctx.fillText(line, W * 0.07, nameY + 50 * u + i * 34 * u));
  ctx.restore();

  // VOL. 01 roundel in foil
  const vx = W * 0.8;
  const vy = H * 0.86;
  const vr = 74 * u;
  foil(
    L,
    (c) => {
      c.beginPath();
      c.arc(vx, vy, vr, 0, Math.PI * 2);
      c.lineWidth = 5 * u;
      c.stroke();
      c.beginPath();
      c.arc(vx, vy, vr - 11 * u, 0, Math.PI * 2);
      c.lineWidth = 2 * u;
      c.stroke();
      c.font = font(22 * u, "ui", "700");
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("VOL.", vx, vy - 26 * u);
      c.font = font(58 * u);
      c.fillText("01", vx, vy + 16 * u);
    },
    { x: vx - vr, y: vy - vr, w: vr * 2, h: vr * 2 }
  );

  return {
    ...finish(L),
    window: COVER_WINDOW,
    balloon: { canvas: bubbleCanvas, rect: [box.x / W, box.y / H, box.w / W, box.h / H] }
  };
};

// ── spine ───────────────────────────────────────────────────────────────────

export const renderSpineArt = (height = 1600) => {
  const H = Math.round(height);
  const W = Math.max(64, Math.round((H * BOOK.totalT) / BOOK.coverH));
  const u = H / 1000;
  const rand = seeded(77);
  const L = layered(W, H);
  linen(L, W, H, EMERALD, rand);
  const { ctx } = L.color;
  // rounded-spine shading
  const shade = ctx.createLinearGradient(0, 0, W, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.35)");
  shade.addColorStop(0.5, "rgba(255,255,255,0.04)");
  shade.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  foil(
    L,
    (c) => {
      [26, 34, H / u - 38, H / u - 30].forEach((y) => c.fillRect(W * 0.08, y * u, W * 0.84, 3.5 * u));
      c.beginPath();
      c.arc(W / 2, 92 * u, W * 0.36, 0, Math.PI * 2);
      c.lineWidth = 3 * u;
      c.stroke();
      c.font = font(W * 0.36);
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("01", W / 2, 94 * u);
      // 開発者クロニクル set vertically
      const size = W * 0.5;
      c.font = font(size);
      [..."開発者クロニクル"].forEach((ch, i) => c.fillText(ch, W / 2, 190 * u + i * size * 1.06));
      c.fillRect(W * 0.2, 190 * u + 8 * size * 1.06, W * 0.6, 3 * u);
    },
    { x: 0, y: 0, w: W, h: H }
  );
  // author name runs down the spine, Latin rotated
  ctx.save();
  ctx.translate(W / 2, H * 0.73);
  ctx.rotate(Math.PI / 2);
  const nameSize = fitSize(ctx, portfolio.name.toUpperCase(), H * 0.34, W * 0.34, "ui", "700");
  ctx.font = font(nameSize, "ui", "700");
  ctx.fillStyle = PAPER;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(portfolio.name.toUpperCase(), 0, 0);
  ctx.restore();
  return finish(L, { normalStrength: 1.6 });
};

// ── back cover ──────────────────────────────────────────────────────────────

export const BACK_SEALS = [
  { key: "github", kanji: "開拓", label: "GitHub", href: portfolio.links.github },
  { key: "linkedin", kanji: "接続", label: "LinkedIn", href: portfolio.links.linkedin },
  { key: "leetcode", kanji: "挑戦", label: "LeetCode", href: portfolio.links.leetcode },
  { key: "email", kanji: "伝令", label: "Email", href: portfolio.links.email }
].filter((seal) => seal.href);

export const renderBackCoverArt = (height = 1600) => {
  const H = Math.round(height);
  const W = Math.round(H * COVER_ASPECT);
  const u = H / 1000;
  const rand = seeded(404);
  const L = layered(W, H);
  linen(L, W, H, EMERALD, rand);
  const { ctx } = L.color;
  clothTone(ctx, 0, 0, W, H * 0.5, 11 * u, (nx, ny) => 0.42 - ny * 0.4);

  // author plate: the formal portrait printed in deep green ink on washi
  const plate = { x: W * 0.2, y: 70 * u, w: W * 0.6, h: H * 0.36 };
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
  const portrait = portfolio.media?.photos?.portrait;
  const inked = portrait && getImage(portrait) ? inkPhoto(portrait, plate.w, plate.h, { focus: [0.5, 0.36], tone: "normal", ink: [6, 41, 30] }) : null;
  if (inked) ctx.drawImage(inked, plate.x, plate.y, plate.w, plate.h);
  ctx.restore();
  foil(
    L,
    (c) => {
      c.lineWidth = 5 * u;
      c.strokeRect(plate.x - 10 * u, plate.y - 10 * u, plate.w + 20 * u, plate.h + 20 * u);
    },
    plate
  );

  // title line and name
  const titleY = plate.y + plate.h + 80 * u;
  const title = "DEVELOPER CHRONICLES // VOL 01";
  const titleSize = fitSize(ctx, title, W * 0.84, 40 * u);
  foil(
    L,
    (c) => {
      c.font = font(titleSize);
      c.textAlign = "center";
      c.fillText(title, W / 2, titleY);
    },
    { x: 0, y: titleY - 40 * u, w: W, h: 50 * u }
  );
  ctx.save();
  const nameSize = fitSize(ctx, portfolio.name, W * 0.8, 46 * u, "display");
  ctx.font = font(nameSize);
  ctx.fillStyle = PAPER;
  ctx.textAlign = "center";
  ctx.fillText(portfolio.name, W / 2, titleY + 62 * u);
  ctx.restore();

  // four hanko seals
  const sealSize = 120 * u;
  const gap = (W * 0.84 - sealSize * BACK_SEALS.length) / Math.max(1, BACK_SEALS.length - 1);
  const sealY = H * 0.74;
  const seals = BACK_SEALS.map((seal, i) => {
    const x = W * 0.08 + i * (sealSize + gap);
    const tilt = (rand() - 0.5) * 0.12;
    ctx.save();
    ctx.translate(x + sealSize / 2, sealY + sealSize / 2);
    ctx.rotate(tilt);
    ctx.fillStyle = SHU;
    ctx.fillRect(-sealSize / 2, -sealSize / 2, sealSize, sealSize);
    ctx.strokeStyle = "#f1e6d6";
    ctx.lineWidth = 3 * u;
    ctx.strokeRect(-sealSize / 2 + 8 * u, -sealSize / 2 + 8 * u, sealSize - 16 * u, sealSize - 16 * u);
    ctx.fillStyle = "#f6ece0";
    ctx.font = font(sealSize * 0.36);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const [a, b] = [...seal.kanji];
    // seals read right column first, top to bottom
    ctx.fillText(a, 0, -sealSize * 0.19);
    ctx.fillText(b, 0, sealSize * 0.21);
    // ink-starved patches
    ctx.fillStyle = "rgba(13,90,66,0.55)";
    for (let k = 0; k < 140; k += 1) {
      ctx.fillRect((rand() - 0.5) * sealSize, (rand() - 0.5) * sealSize, (1 + rand() * 3) * u, (1 + rand() * 2) * u);
    }
    ctx.restore();
    ctx.save();
    ctx.font = font(19 * u, "ui", "700");
    ctx.fillStyle = PAPER;
    ctx.textAlign = "center";
    ctx.fillText(seal.label, x + sealSize / 2, sealY + sealSize + 34 * u);
    ctx.restore();
    varnish(L, (c) => c.fillRect(x, sealY, sealSize, sealSize));
    return { ...seal, rect: [x / W, sealY / H, sealSize / W, (sealSize + 46 * u) / H] };
  });

  return { ...finish(L), seals };
};

// ── page block edges ────────────────────────────────────────────────────────

export const renderPageEdges = () => {
  const canvas = makeCanvas(64, 512);
  const ctx = canvas.getContext("2d");
  const rand = seeded(9);
  ctx.fillStyle = "#ede6d4";
  ctx.fillRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 2) {
    ctx.fillStyle = `rgba(90,70,40,${0.05 + rand() * 0.12})`;
    ctx.fillRect(0, y, 64, 1);
  }
  return canvas;
};

// ── library ─────────────────────────────────────────────────────────────────

const SPINE_COLORS = [
  "#5a1f1f", "#1d2a44", "#8a6a2a", "#3c4650", "#2a2623", "#9b7b55", "#3e2638", "#2f4548",
  "#7a3b22", "#cdbf9f", "#1a1716", "#4a4630", "#44546a", "#4b1d2a", "#b59b6e", "#6b5844"
];
export const ATLAS_CELLS = SPINE_COLORS.length;
export const atlasColor = (i) => SPINE_COLORS[i % SPINE_COLORS.length];

export const renderShelfAtlas = () => {
  const cellW = 128;
  const H = 1024;
  const canvas = makeCanvas(cellW * ATLAS_CELLS, H);
  const ctx = canvas.getContext("2d");
  const rand = seeded(1337);
  SPINE_COLORS.forEach((base, i) => {
    const x0 = i * cellW;
    ctx.fillStyle = base;
    ctx.fillRect(x0, 0, cellW, H);
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + rand() * 0.04})`;
      ctx.fillRect(x0, y, cellW, 1);
    }
    const light = parseInt(base.slice(1, 3), 16) > 150;
    const accent = light ? "#2a2018" : rand() > 0.45 ? "#c6a35a" : "#d9cdb2";
    ctx.fillStyle = accent;
    const bands = 1 + Math.floor(rand() * 3);
    for (let b = 0; b < bands; b += 1) {
      ctx.fillRect(x0 + 10, 40 + b * 14, cellW - 20, 4);
      ctx.fillRect(x0 + 10, H - 44 - b * 14, cellW - 20, 4);
    }
    const style = Math.floor(rand() * 4);
    if (style === 0) {
      ctx.fillStyle = light ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)";
      ctx.fillRect(x0 + 18, 160, cellW - 36, 300);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 + 18, 160, cellW - 36, 300);
    } else if (style === 1) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x0 + cellW / 2, 230, 34, 0, Math.PI * 2);
      ctx.stroke();
    } else if (style === 2) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x0, 300, cellW, 120);
    }
    // abstract title marks (no readable words)
    ctx.fillStyle = accent;
    const marks = 4 + Math.floor(rand() * 6);
    for (let m = 0; m < marks; m += 1) {
      const w = 14 + rand() * 40;
      ctx.fillRect(x0 + cellW / 2 - w / 2, 520 + m * 30, w, 12);
    }
    const shade = ctx.createLinearGradient(x0, 0, x0 + cellW, 0);
    shade.addColorStop(0, "rgba(0,0,0,0.4)");
    shade.addColorStop(0.3, "rgba(0,0,0,0)");
    shade.addColorStop(0.7, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = shade;
    ctx.fillRect(x0, 0, cellW, H);
  });
  return canvas;
};

export const renderWood = (w = 1024, h = 256, seed = 3) => {
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  const rand = seeded(seed);
  ctx.fillStyle = "#3b2416";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i += 1) {
    const y0 = rand() * h;
    const amp = 2 + rand() * 7;
    const freq = 0.002 + rand() * 0.006;
    const phase = rand() * Math.PI * 2;
    ctx.strokeStyle = rand() > 0.5 ? `rgba(20,10,5,${0.15 + rand() * 0.25})` : `rgba(120,80,45,${0.08 + rand() * 0.15})`;
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1) * amp * 0.25;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return canvas;
};

export const renderWall = () => {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext("2d");
  const rand = seeded(88);
  ctx.fillStyle = "#211a16";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? "255,230,200" : "0,0,0"},${0.008 + rand() * 0.014})`;
    const r = 4 + rand() * 30;
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,220,170,0.035)";
  ctx.lineWidth = 2;
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  return canvas;
};

export const renderDustSprite = () => {
  const canvas = makeCanvas(64, 64);
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,240,215,1)");
  g.addColorStop(0.35, "rgba(255,230,200,0.45)");
  g.addColorStop(1, "rgba(255,230,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return canvas;
};
