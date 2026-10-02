// CRABDEN - the things in the way.
//
// The desert was sand, mesas on the skyline, and the occasional tuft. You
// could hold one direction down for a minute and nothing would happen. A
// desert is not empty - it is full of low, dry, awkward things - so this file
// puts them in:
//
//   BOULDERS  lumps of the same rock the mesas are cut from, half-sunk. They
//             are not decoration: a boulder RAISES THE GROUND under it, so
//             walking into one means going over it, and going over a big one
//             means climbing.
//   SCRUB     creosote, saltbush, dead brush, driftwood, the bleached ribs of
//             something that did not make it. No collision, but they break
//             the horizon up and they catch the light.
//   STONE     everything else that is lying about: pebbles, boulders, rocks
//             leaning on rocks, hoodoos and basalt stacks three times the
//             height of the crab that you walk in front of. Pure scenery,
//             drawn behind the ground line so the ground holds them.
//   PLANTS    the desert's own: grass, prickly pear, barrel cactus, agave,
//             yucca, ocotillo.
//   TUMBLEWEED  which is not scenery at all. It spawns upwind, off-screen,
//             rolls across at the speed of the wind, bounces off the ground
//             and off the boulders, and goes away. It is the only thing out
//             here that moves without wanting something.
//
// Everything except the tumbleweed is a pure function of the world seed, so
// the boulder you climbed yesterday is exactly where you left it.

import { clamp, clamp01, lerp, mulberry32, hashStr, TAU } from '../lib/math.js';
import { Painter, makeCanvas } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { biomeAt } from './biomes.js';
import { rockBody, paintRocks, stoneFor, selout } from '../art/rockart.js';
import * as FL from '../art/desertflora.js';

const CELL = 128;               // one roll of the dice per this much desert
const MAX_BUMP = 26;            // the tallest a boulder can lift the ground

// ---------------------------------------------------------------------------
// what is where

const cache = new Map();
let cacheSeed = null;

/**
 * Somewhere nothing should stand - the water in an oasis, the floor of a
 * ruin. The landmarks register this; it is a pure function of (seed, x).
 */
let guard = null;
export function setPropGuard(fn) { guard = fn; cache.clear(); decorCache.clear(); }

/** Everything standing on this stretch of desert, generated once per cell. */
export function propsIn(seed, ci) {
  if (seed !== cacheSeed) { cacheSeed = seed; cache.clear(); }
  let v = cache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'prop') ^ (ci * 2246822519)) >>> 0);
  const out = [];
  const x0 = ci * CELL;
  const b = biomeAt(x0 + CELL * 0.5);
  // stone country has more rock in it and less that ever grew
  const stony = b.id === 'badlands' || b.id === 'saltpan' || b.id === 'ridge';

  // boulders: rare, because a boulder you have to climb every ten paces is a
  // wall, not a landscape
  if (r() < (stony ? 0.42 : 0.20)) {
    const big = r() < 0.34;
    out.push({
      kind: 'boulder',
      x: x0 + r() * CELL,
      w: big ? 24 + r() * 17 : 12 + r() * 10,
      h: big ? 10 + r() * 7 : 4.5 + r() * 4,
      seed: (r() * 1e9) >>> 0,
      red: b.id === 'badlands' || r() < 0.35,
    });
  }
  // A MAST. Not many, and never two together: a columnar tree gets to be a
  // columnar tree by being the only thing within thirty metres drinking.
  if (r() < (stony ? 0.05 : 0.14)) {
    out.push({
      kind: 'mast',
      x: x0 + r() * CELL,
      id: `mast${ci}`,
      h: 62 + r() * 74,
      arms: r() < 0.22 ? 0 : 1 + Math.floor(r() * 3),
      seed: (r() * 1e9) >>> 0,
      flip: r() < 0.5,
      shade: 0.86 + r() * 0.14,
    });
  }
  // scrub: common, and clustered, because dry things grow where other dry
  // things already managed it
  const n = r() < 0.5 ? 0 : 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const kind = r() < 0.62 ? 'bush' : r() < 0.72 ? 'ribs' : 'snag';
    out.push({
      kind,
      x: x0 + r() * CELL,
      s: 0.55 + r() * 0.75,
      seed: (r() * 1e9) >>> 0,
      flip: r() < 0.5,
      shade: 0.74 + r() * 0.26,
    });
  }
  // nothing stands in the water of an oasis or on the floor of a ruin
  if (guard) {
    for (let i = out.length - 1; i >= 0; i--) {
      const p = out[i];
      if (guard(String(seed), p.x, p.kind === 'boulder' ? p.w : 6, p.kind)) out.splice(i, 1);
    }
  }
  cache.set(ci, out);
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  return out;
}

