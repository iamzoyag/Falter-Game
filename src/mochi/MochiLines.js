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

import { placePhrase } from "../core/Whereabouts.js";

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
    heart: "a heart locket!! so shiny ♡ mochi loves it",
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
  // Act IV: mochi's birthday. everything odd has an innocent explanation
  cakeAsk: ["mochi baked her own birthday cake!! but it's sooo plain... help? ♡", "it's mochi's birthday cake!! it needs to be perfect ♡ help mochi?"],
  cakeFrost: "first, the frosting!! ♡",
  cakeFrostReact: {
    strawberry: "pink!! mochi's favourite ♡",
    vanilla: "classic!! ♡",
    chocolate: "ooh, fancy ♡",
    matcha: "so pretty!! ♡"
  },
  cakeTop: "now the toppings!! pick one and tap the cake ♡",
  cakeTopHint: "pick a topping, then tap the cake (or tap the topping again) ♡",
  cakeTopMore: "more more more!! ♡",
  cakeDone: ["it's the prettiest cake ever ♡", "mochi almost doesn't want to eat it ♡"],
  cakeAge: "now the candles!! how old is mochi turning...?",
  cakeAge2: "hmm. mochi doesn't remember. three!! let's say three ♡",
  cakeBlow: "make a wish and blow them out!! ♡",
  cakeBlowHold: "hold to blow",
  cakeBlowHint: "blow into your mic, or hold the button (or space) ♡",
  cakeWish: "yaaay!! ♡",
  cakeTrick: "hehe!! trick candles ♡ one more time!!",
  cakeWishMochi: "mochi made a wish too ♡",
  cakeWishMochi2: "mochi wished you'd stay forever ♡",
  inviteAsk: ["a party needs guests!! who should mochi invite? ♡", "mochi wants to invite your friends!! who are they? ♡"],
  inviteNobodyBtn: "it's just us ♡",
  inviteSent: "invitations sent!! {n} friends are coming ♡",
  inviteNobody: "just us two!! that's okay. mochi saved two extra chairs, just in case ♡",
  wait1: "they'll be here soon!! ♡",
  wait2: "mochi told them three o'clock ♡",
  waitNobody1: "maybe someone will show up!! ♡",
  waitNobody2: "mochi put out extra hats, just in case ♡",
  wait3: "any minute now ♡",
  wait4: "maybe they got lost ♡",
  wait5: "it's okay.",
  wait6: "mochi doesn't need them. mochi has you ♡",
  waitNobody6: "mochi only needed you anyway ♡",
  pinAsk: "party game!! pin the bow on mochi ♡",
  pinRules: "you'll be blindfolded... no peeking!! ♡",
  pinBlind: "you're blindfolded ♡ click where mochi's head is",
  pinMoved: ["hehe!! mochi moved ♡", "oopsie!! mochi wiggled ♡"],
  pinAgain: "one more!! mochi will stay still this time ♡",
  pinBoo: "boo!! ♡",
  pinGotYou: "hehe!! got you, {name} ♡ you should see your face",
  giftAsk: "and now... presents!! ♡",
  giftAsk2: "mochi got herself something. will you open it for her? ♡",
  giftHint: "click the present ♡",
  giftWhat: "a sewing kit!! ♡",
  giftFix: "now mochi can fix anything ♡",
  giftTalkative: "mochi has been talking a lot today, hasn't she?",
  giftQuiet: "mochi should be quiet now ♡",
  // Act V: where were we? (she's fine. mochi is fine.)
  memAsk: "let's play a game!! a memory game ♡ mochi loves memories",
  memRules: "find the pairs!! ♡",
  memMatch: ["a match!! ♡", "you remembered ♡", "good memory, {name} ♡"],
  memYou: "it's you!! ♡ mochi took those just now",
  memMochiEarly: "not those ones. not yet ♡",
  memMochiNo: ["hmm? those should match ♡", "try again ♡ they're the same. look closer"],
  memMochiMatch: "there ♡ now they match",
  resTitle: "your results ♡",
  resDrum: "mochi added everything up...",
  resNote: "based on everything you've told mochi. and everything you didn't ♡",
  resSay: "mochi knows you better than you know yourself, {name} ♡",
  resNotAlone: "...are you sure? ♡",
  simonAsk: "let's play mochi says!! ♡",
  simonRules: "only do it if mochi says so ♡ mochi is watching your face",
  simonSays: "mochi says...",
  simonSmile: "smile!! ♡",
  simonSmileNo: "a real smile, {name} ♡ ...okay, that one's fine",
  simonCantSee: "mochi can't see you very well ♡ that's okay",
  simonGood: "so cute ♡",
  simonTurn: "turn your head!!",
  simonGood2: "good!! ♡",
  simonClose: "close your eyes.",
  simonGotcha: "hehe!! mochi didn't say ♡",
  simonNotFooled: "good!! mochi didn't say ♡",
  simonCloseReal: "close your eyes. and keep them closed ♡",
  simonCount: ["one...", "two...", "three...", "four..."],
  simonPeeked: "you peeked ♡ mochi saw",
  simonOpen: "okay ♡ you can open them",
  simonBlink: "don't blink ♡",
  simonBlinked: "you blinked ♡ mochi saw that",
  simonNoBlink: "wow!! ♡ your eyes must be so dry",
  simonSpeak: "say \"i love you, mochi\" ♡",
  simonLouder: "hm? mochi can't hear you...",
  simonQuiet: "say it, {name}... mochi can't hear you",
  simonLouderCmd: "louder ♡",
  // Act VI: lights out. a sleepover, in the room you made
  lightsAsk: "it's a sleepover!! in mochi's room ♡ the one you made",
  lightsSleepover: "pyjamas on!! teeth brushed!! ♡",
  lightsOut: "lights out!! ♡",
  lightsStars: "oh no... mochi's glow-in-the-dark stars fell off the ceiling ♡",
  lightsTorch: "here, take mochi's flashlight ♡ find them for her? mochi's right here",
  lightsFound: ["one!! ♡", "two!! you're so good at this ♡", "three ♡ mochi's right here, {name}", "four!! one more ♡"],
  lightsFoundAny: ["found one!! ♡"],
  lightsPoke: ["hehe!! that's just mochi ♡", "not mochi, silly!! the stars ♡", "boo ♡ hehe"],
  lightsTwin: "what are you looking at, {name}? ♡",
  lightsRest: "mochi found the rest!! ♡",
  lightsAll: "all of them!! mochi's ceiling is so pretty again ♡",
  lightsOn: ["see? ♡ nothing to be scared of", "mochi stayed right next to you ♡"],
  lightsOnMoved: ["see? ♡ nothing to be scared of", "mochi didn't move. mochi was right here the whole time ♡"],
  nightAsk: "mochi's tummy is rumbling ♡ midnight snack!!",
  nightRules: "mochi's up high. catch what she drops? ♡ don't turn the big light on. you'll wake everyone",
  nightGo: "here they come ♡",
  nightSee: {
    wet: "that one's a little wet ♡ mochi washed it",
    button: "mochi's buttons!! from her sewing kit ♡",
    thread: "careful, there's a needle ♡",
    earL: "ooh!! that's mochi's ♡ catch it, {name}!!",
    earR: "the other one!! ♡",
    eye: "...careful with that one ♡"
  },
  nightGotEar: "you caught it!! ♡ mochi doesn't need it anymore. but it's nice to keep",
  nightDropEar: "you dropped mochi's ear ♡ that's okay",
  nightLook: "let's see what you caught!! ♡",
  nightEarsBoth: "both of mochi's ears ♡ you kept them safe",
  nightEarsOne: "one of mochi's ears ♡ just one",
  nightEyeKept: ["and you caught that one ♡", "keep it safe for mochi. she can't see very well tonight ♡"],
  nightEyeDropped: ["you dropped the last one ♡", "that's okay. mochi still has two ♡"],
  nightBye: "...mochi isn't hungry anymore ♡",
  hostAct6: [
    "it's a sleepover ♡ nobody leaves a sleepover",
    "mochi can't hear you very well ♡ that's okay",
    "mochi can still see you ♡",
    "is it dark where you are, {name}? ♡",
    "don't look at mochi's ears ♡",
    "shh. everyone's asleep ♡"
  ],
  // Act VII: photo booth. mochi can't see anymore. she wants pictures of you
  boothAsk: "it's a photo booth!! ♡ four pictures. mochi will count",
  boothRules: "pose for mochi!! she can't see, so be extra cute for her ♡",
  boothSmile: "first one!! a big smile ♡",
  boothSilly: "now a silly face!! ♡",
  boothScared: "now a scared face!! like you just saw a ghost ♡",
  boothStill: "last one ♡ look right into the camera. don't move",
  boothPose: ["smile ♡", "silly face!!", "scared!!", "don't move."],
  boothAfter: ["hehe ♡ mochi bets that one's so cute", "you're doing so good ♡ mochi can hear you breathing", "one more ♡ stay right there", ""],
  boothPrint: "printing!! ♡",
  boothAsk2: "how did they come out? ♡ mochi can't see them",
  boothAnswers: ["so cute ♡", "there's someone behind me", "..."],
  boothReply: ["yay!! mochi knew it ♡", "...mochi only asked for you ♡", "...that bad? hehe ♡ mochi's sure you look perfect"],
  stickAsk: "now stickers!! ♡ mochi can't see, so you decorate them for her",
  stickHint: "drag stickers onto the pictures, or tap one and tap a picture ♡",
  stickReact: ["so cute!! ♡", "perfect ♡", "mochi loves it ♡", "more more!! ♡", "hehe ♡"],
  stickPeel: ["hm? it won't stick there ♡", "not there ♡ put them on you", "mochi can't see it either ♡ leave it"],
  stickFridge: "mochi's putting it on the fridge ♡ right next to our first picture!!",
  stickHappy: "we look so happy in that one ♡",
  stickHappy2: "just the two of us ♡",
  hostAct7: [
    "mochi can't see the questions ♡ read them to her?",
    "is that you, {name}? ♡",
    "mochi can still hear you breathing ♡",
    "say cheese ♡",
    "don't look behind you ♡ it's rude in pictures",
    "mochi will remember your face forever ♡"
  ],
  // Act VIII: the tea party. everyone came this time
  teaCame: "everyone came this time ♡ see? mochi told you they would",
  teaHers: "you didn't invite anyone... so mochi invited some friends of her own ♡",
  teaAsk: "pour everyone some tea!! fill it to the line ♡",
  teaHint: "hold to pour (mouse, touch or space), let go at the line ♡",
  teaFor: ["this one's for {guest} ♡", "now {guest}'s ♡", "{guest} next!! ♡"],
  teaNoName: "mochi's friend",
  teaYou: "and one for you, {name} ♡",
  teaMore: "a little more ♡",
  teaPerfect: ["perfect!! ♡", "just right ♡", "so neat ♡"],
  teaBrim: "right to the top ♡ careful",
  teaSpill: "oopsie ♡ it's okay. it doesn't stain",
  teaThanks: "{guest} says thank you ♡",
  guestWhisper: ["we came for you, {name}.", "you're not the only thing in this room.", "it's rude to stare.", "we've been here the whole time.", "thank you. it's warm."],
  parcelAsk: "party game!! pass the parcel ♡",
  parcelRules: "pass it round while the music plays. when it stops, you unwrap a layer ♡",
  parcelGo: "go go go!! ♡",
  parcelAgain: ["again!! ♡", "keep passing ♡", "round and round ♡"],
  parcelPassBtn: "pass it ♡",
  parcelYours: "pass it on, {name}!! quick ♡",
  parcelStop: "the music stopped!! {guest} gets to open a layer ♡",
  parcelGot: "{guest} got a {prize} ♡",
  parcelMochi: "ooh!! mochi's turn ♡",
  parcelMochiGot: "a ribbon!! mochi will wear it forever ♡",
  parcelYourTurn: "it stopped on you, {name}!! the last layer is yours ♡",
  parcelOpenHint: "tap the parcel to unwrap it ♡",
  parcelTag: "for later ♡",
  parcelScissors: "scissors!! the best prize ♡",
  parcelLater: "keep them safe for mochi. she'll need them later ♡",
  hostAct8: [
    "everyone's watching you answer ♡",
    "more tea, {name}? ♡",
    "mochi can't see the guests either ♡ it's the candles",
    "don't be rude ♡ say hello to them",
    "they like you, {name} ♡",
    "nobody leaves a tea party early ♡"
  ],
  // Act IX: results. the last result knows things you never typed
  scratchAsk: "your results are ready!! ♡ mochi made them into scratch cards",
  scratchRules: "scratch them off ♡ one at a time, or all at once",
  scratchDessert: "mochi knew it ♡",
  scratchFriend: "the best kind ♡",
  scratchBunny: "so cute ♡ just like mochi said",
  scratchFace: "mochi kept this one ♡",
  scratchNow: "mochi checked ♡",
  scratchBehind: "it's so empty without you ♡",
  scratchBehindCap: "mochi took you out ♡ so you can see what's behind you",
  scratchBehindPlain: "your room ♡ mochi likes it",
  scratchBehindCapPlain: "your room ♡ right now",
  scratchNudge: "keep scratching ♡ there's more",
  scratchLocked: "the last result is inside mochi ♡",
  scratchLast: "and the last one... the real you ♡",
  scratchInside: "mochi saved it for you. it's inside ♡",
  openKept: "you kept the scissors, right? from the party ♡ mochi said they were for later",
  openNoScissors: "mochi brought scissors ♡ just in case",
  openAsk: "it's later now ♡",
  openHint: "cut along the line ♡ (drag down it, or tap along it)",
  openGood: "that's it ♡ keep going",
  openHerself: "it's okay ♡ mochi will do it herself",
  openThanks: "thank you, {name} ♡",
  hostAct9: [
    "almost done, {name} ♡",
    "mochi's adding it all up ♡",
    "don't change your answers now ♡",
    "mochi knows the real you ♡",
    "it's okay. mochi still likes you ♡",
    "you can't leave before your results ♡"
  ],
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
  // ...or, if they pressed "play again" on the fake ending
  bonusAgain: ["wait wait wait!!", "no need to start over, {name}!! ♡", "mochi has a bonus round. just for you ♡"],
  // end of Act II (the bonus round): nothing's wrong, she just wants to keep playing
  bonusDone: ["that was the best bonus round ever!! ♡", "ooh, ooh!! mochi wants to show you something ♡", "come see!! ♡"],
  // start of Act VI (after the ears)
  lightsHello: ["...", "hi {name} ♡", "mochi can't hear very well anymore. it's okay!! mochi can still see you ♡", "it's getting late... stay over? ♡"],
  // start of Act IX (results), after the tea party
  resultsHello: ["...", "okay!! last round ♡", "then your results. mochi's been saving them ♡"],
  // start of Act VIII (tea party)
  teaHello: ["tea party!! ♡", "mochi set the table just like her birthday", "and this time everyone came ♡"],
  // end of Act VIII, into the results
  teaBye: ["that was the best party ever ♡", "now... mochi has your results, {name}. all of them ♡", "everything you told mochi. and everything you didn't ♡"],
  // start of Act VII (photo booth), after the eyes
  photoHello: ["...", "{name}? is that you? ♡", "mochi can't see anymore ♡ it's okay!!", "take pictures for mochi? then she'll always have your face ♡"],
  // end of Act VII, into the tea party
  photoBye: ["mochi will keep them forever ♡", "now... a tea party!! ♡ and this time, everyone's coming"],
  // end of Act V, before the ears
  cantHear: ["{name}?", "mochi can't hear you...", "why can't mochi hear you? ♡"],
  // start of Act IV, the birthday
  birthdayHello: ["it's mochi's birthday!! ♡", "you came, {name}!! mochi knew you would ♡"],
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
  // where they are, if the browser told us (src/core/Whereabouts.js): "at kanakia paris",
  // "in bandra east"... never the timezone's city, which is often the wrong one
  return { time, hour, where: placePhrase(), late: hour >= 22 || hour < 5 };
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
  if (cry?.startsWith("Anything with an animal") && flinch < 2.5) options.push("you said animals in movies make you cry. you didn't.");
  if (cry?.startsWith("Nothing")) options.push("you said nothing makes you cry. good. watch the next one.");
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
  if (opt?.misquote) return fill(opt.misquote, player); // Act V's test: she gets it slightly wrong
  if (opt?.dark) return fill(opt.dark, player); // Act VI's bedtime questions have their own
  if (act >= 3) return fill(pick(LINES.answerAct3), player);
  return fill(opt?.mochi || pick(LINES.answerGeneric), player);
}

/** What she says while a question is up (looks 3-6: she pretends nothing happened; Acts VI-IX have their own). */
export function hostLine(act, player, storyAct = act) {
  if (act < 3 || act > 6) return "";
  const e = envInfo(), bat = batteryLevel();
  const extra = [];
  if (e.where) extra.push(`it's ${e.time} ${e.where} ♡ mochi checked`);
  if (bat != null && bat < 60) extra.push(`your battery's at ${bat}% ♡ don't leave mochi`);
  const own = { 6: LINES.hostAct6, 7: LINES.hostAct7, 8: LINES.hostAct8, 9: LINES.hostAct9 }[storyAct] || LINES.hostAct3;
  const pool = [...own, ...extra];
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
