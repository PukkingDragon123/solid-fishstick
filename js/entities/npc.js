// CRABDEN - Dr. Vess.
//
// The archaeologist who woke you up, by accident, in the least dignified way
// available to a mammal. She has been surveying this basin for eleven years
// and has now found something that walks.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { buildArchaeologist } from '../art/humanart.js';
import { ik2 } from './crab.js';

export const POSE = {
  IDLE: 'idle', WALK: 'walk', CROUCH: 'crouch', DIG: 'dig',
  WRITE: 'write', POINT: 'point', DRINK: 'drink', WAVE: 'wave', SIT: 'sit',
};

export class Archaeologist {
  constructor(game, x) {
    this.game = game;
    this.rig = buildArchaeologist(1);
    this.K = this.rig.K;
    this.x = x;
    this.y = game.terrain.surfaceY(x) - this.rig.standH;
    this.vx = 0;
    this.facing = 1;
    this.faceT = 1;
    this.pose = POSE.IDLE;
    this.poseT = 0;
    this.t = Math.random() * 10;
    this.gait = 0;
    this.bob = 0;
    this.crouch = 0;
    this.armA = [1.34, 1.34];
    this.elbow = [0.3, 0.3];
    this.headA = 0;
    this.prop = null;
    this.moveTo = undefined;
    this.shoved = 0;
    this.speech = null;
    this.speechT = 0;
    this.legs = [
      { far: true, foot: { x, y: 0 }, from: { x, y: 0 }, to: { x, y: 0 }, stepping: false, t: 0, phase: 0.5 },
      { far: false, foot: { x, y: 0 }, from: { x, y: 0 }, to: { x, y: 0 }, stepping: false, t: 0, phase: 0 },
    ];
    for (const l of this.legs) { l.foot.y = game.terrain.surfaceY(x); l.from = { ...l.foot }; l.to = { ...l.foot }; }
  }

  say(text, secs = 4) { this.speech = text; this.speechT = secs; }
  setPose(p, prop = null) { this.pose = p; this.poseT = 0; this.prop = prop; }

