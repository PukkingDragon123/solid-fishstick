// CRABDEN - every animal that is not the crab.
//
// One class, driven by the species table. Ground creatures get the same
// foot-planting IK the crab uses (fewer legs, cheaper); fliers get hover +
// wingbeat. Behaviour is a small steering stack rather than a state machine
// soup, so a hostile and a companion share the same movement code.

import { TAU, clamp, clamp01, lerp, damp, angleLerp, dist2, Rng, rgba } from '../lib/math.js';
import { SPECIES, isHostile } from './species.js';
import { drawCreature } from '../render/creatureart.js';
let NEXT_ID = 1;

export class Creature {
  constructor(game, speciesId, x, y, opts = {}) {
    const sp = SPECIES[speciesId];
    if (!sp) throw new Error('unknown species ' + speciesId);
    this.game = game;
    this.sp = sp;
    this.id = NEXT_ID++;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.z = sp.flying ? 12 + Math.random() * 8 : 0;
    this.vz = 0;
    this.facing = Math.random() * TAU;
    this.size = sp.size * (opts.scale ?? 1);
    this.scale = opts.scale ?? 1;
    this.hpMax = sp.hp; this.hp = sp.hp;
    this.t = Math.random() * 100;
    this.wing = Math.random() * TAU;
    this.gait = 0;
    this.hurtFlash = 0;
    this.state = 'wander';
    this.stateT = 0;
    this.target = null;
    this.home = { x, y };
    this.wanderA = Math.random() * TAU;
    this.rng = new Rng(this.id * 7919);
    this.tamed = !!opts.tamed;
    this.hostile = isHostile(sp) && !this.tamed;
    this.work = null;
    this.workT = this.rng.float(4, 12);
    this.attackCd = 0;
    this.fleeT = 0;
    this.dead = false;
    this.deathT = 0;
    this.alarmed = 0;
    this.tameProgress = 0;
    this.carrying = null;
    this.mood = 'calm';
    this.chirpT = this.rng.float(3, 14);
    this.leader = null;
    this.pal = sp.pal;

    this.feet = [];
    const legs = (sp.body && sp.body.legs) || 0;
    if (legs > 0 && !sp.flying) {
      for (let i = 0; i < legs; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const rows = Math.max(1, legs / 2);
        this.feet.push({
          side, row,
          spread: (row - (rows - 1) / 2) * 0.5,
          fx: x, fy: y, fz: 0,
          stepping: false, t: 0, dur: 0.18,
          ax: 0, ay: 0, bx: 0, by: 0, lift: 0,
        });
      }
    }
  }

  get radius() { return this.size * 0.8; }
  get isCompanion() { return this.tamed; }

  // -- damage ---------------------------------------------------------------

