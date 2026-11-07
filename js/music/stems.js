import { PadVoice, bell, piano, pluck, heartbeat, swell } from './instruments.js';
import { midiToFreq, degreeToMidi, chordDegrees } from './theory.js';
import { generatePhrase } from './phrase.js';

/** Drone bed: four pad voices voicing the current chord, brightening with altitude. */
export class DroneStem {
  constructor(eng, dest) {
    const c = eng.ctx;
    this.eng = eng;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.voices = [
      new PadVoice(eng, this.out, { cutoff: 400, types: ['sawtooth', 'sawtooth', 'triangle'], detune: [-8, 6, 0] }),
      new PadVoice(eng, this.out, { cutoff: 500, types: ['sawtooth', 'triangle'], detune: [-5, 4] }),
      new PadVoice(eng, this.out, { cutoff: 600, types: ['triangle', 'sawtooth'], detune: [3, -6] }),
      new PadVoice(eng, this.out, { cutoff: 900, types: ['triangle', 'sine'], detune: [-3, 3], lfoRate: 0.07 }),
    ];
    this.levels = [0.5, 0.36, 0.3, 0];
    this.voices.forEach((v, i) => v.setLevel(this.levels[i], c.currentTime, 2));
  }
  setChord(root, mode, degree, t, tension, major) {
    const colour = tension > 0.5 ? 'sus2' : 'add9';
    const deg = chordDegrees(degree, colour);
    const notes = [
      degreeToMidi(root - 12, mode, deg[0]),
      degreeToMidi(root - 12, mode, deg[2]),
      degreeToMidi(root, mode, major ? deg[1] : deg[3] ?? deg[1]),
      degreeToMidi(root + 12, mode, deg[0] + (major ? 4 : 0)),
    ];
    this.voices.forEach((v, i) => v.setFreq(midiToFreq(notes[i]), t, 3));
  }
  set(level, brightness, upper, t) {
    this.out.gain.setTargetAtTime(level * 0.55, t, 1.5);
    const cut = 260 + brightness * brightness * 2600;
    this.voices.forEach((v, i) => v.setCutoff(cut * (1 + i * 0.25), t, 2.5));
    this.voices[3].setLevel(upper * 0.42, t, 3);
  }
}

/** Sparse melody: seeded phrases on bell or piano, with long reverb tails. */
export class MelodyStem {
  constructor(eng, dest, send) {
    this.eng = eng;
    this.out = eng.ctx.createGain();
    this.out.gain.value = 0.8;
    this.out.connect(dest);
    this.send = send;
    this.queue = [];
    this.memory = null;
    this.nextTime = 0;
    this.level = 0;
    this.instrument = 'bell';
  }
  reset(t) { this.queue = []; this.nextTime = t + 1.5; }
  tick(now, ahead, beat, ctx) {
    // ctx: { rng, root, mode, chordDeg, density, upper, level }
    if (this.nextTime < now - 1) this.nextTime = now + 0.5;
    while (this.nextTime < now + ahead) {
      if (!this.queue.length) {
        const rest = ctx.density > 0.6 ? ctx.rng.pick([0, 1, 2]) : ctx.rng.pick([2, 3, 4, 6]);
        this.nextTime += rest * beat;
        const phrase = generatePhrase(ctx.rng, { chordRoot: ctx.chordDeg, density: ctx.density, centre: 7 + Math.round(ctx.upper * 3), span: 5, memory: this.memory, maxBeats: ctx.density > 0.6 ? 8 : 6 });
        this.memory = phrase;
        this.queue = phrase.slice();
        this.instrument = ctx.rng.chance(0.55) ? 'bell' : 'piano';
        continue;
      }
      const n = this.queue.shift();
      const t = this.nextTime;
      this.nextTime += n.dur * beat;
      if (n.deg === null || ctx.level < 0.03) continue;
      const midi = degreeToMidi(ctx.root, ctx.mode, n.deg);
      const vel = n.vel * Math.min(1, ctx.level * 1.4);
      const f = midiToFreq(midi);
      if (this.instrument === 'bell') bell(this.eng, this.out, t, f, vel, { send: this.send, sendAmt: 0.8, dur: 5 });
      else piano(this.eng, this.out, t, f / 2, vel, { send: this.send, sendAmt: 0.6, dur: 3.5 });
      // a faint octave echo when the arrangement opens up
      if (ctx.density > 0.65 && ctx.rng.chance(0.35)) bell(this.eng, this.out, t + beat * 0.5, f * 2, vel * 0.35, { send: this.send, sendAmt: 1, dur: 3 });
    }
  }
}

