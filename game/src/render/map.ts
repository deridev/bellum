import type { MapAssets } from '../data/types';
import { Camera } from './camera';
import { FULLSCREEN_VS, hexToRgb, program, texture, updateTexture, type Program } from './gl';

/**
 * World map renderer.
 * Pass 1 draws province polygons into an ID buffer at screen resolution (crisp borders at any zoom).
 * Pass 2 composites terrain imagery, real-elevation hillshade, political colour, borders and highlights.
 * War theaters (continuous fronts) plug into pass 2 as extra layers (see theaters.ts).
 */
const ID_VS = `#version 300 es
in vec2 aPos; in float aProv;
uniform vec2 uCenter, uRes; uniform float uUpp, uOffset;
flat out int vProv;
void main(){ vec2 d = vec2(aPos.x + uOffset - uCenter.x, aPos.y - uCenter.y) / uUpp; gl_Position = vec4(d / (uRes * 0.5), 0.0, 1.0); vProv = int(aProv + 0.5); }`;
const ID_FS = `#version 300 es
precision highp float; precision highp int;
flat in int vProv; out vec4 o;
void main(){ o = vec4(float(vProv & 255) / 255.0, float(vProv >> 8) / 255.0, 1.0, 1.0); }`;

export const COMPOSITE_HEADER = `#version 300 es
precision highp float; precision highp int;
uniform vec2 uRes, uCenter; uniform float uUpp, uDpr, uTime, uMode;
uniform sampler2D tId, tBaseW, tBaseE, tDem, tOwner, tPal, tVal;
uniform int uSel, uHover, uPlayer;
out vec4 o;
const float RAD = 0.017453292519943295;
float invMiller(float y){ return (2.5 * atan(exp(0.8 * y * RAD)) - 0.625 * 3.14159265) / RAD; }
float hi(ivec2 q){ uvec2 v = uvec2(q); uint h = v.x * 374761393u + v.y * 668265263u; h = (h ^ (h >> 13u)) * 1274126177u; return float(h ^ (h >> 16u)) * (1.0/4294967295.0); }
float vn(vec2 p){ vec2 fl = floor(p); ivec2 i = ivec2(fl); vec2 f = p - fl; vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hi(i), hi(i+ivec2(1,0)), u.x), mix(hi(i+ivec2(0,1)), hi(i+ivec2(1,1)), u.x), u.y); }
int provAt(ivec2 q){ q = clamp(q, ivec2(0), ivec2(uRes) - 1); vec4 t = texelFetch(tId, q, 0); return t.b > 0.5 ? int(t.r * 255.0 + 0.5) + int(t.g * 255.0 + 0.5) * 256 : -1; }
int ownerOf(int p){ if (p < 0) return -1; vec4 t = texelFetch(tOwner, ivec2(p % 2048, p / 2048), 0); return int(t.r * 255.0 + 0.5) + int(t.g * 255.0 + 0.5) * 256; }
vec3 palette(int c){ return texelFetch(tPal, ivec2(c, 0), 0).rgb; }
float provVal(int p){ return texelFetch(tVal, ivec2(p % 2048, p / 2048), 0).r; }
`;

