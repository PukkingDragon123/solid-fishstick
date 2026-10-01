// CRABDEN - the interface kit.
//
// Nothing the game draws over the world is supposed to look like an
// interface. It is supposed to look like things you would find out here: a
// slab of rock somebody squared off and cut a recess into, and a scroll of
// old paper with the ends rolled up. So the whole kit is two materials:
//
//   STONE is anything you press, anything that holds something, and any
//   board a list is written on. A hewn block with its corners knocked off,
//   lit along its top-left edge and dark along the bottom-right, grainy all
//   over, chipped here and there, with a little moss in the low corners of
//   the bigger pieces. A recess is cut into its face, and that is where the
//   words and the pictures sit - so pale words always read on it.
//
//   PARCHMENT is anything written: titles, notes, the job you are on, what
//   you just found. Pale paper with a rolled end each side, a soft shade at
//   its foot, ragged at the edge, written on in dark ink.
//
// Selection and emphasis are OCHRE - the paint the first people put on rock -
// rather than brass, which is the one thing nobody out here has.
//
// Two rules hold it together. Everything lands on whole pixels, because half
// a pixel of bevel is a blurred edge. And every interactive thing has exactly
// three states - resting, under the pointer, and held.

import { drawText, textWidth, ellipsize } from '../lib/font.js';
import { clamp01 } from '../lib/math.js';
import { drawIcon } from './iconcore.js';

/** Every outline in the interface. */
const OUT = '#0e0b09';

// stone, from a chipped highlight down into a recess
const S0 = '#dccfb4', S1 = '#b6a98f', S2 = '#918572', S3 = '#726858', S4 = '#564e44', S5 = '#3c3630', S6 = '#28241f';
// the dark slab a board is cut from, so pale words read on it
const D0 = '#4c453d', D1 = '#3f3933', D2 = '#342f2a', D3 = '#282421';
// ochre paint
const A0 = '#fff0c4', A1 = '#f4c96a', A2 = '#d89c3c', A3 = '#9c6a24', A4 = '#5c3d12';
// moss
const M1 = '#9ab45c', M2 = '#6e8e3c', M3 = '#4a6228';
// parchment
const P0 = '#fff7dc', P1 = '#f1e0b2', P2 = '#ddc48e', P3 = '#c0a26a', P4 = '#937448', P5 = '#5f4a2e';

/** Ink, for words written on parchment. */
export const INK = '#38261a';
export const INK_SOFT = 'rgba(56,38,26,0.70)';
export const INK_RED = '#9a2e1c';
export const INK_GREEN = '#3e5e1e';
export const INK_BLUE = '#1f4a66';

/**
 * The whole palette.
 *
 * `ink` is the colour WORDS are on stone, which is pale. The names are kept
 * from the kit's earlier lives so that changing the material changes the
 * whole game rather than three hundred call sites: `gold` is the ochre now,
 * `leather` is the stone and `board` is the slab.
 */
export const C = {
  ink: '#f6ead0',
  inkSoft: 'rgba(246,234,208,0.68)',
  shadow: 'rgba(8,6,4,0.5)',

  frame: S3,
  frameLit: S1,
  frameDim: S4,
  frameDeep: OUT,

  page: D1,
  pageAlt: D0,
  pageDim: 'rgba(150,136,116,0.25)',

  gold: A2,
  goldLit: A1,
  goldDim: A3,

  wood: S4,
  woodLit: 'rgba(244,201,106,0.30)',
  woodDim: 'rgba(14,11,9,0.7)',

  steel: '#d8e0e8',
  steelLit: '#ffffff',
  steelDim: '#74808e',

  rust: '#c0602c',
  rustLit: '#f0904c',
  rustDim: '#803818',

  slot: S5,
  slotDim: S6,

  good: '#9ad86a',
  warn: '#ffc850',
  bad: '#f06048',
  cool: '#7ad4f8',
  gem: '#c88aec',

  out: OUT,
  brass: [A0, A1, A2, A3, A4],
  leather: [S1, S2, S3, S4, S5],
  board: [D0, D1, D2, D3],
  stone: [S0, S1, S2, S3, S4, S5, S6],
  paper: [P0, P1, P2, P3, P4, P5],
  moss: [M1, M2, M3],
  paperInk: INK,
};

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

// ---------------------------------------------------------------------------
// grain
//
// Stone and paper are both textured, and texture is the one thing that
// cannot be drawn a pixel at a time sixty times a second. So each material is
// baked once into a small tile that repeats seamlessly, and filled as a
// pattern - one fillRect for a whole face, however big.

