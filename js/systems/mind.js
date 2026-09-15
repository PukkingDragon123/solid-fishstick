// CRABDEN - taking him over.
//
// This is the ugliest thing in the game and it is meant to be. You are a
// mindcap host with no hands, he is a person with two of them, and the
// parasite you have been growing on your own back does one thing very well.
//
// It takes three steps, on purpose, so that none of it happens by accident:
//
//   LURE    put something down he cannot walk past. He comes to look at it
//           and crouches over it, which is the only time his head is low
//           enough and still enough to hit.
//   SPRAY   a cloud, at close range, while he is down. It takes a moment to
//           reach him and there is a beat where he knows.
//   OWNED   the eye goes blue and stays blue. He walks where you point him,
//           swings the pick you made him, works the bench and plants on your
//           back - and everything he does, he does with his hands, which is
//           the entire point.
//
// You can let him go. He does not remember it, and he does not forgive it
// either, because there is nothing there to do the forgiving.

import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';
import { pxGlow, pxEllipse, pxSize } from '../render/pix.js';
import { POSE } from '../entities/npc.js';

const LURE_RANGE = 22;        // how close to the bait counts as "at it"
const SPRAY_RANGE = 60;       // how close you have to be to spray him
const DOSE_SECS = 2.6;        // cloud to blue eye
const DOWN_SECS = 3.4;        // and then he is on the ground, fighting it

export class Mind {
  constructor(game) {
    this.game = game;
    this.stage = 'free';      // free | lured | dosing | down | owned
    this.downT = 0;
    this.bait = null;         // { x, y, t }
    this.doseT = 0;
    this.blue = 0;            // 0..1, how far the eye has gone over
    this.cloud = 0;           // the spray still hanging in the air
    this.cloudX = 0;
    this.cloudY = 0;
    this.work = null;         // what he is doing under orders
    this.workT = 0;
    this.lean = 0;            // how long he will stay down in front of you
  }

  get npc() { return this.game.npc; }
  get owned() { return this.stage === 'owned'; }
  /** On the ground with it going through him - not yours yet, not free either. */
  get downed() { return this.stage === 'down'; }

  // -- step one: the lure ---------------------------------------------------

  /**
   * Put bait down. Anything he has not catalogued will do, and you have a
   * pack full of things nobody has catalogued.
   */
  lure(x) {
    if (this.stage !== 'free') return { ok: false, why: 'He is already coming.' };
    const relic = Object.keys(this.game.relics || {}).find((k) => this.game.relics[k] > 0);
    if (!relic) return { ok: false, why: 'Nothing he would cross a desert for. Dig something up.' };
    this.game.relics[relic]--;
    if (!this.game.relics[relic]) delete this.game.relics[relic];
    this.bait = { x, y: this.game.terrain.surfaceY(x), t: 0, id: relic };
    this.stage = 'lured';
    const n = this.npc;
    n.mode = 'free';
    n.keepAway = false;
    n.moveTo = x + 12;
    n.say('Hold on. That should not be lying on the surface.', 4, 5);
    this.game.fx?.spark(x, this.bait.y - 3, '#e2b74a', 10, 26);
    return { ok: true };
  }

  /** Is he down over the bait with his head where you can reach it? */
  get ready() {
    if (this.stage !== 'lured') return false;
    const n = this.npc;
    // leaning in over you counts the same as crouching over a relic: what
    // matters is that his head is low and near, not why it is
    if ((this.lean || 0) > 0) {
      return Math.abs(n.x - this.game.crab.x) < SPRAY_RANGE;
    }
    if (!this.bait) return false;
    return Math.abs(n.x - this.bait.x) < LURE_RANGE && n.pose === POSE.CROUCH;
  }

  /**
   * The second way in, and the one anybody finds first: you asked him to come
   * closer and he did.
   *
   * The bait route needs a relic in your pack and a patch of sand to put it
   * on, which is a lot of rules to discover by accident. Talking to somebody
   * is not. So a conversation puts him at arm's length, and asking him to
   * lean in puts his head at the height of your gland - for a while. He does
   * straighten up again; he is suspicious, not stupid.
   */
  leanIn(secs = 11) {
    if (this.stage === 'owned' || this.stage === 'dosing' || this.stage === 'down') return;
    this.stage = 'lured';
    this.lean = secs;
    const n = this.npc;
    n.mode = 'free';
    n.keepAway = false;
    n.moveTo = this.game.crab.x + Math.sign(n.x - this.game.crab.x || 1) * 20;
    n.setPose(POSE.CROUCH);
    this.game.fx?.spark(n.x, n.y - 10, '#9ad4c8', 6, 18);
  }

