// The player's own face, mutilated, for a fraction of a second.
//
// Takes the live webcam frame + the FaceLandmarker keypoints and paints
// wounds where they belong on THIS face: hollow eye sockets weeping blood,
// a Glasgow smile cut out from the mouth corners, a stitched-shut mouth, a
// forehead gash. A procedural flesh texture fills the wounds; the skin gets
// a corpse grade. Each flash picks a different combination.
//
// Coordinates: keypoints are normalized, in the camera's unmirrored space.
// The canvas is mirrored with CSS (like the feed), so it reads as a mirror.

import { settings } from "../settings.js";

const W = 640;

export class FaceGore {
  /** @param {HTMLCanvasElement} canvas full-screen #face-gore */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this._timer = null;
    this._flesh = null;
    this._lastKinds = "";
  }

  /**
   * Render a gore version of `source` into `target` (defaults to the flash canvas).
   * @param {CanvasImageSource} source video or canvas (unmirrored)
   * @param {object} kp keypoints from FaceTracker
   * @param {{kinds?: string[], target?: HTMLCanvasElement, sourceW?: number, sourceH?: number}} o
   * @returns {boolean}
   */
  render(source, kp, { kinds = null, target = this.canvas, sourceW, sourceH } = {}) {
    if (!kp || !source) return false;
    const sw = sourceW || source.videoWidth || source.width, sh = sourceH || source.videoHeight || source.height;
    if (!sw || !sh) return false;
    const H = Math.round((W * sh) / sw);
    target.width = W;
    target.height = H;
    const g = target.getContext("2d", { willReadFrequently: true });
    g.drawImage(source, 0, 0, W, H);
    corpseGrade(g, W, H);

    const P = (pt) => ({ x: pt.x * W, y: pt.y * H });
    const f = {
      le: { c: P({ x: kp.leftEye.cx, y: kp.leftEye.cy }), a: P(kp.leftEye.a), b: P(kp.leftEye.b), open: kp.leftEye.openness * H },
      re: { c: P({ x: kp.rightEye.cx, y: kp.rightEye.cy }), a: P(kp.rightEye.a), b: P(kp.rightEye.b), open: kp.rightEye.openness * H },
      mL: P(kp.mouthL), mR: P(kp.mouthR), lt: P(kp.lipTop), lb: P(kp.lipBottom),
      chin: P(kp.chin), fh: P(kp.forehead), cL: P(kp.cheekL), cR: P(kp.cheekR), nose: P(kp.nose)
    };
    f.faceW = dist(f.cL, f.cR);
    f.faceH = dist(f.fh, f.chin);
    const flesh = g.createPattern(this._fleshTexture(), "repeat");

    const pickKinds = kinds || this._pick();
    for (const k of pickKinds) WOUNDS[k]?.(g, f, flesh);
    spatter(g, f, 18 + Math.random() * 20);
    finish(g, W, H);
    return true;
  }

  /** Render and flash it full screen. */
  flash(source, kp, ms = 150) {
    if (!this.render(source, kp)) return false;
    const el = this.canvas;
    const calm = settings.reduceFlashing;
    el.classList.toggle("calm", calm);
    el.classList.add("show");
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove("show"), calm ? Math.max(ms, 650) : ms);
    return true;
  }

  _pick() {
    const sets = [
      ["eyes"], ["smile"], ["stitch"], ["eyes", "smile"], ["eyes", "stitch"], ["gash", "smile"], ["gash", "eyes"], ["eyes", "smile", "gash"]
    ];
    let s;
    do s = sets[Math.floor(Math.random() * sets.length)]; while (s.join() === this._lastKinds && sets.length > 1);
    this._lastKinds = s.join();
    return s;
  }

  /** Raw flesh: fbm noise mapped through a deep-red ramp, wet highlights, dark crevices. */
  _fleshTexture() {
    if (this._flesh) return this._flesh;
    const N = 256, c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), d = img.data;
    const ramp = [[0, [16, 0, 2]], [0.35, [60, 6, 12]], [0.6, [125, 18, 24]], [0.82, [178, 52, 52]], [1, [214, 112, 104]]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = fbm(x / 26, y / 26) * 0.75 + fbm(x / 7, y / 9) * 0.25;
      const fib = Math.abs(Math.sin((x * 0.35 + fbm(x / 40, y / 40) * 9) )); // muscle fibre streaks
      v = Math.min(1, Math.max(0, v * 0.85 + fib * 0.18 - 0.05));
      const col = rampAt(ramp, v);
      const wet = fbm(x / 5 + 40, y / 5) > 0.78 ? 70 : 0;
      const i = (y * N + x) * 4;
      d[i] = Math.min(255, col[0] + wet);
      d[i + 1] = Math.min(255, col[1] + wet * 0.6);
      d[i + 2] = Math.min(255, col[2] + wet * 0.6);
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this._flesh = c;
    return c;
  }
}

