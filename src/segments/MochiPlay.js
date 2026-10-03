// Act I's "normal" moments with Mochi, between the quiz rounds. Their only
// job is to make the player like her and lower their guard:
//   greet     she asks your name (and uses it for the rest of the game)
//   round     a bubbly little "round two ♡" card
//   pet       head pats with the mouse; she squishes and hearts pop out
//   feed      pick her a snack; she eats it
//   polaroid  a photo of the two of you, through the cute filter
// and Act II's bonus round (still completely innocent):
//   dressup   pick her a head piece and a neck piece; she wears them forever
//   catch     move a basket, catch the strawberries she drops
//   dessert   the result card of "which dessert are you?" (d1..d5)
//
// Each of these quietly records something (name, whether you petted her,
// the snack, the photo + your face's landmarks) that comes back later.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { LINES, fillName, aiMochiLine } from "../mochi/MochiLines.js";
import { settings } from "../settings.js";
import { HEAD_ITEMS, NECK_ITEMS, outfitParts, accessoryHtml, describeOutfit } from "../mochi/outfit.js";
import { QUESTIONS } from "../quiz/questions.js";

const el = () => document.getElementById("mochi-play");

function build(ctx) {
  const root = el();
  root.className = "mochi-play"; // drop the last moment's mode classes (photo, round, talk...)
  root.innerHTML = `
    <div class="mp-bubble mochi-bubble big"></div>
    <div class="mp-mochi-wrap"><div class="mp-mochi-body">
      <img class="mp-mochi" src="${MOCHI_CUTE_URL}" alt="Mochi" draggable="false" />
      ${outfitParts(ctx?.player?.outfit).map((a) => accessoryHtml(a)).join("")}
    </div></div>
    <div class="mp-fx"></div>
    <div class="mp-controls"></div>`;
  return {
    root,
    bubble: root.querySelector(".mp-bubble"),
    wrap: root.querySelector(".mp-mochi-wrap"),
    body: root.querySelector(".mp-mochi-body"),
    mochi: root.querySelector(".mp-mochi"),
    fx: root.querySelector(".mp-fx"),
    controls: root.querySelector(".mp-controls")
  };
}

/** Put the outfit on the Mochi currently on screen. */
function dress(v, outfit) {
  v.body.querySelectorAll(".mochi-acc").forEach((n) => n.remove());
  for (const a of outfitParts(outfit)) v.body.insertAdjacentHTML("beforeend", accessoryHtml(a, "fresh"));
}

function show(v) {
  v.root.classList.add("show");
}

async function hide(v) {
  v.root.classList.remove("show");
  await sleep(450);
  v.root.innerHTML = "";
}

function say(v, text) {
  v.bubble.textContent = text || "";
  v.bubble.classList.toggle("show", !!text);
}

/** Show the local line now; swap in the AI's if it arrives within `windowMs`. */
async function sayPersonal(v, ctx, moment, local, payload = {}, windowMs = 1300) {
  say(v, local);
  const ai = await aiMochiLine(ctx.aiClient, ctx.aiEnabled, moment, {
    // these moments only happen while the world is still look 1: sweet, nothing creepy
    act: 1, name: ctx.player.name, snack: ctx.player.snack, localFallbackText: local, ...payload
  }, windowMs);
  if (ai && v.bubble.textContent === local) say(v, ai);
}

function bounce(v, cls = "hop") {
  v.wrap.classList.remove("hop", "squish", "nom", "wiggle");
  void v.wrap.offsetWidth;
  v.wrap.classList.add(cls);
}

function heart(v, x, y, glyph = "♡") {
  const h = document.createElement("span");
  h.className = "mp-heart";
  h.textContent = glyph;
  h.style.left = x + "px";
  h.style.top = y + "px";
  h.style.setProperty("--dx", `${(Math.random() - 0.5) * 80}px`);
  v.fx.appendChild(h);
  setTimeout(() => h.remove(), 1200);
}

// ---------------------------------------------------------------- talk

/**
 * Mochi, full screen, saying a few lines in a row. Used for the act
 * transitions so the game flows through her instead of title cards.
 * mood: "cute" | "off" (drained, a hurt frame flickers through) | "dark" (dim, she's hard to see)
 */
