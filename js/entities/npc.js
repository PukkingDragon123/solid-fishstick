// CRABDEN - the people.
//
// Nobody here is a sprite sheet. Dr. Vess is a skeleton with painted parts
// hung off it: pelvis, torso, head, two arms and two legs, each a baked bone
// that gets rotated into place every frame. Her feet are planted in world
// space and solved with the same two-bone IK the crab's legs use, so she
// stands on slopes, steps over them, crouches over a dig with her knees where
// knees go, and writes in a notebook her hand is actually holding.
//
// A pose is a set of joint targets. Everything between poses is damped, so she
// never snaps - she settles.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { ik2 } from './crab.js';
import { buildPerson, portrait } from '../art/personart.js';

export const POSE = {
  IDLE: 'idle', IDLE_FRONT: 'idleFront', IDLE_BACK: 'idleBack',
  WALK: 'walk', CROUCH: 'crouch', DIG: 'dig',
  WRITE: 'write', POINT: 'point', DRINK: 'drink', WAVE: 'wave',
  SIT: 'sit', TALK: 'talk', WANDER: 'wander', TIRED: 'tired',
  SURVEY: 'survey', MEASURE: 'measure', REST: 'rest', SHOCK: 'shock',
};

/**
 * What each pose does to the body.
 *
 *   crouch  0 standing, 1 folded right down over the ground
 *   lean    forward tilt of the spine, in radians
 *   armN/F  [shoulder, elbow] angles for the near and far arm
 *   tool    what is in the near hand
 *   swing   how much the arms swing with the walk
 */
const POSES = {
  idle: { crouch: 0, lean: 0.04, armN: [1.42, 0.30], armF: [1.50, 0.26], swing: 0.25 },
  idleFront: { crouch: 0, lean: 0, armN: [1.36, 0.44], armF: [1.44, 0.40], swing: 0.2, face: 0.35 },
  idleBack: { crouch: 0, lean: -0.05, armN: [1.50, 0.20], armF: [1.56, 0.18], swing: 0.2, face: -0.4 },
  walk: { crouch: 0.04, lean: 0.12, armN: [1.30, 0.42], armF: [1.30, 0.42], swing: 1 },
  wander: { crouch: 0.02, lean: 0.08, armN: [1.38, 0.34], armF: [1.40, 0.30], swing: 0.8 },
  crouch: { crouch: 0.72, lean: 0.46, armN: [0.62, 0.92], armF: [0.86, 0.70], tool: 'brush', swing: 0 },
  dig: { crouch: 0.80, lean: 0.54, armN: [0.40, 1.10], armF: [0.92, 0.66], tool: 'trowel', swing: 0, work: 1 },
  write: { crouch: 0.05, lean: 0.20, armN: [0.74, 1.26], armF: [0.98, 1.12], tool: 'pencil', hold: 'notebook', swing: 0 },
  point: { crouch: 0, lean: 0.02, armN: [-0.34, 0.06], armF: [1.46, 0.28], swing: 0 },
  drink: { crouch: 0.02, lean: -0.06, armN: [0.20, 1.44], armF: [1.48, 0.26], tool: 'canteen', swing: 0 },
  wave: { crouch: 0, lean: 0.02, armN: [-0.90, 0.55], armF: [1.46, 0.28], swing: 0, work: 0.6 },
  sit: { crouch: 1, lean: 0.16, armN: [0.90, 0.96], armF: [1.06, 0.88], swing: 0, sit: 1 },
  talk: { crouch: 0, lean: 0.06, armN: [0.96, 0.86], armF: [1.20, 0.62], swing: 0, work: 0.5 },
  tired: { crouch: 0.30, lean: 0.42, armN: [1.18, 0.72], armF: [1.26, 0.66], swing: 0 },
  survey: { crouch: 0, lean: -0.04, armN: [0.22, 1.30], armF: [1.44, 0.30], tool: 'lens', swing: 0 },
  measure: { crouch: 0.10, lean: 0.22, armN: [0.30, 0.70], armF: [0.50, 0.80], tool: 'peg', swing: 0 },
  rest: { crouch: 0.94, lean: 0.24, armN: [1.00, 0.80], armF: [1.14, 0.74], swing: 0, sit: 1 },
  // both arms straight up, spine back: the shape a person makes when the rock
  // they have been sitting on turns out to be an animal
  shock: { crouch: 0.16, lean: -0.14, armN: [-1.30, -0.30], armF: [-1.46, -0.26], swing: 0 },
};

