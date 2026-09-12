// CRABDEN - who shows up, and why.
//
// Creatures are not spawned on a timer. Each species scores the shell you are
// carrying - which genes it expresses, how lush it is, whether there is
// standing water - and only walks out of the desert when the score is worth
// the trip. Hostiles score you too, on how much you have worth taking.

import { clamp, clamp01, lerp } from '../lib/math.js';
import { Creature, MOOD } from '../entities/creature.js';
import { FAUNA, FAUNA_BY_ID, WILD, HOSTILE } from '../data/fauna.js';

const MAX_WILD = 9;
const MAX_HOSTILE = 5;

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnT = 3;
    this.ambushT = 100;
    this.seen = new Set();
    this.orders = 'follow';
  }

  get fleet() { return this.list.filter((c) => c.tamed && c.alive); }
  get wild() { return this.list.filter((c) => !c.tamed && !c.hostile && c.alive); }
  get hostiles() { return this.list.filter((c) => c.hostile && c.alive); }

  /**
   * The nearest fresh body. Anything that eats meat will cross a basin for
   * one, and a body that has been picked over is no longer worth crossing for.
   */
  nearestKill(x, r = 150) {
    let best = null, bd = r;
    for (const c of this.list) {
      if (c.alive || c.moodT > 26 || (c.eaten || 0) > 5) continue;
      const d = Math.abs(c.x - x);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /** How much a species wants to live on the current shell, 0..1. */
  attraction(def) {
    if (def.hostile || !def.attract) return 0;
    const g = this.game;
    const need = def.attract;
    let score = 0;
    if (need.genes) {
      const have = need.genes.filter((k) => g.genes.has(k)).length;
      if (!have) return 0;
      score += 0.55 * (have / need.genes.length);
    }
    const lush = g.garden.lushness;
    score += clamp01((lush - (need.lush || 0)) * 1.6) * 0.3;
    if (need.pond) score *= clamp01((g.garden.pond - need.pond + 0.25) * 2.2);
    if (need.lush && lush < need.lush * 0.7) score *= 0.35;
    return clamp01(score);
  }

  spawn(id, x) {
    const def = FAUNA_BY_ID[id];
    if (!def) return null;
    const c = new Creature(this.game, def, x);
    this.list.push(c);
    if (!this.seen.has(id)) {
      this.seen.add(id);
      this.game.onFirstSighting?.(def);
    }
    return c;
  }

  /** Somewhere off screen, on the ground, in front of or behind the crab. */
  _edgeX() {
    const cx = this.game.crab.x;
    const side = Math.random() < 0.5 ? -1 : 1;
    return cx + side * (170 + Math.random() * 110);
  }

  update(dt) {
    const g = this.game;
    const night = g.weather.nightMix > 0.45;

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4 + Math.random() * 6;
      if (this.wild.length < MAX_WILD) {
        // weight every species by how much it wants to be here
        const pool = [];
        for (const def of WILD) {
          const a = this.attraction(def);
          if (a > 0.18 && (!def.night || night || Math.random() < 0.3)) pool.push({ def, a });
        }
        if (pool.length) {
          let total = pool.reduce((s, p) => s + p.a, 0);
          let r = Math.random() * total;
          for (const p of pool) { r -= p.a; if (r <= 0) { this.spawn(p.def.id, this._edgeX()); break; } }
        }
      }
    }

    // hostiles: night raids, and ambushes on whatever you are carrying.
    // nothing bothers a bare rock, so the clock only runs once you have
    // something worth taking.
    const worth = g.garden.planted.length > 0 || g.wildlife?.fleet.length > 0;
    if (worth) {
      this.ambushT -= dt * (night ? 1.6 : 0.5) * (0.6 + g.garden.lushness * 1.2);
      if (this.ambushT <= 0) {
        this.ambushT = 55 + Math.random() * 60;
        if (this.hostiles.length < MAX_HOSTILE) this.ambush(night);
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.orders = c.tamed ? this.orders : undefined;
      c.update(dt);
      const far = Math.abs(c.x - g.crab.x) > 620;
      if (!c.alive && c.moodT > 4) { this.list.splice(i, 1); continue; }
      if (far && !c.tamed) { this.list.splice(i, 1); continue; }
      if (far && c.tamed) { c.x = g.crab.x - Math.sign(c.x - g.crab.x) * 60; }
      if (c.hostile && Math.abs(c.x - g.crab.x) > 400) { this.list.splice(i, 1); }
    }
  }

  /** A staged ambush: they come up out of the sand just ahead of you. */
  ambush(night) {
    const g = this.game;
    const tier = Math.min(4, Math.floor(g.crab.m.t * 4 + g.garden.lushness * 2));
    const pool = HOSTILE.filter((h) => h.tier <= tier && (!h.night || night));
    if (!pool.length) return;
    const def = pool[Math.floor(Math.random() * pool.length)];
    const ahead = g.crab.x + (g.crab.facing || 1) * (110 + Math.random() * 70);
    const n = def.packs || 1;
    for (let i = 0; i < n; i++) {
      const c = this.spawn(def.id, ahead + i * 16 * (Math.random() < 0.5 ? 1 : -1));
      if (c) {
        c.y = g.terrain.surfaceY(c.x) + 6;    // erupt from under the sand
        g.terrain.deform(c.x, 5, 12);
        g.fx?.dust(c.x, g.terrain.surfaceY(c.x), 2.4);
      }
    }
    g.onAmbush?.(def, n);
  }

  /** Offer fruit and water; enough of both and it joins you. */
  tryTame(c) {
    const g = this.game;
    if (!c || c.tamed || c.hostile || !c.alive) return { ok: false, why: 'no' };
    const need = c.def.tame || { berries: 1, water: 20 };
    if (g.berries < need.berries) return { ok: false, why: `needs ${need.berries} berries` };
    if (g.water < need.water) return { ok: false, why: `needs ${need.water} water` };
    if (c.trust < 0.5) return { ok: false, why: 'not settled yet' };
    g.berries -= need.berries;
    g.water -= need.water;
    c.tamed = true;
    c.trust = 1;
    c.mood = MOOD.FOLLOW;
    g.fx?.spark(c.x, c.y - 6, '#ffe9a8', 12, 40);
    g.onTamed?.(c);
    return { ok: true };
  }

  nearestHostile(x, r) {
    let best = null, bd = r;
    for (const c of this.hostiles) {
      const d = Math.abs(c.x - x);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  nearest(x, y, r = 40, filter) {
    let best = null, bd = r * r;
    for (const c of this.list) {
      if (!c.alive) continue;
      if (filter && !filter(c)) continue;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  setOrders(o) {
    this.orders = o;
    for (const c of this.fleet) {
      if (o !== 'ride' && c.onShell) c.leaveShell();
    }
  }

  draw(ctx, cam, layer) {
    for (const c of this.list) {
      if (!cam.isVisible(c.x, c.y, 60)) continue;
      const onShell = c.onShell;
      if ((layer === 'shell') !== onShell) continue;
      c.draw(ctx, cam);
    }
  }

  toJSON() {
    return {
      seen: [...this.seen], orders: this.orders,
      fleet: this.fleet.map((c) => ({ id: c.def.id, shellU: c.shellU })),
    };
  }

  fromJSON(d) {
    if (!d) return;
    this.seen = new Set(d.seen || []);
    this.orders = d.orders || 'follow';
    for (const f of d.fleet || []) {
      const c = this.spawn(f.id, this.game.crab.x + (Math.random() - 0.5) * 60);
      if (c) { c.tamed = true; c.trust = 1; c.shellU = f.shellU ?? 0.5; }
    }
  }
}
