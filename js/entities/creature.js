// CRABDEN - everything else that walks.
//
// One entity class covers the whole bestiary. What separates a Dunefowl from a
// Husk Hound is its definition and its brain state, not its code path: both
// walk on solved legs, both keep their feet on the sand, and both can end up
// living on your shell.

import { clamp, clamp01, lerp, damp, TAU, dist } from '../lib/math.js';
import { buildCreature } from '../art/faunaart.js';
import { ik2 } from './crab.js';

let NEXT_ID = 1;

export const MOOD = {
  WANDER: 'wander', APPROACH: 'approach', FEED: 'feed', ROOST: 'roost',
  FOLLOW: 'follow', FLEE: 'flee', HUNT: 'hunt', ATTACK: 'attack', DEAD: 'dead',
};

export class Creature {
  constructor(game, def, x) {
    this.game = game;
    this.def = def;
    this.uid = NEXT_ID++;
    this.rig = buildCreature(def);
    this.S = this.rig.S;

    this.x = x;
    this.y = game.terrain.surfaceY(x) - this.rig.standH;
    this.vx = 0;
    this.vy = 0;
    this.facing = -1;
    this.faceT = -1;

    this.hp = def.hp;
    this.hpMax = def.hp;
    this.mood = MOOD.WANDER;
    this.moodT = 0;
    this.target = null;
    this.homeX = x;
    this.tamed = false;
    this.trust = 0;
    this.onShell = false;
    this.shellU = 0.5;
    this.hunger = Math.random();

    this.bob = 0;
    this.gait = Math.random() * TAU;
    this.headA = 0;
    this.tailA = 0;
    this.wingA = 0;
    this.flap = Math.random() * TAU;
    this.hoverT = Math.random() * TAU;
    this.blink = 0;
    this.hurtT = 0;
    this.atkT = 0;
    this.recoil = 0;

    this.legs = [];
    const so = this.rig.sockets;
    for (const far of [true, false]) {
      for (const hip of [so.hip, so.shoulder]) {
        this.legs.push({
          far, hip,
          foot: { x, y: game.terrain.surfaceY(x) },
          from: { x, y: 0 }, to: { x, y: 0 },
          stepping: false, t: 0, lift: 0,
          phase: (far ? 0.5 : 0) + (hip === so.hip ? 0.25 : 0),
        });
      }
    }
    this._snapFeet();
  }

  get flies() { return !!this.def.flies; }
  get hostile() { return !!this.def.hostile; }
  get alive() { return this.hp > 0; }

  _snapFeet() {
    const t = this.game.terrain;
    for (const l of this.legs) {
      const fx = this.x + l.hip.x * this.faceT;
      l.foot.x = fx; l.foot.y = t.surfaceY(fx);
      l.from = { ...l.foot }; l.to = { ...l.foot };
    }
  }

  // -------------------------------------------------------------------------

