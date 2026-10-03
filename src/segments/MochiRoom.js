// Act III: Mochi's room. Still pink, still sweet.
//   decorate  drag furniture into her (empty) room; the layout is saved
//   hide      hide-and-seek in the room the player just made, three rounds
//
// The only wrong note in the whole act is the third round of hide-and-seek:
// she isn't behind anything. Her giggles stop. She's standing in the back
// corner, facing the wall. When the player finds her (or gives up), she
// turns around and says "found you ♡", as if *they* were the one hiding.
// Then she's bubbly again straight away, and nothing ever mentions it.
//
// Saved for later acts: player.room (what went where; Lights Out reuses it)
// and player.cornerFound (did they find her in the corner themselves).

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { outfitParts, accessoryHtml, headItem } from "../mochi/outfit.js";
import { build, show, hide, say, sayPersonal, heart, sleep, pick } from "./MochiPlay.js";

const MOCHI_BACK_URL = "/mochi/back.webp";

// x, y: where it goes if the player just taps it (fractions of the room).
// size: glyph size in % of the room's width, for something at the front.
// hide: she can hide behind it.
export const ROOM_ITEMS = [
  { id: "bed", glyph: "🛏️", label: "bed", size: 15, hide: true, x: 0.27, y: 0.84 },
  { id: "couch", glyph: "🛋️", label: "couch", size: 14, hide: true, x: 0.74, y: 0.84 },
  { id: "plant", glyph: "🪴", label: "plant", size: 9, hide: true, x: 0.3, y: 0.68 },
  { id: "teddy", glyph: "🧸", label: "teddy", size: 8, hide: true, x: 0.62, y: 0.71 },
  { id: "gift", glyph: "🎁", label: "present", size: 7.5, hide: true, x: 0.46, y: 0.7 },
  { id: "frame", glyph: "🖼️", label: "picture", size: 7, wall: true, x: 0.32, y: 0.32 },
  { id: "clock", glyph: "🕰️", label: "clock", size: 6, wall: true, x: 0.43, y: 0.26 },
  { id: "books", glyph: "📚", label: "books", size: 6, x: 0.84, y: 0.66 }
];
// always there: the door on the right wall (she can hide behind it too)
const DOOR = { id: "door", glyph: "🚪", label: "door", size: 11, hide: true, fixed: true, x: 0.925, y: 0.74 };
const itemDef = (id) => (id === "door" ? DOOR : ROOM_ITEMS.find((i) => i.id === id));

const BACK_WALL_FLOOR = 0.62; // where the back wall meets the floor
const MIN_ITEMS = 4;

/** Further back on the floor = smaller. Things on the wall stay full size. */
function depth(y) {
  if (y <= BACK_WALL_FLOOR) return 0.85;
  return 0.72 + (0.28 * (y - BACK_WALL_FLOOR)) / (1 - BACK_WALL_FLOOR);
}

// ---------------------------------------------------------------- the room

function roomHtml() {
  return `
    <div class="mr-room">
      <div class="mr-ceiling"></div>
      <div class="mr-back"><div class="mr-window"><span></span></div></div>
      <div class="mr-left"></div>
      <div class="mr-right"></div>
      <div class="mr-floor"></div>
      <div class="mr-things"></div>
    </div>`;
}

function photoHtml(player) {
  const c = player?.polaroid?.cute;
  if (!c) return null;
  try {
    return `<span class="mr-photo"><img src="${c.toDataURL("image/jpeg", 0.7)}" alt="" /></span>`;
  } catch {
    return null;
  }
}

/** A piece of furniture in the room. */
function placeItem(things, def, x, y, player) {
  let el = things.querySelector(`.mr-item[data-id="${def.id}"]`);
  if (!el) {
    el = document.createElement("button");
    el.type = "button";
    el.className = "mr-item" + (def.fixed ? " fixed" : "");
    el.dataset.id = def.id;
    el.setAttribute("aria-label", def.label);
    el.innerHTML = (def.id === "frame" && photoHtml(player)) || `<span class="mr-glyph">${def.glyph}</span>`;
    things.appendChild(el);
  }
  moveItem(el, def, x, y);
  return el;
}

function moveItem(el, def, x, y) {
  el.dataset.x = x;
  el.dataset.y = y;
  el.style.left = x * 100 + "%";
  el.style.top = y * 100 + "%";
  el.style.setProperty("--s", def.size);
  el.style.setProperty("--d", def.wall ? 1 : depth(y));
  el.style.zIndex = String(10 + Math.round(y * 100));
}

