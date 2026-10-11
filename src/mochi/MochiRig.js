// Mochi, alive. The same picture of her, split into a few layers so she can
// move like a character instead of sitting there like a sticker:
//
//   - her ears are separate (cute-noears.webp in front, ears-rig.webp behind
//     it, built by tools/make_mochi_ears.py): they twitch now and then, perk up
//     and wiggle when she's happy, droop when she's sad or you've gone
//   - she blinks (lids-closed.webp), sometimes twice, and sometimes right
//     after you blink, as if she's copying you
//   - happy ^^ eyes (lids-happy.webp) when something nice happens, or when
//     you smile at her: she smiles back
//   - she leans and tilts toward where you are (your face in the webcam;
//     the mouse if there's no face), and tilts her head, curious, when you
//     disappear from the camera
//   - a little bounce while she talks
//
// Only while she's cute: on the plain cute image in the pink looks (1-2), and
// not in the off/dark/glitch moods. Anywhere else the layers switch off and
// whatever image the scene put there shows as it is.
//
// Lids are built by tools/make_mochi_lids.py, ears by tools/make_mochi_ears.py.

import { giggle } from "./Giggle.js";

const B = "/mochi/";
const CUTE = B + "cute.webp";
const NOEARS = B + "cute-noears.webp";
const ART = { ears: B + "ears-rig.webp", closed: B + "lids-closed.webp", happy: B + "lids-happy.webp", noears: NOEARS };
// ear pivots (fractions of the image), same as the gore engine's
const PIVOT = { l: [39.13, 28.39], r: [67.25, 27.93] };

let artReady = false;
const loaded = Object.values(ART).map((src) => {
  const im = new Image();
  im.src = src;
  return im.decode().catch(() => null);
});
Promise.all(loaded).then((r) => { artReady = r.every((x) => x !== null); });

const rigs = new Set();
let faceSource = null;
let pointer = null;
addEventListener("pointermove", (e) => { pointer = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });

addEventListener("mochi-giggle", () => reactAll("happy", { ms: 1300 }));

/** Where the player's face comes from (main.js): () => latestFace. */
export function setFaceSource(fn) { faceSource = fn; }

/** Every Mochi on screen reacts: "happy" | "sad" | "surprised". */
export function reactAll(kind, opts) { for (const r of rigs) r.react(kind, opts); }

const isCuteSrc = (src) => !!src && (src.endsWith("/cute.webp") || src.endsWith("/cute-noears.webp"));
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Bring the Mochi <img> to life. Its parent must be exactly her box (it is,
 * wherever she wears accessories). Returns a handle: { talk(text), react(kind), destroy() }.
 */
