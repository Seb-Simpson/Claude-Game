import { rgba, clamp, TAU } from '../engine/math.js';

/** Camps, anchors, rope, hazards and the climber: things living on the play plane. */
export class Props {
  constructor(assets) {
    this.assets = assets;
    this.rope = []; // verlet points for the live rope segment
    this.silhouettes = new Map();
  }

  silhouette(spr) {
    let s = this.silhouettes.get(spr);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = spr.width; s.height = spr.height;
    const g = s.getContext('2d');
    g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#060918';
    g.fillRect(0, 0, s.width, s.height);
    this.silhouettes.set(spr, s);
    return s;
  }

  drawCamp(ctx, cam, ledge, t, scale, lit) {
    const z = cam.zoom;
    const tent = this.assets.get('tent', Math.round(44 * z * scale));
    const tx = cam.sx(ledge.x1 + 70), ty = cam.sy(ledge.y);
    ctx.drawImage(tent, tx - 38 * z, ty - 25.5 * z, 76 * z, 26 * z);
    const crate = this.assets.get('crate', Math.round(14 * z * scale));
    ctx.drawImage(crate, cam.sx(ledge.x2 - 50) - 10 * z, ty - 13 * z, 19 * z, 14 * z);
    const flag = this.assets.get('flag', Math.round(30 * z * scale));
    ctx.drawImage(flag, cam.sx(ledge.x2 - 22) - 4 * z, ty - 30 * z, 19 * z, 30 * z);
    // fire
    const fx = cam.sx((ledge.x1 + ledge.x2) / 2 + 10), fy = ty;
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(fx - 7 * z, fy - 2 * z, 14 * z, 2.5 * z);
    for (let i = 0; i < 4; i++) {
      const f = 0.75 + 0.25 * Math.sin(t * (9 + i * 2.3) + i * 1.7);
      const h = (8 + i * 1.5) * z * f * (lit ? 1 : 0.6);
      const w = (5 - i) * z;
      const grd = ctx.createLinearGradient(0, fy - h, 0, fy);
      grd.addColorStop(0, 'rgba(255,220,140,0)');
      grd.addColorStop(0.4, i < 2 ? 'rgba(255,150,60,0.85)' : 'rgba(255,220,140,0.9)');
      grd.addColorStop(1, 'rgba(255,90,40,0.95)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      const ox = Math.sin(t * 5 + i) * 1.2 * z;
      ctx.moveTo(fx - w + ox * 0.3, fy);
      ctx.quadraticCurveTo(fx - w * 0.8, fy - h * 0.5, fx + ox, fy - h);
      ctx.quadraticCurveTo(fx + w * 0.8, fy - h * 0.5, fx + w + ox * 0.3, fy);
      ctx.fill();
    }
    return { x: fx, y: fy - 6 * z };
  }

  drawCampGlow(ctx, x, y, z, t, strength) {
    const r = (90 + Math.sin(t * 7) * 4 + Math.sin(t * 13) * 2) * z;
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,170,90,${0.38 * strength})`);
    grd.addColorStop(0.5, `rgba(255,110,50,${0.12 * strength})`);
    grd.addColorStop(1, 'rgba(255,100,40,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }

  drawSummit(ctx, cam, ledge, t, scale) {
    const z = cam.zoom;
    const spr = this.assets.get('summit-flag', Math.round(46 * z * scale));
    const x = cam.sx((ledge.x1 + ledge.x2) / 2 - 20), y = cam.sy(ledge.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, 0, Math.sin(t * 2) * 0.03, 1, 0, 0);
    ctx.drawImage(spr, -10 * z, -46 * z, 31 * z, 46 * z);
    ctx.restore();
  }

  drawAnchors(ctx, cam, anchors, scale) {
    const z = cam.zoom;
    const spr = this.assets.get('piton', Math.round(10 * z * scale));
    for (const a of anchors) {
      if (a.camp) continue;
      ctx.drawImage(spr, cam.sx(a.x) - 3 * z, cam.sy(a.y) - 5 * z, 10 * z, 10 * z);
    }
  }

  /** Rope: fixed segments between anchors, then a simulated slack segment to the climber. */
  drawRope(ctx, cam, anchors, hx, hy, ropeOut, wind, dt, attached) {
    if (!anchors.length) return;
    const z = cam.zoom;
    ctx.strokeStyle = '#e5672f';
    ctx.lineWidth = Math.max(1, 1.3 * z);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 1; i < anchors.length; i++) {
      const a = anchors[i - 1], b = anchors[i];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.06;
      ctx.moveTo(cam.sx(a.x), cam.sy(a.y));
      ctx.quadraticCurveTo(cam.sx(mx), cam.sy(my), cam.sx(b.x), cam.sy(b.y));
    }
    ctx.stroke();
    if (!attached) { this.rope.length = 0; return; }
    const last = anchors[anchors.length - 1];
    const N = 12;
    if (this.rope.length !== N + 1) {
      this.rope = [];
      for (let i = 0; i <= N; i++) { const t = i / N; const x = last.x + (hx - last.x) * t, y = last.y + (hy - last.y) * t; this.rope.push({ x, y, px: x, py: y }); }
    }
    const d = Math.hypot(hx - last.x, hy - last.y);
    const rest = Math.max(d, Math.min(ropeOut, d + 40)) * 1.03 / N;
    const pts = this.rope;
    const step = Math.min(dt, 1 / 30);
    for (let i = 1; i < N; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
      p.px = p.x; p.py = p.y;
      p.x += vx + wind * 0.02 * step * 60 * 0.05;
      p.y += vy - 420 * step * step;
    }
    pts[0].x = last.x; pts[0].y = last.y; pts[N].x = hx; pts[N].y = hy;
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dd = Math.hypot(dx, dy) || 0.001;
        const diff = (dd - rest) / dd * 0.5;
        if (dd < rest) continue; // rope only resists stretching
        if (i > 0) { a.x += dx * diff; a.y += dy * diff; }
        if (i + 1 < N) { b.x -= dx * diff; b.y -= dy * diff; }
      }
      pts[0].x = last.x; pts[0].y = last.y; pts[N].x = hx; pts[N].y = hy;
    }
    const taut = clamp((d / (ropeOut || 1) - 0.92) * 10, 0, 1);
    ctx.strokeStyle = taut > 0.5 ? '#ff9a5a' : '#e5672f';
    ctx.beginPath();
    ctx.moveTo(cam.sx(pts[0].x), cam.sy(pts[0].y));
    for (let i = 1; i <= N; i++) ctx.lineTo(cam.sx(pts[i].x), cam.sy(pts[i].y));
    ctx.stroke();
  }

  drawClimber(ctx, cam, p, scale, ts, shadowStrength) {
    const z = cam.zoom;
    const H = 38;
    const name = 'climber-' + (p.pose || 'idle');
    const spr = this.assets.get(name, Math.round(H * z * scale));
    const w = (H * 64 / 96) * z, h = H * z;
    const x = cam.sx(p.x), y = cam.sy(p.y);
    const tilt = p.tilt || 0;
    // soft cast shadow on the rock
    if (shadowStrength > 0.02) {
      const sil = this.silhouette(spr);
      const off = ts.sunUp ? (0.5 - ts.sunX) * 12 : 0;
      ctx.globalAlpha = 0.28 * shadowStrength;
      ctx.drawImage(sil, x - w / 2 + off * z + 3 * z, y - h + 3 * z, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(x, y - h / 2);
    if (tilt) ctx.rotate(tilt);
    if (p.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    // snow settling on the shoulders and pack
    const s = p.snowCover || 0;
    if (s > 0.05) {
      ctx.fillStyle = `rgba(245,249,255,${clamp(s * 1.3, 0, 0.95)})`;
      ctx.beginPath();
      ctx.ellipse(-6 * z * 0.6, -h / 2 + 13 * z * 0.4 + 4 * z, 4 * z * s + 1, 1.6 * z * s + 0.5, -0.3, 0, TAU);
      ctx.ellipse(6 * z * 0.6, -h / 2 + 13 * z * 0.4 + 4 * z, 4 * z * s + 1, 1.6 * z * s + 0.5, 0.3, 0, TAU);
      ctx.ellipse(0, -h / 2 + 11 * z, 5 * z * s + 1, 1.4 * z * s + 0.5, 0, 0, TAU);
      ctx.ellipse(0, -h / 2 + 3.2 * z, 3.5 * z * s, 1.3 * z * s + 0.3, 0, Math.PI, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawRock(ctx, cam, r) {
    const z = cam.zoom;
    const x = cam.sx(r.x), y = cam.sy(r.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r.rot);
    ctx.fillStyle = '#2a3048';
    ctx.beginPath();
    const s = r.size * z;
    ctx.moveTo(-s, -s * 0.4); ctx.lineTo(-s * 0.3, -s); ctx.lineTo(s * 0.8, -s * 0.6); ctx.lineTo(s, s * 0.3); ctx.lineTo(s * 0.1, s); ctx.lineTo(-s * 0.8, s * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,175,205,0.6)';
    ctx.beginPath(); ctx.moveTo(-s * 0.3, -s); ctx.lineTo(s * 0.8, -s * 0.6); ctx.lineTo(0, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /** Warning marker at the top edge for incoming rockfall. */
  drawRockWarning(ctx, sx, t, colorSafe, alpha) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 14);
    ctx.globalAlpha = alpha * pulse;
    ctx.fillStyle = colorSafe ? '#ffd23a' : '#ff8a48';
    ctx.beginPath();
    ctx.moveTo(sx, 34); ctx.lineTo(sx - 10, 16); ctx.lineTo(sx + 10, 16); ctx.closePath(); ctx.fill();
    if (colorSafe) { ctx.fillStyle = '#0b1030'; ctx.fillRect(sx - 1.2, 18, 2.4, 8); ctx.fillRect(sx - 1.2, 28, 2.4, 2); }
    const grd = ctx.createLinearGradient(0, 0, 0, 140);
    grd.addColorStop(0, rgba(colorSafe ? '#ffd23a' : '#ff8a48', 0.25 * alpha));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(sx - 18, 0, 36, 140);
    ctx.globalAlpha = 1;
  }

  drawCatchRing(ctx, cam, x, y, progress, inWindow) {
    const z = cam.zoom;
    const r = (10 + (1 - progress) * 26) * z;
    ctx.strokeStyle = inWindow ? 'rgba(255,214,150,0.95)' : 'rgba(220,235,255,0.6)';
    ctx.lineWidth = inWindow ? 2.2 : 1.2;
    ctx.beginPath(); ctx.arc(cam.sx(x), cam.sy(y), r, 0, TAU); ctx.stroke();
  }
}
