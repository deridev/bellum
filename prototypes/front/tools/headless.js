// Run the 1950–53 script headless and print how the front moves.
// Usage: node prototypes/front/tools/headless.js [days] [every]
const path = require('path');
globalThis.window = globalThis;
require(path.join(__dirname, '../region.js'));
require(path.join(__dirname, '../sim.js'));
const { Sim, dateStr, unproj, GX0, GY0, CELL, GW, GH, N } = globalThis.BellumSim;
const days = +process.argv[2] || 1130, every = +process.argv[3] || 15;
const t0 = Date.now();
if (process.argv[4]) globalThis.REGION.seed = +process.argv[4];
const sim = new Sim(globalThis.REGION);
console.log('init ms', Date.now() - t0, 'kor cells', sim.kor.reduce((a, b) => a + b, 0));
let logI = 0; const t1 = Date.now();
function frontInfo() {
  let landN = 0, land = 0, minLatN = 99, maxLatS = 0, pk = 0;
  for (let k = 0; k < N; k++) if (sim.kor[k]) {
    land++; const lat = 43.2 - (Math.floor(k / GW) + 0.5) * CELL;
    if (sim.c[k] > 0) { landN++; if (sim.main[k] && lat < minLatN) minLatN = lat; } else if (sim.main[k] && lat > maxLatS) maxLatS = lat;
    if (sim.pocket[k]) pk++;
  }
  return `N-held ${(100 * landN / land).toFixed(0)}%  southmost N ${minLatN.toFixed(2)}  northmost S ${maxLatS.toFixed(2)}  pocket cells ${pk}`;
}
for (let d = 0; d < days; d++) {
  sim.step();
  while (logI < sim.log.length) { const e = sim.log[logI++]; if (e.kind !== 'event' || 1) console.log('   ', dateStr(e.day), '|', e.text); }
  if (d % every === 0) {
    const m = sim.stats.men.map(v => Math.round(v / 1000) + 'k');
    const units = [0, 0]; sim.units.forEach(u => units[u.side]++);
    console.log(dateStr(sim.day).padEnd(12), `men N ${m[0]} S ${m[1]} units ${units}  `, frontInfo(), ' cas', sim.stats.cas.map(v => Math.round(v / 1000) + 'k'), 'cap', sim.stats.cap.map(v => Math.round(v / 1000) + 'k'));
  }
}
console.log('ms/day', ((Date.now() - t1) / days).toFixed(2));
