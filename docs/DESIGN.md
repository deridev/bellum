# BELLUM — Game Design Document

> Status: **v0.2 draft**. We're iterating on this together. Anything marked **[OPEN]** is undecided.
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

### 3.1 Time model [OPEN]

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

**Recommendation: A (WEGO)**, plus three fixes for the "loss of control" risk:
1. **Previews**: before ending the turn you see the expected outcome of each offensive (*"Likely gain 2–4 provinces, 60% breakthrough chance"*).
2. **Stances and conditional orders**: *"If the front breaks, fall back to the river"*. Armies react sensibly during the month.
3. **Pause-on-crisis** (single player only): playback stops when something dramatic happens (encirclement, landing, capital threatened), so you can respond right away.

The sim core resolves "a set of orders → next state." Sequential mode is the same engine resolving after each player, so **we can build both in the M3 prototype and pick one by playtesting**.

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
- **Starting scenarios** [OPEN, pick 1 flagship]:
  - **1914**: The Great War (trenches, empires).
  - **1936**: The Gathering Storm (ideologies, a world war on the horizon).
  - **1950**: Divided Peninsula (the Korean War, the reference images, the early Cold War).
  - **1962**: The Brink (Cold War, proxies, nuclear standoff).
  - **2026**: Present Day.
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

### 5.3 Fronts and offensives (the reference-image moment)
Each army on a front gets one of three orders:
- **Hold**: defend, dig in (entrenchment builds over time).
- **Advance**: push along the whole segment, slow and steady.
- **Offensive**: draw **one arrow** to a target. The army concentrates force there to try a **breakthrough**.

Combat happens on front segments every day of the turn. Outcome depends on numbers, unit mix against terrain, general, supply, air superiority, entrenchment, morale, river crossings and weather.

**Breakthroughs and encirclements** are the big moments. Push through, and armor exploits behind the lines. If the line closes behind enemy armies, they become a **pocket**: out of supply, losing strength daily, and forced to surrender if not relieved. Pockets show on the map as a red ring with a countdown.

The map shows summed troop totals per side per front (*1,635,267 vs 961,920*), updating live during playback.

### 5.4 Naval and air (abstracted on purpose)
- **Navies**: fleets operate in sea zones with missions: **Control**, **Convoy / Blockade**, **Support Invasion**. Battles resolve at sea-zone level.
- **Amphibious invasions**: pick a coastal province behind the enemy's lines (Inchon-style). Success depends on naval control, defenders, and Special units. It's a huge gamble with a huge payoff.
- **Air power**: air wings are assigned to a region with a mission: **Air Superiority**, **Close Air Support**, **Strategic Bombing** (industry, infrastructure) or **Interdiction** (supply). Air superiority per region shows as an icon and a bar.
- **Nuclear weapons** (late eras): huge damage and deterrence, with massive political and diplomatic cost. Nuclear powers change how everyone else plays (§7.4).

### 5.5 Supply and logistics
- Supply flows from your **capital and supply hubs** along **railways and roads**, and from **ports** by sea.
- Distance, terrain, bad infrastructure, enemy interdiction and weather (winter, monsoon, mud) reduce supply.
- Out-of-supply armies lose strength and can't attack. Overextended offensives stall naturally: the "Pusan perimeter" effect emerges from the rules.

### 5.6 War goals and peace
- Wars need a **casus belli**: claim, liberation, ideological intervention, defence of an ally, retaliation. It defines what you can demand.
- **War score** comes from battles, provinces and states held, capitals taken, pockets and blockades.
- **War support** (public opinion) falls with casualties and long wars, faster in democracies. At zero: protests, government crisis, forced peace.
- **Peace deals**: annex, create a puppet or satellite state, partition (**draw a line**, e.g. a ceasefire at the front: the 38th parallel), reparations, disarmament, regime change.
- **Ceasefire / armistice** is a real outcome: frozen conflicts and DMZs stay on the map and may flare up again.

---

## 6. Politics (real nations, fictional politics) [REC]

**Real countries, flags and geography; fictional leaders, parties and ideology names.** History is the starting point and politics come from the game. This avoids glorifying real dictators and is safer for store rules in some countries. [OPEN: confirm]

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

---

## 13. Roadmap (vertical slice first)

The vertical slice is **one war, fought well**: if the flagship is 1950, the Korean peninsula plus its neighbours.

| Milestone | Goal | "Done" means |
|---|---|---|
| **M0 Design** | This doc locked to v1 | Open questions answered |
| **M1 Map** | Beautiful, readable world map | Satellite base + provinces + borders + labels + zoom tiers, 60 fps |
| **M2 Sim core** | Nations, provinces, economy, turn loop | Save/load, deterministic replay test |
| **M3 War** | Armies, fronts, offensives, pockets, supply, playback | **The reference images on screen, playable.** Prototype WEGO vs sequential and choose one |
| **M4 Nation** | Government, interest groups, leaders, Agenda, events | A coup or lost election mid-war is dramatic |
| **M5 Diplomacy + AI** | Treaties, blocs, volunteers, Assembly, AI personalities | AI is a believable rival |
| **M6 Multiplayer** | Lobby, turns, async, drop-in | 4 friends finish a Quick game |
| **M7 Polish** | Chronicle, timelapse export, more scenarios, audio | Shareable |

---

## 14. Open questions (iterating)

1. **Time model**: WEGO (recommended) or classic sequential? Or build both in M3 and decide by playtest? (§3.1)
2. **Flagship scenario**: 1914, 1936, **1950** (matches your references), 1962 or present day? (§4.3)
3. **Real vs fictional people**: real countries with fictional leaders, parties and ideology names (recommended)? Or real historical leaders? (§6)
4. **Naval and air depth**: abstracted (recommended) or more hands-on?
5. **Nukes**: in or out, and from which era?
6. **Platform**: browser first, Steam (desktop) later, mobile ever?
7. **Art direction**: satellite base (like the references) or a stylised / painted map?
8. **Your original "medieval battles" idea**: dropped entirely, or a future scenario pack on the same engine?

---

## Decision log
| # | Date | Decision |
|---|---|---|
| 1 | 2026-10-18 | **Setting: modern / 20th century** (replaces the medieval v0.1 draft) |
| 2 | 2026-10-18 | **Map: real, accurate world map first**; procedural worlds later |
| 3 | 2026-10-18 | **Tech: Web, TypeScript + PixiJS** |
| 4 | 2026-10-18 | Time model: undecided between WEGO and sequential (§3.1) |