function h32(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on a lattice that wraps every `per` cells, so the tile tiles. */
function pnoise(x, y, per, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (v) => ((v % per) + per) % per;
  const a = h32(w(xi), w(yi), s), b = h32(w(xi + 1), w(yi), s);
  const c = h32(w(xi), w(yi + 1), s), d = h32(w(xi + 1), w(yi + 1), s);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const TILE = 48;
// each material as [fleck, base, patch, pit]: one tone covers most of it,
// a close darker tone makes soft patches, and the light and dark ends only
// turn up as single grains - so it reads as rock, not as camouflage
const RAMPS = {
  stone: [S1, S2, '#83786a', S4],
  lit: [S0, S1, '#a4987f', S3],
  deep: [S4, S5, '#332e29', S6],
  slab: [D0, D1, '#3a352f', D3],
  paper: [P0, P1, '#e8d3a1', P3],
};
const tiles = new Map();
function tile(kind) {
  let cv = tiles.get(kind);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = TILE;
  const g = cv.getContext('2d');
  const ramp = RAMPS[kind] || RAMPS.stone;
  const paper = kind === 'paper';
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = paper
        ? 0.6 * pnoise(x / 12, y / 6, 4, 3) + 0.4 * pnoise(x / 4, y / 2, 12, 9)
        : 0.6 * pnoise(x / 8, y / 6, 6, 5) + 0.4 * pnoise(x / 3, y / 3, 16, 7);
      let k = n < 0.36 ? 2 : 1;
      const r = h32(x, y, kind.length * 17);
      if (r > (paper ? 0.975 : 0.955)) k = 0;               // a light grain
      else if (r < (paper ? 0.006 : 0.03)) k = 3;           // a pit
      if (!paper && k === 1 && n > 0.72 && r > 0.6) k = 0;  // a lit knot
      g.fillStyle = ramp[k];
      g.fillRect(x, y, 1, 1);
    }
  }
  if (paper) {
    // fibres, along the length of the sheet
    for (let i = 0; i < 26; i++) {
      const fx = Math.floor(h32(i, 1, 41) * TILE), fy = Math.floor(h32(i, 2, 41) * TILE);
      const fl = 2 + Math.floor(h32(i, 3, 41) * 4);
      g.fillStyle = h32(i, 4, 41) > 0.5 ? P2 : P0;
      for (let k = 0; k < fl; k++) g.fillRect((fx + k) % TILE, fy, 1, 1);
    }
  }
  tiles.set(kind, cv);
  return cv;
}

const pats = new WeakMap();
const HAS_DOMMATRIX = typeof DOMMatrix !== 'undefined';
/** Fill a rectangle with a material, the grain fixed to (ox, oy) so it moves with its piece. */
function fillTex(ctx, kind, x, y, w, h, ox = x, oy = y) {
  if (w <= 0 || h <= 0) return;
  let m = pats.get(ctx);
  if (!m) { m = new Map(); pats.set(ctx, m); }
  let p = m.get(kind);
  if (p === undefined) {
    try { p = ctx.createPattern(tile(kind), 'repeat'); } catch (e) { p = null; }
    m.set(kind, p);
  }
  if (!p) { R(ctx, x, y, w, h, (RAMPS[kind] || RAMPS.stone)[1]); return; }
  if (HAS_DOMMATRIX && p.setTransform) {
    try { p.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)])); } catch (e) { /* older engines */ }
  }
  ctx.fillStyle = p;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A tuft of moss growing over an edge: `x, y` is the bottom-left of it. */
function moss(ctx, x, y, w, seed) {
  for (let i = 0; i < w; i++) {
    const hgt = 1 + Math.floor(h32(i, seed, 3) * 2.6 * Math.sin(Math.PI * (i + 0.5) / w));
    for (let k = 0; k < hgt; k++) {
      R(ctx, x + i, y - k, 1, 1, k === hgt - 1 ? (h32(i, k, seed) > 0.5 ? M1 : M2) : M3);
    }
  }
}

// ---------------------------------------------------------------------------
// stone

/**
 * The one primitive: a block of stone with a recess cut into its face.
 * `rim` is how thick the stone is round the recess (1-4); `body` paints the
 * recess a colour [lit, base, shade, deep]; `state` is one of
 * rest / hot / down / on / off. Returns the recess.
 */
