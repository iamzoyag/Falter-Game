import { on, emit } from "../core/EventBus.js";

// Central "brain": takes in continuous vision/audio signals every frame plus
// quiz events, and decides when to fire a horror beat. It never touches
// audio playback or the DOM directly — it emits events describing what
// should happen; main.js wires those to AudioEngine + the UI.
//
// AI involvement (optional, off unless the player opts in and a backend is
// reachable) is layered on top of an already-complete deterministic system,
// never a replacement for it:
//   - WHEN a beat fires and its audio/visual (stinger, flash, shake, the
//     delayed-feed glitch) is decided entirely locally, instantly, every
//     time — that timing has to feel reliable and can't wait on a network
//     round-trip.
//   - WHAT the beat's whisper says can be upgraded by the AI: the local
//     template text is shown immediately (so there's never a silent gap),
//     and if the backend answers within about a second, that text quietly
//     replaces it — a line sharpening into something more specific reads as
//     "it thought about that" rather than as UI lag.
//   - Long-run PACING (how aggressive things feel) can be nudged by a slow,
//     periodic AI "read" of the whole dossier — clamped tightly so a bad or
//     slow response can only ever soften or sharpen the existing system a
//     little, never break it.

const COOLDOWNS_MS = {
  blink: 20000,
  lookAway: 26000,
  motion: 30000,
  occlusion: 45000,
  brightness: 22000,
  mismatch: 9000,
  callback: 35000,
  noise: 24000,
  breath: 32000
};

const WHISPERS = {
  blink: [
    "you were gone longer than that.",
    "something changed while your eyes were closed.",
    "blink again. see if it's still there."
  ],
  lookAway: [
    "what did you just look at?",
    "you shouldn't have looked away.",
    "it moved while you weren't watching."
  ],
  motion: [
    "something's behind you.",
    "that wasn't you moving.",
    "hold still."
  ],
  occlusion: [
    "why did you cover it?",
    "you can't hide from a question.",
    "put it back."
  ],
  brightness: [
    "did the light just change?",
    "someone's adjusting something."
  ],
  scriptedGlitch: [
    "that footage is a few seconds old.",
    "you're not watching live anymore.",
    "catch up."
  ],
  noise: [
    "what was that?",
    "did you hear that too?",
    "that didn't come from your speakers."
  ],
  breath: [
    "you can slow that down, you know.",
    "i can hear you.",
    "in. out. in."
  ]
};

// Forces the delayed-feed mechanic to happen at least once even for players
// who never naturally blink-too-long or look away, so nobody misses it.
const SCRIPTED_GLITCH_AFTER_QUESTION_INDEX = 2;

// How far a periodic AI pacing read is allowed to move things — intentionally
// tight, so it can only ever season the deterministic system, not steer it.
const PACING_BIAS_CLAMP = { intensity: 0.18, cooldownMultiplier: [0.7, 1.3] };
const PACING_POLL_INTERVAL_MS = 24000;

export class HorrorDirector {
  /** @param {{ aiClient?: import('../core/AIClient').AIClient, aiEnabled?: boolean }} opts */
  constructor({ aiClient = null, aiEnabled = false } = {}) {
    this._cooldowns = {};
    this._answeredCount = 0;
    this._mismatchCount = 0;
    this._totalQuestions = 0;
    this._dossier = [];
    this._scriptedGlitchFired = false;
    this._pendingCallbacks = [];
    this._recentBeatLog = [];
    this._currentQuestionIndex = -1;

    this._aiClient = aiClient;
    this._aiEnabled = aiEnabled && !!aiClient;
    this._pacingBias = { intensity: 0, cooldownMultiplier: 1 };
    this._lastPacingPollMs = 0;
    this._aiFocusQuestionId = null;

    on("question-shown", (e) => {
      this._totalQuestions = e.detail.total;
    });

    on("answer-recorded", (e) => {
      this._answeredCount += 1;
      this._dossier.push(e.detail);
      if (e.detail.mismatch) {
        this._mismatchCount += 1;
        this._maybeFire("mismatch", () => ({ kind: "flash", intensity: 0.15 }));
        this._queueCallback(e.detail);
      }
      emit("director-intensity", { amount: this._intensity() });
    });

    on("quiz-complete", () => {
      emit("director-summary", {
        mismatchCount: this._mismatchCount,
        total: this._totalQuestions,
        dossier: this._dossier,
        aiEnabled: this._aiEnabled
      });
    });
  }

