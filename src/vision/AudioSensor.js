// Analyzes the player's microphone input — never plays it back (no node here
// ever connects to speakers, so there's no feedback risk) and never records
// or transmits it. Two signals come out of it:
//
//  - suddenNoise: a sharp jump in amplitude above the room's noise floor
//    (a door, a chair creak, a dropped phone).
//  - breathingLikely: a soft, sustained, slowly-oscillating amplitude
//    envelope — this is a heuristic, not real breath detection. It will
//    false-positive on things like a fan or HVAC hum with slow variation.
//    Treat it as "ambient soft sound with a rhythm" rather than literally
//    "the player is breathing audibly" — good enough for a horror beat,
//    not good enough for anything that actually needs to be accurate.

const NOISE_FLOOR_EMA_ALPHA = 0.02; // slow-moving baseline
const SUDDEN_NOISE_JUMP = 0.09; // RMS units above the floor
const ENVELOPE_HISTORY_MS = 12000;
const BREATH_MIN_PERIOD_MS = 1800; // ~33 breaths/min, upper bound of plausible
const BREATH_MAX_PERIOD_MS = 6000; // ~10 breaths/min, lower bound
const BREATH_BAND_MIN_RMS = 0.015; // must be audibly present…
const BREATH_BAND_MAX_RMS = 0.12; // …but not loud (that's talking/noise, not breath)

export class AudioSensor {
  /** @param {AudioContext} audioCtx reuse the same context AudioEngine created */
  constructor(audioCtx) {
    this.ctx = audioCtx;
    this.analyser = null;
    this.source = null;
    this._timeDomain = null;

    this.noiseFloor = null;
    this._envelopeHistory = []; // { t, rms }
  }

  /** @param {MediaStream} micStream a stream containing only the audio track */
  attach(micStream) {
    this.source = this.ctx.createMediaStreamSource(micStream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    this._timeDomain = new Uint8Array(this.analyser.fftSize);
    this.source.connect(this.analyser);
    // Deliberately not connected onward to any destination — analysis only.
  }

  /** Call every animation frame (or every few frames — it's cheap either way). */
  update(nowMs) {
    if (!this.analyser) return null;

    this.analyser.getByteTimeDomainData(this._timeDomain);
    let sumSquares = 0;
    for (let i = 0; i < this._timeDomain.length; i++) {
      const v = (this._timeDomain[i] - 128) / 128;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / this._timeDomain.length);

    if (this.noiseFloor === null) this.noiseFloor = rms;
    else this.noiseFloor = this.noiseFloor * (1 - NOISE_FLOOR_EMA_ALPHA) + rms * NOISE_FLOOR_EMA_ALPHA;

    const suddenNoise = rms - this.noiseFloor > SUDDEN_NOISE_JUMP;

    this._envelopeHistory.push({ t: nowMs, rms });
    const cutoff = nowMs - ENVELOPE_HISTORY_MS;
    while (this._envelopeHistory.length && this._envelopeHistory[0].t < cutoff) {
      this._envelopeHistory.shift();
    }

    return {
      rms,
      noiseFloor: this.noiseFloor,
      suddenNoise,
      breathingLikely: this._detectBreathingRhythm()
    };
  }

  _detectBreathingRhythm() {
    const hist = this._envelopeHistory;
    if (hist.length < 30) return false;

    const inBand = hist.filter((s) => s.rms >= BREATH_BAND_MIN_RMS && s.rms <= BREATH_BAND_MAX_RMS);
    if (inBand.length < hist.length * 0.4) return false; // not consistently soft-present

    // Find local peaks in the smoothed envelope and check spacing looks breath-like.
    const peaks = [];
    for (let i = 2; i < hist.length - 2; i++) {
      const a = hist[i - 2].rms, b = hist[i].rms, c = hist[i + 2].rms;
      if (b > a && b > c && b >= BREATH_BAND_MIN_RMS) peaks.push(hist[i].t);
    }
    if (peaks.length < 2) return false;

    let plausibleGaps = 0;
    for (let i = 1; i < peaks.length; i++) {
      const gap = peaks[i] - peaks[i - 1];
      if (gap >= BREATH_MIN_PERIOD_MS && gap <= BREATH_MAX_PERIOD_MS) plausibleGaps++;
    }
    return plausibleGaps >= Math.max(1, Math.floor(peaks.length * 0.4));
  }
}
