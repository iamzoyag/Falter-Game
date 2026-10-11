// Act VI: lights out. It's a sleepover in Mochi's room, the room the player
// decorated in Act III, at night. Full screen, like the room.
//
//   flashlight  "lights out!! ♡" Her glow-in-the-dark stars fell off the
//               ceiling; find them with the flashlight (the cursor). She's in
//               the room with you, and she's cute. But:
//                 - every time the light leaves her, she's somewhere else when
//                   it comes back, a little closer each time
//                 - now and then, the moment the light lands on her, she has no
//                   ears (one frame; her most recent injury)
//                 - once, in the back corner, there's a second her, facing the
//                   wall. Look away and it's gone. "what are you looking at? ♡"
//                 - two small eyeshines in the dark, that go out when the light
//                   finds them
//               When the last star is up, the flashlight dies. When the lights
//               come back on she's exactly where she started. Nothing happened.
//   catch       a midnight snack: the bonus round's strawberry catch, in the
//               dark. Only her eyes show, high up, moving along the top of the
//               room, dropping things. A nightlight on the basket is all you
//               see by, so everything is a dim shape until it's nearly in the
//               basket: strawberries, then wet ones, buttons and thread from
//               her sewing kit, her ears, and last, slowly, an eye.
//
// Saved: player.night = { stars, moved, cornerSeen, eyeshines, caught, ears, eye }.
//
// Art: the room is MochiRoom's; the ears and the eye are built from Mochi's own
// art by tools/make_dark_items.py.

import { giggle } from "../mochi/Giggle.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { woundsNow } from "../mochi/wounds.js";
import { show, hide, say, heart, sleep, pick } from "./MochiPlay.js";
import { roomSetup, putInSlot, mochiInRoom, placeMochi, retrigger, ITEM, SLOT, CORNER, DEFAULT_ROOM } from "./MochiRoom.js";

const STAR_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 L61.8 36.2 L94 38.2 L69 58.8 L77 90 L50 72.6 L23 90 L31 58.8 L6 38.2 L38.2 36.2 Z" /></svg>`;
const STARS = 5;
// where the stars can have fallen (room fractions). Five of these are used.
const STAR_SPOTS = [
  { x: 0.085, y: 0.52 }, { x: 0.3, y: 0.56 }, { x: 0.8, y: 0.47 }, { x: 0.25, y: 0.9 },
  { x: 0.9, y: 0.85 }, { x: 0.55, y: 0.73 }, { x: 0.68, y: 0.94 }, { x: 0.47, y: 0.28 }
];
// where they go back up, on the ceiling
const CEILING = [{ x: 0.06, y: 0.05 }, { x: 0.78, y: 0.05 }, { x: 0.14, y: 0.085 }, { x: 0.87, y: 0.115 }, { x: 0.22, y: 0.045 }];
// she starts by the bed; every time the light leaves her she's at the next one, closer
const MOCHI_START = { x: 0.6, y: 0.76, h: 0.22 };
const MOCHI_CLOSER = [
  { x: 0.32, y: 0.8, h: 0.25 }, { x: 0.72, y: 0.86, h: 0.29 }, { x: 0.42, y: 0.93, h: 0.35 },
  { x: 0.6, y: 1.0, h: 0.43 }, { x: 0.5, y: 1.12, h: 0.6 }
];
// where a pair of eyeshines can be, low down in the dark
const SHINE_SPOTS = [{ x: 0.36, y: 0.79 }, { x: 0.14, y: 0.68 }, { x: 0.86, y: 0.7 }, { x: 0.52, y: 0.62 }];

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

function setup(ctx, mode) {
  const v = roomSetup(ctx, "lights");
  v.root.classList.add(mode);
  const layout = ctx.player.room?.length ? ctx.player.room : DEFAULT_ROOM;
  for (const p of layout) if (SLOT[p.slot] && ITEM[p.id]) putInSlot(v, p.id, p.slot, ctx.player);
  // the night: a big soft hole that moves with the light (transform only, so
  // it's cheap), and a plain black layer over it for when the light goes out
  v.room.insertAdjacentHTML("beforeend", `<div class="ld-dark"><div class="ld-hole"></div><div class="ld-black"></div></div>`);
  v.hole = v.room.querySelector(".ld-hole");
  v.black = v.room.querySelector(".ld-black");
  return v;
}

