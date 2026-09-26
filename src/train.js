import * as THREE from "three";
import { gradient3, outlineMaterial } from "./toon.js";
import { RW, RAIL_TOP, CROSSING_X } from "./railway.js";

const CAR_LEN = 15.5, CAR_W = 2.7, GAP = 0.7;
const HALF_TRAIN = CAR_LEN + GAP / 2;
const CRUISE = 15, BRAKE = 1.1, ACCEL = 0.9;
const HIDE_X = RW.tunnelX + 45;
const STOP_X = 0;
const JOINT = 25;

// Everything past the tunnel mouths is clipped away, so the train slides into the dark.
const clip = [
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), RW.tunnelX + 0.4),
  new THREE.Plane(new THREE.Vector3(1, 0, 0), RW.tunnelX + 0.4),
];
const hullMat = outlineMaterial.clone();
hullMat.clippingPlanes = clip;
const tm = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradient3, clippingPlanes: clip, ...extra });

function boxPart(sx, sy, sz, material, thick = 0.05) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (thick) {
    const hull = new THREE.Mesh(geo, hullMat);
    hull.scale.set(1 + thick / sx, 1 + thick / sy, 1 + thick / sz);
    mesh.add(hull);
  }
  return mesh;
}

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Side window band: glass panes and two doors per side. The emissive map lights only the glass.
function windowTextures() {
  const panes = (ctx, glass, frame) => {
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, 1024, 64);
    ctx.fillStyle = glass;
    for (let i = 0; i < 12; i++) {
      const x = 18 + i * 83;
      const door = i === 2 || i === 9;
      ctx.fillRect(x, door ? 4 : 10, door ? 40 : 66, door ? 60 : 44);
    }
  };
  return {
    map: canvas(1024, 64, (ctx) => panes(ctx, "#3d5470", "#f3ecd8")),
    glow: canvas(1024, 64, (ctx) => panes(ctx, "#ffd79a", "#000000")),
  };
}

function cabTextures() {
  const cab = (ctx, glass, frame) => {
    ctx.fillStyle = frame;
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = glass;
    ctx.fillRect(18, 16, 100, 70);
    ctx.fillRect(138, 16, 100, 70);
  };
  return {
    map: canvas(256, 128, (ctx) => cab(ctx, "#3d5470", "#f3ecd8")),
    glow: canvas(256, 128, (ctx) => cab(ctx, "#ffd79a", "#000000")),
  };
}

function car(parts) {
  const g = new THREE.Group();
  const dark = tm("#3a3a44"), skirt = tm("#2e5e52"), stripe = tm("#35a08f"), body = tm("#f3ecd8"), roof = tm("#8d8f99");
  const under = boxPart(CAR_LEN - 0.8, 0.5, CAR_W - 0.4, dark, 0);
  under.position.y = 0.95;
  const low = boxPart(CAR_LEN, 0.9, CAR_W, skirt);
  low.position.y = 1.55;
  const band = boxPart(CAR_LEN + 0.02, 0.14, CAR_W + 0.02, stripe, 0);
  band.position.y = 2.05;
  const high = boxPart(CAR_LEN, 1.4, CAR_W, body);
  high.position.y = 2.8;
  const top = boxPart(CAR_LEN - 0.3, 0.26, CAR_W - 0.3, roof);
  top.position.y = 3.62;
  g.add(under, low, band, high, top);

  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(CAR_LEN - 0.6, 0.86), parts.windowMat);
    w.position.set(0, 2.85, side * (CAR_W / 2 + 0.006));
    if (side < 0) w.rotation.y = Math.PI;
    g.add(w);
    const cab = new THREE.Mesh(new THREE.PlaneGeometry(CAR_W - 0.2, 1.25), parts.cabMat);
    cab.position.set(side * (CAR_LEN / 2 + 0.006), 2.75, 0);
    cab.rotation.y = side * Math.PI / 2;
    g.add(cab);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.14, 16).rotateX(Math.PI / 2);
  const wheels = [];
  for (const bx of [-(CAR_LEN / 2 - 2.6), CAR_LEN / 2 - 2.6]) {
    const bogie = boxPart(2.6, 0.5, 2.0, dark, 0);
    bogie.position.set(bx, 0.6, 0);
    g.add(bogie);
    for (const ax of [-0.8, 0.8]) {
      for (const side of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeo, dark);
        wheel.position.set(bx + ax, 0.43, side * 0.53);
        g.add(wheel);
        wheels.push(wheel);
      }
    }
  }
  return { g, wheels };
}

// Headlight and tail light for one end of the train.
function lamps(group, x, sign) {
  const make = (color, z) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), tm(color, { emissive: color, emissiveIntensity: 0 }));
    mesh.position.set(x + sign * 0.02, 1.75, z);
    group.add(mesh);
    return mesh;
  };
  return { head: [make("#fff4d6", -0.85), make("#fff4d6", 0.85)], tail: [make("#ff4040", -0.55), make("#ff4040", 0.55)] };
}

