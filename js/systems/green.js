// CRABDEN - bringing it back.
//
// The basin was a sea. You were the reason it was a sea: the spring in your
// back fed it for however long you were awake the first time, and when you
// stopped, it stopped. So the most interesting thing you can do with the water
// you pump is not drink it - it is spill it.
//
// This keeps a map of how alive the ground is, cell by cell, over the whole
// world. Water that comes off your shell soaks in; sun and wind take it back;
// and where it holds long enough, things come up on their own and stay up.

import { clamp, clamp01, lerp, mulberry32, hashStr } from '../lib/math.js';
import { FLORA_BY_ID } from '../data/flora.js';
import { landmarksNear } from '../world/landmarks.js';

const CELL = 24;              // world units per cell of the life map
const SEEDABLE = 0.55;        // how alive the ground has to be before it seeds

export class Green {
  constructor(game) {
    this.game = game;
    this.life = new Map();    // cell index -> 0..1 how alive the ground is
    this.plants = new Map();  // cell index -> what came up there
    this.t = 0;
    this.total = 0;           // cells you have brought all the way back
  }

  // -- the map --------------------------------------------------------------

  at(x) { return this.life.get(Math.round(x / CELL)) || 0; }

  /** Water landing on the ground. `amount` is roughly litres of consequence. */
  water(x, amount, radius = 40) {
    const gain = amount * (this.game.economy ? 1 + this.game.economy.stat('green') : 1);
    const i0 = Math.round((x - radius) / CELL), i1 = Math.round((x + radius) / CELL);
    for (let i = i0; i <= i1; i++) {
      const k = 1 - clamp01(Math.abs(i * CELL - x) / radius);
      if (k <= 0) continue;
      const cur = this.life.get(i) || 0;
      const next = clamp01(cur + gain * k * k);
      if (cur < 1 && next >= 1) this.total++;
      this.life.set(i, next);
    }
  }

  update(dt, weather) {
    this.t += dt;
    this._soakOases(dt);
    // it dries out, faster in heat and haze, slower where it is already lush
    const heat = weather ? 0.5 + weather.heat * 0.7 : 1;
    const night = weather && (weather.hour > 20 || weather.hour < 5) ? 0.35 : 1;
    const rate = 0.0055 * heat * night;
    const cx = this.game.crab.x;
    const keep = 3200;
    for (const [i, v] of this.life) {
      const x = i * CELL;
      if (Math.abs(x - cx) > keep) { this.life.delete(i); this.plants.delete(i); continue; }
      // established ground holds its own water; bare wet sand does not
      const held = this.plants.has(i) ? 0.25 : 1;
      const nv = Math.max(0, v - rate * dt * 60 * held * (1 - v * 0.45));
      if (nv <= 0.001) { this.life.delete(i); this.plants.delete(i); continue; }
      this.life.set(i, nv);
      // where it has held long enough, something comes up
      if (nv > SEEDABLE && !this.plants.has(i) && Math.random() < dt * 0.09) this._seed(i);
    }
  }

  /**
   * An oasis is not a wet patch, it is a place. Standing water holds the
   * ground around it green on its own, for ever, without you - which is what
   * makes walking into one feel like arriving somewhere.
   */
  _soakOases(dt) {
    const g = this.game;
    for (const lm of landmarksNear(g.world.seed, g.crab.x, 900)) {
      if (lm.kind !== 'oasis') continue;
      const i0 = Math.round((lm.x - lm.size) / CELL), i1 = Math.round((lm.x + lm.size) / CELL);
      for (let i = i0; i <= i1; i++) {
        const k = 1 - clamp01(Math.abs(i * CELL - lm.x) / lm.size);
        if (k <= 0.05) continue;
        // wettest in the middle, tailing off up the banks
        const floor = clamp01(Math.pow(k, 0.7) * 1.15);
        const cur = this.life.get(i) || 0;
        if (cur < floor) this.life.set(i, Math.min(floor, cur + dt * 0.6));
        if (floor > SEEDABLE && !this.plants.has(i) && Math.random() < dt * 0.5) this._seed(i);
      }
    }
  }

