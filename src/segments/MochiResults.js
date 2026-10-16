// Act IX: results. Blood red (look 6). The last personality test result,
// the one the whole game has been building to: it knows things the player
// never typed. Still inside Mochi's frame, still a cute mini-game.
//
//   scratch  six scratch-card results, full screen; scratch them off with the
//            cursor. The first three are sweet (your dessert, your friend type,
//            your bunny). Then: your face (one of the memory-game selfies, and
//            how many times you looked away), right now (the real time on your
//            clock and where you are, against the bedtime you told her), and
//            behind you: your room with you taken out of it (works against a
//            plain wall too), and, slowly, someone where you were sitting.
//            One more card is locked: "the last result is inside mochi ♡".
//   open     you kept the scissors from the tea party. A dotted line on her
//            tummy, "cut here ♡". You make the cut yourself; then the unzip
//            scene plays (the stage's next step).
//
// Saved: player.results = { scratched, cut: "you" | "her" }.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { giggle } from "../mochi/Giggle.js";
import { LINES, fillName, FRIEND_LABELS, envInfo, batteryLevel } from "../mochi/MochiLines.js";
import { woundsNow } from "../mochi/wounds.js";
import { MASK_SIZE } from "../vision/Segmenter.js";
import { build, show, hide, say, bounce, heart, sleep, pick, DESSERTS, BUNNIES, bunnyFromDossier } from "./MochiPlay.js";

