// CRABDEN - Dr. Elias Vess, close up, painted by code.
//
// There is no image behind this. His head is a small sculpture worked out per
// pixel: a skull-shaped heightfield with a nose ridge, a brow ridge, cheekbones,
// a chin and eye sockets pressed into it, lit by the sun from up and to the
// left and quantised onto hand-picked colour ramps - so the shading follows the
// planes of a face instead of being a gradient laid over a flat shape. His hair
// is a stack of tapered locks, each shaded across its own width with a sheen
// band on the lit side. The hat is a crown and a brim with the red band and
// the brass goggles. The features - eyes, brows, mouth, stubble, glasses - are
// placed as pixel work on top, because at this size an eye is six pixels and
// every one of them is a decision.
//
// Then the finish every good sprite has: a selective outline, darker contact
// lines where a nearer part crosses a further one, a warm rim light down the
// side turned away from the sun, and a cast shadow from the brim.
//
// He is alive on the card. A FaceLife owns the clock: he blinks (sometimes
// twice), his eyes dart about, his shoulders rise and fall with his breath,
// his head lags the breath by a beat and nods on the stressed syllables, his
// mouth moves through three openings in a rhythm that is not a metronome, and
// his brows flash up when he leans into a point. Each combination of those is
// baked once into a canvas and kept, so a frame is two drawImage calls.

import { makeCanvas } from '../render/pixel.js';

export const FACE_W = 59;
export const FACE_H = 64;
const W = FACE_W, H = FACE_H, N = W * H;

/** Where the card should centre: the bridge of his nose, just under the brim. */
export const FACE_EYE = { x: 28, y: 22 };

// ---------------------------------------------------------------------------
// colour ramps, darkest first

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ramp = (...h) => h.map(hex);

const M = {
  NONE: 0, SKIN: 1, HAIR: 2, HAT: 3, BAND: 4, BRASS: 5, GLENS: 6, SHIRT: 7, LEATHER: 8,
  SCARF: 9, EYEW: 10, IRIS: 11, LIP: 12, MOUTH: 13, TEETH: 14, FRAME: 15, STUB: 16, BOTTLE: 17,
  LASH: 18, ROLL: 19, WISP: 20,
};
const RAMPS = [];
RAMPS[M.SKIN] = ramp('#3a1a14', '#683024', '#904a34', '#b26848', '#cd865e', '#e2a276', '#f2be92', '#fcdab4');
RAMPS[M.HAIR] = ramp('#1a0c07', '#2c150c', '#432214', '#5c311d', '#7a4427', '#9c5c33', '#bf7b45', '#e0a467');
RAMPS[M.HAT] = ramp('#2e2014', '#58402a', '#82643f', '#a8885c', '#c6a878', '#dcc496', '#ecdcb4', '#faf0d8');
RAMPS[M.BAND] = ramp('#2c0b08', '#561710', '#7e241a', '#a33728', '#c4513a', '#df7552');
RAMPS[M.BRASS] = ramp('#2a1707', '#5c3a13', '#916023', '#c08a37', '#e3b354', '#fbe39c');
RAMPS[M.GLENS] = ramp('#121e3c', '#223a72', '#3858a4', '#5f86cc', '#9cbcee', '#e6f0ff');
RAMPS[M.SHIRT] = ramp('#2a2418', '#52483a', '#7a6e56', '#a39577', '#c4b694', '#dcd0ae', '#eee5c9', '#fbf6e6');
RAMPS[M.LEATHER] = ramp('#170c07', '#2c170d', '#452615', '#62391f', '#82502c', '#a66d3e');
RAMPS[M.SCARF] = ramp('#2a0a07', '#52150e', '#7c2318', '#a33626', '#c34e34', '#de704b', '#f09468');
RAMPS[M.EYEW] = ramp('#6e5a52', '#b7a69a', '#e2d6c8', '#f8f1e6');
RAMPS[M.IRIS] = ramp('#0e0604', '#2e180a', '#5a3414', '#86541f', '#b07a32', '#d8a452', '#ffffff');
RAMPS[M.LIP] = ramp('#3a140e', '#62261c', '#87402e', '#a65a44', '#c27458', '#d88e72');
RAMPS[M.MOUTH] = ramp('#1e0806', '#3c120c', '#5e1f16', '#8a3426', '#b14e3c');
RAMPS[M.TEETH] = ramp('#8e7c70', '#c8b8a8', '#ece2d4', '#fffaf0');
RAMPS[M.FRAME] = ramp('#140a06', '#2e1c10', '#54351a', '#8a6030', '#c8964a', '#f2cc7a');
RAMPS[M.STUB] = RAMPS[M.SKIN].map((c, i) => mix(c, RAMPS[M.HAIR][Math.max(0, i - 2)], 0.3));
RAMPS[M.BOTTLE] = ramp('#0e1a0c', '#1e3216', '#2f4c22', '#4a6e34', '#7aa05a', '#c4e6a0');
RAMPS[M.LASH] = ramp('#0c0504', '#1e0f09', '#36190f');
RAMPS[M.ROLL] = ramp('#2a2218', '#4e4230', '#746448', '#9a8862', '#bcaa80', '#d8c89e');
RAMPS[M.WISP] = ramp('#3a1c66', '#6a3aa8', '#9a66dc', '#c49cf6', '#ecdcff');

const OUTLINE = hex('#140a06');
const SPORE = hex('#a26cd0');

