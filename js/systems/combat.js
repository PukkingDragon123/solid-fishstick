// CRABDEN - damage resolution and the crab's active abilities.
// Combat is meant to be swung, not watched: everything here is triggered by a
// player input or a creature decision, never by a timer alone.

import { clamp01, dist, angleDelta, rgba } from '../lib/math.js';
export class Combat {
  constructor(game) {
    this.game = game;
    this.hitStop = 0;
  }

  update(dt) {
    this.hitStop = Math.max(0, this.hitStop - dt);
  }

  _impact(x, y, color, n = 6, big = false) {
    const g = this.game;
    g.particles.burst('chunk', x, y, n, {
      color, speedMin: 16, speedMax: 60, life: 0.4, grav: 130, lift: 24,
    });
    g.particles.ring(x, y, { r0: 2, r1: big ? 26 : 14, life: 0.28, color: rgba(color, 0.9), flat: 0.5 });
    this.hitStop = big ? 0.075 : 0.045;
  }

  // -- crab -----------------------------------------------------------------

  crabSwing(crab, angle) {
    const g = this.game;
    const s = crab.stats;
    const reach = crab.size * 3.4 * s.clawSize + 6;
    const arc = 1.15;
    let hits = 0;

    for (const c of g.creatures) {
      if (c.dead || c.tamed) continue;
      if (!c.hostile && !g.settings.attackNeutrals) continue;
      const d = dist(crab.x, crab.y, c.x, c.y);
      if (d > reach + c.radius) continue;
      const a = Math.atan2(c.y - crab.y, c.x - crab.x);
      if (Math.abs(angleDelta(angle, a)) > arc) continue;
      const crit = Math.random() < s.critChance;
      const dmg = s.clawDmg * (crit ? 2.2 : 1);
      c.hurt(dmg, crab.x, crab.y, crab);
      this._impact(c.x, c.y - c.size * 0.4, c.pal[3], crit ? 10 : 6, crit);
      if (crit) g.particles.text('CRACK!', c.x, c.y - c.size - 10, { color: '#ffe07a', scale: 1, shake: 3 });
      // knockback
      const kb = 120 * s.knockback;
      c.vx += Math.cos(a) * kb;
      c.vy += Math.sin(a) * kb;
      hits++;
    }

    // swing visual
    const px2 = crab.x + Math.cos(angle) * reach * 0.7;
    const py2 = crab.y + Math.sin(angle) * reach * 0.7;
    g.particles.burst('sand', px2, py2, 4, {
      color: g.currentRegion.pal.crest, speedMin: 10, speedMax: 30, life: 0.25, angle, spread: arc * 2, grav: 60,
    });
    if (hits) g.audio.play('hit');
    return hits;
  }

  areaDamage(x, y, radius, dmg, source, opts = {}) {
    const g = this.game;
    let hits = 0;
    for (const c of g.creatures) {
      if (c.dead) continue;
      if (opts.hostileOnly !== false && !c.hostile) continue;
      const d = dist(x, y, c.x, c.y);
      if (d > radius + c.radius) continue;
      c.hurt(dmg * (1 - clamp01(d / radius) * 0.4), x, y, source);
      if (opts.knock) {
        const a = Math.atan2(c.y - y, c.x - x);
        c.vx += Math.cos(a) * opts.knock;
        c.vy += Math.sin(a) * opts.knock;
      }
      hits++;
    }
    return hits;
  }

  // -- creature attacks -----------------------------------------------------

  creatureAttack(attacker, target) {
    const g = this.game;
    const dmg = attacker.sp.dmg * (attacker.tamed ? g.evo.stats.companionDmg : 1);

    if (target === g.crab) {
      if (g.state === 'dead') return;
      g.crab.hurt(dmg, attacker.x, attacker.y, attacker);
      if (attacker.sp.drain) g.crab.water = Math.max(0, g.crab.water - attacker.sp.drain);
    } else if (target.plant) {
      target.health -= 0.5;
      g.particles.burst('leaf', target.x, target.y, 4, { color: '#5d8f47', speedMin: 8, speedMax: 24, life: 0.5, grav: 40 });
      if (target.health <= 0 && !target.dead) {
        target.dead = true;
        g.eco.stats.died++;
        g.notify('Something ate a plant.', 'bad');
      }
    } else if (target.hurt) {
      target.hurt(dmg, attacker.x, attacker.y, attacker);
    }

    this._impact(target.x, target.y - (target.size || 6) * 0.4, attacker.pal[3], 5);
    attacker.state = 'attack';
    // lunge
    const a = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    attacker.vx += Math.cos(a) * 60;
    attacker.vy += Math.sin(a) * 60;
    if (g.cam.isVisible(attacker.x, attacker.y, 60)) g.audio.play('hit');
  }