// ---------------------------------------------------------------- wounds

const WOUNDS = {
  /** Hollow sockets, ragged rims of flesh, blood tears down the cheeks. */
  eyes(g, f, flesh) {
    for (const e of [f.le, f.re]) {
      const ew = dist(e.a, e.b);
      const rx = ew * 0.72, ry = Math.max(e.open * 1.4, ew * 0.48);
      const ang = Math.atan2(e.b.y - e.a.y, e.b.x - e.a.x);
      // bruised, swollen, blood-soaked surround
      bruise(g, e.c.x, e.c.y + ry * 0.25, rx * 2.3, ry * 2.6, "95,30,60", 0.75);
      bruise(g, e.c.x, e.c.y + ry * 0.9, rx * 1.5, ry * 2.2, "170,30,35", 0.6);
      // torn flesh rim
      g.save();
      raggedEllipse(g, e.c.x, e.c.y, rx * 1.18, ry * 1.25, ang, 0.18);
      g.fillStyle = flesh;
      g.globalAlpha = 0.95;
      g.fill();
      g.restore();
      // the hole
      g.save();
      raggedEllipse(g, e.c.x, e.c.y + ry * 0.05, rx, ry, ang, 0.12);
      g.clip();
      radial(g, e.c.x, e.c.y, Math.max(rx, ry) * 1.1, [[0, "#000"], [0.55, "#050001"], [0.85, "#2a0206"], [1, "#4a0a0e"]]);
      g.restore();
      // wet glint deep inside
      g.fillStyle = "rgba(255,210,210,0.18)";
      g.beginPath();
      g.ellipse(e.c.x - rx * 0.3, e.c.y - ry * 0.35, rx * 0.12, ry * 0.08, ang, 0, Math.PI * 2);
      g.fill();
      // tears of blood
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const sx = e.c.x + (Math.random() - 0.5) * rx * 1.1;
        drip(g, sx, e.c.y + ry * 0.7, f.faceH * (0.12 + Math.random() * 0.5), ew * (0.1 + Math.random() * 0.12));
      }
    }
  },

  /** Cuts carved from the mouth corners up towards the ears. */
  smile(g, f, flesh) {
    const mw = dist(f.mL, f.mR);
    for (const [corner, cheek] of [[f.mL, f.cL, -1], [f.mR, f.cR, 1]]) {
      const end = { x: corner.x + (cheek.x - corner.x) * 0.82, y: corner.y - f.faceH * 0.16 };
      const ctrl = { x: corner.x + (cheek.x - corner.x) * 0.45, y: corner.y + f.faceH * 0.02 };
      const w0 = mw * 0.16;
      bruise(g, ctrl.x, ctrl.y, dist(corner, end) * 0.75, w0 * 4, "150,35,45", 0.55);
      // tapered gash: two quadratic edges meeting at the end
      g.beginPath();
      g.moveTo(corner.x, corner.y - w0 * 0.6);
      g.quadraticCurveTo(ctrl.x, ctrl.y - w0 * 0.9, end.x, end.y);
      g.quadraticCurveTo(ctrl.x, ctrl.y + w0 * 0.9, corner.x, corner.y + w0 * 0.6);
      g.closePath();
      g.fillStyle = flesh;
      g.fill();
      g.lineWidth = Math.max(1.5, w0 * 0.22);
      g.strokeStyle = "rgba(235,200,190,0.45)"; // torn skin edge catching the light
      g.stroke();
      // dark split down the middle
      g.beginPath();
      g.moveTo(corner.x, corner.y);
      g.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
      g.lineWidth = Math.max(1, w0 * 0.4);
      g.strokeStyle = "rgba(8,0,1,0.95)";
      g.stroke();
      // blood running down from the cut
      for (let i = 0; i < 2; i++) {
        const t = 0.15 + Math.random() * 0.7;
        const x = lerp(corner.x, end.x, t), y = lerp(corner.y, end.y, t) + w0 * 0.5;
        drip(g, x, y, f.faceH * (0.12 + Math.random() * 0.35), w0 * (0.5 + Math.random() * 0.4));
      }
    }
    // lips torn darker
    radial(g, (f.mL.x + f.mR.x) / 2, (f.lt.y + f.lb.y) / 2, mw * 0.6, [[0, "rgba(40,0,6,0.7)"], [1, "rgba(40,0,6,0)"]]);
  },

  /** Mouth sewn shut with black thread, punctures weeping. */
  stitch(g, f) {
    const mw = dist(f.mL, f.mR);
    const n = 7;
    radial(g, (f.mL.x + f.mR.x) / 2, (f.lt.y + f.lb.y) / 2, mw * 0.75, [[0, "rgba(70,10,40,0.55)"], [1, "rgba(70,10,40,0)"]]);
    // lips pressed into one line
    g.beginPath();
    g.moveTo(f.mL.x, f.mL.y);
    g.quadraticCurveTo((f.lt.x + f.lb.x) / 2, (f.lt.y + f.lb.y) / 2, f.mR.x, f.mR.y);
    g.lineWidth = Math.max(2, mw * 0.05);
    g.strokeStyle = "rgba(30,0,6,0.9)";
    g.stroke();
    const top = (f.lt.y - f.lb.y) * 0.9 - mw * 0.12, bot = (f.lb.y - f.lt.y) * 0.9 + mw * 0.12;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = lerp(f.mL.x, f.mR.x, t), y = lerp(f.mL.y, f.mR.y, t);
      const a = { x: x - mw * 0.03, y: y + top }, b = { x: x + mw * 0.03, y: y + bot };
      for (const p of [a, b]) radial(g, p.x, p.y, mw * 0.045, [[0, "rgba(90,0,8,0.95)"], [1, "rgba(90,0,8,0)"]]);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.moveTo(b.x - mw * 0.06, a.y + mw * 0.01);
      g.lineTo(a.x + mw * 0.06, b.y - mw * 0.01);
      g.lineWidth = Math.max(1.5, mw * 0.025);
      g.strokeStyle = "#0a0505";
      g.stroke();
      if (Math.random() < 0.5) drip(g, b.x, b.y, f.faceH * (0.06 + Math.random() * 0.18), mw * 0.035);
    }
  },

  /** A ragged slash across the forehead, bleeding into the brows. */
  gash(g, f, flesh) {
    const cx = f.fh.x, cy = f.fh.y + f.faceH * 0.12;
    const half = f.faceW * 0.32, w = f.faceH * 0.035;
    const tilt = (Math.random() - 0.5) * 0.25;
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, x = cx - half + t * half * 2;
      pts.push({ x, y: cy + (x - cx) * tilt + (Math.random() - 0.5) * w * 0.6, w: w * Math.sin(Math.PI * t) * (0.7 + Math.random() * 0.5) });
    }
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y - p.w) : g.moveTo(p.x, p.y - p.w)));
    for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i].x, pts[i].y + pts[i].w);
    g.closePath();
    g.fillStyle = flesh;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = "rgba(20,0,2,0.9)";
    g.stroke();
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.lineWidth = Math.max(1, w * 0.35);
    g.strokeStyle = "rgba(5,0,0,0.95)";
    g.stroke();
    bruise(g, cx, cy + w, half * 1.2, w * 5, "150,35,45", 0.55);
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
      const p = pts[2 + Math.floor(Math.random() * 11)];
      drip(g, p.x, p.y + p.w * 0.5, f.faceH * (0.1 + Math.random() * 0.4), w * (0.5 + Math.random() * 0.5));
    }
  }
};

