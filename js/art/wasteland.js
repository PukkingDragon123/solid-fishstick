// CRABDEN - the wasteland, painted in strips.
//
// The backdrop is eight depths of country, each one a long strip of pixel art
// painted a tile at a time as the camera comes up on it, and kept. A tile is
// not a row of sprites: every rock, ruin and dune in it is a function of
// where it is along the strip, so features run across tile edges without a
// seam, overlap each other, and never repeat.
//
// What is in each strip depends on which biome is *behind* you at that depth.
// A point on the far range sits a long way off to one side, so the further a
// strip is, the more of the world it shows at once: the megacity on the
// horizon stands in the rust, and you can see it from the dunes.
//
// Painting is fast because the inner loops do no noise: everything that
// varies along a row or down a column is worked out once per row or column.

import { clamp, clamp01, lerp, hexToRgb } from '../lib/math.js';
import { Painter, makeCanvas, fbmTex, hash2i } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { biomeAt, biomeMix } from '../world/biomes.js';

export const TILE_W = 256;
const M = 10;              // painted margin either side, so normals match at the seams

export const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
].map((r) => r.map((v) => (v + 0.5) / 64));

/**
 * The depths, far to near. `s` is how many screen pixels one world pixel of
 * camera travel moves the strip at the reference zoom - one over it is how
 * far off the strip is. `th` is a tile's height and `base` the row its ground
 * line sits on. `fog` is how much of the air colour the strip takes on and
 * `cool` how much of that air is sky rather than dust: aerial perspective.
 */
export const DEPTHS = [
  { id: 'skyline', s: 0.026, th: 66, base: 58, fog: 0.88, cool: 0.72, dune: 1.2, lam: 140, cell: 96, dither: 0.4 },
  { id: 'range', s: 0.05, th: 76, base: 66, fog: 0.78, cool: 0.62, dune: 2, lam: 120, cell: 110, dither: 0.45 },
  { id: 'buttes', s: 0.09, th: 96, base: 84, fog: 0.66, cool: 0.46, dune: 4, lam: 110, cell: 100, dither: 0.5 },
  { id: 'mesas', s: 0.155, th: 120, base: 104, fog: 0.53, cool: 0.28, dune: 8, lam: 150, cell: 150, dither: 0.55 },
  { id: 'wrecks', s: 0.27, th: 112, base: 88, fog: 0.4, cool: 0.12, dune: 15, lam: 190, cell: 170, dither: 0.6 },
  { id: 'ridge', s: 0.46, th: 112, base: 74, fog: 0.27, cool: 0.03, dune: 28, lam: 250, cell: 130, dither: 0.65 },
  { id: 'dunes', s: 0.72, th: 100, base: 56, fog: 0.15, cool: 0, dune: 30, lam: 340, cell: 190, dither: 0.7 },
  { id: 'foot', s: 1.05, th: 84, base: 40, fog: 0.06, cool: 0, dune: 26, lam: 420, cell: 230, dither: 0.7 },
];
export const DEPTH = Object.fromEntries(DEPTHS.map((d, i) => [d.id, Object.assign(d, { index: i })]));

// what each biome's country is made of
const STYLE = {
  theshallows: { rock: 'wlSalt', sand: 'wlDunePale', calm: true },
  saltpan: { rock: 'wlSalt', sand: 'wlSaltCrust', flat: true },
  bonereef: { rock: 'bone', sand: 'wlDune' },
  dunes: { rock: 'wlMesaRed', sand: 'wlDune' },
  glassflats: { rock: 'wlMesaGrey', sand: 'wlDunePale' },
  rustlands: { rock: 'wlMesaRed', sand: 'wlDune' },
  ashwood: { rock: 'wlMesaAsh', sand: 'wlAshSand' },
  deepwell: { rock: 'wlMesaDeep', sand: 'rock' },
};
export function styleOf(b) { return STYLE[b.id] || STYLE.dunes; }

/** The biome a point on a strip belongs to: the one that far out to the side. */
export function biomeOnStrip(d, u) { return biomeAt(u / d.s); }

// ---------------------------------------------------------------------------
// the ground line of each strip

/** A dune profile: long windward back, sharp crest, steep slip face. */
function dune(u, lam, seed) {
  const warp = fbmTex(u / lam * 0.31, 1.7, seed, 2) * 1.4;
  const t = u / lam + warp;
  const i = Math.floor(t), f = t - i;
  const amp = 0.3 + hash2i(i, 3, seed) * 0.7;
  const peak = 0.68 + (hash2i(i, 5, seed) - 0.5) * 0.12;
  let y;
  if (f < peak) { const s = f / peak; y = (3 * s * s - s * s * s) / 2; } else { const s = (f - peak) / (1 - peak); y = Math.pow(1 - s, 1.7); }
  return y * amp;
}

/** Height of a strip's ground above its base line at u, in strip pixels. */
export function groundTop(d, u) {
  const st = styleOf(biomeOnStrip(d, u));
  const flat = st.flat || st.calm ? 0.35 : 1;
  const big = dune(u, d.lam, 7 + d.index * 31) * d.dune;
  const small = (fbmTex(u * 0.045, 3.3, 11 + d.index, 2) - 0.5) * Math.min(3, d.dune * 0.2);
  return Math.max(0, (big + small + d.dune * 0.12) * flat);
}

// ---------------------------------------------------------------------------
// features: what stands on each strip, cell by cell

const KINDS = {
  skyline: {
    saltpan: { table: 3, spire: 1 }, theshallows: { table: 1 }, bonereef: { table: 3, spire: 2 },
    dunes: { table: 4, butte: 1 }, glassflats: { table: 3, spire: 2 }, rustlands: { table: 1, towers: 6 },
    ashwood: { table: 3, butte: 1 }, deepwell: { table: 2, spire: 3 },
  },
  range: {
    saltpan: { mesa: 1 }, theshallows: {}, bonereef: { mesa: 2, butte: 1 },
    dunes: { mesa: 3, butte: 2 }, glassflats: { mesa: 2, butte: 2 }, rustlands: { mesa: 2, towers: 2 },
    ashwood: { mesa: 2, butte: 2 }, deepwell: { butte: 3, spire: 2 },
  },
  buttes: {
    saltpan: { butte: 1, hoodoo: 1, ribs: 1 }, theshallows: { hoodoo: 1 }, bonereef: { hoodoo: 3, arch: 2, butte: 1 },
    dunes: { butte: 4, hoodoo: 2, arch: 1, mesa: 2 }, glassflats: { butte: 2, shard: 3, mesa: 1 },
    rustlands: { butte: 2, tower: 3, mesa: 1 }, ashwood: { butte: 3, hoodoo: 2 }, deepwell: { butte: 3, hoodoo: 2 },
  },
  mesas: {
    saltpan: { mesa: 2, ribs: 1 }, theshallows: {}, bonereef: { arch: 2, mesa: 1, hoodoo: 2 },
    dunes: { mesa: 4, arch: 2, butte: 2, hoodoo: 1 }, glassflats: { mesa: 3, shard: 2, pylon: 2 },
    rustlands: { mesa: 2, tower: 3, pylon: 2 }, ashwood: { mesa: 3, butte: 2 }, deepwell: { mesa: 2, butte: 3 },
  },
  wrecks: {
    saltpan: { hull: 2, ribs: 3 }, theshallows: { ribs: 1 }, bonereef: { ribs: 3, hoodoo: 2 },
    dunes: { ribs: 2, colossus: 2, hoodoo: 2, pipe: 1 }, glassflats: { shard: 3, colossus: 1, pipe: 2 },
    rustlands: { hull: 3, colossus: 2, pipe: 2 }, ashwood: { snag: 4, hoodoo: 1 }, deepwell: { hoodoo: 3, colossus: 1 },
  },
  ridge: {
    saltpan: { rocks: 2, ribs: 1, post: 1 }, theshallows: { rocks: 1 }, bonereef: { rocks: 2, ribs: 2 },
    dunes: { tree: 3, rocks: 3, post: 1 }, glassflats: { rocks: 3, shard: 2 },
    rustlands: { tree: 2, rocks: 2, car: 2, post: 2 }, ashwood: { snag: 5, rocks: 2 }, deepwell: { rocks: 4 },
  },
  dunes: {
    saltpan: { rocks: 1, skull: 1 }, theshallows: {}, bonereef: { rocks: 2, ribs: 1 },
    dunes: { rocks: 2, tree: 1, skull: 1 }, glassflats: { rocks: 2, shard: 1 },
    rustlands: { rocks: 1, post: 1, car: 1 }, ashwood: { snag: 2, rocks: 1 }, deepwell: { rocks: 2 },
  },
  foot: {
    saltpan: { rocks: 1 }, theshallows: {}, bonereef: { rocks: 1 },
    dunes: { rocks: 2, skull: 1 }, glassflats: { rocks: 1 },
    rustlands: { rocks: 1, car: 1 }, ashwood: { snag: 1, rocks: 1 }, deepwell: { rocks: 1 },
  },
};

