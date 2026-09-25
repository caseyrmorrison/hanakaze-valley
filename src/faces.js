import * as THREE from "three";

// Faces are painted onto the head sphere's equirectangular texture.
// u = 0.25 is the front of a SphereGeometry, so the face is centered at x = 128.
const W = 512, H = 256;
const CX = 128, CY = 134;
const FEATURE_SCALE = 1.25;
const INK = "#2a1d33";

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function shade(hex, amount) {
  return "#" + new THREE.Color(hex).offsetHSL(0, 0, amount).getHexString();
}

function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function curve(ctx, x0, y0, cx, cy, x1, y1, width, color = INK) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.stroke();
}

// Big anime eye: tall iris with a gradient, two highlights and a heavy upper lash.
function openEye(ctx, x, y, side, iris) {
  ellipse(ctx, x, y, 13, 17, "#ffffff");
  const g = ctx.createLinearGradient(0, y - 16, 0, y + 16);
  g.addColorStop(0, shade(iris, -0.3));
  g.addColorStop(0.55, iris);
  g.addColorStop(1, shade(iris, 0.25));
  ellipse(ctx, x + side, y + 1, 10, 15, g);
  ellipse(ctx, x + side, y + 2, 5, 8, shade(iris, -0.4));
  ellipse(ctx, x - 4, y - 6, 4.5, 5, "#ffffff");
  ellipse(ctx, x + 4, y + 7, 2, 2, "#ffffff");
  curve(ctx, x - 15, y - 9, x, y - 25, x + 15, y - 11, 5);
  curve(ctx, x + side * 13, y - 11, x + side * 17, y - 10, x + side * 20, y - 5, 3.5);
  curve(ctx, x - 8, y + 17, x, y + 19, x + 8, y + 16, 1.5);
}

function drawEyes(ctx, kind, iris) {
  for (const side of [-1, 1]) {
    const x = CX + side * 30, y = CY;
    if (kind === "open") openEye(ctx, x, y, side, iris);
    else if (kind === "blink") curve(ctx, x - 14, y + 2, x, y + 8, x + 14, y + 2, 4);
    else if (kind === "happy") curve(ctx, x - 13, y + 5, x, y - 13, x + 13, y + 5, 4.5);
    else if (kind === "sleep") curve(ctx, x - 13, y + 3, x, y + 10, x + 13, y + 3, 3.5);
  }
}

function drawMouth(ctx, kind) {
  const x = CX, y = CY + 40;
  if (kind === "neutral") {
    curve(ctx, x - 6, y, x, y + 2.5, x + 6, y, 2.5, "#8a4b4b");
  } else if (kind === "talk") {
    ellipse(ctx, x, y + 2, 6.5, 5.5, "#9c3d3d");
    ellipse(ctx, x, y + 5, 3.5, 2.2, "#e7777b");
  } else if (kind === "happy") {
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 2);
    ctx.quadraticCurveTo(x, y + 16, x + 10, y - 2);
    ctx.closePath();
    ctx.fillStyle = "#9c3d3d";
    ctx.fill();
    ellipse(ctx, x, y + 6, 4, 2.5, "#e7777b");
  } else if (kind === "wavy") {
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    for (let i = 1; i <= 4; i++) ctx.lineTo(x - 10 + i * 5, y + (i % 2 ? -2.5 : 2.5));
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#8a4b4b";
    ctx.lineJoin = "round";
    ctx.stroke();
  }
}

function drawBlush(ctx, level) {
  if (!level) return;
  for (const side of [-1, 1]) {
    const x = CX + side * 38, y = CY + 25;
    ellipse(ctx, x, y, 13, 6, `rgba(255, 110, 140, ${0.25 + level * 0.15})`);
    if (level > 1) {
      for (let i = -1; i <= 1; i++) curve(ctx, x + i * 7 - 3, y + 4, x + i * 7, y, x + i * 7 + 3, y - 4, 1.5, "#e0506e");
    }
  }
}

const EXPRESSIONS = {
  neutral: { eyes: "open", mouth: "neutral" },
  blink: { eyes: "blink", mouth: "neutral" },
  talk: { eyes: "open", mouth: "talk" },
  happy: { eyes: "happy", mouth: "happy", blush: 1 },
  flustered: { eyes: "open", mouth: "wavy", blush: 2, worried: true },
  sleep: { eyes: "sleep", mouth: "neutral", blush: 0.5 },
};

