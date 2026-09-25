import { emit } from "../core/EventBus.js";
import { FEAR_CHANNELS } from "../vision/FaceTracker.js";

// When a question appears, the first ~1.5s is when involuntary reactions
// happen — before the player composes their face. The moment of clicking is
// the LEAST informative moment, so we look at both.
const REVEAL_WINDOW_MS = 1500;
const ANSWER_WINDOW_MS = 900;
const FRAME_HISTORY_MS = 60000;

// Latency tell: compared to this player's own pace, adjusted for how much text there was to read.
const LATENCY_MIN_MS = 2500;
const LATENCY_RATIO = 1.7;
const MIN_ANSWERS_FOR_LATENCY = 3;

const LOOK_AWAY_REVEAL_FRACTION = 0.3; // looked away / face gone for 30%+ of the reveal window
const BLINK_BURST = 3;                 // blinks in the first 2s

// How many independent tells must agree before we call it a mismatch.
const TELLS_REQUIRED = 2;

/**
 * Asks one question at a time (promise-based, so a stage runner can
 * interleave questions with other segments) and scores each answer from
 * several independent signals instead of a single emotion label.
 */
export class QuizEngine {
  /**
   * @param {import('../vision/FaceTracker').FaceTracker} faceTracker
   * @param {import('./CursorTracker').CursorTracker} cursor
   */
  constructor(faceTracker, cursor) {
    this.face = faceTracker;
    this.cursor = cursor;
    this.dossier = [];
    this._frames = []; // { t, visible, away }
    this._paceRatios = [];
    this._current = null;
  }

  /** Show a question; resolves with the dossier entry once answered. */
  ask(question, index, total, stage) {
    return new Promise((resolve) => {
      this._current = { question, shownAt: performance.now(), resolve };
      emit("question-shown", { question, index, total, stage });
    });
  }

  /** Call every frame with FaceTracker's snapshot. */
  recordFrame(face, nowMs) {
    if (!face) return;
    this._frames.push({ t: nowMs, visible: face.faceVisible, away: face.lookingAway });
    while (this._frames.length && this._frames[0].t < nowMs - FRAME_HISTORY_MS) this._frames.shift();
  }

  /** Player picked option `optionIndex` for the current question. */
  selectAnswer(optionIndex, nowMs = performance.now()) {
    const cur = this._current;
    if (!cur) return;
    this._current = null;
    const q = cur.question;
    const option = q.options[optionIndex];
    const shownAt = cur.shownAt;
    const latencyMs = nowMs - shownAt;

    // ---- face: spikes relative to this player's own baseline
    const revealEnd = Math.min(shownAt + REVEAL_WINDOW_MS, nowMs);
    const spikes = [
      ...this.face.spikesBetween(shownAt, revealEnd),
      ...this.face.spikesBetween(nowMs - ANSWER_WINDOW_MS, nowMs)
    ];
    const uniqueSpikes = dedupeSpikes(spikes);
    const visibleRatio = this._visibleRatio(shownAt, nowMs);
    const faceVerdict = judgeFace(option.expressionHint, uniqueSpikes, visibleRatio, this.face.baseline);

    // ---- latency, normalized for reading load
    const words = wordCount(q.prompt) + q.options.reduce((n, o) => n + wordCount(o.text), 0);
    const readingMs = 900 + words * 230;
    const paceRatio = latencyMs / readingMs;
    const medianPace = median(this._paceRatios);
    const latencyTell =
      this._paceRatios.length >= MIN_ANSWERS_FOR_LATENCY &&
      latencyMs > LATENCY_MIN_MS &&
      paceRatio > medianPace * LATENCY_RATIO;
    this._paceRatios.push(paceRatio);

    // ---- gaze at reveal, blink burst
    const lookAwayReveal = this._awayFraction(shownAt, revealEnd) >= LOOK_AWAY_REVEAL_FRACTION;
    const blinks = this.face.blinkCountBetween(shownAt, shownAt + 2000);
    const blinkTell = blinks >= BLINK_BURST;

    // ---- cursor
    const cursor = this.cursor.finish(optionIndex);

    const tells = {
      face: faceVerdict === "contradict",
      cursor: cursor.conflict,
      latency: latencyTell,
      lookAway: lookAwayReveal,
      blinks: blinkTell
    };
    const tellCount = Object.values(tells).filter(Boolean).length;
    const mismatch = tellCount >= TELLS_REQUIRED;

    const strongest = uniqueSpikes.sort((a, b) => b.peakZ - a.peakZ)[0];
    const entry = {
      questionId: q.id,
      callbackId: q.callbackId,
      principle: q.principle,
      prompt: q.prompt,
      chosenText: option.text,
      expressionHint: option.expressionHint,
      faceVerdict,               // agree | contradict | flat | unreadable | n/a
      flat: faceVerdict === "flat",
      spikes: uniqueSpikes.map((s) => ({ channel: s.channel, peakZ: +s.peakZ.toFixed(1) })),
      latencyMs: Math.round(latencyMs),
      blinks,
      cursor: {
        ...cursor,
        firstHoverText: cursor.firstHover !== null ? q.options[cursor.firstHover]?.text : null
      },
      tells,
      tellCount,
      mismatch,
      // kept for older code paths / the AI prompt
      measured: { dominant: strongest?.channel ?? "neutral", dominantScore: strongest?.peakZ ?? 0 }
    };
    this.dossier.push(entry);
    emit("answer-recorded", entry);
    cur.resolve(entry);
  }

  _visibleRatio(t0, t1) {
    const f = this._frames.filter((x) => x.t >= t0 && x.t <= t1);
    return f.length ? f.filter((x) => x.visible).length / f.length : 0;
  }

  _awayFraction(t0, t1) {
    const f = this._frames.filter((x) => x.t >= t0 && x.t <= t1);
    return f.length ? f.filter((x) => !x.visible || x.away).length / f.length : 0;
  }

  getDossier() {
    return this.dossier;
  }
}

/**
 * Evidence-based: a still face is NOT a contradiction. It's only a
 * contradiction when the face did something that disagrees with the claim.
 */
function judgeFace(hint, spikes, visibleRatio, baseline) {
  if (!baseline) return "unreadable";
  if (visibleRatio < 0.5) return "unreadable";
  if (hint === "any") return "n/a";

  const fear = spikes.some((s) => FEAR_CHANNELS.includes(s.channel));
  const smile = spikes.some((s) => s.channel === "smile");

  if (hint === "neutral") {
    // claimed "doesn't bother me" — a distress reaction disagrees
    return fear ? "contradict" : "agree";
  }
  if (hint === "smile") {
    if (smile) return "agree";
    return fear ? "contradict" : "flat";
  }
  // "frown" / "surprise": claimed it DOES get to them
  if (fear) return "agree";
  return smile ? "contradict" : "flat";
}

function dedupeSpikes(spikes) {
  const seen = new Set();
  return spikes.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));
}

function wordCount(s) {
  return (s.match(/\S+/g) || []).length;
}

function median(arr) {
  if (!arr.length) return 1;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}