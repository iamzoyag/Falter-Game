const $ = (sel) => document.querySelector(sel);

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

export function renderQuestion(question, index, total, onSelect) {
  $("#question-index").textContent = `${index + 1} / ${total}`;
  $("#question-prompt").textContent = question.prompt;

  const container = $("#answer-options");
  container.innerHTML = "";
  question.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = opt.text;
    btn.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((b) => (b.disabled = true));
      onSelect(i);
    });
    container.appendChild(btn);
  });
}

export function setFeedStatus(text, glitch) {
  const el = $("#feed-status");
  el.textContent = text;
  el.classList.toggle("glitch", !!glitch);
}

let whisperTimeout = null;
export function showWhisper(text, durationMs = 3200) {
  if (!text) return;
  const overlay = $("#director-overlay");
  overlay.innerHTML = `<div class="whisper">${escapeHtml(text)}</div>`;
  overlay.classList.add("show");
  clearTimeout(whisperTimeout);
  whisperTimeout = setTimeout(() => overlay.classList.remove("show"), durationMs);
}

export function flashScreen(intensity = 0.5) {
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
  const app = $("#app");
  app.classList.remove("shake");
  void app.offsetWidth; // restart animation
  app.classList.add("shake");
}

export function showEndingLoading() {
  $("#ending-title").textContent = "compiling.";
  $("#ending-copy").textContent = "analyzing what your face didn't say…";
  $("#btn-restart").classList.add("hidden");
}

export function updateCaseFile(text) {
  const el = document.getElementById("case-file");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
}

/** @param {{title: string, body: string}|null} aiReport if present, used verbatim instead of the local summary */
export function renderEnding(mismatchCount, total, aiReport = null) {
  const title = $("#ending-title");
  const copy = $("#ending-copy");

  if (aiReport?.title && aiReport?.body) {
    title.textContent = aiReport.title;
    copy.textContent = aiReport.body;
    if (aiReport.focusQuote) {
      copy.innerHTML += `<br><br><em>"${escapeHtml(aiReport.focusQuote)}"</em>`;
    }
  } else if (mismatchCount === 0) {
    title.textContent = "you were honest.";
    copy.textContent = "every answer matched your face. that's rarer than you'd think.";
  } else if (mismatchCount <= 2) {
    title.textContent = "close enough.";
    copy.textContent = `${mismatchCount} of ${total} answers didn't match what your face was doing.`;
  } else {
    title.textContent = "it noticed.";
    copy.textContent = `${mismatchCount} of ${total} answers didn't match your expression. it was paying more attention than you were.`;
  }

  $("#btn-restart").classList.remove("hidden");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