  update(dt) {
    const t = this.game.terrain;
    this.t += dt;
    this.poseT += dt;
    if (this.speechT > 0) { this.speechT -= dt; if (this.speechT <= 0) this.speech = null; }

    // she will not be walked over; she steps aside and comments on it
    const crab = this.game.crab;
    if (crab && this.game.state === 'play') {
      const gap = this.x - crab.x;
      const room = 26 + crab.m.shellW * 0.5;
      if (Math.abs(gap) < room) {
        this.moveTo = crab.x + Math.sign(gap || 1) * (room + 14);
        this.shoved = (this.shoved || 0) + dt;
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
      if (Math.abs(d) > 4) { want = Math.sign(d); this.pose = POSE.WALK; }
      else if (this.pose === POSE.WALK) { this.pose = POSE.IDLE; this.moveTo = undefined; }
    }
    this.vx = damp(this.vx, want * 46, 0.0004, dt);
    this.x += this.vx * dt;
    if (Math.abs(this.vx) > 5) this.facing = Math.sign(this.vx);
    this.faceT = damp(this.faceT, this.facing, 0.0008, dt);

    const crouchWant = (this.pose === POSE.CROUCH || this.pose === POSE.DIG) ? 1
      : this.pose === POSE.SIT ? 1.5 : 0;
    this.crouch = damp(this.crouch, crouchWant, 0.001, dt);

    this._stepLegs(dt, t);
    let sy = 0, n = 0;
    for (const l of this.legs) { if (!l.stepping) { sy += l.foot.y; n++; } }
    const ground = n ? sy / n : t.surfaceY(this.x);
    const stand = this.rig.standH * (1 - this.crouch * 0.30);
    this.y = damp(this.y, ground - stand, 0.0006, dt);

    this.gait += dt * (2 + Math.abs(this.vx) * 0.09);
    this.bob = damp(this.bob, Math.sin(this.gait * 2) * clamp01(Math.abs(this.vx) / 30) * 1.1, 0.001, dt);

    // arms follow the pose. 0 rad points forward, positive swings down.
    const swing = Math.sin(this.gait * 2) * 0.42 * clamp01(Math.abs(this.vx) / 30);
    const idle = Math.sin(this.t * 0.9) * 0.04;
    let a0 = 1.34 + swing + idle, a1 = 1.34 - swing + idle;
    let e0 = 0.30, e1 = 0.30;
    switch (this.pose) {
      case POSE.DIG:
        a0 = 0.70 + Math.sin(this.t * 7) * 0.34; e0 = -0.55;
        a1 = 0.95 + Math.sin(this.t * 7 + 0.6) * 0.26; e1 = -0.40; break;
      case POSE.WRITE: a0 = 0.72; e0 = -1.15; a1 = 1.05; e1 = -0.75; break;
      case POSE.POINT: a0 = -0.22; e0 = 0.08; a1 = 1.25; e1 = 0.3; break;
      case POSE.DRINK: a0 = -0.85; e0 = -1.35; a1 = 1.25; e1 = 0.3; break;
      case POSE.WAVE: a0 = -1.30 + Math.sin(this.t * 8) * 0.28; e0 = -0.35; a1 = 1.25; e1 = 0.3; break;
      case POSE.CROUCH: a0 = 0.92; e0 = -0.25; a1 = 1.10; e1 = -0.15; break;
      case POSE.SIT: a0 = 1.10; e0 = 0.1; a1 = 1.20; e1 = 0.1; break;
      default: break;
    }
    this.armA[0] = damp(this.armA[0], a0, 0.0008, dt);
    this.armA[1] = damp(this.armA[1], a1, 0.0008, dt);
    this.elbow = this.elbow || [0.3, 0.3];
    this.elbow[0] = damp(this.elbow[0], e0, 0.0008, dt);
    this.elbow[1] = damp(this.elbow[1], e1, 0.0008, dt);

    const look = crab ? clamp((crab.x - this.x) / 120, -1, 1) * this.faceT : 0;
    const target = this.pose === POSE.WRITE || this.pose === POSE.DIG ? 0.5
      : this.pose === POSE.POINT ? -0.2 : look * 0.18 + Math.sin(this.t * 0.6) * 0.05;
    this.headA = damp(this.headA, target, 0.002, dt);
  }

  _stepLegs(dt, t) {
    const trig = 5 + Math.abs(this.vx) * 0.06;
    for (const l of this.legs) {
      const home = this.x + (l.far ? -1.6 : 1.2) + this.vx * 0.13;
      if (l.stepping) {
        l.t += dt / 0.22;
        if (l.t >= 1) {
          l.stepping = false; l.foot.x = l.to.x; l.foot.y = l.to.y;
          if (Math.abs(this.vx) > 16) {
            t.deform(l.foot.x, 0.7, 4);
            this.game.fx?.footPuff(l.foot.x, l.foot.y, Math.abs(this.vx) * 0.5, l.far);
          }
        } else {
          l.foot.x = lerp(l.from.x, l.to.x, l.t);
          l.foot.y = lerp(l.from.y, l.to.y, l.t) - Math.sin(l.t * Math.PI) * 5;
        }
      } else if (Math.abs(l.foot.x - home) > trig) {
        const other = this.legs.find((o) => o !== l);
        if (!other.stepping) {
          l.stepping = true; l.t = 0;
          l.from = { x: l.foot.x, y: l.foot.y };
          const tx = home + Math.sign(home - l.foot.x) * trig * 0.8;
          l.to = { x: tx, y: t.surfaceY(tx) };
        }
      } else {
        l.foot.y = damp(l.foot.y, t.surfaceY(l.foot.x), 0.0006, dt);
      }
    }
  }

  // -------------------------------------------------------------------------

  draw(ctx, cam) {
    const rig = this.rig;
    const f = this.faceT < 0 ? -1 : 1;
    const fa = Math.max(0.06, Math.abs(this.faceT));
    const s = cam.worldToScreen(this.x, this.y + this.bob);
    const z = cam.zoom;
    const so = rig.sockets;

    // contact shadow
    const sa = this.game.weather ? this.game.weather.shadowAlpha : 0.35;
    if (sa > 0.02) {
      const gy = this.game.terrain.surfaceY(this.x);
      const g = cam.worldToScreen(this.x, gy);
      ctx.globalAlpha = sa * 0.5;
      ctx.fillStyle = '#2a1a10';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 8 * z, 2 * z, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(Math.round(s.x * 2) / 2, Math.round(s.y * 2) / 2);
    ctx.scale(z, z);
    ctx.save();
    ctx.scale(f, 1);
    ctx.scale(fa, 1);
    if (this.crouch > 0.01) ctx.rotate(this.crouch * 0.16);

    this._leg(ctx, rig.leg.far, this.legs[0], -1);
    this._arm(ctx, rig.arm.far, this.armA[1], -1, null, (this.elbow || [0.3, 0.3])[1]);

    // satchel behind the hip
    ctx.save();
    ctx.translate(so.bag.x, so.bag.y + this.crouch * 1.5);
    ctx.rotate(-0.12 + Math.sin(this.gait * 2) * 0.06 * clamp01(Math.abs(this.vx) / 30));
    ctx.drawImage(rig.satchel.cv, -rig.satchel.ox, -rig.satchel.oy);
    ctx.restore();

    ctx.drawImage(rig.torso.cv, -rig.torso.ox, -rig.torso.oy);

    // head
    ctx.save();
    ctx.translate(so.neck.x, so.neck.y);
    ctx.rotate(this.headA);
    const head = this.pose === POSE.DIG ? rig.headGoggles : rig.head;
    ctx.drawImage(head.cv, -head.ox, -head.oy);
    ctx.restore();

    this._leg(ctx, rig.leg.near, this.legs[1], 1);
    this._arm(ctx, rig.arm.near, this.armA[0], 1, this.prop, (this.elbow || [0.3, 0.3])[0]);

    ctx.restore();
    ctx.restore();
  }

  _leg(ctx, art, leg, side) {
    const so = this.rig.sockets;
    const f = this.faceT < 0 ? -1 : 1;
    const hx = so.hip.x + side * 1.2 * this.K;
    const hy = so.hip.y;
    const lx = (leg.foot.x - this.x) * f;
    const ly = leg.foot.y - (this.y + this.bob);
    const sol = ik2(hx, hy, lx, ly - 1.5 * this.K, art.upper.len, art.lower.len, -1);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(sol.a1);
    ctx.drawImage(art.upper.cv, -art.upper.ox, -art.upper.oy); ctx.restore();
    ctx.save(); ctx.translate(sol.kx, sol.ky); ctx.rotate(sol.a2);
    ctx.drawImage(art.lower.cv, -art.lower.ox, -art.lower.oy); ctx.restore();
  }

  _arm(ctx, art, a, side, prop, elbow = 0.3) {
    const so = this.rig.sockets;
    const sx = so.shoulder.x + side * 1.4 * this.K;
    const sy = so.shoulder.y;
    const ex = sx + Math.cos(a) * art.upper.len;
    const ey = sy + Math.sin(a) * art.upper.len;
    const a2 = a + elbow;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    ctx.drawImage(art.upper.cv, -art.upper.ox, -art.upper.oy); ctx.restore();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a2);
    ctx.drawImage(art.lower.cv, -art.lower.ox, -art.lower.oy); ctx.restore();
    if (prop && this.rig.props[prop]) {
      const hx = ex + Math.cos(a2) * art.lower.len;
      const hy = ey + Math.sin(a2) * art.lower.len;
      const p = this.rig.props[prop];
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(a2 + 0.2);
      ctx.drawImage(p.cv, -p.ox, -p.oy); ctx.restore();
    }
  }
}
