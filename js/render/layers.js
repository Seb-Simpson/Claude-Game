import { createRng } from '../engine/rng.js';
import { mixHex, rgba, clamp } from '../engine/math.js';

/**
 * Parallax mountain planes. Each plane is a horizontally tiling ridge baked
 * into an offscreen canvas with its haze, snow, facet shading and blur. Planes
 * are re-baked when the time-of-day bucket changes (one plane per frame).
 */
const TILE_W = 1920;
const LAYER_H = 560;

// depth: 0 far .. 1 near.  y: ridge baseline on screen at altitude 0.
// sink: how far (screen px) the plane drops across the whole climb.
export const LAYER_DEFS = [
  { name: 'far', depth: 0.0, y: 150, amp: 150, rough: 0.55, parallax: 0.03, sink: 260, haze: 0.72, snow: 0.55, blur: 2.4, res: 0.5, minQ: 0 },
  { name: 'distant', depth: 0.25, y: 235, amp: 120, rough: 0.6, parallax: 0.08, sink: 420, haze: 0.55, snow: 0.45, blur: 1.6, res: 0.55, minQ: 1 },
  { name: 'mid', depth: 0.5, y: 300, amp: 140, rough: 0.62, parallax: 0.18, sink: 640, haze: 0.36, snow: 0.38, blur: 0.9, res: 0.7, minQ: 0 },
  { name: 'near', depth: 0.8, y: 380, amp: 170, rough: 0.66, parallax: 0.38, sink: 980, haze: 0.18, snow: 0.22, blur: 0.4, res: 0.85, minQ: 0 },
];

/**
 * Periodic ridge built from distinct peaks (so planes read as mountains, not
 * hills) plus fine midpoint-displacement detail. n must be a power of two.
 * Returns heights 0..1 and the peak list.
 */
function ridge(rng, n, rough) {
  const detail = new Float32Array(n + 1);
  let step = n, amp = 1;
  while (step > 1) {
    const half = step >> 1;
    for (let i = half; i < n; i += step) detail[i] = (detail[i - half] + detail[(i + half) % n]) / 2 + (rng.next() - 0.5) * amp;
    step = half;
    amp *= rough;
  }
  const peaks = [];
  const k = 5 + Math.floor(rng.next() * 4);
  for (let j = 0; j < k; j++) peaks.push({ c: (j + rng.range(-0.3, 0.3)) / k * n, h: rng.range(0.45, 1), w: rng.range(0.07, 0.16) * n, skew: rng.range(0.7, 1.4) });
  const h = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    let v = 0;
    for (const p of peaks) {
      let d = i - p.c;
      if (d > n / 2) d -= n; else if (d < -n / 2) d += n;
      const w = d < 0 ? p.w * p.skew : p.w / p.skew;
      const t = Math.abs(d) / w;
      const shape = p.h * Math.max(0, 1 - Math.pow(t, 0.85));
      v = Math.max(v, shape);
    }
    h[i] = v * 0.82 + 0.1 + detail[i % n] * 0.12;
  }
  h[n] = h[0];
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i <= n; i++) { mn = Math.min(mn, h[i]); mx = Math.max(mx, h[i]); }
  for (let i = 0; i <= n; i++) h[i] = (h[i] - mn) / (mx - mn || 1);
  h.peaks = peaks.map((p) => Math.round(((p.c % n) + n) % n));
  return h;
}

export class Layers {
  constructor(seed) {
    this.defs = LAYER_DEFS.map((d, i) => {
      const rng = createRng(seed + ':layer' + i);
      const n = 256;
      return { ...d, rng, n, ridge: ridge(rng, n, d.rough), canvas: null, bucket: -1, peakKey: '' };
    });
    this.canBlur = 'filter' in CanvasRenderingContext2D.prototype;
    this.clouds = [];
    this.cloudBucket = -1;
    const crng = createRng(seed + ':clouds');
    for (let i = 0; i < 9; i++) this.clouds.push({ x: crng.range(0, TILE_W), y: crng.range(80, 360), s: crng.range(0.6, 1.4), v: crng.range(0.4, 1), layer: i % 3, sprite: i % 3 });
    this.cloudSprites = [];
    this.cloudBase = [0, 1, 2].map((i) => this.bakeCloudShape(createRng(seed + ':cs' + i)));
  }

