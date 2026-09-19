// CRABDEN - the interface kit.
//
// Everything the game draws that is not the world is drawn out of this file,
// and it is all one material. Before this there were three: leather boards in
// the conversation, brass plates on the HUD, and flat brown boxes in the
// panels - which is three answers to "what is a button" and therefore no
// answer at all.
//
// The material is FOUR THINGS and they always do the same jobs:
//
//   WOOD is structure. Every frame, every banner, every bar is a plank.
//   PARCHMENT is where words go. Nothing is written on anything else.
//   BRASS is what you press and what you own. Buttons are brass; so is the
//     bezel round anything sitting in a slot.
//   STEEL is hardware. Clasps, caps, hinges, chain, locks - the parts that
//     hold the wood together and are never a surface you write on.
//
// The pieces, top to bottom:
//
//   A WINDOW is a board: a dark wood frame with a STEEL CLASP bolted across
//   each corner, a parchment page inside it, and a wooden title plank with
//   steel caps laid across the top of the frame with a brass X at its end.
//
//   A BUTTON is brass: black outline, amber face, a highlight along the top
//   and left, a shadow along the bottom and right. It is proud of the page.
//   When you push it, it goes DOWN - the highlight and the shadow swap and
//   everything on it moves a pixel - because a button that does not move
//   when you press it is a picture of a button.
//
//   A SLOT is a brass bezel with a flourish cut into each corner and dark
//   wood behind whatever is sitting in it. A slot you cannot use yet is
//   STEEL instead of brass, because "not yet" and "empty" are different
//   things and deserve different metals.
//
// Two rules hold the whole thing together. Everything lands on whole pixels,
// because half a pixel of bevel is a blurred edge. And every interactive
// thing has exactly three states - resting, under the pointer, and held -
// which is what makes a screen feel like it is made of switches rather than
// of pictures of switches.

import { drawText, textWidth, ellipsize } from '../lib/font.js';
import { clamp01 } from '../lib/math.js';

/**
 * The whole palette. Nothing in the interface uses a colour not in here.
 *
 * `frame` is the brass a button is made of and is the default face of every
 * slab; the names are kept from the old mint kit so that changing the metal
 * changed the whole game rather than three hundred call sites.
 */
export const C = {
  ink: '#2a1a0f',          // every outline, and text on anything light
  inkSoft: '#5d4227',
  shadow: 'rgba(20,12,5,0.4)',

  frame: '#e6bb43',        // BRASS: buttons, frames, anything you press
  frameLit: '#ffe490',
  frameDim: '#a87c1c',
  frameDeep: '#523209',

  page: '#dcb98c',         // PARCHMENT: the only thing words go on
  pageAlt: '#c9a373',
  pageDim: '#a2805a',

  gold: '#e6bb43',         // the bezel a thing sits in
  goldLit: '#ffe490',
  goldDim: '#a87c1c',

  wood: '#6b4526',         // WOOD: structure, frames, planks, bars
  woodLit: '#8d6036',
  woodDim: '#43290f',

  steel: '#5f93ad',        // STEEL: clasps, caps, chain, locks, empty slots
  steelLit: '#9ccadd',
  steelDim: '#35637a',

  rust: '#c2702e',         // the second button, for the thing you do less
  rustLit: '#e79c5a',
  rustDim: '#87451a',

  slot: '#5f93ad',         // an empty square is steel, not brass
  slotDim: '#35637a',

  good: '#8ec45a',
  warn: '#e6a63c',
  bad: '#d05a44',
  cool: '#63b8d6',
  gem: '#9d7fd8',
};

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/**
 * A bevelled slab: outline, face, lit edge one way, shadow the other.
 *
 * This is the one primitive. A button is a small one, a plank is a wooden
 * one, a pressed button is one with `down` set, which flips which edges are
 * lit. Everything else in this file is built out of it.
 */