export function bezel(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 4 || h < 4) return { x, y, w, h };
  const rim = Math.max(1, Math.min(4, opts.rim ?? 2));
  const st = opts.state || 'rest';
  const off = st === 'off', hot = st === 'hot', down = st === 'down', on = st === 'on';
  const a = opts.alpha;
  if (a !== undefined) { ctx.save(); ctx.globalAlpha *= a; }
  const seed = (w * 31 + h * 17 + (opts.seed | 0) * 7) | 0;
  const big = w >= 14 && h >= 12;
  const cut = big ? 2 : 1;

  // the silhouette: a hewn block with its corners knocked off
  R(ctx, x + cut, y, w - cut * 2, h, OUT);
  R(ctx, x, y + cut, w, h - cut * 2, OUT);
  if (cut === 2) {
    R(ctx, x + 1, y + 1, w - 2, h - 2, OUT);
  }
  // the face
  const fx = x + 1, fy = y + 1, fw = w - 2, fh = h - 2;
  const face = off ? 'deep' : hot ? 'lit' : 'stone';
  if (cut === 2) {
    fillTex(ctx, face, fx + 1, fy, fw - 2, fh, x, y);
    fillTex(ctx, face, fx, fy + 1, fw, fh - 2, x, y);
  } else fillTex(ctx, face, fx, fy, fw, fh, x, y);

  // the light on it: lit along the top and left, dark along the foot and right
  const lit = off ? S4 : hot ? S0 : S1;
  const dark = off ? S6 : S5;
  const k1 = cut === 2 ? 1 : 0;
  if (!down) {
    R(ctx, fx + k1, fy, fw - k1 * 2, 1, lit);
    R(ctx, fx, fy + k1, 1, fh - k1 * 2, lit);
    R(ctx, fx + k1, fy + fh - 1, fw - k1 * 2, 1, dark);
    R(ctx, fx + fw - 1, fy + k1, 1, fh - k1 * 2, S4);
  } else {
    R(ctx, fx + k1, fy, fw - k1 * 2, 1, dark);
    R(ctx, fx, fy + k1, 1, fh - k1 * 2, S4);
    R(ctx, fx + k1, fy + fh - 1, fw - k1 * 2, 1, S2);
    R(ctx, fx + fw - 1, fy + k1, 1, fh - k1 * 2, S2);
  }
  // a chip off the top edge, and one off the foot, on the bigger pieces
  if (big && !down) {
    const c1 = fx + 3 + Math.floor(h32(seed, 1, 9) * Math.max(1, fw - 8));
    R(ctx, c1, fy, 2, 1, OUT);
    R(ctx, c1, fy + 1, 2, 1, S0);
    if (fw > 24) {
      const c2 = fx + 4 + Math.floor(h32(seed, 2, 9) * Math.max(1, fw - 10));
      R(ctx, c2, fy + fh - 1, 1, 1, OUT);
      R(ctx, c2 + 1, fy + fh - 1, 1, 1, S6);
    }
  }
  if (hot && !off) {
    // under the pointer the edge warms - a line of ochre along the top
    R(ctx, x + cut, y, w - cut * 2, 1, A3);
  }

  // the recess
  const t = rim + 1;
  const ix = x + t, iy = y + t, iw = w - t * 2, ih = h - t * 2;
  let inner = { x: fx, y: fy, w: fw, h: fh };
  if (iw >= 2 && ih >= 2) {
    // its lip: the top and left edges in shadow, the foot and right catching light
    R(ctx, ix - 1, iy - 1, iw + 2, 1, OUT);
    R(ctx, ix - 1, iy - 1, 1, ih + 2, OUT);
    R(ctx, ix - 1, iy + ih, iw + 2, 1, down ? S3 : S2);
    R(ctx, ix + iw, iy - 1, 1, ih + 2, S3);
    if (opts.body && !off) {
      const [b0, b1, b2, b3] = opts.body;
      R(ctx, ix, iy, iw, ih, hot && !down ? b0 : b1);
      if (ih >= 4) {
        R(ctx, ix, iy, iw, 1, down ? b3 : b2);
        R(ctx, ix, iy + ih - 1, iw, 1, b2);
        if (ih >= 9) R(ctx, ix, iy + Math.round(ih * 0.55), iw, ih - 1 - Math.round(ih * 0.55), mixBand(b1, b2));
      }
      // the grain shows through the paint
      ctx.save();
      ctx.globalAlpha *= 0.18;
      fillTex(ctx, 'stone', ix, iy, iw, ih, x, y);
      ctx.restore();
    } else {
      fillTex(ctx, opts.field === 'slab' ? 'slab' : 'deep', ix, iy, iw, ih, x, y);
      // the shadow the lip throws into it
      R(ctx, ix, iy, iw, 1, 'rgba(0,0,0,0.35)');
      if (hot && !down) R(ctx, ix, iy, iw, ih, 'rgba(255,236,196,0.07)');
    }
    if (on) {
      // the chosen one: a ring of ochre painted round the inside of the recess
      R(ctx, ix, iy, iw, 1, A1);
      R(ctx, ix, iy + ih - 1, iw, 1, A3);
      R(ctx, ix, iy, 1, ih, A2);
      R(ctx, ix + iw - 1, iy, 1, ih, A2);
    }
    inner = { x: ix, y: iy, w: iw, h: ih };
  }
  if (off) R(ctx, fx, fy, fw, fh, 'rgba(18,14,10,0.30)');
  // moss in a low corner of the bigger stones
  if (opts.moss !== false && !off && w >= 22 && h >= 16 && h32(seed, 5, 1) < 0.55) {
    const mw = 3 + Math.floor(h32(seed, 6, 1) * 4);
    const left = h32(seed, 7, 1) < 0.5;
    moss(ctx, left ? x + 1 : x + w - mw - 1, y + h - 1, mw, seed);
  }
  if (a !== undefined) ctx.restore();
  return inner;
}

