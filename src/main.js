import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

import { WORLD, createTerrain } from "./terrain.js";
import { createSky, createClouds } from "./sky.js";
import { bakeGroundTexture, createGrass } from "./grass.js";
import { createTrees } from "./trees.js";
import { createStructures } from "./structures.js";
import { createWater } from "./water.js";
import { createPetals, createFireflies } from "./effects.js";
import { Player } from "./player.js";
import { Soundscape } from "./audio.js";
import { MOODS, blendMoods, dirFromAngles } from "./daycycle.js";
import { mulberry32 } from "./instancer.js";

// ---------- renderer ----------
const canvas = document.getElementById("world");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xffffff, 0.0025);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 4000);

// ---------- lights ----------
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1);
scene.add(hemi);

// ---------- world ----------
const rand = mulberry32(20260924);
const colliders = [];

const sky = createSky();
const clouds = createClouds(rand);
const terrain = createTerrain();
const groundTex = bakeGroundTexture();
const grass = createGrass(groundTex);
const trees = createTrees(rand, colliders);
const structures = createStructures(rand, colliders, trees.camphor);
const water = createWater();
const petals = createPetals();
const fireflies = createFireflies(groundTex);

scene.add(sky.mesh, clouds.group, terrain, grass.mesh, trees.group, structures.group, water.mesh, petals.mesh, fireflies.points);

const player = new Player(camera, canvas, colliders);

// ---------- sound ----------
const sound = new Soundscape();
const soundBtn = document.getElementById("sound");
player.onStep = (surface, running) => sound.step(surface, running);
player.onJump = () => sound.jump();
player.onLand = (impact, surface) => sound.land(impact, surface);

function showSoundState() {
  soundBtn.classList.toggle("off", sound.muted);
  soundBtn.setAttribute("aria-label", sound.muted ? "Turn sound on" : "Turn sound off");
}
function toggleSound() {
  sound.toggle();
  showSoundState();
}
soundBtn.addEventListener("click", toggleSound);
showSoundState();

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.55, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- time of day ----------
let moodIndex = 1;
let moodFrom = MOODS[1], moodTo = MOODS[1], moodT = 1, moodStart = -Infinity;
const moonDir = dirFromAngles([38, 60]);
const shallow = new THREE.Color("#4fd8cf"), deep = new THREE.Color("#1f64b8");
const clockEl = document.getElementById("clock");

function applyMood(s) {
  const u = sky.uniforms;
  u.uTop.value.copy(s.top);
  u.uHorizon.value.copy(s.horizon);
  u.uSunColor.value.copy(s.sunColor);
  u.uSunDir.value.copy(s.sun);
  u.uMoonDir.value.copy(moonDir);
  u.uSunVis.value = s.sunVis;
  u.uMoonVis.value = s.moonVis;
  u.uStars.value = s.stars;

  sun.color.copy(s.lightColor);
  sun.intensity = s.lightIntensity;
  sun.userData.dir = s.light;
  hemi.color.copy(s.hemiSky);
  hemi.groundColor.copy(s.hemiGround);
  hemi.intensity = s.hemiIntensity;

  scene.fog.color.copy(s.fog);
  scene.fog.density = s.fogDensity;
  clouds.uniforms.uLit.value.copy(s.clouds);
  clouds.uniforms.uShade.value.copy(s.clouds).lerp(s.top, 0.4).lerp(s.horizon, 0.15);
  clouds.uniforms.uLightDir.value.copy(s.light);

  structures.glowMaterials.forEach((m) => (m.emissiveIntensity = s.lanterns * 2.2));
  grass.uniforms.uTint.value.copy(s.grass);
  petals.uniforms.uTint.value.copy(s.grass);

  water.uniforms.uSky.value.copy(s.top).lerp(s.horizon, 0.5);
  water.uniforms.uSunDir.value.copy(s.light);
  water.uniforms.uSunColor.value.copy(s.lightColor).multiplyScalar(s.lightIntensity * 0.4);
  water.uniforms.uShallow.value.copy(shallow).multiply(s.grass);
  water.uniforms.uDeep.value.copy(deep).multiply(s.grass);

  fireflies.uniforms.uAmount.value = s.fireflies;
  fireflies.points.visible = s.fireflies > 0.01;
  sound.setMood(s);
}

