// WebGL renderer for the Mochi cute -> gore transitions. Ported 1:1 from
// the "Mochi Dissolve" preview (mode 2, "Rip & sew"): optical-flow morph +
// per-scene reveal order (needle sweep, ear rip sprite, radial eye bleed,
// belly hole tearing open from its centre) + camera push-ins/pans.
//
// It only draws. Timing, the attention gate and sound live in
// src/segments/MochiSegment.js.

const BASE = "/mochi/";
const IMAGES = ["cute.jpg", "stitches.jpg", "ears.jpg", "cute-noears.jpg", "eyes.jpg", "unzip.jpg"]; // 3 = cute with ears painted out
const FLOWS = ["stitches", "ears", "eyes", "unzip"].flatMap((n) => [`flow-${n}-ab.png`, `flow-${n}-ba.png`]);
const MASKS = ["mask-stitches.png", "mask-ears.png", "mask-eyes.png", "mask-unzip.png"];
const SPRITE = "ear-sprite.png";
const EARS = { R: { p: [0.6725, 0.2793], a: [0.7887, -0.6148] }, L: { p: [0.3913, 0.2839], a: [-0.7506, -0.6608] } };

// a: start image, b: end image, fl: flow pair index (into FLOWS / 2), dm: mask, kind: reveal style
export const MOCHI_SCENES = {
  stitches: { a: 0, b: 1, fl: 0, dm: 0, kind: 1 },
  ears: { a: 3, b: 2, fl: 1, dm: 1, kind: 2 },
  eyes: { a: 0, b: 4, fl: 2, dm: 2, kind: 3 },
  unzip: { a: 0, b: 5, fl: 3, dm: 3, kind: 4 }
};

