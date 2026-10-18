import type { World } from '../sim/types';
import { flipAge, type Theater } from '../sim/war/theater';
import { hexToRgb, texture, updateTexture, type Program } from './gl';

/**
 * War theaters on the map. Each visible theater uploads its control field (last three days + heat)
 * and the composite shader draws it as a smooth, warped contour: occupied land in the occupier's
 * colour, a glowing front line, hatched pockets, and a DMZ once a ceasefire freezes it.
 * The map is drawn one day behind the simulation so it can glide between days (Catmull-Rom).
 */
export const MAX_SLOTS = 3, MAX_TIPS = 8;

const DECLS = `
uniform vec4 uTBox[3]; uniform vec2 uTSize[3]; uniform vec3 uTColA[3], uTColB[3]; uniform float uTState[3]; uniform float uTMix;
uniform vec4 uTipA[8]; uniform vec2 uTipB[8]; uniform int uTipN;
uniform sampler2D tTF0, tTF1, tTF2, tTA0, tTA1, tTA2, tTSide;
// B-spline bicubic from 4 bilinear taps: the coarse field reads as a smooth painting
vec4 cubicW(float v){ vec4 n = vec4(1.0,2.0,3.0,4.0) - v; vec4 s = n*n*n;
  float x = s.x, y = s.y-4.0*s.x, z = s.z-4.0*s.y+6.0*s.x; return vec4(x, y, z, 6.0-x-y-z) * (1.0/6.0); }
vec4 bicubic(sampler2D t, vec2 uv, vec2 size){
  vec2 inv = 1.0/size; uv = uv*size - 0.5; vec2 fxy = fract(uv); uv -= fxy;
  vec4 xc = cubicW(fxy.x), yc = cubicW(fxy.y);
  vec4 c = uv.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz+xc.yw, yc.xz+yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw)/s) * inv.xxyy;
  vec4 s0 = texture(t, off.xz), s1 = texture(t, off.yz), s2 = texture(t, off.xw), s3 = texture(t, off.yw);
  float sx = s.x/(s.x+s.y), sy = s.z/(s.z+s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}
// multi-scale domain warp: fractal detail on the front that appears as you zoom in and never shimmers
vec2 warpT(vec2 p){
  vec2 w = vec2(0.0); float a = 0.05, f = 6.0;
  for (int k=0;k<8;k++){ float fade = smoothstep(uUpp*3.0, uUpp*10.0, 1.0/f);
    w += (vec2(vn(p*f + vec2(3.1*float(k), 1.7)), vn(p*f + vec2(9.2, 5.3*float(k)))) - 0.5) * a * fade;
    f *= 2.15; a *= 0.58; }
  return w;
}
// offensive tips press into the front like a finger into a membrane
float tipPush(vec2 ll){
  float s = 0.0, cl = cos(ll.y * RAD);
  for (int i=0;i<8;i++){ if (i >= uTipN) break;
    vec2 d = vec2((ll.x - uTipA[i].x) * cl, ll.y - uTipA[i].y), dir = uTipA[i].zw; float al = dot(d, dir), pe = dot(d, vec2(-dir.y, dir.x)), R = 0.22;
    s += uTipB[i].x * uTipB[i].y * exp(-pow((al + 0.55*R)/R, 2.0) - pow(pe/(0.55*R), 2.0)); }
  return s;
}
float cr4(float p0, float p1, float p2, float p3, float t){
  return 0.5*((2.0*p1) + (-p0+p2)*t + (2.0*p0-5.0*p1+4.0*p2-p3)*t*t + (-p0+3.0*p1-3.0*p2+p3)*t*t*t); }
vec3 theater(int i, sampler2D tf, sampler2D ta, vec3 col, vec3 land, float sl, vec2 ll, int own, vec2 fc){
  if (uTState[i] < 0.5 || own < 0) return col;
  vec4 b = uTBox[i]; vec2 uv0 = vec2((ll.x - b.x) / b.z, (b.y - ll.y) / b.w);
  if (uv0.x < 0.0 || uv0.y < 0.0 || uv0.x > 1.0 || uv0.y > 1.0) return col;
  int os = int(texelFetch(tTSide, ivec2(own, i), 0).r * 255.0 + 0.5); if (os == 0) return col;
  vec2 gp = ll + warpT(ll);
  vec2 uv = vec2((gp.x - b.x) / b.z, (b.y - gp.y) / b.w);
  vec4 F = bicubic(tf, uv, uTSize[i]) * 2.0 - 1.0; vec2 A = bicubic(ta, uv, uTSize[i]).rg;
  bool frozen = uTState[i] > 1.5;
  float c = frozen ? F.b : cr4(F.r, F.g, F.b, 2.0 * F.b - F.g, uTMix) + tipPush(ll) * 2.2;
  float heat = frozen ? 0.0 : clamp(F.a * 0.5 + 0.5, 0.0, 1.0);
  float w = max(fwidth(c), 1e-5), a = smoothstep(-w, w, c);
  vec3 colA = uTColA[i], colB = uTColB[i];
  if (uMode < 0.5) {
    // occupied ground takes the occupier's colour, with a faint stripe of the owner's
    float stripe = step(0.5, fract((fc.x - fc.y) / (10.0 * uDpr)));
    vec3 occA = mix(land, colA * (0.22 + 1.05 * sl), 0.66), occB = mix(land, colB * (0.22 + 1.05 * sl), 0.66);
    vec3 dA = os == 1 ? col : mix(occA, col, 0.22 * stripe), dB = os == 2 ? col : mix(occB, col, 0.22 * stripe);
    col = mix(dB, dA, a);
    // freshly taken ground shines in the winner's colour, then settles
    float wake = clamp(A.r, 0.0, 1.0); col = mix(col, mix(colB, colA, a) * 1.3 + 0.06, wake * wake * 0.3);
    // pockets: hatched
    float st2 = step(0.5, fract((fc.x + fc.y) / (9.0 * uDpr)));
    col = mix(col, col * 0.45 + vec3(0.95, 0.78, 0.30) * 0.35 * st2, smoothstep(0.35, 0.6, A.g) * 0.8);
  }
  // no line at the theater's box edge (derivatives there mix in pixels outside the box)
  float edgePx = min(min(uv0.x, 1.0 - uv0.x) * b.z, min(uv0.y, 1.0 - uv0.y) * b.w) / uUpp;
  float dpx = abs(c) / w / uDpr + max(0.0, 4.0 - edgePx) * 10.0;
  if (frozen) { // demilitarized zone
    col = mix(col, vec3(0.97), (1.0 - smoothstep(2.0, 3.5, dpx)) * 0.75);
    return mix(col, vec3(0.05), (1.0 - smoothstep(0.4, 1.0, dpx)) * 0.6);
  }
  // battle haze over the contact zone, then the front line at a constant pixel width
  col = mix(col, col * 0.82 + vec3(0.30, 0.16, 0.08) * 0.25, heat * 0.35 * vn(ll * 38.0 + vec2(uTime * 0.35, 0.0)));
  float core = exp(-dpx * dpx * 0.7), glow = exp(-dpx / (4.0 + 5.0 * heat));
  float hh = heat * (0.72 + 0.28 * sin(uTime * 11.0 + vn(ll * 30.0) * 6.28));
  vec3 glowCol = mix(colB, colA, a) * 0.6 + 0.35, coreCol = mix(vec3(1.0, 0.94, 0.93), vec3(1.0, 0.84, 0.58), hh);
  return col + coreCol * core * (0.7 + 0.55 * hh) + mix(glowCol, vec3(1.0, 0.55, 0.25), hh * 0.6) * glow * (0.16 + 0.6 * hh);
}
vec3 theaters(vec3 col, vec3 land, float sl, vec2 ll, int own, vec2 fc){
  col = theater(0, tTF0, tTA0, col, land, sl, ll, own, fc);
  col = theater(1, tTF1, tTA1, col, land, sl, ll, own, fc);
  return theater(2, tTF2, tTA2, col, land, sl, ll, own, fc);
}
`;
const APPLY = `col = theaters(col, land, sl, vec2(lon, lat), own, fc);`;

