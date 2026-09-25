import { ObjectDetector } from "@mediapipe/tasks-vision";
import { MASK_SIZE } from "./Segmenter.js";

// Local object detection (COCO labels: chair, bed, couch, tv, bottle, cup,
// potted plant, clock, book…)
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

const IGNORE = new Set(["person", "laptop", "keyboard", "mouse", "tie"]); // the player and their own setup
const PASSIVE_INTERVAL_MS = 4000;

export class RoomScanner {
  constructor() {
    this.detector = null;
    this._lastTs = 0;
    this._lastPassive = 0;
    this._seen = new Map(); // label -> { hits, cx, cy, score }
    this.objects = [];      // [{ label, side, where }]
    this.personCount = 1;
  }

  async init(fileset) {
    try {
      this.detector = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        scoreThreshold: 0.35,
        maxResults: 10
      });
    } catch (err) {
      console.warn("[RoomScanner] failed to load — room references disabled.", err);
    }
  }

  _detect(videoEl) {
    if (!this.detector || videoEl.readyState < 2) return [];
    const ts = Math.max(performance.now(), this._lastTs + 1);
    this._lastTs = ts;
    try {
      return this.detector.detectForVideo(videoEl, ts).detections || [];
    } catch (err) {
      console.warn("[RoomScanner]", err);
      return [];
    }
  }

  /**
   * The calibration "room scan": a sweeping line over the player's feed with
   * boxes and labels snapping onto real objects behind them.
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} overlay same aspect as the video, NOT css-mirrored
   * @param {() => object|null} getFace returns the latest face snapshot (for left/right)
   * @param {() => Uint8Array|null} getMask latest person mask (objects ON the player are skipped)
   */
  async scan(videoEl, overlay, getFace, getMask, durationMs = 4500) {
    const ctx = overlay.getContext("2d");
    const W = overlay.width, H = overlay.height;
    const vw = videoEl.videoWidth || 640, vh = videoEl.videoHeight || 480;
    const start = performance.now();
    let lastDetect = 0;
    let boxes = [];

    while (performance.now() - start < durationMs) {
      const now = performance.now();
      if (now - lastDetect > 280) {
        lastDetect = now;
        const dets = this._detect(videoEl);
        boxes = dets;
        this._accumulate(dets, vw, vh, getFace(), getMask());
      }

      const p = ((now - start) % 1500) / 1500;
      ctx.clearRect(0, 0, W, H);
      // sweep line
      const sx = W * p;
      const grad = ctx.createLinearGradient(sx - 60, 0, sx, 0);
      grad.addColorStop(0, "rgba(194,59,59,0)");
      grad.addColorStop(1, "rgba(194,59,59,0.35)");
      ctx.fillStyle = grad;
      ctx.fillRect(sx - 60, 0, 60, H);
      ctx.fillStyle = "rgba(194,59,59,0.9)";
      ctx.fillRect(sx, 0, 2, H);

      // boxes (x mirrored to match the mirrored video under the overlay)
      ctx.font = "13px 'Courier Prime', monospace";
      for (const d of boxes) {
        const cat = d.categories?.[0];
        if (!cat) continue;
        const b = d.boundingBox;
        const x = W - ((b.originX + b.width) / vw) * W;
        const y = (b.originY / vh) * H;
        const w = (b.width / vw) * W;
        const h = (b.height / vh) * H;
        const isPerson = cat.categoryName === "person";
        ctx.strokeStyle = isPerson ? "rgba(216,212,204,0.25)" : "rgba(194,59,59,0.85)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        if (!isPerson) {
          ctx.fillStyle = "rgba(194,59,59,0.95)";
          ctx.fillText(`${cat.categoryName}. ${Math.round(cat.score * 100)}%`, x + 4, Math.max(14, y - 4));
        }
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    ctx.clearRect(0, 0, W, H);
    this._finalize();
    return this.objects;
  }

  /** Cheap background check during play — mostly to notice a SECOND person. */
  passive(videoEl, nowMs, face, mask) {
    if (!this.detector || nowMs - this._lastPassive < PASSIVE_INTERVAL_MS) return null;
    this._lastPassive = nowMs;
    const dets = this._detect(videoEl);
    this._accumulate(dets, videoEl.videoWidth || 640, videoEl.videoHeight || 480, face, mask);
    this._finalize();
    return { personCount: this.personCount };
  }

  _accumulate(dets, vw, vh, face, mask) {
    let persons = 0;
    for (const d of dets) {
      const cat = d.categories?.[0];
      if (!cat) continue;
      if (cat.categoryName === "person") { if (cat.score > 0.5) persons++; continue; }
      if (IGNORE.has(cat.categoryName)) continue;
      const b = d.boundingBox;
      const cx = (b.originX + b.width / 2) / vw;
      const cy = (b.originY + b.height / 2) / vh;
      // centre of the box is on the player's body (a tie, glasses, a mug they're holding) — not "the room"
      if (mask && mask[Math.floor(cy * MASK_SIZE) * MASK_SIZE + Math.floor(cx * MASK_SIZE)] > 128) continue;
      const prev = this._seen.get(cat.categoryName) || { hits: 0, cx: 0, cy: 0, score: 0 };
      prev.hits += 1;
      prev.cx += (cx - prev.cx) / prev.hits;
      prev.cy += (cy - prev.cy) / prev.hits;
      prev.score = Math.max(prev.score, cat.score);
      prev.faceX = face?.keypoints?.nose.x ?? 0.5;
      prev.faceY = face?.keypoints?.forehead.y ?? 0.3;
      this._seen.set(cat.categoryName, prev);
    }
    this.personCount = Math.max(1, persons);
  }

  _finalize() {
    this.objects = [...this._seen.entries()]
      .filter(([, v]) => v.hits >= 2)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 6)
      .map(([label, v]) => {
        // Unmirrored camera image: things at larger x than the face are on the
        // player's LEFT.
        const side = v.cx > v.faceX ? "left" : "right";
        const where = v.cy < v.faceY ? `above your ${side} shoulder` : `behind you, to your ${side}`;
        return { label, side, where };
      });
  }
}