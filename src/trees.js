import * as THREE from "three";
import { toon } from "./toon.js";
import { Instancer, mat } from "./instancer.js";
import { WORLD, heightAt, slopeAt, distToPath } from "./terrain.js";

const geo = {
  trunk: new THREE.CylinderGeometry(0.22, 0.38, 1, 7).translate(0, 0.5, 0),
  blob: new THREE.IcosahedronGeometry(1, 1),
  cone: new THREE.ConeGeometry(1, 1.4, 8).translate(0, 0.7, 0),
};

// blossoms glow a little so they stay pink even when backlit
const blossom = (c) => toon(c, { extra: { emissive: c, emissiveIntensity: 0.32 } });

const mats = {
  bark: toon("#6b4a3a"),
  pineBark: toon("#5a3f35"),
  sakuraA: blossom("#ffb8d2"),
  sakuraB: blossom("#ffd6e6"),
  sakuraC: blossom("#fba3c6"),
  leafA: toon("#5fae4b"),
  leafB: toon("#7fc65a"),
  leafC: toon("#4a9444"),
  pineA: toon("#3c7a55"),
  pineB: toon("#2f6849"),
};

function canopy(inst, rand, x, y, z, size, materials, count) {
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * size * 0.75;
    const s = size * (0.45 + rand() * 0.35);
    const m = materials[Math.floor(rand() * materials.length)];
    inst.add(geo.blob, m, mat(x + Math.cos(a) * r, y + (rand() - 0.3) * size * 0.5, z + Math.sin(a) * r, {
      ry: rand() * 6, sx: s, sy: s * 0.85, sz: s,
    }), 0.07);
  }
}

function sakura(inst, rand, x, z, scale = 1) {
  const y = heightAt(x, z);
  const h = (3.2 + rand() * 1.6) * scale;
  inst.add(geo.trunk, mats.bark, mat(x, y, z, { sx: scale, sy: h, rz: (rand() - 0.5) * 0.15 }), 0.08);
  for (let b = 0; b < 3; b++) {
    const a = rand() * Math.PI * 2;
    inst.add(geo.trunk, mats.bark, mat(x, y + h * 0.6, z, {
      ry: a, rz: 0.7 + rand() * 0.3, sx: scale * 0.55, sy: h * 0.55, sz: scale * 0.55,
    }), 0.1);
  }
  canopy(inst, rand, x, y + h + 0.6 * scale, z, 2.9 * scale, [mats.sakuraA, mats.sakuraB, mats.sakuraC], 9);
}

function broadleaf(inst, rand, x, z, scale = 1) {
  const y = heightAt(x, z);
  const h = (2.6 + rand() * 1.8) * scale;
  inst.add(geo.trunk, mats.bark, mat(x, y, z, { sx: scale, sy: h }), 0.08);
  canopy(inst, rand, x, y + h + 1.2 * scale, z, 2.6 * scale, [mats.leafA, mats.leafB, mats.leafC], 7);
}

function pine(inst, rand, x, z, scale = 1) {
  const y = heightAt(x, z);
  inst.add(geo.trunk, mats.pineBark, mat(x, y, z, { sx: scale * 0.8, sy: 2.2 * scale }), 0);
  const tiers = 3 + Math.floor(rand() * 2);
  for (let t = 0; t < tiers; t++) {
    const s = (2.4 - t * 0.5) * scale;
    inst.add(geo.cone, t % 2 ? mats.pineB : mats.pineA,
      mat(x, y + (1.6 + t * 1.25) * scale, z, { ry: rand() * 6, sx: s, sy: s * 1.1 }), 0.06);
  }
}

// The old camphor tree: the heart of the valley, wrapped in a sacred rope.
function camphor(inst, x, z) {
  const y = heightAt(x, z) - 0.3;
  inst.add(geo.trunk, mats.bark, mat(x, y, z, { sx: 4.2, sy: 11 }), 0.04);
  const roots = [0, 1.3, 2.5, 3.8, 5.1];
  roots.forEach((a) => inst.add(geo.trunk, mats.bark, mat(x + Math.cos(a) * 1.2, y, z + Math.sin(a) * 1.2, {
    ry: -a, rz: 1.1, sx: 1.6, sy: 3.2, sz: 1.6,
  }), 0.06));
  for (let b = 0; b < 5; b++) {
    const a = b * 1.25 + 0.4;
    inst.add(geo.trunk, mats.bark, mat(x, y + 8.5, z, { ry: a, rz: 0.9, sx: 1.8, sy: 7, sz: 1.8 }), 0.06);
  }
  const blobs = [
    [0, 16, 0, 7.5], [6, 14, 2, 5.5], [-5, 14.5, -3, 6], [2, 13.5, -6, 5.2], [-3, 13, 6, 5.4],
    [7, 12, -4, 4.4], [-7, 12.5, 3, 4.6], [0, 19.5, 1, 5], [4, 17.5, 4, 4.8], [-4, 18, -2, 4.6],
  ];
  blobs.forEach(([bx, by, bz, s], i) => inst.add(geo.blob, [mats.leafA, mats.leafC, mats.leafB][i % 3],
    mat(x + bx, y + by, z + bz, { ry: i, sx: s, sy: s * 0.8, sz: s }), 0.05));
  return { x, y, z };
}

export function createTrees(rand, colliders) {
  const inst = new Instancer();
  const { lake, village, shrineHill, camphorHill } = WORLD;
  const clear = (x, z, pad) =>
    distToPath(x, z) > pad &&
    Math.hypot(x - lake.x, z - lake.z) > lake.r + 1 &&
    Math.hypot(x - village.x, z - village.z) > village.r * 0.8 &&
    Math.hypot(x - camphorHill.x, z - camphorHill.z) > 14 &&
    Math.hypot(x - shrineHill.x, z - (shrineHill.z + 8)) > 12;

  const place = (fn, n, rMin, rMax, pad, collide) => {
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 30; tries++) {
      const a = rand() * Math.PI * 2;
      const r = rMin + Math.sqrt(rand()) * (rMax - rMin);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!clear(x, z, pad) || heightAt(x, z) < 1 || slopeAt(x, z) > 1) continue;
      fn(inst, rand, x, z, 0.8 + rand() * 0.5);
      if (collide) colliders.push({ x, z, r: 0.6 });
      placed++;
    }
  };

  // sakura groves: along the shrine approach, the lakeshore and the village
  const groves = [
    [0, -80, 16, 14], [lake.x - 30, lake.z + 26, 12, 8], [village.x + 4, village.z - 26, 12, 7],
    [lake.x + 36, lake.z - 10, 12, 7], [-20, 36, 10, 5],
  ];
  for (const [gx, gz, spread, n] of groves) {
    for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
      const x = gx + (rand() - 0.5) * spread * 2, z = gz + (rand() - 0.5) * spread * 2;
      if (!clear(x, z, 3.5) || heightAt(x, z) < 1) continue;
      sakura(inst, rand, x, z, 0.9 + rand() * 0.4);
      colliders.push({ x, z, r: 0.6 });
      i++;
    }
  }

  place(broadleaf, 90, 25, 150, 3, true);
  place(pine, 320, 125, 215, 3, true);

  const ct = camphor(inst, camphorHill.x, camphorHill.z);
  colliders.push({ x: ct.x, z: ct.z, r: 2.6 });

  return { group: inst.build(), camphor: ct };
}
