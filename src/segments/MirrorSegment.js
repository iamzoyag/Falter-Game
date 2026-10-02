import { settings } from "../settings.js";
// III. THE MIRROR — based on the strange-face-in-the-mirror illusion 
// in dim light, staring at your own face for under a minute makes most
// people see it distort. Here the feed ALSO distorts, slowly, so the player
// can't tell which changes are the illusion and which are the game.
//
// The timer only runs while they hold eye contact. Looking away pauses it,
// darkens the room and gets a "don't look away."

const HOLD_EYE_CONTACT = (face) =>
  face?.faceVisible && !face.lookingAway && !face.blinkTooLong && Math.abs(face.yawProxy ?? 0) < 0.2;

const MAX_REAL_TIME_MS = 110000; // never trap anyone: after this it ends regardless

export async function runMirror({ durationMs = 60000, feed, getFace, director, ui, audio, voice, faceGore, getVideo, samples }) {
  feed.setFigureImage(director.prepareFigureImage()); // the figure hasn't appeared yet in normal play
  ui.enterMirror("look into your own eyes.<br>don't look away.");
  voice?.speak("Look into your own eyes. Don't look away.", { position: { x: 0, y: 0, z: -0.4 } });
  await sleep(2500);
  ui.setMirrorText("");

  const start = performance.now();
  let held = 0;
  let last = start;
  let lookAways = 0;
  let wasHolding = true;
  let lastPromptAt = 0;
  let nextSwapAt = start + 9000;
  let nextBeatAt = start + 1200;
  let bgPulse = 0;
  let scared = false;

  while (held < durationMs && performance.now() - start < MAX_REAL_TIME_MS) {
    await nextFrame();
    const now = performance.now();
    const dt = now - last;
    last = now;
    const face = getFace();
    const holding = HOLD_EYE_CONTACT(face);

    if (holding) {
      held += dt;
      if (!wasHolding) ui.setMirrorText("");
    } else {
      if (wasHolding) lookAways += 1;
      bgPulse = Math.min(1, bgPulse + dt / 600);
      if (now - lastPromptAt > 5000) {
        lastPromptAt = now;
        ui.setMirrorText("don't look away.");
        voice?.speak("Don't look away.", { position: { x: 0.3, y: 0, z: 0.4 }, maxWaitMs: 400 });
        audio.playStinger("static", { x: 0, y: 0, z: -0.3 });
        feed.burst({ oneBit: 1, invert: 1, pixel: 4 }, 250); // a negative flash of their own face
      }
    }
    wasHolding = holding;
    bgPulse = Math.max(0, bgPulse - dt / 4000);

    const p = held / durationMs; // 0..1
    const e = p * p * (3 - 2 * p); // smoothstep: slow start, slow end
    feed.setBaseWarp({
      smile: e * 0.55,
      widen: e * 0.25,
      eyeScale: e * 0.45,
      jaw: e * 0.3,
      eyesBlack: p > 0.6 ? (p - 0.6) / 0.4 : 0,
      bgDark: 0.3 + e * 0.3 + bgPulse * 0.3, // room stays dimly visible — the figure needs something to stand against
      vignette: 0.45 + e * 0.5,
      grain: 0.25 + e * 0.4,
      desat: 0.5 + e * 0.3,
      brightness: 0.85 - e * 0.25 - bgPulse * 0.2,
      wobble: p > 0.8 ? (p - 0.8) * 3 : 0,
      pixel: 2 + Math.round(e * 3),
      oneBit: p > 0.45 ? Math.min(1, (p - 0.45) / 0.35) : 0 // grey slowly gives way to pure black and white
    });

    // Near the end, for a split second, something is standing right behind them.
    if (p > 0.8 && !scared && holding) {
      scared = true;
      const fig = director.figureAt(4.2, face);
      if (fig) {
        fig.opacity = 0.97;
        feed.setFigure(fig);
        audio.playStinger("jumpscare", { x: 0.3, y: 0, z: 0.5 });
        ui.shakeScreen();
        setTimeout(() => feed.setFigure(null), settings.reduceFlashing ? 450 : 260);
      }
    }

    // Uncanny valley: for a fraction of a second, a different expression —
    // one of their own calibration faces, pushed too far.
    if (p > 0.15 && now > nextSwapAt && feed.isLive()) {
      nextSwapAt = now + 5000 + Math.random() * 4000;
      const which = ["smile", "raise", "frown"][Math.floor(Math.random() * 3)];
      const warp = {
        smile: which === "frown" ? -0.9 : 0.4 + e * 0.9,
        eyeScale: 0.3 + e * 0.4,
        jaw: which === "frown" ? 0.6 : 0.2,
        eyesBlack: p > 0.4 ? 1 : 0,
        bgDark: 0.8,
        vignette: 0.8,
        aberration: 0.6,
        oneBit: 1,
        pixel: 3,
        invert: Math.random() < 0.4 ? 1 : 0
      };
      feed.playClip(which, 180 + Math.random() * 200, warp);
    }

    // heartbeat, speeding up
    if (now > nextBeatAt) {
      nextBeatAt = now + 1300 - e * 750;
      audio.playStinger("heartbeat", { x: 0, y: -0.2, z: 0.2 });
    }
    audio.setDroneIntensity(0.4 + e * 0.6);
  }

  // The reflection holds a smile a moment after they've stopped.
  const lastFrame = feed.clipFrame("smile", 0.7);
  feed.freezeFrame(lastFrame || null, performance.now() + 1100, {
    smile: 1.1, widen: 0.5, eyeScale: 0.55, jaw: 0.45, eyesBlack: 1, bgDark: 0.95, vignette: 0.9, aberration: 0.5, oneBit: 1, pixel: 3
  });
  await sleep(1100);
  // ...and for one frame, what's underneath
  const kp = getFace()?.keypoints;
  if (faceGore && kp && faceGore.flash(getVideo?.(), kp, 170)) samples?.play("snap", { gain: 0.7 });
  audio.playStinger("static", { x: 0, y: 0, z: -0.2 });
  ui.blackout(1400);
  await sleep(1400);

  feed.setFigure(null);
  ui.exitMirror();
  director.bumpCreep(0.08);
  director.stats.mirrorLookAways = lookAways;
  return { lookAways, heldMs: Math.round(held) };
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}