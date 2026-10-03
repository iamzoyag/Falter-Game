# FALTER

A browser-based psychological horror quiz that watches you back. All
webcam/mic processing runs client-side, always. An optional backend can add
real AI-written reactions — off by default, and disclosed to the player
before they opt in.

## What's actually implemented right now

This is a **working scaffold**, not a finished game. Six mechanics are wired
up and functional, around a 7-question placeholder quiz:

- **Gaze/attention tracking** (`src/vision/FaceTracker.js`) — MediaPipe
  FaceLandmarker reads blink duration and how long you look away from
  center; both fire a reaction past a threshold.
- **Facial expression as input** (`src/quiz/QuizEngine.js`) — each quiz
  option implicitly claims an emotional state (e.g. "no, never bothered me"
  claims `neutral`). The engine samples your actual expression in the ~800ms
  around your click and flags a mismatch if your face disagreed. Flagged
  answers get quoted back to you later, on a delay, by the horror director.
- **Environmental awareness** (`src/vision/EnvironmentMonitor.js`) — frame
  differencing for motion in the room, brightness-jump detection for
  lighting changes, and a low-variance-plus-darkness heuristic for "the lens
  is covered."
- **Delayed/looped feed** (`src/vision/DelayedFeed.js`) — your on-screen
  webcam preview is a ring buffer of recent frames. On a trigger, it swaps
  from live to a few-seconds-old replay, holds it, then seams back — with a
  guaranteed scripted trigger partway through the quiz so every playthrough
  sees it at least once, even if you never naturally look away long enough.
- **Microphone awareness** (`src/vision/AudioSensor.js`) — an `AnalyserNode`
  on the mic input (never connected to speakers — analysis only, no
  feedback risk) watches for sudden noise spikes above the room's ambient
  floor, and a soft heuristic for "quiet, rhythmic, sustained sound" as a
  rough breathing proxy. This is explicitly a heuristic, not real breath
  detection — it'll false-positive on things like HVAC hum. See the comment
  at the top of that file before you rely on it for anything.
- **AI-written reactions** (`server/` + `src/core/AIClient.js`) — optional,
  opt-in, covered in its own section below.

All of it is tied together by `src/director/HorrorDirector.js`, which
listens to every signal, applies per-signal cooldowns so it doesn't spam
you, and escalates a background drone's intensity as the quiz progresses
and mismatches pile up. It's deliberately decoupled from audio/DOM code —
it just emits "beat" events — so you can retune pacing/thresholds in one
file without touching rendering or audio.

## The shape of the game (nine acts, being rebuilt one at a time)

The dread is meant to arrive before the player can name it. Each act adds
one new wrong thing, and the cute mini-games come back later, warped.
`src/stages.js` has the full plan; ★ = built in its final form, the rest
are older acts parked in the slot they'll be replaced in.

1. ★ **I. HELLO ♡** honest and cute: name, three quiz rounds, head pats,
   snack, polaroid. Then a real goodbye and a fake "thanks for playing ♡"
   ending with a play-again button.
2. ★ **II. BONUS ROUND ♡** "wait wait wait!!" Nothing is wrong, on purpose:
   dress-up (she wears the outfit for the rest of the game), strawberry
   catch, and a "which dessert are you?" personality quiz with a result card.
3. ★ **III. MOCHI'S ROOM ♡** decorate her empty room (the layout is saved),
   a "what kind of friend are you?" quiz, and hide-and-seek. Only two things
   are off: her song slows a hair over the act, and in the last round she
   isn't hiding behind anything. She's standing in the corner, facing the
   wall. "found you ♡"
