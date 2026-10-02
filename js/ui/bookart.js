// CRABDEN - the book as a made object: paper, leather, ink, and a page that turns.
//
// Everything here is baked once into a canvas and drawn as an image after
// that. The only thing that runs per frame is `drawLeaf`, which bends a
// baked page round the spine a column at a time - that is the page turn.
//
//   paperSheet   a sheet of aged laid paper, foxed, browned at the edges and
//                shaded down into the gutter on whichever side the spine is
//   marbled      the endpapers: Turkish marbling, combed and veined
//   coverFace    the front board: tooled leather, gold fillets, brass corners,
//                a stamped ammonite and the title in gold
//   engrave      a creature, plant, fish or stone as the plates in a real
//                natural history are: a hand-tinted engraving when it has been
//                studied, a bare ink sketch when it has only been seen, and a
//                pencilled shadow when it has not been found at all
//   handText     Vess's handwriting: the book's own type, slanted, in iron ink

import { makeCanvas } from '../render/pixel.js';
import { valueNoise2, fbm2, clamp01, TAU } from '../lib/math.js';
import { drawText, wrapText, textWidth } from '../lib/font.js';
import * as K from './kit.js';

// ---------------------------------------------------------------------------
// palette

export const INK = '#2e1d10';          // printed text
export const INK2 = '#5a4026';         // secondary print
export const INK3 = 'rgba(70,48,26,0.55)';
export const RUBRIC = '#8e2a18';       // red ink, for capitals and plate numbers
export const HAND = '#29365c';         // Vess's iron-gall ink, gone blue-black
export const HAND_SOFT = 'rgba(41,54,92,0.55)';
export const GOLD = ['#fff3b0', '#ffd648', '#e6a51c', '#a86c14', '#5a3a0c'];
const PAPER = [[252, 244, 218], [244, 230, 192], [236, 218, 172], [222, 200, 150], [200, 174, 122], [168, 140, 92]];
const LEATHER = [[132, 62, 34], [112, 50, 28], [94, 40, 22], [76, 32, 18], [58, 24, 14], [40, 16, 10]];

function h32(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));

/** Pick a step of a ramp by a continuous value, ordered-dithered. */
function stepOf(ramp, v, x, y) {
  const f = clamp01(v) * (ramp.length - 1);
  const i = Math.floor(f);
  return ramp[Math.min(ramp.length - 1, i + (f - i > BAYER4[y & 3][x & 3] ? 1 : 0))];
}

// ---------------------------------------------------------------------------
// paper

const sheets = new Map();

/**
 * A blank page. `side` is 'left' (spine on its right), 'right' (spine on its
 * left) or 'single'. `seed` picks which foxing and stains it carries.
 */
