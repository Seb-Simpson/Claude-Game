import { bell, piano, swell, heartbeat } from './instruments.js';
import { degreeToMidi, midiToFreq } from './theory.js';

/** Short scored one-shots, always pitched in the score's current key. */
export function playStinger(eng, score, name) {
  if (!eng.ready || !score.built) return;
  const t = eng.now + 0.02;
  const out = eng.bus.music;
  const send = score.send;
  const root = score.root, mode = score.effectiveMode();
  const f = (deg, oct = 0) => midiToFreq(degreeToMidi(root + oct * 12, mode, deg));
  switch (name) {
    case 'fall':
      piano(eng, out, t, f(0, -2), 0.9, { send, dur: 4 });
      piano(eng, out, t, f(1, -2), 0.7, { send, dur: 4 });
      piano(eng, out, t + 0.05, f(4, -1), 0.5, { send, dur: 3 });
      swell(eng, out, t, f(0, -2), 2.5, 0.9, { send, open: 2.5 });
      break;
    case 'summit':
      [0, 4, 7, 9, 11, 14].forEach((d, i) => bell(eng, out, t + i * 0.32, f(d, 0), 0.75, { send, dur: 7, sendAmt: 1 }));
      [0, 2, 4].forEach((d) => swell(eng, out, t, f(d, -1), 9, 0.9, { send, type: 'triangle', open: 6 }));
      piano(eng, out, t + 2.2, f(0, -1), 0.7, { send, dur: 6 });
      break;
    case 'anchor':
      bell(eng, out, t, f(4, 1), 0.45, { send, dur: 3, ratio: 2.4 });
      bell(eng, out, t + 0.18, f(7, 1), 0.35, { send, dur: 3.5, ratio: 2.4 });
      break;
    case 'rope':
      swell(eng, out, t, f(0, -2), 1.6, 0.8, { send, q: 6, open: 6 });
      swell(eng, out, t, f(1, -2), 1.6, 0.5, { send, q: 6, open: 4 });
      break;
    case 'nearmiss':
      for (let i = 0; i < 6; i++) bell(eng, out, t + i * 0.07, f(i % 2 ? 6 : 4, 2), 0.35 * (1 - i / 7), { send, dur: 1.5 });
      heartbeat(eng, out, t, 0.8);
      break;
    case 'camp':
      [0, 2, 4, 7].forEach((d, i) => piano(eng, out, t + i * 0.12, f(d, 0), 0.5, { send, dur: 5 }));
      break;
    case 'forecast':
      bell(eng, out, t, f(0, -1), 0.5, { send, dur: 4, ratio: 1.4 });
      bell(eng, out, t + 0.7, f(1, -1), 0.45, { send, dur: 4, ratio: 1.4 });
      break;
    case 'retreat':
      [4, 2, 0].forEach((d, i) => piano(eng, out, t + i * 0.5, f(d, 0), 0.5, { send, dur: 5 }));
      break;
    case 'death':
      swell(eng, out, t, f(0, -2), 7, 1, { send, open: 2 });
      piano(eng, out, t + 0.8, f(0, -1), 0.4, { send, dur: 6 });
      piano(eng, out, t + 1.6, f(1, -1), 0.3, { send, dur: 6 });
      break;
  }
}
