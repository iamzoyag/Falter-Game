// The ending: silence, then their own face — the moment they flinched hardest
// (or, if they never flinched, their calibration smile) — pushed as far as it
// goes. Then the report, with that frame kept as "the moment you flinched".

export async function runEnding({ feed, audio, ui, director, aiClient, aiEnabled, imageFlash }) {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}