export function paperSheet(w, h, side, seed = 0) {
  const key = `${w}x${h}:${side}:${seed % 6}`;
  let cv = sheets.get(key);
  if (cv) return cv;
  cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const s = 31 + (seed % 6) * 17;
  // where the stains are
  const spots = [];
  for (let i = 0; i < 7; i++) {
    spots.push({ x: h32(i, 1, s) * w, y: h32(i, 2, s) * h, r: 0.6 + h32(i, 3, s) * 2.4, a: 0.3 + h32(i, 4, s) * 0.5 });
  }
  const ring = (seed % 6) === 4 ? { x: w * (0.3 + h32(9, 9, s) * 0.4), y: h * (0.55 + h32(8, 8, s) * 0.3), r: 18 + h32(7, 7, s) * 10 } : null;
  const gutterAt = side === 'left' ? w : side === 'right' ? 0 : -999;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // laid paper: a faint horizontal chain of lines, and a mottle
      const mott = fbm2(x / 22, y / 30, 3, s) * 0.55 + valueNoise2(x / 3, y / 1.5, s + 5) * 0.2;
      let v = 0.18 + mott * 0.32;
      if (y % 5 === 0) v += 0.05;
      // edges brown first: the fore-edge, the head and the tail
      const fore = side === 'left' ? x : side === 'right' ? w - 1 - x : Math.min(x, w - 1 - x);
      const edge = Math.min(fore, y, h - 1 - y);
      v += Math.pow(clamp01(1 - edge / 16), 2.2) * 0.55 * (0.7 + fbm2(x / 9, y / 9, 2, s + 9) * 0.6);
      // and the gutter falls away into shadow
      if (gutterAt > -999) {
        const gd = Math.abs(x - gutterAt);
        v += Math.pow(clamp01(1 - gd / 22), 2) * 0.75;
      }
      // foxing
      for (const p of spots) {
        const dd = Math.hypot(x - p.x, (y - p.y) * 1.2);
        if (dd < p.r + 1.5) v += (dd < p.r ? p.a : p.a * 0.4) * (0.6 + h32(x, y, s) * 0.4);
      }
      if (ring) {
        const dd = Math.abs(Math.hypot(x - ring.x, y - ring.y) - ring.r);
        if (dd < 1.3) v += 0.28 * (0.5 + 0.5 * fbm2(x / 5, y / 5, 2, s + 3));
      }
      // fibres
      const r = h32(x, y, s + 1);
      if (r > 0.992) v -= 0.25; else if (r < 0.006) v += 0.3;
      const c = stepOf(PAPER, v, x, y);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // the cut edge of the sheet, a shade darker
  g.fillStyle = 'rgba(120,90,50,0.35)';
  if (side !== 'right') g.fillRect(0, 0, 1, h);
  if (side !== 'left') g.fillRect(w - 1, 0, 1, h);
  g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
  sheets.set(key, cv);
  if (sheets.size > 24) sheets.delete(sheets.keys().next().value);
  return cv;
}

// ---------------------------------------------------------------------------
// marbling, for the endpapers

const MARBLE = [[30, 44, 78], [46, 66, 108], [140, 52, 36], [196, 138, 60], [228, 210, 168], [20, 26, 44]];

export function marbled(w, h, seed = 7) {
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // combed: a sine field pushed about by two layers of warp
      const wx = fbm2(x / 40, y / 40, 3, seed) * 6;
      const wy = fbm2(x / 30 + 9, y / 30, 3, seed + 3) * 6;
      const t = Math.sin(x / 9 + wx * 2.2 + Math.sin(y / 14 + wy) * 1.6);
      const u = Math.sin(y / 7 + wy * 1.8 + x / 30);
      let c;
      if (Math.abs(t) < 0.09) c = MARBLE[4];                // the cream veins
      else if (Math.abs(u) < 0.06 && t > 0) c = MARBLE[3];  // gold threads
      else if (t > 0.55) c = MARBLE[2];
      else if (t > 0) c = MARBLE[1];
      else if (t > -0.7) c = MARBLE[0];
      else c = MARBLE[5];
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// leather

function leatherInto(g, x0, y0, w, h, seed, tone = 0) {
  const img = g.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const grain = valueNoise2(x / 1.6, y / 1.6, seed) * 0.35 + fbm2(x / 14, y / 14, 3, seed + 4) * 0.45;
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      let v = 0.2 + grain * 0.5 + tone;
      v += Math.pow(clamp01(1 - edge / 10), 2) * 0.35;           // rubbed darker at the edges
      v -= Math.pow(clamp01(1 - Math.hypot(x - w * 0.35, y - h * 0.3) / (w * 0.8)), 2) * 0.18; // a sheen
      if (h32(x, y, seed) > 0.985) v -= 0.25;                     // a scuff
      const c = stepOf(LEATHER, v, x, y);
      const i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, x0, y0);
}

/** A rectangle of leather, for the open boards behind the pages. */
export function leatherBoard(w, h, seed = 3) {
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  leatherInto(g, 0, 0, w, h, seed);
  // blind-tooled line round the edge
  g.fillStyle = 'rgba(20,8,4,0.45)';
  g.fillRect(3, 3, w - 6, 1); g.fillRect(3, h - 4, w - 6, 1);
  g.fillRect(3, 3, 1, h - 6); g.fillRect(w - 4, 3, 1, h - 6);
  return cv;
}

