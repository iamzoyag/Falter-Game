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
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);

    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.connect(this.master);
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
      gain.gain.setValueAtTime(0, now);
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
