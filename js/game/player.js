import { REACH, LUNGE, STAND_REACH, GRAVITY, WALK_SPEED, FALL_FATAL, ROPE_SLACK } from './constants.js';
import { hangDrain, actionCost, recovery, speedMultiplier, maxStamina, fatigueFromSpend } from './stamina.js';
import { fallDamage, isProtected, runOut } from './rope.js';
import { holdsInRange } from './terrain.js';
import { clamp } from '../engine/math.js';

export const HAND = 32;    // hands above feet when hanging
const HARNESS = 18;        // rope tie-in above feet
const tmp = [];

/**
 * The climber. A small state machine:
 * stand -> reach/lunge/fall/place ; hang -> reach/lunge/fall/place ;
 * fall -> stand/hang/roped/dead ; roped -> reach/hang/stand.
 */
export class Player {
  constructor(ledge) {
    this.x = (ledge.x1 + ledge.x2) / 2 - 20;
    this.y = ledge.y;
    this.vx = 0; this.vy = 0;
    this.state = 'stand';
    this.ledge = ledge; this.hold = null;
    this.facing = 1; this.pose = 'idle'; this.tilt = 0;
    this.stamina = 100; this.fatigue = 1; this.health = 100; this.hypoxia = 0;
    this.snowCover = 0; this.still = 0; this.breathT = 0;
    this.exertion = 0; this.bracing = false;
    this.hint = { reach: new Set(), lunge: new Set() };
    this.hintT = 0; this.targetHold = null;
    this.moveCool = 0; this.stepDist = 0;
    this.fallStartY = 0; this.fallRopeOut = 0; this.fallProtected = false;
    this.busyT = 0; this.resume = null;
  }
  get handsX() { return this.x; }
  get handsY() { return this.state === 'stand' ? this.y + HAND + 4 : this.y + HAND; }
  get harnessY() { return this.y + HARNESS; }
  get maxStamina() { return maxStamina(this.fatigue); }
  get climbing() { return this.state === 'hang' || this.state === 'reach' || this.state === 'roped' || this.state === 'place'; }

  spend(c, cost) {
    if (cost <= 0) return;
    this.stamina = Math.max(0, this.stamina - cost);
    this.fatigue = Math.max(0.35, this.fatigue - fatigueFromSpend(cost) * c.diff.drain);
    this.exertion = Math.min(1, this.exertion + cost * 0.04);
  }

  update(dt, c, intent) {
    this.moveCool -= dt;
    this.exertion = Math.max(0, this.exertion - dt * 0.12);
    this.bracing = !!intent.grip && (this.state === 'hang' || this.state === 'stand');
    switch (this.state) {
      case 'stand': this.updateStand(dt, c, intent); break;
      case 'hang': this.updateHang(dt, c, intent); break;
      case 'reach': this.updateReach(dt, c); break;
      case 'lunge': this.updateLunge(dt, c, intent); break;
      case 'fall': this.updateFall(dt, c, intent); break;
      case 'roped': this.updateRoped(dt, c, intent); break;
      case 'place': this.updatePlace(dt, c); break;
      case 'busy': this.updateBusy(dt, c); break;
      default: break;
    }
    this.stamina = Math.min(this.stamina, this.maxStamina);
    this.updateCosmetics(dt, c);
    this.hintT -= dt;
    if (this.hintT <= 0) { this.hintT = 0.1; this.updateHints(c, intent); }
  }