/** How far a boulder's back stands above the sand it is sitting in. */
function domeAt(p, dx) {
  if (dx <= -1 || dx >= 1) return 0;
  const k = 1 - dx * dx;
  return p.h * k * k * (1.4 - 0.4 * Math.abs(dx));
}

/**
 * How much the rock under this point lifts the ground.
 *
 * This is the whole reason boulders are worth having. `Terrain.baseY` adds it
 * in, so a boulder is part of the surface: the crab's feet find it, the sand
 * deforms on top of it, and you cannot walk through it because there is
 * nothing to walk through - the floor simply goes up. The sprite is painted
 * to this same curve, so what you climb and what you see are one object.
 */
export function propBump(seed, x) {
  const c = Math.floor(x / CELL);
  let d = 0;
  for (let ci = c - 1; ci <= c + 1; ci++) {
    for (const p of propsIn(seed, ci)) {
      if (p.kind !== 'boulder') continue;
      d -= domeAt(p, (x - p.x) / p.w);
    }
  }
  return Math.max(-MAX_BUMP, d);
}

/** The sand under a boulder at x: the ground with this boulder's own bump taken out. */
export function boulderSand(terrain, p, x) {
  return terrain.baseY(x) + domeAt(p, (x - p.x) / p.w);
}

/** The level of the sand a boulder is sitting in (its own bump taken back out). */
export function boulderSeat(terrain, p) {
  return terrain.baseY(p.x) + domeAt(p, 0);
}

// ---------------------------------------------------------------------------
// rock formations
//
// A step in the ground is not a mountain. What the basin actually has in it is
// ROCK: the harder beds of the old sea floor, left standing where the wind took
// everything softer away - buttes, benches, fins, the stumps of things that
// used to be bigger. They stand on the desert rather than being cut into it,
// they are made of courses you can read, and they go up in TERRACES, which is
// the whole point: a terrace is a step an animal can take, so a formation is
// something you climb rather than something you walk around.

const FORM_CELL = 1400;
const formCache = new Map();
let formSeed = null;

function formIn(seed, ci) {
  if (seed !== formSeed) { formSeed = seed; formCache.clear(); }
  let v = formCache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'form') ^ (ci * 1103515245)) >>> 0);
  const x = ci * FORM_CELL + FORM_CELL * (0.2 + r() * 0.6);
  const b = biomeAt(x);
  const stony = b.id === 'badlands' || b.id === 'ridge' || b.id === 'saltpan'
    || b.id === 'glassflats' || b.id === 'ashwood' || b.id === 'deepwell';
  if (ci === 0 || r() > (stony ? 0.8 : 0.5)) { formCache.set(ci, null); return null; }
  // three shapes, because three is enough to stop it reading as one asset:
  // a butte with a flat top, a stack of benches, and a low fin
  const kind = r() < 0.4 ? 'butte' : r() < 0.75 ? 'bench' : 'fin';
  const h = kind === 'butte' ? 74 + r() * 78 : kind === 'bench' ? 46 + r() * 54 : 30 + r() * 26;
  v = {
    id: 'fm' + ci, ci, x, kind,
    h,
    w: h * (kind === 'fin' ? 3.4 : 1.5 + r() * 0.9),
    steps: kind === 'fin' ? 2 : 3 + Math.floor(r() * 3),
    seed: (hashStr(String(seed)) ^ (ci * 7919)) >>> 0,
    red: b.mesaMat === 'rockRed' || r() < 0.4,
    flip: r() < 0.5,
  };
  formCache.set(ci, v);
  if (formCache.size > 220) formCache.clear();
  return v;
}

