// Act IV: Mochi's birthday. Full screen, still pink, but draining step by
// step (the stage's `drift`). Everything odd here has an innocent
// explanation, and Mochi always has it ready:
//   cake     frost + decorate her cake; she doesn't remember how old she is;
//            blow out the candles into the mic; one relights ("trick candle!!")
//   invite   type in friends to invite; then the party table, the clock
//            spinning, the balloons drooping... nobody comes. "mochi has you ♡"
//   pinbow   pin the bow on mochi, blindfolded. she moves. then: "boo!! ♡"
//   gift     her present to herself: a sewing kit. "mochi should be quiet now ♡"
//            -> the stitches scene comes straight after
//
// Saved for later: player.frosting, player.guests (Tea Party fills their
// chairs), player.blewOut (did they really blow, or press the button).

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";
import { LINES, fillName } from "../mochi/MochiLines.js";
import { build, show, hide, say, sayPersonal, bounce, heart, sleep, pick } from "./MochiPlay.js";

const P = (n) => `/party/${n}.svg`;

function setup(ctx, mode) {
  const v = build(ctx);
  v.root.classList.add("party", mode);
  v.root.insertAdjacentHTML("afterbegin", `<div class="pt-bg"><div class="pt-bunting"></div><div class="pt-table-top"></div></div>`);
  return v;
}

function lines(key, player) {
  const l = LINES[key];
  return fillName(Array.isArray(l) ? pick(l) : l, player);
}

async function talk(v, ctx, keys, gap = 2300) {
  for (const k of keys) {
    const text = fillName(LINES[k] ?? k, ctx.player);
    say(v, text);
    if (text !== "...") ctx.sfx?.pop();
    await sleep(text === "..." ? 1500 : gap + Math.min(1600, text.length * 22));
  }
}

function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// ================================================================ the cake

export const FROSTINGS = {
  strawberry: { label: "strawberry", color: "#ffb3d1", dark: "#f28fb8" },
  vanilla: { label: "vanilla", color: "#fff1d6", dark: "#f1d9ad" },
  chocolate: { label: "chocolate", color: "#a86c58", dark: "#8a5444" },
  matcha: { label: "matcha", color: "#c3e6b4", dark: "#9fd28b" }
};
const TOPPINGS = ["🍓", "💗", "⭐", "🍒", "🌸"];
// cake coordinates (viewBox 400 x 380): fronts of the two tiers, and nice spots on them
const TIERS = [{ x0: 58, x1: 342, y0: 238, y1: 326 }, { x0: 114, x1: 286, y0: 136, y1: 200 }];
const PRESETS = [[92, 268], [150, 296], [200, 266], [250, 296], [308, 268], [132, 166], [200, 178], [268, 166], [175, 312], [225, 312]];
const CANDLES = [160, 200, 240];

function drips(x0, x1, y, depthSeed) {
  const r = 22, w = (x1 - x0) / Math.round((x1 - x0) / 30);
  let d = `M${x0} ${y + r} Q${x0} ${y} ${x0 + r} ${y} H${x1 - r} Q${x1} ${y} ${x1} ${y + r} V${y + 26}`;
  let i = 0;
  for (let x = x1; x > x0 + 1; x -= w) {
    const deep = [16, 34, 12, 28, 20, 38, 14][(i + depthSeed) % 7];
    d += ` Q${x - w / 2} ${y + 26 + deep * 1.4} ${x - w} ${y + 26}`;
    i++;
  }
  return d + " Z";
}

export function cakeSvg(frostId = "strawberry") {
  const f = FROSTINGS[frostId] || FROSTINGS.strawberry;
  const O = 'stroke="#b0688a" stroke-width="4" stroke-linejoin="round"';
  return `<svg viewBox="0 0 400 380" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="200" cy="342" rx="192" ry="28" fill="#fff" ${O}/>
    <rect x="44" y="206" width="312" height="132" rx="26" fill="#f6d7b0" ${O}/>
    <rect x="48" y="282" width="304" height="10" fill="#ffb3d1" opacity="0.8"/>
    <path class="frost" d="${drips(40, 360, 198, 0)}" fill="${f.color}" ${O}/>
    <rect x="104" y="112" width="192" height="100" rx="20" fill="#f6d7b0" ${O}/>
    <path class="frost" d="${drips(98, 302, 104, 3)}" fill="${f.color}" ${O}/>
    <path d="M118 112 Q140 106 170 108" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
  </svg>`;
}

function setFrosting(cake, frostId) {
  const f = FROSTINGS[frostId];
  cake.querySelectorAll(".frost").forEach((p) => p.setAttribute("fill", f.color));
}

