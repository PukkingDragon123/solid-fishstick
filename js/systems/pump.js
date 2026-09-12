// CRABDEN - the spring, and how hard it is to run.
//
// Water used to come out of you because you held a key down. It does not any
// more. The spring in your back is a muscle, and a muscle has a rhythm: there
// is a moment in each stroke where the chamber is full and pushing does
// something, and a lot of moments either side where pushing does nothing but
// tire you out.
//
// So pumping is a gauge with a needle sweeping across it and a band you are
// trying to hit. Tap on the band and the stroke lands. Land them in a row and
// the spring runs faster and harder - and the band narrows, and the needle
// speeds up, and eventually it stutters, because the better you get at this
// the less margin you are given.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';

const BASE_SPEED = 0.95;        // sweeps per second at combo 0
const BASE_BAND = 0.30;         // how much of the gauge is the sweet spot
const IDLE_OUT = 2.6;           // seconds of not stroking before it shuts
const MAX_COMBO = 10;

export class Pump {
  constructor(game) {
    this.game = game;
    this.open = 0;              // 0 shut, 1 fully drawn
    this.live = false;
    this.pos = 0;               // where the needle is, 0..1
    this.dir = 1;
    this.combo = 0;
    this.best = 0;
    this.idle = 0;
    this.power = 0;             // what the old hold-to-pump used to be
    this.flash = null;          // {text, colour, t}
    this.shake = 0;
    this.stutter = 0;
    this.strokes = 0;
    this.landed = 0;
    this.cool = 0;             // a chamber has to refill before it can push again
  }

  /** How fast the needle is going and how wide the band is, right now. */
  get speed() { return BASE_SPEED + this.combo * 0.135; }
  get band() { return Math.max(0.085, BASE_BAND - this.combo * 0.017); }
  /** The middle of the band drifts once you are good enough to notice. */
  get centre() {
    return 0.5 + (this.combo >= 4 ? Math.sin(this.game.time * 0.7) * 0.18 : 0);
  }
  get mult() { return 1 + Math.min(this.combo, MAX_COMBO) * 0.085; }

  wake() {
    if (!this.live) {
      this.live = true;
      this.pos = 0;
      this.dir = 1;
      this.idle = 0;
    }
  }

  update(dt) {
    this.open = damp(this.open, this.live ? 1 : 0, this.live ? 0.001 : 0.0005, dt);
    this.power = Math.max(0, this.power - dt * 1.5);
    this.shake = Math.max(0, this.shake - dt * 4);
    this.cool = Math.max(0, this.cool - dt);
    if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
    if (!this.live) return;

    this.idle += dt;
    if (this.idle > IDLE_OUT) { this.live = false; this.combo = 0; return; }

    // the needle. Past a certain combo it flinches: a short, random reversal
    // that ruins anyone pumping on autopilot.
    if (this.stutter > 0) this.stutter -= dt;
    else if (this.combo >= 6 && Math.random() < dt * 0.55) {
      this.stutter = 0.12 + Math.random() * 0.14;
      this.dir = -this.dir;
    }
    this.pos += this.dir * this.speed * dt;
    if (this.pos > 1) { this.pos = 1; this.dir = -1; }
    if (this.pos < 0) { this.pos = 0; this.dir = 1; }
  }

  /**
   * One stroke. Returns how much of a push it was: 0 for a miss, up to about
   * three for a perfect one on a long chain.
   */
  stroke() {
    this.wake();
    this.idle = 0;
    // hammering does not work: the chamber has to refill between strokes, so
    // a second push too soon is a wasted one
    if (this.cool > 0) {
      this.combo = 0;
      this.cool = 0.26;
      this.shake = 1;
      this._say('TOO SOON', '#e08c9c');
      this.game.audio?.play('deny');
      return 0;
    }
    this.cool = 0.19;
    this.strokes++;
    const d = Math.abs(this.pos - this.centre);
    const half = this.band / 2;
    let push = 0;
    if (d <= half * 0.34) {
      this.combo++;
      this.landed++;
      push = 1.9;
      this._say('PERFECT', '#c9f2fa');
      this.game.audio?.play('drip', { pitch: 1 + Math.min(this.combo, 10) * 0.06 });
    } else if (d <= half) {
      this.combo++;
      this.landed++;
      push = 0.95;
      this._say('GOOD', '#9de3ee');
      this.game.audio?.play('water');
    } else {
      this.combo = 0;
      push = 0.06;
      this.shake = 1;
      this._say('SLIPPED', '#e08c9c');
      this.game.audio?.play('deny');
    }
    this.best = Math.max(this.best, this.combo);
    this.power = Math.min(1, this.power + 0.5 + push * 0.2);
    return push * this.mult;
  }

  _say(text, colour) { this.flash = { text, colour, t: 0.7 }; }

  toJSON() { return { best: this.best, strokes: this.strokes, landed: this.landed }; }
  fromJSON(d) {
    if (!d) return;
    this.best = d.best || 0;
    this.strokes = d.strokes || 0;
    this.landed = d.landed || 0;
  }
}
