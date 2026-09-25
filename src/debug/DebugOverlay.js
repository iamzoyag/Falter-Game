import { CHANNEL_NAMES, SPIKE_Z, CHANNEL_Z_MULT } from "../vision/FaceTracker.js";

// Press D to toggle. Live bars per expression channel: raw value, your
// baseline mean (white tick), the spike threshold (red tick), and z-score.
// Use it to tune thresholds against your own face before blaming the game.

export class DebugOverlay {
  constructor() {
    this.visible = false;
    this.canvas = document.createElement("canvas");
    this.canvas.id = "debug-canvas";
    this.canvas.width = 320;
    this.canvas.height = 300;
    this.canvas.style.display = "none";
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this._fps = 0;
    this._last = performance.now();

    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "d" || e.key === "D") {
        this.visible = !this.visible;
        this.canvas.style.display = this.visible ? "block" : "none";
      }
    });
  }

  update({ face, faceTracker, director, lastEntry, feed }) {
    const now = performance.now();
    this._fps = this._fps * 0.9 + (1000 / Math.max(1, now - this._last)) * 0.1;
    this._last = now;
    if (!this.visible) return;

    const c = this.ctx, W = this.canvas.width;
    c.clearRect(0, 0, W, this.canvas.height);
    c.fillStyle = "rgba(0,0,0,0.82)";
    c.fillRect(0, 0, W, this.canvas.height);
    c.font = "11px monospace";
    c.fillStyle = "#ccc";

    let y = 16;
    const line = (t, color = "#ccc") => { c.fillStyle = color; c.fillText(t, 8, y); y += 14; };
    line(`fps ${this._fps.toFixed(0)}  face ${face?.faceVisible ? "yes" : "NO"}  calibrated ${face?.calibrated ? "yes" : "no"}`);
    line(`blink ${face?.blinking ? "●" : "○"}  away ${face?.lookingAway ? "●" : "○"}  yaw ${(face?.yawProxy ?? 0).toFixed(2)}  feed ${feed?.mode}`);

    const base = faceTracker.baseline;
    const barX = 86, barW = 150;
    for (const ch of CHANNEL_NAMES) {
      const v = face?.channels?.[ch] ?? 0;
      const z = face?.z?.[ch] ?? 0;
      const zt = SPIKE_Z * (CHANNEL_Z_MULT[ch] || 1);
      c.fillStyle = "#888";
      c.fillText(ch, 8, y + 8);
      c.fillStyle = "#222";
      c.fillRect(barX, y, barW, 10);
      c.fillStyle = z > zt ? "#c23b3b" : "#6a8a6a";
      c.fillRect(barX, y, Math.min(1, v) * barW, 10);
      if (base) {
        const m = base.mean[ch], sd = Math.max(base.std[ch], 0.025);
        c.fillStyle = "#fff";
        c.fillRect(barX + Math.min(1, m) * barW, y - 2, 1, 14);
        c.fillStyle = "#f55";
        c.fillRect(barX + Math.min(1, m + sd * zt) * barW, y - 2, 1, 14);
      }
      c.fillStyle = z > zt ? "#f77" : "#aaa";
      c.fillText(`z ${z.toFixed(1)}`, barX + barW + 8, y + 9);
      y += 16;
    }

    y += 4;
    const recent = faceTracker.spikes.slice(-3).map((s) => `${s.channel}(${s.peakZ.toFixed(1)})`).join(" ");
    line(`spikes: ${recent || "-"}`);
    line(`darkness ${director?.dark.toFixed(2) ?? "-"}  creep ${director?.creep.toFixed(2) ?? "-"}  stage ${director?.stageId ?? "-"}`);
    if (lastEntry) {
      const tells = Object.entries(lastEntry.tells).filter(([, v]) => v).map(([k]) => k).join(",") || "none";
      line(`last: face=${lastEntry.faceVerdict} tells=${tells}`, lastEntry.mismatch ? "#f77" : "#ccc");
      line(`      latency ${(lastEntry.latencyMs / 1000).toFixed(1)}s  switches ${lastEntry.cursor.switches}  curve ${lastEntry.cursor.curvature}`);
    }
  }
}