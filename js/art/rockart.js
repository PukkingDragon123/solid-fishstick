// CRABDEN - stone.
//
// The desert used to be drawn with eggs: an ellipse, a dome of height, a tint
// band or two. Real rock is a broken thing. It has FACES - flat planes where
// it split along a joint - and edges between them that catch the light; it
// has beds you can read, cracks with a lit lip, a black-brown skin of desert
// varnish streaking down the faces that stand up to the weather, lichen on
// the tops, and sand splashed up round its foot where it goes into the
// ground. Every one of those is a cue the eye uses to decide "that is a rock,
// and it is heavy, and it is sitting IN the sand", and this file paints all
// of them.
//
// A rock body is a polygon outline (angular, never a formula) whose height
// field is the minimum of a set of tangent planes of a dome - which is what
// makes facets - bevelled down to nothing at the edge, roughened, and then
// textured in passes. Each body is resolved on its own and the bodies of a
// cluster are composited back to front, so a rock leaning on another one
// casts a real shadow on it and has a real crevice line where they meet.
//
// Everything is baked once into a canvas. Nothing here runs per frame.

import { Painter, makeCanvas, fbmTex, hash2i } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, mulberry32, TAU } from '../lib/math.js';

/** How each kind of stone weathers. */
export const STONE = {
  sandstone: { mat: 'sandstone', round: 2, angular: 0.6, strata: 1, cross: 0.6, varnish: 0.75,
    lichen: 0.22, lichenMat: 'lichenOrange', cracks: 0.65, pits: 0.15, outline: '#170a07' },
  sandstoneBuff: { mat: 'sandstoneBuff', round: 2, angular: 0.55, strata: 0.85, cross: 0.4, varnish: 0.6,
    lichen: 0.28, lichenMat: 'lichenOrange', cracks: 0.55, pits: 0.2, outline: '#1a120c' },
  limestone: { mat: 'limestone', round: 3, angular: 0.35, strata: 0.35, varnish: 0.3, lichen: 0.45,
    lichenMat: 'lichenGreen', cracks: 0.45, pits: 0.9, karren: 0.7, outline: '#151418' },
  basalt: { mat: 'basalt', round: 0, angular: 0.95, strata: 0, varnish: 0.15, lichen: 0.5,
    lichenMat: 'lichenOrange', cracks: 0.9, vesicles: 0.7, rust: 0.45, outline: '#060609' },
  granite: { mat: 'granite', round: 4, angular: 0.25, strata: 0, varnish: 0.35, lichen: 0.4,
    lichenMat: 'lichenGreen', cracks: 0.5, flecks: 1, outline: '#120e0f' },
  rock: { mat: 'rock', round: 2, angular: 0.5, strata: 0.5, varnish: 0.5, lichen: 0.3,
    lichenMat: 'lichenGreen', cracks: 0.6, pits: 0.3, outline: '#140f0c' },
  rockRed: { mat: 'rockRed', round: 2, angular: 0.55, strata: 0.9, varnish: 0.6, lichen: 0.2,
    lichenMat: 'lichenOrange', cracks: 0.6, pits: 0.15, outline: '#170b07' },
  shale: { mat: 'shale', round: 1, angular: 0.8, strata: 1, varnish: 0.1, lichen: 0.15,
    lichenMat: 'lichenGreen', cracks: 0.7, outline: '#060506' },
};

/** Which stone a stretch of desert is made of, as weighted choices. */
const BIOME_STONE = {
  theshallows: [['limestone', 6], ['sandstoneBuff', 4]],
  saltpan: [['limestone', 6], ['sandstoneBuff', 4]],
  bonereef: [['limestone', 7], ['sandstoneBuff', 3]],
  dunes: [['sandstone', 6], ['sandstoneBuff', 3], ['limestone', 1.5]],
  glassflats: [['limestone', 5], ['granite', 3], ['sandstoneBuff', 2]],
  rustlands: [['sandstone', 6], ['basalt', 2], ['sandstoneBuff', 2]],
  ashwood: [['basalt', 6], ['granite', 2.5], ['sandstoneBuff', 1.5]],
  deepwell: [['basalt', 6], ['limestone', 2], ['granite', 2]],
};

export function stoneFor(biomeId, roll) {
  const list = BIOME_STONE[biomeId] || BIOME_STONE.dunes;
  let tot = 0;
  for (const [, w] of list) tot += w;
  let k = roll * tot;
  for (const [id, w] of list) { k -= w; if (k <= 0) return id; }
  return list[0][0];
}

const LIGHT = { lightX: -0.58, lightY: -0.7, lightZ: 0.4, ambient: 0.26, dither: 0.3 };

// ---------------------------------------------------------------------------
// one rock body

