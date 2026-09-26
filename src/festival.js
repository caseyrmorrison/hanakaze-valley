import * as THREE from "three";
import { toon } from "./toon.js";
import { WORLD } from "./terrain.js";

// ---------- fireworks (hanabi) ----------
const sparkVert = /* glsl */ `
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const sparkFrag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float core = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor * (0.6 + core), core * vAlpha);
  }
`;

const PALETTE = ["#ff5fa2", "#ffd24a", "#6fe3ff", "#b88cff", "#ffffff", "#7dff9a", "#ff8a3d"].map((c) => new THREE.Color(c));
const MAX = 5000;

function createFireworks(sound) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3);
  const size = new Float32Array(MAX), alpha = new Float32Array(MAX);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: sparkVert, fragmentShader: sparkFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;

  const sparks = [];
  const shells = [];
  let timer = 2;
  const { lake } = WORLD;

  const spark = (p, v, color, life, opts = {}) => {
    if (sparks.length >= MAX) return;
    sparks.push({ p: p.clone(), v, color, life, max: life, drag: opts.drag ?? 1.4, grav: opts.grav ?? 4, size: opts.size ?? 1.2, twinkle: opts.twinkle ?? false });
  };

  const burst = (shell) => {
    const { p, type, color } = shell;
    const alt = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const n = type === "willow" ? 140 : type === "ring" ? 90 : 170;
    const speed = type === "willow" ? 14 : 20 + Math.random() * 6;
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5).normalize();
    const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0.3)).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    for (let i = 0; i < n; i++) {
      let v;
      if (type === "ring") {
        const a = (i / n) * Math.PI * 2;
        v = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).multiplyScalar(speed);
      } else {
        const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
        v = new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a)).multiplyScalar(speed * (0.85 + Math.random() * 0.15));
      }
      const c = type === "willow" ? new THREE.Color("#ffc86b") : (i % 5 === 0 ? alt : color);
      spark(p, v, c, type === "willow" ? 3.4 : 1.8 + Math.random() * 0.6, {
        drag: type === "willow" ? 1.2 : 1.6, grav: type === "willow" ? 2.2 : 3.5, size: type === "willow" ? 1.0 : 1.4, twinkle: type === "crackle",
      });
    }
    sound?.fireworkBoom(p.x, p.y, p.z, type);
  };

  const launch = () => {
    const types = ["peony", "peony", "ring", "willow", "crackle"];
    const type = types[Math.floor(Math.random() * types.length)];
    const from = new THREE.Vector3(lake.x + (Math.random() - 0.5) * 24, 0.5, lake.z - 12 + (Math.random() - 0.5) * 16);
    shells.push({
      p: from, v: new THREE.Vector3((Math.random() - 0.5) * 3, 34 + Math.random() * 8, (Math.random() - 0.5) * 3),
      fuse: 1.5 + Math.random() * 0.5, type, color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
    });
    sound?.fireworkLaunch(from.x, from.y, from.z);
  };

  return {
    points,
    update(dt, level) {
      if (level > 0.05) {
        timer -= dt;
        if (timer <= 0) {
          const salvo = Math.random() < 0.25 ? 3 : 1;
          for (let i = 0; i < salvo; i++) launch();
          timer = (1.4 + Math.random() * 2.6) / level;
        }
      }
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.v.y -= 9 * dt;
        s.p.addScaledVector(s.v, dt);
        s.fuse -= dt;
        spark(s.p, new THREE.Vector3((Math.random() - 0.5), -2, (Math.random() - 0.5)), new THREE.Color("#ffd9a0"), 0.5, { size: 0.7, grav: 1 });
        if (s.fuse <= 0) {
          burst(s);
          shells.splice(i, 1);
        }
      }
      let n = 0;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          sparks[i] = sparks[sparks.length - 1];
          sparks.pop();
          continue;
        }
        s.v.multiplyScalar(Math.exp(-s.drag * dt));
        s.v.y -= s.grav * dt;
        s.p.addScaledVector(s.v, dt);
      }
      for (const s of sparks) {
        const f = s.life / s.max;
        pos[n * 3] = s.p.x; pos[n * 3 + 1] = s.p.y; pos[n * 3 + 2] = s.p.z;
        col[n * 3] = s.color.r; col[n * 3 + 1] = s.color.g; col[n * 3 + 2] = s.color.b;
        size[n] = s.size * (0.5 + f * 0.8);
        alpha[n] = Math.min(1, f * 2) * (s.twinkle && f < 0.5 ? (Math.random() < 0.5 ? 1.6 : 0) : 1);
        n++;
      }
      g.setDrawRange(0, n);
      for (const a of ["position", "aColor", "aSize", "aAlpha"]) g.attributes[a].needsUpdate = true;
    },
  };
}

