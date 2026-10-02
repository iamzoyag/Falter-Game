import { on, emit } from "../core/EventBus.js";
import { FEAR_CHANNELS } from "../vision/FaceTracker.js";

// Central "brain": takes in continuous vision/audio signals every frame plus
// quiz events, and decides when to fire a horror beat. It emits events
// describing what should happen (main.js wires those to audio + UI), and
// drives the feed's slow corruption (warp creep, unblinking reflection,
// the figure) directly, since that's pacing, not rendering.
//
// AI involvement stays layered on top of a complete deterministic system:
//   - WHEN a beat fires is always local and instant.
//   - WHAT a whisper says can be upgraded by the AI within ~1s.
//   - Spoken lines wait for that upgrade, then speak whichever text won.
//   - Long-run PACING can be nudged by a slow, clamped, periodic AI read.

const COOLDOWNS_MS = {
  blink: 20000,
  lookAway: 26000,
  motion: 30000,
  occlusion: 45000,
  brightness: 22000,
  mismatch: 9000,
  callback: 30000,
  noise: 24000,
  breath: 32000,
  unblink: 9000,
  smileClip: 50000,
  room: 40000,
  secondPerson: 60000,
  playerVoice: 70000,
  darkLine: 30000,
  figureTurn: 20000,
  figureClimax: 30000,
  flicker: 12000,
  imageFlash: 30000
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
  motion: ["something's behind you.", "that wasn't you moving.", "hold still."],
  occlusion: ["why did you cover it?", "you can't hide from a question.", "put it back."],
  brightness: ["did the light just change?", "someone's adjusting something."],
  scriptedGlitch: ["that footage is a few seconds old.", "you're not watching live anymore.", "catch up."],
  noise: ["what was that?", "did you hear that too?", "that didn't come from your speakers."],
  breath: ["you can slow that down, you know.", "i can hear you.", "in. out. in."],
  smileClip: ["why are you smiling?", "that's a nice smile. keep it.", "you're smiling. you didn't notice."],
  darkHint: ["stay calm. the lights stay on when you're calm."],
  dark: ["it's easier to see you in the dark.", "the calmer you are, the more you can see."],
  figureTurnBack: ["it wasn't there when you looked.", "you checked. good. keep checking.", "it moves when you look."],
  figureClimax: ["don't turn around.", "it's right behind you. don't turn around."],
  secondPerson: ["who's that behind you?", "you said you were alone."]
};

/** Every fixed line, so the voice bank can synthesize them up front. */
export const PREFETCH_LINES = Object.values(WHISPERS).flat();

const ROOM_LINES = [
  "the {obj}, {where}. was it like that when you sat down?",
  "don't look at the {obj}.",
  "something was standing by the {obj}.",
  "the {obj} {where}. it's closer than it was.",
  "keep the {obj} where you can see it."
];

// Forces the delayed-feed mechanic at least once, even for players who never
// look away long enough.
const SCRIPTED_GLITCH_AFTER_STAGE_ANSWERS = 2;

const PACING_BIAS_CLAMP = { intensity: 0.18, cooldownMultiplier: [0.7, 1.3] };
const PACING_POLL_INTERVAL_MS = 24000;

const CREEP_PER_ANSWER = 0.03;             // a few pixels at a time
const FIGURE_MAX_STEP = 5;
const FIGURE_OPACITY = [0, 0.45, 0.6, 0.75, 0.87, 0.95];

