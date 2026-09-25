import * as THREE from "three";
import { WORLD } from "./terrain.js";

// Particles live in a box that wraps around the camera, so there are always some nearby.
const wrap = /* glsl */ `
  vec3 wrapAround(vec3 p, vec3 center, vec3 box) {
    return center + mod(p - center, box) - box * 0.5;
  }
`;

const petalVert = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  uniform vec3 uCenter;
  attribute vec4 aSeed;
  varying float vShade;
  ${wrap}
  mat3 rot(vec3 a) {
    vec3 s = sin(a), c = cos(a);
    return mat3(c.y * c.z, c.y * s.z, -s.y,
                s.x * s.y * c.z - c.x * s.z, s.x * s.y * s.z + c.x * c.z, s.x * c.y,
                c.x * s.y * c.z + s.x * s.z, c.x * s.y * s.z - s.x * c.z, c.x * c.y);
  }
  void main() {
    float t = uTime + aSeed.w * 40.0;
    vec3 drift = vec3(t * 1.3, -t * 0.75, t * 0.45);
    drift.x += sin(t * 1.7 + aSeed.w * 9.0) * 0.8;
    drift.z += cos(t * 1.3 + aSeed.w * 5.0) * 0.6;
    vec3 center = uCenter + vec3(0.0, 6.0, 0.0);
    vec3 wp = wrapAround(aSeed.xyz + drift, center, vec3(70.0, 28.0, 70.0));
    mat3 r = rot(vec3(t * 2.1, t * 1.3 + aSeed.w * 6.0, t * 1.7));
    vec3 n = r * vec3(0.0, 0.0, 1.0);
    vShade = 0.75 + 0.25 * abs(n.y);
    vec4 mvPosition = viewMatrix * vec4(wp + r * position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const petalFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uTint;
  varying float vShade;
  void main() {
    gl_FragColor = vec4(uColor * uTint * vShade, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createPetals(count = 2600) {
  // a small teardrop-ish petal
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.09);
  shape.quadraticCurveTo(0.09, -0.02, 0.05, 0.07);
  shape.lineTo(0, 0.05);
  shape.lineTo(-0.05, 0.07);
  shape.quadraticCurveTo(-0.09, -0.02, 0, -0.09);
  const base = new THREE.ShapeGeometry(shape, 3);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes.position = base.attributes.position;
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    seed.set([Math.random() * 70, Math.random() * 28, Math.random() * 70, Math.random()], i * 4);
  }
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = count;

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color("#ffc2d9") },
      uTint: { value: new THREE.Color(1, 1, 1) },
    },
  ]);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: petalVert, fragmentShader: petalFrag, side: THREE.DoubleSide, fog: true,
  }));
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

const flyVert = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCenter;
  uniform float uWorld;
  uniform float uPixelRatio;
  uniform sampler2D uGround;
  attribute vec4 aSeed;
  varying float vBlink;
  ${wrap}
  void main() {
    float t = uTime * 0.4 + aSeed.w * 30.0;
    vec3 p = aSeed.xyz + vec3(sin(t) * 2.0, 0.0, cos(t * 0.8) * 2.0);
    vec3 wp = wrapAround(p, uCenter, vec3(60.0, 1.0, 60.0));
    float ground = texture2D(uGround, wp.xz / uWorld + 0.5).r;
    wp.y = max(ground, 0.2) + 0.4 + aSeed.y * 2.6 + sin(t * 2.3) * 0.3;
    vBlink = pow(0.5 + 0.5 * sin(uTime * 2.5 + aSeed.w * 60.0), 3.0);
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    gl_PointSize = (6.0 + 6.0 * vBlink) * uPixelRatio * (12.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const flyFrag = /* glsl */ `
  uniform float uAmount;
  varying float vBlink;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * (0.4 + vBlink), a * uAmount * (0.3 + vBlink));
  }
`;

export function createFireflies(groundTex, count = 450) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seed.set([Math.random() * 60, Math.random(), Math.random() * 60, Math.random()], i * 4);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));

  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uWorld: { value: WORLD.size },
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    uGround: { value: groundTex },
    uAmount: { value: 0 },
  };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: flyVert, fragmentShader: flyFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  return { points, uniforms };
}
