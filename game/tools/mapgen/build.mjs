// Bellum map pipeline: Natural Earth + terrain tiles -> game data in public/data.
//
//   node tools/mapgen/build.mjs            (run tools/cache/fetch.sh first)
//
// Outputs:
//   provinces.topo.json  province polygons (TopoJSON, quantized), properties in provinces.json
//   provinces.json       per-province data: name, country, label point, area, terrain, pop, gdp, neighbours
//   countries.json       game countries: code, name, colour, capital, population, gdp
//   cities.json          cities for labels and objectives
//   base-w.jpg, base-e.jpg  satellite-style colour imagery (two 4096² halves)
//   dem.png              elevation, 4096x2048 equirectangular, metres+12000 packed in R (hi) G (lo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import * as topo from 'topojson-client';
import sharp from 'sharp';
import AdmZip from 'adm-zip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'tools/cache');
const OUT = process.env.MAPGEN_OUT ? path.resolve(process.env.MAPGEN_OUT) : path.join(ROOT, 'public/data');
fs.mkdirSync(OUT, { recursive: true });
const readJSON = f => JSON.parse(fs.readFileSync(path.join(CACHE, f), 'utf8'));
const log = (...a) => console.log('[mapgen]', ...a);

// ---------------------------------------------------------------------------
// 1. Countries: sovereign states. Dependencies fold into their sovereign; microstates into a neighbour.
const adm0 = readJSON('ne_10m_admin_0_countries.geojson').features;
const SOV = {}; // adm0_a3 -> game code
const COUNTRY = {}; // game code -> info
const bySov = {};
for (const f of adm0) { const p = f.properties; (bySov[p.SOV_A3] ||= []).push(p); }
for (const [sov, list] of Object.entries(bySov)) {
  const main = list.slice().sort((a, b) => (b.POP_EST || 0) - (a.POP_EST || 0))[0];
  const code = main.ADM0_A3;
  COUNTRY[code] = { code, name: main.SOVEREIGNT === main.ADMIN ? main.NAME : main.SOVEREIGNT.replace(/^United Kingdom.*/, 'United Kingdom'),
    iso2: main.ISO_A2_EH !== '-99' ? main.ISO_A2_EH : main.ISO_A2, pop: 0, gdp: 0, mapcolor: main.MAPCOLOR9 };
  for (const p of list) { SOV[p.ADM0_A3] = code; COUNTRY[code].pop += p.POP_EST || 0; COUNTRY[code].gdp += p.GDP_MD || 0; }
}
// a few names read better shortened
const RENAME = { USA: 'United States', RUS: 'Russia', KOR: 'South Korea', PRK: 'North Korea', COD: 'DR Congo', COG: 'Congo', CZE: 'Czechia', IRN: 'Iran', SYR: 'Syria', LAO: 'Laos', VNM: 'Vietnam', TZA: 'Tanzania', BOL: 'Bolivia', VEN: 'Venezuela', MDA: 'Moldova', BIH: 'Bosnia', CAF: 'Central African Rep.', SSD: 'South Sudan', DOM: 'Dominican Rep.', GBR: 'United Kingdom', CHN: 'China', TWN: 'Taiwan', MKD: 'North Macedonia', CIV: "Côte d'Ivoire", SWZ: 'Eswatini', TLS: 'Timor-Leste', GNQ: 'Eq. Guinea', ARE: 'UAE', SAH: 'Western Sahara', PSX: 'Palestine', CYN: 'N. Cyprus', SOL: 'Somaliland', KOS: 'Kosovo' };
for (const [c, n] of Object.entries(RENAME)) if (COUNTRY[c]) COUNTRY[c].name = n;
const MERGE_INTO = { VAT: 'ITA', SMR: 'ITA', MCO: 'FRA', LIE: 'CHE', ATA: null, ATC: null, KAS: 'IND', ESB: 'CYP', WSB: 'CYP', USG: 'CUB', BJN: 'COL', SER: 'COL', SCR: 'CHN', CNM: 'CYP', IOA: null, SPI: null, KAB: 'KAZ', CLP: 'FRA', PGA: 'CHN', BRT: null };
const gameCode = a3 => { if (a3 in MERGE_INTO) return MERGE_INTO[a3]; return SOV[a3] || (COUNTRY[a3] ? a3 : null); };

