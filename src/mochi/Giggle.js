// Mochi's giggle. Every now and then, when she's talking to you, she giggles.
//
// It's the same handful of recorded giggles all game (public/audio/giggle/).
// What changes is `creep`, 0..1, which rises slowly and continuously with the
// story (setProgress). It never jumps; nobody should be able to point at the
// moment it went wrong. As it rises, the same giggle gets:
//   - a hair slower and lower (playbackRate 1.03 -> ~0.8)
//   - a slight seasick wobble in pitch
//   - duller, further away (lowpass closing)
//   - an echo that hangs on after she's stopped
//   - later, a faint copy of itself played backwards underneath
//   - later still, it comes from behind you (HRTF panning; on headphones)
//
// Recordings: "Cute Anime Girl Laughing Giggling (Many Variations)" by
// MagicalMysticVA (CC BY 4.0), see public/audio/giggle/CREDITS.txt.

const FILES = Array.from({ length: 7 }, (_, i) => `/audio/giggle/giggle-${i + 1}.mp3`);
const MIN_GAP_MS = 9000; // never two giggles close together

const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };

class GigglePlayer {
  constructor() {
    this.ctx = null;
    this.buffers = [];
    this.reversed = [];
    this.creep = 0;
    this._last = 0;
    this._lastIndex = -1;
    this.enabled = true;
  }

  /** Call once the AudioContext exists (inside the consent click). Loads in the background. */
  init(ctx, destination) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.dest = destination;
    Promise.all(FILES.map((u) => fetch(u).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null)))
      .then((list) => {
        this.buffers = list.filter(Boolean);
        this.reversed = this.buffers.map((b) => reverse(ctx, b));
      });
  }

  /**
   * Where we are in the story: act 1..9 plus progress through the act (0..1).
   * Creep follows a slow curve: almost nothing for the first few acts.
   */
  setProgress(act, p = 0) {
    const x = Math.min(1, Math.max(0, (act - 1 + p) / 8.4));
    this.creep = Math.pow(x, 1.6);
  }

  /** Maybe giggle (rate-limited). */
  maybe(chance = 0.15) {
    if (!this.enabled || !this.buffers.length || !this.ctx) return false;
    const now = performance.now();
    if (now - this._last < MIN_GAP_MS || Math.random() > chance) return false;
    this.play();
    return true;
  }

  play() {
    const ctx = this.ctx, c = this.creep;
    if (!ctx || !this.buffers.length) return;
    this._last = performance.now();
    let i = Math.floor(Math.random() * this.buffers.length);
    if (i === this._lastIndex) i = (i + 1) % this.buffers.length;
    this._lastIndex = i;
    const buf = this.buffers[i];
    const t0 = ctx.currentTime + 0.02;

    // slower and lower, gradually
    const rate = (1.03 - 0.24 * c) * (1 + (Math.random() - 0.5) * 0.03);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;

    // a slight wobble in pitch
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 4.5 + Math.random() * 2;
    lfoGain.gain.value = 40 * c;
    lfo.connect(lfoGain).connect(src.detune);

    // a touch of grit, then duller and further away
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(1 + 5 * c);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 17000 * Math.pow(0.2, c);
    lp.Q.value = 0.5;
    const dry = ctx.createGain();
    dry.gain.value = 0.5 * (1 - 0.4 * c);

    // an echo that lingers
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16 + 0.1 * c;
    const fb = ctx.createGain();
    fb.gain.value = 0.2 + 0.35 * c;
    const wet = ctx.createGain();
    wet.gain.value = 0.3 * sm(0.15, 0.8, c);

    // where it comes from: in front, then drifting round behind you
    const pan = ctx.createPanner();
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    const behind = sm(0.5, 0.95, c) * (Math.random() < 0.3 + 0.6 * c ? 1 : 0);
    const side = (Math.random() - 0.5) * 1.6 * c;
    setPos(pan, side, 0, -1 + 2.2 * behind);

    src.connect(shaper).connect(lp);
    lp.connect(dry).connect(pan);
    lp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(pan);
    pan.connect(this.dest);

    // underneath, later on: the same giggle, backwards
    let back = null;
    const backAmt = sm(0.45, 1, c);
    if (backAmt > 0.01) {
      back = ctx.createBufferSource();
      back.buffer = this.reversed[i];
      back.playbackRate.value = rate * 0.86;
      const g = ctx.createGain();
      g.gain.value = 0.2 * backAmt;
      back.connect(g).connect(lp);
      back.start(t0 + 0.12);
    }

    src.start(t0);
    lfo.start(t0);
    const dur = buf.duration / rate;
    const tail = 0.6 + 2.2 * c;
    lfo.stop(t0 + dur + tail);
    back?.stop(t0 + 0.12 + dur / 0.86);
    // let the echo ring out, then let go of the nodes
    setTimeout(() => { try { pan.disconnect(); delay.disconnect(); } catch { /* already gone */ } }, (dur + tail + 0.5) * 1000);
  }
}

function reverse(ctx, b) {
  const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const src = b.getChannelData(ch), dst = r.getChannelData(ch);
    for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
  }
  return r;
}

function softClip(k) {
  const n = 1024, curve = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

function setPos(p, x, y, z) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else p.setPosition(x, y, z);
}

export { GigglePlayer };
export const giggle = new GigglePlayer();
