// CRABDEN - the fight.
//
// A fight used to be a needle sweeping a bar: you pressed a button in time
// with a gauge and the animal took damage. That is a rhythm minigame with a
// scorpion drawn next to it.
//
// This is a duel, and a duel has three verbs and nothing else:
//
//   SWING   you do not press attack. You DRAG the claw - a stick under your
//           thumb - and flick it at something. Where you flick decides the
//           arc: low takes the legs, level takes the body, and the reach is
//           the reach of an actual claw, so you have to be close.
//   DODGE   one roll, backwards, with a moment of nothing-can-touch-you in
//           the middle of it, and then you are winded and cannot do it again
//           for a second. It is for getting OUT.
//   GUARD   the claw comes up. Held, it eats most of a hit. Raised in the
//           quarter-second before one lands, it is a PARRY: nothing gets
//           through at all, the thing that swung is knocked off its feet, and
//           the next swing you make lands on an animal that cannot move.
//
// The whole thing turns on the enemy telling you first. Everything that can
// hurt you winds up - rears, plants its feet, goes still - for most of a
// second before it commits, and that wind-up is the only clock in the fight.
// Read it and you have all three answers. Do not and you have none.

import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const REACH = 46;             // how far a claw is, in world units
const SWING_COOL = 0.42;
const DODGE_SECS = 0.42;      // how long the roll lasts
const DODGE_IFRAME = 0.26;    // and how much of it is untouchable
const DODGE_COOL = 0.95;
const PARRY_WINDOW = 0.26;    // how recently the guard has to have gone up
const GUARD_SOAK = 0.78;      // how much a held guard eats
const STAM_MAX = 100;

export class Combat {
  constructor(game) {
    this.game = game;
    this.live = false;
    this.target = null;

    this.guard = 0;           // 0..1, how far the claw is up
    this.guarding = false;
    this.guardAge = 9;        // seconds since it went up - the parry clock

    this.dodgeT = 0;          // >0 while rolling
    this.dodgeDir = 1;
    this.dodgeCool = 0;

    this.swingCool = 0;
    this.swing = null;        // { a, t, life } the arc being drawn
    this.stam = STAM_MAX;

    this.best = 0;            // longest chain of clean hits, kept for the HUD
    this.chain = 0;
    this.flash = 0;
    this.crit = 0;
    this.parryFlash = 0;
  }

  /** Anything hostile within a claw's length and a half. */
  get near() {
    return this.game.wildlife?.nearest(this.game.crab.x, this.game.crab.y,
      REACH * 1.8, (q) => q.hostile && q.alive) || null;
  }

  engage(target) {
    if (!target || !target.alive) { this.stop(); return false; }
    this.target = target;
    this.live = true;
    return true;
  }

  stop() {
    this.live = false;
    this.target = null;
    this.chain = 0;
    this.guarding = false;
  }

  /**
   * How close whatever is in front of you is to actually swinging, 0..1. This
   * is the only number in the fight and the UI draws it as a ring round the
   * animal rather than as a bar in a corner.
   */
  get threat() {
    const t = this.target;
    if (!t || !t.alive) return 0;
    return clamp01(t.wind || 0);
  }