/** Mochi, standing in the room (front-facing or from behind). */
function mochiInRoom(things, player, { x, y, h, back = false, cls = "" }) {
  const el = document.createElement("div");
  el.className = `mr-mochi ${cls}`;
  el.style.left = x * 100 + "%";
  el.style.top = y * 100 + "%";
  el.style.zIndex = String(10 + Math.round(y * 100));
  el.innerHTML = `<div class="mp-mochi-body" style="--mochi-h:${h}cqw">
    <img class="mp-mochi" src="${back ? MOCHI_BACK_URL : MOCHI_CUTE_URL}" alt="" draggable="false" />
    ${outfitHtml(player, back)}
  </div>`;
  things.appendChild(el);
  return el;
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

function hop(el) {
  el.classList.remove("mr-hop");
  void el.offsetWidth;
  el.classList.add("mr-hop");
}

function setup(ctx) {
  const v = build(ctx);
  v.root.classList.add("room");
  // the bubble sits in a fixed-height slot, so the room never jumps when she stops talking
  const slot = document.createElement("div");
  slot.className = "mr-bubble-slot";
  v.bubble.replaceWith(slot);
  slot.appendChild(v.bubble);
  slot.insertAdjacentHTML("afterend", roomHtml());
  v.room = v.root.querySelector(".mr-room");
  v.things = v.root.querySelector(".mr-things");
  return v;
}

/** Room-relative pixel box of an element. */
function boxIn(room, el) {
  const r = room.getBoundingClientRect(), b = el.getBoundingClientRect();
  return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height, cx: b.left - r.left + b.width / 2 };
}

function floatText(v, x, y, text) {
  const n = document.createElement("span");
  n.className = "mr-float";
  n.textContent = text;
  n.style.left = x + "px";
  n.style.top = y + "px";
  v.room.appendChild(n);
  setTimeout(() => n.remove(), 1300);
}

function wiggle(el, cls = "mr-wiggle") {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ---------------------------------------------------------------- decorate

export async function runDecorate(ctx) {
  const v = setup(ctx);
  v.root.classList.add("decorate");
  const player = ctx.player;
  placeItem(v.things, DOOR, DOOR.x, DOOR.y, player);
  const mochi = mochiInRoom(v.things, player, { x: 0.5, y: 0.97, h: 21 });
  show(v);
  hop(mochi);
  ctx.sfx?.chirp();
  say(v, LINES.roomAsk);
  v.controls.innerHTML = `
    <div class="mr-tray">${ROOM_ITEMS.map((i) =>
      `<button type="button" class="mp-snack mr-tray-item" data-id="${i.id}" aria-label="${i.label}"><span>${i.glyph}</span><small>${i.label}</small></button>`).join("")}</div>
    <p class="mp-hint">${LINES.roomHint}</p>
    <button class="btn-primary mr-done" disabled>all done ♡</button>`;
  const tray = v.controls.querySelector(".mr-tray"), done = v.controls.querySelector(".mr-done");
  const placed = new Map(); // id -> {x, y}
  const reacted = new Set();

  const refresh = () => {
    tray.querySelectorAll(".mr-tray-item").forEach((b) => b.classList.toggle("used", placed.has(b.dataset.id)));
    done.disabled = placed.size < MIN_ITEMS;
  };
  const react = (def) => {
    hop(mochi);
    ctx.sfx?.boop(1.05);
    if (reacted.has(def.id)) return;
    reacted.add(def.id);
    const line = def.id === "frame" && player?.polaroid?.cute ? LINES.roomReact.frameUs : LINES.roomReact[def.id];
    say(v, fillName(line, player));
    const b = boxIn(v.root, mochi);
    heart(v, v.room.getBoundingClientRect().left + b.cx, v.room.getBoundingClientRect().top + b.y + 10);
  };
  const toRoom = (e) => {
    const r = v.room.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const inside = (p) => p.x > 0.03 && p.x < 0.97 && p.y > 0.06 && p.y < 1.02;
  const clampP = (p) => ({ x: Math.max(0.05, Math.min(0.95, p.x)), y: Math.max(0.1, Math.min(0.99, p.y)) });

  // drag from the tray, or drag something already in the room; a tap on the tray just places it
  let drag = null;
  const begin = (e, def, el, fromTray) => {
    e.preventDefault();
    drag = { def, el, fromTray, sx: e.clientX, sy: e.clientY, moved: false };
    addEventListener("pointermove", move);
    addEventListener("pointerup", end, { once: true });
  };
  const move = (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
    drag.moved = true;
    const p = toRoom(e);
    if (!drag.el) drag.el = placeItem(v.things, drag.def, p.x, p.y, player);
    drag.el.classList.add("dragging");
    moveItem(drag.el, drag.def, p.x, p.y);
  };
  const end = (e) => {
    removeEventListener("pointermove", move);
    const d = drag;
    drag = null;
    if (!d) return;
    d.el?.classList.remove("dragging");
    if (!d.moved) {
      if (d.fromTray && !placed.has(d.def.id)) {
        const el = placeItem(v.things, d.def, d.def.x, d.def.y, player);
        wiggle(el, "mr-drop");
        placed.set(d.def.id, { x: d.def.x, y: d.def.y });
        react(d.def);
        ctx.sfx?.pop();
      }
      refresh();
      return;
    }
    const p = toRoom(e);
    if (inside(p)) {
      const c = clampP(p);
      moveItem(d.el, d.def, c.x, c.y);
      wiggle(d.el, "mr-drop");
      const isNew = !placed.has(d.def.id);
      placed.set(d.def.id, c);
      ctx.sfx?.pop();
      if (isNew) react(d.def);
    } else {
      d.el?.remove(); // dragged out of the room: back in the tray
      placed.delete(d.def.id);
    }
    refresh();
  };
  tray.querySelectorAll(".mr-tray-item").forEach((b) => b.addEventListener("pointerdown", (e) => {
    const def = itemDef(b.dataset.id);
    const existing = v.things.querySelector(`.mr-item[data-id="${def.id}"]`);
    begin(e, def, existing, true);
  }));
  v.things.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".mr-item:not(.fixed)");
    if (el) begin(e, itemDef(el.dataset.id), el, false);
  });

  await new Promise((resolve) => {
    done.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 120000); // nobody gets stuck decorating
  });

  // she needs somewhere to hide: at least three spots, counting the door
  let brought = false;
  for (const id of ["gift", "teddy", "plant", "bed", "couch"]) {
    if (placed.size >= MIN_ITEMS && [...placed.keys()].filter((k) => itemDef(k).hide).length + 1 >= 3) break;
    if (placed.has(id)) continue;
    const def = itemDef(id);
    placeItem(v.things, def, def.x, def.y, player);
    placed.set(id, { x: def.x, y: def.y });
    brought = true;
  }
  player.room = [...placed].map(([id, p]) => ({ id, x: +p.x.toFixed(3), y: +p.y.toFixed(3) }));

  v.controls.innerHTML = "";
  if (brought) {
    say(v, LINES.roomMore);
    hop(mochi);
    await sleep(2000);
  }
  hop(mochi);
  ctx.sfx?.sparkle();
  const r = v.room.getBoundingClientRect();
  for (let i = 0; i < 10; i++) setTimeout(() => heart(v, r.left + r.width * (0.15 + Math.random() * 0.7), r.top + r.height * (0.4 + Math.random() * 0.4)), i * 70);
  const names = player.room.map((p) => itemDef(p.id).label).join(", ");
  await sayPersonal(v, ctx, "decorate", fillName(pick(LINES.roomDone), player), { answer: `decorated Mochi's room with: ${names}` });
  await sleep(2800);
  await hide(v);
}

