import { createRng } from '../engine/rng.js';
import { rgba, clamp, TAU } from '../engine/math.js';

/**
 * Screen-space snow in three depth bands, sleet streaks, lens drops and
 * whiteout. Flakes respond to wind and to camera motion with depth parallax.
 */
const BAND = { FAR: 0, MID: 1, NEAR: 2 };
const PARALLAX = [0.25, 0.9, 1.6];

function flakeSprite(r, blur) {
  const s = Math.ceil((r + blur) * 2 + 2);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(r / (r + blur + 1), 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  return c;
}

export class WeatherFx {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.flakes = [];
    this.sprites = [flakeSprite(1, 0.6), flakeSprite(1.8, 1), flakeSprite(4, 5)];
    this.lens = [];
    this.setQuality(2);
    this.lastCamX = null; this.lastCamY = null;
  }
  setQuality(q) {
    const count = [140, 260, 420][q] || 260;
    const rng = createRng('flakes');
    this.flakes = [];
    for (let i = 0; i < count; i++) {
      const r = rng.next();
      const band = r < 0.45 ? BAND.FAR : r < 0.9 ? BAND.MID : BAND.NEAR;
      this.flakes.push({
        x: rng.next() * this.w, y: rng.next() * this.h, band,
        speed: [22, 46, 95][band] * rng.range(0.7, 1.3),
        size: [0.7, 1, 1][band] * rng.range(0.6, 1.3),
        phase: rng.next() * TAU, sway: rng.range(0.6, 1.6),
        order: rng.next(),
      });
    }
    // draw order: sparse when intensity is low (only flakes with order < intensity)
    this.flakes.sort((a, b) => a.band - b.band);
  }
  /** wind in world px/s (positive = right), snow 0..1, sleet 0..1 */
  update(dt, cam, wind, snow, sleet, time) {
    let dcx = 0, dcy = 0;
    if (this.lastCamX !== null) { dcx = (cam.x - this.lastCamX) * cam.zoom; dcy = (cam.y - this.lastCamY) * cam.zoom; }
    if (Math.abs(dcx) > 200 || Math.abs(dcy) > 200) { dcx = 0; dcy = 0; }
    this.lastCamX = cam.x; this.lastCamY = cam.y;
    const W = this.w + 40, H = this.h + 40;
    for (const f of this.flakes) {
      const p = PARALLAX[f.band];
      const fall = f.speed * (1 + sleet * 2.2);
      const wx = wind * (0.55 + f.band * 0.35) + Math.sin(time * f.sway + f.phase) * 10 * (1 - sleet);
      f.vx = wx; f.vy = fall;
      f.x += wx * dt - dcx * p;
      f.y += fall * dt + dcy * p;
      if (f.x < -20) f.x += W; else if (f.x > this.w + 20) f.x -= W;
      if (f.y > this.h + 20) { f.y -= H; } else if (f.y < -20) f.y += H;
    }
    // lens sleet drops
    if (sleet > 0.2 && Math.random() < sleet * dt * 3) {
      this.lens.push({ x: Math.random() * this.w, y: Math.random() * this.h * 0.6, len: 30 + Math.random() * 80, life: 1.4, ang: Math.atan2(1, wind / 150) });
    }
    for (let i = this.lens.length - 1; i >= 0; i--) {
      const d = this.lens[i];
      d.life -= dt;
      d.y += dt * 30;
      if (d.life <= 0) this.lens.splice(i, 1);
    }
  }
  drawBand(ctx, band, snow, sleet, tint, alpha = 1) {
    if (snow <= 0.01) return;
    const spr = this.sprites[band];
    const sz = [3, 5, 14][band];
    ctx.globalAlpha = alpha * [0.55, 0.85, 0.5][band];
    const streak = sleet > 0.15;
    if (streak) { ctx.strokeStyle = rgba(tint, 0.5 * alpha); ctx.lineWidth = band === 2 ? 1.6 : 0.8; ctx.beginPath(); }
    for (const f of this.flakes) {
      if (f.band !== band || f.order > snow) continue;
      if (streak) {
        const k = 0.045 * (1 + band);
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x - f.vx * k, f.y - f.vy * k);
      } else {
        const s = sz * f.size;
        ctx.drawImage(spr, f.x - s / 2, f.y - s / 2, s, s);
      }
    }
    if (streak) ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawLens(ctx) {
    if (!this.lens.length) return;
    ctx.strokeStyle = 'rgba(220,235,255,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (const d of this.lens) {
      ctx.globalAlpha = clamp(d.life, 0, 1);
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + Math.cos(d.ang) * d.len, d.y + Math.sin(d.ang) * d.len);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  drawWhiteout(ctx, amount, color, time) {
    if (amount <= 0.01) return;
    ctx.fillStyle = rgba(color, clamp(amount * 0.82, 0, 0.9));
    ctx.fillRect(0, 0, this.w, this.h);
    // drifting denser streams
    for (let i = 0; i < 3; i++) {
      const y = ((time * (20 + i * 12) + i * 180) % (this.h + 200)) - 100;
      const grd = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      grd.addColorStop(0, rgba(color, 0));
      grd.addColorStop(0.5, rgba(color, amount * 0.35));
      grd.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(0, y - 60, this.w, 120);
    }
  }
}
