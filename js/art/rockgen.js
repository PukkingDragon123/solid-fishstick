// CRABDEN - rock, the way the sea leaves it.
//
// A pile of ellipses shaded one at a time reads as a stack of beads. Rock
// does not: it is one mass with a rough edge, rounded where the water has
// worked at it, flat where it has broken, banded where it was laid down. So a
// formation is built as a FIELD - every primitive adds to a potential, the
// potentials are merged smoothly, noise roughens the edge - and its height is
// taken from how far each pixel is from the edge of the mass, not from the
// primitive it came from. Lit from above, that gives one lump of stone with a
// bright top, dark undersides, ledges and cracks.
//
// The output goes straight into a Painter's buffers, so whatever grows on the
// rock can be painted on afterwards with the ordinary primitives and the whole
// thing resolved in one pass.

import { hash2i } from '../render/pixel.js';

// One tileable sheet of fractal noise, made once and then looked up: a rock
// face wants a dozen octaves of noise per pixel and computing them fresh for
// four screens of rock is most of a second.
const NS = 256;
let NT = null;
function noiseSheet() {
  if (NT) return NT;
  NT = new Float32Array(NS * NS);
  const lattice = (P, s) => {
    const g = new Float32Array(P * P);
    for (let i = 0; i < P * P; i++) g[i] = hash2i(i % P, (i / P) | 0, s);
    return g;
  };
  const octs = [[8, 0.5], [16, 0.26], [32, 0.14], [64, 0.1]];
  for (const [P, wgt] of octs) {
    const g = lattice(P, P * 131);
    const k = P / NS;
    for (let y = 0; y < NS; y++) {
      const fy = y * k, yi = Math.floor(fy), ty = fy - yi, sy = ty * ty * (3 - 2 * ty);
      const y0 = (yi % P) * P, y1 = ((yi + 1) % P) * P;
      for (let x = 0; x < NS; x++) {
        const fx = x * k, xi = Math.floor(fx), tx = fx - xi, sx = tx * tx * (3 - 2 * tx);
        const x0 = xi % P, x1 = (xi + 1) % P;
        const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
        NT[y * NS + x] += wgt * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
  }
  return NT;
}
/** Fractal noise in 0..1 at (x, y) on a sheet `scale` pixels to a cell. */
export function nz(x, y, scale, seed = 0) {
  const T = NT || noiseSheet();
  const fx = x / scale * 32 + seed * 37.3, fy = y / scale * 32 + seed * 91.7;
  const xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi;
  const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) * NS, y1 = ((yi + 1) & 255) * NS;
  const a = T[y0 + x0], b = T[y0 + x1], c = T[y1 + x0], d = T[y1 + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/**
 * Primitives, all in pixel coordinates:
 *   { k: 'ell', x, y, rx, ry, rot }        an ellipse
 *   { k: 'cap', x0, y0, x1, y1, r0, r1 }   a tapered capsule
 *   { k: 'bld', x, y, r, sq, seed }        a boulder: a lumpy, squashed disc
 *   { k: 'slab', x, y, w, h, r }           a rounded slab
 *   { k: 'hole', x, y, rx, ry }            a hole cut through (arches, caves)
 */
function potential(pr, x, y) {
  switch (pr.k) {
    case 'ell': {
      const dx = x - pr.x, dy = y - pr.y;
      const c = pr.cs ?? 1, s = pr.sn ?? 0;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      return 1 - Math.sqrt((lx / pr.rx) ** 2 + (ly / pr.ry) ** 2);
    }
    case 'cap': {
      const vx = pr.x1 - pr.x0, vy = pr.y1 - pr.y0;
      const l2 = vx * vx + vy * vy || 1;
      let t = ((x - pr.x0) * vx + (y - pr.y0) * vy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - pr.x0 - vx * t, y - pr.y0 - vy * t);
      return 1 - d / (pr.r0 + (pr.r1 - pr.r0) * t);
    }
    case 'bld': {
      const dx = x - pr.x, dy = (y - pr.y) / (pr.sq || 0.8);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > pr.r * 1.25) return -1;
      // the lumpy outline, looked up by a cheap angle rather than atan2
      const ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
      const q = ax + ay || 1;
      const da = dy >= 0 ? (dx >= 0 ? dy / q : 2 - dy / q) : (dx < 0 ? 2 - dy / q : 4 + dy / q);
      const tab = pr.tab || (pr.tab = lumpTable(pr.seed || 0));
      const f = da * 16, i0 = f | 0, t = f - i0;
      const rr = pr.r * (tab[i0 & 63] + (tab[(i0 + 1) & 63] - tab[i0 & 63]) * t);
      return 1 - d / rr;
    }
    case 'slab': {
      const qx = Math.abs(x - pr.x) - pr.w / 2 + pr.r, qy = Math.abs(y - pr.y) - pr.h / 2 + pr.r;
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - pr.r;
      return -out / Math.max(4, Math.min(pr.w, pr.h) * 0.5);
    }
    case 'hole': {
      return Math.sqrt(((x - pr.x) / pr.rx) ** 2 + ((y - pr.y) / pr.ry) ** 2) - 1;
    }
    default: return -1;
  }
}

function lumpTable(s) {
  const t = new Float32Array(64);
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    t[k] = 1 + 0.1 * Math.sin(a * 2 + s) + 0.07 * Math.sin(a * 3 + s * 1.7) + 0.05 * Math.sin(a * 5 + s * 2.3);
  }
  return t;
}

function bbox(pr) {
  switch (pr.k) {
    case 'ell': { const r = Math.max(pr.rx, pr.ry); return [pr.x - r, pr.y - r, pr.x + r, pr.y + r]; }
    case 'cap': { const r = Math.max(pr.r0, pr.r1); return [Math.min(pr.x0, pr.x1) - r, Math.min(pr.y0, pr.y1) - r, Math.max(pr.x0, pr.x1) + r, Math.max(pr.y0, pr.y1) + r]; }
    case 'bld': { const r = pr.r * 1.25; return [pr.x - r, pr.y - r, pr.x + r, pr.y + r]; }
    case 'slab': return [pr.x - pr.w / 2, pr.y - pr.h / 2, pr.x + pr.w / 2, pr.y + pr.h / 2];
    case 'hole': return [pr.x - pr.rx, pr.y - pr.ry, pr.x + pr.rx, pr.y + pr.ry];
    default: return [0, 0, 0, 0];
  }
}

/**
 * Lay a rock mass into a Painter. `prims` are merged; `o` carries the
 * material name, the noise, and how the height is shaped.
 *
 *   rough    how much the edge is broken up (0..1)
 *   crag     the scale of the breaks, in pixels
 *   round    how many pixels in from the edge the rounding reaches
 *   relief   the height of the rounded part
 *   strata   pixels between ledges (0 for none)
 *   cracks   how many cracks
 */
export function rockMass(p, prims, o = {}) {
  const { w, h } = p;
  const pot = new Float32Array(w * h).fill(-9);
  const holes = [];
  for (const pr of prims) {
    if (pr.k === 'ell' && pr.rot) { pr.cs = Math.cos(pr.rot); pr.sn = Math.sin(pr.rot); }
    if (pr.k === 'hole') {
      pr.bx0 = pr.x - pr.rx * 1.3; pr.bx1 = pr.x + pr.rx * 1.3; pr.by0 = pr.y - pr.ry * 1.3; pr.by1 = pr.y + pr.ry * 1.3;
      if (pr.bx1 >= 0 && pr.bx0 < w) holes.push(pr);
      continue;
    }
    const [x0, y0, x1, y1] = bbox(pr);
    const xa = Math.max(0, Math.floor(x0) - 1), xb = Math.min(w - 1, Math.ceil(x1) + 1);
    const ya = Math.max(0, Math.floor(y0) - 1), yb = Math.min(h - 1, Math.ceil(y1) + 1);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        const v = potential(pr, x + 0.5, y + 0.5);
        if (v < -0.8) continue;
        const i = y * w + x;
        // a smooth union: where two primitives meet they fill the crease in
        const a = pot[i];
        if (a < -1) { pot[i] = v; continue; }
        const k = 0.18;
        const hh = Math.max(k - Math.abs(a - v), 0) / k;
        pot[i] = Math.max(a, v) + hh * hh * k * 0.25;
      }
    }
  }
  const seed = o.seed || 1;
  const rough = o.rough ?? 0.5, crag = o.crag ?? 18;
  const mat = p._mid(o.mat || 'rock');
  const cov = new Uint8Array(w * h);
  const yMax = o.floor ?? h;                    // nothing below the ground line
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = pot[i];
      if (v < -0.75) continue;
      // the broken edge: big notches and small grit
      v += (nz(x, y, crag, seed) - 0.5) * rough * 0.9 + (nz(x, y, crag * 0.3, seed + 7) - 0.5) * rough * 0.35;
      for (const ho of holes) {
        if (x < ho.bx0 || x > ho.bx1 || y < ho.by0 || y > ho.by1) continue;
        const hv = potential(ho, x + 0.5, y + 0.5) + (nz(x, y, 7, seed + 3) - 0.5) * 0.4;
        if (hv < 0) v = Math.min(v, hv);
      }
      if (v > 0 && y < yMax && !(o.under && p.mat[i])) cov[i] = 1;
    }
  }
  // distance in from the edge, two-pass chamfer
  const INF = 1e6;
  const dt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dt[i] = cov[i] ? INF : 0;
  const c1 = 1, c2 = 1.414;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dt[i]) continue;
      let m = dt[i];
      if (x > 0) m = Math.min(m, dt[i - 1] + c1); else m = Math.min(m, c1);
      if (y > 0) {
        m = Math.min(m, dt[i - w] + c1);
        if (x > 0) m = Math.min(m, dt[i - w - 1] + c2);
        if (x < w - 1) m = Math.min(m, dt[i - w + 1] + c2);
      } else m = Math.min(m, c1);
      dt[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dt[i]) continue;
      let m = dt[i];
      if (x < w - 1) m = Math.min(m, dt[i + 1] + c1); else m = Math.min(m, c1);
      if (y < h - 1) {
        // the ground the rock stands on is not an edge
        m = Math.min(m, dt[i + w] + c1);
        if (x < w - 1) m = Math.min(m, dt[i + w + 1] + c2);
        if (x > 0) m = Math.min(m, dt[i + w - 1] + c2);
      } else if (!o.grounded) m = Math.min(m, c1);
      dt[i] = m;
    }
  }
  const round = o.round ?? 7, relief = o.relief ?? 6;
  const strata = o.strata || 0;
  const cracks = [];
  for (let k = 0; k < (o.cracks || 0); k++) cracks.push({ s: seed * 13 + k * 101 });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!cov[i]) continue;
      const d = dt[i];
      let hh = relief * Math.pow(Math.min(1, d / round), 0.6);
      // the face itself is not flat: big shallow facets and small grit
      hh += (nz(x, y, 9, seed + 11) - 0.5) * relief * 0.7;
      let tint = (nz(x, y, 30, seed + 17) - 0.5) * 0.12;
      if (strata && d > 2.5) {
        const sy = y + (nz(x, y, 40, seed + 23) - 0.5) * strata * 1.2;
        const ph = ((sy % strata) + strata) % strata;
        if (ph < 1) { tint += 0.1; hh += 0.6; }
        else if (ph < 2.6) { tint -= 0.12; hh -= 0.8; }
      }
      if (cracks.length && d > 2) {
        const n = nz(x, y * 0.75, 16, seed + 31);
        if (Math.abs(n - 0.5) < 0.012) { tint -= 0.22; hh -= 1.5; }
      }
      if (hash2i(x, y, seed + 41) > 0.985) tint += 0.08;
      p.mat[i] = mat;
      p.cov[i] = 1;
      p.hgt[i] = hh + (o.lift || 0);
      p.tint[i] = tint + (o.tint || 0);
    }
  }
  return { cov, dt };
}

/** The topmost rock pixel in a column, or -1. */
export function topOf(p, x, matName = 'rock') {
  const m = p._matIndex.get(matName);
  if (m === undefined || x < 0 || x >= p.w) return -1;
  for (let y = 0; y < p.h; y++) if (p.mat[y * p.w + x] === m) return y;
  return -1;
}
