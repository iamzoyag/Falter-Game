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
import { runMochiEvent } from "./segments/MochiSegment.js";
import { runGreet, runRoundCard, runPet, runFeed, runPolaroid, runTalk, runFakeEnd, runDressUp, runCatch, runDessertResult, tally } from "./segments/MochiPlay.js";
import { runDecorate, runHideAndSeek } from "./segments/MochiRoom.js";
import { outfitParts } from "./mochi/outfit.js";
import { runCake, runInvite, runPinBow, runGift } from "./segments/MochiParty.js";
import { answerReaction, hostLine, aiMochiLine, specialReaction, repeatReaction, TALK } from "./mochi/MochiLines.js";
import { CuteSfx } from "./core/CuteSfx.js";
import { SampleBank } from "./core/SampleBank.js";
import { FaceGore } from "./ui/FaceGore.js";
import { settings, setReduceFlashing } from "./settings.js";
import { MochiEngine } from "./mochi/MochiEngine.js";
import { MochiAudio } from "./mochi/MochiAudio.js";
import { CuteTheme } from "./core/CuteTheme.js";
import { DebugOverlay } from "./debug/DebugOverlay.js";
import { ImageFlash } from "./ui/ImageFlash.js";
import { NoiseOverlay } from "./ui/NoiseOverlay.js";
import * as ui from "./ui/screens.js";

const QMAP = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
const TOTAL_QUESTIONS = STAGES.flatMap((s) => s.steps).filter((s) => typeof s === "string" || s.type === "repeat").length;

// Lines spoken by segments — synthesized first, before the whisper pools.
const SEGMENT_LINES = [
  "Look into your own eyes. Don't look away.",
  "Don't look away.",
  "Close your eyes. Keep them closed until you hear the tone.",
  "Don't make a sound. Not for the next twelve seconds.",
  "It heard you.",
  "Watch her.",
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
const mochi = new MochiEngine(document.getElementById("mochi-canvas"));
const faceGore = new FaceGore(document.getElementById("face-gore"));
// What the player tells Mochi in Act I. It all comes back later.
// outfit, caught and dessert come from Act II; room, friend and cornerFound from Act III;
// frosting, guests and blewOut from Act IV
const player = { name: "", snack: null, petted: null, polaroid: null, outfit: null, caught: null, dessert: null, room: null, friend: null, cornerFound: null, frosting: null, guests: null, blewOut: null };

const reduceFlashBox = document.getElementById("reduce-flash-checkbox");
reduceFlashBox.checked = settings.reduceFlashing;
reduceFlashBox.addEventListener("change", () => setReduceFlashing(reduceFlashBox.checked));
mochi.load(); // preload in the background; the first event is ~5 questions away
ui.setAct(1);

let feed = null;
let audioSensor = null;
let recorder = null;
let voice = null;
let transcriber = null;
let director = null;
let playerVoice = null;
let cuteTheme = null;
let mochiAudio = null;
let cuteSfx = null;
let samples = null;

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
  feed.setBaseWarp({ cute: 1, grain: 0, desat: 0, vignette: 0, pixel: 1 }); // Act I photo-booth look

  await audio.init(); // must happen inside a user-gesture handler
  audio.setDroneEnabled(false); // Act I is cute: no dread underneath yet
  audio.startAmbientDrone();

  // Mochi's theme plays from here through Act I. A recorded track at
  // public/audio/cute-theme.mp3 is used if present, else the synth version.
  cuteTheme = new CuteTheme(audio.ctx, audio.master, { url: "/audio/cute-theme.mp3", volume: 0.32 });
  if (import.meta.env.DEV) window.__warp = () => ({ ...cuteTheme.warp }); // for playtesting the song drift
  await cuteTheme.load();
  cuteTheme.play({ fade: 2.5 });
  cuteSfx = new CuteSfx(audio.ctx, audio.master);
  samples = new SampleBank(audio.ctx, audio.master);
  samples.load(); // recorded gore sfx, in the background (synth fallback until they arrive)
  mochiAudio = new MochiAudio(audio.ctx, audio.master, cuteTheme, samples);

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
  ui.setCalibInstruction("hold still and look at the dot ♡");
  const positions = [[50, 50], [20, 25], [80, 25], [80, 75], [20, 75], [50, 50]];
  for (let i = 0; i < positions.length; i++) {
    calibDot.style.left = positions[i][0] + "%";
    calibDot.style.top = positions[i][1] + "%";
    progress(((i + 1) / positions.length) * 0.25);
    await sleep(1100);
  }
  calibDot.classList.add("hidden");

  // 2. room scan (objects behind them, labels only)
  ui.setCalibInstruction("mochi is having a little look around your room ♡");
  await roomScanner.scan(videoHidden, scanCanvas, () => latestFace, () => latestMask, 4500);
  director.setRoom(roomScanner);
  envMonitor.resetBaseline();
  progress(0.4);

  // 3. neutral baseline — while READING, so concentration is part of "normal"
  ui.setCalibInstruction("read these, but don't answer yet!<br>just relax your face ♡");
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
    ["smile", "smile for mochi! a real one ♡"],
    ["raise", "now look super surprised! eyebrows up!"],
    ["frown", "now a grumpy face. grrr!"]
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
    ui.setCalibInstruction("hehe. relax ♡");
    progress(0.55 + ((i + 1) / poses.length) * 0.25);
    await sleep(600);
  }

  // Figure fallback: their own silhouette, if no figure images were provided.
  if (!figures.figures.length) figures.addSilhouette(silhouetteMask);

  // 5. a line in their own voice
  if (recorder) {
    ui.setCalibInstruction(`say this out loud for mochi:<br><em>"mochi, you're my best friend."</em>`);
    await sleep(500);
    cuteTheme?.setVolume(0, 0.2); // keep the music out of their recorded voice
    const samples = await recorder.recordFor(3500);
    cuteTheme?.setVolume(0.32, 1.5);
    if (samples.length > audio.ctx.sampleRate * 0.4) {
      playerVoice = recorder.toAudioBuffer(samples);
      director.setPlayerVoiceAvailable(true);
    }
  }
  progress(1);
  ui.setCalibInstruction("perfect!! ♡");
  await sleep(1000);
}

