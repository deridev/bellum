# BELLUM — Game Design Document

> Status: **v0.4 draft**. We're iterating on this together. Anything marked **[OPEN]** is undecided.
> Anything marked **[REC]** is a recommendation waiting for a yes or no. See the Decision log at the bottom.

---

## 1. Pitch

**A 20th-century grand strategy game you can finish in an evening.**
It has Age of History's clarity and speed, but wars play out as *stories*: living front lines with massive troop counts, breakthroughs and encirclements, daring landings behind the lines, generals who become heroes (or stage coups), and governments that rise and fall under the pressure of war.

One-line hook: *"Every war ends in a chronicle worth reading, and a map timelapse worth sharing."*

The reference images are the target look: a satellite-style real-world map, a translucent political color, a glowing front, unit tokens massed along it, and **huge summed troop numbers for each side**.

### What we take from the references

| From | Keep | Leave behind |
|---|---|---|
| **Age of History** | Real world map, clean political colors, big troop numbers, fast turns, low barrier | Clicking 3,000 provinces, every war plays the same, blobbing with no friction, thin diplomacy, dead late game |
| **Unciv / Civ V** | Clear "what needs me this turn" flow, satisfying growth, distinct nations | Moving units one at a time in the late game, slow turns |
| **Hearts of Iron (lite)** | Fronts, armies under generals, encirclements, supply, ideologies | Division designer spreadsheets, 200 focus trees, micro of 300 divisions |
| **Reference video** | Glowing fronts, summed troop totals per side, terrain showing through the color, animated playback | — this is our north star |

---

## 2. Design pillars

1. **The map tells the story.** If you need a spreadsheet to understand what's happening, we failed. Big numbers, clear fronts, color, motion.
2. **Few decisions, big consequences.** Aim for **3–7 meaningful decisions per turn**. You command **armies and fronts**, not divisions. Busywork (supply, reinforcement, building in every province) is automated or grouped by state.
3. **Wars are stories.** Every war has a reason, goals, a front, breakthroughs, pockets, landings and a peace deal. No two wars should feel the same.
4. **Your nation fights back.** War and expansion strain stability, the economy and politics. Snowballing is fun to attempt and hard to keep.
5. **Multiplayer-first simulation.** A deterministic sim, a fair turn structure, and AI that can take any seat.

### Anti-pillars (what we will not do)
- No micromanagement of individual divisions or tiles. The **Army** is the smallest thing you normally command.
- No "conquer, repeat" loop. Occupation and annexation without legitimacy cost heavily.
- No random event spam. Events come from what is happening in the game.
- No hidden math. Every number explains itself in a tooltip ("Why is my offensive stalling?").

---

## 3. Core loop

```
 ┌──────────── PLAN (one turn) ──────────────┐
 │ Read the map → answer the Agenda (3–7     │
 │ items) → give orders to armies on fronts  │
 │ (hold / advance / offensive arrow) →      │
 │ production & budget → diplomacy           │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌──────────── RESOLVE (animated) ───────────┐
 │ Orders run in daily steps: fronts push,    │
 │ breakthroughs, pockets close, landings,    │
 │ bombing, elections, events. Shown as       │
 │ playback, exactly like the reference video │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌──────────── REACT ────────────────────────┐
 │ Battle reports, chronicle entries, new     │
 │ Agenda items (crises, offers, coups)       │
 └───────────────────────────────────────────┘
```

**The Agenda** is the backbone of "few decisions." Each turn the game lists what needs you (*"The 3rd Army is encircled at Taejon: break out or hold?"*, *"Parliament refuses the war budget"*, *"The Republic of X asks for volunteers"*). You can end the turn once the Agenda is cleared, or skip items and accept the defaults.

### 3.1 Time model (decided: prototype both)

**Turn length [REC]: 1 turn = 1 month**, resolved inside in daily steps. Peace turns go fast (you auto-ready when the Agenda is empty); war turns are where you spend your time.

Two candidate turn structures:

| | **A. Simultaneous (WEGO)** | **B. Classic sequential** (Age of History / Unciv) |
|---|---|---|
| How it works | Everyone plans, then the month resolves for all at once as an animated playback | Each nation moves in turn and sees results immediately |
| Feel | Tense, a mind game: did they reinforce where I'm attacking? | Direct and precise: I attack, I see the result, I react |
| Fronts and encirclements | Natural: both sides push at the same time, as in a real front | Awkward: one side moves a whole month while the other stands still |
| Multiplayer, 2–8 players | No waiting: everyone plans at once. Async play-by-turn works | Players wait for each other (×7 with 8 players) |
| Single player | Fine, and the playback is the payoff | Very good |
| Reference-video playback | Free: the resolution *is* the video | Has to be reconstructed |
| Risk | Can feel like losing control | Can feel static and slow, with a first-mover advantage |

**Decision: prototype both in M3 and pick by playtesting.** Leaning A (WEGO), with three fixes for the "loss of control" risk:
1. **Previews**: before ending the turn you see the expected outcome of each offensive (*"Likely gain 2–4 provinces, 60% breakthrough chance"*).
2. **Stances and conditional orders**: *"If the front breaks, fall back to the river"*. Armies react sensibly during the month.
3. **Pause-on-crisis** (single player only): playback stops when something dramatic happens (encirclement, landing, capital threatened), so you can respond right away.

The sim core resolves "a set of orders → next state." Sequential mode is the same engine resolving after each player, so both modes cost little extra to build. The front prototype already runs in daily steps with smooth playback between them, which is the WEGO resolution view.

---

## 4. The map

### 4.1 Structure
- **Real-world map**, with accurate coastlines, rivers, terrain and a satellite-style base. Procedural fictional worlds come later.
- **Province**: the smallest unit of territory. It has terrain, population, infrastructure, industry, resources, and possibly a city, port or airfield.
- **State**: a named group of provinces (e.g. *Gyeonggi*, *Bavaria*). Building focus, resources, governors and claims work at this level, which removes most clicking.
- **Target scale**: about **2,000–3,000 provinces** worldwide, denser in historically contested areas (Europe, East Asia, Middle East) and coarser in empty areas (Sahara, Siberia).
- **Sea zones** for navies, convoys and invasions.

### 4.2 Interesting boundaries
- Province shapes come from **real administrative lines and natural features**: rivers, mountain ridges, coastlines.
- **Chokepoints are first-class**: mountain passes, straits (Bosphorus, Gibraltar, Malacca), canals (Suez, Panama), major river crossings and bridges. Wars bend around them.
- **Fortified lines** (Maginot-style, the 38th parallel DMZ) appear on the map and matter.
- Rendering: national borders are thick strokes with a soft inner glow, province borders are faint, occupied land gets diagonal hatching in the occupier's color, and the front is a bright jagged line with unit tokens along it (reference image 2).

