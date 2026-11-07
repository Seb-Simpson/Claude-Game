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
    // six-armed crystals, dense at the edges and corners, sparse inward
    const crystal = (x, y, r, a) => {
      g.lineWidth = Math.max(0.5, r * 0.06);
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = a + (k * Math.PI) / 3;
        const ex = x + Math.cos(ang) * r, ey = y + Math.sin(ang) * r;
        g.moveTo(x, y); g.lineTo(ex, ey);
        for (const t of [0.45, 0.7]) {
          const bx = x + Math.cos(ang) * r * t, by = y + Math.sin(ang) * r * t;
          const bl = r * (1 - t) * 0.6;
          g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang + 0.7) * bl, by + Math.sin(ang + 0.7) * bl);
          g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang - 0.7) * bl, by + Math.sin(ang - 0.7) * bl);
        }
      }
      g.stroke();
    };
    for (let i = 0; i < 520; i++) {
      // distance from the nearest edge, biased hard toward the frame
      const d = Math.pow(rng.next(), 2.6) * 120;
      const side = rng.int(0, 3);
      const along = rng.next();
      let x = side === 0 ? d : side === 1 ? W - d : along * W;
      let y = side === 2 ? d : side === 3 ? H - d : along * H;
      const r = rng.range(2, 9) * (1 - d / 160);
      g.strokeStyle = `rgba(240,248,255,${(0.25 + rng.next() * 0.45) * (1 - d / 140)})`;
      crystal(x, y, r, rng.next() * Math.PI);
    }
    // corner blooms
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 190);
      grd.addColorStop(0, 'rgba(230,240,255,0.55)');
      grd.addColorStop(1, 'rgba(230,240,255,0)');
      g.fillStyle = grd;
      g.fillRect(cx - 190, cy - 190, 380, 380);
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