  // ---------- targeting ----------
  bestHold(c, fx, fy, dir, maxD, minD = 6, prefer = 'near') {
    const len = Math.hypot(dir.x, dir.y);
    if (!len) return null;
    const ux = dir.x / len, uy = dir.y / len;
    let best = null, bs = -Infinity;
    for (const h of holdsInRange(c.terrain, fy - maxD, fy + maxD, tmp)) {
      if (h.broken || h === this.hold) continue;
      const vx = h.x - fx, vy = h.y - fy;
      const d = Math.hypot(vx, vy);
      if (d < minD || d > maxD) continue;
      const cos = (vx * ux + vy * uy) / d;
      if (cos < 0.42) continue;
      const score = prefer === 'far' ? cos - Math.abs(d - maxD * 0.7) / maxD * 0.4 : cos - (d / maxD) * 0.45;
      if (score > bs) { bs = score; best = h; }
    }
    return best;
  }
  ledgeAbove(c, fx, fy, maxUp) {
    for (const l of c.terrain.ledges) {
      const dy = l.y - fy;
      if (dy >= -12 && dy <= maxUp && fx >= l.x1 - 26 && fx <= l.x2 + 26) return l;
    }
    return null;
  }
  ledgeBelowFeet(c, fx, feetY, maxDown) {
    let best = null;
    for (const l of c.terrain.ledges) {
      const dy = feetY - l.y;
      if (dy >= -4 && dy <= maxDown && fx >= l.x1 - 10 && fx <= l.x2 + 10 && (!best || l.y > best.y)) best = l;
    }
    return best;
  }

  updateHints(c, intent) {
    const s = this.state;
    this.hint.reach.clear(); this.hint.lunge.clear();
    this.targetHold = null;
    if (s !== 'hang' && s !== 'stand' && s !== 'roped') return;
    const fx = this.handsX, fy = this.handsY;
    for (const h of holdsInRange(c.terrain, fy - LUNGE, fy + LUNGE, tmp)) {
      if (h.broken || h === this.hold) continue;
      const d = Math.hypot(h.x - fx, h.y - fy);
      if (s === 'stand') {
        const dy = h.y - this.y;
        if (dy >= 28 && dy <= STAND_REACH && h.x >= this.ledge.x1 - 40 && h.x <= this.ledge.x2 + 40) this.hint.reach.add(h.id);
        else if (d <= LUNGE && h.y > this.y + 20) this.hint.lunge.add(h.id);
      } else if (d <= REACH) this.hint.reach.add(h.id);
      else if (d <= LUNGE && h.y > fy - 30) this.hint.lunge.add(h.id);
    }
    const dir = intent.dir;
    if (dir.x || dir.y) {
      this.targetHold = intent.jumpHeld ? this.bestHold(c, fx, fy, dir, LUNGE, 6, 'far') : s === 'stand' ? this.standTarget(c, dir) : this.bestHold(c, fx, fy, dir, REACH);
    }
  }

  standTarget(c, dir) {
    if (dir.y <= 0) return null;
    let best = null, bs = Infinity;
    for (const h of holdsInRange(c.terrain, this.y + 28, this.y + STAND_REACH, tmp)) {
      if (h.broken) continue;
      const dx = h.x - this.x;
      if (Math.abs(dx) > 44) continue;
      const score = Math.abs(dx - dir.x * 30);
      if (score < bs) { bs = score; best = h; }
    }
    return best;
  }

