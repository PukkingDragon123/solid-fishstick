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
//   SCRUB     dead bushes, thorn balls, driftwood snags, the bleached ribs of
//             something that did not make it. No collision, but they break
//             the horizon up and they catch the light.
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

const CELL = 128;               // one roll of the dice per this much desert
const MAX_BUMP = 26;            // the tallest a boulder can lift the ground

// ---------------------------------------------------------------------------
// what is where

const cache = new Map();
let cacheSeed = null;

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
  cache.set(ci, out);
  if (cache.size > 400) cache.clear();
  return out;
}

/**
 * How much the rock under this point lifts the ground.
 *
 * This is the whole reason boulders are worth having. `Terrain.baseY` adds it
 * in, so a boulder is part of the surface: the crab's feet find it, the sand
 * deforms on top of it, and you cannot walk through it because there is
 * nothing to walk through - the floor simply goes up.
 */
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

// ---------------------------------------------------------------------------
// cliffs
//
// A dune is a slope you do not notice. A cliff is a slope you have to decide
// about. Every so often the ground simply steps - a bench of rock the wind cut
// out of the strata - and going up it costs you: the animal rears, the legs
// reach higher, and it takes four times as long as the flat did.
//
// They are kept to a grade the animal can actually take. A wall you cannot
// climb is not a landscape feature, it is a locked door, and nothing out here
// should be locked.

const CLIFF_CELL = 1150;
const cliffCache = new Map();
let cliffSeed = null;

function cliffIn(seed, ci) {
  if (seed !== cliffSeed) { cliffSeed = seed; cliffCache.clear(); }
  let v = cliffCache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'cliff') ^ (ci * 1103515245)) >>> 0);
  const x = ci * CLIFF_CELL + CLIFF_CELL * (0.2 + r() * 0.6);
  const b = biomeAt(x);
  const stony = b.id === 'badlands' || b.id === 'ridge' || b.id === 'saltpan';
  v = (ci === 0 || r() > (stony ? 0.85 : 0.45)) ? null : {
    x,
    // up or down, because a world that only ever steps up is a staircase
    h: (26 + r() * 42) * (r() < 0.5 ? 1 : -1),
    run: 24 + r() * 18,
  };
  cliffCache.set(ci, v);
  if (cliffCache.size > 300) cliffCache.clear();
  return v;
}

/** The step in the ground here, if any. */
export function cliffOffset(seed, x) {
  const c = Math.floor(x / CLIFF_CELL);
  let d = 0;
  for (let ci = c - 1; ci <= c + 1; ci++) {
    const f = cliffIn(seed, ci);
    if (!f) continue;
    const u = (x - f.x) / f.run;
    if (u <= -1) continue;
    if (u >= 1) { d -= f.h; continue; }
    // smoothstep, so the top and the bottom of the face round off the way a
    // weathered bench does and there is no pixel-wide ledge to catch a foot
    const k = (u + 1) / 2;
    d -= f.h * k * k * (3 - 2 * k);
  }
  return d;
}