// ---------------------------------------------------------------------------
// small maths

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const g2 = (u, v, x, y, s) => Math.exp(-((u - x) ** 2 + (v - y) ** 2) / (2 * s * s));
function gLine(u, v, x0, y0, x1, y1, s) {
  const dx = x1 - x0, dy = y1 - y0;
  const t = clamp(((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = x0 + dx * t, py = y0 + dy * t;
  return Math.exp(-((u - px) ** 2 + (v - py) ** 2) / (2 * s * s));
}
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

const L = (() => { const v = [-0.62, -0.58, 0.53]; const m = Math.hypot(...v); return v.map((c) => c / m); })();

/** A closed Catmull-Rom curve through `pts`, as a dense polygon. */
function smoothPoly(pts, steps = 6) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// ---------------------------------------------------------------------------
// the shapes, in head space (which is canvas space when the head is upright)

const FACE = smoothPoly([
  [18.0, 17.5], [26, 16.8], [35.8, 17.5], [36.0, 24], [35.7, 29.5], [35.2, 33.0], [34.4, 35.6], [33.6, 36.8],
  [30.4, 39.8], [27.4, 42.3], [25.0, 43.0], [22.4, 42.8], [20.8, 41.8], [20.1, 39.9],
  [19.4, 37.4], [18.9, 35.2], [18.5, 33.8], [18.4, 30.4], [17.6, 27.4], [17.3, 23.6], [17.5, 20],
]);
// the nose, standing proud of the far cheek: bridge, tip and the wing
const NOSE = smoothPoly([[21.0, 27.0], [19.0, 30.2], [17.0, 32.4], [17.6, 33.6], [20.4, 33.9], [22.8, 33.0], [22.6, 29.4]], 5);
const NECK = smoothPoly([[23.8, 38.6], [33.8, 35.6], [35.2, 44], [37.2, 56], [20.4, 56], [21.8, 46]], 5);
const EAR = { x: 35.7, y: 29.6, rx: 2.3, ry: 3.7 };

/** Where the front of the face turns into the side of it. */
const CHEEK = [[16, 31.8], [24, 32.0], [30, 33.0], [34, 32.6], [37, 31.0], [40, 28.4], [43.5, 25.0]];
function cheekLine(v) {
  if (v <= CHEEK[0][0]) return CHEEK[0][1];
  for (let i = 1; i < CHEEK.length; i++) {
    if (v <= CHEEK[i][0]) { const [a, x0] = CHEEK[i - 1], [b, x1] = CHEEK[i]; return x0 + (x1 - x0) * (v - a) / (b - a); }
  }
  return CHEEK[CHEEK.length - 1][1];
}

/** The face as a relief: what the light falls on. */
function relief(u, v) {
  const dx = (u - 29.5) / 12, dy = (v - 29.5) / 15.5;
  const q = 1 - dx * dx - dy * dy;
  let h = q > 0 ? 12 * Math.sqrt(q) : 0;
  h += gLine(u, v, 23.0, 25.5, 20.0, 31.6, 1.05) * 2.4;     // nose ridge
  h += g2(u, v, 19.9, 32.0, 1.25) * 1.5;                    // tip
  h += g2(u, v, 22.6, 33.0, 0.95) * 0.9;                    // the wing of the nostril
  h -= g2(u, v, 29.2, 27.4, 2.0) * 1.7;                     // near socket
  h -= g2(u, v, 19.8, 27.6, 1.5) * 1.1;                     // far socket
  h += gLine(u, v, 17.8, 24.6, 32.5, 23.8, 1.0) * 1.1;      // brow ridge
  h += g2(u, v, 31.0, 31.0, 2.2) * 1.5;                     // near cheekbone
  h -= g2(u, v, 30.6, 35.6, 1.8) * 1.1;                     // the hollow under it
  h += g2(u, v, 24.2, 40.8, 2.0) * 1.6;                     // chin
  h += gLine(u, v, 33.0, 37.0, 27.0, 42.2, 0.9) * 0.9;      // the jawline, which is the point
  return h;
}
function faceLight(u, v) {
  const e = 0.5;
  const gx = (relief(u + e, v) - relief(u - e, v)) / (2 * e);
  const gy = (relief(u, v + e) - relief(u, v - e)) / (2 * e);
  const m = Math.hypot(gx, gy, 1);
  const nx = -gx / m, ny = -gy / m, nz = 1 / m;
  return { d: Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), nx };
}

// The hair: tapered locks, back to front. [x0,y0, cx,cy, x1,y1, width]
const BACK_LOCKS = [
  [20, 15, 14.8, 18.2, 13.6, 23.2, 4.2],
  [23, 15.5, 17.4, 19.2, 16.0, 22.4, 3.2],
];
// The hair behind the ear: one sculpted mass, full under the brim and
// breaking into curled ends where it meets the collar.
const HAIR_MASS = smoothPoly([
  [32.6, 14.0], [40, 13.2], [46, 14.8], [49.6, 17.2], [51.4, 20.0], [52.6, 22.4], [50.6, 22.6], [50.2, 24.8],
  [51.0, 27.8], [48.6, 27.6], [47.2, 30.2], [47.6, 33.0], [45.2, 32.2], [43.0, 34.0], [42.4, 37.2],
  [40.4, 35.4], [38.2, 36.2], [36.6, 34.6], [34.6, 31.0], [33.4, 25.0],
].map(([x, y]) => [36 + (x - 36) * 0.9, y]), 5);
function massLvl(u, v) {
  const cx = 38.5, cy = 21.5, r = 13.5;
  const nx = (u - cx) / r, ny = (v - cy) / r;
  const q = 1 - nx * nx - ny * ny;
  const nz = Math.sqrt(Math.max(0.04, q));
  const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  let s = 0.22 + d * 0.6;
  // strands: grooves that follow the way it is brushed, back and down
  const flow = Math.atan2(v - 12, u - 30) * 9 + Math.hypot(u - 30, v - 12) * 0.12 + Math.sin(v * 0.5) * 0.5;
  const f = ((flow / 3.4) % 1 + 1) % 1;
  if (f < 0.14) s -= 0.18;
  else if (f > 0.55 && f < 0.75) s += 0.08;
  // the ring of sheen across the crown of it
  const rr = Math.hypot(nx, ny);
  if (rr > 0.36 && rr < 0.6 && nx < 0.3 && ny < 0.45 && f > 0.2) s += 0.32;
  // dark where it tucks in under the brim and behind the ear
  s -= sstep(15.6, 13.6, v) * 0.25;
  s -= g2(u, v, 35.2, 29.5, 2.4) * 0.22;
  return toLvl(M.HAIR, s);
}
const FRONT_LOCKS = [
  [33.6, 17, 35.0, 25.5, 33.8, 31.4, 2.6],      // sideburn
  [34.4, 16.5, 35.0, 21.5, 31.8, 24.4, 3.4],    // near temple
  [33.0, 16.5, 32.6, 21.0, 30.4, 24.6, 3.0],
  [31.5, 16.5, 28.8, 20.8, 24.6, 23.4, 4.6],    // the fringe, swept to the front
  [27.5, 16.5, 23.0, 19.8, 19.6, 23.0, 4.2],
  [23.5, 16.8, 19.4, 19.4, 17.0, 22.8, 3.4],
  [30.0, 18.0, 28.2, 21.8, 28.0, 24.4, 1.8],    // one strand that will not stay put
];
function prepLocks(list) {
  return list.map(([x0, y0, cx, cy, x1, y1, w]) => {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      pts.push([a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1, t]);
    }
    let x0b = 1e9, y0b = 1e9, x1b = -1e9, y1b = -1e9;
    for (const p of pts) { x0b = Math.min(x0b, p[0]); y0b = Math.min(y0b, p[1]); x1b = Math.max(x1b, p[0]); y1b = Math.max(y1b, p[1]); }
    return { pts, w, bb: [x0b - w, y0b - w, x1b + w, y1b + w] };
  });
}
const BACK = prepLocks(BACK_LOCKS);
const FRONT = prepLocks(FRONT_LOCKS);

/** Inside a lock? Returns how far along it, and how far across (-1..1, + toward the light). */
function lockAt(lk, u, v) {
  const [a, b, c, d] = lk.bb;
  if (u < a || u > c || v < b || v > d) return null;
  let best = 1e9, bt = 0, side = 0, tx = 0, ty = 0;
  const P = lk.pts;
  for (let i = 1; i < P.length; i++) {
    const [x0, y0, t0] = P[i - 1], [x1, y1, t1] = P[i];
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-6;
    const k = clamp(((u - x0) * dx + (v - y0) * dy) / l2, 0, 1);
    const px = x0 + dx * k, py = y0 + dy * k;
    const dd = (u - px) ** 2 + (v - py) ** 2;
    if (dd < best) { best = dd; bt = t0 + (t1 - t0) * k; side = (u - px) * -dy + (v - py) * dx; tx = dx; ty = dy; }
  }
  const r = (lk.w / 2) * Math.pow(1 - bt, lk.w > 4.5 ? 0.42 : 0.55) + 0.2;
  const dist = Math.sqrt(best);
  if (dist > r) return null;
  const m = Math.hypot(tx, ty) || 1;
  // which side of the lock faces the sun
  const nx = -ty / m, ny = tx / m;
  const lit = Math.sign(nx * L[0] + ny * L[1]) || 1;
  return { t: bt, across: (Math.sign(side) * dist / r) * lit };
}

// ---- the hat (in its own space, tipped a touch over his eyes) --------------
const HAT_ROT = -0.06, HAT_PX = 29, HAT_PY = 14;
const BRIM = { x: 29.5, y: 15.2, rx: 25.5, ry: 4.9 };
const crownBase = (u) => BRIM.y + 2.5 * Math.sqrt(Math.max(0, 1 - ((u - 29.5) / 14.6) ** 2));
const crownHalf = (v) => 14.0 - (14 - v) * 0.17;
const crownTop = (u) => 3.0 + 7.5 * ((u - 29.5) / 13.6) ** 4 + 0.7 * g2(u, 0, 29.5, 0, 2.4);
const GOGGLES = [{ x: 18.6, y: 12.2, r: 2.6 }, { x: 24.0, y: 12.8, r: 2.4 }];

// ---------------------------------------------------------------------------
// the expressions

/**
 * What each of his faces does. Brows are [innerDy, outerDy] per side (near,
 * far), negative is up. `eye` is the lid, `mouth` its shape and how open it
 * sits, `tilt` and `dy` how he holds his head.
 */
const EXPR = {
  flat:   { eye: 'open', brow: [[0, 0], [0, 0]], mouth: 'line', open: 0 },
  talk:   { eye: 'open', brow: [[-1, 0], [-1, 0]], mouth: 'line', open: 1 },
  grin:   { eye: 'smile', brow: [[-1, -1], [-1, -1]], mouth: 'grin', open: 0, tilt: 0.03 },
  laugh:  { eye: 'happy', brow: [[-1, -1], [-1, -1]], mouth: 'laugh', open: 2, tilt: -0.04, dy: -1 },
  joy:    { eye: 'happy', brow: [[-2, -1], [-2, -1]], mouth: 'smile', open: 1, tilt: -0.02 },
  drink:  { eye: 'closed', brow: [[-1, 0], [-1, 0]], mouth: 'drink', open: 0, tilt: -0.05, dy: -1, prop: 'bottle' },
  smug:   { eye: 'half', brow: [[1, 0], [-2, -2]], mouth: 'smirk', open: 0, tilt: 0.05 },
  squint: { eye: 'squint', brow: [[1, 0], [1, 0]], mouth: 'line', open: 0, gaze: -1 },
  frown:  { eye: 'open', brow: [[2, 0], [2, 0]], mouth: 'frown', open: 0 },
  glare:  { eye: 'squint', brow: [[2, -1], [2, -1]], mouth: 'tight', open: 0, gaze: -1, tilt: 0.03, dy: 1 },
  shut:   { eye: 'closed', brow: [[0, 0], [0, 0]], mouth: 'line', open: 0 },
  peer:   { eye: 'peer', brow: [[1, 1], [-2, -1]], mouth: 'smirk', open: 0, tilt: 0.06, gaze: -1 },
  gasp:   { eye: 'wide', brow: [[-2, -2], [-2, -2]], mouth: 'o', open: 1, dy: -1 },
  blank:  { eye: 'blank', brow: [[0, 0], [0, 0]], mouth: 'small', open: 0, glare: 1 },
  shout:  { eye: 'wide', brow: [[2, -1], [2, -1]], mouth: 'shout', open: 3, tilt: 0.02, dy: -1 },
  scowl:  { eye: 'squint', brow: [[2, -1], [2, -1]], mouth: 'frown', open: 0, dy: 1 },
  dull:   { eye: 'half', brow: [[1, 1], [1, 1]], mouth: 'small', open: 0 },
  sad:    { eye: 'open', brow: [[-2, 1], [-2, 1]], mouth: 'frown', open: 0, gazeY: 1, tilt: 0.05, dy: 1 },
  tired:  { eye: 'half', brow: [[-1, 1], [-1, 1]], mouth: 'line', open: 0, tilt: 0.06, dy: 1, gazeY: 1 },
  sleep:  { eye: 'closed', brow: [[-1, 1], [-1, 1]], mouth: 'slack', open: 1, tilt: 0.09, dy: 2 },
  spore:  { eye: 'spore', brow: [[0, 0], [0, 0]], mouth: 'slack', open: 1, tilt: 0.02, wisps: 1 },
};
export const FACE_NAMES = Object.keys(EXPR);
export const hasFace = (name) => !!EXPR[name];

/** The faces whose eyes are already shut, which have no blink to do. */
const SHUT = new Set(['closed', 'happy']);

// ---------------------------------------------------------------------------
// the painter

class Canvas {
  constructor() {
    this.mat = new Uint8Array(N);
    this.lvl = new Int8Array(N);
    this.part = new Uint8Array(N);
    this.tint = new Uint8Array(N);
  }
  set(x, y, mat, lvl, part) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    this.mat[i] = mat; this.lvl[i] = lvl;
    if (part !== undefined) this.part[i] = part;
  }
  get(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? 0 : this.mat[y * W + x]; }
  shift(x, y, d, only) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (!this.mat[i] || (only && !only.includes(this.mat[i]))) return;
    this.lvl[i] += d;
  }
}

