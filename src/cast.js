import * as THREE from "three";
import { Character, mesh, capsule } from "./character.js";
import { toon } from "./toon.js";
import { WORLD, heightAt } from "./terrain.js";
import { BEHAVIORS } from "./behaviors.js";

const paper = toon("#fbfbf6");
const wood = toon("#7a5238");
const darkWood = toon("#4f3528");
const ink = toon("#2b2230");
const gold = toon("#e2b64f");

// Hair hanging from a pivot on the head, so it can sway.
function hairTail(c, m, { at, r, len, restX = 0, restZ = 0, flatten = 1, amount = 1 }) {
  const pivot = new THREE.Group();
  pivot.position.set(...at);
  c.head.add(pivot);
  const tail = mesh(capsule(r, len), m.hair, { outline: 0.06 });
  tail.position.y = -(len / 2 + r * 0.6);
  tail.scale.z = flatten;
  pivot.add(tail);
  c.addSwayer(pivot, restX, restZ, amount);
  return pivot;
}

function held(elbow, object) {
  object.position.y = -0.3;
  elbow.add(object);
  return object;
}

// ---------- the five residents ----------
const DEFS = [
  {
    name: "Sayo",
    role: "Shrine keeper",
    behavior: "sweeper",
    voice: 520,
    accent: "#d8323c",
    hair: "#2a2230", iris: "#8a4b3a",
    top: "#fbfbf8", bottom: "#d8323c", accentColor: "#d8323c",
    bottomStyle: "skirt", flare: 0.3, hem: 0.05, wideSleeves: true, shoes: "#f4f0e6",
    spot: () => ({ x: 3.4, z: WORLD.forecourt.z + 6.5, heading: -0.4 }),
    hairStyle(c, m) {
      const tail = hairTail(c, m, { at: [0, -0.01, -0.1], r: 0.085, len: 0.44, restX: 0.12, flatten: 0.5, amount: 0.5 });
      const ribbon = mesh(new THREE.BoxGeometry(0.15, 0.05, 0.03), paper, { outline: 0.1 });
      ribbon.position.set(0, -0.09, -0.05);
      tail.add(ribbon);
    },
    extras(c) {
      // bamboo broom held out in front
      const broom = new THREE.Group();
      broom.position.set(0.05, 1.0, 0.3);
      const handle = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 8), toon("#c9b27a"), { outline: 0.15 });
      handle.position.y = -0.5;
      broom.add(handle);
      const head = mesh(new THREE.ConeGeometry(0.16, 0.38, 10), toon("#d9c48a"), { outline: 0.06 });
      head.position.y = -1.0;
      broom.add(head);
      broom.rotation.x = -0.4;
      c.root.add(broom);
      c.broom = broom;
    },
    lines: [
      { text: "Ah, a visitor! Welcome to Kaze Shrine. I'm Sayo, I look after the grounds.", face: "happy", emote: "♪", sparkle: true },
      { text: "The wind god who lives here carries the blossoms all the way down to the lake." },
      { text: "Make a wish at the offering box. The petals will remember it for you.", face: "happy" },
      { text: "...Please don't tell anyone I talk to my broom when nobody's around.", face: "flustered", emote: "sweat" },
    ],
    repeat: [
      { text: "Mind the steps on your way down!", face: "happy" },
      { text: "The gates below were each donated by someone who got their wish. Three hundred and forty of them." },
      { text: "Sweep, sweep... Oh! I didn't see you there.", face: "flustered", emote: "!" },
    ],
  },
  {
    name: "Hana",
    role: "Tea house owner",
    behavior: "host",
    voice: 610,
    accent: "#e27396",
    hair: "#8a5a3c", iris: "#5f8f4e",
    top: "#f7a8c4", bottom: "#ef97b6", accentColor: "#c23b4a",
    bottomStyle: "skirt", flare: 0.2, hem: 0.07, wideSleeves: true, shoes: "#f4f0e6",
    spot: () => ({ x: WORLD.village.x + 7.5, z: WORLD.village.z - 3, heading: 1.75 }),
    hairStyle(c, m) {
      const bun = mesh(new THREE.SphereGeometry(0.075, 16, 12), m.hair, { outline: 0.06 });
      bun.position.set(0, 0.08, -0.13);
      c.head.add(bun);
      const pin = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 6), gold);
      pin.position.set(0, 0.08, -0.14);
      pin.rotation.z = 1.2;
      c.head.add(pin);
      const dangle = new THREE.Group();
      dangle.position.set(0.1, 0.12, -0.14);
      c.head.add(dangle);
      [0, 1, 2].forEach((i) => {
        const bead = mesh(new THREE.SphereGeometry(0.018, 8, 6), toon(i % 2 ? "#ffd1e6" : "#ff8fb8"));
        bead.position.y = -0.03 - i * 0.035;
        dangle.add(bead);
      });
      c.addSwayer(dangle, 0, 0, 1.5);
    },
    extras(c) {
      const apron = mesh(new THREE.BoxGeometry(0.24, 0.5, 0.012), paper, { outline: 0.04 });
      apron.position.set(0, 0.62, 0.178);
      apron.rotation.x = -0.1;
      c.body.add(apron);
      const tray = new THREE.Group();
      const plate = mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.02, 20), toon("#8a3b2a"), { outline: 0.1 });
      tray.add(plate);
      const cup = mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.06, 12), toon("#6f9a7a"), { outline: 0.12 });
      cup.position.set(0.04, 0.04, 0);
      tray.add(cup);
      const dango = new THREE.Group();
      ["#ffb7cf", "#ffffff", "#9fd08a"].forEach((col, i) => {
        const d = mesh(new THREE.SphereGeometry(0.018, 10, 8), toon(col));
        d.position.x = -0.03 - i * 0.034;
        dango.add(d);
      });
      dango.position.set(0, 0.025, 0.04);
      tray.add(dango);
      tray.rotation.x = 1.55;
      tray.position.z = 0.05;
      held(c.arms[0].elbow, tray);
    },
    lines: [
      { text: "Irasshaimase! Welcome to Hinata Village!", face: "happy", emote: "♪", sparkle: true },
      { text: "I'm Hana. I'd offer you tea, but somebody drank the whole pot. It was me.", face: "flustered", emote: "sweat" },
      { text: "Come back after dark. When the lanterns are lit, the whole square glows orange." },
      { text: "And if you see Kiko running about, tell her the rice crackers are ready!", face: "happy" },
    ],
    repeat: [
      { text: "Three colors of dango: spring, snow and summer grass. Very important.", face: "happy" },
      { text: "You look like you walked a long way. Sit down whenever you like." },
      { text: "Kiko's late again? Of course she is.", emote: "sweat" },
    ],
  },
  {
    name: "Mio",
    role: "Painter",
    behavior: "painter",
    voice: 470,
    accent: "#3f8fa6",
    hair: "#57b6b0", iris: "#3f7fb8",
    top: "#f2ede0", bottom: "#5b7fa6", accentColor: "#e9a23b",
    bottomStyle: "skirt", flare: 0.24, hem: 0.1, lockLength: 0.2,
    spot: () => ({ x: WORLD.lake.x + 0.5, z: WORLD.lake.z + 19.2, y: 0.71, heading: Math.PI }),
    hairStyle(c, m) {
      const bob = mesh(new THREE.SphereGeometry(0.16, 20, 14), m.hair, { outline: 0.05 });
      bob.scale.set(1.08, 0.72, 1);
      bob.position.set(0, -0.07, -0.06);
      c.head.add(bob);
      const beret = mesh(new THREE.SphereGeometry(0.135, 20, 10), toon("#c0392b"), { outline: 0.06 });
      beret.scale.set(1, 0.34, 1);
      beret.position.set(0.02, 0.135, -0.01);
      beret.rotation.z = -0.28;
      c.head.add(beret);
    },
    extras(c) {
      const brush = mesh(new THREE.CylinderGeometry(0.008, 0.005, 0.2, 6), darkWood);
      brush.rotation.x = 1.4;
      brush.position.z = 0.06;
      held(c.arms[0].elbow, brush);
      const palette = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 16), toon("#d9b98a"), { outline: 0.08 });
      palette.rotation.x = 1.3;
      held(c.arms[1].elbow, palette);
    },
    lines: [
      { text: "Shh... the light on the gate is perfect right now.", emote: "♪" },
      { text: "I'm Mio. I've painted that torii three hundred and twelve times.", face: "happy", sparkle: true },
      { text: "Morning, golden hour, twilight, night. The colors change completely. I want all of them." },
      { text: "Could you step a little to the left? You're in my composition.", face: "flustered", emote: "sweat" },
    ],
    repeat: [
      { text: "Try looking at the gate at twilight. The water turns violet.", face: "happy" },
      { text: "Painting three hundred and thirteen. This one's the one. Probably." },
      { text: "If you stand still long enough, you'll hear the frogs start up.", emote: "♪" },
    ],
  },
  {
    name: "Rin",
    role: "Wandering swordswoman",
    behavior: "sleeper",
    voice: 400,
    accent: "#4a5a9a",
    hair: "#e6e8f2", iris: "#c0405e",
    top: "#34406b", bottom: "#2a2f45", accentColor: "#b8324a",
    bottomStyle: "pants", radius: 0.55,
    spot: () => {
      const { camphorHill: c } = WORLD;
      const a = 4.45;
      return { x: c.x + Math.cos(a) * 2.35, z: c.z + Math.sin(a) * 2.35, heading: Math.atan2(Math.cos(a), Math.sin(a)) };
    },
    hairStyle(c, m) {
      const tail = hairTail(c, m, { at: [0, 0.1, -0.12], r: 0.055, len: 0.38, restX: 0.55, amount: 1.1 });
      const tie = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), toon("#b8324a"));
      tie.rotation.x = 0.5;
      tail.add(tie);
    },
    extras(c) {
      const sword = new THREE.Group();
      const sheath = mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.78, 8), ink, { outline: 0.12 });
      sheath.position.y = 0.39;
      const guard = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), gold);
      guard.position.y = 0.79;
      const grip = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.24, 8), toon("#e8e2d0"), { outline: 0.12 });
      grip.position.y = 0.92;
      sword.add(sheath, guard, grip);
      sword.position.set(0.42, 0, -0.08);
      sword.rotation.z = 0.28;
      c.root.add(sword);
    },
    lines: [
      { text: "I-I wasn't asleep! I was meditating. Obviously.", face: "flustered", emote: "anger" },
      { text: "The name's Rin. I guard this tree. It's eight hundred years old, you know." },
      { text: "It's not like I stay here because the shade is nice or anything.", face: "flustered", emote: "sweat" },
      { text: "...Hmph. You can sit here too. If you want. I don't care.", face: "happy", emote: "heart", sparkle: true },
    ],
    repeat: [
      { text: "You again? I-it's fine. The tree likes visitors. Not me. The tree.", face: "flustered", emote: "anger" },
      { text: "The rope around the trunk keeps bad spirits out. And noisy people." },
      { text: "I'm not tired. Your walking is just very soothing.", face: "flustered" },
    ],
  },
  {
    name: "Kiko",
    role: "Village courier",
    behavior: "runner",
    voice: 700,
    accent: "#f08a24",
    hair: "#ff9a3c", iris: "#d9772a",
    top: "#ffd166", bottom: "#4c6ef5", accentColor: "#e0503a",
    bottomStyle: "skirt", flare: 0.23, hem: 0.5, legs: "#3a3048", shoes: "#d9453a",
    spot: () => ({ x: -44, z: 22, heading: Math.PI / 2 }),
    hairStyle(c, m) {
      for (const side of [-1, 1]) {
        const tail = hairTail(c, m, { at: [side * 0.125, 0.07, -0.06], r: 0.05, len: 0.3, restX: 0.25, restZ: side * 0.3, amount: 1.3 });
        const bow = mesh(new THREE.SphereGeometry(0.05, 10, 8), toon("#e0503a"), { outline: 0.1 });
        bow.scale.set(1.2, 0.6, 0.5);
        tail.add(bow);
      }
    },
    extras(c) {
      const bag = mesh(new THREE.BoxGeometry(0.08, 0.16, 0.2), toon("#a0643c"), { outline: 0.06 });
      bag.position.set(0.16, 0.02, 0.02);
      c.torso.add(bag);
      const strap = mesh(new THREE.TorusGeometry(0.19, 0.012, 6, 28), toon("#7a4a2a"));
      strap.position.y = 0.22;
      strap.rotation.set(Math.PI / 2, 0.6, 0);
      c.torso.add(strap);
    },
    route: [[-46, 22], [-25, 22.6], [0.8, 20.6], [-1.2, -20], [0.8, -48]],
    lines: [
      { text: "Ah! Sorry! Coming through! I'm late, late, late!", face: "flustered", emote: "sweat" },
      { text: "I'm Kiko! I carry letters between the village and the shrine. Every single day!", face: "happy", sparkle: true },
      { text: "Rice crackers? Hana made rice crackers?! Okay, bye!", face: "happy", emote: "!" },
    ],
    repeat: [
      { text: "Can't stop! Well, I can. I'm stopping. But I shouldn't!", face: "flustered", emote: "sweat" },
      { text: "Twenty-two letters today! A new record!", face: "happy", emote: "♪" },
      { text: "Sayo's letters always smell like incense. Mio's smell like paint.", emote: "♪" },
    ],
  },
];