  bakeCloudShape(rng) {
    const c = document.createElement('canvas');
    c.width = 360; c.height = 140;
    const g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 50 + rng.next() * 260, y = 60 + (rng.next() - 0.3) * 40 * (1 - Math.abs(x - 180) / 200);
      const r = 18 + rng.next() * 34 * (1 - Math.abs(x - 180) / 260);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.5)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return c;
  }

  tintClouds(ts) {
    this.cloudSprites = this.cloudBase.map((base) => {
      const c = document.createElement('canvas');
      c.width = base.width; c.height = base.height;
      const g = c.getContext('2d');
      g.drawImage(base, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      const grd = g.createLinearGradient(0, 20, 0, 120);
      grd.addColorStop(0, mixHex('#ffffff', ts.light, 0.5));
      grd.addColorStop(1, mixHex(ts.haze, ts.mid, 0.4));
      g.fillStyle = grd;
      g.globalAlpha = 0.85;
      g.fillRect(0, 0, c.width, c.height);
      return c;
    });
  }

  bake(L, ts, palette, scale, quality) {
    const res = Math.max(0.35, L.res * scale * (quality === 0 ? 0.7 : 1));
    const W = Math.ceil(TILE_W * res), H = Math.ceil(LAYER_H * res);
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const g = tmp.getContext('2d');
    g.scale(res, res);
    const { n, ridge: r, amp } = L;
    const dx = TILE_W / n;
    const top = 40;
    const yAt = (i) => top + (1 - r[i]) * amp;

    const night = ts.dark;
    const base = mixHex(mixHex(palette.rockDark, palette.rock, 0.3 + L.depth * 0.2), ts.haze, L.haze);
    const baseN = mixHex(base, '#0a0e2a', night * (0.55 + L.depth * 0.3));
    const fog = mixHex(ts.haze, ts.hor, 0.4);
    const fogN = mixHex(fog, '#151a40', night * 0.6);
    const snowLit = mixHex(mixHex(palette.snow, ts.light, 0.35), ts.haze, L.haze * 0.75);
    const snowCol = mixHex(snowLit, '#2a3366', night * 0.7);
    const shadowCol = mixHex(mixHex('#1a2050', ts.mid, 0.3), ts.haze, L.haze * 0.6);

    const path = () => {
      g.beginPath();
      g.moveTo(0, LAYER_H);
      for (let i = 0; i <= n; i++) g.lineTo(i * dx, yAt(i));
      g.lineTo(TILE_W, LAYER_H);
      g.closePath();
    };
    // Body
    path();
    const body = g.createLinearGradient(0, top, 0, LAYER_H);
    body.addColorStop(0, baseN);
    body.addColorStop(0.55, mixHex(baseN, fogN, 0.35));
    body.addColorStop(1, fogN);
    g.fillStyle = body;
    g.fill();
    g.save();
    path();
    g.clip();

    // Snow caps: lower edge follows smooth noise so it forms couloirs, not teeth
    const snowLine = top + amp * (1 - L.snow);
    const sn = (i) => Math.sin(i * 0.19 + L.depth * 7) * 0.5 + Math.sin(i * 0.53 + 2.1) * 0.3 + Math.sin(i * 1.31) * 0.2;
    g.beginPath();
    for (let i = 0; i <= n; i++) i ? g.lineTo(i * dx, yAt(i) - 1) : g.moveTo(0, yAt(0) - 1);
    for (let i = n; i >= 0; i--) {
      const y = yAt(i);
      const above = Math.max(0, snowLine - y);
      const depth = above > 0 ? above * 0.85 + 6 + sn(i) * 14 : 0;
      g.lineTo(i * dx, y + depth);
    }
    g.closePath();
    const sg = g.createLinearGradient(0, top, 0, snowLine + 30);
    sg.addColorStop(0, snowCol);
    sg.addColorStop(0.7, rgba(snowCol, 0.85));
    sg.addColorStop(1, rgba(snowCol, 0.25));
    g.fillStyle = sg;
    g.fill();

    // Facet shading: the side of each peak facing away from the sun is in shadow
    const dir = ts.sunX < 0.5 ? 1 : -1; // shadow side
    g.fillStyle = rgba(shadowCol, 0.38 + L.depth * 0.2);
    for (const pi of r.peaks) {
      const px = pi * dx, py = yAt(pi);
      g.beginPath();
      g.moveTo(px, py);
      let j = pi, steps = 0;
      while (steps++ < n / 3) {
        const nj = (j + dir + n) % n;
        if (r[nj] > r[j] + 0.004 && steps > 3) break;
        j = nj;
        g.lineTo(((pi + dir * steps) * dx), yAt(j));
      }
      const endX = (pi + dir * steps) * dx;
      g.lineTo(endX, LAYER_H);
      // spur: a jagged line running down from the summit
      let sx = px, sy = py;
      const spur = [];
      while (sy < LAYER_H) { sy += 10 + L.rng.next() * 14; sx += dir * (2 + L.rng.next() * 5) + (L.rng.next() - 0.5) * 6; spur.push([sx, sy]); }
      for (let q = spur.length - 1; q >= 0; q--) g.lineTo(spur[q][0], spur[q][1]);
      g.closePath();
      g.fill();
      // tiled copies so shading wraps across the tile seam
      if (px < 200 || px > TILE_W - 200) {
        g.save(); g.translate(px < 200 ? TILE_W : -TILE_W, 0); g.fill(); g.restore();
      }
    }
    // Couloirs: snow streaks from the summits
    g.strokeStyle = rgba(snowCol, 0.32);
    for (const pi of r.peaks) {
      for (let k = 0; k < 4; k++) {
        let x = pi * dx + (L.rng.next() - 0.5) * 50, y = yAt(Math.round(x / dx) & (n - 1)) + 4;
        g.lineWidth = 0.8 + L.rng.next() * 1.6;
        g.beginPath(); g.moveTo(x, y);
        const len = 4 + Math.floor(L.rng.next() * 7);
        for (let s = 0; s < len; s++) { x += (L.rng.next() - 0.5) * 5 + dir * -1.5; y += 7 + L.rng.next() * 6; g.lineTo(x, y); }
        g.stroke();
      }
    }
    // Strata on the nearer planes
    if (L.depth > 0.6) {
      g.strokeStyle = rgba(shadowCol, 0.35);
      g.lineWidth = 1;
      for (let k = 0; k < 40; k++) {
        const x = L.rng.next() * TILE_W, y = top + amp * 0.4 + L.rng.next() * (LAYER_H - top - amp * 0.4);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + L.rng.next() * 40, y - 6 + L.rng.next() * 4); g.stroke();
      }
    }
    // Rim light along the ridge, sun side
    g.restore();
    g.strokeStyle = rgba(mixHex(ts.light, '#ffffff', 0.3), (0.35 - L.haze * 0.25) * (1 - night * 0.7));
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i <= n; i++) i ? g.lineTo(i * dx, yAt(i) + 0.6) : g.moveTo(0, yAt(0) + 0.6);
    g.stroke();
    // Base fog
    const fg = g.createLinearGradient(0, top + amp * 0.6, 0, LAYER_H);
    fg.addColorStop(0, rgba(fogN, 0));
    fg.addColorStop(1, rgba(fogN, 0.85));
    g.fillStyle = fg;
    g.fillRect(0, top + amp * 0.6, TILE_W, LAYER_H);

    if (this.canBlur && quality > 0 && L.blur > 0.3) {
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const og = out.getContext('2d');
      og.filter = `blur(${(L.blur * res).toFixed(2)}px)`;
      og.drawImage(tmp, 0, 0);
      return out;
    }
    return tmp;
  }

  /** Re-bake at most one stale plane per call. */
  refresh(ts, palette, scale, quality, force = false) {
    const key = palette.rock + scale + ':' + quality;
    let did = false;
    for (const L of this.defs) {
      if (L.bucket !== ts.bucket || L.peakKey !== key || force) {
        if (did && !force && L.canvas) continue;
        L.canvas = this.bake(L, ts, palette, scale, quality);
        L.bucket = ts.bucket; L.peakKey = key;
        did = true;
      }
    }
    if (this.cloudBucket !== ts.bucket) { this.tintClouds(ts); this.cloudBucket = ts.bucket; }
  }

  /** Screen y offset of a plane for the camera altitude. */
  planeY(L, progress) {
    return L.y - 40 + progress * L.sink;
  }

  drawPlane(ctx, idx, camX, progress, scaleBoost, w) {
    const L = this.defs[idx];
    if (!L.canvas) return;
    const zoom = 1 + scaleBoost * (1 - L.depth) * 0.12;
    const tw = TILE_W * zoom, th = LAYER_H * zoom;
    const y = this.planeY(L, progress) - (zoom - 1) * 200;
    let x = -((camX * L.parallax) % tw);
    if (x > 0) x -= tw;
    x -= (tw - w) * 0.25;
    while (x < w) { ctx.drawImage(L.canvas, x, y, tw, th); x += tw; }
  }

  drawClouds(ctx, layer, camX, progress, t, wind, alpha, w) {
    if (!this.cloudSprites.length) return;
    ctx.globalAlpha = alpha;
    for (const c of this.clouds) {
      if (c.layer !== layer) continue;
      const par = 0.05 + layer * 0.08;
      const spr = this.cloudSprites[c.sprite];
      let x = (c.x + t * (4 + wind * 6) * c.v - camX * par) % (TILE_W);
      if (x < -400) x += TILE_W;
      const y = c.y + progress * (200 + layer * 220);
      ctx.drawImage(spr, x - 180 * c.s, y - 70 * c.s, 360 * c.s * 1.4, 140 * c.s);
    }
    ctx.globalAlpha = 1;
  }

  /** Horizontal fog band, shifted by wind gusts. */
  drawFog(ctx, y, h, color, alpha, shift, w) {
    if (alpha <= 0.01) return;
    const grd = ctx.createLinearGradient(0, y - h, 0, y + h);
    grd.addColorStop(0, rgba(color, 0));
    grd.addColorStop(0.5, rgba(color, clamp(alpha)));
    grd.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = grd;
    ctx.fillRect(-20 + shift, y - h, w + 40, h * 2);
  }
}