function nextMood() {
  // start from wherever the current blend is, so rapid presses stay smooth
  moodFrom = blendMoods(moodFrom, moodTo, moodT * moodT * (3 - 2 * moodT));
  moodIndex = (moodIndex + 1) % MOODS.length;
  moodTo = MOODS[moodIndex];
  moodStart = clock.elapsedTime;
  clockEl.textContent = moodTo.name;
  sound.chime();
}

addEventListener("keydown", (e) => {
  if (e.code === "KeyT") nextMood();
  if (e.code === "KeyM") toggleSound();
});

// ---------- places ----------
const PLACES = [
  { name: "Kaze Shrine", x: 0, z: WORLD.shrineHill.z + 4, r: 16 },
  { name: "Path of a Thousand Gates", x: 0, z: -80, r: 24 },
  { name: "Lake Kagami", x: WORLD.lake.x, z: WORLD.lake.z, r: WORLD.lake.r + 6 },
  { name: "Hinata Village", x: WORLD.village.x, z: WORLD.village.z, r: WORLD.village.r },
  { name: "The Old Camphor", x: WORLD.camphorHill.x, z: WORLD.camphorHill.z, r: 22 },
];
const placeEl = document.getElementById("place");
let currentPlace = null, placeTimer = 0;

function updatePlace(dt) {
  const here = PLACES.find((p) => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < p.r) || null;
  if (here !== currentPlace) {
    currentPlace = here;
    if (here) {
      placeEl.textContent = here.name;
      placeEl.classList.add("show");
      placeTimer = 4;
      if (here.name === "Kaze Shrine") sound.shrine();
    }
  }
  placeTimer -= dt;
  if (placeTimer <= 0) placeEl.classList.remove("show");
}

// ---------- title screen ----------
const titleCard = document.getElementById("title-card");
document.getElementById("enter").addEventListener("click", () => {
  titleCard.classList.add("gone");
  document.getElementById("hud").hidden = false;
  player.enabled = true;
  soundBtn.hidden = false;
  sound.start();
  canvas.requestPointerLock?.()?.catch?.(() => {});
});

function titleCamera(t) {
  const a = t * 0.03;
  camera.position.set(Math.sin(a) * 30 + 10, 26 + Math.sin(t * 0.2) * 2, 95 + Math.cos(a) * 10);
  camera.lookAt(15, 8, -40);
}

// ---------- loop ----------
const clock = new THREE.Clock();
const lightDir = new THREE.Vector3();

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  moodT = Math.min(1, (t - moodStart) / 3.5);
  const eased = moodT * moodT * (3 - 2 * moodT);
  applyMood(blendMoods(moodFrom, moodTo, eased));

  if (player.enabled) {
    player.update(dt);
    updatePlace(dt);
  } else {
    titleCamera(t);
  }

  // keep the shadow frustum centered on the viewer
  lightDir.copy(sun.userData.dir);
  sun.target.position.set(camera.position.x, 0, camera.position.z);
  sun.position.copy(sun.target.position).addScaledVector(lightDir, 200);

  sky.mesh.position.copy(camera.position);
  sky.uniforms.uTime.value = t;
  clouds.group.rotation.y = t * 0.002;
  for (const u of [grass.uniforms, petals.uniforms, fireflies.uniforms]) {
    u.uTime.value = t;
    u.uCenter.value.copy(camera.position);
  }
  water.uniforms.uTime.value = t;
  sound.update(dt, t, player.pos);

  composer.render();
  requestAnimationFrame(frame);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

frame();
