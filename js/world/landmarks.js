// CRABDEN - the places worth walking to.
//
// The desert is not scenery you cross to get to gameplay; crossing it is the
// game. So the world has real destinations in it - oases sunk into the ground
// with water actually standing in them, ruins that were built by people who
// thought the water would come back, and bone fields where a herd died on the
// way to one. They are generated from the world seed, which means the oasis
// you found yesterday is exactly where you left it.

import { clamp, clamp01, lerp, smoothstep, mulberry32, hashStr, TAU } from '../lib/math.js';
import { Painter, makeCanvas, hash2i } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { buildPlant } from '../art/floraart.js';
import { FLORA_BY_ID } from '../data/flora.js';
import { biomeAt } from './biomes.js';
import {
  propsIn, propArt, decorIn, decorArt, Tumbleweeds, propBump, formNear, setPropGuard, beginPropFrame,
  boulderSeat, boulderSand, bake,
} from './props.js';
import { Terrain } from './terrain.js';
import { GROUND, gsx, gsy, lineY } from '../art/ground.js';
import { paintRocks } from '../art/rockart.js';
import * as FL from '../art/desertflora.js';

const CELL = 2400;               // one landmark per stretch of desert

const KINDS = ['oasis', 'ruin', 'ruin', 'bonefield', 'oasis', 'spire', 'ruin', 'wreck', 'oasis'];

/** What each kind is, in one line, for the map. */
export const KIND_NOTE = {
  oasis: 'standing water',
  ruin: 'human, and old',
  bonefield: 'a herd that did not make it',
  spire: 'wind-cut rock',
  wreck: 'a hull, kilometres from any sea',
};

const NAME_A = ['Bitter', 'Long', 'Low', 'Quiet', 'Salt', 'Broken', 'Green', 'Last',
  'Cold', 'Hollow', 'White', 'Old', 'Wind', 'Deep', 'Red'];
const NAME_B = ['Well', 'Mouth', 'Cistern', 'Basin', 'Rest', 'Seep', 'Spring', 'Cut',
  'Bowl', 'Hand', 'Step', 'Gate', 'Shade', 'Eye'];

// keyed by cell index only; baseY() calls this thousands of times a frame, so
// the lookup has to be a numeric map hit and nothing else
let cacheSeed = null;
let cache = new Map();

/** How far either side of its centre a landmark reshapes the ground. */
function zoneOf(lm) {
  return lm.kind === 'oasis' ? lm.size * 1.45 : lm.kind === 'spire' ? 0 : lm.size * 0.95;
}

/** The landmark that owns this stretch, or null. */
export function landmarkAt(seed, ci) {
  if (seed !== cacheSeed) { cacheSeed = seed; cache = new Map(); }
  let v = cache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'lm') ^ (ci * 2654435761)) >>> 0);
  if (ci === 0) { cache.set(ci, null); return null; }
  const kind = KINDS[Math.floor(r() * KINDS.length)];
  let x = ci * CELL + CELL * (0.22 + r() * 0.56);
  const size = kind === 'oasis' ? 90 + r() * 110 : 60 + r() * 60;
  const depthRoll = r();
  v = {
    id: 'lm' + ci, ci, kind, x, size,
    depth: kind === 'oasis' ? 22 + depthRoll * 18 : 0,
    name: `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`,
    seed: (hashStr(String(seed)) ^ (ci * 40503)) >>> 0,
    biome: null,
  };
  // Water does not stand on top of a butte, and nobody builds a house up the
  // side of one. If a rock formation is in the way, the place moves along its
  // stretch of desert until it is clear.
  const reach = Math.max(zoneOf(v), v.size) + 30;
  const clear = (px) => !formNear(String(seed), px, reach).some((f) => Math.abs(f.x - px) < f.w + reach);
  if (!clear(x)) {
    const lo = ci * CELL + reach, hi = (ci + 1) * CELL - reach;
    for (let k = 1; k < 40; k++) {
      const c1 = x + 40 * Math.ceil(k / 2) * (k % 2 ? 1 : -1);
      if (c1 >= lo && c1 <= hi && clear(c1)) { x = c1; break; }
    }
  }
  v.x = x;
  v.biome = biomeAt(x).id;
  cache.set(ci, v);
  return v;
}

export function landmarksNear(seed, x, radius = CELL) {
  const out = [];
  const c0 = Math.floor((x - radius) / CELL), c1 = Math.floor((x + radius) / CELL);
  for (let ci = c0; ci <= c1; ci++) {
    const lm = landmarkAt(seed, ci);
    if (lm && Math.abs(lm.x - x) <= radius) out.push(lm);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the ground under a landmark
//
// An oasis on the flank of a dune was a notch with a puddle in it: the dunes
// rise and fall sixty pixels across the width of a bowl. Water lies in LOW,
// LEVEL ground, and people build on level ground, so each place now flattens
// the dunes under it before the bowl is cut. To know how high the dunes are
// there it reads them off a private terrain with every landmark switched off
// (RAW), once per place, into a table.

let RAW = 0;
let rawT = null;
function rawGround(seed, x) {
  if (!rawT || rawT.seedKey !== seed) rawT = new Terrain(seed);
  RAW++;
  try { return rawT.baseY(x) - propBump(seed, x); } finally { RAW--; }
}

function levelTable(seed, lm) {
  if (lm.level) return lm.level;
  const Z = zoneOf(lm);
  const step = 2;
  const n = Math.ceil((Z * 2) / step) + 1;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) raw[i] = rawGround(seed, lm.x - Z + i * step);
  // the level to bring it to: an oasis sits low, a building sits on the mean
  let sum = 0, cnt = 0, low = -Infinity;
  for (let i = 0; i < n; i++) {
    const dx = Math.abs(-Z + i * step);
    if (dx > lm.size * 0.8) continue;
    sum += raw[i]; cnt++; low = Math.max(low, raw[i]);
  }
  const mean = cnt ? sum / cnt : raw[n >> 1];
  const L = lm.kind === 'oasis' ? mean * 0.5 + low * 0.5 : mean;
  const k = lm.kind === 'oasis' ? 0.86 : lm.kind === 'bonefield' ? 0.6 : 0.9;
  const off = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dx = Math.abs(-Z + i * step);
    const w = 1 - smoothstep((dx - Z * 0.62) / (Z * 0.38));
    off[i] = w * k * (L - raw[i]);
  }
  lm.level = { x0: lm.x - Z, step, off, n };
  return lm.level;
}

function levelAt(seed, lm, x) {
  const t = levelTable(seed, lm);
  const f = (x - t.x0) / t.step;
  const i = Math.floor(f);
  if (i < 0 || i >= t.n - 1) return 0;
  return lerp(t.off[i], t.off[i + 1], f - i);
}

/**
 * How much the ground drops here because of a landmark. The terrain bakes this
 * in, so an oasis is a real bowl you walk down into rather than a decal.
 */
