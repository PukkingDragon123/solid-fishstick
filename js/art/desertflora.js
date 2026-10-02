// CRABDEN - what grows out here, and what grows at the water.
//
// Desert plants are not lollipops. A creosote bush is forty thin grey stems
// with a haze of tiny olive leaves at the ends and bare wood underneath; a
// saltbush is a silver cushion; a prickly pear is a stack of pads with the
// spines in rows; an ocotillo is a fistful of whips. Each of those silhouettes
// is what makes the plant readable at a glance, so each one is built the way
// the plant is built - stems first, then what the stems carry - and lit by
// the same sun as the rocks.
//
// The oasis gets its own: date palms with ringed trunks and drooping fronds
// (baked in several wind poses, so the crown sways without a single pixel
// being resampled), cattails, papyrus, reeds and lily pads.
//
// Every function returns { cv, ox, oy, ... } with (ox, oy) the point where
// the plant meets the ground, and pixels below oy that the ground hides.

import { Painter, makeCanvas, fbmTex, hash2i } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, mulberry32, TAU } from '../lib/math.js';
import { selout } from './rockart.js';

const LIGHT = { lightX: -0.6, lightY: -0.66, lightZ: 0.42, ambient: 0.32, dither: 0.4 };

function finish(p, ox, oy, extra = {}, light = {}) {
  p.smoothHeight(1, 0.25);
  const cv = p.resolve(MATERIALS, { ...LIGHT, ...light, outline: 0.9, outlineColor: light.outlineColor || '#11140c' });
  selout(cv, p, 0.55, 0.28);
  return { cv, ox, oy, ...extra };
}

/** A quadratic curve's point and tangent. */
function quad(a, b, c, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    tx: 2 * u * (b.x - a.x) + 2 * t * (c.x - b.x),
    ty: 2 * u * (b.y - a.y) + 2 * t * (c.y - b.y),
  };
}

// ---------------------------------------------------------------------------
// shrubs

/**
 * Creosote: a vase of slender grey stems, bare low down, with the leaves in
 * small dark-olive clusters toward the ends. Airy - you can see through it.
 */
export function creosote(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (16 + r() * 16) * s, w = h * (1.1 + r() * 0.4);
  const W = Math.ceil(w * 1.3) + 10, H = Math.ceil(h * 1.15) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const tips = [];
  const n = 9 + Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1) - 0.5) * 2;
    const a = -Math.PI / 2 + f * (0.62 + r() * 0.25);
    const len = h * (0.55 + r() * 0.45) * (1 - Math.abs(f) * 0.25);
    const bx = ox + f * 2 * s;
    const ex = bx + Math.cos(a) * len, ey = oy + Math.sin(a) * len;
    const mx = lerp(bx, ex, 0.5) + (r() - 0.5) * 3 * s, my = lerp(oy, ey, 0.5);
    p.curve([{ x: bx, y: oy + 2 }, { x: mx, y: my }, { x: ex, y: ey }], 0.62 * s + 0.1, 0.38,
      { mat: 'ocotillo', dome: 0.7, steps: 10, tint: 0.04 + (r() - 0.5) * 0.14 });
    // a fork or two near the top
    const forks = 1 + Math.floor(r() * 2);
    for (let k = 0; k < forks; k++) {
      const t = 0.55 + r() * 0.3;
      const q = quad({ x: bx, y: oy }, { x: mx, y: my }, { x: ex, y: ey }, t);
      const fa = a + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5);
      const fl = len * (0.25 + r() * 0.25);
      p.capsule(q.x, q.y, q.x + Math.cos(fa) * fl, q.y + Math.sin(fa) * fl, 0.45, 0.32,
        { mat: 'ocotillo', dome: 0.5, tint: 0.02 });
      tips.push({ x: q.x + Math.cos(fa) * fl, y: q.y + Math.sin(fa) * fl, d: 0.8 });
    }
    tips.push({ x: ex, y: ey, d: 1 });
    // leaves down the top third of the stem, thinning out
    for (let k = 0; k < 2; k++) {
      const q = quad({ x: bx, y: oy }, { x: mx, y: my }, { x: ex, y: ey }, 0.66 + k * 0.14);
      tips.push({ x: q.x, y: q.y, d: 0.35 + k * 0.2 });
    }
  }
  // the leaf clusters: small, separate, lit on top, darker inside the bush -
  // with sky showing between them, which is what a creosote looks like
  for (const t of tips) {
    const m = Math.round(2 + t.d * 3);
    for (let k = 0; k < m; k++) {
      const lx = t.x + (r() - 0.5) * 3.6 * s, ly = t.y + (r() - 0.5) * 2.6 * s;
      const inner = clamp01(1 - Math.abs(lx - ox) / (w * 0.5)) * clamp01((ly - (oy - h)) / h);
      const rr = (0.55 + r() * 0.5) * Math.max(0.8, s);
      p.ellipse(lx, ly, rr * 1.25, rr, { mat: 'creosote', dome: rr * 1.3,
        tint: (r() - 0.5) * 0.32 - inner * 0.3 + 0.08 });
    }
  }
  // a few yellow flowers after rain
  if (r() < 0.45) {
    for (let k = 0; k < 4 + r() * 6; k++) {
      const t = tips[Math.floor(r() * tips.length)];
      p.ellipse(t.x + (r() - 0.5) * 3, t.y - 1, 0.7, 0.7, { mat: 'petalGold', dome: 0.8, tint: 0.2 });
    }
  }
  return finish(p, ox, oy, { foot: 3 * s, top: h, sway: 1 });
}

