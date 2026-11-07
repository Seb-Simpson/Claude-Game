# Snowline: build plan

## File structure
```
index.html            entry point: canvas stage, DOM overlay for menus
css/style.css         letterboxed 16:9 stage, frosted menus, focus states
js/main.js            bootstrap, fixed-step loop wiring, scene switching
js/storage.js         settings / journal / bests in localStorage (memory fallback)
js/engine/            loop, input (keys/pad/touch, remappable), assets (SVG raster),
                      audio (buses + procedural convolution reverb), tween, particles,
                      camera, rng/noise, math
js/render/            palette + time-of-day, sky (stars, aurora, sun/moon), parallax
                      layers, wall chunk baking, lighting, weather fx, post fx, renderer
js/music/             theory (modes, quantise), phrase generator, mixer (pure),
                      instruments, stems, stingers, score, ambience, sfx
js/game/              constants, peaks, terrain gen, altitude, stamina, rope,
                      resources, weather state, hazards, player, climb session
js/ui/                screen manager + title, peak select, settings, journal,
                      pause, camp, prompts, pack, end screens, HUD, touch, captions
test/                 node:test suites for pure logic
assets/sprites/       hand-written SVG sprites
```

## Palette
| Role | Hex |
|---|---|
| Night ink | `#0b1030` |
| Deep blue | `#1c2a5a` |
| Dusk violet | `#4b3a7a` |
| Haze lilac | `#9a8fc4` |
| Ice white | `#eef4ff` |
| Snow shadow | `#b9c6e6` |
| Rock grey-blue | `#5d6b85` / dark `#2e3650` / light `#8c9ab3` |
| Glacier ice | `#9fd4f0` |
| Lantern orange | `#ffb35c` |
| Ember | `#ff7a3a` |

Each peak shifts the hue of sky and rock but keeps these roles.

## Layer stack (back to front)
0. Sky gradient, stars, aurora, sun/moon
1. Far peaks: pale, heavy haze, max blur, parallax 0.04
2. Distant range: hazy violet, parallax 0.10
3. Mid ridges: snow-dusted, light blur, parallax 0.22
4. Near buttress: darker, textured, parallax 0.45
   (cloud and fog bands between 1-4; far snow band behind 4)
5. Play plane: climbing wall (cached chunks), ledges, holds, rope, camp, climber,
   mid snow band, lantern lighting / ambient grade
6. Foreground overhangs: dark blurred silhouettes, parallax 1.35
7. Near snow band, sleet, whiteout, frost, vignette, HUD

## Score stems
- **Drone**: detuned saw/triangle pads, slow LFO filter, modal chord glides; altitude raises register and cutoff
- **Melody**: seeded modal phrases on FM bell and soft piano voices, long reverb tails
- **Pulse**: low heartbeat (lub-dub) that fades in as stamina falls
- **Storm**: band-passed noise sweeps and sub rumble, scaled by weather intensity
- **Warmth**: camp pad and plucked arpeggio, major colour
- **Summit**: all stems plus a resolving Picardy chord swell
- Stingers: fall, summit, anchor, rope tension, near miss, all pitched to the current key
- Mixer is a pure function: game state goes in, stem gains and brightness come out
