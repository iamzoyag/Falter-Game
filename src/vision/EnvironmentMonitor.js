// Reads the raw video feed (independent of face landmarks) to notice things
// about the *room*, not the face: sudden lighting changes, motion energy
// (something moving behind the player), and camera occlusion (a hand over
// the lens looks different from "no face in frame" — it's dark AND has very
// low contrast/variance, whereas an empty room is still lit and has texture).
//
// Everything here runs on a tiny downsampled offscreen canvas (48x36) so the
// per-frame cost is trivial even on modest laptops.

const SAMPLE_W = 48;
const SAMPLE_H = 36;

const BRIGHTNESS_JUMP_THRESHOLD = 28; // 0-255 scale, frame-to-frame
const MOTION_ENERGY_THRESHOLD = 14; // mean abs pixel diff to count as "motion"
const OCCLUSION_VARIANCE_THRESHOLD = 6; // near-zero variance => lens covered

export class EnvironmentMonitor {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SAMPLE_W;
    this.canvas.height = SAMPLE_H;
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

    this.prevGray = null;
    this.baselineBrightness = null;
    this.emaBrightness = null;
  }

  /** Call once per frame with the live <video> element. Returns a signal snapshot. */
  update(videoEl) {
    if (videoEl.readyState < 2) return null;
    this.ctx.drawImage(videoEl, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = this.ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

    const gray = new Float32Array(SAMPLE_W * SAMPLE_H);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[p] = l;
      sum += l;
    }
    const brightness = sum / gray.length;

    if (this.baselineBrightness === null) this.baselineBrightness = brightness;
    this.emaBrightness = this.emaBrightness === null
      ? brightness
      : this.emaBrightness * 0.9 + brightness * 0.1;

    const brightnessJump = Math.abs(brightness - this.emaBrightness) > BRIGHTNESS_JUMP_THRESHOLD;

    let motionEnergy = 0;
    if (this.prevGray) {
      let diffSum = 0;
      for (let p = 0; p < gray.length; p++) diffSum += Math.abs(gray[p] - this.prevGray[p]);
      motionEnergy = diffSum / gray.length;
    }
    this.prevGray = gray;

    let variance = 0;
    for (let p = 0; p < gray.length; p++) variance += (gray[p] - brightness) ** 2;
    variance = Math.sqrt(variance / gray.length);

    return {
      brightness,
      brightnessDelta: brightness - this.baselineBrightness,
      brightnessJump,
      motionEnergy,
      inMotion: motionEnergy > MOTION_ENERGY_THRESHOLD,
      lowVariance: variance < OCCLUSION_VARIANCE_THRESHOLD,
      likelyCovered: variance < OCCLUSION_VARIANCE_THRESHOLD && brightness < this.baselineBrightness - 10
    };
  }

  /** Reset the "normal room" baseline — call after calibration settles. */
  resetBaseline() {
    this.baselineBrightness = this.emaBrightness;
  }
}
