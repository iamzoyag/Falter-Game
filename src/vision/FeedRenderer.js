// WebGL renderer for the player's feed. Everything that makes the reflection
// "wrong" happens here, in one fragment shader:
//   - liquify-style warps driven by face landmarks (mouth corners dragged up,
//     eyes magnified, jaw pulled down)
//   - solid black eyes (no iris, no sclera) with a faint wet highlight
//   - background-only darkening via the segmentation mask
//   - a figure composited BEHIND the player (the mask occludes it)
//   - vignette, grain, scanlines, chromatic aberration, desaturation
//
// The canvas is CSS-mirrored (see style.css), so all coordinates here are in
// the camera's unmirrored space — the same space as the landmarks and mask.

const MAX_HANDLES = 12;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
#define MAX_H ${MAX_HANDLES}
varying vec2 v_uv;
uniform sampler2D uFrame;
uniform sampler2D uMask;
uniform sampler2D uFigure;
uniform float uAspect;
uniform vec4 uH[MAX_H];
uniform vec4 uHP[MAX_H];
uniform int uHCount;
uniform vec4 uEye[2];
uniform float uEyeAng[2];
uniform float uEyesBlack;
uniform float uHasMask;
uniform float uBgDark;
uniform float uVignette;
uniform float uGrain;
uniform float uAberration;
uniform float uDesat;
uniform float uContrast;
uniform float uBrightness;
uniform float uWobble;
uniform float uTime;
uniform vec4 uFigRect;
uniform float uFigOpacity;
uniform float uFigDark;

uniform vec2 uRes;
uniform float uPixel;
uniform float uOneBit;
uniform float uThreshold;
uniform float uInvert;
uniform vec2 uLevels;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec2 warp(vec2 uv) {
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec2 s = p;
  for (int i = 0; i < MAX_H; i++) {
    if (i >= uHCount) break;
    vec4 h = uH[i];
    vec4 hp = uHP[i];
    float r = hp.x;
    if (hp.y < 0.5) {
      // translate: pixels that end up near (c + d) are fetched from near c
      float d = length(p - (h.xy + h.zw)) / r;
      float w = 1.0 - smoothstep(0.0, 1.0, d);
      s -= h.zw * w * w;
    } else {
      // bulge: magnify around c
      float d = length(p - h.xy) / r;
      if (d < 1.0) {
        float k = hp.z * pow(1.0 - d * d, 2.0);
        s = h.xy + (s - h.xy) * (1.0 - k);
      }
    }
  }
  return vec2(s.x / uAspect, s.y);
}

