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

// Grown-up anime eye: almond-shaped, a smaller iris, soft shadow on the lid,
// and a winged liner flick at the outer corner.
function openEye(ctx, x, y, side, iris, lips) {
  ellipse(ctx, x + side * 2, y - 10, 15, 7, colorAlpha(lips, 0.22));
  ctx.beginPath();
  ctx.moveTo(x - 15, y + 1);
  ctx.quadraticCurveTo(x - 2, y - 17, x + 15, y - 2);
  ctx.quadraticCurveTo(x + 2, y + 13, x - 15, y + 1);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, y - 12, 0, y + 12);
  g.addColorStop(0, shade(iris, -0.3));
  g.addColorStop(0.6, iris);
  g.addColorStop(1, shade(iris, 0.2));
  ellipse(ctx, x + side, y - 1, 8.5, 11, g);
  ellipse(ctx, x + side, y, 4, 6, shade(iris, -0.4));
  ellipse(ctx, x - 3, y - 5, 3, 3.5, "#ffffff");
  ctx.restore();
  curve(ctx, x - 16, y - 1, x - 2, y - 19, x + 16, y - 3, 4.5);
  curve(ctx, x + side * 15, y - 3, x + side * 19, y - 5, x + side * 23, y - 10, 3.5);
  curve(ctx, x - 9, y + 10, x + 1, y + 13, x + 11, y + 7, 1.3);
}

function colorAlpha(hex, a) {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`;
}

function drawEyes(ctx, kind, iris, lips) {
  for (const side of [-1, 1]) {
    const x = CX + side * 30, y = CY;
    if (kind === "open") openEye(ctx, x, y, side, iris, lips);
    else if (kind === "blink") curve(ctx, x - 14, y + 2, x, y + 8, x + 14, y + 2, 4);
    else if (kind === "happy") curve(ctx, x - 13, y + 5, x, y - 13, x + 13, y + 5, 4.5);
    else if (kind === "sleep") curve(ctx, x - 13, y + 3, x, y + 10, x + 13, y + 3, 3.5);
  }
}

// Lipstick in each resident's own shade.
function drawMouth(ctx, kind, lips) {
  const x = CX, y = CY + 38;
  if (kind === "neutral") {
    ellipse(ctx, x, y - 1, 7, 2.2, lips);
    ellipse(ctx, x, y + 2, 6, 2.6, shade(lips, 0.06));
    curve(ctx, x - 7, y + 0.5, x, y + 1.5, x + 7, y + 0.5, 1.2, shade(lips, -0.25));
  } else if (kind === "talk") {
    ellipse(ctx, x, y + 2, 7, 5.5, lips);
    ellipse(ctx, x, y + 2.5, 4.8, 3.6, "#7a2f3a");
  } else if (kind === "happy") {
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 2);
    ctx.quadraticCurveTo(x, y + 15, x + 11, y - 2);
    ctx.closePath();
    ctx.fillStyle = lips;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.quadraticCurveTo(x, y + 10, x + 8, y);
    ctx.closePath();
    ctx.fillStyle = "#7a2f3a";
    ctx.fill();
  } else if (kind === "wavy") {
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    for (let i = 1; i <= 4; i++) ctx.lineTo(x - 10 + i * 5, y + (i % 2 ? -2.5 : 2.5));
    ctx.lineWidth = 3;
    ctx.strokeStyle = lips;
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

export function faceTextures({ skin, iris, hair, lips }) {
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
    // thin, arched brows
    for (const side of [-1, 1]) {
      const bx = CX + side * 31, by = CY - 26;
      const tilt = e.worried ? 5 : -3;
      curve(ctx, bx - 12, by + (side < 0 ? tilt : -tilt) * 0.5, bx + side * 2, by - 7, bx + 12, by - (side < 0 ? tilt : -tilt) * 0.5, 2, shade(hair, -0.15));
    }
    curve(ctx, CX + 1, CY + 20, CX + 3, CY + 24, CX + 1, CY + 26, 1.5, shade(skin, -0.2));
    drawBlush(ctx, e.blush);
    drawEyes(ctx, e.eyes, iris, lips);
    drawMouth(ctx, e.mouth, lips);
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
