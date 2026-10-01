// CRABDEN - the interface kit.
//
// Everything the game draws that is not the world is drawn out of this file,
// and it is drawn in ONE material: the brass-bound case an old instrument
// comes in. The reference is a row of inventory slots off such a case - a
// raised gold bezel with a black line round it, a curl of brass turned into
// each corner, and inside it a panel of warm brown leather with the light
// falling into the top of it and a painted object sitting in the middle.
//
// So that is what every piece is:
//
//   A BEZEL is the one primitive. A dark line round the outside, a gold rim
//   lit along the top-left and dulled along the bottom-right, a thin dark
//   line inside it, and the leather field. Corners are cut, never square.
//
//   A BUTTON is a bezel you can press. Under the pointer the brass brightens
//   and the leather warms; held, the field sinks and the lit and shaded edges
//   swap, and everything on it moves down a pixel.
//
//   A SLOT is a bezel with brass curls in its corners, the shape the icons
//   were painted to sit in.
//
//   A PLAQUE is the thin version - one line of brass instead of a rim - for
//   the read-only plates the HUD says things on.
//
//   A WINDOW is a big bezel with a thick rim, an ornament in each corner and
//   a title banner riveted across the top.
//
// Two rules hold it together. Everything lands on whole pixels, because half
// a pixel of bevel is a blurred edge. And every interactive thing has exactly
// three states - resting, under the pointer, and held.

import { drawText, textWidth, ellipsize } from '../lib/font.js';
import { clamp01 } from '../lib/math.js';
import { drawIcon } from './iconcore.js';

/** Every outline in the interface. */
const OUT = '#120a06';

// the brass
const G0 = '#fff6c2', G1 = '#ffd648', G2 = '#e6a51c', G3 = '#a86c14', G4 = '#6b400c';
// the leather, from the lit top of a field down into its shadow
const L0 = '#b06c3a', L1 = '#8a5228', L2 = '#6e3e1c', L3 = '#52290f', L4 = '#3a1c09';
// the dark board a window is made of, so pale words read on it
const D0 = '#4a2d18', D1 = '#3a2213', D2 = '#2c190d', D3 = '#1e1008';

/**
 * The whole palette.
 *
 * `ink` is the colour WORDS are, which on this material is pale. The names
 * are kept from the kit's earlier lives so that changing the material
 * changes the whole game rather than three hundred call sites.
 */
export const C = {
  ink: '#fbecc8',                      // what words are, on anything
  inkSoft: 'rgba(251,236,200,0.68)',
  shadow: 'rgba(10,7,4,0.5)',

  frame: L1,                           // the face of anything you press
  frameLit: G1,
  frameDim: G3,
  frameDeep: OUT,

  page: D1,                            // the board inside a window
  pageAlt: D0,                         // and every other row of a list on it
  pageDim: 'rgba(176,108,58,0.28)',

  gold: G2,
  goldLit: G1,
  goldDim: G3,

  wood: L2,                            // rails, banners
  woodLit: 'rgba(255,214,72,0.30)',
  woodDim: 'rgba(18,10,6,0.7)',

  steel: '#d8e0e8',
  steelLit: '#ffffff',
  steelDim: '#74808e',

  rust: '#c0602c',
  rustLit: '#f0904c',
  rustDim: '#803818',

  slot: L3,
  slotDim: L4,

  good: '#8cd468',
  warn: '#ffc840',
  bad: '#f05a48',
  cool: '#7ad4f8',
  gem: '#c88aec',

  out: OUT,
  brass: [G0, G1, G2, G3, G4],
  leather: [L0, L1, L2, L3, L4],
  board: [D0, D1, D2, D3],
};

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

// ---------------------------------------------------------------------------
// the corner curls
//
// A little brass bracket turned into each corner of a slot or a window: a
// gusset with a scroll in it. Drawn for the top-left corner and mirrored.

