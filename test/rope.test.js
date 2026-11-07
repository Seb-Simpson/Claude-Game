import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catchY, fallDamage, isFatalFall, isProtected, runOut, ropeRemaining } from '../js/game/rope.js';
import { FALL_SAFE, FALL_FATAL, ROPE_LENGTH, ROPE_SLACK } from '../js/game/constants.js';

const anchor = { x: 0, y: 1000 };

test('a fall straight below the anchor stops one rope length (plus slack) beneath it', () => {
  assert.equal(catchY(anchor, 0, 100), 1000 - 100 - ROPE_SLACK);
});

test('a climber 100 above the anchor falls about twice that distance', () => {
  const climberY = 1100;
  const ropeOut = runOut(anchor, 0, climberY);
  const fall = climberY - catchY(anchor, 0, ropeOut);
  assert.equal(fall, 200 + ROPE_SLACK);
});

test('offset falls are caught higher (pendulum)', () => {
  assert.ok(catchY(anchor, 60, 100) > catchY(anchor, 0, 100));
});

test('short falls are free, longer falls hurt, roped falls hurt less', () => {
  assert.equal(fallDamage(FALL_SAFE - 1), 0);
  const free = fallDamage(250);
  const roped = fallDamage(250, { roped: true, ropeOut: 120 });
  assert.ok(free > 0 && roped > 0 && roped < free);
  assert.ok(fallDamage(250, { fallDamage: 1.45 }) > free);
});

test('long unroped falls are fatal, roped ones are not', () => {
  assert.equal(isFatalFall(FALL_FATAL + 1, false), true);
  assert.equal(isFatalFall(FALL_FATAL + 1, true), false);
  assert.equal(isFatalFall(FALL_FATAL - 1, false), false);
});

test('protection ends where the rope runs out', () => {
  assert.equal(isProtected(anchor, 0, 1000 + ROPE_LENGTH - 1), true);
  assert.equal(isProtected(anchor, 0, 1000 + ROPE_LENGTH + 1), false);
  assert.equal(isProtected(null, 0, 0), false);
  assert.equal(ropeRemaining(anchor, 0, 1100), ROPE_LENGTH - 100);
});
