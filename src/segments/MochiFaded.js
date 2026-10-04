// Act V: "where were we?" Mochi is back as if nothing happened. The colour
// has gone out of everything (look 3, dusty rose) and she still has the
// stitches, but she's chirpy, and she wants to play.
//   memory   match the pairs. one pair is you (photos taken the moment you
//            flip them). one pair never matches: mochi, and mochi with
//            stitches. until it does.
//   results  your "proper" personality results, from the test she just gave
//            you (and from everything else you've told her)
//   simon    mochi says. she reads your face. "close your eyes" ... and
//            when you open them she's closer. at the end she asks you to
//            say something, and she can't hear you -> ears
//
// Saved: player.selfies (the two face cards, for later), player.simon.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { build, show, hide, say, bounce, heart, sleep, pick, DESSERTS } from "./MochiPlay.js";
import { headItem } from "../mochi/outfit.js";

const STITCHED_URL = "/mochi/wounds-stitches.webp";

function setup(ctx, mode) {
  const v = build(ctx);
  v.root.classList.add("faded", mode);
  return v;
}

async function talk(v, ctx, keys, gap = 2300) {
  for (const k of keys) {
    const text = fillName(LINES[k] ?? k, ctx.player);
    say(v, text);
    if (text !== "...") ctx.sfx?.tick();
    await sleep(text === "..." ? 1500 : gap + Math.min(1600, text.length * 22));
  }
}

function flickerStitches(img, ms = 50) {
  if (!img?.isConnected) return;
  const src = img.src;
  img.src = STITCHED_URL;
  setTimeout(() => { if (img.isConnected) img.src = src; }, ms);
}

/** A mirrored still of the player, right now. */
function snapshot(ctx) {
  const video = ctx.getVideo?.();
  if (!video?.videoWidth) return null;
  const c = document.createElement("canvas");
  const s = Math.min(video.videoWidth, video.videoHeight);
  c.width = c.height = 320;
  const g = c.getContext("2d");
  g.translate(320, 0);
  g.scale(-1, 1);
  g.filter = "saturate(0.6) contrast(1.05)";
  g.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 320, 320);
  try { return c.toDataURL("image/jpeg", 0.8); } catch { return null; }
}

// ================================================================ memory match

const SNACK_GLYPH = { strawberry: "🍓", carrot: "🥕", mochi: "🍡" };

