// CRABDEN - fish, painted.
//
// Every fish here is painted a pixel at a time from a description of the
// animal, at the exact size it is going to be shown - so a fish on the reef is
// one screen pixel to one art pixel whatever the camera is doing, with a crisp
// one-pixel outline, instead of a small sprite blown up by a fractional zoom.
//
// What makes a fish read as a fish, in the order it matters:
//
//   the SILHOUETTE - an upper and a lower contour along the body, so a tuna
//     is a torpedo, a tang is a dinner plate and a barracuda is a knife;
//   the TAIL for the animal - forked, lunate, round, square, lyre, or the
//     three-lobed one the coelacanth still has;
//   COUNTERSHADING - dark back, pale belly, on a limited ramp per species,
//     with a sheen along the upper flank where the light from the surface hits;
//   the PATTERN - bars, stripes, spots, the tang's black palette, the idol's
//     bands - painted in body space, so it bends with the fish;
//   translucent FINS with the rays showing through;
//   the EYE, ringed, with a catchlight; the gill cover; the mouth.
//
// Each species is baked in eight swim frames. A travelling wave runs down the
// spine - nothing at the head, more and more toward the tail - the tail flicks
// and foreshortens as it sweeps, and the pectoral fin rows. It swims by
// changing frame, never by being rotated, so every frame is as crisp as the
// first.

import { makeCanvas } from '../render/pixel.js';
import { FISH_BY_ID } from '../data/fish.js';

