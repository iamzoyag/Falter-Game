// A low-res field of white specks over everything, redrawn ~12 times a
// second and scaled up with hard pixel edges — the whole game looks like a
// bad photocopy of itself.
const W = 192, H = 108;

export class NoiseOverlay {
  /** @param {HTMLCanvasElement} canvas the #noise-overlay canvas */
  constructor(canvas, density = 0.035) {
    this.canvas = canvas;
    canvas.width = W;
    canvas.height = H;
    this.ctx = canvas.getContext("2d");
    this.img = this.ctx.createImageData(W, H);
    this.density = density;
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 255;
    this._tick();
  }

  _tick() {
    const d = this.img.data;
    for (let i = 3; i < d.length; i += 4) d[i] = Math.random() < this.density ? 255 : 0;
    this.ctx.putImageData(this.img, 0, 0);
    setTimeout(() => requestAnimationFrame(() => this._tick()), 80);
  }
}