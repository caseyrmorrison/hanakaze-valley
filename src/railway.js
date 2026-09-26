import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { toon } from "./toon.js";
import { Instancer, mat } from "./instancer.js";
import { WORLD, heightAt } from "./terrain.js";

export const RW = WORLD.railway;
export const RAIL_TOP = RW.y - 0.1;
export const CROSSING_X = -45;
const GAUGE = 1.067;
const BED = RW.y - 0.35;

const glow = (c) => toon(c, { soft: true, extra: { emissive: c, emissiveIntensity: 0 } });

const m = {
  rail: toon("#6f6a73"),
  sleeper: toon("#5b4636"),
  stone: toon("#9a948f"),
  darkStone: toon("#7a7470"),
  concrete: toon("#d3cdc4"),
  yellow: toon("#f2c230"),
  black: toon("#2b2630"),
  white: toon("#f4f2ec"),
  pole: toon("#5c4a3c"),
  roof: toon("#4c5a78", { extra: { flatShading: true } }),
  wood: toon("#8a5d3e"),
  lamp: glow("#fff1c9"),
  red: glow("#ff3b30"),
};
const void_ = new THREE.MeshBasicMaterial({ color: 0x07060a, side: THREE.BackSide });
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const ball = new THREE.SphereGeometry(1, 14, 10);

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function track(inst) {
  const len = RW.tunnelX * 2 + 16;
  for (const side of [-1, 1]) {
    inst.add(box, m.rail, mat(0, RAIL_TOP - 0.06, RW.z + side * GAUGE / 2, { sx: len, sy: 0.12, sz: 0.07 }), 0);
  }
  for (let x = -len / 2; x <= len / 2; x += 0.9) {
    inst.add(box, m.sleeper, mat(x, BED + 0.1, RW.z, { sx: 0.22, sy: 0.12, sz: 2.1 }), 0);
  }
}

// Stone portal with a dark bore behind it; the train disappears into the black.
function portal(inst, group, side) {
  const x = side * RW.tunnelX;
  const top = RW.y + 9;
  const put = (z0, z1, y0, y1) => inst.add(box, m.stone,
    mat(x + side * 0.75, (y0 + y1) / 2, RW.z + (z0 + z1) / 2, { sx: 1.5, sy: y1 - y0, sz: z1 - z0 }), 0.02);
  put(-9, -2.4, BED, top);
  put(2.4, 9, BED, top);
  put(-2.4, 2.4, RW.y + 5.4, top);
  inst.add(box, m.darkStone, mat(x + side * 0.2, top + 0.3, RW.z, { sx: 1.8, sy: 0.6, sz: 18.6 }), 0.03);
  const bore = new THREE.Mesh(new THREE.BoxGeometry(80, 6, 4.8), void_);
  bore.position.set(x + side * 40.5, BED + 2.9, RW.z);
  group.add(bore);
}

// Crossbuck, twin red lamps, a bell and a striped barrier arm on each side of the road.
function crossing(inst, group, colliders) {
  const lamps = [];
  const arms = [];
  for (const side of [-1, 1]) {
    const px = CROSSING_X - side * 2.4, pz = RW.z + side * 3.3;
    const y = heightAt(px, pz);
    for (let i = 0; i < 6; i++) {
      inst.add(cyl, i % 2 ? m.black : m.yellow, mat(px, y + 0.25 + i * 0.5, pz, { sx: 0.09, sy: 0.5, sz: 0.09 }), 0);
    }
    for (const r of [0.75, -0.75]) {
      inst.add(box, m.yellow, mat(px, y + 3.6, pz, { rz: r, sx: 1.3, sy: 0.14, sz: 0.04 }), 0.05);
    }
    inst.add(ball, m.black, mat(px, y + 4.35, pz, { sx: 0.2, sy: 0.14, sz: 0.2 }), 0.05);
    inst.add(box, m.black, mat(px, y + 2.8, pz, { sx: 0.9, sy: 0.08, sz: 0.06 }), 0);
    const pair = [];
    for (const off of [-0.32, 0.32]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), m.red.clone());
      lamp.position.set(px + off, y + 2.8, pz - side * 0.1);
      group.add(lamp);
      pair.push(lamp);
    }
    lamps.push(pair);
    const pivot = new THREE.Group();
    pivot.position.set(px + side * 0.25, y + 1.0, pz);
    const arm = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Mesh(box, i % 2 ? m.black : m.yellow);
      seg.scale.set(0.08, 0.5, 0.08);
      seg.position.y = 0.25 + i * 0.5;
      arm.add(seg);
    }
    pivot.add(arm);
    // arms swing sideways across the road
    pivot.userData.down = -side * Math.PI / 2;
    group.add(pivot);
    arms.push(pivot);
    colliders.push({ x: px, z: pz, r: 0.3 });
  }
  // boards laid between the rails so the road crosses flush
  inst.add(box, m.wood, mat(CROSSING_X, RAIL_TOP - 0.05, RW.z, { sx: 3.4, sy: 0.08, sz: 1.0 }), 0);
  return { lamps, arms };
}

