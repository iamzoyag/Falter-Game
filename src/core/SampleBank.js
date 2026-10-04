// Recorded one-shot sounds, grouped by name ("tear" -> tear-1..tear-7.mp3).
// play() picks a random variant and nudges its pitch a little, so repeated
// hits never sound identical. Anything that fails to load is just missing:
// callers check has() and fall back to their synthesised version.
//
// Files: public/audio/sfx/ (CC0 recordings from freesound.org, see CREDITS.txt there).

export const SFX_GROUPS = {
  stitch: 6, thread: 2, tear: 7, squelch: 10, splat: 1, snap: 3, crack: 3, drip: 7, gush: 1, screech: 1
};

export class SampleBank {
  /** @param {BaseAudioContext} ctx @param {AudioNode} destination */
  constructor(ctx, destination, base = "/audio/sfx/") {
    this.ctx = ctx;
    this.out = destination;
    this.base = base;
    this.groups = {}; // name -> AudioBuffer[]
    this._last = {};  // name -> index last played (avoid immediate repeats)
  }

  async load(groups = SFX_GROUPS) {
    const jobs = [];
    for (const [name, count] of Object.entries(groups)) {
      for (let i = 1; i <= count; i++) {
        jobs.push(fetch(`${this.base}${name}-${i}.mp3`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((a) => this.ctx.decodeAudioData(a))
          .then((buf) => (this.groups[name] ||= []).push(buf))
          .catch(() => {}));
      }
    }
    await Promise.all(jobs);
    return Object.keys(this.groups).length;
  }

  has(name) {
    return !!this.groups[name]?.length;
  }

  /**
   * @param {string} name group
   * @param {{gain?: number, rate?: number, jitter?: number, delay?: number, pan?: number, maxDur?: number}} o
   */
  play(name, { gain = 1, rate = 1, jitter = 0.08, delay = 0, pan = 0, maxDur = 0 } = {}) {
    const list = this.groups[name];
    if (!list?.length) return false;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this._last[name]) i = (i + 1) % list.length;
    this._last[name] = i;
    const ctx = this.ctx, t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = list[i];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    src.connect(g);
    node.connect(this.out);
    src.start(t0);
    if (maxDur) {
      g.gain.setValueAtTime(gain, t0 + maxDur - 0.05);
      g.gain.linearRampToValueAtTime(0, t0 + maxDur);
      src.stop(t0 + maxDur + 0.02);
    }
    return true;
  }
}
