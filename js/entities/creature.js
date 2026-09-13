// CRABDEN - everything else that walks.
//
// One entity class covers the whole bestiary, because the difference between a
// monitor lizard and a scarab is a body plan and a gait, not a code path. Legs
// are solved from planted feet in world space; sprawlers throw their knees out
// and swing the spine, insects walk an alternating tripod, and a serpent has
// no legs at all and moves by pushing sideways against the sand.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { pxRing, pxArc, pxEllipse, pxSize } from '../render/pix.js';
import { buildCreature } from '../art/faunaart.js';
import { ik2 } from './crab.js';

let NEXT_ID = 1;

export const MOOD = {
  WANDER: 'wander', APPROACH: 'approach', FEED: 'feed', BASK: 'bask',
  FOLLOW: 'follow', FLEE: 'flee', HUNT: 'hunt', ATTACK: 'attack', DEAD: 'dead',
  POUNCE: 'pounce', EAT: 'eat',
};

export class Creature {
  constructor(game, def, x) {
    this.game = game;
    this.def = def;
    this.uid = NEXT_ID++;
    this.rig = buildCreature(def);
    this.S = this.rig.S;
    this.plan = this.rig.plan;
    this.sprawl = this.plan === 'sprawler';
    this.bug = this.plan === 'insect' || this.plan === 'arachnid' || this.plan === 'myriapod';
    this.legless = this.plan === 'serpent' || !this.rig.sockets.legs.length;

    this.x = x;
    this.y = game.terrain.surfaceY(x) - this.rig.standH;
    this.vx = 0;
    this.facing = -1;
    this.faceT = -1;

    this.hp = def.hp;
    this.hpMax = def.hp;
    this.mood = MOOD.WANDER;
    this.moodT = 0;
    this.homeX = x;
    this.tamed = false;
    this.trust = 0;
    this.onShell = false;
    this.shellU = 0.5;
    this.observed = 0;
    this.commanded = null;
    this.puppet = false;        // something of yours is riding its nerves
    this.driveX = 0;            // and this is you, steering it
    // Everything here is alive, which means everything here is dying. A short
    // life on purpose: the point is that your fleet turns over, breeds, and
    // leaves things behind for you to dig up later.
    this.age = Math.random() * (def.hp * 3);
    this.lifespan = (def.hp * 9 + 240) * (0.75 + Math.random() * 0.5);
    this.breedT = 40 + Math.random() * 60;

    // off the ground, and the things that put it there
    this.jz = 0;                // height above its own feet
    this.jv = 0;
    this.squash = 0;            // <0 crushed, >0 stretched
    this.pounceT = 0;           // wind-up before a leap
    this.bite = 0;              // 0..1 through a bite
    this.chew = 0;              // how long it has been eating
    this.stagger = 0;           // knocked about, cannot act
    this.hopT = 2 + Math.random() * 6;

    this.bob = 0;
    this.gait = Math.random() * TAU;
    this.sway = 0;
    this.headA = 0;
    this.tailA = 0;
    this.wingA = 0;
    this.armA = 0;
    this.flap = Math.random() * TAU;
    this.hoverT = Math.random() * TAU;
    this.hurtT = 0;
    this.atkT = 0;
    this.recoil = 0;
    this.blink = 0;

    // one leg per socket per side
    this.legs = [];
    const socks = this.rig.sockets.legs;
    socks.forEach((hip, i) => {
      for (const far of [true, false]) {
        this.legs.push({
          far, hip, i,
          side: i - (socks.length - 1) / 2,
          foot: { x, y: game.terrain.surfaceY(x) },
          from: { x, y: 0 }, to: { x, y: 0 },
          stepping: false, t: 0,
          // insects walk a tripod, quadrupeds walk diagonals
          phase: this.bug ? ((i + (far ? 1 : 0)) % 2) * 0.5 : ((i % 2) + (far ? 1 : 0)) % 2 * 0.5,
        });
      }
    });
    this._snapFeet();
  }

  get flies() { return !!this.def.flies; }
  // a parasite of yours in its nerves stops it being anybody's enemy
  get hostile() { return !!this.def.hostile && !this.puppet; }
  get alive() { return this.hp > 0; }
  get name() { return this.def.name; }

  _snapFeet() {
    const t = this.game.terrain;
    for (const l of this.legs) {
      const fx = this.x + l.hip.x * this.faceT;
      l.foot.x = fx; l.foot.y = t.surfaceY(fx);
      l.from = { ...l.foot }; l.to = { ...l.foot };
    }
  }

