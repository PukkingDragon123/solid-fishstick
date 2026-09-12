// CRABDEN - the seams under the basin.
//
// A thousand years of seabed does not lie flat. Under the sand there are
// bands: shell hash near the top, salt sheets under that, then silica, then
// the metal that was dissolved in the water when it dried, then - if you go
// far enough - iron, which is where the sea was deepest and stayed longest.
//
// Seams are deterministic. The same seed puts the same copper in the same
// place for ever, so a spot you remember is still there when you come back,
// and somewhere you have already emptied stays empty.
//
// You cannot mine. You have claws the size of a door and no thumbs. She has
// thumbs, which is the entire reason any of this is worth doing to her.

import { mulberry32, hashStr, clamp, clamp01, lerp, TAU } from '../lib/math.js';
import { ORES } from '../data/craft.js';

const CELL = 46;              // one possible seam per cell of desert
const REACH = 16;             // how far a swing carries, in world units
const BITE = 3.4;             // how much deeper a swing takes the hole

const TOTAL_W = ORES.reduce((t, o) => t + o.weight, 0);

export class Mining {
  constructor(game, seed) {
    this.game = game;
    this.seed = String(seed);
    this.spent = new Set();          // cells that have been emptied
    this.dug = new Map();            // cell -> how deep the hole there is
    this.chipped = new Map();        // cell -> hits taken so far
    this.shimmer = 0;
  }

  // -- the seams ------------------------------------------------------------

  /**
   * What is in this cell, or null. The weighting is what makes a basin feel
   * like a basin: mostly grit and shell near the top, and iron almost never.
   */
  seamAt(ci) {
    if (this.spent.has(ci)) return null;
    const r = mulberry32((hashStr(this.seed + 'seam') ^ (ci * 374761393)) >>> 0);
    if (r() > 0.62) return null;     // most of the desert is just desert
    let roll = r() * TOTAL_W;
    let ore = ORES[0];
    for (const o of ORES) { roll -= o.weight; if (roll <= 0) { ore = o; break; } }
    const depth = lerp(ore.depth[0], ore.depth[1], r());
    return {
      ci,
      x: ci * CELL + CELL * (0.25 + r() * 0.5),
      depth,
      ore,
      // a seam is a cluster of lumps, drawn and broken as one
      lumps: 3 + Math.floor(r() * 4),
      seed: r() * TAU,
      hits: ore.hits,
    };
  }

  /** Every seam close enough to matter, nearest first. */
  near(x, radius = 150) {
    const out = [];
    const c0 = Math.floor((x - radius) / CELL), c1 = Math.floor((x + radius) / CELL);
    for (let ci = c0; ci <= c1; ci++) {
      const s = this.seamAt(ci);
      if (s && Math.abs(s.x - x) <= radius) out.push(s);
    }
    return out.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
  }

  /** How deep the hole at this point is, counting the ones either side of it. */
  holeAt(x) {
    let d = 0;
    const ci = Math.floor(x / CELL);
    for (let c = ci - 1; c <= ci + 1; c++) {
      const h = this.dug.get(c);
      if (!h) continue;
      const fall = 1 - Math.abs(c * CELL + CELL / 2 - x) / (CELL * 1.6);
      if (fall > 0) d = Math.max(d, h * fall);
    }
    return d;
  }

  /** A seam is workable once the hole over it has reached it. */
  exposed(s) { return this.holeAt(s.x) >= s.depth - 2; }

