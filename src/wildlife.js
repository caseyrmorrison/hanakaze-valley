import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { toon } from "./toon.js";
import { WORLD, heightAt, distToPath, builtUp, riverInfo } from "./terrain.js";

// ---------- koi ----------
function koiGeometry() {
  const body = new THREE.SphereGeometry(1, 14, 10);
  body.scale(0.11, 0.07, 0.34);
  const tail = new THREE.ConeGeometry(0.12, 0.2, 4);
  tail.rotateX(-Math.PI / 2);
  tail.scale(1, 0.25, 1);
  tail.translate(0, 0, -0.38);
  const fins = new THREE.ConeGeometry(0.06, 0.12, 3);
  fins.rotateZ(Math.PI / 2);
  fins.scale(1.6, 0.2, 1);
  fins.translate(0, -0.02, 0.08);
  return mergeGeometries([body, tail, fins]);
}

function createKoi(count = 18) {
  const { lake } = WORLD;
  const palette = ["#ff7a2e", "#fff6ea", "#ffb62e", "#e2402f", "#ff7a2e", "#fff6ea"].map((c) => new THREE.Color(c));
  const mesh = new THREE.InstancedMesh(koiGeometry(), toon("#ffffff"), count);
  const fish = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 13;
    fish.push({
      cx: lake.x + Math.cos(a) * d, cz: lake.z + Math.sin(a) * d,
      r: 3 + Math.random() * 7, w: (0.12 + Math.random() * 0.18) * (Math.random() < 0.5 ? -1 : 1),
      phase: Math.random() * 6, depth: 0.3 + Math.random() * 0.3, size: 0.8 + Math.random() * 0.6,
    });
    mesh.setColorAt(i, palette[i % palette.length]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  return {
    mesh,
    update(t) {
      fish.forEach((f, i) => {
        const ang = f.phase + t * f.w;
        p.set(f.cx + Math.cos(ang) * f.r, -f.depth, f.cz + Math.sin(ang) * f.r);
        const heading = Math.atan2(-Math.sin(ang) * Math.sign(f.w), Math.cos(ang) * Math.sign(f.w));
        q.setFromEuler(e.set(0, heading + Math.sin(t * 5 + f.phase) * 0.18, 0));
        mesh.setMatrixAt(i, m4.compose(p, q, s.setScalar(f.size)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- butterflies and dragonflies ----------
const flyerVert = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform float uWorld;
  uniform float uRange;
  uniform float uSpeed;
  uniform float uAlt;
  uniform float uFlapFreq;
  uniform float uFlapAmp;
  uniform float uSize;
  uniform sampler2D uGround;
  attribute vec3 aHome;
  attribute vec4 aSeed;
  attribute vec3 aColor;
  attribute float aWing;
  varying vec3 vColor;
  varying float vWing;

  vec3 wander(float t) {
    return vec3(sin(t * 0.7 + aSeed.x * 6.0) + 0.5 * sin(t * 1.9 + aSeed.y * 6.0), 0.0,
                cos(t * 0.6 + aSeed.z * 6.0) + 0.5 * cos(t * 1.7 + aSeed.x * 4.0));
  }

  void main() {
    float t = uTime * uSpeed + aSeed.w * 50.0;
    vec3 off = wander(t) * uRange;
    vec3 dir = normalize(wander(t + 0.05) * uRange - off + vec3(0.0001));
    float yaw = atan(dir.x, dir.z);
    vec2 xz = aHome.xz + off.xz;
    float ground = max(texture2D(uGround, xz / uWorld + 0.5).r, aHome.y);
    float alt = ground + 0.5 + (sin(t * 1.3 + aSeed.y * 9.0) * 0.5 + 0.5) * uAlt;

    vec3 p = position * uSize;
    float flap = sin(uTime * uFlapFreq + aSeed.w * 30.0) * uFlapAmp;
    if (aWing != 0.0) p = vec3(p.x * cos(flap), abs(p.x) * sin(flap), p.z);
    float c = cos(yaw), s = sin(yaw);
    p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);

    vColor = aColor;
    vWing = aWing;
    vec4 mvPosition = viewMatrix * vec4(vec3(xz.x, alt, xz.y) + p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const flyerFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uTint;
  uniform vec3 uBody;
  uniform float uWingAlpha;
  varying vec3 vColor;
  varying float vWing;
  void main() {
    bool wing = vWing != 0.0;
    gl_FragColor = vec4((wing ? vColor : uBody) * uTint, wing ? uWingAlpha : 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// Local shape: body along z, wings spread along ±x. aWing marks which side flaps.
function flyerGeometry(kind) {
  const pos = [], wing = [];
  const quad = (a, b, c, d, side) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) wing.push(side);
  };
  if (kind === "butterfly") {
    for (const side of [-1, 1]) {
      quad([0, 0, 0.07], [side * 0.2, 0, 0.12], [side * 0.19, 0, -0.02], [0, 0, 0.0], side);
      quad([0, 0, 0.0], [side * 0.15, 0, -0.03], [side * 0.12, 0, -0.14], [0, 0, -0.06], side);
    }
    quad([-0.012, 0.005, 0.08], [0.012, 0.005, 0.08], [0.012, 0.005, -0.08], [-0.012, 0.005, -0.08], 0);
  } else {
    for (const side of [-1, 1]) {
      quad([0, 0, 0.06], [side * 0.3, 0, 0.08], [side * 0.3, 0, 0.03], [0, 0, 0.02], side);
      quad([0, 0, 0.0], [side * 0.27, 0, 0.0], [side * 0.27, 0, -0.05], [0, 0, -0.04], side);
    }
    quad([-0.014, 0.005, 0.1], [0.014, 0.005, 0.1], [0.008, 0.005, -0.4], [-0.008, 0.005, -0.4], 0);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aWing", new THREE.Float32BufferAttribute(wing, 1));
  return g;
}

function createFlyers(groundTex, homes, { kind, colors, range, speed, alt, flapFreq, flapAmp, size, body, wingAlpha }) {
  const g = flyerGeometry(kind);
  const n = homes.length;
  const home = new Float32Array(n * 3), seed = new Float32Array(n * 4), color = new Float32Array(n * 3);
  homes.forEach((h, i) => {
    home.set(h, i * 3);
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const c = new THREE.Color(colors[i % colors.length]);
    color.set([c.r, c.g, c.b], i * 3);
  });
  g.setAttribute("aHome", new THREE.InstancedBufferAttribute(home, 3));
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute("aColor", new THREE.InstancedBufferAttribute(color, 3));
  g.instanceCount = n;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uWorld: { value: WORLD.size }, uRange: { value: range }, uSpeed: { value: speed },
    uAlt: { value: alt }, uFlapFreq: { value: flapFreq }, uFlapAmp: { value: flapAmp }, uSize: { value: size },
    uGround: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uBody: { value: new THREE.Color(body) },
    uWingAlpha: { value: wingAlpha },
  }]);
  uniforms.uGround.value = groundTex;
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms, vertexShader: flyerVert, fragmentShader: flyerFrag, side: THREE.DoubleSide,
    transparent: wingAlpha < 1, depthWrite: wingAlpha >= 1, fog: true,
  }));
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

function meadowHomes(count) {
  const homes = [];
  for (let tries = 0; homes.length < count && tries < count * 50; tries++) {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 115;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < 1 || h > 30 || builtUp(x, z) > 0.1 || distToPath(x, z) < 2) continue;
    homes.push([x, -10, z]);
  }
  return homes;
}

function waterHomes(count) {
  const { lake, paddies: p } = WORLD;
  const homes = [];
  for (let i = 0; i < count; i++) {
    const pick = i % 3;
    if (pick === 0) {
      const a = Math.random() * Math.PI * 2, r = lake.r * (0.55 + Math.random() * 0.3);
      homes.push([lake.x + Math.cos(a) * r, 0.1, lake.z + Math.sin(a) * r]);
    } else if (pick === 1) {
      homes.push([p.x0 + Math.random() * (p.x1 - p.x0), -10, p.z0 + Math.random() * (p.z1 - p.z0)]);
    } else {
      for (let k = 0; k < 20; k++) {
        const x = 70 + Math.random() * 50, z = -95 + Math.random() * 50;
        if (riverInfo(x, z).d < 5) { homes.push([x, -10, z]); break; }
      }
    }
  }
  return homes;
}

// ---------- birds crossing the sky in a V ----------
function createBirds(count = 9) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2433, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.25, 0, 0, -0.25, 1.1, 0, -0.1], 3));
  const birds = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, mat), right = new THREE.Mesh(wingGeo, mat);
    right.scale.x = -1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), mat);
    body.scale.set(1, 0.8, 2.4);
    b.add(left, right, body);
    const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
    b.userData = { left, right, ox: i === 0 ? 0 : side * row * 3.2, oz: -row * 3.6, phase: Math.random() * 6 };
    group.add(b);
    birds.push(b);
  }
  group.visible = false;
  const flock = { t: 0, next: 12, from: new THREE.Vector3(), dir: new THREE.Vector3(), active: false };
  return {
    group,
    update(dt, t, daylight) {
      if (!flock.active) {
        flock.next -= dt;
        if (flock.next <= 0 && daylight > 0.3) {
          const a = Math.random() * Math.PI * 2;
          flock.from.set(Math.cos(a) * 320, 55 + Math.random() * 35, Math.sin(a) * 320);
          const b = a + Math.PI + (Math.random() - 0.5) * 0.8;
          flock.dir.set(Math.cos(b) * 320, flock.from.y, Math.sin(b) * 320).sub(flock.from).normalize();
          flock.dir.y = 0;
          flock.t = 0;
          flock.active = true;
          group.visible = true;
        }
        return;
      }
      flock.t += dt;
      const pos = flock.from.clone().addScaledVector(flock.dir, flock.t * 16);
      group.position.copy(pos);
      group.rotation.y = Math.atan2(flock.dir.x, flock.dir.z);
      for (const b of birds) {
        const u = b.userData;
        b.position.set(u.ox, Math.sin(t * 0.8 + u.phase) * 0.6, u.oz);
        const flap = Math.sin(t * 7 + u.phase) * 0.55;
        u.left.rotation.z = flap;
        u.right.rotation.z = -flap;
      }
      if (flock.t * 16 > 660) {
        flock.active = false;
        group.visible = false;
        flock.next = 30 + Math.random() * 40;
      }
    },
  };
}