const P = { BACKHAIR: 1, NECK: 2, EAR: 3, FACE: 4, PROP: 5, FRONTHAIR: 6, BRIM: 7, CROWN: 8, BRIMF: 9, GOG: 10, BODY: 11 };

/** Map 0..1 of light onto a ramp, keeping the darkest step for lines. */
const toLvl = (mat, s, lo = 1) => {
  const n = RAMPS[mat].length;
  return clamp(Math.round(lo + clamp(s, 0, 1) * (n - 1 - lo)), lo, n - 1);
};

/**
 * Where head space lands on the canvas. The head is authored small and
 * scaled up about the brow so the face fills the card; then it tips about
 * the neck and drops by `dy` for whatever he is feeling.
 */
const SC = 1.16, S0X = 28.5, S0Y = 18;
function poseXf(rot, oy) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const PX = 29, PY = 50;
  const toHead = (x, y) => {
    const dx = x - PX, dy = y - PY - oy;
    const qx = PX + dx * cs + dy * sn, qy = PY - dx * sn + dy * cs;
    return [S0X + (qx - S0X) / SC, S0Y + (qy - S0Y) / SC];
  };
  const toCv = (u, v) => {
    const qx = S0X + (u - S0X) * SC, qy = S0Y + (v - S0Y) * SC;
    const dx = qx - PX, dy = qy - PY;
    return [PX + dx * cs - dy * sn, PY + dx * sn + dy * cs + oy];
  };
  return { toHead, toCv };
}

/**
 * Everything about the head that is a field rather than a feature - the lit
 * relief of the face, the neck and ear, the stubble, the hair and the hat -
 * for one way of holding the head. This is the expensive part, and there are
 * only a handful of head poses, so each is worked out once.
 */
const baseCache = new Map();
function headBase(rot, oy) {
  const key = `${rot.toFixed(3)}:${oy}`;
  let B = baseCache.get(key);
  if (B) return B;
  const C = new Canvas();
  const F = new Canvas();                    // the front layer: fringe and hat
  const { toHead } = poseXf(rot, oy);
  const hc = Math.cos(HAT_ROT), hs = Math.sin(HAT_ROT);
  const toHat = (u, v) => { const dx = u - HAT_PX, dy = v - HAT_PY; return [HAT_PX + dx * hc + dy * hs, HAT_PY - dx * hs + dy * hc]; };
  const hairMask = new Uint8Array(N);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [u, v] = toHead(x + 0.5, y + 0.5);
      const i = y * W + x;
      // back hair, behind everything on the head
      if (inPoly(HAIR_MASS, u, v)) { C.mat[i] = M.HAIR; C.lvl[i] = massLvl(u, v); C.part[i] = P.BACKHAIR; }
      for (const lk of BACK) {
        const h = lockAt(lk, u, v);
        if (!h) continue;
        C.mat[i] = M.HAIR; C.lvl[i] = hairLvl(u, v, h, 0.1); C.part[i] = P.BACKHAIR;
      }
      // neck, in the shadow of his jaw
      if (inPoly(NECK, u, v)) {
        let s = 0.12 + sstep(40, 52, v) * 0.16 + (u < 25 ? 0.16 : 0) - (u > 33.5 ? 0.06 : 0);
        s += g2(u, v, 25.2, 44, 1.0) * 0.16;            // the throat catches a little light
        C.mat[i] = M.SKIN; C.lvl[i] = toLvl(M.SKIN, s); C.part[i] = P.NECK;
      }
      // the ear
      const ex = (u - EAR.x) / EAR.rx, ey = (v - EAR.y) / EAR.ry;
      if (ex * ex + ey * ey < 1) {
        let s = 0.5 - ex * 0.1 - ey * 0.12;
        if ((u - 35.6) ** 2 / 1.3 + (v - 29.6) ** 2 / 4.2 < 1 && u > 35.0) s -= 0.26;   // the bowl
        C.mat[i] = M.SKIN; C.lvl[i] = toLvl(M.SKIN, s); C.part[i] = P.EAR;
      }
      // the face
      const inF = inPoly(FACE, u, v), inN = inPoly(NOSE, u, v);
      if (inF || inN) {
        const { d, nx } = faceLight(u, v);
        // Two planes, the way a painter blocks a head in: the front of the
        // face turned to the sun, and the side of it - temple, cheek, jaw -
        // turned away. The relief only modulates inside them.
        const side = sstep(-0.8, 0.8, u - cheekLine(v));
        let s = 0.76 - side * 0.4 + (d - 0.72) * 0.5;
        s -= sstep(40.4, 42.8, v) * 0.12 * (1 - side * 0.5);   // under the chin
        if (v < 21.0 + (u - 18) * 0.05) s -= 0.22;      // the brim's shadow
        s -= g2(u, v, 21.4, 34.4, 0.75) * 0.34;         // under the nose
        s -= gLine(u, v, 22.6, 27.5, 23.4, 32.2, 0.55) * 0.28;   // the shadow side of the nose
        s += g2(u, v, 19.6, 31.2, 0.7) * 0.25;          // its tip
        s += g2(u, v, 30.0, 30.4, 1.1) * 0.16 * (1 - side);      // the cheekbone catches it
        s += g2(u, v, 23.6, 41.2, 1.1) * 0.12;          // and the chin
        C.mat[i] = M.SKIN; C.lvl[i] = toLvl(M.SKIN, s); C.part[i] = P.FACE;
        // stubble: a light dusting along the jaw and the chin and over the lip
        const line = u >= 27 ? 34.6 - (u - 27) * 0.42 : 36.2;
        const lip = v > 34.5 && v < 35.5 && u > 20.6 && u < 27.4;
        if (v > line || lip) {
          const jaw = gLine(u, v, 34.2, 31.5, 30.6, 40.0, 1.0) + gLine(u, v, 30.6, 40.0, 22, 43.0, 0.9) + g2(u, v, 24.0, 42.0, 1.3);
          const z = 0.34 + jaw * 0.42 + (lip ? 0.3 : 0) + sstep(line, line + 2.4, v) * 0.16 - g2(u, v, 23.8, 39.0, 1.0) * 0.2;
          if (z > 0.6 || (z > 0.42 && bayer(x, y) < 0.5)) C.mat[i] = M.STUB;
        }
      }
      // the front layer
      for (const lk of FRONT) {
        const h = lockAt(lk, u, v);
        if (!h) continue;
        F.mat[i] = M.HAIR; F.lvl[i] = hairLvl(u, v, h, 0); F.part[i] = P.FRONTHAIR;
        hairMask[i] = 1;
      }
      const [a, b] = toHat(u, v);
      paintHatAt(F, i, a, b, x, y);
    }
  }
  B = { C, F, hairMask };
  baseCache.set(key, B);
  return B;
}