  _intensity() {
    const progress = this._totalQuestions ? this._answeredCount / this._totalQuestions : 0;
    const mismatchFactor = Math.min(1, this._mismatchCount / 3);
    const base = progress * 0.6 + mismatchFactor * 0.4;
    return Math.min(1, Math.max(0, base + this._pacingBias.intensity));
  }

  _queueCallback(entry) {
    // Deploy this quoted callback a little while later, not immediately —
    // delayed recognition is what makes it land as "it was paying attention".
    this._pendingCallbacks.push({ entry, readyAtMs: performance.now() + 12000 + Math.random() * 8000 });
  }

  _onCooldown(key, nowMs) {
    return (this._cooldowns[key] || 0) > nowMs;
  }

  _arm(key, nowMs) {
    const duration = (COOLDOWNS_MS[key] || 20000) * this._pacingBias.cooldownMultiplier;
    this._cooldowns[key] = nowMs + duration;
  }

  _logBeat(key, nowMs) {
    this._recentBeatLog.push({ key, t: nowMs });
    while (this._recentBeatLog.length > 12) this._recentBeatLog.shift();
  }

  _maybeFire(key, buildBeat, nowMs = performance.now()) {
    if (this._onCooldown(key, nowMs)) return false;
    this._arm(key, nowMs);
    this._logBeat(key, nowMs);

    const beat = buildBeat();
    const pool = WHISPERS[key === "mismatch" ? null : key];
    if (key !== "mismatch" && pool) {
      beat.text = pool[Math.floor(Math.random() * pool.length)];
    }
    emit("director-beat", beat);

    if (this._aiEnabled && beat.text) this._tryUpgradeWhisper(key, beat.text);
    return true;
  }

  async _tryUpgradeWhisper(signalType, localFallbackText) {
    const result = await this._aiClient.requestBeatCopy({
      signalType,
      localFallbackText,
      dossier: this._compactDossier(),
      questionIndex: this._currentQuestionIndex
    });
    if (result?.text) emit("director-whisper-update", { text: result.text });
  }

  _compactDossier() {
    return this._dossier.map((d) => ({
      prompt: d.prompt,
      chosenText: d.chosenText,
      claimedFeeling: d.expressionHint,
      actualExpression: d.measured?.dominant ?? "unknown",
      mismatch: d.mismatch
    }));
  }

  async _pollPacing(nowMs) {
    if (!this._aiEnabled || nowMs - this._lastPacingPollMs < PACING_POLL_INTERVAL_MS) return;
    if (this._dossier.length === 0) return;
    this._lastPacingPollMs = nowMs;

    const hint = await this._aiClient.requestPacingHint({
      dossier: this._compactDossier(),
      recentSignals: this._recentBeatLog.map((b) => b.key)
    });
    if (!hint) return;

    const intensity = clamp(hint.intensityBias ?? 0, -PACING_BIAS_CLAMP.intensity, PACING_BIAS_CLAMP.intensity);
    const cooldownMultiplier = clamp(
      hint.cooldownMultiplier ?? 1,
      PACING_BIAS_CLAMP.cooldownMultiplier[0],
      PACING_BIAS_CLAMP.cooldownMultiplier[1]
    );
    this._pacingBias = { intensity, cooldownMultiplier };
    this._aiFocusQuestionId = hint.focusQuestionId || null;
    emit("director-intensity", { amount: this._intensity() });
    if (hint.caseFileLine) emit("director-casefile", { text: hint.caseFileLine });
  }