void main() {
  vec2 uv = v_uv;
  uv.x += sin(uv.y * 38.0 + uTime * 17.0) * 0.004 * uWobble;

  if (uPixel > 1.0) {
    vec2 cells = uRes / uPixel;
    uv = (floor(uv * cells) + 0.5) / cells;
  }

  vec2 src = warp(uv);
  float ab = uAberration * 0.006;
  vec3 col;
  col.r = texture2D(uFrame, src + vec2(ab, 0.0)).r;
  col.g = texture2D(uFrame, src).g;
  col.b = texture2D(uFrame, src - vec2(ab, 0.0)).b;

  float person = uHasMask > 0.5 ? texture2D(uMask, src).r : 0.0;
  float bg = 1.0 - smoothstep(0.35, 0.65, person);

  // figure — only where the room shows through, so the player occludes it
  if (uFigOpacity > 0.001) {
    vec2 fuv = (uv - uFigRect.xy) / uFigRect.zw;
    if (fuv.x >= 0.0 && fuv.x <= 1.0 && fuv.y >= 0.0 && fuv.y <= 1.0) {
      vec2 o = vec2(0.004, 0.003);
      vec4 f = texture2D(uFigure, fuv) * 0.4
             + texture2D(uFigure, fuv + vec2(o.x, 0.0)) * 0.15
             + texture2D(uFigure, fuv - vec2(o.x, 0.0)) * 0.15
             + texture2D(uFigure, fuv + vec2(0.0, o.y)) * 0.15
             + texture2D(uFigure, fuv - vec2(0.0, o.y)) * 0.15;
      float sceneLum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 fc = f.rgb * uFigDark * (0.5 + sceneLum);
      col = mix(col, fc, clamp(f.a * uFigOpacity * bg, 0.0, 1.0));
    }
  }

  col *= 1.0 - uBgDark * bg;

  if (uEyesBlack > 0.001) {
    vec2 p = vec2(uv.x * uAspect, uv.y);
    for (int e = 0; e < 2; e++) {
      vec2 q0 = p - uEye[e].xy;
      float c = cos(uEyeAng[e]);
      float sn = sin(uEyeAng[e]);
      vec2 q = vec2(c * q0.x + sn * q0.y, -sn * q0.x + c * q0.y) / uEye[e].zw;
      float d = length(q);
      float m = 1.0 - smoothstep(0.72, 1.0, d);
      float spec = (1.0 - smoothstep(0.0, 0.16, length(q - vec2(-0.32, -0.38)))) * 0.22;
      col = mix(col, vec3(0.006) + spec, m * uEyesBlack);
    }
  }

  float l = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 pre = col;
  col = mix(col, vec3(l), uDesat);
  col = (col - 0.5) * (1.0 + uContrast) + 0.5;
  col *= uBrightness;

  float vd = length(uv - 0.5) * 1.35;
  col *= mix(1.0, 1.0 - smoothstep(0.35, 0.95, vd), uVignette);

  if (uOneBit > 0.001) {
    float span = max(uLevels.y - uLevels.x, 0.05);
    float l2 = clamp((dot(pre, vec3(0.299, 0.587, 0.114)) - uLevels.x) / span, 0.0, 1.0);
    float nb = 0.0;
    nb += dot(texture2D(uFrame, src + vec2(0.035, 0.0)).rgb, vec3(0.333));
    nb += dot(texture2D(uFrame, src - vec2(0.035, 0.0)).rgb, vec3(0.333));
    nb += dot(texture2D(uFrame, src + vec2(0.0, 0.045)).rgb, vec3(0.333));
    nb += dot(texture2D(uFrame, src - vec2(0.0, 0.045)).rgb, vec3(0.333));
    float nbn = clamp((nb * 0.25 - uLevels.x) / span, 0.0, 1.0);
    float lc = l2 + 0.9 * (l2 - nbn);
    vec2 cell = floor(uv * uRes / max(uPixel, 1.0));
    float n = hash(cell + floor(uTime * 12.0) * 7.13) - 0.5;
    float bw = step(uThreshold, lc + n * 0.28);
    bw = mix(bw, 1.0 - bw, uInvert);
    col = mix(col, vec3(bw), uOneBit);
  }

  float g = hash(uv * uRes + fract(uTime * 7.0) * 91.0) - 0.5;
  col += g * uGrain * 0.2 * (1.0 - 0.8 * uOneBit);
  col *= 1.0 - uGrain * 0.1 * (0.5 + 0.5 * sin(uv.y * 900.0)) * (1.0 - uOneBit);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const DEFAULT_WARP = {
  smile: 0, widen: 0, jaw: 0, eyeScale: 0, eyesBlack: 0,
  bgDark: 0, vignette: 0.15, grain: 0.12, aberration: 0, desat: 0.15,
  contrast: 0.05, brightness: 1, wobble: 0,
  pixel: 1,        // block size in canvas pixels (1 = off, 3–6 = chunky)
  oneBit: 0,       // 0..1 mix into pure black/white
  invert: 0,       // 1 = photographic negative (only applies with oneBit)
  threshold: null  // null = automatic, from the room's brightness
};

export class FeedRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL not available");
    this.gl = gl;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of [
      "uFrame", "uMask", "uFigure", "uAspect", "uH", "uHP", "uHCount", "uEye", "uEyeAng", "uEyesBlack",
      "uHasMask", "uBgDark", "uVignette", "uGrain", "uAberration", "uDesat", "uContrast", "uBrightness",
      "uWobble", "uTime", "uFigRect", "uFigOpacity", "uFigDark",
      "uRes", "uPixel", "uOneBit", "uThreshold", "uInvert", "uLevels"
    ]) this.u[name] = gl.getUniformLocation(prog, name);

    this.texFrame = makeTexture(gl);
    this.texMask = makeTexture(gl);
    this.texFigure = makeTexture(gl);
    gl.uniform1i(this.u.uFrame, 0);
    gl.uniform1i(this.u.uMask, 1);
    gl.uniform1i(this.u.uFigure, 2);

    this._maskSize = 0;
    this._lastMask = null;
    this._figureSource = null;
    this.levels = { lo: 0.05, hi: 0.9, face: null };
  }

  /** Upload a figure image (HTMLImageElement / canvas / ImageBitmap with alpha). */
  setFigureImage(source) {
    if (!source || source === this._figureSource) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texFigure);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this._figureSource = source;
  }

  /**
   * @param {{ image?: TexImageSource, bitmap?: ImageBitmap, keypoints?: object, mask?: Uint8Array, maskSize?: number }} frame
   * @param {object} warp see DEFAULT_WARP
   * @param {{ rect: number[], opacity: number, dark?: number }|null} figure
   */
  render(frame, warp, figure, timeSec) {
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    const A = W / H;
    gl.viewport(0, 0, W, H);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texFrame);
    try {
      // live frames carry the <video> as `image`; buffered frames carry an ImageBitmap as `bitmap`
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.image || frame.bitmap);
    } catch {
      return; // closed bitmap / video not ready — skip this frame
    }

    const hasMask = !!frame.mask;
    if (hasMask && frame.mask !== this._lastMask) {
      const size = frame.maskSize || Math.round(Math.sqrt(frame.mask.length));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.texMask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, size, size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, frame.mask);
      this._lastMask = frame.mask;
    }

    const w = { ...DEFAULT_WARP, ...warp };
    const kp = frame.keypoints;
    const handles = kp ? buildHandles(kp, w, A) : [];
    const hv = new Float32Array(MAX_HANDLES * 4);
    const hp = new Float32Array(MAX_HANDLES * 4);
    handles.slice(0, MAX_HANDLES).forEach((h, i) => {
      hv.set([h[0], h[1], h[2], h[3]], i * 4);
      hp.set([h[4], h[5], h[6], 0], i * 4);
    });
    gl.uniform4fv(this.u.uH, hv);
    gl.uniform4fv(this.u.uHP, hp);
    gl.uniform1i(this.u.uHCount, Math.min(handles.length, MAX_HANDLES));

    const eyes = kp && w.eyesBlack > 0.001 ? buildEyes(kp, w, A) : null;
    gl.uniform4fv(this.u.uEye, eyes ? eyes.rects : new Float32Array(8));
    gl.uniform1fv(this.u.uEyeAng, eyes ? eyes.angles : new Float32Array(2));
    gl.uniform1f(this.u.uEyesBlack, eyes ? w.eyesBlack : 0);

    gl.uniform1f(this.u.uAspect, A);
    gl.uniform1f(this.u.uHasMask, hasMask ? 1 : 0);
    gl.uniform1f(this.u.uBgDark, hasMask ? w.bgDark : 0);
    gl.uniform1f(this.u.uVignette, w.vignette);
    gl.uniform1f(this.u.uGrain, w.grain);
    gl.uniform1f(this.u.uAberration, w.aberration);
    gl.uniform1f(this.u.uDesat, w.desat);
    gl.uniform1f(this.u.uContrast, w.contrast);
    gl.uniform1f(this.u.uBrightness, w.brightness);
    gl.uniform1f(this.u.uWobble, w.wobble);
    gl.uniform1f(this.u.uTime, timeSec);

    gl.uniform2f(this.u.uRes, W, H);
    gl.uniform1f(this.u.uPixel, Math.max(1, w.pixel));
    gl.uniform1f(this.u.uOneBit, w.oneBit);
    gl.uniform1f(this.u.uInvert, w.invert);
    // auto threshold, in the stretched 0..1 range: just under the face's own
    // brightness, so most of the lit face survives as white and shadows go black
    const lv = this.levels;
    const span = Math.max(0.05, lv.hi - lv.lo);
    const faceN = lv.face != null ? (lv.face - lv.lo) / span : 0.6;
    const auto = Math.min(0.75, Math.max(0.2, faceN * 0.85));
    gl.uniform2f(this.u.uLevels, lv.lo, lv.hi);
    gl.uniform1f(this.u.uThreshold, w.threshold ?? auto);

    const figOn = figure && figure.opacity > 0.001 && this._figureSource;
    gl.uniform4fv(this.u.uFigRect, figOn ? figure.rect : [0, 0, 1, 1]);
    gl.uniform1f(this.u.uFigOpacity, figOn ? figure.opacity : 0);
    gl.uniform1f(this.u.uFigDark, figure?.dark ?? 0.35);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