function stationSign() {
  return canvasTexture(512, 192, (ctx) => {
    ctx.fillStyle = "#f7f5ef";
    ctx.fillRect(0, 0, 512, 192);
    ctx.fillStyle = "#2f8f83";
    ctx.fillRect(0, 118, 512, 14);
    ctx.fillStyle = "#1f1b24";
    ctx.textAlign = "center";
    ctx.font = 'bold 76px "Zen Maru Gothic", "Hiragino Sans", sans-serif';
    ctx.fillText("花風", 256, 92);
    ctx.font = 'bold 26px "Zen Maru Gothic", sans-serif';
    ctx.fillText("HANAKAZE", 256, 170);
    ctx.font = '22px "Zen Maru Gothic", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("← 霧降 Kirifuri", 16, 160);
    ctx.textAlign = "right";
    ctx.fillText("桜ヶ丘 Sakuragaoka →", 496, 160);
  });
}

function vendingFace() {
  return canvasTexture(128, 256, (ctx) => {
    ctx.fillStyle = "#e9f2ff";
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = "#3a7bd5";
    ctx.fillRect(0, 0, 128, 26);
    const drinks = ["#e24b4b", "#f3a53c", "#4fb06d", "#3a7bd5", "#9b59b6", "#f7d046"];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = drinks[(row * 4 + col) % drinks.length];
        ctx.fillRect(10 + col * 28, 40 + row * 44, 18, 30);
        ctx.fillStyle = "#1f1b24";
        ctx.fillRect(12 + col * 28, 74 + row * 44, 14, 4);
      }
    }
    ctx.fillStyle = "#2b2630";
    ctx.fillRect(14, 186, 100, 48);
    ctx.fillStyle = "#6a6470";
    ctx.fillRect(22, 196, 84, 12);
  });
}