/** The light: where it is and how big (px within the room); `on` 0..1 (0 = pitch dark, a flicker in between). */
function setLight(v, x, y, r, on = 1) {
  const D = Math.ceil(2 * (v.room.clientWidth + v.room.clientHeight));
  if (v._D !== D) { v._D = D; v.room.style.setProperty("--D", `${D}px`); }
  if (Math.abs((v._r ?? -9) - r) > 0.5) { v._r = r; v.room.style.setProperty("--lr", `${Math.max(1, r).toFixed(1)}px`); }
  v.hole.style.transform = `translate3d(${(x - D / 2).toFixed(1)}px, ${(y - D / 2).toFixed(1)}px, 0)`;
  const b = ((1 - clamp(on)) * 0.96).toFixed(2);
  if (v._b !== b) { v._b = b; v.black.style.opacity = b; }
}

/** How lit a point is: 1 in the middle of the beam, 0 outside it. */
const litAt = (L, x, y) => clamp(1 - (Math.hypot(x - L.x, y - L.y) - L.r * 0.45) / (L.r * 0.6));

/** Pointer + arrow keys, as a smoothed target in room px. */
function steer(v) {
  const r0 = v.room.getBoundingClientRect();
  const s = { tx: r0.width / 2, ty: r0.height * 0.6, used: false };
  const onMove = (e) => {
    const r = v.room.getBoundingClientRect();
    s.tx = e.clientX - r.left;
    s.ty = e.clientY - r.top;
    s.used = true;
  };
  const onKey = (e) => {
    const r = v.room.getBoundingClientRect(), k = Math.min(r.width, r.height) * 0.06;
    if (e.key === "ArrowLeft") s.tx -= k;
    else if (e.key === "ArrowRight") s.tx += k;
    else if (e.key === "ArrowUp") s.ty -= k;
    else if (e.key === "ArrowDown") s.ty += k;
    else return;
    e.preventDefault();
    s.used = true;
  };
  v.root.addEventListener("pointermove", onMove);
  v.root.addEventListener("pointerdown", onMove);
  addEventListener("keydown", onKey);
  s.stop = () => {
    v.root.removeEventListener("pointermove", onMove);
    v.root.removeEventListener("pointerdown", onMove);
    removeEventListener("keydown", onKey);
  };
  return s;
}

/** The song goes quiet and far away while the lights are off. */
function hushSong(ctx) {
  const t = ctx.theme;
  if (!t) return () => {};
  const warp = { ...t.warp }, vol = t._volume ?? 0.22;
  t.setWarp({ muffle: Math.max(warp.muffle ?? 0, 0.62) });
  t.setVolume(vol * 0.45, 1.2);
  return () => { t.setWarp({ muffle: warp.muffle ?? 0 }); t.setVolume(vol, 1.5); };
}

async function talk(v, ctx, lines, gap = 2100) {
  for (const raw of [].concat(lines)) {
    const text = fillName(raw, ctx.player);
    say(v, text);
    if (text !== "...") ctx.sfx?.tick();
    await sleep(text === "..." ? 1400 : gap + Math.min(1500, text.length * 22));
  }
}

// ================================================================ the flashlight

