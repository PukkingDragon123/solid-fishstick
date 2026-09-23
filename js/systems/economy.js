// CRABDEN - the ledger.
//
// Water is the currency you spend, nutrients are the currency you invest, and
// genes are the currency you cannot buy at all: they only appear when
// something is actually alive on your back. Everything a skill, evolution,
// building or companion does lands here as a stat, and the rest of the game
// reads stats rather than checking for particular upgrades.

import { clamp, clamp01, lerp } from '../lib/math.js';
import { SKILL_BY_ID, SKILLS, EVO_BY_ID, EVOLUTIONS, BUILD_BY_ID, GENE_BY_ID } from '../data/progress.js';
import { FLORA_BY_ID } from '../data/flora.js';

const BASE = {
  pumpGain: 6, waterMax: 200, pondGain: 0, nightWater: 0,
  // how many spores the gland will hold at once
  sporeMax: 8,
  plots: 0, upkeep: 0, grow: 1, yield: 1, berryRate: 1,   // `plots` is carrying capacity now
  ripen: 1, attract: 1, trust: 1, fleetSlots: 3, orders: false,
  speed: 1, armour: 0, hp: 0, dmg: 18, dig: false, light: 0, warn: 0,
  // newer systems: reviving the ground, digging things up, breeding, fighting
  green: 0, fossil: 0, breed: 0, armourPierce: 0, stun: 0, slope: 0, breach: false,
};

export class Economy {
  constructor(game) {
    this.game = game;
    this.water = 60;
    this.nutrients = 0;
    this.berries = 0;
    this.parasites = 0;
    this.skills = new Set();
    this.evolutions = new Set();
    this.genes = new Set();
    this.stats = { ...BASE };
    this.dirty = true;
  }

  // -- genes ----------------------------------------------------------------

  /** Genes are expressed, not bought: mature plants and joined animals. */
  recomputeGenes() {
    const g = new Set();
    for (const plot of this.game.garden.plots) {
      if (plot.plant && plot.plant.stage >= 3 && plot.plant.def.gene) g.add(plot.plant.def.gene);
    }
    for (const c of this.game.wildlife.fleet) if (c.def.gene) g.add(c.def.gene);
    let gained = null;
    for (const k of g) if (!this.genes.has(k)) gained = k;
    this.genes = g;
    if (gained) this.game.onGene?.(GENE_BY_ID[gained] || { id: gained, name: gained });
    return gained;
  }

  hasGenes(list) { return (list || []).every((k) => this.genes.has(k)); }
  missingGenes(list) { return (list || []).filter((k) => !this.genes.has(k)); }

  // -- stats ----------------------------------------------------------------

  markDirty() { this.dirty = true; }

  recompute() {
    const s = { ...BASE };
    const apply = (e) => {
      if (!e) return;
      for (const [k, v] of Object.entries(e)) {
        if (typeof v === 'boolean') s[k] = s[k] || v;
        else if (k === 'grow' || k === 'yield' || k === 'attract' || k === 'trust'
          || k === 'speed' || k === 'berryRate' || k === 'ripen') s[k] *= v;
        else s[k] += v;
      }
    };
    for (const id of this.skills) apply(SKILL_BY_ID[id]?.effect);
    for (const id of this.evolutions) apply(EVO_BY_ID[id]?.effect);
    for (const plot of this.game.garden.plots) {
      if (plot.build) apply(BUILD_BY_ID[plot.build.id]?.effect);
      // a mature plant is not just a yield number; it changes what you are
      if (plot.plant && plot.plant.stage >= 3) apply(plot.plant.def.boon);
    }
    // and the base as a whole: past a certain number of things on your back
    // it stops being a pile of structures and starts being somewhere, and
    // somewhere pays - water held, growth, and a shell that bears more
    const rank = baseRank(this.game.garden);
    if (rank.i > 0) apply({ yield: 1 + rank.i * 0.08, waterMax: rank.i * 25, plots: rank.i * 0.5 });
    // companions contribute their working abilities
    for (const c of this.game.wildlife.fleet) {
      switch (c.def.role) {
        case 'pollinator': s.grow *= 0.88; break;
        case 'keeper': s.upkeep -= 0.10; break;
        case 'guard': s.armour += 0.08; break;
        case 'lightbearer': s.light += 0.5; break;
        case 'scout': s.warn += 1; break;
        case 'seeder': s.berryRate *= 1.12; break;
        case 'forager': s.berryRate *= 1.08; break;
        case 'dowser': s.pumpGain += 1; break;
        case 'digger': s.pumpGain += 2; break;
        default: break;
      }
    }
    s.upkeep = clamp(s.upkeep, -0.75, 0.5);
    this.stats = s;
    this.dirty = false;
    return s;
  }

  stat(k) {
    if (this.dirty) this.recompute();
    return this.stats[k];
  }

  // -- spending -------------------------------------------------------------

  canBuySkill(id) {
    const s = SKILL_BY_ID[id];
    if (!s || this.skills.has(id)) return false;
    if (!s.req.every((r) => this.skills.has(r))) return false;
    return this.nutrients >= s.cost;
  }

