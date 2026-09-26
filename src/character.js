import * as THREE from "three";
import { toon, withOutline, gradient3 } from "./toon.js";
import { faceTextures, emoteTextures } from "./faces.js";

const SKIN = "#ffe4d6";
const HEAD_R = 0.14;
let EMOTES = null;

const capsules = new Map();
export function capsule(r, len) {
  const key = r + ":" + len;
  if (!capsules.has(key)) capsules.set(key, new THREE.CapsuleGeometry(r, len, 4, 12));
  return capsules.get(key);
}

export function mesh(geometry, material, { outline = 0, shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (outline) withOutline(m, outline);
  return m;
}

// Hanging limb: a capsule whose top sits at the pivot.
function limb(r, len, material, outline = 0.08) {
  const m = mesh(capsule(r, len), material, { outline });
  m.position.y = -(len / 2 + r);
  return m;
}

// A cap of hair over the top of the head whose lower edge is cut into spiky bangs.
function fringeGeometry(r) {
  const cols = 28, rows = 10;
  const g = new THREE.SphereGeometry(r, cols, rows, 0, Math.PI * 2, 0, 1.08);
  const p = g.attributes.position;
  for (let ix = 0; ix <= cols; ix++) {
    if (ix % 2) continue;
    const i = rows * (cols + 1) + ix;
    p.setY(i, p.getY(i) - r * 0.26);
    p.setX(i, p.getX(i) * 0.97);
    p.setZ(i, p.getZ(i) * 0.97);
  }
  g.computeVertexNormals();
  return g;
}

function lathe(points, segments = 20, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments, phiStart, phiLength);
}

// Adult proportions: long legs, hips at 0.9 m, waist at 1.0 m, head about 1/7 of height.
const HIP_Y = 0.9;
const WAIST_Y = 1.0;
const TORSO = [[0.001, -0.02], [0.098, -0.02], [0.1, 0.06], [0.112, 0.16], [0.125, 0.26], [0.135, 0.34], [0.14, 0.39], [0.11, 0.44], [0.045, 0.47], [0.001, 0.47]];
const PELVIS = [[0.001, 0.8], [0.09, 0.8], [0.145, 0.86], [0.152, 0.92], [0.13, 0.98], [0.104, 1.02], [0.001, 1.02]];
const TORSO_DEPTH = 0.78;

function torsoRadius(y) {
  for (let i = 1; i < TORSO.length; i++) {
    const [r0, y0] = TORSO[i - 1], [r1, y1] = TORSO[i];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
  }
  return TORSO[TORSO.length - 1][0];
}

function doubleSided(material) {
  const m = material.clone();
  m.side = THREE.DoubleSide;
  return m;
}

const REST = {
  rShoulderX: 0, rShoulderZ: -0.12, rElbowX: -0.15,
  lShoulderX: 0, lShoulderZ: 0.12, lElbowX: -0.15,
  rLegX: 0, lLegX: 0, torsoX: 0, headX: 0, headY: 0, bodyY: 0,
};

export class Character {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.root = new THREE.Group();
    this.root.scale.setScalar(def.height ?? 1.04);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.pose = { ...REST };
    this.target = { ...REST };
    this.heading = 0;
    this.expression = "neutral";
    this.speaking = false;
    this.blinkTimer = 2 + Math.random() * 3;
    this.collider = { x: 0, z: 0, r: def.radius ?? 0.35 };
    this.swayers = [];
    EMOTES ??= emoteTextures();

    const m = {
      skin: toon(SKIN),
      hair: toon(def.hair),
      top: toon(def.top),
      bottom: toon(def.bottom),
      accent: toon(def.accent),
      shoes: toon(def.shoes ?? "#4a3438"),
    };
    this.mats = m;
    this.faces = faceTextures({ skin: SKIN, iris: def.iris, hair: def.hair, lips: def.lips ?? "#c85a6a" });
    this.headMat = new THREE.MeshToonMaterial({
      map: this.faces.neutral, gradientMap: gradient3,
      emissive: 0xffffff, emissiveMap: this.faces.neutral, emissiveIntensity: 0.3,
    });

    this.buildLegs();
    this.buildTorso();
    this.buildHead();
    this.buildArms();
    def.outfit?.(this, m);
    def.extras?.(this, m);