4. ★ **IV. BIRTHDAY ♡** her party, full screen, the pink draining step by
   step. Frost and decorate her cake (she can't remember how old she is),
   blow out the candles into your mic (one relights: "trick candles!!"),
   invite your friends by name and wait at the table while the clock spins
   and the balloons sink (nobody comes: "mochi has you ♡"), pin the bow on
   her blindfolded (she moves; then "boo!!"), and open the present she got
   herself: a sewing kit. "mochi should be quiet now ♡" → **stitches**, with
   the outfit you dressed her in still on.
5. ★ **V. WHERE WERE WE? ♡** after the stitches she's back, chirpy, as if
   nothing happened. The colour has gone out of everything (dusty rose).
   Memory match: one pair is you (photos taken the moment you flip them);
   one pair, Mochi and Mochi-with-stitches, never matches until the cute one
   isn't cute anymore. A "proper" personality test she repeats back to you
   slightly wrong ("so you're lonely ♡"), then your results. Mochi says, with
   your face: when you close your eyes she has her stitches and comes closer.
   At the end she asks you to say something, and she can't hear you → **ears**.
6. **VI. LIGHTS OUT** (to build; for now the rest of the old act III: the
   director wakes up, then the dark) → **eyes**.
7. **VII. PHOTO BOOTH** (to build; replaces the mirror).
8. **VIII. TEA PARTY** (for now: the old presence act, with **ears** at its start).
9. **IX. RESULTS** (for now: the old interview) → **unzip**, then the ending.

Each stage has an `act` (its place in the story) and a `look` (how far gone
the world is: 1 pink … 6 blood red). Colour, music, webcam filter, the
director and Mochi's AI voice all follow the look, so slow early acts can
stay fully pink. For playtesting, the dev server takes `?act=N` to start at
act N.

Pacing tools in `src/stages.js`: `talk` (Mochi carries the transition
instead of a title card), `fakeEnd`, `repeat`, `features` (switch director
behaviour mid-act), `pause`, `card: "none"`, `drift: true`, `songDrift`
(only the song slides, gradually, over the act).

## Mochi (the mascot) and the colour script

- **Act I ("I. HELLO ♡")** is a long, genuinely cute getting-to-know-you
  quiz so the player gets attached: Mochi asks their name, then three
  rounds (favourite things, all about you, the deep questions) with little
  moments in between: head pats with the mouse, feeding her a snack, and a
  polaroid of the two of them through a cute webcam filter
  (`src/segments/MochiPlay.js`). She reacts to every answer. Her theme plays
  throughout (`src/core/CuteTheme.js`; drop a loopable
  `public/audio/cute-theme.mp3` to use a recorded track instead). The ambient drone stays silent until Act V (the first faded act).
- **What she learns comes back**: the name, the snack, whether you petted
  her, your answers (`src/mochi/MochiLines.js` builds the whispers after
  each event from them), and the polaroid, which returns at the very end
  with Mochi unzipped and your own face mutilated.
- **Mochi events** (`src/segments/MochiSegment.js`) sit at every act break,
  worst last: stitches (end of IV), ears (end of V), eyes (end of VI), unzip (end of IX).
  The stitches scene only changes her mouth and cheek (`stitches-local.webp`,
  masked in the shader); the rest of her stays exactly as she was.
  Each starts from cute Mochi + her song, then one wound plays out
  (`src/mochi/MochiEngine.js`, WebGL, Mochi is a cut-out on a full-screen
  transparent canvas) and only advances while the webcam says you're
  looking. Look away and it freezes and the drone swells. The finished
  wound holds ~5 s, then hard cut to black.
- **Her giggle** (`src/mochi/Giggle.js`): now and then when she talks to
  you, she giggles. The same few giggles all game; a slow "creep" value that
  follows the acts makes them gradually slower, lower, duller, echoing, then
  backwards underneath and behind you. Recordings CC BY 4.0, credited in
  `public/audio/giggle/CREDITS.txt`.
- **Injury sounds** are recorded CC0 foley from freesound.org
  (`public/audio/sfx/`, credits in `CREDITS.txt` there), played through
  `src/core/SampleBank.js`; the synthesised versions are the fallback.
- **The player's face**: in the last two acts their own webcam face flashes up mutilated for a split second
  (`src/ui/FaceGore.js`: wounds painted on the FaceLandmarker landmarks).
- **The figure behind you** is a jumpscare now: it's there for a fraction
  of a second when you look back at the screen, a little closer each time.
- **Reduce flashing** (consent screen, remembered in the browser,
  `src/settings.js`): no strobes, no inverted flashes, no screen shake;
  image and gore flashes fade in and out instead.
- **AI (optional)**: `/api/mochi` writes Mochi's reactions and the
  post-event whispers from the player's name and answers. Local lines show
  instantly; the AI version replaces them only if it's fast.
- `body[data-act]` (1–6) switches the palette in `style.css`: pink → draining
  pink → dusty rose → the 1-bit look → black and red → black and blood red.
- Assets: `public/mochi/` (cut-out RGBA WebP images, optical-flow textures,
  reveal masks, ear sprite). Image licence: the LoRAs used forbid selling
  generated content: fine for a free project, recheck before any
  commercial release.

## Running it (core game, no AI)

```
npm install
npm run dev
```

Open the printed `localhost` URL in Chrome or Firefox. Webcam/mic access
requires either `localhost` or `https` — `localhost` is already covered by
the dev server, no extra setup needed. If you ever want to test from
another device on your network, you'll need HTTPS (see the commented-out
block in `vite.config.js` — `mkcert` is the easy way to get a local cert).

