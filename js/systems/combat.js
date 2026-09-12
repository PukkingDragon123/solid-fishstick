// CRABDEN - the strike.
//
// You are two tonnes of animal with a claw that closes at the speed of a door
// slamming, and that is not a button you hold. It is a swing you have to time.
//
// The gauge sweeps. Somewhere on it is a window where the claw is actually
// closing on the thing rather than travelling toward it, and inside that
// window is a much narrower one where it lands on the joint. Hit the band and
// you do damage. Hit the core and you do a great deal of it, the animal is
// staggered, and the next swing comes round faster.
//
// Miss and the claw is out and open and you are the one standing there with
// your chest exposed, which is exactly as long as it sounds.

import { clamp, clamp01, lerp } from '../lib/math.js';

const BASE_SPEED = 1.15;        // sweeps per second at combo zero
const BASE_BAND = 0.26;         // how much of the sweep lands at all
const CORE = 0.34;              // how much of the band is the good part
const MAX_COMBO = 6;
const OPEN_SECS = 0.85;         // how long a miss leaves you open

export class Combat {
  constructor(game) {
    this.game = game;
    this.live = false;
    this.pos = 0;               // 0..1 along the sweep
    this.dir = 1;
    this.band = 0.5;            // where the window is centred this sweep
    this.combo = 0;
    this.best = 0;
    this.open = 0;              // >0 means the last swing missed
    this.cool = 0;
    this.target = null;
    this.flash = 0;
    this.crit = 0;
  }

  get speed() { return BASE_SPEED * (1 + Math.min(this.combo, MAX_COMBO) * 0.16); }

  /** The window narrows as the combo climbs, because of course it does. */
  get width() { return BASE_BAND * (1 - Math.min(this.combo, MAX_COMBO) * 0.085); }

  get mult() { return 1 + Math.min(this.combo, MAX_COMBO) * 0.22; }

  /** Where on the sweep the window starts and ends. */
  get window() {
    const w = this.width;
    return [this.band - w / 2, this.band + w / 2];
  }

  /** Bring the gauge up against a target, or drop it if there is nothing. */
  engage(target) {
    if (!target || !target.alive) { this.stop(); return false; }
    this.target = target;
    if (!this.live) {
      this.live = true;
      this.pos = 0;
      this.dir = 1;
      this.combo = 0;
      this._reband();
    }
    return true;
  }

  stop() {
    this.live = false;
    this.target = null;
    this.combo = 0;
  }

  _reband() {
    // never right at the ends, so there is always a swing to be made
    this.band = 0.22 + Math.random() * 0.56;
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3);
    this.crit = Math.max(0, this.crit - dt * 2.4);
    if (this.cool > 0) this.cool -= dt;
    if (this.open > 0) this.open -= dt;
    if (!this.live) return;
    // the target dying, or walking off, ends it
    const t = this.target;
    if (!t || !t.alive || Math.abs(t.x - this.game.crab.x) > 260) { this.stop(); return; }

    this.pos += this.dir * this.speed * dt;
    if (this.pos >= 1) { this.pos = 1; this.dir = -1; this._reband(); }
    else if (this.pos <= 0) { this.pos = 0; this.dir = 1; this._reband(); }
  }

  /**
   * One swing. Returns what it was worth: `miss`, `hit` or `crit`, and the
   * multiplier that goes with it.
   */
  strike() {
    if (!this.live) return { kind: 'none' };
    if (this.open > 0) return { kind: 'open' };
    if (this.cool > 0) return { kind: 'early' };
    this.cool = 0.16;
    const [lo, hi] = this.window;
    const p = this.pos;
    if (p < lo || p > hi) {
      // a clean miss: the combo goes, and you are open
      this.combo = 0;
      this.open = OPEN_SECS;
      this._reband();
      return { kind: 'miss' };
    }
    const off = Math.abs(p - this.band) / (this.width / 2);   // 0 dead centre
    const core = off <= CORE;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    this.flash = 1;
    if (core) this.crit = 1;
    this._reband();
    return { kind: core ? 'crit' : 'hit', mult: this.mult * (core ? 2.1 : 1), off };
  }

  toJSON() { return { best: this.best }; }

  fromJSON(d) { if (d) this.best = d.best || 0; }
}