// how likely a cell is to have anything in it at all
const FILL = { skyline: 0.75, range: 0.5, buttes: 0.6, mesas: 0.5, wrecks: 0.5, ridge: 0.55, dunes: 0.32, foot: 0.22 };
// how far a feature can reach out of its cell, so a tile knows which to ask
const REACH = 300;

function pickKind(weights, r) {
  let tot = 0;
  for (const k in weights) tot += weights[k];
  if (tot <= 0) return null;
  let x = r * tot;
  for (const k in weights) { x -= weights[k]; if (x <= 0) return k; }
  return null;
}

const featCache = new Map();

/** The feature in a cell of a strip, or null. Deterministic. */
export function featureIn(d, c, seed) {
  const key = seed + ':' + d.id + ':' + c;
  if (featCache.has(key)) return featCache.get(key);
  const r = (k) => hash2i(c, k + d.index * 101, seed);
  let f = null;
  const u = (c + 0.15 + r(1) * 0.7) * d.cell;
  const b = biomeOnStrip(d, u);
  const fill = FILL[d.id] * (b.id === 'theshallows' ? 0.3 : 1);
  if (r(2) < fill) {
    const kind = pickKind(KINDS[d.id][b.id] || {}, r(3));
    if (kind) f = makeFeature(d, kind, u, b, r, (seed ^ Math.imul(c, 0x9e3779b1) ^ (d.index * 7777)) >>> 0);
  }
  featCache.set(key, f);
  if (featCache.size > 4000) featCache.clear();
  return f;
}

/** Sizes are per depth, so a butte two strips back is a smaller butte. */
const SCALE = { skyline: 0.34, range: 0.5, buttes: 0.72, mesas: 0.86, wrecks: 1.0, ridge: 1.0, dunes: 1.3, foot: 1.6 };

function makeFeature(d, kind, u, b, r, seed) {
  const st = styleOf(b);
  const k = SCALE[d.id];
  const f = { kind, u, seed, mat: st.rock, sand: st.sand, biome: b.id, z: 0 };
  switch (kind) {
    case 'table': f.w = 50 + r(10) * 110; f.h = 6 + r(11) * 12; f.z = 0; break;
    case 'mesa': f.w = (90 + r(10) * 130) * k; f.h = (34 + r(11) * 46) * k; f.z = 0; break;
    case 'butte': f.w = (34 + r(10) * 40) * k; f.h = (44 + r(11) * 44) * k; f.z = 1; break;
    case 'spire': f.w = (8 + r(10) * 8) * k * 1.6; f.h = (30 + r(11) * 34) * k * 1.4; f.z = 2; break;
    case 'hoodoo': f.w = (24 + r(10) * 30) * k; f.h = (34 + r(11) * 34) * k; f.z = 3; break;
    case 'arch': f.w = (80 + r(10) * 60) * k; f.h = (38 + r(11) * 30) * k; f.z = 1; break;
    case 'towers': f.w = 46 + r(10) * 64; f.h = 20 + r(11) * 26; f.z = 2; f.mat = 'wlConcrete'; break;
    case 'tower': f.w = (12 + r(10) * 12) * k; f.h = (50 + r(11) * 44) * k; f.z = 2; f.mat = 'wlConcrete'; break;
    case 'pylon': f.w = 230 + r(10) * 150; f.h = 36 + r(11) * 14; f.z = 4; f.mat = 'metal'; break;
    case 'shard': f.w = (22 + r(10) * 24) * k; f.h = (24 + r(11) * 34) * k; f.z = 3; f.mat = 'glass'; break;
    case 'hull': f.w = 120 + r(10) * 70; f.h = 30 + r(11) * 16; f.z = 2; f.mat = 'wlRust'; break;
    case 'colossus': f.w = 60 + r(10) * 30; f.h = 40 + r(11) * 14; f.z = 2; f.mat = b.id === 'rustlands' || b.id === 'glassflats' ? 'wlRust' : 'wlConcrete'; break;
    case 'ribs': f.w = (70 + r(10) * 60) * k; f.h = (28 + r(11) * 22) * k; f.z = 3; f.mat = 'bone'; break;
    case 'pipe': f.w = 240 + r(10) * 180; f.h = 10 + r(11) * 8; f.z = 1; f.mat = 'wlRust'; break;
    case 'tree': f.w = 26 + r(10) * 22; f.h = (26 + r(11) * 22) * (k > 1 ? 1.2 : 1); f.z = 5; f.mat = 'wlDeadwood'; break;
    case 'snag': f.w = 18 + r(10) * 18; f.h = (22 + r(11) * 26) * (k > 1 ? 1.2 : 1); f.z = 5; f.mat = 'wlCharcoal'; break;
    case 'rocks': f.w = (20 + r(10) * 26) * k; f.h = (6 + r(11) * 8) * k; f.z = 4; break;
    case 'post': f.w = 60 + r(10) * 60; f.h = 10 + r(11) * 6; f.z = 4; f.mat = 'wlDeadwood'; break;
    case 'car': f.w = (30 + r(10) * 10) * k; f.h = (12 + r(11) * 4) * k; f.z = 4; f.mat = 'wlRust'; break;
    case 'skull': f.w = 16 * k; f.h = 9 * k; f.z = 4; f.mat = 'bone'; break;
    default: return null;
  }
  f.flip = r(20) < 0.5;
  return f;
}

// ---------------------------------------------------------------------------
// the raster: direct writes into a painter's fields

const rr = (s, k) => hash2i(k, 17, s);

function setPx(p, x, y, m, h, tint) {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const i = y * p.w + x;
  p.mat[i] = m; p.hgt[i] = h; p.tint[i] = tint; p.cov[i] = 1;
}