/**
 * The dome a rock is cut from: a superellipse leaning over its foot, sunk so
 * its widest point is at or a little above the sand. Returns a function that
 * gives the height of the smooth dome anywhere (negative outside it).
 */
function ellipsoid(r, cx, gy, o) {
  const k0 = o.sink0 ?? (0.06 + r() * 0.26);        // how much of it is under the sand
  const ay = o.rh / (1 - k0);
  const cy = gy - o.rh + ay;                         // centre, so the top is rh up
  const ax = o.rw;
  // 2 is an ellipse, higher is boxier; a tall rock needs shoulders or it is
  // a mountain
  const pw = o.square ?? (1.85 + r() * 0.7 + clamp((o.rh / o.rw - 0.9) * 0.9, 0, 1.4));
  const lean = o.lean || 0;
  const Hd = Math.min(o.rw, o.rh) * (1.05 + r() * 0.3) + 2;
  const f = (x, y) => {
    const up = clamp01((gy - y) / Math.max(1, o.rh));
    const u = (x - cx - lean * up * o.rw * 0.35) / ax, v = (y - cy) / ay;
    const q = 1 - Math.pow(Math.pow(Math.abs(u), pw) + Math.pow(Math.abs(v), pw), 2 / pw);
    return q > 0 ? Hd * Math.sqrt(q) : q * Hd;
  };
  return { f, Hd, x0: cx - ax * 1.3 - Math.abs(lean) * o.rw * 0.4, x1: cx + ax * 1.3 + Math.abs(lean) * o.rw * 0.4,
    y0: gy - o.rh * 1.2 - 2 };
}

/**
 * Paint and resolve one rock. `o`:
 *   rw, rh    half-width and height above the ground line
 *   bury      how far it continues below the ground line
 *   stone     a STONE key
 *   seed
 *   lean, square, angular, sink0   shape knobs
 *   dome(cx, gy) -> { f, Hd, x0, x1, y0, clip }   a custom dome instead of
 *             the ellipsoid; with `clip` the rock never rises above f = 0
 *   dust      the material splashed up round its foot (the ground's own)
 *   paint(p, ctx)  an extra pass after the texture - ore veins, crystals
 * Returns { cv, ox, oy, painter, ctx } with (ox, oy) the ground point.
 *
 * The height field is the MINIMUM of tangent planes of the dome, taken at
 * points scattered over it. That is a convex polyhedron: flat faces that each
 * catch the sun at their own angle, sharp edges between them, and - because
 * the planes taken near the rim are steep - an outline that breaks at
 * corners instead of following a curve.
 */
