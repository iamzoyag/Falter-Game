// Mouse-tracking "tells", from the MouseTracker paradigm (Freeman & Ambady):
// when two answers compete, the hand drifts toward the one you didn't pick.
// We record the cursor from the moment a question appears until the click.

const DWELL_OTHER_TELL_MS = 700;   // hovered a different answer this long
const SWITCHES_TELL = 2;           // went back and forth between answers
const CURVATURE_TELL = 0.35;       // path bowed away from a straight line (relative to its length)

export class CursorTracker {
  constructor() {
    this._path = [];
    this._dwell = {};
    this._hoverIdx = null;
    this._hoverSince = 0;
    this._sequence = [];
    this._active = false;
    this._onMove = (e) => {
      if (this._active) this._path.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    };
    document.addEventListener("mousemove", this._onMove, { passive: true });
  }

  /** Call right after the answer buttons are rendered. Buttons need data-index. */
  begin(container) {
    this._path = [];
    this._dwell = {};
    this._hoverIdx = null;
    this._sequence = [];
    this._active = true;
    container.onmouseover = (e) => {
      const btn = e.target.closest?.("[data-index]");
      if (btn) this._enter(Number(btn.dataset.index));
    };
    container.onmouseout = (e) => {
      const btn = e.target.closest?.("[data-index]");
      if (btn && !btn.contains(e.relatedTarget)) this._leave();
    };
  }

  _enter(idx) {
    if (this._hoverIdx === idx) return;
    this._leave();
    this._hoverIdx = idx;
    this._hoverSince = performance.now();
    if (this._sequence[this._sequence.length - 1] !== idx) this._sequence.push(idx);
  }

  _leave() {
    if (this._hoverIdx === null) return;
    this._dwell[this._hoverIdx] = (this._dwell[this._hoverIdx] || 0) + performance.now() - this._hoverSince;
    this._hoverIdx = null;
  }

  /** Call on click. Returns the cursor tells for this answer. */
  finish(chosenIdx) {
    this._leave();
    this._active = false;

    let dwellOther = 0;
    for (const [idx, ms] of Object.entries(this._dwell)) {
      if (Number(idx) !== chosenIdx) dwellOther = Math.max(dwellOther, ms);
    }
    const switches = Math.max(0, this._sequence.length - 1);
    const firstHover = this._sequence.length ? this._sequence[0] : null;
    const curvature = pathCurvature(this._path);

    const conflict =
      switches >= SWITCHES_TELL ||
      dwellOther >= DWELL_OTHER_TELL_MS ||
      curvature >= CURVATURE_TELL ||
      (firstHover !== null && firstHover !== chosenIdx && dwellOther >= 300);

    return { switches, dwellOther: Math.round(dwellOther), firstHover, curvature: +curvature.toFixed(2), conflict };
  }
}

/** Max perpendicular deviation from the start→end line, divided by that line's length. */
function pathCurvature(path) {
  if (path.length < 5) return 0;
  const a = path[0], b = path[path.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 60) return 0; // barely moved; not meaningful
  let maxDev = 0;
  for (const p of path) {
    const dev = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (dev > maxDev) maxDev = dev;
  }
  return maxDev / len;
}