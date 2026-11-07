import { createRng } from '../engine/rng.js';
import { mixHex, rgba, clamp, TAU } from '../engine/math.js';
import { wallEdgesAt } from '../game/terrain.js';

/**
 * The climbing wall: a textured rock face baked into vertical chunks that are
 * cached and only re-baked when the palette or quality changes. Holds, snow
 * and anything that changes during play are drawn on top each frame.
 */
const CH = 384;

export class WallRenderer {
  constructor() {
    this.cache = new Map();
    this.terrain = null;
    this.palette = null;
    this.res = 1;
    this.holdSprites = null;
  }
  setTerrain(terrain, palette, res) {
    this.terrain = terrain;
    this.palette = palette;
    this.res = res;
    this.cache.clear();
    this.holdSprites = this.bakeHolds(palette, res);
  }
  setRes(res) {
    if (Math.abs(res - this.res) < 0.01) return;
    this.res = res;
    this.cache.clear();
    if (this.palette) this.holdSprites = this.bakeHolds(this.palette, res);
  }

  bakeHolds(pal, res) {
    const make = (w, h, fn) => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * res); c.height = Math.ceil(h * res);
      const g = c.getContext('2d');
      g.scale(res, res);
      g.translate(w / 2, h / 2);
      fn(g);
      return { c, w, h };
    };
    const jug = make(26, 18, (g) => {
      g.fillStyle = 'rgba(10,12,30,0.45)';
      g.beginPath(); g.ellipse(1.5, 3.5, 10, 5, 0, 0, TAU); g.fill();
      const grd = g.createLinearGradient(0, -6, 0, 5);
      grd.addColorStop(0, mixHex(pal.rockLight, '#ffffff', 0.25));
      grd.addColorStop(1, pal.rockDark);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(-10, 2); g.quadraticCurveTo(-9, -6, -1, -6); g.quadraticCurveTo(9, -6, 10, 1); g.quadraticCurveTo(0, 5, -10, 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-6, -5, 8, 1.2);
    });
    const crimp = make(22, 12, (g) => {
      g.fillStyle = 'rgba(10,12,30,0.45)';
      g.beginPath(); g.ellipse(1, 2.5, 9, 2.6, 0, 0, TAU); g.fill();
      g.fillStyle = mixHex(pal.rockLight, pal.rock, 0.3);
      g.beginPath(); g.moveTo(-9, 1); g.lineTo(-6, -2.5); g.lineTo(7, -2.5); g.lineTo(9, 1); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(-5, -2.4, 10, 0.9);
    });
    const ice = make(22, 24, (g) => {
      g.fillStyle = 'rgba(20,40,80,0.35)';
      g.beginPath(); g.ellipse(1, 6, 8, 3, 0, 0, TAU); g.fill();
      const grd = g.createLinearGradient(-6, -8, 6, 8);
      grd.addColorStop(0, 'rgba(240,252,255,0.95)');
      grd.addColorStop(1, rgba(pal.ice, 0.75));
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(7, -2); g.lineTo(4, 7); g.lineTo(-5, 6); g.lineTo(-7, -3); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-4, -3); g.lineTo(0, -7); g.lineTo(4, -2); g.stroke();
    });
    const thin = make(22, 22, (g) => {
      g.fillStyle = 'rgba(20,40,80,0.25)';
      g.beginPath(); g.ellipse(1, 5, 7, 2.5, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(225,245,255,0.6)';
      g.beginPath(); g.moveTo(0, -7); g.lineTo(6, -1); g.lineTo(3, 5); g.lineTo(-4, 5); g.lineTo(-6, -2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(-3, -1); g.lineTo(1, 2); g.lineTo(4, -2); g.stroke();
    });
    return { jug, crimp, ice, thin };
  }

  /** Global slab columns: continuous across chunks, boundaries wander with y. */
  columns() {
    if (this._cols && this._colsSeed === this.terrain.seed) return this._cols;
    const rng = createRng(this.terrain.seed + ':cols');
    const cols = [];
    let x = -900;
    while (x < 900) {
      const w = rng.range(50, 130);
      cols.push({ x, w, tone: rng.range(-1, 1), ph: rng.next() * 100, amp: rng.range(4, 14), f: rng.range(0.004, 0.012) });
      x += w;
    }
    this._cols = cols; this._colsSeed = this.terrain.seed;
    return cols;
  }

  bakeChunk(k) {
    const T = this.terrain, pal = this.palette, res = this.res;
    const y0 = k * CH, y1 = y0 + CH;
    let xmin = Infinity, xmax = -Infinity;
    for (let y = y0 - 32; y <= y1 + 32; y += 16) {
      const [l, r] = wallEdgesAt(T.wall, y);
      xmin = Math.min(xmin, l); xmax = Math.max(xmax, r);
    }
    xmin = Math.floor(xmin - 30); xmax = Math.ceil(xmax + 30);
    if (y0 > T.wall.top) { this.cache.set(k, { c: null, xmin, xmax, y0, y1, empty: true }); return; }
    const c = document.createElement('canvas');
    c.width = Math.ceil((xmax - xmin) * res);
    c.height = Math.ceil(CH * res);
    const g = c.getContext('2d');
    // world (y-up) -> chunk pixels
    g.setTransform(res, 0, 0, -res, -xmin * res, y1 * res);
    const ys = [];
    for (let y = y0 - 48; y <= y1 + 48; y += 8) ys.push(y);
    const outline = () => {
      g.beginPath();
      ys.forEach((y, i) => { const [l] = wallEdgesAt(T.wall, y); i ? g.lineTo(l, y) : g.moveTo(l, y); });
      for (let i = ys.length - 1; i >= 0; i--) { const [, r] = wallEdgesAt(T.wall, ys[i]); g.lineTo(r, ys[i]); }
      g.closePath();
    };
    // Side faces first: the buttress has thickness, seen on both flanks
    g.beginPath();
    ys.forEach((y, i) => { const [, r] = wallEdgesAt(T.wall, y); i ? g.lineTo(r, y) : g.moveTo(r, y); });
    for (let i = ys.length - 1; i >= 0; i--) { const y = ys[i]; const [, r] = wallEdgesAt(T.wall, y); g.lineTo(r + 18 + Math.sin(y * 0.03) * 4, y - 12); }
    g.closePath();
    g.fillStyle = mixHex(pal.rockDark, '#0a0d22', 0.5);
    g.fill();
    g.beginPath();
    ys.forEach((y, i) => { const [l] = wallEdgesAt(T.wall, y); i ? g.lineTo(l, y) : g.moveTo(l, y); });
    for (let i = ys.length - 1; i >= 0; i--) { const y = ys[i]; const [l] = wallEdgesAt(T.wall, y); g.lineTo(l - 8, y - 8); }
    g.closePath();
    g.fillStyle = mixHex(pal.rockLight, pal.rock, 0.35);
    g.fill();

    outline();
    const base = g.createLinearGradient(-420, 0, 420, 0);
    base.addColorStop(0, mixHex(pal.rock, pal.rockLight, 0.25));
    base.addColorStop(0.5, pal.rock);
    base.addColorStop(1, mixHex(pal.rock, pal.rockDark, 0.65));
    g.fillStyle = base;
    g.fill();
    g.save();
    outline();
    g.clip();

    // Slab columns
    const bx = (col, y) => col.x + Math.sin(y * col.f + col.ph) * col.amp;
    const tone = (col, y) => Math.sin(y * 0.0021 + col.ph) * 0.5 + col.tone * 0.5;
    for (const col of this.columns()) {
      if (col.x + col.w < xmin - 20 || col.x > xmax + 20) continue;
      const next = { ...col, x: col.x + col.w };
      g.beginPath();
      ys.forEach((y, i) => (i ? g.lineTo(bx(col, y), y) : g.moveTo(bx(col, y), y)));
      for (let i = ys.length - 1; i >= 0; i--) g.lineTo(bx(next, ys[i]) - 0.5, ys[i]);
      g.closePath();
      const hg = g.createLinearGradient(col.x, 0, col.x + col.w, 0);
      hg.addColorStop(0, rgba(pal.rockLight, 0.16));
      hg.addColorStop(0.3, rgba(pal.rockLight, 0.03));
      hg.addColorStop(1, rgba(pal.rockDark, 0.2));
      g.fillStyle = hg;
      g.fill();
      const t0 = tone(col, y0 - 48), t1 = tone(col, y1 + 48), tm = tone(col, (y0 + y1) / 2);
      const vg = g.createLinearGradient(0, y0 - 48, 0, y1 + 48);
      const tc = (t) => (t > 0 ? rgba(pal.rockLight, t * 0.14) : rgba(pal.rockDark, -t * 0.2));
      vg.addColorStop(0, tc(t0)); vg.addColorStop(0.5, tc(tm)); vg.addColorStop(1, tc(t1));
      g.fillStyle = vg;
      g.fill();
      // crease along the right boundary
      g.strokeStyle = rgba('#0b0f26', 0.32);
      g.lineWidth = 1.3;
      g.beginPath();
      ys.forEach((y, i) => { const x = bx(next, y) + Math.sin(y * 0.11 + col.ph) * 1.2; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
      g.strokeStyle = rgba(pal.rockLight, 0.18);
      g.lineWidth = 0.8;
      g.beginPath();
      ys.forEach((y, i) => { const x = bx(next, y) + 1.6; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke();
    }

    // Per-cell decorations; each chunk also draws its neighbours' cells so
    // anything straddling a boundary is painted identically on both sides.
    for (let cell = k - 1; cell <= k + 1; cell++) this.decorateCell(g, cell, xmin, xmax);
    // Speckle stays inside its own chunk
    const srng = createRng(T.seed + ':speck' + k);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = srng.chance(0.5) ? rgba(pal.rockLight, 0.3) : rgba('#0c1024', 0.25);
      g.fillRect(srng.range(xmin, xmax), srng.range(y0, y1), srng.range(0.6, 1.5), srng.range(0.6, 1.5));
    }
    this.drawFeatures(g, y0, y1);
    g.restore();

    // Rim: lit left edge, shaded right edge
    g.lineWidth = 2;
    g.strokeStyle = rgba(mixHex(pal.rockLight, '#ffffff', 0.35), 0.55);
    g.beginPath();
    ys.forEach((y, i) => { const [l] = wallEdgesAt(T.wall, y); i ? g.lineTo(l + 0.5, y) : g.moveTo(l + 0.5, y); });
    g.stroke();
    g.lineWidth = 6;
    g.strokeStyle = rgba('#080b1e', 0.42);
    g.beginPath();
    ys.forEach((y, i) => { const [, r] = wallEdgesAt(T.wall, y); i ? g.lineTo(r - 2, y) : g.moveTo(r - 2, y); });
    g.stroke();

    for (const l of T.ledges) {
      if (l.y < y0 - 50 || l.y > y1 + 50) continue;
      this.bakeLedge(g, l, pal, createRng(T.seed + ':ledge' + l.id));
    }
    this.cache.set(k, { c, xmin, xmax, y0, y1 });
  }

  decorateCell(g, cell, xmin, xmax) {
    const T = this.terrain, pal = this.palette;
    const rng = createRng(T.seed + ':cell' + cell);
    const cy0 = cell * CH, cy1 = cy0 + CH;
    const [l0, r0] = wallEdgesAt(T.wall, (cy0 + cy1) / 2);
    const xa = Math.max(xmin, l0 - 40), xb = Math.min(xmax, r0 + 40);
    // tone blotches
    for (let i = 0; i < 14; i++) {
      const x = rng.range(xa, xb), y = rng.range(cy0, cy1), r = rng.range(40, 120);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const col = rng.chance(0.5) ? pal.rockLight : pal.rockDark;
      grd.addColorStop(0, rgba(col, rng.range(0.08, 0.18)));
      grd.addColorStop(1, rgba(col, 0));
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // ledgelets: short horizontal breaks with a lit lip and lodged snow
    for (let i = 0; i < 9; i++) {
      const x = rng.range(xa, xb), y = rng.range(cy0, cy1), w = rng.range(14, 50);
      const tilt = rng.range(-3, 3);
      g.strokeStyle = rgba('#0b0f26', 0.38);
      g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + tilt); g.stroke();
      g.fillStyle = rgba(pal.snow, rng.range(0.4, 0.8));
      g.beginPath();
      g.moveTo(x + 2, y + 0.6); g.quadraticCurveTo(x + w * 0.4, y + rng.range(2, 3.6), x + w * rng.range(0.4, 0.8), y + tilt * 0.6 + 0.6);
      g.closePath(); g.fill();
    }
    // cracks
    for (let i = 0; i < 5; i++) {
      let x = rng.range(xa + 20, xb - 20), y = rng.range(cy0, cy1);
      g.strokeStyle = rgba('#0c1024', 0.45);
      g.lineWidth = rng.range(0.7, 1.4);
      g.beginPath(); g.moveTo(x, y);
      const n = rng.int(5, 11);
      for (let j = 0; j < n; j++) { x += rng.range(-6, 6); y -= rng.range(6, 13); g.lineTo(x, y); }
      g.stroke();
    }
  }

  drawFeatures(g, y0, y1) {
    const T = this.terrain, pal = this.palette;
    for (const f of T.features) {
      if (f.y2 < y0 - 60 || f.y1 > y1 + 60) continue;
      const rng = createRng(T.seed + ':f' + f.y1 + ':' + f.x1);
      if (f.type === 'chimney') {
        const grd = g.createLinearGradient(f.x1, 0, f.x2, 0);
        grd.addColorStop(0, rgba('#0a0d22', 0.0));
        grd.addColorStop(0.25, rgba('#0a0d22', 0.4));
        grd.addColorStop(0.5, rgba('#0a0d22', 0.55));
        grd.addColorStop(0.75, rgba('#0a0d22', 0.4));
        grd.addColorStop(1, rgba('#0a0d22', 0));
        g.fillStyle = grd;
        const fade = g.createLinearGradient(0, f.y1 - 30, 0, f.y1 + 30);
        g.fillRect(f.x1, f.y1, f.x2 - f.x1, f.y2 - f.y1);
        void fade;
        g.strokeStyle = rgba(pal.rockLight, 0.4); g.lineWidth = 2;
        g.beginPath(); g.moveTo(f.x1 + 14, f.y1); g.lineTo(f.x1 + 16, f.y2); g.stroke();
      } else if (f.type === 'overhang') {
        const grd = g.createLinearGradient(0, f.y2, 0, f.y2 - 60);
        grd.addColorStop(0, rgba('#070a1c', 0.42));
        grd.addColorStop(1, rgba('#070a1c', 0));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(f.x1 - 10, f.y2); g.lineTo(f.x2 + 10, f.y2); g.lineTo(f.x2 - 30, f.y2 - 60); g.lineTo(f.x1 + 30, f.y2 - 60);
        g.closePath(); g.fill();
        // roof slab
        g.fillStyle = mixHex(pal.rockDark, pal.rock, 0.3);
        g.beginPath();
        g.moveTo(f.x1 - 14, f.y2 + 4);
        for (let x = f.x1; x <= f.x2; x += 14) g.lineTo(x, f.y2 - rng.range(2, 9));
        g.lineTo(f.x2 + 14, f.y2 + 4);
        g.lineTo(f.x2 + 8, f.y2 + 16); g.lineTo(f.x1 - 8, f.y2 + 16);
        g.closePath(); g.fill();
        g.fillStyle = rgba(pal.snow, 0.85);
        g.beginPath();
        g.moveTo(f.x1 - 8, f.y2 + 15); g.quadraticCurveTo((f.x1 + f.x2) / 2, f.y2 + 21, f.x2 + 8, f.y2 + 15); g.closePath(); g.fill();
        g.fillStyle = rgba(pal.ice, 0.7);
        for (let x = f.x1 + 6; x < f.x2; x += rng.range(8, 22)) {
          const l = rng.range(4, 14);
          g.beginPath(); g.moveTo(x - 1.5, f.y2 - 3); g.lineTo(x + 1.5, f.y2 - 3); g.lineTo(x, f.y2 - 3 - l); g.fill();
        }
      } else if (f.type === 'ice') {
        const cx = (f.x1 + f.x2) / 2, hw = (f.x2 - f.x1) / 2;
        const grd = g.createLinearGradient(f.x1, 0, f.x2, 0);
        grd.addColorStop(0, rgba(pal.ice, 0));
        grd.addColorStop(0.3, rgba(pal.ice, 0.22));
        grd.addColorStop(0.6, rgba('#ffffff', 0.2));
        grd.addColorStop(1, rgba(pal.ice, 0));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(cx - hw * 0.5, f.y1);
        for (let y = f.y1; y <= f.y2; y += 20) g.lineTo(cx - hw * (0.7 + 0.3 * Math.sin(y * 0.05)), y);
        g.lineTo(cx, f.y2 + 10);
        for (let y = f.y2; y >= f.y1; y -= 20) g.lineTo(cx + hw * (0.7 + 0.3 * Math.cos(y * 0.04)), y);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 7; i++) {
          const x = cx + rng.range(-hw * 0.6, hw * 0.6);
          g.lineWidth = rng.range(0.6, 1.4);
          g.beginPath(); g.moveTo(x, f.y1 + rng.range(0, 20)); g.lineTo(x + rng.range(-4, 4), f.y2 - rng.range(0, 30)); g.stroke();
        }
      }
    }
  }

  bakeLedge(g, l, pal, rng) {
    const t = l.kind === 'camp' || l.kind === 'summit' ? 14 : 10;
    // shadow below
    const sh = g.createLinearGradient(0, l.y - t, 0, l.y - t - 26);
    sh.addColorStop(0, rgba('#070a1c', 0.5));
    sh.addColorStop(1, rgba('#070a1c', 0));
    g.fillStyle = sh;
    g.fillRect(l.x1 + 4, l.y - t - 26, l.x2 - l.x1 - 8, 26);
    // front face
    g.fillStyle = mixHex(pal.rockDark, pal.rock, 0.4);
    g.beginPath();
    g.moveTo(l.x1 - 6, l.y);
    g.lineTo(l.x2 + 6, l.y);
    g.lineTo(l.x2 - 4, l.y - t);
    for (let x = l.x2 - 10; x > l.x1 + 6; x -= 12) g.lineTo(x, l.y - t - rng.range(-1, 3));
    g.lineTo(l.x1 + 4, l.y - t);
    g.closePath();
    g.fill();
    // top surface
    g.fillStyle = mixHex(pal.rockLight, pal.rock, 0.2);
    g.fillRect(l.x1 - 6, l.y - 2.5, l.x2 - l.x1 + 12, 3.5);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(l.x1 - 4, l.y + 0.2, l.x2 - l.x1 + 8, 1);
    if (l.kind === 'camp') {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = rgba(pal.rockLight, 0.6);
        g.beginPath(); g.ellipse(rng.range(l.x1 + 10, l.x2 - 10), l.y + 2, rng.range(3, 6), rng.range(2, 3), 0, 0, TAU); g.fill();
      }
    }
  }

  ensure(camBottom, camTop, budget = 1) {
    const k0 = Math.floor(camBottom / CH), k1 = Math.floor(camTop / CH);
    for (let k = k0; k <= k1; k++) if (!this.cache.has(k)) this.bakeChunk(k);
    // pre-bake one chunk ahead in each direction
    for (const k of [k1 + 1, k0 - 1]) if (budget-- > 0 && !this.cache.has(k)) this.bakeChunk(k);
    if (this.cache.size > 6) {
      for (const key of this.cache.keys()) {
        if (key < k0 - 1 || key > k1 + 1) { this.cache.delete(key); if (this.cache.size <= 6) break; }
      }
    }
  }

  drawChunks(ctx, cam) {
    const bottom = cam.viewBottom(20), top = cam.viewTop(20);
    this.ensure(bottom, top);
    const k0 = Math.floor(bottom / CH), k1 = Math.floor(top / CH);
    for (let k = k0; k <= k1; k++) {
      const ch = this.cache.get(k);
      if (!ch || ch.empty) continue;
      const x = cam.sx(ch.xmin), y = cam.sy(ch.y1);
      // overlap by a hair to hide seams
      ctx.drawImage(ch.c, x, y - 0.5, (ch.xmax - ch.xmin) * cam.zoom, CH * cam.zoom + 1);
    }
  }

  drawHold(ctx, cam, h, highlight, colorSafe) {
    if (h.broken) return;
    const spr = this.holdSprites[h.type] || this.holdSprites.jug;
    const z = cam.zoom;
    const x = cam.sx(h.x), y = cam.sy(h.y);
    let jx = 0;
    if (h.type === 'thin' && h.crack > 0.5) jx = (Math.random() - 0.5) * h.crack * 1.2;
    ctx.drawImage(spr.c, x - (spr.w / 2) * z + jx, y - (spr.h / 2) * z, spr.w * z, spr.h * z);
    if (h.snow > 0.05) {
      ctx.fillStyle = rgba('#f4f8ff', clamp(h.snow * 1.2, 0, 0.95));
      ctx.beginPath();
      ctx.ellipse(x, y - 4 * z, 8 * z * clamp(h.snow + 0.3, 0, 1), (1.5 + h.snow * 2.5) * z, 0, Math.PI, TAU);
      ctx.fill();
    }
    if (h.type === 'thin' && h.crack > 0.02) {
      ctx.strokeStyle = colorSafe ? 'rgba(255,210,58,0.95)' : 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      const n = Math.ceil(h.crack * 5);
      for (let i = 0; i < n; i++) {
        const a = (i * 2.4 + h.id) % TAU;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * 7 * z, y + Math.sin(a) * 6 * z);
      }
      ctx.stroke();
    }
    if (highlight) {
      ctx.strokeStyle = highlight === 2 ? 'rgba(255,200,130,0.95)' : highlight === 3 ? 'rgba(200,225,255,0.7)' : 'rgba(255,220,170,0.35)';
      ctx.lineWidth = highlight === 2 ? 1.6 : 1;
      if (highlight === 3) ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, (highlight === 2 ? 11 : 9) * z, 0, TAU); ctx.stroke();
      if (highlight === 3) ctx.setLineDash([]);
    }
  }

  /** Dynamic ledge snow and crevasse state. */
  drawLedgeDynamic(ctx, cam, l, pal, colorSafe, time) {
    const z = cam.zoom;
    const x1 = cam.sx(l.x1 - 4), x2 = cam.sx(l.x2 + 4), y = cam.sy(l.y);
    const depth = clamp(l.snow, 0, 1.2);
    if (depth > 0.04) {
      const hgt = (1.5 + depth * 7) * z;
      const grd = ctx.createLinearGradient(0, y - hgt, 0, y + 2);
      grd.addColorStop(0, '#f6f9ff');
      grd.addColorStop(1, pal.snow === '#eef4ff' ? '#b9c6e6' : mixHex(pal.snow, '#7f8fc0', 0.4));
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x1, y + 1);
      const seg = Math.max(3, Math.round((x2 - x1) / 16));
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const bump = Math.sin(t * Math.PI) * 0.75 + 0.25 + Math.sin(i * 1.7 + l.id) * 0.12;
        ctx.lineTo(x1 + (x2 - x1) * t, y - hgt * bump);
      }
      ctx.lineTo(x2, y + 1);
      ctx.closePath();
      ctx.fill();
    }
    const cv = l.crevasse;
    if (cv) {
      const cx1 = cam.sx(cv.x1), cx2 = cam.sx(cv.x2);
      if (cv.open) {
        ctx.fillStyle = '#05081a';
        ctx.fillRect(cx1, y - 10 * z, cx2 - cx1, 24 * z);
        ctx.fillStyle = rgba(pal.ice, 0.6);
        ctx.fillRect(cx1, y - 10 * z, 2, 24 * z);
        ctx.fillRect(cx2 - 2, y - 10 * z, 2, 24 * z);
      } else {
        // a faint telegraph: blue sag in the snow, cracks grow with stress
        ctx.strokeStyle = colorSafe ? `rgba(255,210,58,${0.35 + cv.stress * 0.6})` : `rgba(120,170,255,${0.3 + cv.stress * 0.6})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx1, y - 2 * z);
        ctx.quadraticCurveTo((cx1 + cx2) / 2, y + (1 + cv.stress * 3) * z, cx2, y - 2 * z);
        if (cv.stress > 0.05) {
          const n = Math.ceil(cv.stress * 6);
          for (let i = 0; i < n; i++) {
            const px = cx1 + ((i + 0.5) / n) * (cx2 - cx1);
            ctx.moveTo(px, y - 2 * z);
            ctx.lineTo(px + Math.sin(i * 3 + time) * 3, y - (5 + i % 3 * 2) * z);
          }
        }
        if (colorSafe) { ctx.setLineDash([2, 2]); ctx.strokeRect(cx1, y - 8 * z, cx2 - cx1, 10 * z); ctx.setLineDash([]); }
        ctx.stroke();
      }
    }
  }
}
export const WALL_CHUNK = CH;
