# BELLUM — Game Design Document

> Status: **v0.1 draft**. We're iterating on this together. Anything marked **[OPEN]** is undecided.
> Anything marked **[REC]** is a recommendation waiting for a yes or no.

---

## 1. Pitch

**A grand strategy game you can finish in an evening.**
It has Age of History's clarity and speed, but wars play out as *stories*: fronts you can read at a glance, castles that have to be besieged, named commanders who become legends or traitors, and a realm whose nobles push back.

One-line hook: *"Every war ends in a chronicle worth reading, and a map timelapse worth sharing."*

### What we take from the references

| From | Keep | Leave behind |
|---|---|---|
| **Age of History** | Clean political map, instant readability, low barrier, big troop numbers, fast turns | Clicking 300 provinces, every war plays the same, blobbing with no friction, thin diplomacy, dead late game |
| **Unciv / Civ V** | Clear "what needs me this turn" flow, satisfying growth, varied civs | Moving one unit per tile in the late game, slow turns |
| **CK / EU (lite)** | Characters, succession, vassals, casus belli, coalitions | Spreadsheet complexity, 40 mana bars |
| **Reference video (the images)** | Fronts as glowing lines, big summed troop counts per side, terrain showing through the color, animated playback | Modern-war framing (unless we pick that era, see §12) |

---

## 2. Design pillars

1. **The map tells the story.** If you need a spreadsheet to understand what's going on, we failed. Big numbers, clear fronts, color, motion.
2. **Few decisions, big consequences.** Aim for **3–7 meaningful decisions per turn**. Busywork (supply, recruitment queues, building in every province) is automated or grouped by region.
3. **Wars are stories.** Every war has a reason (casus belli), goals, a front, decisive battles, sieges, and a peace deal. No two wars should feel the same.
4. **Your realm fights back.** Growth creates internal pressure: nobles, succession, unrest. Snowballing is fun to attempt and hard to keep.
5. **Multiplayer-first simulation.** A deterministic sim, a fair turn structure, and AI that can take any seat.

### Anti-pillars (what we will not do)
- No micro-management of individual soldiers or tiles.
- No "conquer, repeat" loop. Conquest without claims costs heavily at home.
- No random event spam. Events come out of what is happening in the game.
- No hidden math. Every number explains itself in a tooltip ("Why does Aradon hate me?").

---

## 3. Core loop

```
 ┌──────────── PLAN (one season) ────────────┐
 │ Read the map → answer the Agenda (3–7     │
 │ items) → give orders to hosts → set       │
 │ regional focus → diplomacy                 │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌──────────── RESOLVE (animated) ───────────┐
 │ All players' orders run at the same time   │
 │ in daily steps: marches, battles, sieges,  │
 │ raids, harvest, events. Shown as playback  │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌──────────── REACT ────────────────────────┐
 │ Battle reports, chronicle entries, new     │
 │ Agenda items (demands, deaths, offers)     │
 └───────────────────────────────────────────┘
```

**The Agenda** is the backbone of "few decisions." Each turn the game lists what needs you (*"Siege of Varn: assault or wait?"*, *"The Nobility demands a charter"*, *"Your heir is of age: arrange a marriage?"*). You can end the turn once the Agenda is cleared, or skip items and accept the defaults.

### Time model [REC]
- **1 turn = 1 season** (Spring, Summer, Autumn, Winter). Seasons matter: campaigning season, harvest, winter attrition.
- **Simultaneous turns ("WEGO")**: everyone plans, then the turn resolves for everyone at once. This works the same in single player, live multiplayer (with a turn timer), and async play-by-turn.
- Inside a turn, the sim runs in ~90 daily steps. Hosts follow **stances** (Aggressive / Cautious / Hold) so they react sensibly between your orders.
- Match lengths: **Quick** ≈ 40 years (160 turns, about 1 hour), **Standard** ≈ 80 years, **Epic** = full scenario.

---

## 4. The map

### 4.1 Structure
- **Province**: the smallest unit you own. It has terrain, population, prosperity, one settlement (village / town / city) and possibly a **castle**.
- **Land**: a named group of 3–8 provinces (e.g. *Normandy*). Claims, regional focus and governors work at this level, which removes most clicking.
- **Target scale**: about **400–600 provinces** on a Europe-sized map. That's fewer than Age of History, but each one matters more.

