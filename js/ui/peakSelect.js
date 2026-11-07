import { el, button } from './ui.js';
import { PEAKS, dailyPeak } from '../game/peaks.js';
import { DIFFICULTY } from '../game/constants.js';
import { createRng } from '../engine/rng.js';
import { formatAlt } from '../game/altitude.js';

function paintCard(canvas, peak) {
  const g = canvas.getContext('2d');
  const W = canvas.width = 220, H = canvas.height = 92;
  const p = peak.palette;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#141a44'); sky.addColorStop(0.6, p.sky); sky.addColorStop(1, p.accent);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const rng = createRng('card:' + peak.name);
  const ridge = (base, amp, col, peakX) => {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const d = Math.abs(x - peakX) / W;
      const y = base - amp * Math.max(0, 1 - d * 2.4) - rng.next() * 5;
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fillStyle = col; g.fill();
  };
  ridge(70, 30, p.haze, 60);
  ridge(80, 58 + peak.rating * 6, p.rock, 120);
  // snow cap
  g.fillStyle = p.snow; g.globalAlpha = 0.9;
  g.beginPath(); g.moveTo(120, 80 - 58 - peak.rating * 6); g.lineTo(104, 44); g.lineTo(112, 40); g.lineTo(120, 46); g.lineTo(130, 40); g.lineTo(138, 46); g.closePath(); g.fill();
  g.globalAlpha = 1;
  ridge(98, 18, p.rockDark, 190);
}

export function selectScreen(app) {
  const peaks = [...PEAKS, dailyPeak()];
  let selected = peaks.find((p) => p.id === app.settings.lastPeak) || peaks[0];
  let diff = app.settings.difficulty || 'standard';
  const cards = peaks.map((p) => {
    const art = el('canvas');
    paintCard(art, p);
    const best = app.storage.best(p.daily ? 'daily:' + p.daily : p.id);
    const card = el('button', { class: 'peak-card', type: 'button', 'aria-label': `${p.name}, summit ${p.summitAlt} metres` },
      el('div', { class: 'peak-art' }, art),
      el('div', { class: 'peak-body' },
        el('div', { class: 'eyebrow' }, p.daily ? `Daily · ${p.daily}` : ['', 'Approachable', 'Serious', 'Severe'][p.rating]),
        el('h3', {}, p.name),
        el('p', {}, p.blurb),
        el('div', { class: 'stats' }, el('span', {}, formatAlt(p.summitAlt)), el('span', { class: 'pips', 'aria-hidden': 'true' }, '▲'.repeat(p.rating) + '△'.repeat(3 - p.rating))),
        el('div', { class: 'stats' }, el('span', { class: 'muted' }, p.weatherLabel)),
        el('div', { class: 'stats' }, el('span', { class: 'muted' }, best ? `Best ${formatAlt(best)}` : 'Unclimbed'))));
    card.addEventListener('click', () => { select(p); begin.focus(); });
    card.addEventListener('focus', () => select(p));
    card._peak = p;
    return card;
  });
  const note = el('div', { class: 'diff-note' });
  const notes = {
    gentle: 'Generous grip, mild weather, wider catch window, no forced lunges.',
    standard: 'The mountain as intended.',
    harsh: 'Thin margins: faster drain, wilder storms, harder falls.',
  };
  const segBtns = Object.values(DIFFICULTY).map((d) => {
    const b = button(d.label, () => { diff = d.id; refresh(); app.sfx.ui('toggle'); });
    b.dataset.sound = 'toggle';
    b.dataset.id = d.id;
    return b;
  });
  const begin = button('Begin climb', () => { app.settings.lastPeak = selected.id; app.settings.difficulty = diff; app.saveSettings(); app.startClimb(selected, diff); }, 'primary');
  function select(p) { selected = p; refresh(); }
  function refresh() {
    for (const c of cards) c.classList.toggle('selected', c._peak === selected);
    for (const b of segBtns) b.setAttribute('aria-pressed', b.dataset.id === diff ? 'true' : 'false');
    note.textContent = notes[diff];
    app.previewPeak && app.previewPeak(selected);
  }
  const node = el('div', { class: 'screen dim' },
    el('div', { class: 'eyebrow', style: 'margin-bottom:.6em' }, 'Choose a mountain'),
    el('div', { class: 'peaks' }, cards),
    el('div', { class: 'row', style: 'margin-top:1.1em' }, el('div', { class: 'seg', role: 'group', 'aria-label': 'Difficulty' }, segBtns)),
    note,
    el('div', { class: 'row', style: 'margin-top:.5em' }, button('Back', () => app.ui.back()), begin));
  const firstCard = cards.find((c) => c._peak === selected) || cards[0];
  firstCard.setAttribute('autofocus', '');
  refresh();
  return node;
}