// ---------------------------------------------------------------- hide-and-seek

export async function runHideAndSeek(ctx) {
  const v = setup(ctx);
  v.root.classList.add("hideseek");
  const player = ctx.player;
  const layout = player.room?.length ? player.room : ROOM_ITEMS.slice(0, 5).map((d) => ({ id: d.id, x: d.x, y: d.y }));
  placeItem(v.things, DOOR, DOOR.x, DOOR.y, player);
  for (const p of layout) placeItem(v.things, itemDef(p.id), p.x, p.y, player);
  const spots = [...v.things.querySelectorAll(".mr-item")].filter((el) => itemDef(el.dataset.id).hide);

  const home = { x: 0.5, y: 0.97, h: 21 };
  let mochi = mochiInRoom(v.things, player, home);
  show(v);
  hop(mochi);
  ctx.sfx?.chirp();
  say(v, LINES.hideAsk);
  await sleep(3000);

  let last = null;
  for (let round = 1; round <= 3; round++) {
    say(v, LINES.hideClose);
    await sleep(1200);
    await countdown(v, ctx);
    mochi.remove();
    if (round < 3) {
      const spot = pick(spots.filter((s) => s !== last));
      last = spot;
      await seekRound(v, ctx, spots, spot, round);
    } else {
      await wrongRound(v, ctx, spots);
    }
    mochi = mochiInRoom(v.things, player, home);
    hop(mochi);
    if (round < 3) await sleep(600);
  }

  // straight back to normal. nothing happened.
  ctx.sfx?.chirp();
  say(v, fillName(LINES.hideAfter[0], player));
  await sleep(2600);
  say(v, fillName(LINES.hideAfter[1], player));
  await sleep(2000);
  await hide(v);
}

async function countdown(v, ctx) {
  const cover = document.createElement("div");
  cover.className = "mr-cover";
  cover.innerHTML = `<span class="mr-count"></span><small>no peeking!! ♡</small>`;
  v.room.appendChild(cover);
  const n = cover.querySelector(".mr-count");
  requestAnimationFrame(() => cover.classList.add("on"));
  await sleep(450);
  say(v, "");
  for (const c of ["1", "2", "3"]) {
    n.textContent = c;
    wiggle(n, "mr-count-pop");
    ctx.sfx?.tick();
    await sleep(850);
  }
  say(v, LINES.hideReady);
  cover.classList.remove("on");
  await sleep(450);
  cover.remove();
}

