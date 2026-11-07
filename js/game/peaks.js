import { createRng, hashString } from '../engine/rng.js';

export const PEAKS = [
  {
    id: 'kestrel', name: 'Kestrel Spire', blurb: 'A granite needle above the larch valleys. Clear mornings, rose light, honest rock.',
    baseAlt: 3200, summitAlt: 5480, height: 7000, camps: 2, oxygenAlt: 5100, startHour: 5.2,
    rating: 1, weatherLabel: 'Mostly fair, afternoon flurries',
    palette: { rock: '#5f6d88', rockDark: '#2f3753', rockLight: '#93a1bb', snow: '#eef4ff', haze: '#a99ac8', sky: '#c97b84', accent: '#f2b38a', ice: '#a9d8f2' },
    weather: { clear: 5, breezy: 4, snow: 2, heavy: 0.6, storm: 0.25, whiteout: 0.1 },
    key: { root: 50, mode: 'dorian' },
    profile: { ice: 0.06, snow: 0.3, overhang: 0.14, chimney: 0.18, traverse: 0.16, lunge: 0.07, thin: 0.15, crevasse: 0.15, rockfall: 0.35, avalanche: 0.1 },
  },
  {
    id: 'warden', name: 'The Pale Warden', blurb: 'A broad snow giant wrapped in violet dusk. Long ridges, deep cornices, restless winds.',
    baseAlt: 4300, summitAlt: 6950, height: 9000, camps: 3, oxygenAlt: 6000, startHour: 5.0,
    rating: 2, weatherLabel: 'Changeable, heavy snow, avalanche-prone',
    palette: { rock: '#5a6283', rockDark: '#2a2c4e', rockLight: '#8f93b8', snow: '#f1f2ff', haze: '#9a8fc4', sky: '#8a5a9a', accent: '#e8a0a8', ice: '#b4c8f4' },
    weather: { clear: 3, breezy: 4, snow: 4, heavy: 2, storm: 0.8, whiteout: 0.4 },
    key: { root: 45, mode: 'aeolian' },
    profile: { ice: 0.14, snow: 0.6, overhang: 0.1, chimney: 0.12, traverse: 0.18, lunge: 0.09, thin: 0.25, crevasse: 0.45, rockfall: 0.2, avalanche: 0.45 },
  },
  {
    id: 'hollowhorn', name: 'Hollowhorn', blurb: 'A black horn of ice in the high cold. Thin air, glassy shelves, storms that do not ask.',
    baseAlt: 5600, summitAlt: 8240, height: 10600, camps: 3, oxygenAlt: 6400, startHour: 4.6,
    rating: 3, weatherLabel: 'Severe: jet-stream winds, whiteouts',
    palette: { rock: '#4f6276', rockDark: '#1f2c3e', rockLight: '#86a3b6', snow: '#eafaff', haze: '#7fa6c4', sky: '#4a6fa0', accent: '#9fd4f0', ice: '#8fe0ff' },
    weather: { clear: 2, breezy: 3, snow: 3, heavy: 2.5, storm: 1.6, whiteout: 0.9 },
    key: { root: 52, mode: 'phrygian' },
    profile: { ice: 0.3, snow: 0.45, overhang: 0.18, chimney: 0.1, traverse: 0.14, lunge: 0.12, thin: 0.35, crevasse: 0.35, rockfall: 0.4, avalanche: 0.3 },
  },
];

const SYL_A = ['Ash', 'Vel', 'Mor', 'Kai', 'Sil', 'Thal', 'Bre', 'Ond', 'Ise', 'Cor', 'Wen', 'Hal'];
const SYL_B = ['dra', 'mir', 'ven', 'ros', 'tal', 'leth', 'nor', 'vik', 'mere', 'thorn'];
const SUFFIX = ['Peak', 'Spire', 'Horn', 'Tooth', 'Crown', 'Needle'];
const MODES = ['dorian', 'aeolian', 'phrygian', 'lydian', 'mixolydian'];

export function dailySeed(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** A peak generated from today's date: everyone gets the same mountain. */
export function dailyPeak(date = new Date()) {
  const day = dailySeed(date);
  const rng = createRng('daily:' + day);
  const a = PEAKS[rng.int(0, 2)], b = PEAKS[rng.int(0, 2)];
  const mixN = (x, y) => Math.round(x + (y - x) * rng.next());
  const name = `${rng.pick(SYL_A)}${rng.pick(SYL_B)} ${rng.pick(SUFFIX)}`;
  const baseAlt = mixN(3400, 5200);
  const gain = mixN(2300, 2900);
  const profile = {};
  for (const k in a.profile) profile[k] = a.profile[k] + (b.profile[k] - a.profile[k]) * rng.next();
  const weather = {};
  for (const k in a.weather) weather[k] = a.weather[k] + (b.weather[k] - a.weather[k]) * rng.next();
  return {
    id: 'daily', daily: day, name, blurb: `Today's mountain. Everyone climbing on ${day} faces the same route and the same sky.`,
    baseAlt, summitAlt: baseAlt + gain, height: Math.round(gain * 3.6), camps: 3,
    oxygenAlt: Math.min(baseAlt + gain - 600, 6000), startHour: 5,
    rating: 2, weatherLabel: 'Unknown: read the sky',
    palette: rng.chance(0.5) ? a.palette : b.palette,
    weather, key: { root: 45 + rng.int(0, 7), mode: rng.pick(MODES) },
    profile, seedSalt: hashString(day),
  };
}

export const getPeak = (id) => (id === 'daily' ? dailyPeak() : PEAKS.find((p) => p.id === id) || PEAKS[0]);