interface Hist { day: number; W: number; H: number; ring: Uint8Array[]; heat: Uint8Array; aux: Uint8Array; lon0: number; lat0: number }
interface Slot { id: number; tf: WebGLTexture | null; ta: WebGLTexture | null; W: number; H: number; dirty: boolean }

export class TheaterLayer {
  private hist = new Map<number, Hist>();
  private slots: Slot[] = Array.from({ length: MAX_SLOTS }, () => ({ id: -1, tf: null, ta: null, W: 0, H: 0, dirty: false }));
  private side: Uint8Array = new Uint8Array(1024 * MAX_SLOTS); private tSide: WebGLTexture;
  private shown: Theater[] = [];
  private colors: [number, number, number][] = [];
  mix = 0; hidden = false; // hidden: the timelapse shows plain province colours
  tipA = new Float32Array(MAX_TIPS * 4); tipB = new Float32Array(MAX_TIPS * 2); tipN = 0;

  constructor(private gl: WebGL2RenderingContext) {
    this.tSide = texture(gl, 1024, MAX_SLOTS, 'r8', this.side, { linear: false });
  }
  get ext() { return { decls: DECLS, apply: APPLY, bind: (gl: WebGL2RenderingContext, p: Program, unit: number) => this.bind(gl, p, unit) }; }
  setPalette(colors: string[]) { this.colors = colors.map(hexToRgb); }