// Names in Portuguese and Spanish come with Natural Earth. Its Portuguese is European: Brazilian spelling puts a circumflex
// before m and n (Colónia → Colônia). In countries that speak the language, the local name is the name.
const LUSO = new Set(['BRA', 'PRT', 'AGO', 'MOZ', 'CPV', 'GNB', 'STP', 'TLS']);
const HISPANO = new Set(['ESP', 'MEX', 'ARG', 'COL', 'PER', 'VEN', 'CHL', 'ECU', 'GTM', 'CUB', 'BOL', 'DOM', 'HND', 'PRY', 'SLV', 'NIC', 'CRI', 'PAN', 'URY', 'GNQ']);
const brPt = n => n && n.replace(/ó(?=[mn][aeiouáéíóúâêô])/g, 'ô').replace(/é(?=[mn][aeiouáéíóúâêô])/g, 'ê');
// ---------------------------------------------------------------------------
// 2. Admin-1 -> topology, then merge small units inside each country.
log('reading admin-1');
const adm1 = readJSON('ne_10m_admin_1_states_provinces.geojson');
adm1.features = adm1.features.filter(f => gameCode(f.properties.adm0_a3));
for (const f of adm1.features) {
  const p = f.properties;
  const local = p.name || p.name_en, code = gameCode(p.adm0_a3);
  f.properties = { name: p.name_en || p.name || p.gn_name || p.adm1_code, country: code, area0: +p.area_sqkm || 0,
    pt: LUSO.has(code) ? local : brPt(p.name_pt || p.name_en || local), es: HISPANO.has(code) ? local : (p.name_es || p.name_en || local) };
}
async function msRun(cmd, inputs) { return await mapshaper.applyCommands(cmd, inputs); }
log('building topology');
let out = await msRun('-i adm1.json -clean -o format=topojson adm1.topo.json', { 'adm1.json': JSON.stringify(adm1) });
const topo1 = JSON.parse(out['adm1.topo.json']);
const objName = Object.keys(topo1.objects)[0];
const geoms = topo1.objects[objName].geometries.filter(g => g.type);
const nbr = topo.neighbors(geoms);

function ringArea(ring) { // spherical area km² (lon/lat degrees)
  const R = 6371, rad = Math.PI / 180; let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; s += (b[0] - a[0]) * rad * (2 + Math.sin(a[1] * rad) + Math.sin(b[1] * rad)); }
  return Math.abs(s * R * R / 2);
}
function geomArea(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let a = 0; for (const p of polys) { a += ringArea(p[0]); for (let h = 1; h < p.length; h++) a -= ringArea(p[h]); } return Math.max(0, a);
}
const feats = geoms.map(g => topo.feature(topo1, g));
const areas = feats.map(f => geomArea(f.geometry));