export class HorrorDirector {
  /**
   * @param {{ aiClient?: import('../core/AIClient').AIClient, aiEnabled?: boolean,
   *           figures?: import('../vision/FigureLibrary').FigureLibrary }} opts
   */
  constructor({ aiClient = null, aiEnabled = false, figures = null } = {}) {
    this._cooldowns = {};
    this._answeredCount = 0;
    this._stageAnswered = 0;
    this._mismatchCount = 0;
    this._flatCount = 0;
    this._totalQuestions = 0;
    this._dossier = [];
    this._interrogations = [];
    this._scriptedGlitchFired = false;
    this._pendingCallbacks = [];
    this._recentBeatLog = [];
    this._currentQuestionIndex = -1;

    this._aiClient = aiClient;
    this._aiEnabled = aiEnabled && !!aiClient;
    this._pacingBias = { intensity: 0, cooldownMultiplier: 1 };
    this._lastPacingPollMs = 0;
    this._aiFocusQuestionId = null;

    this.features = {};
    this.stageId = null;
    this._suspended = false;
    this._lastTickMs = performance.now();

    this.creep = 0;
    this.dark = 0;
    this._darkHintShown = false;
    this._lastDarkEmitted = -1;

    this._prevBlinking = false;
    this._unblinkHold = null;

    this._bestFlinch = 0;
    this._lastFlinchSnap = 0;

    this._figures = figures;
    this._fig = { active: false, step: 0, side: 0.8, image: null, hiddenUntil: 0, turnSince: null, lastAdvance: 0, lookedBack: false };

    this.room = { objects: [], personCount: 1 };
    this._hasPlayerVoice = false;
    this.stats = { lookAways: 0, blinksHeld: 0, mirrorLookAways: 0, figureTurns: 0 };

    on("question-shown", (e) => {
      this._totalQuestions = e.detail.total;
    });

    on("answer-recorded", (e) => {
      const entry = e.detail;
      this._answeredCount += 1;
      this._stageAnswered += 1;
      this._dossier.push(entry);
      if (this.features.creep) this.creep = Math.min(1, this.creep + CREEP_PER_ANSWER);

      if (entry.mismatch) {
        this._mismatchCount += 1;
        if (this.features.beats) {
          this._maybeFire("mismatch", () => ({ kind: "flash", intensity: 0.15 }));
          this._queueCallback(entry, callbackText(entry), 1 + entry.tellCount);
        }
      } else if (entry.flat) {
        this._flatCount += 1;
        if (this.features.beats && Math.random() < 0.4) {
          this._queueCallback(entry, `you said "${trimDot(entry.chosenText)}." your face didn't move.`, 0.5, 4000);
        }
      }
      emit("director-intensity", { amount: this._intensity() });
    });

    on("interrogation-recorded", (e) => this._interrogations.push(e.detail));
  }

  // ------------------------------------------------------------ public controls

  setStage(stage) {
    this.stageId = stage.id;
    this.features = stage.features || {};
    this._stageAnswered = 0;
    if (!this.features.figure) this._fig.active = false;
  }

  /** While a segment (mirror, task, interview) runs, the director stops improvising. */
  suspend(v) { this._suspended = v; }

  setRoom(room) { this.room = room; }
  setPlayerVoiceAvailable(v) { this._hasPlayerVoice = v; }
  bumpCreep(amount) { this.creep = Math.min(1, this.creep + amount); }

  /** Say something right now (text + voice), outside the normal beat logic. */
  say(text, { stinger = null, position = null, kind = "whisper", intensity } = {}) {
    emit("director-beat", { kind, text, stinger, position: position || { x: 0, y: 0, z: -0.5 }, intensity });
    if (this.features.voice) emit("director-speak", { text, position: voicePosition() });
  }

  spikeDarkness(amount) {
    this.dark = clamp(this.dark + amount, 0, 1);
  }

  /** The figure takes a step closer (only moves while you're not looking). */
  advanceFigure(nowMs = performance.now()) {
    const fig = this._fig;
    if (!this.features.figure || !fig.active || nowMs < fig.hiddenUntil) return;
    if (nowMs - fig.lastAdvance < 2500) return;
    fig.lastAdvance = nowMs;
    fig.step = Math.min(FIGURE_MAX_STEP, fig.step + 1);
    if (fig.step === FIGURE_MAX_STEP && !this._onCooldown("figureClimax", nowMs)) {
      this._arm("figureClimax", nowMs);
      this.say(pick(WHISPERS.figureClimax), { stinger: "heartbeat", position: { x: 0.3, y: 0, z: 0.4 } });
      // if they don't turn around, it eases back a little so it can come again
      setTimeout(() => { if (fig.step === FIGURE_MAX_STEP) fig.step = 3; }, 7000);
    }
  }

  /** Pick a figure image if none yet, and return it (for segments that show the figure themselves). */
  prepareFigureImage() {
    if (!this._fig.image) this._fig.image = this._figures?.random() || null;
    return this._fig.image;
  }

  setFigureStep(step) {
    this._ensureFigure();
    this._fig.step = clamp(step, 0, FIGURE_MAX_STEP);
    this._fig.hiddenUntil = 0;
  }