export function rockBody(o) {
  const S = STONE[o.stone] || STONE.rock;
  const r = mulberry32((o.seed >>> 0) || 1);
  const angular = o.angular ?? S.angular;
  const pad = 3;
  const bury = Math.max(2, Math.round(o.bury ?? 4));
  const leanX = Math.abs(o.lean || 0) * o.rw * 0.4;
  const W = Math.ceil(o.rw * 2.7 + leanX * 2) + pad * 2;
  const H = Math.ceil(o.rh * 1.22) + bury + pad * 2 + 3;
  const cx = Math.round(W / 2), gy = Math.round(pad + o.rh * 1.22 + 2);
  const p = new Painter(W, H);
  const mat = o.mat || S.mat;
  const dome = o.dome ? o.dome(cx, gy) : ellipsoid(r, cx, gy, o);
  const f = dome.f;
  const yMax = gy + bury + 2;

  // facets: tangent planes at points spread over the visible dome - a ring
  // of them near the rim, which cut the outline, and the rest inside
  const planes = [];
  const grad = (x, y) => {
    const e = 0.6;
    return [(f(x + e, y) - f(x - e, y)) / (2 * e), (f(x, y + e) - f(x, y - e)) / (2 * e)];
  };
  const addPlane = (sx, sy, jit) => {
    const h0 = f(sx, sy);
    if (!(h0 > 0.5)) return;
    let [gx, gyy] = grad(sx, sy);
    // turn and tilt each face a little, so the cut is not regular
    const a = (r() - 0.5) * jit, c = Math.cos(a), sn = Math.sin(a);
    const tilt = 1 + (r() - 0.5) * jit * 0.8;
    [gx, gyy] = [(gx * c - gyy * sn) * tilt, (gx * sn + gyy * c) * tilt];
    planes.push([sx, sy, h0 * (1 + (r() - 0.2) * 0.12 * angular), gx, gyy]);
  };
  const span = dome.x1 - dome.x0;
  const nRim = Math.round(7 + angular * 5 + Math.min(9, span / 11));
  for (let k = 0; k < nRim; k++) {
    // round the top from the left foot to the right one
    const t = (k + 0.5 + (r() - 0.5) * 0.7) / nRim;
    const ang = Math.PI * (1 - 0.08 + t * 1.16);     // left foot, over the top, right foot
    // walk out from the middle until the dome runs out, then step back in
    let lo = 0, hi = Math.max(o.rw, o.rh) * 1.4;
    const ox0 = cx, oy0 = gy - o.rh * 0.35;
    for (let it = 0; it < 14; it++) {
      const m = (lo + hi) / 2;
      if (f(ox0 + Math.cos(ang) * m, oy0 + Math.sin(ang) * m) > 0) lo = m; else hi = m;
    }
    const rr = lo * (0.8 + r() * 0.14);
    addPlane(ox0 + Math.cos(ang) * rr, oy0 + Math.sin(ang) * rr, 0.5 + angular * 0.6);
  }
  const nIn = Math.round(4 + angular * 6 + Math.min(16, (o.rw + o.rh) / 6));
  for (let k = 0, tries = 0; k < nIn && tries < nIn * 10; tries++) {
    const sx = lerp(dome.x0, dome.x1, r()), sy = lerp(dome.y0, gy, Math.pow(r(), 0.75));
    if (f(sx, sy) < dome.Hd * 0.22) continue;
    addPlane(sx, sy, 0.4 + angular * 0.7);
    k++;
  }
  const cap = o.cap ? dome.Hd * o.cap : Infinity;
  const seedN = (o.seed & 4095) + 7;

  p.field(Math.max(0, Math.floor(dome.x0)), Math.max(0, Math.floor(dome.y0)), Math.min(W - 1, Math.ceil(dome.x1)), H - 1, (x, y) => {
    if (y > yMax) return null;
    const h0 = f(x, y);
    if (h0 < -dome.Hd * 0.6) return null;
    if (dome.clip && h0 < 0) return null;
    let h = Infinity;
    for (let i = 0; i < planes.length; i++) {
      const pl = planes[i];
      const v = pl[2] + pl[3] * (x - pl[0]) + pl[4] * (y - pl[1]);
      if (v < h) h = v;
    }
    // below the ground line nobody sees the outline, so the rock just
    // carries on down rather than closing up
    if (y > gy - 1 && h < 1) h = Math.max(h, h0 > 0 ? 1 : h);
    if (h <= 0) return null;
    if (h > cap) h = cap;
    // weathering: a rock is rough at every scale smaller than its facets
    const n = fbmTex(x * 0.19, y * 0.19, seedN, 3) - 0.5;
    return { h: Math.max(0.3, h + n * (0.35 + (1 - angular) * 0.35)), tint: n * 0.1 };
  }, { mat });

  if (S.round) p.smoothHeight(S.round, 0.28);
  // the bounds of what actually got painted, for the texture passes
  let x0 = W, x1 = 0, y0 = H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!p.mat[y * W + x]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y;
  }
  const ctx = { W, H, cx, gy, x0, x1, y0, mat, S, r, seed: o.seed >>> 0, bury };
  if (!o.plain) texture(p, ctx, o);
  if (o.paint) o.paint(p, ctx);
  if (!o.noBase) base(p, ctx, o);

  const cv = p.resolve(MATERIALS, { ...LIGHT, ...(o.light || {}), outline: 0.9, outlineColor: o.outlineColor || S.outline });
  selout(cv, p);
  return { cv, ox: cx, oy: gy, painter: p, ctx };
}

/**
 * Selective outline. A flat black line all the way round is what makes a
 * sprite read as a sticker; real edges are the local colour pushed darker -
 * barely darker where the sun catches the rim, much darker on the shadow
 * side. Runs once, at bake time.
 */
export function selout(cv, p, lit = 0.62, dark = 0.3) {
  const w = cv.width, h = cv.height;
  const g = cv.getContext('2d');
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const mat = p.mat;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mat[i] || d[i * 4 + 3] === 0) continue;
      const R = x + 1 < w && mat[i + 1], L = x > 0 && mat[i - 1];
      const D = y + 1 < h && mat[i + w], U = y > 0 && mat[i - w];
      const nb = D ? i + w : R ? i + 1 : L ? i - 1 : U ? i - w : -1;
      if (nb < 0) continue;
      // facing the light (body below or to the right of the edge) or not
      const face = (D ? 1 : 0) + (R ? 0.8 : 0) - (U ? 1 : 0) - (L ? 0.8 : 0);
      const k = face > 0.5 ? lit : face < -0.5 ? dark : (lit + dark) / 2;
      const o = nb * 4, q = i * 4;
      d[q] = d[o] * k; d[q + 1] = d[o + 1] * k; d[q + 2] = d[o + 2] * k * 1.05;
      d[q + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// texture passes, run straight over the painter's buffers

function each(p, fn) {
  const { w, h } = p;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (p.mat[i]) fn(x, y, i);
    }
  }
}