  reset() { this.hist.clear(); for (const s of this.slots) s.id = -1; this.shown = []; this.tipN = 0; }
  /** after each simulated day: record the new field of every theater */
  record(w: World) {
    for (const t of w.theaters) {
      let h = this.hist.get(t.id);
      const resized = !h || h.W !== t.W || h.H !== t.H || h.lon0 !== t.lon0 || h.lat0 !== t.lat0;
      const cur = encodeField(t, t.frozen && t.dmz ? t.dmz : t.c);
      if (resized) { h = { day: w.day, W: t.W, H: t.H, ring: [cur, cur, cur], heat: new Uint8Array(t.W * t.H), aux: new Uint8Array(t.W * t.H * 2), lon0: t.lon0, lat0: t.lat0 }; this.hist.set(t.id, h); }
      else if (h!.day !== w.day) { h!.ring = [h!.ring[1], h!.ring[2], cur]; h!.day = w.day; }
      const hh = h!; const N = t.W * t.H;
      for (let k = 0; k < N; k++) {
        hh.heat[k] = Math.round(Math.min(1, t.heat[k]) * 255);
        const age = flipAge(t, k);
        hh.aux[k * 2] = t.land[k] && age < 12 ? Math.round((1 - age / 12) * 255) : 0;
        hh.aux[k * 2 + 1] = t.pocket[k] ? 255 : 0;
      }
      const s = this.slots.find(s => s.id === t.id); if (s) s.dirty = true;
    }
    for (const id of [...this.hist.keys()]) if (!w.theaters.some(t => t.id === id)) this.hist.delete(id);
  }

  /** pick which theaters get a slot (live ones first, then nearest the camera) */
  assign(w: World, lon: number, lat: number) {
    const ranked = [...w.theaters].sort((a, b) => (+a.frozen - +b.frozen) || dist(a, lon, lat) - dist(b, lon, lat)).slice(0, MAX_SLOTS);
    this.shown = ranked;
    const keep = new Set(ranked.map(t => t.id));
    for (const s of this.slots) if (s.id >= 0 && !keep.has(s.id)) s.id = -1;
    for (const t of ranked) {
      if (this.slots.some(s => s.id === t.id)) continue;
      const s = this.slots.find(s => s.id < 0)!; s.id = t.id; s.dirty = true;
    }
    // which side each country is on, per slot
    const side = new Uint8Array(this.side.length);
    this.slots.forEach((s, i) => { const t = ranked.find(t => t.id === s.id); if (!t) return; for (const [c, sd] of Object.entries(t.sideOf)) side[i * 1024 + +c] = sd > 0 ? 1 : 2; });
    if (side.some((v, k) => v !== this.side[k])) { this.side = side; updateTexture(this.gl, this.tSide, 1024, MAX_SLOTS, 'r8', this.side); } // only when sides changed
  }