/** Saltbush: a dense silver cushion with bare stems at its foot. */
export function saltbush(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (9 + r() * 9) * s, w = h * (1.5 + r() * 0.5);
  const W = Math.ceil(w * 1.2) + 10, H = Math.ceil(h * 1.25) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  // stems, seen under the skirt
  for (let i = 0; i < 6; i++) {
    const f = (i / 5 - 0.5) * 2;
    p.capsule(ox + f * 2, oy + 2, ox + f * w * 0.3, oy - h * 0.45, 0.7, 0.45, { mat: 'twig', dome: 0.6, tint: -0.2 });
  }
  // the cushion: a dome envelope filled with leaf blobs, lit as one form
  const lump = [r() * TAU, r() * TAU];
  const n = Math.round(w * h * 0.3);
  for (let k = 0; k < n; k++) {
    const u = (r() * 2 - 1);
    const env = h * Math.pow(1 - u * u, 0.55) * (1 + Math.sin(u * 5 + lump[0]) * 0.1 + Math.sin(u * 11 + lump[1]) * 0.07);
    const v = Math.pow(r(), 0.55);
    const lx = ox + u * w * 0.5, ly = oy - 1 - env * v;
    const rr = (0.8 + r() * 0.7) * Math.max(0.8, s);
    // how far round the dome this leaf is: lit on the top left
    const shade = -u * 0.18 + (v - 0.5) * 0.3;
    p.ellipse(lx, ly, rr * 1.15, rr, { mat: 'saltbush', dome: rr + env * v * 0.35, tint: shade + (r() - 0.5) * 0.22,
      keepHigher: true });
  }
  // a few stalks of seed standing out of the top
  for (let k = 0; k < 3 + r() * 4; k++) {
    const u = (r() - 0.5) * 1.4;
    const x = ox + u * w * 0.4, y = oy - h * (0.75 + r() * 0.25) * Math.sqrt(1 - u * u * 0.5);
    p.capsule(x, y + 2, x + (r() - 0.5) * 2, y - 2 - r() * 3, 0.5, 0.4, { mat: 'straw', dome: 0.5, tint: 0.05 });
  }
  return finish(p, ox, oy, { foot: w * 0.42, top: h, sway: 0.35 });
}

/** Dead brush: a knot of bleached twigs, two orders of branching, no leaves. */
export function deadbrush(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (10 + r() * 12) * s;
  const W = Math.ceil(h * 2.4) + 10, H = Math.ceil(h * 1.25) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const mat = r() < 0.5 ? 'twig' : 'woodPale';
  const n = 7 + Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.12 + r() * 0.76);
    const len = h * (0.55 + r() * 0.5);
    const x1 = ox + Math.cos(a) * len, y1 = oy - 1 + Math.sin(a) * len;
    p.curve([{ x: ox + (r() - 0.5) * 2, y: oy + 2 }, { x: lerp(ox, x1, 0.5) + (r() - 0.5) * 3, y: lerp(oy, y1, 0.5) },
      { x: x1, y: y1 }], 0.85 * s + 0.2, 0.4, { mat, dome: 0.8, steps: 10, tint: (r() - 0.5) * 0.25 });
    for (let k = 0; k < 2; k++) {
      if (r() < 0.35) continue;
      const t = 0.5 + r() * 0.4;
      const bx = lerp(ox, x1, t), by = lerp(oy, y1, t);
      const a2 = a + (r() - 0.5) * 1.6;
      const l2 = len * (0.25 + r() * 0.3);
      p.capsule(bx, by, bx + Math.cos(a2) * l2, by + Math.sin(a2) * l2, 0.5, 0.35, { mat, dome: 0.5, tint: -0.1 });
    }
  }
  return finish(p, ox, oy, { foot: 3, top: h, sway: 0.6 }, { outlineColor: '#17120e' });
}

// ---------------------------------------------------------------------------
// grass

/** A bunch of dry grass: a fountain of blades, some with a seed head. */
export function bunchgrass(seed, s = 1, wet = 0) {
  const r = mulberry32(seed);
  const h = (9 + r() * 12) * s * (1 + wet * 0.4);
  const W = Math.ceil(h * 2.2) + 8, H = Math.ceil(h * 1.15) + 7;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const n = Math.round(22 + r() * 18);
  for (let i = 0; i < n; i++) {
    const f = (r() * 2 - 1) * (0.55 + r() * 0.45);
    const len = h * (0.45 + r() * 0.6) * (1 - Math.abs(f) * 0.3);
    const a = -Math.PI / 2 + f * 0.75;
    const bend = (f + (r() - 0.5) * 0.6) * len * 0.45;
    const bx = ox + f * 2.5 * s;
    const tip = { x: bx + Math.cos(a) * len * 0.6 + bend, y: oy - Math.cos(f * 0.75) * len };
    const green = wet > 0.3 ? r() < 0.75 : r() < 0.18;
    const mat = green ? 'reed' : 'straw';
    p.curve([{ x: bx, y: oy + 2 }, { x: bx + Math.cos(a) * len * 0.4, y: oy - len * 0.55 }, tip],
      0.62 * Math.max(0.8, s), 0.3, { mat, dome: 0.6, steps: 9, tint: (r() - 0.5) * 0.28 - (Math.abs(f) > 0.6 ? 0.08 : 0) });
    if (!green && r() < 0.22) {
      // a seed head: a short run of beads near the tip
      for (let k = 0; k < 4; k++) {
        p.ellipse(tip.x + (r() - 0.5) * 1.2, tip.y + k * 1.1, 0.7, 0.6, { mat: 'straw', dome: 0.7, tint: 0.12 + (r() - 0.5) * 0.2 });
      }
    }
  }
  // the dense dark base of the clump
  p.ellipse(ox, oy, 3 * s + 1, 1.8, { mat: 'straw', dome: 1, tint: -0.35, under: true });
  return finish(p, ox, oy, { foot: 3 * s + 1, top: h, sway: 1.4 }, { outlineColor: '#1a160c' });
}

// ---------------------------------------------------------------------------
// cacti and succulents

