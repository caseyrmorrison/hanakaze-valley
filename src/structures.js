import * as THREE from "three";
import { toon } from "./toon.js";
import { Instancer, mat } from "./instancer.js";
import { WORLD, heightAt, PATHS } from "./terrain.js";

const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
const prism = new THREE.CylinderGeometry(0.577, 0.577, 1, 3).rotateX(-Math.PI / 2).translate(0, 0.289, 0);
const pyramid = new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
const ball = new THREE.SphereGeometry(1, 14, 10);
const rock = new THREE.DodecahedronGeometry(1, 0);

const glow = (c) => toon(c, { soft: true, extra: { emissive: c, emissiveIntensity: 0 } });

const m = {
  vermilion: toon("#e5462c"),
  ink: toon("#2b2230"),
  stone: toon("#b8b3bf"),
  darkStone: toon("#8f8a99"),
  plaster: toon("#f4ead6"),
  wood: toon("#7a5238"),
  darkWood: toon("#4f3528"),
  tileRoof: toon("#4d5b7a", { extra: { flatShading: true } }),
  thatch: toon("#c4935a", { extra: { flatShading: true } }),
  copperRoof: toon("#5aa596", { extra: { flatShading: true } }),
  straw: toon("#eadba4"),
  paper: toon("#ffffff"),
  rock: toon("#9c98a8", { extra: { flatShading: true } }),
  lanternLight: glow("#ffc56b"),
  windowLight: glow("#ffd48a"),
  paperLantern: glow("#ff5a4a"),
};

// Place a part relative to an object's origin (rotated by ry, uniformly scaled by s).
function part(inst, geometry, material, o, lx, ly, lz, size, extra = {}, outline = 0.05) {
  const c = Math.cos(o.ry), sn = Math.sin(o.ry);
  const x = o.x + (lx * c + lz * sn) * o.s;
  const z = o.z + (-lx * sn + lz * c) * o.s;
  inst.add(geometry, material, mat(x, o.y + ly * o.s, z, {
    ry: o.ry + (extra.ry || 0), rx: extra.rx || 0, rz: extra.rz || 0,
    sx: size[0] * o.s, sy: size[1] * o.s, sz: size[2] * o.s,
  }), outline);
}

function torii(inst, colliders, x, z, ry, s, y = heightAt(x, z)) {
  const o = { x, y, z, ry, s };
  for (const side of [-1.45, 1.45]) {
    part(inst, cyl, m.vermilion, o, side, -0.5, 0, [0.19, 4.6, 0.19]);
    part(inst, cyl, m.ink, o, side, -0.5, 0, [0.25, 0.9, 0.25]);
    const c = Math.cos(ry), sn = Math.sin(ry);
    colliders.push({ x: x + side * c * s, z: z - side * sn * s, r: 0.35 * s });
  }
  part(inst, box, m.vermilion, o, 0, 3.1, 0, [3.8, 0.24, 0.2]);
  part(inst, box, m.vermilion, o, 0, 3.34, 0, [0.22, 0.52, 0.16]);
  part(inst, box, m.vermilion, o, 0, 3.86, 0, [4.4, 0.3, 0.34]);
  part(inst, box, m.ink, o, 0, 4.14, 0, [4.9, 0.2, 0.44]);
  for (const side of [-1, 1]) {
    part(inst, box, m.ink, o, side * 2.45, 4.1, 0, [0.5, 0.2, 0.44], { rz: side * 0.25 });
  }
}

function stoneLantern(inst, colliders, x, z, ry = 0, s = 1) {
  const o = { x, y: heightAt(x, z), z, ry, s };
  part(inst, box, m.darkStone, o, 0, 0, 0, [0.7, 0.25, 0.7]);
  part(inst, cyl, m.stone, o, 0, 0.25, 0, [0.14, 0.9, 0.14]);
  part(inst, box, m.stone, o, 0, 1.15, 0, [0.62, 0.12, 0.62]);
  part(inst, box, m.lanternLight, o, 0, 1.27, 0, [0.42, 0.42, 0.42]);
  part(inst, pyramid, m.stone, o, 0, 1.69, 0, [1.05, 0.45, 1.05]);
  part(inst, ball, m.stone, o, 0, 2.2, 0, [0.1, 0.12, 0.1]);
  colliders.push({ x, z, r: 0.45 * s });
}

