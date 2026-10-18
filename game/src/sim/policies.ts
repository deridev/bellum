// National policies: one-off decisions that spend influence or savings. They give peacetime something to do
// with the resources that pile up, and the AI uses the same rules.
import { atWar } from './economy';
import { clamp01 } from './world';
import type { Country, Msg, World } from './types';
import { msg } from './types';

export type PolicyId = 'stimulus' | 'research' | 'warBonds' | 'propaganda' | 'concessions' | 'integrate';
interface Policy {
  panel: 'economy' | 'politics'; icon: string;
  influence?: number; treasury?: number; // treasury cost in months of revenue
  cooldown: number; // days
  blocked?: (w: World, c: Country) => Msg | null;
  apply: (w: World, c: Country) => void;
}
export const researchNeed = (c: Country) => c.gdpStart * 0.04 * Math.pow(1.5, c.tech);

export const POLICIES: Record<PolicyId, Policy> = {
  // economy: spend savings
  stimulus: { panel: 'economy', icon: 'gdp', treasury: 4, cooldown: 365,
    apply: (w, c) => { for (const p of w.provinces) if (p.owner === c.id && p.controller === c.id) p.gdp *= 1.02; } },
  research: { panel: 'economy', icon: 'trend', treasury: 3, cooldown: 365,
    apply: (_w, c) => { c.research += researchNeed(c) * 0.6; } },
  warBonds: { panel: 'economy', icon: 'treasury', cooldown: 180,
    blocked: (w, c) => atWar(w, c.id) ? null : msg('pol.why.peace'),
    apply: (_w, c) => { const v = c.income * 3; c.treasury += v; c.debt += v * 1.1; c.warSupport = clamp01(c.warSupport + 0.03); } },
  // politics: spend influence
  propaganda: { panel: 'politics', icon: 'warSupport', influence: 30, cooldown: 180,
    apply: (_w, c) => { c.warSupport = clamp01(c.warSupport + 0.12); } },
  concessions: { panel: 'politics', icon: 'g_labor', influence: 25, cooldown: 180,
    apply: (_w, c) => { const g = c.groups.slice().sort((a, b) => a.support - b.support)[0]; g.support = clamp01(g.support + 0.15); } },
  integrate: { panel: 'politics', icon: 'stability', influence: 40, cooldown: 365,
    blocked: (w, c) => w.provinces.some(p => p.owner === c.id && p.unrest > 0) ? null : msg('pol.why.noUnrest'),
    apply: (w, c) => { for (const p of w.provinces) if (p.owner === c.id) p.unrest *= 0.5; } },
};

/** Can this country enact the policy now? The reason is shown on the button when it can't. */
export function policyOdds(w: World, c: Country, id: PolicyId): { ok: boolean; why: Msg } {
  const P = POLICIES[id], cd = w.cooldowns[`pol:${c.id}:${id}`] ?? -1;
  if (cd > w.day) return { ok: false, why: msg('dip.why.cooldown', { d: { d: cd } }) };
  const b = P.blocked?.(w, c); if (b) return { ok: false, why: b };
  if (P.influence && c.polCap < P.influence) return { ok: false, why: msg('dip.why.influence', { n: P.influence }) };
  if (P.treasury && c.treasury < c.income * P.treasury) return { ok: false, why: msg('pol.why.treasury', { n: P.treasury }) };
  return { ok: true, why: msg(`pol.${id}.hint`) };
}
export function enactPolicy(w: World, c: Country, id: PolicyId) {
  if (!policyOdds(w, c, id).ok) return false;
  const P = POLICIES[id];
  if (P.influence) c.polCap -= P.influence;
  if (P.treasury) c.treasury -= c.income * P.treasury;
  w.cooldowns[`pol:${c.id}:${id}`] = w.day + P.cooldown;
  P.apply(w, c); return true;
}

/** What the AI reaches for: support at war, calm at home, integration after conquest, growth with spare savings. */
export function aiPolicies(w: World, c: Country) {
  const war = atWar(w, c.id);
  if (war && c.warSupport < 0.3) enactPolicy(w, c, 'propaganda');
  if (c.stability < 0.4) enactPolicy(w, c, 'concessions');
  if (c.polCap > 100) enactPolicy(w, c, 'integrate');
  if (!war && c.treasury > c.income * 8) enactPolicy(w, c, c.tech < 6 ? 'research' : 'stimulus');
}
