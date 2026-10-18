import type { MapAssets } from '../data/types';
import { project } from '../geo';
import { Camera } from '../render/camera';
import { computeLabels, drawCountryLabels, type CountryLabel } from '../render/labels';
import { MapRenderer, type MapMode } from '../render/map';
import { createStore } from './store';
import { presentDay, type Scenario } from './scenarios';
import { nameFor, onLang, setProvinceNames } from '../i18n';

export interface UIState {
  phase: 'pick' | 'play';
  hover: number; // province under the cursor
  selected: number; // selected country index
  player: number; // player's country index
  mapMode: MapMode | 'population' | 'economy' | 'diplomacy';
  mouse: [number, number];
}

/** Owns the camera, input, renderer and overlay; the simulation plugs in later. */
export class Session {
  assets: MapAssets; cam = new Camera(); ren: MapRenderer; ctx: CanvasRenderingContext2D;
  ui = createStore<UIState>({ phase: 'pick', hover: -1, selected: -1, player: -1, mapMode: 'political', mouse: [0, 0] });
  owner: Int32Array; countryIndex: Record<string, number> = {}; labels: CountryLabel[] = [];
  /** the scenario on the map: its countries, starting owners and flag keys */
  scenario: Scenario; get countries() { return this.scenario.countries; } get flagOf() { return this.scenario.flagOf; }
  /** per-province values for map modes that need the running game (set by Game) */
  modeValues: ((mode: UIState['mapMode']) => ArrayLike<number> | null) | null = null;
  private pickPending: [number, number] | null = null;
  constructor(public glc: HTMLCanvasElement, public ovc: HTMLCanvasElement, public stage: HTMLElement, assets: MapAssets) {
    this.assets = assets;
    this.ren = new MapRenderer(glc, assets);
    this.ctx = ovc.getContext('2d')!;
    this.scenario = presentDay(assets); this.owner = this.scenario.owner;
    this.setScenario(this.scenario);
    onLang(() => this.relabel()); setProvinceNames(this.assets.provinces.map(p => p.name));
    this.resize(); this.cam.upp = 360 / this.cam.w; this.cam.x = 15; this.cam.y = 28; this.cam.clamp();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    requestAnimationFrame(t => this.frame(t));
  }
  setScenario(sc: Scenario) {
    this.scenario = sc; this.countryIndex = {}; sc.countries.forEach((c, i) => (this.countryIndex[c.code] = i));
    this.owner = sc.owner.slice(); this.ren.setPalette(sc.countries.map(c => c.color)); this.ren.setOwners(this.owner); this.relabel();
  }
  relabel() { this.labels = computeLabels(this.assets, this.owner, this.countries.map(c => nameFor(c.code, c.name, c.iso2))); }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = this.stage.clientWidth, h = this.stage.clientHeight;
    this.cam.w = w; this.cam.h = h; this.cam.dpr = dpr;
    this.glc.width = Math.round(w * dpr); this.glc.height = Math.round(h * dpr);
    this.ovc.width = Math.round(w * dpr); this.ovc.height = Math.round(h * dpr);
    this.cam.clamp();
  }
  focusCountry(ci: number) {
    const cap = this.countries[ci].capital, [lon, lat] = this.assets.provinces[cap].label, [x, y] = project(lon, lat);
    this.cam.x = x; this.cam.y = y; this.cam.upp = Math.min(this.cam.upp, 0.06); this.cam.clamp();
  }
  setMapMode(m: UIState['mapMode']) {
    this.ui.set({ mapMode: m });
    const P = this.assets.provinces;
    if (m === 'population') { const v = P.map(p => Math.log10(1 + p.pop / Math.max(1, p.area)) / 3.2); this.ren.setValues(v); }
    if (m === 'economy') { const v = P.map(p => Math.log10(1 + p.gdp / Math.max(1, p.pop) * 1e6) / 5); this.ren.setValues(v); }
    if (m === 'diplomacy') { const v = this.modeValues?.(m); if (v) this.ren.setValues(v); }
  }

  private bindInput() {
    const st = this.stage, ptrs = new Map<number, [number, number]>(); let drag: any = null, pinch: any = null;
    const pos = (e: PointerEvent | WheelEvent): [number, number] => { const r = st.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    st.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.ui')) return;
      st.setPointerCapture(e.pointerId); const p = pos(e); ptrs.set(e.pointerId, p);
      if (ptrs.size === 1) drag = { p, x: this.cam.x, y: this.cam.y, moved: 0 };
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), upp: this.cam.upp }; drag = null; }
    });
    st.addEventListener('pointermove', e => {
      const p = pos(e); this.ui.set({ mouse: p });
      // over the HUD the map is covered: no province under the pointer (otherwise a hidden one stays lit and changes as you move)
      if (!ptrs.has(e.pointerId) && (e.target as HTMLElement).closest?.('.ui')) { this.pickPending = null; if (this.ui.get().hover !== -1) this.ui.set({ hover: -1 }); return; }
      this.pickPending = p;
      if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, p);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const [wx, wy] = this.cam.toWorld(...m); this.cam.upp = pinch.upp * pinch.d / Math.max(1, d); this.cam.clamp(); const [nx, ny] = this.cam.toWorld(...m); this.cam.x += wx - nx; this.cam.y += wy - ny; this.cam.clamp();
      } else if (drag) {
        const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1]; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        this.cam.x = drag.x - dx * this.cam.upp; this.cam.y = drag.y + dy * this.cam.upp; this.cam.clamp();
      }
    });
    const up = (e: PointerEvent) => {
      if (drag && drag.moved < 5 && ptrs.size === 1) this.click(pos(e));
      ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null;
    };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    st.addEventListener('wheel', e => { if ((e.target as HTMLElement).closest('.ui-scroll')) return; e.preventDefault(); const p = pos(e); this.cam.zoomAt(p[0], p[1], Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    st.addEventListener('pointerleave', () => { this.pickPending = null; this.ui.set({ hover: -1 }); });
  }
  clickWorld: [number, number] = [0, 0];
  click(p: [number, number]) {
    this.clickWorld = this.cam.toWorld(p[0], p[1]);
    const pid = this.ren.pick(this.cam, p[0], p[1]);
    this.onClick?.(pid);
  }
  onClick: ((province: number) => void) | null = null;
  /** who holds a province, if not its owner (set once a game runs) */
  occupier: ((province: number) => string | null) | null = null;
  onFrame: ((dt: number, t: number) => void) | null = null;
  onOverlay: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  private last = 0;
  private frame(t: number) {
    const dt = Math.min(0.1, (t - this.last) / 1000 || 0); this.last = t;
    this.onFrame?.(dt, t / 1000);
    const s = this.ui.get();
    const mode: MapMode = s.mapMode === 'population' || s.mapMode === 'economy' ? 'value' : s.mapMode === 'diplomacy' ? 'relations' : s.mapMode;
    this.ren.draw(this.cam, { sel: s.selected, hover: s.hover, player: s.player, mode, time: t / 1000 });
    if (this.pickPending) { const h = this.ren.pick(this.cam, ...this.pickPending); this.pickPending = null; if (h !== s.hover) this.ui.set({ hover: h }); }
    this.drawOverlay();
    requestAnimationFrame(tt => this.frame(tt));
  }
  private drawOverlay() {
    const c = this.ctx, cam = this.cam; c.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0); c.clearRect(0, 0, cam.w, cam.h);
    const s = this.ui.get();
    if (s.mapMode !== 'terrain') drawCountryLabels(c, cam, this.labels, s.selected);
    // cities: capitals first, more as you zoom in
    const zoom = 0.12 / cam.upp; c.textBaseline = 'middle';
    for (const city of this.assets.cities) {
      const show = city.capital ? zoom > 2.2 : (city.rank <= 2 && zoom > 4) || (city.rank <= 4 && zoom > 9) || zoom > 18;
      if (!show) continue;
      const [x, y] = cam.toScreen(...project(city.lon, city.lat)); if (x < -40 || y < -20 || x > cam.w + 40 || y > cam.h + 20) continue;
      c.fillStyle = city.capital ? '#fff' : 'rgba(255,255,255,0.85)'; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5;
      c.beginPath(); if (city.capital) { c.rect(x - 3, y - 3, 6, 6); } else c.arc(x, y, 2.2, 0, 7); c.fill(); c.stroke();
      c.font = `${city.capital ? 600 : 500} ${city.capital ? 12 : 11}px Barlow, system-ui, sans-serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(6,10,16,0.75)'; c.strokeText(city.name, x + 6, y); c.fillStyle = 'rgba(244,246,248,0.92)'; c.fillText(city.name, x + 6, y);
    }
    this.onOverlay?.(c);
  }
}