  // -- step two: the spray --------------------------------------------------

  spray() {
    if (this.stage === 'owned') return { ok: false, why: 'He is already yours.' };
    if (this.stage === 'dosing' || this.stage === 'down') return { ok: false, why: 'It is already in him.' };
    const e = this.game.economy;
    if (e.parasites < 1) return { ok: false, why: 'No spore. Grow a mindcap and pick it.' };
    const n = this.npc;
    const d = Math.abs(n.x - this.game.crab.x);
    if (d > SPRAY_RANGE + this.game.crab.m.shellW * 0.5) {
      return { ok: false, why: 'Too far. He has to be right up against you.' };
    }
    if (!this.ready) {
      return { ok: false, why: 'Not while he is standing. Talk to him and ask him to come closer.' };
    }
    e.parasites--;
    e.markDirty();
    this.stage = 'dosing';
    this.doseT = 0;
    this.cloud = 1;
    this.cloudX = n.x;
    this.cloudY = n.y - 12;
    this.game.audio?.play('water', { pitch: 0.6 });
    this.game.fx?.ring(n.x, n.y - 12, '#c98ade', 14);
    n.say('...what is that. What is that smell -', 3, 11);
    return { ok: true };
  }

  // -- step three: not his own any more -------------------------------------------

  release() {
    if (this.stage !== 'owned') return;
    this.stage = 'free';
    this.work = null;
    const n = this.npc;
    n.mode = 'follow';
    n.keepAway = true;
    n.moveTo = undefined;
    n.setPose(POSE.IDLE);
    n.say('...I have lost an hour. Again.', 5, 10);
  }

  // -- what he does while you have him -------------------------------------

  /** Send him at the nearest seam and let him work it. */
  order(kind, x) {
    if (!this.owned) return { ok: false, why: 'He is not yours.' };
    this.work = { kind, x };
    this.workT = 0;
    const n = this.npc;
    if (kind === 'mine') { n.moveTo = x; n.say('', 0); }
    return { ok: true };
  }