/**
 * How high the rock stands at this point.
 *
 * Terraced: the profile is a staircase with the treads rounded off, so every
 * riser is inside what the animal can climb and the whole thing is still a
 * hundred and fifty pixels of rock. `u` runs -1..1 across the formation.
 */
function formHeight(f, u) {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  const dir = f.flip ? -u : u;
  // the staircase: each step is a plateau with a rounded riser in front of it
  const t = 1 - a;
  const s = f.steps;
  const step = Math.min(s - 1, Math.floor(t * s));
  const frac = t * s - step;
  const ease = frac * frac * (3 - 2 * frac);
  const tier = (step + ease) / s;
  // one side is cut back harder than the other, so it is not a symmetric lump
  const lean = 1 - clamp01((dir + 1) / 2) * 0.22;
  return f.h * Math.pow(tier, 0.82) * lean;
}

export function formNear(seed, x, radius = FORM_CELL) {
  const out = [];
  const c0 = Math.floor((x - radius) / FORM_CELL), c1 = Math.floor((x + radius) / FORM_CELL);
  for (let ci = c0; ci <= c1; ci++) {
    const f = formIn(seed, ci);
    if (f && Math.abs(f.x - x) <= radius + f.w) out.push(f);
  }
  return out;
}

/**
 * How much rock is stacked at this point - the same number `cliffOffset`
 * subtracts, given a name so the terrain painter can put ROCK there instead
 * of sand. Without it a butte is a hundred and fifty pixels of dune.
 */
export function formDepth(seed, x) {
  const c = Math.floor(x / FORM_CELL);
  let d = 0;
  for (let ci = c - 1; ci <= c + 1; ci++) {
    const f = formIn(seed, ci);
    if (!f) continue;
    const u = (x - f.x) / f.w;
    if (u <= -1 || u >= 1) continue;
    d += formHeight(f, u);
  }
  return d;
}

/** The rock, folded into the ground the same way the boulders are. */
export function cliffOffset(seed, x) {
  const c = Math.floor(x / FORM_CELL);
  let d = 0;
  for (let ci = c - 1; ci <= c + 1; ci++) {
    const f = formIn(seed, ci);
    if (!f) continue;
    const u = (x - f.x) / f.w;
    if (u <= -1 || u >= 1) continue;
    d -= formHeight(f, u);
  }
  return d;
}


// ---------------------------------------------------------------------------
// stone and plants: pure scenery, on a stream of its own so the boulders and
// masts above (which are gameplay) stay exactly where they always were

const decorCache = new Map();
let decorSeed = null;

const FLORA_BY_BIOME = {
  theshallows: [['grass', 4], ['saltbush', 2], ['deadbrush', 1]],
  saltpan: [['saltbush', 4], ['grass', 3], ['deadbrush', 2], ['limb', 1]],
  bonereef: [['saltbush', 3], ['grass', 2], ['deadbrush', 2], ['pear', 1], ['agave', 0.6]],
  dunes: [['grass', 4], ['creosote', 3], ['saltbush', 1], ['deadbrush', 2], ['pear', 1.5], ['barrel', 1],
    ['ocotillo', 1], ['yucca', 0.7], ['agave', 0.6], ['limb', 0.6]],
  glassflats: [['grass', 3], ['saltbush', 2], ['agave', 1.5], ['yucca', 1.5], ['deadbrush', 1]],
  rustlands: [['creosote', 3], ['deadbrush', 3], ['ocotillo', 2], ['barrel', 1.5], ['pear', 1.5], ['grass', 2], ['limb', 1]],
  ashwood: [['deadbrush', 4], ['limb', 3], ['grass', 2], ['yucca', 1], ['agave', 1]],
  deepwell: [['saltbush', 2], ['grass', 2], ['deadbrush', 2], ['agave', 2], ['yucca', 1]],
};
const CRAG_BY_BIOME = {
  ashwood: [['columns', 3], ['cluster', 4], ['boulder', 3]],
  deepwell: [['columns', 3], ['cluster', 4], ['boulder', 3]],
  saltpan: [['cluster', 5], ['boulder', 4], ['slab', 1]],
  bonereef: [['cluster', 5], ['boulder', 4], ['slab', 1]],
  theshallows: [['cluster', 5], ['boulder', 5]],
  default: [['cluster', 4.5], ['boulder', 2.5], ['stack', 2], ['slab', 1]],
};
function pickW(list, x) {
  let t = 0;
  for (const [, w] of list) t += w;
  let k = x * t;
  for (const [id, w] of list) { k -= w; if (k <= 0) return id; }
  return list[0][0];
}