// union-find groups, merging the smallest unit into its smallest same-country neighbour
const parent = geoms.map((_, i) => i), gArea = areas.slice(), gCount = geoms.map(() => 1), mem = geoms.map((_, i) => [i]);
const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const MIN_AREA = 5000; // km² ≈ 70 km square
// countries with many tiny units also get a cap on province count
const countryArea = {}; geoms.forEach((g, i) => { const c = g.properties.country; countryArea[c] = (countryArea[c] || 0) + areas[i]; });
const maxProv = c => Math.max(1, Math.min(90, Math.round(Math.sqrt(countryArea[c] / 1400))));
for (let pass = 0; pass < 40; pass++) {
  let merged = 0;
  const order = geoms.map((_, i) => i).filter(i => find(i) === i).sort((a, b) => gArea[a] - gArea[b]);
  // islands (no same-country neighbour) cannot merge, so they do not count against the country's budget (or France's mainland would become one province)
  const joinable = i => mem[i].some(k => nbr[k].some(n => find(n) !== i && geoms[n].properties.country === geoms[i].properties.country));
  const groupsPer = {}; for (const i of order) { if (!joinable(i)) continue; const c = geoms[i].properties.country; groupsPer[c] = (groupsPer[c] || 0) + 1; }
  for (const i of order) {
    if (find(i) !== i) continue; const c = geoms[i].properties.country;
    if (gArea[i] >= MIN_AREA && groupsPer[c] <= maxProv(c)) continue;
    // neighbours of the whole group
    let best = -1, bestA = Infinity;
    for (const k of mem[i]) { for (const n of nbr[k]) { const r = find(n); if (r === i || geoms[r].properties.country !== c) continue; if (gArea[r] < bestA) { bestA = gArea[r]; best = r; } } }
    if (best < 0) continue; // an island: stays its own province (or gets dropped if tiny later)
    parent[i] = best; gArea[best] += gArea[i]; gCount[best] += gCount[i]; mem[best] = mem[best].concat(mem[i]); mem[i] = []; groupsPer[c]--; merged++;
  }
  if (!merged) break;
}
// build merged provinces
const bboxOf = g => { let x0 = 180, y0 = 90, x1 = -180, y1 = -90; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of polys) for (const q of p[0]) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; } return [x0, y0, x1, y1]; };
const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const inGeom = (g, x, y) => { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of polys) if (inRing(p[0], x, y) && !p.slice(1).some(h => inRing(h, x, y))) return true; return false; };
const bigPlaces = readJSON('ne_10m_populated_places.geojson').features.map(f => f.properties).filter(c => (c.POP_MAX || 0) >= 100000).sort((a, b) => b.POP_MAX - a.POP_MAX).map(c => ({ ...c, __m: c }));
const fBox = feats.map(f => bboxOf(f.geometry)), inBox = (i, c) => { const b = fBox[i]; return c.LONGITUDE >= b[0] && c.LONGITUDE <= b[2] && c.LATITUDE >= b[1] && c.LATITUDE <= b[3]; };
const groups = new Map();
geoms.forEach((g, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
const provFeatures = [];
for (const [r, members] of groups) {
  const geom = topo.merge(topo1, members.map(i => geoms[i]));
  const biggest = members.slice().sort((a, b) => areas[b] - areas[a])[0];
  const byArea = members.slice().sort((a, b) => areas[b] - areas[a]);
  // a group of several units is named after the one holding its largest city (else the largest unit): "Nord", not "Côtes-d'Armor"
  const hub = members.length > 1 ? (bigPlaces.find(c => members.some(i => inBox(i, c) && inGeom(feats[i].geometry, c.LONGITUDE, c.LATITUDE)))?.__m ?? null) : null;
  const hubM = hub === null ? null : members.find(i => inBox(i, hub) && inGeom(feats[i].geometry, hub.LONGITUDE, hub.LATITUDE));
  const namer = hubM !== null && hub.POP_MAX >= 1e6 ? [hubM] : members.length > 2 ? [hubM ?? biggest] : byArea, nm = (k) => namer.map(i => geoms[i].properties[k]).join(' & ');
  const name = nm('name'), pt = nm('pt'), es = nm('es');
  const old = members.length > 2 ? geoms[biggest].properties.name : byArea.map(i => geoms[i].properties.name).join(' & '); // the name it had before regions: scenario overrides still use it
  provFeatures.push({ type: 'Feature', properties: { name, pt, es, old, country: geoms[r].properties.country, merged: members.length > 1 }, geometry: geom });
}
log('provinces after merge', provFeatures.length);

// ---------------------------------------------------------------------------
// 2b. Regions around cities: a big state with several cities is cut into one region per city (nearest-city cells),
//     so Rio Grande do Sul becomes Porto Alegre, Caxias do Sul, Pelotas, Santa Maria, Passo Fundo. Empty states stay whole.
const SPLIT = { area: 15000, pop: 150000, capPop: 50000, sepKm: 80, maxPer: 14 };
// Natural Earth repeats some names with a big city's population on a village far away (Natal and Vila Velha in the Amazon):
// of the same-named places in a country, only the most prominent counts
const places = Object.values(readJSON('ne_10m_populated_places.geojson').features.map(f => f.properties)
  .filter(c => (c.POP_MAX || 0) >= SPLIT.pop || (/Admin-[01] capital/.test(c.FEATURECLA || '') && (c.POP_MAX || 0) >= SPLIT.capPop))
  .reduce((m, c) => { const k = c.ADM0_A3 + ':' + c.NAME, o = m[k];
    if (o && o.POP_MAX === c.POP_MAX) { m[k] = { ...o, dup: true }; return m; } // the same population copied onto two places: neither can be trusted
    if (!o || c.SCALERANK < o.SCALERANK || (c.SCALERANK === o.SCALERANK && (c.POP_MIN || 0) > (o.POP_MIN || 0))) m[k] = c; return m; }, {})).filter(c => !c.dup);
const kmBetween = (a, b) => { const r = Math.PI / 180, dl = (b[1] - a[1]) * r, dn = (b[0] - a[0]) * r, h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const seedsOf = provFeatures.map(f => {
  if (geomArea(f.geometry) < SPLIT.area) return [];
  const bb = bboxOf(f.geometry);
  const here = places.filter(c => c.LONGITUDE >= bb[0] && c.LONGITUDE <= bb[2] && c.LATITUDE >= bb[1] && c.LATITUDE <= bb[3] && inGeom(f.geometry, c.LONGITUDE, c.LATITUDE)).sort((a, b) => (b.POP_MAX || 0) - (a.POP_MAX || 0));
  const pick = [];
  for (const c of here) { const at = [c.LONGITUDE, c.LATITUDE]; if (pick.length < SPLIT.maxPer && pick.every(p => kmBetween(p.at, at) >= SPLIT.sepKm)) pick.push({ name: c.NAME, pt: LUSO.has(f.properties.country) ? (c.NAME_PT || c.NAME) : brPt(c.NAME_PT || c.NAME), es: c.NAME_ES || c.NAME, at }); }
  return pick.length > 1 ? pick : [];
});
log('regions: states cut', seedsOf.filter(s => s.length).length, 'into', seedsOf.reduce((a, s) => a + s.length, 0), '-> provinces', provFeatures.length - seedsOf.filter(s => s.length).length + seedsOf.reduce((a, s) => a + s.length, 0));
// cut: each city's cell (the land nearer to it than to the other cities of the state, by straight-line distance) clipped to the state
function cellsFor(seeds, bb) {
  const lat0 = (bb[1] + bb[3]) / 2, k = Math.cos(lat0 * Math.PI / 180), P = s => [s.at[0] * k, s.at[1]];
  const pad = 2, box = [[bb[0] * k - pad, bb[1] - pad], [bb[2] * k + pad, bb[1] - pad], [bb[2] * k + pad, bb[3] + pad], [bb[0] * k - pad, bb[3] + pad]];
  return seeds.map((s, i) => {
    let poly = box; const a = P(s);
    for (let j = 0; j < seeds.length && poly.length; j++) {
      if (j === i) continue; const b = P(seeds[j]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = [b[0] - a[0], b[1] - a[1]];
      const side = q => (q[0] - m[0]) * d[0] + (q[1] - m[1]) * d[1]; // <= 0: nearer to a
      const out = []; for (let q = 0; q < poly.length; q++) { const u = poly[q], v = poly[(q + 1) % poly.length], su = side(u), sv = side(v);
        if (su <= 0) out.push(u); if ((su <= 0) !== (sv <= 0)) { const t = su / (su - sv); out.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); } }
      poly = out;
    }
    const ring = poly.map(q => [q[0] / k, q[1]]); ring.push(ring[0]);
    return { type: 'Feature', properties: { name: s.name, pt: s.pt, es: s.es }, geometry: { type: 'Polygon', coordinates: [ring] } };
  });
}
if (!process.env.MAPGEN_DRY) {
  const cut = [];
  for (let i = 0; i < provFeatures.length; i++) {
    const f = provFeatures[i], seeds = seedsOf[i], state = f.properties.old, merged = f.properties.merged; // a merged group's name is kept for matching, but it is no real state to show
    if (!seeds.length) { cut.push({ ...f, properties: { ...f.properties, state, statePt: f.properties.pt, stateEs: f.properties.es, merged } }); continue; }
    const bb = bboxOf(f.geometry);
    if (bb[2] - bb[0] > 180) { cut.push({ ...f, properties: { ...f.properties, state, merged } }); continue; } // across the antimeridian: left whole
    const r = await msRun('-i cells.json -i prov.json -clip prov target=cells -o format=geojson target=cells out.json', {
      'cells.json': JSON.stringify({ type: 'FeatureCollection', features: cellsFor(seeds, bb) }), 'prov.json': JSON.stringify({ type: 'FeatureCollection', features: [f] }) });
    const parts = JSON.parse(r['out.json']).features.filter(x => x.geometry);
    if (parts.length < 2) { cut.push({ ...f, properties: { ...f.properties, state, merged } }); continue; }
    for (const x of parts) cut.push({ type: 'Feature', properties: { name: x.properties.name, pt: x.properties.pt, es: x.properties.es, country: f.properties.country, state, statePt: f.properties.pt, stateEs: f.properties.es, merged }, geometry: x.geometry });
  }
  // two provinces of one country with the same name (Moscow the city, Moscow the region's capital) get their state added
  const seen = {}; for (const x of cut) { const k = x.properties.country + ':' + x.properties.name; seen[k] = (seen[k] || 0) + 1; }
  for (const x of cut) { const k = x.properties.country + ':' + x.properties.name, q = x.properties; if (seen[k] > 1 && !q.merged && q.state && q.state !== q.name) { q.name += ` (${q.state})`; q.pt += ` (${q.statePt})`; q.es += ` (${q.stateEs})`; } }
  provFeatures.length = 0; provFeatures.push(...cut);
  log('provinces after regions', provFeatures.length);
}
if (process.env.MAPGEN_DRY) { const top = provFeatures.map((f, i) => [f.properties.country + ' ' + f.properties.name, seedsOf[i].map(s => s.name).join(', ')]).filter(x => x[1]); for (const c of ['BRA', 'DEU', 'FRA', 'USA', 'IND']) console.log(top.filter(x => x[0].startsWith(c)).slice(0, 8).map(x => x.join(': ')).join('\n')); process.exit(0); }

// ---------------------------------------------------------------------------
// 3. Clean up: erase big lakes, simplify, drop specks, and build the final topology.
const lakes = readJSON('ne_10m_lakes.geojson'); lakes.features = lakes.features.filter(f => (f.properties.scalerank ?? 9) <= 2);
out = await msRun([
  '-i prov.json -i lakes.json',
  '-erase lakes target=prov',
  '-simplify 20% weighted keep-shapes target=prov',
  '-filter-islands min-area=25km2 target=prov',
  '-filter "this.area > 0" target=prov',
  '-clean target=prov',
  '-each "pid=this.id" target=prov',
  '-o format=topojson quantization=200000 target=prov prov.topo.json',
].join(' '), { 'prov.json': JSON.stringify({ type: 'FeatureCollection', features: provFeatures }), 'lakes.json': JSON.stringify(lakes) });
const topoP = JSON.parse(out['prov.topo.json']);
const pObj = topoP.objects[Object.keys(topoP.objects)[0]];
pObj.geometries = pObj.geometries.filter(g => g.type);
// rename the object and strip properties (they live in provinces.json)
topoP.objects = { provinces: pObj };
const pGeoms = pObj.geometries;
const props = pGeoms.map(g => g.properties);
pGeoms.forEach((g, i) => { g.id = i; delete g.properties; });
const pFeats = pGeoms.map(g => topo.feature(topoP, g));
const pNbr = topo.neighbors(pGeoms);
log('final provinces', pGeoms.length);

// label points (inside each province)
out = await msRun('-i p.json -points inner -o format=geojson pts.json', { 'p.json': JSON.stringify({ type: 'FeatureCollection', features: pFeats.map((f, i) => ({ ...f, properties: { i } })) }) });
const labelPts = []; for (const f of JSON.parse(out['pts.json']).features) if (f.geometry) labelPts[f.properties.i] = f.geometry.coordinates.map(v => +v.toFixed(3));

// coast: arcs used by only one province (and not on the antimeridian cut)
const arcUse = new Map();
const walk = (g, fn) => { const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs; for (const p of polys) for (const ring of p) for (const a of ring) fn(a < 0 ? ~a : a); };
pGeoms.forEach((g, i) => walk(g, a => { if (!arcUse.has(a)) arcUse.set(a, new Set()); arcUse.get(a).add(i); }));
const coastal = pGeoms.map(() => false);
for (const [, s] of arcUse) if (s.size === 1) coastal[[...s][0]] = true;

// ---------------------------------------------------------------------------
// 4. Rasterize provinces (4096x2048) to sample terrain, imagery, population.
const RW = 4096, RH = 2048;
const idr = new Int32Array(RW * RH).fill(-1);
pFeats.forEach((f, pi) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = []; for (const p of polys) for (const r of p) rings.push(r);
  let y0 = 90, y1 = -90; for (const r of rings) for (const q of r) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
  const j0 = Math.max(0, Math.floor((90 - y1) / 180 * RH)), j1 = Math.min(RH - 1, Math.ceil((90 - y0) / 180 * RH));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const lat = 90 - (j + 0.5) * 180 / RH; xs.length = 0;
    for (const r of rings) for (let k = 0, n = r.length; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; if ((a[1] > lat) !== (b[1] > lat)) xs.push(a[0] + (lat - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + 180) / 360 * RW - 0.5)), i1 = Math.min(RW - 1, Math.floor((xs[k + 1] + 180) / 360 * RW - 0.5));
      for (let i = i0; i <= i1; i++) idr[j * RW + i] = pi;
    }
  }
});

