import { el, button } from './ui.js';
import { formatAlt, formatClock } from '../game/altitude.js';
import { WEATHER } from '../game/weather.js';
import { packWeight } from '../game/resources.js';

export function pauseScreen(app) {
  return el('div', { class: 'screen frost', role: 'dialog', 'aria-label': 'Paused' },
    el('div', { class: 'eyebrow' }, 'Paused'),
    el('h2', { style: 'margin:.2em 0 .8em' }, app.climb ? app.climb.peak.name : ''),
    el('nav', { class: 'menu' },
      Object.assign(button('Resume', () => app.resume(), 'primary'), { autofocus: true }),
      button('Restart', () => app.restart()),
      button('Settings', () => app.openSettings()),
      button('Quit to title', () => app.quitToTitle())));
}

const icon = (name) => el('img', { src: `assets/sprites/${name}.svg`, alt: '' });

export function campScreen(app) {
  const c = app.climb;
  const camp = c.currentCamp;
  const name = camp.index === 0 ? 'Base camp' : `Camp ${['', 'I', 'II', 'III', 'IV'][camp.index] || camp.index}`;
  const supplies = el('div');
  const pack = el('div');
  const status = el('div', { class: 'small muted' });
  const night = c.nightness > 0.5 || c.hourOfDay > 18;
  const row = (label, img, have, cache, item) => el('div', { class: 'supply' },
    el('span', {}, icon(img), `${label}`),
    el('span', {}, el('span', { class: 'muted small' }, `pack ${have} · cache ${cache} `),
      Object.assign(button('Take', () => { c.campTransfer(item, 1); render(); }), { disabled: cache <= 0, 'aria-label': `Take ${label}` }),
      ' ',
      Object.assign(button('Leave', () => { c.campTransfer(item, -1); render(); }), { disabled: item === 'oxygen' ? c.resources.oxygen.spares <= 0 : have <= 0, 'aria-label': `Leave ${label}` })));
  function render() {
    const r = c.resources, s = camp.supplies;
    supplies.replaceChildren(
      row('Oxygen', 'oxygen', `${r.oxygen.spares}+${Math.round(r.oxygen.level * 100)}%`, s.oxygen, 'oxygen'),
      row('Food', 'food', r.food, s.food, 'food'),
      row('Pitons', 'piton', r.pitons, s.pitons, 'pitons'));
    const p = c.player;
    pack.replaceChildren(
      el('div', { class: 'supply' }, el('span', {}, 'Stamina ceiling'), el('b', {}, `${Math.round(p.fatigue * 100)}%`)),
      el('div', { class: 'supply' }, el('span', {}, 'Condition'), el('b', {}, `${Math.round(p.health)}%`)),
      el('div', { class: 'supply' }, el('span', {}, 'Pack weight'), el('b', {}, `${packWeight(r).toFixed(1)} kg`)),
      el('div', { class: 'supply' }, el('span', {}, 'Forecast'), el('b', {}, `${c.weather.label} → ${WEATHER[c.weather.next].label}`)));
    status.textContent = `${formatAlt(c.altitude)} · ${formatClock(c.hourOfDay)} · Day ${c.day}`;
  }
  render();
  const node = el('div', { class: 'screen dim', role: 'dialog', 'aria-label': name },
    el('div', { class: 'panel camp' },
      el('div', { class: 'eyebrow' }, 'A warm, quiet respite'),
      el('h2', {}, name),
      status,
      el('div', { class: 'camp-grid' },
        el('div', {}, el('h3', {}, 'Cache'), supplies),
        el('div', {}, el('h3', {}, 'You'), pack)),
      el('div', { class: 'row' },
        button('Rest 2 hours', () => { c.campRest(2); app.onRest(); render(); }),
        button(night ? 'Sleep until dawn' : 'Rest until dusk', () => { const h = c.hourOfDay; const target = night ? (h < 6 ? 6 - h : 30 - h) : Math.max(1, 19 - h); c.campRest(target); app.onRest(); render(); })),
      el('div', { class: 'row', style: 'margin-top:.6em' },
        Object.assign(button('Keep climbing', () => app.leaveCamp(), 'primary'), { autofocus: true }),
        camp.index > 0 ? button('Descend', () => app.confirmRetreat('choice')) : null)));
  return node;
}

