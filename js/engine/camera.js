import { approach, clamp } from './math.js';

/** World is y-up. Screen is y-down, origin at top-left of the 960x540 logical view. */
export class Camera {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.x = 0; this.y = 0;
    this.zoom = 1.3;
    this.tilt = 0;
    this.shakeAmt = 0; this.shakeX = 0; this.shakeY = 0; this.shakeT = 0;
    this.shakeEnabled = true;
  }
  follow(tx, ty, dt, rate = 4) {
    this.x = approach(this.x, tx, rate * 0.8, dt);
    this.y = approach(this.y, ty, rate, dt);
  }
  shake(amount) { if (this.shakeEnabled) this.shakeAmt = Math.max(this.shakeAmt, amount); }
  update(dt) {
    this.shakeT += dt;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 6 * Math.max(1, this.shakeAmt));
    const a = this.shakeAmt;
    this.shakeX = Math.sin(this.shakeT * 53) * a * 4 + Math.sin(this.shakeT * 31) * a * 2;
    this.shakeY = Math.cos(this.shakeT * 47) * a * 4;
  }
  sx(x) { return (x - this.x) * this.zoom + this.w / 2 + this.shakeX; }
  sy(y) { return (this.y - y) * this.zoom + this.h / 2 + this.shakeY; }
  wx(sx) { return (sx - this.w / 2 - this.shakeX) / this.zoom + this.x; }
  wy(sy) { return this.y - (sy - this.h / 2 - this.shakeY) / this.zoom; }
  /** World-space vertical extent currently visible (with margin). */
  viewTop(m = 0) { return this.y + (this.h / 2) / this.zoom + m; }
  viewBottom(m = 0) { return this.y - (this.h / 2) / this.zoom - m; }
  apply(ctx, scale) {
    // tilt rotates about screen centre
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (this.tilt) {
      ctx.translate(this.w / 2, this.h / 2);
      ctx.rotate(clamp(this.tilt, -0.05, 0.05));
      ctx.translate(-this.w / 2, -this.h / 2);
    }
  }
}