// Hanakaze Station: a platform, a shelter with a bench, a name board, lamps and a vending machine.
function station(inst, group, colliders) {
  const st = WORLD.station;
  const top = RW.y + 0.57;
  const w = st.x1 - st.x0, d = st.z1 - st.z0;
  inst.add(box, m.concrete, mat(0, top - 0.6, (st.z0 + st.z1) / 2, { sx: w, sy: 1.2, sz: d }), 0.01);
  inst.add(box, m.yellow, mat(0, top + 0.005, st.z0 + 0.6, { sx: w - 0.4, sy: 0.02, sz: 0.3 }), 0);
  // shelter
  inst.add(box, m.wood, mat(-4, top + 1.3, st.z1 - 0.4, { sx: 8, sy: 2.6, sz: 0.15 }), 0.03);
  for (const px of [-7.6, -0.4]) inst.add(cyl, m.pole, mat(px, top + 1.35, st.z0 + 1.8, { sx: 0.08, sy: 2.7, sz: 0.08 }), 0.05);
  inst.add(box, m.roof, mat(-4, top + 2.8, (st.z0 + st.z1) / 2 + 0.4, { rx: 0.12, sx: 8.6, sy: 0.14, sz: d - 0.2 }), 0.03);
  inst.add(box, m.wood, mat(-4, top + 0.45, st.z1 - 1.0, { sx: 3.2, sy: 0.08, sz: 0.45 }), 0.05);
  for (const px of [-5.4, -2.6]) inst.add(box, m.pole, mat(px, top + 0.22, st.z1 - 1.0, { sx: 0.08, sy: 0.45, sz: 0.4 }), 0);
  colliders.push({ x: -4, z: st.z1 - 0.6, r: 1.2 }, { x: -7.6, z: st.z0 + 1.8, r: 0.25 }, { x: -0.4, z: st.z0 + 1.8, r: 0.25 });

  // name board facing the track
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.98), new THREE.MeshBasicMaterial({ map: stationSign() }));
  sign.position.set(6, top + 2.1, st.z0 + 2.2);
  sign.rotation.y = Math.PI;
  const signBack = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.98), new THREE.MeshBasicMaterial({ map: sign.material.map }));
  signBack.position.set(6, top + 2.1, st.z0 + 2.22);
  group.add(sign, signBack);
  for (const px of [4.8, 7.2]) inst.add(cyl, m.black, mat(px, top + 1.2, st.z0 + 2.21, { sx: 0.05, sy: 2.4, sz: 0.05 }), 0);
  colliders.push({ x: 6, z: st.z0 + 2.2, r: 1.3 });

  // vending machine, lit from inside
  const face = vendingFace();
  const vend = new THREE.Mesh(box, [m.white, m.white, m.white, m.white,
    new THREE.MeshToonMaterial({ color: 0xffffff, map: face, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.6 }), m.white]);
  vend.scale.set(1.0, 1.85, 0.8);
  vend.position.set(-10, top + 0.93, st.z1 - 0.8);
  vend.rotation.y = Math.PI;
  group.add(vend);
  colliders.push({ x: -10, z: st.z1 - 0.8, r: 0.7 });

  // lamp posts
  const lampMeshes = [];
  for (const px of [-12, 10]) {
    inst.add(cyl, m.black, mat(px, top + 1.6, st.z0 + 1.4, { sx: 0.06, sy: 3.2, sz: 0.06 }), 0);
    inst.add(box, m.black, mat(px, top + 3.25, st.z0 + 1.1, { sx: 0.12, sy: 0.06, sz: 0.7 }), 0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), m.lamp);
    lamp.position.set(px, top + 3.1, st.z0 + 0.8);
    group.add(lamp);
    lampMeshes.push(lamp);
    colliders.push({ x: px, z: st.z0 + 1.4, r: 0.2 });
  }
  return { vend: vend.material[4] };
}

// Wooden utility poles along the line with three sagging wires per span.
function poles(inst, group) {
  const z = RW.z - 4.5;
  const xs = [];
  for (let x = -135; x <= 135; x += 30) xs.push(x);
  const wires = [];
  for (const x of xs) {
    const y = heightAt(x, z);
    inst.add(cyl, m.pole, mat(x, y + 4.5, z, { sx: 0.12, sy: 9, sz: 0.12 }), 0.05);
    inst.add(box, m.pole, mat(x, y + 8.4, z, { sx: 0.12, sy: 0.12, sz: 1.8 }), 0.05);
  }
  for (let i = 0; i < xs.length - 1; i++) {
    const ya = heightAt(xs[i], z) + 8.5, yb = heightAt(xs[i + 1], z) + 8.5;
    for (const off of [-0.8, 0, 0.8]) {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(new THREE.Vector3(THREE.MathUtils.lerp(xs[i], xs[i + 1], t), THREE.MathUtils.lerp(ya, yb, t) - Math.sin(t * Math.PI) * 0.9, z + off));
      }
      wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.025, 4, false));
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(wires), new THREE.MeshBasicMaterial({ color: 0x2b2630 })));
}

export function createRailway(colliders) {
  const group = new THREE.Group();
  const inst = new Instancer();
  track(inst);
  portal(inst, group, -1);
  portal(inst, group, 1);
  const xing = crossing(inst, group, colliders);
  const stationParts = station(inst, group, colliders);
  poles(inst, group);
  group.add(inst.build());

  let blink = 0;
  return {
    group,
    // `active`: whether a train is near the crossing; `night`: 0..1 for lights.
    update(dt, active, lampLevel) {
      blink += dt;
      const on = Math.floor(blink * 2.2) % 2;
      xing.lamps.forEach((pair) => pair.forEach((lamp, i) => {
        lamp.material.emissiveIntensity = active ? ((i === on) ? 3 : 0.1) : 0;
      }));
      for (const pivot of xing.arms) {
        const target = active ? pivot.userData.down : 0;
        pivot.rotation.z += (target - pivot.rotation.z) * Math.min(1, dt * 1.6);
      }
      m.lamp.emissiveIntensity = lampLevel * 2.4;
      stationParts.vend.emissiveIntensity = 0.5 + lampLevel * 1.4;
    },
  };
}
