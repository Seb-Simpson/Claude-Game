import { createRng } from '../engine/rng.js';
import { clamp } from '../engine/math.js';
import { generateTerrain } from './terrain.js';
import { getDifficulty, GAME_MINUTES_PER_SECOND, ROPE_LENGTH } from './constants.js';
import { Player } from './player.js';
import { WeatherSystem } from './weather.js';
import { Hazards } from './hazards.js';
import { altitudeAt, progressAt } from './altitude.js';
import { createResources, packWeight, oxygenDrain, hypoxiaRate, tickOxygen, swapBottle, eat, transfer, campRest } from './resources.js';
import { runOut, ropeRemaining } from './rope.js';
import { nextOutcomeState } from './climbState.js';

/**
 * One climb: owns the route, the climber, weather, hazards, resources and the
 * clock, and turns everything that happens into events for audio and visuals.
 */
export class Climb {
  constructor({ peak, difficulty = 'standard', seed }) {
    this.peak = peak;
    this.diff = getDifficulty(difficulty);
    this.seed = seed || `${peak.id}:${Date.now()}`;
    this.terrain = generateTerrain({ seed: this.seed, height: peak.height, camps: peak.camps, profile: peak.profile, lungeScale: this.diff.lunge, supplies: this.diff.supplies });
    this.rng = createRng(this.seed + ':run');
    const base = this.terrain.ledges.find((l) => l.id === this.terrain.baseId);
    this.player = new Player(base);
    this.weather = new WeatherSystem(this.rng.fork('weather'), peak.weather, this.diff.weather, 'clear');
    this.hazards = new Hazards(this.rng.fork('hazards'), this.terrain, this.diff);
    this.resources = createResources(this.diff);
    this.camps = this.terrain.camps.map((cp) => ({ ...cp, supplies: { ...cp.supplies }, visited: cp.index === 0 }));
    this.anchors = [{ x: (base.x1 + base.x2) / 2 + 10, y: base.y + 6, camp: true }];
    this.roped = true;
    this.state = 'climbing';
    this.time = 0;
    this.hour = peak.startHour;
    this.day = 1;
    this.events = [];
    this.catchRing = null;
    this.prompted = {};
    this.campIndex = 0;
    this.currentCamp = this.camps[0];
    this.stats = { falls: 0, pitons: 0, camps: 0, maxY: 0, maxAlt: peak.baseAlt, food: 0, bottles: 0 };
    this.cause = null;
    this.ropeOut = 0;
    this.notifiedRopeOut = false;
    for (const l of this.terrain.ledges) l.snow = l.kind === 'snow' ? 0.6 : 0.1;
    this.outcome = null;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  get lastAnchor() { return this.anchors[this.anchors.length - 1]; }
  get weight() { return packWeight(this.resources); }
  get altitude() { return altitudeAt(this.player.y, this.peak, this.terrain.height); }
  get progress() { return progressAt(this.player.y, this.terrain.height); }
  get ropeAvailable() { return ropeRemaining(this.lastAnchor, this.player.x, this.player.harnessY) > 0; }
  get breathingOxygen() { return this.resources.oxygen.level > 0; }

  underOverhang(x, y) {
    for (const f of this.terrain.features) if (f.type === 'overhang' && x > f.x1 && x < f.x2 && y < f.y2 && y > f.y1 - 60) return true;
    return false;
  }

  update(dt, intent) {
    if (this.state !== 'climbing') return;
    const p = this.player;
    this.time += dt;
    this.advanceClock(dt * GAME_MINUTES_PER_SECOND / 60);
    const alt = this.altitude;
    const prog = this.progress;

    this.weather.update(dt, prog);
    for (const e of this.weather.events) this.emit(e.type, e);
    p.update(dt, this, intent);
    if (this.state !== 'climbing') return;

    // rope run-out
    const a = this.lastAnchor;
    const out = runOut(a, p.x, p.harnessY);
    this.ropeOut = out;
    const wasRoped = this.roped;
    this.roped = out <= ROPE_LENGTH || p.state === 'roped';
    if (wasRoped && !this.roped) this.emit('ropeOut');

    // snow loading on ledges and holds
    const snow = this.weather.v.snow;
    for (const l of this.terrain.ledges) {
      if (Math.abs(l.y - p.y) > 700) continue;
      l.snow = clamp(l.snow + snow * dt * 0.01 - (1 - snow) * dt * 0.001, 0, 1.2);
    }
    if (snow > 0.3 && this.rng.chance(dt * 4)) {
      const hs = this.terrain.holds;
      const h = hs[Math.floor(this.rng.next() * hs.length)];
      if (h && Math.abs(h.y - p.y) < 500 && h !== p.hold) h.snow = clamp(h.snow + 0.25 * snow, 0, 1);
    }

    // oxygen and hypoxia
    const r = this.resources;
    const perSec = oxygenDrain(alt, this.peak.oxygenAlt, p.exertion, this.diff.drain);
    const ox = tickOxygen(r.oxygen, perSec, dt);
    r.oxygen = ox.ox;
    if (ox.emptied) this.emit('oxygenEmpty', { spares: r.oxygen.spares });
    p.hypoxia = clamp(p.hypoxia + hypoxiaRate(alt, this.peak.oxygenAlt, this.breathingOxygen) * dt);
    if (p.hypoxia > 0.6) p.health = Math.max(0, p.health - (p.hypoxia - 0.6) * 2.5 * dt);
    // deep cold at night in a storm wears you down when exposed
    const cold = this.weather.v.cold * (0.5 + this.nightness * 0.5);
    if (cold > 0.6 && p.state !== 'camp') p.health = Math.max(0, p.health - (cold - 0.6) * 0.6 * dt);
    if (p.health <= 0 && this.state === 'climbing') { this.die(p.hypoxia > 0.6 ? 'hypoxia' : 'cold'); return; }

    // hazards
    this.hazards.update(dt, p, this.weather, prog);
    for (const e of this.hazards.events) this.handleHazard(e);

    // progress
    if (p.y > this.stats.maxY) { this.stats.maxY = p.y; this.stats.maxAlt = Math.max(this.stats.maxAlt, alt); }
    this.checkPrompts(alt, prog);
    if (intent.eatPressed) this.eat();
    if (intent.oxygenPressed) this.swapOxygen();
    if (intent.downPressed && p.state === 'stand' && p.ledge && p.ledge.kind === 'camp') this.enterCamp(p.ledge);
  }

  advanceClock(hours) {
    const before = this.hour;
    this.hour += hours;
    if (Math.floor(this.hour / 24) !== Math.floor(before / 24)) { this.day++; this.emit('newDay', { day: this.day }); }
  }
  get hourOfDay() { return ((this.hour % 24) + 24) % 24; }
  get nightness() { const h = this.hourOfDay; return h < 5 || h > 21 ? 1 : h < 6.5 ? (6.5 - h) / 1.5 : h > 19.5 ? (h - 19.5) / 1.5 : 0; }

  handleHazard(e) {
    const p = this.player;
    if (e.type === 'rockHit') {
      const sheltered = this.underOverhang(p.x, p.y);
      if (sheltered) return;
      const dmg = Math.round((10 + e.size * 2) * this.diff.fallDamage);
      p.health = Math.max(0, p.health - dmg);
      this.emit('rockHit', { ...e, dmg });
      if (p.health <= 0) { this.die('rockfall'); return; }
      if ((p.state === 'hang' || p.state === 'place') && !p.bracing) { this.emit('knocked'); p.startFall(this, (Math.random() - 0.5) * 60, 0); }
      else p.stamina = Math.max(0, p.stamina - 25);
      return;
    }
    if (e.type === 'avalancheTick') {
      const shelter = this.underOverhang(p.x, p.y) || (p.ledge && p.ledge.sheltered) || p.state === 'camp';
      if (shelter) return;
      const drain = (p.bracing ? 16 : 34) * e.power * e.dt * this.diff.hazard;
      p.stamina = Math.max(0, p.stamina - drain);
      p.snowCover = Math.min(1, p.snowCover + e.dt * 0.6);
      if (!p.bracing && !this.prompted.avKnock && e.power > 0.8 && (p.state === 'hang' || p.state === 'stand')) {
        this.prompted.avKnock = true;
        this.emit('knocked');
        p.startFall(this, this.weather.dir * 80, 0);
      } else if (p.state === 'hang' && p.stamina <= 0) p.startFall(this, 0, 0);
      return;
    }
    if (e.type === 'avalancheFlow') this.prompted.avKnock = false;
    this.emit(e.type, e);
  }

  checkPrompts(alt, prog) {
    const p = this.player, r = this.resources;
    if (p.state !== 'stand' && p.state !== 'hang') return;
    const remain = 1 - prog;
    const ask = (key, reasons) => { if (!this.prompted[key]) { this.prompted[key] = true; this.emit('turnBack', { reason: key, lines: reasons }); } };
    if (alt > this.peak.oxygenAlt && r.oxygen.level < 0.22 && r.oxygen.spares === 0) ask('oxygen', ['Your last bottle is almost empty.', `The summit is ${Math.round(this.peak.summitAlt - alt)} m above.`]);
    else if (p.health < 35) ask('health', ['You are badly hurt.', 'Another fall could be your last.']);
    else if (r.food === 0 && p.fatigue < 0.5) ask('food', ['No food left and your strength is fading.', 'Your grip will not recover fully.']);
    else if (this.weather.forecastIssued && this.weather.next && (this.weather.next === 'storm' || this.weather.next === 'whiteout') && remain > 0.08) ask('storm' + this.campIndex, [`${this.weather.next === 'storm' ? 'A storm' : 'A whiteout'} is coming.`, 'Find shelter under an overhang or at camp, or turn back now.']);
  }

  /** When a snow bridge collapses its edges become holds you can catch with Grip. */
  addLipHolds(l) {
    const hs = this.terrain.holds;
    for (const x of [l.crevasse.x1 + 2, l.crevasse.x2 - 2]) {
      const h = { id: 1e6 + hs.length, x, y: l.y - 6, type: 'jug', snow: 0.6, crack: 0, broken: false, overhang: false, lip: true };
      let i = hs.length;
      while (i > 0 && hs[i - 1].y > h.y) i--;
      hs.splice(i, 0, h);
    }
  }

  addAnchor(x, y) {
    const r = this.resources;
    if (r.pitons <= 0) return;
    r.pitons--;
    this.stats.pitons++;
    this.anchors.push({ x, y });
    this.roped = true;
    this.emit('anchor', { x, y });
  }
  eat() {
    const p = this.player;
    const res = eat(this.resources);
    if (!res.ok) { this.emit('noFood'); return; }
    if (!p.startBusy('eat', 1.1)) return;
    this.resources = res.r;
    p.stamina = Math.min(p.maxStamina + 30, p.stamina + res.stamina);
    p.fatigue = Math.min(1, p.fatigue + res.fatigue);
    this.stats.food++;
    this.emit('eat');
  }
  swapOxygen() {
    const res = swapBottle(this.resources);
    if (!res.ok) { this.emit('noOxygen'); return; }
    if (this.resources.oxygen.level > 0.5) { this.emit('oxygenNotEmpty'); return; }
    if (!this.player.startBusy('oxygen', 1.4)) return;
    this.resources = res.r;
    this.stats.bottles++;
    this.emit('oxygenSwap');
  }
  dropItem(item) {
    const r = { ...this.resources, oxygen: { ...this.resources.oxygen } };
    if (item === 'oxygen' && r.oxygen.spares > 0) r.oxygen.spares--;
    else if (item === 'food' && r.food > 0) r.food--;
    else if (item === 'pitons' && r.pitons > 0) r.pitons--;
    else return false;
    this.resources = r;
    this.emit('drop', { item });
    return true;
  }

  onLedge(l) {
    if (l.kind === 'summit') { this.reachSummit(); return; }
    if (l.kind === 'camp') {
      const camp = this.camps.find((c) => c.ledgeId === l.id);
      if (camp && !camp.visited) this.enterCamp(l);
    }
  }
  enterCamp(l) {
    const camp = this.camps.find((c) => c.ledgeId === l.id);
    if (!camp) return;
    if (!camp.visited) { camp.visited = true; this.stats.camps++; this.emit('campReached', { index: camp.index }); }
    this.currentCamp = camp;
    this.campIndex = Math.max(this.campIndex, camp.index);
    this.state = 'camp';
    this.player.state = 'stand';
    // rope is recovered and re-anchored at camp
    this.anchors = [{ x: (l.x1 + l.x2) / 2 + 10, y: l.y + 6, camp: true }];
    this.roped = true;
    this.prompted = {};
    this.emit('campEnter', { index: camp.index });
  }
  campTransfer(item, amount) {
    const res = transfer(this.resources, this.currentCamp.supplies, item, amount);
    this.resources = res.r;
    this.currentCamp.supplies = res.cache;
  }
  campRest(hours) {
    const p = this.player;
    const res = campRest(p, hours);
    Object.assign(p, res);
    p.snowCover = 0;
    this.advanceClock(hours);
    this.weather.skip(hours * 60 * 0.5, this.progress);
    this.emit('rest', { hours });
  }
  leaveCamp() {
    if (this.state !== 'camp') return;
    this.state = 'climbing';
    this.emit('campLeave');
  }

  reachSummit() {
    if (this.state !== 'climbing') return;
    this.stats.maxAlt = this.peak.summitAlt;
    this.finish('summit', 'summit');
  }
  retreat(reason = 'choice') { this.finish('retreat', reason); }
  die(cause) { if (this.state === 'climbing' || this.state === 'camp') { this.player.state = 'dead'; this.finish('fallen', cause); } }
  finish(outcome, cause) {
    const next = nextOutcomeState(this.state, outcome);
    if (next === this.state) return;
    this.state = next;
    this.outcome = outcome;
    this.cause = cause;
    this.emit('end', { outcome, cause });
  }

  summary() {
    return {
      peak: this.peak.id, peakName: this.peak.name, daily: this.peak.daily || null,
      difficulty: this.diff.id, outcome: this.outcome, cause: this.cause,
      altitude: this.stats.maxAlt, summitAlt: this.peak.summitAlt, baseAlt: this.peak.baseAlt,
      progress: clamp((this.stats.maxAlt - this.peak.baseAlt) / (this.peak.summitAlt - this.peak.baseAlt)),
      time: Math.round(this.time), days: this.day, falls: this.stats.falls, pitons: this.stats.pitons,
      camps: this.stats.camps, seed: this.seed, date: new Date().toISOString(),
    };
  }
}
