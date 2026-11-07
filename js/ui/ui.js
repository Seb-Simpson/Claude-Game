/** DOM screen manager with keyboard/gamepad focus navigation and UI sounds. */
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

export function button(label, onClick, cls = '') {
  return el('button', { class: 'btn ' + cls, type: 'button', onclick: onClick }, label);
}

export class UI {
  constructor(root, sfx) {
    this.root = root;
    this.sfx = sfx;
    this.stack = [];
    this.reduced = false;
    root.addEventListener('focusin', (e) => { if (e.target.matches('button, input, select, [tabindex]')) this.sfx.ui('move'); });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b && !b.disabled) this.sfx.ui(b.dataset.sound || 'select');
    });
    root.addEventListener('keydown', (e) => this.onKey(e));
  }
  get top() { return this.stack[this.stack.length - 1] || null; }
  get active() { return this.stack.length > 0; }

  /** Push a screen. opts.onBack runs on Escape / B. */
  push(node, opts = {}) {
    const s = { node, ...opts };
    node.classList.add('screen');
    if (this.top) { this.top.node.inert = true; if (!opts.overlay) this.top.node.classList.remove('show'); }
    this.root.append(node);
    this.stack.push(s);
    requestAnimationFrame(() => node.classList.add('show'));
    setTimeout(() => this.focusFirst(node), this.reduced ? 0 : 60);
    return s;
  }
  pop(instant = false) {
    const s = this.stack.pop();
    if (!s) return;
    this.removeNode(s.node, instant);
    if (this.top) { this.top.node.inert = false; this.top.node.classList.add('show'); this.focusFirst(this.top.node, this.top.lastFocus); }
    s.onClose && s.onClose();
  }
  /** Replace the whole stack with one screen. */
  replace(node, opts) {
    while (this.stack.length) { const s = this.stack.pop(); this.removeNode(s.node, false); }
    return this.push(node, opts);
  }
  clear(instant = false) { while (this.stack.length) { const s = this.stack.pop(); this.removeNode(s.node, instant); } }
  removeNode(node, instant) {
    node.classList.remove('show');
    node.inert = true;
    setTimeout(() => node.remove(), instant || this.reduced ? 0 : 700);
  }
  focusables(node) {
    return [...node.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')].filter((e) => !e.closest('[inert]') && e.offsetParent !== null);
  }
  focusFirst(node, prefer) {
    if (prefer && node.contains(prefer)) { prefer.focus({ preventScroll: false }); return; }
    const f = node.querySelector('[autofocus]') || this.focusables(node)[0];
    if (f) f.focus({ preventScroll: true });
  }
  move(delta, axis = 'y') {
    const top = this.top;
    if (!top) return;
    const list = this.focusables(top.node);
    if (!list.length) return;
    const cur = document.activeElement;
    let i = list.indexOf(cur);
    if (i < 0) { list[0].focus(); return; }
    if (axis === 'x' && cur && cur.type === 'range') { cur.stepUp(delta > 0 ? 5 : -5); cur.stepDown(0); cur.dispatchEvent(new Event('input', { bubbles: true })); return; }
    // spatial navigation: nearest focusable in the requested direction
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const q = e.getBoundingClientRect();
      const ex = q.left + q.width / 2, ey = q.top + q.height / 2;
      const along = axis === 'y' ? (ey - cy) * delta : (ex - cx) * delta;
      if (along <= 2) continue;
      const across = axis === 'y' ? Math.abs(ex - cx) : Math.abs(ey - cy);
      const d = along + across * 2.2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best && axis === 'y') best = list[(i + delta + list.length) % list.length];
    if (best) { best.focus(); top.lastFocus = best; }
  }
  back() {
    const top = this.top;
    if (top && top.onBack) { this.sfx.ui('back'); top.onBack(); }
  }
  onKey(e) {
    if (!this.top || (this.capturing && this.capturing())) return;
    const t = e.target;
    const inRange = t && t.type === 'range';
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.back(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1, 'y'); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1, 'y'); }
    else if (e.key === 'ArrowRight' && !inRange) { e.preventDefault(); this.move(1, 'x'); }
    else if (e.key === 'ArrowLeft' && !inRange) { e.preventDefault(); this.move(-1, 'x'); }
  }
  /** Gamepad / global key handling when a menu is open. */
  handleInput(input) {
    if (!this.top) return;
    const pressed = (a) => input.pressed.has(a);
    const padOrTouch = input.lastDevice === 'gamepad';
    if (padOrTouch) {
      if (pressed('up')) this.move(-1, 'y');
      if (pressed('down')) this.move(1, 'y');
      if (pressed('left')) this.move(-1, 'x');
      if (pressed('right')) this.move(1, 'x');
      if (pressed('jump') && document.activeElement && this.top.node.contains(document.activeElement)) {
        const a = document.activeElement;
        if (a.type === 'checkbox') { a.click(); } else a.click();
      }
      if (pressed('grip')) this.back();
    }
    if (pressed('pause') && this.top.onBack) this.back();
  }
}
