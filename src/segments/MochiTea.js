// Act VIII: the tea party. Black and dark red (look 5). The birthday table
// again, but this time everyone came: the friends the player invited in
// Act IV are sitting in the chairs (or, if they invited nobody, "friends of
// mochi's own"). Nobody can see them properly. It's the candles.
//
//   tea      pour tea for each guest: hold to pour, let go at the line. It's
//            rosehip ("mochi's favourite ♡"), and it's very red. Each guest
//            whispers something when they get theirs. Then one for you; look
//            into it and there you are, and someone is standing behind you.
//            "drink up ♡"
//   parcel   pass the parcel, to her song (what's left of it). When the music
//            stops, whoever has it unwraps a layer. The parcel waits for you
//            to pass it on. The last layer is yours: scissors. "for later ♡"
//            (the sewing kit came before the stitches...)
//
// Guests are the figures from /public/figures, sat down and blacked out; for
// a frame, now and then, you see one as it is.
//
// (Mochi has no cup. She isn't thirsty. Yours is in front of you.)
//
// Saved: player.tea = { poured: [{who, level}], drank, scissors }.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { giggle } from "../mochi/Giggle.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { woundsNow } from "../mochi/wounds.js";
import { FIGURE_URLS } from "../config.js";
import { build, show, hide, say, bounce, heart, sleep, pick } from "./MochiPlay.js";

const P = (n) => `/party/${n}.svg`;
const frame = () => new Promise((r) => requestAnimationFrame(r));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const LINE = 0.8; // the line on the cup

// ---------------------------------------------------------------- art

const CUP = `<svg class="tp-cup-svg" viewBox="0 0 130 150" aria-hidden="true">
  <defs><clipPath id="CLIP"><path d="M22 22 L98 22 L91 116 Q89 125 80 125 L40 125 Q31 125 29 116 Z"/></clipPath></defs>
  <ellipse class="saucer" cx="60" cy="136" rx="58" ry="9"/>
  <g clip-path="url(#CLIP)"><rect class="tea" x="0" y="125" width="130" height="140"/><ellipse class="tea-top" cx="60" cy="125" rx="40" ry="4"/></g>
  <line class="mark" x1="26" y1="42.6" x2="96" y2="42.6"/>
  <path class="glass" d="M18 20 L102 20 L94 118 Q92 128 82 128 L38 128 Q28 128 26 118 Z"/>
  <path class="handle" d="M99 40 Q124 44 119 72 Q114 92 95 92"/>
  <path class="shine" d="M30 30 L26 100"/>
</svg>`;
const TEAPOT = `<svg class="tp-pot-svg" viewBox="0 0 220 170" aria-hidden="true">
  <path class="spout" d="M52 96 Q22 84 8 52 L20 48 Q34 74 60 80 Z"/>
  <path class="handle" d="M168 70 Q214 66 206 108 Q200 136 166 132" />
  <ellipse class="body" cx="112" cy="104" rx="64" ry="54"/>
  <path class="lid" d="M70 62 Q112 34 154 62 Z"/>
  <circle class="knob" cx="112" cy="40" r="9"/>
  <path class="heart" d="M112 124 C96 112 90 104 90 96 C90 89 96 85 101 85 C106 85 110 88 112 92 C114 88 118 85 123 85 C128 85 134 89 134 96 C134 104 128 112 112 124Z"/>
</svg>`;
const SCISSORS = `<svg viewBox="0 0 200 140" aria-hidden="true">
  <path class="blade" d="M96 70 L196 26 L190 18 L84 62 Z"/><path class="blade" d="M96 70 L196 114 L190 122 L84 78 Z"/>
  <circle class="ring" cx="44" cy="36" r="26"/><circle class="ring" cx="44" cy="104" r="26"/>
  <path class="ring" d="M66 46 L96 66 M66 94 L96 74"/><circle class="pin" cx="92" cy="70" r="6"/>
</svg>`;
const PRIZES = ["🍬", "🎀", "🔘", "🌸", "🍭"];
const WRAPS = ["#e7a9c0", "#b6a3e0", "#9fd2c0", "#f2d38b", "#e08aa0", "#9a2230"];

function setup(ctx, mode) {
  const v = build(ctx);
  v.root.classList.add("tea", mode);
  return v;
}

async function talk(v, ctx, lines, gap = 2000) {
  for (const raw of [].concat(lines)) {
    const text = fillName(raw, ctx.player);
    say(v, text);
    if (text && text !== "...") ctx.sfx?.tick();
    await sleep(text === "..." ? 1400 : gap + Math.min(1500, text.length * 22));
  }
}

