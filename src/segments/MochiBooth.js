// Act VII: photo booth. The world has gone 1-bit (look 4). Mochi can't see
// anymore (the eyes, at the end of Lights Out), but she's cute again, and
// she has an idea: take pictures for her, so she'll always have your face.
//
//   booth     a four-frame strip, full screen. You pose (smile, silly, scared,
//             look right into the camera); she counts down; flash. The live
//             preview never shows anything wrong. The prints do: frame by
//             frame, something is standing behind you, closer each time, and
//             they develop on the strip while you pose for the next one. When
//             the last one has developed, for a moment it's your own face,
//             ruined. Then she asks how they came out, because she can't see.
//   stickers  decorate the strip (she can't, so you do). Stickers stick
//             anywhere except on the thing behind you: there they peel off
//             and fall. Then she puts the strip "on the fridge" next to your
//             polaroid from Act I, and in that one, faintly, it's behind you too.
//
// The figure is the director's (prepareFigureImage), so the one in the photos
// is the one that comes for you later. It's composited by the feed renderer,
// behind you (your body occludes it), only for the frames under the flash.
//
// Saved: player.booth = { frames, figs, answer, stickers, peeled }.

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { giggle } from "../mochi/Giggle.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { woundsNow } from "../mochi/wounds.js";
import { settings } from "../settings.js";
import { build, show, hide, say, bounce, heart, sleep, pick } from "./MochiPlay.js";

const W = 640, H = 480;
const POSES = [
  { key: "boothSmile", wait: "smile", step: 0 },
  { key: "boothSilly", wait: null, step: 2 },
  { key: "boothScared", wait: null, step: 3.5, warp: { eyesBlack: 1, eyeScale: 0.3 } },
  { key: "boothStill", wait: "still", step: 5, gore: true }
];

const frame = () => new Promise((r) => requestAnimationFrame(r));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

function setup(ctx, mode) {
  const v = build(ctx);
  v.root.classList.add("booth", mode);
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
function flickers(img, url, every = [3800, 7600]) {
  let t = null;
  const tick = () => {
    if (!img.isConnected) return;
    const src = img.getAttribute("src");
    img.src = url;
    setTimeout(() => { if (img.isConnected) img.src = src; }, 55);
    t = setTimeout(tick, every[0] + Math.random() * (every[1] - every[0]));
  };
  t = setTimeout(tick, 1500 + Math.random() * 2500);
  return () => clearTimeout(t);
}

/** The feed, mirrored (like a mirror, like the feed on screen), into a W×H canvas. */
function grab(ctx, into = null) {
  const c = into || Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = c.getContext("2d");
  const src = ctx.feed?.canvas;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (src?.width) {
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0, W, H);
    g.restore();
  }
  return c;
}

/** Your face, ruined (FaceGore), mirrored to match the photo. Null without a face. */
function goreShot(ctx) {
  const video = ctx.getVideo?.(), kp = ctx.getFace?.()?.keypoints;
  if (!ctx.faceGore || !video?.videoWidth || !kp) return null;
  const raw = document.createElement("canvas");
  raw.width = video.videoWidth;
  raw.height = video.videoHeight;
  raw.getContext("2d").drawImage(video, 0, 0);
  const g = document.createElement("canvas");
  if (!ctx.faceGore.render(raw, kp, { target: g })) return null;
  const out = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const o = out.getContext("2d");
  o.translate(W, 0);
  o.scale(-1, 1);
  o.drawImage(g, 0, 0, W, H);
  return out;
}

/** Wait until `pred` has held for holdMs, or give up after ms. */
const held = (pred, holdMs, ms) => new Promise((resolve) => {
  const t0 = performance.now();
  let since = null;
  const tick = () => {
    const now = performance.now();
    if (pred()) since ??= now; else since = null;
    if ((since && now - since >= holdMs) || now - t0 > ms) return resolve(!!since && now - since >= holdMs);
    requestAnimationFrame(tick);
  };
  tick();
});

// ================================================================ the booth

