// The game as a sequence of stages. A string step is a question id from
// questions.js; objects are special segments. `features` switches director
// behaviour on per stage, so the first stage can be a genuinely normal quiz
// and everything after it can go wrong in layers.
//
// `act` (1..6) drives the colour script (body[data-act] in style.css):
// pink and bubbly in I and II, faded in III, black and white in IV, black
// and red in V and VI.
//
// The shape of the whole thing: I is honest and cute. II looks the same
// but quietly isn't (subliminal unease first, conscious "wait..." later).
// The first gore lands at the END of II, after they've already felt it.
// III pretends nothing happened. From IV on, it stops pretending.
//
// Step types: a string is a question id. { type: "talk" } Mochi says lines
// full screen; { type: "round" } a bubbly round card; { type: "play" } an Act I
// moment; { type: "repeat", of } asks an earlier question again;
// { type: "features", set } changes director features mid-act (pacing);
// { type: "mochi", scene } a Mochi event; plus mirror / task / interrogate.
// `card`: "stage" shows the act's title card first, "none" lets Mochi carry the transition.
// { type: "mochi", scene } is a Mochi event (src/segments/MochiSegment.js):
// one at every act break, worst last. { type: "play" } / { type: "round" }
// are Act I's moments with Mochi (src/segments/MochiPlay.js).

export const STAGES = [
  {
    id: "hello",
    act: 1,
    card: "stage",
    title: "I. HELLO ♡",
    subtitle: "a getting-to-know-you quiz with mochi",
    features: { beats: false, darkness: false, unblink: false, creep: false, figure: false, room: false, voice: false },
    steps: [
      { type: "play", kind: "greet" },
      { type: "round", title: "round one ♡", sub: "favourite things!" },
      "m1", "m2", "m3", "m4",
      { type: "play", kind: "pet" },
      { type: "round", title: "round two ♡", sub: "all about you!" },
      "m5", "m6", "m7", "m8",
      { type: "play", kind: "feed" },
      { type: "round", title: "round three ♡", sub: "the deep questions~" },
      "q1", "q2", "q3", "q4", "q5",
      { type: "play", kind: "polaroid" },
      // a real goodbye, and a fake ending. The game is over. (It isn't.)
      { type: "talk", lines: "goodbye" },
      { type: "fakeEnd" }
    ]
  },
  {
    id: "bonus",
    act: 2,
    card: "none",
    title: "II. BONUS ROUND ♡",
    subtitle: "",
    // still pink, still cute. Underneath: a heartbeat, a 19 Hz hum, the song
    // drifting flat, single frames of a hurt Mochi, breathing behind the music.
    features: { beats: false, darkness: false, unblink: false, creep: false, figure: false, room: false, voice: false, subliminal: 1 },
    drift: true,
    steps: [
      { type: "talk", lines: "bonus" },
      { type: "round", title: "bonus round ♡", sub: "just for you!" },
      "b1", "b2",
      { type: "repeat", of: "m2" },
      "b3", "b4", "b5", "b6",
      { type: "talk", lines: "quiet", mood: "off" },
      { type: "mochi", scene: "stitches" }
    ]
  },
  {
    id: "where",
    act: 3,
    card: "none",
    title: "III. WHERE WERE WE ♡",
    subtitle: "",
    // she's back, cute, and acts like nothing happened. The colour's gone out
    // of everything and the song is broken. Blink, and she has stitches.
    features: { beats: false, darkness: false, unblink: true, creep: true, figure: false, room: false, voice: false, subliminal: 2, hostHurt: true },
    steps: [
      { type: "pause", ms: 4200 },
      { type: "round", title: "round fi\u0335ve ♡", sub: "where were we?", glitch: true },
      { type: "talk", lines: "whereWereWe", mood: "off", flicker: "/mochi/stitches.webp" },
      "q6", "q7", "q8",
      // and now it stops being subtle
      { type: "features", set: { beats: true, voice: true, scriptedGlitch: true, smileClip: true } },
      "q9", "q10",
      { type: "features", set: { darkness: true } },
      "q11", "q12",
      { type: "talk", lines: "cantSee", mood: "dark" },
      { type: "mochi", scene: "eyes" }
    ]
  },
  {
    id: "mirror",
    act: 4,
    card: "stage",
    title: "IV. THE MIRROR",
    subtitle: "she can't see you anymore. so you look.",
    features: { beats: false, darkness: false, unblink: false, creep: true, figure: false, room: false, voice: true },
    steps: [{ type: "mirror", durationMs: 60000 }, { type: "mochi", scene: "ears" }]
  },
  {
    id: "presence",
    act: 5,
    card: "stage",
    title: "V. PRESENCE",
    subtitle: "you are not the only thing in this room.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: true, room: true, voice: true, playerVoice: true, smileClip: true, faceGore: true },
    steps: ["q13", "q14", "q15", { type: "task", task: "closeEyes" }, "q16", "q17", "q18", "q19"]
  },
  {
    id: "interview",
    act: 6,
    card: "stage",
    title: "VI. INTERVIEW",
    subtitle: "answer out loud.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: true, room: true, voice: true, playerVoice: true, smileClip: true, faceGore: true },
    steps: [
      { type: "interrogate", prompt: "Out loud, please. Tell me about a time you were certain something was in the room with you." },
      "q20", "q21",
      { type: "task", task: "staySilent" },
      "q22", "q23",
      { type: "interrogate", prompt: "Look at the room behind you, in your feed. What's the one thing back there you'd least like to see move? Say it." },
      "q24", "q25", "q26",
      { type: "mochi", scene: "unzip" }
    ]
  }
];
