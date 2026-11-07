// Temporary look-dev bootstrap; replaced by the full game wiring.
import { Assets } from './engine/assets.js';
import { Camera } from './engine/camera.js';
import { Renderer, VIEW_W, VIEW_H } from './render/renderer.js';
import { timeState } from './render/palette.js';
import { generateTerrain } from './game/terrain.js';
import { PEAKS } from './game/peaks.js';

const q = new URLSearchParams(location.search);
const assets = await new Assets().load();
const canvas = document.getElementById('game');
const r = new Renderer(canvas, assets);
const stage = document.getElementById('stage');
const fit = () => { const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H); stage.style.width = VIEW_W * s + 'px'; stage.style.height = VIEW_H * s + 'px'; stage.style.setProperty('--u', s + 'px'); r.setScale(Math.min(2, s * devicePixelRatio), 2); };
const peak = PEAKS[+(q.get('peak') || 0)];
const terrain = generateTerrain({ seed: 'look', height: peak.height, camps: peak.camps, profile: peak.profile });
r.setWorld(peak, terrain, 'look');
fit(); addEventListener('resize', fit);
const cam = new Camera(VIEW_W, VIEW_H);
const startY = +(q.get('y') || 200);
cam.y = startY; cam.x = 0;
document.getElementById('loading').classList.add('done');
let t = 0;
const hour = +(q.get('hour') || 6.2);
const snow = +(q.get('snow') || 0.3);
function frame() {
  t += 1 / 60;
  const ts = timeState(hour, peak);
  const prog = cam.y / terrain.height;
  r.render({ cam, ts, time: t, dt: 1 / 60, progress: prog, weather: { snow, wind: 20, sleet: 0, whiteout: 0, fog: 0.2 }, frost: +(q.get('frost') || 0), vignette: 0.5, vignetteTight: 0, lantern: { on: true, x: 480, y: 300, radius: 180, intensity: ts.dark }, perspective: true, mode: 'title' });
  requestAnimationFrame(frame);
}
frame();
