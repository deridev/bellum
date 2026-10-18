import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadAssets } from './data/load';
import type { MapAssets } from './data/types';
import { Session } from './game/session';
import { SetupScreen, TitleScreen } from './ui/App';
import { Hud } from './ui/Hud';
import { TipLayer } from './ui/common';
import { Game } from './game/play';
import { loadGame } from './game/save';
import { onLang, registerCountries, t } from './i18n';
import './ui/styles.css';

type Phase = 'title' | 'setup' | 'play';
function Root() {
  const [assets, setAssets] = useState<MapAssets | null>(null);
  const [prog, setProg] = useState(0); const [err, setErr] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [phase, setPhase] = useState<Phase>('title');
  const [, setLangTick] = useState(0);
  const stage = useRef<HTMLDivElement>(null), glc = useRef<HTMLCanvasElement>(null), ovc = useRef<HTMLCanvasElement>(null);
  useEffect(() => onLang(() => { document.documentElement.lang = t('lang.code'); setLangTick(x => x + 1); }) as () => void, []);
  useEffect(() => { document.documentElement.lang = t('lang.code'); loadAssets((d, n) => setProg(d / n)).then(a => { registerCountries(a.countries); setAssets(a); }).catch(e => setErr(String(e.message || e))); }, []);
  useEffect(() => {
    if (!assets || session) return;
    try { const s = new Session(glc.current!, ovc.current!, stage.current!, assets); s.onClick = p => { if (p >= 0) s.ui.set({ selected: s.owner[p] }); }; setSession(s); (window as any).__session = s; }
    catch (e: any) { setErr(String(e.message || e)); }
  }, [assets]);
  const start = (s: Session, ci: number) => { s.ui.set({ player: ci, phase: 'play', selected: -1 }); const g = new Game(s, ci); (window as any).__game = g; setGame(g); setPhase('play'); s.focusCountry(ci); };
  const resume = async (s: Session, slot: string) => {
    const w = loadGame(slot); if (!w) return;
    const p = Math.max(0, w.countries.findIndex(c => c.player));
    const g = new Game(s, p); await g.loadWorld(w); (window as any).__game = g; setGame(g); setPhase('play');
  };
  return <><TipLayer />
    <div id="stage" ref={stage} class={phase === 'title' ? 'dim' : ''}><canvas id="map" ref={glc} /><canvas id="overlay" ref={ovc} />
      {session && phase === 'title' && <TitleScreen s={session} onNew={() => setPhase('setup')} onLoad={slot => resume(session, slot)} />}
      {session && phase === 'setup' && <SetupScreen s={session} onPlay={ci => start(session, ci)} onBack={() => setPhase('title')} />}
      {game && phase === 'play' && <Hud g={game} />}
    </div>
    {!session && <div class="loading"><div class="box">
      <div class="wordmark small">BELLUM</div>
      {err ? <div class="error">{err}</div> : <><div class="bar"><div style={{ width: `${Math.round(prog * 100)}%` }} /></div><div class="eyebrow">{t('loading')}</div></>}
    </div></div>}
  </>;
}
render(<Root />, document.getElementById('app')!);
