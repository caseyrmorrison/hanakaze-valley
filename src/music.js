// Generative score: koto-like plucks over a breathing drone, with an occasional
// shakuhachi-style flute. Day uses the bright yo scale, night the minor in scale.

const ROOT = 146.83; // D3
const SCALES = {
  yo: [0, 2, 5, 7, 9],  // D E G A B
  in: [0, 1, 5, 7, 8],  // D Eb G A Bb (miyako-bushi)
};

const hz = (semitones) => ROOT * 2 ** (semitones / 12);

export class Music {
  constructor(ctx, out, reverb, noise) {
    this.ctx = ctx;
    this.out = out;
    this.reverb = reverb;
    this.noise = noise;
    this.night = 0;
    this.degree = 8;
    this.next = ctx.currentTime + 2;
    this.buildDrone();
  }

  send(node, wet) {
    node.connect(this.out);
    const g = this.ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(this.reverb);
  }

  buildDrone() {
    const { ctx } = this;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 500;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain);
    this.send(this.droneGain, 0.8);
    for (const [f, type, level] of [[ROOT / 2, "triangle", 0.5], [ROOT * 0.75, "sine", 0.35], [ROOT * 1.003, "sine", 0.25]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(this.droneFilter);
      o.start();
    }
  }

  update(t) {
    const now = this.ctx.currentTime;
    const breath = 0.5 + 0.5 * Math.sin(t * 0.09);
    this.droneGain.gain.setTargetAtTime(0.05 + 0.05 * breath, now, 1.5);
    this.droneFilter.frequency.setTargetAtTime(320 + 380 * breath - this.night * 120, now, 1.5);
    if (now + 0.25 >= this.next) this.phrase(Math.max(this.next, now + 0.05));
  }

  noteHz(degree, scale) {
    const octave = Math.floor(degree / 5);
    return hz(octave * 12 + scale[((degree % 5) + 5) % 5]);
  }

  phrase(start) {
    const scale = this.night > 0.5 ? SCALES.in : SCALES.yo;
    const step = 0.36 + this.night * 0.22;
    let time = start;

    if (Math.random() < 0.12 + this.night * 0.18) {
      // a long, bending flute line of two or three notes
      const count = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < count; i++) {
        this.walk(1);
        const dur = 1.6 + Math.random() * 1.4;
        this.flute(this.noteHz(this.degree, scale), time, dur);
        time += dur + 0.15;
      }
    } else {
      const count = 1 + Math.floor(Math.random() * 5);
      for (let i = 0; i < count; i++) {
        this.walk(2);
        const f = this.noteHz(this.degree, scale);
        this.pluck(f, time, 0.55 + Math.random() * 0.35);
        if (Math.random() < 0.18) this.pluck(f / 2, time + 0.02, 0.4);
        time += step * (Math.random() < 0.3 ? 2 : 1);
      }
    }
    this.next = time + 2 + Math.random() * 4 + this.night * 2.5;
  }

  walk(maxStep) {
    const move = Math.round((Math.random() * 2 - 1) * maxStep);
    this.degree = Math.min(14, Math.max(5, this.degree + move));
  }

  // Koto-ish pluck: bright attack with a tiny downward pitch settle, fast-closing filter.
  pluck(freq, time, vel) {
    const { ctx } = this;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 9, time);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.8, time + 0.7);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(vel * 0.2, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
    filter.connect(env);
    this.send(env, 0.45);

    for (const [ratio, type, level] of [[1, "triangle", 1], [2.003, "sine", 0.35], [3.01, "sine", 0.12]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * ratio * 1.012, time);
      o.frequency.exponentialRampToValueAtTime(freq * ratio, time + 0.06);
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g).connect(filter);
      o.start(time);
      o.stop(time + 2.5);
    }
  }

  // Breathy flute: slides up into the note, vibrato blooms late, noise for breath.
  flute(freq, time, dur) {
    const { ctx } = this;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.07, time + 0.35);
    env.gain.setValueAtTime(0.07, time + dur - 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    tone.connect(env);
    this.send(env, 0.7);

    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq * 0.96, time);
    o.frequency.exponentialRampToValueAtTime(freq, time + 0.3);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, time);
    vibDepth.gain.linearRampToValueAtTime(freq * 0.008, time + dur * 0.7);
    vib.connect(vibDepth).connect(o.frequency);
    o.connect(tone);

    const breath = ctx.createBufferSource();
    breath.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = freq * 2;
    band.Q.value = 2;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.25;
    breath.connect(band).connect(breathGain).connect(tone);

    for (const node of [o, vib, breath]) {
      node.start(time);
      node.stop(time + dur + 0.05);
    }
  }

  // Quick rising arpeggio, used when the time of day changes.
  flourish() {
    const scale = this.night > 0.5 ? SCALES.in : SCALES.yo;
    const t = this.ctx.currentTime + 0.02;
    [7, 8, 9, 10, 12].forEach((d, i) => this.pluck(this.noteHz(d, scale), t + i * 0.09, 0.5));
    this.next = Math.max(this.next, t + 2.5);
  }
}
