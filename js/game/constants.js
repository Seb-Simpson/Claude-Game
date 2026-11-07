/** Tuning constants. World units are "px" in a y-up world. */
export const REACH = 76;          // max hold-to-hold reach
export const LUNGE = 150;         // max dyno distance
export const STAND_REACH = 80;    // feet-to-hold reach when standing on a ledge
export const PLAYER_H = 38;
export const GRAVITY = 900;
export const WALK_SPEED = 70;
export const FALL_SAFE = 70;      // falls shorter than this cost nothing
export const FALL_FATAL = 430;    // unroped falls longer than this are fatal
export const ROPE_LENGTH = 700;   // px of rope carried per pitch (between camps)
export const ROPE_SLACK = 14;
export const GAME_MINUTES_PER_SECOND = 1; // 1 real second = 1 in-game minute

export const DIFFICULTY = {
  gentle: { id: 'gentle', label: 'Gentle', drain: 0.72, weather: 0.65, fallDamage: 0.55, catchWindow: 0.26, pitons: 10, food: 4, oxygen: 3, lunge: 0, hazard: 0.55, supplies: 1.4 },
  standard: { id: 'standard', label: 'Standard', drain: 1, weather: 1, fallDamage: 1, catchWindow: 0.17, pitons: 7, food: 3, oxygen: 2, lunge: 1, hazard: 1, supplies: 1 },
  harsh: { id: 'harsh', label: 'Harsh', drain: 1.3, weather: 1.35, fallDamage: 1.45, catchWindow: 0.12, pitons: 5, food: 2, oxygen: 2, lunge: 1.5, hazard: 1.45, supplies: 0.7 },
};
export const getDifficulty = (id) => DIFFICULTY[id] || DIFFICULTY.standard;
