import "./style.css";
import { FilesetResolver } from "@mediapipe/tasks-vision";
import { FaceTracker } from "./vision/FaceTracker.js";
import { Segmenter } from "./vision/Segmenter.js";
import { RoomScanner } from "./vision/RoomScanner.js";
import { FigureLibrary } from "./vision/FigureLibrary.js";
import { EnvironmentMonitor } from "./vision/EnvironmentMonitor.js";
import { DelayedFeed } from "./vision/DelayedFeed.js";
import { AudioSensor } from "./vision/AudioSensor.js";
import { QuizEngine } from "./quiz/QuizEngine.js";
import { CursorTracker } from "./quiz/CursorTracker.js";
import { QUESTIONS } from "./quiz/questions.js";
import { STAGES } from "./stages.js";
import { HorrorDirector, PREFETCH_LINES } from "./director/HorrorDirector.js";
import { AudioEngine } from "./core/AudioEngine.js";
import { AIClient } from "./core/AIClient.js";
import { VoiceBank } from "./core/VoiceBank.js";
import { MicRecorder } from "./core/MicRecorder.js";
import { Transcriber } from "./core/Transcriber.js";
import { AI_BACKEND_URL, MEDIAPIPE_WASM_URL } from "./config.js";
import { on } from "./core/EventBus.js";
import { runMirror } from "./segments/MirrorSegment.js";
import { taskCloseEyes, taskStaySilent } from "./segments/Tasks.js";
import { runInterrogation } from "./segments/Interrogator.js";
import { runEnding } from "./segments/Ending.js";
import { DebugOverlay } from "./debug/DebugOverlay.js";
import { ImageFlash } from "./ui/ImageFlash.js";
import { NoiseOverlay } from "./ui/NoiseOverlay.js";
import * as ui from "./ui/screens.js";

const QMAP = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const TOTAL_QUESTIONS = STAGES.flatMap((s) => s.steps).filter((s) => typeof s === "string").length;

// Lines spoken by segments — synthesized first, before the whisper pools.
const SEGMENT_LINES = [
  "Look into your own eyes. Don't look away.",
  "Don't look away.",
  "Close your eyes. Keep them closed until you hear the tone.",
  "Don't make a sound. Not for the next twelve seconds.",
  "It heard you.",
  ...STAGES.flatMap((s) => s.steps).filter((s) => s.type === "interrogate").map((s) => s.prompt)
];

const videoHidden = document.getElementById("video-hidden");
const videoRaw = document.getElementById("video-raw");
const feedCanvas = document.getElementById("feed-canvas");
const scanCanvas = document.getElementById("scan-canvas");
const calibDot = document.getElementById("calib-dot");
const calibProgress = document.getElementById("calib-progress");
const aiOptinRow = document.getElementById("ai-optin-row");
const aiOptinCheckbox = document.getElementById("ai-optin-checkbox");
const aiUnavailableNote = document.getElementById("ai-unavailable-note");

const faceTracker = new FaceTracker();
const segmenter = new Segmenter();
const roomScanner = new RoomScanner();
const figures = new FigureLibrary();
const envMonitor = new EnvironmentMonitor();
const cursor = new CursorTracker();
const quiz = new QuizEngine(faceTracker, cursor);
const audio = new AudioEngine();
const aiClient = new AIClient(AI_BACKEND_URL);
const debug = new DebugOverlay();
const imageFlash = new ImageFlash(document.getElementById("image-flash"));
imageFlash.preload();
new NoiseOverlay(document.getElementById("noise-overlay"));

let feed = null;
let audioSensor = null;
let recorder = null;
let voice = null;
let transcriber = null;
let director = null;
let playerVoice = null;

let latestFace = null;
let latestEnv = null;
let latestMic = null;
let latestMask = null;
let lastEntry = null;
let currentQuestionIndex = -1;
let currentStage = null;
let playing = false;
let aiAvailable = false;
let aiEnabled = false;
let lateBaseline = false;

// Silent, non-blocking — just decides whether to show the opt-in checkbox at all.
aiClient.healthCheck().then((ok) => {
  aiAvailable = ok;
  if (ok) aiOptinRow.classList.remove("hidden");
  else aiUnavailableNote.classList.remove("hidden");
});

// Belt and braces: any click or keypress wakes the audio back up if the browser suspended it.
for (const ev of ["pointerdown", "keydown"]) window.addEventListener(ev, () => audio.unlock(), { passive: true });

