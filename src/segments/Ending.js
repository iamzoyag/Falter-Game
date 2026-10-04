// The ending: silence, then their own face — the moment they flinched hardest
// (or, if they never flinched, their calibration smile) — pushed as far as it
// goes. Then the report, with that frame kept as "the moment you flinched".

import { MOCHI_CUTE_URL } from "../mochi/MochiEngine.js";

export async function runEnding({ feed, audio, ui, director, aiClient, aiEnabled, imageFlash, player, faceGore, samples }) {
  director.suspend(true);
  const summary = director.getSummary();

  // Start the AI report now; the scare buys it time.
  const reportPromise = aiEnabled
    ? aiClient.requestEndingReport({
        dossier: summary.compactDossier,
        interrogations: summary.interrogations,
        stats: summary.stats
      })
    : Promise.resolve(null);

  audio.muteDrone(4000);
  ui.blackout(2000);
  await sleep(2000);

  // The polaroid from Act I comes back.
  if (player?.polaroid?.raw && faceGore) await cursedPolaroid(player, faceGore, samples);
  // three subliminal frames right before it
  for (let i = 0; i < 3; i++) {
    imageFlash?.flash(60);
    await sleep(160);
  }

  const frame = feed.snapshots.flinch || feed.clipFrame("smile", 0.7);
  const warp = {
    smile: 1.25, widen: 0.6, eyeScale: 0.6, jaw: 0.55, eyesBlack: 1,
    bgDark: 0.95, vignette: 0.9, aberration: 1, grain: 0.6, wobble: 0.5, contrast: 0.4, desat: 0.6,
    oneBit: 1, pixel: 3
  };
  ui.enterMirror("");
  feed.setFigure(null);
  if (!(frame && feed.freezeFrame(frame, performance.now() + 1400, warp))) {
    feed.freezeLastOpen(performance.now() + 1400, warp);
  }
  audio.playStinger("jumpscare", { x: 0, y: 0, z: -0.3 });
  ui.flashScreen(0.6);
  ui.shakeScreen();
  await sleep(250);
  ui.captureEndingStill(feed.canvas);
  await sleep(400);
  feed.burst({ invert: 1 }, 140); // one negative frame mid-scream
  await sleep(750);

  ui.blackout(1000);
  await sleep(900);
  ui.exitMirror();
  audio.restoreDrone(0.25);

  ui.showScreen("screen-ending");
  ui.showEndingLoading();
  const report = await reportPromise;
  ui.renderEnding(summary, report);
}

/** "{name} & mochi ♡ best friends", except it's the unzipped Mochi now, and it's your face underneath. */
export async function cursedPolaroid(player, faceGore, samples) {
  const root = document.getElementById("mochi-play");
  root.innerHTML = `
    <div class="mp-controls"><div class="mp-polaroid cursed">
      <div class="mp-photo"><canvas width="640" height="480"></canvas><img class="mp-sticker" alt="" /></div>
      <div class="mp-caption"></div>
    </div></div>`;
  const canvas = root.querySelector("canvas");
  const { raw, keypoints, cute } = player.polaroid;
  // first: exactly the photo they took
  canvas.getContext("2d").drawImage(cute, 0, 0, 640, 480);
  root.querySelector(".mp-sticker").src = MOCHI_CUTE_URL;
  root.querySelector(".mp-caption").textContent = `${player.name || "friend"} & mochi ♡ best friends`;
  root.classList.add("show", "photo");
  await sleep(1800);
  // then: what it really looks like
  const gore = document.createElement("canvas");
  if (keypoints && faceGore.render(raw, keypoints, { target: gore, kinds: ["eyes", "smile"] })) {
    const g = canvas.getContext("2d");
    g.save();
    g.translate(640, 0);
    g.scale(-1, 1);
    g.drawImage(gore, 0, 0, 640, 480);
    g.restore();
  }
  root.querySelector(".mp-sticker").src = "/mochi/wounds-unzip.webp"; // everything she went through
  root.querySelector(".mp-caption").textContent = "best friends forever";
  root.querySelector(".mp-polaroid").classList.add("ruined");
  samples?.play("splat", { gain: 0.8 });
  await sleep(2600);
  root.classList.remove("show", "photo");
  await sleep(400);
  root.innerHTML = "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}