/** The topmost rock pixel in each column, for passes that run down a face. */
function tops(p) {
  const t = new Int16Array(p.w).fill(-1);
  for (let x = 0; x < p.w; x++) {
    for (let y = 0; y < p.h; y++) if (p.mat[y * p.w + x]) { t[x] = y; break; }
  }
  return t;
}

function texture(p, c, o) {
  const S = c.S, r = c.r, seed = c.seed & 65535;
  const m = p._mid(c.mat);
  const W = p.w;
  const top = tops(p);
  const tall = c.gy - c.y0, wide = c.x1 - c.x0;
  const big = clamp01((Math.max(tall, wide * 0.6) - 6) / 30);

  // beds: the rock was laid down in layers and the layers still show. On a
  // pebble that is a faint banding; on a boulder you can count them.
  const strata = ((o.strata ?? S.strata) || 0) * (0.3 + big * 0.7);
  if (strata > 0.02) {
    const tilt = (r() - 0.5) * 0.2 + (o.dip || 0);
    const spacing = Math.max(3.2, tall * (0.09 + r() * 0.07)) + r() * 1.5;
    const hard = [];
    for (let i = 0; i < 64; i++) hard.push(hash2i(i, 3, seed));
    each(p, (x, y, i) => {
      if (p.mat[i] !== m) return;
      const warp = (fbmTex(x * 0.04, y * 0.05, seed + 11, 2) - 0.5) * 5;
      const ph = (c.gy - y + tilt * (x - c.cx) + warp) / spacing;
      const bed = Math.floor(ph), f = ph - bed;
      const hb = hard[((bed % 64) + 64) % 64];
      let t = (hb - 0.5) * 0.14 * strata;
      // the parting between two beds, and the lip of the bed below it
      if (hb > 0.35 && f < 1 / spacing) { t -= 0.17 * strata; p.hgt[i] -= 0.5 * strata; }
      else if (f < 2.2 / spacing) t += 0.05 * strata;
      // a hard bed stands proud of the soft ones either side of it
      if (hb > 0.75) p.hgt[i] += 0.8 * strata;
      // cross-bedding inside the thick beds - the old dunes, frozen in stone
      if (S.cross && hb < 0.3 && big > 0.4) {
        const cb = Math.sin(x * 0.85 + (c.gy - y) * 1.6 + bed * 2.1);
        if (cb > 0.9) t -= 0.06 * S.cross;
      }
      p.tint[i] += t;
    });
  }

  // grain: sparse, so the faces stay faces
  p.speckle(c.mat, { density: 0.045, amp: 0.14, seed: seed + 3 });
  if (S.flecks) {
    each(p, (x, y, i) => {
      if (p.mat[i] !== m) return;
      const k = hash2i(x, y, seed + 17);
      if (k < 0.05) p.tint[i] -= 0.3;
      else if (k > 0.965) p.tint[i] += 0.22;
    });
  }
  // solution pits (limestone), gas bubbles (basalt): a dark pixel with a
  // lit lower lip
  const pits = (S.pits || 0) + (S.vesicles || 0);
  if (pits) {
    each(p, (x, y, i) => {
      if (p.mat[i] !== m || y - top[x] < 2) return;
      if (hash2i(x, y, seed + 29) < 0.014 * pits) {
        p.tint[i] -= 0.4; p.hgt[i] -= 0.9;
        const j = i + W;
        if (j < p.mat.length && p.mat[j] === m) p.tint[j] += 0.1;
      }
    });
  }

  // cracks: the joints it will one day split along. Dark, with the lip on
  // the far side catching the light. Small stones have none.
  const nCr = big < 0.15 ? 0 : Math.round((S.cracks || 0) * (0.4 + r() * 1.3) * (0.6 + big * 2));
  for (let k = 0; k < nCr; k++) {
    let x = lerp(c.x0 + wide * 0.15, c.x1 - wide * 0.15, r());
    let y = top[Math.round(clamp(x, 0, W - 1))];
    if (y < 0) continue;
    let dir = Math.PI / 2 + (r() - 0.5) * 1.0;
    const len = tall * (0.3 + r() * 0.55);
    let last = -1;
    for (let s = 0; s < len; s += 0.6) {
      dir += (r() - 0.5) * 0.45;
      dir = lerp(dir, Math.PI / 2, 0.06);
      x += Math.cos(dir) * 0.6; y += Math.sin(dir) * 0.6;
      const ix = Math.round(x), iy = Math.round(y);
      if (ix < 1 || iy < 1 || ix >= W - 1 || iy >= c.gy - 1) break;
      const i = iy * W + ix;
      if (!p.mat[i]) break;
      if (i === last) continue;
      last = i;
      p.tint[i] -= 0.42; p.hgt[i] -= 1.2;
      if (p.mat[i + 1]) p.tint[i + 1] += 0.1;
      // a crack forks now and then
      if (r() < 0.025 && s > 3) {
        let bx = x, by = y, bd = dir + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.5);
        for (let q = 0; q < len * 0.3; q += 0.6) {
          bx += Math.cos(bd) * 0.6; by += Math.sin(bd) * 0.6;
          const bi = Math.round(by) * W + Math.round(bx);
          if (bi < 0 || bi >= p.mat.length || !p.mat[bi]) break;
          p.tint[bi] -= 0.3; p.hgt[bi] -= 0.8;
        }
      }
    }
  }

  // karren: the runnels rain cuts down a limestone face
  if (S.karren && big > 0.2) {
    for (let k = 0; k < 2 + r() * 4; k++) {
      const x = Math.round(lerp(c.x0 + 2, c.x1 - 2, r()));
      const t0 = top[x];
      if (t0 < 0) continue;
      const len = tall * (0.15 + r() * 0.35) * S.karren;
      for (let y = t0 + 1; y < t0 + len; y++) {
        const i = y * W + x;
        if (!p.mat[i]) break;
        p.tint[i] -= 0.14; p.hgt[i] -= 0.5;
      }
    }
  }

  // desert varnish: streaks of manganese-black running down from the top,
  // where the dew ran. Only big old faces have had time to grow it.
  const varn = (o.varnish ?? S.varnish) * clamp01((tall - 10) / 26);
  if (varn > 0.02) {
    const vm = p._mid('varnish');
    for (let x = 0; x < W; x++) {
      const t0 = top[x];
      if (t0 < 0) continue;
      const s = fbmTex(x * 0.3, 0.5, seed + 41, 2);
      if (s < 0.52) continue;
      const len = tall * (0.2 + (s - 0.5) * 2.2) * (0.5 + varn * 0.6);
      for (let y = t0 + 1; y < t0 + len; y++) {
        const i = y * W + x;
        if (!p.mat[i] || p.mat[i] !== m) continue;
        const k = (1 - (y - t0) / len) * varn * (s + 0.2);
        if (k > 0.45 && hash2i(x, y, seed + 47) < k) p.mat[i] = vm;
        else p.tint[i] -= k * 0.2;
      }
    }
  }

  // rust and iron staining on dark rock
  if (S.rust) {
    const rm = p._mid('rust');
    each(p, (x, y, i) => {
      if (p.mat[i] !== m) return;
      const n = fbmTex(x * 0.1, y * 0.1, seed + 53, 2);
      if (n > 0.68 && hash2i(x, y, seed + 59) < (n - 0.62) * 2.2 * S.rust) { p.mat[i] = rm; p.tint[i] -= 0.08; }
    });
  }

  // lichen, in rosettes, on the tops and the faces that look up
  const lich = (o.lichen ?? S.lichen) * (0.4 + big * 0.6);
  if (lich > 0.03) {
    const lm = p._mid(S.lichenMat || 'lichenGreen');
    const lm2 = p._mid(S.lichenMat === 'lichenOrange' ? 'lichenGreen' : 'lichenOrange');
    const n = Math.round(lich * (2 + wide * 0.12));
    for (let k = 0; k < n; k++) {
      const x = Math.round(lerp(c.x0 + 1, c.x1 - 1, r()));
      if (top[x] < 0) continue;
      const y = top[x] + 1 + Math.floor(r() * Math.max(1, tall * 0.35));
      const rad = 0.6 + r() * (0.6 + big * 1.2);
      const mm = r() < 0.75 ? lm : lm2;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const d = Math.hypot(dx, dy * 1.4);
          if (d > rad + hash2i(x + dx, y + dy, seed + 61) * 0.9) continue;
          const i = (y + dy) * W + x + dx;
          if (i < 0 || i >= p.mat.length || p.mat[i] !== m) continue;
          p.mat[i] = mm; p.tint[i] = -0.08 + (hash2i(x + dx, y + dy, seed + 67) - 0.5) * 0.24; p.hgt[i] += 0.3;
        }
      }
    }
  }

  // wind polish: the windward shoulder is worn smooth and holds a shine
  each(p, (x, y, i) => {
    if (p.mat[i] !== m) return;
    if (x < c.cx - wide * 0.12 && y - top[x] < 3) p.tint[i] += 0.04;
  });
}

