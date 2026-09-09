// CRABDEN - moisture, plants and the chain that turns one drop of water into
// a functioning biosphere:  water -> moss -> berries -> birds -> everything.

import { Rng, clamp, clamp01, lerp, TAU, hashStr } from '../lib/math.js';
import { PLANTS, ecoTierFor } from './regions.js';

const CELL = 16;          // moisture grid resolution, world px
const PLANT_CELL = 48;    // plant spatial hash resolution

export class Ecosystem {
  constructor(world, game) {
    this.world = world;
    this.game = game;
    this.cells = new Map();
    this.plants = [];
    this.plantGrid = new Map();
    this.rng = new Rng(0xf00d);
    this.biomass = 0;
    this.tier = ecoTierFor(0);
    this.nextId = 1;
    this.bonuses = { growth: 1, spread: 1, waterUse: 1, dayGrowth: 1 };
    this.stats = { planted: 0, matured: 0, died: 0, byType: {} };
    this._accum = 0;
    this._yieldAccum = { nutrients: 0, food: 0, water: 0 };
  }

  // -- moisture -------------------------------------------------------------

  _key(gx, gy) { return gx + ',' + gy; }

  cellAt(x, y, create = false) {
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL);
    const k = this._key(gx, gy);
    let c = this.cells.get(k);
    if (!c && create) {
      c = { gx, gy, x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2, m: 0, peak: 0 };
      this.cells.set(k, c);
    }
    return c;
  }

  moistureAt(x, y) {
    const c = this.cellAt(x, y);
    return c ? c.m : 0;
  }

  /** Pour water. Returns how much actually soaked in. */
  addWater(x, y, amount, radius = 26) {
    const cells = Math.ceil(radius / CELL);
    const gx0 = Math.floor((x - radius) / CELL), gy0 = Math.floor((y - radius) / CELL);
    let poured = 0;
    for (let gy = gy0; gy <= gy0 + cells * 2; gy++) {
      for (let gx = gx0; gx <= gx0 + cells * 2; gx++) {
        const px = gx * CELL + CELL / 2, py = gy * CELL + CELL / 2;
        const d = Math.hypot(px - x, py - y);
        if (d > radius) continue;
        const fall = 1 - d / radius;
        const fert = 0.35 + this.world.fertilityAt(px, py) * 0.65;
        const c = this.cellAt(px, py, true);
        const add = amount * 0.02 * fall * fert;
        const before = c.m;
        c.m = clamp01(c.m + add);
        c.peak = Math.max(c.peak, c.m);
        poured += c.m - before;
      }
    }
    // Seeding: wet fertile ground sprouts on its own, and it sprouts the
    // best thing the surrounding plants can support. That is the whole
    // water -> moss -> berries -> trees chain, and it needs no UI.
    if (this.moistureAt(x, y) > 0.3 && this.world.fertilityAt(x, y) > 0.26 && this.rng.bool(0.06)) {
      this.trySprout(x, y);
    }
    return poured;
  }

  /**
   * Plant the best thing this patch can currently support.
   * Tries a few nearby spots, because the exact point you poured on is often
   * already occupied and giving up there makes watering feel dead.
   */
  trySprout(x, y) {
    const bag = this.game.seedBag || {};
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = this.rng.float(TAU);
      const d = attempt === 0 ? 0 : this.rng.float(9, 36);
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
      if (this.moistureAt(sx, sy) < 0.14) continue;
      const region = this.world.regionAt(sx, sy).region;
      const candidates = region.plants
        .filter((t) => !PLANTS[t].native || (bag[t] || 0) > 0)
        .sort((p, q) => PLANTS[q].tier - PLANTS[p].tier);
      for (const type of candidates) {
        if (!this.canPlant(type, sx, sy)) continue;
        if (PLANTS[type].native) bag[type] = Math.max(0, (bag[type] || 0) - 1);
        return this.plant(type, sx, sy);
      }
    }
    return null;
  }

  /** Rain: top up every live cell plus a scatter around plants. */
  rainTick(dt, strength) {
    for (const c of this.cells.values()) c.m = clamp01(c.m + dt * 0.09 * strength);
    for (const p of this.plants) {
      if (p.dead) continue;
      const c = this.cellAt(p.x, p.y, true);
      c.m = clamp01(c.m + dt * 0.14 * strength);
    }
  }

  // -- plants ---------------------------------------------------------------

  _pkey(x, y) { return Math.floor(x / PLANT_CELL) + ',' + Math.floor(y / PLANT_CELL); }

  _index(p) {
    const k = this._pkey(p.x, p.y);
    let arr = this.plantGrid.get(k);
    if (!arr) { arr = []; this.plantGrid.set(k, arr); }
    arr.push(p);
    p._k = k;
  }
  _unindex(p) {
    const arr = this.plantGrid.get(p._k);
    if (arr) {
      const i = arr.indexOf(p);
      if (i >= 0) arr.splice(i, 1);
    }
  }

  plantsNear(x, y, r) {
    const out = [];
    const c0 = Math.floor((x - r) / PLANT_CELL), c1 = Math.floor((x + r) / PLANT_CELL);
    const d0 = Math.floor((y - r) / PLANT_CELL), d1 = Math.floor((y + r) / PLANT_CELL);
    for (let cy = d0; cy <= d1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const arr = this.plantGrid.get(cx + ',' + cy);
        if (!arr) continue;
        for (const p of arr) if (Math.hypot(p.x - x, p.y - y) <= r) out.push(p);
      }
    }
    return out;
  }

  plantsInBounds(b) {
    const out = [];
    const c0 = Math.floor(b.x0 / PLANT_CELL), c1 = Math.floor(b.x1 / PLANT_CELL);
    const d0 = Math.floor(b.y0 / PLANT_CELL), d1 = Math.floor(b.y1 / PLANT_CELL);
    for (let cy = d0; cy <= d1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const arr = this.plantGrid.get(cx + ',' + cy);
        if (arr) for (const p of arr) out.push(p);
      }
    }
    return out;
  }

  canPlant(type, x, y) {
    const spec = PLANTS[type];
    if (!spec) return false;
    if (this.world.fertilityAt(x, y) < 0.16) return false;
    if (this.plantsNear(x, y, 9).length > 0) return false;
    if (spec.needs.length) {
      const near = this.plantsNear(x, y, spec.spreadRange);
      for (const need of spec.needs) {
        if (!near.some((p) => p.type === need && p.growth >= 0.9 && !p.dead)) return false;
      }
    }
    return true;
  }

  plant(type, x, y, growth = 0.02) {
    const spec = PLANTS[type];
    if (!spec) return null;
    const p = {
      id: this.nextId++,
      type, x, y,
      growth,
      health: 1,
      dead: false,
      decay: 0,
      seed: hashStr(type + this.nextId + Math.round(x) + ',' + Math.round(y)),
      sway: this.rng.float(TAU),
      vary: this.rng.float(0.75, 1.3),
      r: 3,
      yieldT: this.rng.float(2),
      spreadT: this.rng.float(6, 18),
      plant: true,
      mature: false,
      berries: 0,
    };
    this.plants.push(p);
    this._index(p);
    this.stats.planted++;
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
    return p;
  }

  removePlant(p) {
    const i = this.plants.indexOf(p);
    if (i >= 0) this.plants.splice(i, 1);
    this._unindex(p);
  }

  /** Harvest a mature plant for seeds/food. Returns what you got. */
  harvest(p) {
    if (p.dead || p.growth < 0.85) return null;
    if (p.type === 'berry' && p.berries >= 1) {
      const n = Math.floor(p.berries);
      p.berries -= n;
      return { food: n };
    }
    return null;
  }

  // -- simulation -----------------------------------------------------------

  update(dt, game) {
    const weather = game.weather;
    const heat = 1 + (game.currentRegion?.heat ?? 1) * 0.35;
    const drain = weather.waterDrainMult;
    const dayBoost = weather.daylight > 0.35 ? this.bonuses.dayGrowth : 1;

    if (weather.rain > 0.05) this.rainTick(dt, weather.rain);

    // evaporate; drop empty cells so the map does not grow forever
    const evap = dt * 0.005 * heat * clamp(drain, 0.15, 3);
    for (const [k, c] of this.cells) {
      if (c.m <= 0) { this.cells.delete(k); continue; }
      c.m -= evap * (0.55 + c.m * 0.9);
      if (c.m < 0.002) this.cells.delete(k);
    }

    // plants
    let biomass = 0;
    const yieldBucket = this._yieldAccum;
    for (let i = this.plants.length - 1; i >= 0; i--) {
      const p = this.plants[i];
      const spec = PLANTS[p.type];

      if (p.dead) {
        p.decay += dt;
        if (p.decay > 45) {
          this.removePlant(p);
          if (this.bonuses.compost) game.gain('nutrients', spec.tier * 2.5, p.x, p.y);
        }
        continue;
      }

      const cell = this.cellAt(p.x, p.y, true);
      // seedlings drink less than a full-grown bush
      const need = (spec.water / 60) * dt * this.bonuses.waterUse
        * (spec.native ? 0.35 : 1) * (0.45 + p.growth * 0.55);
      const got = Math.min(cell.m, need);
      cell.m -= got;
      const satisfy = need > 0 ? got / need : 1;

      if (satisfy > 0.55) {
        p.health = clamp01(p.health + dt * 0.06);
        const rate = (1 / spec.grow) * dt * this.bonuses.growth * dayBoost * lerp(0.35, 1.2, satisfy);
        if (p.growth < 1) {
          p.growth = clamp01(p.growth + rate);
          if (p.growth >= 1 && !p.mature) {
            p.mature = true;
            this.stats.matured++;
            game.onPlantMature?.(p);
          }
        }
      } else {
        // Established plants hang on much longer than seedlings. A grove
        // should survive you wandering off for a day, not fifteen seconds.
        const hardiness = p.growth >= 1 ? 0.6 : 1;
        p.health -= dt * (0.009 * heat) * hardiness * (1 - satisfy);
        if (p.health <= 0) {
          p.dead = true;
          p.decay = 0;
          this.stats.died++;
          game.onPlantDied?.(p);
        }
      }

      p.r = lerp(2, spec.maxR, p.growth);
      biomass += spec.tier * p.growth * p.health;

      // yields
      if (p.growth >= 0.9) {
        p.yieldT -= dt;
        if (p.yieldT <= 0) {
          p.yieldT = 1;
          for (const [k, v] of Object.entries(spec.gives)) {
            // food is not passive income - you have to go and pick it
            if (k === 'shade' || k === 'food') continue;
            yieldBucket[k] = (yieldBucket[k] || 0) + v * p.health;
          }
          if (spec.gives.food) p.berries = Math.min(8, p.berries + spec.gives.food * 2.2);
        }
        // spread
        p.spreadT -= dt;
        if (p.spreadT <= 0) {
          p.spreadT = this.rng.float(9, 26);
          if (this.rng.bool(spec.spread * this.bonuses.spread * 0.5)) {
            const a = this.rng.float(TAU);
            const d = this.rng.float(14, spec.spreadRange * this.bonuses.spread);
            const nx = p.x + Math.cos(a) * d, ny = p.y + Math.sin(a) * d;
            if (this.moistureAt(nx, ny) > 0.12 && this.canPlant(p.type, nx, ny)) this.plant(p.type, nx, ny);
          }
        }
      }
    }

    // flush accumulated yields once a second so the HUD ticks nicely
    this._accum += dt;
    if (this._accum >= 1) {
      this._accum = 0;
      for (const [k, v] of Object.entries(yieldBucket)) {
        if (v > 0) { game.gain(k, v); yieldBucket[k] = 0; }
      }
    }

    this.biomass = biomass;
    const t = ecoTierFor(biomass);
    if (t.t !== this.tier.t) {
      const up = t.t > this.tier.t;
      this.tier = t;
      if (up) game.onEcoTierUp?.(t);
    }
  }

  /** Radius of the living grove around a point (used for spawns and defence). */
  groveRadius(x = 0, y = 0) {
    let far = 0;
    for (const p of this.plants) {
      if (p.dead || p.growth < 0.3) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < 1200) far = Math.max(far, d);
    }
    return Math.min(700, far + 40);
  }

  countType(type) {
    let n = 0;
    for (const p of this.plants) if (p.type === type && !p.dead) n++;
    return n;
  }

  matureCount() {
    let n = 0;
    for (const p of this.plants) if (!p.dead && p.growth >= 1) n++;
    return n;
  }

  /** Visible moisture cells, for the wet-sand overlay. */
  cellsInBounds(b) {
    const out = [];
    for (const c of this.cells.values()) {
      if (c.m > 0.03 && c.x > b.x0 - CELL && c.x < b.x1 + CELL && c.y > b.y0 - CELL && c.y < b.y1 + CELL) out.push(c);
    }
    return out;
  }

  serialize() {
    return {
      cells: [...this.cells.values()].filter((c) => c.m > 0.05).map((c) => [c.gx, c.gy, +c.m.toFixed(3)]),
      plants: this.plants.map((p) => [p.type, Math.round(p.x), Math.round(p.y), +p.growth.toFixed(3), +p.health.toFixed(2), p.dead ? 1 : 0]),
      stats: this.stats,
    };
  }

  deserialize(d) {
    if (!d) return;
    this.cells.clear();
    this.plants.length = 0;
    this.plantGrid.clear();
    for (const [gx, gy, m] of d.cells || []) {
      this.cells.set(this._key(gx, gy), { gx, gy, x: gx * CELL + CELL / 2, y: gy * CELL + CELL / 2, m, peak: m });
    }
    for (const [type, x, y, growth, health, dead] of d.plants || []) {
      const p = this.plant(type, x, y, growth);
      if (p) { p.health = health; p.dead = !!dead; p.mature = growth >= 1; }
    }
    if (d.stats) this.stats = d.stats;
  }
}

export { CELL as MOISTURE_CELL };
