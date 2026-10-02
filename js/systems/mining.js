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
import { Painter, makeCanvas, hash2i } from '../render/pixel.js';
import { rockBody } from '../art/rockart.js';
import { GROUND, gsx, gsy } from '../art/ground.js';
import { poolAt } from '../world/landmarks.js';
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
    const t = this.game.terrain;
    GROUND.frame(cam, t);
    const w = this.game.weather;
    const sun = w ? clamp01((w.daylight ?? 1) * (1 - (w.haze || 0) * 0.5)) : 1;
    const seams = this.near((b.x0 + b.x1) / 2, (b.x1 - b.x0) / 2 + 60).filter((s) => s.ore.id !== 'grit');
    const drawn = [];
    for (const s of seams) {
      const art = outcropArt(s.ore.id, s.ci);
      const st = GROUND.seat(s.x, art.footL, art.footR, art.bury);
      drawn.push([s, art, st.y]);
      GROUND.shadow(ctx, cam, s.x, art.foot, 1, sun, w?.shadowDir || 1);
    }
    // the deposit itself, cut at the ground line so it is IN the sand
    ctx.save();
    GROUND.clipAbove(ctx, cam, 1);
    for (const [s, art, gy] of drawn) {
      const p = { x: Math.round(gsx(cam, s.x)), y: Math.round(gsy(cam, gy)) };
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(z, z);
      // a seam under an oasis pool is seen through the water
      const wet = this.game.world && poolAt(this.game.world.seed, s.x, t);
      if (wet && wet.y < gy - art.top * 0.3) ctx.globalAlpha = 0.42;
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      const k = this.chipped.get(s.ci) || 0;
      if (k > 0) {
        const cr = crackAt(s, k / Math.max(1, s.hits));
        if (cr) ctx.drawImage(cr.cv, -cr.ox, -cr.oy);
      }
      ctx.restore();
    }
    ctx.restore();
    for (const [s, art, gy] of drawn) {
      if (!(this.game.world && poolAt(this.game.world.seed, s.x, t))) {
        GROUND.drift(ctx, cam, s.x, art.foot * 1.1 + 2, 1.4 + art.top * 0.04, w?.windDir || 1, s.ci & 255);
      }
      const p = { x: Math.round(gsx(cam, s.x)), y: Math.round(gsy(cam, gy)) };
      // a glint that walks across the ore, so it catches the eye
      const tw = (this.shimmer * 0.5 + (s.seed % 1)) % 1;
      if (tw < 0.25) {
        const k = Math.sin((tw / 0.25) * Math.PI);
        const pp = Math.max(1, Math.round(z));
        const gx = p.x + Math.round(art.gx * z), gy2 = p.y + Math.round(art.gy * z);
        ctx.globalAlpha = k;
        ctx.fillStyle = '#fffbe8';
        ctx.fillRect(gx, gy2 - pp, pp, pp * 3);
        ctx.fillRect(gx - pp, gy2, pp * 3, pp);
        if (k > 0.7) { ctx.fillRect(gx, gy2 - pp * 2, pp, pp * 5); ctx.fillRect(gx - pp * 2, gy2, pp * 5, pp); }
        ctx.globalAlpha = 1;
      }
      // too hard for what you are carrying: a lock over it when you are close
      if (c && Math.abs(c.x - s.x) < 60 && (this.game.craft?.pickPower ?? 0) < s.ore.need) {
        const lp = { x: p.x, y: p.y - Math.round((art.top + 8) * z) };
        ctx.fillStyle = 'rgba(18,10,6,0.8)';
        ctx.fillRect(lp.x - 5, lp.y - 6, 11, 11);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(lp.x - 3, lp.y - 1, 7, 5);
        ctx.fillStyle = '#8f6a2a';
        ctx.fillRect(lp.x - 2, lp.y - 5, 1, 4);
        ctx.fillRect(lp.x + 2, lp.y - 5, 1, 4);
        ctx.fillRect(lp.x - 2, lp.y - 5, 5, 1);
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
const LIGHT = { lightX: -0.55, lightY: -0.72, lightZ: 0.46, ambient: 0.40, dither: 0.35, outline: 1, outlineColor: '#120a06' };

// outcrops
//
// Every seam worth having comes up as an ORE DEPOSIT: an outcrop of the host
// rock with the mineral running through it the way it really does - green
// malachite streaks and blue azurite in copper country, the red-and-steel
// bands of an iron formation, golden amber nodules in black shale, quartz
// crystals standing out of a pale knuckle of rock, salt crust and cubes, a
// shell bed full of fossils. Some are knee-high to the crab; some are bigger
// than it.

const OUTCROP = new Map();

/** How big a deposit is: mostly middling, one in four a big one. */
function sizeOf(oreId, ci) {
  const k = hash2i(ci, 11, hashStr(oreId) & 4095);
  const big = k > 0.74, small = k < 0.3;
  const sandy = oreId === 'saltcake' || oreId === 'shellchip';
  const h = (big ? 24 + k * 14 : small ? 9 + k * 6 : 14 + k * 8) * (sandy ? 0.75 : 1);
  return { h, w: h * (big ? 2.1 : 1.8), big };
}

const HOST = { copperore: 'granite', ironore: 'shale', amberchunk: 'shale', silica: 'limestone',
  saltcake: 'limestone', shellchip: 'limestone' };

function setPix(p, x, y, mat, tint = 0, dh = 0.3) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return false;
  const i = y * p.w + x;
  if (!p.mat[i]) return false;
  p.mat[i] = p._mid(mat); p.tint[i] = tint; p.hgt[i] += dh;
  return true;
}

/** The mineral, painted into the rock body after its own texture. */
function veins(oreId, r, glint) {
  return (p, c) => {
    const W = p.w;
    const top = c.y0, gy = c.gy, x0 = c.x0, x1 = c.x1;
    const inside = (x, y) => { const i = Math.round(y) * W + Math.round(x); return i >= 0 && i < p.mat.length && p.mat[i]; };
    const vein = (mat, n, thick, tint) => {
      for (let k = 0; k < n; k++) {
        let x = lerp(x0, x1, 0.15 + r() * 0.7), y = lerp(top + 2, gy - 2, r());
        let a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI);
        const len = (x1 - x0) * (0.25 + r() * 0.5);
        for (let s = 0; s < len; s += 0.6) {
          a += (r() - 0.5) * 0.35;
          x += Math.cos(a) * 0.6; y += Math.sin(a) * 0.6;
          if (!inside(x, y)) break;
          for (let q = 0; q < thick; q++) setPix(p, x, y + q, mat, tint + (r() - 0.5) * 0.2 + (q ? -0.1 : 0.06), 0.4);
          if (s > len * 0.3 && !glint.x) { glint.x = x; glint.y = y; }
        }
      }
    };
    const blob = (mat, x, y, rad, tint) => {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad - 1; dx <= rad + 1; dx++) {
        if (dx * dx / ((rad + 0.8) ** 2) + dy * dy / (rad * rad + 0.2) > 1) continue;
        if (!inside(x + dx, y + dy)) continue;
        setPix(p, x + dx, y + dy, mat, tint - (dx + dy) * 0.06 + (r() - 0.5) * 0.1, rad * 0.5);
      }
    };
    const spots = (mat, n, tint) => {
      for (let k = 0; k < n; k++) {
        const x = lerp(x0, x1, r()), y = lerp(top + 1, gy - 1, r());
        if (setPix(p, x, y, mat, tint, 0.8) && !glint.x) { glint.x = x; glint.y = y; }
      }
    };
    if (oreId === 'copperore') {
      // malachite streaks and azurite blebs, a few specks of native copper
      vein('malachite', 3 + Math.floor(r() * 3), 2, 0.05);
      vein('malachite', 2, 1, 0.2);
      for (let k = 0; k < 3; k++) blob('azurite', lerp(x0 + 3, x1 - 3, r()), lerp(top + 3, gy - 3, r()), 1, 0.05);
      spots('copper', 4, 0.2);
      spots('brass', 3, 0.3);
    } else if (oreId === 'ironore') {
      // a banded iron formation: steel-grey and blood-red, folded
      const ph = r() * 6, tilt = (r() - 0.5) * 0.4;
      for (let y = 0; y < p.h; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!p.mat[i] || p.mat[i] === p._mid('desertSand') || p.mat[i] === p._mid('sandPale')) continue;
        const b = Math.sin((y + tilt * x + Math.sin(x * 0.18 + ph) * 2) * 0.75);
        if (b > 0.6) { p.mat[i] = p._mid('jasper'); p.tint[i] += 0.02; }
        else if (b < -0.7) { p.mat[i] = p._mid('hematite'); p.hgt[i] += 0.5; }
      }
      spots('metal', 5, 0.35);
      spots('rust', 6, 0);
    } else if (oreId === 'amberchunk') {
      for (let k = 0; k < 3 + Math.floor(r() * 3); k++) {
        const x = lerp(x0 + 4, x1 - 4, r()), y = lerp(top + 4, gy - 3, r());
        blob('amber', x, y, 1 + Math.floor(r() * 2.2), 0.15);
        if (!glint.x) { glint.x = x - 1; glint.y = y - 1; }
      }
      spots('brass', 3, 0.2);
    } else if (oreId === 'shellchip') {
      // a shell bed: coils and valves of a sea that is not there
      for (let k = 0; k < 4 + Math.floor(r() * 4); k++) {
        const x = lerp(x0 + 3, x1 - 3, r()), y = lerp(top + 3, gy - 2, r());
        const rad = 1 + Math.floor(r() * 2.5);
        blob(r() < 0.5 ? 'nacre' : 'bone', x, y, rad, 0.12);
        setPix(p, x, y, 'shale', -0.2, -0.4);
        if (rad > 1) setPix(p, x + 1, y - 1, 'shale', -0.1, -0.2);
        if (!glint.x) { glint.x = x; glint.y = y - rad; }
      }
    } else if (oreId === 'saltcake') {
      vein('halite', 2, 2, 0.2);
      spots('halite', 10, 0.3);
    } else if (oreId === 'silica') {
      vein('quartz', 2, 1, 0.1);
    }
  };
}