export function slab(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 3 || h < 3) return;
  const face = opts.face || C.frame;
  const lit = opts.lit || C.frameLit;
  const dim = opts.dim || C.frameDim;
  const down = !!opts.down;
  // the outline sits OUTSIDE the face, so a row of buttons touching each
  // other still has one line between them rather than two
  R(ctx, x + 1, y, w - 2, 1, C.ink);
  R(ctx, x + 1, y + h - 1, w - 2, 1, C.ink);
  R(ctx, x, y + 1, 1, h - 2, C.ink);
  R(ctx, x + w - 1, y + 1, 1, h - 2, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, face);
  R(ctx, x + 1, down ? y + h - 2 : y + 1, w - 2, 1, down ? dim : lit);
  R(ctx, down ? x + w - 2 : x + 1, y + 1, 1, h - 2, down ? dim : lit);
  R(ctx, x + 1, down ? y + 1 : y + h - 2, w - 2, 1, down ? lit : dim);
  R(ctx, down ? x + 1 : x + w - 2, y + 1, 1, h - 2, down ? lit : dim);
}

/** The grain in a piece of wood: three darker strokes, never the same twice. */
function grain(ctx, x, y, w, h, seed = 0) {
  if (w < 8 || h < 4) return;
  ctx.globalAlpha *= 0.34;
  for (let i = 0; i < 3; i++) {
    const gy = y + 1 + ((seed * 7 + i * 5) % Math.max(1, h - 2));
    const gx = x + 1 + ((seed * 11 + i * 13) % Math.max(1, w - 6));
    R(ctx, gx, gy, Math.min(w - 2 - (gx - x), 4 + i * 3), 1, C.woodDim);
  }
  ctx.globalAlpha /= 0.34;
}

/**
 * A STEEL CLASP: the bracket bolted over a corner to hold the boards
 * together. Two arms and a rivet, mirrored into whichever corner it is in.
 */
export function clasp(ctx, x, y, s, sx, sy) {
  const ax = sx > 0 ? x : x - s + 1;
  const ay = sy > 0 ? y : y - s + 1;
  R(ctx, ax, ay, s, s, C.ink);
  // the two arms
  R(ctx, ax + (sx > 0 ? 1 : 0), ay + (sy > 0 ? 1 : 0), s - 1, 3, C.steel);
  R(ctx, ax + (sx > 0 ? 1 : 0), ay + (sy > 0 ? 1 : 0), 3, s - 1, C.steel);
  R(ctx, ax + (sx > 0 ? 1 : 0), ay + (sy > 0 ? 1 : 0), s - 1, 1, C.steelLit);
  R(ctx, ax + (sx > 0 ? 1 : 0), ay + (sy > 0 ? 1 : 0), 1, s - 1, C.steelLit);
  // and the rivet through the elbow
  R(ctx, ax + (sx > 0 ? 2 : s - 4), ay + (sy > 0 ? 2 : s - 4), 2, 2, C.steelDim);
}

/**
 * A PLANK: a board with a steel cap driven onto each end. It is the banner,
 * the title bar, the divider and the long bar at the bottom of a screen -
 * one piece of wood doing four jobs, which is what a kit is for.
 */
export function plank(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 10 || h < 5) return;
  slab(ctx, x, y, w, h, { face: C.wood, lit: C.woodLit, dim: C.woodDim });
  grain(ctx, x + 1, y + 1, w - 2, h - 2, opts.seed || 1);
  // the caps
  const cw = Math.min(5, Math.floor(w / 5));
  for (const cx of [x, x + w - cw]) {
    R(ctx, cx, y - 1, cw, h + 2, C.ink);
    R(ctx, cx + (cx === x ? 1 : 0), y, cw - 1, h, C.steel);
    R(ctx, cx + (cx === x ? 1 : 0), y, cw - 1, 1, C.steelLit);
    R(ctx, cx + (cx === x ? 1 : 0), y + h - 1, cw - 1, 1, C.steelDim);
    R(ctx, cx + (cx === x ? 2 : 1), y + Math.floor(h / 2) - 1, 2, 2, C.steelDim);
  }
  if (opts.label) {
    drawText(ctx, ellipsize(opts.label, w - cw * 2 - 6), x + w / 2, y + (h - 7) / 2,
      { color: opts.color || C.frameLit, align: 'center' });
  }
  return { x: x + cw + 2, w: w - cw * 2 - 4 };
}