/** The scenery on this stretch: rocks of every size, and what grows. */
export function decorIn(seed, ci) {
  if (seed !== decorSeed) { decorSeed = seed; decorCache.clear(); }
  let v = decorCache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'decor') ^ (ci * 3266489917)) >>> 0);
  const out = [];
  const x0 = ci * CELL;
  const b = biomeAt(x0 + CELL * 0.5);
  const stony = b.id === 'ashwood' || b.id === 'deepwell' || b.id === 'saltpan' || b.id === 'glassflats';
  const sid = () => (r() * 4294967296) >>> 0;

  // the big ones: rocks you walk in front of, two and three times your height
  if (r() < (stony ? 0.15 : 0.085)) {
    const rock = pickW(CRAG_BY_BIOME[b.id] || CRAG_BY_BIOME.default, r());
    const h = rock === 'stack' ? 62 + r() * 50 : rock === 'columns' ? 40 + r() * 40 : 30 + r() * 44;
    const w = rock === 'stack' ? h * (0.55 + r() * 0.2) : rock === 'columns' ? h * (0.6 + r() * 0.4)
      : rock === 'slab' ? h * (1.6 + r() * 0.6) : h * (1.25 + r() * 0.8);
    out.push({ kind: 'rock', rock, x: x0 + r() * CELL, w, h, stone: stoneFor(b.id, r()), seed: sid(), layer: 'far' });
  }
  // middling rocks, often more than one
  const nm = r() < (stony ? 0.5 : 0.32) ? 1 + (r() < 0.3 ? 1 : 0) : 0;
  for (let i = 0; i < nm; i++) {
    const rock = r() < 0.35 ? 'cluster' : r() < 0.88 ? 'boulder' : 'slab';
    const h = 6 + r() * 15;
    out.push({ kind: 'rock', rock, x: x0 + r() * CELL, w: h * (1.3 + r() * 0.8) * (rock === 'cluster' ? 1.5 : 1), h,
      stone: stoneFor(b.id, r()), seed: sid(), layer: h > 11 || r() < 0.5 ? 'far' : 'near' });
  }
  // pebbles, everywhere
  const np = r() < 0.55 ? 1 + (r() < 0.35 ? 1 : 0) : 0;
  for (let i = 0; i < np; i++) {
    out.push({ kind: 'rock', rock: 'pebbles', x: x0 + r() * CELL, w: 8 + r() * 12, h: 2.5 + r() * 2.5,
      stone: stoneFor(b.id, r()), seed: sid(), layer: r() < 0.6 ? 'near' : 'far' });
  }
  // what grows
  const table = FLORA_BY_BIOME[b.id] || FLORA_BY_BIOME.dunes;
  const nf = (r() < 0.75 ? 1 : 0) + (r() < 0.5 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
  for (let i = 0; i < nf; i++) {
    const plant = pickW(table, r());
    const s = 0.75 + r() * 0.55;
    const tall = plant === 'ocotillo' || plant === 'yucca' || plant === 'creosote' || plant === 'limb';
    out.push({ kind: 'plant', plant, x: x0 + r() * CELL, s, seed: sid(), flip: r() < 0.5,
      layer: tall || r() < 0.6 ? 'far' : 'near' });
  }
  if (guard) {
    for (let i = out.length - 1; i >= 0; i--) {
      const d = out[i];
      const hw = d.kind === 'rock' ? d.w * 0.5 : 8;
      if (guard(String(seed), d.x, hw, d.kind)) { out.splice(i, 1); continue; }
      // and nothing big inside a butte: the rock would poke out of its side
      if (d.layer === 'far' && (formDepth(seed, d.x) > 2 || formDepth(seed, d.x - hw) > 2 || formDepth(seed, d.x + hw) > 2)) {
        out.splice(i, 1);
      }
    }
  }
  out.sort((a, b2) => (b2.h || 10) - (a.h || 10));
  decorCache.set(ci, out);
  if (decorCache.size > 400) decorCache.delete(decorCache.keys().next().value);
  return out;
}

