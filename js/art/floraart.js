// CRABDEN - plants.
//
// Every plant is grown, not drawn: a stem is traced, branches split off it
// with a seeded angle, and leaves, petals and fruit are hung on the tips. The
// same generator runs at four growth stages, so a bush you planted as a seed
// really is the same bush when it fruits.

import { Painter, makeCanvas } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.6, lightY: -0.62, lightZ: 0.4, ambient: 0.40, dither: 0.72 };

function rng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// leaf and flower parts

function leafShape(p, x, y, ang, len, wid, mat, opts = {}) {
  const steps = Math.max(4, Math.round(len));
  const cs = Math.cos(ang), sn = Math.sin(ang);
  const curl = opts.curl ?? 0;
  const tint = opts.tint ?? 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = wid * Math.pow(Math.sin(Math.pow(t, opts.tipBias ?? 0.75) * Math.PI), opts.fat ?? 0.62);
    if (w < 0.35) continue;
    const d = len * t;
    const bx = x + cs * d - sn * curl * d * t;
    const by = y + sn * d + cs * curl * d * t;
    p.ellipse(bx, by, Math.max(0.6, w * 0.55), Math.max(0.6, w),
      { mat, rot: ang + Math.PI / 2, dome: w * (opts.dome ?? 0.85), tint: tint + (0.5 - t) * 0.12 });
  }
  // midrib
  if (opts.rib !== false) {
    p.capsule(x, y, x + cs * len * 0.92 - sn * curl * len * 0.92,
      y + sn * len * 0.92 + cs * curl * len * 0.92,
      Math.max(0.6, wid * 0.16), 0.5, { mat, mask: true, tint: tint - 0.16, dome: 0 });
  }
}

function petalRing(p, cx, cy, n, r, len, wid, mat, seed, tilt = 0) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.2;
    // seen from the side: the ring squashes vertically
    const sx = Math.cos(a), sy = Math.sin(a) * 0.42;
    const ang = Math.atan2(sy, sx) + tilt;
    const back = sy < 0;
    leafShape(p, cx + sx * r, cy + sy * r, ang, len * (back ? 0.82 : 1), wid, mat,
      { tint: back ? -0.22 : 0.06, fat: 0.5, dome: 0.5, rib: false, curl: (R() - 0.5) * 0.3 });
  }
}

function berryCluster(p, x, y, n, r, mat, seed) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = R() * r * 1.7;
    const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d * 0.8;
    p.ellipse(bx, by, r, r, { mat, dome: r * 1.3, tint: 0.02 });
    p.ellipse(bx - r * 0.32, by - r * 0.34, r * 0.28, r * 0.24, { mat, mask: true, dome: r, tint: 0.55 });
  }
}

// ---------------------------------------------------------------------------
// archetypes. each returns nothing; it paints into `p` with the base at (x, y0)