Grant camera + microphone access when prompted, sit through the ~8 second
calibration (it's establishing a "normal room" baseline for
brightness/motion, and giving the face model a moment to lock on), then
play the quiz. The AI opt-in checkbox on the consent screen only appears if
it detects the backend below is running — with no backend, the game is
still fully playable, purely local, exactly as before.

**Headphones recommended** — the audio uses HRTF panning (`PannerNode`) so
stingers feel like they're coming from a specific direction, which is much
weaker on speakers.

## Running it with AI reactions

This adds a small backend that holds an Anthropic API key and writes some
of the game's copy in real time. It is **never** something the browser
talks to directly — an API key in frontend code is readable by anyone who
opens dev tools, so it has to live behind a server.

```
cd server
cp .env.example .env
# edit .env and paste in a real GEMINI_API_KEY
npm install
npm run dev
```

Then, in a second terminal, run the frontend as above (`npm install && npm
run dev` from the project root). With both running, the consent screen
shows an unchecked "let an AI service write some reactions" box — the game
stays 100% local unless the player ticks it themselves.

What the AI actually does, and why each one is scoped the way it is:

1. **Whisper copy upgrade** — when a beat fires (blink held too long, room
   motion, a mismatched answer, etc.), the local template line is shown
   *immediately* — timing has to feel instant and can't wait on a network
   round-trip. A request goes out in the background asking the backend for
   a sharper, dossier-aware version of that line; if it comes back within
   about a second, it quietly replaces the text in place. A line visibly
   sharpening into something more specific reads as "it thought about
   that," not as lag — the latency became part of the effect instead of
   something to hide.
2. **Pacing hint** — every ~24 seconds, the backend gets a compact summary
   of the dossier plus which reaction types fired recently, and can nudge
   overall intensity and cooldown speed. The nudge is clamped tightly on
   both ends (`PACING_BIAS_CLAMP` in `HorrorDirector.js`) so a slow, wrong,
   or missing response can only ever season the existing deterministic
   pacing a little, never override or break it.
3. **Personalized ending report** — one call, at the very end, given the
   full dossier (every question, every answer, whether the face agreed).
   This is the highest-payoff use of real reasoning and the least
   latency-sensitive, since the ending screen already shows a "compiling…"
   beat while it waits (up to 7s, then falls back to the local summary).

If the backend is down, slow, rate-limited, or returns something malformed,
every one of these silently falls back to the existing local behavior —
nothing about the core game depends on the network being up.

### Extending the AI further

You asked about other places AI reasoning could help make this more
personalized — a few that weren't built here but would fit the same
pattern (local-instant fallback, AI-upgrade-if-fast-enough):

- Have `/api/beat` pick *which* dossier answer to reference in a callback,
  not just phrase a fixed one — right now `HorrorDirector._queueCallback`
  always uses the most recent mismatch.
- A mid-quiz "case file" sidebar that updates with an AI-written one-line
  read on the player so far, refreshed on the same cadence as the pacing
  hint.
