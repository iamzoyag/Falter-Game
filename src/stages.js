// The game as a sequence of stages. A string step is a question id from
// questions.js; objects are special segments. `features` switches director
// behaviour on per stage, so the first stage can be a genuinely normal quiz
// and everything after it can go wrong in layers.
//
// `act` (1..5) drives the colour script (body[data-act] in style.css):
// pink and bubbly in I, sliding to black and red by V.
// { type: "mochi", scene } is a Mochi event (src/segments/MochiSegment.js):
// one at every act break, worst last. { type: "play" } / { type: "round" }
// are Act I's moments with Mochi (src/segments/MochiPlay.js).

export const STAGES = [
  {
    id: "intake",
    act: 1,
    title: "I. HELLO ♡",
    subtitle: "a getting-to-know-you quiz with mochi",
    features: { beats: false, darkness: false, unblink: false, creep: false, figure: false, room: false, voice: false },
    // Long and genuinely cute on purpose: three rounds, with little moments
    // with Mochi in between, so the player gets attached and lets their guard down.
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
      { type: "mochi", scene: "stitches" }
    ]
  },
  {
    id: "reflection",
    act: 2,
    title: "II. REFLECTION",
    subtitle: "keep your eyes on the screen.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: false, room: false, voice: true, scriptedGlitch: true, smileClip: true },
    steps: ["q6", "q7", "q8", "q9", "q10", "q11", "q12", { type: "mochi", scene: "eyes" }]
  },
  {
    id: "mirror",
    act: 3,
    title: "III. THE MIRROR",
    subtitle: "look at yourself.",
    features: { beats: false, darkness: false, unblink: false, creep: true, figure: false, room: false, voice: true },
    steps: [{ type: "mirror", durationMs: 60000 }, { type: "mochi", scene: "ears" }]
  },
  {
    id: "presence",
    act: 4,
    title: "IV. PRESENCE",
    subtitle: "you are not the only thing in this room.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: true, room: true, voice: true, playerVoice: true, smileClip: true, faceGore: true },
    steps: ["q13", "q14", "q15", { type: "task", task: "closeEyes" }, "q16", "q17", "q18", "q19"]
  },
  {
    id: "interview",
    act: 5,
    title: "V. INTERVIEW",
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