/** Who's coming: the names they typed in Act IV, or, if nobody, two of hers. */
function guestList(player) {
  const g = (player.guests || []).filter(Boolean).slice(0, 3);
  return { names: g.length ? g : ["?", "?"], hers: !g.length };
}

/**
 * The table, the chairs (filled), the candles, the name cards, a cup at
 * every place and one in front of you. Seats are guests either side, Mochi
 * in the middle, like the birthday.
 */
function table(v, ctx) {
  const player = ctx.player;
  const { names, hers } = guestList(player);
  const half = Math.ceil(names.length / 2);
  const seats = [
    ...names.slice(0, half).map((n, i) => ({ name: n, fig: i })),
    { mochi: true },
    ...names.slice(half).map((n, i) => ({ name: n, fig: half + i }))
  ];
  const n = seats.length, step = Math.min(0.22, 0.78 / Math.max(1, n - 1));
  seats.forEach((s, i) => { s.x = 0.5 + (i - (n - 1) / 2) * step; });
  const figs = FIGURE_URLS;
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="tp-room">
      <div class="tp-bunting"></div>
      ${seats.map((s, i) => `
        <div class="tp-seat${s.mochi ? " mochi" : ""}" data-i="${i}" style="left:${s.x * 100}%">
          <img class="tp-chair" src="${P("chair")}" alt="" />
          ${s.mochi ? `<img class="tp-sitter" src="${MOCHI_CUTE_URL}" alt="" />`
            : `<div class="tp-guest"><img src="${figs[s.fig % figs.length]}" alt="" draggable="false" /></div><div class="tp-whisper"></div>`}
        </div>`).join("")}
      <div class="tp-table">
        <span class="tp-candle" style="left:${(seats[0].x + seats[1].x) * 50}%"><i></i></span>
        <span class="tp-candle" style="left:${(seats[n - 1].x + seats[n - 2].x) * 50}%"><i></i></span>
        ${seats.map((s, i) => `
          <div class="tp-place${s.mochi ? " mochi" : ""}" data-i="${i}" style="left:${s.x * 100}%">
            ${s.mochi ? "" : `<div class="tp-cup">${CUP.replace(/CLIP/g, `tpclip${i}`)}</div>`}
            <span class="tp-namecard">${s.mochi ? "mochi ♡" : s.name}</span>
          </div>`).join("")}
        <div class="tp-place you"><div class="tp-cup">${CUP.replace(/CLIP/g, "tpclipyou")}</div><span class="tp-namecard">${fillName("{name}", player)} ♡</span></div>
      </div>
    </div>`);
  const room = v.root.querySelector(".tp-room");
  seats.forEach((s, i) => {
    s.seat = room.querySelector(`.tp-seat[data-i="${i}"]`);
    s.place = room.querySelector(`.tp-place[data-i="${i}"]`);
  });
  const you = { you: true, place: room.querySelector(".tp-place.you"), x: 0.5 };
  // Mochi, between scenes, cute again: her eyes show only in flickers
  const sitter = room.querySelector(".tp-sitter");
  const hurt = woundsNow(8) || "/mochi/wounds-eyes.webp";
  let ft = null;
  const flick = () => {
    if (!sitter.isConnected) return;
    sitter.src = hurt;
    setTimeout(() => { if (sitter.isConnected) sitter.src = MOCHI_CUTE_URL; }, 55);
    ft = setTimeout(flick, 4000 + Math.random() * 5000);
  };
  ft = setTimeout(flick, 2500);
  return { room, seats, you, hers, stop: () => clearTimeout(ft), sitter };
}

/** For a frame, a guest as it really is. */
function glimpse(seat, ms = 90) {
  const g = seat?.seat?.querySelector(".tp-guest");
  if (!g) return;
  g.classList.add("seen");
  setTimeout(() => g.classList.remove("seen"), ms);
}

function setLevel(cup, level) {
  const svg = cup.querySelector("svg");
  const y = 125 - clamp(level, 0, 1.02) * 103;
  svg.querySelector(".tea").setAttribute("y", y.toFixed(1));
  svg.querySelector(".tea-top").setAttribute("cy", y.toFixed(1));
  svg.querySelector(".tea-top").style.opacity = level > 0.02 ? 1 : 0;
}

// ================================================================ tea

export async function runTea(ctx) {
  const v = setup(ctx, "pour");
  const player = ctx.player;
  const T = table(v, ctx);
  const pot = document.createElement("div");
  pot.className = "tp-pot";
  pot.innerHTML = TEAPOT;
  const stream = document.createElement("div");
  stream.className = "tp-stream";
  T.room.append(pot, stream);
  v.controls.innerHTML = `<p class="mp-hint">${LINES.teaHint}</p>`;
  show(v);
  ctx.sfx?.chirp();
  await talk(v, ctx, [T.hers ? LINES.teaHers : LINES.teaCame, LINES.teaAsk], 1900);

  // hold to pour (mouse, touch or space)
  let pouring = false;
  const down = (e) => { if (e.type !== "keydown" || e.code === "Space") { pouring = true; if (e.type === "keydown") e.preventDefault(); } };
  const up = (e) => { if (e.type !== "keyup" || e.code === "Space") pouring = false; };
  v.root.addEventListener("pointerdown", down);
  addEventListener("pointerup", up);
  addEventListener("keydown", down);
  addEventListener("keyup", up);

  const whispers = [...LINES.guestWhisper].sort(() => Math.random() - 0.5);
  const poured = [];
  const guests = T.seats.filter((s) => !s.mochi);
  const order = [...guests, T.you];
  for (let k = 0; k < order.length; k++) {
    const s = order[k];
    const cupEl = s.place.querySelector(".tp-cup");
    s.place.classList.add("now");
    // the pot moves over this cup
    const rr = T.room.getBoundingClientRect(), cr = cupEl.getBoundingClientRect();
    const cx = cr.left - rr.left + cr.width * 0.47, top = cr.top - rr.top;
    pot.style.left = cx + "px";
    pot.style.top = top + "px";
    pot.classList.add("on");
    if (s.you) say(v, fillName(LINES.teaYou, player));
    else say(v, fillName(pick(LINES.teaFor), player).replace("{guest}", s.name === "?" ? LINES.teaNoName : s.name));
    ctx.sfx?.tick();
    await sleep(700);

    let level = 0, last = performance.now(), t0 = last, done = false, overflow = false, wasPouring = false, nagged = false;
    while (!done) {
      await frame();
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - t0 > 25000) pouring = level < LINE; // nobody gets stuck: it fills itself
      if (pouring) level += dt * 0.34;
      pot.classList.toggle("tilt", pouring);
      stream.classList.toggle("on", pouring);
      if (pouring) {
        const pr = pot.querySelector("svg").getBoundingClientRect();
        stream.style.left = cx + "px";
        stream.style.top = pr.top - rr.top + pr.height * 0.32 + "px";
        stream.style.height = Math.max(0, top - (pr.top - rr.top + pr.height * 0.32) + cr.height * (1 - level * 0.7) * 0.75) + "px";
        if (Math.random() < 0.08) ctx.samples?.play("drip", { gain: 0.18 });
      }
      setLevel(cupEl, level);
      if (level > 1.04) { overflow = true; pouring = false; }
      if (wasPouring && !pouring) {
        if (level >= 0.66 || overflow) done = true;
        else if (!nagged) { nagged = true; say(v, LINES.teaMore); }
      }
      wasPouring = pouring;
    }
    pot.classList.remove("tilt");
    stream.classList.remove("on");
    s.place.classList.remove("now");
    poured.push({ who: s.you ? "you" : s.name, level: +level.toFixed(2) });
    if (overflow) {
      cupEl.classList.add("spill");
      ctx.samples?.play("splat", { gain: 0.3 });
      say(v, LINES.teaSpill);
    } else if (level <= 0.93) {
      ctx.sfx?.chirp();
      const r = cupEl.getBoundingClientRect();
      heart(v, r.left + r.width / 2, r.top, "♡");
      giggle.happy(0.4);
      say(v, pick(LINES.teaPerfect));
    } else say(v, LINES.teaBrim);
    await sleep(1600);
    if (s.you) break;

    // they whisper. mochi translates.
    const w = s.seat.querySelector(".tp-whisper");
    w.textContent = fillName(whispers[k % whispers.length], player);
    w.classList.add("on");
    s.seat.classList.add("lean");
    glimpse(s);
    ctx.audio?.breatheBehind?.(0.04);
    say(v, "");
    await sleep(2600);
    w.classList.remove("on");
    s.seat.classList.remove("lean");
    say(v, fillName(LINES.teaThanks, player).replace("{guest}", s.name === "?" ? LINES.teaNoName : s.name));
    ctx.sfx?.tick();
    await sleep(2000);
  }
  pot.classList.remove("on");
  v.root.removeEventListener("pointerdown", down);
  removeEventListener("pointerup", up);
  removeEventListener("keydown", down);
  removeEventListener("keyup", up);
  v.controls.innerHTML = "";

  // look into it
  await reflection(v, ctx);
  T.stop();
  player.tea = { ...(player.tea || {}), poured };
  await hide(v);
}

/** Your cup, from above. You're in it. So is something behind you. */
async function reflection(v, ctx) {
  const player = ctx.player;
  say(v, fillName(LINES.teaLook, player));
  v.root.insertAdjacentHTML("beforeend", `<div class="tp-reflect"><div class="tp-rim"><canvas width="360" height="360"></canvas><div class="tp-ripple"></div></div></div>`);
  const wrap = v.root.querySelector(".tp-reflect"), c = wrap.querySelector("canvas"), g = c.getContext("2d");
  const feed = ctx.feed;
  const fig = ctx.director?.prepareFigureImage?.() ? ctx.director.figureAt(4.4, ctx.getFace?.()) : null;
  let live = true;
  (async () => {
    while (live) {
      const src = feed?.canvas;
      if (src?.width) {
        const s = Math.min(src.width, src.height);
        g.save(); g.translate(360, 0); g.scale(-1, 1);
        g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, 360, 360);
        g.restore();
      }
      await frame();
    }
  })();
  requestAnimationFrame(() => wrap.classList.add("on"));
  await sleep(1400);
  // a ripple, and when it settles there's someone standing behind you
  wrap.querySelector(".tp-ripple").classList.add("go");
  ctx.sfx?.boop(0.6);
  await sleep(700);
  if (fig && feed) {
    feed.setFigureImage(ctx.director.prepareFigureImage());
    feed.setFigure(fig);
  }
  await sleep(3200);
  feed?.setFigure(null);
  say(v, fillName(LINES.teaDrink, player));
  v.controls.innerHTML = `<button type="button" class="btn-primary tp-drink">${LINES.teaDrinkBtn}</button>`;
  await new Promise((resolve) => {
    v.controls.querySelector("button").addEventListener("click", resolve, { once: true });
    wrap.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 14000);
  });
  v.controls.innerHTML = "";
  // gulp, gulp, gulp
  wrap.classList.add("drink");
  for (let i = 0; i < 3; i++) { ctx.sfx?.nom(); await sleep(330); }
  live = false;
  player.tea = { ...(player.tea || {}), drank: true };
  await sleep(500);
  wrap.remove();
  await talk(v, ctx, [LINES.teaTaste, LINES.teaMade], 2000);
}

// ================================================================ pass the parcel

export async function runParcel(ctx) {
  const v = setup(ctx, "parcel");
  const player = ctx.player;
  const T = table(v, ctx);
  T.room.querySelectorAll(".tp-cup .tea").forEach((r) => r.setAttribute("y", "45")); // everyone has their tea
  T.room.querySelectorAll(".tp-cup .tea-top").forEach((r) => r.setAttribute("cy", "45"));
  // around the table: left to right along the seats, then you, then back
  const ring = [...T.seats, T.you];
  const parcel = document.createElement("div");
  parcel.className = "tp-parcel";
  parcel.innerHTML = `<span class="tp-box"></span><span class="tp-bow">🎀</span>`;
  T.room.appendChild(parcel);
  let layer = 0;
  const paint = () => parcel.style.setProperty("--wrap", WRAPS[Math.min(layer, WRAPS.length - 1)]);
  paint();
  const spot = (s) => {
    const rr = T.room.getBoundingClientRect(), pr = s.place.getBoundingClientRect();
    return { x: pr.left - rr.left + pr.width / 2, y: pr.top - rr.top - (s.you ? 0 : pr.height * 0.15) };
  };
  const moveTo = (s, hop = true) => {
    const p = spot(s);
    parcel.style.left = p.x + "px";
    parcel.style.top = p.y + "px";
    if (hop) { parcel.classList.remove("hop"); void parcel.offsetWidth; parcel.classList.add("hop"); }
  };
  let at = 0;
  moveTo(ring[at], false);
  show(v);
  ctx.sfx?.chirp();
  await talk(v, ctx, [LINES.parcelAsk, LINES.parcelRules], 1900);

  const passBtn = () => {
    v.controls.innerHTML = `<button type="button" class="btn-primary tp-pass">${LINES.parcelPassBtn}</button>`;
    return new Promise((resolve) => {
      const go = () => { removeEventListener("keydown", key); resolve(); };
      const key = (e) => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); go(); } };
      v.controls.querySelector("button").addEventListener("click", go, { once: true });
      parcel.addEventListener("click", go, { once: true });
      addEventListener("keydown", key);
      setTimeout(go, 9000);
    });
  };
  const theme = ctx.theme;
  const ROUNDS = 5;
  const guestIdx = T.seats.map((s, i) => (s.mochi ? -1 : i)).filter((i) => i >= 0);
  const mochiIdx = T.seats.findIndex((s) => s.mochi);
  const youIdx = ring.length - 1;
  const targets = [pick(guestIdx), pick(guestIdx), mochiIdx, pick(guestIdx), youIdx];

  for (let round = 0; round < ROUNDS; round++) {
    say(v, round ? pick(LINES.parcelAgain) : LINES.parcelGo);
    theme?.setVolume?.(0.26, 0.2);
    theme?.play?.({ fade: 0.15, fromTop: true });
    const minMs = 3200 + Math.random() * 3000;
    const t0 = performance.now();
    // pass it around until the music has played long enough AND it lands on this round's holder
    for (;;) {
      await sleep(round === ROUNDS - 1 ? 430 : 520);
      at = (at + 1) % ring.length;
      moveTo(ring[at]);
      ctx.sfx?.tick();
      if (performance.now() - t0 > minMs && at === targets[round]) break;
      if (ring[at].you) {
        // it waits for you
        say(v, fillName(LINES.parcelYours, player));
        await passBtn();
        v.controls.innerHTML = "";
        say(v, "");
      }
    }
    // the music stops
    theme?.cut?.();
    v.controls.innerHTML = "";
    await sleep(800);
    const s = ring[at];
    if (s.you) break; // the last layer is yours
    // they unwrap a layer
    const name = s.mochi ? "mochi" : (s.name === "?" ? LINES.teaNoName : s.name);
    say(v, s.mochi ? LINES.parcelMochi : fillName(LINES.parcelStop, player).replace("{guest}", name));
    await sleep(900);
    await rip(v, ctx, parcel);
    layer++;
    paint();
    const prize = PRIZES[round % PRIZES.length];
    const pz = document.createElement("span");
    pz.className = "tp-prize";
    pz.textContent = prize;
    pz.style.left = parcel.style.left;
    pz.style.top = parcel.style.top;
    T.room.appendChild(pz);
    if (s.mochi) { giggle.happy(0.8); bounce(v); }
    else glimpse(s, 70);
    await sleep(1600);
    say(v, s.mochi ? LINES.parcelMochiGot : fillName(LINES.parcelGot, player).replace("{guest}", name).replace("{prize}", prize));
    await sleep(2200);
  }

  // your turn: the last layers, and what's inside
  say(v, fillName(LINES.parcelYourTurn, player));
  v.controls.innerHTML = `<p class="mp-hint">${LINES.parcelOpenHint}</p>`;
  parcel.classList.add("mine");
  for (let k = 0; k < 2; k++) {
    await new Promise((resolve) => {
      const go = () => { removeEventListener("keydown", key); resolve(); };
      const key = (e) => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); go(); } };
      parcel.addEventListener("click", go, { once: true });
      addEventListener("keydown", key);
      setTimeout(go, 12000);
    });
    await rip(v, ctx, parcel);
    layer++;
    paint();
  }
  v.controls.innerHTML = "";
  parcel.classList.add("open");
  ctx.sfx?.sparkle();
  const sc = document.createElement("div");
  sc.className = "tp-scissors";
  sc.innerHTML = `${SCISSORS}<span class="tp-tag">${LINES.parcelTag}</span>`;
  T.room.appendChild(sc);
  await sleep(1200);
  giggle.happy(0.9);
  await talk(v, ctx, [LINES.parcelScissors, LINES.parcelLater], 2100);
  player.tea = { ...(player.tea || {}), scissors: true };
  T.stop();
  await hide(v);
}

async function rip(v, ctx, parcel) {
  ctx.samples?.play("tear", { gain: 0.3 }) || ctx.sfx?.boop(0.7);
  const r = parcel.getBoundingClientRect();
  for (let i = 0; i < 5; i++) {
    const p = document.createElement("span");
    p.className = "tp-scrap";
    p.style.left = r.left + r.width * Math.random() + "px";
    p.style.top = r.top + r.height * Math.random() + "px";
    p.style.background = getComputedStyle(parcel).getPropertyValue("--wrap");
    p.style.setProperty("--dx", `${(Math.random() - 0.5) * 30}vh`);
    p.style.setProperty("--rot", `${(Math.random() - 0.5) * 720}deg`);
    v.fx.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
  parcel.classList.remove("hop"); void parcel.offsetWidth; parcel.classList.add("hop");
  await sleep(500);
}
