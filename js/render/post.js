import { createRng } from '../engine/rng.js';
import { rgba, clamp, TAU } from '../engine/math.js';

/** Vignette, creeping frost and lens grading. Expensive textures are baked once. */
export class Post {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.vignette = this.bakeVignette(0.5);
    this.vignetteTight = this.bakeVignette(0.18);
    this.frost = this.bakeFrost();
  }
  bakeVignette(inner) {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 270;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(240, 135, 270 * inner, 240, 135, 300);
    grd.addColorStop(0, 'rgba(4,6,20,0)');
    grd.addColorStop(1, 'rgba(4,6,20,0.92)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 480, 270);
    return c;
  }
  bakeFrost() {
    const W = 960, H = 540;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const rng = createRng('frost');
    // milky edge
    const edge = (x0, y0, x1, y1) => {
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, 'rgba(225,238,255,0.55)');
      grd.addColorStop(1, 'rgba(225,238,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    };
    edge(0, 0, 90, 0); edge(W, 0, W - 90, 0); edge(0, 0, 0, 70); edge(0, H, 0, H - 70);
    // dendrites grow inward from the edges
    g.strokeStyle = 'rgba(240,248,255,0.7)';
    const branch = (x, y, a, len, depth) => {
      if (depth <= 0 || len < 3) return;
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineWidth = depth * 0.35;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      const n = 2 + (rng.next() < 0.4 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const t = rng.range(0.3, 1);
        branch(x + (x2 - x) * t, y + (y2 - y) * t, a + (rng.next() < 0.5 ? -1 : 1) * rng.range(0.5, 1.1), len * rng.range(0.35, 0.6), depth - 1);
      }
      branch(x2, y2, a + rng.range(-0.25, 0.25), len * 0.7, depth - 1);
    };
    for (let i = 0; i < 46; i++) {
      const side = i % 4;
      let x, y, a;
      if (side === 0) { x = 0; y = rng.next() * H; a = rng.range(-0.6, 0.6); }
      else if (side === 1) { x = W; y = rng.next() * H; a = Math.PI + rng.range(-0.6, 0.6); }
      else if (side === 2) { x = rng.next() * W; y = 0; a = Math.PI / 2 + rng.range(-0.6, 0.6); }
      else { x = rng.next() * W; y = H; a = -Math.PI / 2 + rng.range(-0.6, 0.6); }
      // corners get more
      if (rng.next() < 0.5) { x = side % 2 ? W - rng.next() * 120 : rng.next() * 120; y = side < 2 ? rng.next() * H : y; }
      branch(x, y, a, rng.range(26, 60), 5);
    }
    // sparkle
    for (let i = 0; i < 600; i++) {
      const edgeBias = rng.next() < 0.5;
      const x = edgeBias ? (rng.next() < 0.5 ? rng.next() * 110 : W - rng.next() * 110) : rng.next() * W;
      const y = edgeBias ? rng.next() * H : (rng.next() < 0.5 ? rng.next() * 80 : H - rng.next() * 80);
      g.fillStyle = `rgba(255,255,255,${rng.range(0.2, 0.7)})`;
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }
  drawVignette(ctx, amount, tight) {
    if (amount > 0.01) {
      ctx.globalAlpha = clamp(amount);
      ctx.drawImage(this.vignette, 0, 0, this.w, this.h);
    }
    if (tight > 0.01) {
      ctx.globalAlpha = clamp(tight);
      ctx.drawImage(this.vignetteTight, 0, 0, this.w, this.h);
    }
    ctx.globalAlpha = 1;
  }
  drawFrost(ctx, amount) {
    if (amount <= 0.02) return;
    const s = 1 + (1 - clamp(amount)) * 0.35; // frost creeps in from the edges as it grows
    const w = this.w * s, h = this.h * s;
    ctx.globalAlpha = clamp(amount * 1.1);
    ctx.drawImage(this.frost, (this.w - w) / 2, (this.h - h) / 2, w, h);
    ctx.globalAlpha = 1;
  }
  drawHaze(ctx, color, amount) {
    if (amount <= 0.01) return;
    const grd = ctx.createLinearGradient(0, 0, 0, this.h);
    grd.addColorStop(0, rgba(color, amount * 0.25));
    grd.addColorStop(1, rgba(color, amount));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.w, this.h);
  }
  drawGlare(ctx, ts, amount) {
    if (amount <= 0.01) return;
    const x = ts.sunX * this.w, y = this.h * 0.25;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, this.w * 0.8);
    grd.addColorStop(0, `rgba(255,252,240,${0.22 * amount})`);
    grd.addColorStop(1, 'rgba(255,252,240,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.w, this.h);
  }
  /** Soft flash used for impacts and lightning-free storm pulses. */
  drawFlash(ctx, color, a) {
    if (a <= 0.01) return;
    ctx.fillStyle = rgba(color, clamp(a));
    ctx.fillRect(0, 0, this.w, this.h);
  }
}
export { TAU };
