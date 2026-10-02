// Little synthesised UI sounds for Act I: pops, boops, a happy chirp, noms,
// a camera shutter, sparkles. Cute on purpose (and nothing to license).

export class CuteSfx {
  /** @param {AudioContext} ctx @param {AudioNode} destination */
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(destination);
    const n = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
  }

  _tone(f0, f1, dur, { type = "sine", gain = 0.3, delay = 0 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, f, { gain = 0.2, delay = 0, type = "bandpass", q = 1 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(this.out);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  pop() { this._tone(500, 1400, 0.09, { gain: 0.25 }); }
  boop(pitch = 1) { this._tone(700 * pitch, 980 * pitch, 0.12, { type: "triangle", gain: 0.22 }); }
  chirp() { [0, 0.08, 0.16].forEach((d, i) => this._tone(880 * (1 + i * 0.26), 1320 * (1 + i * 0.26), 0.09, { gain: 0.18, delay: d })); }
  sad() { this._tone(620, 360, 0.5, { type: "triangle", gain: 0.18 }); }
  nom() { this._tone(260, 160, 0.08, { type: "square", gain: 0.07 }); this._noise(0.06, 900, { gain: 0.12, q: 2 }); }
  sparkle() { [0, 0.05, 0.1, 0.15, 0.2].forEach((d) => this._tone(1800 + Math.random() * 1600, 2600 + Math.random() * 1200, 0.12, { gain: 0.07, delay: d })); }
  shutter() {
    this._noise(0.035, 3500, { gain: 0.5, q: 0.7 });
    this._noise(0.05, 1800, { gain: 0.35, q: 1.2, delay: 0.07 });
    this._tone(180, 90, 0.05, { type: "square", gain: 0.06, delay: 0.07 });
  }
  tick() { this._tone(1500, 1400, 0.04, { gain: 0.12 }); }
}
