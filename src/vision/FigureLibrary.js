import { FIGURE_URLS } from "../config.js";
import { MASK_SIZE } from "./Segmenter.js";

// Figures to composite behind the player. Two sources:
//  1. Cut-out PNGs you add to /public/figures — pre-darkened,
//     desaturated and stretched here so they sit in a dim webcam image.
//  2. Fallback: the player's OWN silhouette from calibration, blacked out,
//     stretched taller and thinner. It's lit and shaped like a real person in
//     their real room, which is exactly why it works.
export class FigureLibrary {
  constructor() {
    this.figures = []; // canvases with alpha
  }

  async loadImages() {
    const results = await Promise.all(FIGURE_URLS.map((url) => loadImage(url).catch(() => null)));
    for (const img of results) if (img) this.figures.push(processImage(img));
    return this.figures.length;
  }

  /** Build a silhouette from a segmentation mask (Uint8Array MASK_SIZE²). */
  addSilhouette(mask) {
    if (!mask) return;
    const S = MASK_SIZE;
    let minX = S, minY = S, maxX = 0, maxY = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (mask[y * S + x] > 128) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX - minX < 10 || maxY - minY < 10) return;

    const src = document.createElement("canvas");
    src.width = S; src.height = S;
    const sctx = src.getContext("2d");
    const img = sctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      img.data[i * 4] = 8; img.data[i * 4 + 1] = 7; img.data[i * 4 + 2] = 8;
      img.data[i * 4 + 3] = mask[i] > 90 ? Math.min(255, mask[i] * 1.2) : 0;
    }
    sctx.putImageData(img, 0, 0);

    const bw = maxX - minX, bh = maxY - minY;
    const out = document.createElement("canvas");
    out.width = 256; out.height = 512;
    const ctx = out.getContext("2d");
    ctx.filter = "blur(3px)";
    // thinner and much taller than the player: wrong proportions read as "not a person"
    const drawW = 256 * 0.72;
    ctx.translate(128, 0);
    ctx.rotate(-0.04);
    ctx.drawImage(src, minX, minY, bw, bh, -drawW / 2, 20, drawW, 480);
    this.figures.push(out);
  }

  random() {
    return this.figures.length ? this.figures[Math.floor(Math.random() * this.figures.length)] : null;
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function processImage(img) {
  const H = 512;
  const W = Math.round((img.width / img.height) * H * 0.85); // slightly too thin
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.filter = "grayscale(1) brightness(1.05) contrast(1.35) blur(0.6px)";
  ctx.drawImage(img, 0, 0, W, H);
  c.pale = true; // lit like a ghost, not a shadow
  ctx.drawImage(img, 0, 0, W, H);
  return c;
}