export function createTrain(colliders) {
  const group = new THREE.Group();
  const win = windowTextures(), cab = cabTextures();
  const windowMat = tm("#ffffff", { map: win.map, emissive: "#ffffff", emissiveMap: win.glow, emissiveIntensity: 0 });
  const cabMat = tm("#ffffff", { map: cab.map, emissive: "#ffffff", emissiveMap: cab.glow, emissiveIntensity: 0 });
  const parts = { windowMat, cabMat };

  const wheels = [];
  for (const cx of [-(CAR_LEN + GAP) / 2, (CAR_LEN + GAP) / 2]) {
    const c = car(parts);
    c.g.position.x = cx;
    group.add(c.g);
    wheels.push(...c.wheels);
  }
  const link = boxPart(GAP + 0.2, 1.8, 1.4, tm("#3a3a44"), 0);
  link.position.y = 2.3;
  group.add(link);
  const ends = { west: lamps(group, -HALF_TRAIN, -1), east: lamps(group, HALF_TRAIN, 1) };

  group.position.set(-HIDE_X, RAIL_TOP, RW.z);
  const bodyColliders = [-12, -6, 0, 6, 12].map((dx) => {
    const c = { x: 0, z: RW.z, r: 1.55, dx };
    colliders.push(c);
    return c;
  });

  const s = { x: -HIDE_X, dir: 1, v: 0, phase: "waiting", timer: 6, served: false };
  let lastJoints = null;

  return {
    group,
    get x() {
      return s.x;
    },
    update(dt, lampLevel) {
      const events = { horn: false, chime: false, clacks: 0 };
      const was = s.x;

      if (s.phase === "waiting") {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.phase = "running";
          s.v = CRUISE;
        }
      } else if (s.phase === "stopped") {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.phase = "running";
          events.chime = true;
          events.horn = true;
        }
      } else {
        const toStop = (STOP_X - s.x) * s.dir;
        let limit = CRUISE;
        if (!s.served) limit = Math.min(CRUISE, Math.sqrt(2 * BRAKE * Math.max(0, toStop)) + 0.4);
        s.v = Math.min(limit, s.v + ACCEL * dt);
        s.x += s.v * s.dir * dt;
        if (!s.served && toStop <= 0.05) {
          s.x = STOP_X;
          s.v = 0;
          s.phase = "stopped";
          s.timer = 12;
          s.served = true;
        }
        if (s.x * s.dir > HIDE_X) {
          s.x = s.dir * HIDE_X;
          s.v = 0;
          s.dir *= -1;
          s.served = false;
          s.phase = "waiting";
          s.timer = 18 + Math.random() * 14;
        }
      }

      // a whistle as the train leaves one tunnel and before it enters the other
      const horns = [-(RW.tunnelX + 12), RW.tunnelX - 60];
      for (const hx of horns) {
        const mark = hx * s.dir;
        if ((was - mark) * (s.x - mark) < 0) events.horn = true;
      }

      // rail joints under each bogie
      const bogies = [-HALF_TRAIN + 2.6, -GAP / 2 - 2.6, GAP / 2 + 2.6, HALF_TRAIN - 2.6].map((b) => Math.floor((s.x + b) / JOINT));
      if (lastJoints) bogies.forEach((j, i) => { if (j !== lastJoints[i]) events.clacks++; });
      lastJoints = bogies;

      group.position.x = s.x;
      const spin = (s.v * s.dir * dt) / 0.43;
      for (const w of wheels) w.rotation.z -= spin;

      const front = s.dir > 0 ? ends.east : ends.west, rear = s.dir > 0 ? ends.west : ends.east;
      front.head.forEach((l) => (l.material.emissiveIntensity = 2.5));
      front.tail.forEach((l) => (l.material.emissiveIntensity = 0));
      rear.head.forEach((l) => (l.material.emissiveIntensity = 0));
      rear.tail.forEach((l) => (l.material.emissiveIntensity = 1.8));
      windowMat.emissiveIntensity = 0.15 + lampLevel * 1.4;
      cabMat.emissiveIntensity = 0.15 + lampLevel * 1.2;

      const visible = Math.abs(s.x) < RW.tunnelX + HALF_TRAIN;
      for (const c of bodyColliders) c.x = visible ? s.x + c.dx : 9999;

      // is the train near the level crossing, heading for it or still on it?
      const ahead = (CROSSING_X - s.x) * s.dir;
      events.crossing = visible && ahead > -HALF_TRAIN - 4 && ahead < HALF_TRAIN + 110;
      events.moving = s.v > 0.1 && visible;
      events.speed = s.v;
      events.visible = visible;
      return events;
    },
  };
}
