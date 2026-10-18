# Front Lab: continuous front prototype

A playable test of Bellum's core war tech: **fronts that move like paint**, not province by province. It replays the Korean War (June 1950 to the July 1953 armistice) on a real map, with the front simulated, not scripted.

## Run it

Open `index.html` in a browser with WebGL2, or serve the folder:

```sh
cd prototypes/front && python3 -m http.server 8000   # then open http://localhost:8000
```

Controls: drag to pan, scroll or pinch to zoom, space to pause, **G** to show the simulation grid.
Tools: add a division for either side, stage an amphibious landing, start a new war with different dice, or break the armistice and keep playing.

## How it works

| File | What it does |
|---|---|
| `sim.js` | Simulation. Territory is a control field on a 140×256 grid (≈4.4 km cells). The front is the field's zero line. Armies push the field with pressure; terrain, entrenchment, supply, momentum and halt lines decide where it moves. Pure JS, runs in Node too. |
| `render.js` | WebGL2 renderer. Samples the coarse field with bicubic filtering plus a multi-scale warp, so the front stays a crisp organic line at any zoom. Bakes terrain relief on the GPU at startup. |
| `app.js` | Loop, camera, unit tokens, troop totals, HUD. |
| `region.js` | Natural Earth 1:10m coastlines (public domain), clipped to the region. |
| `tools/headless.js` | Runs the whole war in Node and prints the front's position every N days: `node tools/headless.js 1130 30 [seed]` |
| `tools/score-seeds.js` | Scores seeds against historical checkpoints (Pusan Perimeter, Inchon, Chinese offensive, stalemate). Seed 7 is the default replay. |

The script only adds forces and sets each side's posture and halt line ("attack south until the 35th parallel"). Where the front goes, pockets, and who surrenders all come out of the simulation, so other seeds can tell a different war.

## Known limits

- Floating-point and chaotic: the same seed can diverge between browser engines. The real game needs fixed-point math for multiplayer.
- One theater only. World scale needs tiled, active-area simulation (see `docs/DESIGN.md` §12).
- Terrain relief is procedural (hand-placed ranges plus noise), not real elevation data.
