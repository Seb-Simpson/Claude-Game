import { clamp } from '../engine/math.js';

/**
 * Rockfall and avalanches, each telegraphed before it can hurt you, plus
 * cosmetic far-off events (birds, distant avalanches).
 */
export class Hazards {
  constructor(rng, terrain, diff) {
    this.rng = rng;
    this.terrain = terrain;
    this.diff = diff;
    this.rocks = [];
    this.warnings = [];
    this.avalanche = null;
    this.rockTimer = 14;
    this.avTimer = 40;
    this.farTimer = 10;
    this.events = [];
  }
  zoneAt(type, y) {
    for (const z of this.terrain.zones) if (z.type === type && y >= z.y1 && y <= z.y2) return true;
    return false;
  }
  update(dt, p, weather, progress) {
    this.events.length = 0;
    const rng = this.rng, h = this.diff.hazard;
    const climbing = p.state !== 'camp' && p.state !== 'dead' && p.state !== 'summit';

    // Rockfall: more frequent inside rockfall zones and in thaw (midday) conditions
    const inRock = this.zoneAt('rockfall', p.y);
    this.rockTimer -= dt * (inRock ? 1.6 : 0.25) * h;
    if (climbing && this.rockTimer <= 0) {
      this.rockTimer = 10 + rng.next() * 16;
      const x = p.x + rng.range(-70, 70) * (rng.chance(0.6) ? 0.5 : 1.3);
      this.warnings.push({ x, t: 1.7, total: 1.7 });
      this.events.push({ type: 'rockWarn', x });
    }
    for (let i = this.warnings.length - 1; i >= 0; i--) {
      const w = this.warnings[i];
      w.t -= dt;
      if (w.t <= 0) {
        this.warnings.splice(i, 1);
        this.rocks.push({ x: w.x, y: p.y + 330, vx: rng.range(-12, 12), vy: -40, size: rng.range(4, 8), rot: 0, spin: rng.range(-6, 6), hit: false });
      }
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.vy -= 900 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt;
      // shatter on overhang roofs that shelter the climber
      for (const f of this.terrain.features) {
        if (f.type === 'overhang' && r.x > f.x1 && r.x < f.x2 && r.y < f.y2 + 16 && r.y > f.y2 - 20) {
          this.events.push({ type: 'rockShatter', x: r.x, y: f.y2 + 16 });
          r.dead = true;
        }
      }
      if (!r.hit && !r.dead) {
        const dx = r.x - p.x, dy = r.y - (p.y + 26);
        if (Math.abs(dx) < 10 + r.size && Math.abs(dy) < 18 + r.size) {
          r.hit = true;
          this.events.push({ type: 'rockHit', x: r.x, y: r.y, size: r.size });
        } else if (Math.abs(dx) < 34 && Math.abs(dy) < 20 && r.vy < 0) {
          r.nearMissed || this.events.push({ type: 'nearMiss', x: r.x, y: r.y });
          r.nearMissed = true;
        }
      }
      if (r.dead || r.y < p.y - 400) this.rocks.splice(i, 1);
    }

    // Avalanche: needs snow loading and an avalanche zone
    const inAv = this.zoneAt('avalanche', p.y + 100);
    const loading = weather.v.snow;
    if (!this.avalanche) {
      this.avTimer -= dt * (inAv ? 1 : 0.08) * (0.4 + loading) * h;
      if (climbing && this.avTimer <= 0) {
        this.avTimer = 50 + rng.next() * 50;
        if (inAv || rng.chance(0.3)) {
          this.avalanche = { phase: 'warn', t: 0, warn: 3.4, flow: 2.6 };
          this.events.push({ type: 'avalancheWarn' });
        }
      }
    } else {
      const a = this.avalanche;
      a.t += dt;
      if (a.phase === 'warn' && a.t >= a.warn) { a.phase = 'flow'; a.t = 0; this.events.push({ type: 'avalancheFlow' }); }
      else if (a.phase === 'flow') {
        this.events.push({ type: 'avalancheTick', dt, power: clamp(Math.sin((a.t / a.flow) * Math.PI) + 0.3) });
        if (a.t >= a.flow) { a.phase = 'settle'; a.t = 0; }
      } else if (a.phase === 'settle' && a.t > 2.5) this.avalanche = null;
    }

    // Far-off life
    this.farTimer -= dt;
    if (this.farTimer <= 0) {
      this.farTimer = 18 + rng.next() * 30;
      if (progress < 0.6 && weather.v.snow < 0.6 && rng.chance(0.6)) this.events.push({ type: 'birds' });
      else this.events.push({ type: 'distantAvalanche' });
    }
  }
}
