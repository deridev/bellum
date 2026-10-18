// Sound, synthesized on the fly (no audio files): interface ticks, war drums, a peace chime,
// and distant artillery that follows how much fighting is on screen.
import { prefs } from './settings';

export type Cue = 'click' | 'open' | 'order' | 'war' | 'peace' | 'alert';

class Audio {
  private ctx: AudioContext | null = null; private master!: GainNode; private rumble!: GainNode; private noise!: AudioBuffer;
  private nextBoom = 0;
  /** the context starts on the first cue, which always comes from a click */
  private ready() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return null; }
      const c = this.ctx; this.master = c.createGain(); this.master.connect(c.destination); this.level();
      prefs.sub(() => this.level());
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = this.noise.getChannelData(0); let b = 0;
      for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; } // brown noise
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
      this.rumble = c.createGain(); this.rumble.gain.value = 0; src.connect(lp).connect(this.rumble).connect(this.master); src.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  private level() { const p = prefs.get(); if (this.ctx) this.master.gain.setTargetAtTime(p.muted ? 0 : p.volume * 0.8, this.ctx.currentTime, 0.05); }
  private tone(f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', at = 0) {
    const c = this.ctx!, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private burst(dur: number, vol: number, freq: number, at = 0) {
    const c = this.ctx!, t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  cue(c: Cue) {
    if (prefs.get().muted || !this.ready()) return;
    switch (c) {
      case 'click': this.tone(1400, 900, 0.035, 0.05, 'triangle'); break;
      case 'open': this.tone(520, 780, 0.09, 0.04); break;
      case 'order': this.burst(0.25, 0.5, 400); this.tone(180, 90, 0.2, 0.12); break;
      case 'war': for (let i = 0; i < 3; i++) { this.burst(0.5, 0.9, 220, i * 0.38); this.tone(70, 40, 0.5, 0.35, 'sine', i * 0.38); } break;
      case 'peace': [523.3, 659.3, 784].forEach((f, i) => this.tone(f, f, 1.6, 0.07, 'sine', i * 0.12)); break;
      case 'alert': this.tone(440, 440, 0.18, 0.06, 'square'); this.tone(330, 330, 0.25, 0.05, 'square', 0.2); break;
    }
  }
  /** per frame: a low rumble and occasional distant booms while fighting is in view */
  ambience(heat: number, playing: boolean) {
    if (!this.ctx || prefs.get().muted) return;
    const k = playing ? Math.min(1, heat) : 0, now = this.ctx.currentTime;
    this.rumble.gain.setTargetAtTime(k * 0.35, now, 0.6);
    if (k > 0.05 && now > this.nextBoom) { this.burst(0.6 + Math.random() * 0.6, 0.15 + 0.35 * Math.random() * k, 160 + Math.random() * 200); this.nextBoom = now + (0.15 + Math.random() * 1.2) / k; }
  }
}
export const audio = new Audio();
