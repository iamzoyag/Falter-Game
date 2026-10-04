// Mochi's injuries happen one at a time (each scene starts from cute Mochi).
// Scenes: stitches ends act IV, ears ends act V, eyes ends act VI, unzip is
// the last (act IX). These pick the right single-wound image for a moment in
// the story; WOUNDS_ALL has every injury at once (the flash at the end of
// each scene, and the ending's polaroid).

const IMG = {
  stitches: "/mochi/stitches-local.webp",
  ears: "/mochi/wounds-ears.webp",
  eyes: "/mochi/wounds-eyes.webp",
  unzip: "/mochi/wounds-unzip.webp"
};
const ORDER = [
  { after: 4, url: IMG.stitches },
  { after: 5, url: IMG.ears },
  { after: 6, url: IMG.eyes },
  { after: 9, url: IMG.unzip }
];

/** Her most recent injury as of `act` (null before the first). */
export function woundsNow(act) {
  let url = null;
  for (const s of ORDER) if (act > s.after) url = s.url;
  return url;
}

/** The injury that's coming next: for single-frame flashes (a glimpse of it). */
export function woundsNext(act) {
  for (const s of ORDER) if (act <= s.after) return s.url;
  return ORDER[ORDER.length - 1].url;
}

export const WOUNDS_ALL = "/mochi/wounds-all.webp";
