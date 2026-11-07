/**
 * Synth voices. Each one-shot builds a small node graph, schedules its
 * envelope, and stops itself so nodes are garbage collected.
 */
function out(ctx, dest, send, sendAmt, pan) {
  const g = ctx.createGain();
  let node = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    node = p;
  }
  node.connect(dest);
  if (send && sendAmt) {
    const s = ctx.createGain();
    s.gain.value = sendAmt;
    node.connect(s).connect(send);
  }
  return g;
}

/** Glassy FM bell with a long tail. */
export function bell(eng, dest, t, freq, vel = 0.6, opts = {}) {
  const c = eng.ctx;
  const dur = opts.dur || 4.5;
  const amp = out(c, dest, opts.send, opts.sendAmt ?? 0.6, opts.pan ?? (Math.random() - 0.5) * 0.5);
  const car = c.createOscillator();
  car.frequency.value = freq;
  const mod = c.createOscillator();
  mod.frequency.value = freq * (opts.ratio || 3.5);
  const mg = c.createGain();
  mg.gain.setValueAtTime(freq * 2.2 * vel, t);
  mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + dur * 0.4);
  mod.connect(mg).connect(car.frequency);
  const p2 = c.createOscillator();
  p2.frequency.value = freq * 2.76;
  const p2g = c.createGain();
  p2g.gain.setValueAtTime(0.18 * vel, t);
  p2g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  p2.connect(p2g).connect(amp);
  car.connect(amp);
  const peak = 0.16 * vel * (opts.gain || 1);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.5);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const o of [car, mod, p2]) { o.start(t); o.stop(t + dur + 0.1); }
}

/** Soft felt piano: detuned triangles through a closing low-pass. */
export function piano(eng, dest, t, freq, vel = 0.6, opts = {}) {
  const c = eng.ctx;
  const dur = opts.dur || 3.2;
  const amp = out(c, dest, opts.send, opts.sendAmt ?? 0.5, opts.pan ?? (Math.random() - 0.5) * 0.4);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.4;
  lp.frequency.setValueAtTime(Math.min(9000, freq * 9 * (0.6 + vel)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), t + dur * 0.6);
  lp.connect(amp);
  const oscs = [];
  for (const [mult, det, g] of [[1, -4, 0.5], [1, 5, 0.5], [2, 0, 0.18], [3, 2, 0.06]]) {
    const o = c.createOscillator();
    o.type = mult === 1 ? 'triangle' : 'sine';
    o.frequency.value = freq * mult;
    o.detune.value = det;
    const og = c.createGain();
    og.gain.value = g;
    o.connect(og).connect(lp);
    oscs.push(o);
  }
  const peak = 0.2 * vel * (opts.gain || 1);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.35);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.1); }
}

/** Short plucked string for the camp arpeggio. */
export function pluck(eng, dest, t, freq, vel = 0.5, opts = {}) {
  const c = eng.ctx;
  const amp = out(c, dest, opts.send, opts.sendAmt ?? 0.4, opts.pan ?? (Math.random() - 0.5) * 0.6);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.2, t + 0.6);
  lp.connect(amp);
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const o2 = c.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = freq * 1.003;
  o.connect(lp); o2.connect(lp);
  const peak = 0.07 * vel;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
  o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
}

/** Heartbeat: a low "lub" then a softer "dub". */
export function heartbeat(eng, dest, t, vel = 0.6) {
  const c = eng.ctx;
  for (const [dt, v, f] of [[0, 1, 62], [0.24, 0.6, 52]]) {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f, t + dt);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + dt + 0.16);
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 180;
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.55 * vel * v, t + dt + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.22);
    o.connect(lp).connect(g).connect(dest);
    o.start(t + dt); o.stop(t + dt + 0.3);
  }
}

/** Long swelling note: detuned saws through a slowly opening filter. */
export function swell(eng, dest, t, freq, dur, vel = 0.5, opts = {}) {
  const c = eng.ctx;
  const amp = out(c, dest, opts.send, opts.sendAmt ?? 0.7, opts.pan || 0);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = opts.q || 1.2;
  lp.frequency.setValueAtTime(freq * 1.5, t);
  lp.frequency.linearRampToValueAtTime(freq * (opts.open || 5), t + dur * 0.7);
  lp.connect(amp);
  const oscs = [];
  for (const det of [-9, 0, 8]) {
    const o = c.createOscillator();
    o.type = opts.type || 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = det;
    o.connect(lp);
    oscs.push(o);
  }
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(0.06 * vel, t + dur * 0.6);
  amp.gain.linearRampToValueAtTime(0.0001, t + dur);
  for (const o of oscs) { o.start(t); o.stop(t + dur + 0.05); }
}

/** Persistent pad voice used by the drone and warmth stems. */
export class PadVoice {
  constructor(eng, dest, opts = {}) {
    const c = eng.ctx;
    this.c = c;
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = opts.cutoff || 600;
    this.filter.Q.value = opts.q || 0.8;
    this.gain = c.createGain();
    this.gain.gain.value = 0;
    this.filter.connect(this.gain).connect(dest);
    this.oscs = [];
    const types = opts.types || ['sawtooth', 'sawtooth', 'triangle'];
    const dets = opts.detune || [-7, 7, 0];
    types.forEach((type, i) => {
      const o = c.createOscillator();
      o.type = type;
      o.detune.value = dets[i] || 0;
      const g = c.createGain();
      g.gain.value = type === 'triangle' ? 0.5 : 0.28;
      o.connect(g).connect(this.filter);
      o.start();
      this.oscs.push(o);
    });
    // slow filter breathing
    this.lfo = c.createOscillator();
    this.lfo.frequency.value = opts.lfoRate || 0.05 + Math.random() * 0.04;
    this.lfoGain = c.createGain();
    this.lfoGain.gain.value = opts.lfoDepth || 180;
    this.lfo.connect(this.lfoGain).connect(this.filter.frequency);
    this.lfo.start();
  }
  setFreq(f, t, glide = 1.5) { for (const o of this.oscs) o.frequency.setTargetAtTime(f, t, glide / 3); }
  setLevel(v, t, tc = 1) { this.gain.gain.setTargetAtTime(v, t, tc); }
  setCutoff(f, t, tc = 2) { this.filter.frequency.setTargetAtTime(f, t, tc); this.lfoGain.gain.setTargetAtTime(f * 0.3, t, tc); }
}