// ---------------------------------------------------------------------------
// what they look like

// Baked once, kept in a small LRU, and baked at most a few milliseconds' worth
// per frame: a sprite that is not ready yet is simply not drawn this frame
// (everything is baked well outside the edge of the screen).
const art = new Map();
const ART_MAX = 320;
let budgetEnd = Infinity;

/** Call once a frame before drawing props: how long baking may take. */
export function beginPropFrame(ms = 7) { budgetEnd = performance.now() + ms; }

export function bake(key, fn, force = false) {
  let v = art.get(key);
  if (v) { art.delete(key); art.set(key, v); return v; }
  if (!force && performance.now() > budgetEnd) return null;
  v = fn();
  art.set(key, v);
  while (art.size > ART_MAX) art.delete(art.keys().next().value);
  return v;
}

const BOULDER_STONE = { dunes: 'sandstoneBuff', rustlands: 'sandstoneBuff', ashwood: 'basalt', deepwell: 'basalt',
  glassflats: 'limestone', saltpan: 'limestone', bonereef: 'limestone', theshallows: 'limestone' };

/**
 * A boulder you walk over: real faceted stone, but cut to exactly the curve
 * it raises the ground by, so its back IS the surface your feet find.
 * Anchored at the level of the sand round it.
 */
function paintBoulder(p) {
  const b = biomeAt(p.x);
  const stone = p.red ? 'sandstone' : (BOULDER_STONE[b.id] || 'sandstoneBuff');
  const wob = [(p.seed % 1000) / 159, (p.seed % 777) / 123];
  const lip = (dx) => domeAt(p, dx) * (1 + Math.sin(dx * 7 + wob[0]) * 0.04 + Math.sin(dx * 17 + wob[1]) * 0.025);
  const body = rockBody({
    seed: p.seed, rw: p.w, rh: p.h * 1.4, bury: 2, stone, dust: b.crustMat === 'bone' ? 'sandPale' : 'desertSand',
    dome: (cx, gy) => ({
      // a smooth dome whose zero line is the walkable curve; the facets are
      // cut from it and never rise above it
      f: (x, y) => {
        const dx = (x - cx) / p.w;
        if (dx <= -1.05 || dx >= 1.05) return -5;
        const L = Math.max(0.5, lip(clamp(dx, -0.999, 0.999)));
        const u = (gy + 3 - y) / (L + 3);
        return Math.sqrt(Math.max(0, 1 - dx * dx)) * p.h * 1.2 * (1 - u * u) - (u > 1 ? 4 : 0);
      },
      Hd: p.h * 1.2, x0: cx - p.w - 1, x1: cx + p.w + 1, y0: gy - p.h * 1.45 - 2, clip: true,
    }),
  });
  return { cv: body.cv, ox: body.ox, oy: body.oy, top: p.h * 1.4, bury: 2, foot: p.w * 0.95 };
}

/** Ribs. Something walked this far and then did not. */
function paintRibs(p) {
  const r = mulberry32(p.seed);
  const s = p.s;
  const W = Math.ceil(30 * s) + 8, H = Math.ceil(16 * s) + 8;
  const pt = new Painter(W, H);
  const cx = W / 2, base = H - 3;
  const n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5;
    const x = cx + u * 22 * s;
    const hgt = (7 + Math.cos(u * 3) * 4 + r() * 2) * s;
    // a rib is a curve out of the sand and back towards the spine
    pt.curve([[x, base], [x + u * 4 * s, base - hgt], [x + u * 9 * s, base - hgt * 0.72]],
      1.15 * s, 0.6 * s, { mat: 'bone', dome: 1.2, tint: 0.05 + (r() - 0.5) * 0.16 });
  }
  // the spine they all hang off, mostly buried
  pt.capsule(cx - 11 * s, base - 1, cx + 11 * s, base - 2, 1.2 * s, 0.8 * s,
    { mat: 'bone', dome: 1.1, tint: -0.1 });
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#231c14' });
  return { cv, ox: cx, oy: base };
}

