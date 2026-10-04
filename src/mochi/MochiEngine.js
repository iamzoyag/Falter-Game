// WebGL renderer for the Mochi cute -> gore transitions (from the "Mochi
// Dissolve" preview, "Rip & sew" mode): optical-flow morph + per-scene reveal
// order (needle sweep, ear rip sprite, sockets bleeding outward, belly hole
// tearing open from its centre) + camera push-ins/pans.
//
// Mochi is a CUT-OUT now (RGBA WebP, premultiplied alpha): the canvas covers
// the whole screen and is transparent, so she sits straight on the game's
// background and the camera can push in past the screen edge with no box.
//
// It only draws. Timing, the attention gate and sound live in
// src/segments/MochiSegment.js.

const BASE = "/mochi/";
// One injury at a time. Each end image is cute Mochi with only that wound
// (built by tools/make_stitches_local.py and tools/make_wound_images.py from
// the original gore art), so only the wound changes:
//   0 cute   1 stitches   2 ear stumps   3 cute with the ears painted out (they're a sprite)   4 eyes   5 belly
const IMAGES = ["cute.webp", "stitches-local.webp", "wounds-ears.webp", "cute-noears.webp", "wounds-eyes.webp", "wounds-unzip.webp"];
const FLOWS = ["stitches", "ears", "eyes", "unzip"].flatMap((n) => [`flow-${n}-ab.png`, `flow-${n}-ba.png`]);
// R/G as before; for ears/eyes/unzip B = where that scene may change at all
const MASKS = ["mask-stitches-local.png", "mask-ears-local.png", "mask-eyes-local.png", "mask-unzip-local.png"];
const SPRITE = "ear-sprite.webp";
const EARS = { R: { p: [0.6725, 0.2793], a: [0.7887, -0.6148] }, L: { p: [0.3913, 0.2839], a: [-0.7506, -0.6608] } };

export const MOCHI_CUTE_URL = BASE + IMAGES[0];

// a: start image, b: end image, fl: flow pair index (into FLOWS / 2), dm: mask, kind: reveal style
export const MOCHI_SCENES = {
  stitches: { a: 0, b: 1, fl: 0, dm: 0, kind: 1 },
  ears: { a: 3, b: 2, fl: 1, dm: 1, kind: 2 },
  eyes: { a: 0, b: 4, fl: 2, dm: 2, kind: 3 },
  unzip: { a: 0, b: 5, fl: 3, dm: 3, kind: 4 }
};

/** On-screen size of Mochi (CSS px) when the camera isn't zoomed. */
export function mochiBoxCss() {
  return Math.min(window.innerHeight * 0.78, window.innerWidth * 0.92);
}

const VS = "attribute vec2 p;varying vec2 vr;void main(){vr=p*.5+.5;vr.y=1.-vr.y;gl_Position=vec4(p,0,1);}";

