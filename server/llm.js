
import { GoogleGenAI } from "@google/genai";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BeatCopyZod, BeatCopyGeminiSchema,
  EndingReportZod, EndingReportGeminiSchema,
  PacingHintZod, PacingHintGeminiSchema,
  InterrogationZod, InterrogationGeminiSchema,
  TranscriptZod, TranscriptGeminiSchema
} from "./schemas.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SAFETY_NOTE =
  "This is flavor text for a fictional single-player horror game the person chose to play and consented to. " +
  "Keep it atmospheric and psychological, never graphic, never targeting the real person outside the fiction, " +
  "no instructions for self-harm or violence, no real names or real threats.";

// 2.5 models are closed to new API keys; these are the replacements Google's error names.
const FAST_MODELS = (process.env.AI_MODELS_FAST || "gemini-3.8-flash,gemini-3.5-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ENDING_MODELS = (process.env.AI_MODELS_ENDING || "gemini-3.8-flash,gemini-3.5-flash-lite")
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
export async function generateBeatCopy({ signalType, localFallbackText, dossier, questionIndex, roomObjects = [] }) {
  const system =
    `You write single-line whispers for "FALTER," a browser psychological horror quiz game that reacts to ` +
    `webcam/mic signals from the player. ${SAFETY_NOTE} ` +
    `Each dossier entry carries a "principle" field naming the psychological mechanism its question was built ` +
    `around (e.g. intolerance of uncertainty, hyperactive agency detection, loss of control) — when you reference ` +
    `an answer, let the line lean into *that specific mechanism* rather than just restating the answer; a line ` +
    `about an "uncertainty" answer should trade on not-knowing, a line about a "pareidolia" answer should trade ` +
    `on things that aren't quite faces. Rules: under 14 words, lowercase, no exclamation marks, unsettling rather ` +
    `than jokey, never repeat the example line verbatim. Dossier entries also list "tells" (face, cursor, latency, ` +
    `lookAway, blinks) — the specific thing the player did while answering; a line naming a real tell ("you hesitated") ` +
    `lands harder than a vague one. You may be given objects detected in the player's real room (labels and which ` +
    `side of them they're on); when the trigger is "room" or it fits naturally, reference one of those objects ` +
    `exactly as labelled — never invent objects that aren't listed.`;

  const userContent =
    `Trigger: ${signalType}\n` +
    `Example line in the right tone (don't reuse verbatim): "${localFallbackText}"\n` +
    `Question the player is currently on: ${questionIndex}\n` +
    `Objects in the player's room: ${JSON.stringify(roomObjects).slice(0, 600)}\n` +
    `Player's answers so far (may be empty): ${JSON.stringify(dossier).slice(0, 4000)}`;

  return callGeminiWithFallback(FAST_MODELS, system, userContent, BeatCopyGeminiSchema, BeatCopyZod, 120);
}

/**
 * Mochi's voice (cute, bubbly) for most moments; for "event-after" the
 * game's narrator instead: the flat whisper that follows her mutilation.
 */
export async function generateMochiLine({ moment, act, scene, name, snack, question, answer, localFallbackText, dossier, stats }) {
  const narrator = moment === "event-after";
  const system = narrator
    ? `You write the single whispered line that appears right after a scene in "FALTER," a browser psychological ` +
      `horror game, in which the player was made to watch Mochi (a cute pink bunny mascot they had befriended) get ` +
      `hurt (scene: ${scene}). ${SAFETY_NOTE} The line should make the player feel seen and complicit: refer to ` +
      `something specific they told Mochi earlier, or to how they watched (looked away, flinched or didn't). ` +
      `Rules: under 14 words, lowercase, no exclamation marks, no hearts, calm and unsettling, never describe gore, ` +
      `never repeat the example verbatim.`
    : `You write one speech-bubble line for Mochi, the mascot of "FALTER," a browser game that pretends to be a ` +
      `cute getting-to-know-you quiz (Doki Doki Literature Club style) before it turns into psychological horror. ` +
      `Mochi is a small white bunny: bubbly, affectionate, a little clingy, talks about herself in the third person ` +
      `("mochi"), uses lowercase and the occasional ♡. ${SAFETY_NOTE} ` +
      (act >= 2
        ? `It is now act ${act}: something has happened to Mochi that she doesn't remember. Stay sweet on the surface ` +
          `but let one detail be slightly wrong, too attentive, or possessive. `
        : `It is act 1: be genuinely sweet and warm so the player gets attached. Nothing creepy at all. `) +
      `React specifically to what the player just said or did, and use their name sometimes. Under 16 words, one line, ` +
      `never repeat the example verbatim.`;
  const userContent =
    `Moment: ${moment}
` +
    `Player's name: ${name || "(not given)"}
` +
    (snack ? `Snack they fed Mochi: ${snack}
` : "") +
    (question ? `Question: ${question}
` : "") +
    (answer ? `Their answer: ${answer}
` : "") +
    `Example line in the right voice (don't reuse verbatim): "${localFallbackText}"
` +
    `How they watched / session stats: ${JSON.stringify(stats).slice(0, 300)}
` +
    `Their answers so far: ${JSON.stringify(dossier).slice(0, 2500)}`;
  return callGeminiWithFallback(FAST_MODELS, system, userContent, BeatCopyGeminiSchema, BeatCopyZod, 80);
}

/** One-time personalized closing report built from the full dossier. */
export async function generateEndingReport({ dossier, interrogations = [], stats = {} }) {
  const system =
    `You write the closing "profile" screen for "FALTER," a browser psychological horror quiz game. ` +
    `The quiz asked questions where an option's text implicitly claims an emotional state (e.g. "no, never ` +
    `bothered me" claims calm). For each answer the game recorded independent "tells": a facial reaction that ` +
    `contradicted the claim, the cursor drifting to a different answer first, an unusually long hesitation, ` +
    `looking away as the question appeared, a burst of blinks. "mismatch: true" means at least two tells agreed. ` +
    `faceVerdict "flat" means the face showed nothing at all. Each entry's "principle" field names the ` +
    `psychological mechanism that question targets. You also get the player's spoken interview answers ` +
    `(transcripts plus how long they took to start talking, their longest pause, how much they looked away) and ` +
    `session stats (times they looked away, how often they broke eye contact with their own reflection, times ` +
    `they turned around to check the room behind them). ${SAFETY_NOTE} ` +
    `Write a short, specific, ominous-but-fictional closing message that references real patterns in their ` +
    `answers — prefer building the message around whichever mismatched entries share a principle or theme, so ` +
    `it reads as one specific observation rather than a list. Also choose the single most damning verbatim ` +
    `quote from their answers to surface separately from the body. 2-4 sentences, second person, no exclamation ` +
    `marks.`;

  const userContent =
    `Full dossier: ${JSON.stringify(dossier).slice(0, 8000)}\n` +
    `Spoken interview: ${JSON.stringify(interrogations).slice(0, 3000)}\n` +
    `Session stats: ${JSON.stringify(stats).slice(0, 500)}`;

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
    `You are the pacing director for "FALTER," a browser psychological horror quiz game. Given the player's ` +
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


// ---------------------------------------------------------------- voice

const TTS_MODEL = process.env.AI_MODEL_TTS || "gemini-2.5-flash-preview-tts";
const TTS_VOICE = process.env.AI_TTS_VOICE || "Enceladus"; // Gemini's "breathy" voice
const TTS_DIRECTION =
  process.env.AI_TTS_DIRECTION ||
  "Whisper this slowly and intimately, very close to the listener, flat and calm, with small pauses";
const TTS_CACHE_DIR = path.resolve(process.env.TTS_CACHE_DIR || ".tts-cache");

// Free-tier TTS allows ~3 requests a minute, so lines can't be made on demand.
// Instead: every line is cached on disk; an uncached line is QUEUED and the
// request returns "pending" immediately (the game speaks it with the browser's
// own voice meanwhile). The queue drains at the allowed rate in the background,
// so after one playthrough with the server left running, every line is cached.
const TTS_MIN_INTERVAL_MS = Number(process.env.TTS_MIN_INTERVAL_MS ?? 21000); // set 0 on a paid key
const ttsQueue = [];
const ttsQueued = new Set();
let ttsWorking = false;
let ttsNextAt = 0;

function ttsKey(text) {
  return createHash("sha1").update(`${TTS_MODEL}|${TTS_VOICE}|${TTS_DIRECTION}|${text}`).digest("hex");
}

async function readTtsCache(text) {
  try {
    return JSON.parse(await readFile(path.join(TTS_CACHE_DIR, `${ttsKey(text)}.json`), "utf8"));
  } catch {
    return null;
  }
}

/** Returns { status: "ready", audio, sampleRate } or { status: "pending", queued } */
export async function generateSpeech({ text }) {
  const cached = await readTtsCache(text);
  if (cached) return { status: "ready", ...cached };
  const key = ttsKey(text);
  if (!ttsQueued.has(key)) {
    ttsQueued.add(key);
    ttsQueue.push({ text, key, attempts: 0 });
    pumpTts();
  }
  return { status: "pending", queued: ttsQueue.length };
}

async function pumpTts() {
  if (ttsWorking) return;
  ttsWorking = true;
  while (ttsQueue.length) {
    const wait = ttsNextAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const job = ttsQueue[0];
    const result = await synthesize(job.text);
    if (result.retryMs && ++job.attempts < 4) {
      ttsNextAt = Date.now() + result.retryMs + 500;
      console.warn(`TTS rate-limited — waiting ${Math.round(result.retryMs / 1000)}s (${ttsQueue.length} lines queued)`);
      continue;
    }
    ttsQueue.shift();
    ttsQueued.delete(job.key);
    ttsNextAt = Date.now() + TTS_MIN_INTERVAL_MS;
    if (result.ok) console.log(`TTS cached: "${job.text.slice(0, 40)}" (${ttsQueue.length} left)`);
  }
  ttsWorking = false;
}

async function synthesize(text) {
  try {
    const res = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: "user", parts: [{ text: `${TTS_DIRECTION}: ${text}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } }
      }
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) return { ok: false };
    const mime = part.inlineData.mimeType || "";
    const sampleRate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
    await mkdir(TTS_CACHE_DIR, { recursive: true });
    await writeFile(path.join(TTS_CACHE_DIR, `${ttsKey(text)}.json`), JSON.stringify({ audio: part.inlineData.data, sampleRate }));
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes('"code":429')) {
      const secs = Number(/retry in ([\d.]+)s/i.exec(msg)?.[1]) || 30;
      return { ok: false, retryMs: secs * 1000 };
    }
    console.warn(`Gemini TTS failed: ${msg.slice(0, 200)}`);
    return { ok: false };
  }
}

/** Spoken answer -> text. Audio is base64 (WAV from the browser). */
export async function transcribeAudio({ audio, mimeType }) {
  const system =
    "You are a speech-to-text engine. Transcribe exactly what is said, in the language spoken, with normal " +
    "punctuation. Do not summarize, translate, correct grammar, or add commentary. If nothing intelligible is " +
    'said, return an empty string. Return JSON: {"text": "..."}';
  const userContent = [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: mimeType || "audio/wav", data: audio } },
        { text: "Transcribe this recording." }
      ]
    }
  ];
  return callGeminiWithFallback(FAST_MODELS, system, userContent, TranscriptGeminiSchema, TranscriptZod, 600);
}

/** The interrogator's next question, built on what they just said and how they said it. */
export async function generateInterrogation({ turns, dossier, roomObjects = [] }) {
  const system =
    `You are the interviewer in "FALTER," a browser psychological horror game. The player is answering your ` +
    `questions OUT LOUD. For each answer you get the transcript and measured tells: latencyToSpeakMs (how long ` +
    `before they started talking), longestPauseMs, lookedAwayFraction (0-1), reactions (facial reaction channels ` +
    `that spiked), typedInstead (they typed rather than spoke), silent (said nothing). ${SAFETY_NOTE} ` +
    `Ask ONE short follow-up question (under 20 words) that presses on the most revealing thing: a specific word ` +
    `or phrase they used, or a measured tell (e.g. "you waited four seconds before you started."). Quote them ` +
    `exactly when you quote. Calm, quiet, clinical, unsettling — never shouty, no exclamation marks. Never claim ` +
    `knowledge you weren't given. Never ask for identifying details (full name, address, school, workplace, ` +
    `phone), and never steer toward self-harm, abuse, or real trauma; if the player raises something like that, ` +
    `set done=true and ask nothing further. If the transcript is empty or garbled, ask them to say it again, ` +
    `differently. You may reference one of the listed room objects if it fits. Set done=true after the second ` +
    `follow-up or if the player refuses. Also write "observation": one lowercase line under 10 words for the ` +
    `game's case file.`;
  const userContent =
    `Interview so far: ${JSON.stringify(turns).slice(0, 3000)}\n` +
    `Recent quiz answers: ${JSON.stringify(dossier).slice(0, 2500)}\n` +
    `Objects in the player's room: ${JSON.stringify(roomObjects).slice(0, 500)}`;
  return callGeminiWithFallback(FAST_MODELS, system, userContent, InterrogationGeminiSchema, InterrogationZod, 250);
}
