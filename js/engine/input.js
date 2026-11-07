/**
 * Action-based input. Keyboard bindings are remappable; gamepad uses the
 * standard mapping; touch buttons call press()/release() directly.
 */
export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'grip', 'piton', 'eat', 'oxygen', 'pack', 'pause'];

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space'],
  grip: ['ShiftLeft', 'KeyK'],
  piton: ['KeyE'],
  eat: ['KeyQ'],
  oxygen: ['KeyR'],
  pack: ['Tab', 'KeyI'],
  pause: ['Escape', 'KeyP'],
};

const PAD_BUTTONS = { jump: [0], grip: [1, 7], piton: [2], eat: [3], oxygen: [5], pack: [8], pause: [9], up: [12], down: [13], left: [14], right: [15] };

export class Input {
  constructor() {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.down = new Set();
    this.sources = new Map(); // action -> Set of source ids holding it
    this.pressed = new Set();
    this.released = new Set();
    this.enabled = true;
    this.lastDevice = 'keyboard';
    this.onAnyKey = null; // used by rebinding UI
    this.padPrev = {};
    this.keyToActions = new Map();
    this.rebuild();
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
  }
  setBindings(b) {
    this.bindings = { ...structuredClone(DEFAULT_BINDINGS), ...structuredClone(b || {}) };
    this.rebuild();
  }
  rebuild() {
    this.keyToActions.clear();
    for (const a of ACTIONS) for (const code of this.bindings[a] || []) {
      if (!this.keyToActions.has(code)) this.keyToActions.set(code, []);
      this.keyToActions.get(code).push(a);
    }
  }
  onKey(e, isDown) {
    if (isDown && this.onAnyKey) { e.preventDefault(); const f = this.onAnyKey; this.onAnyKey = null; f(e.code); return; }
    const acts = this.keyToActions.get(e.code);
    if (!acts) return;
    const inForm = e.target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName);
    // let menus handle Tab/Space/arrows natively when a control is focused and the game isn't listening
    if (!this.enabled && inForm) return;
    if (this.enabled && e.code !== 'Escape') e.preventDefault();
    if (e.repeat) return;
    this.lastDevice = 'keyboard';
    for (const a of acts) isDown ? this.press(a, 'k:' + e.code) : this.release(a, 'k:' + e.code);
  }
  press(action, src = 'x') {
    let s = this.sources.get(action);
    if (!s) { s = new Set(); this.sources.set(action, s); }
    if (s.size === 0) { this.down.add(action); this.pressed.add(action); }
    s.add(src);
  }
  release(action, src = 'x') {
    const s = this.sources.get(action);
    if (!s) return;
    s.delete(src);
    if (s.size === 0 && this.down.has(action)) { this.down.delete(action); this.released.add(action); }
  }
  releaseAll() {
    for (const a of this.down) this.released.add(a);
    this.down.clear(); this.sources.clear();
  }
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const now = {};
    for (const a in PAD_BUTTONS) now[a] = PAD_BUTTONS[a].some((i) => pad.buttons[i] && pad.buttons[i].pressed);
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (ax < -0.5) now.left = true;
    if (ax > 0.5) now.right = true;
    if (ay < -0.5) now.up = true;
    if (ay > 0.5) now.down = true;
    for (const a in now) {
      if (now[a] && !this.padPrev[a]) { this.press(a, 'pad'); this.lastDevice = 'gamepad'; }
      else if (!now[a] && this.padPrev[a]) this.release(a, 'pad');
    }
    this.padPrev = now;
  }
  isDown(a) { return this.enabled && this.down.has(a); }
  wasPressed(a) { return this.enabled && this.pressed.has(a); }
  consume(a) { this.pressed.delete(a); }
  /** Direction vector from held direction actions. */
  dir() {
    if (!this.enabled) return { x: 0, y: 0 };
    return {
      x: (this.down.has('right') ? 1 : 0) - (this.down.has('left') ? 1 : 0),
      y: (this.down.has('up') ? 1 : 0) - (this.down.has('down') ? 1 : 0),
    };
  }
  endFrame() { this.pressed.clear(); this.released.clear(); }
}

/** Human-readable key label for the remap UI. */
export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace('Arrow', '').replace('Left', ' L').replace('Right', ' R')
    .replace(/^ L$/, 'Left').replace(/^ R$/, 'Right');
}
