import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altitudeAt, progressAt, oxygenFraction, formatAlt, formatClock, formatDuration } from '../js/game/altitude.js';

const peak = { baseAlt: 4000, summitAlt: 7000 };

test('altitude maps the route linearly from base to summit', () => {
  assert.equal(altitudeAt(0, peak, 9000), 4000);
  assert.equal(altitudeAt(9000, peak, 9000), 7000);
  assert.equal(altitudeAt(4500, peak, 9000), 5500);
});

test('altitude and progress clamp outside the route', () => {
  assert.equal(altitudeAt(-300, peak, 9000), 4000);
  assert.equal(altitudeAt(99999, peak, 9000), 7000);
  assert.equal(progressAt(-1, 100), 0);
  assert.equal(progressAt(150, 100), 1);
});

test('air thins with height', () => {
  assert.ok(oxygenFraction(8000) < oxygenFraction(4000));
  assert.ok(Math.abs(oxygenFraction(8848) - 0.31) < 0.03);
});

test('formatting', () => {
  assert.equal(formatAlt(6950), '6,950 m');
  assert.equal(formatClock(5.5), '05:30');
  assert.equal(formatClock(25.25), '01:15');
  assert.equal(formatDuration(125), '2:05');
});