/**
 * A window - which in this game is a BOARD: wood frame, steel clasps in the
 * corners, parchment inside, and a title plank laid across the top of it.
 *
 * Returns the page rectangle and where the X landed, so the caller hit-tests
 * it rather than this file guessing at an input system it cannot see.
 */
export function windowFrame(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const T = opts.title !== undefined;
  const bar = T ? (opts.barH || 13) : 0;
  const F = opts.thick || 3;

  // a soft drop, so a board sits ON the world instead of in it
  ctx.globalAlpha *= 0.55;
  R(ctx, x + 3, y + h, w - 3, 3, '#0a0705');
  R(ctx, x + w, y + 3, 3, h - 3, '#0a0705');
  ctx.globalAlpha /= 0.55;

  slab(ctx, x, y, w, h, { face: C.wood, lit: C.woodLit, dim: C.woodDim });
  grain(ctx, x + 1, y + 1, w - 2, h - 2, 3);
  // the page, sunk into the boards
  const px = x + F + 1, py = y + F + 1 + bar;
  const pw = w - (F + 1) * 2, ph = h - (F + 1) * 2 - bar;
  R(ctx, px - 1, py - 1, pw + 2, ph + 2, C.ink);
  R(ctx, px, py, pw, ph, opts.page || C.page);
  // parchment is not flat: it is lighter where the light falls on it
  ctx.globalAlpha *= 0.5;
  R(ctx, px, py, pw, 1, '#f0d2a4');
  R(ctx, px, py + ph - 1, pw, 1, C.pageDim);
  ctx.globalAlpha /= 0.5;

  // the four clasps
  const cs = Math.min(9, Math.max(6, Math.floor(Math.min(w, h) / 12)));
  clasp(ctx, x + 1, y + 1, cs, 1, 1);
  clasp(ctx, x + w - 2, y + 1, cs, -1, 1);
  clasp(ctx, x + 1, y + h - 2, cs, 1, -1);
  clasp(ctx, x + w - 2, y + h - 2, cs, -1, -1);

  let close = null;
  if (T) {
    // the title is a PLANK laid across the top of the frame, which is what
    // makes a board read as a board rather than as a rectangle with a strip
    // the X is brass and sits BESIDE the plank rather than on its end cap,
    // so the banner keeps both of its caps
    const s = bar - 2;
    const cx = x + w - F - 3 - s, cy = y + F;
    // it starts clear of the corner clasps, so the board's hardware is not
    // half buried under its own banner
    const inset = Math.max(0, cs - F - 1);
    const px0 = x + F + 2 + inset;
    const bw = (x + w - F - 4 - s) - px0;
    plank(ctx, px0, y + F - 1, bw, bar, { label: String(opts.title), seed: 5 });
    slab(ctx, cx, cy, s, s, {
      face: opts.closeHot ? '#e8825c' : C.frame,
      lit: opts.closeHot ? '#ffb694' : C.frameLit,
      dim: opts.closeHot ? '#96431e' : C.frameDim,
      down: !!opts.closeDown,
    });
    const o = opts.closeDown ? 1 : 0;
    for (let i = 0; i < s - 5; i++) {
      R(ctx, cx + 3 + i + o, cy + 3 + i + o, 1, 1, C.ink);
      R(ctx, cx + s - 4 - i + o, cy + 3 + i + o, 1, 1, C.ink);
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
  let face = C.frame, lit = C.frameLit, dim = C.frameDim;
  if (off) { face = '#8a7a63'; lit = '#a8977d'; dim = '#5d5041'; }
  else if (on) { face = opts.tint || C.rust; lit = C.rustLit; dim = C.rustDim; }
  else if (hot) { face = '#f6d06a'; lit = '#fff0b4'; dim = '#bb8c22'; }
  slab(ctx, x, y, w, h, { face, lit, dim, down: down || (on && opts.sticky) });
  const o = (down || (on && opts.sticky)) ? 1 : 0;
  const tx = Math.round(x + w / 2) + o;
  const ty = Math.round(y + (h - 7) / 2) + o;
  const col = off ? '#4a4034' : on ? '#2a1408' : C.ink;
  if (opts.icon) {
    const iw = 11;
    const lw = label ? textWidth(label) : 0;
    const ix = Math.round(x + (w - (iw + (lw ? lw + 3 : 0))) / 2) + o;
    opts.icon(ctx, ix + 5, Math.round(y + h / 2) + o);
    if (label) drawText(ctx, label, ix + iw + 3, ty, { color: col });
    return;
  }
  if (label) drawText(ctx, ellipsize(label, w - 8), tx, ty, { color: col, align: 'center' });
}

/** A STEEL button: the square hardware one, for an icon and nothing else. */
export function steelButton(ctx, x, y, s, opts = {}) {
  const hot = !!opts.hot, down = !!opts.down, on = !!opts.on;
  slab(ctx, x, y, s, s, {
    face: on ? C.steelLit : hot ? '#7aaec7' : C.steel,
    lit: '#b5dcec', dim: C.steelDim, down,
  });
  // four rivets, because that is what holds a steel plate on
  const o = down ? 1 : 0;
  for (const [dx, dy] of [[2, 2], [s - 4, 2], [2, s - 4], [s - 4, s - 4]]) {
    R(ctx, x + dx + o, y + dy + o, 1, 1, C.steelDim);
  }
}

/** The four flourishes that make a slot a slot rather than a square. */
function corners(ctx, x, y, w, h, c) {
  const put = (dx, dy) => R(ctx, x + dx, y + dy, 1, 1, c);
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ox = sx > 0 ? 2 : w - 3, oy = sy > 0 ? 2 : h - 3;
    put(ox, oy);
    put(ox + sx, oy);
    put(ox, oy + sy);
    put(ox + sx * 2, oy + sy);
    put(ox + sx, oy + sy * 2);
  }
}

/**
 * A slot: the brass-bezelled square a thing sits in.
 *
 * Brass when it holds something you can have, steel when it is locked -
 * which is the difference between "not yet" and "empty" and is worth a
 * whole different metal.
 */
export function slot(ctx, x, y, w, h = w, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const empty = !!opts.empty;
  const hot = !!opts.hot, on = !!opts.on;
  // An empty square is steel and it RECEDES: a grid of fifteen bright slots
  // beside two full ones is a screen shouting about the fourteen things you
  // have not got.
  const rim = empty ? (hot ? '#5f93ad' : '#476f85') : (on ? C.goldLit : hot ? '#f2ce6a' : C.gold);
  const rimDim = empty ? '#2c5062' : C.goldDim;
  const back = opts.back || (empty ? '#20353f' : C.wood);
  const backDim = empty ? '#16252c' : C.woodDim;

  R(ctx, x + 1, y, w - 2, 1, C.ink);
  R(ctx, x + 1, y + h - 1, w - 2, 1, C.ink);
  R(ctx, x, y + 1, 1, h - 2, C.ink);
  R(ctx, x + w - 1, y + 1, 1, h - 2, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, rim);
  R(ctx, x + 1, y + 1, w - 2, 1, empty ? '#6d9fb8' : C.goldLit);
  R(ctx, x + 1, y + h - 2, w - 2, 1, rimDim);
  R(ctx, x + w - 2, y + 1, 1, h - 2, rimDim);
  // the well
  R(ctx, x + 2, y + 2, w - 4, h - 4, C.ink);
  R(ctx, x + 3, y + 3, w - 6, h - 6, back);
  R(ctx, x + 3, y + h - 4, w - 6, 1, backDim);
  // the flourish is CUT into the bezel rather than laid on it, which is the
  // only way five pixels of ornament read at this size
  if (!empty && w >= 12 && h >= 12) {
    corners(ctx, x, y, w, h, C.goldDim);
    corners(ctx, x - 1, y - 1, w, h, C.goldLit);
  }
  if (on) {
    R(ctx, x + 2, y + 2, w - 4, 1, C.goldLit);
    R(ctx, x + 2, y + 2, 1, h - 4, C.goldLit);
  }
}

/**
 * A segmented bar: a row of brass blocks that are either on or off. It reads
 * at a glance and it never needs a number beside it.
 */
export function blocks(ctx, x, y, w, h, f, col = C.frame, opts = {}) {
  const n = opts.n || Math.max(4, Math.floor(w / 5));
  const bw = Math.floor((w - (n - 1)) / n);
  const lit = Math.round(clamp01(f) * n);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + i * (bw + 1));
    R(ctx, bx, y, bw, h, C.ink);
    R(ctx, bx, y, bw, h - 1, i < lit ? col : C.woodDim);
    if (i < lit) R(ctx, bx, y, bw, 1, '#fff2c4');
  }
}

