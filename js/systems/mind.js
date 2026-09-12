// CRABDEN - taking her over.
//
// This is the ugliest thing in the game and it is meant to be. You are a
// mindcap host with no hands, she is a person with two of them, and the
// parasite you have been growing on your own back does one thing very well.
//
// It takes three steps, on purpose, so that none of it happens by accident:
//
//   LURE    put something down she cannot walk past. She comes to look at it
//           and crouches over it, which is the only time her head is low
//           enough and still enough to hit.
//   SPRAY   a cloud, at close range, while she is down. It takes a moment to
//           reach her and there is a beat where she knows.
//   OWNED   the eye goes blue and stays blue. She walks where you point her,
//           swings the pick you made her, works the bench and plants on your
//           back - and everything she does, she does with her hands, which is
//           the entire point.
//
// You can let her go. She does not remember it, and she does not forgive it
// either, because there is nothing there to do the forgiving.

import { clamp, clamp01, damp, lerp, TAU } from '../lib/math.js';
import { POSE } from '../entities/npc.js';

const LURE_RANGE = 22;        // how close to the bait counts as "at it"
const SPRAY_RANGE = 60;       // how close you have to be to spray her
const DOSE_SECS = 2.6;        // cloud to blue eye

export class Mind {
  constructor(game) {
    this.game = game;
    this.stage = 'free';      // free | lured | dosing | owned
    this.bait = null;         // { x, y, t }
    this.doseT = 0;
    this.blue = 0;            // 0..1, how far the eye has gone over
    this.cloud = 0;           // the spray still hanging in the air
    this.cloudX = 0;
    this.cloudY = 0;
    this.work = null;         // what she is doing under orders
    this.workT = 0;
  }

  get npc() { return this.game.npc; }
  get owned() { return this.stage === 'owned'; }

  // -- step one: the lure ---------------------------------------------------

  /**
   * Put bait down. Anything she has not catalogued will do, and you have a
   * pack full of things nobody has catalogued.
   */
  lure(x) {
    if (this.stage !== 'free') return { ok: false, why: 'She is already coming.' };
    const relic = Object.keys(this.game.relics || {}).find((k) => this.game.relics[k] > 0);
    if (!relic) return { ok: false, why: 'Nothing she would cross a desert for. Dig something up.' };
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

  /** Is she down over the bait with her head where you can reach it? */
  get ready() {
    if (this.stage !== 'lured' || !this.bait) return false;
    const n = this.npc;
    return Math.abs(n.x - this.bait.x) < LURE_RANGE && n.pose === POSE.CROUCH;
  }

  // -- step two: the spray --------------------------------------------------

  spray() {
    if (this.stage === 'owned') return { ok: false, why: 'She is already yours.' };
    if (this.stage === 'dosing') return { ok: false, why: 'It is already in her.' };
    const e = this.game.economy;
    if (e.parasites < 1) return { ok: false, why: 'No spore. Grow a mindcap and pick it.' };
    const n = this.npc;
    const d = Math.abs(n.x - this.game.crab.x);
    if (d > SPRAY_RANGE + this.game.crab.m.shellW * 0.5) {
      return { ok: false, why: 'Too far. She has to be right up against you.' };
    }
    if (!this.ready) return { ok: false, why: 'Not while she is standing. Put bait down and wait.' };
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

  // -- step three: hers no longer -------------------------------------------

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

  // -- what she does while you have her -------------------------------------

  /** Send her at the nearest seam and let her work it. */
  order(kind, x) {
    if (!this.owned) return { ok: false, why: 'She is not yours.' };
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

    if (this.stage === 'lured' && this.bait) {
      this.bait.t += dt;
      // once she gets there she goes down over it and stays down
      if (Math.abs(n.x - this.bait.x) < LURE_RANGE) {
        n.moveTo = undefined;
        if (n.pose !== POSE.CROUCH) { n.setPose(POSE.CROUCH); n.setFacing(Math.sign(this.bait.x - n.x) || 1); }
        if (this.bait.t > 22) {       // she does not stay down for ever
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
      // she knows, for about a second, and then she does not
      if (this.doseT > 0.5 && this.doseT - dt <= 0.5) n.setPose(POSE.TIRED);
      if (Math.random() < dt * 14) {
        g.fx?.drift(n.x + (Math.random() - 0.5) * 10, n.y - 14 - Math.random() * 8, '#c98ade', 1);
      }
      if (k >= 1) {
        this.stage = 'owned';
        this.blue = 1;
        this.bait = null;
        n.mode = 'owned';
        n.keepAway = false;
        n.setPose(POSE.IDLE);
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
      ctx.fillStyle = '#e2b74a';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.4, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#b79a5e';
      ctx.beginPath(); ctx.ellipse(0, -1.6, 3.2, 2.2, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e4d6b4';
      ctx.fillRect(-1, -2.6, 2, 1);
      ctx.restore();
    }
    if (this.cloud > 0.01) {
      const s = cam.worldToScreen(this.cloudX, this.cloudY);
      const z = cam.zoom;
      const r = lerp(6, 26, 1 - this.cloud) * z;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(201,138,222,${0.42 * this.cloud})`);
      g.addColorStop(1, 'rgba(201,138,222,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    }
  }

  toJSON() { return { stage: this.stage === 'dosing' ? 'free' : this.stage }; }

  fromJSON(d) {
    if (!d) return;
    this.stage = d.stage === 'owned' ? 'owned' : 'free';
    this.blue = this.stage === 'owned' ? 1 : 0;
    if (this.stage === 'owned') { this.npc.mode = 'owned'; this.npc.keepAway = false; }
  }
}