const VS = "attribute vec2 p;varying vec2 vr;void main(){vr=p*.5+.5;vr.y=1.-vr.y;gl_Position=vec4(p,0,1);}";
const FS = `precision highp float;varying vec2 vr;
uniform float zoom;uniform vec2 ctr;
uniform sampler2D A,B,FAB,FBA,SP,DM;
uniform float t,prog,time,shake,mode,kind;
uniform vec2 pL,aL,pR,aR;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
vec4 ear(vec2 p,vec2 piv,vec2 ax,float side){
  float tp=clamp(t/.55,0.,1.);
  float fly=clamp((t-.55)/.45,0.,1.);
  float ff=1.-pow(1.-fly,2.);
  vec2 d=p-piv;
  d-=vec2(sin(time*47.+side*3.),cos(time*41.))*.0045*tp*step(t,.55);
  d-=ax*ff*.95;
  float ang=side*ff*2.4; float cs=cos(-ang),sn=sin(-ang);
  d=vec2(cs*d.x-sn*d.y,sn*d.x+cs*d.y);
  vec2 nn=vec2(-ax.y,ax.x);
  float al=dot(d,ax),pe=dot(d,nn);
  float st=1.+.32*tp*tp; al/=st; pe*=1.+.07*tp*tp;
  vec2 q=piv+ax*al+nn*pe;
  vec4 s=texture2D(SP,q);
  float ok=side<0.?step(q.x,.5):step(.5,q.x);
  s.a*=ok*(1.-smoothstep(.8,1.,fly))*step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
  return s;
}
void main(){
  vec2 v=(vr-.5)/zoom+ctr;
  vec2 uv=v;
  float rip=step(1.5,mode)*step(abs(kind-2.),.5);
  float snap=exp(-pow((t-.56)*16.,2.))*rip;
  uv+=shake*(vec2(h(vec2(floor(time*14.),1.)),h(vec2(floor(time*14.),2.)))-.5)*.012;
  uv.x+=shake*.004*sin(uv.y*40.+time*9.);
  uv+=snap*(vec2(h(vec2(floor(time*30.),3.)),h(vec2(floor(time*30.),4.)))-.5)*.035;
  float g=t;
  if(mode>1.5) g=kind<1.5?smoothstep(.15,1.,t):(kind<2.5?smoothstep(.55,1.,t):t);
  float gm=step(.5,mode)*g;
  vec2 fab=(texture2D(FAB,v).rg-.5)*400./768.;
  vec2 fba=(texture2D(FBA,v).rg-.5)*400./768.;
  vec4 a=texture2D(A,uv+gm*fba),b=texture2D(B,uv+(gm>0.?1.-gm:0.)*fab);
  if(mode<.5) { a=texture2D(A,uv); b=texture2D(B,uv); }
  if(mode>1.5&&kind>2.5) b=texture2D(B,uv);
  float w; float rimK=0.;
  if(mode<.5){
    float nz=clamp((fbm(v*5.5)-.12)/.76,0.,1.);
    float e=.10,p=t*(1.+2.*e)-e;
    w=1.-smoothstep(p-e,p+e,nz);
  } else {
    w=g;
    if(mode>1.5){
      float d=texture2D(DM,v).r;
      float wr;
      if(kind<1.5){
        float o=clamp((v.x-.40)/.36,0.,1.);
        float tt=clamp((t-.12)/.8,0.,1.)*1.08;
        float q=floor(o*10.)/10.;
        wr=1.-smoothstep(0.,.025,q-tt);
        float zone=smoothstep(.36,.42,v.x)*(1.-smoothstep(.76,.80,v.x))*smoothstep(.44,.5,v.y)*(1.-smoothstep(.70,.76,v.y));
        d*=zone;
      } else if(kind<2.5){
        float o=clamp((v.y-.25)/.45,0.,1.)+(n(v*11.)-.5)*.16;
        float tt=clamp((t-.55)/.45,0.,1.)*1.2;
        wr=1.-smoothstep(0.,.08,o-tt);
      } else if(kind<3.5){
        float dl=distance(v,vec2(.41,.46)),dr=distance(v,vec2(.61,.46));
        float o=min(dl,dr)/.24+(n(v*13.)-.5)*.18;
        float tt=clamp((t-.12)/.8,0.,1.)*1.25;
        wr=1.-smoothstep(0.,.10,o-tt);
        d*=smoothstep(.30,.36,v.y)*(1.-smoothstep(.72,.8,v.y));
      } else {
        vec4 mk=texture2D(DM,v);
        float o=mk.g+(fbm(v*10.)-.5)*.16;
        float x=clamp((t-.06)/.86,0.,1.);
        float tt=pow(x,.75)*1.22-.06;
        wr=1.-smoothstep(0.,.025,o-tt);
        float rim=(1.-smoothstep(0.,.07,tt-o))*step(0.,tt-o);
        d=smoothstep(.2,.55,mk.r);
        rimK=rim*d;
      }
      w=mix(g,wr,d);
    }
  }
  vec3 c=mix(a.rgb,b.rgb,w);
  c=mix(c,vec3(.42,.015,.04),clamp(rimK,0.,1.)*.75);
  if(mode<.5){float nz2=clamp((fbm(v*5.5)-.12)/.76,0.,1.);float e=.10,p=t*(1.+2.*e)-e;float band=smoothstep(0.,1.,1.-abs(nz2-p)/e)*step(.002,t)*step(t,.998);c=mix(c,vec3(.55,.03,.07),band*.55);}
  if(rip>.5){
    vec4 sl=ear(v,pL,aL,-1.); c=mix(c,sl.rgb,sl.a);
    vec4 sr=ear(v,pR,aR,1.); c=mix(c,sr.rgb,sr.a);
    c=mix(c,c*vec3(1.,.55,.55),snap*.5);
  }
  float d2=prog;
  c=mix(c,c*vec3(1.0,.72,.74),d2*.6);
  float vig=smoothstep(.95,.25,distance(vr,vec2(.5)));
  c*=mix(1.,.55+.45*vig,d2);
  c+=(h(vr*700.+time)-.5)*.05*(.3+d2);
  gl_FragColor=vec4(c,1.);
}`;

