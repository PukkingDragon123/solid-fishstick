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
    // The atlas is drawn at twice the world size the character occupies, so
    // she is the same height in the basin as before but made of twice as many
    // pixels - which is the difference between reading as a person and reading
    // as a smear.
    this.scale = opts.scale ?? 0.5;
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
    super(game, 'vess', x, { name: 'Dr. Vess', speed: 46 });
    this.idleT = 0;
    this.mode = 'work';           // work | follow | ride
    this.rideT = 0;
    this.climb = 0;               // 0 on the ground, 1 fully aboard
    this.chatT = 6;
  }

  /** Riding means she is on the shell, so she has to be put somewhere on it. */
  get riding() { return this.mode === 'ride'; }

  board() {
    if (this.mode === 'ride') return false;
    // she is a whole adult human; there has to be a shell worth sitting on
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
      // sat on the near rim of the shell, riding whatever the animal does
      this.climb = damp(this.climb, 1, 0.001, dt);
      const seat = crab.shellWorldAB(0.34, 0.66);
      this.x = seat.x;
      this.y = seat.y + 1;
      this.vx = crab.vx;
      this.facing = -1;
      this.faceT = damp(this.faceT, -1, 0.0008, dt);
      this.t += dt; this.poseT += dt; this.animT += dt;
      if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }
      if (this.pose !== POSE.SIT && this.pose !== POSE.WRITE && this.pose !== POSE.TALK) {
        this.setPose(POSE.SIT);
      }
      if (this.poseT > 6 && this.pose === POSE.SIT) this.setPose(POSE.WRITE);
      else if (this.poseT > 8 && this.pose === POSE.WRITE) this.setPose(POSE.SIT);
      this._chatter(dt);
      return;
    }

    if (this.mode === 'follow' && crab) {
      const want = crab.x - Math.sign(crab.vx || 1) * (30 + crab.m.shellW * 0.5);
      if (Math.abs(want - this.x) > 12) this.moveTo = want;
    }

    super.update(dt);
    this._chatter(dt);

    if (this.mode === 'follow') return;
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
    // riding: drawn on top of the shell, so the crab's own draw has finished
    super.draw(ctx, cam);
  }
}

/** The Elder: he has been walking this basin far longer than Vess has. */
export class Elder extends Person {
  constructor(game, x) {
    super(game, 'elder', x, { name: 'The Walker', speed: 30, scale: 0.52 });
  }
}
