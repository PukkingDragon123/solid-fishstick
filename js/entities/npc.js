// CRABDEN - the people.
//
// Dr. Vess used to be a skeleton with painted parts hung off it, solved with
// the same two-bone IK the crab's legs use. It was the wrong tool: a person is
// thirty pixels tall, and at thirty pixels a lit gradient is not shading and a
// rotated limb is not a limb - both are mush, and no amount of tuning fixed
// it. He is a sprite sheet now (`js/art/vessart.js`): eleven drawn frames,
// flat colour, one hard outline, with his head stamped on a per-frame neck
// pixel so the twenty-one expressions still work.
//
// The poses below survive as a table of what he is DOING - what he holds, how
// far he leans, whether he is sitting - because the rest of the game reads
// them. What has gone is the idea that they were joint angles.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { ITEM_BY_ID } from '../data/craft.js';
import { pxEllipse, pxSize } from '../render/pix.js';
import { ik2 } from './crab.js';
import { buildPerson, headSide } from '../art/personart.js';
import { bodyFrame, frameFor, NECK, HAND, BODY_W, BODY_H } from '../art/vessart.js';
import { facePortrait, faceFor } from '../art/faces.js';

export const POSE = {
  IDLE: 'idle', IDLE_FRONT: 'idleFront', IDLE_BACK: 'idleBack',
  WALK: 'walk', CROUCH: 'crouch', DIG: 'dig',
  WRITE: 'write', POINT: 'point', DRINK: 'drink', WAVE: 'wave',
  SIT: 'sit', TALK: 'talk', WANDER: 'wander', TIRED: 'tired',
  SURVEY: 'survey', MEASURE: 'measure', REST: 'rest', SHOCK: 'shock', BEER: 'beer',
  DOWN: 'down',
};

/**
 * What each pose does to the body.
 *
 *   crouch  0 standing, 1 folded right down over the ground
 *   lean    forward tilt of the spine, in radians
 *   armN/F  [shoulder angle, elbow flex] for the near and far arm. Flex is
 *           never negative: it bends the forearm forward, the way an arm
 *           does, and the poser subtracts it from the shoulder.
 *   tool    what is in the near hand
 *   swing   how much the arms swing with the walk
 */
const POSES = {
  idle: { crouch: 0, lean: 0.04, armN: [1.42, 0.16], armF: [1.50, 0.14], swing: 0.25 },
  idleFront: { crouch: 0, lean: 0, armN: [1.36, 0.14], armF: [1.44, 0.12], swing: 0.2, face: 0.35 },
  idleBack: { crouch: 0, lean: -0.05, armN: [1.50, 0.11], armF: [1.56, 0.10], swing: 0.2, face: -0.4 },
  walk: { crouch: 0.04, lean: 0.12, armN: [1.44, 0.26], armF: [1.44, 0.26], swing: 1 },
  wander: { crouch: 0.02, lean: 0.08, armN: [1.44, 0.20], armF: [1.46, 0.18], swing: 0.8 },
  crouch: { crouch: 0.72, lean: 0.46, armN: [0.62, 0.28], armF: [0.86, 0.34], tool: 'brush', swing: 0 },
  dig: { crouch: 0.80, lean: 0.54, armN: [0.40, 0.22], armF: [0.92, 0.40], tool: 'trowel', swing: 0, work: 1 },
  write: { crouch: 0.05, lean: 0.20, armN: [0.74, 0.84], armF: [0.98, 0.92], tool: 'pencil', hold: 'notebook', swing: 0 },
  point: { crouch: 0, lean: 0.02, armN: [-0.34, 0.02], armF: [1.46, 0.18], swing: 0 },
  drink: { crouch: 0.02, lean: -0.06, armN: [0.20, 1.24], armF: [1.48, 0.16], tool: 'canteen', swing: 0 },
  // the same pose with a bottle in it, which is what he does on the title
  // screen and has done every evening for eleven years
  beer: { crouch: 0.03, lean: -0.04, armN: [0.26, 1.10], armF: [1.46, 0.18], tool: 'beer', swing: 0 },
  wave: { crouch: 0, lean: 0.02, armN: [-0.90, 0.42], armF: [1.46, 0.18], swing: 0, work: 0.6 },
  sit: { crouch: 1, lean: 0.16, armN: [0.90, 0.66], armF: [1.06, 0.58], swing: 0, sit: 1 },
  talk: { crouch: 0, lean: 0.06, armN: [0.96, 0.72], armF: [1.20, 0.52], swing: 0, work: 0.5 },
  tired: { crouch: 0.30, lean: 0.42, armN: [1.18, 0.20], armF: [1.26, 0.18], swing: 0 },
  survey: { crouch: 0, lean: -0.04, armN: [0.22, 1.23], armF: [1.44, 0.18], tool: 'lens', swing: 0 },
  measure: { crouch: 0.10, lean: 0.22, armN: [0.30, 0.42], armF: [0.50, 0.50], tool: 'peg', swing: 0 },
  rest: { crouch: 0.94, lean: 0.24, armN: [1.00, 0.54], armF: [1.14, 0.50], swing: 0, sit: 1 },
  // on the ground, and not calmly: the legs are folded wrong, one arm is out
  // trying to push the world away and the other is somewhere under him
  down: { crouch: 1.25, lean: 1.05, armN: [0.30, 0.10], armF: [2.10, 0.34], swing: 0, sit: 1, face: 0.2 },
  // both arms straight up, spine back: the shape a person makes when the rock
  // they have been sitting on turns out to be an animal
  shock: { crouch: 0.16, lean: -0.14, armN: [-1.30, 0.26], armF: [-1.46, 0.22], swing: 0 },
};