/**
 * A gauge: a level rather than a count. A wooden trough with a steel cap at
 * each end and the fill running between them.
 */
export function gauge(ctx, x, y, w, h, f, col = C.good) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x, y, w, h, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, C.woodDim);
  const fw = Math.round((w - 2) * clamp01(f));
  if (fw > 0) {
    R(ctx, x + 1, y + 1, fw, h - 2, col);
    R(ctx, x + 1, y + 1, fw, 1, '#ffffff');
    ctx.globalAlpha *= 0.4;
    R(ctx, x + 1, y + h - 2, fw, 1, C.ink);
    ctx.globalAlpha /= 0.4;
  }
  // the caps
  if (w >= 10) {
    R(ctx, x, y, 2, h, C.steel);
    R(ctx, x + w - 2, y, 2, h, C.steel);
    R(ctx, x, y, 2, 1, C.steelLit);
    R(ctx, x + w - 2, y, 2, 1, C.steelLit);
  }
}

/** A tick box, on or off, with a real tick in it. */
export function check(ctx, x, y, s, on, hot) {
  slab(ctx, x, y, s, s, {
    face: on ? C.good : C.page,
    lit: on ? '#c2e89a' : '#f0d2a4',
    dim: on ? '#4f8030' : C.pageDim,
    down: on,
  });
  if (hot) { R(ctx, x, y, s, 1, C.goldLit); R(ctx, x, y, 1, s, C.goldLit); }
  if (!on) return;
  // a real tick: down two to the left, up four to the right
  for (let i = 0; i < 2; i++) R(ctx, x + 2 + i, y + 4 + i, 1, 2, C.ink);
  for (let i = 0; i < 4; i++) R(ctx, x + 4 + i, y + 6 - i, 1, 2, C.ink);
}

