
import { GoogleGenAI } from "@google/genai";
import {
  BeatCopyZod, BeatCopyGeminiSchema,
  EndingReportZod, EndingReportGeminiSchema,
  PacingHintZod, PacingHintGeminiSchema
} from "./schemas.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SAFETY_NOTE =
  "This is flavor text for a fictional single-player horror game the person chose to play and consented to. " +
  "Keep it atmospheric and psychological, never graphic, never targeting the real person outside the fiction, " +
  "no instructions for self-harm or violence, no real names or real threats.";

const FAST_MODELS = (process.env.AI_MODELS_FAST || "gemini-2.5-flash,gemini-2.5-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ENDING_MODELS = (process.env.AI_MODELS_ENDING || "gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);

function isFatalError(err) {
  const status = err?.status ?? err?.code ?? err?.error?.code;
  const message = String(err?.message ?? err?.error?.message ?? err ?? "").toLowerCase();
  if (status === 401 || status === 403) return true;
  if (status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") return true;
  return message.includes("api key not valid") || message.includes("permission denied") || message.includes("unauthenticated");
}

async function callGeminiOnce(model, system, userContent, geminiSchema, zodSchema, maxOutputTokens) {
  const res = await ai.models.generateContent({
    model,
    contents: userContent,
    config: {
      systemInstruction: system,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: geminiSchema
    }
  });

  const parsed = safeParseJson(res.text ?? "");
  if (!parsed) return { ok: false, reason: "unparseable response" };

  const result = zodSchema.safeParse(parsed);
  if (!result.success) {
    console.error(`Gemini response from ${model} failed schema validation:`, result.error.flatten());
    return { ok: false, reason: "schema validation failed" };
  }
  return { ok: true, data: result.data };
}

async function callGeminiWithFallback(models, system, userContent, geminiSchema, zodSchema, maxOutputTokens = 300) {
  let lastErr = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const attempt = await callGeminiOnce(model, system, userContent, geminiSchema, zodSchema, maxOutputTokens);
      if (attempt.ok) {
        if (i > 0) console.warn(`Gemini: recovered on fallback model "${model}" (attempt ${i + 1}/${models.length})`);
        return attempt.data;
      }
      lastErr = new Error(attempt.reason);
      console.warn(`Gemini model "${model}" gave ${attempt.reason}, trying next fallback…`);
    } catch (err) {
      lastErr = err;
      if (isFatalError(err)) {
        console.error(`Gemini call to "${model}" failed with a fatal, non-model-specific error — stopping chain:`, err?.message ?? err);
        break;
      }
      console.warn(`Gemini model "${model}" failed (${err?.message ?? err}), trying next fallback…`);
    }
  }

  console.error("Gemini: all models in fallback chain failed.", lastErr?.message ?? lastErr);
  return null;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * One line of whisper copy for a specific trigger, optionally aware of the
 * player's answers so far. `localFallbackText` is given as a style anchor,
 * not something to just repeat.
 */
export async function generateBeatCopy({ signalType, localFallbackText, dossier, questionIndex }) {
  const system =
    `You write single-line whispers for "UNSETTLED," a browser psychological horror quiz game that reacts to ` +
    `webcam/mic signals from the player. ${SAFETY_NOTE} ` +
    `Each dossier entry carries a "principle" field naming the psychological mechanism its question was built ` +
    `around (e.g. intolerance of uncertainty, hyperactive agency detection, loss of control) — when you reference ` +
    `an answer, let the line lean into *that specific mechanism* rather than just restating the answer; a line ` +
    `about an "uncertainty" answer should trade on not-knowing, a line about a "pareidolia" answer should trade ` +
    `on things that aren't quite faces. Rules: under 14 words, lowercase, no exclamation marks, unsettling rather ` +
    `than jokey, never repeat the example line verbatim.`;

  const userContent =
    `Trigger: ${signalType}\n` +
    `Example line in the right tone (don't reuse verbatim): "${localFallbackText}"\n` +
    `Question the player is currently on: ${questionIndex}\n` +
    `Player's answers so far (may be empty): ${JSON.stringify(dossier).slice(0, 4000)}`;

  return callGeminiWithFallback(FAST_MODELS, system, userContent, BeatCopyGeminiSchema, BeatCopyZod, 120);
}

/** One-time personalized closing report built from the full dossier. */
export async function generateEndingReport({ dossier }) {
  const system =
    `You write the closing "profile" screen for "UNSETTLED," a browser psychological horror quiz game. ` +
    `The quiz asked questions where an option's text implicitly claims an emotional state (e.g. "no, never ` +
    `bothered me" claims calm), and the game measured the player's real facial expression at the moment they ` +
    `answered — "mismatch: true" means their face disagreed with what they said. Each entry's "principle" field ` +
    `names the psychological mechanism that question targets. ${SAFETY_NOTE} ` +
    `Write a short, specific, ominous-but-fictional closing message that references real patterns in their ` +
    `answers — prefer building the message around whichever mismatched entries share a principle or theme, so ` +
    `it reads as one specific observation rather than a list. Also choose the single most damning verbatim ` +
    `quote from their answers to surface separately from the body. 2-4 sentences, second person, no exclamation ` +
    `marks.`;

  const userContent = `Full dossier: ${JSON.stringify(dossier).slice(0, 8000)}`;

  return callGeminiWithFallback(ENDING_MODELS, system, userContent, EndingReportGeminiSchema, EndingReportZod, 400);
}

/**
 * A slow, periodic "read" of the session so far, used only to nudge pacing —
 * the server is trusted here to stay in range, but the client also clamps
 * the result defensively, so an out-of-range or malformed value can't break
 * anything, just gets ignored.
 */
export async function generatePacingHint({ dossier, recentSignals }) {
  const system =
    `You are the pacing director for "UNSETTLED," a browser psychological horror quiz game. Given the player's ` +
    `answers so far (with mismatch flags and each question's psychological "principle") and which reaction types ` +
    `have fired recently, decide whether the game should ease off or lean in, which specific answer (by ` +
    `questionId) the game should weaponize next as a callback, and write one short creepy status line for a ` +
    `"case file" the player can see updating live. Lower cooldownMultiplier = reactions fire more often. Positive ` +
    `intensityBias = escalate. Prefer a focusQuestionId whose principle hasn't been used in a callback yet, to ` +
    `keep callbacks varied. caseFileLine should be one short lowercase line, under 10 words.`;

  const userContent =
    `Dossier: ${JSON.stringify(dossier).slice(0, 4000)}\n` +
    `Recently fired reaction types (most recent last): ${JSON.stringify(recentSignals)}`;

  return callGeminiWithFallback(FAST_MODELS, system, userContent, PacingHintGeminiSchema, PacingHintZod, 200);
}