export async function runTalk(ctx, lines, { mood = "cute", flicker = null, perLineMs = 2300 } = {}) {
  const v = build(ctx);
  v.root.classList.add("talk", `mood-${mood}`);
  show(v);
  if (mood === "cute") bounce(v);
  let flickerTimer = null;
  if (flicker) {
    // a single frame of something else, now and then: too fast to be sure you saw it
    const tick = () => {
      const img = v.mochi;
      if (!img.isConnected) return;
      const src = img.src;
      img.src = flicker;
      setTimeout(() => { if (img.isConnected) img.src = src; }, 45);
      flickerTimer = setTimeout(tick, 1800 + Math.random() * 2600);
    };
    flickerTimer = setTimeout(tick, 900 + Math.random() * 900);
  }
  for (const raw of lines) {
    const text = fillName(raw, ctx.player);
    say(v, text);
    if (text !== "...") (mood === "cute" ? ctx.sfx?.pop : ctx.sfx?.tick)?.call(ctx.sfx);
    await sleep(text === "..." ? 1500 : perLineMs + Math.min(1800, text.length * 25));
  }
  clearTimeout(flickerTimer);
  await hide(v);
}

// ---------------------------------------------------------------- greet

export async function runGreet(ctx) {
  const v = build(ctx);
  show(v);
  bounce(v);
  ctx.sfx?.chirp();
  say(v, fillName(pick(LINES.greetHello), ctx.player));
  await sleep(2200);
  say(v, LINES.greetAsk);
  v.controls.innerHTML = `
    <form class="mp-name">
      <input type="text" maxlength="20" autocomplete="off" placeholder="your name" aria-label="your name" />
      <button type="submit" class="btn-primary">that's me ♡</button>
    </form>`;
  const form = v.controls.querySelector("form"), input = form.querySelector("input");
  setTimeout(() => input.focus(), 50);
  input.addEventListener("input", () => ctx.sfx?.tick());
  const name = await new Promise((resolve) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      resolve(cleanName(input.value));
    });
  });
  ctx.player.name = name || "friend";
  v.controls.innerHTML = "";
  bounce(v);
  ctx.sfx?.sparkle();
  const r = v.wrap.getBoundingClientRect();
  for (let i = 0; i < 6; i++) setTimeout(() => heart(v, r.left + r.width * (0.3 + Math.random() * 0.4), r.top + r.height * 0.3), i * 90);
  await sayPersonal(v, ctx, "greet", fillName(pick(LINES.greetName), ctx.player));
  await sleep(2600);
  say(v, LINES.greetRules);
  await sleep(2600);
  await hide(v);
}

function cleanName(s) {
  return String(s || "").replace(/[<>{}\n\r\t]/g, "").trim().slice(0, 20).toLowerCase();
}

// ---------------------------------------------------------------- round card

export async function runRoundCard(ctx, title, sub, { glitch = false, ms = 2400 } = {}) {
  const v = build(ctx);
  v.root.classList.add("round");
  if (glitch) v.root.classList.add("glitch");
  v.controls.innerHTML = `<div class="mp-round"><div class="mp-round-title">${title}</div><div class="mp-round-sub">${sub}</div></div>`;
  say(v, "");
  show(v);
  if (glitch) {
    ctx.sfx?.tick();
    v.mochi.src = "/mochi/stitches.webp"; // for one frame
    setTimeout(() => { if (v.mochi.isConnected) v.mochi.src = MOCHI_CUTE_URL; }, 60);
  } else {
    bounce(v, "wiggle");
    ctx.sfx?.pop();
  }
  await sleep(ms);
  await hide(v);
}

/**
 * The fake ending after Act I: "thanks for playing ♡", the song resolves,
 * a play-again button that doesn't matter. The player relaxes. Then Mochi
 * bursts back in (Act II starts with "wait wait wait!!").
 */
export async function runFakeEnd(ctx) {
  const v = build(ctx);
  v.root.classList.add("round", "fake-end");
  v.controls.innerHTML = `
    <div class="mp-round">
      <div class="mp-round-title">thanks for playing ♡</div>
      <div class="mp-round-sub">mochi had so much fun with you, ${ctx.player.name || "friend"}!</div>
      <p class="mp-hint">made with love by mochi</p>
      <button class="btn-primary mp-again">play again ♡</button>
    </div>`;
  show(v);
  bounce(v, "wiggle");
  ctx.sfx?.chirp();
  const again = v.controls.querySelector(".mp-again");
  await new Promise((resolve) => {
    again.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 7000);
  });
  ctx.sfx?.pop();
  await hide(v);
}

// ---------------------------------------------------------------- head pats

