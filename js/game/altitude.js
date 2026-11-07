import { clamp } from '../engine/math.js';

/** Convert a world y to metres above sea level for a peak. */
export function altitudeAt(y, peak, routeHeight) {
  const t = clamp(y / routeHeight, 0, 1);
  return Math.round(peak.baseAlt + t * (peak.summitAlt - peak.baseAlt));
}
/** 0 at base, 1 at summit. */
export const progressAt = (y, routeHeight) => clamp(y / routeHeight, 0, 1);

/** Rough partial pressure of oxygen relative to sea level (barometric). */
export const oxygenFraction = (metres) => Math.exp(-metres / 7600);

/** Metres to feet, for display only. */
export const toFeet = (m) => Math.round(m * 3.28084);

export function formatAlt(m) {
  return `${Math.round(m).toLocaleString('en-US')} m`;
}
export function formatClock(hours) {
  const h = Math.floor(((hours % 24) + 24) % 24);
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