/** Gold text with a stamped shadow and a lit top edge. */
export function goldText(g, str, x, y, scale = 1, align = 'center') {
  drawText(g, str, x + scale, y + scale, { color: '#24100a', scale, align });
  drawText(g, str, x, y, { color: GOLD[2], scale, align });
  g.save();
  g.beginPath(); g.rect(0, y, 4096, Math.max(1, 3 * scale)); g.clip();
  drawText(g, str, x, y, { color: GOLD[1], scale, align });
  g.restore();
  g.save();
  g.beginPath(); g.rect(0, y, 4096, scale); g.clip();
  drawText(g, str, x, y, { color: GOLD[0], scale, align });
  g.restore();
}

function goldRule(g, x, y, w, vertical = false) {
  if (vertical) {
    g.fillStyle = GOLD[3]; g.fillRect(x + 1, y, 1, w);
    g.fillStyle = GOLD[1]; g.fillRect(x, y, 1, w);
  } else {
    g.fillStyle = GOLD[3]; g.fillRect(x, y + 1, w, 1);
    g.fillStyle = GOLD[1]; g.fillRect(x, y, w, 1);
  }
}

/** A gold fleuron: a little four-petal stamp, for the corners of a frame. */
function fleuron(g, cx, cy, r = 3) {
  for (let a = 0; a < 4; a++) {
    const ang = a * TAU / 4 + TAU / 8;
    for (let k = 1; k <= r; k++) {
      const px = Math.round(cx + Math.cos(ang) * k), py = Math.round(cy + Math.sin(ang) * k);
      g.fillStyle = k === r ? GOLD[3] : GOLD[1];
      g.fillRect(px, py, 1, 1);
    }
  }
  g.fillStyle = GOLD[0]; g.fillRect(cx, cy, 1, 1);
  g.fillStyle = GOLD[2];
  g.fillRect(cx - 1, cy, 1, 1); g.fillRect(cx + 1, cy, 1, 1); g.fillRect(cx, cy - 1, 1, 1); g.fillRect(cx, cy + 1, 1, 1);
}

/** The ammonite on the front board, stamped in gold: a logarithmic spiral with its chambers. */
export function ammoniteStamp(g, cx, cy, R, pal = GOLD, shade = 'rgba(36,16,10,0.5)') {
  const pts = [];
  for (let t = 0; t < 5.2 * Math.PI; t += 0.02) {
    const r = R * Math.exp(-0.17 * (5.2 * Math.PI - t));
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.92, r, t]);
  }
  // shell body, filled ring by ring
  for (const [x, y, r] of pts) {
    const k = Math.max(1, r * 0.18);
    g.fillStyle = shade;
    g.fillRect(Math.round(x + 1), Math.round(y + 1), Math.ceil(k), Math.ceil(k));
  }
  for (const [x, y, r] of pts) {
    g.fillStyle = r > R * 0.5 ? pal[2] : pal[1];
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  // ribs across the whorl
  for (let i = 0; i < pts.length; i += 14) {
    const [x, y, r, t] = pts[i];
    const nx = Math.cos(t), ny = Math.sin(t);
    for (let k = 0; k < r * 0.32; k += 0.7) {
      g.fillStyle = k < 1 ? pal[0] : pal[2];
      g.fillRect(Math.round(x - nx * k), Math.round(y - ny * k * 0.92), 1, 1);
    }
  }
  g.fillStyle = pal[0];
  g.fillRect(Math.round(cx), Math.round(cy), 1, 1);
}

/**
 * The front board of the closed book, w x h. The spine side is on the left.
 */
