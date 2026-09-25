import * as THREE from "three";

// Each keyframe is a full lighting mood. Pressing T blends to the next one.
export const MOODS = [
  {
    name: "Morning",
    sun: [28, 110], light: [28, 110], lightColor: "#fff1d8", lightIntensity: 2.4,
    top: "#4d9dff", horizon: "#cdeaff", sunColor: "#fff2cc",
    hemiSky: "#d4ebff", hemiGround: "#6f8f4c", hemiIntensity: 1.2,
    fog: "#cfe4f5", fogDensity: 0.0013, clouds: "#ffffff",
    stars: 0, sunVis: 1, moonVis: 0, lanterns: 0, fireflies: 0, grass: "#ffffff",
  },
  {
    name: "Golden hour",
    sun: [7, 250], light: [12, 250], lightColor: "#ffb36e", lightIntensity: 2.3,
    top: "#3f86e0", horizon: "#ffcf9e", sunColor: "#ffb070",
    hemiSky: "#ffd9b8", hemiGround: "#6e5a48", hemiIntensity: 1.0,
    fog: "#f6c7a2", fogDensity: 0.0015, clouds: "#ffe1c9",
    stars: 0, sunVis: 1, moonVis: 0, lanterns: 0.4, fireflies: 0, grass: "#ffe9c8",
  },
  {
    name: "Twilight",
    sun: [-3, 262], light: [10, 262], lightColor: "#ff8f86", lightIntensity: 0.9,
    top: "#26306e", horizon: "#f28c9b", sunColor: "#ff7a6a",
    hemiSky: "#9d86c4", hemiGround: "#3b3150", hemiIntensity: 1.0,
    fog: "#9e7cab", fogDensity: 0.0017, clouds: "#e0a3c3",
    stars: 0.45, sunVis: 0.6, moonVis: 0.5, lanterns: 1, fireflies: 0.5, grass: "#c7abd6",
  },
  {
    name: "Night",
    sun: [-40, 280], light: [38, 60], lightColor: "#a8b8ff", lightIntensity: 0.75,
    top: "#070b26", horizon: "#27346c", sunColor: "#000000",
    hemiSky: "#4556a0", hemiGround: "#121a30", hemiIntensity: 0.9,
    fog: "#1a2350", fogDensity: 0.0016, clouds: "#46558e",
    stars: 1, sunVis: 0, moonVis: 1, lanterns: 1.6, fireflies: 1, grass: "#7483c4",
  },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

export function dirFromAngles([elevDeg, azDeg], out = new THREE.Vector3()) {
  const e = THREE.MathUtils.degToRad(elevDeg);
  const a = THREE.MathUtils.degToRad(azDeg);
  return out.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
}

// Blend two moods into a plain state object of Colors, Vectors and numbers.
export function blendMoods(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) {
    const va = a[key], vb = b[key];
    if (va.isColor || (typeof va === "string" && va.startsWith("#"))) {
      out[key] = tmpA.set(va).lerp(tmpB.set(vb), t).clone();
    } else if (Array.isArray(va) || va.isVector3) {
      const da = va.isVector3 ? va.clone() : dirFromAngles(va);
      const db = vb.isVector3 ? vb.clone() : dirFromAngles(vb);
      out[key] = da.lerp(db, t).normalize();
    } else if (typeof va === "number") {
      out[key] = va + (vb - va) * t;
    } else {
      out[key] = t < 0.5 ? va : vb;
    }
  }
  return out;
}
