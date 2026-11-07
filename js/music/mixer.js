import { clamp, smoothstep } from '../engine/math.js';

/**
 * Pure mapping from what is happening on screen to stem levels and colour.
 * Every output is 0..1 except tempo (bpm).
 */
export function computeMix(s) {
  const scene = s.scene || 'climb';
  const alt = clamp(s.altitude ?? 0);
  const stamina = clamp(s.stamina ?? 1);
  const danger = clamp(s.danger ?? 0);
  const storm = clamp(s.storm ?? 0);
  const night = clamp(s.night ?? 0);
  const hypoxia = clamp(s.hypoxia ?? 0);
  const climbing = scene === 'climb';
  const camp = scene === 'camp' ? 1 : 0;
  const summit = scene === 'summit' ? 1 : 0;
  const ended = scene === 'end' ? 1 : 0;
  const title = scene === 'title' || scene === 'menu' ? 1 : 0;

  const exhaustion = climbing ? smoothstep(0.5, 0.08, stamina) : 0;
  const tension = clamp(Math.max(danger, exhaustion * 0.85, hypoxia * 0.6) * (1 - camp) * (1 - summit));

  const drone = clamp(0.5 + alt * 0.25 + summit * 0.25 - ended * 0.15 + title * 0.05);
  const melody = clamp(title * 0.75 + climbing * (0.55 - storm * 0.3 - tension * 0.35) + camp * 0.45 + summit * 0.9 + ended * 0.4, 0, 1);
  const pulse = climbing ? clamp(exhaustion * 0.9 + danger * 0.5) : 0;
  const stormLvl = clamp(storm * (camp ? 0.35 : 0.95) * (1 - summit * 0.8));
  const warmth = clamp(camp + summit * 0.8);
  const brightness = clamp(0.22 + alt * 0.5 + summit * 0.35 + camp * 0.1 - storm * 0.15 - night * 0.08 - tension * 0.1);
  const upper = clamp(alt * 0.8 + summit * 0.5 - storm * 0.2);
  const density = clamp(0.35 + summit * 0.4 + title * 0.1 - tension * 0.25 + camp * 0.1);
  const tempo = 52 + exhaustion * 52 + danger * 26;
  return { drone, melody, pulse, storm: stormLvl, warmth, brightness, upper, tension, density, tempo, major: summit || camp ? 1 : 0 };
}
