// Mochi's outfit, picked by the player in Act II's dress-up. She wears it on
// every screen from then on, so whatever happens to her later happens to the
// bunny they dressed.
//
// The accessories are drawn (public/mochi/acc/*.svg, same hand as the room's
// furniture), not emoji. Positions are fractions of the cute.webp square
// (768x768): her head sits in the top half, the gap between her ears is
// around (0.5, 0.27), her chin around (0.5, 0.64). (x, y) is the centre of the
// drawing; `w` is its width as a fraction of the image's height and `ratio`
// its height / width. `glyph` is only a stand-in for places that need text.

const acc = (id) => `/mochi/acc/${id}.svg`;

export const HEAD_ITEMS = [
  { id: "bow", glyph: "🎀", label: "bow", src: acc("bow"), x: 0.355, y: 0.27, w: 0.24, ratio: 100 / 140, rot: -20 },
  { id: "crown", glyph: "👑", label: "crown", src: acc("crown"), x: 0.5, y: 0.235, w: 0.2, ratio: 100 / 130, rot: 4 },
  { id: "flower", glyph: "🌸", label: "flower", src: acc("flower"), x: 0.37, y: 0.285, w: 0.19, ratio: 110 / 130, rot: -12 },
  { id: "clip", glyph: "🍓", label: "strawberry clip", src: acc("clip"), x: 0.65, y: 0.295, w: 0.16, ratio: 110 / 120, rot: 22 }
];

export const NECK_ITEMS = [
  { id: "bell", glyph: "🔔", label: "bell", src: acc("bell"), x: 0.5, y: 0.715, w: 0.36, ratio: 130 / 240, rot: 0 },
  { id: "heart", glyph: "💗", label: "heart locket", src: acc("heart"), x: 0.5, y: 0.725, w: 0.36, ratio: 140 / 240, rot: 0 },
  { id: "ribbon", glyph: "🎀", label: "ribbon", src: acc("ribbon"), x: 0.5, y: 0.722, w: 0.36, ratio: 140 / 240, rot: 0 },
  { id: "none", glyph: "", label: "nothing", src: "", x: 0.5, y: 0.7, w: 0, ratio: 1, rot: 0 }
];

export function headItem(id) { return HEAD_ITEMS.find((i) => i.id === id) || null; }
export function neckItem(id) { return NECK_ITEMS.find((i) => i.id === id && i.src) || null; }

/** The pieces she's wearing, as positioned items. */
export function outfitParts(outfit) {
  if (!outfit) return [];
  const h = headItem(outfit.head), n = neckItem(outfit.neck);
  return [h && { ...h, slot: "head" }, n && { ...n, slot: "neck" }].filter(Boolean);
}

/** One accessory, positioned over a Mochi image that fills its parent. */
export function accessoryHtml(a, extraClass = "") {
  // a span with the drawing as its background, so the many "mochi img" rules never touch it
  return `<span class="mochi-acc ${extraClass}" aria-hidden="true" style="left:${a.x * 100}%;top:${a.y * 100}%;` +
    `background-image:url('${a.src}');--acc-w:${a.w};--acc-ratio:${a.ratio};--acc-rot:${a.rot}deg"></span>`;
}

/** Just the drawing, for buttons and cards. */
export function accessoryIcon(a, cls = "acc-icon") {
  return a?.src ? `<img class="${cls}" src="${a.src}" alt="" draggable="false" />` : "";
}

/** "a bow and a bell", for Mochi's lines. */
export function describeOutfit(outfit) {
  const parts = outfitParts(outfit).map((p) => p.label);
  if (!parts.length) return "";
  return parts.length === 1 ? `a ${parts[0]}` : `a ${parts[0]} and a ${parts[1]}`;
}