const CW = 320, CH = 240;     // scratch canvas resolution (CSS scales it)
const MS = MASK_SIZE;
const BRUSH = 30;             // scratch radius, in canvas px
const DONE_AT = 0.52;         // how much has to be scratched before it reveals
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function setup(ctx, mode) {
  const v = build(ctx);
  v.root.classList.add("ix", mode); // ("results" is taken: Act V's results card)
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

/** Now and then, for a frame, she has her newest injury. */
function flickers(img, url) {
  let t = null;
  const tick = () => {
    if (!img.isConnected) return;
    const src = img.getAttribute("src");
    img.src = url;
    setTimeout(() => { if (img.isConnected) img.src = src; }, 55);
    t = setTimeout(tick, 3800 + Math.random() * 4500);
  };
  t = setTimeout(tick, 2000 + Math.random() * 2000);
  return () => clearTimeout(t);
}

/** A mirrored still of the player, right now. */
function snapshot(ctx) {
  const src = ctx.feed?.canvas;
  if (!src?.width) return null;
  const c = Object.assign(document.createElement("canvas"), { width: 320, height: 240 });
  const g = c.getContext("2d");
  g.translate(320, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0, 320, 240);
  try { return c.toDataURL("image/jpeg", 0.8); } catch { return null; }
}

// ================================================================ the cards

function cards(ctx, dossier, summary) {
  const p = ctx.player;
  const said = (id) => dossier.find((d) => d.questionId === id)?.chosenText || null;
  const dessert = DESSERTS[p.dessert] || DESSERTS.daifuku;
  const bunny = BUNNIES[bunnyFromDossier(dossier).top] || BUNNIES.clover;
  const friend = FRIEND_LABELS[p.friend] || "the best kind of friend";

  // your face: one she kept from the memory game (else the polaroid, else now)
  let face = p.selfies?.[0] || null;
  if (!face && p.polaroid?.cute) { try { face = p.polaroid.cute.toDataURL("image/jpeg", 0.8); } catch { /* tainted */ } }
  face ||= snapshot(ctx);
  const st = summary?.stats || {};
  const away = (st.lookAways || 0) + (st.mochiLookAways || 0);

  // right now: the real clock, and what they told her about bedtime
  const env = envInfo(), bat = batteryLevel();
  const now = [`it's ${env.time}${env.where ? ` ${env.where}` : ""}.`];
  if (env.late && said("b2") === "Before midnight.") now.push("you said you go to bed before midnight.");
  else if (env.late) now.push("you should be asleep.");
  else now.push("you're still here.");
  if (bat != null && bat < 50) now.push(`your battery's at ${bat}%.`);

  // behind you: your room, with you taken out of it (needs the person mask)
  const masked = !!ctx.getMask?.();

  return [
    { key: "dessert", title: "your dessert", html: `<b class="rs-glyph">${dessert.glyph}</b><span>${esc(dessert.name)}</span>`, line: LINES.scratchDessert },
    { key: "friend", title: "your friend type", html: `<b class="rs-glyph">🤝</b><span>${esc(friend)}</span>`, line: LINES.scratchFriend },
    { key: "bunny", title: "your bunny", html: `<b class="rs-glyph">${bunny.glyph}</b><span>${esc(bunny.name)}</span>`, line: LINES.scratchBunny },
    { key: "face", title: "your face", html: `${face ? `<img class="rs-photo" src="${face}" alt="" />` : `<b class="rs-glyph">🙂</b>`}<span>${away ? `you looked away ${away} time${away === 1 ? "" : "s"} ♡ mochi counted` : "you never looked away ♡"}</span>`, line: LINES.scratchFace },
    { key: "now", title: "right now", html: `<span class="rs-text">${now.map(esc).join("<br>")}</span>`, line: LINES.scratchNow },
    { key: "behind", title: "behind you", html: `<canvas class="rs-live" width="${CW}" height="${CH}"></canvas><span>${masked ? LINES.scratchBehindCap : LINES.scratchBehindCapPlain}</span>`, line: masked ? LINES.scratchBehind : LINES.scratchBehindPlain, live: true }
  ];
}

/**
 * Your room without you in it, from the camera and the person mask
 * (Segmenter: 128x128, 255 = person). Every frame, the pixels that are room
 * are copied onto a plate. Wherever you've been the whole time, each row is
 * filled in from the nearest room on either side of it (rows you cover
 * edge to edge copy the nearest row above), so a plain wall just becomes more
 * wall. The figure is drawn where you were sitting. Camera space
 * (unmirrored); the card mirrors it with CSS, like the feed.
 */
class EmptyRoom {
  constructor(ctx) {
    this.ctx = ctx;
    this.frame = Object.assign(document.createElement("canvas"), { width: CW, height: CH });
    this.plate = Object.assign(document.createElement("canvas"), { width: CW, height: CH });
    this.fg = this.frame.getContext("2d", { willReadFrequently: true });
    this.out = this.plate.getContext("2d").createImageData(CW, CH);
    this.room = new Uint8ClampedArray(CW * CH * 4); // last seen colour of each room pixel
    this.seen = new Uint8Array(CW * CH);
    this.person = new Uint8Array(CW * CH);          // 1 = you (grown a little), this mask
    this.you = null;                                // where you sit: { cx, top }, fractions of the picture
    this.hasMask = false;
    this._n = 0;
  }

  update() {
    const src = this.ctx.getVideo?.();
    if (!(src?.videoWidth || src?.width)) return;
    if (++this._n % 2) return; // every other frame is plenty
    this.fg.drawImage(src, 0, 0, CW, CH);
    const px = this.fg.getImageData(0, 0, CW, CH).data;
    const m = this.ctx.getMask?.();
    if (m && m !== this._lastMask) this._buildMask(m);
    this.hasMask = !!m;
    const room = this.room, seen = this.seen, person = this.person, out = this.out.data;
    for (let i = 0, j = 0; i < CW * CH; i++, j += 4) {
      if (!this.hasMask || !person[i]) {
        room[j] = px[j]; room[j + 1] = px[j + 1]; room[j + 2] = px[j + 2];
        seen[i] = 1;
      }
    }
    // fill what's never been seen, row by row
    let lastRow = -1;
    for (let y = 0; y < CH; y++) {
      const r0 = y * CW;
      let left = -1, any = false;
      for (let x = 0; x <= CW; x++) {
        const isSeen = x < CW && seen[r0 + x];
        if (isSeen) {
          const j = (r0 + x) * 4;
          out[j] = room[j]; out[j + 1] = room[j + 1]; out[j + 2] = room[j + 2]; out[j + 3] = 255;
          any = true;
          left = x;
          continue;
        }
        if (x < CW && x + 1 <= CW) {
          // find the end of this gap
          let right = x;
          while (right < CW && !seen[r0 + right]) right++;
          const L = left >= 0 ? (r0 + left) * 4 : -1, R = right < CW ? (r0 + right) * 4 : -1;
          for (let k = x; k < right; k++) {
            const j = (r0 + k) * 4;
            if (L >= 0 && R >= 0) {
              const f = (k - left) / (right - left);
              out[j] = room[L] + (room[R] - room[L]) * f;
              out[j + 1] = room[L + 1] + (room[R + 1] - room[L + 1]) * f;
              out[j + 2] = room[L + 2] + (room[R + 2] - room[L + 2]) * f;
            } else if (L >= 0 || R >= 0) {
              const S = L >= 0 ? L : R;
              out[j] = room[S]; out[j + 1] = room[S + 1]; out[j + 2] = room[S + 2];
            } else if (lastRow >= 0) {
              const S = (lastRow * CW + k) * 4; // a row you cover edge to edge: copy the last good one
              out[j] = out[S]; out[j + 1] = out[S + 1]; out[j + 2] = out[S + 2];
            } else {
              out[j] = out[j + 1] = out[j + 2] = 110;
            }
            out[j + 3] = 255;
          }
          x = right - 1;
        }
      }
      if (any) lastRow = y;
    }
    this.plate.getContext("2d").putImageData(this.out, 0, 0);
  }

  _buildMask(m) {
    this._lastMask = m;
    // you, grown by three cells (hair, edges, and the mask lagging the picture a little)
    const grown = new Uint8Array(MS * MS);
    let n = 0, sx = 0, top = MS;
    for (let y = 0; y < MS; y++) {
      for (let x = 0; x < MS; x++) {
        if (m[y * MS + x] <= 100) continue;
        n++; sx += x; if (y < top) top = y;
        for (let dy = -3; dy <= 3; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= MS) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx;
            if (xx >= 0 && xx < MS) grown[yy * MS + xx] = 1;
          }
        }
      }
    }
    for (let y = 0; y < CH; y++) {
      const my = Math.floor((y / CH) * MS) * MS;
      for (let x = 0; x < CW; x++) this.person[y * CW + x] = grown[my + Math.floor((x / CW) * MS)];
    }
    if (n > 60) {
      const you = { cx: sx / n / MS, top: top / MS };
      this.you = this.you ? { cx: this.you.cx * 0.8 + you.cx * 0.2, top: this.you.top * 0.8 + you.top * 0.2 } : you;
    }
  }

  /** The empty room into `g`, the figure where you were at `alpha`, all in blood-red monochrome. */
  draw(g, figure, alpha) {
    g.save();
    g.filter = "grayscale(1) contrast(1.2) brightness(0.9)";
    g.drawImage(this.plate, 0, 0);
    if (figure && alpha > 0.002 && this.you && this.hasMask) {
      const h = (1 - this.you.top) * CH * 1.12;
      const w = h * ((figure.width || 1) / (figure.height || 1));
      g.globalAlpha = alpha;
      g.filter = "grayscale(1) brightness(0.5) contrast(1.3) blur(0.6px)";
      g.drawImage(figure, this.you.cx * CW - w / 2, this.you.top * CH - h * 0.06, w, h);
    }
    g.restore();
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "#e0303a";
    g.fillRect(0, 0, CW, CH);
    g.restore();
  }
}