/** Prickly pear: pads on pads, the spines in rows, fruit along the top. */
export function pricklypear(seed, s = 1) {
  const r = mulberry32(seed);
  const W = Math.ceil(40 * s) + 10, H = Math.ceil(34 * s) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const pads = [];
  // each new pad is painted in front of the ones before it, so the join
  // between two pads is an edge rather than a merge
  const pad = (x, y, rx, ry, rot, tint) => {
    p.ellipse(x, y, rx, ry, { mat: 'pear', rot, dome: rx * 0.7, tint, lift: pads.length * 2.2 });
    pads.push({ x, y, rx, ry, rot });
  };
  // the old pads at the foot, half lying down
  const nb = 1 + Math.floor(r() * 2);
  for (let i = 0; i < nb; i++) {
    const rx = (4.2 + r() * 1.6) * s, ry = (5.5 + r() * 2) * s;
    pad(ox + (i - (nb - 1) / 2) * rx * 1.5, oy - ry * 0.6, rx, ry, (i - (nb - 1) / 2) * 0.6 + (r() - 0.5) * 0.4, -0.08);
  }
  // and new pads grown off the edges of the old ones, two tiers
  for (let tier = 0; tier < 2; tier++) {
    const base = pads.slice();
    for (const b of base) {
      const kids = tier === 0 ? 1 + Math.floor(r() * 2) : r() < 0.6 ? 1 : 0;
      for (let k = 0; k < kids; k++) {
        const side = (k === 0 ? (r() - 0.5) * 1.4 : (k % 2 ? 1 : -1) * (0.6 + r() * 0.5));
        const a = b.rot - Math.PI / 2 + side;
        const ex = b.x + Math.cos(a) * b.ry * 0.95, ey = b.y + Math.sin(a) * b.ry * 0.95;
        const rx = b.rx * (0.82 + r() * 0.12), ry = b.ry * (0.82 + r() * 0.12);
        const rot = a + Math.PI / 2 + (r() - 0.5) * 0.3;
        if (ey - ry < 3) continue;
        pad(ex + Math.cos(a) * ry * 0.75, ey + Math.sin(a) * ry * 0.75, rx, ry, rot, 0.04 + tier * 0.04);
      }
    }
  }
  // areoles: a dot of spine with a dark pit, on a staggered grid on each pad
  const sm = p._mid('bone');
  for (const pd of pads) {
    const cs = Math.cos(pd.rot), sn = Math.sin(pd.rot);
    for (let v = -0.75; v <= 0.76; v += 0.38) {
      for (let u = -0.7; u <= 0.71; u += 0.35) {
        const uu = u + ((Math.round(v / 0.38) & 1) ? 0.17 : 0);
        if (uu * uu + v * v > 0.62) continue;
        const lx = uu * pd.rx, ly = v * pd.ry;
        const x = Math.round(pd.x + lx * cs - ly * sn), y = Math.round(pd.y + lx * sn + ly * cs);
        const i = y * p.w + x;
        if (x < 1 || y < 1 || x >= p.w - 1 || y >= p.h - 1 || p.mat[i] !== p._mid('pear')) continue;
        if (hash2i(x, y, seed) < 0.25) continue;
        p.mat[i] = sm; p.tint[i] = -0.28; p.hgt[i] += 0.3;
        if (p.mat[i + p.w]) p.tint[i + p.w] -= 0.16;
      }
    }
  }
  // fruit on the top edges of the highest pads, and now and then a flower
  pads.sort((a, b) => a.y - b.y);
  const nf = Math.floor(r() * 5);
  for (let k = 0; k < nf && k < pads.length * 2; k++) {
    const pd = pads[k % Math.min(3, pads.length)];
    const a = pd.rot - Math.PI / 2 + (r() - 0.5) * 1.6;
    const fx = pd.x + Math.cos(a) * pd.ry * 0.95, fy = pd.y + Math.sin(a) * pd.ry * 0.95;
    if (r() < 0.25) {
      p.ellipse(fx, fy - 1, 1.8, 1.3, { mat: 'petalGold', dome: 1.6, tint: 0.15 });
      p.ellipse(fx, fy - 1.2, 0.7, 0.6, { mat: 'fruitGold', dome: 1.8, tint: -0.1 });
    } else {
      p.ellipse(fx, fy - 0.5, 1.2, 1.7, { mat: 'fruitMagenta', dome: 1.6, tint: 0.05 });
    }
  }
  let top = 0;
  for (const pd of pads) top = Math.max(top, oy - (pd.y - pd.ry));
  return finish(p, ox, oy, { foot: 6 * s, top, sway: 0 }, { outlineColor: '#0c1610' });
}

