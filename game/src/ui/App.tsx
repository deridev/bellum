import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../game/session';
import { useStore } from '../game/store';
import { loadScenario, SCENARIOS, type ScenarioId } from '../game/scenarios';
import { listSaves } from '../game/save';
import { nameFor, t } from '../i18n';
import { Flag } from './common';
import { fmtBig, fmtMoney } from './format';
import { Settings } from './Settings';

/** Nations suggested on the setup screen for each scenario (any country can be played). */
const FEATURED: Record<ScenarioId, string[]> = {
  '2026': ['USA', 'CHN', 'RUS', 'UKR', 'IND', 'DEU', 'BRA', 'TUR', 'KOR', 'IRN'],
  '1939': ['GER', 'POL', 'FRA', 'GBR', 'SOV', 'ITA', 'JPN', 'USA', 'CHN'],
  '1914': ['GER', 'AUH', 'FRA', 'GBR', 'RUS', 'SRB', 'OTT', 'ITA', 'USA'],
};

export function TitleScreen({ s, onNew, onLoad }: { s: Session; onNew: () => void; onLoad: (slot: string) => void }) {
  const [view, setView] = useState<'main' | 'load' | 'settings'>('main');
  const saves = listSaves();
  return <div class="ui title-screen">
    <div class="title-block">
      <div class="wordmark">BELLUM</div>
      <div class="tagline">{t('title.tagline')}</div>
    </div>
    <nav class="title-menu panel" aria-label={t('title.menu')}>
      {view === 'main' && <>
        <button class="primary big" onClick={onNew}>{t('title.new')}</button>
        <button class="big" disabled={!saves.length} onClick={() => setView('load')}>{t('title.load')}</button>
        <button class="big" onClick={() => setView('settings')}>{t('title.settings')}</button>
      </>}
      {view === 'load' && <>
        <div class="eyebrow">{t('title.load')}</div>
        <ul class="saves">{saves.map(sv => <li key={sv.slot}><button onClick={() => onLoad(sv.slot)}><b>{sv.country}</b><span>{sv.date}</span></button></li>)}</ul>
        <button onClick={() => setView('main')}>{t('ui.back')}</button>
      </>}
      {view === 'settings' && <><Settings s={s} /><button onClick={() => setView('main')}>{t('ui.back')}</button></>}
    </nav>
    <div class="title-foot">{t('title.foot')}</div>
  </div>;
}

/** Choose a scenario, then a nation on the map. */
export function SetupScreen({ s, onPlay, onBack }: { s: Session; onPlay: (ci: number) => void; onBack: () => void }) {
  const sel = useStore(s.ui, u => u.selected);
  const [sid, setSid] = useState<ScenarioId>(s.scenario.id);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const pick = async (id: ScenarioId) => {
    if (busy) return; setBusy(true); setErr('');
    try { const sc = await loadScenario(s.assets, id); s.setScenario(sc); s.ui.set({ selected: -1 }); setSid(id); s.cam.upp = 360 / s.cam.w; s.cam.x = 15; s.cam.y = 28; s.cam.clamp(); }
    catch { setErr(t('setup.unavailable')); }
    setBusy(false);
  };
  return <>
    <section class="ui panel setup">
      <header class="setup-head"><button class="x" onClick={onBack} aria-label={t('ui.back')}>‹</button><div><div class="eyebrow">{t('setup.step1')}</div><div class="h2">{t('setup.title')}</div></div></header>
      <div class="scenarios" role="radiogroup" aria-label={t('setup.title')}>
        {SCENARIOS.map(sc => <button key={sc.id} role="radio" aria-checked={sid === sc.id} class={`scenario ${sid === sc.id ? 'on' : ''}`} onClick={() => pick(sc.id)}>
          <span class="sc-year num">{sc.id}</span><span class="sc-name">{t(`scenario.${sc.id}.name`)}</span><small>{t(`scenario.${sc.id}.blurb`)}</small></button>)}
      </div>
      {err && <small class="bad" role="alert">{err}</small>}
      <div class="eyebrow">{t('setup.step2')}</div>
      <div class="quick">{FEATURED[sid].map(code => { const ci = s.countryIndex[code]; if (ci === undefined) return null; const c = s.countries[ci];
        return <button key={code} aria-pressed={sel === ci} onClick={() => { s.ui.set({ selected: ci }); s.focusCountry(ci); }}><Flag s={s} code={code} h={12} />{nameFor(c.code, c.name, c.iso2)}</button>; })}</div>
      <small class="muted">{t('setup.hint')}</small>
    </section>
    {sel >= 0 && s.countries[sel] && <CountryCard s={s} ci={sel} onPlay={onPlay} />}
    <MapModes s={s} />
    <HoverTip s={s} />
  </>;
}

function CountryCard({ s, ci, onPlay }: { s: Session; ci: number; onPlay: (ci: number) => void }) {
  const c = s.countries[ci], name = nameFor(c.code, c.name, c.iso2);
  const provs = s.assets.provinces.filter(p => s.owner[p.id] === ci);
  const area = provs.reduce((a, p) => a + p.area, 0);
  const terr: Record<string, number> = {}; provs.forEach(p => (terr[p.terrain] = (terr[p.terrain] || 0) + p.area));
  const mainTerr = Object.entries(terr).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => t('terrain.' + k)).join(', ');
  return <section class="ui panel country-card" aria-label={name}>
    <div class="title-row"><Flag s={s} code={c.code} h={26} /><div class="h1">{name}</div></div>
    <dl class="stat">
      <dt>{t('stat.capital')}</dt><dd>{c.capitalName}</dd>
      <dt>{t('stat.population')}</dt><dd>{fmtBig(c.pop)}</dd>
      <dt>{t('stat.gdp')}</dt><dd>{fmtMoney(c.gdp)}</dd>
      <dt>{t('stat.provinces')}</dt><dd>{provs.length}</dd>
      <dt>{t('stat.area')}</dt><dd>{fmtBig(area)} km²</dd>
      <dt>{t('stat.terrain')}</dt><dd>{mainTerr}</dd>
    </dl>
    <button class="primary big" onClick={() => onPlay(ci)}>{t('setup.play', { c: name })}</button>
  </section>;
}

export function MapModes({ s, game }: { s: Session; game?: boolean }) {
  const m = useStore(s.ui, u => u.mapMode);
  const modes = (['political', 'terrain', ...(game ? ['diplomacy'] : []), 'population', 'economy'] as (typeof m)[]);
  return <div class="ui modes panel"><div class="seg" role="group" aria-label={t('modes.label')}>{modes.map(k => <button key={k} aria-pressed={m === k} onClick={() => s.setMapMode(k)}>{t('modes.' + k)}</button>)}</div></div>;
}

export function HoverTip({ s }: { s: Session }) {
  const hover = useStore(s.ui, u => u.hover), mouse = useStore(s.ui, u => u.mouse);
  const [, force] = useState(0); useEffect(() => { const id = setInterval(() => force(x => x + 1), 500); return () => clearInterval(id); }, []);
  if (hover < 0) return null;
  const p = s.assets.provinces[hover], c = s.countries[s.owner[hover]], occ = s.occupier?.(hover);
  if (!c) return null;
  return <div class={`tip panel ${mouse[0] > s.cam.w - 320 ? 'flip' : ''}`} style={{ left: mouse[0], top: mouse[1] }}><b>{p.name}</b> <span>· {nameFor(c.code, c.name, c.iso2)}{occ ? <span class="bad"> · {t('tip.heldBy', { c: occ })}</span> : null} · {t('terrain.' + p.terrain)}</span></div>;
}