const CURL_S = [
  // small, for slots and buttons (5x5)
  '12k..',
  '23k..',
  'kk3k.',
  '..k4.',
  '.....',
];
const CURL_L = [
  // large, for windows (9x9)
  '0112k....',
  '1223k....',
  '123kk....',
  '23k.13k..',
  'kkk.23k..',
  '...12k...',
  '...kk.k..',
  '......4k.',
  '.......k.',
];
const CURL_COL = { 0: G0, 1: G1, 2: G2, 3: G3, 4: G4, k: OUT };

function curl(ctx, rows, x, y, sx, sy, dim = false) {
  const n = rows.length;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      let c = CURL_COL[ch];
      if (dim && ch !== 'k') c = ch === '0' || ch === '1' ? G3 : G4;
      R(ctx, sx > 0 ? x + i : x - i, sy > 0 ? y + j : y - j, 1, 1, c);
    }
  }
}

function corners(ctx, x, y, w, h, rows, inset, dim) {
  const n = rows.length;
  if (w < n * 2 + 2 || h < n * 2 + 2) return;
  curl(ctx, rows, x + inset, y + inset, 1, 1, dim);
  curl(ctx, rows, x + w - 1 - inset, y + inset, -1, 1, dim);
  curl(ctx, rows, x + inset, y + h - 1 - inset, 1, -1, dim);
  curl(ctx, rows, x + w - 1 - inset, y + h - 1 - inset, -1, -1, dim);
}

// ---------------------------------------------------------------------------
// the bezel

/**
 * The one primitive. `rim` is how thick the brass is (1-4); `body` is the
 * field colour ramp [lit, base, shade, deep]; `state` is one of
 * rest / hot / down / on / off.
 */
export function bezel(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 4 || h < 4) return;
  const rim = Math.max(1, Math.min(4, opts.rim ?? 2));
  const st = opts.state || 'rest';
  const off = st === 'off', hot = st === 'hot', down = st === 'down', on = st === 'on';
  const body = opts.body || [L0, L1, L2, L3];
  const a = opts.alpha;
  if (a !== undefined) { ctx.save(); ctx.globalAlpha *= a; }

  // the dark line round everything, corners cut
  R(ctx, x + 1, y, w - 2, 1, OUT);
  R(ctx, x + 1, y + h - 1, w - 2, 1, OUT);
  R(ctx, x, y + 1, 1, h - 2, OUT);
  R(ctx, x + w - 1, y + 1, 1, h - 2, OUT);

  // the brass
  const lit = off ? G4 : (hot || on) ? G0 : G1;
  const mid = off ? G4 : (hot || on) ? G1 : G2;
  const sh = off ? '#3a2410' : G3;
  R(ctx, x + 1, y + 1, w - 2, h - 2, mid);
  if (!down) {
    R(ctx, x + 1, y + 1, w - 2, 1, lit);
    R(ctx, x + 1, y + 1, 1, h - 2, lit);
    R(ctx, x + 1, y + h - 2, w - 2, 1, sh);
    R(ctx, x + w - 2, y + 1, 1, h - 2, sh);
    // the glint along the top-left of the rim
    if (!off && w > 12) R(ctx, x + 2, y + 1, Math.min(6, w - 6), 1, G0);
  } else {
    R(ctx, x + 1, y + 1, w - 2, 1, sh);
    R(ctx, x + 1, y + 1, 1, h - 2, sh);
    R(ctx, x + 1, y + h - 2, w - 2, 1, lit);
    R(ctx, x + w - 2, y + 1, 1, h - 2, lit);
  }

  // the dark line inside the brass, and the field sunk into it
  const t = rim + 1;
  const ix = x + t, iy = y + t, iw = w - t * 2, ih = h - t * 2;
  if (iw >= 1 && ih >= 1) {
    R(ctx, ix - 1, iy - 1, iw + 2, ih + 2, off ? '#24140a' : G4);
    const [b0, b1, b2, b3] = off ? ['#4a3a2c', '#3e3024', '#32261c', '#261c14'] : body;
    const warm = hot && !down;
    R(ctx, ix, iy, iw, ih, warm ? b0 : b1);
    if (ih >= 4) {
      // the light falls into the top of the field and pools at the bottom
      R(ctx, ix, iy, iw, 1, down ? b3 : b2);
      if (ih >= 7) R(ctx, ix, iy + 1, iw, 1, down ? b2 : (warm ? b1 : b1));
      R(ctx, ix, iy + ih - 1, iw, 1, b2);
      if (ih >= 9) R(ctx, ix, iy + Math.round(ih * 0.5), iw, Math.ceil(ih * 0.5) - 1, warm ? b1 : mixBand(b1, b2));
      if (!down && iw >= 6 && ih >= 6) R(ctx, ix + 1, iy + 2, 1, ih - 4, warm ? '#c8804a' : b0);
    }
    if (on) {
      // the chosen one: a line of brass just inside the rim
      R(ctx, ix, iy, iw, 1, G1);
      R(ctx, ix, iy + ih - 1, iw, 1, G3);
    }
  }
  if (opts.curls !== false && w >= 16 && h >= 16) corners(ctx, x, y, w, h, CURL_S, rim, off);
  if (a !== undefined) ctx.restore();
  return { x: ix, y: iy, w: iw, h: ih };
}

