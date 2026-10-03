// Act III: Mochi's room, full screen. Still pink, still sweet.
//   decorate  furniture goes into fixed, good-looking spots (drag it there, or tap it)
//   hide      hide-and-seek in the room the player just made, three rounds
//
// The only wrong note in the whole act is the third round of hide-and-seek:
// she isn't behind anything. Her giggles stop. She's standing in the back
// corner, facing the wall. When the player finds her (or gives up), she
// stays facing the wall a long moment, then turns around: "found you ♡", as
// if *they* were the one hiding. Then she's bubbly again straight away.
//
// Saved for later acts: player.room (which piece went in which spot; Lights
// Out reuses it) and player.cornerFound (did they find her themselves).
//
// The furniture is plain SVG in public/room/ and can be swapped for other art
// with the same proportions. Hiding depends on a few numbers per piece
// (where its solid top/side starts), noted in HIDE below.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { outfitParts, accessoryHtml, headItem } from "../mochi/outfit.js";
import { build, show, hide, say, sayPersonal, heart, sleep, pick } from "./MochiPlay.js";

const MOCHI_BACK_URL = "/mochi/back.webp";
const art = (id) => `/room/${id}.svg`;

// ---------------------------------------------------------------- layout
//
// Everything is in fractions of the room box. x is the centre; y is where the
// piece touches the floor (or, on the wall, its bottom edge). h is the height
// as a fraction of the room's height; widths follow from the art's shape.
// The back wall runs x 0.12..0.88 and meets the floor at y 0.64.

export const ROOM_ITEMS = [
  { id: "wardrobe", label: "wardrobe", h: 0.46, ratio: 220 / 360, hide: "side" },
  { id: "bookshelf", label: "bookshelf", h: 0.44, ratio: 220 / 350, hide: "side" },
  { id: "bed", label: "bed", h: 0.27, ratio: 400 / 260 },
  { id: "couch", label: "couch", h: 0.26, ratio: 340 / 220, hide: "over" },
  { id: "toybox", label: "toy box", h: 0.2, ratio: 260 / 210, hide: "over" },
  { id: "plant", label: "plant", h: 0.3, ratio: 176 / 270 },
  { id: "lamp", label: "lamp", h: 0.38, ratio: 150 / 320 },
  { id: "rug", label: "rug", h: 0.15, ratio: 460 / 130, flat: true },
  { id: "picture", label: "picture", h: 0.15, ratio: 180 / 150, wall: true },
  { id: "clock", label: "clock", h: 0.18, ratio: 150 / 190, wall: true }
];
const ITEM = Object.fromEntries(ROOM_ITEMS.map((i) => [i.id, i]));

// the spots. `scale` shrinks things further back
export const SLOTS = [
  { id: "tall", x: 0.215, y: 0.665, scale: 0.95, accepts: ["wardrobe", "bookshelf"] },
  { id: "bed", x: 0.42, y: 0.735, scale: 0.95, accepts: ["bed"] },
  { id: "wallA", x: 0.42, y: 0.4, scale: 1, accepts: ["picture", "clock"] },
  { id: "wallB", x: 0.85, y: 0.38, scale: 0.9, accepts: ["picture", "clock"] },
  { id: "sideL", x: 0.07, y: 0.84, scale: 1, accepts: ["plant", "lamp"] },
  { id: "frontL", x: 0.19, y: 0.965, scale: 1.08, accepts: ["toybox", "plant", "lamp"] },
  { id: "frontR", x: 0.775, y: 0.965, scale: 1.08, accepts: ["couch"] },
  { id: "rug", x: 0.48, y: 0.87, scale: 1, accepts: ["rug"] }
];
const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// how she hides behind each kind of thing (fractions of the piece's own box):
//   over: the solid top edge she peeks over; she's `k` times the piece's height
//   side: the solid right edge she peeks out from, and where its feet start
const HIDE = {
  couch: { top: 0.09, k: 1.2 },
  toybox: { top: 0.3, k: 1.0 },
  wardrobe: { right: 0.945, bottom: 0.95, k: 0.5 },
  bookshelf: { right: 0.955, bottom: 0.95, k: 0.5 }
};

