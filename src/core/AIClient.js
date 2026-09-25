// Thin fetch wrapper around the backend (see /server). Every call is
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
  async requestBeatCopy({ signalType, localFallbackText, dossier, questionIndex }, timeoutMs = 1000) {
    return postJson(`${this.baseUrl}/api/beat`, {
      signalType,
      localFallbackText,
      dossier,
      questionIndex
    }, timeoutMs);
  }

  /** One-time, at quiz end — can afford to wait longer since the ending screen shows a loading beat regardless. */
  async requestEndingReport({ dossier }, timeoutMs = 7000) {
    return postJson(`${this.baseUrl}/api/ending`, { dossier }, timeoutMs);
  }

  /** Periodic, slow-moving — nudges pacing, never makes a hard real-time decision. */
  async requestPacingHint({ dossier, recentSignals }, timeoutMs = 2500) {
    return postJson(`${this.baseUrl}/api/pacing`, { dossier, recentSignals }, timeoutMs);
  }
}