  // ---------- states ----------
  updateStand(dt, c, intent) {
    const l = this.ledge;
    const w = c.weather;
    this.y = l.y;
    const sheltered = l.sheltered || c.underOverhang(this.x, this.y);
    this.stamina += recovery({ sheltered, hypoxia: this.hypoxia, cold: w.v.cold, wind: w.v.wind }) * dt;
    const dir = intent.dir;
    let moving = false;
    if (dir.x && !intent.jumpPressed && dir.y <= 0.1) {
      const sp = WALK_SPEED * speedMultiplier(c.weight) * (this.bracing ? 0.5 : 1);
      const dx = dir.x * sp * dt;
      this.x += dx;
      this.facing = dir.x;
      this.stepDist += Math.abs(dx);
      moving = true;
      if (this.stepDist > 16) { this.stepDist = 0; c.emit('step', { surface: l.snow > 0.3 ? 'snow' : 'rock', x: this.x, y: this.y }); }
    }
    // wind nudges you along an exposed ledge unless you brace
    if (!sheltered && !this.bracing) this.x += w.force * 0.12 * dt;
    this.x = clamp(this.x, l.x1 + 4, l.x2 - 4);
    this.pose = moving ? 'idle' : this.stamina < this.maxStamina * 0.4 ? 'breathe' : 'idle';
    this.tilt = moving ? Math.sin(c.time * 10) * 0.03 : 0;

    const cv = l.crevasse;
    if (cv && !cv.open) {
      if (this.x > cv.x1 - 2 && this.x < cv.x2 + 2) {
        const before = cv.stress;
        cv.stress = Math.min(1, cv.stress + dt / (c.diff.id === 'gentle' ? 1.4 : 0.95));
        if (Math.floor(before * 3) !== Math.floor(cv.stress * 3)) c.emit('creak', { level: cv.stress, x: this.x, y: l.y });
        if (cv.stress >= 1) {
          cv.open = true;
          c.addLipHolds(l);
          c.emit('crevasse', { x: this.x, y: l.y });
          this.startFall(c, 0, 0);
          return;
        }
      } else if (Math.abs(this.x - (cv.x1 + cv.x2) / 2) < 60 && cv.stress === 0 && Math.random() < dt * 0.6) {
        cv.stress = 0.04; // a faint settling sound as you approach
        c.emit('creak', { level: 0.1, x: this.x, y: l.y });
      }
    }

    if (intent.pitonPressed) { this.startPlace(c); return; }
    if (intent.jumpPressed) {
      const d = dir.x || dir.y ? dir : { x: 0, y: 1 };
      const t = d.y >= 0 ? this.bestHold(c, this.handsX, this.handsY, d, LUNGE, 20, 'far') : null;
      if (t && d.y > 0) { this.startLunge(c, t); return; }
      if (dir.x) { // hop along the ledge (over a weak snow bridge)
        this.spend(c, actionCost('hop', { weight: c.weight, drain: c.diff.drain }));
        this.facing = dir.x;
        this.startFall(c, dir.x * 125 * speedMultiplier(c.weight), 230, true);
        c.emit('hop', { x: this.x, y: this.y });
        return;
      }
    }
    if (dir.y > 0.1 && this.moveCool <= 0) {
      const t = this.standTarget(c, dir);
      if (t) { this.startReach(c, t.x, t.y - HAND, t, null, 'reach'); return; }
    }
    if (dir.y < -0.1 && this.moveCool <= 0 && l.kind !== 'camp') {
      for (const h of holdsInRange(c.terrain, l.y - 50, l.y + 8, tmp)) {
        if (!h.broken && Math.abs(h.x - this.x) < 40) { this.startReach(c, h.x, h.y - HAND, h, null, 'down'); return; }
      }
    }
  }

  updateHang(dt, c, intent) {
    const h = this.hold;
    const w = c.weather;
    const sway = this.bracing ? 0 : w.force * 0.012;
    this.x = h.x + sway; this.y = h.y - HAND;
    this.tilt = clamp(w.force * 0.0015 * (this.bracing ? 0.3 : 1), -0.12, 0.12);
    const shelter = c.underOverhang(this.x, this.y) || h.chimney ? 0.5 : 1;
    const drain = hangDrain({
      holdType: h.type, overhang: h.overhang, snow: h.snow, wind: (w.v.wind + w.gust * 1.4) * shelter,
      brace: this.bracing, weight: c.weight, hypoxia: this.hypoxia, cold: w.v.cold, drain: c.diff.drain,
    });
    this.spend(c, drain * dt);
    this.pose = this.stamina < 25 ? 'hang' : this.bracing ? 'pull' : 'hang';
    if (h.type === 'thin') {
      const before = h.crack;
      h.crack = Math.min(1, h.crack + dt / (c.diff.id === 'gentle' ? 2.6 : 1.8));
      if (Math.floor(before * 3) !== Math.floor(h.crack * 3)) c.emit('iceCrack', { level: h.crack, x: h.x, y: h.y });
      if (h.crack >= 1) { h.broken = true; c.emit('iceBreak', { x: h.x, y: h.y }); this.startFall(c, 0, 0); return; }
    }
    if (this.stamina <= 0) { c.emit('slip', { x: this.x, y: this.y }); this.startFall(c, 0, 0); return; }
    if (intent.pitonPressed) { this.startPlace(c); return; }
    const dir = intent.dir;
    if (intent.jumpPressed) {
      const d = dir.x || dir.y ? dir : { x: 0, y: 1 };
      const t = this.bestHold(c, this.handsX, this.handsY, d, LUNGE, 20, 'far');
      if (t) { this.startLunge(c, t); return; }
    }
    if ((dir.x || dir.y) && this.moveCool <= 0) this.tryMove(c, dir);
  }