// All colours are premultiplied by alpha.
// kinds: 1 stitches (needle sweep), 2 ears (rip sprite), 3 eyes (sockets bleed outward), 4 unzip (hole tears open)
// Masks for kinds 3 and 4: R = wound, G = reveal order (0 first .. 1 last).
// Mask for kind 1: R = where she changes (mouth, cheek, blood mark), feathered.
// Kinds 2-4: B = where she changes. Nothing outside it moves or changes colour.
const FS = `precision highp float;varying vec2 vr;
uniform float zoom;uniform vec2 ctr;uniform vec2 box;
uniform sampler2D A,B,FAB,FBA,SP,DM;
uniform float t,prog,time,shake,kind,calm;
uniform vec2 pL,aL,pR,aR;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
float inside(vec2 p){return step(0.,p.x)*step(p.x,1.)*step(0.,p.y)*step(p.y,1.);}
vec4 ear(vec2 p,vec2 piv,vec2 ax,float side){
  float tp=clamp(t/.55,0.,1.);
  float fly=clamp((t-.55)/.45,0.,1.);
  float ff=1.-pow(1.-fly,2.);
  vec2 d=p-piv;
  d-=vec2(sin(time*47.+side*3.),cos(time*41.))*.0045*tp*step(t,.55)*(1.-calm);
  d-=ax*ff*.95;
  float ang=side*ff*2.4; float cs=cos(-ang),sn=sin(-ang);
  d=vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y);
  vec2 nn=vec2(-ax.y,ax.x);
  float al=dot(d,ax),pe=dot(d,nn);
  float st=1.+.32*tp*tp; al/=st; pe*=1.+.07*tp*tp;
  vec2 q=piv+ax*al+nn*pe;
  vec4 s=texture2D(SP,q);
  float ok=side<0.?step(q.x,.5):step(.5,q.x);
  return s*ok*(1.-smoothstep(.8,1.,fly))*inside(q);
}
void main(){
  vec2 v=(vr-.5)*box/zoom+ctr;
  vec2 uv=v;
  float rip=step(abs(kind-2.),.5);
  float snap=exp(-pow((t-.56)*16.,2.))*rip*(1.-calm);
  uv+=shake*(vec2(h(vec2(floor(time*14.),1.)),h(vec2(floor(time*14.),2.)))-.5)*.012;
  uv.x+=shake*.004*sin(uv.y*40.+time*9.);
  uv+=snap*(vec2(h(vec2(floor(time*30.),3.)),h(vec2(floor(time*30.),4.)))-.5)*.035;
  float g=kind<1.5?smoothstep(.15,1.,t):(kind<2.5?smoothstep(.55,1.,t):t);
  vec2 fab=(texture2D(FAB,v).rg-.5)*400./768.;
  vec2 fba=(texture2D(FBA,v).rg-.5)*400./768.;
  float loc=kind<1.5?texture2D(DM,v).r:texture2D(DM,v).b;
  vec2 ua=uv+g*fba*loc, ub=uv+(1.-g)*fab*loc;
  if(kind>2.5) ub=uv;
  vec4 a=texture2D(A,ua)*inside(ua), b=texture2D(B,ub)*inside(ub);
  float d=texture2D(DM,v).r;
  float wr=g; float rimK=0.;
  if(kind<1.5){
    float o=clamp((v.x-.40)/.36,0.,1.);
    float tt=clamp((t-.12)/.8,0.,1.)*1.08;
    float q=floor(o*10.)/10.;
    wr=1.-smoothstep(0.,.025,q-tt);
    d=1.;
  } else if(kind<2.5){
    float o=clamp((v.y-.25)/.45,0.,1.)+(n(v*11.)-.5)*.16;
    float tt=clamp((t-.55)/.45,0.,1.)*1.2;
    wr=1.-smoothstep(0.,.08,o-tt);
  } else {
    // eyes + unzip: crisp ragged edge travelling along the order map, wet rim just inside it
    vec4 mk=texture2D(DM,v);
    float o=mk.g+(fbm(v*(kind<3.5?14.:10.))-.5)*(kind<3.5?.10:.16);
    float x=kind<3.5?clamp((t-.08)/.84,0.,1.):clamp((t-.06)/.86,0.,1.);
    float tt=pow(x,kind<3.5?.85:.75)*1.22-.06;
    wr=1.-smoothstep(0.,kind<3.5?.03:.025,o-tt);
    float rim=(1.-smoothstep(0.,.07,tt-o))*step(0.,tt-o);
    d=smoothstep(.2,.55,mk.r);
    rimK=rim*d;
  }
  float w=kind<1.5?wr*loc:mix(g,wr,d);
  vec4 c=mix(a,b,w);
  c.rgb=mix(c.rgb,vec3(.42,.015,.04)*c.a,clamp(rimK,0.,1.)*.75);
  if(rip>.5){
    vec4 sl=ear(v,pL,aL,-1.); c=sl+c*(1.-sl.a);
    vec4 sr=ear(v,pR,aR,1.); c=sr+c*(1.-sr.a);
    c.rgb=mix(c.rgb,c.rgb*vec3(1.,.55,.55),snap*.5);
  }
  c.rgb=mix(c.rgb,c.rgb*vec3(1.0,.72,.74),prog*(kind<1.5?0.:.22));
  c.rgb+=(h(vr*700.+time)-.5)*.05*(.3+prog)*c.a;
  gl_FragColor=clamp(c,0.,1.);
}`;