export async function runMemory(ctx) {
  const v = setup(ctx, "memory");
  const player = ctx.player;
  const faces = [
    SNACK_GLYPH[player.snack] || "🍓",
    DESSERTS[player.dessert]?.glyph || "🍰",
    headItem(player.outfit?.head)?.glyph || "🎀",
    "🎂"
  ];
  // de-duplicate (e.g. strawberry snack + strawberry clip)
  const extra = ["🧸", "🌸", "⭐", "🍒"];
  for (let i = 0; i < faces.length; i++) if (faces.indexOf(faces[i]) !== i) faces[i] = extra.find((e) => !faces.includes(e));
  const cards = [
    ...faces.flatMap((f) => [{ pair: f, glyph: f }, { pair: f, glyph: f }]),
    { pair: "you", you: true }, { pair: "you", you: true },
    { pair: "mochi", mochi: "cute" }, { pair: "mochi", mochi: "stitched" }
  ];
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  v.controls.insertAdjacentHTML("beforebegin", `<div class="fd-grid">${cards.map((c, i) => `
    <button class="fd-card" data-i="${i}" type="button"><span class="fd-inner">
      <span class="fd-back"><span>♡</span></span><span class="fd-front"></span></span></button>`).join("")}</div>`);
  const grid = v.root.querySelector(".fd-grid");
  const els = [...grid.querySelectorAll(".fd-card")];
  show(v);
  bounce(v);
  await talk(v, ctx, ["memAsk", "memRules"], 1800);

  const matched = new Set();
  let open = [], busy = false, mochiTries = 0, done = false;
  // now and then, for a frame, she has her stitches
  const flick = setInterval(() => { if (Math.random() < 0.5) flickerStitches(v.mochi, 70); }, 4200);
  player.selfies = [];
  const front = (i) => els[i].querySelector(".fd-front");
  const reveal = (i) => {
    const c = cards[i];
    if (c.you) {
      const shot = snapshot(ctx);
      if (shot) player.selfies.push(shot);
      front(i).innerHTML = shot ? `<img src="${shot}" alt="" />` : `<span class="fd-glyph">🙂</span>`;
    } else if (c.mochi) front(i).innerHTML = `<img class="fd-mochi" src="${c.mochi === "cute" ? MOCHI_CUTE_URL : STITCHED_URL}" alt="" />`;
    else front(i).innerHTML = `<span class="fd-glyph">${c.glyph}</span>`;
    els[i].classList.add("up");
    ctx.sfx?.tick();
  };
  const conceal = (i) => els[i].classList.remove("up");

  await new Promise((resolve) => {
    const finish = () => { if (!done) { done = true; resolve(); } };
    grid.addEventListener("click", async (e) => {
      const el = e.target.closest(".fd-card");
      if (!el || busy) return;
      const i = +el.dataset.i;
      if (matched.has(i) || open.includes(i)) return;
      reveal(i);
      open.push(i);
      if (open.length < 2) return;
      busy = true;
      const [a, b] = open;
      open = [];
      await sleep(650);
      const A = cards[a], B = cards[b];
      if (A.pair === "mochi" && B.pair === "mochi") {
        const othersLeft = cards.some((c, k) => c.pair !== "mochi" && !matched.has(k));
        if (!othersLeft) mochiTries++; // only the tries once they're the last two count
        if (othersLeft || mochiTries < 3) {
          say(v, fillName(othersLeft ? LINES.memMochiEarly : LINES.memMochiNo[Math.min(mochiTries, 2) - 1], player));
          await sleep(1300);
          conceal(a); conceal(b);
        } else {
          // the cute one isn't cute anymore. now they match.
          const cute = A.mochi === "cute" ? a : b;
          front(cute).querySelector("img").src = STITCHED_URL;
          ctx.sfx?.tick();
          await sleep(900);
          matched.add(a); matched.add(b);
          els[a].classList.add("matched"); els[b].classList.add("matched");
          say(v, fillName(LINES.memMochiMatch, player));
          await sleep(2600);
          finish();
        }
      } else if (A.pair === B.pair) {
        matched.add(a); matched.add(b);
        els[a].classList.add("matched"); els[b].classList.add("matched");
        ctx.sfx?.chirp();
        const r = els[b].getBoundingClientRect();
        heart(v, r.left + r.width / 2, r.top + r.height / 3);
        say(v, fillName(A.you ? LINES.memYou : pick(LINES.memMatch), player));
      } else {
        await sleep(450);
        conceal(a); conceal(b);
      }
      busy = false;
    });
    setTimeout(finish, 240000); // nobody gets stuck
  });
  clearInterval(flick);
  await sleep(600);
  await hide(v);
}

// ================================================================ the "proper" results

/** Find what they answered to a question id. */
const answered = (dossier, id) => dossier.find((d) => d.questionId === id);
const optIndex = (questions, dossier, id) => {
  const d = answered(dossier, id), q = questions.find((x) => x.id === id);
  return d && q ? q.options.findIndex((o) => o.text === d.chosenText) : -1;
};