  tryMove(c, dir) {
    const fx = this.handsX, fy = this.handsY;
    if (dir.y > 0.1) {
      const l = this.ledgeAbove(c, fx, fy, REACH * 0.9);
      if (l) { this.startReach(c, clamp(fx, l.x1 + 8, l.x2 - 8), l.y, null, l, 'mantle'); return true; }
    }
    if (dir.y < -0.1) {
      const l = this.ledgeBelowFeet(c, this.x, this.y, 46);
      if (l) { this.startReach(c, clamp(this.x, l.x1 + 8, l.x2 - 8), l.y, null, l, 'down'); return true; }
      // sit back on the rope when the last anchor is right beside you
      const a = c.lastAnchor;
      if (this.state === 'hang' && a && !a.camp && c.roped && Math.hypot(a.x - this.x, a.y - this.harnessY) < 48 && Math.abs(dir.x) < 0.5) {
        this.state = 'roped';
        this.hold = null;
        this.ropeLen = Math.max(16, Math.hypot(a.x - this.x, a.y - this.harnessY) + 6);
        this.theta = Math.atan2(this.x - a.x, a.y - this.harnessY) || 0;
        this.omega = 0;
        this.fallRopeOut = this.ropeLen;
        this.moveCool = 0.3;
        c.emit('restOnRope', { x: this.x, y: this.y });
        return true;
      }
    }
    const t = this.bestHold(c, fx, fy, dir, REACH);
    if (t) { this.startReach(c, t.x, t.y - HAND, t, null, 'reach'); return true; }
    return false;
  }