  update(dt, ctx) {
    if (!this.alive) return;
    const t = this.game.terrain;
    const crab = this.game.crab;
    this.moodT += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.atkT = Math.max(0, this.atkT - dt);
    this.hunger = clamp01(this.hunger + dt * 0.012);

    this._think(dt, crab);

    if (this.onShell) { this._rideShell(dt, crab); return; }

    const speed = this.def.speed * (this.mood === MOOD.FLEE || this.mood === MOOD.HUNT ? 1.25 : 0.55);
    let want = 0;
    if (this.moveTo !== undefined) {
      const d = this.moveTo - this.x;
      want = Math.abs(d) > 3 ? Math.sign(d) : 0;
    }
    this.vx = damp(this.vx, want * speed, 0.0004, dt);
    this.x += this.vx * dt;
    if (Math.abs(this.vx) > 4) this.facing = Math.sign(this.vx);
    this.faceT = damp(this.faceT, this.facing, 0.0008, dt);

    if (this.flies) {
      this.hoverT += dt * 2.4;
      const ground = t.surfaceY(this.x);
      const want2 = ground - this.rig.standH - 18 - Math.sin(this.hoverT) * 5;
      this.y = damp(this.y, want2, 0.0008, dt);
      this.flap += dt * 16;
      this.wingA = Math.sin(this.flap) * 0.85;
    } else {
      this._stepLegs(dt, t);
      this._rideFeet(dt, t);
      this.gait += dt * (1.6 + Math.abs(this.vx) * 0.06);
      this.bob = damp(this.bob, Math.sin(this.gait * 2) * clamp01(Math.abs(this.vx) / 40) * this.S * 1.2, 0.001, dt);
    }

    // head, tail, wings
    const look = clamp(this.vx / Math.max(1, this.def.speed), -1, 1);
    const alert = this.mood === MOOD.HUNT || this.mood === MOOD.FLEE ? 0.25 : 0;
    this.headA = damp(this.headA, -0.12 + look * 0.10 - alert + Math.sin(this.gait * 2) * 0.05, 0.002, dt);
    this.tailA = damp(this.tailA, Math.sin(this.gait * 1.6) * 0.28 + (this.mood === MOOD.FLEE ? 0.4 : 0), 0.002, dt);
    if (!this.flies && this.rig.wing) this.wingA = damp(this.wingA, Math.sin(this.gait) * 0.10, 0.002, dt);
  }

  _think(dt, crab) {
    const d = crab ? this.x - crab.x : 999;
    const ad = Math.abs(d);

    if (this.hostile) {
      // hunt, strike, then break off - so a fight has a rhythm you can read
      if (this.recoil > 0) {
        this.recoil -= dt;
        this.mood = MOOD.HUNT;
        this.moveTo = this.x + Math.sign(d) * 40;
        return;
      }
      const reach = 24 + (crab ? crab.m.shellW * 0.28 : 0);
      if (ad < 240) {
        this.mood = ad < reach ? MOOD.ATTACK : MOOD.HUNT;
        this.moveTo = ad < reach ? this.x : crab.x - Math.sign(d) * (reach - 6);
        if (this.mood === MOOD.ATTACK && this.atkT <= 0) {
          this.atkT = 1.7;
          this.recoil = 0.9;
          this.game.onCreatureAttack?.(this);
        }
      } else {
        this._wander(dt);
      }
      return;
    }

    if (this.tamed) {
      // fleet: stay near, or ride the shell when told to
      if (this.orders === 'ride') {
        if (ad < 40 && !this.onShell) this.boardShell(crab);
        else this.moveTo = crab.x + (this.shellU - 0.5) * 20;
      } else if (this.orders === 'guard') {
        const foe = this.game.nearestHostile?.(crab.x, 180);
        if (foe) { this.moveTo = foe.x - Math.sign(foe.x - this.x) * 14; this.mood = MOOD.HUNT; return; }
        this.moveTo = crab.x + Math.sign(crab.faceT || 1) * (crab.m.shellW * 0.62 + 18);
        this.mood = MOOD.FOLLOW;
      } else {
        this.mood = MOOD.FOLLOW;
        // trail behind the shell, spaced so nobody stands inside anybody
        const slot = this.uid % 5;
        const back = crab.m.shellW * 0.62 + 14 + slot * 22;
        this.moveTo = crab.x - Math.sign(crab.faceT || 1) * back;
      }
      return;
    }

    // wild: drawn in by the garden, spooked by sudden moves
    if (crab && ad < 130 && this.game.garden) {
      const appeal = this.game.attraction(this.def);
      if (appeal > 0.2) {
        this.mood = ad > 30 ? MOOD.APPROACH : MOOD.FEED;
        this.moveTo = crab.x + (this.uid % 2 ? 22 : -22);
        this.trust = clamp01(this.trust + dt * 0.10 * appeal);
        return;
      }
    }
    this._wander(dt);
  }

  _wander(dt) {
    this.mood = MOOD.WANDER;
    if (this.moodT > 2.6 || this.moveTo === undefined) {
      this.moodT = 0;
      this.moveTo = this.homeX + (Math.random() - 0.5) * 160;
      if (Math.random() < 0.3) this.moveTo = this.x;   // pause and look around
    }
  }