/** Dark, blurred rock silhouettes in the extreme foreground, at the frame edges. */
export class Foreground {
  constructor(seed) {
    this.seed = seed;
    this.canvas = null;
    this.key = '';
    this.period = 1400;
  }
  bake(palette, ts, scale, quality) {
    const res = Math.max(0.4, scale * 0.6);
    const P = this.period;
    const c = document.createElement('canvas');
    c.width = Math.ceil(220 * res); c.height = Math.ceil(P * res);
    const g = c.getContext('2d');
    g.scale(res, res);
    const rng = createRng(this.seed + ':fg');
    const col = mixHex(mixHex(palette.rockDark, '#06081a', 0.55), '#03040e', ts.dark * 0.6);
    const n = 70;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const y = (i / n) * P;
      const bump = Math.max(0, Math.sin(i * 0.37 + rng.next() * 0.5) * 0.6 + Math.sin(i * 0.11) * 0.5);
      pts.push([20 + bump * 150 + rng.next() * 18, y]);
    }
    pts[n][0] = pts[0][0];
    g.beginPath();
    g.moveTo(0, 0);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(0, P);
    g.closePath();
    g.fillStyle = col;
    g.fill();
    // snow on upward-facing edges
    g.strokeStyle = rgba(mixHex(palette.snow, ts.light, 0.3), 0.35 * (1 - ts.dark * 0.6));
    g.lineWidth = 3;
    for (let i = 1; i < n; i++) {
      if (pts[i][0] > pts[i - 1][0] + 6) {
        g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
      }
    }
    if ('filter' in g && quality > 0) {
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      const og = out.getContext('2d');
      og.filter = `blur(${(3 * res).toFixed(1)}px)`;
      og.drawImage(c, 0, 0);
      return out;
    }
    return c;
  }
  draw(ctx, palette, ts, scale, quality, camY, zoom, w, h) {
    const key = palette.rock + ts.bucket + scale + quality;
    if (key !== this.key) { this.canvas = this.bake(palette, ts, scale, quality); this.key = key; }
    const P = this.period;
    const par = 1.35 * zoom;
    let off = (camY * par) % P;
    if (off < 0) off += P;
    const cw = 220;
    for (let k = -1; k <= 1; k++) {
      const y = off - P + k * P;
      ctx.drawImage(this.canvas, -34, y, cw, P);
      ctx.save();
      ctx.translate(w + 34, y + P * 0.37);
      ctx.scale(-1, 1);
      ctx.drawImage(this.canvas, 0, 0, cw, P);
      ctx.restore();
    }
  }
}