/** A paging arrow. `dir` is -1 or 1 for left/right, or 'up'/'down'. */
export function arrow(ctx, x, y, s, dir, opts = {}) {
  const hot = !!opts.hot;
  slab(ctx, x, y, s, s, {
    face: hot ? '#f6d06a' : C.frame, lit: C.frameLit,
    dim: C.frameDim, down: !!opts.down,
  });
  const o = opts.down ? 1 : 0;
  const cx = Math.round(x + s / 2) + o, cy = Math.round(y + s / 2) + o;
  const n = Math.floor((s - 4) / 2);
  for (let i = 0; i < n; i++) {
    if (dir === 'up') R(ctx, cx - i, cy - n / 2 + i + 1, i * 2 + 1, 1, C.ink);
    else if (dir === 'down') R(ctx, cx - i, cy + n / 2 - i - 1, i * 2 + 1, 1, C.ink);
    else if (dir > 0) R(ctx, cx + n / 2 - i - 1, cy - i, 1, i * 2 + 1, C.ink);
    else R(ctx, cx - n / 2 + i + 1, cy - i, 1, i * 2 + 1, C.ink);
  }
}

/**
 * A row on a page. Alternating rows get the darker parchment, which is the
 * one trick that makes a long list readable without drawing a box round
 * every line of it.
 */