  // -------------------------------------------------------------------------

  /** How far through its life it is. Old animals move and look tired. */
  get aged() { return clamp01(this.age / this.lifespan); }

  update(dt) {
    if (this.alive) this._live(dt);
    if (!this.alive) { this.moodT += dt; return; }
    const t = this.game.terrain;
    const crab = this.game.crab;
    this.moodT += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.atkT = Math.max(0, this.atkT - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.bite = Math.max(0, this.bite - dt * 2.6);
    this._air(dt, t);
    this.blink = Math.max(0, this.blink - dt);
    if (Math.random() < dt * 0.22) this.blink = 0.13;

    // staggered by a heavy hit, it does not get to do anything for a moment
    if (this.stagger > 0) {
      this.vx = damp(this.vx, 0, 0.0002, dt);
      this.x += this.vx * dt;
      this._settleFeet(dt, t);
      return;
    }
    this._think(dt, crab);

    if (this.onShell) { this._rideShell(dt, crab); return; }

    const hurry = this.mood === MOOD.FLEE || this.mood === MOOD.HUNT;
    const speed = this.def.speed * (hurry ? 1 : 0.5);
    let want = 0;
    if (this.moveTo !== undefined) {
      const d = this.moveTo - this.x;
      want = Math.abs(d) > 3 ? Math.sign(d) : 0;
    }
    this.vx = damp(this.vx, want * speed, 0.0004, dt);
    this.x += this.vx * dt;
    if (Math.abs(this.vx) > 4) this.facing = Math.sign(this.vx);
    this.faceT = damp(this.faceT, this.facing, 0.0008, dt);

    const spd = Math.abs(this.vx);
    this.gait += dt * (1.4 + spd * (this.bug ? 0.11 : 0.07));

    if (this.flies) {
      this.hoverT += dt * 2.6;
      const ground = t.surfaceY(this.x);
      const want2 = ground - this.rig.standH - 20 - Math.sin(this.hoverT) * 6;
      this.y = damp(this.y, want2, 0.0008, dt);
      this.flap += dt * (this.def.plan === 'insect' ? 26 : 13);
      this.wingA = Math.sin(this.flap) * 0.9;
    } else if (this.legless) {
      // a serpent pushes sideways: the whole body swings and the head leads
      this.y = damp(this.y, t.surfaceY(this.x) - this.rig.standH, 0.0006, dt);
      this.sway = Math.sin(this.gait * 2.4) * clamp01(spd / 50) * 0.30;
      if (spd > 8 && Math.random() < dt * 9) {
        t.deform(this.x + (Math.random() - 0.5) * 12, 0.5, 5);
      }
    } else {
      this._stepLegs(dt, t);
      this._rideFeet(dt, t);
      this.bob = damp(this.bob, Math.sin(this.gait * 2) * clamp01(spd / 40) * this.S * 1.1, 0.001, dt);
      // sprawlers throw the spine side to side as they walk
      this.sway = this.sprawl ? Math.sin(this.gait * 2) * clamp01(spd / 40) * 0.14 : 0;
    }

    const look = clamp(this.vx / Math.max(1, this.def.speed), -1, 1);
    const alert = this.mood === MOOD.HUNT || this.mood === MOOD.FLEE ? 0.22 : 0;
    this.headA = damp(this.headA, -0.06 + look * 0.10 - alert + Math.sin(this.gait * 2) * 0.05, 0.002, dt);
    this.tailA = damp(this.tailA,
      Math.sin(this.gait * (this.sprawl ? 2 : 1.6)) * (this.sprawl ? 0.38 : 0.26)
      + (this.mood === MOOD.FLEE ? 0.4 : 0), 0.002, dt);
    if (!this.flies && this.rig.wing) this.wingA = damp(this.wingA, Math.sin(this.gait) * 0.10, 0.002, dt);
    if (this.rig.arm) {
      const strike = this.atkT > 0.8 ? 1 : 0;
      this.armA = damp(this.armA, strike ? -1.2 : -0.15 + Math.sin(this.gait * 0.7) * 0.08, 0.0006, dt);
    }

    // watching a creature is how the bestiary gets written
    if (crab && Math.abs(crab.x - this.x) < 120 && this.game.cam.isVisible(this.x, this.y, 40)) {
      this.observed += dt;
      this.game.onObserved?.(this, dt);
    }
  }

  /**
   * Off the ground. Everything out here can leave it - a jerboa hops as its
   * normal gait, a lizard pounces on what it is hunting, and anything at all
   * jumps when it is startled - and everything that leaves it squashes on the
   * way out and stretches at the top.
   */
  _air(dt, terr) {
    if (this.jz > 0 || this.jv !== 0) {
      this.jv -= 900 * dt * (this.flies ? 0 : 1);
      this.jz += this.jv * dt;
      if (this.jz <= 0) {
        if (this.jv < -80) {
          this.squash = -0.3;
          this.game.fx?.dust(this.x, terr.surfaceY(this.x), 0.7 * this.S);
        }
        this.jz = 0;
        this.jv = 0;
      }
      this.squash = damp(this.squash, this.jv > 40 ? 0.20 : 0, 0.0008, dt);
    } else this.squash = damp(this.squash, 0, 0.0009, dt);
  }

  /** Leave the ground. `fwd` throws it forward as well as up. */
  leap(power = 1, fwd = 0) {
    if (this.jz > 0.5 || this.flies) return;
    this.jv = 150 * power * (0.7 + this.S * 0.4);
    this.squash = -0.26;
    this.vx += fwd * this.def.speed * 1.4;
    this.game.fx?.dust(this.x, this.game.terrain.surfaceY(this.x), 0.6 * this.S);
  }

  /** Keep the feet under it while it is not doing anything else. */
  _settleFeet(dt, terr) {
    if (this.flies || this.legless) return;
    this._stepLegs(dt, terr);
    this._rideFeet(dt, terr);
  }

  /** Getting older, and sometimes getting on with it. */
  _live(dt) {
    this.age += dt;
    const old = this.aged;
    if (old >= 1) {
      this.hp = 0;
      this.moodT = 0;
      this.game.onDied?.(this, 'age');
      return;
    }
    // breeding, if you have grown the thing that lets your fleet do that
    if (!this.tamed || !this.game.economy) return;
    if (this.game.economy.stat('breed') <= 0) return;
    if (old < 0.15 || old > 0.8) return;
    this.breedT -= dt * (this.onShell ? 1.4 : 0.6);
    if (this.breedT > 0) return;
    this.breedT = 90 + Math.random() * 90;
    this.game.onBred?.(this);
  }

  _think(dt, crab) {
    // being driven overrides everything: the animal has no say in it
    if (this.puppet && Math.abs(this.driveX) > 0.05) {
      this.mood = MOOD.FOLLOW;
      this.moveTo = this.x + this.driveX * 120;
      return;
    }
    if (this.commanded) {
      this.moveTo = this.commanded.x;
      this.mood = MOOD.FOLLOW;
      if (Math.abs(this.x - this.commanded.x) < 8) this.commanded = null;
      return;
    }
    const d = crab ? this.x - crab.x : 999;
    const ad = Math.abs(d);

    if (this.hostile) {
      if (this.recoil > 0) {
        this.recoil -= dt;
        this.mood = MOOD.HUNT;
        this.moveTo = this.x + Math.sign(d) * 40;
        return;
      }
      const reach = 22 + (crab ? crab.m.shellW * 0.28 : 0);
      if (ad < 240) {
        // Between running at you and being on you there is a pounce: it drops,
        // gathers, and throws itself the last stretch. That wind-up is the
        // only warning you get, and it is the only warning it owes you.
        const pouncing = ad > reach && ad < reach + 66 && this.jz <= 0.5
          && !this.flies && !this.legless;
        if (pouncing && this.pounceT <= 0 && Math.random() < dt * 1.3) {
          this.pounceT = 0.42;
          this.mood = MOOD.POUNCE;
          this.moveTo = this.x;
          return;
        }
        if (this.pounceT > 0) {
          this.pounceT -= dt;
          this.mood = MOOD.POUNCE;
          this.moveTo = this.x;
          if (this.pounceT <= 0) {
            this.leap(1.25, -Math.sign(d));
            this.game.audio?.play('growl', { pitch: 1.2 });
          }
          return;
        }
        this.mood = ad < reach ? MOOD.ATTACK : MOOD.HUNT;
        this.moveTo = ad < reach ? this.x : crab.x - Math.sign(d) * (reach - 6);
        if (this.mood === MOOD.ATTACK && this.atkT <= 0) {
          this.atkT = 1.7;
          this.recoil = 0.9;
          this.bite = 1;
          this.game.onCreatureAttack?.(this);
        }
      } else this._wander(dt);
      return;
    }

    if (this.tamed) {
      const orders = this.game.wildlife.orders;
      if (orders === 'ride') {
        if (ad < 40 && !this.onShell) this.boardShell(crab);
        else this.moveTo = crab.x + (this.shellU - 0.5) * 20;
      } else if (orders === 'guard') {
        const foe = this.game.nearestHostile?.(crab.x, 190);
        if (foe) { this.moveTo = foe.x - Math.sign(foe.x - this.x) * 14; this.mood = MOOD.HUNT; return; }
        this.moveTo = crab.x + (crab.facing || 1) * (crab.m.shellW * 0.62 + 18);
        this.mood = MOOD.FOLLOW;
      } else {
        this.mood = MOOD.FOLLOW;
        const slot = this.uid % 5;
        const back = crab.m.shellW * 0.62 + 14 + slot * 22;
        this.moveTo = crab.x - (crab.facing || 1) * back;
      }
      return;
    }

    if (crab && ad < 130 && this.game.garden) {
      // Two things pull it in. The garden on your back is the standing offer,
      // and it is slow. The bait its own species crosses a desert for is the
      // fast one, and it is the only thing that gets an animal willing enough
      // to sing with you.
      const appeal = this.game.attraction(this.def);
      const bait = this.game.baitFor?.(this.def) || 0;
      const pull = appeal + bait;
      if (pull > 0.2) {
        this.mood = ad > 30 ? MOOD.APPROACH : MOOD.FEED;
        this.moveTo = crab.x + (this.uid % 2 ? 24 : -24);
        this.trust = clamp01(this.trust + dt * (0.055 * appeal + 0.16 * bait));
        // and once it is close and fed it sticks: it stops treating the animal
        // it is standing next to as somewhere it happens to be
        if (this.mood === MOOD.FEED && this.trust > 0.5) {
          this.moveTo = crab.x + (this.uid % 2 ? 22 : -22);
          if (Math.random() < dt * 0.5) this.game.fx?.spark(this.x, this.y - 6, '#ffe9a8', 2, 12);
        }
        return;
      }
    }
    this._wander(dt);
  }

  /**
   * Standing over something dead, taking it apart. Anything that eats meat
   * will stop for a body, and while it is there it is not interested in you -
   * which is the one reliable way to walk past a hunter.
   */
  _feedOn(kill, dt) {
    this.mood = MOOD.EAT;
    this.moveTo = kill.x + Math.sign(this.x - kill.x) * 6;
    if (Math.abs(this.x - this.moveTo) > 5) return;
    this.moveTo = this.x;
    this.chew += dt;
    // a bite every half second, and it takes something with it
    if (this.chew > 0.5) {
      this.chew = 0;
      this.bite = 1;
      this.game.fx?.blood(kill.x, kill.y - 6, Math.sign(this.x - kill.x) || 1, 0.35,
        kill.def.blood || '#8e1f22');
      this.game.audio?.play('claw', { pitch: 0.7 + Math.random() * 0.3 });
      kill.eaten = (kill.eaten || 0) + 1;
      this.hp = Math.min(this.hpMax, this.hp + 1);
    }
  }

  _wander(dt) {
    // Anything that would hunt you will stop for a body instead, and a body
    // is easier than you are.
    if (this.def.dmg > 0 && !this.tamed) {
      const kill = this.game.wildlife?.nearestKill?.(this.x, 150);
      if (kill) { this._feedOn(kill, dt); return; }
    }
    // and some things do not walk anywhere: they hop, on their own clock
    if (!this.flies && !this.legless && this.def.hops) {
      this.hopT -= dt;
      if (this.hopT <= 0 && this.jz <= 0.5) {
        this.hopT = 0.42 + Math.random() * 0.3;
        this.leap(0.8, Math.sign(this.vx) || (Math.random() < 0.5 ? -1 : 1) * 0.5);
      }
    }
    // reptiles bask; that is most of what a reptile does
    if (this.mood === MOOD.BASK) {
      if (this.moodT > 5 + Math.random() * 6) { this.mood = MOOD.WANDER; this.moodT = 0; }
      this.moveTo = this.x;
      return;
    }
    this.mood = MOOD.WANDER;
    if (this.moodT > 2.6 || this.moveTo === undefined) {
      this.moodT = 0;
      if (this.def.clade === 'reptile' && Math.random() < 0.45 && this.game.weather.daylight > 0.4) {
        this.mood = MOOD.BASK;
        this.moveTo = this.x;
        return;
      }
      this.moveTo = this.homeX + (Math.random() - 0.5) * 170;
      if (Math.random() < 0.28) this.moveTo = this.x;
    }
  }

  boardShell(crab) {
    this.onShell = true;
    this.shellU = 0.35 + Math.random() * 0.55;
    this.game.onBoard?.(this);
  }
  leaveShell() { this.onShell = false; }

  _rideShell(dt, crab) {
    // riders perch on the near half of the dome, spread across it
    const a = Math.cos(this.shellU * Math.PI * 2) * 0.6;
    const b = 0.15 + Math.sin(this.shellU * Math.PI * 2) * 0.35;
    const p = crab.shellWorldAB(a, b);
    this.x = damp(this.x, p.x, 0.0001, dt);
    this.y = damp(this.y, p.y - this.rig.standH * 0.6, 0.0001, dt);
    this.faceT = damp(this.faceT, crab.faceT, 0.002, dt);
    this.gait += dt * 0.8;
    this.headA = damp(this.headA, -0.16 + Math.sin(this.gait * 0.7) * 0.14, 0.002, dt);
    this.tailA = damp(this.tailA, Math.sin(this.gait) * 0.2, 0.002, dt);
    if (this.rig.wing) this.wingA = damp(this.wingA, Math.sin(this.gait * 0.6) * 0.08, 0.002, dt);
    for (const l of this.legs) {
      l.foot.x = this.x + l.hip.x * this.faceT;
      l.foot.y = this.y + this.rig.standH * 0.6;
    }
  }

  _stepLegs(dt, t) {
    const trig = this.rig.body.L * (this.bug ? 0.16 : 0.20) + Math.abs(this.vx) * 0.05;
    const lead = this.vx * 0.16;
    const maxLift = this.bug ? 3 : 2;
    let lifting = 0;
    for (const l of this.legs) if (l.stepping) lifting++;
    for (const l of this.legs) {
      const home = this.x + l.hip.x * this.faceT + lead;
      if (l.stepping) {
        l.t += dt / (this.bug ? 0.13 : 0.19);
        if (l.t >= 1) {
          l.stepping = false; l.foot.x = l.to.x; l.foot.y = l.to.y;
          if (Math.abs(this.vx) > 22) {
            t.deform(l.foot.x, 0.4, 4);
            this.game.fx?.footPuff(l.foot.x, l.foot.y, Math.abs(this.vx) * 0.35, l.far);
          }
        } else {
          l.foot.x = lerp(l.from.x, l.to.x, l.t);
          l.foot.y = lerp(l.from.y, l.to.y, l.t) - Math.sin(l.t * Math.PI) * this.rig.standH * 0.22;
        }
      } else if (Math.abs(l.foot.x - home) > trig && lifting < maxLift) {
        l.stepping = true; l.t = 0;
        l.from = { x: l.foot.x, y: l.foot.y };
        const tx = home + Math.sign(home - l.foot.x) * trig * 0.7;
        l.to = { x: tx, y: t.surfaceY(tx) };
        lifting++;
      } else {
        l.foot.y = damp(l.foot.y, t.surfaceY(l.foot.x), 0.0006, dt);
      }
    }
  }

  _rideFeet(dt, t) {
    let sy = 0, n = 0;
    for (const l of this.legs) if (!l.stepping) { sy += l.foot.y; n++; }
    const ground = n ? sy / n : t.surfaceY(this.x);
    this.y = damp(this.y, ground - this.rig.standH, 0.0006, dt);
  }

  hurt(n, fromX) {
    if (!this.alive) return;
    const was = this.hp;
    this.hp -= n;
    this.hurtT = 0.28;
    const col = this.def.blood
      || (this.def.clade === 'insect' || this.def.clade === 'arachnid' ? '#c8d07a' : '#8e1f22');
    const dir = fromX === undefined ? 1 : Math.sign(this.x - fromX) || 1;
    // a killing blow opens it up properly
    this.game.fx?.blood(this.x, this.y - 4, dir, this.hp <= 0 ? 1.8 : clamp(n / 8, 0.3, 1.2), col);
    if (this.hp <= 0 && was > 0) {
      this.game.cam?.shake(3);
      this.game.fx?.ring(this.x, this.y - 4, col, 12);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.mood = MOOD.DEAD;
      this.moodT = 0;
      this.game.onCreatureDown?.(this);
    } else if (!this.hostile) {
      this.mood = MOOD.FLEE;
      this.moveTo = this.x + (this.x - fromX > 0 ? 170 : -170);
      this.trust = Math.max(0, this.trust - 0.25);
    }
  }

  // -- drawing --------------------------------------------------------------

  draw(ctx, cam) {
    const rig = this.rig;
    const f = this.faceT < 0 ? -1 : 1;
    const fa = Math.max(0.04, Math.abs(this.faceT));
    const s = cam.worldToScreen(this.x, this.y + this.bob - (this.jz || 0));
    const z = cam.zoom;

    if (!this.flies && !this.onShell) this._shadow(ctx, cam);

    ctx.save();
    ctx.translate(Math.round(s.x * 2) / 2, Math.round(s.y * 2) / 2);
    ctx.scale(z, z);
    // a body that leaves the ground squashes on the way out and stretches at
    // the top, and one that is gathering to leap crouches first
    const sq = (this.squash || 0) - (this.pounceT > 0 ? 0.22 : 0);
    if (Math.abs(sq) > 0.004) ctx.scale(1 - sq * 0.45, 1 + sq);
    if (!this.alive) {
      ctx.globalAlpha = Math.max(0, 1 - this.moodT / 4);
      ctx.rotate(clamp(this.moodT * 1.6, 0, 1) * 1.5 * f);
    } else if (this.hurtT > 0) {
      ctx.globalAlpha = 0.55 + Math.sin(this.hurtT * 60) * 0.45;
    }
    ctx.save();
    ctx.scale(f, 1);
    ctx.scale(fa, 1);

    const so = rig.sockets;
    this._legs(ctx, true);
    if (rig.wing) this._wing(ctx, rig.wing.far, -1);
    if (rig.tail) this._tail(ctx, -1);

    ctx.save();
    ctx.rotate(this.sway * 0.5);
    ctx.translate(0, this.legless ? Math.sin(this.gait * 2.4) * 1.2 : 0);
    ctx.drawImage(rig.body.cv, -rig.body.ox, -rig.body.oy);
    ctx.restore();

    let hx = so.head.x, hy = so.head.y;
    if (rig.neck) {
      // a lizard carries its head out in front; a heron carries it up
      const base = this.sprawl ? -0.16 : this.bug ? -0.5 : -1.05;
      const na = base + this.headA * 0.5;
      ctx.save();
      ctx.translate(so.neck ? so.head.x : hx, hy);
      ctx.rotate(na);
      ctx.drawImage(rig.neck.cv, -rig.neck.ox, -rig.neck.oy);
      ctx.restore();
      hx += Math.cos(na) * rig.neck.len * 0.86;
      hy += Math.sin(na) * rig.neck.len * 0.86;
    }
    ctx.save();
    ctx.translate(hx, hy + this.sway * 3);
    ctx.rotate(this.headA + (rig.neck ? 0.42 : 0) + this.sway * 0.6);
    ctx.drawImage(rig.head.cv, -rig.head.ox, -rig.head.oy);
    ctx.restore();

    if (rig.arm) this._arm(ctx);
    if (rig.tail) this._tail(ctx, 1);
    this._legs(ctx, false);
    if (rig.wing) this._wing(ctx, rig.wing.near, 1);

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.commanded) this._marker(ctx, cam);
  }

