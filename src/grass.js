import * as THREE from "three";
import { WORLD, heightAt, distToPath, fbm, builtUp } from "./terrain.js";

// Bake terrain height (R) and grass density (G) into a texture the grass shader samples.
export function bakeGroundTexture(res = 512) {
  const data = new Uint16Array(res * res * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const texel = WORLD.size / res;
  const coord = (i) => ((i + 0.5) / res - 0.5) * WORLD.size;
  const heights = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) heights[j * res + i] = heightAt(coord(i), coord(j));
  }
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = coord(i), z = coord(j);
      const h = heights[j * res + i];
      const hx = heights[j * res + Math.min(i + 1, res - 1)];
      const hz = heights[Math.min(j + 1, res - 1) * res + i];
      const slope = Math.hypot(hx - h, hz - h) / texel;
      let density = 1;
      density *= THREE.MathUtils.smoothstep(distToPath(x, z), 1.6, 2.6);
      density *= THREE.MathUtils.smoothstep(h, 0.7, 1.4);
      density *= 1 - THREE.MathUtils.smoothstep(slope, 0.8, 1.2);
      density *= 1 - THREE.MathUtils.smoothstep(h, 45, 60);
      density *= THREE.MathUtils.smoothstep(fbm(x * 0.03 + 11, z * 0.03 - 5), -0.45, -0.2);
      density *= 1 - builtUp(x, z);
      const k = (j * res + i) * 4;
      data[k] = toHalf(h);
      data[k + 1] = toHalf(density);
      data[k + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function bladeGeometry() {
  const segs = 4;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = 0.045 * (1 - t) ** 0.9;
    const lean = t * t * 0.18;
    pos.push(-w, t, lean, w, t, lean);
    uv.push(0, t, 1, t);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const vert = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform vec3 uCenter;
  uniform float uTile;
  uniform float uWorld;
  uniform sampler2D uGround;
  attribute vec4 aBlade;   // x, z, rotation, height
  attribute vec3 aFlower;  // flower color, black = plain blade
  varying float vY;
  varying float vNoise;
  varying vec3 vFlower;

  void main() {
    vec2 wp = uCenter.xz + mod(aBlade.xy - uCenter.xz, uTile) - uTile * 0.5;
    vec4 g = texture2D(uGround, wp / uWorld + 0.5);
    float d = distance(wp, uCenter.xz);
    float s = aBlade.w * g.g * (1.0 - smoothstep(uTile * 0.28, uTile * 0.48, d));

    vec3 p = position * vec3(1.0 + aBlade.w * 0.6, s, s);
    float c = cos(aBlade.z), sn = sin(aBlade.z);
    p.xz = mat2(c, -sn, sn, c) * p.xz;

    float wind = sin(uTime * 1.7 + wp.x * 0.11 + wp.y * 0.07) * 0.55
               + sin(uTime * 3.1 + wp.x * 0.37 - wp.y * 0.21) * 0.2;
    float bend = uv.y * uv.y;
    p.x += wind * bend * 0.45 * s;
    p.z += wind * bend * 0.2 * s;

    vec3 world = vec3(wp.x, g.r - 0.05, wp.y) + p;
    vY = uv.y;
    vNoise = fract(sin(dot(floor(wp * 0.25), vec2(12.9898, 78.233))) * 43758.5453);
    vFlower = aFlower;

    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uTint;
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uTipWarm;
  varying float vY;
  varying float vNoise;
  varying vec3 vFlower;

  void main() {
    vec3 tip = mix(uTip, uTipWarm, vNoise * 0.7);
    vec3 col = mix(uBase, tip, smoothstep(0.05, 0.95, vY));
    float isFlower = step(0.01, vFlower.r + vFlower.g + vFlower.b);
    col = mix(col, vFlower, isFlower * step(0.78, vY));
    gl_FragColor = vec4(col * uTint, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createGrass(groundTex, count = 120000) {
  const tile = 96;
  const geo = bladeGeometry();
  const blade = new Float32Array(count * 4);
  const flower = new Float32Array(count * 3);
  const palette = ["#ffffff", "#ffd1e6", "#ffe066", "#a9c8ff", "#ff9ab8"].map((h) => new THREE.Color(h));

  for (let i = 0; i < count; i++) {
    const isFlower = Math.random() < 0.025;
    blade.set([
      Math.random() * tile,
      Math.random() * tile,
      Math.random() * Math.PI * 2,
      isFlower ? 0.35 + Math.random() * 0.25 : 0.3 + Math.random() * 0.55,
    ], i * 4);
    if (isFlower) {
      const c = palette[Math.floor(Math.random() * palette.length)];
      flower.set([c.r, c.g, c.b], i * 3);
    }
  }
  geo.setAttribute("aBlade", new THREE.InstancedBufferAttribute(blade, 4));
  geo.setAttribute("aFlower", new THREE.InstancedBufferAttribute(flower, 3));
  geo.instanceCount = count;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uTile: { value: tile },
      uWorld: { value: WORLD.size },
      uGround: { value: null },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uBase: { value: new THREE.Color("#2f7a34") },
      uTip: { value: new THREE.Color("#a6db5c") },
      uTipWarm: { value: new THREE.Color("#d9e27a") },
    },
  ]);
  uniforms.uGround.value = groundTex;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
