// Sound for the Mochi events. Ported from the mochi-dissolve preview:
//   - the deep drone is EXACTLY the preview's (detuned saws + sub sine,
//     resonant lowpass at 150 Hz swept by a slow LFO). Don't touch it.
//   - the cute music is now the full CuteTheme track, damaged live by the
//     transition (slows, sinks in pitch, wobbles, goes underwater, fades).
//   - injury sfx are RECORDED (CC0, public/audio/sfx/, via SampleBank) on the
//     same trigger points (sew steps, snap at t=.55, tearing, drips). If the
//     files are missing, the old synthesised versions play instead.

const sm = (a, b, x) => {
  x = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export class MochiAudio {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} destination usually AudioEngine.master
   * @param {import('../core/CuteTheme').CuteTheme} theme
   */
  constructor(ctx, destination, theme, samples = null) {
    this.ctx = ctx;
    this.theme = theme;
    /** @type {import('../core/SampleBank').SampleBank|null} */
    this.samples = samples;
    this._lastTear = 0;
    this.act = 1;

    // preview master was 0.55 straight to the speakers; the game's master is 0.7
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.55 / 0.7;
    this.bus.connect(destination);

    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = nb;

    // ---- the deep drone (unchanged from the preview)
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 150;
    lp.Q.value = 4;
    this.drone.connect(lp);
    lp.connect(this.bus);
    this._nodes = [];
    [[55, "sawtooth"], [55.7, "sawtooth"], [82.6, "sawtooth"], [41.2, "sine"]].forEach(([f, ty]) => {
      const o = ctx.createOscillator();
      o.type = ty;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = ty === "sine" ? 0.9 : 0.25;
      o.connect(g);
      g.connect(this.drone);
      o.start();
      this._nodes.push(o);
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = ctx.createGain();
    lg.gain.value = 60;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    this._nodes.push(lfo);

    // ---- ear-stretch creak
    this.creak = ctx.createGain();
    this.creak.gain.value = 0;
    const cb = ctx.createBiquadFilter();
    cb.type = "bandpass";
    cb.frequency.value = 420;
    cb.Q.value = 6;
    this.creak.connect(cb);
    cb.connect(this.bus);
    this.creakO = ctx.createOscillator();
    this.creakO.type = "sawtooth";
    this.creakO.frequency.value = 70;
    this.creakO.connect(this.creak);
    this.creakO.start();
    this._nodes.push(this.creakO);

    // ---- look-away whine (high, thin, grows while they refuse to watch)
    this.whine = ctx.createGain();
    this.whine.gain.value = 0;
    this.whine.connect(this.bus);
    this.whineO = ctx.createOscillator();
    this.whineO.type = "sine";
    this.whineO.frequency.value = 3150;
    this.whineO.connect(this.whine);
    this.whineO.start();
    this._nodes.push(this.whineO);

    this.state = {};
  }

  /** Per-act damage to the cute track at the START of an event: it's never quite right again. */
  actWarp(act) {
    const k = Math.max(0, Math.min(1, (act - 1) / 4));
    return { cents: -55 * k, wobble: 0.45 * k, tempo: 1 - 0.1 * k, muffle: 0.15 * k };
  }

  /** Begin an event: the cute track comes in (slightly broken in later acts), drone silent. */
  begin(act, { musicVolume = 0.5 } = {}) {
    this.act = act;
    this.state = {};
    this._musicVolume = musicVolume;
    this.theme.setWarp(this.actWarp(act));
    this.theme.play({ fade: 0.6 }); // keeps going if Act I music is already playing
    this.theme.setVolume(musicVolume);
  }

  /**
   * Call every frame during an event.
   * @param {string} name scene name
   * @param {number} t eased transition 0..1
   * @param {number} dt seconds
   * @param {boolean} watching is the player watching (event advancing)
   * @param {number} awaySec how long they've been looking away
   */
  update(name, t, dt, watching, awaySec = 0) {
    const ctx = this.ctx, now = ctx.currentTime;
    const cute = 1 - sm(0.05, 0.45, t), dark = sm(0.12, 0.65, t);
    const base = this.actWarp(this.act);

    // music: slows, sinks, wobbles, drowns
    this.theme.setVolume(this._musicVolume * cute, 0.45);
    this.theme.setWarp({
      tempo: base.tempo * (1 - 0.55 * sm(0, 0.5, t)),
      cents: base.cents - 900 * sm(0, 0.5, t),
      wobble: Math.min(1, base.wobble + sm(0.1, 0.5, t)),
      muffle: Math.min(1, base.muffle + 0.7 * sm(0.15, 0.5, t) + (watching ? 0 : 0.35))
    });
    // the drone is there from the first wound; looking away makes it swell
    const away = watching ? 0 : sm(0, 2.5, awaySec);
    this.drone.gain.setTargetAtTime(0.55 * Math.max(dark, 0.35 * away), now, 0.4);
    this.whine.gain.setTargetAtTime(0.025 * away, now, 0.3);

    const S = this.state;
    if (S.name !== name || t < (S.t || 0) - 0.02) Object.assign(S, { name, step: 0, snap: false, sq: false, gush: false, acc: 0 });
    S.t = t;

    const cr = watching && name === "ears" && t < 0.55 ? sm(0, 0.55, t) : 0;
    this.creak.gain.setTargetAtTime(cr * 0.5, now, 0.05);
    this.creakO.frequency.setTargetAtTime(60 + cr * 70 + Math.sin(now * 9) * 8, now, 0.05);
    if (!watching) return; // wounds don't progress while they look away, so neither do their sounds

    if (name === "stitches") {
      const idx = Math.min(10, Math.floor(Math.min(1, Math.max(0, (t - 0.12) / 0.8)) * 1.08 * 10));
      if (idx > S.step) { S.step = idx; this.sfx.stitch(this); }
    } else if (name === "ears") {
      if (t >= 0.55 && !S.snap) { S.snap = true; this.sfx.snap(this); }
      if (t > 0.58) {
        S.acc += dt;
        if (S.acc > 0.28 && t < 0.98) {
          S.acc = 0;
          if (Math.random() < 0.7) this.sfx.drip(this);
          if (Math.random() < 0.25) this.sfx.squelch(this, 0.25);
        }
      }
    } else if (name === "eyes") {
      if (t >= 0.12 && !S.sq) { S.sq = true; this.sfx.squelch(this, 0.6); }
      if (t > 0.14 && t < 0.9) { S.acc += dt; if (S.acc > 0.45) { S.acc = 0; this.sfx.squelch(this, 0.3); } }
      if (t > 0.55 && Math.random() < dt * 2.5) this.sfx.drip(this);
    } else if (name === "unzip") {
      if (t > 0.06 && t < 0.72) {
        S.acc += dt;
        // recorded tears are longer than the synth bursts, so space them out
        const gap = this.samples?.has("tear") ? 0.42 + (1 - sm(0.06, 0.5, t)) * 0.3 : 0.16 + (1 - sm(0.06, 0.5, t)) * 0.1;
        if (S.acc > gap) {
          S.acc = 0;
          this.sfx.tear(this, 0.1 + Math.random() * 0.16, 0.35 + 0.35 * sm(0.06, 0.4, t));
          if (Math.random() < 0.5) this.sfx.squelch(this, 0.3);
        }
      }
      if (t >= 0.45 && !S.gush) { S.gush = true; this.samples?.play("gush", { gain: 0.6, maxDur: 2.2 }); }
      if (t > 0.6 && Math.random() < dt * 3) this.sfx.drip(this);
    }
  }

  /** The sudden cut-away: everything stops dead, then a low hit. */
  cutAway() {
    const now = this.ctx.currentTime;
    this.theme.cut();
    [this.drone, this.creak, this.whine].forEach((g) => {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0, now);
    });
    this.thump(70, 24, 0.9, 0.9);
  }

  /** Fade everything out (end of an event without the hard cut). */
  end(fade = 1.5) {
    const now = this.ctx.currentTime;
    this.theme.stop({ fade });
    [this.drone, this.creak, this.whine].forEach((g) => g.gain.setTargetAtTime(0, now, fade / 3));
  }

  // ------------------------------------------------------------ synth helpers
  burst(o) {
    const c = this.ctx, t0 = c.currentTime + (o.delay || 0);
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.Q.value = o.q || 2;
    f.frequency.setValueAtTime(o.f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1 || o.f0), t0 + o.dur);
    const g = c.createGain();
    const a = o.gain || 0.4;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(a, t0 + Math.min(0.01, o.dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.bus);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + o.dur + 0.05);
  }

  thump(f0, f1, dur, gain, delay) {
    const c = this.ctx, t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.bus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // each one: recorded sample when available, synthesised fallback otherwise
  sfx = {
    stitch(A) {
      const S = A.samples;
      if (S?.has("stitch")) {
        S.play("stitch", { gain: 0.9, jitter: 0.06 });
        if (Math.random() < 0.6) S.play("thread", { gain: 0.45, delay: 0.14, maxDur: 0.6 });
        A.thump(130, 55, 0.08, 0.25); // a little weight under the needle
        return;
      }
      A.burst({ dur: 0.05, f0: 2600, f1: 900, q: 2, gain: 0.55 });
      A.thump(150, 55, 0.09, 0.45);
      A.burst({ dur: 0.2, f0: 2800, f1: 6500, q: 1, gain: 0.13, type: "highpass", delay: 0.07 });
    },
    tear(A, len, g) {
      if (A.samples?.has("tear")) {
        A.samples.play("tear", { gain: 0.5 + (g || 0.5) * 0.6, jitter: 0.1, maxDur: 1.4 });
        return;
      }
      A.burst({ dur: len, f0: 900 + Math.random() * 500, f1: 250, q: 1.2, gain: g || 0.5 });
      A.burst({ dur: len * 0.8, f0: 3000, f1: 1200, q: 0.8, gain: (g || 0.5) * 0.35, type: "highpass" });
    },
    squelch(A, g) {
      if (A.samples?.has("squelch")) {
        A.samples.play("squelch", { gain: 0.35 + (g || 0.4) * 1.1, jitter: 0.12, maxDur: 1 });
        return;
      }
      const n = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        A.burst({ dur: 0.05 + Math.random() * 0.05, f0: 250 + Math.random() * 350, f1: 700 + Math.random() * 500, q: 5, gain: (g || 0.4) * (0.5 + Math.random() * 0.5), delay: i * 0.06 });
      }
      A.thump(90, 45, 0.18, 0.3);
    },
    drip(A) {
      if (A.samples?.has("drip")) {
        A.samples.play("drip", { gain: 0.5 + Math.random() * 0.3, jitter: 0.15, pan: Math.random() * 0.6 - 0.3 });
        return;
      }
      const c = A.ctx, t0 = c.currentTime;
      const o = c.createOscillator();
      o.frequency.setValueAtTime(1400 + Math.random() * 400, t0);
      o.frequency.exponentialRampToValueAtTime(480, t0 + 0.09);
      const g = c.createGain();
      g.gain.setValueAtTime(0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(g);
      g.connect(A.bus);
      o.start(t0);
      o.stop(t0 + 0.14);
    },
    snap(A) {
      const S = A.samples;
      if (S?.has("snap")) {
        S.play("snap", { gain: 1, jitter: 0.04 });
        S.play("crack", { gain: 0.8, delay: 0.02 });
        S.play("gush", { gain: 0.55, delay: 0.12, maxDur: 1.8 });
        S.play("squelch", { gain: 0.7, delay: 0.2 });
        A.thump(120, 28, 0.7, 0.8);
        return;
      }
      A.burst({ dur: 0.35, f0: 1800, f1: 200, q: 0.7, gain: 0.9 });
      A.thump(120, 28, 0.7, 1);
      A.burst({ dur: 0.5, f0: 600, f1: 150, q: 3, gain: 0.5, delay: 0.06 });
      A.sfx.squelch(A, 0.6);
    }
  };
}
