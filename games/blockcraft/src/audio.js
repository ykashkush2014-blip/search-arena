// Tiny WebAudio SFX synth — no external audio files.
let ctx = null;
let master = null;
let muted = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ensure();
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.35;
}

export function isMuted() {
  return muted;
}

function tone({ freq = 220, type = 'square', dur = 0.08, gain = 0.2, slideTo = null, delay = 0 }) {
  const ac = ensure();
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.12, gain = 0.18, filterFreq = 1200, delay = 0 }) {
  const ac = ensure();
  if (!ac || muted) return;
  const t0 = ac.currentTime + delay;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  breakBlock(kind = 'dirt') {
    const base = kind === 'stone' || kind === 'cobble' ? 180 : kind === 'wood' ? 260 : 130;
    noise({ dur: 0.16, gain: 0.22, filterFreq: base * 6 });
    tone({ freq: base, type: 'triangle', dur: 0.1, gain: 0.1, slideTo: base * 0.6 });
  },
  placeBlock() {
    tone({ freq: 300, type: 'square', dur: 0.07, gain: 0.1, slideTo: 200 });
    noise({ dur: 0.06, gain: 0.1, filterFreq: 900 });
  },
  jump() {
    tone({ freq: 420, type: 'sine', dur: 0.1, gain: 0.08, slideTo: 620 });
  },
  land() {
    noise({ dur: 0.1, gain: 0.16, filterFreq: 500 });
  },
  splash() {
    noise({ dur: 0.28, gain: 0.2, filterFreq: 2400 });
  },
  pickup() {
    tone({ freq: 660, type: 'square', dur: 0.07, gain: 0.1 });
    tone({ freq: 990, type: 'square', dur: 0.09, gain: 0.09, delay: 0.07 });
  },
  hurt() {
    tone({ freq: 220, type: 'sawtooth', dur: 0.24, gain: 0.16, slideTo: 90 });
  },
  ui() {
    tone({ freq: 520, type: 'sine', dur: 0.05, gain: 0.07 });
  },
  craft() {
    tone({ freq: 440, type: 'triangle', dur: 0.08, gain: 0.1 });
    tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.1, delay: 0.08 });
    tone({ freq: 880, type: 'triangle', dur: 0.12, gain: 0.09, delay: 0.16 });
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'square', dur: 0.18, gain: 0.12, delay: i * 0.12 }));
  },
  night() {
    tone({ freq: 300, type: 'sine', dur: 0.8, gain: 0.1, slideTo: 120 });
  },
};
