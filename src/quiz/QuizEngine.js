import { emit } from "../core/EventBus.js";

const EXPRESSION_SAMPLE_WINDOW_MS = 4000; // how much history we keep
const ANSWER_SAMPLE_MS = 800; // how far back we average when an answer is picked
const MISMATCH_SCORE_THRESHOLD = 0.32; // how "strong" a wrong expression must be to flag

/**
 * Drives the quiz: shows questions, continuously ingests face-expression
 * samples from the main loop, and — at the moment the player clicks an
 * answer — checks whether their face agrees with what they just claimed.
 * Every answer (matched or not) goes into a dossier the HorrorDirector can
 * quote back later.
 */
export class QuizEngine {
  constructor(questions) {
    this.questions = questions;
    this.index = -1;
    this.dossier = [];
    this._expressionBuffer = []; // { t, expressions }
  }

  start() {
    this.index = 0;
    this._announceCurrent();
  }

  currentQuestion() {
    return this.questions[this.index] || null;
  }

  /** Call every frame while the quiz is active, with FaceTracker's snapshot. */
  recordFrame(faceSnapshot, nowMs) {
    if (!faceSnapshot?.expressions) return;
    this._expressionBuffer.push({ t: nowMs, expressions: faceSnapshot.expressions });
    const cutoff = nowMs - EXPRESSION_SAMPLE_WINDOW_MS;
    while (this._expressionBuffer.length && this._expressionBuffer[0].t < cutoff) {
      this._expressionBuffer.shift();
    }
  }

  /** Player picked option `optionIndex` for the current question. */
  selectAnswer(optionIndex, nowMs) {
    const q = this.currentQuestion();
    if (!q) return;
    const option = q.options[optionIndex];

    const measured = this._averageRecentExpression(nowMs);
    const mismatch = this._checkMismatch(option.expressionHint, measured);

    const entry = {
      questionId: q.id,
      callbackId: q.callbackId,
      prompt: q.prompt,
      chosenText: option.text,
      expressionHint: option.expressionHint,
      measured,
      mismatch
    };
    this.dossier.push(entry);
    emit("answer-recorded", entry);

    this.index += 1;
    if (this.index < this.questions.length) {
      this._announceCurrent();
    } else {
      emit("quiz-complete", { dossier: this.dossier });
    }
  }

  _announceCurrent() {
    emit("question-shown", {
      question: this.currentQuestion(),
      index: this.index,
      total: this.questions.length
    });
  }

  _averageRecentExpression(nowMs) {
    const cutoff = nowMs - ANSWER_SAMPLE_MS;
    const recent = this._expressionBuffer.filter((s) => s.t >= cutoff);
    if (!recent.length) return null;

    const totals = { smile: 0, frown: 0, surprise: 0, anger: 0, neutral: 0 };
    for (const s of recent) {
      for (const k of Object.keys(totals)) totals[k] += s.expressions[k] || 0;
    }
    for (const k of Object.keys(totals)) totals[k] /= recent.length;

    const [label, score] = Object.entries(totals)
      .filter(([k]) => k !== "neutral")
      .sort((a, b) => b[1] - a[1])[0];

    return { scores: totals, dominant: score > 0.25 ? label : "neutral", dominantScore: score };
  }

  _checkMismatch(hint, measured) {
    if (!measured || hint === "any") return false;
    if (hint === "neutral") {
      return measured.dominant !== "neutral" && measured.dominantScore > MISMATCH_SCORE_THRESHOLD;
    }
    // Claimed a specific expression (smile/frown/surprise) but face disagreed.
    const claimedScore = measured.scores[hint] ?? 0;
    return claimedScore < MISMATCH_SCORE_THRESHOLD && measured.dominant !== hint;
  }

  getDossier() {
    return this.dossier;
  }
}