const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, x) => a + (b - a) * x;

/** Camera per scene: [zoom, centreX, centreY] in Mochi's UV space. */
export function camFor(name, t, time) {
  let z = 1, cx = 0.5, cy = 0.5;
  if (name === "stitches") {
    const zin = sm(0, 0.22, t), zout = sm(0.8, 1, t);
    z = 1 + 0.95 * zin * (1 - zout);
    cx = lerp(0.5, 0.64, sm(0.2, 0.85, t)); cy = lerp(0.57, 0.56, sm(0.2, 0.85, t));
    cx = lerp(cx, 0.5, zout); cy = lerp(cy, 0.5, zout);
  } else if (name === "ears") {
    z = 1 + 0.35 * sm(0, 0.55, t) * (1 - sm(0.62, 1, t)) + 0.14 * Math.exp(-Math.pow((t - 0.56) * 12, 2));
    cx = 0.5; cy = lerp(0.5, 0.34, sm(0, 0.55, t) * (1 - sm(0.62, 1, t)));
  } else if (name === "eyes") {
    z = 1 + 0.75 * sm(0, 0.5, t) * (1 - 0.7 * sm(0.75, 1, t));
    cx = 0.51; cy = lerp(0.47, 0.52, sm(0.3, 1, t));
  } else if (name === "unzip") {
    z = 1 + 0.6 * sm(0, 0.4, t) * (1 - sm(0.8, 1, t));
    cx = 0.5; cy = lerp(0.7, 0.78, sm(0.1, 0.7, t)); cy = lerp(cy, 0.5, sm(0.8, 1, t));
  }
  if (z > 1.01) { cx += 0.004 * Math.sin(time * 0.0007) * (z - 1); cy += 0.003 * Math.cos(time * 0.0009) * (z - 1); }
  return [z, cx, cy];
}

const load = (src) => new Promise((resolve, reject) => {
  const i = new Image();
  i.onload = () => resolve(i);
  i.onerror = () => reject(new Error("missing " + src));
  i.src = src;
});