export function row(ctx, x, y, w, h, i, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot;
  R(ctx, x, y, w, h, on ? '#f0c464' : hot ? '#e9caa0' : (i & 1) ? C.pageAlt : C.page);
  if (on) {
    R(ctx, x, y, 2, h, C.rust);
    R(ctx, x, y, w, 1, '#ffe49c');
    R(ctx, x, y + h - 1, w, 1, C.pageDim);
  }
}

/** A hairline divider across a page. */
export function rule(ctx, x, y, w) {
  R(ctx, x, y, w, 1, C.pageDim);
  R(ctx, x, y + 1, w, 1, '#f0d2a4');
}

/** A heading on a page: small, dark, with a rule under it. */
export function heading(ctx, x, y, w, text) {
  drawText(ctx, text, x, y, { color: C.inkSoft });
  rule(ctx, x, y + 9, w);
}

/**
 * A plaque: the little read-only board the HUD says things on. Wood, because
 * it is structure rather than something you press, with a brass edge where
 * it wants to say which kind of thing it is.
 */
export function plaque(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x + 1, y, w - 2, 1, C.ink);
  R(ctx, x + 1, y + h - 1, w - 2, 1, C.ink);
  R(ctx, x, y + 1, 1, h - 2, C.ink);
  R(ctx, x + w - 1, y + 1, 1, h - 2, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, opts.face || C.wood);
  R(ctx, x + 1, y + 1, w - 2, 1, opts.lit || C.woodLit);
  R(ctx, x + 1, y + h - 2, w - 2, 1, opts.dim || C.woodDim);
  grain(ctx, x + 1, y + 1, w - 2, h - 2, (w + h) & 7);
  if (opts.tint) R(ctx, x + 1, y + 1, 2, h - 2, opts.tint);
}

/** A length of steel chain, for a divider that is a thing rather than a line. */
export function chain(ctx, x, y, h, vertical = true) {
  const n = Math.floor((vertical ? h : h) / 6);
  for (let i = 0; i < n; i++) {
    const ox = vertical ? x : x + i * 6;
    const oy = vertical ? y + i * 6 : y;
    const w2 = i & 1 ? 5 : 3;
    const h2 = i & 1 ? 3 : 5;
    const cx = ox - Math.floor(w2 / 2), cy = oy - Math.floor(h2 / 2);
    R(ctx, cx, cy, w2, h2, C.ink);
    R(ctx, cx, cy, w2, h2 - 1, C.steel);
    R(ctx, cx, cy, w2, 1, C.steelLit);
    if (w2 > 2 && h2 > 2) R(ctx, cx + 1, cy + 1, w2 - 2, h2 - 2, C.steelDim);
  }
}

/** A brass padlock, for the things you have not earned yet. */
export function lock(ctx, x, y, s = 9) {
  const b = Math.round(s * 0.6);
  // the shackle
  R(ctx, x + 2, y, s - 4, 2, C.steelDim);
  R(ctx, x + 2, y + 1, 1, s - b, C.steelDim);
  R(ctx, x + s - 3, y + 1, 1, s - b, C.steelDim);
  // the body
  R(ctx, x, y + s - b, s, b, C.ink);
  R(ctx, x + 1, y + s - b, s - 2, b - 1, C.gold);
  R(ctx, x + 1, y + s - b, s - 2, 1, C.goldLit);
  R(ctx, x + Math.floor(s / 2) - 1, y + s - b + 2, 2, 2, C.ink);
}

export { R as px };
