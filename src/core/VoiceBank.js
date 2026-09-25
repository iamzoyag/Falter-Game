// Spoken whispers. Lines are synthesized by the backend (Gemini TTS), decoded
// into AudioBuffers and cached. Common lines are pre-generated at the start so
// they play instantly; new lines (AI-written, interrogator questions) are
// fetched on demand and dropped if they'd arrive too late to still make sense.

export class VoiceBank {
  /**
   * @param {import('./AIClient').AIClient} aiClient
   * @param {import('./AudioEngine').AudioEngine} audio
   * @param {boolean} enabled only true when the player opted into AI
   */
  constructor(aiClient, audio, enabled) {
    this.ai = aiClient;
    this.audio = audio;
    this.enabled = enabled;
    this.cache = new Map();   // text -> AudioBuffer
    this.pending = new Map(); // text -> Promise<AudioBuffer|null>
    this.speaking = false;
  }

  /** Pre-generate a pool of lines, two at a time (keeps us under rate limits). */
  async prefetch(lines) {
    if (!this.enabled) return;
    const queue = [...new Set(lines)];
    const worker = async () => {
      while (queue.length) await this.get(queue.shift());
    };
    await Promise.all([worker(), worker()]);
  }

  get(text) {
    if (!this.enabled || !text) return Promise.resolve(null);
    if (this.cache.has(text)) return Promise.resolve(this.cache.get(text));
    if (this.pending.has(text)) return this.pending.get(text);

    const p = this.ai.requestSpeech({ text }).then((res) => {
      this.pending.delete(text);
      if (!res?.audio) return null;
      const buf = pcmToAudioBuffer(this.audio.ctx, res.audio, res.sampleRate || 24000);
      if (buf) this.cache.set(text, buf);
      return buf;
    });
    this.pending.set(text, p);
    return p;
  }

  /**
   * Speak a line. If it's not cached, waits up to `maxWaitMs` for synthesis;
   * later than that and the moment has passed, so it stays silent.
   * Resolves true if it played (after playback finishes).
   */
  async speak(text, { position, maxWaitMs = 2500, gain = 1, rate = 1, dropIfBusy = false } = {}) {
    if (!this.enabled || !text) return false;
    if (dropIfBusy && this.speaking) return false; // don't talk over ourselves
    let buf = this.cache.get(text);
    if (!buf) {
      buf = await Promise.race([this.get(text), sleep(maxWaitMs).then(() => null)]);
    }
    if (!buf || (dropIfBusy && this.speaking)) return false;
    this.speaking = true;
    try {
      await this.audio.playVoice(buf, position, { gain, rate });
    } finally {
      this.speaking = false;
    }
    return true;
  }
}

/** base64 16-bit little-endian mono PCM -> AudioBuffer */
function pcmToAudioBuffer(ctx, base64, sampleRate) {
  try {
    const bin = atob(base64);
    const n = Math.floor(bin.length / 2);
    if (!n) return null;
    const buf = ctx.createBuffer(1, n, sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      out[i] = v / 0x8000;
    }
    return buf;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}