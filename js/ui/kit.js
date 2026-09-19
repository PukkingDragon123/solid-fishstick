// CRABDEN - the interface kit.
//
// Everything the game draws that is not the world is drawn out of this file,
// and it is all one material. Before this there were three: leather boards in
// the conversation, brass plates on the HUD, and flat brown boxes in the
// panels - which is three answers to "what is a button" and therefore no
// answer at all.
//
// The language, top to bottom:
//
//   A WINDOW is a black outline, a mint frame three pixels thick with a lit
//   top edge and a shaded bottom one, and a cream page inside it. It has a
//   title bar cut out of the frame and a real X in the corner.
//
//   A BUTTON is the same idea shrunk: black outline, mint face, a highlight
//   along the top and left, a shadow along the bottom and right. It is proud
//   of the page. When you push it, it goes DOWN - the highlight and the
//   shadow swap and everything on it moves a pixel - because a button that
//   does not move when you press it is a picture of a button.
//
//   A SLOT is gold: a black outline, a brass bezel with a flourish cut into
//   each corner, and dark wood behind whatever is sitting in it.
//
// Two rules hold the whole thing together. Everything lands on whole pixels,
// because half a pixel of bevel is a blurred edge. And every interactive
// thing has exactly three states - resting, under the pointer, and held -
// which is what makes a screen feel like it is made of switches rather than
// of pictures of switches.

import { drawText, textWidth, ellipsize } from '../lib/font.js';
import { clamp01 } from '../lib/math.js';

/** The whole palette. Nothing in the interface uses a colour not in here. */
export const C = {
  ink: '#241c15',          // every outline, and text on anything light
  inkSoft: '#4a3b2c',
  shadow: 'rgba(20,14,9,0.35)',

  frame: '#7fc79a',        // the mint the frames and buttons are made of
  frameLit: '#b4e9c6',
  frameDim: '#4e9270',
  frameDeep: '#2f6b4e',

  page: '#f2e2bc',         // the cream inside a window
  pageAlt: '#e4cf9f',      // every other row
  pageDim: '#cdb47f',

  gold: '#e0b845',         // the brass a slot is bezelled in
  goldLit: '#f8e493',
  goldDim: '#9c7822',

  wood: '#7d5128',         // and the wood behind what is in it
  woodDim: '#54321a',

  slot: '#8398b0',         // the blue-grey of an empty inventory square
  slotDim: '#5c6f88',

  good: '#8ad46a',
  warn: '#e0a63c',
  bad: '#d9644f',
  cool: '#6fc6dd',
  gem: '#8f7fd8',
};

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/**
 * A bevelled slab: outline, face, lit edge one way, shadow the other.
 *
 * This is the one primitive. A window frame is a big one, a button is a small
 * one, and a pressed button is a small one with `down` set, which flips which
 * edges are lit. Everything else in this file is built out of it.
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

/**
 * A window.
 *
 * Frame, page, title bar and an X. Returns the page rectangle and where the
 * X landed, so the caller hit-tests it rather than this file guessing at an
 * input system it cannot see.
 */