export async function runBooth(ctx) {
  const v = setup(ctx, "shoot");
  const player = ctx.player;
  const feed = ctx.feed;
  // the figure that's been waiting all game; the director uses the same one later
  const figImage = ctx.director?.prepareFigureImage?.();
  if (figImage) feed?.setFigureImage(figImage);
  feed?.setBaseWarp({ oneBit: 1, pixel: 2, grain: 0.12, vignette: 0.3, bgDark: 0.04 });

  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="pb-stage">
      <div class="pb-booth">
        <div class="pb-preview"><canvas width="${W}" height="${H}"></canvas><div class="pb-count"></div><div class="pb-pose"></div></div>
        <div class="pb-strip">${POSES.map((_, i) => `<div class="pb-frame" data-i="${i}"><canvas width="${W}" height="${H}"></canvas></div>`).join("")}
          <div class="pb-strip-foot">${fillName("{name}", player)} ♡ mochi</div></div>
      </div>
    </div>`);
  // Mochi sits on the corner of the booth, like a sticker
  const stage = v.root.querySelector(".pb-preview");
  stage.appendChild(v.wrap);
  const preview = stage.querySelector("canvas"), count = stage.querySelector(".pb-count"), pose = stage.querySelector(".pb-pose");
  const frames = [...v.root.querySelectorAll(".pb-frame")];
  const stopFlicker = flickers(v.mochi, woundsNow(7) || "/mochi/wounds-eyes.webp");

  let live = true;
  (async () => { while (live) { grab(ctx, preview); await frame(); } })();

  show(v);
  bounce(v);
  await talk(v, ctx, [LINES.boothAsk, LINES.boothRules], 1800);

  const shots = [], figs = [];
  let goreCanvas = null;
  for (let i = 0; i < POSES.length; i++) {
    const p = POSES[i];
    say(v, LINES[p.key]);
    pose.textContent = LINES.boothPose[i];
    ctx.sfx?.pop();
    await sleep(1600);
    // wait for the pose, a little (nobody gets stuck)
    const face = () => ctx.getFace?.();
    if (p.wait === "smile") await held(() => (face()?.channels?.smile ?? 0) > 0.32, 350, 4500);
    else if (p.wait === "still") await held(() => face()?.faceVisible && face()?.eyesOpen !== false && !face()?.lookingAway, 900, 4500);
    else await sleep(1300);
    for (const n of ["3", "2", "1"]) {
      count.textContent = n;
      count.classList.remove("pop"); void count.offsetWidth; count.classList.add("pop");
      ctx.sfx?.tick();
      await sleep(720);
    }
    count.textContent = "";

    // flash. under it (and only under it) something is standing behind you
    const fig = p.step && figImage ? ctx.director.figureAt(p.step, face()) : null;
    const flash = document.createElement("div");
    flash.className = "mp-flash" + (settings.reduceFlashing ? " calm" : "");
    v.root.appendChild(flash);
    setTimeout(() => flash.remove(), 1300);
    ctx.sfx?.shutter();
    if (fig) feed.setFigure(fig);
    if (p.warp) feed.burst({ oneBit: 1, pixel: 2, ...p.warp }, 220);
    await frame(); await frame(); await frame();
    const shot = grab(ctx);
    if (p.gore) goreCanvas = goreShot(ctx);
    feed.setFigure(null);
    shots.push(shot);
    figs.push(fig ? fig.rect : null);

    // it develops on the strip while you get ready for the next one
    const slot = frames[i];
    slot.querySelector("canvas").getContext("2d").drawImage(shot, 0, 0);
    slot.classList.add("dev");
    pose.textContent = "";
    await sleep(900);
    const after = LINES.boothAfter[i];
    if (after) { say(v, fillName(after, player)); ctx.sfx?.tick(); }
    if (i === 0) giggle.happy(0.6);
    if (i === 2) ctx.audio?.breatheBehind?.(0.06);
    await sleep(after ? 2300 : 900);
  }
  live = false;

  // printing: the strip comes out to the middle, big
  say(v, LINES.boothPrint);
  ctx.sfx?.chirp();
  v.root.classList.add("printed");
  v.root.querySelector(".pb-booth").appendChild(v.wrap); // she hops over next to it
  await sleep(3600);

  // the last one, for a moment, is you underneath
  if (goreCanvas) {
    const last = frames[3];
    const g = goreCanvas;
    g.className = "pb-gore";
    last.appendChild(g);
    ctx.samples?.play("snap", { gain: 0.6 }) || ctx.audio?.playStinger?.("static", { x: 0, y: 0, z: -0.3 });
    ctx.samples?.play("squelch", { gain: 0.5, delay: 0.04 });
    await sleep(settings.reduceFlashing ? 320 : 170);
    g.remove();
  }
  await sleep(1400);

  // she can't see them
  say(v, LINES.boothAsk2);
  ctx.sfx?.tick();
  v.controls.innerHTML = `<div class="pb-answers">${LINES.boothAnswers.map((a, i) => `<button type="button" class="btn-primary" data-i="${i}">${a}</button>`).join("")}</div>`;
  const answer = await new Promise((resolve) => {
    v.controls.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) resolve(+b.dataset.i);
    });
    setTimeout(() => resolve(2), 30000);
  });
  v.controls.innerHTML = "";
  if (answer === 1) ctx.audio?.breatheBehind?.(0.08);
  if (answer === 0) giggle.happy(0.8);
  await talk(v, ctx, [LINES.boothReply[answer]], 2200);

  stopFlicker();
  player.booth = { frames: shots, figs, answer: ["cute", "someone", "silent"][answer] };
  await hide(v);
}

// ================================================================ stickers

const STROKE = `fill="#fff" stroke="#000" stroke-width="6" stroke-linejoin="round"`;
const STICKERS = [
  { id: "heart", svg: `<path ${STROKE} d="M50 88 C20 66 6 48 6 32 C6 18 17 8 30 8 C39 8 46 13 50 20 C54 13 61 8 70 8 C83 8 94 18 94 32 C94 48 80 66 50 88Z"/>` },
  { id: "star", svg: `<path ${STROKE} d="M50 6 L61.8 36.2 L94 38.2 L69 58.8 L77 90 L50 72.6 L23 90 L31 58.8 L6 38.2 L38.2 36.2 Z"/>` },
  { id: "sparkle", svg: `<path ${STROKE} d="M50 4 Q56 44 96 50 Q56 56 50 96 Q44 56 4 50 Q44 44 50 4Z"/>` },
  { id: "bow", svg: `<path ${STROKE} d="M50 50 L12 24 Q2 50 12 76 Z"/><path ${STROKE} d="M50 50 L88 24 Q98 50 88 76 Z"/><circle ${STROKE} cx="50" cy="50" r="11"/>` },
  { id: "crown", svg: `<path ${STROKE} d="M10 80 L16 30 L34 54 L50 20 L66 54 L84 30 L90 80 Z"/><circle cx="50" cy="66" r="5"/>` },
  { id: "ears", svg: `<ellipse ${STROKE} cx="33" cy="38" rx="12" ry="32"/><ellipse ${STROKE} cx="67" cy="38" rx="12" ry="32"/><ellipse cx="33" cy="40" rx="4" ry="20"/><ellipse cx="67" cy="40" rx="4" ry="20"/><path ${STROKE} d="M10 84 Q50 62 90 84"/>` },
  { id: "flower", svg: `${[0, 72, 144, 216, 288].map((a) => `<circle ${STROKE} cx="${50 + 24 * Math.cos((a - 90) * Math.PI / 180)}" cy="${50 + 24 * Math.sin((a - 90) * Math.PI / 180)}" r="18"/>`).join("")}<circle ${STROKE} cx="50" cy="50" r="13"/>` },
  { id: "bff", svg: `<rect ${STROKE} x="6" y="24" width="88" height="52" rx="26"/><text x="50" y="62" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="32">BFF</text>` },
  { id: "mochi", img: MOCHI_CUTE_URL }
];
const stickerHtml = (s) => s.img
  ? `<img src="${s.img}" alt="" draggable="false" />`
  : `<svg viewBox="0 0 100 100" aria-hidden="true">${s.svg}</svg>`;
const MIN_STICKERS = 3;

export async function runStickers(ctx) {
  const v = setup(ctx, "stickers");
  const player = ctx.player;
  const booth = player.booth || { frames: [], figs: [] };
  const shots = booth.frames.length ? booth.frames : POSES.map(() => grab(ctx));

  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="pb-deco">
      <div class="pb-grid">${shots.map((_, i) => `<div class="pb-photo" data-i="${i}"><canvas width="${W}" height="${H}"></canvas><div class="pb-on"></div></div>`).join("")}</div>
      <div class="pb-fridge"></div>
    </div>`);
  v.root.querySelectorAll(".pb-photo canvas").forEach((c, i) => c.getContext("2d").drawImage(shots[i], 0, 0));
  const grid = v.root.querySelector(".pb-grid");
  const photos = [...grid.querySelectorAll(".pb-photo")];
  v.controls.classList.add("pb-tray-bar");
  v.controls.innerHTML = `
    <div class="pb-tray">${STICKERS.map((s) => `<button type="button" class="pb-pick" data-id="${s.id}">${stickerHtml(s)}</button>`).join("")}</div>
    <div class="pb-tray-side"><p class="mp-hint">${LINES.stickHint}</p><button class="btn-primary pb-done" disabled>all done ♡</button></div>`;
  const tray = v.controls.querySelector(".pb-tray"), done = v.controls.querySelector(".pb-done");
  show(v);
  say(v, fillName(LINES.stickAsk, player));
  ctx.sfx?.chirp();

  // where the thing behind you is in each photo (the photo is mirrored)
  const figBox = (i) => {
    const r = booth.figs?.[i];
    if (!r) return null;
    const [x, y, w, h] = r;
    return { x0: 1 - (x + w) + w * 0.18, x1: 1 - x - w * 0.18, y0: y + h * 0.05, y1: y + h };
  };

  let placed = 0, peeled = 0, selected = null, drag = null;
  const select = (id) => {
    selected = id;
    tray.querySelectorAll(".pb-pick").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
  };
  const place = (id, photo, cx, cy) => {
    const r = photo.getBoundingClientRect();
    const fx = clamp((cx - r.left) / r.width), fy = clamp((cy - r.top) / r.height);
    const s = STICKERS.find((x) => x.id === id);
    const el = document.createElement("span");
    el.className = "pb-stuck";
    el.innerHTML = stickerHtml(s);
    el.style.left = fx * 100 + "%";
    el.style.top = fy * 100 + "%";
    el.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 34)}deg`);
    photo.querySelector(".pb-on").appendChild(el);
    ctx.sfx?.pop();
    const b = figBox(+photo.dataset.i);
    if (b && fx > b.x0 && fx < b.x1 && fy > b.y0 && fy < b.y1) {
      // it won't stick to that
      peeled++;
      setTimeout(() => {
        el.classList.add("peel");
        ctx.sfx?.boop(0.7);
        say(v, fillName(LINES.stickPeel[Math.min(peeled, LINES.stickPeel.length) - 1], player));
        setTimeout(() => el.remove(), 1500);
      }, 650);
      return;
    }
    placed++;
    heart(v, cx, cy - 20, "♡");
    if (placed % 2 === 1) giggle.happy(0.35);
    if (placed === 1 || Math.random() < 0.4) say(v, pick(LINES.stickReact));
    done.disabled = placed < MIN_STICKERS;
  };
  const photoAt = (x, y) => document.elementsFromPoint(x, y).map((n) => n.closest?.(".pb-photo")).find(Boolean) || null;

  tray.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".pb-pick");
    if (!b) return;
    e.preventDefault();
    drag = { id: b.dataset.id, sx: e.clientX, sy: e.clientY, ghost: null };
  });
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  function onMove(e) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
      drag.ghost = document.createElement("span");
      drag.ghost.className = "pb-ghost";
      drag.ghost.innerHTML = stickerHtml(STICKERS.find((s) => s.id === drag.id));
      v.root.appendChild(drag.ghost);
      ctx.sfx?.tick();
    }
    drag.ghost.style.left = e.clientX + "px";
    drag.ghost.style.top = e.clientY + "px";
    photos.forEach((p) => p.classList.toggle("near", p === photoAt(e.clientX, e.clientY)));
  }
  function onUp(e) {
    const d = drag;
    drag = null;
    photos.forEach((p) => p.classList.remove("near"));
    if (!d) return;
    if (!d.ghost) return select(selected === d.id ? null : d.id); // a tap: pick it, then tap a photo
    d.ghost.remove();
    const p = photoAt(e.clientX, e.clientY);
    if (p) place(d.id, p, e.clientX, e.clientY);
  }
  grid.addEventListener("click", (e) => {
    const p = e.target.closest(".pb-photo");
    if (p && selected) place(selected, p, e.clientX, e.clientY);
  });

  await new Promise((resolve) => {
    done.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 150000);
  });
  removeEventListener("pointermove", onMove);
  removeEventListener("pointerup", onUp);
  v.controls.innerHTML = "";
  v.controls.classList.remove("pb-tray-bar");
  booth.stickers = placed;
  booth.peeled = peeled;

  // on the fridge, next to your first picture together
  v.root.classList.add("fridge");
  ctx.sfx?.sparkle();
  giggle.happy(0.7);
  say(v, LINES.stickFridge);
  const pol = player.polaroid?.cute;
  const fridge = v.root.querySelector(".pb-fridge");
  if (pol) {
    fridge.innerHTML = `<div class="pb-pol"><canvas width="${pol.width}" height="${pol.height}"></canvas><canvas class="pb-pol-fig" width="${pol.width}" height="${pol.height}"></canvas><div class="pb-pol-cap">${fillName("{name}", player)} &amp; mochi ♡ best friends</div></div>`;
    const cs = fridge.querySelectorAll("canvas");
    cs[0].getContext("2d").drawImage(pol, 0, 0);
    // ...and it was there the whole time
    const fig = ctx.director?.prepareFigureImage?.();
    if (fig) {
      const g = cs[1].getContext("2d"), pw = pol.width, ph = pol.height;
      const nose = player.polaroid?.keypoints?.nose?.x;
      const faceX = nose != null ? 1 - nose : 0.4; // the polaroid is mirrored
      const fh = ph * 0.92, fw = fh * (fig.width / fig.height);
      const cx = (faceX < 0.5 ? 0.8 : 0.2) * pw;
      g.filter = "grayscale(1) brightness(0.55) contrast(1.4)";
      g.drawImage(fig, cx - fw / 2, ph - fh, fw, fh);
    }
  }
  await sleep(3200);
  if (pol) {
    fridge.classList.add("haunt"); // the figure fades in, slowly
    await sleep(2600);
  }
  await talk(v, ctx, [LINES.stickHappy, LINES.stickHappy2], 2000);
  await hide(v);
}
