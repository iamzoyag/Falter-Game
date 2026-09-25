// The game as a sequence of stages. A string step is a question id from
// questions.js; objects are special segments. `features` switches director
// behaviour on per stage, so the first stage can be a genuinely normal quiz
// and everything after it can go wrong in layers.

export const STAGES = [
  {
    id: "intake",
    title: "I. INTAKE",
    subtitle: "a few questions. nothing unusual.",
    features: { beats: false, darkness: false, unblink: false, creep: false, figure: false, room: false, voice: false },
    steps: ["q1", "q2", "q3", "q4", "q5"]
  },
  {
    id: "reflection",
    title: "II. REFLECTION",
    subtitle: "keep your eyes on the screen.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: false, room: false, voice: true, scriptedGlitch: true, smileClip: true },
    steps: ["q6", "q7", "q8", "q9", "q10", "q11", "q12"]
  },
  {
    id: "mirror",
    title: "III. THE MIRROR",
    subtitle: "look at yourself.",
    features: { beats: false, darkness: false, unblink: false, creep: true, figure: false, room: false, voice: true },
    steps: [{ type: "mirror", durationMs: 60000 }]
  },
  {
    id: "presence",
    title: "IV. PRESENCE",
    subtitle: "you are not the only thing in this room.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: true, room: true, voice: true, playerVoice: true, smileClip: true },
    steps: ["q13", "q14", "q15", { type: "task", task: "closeEyes" }, "q16", "q17", "q18", "q19"]
  },
  {
    id: "interview",
    title: "V. INTERVIEW",
    subtitle: "answer out loud.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: true, room: true, voice: true, playerVoice: true, smileClip: true },
    steps: [
      { type: "interrogate", prompt: "Out loud, please. Tell me about a time you were certain something was in the room with you." },
      "q20", "q21",
      { type: "task", task: "staySilent" },
      "q22", "q23",
      { type: "interrogate", prompt: "Look at the room behind you, in your feed. What's the one thing back there you'd least like to see move? Say it." },
      "q24", "q25", "q26"
    ]
  }
];