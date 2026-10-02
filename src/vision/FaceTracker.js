import { FaceLandmarker } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const BLINK_CLOSED_THRESHOLD = 0.5;
const BLINK_TOO_LONG_MS = 900;
const LOOK_AWAY_THRESHOLD = 0.45; // one eye's sideways/up score
const LOOK_AWAY_TOO_LONG_MS = 1800;

// ---- reaction ("spike") detection, relative to THIS player's own baseline ----
export const SPIKE_Z = 3.0;     // how many of the player's own std-devs above their mean
const SPIKE_MIN_DELTA = 0.08;   // …and at least this much in absolute blendshape units
const SPIKE_MIN_MS = 150;       // …held at least this long (kills single-frame noise)
const STD_FLOOR = 0.025;        // stops a very still baseline from making z explode
const SPIKE_LOG_MS = 60000;
// browDown rises with concentration, not just distress — make it prove itself harder.
export const CHANNEL_Z_MULT = { browFurrow: 1.4 };

const avg = (...v) => v.reduce((a, b) => a + (b || 0), 0) / v.length;

/** Expression channels, computed from raw blendshapes, lips part when people read, that's not surprise. */
export const CHANNELS = {
  smile: (s) => avg(s.mouthSmileLeft, s.mouthSmileRight),
  frown: (s) => avg(s.mouthFrownLeft, s.mouthFrownRight),
  browRaise: (s) => avg(s.browInnerUp, s.browOuterUpLeft, s.browOuterUpRight),
  browFurrow: (s) => avg(s.browDownLeft, s.browDownRight),
  eyeWide: (s) => avg(s.eyeWideLeft, s.eyeWideRight),
  lipPress: (s) => avg(s.mouthPressLeft, s.mouthPressRight)
};
export const CHANNEL_NAMES = Object.keys(CHANNELS);
export const FEAR_CHANNELS = ["frown", "browRaise", "browFurrow", "eyeWide", "lipPress"];

/**
 * MediaPipe FaceLandmarker wrapper. Exposes blink/gaze/head-pose, a small set
 * of expression channels, per-player z-scores against a calibrated baseline,
 * a log of sustained reaction spikes, and the keypoints the feed renderer
 * needs to warp the face.
 */
export class FaceTracker {
  constructor() {
    this.landmarker = null;
    this._lastTs = 0;

    this.faceVisible = false;
    this.faceMissingSinceMs = null;

    this.blinking = false;
    this.blinkStartMs = null;
    this.blinkTooLong = false;
    this.blinkTimes = []; // start times of recent blinks

    this.lookingAway = false;
    this.lookAwayStartMs = null;
    this.lookAwayTooLong = false;

    this._channels = null;
    this._z = null;
    this._keypoints = null;
    this._headPose = { yaw: 0, pitch: 0 };
    this._yawProxy = 0;

    // baseline: { mean: {ch}, std: {ch} } — null until calibrated
    this.baseline = null;
    this._baselineSamples = null;
    // per-player expressive range, from "smile / raise your eyebrows / frown"
    this.range = {};
    this._exprCapture = null;

    this._aboveSince = {};
    this._activeSpike = {};
    this.spikes = []; // { channel, t, peakZ, endT }
  }

