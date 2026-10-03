// The game as a sequence of stages. A string step is a question id from
// questions.js; objects are special segments. `features` switches director
// behaviour on per stage.
//
// `act` is the act's place in the story (I..IX). `look` is how far gone the
// world is, and it's what the colour script (body[data-act]), the music, the
// webcam filter and Mochi's AI voice all key off:
//   1 pink and honest   2 pink, quietly draining   3 dusty rose
//   5 black + dark red  6 black + blood red
// Several acts can share a look; the slow acts early on do.
//
// The plan (one act at a time; ★ = rebuilt, the rest are the old acts parked
// in the slot that will replace them):
//   ★ I    HELLO           the quiz, pet, feed, polaroid, a fake ending
//   ★ II   BONUS ROUND     nothing is wrong at all. dress-up, strawberry catch, "which dessert are you?"
//     III  MOCHI'S ROOM    (to build) decorate + hide-and-seek. wrong in a way you can't name
//     IV   BIRTHDAY        (old bonus act for now) pink drains -> stitches
//     V    WHERE WERE WE   (old act III for now) memory match, the "proper" test -> ears
//     VI   LIGHTS OUT      (to build) flashlight, falling things -> eyes
//     VII  PHOTO BOOTH     (to build) 1-bit; the strip prints wrong
//     VIII TEA PARTY       (old presence act for now)
//     IX   RESULTS         (old interview for now) -> unzip -> ending
//
// Step types: a string is a question id. { type: "talk" } Mochi says lines
// full screen; { type: "round" } a bubbly round card; { type: "play", kind }
// a moment with Mochi (src/segments/MochiPlay.js); { type: "repeat", of } asks
// an earlier question again; { type: "features", set } changes director
// features mid-act; { type: "mochi", scene } a Mochi event
// (src/segments/MochiSegment.js); plus task / interrogate.
// `card`: "stage" shows the act's title card first, "none" lets Mochi carry the transition.

const CALM = { beats: false, darkness: false, unblink: false, creep: false, figure: false, room: false, voice: false };

export const STAGES = [
  {
    id: "hello",
    act: 1,
    look: 1,
    card: "stage",
    title: "I. HELLO ♡",
    subtitle: "a getting-to-know-you quiz with mochi",
    features: CALM,
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
    look: 1,
    card: "none",
    title: "II. BONUS ROUND ♡",
    subtitle: "",
    // After the fake ending she bursts back in, and... it's just more fun.
    // Nothing is wrong here, on purpose: it proves the post-credits bit is
    // harmless, so the player lets their guard down a second time. The only
    // seeds are things they choose (her outfit, their dessert) that come back.
    features: CALM,
    steps: [
      { type: "talk", lines: "bonus" },
      { type: "round", title: "bonus round ♡", sub: "just for you!" },
      { type: "play", kind: "dressup" },
      { type: "round", title: "which dessert are you? ♡", sub: "a very serious personality test" },
      "d1", "d2", "d3",
      { type: "play", kind: "catch" },
      "d4", "d5",
      { type: "play", kind: "dessert" },
      { type: "talk", lines: "bonusDone" }
    ]
  },
  {
    id: "birthday",
    act: 4,
    look: 2,
    card: "none",
    title: "IV. BIRTHDAY ♡",
    subtitle: "",
    // still pink, still cute. Underneath: a heartbeat, a 19 Hz hum, the song
    // drifting flat, single frames of a hurt Mochi, breathing behind the music.
    features: { beats: false, darkness: false, unblink: false, creep: false, figure: false, room: false, voice: false, subliminal: 1 },
    drift: true,
    steps: [
      // placeholder until the Birthday act is built: the old bonus questions
      { type: "round", title: "round five ♡", sub: "a little more about you~" },
      "b1", "b2",
      { type: "repeat", of: "m2" },
      "b3", "b4", "b5", "b6",
      { type: "talk", lines: "quiet", mood: "off" },
      { type: "mochi", scene: "stitches" }
    ]
  },
  {
    id: "where",
    act: 5,
    look: 3,
    card: "none",
    title: "V. WHERE WERE WE ♡",
    subtitle: "",
    // she's back, cute, and acts like nothing happened. The colour's gone out
    // of everything and the song is broken. Blink, and she has stitches.
    features: { beats: false, darkness: false, unblink: true, creep: true, figure: false, room: false, voice: false, subliminal: 2, hostHurt: true },
    steps: [
      { type: "pause", ms: 4200 },
      { type: "round", title: "round si\u0335x ♡", sub: "where were we?", glitch: true },
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
    id: "presence",
    act: 8,
    look: 5,
    card: "stage",
    title: "VIII. PRESENCE",
    subtitle: "you are not the only thing in this room.",
    features: { beats: true, darkness: true, unblink: true, creep: true, figure: true, room: true, voice: true, playerVoice: true, smileClip: true, faceGore: true },
    // the ears scene lived after the mirror; parked here until act V is rebuilt
    steps: [{ type: "mochi", scene: "ears" }, "q13", "q14", "q15", { type: "task", task: "closeEyes" }, "q16", "q17", "q18", "q19"]
  },
  {
    id: "interview",
    act: 9,
    look: 6,
    card: "stage",
    title: "IX. INTERVIEW",
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