  boardShell(crab) {
    this.onShell = true;
    this.shellU = 0.35 + Math.random() * 0.55;
    this.game.onBoard?.(this);
  }
  leaveShell() { this.onShell = false; }

  _rideShell(dt, crab) {
    const p = crab.shellWorld(this.shellU);
    this.x = damp(this.x, p.x, 0.0001, dt);
    this.y = damp(this.y, p.y - this.rig.standH * 0.6, 0.0001, dt);
    this.faceT = damp(this.faceT, crab.faceT, 0.002, dt);
    this.gait += dt * 0.8;
    this.headA = damp(this.headA, -0.2 + Math.sin(this.gait * 0.7) * 0.16, 0.002, dt);
    this.tailA = damp(this.tailA, Math.sin(this.gait) * 0.2, 0.002, dt);
    if (this.rig.wing) this.wingA = damp(this.wingA, Math.sin(this.gait * 0.6) * 0.08, 0.002, dt);
    for (const l of this.legs) {
      l.foot.x = this.x + l.hip.x * this.faceT;
      l.foot.y = this.y + this.rig.standH * 0.6;
    }
  }

  _stepLegs(dt, t) {
    const trig = this.rig.body.L * 0.20 + Math.abs(this.vx) * 0.05;
    const lead = this.vx * 0.16;
    for (const l of this.legs) {
      const home = this.x + l.hip.x * this.faceT + lead;
      if (l.stepping) {
        l.t += dt / 0.20;
        if (l.t >= 1) {
          l.stepping = false; l.foot.x = l.to.x; l.foot.y = l.to.y; l.lift = 0;
          if (Math.abs(this.vx) > 20) {
            t.deform(l.foot.x, 0.5, 4);
            this.game.fx?.footPuff(l.foot.x, l.foot.y, Math.abs(this.vx) * 0.4, l.far);
          }
        } else {
          l.foot.x = lerp(l.from.x, l.to.x, l.t);
          l.lift = Math.sin(l.t * Math.PI) * this.rig.standH * 0.24;
          l.foot.y = lerp(l.from.y, l.to.y, l.t) - l.lift;
        }
      } else if (Math.abs(l.foot.x - home) > trig) {
        const busy = this.legs.filter((o) => o.stepping).length;
        if (busy < 2) {
          l.stepping = true; l.t = 0;
          l.from = { x: l.foot.x, y: l.foot.y };
          const tx = home + Math.sign(home - l.foot.x) * trig * 0.7;
          l.to = { x: tx, y: t.surfaceY(tx) };
        }
      } else {
        l.foot.y = damp(l.foot.y, t.surfaceY(l.foot.x), 0.0006, dt);
      }
    }
  }

  _rideFeet(dt, t) {
    let sy = 0, n = 0;
    for (const l of this.legs) { if (!l.stepping) { sy += l.foot.y; n++; } }
    const ground = n ? sy / n : t.surfaceY(this.x);
    this.y = damp(this.y, ground - this.rig.standH, 0.0006, dt);
  }

  hurt(n, fromX) {
    if (!this.alive) return;
    this.hp -= n;
    this.hurtT = 0.28;
    this.game.fx?.blood(this.x, this.y, 4);
    if (this.hp <= 0) {
      this.hp = 0;
      this.mood = MOOD.DEAD;
      this.game.onCreatureDown?.(this);
    } else if (!this.hostile) {
      this.mood = MOOD.FLEE;
      this.moveTo = this.x + (this.x - fromX > 0 ? 160 : -160);
      this.trust = Math.max(0, this.trust - 0.25);
    }
  }

  // -- drawing --------------------------------------------------------------

