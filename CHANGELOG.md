# Changelog

## 1.0.0: first ascent

### World and visuals
- Procedural, seeded routes built as a chain of holds and ledges that is always within reach. Sections include faces, traverses, chimneys, overhangs, ice shelves, rest ledges, snow ledges with hidden crevasses, and deliberate lunge gaps (never on Gentle). Camps are spaced up the route and a summit dome tops it.
- Three hand-tuned peaks plus a daily peak that is the same for everyone. Each has its own palette, weather profile, difficulty rating, oxygen line and musical key: Kestrel Spire, The Pale Warden, Hollowhorn, and the daily climb.
- A layered 2.5D frame:
  - Sky with stars, twinkle, a milky band, aurora ribbons, and a sun and moon that track the clock.
  - Four parallax mountain planes, each with its own haze, blur, snow caps, couloirs, facet shading and rim light.
  - Drifting clouds and wind-shifted fog bands.
  - A textured climbing buttress with visible side faces.
  - Blurred foreground overhangs.
- Mountain planes and wall chunks are cached in offscreen canvases and re-baked only when the time bucket, palette or quality changes. Wall decorations are seeded per cell so chunk seams are invisible.
- A day and night cycle across the climb: dawn ascent, midday glare, violet dusk, and a night push with stars and aurora.
- Lighting:
  - A lantern light pool that flickers and dims in gusts.
  - Hold shadows cast away from the lantern, and a soft sun shadow of the climber on the rock.
  - Warm camp fires that glow through the night grade.
  - Low-sun warmth at dawn and dusk.
- Weather effects: three depth bands of snow that react to wind and camera parallax, sleet streaks, lens sleet, breathing whiteouts, snow accumulating on ledges, holds and the climber's shoulders, breath vapour, frost creeping in from the frame edges, haze that grows with altitude, ice shards, embers, distant avalanches and passing birds.
- Perspective camera with a gentle altitude zoom, tilt and plane scaling (optional), and screen shake (optional).
- Original SVG sprites: the climber in six poses (idle, reach, pull, hang, fall, breathe), ice axe, rope, tent, camp flag, summit flag, piton, food, oxygen and a supply crate.

### Gameplay
- Climber state machine:
  - Stand, walk and hop.
  - Reach to a hold, mantle onto a ledge, downclimb.
  - Lunge with a timed catch window, including an input buffer.
  - Fall, self-arrest with Grip, and get caught by the rope.
  - Swing and jug up the rope, or sit back on it to rest.
  - Place pitons; eat and swap oxygen as timed actions.
- Grip stamina with a fatigue ceiling. Drain depends on hold type, overhangs, snow load, wind, bracing, pack weight, hypoxia and cold. Recovery happens on ledges, faster when sheltered.
- Rope physics: falls are caught at the rope's length below the last anchor, and roped fall damage uses a fall factor. Protection ends beyond 70 m of run-out.
- Resources: food, oxygen bottles with spares, pitons, and pack weight that slows movement and raises costs. Gear can be dropped from the pack, and is taken from or left at camp caches.
- Camps as checkpoints: rest for 2 hours, sleep until dawn, or rest until dusk; re-supply; continue or descend. The game saves to Continue at each camp.
- Weather state machine (clear, breezy, snowfall, heavy snow, storm, whiteout) with forecast warnings about 28 s ahead and telegraphed gusts that push the climber.
- Hazards: rockfall with top-of-screen warnings and clattering stones, avalanches with a rumbling lead-in, crevasse snow bridges, and thin ice that cracks under your hands. Overhangs shelter you.
- "Turn back?" prompts with consequences spelled out when oxygen, health, food or an incoming storm puts the summit in doubt.
- Three outcomes (summit, retreat, fall) and three difficulties (Gentle, Standard, Harsh).

### Sound and music
- Adaptive procedural score:
  - Drone, melody, heartbeat pulse, storm and warmth stems, mixed by a pure mixer function.
  - A modal harmonic clock, with a key that rises a step at each camp and a Picardy resolution at the summit.
- Procedural convolution reverb (cold, cavernous impulse) shared across buses through sends.
- Stingers for falls, summit, anchors, rope tension, near misses, forecasts, retreat and death, all pitched in the current key.
- Synthesised SFX:
  - Wind bands and howl, campfire crackle.
  - Surface-aware footsteps and grabs.
  - Pick and piton strikes with rising pitch, rope creaks.
  - Breathing tied to exertion and oxygen.
  - Whooshes, impacts, ice cracks, pebbles, rock crashes, rumbles, birds, oxygen hiss.
  - UI clicks.
- Separate music, ambience, SFX and UI buses into a master compressor. Audio unlocks on the first gesture and ducks when paused.

### Menus and UX
- Title screen: an animated, shimmering logo over a drifting live scene with aurora. Options are Climb, Continue, Journal, Settings and Credits.
- Peak select with painted cards, best altitudes, a difficulty selector, and a live palette preview behind the menu.
- Settings that apply instantly and persist:
  - Five volume sliders.
  - Low / medium / high quality.
  - Camera tilt, screen shake, reduced motion, colour-safe mode, subtitles, hold highlights and FPS counter.
  - Full key remapping.
  - Reset to defaults with confirmation.
- Journal with best altitude, total summits, climb count, time on the mountain, and per-climb notes and stats.
- Pause with a frosted backdrop, auto-pause on focus loss, pack screen, camp screen and turn-back prompt.
- Summit cinematic at sunrise, a quiet epilogue card for a retreat or fall, and animated count-ups.
- Transitions: fade through white, snow wipe, and smoothed music changes.
- Keyboard, mouse, gamepad and touch support, with spatial focus navigation and visible focus states. Letterboxed 16:9 at any size, with a hint to rotate in portrait.

### Quality
- 54 `node:test` tests:
  - Terrain determinism, fairness across seeds and difficulties, and bounds.
  - Stamina, rope and fall resolution, resources and oxygen, camp refill and rest, altitude.
  - Storage fallback and corruption handling.
  - Score mixing and music theory, weather forecasts, climb rules.
  - An end-to-end bot that summits generated routes.
- About 318 KB of shipped code and assets.