const CAMP_ITEMS = ['bedroll', 'canteen', 'lantern', 'peg', 'skull', 'spoil', 'pick', 'brush'];

/** How long a pivot takes, and how narrow he gets halfway through it. */
const TURN_SECS = 0.26;
const TURN_MIN = 0.58;

export class Person {
  constructor(game, kind, x, opts = {}) {
    this.game = game;
    this.kind = kind;
    this.rig = buildPerson(kind, opts.K ?? 1);
    this.x = x;
    this.y = game.terrain.surfaceY(x);
    this.vx = 0;
    this.facing = -1;
    this.faceT = -1;
    this.turnFrom = -1;          // the facing he is pivoting away from
    this.turnT = 1;              // 0..1 through the pivot; 1 means settled
    this.pose = POSE.IDLE;
    this.poseT = 0;
    this.animT = 0;
    this.t = Math.random() * 10;
    this.moveTo = undefined;
    this.speech = null;
    this.speechT = 0;
    this.shoved = 0;
    this.speed = opts.speed ?? 44;
    this.name = opts.name || 'Someone';
    this.keepAway = opts.keepAway !== false;
    this.face = 0;
    this.mood = 'flat';      // which of the twenty-one he is wearing

    // the body, damped towards whatever the pose wants
    this.b = { crouch: 0, lean: 0, armN0: 1.4, armN1: 0.3, armF0: 1.5, armF1: 0.3, look: 0 };
    this.step = 0;               // phase of the walk cycle
    this.feet = [
      { x, y: this.y, plant: x, air: 0, side: 1 },
      { x, y: this.y, plant: x, air: 0, side: -1 },
    ];
    this.breathe = Math.random() * TAU;
    this.jz = 0;                 // how far off the ground he is
    this.jv = 0;
    this.squash = 0;             // <0 squashed, >0 stretched
    this.hatOff = null;          // the hat, once it has left
    this.shout = 0;              // >0 while the current line is being yelled
    this._seen = new Map();      // what he has already remarked on, and when
    this._cool = 0;              // a breath between remarks
    this._scan = 0;
  }

  get scale() { return 1; }

  /** `mood` picks which of the eight painted faces goes in the bubble. */
  say(text, secs = 4.5, mood = null) {
    this.speech = text;
    this.speechT = secs;
    this.shout = 0;
    this.face = mood !== null ? mood : this._moodFor(text);
    this.mood = this._faceFor(text);
  }

  /**
   * Not everything is said at conversational volume. When something is about
   * to go badly for you he stops narrating and shouts - bigger letters, a
   * bubble with a hard edge on it, and the camera takes a knock. A yell also
   * beats whatever he was in the middle of saying, because that is what
   * yelling is for.
   */
  yell(text, secs = 3.2) {
    this.speech = text;
    this.speechT = secs;
    this.shout = 1;
    this.face = 2;
    this.mood = 'shout';
    this.setPose(POSE.POINT);
    this.game.audio?.play('uiBig', { pitch: 1.3 });
    this.game.cam?.shake(2.2);
    this.jv = Math.min(this.jv - 40, -40);
  }