// the window, always there, with floor-length curtains she can hide behind
const WINDOW = { x: 0.66, y: 0.565, h: 0.42 };
const CURTAINS = { y: 0.615, h: 0.48, lx: 0.575, rx: 0.745 }; // tops tucked behind the valance
const VALANCE = { x: 0.66, y: 0.205, h: 0.07 };
const FLOOR_BACK = 0.645;
const CORNER = { x: 0.84, y: 0.655, h: 0.2 };
const PHOTO_BOX = { left: 28 / 180, top: 28 / 150, width: 124 / 180, height: 94 / 150 };
const MIN_ITEMS = 4;

// ---------------------------------------------------------------- the room

function roomHtml() {
  return `
    <div class="mr-room">
      <div class="mr-ceiling"></div>
      <div class="mr-back"></div>
      <div class="mr-left"></div>
      <div class="mr-right"></div>
      <div class="mr-floor"></div>
      <svg class="mr-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polygon class="mr-door" points="91.5,20 97.5,15 97.5,92 91.5,74.5" />
        <polygon class="mr-door-panel" points="92.6,26 96.4,22.8 96.4,50 92.6,51" />
        <polygon class="mr-door-panel" points="92.6,55 96.4,54.3 96.4,84 92.6,71" />
        <circle class="mr-knob" cx="93.4" cy="50" r="0.45" />
        <polyline points="12,9 12,64 0,100" /><polyline points="88,9 88,64 100,100" /><polyline points="12,64 88,64" />
      </svg>
      <div class="mr-slots"></div>
      <div class="mr-things"></div>
    </div>`;
}

/** Put a piece of art in the room at (x, y) with height h (fractions of the room). */
function setBox(el, { x, y, h, flat = false }) {
  el.style.left = x * 100 + "%";
  el.style.top = y * 100 + "%";
  el.style.setProperty("--h", h);
  el.style.zIndex = String(flat ? 6 : 10 + Math.round(y * 100));
  el.classList.toggle("flat", flat);
}

function itemEl(id, player) {
  const def = ITEM[id];
  const el = document.createElement("div");
  el.className = "mr-item";
  el.dataset.id = id;
  el.innerHTML = `<img src="${art(id)}" alt="${def.label}" draggable="false" />`;
  const photo = id === "picture" && player?.polaroid?.cute;
  if (photo) {
    try {
      const b = PHOTO_BOX;
      el.insertAdjacentHTML("beforeend", `<img class="mr-photo" src="${photo.toDataURL("image/jpeg", 0.75)}" alt="" draggable="false"
        style="left:${b.left * 100}%;top:${b.top * 100}%;width:${b.width * 100}%;height:${b.height * 100}%" />`);
    } catch { /* tainted canvas: the painting stays */ }
  }
  return el;
}

function putInSlot(v, id, slotId, player) {
  const slot = SLOT[slotId], def = ITEM[id];
  let el = v.things.querySelector(`.mr-item[data-id="${id}"]`);
  if (!el) {
    el = itemEl(id, player);
    v.things.appendChild(el);
  }
  el.dataset.slot = slotId;
  setBox(el, { x: slot.x, y: def.flat ? slot.y : slot.y, h: def.h * slot.scale, flat: def.flat });
  return el;
}

function fixtures(v) {
  const add = (cls, src, box) => {
    const el = document.createElement("div");
    el.className = `mr-item mr-fixed ${cls}`;
    el.innerHTML = `<img src="${src}" alt="" draggable="false" />`;
    setBox(el, box);
    v.things.appendChild(el);
    return el;
  };
  add("mr-window", art("window"), WINDOW).style.zIndex = "3";
  v.curtainL = add("mr-curtain l", art("curtain-l"), { x: CURTAINS.lx, y: CURTAINS.y, h: CURTAINS.h });
  v.curtainR = add("mr-curtain r", art("curtain-r"), { x: CURTAINS.rx, y: CURTAINS.y, h: CURTAINS.h });
  v.curtainL.style.zIndex = v.curtainR.style.zIndex = "5";
  v.curtainR.dataset.id = "curtain";
  add("mr-valance", art("valance"), VALANCE).style.zIndex = "6";
}

