import { Climb } from '../../js/game/climb.js';

/** A route-following climber used to prove generated routes are fair end to end. */
export function runBot(peak, difficulty, seed, maxSeconds = 1200) {
  const c = new Climb({ peak, difficulty, seed });
  const T = c.terrain;
  const byId = new Map();
  for (const h of T.holds) byId.set(h.id, { k: 'hold', o: h });
  for (const l of T.ledges) byId.set(l.id, { k: 'ledge', o: l });
  const route = T.route.map((r) => byId.get(r.id));
  let idx = 0, lastPlacedY = 0;
  for (let i = 0; i < 60 * maxSeconds; i++) {
    const p = c.player;
    const intent = { dir: { x: 0, y: 0 } };
    for (let j = idx; j < Math.min(route.length, idx + 6); j++) {
      const n = route[j];
      if ((n.k === 'hold' && p.hold === n.o) || (n.k === 'ledge' && p.ledge === n.o)) idx = j;
    }
    const next = route[idx + 1];
    if ((p.state === 'hang' || p.state === 'stand') && next) {
      if (p.state === 'stand' && p.stamina < p.maxStamina * 0.95) { /* rest */ }
      else if (p.state === 'hang' && p.y - lastPlacedY > 140 && c.resources.pitons > 0) { intent.pitonPressed = true; lastPlacedY = p.y; }
      else {
        const tx = next.k === 'hold' ? next.o.x : Math.min(Math.max(p.x, next.o.x1 + 10), next.o.x2 - 10);
        const ty = next.k === 'hold' ? next.o.y : next.o.y + 20;
        const dx = tx - (p.state === 'stand' ? p.x : p.handsX), dy = ty - p.handsY;
        const d = Math.hypot(dx, dy);
        if (p.state === 'stand' && next.k === 'hold' && Math.abs(next.o.x - p.x) > 30) intent.dir.x = Math.sign(next.o.x - p.x);
        else {
          intent.dir = { x: dx / d, y: dy / d };
          if (d > 76 && p.state === 'hang') intent.jumpPressed = true;
          if (p.state === 'stand' && next.k === 'hold' && next.o.y - p.y > 80) intent.jumpPressed = true;
        }
      }
    }
    if (p.state === 'hang' && p.stamina < 25 && c.anchors.length > 1 && Math.hypot(c.lastAnchor.x - p.x, c.lastAnchor.y - p.harnessY) < 48) intent.dir = { x: 0, y: -1 };
    if (p.state === 'roped' && p.stamina < p.maxStamina * 0.9) intent.dir = { x: 0, y: 0 };
    if (p.state === 'lunge' && p.lunge && Math.abs(p.lunge.t - p.lunge.T) < 0.03) intent.jumpPressed = true;
    if (p.stamina < 12 && c.resources.food > 0) intent.eatPressed = true;
    if (c.resources.oxygen.level <= 0 && c.resources.oxygen.spares > 0) intent.oxygenPressed = true;
    intent.jumpHeld = intent.jumpPressed;
    // stand still on weak snow bridges is the bot's one bad habit: hop them
    if (p.state === 'stand' && p.ledge && p.ledge.crevasse && !p.ledge.crevasse.open && p.x > p.ledge.crevasse.x1 - 12 && p.x < p.ledge.crevasse.x2 + 12) intent.dir.x = intent.dir.x || 1;
    c.update(1 / 60, intent);
    c.events.length = 0;
    if (c.state === 'camp') { c.campRest(1); c.leaveCamp(); }
    if (c.state !== 'climbing' && c.state !== 'camp') break;
  }
  return c;
}
