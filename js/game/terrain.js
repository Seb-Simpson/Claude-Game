import { createRng, createNoise1D } from '../engine/rng.js';
import { clamp } from '../engine/math.js';
import { REACH, LUNGE, STAND_REACH } from './constants.js';

/**
 * Procedural route generation. The route is built as a chain of holds and
 * ledges where every link is within reach (or a deliberate lunge gap), so a
 * route is always climbable. Everything derives from the seed.
 */
const SAFE_STEP = REACH * 0.84;
const WALL_SAMPLE = 32;

export function generateTerrain({ seed, height, camps = 3, profile = {}, lungeScale = 1, supplies = 1 }) {
  const rng = createRng(seed);
  const noise = createNoise1D(seed + ':wall');
  const p = { ice: 0.1, snow: 0.4, overhang: 0.12, chimney: 0.14, traverse: 0.16, lunge: 0.08, thin: 0.2, crevasse: 0.3, rockfall: 0.3, avalanche: 0.2, ...profile };

  const holds = [], ledges = [], features = [], route = [];
  let nextId = 0;
  const centerAt = (y) => noise.fbm(y / 1100 + 3.1, 3) * 260;
  const halfAt = (y) => 250 + (noise.fbm(y / 700 + 50, 3) + 0.5) * 170;
  const clampX = (x, y, m = 40) => clamp(x, centerAt(y) - halfAt(y) + m, centerAt(y) + halfAt(y) - m);

  const addHold = (x, y, type = 'jug', extra) => {
    const h = { id: nextId++, x: Math.round(x), y: Math.round(y), type, snow: 0, crack: 0, broken: false, overhang: false, ...extra };
    holds.push(h);
    return h;
  };
  const addLedge = (x1, x2, y, kind = 'rock', extra) => {
    const l = { id: nextId++, x1: Math.round(x1), x2: Math.round(x2), y: Math.round(y), kind, snow: kind === 'snow' ? 0.6 : 0.15, crevasse: null, sheltered: false, ...extra };
    ledges.push(l);
    return l;
  };
  const tooClose = (x, y, r = 26) => {
    for (let i = holds.length - 1; i >= 0 && i > holds.length - 40; i--) {
      const h = holds[i];
      if (Math.abs(h.x - x) < r && Math.abs(h.y - y) < r) return true;
    }
    return false;
  };
  const rockType = () => (rng.chance(0.35) ? 'crimp' : 'jug');

  // Base camp
  const base = addLedge(-190, 190, 0, 'camp', { campIndex: 0, sheltered: true });
  route.push({ kind: 'ledge', id: base.id });
  const campYs = [];
  for (let k = 1; k <= camps; k++) campYs.push((height * k) / (camps + 1));
  let campCursor = 0;

  let cur = { x: rng.range(-90, 90), y: rng.range(46, 64) };
  let h0 = addHold(cur.x, cur.y, 'jug');
  route.push({ kind: 'hold', id: h0.id });

  const step = (opts = {}) => {
    const { dyMin = 28, dyMax = 54, dxMax = 52, dirBias = 0, maxLen = SAFE_STEP } = opts;
    let dy = rng.range(dyMin, dyMax);
    let dx = rng.range(-dxMax, dxMax) + dirBias;
    const len = Math.hypot(dx, dy);
    if (len > maxLen) { dx *= maxLen / len; dy *= maxLen / len; }
    let nx = clampX(cur.x + dx, cur.y + dy);
    // clamping may have shortened dx; keep within reach either way
    const ny = cur.y + dy;
    if (Math.hypot(nx - cur.x, ny - cur.y) > maxLen) nx = cur.x + Math.sign(nx - cur.x) * Math.sqrt(Math.max(0, maxLen * maxLen - dy * dy));
    return { x: nx, y: ny };
  };
  const pushHold = (pos, type, extra) => {
    const h = addHold(pos.x, pos.y, type, extra);
    route.push({ kind: 'hold', id: h.id });
    cur = { x: h.x, y: h.y };
    return h;
  };
  const distractors = (n, type, extra) => {
    for (let i = 0; i < n; i++) {
      const x = clampX(cur.x + rng.range(-70, 70), cur.y);
      const y = cur.y + rng.range(-24, 30);
      if (!tooClose(x, y)) addHold(x, y, type === 'route' ? rockType() : type, extra);
    }
  };
  const placeLedge = (kind, wMin, wMax, extra) => {
    const w = rng.range(wMin, wMax);
    const ly = cur.y + rng.range(30, 48);
    const off = rng.range(-w * 0.4, w * 0.4);
    let x1 = cur.x - w / 2 + off;
    x1 = clamp(x1, centerAt(ly) - halfAt(ly) + 20, centerAt(ly) + halfAt(ly) - 20 - w);
    // guarantee the approach hold sits under the ledge
    if (cur.x < x1 + 10) x1 = cur.x - 10;
    if (cur.x > x1 + w - 10) x1 = cur.x - w + 10;
    const l = addLedge(x1, x1 + w, ly, kind, extra);
    route.push({ kind: 'ledge', id: l.id });
    return l;
  };
  const leaveLedge = (l) => {
    const x = clamp(rng.range(l.x1 + 20, l.x2 - 20), l.x1 + 10, l.x2 - 10);
    const y = l.y + rng.range(42, Math.min(66, STAND_REACH - 8));
    return pushHold({ x: clampX(x, y), y }, rockType());
  };

  const summitTarget = height - 60;
  let guard = 0;
  while (cur.y < summitTarget && guard++ < 4000) {
    if (campCursor < campYs.length && cur.y > campYs[campCursor] - 70) {
      const l = placeLedge('camp', 280, 320, { campIndex: campCursor + 1, sheltered: true });
      campCursor++;
      leaveLedge(l);
      continue;
    }
    const kind = rng.weighted([
      ['face', 3], ['traverse', p.traverse * 10], ['chimney', p.chimney * 10], ['overhang', p.overhang * 10],
      ['ice', p.ice * 10], ['ledge', 1.6], ['lunge', p.lunge * 10 * lungeScale],
    ]);
    const y1 = cur.y;
    if (kind === 'face') {
      const n = rng.int(4, 8);
      for (let i = 0; i < n; i++) { pushHold(step(), rockType()); distractors(rng.int(0, 2), 'route'); }
    } else if (kind === 'traverse') {
      const dir = cur.x > centerAt(cur.y) ? -1 : 1;
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) { pushHold(step({ dyMin: -4, dyMax: 22, dxMax: 14, dirBias: dir * 52 }), rockType()); distractors(rng.int(0, 1), 'route'); }
    } else if (kind === 'chimney') {
      const cx = clampX(cur.x, cur.y, 90);
      const n = rng.int(5, 8);
      let side = rng.chance(0.5) ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const tx = cx + side * 42;
        const dy = rng.range(26, 40);
        const dx = tx - cur.x;
        const len = Math.hypot(dx, dy);
        const k = len > SAFE_STEP ? SAFE_STEP / len : 1;
        pushHold({ x: cur.x + dx * k, y: cur.y + dy * k }, 'jug', { chimney: true });
        side = -side;
      }
      features.push({ type: 'chimney', x1: cx - 64, x2: cx + 64, y1: y1 - 10, y2: cur.y + 30 });
    } else if (kind === 'overhang') {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) pushHold(step({ dyMin: 24, dyMax: 44 }), rockType(), { overhang: true });
      const fx = cur.x;
      features.push({ type: 'overhang', x1: fx - rng.range(90, 140), x2: fx + rng.range(90, 140), y1: y1 + 8, y2: cur.y + 16 });
      // the roof lip is a good place for a rest ledge
      if (rng.chance(0.6)) { const l = placeLedge('rock', 90, 150); leaveLedge(l); }
    } else if (kind === 'ice') {
      const n = rng.int(4, 7);
      let lastThin = false;
      for (let i = 0; i < n; i++) {
        const thin = !lastThin && rng.chance(p.thin);
        pushHold(step(), thin ? 'thin' : 'ice');
        lastThin = thin;
        if (rng.chance(0.4)) distractors(1, 'ice');
      }
      features.push({ type: 'ice', x1: cur.x - 120, x2: cur.x + 120, y1: y1 - 20, y2: cur.y + 30 });
    } else if (kind === 'ledge') {
      const snowy = rng.chance(p.snow);
      const l = placeLedge(snowy ? 'snow' : 'rock', 110, 240);
      if (snowy && l.x2 - l.x1 > 170 && rng.chance(p.crevasse)) {
        const cw = rng.range(34, 46);
        const cx = rng.range(l.x1 + 60, l.x2 - 60 - cw);
        l.crevasse = { x1: Math.round(cx), x2: Math.round(cx + cw), stress: 0, open: false };
      }
      l.sheltered = rng.chance(0.3);
      leaveLedge(l);
    } else if (kind === 'lunge' && lungeScale > 0) {
      const d = rng.range(REACH * 1.12, LUNGE * 0.78);
      const ang = rng.range(-0.45, 0.45);
      const x = clampX(cur.x + Math.sin(ang) * d, cur.y);
      const dy = Math.sqrt(Math.max(0, d * d - (x - cur.x) ** 2));
      pushHold({ x, y: cur.y + Math.max(40, dy) }, 'jug', { lungeTarget: true });
      // a safe alternative: a hold half way, but only on the gentler profile
    }
  }
  const summit = placeLedge('summit', 220, 260);
  const routeHeight = summit.y;

  // Hazard zones
  const zones = [];
  const zoneStep = 900;
  for (let y = 600; y < routeHeight - 300; y += zoneStep) {
    if (rng.chance(p.rockfall)) zones.push({ type: 'rockfall', y1: y, y2: y + rng.range(400, 700) });
    if (y > routeHeight * 0.25 && rng.chance(p.avalanche)) zones.push({ type: 'avalanche', y1: y + 200, y2: y + rng.range(500, 800) });
  }

  // Wall outline
  const wall = buildWall(holds, ledges, features, routeHeight, centerAt, halfAt);

  // Camp supplies
  const campList = ledges.filter((l) => l.kind === 'camp').sort((a, b) => a.y - b.y).map((l) => ({
    ledgeId: l.id, index: l.campIndex, y: l.y,
    supplies: l.campIndex === 0 ? { oxygen: 0, food: 0, pitons: 0 } : {
      oxygen: Math.max(1, Math.round((1 + rng.int(0, 1)) * supplies)),
      food: Math.max(1, Math.round((1 + rng.int(0, 2)) * supplies)),
      pitons: Math.max(1, Math.round((2 + rng.int(0, 2)) * supplies)),
    },
  }));

  holds.sort((a, b) => a.y - b.y);
  ledges.sort((a, b) => a.y - b.y);
  return { seed, height: routeHeight, holds, ledges, features, zones, wall, camps: campList, route, summitId: summit.id, baseId: base.id };
}