export function coverFace(w, h, title = ['THE BOOK OF', 'THE OLD SEA']) {
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  leatherInto(g, 0, 0, w, h, 11, -0.02);
  // the hinge, where the board meets the spine: a groove and a raised band
  g.fillStyle = 'rgba(20,8,4,0.55)'; g.fillRect(8, 0, 1, h);
  g.fillStyle = 'rgba(255,190,140,0.12)'; g.fillRect(9, 0, 1, h);
  g.fillStyle = 'rgba(20,8,4,0.25)'; g.fillRect(0, 0, 8, h);
  // blind tooling, then the gold fillet inside it
  g.fillStyle = 'rgba(20,8,4,0.5)';
  g.fillRect(14, 6, w - 20, 1); g.fillRect(14, h - 7, w - 20, 1);
  g.fillRect(14, 6, 1, h - 12); g.fillRect(w - 7, 6, 1, h - 12);
  goldRule(g, 18, 10, w - 28); goldRule(g, 18, h - 12, w - 28);
  goldRule(g, 18, 10, h - 21, true); goldRule(g, w - 11, 10, h - 21, true);
  for (const [fx, fy] of [[23, 15], [w - 16, 15], [23, h - 17], [w - 16, h - 17]]) fleuron(g, fx, fy, 3);
  // the panel: title, the stamp, and the motto
  const cx = Math.round(14 + (w - 20) / 2);
  const big = w > 150 ? 2 : 1;
  goldText(g, title[0], cx, Math.round(h * 0.17), 1);
  goldText(g, title[1], cx, Math.round(h * 0.17) + 11, big);
  const sy = Math.round(h * 0.52);
  const R = Math.min(w * 0.22, h * 0.17);
  // a ring round the stamp
  for (let a = 0; a < TAU; a += 0.01) {
    const x = Math.round(cx + Math.cos(a) * (R + 7)), y = Math.round(sy + Math.sin(a) * (R + 7));
    g.fillStyle = a > Math.PI ? GOLD[3] : GOLD[2];
    g.fillRect(x, y, 1, 1);
  }
  for (let a = 0; a < TAU; a += TAU / 24) fleuron(g, Math.round(cx + Math.cos(a) * (R + 10)), Math.round(sy + Math.sin(a) * (R + 10)), 1);
  ammoniteStamp(g, cx, sy, R);
  goldRule(g, cx - 30, Math.round(h * 0.8), 60);
  goldText(g, 'VESS', cx, Math.round(h * 0.8) + 6, 1);
  // brass corners on the fore-edge side
  for (const [x, y, sx, sy2] of [[w - 1, 0, -1, 1], [w - 1, h - 1, -1, -1]]) {
    for (let a = 0; a < 10; a++) {
      for (let b = 0; b < 10 - a; b++) {
        const c = a + b === 9 ? '#3a2208' : a === 0 || b === 0 ? '#c9a24a' : a + b < 3 ? '#f2d48a' : '#8f6a2a';
        g.fillStyle = c;
        g.fillRect(x + sx * a, y + sy2 * b, 1, 1);
      }
    }
    g.fillStyle = '#fff6c2';
    g.fillRect(x + sx * 3, y + sy2 * 3, 1, 1);
  }
  return cv;
}

/** The inside of the front board: leather turned in round marbled paper, and a bookplate. */
export function insideCover(w, h, side = 'left') {
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  leatherInto(g, 0, 0, w, h, 23, 0.06);
  const m = 7;
  const mx = side === 'left' ? m : 2, mw = w - m - 2;
  g.drawImage(marbled(mw, h - m * 2, side === 'left' ? 7 : 19), mx, m);
  g.fillStyle = 'rgba(20,8,4,0.5)';
  g.fillRect(mx - 1, m - 1, mw + 2, 1); g.fillRect(mx - 1, h - m, mw + 2, 1);
  g.fillRect(mx - 1, m - 1, 1, h - m * 2 + 2); g.fillRect(mx + mw, m - 1, 1, h - m * 2 + 2);
  return cv;
}

