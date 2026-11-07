import { el, button } from './ui.js';
import { formatAlt, formatDuration } from '../game/altitude.js';
import { epitaph } from '../game/climbState.js';

/** Animate a number from 0 into an element. */
export function countUp(node, to, dur, fmt, reduced) {
  if (reduced) { node.textContent = fmt(to); return; }
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / (dur * 1000));
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = fmt(to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function endScreen(app, summary, best) {
  const summit = summary.outcome === 'summit';
  const altEl = el('div', { class: 'big' }, formatAlt(0));
  const timeEl = el('b', {}, '0:00');
  const gainEl = el('b', {}, '0 m');
  const title = summit ? 'Summit' : summary.outcome === 'retreat' ? 'Retreat' : 'The fall';
  const eyebrow = summit ? summary.peakName : summary.outcome === 'retreat' ? 'You came down alive' : summary.peakName;
  const isBest = summary.altitude >= best && best > 0;
  const node = el('div', { class: 'screen' + (summit ? ' summit-screen' : ' dim'), role: 'dialog', 'aria-label': title },
    el('div', { class: 'panel card' + (summit ? ' summit-card' : '') },
      el('div', { class: 'eyebrow' }, eyebrow),
      el('h2', { style: 'margin:.1em 0 .1em' }, title),
      altEl,
      isBest ? el('div', { class: 'small', style: 'color:var(--lantern)' }, 'A new personal best') : null,
      el('p', { class: 'epilogue' }, epitaph(summary)),
      el('div', { class: 'stat-grid' },
        el('div', {}, timeEl, el('span', {}, 'Climb time')),
        el('div', {}, gainEl, el('span', {}, 'Height gained')),
        el('div', {}, el('b', {}, `${summary.days}`), el('span', {}, summary.days === 1 ? 'Day' : 'Days')),
        el('div', {}, el('b', {}, `${summary.falls}`), el('span', {}, 'Falls')),
        el('div', {}, el('b', {}, `${summary.pitons}`), el('span', {}, 'Pitons')),
        el('div', {}, el('b', {}, `${summary.camps}`), el('span', {}, 'Camps'))),
      el('div', { class: 'row' },
        button('Journal', () => app.openJournal()),
        button('Climb again', () => app.restart(true)),
        Object.assign(button('Title', () => app.quitToTitle(), 'primary'), { autofocus: true }))));
  const r = app.settings.reducedMotion;
  setTimeout(() => {
    countUp(altEl, summary.altitude, summit ? 3.2 : 2.2, formatAlt, r);
    countUp(timeEl, summary.time, 2.4, formatDuration, r);
    countUp(gainEl, summary.altitude - summary.baseAlt, 2.4, (v) => `${Math.round(v).toLocaleString('en-US')} m`, r);
  }, summit ? 900 : 400);
  return node;
}