/** Where the nearest cliff face is, for anything that wants to avoid one. */
export function cliffNear(seed, x, radius = CLIFF_CELL) {
  const out = [];
  const c0 = Math.floor((x - radius) / CLIFF_CELL), c1 = Math.floor((x + radius) / CLIFF_CELL);
  for (let ci = c0; ci <= c1; ci++) {
    const f = cliffIn(seed, ci);
    if (f && Math.abs(f.x - x) <= radius) out.push(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
// what they look like

const art = new Map();

function bake(key, fn) {
  let v = art.get(key);
  if (!v) { v = fn(); art.set(key, v); if (art.size > 160) art.clear(); }
  return v;
}

/**
 * A lump of rock, cut to exactly the curve it raises the ground by, so its
 * back IS the surface you walk over. Anchored at the level of the sand round
 * it, which means the whole sprite is the part that is sticking out.
 */
function paintBoulder(p) {
  const r = mulberry32(p.seed);
  const top = p.h * 1.4;
  const W = Math.ceil(p.w * 2) + 2, H = Math.ceil(top) + 3;
  const pt = new Painter(W, H);
  const cx = W / 2, base = H - 1;
  const mat = p.red ? 'rockRed' : 'rock';
  // lumpiness, so no two are the same egg
  const wob = [r() * TAU, r() * TAU, r() * TAU];
  const beds = 1 + Math.floor(r() * 3);
  const bedY = [0, 1, 2].map(() => 0.25 + r() * 0.6);

  pt.field(0, 0, W - 1, H - 1, (x, y) => {
    const dx = (x - cx) / p.w;
    if (dx <= -1 || dx >= 1) return null;
    // the silhouette, with a little noise on it so the edge is not a formula
    const lip = domeAt(p, dx)
      * (1 + Math.sin(dx * 7 + wob[0]) * 0.05 + Math.sin(dx * 17 + wob[1]) * 0.03);
    const surf = base - lip;
    if (y < surf) return null;
    // the height field: a hemisphere, which is what makes it read as a
    // boulder rather than as a brown hill
    const u = clamp01((base - y) / Math.max(1, lip));
    const dome = Math.sqrt(Math.max(0, 1 - dx * dx)) * Math.sqrt(Math.max(0, 1 - (1 - u) ** 2));
    // bedding planes, running across it the way they do in the cliff it
    // broke off
    let tint = Math.sin(dx * 3.3 + wob[2]) * 0.05;
    for (let i = 0; i < beds; i++) {
      const d = Math.abs(u - bedY[i] - dx * 0.06);
      if (d < 0.045) tint -= 0.30 * (1 - d / 0.045);
    }
    return { h: 1.2 + dome * p.h * 0.9, tint };
  }, { mat });

  pt.grain(mat, { freq: 0.34, amp: 0.20, seed: p.seed & 1023 });
  pt.speckle(mat, { density: 0.05, amp: 0.5, seed: (p.seed >> 3) & 1023 });
  pt.smoothHeight(1, 0.3);
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#1a1210' });
  return { cv, ox: cx, oy: base, top };
}

/** A dead bush: a knot of thorn, no leaves left worth the name. */
function paintBush(p) {
  const r = mulberry32(p.seed);
  const s = p.s;
  const W = Math.ceil(26 * s) + 8, H = Math.ceil(22 * s) + 8;
  const pt = new Painter(W, H);
  const cx = W / 2, base = H - 3;
  const mat = r() < 0.4 ? 'leafDry' : 'wood';
  // a stub of trunk, and then everything else radiating off it
  pt.capsule(cx, base, cx + (r() - 0.5) * 2, base - 4 * s, 1.5 * s, 1.1 * s,
    { mat: 'wood', dome: 1.4, tint: -0.1 });
  const n = 9 + Math.floor(r() * 9);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.12 + r() * 0.76);
    const len = (5 + r() * 9) * s;
    const x1 = cx + Math.cos(a) * len, y1 = base - 3 * s + Math.sin(a) * len;
    pt.capsule(cx, base - 3 * s, x1, y1, 0.9 * s, 0.5 * s,
      { mat, dome: 0.9, tint: (r() - 0.5) * 0.3 });
    // and a second order of twig off the end of it, which is what makes a
    // dead bush read as dead rather than as a starfish
    if (r() < 0.6) {
      const a2 = a + (r() - 0.5) * 1.5;
      pt.capsule(x1, y1, x1 + Math.cos(a2) * len * 0.55, y1 + Math.sin(a2) * len * 0.55,
        0.6 * s, 0.4 * s, { mat, dome: 0.6, tint: -0.14 });
    }
  }
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#1b1410' });
  return { cv, ox: cx, oy: base };
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

/** Driftwood, kilometres from any water. */
function paintSnag(p) {
  const r = mulberry32(p.seed);
  const s = p.s;
  const W = Math.ceil(24 * s) + 8, H = Math.ceil(24 * s) + 8;
  const pt = new Painter(W, H);
  const cx = W / 2, base = H - 3;
  const lean = (r() - 0.5) * 1.1;
  const top = base - (14 + r() * 7) * s;
  pt.curve([[cx, base], [cx + lean * 5 * s, (base + top) / 2], [cx + lean * 11 * s, top]],
    2.1 * s, 1.0 * s, { mat: 'woodPale', dome: 2.0, tint: 0.04 });
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const y = lerp(base - 3 * s, top, 0.3 + r() * 0.6);
    const dir = r() < 0.5 ? -1 : 1;
    pt.capsule(cx + lean * 6 * s, y, cx + lean * 6 * s + dir * (5 + r() * 6) * s,
      y - (2 + r() * 5) * s, 1.1 * s, 0.6 * s,
      { mat: 'woodPale', dome: 1.1, tint: -0.12 });
  }
  const cv = pt.resolve(MATERIALS, { outline: 0.9, outlineColor: '#221a12' });
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

export function propArt(p) {
  if (p.kind === 'boulder') {
    return bake(`b${p.seed}:${Math.round(p.w)}:${Math.round(p.h)}:${p.red ? 1 : 0}`,
      () => paintBoulder(p));
  }
  const k = `${p.kind}${p.seed}:${Math.round(p.s * 8)}`;
  return bake(k, () => (p.kind === 'bush' ? paintBush(p)
    : p.kind === 'ribs' ? paintRibs(p) : paintSnag(p)));
}

export function weedArt(seed, s) {
  return bake(`w${seed}:${Math.round(s * 8)}`, () => paintWeed(seed, s));
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