// a half-tone between two colours, picked once so a field has a soft band
const BAND = new Map();
function mixBand(a, b) {
  const k = a + b;
  let v = BAND.get(k);
  if (!v) {
    const pa = parseInt(a.slice(1, 7), 16), pb = parseInt(b.slice(1, 7), 16);
    if (Number.isNaN(pa) || Number.isNaN(pb)) return a;
    const m = (s) => Math.round((((pa >> s) & 255) + ((pb >> s) & 255)) / 2);
    v = '#' + ((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0');
    BAND.set(k, v);
  }
  return v;
}

/**
 * A slab - a pressable stone. `face` paints its recess, `down` sinks it.
 */
export function slab(ctx, x, y, w, h, opts = {}) {
  return bezel(ctx, x, y, w, h, {
    rim: h >= 14 ? 2 : 1, body: opts.face ? tintRamp(opts.face) : undefined, alpha: opts.alpha,
    state: opts.down ? 'down' : opts.hot ? 'hot' : 'rest', field: 'slab',
  });
}

// a ramp tinted toward a colour, for a stone with paint on it
const TINTS = new Map();
function tintRamp(c) {
  let v = TINTS.get(c);
  if (v) return v;
  const p = parseInt(String(c).replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(p)) return undefined;
  const r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
  const mk = (k, d) => '#' + [r, g, b].map((q) => Math.max(0, Math.min(255, Math.round(q * k + d))))
    .map((q) => q.toString(16).padStart(2, '0')).join('');
  v = [mk(0.85, 14), mk(0.66, 6), mk(0.50, 2), mk(0.36, 0)];
  TINTS.set(c, v);
  return v;
}

/** A stud of darker stone pushed into a lighter one, which is how anything is fixed to anything. */
export function clasp(ctx, x, y, s, sx, sy) {
  const ax = sx > 0 ? x : x - 2;
  const ay = sy > 0 ? y : y - 2;
  R(ctx, ax, ay, 2, 2, S5);
  R(ctx, ax, ay, 1, 1, S1);
}

// ---------------------------------------------------------------------------
// parchment

/**
 * A SCROLL: a sheet of old paper with its ends rolled, lying across. The
 * rolls stand a pixel proud of the sheet top and bottom. Returns where the
 * writing goes.
 */
export function scroll(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 12 || h < 6) return { x, y, w, h };
  const roll = opts.roll ?? (h >= 12 ? 4 : 3);
  const seed = (opts.seed ?? (w * 13 + h * 7)) | 0;
  const a = opts.alpha;
  if (a !== undefined) { ctx.save(); ctx.globalAlpha *= a; }
  if (opts.shadow !== false) {
    ctx.save();
    ctx.globalAlpha *= 0.35;
    R(ctx, x + 2, y + 2, w, h, '#000000');
    ctx.restore();
  }
  const bx = x + roll - 1, bw = w - (roll - 1) * 2;
  // the sheet
  R(ctx, bx, y, bw, h, OUT);
  fillTex(ctx, 'paper', bx, y + 1, bw, h - 2, x, y);
  R(ctx, bx, y + 1, bw, 1, P0);
  if (h >= 9) R(ctx, bx, y + h - 3, bw, 1, P2);
  R(ctx, bx, y + h - 2, bw, 1, P3);
  // ragged: the edges have been handled for a long time
  for (let i = 3; i < bw - 3; i += 2) {
    const r = h32(i, seed, 13);
    if (r < 0.14) { R(ctx, bx + i, y + 1, 1, 1, OUT); R(ctx, bx + i, y + 2, 1, 1, P2); }
    else if (r > 0.88) { R(ctx, bx + i, y + h - 2, 1, 1, OUT); }
  }
  // a stain or two
  if (bw > 30 && h >= 12) {
    const sx = bx + 6 + Math.floor(h32(seed, 3, 5) * (bw - 16));
    R(ctx, sx, y + 3, 4, 2, 'rgba(160,112,56,0.14)');
    R(ctx, sx + 1, y + 5, 3, 1, 'rgba(160,112,56,0.10)');
  }
  // the rolls
  const CYL = [P4, P2, P0, P1, P3, P4];
  for (const left of [true, false]) {
    const rx = left ? x : x + w - roll;
    R(ctx, rx, y - 1, roll, h + 2, OUT);
    for (let i = 0; i < roll - 2; i++) {
      const col = CYL[Math.min(CYL.length - 1, Math.round(i * (CYL.length - 1) / Math.max(1, roll - 3)))];
      R(ctx, rx + 1 + i, y, 1, h, col);
    }
    // the spiral of the roll showing at its end
    R(ctx, rx + 1, y, roll - 2, 1, P5);
    R(ctx, rx + 1, y + h - 1, roll - 2, 1, P5);
    if (h >= 10) R(ctx, rx + 1, y + Math.floor(h / 2), roll - 2, 1, 'rgba(95,74,46,0.45)');
  }
  if (a !== undefined) ctx.restore();
  return { x: bx + 2, y: y + 2, w: bw - 4, h: h - 4 };
}

/**
 * A banner: a scroll pinned across the top of a board, with the title
 * written on it. Wider than the words.
 */
export function banner(ctx, cx, y, text, opts = {}) {
  const tw = textWidth(text);
  const w = Math.max(opts.minW || 0, tw + 24), h = opts.h || 13;
  const x = Math.round(cx - w / 2);
  y = Math.round(y);
  scroll(ctx, x, y, w, h, { seed: tw * 3 + h });
  drawText(ctx, text, Math.round(cx), y + Math.round((h - 7) / 2), { color: INK, align: 'center' });
  return { x, y, w, h };
}

/**
 * A PLANK: a strip of scroll with a line written on it - the title strip
 * and the divider.
 */
export function plank(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 14 || h < 6) return { x, w };
  scroll(ctx, x, y, w, h, { seed: opts.seed, roll: 3 });
  if (opts.label) {
    drawText(ctx, ellipsize(opts.label, w - 14), x + w / 2, y + Math.round((h - 7) / 2),
      { color: opts.inkColor || INK, align: 'center' });
  }
  return { x: x + 5, w: w - 10 };
}

