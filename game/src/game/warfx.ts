import { project } from '../geo';
import type { Camera } from '../render/camera';
import { MAX_TIPS, type TheaterLayer } from '../render/theaters';
import type { MapAssets } from '../data/types';
import type { Session } from './session';
import type { Aim } from './play';
import type { MapStatic } from '../sim/types';
import { armyWhere, type ArmyState } from '../sim/war/armies';
import { activeWars, sideOf } from '../sim/war/war';
import { armyName, t } from '../i18n';
import { iconPath } from '../ui/common';
import type { LogEntry, World } from '../sim/types';
import { cAt, cellLonLat, cellOf, offensiveTip, type Offensive, type Theater } from '../sim/war/theater';

/**
 * Everything that moves on top of a war: division flags, offensive arrows, artillery flashes, city ripples.
 * Like the map, it is drawn one day behind the simulation and glides between days, so units, arrows
 * and the front stay in step. Arrows follow the motion rules in DESIGN.md §4.6: born with anticipation,
 * the tip presses the front (it drives a bulge in the map shader), quiet while the front is quiet.
 */
const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
const easeOut = (q: number) => 1 - (1 - q) * (1 - q), easeInCubic = (q: number) => q * q * q;
const easeOutBack = (q: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2); };
const hash = (n: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

function sprite(stops: [number, string][]) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); stops.forEach(([o, col]) => grd.addColorStop(o, col)); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); return c;
}

interface Arrow { o: Offensive; t: number; tips: { d: number; x: number; y: number }[]; dx: number; dy: number; t0: number; tEnd: number; k: number; kv: number; vs: number; prev: [number, number] | null }
interface UnitTrack { hist: [number, number][]; seen: number }
interface Spark { x: number; y: number; t0: number; life: number; big: boolean }

export class WarFx {
  private units = new Map<number, UnitTrack>();
  private arrows = new Map<number, Arrow>();
  private hot: { t: number; ks: Int32Array; hs: Float32Array }[] = [];
  private sparks: Spark[] = []; private smoke: Spark[] = [];
  private ripples: { x: number; y: number; t0: number; rgb: string; big: boolean }[] = [];
  private seenLog = new WeakSet<LogEntry>();
  private FLASH = sprite([[0, 'rgba(255,250,235,1)'], [0.22, 'rgba(255,205,130,0.9)'], [0.55, 'rgba(255,110,40,0.28)'], [1, 'rgba(255,80,20,0)']]);
  private SMOKE = sprite([[0, 'rgba(40,36,34,0.55)'], [0.6, 'rgba(40,36,34,0.2)'], [1, 'rgba(40,36,34,0)']]);
  private day = 0;

  /** how much fighting is in view (0..1), for the battle ambience */
  heatOnScreen = 0;
  private get A(): MapAssets { return this.s.assets; }
  constructor(private s: Session, private layer: TheaterLayer) {}

  /** after each simulated day */
  record(w: World) {
    this.day = w.day;
    const live = new Set<number>();
    for (const d of w.divisions) {
      if (d.theater < 0 || d.arrive > w.day) continue; live.add(d.id);
      const u = this.units.get(d.id);
      if (!u) this.units.set(d.id, { hist: [[d.x, d.y], [d.x, d.y], [d.x, d.y]], seen: 0 });
      else { u.hist.shift(); u.hist.push([d.x, d.y]); }
    }
    for (const id of [...this.units.keys()]) if (!live.has(id)) this.units.delete(id);
    // offensives: daily tip on the front
    const seen = new Set<number>();
    for (const t of w.theaters) for (const o of t.offensives) {
      seen.add(o.id); let a = this.arrows.get(o.id);
      if (!a) { if (o.ended) continue; const cl = Math.cos(o.from[1] * Math.PI / 180), dx = (o.to[0] - o.from[0]) * cl, dy = o.to[1] - o.from[1], l = Math.hypot(dx, dy) || 1; a = { o, t: t.id, tips: [], dx: dx / l, dy: dy / l, t0: 0, tEnd: 0, k: 0, kv: 0, vs: 0, prev: null }; this.arrows.set(o.id, a); }
      a.o = o; const [x, y] = offensiveTip(t, o); a.tips.push({ d: w.day, x, y }); if (a.tips.length > 400) a.tips.shift();
    }
    for (const [id, a] of this.arrows) if (!seen.has(id) && !a.o.ended) a.o = { ...a.o, ended: w.day };
    // hot stretches of front, for artillery flashes
    for (const t of w.theaters) {
      if (t.frozen) continue; const ks: number[] = [], hs: number[] = [];
      for (let k = 0; k < t.W * t.H; k++) if (t.land[k] && t.heat[k] > 0.25) { ks.push(k); hs.push(t.heat[k]); }
      this.hot = this.hot.filter(h => h.t !== t.id || false); this.hot.push({ t: t.id, ks: Int32Array.from(ks), hs: Float32Array.from(hs) });
    }
    this.hot = this.hot.filter(h => w.theaters.some(t => t.id === h.t && !t.frozen));
    // a city changes hands: ripple in the new holder's colour
    for (let i = w.log.length - 1; i >= 0 && i >= w.log.length - 40; i--) {
      const e = w.log[i]; if (this.seenLog.has(e)) break; this.seenLog.add(e);
      if (e.kind === 'city' && e.at && e.who) { const [r, g, b] = hex(w.countries[e.who[0]].color); this.ripples.push({ x: e.at[0], y: e.at[1], t0: -1, rgb: `${r},${g},${b}`, big: !!this.A.cities.find(c => c.capital && c.name === e.msg.a?.city) }); }
    }
  }