/**
 * Paint the head - hair, face, hat and whatever he is holding - into a
 * 59x64 canvas. `st` is the expression plus this frame's lids, gaze and mouth.
 */
function paintHead(st) {
  const rot = st.tilt || 0, oy = st.dy || 0;
  const B = headBase(rot, oy);
  const { toCv } = poseXf(rot, oy);
  const C = new Canvas();
  C.mat.set(B.C.mat); C.lvl.set(B.C.lvl); C.part.set(B.C.part);

  // the features, under the fringe and the brim
  const E = toCv(29.4, 27.5).map(Math.round);       // near eye
  const Fy = toCv(19.9, 27.6).map(Math.round);      // far eye
  const Mo = toCv(23.6, 36.4).map(Math.round);      // mouth
  paintNose(C, toCv);
  paintEye(C, E[0], E[1], st, false);
  paintEye(C, Fy[0], Fy[1], st, true);
  paintMouth(C, Mo[0], Mo[1], st);

  // the fringe and the hat over them
  const F = B.F;
  for (let i = 0; i < N; i++) {
    if (!F.mat[i]) continue;
    C.mat[i] = F.mat[i]; C.lvl[i] = F.lvl[i]; C.part[i] = F.part[i];
  }
  // and the shadow the fringe throws on the skin
  const hm = B.hairMask;
  for (let y = 1; y < H; y++) {
    for (let x = 1; x < W; x++) {
      const i = y * W + x;
      if (C.part[i] !== P.FACE || hm[i] || C.mat[i] === M.EYEW || C.mat[i] === M.IRIS || C.mat[i] === M.LASH) continue;
      if (hm[i - W] || hm[i - W - 1]) C.lvl[i] -= 1;
    }
  }

  // brows over the hair: he would not be him without them
  const lift = st.browFlash ? -1 : 0;
  paintBrow(C, E[0], E[1], st.brow[0], lift, false);
  paintBrow(C, Fy[0], Fy[1], st.brow[1], lift, true);

  if (!globalThis.__NOGLASS) paintGlasses(C, E, Fy, st, toCv);
  if (st.prop === 'bottle') paintBottle(C, Mo[0], Mo[1]);
  if (st.wisps) paintWisps(C);
  return C;
}

function hairLvl(u, v, h, back) {
  // the volume of the hair as a whole: a dome lit from the left
  const nx = (u - 33) / 16, ny = (v - 19) / 15;
  const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
  const d = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
  let s = 0.2 + d * 0.6 + h.across * (back ? 0.12 : 0.2) - back;
  s -= Math.pow(1 - h.t, 3) * 0.28;                       // under the hat it is dark
  if (h.t > 0.22 && h.t < 0.56 && h.across > 0.05) s += 0.3;   // the sheen
  if (h.across < -0.74) s -= back ? 0.12 : 0.22;            // the parting between locks
  return toLvl(M.HAIR, s);
}

function paintHatAt(C, i, a, b, x, y) {
  // the brim, all of it; the crown then stands in front of its back half
  const bx = (a - BRIM.x) / BRIM.rx;
  const curl = 1.9 * bx ** 4;                              // it turns up at the sides
  const by = (b + curl - BRIM.y) / BRIM.ry;
  const inBrim = bx * bx + by * by < 1;
  const cb = crownBase(a);
  const hw = crownHalf(b);
  const inCrown = Math.abs(a - 29.5) < hw && b > crownTop(a) && b < cb;
  if (!inBrim && !inCrown) return;
  if (inCrown) {
    const nx = (a - 29.5) / hw;
    const band = b > cb - 3.6;
    let s = 0.55 - nx * 0.42 - (b < 5 ? -0.12 : 0);
    s -= g2(a, b, 25, 3.2, 1.6) * 0.3 + g2(a, b, 33.5, 3.0, 1.6) * 0.16;     // the pinch at the front
    s += g2(a, b, 22.5, 6.5, 2.6) * 0.18;
    if (band) {
      let t = 0.5 - nx * 0.4;
      if (b < cb - 3.0) t += 0.25;
      if (b > cb - 0.9) t -= 0.3;
      C.mat[i] = M.BAND; C.lvl[i] = toLvl(M.BAND, t); C.part[i] = P.CROWN;
    } else {
      // canvas: a few darker weathered patches, and the stitched seam up the middle
      if (hash(x, y) < 0.08) s -= 0.12;
      if (Math.abs(a - 30.4 - (b - 7) * 0.1) < 0.5 && b > 2.5 && b < cb - 4) s -= 0.18;
      C.mat[i] = M.HAT; C.lvl[i] = toLvl(M.HAT, s); C.part[i] = P.CROWN;
    }
    // the goggles, pushed up on the band
    for (const g of GOGGLES) {
      const d = Math.hypot(a - g.x, b - g.y);
      if (d < g.r) {
        if (d > g.r - 1.0) {
          const ang = Math.atan2(b - g.y, a - g.x);
          const t = 0.5 - Math.cos(ang + 2.4) * 0.42;
          C.mat[i] = M.BRASS; C.lvl[i] = toLvl(M.BRASS, t);
        } else {
          let t = 0.12 + ((g.y - b) + (g.x - a)) * 0.07;
          if (Math.hypot(a - g.x + 0.6, b - g.y + 0.6) < 0.55) t = 0.95;
          else if (Math.hypot(a - g.x - 0.5, b - g.y - 0.6) < 0.6) t = 0.5;
          C.mat[i] = M.GLENS; C.lvl[i] = toLvl(M.GLENS, t);
        }
        C.part[i] = P.GOG;
      }
    }
    if (Math.abs(a - 21.4) < 0.7 && Math.abs(b - 12.6) < 0.6) { C.mat[i] = M.BRASS; C.lvl[i] = 2; C.part[i] = P.GOG; }
    return;
  }
  // brim only
  const front = b + curl > BRIM.y;
  const edge = bx * bx + by * by > 0.8;
  let s = 0.62 - bx * 0.32;
  if (!front) s += 0.1;
  if (front && a > 31 && b < cb + 2.2) s -= 0.24;           // the crown shades the brim
  if (front && edge && by > 0.5) s -= 0.42;                  // the underside, turned to us
  if (!front && edge && by < -0.5) s += 0.15;
  if (hash(x + 7, y) < 0.06) s -= 0.1;
  C.mat[i] = M.HAT; C.lvl[i] = toLvl(M.HAT, s); C.part[i] = front ? P.BRIMF : P.BRIM;
}

