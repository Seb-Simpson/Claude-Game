import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, safeBackend, memoryBackend, DEFAULT_SETTINGS } from '../js/storage.js';

test('falls back to memory when localStorage is missing or throws', () => {
  const b1 = safeBackend(() => undefined);
  b1.setItem('a', '1');
  assert.equal(b1.getItem('a'), '1');
  const throwing = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('denied'); }, removeItem() {} };
  const b2 = safeBackend(() => throwing);
  assert.notEqual(b2, throwing);
  b2.setItem('k', 'v');
  assert.equal(b2.getItem('k'), 'v');
});

test('settings default when empty or corrupt, and clamp bad values', () => {
  const be = memoryBackend();
  const s = createStorage(be);
  assert.deepEqual(s.loadSettings(), DEFAULT_SETTINGS);
  be.setItem('snowline.v1.settings', '{not json');
  assert.deepEqual(s.loadSettings(), DEFAULT_SETTINGS);
  be.setItem('snowline.v1.settings', JSON.stringify({ quality: 'ultra', volumes: { music: 7, sfx: 'x' } }));
  const loaded = s.loadSettings();
  assert.equal(loaded.quality, DEFAULT_SETTINGS.quality);
  assert.equal(loaded.volumes.music, 1);
  assert.equal(loaded.volumes.sfx, DEFAULT_SETTINGS.volumes.sfx);
});

test('settings round-trip', () => {
  const s = createStorage(memoryBackend());
  const set = { ...s.loadSettings(), subtitles: true, quality: 'low' };
  s.saveSettings(set);
  assert.equal(s.loadSettings().subtitles, true);
  assert.equal(s.loadSettings().quality, 'low');
});

test('journal records entries, bests and totals', () => {
  const s = createStorage(memoryBackend());
  s.addEntry({ peak: 'kestrel', outcome: 'retreat', altitude: 4300, time: 100 });
  s.addEntry({ peak: 'kestrel', outcome: 'summit', altitude: 5480, time: 200 });
  s.addEntry({ peak: 'daily', daily: '2026-01-01', outcome: 'fallen', altitude: 6100, time: 50 });
  const t = s.totals();
  assert.deepEqual(t, { climbs: 3, summits: 1, best: 6100, time: 350 });
  assert.equal(s.best('kestrel'), 5480);
  assert.equal(s.best('daily:2026-01-01'), 6100);
  assert.equal(s.loadJournal().entries[0].peak, 'daily');
});

test('a write failure never throws', () => {
  const s = createStorage({ getItem: () => null, setItem() { throw new Error('full'); }, removeItem() { throw new Error('x'); } });
  assert.equal(s.saveSettings({}), false);
  assert.doesNotThrow(() => s.clearCheckpoint());
  assert.equal(s.loadCheckpoint(), null);
});
