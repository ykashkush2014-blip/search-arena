/**
 * audio.js — procedural chiptune audio on the Web Audio API.
 *
 * Zero audio assets: every sound effect and music pattern is synthesized from
 * oscillators and noise buffers generated in code. On weak devices this costs
 * almost no memory, downloads nothing, and we cap the number of live voices.
 */

const NOTE_FREQ = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5,
};

export class AudioEngine {
  /**
   * @param {object} [opts] { maxVoices, masterVolume, musicVolume, sfxVolume }
   */
  constructor(opts = {}) {
    this.maxVoices = opts.maxVoices ?? 8;
    this.masterVolume = opts.masterVolume ?? 0.7;
    this.musicVolume = opts.musicVolume ?? 0.45;
    this.sfxVolume = opts.sfxVolume ?? 0.8;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.unlocked = false;
    this.voices = 0;
    this.enabled = true;
    this._musicTimer = null;
    this._musicStep = 0;
    this._currentTrack = null;
    this._noiseBuffer = null;
    this._duckUntil = 0;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.unlocked) return true;
    try {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVolume;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVolume;
      this.sfxBus.connect(this.master);
      this._noiseBuffer = this._makeNoise(1);
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    } catch (err) {
      this.enabled = false;
      return false;
    }
  }

  _makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buffer = this.ctx.createBuffer(1, len, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMasterVolume(v) {
    this.masterVolume = v;
    if (this.master) this.master.gain.value = v;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicBus) this.musicBus.gain.value = v;
  }

  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.sfxBus) this.sfxBus.gain.value = v;
  }

  /** Momentarily duck music (boss roar, level transition). */
  duck(seconds = 0.6, amount = 0.35) {
    if (!this.musicBus || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicVolume * amount, t);
    this.musicBus.gain.linearRampToValueAtTime(this.musicVolume, t + seconds);
    this._duckUntil = t + seconds;
  }

  // --------------------------------------------------------------- voices

  _canPlay() {
    return this.enabled && this.unlocked && this.ctx && this.voices < this.maxVoices;
  }

  /**
   * Core tone: a single oscillator with envelope. Returns duration in seconds.
   */
  tone(opts = {}) {
    if (!this._canPlay()) return 0;
    const {
      freq = 440,
      endFreq = null,
      type = 'square',
      attack = 0.005,
      decay = 0.08,
      sustain = 0,
      release = 0.05,
      volume = 0.5,
      when = 0,
      bus = 'sfx',
      detune = 0,
    } = opts;
    try {
      const t0 = this.ctx.currentTime + when;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + decay + release);
      }
      if (detune) osc.detune.value = detune;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(volume, t0 + attack);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustain), t0 + attack + decay);
      if (sustain > 0) {
        gain.gain.setValueAtTime(sustain, t0 + attack + decay);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + release);
      osc.connect(gain);
      gain.connect(bus === 'music' ? this.musicBus : this.sfxBus);
      this.voices += 1;
      osc.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(t0);
      osc.stop(t0 + attack + decay + release + 0.02);
      return attack + decay + release;
    } catch (err) {
      return 0;
    }
  }

  /** Short noise burst — impacts, sand, explosions. */
  noise(opts = {}) {
    if (!this._canPlay() || !this._noiseBuffer) return 0;
    const {
      duration = 0.12,
      filterFreq = 1200,
      filterType = 'bandpass',
      volume = 0.5,
      when = 0,
      bus = 'sfx',
    } = opts;
    try {
      const t0 = this.ctx.currentTime + when;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = filterFreq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(bus === 'music' ? this.musicBus : this.sfxBus);
      this.voices += 1;
      src.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      src.start(t0);
      src.stop(t0 + duration + 0.02);
      return duration;
    } catch (err) {
      return 0;
    }
  }

  // ------------------------------------------------------------- sfx names

  play(name, opts = {}) {
    if (!this.enabled) return;
    const sfx = SFX[name];
    if (!sfx) return;
    sfx(this, opts);
  }

  // ----------------------------------------------------------------- music

  /**
   * Start a named pattern. Patterns are tiny step-sequencer arrays:
   * [stepBeats, noteName|null, waveform] — looped at the given BPM.
   */
  playMusic(trackName) {
    if (!this.enabled || !this.unlocked) {
      this._currentTrack = trackName;
      return;
    }
    if (this._currentTrack === trackName && this._musicTimer) return;
    this.stopMusic();
    const track = MUSIC[trackName];
    if (!track) return;
    this._currentTrack = trackName;
    this._musicStep = 0;
    const stepSeconds = 60 / track.bpm / 2; // eighth notes
    const tick = () => {
      if (!this._currentTrack || this._currentTrack !== trackName) return;
      const step = track.bass[this._musicStep % track.bass.length];
      if (step) {
        this.tone({
          freq: NOTE_FREQ[step] || 220,
          type: 'triangle',
          attack: 0.01,
          decay: stepSeconds * 0.7,
          release: 0.02,
          volume: 0.22,
          bus: 'music',
        });
      }
      const lead = track.lead[this._musicStep % track.lead.length];
      if (lead) {
        this.tone({
          freq: NOTE_FREQ[lead] || 440,
          type: track.wave || 'square',
          attack: 0.005,
          decay: stepSeconds * 0.5,
          release: 0.03,
          volume: 0.1,
          bus: 'music',
        });
      }
      if (this._musicStep % 4 === 0) {
        this.noise({ duration: 0.03, filterFreq: 6000, filterType: 'highpass', volume: 0.03, bus: 'music' });
      }
      this._musicStep += 1;
    };
    tick();
    this._musicTimer = setInterval(tick, stepSeconds * 1000);
  }

  stopMusic() {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    this._currentTrack = null;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}