/** Where the rock goes into the ground: darker, and dusted with the sand. */
function base(p, c, o) {
  const dust = o.dust || 'desertSand';
  const dm = p._mid(dust);
  const W = p.w;
  const reach0 = o.dustReach ?? clamp(1.2 + (c.gy - c.y0) * 0.05, 1.5, 4.5);
  const seed = (c.seed & 65535) + 101;
  each(p, (x, y, i) => {
    const up = c.gy - y;                      // pixels above the ground line
    const reach = reach0 * (0.5 + fbmTex(x * 0.18, 1.7, seed, 2));
    if (up > reach + 4) return;
    // ambient occlusion: no sky gets in this close to the sand
    const ao = clamp01(1 - up / (reach + 4));
    p.tint[i] -= ao * 0.26;
    // sand thrown up by every wind there has ever been, thickest at the foot
    const k = clamp01(1 - up / Math.max(0.5, reach));
    if (up < reach && hash2i(x, y, seed) < k * 0.85) {
      p.mat[i] = dm;
      p.tint[i] = 0.05 + (hash2i(x, y, seed + 5) - 0.5) * 0.2 - ao * 0.08;
      p.hgt[i] = Math.max(0.3, p.hgt[i] * 0.4);
    }
  });
}

// ---------------------------------------------------------------------------
// composites

