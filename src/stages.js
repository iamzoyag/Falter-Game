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
//   ★ III  MOCHI'S ROOM    decorate, "what kind of friend are you?", hide-and-seek. wrong in a way you can't name
//   ★ IV   BIRTHDAY        cake + candles, invites (nobody comes), pin the bow, a sewing kit -> stitches
//     V    WHERE WERE WE   (old act III for now) memory match, the "proper" test -> ears
//     VI   LIGHTS OUT      (to build) flashlight, falling things -> eyes
//     VII  PHOTO BOOTH     (to build) 1-bit; the strip prints wrong
//     VIII TEA PARTY       (old presence act for now)
//     IX   RESULTS         (old interview for now) -> unzip -> ending
//
// `songDrift` (optional): how far her song has slowed/flattened by the end of
// the act; it gets there gradually, step by step. Nothing else changes.
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
    id: "room",
    act: 3,
    look: 1,
    card: "none",
    title: "III. MOCHI'S ROOM ♡",
    subtitle: "",
    // Still look 1: pink, sweet, no subliminals. Two things are off and you
    // can't put your finger on either: her song slows a hair over the act,
    // and in the last round of hide-and-seek she's in the corner facing the
    // wall ("found you ♡"). Then straight back to normal.
    features: CALM,
    songDrift: { tempo: 0.95, cents: -14, wobble: 0.03 },
    steps: [
      { type: "play", kind: "decorate" },
      { type: "round", title: "friend round ♡", sub: "what kind of friend are you?" },
      "f1", "f2", "f3",
      { type: "play", kind: "hide" },
      "f4", "f5",
      { type: "talk", lines: "roomBye" }
    ]
  },
  {
    id: "birthday",
    act: 4,
    look: 2,
    card: "none",
    title: "IV. BIRTHDAY ♡",
    subtitle: "",
    // Her party. The pink drains a little with every step, the song keeps
    // slowing, and the first subliminals arrive (single frames, a breath).
    // Everything odd has an innocent explanation: she can't remember her age,
    // a trick candle, guests who got lost, a game where she moves. The present
    // she bought herself is a sewing kit -> stitches.
    features: { ...CALM, subliminal: 1 },
    drift: true,
    steps: [
      { type: "talk", lines: "birthdayHello" },
      { type: "play", kind: "cake" },
      { type: "repeat", of: "m2" },
      { type: "round", title: "party round ♡", sub: "birthday questions!!" },
      "g1", "b2", "g2",
      { type: "play", kind: "invite" },
      "g4", "b5",
      { type: "play", kind: "pinbow" },
      "g3",
      { type: "play", kind: "gift" },
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
      // placeholder until act V is rebuilt: the old bonus round's sharpest questions
      "b3", "b4", "b6",
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