/** Mochi standing in the room (front-facing or from behind). Her box is positioned like the furniture. */
function mochiInRoom(v, player, { x, y, h, back = false, cls = "" }) {
  const el = document.createElement("div");
  el.className = `mr-mochi ${cls}`;
  el.innerHTML = `<div class="mp-mochi-body">
    <img class="mp-mochi" src="${back ? MOCHI_BACK_URL : MOCHI_CUTE_URL}" alt="" draggable="false" />
    ${outfitHtml(player, back)}
  </div>`;
  placeMochi(el, { x, y, h });
  v.things.appendChild(el);
  return el;
}

function placeMochi(el, { x, y, h, z }) {
  el.style.left = x * 100 + "%";
  el.style.top = y * 100 + "%";
  el.style.setProperty("--mochi-h", `calc(${h} * 100cqh)`);
  el.style.zIndex = String(z ?? 10 + Math.round(y * 100));
}

/** From behind: only the head piece shows, on the other ear. */
function outfitHtml(player, back) {
  if (!back) return outfitParts(player?.outfit).map((a) => accessoryHtml(a)).join("");
  const h = headItem(player?.outfit?.head);
  return h ? accessoryHtml({ ...h, x: 1 - h.x, rot: -h.rot }) : "";
}

function setFacing(el, player, back) {
  const body = el.querySelector(".mp-mochi-body");
  body.querySelector("img").src = back ? MOCHI_BACK_URL : MOCHI_CUTE_URL;
  body.querySelectorAll(".mochi-acc").forEach((n) => n.remove());
  body.insertAdjacentHTML("beforeend", outfitHtml(player, back));
}

function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function setup(ctx, mode) {
  const v = build(ctx);
  v.root.classList.add("room", mode);
  // the bubble floats over the top of the room
  v.bubble.classList.add("mr-bubble");
  v.root.insertAdjacentHTML("afterbegin", roomHtml());
  v.room = v.root.querySelector(".mr-room");
  v.things = v.root.querySelector(".mr-things");
  v.slotLayer = v.root.querySelector(".mr-slots");
  v.room.appendChild(v.bubble);
  fixtures(v);
  return v;
}

/** Room box of an element, in fractions of the room. */
function frac(v, el) {
  const r = v.room.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: (b.left - r.left) / r.width, y: (b.top - r.top) / r.height, w: b.width / r.width, h: b.height / r.height };
}

function floatText(v, el, text) {
  const f = frac(v, el);
  const n = document.createElement("span");
  n.className = "mr-float";
  n.textContent = text;
  n.style.left = (f.x + f.w / 2) * 100 + "%";
  n.style.top = f.y * 100 + "%";
  v.room.appendChild(n);
  setTimeout(() => n.remove(), 1300);
}

function heartsAt(v, el, n = 6, glyph = "♡") {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < n; i++) setTimeout(() => heart(v, r.left + r.width * (0.2 + Math.random() * 0.6), r.top + r.height * 0.2, glyph), i * 70);
}

// ---------------------------------------------------------------- decorate

