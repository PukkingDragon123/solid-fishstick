// CRABDEN - the interface kit.
//
// Everything the game draws that is not the world is drawn out of this file.
// It went through a mint-green phase and a brass-and-parchment phase, and
// neither of them was this game: this game is a desert with stone in it, and
// the interface is made of the things you would actually find out there.
//
// The material is THREE THINGS and they always do the same jobs:
//
//   STONE is what you press. Every button, every tab, every plate is a slab
//     knocked square out of the same rock as the mesas, with a bevel lit
//     along the top and left and a channel carved a pixel in from the edge.
//   LEATHER is structure. A window is a board of it stretched on a frame,
//     and it is what a panel, a rail and a banner are made of.
//   BRASS is the highlight. The lit edge of the thing you are on, the rule
//     under a heading, the rivet in a corner. Nothing is MADE of brass; it
//     is what catches the light on something made of stone.
//
// And the words are pale on dark, always, because the game behind this
// interface is a dark one.
//
// The pieces:
//
//   A WINDOW is the board: the hide, the frame round it, a brass rivet in
//   each corner, and a carved title strip with an X at the end of it.
//
//   A BUTTON is a slab. When you push it, it goes DOWN - the bevel flips and
//   everything on it moves a pixel - because a button that does not move
//   when you press it is a picture of a button.
//
//   A SLOT is a recess: a hole cut in the board with the light falling into
//   the top of it. A slot you cannot use yet is darker and flatter, because
//   "not yet" and "empty" are different things.
//
// Two rules hold it together. Everything lands on whole pixels, because half
// a pixel of bevel is a blurred edge. And every interactive thing has exactly
// three states - resting, under the pointer, and held.

import { drawText, textWidth, ellipsize } from '../lib/font.js';
import { clamp01 } from '../lib/math.js';
import { drawPlate, drawPanel } from './icons.js';

/** Every outline in the interface. Not a text colour - see `C.ink`. */
const OUT = 'rgba(10,7,4,0.85)';

/**
 * The whole palette.
 *
 * `ink` is the colour WORDS are, which on this material is pale. The names
 * are kept from the kit's earlier lives so that changing the material
 * changes the whole game rather than three hundred call sites.
 */
export const C = {
  ink: '#f2e4c2',                      // what words are, on anything
  inkSoft: 'rgba(240,226,192,0.64)',
  shadow: 'rgba(10,7,4,0.5)',

  frame: '#4a4136',                    // STONE: the face of anything you press
  frameLit: 'rgba(150,138,112,0.85)',
  frameDim: 'rgba(16,12,8,0.7)',
  frameDeep: '#14100a',

  page: '#2b2318',                     // the hide inside a board
  pageAlt: '#332a1d',                  // and every other row of a list on it
  pageDim: 'rgba(150,130,96,0.28)',

  gold: '#e2b74a',                     // BRASS: the highlight, never a surface
  goldLit: '#f7e3a8',
  goldDim: '#8d6f28',

  wood: '#3a2718',                     // LEATHER: rails, planks, banners
  woodLit: 'rgba(198,162,106,0.30)',
  woodDim: 'rgba(12,8,5,0.7)',

  steel: '#d6ba8a',                    // the pale brass of a rivet or a cap
  steelLit: '#f2e4c2',
  steelDim: '#8d6f28',

  rust: '#c2702e',                     // the second button, for the rarer thing
  rustLit: '#e79c5a',
  rustDim: '#6e3c17',

  slot: 'rgba(30,23,15,0.92)',         // an empty recess
  slotDim: 'rgba(12,8,5,0.8)',

  good: '#8cc468',
  warn: '#e2b74a',
  bad: '#d05a44',
  cool: '#6fd8ee',
  gem: '#c98ade',
};

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/**
 * A slab of stone: the one primitive.
 *
 * It is the baked stone plate with a bevel over it, so every button in the
 * game has real bedding and grit in it rather than being a flat rectangle
 * with a lighter line along the top.
 */
