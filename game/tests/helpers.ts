import fs from 'node:fs';
import path from 'node:path';
import type { MapStatic } from '../src/sim/types';
import { execFileSync } from 'node:child_process';
const D = path.resolve(__dirname, '../public/data');
export function loadStatic(): MapStatic {
  const j = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
  // decode rasters with sharp in a child process (synchronous for test setup)
  const dec = (f: string, ch: number) => Buffer.from(execFileSync(process.execPath, ['-e', `require('sharp')(process.argv[1]).raw().toBuffer().then(b=>process.stdout.write(b))`, path.join(D, f)], { maxBuffer: 1 << 30, cwd: path.resolve(__dirname, '..') }));
  const pr = dec('provraster.png', 3), dem3 = dec('dem.png', 1);
  const n = 4096 * 2048, provRaster = new Uint16Array(n), dem = new Uint8Array(n);
  const prCh = pr.length / n, demCh = dem3.length / n;
  for (let i = 0; i < n; i++) { provRaster[i] = pr[i * prCh] + pr[i * prCh + 1] * 256; dem[i] = dem3[i * demCh]; }
  return { provinces: j('provinces.json'), countries: j('countries.json'), cities: j('cities.json'), dem, demW: 4096, demH: 2048, provRaster };
}
