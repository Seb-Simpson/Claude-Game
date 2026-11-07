export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

/** Tiny tween manager. Tweens numeric props of a target over seconds. */
export class Tweens {
  constructor() { this.list = []; }
  to(target, props, duration, easing = ease.inOutQuad, onDone) {
    const from = {};
    for (const k in props) from[k] = target[k];
    const tw = { target, from, props, duration, easing, t: 0, onDone };
    this.list.push(tw);
    return tw;
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      const e = tw.easing(k);
      for (const p in tw.props) tw.target[p] = tw.from[p] + (tw.props[p] - tw.from[p]) * e;
      if (k >= 1) { this.list.splice(i, 1); tw.onDone && tw.onDone(); }
    }
  }
  clear() { this.list.length = 0; }
}
