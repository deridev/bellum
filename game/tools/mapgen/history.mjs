// Historical borders: aourednik/historical-basemaps (GPL-3.0), world_1914 and world_1938.geojson in tools/cache.
//
// Historical scenarios: every modern province is assigned to a 1914 or 1939 country. Polygons stay modern.
//
//   node tools/mapgen/history.mjs            (after build.mjs and flags.mjs)
//
// Outputs public/data/scenario-1914.json and scenario-1939.json:
//   { id, start, countries: [{ code, name, color, capital, flag, modern? }], owner: [country index per province id, or -1] }
//
// Owner of a province, first rule that applies:
//   1. PROV override ("ISO3:province name"): source errors and changes after the source's date
//   2. MODERN override (every province of a modern country)
//   3. the historical polygon containing the province's label point: its NAME, else its SUBJECTO (colonial power),
//      looked up in NAMES; colonies therefore go to their power, dominions are listed as their own countries
//   4. label outside every named polygon (islands, coastline gaps): the owner of its modern country's capital,
//      else the nearest named polygon within 300 km, else unowned (-1)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'tools/cache'), OUT = process.env.MAPGEN_OUT ? path.resolve(process.env.MAPGEN_OUT) : path.join(ROOT, 'public/data');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const provinces = read(path.join(OUT, 'provinces.json'));
const modern = read(path.join(OUT, 'countries.json'));
const flagIndex = read(path.join(OUT, 'flags.json')).index;
const modernBy = Object.fromEntries(modern.map(c => [c.code, c]));

// historical code -> closest modern ISO3, where the code itself is not a modern one
const MODERN_OF = { GER: 'DEU', AUH: 'AUT', OTT: 'TUR', SOV: 'RUS', NEJ: 'SAU' };
// both scenarios, whole modern countries: possessions the source misses, mislabels or leaves "independent"
const COLONIES = { FRA: 'FRA', GBR: 'GBR', NLD: 'NLD', PRT: 'PRT', ESP: 'ESP', DNK: 'DNK', MAR: 'FRA', TLS: 'PRT', CPV: 'PRT', STP: 'PRT', COM: 'FRA',
  MLT: 'GBR', MUS: 'GBR', SYC: 'GBR', SLB: 'GBR', VUT: 'FRA', KIR: 'GBR', SGP: 'GBR', TON: 'GBR', BHR: 'GBR', KWT: 'GBR', QAT: 'GBR', ARE: 'GBR', OMN: 'GBR' };
// both scenarios: Kinmen stayed Chinese; the northern zone of Morocco and the Sahara were Spanish
const SHARED_PROV = { 'TWN:Kinmen': 'CHN', 'MAR:Tangier-Tetouan': 'ESP', 'MAR:Laâyoune-Boujdour-Sakia El Hamra': 'ESP', 'MAR:Oued Ed-Dahab': 'ESP' };
// independent American states, the same in both scenarios: code -> [name (also the source polygon NAME), capital]
const AMERICAS = { USA: ['United States', [-77.04, 38.91]], MEX: ['Mexico', [-99.13, 19.43]], GTM: ['Guatemala', [-90.51, 14.63]], HND: ['Honduras', [-87.21, 14.07]],
  SLV: ['El Salvador', [-89.19, 13.69]], NIC: ['Nicaragua', [-86.25, 12.13]], CRI: ['Costa Rica', [-84.09, 9.93]], PAN: ['Panama', [-79.52, 8.98]], CUB: ['Cuba', [-82.37, 23.11]],
  HTI: ['Haiti', [-72.34, 18.54]], DOM: ['Dominican Republic', [-69.93, 18.49]], COL: ['Colombia', [-74.07, 4.71]], VEN: ['Venezuela', [-66.9, 10.49]], ECU: ['Ecuador', [-78.47, -0.18]],
  PER: ['Peru', [-77.04, -12.05]], BRA: ['Brazil', [-43.17, -22.91]], BOL: ['Bolivia', [-68.15, -16.5]], PRY: ['Paraguay', [-57.58, -25.26]], CHL: ['Chile', [-70.65, -33.45]],
  ARG: ['Argentina', [-58.38, -34.6]], URY: ['Uruguay', [-56.16, -34.9]] };
const americas = () => Object.entries(AMERICAS).map(([c, [name, cap]]) => [c, name, null, cap]);

