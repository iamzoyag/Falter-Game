import { ImageSegmenter } from "@mediapipe/tasks-vision";

// Person-vs-background mask for the feed. Used to darken only the room (not
// the player), and to put a figure BEHIND the player so their own body
// occludes it — which is what makes it read as "in the room" instead of
// "stuck on top of the video".
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";

export const MASK_SIZE = 128; // stored masks are 128x128 Uint8 (0 = room, 255 = person)
const INTERVAL_MS = 90;       // ~11 fps is plenty; the mask moves slowly

export class Segmenter {
  constructor() {
    this.segmenter = null;
    this.mask = null;
    this._lastRun = 0;
    this._lastTs = 0;
  }

  async init(fileset) {
    try {
      this.segmenter = await ImageSegmenter.createFromOptions(fileset, {
        // CPU on purpose: GPU masks would need an expensive GPU->CPU readback anyway.
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        outputConfidenceMasks: true,
        outputCategoryMask: false
      });
    } catch (err) {
      console.warn("[Segmenter] failed to load — background effects disabled.", err);
    }
  }

  /** Returns the latest mask (Uint8Array MASK_SIZE²) or null. Cheap to call every frame. */
  update(videoEl, nowMs) {
    if (!this.segmenter || videoEl.readyState < 2) return this.mask;
    if (nowMs - this._lastRun < INTERVAL_MS) return this.mask;
    this._lastRun = nowMs;

    const ts = Math.max(performance.now(), this._lastTs + 1);
    this._lastTs = ts;

    let result;
    try {
      result = this.segmenter.segmentForVideo(videoEl, ts);
    } catch (err) {
      console.warn("[Segmenter]", err);
      return this.mask;
    }
    const masks = result.confidenceMasks;
    if (masks?.length) {
      // selfie_segmenter's last mask is the "person" confidence.
      const m = masks[masks.length - 1];
      const w = m.width, h = m.height;
      const data = m.getAsFloat32Array();
      const out = new Uint8Array(MASK_SIZE * MASK_SIZE); // fresh array: buffered frames keep references
      for (let y = 0; y < MASK_SIZE; y++) {
        const sy = Math.floor((y * h) / MASK_SIZE) * w;
        for (let x = 0; x < MASK_SIZE; x++) {
          out[y * MASK_SIZE + x] = Math.max(0, Math.min(255, data[sy + Math.floor((x * w) / MASK_SIZE)] * 255));
        }
      }
      this.mask = out;
    }
    result.close?.();
    return this.mask;
  }
}