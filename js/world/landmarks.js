// CRABDEN - the places worth walking to.
//
// The desert is not scenery you cross to get to gameplay; crossing it is the
// game. So the world has real destinations in it - oases sunk into the ground
// with water actually standing in them, ruins that were built by people who
// thought the water would come back, and bone fields where a herd died on the
// way to one. They are generated from the world seed, which means the oasis
// you found yesterday is exactly where you left it.

import { clamp, clamp01, lerp, smoothstep, mulberry32, hashStr, TAU } from '../lib/math.js';
import { Painter, makeCanvas } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { buildPlant } from '../art/floraart.js';
import { FLORA_BY_ID } from '../data/flora.js';
import { biomeAt } from './biomes.js';

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

/** The landmark that owns this stretch, or null. */
export function landmarkAt(seed, ci) {
  if (seed !== cacheSeed) { cacheSeed = seed; cache = new Map(); }
  let v = cache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'lm') ^ (ci * 2654435761)) >>> 0);
  if (ci === 0) { cache.set(ci, null); return null; }
  const kind = KINDS[Math.floor(r() * KINDS.length)];
  const x = ci * CELL + CELL * (0.22 + r() * 0.56);
  const size = kind === 'oasis' ? 90 + r() * 110 : 60 + r() * 60;
  v = {
    id: 'lm' + ci, ci, kind, x, size,
    depth: kind === 'oasis' ? 16 + r() * 22 : 0,
    name: `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`,
    seed: (hashStr(String(seed)) ^ (ci * 40503)) >>> 0,
    biome: biomeAt(x).id,
  };
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

/**
 * How much the ground drops here because of a landmark. The terrain bakes this
 * in, so an oasis is a real bowl you walk down into rather than a decal.
 */
export function groundOffset(seed, x) {
  // only the cell you are in and its neighbours can reach this far
  const c = Math.floor(x / CELL);
  let d = 0;
  for (let ci = c - 1; ci <= c + 1; ci++) {
    const lm = landmarkAt(seed, ci);
    if (!lm || !lm.depth) continue;
    const dx = x - lm.x;
    if (dx < -lm.size || dx > lm.size) continue;
    const k = 1 - Math.abs(dx) / lm.size;
    const sk = k * k * (3 - 2 * k);
    d += lm.depth * sk * sk;
  }
  return d;
}