// ------------------------------------------------------------- sfx recipes

export const SFX = {
  uiMove(a) {
    a.tone({ freq: 620, type: 'square', decay: 0.04, release: 0.02, volume: 0.18 });
  },
  uiConfirm(a) {
    a.tone({ freq: 520, type: 'square', decay: 0.05, release: 0.03, volume: 0.22 });
    a.tone({ freq: 780, type: 'square', decay: 0.07, release: 0.03, volume: 0.2, when: 0.05 });
  },
  uiCancel(a) {
    a.tone({ freq: 320, endFreq: 180, type: 'square', decay: 0.09, release: 0.04, volume: 0.2 });
  },
  attack(a) {
    a.noise({ duration: 0.07, filterFreq: 2200, volume: 0.3 });
    a.tone({ freq: 340, endFreq: 120, type: 'sawtooth', decay: 0.08, release: 0.03, volume: 0.25 });
  },
  hit(a) {
    a.noise({ duration: 0.08, filterFreq: 900, volume: 0.35 });
    a.tone({ freq: 200, endFreq: 90, type: 'square', decay: 0.07, release: 0.03, volume: 0.28 });
  },
  hurt(a) {
    a.tone({ freq: 220, endFreq: 110, type: 'sawtooth', decay: 0.14, release: 0.06, volume: 0.32 });
    a.noise({ duration: 0.1, filterFreq: 500, volume: 0.22 });
  },
  dash(a) {
    a.noise({ duration: 0.12, filterFreq: 3200, filterType: 'highpass', volume: 0.18 });
    a.tone({ freq: 520, endFreq: 880, type: 'triangle', decay: 0.1, release: 0.04, volume: 0.16 });
  },
  coin(a) {
    a.tone({ freq: 988, type: 'square', decay: 0.05, release: 0.02, volume: 0.16 });
    a.tone({ freq: 1319, type: 'square', decay: 0.09, release: 0.04, volume: 0.16, when: 0.05 });
  },
  pickup(a) {
    a.tone({ freq: 660, type: 'triangle', decay: 0.05, release: 0.03, volume: 0.22 });
    a.tone({ freq: 880, type: 'triangle', decay: 0.08, release: 0.05, volume: 0.2, when: 0.06 });
  },
  chest(a) {
    a.tone({ freq: 180, endFreq: 260, type: 'triangle', decay: 0.12, release: 0.05, volume: 0.25 });
    a.tone({ freq: 523, type: 'square', decay: 0.1, release: 0.05, volume: 0.16, when: 0.12 });
    a.tone({ freq: 659, type: 'square', decay: 0.12, release: 0.06, volume: 0.16, when: 0.22 });
  },
  levelUp(a) {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => {
      a.tone({ freq: f, type: 'square', decay: 0.12, release: 0.08, volume: 0.2, when: i * 0.1 });
    });
    a.noise({ duration: 0.3, filterFreq: 5000, filterType: 'highpass', volume: 0.06, when: 0.1 });
  },
  quest(a) {
    a.tone({ freq: 392, type: 'triangle', decay: 0.12, release: 0.06, volume: 0.22 });
    a.tone({ freq: 523, type: 'triangle', decay: 0.14, release: 0.08, volume: 0.22, when: 0.12 });
    a.tone({ freq: 659, type: 'triangle', decay: 0.2, release: 0.1, volume: 0.22, when: 0.24 });
  },
  boss(a) {
    a.tone({ freq: 110, endFreq: 55, type: 'sawtooth', decay: 0.5, release: 0.3, volume: 0.34 });
    a.noise({ duration: 0.5, filterFreq: 300, volume: 0.24 });
    a.duck(0.9, 0.3);
  },
  death(a) {
    a.tone({ freq: 220, endFreq: 40, type: 'sawtooth', decay: 0.6, release: 0.4, volume: 0.35 });
    a.noise({ duration: 0.5, filterFreq: 220, volume: 0.28 });
  },
  craft(a) {
    a.noise({ duration: 0.06, filterFreq: 2600, volume: 0.16 });
    a.tone({ freq: 440, type: 'triangle', decay: 0.06, release: 0.03, volume: 0.18, when: 0.02 });
    a.tone({ freq: 554, type: 'triangle', decay: 0.1, release: 0.05, volume: 0.18, when: 0.12 });
  },
  error(a) {
    a.tone({ freq: 160, type: 'square', decay: 0.1, release: 0.05, volume: 0.24 });
    a.tone({ freq: 120, type: 'square', decay: 0.14, release: 0.06, volume: 0.24, when: 0.1 });
  },
  sandstorm(a) {
    a.noise({ duration: 0.9, filterFreq: 420, filterType: 'lowpass', volume: 0.16 });
  },
  portal(a) {
    a.tone({ freq: 260, endFreq: 1040, type: 'sine', decay: 0.4, release: 0.25, volume: 0.22 });
    a.noise({ duration: 0.4, filterFreq: 1800, volume: 0.1, when: 0.05 });
  },
  heal(a) {
    a.tone({ freq: 392, type: 'sine', decay: 0.12, release: 0.08, volume: 0.2 });
    a.tone({ freq: 523, type: 'sine', decay: 0.16, release: 0.1, volume: 0.2, when: 0.1 });
    a.tone({ freq: 659, type: 'sine', decay: 0.22, release: 0.12, volume: 0.18, when: 0.22 });
  },
  save(a) {
    a.tone({ freq: 784, type: 'triangle', decay: 0.06, release: 0.03, volume: 0.16 });
    a.tone({ freq: 988, type: 'triangle', decay: 0.1, release: 0.05, volume: 0.16, when: 0.07 });
  },
};

