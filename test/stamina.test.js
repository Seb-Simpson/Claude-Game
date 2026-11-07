import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hangDrain, actionCost, recovery, maxStamina, spend, weightMultiplier, speedMultiplier } from '../js/game/stamina.js';

test('small and icy holds drain faster than jugs', () => {
  const jug = hangDrain({ holdType: 'jug' });
  assert.ok(hangDrain({ holdType: 'crimp' }) > jug);
  assert.ok(hangDrain({ holdType: 'ice' }) > jug);
});

test('overhangs, snow, wind, weight and thin air all add drain', () => {
  const base = hangDrain({});
  assert.ok(hangDrain({ overhang: true }) > base);
  assert.ok(hangDrain({ snow: 1 }) > base);
  assert.ok(hangDrain({ wind: 1 }) > base);
  assert.ok(hangDrain({ weight: 25 }) > base);
  assert.ok(hangDrain({ hypoxia: 1 }) > base);
});

test('bracing costs more in calm air but less in strong wind', () => {
  assert.ok(hangDrain({ brace: true, wind: 0 }) > hangDrain({ wind: 0 }));
  assert.ok(hangDrain({ brace: true, wind: 1 }) < hangDrain({ wind: 1 }));
});

test('reach cost grows with distance and pack weight', () => {
  assert.ok(actionCost('reach', { distance: 70 }) > actionCost('reach', { distance: 20 }));
  assert.ok(actionCost('reach', { distance: 40, weight: 24 }) > actionCost('reach', { distance: 40, weight: 14 }));
  assert.ok(actionCost('lunge') > actionCost('reach', { distance: 76 }));
});

test('resting recovers faster when sheltered and slower in thin air', () => {
  assert.ok(recovery({ sheltered: true }) > recovery({}));
  assert.ok(recovery({ hypoxia: 1 }) < recovery({}));
  assert.ok(recovery({}) > 0);
});

test('fatigue caps the stamina ceiling but never below 35', () => {
  assert.equal(maxStamina(1), 100);
  assert.equal(maxStamina(0.5), 50);
  assert.equal(maxStamina(0), 35);
});

test('spending past zero flags exhaustion', () => {
  assert.deepEqual(spend(10, 4), { stamina: 6, exhausted: false });
  assert.deepEqual(spend(3, 4), { stamina: 0, exhausted: true });
});

test('weight helpers are neutral up to 14 kg', () => {
  assert.equal(weightMultiplier(10), 1);
  assert.equal(speedMultiplier(14), 1);
  assert.ok(speedMultiplier(24) < 1);
});