function candleHtml(x) {
  return `<span class="pt-candle" style="left:${(x / 400) * 100}%;top:${(104 / 380) * 100}%">
    <span class="pt-stick"></span><span class="pt-flame"></span><span class="pt-smoke"></span></span>`;
}

export async function runCake(ctx) {
  const v = setup(ctx, "cake");
  const player = ctx.player;
  v.controls.insertAdjacentHTML("beforebegin", `<div class="pt-stage"><div class="pt-cake">${cakeSvg()}<div class="pt-tops"></div><div class="pt-candles"></div></div></div>`);
  const cake = v.root.querySelector(".pt-cake"), tops = cake.querySelector(".pt-tops"), candles = cake.querySelector(".pt-candles");
  show(v);
  bounce(v);
  ctx.sfx?.chirp();
  say(v, lines("cakeAsk", player));
  await sleep(2200);

  // 1. frosting
  say(v, LINES.cakeFrost);
  v.controls.innerHTML = `<div class="pt-row">${Object.entries(FROSTINGS).map(([id, f]) =>
    `<button class="pt-chip" data-id="${id}"><span class="pt-swatch" style="background:${f.color};border-color:${f.dark}"></span>${f.label}</button>`).join("")}</div>`;
  player.frosting = await new Promise((resolve) => {
    let picked = null, done = null;
    v.controls.querySelectorAll(".pt-chip").forEach((b) => b.addEventListener("click", () => {
      picked = b.dataset.id;
      setFrosting(cake, picked);
      retrigger(cake, "pt-squish");
      ctx.sfx?.boop(1.1);
      v.controls.querySelectorAll(".pt-chip").forEach((x) => x.classList.toggle("picked", x === b));
      say(v, LINES.cakeFrostReact[picked]);
      if (!done) {
        v.controls.insertAdjacentHTML("beforeend", `<button class="btn-primary pt-next">perfect!! ♡</button>`);
        done = v.controls.querySelector(".pt-next");
        done.addEventListener("click", () => resolve(picked), { once: true });
      }
    }));
    setTimeout(() => resolve(picked || "strawberry"), 45000);
  });
  setFrosting(cake, player.frosting);

  // 2. toppings: pick one, then tap the cake (or tap the topping again to drop it somewhere nice)
  say(v, LINES.cakeTop);
  v.controls.innerHTML = `<div class="pt-row">${TOPPINGS.map((t, i) =>
    `<button class="pt-chip pt-top-btn${i ? "" : " picked"}" data-t="${t}"><span class="pt-glyph">${t}</span></button>`).join("")}
    <button class="btn-primary pt-next" disabled>done!! ♡</button></div><p class="mp-hint">${LINES.cakeTopHint}</p>`;
  let current = TOPPINGS[0], placed = 0, nextPreset = 0;
  const next = v.controls.querySelector(".pt-next");
  const addTop = (x, y) => {
    if (placed >= 14) return;
    const t = document.createElement("span");
    t.className = "pt-top";
    t.textContent = current;
    t.style.left = (x / 400) * 100 + "%";
    t.style.top = (y / 380) * 100 + "%";
    t.style.rotate = `${(Math.random() - 0.5) * 30}deg`;
    tops.appendChild(t);
    placed++;
    ctx.sfx?.pop();
    next.disabled = placed < 3;
    if (placed === 3) say(v, LINES.cakeTopMore);
  };
  v.controls.querySelectorAll(".pt-top-btn").forEach((b) => b.addEventListener("click", () => {
    const again = current === b.dataset.t;
    current = b.dataset.t;
    v.controls.querySelectorAll(".pt-top-btn").forEach((x) => x.classList.toggle("picked", x === b));
    if (again) addTop(...PRESETS[nextPreset++ % PRESETS.length]);
  }));
  cake.addEventListener("click", (e) => {
    const r = cake.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 400, y = ((e.clientY - r.top) / r.height) * 380;
    const tier = TIERS.find((t) => x > t.x0 && x < t.x1 && y > t.y0 && y < t.y1);
    if (tier) addTop(x, y);
    else addTop(...PRESETS[nextPreset++ % PRESETS.length]);
  });
  await new Promise((resolve) => {
    next.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 60000);
  });
  while (placed < 3) addTop(...PRESETS[nextPreset++ % PRESETS.length]);
  v.controls.innerHTML = "";
  bounce(v);
  ctx.sfx?.sparkle();
  heartsOver(v, cake, 8);
  await sayPersonal(v, ctx, "cake", lines("cakeDone", player), { answer: `${FROSTINGS[player.frosting].label} frosting, ${placed} toppings` });
  await sleep(2400);

  // 3. candles. how old is she? she doesn't know.
  say(v, LINES.cakeAge);
  await sleep(3000);
  say(v, LINES.cakeAge2);
  candles.innerHTML = CANDLES.map(candleHtml).join("");
  candles.querySelectorAll(".pt-candle").forEach((c, i) => setTimeout(() => { c.classList.add("lit"); ctx.sfx?.tick(); }, 300 + i * 350));
  await sleep(2600);

  // 4. blow them out (mic, or hold the button)
  say(v, LINES.cakeBlow);
  const result = await blowOut(v, ctx, [...candles.querySelectorAll(".pt-candle")]);
  player.blewOut = result.usedMic;
  ctx.sfx?.chirp();
  bounce(v);
  say(v, LINES.cakeWish);
  await sleep(2600);

  // ...one of them comes back
  const trick = candles.querySelectorAll(".pt-candle")[1];
  trick.classList.remove("out");
  trick.classList.add("lit", "relit");
  ctx.sfx?.tick();
  say(v, "...");
  await sleep(1600);
  say(v, LINES.cakeTrick);
  await sleep(1800);
  await blowOut(v, ctx, [trick]);
  bounce(v);
  await talk(v, ctx, ["cakeWishMochi", "cakeWishMochi2"]);
  await hide(v);
}