  /**
   * What he notices. He has been out here eleven years and he is the only
   * one of you who can read the desert, so he says so - once, with a cooldown,
   * and never twice about the same thing in the same minute. This is the
   * difference between an NPC that follows you and one that is with you.
   */
  _watch(dt) {
    if (this.game.state !== 'play' || this.hidden) return;
    this._cool = Math.max(0, (this._cool || 0) - dt);
    this._scan = (this._scan || 0) + dt;
    if (this._scan < 0.6) return;
    this._scan = 0;
    if (this.speech || this._cool > 0) return;

    const g = this.game;
    const c = g.crab;
    const near = Math.abs(this.x - c.x) < 220;
    if (!near && !this.riding) return;

    // -- the ones that are shouted ------------------------------------------
    const foe = g.wildlife?.nearest
      ? g.wildlife.nearest(c.x, c.y, 130, (q) => q.alive && q.hostile && !q.tamed)
      : null;
    if (foe && this._once('foe:' + (foe.uid ?? foe.def.id), 26)) {
      this.yell(`BEHIND YOU - ${String(foe.def.name).toUpperCase()}!`);
      return;
    }
    if (c.hp < c.hpMax * 0.3 && this._once('hurt', 22)) {
      this.yell('YOU ARE BLEEDING. GET AWAY FROM IT.');
      return;
    }
    if (g.weather && g.weather.sand > 0.55 && this._once('storm', 90)) {
      this.yell('SAND COMING - PUT YOUR FACE DOWN!');
      return;
    }

    // -- and the ones that are only remarks ---------------------------------
    const e = g.economy;
    if (e && e.water < 12 && this._once('dry', 40)) {
      this.say('You are nearly dry. Work the valve - the band pays, the middle pays double.', 5);
      return;
    }
    const wilting = g.garden?.plots?.find((p) => p.plant && p.plant.thirst > 0.75);
    if (wilting && this._once('wilt', 45)) {
      this.say(`That ${wilting.plant.def.name} is going. Water it or lose it.`, 5);
      return;
    }
    const seam = g.mining?.near ? g.mining.near(c.x, 30)[0] : null;
    if (seam && this._once('seam:' + seam.ci, 70)) {
      const ore = ITEM_BY_ID[seam.ore.id];
      this.say(`${ore ? ore.name : 'Ore'} under you. Dig straight down and swing at it.`, 5);
      return;
    }
    const site = g.digs?.near ? g.digs.near(c.x, 34)[0] : null;
    if (site && this._once('dig:' + site.ci, 70)) {
      this.say(`Stop. That is ${site.relic.name} - and it should not be this far up.`, 5.5);
      return;
    }
    const bird = g.wildlife?.nearest
      ? g.wildlife.nearest(c.x, c.y, 90, (q) => q.alive && !q.tamed && !q.hostile && q.trust > 0.5)
      : null;
    if (bird && this._once('sing:' + (bird.uid ?? bird.def.id), 50)) {
      this.say(`It is waiting for you. Sing at it - it will give you the phrase first.`, 5);
      return;
    }
    if (g.weather && g.weather.hour > 20.5 && this._once('night:' + (g.day | 0), 200)) {
      this.say('Dark. Things come out that do not come out in the day.', 4.5);
    }
  }

  /** Has this not been said for `secs`? Marks it said if so. */
  _once(key, secs) {
    if (!(this._seen instanceof Map)) this._seen = new Map();
    const now = this.game.time;
    const prev = this._seen.get(key);
    if (prev !== undefined && now - prev < secs) return false;
    this._seen.set(key, now);
    this._cool = 6;
    return true;
  }

  _moodFor(text) {
    const t = String(text);
    if (/[!?]{2}|NOT A ROCK|TAPPING/.test(t)) return 2;
    if (/\?/.test(t)) return 5;
    if (/water|Water|spring|oasis|green|came up/.test(t)) return 3;
    if (/no |No |not |cannot|idiot|too much/.test(t)) return 4;
    if (/thousand|eleven years|notes|writing/.test(t)) return 6;
    if (/^\.\.\./.test(t)) return 7;
    return (Math.abs(t.length * 7) % 3);
  }

  /**
   * Which of the twenty-one faces a line wears. The painted head in the
   * desert only has four numbers to move, so it keeps `face`; this is the
   * close-up, and a close-up can afford to be specific about the difference
   * between annoyed and actually shouting.
   */
  _faceFor(text) {
    const t = String(text);
    if (this.shout > 0) return 'shout';
    if ((this.game.mind?.blue || 0) > 0.35) return 'spore';
    if (/[!?]{2}|NOT A ROCK|TAPPING/.test(t)) return 'gasp';
    if (/idiot|no |No |not |never|cannot|stop|do not/.test(t)) return 'scowl';
    if (/water|spring|oasis|green|came up|alive|soil/.test(t)) return 'grin';
    if (/ha|Ha|funny|beautiful|look at/.test(t)) return 'laugh';
    if (/\?/.test(t)) return 'peer';
    if (/thousand|eleven years|notes|writing|record|measure/.test(t)) return 'squint';
    if (/^\.\.\.|tired|sleep|late|enough for today/.test(t)) return 'tired';
    if (/sorry|afraid|gone|dead|lost/.test(t)) return 'sad';
    if (/bottle|beer|drink/.test(t)) return 'drink';
    return ['flat', 'talk', 'smug'][Math.abs(t.length * 7) % 3];
  }

