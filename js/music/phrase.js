/**
 * Seeded melodic phrase generator. Phrases move mostly by step, leap
 * occasionally, rest often, and land on a chord tone. Some phrases restate an
 * earlier motif transposed, so the melody develops instead of repeating.
 */
export function generatePhrase(rng, opts = {}) {
  const { chordRoot = 0, density = 0.5, centre = 7, span = 6, memory = null, maxBeats = 8 } = opts;
  if (memory && memory.length && rng.chance(0.3)) {
    const shift = rng.pick([-2, -1, 1, 2, 3]);
    return memory.map((n) => (n.deg === null ? { ...n } : { ...n, deg: clampDeg(n.deg + shift, centre, span) }));
  }
  const notes = [];
  let beats = 0;
  let deg = centre + chordRoot + rng.pick([0, 2, 4]) - (chordRoot > 3 ? 7 : 0);
  deg = clampDeg(deg, centre, span);
  const durs = density > 0.6 ? [[0.5, 2], [1, 4], [1.5, 2], [2, 2]] : [[1, 3], [1.5, 2], [2, 3], [3, 2], [4, 1]];
  while (beats < maxBeats - 0.5) {
    if (notes.length && rng.chance(0.28 * (1 - density))) {
      const r = rng.pick([1, 1.5, 2]);
      notes.push({ deg: null, dur: r, vel: 0 });
      beats += r;
      continue;
    }
    const dur = Math.min(rng.weighted(durs), maxBeats - beats);
    notes.push({ deg, dur, vel: 0.55 + rng.next() * 0.35 });
    beats += dur;
    const leap = rng.chance(0.18);
    const step = leap ? rng.pick([-4, -3, 3, 4]) : rng.pick([-2, -1, -1, 1, 1, 2]);
    deg = clampDeg(deg + step, centre, span);
  }
  // resolve the last sounding note onto a chord tone
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].deg === null) continue;
    const d = notes[i].deg;
    const tones = [0, 2, 4].map((t) => t + chordRoot);
    let best = d, bd = 99;
    for (let o = -14; o <= 14; o += 7) for (const t of tones) { const c = t + o; if (Math.abs(c - d) < bd) { bd = Math.abs(c - d); best = c; } }
    notes[i].deg = best;
    notes[i].dur = Math.max(notes[i].dur, 2);
    break;
  }
  return notes;
}

function clampDeg(d, centre, span) {
  if (d > centre + span) return d - 7 >= centre - span ? d - 7 : centre + span;
  if (d < centre - span) return d + 7 <= centre + span ? d + 7 : centre - span;
  return d;
}

export const phraseBeats = (p) => p.reduce((s, n) => s + n.dur, 0);
