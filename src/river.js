import * as THREE from "three";
import { toon } from "./toon.js";
import { Instancer, mat } from "./instancer.js";
import { WORLD, RIVER, FALLS_DIR, riverSurface, heightAt } from "./terrain.js";

const common = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
`;

const flowVert = /* glsl */ `
  #include <fog_pars_vertex>
  attribute float aSpeed;
  varying vec2 vUv;
  varying float vSpeed;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vSpeed = aSpeed;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

// Rivers: uv.x runs across the channel, uv.y is meters downstream.
const riverFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying float vSpeed;
  ${common}
  void main() {
    float across = abs(vUv.x - 0.5) * 2.0;
    vec3 col = mix(uDeep, uShallow, smoothstep(0.2, 1.0, across));
    float flow = vUv.y - uTime * vSpeed;
    float streak = noise(vec2(vUv.x * 7.0, flow * 0.35)) * noise(vec2(vUv.x * 13.0 + 3.0, flow * 0.8));
    col = mix(col, vec3(1.0), smoothstep(0.32, 0.42, streak) * 0.75);
    float bank = smoothstep(0.78, 0.95, across + noise(vec2(flow * 0.6, vUv.x * 4.0)) * 0.15);
    col = mix(col, vec3(1.0), bank * 0.85);
    gl_FragColor = vec4(col * uTint, 0.9);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// The falling sheet: bright streaks racing downward, feathered at the edges.
const fallsFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uTint;
  varying vec2 vUv;
  ${common}
  void main() {
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    float fall = vUv.y * 6.0 + uTime * 2.6;
    float streaks = noise(vec2(vUv.x * 22.0, fall)) * 0.7 + noise(vec2(vUv.x * 9.0, fall * 0.5)) * 0.5;
    vec3 col = mix(vec3(0.55, 0.8, 0.95), vec3(1.0), smoothstep(0.45, 0.8, streaks) + vUv.y * 0.35);
    float alpha = edge * (0.55 + 0.4 * smoothstep(0.3, 0.7, streaks));
    gl_FragColor = vec4(col * uTint, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const poolFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uTint;
  uniform vec2 uImpact;
  varying vec3 vWorld;
  ${common}
  void main() {
    float d = distance(vWorld.xz, uImpact);
    float churn = noise(vWorld.xz * 0.9 + vec2(uTime * 0.7, -uTime * 0.5)) + noise(vWorld.xz * 2.1 - uTime);
    float foam = smoothstep(4.5, 0.5, d) * smoothstep(0.7, 1.2, churn + 0.6 - d * 0.08);
    float rings = smoothstep(0.85, 1.0, sin(d * 2.4 - uTime * 3.0)) * smoothstep(7.0, 2.0, d) * 0.5;
    vec3 col = mix(uDeep, vec3(1.0), clamp(foam + rings, 0.0, 1.0));
    gl_FragColor = vec4(col * uTint, 0.92);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function material(fragmentShader, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uDeep: { value: new THREE.Color("#2f7fb8") },
      uShallow: { value: new THREE.Color("#5ed2d6") },
      uImpact: { value: new THREE.Vector2() },
      ...extra,
    }]),
    vertexShader: flowVert,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
}

// A ribbon following a polyline. heightFn(u) gives the water level, widthFn(u) the width.
function ribbon(points, heightFn, widthFn, speedFn, step = 1) {
  const samples = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  let run = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n + (i === points.length - 2 ? 1 : 0); k++) {
      const t = k / n;
      samples.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, dist: run + len * t, tx: (bx - ax) / len, tz: (bz - az) / len });
    }
    run += len;
  }
  const pos = [], uv = [], speed = [], idx = [];
  samples.forEach((s, i) => {
    const u = s.dist / total, w = widthFn(u) / 2, y = heightFn(u);
    const nx = -s.tz, nz = s.tx;
    pos.push(s.x + nx * w, y, s.z + nz * w, s.x - nx * w, y, s.z - nz * w);
    uv.push(0, s.dist, 1, s.dist);
    speed.push(speedFn(u), speedFn(u));
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speed, 1));
  g.setIndex(idx);
  return g;
}

function fallsSheet(lip, dir, top, bottom, width) {
  const cols = 10, rows = 24;
  const px = -dir.z, pz = dir.x;
  const pos = [], uv = [], speed = [], idx = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const out = 0.2 + 2.4 * v * v;
    const y = THREE.MathUtils.lerp(top, bottom, v);
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const side = (u - 0.5) * width * (1 + v * 0.35);
      pos.push(lip.x + dir.x * out + px * side, y, lip.z + dir.z * out + pz * side);
      uv.push(u, v);
      speed.push(0);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + cols + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speed, 1));
  g.setIndex(idx);
  return g;
}

const mistVert = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute vec4 aSeed;
  varying float vAlpha;
  void main() {
    float phase = fract(aSeed.w + uTime * 0.12);
    vec3 p = position + vec3(aSeed.x * (1.0 + phase * 3.0), phase * 7.0, aSeed.z * (1.0 + phase * 3.0));
    vAlpha = sin(phase * 3.14159) * 0.28;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (90.0 + phase * 160.0) * uPixelRatio / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const mistFrag = /* glsl */ `
  uniform vec3 uTint;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(uTint, smoothstep(0.5, 0.0, d) * vAlpha);
  }
`;

function mist(at, count = 60) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos.set([at.x + (Math.random() - 0.5) * 3, at.y, at.z + (Math.random() - 0.5) * 3], i * 3);
    seed.set([(Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2, Math.random()], i * 4);
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const points = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms, vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false,
  }));
  points.frustumCulled = false;
  return { points, uniforms };
}