function buildWall(holds, ledges, features, top, centerAt, halfAt) {
  const n = Math.ceil((top + 400) / WALL_SAMPLE) + 1;
  const y0 = -300;
  const left = new Float32Array(n), right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = y0 + i * WALL_SAMPLE;
    const c = centerAt(y), hw = halfAt(y);
    left[i] = c - hw; right[i] = c + hw;
  }
  const widen = (x1, x2, y, m) => {
    const i = Math.round((y - y0) / WALL_SAMPLE);
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) {
      if (x1 - m < left[j]) left[j] = x1 - m;
      if (x2 + m > right[j]) right[j] = x2 + m;
    }
  };
  for (const h of holds) widen(h.x, h.x, h.y, 50);
  for (const l of ledges) widen(l.x1, l.x2, l.y, 26);
  for (const f of features) widen(f.x1, f.x2, (f.y1 + f.y2) / 2, 10);
  // Taper into a summit pinnacle and smooth
  const summitL = ledges.find((l) => l.kind === 'summit');
  const sc = summitL ? (summitL.x1 + summitL.x2) / 2 : 0;
  for (let i = 0; i < n; i++) {
    const y = y0 + i * WALL_SAMPLE;
    if (y > top - 40) {
      const k = clamp((y - (top - 40)) / 140, 0, 1);
      const kk = k * k;
      left[i] = left[i] + (sc - 4 - left[i]) * kk;
      right[i] = right[i] + (sc + 4 - right[i]) * kk;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 1; i++) {
      left[i] = Math.min(left[i], (left[i - 1] + left[i] * 2 + left[i + 1]) / 4);
      right[i] = Math.max(right[i], (right[i - 1] + right[i] * 2 + right[i + 1]) / 4);
    }
  }
  return { y0, step: WALL_SAMPLE, left, right, top: top + 100 };
}

