import { clamp, approach } from '../engine/math.js';
import { createNoise1D } from '../engine/rng.js';

/** Weather state machine with forecasts and telegraphed gusts. */
export const WEATHER = {
  clear: { label: 'Clear', snow: 0.02, wind: 0.12, gust: 0.15, sleet: 0, whiteout: 0, fog: 0.05, cold: 0, severity: 0 },
  breezy: { label: 'Breezy', snow: 0.12, wind: 0.38, gust: 0.4, sleet: 0, whiteout: 0, fog: 0.12, cold: 0.15, severity: 1 },
  snow: { label: 'Snowfall', snow: 0.55, wind: 0.3, gust: 0.3, sleet: 0, whiteout: 0, fog: 0.35, cold: 0.3, severity: 1 },
  heavy: { label: 'Heavy snow', snow: 0.85, wind: 0.5, gust: 0.5, sleet: 0.1, whiteout: 0.08, fog: 0.5, cold: 0.5, severity: 2 },
  storm: { label: 'Storm', snow: 1, wind: 0.85, gust: 0.85, sleet: 0.55, whiteout: 0.15, fog: 0.6, cold: 0.85, severity: 3 },
  whiteout: { label: 'Whiteout', snow: 1, wind: 0.7, gust: 0.6, sleet: 0.2, whiteout: 0.72, fog: 0.9, cold: 0.8, severity: 3 },
};
const KEYS = Object.keys(WEATHER);

export class WeatherSystem {
  constructor(rng, profile, severity = 1, start = 'clear') {
    this.rng = rng;
    this.profile = profile;
    this.severity = severity;
    this.state = start;
    this.next = this.pickNext(0);
    this.timer = 40 + rng.next() * 30;
    this.forecastIssued = false;
    this.v = { ...WEATHER[start] };
    this.noise = createNoise1D('wind:' + rng.next());
    this.t = 0;
    this.gust = 0; this.gustWarn = 0;
    this.gustPhase = 'idle'; this.gustT = 0;
    this.nextGust = 6;
    this.dir = 1;
    this.events = [];
  }
  pickNext(alt) {
    const w = this.profile;
    const entries = KEYS.map((k) => {
      let p = w[k] ?? 1;
      const sev = WEATHER[k].severity;
      if (sev >= 2) p *= this.severity * (0.7 + alt * 0.8);
      if (k === this.state) p *= 0.3; // prefer change
      return [k, p];
    });
    return this.rng.weighted(entries);
  }
  /** Shift the forecast toward calm; used when resting at camp past a storm. */
  skip(seconds, alt) {
    let s = seconds;
    while (s > 0) {
      const step = Math.min(s, this.timer);
      this.timer -= step; s -= step;
      if (this.timer <= 0) { this.state = this.next; this.next = this.pickNext(alt); this.timer = 45 + this.rng.next() * 60; this.forecastIssued = false; }
    }
    Object.assign(this.v, WEATHER[this.state]);
  }
  update(dt, alt) {
    this.t += dt;
    this.events.length = 0;
    this.timer -= dt;
    const lead = 28;
    if (!this.forecastIssued && this.timer < lead) {
      this.forecastIssued = true;
      const a = WEATHER[this.state].severity, b = WEATHER[this.next].severity;
      if (b !== a || b >= 2) this.events.push({ type: 'forecast', state: this.next, label: WEATHER[this.next].label, worse: b > a, eta: Math.round(this.timer) });
    }
    if (this.timer <= 0) {
      const from = this.state;
      this.state = this.next;
      this.next = this.pickNext(alt);
      this.timer = 45 + this.rng.next() * 65 - WEATHER[this.state].severity * 8;
      this.forecastIssued = false;
      this.events.push({ type: 'weatherChange', from, to: this.state, label: WEATHER[this.state].label });
    }
    const target = WEATHER[this.state];
    const sev = this.severity;
    for (const k of ['snow', 'wind', 'sleet', 'whiteout', 'fog', 'cold']) {
      const tv = k === 'snow' || k === 'fog' ? target[k] : clamp(target[k] * (0.6 + sev * 0.4));
      this.v[k] = approach(this.v[k], tv, 0.12, dt);
    }
    // whiteouts breathe in and out rather than holding flat
    this.v.whiteoutNow = this.v.whiteout * (0.65 + 0.35 * Math.sin(this.t * 0.4));
    this.dir = this.noise(this.t * 0.01) > -0.15 ? 1 : -1;
    this.updateGust(dt, target);
  }
  updateGust(dt, target) {
    this.gustT += dt;
    if (this.gustPhase === 'idle') {
      this.gust = approach(this.gust, 0, 1.5, dt);
      this.gustWarn = approach(this.gustWarn, 0, 2, dt);
      this.nextGust -= dt;
      if (this.nextGust <= 0) {
        this.gustPhase = 'warn'; this.gustT = 0;
        this.gustPower = clamp(target.gust * (0.6 + this.rng.next() * 0.6) * (0.7 + this.severity * 0.3));
        if (this.gustPower > 0.3) this.events.push({ type: 'gustWarn', power: this.gustPower });
      }
    } else if (this.gustPhase === 'warn') {
      this.gustWarn = clamp(this.gustT / 1.2) * this.gustPower;
      if (this.gustT > 1.2) { this.gustPhase = 'blow'; this.gustT = 0; }
    } else if (this.gustPhase === 'blow') {
      const k = this.gustT < 0.5 ? this.gustT / 0.5 : this.gustT < 1.4 ? 1 : 1 - (this.gustT - 1.4) / 1;
      this.gust = clamp(k) * this.gustPower;
      if (this.gustT > 2.4) {
        this.gustPhase = 'idle'; this.gustT = 0;
        this.nextGust = (4 + this.rng.next() * 10) * (1.3 - target.gust * 0.6);
      }
    }
  }
  /** Horizontal push on the climber in world px/s^2. */
  get force() { return this.dir * (this.v.wind * 30 + this.gust * 110) * (0.6 + this.severity * 0.4); }
  get windSpeed() { return this.dir * (this.v.wind * 60 + this.gust * 120 + this.gustWarn * 30); }
  get label() { return WEATHER[this.state].label; }
  get severityNow() { return WEATHER[this.state].severity; }
}
