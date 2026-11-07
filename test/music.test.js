import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMix } from '../js/music/mixer.js';
import { quantize, degreeToMidi, MODES, chordDegrees } from '../js/music/theory.js';
import { generatePhrase, phraseBeats } from '../js/music/phrase.js';
import { createRng } from '../js/engine/rng.js';

const inRange = (m) => { for (const k in m) if (k !== 'tempo') assert.ok(m[k] >= 0 && m[k] <= 1, `${k}=${m[k]}`); };

test('mix levels stay in range for extreme inputs', () => {
  for (const scene of ['title', 'climb', 'camp', 'summit', 'end']) {
    inRange(computeMix({ scene, altitude: 2, stamina: -1, danger: 5, storm: 3, night: 1, hypoxia: 1 }));
    inRange(computeMix({ scene }));
  }
});

test('low stamina brings in the heartbeat pulse and quickens it', () => {
  const rested = computeMix({ scene: 'climb', stamina: 1 });
  const spent = computeMix({ scene: 'climb', stamina: 0.1 });
  assert.equal(rested.pulse, 0);
  assert.ok(spent.pulse > 0.5);
  assert.ok(spent.tempo > rested.tempo);
  assert.ok(spent.tension > rested.tension);
});

test('storm stem follows weather; camp is warm; summit resolves', () => {
  assert.ok(computeMix({ scene: 'climb', storm: 1 }).storm > computeMix({ scene: 'climb', storm: 0.2 }).storm);
  const camp = computeMix({ scene: 'camp', storm: 1, stamina: 0.1 });
  assert.equal(camp.warmth, 1);
  assert.equal(camp.pulse, 0);
  assert.equal(camp.major, 1);
  const summit = computeMix({ scene: 'summit', altitude: 1 });
  assert.ok(summit.melody > 0.8 && summit.brightness > 0.9 && summit.major === 1);
});

test('altitude brightens the pads and opens the upper voice', () => {
  const low = computeMix({ scene: 'climb', altitude: 0 }), high = computeMix({ scene: 'climb', altitude: 1 });
  assert.ok(high.brightness > low.brightness && high.upper > low.upper && high.drone > low.drone);
});

test('quantize snaps to the key', () => {
  const root = 50;
  for (let m = 30; m < 90; m++) {
    const q = quantize(m, root, 'dorian');
    const pc = (((q - root) % 12) + 12) % 12;
    assert.ok(MODES.dorian.includes(pc), `${m} -> ${q}`);
    assert.ok(Math.abs(q - m) <= 1);
  }
});

test('scale degrees wrap octaves in both directions', () => {
  assert.equal(degreeToMidi(60, 'ionian', 0), 60);
  assert.equal(degreeToMidi(60, 'ionian', 7), 72);
  assert.equal(degreeToMidi(60, 'ionian', -1), 59);
  assert.equal(degreeToMidi(60, 'aeolian', 2), 63);
  assert.deepEqual(chordDegrees(0, 'sus2'), [0, 1, 4]);
  assert.deepEqual(chordDegrees(2), [2, 4, 6, 10]);
});

test('phrases are seeded, bounded and resolve on a chord tone', () => {
  const a = generatePhrase(createRng('p'), { chordRoot: 3 });
  const b = generatePhrase(createRng('p'), { chordRoot: 3 });
  assert.deepEqual(a, b);
  for (let s = 0; s < 50; s++) {
    const p = generatePhrase(createRng('q' + s), { chordRoot: s % 7, maxBeats: 8 });
    assert.ok(phraseBeats(p) <= 8, `phrase ${s} is ${phraseBeats(p)} beats`);
    const last = [...p].reverse().find((n) => n.deg !== null);
    const rel = (((last.deg - (s % 7)) % 7) + 7) % 7;
    assert.ok([0, 2, 4].includes(rel), `phrase ${s} ends on degree ${last.deg}`);
  }
});