  /**
   * Call every animation frame.
   * @param {{face: object, env: object, mic: object|null, delayedFeed: import('../vision/DelayedFeed').DelayedFeed}} signals
   * @param {number} nowMs
   * @param {number} questionIndex current quiz question index
   */
  tick({ face, env, mic, delayedFeed }, nowMs, questionIndex) {
    this._currentQuestionIndex = questionIndex;

    if (face?.blinkTooLong) {
      this._maybeFire("blink", () => ({
        kind: "audio+whisper",
        stinger: "static",
        position: { x: 0, y: 0.2, z: -0.3 }
      }), nowMs);
    }

    if (face?.lookAwayTooLong) {
      const fired = this._maybeFire("lookAway", () => ({
        kind: "audio+whisper",
        stinger: "breath",
        position: { x: -1, y: 0, z: -0.5 }
      }), nowMs);
      if (fired) delayedFeed.startGlitch(3 + Math.random() * 2, 3500);
    }

    if (env?.inMotion && face?.faceVisible && !face?.lookingAway) {
      this._maybeFire("motion", () => ({
        kind: "audio+whisper+shake",
        stinger: "heartbeat",
        position: { x: 0.8, y: -0.3, z: -1.2 }
      }), nowMs);
    }

    if (env?.likelyCovered) {
      this._maybeFire("occlusion", () => ({
        kind: "audio+whisper+flash",
        stinger: "static",
        position: { x: 0, y: 0, z: -0.2 },
        intensity: 0.4
      }), nowMs);
    } else if (env?.brightnessJump) {
      this._maybeFire("brightness", () => ({ kind: "whisper" }), nowMs);
    }

    if (mic?.suddenNoise) {
      this._maybeFire("noise", () => ({
        kind: "audio+whisper",
        stinger: "click",
        position: { x: -0.6, y: 0, z: -1 }
      }), nowMs);
    }

    if (mic?.breathingLikely) {
      this._maybeFire("breath", () => ({
        kind: "whisper",
      }), nowMs);
    }

    if (
      !this._scriptedGlitchFired &&
      questionIndex >= SCRIPTED_GLITCH_AFTER_QUESTION_INDEX &&
      delayedFeed.isLive()
    ) {
      this._scriptedGlitchFired = true;
      delayedFeed.startGlitch(4, 4000);
      const text = WHISPERS.scriptedGlitch[Math.floor(Math.random() * WHISPERS.scriptedGlitch.length)];
      emit("director-beat", {
        kind: "audio+whisper",
        stinger: "static",
        position: { x: 0, y: 0, z: -0.5 },
        text
      });
      if (this._aiEnabled) this._tryUpgradeWhisper("scriptedGlitch", text);
    }

    // Drain queued dossier callbacks
    this._pendingCallbacks = this._pendingCallbacks.filter((c) => {
      if (nowMs < c.readyAtMs) return true;
      if (!this._onCooldown("callback", nowMs)) {
        const ready = this._pendingCallbacks.filter((c) => nowMs >= c.readyAtMs);
        if (ready.length) {
          const focused = this._aiFocusQuestionId
            ? ready.find((c) => c.entry.questionId === this._aiFocusQuestionId)
            : null;
          const chosen = focused || ready.reduce((best, c) =>
            (c.entry.measured?.dominantScore ?? 0) > (best.entry.measured?.dominantScore ?? 0) ? c : best
          );
          this._pendingCallbacks = this._pendingCallbacks.filter((c) => c !== chosen);

          this._arm("callback", nowMs);
          this._logBeat("callback", nowMs);
          const text = `you said "${chosen.entry.chosenText.replace(/\.$/, "")}." your face didn't agree.`;
          emit("director-beat", { kind: "whisper", text });
          if (this._aiEnabled) this._tryUpgradeWhisper("callback", text);
        }
      }
      return false;
    });

    this._pollPacing(nowMs);
  }
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
