import { stepDay } from '../sim/step';
import type { LogEntry, MapStatic, War, World } from '../sim/types';
import { createWorld, rel } from '../sim/world';
import { initSim } from '../sim';
import { setupScenario, tablesFor } from '../sim/scenario';
import { project, unproject } from '../geo';
import type { Session } from './session';
import { createStore } from './store';
import { TheaterLayer } from '../render/theaters';
import { WarFx } from './warfx';
import { countryName, say, t } from '../i18n';
import { acceptsPeace, allied, declareWar, makePeace, sideOf, theatersOf, type PeaceTerms } from '../sim/war/war';
import { startOffensive } from '../sim/war/ai';
import { cellOf } from '../sim/war/theater';
import { diploOdds, doDiplo, type DiploAction } from '../sim/diplomacy';
import { loadScenario, staticFor } from './scenarios';
import { audio, type Cue } from './audio';

export type Panel = { kind: 'economy' | 'politics' | 'military' | 'diplomacy' | 'chronicle' | 'timelapse' } | { kind: 'province'; id: number } | { kind: 'country'; id: number } | { kind: 'war'; id: number } | null;
export type Tool = { kind: 'offensive'; war: number } | null;
export interface GameState { day: number; speed: number; paused: boolean; tick: number; panel: Panel; turnMode: World['settings']['turnMode']; menu: boolean; tool: Tool; toast: string; declare: number }
export const SPEEDS = [0.5, 1.5, 4, 10, 25]; // days per second

/** Owns the world and the clock; bridges simulation -> renderer and UI. */
export class Game {
  w: World; S: MapStatic; player: number;
  st = createStore<GameState>({ day: 0, speed: 1, paused: true, tick: 0, panel: null, turnMode: 'continuous', menu: false, tool: null, toast: '', declare: -1 });
  acc = 0; private lastUi = 0; private mapSeen = ''; private now = 0; private dt = 0; private lastAssign = 0;
  layer: TheaterLayer; fx: WarFx;
  /** monthly snapshots of who holds each province, for the timelapse */
  history: { day: number; ctrl: Uint16Array; me: { gdp: number; treasury: number; stability: number; manpower: number; warSupport: number; divisions: number } }[] = [];
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
    s.onClick = p => this.click(p);
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
  setTool(tool: Tool) { this.st.set({ tool }); this.s.stage.style.cursor = tool ? 'crosshair' : ''; }
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
    const o = diploOdds(this.w, this.player, target, act);
    if (!o.ok) { this.toast(say(this.w, o.why)); return; }
    doDiplo(this.w, this.player, target, act); this.toast(t('dip.done.' + act, { c: countryName(this.w, target) })); this.sound('click'); this.bump();
    if (this.s.ui.get().mapMode === 'diplomacy') this.s.setMapMode('diplomacy');
  }
  /** pan to where a dispatch happened */
  focusLog(e: LogEntry) {
    const at = e.at || (e.prov !== undefined ? this.s.assets.provinces[e.prov].label : null); if (!at) return;
    const [x, y] = project(at[0], at[1]); this.s.cam.x = x; this.s.cam.y = y; this.s.cam.upp = Math.min(this.s.cam.upp, 0.02); this.s.cam.clamp();
  }
  private aimOffensive() {
    const tool = this.st.get().tool!, war = this.w.wars.find(x => x.id === tool.war); this.setTool(null);
    if (!war || war.ended) return;
    const [lon, lat] = unproject(...this.s.clickWorld);
    const th = theatersOf(this.w, war).find(x => { const k = cellOf(x, lon, lat); return k >= 0 && x.land[k]; });
    if (!th) { this.toast(t('off.outside')); return; }
    const err = startOffensive(this.w, th, this.player, [lon, lat]);
    this.toast(t(err || 'off.launched')); if (!err) { this.afterDay(); this.bump(); this.sound('order'); }
  }
  click(p: number) {
    if (this.st.get().tool) { this.aimOffensive(); return; }
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
  private record() {
    const c = this.me;
    this.history.push({ day: this.w.day, ctrl: Uint16Array.from(this.w.provinces, p => p.controller),
      me: { gdp: c.gdp, treasury: c.treasury, stability: c.stability, manpower: c.manpower, warSupport: c.warSupport, divisions: this.w.divisions.filter(d => d.country === c.id).length } });
  }
  /** a recorded statistic of the player's nation, month by month */
  series(k: keyof Game['history'][number]['me']) { return this.history.map(h => h.me[k]); }
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
    if (!g.paused && this.snapshot === null) {
      this.acc += dt * SPEEDS[g.speed];
      // simulate as many days as fit in a frame's time budget, so the map stays smooth at top speed
      let n = 0; const t0 = performance.now();
      while (this.acc >= 1 && performance.now() - t0 < 12) {
        this.acc -= 1; n++; stepDay(this.w, this.S); this.afterDay();
        const monthStart = new Date(this.w.startDate + this.w.day * 864e5).getUTCDate() === 1;
        if (monthStart) this.record();
        if (this.w.settings.turnMode === 'monthly' && monthStart) { this.st.set({ paused: true }); this.acc = 0; break; }
      }
      if (this.acc >= 1) this.acc = Math.min(this.acc, 1); // fell behind: drop the backlog rather than stutter
      if (n) this.syncMap(false);
    }
    this.layer.mix = Math.min(1, this.acc);
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
    const cam = this.s.cam, zoom = 0.12 / cam.upp; if (zoom < 1.6) return;
    const stacks = new Map<number, { c: number; n: number }>();
    for (const d of this.w.divisions) { if (d.theater >= 0) continue; const k = d.prov * 1000 + d.country; const s = stacks.get(k); if (s) s.n++; else stacks.set(k, { c: d.country, n: 1 }); }
    const A = this.s.assets, fw = 18, fh = 12;
    for (const [k, s] of stacks) {
      if (s.c !== this.player && zoom < 8) continue; // other nations' garrisons only up close
      const prov = Math.floor(k / 1000), [lon, lat] = A.provinces[prov].label, [x, y] = cam.toScreen(...project(lon, lat - 0.25));
      if (x < -30 || y < -30 || x > cam.w + 30 || y > cam.h + 30) continue;
      const code = this.w.countries[s.c].code, fi = A.flagIndex[this.s.flagOf[code] || code];
      ctx.fillStyle = 'rgba(8,12,18,0.82)'; ctx.fillRect(x - fw / 2 - 2, y - fh / 2 - 2, fw + 22, fh + 4);
      if (fi) ctx.drawImage(A.flags, fi[0], fi[1], A.flagW, A.flagH, x - fw / 2, y - fh / 2, fw, fh);
      ctx.fillStyle = '#e8edf2'; ctx.font = '700 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n), x + fw / 2 + 4, y + 0.5);
    }
  }
}
