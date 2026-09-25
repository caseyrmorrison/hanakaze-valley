import * as THREE from "three";
import { toon } from "./toon.js";

// ---------- noise ----------
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- world layout ----------
export const WORLD = {
  size: 540,
  walkRadius: 165,
  lake: { x: 32, z: -38, r: 40 },
  shrineHill: { x: 0, z: -122, r: 40, h: 20 },
  camphorHill: { x: 88, z: 62, r: 32, h: 11 },
  village: { x: -58, z: 22, r: 30, h: 4 },
  forecourt: { x: 0, z: -113, r: 9 },
  spawn: { x: 0, z: 46 },
};

// Dirt paths as polylines; used for terrain color and to keep grass off them.
export const PATHS = [
  [[0, 60], [0, 20], [-2, -20], [0, -58], [0, -104]],
  [[0, 20], [-25, 22], [-58, 22]],
  [[-2, -10], [18, -2], [40, 6], [70, 40], [88, 62]],
];

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function distToPath(x, z) {
  // the village square and shrine forecourt count as path: packed dirt, no grass
  const { village, forecourt } = WORLD;
  let d = Math.max(0, Math.hypot(x - village.x, z - village.z) - 11);
  d = Math.min(d, Math.max(0, Math.hypot(x - forecourt.x, z - forecourt.z) - forecourt.r + 1.5));
  for (const line of PATHS) {
    for (let i = 0; i < line.length - 1; i++) {
      d = Math.min(d, distToSegment(x, z, ...line[i], ...line[i + 1]));
    }
  }
  return d;
}

function bump(x, z, cx, cz, r, h) {
  const d = Math.hypot(x - cx, z - cz) / r;
  return d >= 1 ? 0 : h * (Math.cos(d * Math.PI) * 0.5 + 0.5);
}

let forecourtHeight;

export function heightAt(x, z) {
  let h = 2.5 + (fbm(x * 0.011, z * 0.011) * 0.5 + 0.5) * 7;

  const { shrineHill: s, camphorHill: c, village: v, lake: l } = WORLD;
  h += bump(x, z, s.x, s.z, s.r, s.h);
  h += bump(x, z, c.x, c.z, c.r, c.h);

  // level forecourt in front of the shrine
  const f = WORLD.forecourt;
  forecourtHeight ??= 2.5 + (fbm(f.x * 0.011, f.z * 0.011) * 0.5 + 0.5) * 7 + bump(f.x, f.z, s.x, s.z, s.r, s.h);
  h = THREE.MathUtils.lerp(forecourtHeight, h, smoothstep(f.r, f.r + 5, Math.hypot(x - f.x, z - f.z)));

  // flatten the village terrace
  const dv = Math.hypot(x - v.x, z - v.z);
  h = THREE.MathUtils.lerp(v.h, h, smoothstep(v.r * 0.6, v.r, dv));

  // encircling mountains
  const r = Math.hypot(x, z);
  const ridge = 1 - Math.abs(fbm(x * 0.008 + 7, z * 0.008 - 3, 5));
  h += smoothstep(155, 255, r) * (30 + ridge * ridge * 60);

  // lake basin
  const dl = Math.hypot(x - l.x, z - l.z);
  h = THREE.MathUtils.lerp(-5, h, smoothstep(l.r * 0.45, l.r, dl + fbm(x * 0.05, z * 0.05) * 6));

  return h;
}

export function slopeAt(x, z) {
  const e = 0.8;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// ---------- mesh ----------
const C = {
  grassA: new THREE.Color("#5fb04a"),
  grassB: new THREE.Color("#9ed45c"),
  meadow: new THREE.Color("#c6de6a"),
  path: new THREE.Color("#dcbb8a"),
  sand: new THREE.Color("#ecdcaa"),
  rock: new THREE.Color("#8d8aa3"),
  forest: new THREE.Color("#3f7d52"),
  slate: new THREE.Color("#7e8bbb"),
  snow: new THREE.Color("#f6f7ff"),
  lakebed: new THREE.Color("#5f8c7c"),
};

export function createTerrain() {
  const seg = 280;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, seg, seg);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = pos.getY(i);

    const n = fbm(x * 0.04, z * 0.04) * 0.5 + 0.5;
    col.copy(C.grassA).lerp(C.grassB, n);
    col.lerp(C.meadow, smoothstep(0.35, 0.75, fbm(x * 0.015 + 40, z * 0.015)) * 0.6);

    const ny = nrm.getY(i);
    const slope = Math.sqrt(1 - ny * ny) / ny;
    col.lerp(C.forest, smoothstep(12, 28, h) * 0.9);
    col.lerp(C.rock, smoothstep(1.1, 1.7, slope) * 0.7);
    col.lerp(C.slate, smoothstep(38, 62, h + n * 6));
    col.lerp(C.snow, smoothstep(76, 88, h + n * 8));
    col.lerp(C.sand, 1 - smoothstep(0.4, 1.4, h));
    col.lerp(C.lakebed, 1 - smoothstep(-1.5, 0, h));
    col.lerp(C.path, 1 - smoothstep(1.3, 2.2, distToPath(x, z)));

    colors.set([col.r, col.g, col.b], i * 3);
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, toon(0xffffff, { extra: { vertexColors: true } }));
  mesh.receiveShadow = true;
  return mesh;
}