/** One-pixel line into the painter. */
function pline(p, x0, y0, x1, y1, mat, h = 1, tint = 0) {
  const m = p._mid(mat);
  let x = Math.round(x0), y = Math.round(y0);
  const xe = Math.round(x1), ye = Math.round(y1);
  const dx = Math.abs(xe - x), dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1, sy = y < ye ? 1 : -1;
  let err = dx + dy;
  for (let g = 0; g < 4096; g++) {
    setPx(p, x, y, m, h, tint);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/** The bed pattern every cliff shares, so strata line up along a range. */
function beds(y, s) {
  const a = Math.sin(y * 0.55 + Math.sin(y * 0.13 + s) * 1.4);
  const b = Math.sin(y * 0.21 + s * 1.7);
  return a * 0.5 + b * 0.5;
}

function box(p, x0, y0, x1, y1) {
  return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(p.w - 1, Math.ceil(x1)), Math.min(p.h - 1, Math.ceil(y1))];
}

/**
 * A cliff of layered rock: mesa, butte, tableland. A talus skirt, a near-
 * vertical wall with a rough edge, a flat top under a cap rock; sometimes a
 * second tier set back on top. Lit by its height field - rounded hard at the
 * edges so the sunny side turns to the light - with gullies down the face
 * and a couple of harder beds standing proud of it.
 */
function paintCliff(p, f, cx, gy, o = {}) {
  const s = f.seed;
  const W = f.w, Hh = f.h;
  const talusK = o.talus ?? (0.22 + rr(s, 1) * 0.14);
  const cliffHW = W * 0.5 * (o.cliff ?? (0.64 + rr(s, 2) * 0.12));
  const baseHW = W * 0.5;
  const tier = o.tier ?? (rr(s, 3) < 0.45);
  const tierY = 0.6 + rr(s, 4) * 0.18;
  const tierHW = cliffHW * (0.42 + rr(s, 5) * 0.3);
  const tierOff = (rr(s, 6) - 0.5) * (cliffHW - tierHW) * 1.4;
  const notchX = cx + (rr(s, 7) - 0.5) * cliffHW * 1.2;
  const notchW = 2 + rr(s, 8) * W * 0.06;
  const notchD = rr(s, 9) < 0.6 ? 2 + rr(s, 10) * Hh * 0.22 : 0;
  const lean = (rr(s, 11) - 0.5) * 0.14;
  const capH = Math.max(1.5, Math.min(4.5, Hh * 0.065));
  const bedS = (s & 255) * 0.1;
  const gsc = clamp(W / 120, 0.45, 1.4);
  const ledgeA = 0.25 + rr(s, 12) * 0.3, ledgeB = 0.5 + rr(s, 13) * 0.3;
  const dome = 5 + W * 0.05;
  const top0 = gy - Hh;
  const m = p._mid(f.mat);
  const [x0, y0, x1, y1] = box(p, cx - baseHW - 4, top0 - 4, cx + baseHW + 4, gy + 3);
  if (x1 < x0 || y1 < y0) return;
  const R = y1 - y0 + 1, C = x1 - x0 + 1;
  const hwRow = new Float32Array(R), rL = new Float32Array(R), rR = new Float32Array(R), rT = new Float32Array(R), bedRow = new Float32Array(R);
  for (let j = 0; j < R; j++) {
    const y = y0 + j + 0.5;
    const yr = (gy - y) / Hh;
    const amp = 1.6 + Hh * 0.035;
    rL[j] = (fbmTex(y * 0.23, 3, s, 2) - 0.5) * amp * 1.4 + (hash2i(j + y0, 1, s) - 0.5) * 0.9;
    rR[j] = (fbmTex(y * 0.23, 9, s, 2) - 0.5) * amp * 1.4 + (hash2i(j + y0, 2, s) - 0.5) * 0.9;
    rT[j] = (fbmTex(y * 0.3, 2, s + 5, 1) - 0.5) * 2;
    hwRow[j] = yr < talusK ? lerp(baseHW, cliffHW, Math.sqrt(Math.max(0, yr) / talusK)) : cliffHW * (1 - (yr - talusK) * 0.08);
    bedRow[j] = beds((gy - y) * (1.1 / gsc), bedS);
  }
  const topCol = new Float32Array(C), tierTop = new Float32Array(C), gulCol = new Float32Array(C), ledCol = new Float32Array(C);
  const butCol = new Float32Array(C), varCol = new Float32Array(C);
  const bPer = Math.max(7, W * (0.16 + rr(s, 14) * 0.1)), bPh = rr(s, 15) * 6.28;
  for (let i = 0; i < C; i++) {
    const x = x0 + i + 0.5;
    let t = top0 + (fbmTex(x * 0.07, 5, s + 1, 2) - 0.5) * 2.4;
    if (notchD && Math.abs(x - notchX) < notchW) t += Math.cos((x - notchX) / notchW * Math.PI / 2) * notchD;
    topCol[i] = t;
    tierTop[i] = gy - Hh * tierY + (fbmTex(x * 0.09, 6, s + 2, 2) - 0.5) * 2;
    const gl = fbmTex(x * 0.21 / gsc, 0.5, s + 7, 3);
    gulCol[i] = Math.pow(clamp01(1 - Math.abs(gl - 0.5) * 3.4), 2);
    ledCol[i] = fbmTex(x * 0.05, 1, s + 9, 1) * 3;
    // buttresses: the wall stands out in broad columns between the gullies,
    // so it takes the light in vertical facets
    butCol[i] = Math.sin((x - cx) * 6.283 / bPer + bPh + fbmTex(x * 0.04, 4, s + 11, 1) * 2) * (1.6 + W * 0.012);
    // desert varnish: dark streaks run down from the cap where water once did
    const vn = fbmTex(x * 0.33, 7.5, s + 13, 2);
    varCol[i] = vn > 0.64 ? (vn - 0.64) * 1.2 : 0;
  }
  for (let j = 0; j < R; j++) {
    const yy = y0 + j, y = yy + 0.5;
    const yr = (gy - y) / Hh;
    const up = gy - y;
    const c = cx + lean * up;
    const talus = yr < talusK;
    const tk = talus ? Math.max(0, yr) / talusK : 1;
    for (let i = 0; i < C; i++) {
      const x = x0 + i + 0.5;
      if (y < topCol[i]) continue;
      const left = x < c;
      const hw = hwRow[j] + (left ? rL[j] : rR[j]) * (talus ? 0.5 * tk : 1);
      const dx = x - c;
      const adx = dx < 0 ? -dx : dx;
      if (adx > hw) continue;
      if (tier && y < tierTop[i]) {
        const tdx = x - (c + tierOff);
        if ((tdx < 0 ? -tdx : tdx) > tierHW + rT[j]) continue;
      }
      // which top this pixel hangs under
      const inUpper = tier && y < tierTop[i] + 0.01;
      const topHere = tier && !inUpper && topCol[i] < tierTop[i] ? tierTop[i] : topCol[i];
      const depthTop = y - topHere;
      const q = adx / Math.max(1, hw);
      let h = Math.sqrt(Math.max(0, 1 - q * q * q)) * dome + (talus ? butCol[i] * 0.3 : butCol[i]);
      let tint = 0;
      const ch = gulCol[i];
      h -= ch * (talus ? 0.8 : 1.7);
      tint -= ch * 0.045;
      if (!talus && varCol[i] > 0) tint -= varCol[i] * clamp01(1.2 - (depthTop / (Hh * 0.7)));
      // beds: colour bands, subtle; two hard ones stand out as ledges
      tint += bedRow[j] * 0.05;
      const lp = yr + ledCol[i] * 0.004;
      if (!talus && (Math.abs(lp - ledgeA) < 0.012 || Math.abs(lp - ledgeB) < 0.012)) { h += 1.6; tint += 0.08; }
      else if (!talus && (Math.abs(lp - ledgeA + 0.026) < 0.012 || Math.abs(lp - ledgeB + 0.026) < 0.012)) tint -= 0.12;
      // the cap: a harder bed on top, proud of the face, shadowed under
      if (depthTop < capH) { h += 2.4; tint += 0.12; } else if (depthTop < capH + 1.3) tint -= 0.2;
      // the talus: rubble at its angle of rest, lit from above
      if (talus) {
        const tt = 1 - tk;
        h += tt * 5;
        tint += 0.05 + (hash2i(x | 0, yy, s) - 0.5) * 0.14 * tt;
      }
      // the foot is in its own shade
      const foot = clamp01(1 - yr * 1.6);
      tint -= foot * foot * 0.12;
      const k = yy * p.w + (x0 + i);
      p.mat[k] = m; p.hgt[k] = h; p.tint[k] = tint; p.cov[k] = 1;
    }
  }
  // a few boulders broken off the cap, lying in the talus
  const nb = Math.floor(W / 34);
  for (let i = 0; i < nb; i++) {
    const bx = cx + (rr(s, 40 + i) - 0.5) * W * 0.95;
    const br = 0.8 + rr(s, 60 + i) * Math.max(1, Hh * 0.035);
    p.ellipse(bx, gy - br * 0.4 - rr(s, 80 + i) * 2, br * 1.25, br, { mat: f.mat, dome: br * 2, tint: 0.03 });
  }
}

/** A thin rock column; a hoodoo is one with a harder stone balanced on top. */
function paintSpire(p, cx, gy, w, h, mat, s, o = {}) {
  const cap = o.cap ?? true;
  const bulge = o.bulge ?? 0.22;
  const ph = rr(s, 1) * 6;
  const lean = (rr(s, 2) - 0.5) * 0.12;
  const m = p._mid(mat);
  const [x0, y0, x1, y1] = box(p, cx - w - 2, gy - h - 3, cx + w + 2, gy + 2);
  for (let yy = y0; yy <= y1; yy++) {
    const y = yy + 0.5;
    const yr = (gy - y) / h;
    if (yr < -0.05 || yr > 1) continue;
    let hw = w * 0.5 * (1 - yr * 0.45) * (1 + Math.sin(yr * 11 + ph) * bulge);
    hw += Math.pow(clamp01(1 - yr * 5), 2) * w * 0.35;
    const c = cx + lean * (gy - y);
    let capped = false;
    if (cap && yr > 0.84) { hw = w * 0.56 * (1 - (yr - 0.84) * 1.8); capped = true; }
    hw = Math.max(0.6, hw);
    let tint0 = beds((gy - y) * 1.3, s * 0.01) * 0.06;
    if (capped) tint0 += 0.1;
    if (cap && yr > 0.8 && yr <= 0.84) tint0 -= 0.2;
    tint0 -= Math.pow(clamp01(1 - yr * 3), 2) * 0.1;
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - c;
      const q = Math.abs(dx) / hw;
      if (q > 1) continue;
      setPx(p, xx, yy, m, Math.sqrt(Math.max(0, 1 - q * q)) * Math.max(2, hw * 1.3), tint0);
    }
  }
}

/**
 * An arch: a fin of rock, flat on top and square at the ends, with an opening
 * worn up through it from the ground. The span over the opening is never
 * thinner than a third of the fin, and the underside of it is in shadow.
 */