  /**
   * His face for a card. This is his own portrait sheet now rather than the
   * painted head - twenty-one expressions he actually has, on the game's
   * grid - so what he thinks of you is something you can see. The painted
   * head is still what stands in the desert; this is only ever a close-up.
   */
  portrait(scale = 1) {
    return facePortrait(this.mood || 'flat', scale, (this.game.mind?.blue || 0) > 0.35 ? 1 : 0);
  }

  setPose(p) { if (this.pose !== p) { this.pose = p; this.animT = 0; } this.poseT = 0; }

  // -------------------------------------------------------------------------

  update(dt) {
    const t = this.game.terrain;
    this.t += dt;
    this.poseT += dt;
    this.animT += dt;
    this.breathe += dt * 1.3;
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) { this.speech = null; this.shout = 0; } }
    this._watch(dt);

    const crab = this.game.crab;
    if (this.keepAway && crab && this.game.state === 'play') {
      const gap = this.x - crab.x;
      const room = 24 + crab.m.shellW * 0.5;
      if (Math.abs(gap) < room) {
        this.moveTo = crab.x + Math.sign(gap || 1) * (room + 16);
        this.shoved += dt;
        if (this.shoved > 1.4 && !this.speech) {
          this.shoved = -6;
          this.say(['Yes - moving, moving.', 'You do not stop, do you.',
            'Mind the notebook.', 'I am a person, not terrain.'][Math.floor(Math.random() * 4)], 3);
        }
      } else if (this.shoved > 0) this.shoved = 0;
    }

    let want = 0;
    // Driven directly - which only happens while the spore has him - beats
    // anything he was walking towards on his own.
    if (this.driveX) {
      want = clamp(this.driveX, -1, 1);
      this.moveTo = undefined;
      this.setPose(POSE.WALK);
    } else if (this.moveTo !== undefined) {
      const d = this.moveTo - this.x;
      if (Math.abs(d) > 4) { want = Math.sign(d); this.setPose(POSE.WALK); }
      else if (this.pose === POSE.WALK) { this.setPose(POSE.IDLE); this.moveTo = undefined; }
    } else if (this.mode === 'owned' && this.pose === POSE.WALK) {
      this.setPose(POSE.IDLE);
    }
    this.vx = damp(this.vx, want * this.speed, 0.0004, dt);
    this.x += this.vx * dt;
    if (Math.abs(this.vx) > 5) this.setFacing(Math.sign(this.vx));
    this._turn(dt);
    this.y = damp(this.y, t.surfaceY(this.x), 0.0004, dt);

    this._settle(dt);
    this._air(dt, t);
    this._walkFeet(dt, t);

  }

  /**
   * Turning round. He does not flip: he pivots. The facing runs on its own
   * short clock rather than on a damp, so every turn takes the same time and
   * ends cleanly, and the body only ever narrows to a bit over half width -
   * enough to read as turning through, never so thin it looks like a card
   * being flipped over.
   */
  setFacing(f) {
    if (f === this.facing) return;
    this.turnFrom = this.faceT;
    this.facing = f;
    this.turnT = 0;
  }

  _turn(dt) {
    if (this.turnT >= 1) { this.faceT = this.facing; return; }
    this.turnT = Math.min(1, this.turnT + dt / TURN_SECS);
    const k = this.turnT;
    // ease in and out, so the pivot starts and finishes without a corner
    const e = k * k * (3 - 2 * k);
    this.faceT = lerp(this.turnFrom, this.facing, e);
    // a scuff of dust halfway through, which is where the weight goes over
    if (!this.turnPuffed && k > 0.5) {
      this.turnPuffed = true;
      this.game.fx?.dust(this.x, this.y, 0.5);
    }
    if (k >= 1) this.turnPuffed = false;
  }

  /** Ease the body towards whatever the current pose asks for. */
  _settle(dt) {
    const P = POSES[this.pose] || POSES.idle;
    const b = this.b;
    const rate = 0.0006;
    b.crouch = damp(b.crouch, P.crouch, rate, dt);
    b.lean = damp(b.lean, P.lean, rate, dt);
    // a bit of life in the arms while he is working or talking
    const w = (P.work || 0) * Math.sin(this.animT * (this.pose === POSE.DIG ? 7.5 : 4.2));
    b.armN0 = damp(b.armN0, P.armN[0] + w * 0.34, rate, dt);
    b.armN1 = damp(b.armN1, P.armN[1] - w * 0.28, rate, dt);
    b.armF0 = damp(b.armF0, P.armF[0] + w * 0.12, rate, dt);
    b.armF1 = damp(b.armF1, P.armF[1] - w * 0.10, rate, dt);
    b.look = damp(b.look, P.face || 0, 0.0012, dt);
  }

  /**
   * Off the ground, and the hat that is no longer on his head. Both exist
   * for exactly one gag, and the gag is worth it.
   */
  _air(dt, terr) {
    if (this.jz > 0 || this.jv !== 0) {
      this.jv -= 520 * dt;
      this.jz += this.jv * dt;
      if (this.jz <= 0) {
        // the landing: a hard squash that springs back
        if (this.jv < -60) { this.squash = -0.34; this.game.fx?.dust(this.x, this.y, 1.6); }
        this.jz = 0; this.jv = 0;
      }
      this.squash = damp(this.squash, this.jv > 40 ? 0.18 : 0, 0.0008, dt);
    } else this.squash = damp(this.squash, 0, 0.0009, dt);

    const h = this.hatOff;
    if (h) {
      h.t += dt;
      h.vy += 340 * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.spin * dt;
      const gy = terr.surfaceY(h.x);
      if (h.y >= gy) {
        h.y = gy; h.vy *= -0.34; h.vx *= 0.5; h.spin *= 0.4;
        if (Math.abs(h.vy) < 18) { h.vy = 0; h.vx = 0; h.spin = 0; h.rot = 0.18; h.down = true; }
      }
      if (h.t > 30) this.hatOff = null;
    }
  }

  /** The whole cartoon: straight up, hat off, face open. */
  startle(power = 1) {
    this.jv = 150 * power;
    this.jz = 0.01;
    this.squash = 0.24;
    this.setPose(POSE.SHOCK);
    this.face = 8;
    this.mood = 'gasp';
    if (!this.hatOff) {
      this.hatOff = {
        x: this.x, y: this.y - 26 * this.rig.K, t: 0,
        vx: -this.facing * (16 + Math.random() * 16), vy: -150 * power,
        rot: 0, spin: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4),
      };
    }
    this.game.audio?.play('hurt', { pitch: 1.6 });
  }

  /**
   * The gait. Feet are driven by one phase rather than by how far they have
   * drifted from a home position: at any moment one foot is planted and the
   * other is swinging past it, and they swap every half cycle. That swap is
   * the whole difference between walking and skating, and the phase advances
   * with distance covered rather than with time, so the feet never slide.
   */
  _walkFeet(dt, terr) {
    const K = this.rig.K;
    // The distance between the two feet at the moment one lands and the other
    // lifts. A full cycle covers twice this, which is why the phase below
    // advances against `stride * 2`.
    const stride = 9 * K;
    const spd = Math.abs(this.vx);
    const moving = spd > 5;
    const tuck = 1 - this.b.crouch * 0.62;

    // in the air the feet come up with him, tucked under the hips, or he
    // reads as a person being dragged upward rather than one jumping
    if (this.jz > 0.5) {
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        f.air = 0;
        f.x = damp(f.x, this.x + (i === 0 ? 1 : -1) * stride * 0.20, 0.0001, dt);
        f.y = damp(f.y, this.y - this.jz * 0.55, 0.0001, dt);
        f.plant = f.x;
      }
      return;
    }

    if (moving) this.step = (this.step + (spd * dt) / (stride * 2)) % 1;
    else this.step = (this.step + dt * 0.35) % 1;     // keeps a slow idle sway

    const dir = Math.sign(this.vx) || this.facing || 1;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const p = (this.step + i * 0.5) % 1;
      const swinging = moving && p >= 0.5;

      if (!moving) {
        // standing: one foot a little ahead of the other, both on the ground
        const tx = this.x + (i === 0 ? 1 : -1) * stride * 0.26 * tuck * (this.facing || 1);
        f.x = damp(f.x, tx, 0.002, dt);
        f.y = damp(f.y, terr.surfaceY(f.x), 0.0006, dt);
        f.plant = f.x;
        f.air = 0;
        f.sw = false;
        continue;
      }

      if (swinging && !f.sw) {
        // The swing starts here: remember where the foot was and pick where it
        // is going, once, so the arc is smooth all the way through.
        //
        // The target is a stride and a half ahead of where the hip is NOW,
        // because the hip travels a whole stride while the foot is in the air.
        // Aim any shorter and the foot lands behind the hip and then drags
        // further back all through the stance - which is a person walking
        // backwards, whichever way they are facing.
        f.from = f.x;
        f.to = this.x + dir * stride * 1.5 * tuck + this.vx * 0.05;
        f.sw = true;
      } else if (!swinging && f.sw) {
        f.sw = false;
        f.x = f.to ?? f.x;
        f.plant = f.x;
        this._land(f, terr);
      }

      if (swinging) {
        const k = (p - 0.5) * 2;
        const e = k * k * (3 - 2 * k);
        f.x = lerp(f.from, f.to, e);
        f.air = Math.sin(k * Math.PI) * 5.2 * K;
        f.y = terr.surfaceY(f.x) - f.air;
      } else {
        // planted: the body walks over it and it does not move at all
        f.air = 0;
        f.x = f.plant;
        f.y = terr.surfaceY(f.x);
      }
    }
  }

  /** A boot going down: a little dust, and a sound if he is moving. */
  _land(f, terr) {
    if (Math.abs(this.vx) < 16) return;
    this.game.fx?.footPuff(f.x, terr.surfaceY(f.x), Math.abs(this.vx) * 0.35, false);
  }

  // -------------------------------------------------------------------------

  /**
   * Him, on the ground, as a sprite.
   *
   * This used to solve a skeleton every frame and hang eleven shaded blobs off
   * it. It draws two canvases now: a body frame off the sheet, and his head
   * stamped on that frame's neck pixel. Everything that was an angle is a
   * frame instead, which is what a thirty-pixel person can actually show.
   *
   * The three things that survived the rig are the three that matter: he
   * pivots on the spot instead of mirroring (a squash through the turn), he
   * squashes and stretches off the ground, and his head still tilts - but in
   * whole steps, because a drawn sprite does not survive being rotated far.
   */
  draw(ctx, cam) {
    const z = cam.zoom;
    const P = POSES[this.pose] || POSES.idle;
    const dir = this.faceT >= 0 ? 1 : -1;
    const t = Math.abs(this.faceT);
    const flat = TURN_MIN + (1 - TURN_MIN) * (t * t * (3 - 2 * t));
    const px = Math.max(1, Math.round(z));
    const blue = this.game.mind ? this.game.mind.blue : 0;
    const spore = blue > 0.35 ? clamp01((blue - 0.35) / 0.4) : 0;

    // the shadow he stands in
    const sa = this.game.weather ? this.game.weather.shadowAlpha : 0.35;
    if (sa > 0.02) {
      const s0 = cam.worldToScreen(this.x, this.y);
      ctx.globalAlpha = sa * 0.5;
      ctx.fillStyle = '#2a1a10';
      pxEllipse(ctx, s0.x, s0.y, 7 * z, 2 * z, '#2a1a10', { p: px });
      ctx.globalAlpha = 1;
    }

    // the hat, if it is no longer on his head
    if (this.hatOff) {
      const h = this.hatOff;
      const hs = cam.worldToScreen(h.x, h.y);
      const art = this.rig.hat;
      ctx.save();
      ctx.translate(Math.round(hs.x), Math.round(hs.y));
      ctx.scale(z, z);
      ctx.rotate(h.rot);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }

    // which frame, and where his feet are
    const name = frameFor(this.pose, this.step % 1);
    const body = bodyFrame(name, px, { kind: this.kind, spore });
    const neck = NECK[name] || NECK.stand;
    const hand = HAND[name] || HAND.stand;
    const head = headSide(px, {
      kind: this.kind, mood: this.face | 0,
      goggles: P.tool === 'lens' || P.tool === 'canteen',
      noHat: !!this.hatOff, spore: spore > 0.5,
    });

    const bob = Math.abs(this.vx) > 6 ? Math.sin(this.step * TAU * 2) * 0.9 : 0;
    const breath = Math.sin(this.breathe) * 0.35;
    const s = cam.worldToScreen(this.x, this.y + bob - this.jz);

    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    // turning is a squash, not a mirror: he pivots on the spot
    ctx.scale(dir * flat, 1);
    if (Math.abs(this.squash) > 0.005) ctx.scale(1 - this.squash * 0.5, 1 + this.squash);

    // the body sits with its bottom row on the ground
    const bx = -(BODY_W / 2) * px;
    const by = -(BODY_H - 1) * px + Math.round(breath) * px;
    ctx.drawImage(body, Math.round(bx), Math.round(by));

    // the head, on the neck pixel, tilted in whole steps
    const hx = bx + neck.x * px;
    const hy = by + neck.y * px;
    // A drawn head does not get rotated. Rotating it staircases the brim and
    // doubles the outline, which is exactly the mush this whole sheet exists
    // to get rid of. So leaning is a whole-pixel OFFSET instead: he puts his
    // head forward over the work, and down a pixel when he is tired.
    const want = this.b.lean * 0.4 + this.b.look * 0.22
      + (this.speech ? Math.sin(this.t * 5.5) * 0.035 : 0)
      + (P.work ? Math.sin(this.animT * 4.0) * 0.05 : 0);
    const nod = clamp(Math.round(want * 5), -2, 2);
    ctx.drawImage(head.cv,
      Math.round(hx) - head.ox + nod * px,
      Math.round(hy) - head.oy + Math.max(0, nod) * px);

    // and whatever is in his hand
    const tool = P.tool && this.rig.props[P.tool];
    if (tool) {
      ctx.save();
      ctx.translate(Math.round(bx + hand.x * px), Math.round(by + hand.y * px));
      ctx.scale(px, px);
      ctx.rotate(P.tool === 'canteen' ? -1.5 : P.tool === 'beer' ? -1.15
        : P.tool === 'peg' ? 1.2 : -0.25);
      ctx.drawImage(tool.cv, -tool.ox, -tool.oy);
      ctx.restore();
    }
    if (P.hold && this.rig.props[P.hold]) {
      const art = this.rig.props[P.hold];
      ctx.save();
      ctx.translate(Math.round(bx + 11 * px), Math.round(by + 7 * px));
      ctx.scale(px, px);
      ctx.rotate(-0.34);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    ctx.restore();
  }

}