  /** @param fileset result of FilesetResolver.forVisionTasks() (shared by all vision tasks) */
  async init(fileset) {
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true
    });
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, options("GPU"));
    } catch (err) {
      console.warn("[FaceTracker] GPU delegate failed, falling back to CPU", err);
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, options("CPU"));
    }
  }

  /** Call once per animation frame with the live <video> element. */
  update(videoEl, nowMs = performance.now()) {
    if (!this.landmarker || videoEl.readyState < 2) return null;

    // MediaPipe throws if timestamps ever go backwards, and rAF timestamps can
    // lag performance.now() — so we own the clock here.
    const ts = Math.max(performance.now(), this._lastTs + 1);
    this._lastTs = ts;
    const result = this.landmarker.detectForVideo(videoEl, ts);

    const hasFace = !!(result.faceBlendshapes && result.faceBlendshapes.length);
    this._updateFaceVisibility(hasFace, nowMs);
    if (!hasFace) {
      // Don't keep reporting the last face we saw — stale data was one of the
      // reasons the old mismatch check misfired.
      this._channels = null;
      this._z = null;
      this._keypoints = null;
      this.blinking = false;
      this.blinkTooLong = false;
      this._aboveSince = {};
      return this._snapshot(nowMs);
    }

    const shapes = {};
    for (const c of result.faceBlendshapes[0].categories) shapes[c.categoryName] = c.score;

    this._updateBlink(shapes, nowMs);
    this._updateGaze(shapes, nowMs);

    this._channels = {};
    for (const [name, fn] of Object.entries(CHANNELS)) this._channels[name] = fn(shapes);

    if (this._baselineSamples) this._baselineSamples.push({ ...this._channels });
    if (this._exprCapture) {
      for (const ch of CHANNEL_NAMES) {
        this._exprCapture.peak[ch] = Math.max(this._exprCapture.peak[ch] ?? 0, this._channels[ch]);
      }
    }

    this._z = this.baseline ? this._computeZ(this._channels) : null;
    if (this._z) this._updateSpikes(nowMs);

    const lm = result.faceLandmarks?.[0];
    this._keypoints = lm ? extractKeypoints(lm) : null;
    if (this._keypoints) {
      const k = this._keypoints;
      const mid = (k.cheekL.x + k.cheekR.x) / 2;
      const width = Math.abs(k.cheekR.x - k.cheekL.x) || 1;
      this._yawProxy = (k.nose.x - mid) / width;
    }
    this._headPose = computeHeadPose(result.facialTransformationMatrixes?.[0]);

    return this._snapshot(nowMs);
  }

  _updateFaceVisibility(hasFace, nowMs) {
    if (hasFace) {
      this.faceVisible = true;
      this.faceMissingSinceMs = null;
    } else {
      if (this.faceVisible || this.faceMissingSinceMs === null) this.faceMissingSinceMs = nowMs;
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
      this.blinkTimes.push(nowMs);
      while (this.blinkTimes.length && this.blinkTimes[0] < nowMs - 30000) this.blinkTimes.shift();
    } else if (isClosed && this.blinking) {
      if (nowMs - this.blinkStartMs > BLINK_TOO_LONG_MS) this.blinkTooLong = true;
    } else if (!isClosed && this.blinking) {
      this.blinking = false;
      this.blinkStartMs = null;
      this.blinkTooLong = false;
    }
  }

  _updateGaze(shapes, nowMs) {
    // Only sideways, up, or a turned head count. Looking DOWN doesn't: the
    // answers are below the question, so every player looks down constantly.
    const sideways = Math.max(shapes.eyeLookOutLeft || 0, shapes.eyeLookOutRight || 0);
    const up = ((shapes.eyeLookUpLeft || 0) + (shapes.eyeLookUpRight || 0)) / 2;
    const isAway = sideways > LOOK_AWAY_THRESHOLD || up > LOOK_AWAY_THRESHOLD || Math.abs(this._yawProxy) > 0.3;

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

  _computeZ(ch) {
    const z = {};
    for (const name of CHANNEL_NAMES) {
      const mean = this.baseline.mean[name];
      const std = Math.max(this.baseline.std[name], STD_FLOOR);
      z[name] = (ch[name] - mean) / std;
    }
    return z;
  }

  _updateSpikes(nowMs) {
    for (const name of CHANNEL_NAMES) {
      const z = this._z[name];
      const delta = this._channels[name] - this.baseline.mean[name];
      const above = z > SPIKE_Z * (CHANNEL_Z_MULT[name] || 1) && delta > SPIKE_MIN_DELTA;

      if (above) {
        if (this._aboveSince[name] == null) this._aboveSince[name] = nowMs;
        const active = this._activeSpike[name];
        if (active) {
          active.peakZ = Math.max(active.peakZ, z);
          active.endT = nowMs;
        } else if (nowMs - this._aboveSince[name] >= SPIKE_MIN_MS) {
          const spike = { channel: name, t: this._aboveSince[name], peakZ: z, endT: nowMs };
          this._activeSpike[name] = spike;
          this.spikes.push(spike);
        }
      } else {
        this._aboveSince[name] = null;
        this._activeSpike[name] = null;
      }
    }
    while (this.spikes.length && this.spikes[0].endT < nowMs - SPIKE_LOG_MS) this.spikes.shift();
  }

  // ------------------------------------------------------------ calibration

  /** Neutral baseline: call begin, keep calling update() every frame (the main loop does), then finish. */
  beginBaselineCapture() {
    this._baselineSamples = [];
  }

  finishBaselineCapture() {
    const samples = this._baselineSamples || [];
    this._baselineSamples = null;
    if (samples.length < 10) return false;

    const mean = {}, std = {};
    for (const ch of CHANNEL_NAMES) {
      const vals = samples.map((s) => s[ch]);
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const v = vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length;
      mean[ch] = m;
      std[ch] = Math.sqrt(v);
    }
    this.baseline = { mean, std, samples: samples.length };
    this.spikes = [];
    return true;
  }

  /** Posed-expression capture ("smile", "raise", "frown") — records how far THIS face moves. */
  beginExpressionCapture(name) {
    this._exprCapture = { name, peak: {} };
  }

  finishExpressionCapture() {
    const cap = this._exprCapture;
    this._exprCapture = null;
    if (!cap || !this.baseline) return;
    for (const [ch, peak] of Object.entries(cap.peak)) {
      const r = peak - this.baseline.mean[ch];
      if (r > (this.range[ch] ?? 0)) this.range[ch] = r;
    }
  }

  // ------------------------------------------------------------ queries

  spikesBetween(t0, t1, channels = CHANNEL_NAMES) {
    return this.spikes.filter((s) => channels.includes(s.channel) && s.endT >= t0 && s.t <= t1);
  }

  blinkCountBetween(t0, t1) {
    return this.blinkTimes.filter((t) => t >= t0 && t <= t1).length;
  }

  /** 0..1 per channel, scaled by this player's posed range (for the debug view and warp intensity). */
  intensity() {
    if (!this._channels || !this.baseline) return null;
    const out = {};
    for (const ch of CHANNEL_NAMES) {
      const range = Math.max(this.range[ch] ?? 0.3, 0.08);
      out[ch] = Math.min(1, Math.max(0, (this._channels[ch] - this.baseline.mean[ch]) / range));
    }
    return out;
  }

  _snapshot(nowMs) {
    let reaction = 0;
    let dominant = "neutral";
    if (this._z) {
      for (const ch of CHANNEL_NAMES) {
        const z = this._z[ch] / (CHANNEL_Z_MULT[ch] || 1);
        if (z > reaction) { reaction = z; dominant = ch; }
      }
      if (reaction < SPIKE_Z) dominant = "neutral";
    }
    return {
      faceVisible: this.faceVisible,
      faceMissingMs: this.faceMissingSinceMs ? nowMs - this.faceMissingSinceMs : 0,
      blinking: this.blinking,
      blinkTooLong: this.blinkTooLong,
      lookingAway: this.lookingAway,
      lookAwayTooLong: this.lookAwayTooLong,
      channels: this._channels,
      z: this._z,
      reaction,            // strongest z right now (0 if uncalibrated / no face)
      dominantExpression: dominant,
      keypoints: this._keypoints,
      eyesOpen: this.faceVisible && !this.blinking,
      headPose: this._headPose,
      yawProxy: this._yawProxy,
      calibrated: !!this.baseline
    };
  }
}

function computeHeadPose(matrix) {
  if (!matrix) return { yaw: 0, pitch: 0 };
  const m = matrix.data;
  return { yaw: Math.atan2(-m[2], m[10]), pitch: Math.atan2(-m[6], m[10]) };
}

/** The handful of landmarks the renderer needs, in normalized video coords (0..1, unmirrored). */
function extractKeypoints(lm) {
  const p = (i) => ({ x: lm[i].x, y: lm[i].y });
  const eye = (a, b, top, bottom) => {
    const A = p(a), B = p(b), T = p(top), Bo = p(bottom);
    return {
      cx: (A.x + B.x) / 2,
      cy: (T.y + Bo.y + A.y + B.y) / 4,
      a: A, b: B,
      openness: Math.hypot(T.x - Bo.x, T.y - Bo.y)
    };
  };
  return {
    leftEye: eye(33, 133, 159, 145),
    rightEye: eye(362, 263, 386, 374),
    mouthL: p(61),
    mouthR: p(291),
    lipTop: p(13),
    lipBottom: p(14),
    chin: p(152),
    forehead: p(10),
    cheekL: p(234),
    cheekR: p(454),
    nose: p(1)
  };
}