function paintArch(p, f, cx, gy) {
  const s = f.seed;
  const W = f.w, Hh = f.h;
  const hw = W * (0.17 + rr(s, 1) * 0.08);
  const hh = Hh * (0.48 + rr(s, 2) * 0.14);
  const hx = cx + (rr(s, 3) - 0.5) * W * 0.16;
  const heavyL = rr(s, 4) < 0.5;
  const m = p._mid(f.mat);
  const [x0, y0, x1, y1] = box(p, cx - W / 2 - 2, gy - Hh - 3, cx + W / 2 + 2, gy + 3);
  if (x1 < x0 || y1 < y0) return;
  const C = x1 - x0 + 1;
  const topCol = new Float32Array(C);
  for (let i = 0; i < C; i++) {
    const x = x0 + i + 0.5;
    const dx = (x - cx) / (W / 2);
    const a = Math.abs(dx);
    // square-shouldered: flat, then a quick roll off at each end
    const end = a < 0.78 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow((a - 0.78) / 0.22, 2)));
    const heavy = (heavyL ? dx < 0 : dx > 0) ? 1 : 0.9 + (1 - a) * 0.08;
    topCol[i] = a >= 1 ? 1e9 : gy - Hh * end * heavy + (fbmTex(x * 0.12, 3, s, 2) - 0.5) * 2.5;
  }
  for (let yy = y0; yy <= y1; yy++) {
    const y = yy + 0.5;
    const up = gy - y;
    const bd = beds(up * 1.1, s * 0.01) * 0.06;
    const foot = Math.pow(clamp01(1 - up / Hh * 2), 2) * 0.1;
    for (let i = 0; i < C; i++) {
      if (y < topCol[i]) continue;
      const x = x0 + i + 0.5;
      const dx = (x - cx) / (W / 2);
      const ox = (x - hx) / hw, oy = up / hh;
      const od = ox * ox + oy * oy;
      if (od < 1 && up > -1) continue;
      let h = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(dx), 4))) * (5 + W * 0.04);
      let tint = bd - foot;
      if (od < 1.8 && up > 0) {
        // the rim of the opening rounds into it; its ceiling is in shadow
        const e = clamp01((od - 1) / 0.8);
        h -= (1 - e) * 3.5;
        if (oy > 0.55) tint -= (1 - e) * 0.24; else tint += (1 - e) * 0.05;
      }
      if (y - topCol[i] < 1.5) tint += 0.1;
      setPx(p, x0 + i, yy, m, h, tint);
    }
  }
}

/** Distant tablelands: very long, very flat, very far. */
function paintTables(p, d, u0, w, gyAt, seed) {
  const C = w;
  for (let i = 0; i < C; i++) {
    const u = u0 + i + 0.5;
    const cell = Math.floor(u / 160);
    const f = u / 160 - cell;
    if (hash2i(cell, 1, seed) >= 0.62) continue;
    const a = 0.1 + hash2i(cell, 2, seed) * 0.25, b2 = 0.65 + hash2i(cell, 3, seed) * 0.3;
    if (f < a - 0.06 || f > b2 + 0.06) continue;
    const hgt = 4 + hash2i(cell, 4, seed) * 12;
    const edge = clamp01(Math.min(f - (a - 0.06), b2 + 0.06 - f) / 0.06);
    const gy = gyAt(i);
    const top = gy - hgt * Math.sqrt(edge) + (fbmTex(u * 0.1, 2, seed, 2) - 0.5) * 1.5;
    const m = p._mid(styleOf(biomeOnStrip(d, u)).rock);
    for (let yy = Math.max(0, Math.floor(top)); yy <= Math.min(p.h - 1, Math.ceil(gy) + 1); yy++) {
      if (yy + 0.5 < top) continue;
      const tint = beds((d.base - yy) * 1.6, cell) * 0.05 + (edge < 1 ? -0.07 : 0) + (yy + 0.5 - top < 1.5 ? 0.1 : 0);
      setPx(p, i, yy, m, edge * 3, tint);
    }
  }
}

/**
 * The far mountain range. One peak per cell with its own height and its own
 * two slopes, the profile the highest of them; ridged noise on top for the
 * spurs, and an envelope so some stretches are only foothills.
 */
function rangeHeight(u, seed) {
  const C = 84;
  const c = Math.floor(u / C);
  let h = 0;
  for (let i = c - 2; i <= c + 2; i++) {
    if (hash2i(i, 1, seed) < 0.15) continue;
    const pc = (i + 0.5 + (hash2i(i, 2, seed) - 0.5) * 0.7) * C;
    const ph = 6 + Math.pow(hash2i(i, 3, seed), 1.4) * 34;
    const wl = C * (0.55 + hash2i(i, 4, seed) * 1.0), wr = C * (0.55 + hash2i(i, 5, seed) * 1.0);
    const t = u < pc ? (pc - u) / wl : (u - pc) / wr;
    if (t >= 1) continue;
    const v = ph * Math.pow(1 - t, 1.35);
    if (v > h) h = v;
  }
  let r = 0, a = 1, fq = 0.05, n = 0;
  for (let i = 0; i < 3; i++) {
    const v = fbmTex(u * fq, 2.2 + i, seed + 13 * i, 1);
    const k = 1 - Math.abs(v * 2 - 1);
    r += k * k * a; n += a; a *= 0.5; fq *= 2.1;
  }
  r /= n;
  const env = 0.3 + clamp01(fbmTex(u * 0.0042, 1.3, seed, 2) * 1.5 - 0.3) * 0.85;
  return h * env * (0.86 + r * 0.24) + r * 2;
}

function paintRange(p, d, u0, w, gyAt, seed) {
  const hs = new Float32Array(w + 2);
  for (let i = 0; i < w + 2; i++) {
    const u = u0 + i - 0.5;
    const b = biomeOnStrip(d, u);
    hs[i] = b.id === 'theshallows' ? 0 : rangeHeight(u, seed) * (styleOf(b).flat ? 0.45 : 1);
  }
  for (let i = 0; i < w; i++) {
    const hh = hs[i + 1];
    if (hh < 1) continue;
    const u = u0 + i + 0.5;
    const m = p._mid(styleOf(biomeOnStrip(d, u)).rock);
    const sl = hs[i + 2] - hs[i];
    const gy = gyAt(i);
    const top = gy - hh;
    const gul = fbmTex(u * 0.16, 0.5, seed + 5, 2);
    for (let yy = Math.max(0, Math.floor(top)); yy <= Math.min(p.h - 1, Math.ceil(gy) + 1); yy++) {
      const y = yy + 0.5;
      if (y < top) continue;
      const dep = y - top;
      let tint = sl * 0.08 * clamp01(1 - dep / 18) + (gul - 0.5) * 0.12 * clamp01(dep / 4);
      tint -= clamp01(dep / 40) * 0.08;
      if (dep < 1) tint += 0.06;
      setPx(p, i, yy, m, (hh - dep * 0.1) * 0.4 + gul * 1.5, tint);
    }
  }
}

/** A ruined megacity: towers with broken tops, a cracked dome, a leaning spire. */
function paintTowers(p, f, cx, gy) {
  const s = f.seed;
  const n = 5 + Math.floor(rr(s, 1) * 6);
  const W = f.w, Hh = f.h;
  if (rr(s, 2) < 0.65) {
    const dr = W * (0.2 + rr(s, 3) * 0.12);
    const dxp = cx + (rr(s, 4) - 0.5) * W * 0.5;
    const m = p._mid(f.mat);
    const [x0, y0, x1, y1] = box(p, dxp - dr - 1, gy - dr - 1, dxp + dr + 1, gy + 1);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx + 0.5 - dxp) / dr, dy = (gy - yy - 0.5) / dr;
        const dd = dx * dx + dy * dy;
        if (dd > 1 || dy < 0) continue;
        const crack = (hash2i(xx, 1, s) - 0.5) * 0.25;
        if (dy > 0.74 + crack && Math.abs(dx) < 0.5) continue;
        const ribs = Math.abs(Math.sin(Math.atan2(dy, dx) * 9)) < 0.25 ? 0.07 : 0;
        setPx(p, xx, yy, m, Math.sqrt(1 - dd) * 3, ribs - 0.02 + (dx < -0.4 ? 0.06 : 0));
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const tx = cx + (i / Math.max(1, n - 1) - 0.5) * W + (rr(s, 10 + i) - 0.5) * 6;
    const tw = 2 + Math.floor(rr(s, 30 + i) * 4);
    const bell = 1 - Math.abs(i / Math.max(1, n - 1) - 0.5) * 1.2;
    const th = Math.max(5, Hh * (0.3 + bell * 0.6) * (0.6 + rr(s, 50 + i) * 0.5));
    const lean = rr(s, 70 + i) < 0.25 ? (rr(s, 71 + i) - 0.5) * 0.5 : 0;
    paintBlock(p, tx, gy, tw, th, lean, rr(s, 90 + i), f.mat, s + i * 13, rr(s, 110 + i) < 0.4);
  }
}