/**
 * Dr. Vess: the reason you are awake, and the reason there are field notes.
 *
 * He has three states. On the ground he works - wanders, crouches, digs,
 * writes. Following, he keeps you in sight and complains about the pace.
 * Riding, he is sitting on your shell with his notebook out, which is the
 * only way he gets to write while you are moving.
 */
export class Archaeologist extends Person {
  constructor(game, x) {
    super(game, 'vess', x, { name: 'Dr. Vess', speed: 46, K: 1 });
    this.idleT = 0;
    this.mode = 'work';           // work | follow | ride | owned
    this.rideT = 0;
    this.climb = 0;
    this.chatT = 6;
    this.camp = null;
  }

  get riding() { return this.mode === 'ride'; }

  board() {
    if (this.mode === 'ride') return false;
    const crab = this.game.crab;
    if (!crab || crab.m.t < 0.55) {
      this.say('You are the size of my hand. I would break you.', 4);
      return false;
    }
    this.mode = 'ride';
    this.keepAway = false;
    this.setPose(POSE.SIT);
    this.say('Right. Up I go. Do not throw me off.', 4);
    return true;
  }

  alight() {
    if (this.mode !== 'ride') return false;
    this.mode = 'follow';
    this.keepAway = true;
    this.climb = 0;
    this.setPose(POSE.IDLE);
    this.say('Solid ground. I had forgotten what it was for.', 4);
    return true;
  }

