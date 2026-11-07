import { Assets } from './engine/assets.js';
import { Camera } from './engine/camera.js';
import { Input } from './engine/input.js';
import { createLoop } from './engine/loop.js';
import { AudioEngine } from './engine/audio.js';
import { clamp, approach } from './engine/math.js';
import { Renderer, VIEW_W, VIEW_H } from './render/renderer.js';
import { timeState } from './render/palette.js';
import { Score } from './music/score.js';
import { Ambience } from './music/ambience.js';
import { Sfx } from './music/sfx.js';
import { playStinger } from './music/stingers.js';
import { generateTerrain } from './game/terrain.js';
import { PEAKS, getPeak, dailyPeak } from './game/peaks.js';
import { Climb } from './game/climb.js';
import { FALL_SAFE } from './game/constants.js';
import { epitaph } from './game/climbState.js';
import { createStorage, DEFAULT_SETTINGS } from './storage.js';
import { UI } from './ui/ui.js';
import { titleScreen, creditsScreen } from './ui/title.js';
import { selectScreen } from './ui/peakSelect.js';
import { settingsScreen } from './ui/settings.js';
import { journalScreen } from './ui/journal.js';
import { pauseScreen, campScreen, turnBackScreen, packScreen, confirmScreen } from './ui/overlays.js';
import { endScreen } from './ui/endScreens.js';
import { Hud } from './ui/hud.js';
import { Captions } from './ui/captions.js';
import { TouchControls } from './ui/touch.js';
import { Transitions } from './ui/transitions.js';

const QUALITY = { low: 0, medium: 1, high: 2 };
const MAX_SCALE = [1, 1.5, 2];
const TITLE_PEAK = PEAKS[1];

class App {
  async boot() {
    this.stage = document.getElementById('stage');
    this.storage = createStorage();
    this.settings = this.storage.loadSettings();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorageHas(this.storage)) this.settings.reducedMotion = true;
    if (matchMedia('(pointer: coarse)').matches && !localStorageHas(this.storage)) this.settings.quality = 'medium';
    this.input = new Input();
    this.audio = new AudioEngine();
    this.score = new Score(this.audio);
    this.ambience = new Ambience(this.audio);
    this.sfx = new Sfx(this.audio);
    this.captions = new Captions(document.getElementById('captions'));
    this.audio.onCaption = (t) => this.captions.show(t);
    this.ui = new UI(document.getElementById('ui'), this.sfx);
    this.ui.capturing = () => !!this.input.onAnyKey;
    this.touch = new TouchControls(document.getElementById('touch'), this.input);
    this.transitions = new Transitions(document.getElementById('fx'));
    this.camera = new Camera(VIEW_W, VIEW_H);