// a half-tone between two colours, picked once so the field has a soft band
const BAND = new Map();
function mixBand(a, b) {
  const k = a + b;
  let v = BAND.get(k);
  if (!v) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const m = (s) => Math.round((((pa >> s) & 255) + ((pb >> s) & 255)) / 2);
    v = '#' + ((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0');
    BAND.set(k, v);
  }
  return v;
}

/**
 * A slab - the old primitive, kept as its name. It is a pressable bezel now;
 * `face` tints the leather, `down` sinks it.
 */
export function slab(ctx, x, y, w, h, opts = {}) {
  const body = opts.face ? tintRamp(opts.face) : undefined;
  bezel(ctx, x, y, w, h, {
    rim: h >= 14 ? 2 : 1, body, alpha: opts.alpha,
    state: opts.down ? 'down' : opts.hot ? 'hot' : 'rest',
    curls: opts.curls,
  });
}

// a leather ramp tinted toward a colour, for a button that is a colour
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

/** A brass rivet, which is how anything is fixed to anything. */
export function clasp(ctx, x, y, s, sx, sy) {
  const ax = sx > 0 ? x : x - 2;
  const ay = sy > 0 ? y : y - 2;
  R(ctx, ax, ay, 2, 2, G3);
  R(ctx, ax, ay, 1, 1, G0);
}

/**
 * A PLANK: a banner - a strip of leather in a brass rim with a cap at each
 * end. It is the title strip and the divider.
 */
export function plank(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 10 || h < 5) return;
  bezel(ctx, x, y, w, h, { rim: 1, body: [D0, D1, D2, D3], curls: false });
  // the caps
  for (const cx of [x + 2, x + w - 4]) {
    R(ctx, cx, y + 2, 2, h - 4, G3);
    R(ctx, cx, y + 2, 2, 1, G1);
  }
  if (opts.label) {
    drawText(ctx, ellipsize(opts.label, w - 14), x + w / 2, y + (h - 7) / 2,
      { color: opts.color || G1, align: 'center' });
  }
  return { x: x + 5, w: w - 10 };
}

/**
 * A banner of brass riveted across the top of a window, with the title on
 * it. Wider than the words, ends swallow-tailed.
 */
export function banner(ctx, cx, y, text, opts = {}) {
  const tw = textWidth(text);
  const w = Math.max(opts.minW || 0, tw + 22), h = opts.h || 13;
  const x = Math.round(cx - w / 2);
  y = Math.round(y);
  // the tails, behind
  for (const side of [-1, 1]) {
    const tx = side < 0 ? x - 6 : x + w;
    R(ctx, tx, y + 2, 6, h - 4, OUT);
    R(ctx, tx + (side < 0 ? 1 : 0), y + 3, 5, h - 6, G3);
    R(ctx, tx + (side < 0 ? 1 : 0), y + 3, 5, 1, G2);
    // the notch
    R(ctx, side < 0 ? tx : tx + 5, y + Math.floor(h / 2) - 1, 1, 2, 'rgba(0,0,0,0)');
  }
  bezel(ctx, x, y, w, h, { rim: 1, body: [L0, L1, L2, L3], curls: false });
  drawText(ctx, text, cx, y + Math.round((h - 7) / 2), { color: G0, align: 'center', outline: true, outlineColor: OUT });
  return { x, y, w, h };
}

