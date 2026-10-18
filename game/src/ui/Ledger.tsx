// The ledger: a full screen of numbers over time. Your nation's growth, the world's rankings, and you against your rivals.
import { useEffect, useState } from 'preact/hooks';
import type { Game, NationStat } from '../game/play';
import { rel } from '../sim/world';
import { allied, enemies } from '../sim/war/war';
import { countryName, fmtDate, t } from '../i18n';
import { dashOf, Delta, Flag, Icon, LineChart, type Series } from './common';
import { fmtBig, fmtInt, fmtMoney, pct } from './format';

type Tab = 'overview' | 'rankings' | 'compare';
/** Categorical slots for compared nations (validated for the dark surface); you are always the first. */
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500'];
const FMT: Record<string, (v: number) => string> = { gdp: fmtMoney, divisions: fmtInt, provinces: fmtInt, pop: fmtBig, tech: fmtInt, stability: pct, treasury: fmtMoney, manpower: fmtBig, warSupport: pct };

export function LedgerScreen({ g }: { g: Game }) {
  const [tab, setTab] = useState<Tab>('overview');
  const close = () => g.openPanel(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <><div class="ui ledger-dim" onClick={close} /><section class="ui ledger plate" role="dialog" aria-label={t('panel.ledger')}>
    <header class="ledger-head">
      <span class="sheet-icon"><Icon name="ledger" size={20} /></span>
      <div class="h2">{t('panel.ledger')}</div>
      <nav class="tabs" role="tablist">{(['overview', 'rankings', 'compare'] as Tab[]).map(k => <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t('led.' + k)}</button>)}</nav>
      <button class="x" aria-label={t('ui.close')} onClick={close}><Icon name="x" size={20} /></button>
    </header>
    <div class="ledger-body ui-scroll">
      {tab === 'overview' && <Overview g={g} />}
      {tab === 'rankings' && <Rankings g={g} />}
      {tab === 'compare' && <Compare g={g} />}
    </div>
  </section></>;
}

const monthX = (g: Game) => (d: number) => fmtDate(g.w, d, 'month');