export class MochiEngine {
  /** @param {HTMLCanvasElement} canvas full-screen, transparent */
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.calm = false; // "reduce flashing": no snap flash, no shake
    this._loading = null;
  }

  /**
   * Bake the outfit the player picked (src/mochi/outfit.js parts) into every
   * Mochi image, so she's still wearing it while she's hurt. The images all
   * share one framing, so one set of positions fits them all. Safe to call
   * before the engine has loaded.
   */
  setOutfit(parts) {
    this._outfit = parts?.length ? parts : null;
    if (this.ready) this._applyOutfit();
  }

  _applyOutfit() {
    if (!this._outfit || !this._plain) return;
    // the neck piece is lost to the belly wound (image 5): it fades into the hole as it opens
    const skip = (i, a) => i === 5 && a.slot === "neck";
    const dressed = this._plain.map((im, idx) => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth || im.width;
      c.height = im.naturalHeight || im.height;
      const g = c.getContext("2d");
      g.drawImage(im, 0, 0);
      for (const a of this._outfit) {
        if (skip(idx, a)) continue;
        g.save();
        g.translate(a.x * c.width, a.y * c.height);
        g.rotate((a.rot * Math.PI) / 180);
        g.font = `${Math.round(a.size * c.height)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.shadowColor = "rgba(120, 40, 80, 0.25)";
        g.shadowOffsetY = 2;
        g.shadowBlur = 3;
        g.fillText(a.glyph, 0, 0);
        g.restore();
      }
      return c;
    });
    this.images = dressed;
    const gl = this.gl;
    if (gl && this.tex) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      dressed.forEach((c, i) => {
        gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      });
    }
  }

  /** Loads everything once; safe to call repeatedly. Resolves false if assets are missing. */
  load() {
    this._loading ??= this._load().then(() => { this.ready = true; this._applyOutfit(); return true; }).catch((e) => {
      console.warn("[mochi] assets failed to load", e);
      return false;
    });
    return this._loading;
  }

  async _load() {
    const [imgs, flows, masks, sprite] = await Promise.all([
      Promise.all(IMAGES.map((f) => load(BASE + f))),
      Promise.all(FLOWS.map((f) => load(BASE + f))),
      Promise.all(MASKS.map((f) => load(BASE + f))),
      load(BASE + SPRITE)
    ]);
    this.images = imgs;
    this._plain = imgs;
    const gl = this.canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    this.gl = gl;
    if (!gl) {
      // no WebGL: plain cross-fade, centred
      const g = this.canvas.getContext("2d");
      this._draw2d = (s, t) => {
        this._resize();
        const W = this.canvas.width, H = this.canvas.height, S = mochiBoxCss() * this._dpr;
        const x = (W - S) / 2, y = (H - S) / 2;
        g.clearRect(0, 0, W, H);
        const im = this.images;
        g.globalAlpha = 1 - t; g.drawImage(im[s.a === 3 ? 0 : s.a], x, y, S, S); // no ear sprite here: start from cute
        g.globalAlpha = t; g.drawImage(im[s.b], x, y, S, S);
        g.globalAlpha = 1;
      };
      return;
    }
    const sh = (type, src) => {
      const o = gl.createShader(type);
      gl.shaderSource(o, src);
      gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o));
      return o;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const mk = (im, fmt, premul) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tex = imgs.map((im) => mk(im, gl.RGBA, true));
    this.ftex = flows.map((im) => mk(im, gl.RGB, false));
    this.dtex = masks.map((im) => mk(im, gl.RGB, false));
    this.spriteTex = mk(sprite, gl.RGBA, true);
    const u = {};
    ["A", "B", "FAB", "FBA", "SP", "DM", "t", "prog", "time", "shake", "kind", "calm", "pL", "aL", "pR", "aR", "zoom", "ctr", "box"].forEach((k) => (u[k] = gl.getUniformLocation(prog, k)));
    [["A", 0], ["B", 1], ["FAB", 2], ["FBA", 3], ["SP", 4], ["DM", 5]].forEach(([k, i]) => gl.uniform1i(u[k], i));
    gl.uniform2f(u.pL, ...EARS.L.p); gl.uniform2f(u.aL, ...EARS.L.a);
    gl.uniform2f(u.pR, ...EARS.R.p); gl.uniform2f(u.aR, ...EARS.R.a);
    this.u = u;
  }

  _resize() {
    this._dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * this._dpr), h = Math.round(window.innerHeight * this._dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /**
   * Draw one frame.
   * @param {string} name scene
   * @param {number} t transition 0..1 (already eased)
   * @param {number} prog overall event progress 0..1 (drives tint/grain/shake)
   * @param {number} timeMs performance.now()
   */
  render(name, t, prog, timeMs) {
    if (!this.ready) return;
    const s = MOCHI_SCENES[name];
    if (this._draw2d) return this._draw2d(s, t);
    this._resize();
    const gl = this.gl, u = this.u;
    const W = this.canvas.width, H = this.canvas.height, S = mochiBoxCss() * this._dpr;
    const bind = (unit, tx) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); };
    bind(0, this.tex[s.a]); bind(1, this.tex[s.b]);
    bind(2, this.ftex[s.fl * 2]); bind(3, this.ftex[s.fl * 2 + 1]);
    bind(4, this.spriteTex); bind(5, this.dtex[s.dm]);
    const [z, cx, cy] = camFor(name, t, timeMs);
    const still = this.calm || this.reduceMotion;
    gl.uniform1f(u.zoom, z); gl.uniform2f(u.ctr, cx, cy); gl.uniform2f(u.box, W / S, H / S);
    gl.uniform1f(u.t, t); gl.uniform1f(u.prog, prog); gl.uniform1f(u.time, timeMs / 1000);
    gl.uniform1f(u.kind, s.kind);
    gl.uniform1f(u.calm, still ? 1 : 0);
    gl.uniform1f(u.shake, still ? 0 : Math.max(0, prog - 0.35) * (t > 0 && t < 1 ? 1.4 : 0.5));
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
