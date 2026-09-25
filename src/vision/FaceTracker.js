import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Public MediaPipe-hosted assets — same URLs used in Google's own FaceLandmarker
// codelabs. Everything downloaded here is a model file (WASM runtime + a .task
// weights file), fetched once and cached by the browser; no user data goes out.
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Blink is read off blendshape scores, not literal eye-closed detection —
// this is robust to lighting and doesn't need calibrated eye-aspect-ratio math.
const BLINK_CLOSED_THRESHOLD = 0.5;
const BLINK_TOO_LONG_MS = 900; // held-shut eyes past this reads as "blinked too long"
const LOOK_AWAY_THRESHOLD = 0.35; // combined eyeLookOut/In/Up/Down score
const LOOK_AWAY_TOO_LONG_MS = 1800;

/**
 * Wraps MediaPipe FaceLandmarker to expose the specific signals the game
 * cares about: blink state/duration, "looking away" state/duration, a rough
 * head-yaw/pitch from the transformation matrix, and a small set of
 * expression scores derived from blendshapes (smile, frown, brow-raise/
 * surprise, brow-down/anger). One model covers gaze + blink + expression,
 * so we don't need a second network.
 */
export class FaceTracker {
  constructor() {
    this.landmarker = null;
    this.lastResult = null;
    this.faceVisible = false;
    this.faceMissingSinceMs = null;

    this.blinking = false;
    this.blinkStartMs = null;
    this.blinkTooLong = false;

    this.lookingAway = false;
    this.lookAwayStartMs = null;
    this.lookAwayTooLong = false;

    this._lastShapes = null;
    this._baselineShapes = null;
    this._baselineSamples = null;
  }

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    });
  }

  /** Call once per animation frame with the live <video> element. */
  update(videoEl, nowMs) {
    if (!this.landmarker || videoEl.readyState < 2) return null;

    const result = this.landmarker.detectForVideo(videoEl, nowMs);
    this.lastResult = result;

    const hasFace = !!(result.faceBlendshapes && result.faceBlendshapes.length);
    this._updateFaceVisibility(hasFace, nowMs);
    if (!hasFace) return this._snapshot(nowMs);

    const shapes = this._shapeMap(result.faceBlendshapes[0].categories);
    this._lastShapes = shapes;

    this._updateBlink(shapes, nowMs);
    this._updateGaze(shapes, nowMs);
    this._expressions = this._computeExpressions(shapes);
    this._headPose = this._computeHeadPose(result.facialTransformationMatrixes?.[0]);

    return this._snapshot(nowMs);
  }

  _shapeMap(categories) {
    const map = {};
    for (const c of categories) map[c.categoryName] = c.score;
    return map;
  }

  _updateFaceVisibility(hasFace, nowMs) {
    if (hasFace) {
      this.faceVisible = true;
      this.faceMissingSinceMs = null;
    } else {
      if (this.faceVisible) this.faceMissingSinceMs = nowMs;
      this.faceVisible = false;
    }
  }

  _updateBlink(shapes, nowMs) {
    const closed = ((shapes.eyeBlinkLeft || 0) + (shapes.eyeBlinkRight || 0)) / 2;
    const isClosed = closed > BLINK_CLOSED_THRESHOLD;

    if (isClosed && !this.blinking) {
      this.blinking = true;
      this.blinkStartMs = nowMs;
      this.blinkTooLong = false;
    } else if (isClosed && this.blinking) {
      if (nowMs - this.blinkStartMs > BLINK_TOO_LONG_MS) this.blinkTooLong = true;
    } else if (!isClosed && this.blinking) {
      this.blinking = false;
      this.blinkStartMs = null;
      this.blinkTooLong = false;
    }
  }

  _updateGaze(shapes, nowMs) {
    const away =
      ((shapes.eyeLookOutLeft || 0) + (shapes.eyeLookOutRight || 0) +
       (shapes.eyeLookUpLeft || 0) + (shapes.eyeLookUpRight || 0) +
       (shapes.eyeLookDownLeft || 0) + (shapes.eyeLookDownRight || 0)) / 6;
    const isAway = away > LOOK_AWAY_THRESHOLD;

    if (isAway && !this.lookingAway) {
      this.lookingAway = true;
      this.lookAwayStartMs = nowMs;
      this.lookAwayTooLong = false;
    } else if (isAway && this.lookingAway) {
      if (nowMs - this.lookAwayStartMs > LOOK_AWAY_TOO_LONG_MS) this.lookAwayTooLong = true;
    } else if (!isAway && this.lookingAway) {
      this.lookingAway = false;
      this.lookAwayStartMs = null;
      this.lookAwayTooLong = false;
    }
  }

  _computeExpressions(rawShapes) {
    const s = this._baselineShapes ? this._subtractBaseline(rawShapes) : rawShapes;
    return {
      smile: (((s.mouthSmileLeft || 0) + (s.mouthSmileRight || 0)) / 2) * 0.7 +
             (((s.cheekSquintLeft || 0) + (s.cheekSquintRight || 0)) / 2) * 0.3,
      frown: ((s.mouthFrownLeft || 0) + (s.mouthFrownRight || 0)) / 2,
      surprise:
        ((s.browOuterUpLeft || 0) + (s.browOuterUpRight || 0)) / 2 * 0.6 +
        (s.jawOpen || 0) * 0.4,
      anger: ((s.browDownLeft || 0) + (s.browDownRight || 0)) / 2,
      neutral: 1 - Math.min(1,
        ((s.mouthSmileLeft || 0) + (s.mouthSmileRight || 0) +
         (s.mouthFrownLeft || 0) + (s.mouthFrownRight || 0) +
         (s.browDownLeft || 0) + (s.browDownRight || 0)) / 3)
    };
  }

  _subtractBaseline(shapes) {
    const out = {};
    for (const [k, v] of Object.entries(shapes)) out[k] = Math.max(0, v - (this._baselineShapes[k] || 0));
    return out;
  }

  _computeHeadPose(matrix) {
    if (!matrix) return { yaw: 0, pitch: 0 };
    const m = matrix.data;
    // Standard rotation-matrix -> Euler extraction for a row-major 4x4.
    const yaw = Math.atan2(-m[2], m[10]);
    const pitch = Math.atan2(-m[6], m[10]);
    return { yaw, pitch };
  }

  /** Call once, right before a "hold a neutral, relaxed expression" calibration window. */
  beginBaselineCapture() {
    this._baselineSamples = [];
  }

  /** Call every frame during that window, after update() has run for the frame. */
  sampleBaseline() {
    if (this._lastShapes && this._baselineSamples) this._baselineSamples.push(this._lastShapes);
  }

  /** Call once the window ends — averages samples into a fixed per-player baseline. */
  finishBaselineCapture() {
    if (!this._baselineSamples?.length) return;
    const avg = {};
    for (const shapes of this._baselineSamples) {
      for (const [k, v] of Object.entries(shapes)) avg[k] = (avg[k] || 0) + v / this._baselineSamples.length;
    }
    this._baselineShapes = avg;
    this._baselineSamples = null;
  }

  /** Dominant expression label above a floor threshold, else 'neutral'. */
  dominantExpression() {
    if (!this._expressions) return "neutral";
    const entries = Object.entries(this._expressions).filter(([k]) => k !== "neutral");
    entries.sort((a, b) => b[1] - a[1]);
    const [label, score] = entries[0] || ["neutral", 0];
    return score > 0.25 ? label : "neutral";
  }

  _snapshot(nowMs) {
    return {
      faceVisible: this.faceVisible,
      faceMissingMs: this.faceMissingSinceMs ? nowMs - this.faceMissingSinceMs : 0,
      blinking: this.blinking,
      blinkTooLong: this.blinkTooLong,
      lookingAway: this.lookingAway,
      lookAwayTooLong: this.lookAwayTooLong,
      expressions: this._expressions || null,
      dominantExpression: this.dominantExpression(),
      headPose: this._headPose || { yaw: 0, pitch: 0 }
    };
  }
}