  /** per frame: animate and draw (mix = fraction of the current day; the map shows day-1+mix) */
  draw(ctx: CanvasRenderingContext2D, cam: Camera, w: World, mix: number, now: number, dt: number, playing: boolean, speed: number) {
    const zoom = 0.12 / cam.upp, sd = this.day - 1 + mix;
    const scr = (lon: number, lat: number) => cam.toScreen(...project(lon, lat));
    const thById = new Map(w.theaters.map(t => [t.id, t]));

    // ---- offensive arrows: spring state, then shader tips ----
    let n = 0;
    for (const [id, a] of this.arrows) {
      if (!a.t0 && a.tips.length && sd >= a.tips[0].d - 1) a.t0 = now;
      if (a.o.ended && !a.tEnd && a.t0 && sd >= a.o.ended - 1) a.tEnd = now;
      if (a.tEnd && now - a.tEnd > 1.0) { this.arrows.delete(id); continue; }
      if (!a.t0) continue;
      const h = scr(...this.tipAt(a, sd)); if (a.prev) { const v = Math.hypot(h[0] - a.prev[0], h[1] - a.prev[1]) / Math.max(dt, 1e-3); a.vs += (Math.min(v, 400) - a.vs) * Math.min(1, dt * 6); } a.prev = h;
      // push strength is a spring: thrust overshoots (anticipation, impact), then settles; at the end it relaxes
      const e = now - a.t0, kt = a.tEnd ? 0 : e < 0.22 ? -0.15 : e < 0.55 ? 1.25 : 0.45 + 0.55 * Math.min(1, a.vs / 35);
      a.kv += (kt - a.k) * 70 * dt; a.kv *= Math.exp(-8 * dt); a.k += a.kv * dt;
      if (n < MAX_TIPS) { const [x, y] = this.tipAt(a, sd); this.layer.tipA.set([x, y, a.dx, a.dy], n * 4); this.layer.tipB.set([a.o.side, Math.max(0, a.k) * 0.5], n * 2); n++; }
    }
    this.layer.tipN = n;

    // ---- how much fighting is in view ----
    let heat = 0;
    for (const hot of this.hot) { const t = thById.get(hot.t); if (!t) continue;
      const [x0, y0] = scr(t.lon0, t.lat0), [x1, y1] = scr(t.lon0 + t.W * t.cw, t.lat0 - t.H * t.ch);
      if (x1 < 0 || y1 < 0 || x0 > cam.w || y0 > cam.h) continue; heat += hot.ks.length / 500; }
    this.heatOnScreen = Math.min(1, heat) * Math.min(1, zoom / 3);
    // ---- artillery flashes along hot stretches ----
    if (playing && zoom > 1.2) for (const hot of this.hot) {
      const t = thById.get(hot.t); if (!t || !hot.ks.length) continue;
      let m = Math.min(90, hot.ks.length * 0.15) * dt * Math.sqrt(speed / 4);
      while (m > 0 && this.sparks.length < 240) {
        if (m < 1 && Math.random() > m) break; m -= 1;
        const i = (Math.random() * hot.ks.length) | 0; if (Math.random() > hot.hs[i]) continue;
        const [cx, cy] = cellLonLat(t, hot.ks[i]), big = Math.random() < 0.08;
        const sp = { x: cx + (Math.random() - 0.5) * t.cw * 1.6, y: cy + (Math.random() - 0.5) * t.ch * 1.6, t0: now, life: big ? 0.7 : 0.25 + Math.random() * 0.3, big };
        this.sparks.push(sp); if (big) this.smoke.push({ ...sp, life: 1.8 + Math.random() });
      }
    }
    this.sparks = this.sparks.filter(p => now - p.t0 < p.life); this.smoke = this.smoke.filter(p => now - p.t0 < p.life);

    // smoke
    for (const p of this.smoke) {
      const q = (now - p.t0) / p.life, [x, y] = scr(p.x, p.y + q * 0.03), r = (6 + 16 * q) * Math.min(2.5, Math.max(1, Math.sqrt(zoom / 4)));
      ctx.globalAlpha = (1 - q) * 0.6; ctx.drawImage(this.SMOKE, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;

    // ---- division flags ----
    if (zoom > 2.2) this.drawUnits(ctx, cam, w, thById, mix, now, zoom, scr);

    // ---- arrows ----
    for (const a of this.arrows.values()) this.drawArrow(ctx, a, sd, now, w, scr, cam.upp);

    // flashes
    ctx.globalCompositeOperation = 'lighter';
    const fz = Math.min(3, Math.max(1, Math.sqrt(zoom / 4)));
    for (const p of this.sparks) {
      const q = (now - p.t0) / p.life, al = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85, r = (p.big ? 13 : 5.5) * fz * (0.7 + 0.6 * q), [x, y] = scr(p.x, p.y);
      if (x < -20 || y < -20 || x > cam.w + 20 || y > cam.h + 20) continue;
      ctx.globalAlpha = al * (p.big ? 1 : 0.85); ctx.drawImage(this.FLASH, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // ripples
    for (const r of this.ripples) {
      if (r.t0 < 0) r.t0 = now; const q = (now - r.t0) / 1.4, [x, y] = scr(r.x, r.y);
      for (const d of [0, 0.18]) { const qq = q - d; if (qq < 0 || qq > 1) continue;
        ctx.strokeStyle = `rgba(${r.rgb},${(1 - qq) * 0.95})`; ctx.lineWidth = 3 * (1 - qq) + 1; ctx.beginPath(); ctx.arc(x, y, 5 + (r.big ? 46 : 30) * qq, 0, 7); ctx.stroke(); }
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - q * 1.5)})`; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
    }
    this.ripples = this.ripples.filter(r => r.t0 < 0 || now - r.t0 < 1.4);
  }

  private drawUnits(ctx: CanvasRenderingContext2D, cam: Camera, w: World, thById: Map<number, Theater>, mix: number, now: number, zoom: number, scr: (lon: number, lat: number) => [number, number]) {
    const s = Math.min(1.7, Math.max(0.8, Math.pow(zoom / 6, 0.4))), fw = 10.5 * s, fh = 7 * s, A = this.A;
    const blink = 0.55 + 0.45 * Math.sin(now * 6);
    // one flag per small patch of screen and side: a crowded front shows its density, not a heap that hides the line
    const taken = new Set<number>(), cw = fw * 2.6, ch = fh * 3.2;
    for (const d of w.divisions) {
      if (d.theater < 0 || d.arrive > w.day) continue;
      const u = this.units.get(d.id), t = thById.get(d.theater); if (!u || !t) continue;
      if (!u.seen) u.seen = now;
      const h = u.hist, ex = 2 * h[2][0] - h[1][0], ey = 2 * h[2][1] - h[1][1];
      const ux = cr(h[0][0], h[1][0], h[2][0], ex, mix), uy = cr(h[0][1], h[1][1], h[2][1], ey, mix);
      let [x, y] = scr(ux, uy);
      if (x < -30 || y < -30 || x > cam.w + 30 || y > cam.h + 30) continue;
      const sg = t.sideOf[d.country] || 1, k = cellOf(t, ux, uy);
      // staging: keep the flag behind the line it fights on, never on top of it
      let fwx = 0, fwy = 0, room = 99;
      const cv = cAt(t, ux, uy) * sg;
      if (cv < 0.97) {
        // gradient of the control value in screen pixels (lon maps to x, lat to y)
        const e = t.ch * 0.5, [ax] = scr(ux + e, uy), [, by] = scr(ux, uy + e);
        const Gx = (cAt(t, ux + e, uy) - cAt(t, ux - e, uy)) * sg / (2 * (ax - x || 1e-4)), Gy = (cAt(t, ux, uy + e) - cAt(t, ux, uy - e)) * sg / (2 * (by - y || -1e-4));
        const gl = Math.hypot(Gx, Gy);
        if (gl > 1e-5) {
          fwx = -Gx / gl; fwy = -Gy / gl; // toward the enemy
          const distPx = Math.max(0, cv) / gl, need = fh / 2 + 4;
          if (distPx < need) { const back = Math.min(need - distPx, need * 3); x -= fwx * back; y -= fwy * back; room = 2; } else room = distPx - need + 2;
        }
      }
      // the push: pull back (anticipation), thrust, squash on contact, settle
      let sx = 1, sy = 1;
      const war = w.wars.find(x => x.id === t.war), aggr = war ? war.aggr[sg > 0 ? 0 : 1] : 1, heat = k >= 0 ? t.heat[k] : 0;
      if (fwx && aggr > 1.02 && heat > 0.25 && !d.retreat && d.sup > 0 && !t.frozen) {
        const per = 1.7 + hash(d.id) * 0.9, ph = ((now + hash(d.id * 3) * per) % per) / per, amp = Math.min(1, heat * 1.6) * s;
        let off = 0, bell = 0;
        if (ph < 0.2) off = -2 * easeOut(ph / 0.2);
        else if (ph < 0.32) off = -2 + 7 * easeOut((ph - 0.2) / 0.12);
        else if (ph < 0.45) { off = 5; bell = Math.sin(Math.PI * (ph - 0.32) / 0.13); }
        else { const q = (ph - 0.45) / 0.55; off = 5 * (1 - q * q * (3 - 2 * q)); }
        off = Math.min(off * amp, room); x += fwx * off; y += fwy * off; sx = 1 + 0.2 * bell * amp; sy = 1 - 0.15 * bell * amp;
      } else if (d.retreat) { const q = Math.sin(now * 7 + d.id) * 0.5 + 0.5; sx = 1 - 0.05 * q; }
      { const key = (Math.floor(x / cw) * 4099 + Math.floor(y / ch)) * 2 + (sg > 0 ? 1 : 0); if (taken.has(key)) continue; taken.add(key); }
      // a new division pops in
      const pop = Math.min(1, (now - u.seen) / 0.35), ps = pop < 1 ? easeOutBack(pop) : 1, ww = fw * sx * ps, hh = fh * sy * ps;
      ctx.globalAlpha = (0.65 + 0.35 * Math.min(1, d.str / d.max)) * Math.min(1, pop * 2);
      const code = w.countries[d.country].code, fi = A.flagIndex[this.s.flagOf[code] || code];
      if (fi) ctx.drawImage(A.flags, fi[0], fi[1], A.flagW, A.flagH, x - ww / 2, y - hh / 2, ww, hh); else { ctx.fillStyle = w.countries[d.country].color; ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh); }
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(x - ww / 2 - 0.5, y - hh / 2 - 0.5, ww + 1, hh + 1);
      if (d.type === 'armor' || d.type === 'mechanized') { ctx.fillStyle = '#000'; ctx.fillRect(x - ww / 2, y + hh / 2 - 1.6 * s, ww, 1.6 * s); }
      ctx.globalAlpha = 1;
      if (ww > 9) { const q = Math.max(0, Math.min(1, d.sup)), bh = Math.max(2, 1.4 * s); // supply bar under the flag (strength is refilled from manpower)
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(x - ww / 2 - 0.5, y + hh / 2 + 1, ww + 1, bh + 1);
        ctx.fillStyle = q > 0.66 ? '#82c474' : q > 0.33 ? '#e8c063' : '#e0645a'; ctx.fillRect(x - ww / 2, y + hh / 2 + 1.5, ww * q, bh); }
      if (d.sup === 0) { ctx.strokeStyle = `rgba(242,193,78,${blink})`; ctx.lineWidth = 2; ctx.strokeRect(x - ww / 2 - 2, y - hh / 2 - 2, ww + 4, hh + 4); }
    }
  }

  private tipAt(a: Arrow, sd: number): [number, number] { // Catmull-Rom through daily tips, in step with the map
    const T = a.tips; if (!T.length) return a.o.from; if (sd <= T[0].d) return [T[0].x, T[0].y];
    let i = T.length - 2; while (i > 0 && T[i].d > sd) i--; if (i < 0) i = 0;
    const p0 = T[Math.max(0, i - 1)], p1 = T[i], p2 = T[Math.min(T.length - 1, i + 1)], p3 = T[Math.min(T.length - 1, i + 2)];
    const q = Math.min(1, Math.max(0, (sd - p1.d) / Math.max(1, p2.d - p1.d)));
    return [cr(p0.x, p1.x, p2.x, p3.x, q), cr(p0.y, p1.y, p2.y, p3.y, q)];
  }

  private drawArrow(ctx: CanvasRenderingContext2D, a: Arrow, sd: number, now: number, w: World, scr: (lon: number, lat: number) => [number, number], upp: number) {
    if (!a.t0) return;
    const e = now - a.t0, f = a.tEnd ? now - a.tEnd : -1;
    let s = 1, u = 0, alpha = 1, wind = 0, hw = 1, hl = 1;
    if (e < 0.22) { s = 0.12 * easeOut(e / 0.22); wind = Math.sin(Math.PI * e / 0.22); alpha = e / 0.22; } // anticipation
    else if (e < 0.6) s = 0.12 + 0.88 * easeOutBack((e - 0.22) / 0.38); // thrust
    const push = Math.max(0, a.k); hw *= 1 + 0.25 * Math.max(0, push - 0.9); hl *= 1 - 0.15 * Math.max(0, push - 0.9); // squash when it hits
    const st = 1 + Math.min(0.3, a.vs / 300); hl *= st; hw /= Math.sqrt(st); // stretch with speed
    if (f >= 0) { u = easeInCubic(Math.min(1, f / 0.7)); alpha = 1 - Math.min(1, Math.max(0, (f - 0.45) / 0.35)); } // follow-through
    if (alpha <= 0.01) return;
    // path: tail -> route the tip has taken -> head (leading the line a little while pressing), smoothed
    const head = this.tipAt(a, sd), cl = Math.cos(head[1] * Math.PI / 180), lead = 0.05 * Math.max(0, a.k);
    const proj = (p: [number, number]) => (p[0] - a.o.from[0]) * cl * a.dx + (p[1] - a.o.from[1]) * a.dy, ph = proj(head);
    // short pushes still get a readable arrow: the tail reaches at least ~70 km (and 70 px) behind the head
    const minLen = Math.max(0.65, 70 * upp), tail: [number, number] = ph < minLen ? [head[0] - a.dx * minLen / cl, head[1] - a.dy * minLen] : a.o.from;
    let pts: [number, number][] = [tail]; let lastP = 0;
    for (const t of a.tips) { if (t.d >= sd) break; const q: [number, number] = [t.x, t.y], pq = proj(q); if (pq > lastP + 0.05 && pq < ph - 0.05) { pts.push(q); lastP = pq; } }
    pts.push([head[0] + a.dx * lead / cl, head[1] + a.dy * lead]);
    for (let it = 0; it < 2; it++) { const nn: [number, number][] = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const p = pts[k], q = pts[k + 1]; nn.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); } nn.push(pts[pts.length - 1]); pts = nn; }
    const P = pts.map(p => scr(p[0] - a.dx * 0.04 * wind / cl, p[1] - a.dy * 0.04 * wind));
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    const total = cum[cum.length - 1]; if (total < 10) return;
    const at = (d: number): [number, number, number, number] => {
      if (d >= total) { const p = P[P.length - 2], q = P[P.length - 1], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, tx = (q[0] - p[0]) / l, ty = (q[1] - p[1]) / l; return [q[0] + tx * (d - total), q[1] + ty * (d - total), tx, ty]; }
      let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const p = P[k - 1], q = P[k], l = (cum[k] - cum[k - 1]) || 1, r = (d - cum[k - 1]) / l, tx = (q[0] - p[0]) / l, ty = (q[1] - p[1]) / l;
      return [p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r, tx, ty];
    };
    // only the business end: a short body that fades out behind the head
    const W = 8, headL = W * 2.0 * hl, headW = W * 2.3 * hw;
    const d1 = s * total, d0 = Math.max(u * total, d1 - Math.min(150, total)), bodyEnd = Math.max(d0, d1 - headL);
    if (d1 - d0 < 4) return;
    const left: [number, number][] = [], right: [number, number][] = [], N = 18;
    for (let k = 0; k <= N; k++) {
      const d = d0 + (bodyEnd - d0) * k / N, [x, y, tx, ty] = at(d), r = (d - d0) / Math.max(1, d1 - d0), wd = W * (0.15 + 0.85 * Math.min(1, r * 1.1)) / 2;
      left.push([x - ty * wd, y + tx * wd]); right.push([x + ty * wd, y - tx * wd]);
    }
    const [bx, by, btx, bty] = at(bodyEnd), [tipX, tipY] = at(d1);
    ctx.save(); ctx.globalAlpha = alpha * 0.85;
    ctx.beginPath(); ctx.moveTo(...left[0]); for (const q of left) ctx.lineTo(...q);
    ctx.lineTo(bx - bty * headW / 2, by + btx * headW / 2); ctx.lineTo(tipX, tipY); ctx.lineTo(bx + bty * headW / 2, by - btx * headW / 2);
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(...right[k]); ctx.closePath();
    // a darker shade of its own colour: reads on its own territory without shouting
    // a deep shade of its own colour (it sits on its own side's ground), with a faint light rim so it reads on any colour
    const [r, g, b] = hex(w.countries[a.o.country].color).map(v => Math.round(v * 0.3)), [sx0, sy0] = at(d0), grd = ctx.createLinearGradient(sx0, sy0, tipX, tipY);
    grd.addColorStop(0, `rgba(${r},${g},${b},0)`); grd.addColorStop(0.5, `rgba(${r},${g},${b},0.6)`); grd.addColorStop(1, `rgba(${r},${g},${b},0.92)`);
    ctx.fillStyle = grd; ctx.fill();
    const rim = ctx.createLinearGradient(sx0, sy0, tipX, tipY); rim.addColorStop(0, 'rgba(255,244,236,0)'); rim.addColorStop(1, 'rgba(255,244,236,0.4)');
    ctx.lineJoin = 'round'; ctx.lineWidth = 1; ctx.strokeStyle = rim; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - bty * headW / 2, by + btx * headW / 2); ctx.lineTo(tipX, tipY); ctx.lineTo(bx + bty * headW / 2, by - btx * headW / 2);
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,244,236,0.75)'; ctx.stroke();
    ctx.restore();
  }

  /** army markers drawn this frame, for clicks */
  private armyHits: { id: number; x: number; y: number; w: number; h: number }[] = [];
  /** the player's army whose marker is under a screen point, if any */
  armyAt(x: number, y: number): number | null {
    for (let i = this.armyHits.length - 1; i >= 0; i--) { const h = this.armyHits[i]; if (Math.abs(x - h.x) <= h.w / 2 + 4 && Math.abs(y - h.y) <= h.h / 2 + 4) return h.id; }
    return null;
  }
  /** where the first of the player's army markers was drawn, for the guide to point at */
  firstArmy() { const h = this.armyHits[0]; return h ? new DOMRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h) : null; }
  /** Army markers: one per army of the player's (flag, divisions, strength, what it is doing), and the enemy's divisions gathered where they mass. */
  /** Buildings on the map, under each province's name when zoomed in: all of ours, and the forts of others (they matter to an attacker). */
  drawBuildings(ctx: CanvasRenderingContext2D, cam: Camera, w: World, S: MapStatic, me: number) {
    if (cam.upp > 0.03) return;
    const sz = cam.upp < 0.012 ? 18 : 14, scr = (lon: number, lat: number) => cam.toScreen(...project(lon, lat));
    ctx.save(); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const p of w.provinces) {
      if (!p.bld) continue;
      const list = (['barracks', 'fort', 'factory'] as const).filter(b => (p.bld![b] ?? 0) > 0 && (p.owner === me || b === 'fort'));
      if (!list.length) continue;
      const [x, y] = scr(...S.provinces[p.id].label); if (x < -20 || y < 80 || x > cam.w + 20 || y > cam.h + 20) continue;
      list.forEach((b, i) => {
        const x0 = x - (list.length * (sz + 4)) / 2 + i * (sz + 4), y0 = y + 9, L = p.bld![b]!;
        ctx.fillStyle = 'rgba(8,12,18,0.72)'; ctx.beginPath(); ctx.roundRect(x0 - 1, y0 - 1, sz + 2, sz + 5, 3); ctx.fill();
        ctx.save(); ctx.translate(x0, y0); ctx.scale(sz / 24, sz / 24); ctx.strokeStyle = b === 'fort' && p.owner !== me ? '#e0645a' : '#e8c063'; ctx.stroke(this.glyph(b)); ctx.restore();
        ctx.fillStyle = '#f2ede1'; for (let k = 0; k < L; k++) ctx.fillRect(x0 + 1 + k * (sz / 3), y0 + sz + 1.5, sz / 3 - 1.5, 1.6); // one bar per level
      });
    }
    ctx.restore();
  }
  private glyphs = new Map<string, Path2D>();
  private glyph(b: string) { let g = this.glyphs.get(b); if (!g) this.glyphs.set(b, g = new Path2D(iconPath('b_' + b))); return g; }
  drawArmies(ctx: CanvasRenderingContext2D, cam: Camera, w: World, S: MapStatic, me: number, sel: number | null, now: number) {
    this.armyHits = [];
    const A = this.A, scr = (lon: number, lat: number) => cam.toScreen(...project(lon, lat)), off = (x: number, y: number) => x < -40 || y < -40 || x > cam.w + 40 || y > cam.h + 40;
    const flag = (c: number) => { const code = w.countries[c].code; return A.flagIndex[this.s.flagOf[code] || code]; };
    ctx.save(); ctx.font = '700 12px "Barlow Condensed", sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const plate = (x: number, y: number, c: number, label: string, edge: string, fill: string, dash: boolean) => {
      const fw = 18, fh = 12, tw = ctx.measureText(label).width, W = fw + tw + 14, H = 22, x0 = Math.round(x - W / 2), y0 = Math.round(y - H / 2);
      ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x0, y0, W, H, 5); ctx.fill();
      ctx.setLineDash(dash ? [3, 3] : []); ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
      const fi = flag(c); if (fi) ctx.drawImage(A.flags, fi[0], fi[1], A.flagW, A.flagH, x0 + 5, y0 + 5, fw, fh);
      ctx.fillStyle = '#f2ede1'; ctx.fillText(label, x0 + fw + 9, y0 + H / 2 + 0.5);
      return { x0, y0, W, H };
    };
    // the enemy: their divisions in view, gathered by screen area, so you see where they mass
    const foes = new Set<number>();
    for (const war of activeWars(w)) { const s = sideOf(war, me); if (s) for (const c of s > 0 ? war.defenders : war.attackers) foes.add(c); }
    if (foes.size) {
      const G = 84, cells = new Map<number, { n: number; x: number; y: number; by: Map<number, number> }>();
      for (const d of w.divisions) {
        if (d.theater < 0 || d.arrive > w.day || !foes.has(d.country)) continue; const [x, y] = scr(d.x, d.y); if (off(x, y)) continue;
        const key = Math.floor(x / G) * 4096 + Math.floor(y / G); let e = cells.get(key); if (!e) cells.set(key, e = { n: 0, x: 0, y: 0, by: new Map() });
        e.n++; e.x += x; e.y += y; e.by.set(d.country, (e.by.get(d.country) || 0) + 1);
      }
      for (const e of cells.values()) plate(e.x / e.n, e.y / e.n, [...e.by.entries()].sort((a, b) => b[1] - a[1])[0][0], String(e.n), 'rgba(224,100,90,0.85)', 'rgba(36,12,12,0.86)', false);
    }
    // ours: one marker per army; armies in the same place stack downwards
    const placed: [number, number][] = [];
    for (const a of w.armies) {
      if (a.country !== me) continue; const at = armyWhere(w, S, a); if (!at) continue;
      let [x, y] = scr(at.x, at.y); if (off(x, y)) continue;
      y = Math.max(y, 88); // never under the top bar, where it could not be clicked
      while (placed.some(([px, py]) => Math.abs(px - x) < 40 && Math.abs(py - y) < 20)) y += 24;
      placed.push([x, y]);
      const on = a.id === sel, st: ArmyState = at.state;
      // on its way: the road it takes (solid gold, unlike the pale dashed preview of an order), and a pill with the days left beside the marker
      if (st === 'moving' && at.to) {
        let [tx, ty] = scr(at.to[0], at.to[1]); ty = Math.max(ty, 88);
        ctx.save(); ctx.strokeStyle = 'rgba(8,12,18,0.55)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = on ? '#e8c063' : 'rgba(232,192,99,0.85)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.setLineDash([2, 10]); ctx.lineDashOffset = -now * 24; ctx.strokeStyle = 'rgba(255,248,230,0.9)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); // movement along the road
        ctx.fillStyle = '#e8c063'; ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(8,12,18,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
      if (on) { ctx.fillStyle = `rgba(232,192,99,${0.18 + 0.1 * Math.sin(now * 5)})`; ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill(); }
      const r = plate(x, y, me, String(at.n), on ? '#e8c063' : st === 'attack' ? 'rgba(232,192,99,0.9)' : 'rgba(242,237,225,0.55)', on ? 'rgba(30,24,10,0.94)' : 'rgba(8,12,18,0.88)', st === 'moving');
      if (st === 'moving' && at.eta !== undefined) { const lab = t('army.eta', { n: Math.max(1, at.eta - w.day) }), lw = ctx.measureText(lab).width, px = r.x0 + r.W + 4; ctx.fillStyle = '#e8c063'; ctx.beginPath(); ctx.roundRect(px, y - 9, lw + 10, 18, 9); ctx.fill(); ctx.fillStyle = '#1a1408'; ctx.fillText(lab, px + 5, y + 0.5); }
      // strength under the plate, the army's name above when picked up
      const q = Math.max(0, Math.min(1, at.str)); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(r.x0 + 3, r.y0 + r.H - 3, r.W - 6, 2);
      ctx.fillStyle = q > 0.66 ? '#82c474' : q > 0.33 ? '#e8c063' : '#e0645a'; ctx.fillRect(r.x0 + 3, r.y0 + r.H - 3, (r.W - 6) * q, 2);
      if (st === 'attack') { ctx.fillStyle = '#e8c063'; ctx.beginPath(); ctx.moveTo(r.x0 + r.W + 3, y - 5); ctx.lineTo(r.x0 + r.W + 10, y); ctx.lineTo(r.x0 + r.W + 3, y + 5); ctx.fill(); }
      if (on) { const name = armyName(a.num), nw = ctx.measureText(name).width; ctx.fillStyle = 'rgba(8,12,18,0.85)'; ctx.fillRect(x - nw / 2 - 5, r.y0 - 19, nw + 10, 16); ctx.fillStyle = '#e8c063'; ctx.textAlign = 'center'; ctx.fillText(name, x, r.y0 - 11); ctx.textAlign = 'left'; }
      this.armyHits.push({ id: a.id, x, y, w: r.W, h: r.H });
    }
    ctx.restore();
  }

  /** while aiming an offensive: a dashed arrow from the jump-off point to the objective, coloured by the odds, and rings on the divisions that would go */
  drawAim(ctx: CanvasRenderingContext2D, cam: Camera, w: World, aim: Aim, now: number) {
    if (aim.err || !aim.from || !aim.to) return;
    const scr = (lon: number, lat: number) => cam.toScreen(...project(lon, lat));
    if (aim.kind === 'landing') { // across the sea: an arc to an anchor on the beach, coloured by the odds
      const [ax, ay] = scr(...aim.from), [bx, by] = scr(...aim.to), mx = (ax + bx) / 2 - (by - ay) * 0.2, my = (ay + by) / 2 + (bx - ax) * 0.2, col = aim.odds >= 0.6 ? '#8fd07a' : aim.odds >= 0.35 ? '#e8c063' : '#e0645a';
      ctx.save(); ctx.setLineDash([8, 6]); ctx.lineDashOffset = -now * 24 % 14; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8,12,18,0.7)'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by - 4, 3, 0, 7); ctx.moveTo(bx, by - 1); ctx.lineTo(bx, by + 8); ctx.moveTo(bx - 6, by + 3); ctx.quadraticCurveTo(bx, by + 11, bx + 6, by + 3); ctx.stroke();
      ctx.restore(); return;
    }
    if (aim.kind && aim.kind !== 'attack') { // a move: a pale dashed line to a ring where the army will stand
      const [ax, ay] = scr(...aim.from), [bx, by] = scr(...aim.to);
      ctx.save(); ctx.setLineDash([6, 6]); ctx.lineDashOffset = -now * 24 % 12; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(8,12,18,0.7)'; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = '#cfe3f2'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(bx, by, aim.kind === 'hold' ? 12 : 9, 0, 7); ctx.strokeStyle = '#cfe3f2'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore(); return;
    }
    const col = aimColor(aim), [ax, ay] = scr(...aim.from), [bx, by] = scr(...aim.to), l = Math.hypot(bx - ax, by - ay); if (l < 6) return;
    const tx = (bx - ax) / l, ty = (by - ay) / l, hl = Math.min(18, l * 0.4);
    ctx.save();
    ctx.lineCap = 'round'; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -now * 24 % 13;
    ctx.strokeStyle = 'rgba(8,12,18,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - tx * hl, by - ty * hl); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - tx * hl - ty * hl * 0.6, by - ty * hl + tx * hl * 0.6); ctx.lineTo(bx - tx * hl + ty * hl * 0.6, by - ty * hl - tx * hl * 0.6); ctx.closePath();
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(8,12,18,0.7)'; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
    // the divisions at this front that would join (reserves arrive by rail)
    const ids = new Set(aim.ids); ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (const d of w.divisions) { if (!ids.has(d.id)) continue; const [x, y] = scr(d.x, d.y); ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
}
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** the verdict colours shared by the aim arrow and its readout */
/** what an attack order would come to: a worn-out army or one that outruns its supply is warned first, whatever the odds */
export const aimVerdict = (a: Aim) => (a.org ?? 1) < 0.4 ? 'tired' : (a.supTo ?? 1) < 0.35 ? 'overreach' : a.foes === 0 ? 'open' : a.odds >= 1.5 ? 'likely' : a.odds >= 1 ? 'hard' : 'stall';
const aimColor = (a: Aim) => ({ open: '#8fd07a', likely: '#8fd07a', hard: '#e8c063', stall: '#e0645a', tired: '#e0645a', overreach: '#e0645a' })[aimVerdict(a)];