export function slab(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 3 || h < 3) return;
  const down = !!opts.down;
  drawPlate(ctx, x, y, w, h, { mat: opts.mat || 'stone', alpha: opts.alpha });
  if (opts.face && opts.face !== C.frame) {
    // a tinted slab: the colour washed over the stone rather than instead of
    // it, so the rock still shows through whatever the thing is made of
    ctx.save();
    ctx.globalAlpha = (opts.alpha ?? 1) * (opts.wash ?? 0.55);
    R(ctx, x + 1, y + 1, w - 2, h - 2, opts.face);
    ctx.restore();
  }
  // the bevel, which is the whole of "pressed" and "not pressed"
  const lit = opts.lit || C.frameLit;
  const dim = opts.dim || C.frameDim;
  R(ctx, x, down ? y + h - 1 : y, w, 1, down ? dim : lit);
  R(ctx, down ? x + w - 1 : x, y, 1, h, down ? dim : lit);
  R(ctx, x, down ? y : y + h - 1, w, 1, down ? lit : dim);
  R(ctx, down ? x : x + w - 1, y, 1, h, down ? lit : dim);
}

/** A brass rivet, which is how anything is fixed to anything. */
export function clasp(ctx, x, y, s, sx, sy) {
  const ax = sx > 0 ? x : x - 2;
  const ay = sy > 0 ? y : y - 2;
  R(ctx, ax, ay, 2, 2, C.goldDim);
  R(ctx, ax, ay, 1, 1, C.goldLit);
}

/**
 * A PLANK: a strip of hide with a carved channel down it, and a brass cap at
 * each end. It is the banner, the title strip and the divider.
 */
export function plank(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 10 || h < 5) return;
  drawPlate(ctx, x, y, w, h, { mat: 'leather' });
  R(ctx, x, y, w, 1, C.frameDim);
  R(ctx, x, y + h - 1, w, 1, 'rgba(198,162,106,0.22)');
  // the caps
  for (const cx of [x + 1, x + w - 3]) {
    R(ctx, cx, y + 1, 2, h - 2, C.goldDim);
    R(ctx, cx, y + 1, 2, 1, C.gold);
  }
  if (opts.label) {
    drawText(ctx, ellipsize(opts.label, w - 14), x + w / 2, y + (h - 7) / 2,
      { color: opts.color || C.gold, align: 'center' });
  }
  return { x: x + 5, w: w - 10 };
}

/**
 * A window - the board. Hide stretched on a frame with a rivet in each
 * corner, and a carved title strip across the top of it.
 *
 * Returns the page rectangle and where the X landed, so the caller hit-tests
 * it rather than this file guessing at an input system it cannot see.
 */