/** Water surface height for an oasis, or null if this is not in one. */
export function poolAt(seed, x, terrain) {
  for (const lm of landmarksNear(seed, x, CELL)) {
    if (lm.kind !== 'oasis') continue;
    if (Math.abs(x - lm.x) > lm.size) continue;
    if (lm.surface === undefined) {
      lm.surface = terrain.baseY(lm.x) - lm.depth * 0.42;
    }
    if (terrain.baseY(x) > lm.surface) return { lm, y: lm.surface };
  }
  return null;
}

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
    let wet = 0;
    for (const lm of landmarksNear(seed, x, CELL)) {
      if (lm.kind !== 'oasis') continue;
      wet = Math.max(wet, clamp01(1.35 - Math.abs(x - lm.x) / lm.size));
    }
    const b = biomeAt(x);
    const chance = 0.06 + wet * 0.85;
    if (r() > chance) continue;
    const list = b.plants || ['dustmoss'];
    // right at the water it is lush, but a bank is mostly low cover with the
    // occasional tall thing, not a wall of reeds
    const wetMix = ['dustmoss', 'dustmoss', 'saltgrass', 'saltgrass', 'bluefern',
      'pipereed', list[Math.floor(r() * list.length)]];
    const id = wet > 0.5
      ? wetMix[Math.floor(r() * wetMix.length)]
      : (r() < 0.68 ? 'saltgrass' : 'dustmoss');
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
    const cx = this.game.crab.x;
    for (const lm of landmarksNear(this.seed, cx, 260)) {
      if (this.found.has(lm.id)) continue;
      if (Math.abs(lm.x - cx) > lm.size * 0.9) continue;
      this.found.add(lm.id);
      this.game.onLandmark?.(lm);
    }
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

  /** Big props: drawn behind the ground vegetation. */
  drawProps(ctx, cam) {
    const t = this.game.terrain;
    for (const lm of landmarksNear(this.seed, cam.rx, cam.vw / cam.zoom + CELL * 0.5)) {
      const art = landmarkArt(lm);
      if (!art) continue;
      const gy = t.surfaceY(lm.x);
      const s = cam.worldToScreen(lm.x, gy);
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(cam.zoom, cam.zoom);
      ctx.drawImage(art.cv, -art.w / 2, -art.h);
      ctx.restore();
    }
  }

  /** Standing water sunk into the ground, with a lip of wet sand. */
  drawWater(ctx, cam) {
    const t = this.game.terrain;
    const z = cam.zoom;
    const b = cam.bounds(80);
    for (const lm of landmarksNear(this.seed, cam.rx, cam.vw / cam.zoom + 400)) {
      if (lm.kind !== 'oasis') continue;
      if (lm.surface === undefined) lm.surface = t.baseY(lm.x) - lm.depth * 0.42;
      const x0 = Math.max(b.x0, lm.x - lm.size), x1 = Math.min(b.x1, lm.x + lm.size);
      if (x1 <= x0) continue;
      const step = Math.max(1, Math.round(2 / z));
      // the pool is every contiguous run of ground that sits below the
      // waterline, each closed on its own, or the fill leaks between them
      const runs = [];
      let cur = null;
      for (let x = x0; x <= x1; x += step) {
        const gy = t.baseY(x);
        if (gy > lm.surface) {
          if (!cur) { cur = []; runs.push(cur); }
          cur.push({ x, gy });
        } else cur = null;
      }
      ctx.beginPath();
      for (const run of runs) {
        if (run.length < 2) continue;
        const first = cam.worldToScreen(run[0].x, lm.surface);
        ctx.moveTo(first.x, first.y);
        for (const q of run) {
          const s2 = cam.worldToScreen(q.x, q.gy);
          ctx.lineTo(s2.x, s2.y);
        }
        const last = cam.worldToScreen(run[run.length - 1].x, lm.surface);
        ctx.lineTo(last.x, last.y);
        ctx.closePath();
      }
      const sy = cam.worldToScreen(lm.x, lm.surface).y;
      const by = cam.worldToScreen(lm.x, t.baseY(lm.x)).y;
      const grad = ctx.createLinearGradient(0, sy, 0, Math.max(by, sy + 4));
      grad.addColorStop(0, '#7fd0dd');
      grad.addColorStop(0.35, '#2b8ea3');
      grad.addColorStop(1, '#0d3542');
      ctx.fillStyle = grad;
      ctx.fill();

      // surface: a bright lip and slow glints, plus a smeared sky reflection
      ctx.save();
      ctx.clip();
      const sxa = cam.worldToScreen(x0, 0).x, sxb = cam.worldToScreen(x1, 0).x;
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#cfe8f2';
      ctx.fillRect(sxa, sy, sxb - sxa, Math.max(2, 8 * z));
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#d6f2f8';
      ctx.fillRect(sxa, Math.round(sy), sxb - sxa, Math.max(1, Math.round(z)));
      for (let i = 0; i < 14; i++) {
        const ph = this.t * (0.35 + i * 0.07) + i * 1.9;
        const gx = lerp(sxa, sxb, (Math.sin(ph) * 0.5 + 0.5));
        ctx.globalAlpha = 0.45 - (i % 3) * 0.12;
        ctx.fillStyle = '#eafbfd';
        ctx.fillRect(Math.round(gx - 3 * z), Math.round(sy + (1 + (i % 4)) * z),
          Math.round((5 + (i % 3) * 4) * z), Math.max(1, Math.round(z)));
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /** Ground plants. Thin out on the pan, thick around water. */
  drawScatter(ctx, cam, layer) {
    const t = this.game.terrain;
    const z = cam.zoom;
    const b = cam.bounds(60);
    const c0 = Math.floor(b.x0 / 512), c1 = Math.floor(b.x1 / 512);
    for (let ci = c0; ci <= c1; ci++) {
      for (const v of this.chunkScatter(ci)) {
        if (v.x < b.x0 || v.x > b.x1) continue;
        // big things go behind the crab, small things in front of it
        const near = v.size > 0.58;
        if ((near ? 'near' : 'far') !== layer) continue;
        const def = FLORA_BY_ID[v.id];
        if (!def) continue;
        const art = buildPlant(def, v.stage, v.variant, v.size);
        const gy = t.surfaceY(v.x);
        const s = cam.worldToScreen(v.x, gy);
        ctx.save();
        ctx.translate(Math.round(s.x), Math.round(s.y));
        ctx.scale(z, z);
        const sway = Math.sin(this.t * 1.4 + v.x * 0.1) * 0.03
          * (this.game.weather ? 0.4 + this.game.weather.windSpeed : 1);
        ctx.rotate(sway);
        if (v.flip) ctx.scale(-1, 1);
        ctx.globalAlpha = v.shade;
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  toJSON() { return { found: [...this.found] }; }
  fromJSON(d) { if (d && d.found) this.found = new Set(d.found); }
}

export { CELL as LANDMARK_CELL };
