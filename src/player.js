import * as THREE from "three";
import { WORLD, heightAt } from "./terrain.js";

const EYE = 1.65;

export class Player {
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.pos = new THREE.Vector3(WORLD.spawn.x, 0, WORLD.spawn.z);
    this.pos.y = this.floorAt(this.pos.x, this.pos.z);
    this.vy = 0;
    this.yaw = 0;
    this.pitch = 0.04;
    this.keys = new Set();
    this.stride = 0;
    this.touchMove = new THREE.Vector2();
    this.enabled = false;

    addEventListener("keydown", (e) => this.keys.add(e.code));
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
    // Pointer lock when available; otherwise click-and-drag to look around.
    let dragging = false;
    dom.addEventListener("mousedown", () => (dragging = true));
    addEventListener("mouseup", () => (dragging = false));
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === dom || (dragging && this.enabled)) this.look(e.movementX, e.movementY);
    });
    dom.addEventListener("click", () => {
      if (this.enabled && document.pointerLockElement !== dom) dom.requestPointerLock?.()?.catch?.(() => {});
    });
    this.bindTouch();
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.0022, -1.35, 1.35);
  }

  // Left half of the screen is a virtual stick, right half drags the view.
  bindTouch() {
    const touches = new Map();
    this.dom.addEventListener("touchstart", (e) => {
      for (const t of e.changedTouches) {
        touches.set(t.identifier, { x: t.clientX, y: t.clientY, ox: t.clientX, oy: t.clientY, move: t.clientX < innerWidth / 2 });
      }
    }, { passive: true });
    this.dom.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        const s = touches.get(t.identifier);
        if (!s) continue;
        if (s.move) {
          this.touchMove.set((t.clientX - s.ox) / 60, (t.clientY - s.oy) / 60).clampLength(0, 1);
        } else {
          this.look((t.clientX - s.x) * 1.6, (t.clientY - s.y) * 1.6);
        }
        s.x = t.clientX;
        s.y = t.clientY;
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (touches.get(t.identifier)?.move) this.touchMove.set(0, 0);
        touches.delete(t.identifier);
      }
    };
    this.dom.addEventListener("touchend", end);
    this.dom.addEventListener("touchcancel", end);
  }

  floorAt(x, z) {
    const { lake } = WORLD;
    let y = heightAt(x, z);
    const onPier = Math.abs(x - lake.x) < 1.3 && z < lake.z + 34.5 && z > lake.z + 16.5;
    if (onPier) y = Math.max(y, 0.71);
    return y;
  }

  update(dt) {
    const k = this.keys;
    let fx = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let sx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    fx -= this.touchMove.y;
    sx += this.touchMove.x;
    if (!this.enabled) fx = sx = 0;

    const speed = k.has("ShiftLeft") || k.has("ShiftRight") ? 11 : 5;
    const len = Math.hypot(fx, sx);
    if (len > 1) { fx /= len; sx /= len; }

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (-sin * fx + cos * sx) * speed * dt;
    const dz = (-cos * fx - sin * sx) * speed * dt;
    const nx = this.pos.x + dx, nz = this.pos.z + dz;

    // stay out of deep water and inside the valley
    const floor = this.floorAt(nx, nz);
    if (floor > -0.6 && Math.hypot(nx, nz) < WORLD.walkRadius) {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    for (const c of this.colliders) {
      const ox = this.pos.x - c.x, oz = this.pos.z - c.z;
      const d = Math.hypot(ox, oz), min = c.r + 0.35;
      if (d < min && d > 1e-4) {
        this.pos.x = c.x + (ox / d) * min;
        this.pos.z = c.z + (oz / d) * min;
      }
    }

    const ground = this.floorAt(this.pos.x, this.pos.z);
    const grounded = this.pos.y <= ground + 0.01;
    if (grounded && this.enabled && k.has("Space")) this.vy = 6;
    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y < ground) {
      this.pos.y = ground;
      this.vy = 0;
    }

    const moving = len > 0.1 && grounded;
    this.stride += moving ? dt * speed * 1.6 : 0;
    const bob = moving ? Math.sin(this.stride) * 0.05 : 0;

    this.camera.position.set(this.pos.x, this.pos.y + EYE + bob, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