  /** Something takes root here. What takes root depends on how wet it is. */
  _seed(i) {
    const v = this.life.get(i) || 0;
    const r = mulberry32(hashStr('green' + i))();
    // what comes up depends on how wet the ground is: reeds and ferns in an
    // oasis floor, grass on the banks, moss on damp sand
    const pool = v > 0.92
      ? ['pipereed', 'ribbonkelp', 'bluefern', 'emberberry', 'ghostpalm']
      : v > 0.78 ? ['bluefern', 'saltgrass', 'emberberry', 'dustmoss']
        : v > 0.6 ? ['saltgrass', 'dustmoss', 'dustmoss'] : ['dustmoss', 'dustmoss', 'saltgrass'];
    const id = pool[Math.floor(r * pool.length)];
    if (!FLORA_BY_ID[id]) return;
    this.plants.set(i, {
      id, stage: 1, variant: Math.floor(r * 3),
      size: (v > 0.9 ? 0.34 : 0.26) + r * 0.30, flip: r < 0.5, t: 0,
    });
    this.game.onGreened?.(i * CELL);
  }

  /** Things that came up on their own keep growing while the ground holds. */
  tick(dt) {
    for (const [i, p] of this.plants) {
      const v = this.life.get(i) || 0;
      p.t += dt;
      if (v > SEEDABLE && p.stage < 3 && p.t > 26) { p.t = 0; p.stage++; }
      if (v < 0.22 && p.stage > 1 && Math.random() < dt * 0.02) p.stage--;
    }
  }

  // -- drawing --------------------------------------------------------------

  /**
   * The ground itself, tinted where it is alive. Drawn under the scatter so
   * grass comes up out of colour rather than sitting on top of it.
   */
  drawGround(ctx, cam, terrain) {
    const b = cam.bounds(60);
    const i0 = Math.round(b.x0 / CELL), i1 = Math.round(b.x1 / CELL);
    for (let i = i0; i <= i1; i++) {
      const v = this.life.get(i);
      if (!v) continue;
      const x = i * CELL;
      const s = cam.worldToScreen(x, terrain.surfaceY(x));
      const w = CELL * cam.zoom + 1;
      const h = (2.5 + v * 4.5) * cam.zoom;
      // damp sand first - dark, because wet sand is dark - then the green
      // over the top of it as the ground actually takes
      ctx.globalAlpha = clamp01(0.25 + v * 0.55);
      ctx.fillStyle = '#4a3118';
      ctx.fillRect(Math.round(s.x - w / 2), Math.round(s.y), Math.ceil(w), Math.ceil(h));
      if (v > 0.30) {
        const k = clamp01((v - 0.30) / 0.7);
        ctx.globalAlpha = 0.35 + k * 0.55;
        ctx.fillStyle = v > 0.78 ? '#4f8f3e' : '#54702f';
        ctx.fillRect(Math.round(s.x - w / 2), Math.round(s.y - 1 * cam.zoom),
          Math.ceil(w), Math.ceil((1.5 + k * 3.5) * cam.zoom));
        // a fringe of blades along the top edge, so it is not a painted stripe
        ctx.globalAlpha = 0.45 + k * 0.4;
        for (let q = 0; q < 5; q++) {
          const bx = s.x - w / 2 + (q + 0.5) * (w / 5);
          const bh = (2 + ((i * 7 + q * 3) % 5)) * k * cam.zoom;
          ctx.fillRect(Math.round(bx), Math.round(s.y - bh), 1, Math.ceil(bh));
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  toJSON() {
    // only the cells worth remembering, and only near where you have been
    const out = [];
    for (const [i, v] of this.life) if (v > 0.3) out.push([i, +v.toFixed(2)]);
    return { life: out.slice(0, 3000), total: this.total };
  }

  fromJSON(d) {
    if (!d) return;
    this.life = new Map((d.life || []).map(([i, v]) => [i, v]));
    this.total = d.total || 0;
  }
}
