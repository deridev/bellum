import { stepDay } from '../sim/step';
import type { MapStatic, World } from '../sim/types';
import { createWorld } from '../sim/world';
import { initSim } from '../sim';
import { setupScenario } from '../sim/scenario';
import { project } from '../geo';
import type { Session } from './session';
import { createStore } from './store';
import { TheaterLayer } from '../render/theaters';
import { WarFx } from './warfx';
import { unproject } from '../geo';
import { say } from '../i18n';
import { acceptsPeace, declareWar, makePeace, sideOf, theatersOf, type PeaceTerms } from '../sim/war/war';
import { startOffensive } from '../sim/war/ai';
import { cellOf } from '../sim/war/theater';
import type { War } from '../sim/types';

export type Panel = { kind: 'nation'; tab: 'economy' | 'politics' | 'military' } | { kind: 'province'; id: number } | { kind: 'country'; id: number } | { kind: 'war'; id: number } | null;
export type Tool = { kind: 'offensive'; war: number } | null;
export interface GameState { day: number; speed: number; paused: boolean; tick: number; panel: Panel; turnMode: World['settings']['turnMode']; menu: boolean; tool: Tool; toast: string; declare: number }
export const SPEEDS = [0.5, 1.5, 4, 10, 25]; // days per second

/** Owns the world and the clock; bridges simulation -> renderer and UI. */
export class Game {
  w: World; S: MapStatic; player: number;
  st = createStore<GameState>({ day: 0, speed: 1, paused: true, tick: 0, panel: null, turnMode: 'continuous', menu: false, tool: null, toast: '', declare: -1 });
  acc = 0; private lastUi = 0; private mapSeen = ''; private now = 0; private dt = 0; private lastAssign = 0;
  layer: TheaterLayer; fx: WarFx;
  constructor(public s: Session, player: number, w?: World) {
    const A = s.assets;
    this.S = { provinces: A.provinces, countries: A.countries, cities: A.cities, dem: A.demData, demW: A.dem.width, demH: A.dem.height, provRaster: A.provRaster };
    initSim();
    if (!w) { w = createWorld(this.S, { player, seed: 2026 }); setupScenario(w, this.S); }
    this.w = w;
    this.player = player; this.w.countries[player].player = true;
    this.layer = new TheaterLayer(s.ren.gl); this.layer.setPalette(this.w.countries.map(c => c.color));
    s.ren.extension = this.layer.ext; s.ren.buildComposite();
    this.fx = new WarFx(A, this.layer); this.afterDay();
    s.onFrame = (dt, t) => this.frame(dt, t);
    s.onClick = (p) => this.click(p);
    s.onOverlay = (ctx) => this.overlay(ctx);
    s.occupier = p => { const pr = this.w.provinces[p]; return pr.controller !== pr.owner ? this.w.countries[pr.controller].name : null; };
    this.syncMap(true);
  }
  get me() { return this.w.countries[this.player]; }
  /** swap in a loaded world */
  replaceWorld(w: World) {
    this.w = w; const p = w.countries.findIndex(c => c.player); this.player = p >= 0 ? p : this.player;
    this.layer.reset(); this.fx = new WarFx(this.s.assets, this.layer); this.afterDay();
    this.s.ui.set({ player: this.player, selected: -1 }); this.acc = 0;
    this.st.set({ day: w.day, paused: true, panel: null, turnMode: w.settings.turnMode, menu: false });
    this.syncMap(true); this.s.focusCountry(this.player);
  }
  setSpeed(i: number) { this.st.set({ speed: i, paused: false }); }
  togglePause() { this.st.set({ paused: !this.st.get().paused }); }
  setTurnMode(m: World['settings']['turnMode']) { this.w.settings.turnMode = m; this.st.set({ turnMode: m }); }
  openPanel(p: Panel) { this.st.set({ panel: p }); }
  /** re-render the UI after a change made from a panel */
  bump() { this.st.set({ tick: this.st.get().tick + 1 }); }
  toast(msg: string) { this.st.set({ toast: msg }); clearTimeout(this.toastT); this.toastT = setTimeout(() => this.st.set({ toast: '' }), 3500); }
  private toastT: any = 0;
  setTool(t: Tool) { this.st.set({ tool: t }); this.s.stage.style.cursor = t ? 'crosshair' : ''; }
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
  private aimOffensive() {
    const tool = this.st.get().tool!, war = this.w.wars.find(x => x.id === tool.war); this.setTool(null);
    if (!war || war.ended) return;
    const [lon, lat] = unproject(...this.s.clickWorld);
    const t = theatersOf(this.w, war).find(t => { const k = cellOf(t, lon, lat); return k >= 0 && t.land[k]; });
    if (!t) { this.toast('Pick a target inside the war zone'); return; }
    const err = startOffensive(this.w, t, this.player, [lon, lat]);
    this.toast(err || 'Offensive launched'); if (!err) { this.afterDay(); this.bump(); }
  }
  click(p: number) {
    if (this.st.get().tool) { this.aimOffensive(); return; }
    if (p < 0) { this.openPanel(null); this.s.ui.set({ selected: -1 }); return; }
    const owner = this.w.provinces[p].owner;
    this.s.ui.set({ selected: owner });
    this.openPanel(owner === this.player ? { kind: 'province', id: p } : { kind: 'country', id: owner });
  }
  /** after each simulated day: hand the new state to the war layer and effects */
  afterDay() { this.layer.record(this.w); this.fx.record(this.w); this.assignTheaters(); }
  private assignTheaters() { const [lon, lat] = unproject(this.s.cam.x, this.s.cam.y); this.layer.assign(this.w, lon, lat); this.lastAssign = this.now; }
  private frame(dt: number, t: number) {
    this.dt = dt; this.now = t;
    const g = this.st.get();
    if (!g.paused) {
      this.acc += dt * SPEEDS[g.speed];
      let n = 0;
      while (this.acc >= 1 && n < 6) {
        this.acc -= 1; n++; stepDay(this.w, this.S); this.afterDay();
        if (this.w.settings.turnMode === 'monthly' && new Date(this.w.startDate + this.w.day * 864e5).getUTCDate() === 1) { this.st.set({ paused: true }); this.acc = 0; break; }
      }
      if (n === 6) this.acc = Math.min(this.acc, 1);
      if (n) this.syncMap(false);
    }
    this.layer.mix = Math.min(1, this.acc);
    if (t - this.lastAssign > 1) this.assignTheaters();
    const now = performance.now();
    if (now - this.lastUi > 200 || g.paused) { this.lastUi = now; if (this.st.get().day !== this.w.day || g.paused === false) this.st.set({ day: this.w.day, tick: g.tick + 1 }); }
  }
  /** push ownership changes to the renderer and labels */
  syncMap(force: boolean) {
    let sig = ''; for (const p of this.w.provinces) sig += p.owner + ',';
    if (!force && sig === this.mapSeen) return;
    this.mapSeen = sig;
    const owner = new Int32Array(this.w.provinces.map(p => p.owner));
    this.s.owner = owner; this.s.ren.setOwners(owner); this.s.relabel();
  }
  /** division stacks in peacetime, drawn at the province's label point */
  private overlay(ctx: CanvasRenderingContext2D) {
    const g = this.st.get();
    this.fx.draw(ctx, this.s.cam, this.w, this.layer.mix, this.now, this.dt, !g.paused, SPEEDS[g.speed]);
    const cam = this.s.cam, zoom = 0.12 / cam.upp; if (zoom < 1.6) return;
    const stacks = new Map<number, { c: number; n: number }>();
    for (const d of this.w.divisions) { if (d.theater >= 0) continue; const k = d.prov * 1000 + d.country; const s = stacks.get(k); if (s) s.n++; else stacks.set(k, { c: d.country, n: 1 }); }
    const A = this.s.assets, fw = 18, fh = 12;
    for (const [k, s] of stacks) {
      if (s.c !== this.player && zoom < 4) continue;
      const prov = Math.floor(k / 1000), [lon, lat] = A.provinces[prov].label, [x, y] = cam.toScreen(...project(lon, lat - 0.25));
      if (x < -30 || y < -30 || x > cam.w + 30 || y > cam.h + 30) continue;
      const fi = A.flagIndex[this.w.countries[s.c].code];
      ctx.fillStyle = 'rgba(8,12,18,0.82)'; ctx.fillRect(x - fw / 2 - 2, y - fh / 2 - 2, fw + 22, fh + 4);
      if (fi) ctx.drawImage(A.flags, fi[0], fi[1], A.flagW, A.flagH, x - fw / 2, y - fh / 2, fw, fh);
      ctx.fillStyle = '#e9eef3'; ctx.font = '700 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(String(s.n), x + fw / 2 + 4, y + 0.5);
    }
  }
}