export function groundOffset(seed, x) {
  if (RAW) return 0;
  // only the cell you are in and its neighbours can reach this far
  const c = Math.floor(x / CELL);
  let d = 0;
  for (let ci = c - 1; ci <= c + 1; ci++) {
    const lm = landmarkAt(seed, ci);
    if (!lm) continue;
    const Z = zoneOf(lm);
    const dx = x - lm.x;
    if (!Z || dx < -Z || dx > Z) continue;
    d += levelAt(seed, lm, x);
    if (!lm.depth || dx < -lm.size || dx > lm.size) continue;
    const k = 1 - Math.abs(dx) / lm.size;
    const sk = k * k * (3 - 2 * k);
    d += lm.depth * sk * sk;
  }
  return d;
}

/**
 * Where the water stands in a bowl.
 *
 * Measured off the deepest ground anywhere in the bowl, because a body of
 * water finds the lowest point - not off one sample at the centre, which a
 * boulder could lift and leave the pool hanging in the air.
 */
export function poolSurface(lm, terrain) {
  if (lm.surface !== undefined) return lm.surface;
  let deep = -Infinity;
  const step = Math.max(2, lm.size / 24);
  for (let x = lm.x - lm.size; x <= lm.x + lm.size; x += step) {
    const y = terrain.baseY(x);
    if (y > deep) deep = y;
  }
  lm.surface = Math.round(deep - lm.depth * 0.7);
  return lm.surface;
}

/** Water surface height for an oasis, or null if this is not in one. */
export function poolAt(seed, x, terrain) {
  for (const lm of landmarksNear(seed, x, CELL)) {
    if (lm.kind !== 'oasis') continue;
    if (Math.abs(x - lm.x) > lm.size) continue;
    const surface = poolSurface(lm, terrain);
    if (terrain.baseY(x) > surface) return { lm, y: surface };
  }
  return null;
}

