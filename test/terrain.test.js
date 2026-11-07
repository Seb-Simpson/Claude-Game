import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain, isClimbable, wallEdgesAt } from '../js/game/terrain.js';
import { PEAKS } from '../js/game/peaks.js';
import { REACH } from '../js/game/constants.js';

const gen = (seed, peak = PEAKS[0], lungeScale = 1) => generateTerrain({ seed, height: peak.height, camps: peak.camps, profile: peak.profile, lungeScale });
const strip = (t) => JSON.stringify({ ...t, wall: { ...t.wall, left: [...t.wall.left], right: [...t.wall.right] } });

test('same seed produces an identical route', () => {
  assert.equal(strip(gen('alpha')), strip(gen('alpha')));
});

test('different seeds produce different routes', () => {
  assert.notEqual(strip(gen('alpha')), strip(gen('beta')));
});

test('every generated route is climbable', () => {
  for (const peak of PEAKS) {
    for (let s = 0; s < 8; s++) {
      assert.ok(isClimbable(gen('c' + s, peak, 1)), `${peak.id} seed c${s} with lunges`);
      assert.ok(isClimbable(gen('g' + s, peak, 0), { lunge: REACH }), `${peak.id} seed g${s} static only`);
    }
  }
});

test('gentle routes need no lunges', () => {
  const t = gen('soft', PEAKS[1], 0);
  assert.equal(t.holds.filter((h) => h.lungeTarget).length, 0);
});

test('route has base camp, intermediate camps and a summit at the top', () => {
  const peak = PEAKS[1];
  const t = gen('camps', peak);
  assert.equal(t.camps.length, peak.camps + 1);
  assert.equal(t.camps[0].index, 0);
  const summit = t.ledges.find((l) => l.id === t.summitId);
  assert.equal(summit.kind, 'summit');
  assert.equal(t.height, summit.y);
  assert.ok(Math.max(...t.holds.map((h) => h.y)) < summit.y);
  for (const c of t.camps.slice(1)) assert.ok(c.supplies.oxygen > 0 && c.supplies.food > 0);
});

test('holds and ledges sit inside the wall', () => {
  const t = gen('inside', PEAKS[2]);
  for (const h of t.holds) {
    const [l, r] = wallEdgesAt(t.wall, h.y);
    assert.ok(h.x > l && h.x < r, `hold ${h.id} at ${h.x},${h.y} outside ${l}..${r}`);
  }
});

test('route features include ledges, chimneys or overhangs, and ice', () => {
  const t = gen('variety', PEAKS[2]);
  const types = new Set(t.features.map((f) => f.type));
  assert.ok(t.ledges.length > 6);
  assert.ok(types.size >= 2);
  assert.ok(t.holds.some((h) => h.type === 'ice' || h.type === 'thin'));
});
