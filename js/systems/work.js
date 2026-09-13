// CRABDEN - doing a thing properly.
//
// Everything you could get out of this desert used to come out of it the
// instant you pressed a key. Press E and a fossil that has been in the ground
// eleven thousand years is in your hand. That is not what taking something out
// of the ground is like, and it is not interesting either.
//
// So work takes time now, and while it is taking time you are holding it. A
// job has a length, a worker, and a bar - and across that bar a needle sweeps
// back and forth. Land your stroke in the band and the work goes faster and
// cleaner; land it outside and you have wasted the swing, and on a fragile
// thing you have broken a piece of it. Let go and the job stops where it is
// and waits for you, because putting the trowel down is allowed.
//
// It is one system because it is one idea: digging a fossil, picking a fruit,
// sinking a plant and pouring water are all somebody kneeling down and doing
// something with their hands for a while.

import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

/**
 * The jobs. `secs` is how long a clean run takes at no skill; `band` is how
 * much of the sweep counts as a good stroke; `sweep` is how fast the needle
 * goes. `care` is what a bad stroke costs - 0 for something you cannot damage,
 * up to 1 for a thing that shatters.
 */
export const JOBS = {
  dig: {
    name: 'Digging', secs: 5.2, band: 0.30, sweep: 1.05, care: 0.7,
    verb: 'dig', pose: 'dig', sound: 'claw', icon: 'spade',
    tint: '#c9a24a',
    hint: 'Every stroke in the band is sand off it. Every stroke outside is a crack in it.',
  },
  pick: {
    name: 'Picking', secs: 1.9, band: 0.42, sweep: 1.5, care: 0.25,
    verb: 'pick', pose: 'reach', sound: 'pickup', icon: 'hand',
    tint: '#8cc468',
    hint: 'Take it off at the stem. Tearing it costs you the next one.',
  },
  plant: {
    name: 'Planting', secs: 7.5, band: 0.34, sweep: 0.9, care: 0.35,
    verb: 'plant', pose: 'dig', sound: 'step', icon: 'seed',
    tint: '#9ad86a',
    hint: 'A hole, a seed, and the sand back over it. It is not quick.',
  },
  water: {
    name: 'Watering', secs: 3.4, band: 0.26, sweep: 1.25, care: 0.15,
    verb: 'water', pose: 'pour', sound: 'water', icon: 'drop',
    tint: '#5fc6d8',
    hint: 'Pour it in the band. Too fast and it runs off the top.',
  },
  mine: {
    name: 'Mining', secs: 4.4, band: 0.28, sweep: 1.2, care: 0.5,
    verb: 'mine', pose: 'swing', sound: 'hit', icon: 'bolt',
    tint: '#c97a4a',
    hint: 'Hit the seam where it is already cracked.',
  },
  search: {
    name: 'Searching', secs: 3.0, band: 0.38, sweep: 1.1, care: 0.1,
    verb: 'search', pose: 'crouch', sound: 'step', icon: 'map',
    tint: '#b49c70',
    hint: 'Turn it over. Slowly.',
  },
};

const STROKE_GAIN = 0.24;     // how much of the job one good stroke takes off
const CORE = 0.32;            // the middle of the band, worth more
// Just holding it gets the job done in a bit under twice the time - so
// somebody who cannot hit the band still finishes, and somebody who can is
// twice as fast. His doing it on his own is the slow number, and that is the
// number you are meant to feel.
const IDLE_RATE = 0.55;

export class Work {
  constructor(game) {
    this.game = game;
    this.job = null;
  }

  get live() { return !!this.job; }

  /**
   * Start a job. `by` is whoever is doing it - you, or him while the spore has
   * him, or a tamed animal. `onDone` gets the quality (0-1) so the thing you
   * dug up can come out chipped.
   */
  begin(kind, opts = {}) {
    const def = JOBS[kind];
    if (!def) return false;
    // starting the same job again is not a reason to lose the progress on it
    if (this.job && this.job.kind === kind && this.job.tag === opts.tag) return true;
    const skill = opts.skill ?? 1;
    this.job = {
      kind, def, tag: opts.tag ?? null,
      x: opts.x ?? this.game.crab.x,
      y: opts.y ?? this.game.terrain.surfaceY(opts.x ?? this.game.crab.x),
      by: opts.by || this.game.crab,
      onDone: opts.onDone || null,
      onStroke: opts.onStroke || null,
      label: opts.label || def.name,
      secs: def.secs / clamp(skill, 0.4, 3),
      t: 0,                 // seconds spent
      done: 0,              // 0..1
      quality: 1,           // falls with every bad stroke
      strokes: 0,
      good: 0,
      needle: 0,            // 0..1 across the bar
      dir: 1,
      centre: 0.5,
      band: def.band,
      flash: 0,             // +1 on a good stroke, -1 on a bad one
      shake: 0,
      held: true,
      idle: 0,              // how long since you last did anything
    };
    this._reband();
    this.game.audio?.play('ui');
    return true;
  }