// ---------- floating lanterns (toro nagashi) ----------
function createLanterns(count = 36) {
  const { lake } = WORLD;
  const paper = toon("#ffd8a0", { soft: true, extra: { emissive: "#ffb45a", emissiveIntensity: 0 } });
  const base = toon("#4f3528");
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), paper, count);
  const raft = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.07, 0.46), base, count);
  const items = Array.from({ length: count }, () => ({
    a: Math.random() * Math.PI * 2, r: 6 + Math.random() * 20, w: (0.006 + Math.random() * 0.012) * (Math.random() < 0.5 ? -1 : 1),
    phase: Math.random() * 6, spin: Math.random() * 6,
  }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const group = new THREE.Group();
  group.add(body, raft);
  return {
    group,
    update(t, level) {
      group.visible = level > 0.02;
      if (!group.visible) return;
      paper.emissiveIntensity = level * 2.6;
      items.forEach((it, i) => {
        const a = it.a + t * it.w;
        const bob = Math.sin(t * 1.4 + it.phase) * 0.03;
        q.setFromEuler(e.set(Math.sin(t + it.phase) * 0.05, it.spin + t * 0.05, Math.cos(t * 0.8 + it.phase) * 0.05));
        p.set(lake.x + Math.cos(a) * it.r, 0.22 + bob, lake.z + Math.sin(a) * it.r);
        body.setMatrixAt(i, m4.compose(p, q, s.setScalar(level)));
        p.y = 0.03 + bob;
        raft.setMatrixAt(i, m4.compose(p, q, s.setScalar(level)));
      });
      body.instanceMatrix.needsUpdate = true;
      raft.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- shooting stars ----------
function createShootingStars() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setAttribute("aT", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
  geo.setIndex([0, 1, 2, 1, 3, 2]);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 0 } },
    vertexShader: `attribute float aT; varying float vT; void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uFade; varying float vT; void main() { gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), vT * vT * uFade); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const star = { timer: 5, age: 0, dur: 0.9, from: new THREE.Vector3(), dir: new THREE.Vector3() };
  const head = new THREE.Vector3(), tail = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
  return {
    mesh,
    update(dt, level, camera) {
      if (!mesh.visible) {
        star.timer -= dt;
        if (star.timer <= 0 && level > 0.5) {
          const az = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 0.5;
          star.from.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(900).add(camera.position);
          star.dir.set(Math.random() - 0.5, -0.35 - Math.random() * 0.3, Math.random() - 0.5).normalize();
          star.age = 0;
          mesh.visible = true;
        }
        return;
      }
      star.age += dt;
      const f = star.age / star.dur;
      if (f >= 1) {
        mesh.visible = false;
        star.timer = 5 + Math.random() * 12;
        return;
      }
      head.copy(star.from).addScaledVector(star.dir, f * 260);
      tail.copy(head).addScaledVector(star.dir, -70);
      view.copy(head).sub(camera.position).normalize();
      side.crossVectors(star.dir, view).normalize().multiplyScalar(1.4);
      const p = geo.attributes.position;
      p.setXYZ(0, tail.x - side.x * 0.2, tail.y - side.y * 0.2, tail.z - side.z * 0.2);
      p.setXYZ(1, tail.x + side.x * 0.2, tail.y + side.y * 0.2, tail.z + side.z * 0.2);
      p.setXYZ(2, head.x - side.x, head.y - side.y, head.z - side.z);
      p.setXYZ(3, head.x + side.x, head.y + side.y, head.z + side.z);
      p.needsUpdate = true;
      mat.uniforms.uFade.value = Math.sin(f * Math.PI) * level;
    },
  };
}

export function createFestival(sound) {
  const fireworks = createFireworks(sound);
  const lanterns = createLanterns();
  const shooting = createShootingStars();
  const group = new THREE.Group();
  group.add(fireworks.points, lanterns.group, shooting.mesh);
  return {
    group,
    update(dt, t, night, camera) {
      const level = THREE.MathUtils.clamp((night - 0.35) / 0.5, 0, 1);
      fireworks.update(dt, level);
      lanterns.update(t, level);
      shooting.update(dt, night, camera);
    },
  };
}
