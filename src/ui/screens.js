import { settings } from "../settings.js";
import { outfitParts, accessoryHtml } from "../mochi/outfit.js";
const $ = (sel) => document.querySelector(sel);

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ---------------------------------------------------------------- calibration

export function setCalibInstruction(html) {
  $("#calibration-instruction").innerHTML = html;
}

export function showCalibSample(show) {
  $("#calib-sample").classList.toggle("hidden", !show);
}

// ---------------------------------------------------------------- quiz

/** Renders a question. Buttons carry data-index (CursorTracker needs it). Returns the options container. */
export function renderQuestion(question, index, total, stage, onSelect) {
  // while it's still "a cute quiz", don't show how much game is left (it would give the fake ending away)
  $("#question-index").textContent = (stage?.look ?? stage?.act ?? 1) <= 2
    ? `question ${index + 1} ♡`
    : `${stage ? stage.title.split(".")[0] + " · " : ""}${index + 1} / ${total}`;
  $("#question-prompt").textContent = question.prompt;
  $("#quiz-question").classList.remove("hidden");

  const container = $("#answer-options");
  container.innerHTML = "";
  question.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt.text;
    btn.dataset.index = String(i);
    btn.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((b) => (b.disabled = true));
      onSelect(i);
    });
    container.appendChild(btn);
  });
  return container;
}

export function setFeedStatus(text, glitch) {
  const el = $("#feed-status");
  el.textContent = text;
  el.classList.toggle("glitch", !!glitch);
}

/** Stage title card ("II. REFLECTION"). Resolves when it's gone. */
export function showStageCard(title, subtitle, ms = 3200, imageUrl = null) {
  const card = $("#stage-card");
  $("#stage-card-img").style.backgroundImage = imageUrl ? `url("${imageUrl}")` : "none";
  $("#stage-card-title").textContent = title;
  $("#stage-card-sub").textContent = subtitle || "";
  card.classList.add("show");
  return new Promise((r) => setTimeout(() => {
    card.classList.remove("show");
    setTimeout(r, 700);
  }, ms));
}

// ---------------------------------------------------------------- acts + mochi

/** Colour script: body[data-act] switches the palette (pink I -> black/red V). */
export function setAct(act) {
  document.body.dataset.act = String(act);
}

/** The outfit the player picked in Act II, worn by the host avatar from then on. */
export function setHostOutfit(outfit) {
  const host = $("#mochi-host .mochi-host-figure");
  if (!host) return;
  host.querySelectorAll(".mochi-acc").forEach((n) => n.remove());
  for (const a of outfitParts(outfit)) host.insertAdjacentHTML("beforeend", accessoryHtml(a));
}

/** Act I host: Mochi beside the question, with a speech bubble. */
export function setMochiHostLine(text) {
  const el = $("#mochi-host-bubble");
  el.textContent = text || "";
  el.classList.toggle("show", !!text);
}

const HOST_CUTE = "/mochi/cute.webp";
let hostHurt = false;

/** One or two frames of a hurt Mochi in the host avatar. Too quick to be sure. */
export function flickerHost(url = "/mochi/stitches-local.webp", ms = 45) {
  const img = $("#mochi-host img");
  if (!img || hostHurt) return;
  img.src = url;
  setTimeout(() => { if (!hostHurt) img.src = HOST_CUTE; }, ms);
}

/** Act III: while the player's eyes are closed, Mochi has her stitches. */
export function setHostHurt(on, url = "/mochi/stitches-local.webp") {
  if (on === hostHurt) return;
  hostHurt = on;
  const img = $("#mochi-host img");
  if (img) img.src = on ? url : HOST_CUTE;
}

/** Swap a word of the question on screen for a moment, then put it back. */
export function glitchPrompt(name) {
  const el = $("#question-prompt");
  if (!el || !el.textContent) return;
  const orig = el.textContent;
  const swaps = [
    [/\byou\b/i, name || "you"],
    [/\?$/, `, ${name || "friend"}?`],
    [/\b(right now|now)\b/i, "behind you"],
    [/\b(room)\b/i, "dark"]
  ];
  const [re, rep] = swaps.find(([re]) => re.test(orig)) || swaps[1];
  el.textContent = orig.replace(re, rep);
  setTimeout(() => { if (el.textContent !== orig) el.textContent = orig; }, 110);
}

/** Act II: the pink slowly drains (0..1). */
export function setDrain(x) {
  document.body.style.setProperty("--drain", String(Math.max(0, Math.min(1, x))));
}

export function showMochiEvent() {
  const el = $("#mochi-event");
  el.classList.remove("instant");
  el.classList.add("show");
  document.body.classList.add("mochi-mode");
}

export function hideMochiEvent({ instant = false } = {}) {
  const el = $("#mochi-event");
  el.classList.toggle("instant", instant);
  el.classList.remove("show");
  document.body.classList.remove("mochi-mode");
  setMochiBubble("");
  setMochiWatchText("");
}

export function setMochiBubble(text) {
  const el = $("#mochi-event-bubble");
  el.textContent = text || "";
  el.classList.toggle("show", !!text);
}

export function setMochiWatchText(text) {
  const el = $("#mochi-event-watch");
  el.textContent = text || "";
  el.classList.toggle("show", !!text);
}

/** As the wound opens, the room around Mochi goes dark (she stays lit). */
export function setMochiEventProgress(p) {
  const d = Math.min(1, p * 1.25);
  $("#mochi-event-dim").style.opacity = String(d * 0.92);
}

// ---------------------------------------------------------------- fx

let whisperTimeout = null;
export function showWhisper(text, durationMs = 3600) {
  if (!text) return;
  const overlay = $("#director-overlay");
  overlay.innerHTML = `<div class="whisper">${escapeHtml(text)}</div>`;
  overlay.classList.add("show");
  clearTimeout(whisperTimeout);
  whisperTimeout = setTimeout(() => overlay.classList.remove("show"), durationMs);
}