function heartsOver(v, el, n, glyph = "♡") {
  const r = el.getBoundingClientRect();
  for (let i = 0; i < n; i++) setTimeout(() => heart(v, r.left + r.width * (0.15 + Math.random() * 0.7), r.top + r.height * 0.25, glyph), i * 70);
}

/**
 * Wait until every candle is out. Blowing into the mic leans the flames and
 * puts them out one by one; holding the button does the same (for no mic,
 * or for anyone who'd rather not).
 */
async function blowOut(v, ctx, list) {
  v.controls.innerHTML = `<button class="pt-blow" type="button">💨 ${LINES.cakeBlowHold}</button><p class="mp-hint">${LINES.cakeBlowHint}</p>`;
  const btn = v.controls.querySelector(".pt-blow");
  let holding = false;
  const down = (e) => { e.preventDefault(); holding = true; btn.classList.add("on"); };
  const up = () => { holding = false; btn.classList.remove("on"); };
  const keyDown = (e) => { if (e.code === "Space") { e.preventDefault(); holding = true; btn.classList.add("on"); } };
  const keyUp = (e) => { if (e.code === "Space") up(); };
  btn.addEventListener("pointerdown", down);
  addEventListener("pointerup", up);
  addEventListener("keydown", keyDown);
  addEventListener("keyup", keyUp);

  const base = ctx.getMic?.()?.rms ?? 0.01;
  let floor = Math.max(0.008, base), strong = 0, usedMic = false, last = performance.now();
  const lit = list.filter((c) => !c.classList.contains("out"));
  await new Promise((resolve) => {
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const mic = ctx.getMic?.();
      const rms = mic?.rms ?? 0;
      // our own slow floor, frozen while they're blowing so a long blow still counts
      const loud = rms > floor + 0.06 && rms > floor * 2.6;
      if (!loud) floor = floor * 0.98 + rms * 0.02;
      const level = holding ? 1 : Math.max(0, Math.min(1, (rms - floor) / 0.12));
      lit.forEach((c) => c.style.setProperty("--lean", (level * 34 + (Math.random() - 0.5) * level * 10).toFixed(1) + "deg"));
      if (holding || loud) {
        strong += dt;
        if (loud && !holding) usedMic = true;
      } else strong = Math.max(0, strong - dt * 0.5);
      if (strong > 0.45 && lit.length) {
        const c = lit.shift();
        c.classList.remove("lit");
        c.classList.add("out");
        ctx.sfx?.boop(0.7);
        strong = 0.15;
      }
      if (!lit.length) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  removeEventListener("pointerup", up);
  removeEventListener("keydown", keyDown);
  removeEventListener("keyup", keyUp);
  v.controls.innerHTML = "";
  return { usedMic };
}

// ================================================================ invitations, and nobody comes

function cleanName(s) {
  return String(s || "").replace(/[<>{}\n\r\t]/g, "").trim().slice(0, 16);
}

export async function runInvite(ctx) {
  const v = setup(ctx, "invite");
  const player = ctx.player;
  show(v);
  bounce(v);
  ctx.sfx?.chirp();
  say(v, lines("inviteAsk", player));
  v.controls.innerHTML = `
    <form class="pt-invite">
      <div class="pt-card-row">${[1, 2, 3].map((i) => `
        <label class="pt-invite-card"><span>💌</span>
          <input type="text" maxlength="16" autocomplete="off" placeholder="friend ${i}" aria-label="friend ${i}" /></label>`).join("")}
      </div>
      <div class="pt-row">
        <button type="submit" class="btn-primary">send invites ♡</button>
        <button type="button" class="pt-chip pt-nobody">${LINES.inviteNobodyBtn}</button>
      </div>
    </form>`;
  const form = v.controls.querySelector("form");
  const inputs = [...form.querySelectorAll("input")];
  setTimeout(() => inputs[0].focus(), 60);
  inputs.forEach((i) => i.addEventListener("input", () => ctx.sfx?.tick()));
  player.guests = await new Promise((resolve) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      resolve([...new Set(inputs.map((i) => cleanName(i.value)).filter(Boolean))]);
    });
    form.querySelector(".pt-nobody").addEventListener("click", () => resolve([]));
    setTimeout(() => resolve(inputs.map((i) => cleanName(i.value)).filter(Boolean)), 90000);
  });
  v.controls.innerHTML = "";
  ctx.sfx?.sparkle();
  if (player.guests.length) {
    // the invitations fly off
    for (let i = 0; i < player.guests.length; i++) {
      const env = document.createElement("span");
      env.className = "pt-envelope";
      env.textContent = "💌";
      env.style.left = 30 + i * 20 + "%";
      env.style.animationDelay = i * 0.18 + "s";
      v.root.appendChild(env);
      setTimeout(() => env.remove(), 2200);
    }
    say(v, fillName(LINES.inviteSent, player).replace("{n}", player.guests.length));
  } else say(v, fillName(LINES.inviteNobody, player));
  await sleep(2800);
  await hide(v);
  await runWaiting(ctx);
}