// ---------------------------------------------------------------------------
// handwriting

const hands = new Map();

/** A line of Vess's hand: the book's type, slanted forward, baked once per line. */
function handLine(str, color) {
  const key = color + '|' + str;
  let cv = hands.get(key);
  if (cv) return cv;
  const w = textWidth(str) + 4, h = 8;
  const flat = makeCanvas(w, h);
  drawText(flat.getContext('2d'), str, 0, 0, { color });
  cv = makeCanvas(w + 3, h);
  const g = cv.getContext('2d');
  // three bands, the top one pushed furthest right: an italic
  g.drawImage(flat, 0, 0, w, 2, 2, 0, w, 2);
  g.drawImage(flat, 0, 2, w, 3, 1, 2, w, 3);
  g.drawImage(flat, 0, 5, w, 3, 0, 5, w, 3);
  hands.set(key, cv);
  if (hands.size > 600) hands.delete(hands.keys().next().value);
  return cv;
}

/** Draw wrapped handwriting; returns the y under it. `maxLines` cuts it short. */
export function handText(g, str, x, y, w, opts = {}) {
  const color = opts.color || HAND;
  const lh = opts.lh || 9;
  let lines = wrapText(str, w - 3);
  if (opts.maxLines && lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\W*\w*$/, '') + '...';
  }
  for (const l of lines) {
    g.drawImage(handLine(l, color), Math.round(x + (opts.indent || 0)), Math.round(y));
    y += lh;
  }
  return y;
}

export function handLines(str, w) { return wrapText(str, w - 3).length; }

// ---------------------------------------------------------------------------
// engraving

const plates = new Map();

/**
 * Turn a piece of the game's art into a plate for the book, scaled up by a
 * whole number `k` so the hatching is one screen pixel fine.
 *   'plate'   hand-tinted engraving: the colours knocked back toward the
 *             paper, outlined and cross-hatched in the shadows
 *   'sketch'  ink only: outline, contour and hatching, no colour
 *   'shadow'  a pencilled silhouette, for a page not yet found
 */