  _legs(ctx, far) {
    const rig = this.rig;
    const art = far ? rig.legs.far : rig.legs.near;
    if (!art) return;
    const f = this.faceT < 0 ? -1 : 1;
    for (const l of this.legs) {
      if (l.far !== far) continue;
      const lx = (l.foot.x - this.x) * f;
      const ly = l.foot.y - (this.y + this.bob);
      const hx = l.hip.x + (far ? -1.2 * this.S : 0.7 * this.S);
      const hy = l.hip.y;
      // a sprawler's knee goes out and up; an erect limb folds under the body
      const up = this.sprawl || this.bug ? -1 : 1;
      const ankX = lx + (this.sprawl ? Math.sign(l.side || 1) * 1.5 * this.S : 0);
      const sol = ik2(hx, hy, ankX, ly, art.upper.len, art.lower.len, up);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(sol.a1);
      ctx.drawImage(art.upper.cv, -art.upper.ox, -art.upper.oy); ctx.restore();
      ctx.save(); ctx.translate(sol.kx, sol.ky); ctx.rotate(sol.a2);
      ctx.drawImage(art.lower.cv, -art.lower.ox, -art.lower.oy); ctx.restore();
    }
  }

  _arm(ctx) {
    const a = this.rig.arm;
    const so = this.rig.sockets;
    const sx = so.head.x - 2 * this.S, sy = so.head.y + 2 * this.S;
    const a1 = 0.55 + this.armA;
    const ex = sx + Math.cos(a1) * a.upper.len, ey = sy + Math.sin(a1) * a.upper.len;
    const a2 = a1 - 2.1 - this.armA * 0.8;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a1);
    ctx.drawImage(a.upper.cv, -a.upper.ox, -a.upper.oy); ctx.restore();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a2);
    ctx.drawImage(a.lower.cv, -a.lower.ox, -a.lower.oy); ctx.restore();
  }

  _wing(ctx, art, side) {
    const so = this.rig.sockets;
    if (!so.wing) return;
    ctx.save();
    ctx.translate(so.wing.x + (side < 0 ? -1.6 * this.S : 0), so.wing.y);
    ctx.rotate(Math.PI - 0.5 + this.wingA * side * 0.9 + (side < 0 ? -0.18 : 0));
    ctx.drawImage(art.cv, -art.ox, -art.oy);
    ctx.restore();
  }

  _tail(ctx, side) {
    const so = this.rig.sockets;
    const kind = this.def.tailKind;
    if (side < 0 && !kind) return;
    if (side > 0 && (kind === 'plume' || kind === 'sting')) return;
    ctx.save();
    ctx.translate(so.tail.x, so.tail.y);
    ctx.rotate(Math.PI + this.tailA * 0.5 + this.sway * 1.2);
    ctx.drawImage(this.rig.tail.cv, -this.rig.tail.ox, -this.rig.tail.oy);
    ctx.restore();
  }

  _shadow(ctx, cam) {
    const a = this.game.weather ? this.game.weather.shadowAlpha : 0.35;
    if (a <= 0.02) return;
    const gy = this.game.terrain.surfaceY(this.x);
    const s = cam.worldToScreen(this.x, gy);
    const w = this.rig.body.L * 0.95 * cam.zoom;
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, w * 0.5, Math.max(1, w * 0.11), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _marker(ctx, cam) {
    const s = cam.worldToScreen(this.x, this.y - this.rig.body.H * 1.4);
    const t = this.game.time * 6;
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(Math.round(s.x - 1), Math.round(s.y - 3 + Math.sin(t) * 1.5), 2, 4);
    ctx.globalAlpha = 1;
  }

  /**
   * How far along you are with a wild animal, drawn on the animal. A ring
   * that fills as it decides about you, and a note over it once it is willing
   * - so a tame is something you can watch happen rather than a number in a
   * panel you have to go and look at.
   */
  drawTame(ctx, cam) {
    if (!this.alive || this.tamed || this.hostile || this.trust <= 0.04) return;
    const s = cam.worldToScreen(this.x, this.y - this.rig.body.H * 1.55);
    const z = cam.zoom;
    const r = 5 * z;
    const k = clamp01(this.trust);
    const ready = k >= 0.55;
    ctx.save();
    // the well
    ctx.globalAlpha = 0.45;
    pxRing(ctx, s.x, s.y, r, r, 'rgba(14,10,6,0.9)', { p: pxSize(z), thick: Math.max(1, Math.round(2 * z)) });
    // and how full it is
    ctx.globalAlpha = ready ? 0.95 : 0.75;
    pxArc(ctx, s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * k,
      ready ? '#ffe9a8' : '#8ec8d8', { p: pxSize(z), thick: Math.max(1, Math.round(1.6 * z)) });
    if (ready) {
      // a note, bobbing, meaning it will sing with you
      const b = Math.sin(this.game.time * 3.4) * 1.4 * z;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(Math.round(s.x - 0.5 * z), Math.round(s.y - 3 * z + b), Math.max(1, z), 3 * z);
      ctx.beginPath();
      ctx.ellipse(s.x - 1.2 * z, s.y + b, 1.4 * z, 1.1 * z, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}