function house(inst, colliders, x, z, ry, rand) {
  const w = 5 + rand() * 2.5, d = 4.5 + rand() * 2, h = 2.6 + rand() * 0.6;
  const o = { x, y: heightAt(x, z) - 0.2, z, ry, s: 1 };
  part(inst, box, m.darkWood, o, 0, 0, 0, [w + 0.2, 0.7, d + 0.2]);
  part(inst, box, m.plaster, o, 0, 0.7, 0, [w, h, d]);
  for (const cx of [-w / 2, w / 2]) {
    for (const cz of [-d / 2, d / 2]) part(inst, box, m.darkWood, o, cx, 0.7, cz, [0.22, h, 0.22], {}, 0);
  }
  part(inst, box, m.darkWood, o, 0, 0.7 + h - 0.2, 0, [w + 0.1, 0.25, d + 0.1], {}, 0);
  const roof = rand() < 0.6 ? m.tileRoof : m.thatch;
  part(inst, prism, roof, o, 0, 0.7 + h, 0, [w + 1.4, 2.6, d + 1.4], { ry: Math.PI / 2 }, 0.03);
  part(inst, box, m.ink, o, 0, 0.7 + h + 2.2, 0, [0.35, 0.3, d + 1.6], { ry: Math.PI / 2 }, 0);
  // door and glowing windows on the front face
  part(inst, box, m.darkWood, o, -w * 0.18, 0.7, d / 2 + 0.02, [1.1, 1.9, 0.08], {}, 0);
  part(inst, box, m.windowLight, o, w * 0.22, 1.5, d / 2 + 0.02, [1.2, 0.8, 0.08], {}, 0);
  part(inst, box, m.windowLight, o, w / 2 + 0.02, 1.5, 0, [0.08, 0.8, 1.1], {}, 0);
  colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
}

function shrine(inst, colliders, x, z) {
  const o = { x, y: heightAt(x, z) - 0.3, z, ry: 0, s: 1 };
  part(inst, box, m.darkStone, o, 0, 0, 0, [9, 1.1, 8]);
  part(inst, box, m.stone, o, 0, 0, 4.6, [3, 0.6, 1.4]);
  part(inst, box, m.vermilion, o, 0, 1.1, 0, [6.2, 0.4, 5.2]);
  part(inst, box, m.plaster, o, 0, 1.5, 0, [5.6, 3, 4.6]);
  for (const cx of [-2.9, -1, 1, 2.9]) part(inst, cyl, m.vermilion, o, cx, 1.1, 2.45, [0.18, 3.5, 0.18]);
  part(inst, box, m.vermilion, o, 0, 4.2, 0, [6.6, 0.4, 5.6]);
  part(inst, prism, m.copperRoof, o, 0, 4.6, 0, [7.6, 3.4, 8.8], {}, 0.03);
  part(inst, box, m.ink, o, 0, 7.35, 0, [0.4, 0.35, 8.9], {}, 0);
  part(inst, box, m.wood, o, 0, 1.1, 3.6, [1.6, 0.9, 0.8]);
  // shimenawa rope over the entrance, with paper shide
  part(inst, cyl, m.straw, o, 2.7, 3.6, 2.7, [0.22, 5.4, 0.22], { rz: Math.PI / 2 }, 0);
  for (const sx of [-1.8, -0.6, 0.6, 1.8]) part(inst, box, m.paper, o, sx, 2.9, 2.75, [0.28, 0.65, 0.03], {}, 0);
  colliders.push({ x, z, r: 5 });
}

function paperLanternPost(inst, colliders, x, z) {
  const o = { x, y: heightAt(x, z), z, ry: 0, s: 1 };
  part(inst, cyl, m.darkWood, o, 0, 0, 0, [0.08, 3.2, 0.08], {}, 0);
  part(inst, box, m.darkWood, o, 0.35, 3.1, 0, [0.8, 0.08, 0.08], {}, 0);
  part(inst, ball, m.paperLantern, o, 0.7, 2.55, 0, [0.32, 0.42, 0.32], {}, 0.08);
  part(inst, cyl, m.ink, o, 0.7, 2.94, 0, [0.2, 0.08, 0.2], {}, 0);
  part(inst, cyl, m.ink, o, 0.7, 2.08, 0, [0.2, 0.08, 0.2], {}, 0);
  colliders.push({ x, z, r: 0.3 });
}