  buySkill(id) {
    if (!this.canBuySkill(id)) return false;
    const s = SKILL_BY_ID[id];
    this.nutrients -= s.cost;
    this.skills.add(id);
    this.markDirty();
    this.game.onSkill?.(s);
    return true;
  }

  skillState(id) {
    const s = SKILL_BY_ID[id];
    if (this.skills.has(id)) return 'owned';
    if (!s.req.every((r) => this.skills.has(r))) return 'locked';
    return this.nutrients >= s.cost ? 'ready' : 'costly';
  }

  canEvolve(id) {
    const e = EVO_BY_ID[id];
    if (!e || this.evolutions.has(id)) return false;
    if (!e.req.every((r) => this.evolutions.has(r))) return false;
    if (!this.hasGenes(e.genes)) return false;
    return this.nutrients >= e.nutrients;
  }

  evolve(id) {
    if (!this.canEvolve(id)) return false;
    const e = EVO_BY_ID[id];
    this.nutrients -= e.nutrients;
    this.evolutions.add(id);
    this.markDirty();
    if (e.stage) this.game.growCrab(e.stage);
    this.game.onEvolve?.(e);
    return true;
  }

  evoState(id) {
    const e = EVO_BY_ID[id];
    if (this.evolutions.has(id)) return 'owned';
    if (!e.req.every((r) => this.evolutions.has(r))) return 'locked';
    if (!this.hasGenes(e.genes)) return 'genes';
    return this.nutrients >= e.nutrients ? 'ready' : 'costly';
  }

  canBuild(id) {
    const b = BUILD_BY_ID[id];
    if (!b) return false;
    return this.water >= b.cost && this.nutrients >= b.nut;
  }

  build(plotIndex, id) {
    const b = BUILD_BY_ID[id];
    const plot = this.game.garden.plots[plotIndex];
    if (!b || !plot || !plot.unlocked || plot.plant || plot.build || plot.wet) return false;
    if (!this.canBuild(id)) return false;
    this.water -= b.cost;
    this.nutrients -= b.nut;
    plot.build = { id, def: b, age: 0 };
    this.markDirty();
    this.game.onBuilt?.(b, plot);
    return true;
  }

  demolish(plotIndex) {
    const plot = this.game.garden.plots[plotIndex];
    if (!plot || !plot.build) return false;
    const b = plot.build.def;
    plot.build = null;
    this.water += Math.round(b.cost * 0.4);
    this.markDirty();
    return true;
  }

  canPlant(id) {
    const f = FLORA_BY_ID[id];
    return !!f && this.water >= f.cost;
  }

  // -- save -----------------------------------------------------------------

  /**
   * What you can actually do in a fight, drawn from the genome rather than
   * from a list: every expressed gene that carries a combat effect becomes a
   * slot, and the slots come off their own cooldowns.
   */
  abilities() {
    if (!this._abil) this._abil = new Map();
    const out = [];
    for (const id of this.genes) {
      const g = GENE_BY_ID[id];
      if (!g || !g.combat) continue;
      const st = this._abil.get(id) || { cool: 0 };
      this._abil.set(id, st);
      out.push({ id, name: g.name, desc: g.combat.desc || g.desc,
        icon: g.icon || 'bolt', cd: g.combat.cd || 8, cool: st.cool });
    }
    return out;
  }

  /** Fire one, if it is off cooldown. */
  useAbility(id) {
    const list = this.abilities();
    const a = list.find((x) => x.id === id);
    if (!a || a.cool > 0) return null;
    this._abil.get(id).cool = a.cd;
    return a;
  }

  tickAbilities(dt) {
    if (!this._abil) return;
    for (const st of this._abil.values()) if (st.cool > 0) st.cool -= dt;
  }

  toJSON() {
    return {
      water: this.water, nutrients: this.nutrients, berries: this.berries,
      parasites: this.parasites,
      skills: [...this.skills], evolutions: [...this.evolutions],
    };
  }

  fromJSON(d) {
    if (!d) return;
    this.water = d.water ?? 60;
    this.nutrients = d.nutrients ?? 0;
    this.berries = d.berries ?? 0;
    this.parasites = d.parasites ?? 0;
    this.skills = new Set(d.skills || []);
    this.evolutions = new Set(d.evolutions || []);
    this.markDirty();
  }
}


/**
 * What your back has become.
 *
 * Counted off the structures on it, and the number of DIFFERENT ones - a
 * shell with five cisterns on it is a water tank, not a town.
 */
export const BASE_RANKS = [
  { name: 'BARE SHELL', need: 0, kinds: 0 },
  { name: 'CAMP', need: 1, kinds: 1 },
  { name: 'OUTPOST', need: 3, kinds: 2 },
  { name: 'SETTLEMENT', need: 5, kinds: 4 },
  { name: 'TOWN ON A CRAB', need: 7, kinds: 6 },
];
export function baseRank(garden) {
  const built = garden.plots.filter((p) => p.build);
  const kinds = new Set(built.map((p) => p.build.id)).size;
  let i = 0;
  for (let k = 0; k < BASE_RANKS.length; k++) {
    if (built.length >= BASE_RANKS[k].need && kinds >= BASE_RANKS[k].kinds) i = k;
  }
  const next = BASE_RANKS[i + 1] || null;
  return { i, name: BASE_RANKS[i].name, built: built.length, kinds, next };
}