// ---------------------------------------------------------------- painting helpers

/** One run of blood: a soft stain soaking the skin, a darker rivulet on top, a wet glint. */
function drip(g, x, y, len, w) {
  const steps = 14, pts = [];
  let px = x, drift = (Math.random() - 0.5) * w * 0.25;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    px += drift + (Math.random() - 0.5) * w * 0.35;
    pts.push({ x: px, y: y + t * len, w: w * (1 - t * 0.6) * (0.8 + Math.random() * 0.4) });
  }
  g.save();
  g.globalCompositeOperation = "multiply";
  // stain: wide, faint, soaks into the skin texture
  for (const p of pts) radial(g, p.x, p.y, p.w * 2.2, [[0, "rgba(150,40,45,0.35)"], [1, "rgba(150,40,45,0)"]]);
  // rivulet
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x - p.w / 2, p.y) : g.moveTo(p.x - p.w / 2, p.y)));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i].x + pts[i].w / 2, pts[i].y);
  g.closePath();
  g.fillStyle = "rgb(120,8,16)";
  g.fill();
  const end = pts[pts.length - 1];
  g.beginPath();
  g.ellipse(end.x, end.y, end.w * 0.8, end.w * 1.1, 0, 0, Math.PI * 2);
  g.fill();
  // darker core
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x + p.w * 0.1, p.y) : g.moveTo(p.x + p.w * 0.1, p.y)));
  g.lineWidth = Math.max(0.8, w * 0.35);
  g.strokeStyle = "rgb(90,0,8)";
  g.stroke();
  g.restore();
  // wet glint
  g.save();
  g.globalCompositeOperation = "screen";
  g.beginPath();
  pts.slice(1, -2).forEach((p, i) => (i ? g.lineTo(p.x - p.w * 0.22, p.y) : g.moveTo(p.x - p.w * 0.22, p.y)));
  g.lineWidth = Math.max(0.6, w * 0.12);
  g.strokeStyle = "rgba(255,150,150,0.28)";
  g.stroke();
  g.restore();
}

