// Procedural placeholder audio so the game is atmospheric out of the box
// with zero asset files. Everything here is synthesized with oscillators
// and noise buffers — swap in real recordings later via `loadStinger()`,
// which layers a real AudioBuffer on top of this same spatial pipeline.
//
// Spatialization uses PannerNode (HRTF) so a stinger can be told "play as if
// it's behind and to the left of the player" — much stronger over headphones.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.droneGain = null;
    this._droneNodes = [];
    this._buffers = {}; // name -> AudioBuffer, for real assets later
  }

  /** Must be called from a user gesture (the consent button click). */
  async init() {
    if (this.ctx) return this.unlock();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.unlock();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.master);
  }

  /** Resume the context if the browser suspended it. Safe to call on every click/keypress. */
  unlock() {
    if (this.ctx && this.ctx.state !== "running") return this.ctx.resume().catch(() => {});
    return Promise.resolve();
  }

  /** Slowly fades in a low detuned-oscillator drone with a wandering filter. */
  startAmbientDrone() {
    const ctx = this.ctx;
    const base = 55; // A1, low and uneasy
    [0, 7, -5].forEach((centsOffsetSemis, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = base * Math.pow(2, centsOffsetSemis / 1200);

      const gain = ctx.createGain();
      gain.gain.value = i === 0 ? 0.5 : 0.22;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 300;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.011;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 120;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.droneGain);
      osc.start();

      this._droneNodes.push(osc, lfo);
    });
    
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = 18.5;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.15;
    subOsc.connect(subGain);
    subGain.connect(this.droneGain);
    subOsc.start();
    this._droneNodes.push(subOsc);

    this.droneGain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 6);
  }

  /** Raise/lower drone intensity, e.g. as the quiz escalates (0..1). */
  setDroneIntensity(amount) {
    if (!this.droneGain) return;
    const target = 0.2 + Math.min(1, Math.max(0, amount)) * 0.5;
    this.droneGain.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 1.5);
  }

  /**
   * A short spatialized "something's there" sting.
   * @param {"click"|"breath"|"heartbeat"|"static"} type
   * @param {{x?: number, y?: number, z?: number}} position relative to listener, in meters
   */
  playStinger(type = "click", position = { x: 1, y: 0, z: -0.5 }) {
    const ctx = this.ctx;
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;

    const gain = ctx.createGain();
    panner.connect(gain);
    gain.connect(this.master);

    const now = ctx.currentTime;

    if (type === "heartbeat") {
      [0, 0.28].forEach((offset) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(60, now + offset);
        osc.frequency.exponentialRampToValueAtTime(30, now + offset + 0.15);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now + offset);
        g.gain.exponentialRampToValueAtTime(0.9, now + offset + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.22);
        osc.connect(g);
        g.connect(panner);
        osc.start(now + offset);
        osc.stop(now + offset + 0.25);
      });
      return;
    }

    if (type === "breath") {
      const noise = this._noiseSource(1.1);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 500;
      filter.Q.value = 0.6;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, now + 1.1);
      noise.connect(filter);
      filter.connect(panner);
      noise.start(now);
      noise.stop(now + 1.15);
      return;
    }

    if (type === "static") {
      const noise = this._noiseSource(0.4);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
      noise.connect(panner);
      noise.start(now);
      noise.stop(now + 0.4);
      return;
    }

    if (type === "jumpscare") {
      const dur = 1.4;
      const noise = this._noiseSource(dur);
      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.setValueAtTime(2600, now);
      nf.frequency.exponentialRampToValueAtTime(500, now + dur);
      nf.Q.value = 0.7;
      noise.connect(nf);
      nf.connect(gain);
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(80);
      shaper.connect(gain);
      [0, 6, 13, -11].forEach((semi) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(190 * Math.pow(2, semi / 12), now);
        osc.frequency.exponentialRampToValueAtTime(45, now + dur);
        osc.connect(shaper);
        osc.start(now);
        osc.stop(now + dur);
      });
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(1.0, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      noise.start(now);
      noise.stop(now + dur);
      return;
    }

    if (type === "tone") {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      osc.connect(panner);
      osc.start(now);
      osc.stop(now + 0.95);
      return;
    }

    if (type === "footstep") {
      const noise = this._noiseSource(0.25);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      const thump = ctx.createOscillator();
      thump.frequency.setValueAtTime(90, now);
      thump.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      noise.connect(lp);
      lp.connect(panner);
      thump.connect(panner);
      noise.start(now);
      noise.stop(now + 0.25);
      thump.start(now);
      thump.stop(now + 0.2);
      return;
    }

    // default: a sharp short click/tick, like a footstep or a knock
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(panner);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  _panner(position) {
    const p = this.ctx.createPanner();
    p.panningModel = "HRTF";
    p.distanceModel = "inverse";
    p.positionX.value = position.x ?? 0;
    p.positionY.value = position.y ?? 0;
    p.positionZ.value = position.z ?? 0;
    return p;
  }

  /**
   * Play a spoken line (AudioBuffer) as if someone is in the room. Default
   * position is just behind the listener (+z is behind in Web Audio).
   * Resolves when playback ends.
   */
  playVoice(buffer, position = { x: 0.25, y: 0.1, z: 0.6 }, { gain = 1, rate = 1 } = {}) {
    if (!buffer || !this.ctx) return Promise.resolve();
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.value = gain;
    const panner = this._panner(position);
    src.connect(hp);
    hp.connect(g);
    g.connect(panner);
    panner.connect(this.master);

    // faint slap-back so it sounds like it's in a room, not inside your head
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.11;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const dg = ctx.createGain();
    dg.gain.value = 0.18;
    g.connect(delay);
    delay.connect(lp);
    lp.connect(dg);
    dg.connect(panner);

    this.duckDrone(buffer.duration / rate + 0.4);
    return new Promise((resolve) => {
      src.onended = resolve;
      src.start();
    });
  }

  /**
   * The player's own recorded voice, played back wrong.
   * @param {"reverse"|"slow"|"whisper"} variant
   */
  playPlayerVoice(buffer, variant = "reverse", position = null) {
    if (!buffer) return Promise.resolve();
    let buf = buffer;
    if (variant === "reverse") {
      buf = this.ctx.createBuffer(1, buffer.length, buffer.sampleRate);
      const src = buffer.getChannelData(0), dst = buf.getChannelData(0);
      for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
    }
    const pos = position || { x: Math.random() < 0.5 ? -0.5 : 0.5, y: 0, z: 0.7 };
    const rate = variant === "slow" ? 0.78 : variant === "whisper" ? 0.92 : 1;
    const gain = variant === "whisper" ? 0.35 : 0.6;
    return this.playVoice(buf, pos, { gain, rate });
  }

  /** Dip the drone under a voice line so it's intelligible. */
  duckDrone(seconds) {
    if (!this.droneGain) return;
    const g = this.droneGain.gain, t = this.ctx.currentTime;
    const current = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(current, t);
    g.linearRampToValueAtTime(current * 0.45, t + 0.2);
    g.linearRampToValueAtTime(current, t + seconds);
  }

  /** Silence the drone completely (for "stay silent") and bring it back after `ms`. */
  muteDrone(ms) {
    if (!this.droneGain) return;
    const g = this.droneGain.gain, t = this.ctx.currentTime;
    const current = Math.max(g.value, 0.2);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.6);
    g.setValueAtTime(0, t + ms / 1000);
    g.linearRampToValueAtTime(current, t + ms / 1000 + 0.2);
  }

  /** Bring the drone back immediately (e.g. the silence was broken). */
  restoreDrone(level = 0.4) {
    if (!this.droneGain) return;
    const g = this.droneGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level, t + 0.15);
  }

  _noiseSource(durationSec) {
    const ctx = this.ctx;
    const bufferSize = Math.ceil(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  /** Optional: fetch and cache a real audio file to use instead of a procedural stinger later. */
  async loadBuffer(name, url) {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    this._buffers[name] = await this.ctx.decodeAudioData(arr);
  }

  playBuffer(name, position = { x: 0, y: 0, z: -1 }) {
    const buf = this._buffers[name];
    if (!buf) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
    src.connect(panner);
    panner.connect(this.master);
    src.start();
  }
}

function distortionCurve(amount) {
  const n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