/**
 * A window - the board. A thick brass frame with an ornament in each corner,
 * dark leather inside it, and a banner across the top with the title on it.
 *
 * Returns the page rectangle and where the X landed, so the caller hit-tests
 * it rather than this file guessing at an input system it cannot see.
 */
export function windowFrame(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const T = opts.title !== undefined;
  const bar = T ? (opts.barH || 13) : 0;
  const F = 4;

  // a drop shadow, so the window sits on the world rather than in it
  ctx.save();
  ctx.globalAlpha *= 0.45;
  R(ctx, x + 3, y + 4, w, h, '#000000');
  ctx.restore();
  bezel(ctx, x, y, w, h, { rim: 3, body: [D0, D1, D1, D2], curls: false });
  // a second, thinner line of brass inside the first, which is what makes a
  // frame look built rather than drawn
  R(ctx, x + 6, y + 6, w - 12, 1, 'rgba(255,214,72,0.22)');
  R(ctx, x + 6, y + h - 7, w - 12, 1, 'rgba(255,214,72,0.12)');
  corners(ctx, x, y, w, h, CURL_L, 1, false);

  const px = x + F + 2, py = y + F + 2 + bar;
  const pw = w - (F + 2) * 2, ph = h - (F + 2) * 2 - bar;

  let close = null;
  if (T) {
    const title = String(opts.title);
    banner(ctx, x + w / 2, y + F, ellipsize(title, w - 60), { h: bar + 1 });
    // the X, as a little red-and-brass button on the corner
    const s = Math.max(12, bar + 2);
    const cx = x + w - s - 3, cy = y + 3;
    bezel(ctx, cx, cy, s, s, {
      rim: 1, curls: false,
      body: opts.closeHot ? ['#f05a48', '#d8402e', '#b82a2a', '#701818'] : ['#d84a38', '#b82a2a', '#8a1e1e', '#5a1010'],
      state: opts.closeDown ? 'down' : opts.closeHot ? 'hot' : 'rest',
    });
    const o = opts.closeDown ? 1 : 0;
    const n = s - 7;
    for (let i = 0; i < n; i++) {
      R(ctx, cx + 3 + i + o, cy + 3 + i + o, 2, 1, '#fff0e0');
      R(ctx, cx + s - 5 - i + o, cy + 3 + i + o, 2, 1, '#fff0e0');
    }
    close = { x: cx, y: cy, w: s, h: s };
  }
  return { x: px, y: py, w: pw, h: ph, close };
}

/**
 * A button.
 *
 * `hot` is the pointer over it, `down` is it being held, `on` is it being the
 * selected one of a set - three different things that used to all be "lit".
 */