/** A silhouette of `cv` in flat colour, for shadows. */
function silhouette(cv, color) {
  const s = makeCanvas(cv.width, cv.height);
  const g = s.getContext('2d');
  g.drawImage(cv, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, s.width, s.height);
  return s;
}

/**
 * Lay bodies over each other back to front. Each later body throws a shadow
 * down and right onto what is already there (the sun is up and to the left),
 * and its own outline is the crevice where they meet.
 */
function composite(parts, W, H) {
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  parts.forEach((pt, k) => {
    const x = Math.round(pt.x - pt.ox), y = Math.round(pt.y - pt.oy);
    if (k > 0 && pt.shadow !== false) {
      const sh = silhouette(pt.cv, 'rgba(14,6,4,1)');
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.34;
      g.drawImage(sh, x + 2, y + 1);
      g.globalAlpha = 0.2;
      g.drawImage(sh, x + 4, y + 2);
      g.restore();
    }
    g.drawImage(pt.cv, x, y);
  });
  return cv;
}

/**
 * A rock, or several. `kind`:
 *   boulder   one body
 *   cluster   a big one with smaller ones leaning on it and lying round it
 *   stack     a hoodoo: a soft, banded pedestal holding up a hard cap
 *   columns   basalt, split into prisms
 *   slab      a tipped-up bed, all face
 *   pebbles   a scatter of small stones, half sunk
 * Returns { cv, ox, oy, w, h, top, foot } - (ox, oy) is the ground point,
 * `top` the height above it, `foot` the half-width at the ground.
 */
export function paintRocks(o) {
  const r = mulberry32((o.seed >>> 0) ^ 0x9e3779b9);
  const kind = o.kind || 'boulder';
  const w = o.w, h = o.h;
  const bury = Math.round(o.bury ?? clamp(3 + h * 0.12, 3, 12));
  const stone = o.stone || 'sandstone';
  const parts = [];
  const pushBody = (dx, rw, rh, extra = {}) => {
    const b = rockBody({ seed: (r() * 4294967296) >>> 0, rw, rh, bury: bury + (extra.sink || 0),
      stone: extra.stone || stone, dust: o.dust, ...extra });
    parts.push({ cv: b.cv, ox: b.ox, oy: b.oy, x: dx, y: extra.sink ? extra.sink : 0, shadow: extra.shadow });
    return b;
  };

  if (kind === 'cluster') {
    // the big one, slightly to one side, and its company
    const side = r() < 0.5 ? -1 : 1;
    const mainW = w * 0.34, mainH = h;
    // something behind it, peeking out
    if (r() < 0.7) pushBody(-side * w * (0.18 + r() * 0.08), mainW * (0.55 + r() * 0.2), mainH * (0.55 + r() * 0.2),
      { lean: -side * 0.4, shadow: false, lichen: 0.4 });
    pushBody(side * w * 0.04, mainW, mainH, { lean: (r() - 0.5) * 0.6 });
    // one leaning on its flank
    pushBody(side * w * (0.26 + r() * 0.06), mainW * (0.52 + r() * 0.15), mainH * (0.38 + r() * 0.16),
      { lean: -side * (0.6 + r() * 0.5), sink: 1 });
    // and the small ones that broke off it, in front
    const nSmall = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nSmall; i++) {
      const dx = (r() - 0.5) * w * 0.85;
      const s = 0.1 + r() * 0.14;
      const sh = Math.max(2, mainH * s);
      pushBody(dx, Math.max(2.4, sh * (1.2 + r() * 0.7)), sh, { sink: 1 + Math.floor(r() * 2) });
    }
  } else if (kind === 'stack') {
    parts.push(...stackParts(o, r, bury));
  } else if (kind === 'columns') {
    parts.push(...columnParts(o, r, bury));
  } else if (kind === 'slab') {
    pushBody(0, w * 0.5, h, { square: 3.6 + r(), cap: 0.6, lean: (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.4),
      dip: (r() - 0.5) * 0.6, strata: 1.2, sink0: 0.25 });
    if (r() < 0.6) pushBody((r() < 0.5 ? -1 : 1) * w * 0.38, w * 0.12, h * 0.3, { sink: 1 });
  } else if (kind === 'pebbles') {
    const n = 2 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const s = 0.4 + r() * 0.6;
      pushBody((i / Math.max(1, n - 1) - 0.5) * w * 0.8 + (r() - 0.5) * 3, Math.max(1.6, h * 0.75 * s + r()),
        Math.max(1.4, h * s), { sink: Math.floor(r() * 2), shadow: false, varnish: 0, lichen: r() < 0.3 ? 0.4 : 0 });
    }
    parts.sort((a, b) => a.y - b.y);
  } else {
    pushBody(0, w * 0.5, h, { lean: o.lean ?? (r() - 0.5) * 0.5, square: o.square });
    // one boulder in three has a chip or two lying at its foot
    if (o.chips !== false && r() < 0.4 && w > 10) {
      pushBody((r() < 0.5 ? -1 : 1) * w * (0.44 + r() * 0.1), Math.max(2, w * 0.08), Math.max(2, h * 0.16),
        { sink: 1 });
    }
  }

  // canvas big enough for every body, with the ground line common to all
  let L = 0, R = 0, T = 0, B = 0;
  for (const pt of parts) {
    L = Math.min(L, pt.x - pt.ox); R = Math.max(R, pt.x - pt.ox + pt.cv.width);
    T = Math.min(T, pt.y - pt.oy); B = Math.max(B, pt.y - pt.oy + pt.cv.height);
  }
  const W = Math.ceil(R - L), H = Math.ceil(B - T);
  const ox = Math.round(-L), oy = Math.round(-T);
  for (const pt of parts) { pt.x += ox; pt.y += oy; }
  const cv = composite(parts, W, H);
  // how tall it really is, and how wide its foot is, measured off the pixels
  const g = cv.getContext('2d');
  const d = g.getImageData(0, 0, W, H).data;
  let top = oy, fl = ox, fr = ox;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] < 128) continue;
      if (y < top) top = y;
      if (Math.abs(y - oy) <= 1) { fl = Math.min(fl, x); fr = Math.max(fr, x); }
    }
  }
  return { cv, ox, oy, w: W, h: H, top: oy - top, foot: Math.max(2, (fr - fl) / 2), footL: ox - fl, footR: fr - ox };
}