// Nothing stands in the water of an oasis, and the floor of a ruin is clear.
setPropGuard((seed, x, hw, kind) => {
  const c = Math.floor(x / CELL);
  for (let ci = c - 1; ci <= c + 1; ci++) {
    const lm = landmarkAt(seed, ci);
    if (!lm) continue;
    const dx = Math.abs(x - lm.x);
    if (lm.kind === 'oasis') {
      // the pool and its fringe belong to the oasis's own planting
      if (dx < lm.size * 0.62 + hw) return true;
      if (kind !== 'boulder' && kind !== 'mast' && dx < lm.size * 1.1 + hw) return kind === 'rock' && hw > 20;
    } else if (lm.kind !== 'spire' && dx < lm.size * 0.85 + hw) return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// vegetation scattered across the world, thicker where the water is

const SCATTER_CELL = 26;

/** Deterministic ground plants for a stretch of world. */
export function scatterAt(seed, terrain, x0, x1) {
  const out = [];
  const i0 = Math.floor(x0 / SCATTER_CELL), i1 = Math.ceil(x1 / SCATTER_CELL);
  for (let i = i0; i <= i1; i++) {
    const r = mulberry32((hashStr(String(seed) + 'veg') ^ (i * 374761393)) >>> 0);
    const x = i * SCATTER_CELL + r() * SCATTER_CELL;
    // wetness: near an oasis things actually grow
    let wet = 0, inWater = false;
    for (const lm of landmarksNear(seed, x, CELL)) {
      if (lm.kind !== 'oasis') continue;
      wet = Math.max(wet, clamp01(1.35 - Math.abs(x - lm.x) / lm.size));
      // nothing that grows on land stands in the pool itself
      if (terrain && Math.abs(x - lm.x) < lm.size && terrain.baseY(x) > poolSurface(lm, terrain) - 2) inWater = true;
    }
    if (inWater) continue;
    const b = biomeAt(x);
    const chance = 0.06 + wet * 0.85;
    if (r() > chance) continue;
    const list = b.plants || ['dustmoss'];
    // right at the water it is lush, but a bank is mostly low cover with the
    // occasional tall thing, not a wall of reeds
    const wetMix = ['dustmoss', 'dustmoss', 'saltgrass', 'saltgrass', 'bluefern',
      'pipereed', list[Math.floor(r() * list.length)]];
    // Dry ground used to be nothing but saltgrass and dustmoss, for ever, in
    // every biome - which was dull to walk through and, once studying a wild
    // specimen became the only way to learn a species, made most of the
    // catalogue unreachable. One dry plant in six is now whatever this stretch
    // of desert actually grows.
    const id = wet > 0.5
      ? wetMix[Math.floor(r() * wetMix.length)]
      : (r() < 0.17 ? list[Math.floor(r() * list.length)]
        : r() < 0.68 ? 'saltgrass' : 'dustmoss');
    const def = FLORA_BY_ID[id];
    if (!def) continue;
    out.push({
      x, id,
      stage: wet > 0.72 ? 3 : wet > 0.32 ? 2 : 1,
      variant: Math.floor(r() * 3),
      size: clamp((0.30 + wet * 0.34) * (0.8 + r() * 0.5), 0.25, 0.78),
      flip: r() < 0.5,
      shade: 0.7 + r() * 0.3,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// landmark props

/**
 * A ruin. Not a row of columns - people did not live in rows of columns. They
 * lived in buildings, and what is left of a building is a gable end with the
 * roof gone, a doorway with no door, courses of block where a wall used to run,
 * and a window somebody looked out of at a sea that is not there any more.
 */
function paintRuin(lm) {
  const r = mulberry32(lm.seed);
  const W = Math.round(lm.size * 1.5), H = Math.round(76 + r() * 54);
  const p = new Painter(W, H);
  const base = H - 2;
  const course = 4.2 + r() * 1.6;         // one course of masonry

  /** A wall, built in courses, broken off at a ragged top. */
  const wall = (x0, x1, top, tint = 0) => {
    const w = x1 - x0;
    p.field(x0, top - 3, x1, base + 1, (x, y) => {
      const u = (x - x0) / Math.max(1, w);
      // the top of a wall that has fallen is not level
      const ragged = top + Math.sin(u * 9 + lm.seed) * 3 + Math.sin(u * 23) * 1.6
        + (r() < 0 ? 0 : 0);
      if (y < ragged) return null;
      const row = Math.floor((base - y) / course);
      const off = (row & 1) ? course * 0.9 : 0;
      const bx = ((x - x0 + off) % (course * 2.2));
      const joint = bx < 0.9 || ((base - y) % course) < 0.9;
      return {
        h: joint ? 1.2 : 3.4 + Math.sin(row * 2.1 + bx) * 0.6,
        tint: (joint ? -0.30 : 0.04 + Math.sin(row * 3.7 + bx * 0.9) * 0.06) + tint,
      };
    }, { mat: 'rock' });
  };

  // the gable end: the tallest thing left standing
  const gx = 6 + r() * (W * 0.22);
  const gw = W * (0.26 + r() * 0.14);
  const gh = H * (0.60 + r() * 0.26);
  wall(gx, gx + gw, base - gh);
  // the pitch of the roof it used to have, still readable in the stone
  for (let i = 0; i < 2; i++) {
    const sgn = i ? 1 : -1;
    p.capsule(gx + gw / 2, base - gh - 8, gx + gw / 2 + sgn * gw * 0.5, base - gh + 4,
      2.6, 1.8, { mat: 'rock', dome: 2.2, tint: 0.08 });
  }
  // a window, and the lintel over it
  const wy = base - gh * 0.55;
  p.rect(gx + gw * 0.34, wy, gw * 0.3, gh * 0.24,
    { mat: 'rock', mask: true, dome: -3, tint: -0.62 });
  p.rect(gx + gw * 0.28, wy - 3, gw * 0.42, 3, { mat: 'rock', dome: 2.4, tint: 0.14 });

  // the run of the front wall, lower, with a doorway in it
  const fx = gx + gw + 2 + r() * 8;
  const fw = W - fx - 8 - r() * 20;
  wall(fx, fx + fw, base - H * (0.24 + r() * 0.18), -0.04);
  const dx = fx + fw * (0.2 + r() * 0.5);
  p.rect(dx, base - H * 0.28, 9 + r() * 5, H * 0.28,
    { mat: 'rock', mask: true, dome: -4, tint: -0.66 });

  // a second, further wall, mostly gone: one or two courses in the sand
  const sx = fx + fw * 0.1;
  wall(sx, sx + fw * 0.5, base - course * (1 + Math.floor(r() * 2)), -0.10);

  // fallen block lying where it landed
  for (let i = 0; i < 4 + Math.floor(r() * 5); i++) {
    const bx = 6 + r() * (W - 16);
    const bw = 4 + r() * 7, bh = 3 + r() * 3;
    p.rect(bx, base - bh + 1, bw, bh, { mat: 'rock', dome: 2.2, tint: -0.06 + r() * 0.16 });
  }

  p.grain('rock', { freq: 0.20, amp: 0.24, seed: 3, height: 0.7 });
  p.speckle('rock', { density: 0.035, amp: 0.30, seed: 7 });

  // an inscription band nobody can read any more, cut into the gable
  for (let i = 0; i < 8; i++) {
    p.rect(gx + 3 + i * (gw - 6) / 8, base - gh * 0.82, 2.4, 1.3,
      { mat: 'rock', mask: true, tint: -0.44, dome: -1 });
  }
  // sand banked against the windward side
  p.field(0, base - 12, W, base + 2, (x, y) => {
    const u = x / W;
    const top = base - 10 * Math.pow(Math.max(0, 1 - Math.abs(u - 0.18) * 2.6), 1.5);
    if (y < top) return null;
    return { h: 2, tint: 0.04 };
  }, { mat: 'sand' });
  p.grain('sand', { freq: 0.3, amp: 0.14, seed: 31 });
  return { cv: p.resolve(MATERIALS, { ambient: 0.42, outline: 1, outlineColor: '#191309' }), w: W, h: H };
}

function paintBones(lm) {
  const r = mulberry32(lm.seed);
  const W = Math.round(lm.size * 1.2), H = 40;
  const p = new Painter(W, H);
  const base = H - 3;
  for (let i = 0; i < 3 + Math.floor(r() * 3); i++) {
    const cx = 14 + r() * (W - 28);
    const len = 18 + r() * 26;
    const lift = 5 + r() * 12;
    p.curve([{ x: cx - len / 2, y: base }, { x: cx, y: base - lift }, { x: cx + len / 2, y: base - 1 }],
      2.2, 1.3, { mat: 'bone', dome: 2, steps: 14, tint: 0.02 });
    const ribs = 4 + Math.floor(r() * 4);
    for (let k = 0; k < ribs; k++) {
      const t = (k + 0.5) / ribs;
      const rx = lerp(cx - len / 2, cx + len / 2, t);
      const ry = base - Math.sin(t * Math.PI) * lift;
      p.curve([{ x: rx, y: ry }, { x: rx - 3, y: ry + lift * 0.7 }, { x: rx - 1.5, y: base }],
        1.2, 0.6, { mat: 'bone', dome: 1.1, steps: 8, tint: -0.05 });
    }
    if (r() < 0.6) {
      p.ellipse(cx + len / 2 + 4, base - 3, 4.4, 3.2, { mat: 'bone', dome: 3.4, tint: 0.06 });
      p.ellipse(cx + len / 2 + 6, base - 4, 1.1, 1.0, { mat: 'bone', mask: true, dome: -1.4, tint: -0.42 });
    }
  }
  p.grain('bone', { freq: 0.4, amp: 0.16, seed: 11 });
  return { cv: p.resolve(MATERIALS, { ambient: 0.46, outline: 1, outlineColor: '#201c12' }), w: W, h: H };
}

function paintSpire(lm) {
  const r = mulberry32(lm.seed);
  const W = 54, H = Math.round(100 + r() * 70);
  const p = new Painter(W, H);
  const base = H - 2;
  const lean = (r() - 0.5) * 10;
  p.field(4, 0, W - 4, base, (x, y) => {
    const t = 1 - y / base;
    const cx = W / 2 + lean * t * t;
    const w = lerp(W * 0.40, W * 0.09, Math.pow(t, 0.82)) * (1 + Math.sin(t * 12) * 0.06);
    const d = Math.abs(x - cx);
    if (d > w) return null;
    const dz = Math.sqrt(clamp01(1 - (d / w) ** 2));
    const band = Math.sin(y * 0.26 + Math.sin(t * 5) * 1.4);
    return { h: dz * 12 + band, tint: band * 0.08 - 0.02 + dz * 0.05 };
  }, { mat: 'rockRed' });
  p.grain('rockRed', { freq: 0.18, amp: 0.24, seed: 5, height: 0.8 });
  p.speckle('rockRed', { density: 0.03, amp: 0.32, seed: 9 });
  return { cv: p.resolve(MATERIALS, { ambient: 0.42, outline: 1, outlineColor: '#1d1009' }), w: W, h: H };
}

/**
 * A wreck. Somebody sailed here, on the water you made, and then the water
 * went and the boat stayed exactly where it was.
 */
function paintWreck(lm) {
  const r = mulberry32(lm.seed);
  const W = Math.round(lm.size * 1.5), H = Math.round(56 + r() * 34);
  const p = new Painter(W, H);
  const base = H - 3;
  const bow = 8 + r() * 8;
  const heel = (r() - 0.5) * 0.34;          // it did not settle level

  // the hull, half buried and leaning
  p.field(2, 0, W - 2, base + 2, (x, y) => {
    const u = (x - 4) / (W - 8);
    if (u < 0 || u > 1) return null;
    const sheer = Math.sin(u * Math.PI) ;
    const deck = base - 22 - sheer * bow + (u - 0.5) * heel * 40;
    const keel = base + 2 - sheer * 5;
    if (y < deck || y > keel) return null;
    const t = (y - deck) / Math.max(1, keel - deck);
    const dz = Math.sqrt(clamp01(1 - Math.pow(1 - t, 2)));
    // planking, which is what makes a hull read as built rather than carved
    const plank = Math.sin((y - deck) * 1.05);
    return { h: 3 + dz * 7 + plank * 0.9, tint: -0.06 + dz * 0.16 + plank * 0.10 };
  }, { mat: 'wood' });

  // the ribs standing out of the open deck, where the planking has gone
  const ribs = 5 + Math.floor(r() * 5);
  for (let i = 0; i < ribs; i++) {
    const u = 0.12 + (i / ribs) * 0.78;
    const x = 4 + u * (W - 8);
    const sheer = Math.sin(u * Math.PI);
    const deck = base - 22 - sheer * bow + (u - 0.5) * heel * 40;
    const hgt = 6 + r() * 13;
    p.curve([
      { x, y: deck + 3 },
      { x: x + (r() - 0.5) * 4, y: deck - hgt * 0.6 },
      { x: x + (r() - 0.5) * 7, y: deck - hgt },
    ], 1.9, 0.9, { mat: 'wood', dome: 1.6, steps: 8, tint: 0.06 });
  }
  // a stub of mast, and the rope still on it
  const mx = 4 + (0.34 + r() * 0.2) * (W - 8);
  const mh = 16 + r() * 22;
  p.capsule(mx, base - 24, mx + heel * 12, base - 24 - mh, 2.4, 1.4,
    { mat: 'wood', dome: 2.2, tint: 0.08 });
  for (let i = 0; i < 3; i++) {
    p.curve([
      { x: mx + heel * 10, y: base - 26 - mh * (0.5 + i * 0.2) },
      { x: mx + 10 + i * 9, y: base - 18 + i * 3 },
      { x: mx + 16 + i * 14, y: base - 2 },
    ], 0.8, 0.5, { mat: 'rope', dome: 0.8, steps: 10, tint: -0.05 });
  }
  p.grain('wood', { freq: 0.20, amp: 0.28, seed: 13, height: 0.8 });
  p.speckle('wood', { density: 0.035, amp: 0.30, seed: 21 });
  // sand banked up against the windward side
  p.field(2, base - 12, W - 2, base + 3, (x, y) => {
    const u = (x - 2) / (W - 4);
    const top = base - 11 * Math.pow(Math.max(0, 1 - Math.abs(u - 0.22) * 2.4), 1.6);
    if (y < top) return null;
    return { h: 2, tint: 0.04 };
  }, { mat: 'sand' });
  p.grain('sand', { freq: 0.3, amp: 0.14, seed: 31 });
  return { cv: p.resolve(MATERIALS, { ambient: 0.44, outline: 1, outlineColor: '#1b1209' }), w: W, h: H };
}

const artCache = new Map();
function landmarkArt(lm) {
  let a = artCache.get(lm.id);
  if (a) return a;
  a = lm.kind === 'ruin' ? paintRuin(lm)
    : lm.kind === 'bonefield' ? paintBones(lm)
      : lm.kind === 'spire' ? paintSpire(lm)
        : lm.kind === 'wreck' ? paintWreck(lm) : null;
  artCache.set(lm.id, a);
  return a;
}

// ---------------------------------------------------------------------------

export class World {
  constructor(game, seed) {
    this.game = game;
    this.seed = String(seed);
    this.found = new Set();
    this.scatter = new Map();     // chunk index -> plant list
    this.t = 0;
    // the things that are in the way, and the one thing that is not
    this.weeds = new Tumbleweeds(game);
    // masts you have cut: id -> seconds until it has grown back
    this.felled = new Map();
  }

  chunkScatter(ci) {
    let v = this.scatter.get(ci);
    if (v) return v;
    v = scatterAt(this.seed, this.game.terrain, ci * 512, (ci + 1) * 512);
    this.scatter.set(ci, v);
    if (this.scatter.size > 40) this.scatter.delete(this.scatter.keys().next().value);
    return v;
  }

  update(dt) {
    this.t += dt;
    this.weeds.update(dt);
    const cx = this.game.crab.x;
    for (const lm of landmarksNear(this.seed, cx, 260)) {
      if (this.found.has(lm.id)) continue;
      if (Math.abs(lm.x - cx) > lm.size * 0.9) continue;
      this.found.add(lm.id);
      this.game.onLandmark?.(lm);
    }
  }

  /**
   * The wild plant close enough to kneel next to. Studying one is how a
   * species becomes something you know rather than something you have seen,
   * and it is the only way seed of it gets into your pack.
   */
  wildPlantAt(x, reach = 20) {
    const c0 = Math.floor((x - reach) / 512), c1 = Math.floor((x + reach) / 512);
    let best = null, bd = reach;
    for (let ci = c0; ci <= c1; ci++) {
      for (const v of this.chunkScatter(ci)) {
        if (v.stage < 2) continue;              // a seedling tells you nothing
        const d = Math.abs(v.x - x);
        if (d < bd) { bd = d; best = v; }
      }
    }
    return best;
  }

  /** The mast standing close enough to cut, or null. */
  mastAt(x, reach = 26) {
    const c0 = Math.floor((x - reach) / 128) - 1, c1 = Math.floor((x + reach) / 128) + 1;
    for (let ci = c0; ci <= c1; ci++) {
      for (const p of propsIn(this.seed, ci)) {
        if (p.kind !== 'mast' || this.felled.has(p.id)) continue;
        if (Math.abs(p.x - x) < reach) return p;
      }
    }
    return null;
  }

  /** Cut one down. It grows back, but not this season. */
  fell(p) {
    this.felled.set(p.id, 1);
    // a big one is worth more, which is the only reason to walk past a small one
    const timber = 2 + Math.floor(p.h / 34);
    const fibre = 1 + Math.floor(p.h / 46);
    return { timber, fibre };
  }

  /**
   * Everything within reach for the map, found or not. An unfound mark is
   * still drawn - you can see there is something out there, you just do not
   * know what until you have stood in it.
   */
  marksNear(x, radius = CELL * 3) {
    const out = [];
    const c0 = Math.floor((x - radius) / CELL), c1 = Math.floor((x + radius) / CELL);
    for (let ci = c0; ci <= c1; ci++) {
      const lm = landmarkAt(this.seed, ci);
      if (!lm) continue;
      out.push({ ...lm, key: lm.id, note: KIND_NOTE[lm.kind] || lm.kind });
    }
    return out;
  }

  /** The nearest landmark you have not stood in yet, for the compass. */
  nextUnfound(x) {
    let best = null, bd = 1e9;
    for (let ci = Math.floor(x / CELL) - 2; ci <= Math.floor(x / CELL) + 3; ci++) {
      const lm = landmarkAt(this.seed, ci);
      if (!lm || this.found.has(lm.id)) continue;
      const d = Math.abs(lm.x - x);
      if (d < bd) { bd = d; best = lm; }
    }
    return best;
  }

  // -- drawing ------------------------------------------------------------
  //
  // Order, as the game calls it:
  //   drawProps        BEFORE the terrain: everything that stands behind the
  //                    walking line - big rock, tall plants, masts, palms,
  //                    the ruins. The ground in front hides their feet, which
  //                    is what makes them stand in it.
  //   drawWater        the oasis pools, reflecting what is above them
  //   drawProps2 far   the boulders you walk over, and the sand drifts and
  //                    shadows for everything behind the line
  //   drawScatter      the wild plants you can study
  //   drawProps2 near  small things in front of you, cut at the ground line

  _sun() {
    const w = this.game.weather;
    return w ? clamp01((w.daylight ?? 1) * (1 - (w.haze || 0) * 0.5)) : 1;
  }

  _wind() {
    const w = this.game.weather;
    return { dir: w?.windDir || 1, k: 0.4 + (w?.windSpeed ?? 0.4) };
  }

  /** Draw a sprite with its foot at world (x, y), optionally sheared and swaying. */
  _blit(ctx, cam, a, x, y, slope = 0, flip = false, sway = 0, alpha = 1) {
    const z = cam.zoom;
    const s = flip ? -1 : 1;
    ctx.save();
    ctx.transform(z * s, z * slope * s, z * sway, z * (1 + slope * sway),
      Math.round(gsx(cam, x)), Math.round(gsy(cam, y)));
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(a.cv, -a.ox, -a.oy);
    ctx.restore();
  }

  /**
   * Where a sprite sits: on the lowest ground under its whole foot (it carries
   * buried pixels below its anchor for this), and, for a plant, sheared to
   * the slope so its base runs along the ground instead of across it.
   */
  _seat(x, a, shear) {
    const foot = Math.max(2, a.foot || 4);
    const bury = a.bury ?? 2;
    const st = GROUND.seat(x, a.footL ?? foot, a.footR ?? foot, bury);
    if (!shear) return { y: st.y, slope: 0 };
    const slope = clamp(st.slope, -0.3, 0.3);
    // what the shear does not account for, the bury has to
    let worst = 0;
    for (const f of [-1, -0.5, 0.5, 1]) {
      const wx = x + f * foot;
      worst = Math.max(worst, GROUND.at(wx) - (st.c + slope * (wx - x)));
    }
    return { y: st.c + Math.max(0, worst - bury + 1), slope };
  }

  _swayOf(x, a, rate = 1.7) {
    if (!a.sway) return 0;
    const w = this._wind();
    const g = Math.sin(this.t * rate + x * 0.071) * 0.6 + Math.sin(this.t * rate * 2.3 + x * 0.13) * 0.25;
    return (g * 0.045 + 0.02) * a.sway * w.k * w.dir;
  }

  /** Everything scenic in view, by layer: [{d, x, art, kind}]. */
  _scene(cam) {
    const b = cam.bounds(140);
    const c0 = Math.floor(b.x0 / 128) - 1, c1 = Math.floor(b.x1 / 128) + 1;
    const out = { back: [], boulders: [], near: [] };
    for (let ci = c0; ci <= c1; ci++) {
      for (const p of propsIn(this.seed, ci)) {
        if (p.x < b.x0 - 80 || p.x > b.x1 + 80) continue;
        if (p.kind === 'boulder') { out.boulders.push(p); continue; }
        const big = p.kind === 'mast' || (p.s || 0) > 1.05;
        (big ? out.back : out.near).push({ p, x: p.x, prop: true });
      }
      for (const d of decorIn(this.seed, ci)) {
        if (d.x < b.x0 - 80 || d.x > b.x1 + 80) continue;
        (d.layer === 'near' ? out.near : out.back).push({ d, x: d.x });
      }
    }
    return out;
  }

  _artOf(e) {
    if (e.prop) return propArt(e.p, e.p.kind === 'mast' && this.felled.has(e.p.id));
    return decorArt(e.d);
  }

  /** Things behind the walking line, and the landmarks. Before the terrain. */
  drawProps(ctx, cam) {
    beginPropFrame(7);
    const t = this.game.terrain;
    GROUND.frame(cam, t);
    this._frameScene = this._scene(cam);
    // the oases' own planting goes in first, furthest back
    for (const lm of landmarksNear(this.seed, cam.x, cam.vw / cam.zoom / 2 + 400)) {
      if (lm.kind === 'oasis') this._drawOasisBack(ctx, cam, lm);
    }
    for (const e of this._frameScene.back) {
      const a = this._artOf(e);
      if (!a) continue;
      e.art = a;
      const plant = !!(e.d?.kind === 'plant' || (e.prop && e.p.kind !== 'mast'));
      const st = this._seat(e.x, a, plant);
      e.seatY = st.y;
      const flip = e.prop ? e.p.flip : e.d?.flip;
      let sway = this._swayOf(e.x, a);
      if (e.prop && e.p.kind === 'mast') sway = Math.sin(this.t * 0.9 + e.x * 0.05) * 0.01 * this._wind().k * this._wind().dir;
      this._blit(ctx, cam, a, e.x, st.y, st.slope, flip, sway);
    }
    for (const lm of landmarksNear(this.seed, cam.x, cam.vw / cam.zoom + CELL * 0.5)) {
      const art = landmarkArt(lm);
      if (!art) continue;
      const st = GROUND.seat(lm.x, art.w * 0.42, art.w * 0.42, 2);
      ctx.save();
      ctx.translate(Math.round(gsx(cam, lm.x)), Math.round(gsy(cam, st.y)));
      ctx.scale(cam.zoom, cam.zoom);
      ctx.drawImage(art.cv, -Math.round(art.w / 2), -art.h);
      ctx.restore();
    }
  }

  /** Back-compat: a contact shadow on the crust. */
  _contact(ctx, cam, x, halfW, strength = 1) {
    GROUND.frame(cam, this.game.terrain);
    GROUND.shadow(ctx, cam, x, halfW, strength, this._sun(), this.game.weather?.shadowDir || 1);
  }

  /**
   * After the terrain: the boulders you climb (they ARE the ground there, so
   * they go over it), and the drifts and shadows that seat everything from
   * drawProps into the sand.
   */
  drawProps2(ctx, cam, layer) {
    const t = this.game.terrain;
    GROUND.frame(cam, t);
    const sc = this._frameScene || this._scene(cam);
    const sun = this._sun(), sdir = this.game.weather?.shadowDir || 1;
    const wind = this._wind().dir;
    if (layer === 'far') {
      for (const e of sc.back) {
        const a = e.art;
        if (!a) continue;
        const foot = a.foot || 4;
        const rock = e.d?.kind === 'rock';
        GROUND.shadow(ctx, cam, e.x, foot * (rock ? 1.05 : 0.9), rock ? 1 : 0.7, sun, sdir);
        const dh = rock ? clamp(1.2 + (a.top || 8) * 0.05, 1.2, 4.5) : 1.4;
        GROUND.drift(ctx, cam, e.x, foot * (rock ? 1.15 : 1.25) + 2, dh, wind, e.x | 0);
      }
      for (const p of sc.boulders) {
        const a = propArt(p, false, true);
        if (!a) continue;
        // its own bump taken back out is the sand it sits in; the slope of
        // the sand either side shears it, the same way the bump is sheared
        const y = boulderSeat(t, p);
        const slope = clamp((t.baseY(p.x + p.w) - t.baseY(p.x - p.w)) / (2 * p.w), -0.6, 0.6);
        GROUND.shadow(ctx, cam, p.x, p.w * 0.95, 1, sun, sdir);
        // cut at the sand it is sitting in, so no part of it hangs below
        ctx.save();
        ctx.beginPath();
        for (let x = Math.floor(p.x - p.w - 3); x <= p.x + p.w + 3; x++) {
          const sa = Math.round(gsx(cam, x)), sb = Math.round(gsx(cam, x + 1));
          const sy = Math.round(gsy(cam, Math.ceil(boulderSand(t, p, x) - 0.5))) + 1;
          ctx.rect(sa, -4, sb - sa, sy + 4);
        }
        ctx.clip();
        this._blit(ctx, cam, a, p.x, y, slope, false, 0);
        ctx.restore();
        GROUND.drift(ctx, cam, p.x - p.w * 0.92, p.w * 0.3, 1.6 + p.h * 0.08, wind, p.seed & 255);
        GROUND.drift(ctx, cam, p.x + p.w * 0.92, p.w * 0.3, 1.4 + p.h * 0.06, wind, (p.seed >> 8) & 255);
      }
      return;
    }
    // near: shadows first, then the things themselves cut at the ground line,
    // then the sand over their feet
    const list = [];
    for (const e of sc.near) {
      const a = this._artOf(e);
      if (!a) continue;
      list.push([e, a]);
      GROUND.shadow(ctx, cam, e.x, (a.foot || 4) * 0.9, 0.75, sun, sdir);
    }
    for (const lm of landmarksNear(this.seed, cam.x, cam.vw / cam.zoom / 2 + 300)) {
      if (lm.kind === 'oasis') for (const k of this._oasisKit(lm).front) {
        const a = k.art();
        list.push([{ x: k.x, flip: k.flip, oasis: true }, a]);
        GROUND.shadow(ctx, cam, k.x, (a.foot || 4) * 0.8, 0.5, sun, sdir);
      }
    }
    ctx.save();
    GROUND.clipAbove(ctx, cam, 1);
    for (const [e, a] of list) {
      const plant = !(e.d?.kind === 'rock');
      const st = this._seat(e.x, a, plant);
      const flip = e.prop ? e.p.flip : e.d ? e.d.flip : e.flip;
      this._blit(ctx, cam, a, e.x, st.y, st.slope, flip, this._swayOf(e.x, a, 2.1));
    }
    ctx.restore();
    for (const [e, a] of list) {
      const rock = e.d?.kind === 'rock';
      GROUND.drift(ctx, cam, e.x, (a.foot || 4) * 1.1 + 1.5, rock ? 1.2 + (a.top || 4) * 0.05 : 1, wind, e.x | 0);
    }
  }

  // -- the oasis ------------------------------------------------------------

  /** The planting round a pool, generated once: palms, reeds, rocks, lilies. */
  _oasisKit(lm) {
    if (lm.kit) return lm.kit;
    const t = this.game.terrain;
    const S = poolSurface(lm, t);
    const r = mulberry32(lm.seed ^ 0x0a515);
    // the actual edges of the water
    let xl = Infinity, xr = -Infinity;
    for (let x = Math.floor(lm.x - lm.size); x <= lm.x + lm.size; x++) {
      if (lineY(t, x) > S) { xl = Math.min(xl, x); xr = Math.max(xr, x); }
    }
    if (!isFinite(xl)) { xl = lm.x - 10; xr = lm.x + 10; }
    const kit = { S, xl, xr, palms: [], back: [], front: [], lilies: [], rocks: [] };
    const seed = () => (r() * 4294967296) >>> 0;
    // date palms on the banks, leaning out over the water
    const np = 2 + Math.floor(r() * 2) + (lm.size > 160 ? 1 : 0);
    for (let i = 0; i < np; i++) {
      const left = i % 2 === 0;
      const x = left ? xl - 4 - r() * 42 : xr + 4 + r() * 42;
      const h = 58 + r() * 46;
      const sd = seed();
      kit.palms.push({ x, h, sd, toward: left ? 1 : -1 });
    }
    kit.palms.sort((a, b) => b.h - a.h);
    // the fringe: reeds, cattails and papyrus right at the waterline, the
    // tall stuff behind, low lush grass in front
    const fringe = [FL.cattails, FL.papyrus, FL.reeds, FL.cattails, FL.lushgrass];
    for (const side of [-1, 1]) {
      const edge = side < 0 ? xl : xr;
      const n = 3 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const fn = fringe[Math.floor(r() * fringe.length)];
        const sd = seed(), s = 0.7 + r() * 0.5;
        const x = edge - side * (2 - r() * 4) + side * i * (5 + r() * 6);
        kit.back.push({ x, flip: r() < 0.5, art: () => bake(`ob${sd}`, () => ({ bury: 2, ...fn(sd, s) }), true) });
      }
      const m = 2 + Math.floor(r() * 3);
      for (let i = 0; i < m; i++) {
        const sd = seed(), s = 0.6 + r() * 0.5;
        const x = edge + side * (6 + r() * 34);
        kit.front.push({ x, flip: r() < 0.5, art: () => bake(`of${sd}`, () => ({ bury: 2, ...FL.lushgrass(sd, s) }), true) });
      }
    }
    // a few rocks on the banks, the way they always are
    const nr = 1 + Math.floor(r() * 2);
    for (let i = 0; i < nr; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = (side < 0 ? xl : xr) + side * (14 + r() * 40);
      const sd = seed(), h = 7 + r() * 10;
      const stone = lm.biome === 'ashwood' || lm.biome === 'deepwell' ? 'basalt'
        : lm.biome === 'dunes' || lm.biome === 'rustlands' ? 'sandstone' : 'limestone';
      kit.back.push({ x, rock: true, art: () => bake(`or${sd}`, () => ({ bury: 4, ...paintRocks({ seed: sd,
        kind: r() < 0.5 ? 'cluster' : 'boulder', w: h * 2.4, h, stone }) }), true) });
    }
    // lily pads, never too near the edge
    const nl = Math.max(2, Math.round((xr - xl) / 26));
    for (let i = 0; i < nl; i++) {
      if (xr - xl < 30) break;
      const x = lerp(xl + 12, xr - 12, r());
      const sd = seed(), s = 0.8 + r() * 0.5;
      kit.lilies.push({ x, ph: r() * TAU, art: () => bake(`ol${sd}`, () => FL.lilypad(sd, s), true) });
    }
    lm.kit = kit;
    return kit;
  }

  _palmArt(p) {
    return bake(`op${p.sd}:${Math.round(p.h)}`, () => FL.datePalm(p.sd, p.h, 7), true);
  }

  /** Palms, the tall fringe and the bank rocks: behind the ground line. */
  _drawOasisBack(ctx, cam, lm) {
    const kit = this._oasisKit(lm);
    const w = this._wind();
    for (const p of kit.palms) {
      if (!cam.isVisible(p.x, kit.S, 160)) continue;
      const P = this._palmArt(p);
      const flip = Math.sign(P.lean) !== p.toward;
      const st = GROUND.seat(p.x, 4, 4, 5);
      this._blit(ctx, cam, P.trunk, p.x, st.y, 0, flip);
      // the crown sways through its baked poses with the wind
      const sw = Math.sin(this.t * 0.75 + p.x * 0.013) * 0.7 + Math.sin(this.t * 1.9 + p.x) * 0.2;
      const bias = clamp(w.dir * (w.k - 0.4) * 0.8, -0.6, 0.6) * (flip ? -1 : 1);
      const k = clamp(Math.round(((sw * 0.45 * w.k + bias) * 0.5 + 0.5) * (P.crowns.length - 1)), 0, P.crowns.length - 1);
      const crown = P.crowns[k];
      const cx = p.x + (flip ? -P.crown.x : P.crown.x), cy = st.y + P.crown.y;
      this._blit(ctx, cam, crown, cx, cy, 0, flip);
    }
    for (const k of kit.back) {
      if (!cam.isVisible(k.x, kit.S, 80)) continue;
      const a = k.art();
      const st = this._seat(k.x, a, !k.rock);
      this._blit(ctx, cam, a, k.x, st.y, st.slope, k.flip, k.rock ? 0 : this._swayOf(k.x, { sway: a.sway || 1 }));
    }
  }

  /**
   * The pool, baked once at world scale: clear blue-green water, pale where
   * it is shallow enough to see the sand through, deepening to teal; a floor
   * of green silt; and a ring of dark wet sand up the banks.
   */
  _poolArt(lm) {
    if (lm.poolArt) return lm.poolArt;
    const t = this.game.terrain;
    const S = poolSurface(lm, t);
    const x0 = Math.floor(lm.x - lm.size), x1 = Math.ceil(lm.x + lm.size);
    const W = x1 - x0 + 1;
    const floors = new Int32Array(W);
    let deep = S;
    for (let i = 0; i < W; i++) { floors[i] = lineY(t, x0 + i); deep = Math.max(deep, floors[i]); }
    const bank = 14;
    const y0 = S - bank;
    const H = deep - y0 + 5;
    const cv = makeCanvas(W, H);
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H);
    const d = img.data;
    const WATER = [[168, 226, 204], [122, 208, 194], [80, 184, 182], [52, 152, 162], [34, 118, 138], [24, 88, 112], [16, 62, 86]];
    const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const put = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const o = (y * W + x) * 4;
      const k = a / 255;
      d[o] = d[o] * (1 - k) + c[0] * k; d[o + 1] = d[o + 1] * (1 - k) + c[1] * k;
      d[o + 2] = d[o + 2] * (1 - k) + c[2] * k; d[o + 3] = Math.max(d[o + 3], a);
    };
    for (let i = 0; i < W; i++) {
      const gy = floors[i];
      const D = gy - S;
      if (D > 0) {
        for (let y = S; y < gy; y++) {
          const dd = y - S;
          // shallow water shows the sand through it; deep water goes teal
          let v = dd / 7 + clamp01(D / 16) * 1.6 + (dd > D - 2 ? -0.4 : 0);
          v += (B4[y & 3][(x0 + i) & 3] / 16 - 0.5) * 0.9;
          const c = WATER[clamp(Math.floor(v), 0, WATER.length - 1)];
          put(i, y - y0, c);
        }
        // the silt on the floor, and weed in the deep part
        put(i, gy - 1 - y0, [46, 92, 70], 200);
        if (D > 7 && hash2i(x0 + i, 3, lm.seed) < 0.22) {
          const hh = 2 + Math.floor(hash2i(x0 + i, 5, lm.seed) * Math.min(7, D - 4));
          for (let k = 1; k <= hh; k++) put(i + (k > hh / 2 && hash2i(i, k, 7) < 0.5 ? 1 : 0), gy - 1 - k - y0, [38, 96, 58], 230);
        }
        // the floor itself is wet sand, darker
        for (let k = 0; k < 3; k++) put(i, gy + k - y0, [70, 50, 30], 120 - k * 30);
      } else if (D > -bank) {
        // the bank: wet and dark at the waterline, drying upwards
        const wet = 1 - (-D) / bank;
        for (let k = 0; k < 3; k++) {
          if ((-D) > 2 && B4[(gy + k) & 3][(x0 + i) & 3] / 16 > wet) continue;
          put(i, gy + k - y0, k === 0 && -D < 3 ? [64, 96, 52] : [62, 42, 24], Math.round((150 - k * 35) * wet));
        }
      }
    }
    g.putImageData(img, 0, 0);
    lm.poolArt = { cv, x0, y0, W, H, S, floors, deep };
    return lm.poolArt;
  }

  /** Standing water sunk into the ground. */
  drawWater(ctx, cam) {
    const t = this.game.terrain;
    const z = cam.zoom;
    GROUND.frame(cam, t);
    for (const lm of landmarksNear(this.seed, cam.x, cam.vw / z / 2 + 400)) {
      if (lm.kind !== 'oasis') continue;
      const P = this._poolArt(lm);
      const kit = this._oasisKit(lm);
      const sx0 = Math.round(gsx(cam, P.x0)), sy0 = Math.round(gsy(cam, P.y0));
      if (sx0 > cam.vw || sx0 + P.W * z < 0) continue;
      ctx.drawImage(P.cv, sx0, sy0, Math.round(P.W * z), Math.round(P.H * z));
      const Ssc = Math.round(gsy(cam, P.S));
      const sxa = Math.max(0, Math.round(gsx(cam, kit.xl))), sxb = Math.min(cam.vw, Math.round(gsx(cam, kit.xr + 1)));
      const w = sxb - sxa;
      const D = Math.min(Ssc, Math.round((P.deep - P.S) * z));
      if (w > 2 && D > 1) {
        // the reflection: whatever is already above the water - sky, far
        // dunes, the palms, the reeds - flipped into it, rippled, darker
        if (!this._rcv || this._rcv.width < w || this._rcv.height < D) {
          this._rcv = makeCanvas(Math.max(w, this._rcv?.width || 0), Math.max(D, this._rcv?.height || 0));
        }
        const rg = this._rcv.getContext('2d');
        rg.clearRect(0, 0, this._rcv.width, this._rcv.height);
        rg.drawImage(ctx.canvas, sxa, Ssc - D, w, D, 0, 0, w, D);
        ctx.save();
        ctx.beginPath();
        for (let x = kit.xl; x <= kit.xr; x++) {
          const fy = GROUND.at(x);
          if (fy <= P.S) continue;
          const a = Math.round(gsx(cam, x)), b = Math.round(gsx(cam, x + 1));
          ctx.rect(a, Ssc, b - a, Math.round(gsy(cam, fy)) - Ssc);
        }
        ctx.clip();
        for (let j = 0; j < D; j++) {
          const f = j / D;
          const off = Math.round(Math.sin(this.t * 1.6 + j * 0.9 / Math.max(1, z * 0.5)) * (0.4 + f * 1.6) * Math.max(1, z * 0.6));
          ctx.globalAlpha = 0.5 * (1 - f) * (1 - f) + 0.05;
          ctx.drawImage(this._rcv, 0, D - 1 - j, w, 1, sxa + off, Ssc + j, w, 1);
        }
        // the water's own colour over the reflection
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#2a9a9a';
        ctx.fillRect(sxa, Ssc, w, D);
        ctx.globalAlpha = 1;
        // slow light bands across the surface
        const p = Math.max(1, Math.round(z));
        ctx.fillStyle = '#e4fbf6';
        for (let i = 0; i < 9; i++) {
          const ph = this.t * (0.25 + (i % 4) * 0.07) + i * 2.4;
          const gx = sxa + ((Math.sin(ph) * 0.5 + 0.5) * w) | 0;
          const gl = (3 + (i % 3) * 3) * p;
          ctx.globalAlpha = 0.35 + 0.3 * Math.sin(this.t * 2.2 + i * 1.7) ** 2;
          ctx.fillRect(gx - (gl >> 1), Ssc + p * (1 + (i % 3)), gl, p);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        // the surface line itself, broken by ripples
        for (let x = sxa; x < sxb; x += p) {
          const k = Math.sin(x * 0.21 / p + this.t * 1.3) + Math.sin(x * 0.07 / p - this.t * 0.7);
          ctx.fillStyle = k > 1.1 ? '#ffffff' : k > -0.6 ? '#bfeee8' : '#7cc9c4';
          ctx.fillRect(x, Ssc, p, p);
        }
        // sun glitter: a few hard white points that come and go
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const ph = this.t * 1.3 + i * 4.1;
          const k = Math.sin(ph);
          if (k < 0.75) continue;
          const gx = sxa + Math.floor(((Math.sin(i * 12.9 + Math.floor(ph / TAU) * 3.1) * 0.5 + 0.5) * w) / p) * p;
          ctx.fillRect(gx, Ssc + p, p, p);
          if (k > 0.92) { ctx.fillRect(gx - p, Ssc + p, p * 3, p); ctx.fillRect(gx, Ssc, p, p * 3); }
        }
      }
      // lily pads riding on it
      for (const L of kit.lilies) {
        const a = L.art();
        const bob = Math.sin(this.t * 1.1 + L.ph) * 0.4;
        this._blit(ctx, cam, a, L.x + Math.sin(this.t * 0.2 + L.ph) * 1.5, P.S + 1 + bob, 0, false, 0);
      }
      this._dragonfly(ctx, cam, lm, kit);
    }
  }

  /** One dragonfly, hunting over the water: darting, hovering, darting. */
  _dragonfly(ctx, cam, lm, kit) {
    const span = Math.max(20, kit.xr - kit.xl);
    const seg = Math.floor(this.t / 1.6 + lm.seed % 7);
    const f = (this.t / 1.6 + lm.seed % 7) - seg;
    const at = (k) => {
      const h1 = hash2i(k, 1, lm.seed), h2 = hash2i(k, 2, lm.seed);
      return { x: kit.xl + h1 * span, y: kit.S - 6 - h2 * 16 };
    };
    const a = at(seg), b = at(seg + 1);
    // most of each beat is a hover, then a quick dart to the next spot
    const m = f < 0.7 ? 0 : (f - 0.7) / 0.3;
    const e = m * m * (3 - 2 * m);
    const x = lerp(a.x, b.x, e) + Math.sin(this.t * 9) * 0.6, y = lerp(a.y, b.y, e) + Math.sin(this.t * 13) * 0.5;
    const p = Math.max(1, Math.round(cam.zoom));
    const sx = Math.round(gsx(cam, x) / p) * p, sy = Math.round(gsy(cam, y) / p) * p;
    const dir = b.x >= a.x ? 1 : -1;
    ctx.fillStyle = '#1f6f9a';
    ctx.fillRect(sx - 2 * p * dir, sy, p, p);
    ctx.fillRect(sx - p * dir, sy, p, p);
    ctx.fillRect(sx, sy, p, p);
    ctx.fillStyle = '#3fb6d8';
    ctx.fillRect(sx + p * dir, sy, p, p);
    // wings: a flicker of pale pixels
    ctx.globalAlpha = 0.55 + 0.4 * Math.abs(Math.sin(this.t * 40));
    ctx.fillStyle = '#e8f6ff';
    const up = (Math.floor(this.t * 30) & 1) ? 1 : 0;
    ctx.fillRect(sx - p, sy - p - up * p, p * 2, p);
    ctx.globalAlpha = 1;
  }

  /** Ground plants. Thin out on the pan, thick around water. */
  drawScatter(ctx, cam, layer) {
    const t = this.game.terrain;
    GROUND.frame(cam, t);
    const z = cam.zoom;
    const b = cam.bounds(60);
    const c0 = Math.floor(b.x0 / 512), c1 = Math.floor(b.x1 / 512);
    const sun = this._sun(), sdir = this.game.weather?.shadowDir || 1;
    const list = [];
    for (let ci = c0; ci <= c1; ci++) {
      for (const v of this.chunkScatter(ci)) {
        if (v.x < b.x0 || v.x > b.x1) continue;
        // big things go in front of the crab, small things behind it
        const near = v.size > 0.58;
        if ((near ? 'near' : 'far') !== layer) continue;
        const def = FLORA_BY_ID[v.id];
        if (!def) continue;
        const art = buildPlant(def, v.stage, v.variant, v.size);
        list.push([v, art, Math.max(2, def.w * v.size * art.g * 0.22)]);
        GROUND.shadow(ctx, cam, v.x, 3 + v.size * 6, 0.45 + v.size * 0.3, sun, sdir);
      }
    }
    ctx.save();
    GROUND.clipAbove(ctx, cam, 1);
    const wk = this.game.weather ? 0.4 + this.game.weather.windSpeed : 1;
    for (const [v, art, foot] of list) {
      const st = this._seat(v.x, { foot, bury: 3 }, true);
      const sway = Math.sin(this.t * 1.4 + v.x * 0.1) * 0.03 * wk;
      this._blit(ctx, cam, art, v.x, st.y, st.slope, v.flip, sway);
    }
    ctx.restore();
    const wind = this._wind().dir;
    for (const [v, , foot] of list) GROUND.drift(ctx, cam, v.x, foot + 2, 0.9 + v.size, wind, v.x | 0);
  }

  toJSON() { return { found: [...this.found], felled: [...this.felled.keys()] }; }
  fromJSON(d) {
    if (d && d.found) this.found = new Set(d.found);
    this.felled = new Map((d && d.felled ? d.felled : []).map((k) => [k, 1]));
  }
}

export { CELL as LANDMARK_CELL };
