/** On-screen touch controls mapped onto input actions. */
const LAYOUT = [
  { a: 'up', label: '▲', x: 70, y: 380 },
  { a: 'left', label: '◀', x: 22, y: 428 },
  { a: 'right', label: '▶', x: 118, y: 428 },
  { a: 'down', label: '▼', x: 70, y: 476 },
  { a: 'jump', label: 'Lunge', x: 878, y: 440 },
  { a: 'grip', label: 'Grip', x: 812, y: 470 },
  { a: 'piton', label: 'Piton', x: 846, y: 380, sm: true },
  { a: 'eat', label: 'Eat', x: 790, y: 410, sm: true },
  { a: 'oxygen', label: 'O₂', x: 900, y: 380, sm: true },
  { a: 'pack', label: 'Pack', x: 846, y: 20, sm: true },
  { a: 'pause', label: 'II', x: 900, y: 20, sm: true },
];

export class TouchControls {
  constructor(root, input) {
    this.root = root;
    this.input = input;
    this.visible = false;
    for (const b of LAYOUT) {
      const d = document.createElement('div');
      d.className = 'tbtn' + (b.sm ? ' sm' : '');
      d.textContent = b.label;
      d.style.left = `calc(var(--u) * ${b.x})`;
      d.style.top = `calc(var(--u) * ${b.y})`;
      const down = (e) => { e.preventDefault(); d.setPointerCapture && d.setPointerCapture(e.pointerId); d.classList.add('active'); input.press(b.a, 't' + b.a); input.lastDevice = 'touch'; };
      const up = (e) => { e.preventDefault(); d.classList.remove('active'); input.release(b.a, 't' + b.a); };
      d.addEventListener('pointerdown', down);
      d.addEventListener('pointerup', up);
      d.addEventListener('pointercancel', up);
      d.addEventListener('lostpointercapture', up);
      root.append(d);
    }
    const detect = () => { this.touchCapable = true; window.removeEventListener('touchstart', detect); };
    this.touchCapable = matchMedia('(pointer: coarse)').matches;
    window.addEventListener('touchstart', detect, { passive: true });
  }
  setVisible(v) {
    v = v && this.touchCapable;
    if (v === this.visible) return;
    this.visible = v;
    this.root.classList.toggle('on', v);
  }
}