/** Bruising / soaked skin around a wound (multiplied so the skin texture stays). */
function bruise(g, x, y, rx, ry, color = "120,40,70", a = 0.6) {
  g.save();
  g.globalCompositeOperation = "multiply";
  g.translate(x, y);
  g.scale(1, ry / rx);
  radial(g, 0, 0, rx, [[0, `rgba(${color},${a})`], [0.6, `rgba(${color},${a * 0.5})`], [1, `rgba(${color},0)`]]);
  g.restore();
}

function spatter(g, f, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = f.faceW * (0.25 + Math.random() * 0.6);
    const x = f.nose.x + Math.cos(a) * r, y = f.nose.y + Math.sin(a) * r * 1.2;
    const s = f.faceW * (0.004 + Math.random() * 0.014);
    g.fillStyle = `rgba(${70 + Math.random() * 40},0,6,${0.6 + Math.random() * 0.35})`;
    g.beginPath();
    g.ellipse(x, y, s, s * (0.7 + Math.random() * 0.6), a, 0, Math.PI * 2);
    g.fill();
  }
}

function raggedEllipse(g, cx, cy, rx, ry, ang, jag) {
  const n = 28;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, k = 1 + (Math.random() - 0.5) * jag * 2;
    const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
    const X = cx + x * Math.cos(ang) - y * Math.sin(ang), Y = cy + x * Math.sin(ang) + y * Math.cos(ang);
    i ? g.lineTo(X, Y) : g.moveTo(X, Y);
  }
  g.closePath();
}

function radial(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Drained, greenish, high-contrast skin. */
function corpseGrade(g, w, h) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    const l = r * 0.299 + gg * 0.587 + b * 0.114;
    r = l * 0.55 + r * 0.45; gg = l * 0.55 + gg * 0.45; b = l * 0.55 + b * 0.45;
    r = (r - 128) * 1.35 + 118; gg = (gg - 128) * 1.35 + 124; b = (b - 128) * 1.35 + 112;
    d[i] = r * 0.8; d[i + 1] = gg * 0.84; d[i + 2] = b * 0.76;
  }
  g.putImageData(img, 0, 0);
}

function finish(g, w, h) {
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(20,0,0,0.85)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function rampAt(ramp, v) {
  for (let i = 1; i < ramp.length; i++) {
    if (v <= ramp[i][0]) {
      const [a, ca] = ramp[i - 1], [b, cb] = ramp[i], t = (v - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return ramp[ramp.length - 1][1];
}

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash(ix, iy), hash(ix + 1, iy), u), lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}
function fbm(x, y) {
  let a = 0.5, s = 0;
  for (let i = 0; i < 4; i++) { s += a * noise(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return s;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lerp(a, b, t) { return a + (b - a) * t; }
