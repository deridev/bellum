import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadAssets } from './data/load';
import type { MapAssets } from './data/types';
import { Session } from './game/session';
import { PickScreen } from './ui/App';
import './ui/styles.css';

function Root() {
  const [assets, setAssets] = useState<MapAssets | null>(null);
  const [prog, setProg] = useState(0); const [err, setErr] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const stage = useRef<HTMLDivElement>(null), glc = useRef<HTMLCanvasElement>(null), ovc = useRef<HTMLCanvasElement>(null);
  useEffect(() => { loadAssets((d, t) => setProg(d / t)).then(setAssets).catch(e => setErr(String(e.message || e))); }, []);
  useEffect(() => {
    if (!assets || session) return;
    try { const s = new Session(glc.current!, ovc.current!, stage.current!, assets); s.onClick = p => { if (p >= 0) s.ui.set({ selected: s.owner[p] }); }; setSession(s); (window as any).__session = s; }
    catch (e: any) { setErr(String(e.message || e)); }
  }, [assets]);
  return <>
    <div id="stage" ref={stage}><canvas id="map" ref={glc} /><canvas id="overlay" ref={ovc} />
      {session && <PickScreen s={session} onPlay={ci => { session.ui.set({ player: ci, phase: 'play' }); }} />}
    </div>
    {!session && <div class="loading"><div class="box">
      <div class="brand">BELLUM<small>Grand strategy</small></div>
      {err ? <div class="error">{err}</div> : <><div class="bar"><div style={{ width: `${Math.round(prog * 100)}%` }} /></div><div class="eyebrow">Loading the world</div></>}
    </div></div>}
  </>;
}
render(<Root />, document.getElementById('app')!);