const CAMP_ITEMS = ['bedroll', 'canteen', 'lantern', 'peg', 'skull', 'spoil', 'pick', 'brush'];

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

    // the body, damped towards whatever the pose wants
    this.b = { crouch: 0, lean: 0, armN0: 1.4, armN1: 0.3, armF0: 1.5, armF1: 0.3, look: 0 };
    this.step = 0;               // phase of the walk cycle
    this.feet = [
      { x, y: this.y, plant: x, air: 0, side: 1 },
      { x, y: this.y, plant: x, air: 0, side: -1 },
    ];
    this.breathe = Math.random() * TAU;
    this.jz = 0;                 // how far off the ground she is
    this.jv = 0;
    this.squash = 0;             // <0 squashed, >0 stretched
    this.hatOff = null;          // the hat, once it has left
  }

  get scale() { return 1; }

  /** `mood` picks which of the eight painted faces goes in the bubble. */
  say(text, secs = 4.5, mood = null) {
    this.speech = text;
    this.speechT = secs;
    this.face = mood !== null ? mood : this._moodFor(text);
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

  portrait() { return portrait(this.kind, this.face); }

  setPose(p) { if (this.pose !== p) { this.pose = p; this.animT = 0; } this.poseT = 0; }

  // -------------------------------------------------------------------------

  update(dt) {
    const t = this.game.terrain;
    this.t += dt;
    this.poseT += dt;
    this.animT += dt;
    this.breathe += dt * 1.3;
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }

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
    if (this.moveTo !== undefined) {
      const d = this.moveTo - this.x;
      if (Math.abs(d) > 4) { want = Math.sign(d); this.setPose(POSE.WALK); }
      else if (this.pose === POSE.WALK) { this.setPose(POSE.IDLE); this.moveTo = undefined; }
    }
    this.vx = damp(this.vx, want * this.speed, 0.0004, dt);
    this.x += this.vx * dt;
    if (Math.abs(this.vx) > 5) this.facing = Math.sign(this.vx);
    this.faceT = damp(this.faceT, this.facing, 0.0008, dt);
    this.y = damp(this.y, t.surfaceY(this.x), 0.0004, dt);

    this._settle(dt);
    this._air(dt, t);
    this._walkFeet(dt, t);

    if (Math.abs(this.vx) > 24 && Math.random() < dt * 5) {
      this.game.fx?.footPuff(this.x, this.y, Math.abs(this.vx) * 0.4, false);
    }
  }

  /** Ease the body towards whatever the current pose asks for. */
  _settle(dt) {
    const P = POSES[this.pose] || POSES.idle;
    const b = this.b;
    const rate = 0.0006;
    b.crouch = damp(b.crouch, P.crouch, rate, dt);
    b.lean = damp(b.lean, P.lean, rate, dt);
    // a bit of life in the arms while she is working or talking
    const w = (P.work || 0) * Math.sin(this.animT * (this.pose === POSE.DIG ? 7.5 : 4.2));
    b.armN0 = damp(b.armN0, P.armN[0] + w * 0.34, rate, dt);
    b.armN1 = damp(b.armN1, P.armN[1] - w * 0.28, rate, dt);
    b.armF0 = damp(b.armF0, P.armF[0] + w * 0.12, rate, dt);
    b.armF1 = damp(b.armF1, P.armF[1] - w * 0.10, rate, dt);
    b.look = damp(b.look, P.face || 0, 0.0012, dt);
  }

  /**
   * Off the ground, and the hat that is no longer on her head. Both exist
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
   * Feet. Each one holds its ground until the hip has walked too far past it,
   * then swings to a new plant. Exactly the way the crab does it, with two
   * legs instead of eight.
   */
  _walkFeet(dt, terr) {
    const stride = 11 * this.rig.K;
    // in the air the feet come up with her, tucked under the hips, or she
    // reads as a person being dragged upward rather than one jumping
    if (this.jz > 0.5) {
      for (let i = 0; i < 2; i++) {
        const f = this.feet[i];
        f.air = 0;
        f.x = damp(f.x, this.x + (i === 0 ? 1 : -1) * stride * 0.22, 0.0001, dt);
        f.y = damp(f.y, this.y - this.jz * 0.55, 0.0001, dt);
        f.plant = f.x;
      }
      return;
    }
    const moving = Math.abs(this.vx) > 6;
    const P = POSES[this.pose] || POSES.idle;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      // the lower she folds, the further under her the feet have to come, or
      // the legs end up stretched out flat instead of tucked under a crouch
      const tuck = 1 - this.b.crouch * 0.62;
      const lead = (this.vx * 0.16
        + (i === 0 ? 1 : -1) * stride * (moving ? 0.45 : 0.30)) * tuck;
      const home = this.x + lead;
      if (f.air > 0) {
        f.air -= dt / 0.24;
        const k = clamp01(1 - f.air);
        f.x = lerp(f.from, f.plant, k);
        f.y = terr.surfaceY(f.x) - Math.sin(k * Math.PI) * 4.5 * this.rig.K;
        if (f.air <= 0) { f.air = 0; f.x = f.plant; f.y = terr.surfaceY(f.x); }
      } else if (Math.abs(f.x - home) > stride * (P.sit ? 0.5 : 0.62) * (1 - this.b.crouch * 0.4)) {
        const other = this.feet[1 - i];
        if (other.air <= 0) {
          f.from = f.x;
          f.plant = home + Math.sign(home - f.x) * stride * 0.30;
          f.air = 1;
        }
      } else {
        f.y = damp(f.y, terr.surfaceY(f.x), 0.0005, dt);
      }
    }
    this.step = moving ? (this.step + dt * Math.abs(this.vx) * 0.09) % 1 : damp(this.step, 0, 0.02, dt);
  }

  // -------------------------------------------------------------------------

  draw(ctx, cam) {
    const rig = this.rig;
    const z = cam.zoom;
    const P = POSES[this.pose] || POSES.idle;
    const dir = this.faceT >= 0 ? 1 : -1;
    const flat = Math.abs(this.faceT);                 // 0 edge-on, 1 full profile

    const sa = this.game.weather ? this.game.weather.shadowAlpha : 0.35;
    if (sa > 0.02) {
      const s0 = cam.worldToScreen(this.x, this.y);
      ctx.globalAlpha = sa * 0.5;
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(s0.x, s0.y, 7 * z, 2 * z, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // the hat, if it is no longer on her head
    if (this.hatOff) {
      const h = this.hatOff;
      const hs = cam.worldToScreen(h.x, h.y);
      const art = rig.hat;
      ctx.save();
      ctx.translate(Math.round(hs.x), Math.round(hs.y));
      ctx.scale(z, z);
      ctx.rotate(h.rot);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }

    // hips: the root of everything, dropped by the crouch and bobbed by the gait
    const drop = this.b.crouch * rig.standH * 0.62;
    const bob = Math.abs(this.vx) > 6 ? Math.sin(this.step * TAU * 2) * 1.1 * rig.K : 0;
    const breath = Math.sin(this.breathe) * 0.35 * rig.K;
    const hipWorldY = this.y - rig.standH + drop + bob - this.jz;
    const s = cam.worldToScreen(this.x, hipWorldY);

    ctx.save();
    ctx.translate(Math.round(s.x * 2) / 2, Math.round(s.y * 2) / 2);
    ctx.scale(z, z);
    // turning is a squash, not a mirror: she pivots on the spot
    ctx.scale(dir * Math.max(0.22, flat), 1);
    // and a jump squashes on the way out and stretches at the top
    if (Math.abs(this.squash) > 0.005) {
      ctx.scale(1 - this.squash * 0.5, 1 + this.squash);
    }

    const lean = this.b.lean;
    const sh = rig.sockets.shoulder, nk = rig.sockets.neck;
    const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });
    const shoulder = rot(sh.x, sh.y, lean);
    const neck = rot(nk.x, nk.y, lean);

    // ---- far leg, far arm, then body, then near leg and arm ---------------
    this._leg(ctx, rig.leg.far, this.feet[1], hipWorldY, dir, -1);
    // the bag is slung behind her, under everything
    const bg = rot(rig.sockets.bag.x, rig.sockets.bag.y, lean);
    ctx.drawImage(rig.satchel.cv, Math.round(bg.x - rig.satchel.ox),
      Math.round(bg.y - rig.satchel.oy + breath));
    this._arm(ctx, rig.arm.far, shoulder, this.b.armF0, this.b.armF1, lean, -1, null);

    ctx.save();
    ctx.rotate(lean);
    ctx.translate(0, breath);
    const T = rig.torso.near;
    ctx.drawImage(T.cv, -T.ox, -T.oy);
    ctx.restore();

    this._head(ctx, neck, lean, breath, flat);
    this._leg(ctx, rig.leg.near, this.feet[0], hipWorldY, dir, 1);
    // whatever she is holding in the other hand sits against the chest
    if (P.hold) {
      const art = rig.props[P.hold];
      if (art) {
        const h = rot(rig.sockets.shoulder.x + 3.8 * rig.K, rig.sockets.shoulder.y + 6.0 * rig.K, lean);
        ctx.save();
        ctx.translate(h.x, h.y + breath);
        ctx.rotate(-0.34);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
      }
    }
    this._arm(ctx, rig.arm.near, shoulder, this.b.armN0, this.b.armN1, lean, 1, P.tool);

    ctx.restore();
  }

  /** One arm, plus whatever is in the hand at the end of it. */
  _arm(ctx, art, sh, a0, a1, lean, side, tool) {
    const rig = this.rig;
    const swing = (POSES[this.pose] || POSES.idle).swing || 0;
    const sw = swing * Math.sin(this.step * TAU + (side > 0 ? Math.PI : 0)) * 0.55;
    const A = a0 + lean + sw;
    const B = A + a1 + Math.abs(sw) * 0.3;
    const u = art.upper, l = art.lower;
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.rotate(A);
    ctx.drawImage(u.cv, -u.ox, -u.oy);
    ctx.translate(u.len, 0);
    ctx.rotate(B - A);
    ctx.drawImage(l.cv, -l.ox, -l.oy);
    if (tool && rig.props[tool]) {
      const p = rig.props[tool];
      ctx.save();
      ctx.translate(l.len + 1.4 * rig.K, 0);
      ctx.rotate(tool === 'canteen' ? -1.5 : tool === 'peg' ? 1.2 : -0.25);
      ctx.drawImage(p.cv, -p.ox, -p.oy);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * One leg, solved to where its foot actually is in the world. `up` folds the
   * knee forward, which is the only thing that separates a person from a bird.
   */
  _leg(ctx, art, foot, hipWorldY, dir, side) {
    const rig = this.rig;
    const hx = rig.sockets.hip.x * side * 0.6;
    const hy = rig.sockets.hip.y;
    // the foot in body space; x flips with the facing squash
    const fx = (foot.x - this.x) * dir + hx * 0.2;
    const fy = (foot.y - hipWorldY);
    const l1 = art.upper.len, l2 = art.lower.len;
    // the ankle is a little above the sole and behind the toe
    const sol = ik2(hx, hy, fx - 0.6 * rig.K, fy - 1.8 * rig.K, l1, l2, 1);
    const u = art.upper, l = art.lower;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(sol.a1);
    ctx.drawImage(u.cv, -u.ox, -u.oy);
    ctx.restore();
    ctx.save();
    ctx.translate(sol.kx, sol.ky);
    ctx.rotate(sol.a2);
    ctx.drawImage(l.cv, -l.ox, -l.oy);
    ctx.restore();
    // the boot is not part of the shin: a foot stays flat whatever the leg
    // above it is doing, and only tips up as it swings through
    const bt = side > 0 ? rig.boot.near : rig.boot.far;
    const ax = sol.kx + Math.cos(sol.a2) * l2, ay = sol.ky + Math.sin(sol.a2) * l2;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(foot.air > 0 ? -0.38 * Math.sin(clamp01(1 - foot.air) * Math.PI) : 0);
    ctx.drawImage(bt.cv, -bt.ox, -bt.oy);
    ctx.restore();
  }

  _head(ctx, neck, lean, breath, flat) {
    const rig = this.rig;
    const P = POSES[this.pose] || POSES.idle;
    // she looks where she is working, and a little at whatever is talking
    const tilt = lean * 0.4 + this.b.look * 0.22
      + (this.speech ? Math.sin(this.t * 5.5) * 0.035 : 0)
      + (P.work ? Math.sin(this.animT * 4.0) * 0.05 : 0);
    const goggles = P.tool === 'lens' || P.tool === 'canteen';
    const art = rig.headFor(this.face | 0, goggles, !!this.hatOff);
    ctx.save();
    ctx.translate(neck.x, neck.y + breath);
    ctx.rotate(tilt);
    ctx.drawImage(art.cv, -art.ox, -art.oy);
    ctx.restore();
  }
}

/**
 * Dr. Vess: the reason you are awake, and the reason there are field notes.
 *
 * She has three states. On the ground she works - wanders, crouches, digs,
 * writes. Following, she keeps you in sight and complains about the pace.
 * Riding, she is sitting on your shell with her notebook out, which is the
 * only way she gets to write while you are moving.
 */
export class Archaeologist extends Person {
  constructor(game, x) {
    super(game, 'vess', x, { name: 'Dr. Vess', speed: 46, K: 1 });
    this.idleT = 0;
    this.mode = 'work';           // work | follow | ride
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
      this.facing = -1;
      this.faceT = damp(this.faceT, -1, 0.0008, dt);
      this.t += dt; this.poseT += dt; this.animT += dt; this.breathe += dt * 1.3;
      if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }
      if (this.pose !== POSE.SIT && this.pose !== POSE.WRITE && this.pose !== POSE.TALK) {
        this.setPose(POSE.SIT);
      }
      if (this.poseT > 6 && this.pose === POSE.SIT) this.setPose(POSE.WRITE);
      else if (this.poseT > 8 && this.pose === POSE.WRITE) this.setPose(POSE.SIT);
      this._settle(dt);
      // riding, her feet are on the shell, not the ground
      for (const f of this.feet) { f.x = this.x - 3 * this.rig.K * f.side; f.y = this.y + 1; f.air = 0; }
      this._chatter(dt);
      return;
    }

    if (this.mode === 'follow' && crab) {
      const want = crab.x - Math.sign(crab.vx || 1) * (30 + crab.m.shellW * 0.5);
      if (Math.abs(want - this.x) > 12) this.moveTo = want;
    }

    super.update(dt);
    // during the opening the script owns her: no idle rota, no small talk
    if (this.game.state === 'intro') return;
    this._chatter(dt);

    if (this.mode === 'follow') return;
    // She never just stands there. A rota of things an archaeologist alone in
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
        this.game.fx?.dust(this.x + this.facing * 6, this.y, 1.2);
        this._setUpCamp();
      }
      if (pose === POSE.SURVEY) this.facing = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.pose === POSE.DIG && Math.random() < dt * 2.2) {
      this.game.fx?.dust(this.x + this.facing * 6, this.y, 0.8);
    }
  }

  /** Drop her kit around wherever she has decided to work. */
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

  /** She talks. Constantly. That is most of what she is for. */
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
    if (g.garden.ripeCount) lines.push('Something on your back is ready. I can smell it from here.');
    if (g.garden.overload > 0) lines.push('You are carrying too much. I say that as a person you are also carrying.');
    if (g.garden.listed) lines.push('You are leaning. Move something.');
    if (g.economy.water < 20) lines.push('Your spring is nearly dry. Pump.');
    if (!lines.length) return;
    this.say(lines[Math.floor(Math.random() * lines.length)], 4.5);
  }

  draw(ctx, cam) {
    // her kit goes down first, because she is standing over it
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
