import { FALL_SAFE, FALL_FATAL, ROPE_LENGTH, ROPE_SLACK } from './constants.js';

/** Rope and fall resolution. Pure functions. */

/** Distance from the last anchor to the climber's harness. */
export const runOut = (anchor, x, y) => Math.hypot(x - anchor.x, y - anchor.y);

/** Whether the rope can still catch a fall: you must be within rope length of the last anchor. */
export const isProtected = (anchor, x, y, length = ROPE_LENGTH) => !!anchor && runOut(anchor, x, y) <= length;

/**
 * Where a straight-down fall is arrested by the rope. The rope length at the
 * moment of the fall (plus slack) defines a circle around the anchor; the
 * climber stops where they reach its lower edge.
 */
export function catchY(anchor, x, ropeOut, slack = ROPE_SLACK) {
  const L = ropeOut + slack;
  const dx = x - anchor.x;
  if (Math.abs(dx) >= L) return anchor.y; // swings in from the side
  return anchor.y - Math.sqrt(L * L - dx * dx);
}

/** Damage (0..100) from a fall of a given distance. Rope stretch softens arrested falls. */
export function fallDamage(distance, { roped = false, ropeOut = 0, fallDamage: mult = 1 } = {}) {
  if (distance <= FALL_SAFE) return 0;
  if (roped) {
    // fall factor: fall distance relative to rope paid out; dynamic rope absorbs more over a long run
    const factor = Math.min(2, distance / Math.max(40, ropeOut + ROPE_SLACK));
    return Math.round((distance - FALL_SAFE) * 0.1 * (0.5 + factor * 0.5) * mult);
  }
  return Math.round((distance - FALL_SAFE) * 0.24 * mult);
}

export const isFatalFall = (distance, roped) => !roped && distance > FALL_FATAL;

/** Metres of rope still available beyond the last anchor (for the HUD). */
export function ropeRemaining(anchor, x, y, length = ROPE_LENGTH) {
  if (!anchor) return 0;
  return Math.max(0, length - runOut(anchor, x, y));
}