export async function runDecorate(ctx) {
  const v = setup(ctx, "decorate");
  const player = ctx.player;
  const home = { x: 0.585, y: 0.985, h: 0.3 };
  const mochi = mochiInRoom(v, player, home);
  show(v);
  retrigger(mochi, "mr-hop");
  ctx.sfx?.chirp();
  say(v, LINES.roomAsk);

  // the tray along the bottom of the screen
  v.controls.classList.add("mr-tray-bar");
  v.controls.innerHTML = `
    <div class="mr-tray">${ROOM_ITEMS.map((i) =>
      `<button type="button" class="mr-card" data-id="${i.id}"><img src="${art(i.id)}" alt="" draggable="false" /><small>${i.label}</small></button>`).join("")}</div>
    <div class="mr-tray-side">
      <p class="mp-hint">${LINES.roomHint}</p>
      <button class="btn-primary mr-done" disabled>all done ♡</button>
    </div>`;
  const tray = v.controls.querySelector(".mr-tray"), done = v.controls.querySelector(".mr-done");

  // the spots, shown while dragging
  for (const s of SLOTS) {
    const m = document.createElement("div");
    m.className = "mr-slot" + (s.accepts.every((a) => ITEM[a].wall) ? " wall" : "");
    m.dataset.slot = s.id;
    m.style.left = s.x * 100 + "%";
    m.style.top = s.y * 100 + "%";
    v.slotLayer.appendChild(m);
  }

  const where = new Map(); // item id -> slot id
  const occupant = (slotId) => [...where].find(([, s]) => s === slotId)?.[0] ?? null;
  const reacted = new Set();

  const refresh = () => {
    tray.querySelectorAll(".mr-card").forEach((b) => b.classList.toggle("used", where.has(b.dataset.id)));
    done.disabled = where.size < MIN_ITEMS;
  };
  const remove = (id) => {
    const el = v.things.querySelector(`.mr-item[data-id="${id}"]`);
    where.delete(id);
    if (!el) return;
    el.classList.add("mr-leaving");
    setTimeout(() => el.remove(), 260);
  };
  const place = (id, slotId) => {
    const other = occupant(slotId);
    if (other && other !== id) remove(other); // whatever was there goes back in the tray
    where.set(id, slotId);
    const el = putInSlot(v, id, slotId, player);
    el.classList.remove("mr-leaving", "lifted");
    retrigger(el, "mr-pop");
    ctx.sfx?.pop();
    heartsAt(v, el, 4);
    retrigger(mochi, "mr-hop");
    if (!reacted.has(id)) {
      reacted.add(id);
      const line = id === "picture" && player?.polaroid?.cute ? LINES.roomReact.pictureUs : LINES.roomReact[id];
      if (line) say(v, fillName(line, player));
    }
    refresh();
  };
  const firstSlotFor = (id) => {
    const ok = SLOTS.filter((s) => s.accepts.includes(id));
    return (ok.find((s) => !occupant(s.id)) || ok[0]).id;
  };

  // ---- dragging (from the tray, or moving something already placed)
  let drag = null;
  const showSlots = (id) => v.slotLayer.querySelectorAll(".mr-slot").forEach((m) => {
    const s = SLOT[m.dataset.slot];
    m.classList.toggle("on", s.accepts.includes(id));
    m.classList.toggle("taken", !!occupant(s.id) && occupant(s.id) !== id);
  });
  const hideSlots = () => v.slotLayer.querySelectorAll(".mr-slot").forEach((m) => m.classList.remove("on", "near"));
  const nearestSlot = (id, e) => {
    const r = v.room.getBoundingClientRect();
    let best = null, bestD = Infinity;
    for (const s of SLOTS) {
      if (!s.accepts.includes(id)) continue;
      // aim at the middle of where the piece would stand, not its feet
      const cy = s.y - (ITEM[id].flat ? 0 : ITEM[id].h * s.scale * 0.45);
      const d = Math.hypot(e.clientX - (r.left + s.x * r.width), e.clientY - (r.top + cy * r.height));
      if (d < bestD) { bestD = d; best = s; }
    }
    return bestD < Math.max(r.width, r.height) * 0.22 ? best : null;
  };
  const begin = (e, id, fromTray) => {
    e.preventDefault();
    drag = { id, fromTray, sx: e.clientX, sy: e.clientY, moved: false, ghost: null };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end, { once: true });
  };
  const move = (e) => {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
      drag.moved = true;
      // a ghost of the piece follows the pointer, at the size it'll be in the room
      const g = itemEl(drag.id, player);
      g.classList.add("mr-ghost");
      const s = SLOT[firstSlotFor(drag.id)];
      g.style.setProperty("--h", ITEM[drag.id].h * s.scale);
      v.room.appendChild(g);
      drag.ghost = g;
      v.things.querySelector(`.mr-item[data-id="${drag.id}"]`)?.classList.add("lifted");
      showSlots(drag.id);
      ctx.sfx?.tick();
    }
    const r = v.room.getBoundingClientRect();
    const def = ITEM[drag.id];
    drag.ghost.style.left = ((e.clientX - r.left) / r.width) * 100 + "%";
    drag.ghost.style.top = ((e.clientY - r.top) / r.height) * 100 + "%";
    drag.ghost.style.translate = def.flat ? "0 0" : "0 45%";
    const near = nearestSlot(drag.id, e);
    v.slotLayer.querySelectorAll(".mr-slot").forEach((m) => m.classList.toggle("near", near?.id === m.dataset.slot));
  };
  const end = (e) => {
    removeEventListener("pointermove", move);
    const d = drag;
    drag = null;
    hideSlots();
    if (!d) return;
    d.ghost?.remove();
    if (!d.moved) {
      if (d.fromTray) place(d.id, where.get(d.id) || firstSlotFor(d.id));
      else retrigger(v.things.querySelector(`.mr-item[data-id="${d.id}"]`), "mr-wiggle");
      return;
    }
    const s = nearestSlot(d.id, e);
    if (s) place(d.id, s.id);
    else if (!d.fromTray || where.has(d.id)) {
      if (d.fromTray) v.things.querySelector(`.mr-item[data-id="${d.id}"]`)?.classList.remove("lifted");
      else { remove(d.id); refresh(); ctx.sfx?.boop(0.8); }
    }
  };
  tray.querySelectorAll(".mr-card").forEach((b) => b.addEventListener("pointerdown", (e) => begin(e, b.dataset.id, true)));
  v.things.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".mr-item:not(.mr-fixed)");
    if (el) begin(e, el.dataset.id, false);
  });

  await new Promise((resolve) => {
    done.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 150000); // nobody gets stuck decorating
  });

  // she needs at least one thing to hide behind besides the curtains
  let brought = false;
  if (![...where.keys()].some((id) => ITEM[id].hide)) {
    const id = occupant("frontL") ? (occupant("tall") ? "couch" : "wardrobe") : "toybox";
    place(id, firstSlotFor(id));
    brought = true;
  }
  player.room = [...where].map(([id, slot]) => ({ id, slot }));

  v.controls.innerHTML = "";
  v.controls.classList.remove("mr-tray-bar");
  v.root.classList.remove("decorate"); // the room slides down to fill the screen
  v.root.classList.add("decorated");
  if (brought) {
    say(v, LINES.roomMore);
    await sleep(2200);
  }
  retrigger(mochi, "mr-hop");
  ctx.sfx?.sparkle();
  heartsAt(v, v.room, 12);
  const names = player.room.map((p) => ITEM[p.id].label).join(", ");
  await sayPersonal(v, ctx, "decorate", fillName(pick(LINES.roomDone), player), { answer: `decorated Mochi's room with: ${names}` });
  await sleep(2800);
  await hide(v);
}