  update(dt) {
    this.flash = Math.max(0, this.flash - dt * 3);
    this.crit = Math.max(0, this.crit - dt * 2.4);
    this.parryFlash = Math.max(0, this.parryFlash - dt * 2.2);
    this.swingCool = Math.max(0, this.swingCool - dt);
    this.dodgeCool = Math.max(0, this.dodgeCool - dt);
    if (this.dodgeT > 0) this.dodgeT = Math.max(0, this.dodgeT - dt);
    this.guardAge += dt;

    // the claw comes up fast and drops slowly, which is what makes a late
    // guard a real mistake rather than a free one
    this.guard = this.guarding
      ? Math.min(1, this.guard + dt * 7)
      : Math.max(0, this.guard - dt * 3.4);

    // holding a guard costs; so does rolling. Standing still gets it back.
    const drain = (this.guarding ? 9 : 0) + (this.dodgeT > 0 ? 0 : 0);
    this.stam = clamp(this.stam - drain * dt + (this.guarding ? 0 : 16 * dt), 0, STAM_MAX);
    if (this.stam <= 0 && this.guarding) this.setGuard(false);

    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.t > this.swing.life) this.swing = null;
    }

    // engagement follows whatever is closest and still standing
    const n = this.near;
    if (n) this.engage(n);
    else if (this.live) this.stop();
  }

  setGuard(on) {
    if (on && !this.guarding) {
      if (this.stam < 12) return;
      this.guardAge = 0;                 // the parry clock starts here
      this.game.audio?.play('ui', { pitch: 0.6 });
    }
    this.guarding = !!on;
  }

  /** One roll. Backwards, because forwards into a mouth is not a dodge. */
  roll(dir) {
    if (this.dodgeT > 0 || this.dodgeCool > 0 || this.stam < 25) {
      return { ok: false };
    }
    const g = this.game;
    this.dodgeT = DODGE_SECS;
    this.dodgeCool = DODGE_COOL;
    this.dodgeDir = dir || -(g.crab.facing || 1);
    this.stam -= 25;
    g.crab.vx = this.dodgeDir * g.crab.speed * 2.1;
    g.crab.dodge = 1;
    g.audio?.play('step', { pitch: 1.5 });
    g.fx?.dust(g.crab.x, g.crab.y + g.crab.standH * 0.6, 1.2);
    return { ok: true };
  }

  get invulnerable() { return this.dodgeT > DODGE_SECS - DODGE_IFRAME; }

  /**
   * A swing, aimed. `dx, dy` is the flick, in screen terms, and its angle is
   * the arc the claw takes: down low sweeps the legs out, level goes for the
   * body, up is a hook that costs more and staggers.
   */
  strike(dx, dy) {
    const g = this.game;
    if (this.swingCool > 0) return { kind: 'early' };
    if (this.dodgeT > 0) return { kind: 'rolling' };
    if (this.stam < 10) return { kind: 'spent' };
    const len = Math.hypot(dx, dy) || 1;
    const a = Math.atan2(dy / len, dx / len);
    this.swingCool = SWING_COOL;
    this.stam -= 10;
    this.swing = { a, t: 0, life: 0.26 };
    const c = g.crab;
    c.clawOpen = 1;
    c.swingT = 0.3;
    c.swingA = a;

    // where the claw actually gets to
    const face = Math.sign(Math.cos(a)) || (c.facing || 1);
    c.facing = face;
    const hx = c.x + Math.cos(a) * REACH * 0.72;
    const hy = c.y - c.standH * 0.45 + Math.sin(a) * REACH * 0.5;

    // low sweeps wide and takes legs; high is narrow and staggers
    const low = Math.sin(a) > 0.35;
    const high = Math.sin(a) < -0.35;
    const spread = low ? REACH * 0.88 : REACH * 0.6;
    const power = g.economy ? g.economy.stat('dmg') : 8;
    const mult = high ? 1.35 : low ? 0.85 : 1;

    let hit = 0;
    for (const q of g.wildlife.hostiles) {
      if (Math.abs(q.x - hx) > spread || Math.abs(q.y - hy) > 44) continue;
      // a staggered animal takes the lot
      const bonus = (q.stagger || 0) > 0 ? 2.2 : 1;
      q.hurt(power * mult * bonus, c.x, { limb: low || bonus > 1 });
      if (high || bonus > 1) q.stagger = Math.max(q.stagger || 0, 1.1);
      if (low) { q.vx += face * 90; q.trip = 0.8; }
      hit++;
    }
    if (hit) {
      this.chain++;
      this.best = Math.max(this.best, this.chain);
      this.flash = 1;
      if (high) this.crit = 1;
      g.cam.shake(high ? 4 : 2.6);
      g.audio?.play('hit', { pitch: high ? 0.8 : 1 });
    } else {
      this.chain = 0;
      g.audio?.play('claw');
    }
    g.fx?.dust(hx, hy + 6, 0.8);
    return { kind: hit ? (high ? 'crit' : 'hit') : 'miss', hit };
  }

  /**
   * Something is landing on you. Returns how much of it gets through, and
   * this is where the three verbs pay off.
   */
  incoming(dmg, from) {
    if (this.invulnerable) {
      this.game.fx?.popup(this.game.crab.x, this.game.crab.y - 24, 'miss', '#9de3ee');
      return { dmg: 0, kind: 'dodge' };
    }
    if (this.guard > 0.4 && this.guardAge <= PARRY_WINDOW) {
      // PARRY. The whole reason to wait rather than hold.
      this.parryFlash = 1;
      this.stam = Math.min(STAM_MAX, this.stam + 22);
      if (from) {
        from.stagger = 2.0;
        from.vx += Math.sign(from.x - this.game.crab.x) * 140;
        from.trip = 1.0;
      }
      this.game.cam?.shake(5);
      this.game.audio?.play('evolve', { pitch: 1.5 });
      this.game.fx?.ring(this.game.crab.x, this.game.crab.y - 18, '#ffe9a8', 20);
      this.game.fx?.popup(this.game.crab.x, this.game.crab.y - 26, 'PARRY', '#ffe9a8');
      return { dmg: 0, kind: 'parry' };
    }
    if (this.guard > 0.5) {
      this.stam = Math.max(0, this.stam - 18);
      this.game.audio?.play('hit', { pitch: 0.55 });
      this.game.fx?.spark(this.game.crab.x, this.game.crab.y - 16, '#cfd8dc', 10, 40);
      this.game.fx?.popup(this.game.crab.x, this.game.crab.y - 26, 'block', '#cfd8dc');
      return { dmg: dmg * (1 - GUARD_SOAK), kind: 'block' };
    }
    this.chain = 0;
    return { dmg, kind: 'hit' };
  }

  toJSON() { return { best: this.best }; }
  fromJSON(d) { if (d) this.best = d.best || 0; }
}