function paintNose(C, toCv) {
  const at = (u, v) => toCv(u, v).map(Math.round);
  // a hard little highlight on the tip and down the bridge
  const tip = at(19.4, 31.6);
  C.set(tip[0], tip[1], M.SKIN, 6);
  const br = at(21.0, 28.8);
  C.shift(br[0], br[1], 1, [M.SKIN]);
  // the shadow side of the nose, down into the nostril
  const s1 = at(23.0, 29.6), s2 = at(23.2, 31.2);
  C.set(s1[0], s1[1], M.SKIN, 3);
  C.set(s2[0], s2[1], M.SKIN, 3);
  const n = at(21.4, 33.3);
  C.set(n[0], n[1], M.SKIN, 1);
  C.set(n[0] - 1, n[1], M.SKIN, 2);
  C.set(n[0] + 1, n[1], M.SKIN, 2);
  const w = at(23.4, 32.6);
  C.set(w[0], w[1], M.SKIN, 2);
  // the underside of the tip
  const u0 = at(19.0, 33.2);
  C.set(u0[0], u0[1], M.SKIN, 3);
}

/** One eye, at (x, y) its centre pixel. Six pixels wide near, four far. */
function paintEye(C, x, y, st, far) {
  let lid = st.eyeNow;
  if (lid === 'peer') lid = far ? 'open' : 'squint';
  const gx = clamp(st.gx || 0, -1, 1);
  const gy = st.gazeY || 0;
  const L0 = far ? -2 : -3, L1 = far ? 1 : 2;      // inner/outer extents
  const lash = (px, py, l = 0) => C.set(px, py, M.LASH, l);
  const white = (px, py, l = 2) => C.set(px, py, M.EYEW, l);
  const skin = (px, py, d = 0) => C.shift(px, py, d);
  const spore = st.eye === 'spore';
  // the iris: 2x2, catchlight top-left, pupil top-right, warm bounce under
  const iris = (ix, iy, rows = 2) => {
    if (spore) {
      C.set(ix, iy, M.WISP, 4); C.set(ix + 1, iy, M.WISP, 3);
      if (rows > 1) { C.set(ix, iy + 1, M.WISP, 3); C.set(ix + 1, iy + 1, M.WISP, 2); }
      return;
    }
    if (st.eye === 'blank') { C.set(ix + (far ? 0 : 1), iy, M.IRIS, 1); return; }
    C.set(ix, iy, M.IRIS, rows > 1 ? 6 : 2);
    C.set(ix + 1, iy, M.IRIS, 0);
    if (rows > 1) { C.set(ix, iy + 1, M.IRIS, 3); C.set(ix + 1, iy + 1, M.IRIS, 4); }
  };
  const ixBase = x - 1 + gx + (far ? 0 : 0);
  const ix = clamp(ixBase, x + L0 + 1, x + L1 - 2);

  if (lid === 'closed' || lid === 'happy') {
    const arc = lid === 'happy' ? -1 : 1;
    for (let k = L0 + 1; k <= L1; k++) {
      const end = k === L0 + 1 || k === L1;
      lash(x + k, y + (end ? 0 : (arc > 0 ? 0 : -1)), end ? 1 : 0);
    }
    if (lid === 'closed') { skin(x - 1, y - 1, 1); skin(x, y - 1, 1); lash(x + L1 + (far ? 0 : 1), y + 1, 1); }
    else { skin(x - 1, y + 1, 1); skin(x, y + 1, 1); }
    return;
  }
  if (lid === 'half') {
    for (let k = L0 + 1; k <= L1; k++) lash(x + k, y, 0);
    skin(x - 1, y - 1, -1); skin(x, y - 1, -1);
    white(x + L0 + 1, y + 1, 1); white(x + L1, y + 1, 1);
    for (let k = L0 + 2; k < L1; k++) white(x + k, y + 1, 2);
    iris(ix, y + 1, 1);
    if (!far) lash(x + L1 + 1, y + 1, 1);
    return;
  }
  if (lid === 'squint' || lid === 'smile') {
    for (let k = L0 + 1; k <= L1; k++) lash(x + k, y - 1, 0);
    if (!far) lash(x + L1 + 1, y, 0);
    white(x + L0 + 1, y, 1); white(x + L1, y, 1);
    for (let k = L0 + 2; k < L1; k++) white(x + k, y, 2);
    iris(ix, y, 1);
    // the lower lid comes up: a crease of cheek under the eye
    for (let k = L0 + 2; k <= L1 - 1; k++) skin(x + k, y + 1, lid === 'smile' ? -2 : -1);
    if (lid === 'smile') { skin(x + L0 + 2, y + 2, 1); skin(x + L1 - 1, y + 2, -1); }
    return;
  }
  const wide = lid === 'wide' || lid === 'spore';
  const top = wide ? y - 2 : y - 1;
  // the crease of the upper lid, and the lash line under it
  for (let k = L0 + 2; k <= L1 - 1; k++) skin(x + k, top - 1, -1);
  for (let k = L0 + 1; k <= L1; k++) lash(x + k, top, k === L0 + 1 ? 1 : 0);
  if (!far) { lash(x + L1 + 1, top + 1, 0); lash(x + L1, top - 1, 1); lash(x + L1 - 1, top - 1, 2); }
  else lash(x + L0, top + 1, 1);
  for (let row = top + 1; row <= y + 1; row++) {
    for (let k = L0 + 1; k <= L1; k++) {
      const edge = k === L0 + 1 || k === L1;
      white(x + k, row, edge ? 1 : row === top + 1 && !wide ? 1 : 2);
    }
  }
  if (!far) C.set(x + L0 + 1, y + 1, M.SKIN, 3);        // the inner corner
  iris(ix, y + (wide ? -1 + 0 : 0) + (gy && !wide ? 0 : 0), 2);
  if (wide) { white(ix, y + 1, 2); white(ix + 1, y + 1, 2); C.set(ix, y - 1, M.IRIS, spore ? 0 : 3); if (spore) C.set(ix, y - 1, M.WISP, 4); }
  if (gy > 0 && !wide) { C.set(ix, y, M.IRIS, 1); C.set(ix + 1, y, M.IRIS, 0); C.set(ix, y + 1, M.IRIS, 6); C.set(ix + 1, y + 1, M.IRIS, 3); }
  // the lower lid, a soft line of shadow
  for (let k = L0 + 2; k <= L1; k++) skin(x + k, y + 2, -1);
}

function paintBrow(C, x, y, [di, dout], lift, far) {
  // near: inner end at x-3, out to x+3; far: inner at x+2, out to x-2
  const pts = far
    ? [[x + 2, y - 3.4 + di], [x + 1, y - 3.5 + di], [x, y - 3.6 + (di + dout) / 2], [x - 1, y - 3.5 + dout], [x - 2, y - 3.0 + dout]]
    : [[x - 3, y - 3.2 + di], [x - 2, y - 3.4 + di], [x - 1, y - 3.7 + (di * 2 + dout) / 3], [x, y - 3.9 + (di + dout) / 2],
      [x + 1, y - 3.9 + (di + dout * 2) / 3], [x + 2, y - 3.6 + dout], [x + 3, y - 3.0 + dout]];
  pts.forEach(([px, py], k) => {
    const yy = Math.round(py + lift);
    const thick = far ? k < 3 : k < 5;
    C.set(px, yy, M.HAIR, far ? 1 : 0, P.FACE);
    if (thick) C.set(px, yy - 1, M.HAIR, far ? 2 : k < 2 ? 3 : 2, P.FACE);
  });
}

/**
 * The mouth. `open` is 0..3; every shape has a closed version and opens
 * from it, which is what lets him talk without changing his face.
 */
