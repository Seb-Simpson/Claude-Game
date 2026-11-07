/** Modal theory helpers. Pure, no audio. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};
// Chord progressions as scale degrees (0-based), chosen to suit each mode.
export const PROGRESSIONS = {
  ionian: [[0, 5, 3, 4], [0, 3, 5, 4]],
  dorian: [[0, 3, 6, 4], [0, 6, 3, 0], [0, 4, 3, 6]],
  phrygian: [[0, 1, 0, 6], [0, 5, 1, 0], [0, 3, 1, 6]],
  lydian: [[0, 1, 4, 0], [0, 1, 5, 4]],
  mixolydian: [[0, 6, 3, 0], [0, 4, 6, 3]],
  aeolian: [[0, 5, 3, 6], [0, 3, 5, 4], [0, 6, 5, 6]],
};

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** MIDI note for a scale degree (may be negative or beyond 7: wraps octaves). */
export function degreeToMidi(root, mode, degree) {
  const s = MODES[mode] || MODES.aeolian;
  const oct = Math.floor(degree / 7);
  const idx = ((degree % 7) + 7) % 7;
  return root + oct * 12 + s[idx];
}

/** Snap any MIDI note to the nearest note in the key. Ties resolve downward. */
export function quantize(midi, root, mode) {
  const s = MODES[mode] || MODES.aeolian;
  const rel = midi - root;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let best = s[0], bd = 99;
  for (const n of [...s, 12]) {
    const d = Math.abs(n - pc);
    if (d < bd) { bd = d; best = n; }
  }
  return root + oct * 12 + best;
}

/** Triad (plus colour tone) built on a degree, as scale degrees. */
export function chordDegrees(degree, colour = 'add9') {
  const base = [degree, degree + 2, degree + 4];
  if (colour === 'add9') base.push(degree + 8);
  if (colour === 'sus2') base[1] = degree + 1;
  if (colour === 'sus4') base[1] = degree + 3;
  return base;
}
