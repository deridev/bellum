import { hooks } from './step';
import { stepWars } from './war/war';
import { warAI } from './war/ai';
import { expireAgenda } from './agenda';
let ready = false;
/** Register every system with the daily/monthly step (idempotent). */
export function initSim() {
  if (ready) return; ready = true;
  hooks.daily.push(stepWars, warAI, expireAgenda);
}
