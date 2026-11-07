import { mixHex, clamp, smoothstep } from '../engine/math.js';

export const PALETTE = {
  ink: '#0b1030', deep: '#1c2a5a', violet: '#4b3a7a', lilac: '#9a8fc4',
  ice: '#eef4ff', snowShadow: '#b9c6e6', glacier: '#9fd4f0',
  rock: '#5d6b85', rockDark: '#2e3650', rockLight: '#8c9ab3',
  lantern: '#ffb35c', ember: '#ff7a3a', warm: '#ffcf8a',
  danger: '#ff6a4a', safeDanger: '#ffd23a',
};

// Sky keyframes through a day. dark = how much the play plane is dimmed.
const KEYS = [
  { h: 0, top: '#04071a', mid: '#0b1233', hor: '#1a2050', light: '#7d8fd6', dark: 0.66, stars: 1, aurora: 1 },
  { h: 4.2, top: '#080d28', mid: '#191a48', hor: '#3a3066', light: '#8a8fd0', dark: 0.6, stars: 0.85, aurora: 0.55 },
  { h: 5.5, top: '#1c2458', mid: '#6a4e86', hor: '#e2968a', light: '#ffb9a0', dark: 0.36, stars: 0.3, aurora: 0.1 },
  { h: 6.6, top: '#2e4888', mid: '#b47e98', hor: '#f6c49c', light: '#ffd0a8', dark: 0.15, stars: 0, aurora: 0 },
  { h: 8.6, top: '#3d66ab', mid: '#87a7d4', hor: '#d7e3f1', light: '#fff2e2', dark: 0.04, stars: 0, aurora: 0 },
  { h: 12, top: '#4a7fc8', mid: '#9dc1e8', hor: '#eef5fd', light: '#ffffff', dark: 0, stars: 0, aurora: 0 },
  { h: 16, top: '#4366ab', mid: '#8fa7d1', hor: '#e3d7d2', light: '#fff0dc', dark: 0.04, stars: 0, aurora: 0 },
  { h: 18.3, top: '#2a2e69', mid: '#7a4f8e', hor: '#ec9a72', light: '#ffa070', dark: 0.2, stars: 0.05, aurora: 0 },
  { h: 19.6, top: '#171a4b', mid: '#45357a', hor: '#9a5f86', light: '#c08ab0', dark: 0.38, stars: 0.35, aurora: 0.15 },
  { h: 21, top: '#0a0e2b', mid: '#191c49', hor: '#2d2a5d', light: '#8c90d8', dark: 0.58, stars: 0.9, aurora: 0.85 },
  { h: 24, top: '#04071a', mid: '#0b1233', hor: '#1a2050', light: '#7d8fd6', dark: 0.66, stars: 1, aurora: 1 },
];

/** Interpolated sky/light state for an hour of day, tinted toward a peak palette. */
export function timeState(hour, peak, out = {}) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(0, 1, (h - a.h) / (b.h - a.h));
  const tint = peak && peak.palette ? peak.palette : null;
  const tk = 0.14;
  out.hour = h;
  out.top = mixHex(a.top, b.top, t);
  out.mid = mixHex(a.mid, b.mid, t);
  out.hor = mixHex(a.hor, b.hor, t);
  if (tint) { out.mid = mixHex(out.mid, tint.sky, tk); out.hor = mixHex(out.hor, tint.accent, tk * 0.7); }
  out.light = mixHex(a.light, b.light, t);
  out.dark = a.dark + (b.dark - a.dark) * t;
  out.stars = a.stars + (b.stars - a.stars) * t;
  out.aurora = a.aurora + (b.aurora - a.aurora) * t;
  // Sun: rises ~5.8h, sets ~19.2h
  const day = (h - 5.8) / 13.4;
  out.sunElev = Math.sin(clamp(day, -0.2, 1.2) * Math.PI);
  out.sunX = 0.12 + clamp(day, 0, 1) * 0.76;
  out.sunUp = day > -0.03 && day < 1.03;
  out.glare = smoothstep(9.5, 12, h) * (1 - smoothstep(13, 15.5, h));
  const night = (h + 24 - 19.6) % 24; // hours since dusk
  out.moonX = 0.2 + clamp(night / 10, 0, 1) * 0.6;
  out.moonElev = Math.sin(clamp(night / 10, 0, 1) * Math.PI);
  out.moonUp = night < 10;
  out.haze = mixHex(out.hor, tint ? tint.haze : PALETTE.lilac, 0.35);
  out.bucket = Math.floor(h * 4); // 15-minute buckets for re-baking layers
  return out;
}
