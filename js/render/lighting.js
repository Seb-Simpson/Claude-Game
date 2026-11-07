import { rgba, mixHex, clamp } from '../engine/math.js';

/**
 * Lighting for the play plane: ambient time-of-day grade with a lantern hole,
 * warm additive glow, low sun rim tint, and soft shadows from nearby holds.
 */
export function gradePlane(ctx, w, h, ts, lantern, extraDark) {
  const dark = clamp(ts.dark + extraDark, 0, 0.85);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const cw = ctx.canvas.width, chh = ctx.canvas.height;
  const s = cw / w;
  ctx.globalCompositeOperation = 'source-atop';
  // sky colour bleeds into the rock so every plane shares one light
  const amb = ctx.createLinearGradient(0, 0, 0, chh);
  amb.addColorStop(0, rgba(ts.mid, 0.14));
  amb.addColorStop(0.55, rgba(ts.hor, 0.08));
  amb.addColorStop(1, rgba(ts.haze, 0.24));
  ctx.fillStyle = amb;
  ctx.fillRect(0, 0, cw, chh);
  // low-angle sun warms the rock at dawn and dusk
  const warm = (1 - Math.abs(ts.sunElev - 0.25) * 3) * (ts.sunUp ? 1 : 0);
  if (warm > 0.02) {
    const sx = ts.sunX * cw;
    const g = ctx.createRadialGradient(sx, chh * 0.4, 0, sx, chh * 0.4, cw * 0.9);
    g.addColorStop(0, rgba(ts.light, 0.22 * clamp(warm, 0, 1)));
    g.addColorStop(1, rgba(ts.light, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, chh);
  }
  if (dark > 0.01) {
    const amb = mixHex('#0a0f2e', ts.top, 0.4);
    if (lantern && lantern.on) {
      const lx = lantern.x * s, ly = lantern.y * s;
      const r = lantern.radius * s;
      const g = ctx.createRadialGradient(lx, ly, r * 0.08, lx, ly, r);
      g.addColorStop(0, rgba(amb, 0));
      g.addColorStop(0.45, rgba(amb, dark * 0.45));
      g.addColorStop(1, rgba(amb, dark));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = rgba(amb, dark);
    }
    ctx.fillRect(0, 0, cw, chh);
  }
  if (lantern && lantern.on && lantern.intensity > 0.02) {
    ctx.globalCompositeOperation = 'lighter';
    const lx = lantern.x * s, ly = lantern.y * s, r = lantern.radius * 0.7 * s;
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g.addColorStop(0, `rgba(255,170,80,${0.32 * lantern.intensity})`);
    g.addColorStop(0.4, `rgba(255,120,50,${0.12 * lantern.intensity})`);
    g.addColorStop(1, 'rgba(255,120,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Hold shadows cast away from the lantern (night) or the sun (day). */
export function holdShadow(ctx, sx, sy, lx, ly, z, strength) {
  const dx = sx - lx, dy = sy - ly;
  const d = Math.hypot(dx, dy) || 1;
  if (d > 160) return;
  const len = (4 + d * 0.06) * z;
  const a = strength * (1 - d / 160);
  ctx.fillStyle = `rgba(5,8,25,${0.35 * a})`;
  ctx.beginPath();
  ctx.ellipse(sx + (dx / d) * len, sy + (dy / d) * len, 8 * z, 4 * z, Math.atan2(dy, dx), 0, Math.PI * 2);
  ctx.fill();
}