// -- hoodoos ------------------------------------------------------------------

function stackParts(o, r, bury) {
  const h = o.h, w = o.w;
  const capH = h * (0.2 + r() * 0.08);
  const pedH = h - capH * 0.72;
  const baseW = w * (0.36 + r() * 0.08);
  const topW = baseW * (0.42 + r() * 0.2);
  const ped = pedestal({ seed: (r() * 4294967296) >>> 0, h: pedH, baseW, topW, bury,
    stone: o.pedestal || (o.stone === 'basalt' ? 'sandstoneBuff' : o.stone === 'limestone' ? 'limestone' : 'sandstoneBuff'),
    dust: o.dust, waist: 0.12 + r() * 0.2 });
  const lean = (r() - 0.5) * 0.3;
  const capStone = o.capStone || (o.stone === 'limestone' ? 'granite' : o.stone === 'sandstoneBuff' ? 'sandstone' : 'basalt');
  const cap = rockBody({ seed: (r() * 4294967296) >>> 0, rw: topW * (1.9 + r() * 0.6), rh: capH,
    bury: 2, sink0: -0.8, stone: capStone, lean, angular: 0.8, dust: o.dust, varnish: 0.9, noBase: true });
  const offs = (r() - 0.5) * topW * 0.4;
  return [
    { cv: ped.cv, ox: ped.ox, oy: ped.oy, x: 0, y: 0, shadow: false },
    { cv: cap.cv, ox: cap.ox, oy: cap.oy, x: offs + ped.topX, y: -pedH + capH * 0.25 },
  ];
}

