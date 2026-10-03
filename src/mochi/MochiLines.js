// Everything Mochi says, plus the whisper that follows each of her events.
//
// Same pattern as the rest of the game: a local line is ready instantly;
// if the player opted into AI, the backend is asked for a personalised one
// (it sees their name, snack, answers so far) and it replaces the local line
// only if it comes back in time. Nothing ever waits on the network.

// what kind of friend the Act III quiz says they are (f1..f5, see questions.js)
export const FRIEND_LABELS = {
  protector: "the protector friend",
  listener: "the listener friend",
  sunshine: "the sunshine friend",
  wanderer: "the free-spirit friend"
};

const fill = (text, player) => text
  .replace(/\{name\}/g, player?.name || "friend")
  .replace(/\{friend\}/g, FRIEND_LABELS[player?.friend] || "the best kind of friend");
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
  // Act II bonus round: still 100% sweet
  dressAsk: "mochi wants to look extra cute for you!! pick her something to wear ♡",
  dressReact: {
    bow: "a bow!! so classic ♡",
    crown: "princess mochi!! ♡",
    flower: "it smells so nice ♡",
    clip: "a strawberry!! mochi's favourite ♡",
    bell: "jingle jingle ♡ now you'll always hear mochi coming",
    heart: "a locket!! mochi will keep you in it ♡",
    ribbon: "so fancy!! ♡",
    none: "simple and cute. okay!! ♡"
  },
  dressDone: ["mochi looks so pretty!! she's never taking it off ♡", "{name} has the best taste ♡ mochi feels like a princess"],
  catchAsk: "mochi picked sooo many strawberries!! catch them for her? ♡",
  catchHint: "(move the basket with your mouse, or the arrow keys)",
  catchGo: "ready? here they come!! ♡",
  catchCheer: ["nice catch, {name}!! ♡", "wow wow wow!! ♡", "you're so good at this ♡", "yay!! ♡"],
  catchMiss: ["oopsie ♡", "it's okay!! there's more ♡", "whoops~ ♡"],
  catchWin: ["you caught them all!! mochi's gonna make jam ♡", "best basket ever, {name}!! ♡"],
  catchSome: "you caught {n}!! that's plenty for jam ♡",
  dessertDrum: "and the results are...",
  dessertSay: {
    daifuku: "mochi knew it!! you're a mochi too, {name} ♡",
    matcha: "ooh, calm and cosy. mochi likes that about you ♡",
    cinnamon: "warm and sweet!! mochi could tell from the start ♡",
    brulee: "crème brûlée!! so fancy, {name} ♡"
  },
  // Act III: mochi's room
  roomAsk: "this is mochi's room!! it's a little empty... help make it cosy? ♡",
  roomHint: "drag things into her room, or just tap them ♡",
  roomReact: {
    wardrobe: "so much room for bows!! ♡",
    bookshelf: "mochi loves stories ♡",
    bed: "a bed!! nap time ♡",
    couch: "so squishy!! ♡",
    toybox: "all mochi's toys!! ♡",
    plant: "mochi will water it every day ♡",
    lamp: "so cosy ♡",
    rug: "soft for mochi's paws ♡",
    picture: "so fancy ♡",
    pictureUs: "it's us!! from our picture ♡",
    clock: "it has ears like mochi!! ♡"
  },
  roomMore: "mochi brought some of her toys too!! ♡",
  roomDone: ["it's perfect!! mochi loves it sooo much ♡", "best room ever!! thank you, {name} ♡"],
  hideAsk: "let's play hide-and-seek!! mochi hides, you find her ♡",
  hideClose: "close your eyes and count!! ♡",
  hideReady: "ready or not!! ♡",
  hideWhere: "where's mochi? ♡",
  hideNot: ["not here~ ♡", "nope!! ♡", "hehe~ ♡", "cold, cold!! ♡"],
  hideFound: ["you found me!! one more ♡", "you're too good at this!! last one ♡"],
  hideCall: "...{name}?",
  hideFoundYou: "found you ♡",
  hideAfter: ["hehe!! mochi is the best at hide-and-seek ♡", "okay!! a few more questions ♡"],
  answerGeneric: ["ooh, interesting~ ♡", "mochi wrote that down ♡", "hmm hmm! ♡", "mochi had a feeling you'd say that ♡", "noted!! ♡"],
  // Act III: she's back, cute, and pretends nothing happened. Slightly wrong.
  hostAct3: [
    "mochi feels a little funny today ♡",
    "did something happen? mochi can't remember ♡",
    "mochi is fine!! mochi is always fine ♡",
    "keep going, {name}. mochi is watching ♡",
    "you still like mochi, right? ♡",
    "mochi remembers everything you said ♡",
    "don't look at the stitches ♡"
  ],
  answerAct3: ["...♡", "mochi knew you'd say that ♡", "hehe. ♡", "is that true, {name}? ♡", "mochi will remember ♡", "mhm. ♡", "mochi can't talk very well right now ♡"]
};

// ---------------------------------------------------------------- act transitions (said in MochiPlay "talk")