// ------------------------------------------------------------- music scores

export const MUSIC = {
  dunes: {
    bpm: 96,
    wave: 'triangle',
    bass: ['A2', null, 'A2', null, 'E2', null, 'G2', null, 'A2', null, 'C3', null, 'E3', null, 'D3', null],
    lead: [null, 'A4', null, 'C5', null, 'B4', null, 'E4', null, 'A4', null, 'D5', null, 'C5', null, 'B4'],
  },
  oasis: {
    bpm: 84,
    wave: 'sine',
    bass: ['C3', null, 'G2', null, 'A2', null, 'E2', null, 'F2', null, 'C3', null, 'G2', null, 'D3', null],
    lead: ['E5', null, null, 'G4', 'A4', null, 'C5', null, 'B4', null, 'G4', null, 'E4', null, 'G4', null],
  },
  temple: {
    bpm: 72,
    wave: 'square',
    bass: ['D2', null, null, 'D2', 'A2', null, 'D2', null, 'F2', null, null, 'F2', 'C3', null, 'A2', null],
    lead: [null, null, 'D4', null, 'F4', null, 'E4', null, null, 'A4', null, 'G4', null, 'F4', null, 'D4'],
  },
  boss: {
    bpm: 132,
    wave: 'sawtooth',
    bass: ['E2', 'E2', 'E2', 'G2', 'E2', 'E2', 'A2', 'G2', 'E2', 'E2', 'D2', 'E2', 'G2', 'A2', 'B2', 'B2'],
    lead: ['E4', null, 'G4', 'A4', null, 'B4', null, 'A4', 'G4', null, 'E4', 'D4', 'E4', null, 'B3', null],
  },
  night: {
    bpm: 64,
    wave: 'sine',
    bass: ['A2', null, null, null, 'E2', null, null, null, 'F2', null, null, null, 'C3', null, null, null],
    lead: [null, 'E5', null, 'C5', null, null, 'A4', null, null, 'E4', null, 'G4', null, null, 'A4', null],
  },
};

export const audio = new AudioEngine();
