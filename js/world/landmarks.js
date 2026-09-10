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

const KINDS = ['oasis', 'oasis', 'ruin', 'bonefield', 'oasis', 'spire'];

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

function paintRuin(lm) {
  const r = mulberry32(lm.seed);
  const W = Math.round(lm.size * 1.1), H = Math.round(60 + r() * 50);
  const p = new Painter(W, H);
  const base = H - 2;
  const cols = 3 + Math.floor(r() * 4);
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1 || 1);
    const x = 8 + t * (W - 16);
    const h = (0.34 + r() * 0.62) * (H - 12);
    const w = 5 + r() * 7;
    p.poly([
      { x: x - w, y: base }, { x: x - w * 0.82, y: base - h },
      { x: x + w * 0.78, y: base - h * (0.72 + r() * 0.3) }, { x: x + w, y: base },
    ], { mat: 'rock', dome: w * 0.9, feather: 3, tint: (t - 0.5) * 0.08 });
    if (r() < 0.5) {
      p.rect(x - w * 1.3, base - h - 3, w * 2.6, 3.4, { mat: 'rock', dome: 2.4, tint: 0.08 });
    }
  }
  p.rect(4, base - 4, W - 8, 5, { mat: 'rock', dome: 3, tint: 0.06 });
  p.grain('rock', { freq: 0.22, amp: 0.26, seed: 3, height: 0.7 });
  p.speckle('rock', { density: 0.03, amp: 0.3, seed: 7 });
  // an inscription band nobody can read any more
  for (let i = 0; i < 10; i++) {
    p.rect(10 + i * (W - 24) / 10, base - 3, 3, 1.2, { mat: 'rock', mask: true, tint: -0.4, dome: -1 });
  }
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

const artCache = new Map();
function landmarkArt(lm) {
  let a = artCache.get(lm.id);
  if (a) return a;
  a = lm.kind === 'ruin' ? paintRuin(lm)
    : lm.kind === 'bonefield' ? paintBones(lm)
      : lm.kind === 'spire' ? paintSpire(lm) : null;
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
