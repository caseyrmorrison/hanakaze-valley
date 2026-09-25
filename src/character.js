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

function lathe(points, segments = 20) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
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
      legs: toon(def.legs ?? SKIN),
      shoes: toon(def.shoes ?? "#4a3438"),
    };
    this.mats = m;
    this.faces = faceTextures({ skin: SKIN, iris: def.iris, hair: def.hair });
    this.headMat = new THREE.MeshToonMaterial({
      map: this.faces.neutral, gradientMap: gradient3,
      emissive: 0xffffff, emissiveMap: this.faces.neutral, emissiveIntensity: 0.3,
    });

    this.buildLegs();
    this.buildTorso();
    this.buildHead();
    this.buildArms();
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
    const { def, mats: m } = this;
    const pants = def.bottomStyle === "pants";
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.075, 0.86, 0);
      hip.add(limb(pants ? 0.085 : 0.05, pants ? 0.66 : 0.72, pants ? m.bottom : m.legs, 0.06));
      const foot = mesh(new THREE.BoxGeometry(0.09, 0.07, 0.2), m.shoes, { outline: 0.1 });
      foot.position.set(0, -0.83, 0.04);
      hip.add(foot);
      this.body.add(hip);
      return hip;
    });
    if (def.bottomStyle === "skirt") {
      const hem = def.hem ?? 0.1, flare = def.flare ?? 0.28;
      const skirt = mesh(lathe([[0.001, hem], [flare, hem], [flare * 0.85, (0.98 + hem) / 2 - 0.1], [0.15, 0.8], [0.118, 0.98], [0.001, 0.98]]),
        m.bottom, { outline: 0.03 });
      this.body.add(skirt);
    }
  }

  buildTorso() {
    const { mats: m } = this;
    this.torso = new THREE.Group();
    this.torso.position.y = 0.95;
    this.body.add(this.torso);
    const chest = mesh(lathe([[0.001, 0], [0.108, 0], [0.12, 0.13], [0.132, 0.27], [0.135, 0.36], [0.1, 0.43], [0.04, 0.46], [0.001, 0.46]]),
      m.top, { outline: 0.05 });
    this.torso.add(chest);
    const sash = mesh(new THREE.CylinderGeometry(0.122, 0.118, 0.1, 20), m.accent, { outline: 0.05 });
    sash.position.y = 0.06;
    this.torso.add(sash);
    const neck = mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.1, 12), m.skin);
    neck.position.y = 0.49;
    this.torso.add(neck);
  }

  buildHead() {
    const { def, mats: m } = this;
    this.head = new THREE.Group();
    this.head.position.y = 0.6;
    this.torso.add(this.head);

    const skull = mesh(new THREE.SphereGeometry(HEAD_R, 32, 20), this.headMat, { outline: 0.05 });
    skull.scale.set(1, 1.02, 0.98);
    this.head.add(skull);

    const back = mesh(new THREE.SphereGeometry(HEAD_R * 1.1, 24, 16), m.hair, { outline: 0.05 });
    back.position.set(0, 0.02, -0.03);
    this.head.add(back);
    this.head.add(mesh(fringeGeometry(HEAD_R * 1.07), m.hair, { outline: 0.04 }));

    for (const side of [-1, 1]) {
      const lock = mesh(capsule(0.026, def.lockLength ?? 0.13), m.hair, { outline: 0.1 });
      lock.position.set(side * 0.128, -0.07, 0.035);
      lock.rotation.z = side * 0.08;
      this.head.add(lock);
    }
    def.hairStyle?.(this, m);
  }

  buildArms() {
    const { def, mats: m } = this;
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.16, 0.39, 0);
      this.torso.add(shoulder);
      shoulder.add(limb(0.043, 0.2, m.top));
      const elbow = new THREE.Group();
      elbow.position.y = -0.29;
      shoulder.add(elbow);
      elbow.add(limb(0.038, 0.18, m.top));
      if (def.wideSleeves) {
        const sleeve = mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.26, 12, 1, true), m.top, { outline: 0.04 });
        sleeve.material = sleeve.material.clone();
        sleeve.material.side = THREE.DoubleSide;
        sleeve.position.y = -0.14;
        elbow.add(sleeve);
      }
      const hand = mesh(new THREE.SphereGeometry(0.037, 12, 10), m.skin, { outline: 0.1 });
      hand.position.y = -0.29;
      elbow.add(hand);
      return { shoulder, elbow, hand };
    });
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
    return this.body.position.y + 1.55;
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
