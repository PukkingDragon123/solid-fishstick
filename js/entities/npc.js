// CRABDEN - the people.
//
// Dr. Vess and the Elder are the only hand-drawn things in the game; they are
// drawn from the sheets in assets/, downsampled hard so they sit in the same
// world as everything the painter makes. This class is just a walker and a
// state machine on top of an atlas.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { drawFrame, frameCount, PEOPLE } from '../art/people.js';

export const POSE = {
  IDLE: 'idle', WALK: 'walk', CROUCH: 'crouch', DIG: 'dig',
  WRITE: 'write', POINT: 'point', DRINK: 'drink', WAVE: 'wave',
  SIT: 'sit', TALK: 'talk', WANDER: 'wander', TIRED: 'tired',
};

// pose -> [atlas animation, frames per second, loop]
const ANIM = {
  idle: ['idleSide', 3.5, true],
  walk: ['walkRight', 10, true],
  crouch: ['interact', 3, false],
  dig: ['interact', 6, true],
  write: ['sit', 2.5, true],
  point: ['command', 4, true],
  drink: ['idleFront', 3, true],
  wave: ['talk', 6, true],
  sit: ['sit', 2.2, true],
  talk: ['talk', 5.5, true],
  wander: ['wander', 3, true],
  tired: ['tired', 2, true],
};

export class Person {
  constructor(game, sheet, x, opts = {}) {
    this.game = game;
    this.sheet = sheet;
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
    this.scale = opts.scale ?? 1;
  }

  say(text, secs = 4.5) { this.speech = text; this.speechT = secs; }
  setPose(p) { if (this.pose !== p) { this.pose = p; this.animT = 0; } this.poseT = 0; }

  update(dt) {
    const t = this.game.terrain;
    this.t += dt;
    this.poseT += dt;
    this.animT += dt;
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

    if (Math.abs(this.vx) > 24 && Math.random() < dt * 5) {
      this.game.fx?.footPuff(this.x, this.y, Math.abs(this.vx) * 0.4, false);
    }
  }

  /** Which atlas animation and frame is showing right now. */
  frameNow() {
    let [anim, fps, loop] = ANIM[this.pose] || ANIM.idle;
    if (anim === 'walkRight') anim = this.facing < 0 ? 'walkLeft' : 'walkRight';
    const n = frameCount(this.sheet, anim) || 1;
    let i = Math.floor(this.animT * fps);
    if (!loop) i = Math.min(i, n - 1);
    return { anim, i };
  }

  draw(ctx, cam) {
    const s = cam.worldToScreen(this.x, this.y);
    const z = cam.zoom;
    const sa = this.game.weather ? this.game.weather.shadowAlpha : 0.35;
    if (sa > 0.02) {
      ctx.globalAlpha = sa * 0.5;
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 7 * z, 2 * z, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const { anim, i } = this.frameNow();
    // walk frames already face the right way; everything else is mirrored
    const mirror = anim.startsWith('walk') ? false : this.facing < 0;
    drawFrame(ctx, this.sheet, anim, i, s.x, s.y, mirror, z * this.scale);
  }
}

/** Dr. Vess: the reason you are awake, and the reason there are field notes. */
export class Archaeologist extends Person {
  constructor(game, x) {
    super(game, 'vess', x, { name: 'Dr. Vess', speed: 46 });
    this.idleT = 0;
  }

  update(dt) {
    super.update(dt);
    // she does not stand still: she wanders, crouches at things, writes
    if (this.pose === POSE.IDLE || this.pose === POSE.WANDER) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 3 + Math.random() * 6;
        const roll = Math.random();
        this.setPose(roll < 0.34 ? POSE.WANDER : roll < 0.6 ? POSE.SIT
          : roll < 0.8 ? POSE.DIG : POSE.IDLE);
        if (this.pose === POSE.DIG) {
          this.game.fx?.dust(this.x + this.facing * 6, this.y, 1.2);
        }
      }
    } else if (this.pose !== POSE.WALK && this.poseT > 4.5) {
      this.setPose(POSE.IDLE);
      this.idleT = 2 + Math.random() * 4;
    }
  }
}

/** The Elder: he has been walking this basin far longer than Vess has. */
export class Elder extends Person {
  constructor(game, x) {
    super(game, 'elder', x, { name: 'The Walker', speed: 30, scale: 1 });
  }
}
