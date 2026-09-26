import * as THREE from "three";
import { toon, withOutline } from "./toon.js";
import { emoteTextures } from "./faces.js";
import { WORLD, heightAt } from "./terrain.js";

let EMOTES = null;

function part(geo, material, outline = 0.08) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  if (outline) withOutline(m, outline);
  return m;
}

// Mochi, a calico who naps in the village square and follows visitors around.
class Cat {
  constructor() {
    EMOTES ??= emoteTextures();
    const white = toon("#f7f3ea"), orange = toon("#f2994a"), dark = toon("#3a3230"), pink = toon("#ff9fb0");
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.2;
    this.root.add(this.body);

    const torso = part(new THREE.CapsuleGeometry(0.1, 0.26, 4, 12).rotateX(Math.PI / 2), white);
    this.body.add(torso);
    const patch = part(new THREE.SphereGeometry(0.09, 12, 8), orange, 0);
    patch.scale.set(1.05, 0.55, 1.3);
    patch.position.set(0.02, 0.07, -0.06);
    this.body.add(patch);
    const spot = part(new THREE.SphereGeometry(0.06, 10, 8), dark, 0);
    spot.scale.set(1, 0.5, 1.1);
    spot.position.set(-0.04, 0.08, 0.1);
    this.body.add(spot);

    this.head = new THREE.Group();
    this.head.position.set(0, 0.11, 0.24);
    this.body.add(this.head);
    this.head.add(part(new THREE.SphereGeometry(0.1, 16, 12), white));
    const cap = part(new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, 0, 1.1), orange, 0);
    cap.scale.setScalar(1.02);
    this.head.add(cap);
    for (const side of [-1, 1]) {
      const ear = part(new THREE.ConeGeometry(0.035, 0.08, 4), side < 0 ? orange : dark);
      ear.position.set(side * 0.055, 0.09, -0.01);
      ear.rotation.z = -side * 0.25;
      this.head.add(ear);
    }
    this.eyes = [-1, 1].map((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), dark);
      eye.position.set(side * 0.038, 0.015, 0.088);
      this.head.add(eye);
      return eye;
    });
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), pink);
    nose.position.set(0, -0.012, 0.1);
    this.head.add(nose);

    this.legs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.06, -0.05, sz * 0.12);
      const leg = part(new THREE.CapsuleGeometry(0.026, 0.1, 3, 8), white, 0.1);
      leg.position.y = -0.07;
      hip.add(leg);
      this.body.add(hip);
      return hip;
    });

    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.04, -0.2);
    const tail = part(new THREE.CapsuleGeometry(0.022, 0.24, 3, 8), orange, 0.1);
    tail.position.y = 0.14;
    this.tail.add(tail);
    this.tail.rotation.x = -0.5;
    this.body.add(this.tail);

    this.collider = { x: 0, z: 0, r: 0.25 };
    this.state = {};
    this.heading = 0;
    this.expression = "neutral";
    this.speaking = false;
    this.walk = 0;
    this.pose = "stand";
    this.emoteSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, fog: false }));
    this.emoteSprite.visible = false;
    this.root.add(this.emoteSprite);
    this.emoteLife = 0;
    this.emoteType = null;
  }

  emote(type, seconds = 2) {
    this.emoteSprite.material.map = EMOTES[type];
    this.emoteSprite.material.needsUpdate = true;
    this.emoteSprite.visible = true;
    this.emoteLife = seconds;
    this.emoteAge = 0;
    this.emoteType = type;
  }

  sparkle() {
    this.emote("heart", 1.6);
  }

  turnTowards(x, z, dt, rate = 4) {
    const want = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    const diff = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
    this.heading += diff * Math.min(1, dt * rate);
    return diff;
  }

  update(dt, t) {
    const lying = this.pose === "sleep";
    this.body.position.y += ((lying ? 0.1 : 0.2) - this.body.position.y) * Math.min(1, dt * 5);
    const stride = Math.sin(this.walk * 12);
    this.legs.forEach((hip, i) => {
      const swing = lying ? 1.3 : stride * (i === 0 || i === 3 ? 0.5 : -0.5) * Math.min(1, this.speed * 2);
      hip.rotation.x = lying ? 1.3 : swing;
    });
    this.tail.rotation.z = Math.sin(t * (this.pose === "follow" ? 5 : 1.6)) * 0.35;
    const closed = lying || this.expression === "happy" || this.expression === "sleep";
    for (const e of this.eyes) e.scale.y = closed ? 0.25 : 1;
    this.head.rotation.x = this.pose === "look" ? -0.45 : lying ? 0.3 : 0;
    this.root.rotation.y = this.heading;

    if (this.emoteSprite.visible) {
      this.emoteAge += dt;
      this.emoteLife -= dt;
      const pop = Math.min(1, this.emoteAge / 0.18);
      const s = 0.3 * (pop < 1 ? pop * 1.25 : 1) * (this.emoteLife < 0.3 ? Math.max(0, this.emoteLife / 0.3) : 1);
      this.emoteSprite.scale.set(s, s, s);
      this.emoteSprite.position.set(0.1, 0.6 + Math.sin(this.emoteAge * 4) * 0.02, 0);
      if (this.emoteLife <= 0) this.emoteSprite.visible = false;
    }
    this.collider.x = this.root.position.x;
    this.collider.z = this.root.position.z;
  }
}

