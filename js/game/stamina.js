import { clamp } from '../engine/math.js';

/** Grip stamina rules. All functions are pure. */
export const COSTS = { reach: 2, reachPerPx: 0.025, lunge: 9, mantle: 4, jug: 8, piton: 5, hop: 3, arrest: 14, walk: 0 };
export const HOLD_DRAIN = { jug: 0.6, crimp: 1.5, ice: 1.3, thin: 1.8 };

export const weightMultiplier = (kg) => 1 + Math.max(0, kg - 14) * 0.035;
export const speedMultiplier = (kg) => 1 / (1 + Math.max(0, kg - 14) * 0.03);
export const maxStamina = (fatigue) => 100 * clamp(fatigue, 0.35, 1);

/** Stamina lost per second while hanging on a hold. */
export function hangDrain({ holdType = 'jug', overhang = false, snow = 0, wind = 0, brace = false, weight = 14, hypoxia = 0, cold = 0, drain = 1 }) {
  const base = HOLD_DRAIN[holdType] ?? HOLD_DRAIN.jug;
  const windF = brace ? 1.45 : 1 + wind * 0.7;
  return base * (overhang ? 1.7 : 1) * (1 + snow * 0.6) * windF * weightMultiplier(weight) * (1 + hypoxia * 0.6) * (1 + cold * 0.2) * drain;
}

/** One-off cost of a movement. */
export function actionCost(kind, { distance = 0, weight = 14, hypoxia = 0, drain = 1 } = {}) {
  let c = COSTS[kind] ?? 0;
  if (kind === 'reach') c += distance * COSTS.reachPerPx;
  return c * weightMultiplier(weight) * (1 + hypoxia * 0.5) * drain;
}

/** Stamina regained per second while resting on a ledge. */
export function recovery({ sheltered = false, hypoxia = 0, cold = 0, wind = 0 }) {
  return 16 * (sheltered ? 1.3 : 1) * (1 - hypoxia * 0.55) * (1 - cold * 0.25) * (sheltered ? 1 : 1 - wind * 0.3);
}

/** Spending stamina slowly wears down the ceiling until you eat or rest. */
export const fatigueFromSpend = (spent) => spent * 0.0009;

export function spend(stamina, cost) {
  const after = stamina - cost;
  return { stamina: Math.max(0, after), exhausted: after <= 0 };
}
