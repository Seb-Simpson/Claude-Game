import { Sky } from './sky.js';
import { Layers, Foreground } from './layers.js';
import { WallRenderer } from './wall.js';
import { WeatherFx } from './weatherFx.js';
import { Post } from './post.js';
import { Props } from './props.js';
import { gradePlane, holdShadow } from './lighting.js';
import { Particles } from '../engine/particles.js';
import { holdsInRange } from '../game/terrain.js';
import { REACH, LUNGE } from '../game/constants.js';
import { rgba, mixHex, clamp, TAU } from '../engine/math.js';

export const VIEW_W = 960;
export const VIEW_H = 540;

/** Orchestrates one painted frame from back to front. */
export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.near = document.createElement('canvas');
    this.nctx = this.near.getContext('2d');
    this.assets = assets;
    this.scale = 1;
    this.quality = 2;
    this.sky = new Sky(VIEW_W, VIEW_H);
    this.wall = new WallRenderer();
    this.weather = new WeatherFx(VIEW_W, VIEW_H);
    this.post = new Post(VIEW_W, VIEW_H);
    this.props = new Props(assets);
    this.fx = new Particles(500);
    this.layers = null;
    this.fg = null;
    this.terrain = null;
    this.peak = null;
    this.birds = [];
    this.distant = [];
    this.flash = 0; this.flashColor = '#ffffff';
    this.tmpHolds = [];
    this.campLights = [];
  }

  setScale(scale, quality) {
    this.scale = scale;
    this.quality = quality;
    const w = Math.round(VIEW_W * scale), h = Math.round(VIEW_H * scale);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (this.near.width !== w || this.near.height !== h) { this.near.width = w; this.near.height = h; }
    this.weather.setQuality(quality);
    this.fx.max = [200, 350, 500][quality];
    if (this.terrain) this.wall.setRes(this.wallRes());
    if (this.layers) this.layersDirty = true;
  }
  wallRes() { return Math.min(2, this.scale * 1.35 * (this.quality === 0 ? 0.75 : 1)); }

  setWorld(peak, terrain, seed) {
    this.peak = peak;
    this.terrain = terrain;
    this.layers = new Layers(seed);
    this.fg = new Foreground(seed);
    this.wall.setTerrain(terrain, peak.palette, this.wallRes());
    this.fx.clear();
    this.props.rope = [];
    this.layersDirty = true;
  }

  burst(kind, x, y, n = 8, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (opts.speed || 40) * (0.4 + Math.random());
      if (kind === 'chips') this.fx.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp, gravity: -500, life: 0.7, size: 1.4, kind: 'chip', color: '#9aa6c4', drag: 0.2 });
      else if (kind === 'snow') this.fx.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5 + 10, gravity: -60, life: 1.2, size: 2 + Math.random() * 3, grow: 4, kind: 'puff', color: '#f4f8ff', alpha: 0.6, drag: 2 });
      else if (kind === 'ice') this.fx.spawn({ x, y, vx: Math.cos(a) * sp * 1.4, vy: Math.sin(a) * sp, gravity: -600, life: 0.9, size: 2, kind: 'shard', color: '#d6f2ff', rot: a, spin: (Math.random() - 0.5) * 20, drag: 0.1 });
      else if (kind === 'spark') this.fx.spawn({ x, y, vx: Math.cos(a) * sp * 2, vy: Math.sin(a) * sp * 2, gravity: -300, life: 0.25, size: 1, kind: 'spark', color: '#ffd28a', drag: 1 });
      else if (kind === 'ember') this.fx.spawn({ x: x + (Math.random() - 0.5) * 8, y, vx: (Math.random() - 0.5) * 10, vy: 20 + Math.random() * 25, gravity: 0, life: 1.5 + Math.random(), size: 1, kind: 'spark', color: '#ffb35c', drag: 0.3, wind: 0.3 });
      else if (kind === 'dust') this.fx.spawn({ x: x + (Math.random() - 0.5) * 30, y: y + Math.random() * 10, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 40, gravity: -120, life: 1.2, size: 1.2, kind: 'chip', color: '#7d88a8', drag: 0.3 });
    }
  }
  breath(x, y, facing, strength) {
    this.fx.spawn({ x: x + facing * 3, y, vx: facing * 12 + (Math.random() - 0.5) * 4, vy: 4 + Math.random() * 3, life: 1.6, size: 2, grow: 5, kind: 'puff', color: '#eef4ff', alpha: 0.28 * strength, drag: 1.2, wind: 0.6 });
  }
  doFlash(color, a) { this.flashColor = color; this.flash = Math.max(this.flash, a); }

  spawnBirds(n = 7) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const y = 120 + Math.random() * 120;
    for (let i = 0; i < n; i++) {
      this.birds.push({ x: dir > 0 ? -40 - i * 14 : VIEW_W + 40 + i * 14, y: y + Math.abs(i - n / 2) * 6 + Math.random() * 4, dir, ph: Math.random() * TAU, sp: 28 + Math.random() * 6 });
    }
  }
  distantAvalanche() {
    this.distant.push({ x: 150 + Math.random() * 660, y: 190 + Math.random() * 60, t: 0 });
  }

  render(v) {
    const { ctx, scale } = this;
    const { cam, ts, time, climb } = v;
    const W = VIEW_W, H = VIEW_H;
    const pal = this.peak.palette;
    const q = this.quality;
    const progress = v.progress;
    const wx = v.weather;
    const dt = v.dt;

    this.layers.refresh(ts, pal, scale, q, this.layersDirty);
    this.layersDirty = false;
    this.weather.update(dt, cam, wx.wind * 1.4, wx.snow, wx.sleet, time);
    this.fx.update(dt, wx.wind * 0.6);
    this.flash = Math.max(0, this.flash - dt * 2.5);

    // ----- background -----
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (cam.tilt) { ctx.translate(W / 2, H / 2); ctx.rotate(cam.tilt * 0.4); ctx.scale(1.03, 1.03); ctx.translate(-W / 2, -H / 2); }
    this.sky.draw(ctx, ts, time, progress, q);
    this.drawDistantEvents(ctx, dt, ts);
    const boost = v.perspective ? progress : 0;
    const fogShift = Math.sin(time * 0.05) * 30 + wx.wind * 0.6;
    this.layers.drawPlane(ctx, 0, cam.x, progress, boost, W);
    if (q > 0) this.layers.drawClouds(ctx, 0, cam.x, progress, time, wx.wind, 0.55, W);
    if (q > 0) this.layers.drawPlane(ctx, 1, cam.x, progress, boost, W);
    this.layers.drawFog(ctx, this.layers.planeY(this.layers.defs[1], progress) + 200, 60, ts.haze, 0.35 + wx.fog * 0.3, fogShift, W);
    this.drawBirds(ctx, dt, ts);
    this.layers.drawPlane(ctx, 2, cam.x, progress, boost, W);
    if (q > 0) this.layers.drawClouds(ctx, 1, cam.x, progress, time, wx.wind, 0.5, W);
    this.weather.drawBand(ctx, 0, wx.snow, wx.sleet, '#e8eeff', 0.8);
    this.layers.drawPlane(ctx, 3, cam.x, progress, boost, W);
    this.layers.drawFog(ctx, this.layers.planeY(this.layers.defs[3], progress) + 260, 90, ts.haze, 0.3 + progress * 0.3 + wx.fog * 0.4, -fogShift, W);
    if (q > 1) this.layers.drawClouds(ctx, 2, cam.x, progress, time, wx.wind, 0.35 + wx.fog * 0.3, W);

    // ----- play plane -----
    const n = this.nctx;
    n.setTransform(scale, 0, 0, scale, 0, 0);
    n.globalCompositeOperation = 'source-over';
    n.clearRect(0, 0, W, H);
    if (cam.tilt) { n.translate(W / 2, H / 2); n.rotate(cam.tilt); n.translate(-W / 2, -H / 2); }
    this.wall.drawChunks(n, cam);
    const top = cam.viewTop(40), bot = cam.viewBottom(40);
    const lantern = v.lantern;
    // ledges + camps
    this.campLights.length = 0;
    for (const l of this.terrain.ledges) {
      if (l.y < bot || l.y > top) continue;
      this.wall.drawLedgeDynamic(n, cam, l, pal, v.colorSafe, time);
      if (l.kind === 'camp') {
        const fire = this.props.drawCamp(n, cam, l, time, scale, true);
        this.campLights.push(fire);
        if (Math.random() < dt * 6) this.burst('ember', (l.x1 + l.x2) / 2 + 10, l.y + 6, 1);
      } else if (l.kind === 'summit') this.props.drawSummit(n, cam, l, time, scale);
    }
    // holds
    const holds = holdsInRange(this.terrain, bot, top, this.tmpHolds);
    const p = climb && climb.player;
    const lx = lantern ? lantern.x : 0, ly = lantern ? lantern.y : 0;
    const shadowStr = Math.max(ts.dark * 1.2, lantern && lantern.on ? 0.5 : 0);
    for (const h of holds) {
      if (h.broken) continue;
      const sx = cam.sx(h.x), sy = cam.sy(h.y);
      if (sx < -20 || sx > W + 20) continue;
      if (lantern && lantern.on) holdShadow(n, sx, sy, lx, ly, cam.zoom, shadowStr);
    }
    for (const h of holds) {
      let hl = 0;
      if (p && v.showHints) {
        if (h === p.targetHold) hl = 2;
        else if (p.hint && p.hint.reach.has(h.id)) hl = 1;
        else if (p.hint && p.hint.lunge.has(h.id)) hl = 3;
      }
      this.wall.drawHold(n, cam, h, hl, v.colorSafe);
    }
    if (climb) {
      this.props.drawAnchors(n, cam, climb.anchors, scale);
      const hx = p.x, hy = p.y + 18;
      this.props.drawRope(n, cam, climb.anchors, hx, hy, climb.ropeOut, wx.wind, dt, climb.roped);
      for (const r of climb.hazards.rocks) this.props.drawRock(n, cam, r);
      if (p.visible !== false) this.props.drawClimber(n, cam, p, scale, ts, (1 - ts.dark) * (ts.sunUp ? 0.8 : 0));
      if (climb.catchRing) {
        const cr = climb.catchRing;
        this.props.drawCatchRing(n, cam, cr.x, cr.y, cr.progress, cr.inWindow);
      }
    }
    this.drawFx(n, cam, 'chip');
    gradePlane(n, W, H, ts, lantern, v.extraDark || 0);
    // warm camp fires glow after grading so they stay warm at night
    n.setTransform(scale, 0, 0, scale, 0, 0);
    for (const c of this.campLights) this.props.drawCampGlow(n, c.x, c.y, cam.zoom, time, 0.5 + ts.dark);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.near, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.drawFx(ctx, cam, 'puff');
    this.drawFx(ctx, cam, 'shard');
    this.drawFx(ctx, cam, 'spark');

    // ----- foreground and weather -----
    this.weather.drawBand(ctx, 1, wx.snow, wx.sleet, '#f2f6ff', 1);
    if (climb && climb.hazards.avalanche) this.drawAvalanche(ctx, climb.hazards.avalanche, time);
    if (q > 0 || v.mode === 'climb') this.fg.draw(ctx, pal, ts, scale, q, cam.y, cam.zoom, W, H);
    this.weather.drawBand(ctx, 2, wx.snow, wx.sleet, '#ffffff', 0.9);
    this.post.drawHaze(ctx, ts.haze, clamp(progress * 0.12 + wx.fog * 0.12, 0, 0.3));
    this.weather.drawWhiteout(ctx, wx.whiteout, mixHex('#e8eef8', ts.haze, 0.25 + ts.dark * 0.5), time);
    this.post.drawGlare(ctx, ts, ts.glare * (1 - wx.whiteout) * (1 - wx.snow * 0.6));
    this.weather.drawLens(ctx);
    if (climb) {
      for (const wr of climb.hazards.warnings) {
        const sx = cam.sx(wr.x);
        this.props.drawRockWarning(ctx, clamp(sx, 20, W - 20), time, v.colorSafe, clamp(wr.t * 2, 0, 1));
      }
    }
    this.post.drawFrost(ctx, v.frost);
    this.post.drawVignette(ctx, v.vignette, v.vignetteTight);
    this.post.drawFlash(ctx, this.flashColor, this.flash);
  }

  drawFx(ctx, cam, kind) {
    const z = cam.zoom;
    for (const p of this.fx.live) {
      if (p.kind !== kind) continue;
      const x = cam.sx(p.x), y = cam.sy(p.y);
      const k = p.life / p.maxLife;
      if (kind === 'puff') {
        ctx.globalAlpha = p.alpha * k;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(x, y, p.size * z, 0, TAU); ctx.fill();
      } else if (kind === 'shard') {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot);
        ctx.fillRect(-2 * z, -0.6 * z, 4 * z, 1.2 * z);
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(x - p.size * z / 2, y - p.size * z / 2, p.size * z, p.size * z);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawBirds(ctx, dt, ts) {
    if (!this.birds.length) return;
    ctx.strokeStyle = rgba(mixHex('#1a1f3a', ts.haze, 0.35), 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.x += b.dir * b.sp * dt; b.ph += dt * 8;
      b.y += Math.sin(b.ph * 0.2) * 0.1;
      if (b.x < -80 || b.x > VIEW_W + 80) { this.birds.splice(i, 1); continue; }
      const f = Math.sin(b.ph) * 2.5;
      ctx.moveTo(b.x - 4, b.y - f); ctx.quadraticCurveTo(b.x - 2, b.y - 1, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 2, b.y - 1, b.x + 4, b.y - f);
    }
    ctx.stroke();
  }

  drawDistantEvents(ctx, dt, ts) {
    for (let i = this.distant.length - 1; i >= 0; i--) {
      const d = this.distant[i];
      d.t += dt;
      if (d.t > 14) { this.distant.splice(i, 1); continue; }
      const k = d.t / 14;
      const a = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.55;
      const len = 20 + k * 90;
      const grd = ctx.createLinearGradient(d.x, d.y, d.x + 30, d.y + len);
      const col = mixHex('#f2f5ff', ts.haze, 0.4);
      grd.addColorStop(0, rgba(col, a));
      grd.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(d.x - 4, d.y);
      ctx.quadraticCurveTo(d.x + 8 + k * 20, d.y + len * 0.5, d.x + 10 + k * 40, d.y + len);
      ctx.lineTo(d.x + 26 + k * 50, d.y + len);
      ctx.quadraticCurveTo(d.x + 14 + k * 20, d.y + len * 0.4, d.x + 6, d.y);
      ctx.fill();
    }
  }

  drawAvalanche(ctx, av, time) {
    const a = av.phase === 'warn' ? av.t / av.warn * 0.25 : av.phase === 'flow' ? 0.85 : clamp(1 - av.t / 2, 0, 1) * 0.6;
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    for (let i = 0; i < 26; i++) {
      const sx = ((i * 97.3 + time * 40) % (VIEW_W + 200)) - 100;
      const sy = ((time * (220 + (i % 5) * 40) + i * 53) % (VIEW_H + 240)) - 120;
      const r = 50 + (i % 4) * 22;
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      grd.addColorStop(0, 'rgba(244,248,255,0.75)');
      grd.addColorStop(1, 'rgba(244,248,255,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
}
export { REACH, LUNGE };