/** Silver scratch-off coating, with little hearts on it. */
function coat(canvas) {
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.globalCompositeOperation = "source-over";
  const grad = g.createLinearGradient(0, 0, CW, CH);
  grad.addColorStop(0, "#c9c3c6");
  grad.addColorStop(0.45, "#efe9ec");
  grad.addColorStop(0.55, "#d8d1d5");
  grad.addColorStop(1, "#b3abb0");
  g.fillStyle = grad;
  g.fillRect(0, 0, CW, CH);
  g.fillStyle = "rgba(150, 120, 135, 0.35)";
  g.font = "22px Fredoka, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let y = 22; y < CH; y += 44) for (let x = (y / 44) % 2 ? 46 : 22; x < CW; x += 48) g.fillText("♡", x, y);
  g.fillStyle = "rgba(90, 60, 75, 0.75)";
  g.font = "600 30px Fredoka, system-ui, sans-serif";
  g.fillText("scratch me ♡", CW / 2, CH / 2);
  return g;
}

/** How much of the coating is gone (sampled). */
function scratched(g) {
  const d = g.getImageData(0, 0, CW, CH).data;
  let gone = 0, n = 0;
  for (let i = 3; i < d.length; i += 4 * 9) { n++; if (d[i] < 40) gone++; }
  return gone / n;
}