export function windowFrame(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const T = opts.title !== undefined;
  const bar = T ? (opts.barH || 13) : 0;
  const F = opts.thick || 3;

  // a soft drop, so a window sits ON the world instead of in it
  ctx.globalAlpha *= 0.55;
  R(ctx, x + 2, y + h, w - 2, 2, '#0a0705');
  R(ctx, x + w, y + 2, 2, h - 2, '#0a0705');
  ctx.globalAlpha /= 0.55;

  slab(ctx, x, y, w, h, { face: C.frame, lit: C.frameLit, dim: C.frameDim });
  // the page, sunk into the frame
  const px = x + F + 1, py = y + F + 1 + bar;
  const pw = w - (F + 1) * 2, ph = h - (F + 1) * 2 - bar;
  R(ctx, px - 1, py - 1, pw + 2, ph + 2, C.frameDeep);
  R(ctx, px, py, pw, ph, opts.page || C.page);

  let close = null;
  if (T) {
    // the title is CUT INTO the frame: a darker strip with the name on it,
    // which is what makes the bar read as part of the frame rather than as a
    // rectangle somebody put on top of one
    const bx = x + F + 1, by = y + F, bw = w - (F + 1) * 2;
    R(ctx, bx, by, bw, bar - 1, C.frameDim);
    R(ctx, bx, by, bw, 1, C.frameDeep);
    drawText(ctx, ellipsize(String(opts.title), bw - 22), x + w / 2, by + (bar - 8) / 2,
      { color: C.ink, align: 'center' });
    // the X, as a real little button in the corner
    const s = bar - 2;
    const cx = x + w - F - 1 - s, cy = by + 1;
    slab(ctx, cx, cy, s, s, {
      face: opts.closeHot ? '#f0a894' : C.frame,
      lit: opts.closeHot ? '#ffd3c4' : C.frameLit,
      dim: opts.closeHot ? '#b05c48' : C.frameDim,
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
  if (off) { face = '#9aa093'; lit = '#bcc0b4'; dim = '#6b7166'; }
  else if (on) { face = opts.tint || '#f0d98a'; lit = '#fff0bd'; dim = '#b08f34'; }
  else if (hot) { face = '#9fdcb4'; lit = '#c8f2d6'; dim = '#5fa77c'; }
  slab(ctx, x, y, w, h, { face, lit, dim, down: down || (on && opts.sticky) });
  const o = (down || (on && opts.sticky)) ? 1 : 0;
  let tx = Math.round(x + w / 2) + o;
  const ty = Math.round(y + (h - 7) / 2) + o;
  if (opts.icon) {
    const iw = 11;
    const lw = label ? textWidth(label) : 0;
    const ix = Math.round(x + (w - (iw + (lw ? lw + 3 : 0))) / 2) + o;
    opts.icon(ctx, ix + 5, Math.round(y + h / 2) + o);
    if (label) drawText(ctx, label, ix + iw + 3, ty, { color: off ? '#5b6156' : C.ink });
    return;
  }
  if (label) {
    drawText(ctx, ellipsize(label, w - 8), tx, ty,
      { color: off ? '#5b6156' : C.ink, align: 'center' });
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
 * `kind` picks the metal. Gold is the one from the reference sheet and is
 * what anything you own sits in; 'cool' is the blue-grey of an empty square
 * in a grid, which is a different thing and should look like one.
 */
export function slot(ctx, x, y, w, h = w, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const empty = !!opts.empty;
  const hot = !!opts.hot, on = !!opts.on;
  const rim = empty ? (hot ? '#9db0c6' : C.slot) : (on ? C.goldLit : hot ? '#f0cf6a' : C.gold);
  const rimDim = empty ? C.slotDim : C.goldDim;
  const back = opts.back || (empty ? '#3d4a5c' : C.wood);
  const backDim = empty ? '#2b3543' : C.woodDim;

  R(ctx, x + 1, y, w - 2, 1, C.ink);
  R(ctx, x + 1, y + h - 1, w - 2, 1, C.ink);
  R(ctx, x, y + 1, 1, h - 2, C.ink);
  R(ctx, x + w - 1, y + 1, 1, h - 2, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, rim);
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
 * A segmented bar, the way the reference sheet draws a volume slider: a row
 * of blocks that are either on or off. It reads at a glance and it never
 * needs a number beside it.
 */
export function blocks(ctx, x, y, w, h, f, col = C.good, opts = {}) {
  const n = opts.n || Math.max(4, Math.floor(w / 5));
  const bw = Math.floor((w - (n - 1)) / n);
  const lit = Math.round(clamp01(f) * n);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + i * (bw + 1));
    R(ctx, bx, y, bw, h, C.ink);
    R(ctx, bx, y, bw, h - 1, i < lit ? col : '#6d6354');
    if (i < lit) R(ctx, bx, y, bw, 1, '#ffffff');
  }
}

/** A smooth gauge, for the things that are a level rather than a count. */
export function gauge(ctx, x, y, w, h, f, col = C.good) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x, y, w, h, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, '#4b4236');
  const fw = Math.round((w - 2) * clamp01(f));
  if (fw > 0) {
    R(ctx, x + 1, y + 1, fw, h - 2, col);
    R(ctx, x + 1, y + 1, fw, 1, '#ffffff');
    ctx.globalAlpha *= 0.4;
    R(ctx, x + 1, y + h - 2, fw, 1, C.ink);
    ctx.globalAlpha /= 0.4;
  }
}

/** A tick box, on or off, with a real tick in it. */
export function check(ctx, x, y, s, on, hot) {
  slab(ctx, x, y, s, s, {
    face: on ? C.good : C.page,
    lit: on ? '#c8f2b0' : '#fff6da',
    dim: on ? '#4e8a36' : C.pageDim,
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
    face: hot ? '#9fdcb4' : C.frame, lit: hot ? '#c8f2d6' : C.frameLit,
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
 * A row on a page. Alternating rows get the darker cream, which is the one
 * trick that makes a long list readable without drawing a box round every
 * line of it.
 */
export function row(ctx, x, y, w, h, i, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot;
  R(ctx, x, y, w, h, on ? '#f6d98c' : hot ? '#fbeccb' : (i & 1) ? C.pageAlt : C.page);
  if (on) {
    R(ctx, x, y, 2, h, C.warn);
    R(ctx, x, y, w, 1, '#fff3c9');
    R(ctx, x, y + h - 1, w, 1, C.pageDim);
  }
}

/** A hairline divider across a page. */
export function rule(ctx, x, y, w) {
  R(ctx, x, y, w, 1, C.pageDim);
  R(ctx, x, y + 1, w, 1, '#fff3c9');
}

/** A heading on a page: small, dark, with a rule under it. */
export function heading(ctx, x, y, w, text) {
  drawText(ctx, text, x, y, { color: C.inkSoft });
  rule(ctx, x, y + 9, w);
}

/**
 * A plaque: the little read-only slab the HUD says things on. Same material
 * as a button so the interface stays one thing, but flat, because it is not
 * something you press.
 */
export function plaque(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x + 1, y, w - 2, 1, C.ink);
  R(ctx, x + 1, y + h - 1, w - 2, 1, C.ink);
  R(ctx, x, y + 1, 1, h - 2, C.ink);
  R(ctx, x + w - 1, y + 1, 1, h - 2, C.ink);
  R(ctx, x + 1, y + 1, w - 2, h - 2, opts.face || '#3b3226');
  R(ctx, x + 1, y + 1, w - 2, 1, opts.lit || '#5d5140');
  R(ctx, x + 1, y + h - 2, w - 2, 1, opts.dim || '#241e16');
  if (opts.tint) R(ctx, x + 1, y + 1, 2, h - 2, opts.tint);
}

export { R as px };