export function button(ctx, x, y, w, h, label, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot, down = !!opts.down;
  const off = !!opts.disabled;
  const body = opts.tint && opts.tint !== C.gold && opts.tint !== G2 ? tintRamp(opts.tint) : undefined;
  bezel(ctx, x, y, w, h, {
    rim: h >= 16 ? 2 : 1, body,
    state: off ? 'off' : down || (on && opts.sticky) ? 'down' : on ? 'on' : hot ? 'hot' : 'rest',
    curls: opts.curls,
  });
  const o = (down || (on && opts.sticky)) ? 1 : 0;
  const tx = Math.round(x + w / 2) + o;
  const ty = Math.round(y + (h - 7) / 2) + o;
  const col = off ? 'rgba(251,236,200,0.34)' : on ? '#fff6dc' : C.ink;
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

/** A darker bezel, for a control that is hardware rather than a choice. */
export function steelButton(ctx, x, y, s, opts = {}) {
  bezel(ctx, x, y, s, s, {
    rim: 1, body: ['#8e98a4', '#74808e', '#5a6470', '#3e4650'],
    state: opts.down ? 'down' : opts.on ? 'on' : opts.hot ? 'hot' : 'rest',
  });
}

/**
 * A SLOT: brass bezel, a curl in each corner, and the leather field the
 * thing sits in. A slot you cannot use yet is darker and flatter, because
 * "not yet" and "empty" are different things.
 */
export function slot(ctx, x, y, w, h = w, opts = {}) {
  const empty = !!opts.empty;
  const st = opts.on ? 'on' : opts.hot ? 'hot' : empty ? 'rest' : 'rest';
  const back = opts.back;
  bezel(ctx, x, y, w, h, {
    rim: w >= 20 ? 2 : 1,
    body: back ? [back, back, tintRamp(back)?.[2] || back, tintRamp(back)?.[3] || back]
      : empty ? [L2, L3, L3, L4] : [L0, L1, L2, L3],
    state: st,
  });
}

/**
 * A segmented bar: a row of blocks that are either on or off. It reads at a
 * glance and it never needs a number beside it.
 */
export function blocks(ctx, x, y, w, h, f, col = G2, opts = {}) {
  const n = opts.n || Math.max(4, Math.floor(w / 5));
  const bw = Math.floor((w - (n - 1)) / n);
  const lit = Math.round(clamp01(f) * n);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + i * (bw + 1));
    R(ctx, bx, y, bw, h, OUT);
    R(ctx, bx, y, bw, h - 1, i < lit ? col : 'rgba(58,40,24,0.9)');
    if (i < lit) R(ctx, bx, y, bw, 1, 'rgba(255,245,214,0.7)');
  }
}

/** A gauge: brass-bound glass, with a meniscus at the leading edge. */
export function gauge(ctx, x, y, w, h, f, col = C.good) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x + 1, y, w - 2, h, OUT);
  R(ctx, x, y + 1, w, h - 2, OUT);
  R(ctx, x + 1, y + 1, w - 2, h - 2, D3);
  const fw = Math.round((w - 2) * clamp01(f));
  if (fw > 0) {
    R(ctx, x + 1, y + 1, fw, h - 2, col);
    R(ctx, x + 1, y + 1, fw, 1, 'rgba(255,255,255,0.55)');
    ctx.globalAlpha *= 0.4;
    R(ctx, x + 1, y + h - 2, fw, 1, OUT);
    ctx.globalAlpha /= 0.4;
    if (fw > 2) R(ctx, x + fw, y + 1, 1, h - 2, 'rgba(255,255,255,0.4)');
  }
  // the end caps
  if (w >= 10) {
    R(ctx, x, y + 1, 2, h - 2, G3);
    R(ctx, x + w - 2, y + 1, 2, h - 2, G3);
    R(ctx, x, y + 1, 2, 1, G1);
    R(ctx, x + w - 2, y + 1, 2, 1, G1);
  }
}

/** A tick box, on or off, with a real tick in it. */
export function check(ctx, x, y, s, on, hot) {
  bezel(ctx, x, y, s, s, { rim: 1, curls: false, state: hot ? 'hot' : 'rest',
    body: on ? ['#a8e060', '#5eaa3a', '#2e6a26', '#163a18'] : undefined });
  if (!on) return;
  for (let i = 0; i < 2; i++) R(ctx, x + 3 + i, y + 5 + i, 1, 2, '#fff6dc');
  for (let i = 0; i < 4; i++) R(ctx, x + 5 + i, y + 7 - i, 1, 2, '#fff6dc');
}