/**
 * A parchment card, for the things that are written rather than pressed: a
 * note, a page, a reward. Pale paper, a darker edge where it has been
 * handled, a corner turned over, and - if asked - a pin through the top.
 */
export function parchment(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 8 || h < 8) return { x, y, w, h };
  const seed = (opts.seed ?? (w * 5 + h * 11)) | 0;
  if (opts.shadow !== false) {
    ctx.save();
    ctx.globalAlpha *= 0.35;
    R(ctx, x + 2, y + 2, w, h, '#000000');
    ctx.restore();
  }
  R(ctx, x + 1, y, w - 2, h, OUT);
  R(ctx, x, y + 1, w, h - 2, OUT);
  fillTex(ctx, 'paper', x + 1, y + 1, w - 2, h - 2, x, y);
  R(ctx, x + 1, y + 1, w - 2, 1, P0);
  R(ctx, x + 1, y + h - 2, w - 2, 1, P3);
  R(ctx, x + w - 2, y + 2, 1, h - 4, P2);
  for (let i = 3; i < w - 3; i += 2) {
    const r = h32(i, seed, 21);
    if (r < 0.12) R(ctx, x + i, y + 1, 1, 1, P2);
  }
  // the corner that has been turned over
  if (w > 20 && h > 16) {
    const cx = x + w - 6, cy = y + h - 6;
    for (let i = 0; i < 5; i++) R(ctx, cx + i, cy + 4 - i, 5 - i, 1, P2);
    for (let i = 0; i < 5; i++) R(ctx, cx + i, cy + 4 - i, 1, 1, P4);
  }
  if (opts.pin) {
    const px = x + Math.round(w / 2);
    R(ctx, px - 1, y - 1, 3, 3, OUT);
    R(ctx, px, y, 1, 1, '#c0402e');
  }
  return { x: x + 3, y: y + 3, w: w - 6, h: h - 6 };
}

// ---------------------------------------------------------------------------
// boards

/**
 * A window - a board cut from dark stone. A thick hewn frame round a slab
 * set into it, moss in its low corners, a crack or two, and a scroll pinned
 * across the top with the title on it.
 *
 * Returns the page rectangle and where the X landed, so the caller hit-tests
 * it rather than this file guessing at an input system it cannot see.
 */
