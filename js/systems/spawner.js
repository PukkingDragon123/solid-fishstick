// CRABDEN - who is out there, and when.
// Keeps a believable population around the player, pulls species toward a
// grove that has what they eat, and runs the night raids.

import { TAU, Rng, clamp, clamp01, dist } from '../lib/math.js';
import { Creature } from '../entities/creature.js';
import { SPECIES, SPECIES_LIST, speciesForRegion } from '../entities/species.js';
import { PLANTS } from '../world/regions.js';

const MAX_WILD = 34;

export class Spawner {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(0xbeef);
    this.t = 0;
    this.raid = null;
    this.raidsSurvived = 0;
    this.nextRareT = 120;
    this.attractT = 12;
  }

  update(dt) {
    this.t += dt;

    this._cull();
    if (this.t > 1.4) {
      this.t = 0;
      this._maintain();
    }

    this.attractT -= dt;
    if (this.attractT <= 0) {
      this.attractT = 18;
      this._attractToGrove();
    }

    this.nextRareT -= dt;
    if (this.nextRareT <= 0) {
      this.nextRareT = 240;
      this._maybeRare();
    }

    if (this.raid) this._updateRaid(dt);
  }

  // -- population -----------------------------------------------------------

  _cull() {
    const g = this.game;
    for (let i = g.creatures.length - 1; i >= 0; i--) {
      const c = g.creatures[i];
      if (c.dead && c.deathT > 2.4) { g.creatures.splice(i, 1); continue; }
      if (c.tamed || c.sp.role === 'boss' || c.raider) continue;
      const d = dist(c.x, c.y, g.crab.x, g.crab.y);
      if (d > 900) g.creatures.splice(i, 1);
    }
  }

  _wildCount() {
    let n = 0;
    for (const c of this.game.creatures) if (!c.tamed && !c.dead && !c.raider) n++;
    return n;
  }

  _maintain() {
    const g = this.game;
    const night = g.weather.isNight;
    const region = g.currentRegion;
    const tier = g.eco.tier.t;

    const wanted = clamp(
      6 + tier * 2 + (night ? 3 : 0) + Math.round(g.eco.biomass / 90),
      6, MAX_WILD
    );
    if (this._wildCount() >= wanted) return;

    // hostiles get more common at night and in nasty regions
    const hostileChance = night ? 0.42 + tier * 0.02 : 0.13;
    const wantHostile = this.rng.bool(clamp01(hostileChance));

    const pool = speciesForRegion(region.id, {
      role: wantHostile ? 'hostile' : null,
      ecoTier: tier + 1,
      night,
    }).filter((s) => s.role !== 'boss' && (wantHostile || s.role !== 'hostile'));
    if (!pool.length) return;

    const sp = this.rng.weighted(pool.map((s) => ({ w: 1 / (s.rarity || 1), s }))).s;
    const pos = this._offscreenPoint();
    if (!pos) return;
    this.spawn(sp.id, pos.x, pos.y);
  }

  _offscreenPoint(minR = 190, maxR = 420) {
    const g = this.game;
    for (let i = 0; i < 12; i++) {
      const a = this.rng.float(TAU);
      const r = this.rng.float(minR, maxR);
      const x = g.crab.x + Math.cos(a) * r;
      const y = g.crab.y + Math.sin(a) * r;
      if (!g.world.inBounds(x, y)) continue;
      if (g.cam.isVisible(x, y, 40)) continue;
      return { x, y };
    }
    return null;
  }

  spawn(speciesId, x, y, opts = {}) {
    const g = this.game;
    const c = new Creature(g, speciesId, x, y, opts);
    g.creatures.push(c);
    g.discoverSpecies(speciesId);
    return c;
  }

  /** Plants that "attract" a species pull it toward the grove. */
  _attractToGrove() {
    const g = this.game;
    if (this._wildCount() >= MAX_WILD) return;
    const wanted = new Set();
    for (const p of g.eco.plants) {
      if (p.dead || p.growth < 0.85) continue;
      const spec = PLANTS[p.type];
      for (const a of spec.attracts || []) wanted.add(a + '|' + Math.round(p.x) + '|' + Math.round(p.y));
    }
    if (!wanted.size) return;
    const pick = this.rng.pick([...wanted]).split('|');
    const spId = pick[0];
    const sp = SPECIES[spId];
    if (!sp) return;
    if (sp.ecoTier > g.eco.tier.t + 1) return;
    // don't over-stock one species
    const have = g.creatures.filter((c) => c.sp.id === spId && !c.dead).length;
    if (have >= 5) return;
    const a = this.rng.float(TAU);
    const r = this.rng.float(120, 220);
    const x = +pick[1] + Math.cos(a) * r;
    const y = +pick[2] + Math.sin(a) * r;
    if (!g.world.inBounds(x, y)) return;
    const c = this.spawn(spId, x, y);
    c.home = { x: +pick[1], y: +pick[2] };
    if (g.cam.isVisible(x, y, 100)) g.notify(`${sp.name} arrived.`, 'good');
  }

  _maybeRare() {
    const g = this.game;
    const tier = g.eco.tier.t;
    if (tier < 4) return;
    const rares = SPECIES_LIST.filter((s) => s.role === 'rare' && s.regions.includes(g.currentRegion.id) && (s.ecoTier || 0) <= tier);
    if (!rares.length) return;
    const sp = this.rng.pick(rares);
    if (g.creatures.some((c) => c.sp.id === sp.id && !c.dead)) return;
    const pos = this._offscreenPoint(200, 340);
    if (!pos) return;
    const c = this.spawn(sp.id, pos.x, pos.y);
    g.notify(`Something rare is nearby: ${sp.name}`, 'rare');
    g.audio.play('discover');
    g.particles.text('?', pos.x, pos.y - 20, { color: '#e2c0ff', scale: 2 });
    return c;
  }

  // -- night raids ----------------------------------------------------------

  startRaid() {
    const g = this.game;
    if (this.raid) return;
    const tier = g.eco.tier.t;
    if (tier < 1) return;                   // nothing worth raiding yet
    const strength = 1 + tier + Math.floor(g.weather.day / 3);
    const pool = speciesForRegion(g.currentRegion.id, { role: 'hostile', night: true })
      .filter((s) => s.role === 'hostile');
    if (!pool.length) return;

    const count = clamp(1 + Math.floor(strength * 0.8), 2, 9);
    const grove = g.groveCenter;
    const a0 = this.rng.float(TAU);
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const sp = this.rng.weighted(pool.map((s) => ({ w: 1 / (s.rarity || 1), s }))).s;
      const a = a0 + (i / count) * 1.2 + this.rng.float(-0.2, 0.2);
      const r = 300 + this.rng.float(0, 90);
      const x = grove.x + Math.cos(a) * r;
      const y = grove.y + Math.sin(a) * r;
      if (!g.world.inBounds(x, y)) continue;
      const c = this.spawn(sp.id, x, y, {});
      c.raider = true;
      c.home = { x: grove.x, y: grove.y };
      c.alarmed = 999;
      spawned.push(c);
    }
    if (!spawned.length) return;
    this.raid = { members: spawned, t: 0, count: spawned.length };
    g.onRaidStart(spawned.length);
  }

  _updateRaid(dt) {
    const g = this.game;
    this.raid.t += dt;
    const alive = this.raid.members.filter((c) => !c.dead);
    // push raiders toward the grove if they get distracted
    for (const c of alive) {
      if (!c.target && !c.hostile) continue;
      const d = dist(c.x, c.y, g.groveCenter.x, g.groveCenter.y);
      if (d > 400) c._seek(g.groveCenter.x, g.groveCenter.y, dt, 0.6);
    }
    if (!alive.length) {
      this.raidsSurvived++;
      this.raid = null;
      g.onRaidCleared();
      return;
    }
    // dawn breaks the raid
    if (!g.weather.isNight && this.raid.t > 5) {
      for (const c of alive) { c.raider = false; c.hostile = true; c.home = { x: c.x, y: c.y }; }
      this.raidsSurvived++;
      this.raid = null;
      g.onRaidCleared(true);
    }
  }

  raidRemaining() { return this.raid ? this.raid.members.filter((c) => !c.dead).length : 0; }
}