/** The party table. The clock spins. The balloons sink. Nobody comes. */
async function runWaiting(ctx) {
  const player = ctx.player;
  const v = setup(ctx, "table");
  const guests = player.guests?.length ? player.guests : ["", ""];
  // seats: guests either side, mochi in the middle
  const half = Math.ceil(guests.length / 2);
  const order = [...guests.slice(0, half).map((g) => ({ g })), { mochi: true }, ...guests.slice(half).map((g) => ({ g }))];
  const n = order.length, step = Math.min(0.22, 0.78 / Math.max(1, n - 1));
  const balloons = ["pink", "lav", "mint"];
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="pt-room">
      <div class="pt-clock"><img src="${P("clock-face")}" alt="" /><span class="pt-hand h"></span><span class="pt-hand m"></span></div>
      ${order.map((s, i) => {
        const x = 0.5 + (i - (n - 1) / 2) * step;
        return `<div class="pt-seat${s.mochi ? " mochi" : ""}" style="left:${x * 100}%">
          ${s.mochi ? "" : `<img class="pt-balloon" src="${P("balloon-" + balloons[i % 3])}" alt="" style="--d:${i * 0.4}s" />`}
          <img class="pt-chair" src="${P("chair")}" alt="" />
          ${s.mochi ? `<img class="pt-sitter" src="${MOCHI_CUTE_URL}" alt="" />` : ""}
        </div>`;
      }).join("")}
      <div class="pt-table">
        ${order.map((s, i) => {
          const x = 0.5 + (i - (n - 1) / 2) * step;
          return `<div class="pt-place${s.mochi ? " mochi" : ""}" style="left:${x * 100}%">
            ${s.mochi ? "" : `<img class="pt-hat" src="${P("hat")}" alt="" />`}
            <span class="pt-namecard">${s.mochi ? "mochi ♡" : (s.g || "?")}</span></div>`;
        }).join("")}
        <span class="pt-namecard you">${player.name || "you"} ♡</span>
      </div>
    </div>`);
  const room = v.root.querySelector(".pt-room");
  show(v);
  ctx.sfx?.chirp();
  await sleep(600);

  const key = player.guests?.length ? "wait" : "waitNobody";
  say(v, fillName(LINES[key + "1"], player));
  room.classList.add("waiting"); // the clock starts spinning
  await sleep(3800);
  say(v, fillName(LINES[key + "2"], player));
  await sleep(3800);
  room.classList.add("droop"); // the balloons begin to sink
  say(v, fillName(LINES.wait3, player));
  await sleep(4200);
  say(v, fillName(LINES.wait4, player));
  await sleep(3600);
  say(v, "...");
  const cards = room.querySelectorAll(".pt-place:not(.mochi) .pt-namecard");
  cards[cards.length - 1]?.classList.add("fallen"); // one card tips over
  ctx.sfx?.tick();
  await sleep(2600);
  room.classList.add("stopped"); // the clock stops
  say(v, fillName(LINES.wait5, player));
  await sleep(2600);
  say(v, fillName(LINES[key + "6"], player));
  await sleep(3200);
  await hide(v);
}

// ================================================================ pin the bow on mochi

export async function runPinBow(ctx) {
  const v = setup(ctx, "pinbow");
  const player = ctx.player;
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="pt-board"><div class="pt-board-title">pin the bow on mochi ♡</div></div>
    <img class="pt-target" src="${MOCHI_CUTE_URL}" alt="Mochi" draggable="false" />
    <div class="pt-blindfold"><div class="pt-mask"><span></span><span></span></div><p>${LINES.pinBlind}</p><div class="pt-dizzy">💫</div></div>`);
  const mochi = v.root.querySelector(".pt-target"), blind = v.root.querySelector(".pt-blindfold");
  v.root.querySelector(".mp-mochi-wrap").style.display = "none";
  show(v);
  ctx.sfx?.chirp();
  await talk(v, ctx, ["pinAsk", "pinRules"], 1900);

  for (let round = 1; round <= 2; round++) {
    say(v, "");
    blind.classList.add("on");
    ctx.sfx?.tick();
    await sleep(500);
    // behind the blindfold, she moves
    if (round === 1) mochi.classList.add("moved");
    else {
      mochi.classList.remove("moved");
      mochi.classList.add("hidden");
      ctx.audio?.breatheBehind?.(0.08);
    }
    const at = await new Promise((resolve) => {
      const onClick = (e) => resolve({ x: e.clientX, y: e.clientY });
      blind.addEventListener("click", onClick, { once: true });
      setTimeout(() => resolve({ x: innerWidth / 2, y: innerHeight * 0.4 }), 20000);
    });
    const bow = document.createElement("span");
    bow.className = "pt-bow";
    bow.textContent = "🎀";
    bow.style.left = at.x + "px";
    bow.style.top = at.y + "px";
    v.root.appendChild(bow);
    ctx.sfx?.pop();

    if (round === 1) {
      blind.classList.remove("on");
      await sleep(700);
      say(v, lines("pinMoved", player));
      bounce(v);
      await sleep(2600);
      say(v, LINES.pinAgain);
      await sleep(2200);
      bow.classList.add("gone");
      setTimeout(() => bow.remove(), 400);
    } else {
      // she's right there, where you put the bow
      mochi.style.setProperty("--bx", at.x + "px");
      mochi.style.setProperty("--by", at.y + "px");
      mochi.classList.remove("hidden");
      mochi.classList.add("boo");
      blind.classList.add("instant");
      blind.classList.remove("on");
      ctx.sfx?.chirp();
      say(v, LINES.pinBoo);
      await sleep(1100);
      bow.remove();
      mochi.classList.remove("boo");
      mochi.classList.add("back");
      await sleep(900);
      say(v, fillName(LINES.pinGotYou, player));
      await sleep(2800);
    }
  }
  await hide(v);
}