  startReach(c, tx, ty, hold, ledge, kind) {
    const d = Math.hypot(tx - this.x, ty - this.y);
    const cost = kind === 'mantle' ? actionCost('mantle', { weight: c.weight, hypoxia: this.hypoxia, drain: c.diff.drain }) : actionCost('reach', { distance: d, weight: c.weight, hypoxia: this.hypoxia, drain: c.diff.drain });
    this.spend(c, kind === 'down' ? cost * 0.5 : cost);
    const slow = (this.stamina < 25 ? 1.35 : 1) / speedMultiplier(c.weight);
    this.reach = { fx: this.x, fy: this.y, tx, ty, hold, ledge, t: 0, dur: (0.22 + (d / REACH) * 0.2) * slow, kind };
    if (Math.abs(tx - this.x) > 3) this.facing = Math.sign(tx - this.x);
    this.state = 'reach';
    this.hold = null;
    this.ledge = null;
    this.moveCool = 0.02;
    if (this.snowCover > 0.2) { c.emit('shakeSnow', { x: this.x, y: this.y + 30 }); }
    this.snowCover *= 0.6;
    this.still = 0;
  }
  updateReach(dt, c) {
    const r = this.reach;
    r.t += dt;
    const k = clamp(r.t / r.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    this.x = r.fx + (r.tx - r.fx) * e;
    this.y = r.fy + (r.ty - r.fy) * e + Math.sin(k * Math.PI) * 3;
    this.pose = k < 0.45 ? 'reach' : 'pull';
    this.tilt = (r.tx - r.fx) * 0.002;
    if (k >= 1) this.arrive(c, r.hold, r.ledge);
  }
  arrive(c, hold, ledge) {
    if (hold) {
      if (hold.broken) { this.startFall(c, 0, 0); return; }
      this.state = 'hang'; this.hold = hold;
      this.x = hold.x; this.y = hold.y - HAND;
      if (hold.snow > 0.1) { c.emit('brushSnow', { x: hold.x, y: hold.y }); hold.snow = 0; }
      c.emit('grab', { surface: hold.type, x: hold.x, y: hold.y });
    } else if (ledge) {
      this.state = 'stand'; this.ledge = ledge; this.y = ledge.y;
      c.emit('land', { surface: ledge.snow > 0.3 ? 'snow' : 'rock', soft: true, x: this.x, y: ledge.y });
      c.onLedge(ledge);
    }
    this.tilt = 0;
  }

  startLunge(c, target) {
    this.spend(c, actionCost('lunge', { weight: c.weight, hypoxia: this.hypoxia, drain: c.diff.drain }));
    const tx = target.x, ty = target.y - HAND;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const T = (0.34 + (d / LUNGE) * 0.24) / Math.sqrt(speedMultiplier(c.weight));
    this.lunge = { target, T, t: 0, buffered: -1 };
    this.vx = dx / T;
    this.vy = (dy + 0.5 * GRAVITY * T * T) / T;
    this.facing = dx >= 0 ? 1 : -1;
    this.state = 'lunge';
    this.hold = null; this.ledge = null;
    this.fallStartY = this.y;
    this.markFallRope(c);
    c.emit('lunge', { x: this.x, y: this.y });
  }
  updateLunge(dt, c, intent) {
    const L = this.lunge;
    L.t += dt;
    this.vy -= GRAVITY * dt;
    this.vx += c.weather.force * 0.25 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.fallStartY = Math.max(this.fallStartY, this.y);
    this.pose = 'reach';
    const win = c.diff.catchWindow;
    const open = L.T - win * 0.5, close = L.T + win * 0.5;
    const press = intent.jumpPressed || intent.gripPressed;
    if (press && L.t < open && L.t > open - 0.09) L.buffered = L.t;
    const inWindow = L.t >= open && L.t <= close;
    c.catchRing = { x: L.target.x, y: L.target.y, progress: clamp(L.t / L.T), inWindow };
    if (inWindow && (press || L.buffered >= 0)) {
      const late = (L.t - open) / win;
      c.catchRing = null;
      this.arrive(c, L.target, null);
      if (this.state === 'hang') c.emit(late > 0.72 ? 'nearCatch' : 'catch', { x: this.x, y: this.y });
      return;
    }
    if (L.t > close) {
      c.catchRing = null;
      c.emit('miss', { x: this.x, y: this.y });
      this.state = 'fall';
    }
  }

  markFallRope(c) {
    const a = c.lastAnchor;
    this.fallProtected = c.roped && isProtected(a, this.x, this.harnessY);
    this.fallRopeOut = a ? runOut(a, this.x, this.harnessY) : 0;
  }
  startFall(c, vx, vy, hop = false) {
    this.state = 'fall';
    this.vx = vx; this.vy = vy;
    this.hold = null; this.ledge = null;
    this.fallStartY = this.y;
    this.hop = hop;
    this.markFallRope(c);
    if (!hop) c.emit('fall', { x: this.x, y: this.y });
  }
  updateFall(dt, c, intent) {
    const py = this.y;
    this.vy = Math.max(-900, this.vy - GRAVITY * dt);
    this.vx += c.weather.force * 0.3 * dt;
    this.vx *= 1 - dt * 0.4;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.fallStartY = Math.max(this.fallStartY, this.y);
    this.pose = this.hop ? 'reach' : 'fall';
    this.tilt = clamp(this.vx * 0.002, -0.4, 0.4);
    const dist = this.fallStartY - this.y;

    // land on a ledge
    if (this.vy < 0) {
      for (const l of c.terrain.ledges) {
        if (py >= l.y && this.y <= l.y && this.x >= l.x1 - 6 && this.x <= l.x2 + 6) {
          const cv = l.crevasse;
          if (cv && cv.open && this.x > cv.x1 && this.x < cv.x2) continue;
          this.land(c, l, dist);
          return;
        }
      }
    }
    // rope catch
    const a = c.lastAnchor;
    if (this.fallProtected && a && this.vy < 0) {
      const L = this.fallRopeOut + ROPE_SLACK;
      const dx = this.x - a.x, dy = this.harnessY - a.y;
      if (dy < 0 && Math.hypot(dx, dy) > L) {
        this.state = 'roped';
        this.ropeLen = L;
        this.theta = Math.atan2(dx, -dy);
        this.omega = this.vx / L * 0.5;
        const dmg = fallDamage(dist, { roped: true, ropeOut: this.fallRopeOut, fallDamage: c.diff.fallDamage });
        this.health = Math.max(0, this.health - dmg);
        this.placeOnRope(a);
        c.emit('ropeCatch', { dist, dmg, x: this.x, y: this.y });
        c.stats.falls++;
        if (this.health <= 0) c.die('fall');
        return;
      }
    }
    // self-arrest: grab a hold as you pass it
    if (intent.gripPressed && this.vy > -560 && !this.hop) {
      for (const h of holdsInRange(c.terrain, this.handsY - 22, this.handsY + 22, tmp)) {
        if (h.broken || Math.abs(h.x - this.x) > 22) continue;
        this.spend(c, actionCost('arrest', { weight: c.weight, drain: c.diff.drain }));
        if (this.stamina <= 0) break;
        const dmg = Math.round(fallDamage(dist, { fallDamage: c.diff.fallDamage }) * 0.4);
        this.health = Math.max(0, this.health - dmg);
        this.arrive(c, h, null);
        c.emit('arrest', { dist, x: this.x, y: this.y });
        if (dist > 40) c.stats.falls++;
        return;
      }
    }
    const fatal = !this.fallProtected && dist > FALL_FATAL;
    if (fatal || this.y < -260) { c.die('fall'); this.state = 'dead'; }
  }
  land(c, l, dist) {
    this.state = 'stand'; this.ledge = l; this.y = l.y; this.vx = this.vy = 0; this.tilt = 0;
    const dmg = this.hop ? 0 : fallDamage(dist, { fallDamage: c.diff.fallDamage });
    this.health = Math.max(0, this.health - dmg);
    c.emit('land', { surface: l.snow > 0.3 ? 'snow' : 'rock', dist, dmg, soft: dist < 40, x: this.x, y: l.y });
    if (dmg > 0) c.stats.falls++;
    this.hop = false;
    if (this.health <= 0) { c.die('fall'); return; }
    c.onLedge(l);
  }

  placeOnRope(a) {
    this.x = a.x + Math.sin(this.theta) * this.ropeLen;
    this.y = a.y - Math.cos(this.theta) * this.ropeLen - HARNESS;
  }
  updateRoped(dt, c, intent) {
    const a = c.lastAnchor;
    if (!a) { this.startFall(c, 0, 0); return; }
    const L = this.ropeLen;
    const dir = intent.dir;
    const acc = -(GRAVITY / L) * Math.sin(this.theta) + (c.weather.force * 0.6 + dir.x * 60) / L;
    this.omega += acc * dt;
    this.omega *= 1 - dt * 0.9;
    this.theta += this.omega * dt;
    this.pose = 'hang';
    this.tilt = this.theta * 0.5;
    this.stamina += 6 * (1 - this.hypoxia * 0.5) * dt; // the harness takes your weight
    const prevY = this.y;
    if (dir.y > 0.1) {
      if (this.moveCool <= 0 && this.ropeLen < 40 && this.tryMove(c, dir)) return;
      this.ropeLen = Math.max(14, L - 34 * dt * speedMultiplier(c.weight));
      this.spend(c, actionCost('jug', { weight: c.weight, drain: c.diff.drain }) * dt);
      if (Math.random() < dt * 3) c.emit('ropeCreak', { amount: 0.5 });
      this.pose = 'pull';
    } else if (dir.y < -0.1) {
      this.ropeLen = Math.min(this.fallRopeOut + ROPE_SLACK + 60, L + 40 * dt);
    } else if ((dir.x) && this.moveCool <= 0) {
      if (this.tryMove(c, dir)) return;
    }
    this.placeOnRope(a);
    if (this.ropeLen <= 16) {
      // back at the anchor: grab the nearest hold or step onto the ledge
      const h = this.bestHold(c, this.handsX, this.handsY, { x: 0, y: 1 }, REACH) || this.bestHold(c, this.handsX, this.handsY, { x: 0, y: -1 }, REACH);
      if (h) { this.startReach(c, h.x, h.y - HAND, h, null, 'reach'); return; }
    }
    const l = this.ledgeBelowFeet(c, this.x, prevY, 6);
    if (l && this.y <= l.y) { this.state = 'stand'; this.ledge = l; this.y = l.y; this.tilt = 0; c.emit('land', { surface: 'rock', soft: true, dist: 0, x: this.x, y: l.y }); c.onLedge(l); return; }
    if (this.stamina <= 0 && dir.y > 0) this.ropeLen = L;
  }

  startPlace(c) {
    if (c.resources.pitons <= 0) { c.emit('noPitons'); return; }
    if (!c.ropeAvailable) { c.emit('ropeOutWarn'); }
    this.resume = { state: this.state, hold: this.hold, ledge: this.ledge };
    this.state = 'place';
    this.busyT = 0; this.strikes = 0;
    this.spend(c, actionCost('piton', { weight: c.weight, drain: c.diff.drain }));
  }
  updatePlace(dt, c) {
    this.busyT += dt;
    const r = this.resume;
    if (r.state === 'hang') {
      const h = r.hold;
      this.spend(c, hangDrain({ holdType: h.type, overhang: h.overhang, snow: h.snow, wind: c.weather.v.wind, weight: c.weight, hypoxia: this.hypoxia, drain: c.diff.drain }) * dt);
      if (this.stamina <= 0) { this.state = 'hang'; this.hold = h; this.startFall(c, 0, 0); return; }
    }
    this.pose = this.busyT % 0.35 < 0.18 ? 'reach' : 'pull';
    const marks = [0.12, 0.47, 0.82];
    if (this.strikes < 3 && this.busyT >= marks[this.strikes]) {
      c.emit('pitonStrike', { strike: this.strikes, x: this.x + this.facing * 6, y: this.y + 24 });
      this.strikes++;
    }
    if (this.busyT >= 1.05) {
      this.state = r.state; this.hold = r.hold; this.ledge = r.ledge;
      c.addAnchor(this.x + this.facing * 5, this.y + (r.state === 'hang' ? HAND - 6 : 8));
    }
  }

  /** Short timed action (eating, swapping a bottle). */
  startBusy(kind, dur) {
    if (this.state !== 'stand' && this.state !== 'hang' && this.state !== 'roped') return false;
    this.resume = { state: this.state, hold: this.hold, ledge: this.ledge };
    this.state = 'busy'; this.busyKind = kind; this.busyT = 0; this.busyDur = dur;
    return true;
  }
  updateBusy(dt, c) {
    this.busyT += dt;
    this.pose = 'breathe';
    const r = this.resume;
    if (r.state === 'hang') {
      const h = r.hold;
      this.spend(c, hangDrain({ holdType: h.type, overhang: h.overhang, snow: h.snow, wind: c.weather.v.wind, weight: c.weight, hypoxia: this.hypoxia, drain: c.diff.drain }) * dt);
      if (this.stamina <= 0) { this.hold = h; this.startFall(c, 0, 0); return; }
    }
    if (this.busyT >= this.busyDur) { this.state = r.state; this.hold = r.hold; this.ledge = r.ledge; }
  }

  updateCosmetics(dt, c) {
    const w = c.weather;
    const stationary = this.state === 'stand' || this.state === 'hang' || this.state === 'roped';
    this.still = stationary ? this.still + dt : 0;
    if (this.still > 1.5) this.snowCover = Math.min(1, this.snowCover + w.v.snow * dt * 0.035 * (c.underOverhang(this.x, this.y) ? 0.2 : 1));
    // breathing rhythm follows exertion and thin air
    const rate = 0.22 + this.exertion * 0.4 + this.hypoxia * 0.35 + (1 - this.stamina / 100) * 0.15;
    const before = this.breathT;
    this.breathT += dt * rate;
    if (Math.floor(before * 2) !== Math.floor(this.breathT * 2)) {
      const exhale = Math.floor(this.breathT * 2) % 2 === 1;
      c.emit('breath', { exhale, intensity: clamp(this.exertion * 0.6 + this.hypoxia * 0.6 + (1 - this.stamina / 100) * 0.4), x: this.x, y: this.y + 33 });
    }
  }
}