// ---------------------------------------------------------------- hide-and-seek

const DEFAULT_ROOM = [
  { id: "wardrobe", slot: "tall" }, { id: "bed", slot: "bed" }, { id: "couch", slot: "frontR" },
  { id: "toybox", slot: "frontL" }, { id: "rug", slot: "rug" }, { id: "picture", slot: "wallA" }
];

export async function runHideAndSeek(ctx) {
  const v = setup(ctx, "hideseek");
  const player = ctx.player;
  const layout = player.room?.length ? player.room : DEFAULT_ROOM;
  for (const p of layout) if (SLOT[p.slot] && ITEM[p.id]) putInSlot(v, p.id, p.slot, player);

  // where she can hide: things with a hiding style, plus the right-hand curtain
  const spots = [...v.things.querySelectorAll(".mr-item[data-id]")]
    .filter((el) => ITEM[el.dataset.id]?.hide || el === v.curtainR);
  const style = (el) => (el === v.curtainR ? "feet" : ITEM[el.dataset.id].hide);

  const home = { x: 0.5, y: 0.985, h: 0.34 };
  let mochi = mochiInRoom(v, player, { ...home, cls: "mr-home" });
  show(v);
  retrigger(mochi, "mr-hop");
  ctx.sfx?.chirp();
  say(v, LINES.hideAsk);
  await sleep(3000);

  // round one: somewhere easy (she peeks over something); round two: the curtain
  const easy = spots.filter((s) => style(s) === "over");
  const r1 = pick(easy.length ? easy : spots.filter((s) => s !== v.curtainR).length ? spots.filter((s) => s !== v.curtainR) : spots);
  const r2 = r1 === v.curtainR ? pick(spots.filter((s) => s !== r1)) : v.curtainR;

  for (let round = 1; round <= 3; round++) {
    say(v, LINES.hideClose);
    await sleep(1300);
    await countdown(v, ctx, () => {
      mochi.remove();
      if (round < 3) mochi = hideBehind(v, player, round === 1 ? r1 : r2);
    });
    if (round < 3) await seekRound(v, ctx, mochi, round === 1 ? r1 : r2, round, home);
    else await wrongRound(v, ctx, spots);
    if (round === 3) mochi = mochiInRoom(v, player, { ...home, cls: "mr-home" });
    retrigger(mochi, "mr-hop");
    if (round < 3) await sleep(500);
  }

  // straight back to normal. nothing happened.
  ctx.sfx?.chirp();
  say(v, fillName(LINES.hideAfter[0], player));
  await sleep(2600);
  say(v, fillName(LINES.hideAfter[1], player));
  await sleep(2000);
  await hide(v);
}

