import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResources, packWeight, oxygenDrain, hypoxiaRate, tickOxygen, swapBottle, eat, transfer, campRest } from '../js/game/resources.js';
import { getDifficulty } from '../js/game/constants.js';

const std = () => createResources(getDifficulty('standard'));

test('difficulty sets the starting pack', () => {
  const g = createResources(getDifficulty('gentle')), h = createResources(getDifficulty('harsh'));
  assert.ok(g.pitons > h.pitons && g.food > h.food);
});

test('no oxygen is used below the oxygen line, more is used higher and harder', () => {
  assert.equal(oxygenDrain(5000, 6000), 0);
  assert.ok(oxygenDrain(7500, 6000) > oxygenDrain(6500, 6000));
  assert.ok(oxygenDrain(7000, 6000, 1) > oxygenDrain(7000, 6000, 0));
  assert.ok(oxygenDrain(7000, 6000, 0.5, 1.3) > oxygenDrain(7000, 6000, 0.5, 1));
});

test('a bottle drains to empty and reports it once', () => {
  let ox = { level: 0.01, spares: 1 };
  const a = tickOxygen(ox, 0.05, 1);
  assert.equal(a.ox.level, 0);
  assert.equal(a.emptied, true);
  const b = tickOxygen(a.ox, 0.05, 1);
  assert.equal(b.emptied, false);
});

test('hypoxia builds without oxygen high up and recovers with it', () => {
  assert.ok(hypoxiaRate(7000, 6000, false) > 0);
  assert.ok(hypoxiaRate(7000, 6000, true) < 0);
  assert.ok(hypoxiaRate(4000, 6000, false) < 0);
});

test('swapping bottles uses a spare', () => {
  const r = { ...std(), oxygen: { level: 0, spares: 1 } };
  const s = swapBottle(r);
  assert.equal(s.ok, true);
  assert.deepEqual(s.r.oxygen, { level: 1, spares: 0 });
  assert.equal(swapBottle(s.r).ok, false);
});

test('eating uses food and restores stamina', () => {
  const r = std();
  const e = eat(r);
  assert.equal(e.r.food, r.food - 1);
  assert.ok(e.stamina > 0 && e.fatigue > 0);
  assert.equal(eat({ ...r, food: 0 }).ok, false);
});

test('gear has weight and dropping it lightens the pack', () => {
  const r = std();
  assert.ok(packWeight({ ...r, food: 0 }) < packWeight(r));
  assert.ok(packWeight({ ...r, oxygen: { level: 1, spares: 0 } }) < packWeight(r));
});

test('camp caches refill the pack and take back what you leave', () => {
  const r = { ...std(), oxygen: { level: 0, spares: 0 }, food: 0 };
  const cache = { oxygen: 2, food: 1, pitons: 3 };
  let t = transfer(r, cache, 'oxygen', 1);
  assert.deepEqual(t.r.oxygen, { level: 1, spares: 0 }, 'an empty bottle is refilled first');
  t = transfer(t.r, t.cache, 'oxygen', 1);
  assert.equal(t.r.oxygen.spares, 1);
  assert.equal(t.cache.oxygen, 0);
  t = transfer(t.r, t.cache, 'food', 1);
  assert.equal(t.r.food, 1);
  const none = transfer(t.r, t.cache, 'food', 1);
  assert.equal(none.r.food, 1, 'cannot take from an empty cache');
  const left = transfer(t.r, t.cache, 'pitons', -1);
  assert.equal(left.cache.pitons, 4);
});

test('resting at camp restores condition, more for longer rests', () => {
  const p = { fatigue: 0.4, health: 50, hypoxia: 0.5, stamina: 10 };
  const short = campRest(p, 2), long = campRest(p, 8);
  assert.ok(short.health > 50 && long.health > short.health);
  assert.ok(long.fatigue >= short.fatigue);
  assert.equal(short.stamina, 100);
  assert.ok(short.hypoxia < 0.5);
});