  /**
   * One swing. It takes a bite out of the ground whatever happens - that is
   * how you get down to anything - and if there is a seam in reach and the
   * pick is good enough for it, the seam takes a hit as well.
   *
   * Returns what came loose, so the caller can decide what to do about it.
   */
  swing(x, power = 1) {
    const ci = Math.floor(x / CELL);
    const was = this.dug.get(ci) || 0;
    const deep = Math.min(46, was + BITE * (0.7 + power * 0.4));
    this.dug.set(ci, deep);
    this.game.terrain.deform?.(x, 1.4 + power * 0.5, REACH);

    const out = { grit: 0, drops: {}, broke: null, blocked: null, deep };
    // the ground itself always gives up a little
    if (Math.random() < 0.45) out.drops.grit = (out.drops.grit || 0) + 1;

    const s = this.near(x, REACH)[0];
    if (!s) return out;
    if (!this.exposed(s)) { out.blocked = Math.round(s.depth - this.holeAt(s.x)); return out; }
    if (power < s.ore.need) { out.blocked = -1; return out; }   // too soft a pick

    const hit = (this.chipped.get(s.ci) || 0) + 1;
    this.chipped.set(s.ci, hit);
    if (hit >= s.hits) {
      this.spent.add(s.ci);
      this.chipped.delete(s.ci);
      const n = 2 + Math.floor(Math.random() * 3) + (power > s.ore.need ? 1 : 0);
      out.drops[s.ore.id] = (out.drops[s.ore.id] || 0) + n;
      out.broke = s;
    } else {
      out.cracked = s;
    }
    return out;
  }

  update(dt) { this.shimmer += dt; }

  // -- drawing --------------------------------------------------------------

  /**
   * Seams you have not reached yet show as a faint glint in the ground, so
   * the desert tells you where to dig instead of making you guess. Once the
   * hole reaches one it is drawn properly: lumps of ore in a bed of rock,
   * cracked a little more with every hit it has taken.
   */
  draw(ctx, cam) {
    const b = cam.bounds(80);
    const z = cam.zoom;
    for (const s of this.near((b.x0 + b.x1) / 2, (b.x1 - b.x0) / 2 + 60)) {
      const gy = this.game.terrain.surfaceY(s.x);
      const hole = this.holeAt(s.x);
      const open = hole >= s.depth - 2;
      const top = cam.worldToScreen(s.x, gy + s.depth);
      if (!open) {
        // a glint: brighter the closer your hole is to it
        const near = clamp01(1 - (s.depth - hole) / 34);
        const a = (0.10 + near * 0.42) * (0.6 + 0.4 * Math.sin(this.shimmer * 2.4 + s.seed));
        ctx.globalAlpha = a;
        ctx.fillStyle = s.ore.colour;
        for (let i = 0; i < 3; i++) {
          const px = top.x + Math.cos(s.seed + i * 2.1) * 3 * z;
          const py = top.y + Math.sin(s.seed + i * 2.1) * 2 * z;
          ctx.fillRect(Math.round(px), Math.round(py), Math.max(1, Math.round(z)), Math.max(1, Math.round(z)));
        }
        ctx.globalAlpha = 1;
        continue;
      }

      // exposed: a bed of dark rock with the ore sitting in it
      const hit = this.chipped.get(s.ci) || 0;
      ctx.save();
      ctx.translate(Math.round(top.x), Math.round(top.y));
      ctx.scale(z, z);
      ctx.fillStyle = 'rgba(42,30,20,0.92)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7.5, 5, 0, 0, TAU);
      ctx.fill();
      for (let i = 0; i < s.lumps; i++) {
        const a = s.seed + i * (TAU / s.lumps);
        const lx = Math.cos(a) * 3.6, ly = Math.sin(a) * 2.4;
        const r = 1.5 + ((i * 7) % 3) * 0.4;
        ctx.fillStyle = s.ore.colour;
        ctx.beginPath(); ctx.ellipse(lx, ly, r, r * 0.85, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.34)';
        ctx.fillRect(Math.round(lx - r * 0.4), Math.round(ly - r * 0.6), 1, 1);
      }
      // the cracks it has taken so far
      if (hit > 0) {
        ctx.strokeStyle = 'rgba(16,10,6,0.75)';
        ctx.lineWidth = 0.6;
        for (let i = 0; i < hit; i++) {
          const a = s.seed * 2 + i * 1.7;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 1.2, Math.sin(a) * 0.8);
          ctx.lineTo(Math.cos(a) * 6.5, Math.sin(a) * 4.2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  toJSON() {
    return { spent: [...this.spent], dug: [...this.dug], chipped: [...this.chipped] };
  }

  fromJSON(d) {
    if (!d) return;
    this.spent = new Set(d.spent || []);
    this.dug = new Map(d.dug || []);
    this.chipped = new Map(d.chipped || []);
  }
}