  follow() {
    this.mode = this.mode === 'follow' ? 'work' : 'follow';
    this.keepAway = true;
    this.say(this.mode === 'follow'
      ? 'Lead on. I have eleven years of nothing to make up for.'
      : "I'll work this patch. Shout if you find water.", 4);
    return this.mode === 'follow';
  }

  update(dt) {
    const crab = this.game.crab;
    if (this.mode === 'ride' && crab) {
      this.climb = damp(this.climb, 1, 0.001, dt);
      const seat = crab.shellWorldAB(0.34, 0.66);
      this.x = seat.x;
      this.y = seat.y + 1;
      this.vx = crab.vx;
      this.setFacing(-1);
      this._turn(dt);
      this.t += dt; this.poseT += dt; this.animT += dt; this.breathe += dt * 1.3;
      if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }
      if (this.pose !== POSE.SIT && this.pose !== POSE.WRITE && this.pose !== POSE.TALK) {
        this.setPose(POSE.SIT);
      }
      if (this.poseT > 6 && this.pose === POSE.SIT) this.setPose(POSE.WRITE);
      else if (this.poseT > 8 && this.pose === POSE.WRITE) this.setPose(POSE.SIT);
      this._settle(dt);
      // riding, his feet are on the shell, not the ground
      for (const f of this.feet) { f.x = this.x - 3 * this.rig.K * f.side; f.y = this.y + 1; f.air = 0; }
      this._chatter(dt);
      return;
    }

