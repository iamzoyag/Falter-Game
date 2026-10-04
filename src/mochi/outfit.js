// Mochi's outfit, picked by the player in Act II's dress-up. She wears it on
// every screen from then on, so whatever happens to her later happens to the
// bunny they dressed.
//
// Positions are fractions of the cute.webp square (768x768): her head sits
// in the top half, the gap between her ears is around (0.5, 0.27), her chin
// around (0.5, 0.64). `size` is a fraction of the image's height.

export const HEAD_ITEMS = [
  { id: "bow", glyph: "🎀", label: "bow", x: 0.37, y: 0.27, size: 0.17, rot: -18 },
  { id: "crown", glyph: "👑", label: "crown", x: 0.52, y: 0.25, size: 0.16, rot: 4 },
  { id: "flower", glyph: "🌸", label: "flower", x: 0.36, y: 0.3, size: 0.14, rot: -10 },
  { id: "clip", glyph: "🍓", label: "strawberry clip", x: 0.64, y: 0.3, size: 0.12, rot: 16 }
];

export const NECK_ITEMS = [
  { id: "bell", glyph: "🔔", label: "bell", x: 0.5, y: 0.735, size: 0.1, rot: 0 },
  { id: "heart", glyph: "💗", label: "heart locket", x: 0.5, y: 0.74, size: 0.1, rot: 0 },
  { id: "ribbon", glyph: "🎀", label: "ribbon", x: 0.5, y: 0.73, size: 0.12, rot: 0 },
  { id: "none", glyph: "", label: "nothing", x: 0.5, y: 0.735, size: 0, rot: 0 }
];

export function headItem(id) { return HEAD_ITEMS.find((i) => i.id === id) || null; }
export function neckItem(id) { return NECK_ITEMS.find((i) => i.id === id && i.glyph) || null; }

/** The pieces she's wearing, as positioned items. */
export function outfitParts(outfit) {
  if (!outfit) return [];
  const h = headItem(outfit.head), n = neckItem(outfit.neck);
  return [h && { ...h, slot: "head" }, n && { ...n, slot: "neck" }].filter(Boolean);
}

/** One accessory, positioned over a Mochi image that fills its parent. */
export function accessoryHtml(a, extraClass = "") {
  return `<span class="mochi-acc ${extraClass}" aria-hidden="true" style="left:${a.x * 100}%;top:${a.y * 100}%;` +
    `--acc-size:${a.size};--acc-rot:${a.rot}deg">${a.glyph}</span>`;
}

/** "a bow and a bell", for Mochi's lines. */
export function describeOutfit(outfit) {
  const parts = outfitParts(outfit).map((p) => p.label);
  if (!parts.length) return "";
  return parts.length === 1 ? `a ${parts[0]}` : `a ${parts[0]} and a ${parts[1]}`;
}
