import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFrag = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uSunVis;
  uniform float uMoonVis;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.42));
    col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.25, h));

    // sun: soft halo + crisp anime disc
    float s = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 80.0) * 0.6) * uSunVis;
    col = mix(col, vec3(1.0, 0.97, 0.88), smoothstep(0.9988, 0.9992, s) * uSunVis);

    // moon
    float m = max(dot(d, uMoonDir), 0.0);
    col += vec3(0.55, 0.62, 1.0) * pow(m, 40.0) * 0.4 * uMoonVis;
    col = mix(col, vec3(0.96, 0.97, 1.0), smoothstep(0.9993, 0.9995, m) * uMoonVis);

    // stars
    vec3 cell = floor(d * 420.0);
    float n = hash3(cell);
    float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + n * 80.0);
    float star = step(0.9975, n) * smoothstep(0.02, 0.3, h) * twinkle;
    col += vec3(1.0, 0.95, 0.9) * star * uStars;

    // faint milky band at night
    float band = exp(-pow(dot(d, normalize(vec3(0.6, 0.3, -0.75))) * 5.0, 2.0));
    col += vec3(0.25, 0.22, 0.45) * band * smoothstep(0.0, 0.4, h) * uStars * 0.5;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uSunVis: { value: 1 },
    uMoonVis: { value: 0 },
    uStars: { value: 0 },
    uTime: { value: 0 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  mesh.scale.setScalar(1800);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

const cloudVert = /* glsl */ `
  varying vec3 vNormal;
  varying float vHeight;
  void main() {
    vNormal = normalize(mat3(modelMatrix) * normal);
    vHeight = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Two-tone cel shading: sunlit cream on top, sky-tinted shadow underneath.
const cloudFrag = /* glsl */ `
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uLightDir;
  varying vec3 vNormal;
  varying float vHeight;
  void main() {
    vec3 n = normalize(vNormal);
    float lit = dot(n, uLightDir) * 0.45 + n.y * 0.55 + smoothstep(0.0, 40.0, vHeight) * 0.35;
    float k = smoothstep(0.28, 0.34, lit);
    vec3 col = mix(uShade, uLit, k);
    col = mix(col, uLit * 1.08, smoothstep(0.75, 0.8, lit) * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// Big cumulus clouds: clustered spheres with a flattened base.
export function createClouds(rand) {
  const uniforms = {
    uLit: { value: new THREE.Color() },
    uShade: { value: new THREE.Color() },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: cloudVert,
    fragmentShader: cloudFrag,
  });
  const group = new THREE.Group();

  for (let c = 0; c < 22; c++) {
    const parts = [];
    const puffs = 7 + Math.floor(rand() * 9);
    const width = 60 + rand() * 90;
    for (let i = 0; i < puffs; i++) {
      const t = i / (puffs - 1) - 0.5;
      const r = (1 - Math.abs(t) * 1.3) * (18 + rand() * 16) + 8;
      const g = new THREE.IcosahedronGeometry(r, 3);
      g.translate(t * width + (rand() - 0.5) * 12, r * 0.4 + rand() * 10, (rand() - 0.5) * 30);
      parts.push(g);
    }
    // a tall tower on some clouds for that summer-sky feel
    if (rand() < 0.4) {
      const g = new THREE.IcosahedronGeometry(26 + rand() * 12, 3);
      g.translate((rand() - 0.5) * 20, 38, 0);
      parts.push(g);
    }
    const geo = mergeGeometries(parts);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, Math.max(p.getY(i), 0));
    geo.computeVertexNormals();

    const cloud = new THREE.Mesh(geo, material);
    const angle = (c / 22) * Math.PI * 2 + rand() * 0.2;
    const dist = 480 + rand() * 360;
    cloud.position.set(Math.cos(angle) * dist, 240 + rand() * 220, Math.sin(angle) * dist);
    cloud.lookAt(0, cloud.position.y, 0);
    cloud.scale.setScalar(0.9 + rand() * 0.9);
    group.add(cloud);
  }
  return { group, uniforms };
}