/** Frames in the cycle the book, the catch card and the pools step through. */
export const FISH_FRAMES = 4;
/** Frames in the full swim cycle the sea uses. */
export const SWIM_FRAMES = 8;

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (...hs) => hs.map(rgb);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise on a coarse grid, for mottling. */
function vn(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** A smooth curve through [u, value] control points (Catmull-Rom, clamped). */
function curve(pts) {
  const n = pts.length;
  return (u) => {
    if (u <= pts[0][0]) return pts[0][1];
    if (u >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (i < n - 2 && u > pts[i + 1][0]) i++;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const t = (u - p1[0]) / (p2[0] - p1[0] || 1);
    const t2 = t * t, t3 = t2 * t;
    // tangents scaled to the uneven spacing of the knots
    const m1 = (p2[1] - p0[1]) / ((p2[0] - p0[0]) || 1) * (p2[0] - p1[0]);
    const m2 = (p3[1] - p1[1]) / ((p3[0] - p1[0]) || 1) * (p2[0] - p1[0]);
    const v = (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    return Math.max(0, v);
  };
}

// ---------------------------------------------------------------------------
// the species
//
//   L, H        body length (snout to the base of the tail) and greatest depth,
//               in world pixels at scale 1
//   top, bot    the upper and lower contour, as [u, fraction of H] - u runs
//               0 at the snout to 1 at the base of the tail
//   tail        { kind, len (of L), span (half-height, of H), notch }
//   fins        dorsal / anal runs along the contour, a pelvic, a pectoral
//   ramps       the colours, dark to light; `body` is the default
//   cs          countershading: lightness at the back and at the belly
//   paint(u, v, q)  -> a ramp name (or [name, lightness shift]) for the
//               pattern, or null for the plain body; v is 0 at the back and 1
//               at the belly
//   eye         { u, v, r (of H), iris }
//   wiggle      how far the tail swings, as a fraction of H

const SPECIES = {
  // -- the oasis fish ------------------------------------------------------
  pupfish: {
    L: 12, H: 5,
    top: [[0, 0.16], [0.08, 0.34], [0.3, 0.5], [0.6, 0.46], [0.88, 0.26], [1, 0.22]],
    bot: [[0, 0.1], [0.1, 0.32], [0.35, 0.5], [0.65, 0.44], [0.9, 0.26], [1, 0.22]],
    tail: { kind: 'round', len: 0.3, span: 0.56 },
    fins: [{ at: 'top', u0: 0.4, u1: 0.72, h: 0.42 }, { at: 'bot', u0: 0.6, u1: 0.8, h: 0.3 }, { at: 'pec', u: 0.27, len: 0.16 }],
    ramps: {
      body: ramp('#10264e', '#1a3d78', '#2a5fa8', '#4686cc', '#7fb2e2', '#c6dcef', '#eef4f8'),
      bar: ramp('#0a1834', '#10264e', '#1a3d78', '#2a5fa8'),
      fin: ramp('#0e1e44', '#1a3466', '#2c4f8a', '#4a72aa', '#d8b440'),
    },
    cs: [0.18, 0.95],
    paint: (u, v) => (u > 0.22 && u < 0.95 && v < 0.8 && Math.sin(u * 30 + 0.6) > 0.45 ? 'bar' : null),
    eye: { u: 0.12, v: 0.38, r: 0.15, iris: '#e8c040' },
    finEdge: '#e0b840',
  },
  perch: {
    L: 19, H: 8,
    top: [[0, 0.16], [0.07, 0.34], [0.25, 0.5], [0.55, 0.48], [0.85, 0.28], [1, 0.2]],
    bot: [[0, 0.1], [0.1, 0.32], [0.35, 0.5], [0.62, 0.44], [0.88, 0.26], [1, 0.2]],
    tail: { kind: 'round', len: 0.26, span: 0.58 },
    fins: [{ at: 'top', u0: 0.22, u1: 0.5, h: 0.32, spiny: 7 }, { at: 'top', u0: 0.5, u1: 0.82, h: 0.3 },
      { at: 'bot', u0: 0.62, u1: 0.84, h: 0.28 }, { at: 'pelvic', u: 0.34, len: 0.2 }, { at: 'pec', u: 0.28, len: 0.15 }],
    ramps: {
      body: ramp('#23260f', '#383e18', '#525a26', '#717c38', '#95a050', '#bfc488', '#e6e4c0'),
      bar: ramp('#171a08', '#23260f', '#383e18', '#525a26'),
      fin: ramp('#2a2410', '#40361a', '#5c4c28', '#7a663a', '#c04a30'),
    },
    cs: [0.2, 0.95],
    paint: (u, v) => (u > 0.2 && u < 0.92 && v < 0.78 && Math.sin(u * 26 + 1.2) > 0.5 ? 'bar' : null),
    eye: { u: 0.11, v: 0.36, r: 0.11, iris: '#c8502c' },
    finEdge: '#c04a30',
  },
  cavefish: {
    L: 15, H: 5.5,
    top: [[0, 0.12], [0.07, 0.3], [0.28, 0.5], [0.6, 0.44], [0.88, 0.2], [1, 0.14]],
    bot: [[0, 0.1], [0.1, 0.3], [0.32, 0.5], [0.62, 0.42], [0.9, 0.2], [1, 0.14]],
    tail: { kind: 'fork', len: 0.3, span: 0.62, notch: 0.5 },
    fins: [{ at: 'top', u0: 0.42, u1: 0.6, h: 0.36 }, { at: 'bot', u0: 0.62, u1: 0.84, h: 0.24 }, { at: 'pec', u: 0.26, len: 0.16 }],
    ramps: {
      body: ramp('#7a4c48', '#a26a64', '#c48a82', '#dca8a0', '#ecc6be', '#f7e2dc', '#fdf4f0'),
      gut: ramp('#9a5a54', '#b8726a', '#d08a80', '#e0a49a'),
      fin: ramp('#b88078', '#d4a098', '#e8c0b8', '#f4dcd6', '#f8e8e2'),
    },
    cs: [0.45, 0.95],
    paint: (u, v) => (u > 0.2 && u < 0.5 && v > 0.55 && v < 0.85 ? 'gut' : null),
    blind: true,
    eye: { u: 0.11, v: 0.38, r: 0.1 },
  },

  // -- the sea fish you can catch ------------------------------------------
  sardine: {
    L: 11, H: 3.2,
    top: [[0, 0.1], [0.06, 0.3], [0.25, 0.48], [0.5, 0.46], [0.8, 0.26], [1, 0.13]],
    bot: [[0, 0.06], [0.08, 0.3], [0.3, 0.52], [0.55, 0.48], [0.85, 0.24], [1, 0.13]],
    tail: { kind: 'fork', len: 0.3, span: 0.72, notch: 0.5 },
    fins: [{ at: 'top', u0: 0.42, u1: 0.58, h: 0.36 }, { at: 'bot', u0: 0.72, u1: 0.84, h: 0.16 }, { at: 'pec', u: 0.24, len: 0.14 }],
    ramps: {
      body: ramp('#163049', '#20486a', '#356d90', '#6a9cb8', '#a8c8da', '#dcebf2', '#f6fafc'),
      spot: ramp('#0d1e2e', '#163049', '#20486a'),
      fin: ramp('#3c5a6c', '#5a7a8c', '#7e9cac', '#a8c0cc', '#cfdde4'),
    },
    cs: [0.08, 1.0],
    paint: (u, v, q) => (v > 0.3 && v < 0.42 && u > 0.2 && u < 0.55 && q.ix % 3 === 0 ? 'spot' : null),
    eye: { u: 0.12, v: 0.42, r: 0.17, iris: '#d8e4ea' },
    wiggle: 0.1,
  },
  mackerel: {
    L: 24, H: 5.6,
    top: [[0, 0.08], [0.08, 0.3], [0.3, 0.5], [0.55, 0.46], [0.84, 0.2], [1, 0.08]],
    bot: [[0, 0.08], [0.1, 0.3], [0.32, 0.5], [0.58, 0.44], [0.86, 0.18], [1, 0.08]],
    tail: { kind: 'fork', len: 0.24, span: 0.8, notch: 0.56 },
    fins: [{ at: 'top', u0: 0.22, u1: 0.38, h: 0.42, spiny: 6 }, { at: 'top', u0: 0.5, u1: 0.6, h: 0.32, sickle: true },
      { at: 'bot', u0: 0.54, u1: 0.63, h: 0.26, sickle: true }, { at: 'pec', u: 0.24, len: 0.16 }, { finlets: 5, u0: 0.66, u1: 0.95 }],
    ramps: {
      body: ramp('#0c2830', '#153e4a', '#205764', '#3d7c86', '#7cb0b2', '#cce2dc', '#f2f8f4'),
      tiger: ramp('#05141a', '#0c2830', '#153e4a', '#1d4e5a'),
      fin: ramp('#1e3a40', '#2c4e56', '#40666c', '#5c8286', '#8aa8aa'),
    },
    cs: [0.14, 1.0],
    paint: (u, v) => (v < 0.44 && u > 0.12 && u < 0.97 && Math.sin(u * 48 + Math.sin(v * 13 + u * 4) * 2.4) > 0.25 ? 'tiger' : null),
    eye: { u: 0.1, v: 0.42, r: 0.13, iris: '#c8d8d0' },
    wiggle: 0.08,
  },
  parrot: {
    L: 30, H: 11,
    top: [[0, 0.22], [0.05, 0.38], [0.18, 0.5], [0.5, 0.5], [0.8, 0.34], [1, 0.17]],
    bot: [[0, 0.06], [0.1, 0.32], [0.35, 0.5], [0.65, 0.45], [0.9, 0.24], [1, 0.16]],
    tail: { kind: 'lyre', len: 0.3, span: 0.78, notch: 0.32 },
    fins: [{ at: 'top', u0: 0.2, u1: 0.88, h: 0.2 }, { at: 'bot', u0: 0.6, u1: 0.88, h: 0.2 },
      { at: 'pelvic', u: 0.34, len: 0.18 }, { at: 'pec', u: 0.27, len: 0.17 }],
    ramps: {
      body: ramp('#08332f', '#0f5048', '#18705f', '#24927a', '#43b494', '#7fd6b4', '#c0eed6'),
      scale: ramp('#062824', '#0b3f39', '#11584d', '#1a7564'),
      pink: ramp('#561a38', '#842a54', '#ad4372', '#d06a94', '#e894b2', '#f6c2d4'),
      beak: ramp('#6c6a5a', '#a6a490', '#d8d6c2', '#f4f2e4'),
      fin: ramp('#5e1c40', '#8a2c5a', '#b64a7c', '#d8749c', '#2fa48a'),
      tail: ramp('#0f5048', '#18705f', '#ad4372', '#d06a94', '#f6c2d4'),
    },
    cs: [0.25, 0.9],
    paint: (u, v, q) => {
      if (u < 0.045 && v > 0.3) return 'beak';
      // the face: a pink band from the mouth back under the eye
      if (u < 0.2 && Math.abs(v - (0.62 - u * 0.6)) < 0.07) return 'pink';
      if (v > 0.74) return 'pink';
      // scales: every one edged a shade darker, offset row to row
      const sx = q.ix % 4, row = Math.floor(q.iy / 3);
      if (u > 0.2 && u < 0.96 && (q.iy % 3 === 0 || (sx + (row & 1) * 2) % 4 === 0)) return 'scale';
      return null;
    },
    eye: { u: 0.11, v: 0.34, r: 0.09, iris: '#f2c040' },
    mouth: { v: 0.6, beak: true },
    finEdge: '#2fb898',
  },
  grouper: {
    L: 44, H: 15,
    top: [[0, 0.14], [0.05, 0.28], [0.18, 0.46], [0.42, 0.52], [0.7, 0.42], [0.9, 0.26], [1, 0.22]],
    bot: [[0, 0.2], [0.08, 0.42], [0.3, 0.5], [0.6, 0.44], [0.85, 0.28], [1, 0.22]],
    tail: { kind: 'round', len: 0.24, span: 0.64 },
    fins: [{ at: 'top', u0: 0.2, u1: 0.55, h: 0.2, spiny: 9 }, { at: 'top', u0: 0.55, u1: 0.86, h: 0.3 },
      { at: 'bot', u0: 0.62, u1: 0.85, h: 0.27 }, { at: 'pelvic', u: 0.3, len: 0.18 }, { at: 'pec', u: 0.25, len: 0.17, round: true }],
    ramps: {
      body: ramp('#24170d', '#3a2717', '#553b22', '#73522f', '#946c41', '#b58c5a', '#d4ae80'),
      blot: ramp('#160d06', '#24170d', '#3a2717', '#4a3220'),
      pale: ramp('#7a6040', '#a8885e', '#d0b386', '#ecd8b0'),
      fin: ramp('#24170d', '#3a2717', '#553b22', '#73522f', '#a07a4c'),
    },
    cs: [0.25, 0.9],
    paint: (u, v, q) => {
      const m = vn(q.ix / (2.6 * q.S), q.iy / (2.2 * q.S), 7);
      if (m > 0.62 && v < 0.88) return 'blot';
      if (hash(Math.floor(q.ix / Math.max(1, q.S * 1.6)), Math.floor(q.iy / Math.max(1, q.S * 1.6)), 3) > 0.9 && m < 0.5) return 'pale';
      return null;
    },
    eye: { u: 0.11, v: 0.3, r: 0.075, iris: '#d8a838' },
    mouth: { v: 0.62, big: 0.15 },
    wiggle: 0.06,
  },
  coelacanth: {
    L: 50, H: 15,
    top: [[0, 0.2], [0.08, 0.38], [0.3, 0.5], [0.6, 0.46], [0.85, 0.3], [1, 0.2]],
    bot: [[0, 0.16], [0.1, 0.36], [0.35, 0.5], [0.65, 0.42], [0.9, 0.26], [1, 0.2]],
    tail: { kind: 'lobe3', len: 0.3, span: 0.56 },
    fins: [{ at: 'top', u0: 0.3, u1: 0.42, h: 0.42, lobe: true }, { at: 'top', u0: 0.66, u1: 0.78, h: 0.36, lobe: true },
      { at: 'bot', u0: 0.66, u1: 0.78, h: 0.34, lobe: true }, { at: 'pelvic', u: 0.42, len: 0.22, lobe: true },
      { at: 'pec', u: 0.27, len: 0.24, lobe: true }],
    ramps: {
      body: ramp('#0c1828', '#14253a', '#1d3651', '#2a4a6a', '#3b6184', '#567e9e', '#789db8'),
      blot: ramp('#7f98ac', '#a9c0d0', '#d2e0ea', '#eef5f8'),
      fin: ramp('#14253a', '#1d3651', '#2a4a6a', '#3b6184', '#567e9e'),
    },
    cs: [0.3, 0.75],
    paint: (u, v, q) => {
      const k = Math.max(1, q.S * 2.2);
      const m = vn(q.ix / k, q.iy / k, 19);
      return m > 0.72 && u > 0.1 && u < 0.98 ? ['blot', -0.25] : null;
    },
    eye: { u: 0.1, v: 0.36, r: 0.1, iris: '#c8e86a', shine: true },
    wiggle: 0.05,
  },

  // -- the reef: everything that lives there and does not get caught -------
  tang: {
    L: 22, H: 12.5,
    top: [[0, 0.12], [0.06, 0.3], [0.2, 0.48], [0.45, 0.52], [0.75, 0.38], [0.92, 0.17], [1, 0.12]],
    bot: [[0, 0.06], [0.08, 0.24], [0.3, 0.46], [0.55, 0.48], [0.8, 0.3], [0.95, 0.14], [1, 0.12]],
    tail: { kind: 'fork', len: 0.26, span: 0.62, notch: 0.86 },
    fins: [{ at: 'top', u0: 0.16, u1: 0.88, h: 0.15 }, { at: 'bot', u0: 0.42, u1: 0.88, h: 0.15 },
      { at: 'pelvic', u: 0.3, len: 0.14 }, { at: 'pec', u: 0.27, len: 0.15 }],
    ramps: {
      body: ramp('#0a1a4e', '#12297c', '#1a3ca8', '#2253ca', '#3a72de', '#6698ec', '#a2c2f4'),
      black: ramp('#03050c', '#080d1e', '#111a34', '#1b2850'),
      yellow: ramp('#6a4c04', '#a6800c', '#dcae14', '#f4d034', '#fae47c'),
      fin: ramp('#0a1a4e', '#12297c', '#1a3ca8', '#2253ca', '#050810'),
      tail: ramp('#6a4c04', '#a6800c', '#dcae14', '#f4d034', '#fae47c'),
    },
    cs: [0.35, 0.8],
    paint: (u, v) => {
      if (u > 0.9) return 'yellow';
      // the palette: a black band from the eye along the back, sweeping down
      // round the rear of the flank and forward again, with blue held inside
      const du = (u - 0.56) / 0.3, dv = (v - 0.5) / 0.27;
      const r = Math.hypot(du, dv);
      const a = Math.atan2(dv, du);
      if (r > 0.72 && r < 1.08 && (a < 1.2 || a > 2.9)) return 'black';
      if (u > 0.1 && u < 0.6 && v > 0.17 && v < 0.33 + (u - 0.1) * 0.12) return 'black';
      return null;
    },
    eye: { u: 0.12, v: 0.37, r: 0.1, iris: '#1a1a2a' },
    finEdge: '#050810',
    wiggle: 0.06,
  },
  clown: {
    L: 13, H: 6.6,
    top: [[0, 0.18], [0.08, 0.36], [0.25, 0.5], [0.55, 0.48], [0.85, 0.3], [1, 0.22]],
    bot: [[0, 0.12], [0.1, 0.34], [0.3, 0.5], [0.6, 0.44], [0.9, 0.26], [1, 0.22]],
    tail: { kind: 'round', len: 0.3, span: 0.56 },
    fins: [{ at: 'top', u0: 0.2, u1: 0.45, h: 0.3, spiny: 4 }, { at: 'top', u0: 0.45, u1: 0.78, h: 0.38 },
      { at: 'bot', u0: 0.6, u1: 0.82, h: 0.32 }, { at: 'pelvic', u: 0.32, len: 0.2 }, { at: 'pec', u: 0.28, len: 0.18, round: true }],
    ramps: {
      body: ramp('#5a1604', '#8c2806', '#c2400a', '#e8600e', '#f6842a', '#fbac5a', '#fdd09a'),
      white: ramp('#8494a2', '#c6d2dc', '#eef2f6', '#ffffff'),
      black: ramp('#050608', '#101216', '#1c1e24'),
      fin: ramp('#8c2806', '#c2400a', '#e8600e', '#f6842a', '#08090c'),
      tail: ramp('#8c2806', '#c2400a', '#e8600e', '#f6842a', '#08090c'),
    },
    cs: [0.45, 0.85],
    paint: (u, v) => {
      // three white bars, each edged in black; the middle one bulges forward
      const bars = [[0.17 - (v - 0.5) * 0.06, 0.05], [0.5 - Math.sin(v * Math.PI) * 0.06, 0.055], [0.92, 0.04]];
      for (const [c, w] of bars) {
        const d = Math.abs(u - c);
        if (d < w) return 'white';
        if (d < w + 0.025) return 'black';
      }
      return null;
    },
    eye: { u: 0.13, v: 0.38, r: 0.12, iris: '#e86010' },
    finEdge: '#08090c',
    wiggle: 0.07,
  },
  snapper: {
    L: 28, H: 9,
    top: [[0, 0.1], [0.06, 0.26], [0.25, 0.5], [0.5, 0.48], [0.8, 0.28], [1, 0.12]],
    bot: [[0, 0.06], [0.1, 0.26], [0.35, 0.5], [0.6, 0.44], [0.85, 0.24], [1, 0.12]],
    tail: { kind: 'fork', len: 0.3, span: 0.74, notch: 0.36 },
    fins: [{ at: 'top', u0: 0.24, u1: 0.5, h: 0.24, spiny: 7 }, { at: 'top', u0: 0.5, u1: 0.76, h: 0.2 },
      { at: 'bot', u0: 0.6, u1: 0.78, h: 0.22 }, { at: 'pelvic', u: 0.34, len: 0.18 }, { at: 'pec', u: 0.26, len: 0.18 }],
    ramps: {
      body: ramp('#28324e', '#3a486c', '#53638a', '#7c8baa', '#b2bacc', '#e0e0e8', '#f8f0f0'),
      yellow: ramp('#6a4806', '#a6760e', '#daa418', '#f2c838', '#fae27a'),
      fin: ramp('#7a6a3a', '#a89050', '#d0b45c', '#ecd27a', '#f4e4a0'),
      tail: ramp('#6a4806', '#a6760e', '#daa418', '#f2c838', '#fae27a'),
    },
    cs: [0.18, 0.95],
    paint: (u, v, q) => {
      // a yellow stripe from the snout to the tail, widening as it goes
      const c = 0.5 - u * 0.05, w = 0.04 + u * 0.09;
      if (Math.abs(v - c) < w && u > 0.03) return 'yellow';
      // and yellow spots over the back
      if (v < 0.36 && u > 0.18 && u < 0.85 && hash(Math.floor(q.ix / Math.max(1, q.S * 1.6)), Math.floor(q.iy / Math.max(1, q.S * 1.4)), 5) > 0.8) return 'yellow';
      return null;
    },
    eye: { u: 0.1, v: 0.4, r: 0.12, iris: '#e8c040' },
    finEdge: '#f2c838',
  },
  tuna: {
    L: 56, H: 15,
    top: [[0, 0.1], [0.08, 0.3], [0.3, 0.5], [0.55, 0.5], [0.8, 0.26], [0.95, 0.08], [1, 0.06]],
    bot: [[0, 0.1], [0.1, 0.32], [0.35, 0.52], [0.6, 0.46], [0.82, 0.22], [0.95, 0.08], [1, 0.06]],
    tail: { kind: 'lunate', len: 0.2, span: 0.8, notch: 0.4 },
    fins: [{ at: 'top', u0: 0.28, u1: 0.42, h: 0.24, spiny: 8 }, { at: 'top', u0: 0.48, u1: 0.57, h: 0.42, sickle: true },
      { at: 'bot', u0: 0.54, u1: 0.62, h: 0.4, sickle: true }, { at: 'pelvic', u: 0.33, len: 0.1 },
      { at: 'pec', u: 0.24, len: 0.3, sickle: true }, { finlets: 8, u0: 0.62, u1: 0.95 }],
    ramps: {
      body: ramp('#050f24', '#0a1b40', '#122c64', '#21497c', '#55809a', '#a2bcc4', '#dfe9e6', '#f8faf8'),
      spot: ramp('#7e98a8', '#b8ccd4', '#e6eef0'),
      keel: ramp('#1e2c38', '#36485a', '#566a7a'),
      fin: ramp('#0a1b40', '#122c64', '#21497c', '#3a5f86', '#55809a'),
      finlet: ramp('#8a6a0e', '#c89c1c', '#f0cc3a', '#f8e480'),
    },
    cs: [0.08, 1.0],
    paint: (u, v, q) => {
      if (u > 0.9 && Math.abs(v - 0.5) < 0.3) return 'keel';
      // rows of pale spots and bars down the lower flank
      if (v > 0.56 && v < 0.82 && u > 0.3 && u < 0.84 && (q.ix % 5 < 2) && hash(Math.floor(q.ix / 5), q.iy, 9) > 0.45) return 'spot';
      return null;
    },
    eye: { u: 0.09, v: 0.42, r: 0.075, iris: '#c0ccd0' },
    finletRamp: 'finlet',
    wiggle: 0.05,
  },
  barracuda: {
    L: 54, H: 8.6,
    top: [[0, 0.03], [0.05, 0.16], [0.15, 0.34], [0.3, 0.46], [0.6, 0.46], [0.85, 0.3], [1, 0.22]],
    bot: [[0, 0.03], [0.04, 0.2], [0.12, 0.38], [0.3, 0.52], [0.6, 0.48], [0.85, 0.3], [1, 0.22]],
    tail: { kind: 'fork', len: 0.2, span: 0.82, notch: 0.5 },
    fins: [{ at: 'top', u0: 0.36, u1: 0.46, h: 0.55, spiny: 5 }, { at: 'top', u0: 0.66, u1: 0.74, h: 0.48, sickle: true },
      { at: 'bot', u0: 0.66, u1: 0.74, h: 0.42, sickle: true }, { at: 'pelvic', u: 0.44, len: 0.08 }, { at: 'pec', u: 0.21, len: 0.1 }],
    ramps: {
      body: ramp('#18262f', '#273a46', '#3e5462', '#5f7c8a', '#9ab2bc', '#d4e0e2', '#f4f8f8'),
      bar: ramp('#0c1820', '#18262f', '#273a46', '#34495a'),
      spot: ramp('#05080c', '#10161c'),
      fin: ramp('#18262f', '#273a46', '#3e5462', '#5f7c8a', '#7f98a4'),
    },
    cs: [0.15, 1.0],
    paint: (u, v, q) => {
      if (v < 0.46 && u > 0.14 && u < 0.92 && Math.sin(u * 62 - v * 9) > 0.55) return 'bar';
      if (u > 0.58 && v > 0.45 && v < 0.85 && hash(Math.floor(q.ix / Math.max(1, q.S * 1.5)), Math.floor(q.iy / Math.max(1, q.S * 1.5)), 13) > 0.88) return 'spot';
      return null;
    },
    eye: { u: 0.085, v: 0.36, r: 0.13, iris: '#d6c88a' },
    mouth: { v: 0.55, jaw: true },
    wiggle: 0.05,
  },
  idol: {
    L: 18, H: 15,
    top: [[0, 0.04], [0.05, 0.09], [0.12, 0.28], [0.25, 0.5], [0.5, 0.52], [0.75, 0.3], [0.9, 0.12], [1, 0.08]],
    bot: [[0, 0.04], [0.06, 0.1], [0.15, 0.32], [0.35, 0.5], [0.6, 0.46], [0.8, 0.26], [1, 0.08]],
    tail: { kind: 'fork', len: 0.26, span: 0.58, notch: 0.72 },
    fins: [{ at: 'top', u0: 0.26, u1: 0.62, h: 0.85, streamer: true }, { at: 'bot', u0: 0.34, u1: 0.74, h: 0.5, sickle: true },
      { at: 'pelvic', u: 0.3, len: 0.16 }, { at: 'pec', u: 0.3, len: 0.14 }],
    ramps: {
      body: ramp('#7c7e74', '#b4b6aa', '#dcdccf', '#f2f2e8', '#ffffff'),
      yellow: ramp('#6c4e06', '#b08410', '#e8bc22', '#f6dc5a', '#fbee9e'),
      black: ramp('#030305', '#0c0d12', '#1a1c24', '#2a2c36'),
      orange: ramp('#7a2e06', '#c05812', '#ec8a30', '#f6b066'),
      fin: ramp('#030305', '#0c0d12', '#1a1c24', '#f2f2e8', '#ffffff'),
      tail: ramp('#030305', '#0c0d12', '#1a1c24', '#2a2c36', '#ffffff'),
    },
    cs: [0.55, 0.75],
    paint: (u, v) => {
      if (u < 0.12) return v < 0.4 ? 'orange' : 'yellow';
      if (u < 0.17) return 'body';
      if (u < 0.34 - v * 0.04) return 'black';
      if (u < 0.5) return v > 0.5 ? 'yellow' : 'body';
      if (u < 0.74 + v * 0.04) return 'black';
      if (u < 0.86) return 'body';
      return 'yellow';
    },
    eye: { u: 0.22, v: 0.42, r: 0.075, iris: '#2a2c36' },
    finEdge: '#ffffff',
    wiggle: 0.05,
  },
  butterfly: {
    L: 16, H: 11,
    top: [[0, 0.05], [0.06, 0.13], [0.15, 0.34], [0.35, 0.52], [0.6, 0.5], [0.85, 0.26], [1, 0.14]],
    bot: [[0, 0.04], [0.08, 0.16], [0.2, 0.4], [0.45, 0.5], [0.7, 0.4], [0.9, 0.2], [1, 0.14]],
    tail: { kind: 'square', len: 0.22, span: 0.5 },
    fins: [{ at: 'top', u0: 0.3, u1: 0.88, h: 0.2 }, { at: 'bot', u0: 0.5, u1: 0.88, h: 0.2 },
      { at: 'pelvic', u: 0.3, len: 0.14 }, { at: 'pec', u: 0.32, len: 0.14 }],
    ramps: {
      body: ramp('#5a4004', '#8c6806', '#c4960e', '#e8c022', '#f6dc5c', '#fcf0a6'),
      white: ramp('#9c9c94', '#d6d6ce', '#f2f2ea', '#ffffff'),
      black: ramp('#040506', '#10131a', '#1e2230'),
      line: ramp('#6a6658', '#8e8a78', '#b0ac9a'),
      fin: ramp('#8c6806', '#c4960e', '#e8c022', '#f6dc5c', '#1e2230'),
      tail: ramp('#8c6806', '#c4960e', '#e8c022', '#f6dc5c', '#fcf0a6'),
    },
    cs: [0.45, 0.85],
    paint: (u, v) => {
      if (u > 0.07 && u < 0.16) return 'black';
      // an eyespot by the soft dorsal
      const e = Math.hypot((u - 0.74) / 0.075, (v - 0.22) / 0.1);
      if (e < 1) return 'black';
      if (e < 1.5) return 'white';
      if (u < 0.55) return Math.sin((u + v * 0.6) * 46) > 0.6 ? 'line' : 'white';
      return null;
    },
    eye: { u: 0.115, v: 0.36, r: 0.07, iris: '#10131a' },
    finEdge: '#1e2230',
    wiggle: 0.05,
  },
  lionfish: {
    L: 24, H: 9,
    top: [[0, 0.18], [0.08, 0.36], [0.3, 0.5], [0.6, 0.42], [0.85, 0.26], [1, 0.18]],
    bot: [[0, 0.14], [0.1, 0.34], [0.35, 0.5], [0.62, 0.42], [0.9, 0.24], [1, 0.18]],
    tail: { kind: 'round', len: 0.3, span: 0.6 },
    fins: [{ at: 'top', u0: 0.18, u1: 0.56, h: 1.05, spines: 9 }, { at: 'top', u0: 0.56, u1: 0.86, h: 0.36 },
      { at: 'bot', u0: 0.62, u1: 0.82, h: 0.32 }, { at: 'pelvic', u: 0.32, len: 0.24 }, { at: 'fan', u: 0.3, len: 0.62 }],
    ramps: {
      body: ramp('#2a0a08', '#4a1410', '#702218', '#963524', '#bd5a3c', '#d88a68'),
      white: ramp('#a89488', '#dccabe', '#f6ece2', '#fff8f2'),
      fin: ramp('#4a1410', '#702218', '#bd5a3c', '#e8d0c0', '#f6ece2'),
      tail: ramp('#4a1410', '#702218', '#bd5a3c', '#e8d0c0', '#f6ece2'),
    },
    cs: [0.5, 0.85],
    paint: (u, v) => (Math.sin(u * 34 + Math.sin(v * 4) * 1.4 - v * 3) > 0.15 ? 'white' : null),
    eye: { u: 0.11, v: 0.34, r: 0.11, iris: '#c83a20' },
    spotFins: true,
    wiggle: 0.04,
  },
  bream: {
    L: 26, H: 11,
    top: [[0, 0.12], [0.06, 0.3], [0.2, 0.5], [0.45, 0.52], [0.75, 0.36], [1, 0.14]],
    bot: [[0, 0.08], [0.1, 0.3], [0.35, 0.48], [0.6, 0.44], [0.85, 0.24], [1, 0.14]],
    tail: { kind: 'fork', len: 0.26, span: 0.66, notch: 0.45 },
    fins: [{ at: 'top', u0: 0.24, u1: 0.78, h: 0.2, spiny: 11 }, { at: 'bot', u0: 0.6, u1: 0.82, h: 0.2 },
      { at: 'pelvic', u: 0.32, len: 0.16 }, { at: 'pec', u: 0.27, len: 0.2 }],
    ramps: {
      body: ramp('#2a3640', '#41505c', '#606f7a', '#8a97a0', '#b9c2c6', '#e0e6e6', '#f8faf6'),
      gold: ramp('#7a5a0e', '#c49a2c', '#eccb62', '#f8e6a4'),
      dark: ramp('#141a20', '#24303a', '#33414c'),
      line: ramp('#4a5864', '#606f7a', '#7a8892'),
      fin: ramp('#3a4652', '#54626e', '#73828c', '#98a6ae', '#28323c'),
      tail: ramp('#3a4652', '#54626e', '#73828c', '#98a6ae', '#1e262e'),
    },
    cs: [0.2, 0.95],
    paint: (u, v, q) => {
      if (u > 0.04 && u < 0.11 && v > 0.12 && v < 0.34) return 'gold';
      if (Math.hypot((u - 0.26) / 0.04, (v - 0.26) / 0.1) < 1) return 'dark';
      if (u > 0.3 && u < 0.92 && v > 0.3 && v < 0.75 && q.iy % 3 === 0) return 'line';
      return null;
    },
    eye: { u: 0.11, v: 0.36, r: 0.1, iris: '#d8c070' },
    finEdge: '#28323c',
  },
  anchovy: {
    L: 9, H: 2.1,
    top: [[0, 0.12], [0.08, 0.34], [0.3, 0.5], [0.6, 0.46], [0.9, 0.2], [1, 0.14]],
    bot: [[0, 0.06], [0.1, 0.32], [0.35, 0.5], [0.65, 0.44], [0.9, 0.2], [1, 0.14]],
    tail: { kind: 'fork', len: 0.32, span: 0.85, notch: 0.5 },
    fins: [{ at: 'top', u0: 0.45, u1: 0.58, h: 0.4 }],
    ramps: {
      body: ramp('#2a4a5a', '#4a7486', '#7ea4b4', '#c0dae2', '#eef8fa', '#ffffff'),
      stripe: ramp('#a8c8d4', '#e0f2f6', '#ffffff'),
      fin: ramp('#5a7a88', '#7e9cac', '#a8c0cc', '#cfdde4', '#e8f0f4'),
    },
    cs: [0.15, 0.95],
    paint: (u, v) => (Math.abs(v - 0.5) < 0.12 && u > 0.18 ? 'stripe' : null),
    eye: { u: 0.13, v: 0.44, r: 0.22, iris: '#e8f4f8' },
    wiggle: 0.12,
  },
};

/** The ambient species the sea puts on the reef; none of them go in the book. */
export const REEF_FISH = ['tang', 'clown', 'snapper', 'tuna', 'barracuda', 'idol', 'butterfly', 'lionfish', 'bream'];
export const SCHOOL_FISH = ['sardine', 'anchovy'];

/** The description of a species, falling back to the catalogue entry. */
export function fishSpec(id) {
  return SPECIES[id] || SPECIES[FISH_BY_ID[id]?.id] || SPECIES.sardine;
}
/** Body length at scale 1, in world pixels. */
export function fishLength(id) { return fishSpec(id).L; }

// ---------------------------------------------------------------------------
// the painter

const BLACK = [6, 7, 10];
const shadeRGB = (c, k) => (k >= 0
  ? [c[0] + (255 - c[0]) * k, c[1] + (252 - c[1]) * k, c[2] + (240 - c[2]) * k]
  : [c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k)]);
const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function prepare(spec) {
  if (spec._prep) return spec._prep;
  const top = curve(spec.top), bot = curve(spec.bot);
  let tmax = 0, bmax = 0;
  for (let i = 0; i <= 40; i++) { tmax = Math.max(tmax, top(i / 40)); bmax = Math.max(bmax, bot(i / 40)); }
  let finT = 0, finB = 0;
  for (const f of spec.fins) {
    if (f.at === 'top') finT = Math.max(finT, f.h);
    if (f.at === 'bot') finB = Math.max(finB, f.h);
    if (f.at === 'pelvic') finB = Math.max(finB, f.len * 0.9 * spec.L / spec.H * 0.5);
    if (f.at === 'fan') finB = Math.max(finB, f.len * spec.L / spec.H * 0.55);
  }
  finT = Math.max(finT, (spec.tail.span || 0.6) - tmax);
  finB = Math.max(finB, (spec.tail.span || 0.6) - bmax);
  spec._prep = { top, bot, tmax, bmax, finT, finB };
  return spec._prep;
}

/**
 * Paint one frame. `f` is the frame in SWIM_FRAMES, `S` the scale: one world
 * pixel of fish is S pixels of canvas.
 */
function paintFish(spec, f, S) {
  const P = prepare(spec);
  const L = spec.L * S, H = spec.H * S;
  const T = spec.tail;
  const TL = T.len * L;
  const ph = (f / SWIM_FRAMES) * TAU;
  const amp = (spec.wiggle ?? 0.07) * H * 1.6;
  const pad = 2 + Math.ceil(S * 0.5);
  const tailExtra = T.kind === 'lyre' ? 0.35 : T.kind === 'lobe3' ? 0.25 : 0;
  const cw = Math.ceil(L + TL * (1 + tailExtra) + pad * 2 + 1);
  const above = H * (P.tmax + P.finT) + amp;
  const below = H * (P.bmax + P.finB) + amp;
  const ch = Math.ceil(above + below + pad * 2 + 1);
  const xn = cw - pad - 0.5;               // the snout
  const cy0 = pad + above;                 // the spine at rest
  const small = L < 15;

  const N = cw * ch;
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  const A = new Float32Array(N);
  const K = new Uint8Array(N);             // 0 empty, 1 body, 2 fin, 3 eye

  const ramps = spec.ramps;
  const pick = (name, li, x, y) => {
    const r = ramps[name] || ramps.body;
    const n = r.length;
    const b = BAYER[y & 3][x & 3];
    let i = Math.floor(clamp01(li) * (n - 1) + 0.5 + (b - 0.5) * 0.6);
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    return r[i];
  };
  const put = (x, y, c, a, k) => {
    if (x < 0 || y < 0 || x >= cw || y >= ch) return;
    const i = y * cw + x;
    R[i] = c[0]; G[i] = c[1]; B[i] = c[2]; A[i] = a; K[i] = k;
  };

  // the spine: still at the head, swinging more and more toward the tail,
  // with the wave travelling backward down the body
  const W = 2.6;
  const spine = (u) => amp * Math.sin(ph - u * W) * Math.pow(sstep((u - 0.18) / 0.82), 1.3);
  // the tail sweeps across, so from the side it gets shorter and longer, and
  // it is turned a little as it goes - which is what makes it beat
  const sweep = Math.cos(ph - W * 1.05);
  const tlen = TL * (0.88 + 0.12 * Math.abs(sweep));
  const tilt = 0.22 * Math.sin(ph - W * 1.1);

  const q = { ix: 0, iy: 0, S };
  const cs0 = spec.cs ? spec.cs[0] : 0.2, cs1 = spec.cs ? spec.cs[1] : 0.9;

  // ---- body ----------------------------------------------------------------
  for (let x = 0; x < cw; x++) {
    const u = (xn - (x + 0.5)) / L;
    if (u < 0 || u > 1) continue;
    const mid = cy0 + spine(u);
    const t = P.top(u) * H, b = P.bot(u) * H;
    const y0 = Math.floor(mid - t), y1 = Math.ceil(mid + b);
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - mid;
      if (dy < -t || dy > b) continue;
      const v = (dy + t) / Math.max(0.5, t + b);
      // the fish in its own coordinates, so a pattern bends with it
      q.ix = Math.round((xn - x) * 1); q.iy = Math.round(y - mid + above);
      let li = cs0 + (cs1 - cs0) * sstep(v * 1.05 - 0.02);
      // light from the surface: a sheen along the upper flank, the belly
      // falling off into its own shadow, the head a touch brighter
      if (v > 0.1 && v < 0.3) li += 0.12 * Math.sin(((v - 0.1) / 0.2) * Math.PI);
      if (v > 0.86) li -= (v - 0.86) * 1.6;
      if (v < 0.07) li -= 0.08;
      if (u < 0.18) li += 0.05;
      if (u > 0.9) li -= 0.06;
      let name = 'body';
      if (spec.paint) {
        const p = spec.paint(u, v, q);
        if (p) { if (Array.isArray(p)) { name = p[0]; li += p[1]; } else name = p; }
      }
      // the gill cover, a curved line behind the eye
      if (!small && spec.gill !== false) {
        const gu = (spec.gill || 0.215) + 0.035 * (v - 0.45) * (v - 0.45) * 4;
        if (Math.abs(u - gu) < 0.5 / L && v > 0.14 && v < 0.88) li -= 0.22;
        else if (Math.abs(u - gu + 1 / L) < 0.5 / L && v > 0.2 && v < 0.8) li += 0.06;
      }
      put(x, y, pick(name, li, x, y), 1, 1);
    }
  }

  // ---- dorsal, anal, pelvic, finlets -----------------------------------------
  const finRamp = ramps.fin ? 'fin' : 'body';
  const finPix = (x, y, li, edge, ray) => {
    if (x < 0 || y < 0 || x >= cw || y >= ch) return;
    const i = y * cw + x;
    if (K[i] === 1) return;                   // behind the body
    let c = pick(finRamp, li - (ray ? 0.18 : 0), x, y);
    let a = 0.82;
    if (edge && spec.finEdge) { c = rgb(spec.finEdge); a = 0.92; }
    if (spec.spotFins && hash(x >> 1, y >> 1, 31) > 0.72) c = shadeRGB(c, -0.35);
    put(x, y, c, a, 2);
  };
  for (const fin of spec.fins) {
    if (fin.at === 'top' || fin.at === 'bot') {
      const up = fin.at === 'top';
      const hMax = fin.h * H;
      for (let x = 0; x < cw; x++) {
        const u = (xn - (x + 0.5)) / L;
        if (u < fin.u0 - 0.2 || u > fin.u1 + 0.25) continue;
        const mid = cy0 + spine(u);
        const edgeY = up ? mid - P.top(u) * H : mid + P.bot(u) * H;
        for (let k = 0; k <= Math.ceil(hMax) + 1; k++) {
          const z = k + 0.5;                       // height above the contour
          // fins rake backward: the higher up, the further back the base is
          const rake = (fin.sickle ? 0.55 : fin.streamer ? 0.7 : 0.32) * z / L;
          const s = (u - rake - fin.u0) / (fin.u1 - fin.u0);
          if (s < 0 || s > 1) continue;
          let prof;
          if (fin.sickle) prof = s < 0.2 ? Math.pow(s / 0.2, 0.6) : Math.pow(1 - (s - 0.2) / 0.8, 2.2);
          else if (fin.streamer) prof = s < 0.25 ? Math.pow(s / 0.25, 0.5) : Math.max(0, 1 - (s - 0.25) * 2.4);
          else if (fin.lobe) prof = Math.sin(Math.PI * Math.pow(s, 0.8));
          else prof = Math.sin(Math.PI * Math.pow(s, 0.7)) * (0.86 + 0.14 * (1 - s));
          let hh = hMax * prof;
          if (fin.spiny) hh *= 0.78 + 0.22 * Math.abs(Math.cos(s * fin.spiny * Math.PI));
          if (fin.spines) {
            // separate spines with only a little membrane between them
            const sp = s * fin.spines;
            const fr = sp - Math.floor(sp);
            hh = hMax * (0.55 + 0.45 * Math.sin(Math.PI * s)) * (fr < 0.3 ? 1 : 0.32);
          }
          if (z > hh + 0.5) continue;
          const y = up ? Math.floor(edgeY - z) : Math.floor(edgeY + z - 1);
          const ray = !small && (fin.spiny || fin.spines ? Math.floor(s * (fin.spiny || fin.spines) * 2) % 2 === 0
            : Math.floor((xn - x) / Math.max(2, S * 1.5)) % 2 === 0);
          const edge = z > hh - 1 && hh > 2;
          let li = 0.45 + (up ? 0.05 : -0.05) - (fin.lobe && z < hMax * 0.35 ? 0.15 : 0);
          finPix(x, y, li, edge, ray);
        }
      }
      // the idol's dorsal runs on into a long white streamer trailing back
      if (fin.streamer) {
        const u0 = fin.u0 + (fin.u1 - fin.u0) * 0.22;
        for (let k = 0; k <= 40; k++) {
          const tt = k / 40;
          const u = u0 + tt * 0.75;
          const mid = cy0 + spine(Math.min(1, u));
          const yy = mid - P.top(Math.min(1, u)) * H - hMax * (1 - tt * 0.55) - Math.sin(tt * Math.PI) * H * 0.12;
          const xx = Math.round(xn - u * L);
          put(xx, Math.round(yy), rgb('#f4f4ea'), 0.95, 2);
          if (S >= 2) put(xx, Math.round(yy) + 1, rgb('#d8d8cc'), 0.9, 2);
        }
      }
    } else if (fin.at === 'pelvic') {
      // a small fin under the belly, pointing down and back
      const u = fin.u;
      const mid = cy0 + spine(u);
      const by = mid + P.bot(u) * H;
      const len = fin.len * L;
      const n = Math.max(2, Math.round(len));
      for (let k = 0; k < n; k++) {
        const tt = k / n;
        const xx = xn - (u + tt * fin.len * 0.75) * L;
        const yy = by + tt * len * 0.55 - 0.5;
        const w = Math.max(1, Math.round((1 - tt) * Math.max(1, S * (fin.lobe ? 2 : 1.4))));
        for (let j = 0; j < w; j++) finPix(Math.floor(xx + j), Math.floor(yy), 0.4, k === n - 1, false);
      }
    } else if (fin.finlets) {
      // the row of little yellow flags along the back and belly of a tuna
      const n = fin.finlets;
      for (let k = 0; k < n; k++) {
        const u = fin.u0 + (fin.u1 - fin.u0) * (k / (n - 1));
        const mid = cy0 + spine(u);
        const xx = Math.round(xn - u * L);
        const ht = Math.max(1, Math.round(H * 0.07 * (1.2 - k / n * 0.5)));
        const rr = spec.finletRamp || finRamp;
        for (const up of [true, false]) {
          const ey = up ? mid - P.top(u) * H : mid + P.bot(u) * H;
          for (let j = 1; j <= ht; j++) {
            const yy = Math.floor(up ? ey - j : ey + j - 1);
            const i = yy * cw + xx;
            if (xx < 0 || yy < 0 || xx >= cw || yy >= ch || K[i] === 1) continue;
            put(xx, yy, pick(rr, 0.6 - j * 0.1, xx, yy), 0.95, 2);
            if (j === 1 && S > 1.2) put(xx - 1, yy, pick(rr, 0.4, xx - 1, yy), 0.9, 2);
          }
        }
      }
    }
  }

  // ---- the tail ---------------------------------------------------------------
  {
    const tailR = ramps.tail ? 'tail' : finRamp;
    const span = (T.span || 0.6) * H;
    const base = Math.max(1, P.top(1) * H), baseB = Math.max(1, P.bot(1) * H);
    const ext = 1 + tailExtra;
    for (let x = 0; x < cw; x++) {
      const du = (xn - (x + 0.5)) - L;          // pixels behind the base of the tail
      if (du < -0.5 || du > tlen * ext + 1) continue;
      const tt = du / tlen;                      // 0 at the base, 1 at the end
      const mid = cy0 + spine(1 + du / L * 0.6) + tilt * du * 0.5;
      const reach = T.kind === 'round' ? 1.05 : 1.0;
      for (let y = Math.floor(mid - span - 2); y <= Math.ceil(mid + span + 2); y++) {
        const dy = y + 0.5 - mid;
        const a = Math.abs(dy) / span;           // 0 centre .. 1 the tip
        const half = dy < 0 ? base : baseB;
        let inside = false;
        switch (T.kind) {
          case 'fork': case 'lyre': {
            const lead = half + (span - half) * sstep(tt / 0.75);
            const notch = T.notch ?? 0.5;
            let trail = notch + (1 - notch) * Math.pow(a, 1.3);
            if (T.kind === 'lyre' && a > 0.82) trail += 0.3;
            inside = Math.abs(dy) <= lead && tt <= trail && tt >= 0;
            break;
          }
          case 'lunate': {
            // a crescent: a short stalk, then two long blades curving back
            const stalk = 0.22;
            if (tt < stalk) inside = Math.abs(dy) <= half * (1 - tt / stalk * 0.35);
            else {
              const lead = half * 0.65 + (span - half * 0.65) * sstep((tt - stalk) / 0.7);
              const front = stalk + 0.3 * Math.pow(a, 2);
              const trail = (T.notch ?? 0.45) + (1 - (T.notch ?? 0.45)) * Math.pow(a, 1.15);
              inside = Math.abs(dy) <= lead && tt >= front - 0.02 && tt <= trail;
              if (a < 0.2 && tt < stalk + 0.15) inside = true;
            }
            break;
          }
          case 'round': {
            const lead = half + (span - half) * Math.sin(Math.min(1, tt / 0.7) * Math.PI / 2);
            inside = Math.abs(dy) <= lead && tt <= reach - 0.35 * a * a;
            break;
          }
          case 'square': {
            const lead = half + (span - half) * sstep(tt / 0.6);
            inside = Math.abs(dy) <= lead && tt <= 1 - 0.06 * a;
            break;
          }
          case 'lobe3': {
            const lead = half + (span - half) * Math.sin(Math.min(1, tt / 0.6) * Math.PI / 2);
            inside = (Math.abs(dy) <= lead && tt <= 0.92 - 0.3 * a * a)
              || (Math.abs(dy) <= Math.max(1, H * 0.07) * (1.3 - tt * 0.6) && tt <= 1.24);
            break;
          }
          default: inside = Math.abs(dy) <= half && tt <= 1;
        }
        if (!inside) continue;
        const i = y * cw + x;
        if (y < 0 || y >= ch || K[i] === 1) continue;
        // the rays, fanning out from the wrist
        const ang = Math.atan2(dy, du + 2 * S);
        const ray = !small && Math.floor(ang * (4 + S * 2) + 40) % 2 === 0;
        let li = 0.5 - (dy > 0 ? 0.06 : 0) - (ray ? 0.16 : 0) + (tt < 0.15 ? -0.08 : 0);
        let c = pick(tailR, li, x, y);
        let al = tt < 0.3 ? 0.95 : 0.82;
        // the trailing edge
        if (spec.finEdge && tt > 0.62 && (T.kind !== 'fork' || a > 0.1)) {
          const nx = x - 1, ok = nx >= 0;
          const behind = ok ? (xn - (nx + 0.5)) - L : 1e9;
          if (behind / tlen > (T.kind === 'round' ? reach - 0.35 * a * a : 1) - 1.4 / tlen) { c = rgb(spec.finEdge); al = 0.95; }
        }
        if (spec.spotFins && hash(x >> 1, y >> 1, 37) > 0.7) c = shadeRGB(c, -0.35);
        put(x, y, c, al, 2);
      }
    }
  }

  // ---- the pectoral fin, over the flank behind the gill -------------------------
  for (const fin of spec.fins) {
    if (fin.at !== 'pec' && fin.at !== 'fan') continue;
    const u = fin.u;
    const mid = cy0 + spine(u);
    const ex = xn - u * L, ey = mid + (P.bot(u) * H - P.top(u) * H) * 0.5 + H * 0.06;
    const len = fin.len * L;
    if (fin.at === 'fan') {
      // the lionfish's fan: a spread of long rays with membrane between them
      const nr = 7;
      for (let r = 0; r < nr; r++) {
        const aa = 0.35 + (r / (nr - 1)) * 1.25 + Math.sin(ph) * 0.06;
        const lr = len * (0.7 + 0.3 * Math.sin((r / (nr - 1)) * Math.PI));
        for (let k = 0; k < lr; k++) {
          const xx = Math.round(ex - Math.cos(aa) * k), yy = Math.round(ey + Math.sin(aa) * k * 0.9);
          const i = yy * cw + xx;
          if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
          const c = (Math.floor(k / Math.max(2, S * 2)) % 2) ? rgb('#f2e4d8') : rgb('#8a2a1c');
          if (K[i] === 1) { R[i] = R[i] * 0.4 + c[0] * 0.6; G[i] = G[i] * 0.4 + c[1] * 0.6; B[i] = B[i] * 0.4 + c[2] * 0.6; }
          else put(xx, yy, c, 0.9, 2);
          // membrane, thin and see-through
          if (r < nr - 1 && k > 1 && k % 2 === 0) {
            const mx = Math.round(ex - Math.cos(aa + 0.1) * k), my = Math.round(ey + Math.sin(aa + 0.1) * k * 0.9);
            const j = my * cw + mx;
            if (mx >= 0 && my >= 0 && mx < cw && my < ch && !K[j]) put(mx, my, rgb('#d8a898'), 0.45, 2);
          }
        }
      }
      continue;
    }
    const ang = (fin.sickle ? 0.22 : 0.45) + Math.sin(ph + 1.2) * 0.22;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const wR = Math.max(1, (fin.round ? 0.42 : fin.sickle ? 0.16 : 0.3) * len);
    for (let y = Math.floor(ey - len - 2); y <= ey + len + 2; y++) {
      for (let x = Math.floor(ex - len - 2); x <= ex + 2; x++) {
        if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
        // along the fin (backward) and across it
        const px = ex - (x + 0.5), py = y + 0.5 - ey;
        const al = px * ca + py * sa, ac = -px * sa + py * ca;
        if (al < 0 || al > len) continue;
        const tt = al / len;
        const w = wR * (fin.sickle ? (1 - tt) * 1.1 : Math.sin(Math.PI * Math.min(1, tt * 0.9 + 0.08)));
        if (Math.abs(ac) > w) continue;
        const i = y * cw + x;
        const ray = !small && Math.floor((ac + 20) / Math.max(1, S)) % 2 === 0;
        const rim = Math.abs(ac) > w - 1 || tt > 0.93;
        let c = pick(finRamp, (fin.lobe ? 0.3 : 0.62) - (ray ? 0.14 : 0) - (rim ? 0.22 : 0) + (fin.lobe && tt < 0.4 ? -0.1 : 0), x, y);
        if (fin.lobe && tt < 0.4) c = pick('body', 0.45, x, y);
        if (K[i] === 1) {
          const k2 = rim ? 0.75 : 0.55;
          R[i] = R[i] * (1 - k2) + c[0] * k2; G[i] = G[i] * (1 - k2) + c[1] * k2; B[i] = B[i] * (1 - k2) + c[2] * k2;
        } else put(x, y, c, 0.85, 2);
      }
    }
  }

  // ---- the eye ------------------------------------------------------------------
  {
    const E = spec.eye;
    const mid = cy0 + spine(E.u);
    const t = P.top(E.u) * H, b = P.bot(E.u) * H;
    const ex = xn - E.u * L, ey = mid - t + E.v * (t + b);
    const r = Math.max(0.9, E.r * H);
    const iris = E.iris ? rgb(E.iris) : [200, 190, 120];
    if (spec.blind) {
      // a pale scar where the eye should be
      const xi = Math.round(ex - 0.5), yi = Math.round(ey - 0.5);
      const i = yi * cw + xi;
      if (K[i]) { R[i] *= 0.88; G[i] *= 0.86; B[i] *= 0.86; }
    } else if (r < 1.4) {
      put(Math.round(ex - 0.5), Math.round(ey - 0.5), BLACK, 1, 3);
      if (L >= 10) put(Math.round(ex + 0.5), Math.round(ey - 0.5), mixRGB(iris, BLACK, 0.4), 1, 3);
    } else {
      for (let y = Math.floor(ey - r - 1); y <= ey + r + 1; y++) {
        for (let x = Math.floor(ex - r - 1); x <= ex + r + 1; x++) {
          const d = Math.hypot(x + 0.5 - ex, y + 0.5 - ey);
          if (d > r) continue;
          let c;
          if (d > r - 1) c = r > 2.2 ? mixRGB(iris, BLACK, 0.55) : iris;      // the ring
          else if (d > r * 0.55 && r > 2.2) c = iris;
          else c = BLACK;
          if (E.shine && d <= r * 0.55) c = mixRGB(iris, BLACK, 0.6);
          put(x, y, c, 1, 3);
        }
      }
      // the catchlight, up and forward
      const hx = Math.round(ex + r * 0.3 - 0.5), hy = Math.round(ey - r * 0.38 - 0.5);
      put(hx, hy, [255, 255, 255], 1, 3);
      if (r > 3) put(hx - 1, hy, [214, 230, 238], 1, 3);
    }
  }

  // ---- the mouth -----------------------------------------------------------------
  {
    const M = spec.mouth || {};
    const mv = M.v ?? 0.58;
    const n = Math.max(1, Math.round((M.big || M.jaw ? 0.13 : 0.035) * L));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / L;
      const mid = cy0 + spine(u);
      const t = P.top(u) * H, b = P.bot(u) * H;
      const y = Math.round(mid - t + mv * (t + b) - 0.5 + (M.big ? k * 0.08 : 0));
      const x = Math.round(xn - u * L - 0.5);
      const i = y * cw + x;
      if (x < 0 || y < 0 || x >= cw || y >= ch || !K[i]) continue;
      if (M.beak) { put(x, y, k === 0 ? [240, 238, 226] : [120, 110, 96], 1, 1); continue; }
      put(x, y, shadeRGB([R[i], G[i], B[i]], -0.6), 1, 1);
      // a barracuda shows its teeth
      if (M.jaw && k % 2 === 1 && k > 1 && S >= 1) put(x, y + 1, [236, 236, 228], 1, 1);
    }
  }

  // ---- outline, and out ------------------------------------------------------------
  const cv = makeCanvas(cw, ch);
  const g = cv.getContext('2d');
  const img = g.createImageData(cw, ch);
  const D = img.data;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x, o = i * 4;
      if (K[i]) {
        D[o] = R[i]; D[o + 1] = G[i]; D[o + 2] = B[i]; D[o + 3] = Math.round(255 * A[i]);
        continue;
      }
      // the line round it takes the colour of whatever it is next to, darkened
      let j = -1, body = false;
      const nb = [x > 0 ? i - 1 : -1, x < cw - 1 ? i + 1 : -1, y > 0 ? i - cw : -1, y < ch - 1 ? i + cw : -1];
      for (const n of nb) {
        if (n < 0 || !K[n]) continue;
        if (K[n] !== 2) { j = n; body = true; break; }
        if (j < 0) j = n;
      }
      if (j < 0) continue;
      const k = body ? 0.34 : 0.5;
      D[o] = R[j] * k; D[o + 1] = G[j] * k; D[o + 2] = B[j] * k * 1.05; D[o + 3] = body ? 255 : 200;
    }
  }
  g.putImageData(img, 0, 0);
  return { cv, ox: Math.round(xn - L * 0.5), oy: Math.round(cy0), L, H, w: cw, h: ch, tail: Math.round(xn - L - tlen) };
}

// ---------------------------------------------------------------------------

const cache = new Map();
const MAX_CACHE = 900;

/**
 * One frame of the full swim cycle, facing right, painted at scale S. The
 * sea asks for these at the size the fish is on screen.
 */
export function swimFrame(id, frame, S = 1) {
  const f = ((frame % SWIM_FRAMES) + SWIM_FRAMES) % SWIM_FRAMES;
  const key = `${id}:${f}:${S}`;
  let v = cache.get(key);
  if (!v) {
    if (cache.size > MAX_CACHE) cache.clear();
    v = paintFish(fishSpec(id), f, S);
    cache.set(key, v);
  }
  return v;
}

/** Whether a frame is already painted, for callers that bake on a budget. */
export function hasSwimFrame(id, frame, S) { return cache.has(`${id}:${frame % SWIM_FRAMES}:${S}`); }

/** One frame of one fish, facing right - the four-frame cycle the interface uses. */
export function fishFrame(id, frame = 0, S = 1) {
  return swimFrame(id, (frame % FISH_FRAMES) * (SWIM_FRAMES / FISH_FRAMES), S);
}
