import { settings } from "../settings.js";
import { FeedRenderer } from "./FeedRenderer.js";
import { MASK_SIZE } from "./Segmenter.js";

// The player's feed. Keeps a ring buffer of recent frames (each with its face
// keypoints and person mask, so old frames can be warped correctly too) and
// can show, instead of the live camera:
//   delayed  — footage from N seconds ago ("that footage is a few seconds old")
//   frozen   — one held frame; used for "your reflection didn't blink"
//   clip     — a recorded calibration clip (your smile, played while you're not smiling)
//   replay   — buffered footage between two timestamps (the close-your-eyes task)
//
// Warps come from three layers merged in order: base (the director's slow
// creep) < burst (a short override) < mode-specific warp.

const SAMPLE_INTERVAL_MS = 125; // 8 fps buffer
const BUFFER_SECONDS = 14;      // must cover the 10s close-your-eyes replay
const BUFFER_LEN = Math.ceil((BUFFER_SECONDS * 1000) / SAMPLE_INTERVAL_MS);
const FRAME_W = 384, FRAME_H = 288;

export class DelayedFeed {
  /** @param {HTMLCanvasElement} canvas visible display canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new FeedRenderer(canvas);
    this.captureCanvas = document.createElement("canvas");
    this.captureCanvas.width = FRAME_W;
    this.captureCanvas.height = FRAME_H;
    this.captureCtx = this.captureCanvas.getContext("2d");

    this.buffer = []; // { t, bitmap, keypoints, mask, eyesOpen, motion }
    this.lastSampleMs = 0;
    this._capturing = false;

    this.mode = "live";
    this.delaySeconds = 4;
    this.modeUntilMs = 0;
    this._frozen = null;
    this._modeWarp = null;
    this._clip = null;
    this._replay = null;

    this.baseWarp = {};
    this._burst = null;
    this.figure = null; // { rect, opacity, dark }
    this.clips = {};    // name -> [{ bitmap, keypoints, mask }]
    this._recording = null;
    this.snapshots = {};
  }

  /**
   * Call every animation frame.
   * @param {HTMLVideoElement} videoEl
   * @param {number} nowMs
   * @param {{ face?: object, mask?: Uint8Array, motion?: boolean }} extras
   */
  update(videoEl, nowMs, { face = null, mask = null, motion = false, levels = null } = {}) {
    if (videoEl.readyState < 2) return;
    if (levels) this.renderer.levels = levels;
    this._live = { image: videoEl, keypoints: face?.keypoints || null, mask, maskSize: MASK_SIZE };

    if (nowMs - this.lastSampleMs >= SAMPLE_INTERVAL_MS && !this._capturing) {
      this.lastSampleMs = nowMs;
      this._capture(videoEl, nowMs, face, mask, motion);
    }

    if (this.mode !== "live" && this.modeUntilMs && nowMs > this.modeUntilMs) this._toLive();
    this._render(nowMs);
  }

  async _capture(videoEl, nowMs, face, mask, motion) {
    this._capturing = true;
    const rec = this._recording; // may be stopped while we await below
    try {
      this.captureCtx.drawImage(videoEl, 0, 0, FRAME_W, FRAME_H);
      const bitmap = await createImageBitmap(this.captureCanvas);
      const entry = {
        t: nowMs, bitmap, keypoints: face?.keypoints || null, mask, maskSize: MASK_SIZE,
        eyesOpen: !!face?.eyesOpen, motion
      };
      this.buffer.push(entry);
      while (this.buffer.length > BUFFER_LEN) this.buffer.shift().bitmap.close(); 

      if (rec) {
        const copy = await createImageBitmap(bitmap);
        rec.frames.push({ ...entry, bitmap: copy });
      }
    } finally {
      this._capturing = false;
    }
  }

  _frameAt(t) {
    let frame = null;
    for (const f of this.buffer) {
      if (f.t <= t) frame = f;
      else break;
    }
    return frame || this.buffer[0] || null;
  }

  /** Buffered frame at (or just before) time t. */
  frameAt(t) {
    return this._frameAt(t);
  }

