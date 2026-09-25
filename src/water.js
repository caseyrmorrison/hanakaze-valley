import * as THREE from "three";
import { WORLD, heightAt } from "./terrain.js";

const vert = /* glsl */ `
  #include <fog_pars_vertex>
  attribute float aDepth;
  varying float vDepth;
  varying vec3 vWorld;
  void main() {
    vDepth = aDepth;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying float vDepth;
  varying vec3 vWorld;

  float wave(vec2 p) {
    return sin(p.x * 0.35 + uTime * 0.9) * sin(p.y * 0.28 - uTime * 0.7)
         + 0.5 * sin(p.x * 0.9 - p.y * 0.6 + uTime * 1.6);
  }

  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(view.y, 0.0), 3.0);

    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 3.5, vDepth));
    col = mix(col, uSky, fres * 0.3);

    // sparkly anime highlight bands
    float w = wave(vWorld.xz);
    float glint = smoothstep(1.15, 1.3, w);
    vec3 refl = reflect(-view, vec3(0.0, 1.0, 0.0));
    float sunSpec = pow(max(dot(refl, uSunDir), 0.0), 40.0);
    col += uSunColor * glint * (0.25 + sunSpec * 2.0);
    col += vec3(1.0) * smoothstep(0.985, 0.995, sunSpec + w * 0.01) * 0.6;

    // wobbly foam line along the shore
    float edge = vDepth + sin(vWorld.x * 0.8 + uTime * 1.3) * 0.08 + sin(vWorld.z * 0.9 - uTime) * 0.08;
    float foam = smoothstep(0.35, 0.3, edge) + smoothstep(0.7, 0.66, edge) * smoothstep(0.55, 0.6, edge) * 0.8;
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0));

    gl_FragColor = vec4(col, 0.92);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createWater() {
  const { lake } = WORLD;
  const size = lake.r * 2.4;
  const geo = new THREE.PlaneGeometry(size, size, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const depth = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    depth[i] = -heightAt(pos.getX(i) + lake.x, pos.getZ(i) + lake.z);
  }
  geo.setAttribute("aDepth", new THREE.BufferAttribute(depth, 1));

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color("#4fd8cf") },
      uDeep: { value: new THREE.Color("#1f64b8") },
      uSky: { value: new THREE.Color("#cdeaff") },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
    },
  ]);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    fog: true,
  }));
  mesh.position.set(lake.x, 0, lake.z);
  return { mesh, uniforms };
}