### 4.3 Modular maps and scenarios
- A **map** is a data package: base imagery, heightmap, province polygons, adjacency, rivers, sea zones and localisation.
- A **scenario** is a separate layer: date, owners, governments, armies and starting situations. The same world map supports many scenarios.
- **Starting scenarios** (decided: present day and the world wars lead):
  - **2026: Present Day** (flagship).
  - **1914: The Great War** (trenches, empires).
  - **1939: The World War** (blitzkrieg, encirclements, global fronts).
  - Later: **1950 Divided Peninsula** (already the front prototype's test case) and **1962 The Brink**.
- Accurate *at the start*; history diverges from there.
- Designed for modding from day one: a map editor and scenario editor come later.

### 4.4 Data sources (to verify licenses)
- Coastlines, rivers, admin boundaries: **Natural Earth** (public domain).
- Satellite / relief base: **NASA Blue Marble** (public domain) or Natural Earth shaded relief.
- Historical borders: these datasets need a license check (some are non-commercial). Our fallback is hand-assigning province owners per scenario, which is ownership data only and needs no border dataset.

### 4.5 Visual composition
- **Base layer**: satellite / relief terrain, slightly desaturated (as in the references).
- **Political layer**: national color at about 45–55% opacity, so terrain still shows through.
- **Country names** curve along the nation's shape and scale with its size.
- **Three zoom tiers**:
  1. *Strategic*: nations, fronts, **summed troop totals per side per theater** (reference image 2).
  2. *Operational*: armies (flag tokens), front segments, offensive arrows, supply hubs, airfields, fleets.
  3. *Local*: province detail: cities, industry, infrastructure, resources.
- **Map modes**: Political · Terrain · Supply · Industry · Ideology · Stability · Diplomacy (blocs).
- UI style: clean, modern, military-briefing feel: map pins, arrows, stencil numbers. Flat, sharp and readable.

### 4.6 Motion and feedback ("juice")
**Rule: every change in a number has a visible cause on the map.** Proven in the front prototype:
- **Smooth motion**: the map and units are drawn through the last four daily states with Catmull-Rom curves, so speed changes are smooth (no stepping between days). Playback runs a day or two behind the simulation to make this possible.
- **Uneven advances**: local friction varies across the map and drifts over about a week, so fronts surge in places and stick in others, like a real front.
- **Heat**: where both sides are in contact and the line is moving, the front glows hotter, flickers, gets battle haze, and its edge moves slightly. Quiet fronts stay calm and thin.
- **Artillery flashes and smoke** along hot stretches of front.
- **Fresh ground** shines in the winner's colour for about ten days, so you can read where the war just moved.
- **Offensive arrows are events, animated with the classic principles**:
  - *Anticipation*: when a real push starts, a stub winds back from a tail anchored in its own lines.
  - *Thrust with overshoot*: it then shoots to the front.
  - *Squash on impact*: the head squashes against the line, with a flash and a ring.
  - *The tip pushes, it doesn't follow*: the arrowhead leads the line slightly and the front bulges around it, like a finger pressed into a membrane. The press is a spring: it overshoots on impact, rides with the speed of the advance, and relaxes when the push ends. When the front is still, the arrow is still.
  - *Quiet by default*: at most two arrows per side, only for real offensives. Each is a short, darker shade of its own side's colour with a fading tail; only the head is outlined.
  - *Stretch*: the head stretches with speed, and sparks fly at the point of the push (secondary action).
  - *Arcs*: the body bends along the route the push actually took.
  - *Follow-through*: when the push stops, the head settles and the arrow drains away from the tail.
- **Units follow the same rules**: one flag per division, always kept on its own side of the line. Attacking divisions on a hot front lunge at it (pull back, thrust, squash on contact, settle), staggered so the line never pulses in sync. New divisions pop in.
- **Staging: nothing covers the front.** Troop totals sit inside each side's territory, clear of the line, the band of unit flags, city names and the HUD. They hold their spot unless a clearly better one appears, and they cross-fade rather than sweep across the map. Banners use the free strip between HUD panels (on small screens, a card over the HUD).
- **Turning points** get a cinematic banner and a small camera shake. **Cities changing hands** ripple in the new owner's colour. **Surrendering divisions** leave a white flag; broken ones a cross.
- **Troop totals** pulse when they change fast.
- Respect *reduced motion*: no shake, simpler banners. Adaptive resolution keeps the map smooth on weaker GPUs.

---

## 5. War (the heart of the game)

### 5.1 Command structure
- **Division**: the building block, but you rarely touch it directly. It shows as a token on the front.
- **Army**: a group of divisions under a **General**, the main thing you command.
- **Front / Theater**: armies assigned to a front segment. The game computes fronts from where your territory touches the enemy's.
- **Generals** are named characters with skill and traits (*Bold*, *Defensive Genius*, *Armor Pioneer*, *Beloved by the Troops*, *Politically Ambitious*). They gain experience, become famous and may turn into political players (§6.4).

### 5.2 Ground unit types (keep it small)

| Type | Good at | Weak to | Needs |
|---|---|---|---|
| **Infantry** | Holding lines, numbers, cheap | Armor in open terrain, artillery | Manpower, small arms |
| **Armor** | Breakthroughs, exploitation, encirclement | Mountains, jungle, cities, anti-tank, no fuel | Steel, **oil** |
| **Artillery** | Grinding attacks, defence | Being overrun, air attack | Steel |
| **Mechanized / Motorized** | Speed, following up armor | Expensive | Oil, trucks |
| **Special** (Marines / Airborne / Mountain) | Landings, drops, mountains | Small and costly | Training, prestige |

Equipment improves by **era** (§8.4), so "Armor" in 1914 (barely exists) differs from Armor in 1962.

### 5.3 Continuous fronts (decided, prototyped)
**Borders don't move province by province.** In the reference video the front flows like paint. We do the same: during a war, territory is a **continuous control field**, and the front is wherever control flips from one side to the other.

How it works (proven in `prototypes/front/`):
- **Control field.** A fine grid (about 4–5 km per cell in a war theater) holds a value from −1 to +1 for "who controls this ground." The **front is the zero line** of that field.
- **Armies push the field.** Each army projects **pressure** around itself. Where one side's pressure beats the other's (after terrain and defence bonuses), the front moves toward the weaker side, smoothly and at any angle. Thin lines bend, gaps become breakthroughs, and bulges form on their own.
- **The front stays smooth and believable.** The field behaves like a forced Allen–Cahn equation: cells settle firmly on one side, the front keeps a smooth shape, and tiny slivers and pockets close up naturally.
- **Pockets emerge.** Supply flows from depots and ports through your own territory. Ground (and armies) that gets cut off is hatched on the map, loses strength daily, and armies there surrender if not relieved.
- **Fronts stabilise for real reasons.** Defenders get a base bonus, terrain bonuses and **entrenchment** that grows while a stretch of front stays still. Attackers have **offensive momentum** that drains while they attack and recovers when they pause, so offensives culminate on their own (as Chinese offensives did after a week or two).
- **"Infinite resolution" rendering.** The simulation grid is coarse. The renderer samples it smoothly (bicubic) and adds a multi-scale warp, so the front is a crisp, organic line at every zoom level, and new detail appears as you zoom in. Turn on **Sim grid** in the prototype to see the 4.4 km squares underneath.

**Provinces still matter** for the economy and names. During a war, a province's output is split by how much of it each side controls, and its city or capital decides who administers it.

**Borders after a war (decided): they adapt realistically.** Most provinces come through a war unchanged; a few get cut.
- **Peace treaty**: each province goes to whoever holds most of it and its main city. Only provinces the final line really cuts through are split, and the new border follows a natural feature near the front (river, ridge, road) rather than the raw front.
- **Armistice without a treaty**: the exact front freezes as a ceasefire line or DMZ (a frozen conflict that can flare up again).
- **Afterwards**: split provinces can be reorganised into new ones over the years (an administrative-reform event), so the map slowly absorbs the war.

### 5.4 Orders on a continuous front
You don't push pixels. Each army gets:
- **Posture**: Hold, Advance or Offensive. This sets how hard it pushes, and how fast it uses up momentum and men.
- **Offensive arrow + halt line**: where to attack, and where to stop and consolidate. The prototype's history script uses exactly this to steer the war ("attack south until the 35th parallel").
- **Fallback line** (conditional order): where to retreat if the front breaks. Units that are badly outnumbered already fall back fighting on their own.

The map shows summed troop totals per side on each side of the front (*1,635,267 vs 961,920*), updating live during playback. They're visible at strategic zoom and fade out as you zoom in to the armies.

What shipped (posture per war, offensives built from the reserve, the aim readout) is described in §16.

### 5.5 Naval and air (abstracted on purpose)
- **Navies**: fleets operate in sea zones with missions: **Control**, **Convoy / Blockade**, **Support Invasion**. Battles resolve at sea-zone level.
- **Amphibious invasions**: pick a coastal province behind the enemy's lines (Inchon-style). Success depends on naval control, defenders, and Special units. It's a huge gamble with a huge payoff.
- **Air power**: air wings are assigned to a region with a mission: **Air Superiority**, **Close Air Support**, **Strategic Bombing** (industry, infrastructure) or **Interdiction** (supply). Air superiority per region shows as an icon and a bar.
- **Nuclear weapons** (late eras): huge damage and deterrence, with massive political and diplomatic cost. Nuclear powers change how everyone else plays (§7.4).

### 5.6 Supply and logistics
- Supply flows from your **capital and supply hubs** along **railways and roads**, and from **ports** by sea.
- Distance, terrain, bad infrastructure, enemy interdiction and weather (winter, monsoon, mud) reduce supply.
- Out-of-supply armies lose strength and can't attack. Overextended offensives stall naturally: the "Pusan perimeter" effect emerges from the rules.

### 5.7 War goals and peace
- Wars need a **casus belli**: claim, liberation, ideological intervention, defence of an ally, retaliation. It defines what you can demand.
- **War score** comes from battles, provinces and states held, capitals taken, pockets and blockades.
- **War support** (public opinion) falls with casualties and long wars, faster in democracies. At zero: protests, government crisis, forced peace.
- **Peace deals**: annex, create a puppet or satellite state, partition (**draw a line**, e.g. a ceasefire at the front: the 38th parallel), reparations, disarmament, regime change.
- **Ceasefire / armistice** is a real outcome: frozen conflicts and DMZs stay on the map and may flare up again.

---

## 6. Politics (real nations, selectable leaders)

**Real countries, flags and geography. Leaders are selectable per game (decided):**
- **Historical mode**: real leaders and parties at the start.
- **Fictional mode**: generated leaders, parties and ideology names on the same real map.

History is the starting point either way; politics come from the game. Fictional mode is the safe default where store rules restrict real-world extremist imagery.
- **Present day (decided)**: fictional leaders by default, because real leaders change all the time. Real leaders come as an optional data pack that can be updated without patching the game.

### 6.1 Ideology (two axes)
- **Economy**: Collective ↔ Market.
- **Authority**: Liberty ↔ Order.
- Fictional ideology names in each quadrant (e.g. *Syndicalist Union*, *National Order*, *Liberal Concord*, *Technocratic Directorate*). Ideologies **spread** through influence, propaganda, wars and economic success.

### 6.2 Government types (asymmetric play)
Each has 1–2 unique mechanics:
- **Democracy**: elections every few years, stable and productive, but war support drops fast. You can lose an election mid-war.
- **One-Party State**: no elections, high control, **purges** (stability now, weaker generals and ministers later).
- **Military Junta**: strong army, weak economy, coup-prone.
- **Monarchy** (constitutional or absolute): legitimacy from the crown, and succession matters.
- **Colonial Empire** (early scenarios): colonies give resources and manpower, and independence movements grow over time.

### 6.3 Interest groups (4 bars, not 40)
| Group | Gives you | Wants |
|---|---|---|
| **Military** | Generals' loyalty, war efficiency | Budget, glory, no humiliating peace |
| **Industry / Capital** | Production, investment | Trade, low taxes, contracts |
| **Labor** | Manpower, factory output | Wages, rights, fewer casualties |
| **Rural / Traditional** | Food, stability, conscripts | Land, tradition, low taxes |

Each has **Support** and **Power**. Powerful and unhappy groups make **demands**, then strikes, protests, coups or revolution, depending on the government type. Granting demands buys time but shifts power. This is the main internal "game".

### 6.4 Leader, cabinet and generals
- **Head of state / government**: a fictional character with traits, popularity and term limits (or none).
- **Cabinet** (5 seats): War, Finance, Foreign Affairs, Interior, Intelligence. Ministers have skills and **ambitions**.
- **Popular generals are political**: a general who wins too much may run for office, defy orders, or stage a coup. Firing a famous general costs war support. *(The Truman–MacArthur dynamic, as a mechanic.)*

### 6.5 Story events (systemic, not random)
Events come from game state:
- *"General Han's 7th Army has been encircled for 20 days. The press is asking questions."*
- *"Rationing is now in its third year. Labor is calling a general strike."*
- *"Your ally's government has fallen. The new regime is sympathetic to your enemy."*

Everything gets written into the **Chronicle** (§10).

---

## 7. Diplomacy

### 7.1 Basics
- **Opinion** (how they feel now) is separate from **Trust** (memory of how you behaved). AI remembers betrayals, broken treaties and atrocities.
- **Readable AI**: personalities (Expansionist, Isolationist, Ideologue, Opportunist…) and *visible intentions*: *"Country X is massing troops on your border."*

### 7.2 Tools
- **Treaties**: Alliance · Non-Aggression Pact · Military Access · Trade Deal · Defensive Guarantee · Puppet / Satellite.
- **Blocs**: multi-nation alliances with a leader (NATO / Warsaw Pact style, fictional names). Bloc members share intel and war entry rules.
- **Indirect war**: send **volunteers**, **lend-lease** equipment, **fund insurgents**, **back a coup**. Proxy wars are a core Cold War play, and fighting without declaring war is possible.
- **Sanctions and embargoes**: cut off oil and steel and watch an economy stall.

### 7.3 The Assembly
A fictional world body (*The Concord of Nations*). Members vote on resolutions (condemn, sanction, authorise intervention, recognise a new state). Great powers have a veto. It's a shared political arena all players compete over.

### 7.4 Multiplayer diplomacy
Free chat plus formal treaties the game enforces. Breaking a formal treaty costs Trust with *everyone*.

---

## 8. Economy (simple, spatial, meaningful)

### 8.1 National resources (keep it to four)
| Resource | From | Spent on |
|---|---|---|
| **Budget** ($) | Taxes on population and industry, trade | Upkeep, construction, lend-lease, bribes |
| **Industry** (production points) | Factories in provinces | Equipment: tanks, planes, ships, artillery |
| **Manpower** | Population × conscription law | Divisions, replacing losses |
| **Political Capital** | Stability, victories, popularity | Laws, demands, diplomacy, replacing ministers |

### 8.2 Strategic resources
Provinces produce **Oil, Steel, Rubber, Food** (later **Uranium**).
- Armor, air and navy need **oil**. A country without oil must trade, conquer or suffer.
- This gives geography a reason: the Caucasus, the Middle East, Southeast Asian rubber, Ruhr steel.
- Trade routes run through chokepoints, so closing a strait matters.

### 8.3 No per-province building spam
- Set a **Focus per State** (Industry / Agriculture / Infrastructure / Military). Governors build automatically to match it.
- **Production** is a short national queue (*"40% armor, 40% infantry equipment, 20% aircraft"*), not per factory.
- You hand-place only **Great Projects** (dams, rail lines, fortified lines, nuclear program, canals): rare, expensive, visible on the map.
- **War damage and bombing** reduce output and recover slowly.

### 8.4 Technology by era
- **5 eras**: Great War (1910s) → Interwar (1920s–30s) → World War (1940s) → Early Cold War (1950s–60s) → Modern (1970s+).
- Each era has a few **doctrine picks** (e.g. *Mobile Warfare vs Mass Assault vs Firepower*) and automatic equipment upgrades. **No 300-node tech tree.**
- Research spending goes into one budget slider.

---

## 9. Pacing and anti-boredom

The late game is where grand strategy games die. Our countermeasures:
1. **Overextension**: occupied territory needs garrisons, produces resistance, and annexing without legitimacy drains stability.
2. **World crises**: big shake-ups that change the rules for a while (*Great Depression, Pandemic, Oil Shock, Revolutionary Wave, Nuclear Crisis, Decolonisation*). Each one is a mini-campaign.
3. **Internal politics**: even a dominant player has to survive elections, coups and succession.
4. **Ideological competition**: winning a war doesn't win hearts. Ideology spreads through success, propaganda and proxy wars.
5. **Victory conditions** give a reason to finish (§11).

---

## 10. The Chronicle and Timelapse (shareable output)

- **Chronicle**: the game writes a history of your nation from what actually happened: offensives, pockets, landings, coups, elections, treaties. You can read and export it at game end.
- **Timelapse replay**: a full animated map replay of the match, with fronts, **live troop counts**, borders shifting and key events captioned. It's the reference-video look, and players can export it as a video. This is our viral loop.

---

## 11. Game modes and victory

- **Sandbox**: play until you stop.
- **Scenario objectives**, e.g. *Reunify the Peninsula*, *Win the War Before 1945*, *Lead the Dominant Bloc in 1990*, *Survive as a Neutral*.
- **Influence victory**: highest influence score at the end date (territory, economy, bloc size, ideology spread).
- **Domination**: control X% of the world's industry (rare, by design).
- **Multiplayer**: 2–8 players with AI in the other seats. Players can drop in and take an AI seat.

---

## 12. Multiplayer and technical approach (decided: Web + TypeScript + PixiJS)

- **Deterministic simulation core**: pure game logic with no rendering, seeded randomness and integer math. The same code runs on the client, the server and the AI.
- **Server-authoritative turns**: clients submit orders, the server resolves and sends the result, clients play it back. This is cheat-resistant, async-friendly and makes replays free (a replay is the seed plus orders, which also powers the Timelapse).
- **Stack**: TypeScript monorepo.
  - `packages/sim`: game rules (deterministic, unit-tested, no DOM).
  - `packages/client`: PixiJS (WebGL) map renderer and a light UI layer.
  - `packages/server`: Node and WebSocket, runs `sim`.
  - `tools/mapgen`: builds province polygons, adjacency and sea zones from Natural Earth and similar data.
- It runs in the browser (instant to share and play), and we can wrap it as a desktop app (Tauri / Electron) for Steam later.
- **Performance target**: 60 fps on a mid-range laptop with the full world map at strategic zoom.
- **Continuous fronts at world scale**: a 4.4 km grid over all land is about 7–8 million cells, too many to update every day. Plan: split the field into tiles and only simulate tiles near active fronts. Peacetime borders come from province polygons. The prototype runs one theater (36k cells) at about 7 ms per simulated day in plain JS.
- **Determinism for multiplayer**: the prototype uses floating point and is chaotic (tiny differences grow into different wars). Lockstep or replays across browsers need **fixed-point math** in the sim core. Plan for it in M2.
- **Era packs (decided: keep systems modular)**: era-specific content (unit types, doctrines, government types, events) lives in data packs over a shared core (map, control field, supply, politics, diplomacy). A medieval pack (castles, levies, sieges) should be possible later without rewriting the core.

---

## 13. Roadmap (vertical slice first)

The vertical slice is **one war, fought well**: if the flagship is 1950, the Korean peninsula plus its neighbours.

| Milestone | Goal | "Done" means |
|---|---|---|
| **M0 Design** | This doc locked to v1 | Open questions answered |
| **M1 Map** | Beautiful, readable world map | Satellite base + provinces + borders + labels + zoom tiers, 60 fps |
| **M2 Sim core** | Nations, provinces, economy, turn loop | Save/load, deterministic replay test |
| **M3 War** | Armies, fronts, offensives, pockets, supply, playback | **The reference images on screen, playable.** Prototype WEGO vs sequential and choose one. *Started early: `prototypes/front/` proves continuous fronts on Korea 1950–53* |
| **M4 Nation** | Government, interest groups, leaders, Agenda, events | A coup or lost election mid-war is dramatic |
| **M5 Diplomacy + AI** | Treaties, blocs, volunteers, Assembly, AI personalities | AI is a believable rival |
| **M6 Multiplayer** | Lobby, turns, async, drop-in | 4 friends finish a Quick game |
| **M7 Polish** | Chronicle, timelapse export, more scenarios, audio | Shareable |

---

## 14. Open questions (iterating)

1. **Next step**: another prototype round (provinces plus the peace settlement on Korea, or player-drawn offensive arrows), or start the real TypeScript foundation (M1 map: world provinces and rendering)?
2. **Naval and air depth**: abstracted (recommended) or more hands-on?
3. **Nukes**: in or out, and from which era?
4. **Platform**: browser first, Steam (desktop) later, mobile ever?
5. **Art direction**: keep the prototype's satellite-relief style, or a stylised / painted map?
6. **Sound**: the front would gain a lot from distant artillery, radio chatter and a score. In scope for the vertical slice?

## 15. Core loop review (playtests, October 2026)

We played the simulation headless with `npm run playtest` (`game/tests/playtest.ts`): one nation follows a scripted strategy for 3 to 6 years while the AI runs the rest. The strategies are passive, saver, diplomat and hawk. The table shows what broke, why it matters to a player, and what changed.

| Found in play | Why it is a problem | Change |
|---|---|---|
| A losing nation never surrendered: Ukraine and Bolivia held 0 provinces for years at war score −100 | A **dead end**: the game goes on, but there is nothing left to decide | **Capitulation**: a side gives up when its leader has lost the capital and holds ≤25% of its land, holds nothing, or is fully exhausted while losing. The winners take what they hold; a rump becomes a puppet |
| War support reached 0 and nothing happened | A meter with no consequence is noise | **Government crisis**: at ~0 the government falls (new leader, −stability, −influence). A democracy then seeks a white peace |
| The treasury only moved with the deficit, and was empty by year 2 | **Savings were a decoy**: no reason to save, nothing to spend them on | Interest comes off the top. Borrowing goes both ways: **saving** builds a treasury, and savings speed up production. A year's revenue beyond that pays down debt |
| Influence capped at 300; 2 to 4 decisions in 5 years of peace | **Peacetime is empty**: resources pile up with no use | **Policies** (§15.1): six one-off actions that spend influence or savings, with cooldowns. The AI uses the same rules |
| Armies cost nothing beyond the budget share; a rump state kept a 79-division army | Size had **no trade-off** | **Readiness** = military funds ÷ upkeep. An underfunded army caps organisation at 60–100%, and **demobilizing** reserves returns their men. The AI stands down armies it cannot pay for in peacetime |
| A player attacked an ally twice, two months after peace, and annexed freely | No friction on aggression | Breaking a **truce** now carries a heavy price for everyone (see decision 22). Attacking an ally tears up every treaty and leaves the bloc. Conquests carry **unrest**: half their output, a stability drag, core status after ~5 years. **Integrate** speeds that up |
| Alliances signed mid-war did nothing; then (first fix) half of NATO joined the Russo-Ukrainian war in month 2 | A treaty must mean something, but a world war by accident is worse | A treaty signed during a war **calls the partner in**. A country only signs if its public is ready (war support ≥ 50%) and it already hates the enemy (≤ −50). Guarantees cannot be given to a country already at war |
| A rump state kept the whole country's debt (13× GDP) | A second dead end, after defeat | Ceded land takes its **share of the debt** |
| A puppet was only a label, and the puppet player kept declaring suicidal wars | A third dead end, with no way out | A puppet's foreign policy belongs to its overlord: **no wars**. Independence returns **after 10 years**, with a banner |
| Readiness, once added, made a losing defender spiral (less land, less money, less readiness, less land) | **Positive feedback** decides wars too early | The readiness penalty is capped (organisation never below 60%), so it costs a war but never decides one |
| Unit costs were calibrated on full revenue, but taxes are collected by stability and interest is paid first | Some nations (Ukraine) started underfunded | Calibration uses the same formula as the monthly economy |

Across 10 years of AI-only play (seed 11), median debt fell from 0.48 to 0.30 of GDP. The worst case fell from 4.1 to 2.6. The lowest stability rose from 0.05 to 0.37. Repeat wars on the same victim stopped.

### 15.1 Policies
| Panel | Policy | Cost | Effect | Cooldown |
|---|---|---|---|---|
| Economy | Stimulus | 4 months of revenue | +2% output | 1 year |
| Economy | Research grant | 3 months of revenue | most of a technology level | 1 year |
| Economy | War bonds (war only) | none | 3 months of revenue now, +10% as debt, a little war support | 6 months |
| Politics | Propaganda | 30 influence | war support +12 pt | 6 months |
| Politics | Concessions | 25 influence | the unhappiest group +15 pt | 6 months |
| Politics | Integrate (needs conquests) | 40 influence | halves unrest | 1 year |

### 15.2 Known issues, not yet addressed
- In 1939, AI-only play ends the Second World War in May 1940 with a small treaty. The scenario needs war goals that keep the great powers fighting.
- Every scripted Ukraine strategy accepts or is forced into a cession within months. The front holds Kyiv, but peace comes too early for a war of attrition.

---

## 16. War review: from "click and wait" to decisions (October 2026)

A player put it plainly: *"There's no strategy. I just click start war and win or lose."* We measured it with a **war lab** (`npm run warlab -- <attacker> <defender> [days] [seeds]`). It plays the same war under several scripted players across random seeds and prints the war score after 240 days. A **strike lab** (`npm run strikelab`) saves a war mid-way and plays 45 days twice from the same moment, once with a strike and once without.

| Found in play | Why it is a problem | Change |
|---|---|---|
| Posture changed nothing: Thailand vs Myanmar ended within a few points (+10 to +18) whether the player held, advanced or went all-out | A dial with no consequence | **Hold** digs in twice as fast and loses a third fewer men; **All-out** pushes everywhere and loses a third more. Offensives are allowed under Hold |
| Aiming offensives at cities, as a player would, turned a slow win into a loss (−57, −100: Thailand conquered) | The main lever was a **trap** | An offensive took a whole army (12 divisions) from wherever it stood, so three offensives emptied the line. Now a strike force is the war's **reserve** plus nearby divisions (within 150 km of the jump-off point) |
| The best-odds strike went to an empty corner of the map, and the line it left collapsed | Odds without value | The AI (and the lab's careful player) weighs targets: a city is worth 1.8× open country, a capital 2.5×. The player judges value by looking at the map |
| An offensive aimed through neutral Afghanistan stood at the border for a month | An **invisible failure** | A strike needs a way over land. One aimed across the sea or a neutral country is refused, with the reason |
| A breakthrough cut a thin tongue, then its divisions went home and the salient shrank back | Gains melted | Divisions stay to hold what they took, worn out (organisation × 0.55). The corridor is 130 km wide |
| Ground taken did not move the war score until a province's capital fell | Cause and effect were hidden | The score counts the **share of each province** held, and whole divisions lost in pockets |
| A strike nearly reached Kyiv, 220 km away, in seven weeks | Too fast to answer | An offensive reaches **150 km** at most; a deeper objective takes several pushes, with a pause between them |
| 40 of Russia's 110 divisions never fought, and the old balance relied on it | A hidden rule | **Commitment** is the share of the army a war gets. Four fifths hold the line and one fifth waits as its reserve. Reserves join your offensives and **rush to meet the enemy's** (6 for every 10 attackers), so the reserve is both sword and shield. Only new divisions refill it. Russia's 60% is now scenario data |
| Nothing said whether an attack would work | The player could not plan | While aiming, a **dashed arrow** shows the jump-off point and the objective, rings mark the divisions that would go, and the hint bar gives the verdict ("Breakthrough likely · 9 divisions against 3 · defence ×1.8 · 2.4 : 1") |

**After** (Thailand vs Myanmar, 240 days, mean of 4 seeds): idle −6, All-out everywhere −8, sharp strikes (only at 1.5 : 1 or better, one at a time) +5, Total commitment with sharp strikes **+14**, reckless (All-out, Total, offensives at cities) +10 at half again the losses, the AI +13. Within a single seed the outcome now ranges over 64 points depending on how the war is played. Before, every strategy but the trap ended within a few points of the others.

The AI uses the same tools and the same rules: it strikes at 1.4 : 1 or better (1.8 on a front where it is weaker), with one offensive per 25 divisions on a front, three at most.

### 16.1 Known issues
- Iran vs Pakistan is a mountain stalemate whatever the player does. Believable, but such a war needs another way out.
- The AI sets its posture front by front; the player sets one for the whole war, which costs them on fronts where they are weaker.
- A small country's reserve is small (a fifth of its commitment), so most of its strike force comes from the line around the jump-off point.

## 17. Armies you command (October 2026)

After §16 the verdict was still *"almost no gameplay; Age of History does this better."* The reason: the player never commanded anything. Armies existed (12 divisions under a general) but were bookkeeping. Their divisions were scattered over random border provinces, and the AI shuffled them one by one. The player's inputs were a posture dial and an occasional offensive. Age of History's loop is direct: pick up an army, see its number, move it, attack with it.

**What the player does now**
- **Armies are markers on the map**: a flag, the number of divisions, a strength bar, and an arrow while attacking. Click one to pick it up; its name shows above it.
- **With an army picked up, the next click is its order**, previewed live as the pointer moves:
  - **Our ground within 80 km of the front**: hold the front there, spread along it. Further back: wait there in reserve.
  - **Enemy ground**: attack. The hint bar gives the verdict and the odds for that army ("Will stall · 12 divisions against 25 · defence ×1.8 · 0.4 : 1"). The whole army attacks, coming by rail if it is far, and reaches 150 km at most.
  - **One of our provinces in peacetime**: station it there. An army stationed at the border goes straight to that front when war comes, so you can build up before you declare.
- **Enemy divisions are gathered into red markers** where they mass, so you can see where a blow is coming.
- **The War panel lists your armies** (what each is doing, size, strength); a click picks one up and pans to it. The Military desk's armies do the same.
- **Reports**: an army's attack ends with a log line ("4th Army reached its objective, 140 km deep" or "ran out of momentum after 30 km").

**What the generals do (for every side, the AI's and the player's)**
- Armies stay together: an army is stationed in one province, and new divisions join an army waiting where they are raised (or form a new one).
- When a war opens, the generals **split the front between the armies**: each takes one stretch, in the order the armies stand, its divisions spread along it. Every week the line is **re-balanced** (closer together where the enemy presses), and at once whenever an army leaves it or rejoins it. Armies under the player's orders keep them.
- Free armies at home are sent whole to the weakest front, and rush to meet an enemy offensive.

**Found while building it**
| Found | Change |
|---|---|
| An idle player whose armies each held only their own stretch collapsed (Thailand −116k km² in 45 days): nothing answered the enemy's concentration | The generals' weekly line, weighted by enemy pressure |
| The weekly line, given only to the player, was far better than the AI's one-by-one shuffling: an idle player conquered Myanmar | The same line for every side (decision 31) |
| Organisation fell below zero out of supply, turning a starved army's strength negative: it pushed the front against itself | Organisation never drops below zero |
| A division re-anchoring as the front advanced left its general's line for good | It keeps its mode |
| The war lab's scripted commander, attacking every five days into empty ground, built a long salient and was encircled | Kept: over-extension is a real mistake. A careful commander does better |

**Measured** (war lab, 240 days, mean of 4 seeds; the player attacks):

| Strategy | Thailand vs Myanmar | Iran vs Pakistan |
|---|---|---|
| The AI plays | +43 | +73 |
| Idle (generals only) | +80 | +26 |
| Careful army attacks (cities or 2 : 1, rest between) | +50 | +37 |
| Reckless army attacks (every 5 days at 1.5 : 1) | −50 | +58 |

Wars are now more decisive and swing more, and how a war is commanded changes how it ends in both directions. Single runs range from +100 to −100. The Ukraine checks still hold: Kyiv holds and Ukraine keeps two thirds of its land in the first year, on the mean of three seeds (one seed swings ±15 points with the random stream, so the test checks the mean). Ukraine is now fully mobilised in the scenario (95%).

### 17.1 Known issues
- The army marker sits at the centre of its divisions; an army spread along a long stretch shows as one point.
- Thailand's idle player (+80) still does better than the AI playing it (+43): the AI's offensives use its line badly.
- There is no splitting or merging of armies yet, and no naval transport of armies.

## 18. Army options and easier orders (October 2026)

Feedback on §17: *"a better combat flow; with easier UX and more options per unit this could be perfected."*

**Easier orders**
- **Drag an army's marker** to where it should go; the preview follows the pointer, and letting go gives the order.
- **Right-click** gives an order too. After any order **the army stays picked up**, so orders can be chained; Esc, the card's ×, or a click on the sea puts it down.
- **Tab / Shift+Tab** picks up the next or previous army and brings it into view.
- **Drop an army on another** of yours to merge them.
- The War panel's separate "Plan an offensive" tool is gone: one way to attack (an army), not two.

**The army card** (shown while an army is picked up, above the dock)
- The army, what it is doing, its general with skill stars and traits (each trait says what it does in battle).
- What it is made of (divisions by type) and three meters: **strength**, **organisation**, **supply**.
- The order at the pointer: hold, wait, station, or attack with verdict and odds.
- Actions, each with a key: **To the line** (L, back under its general), **Reserve** (R, pull back 100–160 km behind the front to wait; it then answers enemy offensives), **Split** (S, the second half forms a new army under a new general), **Division** (N, raise an infantry division for this army; it joins the army at the front by rail when ready).

**Generals matter** (for every side): skill 1–4 moves an army's strength by up to ±6%. Traits: Bold +12% attacking; Cautious −10% attacking and −20% losses; Reckless +8% strength and +25% losses; Defensive genius +12% holding; Armor pioneer +15% for armour and mechanised; Mountain expert +15% in rough ground; Logistician +15% supply; Beloved by the troops: organisation recovers 50% faster. The other traits are character only. So which army attacks and which holds is a choice.

### 18.1 Known issues
- Merging has no size limit, and a split always halves.
- A division raised for an army is always infantry.

## 19. Great powers are strong (October 2026)

Feedback: *"Countries are too weak. I can destroy the USA investing just a little bit in an army."*

| Found | Why | Change |
|---|---|---|
| A US infantry division costs the USA $3.6B; a Mexican one costs Mexico $0.41B. They fought alike (technology adds only 5% a level) | A dollar of Mexican army bought nine times the fighting power of an American one | **Equipment**: each country's divisions fight at +12% for each doubling of the money behind a division, against the world's median division (×0.7 to ×1.6). USA ×1.48, Germany ×1.43, China ×1.18, Mexico ×1.11, Iran ×0.82, North Korea ×0.7. Shown on the army card and the Military desk; it counts in ultimatums and AI war decisions too |
| The AI kept at most two divisions in training, so the USA, with $43B a month to spare, grew by about ten divisions a year | A rich AI could not spend its budget | The AI trains as many at once as its spare funds sustain, up to 12 |
| At war the AI's military budget rose only to about 1.6× its peacetime share (the 1939 USA: 7% to 17%) | The world's largest economy never became an army | A nation that is attacked, or losing, **mobilises**: at least 45% of spending goes to the military |
| A division whose spot in the line fell to the enemy kept marching to it, into the enemy | Defenders walked into encirclements | It holds where it stands |
| When an offensive struck, the defending line re-balanced only at the week's end | | The defending generals re-balance toward the blow at once |

Ukraine's divisions fight with Western-supplied equipment: the 2026 scenario gives Ukraine Russia's equipment level, which keeps that war's calibration.

A new balance test plays the reported case: Mexico builds for six months with its spare funds, then attacks the USA, and must be losing four months later. In the war lab Mexico loses to the USA every time (2026 and 1939), whether it holds or attacks.

### 19.1 Known issues
- Equipment is fixed when the world is made; raising the military budget buys more divisions, not better ones.
- Even wars now tend to tip: once a side starts losing whole divisions, it rarely recovers.

## 20. A finished game: ends, world wars, the sea, crises, a guide (October 2026)

Feedback: *"Fix everything is weak and incomplete. Finish the game."*

| Missing | Change |
|---|---|
| A game never ended: no way to win or lose | **Victory and defeat** (§11 made real). Win by *domination* (a quarter of the world's output), by winning your era's *great war* (1914, 1939), or by being the *first power* at the end date (20 years for 2026, 12 for the historical scenarios). Lose by being annexed. An end screen gives the reason, your record and the top five powers, with *play on*, *watch*, *read the chronicle* and *new game*. Power = 0.5 share of world output + 0.3 army + 0.2 population. The Ledger overview opens with the goals: the domination bar, your rank, the great war |
| The world wars ended when one country fell: 1939 stopped with Poland, and a treaty at war score 93 ended the war for the whole alliance | **Total war.** The two world wars are fought to the end. A nation whose capital falls makes a **separate peace** while its allies fight on: it loses what the enemy holds, and becomes a puppet of whoever holds its capital. A side with more than one member accepts no treaty until it is exhausted (85%) |
| Wars across the sea could not be fought: the USA could not reach Cuba, Britain could not reach France | **Landings.** Order an army onto an enemy coast (or anywhere an attack cannot reach). The odds come from the sea power of each side (GDP × military share × equipment, coastal nations only), the enemy divisions within 150 km and marines; the voyage takes 4 days plus a day per 500 km. The odds are shown before the order. A landing that succeeds holds a beachhead, which supplies the army like a port. One that fails comes home at 60% strength. The AI lands too, when it rules the sea and has no front to fight on |
| Peace was quiet: nothing happened to the world that the player had to answer | **World crises**: a recession, an oil shock, a pandemic, a revolutionary wave (only in non-democracies with low stability). In 2026 one comes about every four years at random; 1914 gets the 1918 pandemic. Each crisis cuts growth for a year or more and asks the player to choose between two answers: a stimulus that adds debt or austerity that costs stability, for example. Each answer changes how hard the crisis bites. The AI chooses too |
| A new player was shown the map and nothing else | **A first-game guide**: six short steps, each pointing at the part of the screen it explains (the clock, the nation's resources, the dock, the map, the armies, how to win). It can be skipped and replayed from the menu |

### 20.1 Known issues
- There is no navy to build or command: sea power comes from the economy, the military budget and equipment.
- Multiplayer (§12) is not built. It needs a server, and the game ships as a single page.

## 21. Something is always happening (October 2026)

Feedback: *"Boring."*

Measured before the change, with a passive player:

| Scenario | What happened |
|---|---|
| 2026, Brazil, 2 years | 2 decisions and 2 news items for the player in two years. In the world, no war at all in years 5–7 |
| 1914 | The Great War over in two months: Austria-Hungary fell in seven weeks, then Germany signed a treaty on a stale war score with its army whole. Then four years without a war |
| 1939 | Germany never invaded the Soviet Union and the United States never entered. A ceasefire in 1942 |

| Change | How |
|---|---|
| **Decisions** | 15 more events, each asking for a choice with a cost either way: an election coming, a general strike, a foreign investor, an arms offer, spies, a breakthrough, troops on the border, separatists, drought, a summit, a trade dispute, chaos in a neighbouring country, corruption, a grand project, the press, hosting the games. The player's events come 2.5× as often, and after 50 quiet days the next one that fits comes for sure |
| **Missions** | The player always has up to three national goals: grow the economy, build the army, reach a technology level, sign a trade deal, win an ally, take back lost land, restore order, cut debt, save, overtake a rival. Each comes as a choice between two, has a deadline and a reward; a mission that runs out costs 2 stability. Shown at the side of the map and in the Ledger |
| **Uprisings** | A nation annexed in the game can rise again while its land is unsettled (about five years), most often when the conqueror is unstable or at war: it takes back its provinces with a militia and fights a war of independence. Twice at most |
| **Rivalries build** | Neighbours far apart in ideology grow colder over the years (not two democracies, not bloc partners), and nations resent whoever holds their land. Up to five AI wars at once (was three) |
| **History's timeline** | 1914: the Ottomans (Oct 1914), Italy (May 1915), Bulgaria (Oct 1915), Romania (Aug 1916), the United States (Apr 1917) enter; revolution takes Russia out (Nov 1917). 1939: Germany strikes through the Low Countries (May 1940), Italy enters (Jun 1940), Barbarossa (from Jun 1941, once the West is won), Pearl Harbor (Dec 1941). Each happens only if the world still allows it; when it is the player's nation, the player decides on a card |
| **The great wars hold** | The war score is recomputed when a member makes a separate peace, and the last member of a side gives in only when worn out. Before 1918 trenches dig in 2.2× deeper and faster. Period equipment for the great armies (Germany 1914 ×1.3, Russia ×0.78; Germany 1939 ×1.35, Soviet Union ×0.8) and period army sizes (Austria-Hungary 1914, Germany 1939) |
| **Generals keep their fronts** | A nation's line covers its own fronts (within 350 km of its soil) and weighs its own soil three times; a weekly re-balance never sends a division across the theater. Before, German armies marched for weeks between France and Galicia while the front collapsed |
| **Railheads** | The big cities of a side's homeland supply the fronts near them (0.9, 500 km): armies far from the capital are no longer starved at their own border |
| **Homelands, not empires** | A nation surrenders when its capital and three quarters of its homeland (1000 km around the capital) are taken; colonies no longer keep it fighting. In a world war every member is checked, so Belgium and the Netherlands fall in 1940 |

After, with a passive player: about 8 decisions a year (events and missions). Over four seeds the Great War lasts 2 to 2.7 years with every entry on its date, and the Second World War 2 to 5 years.

### 21.1 Known issues
- France has only three home provinces on this map and Paris rarely falls, so the West in 1940 usually becomes a long front and Barbarossa often never comes.
- The Entente won the Great War in every seed tried; the Central Powers can win only with a player's help.
- The 2026 world still has quiet years (about 1.3 AI wars a year).

## 22. Regions around cities (October 2026)

Question: *"Do we still use states as provinces (Rio Grande do Sul) instead of Porto Alegre and the bigger cities?"*

Provinces were Natural Earth states, merged where small: Brazil had 27. Now a big state with several cities is cut into one region per city, the land nearer to that city than to the state's other cities:

| Rule | Value |
|---|---|
| States that can be cut | 15,000 km² or more |
| Cities that seed a region | 150,000 people or more, or a state or national capital of 50,000 or more |
| Cities closer than 80 km | count once (Canoas and Novo Hamburgo belong to Porto Alegre) |
| Regions per state | at most 14 |
| Names | the region takes its city's name; the state is kept, shown under it ("Porto Alegre · Rio Grande do Sul") and used by scenario data |

Rio Grande do Sul is now Porto Alegre, Caxias do Sul, Pelotas, Santa Maria and Passo Fundo. Brazil has 80 provinces, Germany 25, the United States 150, the world 2,821 (was 1,928). Empty states stay whole (Amazonas, Goiás).

Two data fixes came with it:
- Islands no longer count against a country's province budget when small units are merged: before, France's overseas islands used it up and mainland France was one province.
- Natural Earth repeats some city names with a big city's population on a village far away (Natal and Vila Velha in the Amazon); of same-named places, only the most prominent counts, and copies with identical population are dropped.

The 1914 and 1939 owners are assigned as before (by each region's label point); an override that names a state covers all its regions.

### 22.1 Known issues
- Region borders are straight lines between cities, not real county lines.
- Merged groups (French départements, for example) have no state to show.

---

## 23. History that holds (critic round 3, October 2026)

A harsh critic played round 3 and rejected it at 7/10. Three things were wrong; everything else was polish.

**1914 ran backwards.** France advanced into Germany, Belgium was never invaded, and the war ended in mid-1917. Causes, and what changed:

| Cause | Change |
|---|---|
| Every front started fully dug in, so nobody moved in 1914 | 1914 opens as a war of movement: the trench-era defence (now ×1.8) and the half-speed fronts build up over the first 100 days |
| The French and German armies both massed on one point near Luxembourg | Historical deployments: Germany's right wing at Aachen, France's Plan XVII in Lorraine, the British at Mons |
| The Franco-German border was open ground | It is a line of fortresses on both sides (Metz–Strasbourg, Verdun–Belfort); only Belgium is open |
| Each general spread its divisions along the whole front in proportion to the enemy, so Germany's western mass drained east | A war plan: the German staff weights the West ×9 until 1919 (`war.plan`) |
| Every allied nation answered an offensive with 60% of the attackers, Russia included | The side answers once (60% in all), nearest nations first; capitals over 1,500 km away keep their reserves |
| A side outnumbered overall went to Hold, which also weakened its own offensives | Inside an offensive's corridor the attack is always all-out |
| Attacking divisions spread 22 km apart | They mass at half that |
| Aircraft gave the Entente a 25% edge in 1914 | Before 1918 air power counts a quarter |
| Tanks, mechanized and airborne divisions in 1914 | Unit types arrive in their years: armour 1917, marines 1920, mechanized 1930, airborne 1936 |

The opening is history's: two days in, each German army nearest Liège, Namur and the Ardennes strikes. **Breakthroughs** follow when the opening battle is won: if Germany holds Liège between days 18 and 40, Brussels falls and the Belgians fall back on Antwerp and the Yser; if it then holds Namur by day 60, the Great Retreat takes the Allies to the Aisne. A breakthrough claims the ground, the beaten armies fall back in disorder (organisation halved), the victors move up into the new line and dig in. If the defence holds the key point, nothing happens.

A smaller member of a world war fights on while any of its homeland is free, and in the trench war (before 1918) while its army is still in the field: Belgium never capitulated. On 11 November 1918 (checked monthly to June 1919) the Central Powers ask for an armistice if they are losing (score −20, exhaustion 0.6) or worn out (exhaustion 0.85, not clearly winning). A German player gets it as a peace offer.

**1939: an idle Germany collapsed** to a Polish uprising. Uprisings now never break out while the conqueror's troops stand on the land or while it fights a world war; the militia is sized by population (a division per 1.5 million, 1–12); an uprising war can only win its own freedom, never the conqueror's land. Fall Gelb and Barbarossa got breakthroughs too (Sedan → the Channel → Paris → the armistice, which ends France's war; Minsk → Smolensk and Kyiv), counted from the day the invasion began, so a player who answers the card late is not cheated.

An engine bug surfaced: a new front of a war could get its own theater **overlapping** an existing one. Two fields on the same ground meant a Soviet army walked through an empty copy of Germany. A new front now enlarges the theater it touches (if the union fits 44°×30°) or is clipped to keep clear of it, and a theater never grows into another. Armies are sent only to fronts within 2,500 km of home or on their own land (the far ones only when there is no other): no more Soviet divisions in Lagos.

**Peacetime 2026 was thin.** Ambitious AIs go to war more often (about 3 new wars a year), not for two years after a world war; events come more often (one every month). The savings mission says what it takes ("Borrowing at −6%") and leaves 24 months.

Smaller fixes: claims cost 35 influence plus 4 per province of the target (up to 155); every town of a homeland supplies what is near it (250 km, 75%), so armies at the border no longer starve; a sum of money never breaks across lines; place names in Brazilian Portuguese (Stuttgart, Nuremberg, Bonn, Rouen) and compass names say what they are ("Província Oriental"); fewer flags on crowded fronts.

### 23.1 Known issues
- Breakthroughs are scripted on the historical lines; a player who wins the opening some other way gets no breakthrough of their own.
- The Entente slowly pushes the 1914 front back east over 1915–17 in most runs.

---

## Decision log
| # | Date | Decision |
|---|---|---|
| 1 | 2026-10-18 | **Setting: modern / 20th century** (replaces the medieval v0.1 draft) |
| 2 | 2026-10-18 | **Map: real, accurate world map first**; procedural worlds later |
| 3 | 2026-10-18 | **Tech: Web, TypeScript + PixiJS** |
| 4 | 2026-10-18 | **Time model: prototype both** WEGO and sequential, pick by playtest (§3.1) |
| 5 | 2026-10-18 | **Scenarios: present day and the world wars lead** (§4.3) |
| 6 | 2026-10-18 | **Leaders: real and fictional, selectable per game** (§6) |
| 7 | 2026-10-18 | **Medieval: not now, but systems stay modular (era packs)** (§12) |
| 8 | 2026-10-18 | **Fronts are continuous**, not province-based: control field + zero-line rendering (§5.3). Proven in `prototypes/front/` |
| 9 | 2026-10-18 | **Post-war borders adapt realistically**: most provinces survive intact, only those cut by the final line split; armistice freezes the front as a DMZ (§5.3) |
| 10 | 2026-10-18 | **Present day defaults to fictional leaders**; real leaders as an updatable opt-in pack (§6) |
| 11 | 2026-10-18 | **Motion and feedback rules** (§4.6), proven in the front prototype |
| 12 | 2026-10-18 | **Localization: English, Brazilian Portuguese, Spanish.** The simulation emits message keys, never text; country names come from the browser's region names, historical ones from our dictionaries |
| 13 | 2026-10-18 | **Historical scenarios reuse the modern provinces**: each is assigned to its 1914 or 1939 owner from historical-basemaps (GPL-3.0, licence to confirm before shipping); population and output come from regional period tables |
| 14 | 2026-10-18 | **The simulation stays on the main thread** with a per-frame time budget (fronts only update near the line). A web worker would mean every panel talking to the world by message; revisit if late-game wars get slow |
| 15 | 2026-10-18 | **No dead ends**: every losing, broke or subject state has a way forward (capitulation, debt follows land, puppets regain independence after 10 years). Found by headless playtests (§15) |
| 16 | 2026-10-18 | **Every meter has a consequence**: war support at zero topples the government; an army beyond its budget loses readiness. Penalties that feed back on themselves are capped |
| 17 | 2026-10-18 | **Peacetime has things to do**: savings and influence buy one-off policies with cooldowns. The AI plays by the same rules (§15.1) |
| 18 | 2026-10-18 | **Treaties mean what they say**: allying with a nation at war joins its war, so only publics ready for that war sign; attacking an ally tears up every treaty |
| 19 | 2026-10-18 | **Reading screens get the screen**: Economy, Politics, Military and Diplomacy open as a two-column desk over the dimmed map. Panels about a place (province, country, war) stay on the right, beside the map they describe |
| 20 | 2026-10-18 | **Show the money**: the Economy desk lists next month's flow from the current settings (taxes in; interest, each budget line and production from savings out; the treasury change). Every net figure uses the same calculation as the simulation |
| 21 | 2026-10-18 | **Conscription is a trade-off**: a law sets the recruit pool, and drafting workers costs growth (extensive −0.5%, total −1.5% a year). The desk explains the law you point at |
| 22 | 2026-10-18 | **Freedom over gates**: any nation can declare war at any time, on anyone, truce or not. The price restrains it: stability (more when the public is against it), war support (a just cause rallies, an unprovoked war starts under doubt, and at zero the government falls), world opinion, and sanctions from the victim's trading friends. Breaking a truce doubles the outrage; a puppet attacking its overlord fights a war of independence |
| 23 | 2026-10-18 | **Ultimatums**: demand a border province (your claims first). A neighbour too weak to resist, allies counted, hands it over; one that refuses gives you a claim, so the war for it is justified. The AI issues them only with a grievance, and the player answers them as decision cards (ignoring one is refusing it) |
| 24 | 2026-10-18 | **The HUD never moves on its own**: top-bar cells take fixed shares of the bar and the date box is sized for the widest date, so changing numbers never shift the layout. The map shows no hover under HUD elements |
| 25 | 2026-10-18 | **War is played with three levers that trade off**: posture (dig in or push), commitment (a thick line or a big reserve) and offensives (where and when to strike). Each was measured to change outcomes in the war lab (§16) |
| 26 | 2026-10-18 | **Offensives are built from the reserve**: reserves come by rail and add force; nearby divisions join; nothing is pulled from distant sectors. An offensive reaches 150 km, needs a way over land, and leaves its divisions worn out where they stopped |
| 27 | 2026-10-18 | **Reserves answer offensives**: the side being attacked sends its free reserve to meet the blow, for the AI and the player alike |
| 28 | 2026-10-18 | **Show the odds before the click**: aiming shows the strike force, the defenders, their defence multiplier and a verdict; the War panel shows the line and the reserve |
| 29 | 2026-10-18 | **The war score follows the front**: it counts the share of each province held and divisions lost outright, so every kilometre gained shows |
| 30 | 2026-10-18 | **The player commands armies directly**: pick up a marker, click to hold, wait, station or attack, with a live preview and odds. The front stays continuous; armies are what the player moves on it (§17) |
| 31 | 2026-10-18 | **Generals follow the same rules on every side**: armies stay whole, share out the front, re-balance it weekly and when an army leaves or rejoins it. The player's edge comes only from the orders they give |
| 32 | 2026-10-18 | **Peacetime positioning matters**: armies are stationed in a province, and an army at the border goes to that front when war comes |
| 33 | 2026-10-18 | **One way to attack: with an army.** Orders by click, right-click or drag; the army stays picked up; Tab cycles armies; each action on the army card has a key (§18) |
| 34 | 2026-10-18 | **Generals have effects in battle**, small and stated on the card (skill ±6%, traits up to ±25%), the same for the AI |
| 35 | 2026-10-18 | **Money buys quality as well as numbers**: equipment from the money behind each division (×0.7–×1.6); attacked nations mobilise; the AI spends what it has (§19) |
| 36 | 2026-10-18 | **Every game ends**: domination, the era's great war, or the first power at the end date; defeat when annexed. The player may play on (§20) |
| 37 | 2026-10-18 | **The world wars are total**: fallen nations make separate peace; alliances accept no treaty until exhausted |
| 38 | 2026-10-18 | **The sea is crossed by landings, not fleets**: odds from sea power, defenders and marines, shown before the order; beachheads supply like ports |
| 39 | 2026-10-18 | **Crises ask for a choice**: four kinds, two answers each, the same rules for the AI |
| 40 | 2026-10-18 | **The player is never left without a decision for long**: events come often and a quiet spell ends with one; missions give direction (§21) |
| 41 | 2026-10-18 | **The world changes by itself**: annexed nations rise again, rivalries build, history's timeline brings nations into the great wars |
| 42 | 2026-10-18 | **A nation's generals defend its own fronts first**; railheads supply the homeland; nations surrender when their homeland falls, not their empire |
| 43 | 2026-10-19 | **Provinces are regions around cities**: big states with several cities are cut into nearest-city regions (§22) |
| 44 | 2026-10-19 | **History's great breakthroughs are moments, conditional on the battle that opens them** (Liège, Sedan, Minsk); the field engine handles the rest (§23) |
| 45 | 2026-10-19 | **Two theaters of one war never cover the same ground**; armies go to fronts near home |