export function createWildlife(groundTex) {
  const koi = createKoi();
  const butterflies = createFlyers(groundTex, meadowHomes(44), {
    kind: "butterfly", colors: ["#fff8e6", "#ffe066", "#9fd3ff", "#ffb14a", "#ffc2dc"],
    range: 3.5, speed: 0.35, alt: 1.4, flapFreq: 16, flapAmp: 1.0, size: 1.1, body: "#3a2c24", wingAlpha: 1,
  });
  const dragonflies = createFlyers(groundTex, waterHomes(21), {
    kind: "dragonfly", colors: ["#dff6ff"], range: 5, speed: 0.55, alt: 1.0, flapFreq: 60, flapAmp: 0.35,
    size: 1.0, body: "#2f7fc4", wingAlpha: 0.55,
  });
  const birds = createBirds();
  const group = new THREE.Group();
  group.add(koi.mesh, butterflies.mesh, dragonflies.mesh, birds.group);
  return {
    group,
    update(dt, t, mood) {
      koi.update(t);
      const day = 1 - mood.night;
      for (const f of [butterflies, dragonflies]) {
        f.uniforms.uTime.value = t;
        f.uniforms.uTint.value.copy(mood.grass);
      }
      butterflies.mesh.visible = day > 0.5;
      dragonflies.mesh.visible = mood.night < 0.8;
      birds.update(dt, t, day);
    },
  };
}