/** A soft column, banded and waisted, the beds undercut where they are weak. */
function pedestal(o) {
  const S = STONE[o.stone] || STONE.sandstoneBuff;
  const r = mulberry32(o.seed);
  const pad = 3;
  const W = Math.ceil(o.baseW * 2.6) + pad * 2;
  const H = Math.ceil(o.h) + o.bury + pad * 2;
  const cx = W / 2, gy = pad + Math.ceil(o.h);
  const p = new Painter(W, H);
  const seed = o.seed & 65535;
  const beds = [];
  let acc = 0;
  while (acc < o.h + 4) { const t = 3 + r() * 6; beds.push([acc, t, r()]); acc += t; }
  const drift = (r() - 0.5) * o.baseW * 0.3;
  const half = (y) => {
    const v = clamp01((gy - y) / o.h);
    let hw = lerp(o.baseW, o.topW, Math.pow(v, 0.9)) * (1 - o.waist * Math.sin(Math.PI * clamp01(v * 1.05)) ** 2);
    // soft beds are cut back, hard ones stand out as ledges
    const up = gy - y;
    for (const [b0, t, k] of beds) {
      if (up >= b0 && up < b0 + t) {
        const f = (up - b0) / t;
        hw *= k < 0.4 ? 1 - 0.13 * Math.sin(f * Math.PI) : k > 0.8 ? 1.05 : 1;
        break;
      }
    }
    return hw * (1 + (fbmTex(y * 0.15, 3.1, seed, 2) - 0.5) * 0.12);
  };
  p.field(0, pad, W - 1, H - 1, (x, y) => {
    if (y > gy + o.bury + 1) return null;
    const v = clamp01((gy - y) / o.h);
    const c = cx + drift * v * v;
    const hw = half(y);
    const dx = (x - c) / hw;
    if (dx <= -1 || dx >= 1) return null;
    const n = fbmTex(x * 0.25, y * 0.25, seed + 3, 3) - 0.5;
    return { h: hw * 0.9 * Math.sqrt(1 - dx * dx) + n * 1.2 + 0.3, tint: n * 0.14 };
  }, { mat: S.mat });
  p.smoothHeight(1, 0.3);
  const ctx = { W, H, cx, gy, pts: null, x0: cx - o.baseW, x1: cx + o.baseW, y0: gy - o.h, mat: S.mat, S, r, seed: o.seed, bury: o.bury };
  texture(p, ctx, { strata: 1.3, varnish: 0.8 });
  base(p, ctx, { dust: o.dust });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 0.9, outlineColor: S.outline });
  selout(cv, p);
  return { cv, ox: cx, oy: gy, topX: drift };
}

// -- basalt columns -------------------------------------------------------------

function columnParts(o, r, bury) {
  const n = 3 + Math.floor(r() * 3);
  const parts = [];
  const cw = o.w / n;
  // back row first: the tall ones in the middle
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2));
  for (const i of order) {
    const mid = 1 - Math.abs(i - (n - 1) / 2) / n;
    const ch = o.h * (0.45 + mid * 0.5 + (r() - 0.5) * 0.25);
    const b = prism({ seed: (r() * 4294967296) >>> 0, w: cw * (0.9 + r() * 0.25), h: ch, bury: bury + Math.floor(r() * 3),
      stone: o.stone || 'basalt', dust: o.dust, tilt: (r() - 0.5) * 0.08 });
    parts.push({ cv: b.cv, ox: b.ox, oy: b.oy, x: (i - (n - 1) / 2) * cw * 0.92, y: 0, shadow: true });
  }
  return parts;
}

/** One hexagonal prism seen from the side: a lit face, a dark face, a top. */
function prism(o) {
  const S = STONE[o.stone] || STONE.basalt;
  const r = mulberry32(o.seed);
  const pad = 3;
  const W = Math.ceil(o.w) + pad * 2 + 2, H = Math.ceil(o.h) + o.bury + pad * 2 + 3;
  const cx = W / 2, gy = pad + Math.ceil(o.h) + 2;
  const p = new Painter(W, H);
  const hw = o.w / 2;
  const ridge = (r() - 0.5) * 0.3;
  const topSlope = (r() - 0.5) * 0.5;
  const joints = [];
  for (let y = 4 + r() * 8; y < o.h; y += 7 + r() * 10) joints.push(y);
  p.field(0, 0, W - 1, H - 1, (x, y) => {
    const dx = (x - cx) / hw;
    if (dx <= -1 || dx >= 1) return null;
    const topY = gy - o.h + topSlope * dx * hw + (o.tilt || 0) * (gy - y);
    if (y < topY - 1.5 || y > gy + o.bury + 1) return null;
    // two faces meeting at a ridge, and the top of the prism as a third
    const f = dx - ridge;
    let h = (1 - Math.abs(f)) * hw * 0.8 + 1;
    let tint = 0;
    if (y < topY + 1.2) { h += 2.2; tint += 0.18; }
    for (const j of joints) {
      if (Math.abs((gy - y) - j - dx * 1.5) < 0.6) { tint -= 0.35; h -= 0.8; }
    }
    const n = fbmTex(x * 0.3, y * 0.3, o.seed & 4095, 2) - 0.5;
    return { h: h + n, tint: tint + n * 0.12 };
  }, { mat: S.mat });
  const ctx = { W, H, cx, gy, pts: null, x0: cx - hw, x1: cx + hw, y0: gy - o.h, mat: S.mat, S, r, seed: o.seed, bury: o.bury };
  texture(p, ctx, { strata: 0, varnish: 0.3 });
  base(p, ctx, { dust: o.dust });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 0.9, outlineColor: S.outline });
  selout(cv, p);
  return { cv, ox: cx, oy: gy };
}