/** Barrel cactus: a ribbed drum, hooked spines, a crown of yellow. */
export function barrel(seed, s = 1) {
  const r = mulberry32(seed);
  const rx = (4.5 + r() * 3) * s, ry = (6.5 + r() * 6) * s;
  const W = Math.ceil(rx * 2) + 12, H = Math.ceil(ry * 2) + 10;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const lean = (r() - 0.35) * 0.18;               // they lean toward the sun
  const cy = oy - ry * 0.92;
  const ribs = 7 + Math.floor(r() * 4);
  p.field(0, 0, W - 1, H - 1, (x, y) => {
    const yy = (y - cy) / ry;
    if (yy < -1 || y > oy + 2) return null;
    const cx = ox + lean * (oy - y);
    const half = rx * Math.sqrt(Math.max(0, 1 - yy * yy)) * (yy > 0 ? 1 : 1);
    const width = y > cy ? rx * Math.max(0.86, Math.sqrt(Math.max(0, 1 - yy * yy))) : half;
    const dx = (x - cx) / Math.max(0.5, width);
    if (dx <= -1 || dx >= 1) return null;
    // the ribs, seen round the curve of the drum
    const th = Math.asin(clamp(dx, -1, 1));
    const rib = Math.cos(th * ribs);
    const dz = Math.sqrt(1 - dx * dx);
    return { h: dz * rx * 0.9 + rib * 0.9 * dz, tint: rib * 0.1 * dz - (1 - dz) * 0.1 };
  }, { mat: 'cactus' });
  // spines along the rib crests, poking out past the outline on the edges
  for (let k = 0; k < ribs; k++) {
    const th = (k / ribs - 0.5) * Math.PI * 0.98;
    for (let yy = -0.7; yy < 0.9; yy += 0.36) {
      const y = cy + yy * ry;
      const width = y > cy ? rx * Math.max(0.86, Math.sqrt(1 - yy * yy)) : rx * Math.sqrt(1 - yy * yy);
      const x = ox + lean * (oy - y) + Math.sin(th) * width;
      const out = Math.sin(th);
      if (Math.abs(out) < 0.55 && r() < 0.5) continue;
      p.capsule(x, y, x + out * 1.8 + (r() - 0.5), y - 1.2 - r() * 0.8, 0.45, 0.3,
        { mat: r() < 0.6 ? 'bloomRed' : 'spine', dome: 0.5, tint: -0.25 + (r() - 0.5) * 0.25 + (Math.abs(out) > 0.8 ? 0.1 : 0) });
    }
  }
  // the crown: flowers or the fruit that comes after them
  const n = 3 + Math.floor(r() * 4);
  const fruit = r() < 0.5;
  for (let k = 0; k < n; k++) {
    const u = (k / Math.max(1, n - 1) - 0.5) * 1.2;
    const x = ox + lean * (oy - (cy - ry)) + u * rx * 0.6, y = cy - ry * Math.sqrt(1 - u * u * 0.4) + 0.5;
    p.ellipse(x, y, fruit ? 1.3 : 1.6, fruit ? 1.5 : 1.2, { mat: fruit ? 'fruitGold' : 'petalGold', dome: 1.5, tint: 0.1 });
  }
  return finish(p, ox, oy, { foot: rx * 0.9, top: oy - (cy - ry), sway: 0 }, { outlineColor: '#0b140d' });
}

/** Agave: a rosette of thick blue blades with dark spine tips. */
export function agave(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (13 + r() * 10) * s;
  const stalk = r() < 0.25;
  const W = Math.ceil(h * 2.6) + 10, H = Math.ceil(h * (stalk ? 3.6 : 1.25)) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const n = 11 + Math.floor(r() * 6);
  // back leaves first, front ones last and lower - the rosette has depth
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1) - 0.5) * 2;
    leaves.push({ f, back: r() < 0.5 });
  }
  leaves.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0));
  for (const L of leaves) {
    const spread = L.back ? 1.0 : 1.3;
    const a = -Math.PI / 2 + L.f * spread * (0.85 + r() * 0.2);
    const len = h * (L.back ? 1.0 : 0.78) * (0.75 + r() * 0.3) * (1 - Math.abs(L.f) * 0.2);
    const wid = (2.1 + r() * 1.0) * s;
    const bx = ox + L.f * 2 * s, by = oy - (L.back ? 1.5 : 0.5);
    const curl = L.f * 0.18;
    const mid = { x: bx + Math.cos(a) * len * 0.55, y: by + Math.sin(a) * len * 0.55 };
    const tip = { x: bx + Math.cos(a + curl) * len, y: by + Math.sin(a + curl) * len + Math.abs(L.f) * len * 0.12 };
    p.curve([{ x: bx, y: by + 1.5 }, mid, tip], wid, 0.35, { mat: 'agave', dome: wid * 1.1, steps: 12,
      tint: (L.back ? -0.12 : 0.05) + (r() - 0.5) * 0.12 });
    // a pale edge along the top of the blade, and the black spine
    p.capsule(tip.x, tip.y, tip.x + Math.cos(a + curl) * 1.6, tip.y + Math.sin(a + curl) * 1.6, 0.5, 0.3,
      { mat: 'varnish', dome: 0.6, tint: 0.1 });
  }
  if (stalk) {
    // the once-in-a-lifetime flower stalk, dried, with its side branches
    const sh = h * (2.2 + r() * 0.8);
    const lean = (r() - 0.5) * 3;
    p.capsule(ox, oy - h * 0.4, ox + lean, oy - sh, 1.3, 0.7, { mat: 'palmDry', dome: 1.2, tint: 0.02 });
    for (let k = 0; k < 6; k++) {
      const t = 0.5 + k * 0.085;
      const x = ox + lean * t, y = lerp(oy - h * 0.4, oy - sh, t);
      const side = k % 2 ? 1 : -1;
      const l = (7 - k * 0.8) * s;
      const ex = x + side * l, ey = y - l * 0.35;
      p.curve([{ x, y }, { x: x + side * l * 0.7, y: y + 0.5 }, { x: ex, y: ey }], 0.6, 0.45,
        { mat: 'palmDry', dome: 0.6, tint: -0.05, steps: 6 });
      // a flat-topped cluster of flowers, the way an agave holds them
      for (let q = 0; q < 6; q++) {
        p.ellipse(ex + (q - 2.5) * 0.9, ey - 1 - Math.abs(q - 2.5) * -0.2, 1.0, 0.9,
          { mat: 'petalGold', dome: 1, tint: -0.1 + (q % 2) * 0.12 });
      }
    }
  }
  return finish(p, ox, oy, { foot: h * 0.5, top: h, sway: 0 }, { outlineColor: '#0d1418' });
}