export function wallEdgesAt(wall, y) {
  const f = (y - wall.y0) / wall.step;
  const i = clamp(Math.floor(f), 0, wall.left.length - 2);
  const t = clamp(f - i, 0, 1);
  return [wall.left[i] + (wall.left[i + 1] - wall.left[i]) * t, wall.right[i] + (wall.right[i + 1] - wall.right[i]) * t];
}

/** Index of first element with y >= v in a y-sorted array. */
export function lowerBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].y < v) lo = m + 1; else hi = m; }
  return lo;
}
export function holdsInRange(terrain, y1, y2, out = []) {
  out.length = 0;
  const hs = terrain.holds;
  for (let i = lowerBound(hs, y1); i < hs.length && hs[i].y <= y2; i++) out.push(hs[i]);
  return out;
}
export function ledgesInRange(terrain, y1, y2, out = []) {
  out.length = 0;
  for (const l of terrain.ledges) if (l.y >= y1 && l.y <= y2) out.push(l);
  return out;
}

/**
 * Reachability check over holds and ledges (used by tests and as a sanity
 * check). A lunge allowance of 0 means only static reaches count.
 */
export function isClimbable(terrain, { reach = REACH, lunge = LUNGE, standReach = STAND_REACH } = {}) {
  const maxD = Math.max(reach, lunge);
  const nodes = [...terrain.holds.map((h) => ({ t: 'h', o: h })), ...terrain.ledges.map((l) => ({ t: 'l', o: l }))];
  const startIdx = nodes.findIndex((n) => n.t === 'l' && n.o.id === terrain.baseId);
  const goalId = terrain.summitId;
  const seen = new Uint8Array(nodes.length);
  const queue = [startIdx];
  seen[startIdx] = 1;
  const canGo = (a, b) => {
    if (a.t === 'h' && b.t === 'h') return Math.hypot(a.o.x - b.o.x, a.o.y - b.o.y) <= maxD;
    if (a.t === 'h' && b.t === 'l') {
      const dy = b.o.y - a.o.y;
      return dy >= -reach && dy <= reach && a.o.x >= b.o.x1 - 30 && a.o.x <= b.o.x2 + 30;
    }
    if (a.t === 'l' && b.t === 'h') {
      const dy = b.o.y - a.o.y;
      const inX = b.o.x >= a.o.x1 - 30 && b.o.x <= a.o.x2 + 30;
      if (inX && dy >= -reach * 0.6 && dy <= standReach) return true;
      const px = clamp(b.o.x, a.o.x1, a.o.x2);
      return lunge > reach && Math.hypot(b.o.x - px, b.o.y - (a.o.y + 30)) <= lunge;
    }
    return false;
  };
  while (queue.length) {
    const ai = queue.shift();
    const a = nodes[ai];
    if (a.t === 'l' && a.o.id === goalId) return true;
    const ay = a.o.y;
    for (let i = 0; i < nodes.length; i++) {
      if (seen[i]) continue;
      const b = nodes[i];
      if (Math.abs(b.o.y - ay) > maxD + 40) continue;
      if (canGo(a, b)) { seen[i] = 1; queue.push(i); }
    }
  }
  return false;
}
