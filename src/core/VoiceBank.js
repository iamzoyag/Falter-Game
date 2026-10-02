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
    this.enabled = enabled; // remote (Gemini) voice
    this.local = "speechSynthesis" in window;
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
    if (!text || (!this.enabled && !this.local)) return false;
    if (dropIfBusy && this.speaking) return false; // don't talk over ourselves
    let buf = this.cache.get(text);
    if (!buf && this.enabled) {
      buf = await Promise.race([this.get(text), sleep(maxWaitMs).then(() => null)]);
    }
    if (dropIfBusy && this.speaking) return false;
    this.speaking = true;
    try {
      if (buf) await this.audio.playVoice(buf, position, { gain, rate });
      else if (this.local) await this._speakLocal(text, rate);
      else return false;
    } finally {
      this.speaking = false;
    }
    return true;
  }

  _speakLocal(text, rate = 1) {
    const synth = window.speechSynthesis;
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(synth.getVoices());
      if (v) u.voice = v;
      u.rate = 0.8 * rate;
      u.pitch = 0.4;
      u.volume = 0.9;
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      u.onend = finish;
      u.onerror = finish;
      setTimeout(finish, 1500 + text.length * 110); // never hang if the engine goes quiet
      this.audio.duckDrone(Math.min(6, 0.8 + text.length * 0.07));
      synth.cancel();
      synth.speak(u);
    });
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

// macOS ships a voice literally called "Whisper"; otherwise take a low English voice.
function pickVoice(voices) {
  for (const name of ["Whisper", "Bad News", "Daniel", "Fred", "Google UK English Male"]) {
    const v = voices.find((x) => x.name.startsWith(name));
    if (v) return v;
  }
  return voices.find((x) => x.lang?.startsWith("en")) || null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}