function pier(inst, lake) {
  const x = lake.x, z0 = lake.z + 34, z1 = lake.z + 17;
  const o = { x, y: 0.55, z: (z0 + z1) / 2, ry: 0, s: 1 };
  const len = z0 - z1;
  for (let i = 0; i < len / 0.7; i++) {
    part(inst, box, i % 2 ? m.wood : m.darkWood, o, 0, 0, -len / 2 + i * 0.7 + 0.35, [2.4, 0.16, 0.62], {}, 0);
  }
  for (let zz = -len / 2; zz <= len / 2; zz += 3.4) {
    for (const sx of [-1.2, 1.2]) part(inst, cyl, m.darkWood, o, sx, -4, zz, [0.12, 4.9, 0.12], {}, 0);
  }
  // a little moored boat
  const b = { x: x + 2.4, y: 0.05, z: z1 + 3, ry: 0.1, s: 1 };
  part(inst, box, m.wood, b, 0, 0, 0, [1.2, 0.45, 3.6], {}, 0.06);
  part(inst, box, m.darkWood, b, 0, 0.45, 0, [1.3, 0.1, 3.7], {}, 0);
}

export function createStructures(rand, colliders, camphor) {
  const inst = new Instancer();
  const { lake, village, shrineHill } = WORLD;

  // senbon torii tunnel up the shrine hill, plus a gate in the lake
  torii(inst, colliders, 0, -52, 0, 1.25);
  for (let z = -60; z >= -100; z -= 3.1) torii(inst, colliders, 0, z, 0, 0.95);
  torii(inst, colliders, lake.x, lake.z - 4, 0, 2.3, -0.8);
  shrine(inst, colliders, shrineHill.x, shrineHill.z + 6);
  stoneLantern(inst, colliders, -3.2, shrineHill.z + 13, 0, 1.2);
  stoneLantern(inst, colliders, 3.2, shrineHill.z + 13, 0, 1.2);

  // stone lanterns lining the dirt paths
  for (const line of PATHS) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let t = 6; t < len; t += 13) {
        const side = Math.floor(t / 13) % 2 ? 1 : -1;
        const px = ax + ((bx - ax) * t) / len + nx * 2.8 * side;
        const pz = az + ((bz - az) * t) / len + nz * 2.8 * side;
        if (pz < -56 && Math.abs(px) < 4) continue; // inside the torii tunnel
        if (heightAt(px, pz) > 0.8) stoneLantern(inst, colliders, px, pz);
      }
    }
  }

  // village: houses ringed around a small square
  const houses = 8;
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + 0.3;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.35) continue; // leave the east entrance open
    const r = 16 + rand() * 4;
    const x = village.x + Math.cos(a) * r, z = village.z + Math.sin(a) * r;
    house(inst, colliders, x, z, Math.atan2(village.x - x, village.z - z), rand);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    paperLanternPost(inst, colliders, village.x + Math.cos(a) * 8, village.z + Math.sin(a) * 8);
  }

  pier(inst, lake);

  // shimenawa around the camphor trunk
  const co = { x: camphor.x, y: camphor.y, z: camphor.z, ry: 0, s: 1 };
  inst.add(new THREE.TorusGeometry(1.55, 0.2, 8, 32).rotateX(Math.PI / 2), m.straw,
    mat(camphor.x, camphor.y + 3.4, camphor.z), 0.05);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(inst, box, m.paper, co, Math.cos(a) * 1.72, 2.7, Math.sin(a) * 1.72, [0.3, 0.6, 0.03], { ry: -a + Math.PI / 2 }, 0);
  }

  // shoreline and mountain boulders
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const near = i < 30;
    const r = near ? lake.r * (0.72 + rand() * 0.2) : 110 + rand() * 60;
    const x = (near ? lake.x : 0) + Math.cos(a) * r, z = (near ? lake.z : 0) + Math.sin(a) * r;
    const s = near ? 0.6 + rand() * 1.2 : 1.5 + rand() * 3;
    inst.add(rock, m.rock, mat(x, heightAt(x, z) - s * 0.3, z, { rx: rand(), ry: rand() * 6, sx: s, sy: s * 0.7, sz: s * 1.1 }), 0.06);
  }

  const glowMaterials = [m.lanternLight, m.windowLight, m.paperLantern];
  return { group: inst.build(), glowMaterials };
}
