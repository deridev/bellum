// Flag atlas: every game country's flag rasterised to 48x32 cells in one PNG + index JSON,
// followed by the historical-scenario flags (keys 'h:...', used by history.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/data');
const countries = JSON.parse(fs.readFileSync(path.join(OUT, 'countries.json'), 'utf8'));
// Historical flags for the 1914/1939 scenarios (simplified, drawn on a 48x32 canvas), appended after the modern ones.
const bands = (cols, vertical = false) => cols.map((c, i) => vertical ? `<rect x="${48 * i / cols.length}" width="${48 / cols.length + 0.5}" height="32" fill="${c}"/>` : `<rect y="${32 * i / cols.length}" width="48" height="${32 / cols.length + 0.5}" fill="${c}"/>`).join('');
const rays = (cx, cy, n, col) => Array.from({ length: n }, (_, k) => { const a = (k * 2) * Math.PI / n, b = (k * 2 + 1) * Math.PI / n, R = 80;
  return `<path d="M${cx},${cy} L${(cx + R * Math.cos(a)).toFixed(1)},${(cy + R * Math.sin(a)).toFixed(1)} L${(cx + R * Math.cos(b)).toFixed(1)},${(cy + R * Math.sin(b)).toFixed(1)}Z" fill="${col}"/>`; }).join('');
