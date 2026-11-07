import { formatAlt, formatClock } from '../game/altitude.js';
import { packWeight } from '../game/resources.js';
import { ROPE_LENGTH } from '../game/constants.js';
import { keyLabel } from '../engine/input.js';
import { clamp, TAU } from '../engine/math.js';

const SERIF = '"Cormorant Garamond","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
const SANS = '"Avenir Next","Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
const PX_PER_M = 10; // rope display: 10 world px to a metre

/** Canvas HUD: altitude, clock, meters, forecast, toasts and context hints. */
export class Hud {
  constructor(assets) {
    this.assets = assets;
    this.toasts = [];
    this.forecast = null;
    this.alpha = 0;
    this.staminaArc = 0;
  }
  toast(text, kind = 'info', dur = 2.6) {
    if (this.toasts.some((t) => t.text === text && t.life > 0.5)) return;
    this.toasts.push({ text, kind, life: dur, max: dur });
    if (this.toasts.length > 3) this.toasts.shift();
  }
  setForecast(f) { this.forecast = f ? { ...f, t: 0 } : null; }

  draw(ctx, app, dt) {
    const c = app.climb;
    if (!c) return;
    const s = app.settings;
    const p = c.player;
    const r = c.resources;
    const safe = s.colorSafe;
    const target = app.scene === 'climb' && !app.ending ? 1 : 0;
    this.alpha += (target - this.alpha) * Math.min(1, dt * 3);
    if (this.alpha < 0.02) return;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.textBaseline = 'alphabetic';

    // ---- altitude and clock ----
    const grd = ctx.createRadialGradient(90, 45, 0, 90, 45, 140);
    grd.addColorStop(0, 'rgba(5,8,24,0.35)'); grd.addColorStop(1, 'rgba(5,8,24,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 240, 190);
    ctx.fillStyle = '#eef4ff';
    ctx.font = `500 30px ${SERIF}`;
    ctx.fillText(formatAlt(c.altitude), 22, 44);
    ctx.font = `11px ${SANS}`;
    ctx.fillStyle = 'rgba(238,244,255,0.72)';
    const campName = c.campIndex === 0 ? 'Above base camp' : `Above camp ${['', 'I', 'II', 'III', 'IV'][c.campIndex]}`;
    ctx.fillText(`${campName}  ·  ${formatClock(c.hourOfDay)}  ·  Day ${c.day}`, 23, 62);
    // route strip: base, camps, summit
    const x0 = 23, x1 = 200, yb = 74;
    ctx.strokeStyle = 'rgba(238,244,255,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.stroke();
    const H = c.terrain.height;
    for (const cp of c.camps) {
      const x = x0 + (cp.y / H) * (x1 - x0);
      ctx.fillStyle = cp.visited ? '#ffb35c' : 'rgba(238,244,255,0.5)';
      ctx.fillRect(x - 1.5, yb - 3, 3, 6);
    }
    ctx.fillStyle = '#eef4ff';
    ctx.beginPath(); ctx.moveTo(x1, yb - 5); ctx.lineTo(x1 + 4, yb + 2); ctx.lineTo(x1 - 4, yb + 2); ctx.fill();
    const px = x0 + clamp(p.y / H) * (x1 - x0);
    ctx.fillStyle = '#ffb35c';
    ctx.beginPath(); ctx.arc(px, yb, 3, 0, TAU); ctx.fill();
    const best = x0 + clamp(c.stats.maxY / H) * (x1 - x0);
    ctx.fillStyle = 'rgba(255,179,92,0.4)'; ctx.fillRect(x0, yb - 0.5, best - x0, 1);

    // ---- weather and forecast (top right) ----
    ctx.textAlign = 'right';
    ctx.font = `13px ${SERIF}`;
    ctx.fillStyle = 'rgba(238,244,255,0.85)';
    ctx.fillText(c.weather.label, 938, 32);
    const wind = c.weather.windSpeed;
    ctx.save();
    ctx.translate(938 - ctx.measureText(c.weather.label).width - 22, 28);
    ctx.strokeStyle = 'rgba(238,244,255,0.8)'; ctx.lineWidth = 1.4;
    const wl = 6 + Math.min(14, Math.abs(wind) / 10);
    ctx.scale(Math.sign(wind) || 1, 1);
    ctx.beginPath(); ctx.moveTo(-wl / 2, 0); ctx.lineTo(wl / 2, 0); ctx.lineTo(wl / 2 - 4, -3); ctx.moveTo(wl / 2, 0); ctx.lineTo(wl / 2 - 4, 3); ctx.stroke();
    ctx.restore();
    if (this.forecast) {
      const f = this.forecast;
      f.t += dt;
      const eta = Math.max(0, Math.round(c.weather.timer));
      if (c.weather.state === f.state || f.t > 40) this.forecast = null;
      else {
        const pulse = 0.65 + 0.35 * Math.sin(f.t * 4);
        ctx.font = `11px ${SANS}`;
        ctx.fillStyle = f.worse ? (safe ? `rgba(255,210,58,${pulse})` : `rgba(255,179,92,${pulse})`) : 'rgba(190,215,255,0.85)';
        ctx.fillText(`${f.worse ? '⚠ ' : ''}Forecast: ${f.label} in ~${eta}s`, 938, 50);
      }
    }
    if (s.showFps) { ctx.font = `10px ${SANS}`; ctx.fillStyle = 'rgba(238,244,255,0.6)'; ctx.fillText(`${Math.round(app.loop.fps)} fps`, 938, 530); }
    ctx.textAlign = 'left';

    // ---- meters (bottom left) ----
    const bx = 22, by = 486;
    const vg = ctx.createRadialGradient(130, 560, 0, 130, 560, 240);
    vg.addColorStop(0, 'rgba(5,8,24,0.5)'); vg.addColorStop(1, 'rgba(5,8,24,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 300, 380, 240);
    this.bar(ctx, bx, by, 170, 6, p.stamina / 100, p.fatigue, safe ? '#5aa9ff' : p.stamina < 25 ? '#ff7a3a' : '#ffb35c', 'Grip', safe && p.stamina < 25);
    this.bar(ctx, bx, by + 20, 120, 4, p.health / 100, 1, safe ? '#eef4ff' : p.health < 35 ? '#ff6a4a' : '#d8e2ff', 'Condition', safe && p.health < 35);
    // items
    let ix = bx;
    const iy = by + 34;
    const item = (name, text, warn) => {
      const img = this.assets.get(name, 32);
      ctx.drawImage(img, ix, iy, 16, 16);
      ctx.font = `11px ${SANS}`;
      ctx.fillStyle = warn ? (safe ? '#ffd23a' : '#ff9a6a') : 'rgba(238,244,255,0.85)';
      ctx.fillText(text, ix + 19, iy + 12);
      ix += 22 + ctx.measureText(text).width + 12;
    };
    const ox = r.oxygen;
    const above = c.altitude >= c.peak.oxygenAlt;
    item('oxygen', `${Math.round(ox.level * 100)}% +${ox.spares}`, above && ox.level < 0.25);
    item('food', `×${r.food}`, r.food === 0);
    item('piton', `×${r.pitons}`, r.pitons === 0);
    const ropeLeft = Math.max(0, ROPE_LENGTH - c.ropeOut);
    item('rope', c.roped ? `${Math.round(ropeLeft / PX_PER_M)} m` : 'out', !c.roped || ropeLeft < 100);
    ctx.font = `11px ${SANS}`;
    const w = packWeight(r);
    ctx.fillStyle = w > 14 ? 'rgba(255,200,150,0.85)' : 'rgba(238,244,255,0.6)';
    ctx.fillText(`${w.toFixed(1)} kg`, ix, iy + 12);

    // ---- stamina arc by the climber ----
    const want = (p.stamina < p.maxStamina * 0.6 || p.state === 'roped') && p.state !== 'dead' ? 1 : 0;
    this.staminaArc += (want - this.staminaArc) * Math.min(1, dt * 4);
    if (this.staminaArc > 0.03) {
      const cam = app.camera;
      const sx = cam.sx(p.x) + 18 * cam.zoom, sy = cam.sy(p.y + 26);
      ctx.globalAlpha = this.alpha * this.staminaArc * 0.9;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(5,8,24,0.45)';
      ctx.beginPath(); ctx.arc(sx, sy, 9, -Math.PI / 2, -Math.PI / 2 + TAU); ctx.stroke();
      ctx.strokeStyle = safe ? '#5aa9ff' : p.stamina < 25 ? '#ff7a3a' : '#ffcf8a';
      ctx.beginPath(); ctx.arc(sx, sy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.stamina / 100)); ctx.stroke();
      ctx.globalAlpha = this.alpha;
    }

    // ---- toasts ----
    let ty = 108;
    ctx.textAlign = 'center';
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.life -= dt;
      if (t.life <= 0) { this.toasts.splice(i, 1); continue; }
    }
    for (const t of this.toasts) {
      const a = clamp(Math.min(t.life, (t.max - t.life) * 4));
      ctx.globalAlpha = this.alpha * a;
      ctx.font = `italic 17px ${SERIF}`;
      ctx.fillStyle = t.kind === 'warn' ? (safe ? '#ffd23a' : '#ffcf8a') : '#eef4ff';
      ctx.shadowColor = 'rgba(5,8,24,0.8)'; ctx.shadowBlur = 8;
      ctx.fillText(t.text, 480, ty);
      ctx.shadowBlur = 0;
      ty += 24;
    }
    ctx.globalAlpha = this.alpha;

    // ---- context hint ----
    const hint = this.hint(app);
    if (hint) {
      ctx.font = `12px ${SANS}`;
      ctx.fillStyle = 'rgba(238,244,255,0.78)';
      ctx.shadowColor = 'rgba(5,8,24,0.9)'; ctx.shadowBlur = 6;
      ctx.fillText(hint, 480, 512);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  bar(ctx, x, y, w, h, v, ceiling, color, label, hatch) {
    ctx.fillStyle = 'rgba(5,8,24,0.45)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(238,244,255,0.12)';
    ctx.fillRect(x, y, w * clamp(ceiling), h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(v), h);
    if (hatch) {
      ctx.strokeStyle = 'rgba(5,8,24,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < w * clamp(v); i += 5) { ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); }
      ctx.stroke();
    }
    if (ceiling < 0.999) { ctx.fillStyle = 'rgba(238,244,255,0.7)'; ctx.fillRect(x + w * ceiling - 1, y - 2, 1.5, h + 4); }
    ctx.font = `10px ${SANS}`;
    ctx.fillStyle = 'rgba(238,244,255,0.6)';
    ctx.fillText(label, x + w + 8, y + h);
  }

  hint(app) {
    const c = app.climb, p = c.player, s = app.settings;
    const k = (a) => keyLabel(((s.bindings[a] && s.bindings[a][0]) || app.input.bindings[a][0]));
    const touch = app.input.lastDevice === 'touch';
    const name = (a) => (touch ? { jump: 'Lunge', grip: 'Grip', piton: 'Piton', eat: 'Eat', oxygen: 'O₂', down: '▼' }[a] || a : k(a));
    if (p.state === 'lunge') return `${name('jump')} again as the ring closes to catch`;
    if (p.state === 'fall' && !p.hop) return `Hold ${name('grip')} to grab a hold as you pass it`;
    if (c.resources.oxygen.level <= 0 && c.resources.oxygen.spares > 0 && c.altitude > c.peak.oxygenAlt) return `${name('oxygen')}: swap to a fresh oxygen bottle`;
    if (c.weather.gustWarn > 0.25 || c.hazards.avalanche) return `Hold ${name('grip')} to brace`;
    if (p.state === 'roped') return `↑ climb the rope · ← → swing to a hold`;
    if (p.state === 'stand' && p.ledge && p.ledge.kind === 'camp') return `${touch ? '▼' : '↓'} make camp`;
    if (p.state === 'hang' && c.anchors.length > 1 && !c.lastAnchor.camp && Math.hypot(c.lastAnchor.x - p.x, c.lastAnchor.y - p.harnessY) < 48 && p.stamina < 60) return `${touch ? '▼' : '↓'} sit back on the rope to rest`;
    if (p.stamina < 30 && c.resources.food > 0) return `${name('eat')}: eat to recover`;
    if (c.time < 40 && p.state === 'stand') return `↑ reach · ${name('jump')} + direction to lunge · ${name('piton')} place piton`;
    return '';
  }
}