const COMPOSITE_FS = COMPOSITE_HEADER + `
// THEATER_DECLS
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = uCenter + (fc - uRes * 0.5) * uUpp;
  float lon = mod(p.x + 180.0, 360.0) - 180.0, lat = invMiller(p.y);
  // ---- terrain imagery (two halves) ----
  vec2 uvW = vec2((lon + 180.0) / 180.0, (90.0 - lat) / 180.0), uvE = vec2(lon / 180.0, uvW.y);
  vec2 gx = dFdx(vec2(p.x / 180.0, uvW.y)), gy = dFdy(vec2(p.x / 180.0, uvW.y));
  vec3 base = lon < 0.0 ? textureGrad(tBaseW, uvW, gx, gy).rgb : textureGrad(tBaseE, uvE, gx, gy).rgb;
  // elevation hillshade (DEM is sqrt-scaled to 8800 m)
  vec2 duv = vec2((lon + 180.0) / 360.0, (90.0 - lat) / 180.0); vec2 ts = vec2(1.0 / 4096.0, 1.0 / 2048.0);
  float eC = texture(tDem, duv).r; float e = eC * eC * 8800.0;
  float eL = texture(tDem, duv - vec2(ts.x, 0)).r, eR = texture(tDem, duv + vec2(ts.x, 0)).r, eD = texture(tDem, duv + vec2(0, ts.y)).r, eU = texture(tDem, duv - vec2(0, ts.y)).r;
  float kx = 8800.0 / (9.8 * max(0.2, cos(lat * RAD))), ky = 8800.0 / 9.8;
  float dzx = (eR*eR - eL*eL) * kx * 0.5, dzy = (eU*eU - eD*eD) * ky * 0.5; // metres per km
  // fine detail that fades in with zoom
  float det = 0.0, a = 0.5, f = 40.0;
  for (int k = 0; k < 6; k++){ float fade = smoothstep(uUpp * 2.5, uUpp * 9.0, 1.0 / f); det += (vn(vec2(lon, lat) * f + float(k) * 13.7) - 0.5) * a * fade; f *= 2.3; a *= 0.55; }
  vec2 dd = vec2(dFdx(det), dFdy(det)) / uUpp;
  float rough = clamp(e / 2500.0, 0.15, 1.2);
  vec3 nrm = normalize(vec3(-dzx * 0.004 - dd.x * 0.006 * rough, -dzy * 0.004 - dd.y * 0.006 * rough, 1.0));
  float sun = clamp(dot(nrm, normalize(vec3(-0.55, 0.65, 0.62))), 0.0, 1.0);
  // the imagery is pastel: deepen it toward a satellite look
  vec3 land = pow(base, vec3(1.7)) * 1.05;
  float l = dot(land, vec3(0.3, 0.59, 0.11)); land = mix(vec3(l), land, 1.35);
  land *= 0.55 + 0.75 * sun;
  vec3 sea = mix(vec3(0.025, 0.06, 0.12), pow(base, vec3(2.2)) * vec3(0.45, 0.6, 0.85), 0.35);
  sea *= 0.92 + 0.12 * vn(vec2(lon, lat) * 6.0 + uTime * 0.03);

  // ---- provinces ----
  ivec2 q = ivec2(fc);
  int pid = provAt(q);
  int own = ownerOf(pid);
  int s1 = int(max(1.0, floor(uDpr + 0.5))), s2 = s1 * 2;
  int pN = provAt(q + ivec2(0, s1)), pS = provAt(q - ivec2(0, s1)), pE = provAt(q + ivec2(s1, 0)), pW = provAt(q - ivec2(s1, 0));
  int cN = ownerOf(provAt(q + ivec2(0, s2))), cS = ownerOf(provAt(q - ivec2(0, s2))), cE = ownerOf(provAt(q + ivec2(s2, 0))), cW = ownerOf(provAt(q - ivec2(s2, 0)));
  vec3 col;
  if (pid < 0) {
    col = sea;
    bool nearLand = pN >= 0 || pS >= 0 || pE >= 0 || pW >= 0;
    if (nearLand) col += vec3(0.25, 0.35, 0.45) * 0.35;
  } else {
    col = land;
    vec3 cc = palette(own);
    float tint = uMode < 0.5 ? 0.6 : uMode < 1.5 ? 0.0 : 0.66;
    if (uMode > 1.5) { float v = provVal(pid); cc = mix(vec3(0.12, 0.2, 0.45), vec3(0.98, 0.82, 0.25), v); }
    float sl = dot(col, vec3(0.33));
    col = mix(col, cc * (0.22 + 1.05 * sl), tint);
    // THEATER_APPLY
    if (own == uSel) col = mix(col, col * 1.25 + 0.04, 0.6);
    if (pid == uHover) col = col * 1.18 + 0.05;
    bool provEdge = (pN != pid && pN >= 0) || (pS != pid && pS >= 0) || (pE != pid && pE >= 0) || (pW != pid && pW >= 0);
    bool countryEdge = (cN != own && cN >= 0) || (cS != own && cS >= 0) || (cE != own && cE >= 0) || (cW != own && cW >= 0);
    bool coast = pN < 0 || pS < 0 || pE < 0 || pW < 0;
    float zoomed = smoothstep(0.08, 0.02, uUpp * uDpr);
    if (provEdge && !countryEdge) col = mix(col, col * 0.55, 0.35 + 0.35 * zoomed);
    if (countryEdge) col = mix(col, (own == uSel ? vec3(1.0) : vec3(0.06, 0.06, 0.08)), own == uSel ? 0.85 : 0.6);
    if (coast) col = mix(col, vec3(0.92, 0.95, 1.0), 0.25);
  }
  vec2 v = fc / uRes - 0.5; col *= 1.0 - 0.3 * pow(length(v * vec2(1.1, 1.0)), 2.4);
  o = vec4(col, 1.0);
}`;

