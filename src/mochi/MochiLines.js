// Everything Mochi says, plus the whisper that follows each of her events.
//
// Same pattern as the rest of the game: a local line is ready instantly;
// if the player opted into AI, the backend is asked for a personalised one
// (it sees their name, snack, answers so far) and it replaces the local line
// only if it comes back in time. Nothing ever waits on the network.

const fill = (text, player) => text.replace(/\{name\}/g, player?.name || "friend");
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- local lines

export const LINES = {
  greetHello: ["hiii!! i'm mochi ♡", "you came!! hi hi hi ♡"],
  greetAsk: "what's your name? ♡",
  greetName: ["{name}!! that's such a pretty name ♡", "{name}... mochi loves it ♡ mochi will remember it forever"],
  greetRules: "let's play a quiz!! three rounds, no wrong answers ♡",
  petAsk: "mochi did so good... can she have head pats? ♡",
  petHint: "(stroke her head with your mouse)",
  petDone: ["hehe ♡ that tickles!! you're the best, {name}", "mochi could stay like this forever ♡"],
  petIgnored: "...oh. that's okay. mochi understands ♡",
  feedAsk: "mochi's tummy is rumbling~ pick a snack for her!",
  feedAfter: {
    strawberry: "mmm!! sweet, just like you ♡",
    carrot: "crunchy!! a classic, {name} ♡",
    mochi: "you fed mochi... a mochi?? ...it's fine. it's delicious ♡"
  },
  polaroidAsk: "let's take a picture together!! squeeze in ♡",
  polaroidAfter: ["mochi will keep this forever ♡", "best friends!! mochi's putting this on the fridge ♡"],
  answerGeneric: ["ooh, interesting~ ♡", "mochi wrote that down ♡", "hmm hmm! ♡", "mochi had a feeling you'd say that ♡", "noted!! ♡"],
  // Act II: same Mochi, slightly wrong. She doesn't seem to remember what happened.
  hostAct2: [
    "mochi feels a little funny today ♡",
    "did something happen? mochi can't remember ♡",
    "mochi is fine!! mochi is always fine ♡",
    "keep going, {name}. mochi is watching ♡",
    "you still like mochi, right? ♡",
    "mochi remembers everything you said ♡",
    "don't look at the stitches ♡"
  ],
  answerAct2: ["...♡", "mochi knew you'd say that ♡", "hehe. ♡", "is that true, {name}? ♡", "mochi will remember ♡"]
};

/** Mochi's line before each event (cute), with a personal touch when there's something to use. */
export function eventBefore(scene, player) {
  const base = {
    stitches: "hiii {name}!! you've been sooo honest ♡ mochi has a surprise!",
    eyes: "{name}!! mochi missed you!! did you miss mochi? ♡",
    ears: "shhh... mochi's listening, {name} ♡",
    unzip: "mochi saved something for you, {name}. it's inside ♡"
  }[scene] || "♡";
  return fill(base, player);
}

/**
 * The whisper after an event. Built from what actually happened and what the
 * player told Mochi earlier, so it lands as "it remembers".
 */
export function eventAfter(scene, player, dossier, { lookAways = 0, flinch = 0 } = {}) {
  const said = (id) => dossier.find((d) => d.questionId === id)?.chosenText || null;
  const options = [];
  const cry = said("m8");
  if (cry?.startsWith("When an animal") && flinch < 2.5) options.push("you said an animal getting hurt makes you cry. you didn't.");
  if (cry?.startsWith("Nothing") ) options.push("you said nothing makes you cry. good. watch the next one.");
  if (said("m7")?.includes("best friend")) options.push("you said she could be your best friend.");
  if (said("m3")?.includes("bunny")) options.push("you wanted a bunny.");
  if (player?.snack === "strawberry" && scene === "unzip") options.push("she still tastes like strawberries.");
  if (player?.petted === false) options.push("you wouldn't even pat her head.");
  if (lookAways >= 2) options.push(`you looked away ${lookAways} times. she noticed every one.`);
  if (lookAways === 0) options.push("you didn't look away once.");
  const fallback = {
    stitches: "she won't be telling anyone.",
    eyes: "she saw too much.",
    ears: "she heard everything.",
    unzip: "now you know what's inside."
  }[scene];
  // usually the scene's own line, sometimes the personal one
  return options.length && Math.random() < 0.65 ? pick(options) : fallback;
}

/** Mochi's reaction to an answer. */
export function answerReaction(question, optionIndex, act, player) {
  const opt = question?.options?.[optionIndex];
  if (act >= 2) return fill(pick(LINES.answerAct2), player);
  return fill(opt?.mochi || pick(LINES.answerGeneric), player);
}

export function hostLine(act, player) {
  if (act === 2) return fill(pick(LINES.hostAct2), player);
  return "";
}

export const fillName = fill;

// ---------------------------------------------------------------- AI upgrade

/**
 * Ask the backend for a personalised line. Resolves to text or null; never throws.
 * @param {"answer"|"greet"|"pet"|"feed"|"polaroid"|"event-before"|"event-after"|"host"} moment
 */
export async function aiMochiLine(aiClient, enabled, moment, payload, timeoutMs = 1300) {
  if (!enabled || !aiClient?.requestMochiLine) return null;
  const res = await aiClient.requestMochiLine({ moment, ...payload }, timeoutMs);
  const text = typeof res?.text === "string" ? res.text.trim() : "";
  return text && text.length <= 140 ? text : null;
}