  hurt(amount, fromX, fromY, source) {
    if (this.dead) return;
    this.hp -= amount;
    this.hurtFlash = 1;
    this.alarmed = 4;
    this.game.particles.text('-' + Math.round(amount), this.x, this.y - this.size - 4, {
      color: '#ffd08a', scale: 1, shake: 1.5,
    });
    this.game.particles.burst('chunk', this.x, this.y - this.size * 0.4, 5, {
      color: this.pal[2], speedMin: 12, speedMax: 40, life: 0.45, grav: 90, lift: 20,
    });
    if (fromX !== undefined) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.vx += Math.cos(a) * 60;
      this.vy += Math.sin(a) * 60;
    }
    if (this.hp <= 0) this.die(source);
    else if (!this.hostile && !this.tamed) { this.state = 'flee'; this.fleeT = 6; }
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 0;
    this.game.onCreatureDied?.(this, source);
    this.game.particles.burst('chunk', this.x, this.y - this.size * 0.3, 10, {
      color: this.pal[0], color2: this.pal[2], speedMin: 14, speedMax: 52, life: 0.7, grav: 110, lift: 26,
    });
    this.game.particles.burst('puff', this.x, this.y, 4, {
      color: rgba(this.pal[1], 0.6), speedMin: 4, speedMax: 14, life: 0.6,
    });
  }

  // -- taming ---------------------------------------------------------------

  canTame() {
    if (this.tamed || this.dead || !this.sp.tame) return false;
    if (this.sp.role === 'hostile' || this.sp.role === 'boss') return false;
    if (this.sp.hostileUntilTamed && this.hp > this.hpMax * 0.4) return false;
    return true;
  }

  tameCost() { return this.sp.tame; }

  tame() {
    this.tamed = true;
    this.hostile = false;
    this.state = 'follow';
    this.hp = this.hpMax;
    this.mood = 'happy';
    this.game.particles.burst('spark', this.x, this.y - this.size, 14, {
      color: '#ffe9a0', speedMin: 8, speedMax: 30, life: 0.9, glow: 5, grav: -6,
    });
    this.game.particles.text('!', this.x, this.y - this.size - 8, { color: '#ffe9a0', scale: 2 });
  }

  assignWork(workId) {
    this.work = workId || null;
    this.state = workId ? 'work' : 'follow';
    this.workT = 2;
  }

  // -- update ---------------------------------------------------------------

  update(dt, game) {
    this.t += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.alarmed = Math.max(0, this.alarmed - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateT += dt;

    if (this.dead) {
      this.deathT += dt;
      this.vx *= Math.pow(0.02, dt);
      this.vy *= Math.pow(0.02, dt);
      return;
    }

    const sp = this.sp;
    const crab = game.crab;

    // ambient chirping
    this.chirpT -= dt;
    if (this.chirpT <= 0) {
      this.chirpT = this.rng.float(6, 22);
      if (game.cam.isVisible(this.x, this.y, 80) && (sp.form === 'bird' || sp.form === 'bat')) {
        game.audio.play('chirp', { pitch: 0.7 + this.size / 20 });
      }
    }

    this._think(dt, game, crab);

    // integrate
    const drag = Math.pow(sp.flying ? 0.06 : 0.004, dt);
    this.vx *= drag; this.vy *= drag;
    const sp2 = Math.hypot(this.vx, this.vy);
    const maxS = sp.speed * (this.alarmed > 0 ? 1.35 : 1) * (game.hazardSlow ?? 1);
    if (sp2 > maxS) { this.vx = this.vx / sp2 * maxS; this.vy = this.vy / sp2 * maxS; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    game.world.clampToWorld(this);

    if (sp2 > 3) this.facing = angleLerp(this.facing, Math.atan2(this.vy, this.vx), 1 - Math.pow(0.0015, dt));
    this.gait += sp2 * dt * 0.09;
    this.wing += dt * (sp.flying ? 15 + sp2 * 0.15 : 6);

    // vertical
    if (sp.flying) {
      const hover = sp.form === 'jelly' ? 26 : 14 + Math.sin(this.t * 1.4 + this.id) * 4;
      const ground = game.world.elevAt(this.x, this.y);
      this.z = damp(this.z, hover + ground * 0.4, 0.02, dt);
    } else {
      this.z = game.world.elevAt(this.x, this.y) * 0.55;
      this._updateFeet(dt, game, sp2);
    }

    // collide with solid scenery
    if (!sp.flying) {
      for (const d of game.world.solidsNear(this.x, this.y, this.radius * 1.5)) {
        const dd = Math.hypot(d.x - this.x, d.y - this.y);
        const min = d.r + this.radius * 0.8;
        if (dd < min && dd > 0.01) {
          this.x -= (d.x - this.x) / dd * (min - dd);
          this.y -= (d.y - this.y) / dd * (min - dd);
        }
      }
    }
  }

  _think(dt, game, crab) {
    // hostiles hunt; everyone else has jobs or nerves
    if (this.hostile) return this._thinkHostile(dt, game, crab);
    if (this.tamed) return this._thinkCompanion(dt, game, crab);
    return this._thinkWild(dt, game, crab);
  }

  _thinkHostile(dt, game, crab) {
    const sp = this.sp;
    // pick the nearest thing worth biting
    let best = null, bd = sp.sense * sp.sense;
    const consider = (e) => {
      if (!e || e.dead) return;
      const d = dist2(this.x, this.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    };
    consider(crab);
    for (const c of game.creatures) if (c.tamed && !c.dead) consider(c);
    // plants are also a target - they eat your work
    if (!best && game.eco.plants.length) {
      const near = game.eco.plantsNear(this.x, this.y, sp.sense * 0.6);
      const alive = near.filter((p) => !p.dead && p.growth > 0.3);
      if (alive.length) best = alive[0];
    }

    if (!best) { this._wander(dt, game, 0.5); return; }
    this.target = best;
    const d = Math.hypot(best.x - this.x, best.y - this.y);
    const reach = this.radius + (best.radius || 6) + 4;

    if (sp.behavior === 'ambush' && d > 60 && this.stateT < 3) {
      // hold still, then burst
      this.vx *= 0.6; this.vy *= 0.6;
      return;
    }

    if (d > reach) {
      this._seek(best.x, best.y, dt, 1);
      this.state = 'hunt';
    } else {
      this.state = 'attack';
      this.vx *= 0.5; this.vy *= 0.5;
      if (this.attackCd <= 0) {
        this.attackCd = 1.15;
        game.combat.creatureAttack(this, best);
      }
    }
  }

  _thinkCompanion(dt, game, crab) {
    // defend: guards and anything angry jump on nearby hostiles
    const guard = this.work === 'guard' || this.alarmed > 0;
    if (guard) {
      let foe = null, bd = (this.work === 'guard' ? 180 : 110) ** 2;
      for (const c of game.creatures) {
        if (!c.hostile || c.dead) continue;
        const d = dist2(this.x, this.y, c.x, c.y);
        if (d < bd) { bd = d; foe = c; }
      }
      if (foe) {
        const d = Math.hypot(foe.x - this.x, foe.y - this.y);
        const reach = this.radius + foe.radius + 4;
        if (d > reach) this._seek(foe.x, foe.y, dt, 1);
        else if (this.attackCd <= 0) {
          this.attackCd = 1.0;
          game.combat.creatureAttack(this, foe);
        }
        this.state = 'defend';
        return;
      }
    }

    // ordered to attack
    if (this.orderTarget && !this.orderTarget.dead) {
      const o = this.orderTarget;
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      const reach = this.radius + (o.radius || 6) + 4;
      if (d > reach) this._seek(o.x, o.y, dt, 1);
      else if (this.attackCd <= 0) {
        this.attackCd = 1.0;
        game.combat.creatureAttack(this, o);
      }
      this.state = 'order';
      return;
    }
    if (this.orderTarget && this.orderTarget.dead) this.orderTarget = null;

    // ordered to a spot
    if (this.orderPoint) {
      const d = Math.hypot(this.orderPoint.x - this.x, this.orderPoint.y - this.y);
      if (d < 14) this.orderPoint = null;
      else { this._seek(this.orderPoint.x, this.orderPoint.y, dt, 1); this.state = 'move'; return; }
    }

    if (this.work) { this._doWork(dt, game); return; }

    // follow the crab, but keep some personal space
    const d = Math.hypot(crab.x - this.x, crab.y - this.y);
    const want = 22 + (this.id % 5) * 5;
    if (d > want * 2.6) this._seek(crab.x, crab.y, dt, 1);
    else if (d > want) this._seek(crab.x, crab.y, dt, 0.55);
    else this._wander(dt, game, 0.25);
    this._separate(dt, game);
    this.state = 'follow';
  }

  _doWork(dt, game) {
    const grove = game.groveCenter;
    const R = Math.max(120, game.eco.groveRadius(grove.x, grove.y));
    const d = Math.hypot(this.x - grove.x, this.y - grove.y);
    if (d > R + 60) { this._seek(grove.x, grove.y, dt, 1); this.state = 'return'; return; }

    this.state = 'work';
    this.workT -= dt;
    if (this.workT > 0) {
      // drift around doing the job
      if (this.workTarget) {
        const wd = Math.hypot(this.workTarget.x - this.x, this.workTarget.y - this.y);
        if (wd > 10) this._seek(this.workTarget.x, this.workTarget.y, dt, 0.7);
        else this._wander(dt, game, 0.2);
      } else this._wander(dt, game, 0.35);
      return;
    }
    this.workT = this.rng.float(7, 15);
    game.doCreatureWork(this);
  }

  _thinkWild(dt, game, crab) {
    const sp = this.sp;
    const dcrab = Math.hypot(crab.x - this.x, crab.y - this.y);

    if (this.fleeT > 0) {
      this.fleeT -= dt;
      this._flee(crab.x, crab.y, dt);
      this.state = 'flee';
      return;
    }

    // skittish around the crab unless it is being fed
    const shy = sp.role === 'companion' ? 26 : 40;
    if (dcrab < shy && !this.beingFed && sp.role !== 'rare') {
      this._flee(crab.x, crab.y, dt, 0.7);
      this.state = 'wary';
      return;
    }

    // drawn to food and water
    switch (sp.behavior) {
      case 'flock': {
        const berry = this._findPlant(game, ['berry', 'ironvine'], 260);
        if (berry) { this._seek(berry.x, berry.y, dt, 0.8); this.state = 'feed'; this._flockWith(dt, game); return; }
        break;
      }
      case 'graze': case 'wade': case 'crawl': case 'bask': {
        const p = this._findPlant(game, null, 200);
        if (p) { this._seek(p.x, p.y, dt, 0.55); this.state = 'feed'; return; }
        break;
      }
      case 'float': {
        this._wander(dt, game, 0.3);
        this.state = 'drift';
        return;
      }
      default: break;
    }
    this._wander(dt, game, 0.55);
    this._separate(dt, game);
    this.state = 'wander';
  }

  _findPlant(game, types, range) {
    const near = game.eco.plantsNear(this.x, this.y, range);
    let best = null, bd = Infinity;
    for (const p of near) {
      if (p.dead || p.growth < 0.5) continue;
      if (types && !types.includes(p.type)) continue;
      const d = dist2(this.x, this.y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // -- steering -------------------------------------------------------------

  _seek(tx, ty, dt, weight = 1) {
    const d = Math.hypot(tx - this.x, ty - this.y) || 1;
    const acc = this.sp.speed * 5 * weight;
    this.vx += (tx - this.x) / d * acc * dt;
    this.vy += (ty - this.y) / d * acc * dt;
  }

  _flee(tx, ty, dt, weight = 1) {
    const d = Math.hypot(tx - this.x, ty - this.y) || 1;
    const acc = this.sp.speed * 6 * weight;
    this.vx -= (tx - this.x) / d * acc * dt;
    this.vy -= (ty - this.y) / d * acc * dt;
  }

  _wander(dt, game, weight = 1) {
    this.wanderA += (Math.random() - 0.5) * dt * 4;
    const acc = this.sp.speed * 1.5 * weight;
    this.vx += Math.cos(this.wanderA) * acc * dt;
    this.vy += Math.sin(this.wanderA) * acc * dt;
    // drift home so nobody wanders off the map
    const hd = Math.hypot(this.x - this.home.x, this.y - this.home.y);
    if (hd > 320) this._seek(this.home.x, this.home.y, dt, 0.5);
  }

  _separate(dt, game) {
    let px2 = 0, py2 = 0, n = 0;
    for (const c of game.creatures) {
      if (c === this || c.dead) continue;
      const d = dist2(this.x, this.y, c.x, c.y);
      const min = (this.radius + c.radius + 4) ** 2;
      if (d < min && d > 0.01) {
        const dd = Math.sqrt(d);
        px2 += (this.x - c.x) / dd;
        py2 += (this.y - c.y) / dd;
        n++;
      }
    }
    if (n) {
      this.vx += (px2 / n) * this.sp.speed * 2.2 * dt;
      this.vy += (py2 / n) * this.sp.speed * 2.2 * dt;
    }
  }

  _flockWith(dt, game) {
    let cx = 0, cy = 0, vx = 0, vy = 0, n = 0;
    for (const c of game.creatures) {
      if (c === this || c.dead || c.sp.id !== this.sp.id) continue;
      if (dist2(this.x, this.y, c.x, c.y) > 90 * 90) continue;
      cx += c.x; cy += c.y; vx += c.vx; vy += c.vy; n++;
    }
    if (!n) return;
    cx /= n; cy /= n; vx /= n; vy /= n;
    this._seek(cx, cy, dt, 0.25);
    this.vx += (vx - this.vx) * 0.6 * dt;
    this.vy += (vy - this.vy) * 0.6 * dt;
    this._separate(dt, game);
  }

  // -- procedural legs ------------------------------------------------------

  _updateFeet(dt, game, speed) {
    if (!this.feet.length) return;
    const world = game.world;
    const R = this.size;
    const thresh = R * (0.55 + speed * 0.004);
    let stepping = 0;
    for (const f of this.feet) if (f.stepping) stepping++;

    for (let i = 0; i < this.feet.length; i++) {
      const f = this.feet[i];
      const a = this.facing + f.side * (Math.PI / 2) + f.spread * -f.side;
      const anchorX = this.x + Math.cos(a) * R * 0.95 + this.vx * 0.09;
      const anchorY = this.y + Math.sin(a) * R * 0.95 + this.vy * 0.09;
      if (f.stepping) {
        f.t += dt / f.dur;
        const t = clamp01(f.t);
        f.fx = lerp(f.ax, f.bx, t);
        f.fy = lerp(f.ay, f.by, t);
        f.fz = Math.sin(Math.PI * t) * f.lift;
        if (t >= 1) { f.stepping = false; f.fz = 0; }
      } else {
        const d = Math.hypot(f.fx - anchorX, f.fy - anchorY);
        const opposite = this.feet[i % 2 === 0 ? i + 1 : i - 1];
        if (d > thresh && stepping < Math.max(1, this.feet.length / 2) && !(opposite && opposite.stepping)) {
          f.stepping = true; stepping++;
          f.t = 0;
          f.dur = clamp(0.17 - speed * 0.0012, 0.06, 0.2);
          f.ax = f.fx; f.ay = f.fy;
          f.bx = anchorX + (anchorX - f.fx) * 0.28;
          f.by = anchorY + (anchorY - f.fy) * 0.28;
          f.lift = R * 0.5;
        }
      }
      f.ground = world.elevAt(f.fx, f.fy);
    }
  }

  // -- draw -----------------------------------------------------------------

  draw(ctx, cam, game) { drawCreature(ctx, cam, game, this); }

  drawLights(renderer, cam) {
    const s = this.sp;
    if (s.id === 'emberbat') {
      const p = cam.worldToScreen(this.x, this.y - this.z);
      renderer.addLight(p.x, p.y, 34 * cam.zoom, '#ff9a4a', 0.5);
    } else if (s.id === 'miragejelly') {
      const p = cam.worldToScreen(this.x, this.y - this.z);
      renderer.addLight(p.x, p.y, 46 * cam.zoom, '#9fe8ff', 0.55);
    } else if (s.id === 'prismling') {
      const p = cam.worldToScreen(this.x, this.y - this.z);
      renderer.addLight(p.x, p.y, 22 * cam.zoom, '#e8ffff', 0.3);
    } else if (s.role === 'hostile' && this.state === 'hunt') {
      const p = cam.worldToScreen(this.x, this.y - this.z);
      renderer.addLight(p.x, p.y - this.size * 0.5, 14 * cam.zoom, s.pal[3], 0.5);
    }
  }

  serialize() {
    return {
      sp: this.sp.id, x: Math.round(this.x), y: Math.round(this.y),
      hp: this.hp, tamed: this.tamed, work: this.work, name: this.name || null,
    };
  }
}

export function creatureFromSave(game, d) {
  const c = new Creature(game, d.sp, d.x, d.y, { tamed: d.tamed });
  c.hp = d.hp ?? c.hpMax;
  c.work = d.work || null;
  if (c.work) c.state = 'work';
  if (d.name) c.name = d.name;
  return c;
}