// ---------------------------------------------------------------- the game
async function runGame() {
  playing = true;
  const ctx = {
    feed, director, ui, audio, voice, playerVoice, recorder, transcriber, aiClient, aiEnabled, faceTracker, imageFlash,
    engine: mochi, mochiAudio, player, faceGore, samples, sfx: cuteSfx,
    getVideo: () => videoHidden,
    room: roomScanner,
    getFace: () => latestFace,
    getMic: () => latestMic
  };

  let qIndex = 0;
  if (lateBaseline) faceTracker.beginBaselineCapture();
  // dev only: ?act=2 starts at that act, for playtesting one act at a time
  const startAct = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("act")) || 1 : 1;
  if (startAct > 1) player.name ||= "friend";
  for (const stage of STAGES) {
    if ((stage.act ?? 1) < startAct) continue;
    currentStage = stage;
    // `look` (how far gone the world is) drives colour, music, filter and Mochi's voice;
    // `act` is only the act's place in the story.
    const act = stage.look ?? stage.act ?? 1;
    ui.setAct(act);
    director.setStage(stage);
    enterActAudio(act);
    if (stage.card !== "none") {
      director.suspend(true); // nothing fires over the title card
      await ui.showStageCard(stage.title, stage.subtitle, 3200, act <= 3 ? null : imageFlash.randomUrl());
      director.suspend(false);
    }

    driftBase = { ...(cuteTheme?.warp || { tempo: 1, cents: 0, wobble: 0, muffle: 0 }) };
    for (let si = 0; si < stage.steps.length; si++) {
      const step = stage.steps[si];
      const p = si / Math.max(1, stage.steps.length - 1);
      if (stage.drift) applyDrift(p);
      else if (stage.songDrift) applySongDrift(stage.songDrift, p);

      if (typeof step === "string" || step.type === "repeat") {
        currentQuestionIndex = qIndex;
        ui.setMochiHostLine(hostLine(act, player));
        const base = QMAP[typeof step === "string" ? step : step.of];
        const q = typeof step === "string" ? base : { ...base, id: `${base.id}-again`, callbackId: `${base.callbackId}_again` };
        lastEntry = await quiz.ask(q, qIndex, TOTAL_QUESTIONS, stage);
        qIndex++;
        const previous = step.type === "repeat" ? quiz.getDossier().find((d) => d.questionId === base.id) : null;
        if (act <= 3) await mochiReacts(q, lastEntry, act, ctx, previous);
        if (lateBaseline && qIndex === 2) {
          lateBaseline = false;
          faceTracker.finishBaselineCapture();
        }
        await sleep(350);
      } else if (step.type === "talk") {
        director.suspend(true);
        ui.setMochiHostLine("");
        if (step.lines === "bonus") cuteTheme?.play({ fade: 0.4, fromTop: true }); // she bursts back in, song and all
        player.friend = tally(quiz.getDossier(), "friend", player.friend);
        await runTalk(ctx, TALK[step.lines] || [], { mood: step.mood || "cute", flicker: step.flicker || null });
        director.suspend(false);
      } else if (step.type === "fakeEnd") {
        cuteTheme?.stop({ fade: 2.5 }); // the song ends. it's over.
        await runFakeEnd(ctx);
        await sleep(900);
      } else if (step.type === "pause") {
        // let the last whisper sit in the faded room, then black
        await sleep(2400);
        ui.blackout(step.ms - 2400);
        await sleep(step.ms - 2400);
      } else if (step.type === "features") {
        director.setFeatures(step.set);
      } else if (step.type === "mirror") {
        director.suspend(true);
        await runMirror({ ...ctx, durationMs: step.durationMs });
        director.suspend(false);
      } else if (step.type === "play") {
        director.suspend(true);
        ui.setMochiHostLine("");
        if (step.kind === "greet") await runGreet(ctx);
        else if (step.kind === "pet") await runPet(ctx);
        else if (step.kind === "feed") await runFeed(ctx);
        else if (step.kind === "polaroid") await runPolaroid(ctx);
        else if (step.kind === "dressup") {
          await runDressUp(ctx);
          ui.setHostOutfit(player.outfit);
          mochi.setOutfit(outfitParts(player.outfit)); // she keeps it on in the gore scenes
        }
        else if (step.kind === "catch") await runCatch(ctx);
        else if (step.kind === "dessert") await runDessertResult(ctx, quiz.getDossier());
        else if (step.kind === "decorate") await runDecorate(ctx);
        else if (step.kind === "hide") await runHideAndSeek(ctx);
        else if (step.kind === "cake") await runCake(ctx);
        else if (step.kind === "invite") await runInvite(ctx);
        else if (step.kind === "pinbow") await runPinBow(ctx);
        else if (step.kind === "gift") await runGift(ctx);
        director.suspend(false);
      } else if (step.type === "round") {
        ui.setMochiHostLine("");
        await runRoundCard(ctx, step.title, step.sub, { glitch: !!step.glitch });
      } else if (step.type === "mochi") {
        director.suspend(true);
        ui.setHostHurt(false);
        await runMochiEvent({ ...ctx, scene: step.scene, act });
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

/** Mochi reacts to the answer in her bubble (AI-personalised if it's quick enough). */
async function mochiReacts(question, entry, act, ctx, previous = null) {
  const optionIndex = question.options.findIndex((o) => o.text === entry?.chosenText);
  const dossier = director.getSummary().compactDossier;
  const special = previous
    ? repeatReaction(previous.chosenText, entry?.chosenText, player)
    : act <= 2 ? specialReaction(question, optionIndex, { player, room: roomScanner, dossier }) : null;
  const local = special || answerReaction(question, optionIndex, act, player);
  ui.setMochiHostLine(local);
  cuteSfx?.[act <= 2 ? "pop" : "tick"]();
  if (special === "...") ui.flickerHost("/mochi/stitches.webp", 70); // "would you miss her?" "probably not."
  const hold = sleep(special ? 2600 : act <= 2 ? 1700 : 1100);
  // the special lines are already personal; only the plain reactions go to the AI
  const ai = special ? null : await Promise.race([
    aiMochiLine(ctx.aiClient, ctx.aiEnabled, act === 1 ? "answer" : "host", {
      act, name: player.name, snack: player.snack, question: question.prompt, answer: entry?.chosenText,
      localFallbackText: local, dossier: dossier.slice(-8)
    }, 1300),
    hold.then(() => null)
  ]);
  if (ai) {
    ui.setMochiHostLine(ai);
    await sleep(1400);
  } else await hold;
}

/** Sound + colour for the start of each act. */
function enterActAudio(act) {
  if (act === 2) {
    audio.setUnease(0.1);
  } else if (act === 3) {
    // the song comes back broken, and the drone is under it now
    cuteTheme?.setWarp({ tempo: 0.88, cents: -45, wobble: 0.35, muffle: 0.3 });
    cuteTheme?.play({ fade: 3, fromTop: true });
    cuteTheme?.setVolume(0.22);
    audio.setUnease(0.5);
    if (!audio.droneEnabled) audio.setDroneEnabled(true, 0.05);
    director.setCute(0.3);
  } else if (act >= 4) {
    cuteTheme?.stop({ fade: 1 });
    audio.setUnease(0);
    if (!audio.droneEnabled) audio.setDroneEnabled(true);
  }
}

// the song's state when the current stage began, so drift carries on from
// wherever the last act left it instead of snapping back to normal
let driftBase = { tempo: 1, cents: 0, wobble: 0, muffle: 0 };

/** The draining act: everything drifts a little further from normal with every step (p 0..1). */
function applyDrift(p) {
  ui.setDrain(p);
  director.setCute(1 - p * 0.6);
  audio.setUnease(0.1 + p * 0.7);
  const b = driftBase;
  cuteTheme?.setWarp({
    tempo: Math.min(b.tempo, 1) - p * 0.05,
    cents: Math.min(b.cents, -6) - p * 34,
    wobble: Math.max(b.wobble, 0.04) + p * 0.22,
    muffle: Math.max(b.muffle, 0) + p * 0.15
  });
}

/** Only the song changes: a slow slide toward `to` (tempo/cents/wobble) over the act. */
function applySongDrift(to, p) {
  const b = driftBase, lerp = (x, y) => x + (y - x) * p;
  cuteTheme?.setWarp({ tempo: lerp(b.tempo, to.tempo ?? b.tempo), cents: lerp(b.cents, to.cents ?? b.cents), wobble: lerp(b.wobble, to.wobble ?? b.wobble) });
}

/** One deniable thing. The player shouldn't be sure anything happened. */
function subliminal(kind, level) {
  const act = currentStage?.act ?? 1;
  if (kind === "host") ui.flickerHost(act >= 3 ? "/mochi/eyes.webp" : "/mochi/stitches.webp", 45);
  else if (kind === "breath") audio.breatheBehind(level >= 2 ? 0.16 : 0.1);
  else if (kind === "prompt") ui.glitchPrompt(player.name);
  else if (kind === "feed" && feed?.isLive()) feed.startGlitch(0.6, 380);
  else if (kind === "song" && cuteTheme?.playing) {
    const w = { ...cuteTheme.warp };
    cuteTheme.setWarp({ tempo: w.tempo * 0.55, cents: w.cents - 140 });
    setTimeout(() => cuteTheme.setWarp(w), 420);
  }
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
on("director-subliminal", (e) => subliminal(e.detail.kind, e.detail.level));
on("director-face-gore", (e) => {
  if (!latestFace?.keypoints || !faceGore.flash(videoHidden, latestFace.keypoints, e.detail?.ms)) return;
  if (!samples?.play("snap", { gain: 0.7 })) audio.playStinger("static", { x: 0, y: 0, z: -0.3 });
  samples?.play("squelch", { gain: 0.6, delay: 0.05 });
});
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

  // Act III: she has her stitches whenever your eyes are closed
  ui.setHostHurt(!!(currentStage?.features?.hostHurt && director?.features?.hostHurt !== false && latestFace?.blinking));

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