async function countdown(v, ctx, whileCovered) {
  const cover = document.createElement("div");
  cover.className = "mr-cover";
  cover.innerHTML = `<span class="mr-count"></span><small>no peeking!! ♡</small>`;
  v.root.appendChild(cover);
  const n = cover.querySelector(".mr-count");
  requestAnimationFrame(() => cover.classList.add("on"));
  await sleep(450);
  say(v, "");
  whileCovered();
  for (const c of ["1", "2", "3"]) {
    n.textContent = c;
    retrigger(n, "mr-count-pop");
    ctx.sfx?.tick();
    await sleep(850);
  }
  say(v, LINES.hideReady);
  cover.classList.remove("on");
  await sleep(450);
  cover.remove();
}

/** Put her behind a spot so only the right bit of her shows. */
function hideBehind(v, player, spot) {
  const id = spot.dataset.id;
  const f = frac(v, spot);
  const z = Number(spot.style.zIndex) - 1;
  let el;
  if (spot === v.curtainR) {
    // behind the curtain: only her feet show under the hem
    const h = 0.15;
    el = mochiInRoom(v, player, { x: f.x + f.w / 2, y: FLOOR_BACK, h, cls: "mr-hiding feet" });
    el.style.zIndex = "4";
    spot.classList.add("bulge");
  } else if (ITEM[id].hide === "over") {
    // crouched behind it: ears and eyes over the top
    const H = HIDE[id], h = f.h * H.k;
    const top = f.y + H.top * f.h - h * 0.5;
    el = mochiInRoom(v, player, { x: f.x + f.w / 2, y: top + h, h, cls: "mr-hiding over" });
  } else {
    // behind the wardrobe or shelf, leaning out from its right side
    const H = HIDE[id], h = f.h * H.k;
    const aspect = v.room.clientHeight / v.room.clientWidth; // her box is square
    const w = h * aspect;
    el = mochiInRoom(v, player, { x: f.x + H.right * f.w + w * 0.02, y: f.y + H.bottom * f.h, h, cls: "mr-hiding side" });
  }
  el.style.zIndex = String(spot === v.curtainR ? 4 : z);
  return el;
}