  // -- abilities ------------------------------------------------------------

  waterBlast(x, y) {
    const g = this.game, crab = g.crab;
    const cost = 3;
    if (crab.water < cost) { g.audio.play('deny'); g.notify('Not enough water.', 'bad'); return false; }
    crab.water -= cost;
    const a = Math.atan2(y - crab.y, x - crab.x);
    const range = 62;
    const tx = crab.x + Math.cos(a) * range;
    const ty = crab.y + Math.sin(a) * range;

    for (let i = 0; i < 22; i++) {
      const t = i / 22;
      g.particles.spawn('drop', crab.x + Math.cos(a) * range * t, crab.y + Math.sin(a) * range * t, {
        color: i % 3 ? '#8fd8ee' : '#d8f6ff', life: 0.4 + t * 0.3, size: 1,
        vx: Math.cos(a) * 60 + (Math.random() - 0.5) * 30,
        vy: Math.sin(a) * 60 + (Math.random() - 0.5) * 30,
        vz: 6, grav: 70, glow: 4, layer: 'over',
      });
    }
    g.particles.ring(tx, ty, { r0: 4, r1: 34, life: 0.35, color: '#9fe8ff' });
    this.areaDamage(tx, ty, 26, g.evo.stats.blastDmg, crab, { knock: 150 });
    g.eco.addWater(tx, ty, 14, 24);
    g.audio.play('splash');
    g.cam.addShake(1.6);
    return true;
  }

  shellSlam() {
    const g = this.game, crab = g.crab;
    g.particles.ring(crab.x, crab.y, { r0: 4, r1: 52, life: 0.4, color: '#ffd9a0', width: 2 });
    g.particles.burst('sand', crab.x, crab.y, 26, {
      color: g.currentRegion.pal.crest, speedMin: 30, speedMax: 90, life: 0.6, grav: 90, lift: 26,
    });
    const hits = this.areaDamage(crab.x, crab.y, 46, g.evo.stats.clawDmg * 1.4, crab, { knock: 210 });
    g.cam.addShake(4.5);
    g.audio.play('hit');
    if (hits) g.particles.text('SLAM', crab.x, crab.y - 20, { color: '#ffd9a0', scale: 2, shake: 4 });
    return true;
  }

  /** Summon every bird you own to peck one target. */
  birdCall(target) {
    const g = this.game;
    const birds = g.creatures.filter((c) => c.tamed && !c.dead && (c.sp.form === 'bird' || c.sp.form === 'bat'));
    if (!birds.length) { g.notify('No birds to call.', 'bad'); g.audio.play('deny'); return false; }
    for (const b of birds) {
      b.orderTarget = target || null;
      b.alarmed = 8;
      if (!target) {
        b.orderPoint = { x: g.crab.x + (Math.random() - 0.5) * 40, y: g.crab.y + (Math.random() - 0.5) * 40 };
      }
      g.particles.spawn('spark', b.x, b.y, { color: '#ffe9a0', life: 0.6, glow: 5, vz: 10, grav: 8 });
    }
    g.audio.play('chirp', { pitch: 1.2 });
    g.particles.ring(g.crab.x, g.crab.y, { r0: 6, r1: 90, life: 0.6, color: '#ffe9a0' });
    g.notify(`${birds.length} bird${birds.length > 1 ? 's' : ''} answered.`, 'good');
    return true;
  }

  /** Order all companions onto a target. */
  commandStrike(target) {
    const g = this.game;
    const pals = g.creatures.filter((c) => c.tamed && !c.dead);
    if (!pals.length) { g.notify('Nobody to command.', 'bad'); return false; }
    for (const c of pals) { c.orderTarget = target; c.alarmed = 8; }
    g.particles.ring(g.crab.x, g.crab.y, { r0: 6, r1: 110, life: 0.5, color: '#ffb45a' });
    g.audio.play('uiBig');
    return true;
  }

  mistVeil() {
    const g = this.game, crab = g.crab;
    crab.invuln = Math.max(crab.invuln, 2.2);
    g.particles.burst('puff', crab.x, crab.y, 18, {
      color: rgba('#cfeff8', 0.8), speedMin: 6, speedMax: 26, life: 1.6, grav: -4,
    });
    for (const c of g.creatures) {
      if (!c.hostile || c.dead) continue;
      if (dist(crab.x, crab.y, c.x, c.y) < 70) { c.alarmed = 0; c.state = 'wander'; c.target = null; c.stateT = 0; }
    }
    g.audio.play('water');
    return true;
  }
}