### 4.2 Interesting boundaries
Borders should come from geography, not random blobs:
- Provinces are generated from **heightmap + rivers + coastlines**: watersheds, river valleys, mountain ridges.
- **Chokepoints are first-class**: mountain passes, river fords, bridges, straits. Wars bend around them.
- **Marches**: frontier provinces with a special status (more castles, less tax, more levies).
- Rendering: realm borders are thick painted strokes with a soft inner glow, province borders are faint, occupied land gets diagonal hatching, contested areas shimmer.

### 4.3 Modular maps
- A map is a **data package**: heightmap, province polygons, rivers, JSON definitions, localisation. A **scenario** (who owns what, characters, start date) is a separate layer on top of a map.
- A **procedural world generator** makes fictional continents with plausible geography.
- A **map editor** comes later. The format is designed for modding from day one.

### 4.4 Visual composition
- **Base layer**: relief / satellite-style terrain, desaturated (as in the reference images).
- **Political layer**: realm color at about 50% opacity, so terrain still shows through.
- **Realm names** curve along the realm's shape and scale with its size (EU-style).
- **Three zoom tiers**:
  1. *Strategic*: realms, fronts, summed troop totals per side (the reference-image look).
  2. *Operational*: hosts, castles, sieges, roads, passes.
  3. *Local*: province detail, buildings, population.
- **Map modes**: Political · Terrain · Economy · Unrest · Diplomacy · Religion.
- **Procedural heraldry**: every realm and dynasty gets a generated coat of arms, used on banners, unit tokens and UI.
- UI style: ink and parchment, but sharp and modern in layout. Not "brown medieval mush".

---

## 5. War (the heart of the game)

### 5.1 Hosts and commanders
- A **Host** is an army led by a **Commander**, a named character with skill and traits (*Cautious*, *Reckless*, *Siege Master*, *Beloved by the Men*…).
- **5 troop types** with light rock-paper-scissors:

| Type | Good at | Weak to | Needs |
|---|---|---|---|
| Levies | Numbers, cheap | Everything | Population (and noble goodwill) |
| Men-at-arms | Holding ground, sieges | Archers in the open | Iron, gold |
| Knights | Shock charges on open ground | Spears, forest, marsh, mud | Horses, nobility |
| Archers / crossbows | Attrition, defence | Cavalry that reaches them | Wood / yew |
| Siege engines | Breaking walls | Being caught in the field | Gold, engineers |

- **Mercenary companies** are hired with gold. They're fast to get, expensive to keep, and may switch sides if unpaid.

### 5.2 Fronts (the reference-image moment)
You don't draw fronts. **The game computes them** from territory control and each host's zone of control, and renders them as glowing lines with **summed troop counts per side per theater**. You command hosts; the front is the readable result. Zoomed out, a war looks like your reference images.

### 5.3 Battles
When hosts meet:
1. **Pre-battle choice**: each commander picks a **tactic** (*Shieldwall, Feigned Retreat, Flank Through the Woods, Hold the Hill, Charge*). Traits and terrain decide which tactics are available. It's a hidden simultaneous pick, a small mind game and the only "micro".
2. **Resolution in phases**: Skirmish → Melee → Pursuit / Rout. It depends on numbers, composition against terrain, commander, morale, supply, and the tactic matchup.
3. **Battle report card**: a 10–20 second animated tactical diagram (blocks moving across terrain, as in history-channel battle maps), plus casualties, captured nobles, and a chronicle line.

Captured nobles and commanders can be **ransomed**. That's a big medieval money-maker and a diplomatic lever.

### 5.4 Sieges, not province painting
- **Owning land means holding its castle or city.** Field armies win battles; **sieges win wars**.
- Siege options: **Starve** (slow, cheap), **Assault** (fast, bloody), **Negotiate surrender** (costs gold or prestige), **Bribe the garrison** (needs a spymaster).
- **Relief armies** turn sieges into battles. Castles make borders sticky and fronts stable, which ends the "paint the whole map in 5 turns" problem.

### 5.5 Supply, seasons, raiding
- Hosts **forage** from the land they stand in. Large hosts starve poor land. **Winter** means attrition unless the host is quartered.
- **Raiding (chevauchée)**: burn the enemy's land to cut their tax, food and war support. Raiding just before harvest is devastating, and it angers *their* peasants and nobles.

### 5.6 War goals and peace
- Wars need a **casus belli** (claim, holy war, revenge, succession, liberation…). It defines what you can demand.
- **War score** comes from battles, sieges, occupation, raids and captured nobles. **War exhaustion** grows on both sides and pushes toward peace.
- **Peace deals** are bounded by the war goal: land, gold, vassalage, a marriage, a hostage, release of prisoners.
- **Aggression** (taking land without claims) raises **coalition risk** among neighbours.

