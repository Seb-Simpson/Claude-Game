import { clamp } from '../engine/math.js';

/**
 * Continuous soundscape: three wind bands and a resonant howl that follow wind,
 * gusts and altitude, plus a campfire crackle bed.
 */
export class Ambience {
  constructor(eng) {
    this.eng = eng;
    this.built = false;
  }
  build() {
    const e = this.eng, c = e.ctx;
    const dest = e.bus.ambience;
    const band = (kind, type, freq, q) => {
      const src = e.noiseSource(kind);
      const f = c.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      let node = g;
      if (c.createStereoPanner) { const p = c.createStereoPanner(); g.connect(p); node = p; this.pans.push(p); }
      node.connect(dest);
      src.connect(f).connect(g);
      src.start(0, Math.random() * 2);
      return { f, g };
    };
    this.pans = [];
    this.low = band('brown', 'lowpass', 220, 0.5);
    this.mid = band('pink', 'bandpass', 650, 0.7);
    this.high = band('white', 'bandpass', 3200, 0.6);
    this.howl = band('pink', 'bandpass', 520, 9);
    // fire
    this.fire = c.createGain();
    this.fire.gain.value = 0;
    this.fire.connect(dest);
    const fsrc = e.noiseSource('brown');
    const flp = c.createBiquadFilter();
    flp.type = 'lowpass'; flp.frequency.value = 500;
    const fg = c.createGain(); fg.gain.value = 0.5;
    fsrc.connect(flp).connect(fg).connect(this.fire);
    fsrc.start();
    this.nextCrackle = 0;
    this.built = true;
  }
  /** wind: 0..1, gust: 0..1, alt: 0..1, shelter: 0..1, fire: 0..1 */
  update(s, time) {
    if (!this.eng.ready) return;
    if (!this.built) this.build();
    const t = this.eng.now;
    const wind = clamp(s.wind), gust = clamp(s.gust), alt = clamp(s.alt);
    const shel = 1 - clamp(s.shelter) * 0.6;
    const w = clamp(0.18 + wind * 0.65 + gust * 0.4) * shel;
    this.low.g.gain.setTargetAtTime(0.32 * w + 0.05, t, 0.6);
    this.mid.g.gain.setTargetAtTime(0.2 * w * (0.6 + alt * 0.5), t, 0.5);
    this.mid.f.frequency.setTargetAtTime(500 + wind * 500 + gust * 600, t, 0.7);
    this.high.g.gain.setTargetAtTime(0.06 * w * (0.4 + alt + s.snow * 0.6), t, 0.4);
    this.howl.g.gain.setTargetAtTime(0.16 * clamp(wind * 0.6 + gust * 1.2 - 0.25) * shel, t, 0.5);
    this.howl.f.frequency.setTargetAtTime(380 + gust * 520 + Math.sin(time * 0.3) * 80 + alt * 160, t, 0.4);
    if (this.pans.length) {
      const p = clamp(s.windDir || 0, -1, 1) * 0.5;
      this.pans.forEach((pn, i) => pn.pan.setTargetAtTime(p * (i % 2 ? -0.6 : 1), t, 1));
    }
    const fire = clamp(s.fire);
    this.fire.gain.setTargetAtTime(fire * 0.22, t, 0.8);
    if (fire > 0.05 && t > this.nextCrackle) {
      this.crackle(t, fire);
      this.nextCrackle = t + 0.04 + Math.random() * 0.25;
    }
  }
  crackle(t, amt) {
    const e = this.eng, c = e.ctx;
    const src = e.noiseSource('white', false);
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass'; hp.frequency.value = 1500 + Math.random() * 3000; hp.Q.value = 2;
    const g = c.createGain();
    const v = 0.25 * amt * Math.random();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(hp).connect(g).connect(e.bus.ambience);
    src.start(t, Math.random() * 2, 0.05);
  }
}