/** Rounds one and two. */
async function seekRound(v, ctx, mochi, spot, round, home) {
  const player = ctx.player;
  await sleep(400);
  say(v, LINES.hideWhere);
  const start = performance.now();
  // round two: the curtain sways and her feet wiggle now and then, so nobody's stuck
  const hint = setInterval(() => {
    if (round === 1 || performance.now() - start > 7000) {
      retrigger(spot, spot === v.curtainR ? "mr-sway" : "mr-wiggle");
      retrigger(mochi, "mr-fidget");
      if (round === 2) ctx.sfx?.boop(1.35);
    }
  }, round === 1 ? 3200 : 4200);

  await new Promise((resolve) => {
    const onClick = (e) => {
      const el = e.target.closest(".mr-mochi, .mr-item");
      if (!el) return;
      if (el === spot || el === mochi) {
        v.things.removeEventListener("click", onClick);
        resolve();
        return;
      }
      if (el.classList.contains("mr-valance")) return;
      retrigger(el, "mr-wiggle");
      ctx.sfx?.boop(0.85);
      floatText(v, el, pick(LINES.hideNot));
    };
    v.things.addEventListener("click", onClick);
  });
  clearInterval(hint);

  // found! out she comes, then back to the middle of the room
  ctx.sfx?.chirp();
  if (spot === v.curtainR) spot.classList.add("open");
  mochi.classList.add("found");
  mochi.style.zIndex = "300";
  retrigger(mochi, "mr-hop");
  heartsAt(v, mochi, 7);
  say(v, fillName(LINES.hideFound[round - 1], player));
  await sleep(900);
  mochi.classList.remove("mr-hiding", "over", "side", "feet");
  placeMochi(mochi, { ...home, z: 300 });
  await sleep(1500);
  spot.classList.remove("open", "bulge");
  mochi.style.zIndex = String(10 + Math.round(home.y * 100));
}

/** Round three: she isn't hiding behind anything. */
async function wrongRound(v, ctx, spots) {
  const player = ctx.player;
  const corner = mochiInRoom(v, player, { ...CORNER, back: true, cls: "mr-corner" });
  await sleep(400);
  say(v, LINES.hideWhere);

  let misses = 0, lastClick = performance.now(), clickedHer = false;
  const clicked = new Set();
  const start = performance.now();
  await new Promise((resolve) => {
    const onClick = (e) => {
      if (e.target.closest(".mr-corner")) {
        clickedHer = true;
        finish();
        return;
      }
      const el = e.target.closest(".mr-item");
      if (!el || el.classList.contains("mr-valance")) return;
      misses++;
      if (spots.includes(el)) clicked.add(el);
      lastClick = performance.now();
      retrigger(el, el === v.curtainR ? "mr-sway" : "mr-wiggle");
      if (misses <= 2) {
        // the first two times she still giggles from somewhere. then she stops.
        ctx.sfx?.boop(0.85);
        floatText(v, el, pick(LINES.hideNot));
      }
      if (misses === 2) setTimeout(() => say(v, ""), 900);
    };
    const timer = setInterval(() => {
      const now = performance.now();
      if (now - start > 26000 || (clicked.size >= spots.length && now - lastClick > 6000)) finish();
    }, 250);
    function finish() {
      clearInterval(timer);
      v.things.removeEventListener("click", onClick);
      resolve();
    }
    v.things.addEventListener("click", onClick);
  });
  player.cornerFound = clickedHer;

  say(v, "");
  if (clickedHer) {
    // you found her. she doesn't react. she just keeps facing the wall.
    await sleep(4600);
  } else {
    say(v, fillName(LINES.hideCall, player));
    await sleep(2400);
    say(v, "");
    await sleep(2200);
  }
  setFacing(corner, player, false); // and then she's facing you
  say(v, LINES.hideFoundYou);
  await sleep(3000);
  corner.remove();
}
