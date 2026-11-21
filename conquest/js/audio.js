// Tiny procedural sound engine (WebAudio, no assets). Every cue is synthesised
// on demand and heavily rate-limited so a busy war never turns into noise.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = new Map();
    this.master = null;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  gate(name, ms) {
    const now = performance.now();
    const at = this.last.get(name) || 0;
    if (now - at < ms) return false;
    this.last.set(name, now);
    return true;
  }

  tone({ freq = 440, to = null, dur = 0.12, type = "square", gain = 0.3, delay = 0, sweep = true }) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to && sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.25, gain = 0.35, lowpass = 1800, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(ctx.currentTime + delay);
  }

  click() {
    if (!this.gate("click", 40)) return;
    this.tone({ freq: 620, to: 520, dur: 0.05, type: "square", gain: 0.12 });
  }

  build() {
    if (!this.gate("build", 90)) return;
    this.tone({ freq: 300, to: 220, dur: 0.08, type: "triangle", gain: 0.2 });
    this.noise({ dur: 0.12, gain: 0.12, lowpass: 900 });
  }

  upgrade() {
    if (!this.gate("up", 120)) return;
    this.tone({ freq: 440, to: 760, dur: 0.14, type: "square", gain: 0.16 });
  }

  attack() {
    if (!this.gate("attack", 140)) return;
    this.tone({ freq: 180, to: 90, dur: 0.18, type: "sawtooth", gain: 0.22 });
    this.noise({ dur: 0.16, gain: 0.18, lowpass: 700 });
  }

  capture() {
    if (!this.gate("capture", 220)) return;
    this.tone({ freq: 330, to: 495, dur: 0.1, type: "square", gain: 0.14 });
    this.tone({ freq: 495, to: 660, dur: 0.12, type: "square", gain: 0.12, delay: 0.07 });
  }

  alarm() {
    if (!this.gate("alarm", 1500)) return;
    this.tone({ freq: 740, to: 420, dur: 0.16, type: "square", gain: 0.16 });
    this.tone({ freq: 740, to: 420, dur: 0.16, type: "square", gain: 0.16, delay: 0.2 });
  }

  launch() {
    if (!this.gate("launch", 200)) return;
    this.noise({ dur: 0.5, gain: 0.22, lowpass: 2400 });
    this.tone({ freq: 200, to: 900, dur: 0.45, type: "sawtooth", gain: 0.1 });
  }

  boom() {
    if (!this.gate("boom", 140)) return;
    this.noise({ dur: 0.55, gain: 0.45, lowpass: 480 });
    this.tone({ freq: 90, to: 40, dur: 0.4, type: "sine", gain: 0.3 });
  }

  nuke() {
    this.noise({ dur: 1.4, gain: 0.55, lowpass: 320 });
    this.tone({ freq: 120, to: 30, dur: 1.2, type: "sine", gain: 0.4 });
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, to: f, dur: 0.22, type: "square", gain: 0.16, delay: i * 0.12, sweep: false })
    );
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) =>
      this.tone({ freq: f, to: f * 0.98, dur: 0.3, type: "triangle", gain: 0.18, delay: i * 0.15 })
    );
  }

  error() {
    if (!this.gate("err", 200)) return;
    this.tone({ freq: 220, to: 160, dur: 0.09, type: "square", gain: 0.12 });
  }
}

export const sfx = new Sfx();
