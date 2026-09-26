# Hanakaze Valley 花風の谷

A small, explorable cel-shaded anime world built with Three.js — no build step.

**Play it:** https://caseyrmorrison.github.io/hanakaze-valley/

A valley ringed by mountains with a lake and a torii standing in the water, a
path of a thousand vermilion gates climbing to a hilltop shrine, a lantern-lit
village, and an old camphor tree wrapped in a sacred rope. Grass sways in the
wind, sakura petals drift everywhere, and at night fireflies come out.

Five residents live in the valley, each with her own routine and things to say:
Sayo the shrine keeper sweeps the forecourt, Hana bows to guests at her tea
stall, Mio paints the lake gate from the pier, Rin "meditates" under the old
camphor (she was asleep), and Kiko runs letters between the village and the
shrine, always late. Walk up to one and press E to talk.

Beyond the lake, Kirifuri Falls pours off a cliff into a river that winds down
to the water, with a viewing deck and a small jizo statue. A two-car local train
runs the length of the valley between mountain tunnels, stopping at tiny
Hanakaze Station (vending machine included) and setting off the level crossing
on the way to the terraced rice paddies. Koi circle in the lake, butterflies and
dragonflies drift over the meadows and water, birds cross the sky, and Mochi the
village cat will follow you around if you let her. From twilight on, fireworks
burst over the lake, paper lanterns float on the water and shooting stars cross
the sky.

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
| E | Talk to the person you're facing; press again to continue |
| P | Photo mode: hide the interface and add letterbox bars |
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
- `src/character.js`, `src/faces.js` — anime character rig, painted faces and expressions, manga emotes
- `src/cast.js`, `src/behaviors.js` — the five residents, their props, routines and lines
- `src/dialogue.js` — visual-novel dialogue box with typewriter text
- `src/river.js` — Kirifuri Falls, the river, plunge pool, mist and viewing deck
- `src/railway.js`, `src/train.js` — track, tunnels, level crossing, station, and the train and its timetable
- `src/paddies.js` — flooded rice terraces
- `src/wildlife.js`, `src/cat.js` — koi, butterflies, dragonflies, birds, and Mochi the cat
- `src/festival.js` — fireworks, floating lanterns and shooting stars
- `src/player.js` — first-person walking, collisions, touch controls
- `src/main.js` — renderer, bloom, wiring and the frame loop