export function windowFrame(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const T = opts.title !== undefined;
  const bar = T ? (opts.barH || 13) : 0;
  const F = 5;
  const seed = (w * 7 + h * 3) | 0;

  // the shadow it throws on the world behind it
  ctx.save();
  ctx.globalAlpha *= 0.5;
  R(ctx, x + 3, y + 4, w, h, '#000000');
  ctx.restore();

  // the hewn frame
  R(ctx, x + 3, y, w - 6, h, OUT);
  R(ctx, x, y + 3, w, h - 6, OUT);
  R(ctx, x + 1, y + 1, w - 2, h - 2, OUT);
  fillTex(ctx, 'stone', x + 3, y + 1, w - 6, h - 2, x, y);
  fillTex(ctx, 'stone', x + 1, y + 3, w - 2, h - 6, x, y);
  fillTex(ctx, 'stone', x + 2, y + 2, w - 4, h - 4, x, y);
  // the light on the frame
  R(ctx, x + 3, y + 1, w - 6, 1, S0);
  R(ctx, x + 2, y + 2, w - 4, 1, S1);
  R(ctx, x + 1, y + 3, 1, h - 6, S1);
  R(ctx, x + 2, y + 3, 1, h - 6, 'rgba(220,207,180,0.35)');
  R(ctx, x + 3, y + h - 2, w - 6, 1, S6);
  R(ctx, x + 2, y + h - 3, w - 4, 1, S5);
  R(ctx, x + w - 2, y + 3, 1, h - 6, S5);
  R(ctx, x + w - 3, y + 3, 1, h - 6, S4);
  // chips along the edges: the frame was cut by hand
  for (let i = 8; i < w - 8; i += 9) {
    const r = h32(i, seed, 3);
    if (r < 0.35) { R(ctx, x + i, y + 1, 2, 1, OUT); R(ctx, x + i, y + 2, 2, 1, S0); }
    else if (r > 0.8) { R(ctx, x + i, y + h - 2, 2, 1, OUT); }
  }
  for (let j = 8; j < h - 8; j += 11) {
    const r = h32(seed, j, 4);
    if (r < 0.3) R(ctx, x + 1, y + j, 1, 2, OUT);
    else if (r > 0.82) R(ctx, x + w - 2, y + j, 1, 2, OUT);
  }
  // a crack or two running into the frame from its edge
  const cracks = w > 80 ? 2 : 1;
  for (let c = 0; c < cracks; c++) {
    const along = h32(seed, c, 8);
    let cx = Math.round(x + 10 + along * (w - 20)), cy = c % 2 ? y + h - 2 : y + 1;
    const dir = c % 2 ? -1 : 1;
    for (let k = 0; k < 4; k++) {
      R(ctx, cx, cy, 1, 1, S6);
      R(ctx, cx + 1, cy, 1, 1, S2);
      cy += dir;
      if (h32(c, k, seed) > 0.5) cx += h32(k, c, seed) > 0.5 ? 1 : -1;
    }
  }

  // the slab set into it
  const px = x + F, py = y + F + bar, pw = w - F * 2, ph = h - F * 2 - bar;
  if (pw > 2 && ph > 2) {
    R(ctx, px - 1, py - 1, pw + 2, 1, OUT);
    R(ctx, px - 1, py - 1, 1, ph + 2, OUT);
    R(ctx, px - 1, py + ph, pw + 2, 1, S2);
    R(ctx, px + pw, py - 1, 1, ph + 2, S3);
    fillTex(ctx, 'slab', px, py, pw, ph, x, y);
    R(ctx, px, py, pw, 1, 'rgba(0,0,0,0.40)');
    R(ctx, px, py + 1, pw, 1, 'rgba(0,0,0,0.18)');
  }
  // moss, where water would sit
  moss(ctx, x + 3, y + h - 1, 6 + Math.floor(h32(seed, 9, 2) * 6), seed);
  moss(ctx, x + w - 10, y + h - 1, 5 + Math.floor(h32(seed, 10, 2) * 3), seed + 1);
  if (w > 120) moss(ctx, x + Math.round(w * (0.3 + h32(seed, 11, 2) * 0.4)), y + h - 1, 4, seed + 2);

  let close = null;
  if (T) {
    const title = String(opts.title);
    banner(ctx, x + w / 2, y + 2, ellipsize(title, w - 64), { h: bar + 1 });
    // the X: a round stone with a red mark painted on it
    const s = Math.max(12, bar + 2);
    const cx = x + w - s - 3, cy = y + 3;
    bezel(ctx, cx, cy, s, s, {
      rim: 1, moss: false,
      body: opts.closeHot ? ['#e2563e', '#c8402e', '#a82e22', '#6a1a12'] : ['#b8402e', '#9a3022', '#7a2218', '#4e140c'],
      state: opts.closeDown ? 'down' : opts.closeHot ? 'hot' : 'rest',
    });
    const o = opts.closeDown ? 1 : 0;
    const n = s - 7;
    for (let i = 0; i < n; i++) {
      R(ctx, cx + 3 + i + o, cy + 3 + i + o, 2, 1, '#fde8d0');
      R(ctx, cx + s - 5 - i + o, cy + 3 + i + o, 2, 1, '#fde8d0');
    }
    close = { x: cx, y: cy, w: s, h: s };
  }
  // the page as the old frame laid it out, so every screen keeps its layout
  return { x: x + 6, y: y + 6 + bar, w: w - 12, h: h - 12 - bar, close };
}

// ---------------------------------------------------------------------------
// controls

/**
 * A button: a stone with its label cut into it.
 *
 * `hot` is the pointer over it, `down` is it being held, `on` is it being the
 * selected one of a set - three different things that used to all be "lit".
 */