// ---------- set pieces that belong to the residents ----------
function teaStall(scene, colliders, x, z) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  const felt = toon("#c8322b");
  const seat = mesh(new THREE.BoxGeometry(1.7, 0.08, 0.55), felt, { outline: 0.03 });
  seat.position.y = 0.45;
  g.add(seat);
  for (const [lx, lz] of [[-0.75, -0.2], [0.75, -0.2], [-0.75, 0.2], [0.75, 0.2]]) {
    const leg = mesh(new THREE.BoxGeometry(0.07, 0.45, 0.07), wood);
    leg.position.set(lx, 0.22, lz);
    g.add(leg);
  }
  // nodate-gasa: the big red tea-ceremony parasol
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.5, 8), darkWood);
  pole.position.set(0.95, 1.25, 0.1);
  const shade = mesh(new THREE.ConeGeometry(1.35, 0.45, 18, 1, true), toon("#d8342c", { extra: { side: THREE.DoubleSide } }), { outline: 0.02 });
  shade.position.set(0.95, 2.45, 0.1);
  g.add(pole, shade);
  scene.add(g);
  colliders.push({ x, z, r: 0.9 }, { x: x + 0.95, z: z + 0.1, r: 0.2 });
}

function paintingTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, 110);
  sky.addColorStop(0, "#6d8fe0");
  sky.addColorStop(1, "#ffc59a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 120);
  ctx.fillStyle = "#8a7fb8";
  ctx.beginPath();
  ctx.moveTo(0, 105);
  [[40, 70], [80, 95], [120, 60], [170, 92], [215, 72], [256, 100]].forEach(([px, py]) => ctx.lineTo(px, py));
  ctx.lineTo(256, 120);
  ctx.lineTo(0, 120);
  ctx.fill();
  ctx.fillStyle = "#4f9bd0";
  ctx.fillRect(0, 118, 256, 74);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < 9; i++) ctx.fillRect(20 + i * 26, 135 + (i % 3) * 14, 14, 2);
  ctx.fillStyle = "#e5462c";
  ctx.fillRect(98, 72, 8, 70);
  ctx.fillRect(150, 72, 8, 70);
  ctx.fillRect(90, 84, 76, 6);
  ctx.fillStyle = "#2b2230";
  ctx.fillRect(84, 66, 88, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function easel(scene, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = Math.PI;
  for (const [lx, rz, rx] of [[-0.28, 0.12, -0.1], [0.28, -0.12, -0.1], [0, 0, 0.35]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), wood);
    leg.position.set(lx, 0.78, rx > 0.2 ? -0.22 : 0);
    leg.rotation.set(rx, 0, rz);
    g.add(leg);
  }
  const board = mesh(new THREE.BoxGeometry(0.72, 0.56, 0.03), toon("#efe6d2"), { outline: 0.03 });
  board.position.set(0, 1.18, 0.06);
  board.rotation.x = -0.12;
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.5), new THREE.MeshBasicMaterial({ map: paintingTexture() }));
  art.position.set(0, 0, -0.017);
  art.rotation.y = Math.PI;
  board.add(art);
  g.add(board);
  scene.add(g);
}

export function createCast(scene, colliders) {
  const members = DEFS.map((def) => {
    const c = new Character({ ...def, accent: def.accentColor });
    const s = def.spot();
    c.place(s.x, s.y ?? heightAt(s.x, s.z), s.z, s.heading);
    c.home = s;
    c.state = {};
    scene.add(c.root);
    colliders.push(c.collider);
    return {
      name: def.name, role: def.role, accent: def.accent, voice: def.voice,
      lines: def.lines, repeat: def.repeat, route: def.route,
      character: c, behavior: BEHAVIORS[def.behavior], heardAll: false,
    };
  });

  const hana = members.find((m) => m.name === "Hana").character.home;
  teaStall(scene, colliders, hana.x - 1.8, hana.z - 1.4);
  const mio = members.find((m) => m.name === "Mio").character.home;
  easel(scene, mio.x, mio.y, mio.z - 0.95);
  colliders.push({ x: mio.x, z: mio.z - 0.95, r: 0.35 });

  return members;
}
