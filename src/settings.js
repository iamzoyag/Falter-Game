// Player settings. Only one for now: "reduce flashing", chosen on the
// consent screen and remembered in this browser.
//
// With it on: no full-screen strobes or negative (inverted) flashes, image
// and gore flashes fade in and out instead of popping, no screen shake, no
// red snap-flash or camera shake in the Mochi events. The scares still
// happen, just without the strobe. prefers-reduced-motion turns it on by default.

const KEY = "falter.reduceFlashing";

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v === "1";
  } catch { /* storage blocked: fall through */ }
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export const settings = {
  reduceFlashing: read()
};

export function setReduceFlashing(on) {
  settings.reduceFlashing = !!on;
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* fine, just not remembered */ }
}