/** Heartbeat pulse that fades in as stamina drops. */
export class PulseStem {
  constructor(eng, dest) {
    this.eng = eng;
    this.out = eng.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.next = 0;
  }
  tick(now, level, bpm) {
    this.out.gain.setTargetAtTime(level, now, 0.8);
    if (level < 0.03) { this.next = now + 0.2; return; }
    if (this.next < now) this.next = now + 0.05;
    while (this.next < now + 0.2) {
      heartbeat(this.eng, this.out, this.next, 0.9);
      this.next += 60 / bpm;
    }
  }
}

/** Storm: band-passed noise sweeps and a sub rumble. */
export class StormStem {
  constructor(eng, dest) {
    const c = eng.ctx;
    this.eng = eng;
    this.out = c.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    const src = eng.noiseSource('pink');
    this.bp = c.createBiquadFilter();
    this.bp.type = 'bandpass';
    this.bp.frequency.value = 500;
    this.bp.Q.value = 1.4;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = c.createGain();
    lg.gain.value = 260;
    lfo.connect(lg).connect(this.bp.frequency);
    const ng = c.createGain();
    ng.gain.value = 0.55;
    src.connect(this.bp).connect(ng).connect(this.out);
    const sub = c.createOscillator();
    sub.frequency.value = 41;
    const subg = c.createGain();
    subg.gain.value = 0.18;
    const am = c.createOscillator();
    am.frequency.value = 0.13;
    const amg = c.createGain();
    amg.gain.value = 0.12;
    am.connect(amg).connect(subg.gain);
    sub.connect(subg).connect(this.out);
    src.start(); lfo.start(); sub.start(); am.start();
    this.nextSwell = 0;
  }
  tick(now, level, root, ctx) {
    this.out.gain.setTargetAtTime(level * 0.5, now, 1.5);
    this.bp.frequency.setTargetAtTime(380 + level * 700, now, 2);
    // low shifting textures: dissonant swells a minor second apart
    if (level > 0.35 && now > this.nextSwell) {
      const f = midiToFreq(root - 24 + (ctx.rng.chance(0.5) ? 1 : 0));
      swell(this.eng, this.out, now + 0.1, f, 6, level, { send: ctx.send, sendAmt: 0.5, open: 3 });
      this.nextSwell = now + 7 + ctx.rng.next() * 5;
    }
  }
}

/** Camp warmth: a soft major-coloured pad and a plucked arpeggio. */
export class WarmthStem {
  constructor(eng, dest, send) {
    this.eng = eng;
    this.send = send;
    this.out = eng.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.pads = [
      new PadVoice(eng, this.out, { cutoff: 700, types: ['triangle', 'triangle'], detune: [-4, 4], lfoRate: 0.11, lfoDepth: 120 }),
      new PadVoice(eng, this.out, { cutoff: 800, types: ['triangle', 'sine'], detune: [3, -3], lfoRate: 0.08, lfoDepth: 120 }),
    ];
    this.pads.forEach((p) => p.setLevel(0.35, eng.ctx.currentTime, 1));
    this.next = 0;
    this.step = 0;
  }
  setChord(root, mode, degree, t) {
    this.pads[0].setFreq(midiToFreq(degreeToMidi(root, 'ionian', degree + 2)), t, 2);
    this.pads[1].setFreq(midiToFreq(degreeToMidi(root, 'ionian', degree + 5)), t, 2);
    this.chord = { root, degree };
  }
  tick(now, level, beat) {
    this.out.gain.setTargetAtTime(level * 0.5, now, 1.2);
    if (level < 0.15 || !this.chord) { this.next = now + 0.2; return; }
    if (this.next < now) this.next = now + 0.05;
    const pattern = [0, 2, 4, 7, 9, 7, 4, 2];
    while (this.next < now + 0.25) {
      const deg = this.chord.degree + pattern[this.step % pattern.length];
      pluck(this.eng, this.out, this.next, midiToFreq(degreeToMidi(this.chord.root, 'ionian', deg)), 0.6 * level, { send: this.send });
      this.step++;
      this.next += beat / 2;
    }
  }
}