    this.emoteSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    this.emoteSprite.visible = false;
    this.root.add(this.emoteSprite);
    this.emoteLife = 0;
    this.sparkles = Array.from({ length: 6 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: EMOTES.sparkle, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      s.visible = false;
      this.root.add(s);
      return { s, life: 0, dir: new THREE.Vector3() };
    });
  }

  buildLegs() {
    const { mats: m } = this;
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.078, HIP_Y, 0);
      const thigh = mesh(capsule(0.066, 0.24), m.skin, { outline: 0.05 });
      thigh.position.y = -0.19;
      const shin = mesh(capsule(0.046, 0.38), m.skin, { outline: 0.06 });
      shin.position.y = -0.58;
      const foot = mesh(new THREE.BoxGeometry(0.085, 0.07, 0.2), m.shoes, { outline: 0.1 });
      foot.position.set(0, -0.85, 0.04);
      hip.add(thigh, shin, foot);
      this.body.add(hip);
      return hip;
    });
    // hips are always covered by the bottom garment's color
    const pelvis = mesh(lathe(PELVIS), m.bottom, { outline: 0.03 });
    pelvis.scale.z = 0.8;
    this.body.add(pelvis);
  }

  buildTorso() {
    const { mats: m } = this;
    this.torso = new THREE.Group();
    this.torso.position.y = WAIST_Y;
    this.body.add(this.torso);
    this.trunk = new THREE.Group();
    this.trunk.scale.z = TORSO_DEPTH;
    this.torso.add(this.trunk);
    this.trunk.add(mesh(lathe(TORSO), m.skin, { outline: 0.05 }));
    const neck = mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.1, 12), m.skin);
    neck.position.y = 0.5;
    this.torso.add(neck);
  }

  buildHead() {
    const { def, mats: m } = this;
    this.head = new THREE.Group();
    this.head.position.y = 0.63;
    this.head.scale.setScalar(0.92);
    this.torso.add(this.head);

    const skull = mesh(new THREE.SphereGeometry(HEAD_R, 32, 20), this.headMat, { outline: 0.05 });
    skull.scale.set(0.97, 1.07, 0.98);
    this.head.add(skull);

    const back = mesh(new THREE.SphereGeometry(HEAD_R * 1.1, 24, 16), m.hair, { outline: 0.05 });
    back.position.set(0, 0.02, -0.03);
    this.head.add(back);
    this.head.add(mesh(fringeGeometry(HEAD_R * 1.07), m.hair, { outline: 0.04 }));

    for (const side of [-1, 1]) {
      const lock = mesh(capsule(0.026, def.lockLength ?? 0.15), m.hair, { outline: 0.1 });
      lock.position.set(side * 0.128, -0.08, 0.035);
      lock.rotation.z = side * 0.08;
      this.head.add(lock);
    }
    def.hairStyle?.(this, m);
  }

  buildArms() {
    const { mats: m } = this;
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.165, 0.4, 0);
      this.torso.add(shoulder);
      shoulder.add(limb(0.04, 0.22, m.skin, 0.07));
      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);
      elbow.add(limb(0.034, 0.2, m.skin, 0.08));
      const hand = mesh(new THREE.SphereGeometry(0.035, 12, 10), m.skin, { outline: 0.1 });
      hand.position.y = -0.29;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    });
  }

  // ---------- clothing builders, used by each resident's outfit ----------

  // A garment band hugging the torso between two heights; `open` leaves a gap at the front.
  band(material, y0, y1, { pad = 0.008, open = 0, outline = 0.04 } = {}) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = y0 + ((y1 - y0) * i) / 8;
      pts.push([torsoRadius(y) + pad, y]);
    }
    const geo = open ? lathe(pts, 24, open, Math.PI * 2 - open * 2) : lathe(pts, 24);
    const g = mesh(geo, open ? doubleSided(material) : material, { outline });
    this.trunk.add(g);
    return g;
  }

  // Chest, always drawn in the garment's own material (covered).
  bust(material, size = 1) {
    for (const side of [-1, 1]) {
      const b = mesh(new THREE.SphereGeometry(0.074 * size, 18, 14), material, { outline: 0.05 });
      b.position.set(side * 0.056, 0.285, 0.068);
      b.scale.set(1, 0.92, 0.88);
      this.torso.add(b);
    }
  }

  // Skirt from the waist down to `hem`. `slitTop` opens side slits from the hem up to that
  // height; `open` leaves the front open, for coat tails.
  skirt(material, { hem, flare, slitTop = null, gap = 0.28, open = 0 }) {
    const mat = doubleSided(material);
    const radius = (y) => (y >= HIP_Y
      ? THREE.MathUtils.lerp(0.165, 0.112, (y - HIP_Y) / (1.03 - HIP_Y))
      : THREE.MathUtils.lerp(flare, 0.165, (y - hem) / (HIP_Y - hem)));
    const profile = (y0, y1) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const y = y0 + ((y1 - y0) * i) / 8;
        pts.push([radius(y), y]);
      }
      return pts;
    };
    const add = (geo) => this.body.add(mesh(geo, mat, { outline: 0.02 }));
    const full = (pts) => (open ? lathe(pts, 28, open, Math.PI * 2 - open * 2) : lathe(pts, 28));
    if (slitTop === null) {
      add(full(profile(hem, 1.03)));
      return;
    }
    add(full(profile(slitTop, 1.03)));
    const lower = profile(hem, slitTop);
    add(lathe(lower, 14, -Math.PI / 2 + gap, Math.PI - gap * 2));
    add(lathe(lower, 14, Math.PI / 2 + gap, Math.PI - gap * 2));
  }

  shorts(material, length = 0.08) {
    for (const hip of this.legs) {
      const cuff = mesh(new THREE.CylinderGeometry(0.075, 0.073, length, 16), material, { outline: 0.05 });
      cuff.position.y = -0.09 - length / 2;
      hip.add(cuff);
    }
  }

  pants(material) {
    for (const hip of this.legs) {
      const leg = mesh(capsule(0.085, 0.66), material, { outline: 0.05 });
      leg.position.y = -0.43;
      hip.add(leg);
    }
  }

  socks(material, { thighHigh = false } = {}) {
    for (const hip of this.legs) {
      const sock = mesh(capsule(0.05, 0.38), material, { outline: 0.05 });
      sock.position.y = -0.58;
      hip.add(sock);
      if (thighHigh) {
        const top = mesh(new THREE.CylinderGeometry(0.07, 0.056, 0.16, 16), material, { outline: 0.05 });
        top.position.y = -0.33;
        hip.add(top);
      }
    }
  }

  // `upper` sleeves the upper arm from `from` down; `wide` adds a flared forearm sleeve.
  sleeves(material, { upper = false, from = 0, wide = false } = {}) {
    for (const { shoulder, elbow } of this.arms) {
      if (upper) {
        const len = 0.3 - from;
        const s = mesh(new THREE.CylinderGeometry(0.052, 0.05, len, 14), material, { outline: 0.05 });
        s.position.y = -from - len / 2;
        shoulder.add(s);
      }
      if (wide) {
        const s = mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.3, 14, 1, true), doubleSided(material), { outline: 0.04 });
        s.position.y = -0.13;
        elbow.add(s);
      }
    }
  }

  // Hair pieces that swing with the wind: pivot group plus rest angles.
  addSwayer(pivot, restX, restZ, amount = 1) {
    this.swayers.push({ pivot, restX, restZ, amount, phase: Math.random() * 6 });
  }

  place(x, y, z, heading) {
    this.root.position.set(x, y, z);
    this.heading = heading;
    this.root.rotation.y = heading;
  }

  turnTowards(x, z, dt, rate = 4) {
    const want = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    let diff = want - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += diff * Math.min(1, dt * rate);
    return diff;
  }

  // Turn the head toward a point, within a comfortable neck range.
  lookAt(x, y, z) {
    const p = this.root.position;
    let yaw = Math.atan2(x - p.x, z - p.z) - this.heading;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.target.headY = THREE.MathUtils.clamp(yaw, -1.0, 1.0);
    const dist = Math.hypot(x - p.x, z - p.z);
    this.target.headX = THREE.MathUtils.clamp(-Math.atan2(y - (p.y + 1.5), dist) * 0.7, -0.4, 0.4);
  }

  setFace(name) {
    if (this.shownFace === name) return;
    this.shownFace = name;
    this.headMat.map = this.faces[name];
    this.headMat.emissiveMap = this.faces[name];
  }

  emote(type, seconds = 2.2) {
    this.emoteSprite.material.map = EMOTES[type];
    this.emoteSprite.material.needsUpdate = true;
    this.emoteSprite.visible = true;
    this.emoteLife = seconds;
    this.emoteAge = 0;
    this.emoteType = type;
  }

  sparkle() {
    this.sparkles.forEach((p, i) => {
      const a = (i / this.sparkles.length) * Math.PI * 2 + Math.random() * 0.5;
      p.dir.set(Math.cos(a), 0.3 + Math.random() * 0.6, Math.sin(a) * 0.4 + 0.5).normalize();
      p.life = 0.9 + Math.random() * 0.3;
      p.age = 0;
      p.s.visible = true;
    });
  }

  headHeight() {
    return this.body.position.y + 1.66;
  }

  update(dt, t, gust) {
    // ease every joint toward its target pose
    const k = 1 - Math.exp(-dt * 9);
    for (const key in this.target) this.pose[key] += (this.target[key] - this.pose[key]) * k;
    const P = this.pose, [r, l] = this.arms;
    r.shoulder.rotation.set(P.rShoulderX, 0, P.rShoulderZ);
    l.shoulder.rotation.set(P.lShoulderX, 0, P.lShoulderZ);
    r.elbow.rotation.x = P.rElbowX;
    l.elbow.rotation.x = P.lElbowX;
    this.legs[0].rotation.x = P.rLegX;
    this.legs[1].rotation.x = P.lLegX;
    this.torso.rotation.x = P.torsoX;
    this.torso.scale.y = 1 + Math.sin(t * 2.1 + this.root.id) * 0.008;
    this.head.rotation.set(P.headX, P.headY, 0, "YXZ");
    this.body.position.y = P.bodyY;
    this.root.rotation.y = this.heading;

    for (const s of this.swayers) {
      const w = (Math.sin(t * 1.7 + s.phase) * 0.12 + Math.sin(t * 3.3 + s.phase) * 0.05) * (0.5 + gust) * s.amount;
      s.pivot.rotation.x = s.restX + Math.abs(w) * 0.8 + (this.swingExtra ?? 0);
      s.pivot.rotation.z = s.restZ + w;
    }

    // blinking and lip flap
    this.blinkTimer -= dt;
    if (this.blinkTimer < -0.12) this.blinkTimer = 2 + Math.random() * 3.5;
    let face = this.expression;
    if (this.speaking && face === "neutral") face = Math.sin(t * 26) > 0 ? "talk" : "neutral";
    if (this.blinkTimer < 0 && (face === "neutral" || face === "talk")) face = "blink";
    this.setFace(face);

    // emote bubble: pop in, bob, fade out
    if (this.emoteSprite.visible) {
      this.emoteAge += dt;
      this.emoteLife -= dt;
      const pop = Math.min(1, this.emoteAge / 0.18);
      const s = 0.42 * (pop < 1 ? pop * 1.25 : 1) * (this.emoteLife < 0.3 ? Math.max(0, this.emoteLife / 0.3) : 1);
      this.emoteSprite.scale.set(s, s, s);
      this.emoteSprite.position.set(0.16, this.headHeight() + 0.28 + Math.sin(this.emoteAge * 4) * 0.02, 0);
      if (this.emoteLife <= 0) this.emoteSprite.visible = false;
    }

    for (const p of this.sparkles) {
      if (!p.s.visible) continue;
      p.age += dt;
      const f = p.age / p.life;
      if (f >= 1) { p.s.visible = false; continue; }
      p.s.position.set(p.dir.x * (0.15 + f * 0.35), this.headHeight() + p.dir.y * (0.1 + f * 0.3), p.dir.z * (0.15 + f * 0.3));
      const size = 0.12 * Math.sin(f * Math.PI);
      p.s.scale.set(size, size, size);
    }

    this.collider.x = this.root.position.x;
    this.collider.z = this.root.position.z;
  }
}
