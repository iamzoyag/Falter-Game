// Raw PCM recording from the mic, used for two things only:
//   1. the calibration line ("i'm the only one in this room"), kept in memory
//      as an AudioBuffer and played back later, wrong
//   2. spoken interrogation answers, handed to the transcriber
// Nothing is written to disk. ScriptProcessorNode is deprecated but still
// supported everywhere and needs no separate worklet file.

export class MicRecorder {
  /** @param {AudioContext} ctx @param {MediaStream} micStream */
  constructor(ctx, micStream) {
    this.ctx = ctx;
    this.source = ctx.createMediaStreamSource(micStream);
    this.proc = ctx.createScriptProcessor(4096, 1, 1);
    this.sink = ctx.createGain();
    this.sink.gain.value = 0; // the processor must reach the destination to run; this keeps it silent
    this.proc.connect(this.sink);
    this.sink.connect(ctx.destination);
    this.source.connect(this.proc);

    this.recording = false;
    this.chunks = [];
    this.level = 0;
    this.proc.onaudioprocess = (e) => {
      const d = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      this.level = Math.sqrt(sum / d.length);
      if (this.recording) this.chunks.push(new Float32Array(d));
    };
  }

  start() {
    this.chunks = [];
    this.recording = true;
  }

  /** @returns {Float32Array} samples at ctx.sampleRate */
  stop() {
    this.recording = false;
    const len = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(len);
    let o = 0;
    for (const c of this.chunks) { out.set(c, o); o += c.length; }
    this.chunks = [];
    return out;
  }

  /** Fixed-length recording (calibration). Trims leading/trailing silence. */
  async recordFor(ms) {
    this.start();
    await sleep(ms);
    return trimSilence(this.stop(), this.ctx.sampleRate);
  }

  /**
   * Record a spoken answer with simple voice-activity detection: waits for
   * speech, stops after a pause. `stopSignal()` (e.g. typed answer / button)
   * ends it early.
   */
  async recordAnswer({ startTimeoutMs = 9000, silenceMs = 1500, maxMs = 15000, onLevel, stopSignal } = {}) {
    const floor = await this._measureFloor();
    const threshold = Math.max(0.018, floor * 3);
    this.start();
    const t0 = performance.now();
    let firstSpeech = null;
    let lastSpeech = null;
    let longestPause = 0;

    while (true) {
      await sleep(50);
      const now = performance.now();
      onLevel?.(Math.min(1, this.level / (threshold * 4)));
      if (this.level > threshold) {
        if (firstSpeech === null) firstSpeech = now;
        else if (lastSpeech !== null) longestPause = Math.max(longestPause, now - lastSpeech);
        lastSpeech = now;
      }
      if (stopSignal?.()) break;
      if (firstSpeech === null && now - t0 > startTimeoutMs) break;
      if (lastSpeech !== null && now - lastSpeech > silenceMs) break;
      if (now - t0 > maxMs) break;
    }
    const samples = this.stop();
    return {
      samples,
      sampleRate: this.ctx.sampleRate,
      spoke: firstSpeech !== null,
      latencyToSpeakMs: firstSpeech !== null ? Math.round(firstSpeech - t0) : null,
      durationMs: Math.round(performance.now() - t0),
      longestPauseMs: Math.round(longestPause)
    };
  }

  async _measureFloor() {
    const vals = [];
    for (let i = 0; i < 6; i++) { vals.push(this.level); await sleep(50); }
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  toAudioBuffer(samples) {
    if (!samples?.length) return null;
    const buf = this.ctx.createBuffer(1, samples.length, this.ctx.sampleRate);
    buf.getChannelData(0).set(samples);
    return buf;
  }
}

/** Resample mono Float32 audio (e.g. 48k -> 16k for speech models). */
export async function resample(samples, fromRate, toRate = 16000) {
  if (fromRate === toRate) return samples;
  const length = Math.ceil((samples.length * toRate) / fromRate);
  const off = new OfflineAudioContext(1, length, toRate);
  const buf = off.createBuffer(1, samples.length, fromRate);
  buf.getChannelData(0).set(samples);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** 16-bit PCM WAV, base64-encoded. */
export function encodeWavBase64(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function trimSilence(samples, rate, threshold = 0.02) {
  const win = Math.floor(rate * 0.02);
  let start = 0, end = samples.length;
  const rms = (i) => {
    let s = 0;
    for (let j = i; j < Math.min(i + win, samples.length); j++) s += samples[j] * samples[j];
    return Math.sqrt(s / win);
  };
  while (start < end && rms(start) < threshold) start += win;
  while (end > start && rms(Math.max(0, end - win)) < threshold) end -= win;
  const pad = Math.floor(rate * 0.08);
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}