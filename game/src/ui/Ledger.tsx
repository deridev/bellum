// The ledger: a full screen of numbers over time. Your nation's growth, the world's rankings, and you against your rivals.
import { useEffect, useState } from 'preact/hooks';
import type { Game, NationStat } from '../game/play';
import { rel } from '../sim/world';
import { allied, enemies } from '../sim/war/war';
import { countryName, fmtDate, say, t } from '../i18n';
import { dashOf, Delta, Flag, Icon, LineChart, MoreFooter, SignedBar, useMore, type Series } from './common';
import { fmtBig, fmtInt, fmtMoney, pct } from './format';

type Tab = 'overview' | 'rankings' | 'compare';
/** Categorical slots for compared nations (validated for the dark surface); you are always the first. */
const SLOTS = ['#2a78d6', '#d4502a', '#14946a', '#b97d00']; // validated on the parchment surface
const RISE = '#2f8a3c', FALL = '#c2412f';
const FMT: Record<string, (v: number) => string> = { casualties: fmtBig, debt: fmtMoney, gdp: fmtMoney, divisions: fmtInt, provinces: fmtInt, pop: fmtBig, tech: fmtInt, stability: pct, treasury: fmtMoney, manpower: fmtBig, warSupport: pct };

export function LedgerScreen({ g }: { g: Game }) {
  const [tab, setTab] = useState<Tab>('overview'), [body, more, check] = useMore();
  const close = () => g.openPanel(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return <><div class="ui ledger-dim" onClick={close} /><section class="ui ledger plate" role="dialog" aria-label={t('panel.ledger')}>
    <header class="ledger-head">
      <span class="sheet-icon"><Icon name="ledger" size={20} /></span>
      <div class="h2">{t('panel.ledger')}</div>
      <nav class="tabs" role="tablist">{(['overview', 'rankings', 'compare'] as Tab[]).map(k => <button key={k} role="tab" aria-selected={tab === k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t('led.' + k)}</button>)}</nav>
      <button class="x" aria-label={t('ui.close')} onClick={close}><Icon name="x" size={20} /></button>
    </header>
    <div class="ledger-body" ref={body} onScroll={check}>
      {tab === 'overview' && <Overview g={g} />}
      {tab === 'rankings' && <Rankings g={g} />}
      {tab === 'compare' && <Compare g={g} />}
    </div>
    <MoreFooter body={body} more={more} />
  </section></>;
}

const monthX = (g: Game) => (d: number) => fmtDate(g.w, d, 'month');

/** Your nation, month by month. */
function Overview({ g }: { g: Game }) {
  const c = g.me, xs = g.history.map(h => h.day), first = g.history[0]?.me;
  const provs = g.nationSeries(c.id, 'provinces'), bal = c.income - c.spending;
  const rows = table(g), rank = (k: typeof COLS[number]) => rows.slice().sort((a, b) => b[k] - a[k]).findIndex(r => r.id === c.id) + 1;
  // rank at the first recorded month, from the per-nation records
  const rank0 = (j: number) => { const h = g.history[0]; if (!h) return 0; const n = h.all.length / 4, mine = h.all[c.id * 4 + j]; let r = 1; for (let i = 0; i < n; i++) if (h.all[i * 4 + j] > mine) r++; return r; };
  const J: Record<string, number> = { gdp: 0, divisions: 1, provinces: 2 };
  const kpi = (icon: string, label: string, value: string, sub: any, k?: 'gdp' | 'divisions' | 'provinces') => { const r = k ? rank(k) : 0, moved = k ? rank0(J[k]) - r : 0;
    return <div class="kpi"><span class="kpi-l"><Icon name={icon} size={16} />{label}{r ? <i class="kpi-rank" data-tip={t('led.rankOf', { n: rows.length })}>#{r}{moved !== 0 && <span class={moved > 0 ? 'good' : 'bad'}><Icon name={moved > 0 ? 'up' : 'down'} size={9} />{Math.abs(moved)}</span>}</i> : null}</span><b class="kpi-v num">{value}</b><span class="kpi-s">{sub}</span></div>; };
  const since = (now: number, then: number | undefined, fmt: (v: number) => string) => then === undefined ? null : Math.abs(now - then) < 1e-9 ? <small>{t('led.unchanged')}</small> : <><Delta v={now - then} fmt={fmt} /><small>{t('led.sinceStart')}</small></>;
  // your big moments, pinned on the timelines
  // numbered, one per month, the latest six
  // major events only (wars, peace, big moments); a repeated line in one month shows once with a count
  const evs = g.w.log.filter(e => e.who?.includes(c.id) && e.day >= (xs[0] ?? 0) && (e.big || e.kind === 'war' || e.kind === 'peace'));
  const byMonth = new Map<string, typeof evs>(); for (const e of evs) { const k = fmtDate(g.w, e.day, 'month'); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k)!.push(e); }
  const groups = [...byMonth.values()].map(es => { const lines = new Map<string, number>(); for (const e of es) { const l = say(g.w, e.msg); lines.set(l, (lines.get(l) || 0) + 1); }
    return { x: es[0].day, label: [...lines].map(([l, n]) => n > 1 ? `${l} ×${n}` : l).join(' · ') }; });
  // wars already under way when the record starts get a pin at the start
  for (const war of g.w.wars) if ((war.attackers.includes(c.id) || war.defenders.includes(c.id)) && war.start <= (xs[0] ?? 0) && !war.ended) groups.unshift({ x: xs[0] ?? 0, label: say(g.w, war.name) });
  // at most four pins, at least ~6% of the timeline apart
  const span = Math.max(1, (xs[xs.length - 1] ?? 1) - (xs[0] ?? 0)), spaced: typeof groups = [];
  for (const m of groups) { const last = spaced[spaced.length - 1]; if (last && (m.x - last.x) / span < 0.06) last.label += ' · ' + m.label; else spaced.push({ ...m }); }
  const marks = spaced.slice(0, 1).concat(spaced.slice(1).slice(-3)).map((m, i) => ({ ...m, n: i + 1 }));
  const chart = (k: 'gdp' | 'debt' | 'manpower' | 'casualties' | 'stability' | 'warSupport', label: string) => {
    const v = g.series(k), last = v[v.length - 1] ?? 0, d = last - (v[0] ?? last), share = k === 'stability' || k === 'warSupport', worse = k === 'casualties' || k === 'debt', bad = worse ? d > 0 : d < 0;
    return <figure class="cell"><figcaption><span>{label}</span><span class="cap-v"><Delta v={d} invert={worse} fmt={share ? (x: number) => `${Math.round(x * 100)}` : FMT[k]} /><b class="num">{FMT[k](last)}</b></span></figcaption>
      <LineChart series={[{ id: k, label, color: Math.abs(d) < 1e-9 ? SLOTS[0] : bad ? FALL : RISE, values: v }]} xs={xs} fmtX={monthX(g)} fmtY={FMT[k]} height={140} zero={worse} marks={marks} /></figure>;
  };
  return <>
    <div class="kpis">
      {kpi('gdp', t('stat.gdp'), fmtMoney(c.gdp), since(c.gdp, first?.gdp, fmtMoney), 'gdp')}
      {kpi('treasury', t('ledger.treasury'), fmtMoney(c.treasury), <span class={bal < 0 ? 'bad' : 'good'}>{t('eco.perMonth', { v: (bal >= 0 ? '+' : '−') + fmtMoney(Math.abs(bal)) })}</span>)}
      {kpi('military', t('mil.divisions'), fmtInt(g.series('divisions').at(-1) ?? 0), since(g.series('divisions').at(-1) ?? 0, first?.divisions, fmtInt), 'divisions')}
      {kpi('political', t('led.col.provinces'), fmtInt(provs.at(-1) ?? 0), since(provs.at(-1) ?? 0, provs[0], fmtInt), 'provinces')}
    </div>
    {marks.length > 0 && <ol class="pin-legend">{marks.map(m => <li key={m.n}><i>{m.n}</i><time>{fmtDate(g.w, m.x, 'month')}</time><span>{m.label}</span></li>)}</ol>}
    {xs.length < 2 ? <p class="no-history">{t('led.noHistory')}</p> : <div class="cells">
      {chart('gdp', t('stat.gdp'))}{chart('debt', t('eco.debt'))}{chart('casualties', t('war.casualties'))}
      {chart('manpower', t('ledger.manpower'))}{chart('stability', t('ledger.stability'))}{chart('warSupport', t('ledger.warSupport'))}
    </div>}
  </>;
}

type Row = { id: number; gdp: number; pop: number; divisions: number; provinces: number; tech: number; stability: number };
function table(g: Game): Row[] {
  const w = g.w, rows: Row[] = w.countries.map(c => ({ id: c.id, gdp: c.gdp, pop: 0, divisions: 0, provinces: 0, tech: c.tech, stability: c.stability }));
  for (const p of w.provinces) { rows[p.owner].pop += p.pop; rows[p.controller].provinces++; }
  for (const d of w.divisions) rows[d.country].divisions++;
  return rows.filter(r => w.countries[r.id].alive && r.provinces > 0);
}
const COLS = ['gdp', 'pop', 'divisions', 'provinces', 'tech', 'stability'] as const;
const COL_ICON: Record<string, string> = { gdp: 'gdp', pop: 'population', divisions: 'military', provinces: 'political', tech: 'target', stability: 'stability' };

/** Every nation, sorted by any column; your row is always shown. */
function Rankings({ g }: { g: Game }) {
  const [by, setBy] = useState<typeof COLS[number]>('gdp');
  const rows = table(g).sort((a, b) => b[by] - a[by]), top = rows[0]?.[by] || 1, me = g.player;
  const bar = (v: number) => by === 'stability' || by === 'tech' ? v / top : Math.sqrt(Math.max(0, v) / top); // square root: giants do not flatten everyone else
  // places gained since the first recorded month (for measures recorded per nation)
  const j = ({ gdp: 0, divisions: 1, provinces: 2, pop: 3 } as Record<string, number>)[by], h0 = g.history[0];
  const order0 = j === undefined || !h0 ? null : rows.map(r => r.id).sort((a, b) => h0.all[b * 4 + j] - h0.all[a * 4 + j]);
  const moved = (id: number) => order0 ? order0.indexOf(id) - rows.findIndex(r => r.id === id) : 0;
  const mine = rows.findIndex(r => r.id === me), TOP = 12, shown = rows.slice(0, TOP);
  if (mine >= TOP) shown.push(...rows.slice(Math.max(TOP, mine - 2), mine + 3)); // you and two neighbours each side
  return <table class="rank">
    <thead><tr><th class="r-n">#</th><th class="r-mv" data-tip={t('led.moved')}><Icon name="up" size={9} /></th><th class="r-name">{t('led.nation')}</th>{COLS.map(k => <th key={k} class={`r-col ${by === k ? 'on' : ''}`} data-tip={t('led.tip.' + k)}><button onClick={() => setBy(k)} aria-pressed={by === k}><Icon name={COL_ICON[k]} size={14} />{t('led.col.' + k)}<Icon name={by === k ? 'down' : 'flat'} size={9} /></button></th>)}</tr></thead>
    <tbody>{shown.map(r => { const i = rows.indexOf(r), war = enemies(g.w, me, r.id), ally = r.id !== me && allied(g.w, me, r.id);
      return <tr key={r.id} class={`${r.id === me ? 'me' : ''} ${i >= TOP && rows.indexOf(shown[shown.indexOf(r) - 1]) !== i - 1 ? 'gap' : ''}`} onClick={() => g.openPanel(r.id === me ? { kind: 'politics' } : { kind: 'country', id: r.id })}>
        <td class="r-n num">{i + 1}</td><td class="r-mv num">{(() => { const m = moved(r.id); return m ? <span class={m > 0 ? 'good' : 'bad'}><Icon name={m > 0 ? 'up' : 'down'} size={9} />{Math.abs(m)}</span> : null; })()}</td>
        <td class="r-name"><span class="cellrow"><Flag s={g.s} code={g.w.countries[r.id].code} h={16} /><span>{countryName(g.w, r.id)}</span>{war && <i class="tag bad">{t('led.atWar')}</i>}{ally && <i class="tag good">{t('led.ally')}</i>}</span></td>
        {COLS.map(k => <td key={k} class={`r-col num ${by === k ? 'on' : ''} ${k === 'stability' ? (r[k] < 0.3 ? 'bad' : r[k] > 0.7 ? 'good' : '') : ''}`}><span class="cellrow end">{by === k && <span class="r-bar"><i style={{ width: `${Math.max(3, bar(r[k]) * 100)}%` }} /></span>}<span>{FMT[k](r[k])}</span></span></td>)}
      </tr>; })}</tbody>
  </table>;
}

const METRICS: NationStat[] = ['gdp', 'divisions', 'provinces', 'pop'];
/** You and up to three other nations over time, on one metric at a time. */
function Compare({ g }: { g: Game }) {
  const w = g.w, me = g.player;
  const [picked, setPicked] = useState<number[]>(() => defaultRivals(g));
  const [metric, setMetric] = useState<NationStat>(() => g.w.wars.some(x => !x.ended && (x.attackers.includes(me) || x.defenders.includes(me))) ? 'provinces' : 'gdp'); // at war, land held tells the story
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
      <LineChart series={series} xs={xs} fmtX={monthX(g)} fmtY={growth ? signedPct : FMT[metric]} height={250} zero={!growth && metric !== 'gdp'} /></figure>
    <table class="h2h">
      <thead><tr><th />{ids.map((id, i) => <th key={id}><span class="cmp-key" style={{ background: SLOTS[i] }} /><Flag s={g.s} code={w.countries[id].code} h={14} /> {countryName(w, id)}</th>)}</tr></thead>
      <tbody>{COLS.filter(k => k !== 'tech').map(k => { const vals = ids.map(id => row(id)?.[k] ?? 0), best = Math.max(...vals) || 1;
        return <tr key={k}><th><span class="cellrow"><Icon name={COL_ICON[k]} size={14} />{t('led.col.' + k)}</span></th>{vals.map((v, i) => <td key={i} class={v === best ? 'best' : ''}><span class="cellrow"><b class="num">{FMT[k](v)}{v === best && ids.length > 1 ? <Icon name="up" size={10} /> : null}</b><span class="r-bar"><i style={{ width: `${Math.max(2, v / best * 100)}%`, background: SLOTS[i] }} /></span></span></td>)}</tr>; })}
        <tr><th><span class="cellrow"><Icon name="diplomacy" size={14} />{t('dip.opinion')}</span></th>{ids.map(id => { const r = id === me ? null : rel(w, id, me); return <td key={id}>{r === null ? '—' : <span class="cellrow"><b class={`num ${r < -25 ? 'bad' : r > 25 ? 'good' : ''}`}>{r > 0 ? '+' : ''}{r}</b><SignedBar v={r} /></span>}</td>; })}</tr>
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
