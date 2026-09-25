import * as THREE from "three";
import { outlineMaterial } from "./toon.js";

// Collects transforms per (geometry, material) and emits one InstancedMesh each,
// plus an inverted-hull outline instance set when requested.
export class Instancer {
  constructor() {
    this.buckets = new Map();
  }

  add(geometry, material, matrix, outline = 0) {
    const key = geometry.uuid + material.uuid + outline;
    if (!this.buckets.has(key)) this.buckets.set(key, { geometry, material, outline, matrices: [] });
    this.buckets.get(key).matrices.push(matrix.clone());
  }

  build({ castShadow = true } = {}) {
    const group = new THREE.Group();
    const s = new THREE.Matrix4();
    for (const { geometry, material, outline, matrices } of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);

      if (outline > 0) {
        const hull = new THREE.InstancedMesh(geometry, outlineMaterial, matrices.length);
        s.makeScale(1 + outline, 1 + outline, 1 + outline);
        matrices.forEach((m, i) => hull.setMatrixAt(i, m.clone().multiply(s)));
        hull.computeBoundingSphere();
        group.add(hull);
      }
    }
    return group;
  }
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

// Small helper to build a matrix from plain numbers.
export function mat(x, y, z, { rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx } = {}) {
  _q.setFromEuler(_e.set(rx, ry, rz, "YXZ"));
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Deterministic PRNG so the valley looks the same every visit.
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
