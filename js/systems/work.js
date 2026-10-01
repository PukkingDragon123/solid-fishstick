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
    name: 'Digging', secs: 5.2, band: 0.26, sweep: 0.95, care: 0.7,
    verb: 'dig', pose: 'dig', sound: 'claw', icon: 'spade',
    tint: '#c9a24a', popup: true, strikes: 4, tool: 'spade', chibi: 'dig',
    hint: 'Every stroke in the band is sand off it. Every stroke outside is a crack in it.',
  },
  pick: {
    name: 'Picking', secs: 0.8, band: 0.42, sweep: 1.5, care: 0.25,
    verb: 'pick', pose: 'reach', sound: 'pickup', icon: 'fruit',
    tint: '#8cc468', popup: false,
    hint: 'Take it off at the stem.',
  },
  plant: {
    name: 'Planting', secs: 7.5, band: 0.34, sweep: 0.9, care: 0.35,
    verb: 'plant', pose: 'dig', sound: 'step', icon: 'seed',
    tint: '#9ad86a', popup: false,
    hint: 'A hole, a seed, and the sand back over it. It is not quick.',
  },
  water: {
    name: 'Watering', secs: 1.8, band: 0.26, sweep: 1.25, care: 0.15,
    verb: 'water', pose: 'pour', sound: 'water', icon: 'drop',
    tint: '#5fc6d8', popup: false,
    hint: 'Pour it in.',
  },
  mine: {
    name: 'Mining', secs: 4.4, band: 0.24, sweep: 1.05, care: 0.3,
    verb: 'mine', pose: 'swing', sound: 'hit', icon: 'pickaxe',
    tint: '#e08a4a', popup: true, strikes: 4, tool: 'pickaxe', chibi: 'mine',
    hint: 'Hit the seam where it is already cracked.',
  },
  study: {
    name: 'Studying', secs: 4.2, band: 0.32, sweep: 0.85, care: 0.1,
    verb: 'study', pose: 'crouch', sound: 'step', icon: 'magnifier',
    tint: '#9ad86a', popup: true, strikes: 3, tool: 'magnifier', chibi: 'study',
    hint: 'Look at the whole thing. The root tells you more than the flower.',
  },
  fell: {
    name: 'Cutting', secs: 6.4, band: 0.24, sweep: 1.0, care: 0.2,
    verb: 'cut', pose: 'swing', sound: 'claw', icon: 'axe',
    tint: '#9ad86a', popup: true, strikes: 5, tool: 'axe', chibi: 'cut',
    hint: 'The same notch, over and over, on the same side.',
  },
  search: {
    name: 'Searching', secs: 3.0, band: 0.34, sweep: 0.95, care: 0.05,
    verb: 'search', pose: 'crouch', sound: 'step', icon: 'magnifier',
    tint: '#b49c70', popup: true, strikes: 3, tool: 'magnifier', chibi: 'search',
    hint: 'Turn it over. Slowly.',
  },
};

const STROKE_GAIN = 0.24;     // how much of an unpopped job one good stroke takes off
const CORE = 0.32;            // the middle of the band, worth more
// A job you are kneeling at in the world (picking, watering) just runs: it is
// a moment, not a game. A job that opens the popup is ALL game - the needle
// runs on its own and nothing happens unless you strike.
const AUTO_RATE = 1.0;

export class Work {
  constructor(game) {
    this.game = game;
    this.job = null;
    // what the last finished popup job turned up, shown on the popup's own
    // reward card until it is tapped away or times out
    this.result = null;
  }

  get live() { return !!this.job; }

  /**
   * Nothing owns the screen any more. The timing game used to open a window
   * in the middle of it; now it is played on the thing itself - a stone bar
   * over the rock with the pickaxe riding along it - and the world carries
   * on around you while you swing. Kept so old callers still read false.
   */
  get modal() { return false; }