  /** Figure rect/opacity for a given step (used by the close-your-eyes replay too). */
  figureAt(step, face) {
    if (step <= 0) return null;
    const fig = this._fig;
    const t = (clamp(step, 1, FIGURE_MAX_STEP) - 1) / (FIGURE_MAX_STEP - 1);
    const img = fig.image;
    const imgAspect = img ? img.width / img.height : 0.5;
    const h = lerp(0.38, 1.15, t);
    const w = h * imgAspect * 0.75; // canvas is 4:3
    const faceX = face?.keypoints?.nose.x ?? 0.5;
    const nearX = faceX + (fig.side > faceX ? 1 : -1) * 0.3;
    const cx = lerp(fig.side, nearX, t);
    const bottom = lerp(0.82, 1.25, t);
    // photo figures are pale (they read in a dark room AND in 1-bit); the silhouette fallback stays dark
    const dark = img?.pale ? 0.95 : 0.3;
    return { rect: [cx - w / 2, bottom - h, w, h], opacity: FIGURE_OPACITY[Math.round(lerp(1, FIGURE_MAX_STEP, t))], dark };
  }

  getSummary() {
    return {
      dossier: this._dossier,
      compactDossier: this._compactDossier(),
      interrogations: this._interrogations,
      mismatchCount: this._mismatchCount,
      flatCount: this._flatCount,
      total: this._totalQuestions,
      stats: { ...this.stats, creep: +this.creep.toFixed(2), maxFlinchZ: +this._bestFlinch.toFixed(1) },
      aiEnabled: this._aiEnabled
    };
  }

  // ------------------------------------------------------------ internals

  _intensity() {
    const progress = this._totalQuestions ? this._answeredCount / this._totalQuestions : 0;
    const mismatchFactor = Math.min(1, this._mismatchCount / 3);
    const base = progress * 0.55 + mismatchFactor * 0.3 + this.dark * 0.25;
    return clamp(base + this._pacingBias.intensity, 0, 1);
  }

