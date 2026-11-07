/**
 * Web Audio graph: master -> compressor -> out, with music / ambience / sfx / ui
 * buses. A single procedurally generated convolution reverb is shared through
 * per-bus sends. The context is created on the first user gesture.
 */
export const BUSES = ['music', 'ambience', 'sfx', 'ui'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volumes = { master: 0.8, music: 0.7, ambience: 0.7, sfx: 0.8, ui: 0.6 };
    this.bus = {};
    this.send = {};
    this.onCaption = null;
    this.muted = false;
    this.listeners = [];
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { return false; }
      this.build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.ready) {
      this.ready = true;
      for (const f of this.listeners) f();
      this.listeners.length = 0;
    }
    return true;
  }
  whenReady(fn) { if (this.ready) fn(); else this.listeners.push(fn); }

  build() {
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volumes.master;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5;
    comp.attack.value = 0.01; comp.release.value = 0.35;
    // a gentle high shelf keeps everything a little cold and airy
    const shelf = c.createBiquadFilter();
    shelf.type = 'highshelf'; shelf.frequency.value = 6000; shelf.gain.value = -2;
    this.master.connect(shelf).connect(comp).connect(c.destination);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(4.6, 2.4);
    this.reverbOut = c.createGain();
    this.reverbOut.gain.value = 0.9;
    this.reverb.connect(this.reverbOut).connect(this.master);

    const sends = { music: 0.55, ambience: 0.15, sfx: 0.22, ui: 0.18 };
    for (const b of BUSES) {
      const g = c.createGain();
      g.gain.value = this.volumes[b];
      g.connect(this.master);
      const s = c.createGain();
      s.gain.value = sends[b];
      g.connect(s).connect(this.reverb);
      this.bus[b] = g;
      this.send[b] = s;
    }
    this.noise = this.makeNoise('white', 3);
    this.pink = this.makeNoise('pink', 4);
    this.brown = this.makeNoise('brown', 4);
  }

  /** Cold, cavernous stereo impulse: pre-delay, sparse early reflections, a darkening tail. */
  makeImpulse(seconds, decay) {
    const c = this.ctx, rate = c.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = c.createBuffer(2, len, rate);
    const pre = Math.floor(0.028 * rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      let seed = ch ? 1337 : 4242;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
      for (let i = 0; i < 9; i++) {
        const at = pre + Math.floor((0.008 + Math.abs(rnd()) * 0.09) * rate);
        d[at] += rnd() * 0.6 * (1 - i / 10);
      }
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / rate;
        const env = Math.pow(1 - (i - pre) / (len - pre), decay) * Math.exp(-t * 0.6);
        // cutoff falls over time: coefficient approaches 1 = darker
        const k = 0.55 + Math.min(0.42, t * 0.16);
        lp = lp * k + rnd() * (1 - k);
        d[i] += lp * env * 2.6;
      }
    }
    return buf;
  }

  makeNoise(kind, seconds) {
    const c = this.ctx, len = Math.floor(seconds * c.sampleRate);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // crossfade the loop point to avoid a click
    const f = Math.floor(c.sampleRate * 0.05);
    for (let i = 0; i < f; i++) { const t = i / f; d[len - f + i] = d[len - f + i] * (1 - t) + d[i] * t; }
    return buf;
  }

  noiseSource(kind = 'white', loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = kind === 'pink' ? this.pink : kind === 'brown' ? this.brown : this.noise;
    s.loop = loop;
    s.loopStart = 0.05;
    s.loopEnd = s.buffer.duration;
    return s;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setVolume(name, v) {
    this.volumes[name] = v;
    if (!this.ctx) return;
    const node = name === 'master' ? this.master : this.bus[name];
    if (node) node.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  /** Soften everything (pause menu, focus loss). */
  setDucked(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(on ? this.volumes.master * 0.35 : this.volumes.master, t, 0.4);
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }
  caption(text, kind) { if (this.onCaption) this.onCaption(text, kind); }
}
