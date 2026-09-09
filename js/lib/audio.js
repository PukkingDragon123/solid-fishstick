// CRABDEN - fully procedural audio. No sample files: every sound is
// synthesised, so the whole game stays a handful of text files.

const NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteHz(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return 440;
  let semi = NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const oct = parseInt(m[3], 10);
  return 440 * Math.pow(2, (semi - 9) / 12 + (oct - 4));
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterVol = 0.7;
    this.musicVol = 0.45;
    this.sfxVol = 0.8;
    this._noiseBuf = null;
    this._windNodes = null;
    this._musicTimer = 0;
    this._musicStep = 0;
    this._mood = 'calm';
    this._targetWind = 0.25;
  }

  /** Must be called from a user gesture. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVol;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVol;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);

      // gentle reverb-ish send using a short noise convolution
      this.verb = this.ctx.createConvolver();
      this.verb.buffer = this._impulse(1.6, 2.4);
      this.verbGain = this.ctx.createGain();
      this.verbGain.gain.value = 0.22;
      this.verb.connect(this.verbGain);
      this.verbGain.connect(this.master);

      this._startWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.enabled = !m;
    if (this.master) this.master.gain.value = m ? 0 : this.masterVol;
  }

  _impulse(dur, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.max(1, (rate * dur) | 0);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noise() {
    if (!this._noiseBuf) {
      const rate = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, rate * 2, rate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        d[i] = white * 0.6 + last * 3;
      }
      this._noiseBuf = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    return src;
  }

  // -- ambient wind ---------------------------------------------------------
  _startWind() {
    const src = this._noise();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 520;
    filt.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0;
    src.connect(filt); filt.connect(gain); gain.connect(this.master);
    src.start();
    this._windNodes = { src, filt, gain };
  }

  /** strength 0..1, gustiness modulates filter */
  setWind(strength, sandiness = 0) {
    if (!this._windNodes) return;
    const t = this.ctx.currentTime;
    const g = Math.min(0.35, strength * 0.3 + sandiness * 0.18);
    this._windNodes.gain.gain.setTargetAtTime(g, t, 0.8);
    this._windNodes.filt.frequency.setTargetAtTime(320 + strength * 900 + sandiness * 700, t, 1.2);
    this._windNodes.filt.Q.setTargetAtTime(0.5 + sandiness * 1.5, t, 1.2);
  }

  // -- one-shot synth helpers ----------------------------------------------
  _env(node, t, a, d, peak, sustain = 0, rel = 0.05) {
    const g = node.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (sustain > 0) {
      g.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.6), t + a + d);
      g.exponentialRampToValueAtTime(0.0001, t + a + d + sustain + rel);
    } else {
      g.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
  }

  tone(freq, { type = 'sine', dur = 0.18, vol = 0.3, attack = 0.005, slide = 0, delay = 0, verb = 0.1, detune = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    this._env(g, t, attack, dur, vol);
    osc.connect(g); g.connect(this.sfxBus);
    if (verb > 0) { const vg = this.ctx.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    osc.start(t); osc.stop(t + dur + 0.1);
  }

  noiseBurst({ dur = 0.15, vol = 0.25, freq = 900, q = 1, type = 'bandpass', delay = 0, sweep = 1 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const src = this._noise();
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.frequency.setValueAtTime(freq, t); filt.Q.value = q;
    if (sweep !== 1) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, dur, vol);
    src.connect(filt); filt.connect(g); g.connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // -- named game sounds ----------------------------------------------------
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const p = opts.pitch || 1;
    switch (name) {
      case 'step':
        this.noiseBurst({ dur: 0.06, vol: 0.05 + Math.random() * 0.03, freq: 1400 + Math.random() * 900, q: 0.8, sweep: 0.4, verb: 0 });
        break;
      case 'drip':
        this.tone(880 * p, { type: 'sine', dur: 0.16, vol: 0.28, slide: 2.6, verb: 0.5 });
        break;
      case 'water':
        this.noiseBurst({ dur: 0.28, vol: 0.16, freq: 500, q: 0.7, sweep: 3.2 });
        this.tone(300 * p, { type: 'sine', dur: 0.3, vol: 0.15, slide: 2.2, verb: 0.4 });
        break;
      case 'splash':
        this.noiseBurst({ dur: 0.5, vol: 0.3, freq: 2200, q: 0.5, sweep: 0.15 });
        this.tone(220, { type: 'sine', dur: 0.4, vol: 0.2, slide: 0.5, verb: 0.6 });
        break;
      case 'grow':
        [0, 4, 7, 12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12) * p, { type: 'triangle', dur: 0.25, vol: 0.13, delay: i * 0.055, verb: 0.35 }));
        break;
      case 'pickup':
        this.tone(659 * p, { type: 'square', dur: 0.07, vol: 0.12 });
        this.tone(988 * p, { type: 'square', dur: 0.1, vol: 0.11, delay: 0.06 });
        break;
      case 'ui':
        this.tone(660, { type: 'square', dur: 0.04, vol: 0.07, verb: 0 });
        break;
      case 'uiBig':
        this.tone(523, { type: 'square', dur: 0.06, vol: 0.1, verb: 0 });
        this.tone(784, { type: 'square', dur: 0.09, vol: 0.09, delay: 0.05, verb: 0 });
        break;
      case 'deny':
        this.tone(180, { type: 'square', dur: 0.12, vol: 0.12, slide: 0.7, verb: 0 });
        break;
      case 'claw':
        this.noiseBurst({ dur: 0.11, vol: 0.16, freq: 2600, q: 1.4, sweep: 0.25 });
        this.tone(300 * p, { type: 'sawtooth', dur: 0.1, vol: 0.09, slide: 0.5 });
        break;
      case 'hit':
        this.noiseBurst({ dur: 0.14, vol: 0.24, freq: 420, q: 0.9, sweep: 0.3 });
        this.tone(140, { type: 'square', dur: 0.13, vol: 0.16, slide: 0.5 });
        break;
      case 'hurt':
        this.tone(320, { type: 'sawtooth', dur: 0.25, vol: 0.2, slide: 0.35 });
        this.noiseBurst({ dur: 0.2, vol: 0.14, freq: 700, q: 0.6, sweep: 0.4 });
        break;
      case 'evolve':
        [0, 3, 7, 10, 12, 15].forEach((s, i) =>
          this.tone(261.6 * Math.pow(2, s / 12), { type: 'triangle', dur: 0.6, vol: 0.13, delay: i * 0.09, verb: 0.7 }));
        this.noiseBurst({ dur: 1.2, vol: 0.1, freq: 300, q: 0.4, sweep: 6, delay: 0.1 });
        break;
      case 'chirp':
        for (let i = 0; i < 3; i++) this.tone((1800 + Math.random() * 900) * p, { type: 'sine', dur: 0.05, vol: 0.09, delay: i * 0.07, slide: 1.5, verb: 0.4 });
        break;
      case 'growl':
        this.tone(70, { type: 'sawtooth', dur: 0.55, vol: 0.2, slide: 1.4, verb: 0.4 });
        this.noiseBurst({ dur: 0.5, vol: 0.09, freq: 240, q: 2, sweep: 1.6 });
        break;
      case 'discover':
        [0, 5, 9, 12].forEach((s, i) => this.tone(440 * Math.pow(2, s / 12), { type: 'sine', dur: 0.5, vol: 0.15, delay: i * 0.11, verb: 0.6 }));
        break;
      case 'talk':
        this.tone((420 + Math.random() * 260) * p, { type: 'square', dur: 0.035, vol: 0.045, verb: 0 });
        break;
      case 'thunder':
        this.noiseBurst({ dur: 1.8, vol: 0.3, freq: 160, q: 0.4, sweep: 0.4 });
        this.tone(48, { type: 'sine', dur: 1.6, vol: 0.24, slide: 0.6, verb: 0.6 });
        break;
      case 'night':
        this.tone(196, { type: 'sine', dur: 2.2, vol: 0.08, verb: 0.9 });
        this.tone(233, { type: 'sine', dur: 2.4, vol: 0.06, delay: 0.3, verb: 0.9 });
        break;
      case 'dawn':
        [0, 4, 7, 11].forEach((s, i) => this.tone(329.6 * Math.pow(2, s / 12), { type: 'sine', dur: 1.4, vol: 0.09, delay: i * 0.16, verb: 0.8 }));
        break;
      default: break;
    }
  }

  // -- generative score -----------------------------------------------------
  // A slow modal loop. Mood swaps the scale and instrument colour.
  setMood(mood) { this._mood = mood; }

  updateMusic(dt) {
    if (!this.ctx || !this.enabled) return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;

    const moods = {
      calm:   { root: 'D3', scale: [0, 2, 5, 7, 9, 12, 14], step: 1.05, wave: 'sine',     vol: 0.12 },
      hopeful:{ root: 'F3', scale: [0, 2, 4, 7, 9, 11, 12], step: 0.9,  wave: 'triangle', vol: 0.13 },
      night:  { root: 'A2', scale: [0, 3, 5, 7, 10, 12, 15], step: 1.25, wave: 'sine',    vol: 0.11 },
      danger: { root: 'C3', scale: [0, 1, 5, 6, 7, 11, 12], step: 0.42, wave: 'sawtooth', vol: 0.09 },
      wonder: { root: 'G3', scale: [0, 2, 4, 6, 7, 9, 11], step: 1.1,  wave: 'triangle',  vol: 0.14 },
    };
    const m = moods[this._mood] || moods.calm;
    this._musicTimer = m.step * (0.85 + Math.random() * 0.4);
    this._musicStep++;

    const base = noteHz(m.root);
    const semi = m.scale[Math.floor(Math.random() * m.scale.length)];
    const freq = base * Math.pow(2, semi / 12);

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1400;
    osc.type = m.wave;
    osc.frequency.value = freq;
    const dur = m.step * 2.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(m.vol, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filt); filt.connect(g); g.connect(this.musicBus);
    const vg = this.ctx.createGain(); vg.gain.value = 0.5; g.connect(vg); vg.connect(this.verb);
    osc.start(t); osc.stop(t + dur + 0.2);

    // bass pulse every 4 steps
    if (this._musicStep % 4 === 0) {
      const b = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      b.type = 'sine';
      b.frequency.value = base / 2;
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(m.vol * 1.2, t + 0.1);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + m.step * 3);
      b.connect(bg); bg.connect(this.musicBus);
      b.start(t); b.stop(t + m.step * 3 + 0.2);
    }
  }
}