export async function runPet(ctx) {
  const v = build(ctx);
  show(v);
  bounce(v);
  say(v, LINES.petAsk);
  v.controls.innerHTML = `<div class="mp-meter" aria-hidden="true"></div><p class="mp-hint">${LINES.petHint}</p>`;
  const meter = v.controls.querySelector(".mp-meter");
  const NEED = 12;
  for (let i = 0; i < NEED; i++) meter.insertAdjacentHTML("beforeend", "<span>♡</span>");

  let pats = 0, travel = 0, last = null;
  const done = new Promise((resolve) => {
    const onMove = (e) => {
      const r = v.mochi.getBoundingClientRect();
      const inHead = e.clientX > r.left + r.width * 0.15 && e.clientX < r.right - r.width * 0.15 &&
        e.clientY > r.top + r.height * 0.08 && e.clientY < r.top + r.height * 0.62;
      if (!inHead) { last = null; return; }
      if (last) travel += Math.hypot(e.clientX - last.x, e.clientY - last.y);
      last = { x: e.clientX, y: e.clientY };
      if (travel > 55) {
        travel = 0;
        pats++;
        meter.children[pats - 1]?.classList.add("on");
        bounce(v, "squish");
        ctx.sfx?.boop(1 + pats * 0.04);
        heart(v, e.clientX, e.clientY - 10);
        if (pats >= NEED) { cleanup(); resolve(true); }
      }
    };
    const cleanup = () => v.root.removeEventListener("pointermove", onMove);
    v.root.addEventListener("pointermove", onMove);
    setTimeout(() => { cleanup(); resolve(false); }, 25000);
  });
  const petted = await done;
  ctx.player.petted = petted;
  v.controls.innerHTML = "";
  if (petted) {
    bounce(v);
    ctx.sfx?.chirp();
    await sayPersonal(v, ctx, "pet", fillName(pick(LINES.petDone), ctx.player));
  } else {
    ctx.sfx?.sad();
    v.wrap.classList.add("sad");
    await sayPersonal(v, ctx, "pet", LINES.petIgnored, { stats: { ignoredHeadPats: true } });
  }
  await sleep(2600);
  await hide(v);
}

// ---------------------------------------------------------------- snack

const SNACKS = [
  { id: "strawberry", glyph: "🍓", label: "strawberry" },
  { id: "carrot", glyph: "🥕", label: "carrot" },
  { id: "mochi", glyph: "🍡", label: "mochi" }
];

export async function runFeed(ctx) {
  const v = build(ctx);
  show(v);
  bounce(v);
  say(v, LINES.feedAsk);
  v.controls.innerHTML = `<div class="mp-snacks">${SNACKS.map((s) =>
    `<button class="mp-snack" data-id="${s.id}" aria-label="${s.label}"><span>${s.glyph}</span><small>${s.label}</small></button>`).join("")}</div>`;
  const choice = await new Promise((resolve) => {
    v.controls.querySelectorAll(".mp-snack").forEach((b) => b.addEventListener("click", () => resolve(b), { once: true }));
    setTimeout(() => resolve(v.controls.querySelector(".mp-snack")), 30000);
  });
  const snack = SNACKS.find((s) => s.id === choice.dataset.id);
  ctx.player.snack = snack.id;
  ctx.sfx?.pop();

  // the snack flies into her mouth
  const from = choice.getBoundingClientRect(), to = v.mochi.getBoundingClientRect();
  const fly = document.createElement("span");
  fly.className = "mp-fly";
  fly.textContent = snack.glyph;
  fly.style.left = from.left + from.width / 2 + "px";
  fly.style.top = from.top + from.height / 2 + "px";
  v.fx.appendChild(fly);
  v.controls.innerHTML = "";
  requestAnimationFrame(() => {
    fly.style.transform = `translate(${to.left + to.width * 0.5 - (from.left + from.width / 2)}px, ${to.top + to.height * 0.5 - (from.top + from.height / 2)}px) scale(0.6)`;
    fly.style.opacity = "0.2";
  });
  await sleep(650);
  fly.remove();
  for (let i = 0; i < 3; i++) {
    bounce(v, "nom");
    ctx.sfx?.nom();
    await sleep(260);
  }
  bounce(v);
  ctx.sfx?.chirp();
  await sayPersonal(v, ctx, "feed", fillName(LINES.feedAfter[snack.id], ctx.player), { snack: snack.id });
  await sleep(2600);
  await hide(v);
}

// ---------------------------------------------------------------- polaroid