  /** Move the band somewhere new, so a rhythm never carries you through. */
  _reband() {
    const j = this.job;
    const half = j.band / 2;
    j.centre = lerp(half + 0.06, 1 - half - 0.06, Math.random());
  }

  stop(reason = 'let go') {
    const j = this.job;
    this.job = null;
    return j ? { ...j, reason } : null;
  }

  /**
   * One stroke. Where the needle is when you press is the whole of it.
   */
  strike() {
    const j = this.job;
    if (!j) return { kind: 'none' };
    const d = Math.abs(j.needle - j.centre);
    const half = j.band / 2;
    j.strokes++;
    const g = this.game;
    const w = j.by;

    if (d > half) {
      // a miss: the work does not move, and a fragile thing takes damage
      j.quality = clamp01(j.quality - j.def.care * 0.16);
      j.flash = -1;
      j.shake = 1;
      g.audio?.play('deny');
      g.fx?.dust(j.x, j.y, 0.5);
      this._swing(w, false);
      j.idle = 0;
      return { kind: 'miss', quality: j.quality };
    }

    const core = d <= half * CORE;
    j.good++;
    j.done = clamp01(j.done + STROKE_GAIN * (core ? 1.45 : 1));
    j.flash = 1;
    j.idle = 0;
    g.audio?.play(j.def.sound, { pitch: core ? 1.25 : 1 });
    this._swing(w, true);
    j.onStroke?.(core);
    // the ground answers
    if (j.kind === 'water') {
      g.fx?.splash?.(j.x, j.y, core ? 1 : 0.6);
      g.fx?.drift(j.x, j.y - 4, '#9de3ee', core ? 5 : 3);
    } else {
      g.fx?.dust(j.x, j.y, core ? 1.5 : 1);
      if (j.kind === 'dig' || j.kind === 'plant') g.fx?.digSpray?.(j.x, j.y, core ? 1.2 : 0.8);
    }
    if (core) g.cam?.shake(1.2);
    this._reband();
    if (j.done >= 1) this._finish();
    return { kind: core ? 'core' : 'hit', quality: j.quality };
  }

  /** Whoever is doing it actually moves. */
  _swing(w, good) {
    if (!w) return;
    const j = this.job;
    if (w === this.game.crab) {
      w.clawOpen = 1;
      w.lurch = (w.facing || 1) * (good ? 3 : 1.6);
      w.digging = 0.5;
    } else if (w.setPose) {
      // him: the pose he is in says what he is doing, and the arm throws
      w.swingT = 0.32;
      w.jv = Math.min(w.jv || 0, good ? -26 : -12);
    }
  }

  _finish() {
    const j = this.job;
    this.job = null;
    const g = this.game;
    g.audio?.play('discover');
    g.cam?.shake(2.4);
    g.fx?.spark(j.x, j.y - 8, j.def.tint, 14, 44);
    j.onDone?.({
      quality: j.quality,
      strokes: j.strokes,
      good: j.good,
      clean: j.strokes > 0 && j.good === j.strokes,
    });
  }

  update(dt, held) {
    const j = this.job;
    if (!j) return;
    // somebody else doing the work does not need you holding a key down. The
    // band is still there and your strokes still help - you are the one with
    // the reach - but his hands keep moving whether you join in or not.
    if (j.by && j.by !== this.game.crab) held = true;
    j.held = held;
    j.t += dt;
    j.flash *= Math.pow(0.02, dt);
    j.shake = Math.max(0, j.shake - dt * 3);

    // the worker has to stay with the work
    const w = j.by;
    if (w && Math.abs(w.x - j.x) > 70) { this.stop('walked off'); return; }
    if (w && w.alive === false) { this.stop('died'); return; }

    if (!held) {
      // put down, not abandoned - it waits a while before it gives up
      j.idle += dt;
      if (j.idle > 6) this.stop('left it');
      return;
    }

    // the needle, bouncing off both ends
    j.needle += j.dir * j.def.sweep * dt;
    if (j.needle > 1) { j.needle = 1; j.dir = -1; }
    if (j.needle < 0) { j.needle = 0; j.dir = 1; }

    // holding it without striking still gets somewhere, slowly - a job should
    // finish for somebody who cannot hit the band, just not quickly
    j.done = clamp01(j.done + (dt / j.secs) * IDLE_RATE);
    if (j.done >= 1) this._finish();
  }
}
