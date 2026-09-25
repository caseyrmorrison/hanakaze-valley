# Hanakaze Valley 花風の谷

A small, explorable cel-shaded anime world built with Three.js — no build step.

**Play it:** https://caseyrmorrison.github.io/hanakaze-valley/

A valley ringed by mountains with a lake and a torii standing in the water, a
path of a thousand vermilion gates climbing to a hilltop shrine, a lantern-lit
village, and an old camphor tree wrapped in a sacred rope. Grass sways in the
wind, sakura petals drift everywhere, and at night fireflies come out.

All sound is synthesized live with the Web Audio API, so there are no audio
files. A generative koto-and-flute score plays in the bright *yo* scale by day
and the minor *in* scale at night. Around it: wind, birdsong (with the
occasional bush warbler), crickets and frogs after dark, lapping water, village
wind chimes, shrine bells, and footsteps that change with the ground.

## Run locally

ES modules need to be served over HTTP:

```bash
python3 -m http.server 5391
```

Then open http://localhost:5391.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Walk |
| Mouse (or click-drag) | Look |
| Shift | Run |
| Space | Jump |
| T | Next time of day: morning → golden hour → twilight → night |
| M | Mute or unmute sound (also the speaker button, bottom right) |

On touch screens, drag with your left thumb to walk and your right to look.

## Layout

- `src/terrain.js` — height function, world layout, dirt paths, terrain mesh
- `src/sky.js` — gradient sky dome (sun, moon, stars) and cel-shaded cumulus clouds
- `src/grass.js` — 120k instanced blades that wrap around the camera, sampled from a baked height/density texture
- `src/trees.js`, `src/structures.js` — sakura, broadleaf and pine trees; torii, shrine, village, lanterns, pier
- `src/water.js` — stylized lake with glints and shoreline foam
- `src/effects.js` — falling petals and fireflies
- `src/daycycle.js` — lighting moods and blending between them
- `src/music.js` — generative score: koto plucks, drone and shakuhachi-style flute
- `src/audio.js` — ambience, wildlife, bells and footsteps, plus the mixer and mute
- `src/player.js` — first-person walking, collisions, touch controls
- `src/main.js` — renderer, bloom, wiring and the frame loop
