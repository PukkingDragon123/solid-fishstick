// CRABDEN - the nest.
//
// Everything you have tamed earns its keep. While it lives on and around
// you, an animal forages, grazes, pollinates and digs, and what it brings
// back piles up in a nest on your shell - growth, mostly, and the odd lump of
// something a digger turned up. You collect it when you like, and you can
// build the nest up so it holds more and the animals bring more.
//
// It keeps working while you are away. Come back after an hour and the nest
// has an hour's worth in it (at half pace: they are animals, not employees).
//
// This is the idle half of the game: the more you have collected, the more
// your back earns on its own, and the more you can afford to go and explore.

/** What one tamed animal brings in per minute, by how rare it is. */
const PER_MIN = [3, 5, 8, 12, 16];
/** Roles that are better at bringing things home. */
const ROLE_MUL = { forager: 1.5, grazer: 1.4, seeder: 1.4, pollinator: 1.3, digger: 1.1, keeper: 1.1 };
const OFFLINE_CAP = 2 * 3600;   // seconds
const OFFLINE_RATE = 0.5;

export class Ranch {
  constructor(game) {
    this.game = game;
    this.store = 0;          // growth waiting in the nest
    this.finds = {};         // item id -> count, waiting in the nest
    this.level = 1;          // how built-up the nest is
    this.earned = 0;         // lifetime, for the book of records
    this.away = null;        // { secs, got } shown once on coming back
    this.pop = 0;            // a little bounce when something lands in it
    this.findT = 30;
  }

  /** Growth per minute, from everything that is yours and alive. */
  get rate() {
    const g = this.game;
    let r = 0;
    for (const c of g.wildlife?.fleet || []) {
      if (!c.alive) continue;
      const base = PER_MIN[Math.max(0, Math.min(4, c.def.tier || 0))];
      r += base * (ROLE_MUL[c.def.role] || 1);
    }
    return r * this.mul;
  }

  get mul() {
    // every level of nest is a fifth more, and a roost on your back helps
    const roosts = (this.game.garden?.plots || []).filter((p) => p.build === 'roostbox').length;
    return 1 + (this.level - 1) * 0.2 + roosts * 0.15;
  }

  get cap() { return Math.round(60 + (this.level - 1) * 60); }

  /** What the next level costs, in growth. */
  get upgradeCost() { return Math.round(40 * Math.pow(1.9, this.level - 1)); }

  canUpgrade() { return this.level < 10 && (this.game.economy?.nutrients || 0) >= this.upgradeCost; }

  upgrade() {
    if (!this.canUpgrade()) return false;
    this.game.economy.nutrients -= this.upgradeCost;
    this.level++;
    this.game.economy.markDirty?.();
    this.game.audio?.play('evolve', { pitch: 1.2 });
    return true;
  }

  update(dt) {
    this.pop = Math.max(0, this.pop - dt * 2.5);
    const r = this.rate;
    if (r <= 0) return;
    const before = Math.floor(this.store);
    this.store = Math.min(this.cap, this.store + (r / 60) * dt);
    if (Math.floor(this.store) > before && Math.floor(this.store) % 5 === 0) this.pop = 1;
    // diggers turn things up now and then
    this.findT -= dt;
    if (this.findT <= 0) {
      this.findT = 40 + Math.random() * 40;
      const diggers = (this.game.wildlife?.fleet || []).filter((c) => c.alive && (c.def.role === 'digger' || ['insect', 'arachnid', 'myriapod'].includes(c.def.clade)));
      if (diggers.length) {
        const pool = ['grit', 'shellchip', 'saltcake', 'silica', 'copperore'];
        const id = pool[Math.floor(Math.random() * pool.length)];
        this.finds[id] = (this.finds[id] || 0) + 1;
        this.pop = 1;
      }
    }
  }

  get pending() {
    let n = Math.floor(this.store);
    for (const v of Object.values(this.finds)) n += v;
    return n;
  }

  /** Empty the nest into your stores. Returns { growth, finds }. */
  collect() {
    const g = this.game;
    const got = Math.floor(this.store);
    const finds = { ...this.finds };
    if (got <= 0 && !Object.keys(finds).length) return null;
    this.store -= got;
    this.finds = {};
    if (g.economy) { g.economy.nutrients += got; g.economy.markDirty?.(); }
    for (const [id, n] of Object.entries(finds)) g.craft?.add(id, n);
    this.earned += got;
    g.audio?.play('pickup', { pitch: 1.3 });
    return { growth: got, finds };
  }

  toJSON() {
    return { store: this.store, finds: this.finds, level: this.level, earned: this.earned, at: Date.now() };
  }

  fromJSON(d) {
    if (!d) return;
    this.store = d.store || 0;
    this.finds = d.finds || {};
    this.level = d.level || 1;
    this.earned = d.earned || 0;
    this._savedAt = d.at || 0;
  }

  /**
   * Called once the fleet is back after a load: credit the time you were
   * away. Kept separate from fromJSON because the rate needs the animals.
   */
  creditAway() {
    if (!this._savedAt) return;
    const secs = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - this._savedAt) / 1000));
    this._savedAt = 0;
    if (secs < 60) return;
    const r = this.rate;
    if (r <= 0) return;
    const add = Math.min(this.cap - this.store, (r / 60) * secs * OFFLINE_RATE);
    if (add < 1) return;
    this.store += add;
    this.away = { secs, got: Math.floor(add) };
  }
}