export function faceTextures({ skin, iris, hair }) {
  const out = {};
  for (const [name, e] of Object.entries(EXPRESSIONS)) {
    const c = makeCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = skin;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(CX, CY);
    ctx.scale(FEATURE_SCALE, FEATURE_SCALE);
    ctx.translate(-CX, -CY);
    for (const side of [-1, 1]) {
      const bx = CX + side * 30, by = CY - 30;
      const tilt = e.worried ? 5 : -2;
      curve(ctx, bx - 11, by + (side < 0 ? tilt : -tilt) * 0.5, bx, by - 4, bx + 11, by - (side < 0 ? tilt : -tilt) * 0.5, 2.5, shade(hair, -0.15));
    }
    curve(ctx, CX + 1, CY + 22, CX + 3, CY + 25, CX + 1, CY + 27, 1.5, shade(skin, -0.2));
    drawBlush(ctx, e.blush);
    drawEyes(ctx, e.eyes, iris);
    drawMouth(ctx, e.mouth);
    ctx.restore();
    out[name] = toTexture(c);
  }
  return out;
}

// ---------- manga symbols that pop above heads ----------
function emoteCanvas(draw) {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext("2d");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  draw(ctx);
  return toTexture(c);
}

function glyph(ctx, text, fill, size = 96) {
  ctx.font = `bold ${size}px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, 64, 68);
  ctx.fillStyle = fill;
  ctx.fillText(text, 64, 68);
}

export function emoteTextures() {
  return {
    "!": emoteCanvas((ctx) => {
      for (const a of [-0.9, -0.45, 0.45, 0.9]) {
        ctx.beginPath();
        ctx.moveTo(64 + Math.sin(a) * 40, 64 - Math.cos(a) * 40);
        ctx.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58);
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      glyph(ctx, "!", "#ffe14d");
    }),
    "♪": emoteCanvas((ctx) => glyph(ctx, "♪", "#ff7fb0")),
    zzz: emoteCanvas((ctx) => {
      glyph(ctx, "z", "#9cc4ff", 44);
      ctx.translate(26, -30);
      glyph(ctx, "Z", "#9cc4ff", 60);
    }),
    sweat: emoteCanvas((ctx) => {
      ctx.beginPath();
      ctx.moveTo(64, 18);
      ctx.bezierCurveTo(90, 56, 98, 76, 84, 96);
      ctx.bezierCurveTo(72, 112, 50, 110, 42, 94);
      ctx.bezierCurveTo(32, 74, 44, 52, 64, 18);
      ctx.fillStyle = "#a6dcff";
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ellipse(ctx, 56, 84, 6, 10, "#ffffff");
    }),
    anger: emoteCanvas((ctx) => {
      ctx.lineWidth = 12;
      ctx.strokeStyle = "#e8344a";
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(64 + sx * 12, 64 + sy * 44);
        ctx.quadraticCurveTo(64 + sx * 12, 64 + sy * 12, 64 + sx * 44, 64 + sy * 12);
        ctx.stroke();
      }
    }),
    heart: emoteCanvas((ctx) => {
      ctx.beginPath();
      ctx.moveTo(64, 104);
      ctx.bezierCurveTo(10, 66, 22, 18, 64, 42);
      ctx.bezierCurveTo(106, 18, 118, 66, 64, 104);
      ctx.fillStyle = "#ff5c8a";
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ellipse(ctx, 44, 52, 8, 5, "rgba(255,255,255,0.8)");
    }),
    sparkle: emoteCanvas((ctx) => {
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
      g.addColorStop(0, "rgba(255,255,240,1)");
      g.addColorStop(0.25, "rgba(255,240,180,0.9)");
      g.addColorStop(1, "rgba(255,220,150,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(64, 2);
      ctx.quadraticCurveTo(70, 58, 126, 64);
      ctx.quadraticCurveTo(70, 70, 64, 126);
      ctx.quadraticCurveTo(58, 70, 2, 64);
      ctx.quadraticCurveTo(58, 58, 64, 2);
      ctx.fill();
    }),
  };
}
