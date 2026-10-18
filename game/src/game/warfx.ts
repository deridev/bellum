import { project } from '../geo';
import type { Camera } from '../render/camera';
import { MAX_TIPS, type TheaterLayer } from '../render/theaters';
import type { MapAssets } from '../data/types';
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

  constructor(private A: MapAssets, private layer: TheaterLayer) {}

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
      // a new division pops in
      const pop = Math.min(1, (now - u.seen) / 0.35), ps = pop < 1 ? easeOutBack(pop) : 1, ww = fw * sx * ps, hh = fh * sy * ps;
      ctx.globalAlpha = (0.65 + 0.35 * Math.min(1, d.str / d.max)) * Math.min(1, pop * 2);
      const fi = A.flagIndex[w.countries[d.country].code];
      if (fi) ctx.drawImage(A.flags, fi[0], fi[1], A.flagW, A.flagH, x - ww / 2, y - hh / 2, ww, hh); else { ctx.fillStyle = w.countries[d.country].color; ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh); }
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeRect(x - ww / 2 - 0.5, y - hh / 2 - 0.5, ww + 1, hh + 1);
      if (d.type === 'armor' || d.type === 'mechanized') { ctx.fillStyle = '#000'; ctx.fillRect(x - ww / 2, y + hh / 2 - 1.6 * s, ww, 1.6 * s); }
      ctx.globalAlpha = 1;
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
}
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
