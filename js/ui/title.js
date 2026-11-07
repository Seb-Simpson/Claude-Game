import { el, button } from './ui.js';

export function titleScreen(app) {
  const hasSave = !!app.storage.loadCheckpoint();
  const node = el('div', { class: 'screen title', role: 'menu', 'aria-label': 'Title' },
    el('div', { class: 'title-wrap' },
      el('h1', { class: 'logo' }, 'SNOWLINE'),
      el('div', { class: 'tagline' }, 'Every step up is a step you must climb back down.')),
    el('nav', { class: 'menu title-menu' },
      button('Climb', () => app.openSelect(), 'primary'),
      Object.assign(button('Continue', () => app.continueClimb()), { disabled: !hasSave, title: hasSave ? 'Resume from your last camp' : 'No camp to return to' }),
      button('Journal', () => app.openJournal()),
      button('Settings', () => app.openSettings()),
      button('Credits', () => app.openCredits())),
    el('div', { class: 'title-foot' }, 'Headphones recommended · Arrows/WASD · Space · Shift'));
  node.querySelector('.btn.primary').setAttribute('autofocus', '');
  return node;
}

export function creditsScreen(app) {
  return el('div', { class: 'screen dim' },
    el('div', { class: 'panel credits' },
      el('div', { class: 'eyebrow' }, 'Credits'),
      el('h2', {}, 'Snowline'),
      el('p', {}, 'Design, code, art and score generated procedurally in the browser.'),
      el('p', { class: 'muted' }, 'Every mountain, every sky and every note is made from a seed at runtime: Canvas 2D for the paintings, Web Audio for the music and wind. No samples, no images beyond hand-written SVG.'),
      el('p', { class: 'muted small' }, 'For everyone who ever turned back below the summit and was right to.'),
      el('div', { class: 'row', style: 'margin-top:1em' }, Object.assign(button('Back', () => app.ui.back()), { autofocus: true }))));
}
