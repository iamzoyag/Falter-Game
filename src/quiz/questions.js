// Each question is framed as an innocuous self-knowledge quiz ("how well do
// you know yourself"). `expressionHint` is the expression that answer choice
// implicitly claims about the player's emotional state — the game samples
// their actual face at answer-time and checks for a mismatch. `callbackId`
// lets the HorrorDirector reference this specific answer later, by ID, once
// enough dossier entries exist to make that land.
//
// `principle` names the psychological mechanism the question is built around.
// It's threaded through to the AI backend as context, so an AI-upgraded
// whisper referencing this answer can lean into *why* it's supposed to be
// uncomfortable, not just quote it back.
//
// Ordered to escalate: early questions are closer to a normal personality
// quiz, later ones get progressively closer to the game's actual premise —
// that it's reading you in real time.

export const QUESTIONS = [
  {
    id: "q1",
    callbackId: "afraid_of_dark",
    principle: "baseline / rapport",
    prompt: "When you were a kid, were you afraid of the dark?",
    options: [
      { text: "No, never bothered me.", expressionHint: "neutral" },
      { text: "A little, but I grew out of it.", expressionHint: "neutral" },
      { text: "Yes — badly.", expressionHint: "frown" }
    ]
  },
  {
    id: "q2",
    callbackId: "alone_comfort",
    principle: "isolation / reduced social safety",
    prompt: "Right now, in this room, alone — how does that feel?",
    options: [
      { text: "Comfortable. I like being alone.", expressionHint: "neutral" },
      { text: "Fine, I just hadn't thought about it.", expressionHint: "neutral" },
      { text: "A little strange, actually.", expressionHint: "surprise" }
    ]
  },
  {
    id: "q3",
    callbackId: "trust_others",
    principle: "social evaluation threat",
    prompt: "Do you generally trust people, or assume the worst?",
    options: [
      { text: "I trust people until they give me a reason not to.", expressionHint: "neutral" },
      { text: "I keep my guard up.", expressionHint: "neutral" },
      { text: "Depends who's watching.", expressionHint: "smile" }
    ]
  },
  {
    id: "q4",
    callbackId: "someone_behind",
    principle: "hypervigilant threat-scanning",
    prompt: "If you felt like someone was standing behind you right now, what would you do?",
    options: [
      { text: "Turn around immediately.", expressionHint: "neutral" },
      { text: "Ignore it — it's nothing.", expressionHint: "neutral" },
      { text: "I'd rather not think about that.", expressionHint: "frown" }
    ]
  },
  {
    id: "q5",
    callbackId: "lying_tell",
    principle: "self-referential threat",
    prompt: "Do you think you're good at hiding how you really feel?",
    options: [
      { text: "Yes, I have a good poker face.", expressionHint: "neutral" },
      { text: "Not really — it shows.", expressionHint: "neutral" },
      { text: "I've never had to find out.", expressionHint: "smile" }
    ]
  },
  {
    id: "q6",
    callbackId: "watched_feeling",
    principle: "gaze detection / 'psychic staring' effect",
    prompt: "Have you ever had the feeling you were being watched, and later found out you were right?",
    options: [
      { text: "No, that's never happened.", expressionHint: "neutral" },
      { text: "Once. Maybe.", expressionHint: "surprise" },
      { text: "I don't want to talk about it.", expressionHint: "frown" }
    ]
  },
  {
    id: "q7",
    callbackId: "pareidolia_face",
    principle: "hyperactive agency detection / pareidolia",
    prompt: "Have you ever seen a face in something that wasn't a face — a stain, a shadow, an outlet — and felt like it was looking back?",
    options: [
      { text: "No, never.", expressionHint: "neutral" },
      { text: "Yes, and it stuck with me.", expressionHint: "frown" },
      { text: "All the time. Doesn't bother me.", expressionHint: "smile" }
    ]
  },
  {
    id: "q8",
    callbackId: "mirror_gazing",
    principle: "strange-face-in-the-mirror illusion / derealization",
    prompt: "Have you ever looked at your own reflection long enough that it stopped looking like you?",
    options: [
      { text: "No.", expressionHint: "neutral" },
      { text: "Once, and I looked away.", expressionHint: "frown" },
      { text: "Yes — and I kept looking.", expressionHint: "surprise" }
    ]
  },
  {
    id: "q9",
    callbackId: "uncertainty_preference",
    principle: "intolerance of uncertainty (not-knowing is often worse than a bad known outcome)",
    prompt: "Would you rather know something bad is about to happen, or not know at all?",
    options: [
      { text: "I'd want to know. Always.", expressionHint: "neutral" },
      { text: "Depends how bad.", expressionHint: "surprise" },
      { text: "I'd rather not know.", expressionHint: "frown" }
    ]
  },
  {
    id: "q10",
    callbackId: "sleep_presence",
    principle: "hypnagogic / sleep-paralysis-adjacent presence sensations",
    prompt: "Have you ever woken up certain something was in the room with you — even after you knew it wasn't?",
    options: [
      { text: "No, never.", expressionHint: "neutral" },
      { text: "Once or twice.", expressionHint: "surprise" },
      { text: "More than I've told anyone.", expressionHint: "frown" }
    ]
  },
  {
    id: "q11",
    callbackId: "control_loss",
    principle: "perceived loss of control",
    prompt: "How much of what happens in the next five minutes do you think you actually control?",
    options: [
      { text: "Most of it.", expressionHint: "neutral" },
      { text: "Some of it.", expressionHint: "neutral" },
      { text: "Less than I'd like.", expressionHint: "frown" }
    ]
  },
  {
    id: "q12",
    callbackId: "stranger_read",
    principle: "Barnum/personalization priming — sets up the AI ending report",
    prompt: "If a stranger watched your face for the last few minutes, do you think they'd know something about you that you haven't said out loud?",
    options: [
      { text: "No, I'm not that easy to read.", expressionHint: "smile" },
      { text: "Maybe something small.", expressionHint: "surprise" },
      { text: "Probably more than I'd like.", expressionHint: "frown" }
    ]
  },
  {
    id: "q13",
    callbackId: "room_changed",
    principle: "liminality / threshold unease",
    prompt: "Does this room feel like the same room it was when you started?",
    options: [
      { text: "Yes, nothing's changed.", expressionHint: "neutral" },
      { text: "Hasn't it always felt this way.", expressionHint: "surprise" },
      { text: "No — something's different.", expressionHint: "frown" }
    ]
  },
  {
    id: "q14",
    callbackId: "heartbeat_awareness",
    principle: "interoception / somatic anxiety awareness",
    prompt: "Right now — are you aware of your own heartbeat?",
    options: [
      { text: "No.", expressionHint: "neutral" },
      { text: "A little, now that you mention it.", expressionHint: "surprise" },
      { text: "Yes. I have been the whole time.", expressionHint: "frown" }
    ]
  },
  {
    id: "q15",
    callbackId: "scream_distance",
    principle: "isolation / evolutionary threat (distance from help)",
    prompt: "If you screamed right now, how long before someone could actually reach you?",
    options: [
      { text: "Immediately — someone's close.", expressionHint: "neutral" },
      { text: "A few minutes.", expressionHint: "neutral" },
      { text: "I'd rather not think about that.", expressionHint: "frown" }
    ]
  },
  {
    id: "q16",
    callbackId: "rules_breaking",
    principle: "violation of expectation / broken pattern anxiety",
    prompt: "If this game broke its own rules right now, would that scare you more or less than if it did exactly what you expected?",
    options: [
      { text: "More — I like knowing what to expect.", expressionHint: "frown" },
      { text: "Less. Rules are just what it wants me to believe.", expressionHint: "smile" },
      { text: "I hadn't thought about it that way.", expressionHint: "surprise" }
    ]
  },
  {
    id: "q17",
    callbackId: "peripheral_flinch",
    principle: "threat-superiority effect / negativity bias (Öhman & Mineka, 2001)",
    prompt: "If something moved in your peripheral vision right now, would you notice it before you could explain why?",
    options: [
      { text: "Yes — I'd see it before I could think about it.", expressionHint: "surprise" },
      { text: "Probably not, I don't really watch my peripheral vision.", expressionHint: "neutral" },
      { text: "I'd rather not test that right now.", expressionHint: "frown" }
    ]
  },
  {
    id: "q18",
    callbackId: "almost_human",
    principle: "uncanny valley (Mori, 1970)",
    prompt: "Does something that looks almost human — but not quite — bother you more than something that doesn't look human at all?",
    options: [
      { text: "No, not really.", expressionHint: "neutral" },
      { text: "A little. The 'almost' is the part that gets me.", expressionHint: "frown" },
      { text: "I try not to look at those too long.", expressionHint: "surprise" }
    ]
  },
  {
    id: "q19",
    callbackId: "unreadable_intent",
    principle: "creepiness as unpredictability of intent (McAndrew & Koehnke, 2016)",
    prompt: "What's scarier: someone who's clearly hostile, or someone whose intentions you can't read at all?",
    options: [
      { text: "Clearly hostile — at least I know what's coming.", expressionHint: "neutral" },
      { text: "Unreadable. Not knowing is worse.", expressionHint: "frown" },
      { text: "I've never thought about the difference.", expressionHint: "surprise" }
    ]
  },
  {
    id: "q20",
    callbackId: "did_i_move_that",
    principle: "ideomotor effect / illusion of external agency (Wegner, 2002)",
    prompt: "Have you ever moved something slightly — a glass, a pen — and, for a second, not been sure if you did it or it moved on its own?",
    options: [
      { text: "No, never.", expressionHint: "neutral" },
      { text: "Once, and I've thought about it since.", expressionHint: "frown" },
      { text: "That happens more than I'd like to admit.", expressionHint: "surprise" }
    ]
  },
  {
    id: "q21",
    callbackId: "hand_not_yours",
    principle: "body ownership / rubber hand illusion (Botvinick & Cohen, 1998)",
    prompt: "Right now, does your hand on the mouse or keyboard still feel like it's fully yours — or is it just background?",
    options: [
      { text: "Fully mine, I'm aware of it.", expressionHint: "neutral" },
      { text: "Background. I hadn't thought about it until you asked.", expressionHint: "surprise" },
      { text: "Now that you ask... it feels strange.", expressionHint: "frown" }
    ]
  },
  {
    id: "q22",
    callbackId: "performing_for_camera",
    principle: "objective self-awareness theory (Duval & Wicklund, 1972)",
    prompt: "Now that you know a camera's been watching your face this whole time, has the way you're sitting changed?",
    options: [
      { text: "No, I haven't thought about it.", expressionHint: "neutral" },
      { text: "A little. I've been more careful.", expressionHint: "surprise" },
      { text: "Yes — I noticed myself performing.", expressionHint: "frown" }
    ]
  },
  {
    id: "q23",
    callbackId: "how_closely_watched",
    principle: "spotlight effect (Gilovich, Medvec & Savitsky, 2000)",
    prompt: "How closely do you think this game is actually paying attention to you, versus how closely it feels like it is?",
    options: [
      { text: "About the same.", expressionHint: "neutral" },
      { text: "It probably notices less than it feels like.", expressionHint: "smile" },
      { text: "I think it's noticing more than I want it to.", expressionHint: "frown" }
    ]
  },
  {
    id: "q24",
    callbackId: "second_presence",
    principle: "sensed-presence in isolation / \"Third Man\" phenomenon",
    prompt: "Alone for long enough, have you ever felt like there was a second presence in the room with you — not scary, just there?",
    options: [
      { text: "No, never.", expressionHint: "neutral" },
      { text: "Once, somewhere quiet.", expressionHint: "surprise" },
      { text: "More than once. I don't bring it up.", expressionHint: "frown" }
    ]
  },
  {
    id: "q25",
    callbackId: "word_in_noise",
    principle: "auditory pareidolia — hearing structure in random noise",
    prompt: "In white noise — a fan, static, running water — have you ever been sure you heard a word in it?",
    options: [
      { text: "No, never.", expressionHint: "neutral" },
      { text: "Once or twice, and I couldn't un-hear it.", expressionHint: "surprise" },
      { text: "Yes. I've stopped listening closely to white noise.", expressionHint: "frown" }
    ]
  },
  {
    id: "q26",
    callbackId: "final_honesty",
    principle: "self-referential threat, closing the loop the game opened early",
    prompt: "Last one. Has every answer you've given so far been true?",
    options: [
      { text: "Yes, all of it.", expressionHint: "neutral" },
      { text: "Mostly.", expressionHint: "neutral" },
      { text: "No.", expressionHint: "any" }
    ]
  }
];