export async function runFlashlight(ctx) {
  const v = setup(ctx, "flashlight");
  const player = ctx.player;
  const night = (player.night ||= {});
  const mochi = mochiInRoom(v, player, { ...MOCHI_START, cls: "ld-mochi" });
  const img = mochi.querySelector(".mp-mochi");
  const hurtUrl = woundsNow(6) || "/mochi/wounds-ears.webp";
  new Image().src = hurtUrl;

  // the stars, faintly glowing where they fell, and a counter
  const spots = shuffle(STAR_SPOTS).slice(0, STARS);
  v.room.insertAdjacentHTML("beforeend", `
    <div class="ld-stars">${spots.map((s, i) => `<span class="ld-star" data-i="${i}" style="left:${s.x * 100}%;top:${s.y * 100}%">${STAR_SVG}</span>`).join("")}</div>
    <div class="ld-shine" aria-hidden="true"><i></i><i></i></div>
    <div class="ld-hud"><span class="ld-hud-star">${STAR_SVG}</span><b>0</b> / ${STARS}</div>`);
  const stars = [...v.room.querySelectorAll(".ld-star")].map((el, i) => ({ el, ...spots[i], found: false }));
  const hud = v.room.querySelector(".ld-hud"), hudN = hud.querySelector("b");
  const shine = v.room.querySelector(".ld-shine");

  // ---- the lights are on (well, the lamp). it's a sleepover
  show(v);
  retrigger(mochi, "mr-hop");
  ctx.sfx?.chirp();
  await talk(v, ctx, [LINES.lightsAsk, LINES.lightsSleepover], 1900);
  say(v, LINES.lightsOut);
  await sleep(1500);

  // click.
  ctx.audio?.playStinger?.("click", { x: 0.3, y: 0.2, z: -0.4 });
  ctx.sfx?.tick();
  const unhush = hushSong(ctx);
  const R = () => Math.min(v.room.clientWidth, v.room.clientHeight) * 0.24;
  let L = { x: v.room.clientWidth / 2, y: v.room.clientHeight * 0.6, r: 0 };
  setLight(v, L.x, L.y, R(), 0);
  v.root.classList.add("dark");
  say(v, "");
  await sleep(1300);
  stars.forEach((s) => s.el.classList.add("faint")); // glow-in-the-dark: barely
  say(v, LINES.lightsStars);
  await sleep(2600);
  say(v, LINES.lightsTorch);
  ctx.sfx?.tick();
  hud.classList.add("on");
  v.root.classList.add("torch");

  const aim = steer(v);
  aim.tx = L.x; aim.ty = L.y;
  const t0 = performance.now();
  const st = {
    found: 0, moved: 0, mochiLit: false, seenSince: false, leftAt: 0, lastMove: t0,
    twin: null, twinLitAt: 0, twinDone: false, eyeshines: 0, shineAt: t0 + 9000, shineSpot: null, shineUntil: 0,
    flickerAt: t0 + 9000 + Math.random() * 5000, flicker: null, hurtShown: 0, cornerSeen: false, end: false
  };
  const usedShine = new Set();

  // what the light does: flicker now and then (a dying battery)
  const flickerK = (t) => {
    if (!st.flicker) return 1;
    const e = t - st.flicker;
    if (e > 420) { st.flicker = null; return 1; }
    return e < 60 ? 0.15 : e < 140 ? 1 : e < 230 ? 0 : e < 300 ? 0.6 : 1;
  };

  // Mochi's centre in room px
  const centreOf = (el, fy = 0.55) => {
    const r = v.room.getBoundingClientRect(), b = el.getBoundingClientRect();
    return { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height * fy, w: b.width, h: b.height };
  };

  const onClick = (e) => {
    if (st.end) return;
    const r = v.room.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // a star, if it's in the light
    let best = null, bestD = Infinity;
    for (const s of stars) {
      if (s.found) continue;
      const c = centreOf(s.el, 0.5);
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < Math.max(c.w, 36) * 0.9 && d < bestD && litAt(L, c.x, c.y) > 0.35) { best = s; bestD = d; }
    }
    if (best) return foundStar(best);
    // or her
    const m = centreOf(mochi);
    if (litAt(L, m.x, m.y) > 0.3 && Math.abs(x - m.x) < m.w * 0.4 && Math.abs(y - m.y) < m.h * 0.5) {
      retrigger(mochi, "mr-fidget");
      ctx.sfx?.boop(1.2);
      giggle.happy(0.5);
      say(v, fillName(pick(LINES.lightsPoke), player));
    }
  };
  v.room.addEventListener("click", onClick);

  const foundStar = (s) => {
    s.found = true;
    st.found++;
    hudN.textContent = st.found;
    retrigger(hud, "ld-hud-pop");
    // up it goes, back onto the ceiling, glowing
    s.el.classList.remove("faint");
    s.el.classList.add("up");
    const c = CEILING[(st.found - 1) % CEILING.length]; // the corners of the ceiling, clear of her speech bubble
    s.el.style.left = c.x * 100 + "%";
    s.el.style.top = c.y * 100 + "%";
    s.el.style.opacity = "";
    ctx.sfx?.sparkle();
    giggle.happy(st.found === STARS ? 0.9 : 0.35);
    const r = s.el.getBoundingClientRect();
    heart(v, r.left + r.width / 2, r.top, "✦");
    if (st.found < STARS) say(v, fillName(LINES.lightsFound[st.found - 1] || pick(LINES.lightsFoundAny), player));
  };

  await new Promise((resolve) => {
    const tick = (t) => {
      if (!v.room.isConnected) return resolve();
      // ---- the beam follows the pointer, smoothly
      const k = aim.used ? 0.2 : 0.06;
      aim.tx = clamp(aim.tx, 0, v.room.clientWidth);
      aim.ty = clamp(aim.ty, 0, v.room.clientHeight);
      L.x += (aim.tx - L.x) * k;
      L.y += (aim.ty - L.y) * k;
      if (!st.flicker && t > st.flickerAt) { st.flicker = t; st.flickerAt = t + 9000 + Math.random() * 7000; ctx.sfx?.tick(); }
      const target = R() * flickerK(t);
      L.r += (target - L.r) * (st.flicker ? 1 : 0.15); // how far the light reaches right now
      setLight(v, L.x, L.y, R(), L.r / R());

      // ---- stars: glow faintly in the dark, fully in the light
      for (const s of stars) {
        if (s.found) continue;
        const c = centreOf(s.el, 0.5);
        s.el.style.opacity = (0.12 + 0.88 * litAt(L, c.x, c.y)).toFixed(3);
      }

      // ---- Mochi: she moves when you're not looking
      const m = centreOf(mochi);
      const lit = litAt(L, m.x, m.y) > 0.25;
      if (lit && !st.mochiLit) {
        st.seenSince = true;
        // the moment the light finds her: sometimes she has no ears, for a frame
        if (st.hurtShown < 4 && Math.random() < 0.28 && t - t0 > 6000) {
          st.hurtShown++;
          const src = img.getAttribute("src");
          img.src = hurtUrl;
          setTimeout(() => { if (img.isConnected) img.src = src; }, 70);
        }
      }
      if (!lit && st.mochiLit) st.leftAt = t;
      st.mochiLit = lit;
      if (!lit && st.seenSince && st.moved < MOCHI_CLOSER.length && t - st.leftAt > 650 && t - st.lastMove > 3800) {
        // somewhere you aren't looking, closer
        const next = MOCHI_CLOSER[st.moved];
        const n = centreOfFrac(v, next);
        if (litAt(L, n.x, n.y) < 0.05) {
          placeMochi(mochi, next);
          st.moved++;
          st.lastMove = t;
          st.seenSince = false;
          if (st.moved === 3) ctx.audio?.breatheBehind?.(0.05);
        }
      }

      // ---- once, after two stars: a second her in the corner, facing the wall
      if (!st.twin && !st.twinDone && st.found >= 2) {
        const c = centreOfFrac(v, CORNER);
        if (litAt(L, c.x, c.y) < 0.05) st.twin = mochiInRoom(v, player, { ...CORNER, back: true, cls: "ld-twin" });
      }
      if (st.twin) {
        const c = centreOf(st.twin);
        const tl = litAt(L, c.x, c.y) > 0.3;
        if (tl && !st.twinLitAt) {
          st.twinLitAt = t;
          st.cornerSeen = true;
          setTimeout(() => { if (!st.end) say(v, fillName(LINES.lightsTwin, player)); }, 1300);
        }
        // gone the moment you look away (or if you never look)
        if ((st.twinLitAt && !tl && t - st.twinLitAt > 500) || (!st.twinLitAt && st.found >= 4 && !tl)) {
          st.twin.remove();
          st.twin = null;
          st.twinDone = true;
        }
      }

      // ---- eyeshines, low down in the dark; they go out in the light
      if (!st.shineSpot && t > st.shineAt && st.found >= 1 && usedShine.size < SHINE_SPOTS.length) {
        const free = SHINE_SPOTS.filter((s, i) => !usedShine.has(i) && litAt(L, ...Object.values(centreOfFrac(v, s))) < 0.02);
        if (free.length) {
          const s = pick(free);
          usedShine.add(SHINE_SPOTS.indexOf(s));
          st.shineSpot = s;
          st.shineUntil = t + 7000;
          shine.style.left = s.x * 100 + "%";
          shine.style.top = s.y * 100 + "%";
          shine.classList.add("on");
          st.eyeshines++;
        }
      }
      if (st.shineSpot) {
        const c = centreOfFrac(v, st.shineSpot);
        if (litAt(L, c.x, c.y) > 0.08 || t > st.shineUntil) {
          shine.classList.remove("on");
          st.shineSpot = null;
          st.shineAt = t + 8000 + Math.random() * 8000;
        }
      }

      if (st.found >= STARS || t - t0 > 150000) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  st.end = true;
  v.room.removeEventListener("click", onClick);
  aim.stop();
  if (st.found < STARS) {
    // she finds the rest (nobody gets stuck)
    say(v, LINES.lightsRest);
    for (const s of stars) if (!s.found) foundStar(s);
    await sleep(1600);
  } else {
    say(v, fillName(LINES.lightsAll, player));
    await sleep(2400);
  }

  // the flashlight dies
  shine.classList.remove("on");
  st.twin?.remove();
  for (const k of [0, 0.7, 0, 0.35, 0]) {
    setLight(v, L.x, L.y, R(), k);
    ctx.sfx?.tick();
    await sleep(110 + Math.random() * 90);
  }
  say(v, "");
  v.root.classList.remove("torch");
  hud.classList.remove("on");
  await sleep(1900);

  // ...and the lights come on. she's exactly where she started.
  placeMochi(mochi, MOCHI_START);
  img.src = img.getAttribute("src").includes("/wounds-") ? "/mochi/cute.webp" : img.getAttribute("src");
  ctx.audio?.playStinger?.("click", { x: 0.3, y: 0.2, z: -0.4 });
  v.root.classList.remove("dark");
  unhush();
  await sleep(500);
  retrigger(mochi, "mr-hop");
  ctx.sfx?.chirp();
  await talk(v, ctx, st.moved >= 2 ? LINES.lightsOnMoved : LINES.lightsOn, 1900);

  Object.assign(night, { stars: st.found, moved: st.moved, cornerSeen: st.cornerSeen, eyeshines: st.eyeshines });
  await hide(v);
}

/** A room-fraction point ({x, y, h?}) as room px; for Mochi boxes, roughly her middle. */
function centreOfFrac(v, p) {
  const w = v.room.clientWidth, h = v.room.clientHeight;
  return { x: p.x * w, y: (p.y - (p.h ? p.h * 0.45 : 0)) * h };
}

// ================================================================ the midnight catch

// what she drops, in order. dim shapes until they're in the light
const DROPS = [
  "berry", "berry", "berry", "berry", "berry",
  "wet", "berry", "wet", "berry",
  "button", "wet", "thread", "button",
  "earL", "berry", "button", "earR", "wet",
  "eye"
];
const KIND = {
  berry: { html: "🍓", cls: "berry" },
  wet: { html: "🍓<i class=\"nc-drip\"></i>", cls: "berry wet" },
  button: { html: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="b1"/><circle cx="50" cy="50" r="33" class="b2"/><circle cx="38" cy="38" r="6"/><circle cx="62" cy="38" r="6"/><circle cx="38" cy="62" r="6"/><circle cx="62" cy="62" r="6"/><path d="M38 38 L62 62 M62 38 L38 62" class="th"/></svg>`, cls: "button" },
  thread: { html: `<svg viewBox="0 0 100 120"><rect x="22" y="14" width="56" height="12" rx="4" class="w"/><rect x="22" y="94" width="56" height="12" rx="4" class="w"/><rect x="28" y="26" width="44" height="68" class="t"/><path d="M30 40 H70 M30 52 H70 M30 64 H70 M30 76 H70" class="tl"/><path d="M72 60 Q96 70 88 104" class="loose"/><path d="M82 30 L98 112" class="needle"/></svg>`, cls: "thread" },
  earL: { html: `<img src="/mochi/fall-ear-l.webp" alt="" draggable="false" />`, cls: "ear" },
  earR: { html: `<img src="/mochi/fall-ear-r.webp" alt="" draggable="false" />`, cls: "ear" },
  eye: { html: `<img src="/mochi/fall-eye.webp" alt="" draggable="false" />`, cls: "eye" }
};

export async function runNightCatch(ctx) {
  const v = setup(ctx, "nightcatch");
  const player = ctx.player;
  const night = (player.night ||= {});
  for (const k of ["earL", "earR", "eye"]) new Image().src = KIND[k].html.match(/src="([^"]+)"/)[1];

  v.root.classList.add("dark", "torch");
  v.room.insertAdjacentHTML("beforeend", `
    <div class="ld-eyes" aria-hidden="true"><i></i><i></i></div>
    <div class="nc-field"></div>
    <div class="nc-basket"><span class="nc-load"></span><span class="nc-tub">🧺</span></div>
    <div class="ld-hud on"><span>caught</span> <b>0</b></div>`);
  const eyes = v.room.querySelector(".ld-eyes"), field = v.room.querySelector(".nc-field");
  const basket = v.room.querySelector(".nc-basket"), load = basket.querySelector(".nc-load");
  const hudN = v.room.querySelector(".ld-hud b");
  const unhush = hushSong(ctx);
  const W = () => v.room.clientWidth, H = () => v.room.clientHeight;
  const R = () => Math.min(W(), H()) * 0.3;
  let bx = W() / 2;
  setLight(v, bx, H() * 0.82, R());
  show(v);
  await talk(v, ctx, [LINES.nightAsk, LINES.nightRules], 1900);
  say(v, LINES.nightGo);

  const aim = steer(v);
  aim.tx = bx;
  const items = [];
  const said = new Set();
  const got = { total: 0, ears: 0, eye: false, special: [] };
  let next = 0, sim = 0, spawnAt = 0.4, last = performance.now(), ex = 0.5, exT = 0.5, blinkUntil = 0;

  const spawn = () => {
    const kind = DROPS[next++];
    const node = document.createElement("span");
    node.className = `nc-item ${KIND[kind].cls}`;
    node.innerHTML = KIND[kind].html;
    field.appendChild(node);
    const slow = kind === "eye";
    items.push({ node, kind, x: ex * W(), y: H() * 0.2, vx: (Math.random() - 0.5) * W() * (slow ? 0.03 : 0.12),
      vy: slow ? 10 : 30 + Math.random() * 40, g: slow ? 95 : 230, rot: 0, spin: slow ? 24 : (Math.random() - 0.5) * 240, seen: false });
    blinkUntil = performance.now() + 140; // she blinks as it leaves her
    const big = kind === "eye" || kind.startsWith("ear");
    spawnAt = sim + (big ? 2.2 : 0.85 + Math.random() * 0.45) + (DROPS[next] === "eye" ? 1.6 : 0);
  };

  await new Promise((resolve) => {
    const tick = (now) => {
      if (!field.isConnected) return resolve();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim += dt;
      // the basket (and its little light)
      bx += (clamp(aim.tx, W() * 0.06, W() * 0.94) - bx) * 0.35;
      const by = H() * 0.9;
      basket.style.left = bx + "px";
      setLight(v, bx, by - H() * 0.08, R());
      // her eyes, wandering along the top of the room
      if (Math.abs(exT - ex) < 0.01) exT = 0.15 + Math.random() * 0.7;
      ex += (exT - ex) * Math.min(1, dt * 0.9);
      eyes.style.left = ex * 100 + "%";
      eyes.classList.toggle("blink", now < blinkUntil);
      if (next < DROPS.length && sim >= spawnAt) spawn();

      const bb = basket.getBoundingClientRect(), rr = v.room.getBoundingClientRect();
      const mouthY = bb.top - rr.top + bb.height * 0.35, half = bb.width * 0.45, reach = bb.height * 0.32;
      const L = { x: bx, y: by - H() * 0.08, r: R() };
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.vy += it.g * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.spin * dt;
        if (it.x < 20 || it.x > W() - 20) it.vx *= -0.8;
        // only the light shows what it is
        const b = clamp(1 - (Math.hypot(it.x - L.x, it.y - L.y) - L.r * 0.35) / (L.r * 1.1));
        it.node.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px) translate(-50%, -50%) rotate(${it.rot.toFixed(1)}deg)`;
        it.node.style.setProperty("--lit", b.toFixed(3));
        if (!it.seen && b > 0.55) {
          it.seen = true;
          const line = LINES.nightSee[it.kind];
          if (line && !said.has(it.kind)) { said.add(it.kind); say(v, fillName(line, player)); }
        }
        if (it.vy > 0 && Math.abs(it.y - mouthY) < reach && Math.abs(it.x - bx) < half) {
          caught(it);
          it.node.remove();
          items.splice(i, 1);
        } else if (it.y > H() + 60) {
          dropped(it);
          it.node.remove();
          items.splice(i, 1);
        }
      }
      if (next >= DROPS.length && !items.length) return resolve();
      if (sim > 120) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  function caught(it) {
    got.total++;
    hudN.textContent = got.total;
    retrigger(basket, "got");
    const r = basket.getBoundingClientRect();
    if (it.kind === "berry") {
      ctx.sfx?.boop(1 + Math.min(got.total, 12) * 0.03);
      heart(v, r.left + r.width / 2, r.top, "♡");
      if (got.total % 4 === 0) giggle.happy(0.3);
    } else if (it.kind === "wet") {
      ctx.samples?.play("drip", { gain: 0.5 }) || ctx.sfx?.boop(0.8);
    } else {
      // the special things stay on top of the pile, where you can see them
      if (it.kind === "earL" || it.kind === "earR") {
        got.ears++;
        ctx.samples?.play("squelch", { gain: 0.32 }) || ctx.sfx?.boop(0.7);
        if (!said.has("caught-ear")) { said.add("caught-ear"); say(v, fillName(LINES.nightGotEar, player)); }
      } else if (it.kind === "eye") {
        got.eye = true;
        ctx.samples?.play("squelch", { gain: 0.25 }) || ctx.sfx?.boop(0.6);
      } else ctx.sfx?.tick();
      got.special.push(it.kind);
      const n = document.createElement("span");
      n.className = `nc-in ${KIND[it.kind].cls}`;
      n.innerHTML = KIND[it.kind].html;
      n.style.setProperty("--r", `${(Math.random() - 0.5) * 50}deg`);
      n.style.setProperty("--x", `${(Math.random() - 0.5) * 50}%`);
      load.appendChild(n);
    }
  }

  function dropped(it) {
    if (it.kind === "berry" && Math.random() < 0.3) say(v, pick(LINES.catchMiss));
    if ((it.kind === "earL" || it.kind === "earR") && !said.has("drop-ear")) {
      said.add("drop-ear");
      say(v, fillName(LINES.nightDropEar, player));
      ctx.samples?.play("splat", { gain: 0.25, delay: 0.1 });
    }
  }

  aim.stop();
  await sleep(700);
  // let's see what you caught: the basket in the middle, in the light, and the
  // things that weren't strawberries laid out in front of it
  eyes.classList.add("gone");
  basket.classList.add("show-off");
  basket.style.left = "50%";
  setLight(v, W() / 2, H() * 0.6, R() * 1.45);
  v.root.classList.add("reveal");
  say(v, LINES.nightLook);
  ctx.sfx?.tick();
  await sleep(1500);
  const order = ["button", "thread", "earL", "earR", "eye"].filter((k) => got.special.includes(k));
  const row = document.createElement("div");
  row.className = "nc-show";
  v.room.appendChild(row);
  load.innerHTML = "";
  let eyeEl = null;
  for (const k of order) {
    const n = document.createElement("span");
    n.className = `nc-out ${KIND[k].cls}`;
    n.innerHTML = KIND[k].html;
    row.appendChild(n);
    if (k === "eye") eyeEl = n;
    (k === "eye" || k.startsWith("ear") ? ctx.sfx?.tick : ctx.sfx?.pop)?.call(ctx.sfx);
    await sleep(k === "eye" ? 1000 : 450);
  }
  // the eye looks wherever your pointer is
  const look = (e) => {
    if (!eyeEl?.isConnected) return;
    const r = eyeEl.getBoundingClientRect();
    eyeEl.style.setProperty("--ex", `${(clamp((e.clientX - r.left - r.width / 2) / (innerWidth / 2), -1, 1) * 1.4).toFixed(2)}cqh`);
    eyeEl.style.setProperty("--ey", `${(clamp((e.clientY - r.top - r.height / 2) / (innerHeight / 2), -1, 1) * 1.1).toFixed(2)}cqh`);
  };
  addEventListener("pointermove", look);
  const end = [
    ...(got.ears === 2 ? [LINES.nightEarsBoth] : got.ears === 1 ? [LINES.nightEarsOne] : []),
    ...(got.eye ? LINES.nightEyeKept : LINES.nightEyeDropped),
    LINES.nightBye
  ];
  await talk(v, ctx, end, 2000);
  removeEventListener("pointermove", look);
  Object.assign(night, { caught: got.total, ears: got.ears, eye: got.eye });
  unhush();
  await hide(v);
}