// countries: [code, name, colour (null: the modern colour), capital [lon, lat], flag key (default: modern flag of the same code)]
const SCENARIOS = [{
  id: '1914', start: '1914-07-28', src: 'world_1914.geojson',
  countries: [
    ['GBR', 'United Kingdom', '#b8405c', [-0.13, 51.51]], ['FRA', 'France', '#3f63c0', [2.35, 48.86]], ['GER', 'German Empire', '#5a6270', [13.4, 52.52], 'h:GER'],
    ['AUH', 'Austria-Hungary', '#c9a640', [16.37, 48.21], 'h:AUH'], ['RUS', 'Russian Empire', '#3f7a45', [30.32, 59.94]], ['ITA', 'Kingdom of Italy', '#5fa055', [12.5, 41.9], 'h:ITA'],
    ['OTT', 'Ottoman Empire', '#2f8f88', [28.98, 41.01], 'TUR'], ['SRB', 'Serbia', '#a8473f', [20.46, 44.82]], ['MNE', 'Montenegro', '#5a7fb8', [18.92, 42.39], 'h:MNE'],
    ['BGR', 'Bulgaria', '#6b8a3a', [23.32, 42.7]], ['ROU', 'Romania', '#3f6fae', [26.1, 44.43]], ['GRC', 'Greece', '#6fb4d9', [23.73, 37.98]], ['ALB', 'Albania', '#9e3f6e', [19.45, 41.32]],
    ['ESP', 'Spain', '#d4a03a', [-3.7, 40.42]], ['PRT', 'Portugal', '#3a8a6e', [-9.14, 38.72]], ['BEL', 'Belgium', '#b98e2e', [4.35, 50.85]], ['NLD', 'Netherlands', '#d9762a', [4.9, 52.37]],
    ['LUX', 'Luxembourg', '#6fa0c8', [6.13, 49.61]], ['CHE', 'Switzerland', '#b5463f', [7.45, 46.95]], ['DNK', 'Denmark', '#9e3f6e', [12.57, 55.68]], ['SWE', 'Sweden', '#4a7fc4', [18.07, 59.33]],
    ['NOR', 'Norway', '#a8473f', [10.75, 59.91]],
    ['CAN', 'Canada', '#c8683a', [-75.7, 45.42], 'h:CAN'], ...americas(),
    ['ETH', 'Ethiopia', null, [38.75, 9.03], 'h:ETH'], ['LBR', 'Liberia', null, [-10.8, 6.3]], ['ZAF', 'Union of South Africa', null, [28.19, -25.75], 'h:ZAF1914'],
    ['JPN', 'Empire of Japan', null, [139.69, 35.69], 'h:JPN'], ['CHN', 'Republic of China', '#d09a3a', [116.4, 39.9], 'h:CHN1914'], ['TIB', 'Tibet', '#7a8aa8', [91.11, 29.65], 'h:TIB'],
    ['MNG', 'Mongolia', '#8a6aa0', [106.92, 47.92], 'h:MNG1914'], ['IRN', 'Persia', '#c49a6a', [51.39, 35.69], 'h:IRN'], ['AFG', 'Afghanistan', '#7a52a0', [69.17, 34.53], 'h:AFG1914'],
    ['NPL', 'Nepal', null, [85.32, 27.72]], ['BTN', 'Bhutan', null, [89.86, 27.59]], ['THA', 'Siam', '#c9a03a', [100.5, 13.75], 'h:THA1914'], ['NEJ', 'Nejd', '#6f8f3a', [46.72, 24.69], 'SAU'],
    ['AUS', 'Australia', null, [144.96, -37.81]], ['NZL', 'New Zealand', null, [174.78, -41.29]],
  ],
  names: {
    GBR: ['United Kingdom of Great Britain and Ireland', 'United Kingdom', 'Anguilla', 'Antigua and Barbuda', 'Barbados', 'Belize', 'Ceylon', 'Dominica', 'Fiji', 'Gambia, The', 'Grenada',
      'Guyana', 'Malaya', 'Malta', 'Montserrat', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Sierra Leone', 'Swaziland', 'Lesotho', 'Uganda', 'Brunei',
      'Italian Somaliland'], // the source has the two Somaliland labels swapped
    ITA: ['Italy', 'British Somaliland'],
    FRA: ['France', 'French Guiana', 'Guadeloupe', 'Martinique', 'Saint Martin', 'Saint Barthelemy', 'Wallis and Futuna Islands', 'Tunisia'],
    GER: ['German Empire', 'German South-West Africa', 'Kamerun', 'Togoland', 'Samoa'], AUH: ['Austro-Hungarian Empire'], OTT: ['Ottoman Empire'],
    RUS: ['Russia', 'Finland', 'Armenia', 'Azerbaijan', 'Georgia'], // Grand Duchy of Finland and the Caucasus were Russian in 1914
    ESP: ['Spain', 'Spanish Morocco', 'Rio De Oro', 'Equatorial Guinea'], PRT: ['Portugal', 'Portuguese Guinea'], BEL: ['Belgium'],
    NLD: ['Netherlands', 'Netherlands Antilles', 'Netherlands Indies', 'Suriname'], USA: ['American Samoa', 'Puerto Rico', 'Philippines'],
    DNK: ['Denmark', 'Iceland', 'United States Virgin Islands'], // Danish West Indies until 1917
    JPN: ['Empire of Japan'], CHN: ['Manchu Empire', 'Xinjiang'], ZAF: ['South Africa'], CAN: ['Canada'], AUS: ['Australia', 'Papua New Guinea'], NZL: ['New Zealand', 'Niue'],
    ETH: ['Abyssinia'], NEJ: ['Arabia (Nejd)'], THA: ['Rattanakosin Kingdom'], IRN: ['Persia'], TIB: ['Tibet'], MNG: ['Mongolia'], NPL: ['Nepal'], BTN: ['Bhutan'], AFG: ['Afghanistan'],
    SRB: ['Serbia'], MNE: ['Montenegro'], BGR: ['Bulgaria'], ROU: ['Romania'], GRC: ['Greece'], ALB: ['Albania'], LUX: ['Luxembourg'], CHE: ['Switzerland'], SWE: ['Sweden'], NOR: ['Norway'],
    LBR: ['Liberia'], CHL: ['Rapa Nui'],
  },
  modern: { ...COLONIES, FIN: 'RUS', MDA: 'RUS', SYR: 'OTT', LBN: 'OTT', ISR: 'OTT', JOR: 'OTT', IRQ: 'OTT', LBY: 'ITA', IRL: 'GBR', FSM: 'GER', PLW: 'GER', WSM: 'GER' },
  prov: {
    ...SHARED_PROV, 'CAN:Newfoundland and Labrador': 'GBR', 'SAU:Makkah': 'OTT', 'SRB:Belgrade': 'SRB' /* holds Belgrade */, 'TUR:Istanbul': 'OTT', 'YEM:Al Jawf': 'OTT', "YEM:Ma'rib": 'OTT', 'GAB:Estuaire': 'FRA',
    ...Object.fromEntries(['Sandaun', 'East Sepik', 'Madang', 'Morobe', 'Western Highlands', 'Chimbu', 'Enga', 'Eastern Highlands', 'West New Britain', 'East New Britain',
      'New Ireland', 'Manus', 'of Bougainville'].map(n => ['PNG:' + n, 'GER'])), // German New Guinea
    ...Object.fromEntries(['Rota', 'Tinian', 'Saipan', 'Northern Mariana Islands'].map(n => ['USA:' + n, 'GER'])),
  },
}, {
  id: '1939', start: '1939-09-01', src: 'world_1938.geojson',
  countries: [
    ['GER', 'German Reich', '#5a6270', [13.4, 52.52], 'h:GER'], ['POL', 'Poland', '#c76b80', [21.01, 52.23]], ['GBR', 'United Kingdom', '#b8405c', [-0.13, 51.51]],
    ['FRA', 'France', '#3f63c0', [2.35, 48.86]], ['ITA', 'Kingdom of Italy', '#5fa055', [12.5, 41.9], 'h:ITA'], ['SOV', 'Soviet Union', '#8c2f2f', [37.62, 55.75], 'h:SOV'],
    ['ESP', 'Spain', '#d4a03a', [-3.7, 40.42]], ['PRT', 'Portugal', '#3a8a6e', [-9.14, 38.72]], ['IRL', 'Ireland', '#3f9a5a', [-6.26, 53.35]], ['BEL', 'Belgium', '#b98e2e', [4.35, 50.85]],
    ['NLD', 'Netherlands', '#d9762a', [4.9, 52.37]], ['LUX', 'Luxembourg', '#6fa0c8', [6.13, 49.61]], ['CHE', 'Switzerland', '#b5463f', [7.45, 46.95]], ['DNK', 'Denmark', '#9e3f6e', [12.57, 55.68]],
    ['NOR', 'Norway', '#a8473f', [10.75, 59.91]], ['SWE', 'Sweden', '#4a7fc4', [18.07, 59.33]], ['FIN', 'Finland', null, [24.94, 60.17]], ['EST', 'Estonia', null, [24.75, 59.44]],
    ['LVA', 'Latvia', null, [24.11, 56.95]], ['LTU', 'Lithuania', '#c9a040', [23.9, 54.9]], ['HUN', 'Hungary', '#b98e2e', [19.04, 47.5]], ['SVK', 'Slovakia', '#7a52a0', [17.11, 48.15]],
    ['ROU', 'Romania', '#3f6fae', [26.1, 44.43]], ['YUG', 'Yugoslavia', '#8f5aa0', [20.46, 44.82], 'h:YUG'], ['BGR', 'Bulgaria', '#6b8a3a', [23.32, 42.7]], ['GRC', 'Greece', '#6fb4d9', [23.73, 37.98]],
    ['TUR', 'Turkey', '#2f8f88', [32.85, 39.93]],
    ['IRQ', 'Iraq', '#8a6aa0', [44.37, 33.31], 'h:IRQ'], ['SAU', 'Saudi Arabia', '#6f8f3a', [46.72, 24.69]], ['YEM', 'Yemen', '#4f7fa8', [44.21, 15.35], 'h:YEM'],
    ['IRN', 'Iran', '#c49a6a', [51.39, 35.69], 'h:IRN'], ['AFG', 'Afghanistan', '#7a52a0', [69.17, 34.53]], ['EGY', 'Egypt', null, [31.24, 30.04], 'h:EGY'],
    ['JPN', 'Empire of Japan', null, [139.69, 35.69], 'h:JPN'], ['MAN', 'Manchukuo', '#7a8a3a', [125.32, 43.88], 'h:MAN'], ['CHN', 'Republic of China', '#d09a3a', [106.55, 29.56], 'TWN'],
    ['TIB', 'Tibet', '#7a8aa8', [91.11, 29.65], 'h:TIB'], ['MNG', 'Mongolia', '#8a6aa0', [106.92, 47.92]], ['THA', 'Thailand', '#c9a03a', [100.5, 13.75]],
    ['NPL', 'Nepal', null, [85.32, 27.72]], ['BTN', 'Bhutan', null, [89.64, 27.47]],
    ['CAN', 'Canada', '#c8683a', [-75.7, 45.42], 'h:CAN'], ...americas(),
    ['LBR', 'Liberia', null, [-10.8, 6.3]], ['ZAF', 'Union of South Africa', null, [28.19, -25.75], 'h:ZAF1939'],
    ['AUS', 'Australia', null, [149.13, -35.28]], ['NZL', 'New Zealand', null, [174.78, -41.29]],
  ],
  names: {
    GBR: ['United Kingdom', 'United Kingdom of Great Britain and Ireland', 'Anguilla', 'Antigua and Barbuda', 'Bahamas', 'Barbados', 'Belize', 'Ceylon', 'Dominica', 'Fiji', 'Gambia, The',
      'Grenada', 'Guyana', 'Jamaica', 'Malawi', 'Montserrat', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Sudan', 'Trinidad', 'Trucial Oman',
      'Turks and Caicos Islands', 'Brunei', 'Israel', 'India', 'Dominion of Newfoundland'], // Newfoundland: under a British commission since 1934
    FRA: ['France', 'French Guiana', 'French Somaliland', 'Guadeloupe', 'Martinique', 'Saint Martin', 'Saint Barthelemy', 'Wallis and Futuna Islands', 'Tunisia', 'Togo',
      'Laos', 'Cambodia', 'Cochin China', 'Andorra'], // the source gives Cambodia and Cochin China to Japan: they were French Indochina in 1939
    ITA: ['Italy', 'Libya', 'Albania'], // Albania annexed April 1939
    GER: ['Germany'], SOV: ['USSR'], POL: ['Poland'], SVK: ['Czechoslovakia'], // Czech lands are German (MODERN), what is left of Czechoslovakia is Slovakia
    ESP: ['Spain'], PRT: ['Portugal', 'Guinea-Bissau'], BEL: ['Belgium', 'Burundi'], NLD: ['Netherlands', 'Netherlands Antilles', 'Suriname'],
    USA: ['American Samoa', 'Puerto Rico', 'United States Virgin Islands'], DNK: ['Denmark'], JPN: ['Empire of Japan'],
    CHN: ['Chinese warlords', 'Xinjiang'], SAU: ['Saudi Arabia', 'Hejaz', 'Hail', "Emirate of Bin Shal'an"], ZAF: ['Union of South Africa'], NZL: ['New Zealand', 'Niue', 'Samoa'],
    HUN: ['Hungary'], ROU: ['Romania'], YUG: ['Yugoslavia'], BGR: ['Bulgaria'], GRC: ['Greece'], TUR: ['Turkey'], IRL: ['Ireland'], FIN: ['Finland'], EST: ['Estonia'], LVA: ['Latvia'],
    LTU: ['Lithuania'], LUX: ['Luxembourg'], CHE: ['Switzerland'], NOR: ['Norway'], SWE: ['Sweden'], YEM: ['Yemen'], IRN: ['Iran'], EGY: ['Egypt'], AFG: ['Afghanistan'],
    NPL: ['Nepal'], BTN: ['Bhutan'], TIB: ['Tibet'], MNG: ['Mongolia'], THA: ['Siam'], LBR: ['Liberia'], CAN: ['Canada'], AUS: ['Australia'], CHL: ['Rapa Nui'],
  },
  // the 1938 source misplaces parts of Turkey, Iran and North Yemen; Iraq is independent since 1932; Bohemia-Moravia and the Sudetenland are German
  modern: { ...COLONIES, TUR: 'TUR', IRN: 'IRN', IRQ: 'IRQ', YEM: 'YEM', JOR: 'GBR', CZE: 'GER', FSM: 'JPN', PLW: 'JPN', WSM: 'NZL' },
  prov: {
    ...SHARED_PROV, 'LTU:Klaipėda': 'GER', 'POL:Warmian-Masurian Voivodeship': 'GER', 'UKR:Rivne': 'POL', 'UKR:Khmelnytskyi': 'SOV', 'CMR:Northwest': 'GBR', 'CMR:Southwest': 'GBR',
    ...Object.fromEntries(['Hadhramaut', 'Al Mahrah', "Lahij & 'Adan", 'Abyan', 'Shabwah'].map(n => ['YEM:' + n, 'GBR'])), // Aden
    ...Object.fromEntries(['Heilongjiang', 'Jilin', 'Liaoning'].map(n => ['CHN:' + n, 'MAN'])),
    // occupied by Japan in the war with China by September 1939
    ...Object.fromEntries(['Beijing', 'Tianjin', 'Hebei', 'Shandong', 'Shanxi', 'Jiangsu', 'Shanghai', 'Anhui', 'Guangdong', 'Hainan', 'Inner Mongolia'].map(n => ['CHN:' + n, 'JPN'])),
  },
}];

