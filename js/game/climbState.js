/**
 * Top-level flow of the game and the outcome rules of a climb. Pure.
 *
 * App scenes: title -> select -> climb <-> (paused | camp | prompt) -> end -> title
 * Climb states: climbing <-> camp ; climbing|camp -> summit | retreat | fallen
 */
export const CLIMB_TRANSITIONS = {
  climbing: ['camp', 'summit', 'retreat', 'fallen'],
  camp: ['climbing', 'retreat', 'fallen'],
  summit: [], retreat: [], fallen: [],
};

/** Returns the next climb state for an outcome, or the current one if not allowed. */
export function nextOutcomeState(current, outcome) {
  return (CLIMB_TRANSITIONS[current] || []).includes(outcome) ? outcome : current;
}

export const SCENE_TRANSITIONS = {
  boot: ['title'],
  title: ['select', 'settings', 'journal', 'credits', 'climb'],
  select: ['title', 'climb'],
  settings: ['title', 'paused', 'camp'],
  journal: ['title', 'end'],
  credits: ['title'],
  climb: ['paused', 'camp', 'prompt', 'end', 'pack'],
  paused: ['climb', 'settings', 'title', 'climb'],
  pack: ['climb'],
  prompt: ['climb', 'end'],
  camp: ['climb', 'end', 'settings'],
  end: ['title', 'select', 'journal', 'climb'],
};

export function canTransition(from, to) {
  return (SCENE_TRANSITIONS[from] || []).includes(to);
}

/** Journal note for a finished climb. */
export function epitaph(s) {
  const alt = `${Math.round(s.altitude).toLocaleString('en-US')} m`;
  if (s.outcome === 'summit') return s.falls === 0 ? `A clean ascent. The ${s.peakName} summit at ${alt}, not a single fall.` : `Summit at ${alt} after ${s.falls} fall${s.falls === 1 ? '' : 's'}. The view was worth every one.`;
  if (s.outcome === 'retreat') {
    const why = { oxygen: 'as the last bottle ran dry', health: 'too hurt to go on', food: 'with nothing left to eat', storm: 'ahead of the storm', choice: 'by choice, with all fingers intact' };
    const key = Object.keys(why).find((k) => (s.cause || '').startsWith(k)) || 'choice';
    return `Turned back at ${alt}, ${why[key]}. The mountain will still be there.`;
  }
  const how = { fall: 'The rope was too far below.', rockfall: 'The stone came without a second warning.', hypoxia: 'The thin air took the last of it.', cold: 'The cold settled in and stayed.' };
  return `Lost at ${alt}. ${how[s.cause] || 'The mountain kept this one.'}`;
}