export function button(ctx, x, y, w, h, label, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot, down = !!opts.down;
  const off = !!opts.disabled;
  const body = opts.tint && opts.tint !== C.gold && opts.tint !== A2 ? tintRamp(opts.tint) : undefined;
  bezel(ctx, x, y, w, h, {
    rim: h >= 16 ? 2 : 1, body,
    state: off ? 'off' : down || (on && opts.sticky) ? 'down' : on ? 'on' : hot ? 'hot' : 'rest',
    moss: opts.moss,
  });
  const o = (down || (on && opts.sticky)) ? 1 : 0;
  const tx = Math.round(x + w / 2) + o;
  const ty = Math.round(y + (h - 7) / 2) + o;
  const col = off ? 'rgba(246,234,208,0.34)' : on ? A0 : C.ink;
  if (opts.icon) {
    const iw = typeof opts.iconW === 'number' ? opts.iconW : 11;
    const lw = label ? textWidth(label) : 0;
    const ix = Math.round(x + (w - (iw + (lw ? lw + 3 : 0))) / 2) + o;
    if (typeof opts.icon === 'string') drawIcon(ctx, opts.icon, ix + iw / 2, Math.round(y + h / 2) + o, 1, { gray: off });
    else opts.icon(ctx, ix + 5, Math.round(y + h / 2) + o);
    if (label) drawText(ctx, label, ix + iw + 3, ty, { color: col, outline: true, outlineColor: OUT });
    return;
  }
  if (label) drawText(ctx, ellipsize(label, w - 8), tx, ty, { color: col, align: 'center', outline: true, outlineColor: OUT });
}

/** A darker stone, for a control that is hardware rather than a choice. */
export function steelButton(ctx, x, y, s, opts = {}) {
  bezel(ctx, x, y, s, s, {
    rim: 1, body: ['#7e776e', '#665f57', '#4e4842', '#36322d'], moss: false,
    state: opts.down ? 'down' : opts.on ? 'on' : opts.hot ? 'hot' : 'rest',
  });
}

/**
 * A SLOT: a socket cut into a stone, the shape the icons were painted to
 * sit in. A slot you cannot use yet is darker and flatter, because "not yet"
 * and "empty" are different things.
 */
export function slot(ctx, x, y, w, h = w, opts = {}) {
  const empty = !!opts.empty;
  const st = opts.on ? 'on' : opts.hot ? 'hot' : 'rest';
  const back = opts.back;
  bezel(ctx, x, y, w, h, {
    rim: w >= 20 ? 2 : 1, moss: w >= 26 ? undefined : false,
    body: back ? [back, back, tintRamp(back)?.[2] || back, tintRamp(back)?.[3] || back] : undefined,
    state: st,
  });
  if (empty) R(ctx, x + 3, y + 3, w - 6, h - 6, 'rgba(10,8,6,0.22)');
}

/**
 * A segmented bar: a row of notches cut into the stone, painted in or not.
 * It reads at a glance and it never needs a number beside it.
 */
export function blocks(ctx, x, y, w, h, f, col = A2, opts = {}) {
  const n = opts.n || Math.max(4, Math.floor(w / 5));
  const bw = Math.floor((w - (n - 1)) / n);
  const lit = Math.round(clamp01(f) * n);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + i * (bw + 1));
    R(ctx, bx, y, bw, h, OUT);
    R(ctx, bx, y, bw, h - 1, i < lit ? col : S6);
    if (i < lit) R(ctx, bx, y, bw, 1, 'rgba(255,245,214,0.7)');
    else R(ctx, bx, y + h - 2, bw, 1, S4);
  }
}

/** A gauge: a channel cut in stone with something running along it. */
export function gauge(ctx, x, y, w, h, f, col = C.good) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x + 1, y, w - 2, h, OUT);
  R(ctx, x, y + 1, w, h - 2, OUT);
  R(ctx, x + 1, y + 1, w - 2, h - 2, S6);
  if (h > 3) R(ctx, x + 1, y + h - 2, w - 2, 1, S5);
  const fw = Math.round((w - 2) * clamp01(f));
  if (fw > 0) {
    R(ctx, x + 1, y + 1, fw, h - 2, col);
    R(ctx, x + 1, y + 1, fw, 1, 'rgba(255,255,255,0.55)');
    ctx.globalAlpha *= 0.4;
    R(ctx, x + 1, y + h - 2, fw, 1, OUT);
    ctx.globalAlpha /= 0.4;
    if (fw > 2) R(ctx, x + fw, y + 1, 1, h - 2, 'rgba(255,255,255,0.4)');
  }
  if (w >= 10) {
    R(ctx, x, y + 1, 2, h - 2, S3);
    R(ctx, x + w - 2, y + 1, 2, h - 2, S3);
    R(ctx, x, y + 1, 2, 1, S1);
    R(ctx, x + w - 2, y + 1, 2, 1, S1);
  }
}

/** A tick box, on or off, with a tick painted in it. */
export function check(ctx, x, y, s, on, hot) {
  bezel(ctx, x, y, s, s, { rim: 1, moss: false, state: hot ? 'hot' : 'rest',
    body: on ? ['#a8e060', '#5eaa3a', '#2e6a26', '#163a18'] : undefined });
  if (!on) return;
  for (let i = 0; i < 2; i++) R(ctx, x + 3 + i, y + 5 + i, 1, 2, '#fff6dc');
  for (let i = 0; i < 4; i++) R(ctx, x + 5 + i, y + 7 - i, 1, 2, '#fff6dc');
}