export async function runPolaroid(ctx) {
  const v = build(ctx);
  v.root.classList.add("photo");
  show(v);
  say(v, LINES.polaroidAsk);
  v.controls.innerHTML = `
    <div class="mp-polaroid">
      <div class="mp-photo"><canvas width="640" height="480"></canvas><img class="mp-sticker" src="${MOCHI_CUTE_URL}" alt="" /><div class="mp-count"></div></div>
      <div class="mp-caption"></div>
    </div>`;
  const canvas = v.controls.querySelector("canvas"), g = canvas.getContext("2d");
  const count = v.controls.querySelector(".mp-count"), caption = v.controls.querySelector(".mp-caption");
  const feedCanvas = ctx.feed?.canvas;
  let live = true;
  const draw = () => {
    if (!live) return;
    if (feedCanvas) {
      g.save();
      g.translate(canvas.width, 0);
      g.scale(-1, 1); // a mirror, like the feed
      g.drawImage(feedCanvas, 0, 0, canvas.width, canvas.height);
      g.restore();
    }
    requestAnimationFrame(draw);
  };
  draw();
  await sleep(2400);
  for (const n of ["3", "2", "1"]) {
    count.textContent = n;
    count.classList.remove("pop");
    void count.offsetWidth;
    count.classList.add("pop");
    ctx.sfx?.tick();
    await sleep(800);
  }
  count.textContent = "cheese!! ♡";
  await sleep(350);

  // snap: freeze the frame, keep a raw copy + landmarks for later
  ctx.sfx?.shutter();
  live = false;
  const flash = document.createElement("div");
  flash.className = "mp-flash" + (settings.reduceFlashing ? " calm" : "");
  v.root.appendChild(flash);
  setTimeout(() => flash.remove(), 700);
  count.textContent = "";
  const video = ctx.getVideo?.(), face = ctx.getFace?.();
  if (video?.videoWidth) {
    const raw = document.createElement("canvas");
    raw.width = video.videoWidth;
    raw.height = video.videoHeight;
    raw.getContext("2d").drawImage(video, 0, 0);
    ctx.player.polaroid = { raw, keypoints: face?.keypoints ? structuredClone(face.keypoints) : null, cute: copyCanvas(canvas) };
  }
  caption.textContent = `${ctx.player.name} & mochi ♡ best friends`;
  bounce(v);
  ctx.sfx?.sparkle();
  await sayPersonal(v, ctx, "polaroid", fillName(pick(LINES.polaroidAfter), ctx.player));
  await sleep(3200);
  await hide(v);
}

// ================================================================ Act II: bonus round

// ---------------------------------------------------------------- dress-up

export async function runDressUp(ctx) {
  const v = build(ctx);
  v.root.classList.add("dressup");
  show(v);
  bounce(v);
  ctx.sfx?.chirp();
  say(v, LINES.dressAsk);
  const row = (label, items, slot) => `
    <div class="mp-dress-row" data-slot="${slot}">
      <span class="mp-dress-label">${label}</span>
      ${items.map((i) => `<button class="mp-snack mp-dress" data-id="${i.id}" aria-label="${i.label}">
        <span>${i.glyph || "✕"}</span><small>${i.label}</small></button>`).join("")}
    </div>`;
  v.controls.innerHTML = `
    ${row("on her head", HEAD_ITEMS, "head")}
    ${row("around her neck", NECK_ITEMS, "neck")}
    <button class="btn-primary mp-dress-done" disabled>she looks perfect ♡</button>`;
  const outfit = { head: null, neck: null };
  const done = v.controls.querySelector(".mp-dress-done");

  await new Promise((resolve) => {
    v.controls.querySelectorAll(".mp-dress").forEach((b) => b.addEventListener("click", () => {
      const slot = b.closest(".mp-dress-row").dataset.slot;
      outfit[slot] = b.dataset.id;
      b.parentElement.querySelectorAll(".mp-dress").forEach((x) => x.classList.toggle("picked", x === b));
      dress(v, outfit);
      bounce(v, "squish");
      ctx.sfx?.boop(slot === "head" ? 1.15 : 1);
      const r = v.mochi.getBoundingClientRect();
      for (let i = 0; i < 3; i++) heart(v, r.left + r.width * (0.35 + Math.random() * 0.3), r.top + r.height * 0.25);
      say(v, LINES.dressReact[b.dataset.id] || pick(LINES.answerGeneric));
      done.disabled = !outfit.head; // she needs at least something on her head
    }));
    done.addEventListener("click", resolve, { once: true });
    // nobody gets stuck: after a while she picks for herself
    setTimeout(() => {
      outfit.head ||= "bow";
      resolve();
    }, 60000);
  });

  ctx.player.outfit = { head: outfit.head, neck: outfit.neck || "none" };
  dress(v, ctx.player.outfit);
  v.controls.innerHTML = "";
  bounce(v, "wiggle");
  ctx.sfx?.sparkle();
  const r = v.mochi.getBoundingClientRect();
  for (let i = 0; i < 8; i++) setTimeout(() => heart(v, r.left + r.width * (0.2 + Math.random() * 0.6), r.top + r.height * 0.4), i * 80);
  await sayPersonal(v, ctx, "dressup", fillName(pick(LINES.dressDone), ctx.player),
    { answer: `dressed Mochi in ${describeOutfit(ctx.player.outfit)}` });
  await sleep(2800);
  await hide(v);
}

