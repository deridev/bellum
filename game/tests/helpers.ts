import fs from 'node:fs';
import path from 'node:path';
import type { MapStatic } from '../src/sim/types';
const D = path.resolve(__dirname, '../public/data');
export function loadStatic(): MapStatic {
  const j = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
  return { provinces: j('provinces.json'), countries: j('countries.json'), cities: j('cities.json'), dem: new Uint8Array(4096 * 2048), demW: 4096, demH: 2048 };
}