### 5.7 Feudal levies (key tension)
Raising levies **borrows** men from your nobles and peasants:
- Raised during harvest → lower food.
- Kept raised too long → nobles' loyalty drops.
- Lost in battle → nobles' power drops (which can be good or bad for you).

---

## 6. Politics (fictional, character-driven)

### 6.1 Ruler and dynasty
- Your **ruler** is a character with age, traits, skills and health. **Rulers die.** **Succession law** decides the heir, and contested successions cause civil wars.
- **Dynasty**: marriages, heirs, claims. Your bloodline continues across rulers; the realm may not.

### 6.2 Estates (4 bars, not 40)
| Estate | Gives you | Wants |
|---|---|---|
| **Nobility** | Knights, levies, commanders | Privileges, land, low taxes, glory |
| **Clergy** | Legitimacy, literacy, stability | Tithes, holy wars, influence |
| **Burghers** | Gold, trade | Charters, peace on trade routes |
| **Peasantry** | Food, levies | Low taxes, no raids, no famine |

Each estate has **Loyalty** and **Power**. High power with low loyalty means **demands**, then **revolts**. Granting demands buys time but shifts power. This is the main internal "game".

### 6.3 Council
Five seats: **Marshal, Steward, Chancellor, Spymaster, Chaplain**. Each is held by a character with skill and **ambition**. A great marshal who wins too many battles may start to look like a better king…

### 6.4 Government types (asymmetric starts)
Each has 1–2 unique mechanics, so playing them feels different:
- **Feudal Kingdom**: vassals and levies, the default.
- **Merchant Republic**: elected doge, trade posts, mercenary-heavy armies.
- **Tribal / Clan**: raiding economy, no castles, fast and fragile.
- **Theocracy**: no dynasty, piety as a resource, can call holy wars.
- **Empire**: elector vassals, great prestige, constant internal politics.

### 6.5 Story events (systemic, not random)
Events are triggered by **what's happening in the game**, not by dice alone:
- *"Your marshal has won three battles. The nobles whisper his name."*
- *"The siege of Varn has lasted two winters. The garrison is eating rats."*
- *"Your queen's brother rules the realm you just invaded."*

Everything gets written into the **Chronicle** (see §10).

---

## 7. Diplomacy

- **Opinion** (how they feel now) is separate from **Trust** (memory of how you behaved). AI **remembers** betrayals, broken treaties and war crimes (sacking cities, executing prisoners).
- **Treaties**: Alliance · Non-Aggression · **Royal Marriage** · Vassalage · Tribute · Military Access · Trade Pact · Hostage Exchange.
- **Royal marriage is the core medieval tool**: it gives alliances and *claims*. Marry well and you may inherit a kingdom without a single battle.
- **Coalitions** form against aggressive expanders.
- **A supranational institution** (fictional, e.g. *The Holy See of Aurel* or *The High Synod*) can excommunicate rulers, call crusades and crown emperors. It's a shared political arena that all players compete over.
- **Multiplayer**: free chat plus formal treaties the game enforces. Breaking a formal treaty costs Trust with *everyone*.
- **Readable AI**: AI has a personality (Ambitious, Pious, Greedy, Honorable…) and *visible intentions*: *"Aradon is massing troops on your border."*

---

## 8. Economy (simple, spatial, meaningful)

### 8.1 Resources (keep it to four)
| Resource | From | Spent on |
|---|---|---|
| **Gold** | Taxes, trade, ransoms, plunder | Mercenaries, buildings, bribes, upkeep |
| **Food** | Farmland, by season (harvest in autumn) | Population growth, armies; shortages cause famine and unrest |
| **Manpower** | Population and estates | Levies, men-at-arms |
| **Prestige** | Victories, marriages, piety, monuments | Pressing claims, granting titles, diplomacy, demands |

### 8.2 Strategic goods
Some provinces produce **goods** (horses, iron, yew, salt, wool, wine, spices, silver). Goods unlock troop types (no horses, no knights) and feed **trade routes**. That gives geography a reason: *"we need the iron hills of Kessel."*

### 8.3 No per-province building spam
- You set a **Focus per Land** (Agriculture / Trade / Military / Faith). Governors build automatically to match it.
- You hand-place only **Great Works** (cathedrals, castles, universities, harbors): rare, expensive, visible on the map.
- **Devastation** from war and raids reduces output and recovers slowly. War has lasting costs.

---

## 9. Pacing and anti-boredom