/** One ruined tower: a slab with rows of windows, its top snapped off at an angle. */
function paintBlock(p, cx, gy, w, h, lean, broken, mat, s, spire = false) {
  const breakA = (broken - 0.5) * 1.4;
  const jag = 1 + broken * 3;
  const m = p._mid(mat);
  const reach = h * Math.abs(lean);
  const [x0, y0, x1, y1] = box(p, cx - w - reach - 2, gy - h - 7, cx + w + reach + 2, gy + 1);
  for (let yy = y0; yy <= y1; yy++) {
    const up = gy - yy - 0.5;
    const c = cx + lean * up;
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx + 0.5 - c;
      if (Math.abs(dx) > w / 2) continue;
      let top = h + dx * breakA - hash2i(xx, 3, s) * jag;
      if (spire && Math.abs(dx) < 0.6) top = h + 6;
      if (up > top || up < -1) continue;
      const q = dx / Math.max(1, w / 2);
      let tint = q < -0.35 ? 0.1 : q > 0.45 ? -0.12 : 0;
      if (w >= 3 && up > 2 && Math.abs(dx) < w / 2 - 0.6) {
        if ((Math.floor(up) % 3) === 1 && hash2i(xx, Math.floor(up), s) > 0.35) tint -= 0.16;
      }
      setPx(p, xx, yy, m, 1.5 - Math.abs(q), tint);
    }
  }
}

/** A lattice pylon line: towers, cross arms, sagging cables - one of them down. */
function paintPylons(p, f, ox, gyAt, x0, x1) {
  const s = f.seed;
  const n = 3 + Math.floor(rr(s, 1) * 3);
  const span = f.w / n;
  const down = Math.floor(rr(s, 2) * n);
  const H = f.h;
  const tops = [];
  for (let i = 0; i <= n; i++) {
    const x = f.u - f.w / 2 + i * span - ox;
    const gy = gyAt(x);
    tops.push({ x, gy, y: gy - H, down: i === down });
    if (x < x0 - 40 || x > x1 + 40) continue;
    if (i === down) paintPylonFallen(p, x, gy, H, f.mat, s + i);
    else paintPylon(p, x, gy, H, f.mat);
  }
  for (let i = 0; i < n; i++) {
    const a = tops[i], b = tops[i + 1];
    if (Math.max(a.x, b.x) < x0 - 4 || Math.min(a.x, b.x) > x1 + 4) continue;
    for (let k = 0; k < 2; k++) {
      const ay = a.down ? a.gy - 1 : a.y + 3 + k * 4;
      const by = b.down ? b.gy - 1 : b.y + 3 + k * 4;
      const sag = a.down || b.down ? 3 : 6 + rr(s, 30 + i) * 4;
      const steps = Math.max(8, Math.ceil(Math.abs(b.x - a.x) / 3));
      let px = a.x, py = ay;
      for (let j = 1; j <= steps; j++) {
        const t = j / steps;
        const x = lerp(a.x, b.x, t);
        const y = Math.min(lerp(ay, by, t) + Math.sin(t * Math.PI) * sag, gyAt(x) - 0.5);
        pline(p, px, py, x, y, 'metal', 0.6, -0.14);
        px = x; py = y;
      }
    }
  }
}

function paintPylon(p, x, gy, H, mat) {
  const bw = 7, tw = 2.2;
  const L = (t) => lerp(x - bw / 2, x - tw / 2, t), R = (t) => lerp(x + bw / 2, x + tw / 2, t);
  pline(p, L(0), gy, L(1), gy - H, mat, 1, 0.1);
  pline(p, R(0), gy, R(1), gy - H, mat, 1, -0.1);
  const seg = 5;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    pline(p, L(t0), gy - H * t0, R(t1), gy - H * t1, mat, 0.6, -0.06);
    pline(p, R(t0), gy - H * t0, L(t1), gy - H * t1, mat, 0.6, -0.06);
  }
  for (const k of [0, 1]) {
    const y = gy - H + 3 + k * 4;
    pline(p, x - 6 - k * 2, y, x + 6 + k * 2, y, mat, 1, 0.04);
  }
  pline(p, x, gy - H, x, gy - H - 3, mat, 1, 0.06);
}

function paintPylonFallen(p, x, gy, H, mat, s) {
  const stub = H * (0.25 + rr(s, 1) * 0.15);
  pline(p, x - 3.5, gy, x - 2.6, gy - stub, mat, 1, 0.08);
  pline(p, x + 3.5, gy, x + 2.6, gy - stub, mat, 1, -0.08);
  pline(p, x - 3, gy - stub * 0.5, x + 3, gy - stub, mat, 0.6);
  const dir = rr(s, 2) < 0.5 ? -1 : 1;
  const ex = x + dir * H * 0.85, ey = gy - 1.5;
  pline(p, x, gy - stub, ex, ey, mat, 1, 0.04);
  pline(p, x + dir * 2, gy - stub + 2, ex, ey + 1, mat, 1, -0.08);
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const mx = lerp(x, ex, t), my = lerp(gy - stub, ey, t);
    pline(p, mx - 1, my - 1.5, mx + 1, my + 1.5, mat, 0.6);
  }
}

/** Glass shards: spikes of lightning-fused sand, standing in clusters. */
function paintShards(p, f, cx, gy) {
  const s = f.seed;
  const n = 3 + Math.floor(rr(s, 1) * 4);
  for (let i = 0; i < n; i++) {
    const x = cx + (rr(s, 10 + i) - 0.5) * f.w;
    const h = f.h * (0.35 + rr(s, 20 + i) * 0.65);
    const w = 1.5 + rr(s, 30 + i) * Math.max(2, f.w * 0.1);
    const ang = (rr(s, 40 + i) - 0.5) * 0.7;
    const tipX = x + Math.sin(ang) * h, tipY = gy - Math.cos(ang) * h;
    p.poly([{ x: x - w, y: gy + 1 }, { x: x + w, y: gy + 1 }, { x: tipX, y: tipY }],
      { mat: f.mat, dome: w * 1.6, feather: w * 0.9, tint: (rr(s, 60 + i) - 0.5) * 0.2 });
  }
}

/** A ship, a long way from any water, half under a dune. */
function paintHull(p, f, cx, gy) {
  const s = f.seed;
  const W = f.w, Hh = f.h;
  const dir = f.flip ? -1 : 1;
  const tilt = (rr(s, 1) - 0.3) * 0.1 * dir;
  const deck = gy - Hh;
  const m = p._mid(f.mat);
  const [x0, y0, x1, y1] = box(p, cx - W / 2 - 4, deck - Hh * 0.4 - 4, cx + W / 2 + 4, gy + 4);
  if (x1 < x0 || y1 < y0) return;
  const C = x1 - x0 + 1;
  const topC = new Float32Array(C), cutC = new Float32Array(C), seam = new Uint8Array(C), streakC = new Float32Array(C);
  for (let i = 0; i < C; i++) {
    const x = x0 + i + 0.5;
    const t = (x - cx) / (W / 2) * dir;
    if (t < -1 || t > 1.04) { topC[i] = 1e9; continue; }
    const bowRise = Math.pow(clamp01((t - 0.55) / 0.45), 1.8) * Hh * 0.38;
    topC[i] = deck - bowRise + tilt * (x - cx);
    // the bow is raked: the hull line cuts back under it
    cutC[i] = t > 0.62 ? topC[i] + (gy - topC[i]) * (1 - Math.pow((t - 0.62) / 0.42, 2)) * 1.05 + 2 : 1e9;
    if (t < -0.97) topC[i] += 2;
    seam[i] = (Math.floor((x - cx) * 0.25 + 1000) % 4 === 0) ? 1 : 0;
    streakC[i] = fbmTex(x * 0.4, 0.3, s + 3, 2);
  }
  for (let yy = y0; yy <= y1; yy++) {
    const y = yy + 0.5;
    for (let i = 0; i < C; i++) {
      const top = topC[i];
      if (y < top || y > cutC[i]) continue;
      const x = x0 + i + 0.5;
      const dep = y - top;
      let tint = (streakC[i] - 0.5) * 0.3 + (seam[i] ? -0.06 : 0);
      if (dep < 1.5) tint += 0.18;
      else if (dep > 5 && dep < 6.5) tint += 0.1;
      const pr = Hh * 0.32;
      if (Math.abs(dep - pr) < 1 && (x0 + i) % 7 === 0) tint -= 0.45;
      const hole = hash2i(Math.floor(x / 6), Math.floor(y / 5), s);
      if (hole > 0.86 && dep > 4) tint -= (x0 + i) % 5 === 0 ? 0 : 0.5;
      const qd = clamp01(dep / (gy - top + 0.01));
      setPx(p, x0 + i, yy, m, Math.sin(qd * Math.PI * 0.9 + 0.2) * 7, tint);
    }
  }
  // what is left of the superstructure, aft of midships
  const sx = cx - dir * W * (0.18 + rr(s, 3) * 0.12);
  const sw = W * 0.16, sh = Hh * (0.5 + rr(s, 4) * 0.3);
  const sTop = deck + tilt * (sx - cx);
  const [a0, b0, a1, b1] = box(p, sx - sw / 2 - 1, sTop - sh - 4, sx + sw / 2 + 1, sTop + 1);
  for (let yy = b0; yy <= b1; yy++) {
    for (let xx = a0; xx <= a1; xx++) {
      const dx = xx + 0.5 - sx;
      if (Math.abs(dx) > sw / 2) continue;
      const top = sTop - sh + (Math.abs(dx) < sw * 0.25 ? -2 : 0) + hash2i(xx, 1, s) * 2.5;
      if (yy + 0.5 < top) continue;
      let tint = (yy % 3 === 0 && Math.abs(dx) < sw / 2 - 1 && hash2i(xx, yy, s) > 0.4) ? -0.3 : 0;
      tint += dx < -sw * 0.3 ? 0.08 : dx > sw * 0.3 ? -0.08 : 0;
      setPx(p, xx, yy, m, 2, tint);
    }
  }
  const mx = cx + dir * W * 0.22;
  pline(p, mx, deck + tilt * (mx - cx), mx + dir * 3, deck - Hh * 0.55, 'wlRust', 1, 0.05);
}