// ================================================================ the present (-> stitches)

export async function runGift(ctx) {
  const v = setup(ctx, "gift");
  const player = ctx.player;
  v.controls.insertAdjacentHTML("beforebegin", `
    <div class="pt-present">
      <img class="pt-sewing" src="${P("sewing")}" alt="" />
      <img class="pt-box" src="${P("present-box")}" alt="" />
      <img class="pt-lid" src="${P("present-lid")}" alt="" />
    </div>`);
  const present = v.root.querySelector(".pt-present");
  show(v);
  bounce(v);
  ctx.sfx?.chirp();
  await talk(v, ctx, ["giftAsk", "giftAsk2"], 2000);
  v.controls.innerHTML = `<p class="mp-hint">${LINES.giftHint}</p>`;
  present.classList.add("ready");
  await new Promise((resolve) => {
    present.addEventListener("click", resolve, { once: true });
    setTimeout(resolve, 30000);
  });
  v.controls.innerHTML = "";
  present.classList.remove("ready");
  present.classList.add("open");
  ctx.sfx?.sparkle();
  heartsOver(v, present, 10);
  await sleep(1200);
  bounce(v);
  await talk(v, ctx, ["giftWhat", "giftFix"], 2100);
  // and then she gets quiet
  await talk(v, ctx, ["giftTalkative", "...", "giftQuiet"], 2400);
  await hide(v);
}
