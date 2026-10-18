import type { MapAssets } from '../data/types';
import type { Camera } from './camera';

/** A country name laid along a gentle curve through the country's main body. */
export interface CountryLabel { country: number; text: string; path: [number, number][]; size: number; area: number }

/** Recompute labels from current ownership (call when borders change). */
export function computeLabels(assets: MapAssets, owner: ArrayLike<number>, names: string[]): CountryLabel[] {
  const P = assets.provinces, n = P.length, seen = new Uint8Array(n);
  const best = new Map<number, { area: number; members: number[] }>();
  for (let s = 0; s < n; s++) {
    if (seen[s]) continue; const c = owner[s]; const comp: number[] = []; const q = [s]; seen[s] = 1; let area = 0;
    while (q.length) { const p = q.pop()!; comp.push(p); area += P[p].area; for (const m of P[p].nbr) if (!seen[m] && owner[m] === c) { seen[m] = 1; q.push(m); } }
    const cur = best.get(c); if (!cur || area > cur.area) best.set(c, { area, members: comp });
  }
  const out: CountryLabel[] = [];
  for (const [c, { area, members }] of best) {
    // boundary samples of the main body (unwrapped across the antimeridian)
    const pts: number[] = []; let ref = NaN;
    const total = members.reduce((a, p) => a + assets.rings[p].reduce((b, r) => b + r.length / 2, 0), 0), step = Math.max(1, Math.floor(total / 600));
    let k = 0;
    for (const p of members) for (const r of assets.rings[p]) for (let i = 0; i < r.length; i += 2) {
      if ((k++ % step) !== 0) continue; let x = r[i]; if (ref !== ref) ref = x; x -= Math.round((x - ref) / 360) * 360; pts.push(x, r[i + 1]);
    }
    const m = pts.length / 2; if (m < 3) continue;
    let cx = 0, cy = 0; for (let i = 0; i < m; i++) { cx += pts[2 * i]; cy += pts[2 * i + 1]; } cx /= m; cy /= m;
    let sxx = 0, syy = 0, sxy = 0; for (let i = 0; i < m; i++) { const dx = pts[2 * i] - cx, dy = pts[2 * i + 1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    // keep text readable: never steeper than ~50°, left to right
    ang = Math.max(-0.9, Math.min(0.9, ang));
    const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    const ts: number[] = [], ss: number[] = [];
    for (let i = 0; i < m; i++) { const dx = pts[2 * i] - cx, dy = pts[2 * i + 1] - cy; ts.push(dx * ux + dy * uy); ss.push(dx * vx + dy * vy); }
    const sorted = ts.slice().sort((a, b) => a - b), t0 = sorted[Math.floor(m * 0.1)], t1 = sorted[Math.floor(m * 0.9)];
    // centre line: middle of the shape in bins along the axis, fitted with a parabola
    const B = 7, lo = new Array(B).fill(Infinity), hi = new Array(B).fill(-Infinity);
    for (let i = 0; i < m; i++) { const b = Math.floor((ts[i] - t0) / (t1 - t0 + 1e-9) * B); if (b < 0 || b >= B) continue; lo[b] = Math.min(lo[b], ss[i]); hi[b] = Math.max(hi[b], ss[i]); }
    const xs: number[] = [], ys: number[] = [], widths: number[] = [];
    for (let b = 0; b < B; b++) if (hi[b] > lo[b]) { xs.push(t0 + (b + 0.5) / B * (t1 - t0)); ys.push((lo[b] + hi[b]) / 2); widths.push(hi[b] - lo[b]); }
    if (xs.length < 2) continue;
    const [qa, qb, qc] = fitQuad(xs, ys);
    const thick = widths.slice().sort((a, b) => a - b)[Math.floor(widths.length / 2)];
    const text = names[c].toUpperCase(), len = (t1 - t0) * 0.86;
    const size = Math.min(thick * 0.42, len / (text.length * 0.78 + 1));
    if (!(size > 0)) continue;
    const path: [number, number][] = [];
    for (let i = 0; i <= 16; i++) { const t = -len / 2 + (t0 + t1) / 2 + len * i / 16; const s = qa * t * t + qb * t + qc; path.push([cx + ux * t + vx * s, cy + uy * t + vy * s]); }
    out.push({ country: c, text, path, size, area });
  }
  return out.sort((a, b) => b.area - a.area);
}

function fitQuad(x: number[], y: number[]): [number, number, number] {
  if (x.length < 3) { const b = (y[1] - y[0]) / (x[1] - x[0] || 1); return [0, b, y[0] - b * x[0]]; }
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i], a2 = a * a; s0++; s1 += a; s2 += a2; s3 += a2 * a; s4 += a2 * a2; t0 += y[i]; t1 += a * y[i]; t2 += a2 * y[i]; }
  const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]], v = [t2, t1, t0];
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M); if (Math.abs(D) < 1e-12) return [0, 0, t0 / s0];
  const col = (i: number) => M.map((r, k) => r.map((e, j) => (j === i ? v[k] : e)));
  let a = det(col(0)) / D; const b = det(col(1)) / D, c = det(col(2)) / D;
  // keep the curve gentle
  const span = Math.max(...x) - Math.min(...x); const maxA = 0.6 / (span || 1); a = Math.max(-maxA, Math.min(maxA, a));
  return [a, b, c];
}

/** Draw labels along their curves (letter by letter). */
export function drawCountryLabels(ctx: CanvasRenderingContext2D, cam: Camera, labels: CountryLabel[], highlight: number) {
  ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const placed: [number, number, number, number][] = [];
  for (const L of labels) {
    const px = L.size / cam.upp; if (px < 8) continue;
    const alpha = Math.min(1, (px - 8) / 6) * (1 - Math.min(1, Math.max(0, (px - 70) / 50)));
    if (alpha <= 0.02) continue;
    const S = L.path.map(([x, y]) => cam.toScreen(x, y));
    // bail if wrapped weirdly or off screen
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const [x, y] of S) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
    if (maxx - minx > cam.w * 1.5 || maxx < 0 || minx > cam.w || maxy < 0 || miny > cam.h) continue;
    if (placed.some(r => !(maxx < r[0] || minx > r[2] || maxy < r[1] || miny > r[3]))) continue;
    placed.push([minx, miny, maxx, maxy]);
    const cum = [0]; for (let i = 1; i < S.length; i++) cum.push(cum[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
    const total = cum[cum.length - 1], n = L.text.length;
    const fs = Math.min(px, 64);
    ctx.font = `600 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const step = total / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      const d = step * (i + 0.5); let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const a = S[k - 1], b = S[k], q = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1);
      const x = a[0] + (b[0] - a[0]) * q, y = a[1] + (b[1] - a[1]) * q, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      ctx.globalAlpha = alpha * (L.country === highlight ? 0.95 : 0.7);
      ctx.lineWidth = Math.max(2, fs * 0.12); ctx.strokeStyle = 'rgba(245,240,230,0.55)'; ctx.strokeText(L.text[i], 0, 0);
      ctx.fillStyle = 'rgba(18,14,12,0.9)'; ctx.fillText(L.text[i], 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}