export function engrave(src, k, mode, key) {
  const ck = `${key}:${mode}:${k}`;
  let cv = plates.get(ck);
  if (cv) return cv;
  const sw = src.width, sh = src.height;
  let sd;
  try { sd = src.getContext('2d').getImageData(0, 0, sw, sh).data; } catch { return src; }
  const W = sw * k + 2, H = sh * k + 2;
  cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const out = g.createImageData(W, H);
  const d = out.data;
  const lum = new Float32Array(sw * sh);
  for (let i = 0; i < sw * sh; i++) {
    lum[i] = (sd[i * 4] * 0.3 + sd[i * 4 + 1] * 0.55 + sd[i * 4 + 2] * 0.15) / 255;
  }
  const A = (x, y) => (x < 0 || y < 0 || x >= sw || y >= sh ? 0 : sd[(y * sw + x) * 4 + 3]);
  // Everything is sampled bilinearly from the art, so a plate scaled up four
  // times is a drawing with round edges rather than the sprite with its
  // pixels made bigger: the silhouette is the half-coverage line of the
  // smoothed alpha, and the tone under the hatching shades continuously.
  const bil = (X, Y) => {
    const fx = (X - 1 + 0.5) / k - 0.5, fy = (Y - 1 + 0.5) / k - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    let a = 0, r = 0, gg = 0, b = 0, l = 0;
    const acc = (x, y, w) => {
      const al = A(x, y) / 255;
      if (!al) return;
      const i = (y * sw + x) * 4;
      a += al * w; r += sd[i] * al * w; gg += sd[i + 1] * al * w; b += sd[i + 2] * al * w; l += lum[y * sw + x] * al * w;
    };
    acc(x0, y0, (1 - tx) * (1 - ty)); acc(x0 + 1, y0, tx * (1 - ty));
    acc(x0, y0 + 1, (1 - tx) * ty); acc(x0 + 1, y0 + 1, tx * ty);
    if (a <= 0) return { a: 0, r: 0, g: 0, b: 0, l: 1 };
    // the colour inside is the art's own pixel, crisp; only the outline is smoothed
    const nx = Math.floor((X - 1) / k), ny = Math.floor((Y - 1) / k);
    if (A(nx, ny) > 40) {
      const i = (ny * sw + nx) * 4;
      return { a, r: sd[i], g: sd[i + 1], b: sd[i + 2], l: lum[ny * sw + nx] };
    }
    return { a, r: r / a, g: gg / a, b: b / a, l: l / a };
  };
  const S = new Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) S[Y * W + X] = bil(X, Y);
  const inside = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && S[Y * W + X].a > 0.5;
  const L = (X, Y) => (X >= 0 && Y >= 0 && X < W && Y < H && S[Y * W + X].a > 0 ? S[Y * W + X].l : 1);
  const ink = [46, 29, 16];
  for (let Y = 0; Y < H; Y++) {
    for (let X = 0; X < W; X++) {
      if (!inside(X, Y)) continue;
      const i = (Y * W + X) * 4;
      const edge = !inside(X - 1, Y) || !inside(X + 1, Y) || !inside(X, Y - 1) || !inside(X, Y + 1);
      const smp = S[Y * W + X];
      const l = smp.l;
      const t = 1 - l;   // darkness
      // a contour where the art itself changes tone sharply
      const lr = L(X + 1, Y), ld = L(X, Y + 1);
      // iso-lines of tone, one pixel thin, the way an engraver models a form
      const band = (v) => Math.floor(v * 3.2);
      const contour = (inside(X + 1, Y) && band(lr) !== band(l)) || (inside(X, Y + 1) && band(ld) !== band(l));
      if (mode === 'shadow') {
        const on = edge || ((X + Y) % 2 === 0 && (X * 3 + Y) % 5 !== 0);
        if (!on) continue;
        d[i] = 92; d[i + 1] = 70; d[i + 2] = 46; d[i + 3] = edge ? 150 : 70;
        continue;
      }
      if (mode === 'sketch') {
        let a = 0;
        if (edge) a = 235;
        else if (contour) a = 150;
        else if (t > 0.78 && (X + Y) % 2 === 0) a = 200;
        else if (t > 0.6 && ((X + Y) % 3 === 0 || (X - Y + 999) % 3 === 0)) a = 170;
        else if (t > 0.42 && (X + Y) % 3 === 0) a = 150;
        else if (t > 0.28 && (X + Y) % 5 === 0) a = 110;
        if (!a) { d[i] = 120; d[i + 1] = 90; d[i + 2] = 50; d[i + 3] = 22; continue; }
        d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2]; d[i + 3] = a;
        continue;
      }
      // the plate: colour knocked back into the paper, then inked over
      let r = smp.r, gg = smp.g, b = smp.b;
      const grey = r * 0.3 + gg * 0.55 + b * 0.15;
      const sat = 0.9;
      r = grey + (r - grey) * sat; gg = grey + (gg - grey) * sat; b = grey + (b - grey) * sat;
      // printed on cream: the whites go to paper, everything warms a touch
      r = r * 0.92 + 244 * 0.08; gg = gg * 0.9 + 226 * 0.1; b = b * 0.84 + 180 * 0.16;
      if (edge) { r = ink[0]; gg = ink[1]; b = ink[2]; }
      else {
        let dark = 0;
        if (contour) dark = 0.22;
        if (t > 0.62 && (X + Y) % 3 === 0) dark = Math.max(dark, 0.4);
        if (t > 0.78 && (X - Y + 999) % 3 === 0) dark = Math.max(dark, 0.45);
        if (t < 0.25 && (X + Y * 2) % 7 === 0) dark = -0.12;   // a lit stipple
        if (dark) { r = r * (1 - dark) + ink[0] * dark; gg = gg * (1 - dark) + ink[1] * dark; b = b * (1 - dark) + ink[2] * dark; }
      }
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  plates.set(ck, cv);
  if (plates.size > 90) plates.delete(plates.keys().next().value);
  return cv;
}