/**
 * A MAST.
 *
 * The desert's answer to a tree, and it is not a tree: no leaves, no canopy,
 * nothing to lose water out of. One ribbed green column holding a season of
 * rain, a couple of arms that turned up to the light, a woody grey foot where
 * the bottom has given up being green, and a crown of fruit if it got enough
 * to spare. Fell it and you get the thing everybody out here actually wants,
 * which is a straight piece of something.
 */
function paintMast(p) {
  const r = mulberry32(p.seed);
  const H = Math.ceil(p.h) + 10;
  const W = Math.ceil(26 + p.arms * 22) + 10;
  const pt = new Painter(W, H);
  const cx = W / 2, base = H - 3;
  const tw = 4.2 + p.h * 0.026;                 // how thick the column is

  /** One ribbed limb, thinning as it goes. */
  const limb = (x0, y0, x1, y1, w0, w1, ribs) => {
    pt.capsule(x0, y0, x1, y1, w0, w1, { mat: 'cactus', dome: w0 * 1.25, tint: 0.02 });
    // the ribs: what lets it swell and shrink with the water in it
    const n = Math.max(2, Math.round(ribs));
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      pt.capsule(x0 + u * w0 * 1.6, y0, x1 + u * w1 * 1.6, y1,
        w0 * 0.14, w1 * 0.14, { mat: 'cactus', mask: true, dome: -w0 * 0.3, tint: -0.30 });
    }
  };

  // the trunk, leaning a little because nothing grows plumb
  const lean = (r() - 0.5) * 0.16;
  const topY = base - p.h;
  limb(cx, base, cx + lean * p.h, topY, tw, tw * 0.78, 5);
  // the crown, rounded off
  pt.ellipse(cx + lean * p.h, topY, tw * 0.78, tw * 0.62,
    { mat: 'cactus', dome: tw * 0.9, tint: 0.1 });

  // the arms: up out of the trunk and then up again, which is the whole
  // silhouette anybody recognises
  for (let i = 0; i < p.arms; i++) {
    const side = i % 2 ? 1 : -1;
    const at = 0.34 + r() * 0.34;
    const y = base - p.h * at;
    const out = (7 + r() * 9) + tw;
    const up = p.h * (0.20 + r() * 0.26);
    const w = tw * (0.62 + r() * 0.2);
    limb(cx + lean * p.h * at, y, cx + side * out, y - out * 0.35, w, w * 0.94, 3);
    limb(cx + side * out, y - out * 0.35, cx + side * out * 1.06, y - out * 0.35 - up,
      w * 0.94, w * 0.8, 3);
    pt.ellipse(cx + side * out * 1.06, y - out * 0.35 - up, w * 0.8, w * 0.64,
      { mat: 'cactus', dome: w, tint: 0.1 });
  }

  // the foot, which stopped being green a long time ago
  const fh = Math.min(p.h * 0.22, 16);
  pt.capsule(cx, base, cx, base - fh, tw * 1.08, tw * 0.9,
    { mat: 'wood', dome: tw * 1.1, tint: -0.04 });
  for (let i = 0; i < 4; i++) {
    const f = (i / 3 - 0.5) * 2;
    pt.capsule(cx, base - 2, cx + f * tw * 2.4, base + 1, tw * 0.4, tw * 0.22,
      { mat: 'wood', dome: tw * 0.4, tint: -0.14 });
  }
  pt.grain('wood', { freq: 0.6, amp: 0.26, seed: p.seed & 511 });

  // spines, and fruit if it had a good year
  pt.speckle('cactus', { density: 0.11, amp: 0.55, seed: (p.seed >> 5) & 1023 });
  if (p.h > 92) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * (0.2 + r() * 0.6);
      pt.ellipse(cx + lean * p.h + Math.cos(a) * tw * 0.8, topY + Math.sin(a) * tw * 0.7,
        1.7, 1.5, { mat: 'petalWhite', dome: 1.8, tint: 0.1 });
    }
  }
  pt.smoothHeight(1, 0.3);
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#141c12' });
  return { cv, ox: cx, oy: base };
}