/** A paging arrow. `dir` is -1 or 1 for left/right, or 'up'/'down'. */
export function arrow(ctx, x, y, s, dir, opts = {}) {
  bezel(ctx, x, y, s, s, { rim: 1, moss: false, state: opts.down ? 'down' : opts.hot ? 'hot' : 'rest' });
  const o = opts.down ? 1 : 0;
  const cx = Math.round(x + s / 2) + o, cy = Math.round(y + s / 2) + o;
  const n = Math.floor((s - 4) / 2);
  const col = opts.hot ? A0 : A1;
  for (let i = 0; i < n; i++) {
    if (dir === 'up') R(ctx, cx - i, cy - n / 2 + i + 1, i * 2 + 1, 1, col);
    else if (dir === 'down') R(ctx, cx - i, cy + n / 2 - i - 1, i * 2 + 1, 1, col);
    else if (dir > 0) R(ctx, cx + n / 2 - i - 1, cy - i, 1, i * 2 + 1, col);
    else R(ctx, cx - n / 2 + i + 1, cy - i, 1, i * 2 + 1, col);
  }
}

/**
 * A row in a list. Alternating rows get a shade of the slab, which is the
 * one trick that makes a long list readable without drawing a box round
 * every line of it. The chosen row has ochre painted down its edge.
 */
export function row(ctx, x, y, w, h, i, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot;
  R(ctx, x, y, w, h, on ? '#5a5046' : hot ? '#4e463e' : (i & 1) ? D0 : D1);
  if (on) {
    R(ctx, x, y, 2, h, A1);
    R(ctx, x, y, w, 1, 'rgba(244,201,106,0.35)');
    R(ctx, x, y + h - 1, w, 1, 'rgba(14,11,9,0.6)');
  }
}

/** A groove cut across a page. */
export function rule(ctx, x, y, w) {
  R(ctx, x, y, w, 1, 'rgba(10,8,6,0.75)');
  R(ctx, x, y + 1, w, 1, 'rgba(214,198,170,0.20)');
}

/** A heading on a page: small, in ochre, with a groove under it. */
export function heading(ctx, x, y, w, text) {
  drawText(ctx, text, x, y, { color: A1 });
  rule(ctx, x, y + 9, w);
}

/**
 * A plaque: a thin plate of dark stone the HUD says things on, because it is
 * not something you press. `tint` paints a stripe of colour down its edge.
 */
export function plaque(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  bezel(ctx, x, y, w, h, {
    rim: 1, alpha: opts.alpha, field: 'slab', moss: opts.moss,
    body: opts.face ? tintRamp(opts.face) : undefined,
  });
  if (opts.tint) {
    R(ctx, x + 2, y + 2, 2, h - 4, opts.tint);
    R(ctx, x + 2, y + 2, 2, 1, 'rgba(255,255,255,0.45)');
  }
}

/** A length of twisted cord, for a divider that is a thing rather than a line. */
export function chain(ctx, x, y, h, vertical = true) {
  const n = Math.floor(h / 2);
  for (let i = 0; i < n; i++) {
    const ox = vertical ? x : x + i * 2;
    const oy = vertical ? y + i * 2 : y;
    R(ctx, ox - 1, oy, 2, 2, i & 1 ? P4 : P3);
    R(ctx, ox - 1, oy, 1, 1, P2);
  }
}

/** A padlock, for the things you have not earned yet. */
export function lock(ctx, x, y, s = 9) {
  if (drawIcon(ctx, 'lock', x + s / 2, y + s / 2, 1)) return;
  const b = Math.round(s * 0.6);
  R(ctx, x + 2, y, s - 4, 2, '#a8b4c0');
  R(ctx, x + 2, y + 1, 1, s - b, '#a8b4c0');
  R(ctx, x + s - 3, y + 1, 1, s - b, '#a8b4c0');
  R(ctx, x, y + s - b, s, b, OUT);
  R(ctx, x + 1, y + s - b, s - 2, b - 1, S3);
  R(ctx, x + 1, y + s - b, s - 2, 1, S1);
  R(ctx, x + Math.floor(s / 2) - 1, y + s - b + 2, 2, 2, OUT);
}

/**
 * A rough little stone with a mark on it - for key hints and small labels
 * that sit on the world rather than on a board.
 */
export function pebble(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x + 1, y, w - 2, h, OUT);
  R(ctx, x, y + 1, w, h - 2, OUT);
  fillTex(ctx, opts.dark ? 'deep' : 'stone', x + 1, y + 1, w - 2, h - 2, x, y);
  R(ctx, x + 1, y + 1, w - 2, 1, opts.dark ? S4 : S0);
  R(ctx, x + 1, y + h - 2, w - 2, 1, opts.dark ? '#1d1a17' : S4);
}

export { R as px, fillTex as texture };
