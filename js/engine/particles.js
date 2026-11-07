/** Pooled particle system. Each particle: position, velocity, life, size, kind. */
export class Particles {
  constructor(max = 400) {
    this.max = max;
    this.pool = [];
    this.live = [];
    for (let i = 0; i < max; i++) this.pool.push({});
  }
  spawn(p) {
    let o = this.pool.pop();
    if (!o) { if (this.live.length >= this.max) return null; o = {}; }
    o.x = p.x; o.y = p.y; o.vx = p.vx || 0; o.vy = p.vy || 0;
    o.life = o.maxLife = p.life || 1;
    o.size = p.size || 2; o.grow = p.grow || 0;
    o.gravity = p.gravity || 0; o.drag = p.drag ?? 0.5;
    o.wind = p.wind ?? 1;
    o.kind = p.kind || 'dot'; o.color = p.color || '#fff';
    o.alpha = p.alpha ?? 1; o.rot = p.rot || 0; o.spin = p.spin || 0;
    this.live.push(o);
    return o;
  }
  update(dt, windX = 0) {
    const l = this.live;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); this.pool.push(p); continue; }
      p.vx += (windX * p.wind - p.vx * p.drag) * dt;
      p.vy += (p.gravity - p.vy * p.drag) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt; p.rot += p.spin * dt;
    }
  }
  clear() { while (this.live.length) this.pool.push(this.live.pop()); }
}