/** What is left after you fell one: a foot, and a splintered top. */
function paintStump(p) {
  const r = mulberry32(p.seed ^ 0x5bd1);
  const tw = 4.2 + p.h * 0.026;
  const H = Math.ceil(tw * 3) + 8, W = Math.ceil(tw * 6) + 8;
  const pt = new Painter(W, H);
  const cx = W / 2, base = H - 3;
  pt.capsule(cx, base, cx, base - tw * 2, tw * 1.08, tw * 0.95,
    { mat: 'wood', dome: tw * 1.1, tint: -0.06 });
  // the break: splinters, not a saw cut
  for (let i = 0; i < 6; i++) {
    const u = (i / 5 - 0.5) * 2;
    pt.capsule(cx + u * tw * 0.8, base - tw * 2, cx + u * tw * 0.9,
      base - tw * (2 + r() * 1.1), tw * 0.16, tw * 0.08,
      { mat: 'woodPale', dome: tw * 0.2, tint: 0.1 });
  }
  for (let i = 0; i < 4; i++) {
    const f = (i / 3 - 0.5) * 2;
    pt.capsule(cx, base - 2, cx + f * tw * 2.4, base + 1, tw * 0.4, tw * 0.22,
      { mat: 'wood', dome: tw * 0.4, tint: -0.14 });
  }
  pt.grain('wood', { freq: 0.6, amp: 0.26, seed: p.seed & 511 });
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#1a1410' });
  return { cv, ox: cx, oy: base };
}

/** A ball of dry stems, drawn once and then spun at draw time. */
function paintWeed(seed, s) {
  const r = mulberry32(seed);
  const R = 9 * s;
  const W = Math.ceil(R * 2) + 8, H = W;
  const pt = new Painter(W, H);
  const cx = W / 2, cy = H / 2;
  const n = 16 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, a2 = a + (r() - 0.5) * 2.4;
    const r1 = R * (0.1 + r() * 0.35), r2 = R * (0.55 + r() * 0.45);
    pt.capsule(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1,
      cx + Math.cos(a2) * r2, cy + Math.sin(a2) * r2,
      0.75 * s, 0.45 * s, { mat: 'leafDry', dome: 0.8, tint: (r() - 0.5) * 0.36 });
  }
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#1e1810' });
  return { cv, ox: cx, oy: cy };
}

const FLORA_FN = {
  creosote: FL.creosote, saltbush: FL.saltbush, deadbrush: FL.deadbrush, grass: FL.bunchgrass,
  pear: FL.pricklypear, barrel: FL.barrel, agave: FL.agave, yucca: FL.yucca, ocotillo: FL.ocotillo,
  limb: FL.deadlimb,
};

/** What an old scrub entry is, now that the desert has species in it. */
function scrubPlant(p) {
  if (p.kind === 'snag') return 'limb';
  const b = biomeAt(p.x);
  const k = (p.seed % 1000) / 1000;
  if (b.id === 'saltpan' || b.id === 'bonereef' || b.id === 'theshallows') return k < 0.6 ? 'saltbush' : 'deadbrush';
  if (b.id === 'ashwood') return 'deadbrush';
  return k < 0.5 ? 'creosote' : k < 0.75 ? 'deadbrush' : 'saltbush';
}