export function flashScreen(intensity = 0.5) {
  if (settings.reduceFlashing) intensity *= 0.2; // a soft lift, not a strobe
  let flash = document.getElementById("fx-flash");
  if (!flash) {
    flash = document.createElement("div");
    flash.id = "fx-flash";
    document.body.appendChild(flash);
  }
  flash.style.transition = "none";
  flash.style.opacity = String(intensity);
  requestAnimationFrame(() => {
    flash.style.transition = "opacity 0.6s ease";
    flash.style.opacity = "0";
  });
}

export function shakeScreen() {
  if (settings.reduceFlashing) return;
  const app = $("#app");
  app.classList.remove("shake");
  void app.offsetWidth; // restart animation
  app.classList.add("shake");
}

/** Fear has consequences: the whole screen dims while the player reacts or looks away. */
export function setDarkness(amount) {
  $("#darkness-overlay").style.opacity = String(Math.min(0.6, amount * 0.6)); // dark, but the question stays readable
}

export function blackout(ms) {
  const el = $("#blackout");
  el.style.transition = "none";
  el.style.opacity = "1";
  setTimeout(() => {
    el.style.transition = "opacity 0.5s ease";
    el.style.opacity = "0";
  }, ms);
}

// ---------------------------------------------------------------- fullscreen feed ("mirror mode")

export function enterMirror(html = "") {
  document.body.classList.add("mirror-mode");
  setMirrorText(html);
}

export function setMirrorText(html) {
  const el = $("#mirror-text");
  el.innerHTML = html;
  el.classList.toggle("show", !!html);
}

export function exitMirror() {
  document.body.classList.remove("mirror-mode");
  setMirrorText("");
}

export function showInstruction(html) {
  const el = $("#instruction-overlay");
  el.innerHTML = html;
  el.classList.add("show");
  el.classList.toggle("empty", !html);
  $("#quiz-question").classList.add("hidden");
}

export function hideInstruction() {
  const el = $("#instruction-overlay");
  el.classList.remove("show");
  el.innerHTML = "";
}

// ---------------------------------------------------------------- interrogation

export function showInterrogation(prompt) {
  $("#quiz-question").classList.add("hidden");
  $("#interrogation").classList.remove("hidden");
  $("#interrogation-transcript").textContent = "";
  setInterrogationPrompt(prompt);
}

export function setInterrogationPrompt(text) {
  $("#interrogation-prompt").textContent = text;
}

export function setInterrogationState(text) {
  $("#interrogation-state").textContent = text;
}

export function setMicLevel(v) {
  $("#mic-level").style.transform = `scaleX(${Math.max(0.02, v)})`;
}

let typedHandler = null;
/** Calls `cb(text)` if the player types an answer and presses enter. */
export function waitForTypedAnswer(cb) {
  const input = $("#interrogation-input");
  input.value = "";
  input.disabled = false;
  typedHandler = (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      const text = input.value.trim();
      cancelTypedAnswer();
      cb(text);
    }
  };
  input.addEventListener("keydown", typedHandler);
}

export function cancelTypedAnswer() {
  const input = $("#interrogation-input");
  if (typedHandler) input.removeEventListener("keydown", typedHandler);
  typedHandler = null;
  input.disabled = true;
}

export function showTranscript(text) {
  $("#interrogation-transcript").textContent = text;
}

export function hideInterrogation() {
  $("#interrogation").classList.add("hidden");
}

// ---------------------------------------------------------------- ending

export function showEndingLoading() {
  $("#ending-title").textContent = "compiling.";
  $("#ending-copy").textContent = "analyzing what your face didn't say…";
  $("#btn-restart").classList.add("hidden");
}

export function captureEndingStill(sourceCanvas) {
  const c = $("#ending-still");
  const ctx = c.getContext("2d");
  c.width = sourceCanvas.width;
  c.height = sourceCanvas.height;
  // the feed canvas is mirrored with CSS; mirror the copy the same way
  ctx.save();
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();
  c.dataset.captured = "1";
}

export function updateCaseFile(text) {
  const el = document.getElementById("case-file");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

/**
 * @param {{mismatchCount:number, flatCount:number, total:number}} summary
 * @param {{title: string, body: string, focusQuote?: string}|null} aiReport used verbatim if present
 */
export function renderEnding(summary, aiReport = null) {
  const { mismatchCount, flatCount, total } = summary;
  const title = $("#ending-title");
  const copy = $("#ending-copy");

  if (aiReport?.title && aiReport?.body) {
    title.textContent = aiReport.title;
    copy.textContent = aiReport.body;
    if (aiReport.focusQuote) copy.innerHTML += `<br><br><em>"${escapeHtml(aiReport.focusQuote)}"</em>`;
  } else {
    if (mismatchCount === 0) {
      title.textContent = "you were honest.";
      copy.textContent = "nothing you did disagreed with what you said. that's rarer than you'd think.";
    } else if (mismatchCount <= 2) {
      title.textContent = "close enough.";
      copy.textContent = `${mismatchCount} of ${total} answers came with something you didn't say out loud.`;
    } else {
      title.textContent = "it noticed.";
      copy.textContent = `${mismatchCount} of ${total} answers came with a tell. it was paying more attention than you were.`;
    }
    if (flatCount >= 3) copy.textContent += " and your face barely moved. that takes practice.";
  }

  const still = $("#ending-still");
  still.classList.toggle("hidden", !still.dataset.captured);
  $("#ending-still-caption").classList.toggle("hidden", !still.dataset.captured);
  $("#btn-restart").classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}