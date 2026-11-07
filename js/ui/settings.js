import { el, button } from './ui.js';
import { ACTIONS, DEFAULT_BINDINGS, keyLabel } from '../engine/input.js';

const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', up: 'Climb up', down: 'Climb down / rest / camp',
  jump: 'Lunge / catch', grip: 'Grip: brace, catch, arrest', piton: 'Place piton', eat: 'Eat',
  oxygen: 'Swap oxygen', pack: 'Pack', pause: 'Pause',
};

export function settingsScreen(app) {
  const s = app.settings;
  const tabs = ['Audio', 'Visual', 'Access', 'Controls'];
  let tab = 'Audio';
  const body = el('div', { class: 'settings-body', role: 'tabpanel' });
  const tabBtns = tabs.map((t) => {
    const b = button(t, () => { tab = t; render(); }, 'small');
    b.setAttribute('role', 'tab');
    b.dataset.sound = 'toggle';
    return b;
  });

  const field = (label, control, hint) => el('div', { class: 'field' }, el('label', {}, label, hint ? el('span', { class: 'hint' }, hint) : null), control);
  const slider = (key, label) => {
    const val = el('span', { class: 'value' }, Math.round(s.volumes[key] * 100));
    const input = el('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(s.volumes[key] * 100), 'aria-label': label + ' volume' });
    const paint = () => input.style.setProperty('--p', input.value + '%');
    paint();
    input.addEventListener('input', () => {
      s.volumes[key] = input.value / 100;
      val.textContent = input.value;
      paint();
      app.applySettings();
    });
    input.addEventListener('change', () => { app.saveSettings(); if (key !== 'master') app.previewBus(key); });
    return field(label, el('div', { class: 'slider-row' }, input, val));
  };
  const toggle = (key, label, hint) => {
    const input = el('input', { type: 'checkbox', class: 'toggle', 'aria-label': label });
    input.checked = !!s[key];
    input.addEventListener('change', () => { s[key] = input.checked; app.sfx.ui('toggle'); app.applySettings(); app.saveSettings(); });
    return field(label, input, hint);
  };
  const choice = (key, label, options, hint) => {
    const group = el('div', { class: 'seg', role: 'group', 'aria-label': label });
    const btns = options.map(([v, l]) => {
      const b = button(l, () => { s[key] = v; mark(); app.applySettings(); app.saveSettings(); }, 'small');
      b.dataset.sound = 'toggle';
      b.dataset.v = v;
      return b;
    });
    const mark = () => btns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === s[key] ? 'true' : 'false'));
    mark();
    group.append(...btns);
    return field(label, group, hint);
  };

  function bindRow(action) {
    const binds = (s.bindings[action] || DEFAULT_BINDINGS[action]).slice(0, 2);
    const row = el('div', { class: 'bind-row' });
    [0, 1].forEach((i) => {
      const b = button(keyLabel(binds[i]), () => {
        b.textContent = 'Press…';
        b.classList.add('wait');
        app.input.onAnyKey = (code) => {
          if (code !== 'Escape') {
            const list = (s.bindings[action] || DEFAULT_BINDINGS[action]).slice(0, 2);
            list[i] = code;
            s.bindings[action] = list.filter(Boolean);
            app.applySettings(); app.saveSettings();
          }
          render();
        };
      }, 'small');
      b.setAttribute('aria-label', `${ACTION_LABELS[action]} key ${i + 1}: ${keyLabel(binds[i])}`);
      row.append(b);
    });
    return field(ACTION_LABELS[action], row);
  }

  function render() {
    tabBtns.forEach((b, i) => b.setAttribute('aria-selected', tabs[i] === tab ? 'true' : 'false'));
    body.replaceChildren();
    if (tab === 'Audio') {
      body.append(slider('master', 'Master'), slider('music', 'Music'), slider('ambience', 'Ambience'), slider('sfx', 'Effects'), slider('ui', 'Interface'));
    } else if (tab === 'Visual') {
      body.append(
        choice('quality', 'Visual quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], 'Blur, particle count, layer count, resolution'),
        toggle('cameraTilt', 'Camera tilt and altitude zoom', 'The summit looms closer as you climb'),
        toggle('screenShake', 'Screen shake'),
        toggle('showFps', 'Show FPS'),
        toggle('hints', 'Highlight reachable holds'));
    } else if (tab === 'Access') {
      body.append(
        toggle('reducedMotion', 'Reduced motion', 'Calmer camera, no shake, gentler transitions'),
        toggle('colorSafe', 'Colour-safe mode', 'Hazards and meters use shapes and a yellow/blue scheme'),
        toggle('subtitles', 'Subtitles for sound cues', 'Captions for rockfall, ice, wind and more'));
    } else {
      body.append(...ACTIONS.map(bindRow), el('p', { class: 'small muted' }, 'Gamepad: stick/D-pad move · A lunge · B grip · X piton · Y eat · RB oxygen · Start pause.'));
    }
    const reset = button('Reset to defaults', () => confirmReset(), 'small danger');
    body.append(el('div', { class: 'row', style: 'margin:1em 0 .2em' }, reset));
  }
  function confirmReset() {
    const box = el('div', { class: 'confirm' },
      el('div', { class: 'panel', style: 'text-align:center' },
        el('h3', {}, 'Reset all settings?'),
        el('p', { class: 'small muted' }, 'Volumes, visuals, accessibility and key bindings return to their defaults.'),
        el('div', { class: 'row' },
          Object.assign(button('Cancel', () => { box.remove(); render(); app.ui.focusFirst(node); }), { autofocus: true }),
          button('Reset', () => { app.resetSettings(); box.remove(); app.ui.pop(true); app.openSettings(); }, 'danger'))));
    node.append(box);
    box.querySelector('[autofocus]').focus();
  }
  const node = el('div', { class: 'screen frost' },
    el('div', { class: 'panel settings' },
      el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:.6em' }, el('h2', { style: 'margin:0' }, 'Settings'), button('Done', () => app.ui.back(), 'small')),
      el('div', { class: 'tabs', role: 'tablist' }, tabBtns),
      body));
  render();
  return node;
}