export function rigMochi(img, { lean = 1 } = {}) {
  const box = img.parentElement;
  if (!box || img._rig) return img?._rig || null;
  const part = (cls, style = "") => {
    const s = document.createElement("span");
    s.className = `rig-part ${cls}`;
    s.setAttribute("aria-hidden", "true");
    s.style.cssText = style;
    return s;
  };
  const earL = part("rig-ear", `background-image:url('${ART.ears}');clip-path:inset(0 50% 0 0);transform-origin:${PIVOT.l[0]}% ${PIVOT.l[1]}%`);
  const earR = part("rig-ear", `background-image:url('${ART.ears}');clip-path:inset(0 0 0 50%);transform-origin:${PIVOT.r[0]}% ${PIVOT.r[1]}%`);
  const shut = part("rig-lid", `background-image:url('${ART.closed}')`);
  const glad = part("rig-lid", `background-image:url('${ART.happy}')`);
  img.after(earL, earR, shut, glad); // above her, below her accessories

  const now0 = performance.now();
  const s = {
    on: false,
    nextBlink: now0 + rand(1200, 3500), blinkUntil: 0, doubleAt: 0,
    happyUntil: 0, sadUntil: 0, surprisedUntil: 0,
    nextTwitch: now0 + rand(2500, 6000), twitch: null,
    wiggleUntil: 0,
    lx: 0, tilt: 0, earL: 0, earR: 0,
    talkUntil: 0,
    awaySince: 0, wasAway: false, lastSmile: 0, smiling: false, playerBlink: false
  };

  const rig = {
    img, box,
    talk(text) {
      if (!text) return;
      s.talkUntil = performance.now() + Math.min(2600, 380 + text.length * 42);
    },
    react(kind, { ms } = {}) {
      const t = performance.now();
      if (kind === "happy") { s.happyUntil = t + (ms || 1100); s.wiggleUntil = t + 700; s.sadUntil = 0; }
      else if (kind === "sad") { s.sadUntil = t + (ms || 1800); s.happyUntil = 0; }
      else if (kind === "surprised") { s.surprisedUntil = t + (ms || 600); s.nextTwitch = t + 50; }
      else if (kind === "blink") s.nextBlink = t;
    },
    destroy() {
      rigs.delete(rig);
      [earL, earR, shut, glad].forEach((n) => n.remove());
      box.classList.remove("rig-on");
      box.style.removeProperty("rotate");
      box.style.removeProperty("translate");
      box.style.removeProperty("scale");
      if (img.getAttribute("src") === NOEARS) img.src = CUTE;
      delete img._rig;
    },
    _tick(t, face) {
      if (!img.isConnected) return rig.destroy();
      const src = img.getAttribute("src");
      const want = artReady && isCuteSrc(src) && cuteWorld(box);
      if (want !== s.on) {
        s.on = want;
        box.classList.toggle("rig-on", want);
        if (!want) {
          box.style.removeProperty("rotate");
          box.style.removeProperty("translate");
          box.style.removeProperty("scale");
        }
      }
      // swap her ears for the moving ones (and back), whatever the scene sets
      if (want && src !== NOEARS) img.src = NOEARS;
      else if (!want && src === NOEARS) img.src = CUTE;
      if (!want) return;
      step(t, face);
    }
  };

  function step(t, face) {
    // ---- the player
    const seen = face?.faceVisible;
    if (!seen && faceSource) { if (!s.awaySince) s.awaySince = t; } else s.awaySince = 0;
    const away = s.awaySince && t - s.awaySince > 1500;
    if (s.wasAway && !away && seen) rig.react("happy", { ms: 900 }); // there you are!
    s.wasAway = away;
    // you smile, she smiles back (and sometimes giggles)
    const smile = seen && (face.z?.smile > 2.2 || face.channels?.smile > 0.55);
    if (smile && !s.smiling && t - s.lastSmile > 5000) {
      s.lastSmile = t;
      rig.react("happy", { ms: 1500 });
      giggle.happy(0.35);
    }
    s.smiling = !!smile;
    // you blink, she sometimes blinks right after
    if (seen && face.blinking && !s.playerBlink && Math.random() < 0.3 && t > s.blinkUntil + 300) s.nextBlink = t + 140;
    s.playerBlink = !!(seen && face.blinking);

    // ---- where to lean: toward your face, else the mouse
    let target = 0;
    const kp = face?.keypoints;
    if (seen && kp?.leftEye && kp?.rightEye) {
      const cx = (kp.leftEye.cx + kp.rightEye.cx) / 2; // unmirrored video x; the feed is shown mirrored
      target = Math.max(-1, Math.min(1, ((1 - cx) - 0.5) * 2.6));
    } else if (pointer && t - pointer.t < 8000) {
      const r = box.getBoundingClientRect();
      target = Math.max(-1, Math.min(1, (pointer.x - (r.left + r.width / 2)) / (innerWidth * 0.45)));
    }
    s.lx = lerp(s.lx, target, 0.06);
    // you vanish from the camera: a curious head tilt for a few seconds, then she waits
    const curious = away && t - s.awaySince < 6000 ? 1 : 0;
    s.tilt = lerp(s.tilt, curious, 0.05);

    // ---- blink
    if (t >= s.nextBlink) {
      s.blinkUntil = t + 120;
      s.nextBlink = t + rand(2200, 5600);
      if (Math.random() < 0.2) s.doubleAt = t + 260;
    }
    if (s.doubleAt && t >= s.doubleAt) { s.blinkUntil = t + 110; s.doubleAt = 0; }
    const happy = t < s.happyUntil;
    const closed = !happy && t < s.blinkUntil;
    shut.style.opacity = closed ? "1" : "0";
    glad.style.opacity = happy ? "1" : "0";

    // ---- ears
    let l = 0, r = 0;
    if (t >= s.nextTwitch) {
      s.twitch = { side: Math.random() < 0.5 ? "l" : "r", until: t + 160, both: Math.random() < 0.18 };
      s.nextTwitch = t + rand(2600, 7500);
    }
    if (s.twitch && t < s.twitch.until) {
      const k = Math.sin(((s.twitch.until - t) / 160) * Math.PI) * 9;
      if (s.twitch.side === "l" || s.twitch.both) l -= k;
      if (s.twitch.side === "r" || s.twitch.both) r += k;
    }
    if (t < s.wiggleUntil) { const w = Math.sin(t / 38) * 7; l += w; r -= w; }        // happy wiggle
    if (t < s.sadUntil) { l -= 16; r += 16; }                                            // droop
    if (t < s.surprisedUntil) { l += 5; r -= 5; }                                        // perk
    l += -6 * s.tilt; r += 10 * s.tilt;                                                   // one ear down, head tilted: where'd you go?
    l += s.lx * 3; r += s.lx * 3;                                                         // they follow the lean
    s.earL = lerp(s.earL, l, 0.35);
    s.earR = lerp(s.earR, r, 0.35);
    earL.style.rotate = `${s.earL.toFixed(2)}deg`;
    earR.style.rotate = `${s.earR.toFixed(2)}deg`;

    // ---- the whole of her: lean toward you, tilt when curious, bob while talking
    const talking = t < s.talkUntil ? Math.abs(Math.sin(t / 85)) : 0;
    box.style.rotate = `${(s.lx * 3.2 * lean + s.tilt * 7).toFixed(2)}deg`;
    box.style.translate = `${(s.lx * 2.2 * lean).toFixed(2)}% 0`;
    box.style.scale = `${(1 + talking * 0.018).toFixed(3)} ${(1 - talking * 0.022).toFixed(3)}`;
  }

  img._rig = rig;
  rigs.add(rig);
  ensureLoop();
  return rig;
}

/** She's only "alive" like this while the world is still cute. */
function cuteWorld(box) {
  const look = document.body.dataset.act;
  if (look !== "1" && look !== "2") return false;
  return !box.closest(".mood-off, .mood-dark, .glitch, .photo");
}

let looping = false;
function ensureLoop() {
  if (looping) return;
  looping = true;
  const frame = (t) => {
    if (!rigs.size) { looping = false; return; }
    if (!document.hidden) {
      const face = faceSource?.() || null;
      for (const r of [...rigs]) r._tick(t, face);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