function paintMouth(C, x, y, st) {
  const kind = st.mouth;
  const open = st.mouthNow;
  const line = (x0, x1, yy, l = 0) => { for (let k = x0; k <= x1; k++) C.set(x + k, y + yy, M.LIP, l); };
  const skin = (px, py, d) => C.shift(x + px, y + py, d, [M.SKIN, M.STUB]);
  const lowerLip = (yy, x0 = -2, x1 = 2) => {
    for (let k = x0; k <= x1; k++) C.set(x + k, y + yy, M.LIP, k === x0 + 1 ? 4 : 3);
    for (let k = x0; k <= x1 - 1; k++) skin(k, yy + 1, -2);
  };
  // the philtrum, every time
  skin(0, -2, -1);
  if (kind === 'drink') {
    line(-2, 1, 0, 1); C.set(x + 2, y, M.LIP, 0); lowerLip(1, -1, 1);
    return;
  }
  if (kind === 'o' || (kind === 'small' && open > 0)) {
    const r = Math.max(1, open);
    for (let yy = 0; yy <= r; yy++) for (let k = 0; k <= 1 + (r > 1 ? 1 : 0); k++) C.set(x + k, y + yy, M.MOUTH, yy === 0 ? 0 : 1);
    line(0, 1 + (r > 1 ? 1 : 0), -1, 1);
    lowerLip(r + 1, 0, 1 + (r > 1 ? 1 : 0));
    return;
  }
  if (kind === 'small') { line(-1, 2, 0, 1); C.set(x + 3, y, M.LIP, 2); lowerLip(1, -1, 2); return; }
  // corner lift per shape: [far corner, near corner]
  const lift = { line: [0, 0], tight: [0, 0], smile: [-1, -1], smirk: [0, -1], grin: [-1, -1], laugh: [-1, -1],
    frown: [1, 1], shout: [0, 0], slack: [0, 1] }[kind] || [0, 0];
  const big = kind === 'shout' || kind === 'laugh';
  const x0 = big ? -3 : -2, x1 = big ? 4 : 3;
  const teeth = kind === 'grin' || kind === 'laugh' || kind === 'shout' || (kind === 'smile' && open > 0);
  if (open <= 0) {
    // shut: one dark line, the corners tucked
    line(x0 + 1, x1 - 1, 0, 0);
    if (kind === 'grin') { for (let k = -1; k <= 2; k++) C.set(x + k, y, M.TEETH, k === -1 ? 1 : 2); line(x0 + 1, x1 - 1, -1, 0); line(-1, 2, 1, 0); }
    C.set(x + x0, y + lift[0], M.LIP, 1);
    C.set(x + x1, y + lift[1], M.LIP, 0);
    if (lift[1] < 0) { skin(x1 + 1, -1, -1); skin(x1, 0, 1); }
    if (lift[0] < 0) skin(x0, 0, 1);
    if (lift[1] > 0) { skin(x1, -1, 1); }
    if (kind !== 'grin') {
      for (let k = -1; k <= 1; k++) skin(k, 1, k === -1 ? 2 : 1);
      for (let k = -1; k <= 1; k++) skin(k, 2, -2);
    }
    else lowerLip(2, -1, 2);
    return;
  }
  // open: the upper lip line, a dark interior, teeth along the top if he has
  // a reason to show them, and the lower lip dropped by however far open
  const rows = Math.min(kind === 'shout' ? 4 : 3, open + (kind === 'shout' ? 1 : 0));
  const wTop = kind === 'shout' || kind === 'laugh' ? 0 : 1;
  line(x0 + wTop, x1 - wTop, -1, 0);
  C.set(x + x0, y - 1 + lift[0], M.LIP, 1);
  C.set(x + x1, y - 1 + lift[1], M.LIP, 1);
  for (let r = 0; r < rows; r++) {
    const inset = r === rows - 1 && rows > 1 ? 1 : 0;
    for (let k = x0 + wTop + inset; k <= x1 - wTop - inset; k++) {
      let mat = M.MOUTH, l = r === 0 ? 0 : 1;
      if (teeth && r === 0 && k > x0 + wTop && k < x1 - wTop) { mat = M.TEETH; l = k === x0 + wTop + 1 ? 1 : 3; }
      if (r === rows - 1 && rows >= 2 && Math.abs(k - 0.5) < 1.6) { mat = M.LIP; l = 2; }     // tongue
      if (kind === 'shout' && r === rows - 1 && rows >= 3) { mat = M.TEETH; l = 1; }
      C.set(x + k, y + r, mat, l);
    }
  }
  lowerLip(rows, x0 + 1 + (rows > 1 ? 0 : 0), x1 - 1);
  if (lift[1] < 0) skin(x1 + 1, -1, -1);
}

function paintGlasses(C, E, F, st, toCv) {
  const EYE = [M.EYEW, M.IRIS, M.LASH, M.WISP];
  const ring = (cx, cy, rx, ry, far) => {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = Math.hypot(dx, dy);
        const i = y * W + x;
        const onEye = EYE.includes(C.mat[i]);
        if (Math.abs(d - 1) * Math.min(rx, ry) < 0.48) {
          if (onEye && !st.glare) continue;          // the wire never cuts an eye in half
          const ang = Math.atan2(dy, dx);
          // brass where the sun catches it, dark wire elsewhere
          const lit = Math.cos(ang + 2.3);
          C.mat[i] = M.FRAME; C.lvl[i] = lit > 0.6 ? 4 : lit > -0.3 ? 3 : 2;
          if (far && dx < -0.4) C.lvl[i] = 2;
        } else if (d < 1 && C.mat[i]) {
          // seen through faintly blue glass; the glint lives on the rim, off the eye
          C.tint[i] = onEye ? 4 : 1;
          if (!onEye && Math.abs(dx + dy + 1.05) < 0.3 && dy < -0.15 && d > 0.62) C.tint[i] = 2;
          if (st.glare && dy < 0.35) C.tint[i] = 3;
        }
      }
    }
  };
  ring(E[0] - 0.2, E[1] + 0.7, 3.9, 3.2, false);
  ring(F[0] + 0.5, F[1] + 0.7, 2.5, 3.1, true);
  // the bridge, over the nose
  const y = E[1] - 1;
  for (let x = F[0] + 3; x <= E[0] - 4; x++) if (!EYE.includes(C.get(x, y))) C.set(x, y, M.FRAME, 3);
  // the arm back to the ear
  const a = [E[0] + 4, E[1]], b = toCv(34.6, 27.8);
  for (let k = 0; k <= 1; k += 0.2) {
    const px = Math.round(a[0] + (b[0] - a[0]) * k), py = Math.round(a[1] + (b[1] - a[1]) * k);
    const i = py * W + px;
    if (C.part[i] === P.FACE || C.part[i] === P.EAR) C.set(px, py, M.FRAME, 2);
  }
}

function paintBottle(C, x, y) {
  // an old brown-green beer bottle tipped up to his mouth from the far side,
  // and the hand holding it
  for (let k = 0; k < 16; k++) {
    const cx = x - 1.5 - k * 0.78, cy = y + 0.4 + k * 0.62;
    const w = k < 4 ? 0.8 : k < 6 ? 1.3 : 2.0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const px = Math.round(cx + dx), py = Math.round(cy + dy);
        // across the bottle's width, perpendicular to its axis
        const ax = dx * 0.62 + dy * 0.78;
        if (Math.abs(ax) > w || Math.abs(-dx * 0.78 + dy * 0.62) > 0.6) continue;
        const l = ax < -w * 0.4 ? 4 : ax > w * 0.5 ? 1 : 2;
        C.set(px, py, k < 2 ? M.BRASS : M.BOTTLE, k < 2 ? 3 : (k === 9 && l === 2 ? 3 : l), P.PROP);
      }
    }
  }
  // a label
  for (let k = 9; k < 12; k++) { const cx = Math.round(x - 1.5 - k * 0.78), cy = Math.round(y + 0.4 + k * 0.62); C.set(cx, cy, M.SHIRT, 5, P.PROP); C.set(cx + 1, cy, M.SHIRT, 4, P.PROP); }
  // his hand round it: four knuckles and a thumb
  const hx = x - 8, hy = y + 5;
  for (let j = 0; j < 4; j++) for (let k = 0; k < 3; k++) C.set(hx + k - j * 0.6, hy + j + k * 0.3, M.SKIN, j === 3 ? 2 : k === 0 ? 5 : 4, P.PROP);
  C.set(hx + 2, hy - 1, M.SKIN, 5, P.PROP); C.set(hx + 3, hy - 1, M.SKIN, 4, P.PROP);
  for (let j = 0; j < 3; j++) C.set(hx - j * 0.6 + 2, hy + j + 1, M.SKIN, 3, P.PROP);
}