  draw(ctx, cam) {
    const rig = this.rig;
    const f = this.faceT < 0 ? -1 : 1;
    const fa = Math.max(0.04, Math.abs(this.faceT));
    const s = cam.worldToScreen(this.x, this.y + this.bob);
    const z = cam.zoom;

    if (!this.flies && !this.onShell) this._shadow(ctx, cam);

    ctx.save();
    ctx.translate(Math.round(s.x * 2) / 2, Math.round(s.y * 2) / 2);
    ctx.scale(z, z);
    if (this.hurtT > 0) ctx.globalAlpha = 0.55 + Math.sin(this.hurtT * 60) * 0.45;
    ctx.save();
    ctx.scale(f, 1);
    ctx.scale(fa, 1);

    const so = rig.sockets;
    // far limbs
    this._legs(ctx, true);
    if (rig.wing) this._wing(ctx, rig.wing.far, -1);
    if (rig.tail) this._tail(ctx, -1);

    ctx.drawImage(rig.body.cv, -rig.body.ox, -rig.body.oy);

    // neck and head
    let hx = so.neck.x, hy = so.neck.y;
    if (rig.neck) {
      const na = -1.15 + this.headA * 0.5;
      ctx.save();
      ctx.translate(so.neck.x, so.neck.y);
      ctx.rotate(na);
      ctx.drawImage(rig.neck.cv, -rig.neck.ox, -rig.neck.oy);
      ctx.restore();
      hx += Math.cos(na) * rig.neck.len * 0.86;
      hy += Math.sin(na) * rig.neck.len * 0.86;
    }
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(this.headA + (rig.neck ? 0.42 : 0));
    ctx.drawImage(rig.head.cv, -rig.head.ox, -rig.head.oy);
    ctx.restore();

    if (rig.tail) this._tail(ctx, 1);
    this._legs(ctx, false);
    if (rig.wing) this._wing(ctx, rig.wing.near, 1);

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _legs(ctx, far) {
    const rig = this.rig;
    const art = far ? rig.legs.far : rig.legs.near;
    const c = Math.cos(0), f = this.faceT < 0 ? -1 : 1;
    for (const l of this.legs) {
      if (l.far !== far) continue;
      let lx = (l.foot.x - this.x) * f;
      const ly = l.foot.y - (this.y + this.bob);
      const hx = l.hip.x + (far ? -1.4 * this.S : 0.8 * this.S);
      const hy = l.hip.y;
      const sol = ik2(hx, hy, lx, ly, art.upper.len, art.lower.len, 1);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(sol.a1);
      ctx.drawImage(art.upper.cv, -art.upper.ox, -art.upper.oy); ctx.restore();
      ctx.save(); ctx.translate(sol.kx, sol.ky); ctx.rotate(sol.a2);
      ctx.drawImage(art.lower.cv, -art.lower.ox, -art.lower.oy); ctx.restore();
    }
  }

  _wing(ctx, art, side) {
    const so = this.rig.sockets;
    ctx.save();
    ctx.translate(so.wing.x + (side < 0 ? -1.6 * this.S : 0), so.wing.y);
    ctx.rotate(Math.PI - 0.5 + this.wingA * side * 0.9 + (side < 0 ? -0.18 : 0));
    ctx.drawImage(art.cv, -art.ox, -art.oy);
    ctx.restore();
  }

  _tail(ctx, side) {
    const so = this.rig.sockets;
    if (side < 0 && !this.def.tailKind) return;
    if (side > 0 && this.def.tailKind === 'plume') return;
    ctx.save();
    ctx.translate(so.tail.x, so.tail.y);
    ctx.rotate(Math.PI + this.tailA * 0.5);
    ctx.drawImage(this.rig.tail.cv, -this.rig.tail.ox, -this.rig.tail.oy);
    ctx.restore();
  }

  _shadow(ctx, cam) {
    const a = this.game.weather ? this.game.weather.shadowAlpha : 0.35;
    if (a <= 0.02) return;
    const gy = this.game.terrain.surfaceY(this.x);
    const s = cam.worldToScreen(this.x, gy);
    const w = this.rig.body.L * 0.9 * cam.zoom;
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, w * 0.5, Math.max(1, w * 0.12), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