  update(dt) {
    const n = this.npc;
    const g = this.game;
    if (this.cloud > 0) this.cloud = Math.max(0, this.cloud - dt * 0.5);

    // he does not stay crouched in front of you indefinitely
    if ((this.lean || 0) > 0) {
      this.lean -= dt;
      if (this.lean <= 0) {
        this.lean = 0;
        if (this.stage === 'lured' && !this.bait) {
          this.stage = 'free';
          n.mode = 'follow';
          n.keepAway = true;
          n.setPose(POSE.IDLE);
          n.say('Nothing. All right. Whatever it was, it has gone.', 3.4, 7);
        }
      } else if (this.stage === 'lured' && !this.bait) {
        // he holds the crouch while it lasts, whatever else he was doing
        n.setPose(POSE.CROUCH);
        n.moveTo = undefined;
      }
    }

    if (this.stage === 'lured' && this.bait) {
      this.bait.t += dt;
      // once he gets there he goes down over it and stays down
      if (Math.abs(n.x - this.bait.x) < LURE_RANGE) {
        n.moveTo = undefined;
        if (n.pose !== POSE.CROUCH) { n.setPose(POSE.CROUCH); n.setFacing(Math.sign(this.bait.x - n.x) || 1); }
        if (this.bait.t > 22) {       // he does not stay down for ever
          this.stage = 'free';
          this.bait = null;
          n.setPose(POSE.IDLE);
          n.mode = 'follow';
          n.keepAway = true;
          n.say('Nothing. Wind must have turned it over.', 4, 4);
        }
      }
    }

    if (this.stage === 'dosing') {
      this.doseT += dt;
      const k = clamp01(this.doseT / DOSE_SECS);
      this.blue = k;
      // he knows, for about a second, and then he does not
      if (this.doseT > 0.5 && this.doseT - dt <= 0.5) n.setPose(POSE.TIRED);
      if (Math.random() < dt * 14) {
        g.fx?.drift(n.x + (Math.random() - 0.5) * 10, n.y - 14 - Math.random() * 8, '#c98ade', 1);
      }
      if (k >= 1) {
        // it does not simply take. His legs go first, and then he is on the
        // ground with it going through him, and that takes a few seconds he
        // spends telling you exactly what he thinks of it.
        this.stage = 'down';
        this.downT = 0;
        this.blue = 1;
        this.bait = null;
        n.mode = 'free';
        n.moveTo = undefined;
        n.keepAway = false;
        n.setPose(POSE.DOWN);
        n.jv = -120;
        n.squash = -0.4;
        n.say('My legs. My legs have stopped - what have you PUT in me -', 3.2, 8);
        g.fx?.ring(n.x, n.y - 14, '#c98ade', 18);
        g.fx?.dust(n.x, n.y, 1.6);
        g.audio?.play('hurt');
        g.cam?.shake(4);
      }
      return;
    }

    if (this.stage === 'down') {
      this.downT += dt;
      const k = clamp01(this.downT / DOWN_SECS);
      // he thrashes, and the thrashing gets weaker
      const fight = 1 - k;
      if (Math.random() < dt * (7 + fight * 16)) {
        g.fx?.dust(n.x + (Math.random() - 0.5) * 16, n.y, 0.3 + fight * 0.5);
        g.fx?.drift(n.x + (Math.random() - 0.5) * 12, n.y - 12 - Math.random() * 10, '#c98ade', 1);
      }
      // the kick: he comes up off the sand and goes back down, less each time
      if (Math.random() < dt * 3.2 * (0.3 + fight)) {
        n.jv = -40 - fight * 70;
        n.squash = -0.25 * fight;
        g.cam?.shake(1.4 * fight);
        g.audio?.play('step');
      }
      if (this.downT > 1.3 && !this._d1) {
        this._d1 = 1;
        n.say('I can see it. I can SEE it, it is in the back of my - ', 2.6, 2);
      }
      if (this.downT > 2.5 && !this._d2) {
        this._d2 = 1;
        n.say('...oh. Oh, that is quieter.', 2.4, 7);
      }
      if (k >= 1) {
        this._d1 = 0; this._d2 = 0;
        this.stage = 'owned';
        this.blue = 1;
        n.mode = 'owned';
        n.keepAway = false;
        n.setPose(POSE.IDLE);
        n.jv = -30;
        n.say('', 0);
        g.fx?.ring(n.x, n.y - 14, '#6fd8ee', 18);
        g.audio?.play('discover');
        g.onOwned?.();
      }
      return;
    }

    if (this.stage !== 'owned') {
      this.blue = damp(this.blue, 0, 0.02, dt);
      return;
    }

    // ---- owned ------------------------------------------------------------
    this.blue = 1;
    const w = this.work;
    if (!w) return;
    this.workT += dt;
    if (w.kind === 'mine') {
      const d = w.x - n.x;
      if (Math.abs(d) > 10) { n.moveTo = w.x; return; }
      n.moveTo = undefined;
      if (n.pose !== POSE.DIG) n.setPose(POSE.DIG);
      // a swing every two-thirds of a second, which is the pose's own rhythm
      if (this.workT > 0.66) {
        this.workT = 0;
        g.mineSwing(n.x + (n.facing || 1) * 8);
      }
    }
  }

  // -- drawing --------------------------------------------------------------

  /** The bait on the ground, and the cloud if it is still hanging about. */
  draw(ctx, cam) {
    if (this.bait) {
      const s = cam.worldToScreen(this.bait.x, this.bait.y - 2);
      const z = cam.zoom;
      const pulse = 0.6 + 0.4 * Math.sin(this.bait.t * 3.4);
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z, z);
      ctx.globalAlpha = 0.35 * pulse;
      pxEllipse(ctx, 0, 0, 6, 2.4, '#e2b74a', { p: 1, soft: 0.3 });
      ctx.globalAlpha = 1;
      pxEllipse(ctx, 0, -1.6, 3.2, 2.2, '#b79a5e', { p: 1 });
      ctx.fillStyle = '#e4d6b4';
      ctx.fillRect(-1, -2.6, 2, 1);
      ctx.restore();
    }
    if (this.cloud > 0.01) {
      const s = cam.worldToScreen(this.cloudX, this.cloudY);
      const z = cam.zoom;
      const r = lerp(6, 26, 1 - this.cloud) * z;
      pxGlow(ctx, s.x, s.y, r, '#c98ade', 0.42 * this.cloud, { p: pxSize(z), steps: 3 });
    }
  }

  toJSON() { return { stage: (this.stage === 'dosing' || this.stage === 'down') ? 'free' : this.stage }; }

  fromJSON(d) {
    if (!d) return;
    this.stage = d.stage === 'owned' ? 'owned' : 'free';
    this.blue = this.stage === 'owned' ? 1 : 0;
    if (this.stage === 'owned') { this.npc.mode = 'owned'; this.npc.keepAway = false; }
  }
}