export async function runResults(ctx, dossier, questions) {
  const v = setup(ctx, "results");
  const player = ctx.player;
  const idx = (id) => optIndex(questions, dossier, id);
  const pct = (i, table, fallback) => (i >= 0 ? table[i] : fallback);
  const lies = dossier.filter((d) => d.mismatch).length;
  const rows = [
    ["lonely", Math.max(pct(idx("p1"), [41, 58, 77, 92], 70), idx("b3") === 0 ? 88 : 0)],
    ["trusting", pct(idx("p2"), [86, 64, 33, 12], 50)],
    ["scared", Math.max(pct(idx("p3"), [91, 72, 44, 23], 60), idx("q1") === 0 ? 74 : 0)],
    ["honest", Math.max(4, 100 - lies * 17)],
    ["alone right now", pct(idx("b4"), [100, 0, 50], 100)],
    ["mochi's best friend", 100]
  ];
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="fd-result">
      <div class="fd-result-top">${LINES.resTitle}</div>
      <div class="fd-result-name">${fillName("{name}", player)}</div>
      ${rows.map(([label, n], k) => `
        <div class="fd-row" style="--n:${n};--d:${0.25 + k * 0.35}s"><span>${label}</span><span class="fd-bar"><i></i></span><b>${label === "alone right now" && n === 0 ? "0%?" : n + "%"}</b></div>`).join("")}
      <p class="fd-result-note">${fillName(LINES.resNote, player)}</p>
    </div>`);
  const card = v.root.querySelector(".fd-result");
  show(v);
  say(v, LINES.resDrum);
  for (let i = 0; i < 3; i++) { ctx.sfx?.tick(); bounce(v, "squish"); await sleep(420); }
  card.classList.add("show");
  await sleep(rows.length * 350 + 900);
  say(v, fillName(LINES.resSay, player));
  await sleep(3200);
  if (rows[4][1] === 0) {
    say(v, LINES.resNotAlone);
    await sleep(3000);
  }
  await hide(v);
}

// ================================================================ mochi says

const until = (pred, ms) => new Promise((resolve) => {
  const t0 = performance.now();
  const tick = () => {
    if (pred()) return resolve(true);
    if (performance.now() - t0 > ms) return resolve(false);
    requestAnimationFrame(tick);
  };
  tick();
});

/** True once `pred` has held for `holdMs` in a row, or false after `ms`. */
const held = (pred, holdMs, ms, onProgress) => new Promise((resolve) => {
  const t0 = performance.now();
  let since = null;
  const tick = () => {
    const now = performance.now();
    if (pred()) since ??= now; else since = null;
    onProgress?.(since ? Math.min(1, (now - since) / holdMs) : 0);
    if (since && now - since >= holdMs) return resolve(true);
    if (now - t0 > ms) return resolve(false);
    requestAnimationFrame(tick);
  };
  tick();
});

export async function runSimon(ctx) {
  const v = setup(ctx, "simon");
  const player = ctx.player;
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="fd-simon">
      <div class="fd-says"></div>
      <div class="fd-cmd"></div>
      <div class="fd-cam"><canvas width="320" height="320"></canvas><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" /></svg></div>
    </div>`);
  const saysEl = v.root.querySelector(".fd-says"), cmdEl = v.root.querySelector(".fd-cmd");
  const cam = v.root.querySelector(".fd-cam canvas"), ring = v.root.querySelector(".fd-cam circle");
  const mochiImg = v.mochi;
  const g = cam.getContext("2d");
  let live = true;
  // whenever your eyes are closed, she has her stitches. peek, and you'll see.
  const cuteSrc = mochiImg.src;
  const draw = () => {
    if (!live) return;
    const f = ctx.getFace?.();
    const want = f?.faceVisible && f.eyesOpen === false ? STITCHED_URL : cuteSrc;
    if (!mochiImg.src.endsWith(want.replace(/^.*\/mochi\//, "/mochi/"))) mochiImg.src = want;
    const src = ctx.feed?.canvas;
    if (src?.width) {
      const s = Math.min(src.width, src.height);
      g.save(); g.translate(320, 0); g.scale(-1, 1);
      g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, 320, 320);
      g.restore();
    }
    requestAnimationFrame(draw);
  };
  draw();
  const progress = (p) => ring.style.setProperty("--p", p);
  const face = () => ctx.getFace?.() || null;
  const seen = () => !!face()?.faceVisible;
  const command = (simonSays, text) => {
    saysEl.textContent = simonSays ? LINES.simonSays : "";
    cmdEl.textContent = text;
    cmdEl.classList.remove("pop"); void cmdEl.offsetWidth; cmdEl.classList.add("pop");
    progress(0);
    ctx.sfx?.pop();
  };
  const result = { smiled: false, trickedEyes: false, peeked: false, blinked: false };

  show(v);
  bounce(v);
  await talk(v, ctx, ["simonAsk", "simonRules"], 1900);

  // 1. smile
  command(true, LINES.simonSmile);
  say(v, "");
  result.smiled = await held(() => (face()?.channels?.smile ?? 0) > 0.32, 600, 9000, progress);
  say(v, fillName(result.smiled ? LINES.simonGood : seen() ? LINES.simonSmileNo : LINES.simonCantSee, player));
  await sleep(2400);

  // 2. turn your head
  command(true, LINES.simonTurn);
  say(v, "");
  const turned = await held(() => Math.abs(face()?.yawProxy ?? 0) > 0.14 || !!face()?.lookingAway, 450, 9000, progress);
  say(v, fillName(turned ? LINES.simonGood2 : LINES.simonCantSee, player));
  await sleep(2200);

  // 3. "close your eyes" (she didn't say "mochi says")
  command(false, LINES.simonClose);
  say(v, "");
  result.trickedEyes = await held(() => seen() && face()?.eyesOpen === false, 500, 4500, progress);
  say(v, fillName(result.trickedEyes ? LINES.simonGotcha : LINES.simonNotFooled, player));
  await sleep(2800);

  // 4. "mochi says close your eyes. keep them closed." and while they're closed, she comes closer
  command(true, LINES.simonCloseReal);
  say(v, "");
  const closed = await held(() => seen() && face()?.eyesOpen === false, 400, 9000, progress);
  if (closed) {
    for (const n of LINES.simonCount) {
      say(v, n);
      ctx.sfx?.tick();
      // the moment they're not looking, she moves
      if (n === LINES.simonCount[1]) { mochiImg.closest(".mp-mochi-wrap")?.classList.add("fd-closer"); flickerStitches(mochiImg, 300); }
      const opened = await until(() => face()?.eyesOpen === true, 1100);
      if (opened) { result.peeked = true; break; }
    }
  } else mochiImg.closest(".mp-mochi-wrap")?.classList.add("fd-closer");
  ctx.audio?.breatheBehind?.(0.06);
  say(v, fillName(result.peeked ? LINES.simonPeeked : LINES.simonOpen, player));
  await sleep(3000);

  // 5. don't blink
  command(true, LINES.simonBlink);
  say(v, "");
  let blinked = false;
  const t0 = performance.now();
  await until(() => {
    const f = face();
    if (f?.faceVisible && f.blinking) blinked = true;
    progress(Math.min(1, (performance.now() - t0) / 6000));
    return blinked || performance.now() - t0 > 6000;
  }, 7000);
  result.blinked = blinked;
  say(v, fillName(blinked ? LINES.simonBlinked : LINES.simonNoBlink, player));
  await sleep(2600);

  // 6. say something. she can't hear you.
  command(true, fillName(LINES.simonSpeak, player));
  say(v, "");
  const base = ctx.getMic?.()?.rms ?? 0.01;
  const spoke = await held(() => (ctx.getMic?.()?.rms ?? 0) > base + 0.04, 300, 7000, progress);
  say(v, fillName(spoke ? LINES.simonLouder : LINES.simonQuiet, player));
  await sleep(2600);
  command(true, LINES.simonLouderCmd);
  await sleep(3800);
  live = false;
  mochiImg.src = cuteSrc;
  player.simon = result;
  saysEl.textContent = "";
  cmdEl.textContent = "";
  await hide(v);
}
