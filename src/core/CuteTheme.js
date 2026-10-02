// "Mochi's Theme": the cute, bouncy song for Act I and for the first few
// seconds of every Mochi event (DDLC-style: everything is fine).
//
// An original tune, fully synthesised (no samples, nothing copyrighted), arranged like a real
// track: toy piano lead, music-box bells, offbeat ukulele-ish plucks,
// a soft pad, bouncy bass, and drums whose kick is a "doki doki" double
// heartbeat. Form: intro -> [A, B (chorus), A', B, break] looping forever.
//
// Everything runs through setWarp() so the horror can damage it live:
//   tempo  (1 = normal, 0.45 = dragging), cents (pitch bend, -900 = sinking),
//   wobble (0..1 random detune per note), muffle (0..1 lowpass, underwater).
//
// Want a real recorded track instead? Drop a loopable file at
// public/audio/cute-theme.mp3 and pass { url: "/audio/cute-theme.mp3" };
// the same warp controls are applied to it (playbackRate + detune).

const BPM = 128;
const STEP = 60 / BPM / 4; // one 16th note, seconds at tempo 1

const CHORDS = {
  C: { root: 36, tones: [60, 64, 67] },
  Am: { root: 45, tones: [57, 60, 64] },
  F: { root: 41, tones: [57, 60, 65] },
  G: { root: 43, tones: [59, 62, 67] },
  Dm: { root: 38, tones: [57, 62, 65] },
  Em: { root: 40, tones: [59, 64, 67] }
};

// melodies: [midi, length in 8th notes], 0 = rest, 8 eighths per bar
const MEL_A = [
  [[76, 1], [79, 1], [84, 2], [83, 1], [81, 1], [79, 2]],
  [[76, 1], [77, 1], [79, 2], [76, 2], [72, 2]],
  [[77, 1], [76, 1], [74, 1], [72, 1], [74, 2], [77, 2]],
  [[79, 3], [74, 1], [79, 2], [0, 2]],
  [[76, 1], [79, 1], [84, 2], [86, 1], [84, 1], [83, 2]],
  [[81, 1], [79, 1], [76, 2], [81, 2], [84, 2]],
  [[86, 1], [84, 1], [81, 1], [77, 1], [79, 2], [74, 2]],
  [[74, 2], [76, 1], [77, 1], [79, 4]]
];
const MEL_B = [
  [[84, 2], [84, 1], [86, 1], [88, 2], [84, 2]],
  [[86, 2], [86, 1], [88, 1], [91, 2], [86, 2]],
  [[88, 1], [86, 1], [84, 1], [83, 1], [84, 2], [79, 2]],
  [[81, 3], [79, 1], [76, 2], [0, 2]],
  [[84, 2], [84, 1], [86, 1], [88, 2], [89, 2]],
  [[91, 2], [89, 1], [88, 1], [86, 2], [83, 2]],
  [[84, 1], [88, 1], [91, 1], [88, 1], [84, 2], [79, 2]],
  [[84, 4], [0, 4]]
];