const star = (cx, cy, r, col) => `<path d="${Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.4 : r; return `${k ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`; }).join('')}Z" fill="${col}"/>`;
const unionJack = '<svg width="24" height="16" viewBox="0 0 60 30" preserveAspectRatio="none"><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" stroke="#c8102e" stroke-width="2"/><path d="M30,0V30M0,15H60" stroke="#fff" stroke-width="10"/><path d="M30,0V30M0,15H60" stroke="#c8102e" stroke-width="6"/></svg>';
const HISTORIC = {
  'h:GER': bands(['#000', '#fff', '#dd0000']),
  'h:AUH': '<rect width="24" height="32" fill="#c8102e"/><rect y="10.7" width="24" height="10.7" fill="#fff"/><rect x="24" width="24" height="10.7" fill="#ce2939"/><rect x="24" y="10.7" width="24" height="10.7" fill="#fff"/><rect x="24" y="21.3" width="24" height="10.7" fill="#477050"/><rect x="23.5" width="1" height="32" fill="#a08030"/>',
  'h:ITA': bands(['#009246', '#fff', '#ce2b37'], true) + '<rect x="19" y="10" width="10" height="12" fill="#0b3a8c"/><rect x="20" y="11" width="8" height="10" fill="#ce2b37"/><rect x="23" y="11" width="2" height="10" fill="#fff"/><rect x="20" y="15" width="8" height="2" fill="#fff"/>',
  'h:MNE': bands(['#c40308', '#1d5e91', '#fff']),
  'h:CAN': `<rect width="48" height="32" fill="#c8102e"/>${unionJack}<path d="M32,11h9v6c0,3-2,5-4.5,6c-2.5-1-4.5-3-4.5-6z" fill="#e8c040"/>`,
  'h:ZAF1914': `<rect width="48" height="32" fill="#c8102e"/>${unionJack}<circle cx="36.5" cy="17" r="5" fill="#fff"/><circle cx="36.5" cy="17" r="3" fill="#2f7a3a"/>`,
  'h:ZAF1939': bands(['#e8752a', '#fff', '#002395']),
  'h:JPN': `<rect width="48" height="32" fill="#fff"/>${rays(20, 16, 16, '#bc002d')}<circle cx="20" cy="16" r="7" fill="#bc002d"/>`,
  'h:CHN1914': bands(['#de2910', '#ffcc00', '#3b6fc4', '#fff', '#000']),
  'h:TIB': `<rect width="48" height="32" fill="#1b3d8f"/>${rays(24, 20, 12, '#c8102e')}<path d="M8,32L24,18L40,32Z" fill="#fff"/><circle cx="24" cy="15" r="4" fill="#ffcc00"/><path d="M0,0H48V32H46V2H2V32H0Z" fill="#ffcc00"/>`,
  'h:MNG1914': '<rect width="48" height="32" fill="#f2c230"/><circle cx="24" cy="10" r="3.5" fill="#c8102e"/><rect x="21.5" y="15" width="5" height="11" fill="#c8102e"/>',
  'h:IRN': bands(['#239f40', '#fff', '#da0000']) + '<circle cx="24" cy="16" r="4" fill="#e0a020"/>',
  'h:AFG1914': '<rect width="48" height="32" fill="#000"/><circle cx="24" cy="16" r="8" fill="none" stroke="#fff" stroke-width="2"/><rect x="21" y="13" width="6" height="6" fill="#fff"/>',
  'h:THA1914': '<rect width="48" height="32" fill="#d0202a"/><ellipse cx="24" cy="15" rx="10" ry="6" fill="#fff"/><rect x="16" y="18" width="3" height="7" fill="#fff"/><rect x="29" y="18" width="3" height="7" fill="#fff"/><path d="M33,13L37,22H35L32,15Z" fill="#fff"/>',
  'h:ETH': bands(['#078930', '#fcdd09', '#da121a']),
  'h:EGY': '<rect width="48" height="32" fill="#006c35"/><circle cx="20" cy="16" r="8" fill="#fff"/><circle cx="22.5" cy="16" r="7" fill="#006c35"/>' + star(30, 10, 2.5, '#fff') + star(32, 16, 2.5, '#fff') + star(30, 22, 2.5, '#fff'),
  'h:IRQ': bands(['#000', '#fff', '#007a3d']) + '<path d="M0,0L14,10.7V21.3L0,32Z" fill="#ce1126"/>' + star(5, 12, 2.5, '#fff') + star(5, 20, 2.5, '#fff'),
  'h:YEM': '<rect width="48" height="32" fill="#c8102e"/><path d="M8,21H38L41,22.5L38,24H8Z" fill="#fff"/>' + [14, 19, 24, 29, 34].map((x, k) => star(x, k % 2 ? 11 : 14, 2.2, '#fff')).join(''),
  'h:SOV': '<rect width="48" height="32" fill="#cc0000"/>' + star(9, 4, 2, '#ffd700') + '<path d="M6.5,9.5A4.5,4.5 0 1 0 12.5,8" fill="none" stroke="#ffd700" stroke-width="1.4"/><path d="M6.5,14.5L12,9" stroke="#ffd700" stroke-width="1.6"/>',
  'h:YUG': bands(['#0c4076', '#fff', '#c6363c']),
  'h:MAN': '<rect width="48" height="32" fill="#f2c230"/><rect width="18" height="3" fill="#c8102e"/><rect y="3" width="18" height="3" fill="#1d4ea0"/><rect y="6" width="18" height="3" fill="#fff"/><rect y="9" width="18" height="3" fill="#000"/>',
};
const FW = 48, FH = 32, COLS = 16, rows = Math.ceil((countries.length + Object.keys(HISTORIC).length) / COLS);
const dir = path.join(ROOT, 'node_modules/flag-icons/flags/4x3');
const EXTRA = { KOS: 'xk', SOL: 'so', CYN: 'cy', SAH: 'eh', PSX: 'ps' };
const composites = [], index = {};
for (let i = 0; i < countries.length; i++) {
  const c = countries[i]; const iso = (EXTRA[c.code] || (c.iso2 && c.iso2 !== '-99' ? c.iso2 : '')).toLowerCase();
  const file = path.join(dir, `${iso}.svg`);
  const x = (i % COLS) * FW, y = Math.floor(i / COLS) * FH;
  index[c.code] = [x, y];
  const input = fs.existsSync(file) ? await sharp(fs.readFileSync(file), { density: 96 }).resize(FW, FH, { fit: 'fill' }).png().toBuffer()
    : await sharp({ create: { width: FW, height: FH, channels: 4, background: c.color } }).png().toBuffer();
  composites.push({ input, left: x, top: y });
}
for (const [i, [key, svg]] of Object.entries(HISTORIC).entries()) {
  const k = countries.length + i, x = (k % COLS) * FW, y = Math.floor(k / COLS) * FH;
  index[key] = [x, y];
  composites.push({ input: await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}" viewBox="0 0 48 32">${svg}</svg>`)).png().toBuffer(), left: x, top: y });
}
await sharp({ create: { width: COLS * FW, height: rows * FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png().toFile(path.join(OUT, 'flags.png'));
fs.writeFileSync(path.join(OUT, 'flags.json'), JSON.stringify({ w: FW, h: FH, index }));
console.log('[flags]', countries.length, '+', Object.keys(HISTORIC).length, 'historical flags', (fs.statSync(path.join(OUT, 'flags.png')).size / 1024).toFixed(0) + 'KB');