/** Yucca: a ball of fine stiff leaves on a short shaggy trunk, maybe a spike of bells. */
export function yucca(seed, s = 1) {
  const r = mulberry32(seed);
  const trunk = (2 + r() * 6) * s;
  const R = (9 + r() * 5) * s;
  const spike = r() < 0.55;
  const W = Math.ceil(R * 2.6) + 10, H = Math.ceil(trunk + R * 2 + (spike ? R * 2.2 : 0)) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  // the trunk, wrapped in its own dead leaves
  p.capsule(ox, oy + 2, ox + (r() - 0.5) * 2, oy - trunk, 1.6 * s, 1.4 * s, { mat: 'palmDry', dome: 1.6, tint: -0.15 });
  for (let k = 0; k < trunk; k += 1.5) {
    p.capsule(ox - 1.6, oy - k, ox + 1.8, oy - k + 1.2, 0.5, 0.4, { mat: 'palmDry', dome: 0.6, tint: -0.25, mask: true });
  }
  const cx = ox, cy = oy - trunk - R * 0.45;
  const n = 26 + Math.floor(r() * 12);
  for (let i = 0; i < n; i++) {
    // a full sphere of blades, the lower ones hanging dead
    const a = -Math.PI * 1.15 + (i / n) * Math.PI * 1.3 + (r() - 0.5) * 0.2;
    const len = R * (0.8 + r() * 0.4);
    const dead = Math.sin(a) > 0.25;
    const front = r() < 0.5;
    p.capsule(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.95, 0.5, 0.2,
      { mat: dead ? 'palmDry' : 'agave', dome: 0.6, tint: (front ? 0.1 : -0.2) + (r() - 0.5) * 0.12 - (dead ? 0.15 : 0) });
  }
  if (spike) {
    const sh = R * 2.2;
    p.capsule(cx, cy - R * 0.3, cx + 1, cy - R * 0.3 - sh, 0.8, 0.6, { mat: 'palmDry', dome: 0.8, tint: 0.05 });
    for (let k = 0; k < 9; k++) {
      const t = 0.35 + k * 0.075;
      const y = cy - R * 0.3 - sh * t;
      for (const side of [-1, 1]) {
        if (r() < 0.2) continue;
        p.ellipse(cx + side * (1.4 + (1 - t) * 2), y + 0.8, 1.1, 1.4, { mat: 'petalWhite', dome: 1.2, tint: 0.08 });
      }
    }
  }
  return finish(p, ox, oy, { foot: 2.5 * s, top: oy - (cy - R - (spike ? R * 2.2 : 0)), sway: 0.3 }, { outlineColor: '#0e1412' });
}

/** Ocotillo: a fistful of long grey whips, leafed after rain, red at the tips. */
export function ocotillo(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (38 + r() * 34) * s;
  const W = Math.ceil(h * 1.1) + 10, H = Math.ceil(h * 1.06) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const n = 9 + Math.floor(r() * 7);
  const leafy = r() < 0.6;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1) - 0.5) * 2;
    const a = -Math.PI / 2 + f * (0.42 + r() * 0.12);
    const len = h * (0.7 + r() * 0.32) * (1 - Math.abs(f) * 0.12);
    const bx = ox + f * 1.6;
    const mid = { x: bx + Math.cos(a) * len * 0.5, y: oy + Math.sin(a) * len * 0.5 };
    const tip = { x: bx + Math.cos(a) * len + f * len * 0.08, y: oy + Math.sin(a) * len };
    p.curve([{ x: bx, y: oy + 2 }, mid, tip], 1.05 * s + 0.15, 0.45, { mat: 'ocotillo', dome: 1, steps: 16,
      tint: (r() - 0.5) * 0.16 });
    // spines and leaves all the way up
    for (let t = 0.12; t < 0.95; t += 0.07) {
      const q = quad({ x: bx, y: oy }, mid, tip, t);
      const nx = -q.ty, ny = q.tx;
      const nl = Math.hypot(nx, ny) || 1;
      const side = (Math.round(t * 100) & 1) ? 1 : -1;
      if (leafy) {
        p.ellipse(q.x + nx / nl * side * 1.2, q.y + ny / nl * side * 1.2, 0.8, 0.6,
          { mat: 'creosote', dome: 0.8, tint: 0.15 + (r() - 0.5) * 0.2 });
      } else if (r() < 0.5) {
        p.ellipse(q.x + nx / nl * side * 0.9, q.y + ny / nl * side * 0.9, 0.5, 0.5, { mat: 'spine', dome: 0.4, tint: -0.1 });
      }
    }
    // the flower: a narrow red plume at the very tip
    if (r() < 0.75) {
      for (let k = 0; k < 5; k++) {
        p.ellipse(tip.x + Math.cos(a) * k * 0.9, tip.y + Math.sin(a) * k * 0.9 + 0.3, 0.9 - k * 0.1, 0.9, {
          mat: 'bloomRed', dome: 1, tint: 0.08 - k * 0.04 });
      }
    }
  }
  return finish(p, ox, oy, { foot: 3, top: h, sway: 1.1 }, { outlineColor: '#13120c' });
}

/** A dead mesquite limb lying where it fell, grey and split along the grain. */
export function deadlimb(seed, s = 1) {
  const r = mulberry32(seed);
  const len = (30 + r() * 26) * s;
  const W = Math.ceil(len * 1.3) + 10, H = Math.ceil(len * 0.7) + 10;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const dir = r() < 0.5 ? -1 : 1;
  const x0 = ox - dir * len * 0.5, x1 = ox + dir * len * 0.5;
  const lift = len * (0.12 + r() * 0.15);
  p.curve([{ x: x0, y: oy + 0.5 }, { x: ox, y: oy - lift * 0.4 }, { x: x1, y: oy - lift }], 2.1 * s, 1.0 * s,
    { mat: 'woodPale', dome: 2, steps: 18, tint: 0.02 });
  // the branches still on it, broken off short
  for (let k = 0; k < 3 + r() * 3; k++) {
    const t = 0.2 + r() * 0.7;
    const bx = lerp(x0, x1, t), by = oy - lift * t * t * 0.9 - lift * 0.15;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6 + dir * 0.3;
    const l = len * (0.18 + r() * 0.3);
    const ex = bx + Math.cos(a) * l, ey = by + Math.sin(a) * l;
    p.curve([{ x: bx, y: by }, { x: lerp(bx, ex, 0.5) + (r() - 0.5) * 3, y: lerp(by, ey, 0.5) }, { x: ex, y: ey }],
      1.1 * s, 0.45, { mat: 'woodPale', dome: 1, steps: 8, tint: -0.06 });
  }
  p.ridges('woodPale', { angle: Math.atan2(-lift, dir * len), freq: 1.6, amp: 0.12, height: 0.4, seed: seed & 255, warp: 0.6 });
  p.grain('woodPale', { freq: 0.5, amp: 0.12, seed: seed & 511 });
  return finish(p, ox, oy, { foot: len * 0.45, top: lift + len * 0.3, sway: 0 }, { outlineColor: '#1d1712' });
}