/** A colossus face down in the sand: a helmeted head, one eye still open. */
function paintColossus(p, f, cx, gy) {
  const s = f.seed;
  const R = f.h * 0.62;
  const dir = f.flip ? -1 : 1;
  const hx = cx, hy = gy - R * 0.62;
  const metal = f.mat === 'wlRust';
  const m = p._mid(f.mat);
  const [x0, y0, x1, y1] = box(p, hx - R * 1.5, hy - R * 1.2, hx + R * 1.5, gy + 2);
  for (let yy = y0; yy <= y1; yy++) {
    const y = yy + 0.5;
    for (let xx = x0; xx <= x1; xx++) {
      const x = xx + 0.5;
      const dx = (x - hx) * dir, dy = y - hy;
      const e = (dx / (R * 1.18)) ** 2 + (dy / R) ** 2;
      const jaw = dx > R * 0.2 && dy > -R * 0.2 && dx < R * 1.3 && dy < R * 0.75
        && (dx - R * 0.2) / (R * 1.1) + (dy + R * 0.2) / (R * 0.95) < 1.2;
      if (e > 1 && !jaw) continue;
      let tint = 0;
      let h = Math.sqrt(Math.max(0, 1 - Math.min(1, e))) * R * 0.7 + (jaw ? 3 : 0);
      const ex = R * 0.42, ey = -R * 0.12;
      const ed = ((dx - ex) / (R * 0.26)) ** 2 + ((dy - ey) / (R * 0.2)) ** 2;
      if (ed < 1) { tint -= 0.55; h -= 4; } else if (ed < 1.7) { tint -= 0.12; h += 1; }
      if (Math.abs(dy - ey) < R * 0.08 && dx > -R * 0.2 && ed >= 1) tint += 0.08;
      if (metal) {
        if (Math.abs(((dx + R * 3) % (R * 0.45)) - R * 0.22) < 0.5) tint -= 0.12;
        tint += (hash2i(Math.floor(x / 3), Math.floor(y / 6), s) - 0.5) * 0.18;
      } else {
        tint += (hash2i(Math.floor(x / 2), Math.floor(y / 2), s) - 0.5) * 0.12;
      }
      if (e > 0.82 && e <= 1 && dy < -R * 0.4) tint += 0.1;
      setPx(p, xx, yy, m, h, tint);
    }
  }
  const ax = hx - dir * R * 0.4, ay = hy - R * 0.85;
  pline(p, ax, ay, ax - dir * R * 0.35, ay - R * 0.55, f.mat, 1.5, 0.05);
  if (rr(s, 5) < 0.6) {
    const fx = hx - dir * R * (1.9 + rr(s, 6) * 0.6);
    for (let i = 0; i < 4; i++) {
      const fxi = fx + (i - 1.5) * R * 0.2;
      const fh = R * (0.45 + (i === 1 || i === 2 ? 0.25 : 0) + rr(s, 10 + i) * 0.15);
      const bend = (i - 1.5) * 0.12;
      p.curve([{ x: fxi, y: gy + 1 }, { x: fxi + bend * fh, y: gy - fh * 0.6 }, { x: fxi + bend * fh * 2.2, y: gy - fh }],
        R * 0.09 + 0.6, R * 0.07 + 0.4, { mat: f.mat, dome: 2, tint: (rr(s, 20 + i) - 0.5) * 0.1, steps: 8 });
    }
  }
}

/** The ribs of something enormous. */
function paintRibs(p, f, cx, gy) {
  const s = f.seed;
  const n = 5 + Math.floor(rr(s, 1) * 4);
  const dir = f.flip ? -1 : 1;
  const W = f.w, Hh = f.h;
  const thick = Math.max(0.9, Hh * 0.045);
  p.curve([{ x: cx - W / 2, y: gy }, { x: cx, y: gy - Hh * 0.1 }, { x: cx + W / 2, y: gy - 1 }], thick * 1.4, thick * 0.9,
    { mat: 'bone', dome: thick * 2, steps: 20, tint: -0.04 });
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = cx + (t - 0.5) * W * 0.85;
    const size = Math.sin(0.25 + t * 2.7) * Hh * (0.8 + rr(s, 10 + i) * 0.25);
    if (size < 4) continue;
    const reach = size * (0.55 + rr(s, 20 + i) * 0.2) * dir;
    const broken = rr(s, 30 + i) < 0.22;
    p.curve([{ x, y: gy + 1 }, { x: x - reach * 0.1, y: gy - size * 1.05 }, { x: x + reach, y: gy - size * (broken ? 0.85 : 0.55) }],
      thick * 1.3, thick * 0.55, { mat: 'bone', dome: thick * 2.2, steps: 16, tint: (rr(s, 40 + i) - 0.5) * 0.1 });
  }
}

/** A dead pipeline on its trestles, broken in the middle. */
function paintPipe(p, f, ox, gyAt, x0, x1) {
  const s = f.seed;
  const a = f.u - f.w / 2 - ox, b = f.u + f.w / 2 - ox;
  const R = f.h * 0.32;
  const brk = lerp(a, b, 0.35 + rr(s, 1) * 0.3);
  const gap = 12 + rr(s, 2) * 16;
  // level: the trestles make up the ground. Evaluated from the feature, not
  // the tile, so the line is the same height in every tile it crosses.
  const ys = Math.round(f.gy - f.h);
  const m = p._mid(f.mat);
  const [c0, r0, c1, r1] = box(p, Math.max(x0 - 2, a), ys - R - 2, Math.min(x1 + 2, b), ys + R + 2);
  const droop = Math.max(0, gyAt(brk) - ys - R);
  for (let xx = c0; xx <= c1; xx++) {
    const x = xx + 0.5;
    if (x > brk && x < brk + gap) continue;
    let cy = ys;
    if (x < brk && x > brk - 30) cy += Math.pow((x - (brk - 30)) / 30, 2) * droop * 0.9;
    const flange = (xx + 1000) % 22 < 2;
    for (let yy = Math.floor(cy - R - 1); yy <= Math.ceil(cy + R + 1); yy++) {
      const dy = (yy + 0.5 - cy) / R;
      if (Math.abs(dy) > 1) continue;
      let tint = dy < -0.4 ? 0.12 : dy > 0.5 ? -0.12 : 0;
      if (flange) tint += 0.1;
      tint += (hash2i(xx >> 2, yy, s) - 0.5) * 0.14;
      setPx(p, xx, yy, m, Math.sqrt(1 - dy * dy) * R * 1.4, tint);
    }
  }
  for (let x = a + 8; x < b; x += 22) {
    if (x < x0 - 6 || x > x1 + 6) continue;
    if (x > brk - 30 && x < brk + gap) continue;
    const gy = gyAt(x);
    pline(p, x - 3, gy + 1, x - 1, ys + R, 'wlRust', 1, -0.05);
    pline(p, x + 3, gy + 1, x + 1, ys + R, 'wlRust', 1, -0.1);
    pline(p, x - 2, (gy + ys) / 2, x + 2, (gy + ys) / 2, 'wlRust', 0.6, -0.1);
  }
}

