import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Climb } from '../js/game/climb.js';
import { PEAKS } from '../js/game/peaks.js';
import { nextOutcomeState, canTransition, epitaph } from '../js/game/climbState.js';
import { WeatherSystem } from '../js/game/weather.js';
import { createRng } from '../js/engine/rng.js';
import { runBot } from './helpers/bot.js';

test('outcome rules: summits and falls are final', () => {
  assert.equal(nextOutcomeState('climbing', 'summit'), 'summit');
  assert.equal(nextOutcomeState('camp', 'retreat'), 'retreat');
  assert.equal(nextOutcomeState('summit', 'fallen'), 'summit');
  assert.equal(nextOutcomeState('fallen', 'climbing'), 'fallen');
  assert.equal(canTransition('title', 'select'), true);
  assert.equal(canTransition('title', 'end'), false);
});

test('epitaphs describe each outcome', () => {
  assert.match(epitaph({ outcome: 'summit', altitude: 5480, peakName: 'X', falls: 0 }), /clean ascent/);
  assert.match(epitaph({ outcome: 'retreat', altitude: 5000, cause: 'oxygen' }), /last bottle/);
  assert.match(epitaph({ outcome: 'fallen', altitude: 5000, cause: 'rockfall' }), /stone/);
});

test('a climb starts at base camp, roped, with a full pack', () => {
  const c = new Climb({ peak: PEAKS[0], difficulty: 'standard', seed: 't1' });
  assert.equal(c.player.state, 'stand');
  assert.equal(c.altitude, PEAKS[0].baseAlt);
  assert.equal(c.anchors.length, 1);
  assert.equal(c.roped, true);
});

test('placing a piton spends one and re-anchors the rope', () => {
  const c = new Climb({ peak: PEAKS[0], difficulty: 'standard', seed: 't2' });
  const n = c.resources.pitons;
  c.addAnchor(10, 60);
  assert.equal(c.resources.pitons, n - 1);
  assert.equal(c.lastAnchor.y, 60);
  assert.ok(c.events.some((e) => e.type === 'anchor'));
});

test('entering camp recovers the rope and refills from the cache', () => {
  const c = new Climb({ peak: PEAKS[1], difficulty: 'standard', seed: 't3' });
  const ledge = c.terrain.ledges.find((l) => l.kind === 'camp' && l.campIndex === 1);
  c.addAnchor(0, 100); c.addAnchor(0, 200);
  c.resources.oxygen = { level: 0, spares: 0 };
  c.enterCamp(ledge);
  assert.equal(c.state, 'camp');
  assert.equal(c.anchors.length, 1);
  assert.ok(c.anchors[0].camp);
  c.campTransfer('oxygen', 1);
  assert.equal(c.resources.oxygen.level, 1);
  c.player.health = 40;
  c.campRest(6);
  assert.ok(c.player.health > 40);
  c.leaveCamp();
  assert.equal(c.state, 'climbing');
});

test('retreat is a valid ending and is recorded in the summary', () => {
  const c = new Climb({ peak: PEAKS[2], difficulty: 'harsh', seed: 't4' });
  c.retreat('storm');
  const s = c.summary();
  assert.equal(s.outcome, 'retreat');
  assert.equal(s.cause, 'storm');
  assert.equal(s.difficulty, 'harsh');
});

test('weather issues a forecast before every severe change', () => {
  const w = new WeatherSystem(createRng('wx'), PEAKS[2].weather, 1.3);
  let forecastFor = null, checked = 0;
  for (let i = 0; i < 60 * 900; i++) {
    w.update(1 / 60, 0.8);
    for (const e of w.events) {
      if (e.type === 'forecast') forecastFor = e.state;
      if (e.type === 'weatherChange' && (e.to === 'storm' || e.to === 'whiteout')) { assert.equal(forecastFor, e.to); checked++; }
    }
  }
  assert.ok(checked > 0, 'saw at least one severe change');
});

test('a careful climber can summit generated routes end to end', () => {
  for (const [pi, diff, seed] of [[0, 'gentle', 'e1'], [0, 'standard', 'e2'], [1, 'standard', 'e3']]) {
    const c = runBot(PEAKS[pi], diff, seed);
    assert.equal(c.state, 'summit', `${PEAKS[pi].id}/${diff}/${seed} ended ${c.state} (${c.cause}) at ${c.altitude}`);
  }
});