// ---------------------------------------------------------------- strawberry catch

const CATCH_GOAL = 15;
const CATCH_MAX_MS = 45000;

export async function runCatch(ctx) {
  const v = build(ctx);
  v.root.classList.add("catch");
  show(v);
  bounce(v);
  say(v, LINES.catchAsk);
  v.controls.innerHTML = `<p class="mp-hint">${LINES.catchHint}</p>`;
  await sleep(2600);

  const field = document.createElement("div");
  field.className = "mp-field";
  field.innerHTML = `<div class="mp-score">🍓 <b>0</b> / ${CATCH_GOAL}</div><div class="mp-basket">🧺</div>`;
  v.root.appendChild(field);
  const basket = field.querySelector(".mp-basket"), scoreEl = field.querySelector(".mp-score b");
  v.controls.innerHTML = "";
  say(v, LINES.catchGo);

  let bx = innerWidth / 2;
  const onMove = (e) => { bx = e.clientX; };
  const onKey = (e) => {
    if (e.key === "ArrowLeft") bx -= 60;
    if (e.key === "ArrowRight") bx += 60;
  };
  field.addEventListener("pointermove", onMove);
  addEventListener("keydown", onKey);

  const items = [];
  // throwing runs on the game's own clock (sim), not the wall clock, so a slow
  // machine gets slow-motion strawberries instead of a pile-up of them
  let caught = 0, dropped = 0, sim = 0, nextSpawn = 0, last = performance.now();
  const start = last;
  const spawn = () => {
    const star = Math.random() < 0.08; // a rare sparkly one, worth three
    const node = document.createElement("span");
    node.className = "mp-berry" + (star ? " star" : "");
    node.textContent = star ? "🌟" : "🍓";
    field.appendChild(node);
    // from where she's sitting, out across the screen
    const m = v.mochi.getBoundingClientRect();
    items.push({ node, star, x: m.left + m.width / 2, y: m.bottom - m.height * 0.3,
      vx: (Math.random() - 0.5) * innerWidth * 0.55, vy: -160 - Math.random() * 120, spin: (Math.random() - 0.5) * 300, rot: 0 });
    bounce(v, "squish");
    ctx.sfx?.pop();
    // she throws a little faster as you get better
    nextSpawn = sim + (Math.max(420, 900 - caught * 25) * (0.75 + Math.random() * 0.5)) / 1000;
  };

  await new Promise((resolve) => {
    const tick = (now) => {
      if (!field.isConnected) return resolve();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim += dt;
      bx = Math.max(40, Math.min(innerWidth - 40, bx));
      basket.style.transform = `translate(${bx}px, 0) translateX(-50%)`;
      if (sim >= nextSpawn) spawn();
      const by = innerHeight - innerHeight * 0.1;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.vy += 520 * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.spin * dt;
        if (it.x < 20 || it.x > innerWidth - 20) it.vx *= -0.8; // bounce off the sides
        it.node.style.transform = `translate(${it.x}px, ${it.y}px) translate(-50%, -50%) rotate(${it.rot}deg)`;
        if (it.vy > 0 && Math.abs(it.y - by) < 34 && Math.abs(it.x - bx) < 56) {
          caught += it.star ? 3 : 1;
          scoreEl.textContent = Math.min(caught, CATCH_GOAL);
          ctx.sfx?.boop(1 + Math.min(caught, CATCH_GOAL) * 0.03);
          heart(v, it.x, by - 20, it.star ? "✦" : "♡");
          basket.classList.remove("got");
          void basket.offsetWidth;
          basket.classList.add("got");
          if (caught % 5 === 0 || it.star) say(v, fillName(pick(LINES.catchCheer), ctx.player));
          it.node.remove();
          items.splice(i, 1);
        } else if (it.y > innerHeight + 40) {
          dropped++;
          if (dropped % 4 === 1) say(v, pick(LINES.catchMiss));
          it.node.remove();
          items.splice(i, 1);
        }
      }
      if (caught >= CATCH_GOAL || now - start > CATCH_MAX_MS) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  field.removeEventListener("pointermove", onMove);
  removeEventListener("keydown", onKey);
  ctx.player.caught = Math.min(caught, CATCH_GOAL);
  field.classList.add("done");
  await sleep(500);
  field.remove();
  bounce(v);
  ctx.sfx?.chirp();
  const local = caught >= CATCH_GOAL ? fillName(pick(LINES.catchWin), ctx.player) : fillName(LINES.catchSome, ctx.player).replace("{n}", String(caught));
  await sayPersonal(v, ctx, "catch", local, { answer: `caught ${ctx.player.caught} of ${CATCH_GOAL} strawberries` });
  await sleep(2600);
  await hide(v);
}

// ---------------------------------------------------------------- "which dessert are you?" result

export const DESSERTS = {
  daifuku: { glyph: "🍡", name: "strawberry daifuku", blurb: "soft, sweet, and everyone's favourite. you make every room a little brighter ♡" },
  matcha: { glyph: "🍵", name: "matcha roll cake", blurb: "calm, thoughtful, a tiny bit mysterious. people feel safe around you ♡" },
  cinnamon: { glyph: "🍯", name: "honey cinnamon roll", blurb: "warm and cosy and loyal to the very end. you'd do anything for the people you love ♡" },
  brulee: { glyph: "🍮", name: "crème brûlée", blurb: "a crisp little shell, and soft all the way through. you don't let just anyone in ♡" }
};
const DESSERT_ORDER = ["daifuku", "matcha", "cinnamon", "brulee"];

/** Tally the d1..d5 answers into a dessert. Ties go to whichever they picked last. */
export function dessertFromDossier(dossier) {
  const counts = {}, lastSeen = {};
  (dossier || []).forEach((d, i) => {
    const q = QUESTIONS.find((x) => x.id === d.questionId);
    const opt = q?.options?.find((o) => o.text === d.chosenText);
    if (!opt?.dessert) return;
    counts[opt.dessert] = (counts[opt.dessert] || 0) + 1;
    lastSeen[opt.dessert] = i;
  });
  const ids = Object.keys(counts);
  if (!ids.length) return "daifuku";
  ids.sort((a, b) => counts[b] - counts[a] || lastSeen[b] - lastSeen[a] || DESSERT_ORDER.indexOf(a) - DESSERT_ORDER.indexOf(b));
  return ids[0];
}

export async function runDessertResult(ctx, dossier) {
  const id = dessertFromDossier(dossier);
  const d = DESSERTS[id];
  ctx.player.dessert = id;
  const v = build(ctx);
  v.root.classList.add("dessert");
  show(v);
  say(v, LINES.dessertDrum);
  v.controls.innerHTML = `
    <div class="mp-result">
      <div class="mp-result-top">your results are in!!</div>
      <div class="mp-result-glyph">${d.glyph}</div>
      <div class="mp-result-you">you are a...</div>
      <div class="mp-result-name">${d.name}</div>
      <p class="mp-result-blurb">${d.blurb}</p>
      <div class="mp-result-match">compatibility with mochi: <b>100%</b> ♡</div>
    </div>`;
  const card = v.controls.querySelector(".mp-result");
  for (let i = 0; i < 3; i++) {
    ctx.sfx?.tick();
    bounce(v, "squish");
    await sleep(420);
  }
  card.classList.add("show");
  ctx.sfx?.sparkle();
  bounce(v);
  const r = card.getBoundingClientRect();
  for (let i = 0; i < 10; i++) setTimeout(() => heart(v, r.left + Math.random() * r.width, r.top + r.height * 0.3, i % 3 ? "♡" : d.glyph), i * 70);
  await sleep(1400);
  await sayPersonal(v, ctx, "dessert", fillName(LINES.dessertSay[id], ctx.player), { answer: `the quiz says they're a ${d.name}` });
  await sleep(4200);
  await hide(v);
}

function copyCanvas(c) {
  const out = document.createElement("canvas");
  out.width = c.width;
  out.height = c.height;
  out.getContext("2d").drawImage(c, 0, 0);
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}
