// Act I's "normal" moments with Mochi, between the quiz rounds. Their only
// job is to make the player like her and lower their guard:
//   greet     she asks your name (and uses it for the rest of the game)
//   round     a bubbly little "round two ♡" card
//   pet       head pats with the mouse; she squishes and hearts pop out
//   feed      pick her a snack; she eats it
//   polaroid  a photo of the two of you, through the cute filter
//
// Each of these quietly records something (name, whether you petted her,
// the snack, the photo + your face's landmarks) that comes back later.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { LINES, fillName, aiMochiLine } from "../mochi/MochiLines.js";
import { settings } from "../settings.js";

const el = () => document.getElementById("mochi-play");

function build() {
  const root = el();
  root.innerHTML = `
    <div class="mp-bubble mochi-bubble big"></div>
    <div class="mp-mochi-wrap"><img class="mp-mochi" src="${MOCHI_CUTE_URL}" alt="Mochi" draggable="false" /></div>
    <div class="mp-fx"></div>
    <div class="mp-controls"></div>`;
  return {
    root,
    bubble: root.querySelector(".mp-bubble"),
    wrap: root.querySelector(".mp-mochi-wrap"),
    mochi: root.querySelector(".mp-mochi"),
    fx: root.querySelector(".mp-fx"),
    controls: root.querySelector(".mp-controls")
  };
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

// ---------------------------------------------------------------- greet

export async function runGreet(ctx) {
  const v = build();
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

export async function runRoundCard(ctx, title, sub) {
  const v = build();
  v.root.classList.add("round");
  v.controls.innerHTML = `<div class="mp-round"><div class="mp-round-title">${title}</div><div class="mp-round-sub">${sub}</div></div>`;
  say(v, "");
  show(v);
  bounce(v, "wiggle");
  ctx.sfx?.pop();
  await sleep(2400);
  await hide(v);
}

// ---------------------------------------------------------------- head pats

export async function runPet(ctx) {
  const v = build();
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
  const v = build();
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
  const v = build();
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
