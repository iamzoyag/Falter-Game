import "./style.css";
import { FaceTracker } from "./vision/FaceTracker.js";
import { EnvironmentMonitor } from "./vision/EnvironmentMonitor.js";
import { DelayedFeed } from "./vision/DelayedFeed.js";
import { AudioSensor } from "./vision/AudioSensor.js";
import { QuizEngine } from "./quiz/QuizEngine.js";
import { QUESTIONS } from "./quiz/questions.js";
import { HorrorDirector } from "./director/HorrorDirector.js";
import { AudioEngine } from "./core/AudioEngine.js";
import { AIClient } from "./core/AIClient.js";
import { AI_BACKEND_URL } from "./config.js";
import { on } from "./core/EventBus.js";
import * as ui from "./ui/screens.js";

const videoHidden = document.getElementById("video-hidden");
const videoRaw = document.getElementById("video-raw");
const feedCanvas = document.getElementById("feed-canvas");
const calibDot = document.getElementById("calib-dot");
const calibProgress = document.getElementById("calib-progress");
const calibInstruction = document.getElementById("calibration-instruction");
const aiOptinRow = document.getElementById("ai-optin-row");
const aiOptinCheckbox = document.getElementById("ai-optin-checkbox");
const aiUnavailableNote = document.getElementById("ai-unavailable-note");

const faceTracker = new FaceTracker();
const envMonitor = new EnvironmentMonitor();
const delayedFeed = new DelayedFeed(feedCanvas);
let audioSensor = null;
const quiz = new QuizEngine(QUESTIONS);
const audio = new AudioEngine();
const aiClient = new AIClient(AI_BACKEND_URL);

let director = null; // constructed at consent time, once we know if AI is opted in
let latestFace = null;
let latestEnv = null;
let latestMic = null;
let currentQuestionIndex = -1;
let loopStarted = false;
let aiAvailable = false;

// Silent, non-blocking — just decides whether to show the opt-in checkbox at all.
aiClient.healthCheck().then((ok) => {
  aiAvailable = ok;
  if (ok) aiOptinRow.classList.remove("hidden");
  else aiUnavailableNote.classList.remove("hidden");
});

// ---------------------------------------------------------------- consent
document.getElementById("btn-consent").addEventListener("click", async () => {
  const btn = document.getElementById("btn-consent");
  btn.disabled = true;
  btn.textContent = "asking for camera + mic access…";

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    videoHidden.srcObject = stream;
    videoRaw.srcObject = stream;
    await Promise.all([videoHidden.play(), videoRaw.play()]);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "i understand — let me in";
    alert(
      "Couldn't get camera/mic access (" + err.message + "). This game needs both to work — check your browser's site permissions and try again."
    );
    return;
  }

  await audio.init(); // must happen inside a user-gesture handler
  audio.startAmbientDrone();

  audioSensor = new AudioSensor(audio.ctx);
  const micTrack = stream.getAudioTracks()[0];
  if (micTrack) audioSensor.attach(new MediaStream([micTrack]));

  const aiEnabled = aiAvailable && aiOptinCheckbox.checked;
  director = new HorrorDirector({ aiClient, aiEnabled });

  await faceTracker.init();
  ui.showScreen("screen-calibration");
  await runCalibration();

  ui.showScreen("screen-quiz");
  quiz.start();
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(loop);
  }
});

// ---------------------------------------------------------------- calibration
async function runCalibration() {
  const positions = [
    [50, 50], [20, 25], [80, 25], [80, 75], [20, 75], [50, 50]
  ];
  const stepMs = 1100;

  for (let i = 0; i < positions.length; i++) {
    const [left, top] = positions[i];
    calibDot.style.left = left + "%";
    calibDot.style.top = top + "%";
    calibProgress.style.width = `${((i + 1) / positions.length) * 100}%`;
    if (i === positions.length - 1) calibInstruction.textContent = "good. hold still.";
    await sleep(stepMs);
  }

  for (let i = 0; i < 15; i++) {
    envMonitor.update(videoHidden);
    audioSensor?.update(performance.now());
    await sleep(30);
  }
  envMonitor.resetBaseline();

  // Per-player neutral-face baseline — corrects for individual resting
  // expression, so a naturally lower brow or asymmetric mouth doesn't get
  // read as "frowning"/"smiling" on every single answer.
  calibInstruction.textContent = "relax your face. hold a neutral expression.";
  faceTracker.beginBaselineCapture();
  for (let i = 0; i < 40; i++) {
    faceTracker.update(videoHidden, performance.now());
    faceTracker.sampleBaseline();
    await sleep(30);
  }
  faceTracker.finishBaselineCapture();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------- quiz wiring
on("question-shown", (e) => {
  currentQuestionIndex = e.detail.index;
  ui.renderQuestion(e.detail.question, e.detail.index, e.detail.total, (optionIndex) => {
    quiz.selectAnswer(optionIndex, performance.now());
  });
});

on("director-summary", async (e) => {
  const { mismatchCount, total, dossier, aiEnabled } = e.detail;

  if (!aiEnabled) {
    setTimeout(() => {
      ui.renderEnding(mismatchCount, total);
      ui.showScreen("screen-ending");
    }, 1800);
    return;
  }

  setTimeout(async () => {
    ui.showScreen("screen-ending");
    ui.showEndingLoading();
    const compact = dossier.map((d) => ({
      prompt: d.prompt,
      chosenText: d.chosenText,
      claimedFeeling: d.expressionHint,
      actualExpression: d.measured?.dominant ?? "unknown",
      mismatch: d.mismatch
    }));
    const report = await aiClient.requestEndingReport({ dossier: compact });
    ui.renderEnding(mismatchCount, total, report);
  }, 1800);
});

on("director-casefile", (e) => ui.updateCaseFile(e.detail.text));

// ---------------------------------------------------------------- director beats -> audio + screen fx
on("director-beat", (e) => {
  const beat = e.detail;
  if (beat.stinger) audio.playStinger(beat.stinger, beat.position);
  if (beat.kind?.includes("whisper") && beat.text) ui.showWhisper(beat.text);
  if (beat.kind?.includes("flash")) ui.flashScreen(beat.intensity ?? 0.3);
  if (beat.kind?.includes("shake")) ui.shakeScreen();
});

// An AI-upgraded line for a beat that already fired — swap the visible text
// in place if the whisper overlay is still showing (or about to).
on("director-whisper-update", (e) => {
  ui.showWhisper(e.detail.text);
});

on("director-intensity", (e) => audio.setDroneIntensity(e.detail.amount));

document.getElementById("btn-restart").addEventListener("click", () => window.location.reload());

// ---------------------------------------------------------------- main loop
function loop(nowMs) {
  latestFace = faceTracker.update(videoHidden, nowMs) || latestFace;
  latestEnv = envMonitor.update(videoHidden) || latestEnv;
  latestMic = audioSensor?.update(nowMs) || latestMic;
  delayedFeed.update(videoHidden, nowMs, latestEnv?.inMotion);

  ui.setFeedStatus(delayedFeed.isLive() ? "● live" : "● …", !delayedFeed.isLive());

  if (currentQuestionIndex >= 0 && director) {
    quiz.recordFrame(latestFace, nowMs);
    director.tick({ face: latestFace, env: latestEnv, mic: latestMic, delayedFeed }, nowMs, currentQuestionIndex);
  }

  requestAnimationFrame(loop);
}
