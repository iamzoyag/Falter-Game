// The game as a sequence of stages. A string step is a question id from
// questions.js; objects are special segments. `features` switches director
// behaviour on per stage.
//
// `act` is the act's place in the story (I..IX). `look` is how far gone the
// world is, and it's what the colour script (body[data-act]), the music, the
// webcam filter and Mochi's AI voice all key off:
//   1 pink and honest   2 pink, quietly draining   3 dusty rose   4 1-bit black and white   5 black + dark red
//   5 black + dark red  6 black + blood red
// Several acts can share a look; the slow acts early on do.
//
// The plan (one act at a time; ★ = rebuilt, the rest are the old acts parked
// in the slot that will replace them):
//   ★ I    HELLO           the quiz, pet, feed, polaroid, a fake ending
//   ★ II   BONUS ROUND     nothing is wrong at all. dress-up, strawberry catch, "which dessert are you?"
//   ★ III  MOCHI'S ROOM    decorate, "what kind of friend are you?", hide-and-seek. wrong in a way you can't name
//   ★ IV   BIRTHDAY        cake + candles, invites (nobody comes), pin the bow, a sewing kit -> stitches
//   ★ V    WHERE WERE WE   memory (one pair never matches), a test she misquotes, your results, mochi says -> ears
//   ★ VI   LIGHTS OUT      a sleepover in your room: flashlight (she moves closer), a midnight catch -> eyes
//   ★ VII  PHOTO BOOTH     1-bit. a four-frame strip with something behind you, then stickers that won't stick to it
//   ★ VIII TEA PARTY       everyone came: pour tea for the guests you invited; pass the parcel -> scissors
//     IX   RESULTS         (old interview for now) -> unzip -> ending
//
// `songDrift` (optional): how far her song has slowed/flattened by the end of
// the act; it gets there gradually, step by step. Nothing else changes.
//
// Step types: a string is a question id. { type: "talk" } Mochi says lines
// full screen; { type: "round" } a bubbly round card; { type: "play", kind }
// a moment with Mochi (src/segments/MochiPlay.js); { type: "repeat", of } asks
// an earlier question again; { type: "features", set } changes director
// features mid-act; { type: "dim", on } keeps the question screen dark (lights out); { type: "mochi", scene } a Mochi event
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
    // After the stitches she's back, chirpy, as if nothing happened. The
    // colour has gone out of everything and the song is broken. Blink, and
    // her avatar has stitches. She plays memory (one pair is you; one pair
    // never matches), gives you a "proper" personality test and repeats each
    // answer back slightly wrong, shows you your results, then plays mochi
    // says with your face. At the end she can't hear you -> ears.
    features: { ...CALM, unblink: true, creep: true, subliminal: 2, hostHurt: true },
    steps: [
      { type: "pause", ms: 4200 },
      { type: "round", title: "round si\u0335x ♡", sub: "where were we?", glitch: true },
      { type: "talk", lines: "whereWereWe", mood: "off", flicker: "/mochi/stitches-local.webp" },
      "b3", "b4",
      { type: "play", kind: "memory" },
      { type: "round", title: "a proper test ♡", sub: "mochi wants to know the real you" },
      "p1", "p2", "p3", "p4", "p5",
      { type: "play", kind: "results" },
      "b6",
      { type: "play", kind: "simon" },
      { type: "talk", lines: "cantHear", mood: "off", flicker: "/mochi/stitches-local.webp" },
      { type: "mochi", scene: "ears" }
    ]
  },
  {
    id: "lights",
    act: 6,
    look: 3,
    card: "none",
    title: "VI. LIGHTS OUT",
    subtitle: "",
    // A sleepover in the room the player decorated. She's cute again (her
    // ears only show in flickers, and when you blink). The flashlight game:
    // she moves closer whenever the light leaves her, and once there's a
    // second her in the corner. When the lights go out for good (after it),
    // the question screen stays dark and the director wakes up: whispers,
    // voice, the feed glitch. Then a midnight snack: the strawberry catch,
    // in the dark, and what falls isn't strawberries. -> eyes
    features: { ...CALM, unblink: true, creep: true, subliminal: 2, hostHurt: true, smileClip: true },
    steps: [
      { type: "talk", lines: "lightsHello", mood: "off", flicker: "/mochi/wounds-ears.webp" },
      { type: "round", title: "sleepover round ♡", sub: "bedtime questions!" },
      "n1", "n2", "n3",
      { type: "play", kind: "flashlight" },
      { type: "dim", on: true },
      { type: "features", set: { beats: true, voice: true, scriptedGlitch: true } },
      "n4", "q10", "n5",
      { type: "features", set: { darkness: true } },
      { type: "play", kind: "nightcatch" },
      "n6",
      { type: "talk", lines: "cantSee", mood: "dark" },
      { type: "mochi", scene: "eyes" }
    ]
  },
  {
    id: "booth",
    act: 7,
    look: 4,
    card: "none",
    title: "VII. PHOTO BOOTH",
    subtitle: "",
    // After the eyes the world goes 1-bit. Mochi is cute again but can't see,
    // so she wants pictures of you. The strip shows, frame by frame, something
    // behind you; the last frame is your face, ruined, for a moment. Then
    // stickers, which won't stick to it, and it was in your first polaroid
    // too. From the booth on, the director's figure is allowed to come.
    features: { ...CALM, unblink: true, creep: true, subliminal: 2, hostHurt: true, beats: true, voice: true, scriptedGlitch: true, smileClip: true, darkness: true },
    steps: [
      { type: "talk", lines: "photoHello", mood: "off", flicker: "/mochi/wounds-eyes.webp" },
      { type: "round", title: "photo round ♡", sub: "say cheese!" },
      "ph1", "ph2",
      { type: "play", kind: "booth" },
      { type: "features", set: { figure: true } },
      "ph3", "ph4",
      { type: "play", kind: "stickers" },
      "ph5",
      { type: "talk", lines: "photoBye", mood: "off" }
    ]
  },
  {
    id: "tea",
    act: 8,
    look: 5,
    card: "none",
    title: "VIII. TEA PARTY",
    subtitle: "",
    // Black and dark red. The birthday table again, and this time everyone
    // came: the friends the player invited, sat in the chairs, that nobody
    // can see properly. Pour them tea; they whisper. Your reflection in your
    // cup has someone behind it. Pass the parcel to her broken song; the
    // last layer is yours: scissors, "for later". The presence features come
    // on after the tea, and the close-your-eyes task is still here.
    features: { ...CALM, unblink: true, creep: true, subliminal: 2, hostHurt: true, beats: true, voice: true, scriptedGlitch: true, smileClip: true, darkness: true, figure: true },
    steps: [
      { type: "talk", lines: "teaHello", mood: "off", flicker: "/mochi/wounds-eyes.webp" },
      { type: "round", title: "tea party ♡", sub: "one lump or two?" },
      "t1", "q14",
      { type: "play", kind: "tea" },
      { type: "features", set: { room: true, playerVoice: true, faceGore: true } },
      "t2", "q17",
      { type: "play", kind: "parcel" },
      "t3", "q18",
      { type: "task", task: "closeEyes" },
      "q19",
      { type: "talk", lines: "teaBye", mood: "off" }
    ]
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