function catBehavior(m, ctx) {
  const c = m.character, s = c.state, p = c.root.position, { dt, t, player } = ctx;
  const { village } = WORLD;
  s.mode ??= "wander";
  s.timer ??= 3;
  c.speed = 0;

  if (ctx.talking) {
    if (!s.petting) {
      s.petting = true;
      ctx.sound.purr();
      ctx.sound.meow(p.x, p.z);
    }
    c.pose = "look";
    c.turnTowards(player.x, player.z, dt, 5);
    return;
  }
  s.petting = false;
  s.timer -= dt;

  if (s.mode !== "sleep" && ctx.dist < 5 && ctx.dist > 1.1) {
    s.mode = "follow";
  } else if (s.mode === "follow" && ctx.dist >= 7) {
    s.mode = "wander";
    s.timer = 2;
  }

  if (s.mode === "follow") {
    c.pose = ctx.dist < 1.6 ? "look" : "follow";
    c.turnTowards(player.x, player.z, dt, 6);
    if (ctx.dist > 1.4) {
      c.speed = 1.3;
    } else if (!s.meowed) {
      s.meowed = true;
      c.emote("♪", 1.5);
      ctx.sound.meow(p.x, p.z);
    }
  } else if (s.mode === "sleep") {
    c.pose = "sleep";
    if (!c.emoteSprite.visible) c.emote("zzz", 3);
    if (s.timer <= 0 || ctx.dist < 2.2) {
      s.mode = "wander";
      s.timer = 2;
      if (ctx.dist < 2.2) c.emote("!", 1.2);
    }
  } else {
    s.meowed = false;
    c.pose = "stand";
    if (!s.target || s.timer <= 0) {
      if (Math.random() < 0.3) {
        s.mode = "sleep";
        s.timer = 14 + Math.random() * 20;
        return;
      }
      const a = Math.random() * Math.PI * 2, r = Math.random() * 9;
      s.target = [village.x + Math.cos(a) * r, village.z + Math.sin(a) * r];
      s.timer = 6 + Math.random() * 6;
    }
    const dx = s.target[0] - p.x, dz = s.target[1] - p.z;
    if (Math.hypot(dx, dz) > 0.3) {
      c.turnTowards(s.target[0], s.target[1], dt, 4);
      c.speed = 0.7;
    }
  }

  if (c.speed > 0) {
    p.x += Math.sin(c.heading) * c.speed * dt;
    p.z += Math.cos(c.heading) * c.speed * dt;
    p.y = heightAt(p.x, p.z);
    c.walk += dt * c.speed;
  }
}

export function createCatMember(scene, colliders) {
  const cat = new Cat();
  const { village } = WORLD;
  cat.root.position.set(village.x + 3, heightAt(village.x + 3, village.z + 4), village.z + 4);
  cat.speed = 0;
  scene.add(cat.root);
  colliders.push(cat.collider);
  return {
    name: "Mochi", role: "Village cat", age: 4, accent: "#f2994a", voice: 880,
    lines: [
      { text: "Mrrp?", face: "neutral", emote: "♪" },
      { text: "*leans into your hand and purrs like a small engine*", face: "happy", sparkle: true },
      { text: "*headbutts your shin, then pretends it was an accident*", face: "happy" },
    ],
    repeat: [
      { text: "Mrrrow.", face: "happy", sparkle: true },
      { text: "*rolls over to show her belly. It is a trap.*", face: "happy", emote: "sweat" },
      { text: "*purrs, then notices a butterfly and forgets you exist*", face: "neutral", emote: "!" },
    ],
    character: cat, behavior: catBehavior, heardAll: false,
  };
}