/** A dead tree: a trunk and branches that forked and forked and stopped. */
function paintTree(p, f, cx, gy, charred = false) {
  const s = f.seed;
  const mat = f.mat;
  const H = f.h;
  const lean = (rr(s, 1) - 0.5) * 0.5;
  const trunkW = Math.max(1.2, H * 0.075);
  const branch = (x, y, ang, len, w, depth, k) => {
    const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
    p.capsule(x, y, x2, y2, w, w * 0.7, { mat, dome: w * 1.6, tint: (rr(s, k) - 0.5) * 0.12 - depth * 0.02 });
    if (depth >= 3 || len < 3) return;
    const nb = 2 + (rr(s, k + 1) < 0.35 ? 1 : 0);
    for (let i = 0; i < nb; i++) {
      const spread = (charred ? 0.5 : 0.75) + rr(s, k + 2 + i) * 0.4;
      const a2 = ang + (i - (nb - 1) / 2) * spread + (rr(s, k + 5 + i) - 0.5) * 0.3;
      branch(x2, y2, a2, len * (0.58 + rr(s, k + 8 + i) * 0.2), Math.max(0.5, w * 0.62), depth + 1, k * 3 + i * 7 + 11);
    }
  };
  p.capsule(cx - trunkW * 2, gy + 1, cx, gy - 2, trunkW * 0.5, trunkW, { mat, dome: 2 });
  p.capsule(cx + trunkW * 2.2, gy + 1, cx, gy - 2, trunkW * 0.5, trunkW, { mat, dome: 2 });
  branch(cx, gy, lean, H * 0.45, trunkW, 0, 3);
}

/**
 * A boulder cut into facets: a top line of three to five straight edges, each
 * face lit by which way it leans - toward the sun, away, or up - with a rim
 * of light along the sunward edges and a crack or two down it.
 */
function paintBoulder(p, cx, gy, w, h, mat, s) {
  const m = p._mid(mat);
  const n = 3 + Math.floor(rr(s, 1) * 3);
  const xs = [], ys = [];
  const peak = 0.35 + rr(s, 2) * 0.3;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    xs.push(cx + (t - 0.5) * w + (i > 0 && i < n ? (rr(s, 10 + i) - 0.5) * (w / n) * 0.5 : 0));
    const k = t < peak ? t / peak : (1 - t) / (1 - peak);
    ys.push(i === 0 || i === n ? gy + 0.5 : gy - h * Math.pow(k, 0.45) * (0.8 + rr(s, 20 + i) * 0.3));
  }
  const crackX = cx + (rr(s, 30) - 0.5) * w * 0.5;
  const [x0, , x1] = box(p, xs[0], 0, xs[n], 0);
  let seg = 0;
  for (let xx = x0; xx <= x1; xx++) {
    const x = xx + 0.5;
    while (seg < n - 1 && x > xs[seg + 1]) seg++;
    const tx = clamp01((x - xs[seg]) / Math.max(0.5, xs[seg + 1] - xs[seg]));
    const top = lerp(ys[seg], ys[seg + 1], tx);
    const slope = (ys[seg + 1] - ys[seg]) / Math.max(0.5, xs[seg + 1] - xs[seg]);
    const facet = slope < -0.3 ? 0.13 : slope > 0.3 ? -0.17 : 0.03;
    const crack = Math.abs(x - crackX - (gy - top) * 0.15) < 0.6;
    for (let yy = Math.max(0, Math.floor(top)); yy <= Math.min(p.h - 1, Math.ceil(gy) + 1); yy++) {
      const y = yy + 0.5;
      if (y < top) continue;
      const dep = y - top;
      let tint = facet - clamp01(dep / (h + 1)) * 0.16;
      if (dep < 1) tint += slope < 0.3 ? 0.13 : 0.04;
      if (crack && dep > 1 && dep < h * 0.7) tint -= 0.26;
      tint += (hash2i(xx, yy, s) - 0.5) * 0.06;
      setPx(p, xx, yy, m, 1 + clamp01(1 - dep / h), tint);
    }
  }
}

/** A tumble of rocks: one big one and its broken-off pieces. */
function paintRocks(p, f, cx, gy) {
  const s = f.seed;
  const n = 1 + Math.floor(rr(s, 1) * 3);
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const x = cx + (big ? 0 : (rr(s, 10 + i) - 0.5) * f.w * 1.1);
    const h = f.h * (big ? 1 : 0.35 + rr(s, 20 + i) * 0.35);
    const w = h * (1.4 + rr(s, 30 + i) * 0.9);
    paintBoulder(p, x, gy + 1, w, h, f.mat, s + i * 31);
  }
}

/** A skull, horned, bleached, half sunk. */
function paintSkull(p, f, cx, gy) {
  const s = f.seed;
  const W = f.w, H = f.h;
  const dir = f.flip ? -1 : 1;
  p.ellipse(cx, gy - H * 0.45, W * 0.32, H * 0.42, { mat: 'bone', dome: H * 0.6 });
  p.ellipse(cx + dir * W * 0.3, gy - H * 0.28, W * 0.22, H * 0.26, { mat: 'bone', dome: H * 0.4 });
  p.ellipse(cx + dir * W * 0.05, gy - H * 0.5, W * 0.08, H * 0.1, { mat: 'bone', dome: 0, tint: -0.5 });
  p.curve([{ x: cx - dir * W * 0.1, y: gy - H * 0.75 }, { x: cx - dir * W * 0.45, y: gy - H * 1.2 }, { x: cx - dir * W * 0.2, y: gy - H * 1.55 }],
    Math.max(0.8, H * 0.12), 0.5, { mat: 'bone', dome: 1.5, steps: 10, tint: 0.04 });
  void s;
}

/** A line of old fence posts, leaning, one strand of wire left. */
function paintPosts(p, f, ox, gyAt, x0, x1) {
  const s = f.seed;
  const n = 4 + Math.floor(rr(s, 1) * 4);
  const a = f.u - f.w / 2 - ox;
  const sp = f.w / n;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const x = a + i * sp + (rr(s, 10 + i) - 0.5) * 3;
    const gy = gyAt(x);
    const h = f.h * (0.7 + rr(s, 20 + i) * 0.4);
    const lean = (rr(s, 30 + i) - 0.5) * 0.5;
    const tx = x + lean * h, ty = gy - h;
    if (x > x0 - 20 && x < x1 + 20) pline(p, x, gy + 1, tx, ty, f.mat, 1.2, 0.04);
    if (prev && rr(s, 40 + i) < 0.75) {
      const steps = 10;
      let px = prev.x, py = prev.y + 2;
      for (let j = 1; j <= steps; j++) {
        const t = j / steps;
        const xx = lerp(prev.x, tx, t), yy = lerp(prev.y + 2, ty + 2, t) + Math.sin(t * Math.PI) * 2.5;
        pline(p, px, py, xx, yy, 'metal', 0.4, -0.15);
        px = xx; py = yy;
      }
    }
    prev = { x: tx, y: ty };
  }
}

/** A car, mostly sand. */
function paintCar(p, f, cx, gy) {
  const s = f.seed;
  const W = f.w, H = f.h;
  const tilt = (rr(s, 1) - 0.5) * 0.25;
  const m = p._mid(f.mat);
  const [x0, y0, x1, y1] = box(p, cx - W / 2 - 2, gy - H - 3, cx + W / 2 + 2, gy + 2);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      const x = xx + 0.5, y = yy + 0.5;
      const t = (x - cx) / (W / 2);
      if (Math.abs(t) > 1) continue;
      const lift = tilt * (x - cx);
      const body = gy - H * 0.55 + lift;
      const cabin = Math.abs(t + 0.05) < 0.5 ? gy - H + lift + Math.abs(t + 0.05) * 3 : body;
      if (y < cabin) continue;
      let tint = 0;
      if (y < body && Math.abs(t + 0.05) < 0.42 && y > cabin + 1) tint -= 0.4;
      if (Math.abs(y - body) < 0.6) tint += 0.15;
      tint += (hash2i(xx >> 1, yy, s) - 0.5) * 0.2;
      setPx(p, xx, yy, m, 2 + (1 - Math.abs(t)) * 2, tint);
    }
  }
}

// ---------------------------------------------------------------------------
// the ground band

/**
 * The sand of a strip, from its skyline down. The windward back of each dune
 * faces the sun and is lit, with ripples running along it; the slip face
 * past the crest is in shade; a bright rim sits on the crest itself. All of
 * that fades a few pixels down into the plain front of the dune.
 */
