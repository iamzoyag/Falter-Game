import { emit } from "../core/EventBus.js";

// V. INTERVIEW — the player answers out loud (or types, if they'd rather).
// Every answer carries its tells: how long before they started talking, the
// longest pause, how much they looked away, what their face did. With AI on,
// the backend writes a follow-up that presses on exactly that. Without AI, a
// small local fallback still asks one pointed follow-up from the tells alone.

export async function runInterrogation({
  prompt, ui, voice, recorder, transcriber, aiClient, aiEnabled, faceTracker, getFace, director, room, maxFollowUps = 2
}) {
  director.suspend(true);
  const turns = [];
  let question = prompt;
  ui.showInterrogation(question);

  for (let turn = 0; turn <= maxFollowUps; turn++) {
    ui.setInterrogationPrompt(question);
    ui.setInterrogationState("");
    const spoke = await voice.speak(question, { position: { x: 0, y: 0, z: -0.5 }, maxWaitMs: 4000 });
    if (!spoke) await sleep(1200);

    ui.setInterrogationState("listening.");
    let typed = null;
    ui.waitForTypedAnswer((text) => { typed = text; });
    const sampler = sampleGaze(getFace);
    const tStart = performance.now();
    const rec = await recorder.recordAnswer({ onLevel: (v) => ui.setMicLevel(v), stopSignal: () => typed !== null });
    const tEnd = performance.now();
    const awayFraction = sampler.stop();
    ui.setMicLevel(0);
    ui.cancelTypedAnswer();

    let answer = typed;
    if (!answer && rec.spoke) {
      ui.setInterrogationState("…");
      answer = await transcriber.transcribe(rec.samples, rec.sampleRate);
    }

    const tells = {
      latencyToSpeakMs: typed ? null : rec.latencyToSpeakMs,
      longestPauseMs: typed ? null : rec.longestPauseMs,
      lookedAwayFraction: +awayFraction.toFixed(2),
      reactions: [...new Set(faceTracker.spikesBetween(tStart, tEnd).map((s) => s.channel))],
      typedInstead: typed !== null,
      silent: !rec.spoke && typed === null
    };
    turns.push({ question, answer: answer || "", tells });
    ui.showTranscript(answer ? `“${answer}”` : "(nothing)");
    ui.setInterrogationState("");

    if (turn === maxFollowUps) break;

    let next = null;
    if (aiEnabled) {
      next = await aiClient.requestInterrogation({
        turns,
        dossier: director.getSummary().compactDossier.slice(-8),
        roomObjects: room?.objects || []
      });
    }
    if (!next?.question) next = localFollowUp(turns, turn);
    if (!next || next.done || !next.question) break;
    if (next.observation) emit("director-casefile", { text: next.observation });
    question = next.question;
    await sleep(900);
  }

  emit("interrogation-recorded", { prompt, turns });
  await sleep(700);
  ui.hideInterrogation();
  director.suspend(false);
  return turns;
}

function localFollowUp(turns, turn) {
  if (turn >= 1) return null; // without AI, one follow-up is plenty
  const last = turns[turns.length - 1];
  const t = last.tells;
  const tail = last.answer ? last.answer.replace(/[.?!]+$/, "").split(/\s+/).slice(-4).join(" ") : "";
  if (t.silent) return { question: "You didn't say anything. That's an answer too. Try again." };
  if (t.latencyToSpeakMs > 3500) {
    return { question: `You waited ${Math.round(t.latencyToSpeakMs / 1000)} seconds before you started. What were you deciding to leave out?` };
  }
  if (t.longestPauseMs > 1200) return { question: "You stopped halfway through. What did you almost say?" };
  if (t.lookedAwayFraction > 0.3) return { question: "You looked away while you said that. What were you looking at?" };
  if (tail) return { question: `"${tail}." Say that again. Slower.` };
  return null;
}

function sampleGaze(getFace) {
  let total = 0, away = 0, running = true;
  const tick = () => {
    if (!running) return;
    const f = getFace();
    total++;
    if (!f?.faceVisible || f.lookingAway) away++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { stop: () => { running = false; return total ? away / total : 0; } };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}