/** Your nation, month by month. */
function Overview({ g }: { g: Game }) {
  const c = g.me, xs = g.history.map(h => h.day), first = g.history[0]?.me;
  const provs = g.nationSeries(c.id, 'provinces'), bal = c.income - c.spending;
  const rows = table(g), rank = (k: typeof COLS[number]) => rows.slice().sort((a, b) => b[k] - a[k]).findIndex(r => r.id === c.id) + 1;
  const kpi = (icon: string, label: string, value: string, sub: any, r?: number) => <div class="kpi"><span class="kpi-l"><Icon name={icon} size={16} />{label}{r ? <i class="kpi-rank" data-tip={t('led.rankOf', { n: rows.length })}>#{r}</i> : null}</span><b class="kpi-v num">{value}</b><span class="kpi-s">{sub}</span></div>;
  const since = (now: number, then: number | undefined, fmt: (v: number) => string) => then === undefined ? null : <><Delta v={now - then} fmt={fmt} /><small>{t('led.sinceStart')}</small></>;
  const chart = (k: 'gdp' | 'treasury' | 'manpower' | 'divisions' | 'stability' | 'warSupport', label: string) => {
    const v = g.series(k), last = v[v.length - 1] ?? 0, d = last - (v[0] ?? last), share = k === 'stability' || k === 'warSupport';
    return <figure class="cell"><figcaption><span>{label}</span><span class="cap-v"><Delta v={d} fmt={share ? (x: number) => `${Math.round(x * 100)}` : FMT[k]} /><b class="num">{FMT[k](last)}</b></span></figcaption>
      <LineChart series={[{ id: k, label, color: SLOTS[0], values: v }]} xs={xs} fmtX={monthX(g)} fmtY={FMT[k]} height={170} /></figure>;
  };
  return <>
    <div class="kpis">
      {kpi('gdp', t('stat.gdp'), fmtMoney(c.gdp), since(c.gdp, first?.gdp, fmtMoney), rank('gdp'))}
      {kpi('treasury', t('ledger.treasury'), fmtMoney(c.treasury), <span class={bal < 0 ? 'bad' : 'good'}>{t('eco.perMonth', { v: (bal >= 0 ? '+' : '−') + fmtMoney(Math.abs(bal)) })}</span>)}
      {kpi('military', t('mil.divisions'), fmtInt(g.series('divisions').at(-1) ?? 0), since(g.series('divisions').at(-1) ?? 0, first?.divisions, fmtInt), rank('divisions'))}
      {kpi('political', t('stat.provinces'), fmtInt(provs.at(-1) ?? 0), since(provs.at(-1) ?? 0, provs[0], fmtInt), rank('provinces'))}
    </div>
    <div class="cells">
      {chart('gdp', t('stat.gdp'))}{chart('treasury', t('ledger.treasury'))}{chart('divisions', t('mil.divisions'))}
      {chart('manpower', t('ledger.manpower'))}{chart('stability', t('ledger.stability'))}{chart('warSupport', t('ledger.warSupport'))}
    </div>
  </>;
}

type Row = { id: number; gdp: number; pop: number; divisions: number; provinces: number; tech: number; stability: number };
function table(g: Game): Row[] {
  const w = g.w, rows: Row[] = w.countries.map(c => ({ id: c.id, gdp: c.gdp, pop: 0, divisions: 0, provinces: 0, tech: c.tech, stability: c.stability }));
  for (const p of w.provinces) { rows[p.owner].pop += p.pop; rows[p.owner].provinces++; }
  for (const d of w.divisions) rows[d.country].divisions++;
  return rows.filter(r => w.countries[r.id].alive && r.provinces > 0);
}
const COLS = ['gdp', 'pop', 'divisions', 'provinces', 'tech', 'stability'] as const;
const COL_ICON: Record<string, string> = { gdp: 'gdp', pop: 'population', divisions: 'military', provinces: 'political', tech: 'target', stability: 'stability' };

/** Every nation, sorted by any column; your row is always shown. */
function Rankings({ g }: { g: Game }) {
  const [by, setBy] = useState<typeof COLS[number]>('gdp');
  const rows = table(g).sort((a, b) => b[by] - a[by]), top = rows[0]?.[by] || 1, me = g.player;
  const mine = rows.findIndex(r => r.id === me), shown = rows.slice(0, 20);
  if (mine >= 20) shown.push(rows[mine]);
  return <table class="rank">
    <thead><tr><th class="r-n">#</th><th class="r-name">{t('led.nation')}</th>{COLS.map(k => <th key={k} class={`r-col ${by === k ? 'on' : ''}`}><button onClick={() => setBy(k)} aria-pressed={by === k}><Icon name={COL_ICON[k]} size={14} />{t('led.col.' + k)}</button></th>)}</tr></thead>
    <tbody>{shown.map(r => { const i = rows.indexOf(r), war = enemies(g.w, me, r.id), ally = r.id !== me && allied(g.w, me, r.id);
      return <tr key={r.id} class={`${r.id === me ? 'me' : ''} ${i >= 20 ? 'gap' : ''}`} onClick={() => g.openPanel(r.id === me ? { kind: 'politics' } : { kind: 'country', id: r.id })}>
        <td class="r-n num">{i + 1}</td>
        <td class="r-name"><span class="cellrow"><Flag s={g.s} code={g.w.countries[r.id].code} h={16} /><span>{countryName(g.w, r.id)}</span>{war && <i class="tag bad">{t('led.atWar')}</i>}{ally && <i class="tag good">{t('led.ally')}</i>}</span></td>
        {COLS.map(k => <td key={k} class={`r-col num ${by === k ? 'on' : ''}`}><span class="cellrow end">{by === k && <span class="r-bar"><i style={{ width: `${Math.max(2, r[k] / top * 100)}%` }} /></span>}<span>{FMT[k](r[k])}</span></span></td>)}
      </tr>; })}</tbody>
  </table>;
}

const METRICS: NationStat[] = ['gdp', 'divisions', 'provinces', 'pop'];
/** You and up to three other nations over time, on one metric at a time. */
function Compare({ g }: { g: Game }) {
  const w = g.w, me = g.player;
  const [picked, setPicked] = useState<number[]>(() => defaultRivals(g));
  const [metric, setMetric] = useState<NationStat>('gdp');
  const [growth, setGrowth] = useState(true), [picking, setPicking] = useState(false);
  const ids = [me, ...picked], xs = g.history.map(h => h.day), rows = table(g);
  const row = (id: number) => rows.find(r => r.id === id);
  const series: Series[] = ids.map((id, i) => ({ id, label: countryName(w, id), color: SLOTS[i], values: index(g.nationSeries(id, metric), growth) }));
  const options = rows.filter(r => r.id !== me && !picked.includes(r.id)).sort((a, b) => b.gdp - a.gdp);
  return <>
    <div class="cmp-bar">
      <div class="cmp-chips">{ids.map((id, i) => <span key={id} class="cmp-chip"><i style={{ background: SLOTS[i] }} /><Flag s={g.s} code={w.countries[id].code} h={14} />{countryName(w, id)}{id !== me && <button class="x" aria-label={t('ui.remove')} onClick={() => setPicked(picked.filter(x => x !== id))}><Icon name="x" size={12} /></button>}</span>)}
        {picked.length < 3 && <span class="picker"><button class="add" aria-expanded={picking} onClick={() => setPicking(!picking)}><Icon name="improve" size={14} />{t('led.add')}</button>
          {picking && <div class="pick-list plate ui-scroll">{options.slice(0, 40).map(r => <button key={r.id} onClick={() => { setPicked([...picked, r.id]); setPicking(false); }}><Flag s={g.s} code={w.countries[r.id].code} h={14} /><span>{countryName(w, r.id)}</span><small class="num">{fmtMoney(r.gdp)}</small></button>)}</div>}</span>}</div>
      <div class="cmp-tools"><div class="seg" role="group" aria-label={t('led.scale')}><button aria-pressed={growth} onClick={() => setGrowth(true)}>{t('led.growth')}</button><button aria-pressed={!growth} onClick={() => setGrowth(false)}>{t('led.absolute')}</button></div>
      <div class="seg" role="group" aria-label={t('led.metric')}>{METRICS.map(m => <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}><Icon name={COL_ICON[m]} size={15} />{t('led.col.' + m)}</button>)}</div></div>
    </div>
    <figure class="cell wide"><figcaption><span>{t(growth ? 'led.growthOf' : 'led.col.' + metric, { m: t('led.col.' + metric) })}</span>
        <span class="legend">{ids.map((id, i) => <span key={id}><svg width="22" height="6" aria-hidden="true"><line x1="1" x2="21" y1="3" y2="3" stroke={SLOTS[i]} stroke-width={i === 0 ? 3 : 2} stroke-dasharray={dashOf(i)} /></svg>{countryName(w, id)}</span>)}</span></figcaption>
      <LineChart series={series} xs={xs} fmtX={monthX(g)} fmtY={growth ? signedPct : FMT[metric]} height={260} zero={!growth && metric !== 'gdp'} /></figure>
    <table class="h2h">
      <thead><tr><th />{ids.map((id, i) => <th key={id}><span class="cmp-key" style={{ background: SLOTS[i] }} /><Flag s={g.s} code={w.countries[id].code} h={14} /> {countryName(w, id)}</th>)}</tr></thead>
      <tbody>{COLS.map(k => { const vals = ids.map(id => row(id)?.[k] ?? 0), best = Math.max(...vals) || 1;
        return <tr key={k}><th><span class="cellrow"><Icon name={COL_ICON[k]} size={14} />{t('led.col.' + k)}</span></th>{vals.map((v, i) => <td key={i} class={v === best ? 'best' : ''}><b class="num">{FMT[k](v)}{v === best && ids.length > 1 ? <Icon name="up" size={10} /> : null}</b><span class="r-bar"><i style={{ width: `${Math.max(2, v / best * 100)}%`, background: SLOTS[i] }} /></span></td>)}</tr>; })}
        <tr><th><span class="cellrow"><Icon name="diplomacy" size={14} />{t('dip.opinion')}</span></th>{ids.map(id => { const r = id === me ? null : rel(w, id, me); return <td key={id}>{r === null ? '—' : <b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b>}</td>; })}</tr>
      </tbody>
    </table>
  </>;
}
/** change since the first month, as a share (0.1 = +10%) */
const index = (v: number[], on: boolean) => on ? v.map(x => v[0] ? x / v[0] - 1 : 0) : v;
const signedPct = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + pct(Math.abs(v));
/** Start with whoever you are fighting, then the strongest neighbours. */
function defaultRivals(g: Game) {
  const w = g.w, me = g.player, alive = w.countries.filter(c => c.alive && c.id !== me);
  const foes = alive.filter(c => enemies(w, me, c.id)).sort((a, b) => b.gdp - a.gdp).map(c => c.id);
  const near = new Set<number>();
  w.provinces.forEach((p, i) => { if (p.owner === me) for (const n of g.S.provinces[i].nbr) near.add(w.provinces[n].owner); });
  const rest = alive.filter(c => !foes.includes(c.id) && near.has(c.id)).sort((a, b) => b.gdp - a.gdp).map(c => c.id);
  return [...foes, ...rest].slice(0, 2);
}
