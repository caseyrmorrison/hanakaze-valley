import * as THREE from "three";
import { WORLD, paddyLevel } from "./terrain.js";

// Flooded terraces mirror the sky; rows of young rice stand in the water and lean with the wind.
const waterVert = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vWorld;
  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 refl = reflect(-view, vec3(0.0, 1.0, 0.0));
    vec3 sky = mix(uSkyHorizon, uSkyTop, pow(clamp(refl.y, 0.0, 1.0), 0.5));
    float ripple = sin(vWorld.x * 3.0 + uTime * 1.3) * sin(vWorld.z * 2.4 - uTime) * 0.5 + 0.5;
    sky *= 0.82 + ripple * 0.08;
    sky += uSunColor * pow(max(dot(refl, uSunDir), 0.0), 60.0) * 0.8;
    vec3 mud = vec3(0.32, 0.3, 0.2);
    vec3 col = mix(mud, sky, 0.55 + 0.35 * (1.0 - view.y));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const riceVert = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  attribute vec3 aOffset;
  varying float vY;
  void main() {
    vec3 p = position;
    float sway = sin(uTime * 1.6 + aOffset.x * 0.3 + aOffset.z * 0.2) * 0.08 * uv.y;
    p.x += sway;
    vec3 world = aOffset + p;
    vY = uv.y;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const riceFrag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uTint;
  varying float vY;
  void main() {
    vec3 col = mix(vec3(0.24, 0.5, 0.2), vec3(0.62, 0.86, 0.36), vY);
    gl_FragColor = vec4(col * uTint, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// A tuft of three crossed blades.
function tuftGeometry() {
  const pos = [], uv = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI, c = Math.cos(a) * 0.05, s = Math.sin(a) * 0.05;
    pos.push(-c, 0, -s, c, 0, s, 0, 0.45, 0);
    uv.push(0, 0, 1, 0, 0.5, 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function createPaddies() {
  const p = WORLD.paddies;
  const group = new THREE.Group();
  const w = (p.x1 - p.x0) / p.cols, d = (p.z1 - p.z0) / p.rows;

  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uSkyTop: { value: new THREE.Color() },
    uSkyHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uTime: { value: 0 },
  }]);
  const waterMat = new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: waterVert, fragmentShader: waterFrag, fog: true });

  const offsets = [];
  for (let i = 0; i < p.cols; i++) {
    for (let j = 0; j < p.rows; j++) {
      const level = paddyLevel(i, j);
      const cx = p.x0 + (i + 0.5) * w, cz = p.z0 + (j + 0.5) * d;
      const pond = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, d - 1).rotateX(-Math.PI / 2), waterMat);
      pond.position.set(cx, level - 0.08, cz);
      group.add(pond);
      for (let x = -w / 2 + 1.1; x < w / 2 - 1; x += 0.7) {
        for (let z = -d / 2 + 1.1; z < d / 2 - 1; z += 0.55) {
          offsets.push(cx + x + (Math.random() - 0.5) * 0.08, level - 0.1, cz + z + (Math.random() - 0.5) * 0.08);
        }
      }
    }
  }

  const geo = tuftGeometry();
  geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.instanceCount = offsets.length / 3;
  const riceUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } }]);
  const rice = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: riceUniforms, vertexShader: riceVert, fragmentShader: riceFrag, side: THREE.DoubleSide, fog: true,
  }));
  rice.frustumCulled = false;
  group.add(rice);

  return {
    group,
    update(t, mood) {
      waterUniforms.uTime.value = t;
      waterUniforms.uSkyTop.value.copy(mood.top);
      waterUniforms.uSkyHorizon.value.copy(mood.horizon);
      waterUniforms.uSunColor.value.copy(mood.lightColor).multiplyScalar(mood.lightIntensity * 0.5);
      waterUniforms.uSunDir.value.copy(mood.light);
      riceUniforms.uTime.value = t;
      riceUniforms.uTint.value.copy(mood.grass);
    },
  };
}
