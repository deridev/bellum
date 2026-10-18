import type { Session } from '../game/session';
import { useStore } from '../game/store';
import { fmtBig, fmtMoney } from './format';

const FEATURED = ['USA', 'CHN', 'RUS', 'IND', 'DEU', 'BRA', 'TUR', 'KOR', 'UKR', 'IRN'];

export function PickScreen({ s, onPlay }: { s: Session; onPlay: (ci: number) => void }) {
  const sel = useStore(s.ui, u => u.selected);
  const A = s.assets;
  return <>
    <section class="ui card pick-head">
      <div class="eyebrow">2026 · Present Day</div>
      <div class="brand">BELLUM</div>
      <div>Choose your nation. Click any country on the map.</div>
      <div class="quick">{FEATURED.map(code => { const ci = s.countryIndex[code]; if (ci === undefined) return null; const c = A.countries[ci];
        return <button key={code} aria-pressed={sel === ci} onClick={() => { s.ui.set({ selected: ci }); s.focusCountry(ci); }}><i class="swatch" style={{ background: c.color }} />{c.name}</button>; })}</div>
    </section>
    {sel >= 0 && <CountryCard s={s} ci={sel} onPlay={onPlay} />}
    <MapModes s={s} />
    <HoverTip s={s} />
  </>;
}

function CountryCard({ s, ci, onPlay }: { s: Session; ci: number; onPlay: (ci: number) => void }) {
  const c = s.assets.countries[ci];
  const provs = s.assets.provinces.filter(p => s.owner[p.id] === ci);
  const area = provs.reduce((a, p) => a + p.area, 0);
  const terr: Record<string, number> = {}; provs.forEach(p => (terr[p.terrain] = (terr[p.terrain] || 0) + p.area));
  const mainTerr = Object.entries(terr).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t).join(', ');
  return <section class="ui card country-card" aria-label={c.name}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><i class="swatch" style={{ background: c.color, width: 18, height: 18 }} /><div class="h1">{c.name}</div></div>
    <dl class="stat">
      <dt>Capital</dt><dd>{c.capitalName}</dd>
      <dt>Population</dt><dd>{fmtBig(c.pop)}</dd>
      <dt>Economy (GDP)</dt><dd>{fmtMoney(c.gdp)}</dd>
      <dt>Provinces</dt><dd>{provs.length}</dd>
      <dt>Area</dt><dd>{fmtBig(area)} km²</dd>
      <dt>Terrain</dt><dd style={{ textTransform: 'capitalize' }}>{mainTerr}</dd>
    </dl>
    <button class="primary" onClick={() => onPlay(ci)}>Play as {c.name}</button>
  </section>;
}

export function MapModes({ s }: { s: Session }) {
  const m = useStore(s.ui, u => u.mapMode);
  const modes: [typeof m, string][] = [['political', 'Political'], ['terrain', 'Terrain'], ['population', 'Population'], ['economy', 'Wealth']];
  return <div class="ui modes"><span class="seg" role="group" aria-label="Map mode">{modes.map(([k, l]) => <button key={k} aria-pressed={m === k} onClick={() => s.setMapMode(k)}>{l}</button>)}</span></div>;
}

export function HoverTip({ s }: { s: Session }) {
  const hover = useStore(s.ui, u => u.hover), mouse = useStore(s.ui, u => u.mouse);
  if (hover < 0) return null;
  const p = s.assets.provinces[hover], c = s.assets.countries[s.owner[hover]];
  return <div class="tip card" style={{ left: mouse[0], top: mouse[1] }}><b>{p.name}</b> <span>· {c.name} · <span style={{ textTransform: 'capitalize' }}>{p.terrain}</span></span></div>;
}