// Viewing deck with a railing, a bench and a small jizo statue in a red bib.
function viewpoint(inst, colliders, x, z, facing) {
  const wood = toon("#8a5d3e"), dark = toon("#5a3d2c"), stone = toon("#a9a4b2"), red = toon("#d8323c");
  const y = heightAt(x, z) + 0.35;
  const c = Math.cos(facing), s = Math.sin(facing);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [dx, dz] = at(0, 0);
  inst.add(new THREE.BoxGeometry(1, 1, 1), wood, mat(dx, y, dz, { ry: facing, sx: 4.5, sy: 0.18, sz: 3.2 }), 0.03);
  for (const [lx, lz] of [[-2.1, -1.5], [2.1, -1.5], [-2.1, 1.5], [2.1, 1.5]]) {
    const [px, pz] = at(lx, lz);
    inst.add(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), dark, mat(px, heightAt(px, pz) + 0.3, pz, { sy: 1.2 }), 0);
    inst.add(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), dark, mat(px, y + 0.55, pz, { sy: 1 }), 0);
  }
  const [rx, rz] = at(0, 1.5);
  inst.add(new THREE.BoxGeometry(1, 1, 1), wood, mat(rx, y + 1.0, rz, { ry: facing, sx: 4.4, sy: 0.08, sz: 0.1 }), 0.05);
  const [bx, bz] = at(0, -0.9);
  inst.add(new THREE.BoxGeometry(1, 1, 1), dark, mat(bx, y + 0.45, bz, { ry: facing, sx: 1.8, sy: 0.08, sz: 0.45 }), 0.05);
  const [jx, jz] = at(-3.2, -0.6);
  const jy = heightAt(jx, jz);
  inst.add(new THREE.CylinderGeometry(0.2, 0.26, 1, 12), stone, mat(jx, jy + 0.3, jz, { sy: 0.6 }), 0.06);
  inst.add(new THREE.SphereGeometry(0.17, 14, 10), stone, mat(jx, jy + 0.75, jz), 0.06);
  inst.add(new THREE.ConeGeometry(0.24, 0.26, 12), red, mat(jx, jy + 0.52, jz, { ry: facing }), 0.06);
  colliders.push({ x: jx, z: jz, r: 0.3 });
}

export function createRiver(colliders) {
  const group = new THREE.Group();
  const fl = WORLD.falls, dir = FALLS_DIR;
  const materials = [];
  const track = (m) => (materials.push(m), m);

  // lower river: from just below the falls into the lake
  const start = [fl.x + dir.x * 3, fl.z + dir.z * 3];
  const lower = [start, ...RIVER.slice(2), [RIVER.at(-1)[0] - 8, RIVER.at(-1)[1] + 5]];
  const lowerMesh = new THREE.Mesh(
    ribbon(lower, (u) => Math.max(0.03, riverSurface(u) + 0.02), (u) => 6.6 + u * 2.5, (u) => 1.6 - u * 0.8),
    track(material(riverFrag)),
  );
  group.add(lowerMesh);

  // the stream across the mesa, ending at the lip
  const lip = { x: fl.x - dir.x * 0.3, z: fl.z - dir.z * 0.3 };
  const upper = [RIVER[0], [lip.x, lip.z]];
  group.add(new THREE.Mesh(ribbon(upper, () => fl.top - 0.95, () => 4.2, () => 2.2), track(material(riverFrag))));

  // the falls themselves
  const sheet = new THREE.Mesh(fallsSheet(lip, dir, fl.top - 0.95, fl.pool, 4.6), track(material(fallsFrag)));
  sheet.renderOrder = 2;
  group.add(sheet);

  const impact = new THREE.Vector2(fl.x + dir.x * 2.6, fl.z + dir.z * 2.6);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 40).rotateX(-Math.PI / 2), track(material(poolFrag, { uImpact: { value: impact } })));
  pool.position.set(fl.x + dir.x * 3.4, fl.pool + 0.03, fl.z + dir.z * 3.4);
  group.add(pool);

  const spray = mist({ x: impact.x, y: fl.pool + 0.2, z: impact.y });
  group.add(spray.points);

  // wet boulders around the pool and along the lip
  const inst = new Instancer();
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = toon("#77738a", { extra: { flatShading: true } });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
    const r = 6 + Math.random() * 2.5;
    const x = pool.position.x + Math.cos(a) * r, z = pool.position.z + Math.sin(a) * r;
    const s = 0.7 + Math.random() * 1.2;
    inst.add(rock, rockMat, mat(x, heightAt(x, z) - s * 0.2, z, { rx: Math.random(), ry: Math.random() * 6, sx: s, sy: s * 0.7, sz: s * 1.1 }), 0.05);
    if (s > 1.2) colliders.push({ x, z, r: s * 0.8 });
  }
  for (const side of [-1, 1]) {
    const x = lip.x - dir.z * side * 3.2, z = lip.z + dir.x * side * 3.2;
    inst.add(rock, rockMat, mat(x, fl.top - 0.6, z, { ry: side, sx: 1.4, sy: 1, sz: 1.2 }), 0.05);
  }
  viewpoint(inst, colliders, 116, -78, Math.atan2(fl.x - 116, fl.z + 78));
  group.add(inst.build());

  return {
    group,
    update(t, tint) {
      for (const m of materials) {
        m.uniforms.uTime.value = t;
        m.uniforms.uTint.value.copy(tint);
      }
      spray.uniforms.uTime.value = t;
      spray.uniforms.uTint.value.copy(tint);
    },
  };
}
