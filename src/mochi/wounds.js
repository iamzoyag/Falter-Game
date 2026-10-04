// What Mochi looks like by now. Her wounds stay on her (see
// tools/make_wound_images.py): each image is cute Mochi plus every wound so
// far. Scenes: stitches end act IV, ears end act V, eyes end act VI, unzip
// is the last (act IX).

const W = (n) => `/mochi/wounds-${n}.webp`;
const STATES = [
  { after: 4, url: W("stitches") }, // from act V on
  { after: 5, url: W("ears") },     // from act VI on
  { after: 6, url: W("eyes") },     // from act VII on
  { after: 9, url: W("unzip") }     // only at the very end
];

/** Her injuries as of `act` (null before the first one). */
export function woundsNow(act) {
  let url = null;
  for (const s of STATES) if (act > s.after) url = s.url;
  return url;
}

/** Her injuries as of `act`, plus the next one: for single-frame flashes (a glimpse of what's coming). */
export function woundsNext(act) {
  for (const s of STATES) if (act <= s.after) return s.url;
  return STATES[STATES.length - 1].url;
}

export const WOUNDS_FINAL = W("unzip");