export function windowFrame(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const T = opts.title !== undefined;
  const bar = T ? (opts.barH || 13) : 0;
  const F = opts.thick || 3;

  drawPanel(ctx, x, y, w, h);
  const px = x + F + 1, py = y + F + 1 + bar;
  const pw = w - (F + 1) * 2, ph = h - (F + 1) * 2 - bar;

  let close = null;
  if (T) {
    // the title is CUT INTO the board: a channel sunk across the top with
    // the name carved in it, which is what makes it part of the thing
    const bx = x + F + 1, by = y + F, bw = w - (F + 1) * 2;
    R(ctx, bx, by, bw, bar - 1, 'rgba(12,8,5,0.55)');
    R(ctx, bx, by, bw, 1, 'rgba(8,5,3,0.7)');
    R(ctx, bx, by + bar - 2, bw, 1, 'rgba(198,162,106,0.22)');
    drawText(ctx, ellipsize(String(opts.title), bw - 26), x + w / 2, by + (bar - 8) / 2,
      { color: C.gold, align: 'center' });
    // the X, as a real little slab on the end of it
    const s = bar - 2;
    const cx = x + w - F - 2 - s, cy = by + 1;
    slab(ctx, cx, cy, s, s, {
      face: opts.closeHot ? '#8e3a2a' : undefined,
      lit: opts.closeHot ? C.goldLit : C.frameLit,
      down: !!opts.closeDown,
    });
    const o = opts.closeDown ? 1 : 0;
    for (let i = 0; i < s - 5; i++) {
      R(ctx, cx + 3 + i + o, cy + 3 + i + o, 1, 1, opts.closeHot ? '#ffd8c8' : C.ink);
      R(ctx, cx + s - 4 - i + o, cy + 3 + i + o, 1, 1, opts.closeHot ? '#ffd8c8' : C.ink);
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
 * The one you are on has its carved channel filled with brass, which is how
 * a stone tablet gets to look chosen.
 */
export function button(ctx, x, y, w, h, label, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot, down = !!opts.down;
  const off = !!opts.disabled;
  const tint = opts.tint || C.gold;
  slab(ctx, x, y, w, h, {
    alpha: off ? 0.5 : 1,
    face: on ? tint : hot ? '#6d604c' : undefined,
    wash: on ? 0.26 : 0.5,
    lit: on ? tint : hot ? 'rgba(198,180,140,0.9)' : C.frameLit,
    down: down || (on && opts.sticky),
  });
  // and a lit bar down the leading edge of the one you are on
  if (on) R(ctx, x, y, 2, h, tint);
  const o = (down || (on && opts.sticky)) ? 1 : 0;
  const tx = Math.round(x + w / 2) + o;
  const ty = Math.round(y + (h - 7) / 2) + o;
  const col = off ? 'rgba(240,226,192,0.34)' : on ? '#fff3d2' : C.ink;
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

/** A darker slab, for a control that is hardware rather than a choice. */
export function steelButton(ctx, x, y, s, opts = {}) {
  slab(ctx, x, y, s, s, {
    face: opts.on ? C.gold : undefined,
    wash: 0.3,
    lit: opts.hot ? 'rgba(198,180,140,0.9)' : C.frameLit,
    down: !!opts.down,
  });
}

/**
 * A SLOT.
 *
 * The reference is a row of inventory squares off an old brass instrument
 * case: a raised gold bezel with a little flourish turned into each corner,
 * and inside it a panel of dark wood with the light falling into the top of
 * it. So that is what one is. Three layers and no more: the dark line round
 * the outside, the brass bezel, and the sunk wooden field the thing sits in.
 *
 * The flourishes are the whole trick. Four pixels in each corner, turned the
 * right way round, and a plain square becomes a fitting somebody made.
 */
export function slot(ctx, x, y, w, h = w, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const empty = !!opts.empty;
  const hot = !!opts.hot, on = !!opts.on;
  // the dark line round everything
  R(ctx, x, y, w, h, OUT);
  // the bezel: brass, lit along the top and left, dulled along the bottom
  const lit = on ? C.goldLit : hot ? '#f0d89a' : empty ? 'rgba(141,111,40,0.7)' : C.gold;
  const dim = on ? C.gold : hot ? C.gold : empty ? 'rgba(90,70,32,0.7)' : C.goldDim;
  R(ctx, x + 1, y + 1, w - 2, h - 2, dim);
  R(ctx, x + 1, y + 1, w - 2, 1, lit);
  R(ctx, x + 1, y + 1, 1, h - 2, lit);
  // the field, sunk into it
  const b = w >= 16 && h >= 16 ? 3 : 2;
  const ix = x + b, iy = y + b, iw = w - b * 2, ih = h - b * 2;
  if (iw < 2 || ih < 2) return;
  R(ctx, ix, iy, iw, ih, OUT);
  R(ctx, ix + 1, iy + 1, iw - 2, ih - 2,
    opts.back || (empty ? '#241a10' : hot ? '#43301c' : C.wood));
  R(ctx, ix + 1, iy + 1, iw - 2, 1, 'rgba(0,0,0,0.5)');
  R(ctx, ix + 1, iy + 1, 1, ih - 2, 'rgba(0,0,0,0.38)');
  R(ctx, ix + 1, iy + ih - 2, iw - 2, 1, 'rgba(198,162,106,0.16)');
  // and the flourish turned into each corner
  if (w >= 13 && h >= 13) {
    const f = on || hot ? C.goldLit : C.gold;
    const cor = (cx, cy, sx, sy) => {
      R(ctx, cx, cy, 2, 1, f);
      R(ctx, cx, cy + sy, 1, 1, f);
      R(ctx, cx + sx * 2, cy, 1, 1, f);
    };
    cor(x + 1, y + 1, 1, 1);
    cor(x + w - 3, y + 1, -1, 1);
    cor(x + 1, y + h - 2, 1, -1);
    cor(x + w - 3, y + h - 2, -1, -1);
  }
}

/**
 * A segmented bar: a row of blocks that are either on or off. It reads at a
 * glance and it never needs a number beside it.
 */
export function blocks(ctx, x, y, w, h, f, col = C.gold, opts = {}) {
  const n = opts.n || Math.max(4, Math.floor(w / 5));
  const bw = Math.floor((w - (n - 1)) / n);
  const lit = Math.round(clamp01(f) * n);
  for (let i = 0; i < n; i++) {
    const bx = Math.round(x + i * (bw + 1));
    R(ctx, bx, y, bw, h, OUT);
    R(ctx, bx, y, bw, h - 1, i < lit ? col : 'rgba(58,46,32,0.9)');
    if (i < lit) R(ctx, bx, y, bw, 1, 'rgba(255,245,214,0.7)');
  }
}

/** A gauge: brass-bound glass, with a meniscus at the leading edge. */
export function gauge(ctx, x, y, w, h, f, col = C.good) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  R(ctx, x, y, w, h, OUT);
  R(ctx, x + 1, y + 1, w - 2, h - 2, 'rgba(30,24,16,0.9)');
  const fw = Math.round((w - 2) * clamp01(f));
  if (fw > 0) {
    R(ctx, x + 1, y + 1, fw, h - 2, col);
    R(ctx, x + 1, y + 1, fw, 1, 'rgba(255,255,255,0.55)');
    ctx.globalAlpha *= 0.4;
    R(ctx, x + 1, y + h - 2, fw, 1, OUT);
    ctx.globalAlpha /= 0.4;
    if (fw > 2) R(ctx, x + fw, y + 1, 1, h - 2, 'rgba(255,255,255,0.4)');
  }
  // the end caps, unscrewable
  if (w >= 10) {
    R(ctx, x, y, 2, h, C.goldDim);
    R(ctx, x + w - 2, y, 2, h, C.goldDim);
    R(ctx, x, y, 2, 1, C.gold);
    R(ctx, x + w - 2, y, 2, 1, C.gold);
  }
}

/** A tick box, on or off, with a real tick in it. */
export function check(ctx, x, y, s, on, hot) {
  slab(ctx, x, y, s, s, { face: on ? C.good : undefined, wash: 0.5, down: on });
  if (hot) { R(ctx, x, y, s, 1, C.goldLit); R(ctx, x, y, 1, s, C.goldLit); }
  if (!on) return;
  // a real tick: down two to the left, up four to the right
  for (let i = 0; i < 2; i++) R(ctx, x + 2 + i, y + 4 + i, 1, 2, '#12200c');
  for (let i = 0; i < 4; i++) R(ctx, x + 4 + i, y + 6 - i, 1, 2, '#12200c');
}

/** A paging arrow. `dir` is -1 or 1 for left/right, or 'up'/'down'. */
export function arrow(ctx, x, y, s, dir, opts = {}) {
  slab(ctx, x, y, s, s, {
    face: opts.hot ? '#6d604c' : undefined,
    lit: opts.hot ? 'rgba(198,180,140,0.9)' : C.frameLit,
    down: !!opts.down,
  });
  const o = opts.down ? 1 : 0;
  const cx = Math.round(x + s / 2) + o, cy = Math.round(y + s / 2) + o;
  const n = Math.floor((s - 4) / 2);
  const col = opts.hot ? C.goldLit : C.ink;
  for (let i = 0; i < n; i++) {
    if (dir === 'up') R(ctx, cx - i, cy - n / 2 + i + 1, i * 2 + 1, 1, col);
    else if (dir === 'down') R(ctx, cx - i, cy + n / 2 - i - 1, i * 2 + 1, 1, col);
    else if (dir > 0) R(ctx, cx + n / 2 - i - 1, cy - i, 1, i * 2 + 1, col);
    else R(ctx, cx - n / 2 + i + 1, cy - i, 1, i * 2 + 1, col);
  }
}

/**
 * A row in a list. Alternating rows get a shade of the hide, which is the one
 * trick that makes a long list readable without drawing a box round every
 * line of it.
 */
export function row(ctx, x, y, w, h, i, opts = {}) {
  const on = !!opts.on, hot = !!opts.hot;
  R(ctx, x, y, w, h, on ? 'rgba(104,80,48,0.95)'
    : hot ? 'rgba(74,58,36,0.95)' : (i & 1) ? C.pageAlt : C.page);
  if (on) {
    R(ctx, x, y, 2, h, C.gold);
    R(ctx, x, y, w, 1, 'rgba(226,204,160,0.3)');
    R(ctx, x, y + h - 1, w, 1, 'rgba(12,8,5,0.5)');
  }
}

/** A hairline divider across a page. */
export function rule(ctx, x, y, w) {
  R(ctx, x, y, w, 1, 'rgba(12,8,5,0.6)');
  R(ctx, x, y + 1, w, 1, 'rgba(198,162,106,0.22)');
}

/** A heading on a page: small, brass, with a rule under it. */
export function heading(ctx, x, y, w, text) {
  drawText(ctx, text, x, y, { color: C.gold });
  rule(ctx, x, y + 9, w);
}

/**
 * A plaque: the little read-only slab the HUD says things on. The same stone
 * as a button but flat, because it is not something you press.
 */
export function plaque(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  drawPlate(ctx, x, y, w, h, { mat: 'stone', alpha: opts.alpha });
  if (opts.face) {
    ctx.save();
    ctx.globalAlpha = (opts.alpha ?? 1) * 0.4;
    R(ctx, x + 1, y + 1, w - 2, h - 2, opts.face);
    ctx.restore();
  }
  if (opts.tint) R(ctx, x, y, 2, h, opts.tint);
}

/** A run of brass beads, for a divider that is a thing rather than a line. */
export function chain(ctx, x, y, h, vertical = true) {
  const n = Math.floor(h / 6);
  for (let i = 0; i < n; i++) {
    const ox = vertical ? x : x + i * 6;
    const oy = vertical ? y + i * 6 : y;
    R(ctx, ox - 1, oy - 1, 3, 3, C.goldDim);
    R(ctx, ox - 1, oy - 1, 2, 1, C.gold);
  }
}

/** A padlock, for the things you have not earned yet. */
export function lock(ctx, x, y, s = 9) {
  const b = Math.round(s * 0.6);
  R(ctx, x + 2, y, s - 4, 2, 'rgba(198,180,140,0.7)');
  R(ctx, x + 2, y + 1, 1, s - b, 'rgba(198,180,140,0.7)');
  R(ctx, x + s - 3, y + 1, 1, s - b, 'rgba(198,180,140,0.7)');
  R(ctx, x, y + s - b, s, b, OUT);
  R(ctx, x + 1, y + s - b, s - 2, b - 1, C.goldDim);
  R(ctx, x + 1, y + s - b, s - 2, 1, C.gold);
  R(ctx, x + Math.floor(s / 2) - 1, y + s - b + 2, 2, 2, OUT);
}

export { R as px };
