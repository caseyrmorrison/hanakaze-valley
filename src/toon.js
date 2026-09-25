import * as THREE from "three";

// Shared stepped gradient that gives every lit surface its cel-shaded look.
function makeGradient(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const gradient3 = makeGradient([150, 212, 255]);
export const gradient2 = makeGradient([185, 255]);

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: opts.soft ? gradient2 : gradient3,
    ...opts.extra,
  });
}

export const outlineMaterial = new THREE.MeshBasicMaterial({
  color: 0x2a1d33,
  side: THREE.BackSide,
});

// Inverted-hull outline: a slightly inflated back-face copy drawn in ink color.
export function withOutline(mesh, thickness = 0.06) {
  const hull = new THREE.Mesh(mesh.geometry, outlineMaterial);
  hull.scale.setScalar(1 + thickness);
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return mesh;
}