export async function runScratch(ctx, dossier = [], summary = null) {
  const v = setup(ctx, "scratch");
  const player = ctx.player;
  const list = cards(ctx, dossier, summary);
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="rs-board">
      ${list.map((c, i) => `
        <div class="rs-card" data-i="${i}">
          <div class="rs-title">${c.title} ♡</div>
          <div class="rs-face"><div class="rs-under">${c.html}</div><canvas class="rs-coat" width="${CW}" height="${CH}"></canvas></div>
        </div>`).join("")}
    </div>
    <div class="rs-final"><div class="rs-title">the real you ♡</div><div class="rs-lock"><b>♡</b><span>${LINES.scratchLocked}</span></div></div>`);
  const els = [...v.root.querySelectorAll(".rs-card")];
  const state = els.map((el, i) => ({ el, card: list[i], canvas: el.querySelector(".rs-coat"), g: null, done: false, moves: 0 }));
  state.forEach((s) => { s.g = coat(s.canvas); });
  const stopFlicker = flickers(v.mochi, woundsNow(9) || "/mochi/wounds-eyes.webp");
  show(v);
  bounce(v);
  await talk(v, ctx, [LINES.scratchAsk, LINES.scratchRules], 1900);

  // the "behind you" card: the empty room builds up from the start of the
  // scene (so it's ready by the time they get to it), drawn once uncovered
  let live = true, revealedAt = 0;
  const liveCanvas = v.root.querySelector(".rs-live");
  const behindState = state.find((s) => s.card.live);
  const room = new EmptyRoom(ctx);
  const figure = ctx.director?.prepareFigureImage?.() || null;
  (async () => {
    const lg = liveCanvas?.getContext("2d");
    while (live && lg) {
      room.update();
      if (behindState.done) {
        if (!revealedAt) revealedAt = performance.now();
        // nothing for a few seconds; then, very slowly, someone where you were
        const t = (performance.now() - revealedAt) / 1000;
        room.draw(lg, figure, clamp((t - 4) / 10) * 0.36);
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
  })();

  // scratching
  let drag = null, revealedCount = 0, lastScratchSfx = 0;
  const reveal = async (s) => {
    if (s.done) return;
    s.done = true;
    revealedCount++;
    s.el.classList.add("revealed");
    ctx.sfx?.sparkle();
    const r = s.el.getBoundingClientRect();
    if (revealedCount <= 3) { heart(v, r.left + r.width / 2, r.top + r.height * 0.3, "♡"); giggle.happy(0.5); }
    say(v, fillName(s.card.line, player));
  };
  const scratchAt = (s, e) => {
    const r = s.canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CW, y = ((e.clientY - r.top) / r.height) * CH;
    const g = s.g;
    g.globalCompositeOperation = "destination-out";
    g.lineCap = "round";
    g.lineWidth = BRUSH * 2;
    g.beginPath();
    if (drag?.s === s && drag.x != null) g.moveTo(drag.x, drag.y); else g.moveTo(x, y);
    g.lineTo(x + 0.01, y);
    g.stroke();
    if (drag) { drag.x = x; drag.y = y; }
    const now = performance.now();
    if (now - lastScratchSfx > 90) { lastScratchSfx = now; ctx.sfx?.tick(); }
    if (++s.moves % 6 === 0 && scratched(g) >= DONE_AT) reveal(s);
  };
  const stateAt = (e) => state.find((s) => !s.done && s.canvas === e.target.closest?.(".rs-coat"));
  const onDown = (e) => {
    const s = stateAt(e);
    if (!s) return;
    e.preventDefault();
    drag = { s, x: null, y: null };
    scratchAt(s, e);
  };
  const onMove = (e) => {
    if (!drag) return;
    const s = stateAt(e);
    if (!s) { drag.x = null; return; }
    if (s !== drag.s) drag = { s, x: null, y: null };
    scratchAt(s, e);
  };
  const onUp = () => { drag = null; };
  v.root.addEventListener("pointerdown", onDown);
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);

  await new Promise((resolve) => {
    const t0 = performance.now();
    let nudged = false;
    const tick = () => {
      if (!v.root.isConnected) return resolve();
      if (state.every((s) => s.done)) return resolve();
      const t = performance.now() - t0;
      if (!nudged && t > 50000) { nudged = true; say(v, LINES.scratchNudge); }
      if (t > 110000) { state.forEach((s) => { s.el.classList.add("auto"); reveal(s); }); return resolve(); } // nobody gets stuck
      setTimeout(tick, 250);
    };
    tick();
  });
  v.root.removeEventListener("pointerdown", onDown);
  removeEventListener("pointermove", onMove);
  removeEventListener("pointerup", onUp);
  await sleep(3200);

  // the last one is locked
  v.root.classList.add("final");
  ctx.sfx?.tick();
  await sleep(900);
  await talk(v, ctx, [LINES.scratchLast, LINES.scratchInside], 2000);
  live = false;
  stopFlicker();
  player.results = { ...(player.results || {}), scratched: revealedCount };
  await hide(v);
}

// ================================================================ the cut

const SCISSORS = `<svg viewBox="0 0 200 140" aria-hidden="true">
  <path class="blade" d="M96 70 L196 26 L190 18 L84 62 Z"/><path class="blade" d="M96 70 L196 114 L190 122 L84 78 Z"/>
  <circle class="ring" cx="44" cy="36" r="26"/><circle class="ring" cx="44" cy="104" r="26"/>
  <path class="ring" d="M66 46 L96 66 M66 94 L96 74"/><circle class="pin" cx="92" cy="70" r="6"/>
</svg>`;
// the line on her tummy, in fractions of her picture (the belly wound is centred about here)
const LINE = { x: 0.51, y0: 0.78, y1: 0.94 }; // below the neck piece

export async function runOpen(ctx) {
  const v = setup(ctx, "open");
  const player = ctx.player;
  v.body.insertAdjacentHTML("beforeend", `
    <svg class="rs-cutline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line class="dots" x1="${LINE.x * 100}" y1="${LINE.y0 * 100}" x2="${LINE.x * 100}" y2="${LINE.y1 * 100}" />
      <line class="cut" x1="${LINE.x * 100}" y1="${LINE.y0 * 100}" x2="${LINE.x * 100}" y2="${LINE.y0 * 100}" />
    </svg>
    <span class="rs-cuthere" style="left:${(LINE.x + 0.06) * 100}%;top:${LINE.y0 * 100}%">✂ cut here ♡</span>`);
  const cutLine = v.body.querySelector(".rs-cutline .cut"), tag = v.body.querySelector(".rs-cuthere");
  const sc = document.createElement("div");
  sc.className = "rs-scissors";
  sc.innerHTML = SCISSORS;
  v.root.appendChild(sc);
  show(v);
  await talk(v, ctx, [player.tea?.scissors ? LINES.openKept : LINES.openNoScissors, LINES.openAsk], 2000);
  say(v, LINES.openHint);
  v.root.classList.add("cutting");

  // cut by dragging down the line (or clicking along it); it only goes forward
  let progress = 0, pressed = false, lastSnip = 0, snips = 0;
  const box = () => v.body.getBoundingClientRect();
  const onLine = (e) => {
    const b = box();
    const fx = (e.clientX - b.left) / b.width, fy = (e.clientY - b.top) / b.height;
    return Math.abs(fx - LINE.x) < 0.09 && fy > LINE.y0 - 0.06 && fy < LINE.y1 + 0.06 ? clamp((fy - LINE.y0) / (LINE.y1 - LINE.y0)) : null;
  };
  const advance = (to) => {
    if (to <= progress) return;
    progress = Math.min(1, to);
    cutLine.setAttribute("y2", String((LINE.y0 + (LINE.y1 - LINE.y0) * progress) * 100));
    tag.style.top = (LINE.y0 + (LINE.y1 - LINE.y0) * progress) * 100 + "%";
    if (progress - lastSnip >= 0.14 || progress === 1) {
      lastSnip = progress;
      snips++;
      ctx.samples?.play("snap", { gain: 0.22, rate: 1.3 }) || ctx.sfx?.tick();
      sc.classList.remove("snip"); void sc.offsetWidth; sc.classList.add("snip");
      if (snips === 2) say(v, LINES.openGood);
    }
  };
  const move = (e) => {
    sc.style.left = e.clientX + "px";
    sc.style.top = e.clientY + "px";
    if (!pressed) return;
    const t = onLine(e);
    // drag along it: allow small steps past where the cut has reached
    if (t != null && t <= progress + 0.2) advance(t);
  };
  const down = (e) => {
    pressed = true;
    const t = onLine(e);
    if (t != null) advance(Math.min(progress + 0.25, Math.max(progress, t))); // a click snips a bit further
    move(e);
  };
  const up = () => { pressed = false; };
  const key = (e) => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); advance(progress + 0.25); } };
  addEventListener("pointermove", move);
  v.root.addEventListener("pointerdown", down);
  addEventListener("pointerup", up);
  addEventListener("keydown", key);

  const cut = await new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (progress >= 1) return resolve("you");
      if (performance.now() - t0 > 30000) return resolve("her");
      setTimeout(tick, 120);
    };
    tick();
  });
  removeEventListener("pointermove", move);
  v.root.removeEventListener("pointerdown", down);
  removeEventListener("pointerup", up);
  removeEventListener("keydown", key);
  v.root.classList.remove("cutting");
  if (cut === "her") {
    // she does it herself
    say(v, LINES.openHerself);
    await sleep(1800);
    for (let p = progress; p < 1; p += 0.2) { advance(p + 0.2); await sleep(260); }
    advance(1);
  }
  player.results = { ...(player.results || {}), cut };
  await sleep(700);
  giggle.happy(1);
  say(v, fillName(LINES.openThanks, player));
  await sleep(2400);
  sc.remove();
  await hide(v);
}
