import { createRng } from '../engine/rng.js';
import { rgba, TAU } from '../engine/math.js';

/** Sky gradient, stars, aurora ribbons, sun and moon. */
export class Sky {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.stars = this.bakeStars();
    this.twinkle = [];
    const rng = createRng('twinkle');
    for (let i = 0; i < 40; i++) this.twinkle.push({ x: rng.next() * w, y: rng.next() * h * 0.6, p: rng.next() * TAU, s: rng.range(0.8, 1.8) });
    this.aur = document.createElement('canvas');
    this.aur.width = 160; this.aur.height = 90;
    this.aurCtx = this.aur.getContext('2d');
    this.aurFrame = 0;
  }
  bakeStars() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    const rng = createRng('stars');
    for (let i = 0; i < 420; i++) {
      const y = Math.pow(rng.next(), 1.4) * this.h * 0.85;
      const x = rng.next() * this.w;
      const r = rng.next() < 0.06 ? rng.range(0.9, 1.4) : rng.range(0.3, 0.8);
      g.fillStyle = rng.next() < 0.15 ? 'rgba(255,214,170,0.9)' : rng.next() < 0.3 ? 'rgba(170,200,255,0.9)' : 'rgba(240,244,255,0.85)';
      g.globalAlpha = rng.range(0.35, 1);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    // a faint milky band
    g.globalAlpha = 1;
    for (let i = 0; i < 900; i++) {
      const t = rng.next();
      const x = t * this.w, y = this.h * (0.08 + t * 0.35) + (rng.next() - 0.5) * 70;
      g.fillStyle = `rgba(200,210,255,${rng.range(0.05, 0.25)})`;
      g.fillRect(x, y, 0.8, 0.8);
    }
    return c;
  }
  drawAurora(t, amount) {
    const g = this.aurCtx, W = 160, H = 90;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const ribbons = [
      { y: 22, amp: 9, f: 0.045, sp: 0.07, col: [95, 255, 200], h: 30 },
      { y: 34, amp: 12, f: 0.03, sp: -0.05, col: [140, 120, 255], h: 26 },
      { y: 16, amp: 6, f: 0.07, sp: 0.11, col: [120, 230, 255], h: 18 },
    ];
    for (const r of ribbons) {
      for (let x = 0; x < W; x++) {
        const yy = r.y + Math.sin(x * r.f + t * r.sp * 6) * r.amp + Math.sin(x * r.f * 2.7 - t * 0.3) * r.amp * 0.4;
        const bright = 0.5 + 0.5 * Math.sin(x * 0.21 + t * 0.9 + r.y) * Math.sin(x * 0.053 - t * 0.4);
        const a = Math.max(0, bright) * 0.5 * amount;
        if (a < 0.02) continue;
        const grd = g.createLinearGradient(0, yy - r.h, 0, yy + 3);
        grd.addColorStop(0, `rgba(${r.col[0]},${r.col[1]},${r.col[2]},0)`);
        grd.addColorStop(0.75, `rgba(${r.col[0]},${r.col[1]},${r.col[2]},${a * 0.6})`);
        grd.addColorStop(1, `rgba(${r.col[0]},${r.col[1]},${r.col[2]},${a})`);
        g.fillStyle = grd;
        g.fillRect(x, yy - r.h, 1, r.h + 3);
      }
    }
    g.globalCompositeOperation = 'source-over';
  }
  /** horizonY: screen y of the visual horizon; lift: 0..1 altitude progress. */
  draw(ctx, ts, time, lift, quality) {
    const { w, h } = this;
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, ts.top);
    grd.addColorStop(0.55 + lift * 0.15, ts.mid);
    grd.addColorStop(1, ts.hor);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    if (ts.stars > 0.01) {
      ctx.globalAlpha = ts.stars;
      ctx.drawImage(this.stars, 0, -lift * 40, w, h);
      ctx.fillStyle = '#f4f6ff';
      for (const s of this.twinkle) {
        const a = 0.5 + 0.5 * Math.sin(time * s.s * 2 + s.p);
        ctx.globalAlpha = ts.stars * a;
        ctx.fillRect(s.x, s.y - lift * 40, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    }
    if (ts.aurora > 0.02 && quality > 0) {
      if ((this.aurFrame++ & 1) === 0) this.drawAurora(time, ts.aurora);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.aur, 0, -10 - lift * 30, w, h * 0.75);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Sun
    if (ts.sunUp) {
      const sx = ts.sunX * w;
      const sy = h * (0.95 - ts.sunElev * 0.75) + lift * 60;
      const r = 120 + ts.glare * 220;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      glow.addColorStop(0, rgba(ts.light, 0.55 + ts.glare * 0.25));
      glow.addColorStop(0.15, rgba(ts.light, 0.22));
      glow.addColorStop(1, rgba(ts.light, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      ctx.fillStyle = 'rgba(255,250,240,0.95)';
      ctx.beginPath(); ctx.arc(sx, sy, 9 + (1 - ts.sunElev) * 4, 0, TAU); ctx.fill();
    }
    if (ts.moonUp && ts.dark > 0.3) {
      const mx = ts.moonX * w, my = h * (0.7 - ts.moonElev * 0.55) + lift * 50;
      const glow = ctx.createRadialGradient(mx, my, 0, mx, my, 70);
      glow.addColorStop(0, 'rgba(210,220,255,0.35)');
      glow.addColorStop(1, 'rgba(210,220,255,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(mx - 70, my - 70, 140, 140);
      ctx.fillStyle = '#e9edff';
      ctx.beginPath(); ctx.arc(mx, my, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = ts.top;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(mx + 3.5, my - 1.5, 6.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