const ARCH = {
  /** Low clumped mat - the first thing that will grow on wet rock. */
  moss(p, D, g, R) {
    const K = D.k || 1;
    const w = D.w * g, h = D.h * g;
    const n = Math.round(9 + 26 * g);
    for (let i = 0; i < n; i++) {
      const t = R();
      const bx = D.x + (R() - 0.5) * w;
      const lift = Math.pow(1 - Math.abs((bx - D.x) / (w * 0.5 + 0.01)), 0.7);
      const by = D.y - R() * h * 0.45 * lift;
      const r = (0.9 + R() * 1.5) * (0.5 + g * 0.6) * K;
      p.ellipse(bx, by, r * 1.3, r, {
        mat: D.mat, dome: r * 1.5, tint: (t - 0.5) * 0.34 + lift * 0.12,
      });
    }
    // a few upright shoots
    const sh = Math.round(3 + 9 * g);
    for (let i = 0; i < sh; i++) {
      const bx = D.x + (R() - 0.5) * w * 0.9;
      const len = ((1.6 + R() * 3.2) * g + 1) * K;
      p.capsule(bx, D.y, bx + (R() - 0.5) * 1.6 * K, D.y - len, 0.75 * K, 0.4 * K,
        { mat: D.mat2 || D.mat, dome: 0.7, tint: 0.14 });
    }
  },

  /** Blade grass: a fan of tapering leaves. */
  grass(p, D, g, R) {
    const K = D.k || 1;
    const n = Math.round(4 + 12 * g);
    const h = D.h * g;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const lean = (t - 0.5) * 2;
      const bx = D.x + lean * D.w * 0.22 * g;
      const len = h * (0.55 + R() * 0.55);
      const ang = -Math.PI / 2 + lean * (0.5 + R() * 0.4);
      const bend = 0.5 + R() * 0.7;
      p.curve([
        { x: bx, y: D.y },
        { x: bx + Math.cos(ang) * len * 0.6, y: D.y + Math.sin(ang) * len * 0.6 },
        { x: bx + Math.cos(ang) * len + lean * len * bend * 0.6, y: D.y + Math.sin(ang) * len * 0.86 },
      ], 1.15 * (0.6 + g * 0.5) * K, 0.35 * K, {
        mat: D.mat, dome: 1.0, steps: 12, tint: (R() - 0.5) * 0.26 + (Math.abs(lean) > 0.6 ? -0.1 : 0.06),
      });
    }
    if (D.seedHead && g > 0.6) {
      for (let i = 0; i < 3; i++) {
        const bx = D.x + (R() - 0.5) * D.w * 0.3;
        const ty = D.y - h * (0.75 + R() * 0.25);
        p.capsule(bx, D.y, bx, ty, 0.8 * K, 0.6 * K, { mat: D.mat, dome: 0.7 * K, tint: -0.05 });
        for (let k = 0; k < 7; k++) {
          p.ellipse(bx + (R() - 0.5) * 2.4 * K, ty + k * 1.1 * K, 1.0 * K, 0.7 * K,
            { mat: D.seedMat || 'leafDry', dome: 1.0 * K, tint: (R() - 0.5) * 0.3 + 0.08 });
        }
      }
    }
  },

  /** Fern: paired pinnate fronds arching from a crown. */
  fern(p, D, g, R) {
    const K = D.k || 1;
    const n = Math.round(2 + 3 * g);
    const h = D.h * g;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const lean = (t - 0.5) * 2 + (R() - 0.5) * 0.3;
      const len = h * (0.78 + R() * 0.28);
      const tipx = D.x + lean * len * 0.44, tipy = D.y - len;
      const midx = D.x + lean * len * 0.09, midy = D.y - len * 0.56;
      p.curve([{ x: D.x, y: D.y }, { x: midx, y: midy }, { x: tipx, y: tipy }], 1.0 * K, 0.4 * K,
        { mat: D.stemMat || 'wood', dome: 0.9 * K, steps: 14, tint: -0.10 });
      const seg = Math.round(4 + 5 * g);
      for (let k = 1; k <= seg; k++) {
        const s = k / (seg + 0.5), u = 1 - s;
        const px = u * u * D.x + 2 * u * s * midx + s * s * tipx;
        const py = u * u * D.y + 2 * u * s * midy + s * s * tipy;
        const tx = 2 * u * (midx - D.x) + 2 * s * (tipx - midx);
        const ty = 2 * u * (midy - D.y) + 2 * s * (tipy - midy);
        const base = Math.atan2(ty, tx);
        const ll = ((1.7 + 3.4 * g) * (1 - s * 0.60) + 1) * (0.85 + R() * 0.3) * K;
        for (const sgn of [-1, 1]) {
          leafShape(p, px, py, base + sgn * 0.98, ll, ll * 0.34, D.mat,
            { tint: sgn > 0 ? 0.08 : -0.16, fat: 0.5, tipBias: 0.6, curl: sgn * 0.30, rib: false });
        }
      }
    }
  },

  /** Woody bush: recursive branching with leaf clusters and fruit. */
  bush(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g, w = D.w * g;
    const tips = [];
    const branch = (x, y, ang, len, r, depth) => {
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      const mx = x + Math.cos(ang + (R() - 0.5) * 0.4) * len * 0.55;
      const my = y + Math.sin(ang) * len * 0.55;
      p.curve([{ x, y }, { x: mx, y: my }, { x: ex, y: ey }], r, r * 0.62,
        { mat: D.stemMat || 'wood', dome: r * 0.9, steps: 8, tint: -0.06 + depth * 0.04 });
      if (depth >= (D.depth ?? 3) || len < 3 * K) { tips.push({ x: ex, y: ey, ang, r }); return; }
      const spread = (D.spread ?? 0.62) * (0.7 + R() * 0.6);
      const kids = R() > 0.72 ? 3 : 2;
      for (let i = 0; i < kids; i++) {
        const f = kids === 1 ? 0 : (i / (kids - 1) - 0.5) * 2;
        branch(ex, ey, ang + f * spread + (R() - 0.5) * 0.25,
          len * (0.62 + R() * 0.2), Math.max(0.6 * K, r * 0.66), depth + 1);
      }
    };
    const trunks = D.trunks ?? 3;
    for (let i = 0; i < trunks; i++) {
      const f = trunks === 1 ? 0 : (i / (trunks - 1) - 0.5) * 2;
      branch(D.x + f * w * 0.10, D.y, -Math.PI / 2 + f * 0.42, h * (0.34 + R() * 0.12),
        Math.max(0.8 * K, 1.6 * (0.5 + g * 0.7) * K), 0);
    }
    // foliage
    const lf = Math.round(2 + 4 * g);
    for (const t of tips) {
      for (let i = 0; i < lf; i++) {
        const a = t.ang + (R() - 0.5) * 1.9;
        const ll = (2.4 + 4.0 * g) * (0.65 + R() * 0.6) * K;
        leafShape(p, t.x + (R() - 0.5) * 1.5 * K, t.y + (R() - 0.5) * 1.5 * K, a, ll, ll * (D.leafW ?? 0.5),
          D.mat, { tint: (R() - 0.5) * 0.28, curl: (R() - 0.5) * 0.5, fat: D.leafFat ?? 0.6 });
      }
    }
    if (D.fruitMat && g > 0.55) {
      const fn = Math.round((D.fruit ?? 4) * (g - 0.4) * 1.7);
      for (let i = 0; i < fn; i++) {
        const t = tips[Math.floor(R() * tips.length)];
        if (!t) break;
        berryCluster(p, t.x + (R() - 0.5) * 3 * K, t.y + R() * 2.4 * K,
          1 + Math.floor(R() * 3), (D.fruitR ?? 1.5) * (0.7 + g * 0.5) * K, D.fruitMat, (i * 977) | 0);
      }
    }
  },

  /** Single stem carrying a flower head. */
  flower(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g;
    const n = D.stems ?? 1;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
      const bx = D.x + f * D.w * 0.18 * g;
      const lean = f * 0.30 + (R() - 0.5) * 0.2;
      const th = h * (0.8 + R() * 0.35);
      const tx = bx + Math.sin(lean) * th * 0.5, ty = D.y - th;
      p.curve([{ x: bx, y: D.y }, { x: bx + Math.sin(lean) * th * 0.18, y: D.y - th * 0.55 },
        { x: tx, y: ty }], 1.25 * (0.6 + g * 0.5) * K, 0.7 * K,
        { mat: D.stemMat || 'leaf', dome: 1.0 * K, steps: 12, tint: -0.06 });
      // basal leaves
      for (let k = 0; k < 2 + Math.round(g * 2); k++) {
        const a = -0.25 + (k % 2 ? 1 : -1) * (0.8 + R() * 0.5);
        leafShape(p, bx, D.y - h * 0.06 - k * 1.2 * K, a, h * (0.22 + R() * 0.2), h * 0.09 + 1.2 * K,
          D.leafMat || 'leaf', { tint: (R() - 0.5) * 0.2, curl: (k % 2 ? 1 : -1) * 0.35 });
      }
      if (g > 0.45) {
        const pr = (D.headR ?? 3) * (0.5 + g * 0.7) * K;
        petalRing(p, tx, ty, D.petals ?? 6, pr * 0.55, pr * 1.5, pr * 0.6, D.mat, (i * 31 + 7) | 0, lean);
        p.ellipse(tx, ty, pr * 0.55, pr * 0.42, { mat: D.coreMat || 'fruitGold', dome: pr * 0.8, tint: 0.08 });
        p.speckle(D.coreMat || 'fruitGold', { density: 0.3, amp: 0.45, seed: 9 });
      } else {
        p.ellipse(tx, ty, 1.6 * K, 2.2 * K, { mat: D.stemMat || 'leaf', dome: 1.6 * K, tint: 0.05 });
      }
    }
  },

  /** Tree: a real trunk, a lit canopy and hanging fruit. */
  tree(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g, w = D.w * g;
    const tips = [];
    const branch = (x, y, ang, len, r, depth) => {
      const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      p.curve([{ x, y }, { x: x + Math.cos(ang - 0.16) * len * 0.55, y: y + Math.sin(ang) * len * 0.55 },
        { x: ex, y: ey }], r, r * 0.66,
        { mat: D.stemMat || 'wood', dome: r * 0.95, steps: 10, tint: -0.04 });
      if (depth >= (D.depth ?? 3) || len < 3.5 * K) { tips.push({ x: ex, y: ey, ang, r }); return; }
      for (let i = 0; i < 2; i++) {
        const f = i === 0 ? -1 : 1;
        branch(ex, ey, ang + f * (0.42 + R() * 0.35), len * (0.66 + R() * 0.16),
          Math.max(0.7 * K, r * 0.64), depth + 1);
      }
    };
    const tr = Math.max(1.2 * K, w * 0.075 * (0.5 + g * 0.8));
    branch(D.x, D.y, -Math.PI / 2 + (R() - 0.5) * 0.18, h * 0.40, tr, 0);
    p.grain(D.stemMat || 'wood', { freq: 0.7, amp: 0.2, seed: 12 });
    // root flare
    for (let i = 0; i < 4; i++) {
      const f = (i / 3 - 0.5) * 2;
      p.capsule(D.x, D.y - tr * 1.2, D.x + f * tr * 2.2, D.y + 0.6, tr * 0.55, tr * 0.3,
        { mat: D.stemMat || 'wood', dome: tr * 0.5, tint: -0.1 });
    }
    const lf = Math.round(3 + 7 * g);
    for (const t of tips) {
      for (let i = 0; i < lf; i++) {
        const a = t.ang + (R() - 0.5) * 2.2;
        const ll = (2.6 + 5.4 * g) * (0.6 + R() * 0.7) * K;
        leafShape(p, t.x + (R() - 0.5) * 2.4 * K, t.y + (R() - 0.5) * 2.4 * K, a, ll, ll * (D.leafW ?? 0.46),
          D.mat, { tint: (R() - 0.5) * 0.3, curl: (R() - 0.5) * 0.55, fat: D.leafFat ?? 0.6 });
      }
    }
    if (D.fruitMat && g > 0.6) {
      for (let i = 0; i < Math.round((D.fruit ?? 5) * (g - 0.5) * 2); i++) {
        const t = tips[Math.floor(R() * tips.length)];
        if (!t) break;
        berryCluster(p, t.x + (R() - 0.5) * 3 * K, t.y + (1 + R() * 3) * K, 1 + Math.floor(R() * 2),
          (D.fruitR ?? 1.8) * (0.7 + g * 0.5) * K, D.fruitMat, (i * 613) | 0);
      }
    }
  },

  /** Succulent: fat water-holding pads. */
  succulent(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g, w = D.w * g;
    const n = Math.round(4 + 8 * g);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n - 0.5) * 2.6 + (R() - 0.5) * 0.3;
      const len = h * (0.45 + R() * 0.55);
      const wd = len * (0.30 + R() * 0.14);
      leafShape(p, D.x + (R() - 0.5) * w * 0.12, D.y - h * 0.04, a, len, wd, D.mat, {
        tint: (R() - 0.5) * 0.22 + 0.04, fat: 0.9, tipBias: 0.6, dome: 1.15,
        curl: (R() - 0.5) * 0.25, rib: false,
      });
    }
    p.speckle(D.mat, { density: 0.09, amp: 0.3, seed: 33 });
    if (D.fruitMat && g > 0.7) {
      berryCluster(p, D.x, D.y - h * 0.85, 3, (D.fruitR ?? 1.6) * K, D.fruitMat, 71);
    }
  },

  /** Fungus: a stalk with a domed cap and gills. */
  fungus(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g;
    const n = D.stems ?? 3;
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
      const bx = D.x + f * D.w * 0.30 * g;
      const sh = h * (0.5 + R() * 0.6);
      const lean = f * 0.22;
      const tx = bx + Math.sin(lean) * sh * 0.5, ty = D.y - sh;
      p.curve([{ x: bx, y: D.y }, { x: bx, y: D.y - sh * 0.6 }, { x: tx, y: ty }],
        1.5 * (0.5 + g * 0.6) * K, 1.1 * K, { mat: D.stemMat || 'bone', dome: 1.4 * K, steps: 10, tint: 0.04 });
      const cr = sh * (0.42 + R() * 0.2);
      p.ellipse(tx, ty, cr, cr * 0.72, { mat: D.mat, dome: cr * 0.95, tint: 0.03 });
      // the underside is shadow and gills
      p.field(tx - cr, ty, tx + cr, ty + cr * 0.8, (x, y) => {
        const dx = (x - tx) / cr, dy = (y - ty) / (cr * 0.62);
        if (dx * dx + dy * dy > 1 || dy < 0) return null;
        const gl = Math.sin(dx * 11) * 0.5 + 0.5;
        return { h: -1.5, tint: -0.50 + gl * 0.14 };
      }, { mat: D.gillMat || 'petalWhite' });
      p.speckle(D.mat, { density: 0.08, amp: 0.4, seed: 17 + i });
    }
  },

  /** Trailing vine: hangs down over whatever it grows on. */
  vine(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g, w = D.w * g;
    const n = Math.round(2 + 4 * g);
    for (let i = 0; i < n; i++) {
      const bx = D.x + (R() - 0.5) * w * 0.7;
      const len = h * (0.5 + R() * 0.6);
      const sway = (R() - 0.5) * w * 0.5;
      const pts = [{ x: bx, y: D.y }, { x: bx + sway, y: D.y + len * 0.55 }, { x: bx + sway * 0.4, y: D.y + len }];
      p.curve(pts, 1.0 * K, 0.5 * K, { mat: D.stemMat || 'wood', dome: 0.9 * K, steps: 14, tint: -0.08 });
      const seg = Math.round(2 + 4 * g);
      for (let k = 1; k <= seg; k++) {
        const s = k / (seg + 1), u = 1 - s;
        const px = u * u * pts[0].x + 2 * u * s * pts[1].x + s * s * pts[2].x;
        const py = u * u * pts[0].y + 2 * u * s * pts[1].y + s * s * pts[2].y;
        const ll = (3.4 + 5.2 * g) * (0.75 + R() * 0.45) * K;
        const side = (k & 1) ? 0.42 : 2.72;
        leafShape(p, px, py, side + (R() - 0.5) * 0.4, ll, ll * 0.42, D.mat,
          { tint: (k & 1) ? 0.06 : -0.14, curl: ((k & 1) ? 1 : -1) * 0.42, tipBias: 0.65 });
      }
      if (D.fruitMat && g > 0.65) {
        berryCluster(p, pts[2].x, pts[2].y - 1, 2 + Math.floor(R() * 2), (D.fruitR ?? 1.4) * K, D.fruitMat, i * 97);
      }
    }
  },

  /** Reed: tall straight stalks, needs standing water. */
  reed(p, D, g, R) {
    const K = D.k || 1;
    const h = D.h * g;
    const n = Math.round(3 + 7 * g);
    for (let i = 0; i < n; i++) {
      const f = (i / Math.max(1, n - 1) - 0.5) * 2;
      const bx = D.x + f * D.w * 0.3;
      const th = h * (0.6 + R() * 0.5);
      const lean = f * 0.22 + (R() - 0.5) * 0.14;
      const tx = bx + Math.sin(lean) * th * 0.55, ty = D.y - th;
      p.curve([{ x: bx, y: D.y }, { x: bx + Math.sin(lean) * th * 0.2, y: D.y - th * 0.6 }, { x: tx, y: ty }],
        1.1 * K, 0.5 * K, { mat: D.mat, dome: 1.0 * K, steps: 12, tint: (R() - 0.5) * 0.2 });
      for (let k = 0; k < 2; k++) {
        const s = 0.35 + k * 0.28;
        leafShape(p, lerp(bx, tx, s), lerp(D.y, ty, s), (k % 2 ? 0.5 : 2.5) - 0.9, th * 0.4, 1.6 * K,
          D.mat, { tint: -0.08, curl: (k % 2 ? 1 : -1) * 0.5 });
      }
      if (g > 0.7 && D.seedMat) {
        p.capsule(tx, ty, tx, ty + th * 0.14, 1.5 * K, 1.2 * K, { mat: D.seedMat, dome: 1.4 * K, tint: 0.06 });
      }
    }
  },
};

