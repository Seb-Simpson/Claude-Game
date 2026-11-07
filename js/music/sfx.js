/**
 * Procedural sound effects. Each call builds a short-lived node graph.
 * Captions are emitted for cues a player might need to hear.
 */
export class Sfx {
  constructor(eng) { this.eng = eng; this.lastCaption = {}; }
  get ok() { return this.eng.ready; }

  cap(text, key = text, gap = 2.5) {
    const now = performance.now() / 1000;
    if ((this.lastCaption[key] || 0) + gap > now) return;
    this.lastCaption[key] = now;
    this.eng.caption(text);
  }

  noiseHit(t, { dur = 0.05, type = 'bandpass', freq = 2000, q = 1, gain = 0.3, bus = 'sfx', pan = 0, kind = 'white', sweepTo }) {
    const e = this.eng, c = e.ctx;
    const src = e.noiseSource(kind, false);
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(e.bus[bus]);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 2, dur + 0.05);
  }
  tone(t, { freq = 440, to, dur = 0.2, type = 'sine', gain = 0.2, bus = 'sfx', attack = 0.004, pan = 0 }) {
    const e = this.eng, c = e.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    o.connect(g);
    node.connect(e.bus[bus]);
    o.start(t); o.stop(t + dur + 0.05);
  }

  footstep(surface = 'rock', vol = 1) {
    if (!this.ok) return;
    const t = this.eng.now;
    const pan = (Math.random() - 0.5) * 0.2;
    if (surface === 'snow') {
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.noiseHit(t + i * 0.018 + Math.random() * 0.01, { dur: 0.04, freq: 1400 + Math.random() * 1800, q: 1.4, gain: 0.12 * vol, pan });
      this.noiseHit(t, { dur: 0.12, type: 'lowpass', freq: 400, gain: 0.18 * vol, kind: 'brown', pan });
    } else if (surface === 'ice') {
      this.noiseHit(t, { dur: 0.03, freq: 4000, q: 2, gain: 0.12 * vol, pan });
      this.tone(t, { freq: 2600 + Math.random() * 600, dur: 0.08, gain: 0.03 * vol, pan });
    } else {
      this.noiseHit(t, { dur: 0.025, freq: 2600, q: 1.2, gain: 0.1 * vol, pan });
      this.noiseHit(t, { dur: 0.07, type: 'lowpass', freq: 300, gain: 0.16 * vol, kind: 'brown', pan });
    }
  }
  grab(surface = 'rock') {
    if (!this.ok) return;
    const t = this.eng.now;
    if (surface === 'ice' || surface === 'thin') {
      this.noiseHit(t, { dur: 0.05, freq: 3600, q: 1.5, gain: 0.14 });
      this.tone(t, { freq: 1800 + Math.random() * 400, dur: 0.14, gain: 0.04, type: 'triangle' });
    } else {
      this.noiseHit(t, { dur: 0.06, freq: 900, q: 0.8, gain: 0.12, kind: 'pink' });
      this.noiseHit(t + 0.02, { dur: 0.04, freq: 2600, q: 2, gain: 0.05 });
    }
  }
  /** Ice-axe / pick strike: noisy transient plus inharmonic metallic ring. */
  pick(surface = 'rock') {
    if (!this.ok) return;
    const t = this.eng.now;
    this.noiseHit(t, { dur: 0.04, type: 'highpass', freq: 2500, gain: 0.25 });
    for (const [f, g] of [[1830, 0.06], [2710, 0.04], [4150, 0.025]]) this.tone(t, { freq: f * (0.97 + Math.random() * 0.06), dur: 0.25, gain: g, type: 'sine' });
    if (surface === 'ice') this.noiseHit(t + 0.01, { dur: 0.18, freq: 5000, q: 0.8, gain: 0.08 });
  }
  /** Piton hammer blow: pitch rises as the piton seats. */
  piton(strike) {
    if (!this.ok) return;
    const t = this.eng.now;
    const base = 1500 * (1 + strike * 0.14);
    this.noiseHit(t, { dur: 0.03, type: 'highpass', freq: 3000, gain: 0.3 });
    for (const [m, g] of [[1, 0.1], [2.41, 0.05], [3.93, 0.03]]) this.tone(t, { freq: base * m, dur: 0.35 + strike * 0.1, gain: g });
    if (strike === 0) this.cap('[piton rings into rock]', 'piton');
  }
  clip() {
    if (!this.ok) return;
    const t = this.eng.now;
    this.tone(t, { freq: 3200, dur: 0.04, gain: 0.06, type: 'square' });
    this.tone(t + 0.05, { freq: 2400, dur: 0.05, gain: 0.05, type: 'square' });
  }
  ropeCreak(amount = 0.6) {
    if (!this.ok) return;
    const e = this.eng, c = e.ctx, t = e.now;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90 + Math.random() * 40, t);
    o.frequency.linearRampToValueAtTime(70 + Math.random() * 60, t + 0.35);
    const jitter = c.createOscillator();
    jitter.frequency.value = 28 + Math.random() * 20;
    const jg = c.createGain(); jg.gain.value = 30;
    jitter.connect(jg).connect(o.frequency);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * amount, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(bp).connect(g).connect(e.bus.sfx);
    o.start(t); jitter.start(t); o.stop(t + 0.45); jitter.stop(t + 0.45);
    this.cap('[rope creaks]', 'rope', 5);
  }
  /** Breath: intensity 0..1, exhale is longer and lower. */
  breath(intensity, exhale) {
    if (!this.ok) return;
    const t = this.eng.now;
    const dur = exhale ? 0.7 - intensity * 0.25 : 0.45 - intensity * 0.15;
    this.noiseHit(t, { dur, freq: exhale ? 700 + intensity * 400 : 1100 + intensity * 500, q: 0.9, gain: 0.05 + intensity * 0.09, kind: 'pink', bus: 'sfx', sweepTo: exhale ? 500 : 1500 });
    if (intensity > 0.75) this.cap('[ragged breathing]', 'breath', 8);
  }
  whoosh(len = 0.8) {
    if (!this.ok) return;
    const t = this.eng.now;
    this.noiseHit(t, { dur: len, freq: 300, q: 0.7, gain: 0.25, kind: 'pink', sweepTo: 1800 });
  }
  impact(strength = 0.5, surface = 'rock') {
    if (!this.ok) return;
    const t = this.eng.now;
    this.tone(t, { freq: 90, to: 38, dur: 0.35, gain: 0.35 * strength + 0.1 });
    this.noiseHit(t, { dur: 0.25, type: 'lowpass', freq: 900, gain: 0.3 * strength + 0.1, kind: 'brown' });
    if (surface === 'snow') this.noiseHit(t, { dur: 0.3, freq: 1800, q: 0.6, gain: 0.1 + strength * 0.1 });
    else for (let i = 0; i < 4; i++) this.noiseHit(t + 0.03 + i * 0.04 * Math.random(), { dur: 0.03, freq: 2400, q: 2, gain: 0.08 });
    if (strength > 0.4) this.cap('[heavy impact]', 'impact', 1);
  }
  iceCrack(level = 0.5) {
    if (!this.ok) return;
    const t = this.eng.now;
    const n = 2 + Math.floor(level * 5);
    for (let i = 0; i < n; i++) this.noiseHit(t + i * (0.015 + Math.random() * 0.03), { dur: 0.02, type: 'highpass', freq: 2500 + Math.random() * 3000, gain: 0.12 + level * 0.1 });
    this.tone(t, { freq: 3800 + Math.random() * 800, to: 2200, dur: 0.12, gain: 0.03 + level * 0.03 });
    this.cap(level > 0.8 ? '[ice shatters]' : '[ice cracks]', 'ice', 1.5);
  }
  snowCreak(level) {
    if (!this.ok) return;
    const t = this.eng.now;
    this.noiseHit(t, { dur: 0.18, freq: 700, q: 3, gain: 0.08 + level * 0.12, kind: 'pink', sweepTo: 400 });
    this.cap('[snow bridge groans]', 'creak', 3);
  }
  pebbles() {
    if (!this.ok) return;
    const t = this.eng.now;
    for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.06 + Math.random() * 0.05, { dur: 0.025, freq: 1800 + Math.random() * 2500, q: 3, gain: 0.07 + Math.random() * 0.05, pan: (Math.random() - 0.5) * 0.6 });
    this.cap('[stones clatter above]', 'rock', 2);
  }
  rockCrash() {
    if (!this.ok) return;
    const t = this.eng.now;
    this.tone(t, { freq: 70, to: 40, dur: 0.4, gain: 0.25 });
    for (let i = 0; i < 6; i++) this.noiseHit(t + i * 0.05, { dur: 0.05, freq: 1500 + Math.random() * 1500, q: 1.5, gain: 0.12 });
  }
  rumble(len = 3, gain = 0.4, caption = '[distant rumble]') {
    if (!this.ok) return;
    const e = this.eng, c = e.ctx, t = e.now;
    const src = e.noiseSource('brown', false);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 140;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + len * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    src.connect(lp).connect(g).connect(e.bus.ambience);
    src.start(t, Math.random(), len + 0.1);
    if (caption) this.cap(caption, 'rumble', 4);
  }
  oxygen() {
    if (!this.ok) return;
    const t = this.eng.now;
    this.tone(t, { freq: 1400, dur: 0.03, gain: 0.08, type: 'square' });
    this.noiseHit(t + 0.05, { dur: 0.9, type: 'highpass', freq: 3500, gain: 0.08 });
    this.cap('[oxygen hisses]', 'oxy', 2);
  }
  eat() {
    if (!this.ok) return;
    const t = this.eng.now;
    for (let i = 0; i < 5; i++) this.noiseHit(t + i * 0.07, { dur: 0.05, freq: 3000 + Math.random() * 2000, q: 0.8, gain: 0.05 });
  }
  bird() {
    if (!this.ok) return;
    const t = this.eng.now;
    const pan = (Math.random() - 0.5) * 1.4;
    for (let i = 0; i < 3; i++) this.tone(t + i * 0.16, { freq: 2600 + Math.random() * 600, to: 3600, dur: 0.09, gain: 0.018, pan, bus: 'ambience' });
    this.cap('[distant birds]', 'bird', 10);
  }
  forecast() { this.cap('[the wind changes pitch]', 'fc', 5); }
  ui(kind = 'move') {
    if (!this.ok) return;
    const t = this.eng.now;
    if (kind === 'move') this.tone(t, { freq: 1320, dur: 0.05, gain: 0.04, type: 'triangle', bus: 'ui' });
    else if (kind === 'select') { this.tone(t, { freq: 880, dur: 0.12, gain: 0.07, type: 'triangle', bus: 'ui' }); this.tone(t + 0.06, { freq: 1320, dur: 0.18, gain: 0.05, type: 'sine', bus: 'ui' }); }
    else if (kind === 'back') this.tone(t, { freq: 990, to: 660, dur: 0.12, gain: 0.06, type: 'triangle', bus: 'ui' });
    else if (kind === 'toggle') this.tone(t, { freq: 1760, dur: 0.04, gain: 0.04, type: 'sine', bus: 'ui' });
  }
}