- Let the ending report suggest which *specific* answer was the "tell" —
  right now it sees the whole dossier at once and decides that itself
  implicitly, but you could have it return a `focusEntry` field the ending
  screen highlights differently.

## What's placeholder and worth replacing first

- **Audio** is 100% procedural right now (oscillators + noise), so nothing
  is copyrighted but it also doesn't sound like a finished horror game yet.
  `AudioEngine.loadBuffer(name, url)` / `playBuffer(name, position)` are
  already there for dropping in real recordings — swap calls in
  `HorrorDirector`'s beats from `playStinger('breath', ...)` to
  `playBuffer('your-file', ...)` once you have assets.
- **Quiz content** (`src/quiz/questions.js`) is a small placeholder set of 7
  questions to prove the mismatch-detection and callback mechanics work.
  Real content should be much longer and more carefully written — the best
  version of this mechanic depends on questions where an honest answer and
  a socially "safe" answer plausibly diverge.
- **Visual polish** — right now reactions are text whispers + a white flash
  + a screen shake. No character/scene art, no CRT/VHS shader on the feed
  canvas (a subtle scanline + chromatic-aberration shader on `feed-canvas`
  during glitches would sell the "the tape is old" feeling a lot harder).
- **Detection thresholds** in `FaceTracker.js`, `EnvironmentMonitor.js`, and
  `AudioSensor.js` are reasonable starting guesses, not tuned against real
  users/webcams/mics — expect to adjust `BLINK_TOO_LONG_MS`,
  `MOTION_ENERGY_THRESHOLD`, `SUDDEN_NOISE_JUMP`, etc. after playtesting on
  a few different machines, rooms, and lighting setups.
- **Backend rate limiting** in `server/index.js` is a naive in-memory window
  — fine for local single-player use, not something to expose on the open
  internet as-is.

## Architecture, if you want to extend it

```
src/
  core/
    EventBus.js         tiny shared pub/sub — everything below talks through this
    AudioEngine.js       Web Audio: ambient drone + spatial stingers
    AIClient.js            fetch wrapper for the backend; always timeout-bounded, never throws
  vision/
    FaceTracker.js        MediaPipe wrapper: blink / gaze / expression / head pose
    EnvironmentMonitor.js   room brightness / motion / occlusion, independent of face
    DelayedFeed.js            ring-buffer canvas renderer, live<->delayed switch
    AudioSensor.js              mic RMS/noise-floor/breathing-heuristic, analysis only
  quiz/
    questions.js                 quiz content
    QuizEngine.js                  flow + expression-mismatch scoring + dossier
  director/
    HorrorDirector.js                subscribes to everything, applies cooldowns, decides beats
  ui/
    screens.js                         all DOM rendering (no logic)
  main.js                                  wires it all together, owns the requestAnimationFrame loop
server/
  index.js               Express app: /api/health, /api/beat, /api/ending, /api/pacing
  llm.js                    prompt construction + Anthropic calls + defensive JSON parsing
```

The rule of thumb: vision/quiz modules only know about *signals*, the
director only knows about *when to react* (and, optionally, *asks* the
backend for better copy — but never blocks on it), and
`screens.js`/`AudioEngine` only know *how to render a beat*. `main.js` and
`EventBus.js` are the only places that know about all of it. Adding a new
horror beat is: add a threshold/signal wherever it belongs, add a case in
`HorrorDirector.tick()`, done — no other file needs to change, and it gets
AI-upgradable text for free if `beat.text` is set.

## Privacy note for players

The consent screen's honesty is part of the design, not just legal cover —
a game about the gap between what you say and what your face does loses
its footing fast if its own disclosure isn't straight with you. Two things
worth keeping true as you build this out:

- The default (no backend running, or backend running but the box left
  unchecked) is still 100% local — verified by the build test above; the
  only network calls at all, ever, in that mode are the one-time MediaPipe
  model-file downloads on first load.
- If you add anything else that leaves the machine — analytics, telemetry,
  a different AI use — update the consent copy in `index.html` to match
  before you ship it. The moment that copy stops being accurate, the whole
  "the dread is earned because the consent was honest" framing breaks.