// province raster for the war simulation (cell -> province lookup): id+1 packed in R (lo) and G (hi)
{
  const pr = Buffer.alloc(RW * RH * 3);
  for (let k = 0; k < RW * RH; k++) { const v = idr[k] + 1; pr[k * 3] = v & 255; pr[k * 3 + 1] = v >> 8; }
  await sharp(pr, { raw: { width: RW, height: RH, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'provraster.png'));
}
// DEM from terrarium tiles (z4, Web Mercator) -> equirectangular
log('building elevation');
const Z = 4, TS = 256, MW = TS << Z;
const merc = new Float32Array(MW * MW);
for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
  const { data } = await sharp(path.join(CACHE, `terrarium/${Z}_${x}_${y}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let py = 0; py < TS; py++) for (let px = 0; px < TS; px++) {
    const o = (py * TS + px) * 3; merc[(y * TS + py) * MW + x * TS + px] = data[o] * 256 + data[o + 1] + data[o + 2] / 256 - 32768;
  }
}
const dem = new Float32Array(RW * RH);
for (let j = 0; j < RH; j++) {
  const lat = Math.max(-85.05, Math.min(85.05, 90 - (j + 0.5) * 180 / RH)), phi = lat * Math.PI / 180;
  const my = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2 * MW - 0.5;
  for (let i = 0; i < RW; i++) {
    const mx = (i + 0.5) / RW * MW - 0.5, x0 = Math.floor(mx), y0 = Math.max(0, Math.min(MW - 2, Math.floor(my))), fx = mx - x0, fy = Math.min(1, Math.max(0, my - y0));
    const xa = (x0 + MW) % MW, xb = (x0 + 1) % MW;
    const v = (merc[y0 * MW + xa] * (1 - fx) + merc[y0 * MW + xb] * fx) * (1 - fy) + (merc[(y0 + 1) * MW + xa] * (1 - fx) + merc[(y0 + 1) * MW + xb] * fx) * fy;
    dem[j * RW + i] = v;
  }
}
{
  const buf = Buffer.alloc(RW * RH * 3);
  // 8-bit, square-root scaled (more precision in lowlands): elev = (v/255)^2 * 8800 m; sea = 0
  const g8 = Buffer.alloc(RW * RH);
  for (let k = 0; k < RW * RH; k++) g8[k] = idr[k] < 0 ? 0 : Math.max(1, Math.min(255, Math.round(Math.sqrt(Math.max(0, dem[k]) / 8800) * 255)));
  await sharp(g8, { raw: { width: RW, height: RH, channels: 1 } }).png({ compressionLevel: 9, palette: false }).toFile(path.join(OUT, 'dem.png'));
}

// colour imagery
log('building imagery');
const zip = new AdmZip(path.join(CACHE, 'NE1_50M_SR_W.zip'));
const tifEntry = zip.getEntries().find(e => /\.tif$/i.test(e.entryName));
const tif = zip.readFile(tifEntry);
const full = sharp(tif, { limitInputPixels: false }).resize(8192, 4096, { kernel: 'lanczos3' });
const fullBuf = await full.removeAlpha().raw().toBuffer({ resolveWithObject: true });
for (const [name, left] of [['base-w.jpg', 0], ['base-e.jpg', 4096]])
  await sharp(fullBuf.data, { raw: fullBuf.info }).extract({ left, top: 0, width: 4096, height: 4096 }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, name));
const img = await sharp(fullBuf.data, { raw: fullBuf.info }).resize(RW, RH).raw().toBuffer();

// ---------------------------------------------------------------------------
// 5. Per-province stats: terrain from elevation + imagery, then population and GDP.
const N = pGeoms.length;
const st = Array.from({ length: N }, () => ({ n: 0, e: 0, e2: 0, r: 0, g: 0, b: 0, lat: 0 }));
for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) {
  const p = idr[j * RW + i]; if (p < 0) continue; const s = st[p], k = j * RW + i, e = Math.max(0, dem[k]);
  s.n++; s.e += e; s.e2 += e * e; s.r += img[k * 3]; s.g += img[k * 3 + 1]; s.b += img[k * 3 + 2]; s.lat += 90 - (j + 0.5) * 180 / RH;
}
// local relief: elevation spread inside 3x3 pixel windows, averaged per province
const rough = new Float64Array(N), roughN = new Float64Array(N);
for (let j = 1; j < RH - 1; j += 2) for (let i = 1; i < RW - 1; i += 2) {
  const p = idr[j * RW + i]; if (p < 0) continue;
  let lo = 1e9, hi = -1e9; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = dem[(j + dj) * RW + i + di]; if (v < lo) lo = v; if (v > hi) hi = v; }
  rough[p] += hi - lo; roughN[p]++;
}
const cities = readJSON('ne_10m_populated_places.geojson').features.map(f => f.properties);
const provinces0Country = i => props[i]?.country;
const provCityPop = new Float64Array(N);
const cityOut = [];
const provAt = (lon, lat) => { const i = Math.min(RW - 1, Math.max(0, Math.floor((lon + 180) / 360 * RW))), j = Math.min(RH - 1, Math.max(0, Math.floor((90 - lat) / 180 * RH))); let p = idr[j * RW + i];
  if (p < 0) for (let r = 1; r < 4 && p < 0; r++) for (let dj = -r; dj <= r && p < 0; dj++) for (let di = -r; di <= r && p < 0; di++) { const v = idr[Math.min(RH - 1, Math.max(0, j + dj)) * RW + Math.min(RW - 1, Math.max(0, i + di))]; if (v >= 0) p = v; }
  return p; };
for (const c of cities) {
  const p = provAt(c.LONGITUDE, c.LATITUDE); if (p < 0) continue;
  const pop = c.POP_MAX || 0; provCityPop[p] += pop;
  const cap = /Admin-0 capital/.test(c.FEATURECLA || '') && !/alt|region/i.test(c.FEATURECLA);
  if (cap || c.SCALERANK <= 5 || pop >= 600000) {
    const cc = provinces0Country(p), pt = LUSO.has(cc) ? (c.NAME_PT || c.NAME) : brPt(c.NAME_PT || c.NAME), es = c.NAME_ES || c.NAME;
    cityOut.push({ name: c.NAME, ...(pt !== c.NAME ? { pt } : {}), ...(es !== c.NAME ? { es } : {}), lon: +c.LONGITUDE.toFixed(3), lat: +c.LATITUDE.toFixed(3), pop, prov: p, capital: cap, rank: c.SCALERANK });
  }
}

const provinces = [];
for (let i = 0; i < N; i++) {
  const s = st[i], n = Math.max(1, s.n), elev = s.e / n, sd = Math.sqrt(Math.max(0, s.e2 / n - elev * elev)), rgh = roughN[i] ? rough[i] / roughN[i] : 0;
  const R = s.r / n, G = s.g / n, B = s.b / n, lat = s.n ? s.lat / n : (labelPts[i] || [0, 0])[1];
  let terrain = 'plains';
  if (rgh > 650 || elev > 2600) terrain = 'mountains';
  else if (rgh > 280 || elev > 1300) terrain = 'hills';
  if (Math.abs(lat) > 62 && B > 150 && R > 150) terrain = 'arctic';
  else if (R > 195 && R - G > 7 && R - B < 60 && terrain !== 'mountains') terrain = 'desert';
  else if (G > R + 6 && (terrain === 'plains' || terrain === 'hills')) terrain = Math.abs(lat) < 18 ? 'jungle' : terrain === 'hills' ? 'hills' : 'forest';
  const label = labelPts[i] || pFeats[i].geometry.coordinates.flat(3).slice(0, 2);
  const q = props[i], hasState = q.state && q.state !== q.name;
  provinces.push({ id: i, name: q.name, ...(q.pt && q.pt !== q.name ? { pt: q.pt } : {}), ...(q.es && q.es !== q.name ? { es: q.es } : {}),
    ...(hasState ? { state: q.state, ...(q.statePt && q.statePt !== q.state ? { statePt: q.statePt } : {}), ...(q.stateEs && q.stateEs !== q.state ? { stateEs: q.stateEs } : {}) } : {}),
    ...(q.merged ? { merged: 1 } : {}), country: q.country, label, area: Math.round(geomArea(pFeats[i].geometry)), terrain, elev: Math.round(elev), rough: Math.round(rgh),
    coastal: coastal[i], nbr: [...new Set(pNbr[i])].sort((a, b) => a - b), _city: provCityPop[i], _hab: terrain === 'desert' || terrain === 'arctic' ? 0.08 : terrain === 'mountains' ? 0.35 : terrain === 'jungle' ? 0.5 : 1 });
}
// distribute each country's population and GDP over its provinces
const byC = {}; provinces.forEach(p => (byC[p.country] ||= []).push(p));
for (const [c, list] of Object.entries(byC)) {
  const C = COUNTRY[c]; if (!C) continue;
  const urbanTot = list.reduce((a, p) => a + p._city, 0), ruralW = list.reduce((a, p) => a + p.area * p._hab, 0) || 1;
  const urbanShare = urbanTot > 0 ? Math.min(0.75, urbanTot / Math.max(1, C.pop)) : 0;
  for (const p of list) {
    const u = urbanTot > 0 ? p._city / urbanTot : 0, r = p.area * p._hab / ruralW;
    p.pop = Math.round(C.pop * (urbanShare * u + (1 - urbanShare) * r));
    p._w = u * 1.6 + r * 0.4;
  }
  const wt = list.reduce((a, p) => a + p._w, 0) || 1;
  for (const p of list) { p.gdp = Math.round(C.gdp * p._w / wt); delete p._w; delete p._city; delete p._hab; }
}

// countries actually present, with capital province and colour
const present = [...new Set(provinces.map(p => p.country))];
const countries = present.map(code => {
  const C = COUNTRY[code];
  const capCity = cityOut.filter(c => c.capital && provinces[c.prov].country === code).sort((a, b) => b.pop - a.pop)[0];
  const list = byC[code];
  const capital = capCity ? capCity.prov : list.slice().sort((a, b) => b.pop - a.pop)[0].id;
  return { code, name: C.name, iso2: C.iso2, pop: C.pop, gdp: C.gdp, capital, capitalName: capCity ? capCity.name : provinces[capital].name, mapcolor: C.mapcolor };
});
// colours: a curated hue for the big ones, then greedy colouring so neighbours differ
const FIXED = { USA: '#3460a8', RUS: '#3a7a4e', CHN: '#b8342a', IND: '#d0802a', BRA: '#3a9060', GBR: '#b8405c', FRA: '#3f63c0', DEU: '#5a6270', JPN: '#d8d0bc', CAN: '#b8423f', AUS: '#2f9e8f', TUR: '#9a3b3b', IRN: '#4f9a6a', SAU: '#6f8f3a', EGY: '#c9a54a', KOR: '#4e7fc4', PRK: '#a33a4a', UKR: '#d9b84a', POL: '#c25b6e', ITA: '#4f9a52', ESP: '#d4a03a', MEX: '#3f8a6e', ARG: '#6fb4d9', IDN: '#b0543c', PAK: '#3c7a4a', NGA: '#4a9a6a', ZAF: '#c88a3a', KAZ: '#5aa0b8', MNG: '#a07a4a', TWN: '#4aa0c8' };
const cIndex = Object.fromEntries(countries.map((c, i) => [c.code, i]));
const adjC = countries.map(() => new Set());
for (const p of provinces) for (const n of p.nbr) { const a = cIndex[p.country], b = cIndex[provinces[n].country]; if (a !== b) { adjC[a].add(b); adjC[b].add(a); } }
const PALETTE = ['#a8473f', '#3f6fae', '#4f8a4c', '#b98e2e', '#7a52a0', '#2f8a86', '#b5622e', '#6b7a2e', '#9e3f6e', '#4a5f9e', '#8a6a3a', '#3a8a6e', '#ad7848', '#5a7fb8', '#943f3f', '#6f9038'];
countries.forEach(c => { if (FIXED[c.code]) c.color = FIXED[c.code]; });
const order = countries.map((c, i) => i).sort((a, b) => adjC[b].size - adjC[a].size);
for (const i of order) { if (countries[i].color) continue; const used = new Set([...adjC[i]].map(j => countries[j].color)); const free = PALETTE.filter(c => !used.has(c)); countries[i].color = (free.length ? free : PALETTE)[(countries[i].mapcolor * 7 + i) % (free.length || PALETTE.length)]; }
countries.forEach(c => delete c.mapcolor);

fs.writeFileSync(path.join(OUT, 'provinces.topo.json'), JSON.stringify(topoP));
fs.writeFileSync(path.join(OUT, 'provinces.json'), JSON.stringify(provinces));
fs.writeFileSync(path.join(OUT, 'countries.json'), JSON.stringify(countries));
fs.writeFileSync(path.join(OUT, 'cities.json'), JSON.stringify(cityOut.sort((a, b) => b.pop - a.pop)));
const sz = f => (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2) + 'MB';
log('done:', N, 'provinces,', countries.length, 'countries,', cityOut.length, 'cities');
log(['provinces.topo.json', 'provinces.json', 'countries.json', 'cities.json', 'dem.png', 'base-w.jpg', 'base-e.jpg'].map(f => f + ' ' + sz(f)).join(', '));
const tcount = {}; provinces.forEach(p => (tcount[p.terrain] = (tcount[p.terrain] || 0) + 1)); log('terrain', JSON.stringify(tcount));