export type MapMode = 'political' | 'terrain' | 'value';

export class MapRenderer {
  gl: WebGL2RenderingContext; canvas: HTMLCanvasElement; assets: MapAssets;
  idProg: Program; comp!: Program;
  vao: WebGLVertexArrayObject; quad: WebGLVertexArrayObject; nIdx: number;
  fbo: WebGLFramebuffer; idTex: WebGLTexture | null = null; fbW = 0; fbH = 0;
  tBaseW: WebGLTexture; tBaseE: WebGLTexture; tDem: WebGLTexture; tOwner: WebGLTexture; tPal: WebGLTexture; tVal: WebGLTexture;
  ownerBuf: Uint8Array; valBuf: Uint8Array; nProv: number;
  /** optional extra shader code and per-frame hook for war theaters */
  extension: { decls: string; apply: string; bind: (gl: WebGL2RenderingContext, prog: Program, unit: number) => number } | null = null;

  constructor(canvas: HTMLCanvasElement, assets: MapAssets) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('This game needs WebGL2, which this browser does not provide.');
    this.gl = gl; this.canvas = canvas; this.assets = assets; this.nProv = assets.provinces.length;
    this.idProg = program(gl, ID_VS, ID_FS, ['aPos', 'aProv']);
    this.buildComposite();
    // province mesh
    this.vao = gl.createVertexArray()!; gl.bindVertexArray(this.vao);
    const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, assets.mesh.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, assets.mesh.prov, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, assets.mesh.index, gl.STATIC_DRAW);
    this.nIdx = assets.mesh.index.length; gl.bindVertexArray(null);
    this.quad = gl.createVertexArray()!; gl.bindVertexArray(this.quad);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    this.fbo = gl.createFramebuffer()!;
    // textures
    this.tBaseW = texture(gl, 0, 0, 'rgba8', assets.baseW, { mip: true });
    this.tBaseE = texture(gl, 0, 0, 'rgba8', assets.baseE, { mip: true });
    this.tDem = texture(gl, 0, 0, 'rgba8', assets.dem, { repeatX: true });
    const rows = Math.ceil(this.nProv / 2048);
    this.ownerBuf = new Uint8Array(2048 * rows * 4); this.tOwner = texture(gl, 2048, rows, 'rgba8', this.ownerBuf, { linear: false });
    this.valBuf = new Uint8Array(2048 * rows); this.tVal = texture(gl, 2048, rows, 'r8', this.valBuf, { linear: false });
    this.tPal = texture(gl, 1024, 1, 'rgba8', new Uint8Array(4096), { linear: false });
  }
  buildComposite() {
    const ext = this.extension;
    const fs = COMPOSITE_FS.replace('// THEATER_DECLS', ext ? ext.decls : '').replace('// THEATER_APPLY', ext ? ext.apply : '');
    this.comp = program(this.gl, FULLSCREEN_VS, fs);
  }
  setPalette(colors: string[]) {
    const b = new Uint8Array(4096); colors.forEach((c, i) => { const [r, g, bb] = hexToRgb(c); b.set([r, g, bb, 255], i * 4); });
    updateTexture(this.gl, this.tPal, 1024, 1, 'rgba8', b);
  }
  /** owner[p] = country index of province p */
  setOwners(owner: ArrayLike<number>) {
    for (let p = 0; p < this.nProv; p++) { this.ownerBuf[p * 4] = owner[p] & 255; this.ownerBuf[p * 4 + 1] = owner[p] >> 8; }
    updateTexture(this.gl, this.tOwner, 2048, Math.ceil(this.nProv / 2048), 'rgba8', this.ownerBuf);
  }
  /** values 0..1 per province for data map modes */
  setValues(v: ArrayLike<number>) {
    for (let p = 0; p < this.nProv; p++) this.valBuf[p] = Math.max(0, Math.min(255, Math.round(v[p] * 255)));
    updateTexture(this.gl, this.tVal, 2048, Math.ceil(this.nProv / 2048), 'r8', this.valBuf);
  }
  resize(w: number, h: number) {
    const gl = this.gl; if (w === this.fbW && h === this.fbH) return;
    this.fbW = w; this.fbH = h;
    if (this.idTex) gl.deleteTexture(this.idTex);
    this.idTex = texture(gl, w, h, 'rgba8', null, { linear: false });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.idTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  draw(cam: Camera, o: { sel: number; hover: number; player: number; mode: MapMode; time: number }) {
    const gl = this.gl, W = this.canvas.width, H = this.canvas.height; this.resize(W, H);
    const px = W / cam.w, upp = cam.upp / px;
    // pass 1: province ids
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.idProg.p); const u = this.idProg.u;
    gl.uniform2f(u.uCenter, cam.x, cam.y); gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uUpp, upp);
    gl.bindVertexArray(this.vao);
    const half = W / 2 * upp;
    for (const off of [-360, 0, 360]) { if (cam.x + half < off - 180 || cam.x - half > off + 180) continue; gl.uniform1f(u.uOffset, off); gl.drawElements(gl.TRIANGLES, this.nIdx, gl.UNSIGNED_INT, 0); }
    // pass 2: composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    const c = this.comp; gl.useProgram(c.p); gl.bindVertexArray(this.quad);
    gl.uniform2f(c.u.uRes, W, H); gl.uniform2f(c.u.uCenter, cam.x, cam.y); gl.uniform1f(c.u.uUpp, upp); gl.uniform1f(c.u.uDpr, px);
    gl.uniform1f(c.u.uTime, o.time); gl.uniform1f(c.u.uMode, o.mode === 'political' ? 0 : o.mode === 'terrain' ? 1 : 2);
    gl.uniform1i(c.u.uSel, o.sel); gl.uniform1i(c.u.uHover, o.hover); gl.uniform1i(c.u.uPlayer, o.player);
    let unit = 0; const bind = (t: WebGLTexture, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); if (c.u[name]) gl.uniform1i(c.u[name], unit); unit++; };
    bind(this.idTex!, 'tId'); bind(this.tBaseW, 'tBaseW'); bind(this.tBaseE, 'tBaseE'); bind(this.tDem, 'tDem'); bind(this.tOwner, 'tOwner'); bind(this.tPal, 'tPal'); bind(this.tVal, 'tVal');
    if (this.extension) this.extension.bind(gl, c, unit);
    gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
  }
  /** province under a CSS-pixel position (reads the id buffer) */
  pick(cam: Camera, sx: number, sy: number): number {
    const gl = this.gl, px = this.canvas.width / cam.w;
    const x = Math.floor(sx * px), y = this.canvas.height - 1 - Math.floor(sy * px);
    if (x < 0 || y < 0 || x >= this.fbW || y >= this.fbH) return -1;
    const b = new Uint8Array(4); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return b[2] > 127 ? b[0] + b[1] * 256 : -1;
  }
}