const SECTIONS = {
  intro: { chords: ["F", "G", "C", "C"], mel: null, kit: "doki", bells: "arp", pad: true },
  A: { chords: ["C", "Am", "F", "G", "C", "Am", "Dm", "G"], mel: MEL_A, kit: "full", plucks: true, bass: true, bells: "sparkle" },
  B: { chords: ["F", "G", "Em", "Am", "F", "G", "C", "C"], mel: MEL_B, kit: "full+", plucks: true, bass: true, bells: "arp", pad: true, double: true },
  brk: { chords: ["F", "G", "Am", "G"], mel: null, kit: "doki", bells: "arp", pad: true, bass: true }
};
const LOOP = ["A", "B", "A", "B", "brk"];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class CuteTheme {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} destination
   * @param {{url?: string, volume?: number}} opts
   */
  constructor(ctx, destination, { url = null, volume = 0.5 } = {}) {
    this.ctx = ctx;
    this.url = url;
    this.warp = { tempo: 1, cents: 0, wobble: 0, muffle: 0 };
    this._buffer = null;
    this._src = null;
    this._timer = null;
    this.playing = false;

    // bus: instruments -> muffle LP -> comp -> out(gain) ; + reverb send
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this._volume = volume;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.2;
    this.comp.connect(this.out);

    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 18000;
    this.muffle.Q.value = 0.7;
    this.muffle.connect(this.comp);

    this.dry = ctx.createGain();
    this.dry.connect(this.muffle);

    this.verb = ctx.createConvolver();
    this.verb.buffer = makeImpulse(ctx, 1.9, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.send = ctx.createGain();
    this.send.connect(this.verb);
    this.verb.connect(wet);
    wet.connect(this.muffle);

    this._noise = makeNoise(ctx, 1);
    this._step = 0;      // global 16th counter within the arrangement
    this._next = 0;      // ctx time of the next 16th
  }

  /** Optional: load a recorded track. Falls back to the synth if it's missing. */
  async load() {
    if (!this.url) return false;
    try {
      const res = await fetch(this.url);
      if (!res.ok) return false;
      this._buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
      return true;
    } catch {
      return false;
    }
  }

  /** Start (or keep) playing, fading in over `fade` seconds. */
  play({ fade = 1.5, fromTop = false } = {}) {
    const ctx = this.ctx, now = ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(this._volume, now + fade);
    if (this.playing && !fromTop) return;
    this._stopSources();
    this.playing = true;
    if (this._buffer) {
      const s = ctx.createBufferSource();
      s.buffer = this._buffer;
      s.loop = true;
      s.connect(this.dry);
      s.start();
      this._src = s;
      this._applyWarpToBuffer();
      return;
    }
    this._step = 0;
    this._next = now + 0.08;
    this._timer = setInterval(() => this._pump(this.ctx.currentTime + 0.15), 25);
  }

  /** Fade out, then stop scheduling. */
  stop({ fade = 1.2 } = {}) {
    const ctx = this.ctx, now = ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fade);
    const token = {};
    this._stopToken = token;
    setTimeout(() => {
      if (this._stopToken !== token) return; // play() was called again
      this._stopSources();
      this.playing = false;
    }, fade * 1000 + 50);
  }

  /** Cut instantly (a sudden silence is a scare in itself). */
  cut() {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(0, now);
    this._stopSources();
    this.playing = false;
  }

  setVolume(v, ramp = 0.3) {
    this._volume = v;
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(v, now, ramp / 3);
  }

  /** Live damage controls. Any subset: {tempo, cents, wobble, muffle}. */
  setWarp(w) {
    Object.assign(this.warp, w);
    const now = this.ctx.currentTime;
    const m = this.warp.muffle;
    this.muffle.frequency.setTargetAtTime(18000 * Math.pow(350 / 18000, m), now, 0.08);
    this._applyWarpToBuffer();
  }

  _applyWarpToBuffer() {
    if (!this._src) return;
    const now = this.ctx.currentTime;
    this._src.playbackRate.setTargetAtTime(this.warp.tempo, now, 0.1);
    this._src.detune.setTargetAtTime(this.warp.cents, now, 0.1);
  }

  _stopSources() {
    clearInterval(this._timer);
    this._timer = null;
    try { this._src?.stop(); } catch { /* already stopped */ }
    this._src = null;
  }

  /** Schedule every 16th note that starts before `until` (ctx time). */
  _pump(until) {
    if (this._buffer) return;
    while (this._next < until) {
      this._scheduleStep(this._step, this._next);
      this._next += STEP / Math.max(0.2, this.warp.tempo);
      this._step++;
    }
  }

  /** Where we are in the arrangement for a global step index. */
  _locate(step) {
    const bar = Math.floor(step / 16), s16 = step % 16;
    const introBars = SECTIONS.intro.chords.length;
    if (bar < introBars) return { sec: SECTIONS.intro, name: "intro", barIn: bar, s16 };
    let b = bar - introBars;
    const loopBars = LOOP.reduce((n, k) => n + SECTIONS[k].chords.length, 0);
    b %= loopBars;
    let pass = 0;
    for (const k of LOOP) {
      const len = SECTIONS[k].chords.length;
      if (b < len) return { sec: SECTIONS[k], name: k, barIn: b, s16, pass };
      b -= len;
      pass++;
    }
    return null;
  }

  _scheduleStep(step, t) {
    const L = this._locate(step);
    if (!L) return;
    const { sec, barIn, s16 } = L;
    const chord = CHORDS[sec.chords[barIn]];
    const len16 = STEP / Math.max(0.2, this.warp.tempo);

    // ---- drums
    const doki = s16 === 0 || s16 === 2 || s16 === 8 || s16 === 10;
    if (doki) this._kick(t, s16 % 8 === 0 ? 0.42 : 0.3);
    if (sec.kit !== "doki") {
      if (s16 === 4 || s16 === 12) this._clap(t);
      if (s16 % 4 === 2) this._hat(t, 0.08);
      if (sec.kit === "full+" && s16 % 2 === 1) this._hat(t, 0.035, true);
    }

    // ---- bass (bouncy root / octave / fifth)
    if (sec.bass) {
      const pat = { 0: 0, 3: 0, 6: 12, 8: 7, 11: 0, 14: 12 };
      if (pat[s16] !== undefined) this._bass(mtof(chord.root + pat[s16]), t, len16 * 2.2);
    }

    // ---- pad, once per bar
    if (sec.pad && s16 === 0) this._pad(chord.tones, t, len16 * 16);

    // ---- offbeat plucks (the "bounce")
    if (sec.plucks && s16 % 4 === 2) chord.tones.forEach((m) => this._pluck(mtof(m), t, 0.11));

    // ---- melody (piano)
    if (sec.mel && s16 % 2 === 0) {
      const eighth = s16 / 2;
      let pos = 0;
      for (const [m, l] of sec.mel[barIn]) {
        if (pos === eighth && m) {
          const dur = l * len16 * 2;
          this._piano(mtof(m), t, dur, 0.3);
          if (sec.double) this._piano(mtof(m - 12), t, dur, 0.1);
        }
        pos += l;
      }
    }

    // ---- bells
    if (sec.bells === "arp" && s16 % 2 === 0) {
      const tones = [...chord.tones, chord.tones[1] + 12];
      const order = [0, 1, 2, 3, 2, 1, 2, 3];
      this._bell(mtof(tones[order[(s16 / 2) % 8]] + 12), t, sec.mel ? 0.05 : 0.11);
    } else if (sec.bells === "sparkle" && (s16 === 14 || s16 === 15) && barIn % 2 === 1) {
      this._bell(mtof(chord.tones[s16 === 14 ? 2 : 1] + 24), t, 0.07);
    }
  }

  // ------------------------------------------------------------- instruments

  _det() {
    return this.warp.cents + (Math.random() - 0.5) * this.warp.wobble * 80;
  }

  _osc(type, f, t, det) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = det;
    return o;
  }

  _env(t, peak, attack, decay, end) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0.0001, t + attack, decay);
    g.gain.setTargetAtTime(0.00001, end, 0.03);
    return g;
  }

  _piano(f, t, dur, vel) {
    const det = this._det(), end = t + Math.max(dur, 0.12) + 0.05;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(5200, t);
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.6);
    const g = this._env(t, vel, 0.004, 0.42, end);
    lp.connect(g);
    g.connect(this.dry);
    g.connect(this.send);
    [["triangle", 1, 1], ["sine", 2, 0.28], ["sine", 3, 0.08], ["triangle", 1.003, 0.45]].forEach(([ty, h, a]) => {
      const o = this._osc(ty, f * h, t, det);
      const og = this.ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(lp);
      o.start(t);
      o.stop(end + 0.2);
    });
  }

  _bell(f, t, vel) {
    const det = this._det(), end = t + 1.4;
    const g = this._env(t, vel, 0.002, 0.35, end);
    g.connect(this.dry);
    g.connect(this.send);
    [[1, 1], [2.76, 0.32], [5.4, 0.1]].forEach(([h, a]) => {
      const o = this._osc("sine", f * h, t, det);
      const og = this.ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(end + 0.2);
    });
  }

  _pluck(f, t, vel) {
    const det = this._det(), end = t + 0.3;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.15);
    const g = this._env(t, vel * 0.5, 0.003, 0.07, end);
    lp.connect(g);
    g.connect(this.dry);
    g.connect(this.send);
    const o = this._osc("triangle", f, t, det);
    o.connect(lp);
    o.start(t);
    o.stop(end + 0.1);
  }

  _pad(tones, t, dur) {
    const end = t + dur;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.35);
    g.gain.setValueAtTime(0.035, end - 0.15);
    g.gain.linearRampToValueAtTime(0.0001, end + 0.1);
    lp.connect(g);
    g.connect(this.dry);
    g.connect(this.send);
    tones.forEach((m) => [-7, 7].forEach((cents) => {
      const o = this._osc("sawtooth", mtof(m), t, this._det() + cents);
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.2);
    }));
  }

  _bass(f, t, dur) {
    const det = this.warp.cents, end = t + dur;
    const g = this._env(t, 0.16, 0.005, 0.16, end);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(g);
    g.connect(this.dry);
    [["triangle", 1, 0.8], ["sine", 1, 0.7]].forEach(([ty, h, a]) => {
      const o = this._osc(ty, f * h, t, det);
      const og = this.ctx.createGain();
      og.gain.value = a;
      o.connect(og);
      og.connect(lp);
      o.start(t);
      o.stop(end + 0.1);
    });
  }

  _kick(t, vel) {
    const k = Math.pow(2, this.warp.cents / 1200);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(170 * k, t);
    o.frequency.exponentialRampToValueAtTime(62 * k, t + 0.11);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g);
    g.connect(this.dry);
    o.start(t);
    o.stop(t + 0.2);
  }

  _clap(t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1700;
    bp.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    [0, 0.012, 0.024].forEach((d) => {
      g.gain.setValueAtTime(0.22, t + d);
      g.gain.exponentialRampToValueAtTime(0.03, t + d + 0.01);
    });
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.dry);
    g.connect(this.send);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.2);
  }

  _hat(t, vel, soft = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = soft ? 5500 : 7500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (soft ? 0.03 : 0.05));
    s.connect(hp);
    hp.connect(g);
    g.connect(this.dry);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.08);
  }
}

/** Render the synth version offline (for previews/tests). Returns an AudioBuffer. */
export async function renderCuteTheme(seconds = 75, sampleRate = 44100, automate = null) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const theme = new CuteTheme(ctx, ctx.destination, { volume: 0.8 });
  theme.out.gain.value = 0.8;
  theme.playing = true;
  theme._next = 0.05;
  // schedule in small chunks so `automate(t)` warps apply as it goes
  for (let t = 0; t < seconds; t += 0.05) {
    if (automate) theme.warp = { ...theme.warp, ...automate(t) };
    theme._pump(t + 0.05);
  }
  return ctx.startRendering();
}

function makeNoise(ctx, seconds) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}
