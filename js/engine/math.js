export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const cache = new Map();
export function rgb(hex) {
  let v = cache.get(hex);
  if (!v) { v = hexToRgb(hex); cache.set(hex, v); }
  return v;
}
/** Mix two hex colours, returns an rgb() string. */
export function mix(a, b, t) {
  const ca = rgb(a), cb = rgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}
export function mixHex(a, b, t) {
  const ca = rgb(a), cb = rgb(b);
  const h = (i) => Math.round(lerp(ca[i], cb[i], t)).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}
export function rgba(hex, a) {
  const c = rgb(hex);
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