/** A paging arrow. `dir` is -1 or 1 for left/right, or 'up'/'down'. */
export function arrow(ctx, x, y, s, dir, opts = {}) {
  bezel(ctx, x, y, s, s, { rim: 1, curls: false, state: opts.down ? 'down' : opts.hot ? 'hot' : 'rest' });
  const o = opts.down ? 1 : 0;
  const cx = Math.round(x + s / 2) + o, cy = Math.round(y + s / 2) + o;
  const n = Math.floor((s - 4) / 2);
  const col = opts.hot ? G0 : G1;
  for (let i = 0; i < n; i++) {
    if (dir === 'up') R(ctx, cx - i, cy - n / 2 + i + 1, i * 2 + 1, 1, col);
    else if (dir === 'down') R(ctx, cx - i, cy + n / 2 - i - 1, i * 2 + 1, 1, col);
    else if (dir > 0) R(ctx, cx + n / 2 - i - 1, cy - i, 1, i * 2 + 1, col);
    else R(ctx, cx - n / 2 + i + 1, cy - i, 1, i * 2 + 1, col);
  }
}

/**
 * A row in a list. Alternating rows get a shade of the board, which is the
 * one trick that makes a long list readable without drawing a box round every
 * line of it.
 */
export function row(ctx, x, y, w, h, i, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot;
  R(ctx, x, y, w, h, on ? L1 : hot ? '#5a361c' : (i & 1) ? D0 : D1);
  if (on) {
    R(ctx, x, y, 2, h, G1);
    R(ctx, x, y, w, 1, 'rgba(255,214,72,0.35)');
    R(ctx, x, y + h - 1, w, 1, 'rgba(18,10,6,0.6)');
  }
}

/** A hairline divider across a page. */
export function rule(ctx, x, y, w) {
  R(ctx, x, y, w, 1, 'rgba(18,10,6,0.7)');
  R(ctx, x, y + 1, w, 1, 'rgba(255,214,72,0.22)');
}

/** A heading on a page: small, brass, with a rule under it. */
export function heading(ctx, x, y, w, text) {
  drawText(ctx, text, x, y, { color: G1 });
  rule(ctx, x, y + 9, w);
}

/**
 * A plaque: the little read-only plate the HUD says things on - a single
 * line of brass round dark leather, because it is not something you press.
 */
export function plaque(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  bezel(ctx, x, y, w, h, {
    rim: 1, curls: false, alpha: opts.alpha,
    body: opts.face ? tintRamp(opts.face) : [D0, D1, D2, D3],
  });
  if (opts.tint) {
    R(ctx, x + 2, y + 2, 2, h - 4, opts.tint);
    R(ctx, x + 2, y + 2, 2, 1, 'rgba(255,255,255,0.45)');
  }
}

/** A run of brass beads, for a divider that is a thing rather than a line. */
export function chain(ctx, x, y, h, vertical = true) {
  const n = Math.floor(h / 6);
  for (let i = 0; i < n; i++) {
    const ox = vertical ? x : x + i * 6;
    const oy = vertical ? y + i * 6 : y;
    R(ctx, ox - 1, oy - 1, 3, 3, G3);
    R(ctx, ox - 1, oy - 1, 2, 1, G1);
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
  R(ctx, x + 1, y + s - b, s - 2, b - 1, G3);
  R(ctx, x + 1, y + s - b, s - 2, 1, G1);
  R(ctx, x + Math.floor(s / 2) - 1, y + s - b + 2, 2, 2, OUT);
}

/**
 * A parchment card, for the things that are written rather than pressed:
 * a page of the book, a note, a reward. Pale paper, a darker edge where it
 * curls, and a brass rim.
 */
export function parchment(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  bezel(ctx, x, y, w, h, {
    rim: opts.rim ?? 1, curls: opts.curls ?? false,
    body: ['#fffbe8', '#f2e2b4', '#d8c088', '#a88c58'],
  });
  // the paper is not flat: a darker band at the foot, a few fibres
  R(ctx, x + 3, y + h - 5, w - 6, 2, 'rgba(168,140,88,0.35)');
  for (let i = 0; i < Math.floor(w / 9); i++) {
    const fx = x + 5 + ((i * 37) % Math.max(1, w - 10));
    const fy = y + 5 + ((i * 53) % Math.max(1, h - 12));
    R(ctx, fx, fy, 2, 1, 'rgba(168,140,88,0.25)');
  }
}

export { R as px };
