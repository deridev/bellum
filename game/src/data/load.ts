import earcut from 'earcut';
import * as topo from 'topojson-client';
import { project } from '../geo';
import type { CityData, CountryData, MapAssets, ProvinceData } from './types';

const dataUrl = (f: string) => `${import.meta.env.BASE_URL}data/${f}`.replace(/^\.\//, './');

async function json<T>(f: string, progress: (f: string) => void): Promise<T> { const r = await fetch(dataUrl(f)); if (!r.ok) throw new Error(`Could not load ${f} (${r.status})`); const j = await r.json(); progress(f); return j; }
async function bitmap(f: string, progress: (f: string) => void) {
  const r = await fetch(dataUrl(f)); if (!r.ok) throw new Error(`Could not load ${f} (${r.status})`);
  const b = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); progress(f); return b;
}

export async function loadAssets(progress: (done: number, total: number, what: string) => void): Promise<MapAssets> {
  const total = 10; let done = 0; const tick = (what: string) => progress(++done, total, what);
  const [topology, provinces, countries, cities, baseW, baseE, dem, flags, flagMeta, provBmp] = await Promise.all([
    json<any>('provinces.topo.json', tick), json<ProvinceData[]>('provinces.json', tick), json<CountryData[]>('countries.json', tick), json<CityData[]>('cities.json', tick),
    bitmap('base-w.jpg', tick), bitmap('base-e.jpg', tick), bitmap('dem.png', tick), bitmap('flags.png', tick), json<{ w: number; h: number; index: Record<string, [number, number]> }>('flags.json', tick), bitmap('provraster.png', tick),
  ]);
  // triangulate every province (projected), keep projected rings
  const geoms = topology.objects.provinces.geometries;
  const posA: number[] = [], provA: number[] = [], idxA: number[] = [];
  const bbox = new Float32Array(provinces.length * 4).fill(NaN);
  const rings: Float32Array[][] = provinces.map(() => []);
  for (const g of geoms) {
    const f: any = topo.feature(topology, g); const pid = g.id as number;
    const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const poly of polys) {
      const flat: number[] = [], holes: number[] = [];
      poly.forEach((ring, ri) => {
        if (ri > 0) holes.push(flat.length / 2);
        const pr = new Float32Array(ring.length * 2);
        ring.forEach(([lon, lat], k) => { const [x, y] = project(lon, lat); flat.push(x, y); pr[k * 2] = x; pr[k * 2 + 1] = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
        rings[pid].push(pr);
      });
      const tri = earcut(flat, holes.length ? holes : undefined, 2);
      const base = posA.length / 2;
      for (let k = 0; k < flat.length; k += 2) { posA.push(flat[k], flat[k + 1]); provA.push(pid); }
      for (const t of tri) idxA.push(base + t);
    }
    bbox.set([x0, y0, x1, y1], pid * 4);
  }
  // raw elevation bytes for the simulation
  const c = new OffscreenCanvas(dem.width, dem.height), cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(dem, 0, 0); const px = cx.getImageData(0, 0, dem.width, dem.height).data;
  const demData = new Uint8Array(dem.width * dem.height); for (let i = 0; i < demData.length; i++) demData[i] = px[i * 4];
  const pc = new OffscreenCanvas(provBmp.width, provBmp.height), pcx = pc.getContext('2d', { willReadFrequently: true })!; pcx.drawImage(provBmp, 0, 0);
  const pp = pcx.getImageData(0, 0, provBmp.width, provBmp.height).data; const provRaster = new Uint16Array(provBmp.width * provBmp.height);
  for (let i = 0; i < provRaster.length; i++) provRaster[i] = pp[i * 4] + pp[i * 4 + 1] * 256;
  return { provinces, countries, cities, baseW, baseE, dem, demData, bbox, rings, flags, flagIndex: flagMeta.index, flagW: flagMeta.w, flagH: flagMeta.h, provRaster,
    mesh: { pos: new Float32Array(posA), prov: new Float32Array(provA), index: new Uint32Array(idxA) } };
}
