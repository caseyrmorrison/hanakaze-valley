import { WORLD, riverInfo } from "./terrain.js";
import { Music } from "./music.js";

const MUTE_KEY = "hanakaze-muted";
const LEVEL = 1.8;

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

function writeMuted(v) {
  try { localStorage.setItem(MUTE_KEY, v ? "1" : "0"); } catch { /* storage unavailable */ }
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Synthetic hall reverb: decaying stereo noise.
function impulse(ctx, seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

const rand = (a, b) => a + Math.random() * (b - a);

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
    this.night = 0;
    this.timers = { bird: 3, warbler: 20, frog: 2, chime: 4 };
  }

  get running() {
    return this.ctx?.state === "running";
  }

  // Must be called from a user gesture (browsers block audio until then).
  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 3.5, 2.6);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.master);

    const bus = (level) => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(this.master);
      return g;
    };
    this.musicBus = bus(0.55);
    this.ambBus = bus(1.1);
    this.sfxBus = bus(0.9);
    this.noise = noiseBuffer(ctx, 3);

    this.wind = this.loop(this.ambBus, "bandpass", 500, 0.6);
    this.water = this.loop(this.ambBus, "lowpass", 450, 0.5);
    this.crickets = [this.cricket(4300, 1.3, 31, -0.6), this.cricket(4750, 0.9, 24, 0.5)];
    this.falls = this.loop(this.ambBus, "lowpass", 1600, 0.3);
    this.rumble = this.loop(this.sfxBus, "lowpass", 160, 0.9);
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.bellState = { active: false, next: 0, high: true };
    this.music = new Music(ctx, this.musicBus, this.reverb, this.noise);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) ctx.suspend();
      else if (!this.muted) ctx.resume();
    });

    this.master.gain.setTargetAtTime(this.muted ? 0 : LEVEL, ctx.currentTime, 1.2);
    if (this.muted) ctx.suspend();
  }

  toggle() {
    this.muted = !this.muted;
    writeMuted(this.muted);
    if (!this.ctx) return this.muted;
    if (this.muted) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => this.muted && this.ctx.suspend(), 300);
    } else {
      this.ctx.resume();
      this.master.gain.setTargetAtTime(LEVEL, this.ctx.currentTime, 0.3);
    }
    return this.muted;
  }

  // ---------- building blocks ----------
  wet(node, amount) {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g).connect(this.reverb);
  }

  loop(out, type, freq, q) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(out);
    src.start();
    return { filter, gain };
  }

  // A cricket: a high tone pulsed fast, gated into chirps by a slower square wave.
  cricket(freq, chirpRate, pulseRate, pan) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const pulse = ctx.createGain();
    const chirp = ctx.createGain();
    const level = ctx.createGain();
    pulse.gain.value = 0.5;
    chirp.gain.value = 0.5;
    level.gain.value = 0;
    for (const [target, rate] of [[pulse, pulseRate], [chirp, chirpRate]]) {
      const lfo = ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = rate;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(target.gain);
      lfo.start();
    }
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    o.connect(pulse).connect(chirp).connect(level).connect(panner).connect(this.ambBus);
    o.start();
    return level;
  }

  noiseHit(t, { dur, type = "bandpass", freq, q = 1, gain, attack = 0.004, out = this.sfxBus, pan = 0 }) {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(filter).connect(env).connect(panner).connect(out);
    src.start(t, rand(0, 2.5), dur + 0.05);
    return { filter, env };
  }

  tone(t, { freq, to = freq, dur, type = "sine", gain, attack = 0.005, out = this.sfxBus, pan = 0, wet = 0 }) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    o.connect(env).connect(panner).connect(out);
    if (wet) this.wet(panner, wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Inharmonic partials make a metal bell.
  bell(t, freq, { gain = 0.1, decay = 2.5, pan = 0, partials = [1, 2.76, 5.4, 8.93], out = this.ambBus, wet = 0.6 } = {}) {
    partials.forEach((p, i) => {
      if (freq * p > 16000) return;
      this.tone(t, { freq: freq * p, dur: decay / (1 + i * 0.6), gain: gain / (1 + i * 1.5), attack: 0.002, out, pan, wet });
    });
  }

  // ---------- nature ----------
  birdCall(t, pan, level) {
    const notes = 2 + Math.floor(rand(0, 5));
    const base = rand(2400, 3800);
    for (let i = 0; i < notes; i++) {
      const f = base * rand(0.85, 1.25);
      this.tone(t, { freq: f, to: f * rand(1.15, 1.6), dur: rand(0.05, 0.12), gain: 0.05 * level, out: this.ambBus, pan, wet: 0.3 });
      t += rand(0.08, 0.16);
    }
  }

  // The uguisu (bush warbler): a long rising whistle, then "ho-ke-kyo".
  warbler(t, pan, level) {
    this.tone(t, { freq: 1150, to: 1300, dur: 1.1, gain: 0.05 * level, attack: 0.25, out: this.ambBus, pan, wet: 0.4 });
    const tail = [[2300, 2900, 0.12], [2700, 1900, 0.14], [2100, 3300, 0.35]];
    let at = t + 1.25;
    for (const [f, to, d] of tail) {
      this.tone(at, { freq: f, to, dur: d, gain: 0.05 * level, out: this.ambBus, pan, wet: 0.4 });
      at += d + 0.04;
    }
  }

  frog(t, pan, level) {
    const croaks = 2 + Math.floor(rand(0, 3));
    const f = rand(150, 230);
    for (let i = 0; i < croaks; i++) {
      for (let p = 0; p < 4; p++) {
        this.tone(t + p * 0.03, { freq: f, to: f * 0.9, dur: 0.028, type: "sawtooth", gain: 0.05 * level, out: this.ambBus, pan });
      }
      t += rand(0.25, 0.4);
    }
  }

  // ---------- events from the game ----------
  step(surface, running) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const v = running ? 1.25 : 1;
    const pan = rand(-0.15, 0.15);
    if (surface === "grass") {
      this.noiseHit(t, { dur: 0.13, type: "highpass", freq: 2200, gain: 0.11 * v, attack: 0.02, pan });
    } else if (surface === "dirt") {
      this.noiseHit(t, { dur: 0.09, freq: rand(700, 1000), q: 1.4, gain: 0.16 * v, pan });
      this.tone(t, { freq: 110, to: 70, dur: 0.06, gain: 0.06 * v });
    } else if (surface === "wood") {
      this.tone(t, { freq: rand(170, 200), to: 95, dur: 0.14, gain: 0.2 * v, wet: 0.2 });
      this.noiseHit(t, { dur: 0.03, freq: 2600, q: 2, gain: 0.06 * v, pan });
    } else {
      this.noiseHit(t, { dur: 0.3, freq: rand(1100, 1600), q: 0.8, gain: 0.12 * v, attack: 0.025, pan });
    }
  }

  jump() {
    if (!this.running) return;
    const { filter } = this.noiseHit(this.ctx.currentTime, { dur: 0.3, freq: 400, q: 1.5, gain: 0.05, attack: 0.08 });
    filter.frequency.exponentialRampToValueAtTime(1400, this.ctx.currentTime + 0.25);
  }

  land(impact, surface) {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, impact / 9);
    this.tone(t, { freq: 120, to: 48, dur: 0.2, gain: 0.3 * v });
    this.step(surface, true);
  }

  chime() {
    if (this.running) this.music.flourish();
  }

  // A soft syllable for dialogue; each resident has her own pitch.
  blip(freq) {
    if (!this.running) return;
    const f = freq * (1 + (Math.random() - 0.5) * 0.12);
    this.tone(this.ctx.currentTime, { freq: f, to: f * 1.08, dur: 0.07, type: "triangle", gain: 0.07, attack: 0.008 });
  }

  // The little "pop" when a manga symbol appears over someone's head.
  pop() {
    if (!this.running) return;
    this.tone(this.ctx.currentTime, { freq: 520, to: 1100, dur: 0.12, gain: 0.08, wet: 0.2 });
  }

  // Kira-kira: a quick run of tiny bells.
  sparkle() {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    [0, 1, 2, 3].forEach((i) => this.bell(t + i * 0.06, 2400 + i * 420, { gain: 0.03, decay: 0.8, partials: [1, 2.76], out: this.sfxBus, wet: 0.5 }));
  }

  // Arrival at the shrine: a jingle of suzu bells, then a deep temple bell.
  shrine() {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      this.bell(t + i * rand(0.04, 0.09), rand(3200, 4600), { gain: 0.035, decay: 0.5, pan: rand(-0.4, 0.4), out: this.sfxBus });
    }
    this.bell(t + 1.1, 98, { gain: 0.35, decay: 7, partials: [1, 2, 2.76, 3.9, 5.2], out: this.sfxBus, wet: 0.9 });
  }

  // ---------- sounds placed in the world ----------

  // Loudness falls off with distance; pan follows where the source is relative to where you face.
  spatial(x, y, z, ref = 10) {
    const L = this.listener;
    const dx = x - L.x, dz = z - L.z;
    const d = Math.hypot(dx, (y - L.y) * 0.6, dz);
    const rightX = Math.cos(L.yaw), rightZ = -Math.sin(L.yaw);
    const pan = d > 0.5 ? ((dx * rightX + dz * rightZ) / Math.hypot(dx, dz)) * 0.75 : 0;
    return { gain: Math.min(1, ref / Math.max(ref, d)), pan: Math.max(-1, Math.min(1, pan || 0)), d };
  }

  // A two-tone train horn, a little late if it's far away.
  horn(x, z) {
    if (!this.running) return;
    const sp = this.spatial(x, 10, z, 30);
    if (sp.gain < 0.03) return;
    const t = this.ctx.currentTime + sp.d / 343;
    for (const f of [370, 466]) {
      this.tone(t, { freq: f, to: f * 0.99, dur: 1.3, type: "sawtooth", gain: 0.05 * sp.gain, attack: 0.08, pan: sp.pan, wet: 0.5 });
    }
  }

  clack(x, z) {
    if (!this.running) return;
    const sp = this.spatial(x, 9, z, 14);
    if (sp.gain < 0.05) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, { dur: 0.06, freq: 1900, q: 1.5, gain: 0.18 * sp.gain, pan: sp.pan });
    this.noiseHit(t + 0.11, { dur: 0.06, freq: 1700, q: 1.5, gain: 0.14 * sp.gain, pan: sp.pan });
  }

  // Rumble while the train moves; `x` is the train's position along the line.
  trainRumble(x, z, speed, visible) {
    if (!this.running) return;
    const sp = this.spatial(x, 9, z, 20);
    const level = visible ? sp.gain * Math.min(1, speed / 10) * 0.35 : 0;
    this.rumble.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
  }

  // Kan-kan-kan: the level crossing bell, alternating two pitches.
  crossingBell(active, x, z) {
    if (!this.running) return;
    this.bellState.active = active;
    if (!active) return;
    const now = this.ctx.currentTime;
    if (now < this.bellState.next) return;
    this.bellState.next = now + 0.42;
    this.bellState.high = !this.bellState.high;
    const sp = this.spatial(x, 3, z, 12);
    if (sp.gain < 0.03) return;
    this.bell(now, this.bellState.high ? 740 : 620, { gain: 0.09 * sp.gain, decay: 0.5, partials: [1, 2.4, 4.1], out: this.sfxBus, pan: sp.pan, wet: 0.2 });
  }

  // The little melody a Japanese station plays as the train departs.
  stationChime(x, z) {
    if (!this.running) return;
    const sp = this.spatial(x, 9, z, 25);
    if (sp.gain < 0.05) return;
    const t = this.ctx.currentTime;
    [659, 784, 1047, 988, 784, 880, 1175, 1047].forEach((f, i) => {
      this.bell(t + i * 0.22, f, { gain: 0.07 * sp.gain, decay: 0.9, partials: [1, 2, 3.01], out: this.sfxBus, pan: sp.pan, wet: 0.4 });
    });
  }

  fireworkLaunch(x, y, z) {
    if (!this.running) return;
    const sp = this.spatial(x, y, z, 30);
    this.tone(this.ctx.currentTime, { freq: 600, to: 1500, dur: 1.6, gain: 0.025 * sp.gain, attack: 0.1, pan: sp.pan, out: this.sfxBus });
  }

  // Light arrives at once; the boom follows at the speed of sound.
  fireworkBoom(x, y, z, type) {
    if (!this.running) return;
    const sp = this.spatial(x, y, z, 40);
    const t = this.ctx.currentTime + sp.d / 343;
    this.tone(t, { freq: 70, to: 32, dur: 1.1, gain: 0.5 * sp.gain, attack: 0.01, pan: sp.pan, wet: 0.6 });
    this.noiseHit(t, { dur: 1.2, type: "lowpass", freq: 700, gain: 0.35 * sp.gain, attack: 0.01, pan: sp.pan });
    if (type === "crackle" || type === "willow") {
      for (let i = 0; i < 22; i++) {
        this.noiseHit(t + 0.9 + Math.random() * 1.4, { dur: 0.03, freq: 3000 + Math.random() * 2000, q: 2, gain: 0.07 * sp.gain, pan: sp.pan + (Math.random() - 0.5) * 0.3 });
      }
    }
  }

  meow(x, z) {
    if (!this.running) return;
    const sp = this.spatial(x, 0.3, z, 4);
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(520, t);
    o.frequency.linearRampToValueAtTime(760, t + 0.18);
    o.frequency.linearRampToValueAtTime(470, t + 0.55);
    const f1 = this.ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.setValueAtTime(900, t);
    f1.frequency.linearRampToValueAtTime(1400, t + 0.2);
    f1.frequency.linearRampToValueAtTime(700, t + 0.55);
    f1.Q.value = 3;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.12 * sp.gain, t + 0.06);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = sp.pan;
    o.connect(f1).connect(env).connect(pan).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.65);
  }

  purr() {
    if (!this.running) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 260;
    const am = this.ctx.createGain();
    am.gain.value = 0.5;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 26;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5, t + 0.3);
    env.gain.setValueAtTime(0.5, t + 2.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    src.connect(f).connect(am).connect(env).connect(this.sfxBus);
    for (const n of [src, lfo]) {
      n.start(t);
      n.stop(t + 2.9);
    }
  }

  // ---------- per frame ----------
  setMood(state) {
    this.night = state.night;
    if (this.music) this.music.night = state.night;
  }

  update(dt, t, pos, yaw = 0) {
    if (!this.running) return;
    const now = this.ctx.currentTime;
    const { lake, village } = WORLD;
    const day = 1 - this.night;

    // wind: slow gusts, stronger up high
    const gust = 0.55 + 0.45 * Math.sin(t * 0.21) * Math.sin(t * 0.083 + 1.3);
    const altitude = Math.min(1, Math.max(0, (pos.y - 4) / 20));
    this.wind.gain.gain.setTargetAtTime((0.16 + 0.2 * altitude) * gust, now, 0.4);
    this.wind.filter.frequency.setTargetAtTime(380 + 520 * gust, now, 0.4);

    // lapping water near the lake
    Object.assign(this.listener, { x: pos.x, y: pos.y + 1.6, z: pos.z, yaw });

    // the falls roar close up; the river murmurs along its banks
    const fl = WORLD.falls;
    const fallsNear = this.spatial(fl.x, fl.pool + 8, fl.z, 14).gain;
    const riverNear = Math.max(0, 1 - Math.max(0, riverInfo(pos.x, pos.z).d - 4) / 30);
    this.falls.gain.gain.setTargetAtTime(Math.max(fallsNear * 0.55, riverNear * 0.12), now, 0.3);
    this.falls.filter.frequency.setTargetAtTime(700 + fallsNear * 1400, now, 0.3);

    const lakeDist = Math.hypot(pos.x - lake.x, pos.z - lake.z);
    const nearLake = Math.max(0, 1 - Math.max(0, lakeDist - lake.r * 0.7) / 30);
    this.water.gain.gain.setTargetAtTime(nearLake * (0.1 + 0.05 * Math.sin(t * 1.3)), now, 0.3);

    const nightLevel = Math.max(0, (this.night - 0.3) / 0.7);
    this.crickets.forEach((c, i) => c.gain.setTargetAtTime(nightLevel * (0.012 + i * 0.004), now, 1));

    const villageDist = Math.hypot(pos.x - village.x, pos.z - village.z);
    const nearVillage = Math.max(0, 1 - Math.max(0, villageDist - 15) / 40);

    const due = (key, lo, hi) => {
      this.timers[key] -= dt;
      if (this.timers[key] > 0) return false;
      this.timers[key] = rand(lo, hi);
      return true;
    };
    if (due("bird", 1.5, 6) && day > 0.3) this.birdCall(now + 0.05, rand(-0.9, 0.9), day * rand(0.4, 1));
    if (due("warbler", 35, 80) && day > 0.6) this.warbler(now + 0.05, rand(-0.7, 0.7), day);
    if (due("frog", 1.5, 5) && this.night > 0.4 && nearLake > 0) this.frog(now + 0.05, rand(-0.8, 0.8), nearLake * this.night);
    if (due("chime", 2, 7) && nearVillage > 0 && gust > 0.55) {
      this.bell(now + 0.05, rand(1900, 2700), { gain: 0.05 * nearVillage, decay: 2.8, pan: rand(-0.5, 0.5) });
    }

    this.music.update(t);
  }
}
