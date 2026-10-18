// Flag atlas: every game country's flag rasterised to 48x32 cells in one PNG + index JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/data');
const countries = JSON.parse(fs.readFileSync(path.join(OUT, 'countries.json'), 'utf8'));
const FW = 48, FH = 32, COLS = 16, rows = Math.ceil(countries.length / COLS);
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
await sharp({ create: { width: COLS * FW, height: rows * FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png().toFile(path.join(OUT, 'flags.png'));
fs.writeFileSync(path.join(OUT, 'flags.json'), JSON.stringify({ w: FW, h: FH, index }));
console.log('[flags]', countries.length, 'flags', (fs.statSync(path.join(OUT, 'flags.png')).size / 1024).toFixed(0) + 'KB');