const sm = (a, b, x) => { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); };
const lerp = (a, b, x) => a + (b - a) * x;

/** Camera per scene: [zoom, centreX, centreY] in UV. */
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
  cx = Math.min(1 - 0.5 / z, Math.max(0.5 / z, cx)); cy = Math.min(1 - 0.5 / z, Math.max(0.5 / z, cy));
  return [z, cx, cy];
}

const load = (src) => new Promise((resolve, reject) => {
  const i = new Image();
  i.onload = () => resolve(i);
  i.onerror = () => reject(new Error("missing " + src));
  i.src = src;
});

export class MochiEngine {
  /** @param {HTMLCanvasElement} canvas 768x768 */
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._loading = null;
  }

  /** Loads everything once; safe to call repeatedly. Resolves false if assets are missing. */
  load() {
    this._loading ??= this._load().then(() => (this.ready = true)).catch((e) => {
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
    const gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: false });
    this.gl = gl;
    if (!gl) {
      // no WebGL: plain cross-fade
      const g = this.canvas.getContext("2d");
      this._draw2d = (s, t) => {
        g.globalAlpha = 1; g.drawImage(imgs[s.a === 3 ? 0 : s.a], 0, 0, 768, 768);
        g.globalAlpha = t; g.drawImage(imgs[s.b], 0, 0, 768, 768);
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

    const mk = (im, fmt) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, im);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.tex = imgs.map((im) => mk(im, gl.RGBA));
    this.ftex = flows.map((im) => mk(im, gl.RGB));
    this.dtex = masks.map((im) => mk(im, gl.RGB));
    this.spriteTex = mk(sprite, gl.RGBA);
    const u = {};
    ["A", "B", "FAB", "FBA", "SP", "DM", "t", "prog", "time", "shake", "mode", "kind", "pL", "aL", "pR", "aR", "zoom", "ctr"].forEach((k) => (u[k] = gl.getUniformLocation(prog, k)));
    [["A", 0], ["B", 1], ["FAB", 2], ["FBA", 3], ["SP", 4], ["DM", 5]].forEach(([k, i]) => gl.uniform1i(u[k], i));
    gl.uniform2f(u.pL, ...EARS.L.p); gl.uniform2f(u.aL, ...EARS.L.a);
    gl.uniform2f(u.pR, ...EARS.R.p); gl.uniform2f(u.aR, ...EARS.R.a);
    gl.uniform1f(u.mode, 2);
    this.u = u;
  }

  /** The plain cute image, e.g. for the Act I host. */
  get cuteUrl() { return BASE + IMAGES[0]; }

  /**
   * Draw one frame.
   * @param {string} name scene
   * @param {number} t transition 0..1 (already eased)
   * @param {number} prog overall event progress 0..1 (drives tint/vignette/grain/shake)
   * @param {number} timeMs performance.now()
   */
  render(name, t, prog, timeMs) {
    if (!this.ready) return;
    const s = MOCHI_SCENES[name];
    if (this._draw2d) return this._draw2d(s, t);
    const gl = this.gl, u = this.u;
    const bind = (unit, tx) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx); };
    bind(0, this.tex[s.a]); bind(1, this.tex[s.b]);
    bind(2, this.ftex[s.fl * 2]); bind(3, this.ftex[s.fl * 2 + 1]);
    bind(4, this.spriteTex); bind(5, this.dtex[s.dm]);
    const [z, cx, cy] = camFor(name, t, timeMs);
    gl.uniform1f(u.zoom, z); gl.uniform2f(u.ctr, cx, cy);
    gl.uniform1f(u.t, t); gl.uniform1f(u.prog, prog); gl.uniform1f(u.time, timeMs / 1000);
    gl.uniform1f(u.kind, s.kind);
    gl.uniform1f(u.shake, this.reduceMotion ? 0 : Math.max(0, prog - 0.35) * (t > 0 && t < 1 ? 1.4 : 0.5));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