    if (this.mode === 'follow' && crab) {
      const want = crab.x - Math.sign(crab.vx || 1) * (30 + crab.m.shellW * 0.5);
      if (Math.abs(want - this.x) > 12) this.moveTo = want;
    }

    super.update(dt);
    // during the opening the script owns him: no idle rota, no small talk
    if (this.game.state === 'intro') return;
    // and while the spore has him he has no small talk and no rota either -
    // he does what he is pointed at and nothing else, which is most of what
    // makes it read as wrong
    if (this.mode === 'owned') return;
    this._chatter(dt);

    if (this.mode === 'follow') return;
    // He never just stands there. A rota of things an archaeologist alone in
    // a basin actually does, each one running for as long as it is worth.
    this.idleT -= dt;
    if (this.idleT <= 0 && this.pose !== POSE.WALK) {
      const work = [
        [POSE.DIG, 5.5], [POSE.WRITE, 6.5], [POSE.SURVEY, 4.5],
        [POSE.MEASURE, 4.0], [POSE.SIT, 6.0], [POSE.WANDER, 5.0],
        [POSE.CROUCH, 3.5], [POSE.IDLE, 3.0], [POSE.REST, 5.5],
        [POSE.DRINK, 3.2], [POSE.IDLE_FRONT, 3.0],
      ];
      const [pose, hold] = work[Math.floor(Math.random() * work.length)];
      this.setPose(pose);
      this.idleT = hold * (0.7 + Math.random() * 0.7);
      if (pose === POSE.WANDER) this.moveTo = this.x + (Math.random() - 0.5) * 90;
      if (pose === POSE.DIG) {
        this.game.fx?.digBurst(this.x + this.facing * 6, this.y, 0.8, false);
        this._setUpCamp();
      }
      if (pose === POSE.SURVEY) this.facing = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.pose === POSE.DIG && Math.random() < dt * 2.2) {
      this.game.fx?.digBurst(this.x + this.facing * 6, this.y, 0.45, false);
    }
  }

  /** Drop his kit around wherever he has decided to work. */
  _setUpCamp() {
    if (this.camp && Math.abs(this.camp.x - this.x) < 70) return;
    const items = [];
    const count = 3 + Math.floor(Math.random() * 3);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let k = CAMP_ITEMS[Math.floor(Math.random() * CAMP_ITEMS.length)];
      for (let g = 0; g < 4 && used.has(k); g++) k = CAMP_ITEMS[Math.floor(Math.random() * CAMP_ITEMS.length)];
      used.add(k);
      items.push({ k, dx: (Math.random() - 0.5) * 52, flip: Math.random() < 0.5 });
    }
    this.camp = { x: this.x, items };
  }

  /** He talks. Constantly. That is most of what he is for. */
  _chatter(dt) {
    if (this.speech) { this.chatT = 9 + Math.random() * 12; return; }
    this.chatT -= dt;
    if (this.chatT > 0) return;
    this.chatT = 12 + Math.random() * 16;
    const g = this.game;
    const lines = [];
    if (this.riding) {
      lines.push('You walk like something that has done this for a thousand years.',
        'I can write while you walk. Do you know how rare that is out here?',
        'Left, right, left. Sideways. Always sideways.',
        'From up here I can see three of my old survey pegs. All wrong.');
    }
    // if something is hanging about that will not come aboard, he says why -
    // in a bubble, with the name of the thing it is waiting for
    const shy = g.wildlife.list.find((c) => c.alive && !c.tamed && !c.hostile
      && Math.abs(c.x - g.crab.x) < 220 && g.wildlife.attraction(c.def) < 0.45);
    if (shy && shy.def.attract) {
      const need = shy.def.attract;
      const missing = (need.genes || []).filter((k) => !g.genes.has(k));
      if (missing.length) lines.push(`That ${shy.def.name.toLowerCase()} is waiting for ${missing[0]}. Grow something that makes it.`);
      else if (need.pond && g.garden.pond < need.pond) lines.push(`That ${shy.def.name.toLowerCase()} wants standing water on you. Keep pumping.`);
      else if (need.lush) lines.push(`That ${shy.def.name.toLowerCase()} wants a greener back than that.`);
    }
    if (g.garden.ripeCount) lines.push('Something on your back is ready. I can smell it from here.');
    if (g.garden.overload > 0) lines.push('You are carrying too much. I say that as a person you are also carrying.');
    if (g.garden.listed) lines.push('You are leaning. Move something.');
    if (g.economy.water < 20) lines.push('Your spring is nearly dry. Pump.');
    if (!lines.length) return;
    this.say(lines[Math.floor(Math.random() * lines.length)], 4.5);
  }

  draw(ctx, cam) {
    // his kit goes down first, because he is standing over it
    if (this.camp && this.camp.items.length && !this.riding) {
      const z = cam.zoom;
      for (const it of this.camp.items) {
        const art = this.rig.props[it.k];
        if (!art) continue;
        const x = this.camp.x + it.dx;
        const s = cam.worldToScreen(x, this.game.terrain.surfaceY(x));
        if (s.x < -40 || s.x > this.game.renderer.vw + 40) continue;
        ctx.save();
        ctx.translate(Math.round(s.x), Math.round(s.y));
        ctx.scale(z * (it.flip ? -1 : 1), z);
        ctx.drawImage(art.cv, -art.ox - 4, -art.oy);
        ctx.restore();
      }
    }
    super.draw(ctx, cam);
  }
}

/** The Elder: he has been walking this basin far longer than Vess has. */
export class Elder extends Person {
  constructor(game, x) {
    super(game, 'elder', x, { name: 'The Walker', speed: 30 });
  }
}
