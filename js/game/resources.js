import { clamp } from '../engine/math.js';

/** Food, oxygen, pitons and pack weight. Pure functions over a plain object. */
export const ITEM_WEIGHT = { food: 0.5, bottle: 3, piton: 0.25, base: 4, rope: 3 };

export function createResources(diff) {
  return { food: diff.food, oxygen: { level: 1, spares: Math.max(0, diff.oxygen - 1) }, pitons: diff.pitons };
}

export function packWeight(r) {
  const bottles = r.oxygen.spares + (r.oxygen.level > 0 ? 1 : 0);
  return ITEM_WEIGHT.base + ITEM_WEIGHT.rope + r.food * ITEM_WEIGHT.food + bottles * ITEM_WEIGHT.bottle + r.pitons * ITEM_WEIGHT.piton;
}

/** Fraction of a bottle used per second. Zero below the peak's oxygen line. */
export function oxygenDrain(altitude, oxygenAlt, exertion = 0.5, drain = 1) {
  if (altitude < oxygenAlt) return 0;
  return 0.0042 * (1 + (altitude - oxygenAlt) / 1500) * (0.6 + clamp(exertion) * 0.8) * drain;
}

/** Change in hypoxia per second. Positive builds, negative recovers. */
export function hypoxiaRate(altitude, oxygenAlt, breathingOxygen) {
  if (altitude < oxygenAlt - 400 || breathingOxygen) return -0.05;
  if (altitude < oxygenAlt) return -0.01;
  return 0.016 * (1 + (altitude - oxygenAlt) / 1000);
}

/** Apply a tick of oxygen use. Returns the new oxygen state and whether the bottle just emptied. */
export function tickOxygen(ox, perSecond, dt) {
  if (perSecond <= 0 || ox.level <= 0) return { ox, emptied: false };
  const level = Math.max(0, ox.level - perSecond * dt);
  return { ox: { ...ox, level }, emptied: level === 0 && ox.level > 0 };
}

export function swapBottle(r) {
  if (r.oxygen.spares <= 0) return { r, ok: false };
  return { r: { ...r, oxygen: { level: 1, spares: r.oxygen.spares - 1 } }, ok: true };
}

export function eat(r) {
  if (r.food <= 0) return { r, ok: false };
  return { r: { ...r, food: r.food - 1 }, ok: true, stamina: 40, fatigue: 0.28 };
}

/** Move items between pack and a camp cache. amount > 0 takes, < 0 leaves. */
export function transfer(r, cache, item, amount) {
  const pack = { ...r, oxygen: { ...r.oxygen } };
  const c = { ...cache };
  if (item === 'oxygen') {
    if (amount > 0 && c.oxygen > 0) {
      // fill the current bottle first, else carry a spare
      if (pack.oxygen.level < 0.05) pack.oxygen.level = 1; else pack.oxygen.spares++;
      c.oxygen--;
    } else if (amount < 0 && pack.oxygen.spares > 0) { pack.oxygen.spares--; c.oxygen++; }
  } else if (amount > 0 && c[item] > 0) { pack[item]++; c[item]--; }
  else if (amount < 0 && pack[item] > 0) { pack[item]--; c[item]++; }
  return { r: pack, cache: c };
}

/** Resting at camp: restores stamina ceiling and some health; time passes. */
export function campRest(p, hours, sheltered = true) {
  const k = clamp(hours / 6);
  return {
    fatigue: clamp(p.fatigue + 0.25 + k * 0.5, 0, 1),
    health: clamp(p.health + 8 + k * 40, 0, 100),
    hypoxia: Math.max(0, p.hypoxia - 0.4 - k),
    stamina: sheltered ? 100 : p.stamina,
  };
}
