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

const WATCHING = (face) => !!face && face.faceVisible && !face.lookingAway && !face.blinkTooLong;

const PREROLL_MS = 4500;
const EVENT_SEC = 18;          // watched seconds for transition + hold
const REVEAL_START = 0.05;     // fraction of EVENT_SEC where the wound starts
const REVEAL_END = 0.73;       // ...and where it's complete (the rest is the hold)
const MAX_REAL_TIME_MS = 80000;
const CUT_BLACK_MS = 1300;

export const MOCHI_LINES = {
  stitches: { before: "hiii!! it's me, mochi ♡ you've been sooo honest so far!", after: "she won't be telling anyone." },
  eyes: { before: "mochi missed you!! did you miss mochi? ♡", after: "she saw too much." },
  ears: { before: "shhh... mochi's listening ♡", after: "she heard everything." },
  unzip: { before: "mochi saved something for you. it's inside ♡", after: "now you know what's inside." }
};

/** Mochi chirps one of these beside each Act I question. */
export const MOCHI_HOST_LINES = [
  "yay, you're here!! let's be friends ♡",
  "no wrong answers!! just be honest, ok? ♡",
  "ooh, interesting~",
  "mochi is taking sooo many notes ♡",
  "you have a really nice face, did you know?",
  "almost done!! mochi has a surprise for you ♡"
];

/**
 * @param {{scene: string, act: number, engine: import('../mochi/MochiEngine').MochiEngine,
 *          mochiAudio: import('../mochi/MochiAudio').MochiAudio, getFace: () => object,
 *          ui: object, director: object, voice?: object}} ctx
 */
export async function runMochiEvent({ scene, act, engine, mochiAudio, getFace, ui, director, voice }) {
  const ok = await engine.load();
  if (!ok) return { skipped: true };
  const lines = MOCHI_LINES[scene] || { before: "", after: "" };

  ui.showMochiEvent();
  ui.setMochiEventProgress(0);
  engine.render(scene, 0, 0, performance.now());
  mochiAudio?.begin(act, { musicVolume: 0.5 });
  ui.setMochiBubble(lines.before);

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
  let last = start, P = 0, awayMs = 0, lookAways = 0, wasWatching = true, lastNag = 0;
  while (P < 1 && performance.now() - start < MAX_REAL_TIME_MS) {
    const now = await nextFrame();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const watching = WATCHING(getFace()) && !document.hidden;

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

  // ---- 4. sudden cut-away
  mochiAudio?.cutAway();
  ui.setMochiWatchText("");
  ui.hideMochiEvent({ instant: true });
  ui.blackout(CUT_BLACK_MS);
  await sleep(CUT_BLACK_MS);

  director?.bumpCreep(0.05);
  if (lines.after) director?.say(lines.after);
  if (director) director.stats.mochiLookAways = (director.stats.mochiLookAways || 0) + lookAways;
  return { lookAways, completed: P >= 1 };
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