export function turnBackScreen(app, ev) {
  const c = app.climb;
  const alt = c.altitude;
  return el('div', { class: 'screen dim', role: 'alertdialog', 'aria-label': 'Turn back?' },
    el('div', { class: 'panel prompt-card' },
      el('div', { class: 'eyebrow' }, 'A decision'),
      el('h2', {}, 'Turn back?'),
      ...ev.lines.map((l) => el('p', { class: 'epilogue', style: 'margin:.2em auto' }, l)),
      el('div', { class: 'choice' },
        el('div', {}, el('b', {}, 'Descend'), `Retreat from ${formatAlt(alt)}. The climb is recorded and you walk away.`),
        el('div', {}, el('b', {}, 'Keep going'), `${formatAlt(c.peak.summitAlt - alt)} to the summit. ${consequence(c, ev.reason)}`)),
      el('div', { class: 'row' },
        button('Turn back', () => app.retreat(ev.reason)),
        Object.assign(button('Keep climbing', () => app.ui.back(), 'primary'), { autofocus: true }))));
}
function consequence(c, reason) {
  const r = c.resources;
  if (reason === 'oxygen') return `About ${Math.max(1, Math.round(r.oxygen.level * 100 / 6))} min of oxygen, then the thin air.`;
  if (reason === 'health') return 'Another hard fall may end it.';
  if (reason === 'food') return 'Your grip will tire quicker with every pitch.';
  return 'Shelter under an overhang or reach the next camp.';
}

export function confirmScreen(app, title, text, yes, onYes) {
  return el('div', { class: 'screen dim', role: 'alertdialog' },
    el('div', { class: 'panel prompt-card' },
      el('h2', {}, title),
      el('p', { class: 'epilogue' }, text),
      el('div', { class: 'row', style: 'margin-top:1em' },
        Object.assign(button('Cancel', () => app.ui.back()), { autofocus: true }),
        button(yes, onYes, 'primary'))));
}

export function packScreen(app) {
  const c = app.climb;
  const list = el('div');
  const render = () => {
    const r = c.resources;
    list.replaceChildren(
      el('div', { class: 'supply' }, el('span', {}, icon('oxygen'), `Spare oxygen ×${r.oxygen.spares}`), el('span', {}, el('span', { class: 'muted small' }, '3 kg each '), Object.assign(button('Drop', () => { c.dropItem('oxygen'); render(); }), { disabled: r.oxygen.spares <= 0 }))),
      el('div', { class: 'supply' }, el('span', {}, icon('food'), `Food ×${r.food}`), el('span', {}, el('span', { class: 'muted small' }, '0.5 kg each '), Object.assign(button('Drop', () => { c.dropItem('food'); render(); }), { disabled: r.food <= 0 }))),
      el('div', { class: 'supply' }, el('span', {}, icon('piton'), `Pitons ×${r.pitons}`), el('span', {}, el('span', { class: 'muted small' }, '0.25 kg each '), Object.assign(button('Drop', () => { c.dropItem('pitons'); render(); }), { disabled: r.pitons <= 0 }))),
      el('div', { class: 'supply' }, el('span', {}, 'Total'), el('b', {}, `${packWeight(r).toFixed(1)} kg`)),
      el('p', { class: 'small muted' }, 'Above 14 kg every move costs more grip and every reach is slower. Dropped gear is gone for good.'));
  };
  render();
  return el('div', { class: 'screen dim', role: 'dialog', 'aria-label': 'Pack' },
    el('div', { class: 'panel camp', style: 'width:calc(var(--u)*420)' },
      el('div', { class: 'eyebrow' }, 'Time stands still while you sort your pack'),
      el('h2', {}, 'Pack'),
      list,
      el('div', { class: 'row', style: 'margin-top:.6em' }, Object.assign(button('Close', () => app.ui.back(), 'primary'), { autofocus: true }))));
}