function paintWisps(C) {
  const wisp = (x0, y0, len, ph) => {
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + Math.sin(k * 0.7 + ph) * 1.6), y = y0 - k;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (!C.mat[y * W + x]) C.set(x, y, M.WISP, k % 3 === 0 ? 3 : 2, P.PROP);
    }
  };
  wisp(4, 30, 14, 0); wisp(53, 40, 16, 1.4); wisp(50, 22, 9, 2.6); wisp(8, 50, 10, 0.8);
}

// ---------------------------------------------------------------------------
// the shoulders: shirt, neckerchief, pack straps - painted once

const BODY_DY = 3;
function paintBody() {
  const C = new Canvas();
  const SH = smoothPoly([[22.2, 46.6], [14, 49.6], [6.5, 52.6], [2.2, 58], [0.5, 64.5], [58.5, 64.5], [57.6, 57.2],
    [53.8, 51.6], [45, 48.4], [36.4, 46.2]], 6);
  const SCARF = smoothPoly([[21.4, 45.2], [28.5, 44.0], [36.4, 43.6], [37.4, 46.4], [33.8, 49.6], [29.6, 51.2], [25.4, 50.8], [21.6, 48.8]], 5);
  const KNOT = smoothPoly([[24.2, 49.4], [28.6, 48.6], [30.6, 51.2], [27.8, 53.4], [24.8, 52.6]], 4);
  const TAIL = smoothPoly([[24.6, 51.8], [28.8, 52.6], [27.4, 58.4], [23.4, 61.2], [21.8, 58.4]], 4);
  const VNECK = smoothPoly([[23.6, 47.4], [34.2, 46.6], [30.8, 54.6], [27.6, 56.2]], 4);
  const COLL_F = smoothPoly([[22.6, 46.6], [15.6, 50.2], [17.6, 55.0], [23.4, 52.4]], 4);
  const COLL_N = smoothPoly([[35.0, 46.2], [41.6, 49.6], [39.6, 54.6], [33.6, 51.8]], 4);
  const ROLL = { on: false, x: 51.5, y: 47.8, rx: 7, ry: 3.6 };
  const strap = (x0, y0, x1, y1, w, x, y) => {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const t = clamp(((x - x0) * dx + (y - y0) * dy) / l2, 0, 1);
    const px = x0 + dx * t, py = y0 + dy * t;
    const across = ((x - px) * -dy + (y - py) * dx) / Math.sqrt(l2);
    return Math.abs(across) < w / 2 ? across / (w / 2) : null;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x + 0.5, v = y + 0.5 - BODY_DY, i = y * W + x;
      // the bedroll strapped across the top of his pack, behind the near shoulder
      const rx = (u - ROLL.x) / ROLL.rx, ry = (v - ROLL.y) / ROLL.ry;
      if (ROLL.on && rx * rx + ry * ry < 1) {
        let s = 0.55 - ry * 0.35 - rx * 0.15;
        if (Math.abs(u - 49) < 0.6 || Math.abs(u - 55) < 0.6) { C.mat[i] = M.LEATHER; C.lvl[i] = 2; C.part[i] = 1; continue; }
        if (Math.abs(rx) > 0.82) s -= 0.2;
        C.mat[i] = M.ROLL; C.lvl[i] = toLvl(M.ROLL, s); C.part[i] = 1;
      }
      if (!inPoly(SH, u, v)) continue;
      let s = 0.66 - (u - 8) / 50 * 0.42 - sstep(56, 64, v) * 0.1;
      // creases running in from the shoulders
      s -= gLine(u, v, 12, 54, 18, 62, 0.6) * 0.22 + gLine(u, v, 45, 52, 39, 62, 0.6) * 0.2 + gLine(u, v, 33, 57, 31, 64, 0.5) * 0.16;
      s += gLine(u, v, 8, 54, 14, 60, 0.9) * 0.12;
      // the placket, its buttons, and a pocket with a flap on the near side
      if (Math.abs(u - (29.6 + (v - 54) * 0.12)) < 0.5 && v > 54) s -= 0.2;
      if (Math.abs(u - 30.6 - (v - 54) * 0.12) < 0.5 && (Math.abs(v - 58.5) < 0.5 || Math.abs(v - 63) < 0.5)) s = 0.95;
      if (u > 35 && u < 41.5 && v > 55.5 && v < 61.5) {
        if (v < 57) s += 0.1; else if (Math.abs(v - 57.2) < 0.45) s -= 0.3;
        if (u < 35.6 || u > 40.9) s -= 0.16;
      }
      C.mat[i] = M.SHIRT; C.lvl[i] = toLvl(M.SHIRT, s); C.part[i] = 2;
      if (inPoly(VNECK, u, v)) { C.mat[i] = M.SKIN; C.lvl[i] = toLvl(M.SKIN, 0.38 - (u - 24) * 0.03 + g2(u, v, 26.5, 52, 1.6) * 0.1); C.part[i] = 2; }
      for (const coll of [COLL_F, COLL_N]) if (inPoly(coll, u, v)) {
        const s2 = coll === COLL_F ? 0.86 : 0.52;
        C.mat[i] = M.SHIRT; C.lvl[i] = toLvl(M.SHIRT, s2 - (v - 47) * 0.03); C.part[i] = 3;
      }
      // the pack straps, with a brass buckle each and a stitched edge
      const sf = strap(13.6, 49.2, 11.6, 65, 4.2, u, v);
      const sn = strap(44.2, 48.4, 47.4, 65, 4.8, u, v);
      const sa = sf !== null ? sf : sn;
      if (sa !== null) {
        const near = sn !== null;
        let t = 0.5 + sa * -0.3 - (near ? 0.12 : 0);
        if (Math.abs(sa) > 0.66) t -= 0.25;
        C.mat[i] = M.LEATHER; C.lvl[i] = toLvl(M.LEATHER, t); C.part[i] = 4;
        const by = near ? 58.5 : 59.2, bx = near ? 46.1 : 12.4;
        if (Math.abs(v - by) < 1.6 && Math.abs(u - bx) < 2.2) {
          const ring = Math.abs(v - by) > 0.8 || Math.abs(u - bx) > 1.4;
          if (ring) { C.mat[i] = M.BRASS; C.lvl[i] = v < by ? 4 : 2; }
        }
      }
    }
  }
  // the neckerchief, knotted at the throat with a tail down his shirt
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x + 0.5, v = y + 0.5 - BODY_DY, i = y * W + x;
      let s = -1;
      if (inPoly(SCARF, u, v)) {
        s = 0.58 - (u - 22) * 0.025 + Math.sin(u * 1.1 - v * 0.4) * 0.1;
        if (v < 45.4 + (u - 22) * -0.02) s += 0.18;
        if (v > 49) s -= 0.14;
      }
      if (inPoly(TAIL, u, v)) s = 0.5 - (u - 22) * 0.04 + (Math.abs(u - 25.4 - (v - 52) * -0.32) < 0.6 ? -0.3 : 0);
      if (inPoly(KNOT, u, v)) s = 0.62 - Math.hypot(u - 26.4, v - 50.4) * 0.12 + (u - 27.5 > 1.5 ? -0.2 : 0);
      if (s < 0) continue;
      C.mat[i] = M.SCARF; C.lvl[i] = toLvl(M.SCARF, s); C.part[i] = 5;
    }
  }
  return C;
}

// ---------------------------------------------------------------------------
// the finish: rim light, contact lines, outline, colour

const LINED = new Set(['1>6', '2>6', '3>6', '4>6', '4>7', '6>7', '1>7', '1>8', '6>8', '6>9', '4>9', '3>9', '1>9', '7>8', '8>10', '9>10',
  '2>4', '1>4', '1>3', '2>3', '4>5', '1>2', '2>5', '6>5', '9>5', '1>5', '2>3']);
const RIMMED = new Set([M.SKIN, M.HAIR, M.HAT, M.SHIRT, M.SCARF, M.STUB, M.LEATHER, M.BAND, M.ROLL]);

