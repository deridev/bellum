// Score seeds against historical checkpoints. Usage: node score-seeds.js from to
globalThis.window = globalThis;
require('../region.js'); require('../sim.js');
const { Sim, N, GW, CELL, dayOf } = BellumSim;
const [from, to] = [+process.argv[2] || 1, +process.argv[3] || 10];
function front(sim) { let landN = 0, land = 0, minN = 99, maxS = 0;
  for (let k = 0; k < N; k++) if (sim.main[k]) { land++; const lat = sim.lat[k]; if (sim.c[k] > 0) { landN++; if (lat < minN) minN = lat; } else if (lat > maxS) maxS = lat; }
  return { nHeld: landN / land, minN, maxS }; }
const checks = [ // date, test(front, sim) -> penalty
  ['1950-07-20', f => Math.max(0, f.minN - 36.6)],          // Taejon falls
  ['1950-09-10', f => Math.max(0, f.minN - 35.8)],          // Pusan perimeter
  ['1950-09-10', f => Math.max(0, 35.0 - f.minN) * 2],      // ...but it holds
  ['1950-10-10', f => Math.max(0, f.nHeld - 0.25) * 10],    // North collapses
  ['1950-11-20', f => Math.max(0, 40.5 - f.maxS)],          // UN near the Yalu
  ['1951-01-20', f => Math.abs(f.minN - 37.1)],             // Chinese push south of Seoul
  ['1951-04-01', f => Math.abs(f.maxS - 38.3) * 0.5],
  ['1952-06-01', f => Math.abs(f.nHeld - 0.5) * 8],
  ['1953-07-20', f => Math.abs(f.nHeld - 0.5) * 8 + Math.max(0, f.maxS - 38.9) + Math.max(0, 37.8 - f.minN)],
];
for (let seed = from; seed <= to; seed++) {
  globalThis.REGION.seed = seed; const sim = new Sim(globalThis.REGION);
  let pen = 0; const notes = [];
  for (const [date, fn] of checks) { const d = dayOf(date); while (sim.day < d) sim.step(); const f = front(sim); const p = fn(f, sim); pen += p; notes.push(p.toFixed(1)); }
  const men = sim.stats.men.map(v => Math.round(v / 1000));
  console.log(`seed ${seed} score ${pen.toFixed(2)} [${notes.join(' ')}] men ${men}`);
}