function paintGround(p, d, u0, w, gyAt, seed) {
  const th = d.th;
  const near = d.index >= 4;
  const fadeD = near ? 12 + d.dune * 0.2 : 7;
  for (let i = 0; i < w; i++) {
    const u = u0 + i + 0.5;
    const gy = gyAt(i);
    const sl = (gyAt(i + 2) - gyAt(i - 2)) * 0.25;
    // between two biomes the sands interleave on the dither
    const { a, b, t } = biomeMix(u / d.s);
    const ma = p._mid(styleOf(a).sand), mb = t > 0 ? p._mid(styleOf(b).sand) : ma;
    const warp = fbmTex(u * 0.02, 1.5, seed, 2) * 6;
    const face = sl < 0 ? Math.min(0.14, -sl * 0.42) : -Math.min(0.3, sl * 0.55) - (sl > 0.3 ? 0.05 : 0);
    const wind = sl < 0.1;
    for (let yy = Math.max(0, Math.floor(gy)); yy < th; yy++) {
      const y = yy + 0.5;
      if (y < gy) continue;
      const dep = y - gy;
      const fade = clamp01(1 - dep / fadeD);
      let tint = face * fade;
      if (dep < 1) tint += wind ? 0.15 : 0.05;
      if (near && wind && dep > 1.5 && dep < fadeD) {
        // ripples: lines running along the slope, a few pixels apart
        const r = (dep + Math.sin(u * 0.11 + warp) * 1.3) / 3.1;
        if (r - Math.floor(r) < 0.22) tint += 0.06 * fade;
      }
      tint -= clamp01(dep / (th - d.base + 16)) * 0.14;
      tint += (hash2i(i + u0, yy, seed) - 0.5) * 0.04;
      const m = t > 0 && BAYER8[yy & 7][(i + M) & 7] < t ? mb : ma;
      setPx(p, i, yy, m, fade * 2, tint);
    }
  }
}

// ---------------------------------------------------------------------------

/** Paint tile k of depth d. Returns a canvas TILE_W + 2*M wide. */
export function paintTile(d, k, seed) {
  const W = TILE_W + M * 2, H = d.th;
  const p = new Painter(W, H);
  const u0 = k * TILE_W - M;
  const gyCache = new Float32Array(W + 2);
  for (let i = 0; i < W + 2; i++) gyCache[i] = d.base - groundTop(d, u0 + i - 1 + 0.5);
  const gyAt = (x) => {
    const i = Math.round(x) + 1;
    if (i >= 0 && i < gyCache.length) return gyCache[i];
    return d.base - groundTop(d, u0 + x);
  };
  const s = (seed + d.index * 977) >>> 0;

  if (d.id === 'skyline') paintTables(p, d, u0, W, gyAt, s + 5);
  if (d.id === 'range') paintRange(p, d, u0, W, gyAt, s + 9);

  const c0 = Math.floor((u0 - REACH) / d.cell), c1 = Math.floor((u0 + W + REACH) / d.cell);
  const feats = [];
  for (let c = c0; c <= c1; c++) {
    const f = featureIn(d, c, seed);
    if (!f) continue;
    const half = f.w / 2 + 40;
    if (f.u + half < u0 || f.u - half > u0 + W) continue;
    if (f.gy === undefined) f.gy = d.base - groundTop(d, f.u);
    feats.push(f);
  }
  feats.sort((a, b) => a.z - b.z || a.u - b.u);
  const buried = [];
  for (const f of feats) {
    const cx = f.u - u0;
    // features stand on the ground where their middle is, so a mesa does not
    // change height from one tile to the next
    const gy = f.gy + 1;
    switch (f.kind) {
      case 'table': paintCliff(p, f, cx, gy, { talus: 0.15, tier: false, cliff: 0.8 }); break;
      case 'mesa': paintCliff(p, f, cx, gy); break;
      case 'butte': paintCliff(p, f, cx, gy, { cliff: 0.56 + rr(f.seed, 2) * 0.1, tier: rr(f.seed, 3) < 0.25 }); break;
      case 'spire': paintSpire(p, cx, gy, f.w, f.h, f.mat, f.seed, { cap: false, bulge: 0.08 }); break;
      case 'hoodoo': {
        const n = 2 + Math.floor(rr(f.seed, 1) * 4);
        for (let i = 0; i < n; i++) {
          const x = cx + (i / Math.max(1, n - 1) - 0.5) * f.w + (rr(f.seed, 10 + i) - 0.5) * 4;
          const h = f.h * (0.45 + rr(f.seed, 20 + i) * 0.55);
          paintSpire(p, x, gy, 3 + rr(f.seed, 30 + i) * Math.max(2, f.w * 0.16), h, f.mat, f.seed + i * 7);
        }
        break;
      }
      case 'arch': paintArch(p, f, cx, gy); break;
      case 'towers': paintTowers(p, f, cx, gy); break;
      case 'tower': paintBlock(p, cx, gy, f.w, f.h, rr(f.seed, 1) < 0.3 ? (rr(f.seed, 2) - 0.5) * 0.3 : 0, rr(f.seed, 3), f.mat, f.seed, rr(f.seed, 4) < 0.3); break;
      case 'pylon': paintPylons(p, f, u0, gyAt, 0, W); break;
      case 'shard': paintShards(p, f, cx, gy); break;
      case 'hull': paintHull(p, f, cx, gy + f.h * 0.2); buried.push(f); break;
      case 'colossus': paintColossus(p, f, cx, gy + f.h * 0.12); buried.push(f); break;
      case 'ribs': paintRibs(p, f, cx, gy); break;
      case 'pipe': paintPipe(p, f, u0, gyAt, 0, W); break;
      case 'tree': paintTree(p, f, cx, gy); break;
      case 'snag': paintTree(p, f, cx, gy, true); break;
      case 'rocks': paintRocks(p, f, cx, gy); break;
      case 'skull': paintSkull(p, f, cx, gy + 1); break;
      case 'post': paintPosts(p, f, u0, gyAt, 0, W); break;
      case 'car': paintCar(p, f, cx, gy + 3); buried.push(f); break;
      default: break;
    }
  }

  // the ground over everything's feet
  paintGround(p, d, u0, W, gyAt, s + 17);
  // and the sand drifted up against whatever is half buried
  for (const f of buried) {
    const cx = f.u - u0;
    const dw = f.w * 0.6;
    const dh = f.h * 0.22;
    const dir = f.flip ? -1 : 1;
    const m = p._mid(styleOf(biomeOnStrip(d, f.u)).sand);
    const [x0, , x1] = box(p, cx - dw - 2, 0, cx + dw + 2, 0);
    for (let xx = x0; xx <= x1; xx++) {
      const t = (xx + 0.5 - cx) / dw;
      if (Math.abs(t) > 1) continue;
      const bump = Math.pow(Math.cos(t * Math.PI / 2), 1.5) * dh * (1 + t * dir * 0.3);
      const g0 = gyAt(xx);
      const top = g0 - bump;
      for (let yy = Math.max(0, Math.floor(top)); yy <= Math.min(H - 1, Math.ceil(g0) + 1); yy++) {
        if (yy + 0.5 < top) continue;
        setPx(p, xx, yy, m, 2, (yy + 0.5 - top < 1 ? 0.13 : 0) - t * dir * 0.06);
      }
    }
  }

  p.smoothHeight(1, 0.5);
  return shade(p, { dither: d.dither });
}

// ---------------------------------------------------------------------------

const LX = -0.6, LY = -0.66, LZ = 0.45;

/** Light and quantise a painter's fields into a canvas. */
export function shade(p, o = {}) {
  const { w, h } = p;
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const ll = Math.hypot(LX, LY, LZ);
  const Lx = LX / ll, Ly = LY / ll, Lz = LZ / ll;
  const amb = o.ambient ?? 0.34;
  const dith = o.dither ?? 0.6;
  const specs = p.mats.map((n) => (n ? (MATERIALS[n] || MATERIALS.default) : null));
  const rgbs = specs.map((sp) => (sp ? sp.ramp.map(hexToRgb) : null));
  const mat = p.mat, hg = p.hgt, tn = p.tint;
  for (let y = 0; y < h; y++) {
    const row = BAYER8[y & 7];
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mat[i];
      if (!m) continue;
      const hc = hg[i];
      const hl = x > 0 && mat[i - 1] ? hg[i - 1] : hc;
      const hr = x < w - 1 && mat[i + 1] ? hg[i + 1] : hc;
      const hu = y > 0 && mat[i - w] ? hg[i - w] : hc;
      const hd = y < h - 1 && mat[i + w] ? hg[i + w] : hc;
      const sp = specs[m];
      const ns = sp.normalScale ?? 0.6;
      const nx = -(hr - hl) * 0.5 * ns, ny = -(hd - hu) * 0.5 * ns;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const diff = Math.max(0, (nx * Lx + ny * Ly + Lz) * inv);
      let cav = (hc - (hl + hr + hu + hd) * 0.25) * (sp.ao ?? 0.1) * 1.4;
      cav = cav < -0.25 ? -0.25 : cav > 0.25 ? 0.25 : cav;
      const v = amb + diff * (sp.diffuse ?? 0.78) + tn[i] + cav;
      const rgb = rgbs[m];
      const n = rgb.length;
      let idx = Math.floor(v * (n - 1) + (row[(x + M) & 7] - 0.5) * dith);
      idx = idx < 0 ? 0 : idx >= n ? n - 1 : idx;
      const c = rgb[idx];
      const o2 = i * 4;
      d[o2] = c[0]; d[o2 + 1] = c[1]; d[o2 + 2] = c[2]; d[o2 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export const TILE_MARGIN = M;
