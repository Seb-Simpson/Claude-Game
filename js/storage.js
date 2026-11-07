/**
 * Settings, journal, bests and the camp checkpoint, kept in localStorage.
 * Falls back to memory when storage is unavailable (private mode, quota,
 * sandboxed iframes) or holds corrupt data.
 */
const PREFIX = 'snowline.v1.';

export function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

export function safeBackend(get = () => globalThis.localStorage) {
  try {
    const ls = get();
    const probe = PREFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryBackend();
  }
}

export const DEFAULT_SETTINGS = {
  volumes: { master: 0.8, music: 0.7, ambience: 0.7, sfx: 0.8, ui: 0.6 },
  quality: 'high',
  cameraTilt: true,
  screenShake: true,
  reducedMotion: false,
  colorSafe: false,
  subtitles: false,
  showFps: false,
  hints: true,
  bindings: {},
  difficulty: 'standard',
  lastPeak: 'kestrel',
};

export function createStorage(backend = safeBackend()) {
  const read = (key, fallback) => {
    try {
      const raw = backend.getItem(PREFIX + key);
      if (raw == null) return fallback;
      const v = JSON.parse(raw);
      return v ?? fallback;
    } catch { return fallback; }
  };
  const write = (key, value) => {
    try { backend.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  };
  return {
    backend,
    loadSettings() {
      const s = read('settings', {});
      const out = { ...structuredClone(DEFAULT_SETTINGS), ...(typeof s === 'object' && !Array.isArray(s) ? s : {}) };
      out.volumes = { ...DEFAULT_SETTINGS.volumes, ...(s && typeof s.volumes === 'object' ? s.volumes : {}) };
      for (const k in out.volumes) { const v = Number(out.volumes[k]); out.volumes[k] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_SETTINGS.volumes[k]; }
      if (!['low', 'medium', 'high'].includes(out.quality)) out.quality = DEFAULT_SETTINGS.quality;
      return out;
    },
    saveSettings: (s) => write('settings', s),
    loadJournal() {
      const j = read('journal', null);
      const entries = j && Array.isArray(j.entries) ? j.entries.filter((e) => e && typeof e.altitude === 'number') : [];
      return { entries, bests: (j && j.bests) || {} };
    },
    addEntry(entry) {
      const j = this.loadJournal();
      j.entries.unshift(entry);
      j.entries = j.entries.slice(0, 80);
      const key = entry.daily ? 'daily:' + entry.daily : entry.peak;
      j.bests[key] = Math.max(j.bests[key] || 0, entry.altitude);
      write('journal', j);
      return j;
    },
    totals() {
      const { entries } = this.loadJournal();
      return {
        climbs: entries.length,
        summits: entries.filter((e) => e.outcome === 'summit').length,
        best: entries.reduce((m, e) => Math.max(m, e.altitude), 0),
        time: entries.reduce((m, e) => m + (e.time || 0), 0),
      };
    },
    best(key) { return this.loadJournal().bests[key] || 0; },
    saveCheckpoint: (c) => write('checkpoint', c),
    loadCheckpoint: () => read('checkpoint', null),
    clearCheckpoint() { try { backend.removeItem(PREFIX + 'checkpoint'); } catch { /* ignore */ } },
  };
}