// ---------------------------------------------------------------- consent
document.getElementById("btn-consent").addEventListener("click", async () => {
  const btn = document.getElementById("btn-consent");
  const audioReady = audio.init();
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

  // match the feed canvas to the camera's real aspect ratio
  const vw = videoHidden.videoWidth || 640, vh = videoHidden.videoHeight || 480;
  feedCanvas.width = 640;
  feedCanvas.height = Math.round((640 * vh) / vw);
  feed = new DelayedFeed(feedCanvas);

  await audioReady;
  await audio.unlock();
  audio.startAmbientDrone();

  const micTrack = stream.getAudioTracks()[0];
  audioSensor = new AudioSensor(audio.ctx);
  if (micTrack) {
    audioSensor.attach(new MediaStream([micTrack]));
    recorder = new MicRecorder(audio.ctx, new MediaStream([micTrack]));
  }

  aiEnabled = aiAvailable && aiOptinCheckbox.checked;
  voice = new VoiceBank(aiClient, audio, aiEnabled);
  transcriber = new Transcriber({ aiClient, aiEnabled });
  director = new HorrorDirector({ aiClient, aiEnabled, figures });

  btn.textContent = "loading…";
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  await Promise.all([
    faceTracker.init(fileset),
    segmenter.init(fileset),
    roomScanner.init(fileset),
    figures.loadImages()
  ]);

  // background work — none of it blocks the game
  voice.prefetch([...SEGMENT_LINES, ...PREFETCH_LINES]);
  transcriber.warmup();

  ui.showScreen("screen-calibration");
  requestAnimationFrame(loop);
  await runCalibration();

  ui.showScreen("screen-quiz");
  await runGame();
});

// ---------------------------------------------------------------- calibration
async function runCalibration() {
  const progress = (p) => (calibProgress.style.width = `${Math.round(p * 100)}%`);

  // 1. gaze dot
  ui.setCalibInstruction("hold still and look at the dot.");
  const positions = [[50, 50], [20, 25], [80, 25], [80, 75], [20, 75], [50, 50]];
  for (let i = 0; i < positions.length; i++) {
    calibDot.style.left = positions[i][0] + "%";
    calibDot.style.top = positions[i][1] + "%";
    progress(((i + 1) / positions.length) * 0.25);
    await sleep(1100);
  }
  calibDot.classList.add("hidden");

  // 2. room scan (objects behind them, labels only)
  ui.setCalibInstruction("scanning the room behind you.");
  await roomScanner.scan(videoHidden, scanCanvas, () => latestFace, () => latestMask, 4500);
  director.setRoom(roomScanner);
  envMonitor.resetBaseline();
  progress(0.4);

  // 3. neutral baseline — while READING, so concentration is part of "normal"
  ui.setCalibInstruction("read these. don't answer.<br>just relax your face.");
  ui.showCalibSample(true);
  await sleep(700);
  faceTracker.beginBaselineCapture();
  await sleep(4000);
  if (!faceTracker.finishBaselineCapture()) {
    // Face wasn't visible (or the machine is slow): take the baseline during
    // the first intake questions instead — the player is reading there too.
    console.warn("[calibration] not enough face frames for a baseline — retrying during stage I");
    lateBaseline = true;
  }
  ui.showCalibSample(false);
  const silhouetteMask = latestMask;
  progress(0.55);

  // 4. posed expressions: per-player range + clips the game will use later
  const poses = [
    ["smile", "smile. a real one."],
    ["raise", "raise your eyebrows. as high as they go."],
    ["frown", "now frown."]
  ];
  for (let i = 0; i < poses.length; i++) {
    const [name, text] = poses[i];
    ui.setCalibInstruction(text);
    await sleep(900);
    faceTracker.beginExpressionCapture(name);
    feed.startClipRecording(name);
    await sleep(1500);
    faceTracker.finishExpressionCapture();
    feed.stopClipRecording();
    ui.setCalibInstruction("relax.");
    progress(0.55 + ((i + 1) / poses.length) * 0.25);
    await sleep(600);
  }

  // Figure fallback: their own silhouette, if no figure images were provided.
  if (!figures.figures.length) figures.addSilhouette(silhouetteMask);

  // 5. a line in their own voice
  if (recorder) {
    ui.setCalibInstruction(`say this out loud:<br><em>"i'm the only one in this room."</em>`);
    await sleep(500);
    const samples = await recorder.recordFor(3500);
    if (samples.length > audio.ctx.sampleRate * 0.4) {
      playerVoice = recorder.toAudioBuffer(samples);
      director.setPlayerVoiceAvailable(true);
    }
  }
  progress(1);
  ui.setCalibInstruction("good. hold still.");
  await sleep(1000);
}