/**
 * The art for a deposit. Contract (all in sprite pixels = world units):
 *   cv        the baked canvas
 *   ox, oy    the ground anchor inside it: oy is the distance from the
 *             canvas top down to the ground line, so the deposit stands `top`
 *             above the ground and the rows below oy are buried
 *   top       how high it actually stands above the ground
 *   w, h      canvas size; foot / footL / footR its half-width at the ground
 *   bury      how many pixels of it are under the anchor
 *   gx, gy    where the glint sits, relative to the anchor (gy < 0 is up)
 *   chips     a few points on its face, relative to the anchor, where chips
 *             can fly from when it is struck
 * One look per ore and seam, cached.
 */
export function outcropArt(oreId, ci) {
  const key = oreId + ':' + ci;
  let art = OUTCROP.get(key);
  if (art) return art;
  const sz = sizeOf(oreId, ci);
  const r = mulberry32((hashStr(oreId) ^ Math.imul(ci, 2654435761)) >>> 0);
  const glint = { x: 0, y: 0 };
  const parts = [];
  const host = HOST[oreId] || 'granite';
  const main = rockBody({ seed: (r() * 4294967296) >>> 0, rw: sz.w * 0.42, rh: sz.h, bury: 5, stone: host,
    lean: (r() - 0.5) * 0.5, varnish: 0.3, lichen: 0.15, paint: veins(oreId, r, glint), dust: 'desertSand' });
  parts.push({ b: main, dx: 0 });
  // a shoulder or two of the same rock, with the ore in it too
  const ns = sz.big ? 2 : 1;
  for (let i = 0; i < ns; i++) {
    const side = i % 2 ? 1 : -1;
    const g2 = { x: 0, y: 0 };
    const b = rockBody({ seed: (r() * 4294967296) >>> 0, rw: sz.w * (0.2 + r() * 0.08), rh: sz.h * (0.38 + r() * 0.2),
      bury: 5, stone: host, lean: side * 0.5, varnish: 0.2, paint: veins(oreId, r, g2), dust: 'desertSand' });
    parts.push({ b, dx: side * sz.w * (0.36 + r() * 0.1) });
  }
  // composite the bodies on one ground line
  let L = 0, R = 0, T = 0, B = 0;
  for (const q of parts) {
    L = Math.min(L, q.dx - q.b.ox); R = Math.max(R, q.dx - q.b.ox + q.b.cv.width);
    T = Math.min(T, -q.b.oy); B = Math.max(B, q.b.cv.height - q.b.oy);
  }
  const extraTop = oreId === 'silica' ? Math.ceil(sz.h * 0.7) + 4 : oreId === 'saltcake' ? 4 : 0;
  const W = Math.ceil(R - L), H = Math.ceil(B - T) + extraTop;
  const ox = Math.round(-L), oy = Math.round(-T) + extraTop;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  // shoulders behind, the main rock in front of them
  for (const q of parts.slice(1)) g.drawImage(q.b.cv, Math.round(ox + q.dx - q.b.ox), oy - q.b.oy);
  g.drawImage(main.cv, ox - main.ox, oy - main.oy);
  let gx = glint.x ? glint.x - main.ox : -2, gy = glint.y ? glint.y - main.oy : -sz.h * 0.6;
  // crystals standing out of the top: quartz prisms, or salt cubes
  if (oreId === 'silica' || oreId === 'saltcake') {
    const p = new Painter(W, H);
    const n = oreId === 'silica' ? 4 + Math.floor(r() * 4) : 5 + Math.floor(r() * 5);
    let best = Infinity;
    for (let k = 0; k < n; k++) {
      const x = ox + (r() - 0.5) * sz.w * 0.55;
      const baseY = oy - sz.h * (0.45 + r() * 0.35);
      if (oreId === 'silica') {
        const len = sz.h * (0.22 + r() * 0.36), lean = (r() - 0.5) * 1.2;
        const rad = 0.9 + r() * 1.1;
        const ex = x + Math.sin(lean) * len, ey = baseY - Math.cos(lean) * len;
        p.capsule(x, baseY, ex, ey, rad, rad * 0.95, { mat: 'quartz', dome: rad * 1.4, tint: (r() - 0.5) * 0.2 });
        // the pointed termination
        p.capsule(ex, ey, ex + Math.sin(lean) * rad * 1.6, ey - Math.cos(lean) * rad * 1.6, rad * 0.9, 0.2,
          { mat: 'quartz', dome: rad * 1.6, tint: 0.2 });
        if (ey < best) { best = ey; gx = ex - ox; gy = ey - oy; }
      } else {
        const s2 = 0.9 + r() * 1.2;
        p.rect(x - s2, baseY - s2 * 1.6, s2 * 2, s2 * 2, { mat: 'halite', dome: s2 * 1.2, tint: 0.1 + (r() - 0.5) * 0.2 });
        if (baseY - s2 * 1.6 < best) { best = baseY - s2 * 1.6; gx = x - ox; gy = best - oy; }
      }
    }
    const cr = p.resolve(MATERIALS, { ...LIGHT, outline: 0.9, outlineColor: '#1a2226' });
    g.drawImage(cr, 0, 0);
  }
  // how tall and wide it really is, off the pixels
  const d = g.getImageData(0, 0, W, H).data;
  let top = oy, fl = ox, fr = ox;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] < 128) continue;
    if (y < top) top = y;
    if (Math.abs(y - oy) <= 1) { fl = Math.min(fl, x); fr = Math.max(fr, x); }
  }
  const chips = [];
  for (let k = 0; k < 5; k++) chips.push({ x: (r() - 0.5) * (fr - fl) * 0.7, y: -(oy - top) * (0.3 + r() * 0.6) });
  art = { cv, ox, oy, w: W, h: H, top: oy - top, foot: Math.max(3, (fr - fl) / 2), footL: ox - fl, footR: fr - ox,
    bury: 5, gx, gy, chips, key, size: sz.big ? 'big' : sz.h < 15 ? 'small' : 'medium' };
  OUTCROP.set(key, art);
  if (OUTCROP.size > 200) OUTCROP.delete(OUTCROP.keys().next().value);
  return art;
}