  /** A timing game is running out in the world: strike when the tool is in the crack. */
  get timed() { return !!(this.job && this.job.def.popup); }

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
    if (this.result) this.result = null;
    const skill = opts.skill ?? 1;
    const strikes = Math.max(2, Math.round(opts.strikes ?? def.strikes ?? 4));
    this.job = {
      kind, def, tag: opts.tag ?? null,
      x: opts.x ?? this.game.crab.x,
      y: opts.y ?? this.game.terrain.surfaceY(opts.x ?? this.game.crab.x),
      by: opts.by || this.game.crab,
      onDone: opts.onDone || null,
      onStroke: opts.onStroke || null,
      label: opts.label || def.name,
      // the top of whatever is being worked, in world units - the bar sits
      // just over it - and the colour its chips come off in
      top: opts.top ?? null,
      chip: opts.chip || def.tint,
      subject: opts.subject || null,     // what the popup shows being worked: an icon name
      sub: opts.sub || '',               // and a line under it
      secs: def.secs / Math.max(0.4, Math.min(3, skill)),
      strikes, gain: 1 / strikes,
      t: 0,                 // seconds spent
      done: 0,              // 0..1
      quality: 1,           // falls with every bad stroke
      strokes: 0,
      good: 0,
      perfect: 0,
      needle: 0,            // 0..1 across the bar
      dir: 1,
      speed: def.sweep * Math.max(0.8, Math.min(1.3, 1.08 / Math.max(0.6, skill))),
      centre: 0.5,
      band: def.band * Math.max(0.85, Math.min(1.35, skill)),
      flash: 0,             // +1 on a good stroke, -1 on a bad one
      shake: 0,
      held: true,
      idle: 0,              // how long since you last did anything
      last: null,           // { kind, t } - what the last stroke was, for the popup
      hits: [],             // little bits thrown off by each stroke, for the popup
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
   * What the job turned up. Called from a job's onDone so the popup can show
   * it on its card: `{ icon, name, count, note, good }`.
   */
  reward(r) {
    const j = this._ended;
    this.result = { t: 0, x: j ? j.x : this.game.crab.x, y: j ? (j.top ?? j.y - 16) : this.game.crab.y - 20,
      chip: j ? j.chip : null, ...r };
  }

  dismiss() { this.result = null; }

  /**
   * One stroke. Where the needle is when you press is the whole of it.
   */
  strike() {
    const j = this.job;
    if (!j) {
      if (this.result && this.result.t > 0.35) this.dismiss();
      return { kind: 'none' };
    }
    const d = Math.abs(j.needle - j.centre);
    const half = j.band / 2;
    j.strokes++;
    const g = this.game;
    const w = j.by;
    const popup = !!j.def.popup;

    if (d > half) {
      // a miss: the work does not move, and a fragile thing takes damage
      j.quality = clamp01(j.quality - j.def.care * 0.16);
      j.flash = -1;
      j.shake = 1;
      j.last = { kind: 'miss', t: 0 };
      g.audio?.play('deny');
      g.fx?.dust(j.x, j.y, 0.5);
      g.fx?.spark(j.x, j.top !== null ? lerp(j.y, j.top, 0.45) : j.y - 4, '#8a8072', 3, 18);
      this._swing(w, false);
      j.idle = 0;
      return { kind: 'miss', quality: j.quality };
    }

    const core = d <= half * CORE;
    j.good++;
    if (core) j.perfect++;
    const gain = popup ? j.gain : STROKE_GAIN;
    j.done = clamp01(j.done + gain * (core ? 1.5 : 1));
    j.flash = 1;
    j.shake = core ? 0.8 : 0.45;
    j.idle = 0;
    j.last = { kind: core ? 'core' : 'hit', t: 0 };
    // chips off the thing itself, out in the world
    for (let i = 0; i < (core ? 7 : 4); i++) {
      j.hits.push({ t: 0, a: -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v: 40 + Math.random() * 60, core });
    }
    const hy = j.top !== null ? lerp(j.y, j.top, 0.45) : j.y - 4;
    g.fx?.spark(j.x, hy, j.chip, core ? 12 : 7, core ? 46 : 30);
    // and every good stroke the needle gets a little keener
    if (popup) j.speed *= 1.07;
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
    if (w === this.game.crab) {
      w.clawOpen = 1;
      w.lurch = (w.facing || 1) * (good ? 3 : 1.6);
      w.digging = 0.5;
      // the big claw comes up and over and down on the rock
      w.smashT = 1;
    } else if (w.setPose) {
      // him: the pose he is in says what he is doing, and the arm throws
      w.swingT = 0.32;
      w.jv = Math.min(w.jv || 0, good ? -26 : -12);
    }
  }

  _finish() {
    const j = this.job;
    this.job = null;
    // remembered so the reward knows where to burst out of
    this._ended = j;
    const g = this.game;
    g.audio?.play('discover');
    g.cam?.shake(2.4);
    g.fx?.spark(j.x, j.y - 8, j.def.tint, 14, 44);
    j.onDone?.({
      quality: j.quality,
      strokes: j.strokes,
      good: j.good,
      perfect: j.perfect,
      clean: j.strokes > 0 && j.good === j.strokes,
    });
    // a popup job always ends on a card, even if the job had nothing to say
    if (j.def.popup && !this.result) {
      this.reward({ icon: j.subject || j.def.icon, name: j.label, count: 0, note: 'Done.' });
    }
  }

  update(dt, held) {
    if (this.result) {
      this.result.t += dt;
      if (this.result.t > 2.6) this.result = null;
    }
    const j = this.job;
    if (!j) return;
    const popup = !!j.def.popup;
    // somebody else doing the work does not need you holding a key down
    if (popup || (j.by && j.by !== this.game.crab)) held = true;
    j.held = held;
    j.t += dt;
    j.flash *= Math.pow(0.02, dt);
    j.shake = Math.max(0, j.shake - dt * 3);
    if (j.last) j.last.t += dt;
    for (let i = j.hits.length - 1; i >= 0; i--) {
      j.hits[i].t += dt;
      if (j.hits[i].t > 0.7) j.hits.splice(i, 1);
    }

    // the worker has to stay with the work
    const w = j.by;
    if (w && Math.abs(w.x - j.x) > (popup ? 64 : 70)) { this.stop('walked off'); return; }
    if (w && w.alive === false) { this.stop('died'); return; }

    if (!popup) {
      // a moment, not a game: it just runs
      j.done = clamp01(j.done + (dt / j.secs) * AUTO_RATE);
      if (j.done >= 1) this._finish();
      return;
    }

    // the tool, riding back and forth along the bar - always moving, so the
    // only thing to do is choose the moment
    j.needle += j.dir * j.speed * dt;
    if (j.needle > 1) { j.needle = 1; j.dir = -1; }
    if (j.needle < 0) { j.needle = 0; j.dir = 1; }
  }
}