// ---------------------------------------------------------------- the game
async function runGame() {
  playing = true;
  const ctx = {
    feed, director, ui, audio, voice, playerVoice, recorder, transcriber, aiClient, aiEnabled, faceTracker, imageFlash,
    room: roomScanner,
    getFace: () => latestFace,
    getMic: () => latestMic
  };

  let qIndex = 0;
  if (lateBaseline) faceTracker.beginBaselineCapture();
  for (const stage of STAGES) {
    currentStage = stage;
    director.setStage(stage);
    director.suspend(true); // nothing fires over the title card
    await ui.showStageCard(stage.title, stage.subtitle, 3200, stage.id === "intake" ? null : imageFlash.randomUrl());
    director.suspend(false);

    for (const step of stage.steps) {
      if (typeof step === "string") {
        currentQuestionIndex = qIndex;
        lastEntry = await quiz.ask(QMAP[step], qIndex, TOTAL_QUESTIONS, stage);
        qIndex++;
        if (lateBaseline && qIndex === 2) {
          lateBaseline = false;
          faceTracker.finishBaselineCapture();
        }
        await sleep(350);
      } else if (step.type === "mirror") {
        director.suspend(true);
        await runMirror({ ...ctx, durationMs: step.durationMs });
        director.suspend(false);
      } else if (step.type === "task") {
        if (step.task === "closeEyes") await taskCloseEyes(ctx);
        else if (step.task === "staySilent") await taskStaySilent(ctx);
      } else if (step.type === "interrogate") {
        if (recorder) await runInterrogation({ ...ctx, prompt: step.prompt });
      }
    }
  }

  playing = false;
  await runEnding(ctx);
}

// ---------------------------------------------------------------- quiz wiring
on("question-shown", (e) => {
  const { question, index, total, stage } = e.detail;
  const container = ui.renderQuestion(question, index, total, stage, (optionIndex) => {
    quiz.selectAnswer(optionIndex, performance.now());
  });
  cursor.begin(container);
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

// An AI-upgraded line for a beat that already fired — swap the visible text in place.
on("director-whisper-update", (e) => ui.showWhisper(e.detail.text));

// Spoken whispers (AI mode only). If the upgraded line can't be synthesized in
// time, fall back to the pre-generated local line.
on("director-speak", async (e) => {
  const { text, fallback, position } = e.detail;
  const played = await voice?.speak(text, { position, dropIfBusy: true, maxWaitMs: 2200 });
  if (!played && fallback && fallback !== text) voice?.speak(fallback, { position, dropIfBusy: true, maxWaitMs: 300 });
});

on("director-prefetch-voice", (e) => voice?.get(e.detail.text));

on("director-player-voice", (e) => {
  if (playerVoice) audio.playPlayerVoice(playerVoice, e.detail.variant);
});

on("director-image-flash", (e) => {
  if (imageFlash.flash(e.detail.ms)) audio.playStinger("static", { x: 0, y: 0, z: -0.3 });
});
on("director-intensity", (e) => audio.setDroneIntensity(e.detail.amount));
on("director-darkness", (e) => ui.setDarkness(e.detail.amount));

document.getElementById("btn-restart").addEventListener("click", () => window.location.reload());

// ---------------------------------------------------------------- main loop
function loop() {
  const now = performance.now();
  latestFace = faceTracker.update(videoHidden, now) || latestFace;
  latestMask = segmenter.update(videoHidden, now);
  latestEnv = envMonitor.update(videoHidden, latestFace?.keypoints) || latestEnv;
  latestMic = audioSensor?.update(now) || latestMic;
  feed.update(videoHidden, now, { face: latestFace, mask: latestMask, motion: latestEnv?.inMotion, levels: latestEnv?.levels });

  const behind = feed.mode === "delayed" || feed.mode === "replay";
  ui.setFeedStatus(behind ? "● …" : "● live", behind); // frozen/clip modes still claim to be live

  quiz.recordFrame(latestFace, now);
  if (playing && director) {
    director.tick({ face: latestFace, env: latestEnv, mic: latestMic, feed }, now, currentQuestionIndex);
    if (currentStage?.features.room) roomScanner.passive(videoHidden, now, latestFace, latestMask);
  }
  debug.update({ face: latestFace, faceTracker, director, lastEntry, feed });
  requestAnimationFrame(loop);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}