  _queueCallback(entry, text, weight, minDelayMs = 12000) {
    // Delayed recognition is what makes it land as "it was paying attention".
    this._pendingCallbacks.push({
      entry, text, weight,
      readyAtMs: performance.now() + minDelayMs + Math.random() * 8000
    });
    while (this._pendingCallbacks.length > 6) this._pendingCallbacks.shift();
    if (this.features.voice) emit("director-prefetch-voice", { text });
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

  _maybeFire(key, buildBeat, nowMs = performance.now(), textOverride = null) {
    if (this._onCooldown(key, nowMs)) return false;
    this._arm(key, nowMs);
    this._logBeat(key, nowMs);

    const beat = buildBeat();
    const pool = WHISPERS[key];
    if (textOverride) beat.text = textOverride;
    else if (key !== "mismatch" && pool) beat.text = pick(pool);
    this._emitBeat(key, beat);
    return true;
  }

  /** Show a beat now; upgrade its text with AI if fast enough; then speak the final text. */
  async _emitBeat(key, beat) {
    emit("director-beat", beat);
    if (!beat.text) return;
    let finalText = beat.text;
    if (this._aiEnabled) {
      const upgraded = await this._tryUpgradeWhisper(key, beat.text);
      if (upgraded) finalText = upgraded;
    }
    if (this.features.voice) emit("director-speak", { text: finalText, fallback: beat.text, position: voicePosition() });
  }

  async _tryUpgradeWhisper(signalType, localFallbackText) {
    const result = await this._aiClient.requestBeatCopy({
      signalType,
      localFallbackText,
      dossier: this._compactDossier(),
      questionIndex: this._currentQuestionIndex,
      roomObjects: this.room.objects
    });
    if (result?.text) {
      emit("director-whisper-update", { text: result.text });
      return result.text;
    }
    return null;
  }

  // Includes questionId + principle now — before, the AI was asked to pick a
  // focusQuestionId it had never been shown, and prompts referenced a
  // principle field that was never sent.
  _compactDossier() {
    return this._dossier.map((d) => ({
      questionId: d.questionId,
      principle: d.principle,
      prompt: d.prompt,
      chosenText: d.chosenText,
      claimedFeeling: d.expressionHint,
      faceVerdict: d.faceVerdict,
      reactions: d.spikes?.map((s) => s.channel) ?? [],
      tells: Object.entries(d.tells || {}).filter(([, v]) => v).map(([k]) => k),
      latencyMs: d.latencyMs,
      firstHoveredAnswer: d.cursor?.firstHoverText ?? null,
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

  // ---- fear has consequences: the screen darkens while you react or look away
  _updateDarkness(face, nowMs, dt) {
    if (!this.features.darkness) {
      this.dark = Math.max(0, this.dark - 0.5 * dt);
    } else {
      const reacting = face?.reaction >= 3 && FEAR_CHANNELS.includes(face.dominantExpression);
      // sustained look-aways only (a glance doesn't count), or the face gone for a moment
      const away = face && ((!face.faceVisible && face.faceMissingMs > 800) || face.lookAwayTooLong);
      if (reacting) this.dark += 0.45 * dt;
      else if (away) this.dark += 0.25 * dt;
      else this.dark -= 0.15 * dt;
      this.dark = clamp(this.dark, 0, 1);

      if (!this._darkHintShown && this.dark > 0.35) {
        this._darkHintShown = true;
        this.say(WHISPERS.darkHint[0]);
      }
      if (this.dark > 0.85 && !this._onCooldown("darkLine", nowMs)) {
        this._arm("darkLine", nowMs);
        this.say(pick(WHISPERS.dark), { stinger: "breath", position: { x: -0.4, y: 0, z: 0.5 } });
        this.advanceFigure(nowMs);
      }
    }
    if (Math.abs(this.dark - this._lastDarkEmitted) > 0.01) {
      this._lastDarkEmitted = this.dark;
      emit("director-darkness", { amount: this.dark });
    }
  }

  _applyBaseWarp(feed) {
    const c = this.creep, d = this.dark;
    feed.setBaseWarp({
      smile: c * 0.35,
      widen: c * 0.15,
      eyeScale: c * 0.3,
      jaw: c * 0.2,
      bgDark: 0.08 + d * 0.6 + c * 0.2,
      vignette: 0.2 + d * 0.5,
      grain: 0.14 + c * 0.2,
      desat: 0.15 + c * 0.3,
      pixel: 2 + Math.round(c * 3)
    });
  }

  // ---- "your reflection didn't blink"
  _updateUnblink(face, feed, nowMs) {
    const blinking = !!face?.blinking;
    if (blinking && !this._prevBlinking && feed.isLive() && !this._onCooldown("unblink", nowMs)) {
      if (Math.random() < 0.3 + this.creep * 0.5) {
        const c = this.creep;
        const warp = {
          smile: 0.25 + c * 0.8,
          eyeScale: 0.15 + c * 0.4,
          eyesBlack: c > 0.2 ? 1 : 0,
          bgDark: 0.55,
          vignette: 0.5,
          desat: 0.4,
          oneBit: c > 0.15 ? 1 : 0.6, // the staring reflection drops into the 1-bit look
          pixel: 3
        };
        if (feed.freezeLastOpen(nowMs + 400, warp)) {
          this._arm("unblink", nowMs);
          this._logBeat("unblink", nowMs);
          this._unblinkHold = 250 + c * 700; // how long it keeps staring after YOUR eyes reopen
        }
      }
    }
    if (this._unblinkHold !== null) {
      if (blinking) feed.extendMode(nowMs + 200);
      else {
        feed.extendMode(nowMs + this._unblinkHold);
        this._unblinkHold = null;
      }
    }
    this._prevBlinking = blinking;
  }

  // ---- the figure behind you
  _ensureFigure() {
    const fig = this._fig;
    if (fig.active) return;
    fig.active = true;
    fig.step = 1;
    fig.image = this._figures?.random() || null;
    if (fig.image) this._feed?.setFigureImage(fig.image);
  }

  _updateFigure(face, feed, nowMs) {
    if (!this.features.figure) {
      feed.setFigure(null);
      return;
    }
    this._ensureFigure();
    const fig = this._fig;
    if (!fig.image) fig.image = this._figures?.random() || null;
    if (fig.image) feed.setFigureImage(fig.image); // no-op if already uploaded
    if (face?.keypoints && fig.step <= 1) fig.side = face.keypoints.nose.x > 0.5 ? 0.18 : 0.82;

    // Turning around to check the real room makes it vanish.
    const turned = face && (!face.faceVisible ? face.faceMissingMs > 700 : Math.abs(face.yawProxy) > 0.28);
    if (turned) fig.turnSince ??= nowMs;
    else fig.turnSince = null;
    if (fig.turnSince && nowMs - fig.turnSince > 350 && fig.step >= 2 && !this._onCooldown("figureTurn", nowMs)) {
      this._arm("figureTurn", nowMs);
      this.stats.figureTurns += 1;
      fig.step = 0;
      fig.hiddenUntil = nowMs + 20000;
      fig.lookedBack = true;
      setTimeout(() => { if (fig.step === 0) fig.step = 1; }, 20000);
    }
    if (fig.lookedBack && face?.faceVisible && Math.abs(face.yawProxy) < 0.15) {
      fig.lookedBack = false;
      this.say(pick(WHISPERS.figureTurnBack));
    }

    const visible = nowMs > fig.hiddenUntil && fig.step > 0;
    feed.setFigure(visible ? this.figureAt(fig.step, face) : null);
  }

  _trackFlinch(face, feed, nowMs) {
    if (!face?.reaction || face.reaction < 3.5) return;
    if (face.reaction > this._bestFlinch && nowMs - this._lastFlinchSnap > 1200) {
      this._bestFlinch = face.reaction;
      this._lastFlinchSnap = nowMs;
      feed.snapshot("flinch");
    }
  }

  /**
   * Call every animation frame.
   * @param {{face: object, env: object, mic: object|null, feed: import('../vision/DelayedFeed').DelayedFeed}} signals
   */
  tick({ face, env, mic, feed }, nowMs, questionIndex) {
    const dt = Math.min(0.1, (nowMs - this._lastTickMs) / 1000);
    this._lastTickMs = nowMs;
    this._currentQuestionIndex = questionIndex;
    this._feed = feed;

    this._trackFlinch(face, feed, nowMs);
    if (this._suspended) return;

    const f = this.features;
    this._updateDarkness(face, nowMs, dt);
    this._applyBaseWarp(feed);
    if (f.unblink) this._updateUnblink(face, feed, nowMs);
    this._updateFigure(face, feed, nowMs);

    if (face?.lookAwayTooLong && !this._wasAway) this.stats.lookAways += 1;
    this._wasAway = !!face?.lookAwayTooLong;

    if (!f.beats) return;

    if (face?.blinkTooLong) {
      const fired = this._maybeFire("blink", () => ({
        kind: "audio+whisper", stinger: "static", position: { x: 0, y: 0.2, z: -0.3 }
      }), nowMs);
      if (fired) { this.stats.blinksHeld += 1; this.advanceFigure(nowMs); }
    }

    if (face?.lookAwayTooLong) {
      const fired = this._maybeFire("lookAway", () => ({
        kind: "audio+whisper", stinger: "breath", position: { x: -1, y: 0, z: -0.5 }
      }), nowMs);
      if (fired) {
        if (feed.isLive()) feed.startGlitch(3 + Math.random() * 2, 3500);
        this.advanceFigure(nowMs);
      }
    }

    if (env?.inMotion && face?.faceVisible && !face?.lookingAway) {
      this._maybeFire("motion", () => ({
        kind: "audio+whisper+shake", stinger: "heartbeat", position: { x: 0.8, y: -0.3, z: -1.2 }
      }), nowMs);
    }

    if (env?.likelyCovered) {
      this._maybeFire("occlusion", () => ({
        kind: "audio+whisper+flash", stinger: "static", position: { x: 0, y: 0, z: -0.2 }, intensity: 0.4
      }), nowMs);
    } else if (env?.brightnessJump) {
      this._maybeFire("brightness", () => ({ kind: "whisper" }), nowMs);
    }

    if (mic?.suddenNoise) {
      this._maybeFire("noise", () => ({
        kind: "audio+whisper", stinger: "click", position: { x: -0.6, y: 0, z: -1 }
      }), nowMs);
    }

    if (mic?.breathingLikely) {
      this._maybeFire("breath", () => ({ kind: "whisper" }), nowMs);
    }

    if (
      f.scriptedGlitch &&
      !this._scriptedGlitchFired &&
      this._stageAnswered >= SCRIPTED_GLITCH_AFTER_STAGE_ANSWERS &&
      feed.isLive()
    ) {
      this._scriptedGlitchFired = true;
      feed.startGlitch(4, 4000);
      this._emitBeat("scriptedGlitch", {
        kind: "audio+whisper", stinger: "static", position: { x: 0, y: 0, z: -0.5 }, text: pick(WHISPERS.scriptedGlitch)
      });
    }

    // Your own calibration smile, played while you're not smiling.
    if (
      f.smileClip && feed.hasClip("smile") && feed.isLive() &&
      face?.faceVisible && (face.reaction ?? 0) < 1.5 &&
      this._stageAnswered >= 2 && !this._onCooldown("smileClip", nowMs) && Math.random() < 0.004
    ) {
      const c = this.creep;
      feed.playClip("smile", 2200, {
        smile: 0.5 + c, widen: 0.3, eyeScale: 0.1 + c * 0.3, eyesBlack: c > 0.35 ? 1 : 0, bgDark: 0.5, vignette: 0.5,
        oneBit: 1, pixel: 3
      });
      this._maybeFire("smileClip", () => ({ kind: "whisper" }), nowMs);
    }

    // A split-second glitch of the live feed into the 1-bit look (sometimes negative).
    if (!this._onCooldown("flicker", nowMs) && Math.random() < 0.002 + this.creep * 0.004) {
      this._arm("flicker", nowMs);
      feed.burst({ oneBit: 1, pixel: 4, invert: Math.random() < 0.3 ? 1 : 0 }, 90 + Math.random() * 160);
    }

    // A subliminal full-screen image, Fear Assessment-style. Rare, and gone before you're sure.
    if (!this._onCooldown("imageFlash", nowMs) && Math.random() < 0.0015 + this.creep * 0.002) {
      this._arm("imageFlash", nowMs);
      emit("director-image-flash", { ms: 70 + Math.random() * 90 });
    }

    // Real objects from the player's real room.
    if (f.room && this.room.objects.length && !this._onCooldown("room", nowMs) && Math.random() < 0.003) {
      const o = pick(this.room.objects);
      const text = pick(ROOM_LINES).replace("{obj}", o.label).replace("{where}", o.where);
      this._maybeFire("room", () => ({
        kind: "audio+whisper", stinger: "footstep", position: { x: o.side === "left" ? -1 : 1, y: 0, z: 0.8 }
      }), nowMs, text);
    }

    if (this.room.personCount >= 2) {
      this._maybeFire("secondPerson", () => ({
        kind: "audio+whisper+flash", stinger: "static", position: { x: 0, y: 0, z: 0.6 }, intensity: 0.25
      }), nowMs);
    }

    // The player's own voice, played back wrong, in a quiet moment.
    if (
      f.playerVoice && this._hasPlayerVoice && mic && mic.rms < mic.noiseFloor * 1.6 &&
      !this._onCooldown("playerVoice", nowMs) && Math.random() < 0.002
    ) {
      this._arm("playerVoice", nowMs);
      this._logBeat("playerVoice", nowMs);
      emit("director-player-voice", { variant: pick(["reverse", "slow", "whisper"]) });
    }

    // Drain queued dossier callbacks. (The old version dropped every ready
    // callback that hit the cooldown; now they wait their turn.)
    if (this._pendingCallbacks.length && !this._onCooldown("callback", nowMs)) {
      const ready = this._pendingCallbacks.filter((c) => nowMs >= c.readyAtMs);
      if (ready.length) {
        const focused = this._aiFocusQuestionId
          ? ready.find((c) => c.entry.questionId === this._aiFocusQuestionId)
          : null;
        const chosen = focused || ready.reduce((best, c) => (c.weight > best.weight ? c : best));
        this._pendingCallbacks = this._pendingCallbacks.filter((c) => c !== chosen);
        this._arm("callback", nowMs);
        this._logBeat("callback", nowMs);
        this._emitBeat("callback", { kind: "whisper", text: chosen.text });
      }
    }

    this._pollPacing(nowMs);
  }
}

/** The callback names the tell that actually fired, so it's specific and true. */
function callbackText(entry) {
  const said = `"${trimDot(entry.chosenText)}."`;
  const t = entry.tells || {};
  if (t.face) return `you said ${said} your face didn't agree.`;
  if (t.cursor && entry.cursor?.firstHoverText && entry.cursor.firstHoverText !== entry.chosenText) {
    return `you said ${said} your hand went to "${trimDot(entry.cursor.firstHoverText)}" first.`;
  }
  if (t.latency) return `you took ${Math.round(entry.latencyMs / 1000)} seconds to say ${said}`;
  if (t.lookAway) return `you looked away before you said ${said}`;
  if (t.blinks) return `you blinked ${entry.blinks} times before you said ${said}`;
  if (t.cursor) return `you said ${said} your hand wasn't sure.`;
  return `you said ${said} something about that wasn't true.`;
}

function trimDot(s) {
  return String(s || "").replace(/[.\s]+$/, "");
}

function voicePosition() {
  return { x: (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.4), y: 0.1, z: 0.5 + Math.random() * 0.3 };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}