  private upload(s: Slot, h: Hist) {
    const gl = this.gl, N = h.W * h.H, f = new Uint8Array(N * 4);
    for (let k = 0; k < N; k++) { f[k * 4] = h.ring[0][k]; f[k * 4 + 1] = h.ring[1][k]; f[k * 4 + 2] = h.ring[2][k]; f[k * 4 + 3] = h.heat[k]; }
    if (s.W !== h.W || s.H !== h.H || !s.tf) {
      if (s.tf) gl.deleteTexture(s.tf); if (s.ta) gl.deleteTexture(s.ta);
      s.tf = texture(gl, h.W, h.H, 'rgba8', f); s.ta = texture(gl, h.W, h.H, 'rg8', h.aux); s.W = h.W; s.H = h.H;
    } else { updateTexture(gl, s.tf, h.W, h.H, 'rgba8', f); updateTexture(gl, s.ta!, h.W, h.H, 'rg8', h.aux); }
    s.dirty = false;
  }

  private bind(gl: WebGL2RenderingContext, p: Program, unit: number) {
    const box: number[] = [], size: number[] = [], ca: number[] = [], cb: number[] = [], state: number[] = [];
    this.slots.forEach((s, i) => {
      const t = this.shown.find(t => t.id === s.id), h = t && this.hist.get(t.id);
      if (!t || !h || this.hidden) { box.push(0, 0, 1, 1); size.push(1, 1); ca.push(0, 0, 0); cb.push(0, 0, 0); state.push(0); return; }
      if (s.dirty) this.upload(s, h);
      box.push(t.lon0, t.lat0, t.W * t.cw, t.H * t.ch); size.push(t.W, t.H); state.push(t.frozen ? 2 : 1);
      const lead = (sd: number, j: number) => t.lead[j] >= 0 ? t.lead[j] : +Object.keys(t.sideOf).find(c => t.sideOf[+c] === sd)!;
      const A = this.colors[lead(1, 0)] || [200, 60, 60], B = this.colors[lead(-1, 1)] || [60, 90, 200];
      ca.push(...A.map(v => v / 255)); cb.push(...B.map(v => v / 255));
      void i;
    });
    const u = p.u;
    if (u.uTBox) gl.uniform4fv(u.uTBox, box); if (u.uTSize) gl.uniform2fv(u.uTSize, size);
    if (u.uTColA) gl.uniform3fv(u.uTColA, ca); if (u.uTColB) gl.uniform3fv(u.uTColB, cb);
    if (u.uTState) gl.uniform1fv(u.uTState, state); if (u.uTMix) gl.uniform1f(u.uTMix, this.mix);
    if (u.uTipA) gl.uniform4fv(u.uTipA, this.tipA); if (u.uTipB) gl.uniform2fv(u.uTipB, this.tipB); if (u.uTipN) gl.uniform1i(u.uTipN, this.tipN);
    const tex = (t: WebGLTexture | null, name: string) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t || this.tSide); if (u[name]) gl.uniform1i(u[name], unit); unit++; };
    this.slots.forEach((s, i) => { tex(s.tf, 'tTF' + i); tex(s.ta, 'tTA' + i); });
    tex(this.tSide, 'tTSide');
    return unit;
  }
}

const dist = (t: Theater, lon: number, lat: number) => Math.hypot(t.lon0 + t.W * t.cw / 2 - lon, t.lat0 - t.H * t.ch / 2 - lat);

/** control values as bytes; cells off the playable land copy their nearest land value so no false front appears at coasts */
function encodeField(t: Theater, c: Float32Array): Uint8Array {
  const N = t.W * t.H, W = t.W, out = new Uint8Array(N), done = new Uint8Array(N), q = new Int32Array(N); let h = 0, tl = 0;
  for (let k = 0; k < N; k++) if (t.land[k]) { out[k] = Math.round((Math.max(-1, Math.min(1, c[k])) * 0.5 + 0.5) * 255); done[k] = 1; q[tl++] = k; }
  while (h < tl) { const k = q[h++], i = k % W;
    for (const n of [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, k - W, k + W]) if (n >= 0 && n < N && !done[n]) { done[n] = 1; out[n] = out[k]; q[tl++] = n; } }
  if (!tl) out.fill(128);
  return out;
}
