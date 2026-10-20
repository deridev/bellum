import { stepDay } from '../sim/step';
import type { Division, LogEntry, MapStatic, War, World } from '../sim/types';
import { createWorld, rel } from '../sim/world';
import { initSim } from '../sim';
import { setupScenario, tablesFor } from '../sim/scenario';
import { km, project, unproject } from '../geo';
import type { Session } from './session';
import { createStore } from './store';
import { TheaterLayer } from '../render/theaters';
import { aimVerdict, WarFx } from './warfx';
import { armyName, countryName, provName, say, t } from '../i18n';
import { acceptsPeace, activeWars, allied, declareWar, makePeace, sideOf, theatersOf, travelDays, tripWear, whereNow, type PeaceTerms } from '../sim/war/war';
import { strikeOdds } from '../sim/war/ai';
import { armyWhere, mergeArmies, orderArmy, releaseArmy, reserveArmy, splitArmy, deployIdleArmies } from '../sim/war/armies';
import { queueUnit } from '../sim/economy';
import { levelOf } from '../sim/buildings';
import { landingPlan } from '../sim/war/landing';
import { guideSeen } from '../ui/Guide';
import { prefs } from './settings';
import { monthlyMissions } from '../sim/missions';
import { cellOf, provAtLonLat, work, type Theater } from '../sim/war/theater';
import { diploOdds, doDiplo, type DiploAction } from '../sim/diplomacy';
import { loadScenario, staticFor } from './scenarios';
import { audio, type Cue } from './audio';

export type Panel = { kind: 'economy' | 'politics' | 'military' | 'diplomacy' | 'ledger' | 'chronicle' | 'timelapse' } | { kind: 'province'; id: number } | { kind: 'country'; id: number } | { kind: 'war'; id: number } | null;
/** What an order at the pointer would do, while an army is picked up (for an attack, see strikeOdds). */
/** org: the army's organisation now; supTo: its supply once it reaches the objective (estimated) */
export interface Aim { kind?: 'attack' | 'hold' | 'wait' | 'station' | 'landing' | 'merge'; into?: number; days?: number; place?: number; fort?: number; org?: number; orgTo?: number; supTo?: number; err: string | null; odds: number; n: number; reserves: number; foes: number; def: number; from: [number, number] | null; to: [number, number] | null; ids: number[] }
export interface GameState { day: number; speed: number; paused: boolean; tick: number; panel: Panel; turnMode: World['settings']['turnMode']; menu: boolean; toast: string; declare: number; aim: Aim | null; army: number | null; guide: boolean; pend?: boolean }
/** a cell of ours within 80 km of the front: an army sent there holds it (further back, it waits in reserve) */
const nearFront = (th: Theater, k: number) => { const d = work(th).distF[k]; return d >= 0 && d * th.cellKm <= 80; };
export const SPEEDS = [0.5, 1.5, 4, 10, 25]; // days per second

/** Owns the world and the clock; bridges simulation -> renderer and UI. */
/** statistics recorded monthly for every nation (for the ledger's comparisons) */
export const NATION_STATS = ['gdp', 'divisions', 'provinces', 'pop'] as const;
export type NationStat = typeof NATION_STATS[number];

export class Game {
  w: World; S: MapStatic; player: number;
  st = createStore<GameState>({ day: 0, speed: 1, paused: true, tick: 0, panel: null, turnMode: 'continuous', menu: false, toast: '', declare: -1, aim: null, army: null, guide: !guideSeen() });
  acc = 0; private lastUi = 0; private mapSeen = ''; private now = 0; private dt = 0; private lastAssign = 0;
  layer: TheaterLayer; fx: WarFx;
  /** monthly snapshots of who holds each province, for the timelapse */
  history: { day: number; ctrl: Uint16Array; me: { gdp: number; treasury: number; stability: number; manpower: number; warSupport: number; divisions: number; casualties: number; debt: number }; all: Float32Array }[] = [];
  startProvinces = 0;
  private snapshot: number | null = null;

