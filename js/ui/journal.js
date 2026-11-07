import { el, button } from './ui.js';
import { formatAlt, formatDuration } from '../game/altitude.js';
import { epitaph } from '../game/climbState.js';

const GLYPH = { summit: '▲', retreat: '↓', fallen: '✕' };

export function journalScreen(app) {
  const { entries } = app.storage.loadJournal();
  const t = app.storage.totals();
  const list = entries.length ? entries.map((e) => {
    const d = new Date(e.date);
    const when = isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return el('div', { class: 'entry', tabindex: '0', 'aria-label': `${e.peakName}, ${e.outcome}, ${e.altitude} metres` },
      el('div', { class: 'glyph', style: `color:${e.outcome === 'summit' ? 'var(--lantern)' : e.outcome === 'retreat' ? 'var(--snow-shadow)' : '#9aa6c4'}` }, GLYPH[e.outcome] || '·'),
      el('div', {},
        el('h3', {}, `${e.peakName}${e.daily ? ' · daily' : ''}`),
        el('div', { class: 'note' }, e.note || epitaph(e)),
        el('div', { class: 'meta' }, `${when} · ${e.difficulty} · ${e.days} day${e.days === 1 ? '' : 's'} · ${formatDuration(e.time)} · ${e.falls} fall${e.falls === 1 ? '' : 's'} · ${e.pitons} piton${e.pitons === 1 ? '' : 's'}`)),
      el('div', {},
        el('div', { class: 'alt' }, formatAlt(e.altitude)),
        el('div', { class: 'bar', title: 'Share of the climb completed' }, el('span', { style: `width:${Math.round((e.progress || 0) * 100)}%` }))));
  }) : [el('div', { class: 'empty' }, 'No climbs yet. The first page is always the hardest.')];
  return el('div', { class: 'screen frost' },
    el('div', { class: 'panel journal' },
      el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:.4em' }, el('h2', { style: 'margin:0' }, 'Journal'), Object.assign(button('Back', () => app.ui.back(), 'small'), { autofocus: true })),
      el('div', { class: 'totals' },
        el('div', { class: 'total' }, el('b', {}, t.best ? formatAlt(t.best) : '—'), el('span', {}, 'Best altitude')),
        el('div', { class: 'total' }, el('b', {}, String(t.summits)), el('span', {}, 'Summits')),
        el('div', { class: 'total' }, el('b', {}, String(t.climbs)), el('span', {}, 'Climbs')),
        el('div', { class: 'total' }, el('b', {}, formatDuration(t.time)), el('span', {}, 'On the mountain'))),
      el('div', { class: 'entries' }, list)));
}
