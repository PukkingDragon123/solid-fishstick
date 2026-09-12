// CRABDEN - the bag and the bench.
//
// The bag is hers. She is the one with hands, so everything mined goes into
// her pack, and everything made comes out of it. That is deliberate: the whole
// reason to take her over is that she can hold things and you cannot.
//
// A recipe needs what it needs and is worked where it is worked - in the hand,
// at the kiln, or at the bench - and the kiln and the bench are both things
// you build on your own back. So the crafting tree runs through the garden:
// mine, refine on the animal, build on the animal, mine deeper.

import { RECIPES, RECIPE_BY_ID, ITEM_BY_ID, STATIONS } from '../data/craft.js';

export class Craft {
  constructor(game) {
    this.game = game;
    this.bag = new Map();          // item id -> count
    this.job = null;               // what is being made right now
    this.made = new Set();         // every recipe worked at least once
  }

  // -- the bag --------------------------------------------------------------

  count(id) { return this.bag.get(id) || 0; }

  add(id, n = 1) {
    if (!ITEM_BY_ID[id] || n <= 0) return 0;
    this.bag.set(id, this.count(id) + n);
    return n;
  }

  take(id, n = 1) {
    const have = this.count(id);
    if (have < n) return false;
    if (have === n) this.bag.delete(id); else this.bag.set(id, have - n);
    return true;
  }

  /** Everything in the bag, ordered the way the tree is, for the panel. */
  list() {
    return [...this.bag.entries()]
      .map(([id, n]) => ({ def: ITEM_BY_ID[id], n }))
      .filter((e) => e.def)
      .sort((a, b) => (a.def.tier - b.def.tier) || a.def.name.localeCompare(b.def.name));
  }

  /** The best pick she is carrying, as a power. Nothing means bare hands. */
  get pickPower() {
    let best = 0;
    for (const [id] of this.bag) {
      const d = ITEM_BY_ID[id];
      if (d && d.tool === 'pick') best = Math.max(best, d.power);
    }
    return best;
  }

  has(id) { return this.count(id) > 0; }

  // -- the bench ------------------------------------------------------------

  /**
   * A station is available if the build it needs is standing on the shell.
   * `hand` is always available, because hands are what she is for.
   */
  stationUp(at) {
    const st = STATIONS[at];
    if (!st) return false;
    if (!st.build) return true;
    return this.game.garden.plots.some((p) => p.build && p.build.def.id === st.build);
  }

  /** Why this cannot be made, or null if it can. */
  blocked(r) {
    if (!this.stationUp(r.at)) return `needs the ${STATIONS[r.at].name.toLowerCase()}`;
    for (const [id, n] of r.need) {
      if (this.count(id) < n) return `needs ${n} ${ITEM_BY_ID[id].name}`;
    }
    return null;
  }

  canMake(r) { return !this.blocked(r); }

  /** Everything, with its reason, so the panel can grey rather than hide. */
  recipes() {
    return RECIPES.map((r) => ({ r, why: this.blocked(r) }));
  }

  /**
   * Start making something. It takes time and she has to stand still doing
   * it, which is what stops the bench being a vending machine.
   */
  start(id) {
    const r = RECIPE_BY_ID[id];
    if (!r) return { ok: false, why: 'No such thing.' };
    const why = this.blocked(r);
    if (why) return { ok: false, why };
    if (this.job) return { ok: false, why: 'Already making something.' };
    for (const [need, n] of r.need) this.take(need, n);
    this.job = { r, t: 0 };
    return { ok: true };
  }

  update(dt) {
    const j = this.job;
    if (!j) return;
    j.t += dt;
    if (j.t < j.r.secs) return;
    this.job = null;
    this.add(j.r.out[0], j.r.out[1]);
    this.made.add(j.r.id);
    this.game.onCrafted?.(j.r);
  }

  get progress() { return this.job ? Math.min(1, this.job.t / this.job.r.secs) : 0; }

  toJSON() { return { bag: [...this.bag], made: [...this.made] }; }

  fromJSON(d) {
    if (!d) return;
    this.bag = new Map(d.bag || []);
    this.made = new Set(d.made || []);
  }
}