// ---------------------------------------------------------------------------

const cache = new Map();

/**
 * Bake one plant. `def` is a flora definition, `stage` 0..3.
 * Returns { cv, ox, oy, w, h } with the origin at the base of the stem.
 */
export function buildPlant(def, stage = 3, variant = 0, size = 1, dark = 0) {
  const K = Math.round(size * 20) / 20;
  const key = `${def.id}|${stage}|${variant}|${K}|${dark}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const g = [0.16, 0.40, 0.70, 1][clamp(stage, 0, 3)];
  const w = Math.ceil(def.w * g * K) + Math.ceil(14 * K) + 4;
  const h = Math.ceil(def.h * g * K * (def.arch === 'vine' ? 1.15 : 1)) + Math.ceil(12 * K) + 4;
  const p = new Painter(w, h);
  const ox = Math.round(w / 2);
  const oy = def.arch === 'vine' ? 8 : h - 7;
  const R = rng((def.seed || 1) * 7919 + variant * 131 + stage * 17);
  const D = { ...def, x: ox, y: oy, w: def.w * K, h: def.h * K, k: K };
  (ARCH[def.arch] || ARCH.bush)(p, D, g, R);
  p.smoothHeight(1, 0.35);
  let cv = p.resolve(MATERIALS, {
    ...LIGHT, outline: def.outline ?? 0.9, outlineColor: def.outlineColor || '#12180d',
  });
  if (dark > 0) {
    // a copy pushed toward the shadow side, for plants on the far flank
    const c2 = makeCanvas(cv.width, cv.height);
    const g2 = c2.getContext('2d');
    g2.imageSmoothingEnabled = false;
    g2.drawImage(cv, 0, 0);
    g2.globalCompositeOperation = 'source-atop';
    g2.globalAlpha = dark;
    g2.fillStyle = '#22303a';
    g2.fillRect(0, 0, cv.width, cv.height);
    cv = c2;
  }
  const out = { cv, ox, oy, w, h, g };
  cache.set(key, out);
  return out;
}

export function clearFloraCache() { cache.clear(); }