  _render(nowMs) {
    let frame = this._live;
    let modeWarp = null;

    if (this.mode === "delayed") {
      frame = this._frameAt(nowMs - this.delaySeconds * 1000) || this._live;
    } else if (this.mode === "frozen" && this._frozen) {
      frame = this._frozen;
      modeWarp = this._modeWarp;
    } else if (this.mode === "clip" && this._clip) {
      const { frames, start } = this._clip;
      const i = Math.floor((nowMs - start) / SAMPLE_INTERVAL_MS);
      // ping-pong so a short clip loops without a visible jump
      const n = frames.length;
      const k = n > 1 ? (Math.floor(i / (n - 1)) % 2 === 0 ? i % (n - 1) : n - 1 - (i % (n - 1))) : 0;
      frame = frames[k];
      modeWarp = this._modeWarp;
    } else if (this.mode === "replay" && this._replay) {
      const { t0, t1, start } = this._replay;
      const t = t0 + (nowMs - start);
      if (t >= t1) this._toLive();
      else {
        frame = this._frameAt(t) || this._live;
        this._replay.progress = (t - t0) / (t1 - t0);
        modeWarp = typeof this._modeWarp === "function" ? this._modeWarp(this._replay.progress) : this._modeWarp;
      }
    }
    if (!frame) return;

    let warp = { ...this.baseWarp };
    if (this._burst && nowMs < this._burst.until) warp = { ...warp, ...this._burst.warp };
    if (modeWarp) warp = { ...warp, ...(modeWarp.warp || modeWarp) };

    const figure = modeWarp?.figure !== undefined ? modeWarp.figure : this.figure;
    this.renderer.render(frame, warp, figure, nowMs / 1000);
  }

  _toLive() {
    this.mode = "live";
    this.modeUntilMs = 0;
    this._frozen = null;
    this._clip = null;
    this._replay = null;
    this._modeWarp = null;
  }

  // ---------------------------------------------------------------- controls

  setBaseWarp(warp) { this.baseWarp = warp || {}; }

  /** Temporarily override some warp values. */
  burst(warp, ms) {
    // reduce flashing: no photographic-negative strobes
    if (settings.reduceFlashing && warp?.invert) warp = { ...warp, invert: 0 };
    this._burst = { warp, until: performance.now() + ms };
  }

  setFigure(figure) { this.figure = figure; }

  setFigureImage(img) { this.renderer.setFigureImage(img); }

  /** Show footage from `seconds` ago for `holdMs`. */
  startGlitch(seconds, holdMs) {
    this._toLive();
    this.mode = "delayed";
    this.delaySeconds = seconds;
    this.modeUntilMs = performance.now() + holdMs;
  }

  /**
   * Hold the most recent frame where the eyes were open. Called when a blink
   * starts, so the reflection keeps staring while the player's eyes are shut.
   */
  freezeLastOpen(untilMs, warp = null) {
    const now = performance.now();
    let pick = null;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const f = this.buffer[i];
      if (f.eyesOpen && f.keypoints && f.t < now - 120) { pick = f; break; }
    }
    if (!pick) return false;
    this._toLive();
    this.mode = "frozen";
    this._frozen = pick; // the buffer holds 14s, far longer than any freeze, so it won't be evicted
    this._modeWarp = warp;
    this.modeUntilMs = untilMs;
    return true;
  }

  extendMode(untilMs) { if (this.mode !== "live") this.modeUntilMs = Math.max(this.modeUntilMs, untilMs); }

  /** Freeze on a specific frame (e.g. a stored snapshot) with a warp. */
  freezeFrame(frame, untilMs, warp = null) {
    if (!frame) return false;
    this._toLive();
    this.mode = "frozen";
    this._frozen = frame;
    this._modeWarp = warp;
    this.modeUntilMs = untilMs;
    return true;
  }

  // ---- calibration clips
  startClipRecording(name) { this._recording = { name, frames: [] }; }

  stopClipRecording() {
    const rec = this._recording;
    this._recording = null;
    if (rec && rec.frames.length) this.clips[rec.name] = rec.frames;
    return rec?.frames.length || 0;
  }

  hasClip(name) { return !!this.clips[name]?.length; }

  playClip(name, ms, warp = null) {
    const frames = this.clips[name];
    if (!frames?.length) return false;
    this._toLive();
    this.mode = "clip";
    this._clip = { frames, start: performance.now() };
    this._modeWarp = warp;
    this.modeUntilMs = performance.now() + ms;
    return true;
  }

  /** A single frame from a clip, for freezes (e.g. the peak of the posed smile). */
  clipFrame(name, where = 0.6) {
    const frames = this.clips[name];
    return frames?.length ? frames[Math.min(frames.length - 1, Math.floor(frames.length * where))] : null;
  }

  /** Replay buffered footage from t0..t1 in real time. `warp` may be a function of progress (0..1). */
  startReplay(t0, t1, warp = null) {
    this._toLive();
    this.mode = "replay";
    this._replay = { t0, t1, start: performance.now(), progress: 0 };
    this._modeWarp = warp;
    this.modeUntilMs = performance.now() + (t1 - t0) + 200;
  }

  /** Keep a copy of the latest buffered frame (e.g. the moment of the biggest flinch). */
  async snapshot(tag) {
    const last = this.buffer[this.buffer.length - 1];
    if (!last) return;
    const bitmap = await createImageBitmap(last.bitmap);
    this.snapshots[tag]?.bitmap?.close?.();
    this.snapshots[tag] = { ...last, bitmap };
  }

  isLive() { return this.mode === "live"; }
}