function finish(C, spore, bodyLayer) {
  const { mat, lvl, part, tint } = C;
  const out = new Uint8ClampedArray(N * 4);
  // contact lines: the further part darkens where a nearer one crosses it
  const L2 = new Int8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mat[i]) continue;
      const a = part[i];
      let hit = false;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N) continue;
        if (j === i - 1 && x === 0) continue;
        if (j === i + 1 && x === W - 1) continue;
        const b = part[j];
        if (b > a && mat[j] && LINED.has(`${a}>${b}`)) hit = true;
        if (bodyLayer && b > a && mat[j]) hit = true;
      }
      if (hit) L2[i] = 1;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      const m = mat[i];
      if (!m) {
        // outline: a dark line round the whole silhouette
        let nb = 0;
        if (x > 0 && mat[i - 1]) nb = mat[i - 1];
        else if (x < W - 1 && mat[i + 1]) nb = mat[i + 1];
        else if (y > 0 && mat[i - W]) nb = mat[i - W];
        else if (y < H - 1 && mat[i + W]) nb = mat[i + W];
        if (!nb) continue;
        let c = mix(RAMPS[nb][0], OUTLINE, 0.3);
        if (spore) c = mix(c, SPORE, 0.3);
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
        continue;
      }
      const R = RAMPS[m];
      let l = lvl[i];
      // the rim: a warm line of light down the edge turned away from the sun
      if (RIMMED.has(m) && x < W - 1 && !mat[i + 1] && x > 22 && (y < 44 || bodyLayer)) l = m === M.HAIR ? l + 2 : Math.max(l + 3, R.length - 2);
      if (RIMMED.has(m) && x < W - 2 && !mat[i + 2] && mat[i + 1] && x > 30 && y < 44) l = Math.max(l, l + 1);
      if (L2[i]) l = Math.min(l - 2, 1);
      l = clamp(l, 0, R.length - 1);
      let c = R[l];
      const t = tint[i];
      if (t) {
        // seen through tinted glass
        c = mix(c, RAMPS[M.GLENS][3], t === 3 ? 0.78 : t === 4 ? 0.07 : 0.15);
        if (t === 2) c = mix(c, [236, 244, 255], 0.55);
        if (t === 3) c = mix(c, [235, 245, 255], 0.35);
      }
      if (spore && m !== M.WISP) {
        c = mix(c, SPORE, 0.42);
      }
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  g.putImageData(new ImageData(out, W, H), 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// caches

const headCache = new Map();
const bodyCache = new Map();

function expr(name) { return EXPR[name] || EXPR.flat; }

/** The head for one exact frame of him, baked and kept. */
function headCanvas(name, eyeNow, gx, mouthNow, browFlash, spore) {
  const e = expr(name);
  const key = `${name}|${eyeNow}|${gx}|${mouthNow}|${browFlash}|${spore}`;
  let cv = headCache.get(key);
  if (cv) return cv;
  const st = { ...e, eyeNow, gx, mouthNow, browFlash };
  cv = finish(paintHead(st), spore, false);
  if (headCache.size > 320) headCache.clear();
  headCache.set(key, cv);
  return cv;
}
function bodyCanvas(spore) {
  let cv = bodyCache.get(spore);
  if (!cv) { cv = finish(paintBody(), spore, true); bodyCache.set(spore, cv); }
  return cv;
}

// ---------------------------------------------------------------------------
// being alive

/**
 * His clock on the card. Driven by whatever time the caller has; it keeps its
 * own timers for the blinks, the glances and the syllables so that none of
 * them line up with each other, which is what stops it reading as a loop.
 */
export class FaceLife {
  constructor() {
    this.last = null;
    this.blinkIn = 1.2 + Math.random() * 2;
    this.blinkT = -1;
    this.dbl = false;
    this.gx = 0;
    this.gazeIn = 1.5;
    this.breath = Math.random() * 6;
    this.syl = 0;
    this.sylLen = 0.12;
    this.sylOpen = 1;
    this.nod = 0;
    this.flash = 0;
    this.flashIn = 2;
    this.talkFor = 0;
  }

  tick(t, talking) {
    let dt = this.last === null ? 0 : t - this.last;
    this.last = t;
    if (!(dt >= 0) || dt > 0.25) dt = 0.016;
    // blinking: half, shut, half - and now and then twice
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.17) {
        this.blinkT = -1;
        if (this.dbl) { this.dbl = false; this.blinkIn = 0.12; }
        else this.blinkIn = 2.2 + Math.random() * 3.6;
      }
    } else {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) { this.blinkT = 0; this.dbl = Math.random() < 0.18; }
    }
    // the eyes go somewhere every second or three, and come back
    this.gazeIn -= dt;
    if (this.gazeIn <= 0) {
      const choices = talking ? [0, 0, -1, -1, 1] : [0, -1, 1, 1, 0, -1];
      const next = choices[Math.floor(Math.random() * choices.length)];
      if (next !== this.gx && this.blinkT < 0 && Math.random() < 0.3) { this.blinkT = 0; }
      this.gx = next;
      this.gazeIn = (talking ? 0.9 : 1.2) + Math.random() * 2.4;
    }
    this.breath += dt * 1.45;
    // talking: syllables of uneven length and uneven openness
    if (talking) {
      this.talkFor += dt;
      this.syl += dt;
      if (this.syl > this.sylLen) {
        this.syl = 0;
        this.sylLen = 0.07 + Math.random() * 0.11;
        const r = Math.random();
        this.sylOpen = r < 0.22 ? 0 : r < 0.62 ? 1 : 2;
        if (this.sylOpen === 2 && Math.random() < 0.35) this.nod = 0.16;
      }
      this.flashIn -= dt;
      if (this.flashIn <= 0) { this.flash = 0.42; this.flashIn = 1.6 + Math.random() * 2.6; }
    } else {
      this.talkFor = 0;
      this.sylOpen = 0;
    }
    this.nod = Math.max(0, this.nod - dt);
    this.flash = Math.max(0, this.flash - dt);
    return this;
  }

  get lid() {
    if (this.blinkT < 0) return null;
    return this.blinkT < 0.045 || this.blinkT > 0.12 ? 'half' : 'closed';
  }
}

const outCache = new Map();

/**
 * His face this frame. `life` is a FaceLife (one per viewer) already ticked;
 * without one it is a still, which is what anything that only wants a picture
 * of him gets.
 */
export function vessFace(mood, scale = 1, opts = {}) {
  const s = Math.max(1, Math.round(scale));
  const name = EXPR[mood] ? mood : 'flat';
  const e = expr(name);
  const spore = opts.spore ? 1 : 0;
  const life = opts.life || null;
  const talking = !!opts.talking;

  let eyeNow = e.eye;
  let gx = e.gaze || 0;
  let mouthNow = e.open || 0;
  let flash = 0, headDy = 0, bodyDy = 0;
  if (life) {
    const lid = life.lid;
    if (lid && !SHUT.has(e.eye)) eyeNow = lid === 'closed' ? 'closed' : (e.eye === 'squint' || e.eye === 'smile' ? 'closed' : 'half');
    if (e.eye !== 'blank' && e.eye !== 'spore') gx = clamp((e.gaze || 0) + life.gx, -1, 1);
    if (talking) {
      const base = e.open || 0;
      mouthNow = e.mouth === 'drink' ? 0 : clamp(base === 0 ? life.sylOpen : base + life.sylOpen - 1, 0, 3);
      if (life.flash > 0) flash = 1;
    }
    // shoulders rise on the breath in; the head follows a beat later
    const b = Math.sin(life.breath);
    bodyDy = b > 0.25 ? -1 : 0;
    headDy = Math.sin(life.breath - 0.8) > 0.35 ? -1 : 0;
    if (life.nod > 0) headDy += 1;
  }
  const head = headCanvas(name, eyeNow, gx, mouthNow, flash, spore);
  const body = bodyCanvas(spore);

  // the composite, at the size asked for
  const key = `${s}:${opts.slot || 0}`;
  let out = outCache.get(key);
  if (!out) { out = makeCanvas(W * s, H * s); outCache.set(key, out); }
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, out.width, out.height);
  g.drawImage(head, 0, headDy * s, W * s, H * s);
  g.drawImage(body, 0, (bodyDy + 1) * s, W * s, H * s);
  return { cv: out, ox: FACE_EYE.x * s, oy: FACE_EYE.y * s, W: out.width, H: out.height };
}
