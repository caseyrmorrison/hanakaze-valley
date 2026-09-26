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
  // Kirifuri Falls: a spring on a mesa pours off a cliff into a pool, then a river runs to the lake.
  falls: { x: 128, z: -100, top: 24, pool: 2.2 },
  // A single-track rural line crossing the south of the valley between two mountain tunnels.
  railway: { z: 100, y: 8.5, tunnelX: 150 },
  station: { x0: -15, x1: 15, z0: 102.6, z1: 107 },
  paddies: { x0: -76, x1: -22, z0: 110, z1: 138, cols: 4, rows: 3 },
};

// River course in downstream order: spring, lip of the falls, then down to the lake.
export const RIVER = [[158, -118], [128, -100], [112, -88], [96, -72], [82, -58], [64, -44]];
const FLOW = (() => {
  const [a, b] = [RIVER[1], RIVER[2]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { x: (b[0] - a[0]) / len, z: (b[1] - a[1]) / len };
})();
export const FALLS_DIR = FLOW;

// Dirt paths as polylines; used for terrain color and to keep grass off them.
export const PATHS = [
  [[0, 60], [0, 20], [-2, -20], [0, -58], [0, -104]],
  [[0, 20], [-25, 22], [-58, 22]],
  [[-2, -10], [18, -2], [40, 6], [70, 40], [88, 62]],
  [[0, 60], [0, 90], [0, 103.2]],
  [[40, 6], [66, -8], [92, -40], [106, -62], [116, -78]],
  [[-58, 22], [-52, 50], [-46, 80], [-45, 100], [-47, 108]],
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

// Distance to the river and where along it you are (u: 0 at the falls, 1 at the lake).
const RIVER_LENGTHS = RIVER.slice(1, -1).map((a, i) => Math.hypot(RIVER[i + 2][0] - a[0], RIVER[i + 2][1] - a[1]));
const RIVER_TOTAL = RIVER_LENGTHS.reduce((a, b) => a + b, 0);

export function riverInfo(x, z) {
  let best = { d: Infinity, u: 0, upper: false };
  let run = 0;
  const lengths = RIVER_LENGTHS, total = RIVER_TOTAL;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
    if (d < best.d) {
      best = { d, upper: i === 0, u: i === 0 ? 0 : (run + t * lengths[i - 1]) / total };
    }
    if (i > 0) run += lengths[i - 1];
  }
  return best;
}

// Water surface height along the lower river.
export function riverSurface(u) {
  return THREE.MathUtils.lerp(WORLD.falls.pool, 0.05, Math.pow(u, 0.8));
}

// Signed distance upstream of the cliff line at the falls, and sideways along it.
function fallsFrame(x, z) {
  const f = WORLD.falls;
  const rx = x - f.x, rz = z - f.z;
  return { s: -(rx * FLOW.x + rz * FLOW.z), lat: rx * -FLOW.z + rz * FLOW.x };
}

function paddyPlot(x, z) {
  const p = WORLD.paddies;
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return null;
  const w = (p.x1 - p.x0) / p.cols, d = (p.z1 - p.z0) / p.rows;
  const i = Math.min(p.cols - 1, Math.floor((x - p.x0) / w));
  const j = Math.min(p.rows - 1, Math.floor((z - p.z0) / d));
  const lx = x - (p.x0 + i * w), lz = z - (p.z0 + j * d);
  return { i, j, edge: Math.min(lx, w - lx, lz, d - lz) };
}

// Each paddy's water level, stepped so the terraces read clearly.
const paddyLevels = new Map();
export function paddyLevel(i, j) {
  const key = i * 10 + j;
  if (!paddyLevels.has(key)) {
    const p = WORLD.paddies;
    const cx = p.x0 + (i + 0.5) * ((p.x1 - p.x0) / p.cols);
    const cz = p.z0 + (j + 0.5) * ((p.z1 - p.z0) / p.rows);
    paddyLevels.set(key, Math.round(baseHeight(cx, cz) / 0.7) * 0.7 + 0.2);
  }
  return paddyLevels.get(key);
}

// 0..1: how much a spot is taken by river, railway bed or paddies (no grass or trees there).
export function builtUp(x, z) {
  const { railway: rw, paddies: p } = WORLD;
  const river = 1 - smoothstep(3.5, 5.5, riverInfo(x, z).d);
  const track = (1 - smoothstep(3, 4.5, Math.abs(z - rw.z))) * (1 - smoothstep(rw.tunnelX - 2, rw.tunnelX + 2, Math.abs(x)));
  const paddy = x > p.x0 - 1 && x < p.x1 + 1 && z > p.z0 - 1 && z < p.z1 + 1 ? 1 : 0;
  const st = WORLD.station;
  const station = x > st.x0 - 1.5 && x < st.x1 + 1.5 && z > st.z0 - 1 && z < st.z1 + 2 ? 1 : 0;
  return Math.max(river, track, paddy, station);
}

function bump(x, z, cx, cz, r, h) {
  const d = Math.hypot(x - cx, z - cz) / r;
  return d >= 1 ? 0 : h * (Math.cos(d * Math.PI) * 0.5 + 0.5);
}

let forecourtHeight;

export function heightAt(x, z) {
  let h = baseHeight(x, z);

  // stepped paddies: flooded beds framed by low levees
  const plot = paddyPlot(x, z);
  if (plot) {
    const level = paddyLevel(plot.i, plot.j);
    h = plot.edge < 0.5 ? level + 0.15 : level - 0.3;
  } else {
    const p = WORLD.paddies;
    const ox = Math.max(p.x0 - x, 0, x - p.x1), oz = Math.max(p.z0 - z, 0, z - p.z1);
    const near = Math.hypot(ox, oz);
    if (near < 4) {
      const ex = THREE.MathUtils.clamp(x, p.x0 + 0.1, p.x1 - 0.1), ez = THREE.MathUtils.clamp(z, p.z0 + 0.1, p.z1 - 0.1);
      const edge = paddyPlot(ex, ez);
      h = THREE.MathUtils.lerp(paddyLevel(edge.i, edge.j) + 0.15, h, smoothstep(0, 4, near));
    }
  }
  return h;
}

function baseHeight(x, z) {
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

  // the mesa behind Kirifuri Falls, ending in a sheer cliff
  const fl = WORLD.falls;
  const ff = fallsFrame(x, z);
  const mesa = smoothstep(-1.2, 1.2, ff.s) * (1 - smoothstep(20, 36, Math.abs(ff.lat)));
  h = THREE.MathUtils.lerp(h, Math.max(h, fl.top), mesa);

  // lake basin
  const dl = Math.hypot(x - l.x, z - l.z);
  h = THREE.MathUtils.lerp(-5, h, smoothstep(l.r * 0.45, l.r, dl + fbm(x * 0.05, z * 0.05) * 6));

  // river channel: shallow on the mesa, deeper below the falls, with a plunge pool
  const ri = riverInfo(x, z);
  if (ri.d < 12) {
    if (ri.upper) {
      const bed = fl.top - 2;
      h = Math.min(h, THREE.MathUtils.lerp(bed, h, smoothstep(2.5, 6, ri.d) + (1 - smoothstep(-0.5, 0.5, ff.s))));
    } else {
      const bed = riverSurface(ri.u) - 1.1;
      const below = 1 - smoothstep(-0.5, 1, ff.s);
      h = Math.min(h, THREE.MathUtils.lerp(h, THREE.MathUtils.lerp(bed, h, smoothstep(3, 9, ri.d)), below));
    }
  }
  const px = fl.x + FLOW.x * 3, pz = fl.z + FLOW.z * 3;
  const dp = Math.hypot(x - px, z - pz);
  if (dp < 12 && ff.s < 0.5) h = Math.min(h, THREE.MathUtils.lerp(fl.pool - 1.8, h, smoothstep(5, 11, dp)));

  // railway bed: cut and fill to one level between the tunnel portals
  const rw = WORLD.railway;
  const inside = 1 - smoothstep(rw.tunnelX - 4, rw.tunnelX + 2, Math.abs(x));
  h = THREE.MathUtils.lerp(h, rw.y - 0.35, (1 - smoothstep(3.2, 10, Math.abs(z - rw.z))) * inside);

  // station platform, level with the doors, ramping down to the north
  const st = WORLD.station;
  if (z >= st.z0 - 0.3) {
    const sx = Math.max(st.x0 - x, 0, x - st.x1), sz = Math.max(0, z - st.z1);
    h = THREE.MathUtils.lerp(rw.y + 0.55, h, smoothstep(0, 5, Math.hypot(sx, sz)));
  }

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
  ballast: new THREE.Color("#a3968a"),
  mud: new THREE.Color("#8c7a52"),
  wetRock: new THREE.Color("#6d6a80"),
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

    const ri = riverInfo(x, z);
    col.lerp(C.lakebed, 1 - smoothstep(2.5, 4, ri.d));
    col.lerp(C.wetRock, (1 - smoothstep(6, 14, Math.hypot(x - WORLD.falls.x, z - WORLD.falls.z))) * 0.6);
    const rw = WORLD.railway;
    col.lerp(C.ballast, (1 - smoothstep(2.4, 3.2, Math.abs(z - rw.z))) * (1 - smoothstep(rw.tunnelX - 2, rw.tunnelX + 1, Math.abs(x))));
    const pd = WORLD.paddies;
    if (x > pd.x0 && x < pd.x1 && z > pd.z0 && z < pd.z1) col.lerp(C.mud, 0.85);

    colors.set([col.r, col.g, col.b], i * 3);
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, toon(0xffffff, { extra: { vertexColors: true } }));
  mesh.receiveShadow = true;
  return mesh;
}