    const bar = document.querySelector('.load-bar span');
    this.assets = await new Assets().load('assets/sprites/', (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
    this.renderer = new Renderer(document.getElementById('game'), this.assets);
    this.hud = new Hud(this.assets);
    this.ts = {};
    this.time = 0;
    this.scene = 'title';
    this.climb = null;
    this.ending = null;
    this.flashT = 0;

    this.applySettings();
    this.fit();
    addEventListener('resize', () => this.fit());
    this.setWorld(TITLE_PEAK, 'snowline-title');
    this.camera.y = 900; this.camera.zoom = 1.05;
    this.titleHour = 19.9;

    const unlock = () => {
      if (this.audio.unlock()) {
        this.applyVolumes();
        this.score.setKey(TITLE_PEAK.key.root, TITLE_PEAK.key.mode, 'title');
      }
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, unlock, { capture: true });
    addEventListener('blur', () => this.onFocusLost());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.onFocusLost(); this.audio.suspend(); } else this.audio.resume();
    });

    this.loop = createLoop({ update: (dt) => this.update(dt), render: (a, dt) => this.render(dt) });
    this.loop.start();
    document.getElementById('loading').classList.add('done');
    this.showTitle(true);
  }

  // ---------- settings ----------
  fit() {
    const s = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
    this.stage.style.width = `${Math.floor(VIEW_W * s)}px`;
    this.stage.style.height = `${Math.floor(VIEW_H * s)}px`;
    this.stage.style.setProperty('--u', `${s}px`);
    const q = QUALITY[this.settings.quality] ?? 2;
    const scale = clamp(s * (devicePixelRatio || 1), 0.5, MAX_SCALE[q]);
    this.renderer.setScale(Math.round(scale * 4) / 4, q);
  }
  applySettings() {
    const s = this.settings;
    this.input.setBindings(s.bindings);
    this.camera.shakeEnabled = s.screenShake && !s.reducedMotion;
    this.captions.enabled = s.subtitles;
    if (!s.subtitles) this.captions.clear();
    this.ui.reduced = s.reducedMotion;
    document.body.classList.toggle('reduced', s.reducedMotion);
    this.applyVolumes();
    if (this.renderer) this.fit();
  }
  applyVolumes() { for (const k in this.settings.volumes) this.audio.setVolume(k, this.settings.volumes[k]); }
  saveSettings() { this.storage.saveSettings(this.settings); }
  resetSettings() {
    const keep = { lastPeak: this.settings.lastPeak, difficulty: this.settings.difficulty };
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...keep };
    this.applySettings();
    this.saveSettings();
  }
  previewBus(bus) {
    if (bus === 'ui') this.sfx.ui('select');
    else if (bus === 'sfx') this.sfx.pick('rock');
    else if (bus === 'ambience') this.sfx.rumble(1.2, 0.3, null);
  }

  setWorld(peak, seed, terrain) {
    this.worldPeak = peak;
    this.worldTerrain = terrain || generateTerrain({ seed, height: peak.height, camps: peak.camps, profile: peak.profile });
    this.renderer.setWorld(peak, this.worldTerrain, seed);
  }

  // ---------- screens ----------
  showTitle(first) {
    this.scene = 'title';
    this.ui.replace(titleScreen(this), {});
    if (!first) this.score.setKey(TITLE_PEAK.key.root, TITLE_PEAK.key.mode, 'title');
  }
  openSelect() { this.ui.push(selectScreen(this), { onBack: () => { this.ui.pop(); this.previewPeak(TITLE_PEAK, true); } }); }
  previewPeak(peak, immediate) {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      if (this.scene !== 'title' || this.worldPeak === peak) return;
      this.setWorld(peak, peak === TITLE_PEAK ? 'snowline-title' : 'preview:' + peak.id);
    }, immediate ? 0 : 160);
  }
  openSettings() { this.ui.push(settingsScreen(this), { onBack: () => { this.input.onAnyKey = null; this.ui.pop(); } }); }
  openJournal() { this.ui.push(journalScreen(this), { onBack: () => this.ui.pop() }); }
  openCredits() { this.ui.push(creditsScreen(this), { onBack: () => this.ui.pop() }); }

  startClimb(peak, difficulty, checkpoint) {
    this.transitions.run('snow', 2.0, () => {
      this.ui.clear(true);
      this.climb = new Climb({ peak, difficulty, seed: checkpoint ? checkpoint.seed : `${peak.daily ? 'daily:' + peak.daily : peak.id}:${Date.now().toString(36)}` });
      this.renderer.setWorld(peak, this.climb.terrain, this.climb.seed);
      this.worldPeak = peak;
      this.score.setKey(peak.key.root, peak.key.mode, this.climb.seed);
      this.ending = null;
      this.hud.toasts.length = 0;
      this.hud.setForecast(null);
      this.scene = 'climb';
      const p = this.climb.player;
      this.camera.x = p.x * 0.6; this.camera.y = p.y + 60; this.camera.zoom = 1.3;
      if (checkpoint) this.restoreCheckpoint(checkpoint);
      else this.hud.toast(`${peak.name} · Base camp · ${this.climb.diff.label}`, 'info', 4);
    }, this.settings.reducedMotion);
  }
  continueClimb() {
    const cp = this.storage.loadCheckpoint();
    if (!cp) return;
    const peak = cp.daily ? dailyPeak(new Date(cp.daily)) : getPeak(cp.peak);
    this.startClimb(peak, cp.difficulty, cp);
  }
  saveCheckpoint() {
    const c = this.climb;
    if (!c || !c.currentCamp) return;
    this.storage.saveCheckpoint({
      peak: c.peak.id, daily: c.peak.daily || null, difficulty: c.diff.id, seed: c.seed,
      camp: c.currentCamp.ledgeId, resources: c.resources,
      camps: c.camps.map((cp) => ({ supplies: cp.supplies, visited: cp.visited })),
      hour: c.hour, day: c.day, time: c.time, stats: c.stats, campIndex: c.campIndex,
      player: { health: c.player.health, fatigue: c.player.fatigue, hypoxia: c.player.hypoxia },
    });
  }
  restoreCheckpoint(cp) {
    const c = this.climb;
    try {
      c.resources = cp.resources;
      cp.camps.forEach((s, i) => { if (c.camps[i]) Object.assign(c.camps[i], s); });
      Object.assign(c, { hour: cp.hour, day: cp.day, time: cp.time, campIndex: cp.campIndex });
      Object.assign(c.stats, cp.stats);
      Object.assign(c.player, cp.player);
      const ledge = c.terrain.ledges.find((l) => l.id === cp.camp);
      if (ledge) {
        c.player.ledge = ledge; c.player.x = (ledge.x1 + ledge.x2) / 2; c.player.y = ledge.y;
        this.camera.x = c.player.x * 0.6; this.camera.y = ledge.y + 60;
        this.score.setLift(c.campIndex);
        c.enterCamp(ledge);
      }
    } catch { this.hud.toast('The old camp could not be found', 'warn'); }
  }

  pause() {
    if (this.scene !== 'climb' || this.ui.active || this.ending) return;
    this.audio.setDucked(true);
    this.ui.push(pauseScreen(this), { onBack: () => this.resume() });
  }
  resume() {
    this.ui.pop();
    if (!this.ui.active) this.audio.setDucked(false);
  }
  onFocusLost() {
    this.input.releaseAll();
    if (this.scene === 'climb' && !this.ui.active && !this.ending) this.pause();
  }
  restart(fromEnd) {
    const c = this.climb;
    if (!c) return;
    const go = () => { this.audio.setDucked(false); this.startClimb(c.peak, c.diff.id, null); };
    if (fromEnd) { go(); return; }
    this.ui.push(confirmScreen(this, 'Restart the climb?', 'You will start again from base camp on a new route.', 'Restart', go), { onBack: () => this.ui.pop() });
  }
  quitToTitle() {
    const go = () => {
      this.transitions.run('white', 1.6, () => {
        this.ui.clear(true);
        this.audio.setDucked(false);
        this.climb = null;
        this.ending = null;
        this.setWorld(TITLE_PEAK, 'snowline-title');
        this.camera.y = 900; this.camera.zoom = 1.05; this.camera.x = 0;
        this.showTitle();
      }, this.settings.reducedMotion);
    };
    if (this.ending) { go(); return; }
    this.ui.push(confirmScreen(this, 'Quit to title?', 'Progress since your last camp will be lost. You can continue from that camp later.', 'Quit', go), { onBack: () => this.ui.pop() });
  }
  openPack() {
    if (this.ui.active || this.ending) return;
    this.ui.push(packScreen(this), { onBack: () => this.ui.pop() });
  }
  leaveCamp() {
    this.ui.pop();
    this.climb.leaveCamp();
  }
  onRest() { this.sfx.ui('select'); }
  confirmRetreat(reason) {
    this.ui.push(confirmScreen(this, 'Descend from here?', 'The climb ends as a retreat at your highest point. It is a valid way down.', 'Descend', () => this.retreat(reason)), { onBack: () => this.ui.pop() });
  }
  retreat(reason) {
    this.ui.clear(true);
    this.climb.retreat(reason);
  }

  // ---------- climb events ----------
  handleEvents() {
    const c = this.climb;
    const r = this.renderer;
    for (const e of c.events) {
      switch (e.type) {
        case 'step': this.sfx.footstep(e.surface, 0.7); break;
        case 'hop': this.sfx.footstep('rock', 1); break;
        case 'grab': this.sfx.grab(e.surface); if (e.surface === 'jug' || e.surface === 'crimp') r.burst('chips', e.x, e.y, 2, { speed: 20 }); break;
        case 'brushSnow': case 'shakeSnow': r.burst('snow', e.x, e.y, 6, { speed: 25 }); break;
        case 'land':
          if (e.dist > FALL_SAFE) {
            const s = clamp(e.dist / 300);
            this.sfx.impact(s, e.surface); this.camera.shake(0.6 + s * 1.6); r.doFlash('#ffffff', 0.12 + s * 0.2);
            r.burst(e.surface === 'snow' ? 'snow' : 'dust', e.x, e.y + 2, 12, { speed: 60 });
            if (e.dmg) this.hud.toast(`A hard landing · −${e.dmg}% condition`, 'warn');
          } else this.sfx.footstep(e.surface, e.soft ? 0.8 : 1.2);
          break;
        case 'lunge': this.sfx.whoosh(0.45); break;
        case 'catch': this.sfx.pick('rock'); break;
        case 'nearCatch': this.sfx.pick('rock'); playStinger(this.audio, this.score, 'nearmiss'); this.hud.toast('By the fingertips.'); break;
        case 'miss': this.hud.toast('Missed!', 'warn', 1.4); break;
        case 'fall': this.sfx.whoosh(1.3); playStinger(this.audio, this.score, 'fall'); this.camera.shake(0.4); break;
        case 'slip': this.hud.toast('Your grip gives out', 'warn'); break;
        case 'ropeCatch':
          this.sfx.ropeCreak(1); this.sfx.impact(0.35); playStinger(this.audio, this.score, 'rope'); this.camera.shake(1.2);
          this.hud.toast(e.dmg ? `The rope holds · −${e.dmg}% condition` : 'The rope holds', e.dmg ? 'warn' : 'info');
          break;
        case 'arrest': this.sfx.pick('rock'); playStinger(this.audio, this.score, 'nearmiss'); this.hud.toast('Caught a hold!'); break;
        case 'restOnRope': this.sfx.ropeCreak(0.5); this.hud.toast('Resting on the rope'); break;
        case 'ropeCreak': this.sfx.ropeCreak(e.amount); break;
        case 'pitonStrike': this.sfx.piton(e.strike); r.burst('spark', e.x, e.y, 4); r.burst('chips', e.x, e.y, 3); break;
        case 'anchor': this.sfx.clip(); playStinger(this.audio, this.score, 'anchor'); this.hud.toast(`Piton placed · ${c.resources.pitons} left`); break;
        case 'noPitons': this.hud.toast('No pitons left', 'warn'); break;
        case 'ropeOut': this.hud.toast('Rope run out: you are unprotected', 'warn', 3.5); this.sfx.ropeCreak(0.8); break;
        case 'creak': this.sfx.snowCreak(e.level); break;
        case 'crevasse': this.sfx.impact(0.3, 'snow'); this.sfx.rumble(1.5, 0.3, null); r.burst('snow', e.x, e.y, 18, { speed: 70 }); this.hud.toast('The snow bridge collapses! Grip!', 'warn'); this.camera.shake(1); break;
        case 'iceCrack': this.sfx.iceCrack(e.level); r.burst('ice', e.x, e.y, 3); break;
        case 'iceBreak': this.sfx.iceCrack(1); r.burst('ice', e.x, e.y, 14, { speed: 70 }); break;
        case 'breath':
          if (c.player.state !== 'dead') {
            this.sfx.breath(e.intensity, e.exhale);
            const cold = clamp(0.35 + c.weather.v.cold * 0.4 + c.nightness * 0.3 + c.progress * 0.3);
            if (e.exhale) for (let i = 0; i < 3; i++) r.breath(e.x, e.y, c.player.facing, cold);
          }
          break;
        case 'eat': this.sfx.eat(); this.hud.toast('You eat. Warmth spreads to your fingers.'); break;
        case 'noFood': this.hud.toast('Nothing left to eat', 'warn'); break;
        case 'oxygenSwap': this.sfx.oxygen(); this.hud.toast('Fresh bottle. The air comes back.'); break;
        case 'noOxygen': this.hud.toast('No spare oxygen', 'warn'); break;
        case 'oxygenNotEmpty': this.hud.toast('This bottle still has air'); break;
        case 'oxygenEmpty': this.hud.toast(e.spares ? 'Oxygen bottle empty: swap it' : 'Oxygen gone. The air is thin.', 'warn', 4); break;
        case 'forecast': this.hud.setForecast(e); playStinger(this.audio, this.score, 'forecast'); this.sfx.forecast(); if (e.worse) this.hud.toast(`${e.label} coming`, 'warn', 3.5); break;
        case 'weatherChange': this.hud.toast(e.label, 'info', 2.5); break;
        case 'gustWarn': if (e.power > 0.55) this.sfx.cap('[wind rising]', 'gust', 6); break;
        case 'rockWarn': this.sfx.pebbles(); r.burst('dust', e.x, c.player.y + 160, 6); break;
        case 'rockHit': this.sfx.rockCrash(); this.sfx.impact(0.5); this.camera.shake(1.5); r.doFlash('#ffffff', 0.25); this.hud.toast(`Struck by falling rock · −${e.dmg}%`, 'warn'); break;
        case 'rockShatter': this.sfx.rockCrash(); r.burst('chips', e.x, e.y, 10, { speed: 80 }); break;
        case 'nearMiss': playStinger(this.audio, this.score, 'nearmiss'); this.camera.shake(0.5); this.sfx.cap('[rock whistles past]', 'nm', 2); break;
        case 'knocked': this.hud.toast('Knocked off the wall!', 'warn'); break;
        case 'avalancheWarn': this.sfx.rumble(4.5, 0.55, '[avalanche above]'); this.camera.shake(0.6); this.hud.toast('Avalanche! Brace or get under cover', 'warn', 3.5); break;
        case 'avalancheFlow': this.sfx.rumble(3.5, 0.8, null); this.camera.shake(2); break;
        case 'birds': r.spawnBirds(); this.sfx.bird(); break;
        case 'distantAvalanche': r.distantAvalanche(); setTimeout(() => this.sfx.rumble(5, 0.18, '[distant avalanche]'), 2500); break;
        case 'campReached': playStinger(this.audio, this.score, 'camp'); this.score.setLift(e.index); break;
        case 'campEnter': this.saveCheckpoint(); this.ui.push(campScreen(this), { onBack: () => this.leaveCamp() }); break;
        case 'turnBack': this.ui.push(turnBackScreen(this, e), { onBack: () => this.ui.pop() }); break;
        case 'newDay': this.hud.toast(`Day ${e.day}`); break;
        case 'drop': this.sfx.footstep('rock', 0.5); break;
        case 'end': this.onEnd(e); break;
        default: break;
      }
    }
    c.events.length = 0;
  }

  onEnd(e) {
    const c = this.climb;
    const summary = c.summary();
    summary.note = epitaph(summary);
    const best = this.storage.best(summary.daily ? 'daily:' + summary.daily : summary.peak);
    this.storage.addEntry(summary);
    this.storage.clearCheckpoint();
    this.ending = { outcome: e.outcome, t: 0, hour: c.hourOfDay };
    this.ui.clear(true);
    if (e.outcome === 'summit') {
      playStinger(this.audio, this.score, 'summit');
      this.transitions.run('white', 2.6, () => {
        this.ending.cine = true;
        this.ending.hour = 4.9; // the sun comes up for you
      }, this.settings.reducedMotion);
      setTimeout(() => this.ui.push(endScreen(this, summary, best), {}), this.settings.reducedMotion ? 800 : 3800);
    } else {
      playStinger(this.audio, this.score, e.outcome === 'retreat' ? 'retreat' : 'death');
      if (e.outcome === 'fallen') { this.renderer.doFlash('#ffffff', 0.5); this.camera.shake(2); }
      setTimeout(() => this.ui.push(endScreen(this, summary, best), {}), 1800);
    }
  }

  // ---------- loop ----------
  update(dt) {
    this.time += dt;
    const input = this.input;
    input.pollGamepad();
    input.enabled = !this.ui.active;
    this.touch.setVisible(this.scene === 'climb' && !this.ui.active && !this.ending);
    if (this.ui.active) this.ui.handleInput(input);
    const c = this.climb;
    if (this.scene === 'climb' && c) {
      if (!this.ui.active && !this.ending) {
        if (input.wasPressed('pause')) this.pause();
        else if (input.wasPressed('pack')) this.openPack();
        else {
          c.update(dt, {
            dir: input.dir(), jumpPressed: input.wasPressed('jump'), jumpHeld: input.isDown('jump'),
            grip: input.isDown('grip'), gripPressed: input.wasPressed('grip'), pitonPressed: input.wasPressed('piton'),
            eatPressed: input.wasPressed('eat'), oxygenPressed: input.wasPressed('oxygen'), downPressed: input.wasPressed('down'),
          });
        }
      }
      this.handleEvents();
      this.updateClimbCamera(dt);
    } else this.updateTitleCamera(dt);
    this.camera.update(dt);
    this.updateAudio(dt);
    input.endFrame();
  }

  updateClimbCamera(dt) {
    const c = this.climb, p = c.player, cam = this.camera, s = this.settings;
    const e = this.ending;
    if (e && e.cine) {
      e.t += dt;
      const sum = c.terrain.ledges.find((l) => l.id === c.terrain.summitId);
      cam.follow((sum.x1 + sum.x2) / 2 * 0.5, sum.y + 120 + Math.min(e.t, 12) * 6, dt, 0.6);
      cam.zoom = approach(cam.zoom, 0.95, 0.25, dt);
      e.hour = Math.min(7.2, e.hour + dt * 0.16);
      return;
    }
    if (e) { e.t += dt; cam.follow(cam.x, cam.y - 6 * dt * 20, dt, 0.3); return; }
    const falling = p.state === 'fall' || p.state === 'lunge';
    const ty = p.y + 40 + (p.state === 'hang' ? 18 : 0);
    cam.follow(p.x * 0.65, ty, dt, falling ? 7 : 3);
    const zt = 1.3 + (s.cameraTilt && !s.reducedMotion ? c.progress * 0.14 : 0);
    cam.zoom = approach(cam.zoom, zt, 0.6, dt);
    cam.tilt = s.cameraTilt && !s.reducedMotion ? Math.sin(this.time * 0.17) * 0.004 + c.weather.force * 0.00005 + c.progress * 0.006 : 0;
  }
  updateTitleCamera(dt) {
    const cam = this.camera;
    const rm = this.settings.reducedMotion;
    cam.y += dt * (rm ? 3 : 9);
    if (cam.y > this.worldTerrain.height - 300) cam.y = 600;
    cam.x = Math.sin(this.time * 0.05) * 40;
    cam.zoom = approach(cam.zoom, 1.05, 0.5, dt);
    cam.tilt = rm ? 0 : Math.sin(this.time * 0.11) * 0.004;
    this.titleHour += dt * 0.012;
    if (this.titleHour > 23.5) this.titleHour = 19.9;
  }

  updateAudio(dt) {
    if (!this.audio.ready) return;
    this.audioT = (this.audioT || 0) + dt;
    if (this.audioT < 1 / 20) return;
    this.audioT = 0;
    const c = this.climb;
    if (!c || this.scene !== 'climb') {
      this.score.update({ scene: 'title', altitude: 0.3, night: 0.6 });
      this.ambience.update({ wind: 0.3, gust: 0.1 + Math.max(0, Math.sin(this.time * 0.2)) * 0.25, alt: 0.3, snow: 0.3, shelter: 0, fire: 0, windDir: 0.5 }, this.time);
      return;
    }
    const p = c.player, w = c.weather;
    const hz = c.hazards;
    let danger = 0;
    if (hz.warnings.length) danger = 0.55;
    if (hz.avalanche) danger = Math.max(danger, hz.avalanche.phase === 'warn' ? 0.7 : 0.9);
    if (p.state === 'fall') danger = 1;
    if (p.state === 'lunge') danger = Math.max(danger, 0.35);
    if (p.health < 35) danger = Math.max(danger, 0.5);
    if (!c.roped && c.ropeOut > 900) danger = Math.max(danger, 0.3);
    const scene = this.ending ? (this.ending.outcome === 'summit' ? 'summit' : 'end') : c.state === 'camp' ? 'camp' : 'climb';
    this.score.update({ scene, altitude: c.progress, stamina: p.stamina / 100, danger, storm: clamp(w.v.snow * 0.3 + w.v.wind * 0.4 + w.v.whiteout * 0.5 + (w.severityNow >= 3 ? 0.3 : 0)), night: c.nightness, hypoxia: p.hypoxia });
    let fire = 0;
    for (const cp of c.camps) { const d = Math.abs(cp.y - p.y); if (d < 260) fire = Math.max(fire, 1 - d / 260); }
    const shelter = c.state === 'camp' ? 1 : c.underOverhang(p.x, p.y) ? 0.7 : p.hold && p.hold.chimney ? 0.4 : 0;
    this.ambience.update({ wind: w.v.wind, gust: Math.max(w.gust, w.gustWarn * 0.7), alt: c.progress, snow: w.v.snow, shelter, fire, windDir: w.dir }, this.time);
  }

  render(dt) {
    const c = this.climb;
    const inClimb = this.scene === 'climb' && c;
    const peak = this.worldPeak;
    let hour, weather, progress, lantern = null, frost = 0, vig = 0.45, tight = 0;
    if (inClimb) {
      const w = c.weather;
      const p = c.player;
      hour = this.ending && this.ending.cine ? this.ending.hour : c.hourOfDay;
      const calm = this.ending && this.ending.cine ? 0.15 : 1;
      weather = { snow: w.v.snow * calm, wind: w.windSpeed * calm, sleet: w.v.sleet * calm, whiteout: w.v.whiteoutNow * calm, fog: w.v.fog * calm };
      progress = c.progress;
      timeState(hour, peak, this.ts);
      const cam = this.camera;
      const t = this.time;
      const gustDim = 1 - w.gust * 0.3 * (0.5 + 0.5 * Math.sin(t * 23));
      const flick = (0.92 + 0.06 * Math.sin(t * 13) + 0.03 * Math.sin(t * 37)) * gustDim;
      const need = clamp(this.ts.dark * 1.4 + w.v.whiteoutNow * 0.4);
      lantern = { on: need > 0.05 && p.state !== 'dead', x: cam.sx(p.x + p.facing * 4), y: cam.sy(p.y + 16), radius: (160 + Math.sin(t * 2.3) * 6) * flick * cam.zoom / 1.3, intensity: need * flick };
      const cold = clamp(w.v.cold * 0.6 + c.nightness * 0.25 + c.progress * 0.3 + p.hypoxia * 0.3);
      frost = this.settings.reducedMotion ? cold * 0.7 : cold;
      vig = 0.4 + w.v.wind * 0.15 + (w.severityNow >= 3 ? 0.25 : 0);
      tight = clamp(p.hypoxia * 0.9 + (1 - p.health / 100) * 0.35 + w.v.whiteoutNow * 0.25 + (p.stamina < 15 ? 0.2 : 0));
      if (this.ending && this.ending.outcome !== 'summit') { tight = Math.min(1, tight + this.ending.t * 0.15); }
      if (this.ending && this.ending.cine) { frost *= 0.3; tight = 0; vig = 0.3; }
    } else {
      hour = this.titleHour;
      weather = { snow: 0.35, wind: 22, sleet: 0, whiteout: 0, fog: 0.25 };
      progress = clamp(this.camera.y / this.worldTerrain.height * 0.6);
      timeState(hour, peak, this.ts);
      frost = 0.12;
    }
    this.renderer.render({
      cam: this.camera, ts: this.ts, time: this.time, dt, progress, weather, climb: inClimb ? c : null,
      lantern, frost, vignette: vig, vignetteTight: tight, perspective: this.settings.cameraTilt && !this.settings.reducedMotion,
      colorSafe: this.settings.colorSafe, showHints: this.settings.hints && inClimb && !this.ending, mode: inClimb ? 'climb' : 'title',
    });
    if (inClimb) {
      const ctx = this.renderer.ctx;
      ctx.setTransform(this.renderer.scale, 0, 0, this.renderer.scale, 0, 0);
      this.hud.draw(ctx, this, dt);
    }
    this.transitions.update(dt);
  }
}

function localStorageHas(storage) {
  try { return storage.backend.getItem('snowline.v1.settings') != null; } catch { return false; }
}

const app = new App();
window.__snowline = app;
app.boot().catch((err) => {
  const l = document.getElementById('loading');
  if (l) l.innerHTML = `<div class="load-title">SNOWLINE</div><p style="opacity:.7">Could not start: ${String(err && err.message || err)}</p>`;
  throw err;
});