// ---------------------------------------------------------------------------
// ornaments, for the pages

/** A double-ruled frame with a knot at each corner, the way plates are mounted. */
export function plateFrame(g, x, y, w, h) {
  g.fillStyle = INK; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = INK3; g.fillRect(x + 2, y + 2, w - 4, 1); g.fillRect(x + 2, y + h - 3, w - 4, 1); g.fillRect(x + 2, y + 2, 1, h - 4); g.fillRect(x + w - 3, y + 2, 1, h - 4);
  for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
    g.fillStyle = INK;
    g.fillRect(cx - 1, cy - 1, 3, 3);
    g.fillStyle = '#f4e6c0';
    g.fillRect(cx, cy, 1, 1);
  }
}

/** A printer's rule with a diamond in the middle. */
export function orRule(g, x, y, w, color = INK2) {
  const cx = Math.round(x + w / 2);
  g.fillStyle = color;
  g.fillRect(x, y, Math.round(w / 2) - 5, 1);
  g.fillRect(cx + 5, y, Math.round(w / 2) - 5, 1);
  g.fillRect(cx - 1, y - 2, 3, 1); g.fillRect(cx - 2, y - 1, 5, 1); g.fillRect(cx - 3, y, 7, 1);
  g.fillRect(cx - 2, y + 1, 5, 1); g.fillRect(cx - 1, y + 2, 3, 1);
  g.fillStyle = '#f4e6c0'; g.fillRect(cx, y, 1, 1);
}

/** A gold star, lit or not, for the rarity line and mastered pages. */
export function star(g, x, y, on, big = false) {
  const rows = big
    ? ['...1...', '..121..', '1123211', '.22322.', '..232..', '.22.22.', '2.....2']
    : ['..1..', '.121.', '12321', '.232.', '2...2'];
  const col = on ? { 1: '#fff6c2', 2: '#c98a1c', 3: '#ffd648' } : { 1: 'rgba(90,64,38,0.32)', 2: 'rgba(90,64,38,0.32)', 3: 'rgba(90,64,38,0.2)' };
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) {
    const ch = rows[r][c];
    if (ch === '.') continue;
    g.fillStyle = col[ch];
    g.fillRect(x + c, y + r, 1, 1);
  }
  if (on) { g.fillStyle = 'rgba(90,50,10,0.6)'; g.fillRect(x + (big ? 3 : 2), y + (big ? 7 : 5), 1, 1); }
}

/** A wax seal, pressed onto a page when it is mastered. */
export function waxSeal(g, cx, cy, r = 9) {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const wob = r + Math.sin(Math.atan2(y, x) * 7) * 0.9;
      const dd = Math.hypot(x, y);
      if (dd > wob) continue;
      const lit = (-x - y) / (r * 1.4);
      const ring = Math.abs(dd - r * 0.62) < 0.8;
      g.fillStyle = ring ? '#5e0e0a' : lit > 0.35 ? '#d8483a' : lit > -0.2 ? '#a82a20' : '#7a1810';
      g.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  star(g, cx - 2, cy - 2, true);
}

/** A big decorated initial, in red, boxed - the first letter of a chapter or entry. */
export function initial(g, ch, x, y) {
  g.fillStyle = 'rgba(142,42,24,0.12)';
  g.fillRect(x, y, 19, 19);
  g.fillStyle = RUBRIC;
  g.fillRect(x, y, 19, 1); g.fillRect(x, y + 18, 19, 1); g.fillRect(x, y, 1, 19); g.fillRect(x + 18, y, 1, 19);
  // a little vine in the corners
  g.fillStyle = 'rgba(62,94,30,0.8)';
  g.fillRect(x + 2, y + 2, 2, 1); g.fillRect(x + 2, y + 3, 1, 1);
  g.fillRect(x + 15, y + 15, 2, 1); g.fillRect(x + 16, y + 14, 1, 1);
  drawText(g, ch, x + 5, y + 3, { color: RUBRIC, scale: 2 });
}

