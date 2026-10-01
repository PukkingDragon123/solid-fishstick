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
// You cannot mine. You have claws the size of a door and no thumbs. He has
// thumbs, which is the entire reason any of this is worth doing to him.

import { mulberry32, hashStr, clamp, clamp01, lerp, TAU } from '../lib/math.js';
import { ORES } from '../data/craft.js';
import { pxEllipse } from '../render/pix.js';
import { Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';

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
    if (r() > 0.45) return null;     // most of the desert is just desert
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

  /**
   * The seam you are standing beside, if there is one you can see. Grit is
   * not worth an outcrop - it is the whole desert - so it never shows.
   */
  outcropAt(x, reach = 24) {
    for (const s of this.near(x, reach)) {
      if (s.ore.id === 'grit') continue;
      return s;
    }
    return null;
  }

  /** Mine a seam out completely: it is spent, and what was in it is yours. */
  takeSeam(s, power = 0) {
    this.spent.add(s.ci);
    this.chipped.delete(s.ci);
    const n = 2 + Math.floor(Math.random() * 3) + (power > s.ore.need ? 1 : 0);
    return { id: s.ore.id, n };
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
   * Every seam worth having shows on the surface as an OUTCROP - a knot of
   * rock with the ore showing in it - so the desert tells you where the metal
   * is instead of making you dig blind. Walk up to one and mine it.
   */
  draw(ctx, cam) {
    const b = cam.bounds(80);
    const z = cam.zoom;
    const c = this.game.crab;
    for (const s of this.near((b.x0 + b.x1) / 2, (b.x1 - b.x0) / 2 + 60)) {
      if (s.ore.id === 'grit') continue;
      const gy = this.game.terrain.surfaceY(s.x);
      const art = outcropArt(s.ore.id, s.ci);
      const p = cam.worldToScreen(s.x, gy);
      ctx.save();
      ctx.translate(Math.round(p.x), Math.round(p.y));
      ctx.scale(z, z);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      // a glint that walks across the ore, so it catches the eye
      const tw = (this.shimmer * 0.5 + (s.seed % 1)) % 1;
      if (tw < 0.25) {
        const k = Math.sin((tw / 0.25) * Math.PI);
        ctx.globalAlpha = k;
        ctx.fillStyle = '#fffbe8';
        const gx = Math.round(art.gx), gy2 = Math.round(art.gy);
        ctx.fillRect(gx, gy2 - 1, 1, 3);
        ctx.fillRect(gx - 1, gy2, 3, 1);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // too hard for what you are carrying: a lock over it when you are close
      if (c && Math.abs(c.x - s.x) < 60 && (this.game.craft?.pickPower ?? 0) < s.ore.need) {
        const lp = cam.worldToScreen(s.x, gy - 16);
        ctx.fillStyle = 'rgba(18,10,6,0.8)';
        ctx.fillRect(Math.round(lp.x) - 5, Math.round(lp.y) - 6, 11, 11);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(Math.round(lp.x) - 3, Math.round(lp.y) - 1, 7, 5);
        ctx.fillStyle = '#8f6a2a';
        ctx.fillRect(Math.round(lp.x) - 2, Math.round(lp.y) - 5, 1, 4);
        ctx.fillRect(Math.round(lp.x) + 2, Math.round(lp.y) - 5, 1, 4);
        ctx.fillRect(Math.round(lp.x) - 2, Math.round(lp.y) - 5, 5, 1);
      }
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

// ---------------------------------------------------------------------------
// outcrops

const OUTCROP = new Map();
const LIGHT = { lightX: -0.55, lightY: -0.72, lightZ: 0.46, ambient: 0.40, dither: 0.35, outline: 1, outlineColor: '#120a06' };

/**
 * A knot of rock with the ore showing in it, painted with the same lit
 * painter as everything else in the desert. One look per ore, a little
 * different per seam, cached.
 */
function outcropArt(oreId, ci) {
  const v = ((ci % 3) + 3) % 3;
  const key = oreId + ':' + v;
  let art = OUTCROP.get(key);
  if (art) return art;
  const W = 30, H = 22, cx = 15, base = 18;
  const p = new Painter(W, H);
  const rr = mulberry32((hashStr(oreId) ^ (v * 977)) >>> 0);
  let gx = cx, gy = base - 8;
  const rockMat = oreId === 'ironore' ? 'rockRed' : 'rock';
  const sandy = oreId === 'saltcake' || oreId === 'shellchip' || oreId === 'silica';
  if (sandy) {
    // a low pale mound with the stuff lying in and on it
    p.ellipse(cx, base, 11, 5, { mat: 'sandPale', dome: 4, tint: 0.02 });
  } else {
    // the rocks: a big one and two shoulders, sunk into the sand
    p.ellipse(cx - 6, base - 2, 5.5, 4.5, { mat: rockMat, dome: 4.5, tint: -0.06 });
    p.ellipse(cx + 6, base - 1.5, 5, 4, { mat: rockMat, dome: 4, tint: -0.1 });
    p.ellipse(cx, base - 4, 7.5, 6.5, { mat: rockMat, dome: 6.5, tint: 0.02 });
    p.grain(rockMat, { freq: 0.5, amp: 0.10, seed: 3 + v });
    p.ellipse(cx, base + 1, 12, 2.2, { mat: 'sandPale', dome: 1.2, tint: -0.05 });
  }
  const lump = (x, y, r, mat, t = 0) => p.ellipse(x, y, r, r * 0.86, { mat, dome: r * 1.1, tint: t });
  if (oreId === 'copperore') {
    lump(cx - 2.5, base - 6.5, 2.2, 'copper', 0.1);
    lump(cx + 2.8, base - 4.5, 1.8, 'copper');
    lump(cx - 6.5, base - 3, 1.5, 'copper', -0.05);
    lump(cx + 6.5, base - 3.5, 1.3, 'verdigris');
    lump(cx + 0.5, base - 9.5, 1.4, 'verdigris', 0.05);
    gx = cx - 3; gy = base - 8;
  } else if (oreId === 'ironore') {
    lump(cx - 2, base - 6, 2, 'metal', 0.1);
    lump(cx + 3, base - 7.5, 1.6, 'metal');
    lump(cx + 5.5, base - 2.5, 1.4, 'rust');
    lump(cx - 6, base - 3, 1.5, 'rust', 0.05);
    gx = cx - 2.5; gy = base - 7.5;
  } else if (oreId === 'amberchunk') {
    lump(cx - 1, base - 6.5, 2.6, 'amber', 0.12);
    lump(cx + 4.5, base - 4, 1.8, 'amber');
    lump(cx - 6, base - 2.5, 1.4, 'amber', -0.05);
    gx = cx - 2; gy = base - 8;
  } else if (oreId === 'silica') {
    // quartz: clear shards standing up out of the mound
    const shard = (x, h, lean, r) => p.capsule(x, base - 1, x + lean, base - 1 - h, r, r * 0.35, { mat: 'glass', dome: r * 1.2, tint: 0.1 });
    shard(cx - 3, 9, -1.5, 1.8);
    shard(cx + 1, 11, 0.8, 2.0);
    shard(cx + 4.5, 7, 2, 1.5);
    shard(cx - 6.5, 5, -1.8, 1.2);
    gx = cx + 1; gy = base - 9;
  } else if (oreId === 'saltcake') {
    // plates of salt crust, tipped up at angles
    p.ellipse(cx - 4, base - 3, 4.5, 2.2, { mat: 'petalWhite', dome: 2, tint: 0.12, rot: -0.35 });
    p.ellipse(cx + 3.5, base - 4, 5, 2.4, { mat: 'petalWhite', dome: 2.2, tint: 0.16, rot: 0.28 });
    p.ellipse(cx, base - 6.5, 3.5, 1.8, { mat: 'ice', dome: 1.8, tint: 0.3, rot: -0.1 });
    gx = cx + 2; gy = base - 6;
  } else if (oreId === 'shellchip') {
    p.ellipse(cx - 3.5, base - 3.5, 3.6, 2.6, { mat: 'nacre', dome: 2.4, tint: 0.2, rot: -0.4 });
    p.ellipse(cx + 3.5, base - 3, 3, 2.2, { mat: 'bone', dome: 2.2, tint: 0.15, rot: 0.5 });
    p.ellipse(cx, base - 6, 2.4, 1.8, { mat: 'nacre', dome: 2, tint: 0.3 });
    gx = cx - 3; gy = base - 5;
  }
  const cv = p.resolve(MATERIALS, LIGHT);
  art = { cv, ox: cx, oy: base + 2, gx: gx - cx, gy: gy - (base + 2) };
  OUTCROP.set(key, art);
  return art;
}