// ---------------------------------------------------------------------------
// the oasis

/**
 * A date palm, in two parts: the trunk (static) and the crown, baked in
 * `poses` wind positions from -1 to 1. Returns
 *   { trunk: {cv, ox, oy}, crowns: [{cv, ox, oy}], crown: {x, y} (crown point
 *     relative to the trunk anchor), top }
 */
export function datePalm(seed, h = 80, poses = 7) {
  const r = mulberry32(seed);
  const lean = (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.3);
  const bend = (r() - 0.5) * 0.25;
  // -- trunk
  const tw = 2.6 + h * 0.022;
  const W = Math.ceil(Math.abs(lean) * h + tw * 6 + 20), H = Math.ceil(h) + 12;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2 - lean * h * 0.45), oy = H - 6;
  const top = { x: ox + lean * h, y: oy - h };
  const ctl = { x: ox + lean * h * (0.25 + bend), y: oy - h * 0.55 };
  const steps = Math.ceil(h / 1.5);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    const a = quad({ x: ox, y: oy + 4 }, ctl, top, t0), b = quad({ x: ox, y: oy + 4 }, ctl, top, t1);
    // a palm trunk is thickest at the foot, narrows, and swells a little
    // under the crown
    const wa = tw * (1.25 - t0 * 0.45 + Math.max(0, t0 - 0.85) * 1.2);
    const wb = tw * (1.25 - t1 * 0.45 + Math.max(0, t1 - 0.85) * 1.2);
    p.capsule(a.x, a.y, b.x, b.y, wa, wb, { mat: 'palmBark', dome: wa * 1.1, tint: 0 });
  }
  // the rings: old leaf bases, each one a scale with a lit upper lip and a
  // dark undercut, curving round the trunk, staggered like a basket weave
  const m = p._mid('palmBark');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (p.mat[i] !== m) continue;
      const t = clamp01((oy + 4 - y) / (h + 4));
      const q = quad({ x: ox, y: oy + 4 }, ctl, top, t);
      const wt = tw * (1.25 - t * 0.45 + Math.max(0, t - 0.85) * 1.2);
      const u = clamp((x - q.x) / wt, -1, 1);
      const period = 2.6 + t * 0.6;
      let ph = (oy + 4 - y) / period + u * u * 0.55;
      const row = Math.floor(ph);
      // the scales of alternate rows sit half a scale over
      const col = Math.floor((u + 1) * 2.2 + (row & 1) * 0.5);
      ph -= row;
      let tint = 0, dh = 0;
      if (ph < 0.28) { tint -= 0.3; dh -= 0.8; }
      else if (ph < 0.5) tint += 0.12;
      if (((col + row) & 3) === 0 && ph > 0.3) tint -= 0.08;
      // fibre between the scales near the crown
      if (t > 0.8 && hash2i(x, y, seed & 1023) < 0.25) tint += 0.1;
      p.tint[i] += tint + (fbmTex(x * 0.3, y * 0.3, seed & 255, 2) - 0.5) * 0.1;
      p.hgt[i] += dh;
    }
  }
  // the foot: roots and a skirt of suckers
  for (let k = 0; k < 5; k++) {
    const f = (k / 4 - 0.5) * 2;
    p.capsule(ox, oy - 2, ox + f * tw * 2.4, oy + 2, tw * 0.5, tw * 0.25, { mat: 'palmBark', dome: tw * 0.5, tint: -0.15 });
  }
  const trunk = finish(p, ox, oy, {}, { outlineColor: '#120d0a' });

  // -- crown, in wind poses
  const nf = 13 + Math.floor(r() * 5);
  const fronds = [];
  for (let i = 0; i < nf; i++) {
    const f = (i / (nf - 1) - 0.5) * 2;
    // fronds fan from straight up to hanging down on both sides
    const a = -Math.PI / 2 + f * (1.75 + r() * 0.25);
    const len = (h * 0.36 + 11) * (0.82 + r() * 0.3) * (1 - Math.abs(f) * 0.08);
    const old = Math.abs(f) > 0.84 && r() < 0.75;
    fronds.push({ a, len, droop: 0.12 + Math.pow(Math.abs(f), 1.4) * 0.9 + r() * 0.25, old, back: r() < 0.45, s: r() * 1000 });
  }
  fronds.sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0));
  const dates = r() < 0.75;
  const CW = Math.ceil(h * 0.95 + 30), CH = Math.ceil(h * 0.75 + 24);
  const crowns = [];
  for (let k = 0; k < poses; k++) {
    const wind = poses > 1 ? (k / (poses - 1)) * 2 - 1 : 0;
    const c = new Painter(CW, CH);
    const cx = Math.round(CW / 2), cy = Math.round(CH * 0.42);
    const rr = mulberry32(seed ^ 0x51ed);
    for (const F of fronds) {
      // the wind pushes the whole frond and bends its tip most
      const a = F.a + wind * 0.1;
      const tipDrop = F.droop * F.len * 0.55;
      const end = { x: cx + Math.cos(a) * F.len + wind * F.len * 0.12, y: cy + Math.sin(a) * F.len * 0.7 + tipDrop };
      const ctl2 = { x: cx + Math.cos(a) * F.len * 0.55, y: cy + Math.sin(a) * F.len * 0.55 - F.len * 0.12 };
      const mat = F.old ? 'palmDry' : 'palmLeaf';
      const tint0 = (F.back ? -0.18 : 0.04);
      // the rachis
      c.curve([{ x: cx, y: cy }, ctl2, end], 1.1, 0.4, { mat, dome: 1, steps: 16, tint: tint0 - 0.05 });
      // leaflets: both sides, hanging, shorter toward the tip
      const n = Math.round(F.len / 1.7);
      for (let j = 2; j < n; j++) {
        const t = j / n;
        const q = quad({ x: cx, y: cy }, ctl2, end, t);
        const tl = Math.hypot(q.tx, q.ty) || 1;
        const ux = q.tx / tl, uy = q.ty / tl;
        // longest in the middle of the frond, short at both ends
        const L = (1.5 + Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8) * 7) * (0.85 + rr() * 0.3)
          * (h / 80 * 0.4 + 0.6);
        for (const side of [-1, 1]) {
          if (rr() < 0.12) continue;
          // perpendicular, swept toward the tip, and pulled down by gravity
          let lx = -uy * side * 0.7 + ux * 0.6, ly = ux * side * 0.7 + uy * 0.6;
          ly += 0.6;
          lx += wind * 0.25;
          const ll = Math.hypot(lx, ly) || 1;
          const ex = q.x + lx / ll * L, ey = q.y + ly / ll * L;
          c.curve([{ x: q.x, y: q.y }, { x: lerp(q.x, ex, 0.6), y: lerp(q.y, ey, 0.4) - 0.6 }, { x: ex, y: ey + L * 0.18 }],
            0.55, 0.28, { mat, dome: 0.55, steps: 4,
              tint: tint0 + (side < 0 ? 0.08 : -0.1) + (rr() - 0.5) * 0.16 + (1 - t) * 0.04 });
        }
      }
    }
    // dates hang in heavy bunches under the crown
    if (dates) {
      for (let b = 0; b < 3; b++) {
        const bx = cx + (b - 1) * 4 + wind * 0.6, by = cy + 3;
        c.curve([{ x: cx + (b - 1) * 1.5, y: cy }, { x: bx, y: by }, { x: bx + (b - 1) * 2, y: by + 4 }], 0.6, 0.4,
          { mat: 'palmDry', dome: 0.6, tint: 0.05 });
        for (let d = 0; d < 9; d++) {
          c.ellipse(bx + (b - 1) * 2 + (rr() - 0.5) * 4, by + 4 + rr() * 5, 1, 1.2, { mat: 'dates', dome: 1.2,
            tint: (rr() - 0.5) * 0.3 });
        }
      }
    }
    // the heart of the crown, where the fronds come out
    c.ellipse(cx, cy, 2.6, 2.2, { mat: 'palmBark', dome: 2.4, tint: -0.1 });
    const res = finish(c, cx, cy, {}, { outlineColor: '#0a140c' });
    crowns.push(res);
  }
  return { trunk, crowns, crown: { x: top.x - ox, y: top.y - oy }, top: h + CH * 0.42, lean };
}