// ---------------------------------------------------------------------------
// the page turn

/**
 * Draw a leaf hinged at `gx`, lying flat to the right at theta = 0 and flat
 * to the left at theta = PI. `front` is the face that is up when it lies on
 * the right, `back` the face that is up when it lies on the left. The leaf
 * bends as it goes - the free edge leads - and swells toward the viewer as
 * it lifts, shaded by how edge-on each strip of it is.
 */
export function drawLeaf(ctx, front, back, gx, y, W, H, theta, opts = {}) {
  const bend = (opts.bend ?? 0.7) * Math.sin(theta);
  const N = W;
  let x = gx, z = 0;
  const cols = [];
  for (let s = 0; s < N; s++) {
    const u = (s + 0.5) / N;
    const phi = Math.min(Math.PI, Math.max(0, theta + bend * u * u * (theta < Math.PI / 2 ? 1 : 0.6)));
    const dx = Math.cos(phi), dz = Math.sin(phi);
    const x1 = x + dx, z1 = z + dz;
    cols.push({ s, x0: x, x1, z: (z + z1) / 2, c: dx });
    x = x1; z = z1;
  }
  // the shadow it throws on what is under it
  const tip = cols[cols.length - 1];
  const lift = Math.sin(theta);
  if (lift > 0.02 && opts.shadow !== false) {
    const ex = tip.x1;
    const sw = Math.round(6 + lift * 22);
    ctx.save();
    for (let k = 0; k < sw; k++) {
      const a = 0.32 * lift * (1 - k / sw);
      ctx.fillStyle = `rgba(30,18,8,${a.toFixed(3)})`;
      const sx = theta < Math.PI / 2 ? ex + k : ex - k - 1;
      if (opts.clip && (sx < opts.clip.x0 || sx >= opts.clip.x1)) continue;
      ctx.fillRect(Math.round(sx), y + 2, 1, H - 2);
    }
    ctx.restore();
  }
  for (const c of cols) {
    const facingFront = c.c >= 0;
    const src = facingFront ? front : back;
    if (!src) continue;
    const sc = facingFront ? c.s : W - 1 - c.s;
    const a = Math.min(c.x0, c.x1), b = Math.max(c.x0, c.x1);
    const dx = Math.floor(a), dw = Math.max(1, Math.ceil(b) - dx);
    if (opts.clip && (dx + dw <= opts.clip.x0 || dx >= opts.clip.x1)) continue;
    const grow = 1 + (c.z / W) * 0.1;
    const dh = Math.round(H * grow);
    const dy = Math.round(y - (dh - H) * 0.75);
    ctx.drawImage(src, sc, 0, 1, H, dx, dy, dw, dh);
    const shade = (1 - Math.abs(c.c)) * 0.5 + (facingFront ? 0 : 0.06);
    if (shade > 0.03) {
      ctx.fillStyle = `rgba(52,32,14,${shade.toFixed(3)})`;
      ctx.fillRect(dx, dy, dw, dh);
    }
    // a lit rim along the top of the bending sheet
    if (Math.abs(c.c) < 0.9 && (c.s & 1)) {
      ctx.fillStyle = 'rgba(255,248,224,0.35)';
      ctx.fillRect(dx, dy, dw, 1);
    }
  }
  // the free edge, as a dark line
  if (lift > 0.02) {
    const g0 = tip;
    const grow = 1 + (g0.z / W) * 0.1;
    const dh = Math.round(H * grow);
    ctx.fillStyle = 'rgba(70,46,22,0.7)';
    ctx.fillRect(Math.round(g0.x1) - (theta < Math.PI / 2 ? 1 : 0), Math.round(y - (dh - H) * 0.75), 1, dh);
  }
}