/** Art for an entry of propsIn. Returns null while it is waiting to be baked. */
export function propArt(p, felled = false, force = false) {
  if (p.kind === 'mast') {
    return bake(`m${p.seed}:${Math.round(p.h)}:${p.arms}:${felled ? 1 : 0}`,
      () => ({ bury: 3, foot: 6, ...(felled ? paintStump(p) : paintMast(p)) }), force);
  }
  if (p.kind === 'boulder') {
    return bake(`b${p.seed}:${Math.round(p.w)}:${Math.round(p.h)}:${p.red ? 1 : 0}`, () => paintBoulder(p), force);
  }
  if (p.kind === 'ribs') {
    return bake(`r${p.seed}:${Math.round(p.s * 8)}`, () => ({ bury: 2, foot: 10 * p.s, sway: 0, ...paintRibs(p) }), force);
  }
  const plant = scrubPlant(p);
  return bake(`s${plant}${p.seed}:${Math.round(p.s * 8)}`, () => FLORA_FN[plant](p.seed, 0.55 + p.s * 0.45), force);
}

/** Art for an entry of decorIn. */
export function decorArt(d, force = false) {
  if (d.kind === 'rock') {
    return bake(`d${d.seed}`, () => {
      const b = biomeAt(d.x);
      const a = paintRocks({ seed: d.seed, kind: d.rock, w: d.w, h: d.h, stone: d.stone,
        dust: b.crustMat === 'bone' ? 'sandPale' : 'desertSand' });
      a.bury = clamp(3 + d.h * 0.12, 3, 12);
      return a;
    }, force);
  }
  return bake(`f${d.plant}${d.seed}`, () => {
    const a = FLORA_FN[d.plant](d.seed, d.s);
    a.bury = 2;
    return a;
  }, force);
}

export function weedArt(seed, s) {
  return bake(`w${seed}:${Math.round(s * 8)}`, () => paintWeed(seed, s), true);
}

// ---------------------------------------------------------------------------
// the one thing out here that moves without wanting something

const WEED_LIFE = 40;

export class Tumbleweeds {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.next = 2 + Math.random() * 4;
  }

  update(dt) {
    const g = this.game;
    const w = g.weather;
    const wind = (w?.windDir ?? 1) * (0.4 + (w?.windSpeed ?? 0.4) * 1.9);
    const view = (g.renderer?.vw || 400) / Math.max(0.2, g.cam?.zoom || 1);

    this.next -= dt;
    if (this.next <= 0 && this.list.length < 5) {
      // a gust-rate: still air almost never produces one, a storm produces a
      // steady procession of them
      this.next = 3.5 + Math.random() * 9 - (w?.windSpeed ?? 0.4) * 3;
      const dir = Math.sign(wind) || 1;
      const x = g.crab.x - dir * (view * 0.6 + 40);
      this.list.push({
        x, y: g.terrain.surfaceY(x) - 10,
        vx: wind * 26 + (Math.random() - 0.5) * 8,
        vy: 0, spin: Math.random() * TAU,
        s: 0.7 + Math.random() * 0.85,
        seed: (Math.random() * 1e9) >>> 0,
        life: WEED_LIFE,
      });
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.life -= dt;
      // the wind pushes it and the ground stops it, and it is light enough
      // that both of those happen quickly
      t.vx += (wind * 30 - t.vx) * Math.min(1, dt * 1.3);
      t.vy += 260 * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      const gy = g.terrain.surfaceY(t.x) - 7 * t.s;
      if (t.y > gy) {
        // it bounces, and it bounces harder off a slope, which is what sends
        // one over a boulder instead of stopping dead against it
        t.y = gy;
        const slope = g.terrain.slope(t.x);
        t.vy = -Math.abs(t.vy) * 0.42 - Math.abs(slope) * 70 - 20;
        t.vx *= 0.92;
        if (Math.abs(t.vy) > 40 && Math.random() < 0.5) {
          g.fx?.puff?.(t.x, t.y + 4, 1);
        }
      }
      t.spin += (t.vx / (9 * t.s)) * dt;
      if (t.life <= 0 || Math.abs(t.x - g.crab.x) > view * 1.1 + 200) {
        this.list.splice(i, 1);
      }
    }
  }

  draw(ctx, cam) {
    const z = cam.zoom;
    for (const t of this.list) {
      const a = weedArt(t.seed, t.s);
      const s = cam.worldToScreen(t.x, t.y);
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z, z);
      ctx.rotate(t.spin);
      ctx.globalAlpha = clamp01(t.life / 3);
      ctx.drawImage(a.cv, -a.ox, -a.oy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