export const TALK = {
  // end of Act I: a real goodbye, so Act II feels like a bonus
  goodbye: ["that's all the rounds!! you did sooo good, {name} ♡", "thank you for playing with mochi ♡ bye bye!"],
  // start of Act II, after the fake ending
  bonus: ["wait wait wait!!", "don't go yet, {name}!! ♡", "mochi has a bonus round. just for you ♡"],
  // end of Act II (the bonus round): nothing's wrong, she just wants to keep playing
  bonusDone: ["that was the best bonus round ever!! ♡", "ooh, ooh!! mochi wants to show you something ♡", "come see!! ♡"],
  // end of Act III (mochi's room), into the birthday
  roomBye: ["you're {friend}, {name}!! mochi could tell ♡", "oh!! oh!! and guess what...", "it's mochi's birthday soon!! you'll come to her party, right? ♡"],
  // end of the Birthday act, right before the stitches
  quiet: ["mochi has been talking a lot, hasn't she?", "...", "mochi should be quiet now ♡"],
  // start of Act III: as if nothing happened
  whereWereWe: ["...", "hi {name}!! ♡", "where were we? ♡", "mochi feels a little funny. it's fine!! mochi is fine ♡"],
  // end of Act III, right before the eyes
  cantSee: ["{name}?", "it's getting dark, {name}. mochi can't see you very well...", "come closer ♡ let mochi look at you"]
};

/** Real things about the player's machine/place, for the moments she shouldn't know them. */
export function envInfo() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
  const hour = now.getHours();
  let city = "";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    city = (tz.split("/")[1] || "").replace(/_/g, " ");
  } catch { /* fine */ }
  return { time, hour, city, late: hour >= 22 || hour < 5 };
}

let _battery = null;
navigator.getBattery?.().then((b) => (_battery = b)).catch(() => {});
export function batteryLevel() {
  return _battery ? Math.round(_battery.level * 100) : null;
}

/**
 * Reactions that use something real. Returns a line or null (then the normal reaction is used).
 * @param {object} q question  @param {number} i option index
 * @param {{player, room, dossier, previous}} c
 */
export function specialReaction(q, i, { player, room, dossier }) {
  const name = player?.name || "friend";
  switch (q.special) {
    case "clock": {
      const e = envInfo();
      if (e.late) return `it's ${e.time} right now, ${name}. you should be asleep ♡`;
      return i === 1 ? `after midnight?? mochi will stay up with you. every night ♡` : `it's ${e.time} now. mochi's been counting ♡`;
    }
    case "room": {
      const objs = room?.objects || [];
      const people = room?.personCount ?? 1;
      if (i === 0 && people >= 2) return "then who's that behind you? ♡ ...hehe, just kidding!!";
      const o = objs[0];
      if (i === 0 && o) return `just you and your ${o.label} ♡ mochi likes it. it's ${o.where}, right?`;
      if (i === 1) return "say hi to them for mochi ♡ they can't see mochi though";
      if (i === 2) return o ? `mochi only sees you. and the ${o.label} ♡` : "mochi only sees you ♡";
      return null;
    }
    case "miss":
      return ["mochi would miss you sooo much ♡ she'd never leave", "only a little? ...okay ♡", "..."][i] || null;
    case "honest": {
      const lies = (dossier || []).filter((d) => d.mismatch).length;
      if (i === 0 && lies > 0) return `hmm. mochi doesn't think so, ${name} ♡ mochi counted ${lies}.`;
      if (i === 0) return "mochi believes you ♡ for now";
      if (i === 1) return "mostly. mochi noticed which ones ♡";
      return "thank you for telling mochi the truth ♡ finally";
    }
    default:
      return null;
  }
}

/** The repeated question: did their answer change? */
export function repeatReaction(prevText, nowText, player) {
  const name = player?.name || "friend";
  if (!prevText) return "hehe ♡";
  if (prevText === nowText) return "you said that last time too ♡ mochi remembers everything";
  return `...that's not what you said before, ${name}. you said "${prevText.replace(/[.!]+$/, "").toLowerCase()}" ♡`;
}

/** Mochi's line before each event (cute), with a personal touch when there's something to use. */
export function eventBefore(scene, player) {
  const base = {
    stitches: "shhh ♡ mochi will be very quiet now, {name}. watch ♡",
    eyes: "there you are, {name}!! ♡ let mochi look at you",
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
  if (act >= 3) return fill(pick(LINES.answerAct3), player);
  return fill(opt?.mochi || pick(LINES.answerGeneric), player);
}

/** What she says while a question is up (Act III only: she pretends nothing happened). */
export function hostLine(act, player) {
  if (act !== 3) return "";
  const e = envInfo(), bat = batteryLevel();
  const extra = [];
  if (e.city) extra.push(`it's ${e.time} in ${e.city} ♡ mochi checked`);
  if (bat != null && bat < 60) extra.push(`your battery's at ${bat}% ♡ don't leave mochi`);
  const pool = [...LINES.hostAct3, ...extra];
  return fill(pick(pool), player);
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