/** Cattails: a clump of tall blades and the brown spikes. */
export function cattails(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (22 + r() * 18) * s;
  const W = Math.ceil(h * 0.9) + 10, H = Math.ceil(h * 1.1) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const n = 9 + Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const f = (r() * 2 - 1);
    const len = h * (0.55 + r() * 0.5);
    const bx = ox + f * 3;
    const lean = f * 0.35 + (r() - 0.5) * 0.3;
    // a blade, and some of them have folded over at the top
    const kink = r() < 0.3;
    const mid = { x: bx + lean * len * 0.3, y: oy - len * 0.6 };
    const tip = kink ? { x: bx + lean * len * 0.3 + (lean > 0 ? 1 : -1) * len * 0.3, y: oy - len * 0.62 }
      : { x: bx + lean * len * 0.6, y: oy - len };
    p.curve([{ x: bx, y: oy + 2 }, mid, tip], 0.9 * s + 0.1, 0.3, { mat: 'reed', dome: 0.8, steps: 12,
      tint: (r() - 0.5) * 0.3 + (kink ? -0.1 : 0) });
  }
  const spikes = 2 + Math.floor(r() * 3);
  for (let k = 0; k < spikes; k++) {
    const bx = ox + (r() - 0.5) * 6;
    const th = h * (0.75 + r() * 0.35);
    const tx = bx + (r() - 0.5) * 3;
    p.capsule(bx, oy + 2, tx, oy - th, 0.55, 0.45, { mat: 'reed', dome: 0.5, tint: -0.06 });
    // the brown sausage, and the bare spike above it
    const sy = oy - th + 3;
    p.capsule(tx, sy, tx, sy + 6 * s, 1.5 * s, 1.5 * s, { mat: 'cattail', dome: 1.6, tint: 0.04 });
    p.capsule(tx, sy, tx, sy - 4 * s, 0.4, 0.3, { mat: 'cattail', dome: 0.4, tint: -0.1 });
  }
  return finish(p, ox, oy, { foot: 4, top: h, sway: 1 }, { outlineColor: '#0b140b' });
}

/** Papyrus: tall bare stems, each topped with a burst of fine rays. */
export function papyrus(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (28 + r() * 22) * s;
  const W = Math.ceil(h * 1.0) + 14, H = Math.ceil(h * 1.15) + 10;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const n = 4 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const f = (i / Math.max(1, n - 1) - 0.5) * 2;
    const len = h * (0.7 + r() * 0.35);
    const bx = ox + f * 2.5;
    const tip = { x: bx + f * len * 0.22 + (r() - 0.5) * 3, y: oy - len };
    p.curve([{ x: bx, y: oy + 2 }, { x: bx + f * len * 0.05, y: oy - len * 0.6 }, tip], 0.75 * s + 0.1, 0.5,
      { mat: 'reed', dome: 0.7, steps: 14, tint: (r() - 0.5) * 0.15 });
    // the umbel: a starburst of rays drooping out over the stem
    const rays = 9 + Math.floor(r() * 5);
    for (let k = 0; k < rays; k++) {
      const a = -Math.PI / 2 + (k / (rays - 1) - 0.5) * Math.PI * 1.55;
      const L = (4.5 + r() * 3.5) * s;
      const ex = tip.x + Math.cos(a) * L, ey = tip.y + Math.sin(a) * L * 0.7 + L * 0.45;
      p.curve([{ x: tip.x, y: tip.y }, { x: tip.x + Math.cos(a) * L * 0.6, y: tip.y + Math.sin(a) * L * 0.55 }, { x: ex, y: ey }],
        0.32, 0.22, { mat: 'reed', dome: 0.35, steps: 6, tint: 0.14 + (r() - 0.5) * 0.2 });
    }
  }
  return finish(p, ox, oy, { foot: 4, top: h, sway: 1.1 }, { outlineColor: '#0b140b' });
}

