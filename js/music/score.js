import { DroneStem, MelodyStem, PulseStem, StormStem, WarmthStem } from './stems.js';
import { computeMix } from './mixer.js';
import { PROGRESSIONS } from './theory.js';
import { createRng } from '../engine/rng.js';

/**
 * The adaptive score. Owns the stems, a slow harmonic clock and a lookahead
 * scheduler that runs from the game loop. Levels are smoothed in the audio
 * graph so changes never click.
 */
export class Score {
  constructor(eng) {
    this.eng = eng;
    this.built = false;
    this.baseRoot = 50;
    this.root = 50;
    this.mode = 'dorian';
    this.mix = computeMix({ scene: 'title' });
    this.rng = createRng('score');
    this.beat = 60 / 56;
  }
  build() {
    const e = this.eng;
    const music = e.bus.music;
    this.send = e.ctx.createGain();
    this.send.gain.value = 1;
    this.send.connect(e.reverb);
    this.drone = new DroneStem(e, music);
    this.melody = new MelodyStem(e, music, this.send);
    this.pulse = new PulseStem(e, music);
    this.storm = new StormStem(e, music);
    this.warmth = new WarmthStem(e, music, this.send);
    this.built = true;
    this.chordIdx = 0;
    this.nextChord = e.now + 0.1;
    this.melody.reset(e.now);
  }
  /** Change the key for a new climb (or the title). */
  setKey(root, mode, seed) {
    this.baseRoot = root;
    this.root = root;
    this.mode = mode;
    this.rng = createRng('score:' + seed);
    const progs = PROGRESSIONS[mode] || PROGRESSIONS.aeolian;
    this.prog = this.rng.pick(progs);
    this.chordIdx = 0;
    if (this.built) { this.nextChord = this.eng.now + 0.05; this.melody.reset(this.eng.now); }
  }
  /** Rise a whole step at each camp: the music climbs with you. */
  setLift(steps) { this.root = this.baseRoot + Math.min(steps, 3) * 2; }
  get chordDeg() { return this.prog ? this.prog[this.chordIdx % this.prog.length] : 0; }
  effectiveMode() { return this.mix.major ? (this.mode === 'lydian' ? 'lydian' : 'ionian') : this.mode; }

  update(state) {
    if (!this.eng.ready) return;
    if (!this.built) this.build();
    if (!this.prog) this.setKey(this.baseRoot, this.mode, 'title');
    const now = this.eng.now;
    const m = (this.mix = computeMix(state));
    const mode = this.effectiveMode();
    const chordLen = this.beat * (state.scene === 'title' ? 12 : 8);
    if (now >= this.nextChord - 0.05) {
      this.chordIdx++;
      const deg = m.major && this.chordIdx % 4 === 0 ? 0 : this.chordDeg;
      this.drone.setChord(this.root, mode, deg, Math.max(now, this.nextChord), m.tension, m.major);
      this.warmth.setChord(this.root, mode, deg, now);
      this.nextChord = Math.max(now, this.nextChord) + chordLen;
    }
    this.drone.set(m.drone, m.brightness, m.upper, now);
    this.melody.tick(now, 0.3, this.beat, { rng: this.rng, root: this.root, mode, chordDeg: this.chordDeg, density: m.density, upper: m.upper, level: m.melody });
    this.pulse.tick(now, m.pulse, m.tempo);
    this.storm.tick(now, m.storm, this.root, { rng: this.rng, send: this.send });
    this.warmth.tick(now, m.warmth, this.beat);
  }
}