const CRACKS = new Map();

/**
 * Damage on a deposit: an overlay the same size and anchor as its art, with
 * cracks spreading across it as `k` goes from 0 to 1 (three stages). Returns
 * null for an unhurt rock. `s` is a seam from Mining.seamAt/near.
 */
export function crackAt(s, k) {
  if (!s || k <= 0) return null;
  const stage = Math.min(3, Math.max(1, Math.ceil(k * 3)));
  const art = outcropArt(s.ore.id, s.ci);
  const key = art.key + ':' + stage;
  let c = CRACKS.get(key);
  if (c) return c;
  const src = art.cv.getContext('2d').getImageData(0, 0, art.w, art.h).data;
  const cv = makeCanvas(art.w, art.h);
  const g = cv.getContext('2d');
  const r = mulberry32(hashStr(key));
  const solid = (x, y) => x >= 0 && y >= 0 && x < art.w && y < art.h && src[(y * art.w + x) * 4 + 3] > 128;
  for (let n = 0; n < stage * 2; n++) {
    let x = art.ox + (r() - 0.5) * art.foot, y = art.oy - art.top * (0.5 + r() * 0.4);
    let a = Math.PI / 2 + (r() - 0.5) * 1.6;
    for (let q = 0; q < art.top * (0.4 + stage * 0.2); q++) {
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a); y += Math.sin(a);
      const ix = Math.round(x), iy = Math.round(y);
      if (!solid(ix, iy)) break;
      g.fillStyle = 'rgba(12,6,4,0.85)'; g.fillRect(ix, iy, 1, 1);
      if (solid(ix + 1, iy + 1)) { g.fillStyle = 'rgba(255,240,210,0.35)'; g.fillRect(ix + 1, iy + 1, 1, 1); }
    }
  }
  c = { cv, ox: art.ox, oy: art.oy };
  CRACKS.set(key, c);
  return c;
}
