/** Seeded PRNG (mulberry32) and value noise. Deterministic across platforms. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed) {
  let s = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    weighted(entries) {
      let total = 0;
      for (const e of entries) total += e[1];
      let r = next() * total;
      for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
      return entries[entries.length - 1][0];
    },
    fork: (salt) => createRng((s ^ hashString(String(salt))) >>> 0),
  };
}

/** 1D value noise with smooth interpolation, period 256. */
export function createNoise1D(seed) {
  const rng = createRng(seed);
  const table = new Float32Array(256);
  for (let i = 0; i < 256; i++) table[i] = rng.next() * 2 - 1;
  const noise = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[i & 255], b = table[(i + 1) & 255];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
  noise.fbm = (x, oct = 4) => {
    let v = 0, amp = 0.5, freq = 1;
    for (let o = 0; o < oct; o++) { v += noise(x * freq + o * 31.7) * amp; amp *= 0.5; freq *= 2; }
    return v;
  };
  return noise;
}
