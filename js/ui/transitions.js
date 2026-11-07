/**
 * Full-screen transitions on the top canvas: fade through white and a snow
 * wipe. Each calls `mid` when the screen is fully covered.
 */
export class Transitions {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.active = null;
    this.flakes = [];
    for (let i = 0; i < 140; i++) this.flakes.push({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 2.5, s: 0.6 + Math.random() });
  }
  get busy() { return !!this.active; }
  run(kind, dur, mid, reduced) {
    if (this.active && this.active.mid) { const m = this.active.mid; this.active.mid = null; m(); }
    this.active = { kind: reduced ? 'fade' : kind, t: 0, dur: reduced ? Math.min(dur, 0.6) : dur, mid, done: false };
    return new Promise((res) => { this.active.resolve = res; });
  }
  update(dt) {
    const a = this.active;
    const g = this.g, W = this.c.width, H = this.c.height;
    g.clearRect(0, 0, W, H);
    if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const cover = k < 0.5 ? k * 2 : 2 - k * 2;
    if (k >= 0.5 && a.mid) { const m = a.mid; a.mid = null; m(); }
    if (a.kind === 'white' || a.kind === 'fade') {
      const e = cover * cover * (3 - 2 * cover);
      g.fillStyle = a.kind === 'white' ? `rgba(240,245,255,${e})` : `rgba(5,8,24,${e})`;
      g.fillRect(0, 0, W, H);
    } else {
      // snow wipe: a soft white front sweeps across, trailing flakes
      const front = (k < 0.5 ? k * 2 : (k - 0.5) * 2) * (W * 1.6) - W * 0.3;
      const covering = k < 0.5;
      const grd = g.createLinearGradient(front - W * 0.3, 0, front + W * 0.05, 0);
      if (covering) { grd.addColorStop(0, 'rgba(236,242,255,1)'); grd.addColorStop(1, 'rgba(236,242,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, front + W * 0.05, H); }
      else { grd.addColorStop(0, 'rgba(236,242,255,0)'); grd.addColorStop(1, 'rgba(236,242,255,1)'); g.fillStyle = grd; g.fillRect(front - W * 0.3, 0, W * 2, H); }
      g.fillStyle = 'rgba(255,255,255,0.9)';
      for (const f of this.flakes) {
        const x = (f.x * W + front * f.s * 0.3) % W;
        const y = (f.y * H + a.t * 60 * f.s) % H;
        const near = Math.abs(x - front);
        if (near > W * 0.25) continue;
        g.globalAlpha = 1 - near / (W * 0.25);
        g.beginPath(); g.arc(x, y, f.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    if (k >= 1) { const r = a.resolve; this.active = null; g.clearRect(0, 0, W, H); r && r(); }
  }
}
