// A Mochi event: cute Mochi, her song, a few happy seconds... then one
// mutilation, slowly, and the player is made to watch it.
//
//   1. pre-roll   ~4.5s  cute Mochi + speech bubble + her theme (in later acts the theme is already slightly wrong)
//   2. transition        cute -> wound. ONLY advances while the face is on screen and looking at it.
//   3. hold       ~5s    the finished wound stays up (also only counts while watching)
//   4. cut-away          sudden black + silence + a low hit, then a whisper
//
// Looking away freezes everything, swells the drone, and tells them to watch.
// A hard real-time cap means nobody can be trapped (same rule as the mirror).

import { eventBefore, eventAfter, aiMochiLine } from "../mochi/MochiLines.js";
import { FEAR_CHANNELS } from "../vision/FaceTracker.js";
import { settings } from "../settings.js";
import { WOUNDS_ALL } from "../mochi/wounds.js";
import { giggle } from "../mochi/Giggle.js";
import { headItem, accessoryHtml } from "../mochi/outfit.js";

const WATCHING = (face) => !!face && face.faceVisible && !face.lookingAway && !face.blinkTooLong;

const PREROLL_MS = 4500;
const EVENT_SEC = 18;          // watched seconds for transition + hold
const REVEAL_START = 0.05;     // fraction of EVENT_SEC where the wound starts
const REVEAL_END = 0.73;       // ...and where it's complete (the rest is the hold)
const MAX_REAL_TIME_MS = 80000;
const CUT_BLACK_MS = 1300;

/**
 * @param {{scene: string, act: number, engine: import('../mochi/MochiEngine').MochiEngine,
 *          mochiAudio: import('../mochi/MochiAudio').MochiAudio, getFace: () => object,
 *          ui: object, director: object, voice?: object}} ctx
 */
export async function runMochiEvent({ scene, act, engine, mochiAudio, getFace, ui, director, voice, player, aiClient, aiEnabled, samples }) {
  const ok = await engine.load();
  if (!ok) return { skipped: true };
  engine.calm = settings.reduceFlashing;
  const dossier = director?.getSummary().compactDossier ?? [];
  const before = eventBefore(scene, player);

  ui.showMochiEvent();
  ui.setMochiEventProgress(0);
  engine.render(scene, 0, 0, performance.now());
  mochiAudio?.begin(act, { musicVolume: 0.5 });
  ui.setMochiBubble(before);
  aiMochiLine(aiClient, aiEnabled, "event-before", { act, scene, name: player?.name, snack: player?.snack, localFallbackText: before, dossier }, 1500)
    .then((t) => { if (t && document.getElementById("mochi-event-bubble")?.textContent === before) ui.setMochiBubble(t); });

  // ---- 1. pre-roll: cute. (just let it be cute.)
  const preEnd = performance.now() + PREROLL_MS;
  while (performance.now() < preEnd) {
    const now = await nextFrame();
    engine.render(scene, 0, 0, now);
    mochiAudio?.update(scene, 0, 0.016, true, 0);
  }
  ui.setMochiBubble("");

  // ---- 2 + 3. transition and hold, gated by attention
  const start = performance.now();
  let last = start, P = 0, awayMs = 0, lookAways = 0, wasWatching = true, lastNag = 0, flinch = 0;
  while (P < 1 && performance.now() - start < MAX_REAL_TIME_MS) {
    const now = await nextFrame();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const face = getFace();
    const watching = WATCHING(face) && !document.hidden;
    if (face?.reaction && FEAR_CHANNELS.includes(face.dominantExpression)) flinch = Math.max(flinch, face.reaction);

    if (watching) {
      P = Math.min(1, P + dt / EVENT_SEC);
      awayMs = 0;
      if (!wasWatching) ui.setMochiWatchText("");
    } else {
      if (wasWatching) lookAways += 1;
      awayMs += dt * 1000;
      if (awayMs > 600 && now - lastNag > 4500) {
        lastNag = now;
        ui.setMochiWatchText(pick(["watch her.", "don't look away from her.", "she wants you to see.", "look at mochi."]));
        voice?.speak("Watch her.", { position: { x: 0, y: 0, z: 0.4 }, dropIfBusy: true, maxWaitMs: 400 });
      }
    }
    wasWatching = watching;

    const e = clamp01((P - REVEAL_START) / (REVEAL_END - REVEAL_START));
    const t = e * e * (3 - 2 * e);
    engine.render(scene, t, P, now);
    ui.setMochiEventProgress(P);
    mochiAudio?.update(scene, t, dt, watching, awayMs / 1000);
  }

  // ---- 4. the flash: every injury at once, lunging at you. a screech, her giggle under it.
  await allWoundsFlash({ samples, player });

  // ---- 5. sudden cut-away
  mochiAudio?.cutAway();
  ui.setMochiWatchText("");
  ui.hideMochiEvent({ instant: true });
  ui.blackout(CUT_BLACK_MS);
  await sleep(CUT_BLACK_MS);

  director?.bumpCreep(0.05);
  const after = eventAfter(scene, player, dossier, { lookAways, flinch });
  const aiAfter = aiMochiLine(aiClient, aiEnabled, "event-after", {
    act, scene, name: player?.name, snack: player?.snack, localFallbackText: after, dossier,
    stats: { lookAways, flinchedHard: flinch > 3, pettedHer: player?.petted }
  }, 1500);
  const upgraded = await Promise.race([aiAfter, sleep(900).then(() => null)]);
  director?.say(upgraded || after);
  if (director) director.stats.mochiLookAways = (director.stats.mochiLookAways || 0) + lookAways;
  return { lookAways, completed: P >= 1 };
}

/**
 * After each injury scene: for under a second, Mochi with ALL of her
 * injuries (stitches, ears, eyes, belly) lunges at the screen. A screech,
 * and her giggle underneath. Then the usual cut to black.
 */
const FLASH_MS = 850;
export async function allWoundsFlash({ samples, player }) {
  const calm = settings.reduceFlashing;
  const head = headItem(player?.outfit?.head);
  const el = document.createElement("div");
  el.className = "mochi-flash" + (calm ? " calm" : "");
  el.innerHTML = `<div class="mf-white"></div><div class="mf-mochi"><img src="${WOUNDS_ALL}" alt="" />${head ? accessoryHtml(head) : ""}</div>`;
  document.body.appendChild(el);
  // make sure the picture is ready, so the flash never shows an empty frame
  const img = el.querySelector("img");
  if (!img.complete) await Promise.race([new Promise((r) => (img.onload = r)), sleep(400)]);
  samples?.play("screech", { gain: 0.9, jitter: 0.03 });
  giggle.play({ creep: Math.max(giggle.creep, 0.8), gain: 0.9, wait: 0.12 });
  void el.offsetWidth;
  el.classList.add("go");
  // wait for the lunge itself to finish (a busy machine may start it late), but never hang
  const mochi = el.querySelector(".mf-mochi");
  await Promise.race([
    new Promise((r) => mochi.addEventListener("animationend", (e) => { if (e.animationName === "mf-lunge") r(); })),
    sleep(FLASH_MS * 2.2)
  ]);
  el.remove();
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp01(x) {
  return Math.min(1, Math.max(0, x));
}

function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}