function buildHandles(kp, w, A) {
  const P = (pt) => [pt.x * A, pt.y];
  const H = [];
  const mL = P(kp.mouthL), mR = P(kp.mouthR);
  const mcx = (mL[0] + mR[0]) / 2;
  const mw = Math.hypot(mR[0] - mL[0], mR[1] - mL[1]) || 0.05;

  if (Math.abs(w.smile) > 0.001 || w.widen > 0.001) {
    for (const c of [mL, mR]) {
      const out = Math.sign(c[0] - mcx) || 1;
      const dx = out * mw * (0.2 * Math.max(w.smile, 0) + 0.32 * w.widen);
      const dy = -mw * 0.34 * w.smile; // negative smile drags the corners DOWN
      // radius must stay > ~2x the displacement or the image folds over itself
      H.push([c[0], c[1], dx, dy, Math.max(mw * 0.6, Math.hypot(dx, dy) * 2.2), 0, 0]);
    }
  }

  const forehead = P(kp.forehead), chin = P(kp.chin), cl = P(kp.cheekL), cr = P(kp.cheekR);
  const faceH = Math.hypot(chin[0] - forehead[0], chin[1] - forehead[1]);
  const faceW = Math.hypot(cr[0] - cl[0], cr[1] - cl[1]);
  if (w.jaw > 0.001) {
    const dy = faceH * 0.16 * w.jaw;
    H.push([chin[0], chin[1], 0, dy, Math.max(faceW * 0.62, dy * 2.2), 0, 0]);
  }

  if (w.eyeScale > 0.001) {
    for (const e of [kp.leftEye, kp.rightEye]) {
      const ew = Math.hypot((e.b.x - e.a.x) * A, e.b.y - e.a.y);
      H.push([e.cx * A, e.cy, 0, 0, ew * 1.3, 1, Math.min(0.6, w.eyeScale * 0.6)]);
    }
  }
  return H;
}

function buildEyes(kp, w, A) {
  const rects = new Float32Array(8);
  const angles = new Float32Array(2);
  [kp.leftEye, kp.rightEye].forEach((e, i) => {
    const ew = Math.hypot((e.b.x - e.a.x) * A, e.b.y - e.a.y);
    const grow = 1 + w.eyeScale * 0.9;
    const rx = ew * 0.6 * grow;
    const ry = Math.max(e.openness * 0.85, ew * 0.34) * grow;
    rects.set([e.cx * A, e.cy, rx, ry], i * 4);
    angles[i] = Math.atan2(e.b.y - e.a.y, (e.b.x - e.a.x) * A);
  });
  return { rects, angles };
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function makeTexture(gl) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  return t;
}