  constructor(public s: Session, player: number, w?: World) {
    this.S = staticFor(s.assets, s.scenario);
    initSim();
    if (!w) { w = createWorld(this.S, { player, seed: Date.now() % 100000, startDate: s.scenario.startDate, scenario: s.scenario.id, tables: tablesFor(s.scenario.id) }); setupScenario(w, this.S); }
    this.w = w; this.player = player; this.w.countries[player].player = true;
    this.layer = new TheaterLayer(s.ren.gl);
    s.ren.extension = this.layer.ext; s.ren.buildComposite();
    this.fx = new WarFx(s, this.layer);
    s.onFrame = (dt, tt) => this.frame(dt, tt);
    s.onClick = p => this.click(p); s.onPress = p => this.press(p); s.onDragStart = () => this.dragStart(); s.onDrop = p => this.drop(p); s.onRightClick = p => this.rightClick(p);
    s.onOverlay = ctx => this.overlay(ctx);
    s.occupier = p => { const pr = this.w.provinces[p]; return pr.controller !== pr.owner ? countryName(this.w, pr.controller) : null; };
    s.modeValues = () => this.relationValues();
    this.adopt();
  }
  get me() { return this.w.countries[this.player]; }
  /** set up renderer, effects and records for the current world */
  private adopt() {
    this.layer.reset(); this.layer.setPalette(this.w.countries.map(c => c.color)); this.s.ren.setPalette(this.w.countries.map(c => c.color));
    this.fx = new WarFx(this.s, this.layer); this.history = []; this.startProvinces = this.w.provinces.filter(p => p.owner === this.player).length;
    if (this.w.day === 0 && this.me.deficit === 0) this.me.deficit = -0.03; // a new government starts by putting a little aside, so the treasury moves
    if (this.w.day === 0 && !this.w.missions?.length) monthlyMissions(this.w, this.S); // the first mission is offered at once: the first month is never empty
    this.record(); this.afterDay(); this.syncMap(true);
  }
  /** load a saved game (its scenario decides the flags and starting map) */
  async loadWorld(w: World) {
    const sc = await loadScenario(this.s.assets, w.scenario as '2026');
    this.s.setScenario(sc); this.S = staticFor(this.s.assets, sc);
    this.w = w; const p = w.countries.findIndex(c => c.player); this.player = p >= 0 ? p : this.player;
    this.s.ui.set({ player: this.player, selected: -1 }); this.acc = 0;
    this.st.set({ day: w.day, paused: true, panel: null, turnMode: w.settings.turnMode, menu: false });
    this.adopt(); this.s.focusCountry(this.player);
  }
  setSpeed(i: number) { this.st.set({ speed: i, paused: false }); this.sound('click'); }
  togglePause() { this.st.set({ paused: !this.st.get().paused }); this.sound('click'); }
  setTurnMode(m: World['settings']['turnMode']) { this.w.settings.turnMode = m; this.st.set({ turnMode: m }); }
  openPanel(p: Panel) { this.st.set({ panel: p }); if (p) this.sound('open'); }
  /** re-render the UI after a change made from a panel */
  bump() { this.st.set({ tick: this.st.get().tick + 1 }); }
  toast(text: string) { this.st.set({ toast: text }); clearTimeout(this.toastT); this.toastT = setTimeout(() => this.st.set({ toast: '' }), 3500); }
  private toastT: any = 0;
  sound(c: Cue) { audio.cue(c); }
  /** pick up one of the player's armies (null puts it down); while it is picked up, clicks on the map are its orders */
  selectArmy(id: number | null) {
    this.pending = null; this.st.set({ army: id, aim: null, pend: false }); this.aimAt = ''; this.s.stage.style.cursor = id !== null ? 'crosshair' : ''; if (id !== null) this.sound('click');
    // on a phone the army card covers the bottom of the screen: bring the army up into view above it
    if (id !== null && this.s.touch) { const a = this.w.armies.find(x => x.id === id), at = a && armyWhere(this.w, this.S, a); if (at) { const [x, y] = project(at.x, at.y), cam = this.s.cam; cam.x = x; cam.y = y - 0.18 * cam.h * cam.upp; cam.clamp(); } }
  }
  /** a touch order waiting to be confirmed: the screen point it was tapped at */
  private pending: [number, number] | null = null; private pendingWorld: [number, number] | null = null;
  /** give the order previewed by a tap */
  confirmOrder() { if (!this.pending || !this.pendingWorld) return; const [sx, sy] = this.s.cam.toScreen(...this.pendingWorld); this.pending = null; this.st.set({ pend: false }); this.orderAt(sx, sy, true); }
  cancelOrder() { this.pending = null; this.st.set({ pend: false, aim: null }); this.aimAt = ''; }
  /** the next (or previous) of the player's armies, picked up and in view */
  cycleArmy(dir: 1 | -1) {
    const list = this.w.armies.filter(a => a.country === this.player && armyWhere(this.w, this.S, a)).sort((a, b) => a.num - b.num); if (!list.length) return;
    const i = list.findIndex(a => a.id === this.st.get().army), n = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length];
    this.selectArmy(n.id); this.focusArmy(n.id);
  }
  /** an action from the army card: back to the general's line, pull back into reserve, split in two, raise a division for it */
  /** the War desk's button: every army idle at home goes to the front */
  sendIdle() { const n = deployIdleArmies(this.w, this.S, this.player); if (n) { this.toast(t('war.idleSent', { n })); this.afterDay(); this.bump(); this.sound('order'); } }
  armyAction(kind: 'release' | 'reserve' | 'split' | 'raise') {
    const id = this.st.get().army, a = id !== null ? this.w.armies.find(x => x.id === id) : undefined; if (!a) return;
    let err: string | null = null, done = '';
    if (kind === 'release') { err = releaseArmy(this.w, a.id); done = t('army.did.release', { a: armyName(a.num) }); }
    else if (kind === 'reserve') { err = reserveArmy(this.w, this.S, a.id); done = t('army.did.reserve', { a: armyName(a.num) }); }
    else if (kind === 'split') { const b = splitArmy(this.w, a.id); if (typeof b === 'string') err = b; else done = t('army.did.split', { a: armyName(a.num), b: armyName(b.num) }); }
    else { const near = this.raiseAt(a.id); err = queueUnit(this.w, this.me, 'infantry', near, a.id); done = t('army.did.raiseAt', { a: armyName(a.num), p: near !== undefined ? provName(near) : '' }); }
    if (err) { this.toast(t(err)); return; }
    this.toast(done); this.aimAt = ''; this.afterDay(); this.bump(); this.sound('order');
  }
  /** where a division for an army would be raised: the barracks nearest it */
  raiseAt(id: number): number | undefined {
    const a = this.w.armies.find(x => x.id === id), me = this.me, at = a && armyWhere(this.w, this.S, a);
    const bs = this.w.provinces.filter(p => p.owner === me.id && p.controller === me.id && levelOf(p, 'barracks') > 0);
    return at && bs.length ? bs.sort((p, q) => km(...this.S.provinces[p.id].label, at.x, at.y) - km(...this.S.provinces[q.id].label, at.x, at.y))[0].id : undefined;
  }
  /** pan the map to an army */
  focusArmy(id: number) { const a = this.w.armies.find(x => x.id === id), at = a && armyWhere(this.w, this.S, a); if (at) this.focusLog({ day: 0, msg: { k: '' }, kind: 'war', at: [at.x, at.y] }); }
  private orderSelected(lon: number, lat: number) {
    const id = this.st.get().army!, a = this.w.armies.find(x => x.id === id)!, r = orderArmy(this.w, this.S, id, lon, lat);
    if (r.err) { this.toast(t(r.err)); return; }
    const p = provAtLonLat(this.S, lon, lat), at = armyWhere(this.w, this.S, a), on = at?.state === 'moving' && at.eta !== undefined ? at.eta - this.w.day : 0;
    if (on > 0 && (r.kind === 'station' || r.kind === 'move')) this.toast(t('army.done.travel', { a: armyName(a.num), p: p >= 0 ? provName(p) : '', n: on })); // still on the road: say so, and for how long
    else this.toast(t('army.done.' + (r.kind === 'station' ? 'station' : r.kind === 'attack' ? 'attack' : r.kind === 'landing' ? 'landing' : 'move'), { a: armyName(a.num), p: p >= 0 ? provName(p) : '' }));
    this.aimAt = ''; this.afterDay(); this.bump(); this.sound('order'); // the army stays picked up, for the next order
  }
  /** an order given at a screen point (a click, a right-click or a drop): onto another of our armies = merge into it, else an order there */
  private orderAt(sx: number, sy: number, confirmed = false) {
    const sel = this.st.get().army; if (sel === null) return;
    const hit = this.fx.armyAt(sx, sy);
    if (hit !== null && hit !== sel) {
      const a = this.w.armies.find(x => x.id === sel)!, b = this.w.armies.find(x => x.id === hit)!, err = mergeArmies(this.w, this.S, sel, hit);
      if (err) { this.toast(t(err)); return; }
      this.toast(t('army.did.merge', { a: armyName(a.num), b: armyName(b.num) })); this.selectArmy(hit); this.afterDay(); this.bump(); this.sound('order'); return;
    }
    // an attack the army is in no state for (worn out, or outrunning its supply) needs a second click on the same spot
    const aim = this.st.get().aim, warned = aim?.kind === 'attack' && !aim.err && (aimVerdict(aim) === 'tired' || aimVerdict(aim) === 'overreach');
    if (warned && !confirmed && !(this.confirm && Math.hypot(this.confirm[0] - sx, this.confirm[1] - sy) < 24 && performance.now() - this.confirm[2] < 4000)) { this.confirm = [sx, sy, performance.now()]; this.toast(t(this.s.touch ? 'army.confirmAttackTouch' : 'army.confirmAttack')); this.sound('alert'); return; }
    this.confirm = null;
    const [lon, lat] = unproject(...this.s.cam.toWorld(sx, sy)); this.orderSelected(lon, lat);
  }
  private confirm: [number, number, number] | null = null;
  /** pointer pressed on the map: on one of our armies, a drag will carry it to its order */
  private pressHit: number | null = null;
  private press(p: [number, number]) { this.pressHit = this.fx.armyAt(p[0], p[1]); return this.pressHit !== null; }
  private dragStart() { if (this.pressHit !== null && this.st.get().army !== this.pressHit) this.selectArmy(this.pressHit); }
  private drop(p: [number, number]) { this.orderAt(p[0], p[1]); }
  private rightClick(p: [number, number]) { const hit = this.fx.armyAt(p[0], p[1]); if (this.st.get().army !== null) this.orderAt(p[0], p[1]); else if (hit !== null) this.selectArmy(hit); }
  private aimAt = '';
  /** with an army picked up: what clicking at the pointer would do (hold the front, wait in reserve, station, or attack with the odds) */
  private updateArmyAim() {
    if (this.s.overUi) return;
    const id = this.st.get().army!, a = this.w.armies.find(x => x.id === id), at = a && armyWhere(this.w, this.S, a); if (!a || !at) { this.selectArmy(null); return; }
    if (this.s.touch && !this.pending) { if (this.st.get().aim) this.st.set({ aim: null }); return; } // on a phone: nothing to preview until the map is tapped
    const m = this.pending ? this.s.cam.toScreen(...this.pendingWorld!) : this.s.ui.get().mouse, key = `${Math.round(m[0] / 4)},${Math.round(m[1] / 4)},${this.w.day},${this.s.cam.upp}`; if (key === this.aimAt) return; this.aimAt = key;
    const [lon, lat] = unproject(...this.s.cam.toWorld(m[0], m[1]));
    const base = { odds: 0, n: at.total, reserves: 0, foes: 0, def: 1, from: [at.x, at.y] as [number, number], to: [lon, lat] as [number, number], ids: at.divs.map(d => d.id) };
    const over = this.fx.armyAt(m[0], m[1]); if (over !== null && over !== id) { this.st.set({ aim: { ...base, kind: 'merge', err: null, into: over } }); return; } // a click on another army joins it
    for (const war of activeWars(this.w)) for (const th of theatersOf(this.w, war)) {
      const k = cellOf(th, lon, lat); if (k < 0 || !th.land[k] || !th.sideOf[this.player] || th.frozen) continue;
      if (th.c[k] * th.sideOf[this.player] > 0) { this.st.set({ aim: { ...base, kind: nearFront(th, k) ? 'hold' : 'wait', err: null, ...this.tripAim(at.divs, lon, lat) } }); return; }
      const r = strikeOdds(this.w, war, th, this.player, [lon, lat], id);
      if (r.err === 'off.blocked' || r.err === 'off.tooFar') { const l = landingPlan(this.w, this.S, id, lon, lat); if (!l.err) { this.st.set({ aim: { ...base, kind: 'landing', err: null, odds: l.p, foes: l.foes, days: l.days } }); return; } }
      // the army's state and how far it would push past the front decide whether a good-looking attack is a trap
      const divs = at!.divs, mean = (f: (d: typeof divs[number]) => number) => divs.reduce((s, d) => s + f(d), 0) / Math.max(1, divs.length);
      const org = mean(d => d.org), sup = mean(d => d.theater >= 0 ? d.sup : 1), depth = r.at ? km(r.at[0], r.at[1], lon, lat) : 0;
      this.st.set({ aim: { kind: 'attack', err: r.err, odds: r.odds, n: r.units.length, reserves: 0, foes: r.foes, def: r.def, fort: r.fort, from: r.from, to: r.to ?? null, ids: r.units.filter(d => d.theater === th.id).map(d => d.id), org, supTo: Math.max(0, sup - 0.65 * depth / 900), ...(r.from ? this.tripAim(r.units, r.from[0], r.from[1]) : {}) } }); return;
    }
    const p = provAtLonLat(this.S, lon, lat), pr = p >= 0 ? this.w.provinces[p] : null;
    if (pr && pr.controller !== this.player) { const l = landingPlan(this.w, this.S, id, lon, lat); if (!l.err) { this.st.set({ aim: { ...base, kind: 'landing', err: null, odds: l.p, foes: l.foes, days: l.days } }); return; } } // enemy coast with no front: a landing
    this.st.set({ aim: pr && pr.owner === this.player && pr.controller === this.player ? { ...base, kind: 'station', err: null, to: this.S.provinces[p].label, place: p, days: this.tripDays(at.divs, ...this.S.provinces[p].label, false) } : { ...base, err: 'army.notOurs', from: null, to: null } });
  }
  /** how long divisions would take to get to a point: by rail and road from where they are (at the front, a short way is marched) */
  private tripDays(divs: Division[], lon: number, lat: number, march: boolean) { return this.trip(divs, lon, lat, march).days; }
  /** the longest journey of an army's divisions to a point, and their mean organisation when they get there (a long trip by rail or sea wears them) */
  private trip(divs: Division[], lon: number, lat: number, march: boolean) {
    let days = 0, org = 0, n = 0;
    for (const d of divs) {
      const at = whereNow(this.w, d); if (!at) continue; const dk = km(at[0], at[1], lon, lat), walk = march && d.theater >= 0 && dk <= 200, dd = walk ? Math.ceil(dk / 15) : travelDays(this.w, d, dk);
      days = Math.max(days, dd); org += march && !walk ? tripWear(d.org, dd) : d.org; n++;
    }
    return { days, org: n ? org / n : 1 };
  }
  /** a journey's days, plus the organisation on arrival when the trip wears the army noticeably */
  private tripAim(divs: Division[], lon: number, lat: number) {
    const r = this.trip(divs, lon, lat, true), now = divs.reduce((s, d) => s + d.org, 0) / Math.max(1, divs.length);
    return { days: r.days, orgTo: r.org < now - 0.03 ? r.org : undefined };
  }
  /** while an army is picked up: what an order at the pointer would be (recomputed when the pointer moves or a day passes) */
  private updateAim() {
    if (this.st.get().army !== null) { this.updateArmyAim(); return; }
  }
  /** after an order that can change the map (war, peace, agenda) */
  afterOrder() { this.syncMap(false); this.afterDay(); this.bump(); }
  declareWar(target: number) {
    const war = declareWar(this.w, this.S, this.player, target);
    this.afterOrder(); this.openPanel({ kind: 'war', id: war.id });
  }
  proposePeace(war: War, terms: PeaceTerms) {
    const side = sideOf(war, this.player) as 1 | -1, r = acceptsPeace(this.w, war, side, terms);
    if (!r.ok) { this.toast(say(this.w, r.why)); return; }
    makePeace(this.w, this.S, war, terms.type === 'treaty' ? side : (war.score * side >= 0 ? side : (-side as 1 | -1)), terms);
    this.afterOrder(); this.openPanel(null);
  }
  diplo(target: number, act: DiploAction) {
    const o = diploOdds(this.w, this.player, target, act, this.S);
    if (!o.ok) { this.toast(say(this.w, o.why)); return; }
    doDiplo(this.w, this.player, target, act, this.S); this.toast(t('dip.done.' + act, { c: countryName(this.w, target) })); this.sound('click'); this.bump();
    if (this.s.ui.get().mapMode === 'diplomacy') this.s.setMapMode('diplomacy');
  }
  /** pan to where a dispatch happened */
  focusLog(e: LogEntry) {
    const at = e.at || (e.prov !== undefined ? this.s.assets.provinces[e.prov].label : null); if (!at) return;
    const [x, y] = project(at[0], at[1]); this.s.cam.x = x; this.s.cam.y = y; this.s.cam.upp = Math.min(this.s.cam.upp, 0.02); this.s.cam.clamp();
  }
  click(p: number) {
    // an army marker under the pointer: pick it up (or put it down); with an army picked up, a click elsewhere is its order (the sea puts it down)
    const [sx, sy] = this.s.cam.toScreen(...this.s.clickWorld), hit = this.fx.armyAt(sx, sy), sel = this.st.get().army;
    if (hit !== null && (sel === null || hit === sel)) { this.selectArmy(hit === sel ? null : hit); return; }
    if (sel !== null) {
      if (p < 0 && hit === null) { this.selectArmy(null); return; }
      // on a phone a tap shows the order first; a second tap on the same spot (or Confirm on the card) gives it
      if (this.s.touch && hit === null) {
        const q = this.pending ? this.s.cam.toScreen(...this.pendingWorld!) : null;
        if (q && Math.hypot(q[0] - sx, q[1] - sy) < 28) { this.confirmOrder(); return; }
        this.pending = [sx, sy]; this.pendingWorld = this.s.cam.toWorld(sx, sy); this.aimAt = ''; this.st.set({ pend: true }); this.updateArmyAim(); return;
      }
      this.orderAt(sx, sy); return;
    }
    if (p < 0) { this.openPanel(null); this.s.ui.set({ selected: -1 }); return; }
    const owner = this.w.provinces[p].owner;
    this.s.ui.set({ selected: owner });
    this.openPanel(owner === this.player ? { kind: 'province', id: p } : { kind: 'country', id: owner });
  }
  /** relations map mode: hostile 0 .. friendly 0.95, allies 0.97, you 1 */
  private relationValues() {
    const me = this.player, v = new Float32Array(this.w.provinces.length);
    const per = this.w.countries.map(c => c.id === me ? 1 : allied(this.w, me, c.id) ? 0.97 : (rel(this.w, c.id, me) + 100) / 200 * 0.95);
    this.w.provinces.forEach((p, i) => (v[i] = per[p.owner]));
    return v;
  }
  /** after each simulated day: hand the new state to the war layer and effects */
  afterDay() { this.layer.record(this.w); this.fx.record(this.w); this.assignTheaters(); }
  /** a decision has just arrived that should stop the clock (by the player's setting): history, crises, peace offers and ultimatums, or all */
  private seenAgenda = -1;
  private newDecision() {
    const mode = prefs.get().pauseOn, fresh = this.w.agenda.filter(a => a.country === this.player && a.id > this.seenAgenda);
    if (!fresh.length) return false;
    const first = this.seenAgenda < 0; this.seenAgenda = Math.max(...fresh.map(a => a.id));
    if (first) return false; // what was waiting when the game loaded does not stop the clock again
    if (mode === 'never') return false;
    return mode === 'all' || fresh.some(a => a.kind === 'history' || a.kind === 'crisis' || a.kind === 'peace' || a.data?.act === 'demand');
  }
  private record() {
    const c = this.me, w = this.w, n = w.countries.length, all = new Float32Array(n * NATION_STATS.length);
    w.countries.forEach((x, i) => (all[i * 4] = x.alive ? x.gdp : 0));
    for (const d of w.divisions) all[d.country * 4 + 1]++;
    for (const p of w.provinces) { all[p.controller * 4 + 2]++; all[p.owner * 4 + 3] += p.pop; } // provinces held (occupation counts)
    this.history.push({ day: w.day, ctrl: Uint16Array.from(w.provinces, p => p.controller), all,
      me: { gdp: c.gdp, treasury: c.treasury, stability: c.stability, manpower: c.manpower, warSupport: c.warSupport, divisions: all[c.id * 4 + 1], casualties: c.stats.casualties, debt: c.debt } });
  }
  /** a recorded statistic of the player's nation, month by month */
  series(k: keyof Game['history'][number]['me']) { return this.history.map(h => h.me[k]); }
  /** a recorded statistic of any nation, month by month */
  nationSeries(ci: number, k: NationStat) { const j = NATION_STATS.indexOf(k); return this.history.map(h => h.all[ci * 4 + j] ?? 0); }
  private assignTheaters() { const [lon, lat] = unproject(this.s.cam.x, this.s.cam.y); this.layer.assign(this.w, lon, lat); this.lastAssign = this.now; }
  /** show a timelapse frame on the map (null returns to the present) */
  showSnapshot(i: number | null) {
    this.snapshot = i; this.layer.hidden = i !== null;
    if (i === null) { this.syncMap(true); return; }
    const h = this.history[Math.min(i, this.history.length - 1)]; if (!h) return;
    const owner = Int32Array.from(h.ctrl); this.s.owner = owner; this.s.ren.setOwners(owner); this.s.relabel();
  }
  private frame(dt: number, tt: number) {
    this.dt = dt; this.now = tt;
    const g = this.st.get();
    if (this.w.outcome && !this.w.outcome.playOn && !g.paused) this.st.set({ paused: true }); // the end screen holds the clock
    if (!g.paused && this.snapshot === null) {
      this.acc += dt * SPEEDS[g.speed];
      // simulate as many days as fit in a frame's time budget, so the map stays smooth at top speed
      let n = 0; const t0 = performance.now();
      while (this.acc >= 1 && performance.now() - t0 < 12) {
        this.acc -= 1; n++; stepDay(this.w, this.S); this.afterDay();
        const monthStart = new Date(this.w.startDate + this.w.day * 864e5).getUTCDate() === 1;
        if (monthStart) this.record();
        if (this.w.settings.turnMode === 'monthly' && monthStart) { this.st.set({ paused: true }); this.acc = 0; break; }
        if (this.newDecision()) { this.st.set({ paused: true }); this.acc = 0; this.sound('alert'); break; }
      }
      if (this.acc >= 1) this.acc = Math.min(this.acc, 1); // fell behind: drop the backlog rather than stutter
      if (n) this.syncMap(false);
    }
    this.layer.mix = Math.min(1, this.acc);
    if (g.army !== null) this.updateAim();
    if (tt - this.lastAssign > 1) this.assignTheaters();
    audio.ambience(this.fx.heatOnScreen, !g.paused);
    const now = performance.now();
    if (now - this.lastUi > 200 || g.paused) { this.lastUi = now; if (this.st.get().day !== this.w.day || g.paused === false) this.st.set({ day: this.w.day, tick: g.tick + 1 }); }
  }
  /** push ownership changes to the renderer and labels */
  syncMap(force: boolean) {
    if (this.snapshot !== null) return;
    let sig = ''; for (const p of this.w.provinces) sig += p.owner + ',';
    if (!force && sig === this.mapSeen) return;
    this.mapSeen = sig;
    const owner = new Int32Array(this.w.provinces.map(p => p.owner));
    this.s.owner = owner; this.s.ren.setOwners(owner); this.s.relabel();
  }
  /** division stacks in peacetime, drawn at the province's label point */
  private overlay(ctx: CanvasRenderingContext2D) {
    const g = this.st.get();
    if (this.snapshot !== null) return;
    this.fx.draw(ctx, this.s.cam, this.w, this.layer.mix, this.now, this.dt, !g.paused, SPEEDS[g.speed]);
    if (g.army !== null && g.aim) this.fx.drawAim(ctx, this.s.cam, this.w, g.aim, this.now);
    this.fx.drawBuildings(ctx, this.s.cam, this.w, this.S, this.player);
    this.fx.drawArmies(ctx, this.s.cam, this.w, this.S, this.player, g.army, this.now);
    const cam = this.s.cam, zoom = 0.12 / cam.upp; if (zoom < 1.6) return;
    const stacks = new Map<number, { c: number; n: number }>();
    for (const d of this.w.divisions) { if (d.theater >= 0) continue; const k = d.prov * 1000 + d.country; const s = stacks.get(k); if (s) s.n++; else stacks.set(k, { c: d.country, n: 1 }); }
    const A = this.s.assets, fw = 18, fh = 12;
    // nearby garrisons of one nation merge into a single chip, so they never pile onto the map's labels
    const chips: { c: number; n: number; x: number; y: number; w: number }[] = [];
    for (const [k, s] of stacks) {
      if (s.c === this.player || zoom < 8) continue; // our armies have their own markers; other nations' garrisons only up close
      const prov = Math.floor(k / 1000), [lon, lat] = A.provinces[prov].label, [x, y] = cam.toScreen(...project(lon, lat - 0.25));
      if (x < -30 || y < -30 || x > cam.w + 30 || y > cam.h + 30) continue;
      const near = chips.find(q => q.c === s.c && Math.hypot(q.x / q.w - x, q.y / q.w - y) < 70);
      if (near) { near.n += s.n; near.x += x * s.n; near.y += y * s.n; near.w += s.n; } else chips.push({ c: s.c, n: s.n, x: x * s.n, y: y * s.n, w: s.n });
    }
    for (const q of chips) {
      const s = q, x = q.x / q.w, y = q.y / q.w;
      const code = this.w.countries[s.c].code, fi = A.flagIndex[this.s.flagOf[code] || code];
      ctx.fillStyle = 'rgba(8,12,18,0.82)'; ctx.fillRect(x - fw / 2 - 2, y - fh / 2 - 2, fw + 22, fh + 4);
      if (fi) ctx.drawImage(A.flags, fi[0], fi[1], A.flagW, A.flagH, x - fw / 2, y - fh / 2, fw, fh);
      ctx.fillStyle = '#e8edf2'; ctx.font = '700 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n), x + fw / 2 + 4, y + 0.5);
    }
  }
}
