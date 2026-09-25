// Draws the player's own webcam feed to an on-screen canvas — but can swap,
// on command, from the *live* frame to a frame from N seconds ago, held for
// a while, then seamed back to live. That's the "the feed you're watching
// isn't actually live" trick: something can happen in the room during the
// replay window that the player won't see until the delayed frames catch up.
//
// Frames are stored small (matches the on-screen canvas res) as ImageBitmaps
// in a ring buffer, sampled at a fixed low rate so memory stays bounded.

const SAMPLE_INTERVAL_MS = 1000 / 8; // 8 fps capture is plenty for this effect
const BUFFER_SECONDS = 10;
const BUFFER_LEN = Math.ceil((BUFFER_SECONDS * 1000) / SAMPLE_INTERVAL_MS);

export class DelayedFeed {
  /** @param {HTMLCanvasElement} canvas visible display canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.captureCanvas = document.createElement("canvas");
    this.captureCanvas.width = canvas.width;
    this.captureCanvas.height = canvas.height;
    this.captureCtx = this.captureCanvas.getContext("2d");

    this.buffer = []; // { t, bitmap }
    this.lastSampleMs = 0;

    this.mode = "live"; // 'live' | 'delayed'
    this.delaySeconds = 4;
    this.delayUntilMs = 0;

    // Frames captured *during* a delayed window are flagged, so the director
    // can know "something happened off-screen that hasn't been shown yet".
    this._motionDuringDelay = false;
  }

  /**
   * Call every animation frame.
   * @param {HTMLVideoElement} videoEl
   * @param {number} nowMs
   * @param {boolean} roomInMotion current motion signal, to tag buffered frames
   */
  async update(videoEl, nowMs, roomInMotion) {
    if (videoEl.readyState < 2) return;

    if (nowMs - this.lastSampleMs >= SAMPLE_INTERVAL_MS) {
      this.lastSampleMs = nowMs;
      this.captureCtx.drawImage(videoEl, 0, 0, this.captureCanvas.width, this.captureCanvas.height);
      const bitmap = await createImageBitmap(this.captureCanvas);
      this.buffer.push({ t: nowMs, bitmap, motion: roomInMotion });
      while (this.buffer.length > BUFFER_LEN) this.buffer.shift()[1]?.bitmap?.close?.();
    }

    if (this.mode === "delayed" && nowMs > this.delayUntilMs) {
      this.mode = "live";
    }

    this._render(videoEl, nowMs);
  }

  _render(videoEl, nowMs) {
    const w = this.canvas.width, h = this.canvas.height;
    if (this.mode === "live") {
      this.ctx.drawImage(videoEl, 0, 0, w, h);
      return;
    }

    const targetT = nowMs - this.delaySeconds * 1000;
    let frame = this.buffer[0];
    for (const f of this.buffer) {
      if (f.t <= targetT) frame = f;
      else break;
    }
    if (frame?.bitmap) {
      this.ctx.drawImage(frame.bitmap, 0, 0, w, h);
    } else {
      this.ctx.drawImage(videoEl, 0, 0, w, h); // buffer not deep enough yet, fall back
    }
  }

  /** Begin showing delayed footage. @param {number} seconds how far behind, @param {number} holdMs how long to stay delayed */
  startGlitch(seconds, holdMs) {
    this.mode = "delayed";
    this.delaySeconds = seconds;
    this.delayUntilMs = performance.now() + holdMs;
    this._motionDuringDelay = false;
  }

  /** Did anything move in the room during the frames we're currently replaying? */
  didMissMotion() {
    if (this.mode !== "delayed") return false;
    const cutoff = performance.now() - this.delaySeconds * 1000;
    return this.buffer.some((f) => f.t > cutoff - 500 && f.motion);
  }

  isLive() {
    return this.mode === "live";
  }
}
