// Thin fetch wrapper around the backend. Every call is
// timeout-bounded and swallows its own errors, returning null instead of
// throwing — the game must stay fully playable with zero network access,
// so nothing downstream should ever have to special-case "the AI failed."

async function postJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // network error, timeout, backend not running, CORS, etc.
  } finally {
    clearTimeout(timer);
  }
}

export class AIClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async healthCheck(timeoutMs = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Ask the backend to write (or rewrite) the line for a beat that's already
   * firing. Called AFTER the local fallback text has already been shown —
   * this is purely "can we do better within ~1s," never a blocker.
   */
  async requestBeatCopy({ signalType, localFallbackText, dossier, questionIndex, roomObjects }, timeoutMs = 1000) {
    return postJson(`${this.baseUrl}/api/beat`, {
      signalType, localFallbackText, dossier, questionIndex, roomObjects
    }, timeoutMs);
  }

  /** One-time, at quiz end — can afford to wait longer since the ending screen shows a loading beat regardless. */
  async requestEndingReport({ dossier, interrogations, stats }, timeoutMs = 9000) {
    return postJson(`${this.baseUrl}/api/ending`, { dossier, interrogations, stats }, timeoutMs);
  }

  /** Periodic, slow-moving — nudges pacing, never makes a hard real-time decision. */
  async requestPacingHint({ dossier, recentSignals }, timeoutMs = 2500) {
    return postJson(`${this.baseUrl}/api/pacing`, { dossier, recentSignals }, timeoutMs);
  }

  /**
   * A personalised line for Mochi (or the whisper after one of her events).
   * Called after the local line is already on screen; replaces it only if fast.
   */
  async requestMochiLine(payload, timeoutMs = 1300) {
    return postJson(`${this.baseUrl}/api/mochi`, payload, timeoutMs);
  }

  /** Text -> speech. Returns { audio: base64 16-bit PCM, sampleRate }. */
  async requestSpeech({ text }, timeoutMs = 9000) {
    return postJson(`${this.baseUrl}/api/tts`, { text }, timeoutMs);
  }

  /** Spoken answer -> text. `audio` is base64 WAV. */
  async requestTranscription({ audio, mimeType }, timeoutMs = 15000) {
    return postJson(`${this.baseUrl}/api/transcribe`, { audio, mimeType }, timeoutMs);
  }

  /** The interrogator's next follow-up question. */
  async requestInterrogation({ turns, dossier, roomObjects }, timeoutMs = 7000) {
    return postJson(`${this.baseUrl}/api/interrogate`, { turns, dossier, roomObjects }, timeoutMs);
  }
}