// Sensor-checked instructions. Deliberately few (two in the whole game) and
// short, so the player stays seated and it never turns into chores. If they
// don't comply, the game shrugs and moves on — nothing blocks.

/** "Close your eyes for 10 seconds." Then shows them what happened. */
export async function taskCloseEyes({ feed, getFace, director, ui, audio, voice, playerVoice }) {
  director.suspend(true);
  ui.showInstruction("close your eyes.<br>keep them closed until you hear the tone.");
  const spoke = await voice.speak("Close your eyes. Keep them closed until you hear the tone.", { position: { x: 0, y: 0, z: -0.4 } });
  if (!spoke) await sleep(2500);

  const waitStart = performance.now();
  while (!eyesClosed(getFace()) && performance.now() - waitStart < 12000) await nextFrame();
  if (!eyesClosed(getFace())) {
    ui.showInstruction("fine. keep them open, then.");
    await sleep(1800);
    ui.hideInstruction();
    director.suspend(false);
    director.say("it saw you anyway.");
    return { complied: false };
  }

  ui.showInstruction(""); // they can't see it anyway
  const t0 = performance.now();
  // Something crosses the room toward them while their eyes are shut.
  const steps = [[1500, 3.2, -1.2], [3300, 2.2, -0.9], [4900, 1.4, -0.5], [6300, 0.8, -0.2]];
  const timers = steps.map(([at, z, x]) => setTimeout(() => audio.playStinger("footstep", { x, y: -0.4, z }), at));
  timers.push(setTimeout(() => audio.playStinger("breath", { x: 0.3, y: 0.1, z: 0.35 }), 7600));
  if (playerVoice) timers.push(setTimeout(() => audio.playPlayerVoice(playerVoice, "whisper", { x: 0.2, y: 0.1, z: 0.3 }), 8400));

  let closedMs = 0, openSince = null, opens = 0, last = t0;
  while (closedMs < 10000 && performance.now() - t0 < 13000) {
    await nextFrame();
    const now = performance.now();
    const face = getFace();
    if (eyesClosed(face)) {
      closedMs += now - last;
      openSince = null;
    } else {
      openSince ??= now;
      if (now - openSince > 400) {
        opens += 1;
        openSince = null;
        if (opens >= 2) break;
        ui.showInstruction("keep them closed.");
        setTimeout(() => ui.showInstruction(""), 1500);
      }
    }
    last = now;
  }
  const t1 = performance.now();
  timers.forEach(clearTimeout);
  audio.playStinger("tone", { x: 0, y: 0, z: -0.5 });

  ui.showInstruction("open your eyes.");
  const openWait = performance.now();
  while (eyesClosed(getFace()) && performance.now() - openWait < 4000) await nextFrame();

  ui.hideInstruction();
  ui.enterMirror("this is what happened while your eyes were closed.");
  await sleep(1800);
  ui.setMirrorText("");

  // Replay those seconds — their own closed-eyed face, and something coming closer.
  feed.setFigureImage(director.prepareFigureImage());
  feed.startReplay(t0, t1, (p) => ({
    warp: { bgDark: 0.45 + p * 0.3, vignette: 0.6, grain: 0.35, desat: 0.5, smile: p > 0.85 ? (p - 0.85) * 4 : 0, pixel: 3, oneBit: p > 0.5 ? 1 : 0 },
    figure: director.figureAt(1 + p * 3.6, getFace())
  }));
  await sleep(t1 - t0 + 100);

  feed.freezeFrame(feed.frameAt(t1 - 300), performance.now() + 900, {
    smile: 0.8, eyesBlack: 1, eyeScale: 0.4, bgDark: 0.9, vignette: 0.9, aberration: 0.4, oneBit: 1, pixel: 3
  });
  audio.playStinger("static", { x: 0, y: 0, z: -0.2 });
  await sleep(900);

  ui.exitMirror();
  director.setFigureStep(3); // and now it's still there, in the live feed
  director.suspend(false);
  return { complied: true, opens };
}

/** "Don't make a sound." Twelve seconds, drone cut, a couple of noises to react to. */
export async function taskStaySilent({ getMic, director, ui, audio, voice, playerVoice }) {
  director.suspend(true);
  ui.showInstruction("don't make a sound.");
  const spoke = await voice.speak("Don't make a sound. Not for the next twelve seconds.", { position: { x: 0, y: 0, z: -0.4 } });
  if (!spoke) await sleep(2000);

  const DURATION = 12000;
  audio.muteDrone(DURATION + 500);
  const floor = getMic()?.noiseFloor ?? 0.01;
  const t0 = performance.now();
  // our own sounds can leak into the mic on speakers — ignore the mic right after each one
  const sounds = [[4000, "click", { x: -0.8, y: 0, z: 0.9 }], [8000, "breath", { x: 0.5, y: 0.1, z: 0.4 }]];
  const timers = sounds.map(([at, type, pos]) => setTimeout(() => audio.playStinger(type, pos), at));
  const deaf = (t) => sounds.some(([at]) => t - t0 >= at && t - t0 < at + 1300);

  let broke = false;
  while (performance.now() - t0 < DURATION) {
    await sleep(40);
    const now = performance.now();
    const mic = getMic();
    if (!mic || deaf(now) || now - t0 < 600) continue;
    if (mic.suddenNoise || mic.rms > floor + 0.06) { broke = true; break; }
  }
  timers.forEach(clearTimeout);

  if (broke) {
    audio.restoreDrone(0.55);
    audio.playStinger("static", { x: 0, y: 0, z: -0.3 });
    ui.flashScreen(0.35);
    ui.shakeScreen();
    director.spikeDarkness(0.6);
    director.advanceFigure();
    ui.showInstruction("it heard you.");
    await voice.speak("It heard you.", { position: { x: 0.2, y: 0, z: 0.3 }, maxWaitMs: 800 });
    await sleep(1800);
  } else {
    ui.showInstruction("");
    if (playerVoice) await audio.playPlayerVoice(playerVoice, "reverse", { x: -0.3, y: 0, z: 0.5 });
    ui.showInstruction("you were quiet.<br>something else wasn't.");
    await sleep(2600);
  }
  ui.hideInstruction();
  director.suspend(false);
  return { broke };
}

function eyesClosed(face) {
  return !!(face?.faceVisible && face.blinking);
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}