/** Rounds one and two: she's behind something. Round one, her ears give her away. */
async function seekRound(v, ctx, spots, spot, round) {
  const player = ctx.player;
  const b = boxIn(v.room, spot);
  let peek = null;
  if (round === 1) {
    peek = document.createElement("img");
    peek.className = "mr-peek";
    peek.src = MOCHI_CUTE_URL;
    peek.alt = "";
    // big enough to spot even behind something small like the teddy
    const h = Math.max(b.h * 1.05, v.room.getBoundingClientRect().width * 0.13);
    Object.assign(peek.style, { left: b.cx + "px", top: b.y + b.h * 0.5 - h + "px", height: h + "px", zIndex: String(+spot.style.zIndex - 1) });
    v.things.appendChild(peek);
  }
  await sleep(500);
  say(v, LINES.hideWhere);

  const start = performance.now();
  let hint = null;
  if (round === 2) {
    // a little jiggle now and then, so nobody's stuck
    hint = setInterval(() => {
      if (performance.now() - start > 6000) {
        wiggle(spot);
        ctx.sfx?.boop(1.3);
      }
    }, 4200);
  }
  await new Promise((resolve) => {
    const onClick = (e) => {
      const el = e.target.closest(".mr-item, .mr-peek");
      if (!el) return;
      if (el === spot || el === peek) {
        v.things.removeEventListener("click", onClick);
        resolve();
        return;
      }
      wiggle(el);
      ctx.sfx?.boop(0.85);
      const eb = boxIn(v.room, el);
      floatText(v, eb.cx, eb.y, pick(LINES.hideNot));
    };
    v.things.addEventListener("click", onClick);
  });
  clearInterval(hint);
  peek?.remove();

  // pop out from behind it
  const sb = boxIn(v.room, spot);
  const rr = v.room.getBoundingClientRect();
  const out = mochiInRoom(v.things, player, {
    x: sb.cx / rr.width, y: (sb.y + sb.h * 0.62) / rr.height, h: Math.max(11, (sb.h / rr.width) * 100 * 1.1), cls: "mr-popout"
  });
  out.style.zIndex = String(+spot.style.zIndex + 1);
  ctx.sfx?.chirp();
  for (let i = 0; i < 6; i++) setTimeout(() => heart(v, rr.left + sb.cx + (Math.random() - 0.5) * sb.w, rr.top + sb.y), i * 80);
  say(v, fillName(LINES.hideFound[round - 1], player));
  await sleep(2400);
  out.remove();
}

/** Round three: she isn't hiding behind anything. */
async function wrongRound(v, ctx, spots) {
  const player = ctx.player;
  // the back corner with the least in front of it
  const crowd = (cx) => spots.concat([...v.things.querySelectorAll(".mr-item")])
    .filter((el) => Math.abs(+el.dataset.x - cx) < 0.13 && +el.dataset.y < 0.82).length;
  const cx = crowd(0.165) <= crowd(0.835) ? 0.165 : 0.835;
  const corner = mochiInRoom(v.things, player, { x: cx, y: 0.66, h: 8.5, back: true, cls: "mr-corner" });
  corner.style.zIndex = crowd(cx) ? "200" : "9";
  await sleep(500);
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
      if (!el) return;
      misses++;
      clicked.add(el.dataset.id);
      lastClick = performance.now();
      wiggle(el);
      if (misses <= 2) {
        // the first two times she still giggles from somewhere. then she stops.
        ctx.sfx?.boop(0.85);
        const eb = boxIn(v.room, el);
        floatText(v, eb.cx, eb.y, pick(LINES.hideNot));
      }
      if (misses === 2) setTimeout(() => say(v, ""), 900);
    };
    const timer = setInterval(() => {
      const now = performance.now();
      const triedAll = clicked.size >= spots.length;
      if (now - start > 26000 || (triedAll && now - lastClick > 6000)) finish();
    }, 250);
    function finish() {
      clearInterval(timer);
      v.things.removeEventListener("click", onClick);
      resolve();
    }
    v.things.addEventListener("click", onClick);
  });
  player.cornerFound = clickedHer;

  if (!clickedHer) {
    say(v, fillName(LINES.hideCall, player));
    await sleep(2200);
  } else {
    say(v, "");
  }
  await sleep(1300); // she doesn't move
  setFacing(corner, player, false); // and then she's facing you
  say(v, LINES.hideFoundYou);
  await sleep(2800);
  corner.remove();
}
