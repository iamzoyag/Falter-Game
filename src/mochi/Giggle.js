// Mochi's giggle.
//
// All game long she giggles, cutely: now and then when she talks to you
// (maybe), when something nice happens (happy), and every so often for no
// reason at all, somewhere off to the side (startAmbient). The point is that
// you get used to it and it becomes hers, sweet and harmless, so that when
// the same giggle comes back under a jumpscare (evil) it lands as something
// else entirely.
//
// The cute giggles are the same handful of recordings (public/audio/giggle/).
// They do drift, but only faintly: `creep` (0..1) rises slowly with the story
// (setProgress) and the cute giggles hear just a fraction of it (CUTE_DRIFT),
// so even by the last act they're barely off. As creep rises, a giggle gets:
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
const MIN_GAP_MS = 9000; // never two talking giggles close together
const HAPPY_GAP_MS = 5000; // happy moments may come a little closer
const CUTE_DRIFT = 0.35; // how much of the story's creep the cute giggles hear

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
    this.hushed = 0; // >0 while something (an injury scene) wants quiet
    this._ambient = null;
    this._ir = null;
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

  /** How creepy the cute giggles are right now (a faint fraction of the story's creep). */
  get cuteCreep() { return this.creep * CUTE_DRIFT; }

  _ready(gap) {
    return this.enabled && !this.hushed && this.ctx && this.buffers.length && !document.hidden
      && performance.now() - this._last >= gap;
  }

  /** When she's talking to you: maybe a giggle (rate-limited). */
  maybe(chance = 0.15) {
    if (!this._ready(MIN_GAP_MS) || Math.random() > chance) return false;
    this.play({ creep: this.cuteCreep });
    return true;
  }

  /** Something nice just happened (a catch, a match, a candle out): a brighter, happy giggle. */
  happy(chance = 0.6, { wait = 0.15 } = {}) {
    if (!this._ready(HAPPY_GAP_MS) || Math.random() > chance) return false;
    this.play({ creep: this.cuteCreep, gain: 0.85, wait, bright: 1.06 });
    return true;
  }

  /** Hush the cute giggles while `on` (nests). Used around the injury scenes. */
  hush(on) { this.hushed = Math.max(0, this.hushed + (on ? 1 : -1)); }

  /**
   * Every so often, for no reason, she giggles to herself somewhere off to the
   * side, quietly. First one after a minute or so, then every 45-100 s or so.
   */
  startAmbient() {
    if (this._ambient) return;
    const next = (ms) => { this._ambient = setTimeout(tick, ms); };
    const tick = () => {
      if (this._ready(MIN_GAP_MS * 2)) {
        this.play({ creep: this.cuteCreep, gain: 0.5, away: true });
        next(45000 + Math.random() * 55000);
      } else next(8000 + Math.random() * 8000); // busy right now; try again shortly
    };
    next(50000 + Math.random() * 30000);
  }

  stopAmbient() { clearTimeout(this._ambient); this._ambient = null; }

  /**
   * Giggle now. `creep` overrides the story's level for this one; `gain`
   * scales it; `bright` nudges it up (happy); `away` puts her somewhere off
   * to the side, a little distant.
   */
  play({ creep, gain = 1, wait = 0, bright = 1, away = false } = {}) {
    const ctx = this.ctx, c = creep ?? this.creep;
    if (!ctx || !this.buffers.length) return;
    this._last = performance.now();
    let i = Math.floor(Math.random() * this.buffers.length);
    if (i === this._lastIndex) i = (i + 1) % this.buffers.length;
    this._lastIndex = i;
    const buf = this.buffers[i];
    const t0 = ctx.currentTime + 0.02 + wait;

    // slower and lower, gradually
    const rate = (1.03 - 0.24 * c) * bright * (1 + (Math.random() - 0.5) * 0.03);
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
    if (away) {
      // somewhere to your left or right, a few steps off
      const a = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6);
      setPos(pan, Math.sin(a) * 2.2, 0, -Math.cos(a) * 2.2);
    } else {
      const side = (Math.random() - 0.5) * 1.6 * c;
      setPos(pan, side, 0, -1 + 2.2 * behind);
    }

    src.connect(shaper).connect(lp);
    lp.connect(dry).connect(pan);
    lp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(pan);
    const out = ctx.createGain();
    out.gain.value = gain;
    pan.connect(out).connect(this.dest);

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
    setTimeout(() => { try { out.disconnect(); delay.disconnect(); } catch { /* already gone */ } }, (dur + tail + wait + 0.5) * 1000);
  }
  /**
   * The jumpscare giggle. The same recording you've heard all game, but:
   * slowed and dragged down as it plays (a record winding down), doubled an
   * octave below, run through a low ring-modulator (the "two voices" growl),
   * crushed, with the giggle backwards underneath, and left ringing in a big
   * dark room. Always this, whatever act it is.
   */
  evil({ gain = 1, wait = 0 } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.buffers.length) return;
    this._last = performance.now();
    let i = Math.floor(Math.random() * this.buffers.length);
    if (i === this._lastIndex) i = (i + 1) % this.buffers.length;
    this._lastIndex = i;
    const buf = this.buffers[i];
    const t0 = ctx.currentTime + 0.02 + wait;
    const r0 = 0.74, r1 = 0.5; // starts low and keeps sinking
    const dur = buf.duration / ((r0 + r1) / 2);

    const out = ctx.createGain();
    out.gain.value = 0.42 * gain; // all those layers add up: this puts it a bit above a cute giggle, not deafening
    out.connect(this.dest);

    // crush + darken
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClip(9);
    shaper.oversample = "2x";
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 3200; lp.Q.value = 0.9;
    const bus = ctx.createGain();
    bus.gain.value = 0.55;
    bus.connect(shaper).connect(hp).connect(lp);

    // ring-mod copy: the voice multiplied by a low hum
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const ringOsc = ctx.createOscillator();
    ringOsc.frequency.value = 38;
    ringOsc.connect(ring.gain);
    const ringMix = ctx.createGain();
    ringMix.gain.value = 0.55;
    bus.connect(ring).connect(ringMix).connect(lp);

    // dry, plus a big dark room
    const dry = ctx.createGain();
    dry.gain.value = 0.8;
    lp.connect(dry).connect(out);
    const verb = ctx.createConvolver();
    verb.buffer = this._ir || (this._ir = darkRoom(ctx, 3.2));
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    lp.connect(verb).connect(wet).connect(out);

    const voice = (buffer, rate, g, pan, at = t0) => {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.playbackRate.setValueAtTime(rate * r0, at);
      s.playbackRate.linearRampToValueAtTime(rate * r1, at + dur);
      const gg = ctx.createGain();
      gg.gain.value = g;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      s.connect(gg).connect(p).connect(bus);
      s.start(at);
      s.stop(at + dur / rate + 0.1);
    };
    voice(buf, 1, 1, -0.25);                            // her, slowed
    voice(buf, 0.5, 0.75, 0.25);                        // an octave under her
    voice(this.reversed[i], 0.8, 0.45, 0, t0 + 0.08);   // backwards, underneath

    ringOsc.start(t0);
    ringOsc.stop(t0 + dur * 2 + 0.2);
    const end = (wait + 0.1 + dur * 2 + 3.4) * 1000;
    setTimeout(() => { try { out.disconnect(); bus.disconnect(); } catch { /* already gone */ } }, end);
  }
}

/** A long, dark, decaying impulse response: an empty room you can't see the walls of. */
function darkRoom(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let k = 0; k < n; k++) {
      lp += 0.18 * ((Math.random() * 2 - 1) - lp); // darker noise
      d[k] = lp * Math.pow(1 - k / n, 2.4) * 2.2;
    }
  }
  return ir;
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