The late game is where grand strategy games die. Our countermeasures:
1. **Overextension**: more land means more estate pressure, more claimants, more distance penalties.
2. **Crises**: big mid-game shake-ups that change the rules for a while (*Great Plague, Steppe Horde invasion, Schism, Little Ice Age famine, Peasant Revolt wave*). Each crisis is a mini-campaign.
3. **Succession**: even a dominant player has to survive the death of their ruler.
4. **Victory conditions** give a reason to finish (see §11).

---

## 10. The Chronicle and Timelapse (shareable output)

- **Chronicle**: the game writes a history of your realm from what actually happened: battles, sieges, marriages, betrayals, deaths. You can read and export it at game end.
- **Timelapse replay**: a full animated map replay of the match, with fronts, troop counts, borders shifting and key events captioned. It's the reference-video look, and players can export it as a video. This is our viral loop.

---

## 11. Game modes and victory

- **Sandbox**: play until you stop.
- **Scenario objectives**, e.g. *Unite the Kingdom*, *Be Crowned Emperor*, *Survive the Horde*, *Hold the Holy City*.
- **Prestige victory**: highest dynasty prestige at the end date.
- **Domination**: control X% of the map's castles (rare, by design).
- **Multiplayer**: 2–8 players with AI in the other seats. Players can drop in and take an AI seat.

---

## 12. Setting [OPEN]

The text points to **medieval**, but the reference images are **20th-century** (Korean War). Options:
- **A. Medieval only** (≈1000–1450). This is what the systems above are built for. [REC]
- **B. Era-spanning** (medieval → modern, like Age of History). Much bigger scope; every system needs an era version.
- **C. Medieval first, modern as a later expansion**, reusing the map and the front tech.

Historical and fictional:
- **Historical scenarios** (e.g. 1066, 1204, 1337) with accurate starting realms and rulers. History is accurate *at the start* and diverges from there.
- **Fictional worlds** (procedural continents, fictional realms, religions and the Synod). Politics are fictional in both modes; the systems generate the stories.

---

## 13. Multiplayer and technical approach [REC]

- **Deterministic simulation core**: pure game logic with no rendering, seeded randomness and integer math. The same code runs on the client, the server and the AI.
- **Server-authoritative WEGO turns**: clients submit orders, the server resolves and sends the result, clients play it back. This is cheat-resistant, async-friendly and makes replays free (a replay is the seed plus orders).
- **Proposed stack**: TypeScript monorepo.
  - `packages/sim`: game rules (deterministic, unit-tested).
  - `packages/client`: rendering with PixiJS (WebGL) and a light UI layer.
  - `packages/server`: Node and WebSocket, runs `sim`.
  - `tools/mapgen`: builds province polygons and adjacency from heightmaps.
- It runs in the browser (instant to share and play), and we can wrap it as a desktop app (Tauri / Electron) for Steam later.

---

## 14. Roadmap (vertical slice first)

| Milestone | Goal | "Done" means |
|---|---|---|
| **M0 Design** | This doc locked to v1 | Open questions answered |
| **M1 Map** | Beautiful, readable map | Terrain + provinces + borders + labels + zoom tiers, 60 fps |
| **M2 Sim core** | Realms, provinces, economy, seasons, turn loop | Save/load, deterministic replay test |
| **M3 War** | Hosts, movement, battles, sieges, fronts | **One war feels great.** The reference-image look on screen |
| **M4 Realm** | Characters, succession, estates, Agenda, events | A ruler dies and it's dramatic |
| **M5 Diplomacy + AI** | Treaties, marriages, coalitions, AI personalities | AI is a believable rival |
| **M6 Multiplayer** | Lobby, WEGO turns, async, drop-in | 4 friends finish a Quick game |
| **M7 Polish** | Chronicle, timelapse export, scenarios, audio | Shareable |

---

## 15. Open questions (iterating)

1. Setting: medieval only, era-spanning, or medieval first? (§12)
2. Time model: WEGO seasonal turns, real-time with pause, or classic sequential turns? (§3)
3. Maps: real-world historical first, procedural fictional first, or both? (§4.3, §12)
4. Tech stack: web TypeScript, Godot, or Unity? (§13)
5. Battle depth: is "tactic pick + animated report" enough, or do you want an optional playable tactical battle?
6. Characters: how deep? CK-lite (ruler, heirs, council) or just ruler + commanders?
7. Target platform: browser, desktop (Steam), mobile?
8. Art direction: satellite relief (like the references) or painted / illustrated map?

## Decision log
| # | Date | Decision |
|---|---|---|
| — | — | *(none yet)* |