// --- geometry -----------------------------------------------------------------
const polysOf = g => g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
function inRing(pt, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < (b[0] - a[0]) * (pt[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
const inGeom = (pt, g) => polysOf(g).some(p => inRing(pt, p[0]) && !p.slice(1).some(h => inRing(pt, h)));
function distKm(pt, g) { // approximate distance from a point to a polygon's boundary
  const k = Math.cos(pt[1] * Math.PI / 180); let d = Infinity;
  for (const p of polysOf(g)) for (const r of p) for (let i = 0; i + 1 < r.length; i++) {
    const ax = (r[i][0] - pt[0]) * k, ay = r[i][1] - pt[1], dx = (r[i + 1][0] - r[i][0]) * k, dy = r[i + 1][1] - r[i][1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0, x = ax + t * dx, y = ay + t * dy; d = Math.min(d, Math.hypot(x, y) * 111);
  }
  return d;
}
const NEAREST_KM = 300;

// province raster from build.mjs: id+1 in R (lo) and G (hi)
const { data: rast, info } = await sharp(path.join(OUT, 'provraster.png')).raw().toBuffer({ resolveWithObject: true });
function provAt(lon, lat) {
  const W = info.width, H = info.height, ci = Math.floor((lon + 180) / 360 * W), cj = Math.floor((90 - lat) / 180 * H);
  for (let r = 0; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = Math.min(W - 1, Math.max(0, ci + di)), j = Math.min(H - 1, Math.max(0, cj + dj)), o = (j * W + i) * info.channels, v = rast[o] + rast[o + 1] * 256;
    if (v) return v - 1;
  }
  return -1;
}

// --- scenarios ----------------------------------------------------------------
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const capitalOf = Object.fromEntries(modern.map(c => [c.code, c.capital]));
for (const S of SCENARIOS) {
  const feats = read(path.join(CACHE, S.src)).features.filter(f => f.geometry && f.properties.NAME);
  const codeOf = Object.fromEntries(Object.entries(AMERICAS).map(([c, [name]]) => [name, c]));
  for (const [code, list] of Object.entries(S.names)) for (const n of list) codeOf[n] = code;
  // an override names a province, or a state (then it covers every region the state was cut into)
  const keysOf = p => [`${p.country}:${p.name}`, ...(p.state ? [`${p.country}:${p.state}`] : [])];
  const provKey = {}, byName = {}; provinces.forEach(p => { const k = `${p.country}:${p.name}`; if (k in S.prov) { if (k in byName) throw new Error(`${S.id}: ambiguous override ${k}`); byName[k] = provKey[k] = p.id; } if (p.state && `${p.country}:${p.state}` in S.prov) provKey[`${p.country}:${p.state}`] = p.id; });
  for (const k of Object.keys(S.prov)) if (!(k in provKey)) throw new Error(`${S.id}: override ${k} matches no province`);

  const unmapped = new Set(), how = { override: 0, polygon: 0, capital: 0, nearest: 0, none: 0 };
  const hit = provinces.map(p => feats.find(f => inGeom(p.label, f.geometry)));
  const memo = new Map();
  function ownerOf(p) {
    if (memo.has(p.id)) return memo.get(p.id);
    let code = keysOf(p).map(k => S.prov[k]).find(Boolean) || S.modern[p.country], kind = 'override';
    const lookup = f => { const { NAME, SUBJECTO } = f.properties, c = codeOf[NAME] || codeOf[SUBJECTO]; if (!c) unmapped.add(`${NAME} [${SUBJECTO}]`); return c || null; };
    if (!code && hit[p.id]) { code = lookup(hit[p.id]); kind = 'polygon'; }
    if (!code && !hit[p.id]) {
      const cap = provinces[capitalOf[p.country]];
      if (cap && cap.id !== p.id && hit[cap.id]) { code = ownerOf(cap); kind = 'capital'; }
      else {
        let best = null, bd = NEAREST_KM; for (const f of feats) { const d = distKm(p.label, f.geometry); if (d < bd) { bd = d; best = f; } }
        code = best ? lookup(best) : null; kind = best ? 'nearest' : 'none';
      }
    }
    how[code ? kind : 'none']++; memo.set(p.id, code); return code;
  }
  const codes = provinces.map(ownerOf);
  if (unmapped.size) throw new Error(`${S.id}: unmapped source polygons: ${[...unmapped].join('; ')}`);

  const index = Object.fromEntries(S.countries.map(([code], i) => [code, i]));
  for (const c of new Set(codes)) if (c && !(c in index)) throw new Error(`${S.id}: ${c} owns provinces but is not in the country list`);
  const owner = codes.map(c => c ? index[c] : -1);
  const countries = S.countries.map(([code, name, color, cap, flag]) => {
    const capital = provAt(cap[0], cap[1]);
    if (owner[capital] !== index[code]) throw new Error(`${S.id}: capital of ${code} falls in province ${capital} (${provinces[capital]?.name}) owned by ${codes[capital]}`);
    const mod = MODERN_OF[code] || (modernBy[code] ? code : undefined);
    const c = { code, name, color: color || modernBy[code].color, capital, flag: flag || code };
    if (!flagIndex[c.flag]) throw new Error(`${S.id}: no flag ${c.flag} for ${code} (run flags.mjs first)`);
    if (mod) c.modern = mod;
    return c;
  });
  // neighbours with near-identical colours
  const near = new Set();
  provinces.forEach(p => p.nbr.forEach(n => {
    const a = owner[p.id], b = owner[n]; if (a < 0 || b < 0 || a === b) return;
    const [x, y] = [hex(countries[a].color), hex(countries[b].color)];
    if (Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 40) near.add([countries[a].code, countries[b].code].sort().join('/'));
  }));
  fs.writeFileSync(path.join(OUT, `scenario-${S.id}.json`), JSON.stringify({ id: S.id, start: S.start, countries, owner }));
  console.log(`[history] ${S.id}: ${countries.length} countries, assigned by ${JSON.stringify(how)}${near.size ? ', similar neighbour colours: ' + [...near].join(' ') : ''}`);
}