/** Reeds: tall blades with feathery plumes, bronze at the top. */
export function reeds(seed, s = 1) {
  const r = mulberry32(seed);
  const h = (24 + r() * 16) * s;
  const W = Math.ceil(h * 0.8) + 10, H = Math.ceil(h * 1.12) + 8;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 4;
  const n = 6 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const f = (r() * 2 - 1);
    const len = h * (0.6 + r() * 0.42);
    const bx = ox + f * 3;
    const tip = { x: bx + f * len * 0.18, y: oy - len };
    p.curve([{ x: bx, y: oy + 2 }, { x: bx, y: oy - len * 0.5 }, tip], 0.6, 0.4, { mat: 'reed', dome: 0.6, steps: 12,
      tint: (r() - 0.5) * 0.2 });
    // a leaf off the stem
    const t = 0.3 + r() * 0.4;
    const lx = lerp(bx, tip.x, t), ly = lerp(oy, tip.y, t);
    const side = r() < 0.5 ? -1 : 1;
    p.curve([{ x: lx, y: ly }, { x: lx + side * len * 0.18, y: ly - len * 0.15 }, { x: lx + side * len * 0.3, y: ly - len * 0.05 }],
      0.8, 0.3, { mat: 'reed', dome: 0.6, steps: 8, tint: -0.05 });
    if (r() < 0.6) {
      for (let k = 0; k < 7; k++) {
        p.ellipse(tip.x + (r() - 0.5) * 2 + f * k * 0.25, tip.y + k * 1.1, 1.1 - k * 0.08, 0.9,
          { mat: 'palmDry', dome: 0.8, tint: 0.1 + (r() - 0.5) * 0.25 });
      }
    }
  }
  return finish(p, ox, oy, { foot: 4, top: h, sway: 1.2 }, { outlineColor: '#0b140b' });
}

/** Lush waterside grass: a dense green fountain. */
export function lushgrass(seed, s = 1) {
  return bunchgrass(seed, s, 1);
}

/** A lily pad seen low across the water, maybe with its flower. */
export function lilypad(seed, s = 1) {
  const r = mulberry32(seed);
  const rx = (3 + r() * 2.5) * s, ry = rx * 0.32;
  const W = Math.ceil(rx * 2) + 6, H = Math.ceil(ry * 2) + 9;
  const p = new Painter(W, H);
  const ox = Math.round(W / 2), oy = H - 3;
  p.ellipse(ox, oy - ry, rx, ry, { mat: 'lilypad', dome: ry * 0.8, tint: 0.02 });
  // the notch, toward you
  p.rect(ox + rx * 0.2, oy - ry, 1.2, ry + 1, { mat: 'lilypad', mask: true, tint: -0.35 });
  if (r() < 0.35) {
    const pink = r() < 0.5;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 4 - 0.5) * 1.8;
      p.capsule(ox - rx * 0.2, oy - ry * 1.4, ox - rx * 0.2 + Math.cos(a) * 2.2, oy - ry * 1.4 + Math.sin(a) * 2.2, 0.8, 0.5,
        { mat: pink ? 'petalPink' : 'petalWhite', dome: 0.9, tint: 0.1 });
    }
    p.ellipse(ox - rx * 0.2, oy - ry * 1.4, 0.7, 0.6, { mat: 'petalGold', dome: 0.8, tint: 0.2 });
  }
  return finish(p, ox, oy, { foot: rx }, { outlineColor: '#081410' });
}

/** For the art harness: one of everything. */
export function sheet() {
  const out = [];
  const add = (a, label) => out.push({ ...a, label });
  for (let i = 0; i < 3; i++) add(creosote(11 + i * 97, 0.8 + i * 0.3), 'creosote');
  for (let i = 0; i < 3; i++) add(saltbush(23 + i * 97, 0.8 + i * 0.3), 'saltbush');
  for (let i = 0; i < 2; i++) add(deadbrush(31 + i * 97, 0.9 + i * 0.4), 'deadbrush');
  for (let i = 0; i < 3; i++) add(bunchgrass(41 + i * 97, 0.8 + i * 0.3), 'grass');
  for (let i = 0; i < 3; i++) add(pricklypear(53 + i * 97, 0.7 + i * 0.25), 'pear');
  for (let i = 0; i < 3; i++) add(barrel(61 + i * 97, 0.8 + i * 0.3), 'barrel');
  for (let i = 0; i < 2; i++) add(agave(71 + i * 97, 0.9 + i * 0.3), 'agave');
  for (let i = 0; i < 2; i++) add(yucca(81 + i * 97, 0.9 + i * 0.3), 'yucca');
  for (let i = 0; i < 2; i++) add(ocotillo(91 + i * 97, 0.8 + i * 0.3), 'ocotillo');
  add(deadlimb(101, 1), 'limb');
  const palm = datePalm(1234, 84, 3);
  add(palm.trunk, 'palm trunk');
  add(palm.crowns[1], 'crown');
  add(cattails(141, 1), 'cattails');
  add(papyrus(151, 1), 'papyrus');
  add(reeds(161, 1), 'reeds');
  add(lushgrass(171, 1), 'lush');
  add(lilypad(181, 1), 'lily');
  add(lilypad(191, 1.3), 'lily');
  return out;
}
