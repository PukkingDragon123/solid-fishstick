// CRABDEN - the book, as a book.
//
// Dr. Vess's encyclopedia is a leather-bound volume you open. It arrives
// closed, strapped, with the ammonite stamped on the front board; the strap
// slips, the board swings over on its hinge and lands, and the book lies open
// at the ribbon. From there it is a real book: two pages at a time, page
// numbers in the corners, a thumb-index of leather tabs standing out of the
// fore-edge for each chapter, and leaves that lift, bend and fall when you
// turn them - by key, by click on a corner, or by dragging the page across
// with a finger and letting it go.
//
// Every entry is a two-page spread. On the left, the PLATE: the animal or
// plant or stone engraved and hand-tinted the way plates in a natural history
// are, with Vess's field notes written underneath in his own hand. On the
// right, the ENTRY: what it is, where it lives, what it eats, how big, how
// rare, and what you have to do to fill the rest of the page in. A page you
// have not found is a pencilled silhouette; one you have only seen is a bare
// ink sketch; one you have studied is the full plate; one you have mastered
// has a wax seal pressed on it.
//
// On a phone held upright there is room for one page, so the book is shown a
// page at a time and each leaf turns over on the spine down the left side.
//
// Every page is baked once into a canvas and only drawn after that, so the
// cost of a page turn is the turn itself (see bookart.js `drawLeaf`).

import * as K from './kit.js';
import { drawIcon, hasIcon, iconCanvas } from './iconcore.js';
import { drawText, textWidth, ellipsize, wrapText, LINE_H } from '../lib/font.js';
import { clamp, clamp01, easeOutCubic, easeInOutCubic, lerp } from '../lib/math.js';
import { makeCanvas } from '../render/pixel.js';
import { BOOK_TABS, BOOK_TAB_BY_ID, pages as chapterPages } from '../systems/book.js';
import { creaturePortrait, plantPortrait, fishPortrait } from './portraits.js';
import { FAUNA_BY_ID, OBSERVE_STEPS } from '../data/fauna.js';
import { NEEDS_TEXT, isAnnual } from '../data/flora.js';
import { ORES, RECIPES, ITEM_BY_ID } from '../data/craft.js';
import { GENE_BY_ID } from '../data/progress.js';
import { BIOMES } from '../world/biomes.js';
import { outcropArt } from '../systems/mining.js';
import {
  CREATURE_TEXT, PLANT_TEXT, FISH_TEXT, RELIC_TEXT, MINERAL_TEXT, CHAPTER_TEXT, RARITY,
} from '../data/bookdata.js';
import {
  INK, INK2, INK3, RUBRIC, HAND, HAND_SOFT, GOLD,
  paperSheet, marbled, leatherBoard, coverFace, insideCover, goldText, ammoniteStamp,
  handText, handLines, engrave, plateFrame, orRule, star, waxSeal, initial, drawLeaf,
} from './bookart.js';

// ---------------------------------------------------------------------------
// the shape of the book

const CH_COLOR = {
  contents: ['#c9a24a', '#8f6a2a', '#5a3e18'],
  creature: ['#7a9a4a', '#4e6a2a', '#2e4218'],
  plant: ['#b85a4a', '#8a3428', '#521a14'],
  fish: ['#4a7aa8', '#2c5278', '#163250'],
  relic: ['#b8946a', '#86643e', '#523a1e'],
  mineral: ['#8a8a96', '#5c5c68', '#34343e'],
};
const TAB_ICONS = {
  contents: ['book'], creature: ['paw', 'beast'], plant: ['flower', 'leaf'], fish: ['fish', 'fishsilver'],
  relic: ['ammonite', 'fossil'], mineral: ['copperore', 'pickaxe'],
};
const tabIcon = (id) => (TAB_ICONS[id] || []).find((n) => hasIcon(n)) || 'book';

/** Where everything sits, for a screen of W x H. */
function layout(W, H) {
  const single = W < 400 || H > W * 1.12;
  if (!single) {
    const ph = Math.min(H - 40, 300);
    const pw = Math.min(Math.floor((W - 84) / 2), Math.round(ph * 0.86));
    const m = 7;
    const cx = Math.round(W / 2) - 2;
    const top = Math.round((H - ph) / 2) - 4;
    return { single, pw, ph, m, cx, top, lx: cx - pw, rx: cx, W, H };
  }
  const m = 5;
  const pw = Math.min(W - 18, 240);
  const ph = Math.min(H - 76, Math.round(pw * 2.1));
  const lx = Math.round((W - pw) / 2) + 3;
  const top = Math.round((H - ph) / 2) + 12;
  return { single, pw, ph, m, cx: lx, top, lx, rx: lx, W, H };
}

/** Roman numerals for plates and the front matter. */
function roman(n) {
  const map = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

// ---------------------------------------------------------------------------
// the order of the pages

let PAGES = null;
function buildPages() {
  if (PAGES) return PAGES;
  const P = [];
  const push = (p) => { p.idx = P.length; P.push(p); };
  push({ kind: 'endpaper', front: true });
  push({ kind: 'title' });
  push({ kind: 'guide' });
  push({ kind: 'contents' });
  let plate = 0;
  BOOK_TABS.forEach((t, ci) => {
    push({ kind: 'opener', tab: t.id, ci });
    push({ kind: 'index', tab: t.id, ci });
    for (const e of chapterPages(t.id)) {
      plate++;
      push({ kind: 'plate', tab: t.id, id: e.id, entry: e, plate });
      push({ kind: 'text', tab: t.id, id: e.id, entry: e, plate });
    }
  });
  push({ kind: 'colophon' });
  push({ kind: 'endpaper', front: false });
  // page numbers: roman for the front matter, then the body from 1
  for (const p of P) {
    if (p.kind === 'endpaper') p.num = '';
    else if (p.idx < 4) p.num = roman(p.idx).toLowerCase();
    else p.num = String(p.idx - 3);
  }
  PAGES = P;
  return P;
}
const openerOf = (tab) => buildPages().find((p) => p.kind === 'opener' && p.tab === tab)?.idx ?? 3;
const plateOf = (tab, id) => buildPages().find((p) => p.kind === 'plate' && p.tab === tab && p.id === id)?.idx;
function chapterAt(idx) {
  const P = buildPages();
  for (let i = Math.min(idx, P.length - 1); i >= 0; i--) if (P[i].tab) return P[i].tab;
  return 'contents';
}

// ---------------------------------------------------------------------------
// pictures

// Building a creature's portrait poses a whole animal, which is not free; a
// page full of thumbnails builds what it can inside a few milliseconds a
// frame and is baked again, a little fuller, until it is complete.
let ART_BUDGET = Infinity;
const artBuilt = new Set();
function rawArt(tab, def, id, force = false) {
  const key = tab + ':' + id;
  if (!force && !artBuilt.has(key) && performance.now() > ART_BUDGET) return undefined;
  artBuilt.add(key);
  try {
    if (tab === 'creature') return creaturePortrait(def);
    if (tab === 'plant') return plantPortrait(def);
    if (tab === 'fish') return fishPortrait(def);
    if (tab === 'mineral') return outcropArt(id, 9).cv;
    if (tab === 'relic') {
      const ic = { trilobite: 'trilobite', ammonite: 'ammonite', amberfly: 'amberfly', amberegg: 'amberchunk', vertebra: 'vertebra' }[id] || 'fossil';
      return iconCanvas(ic, 1);
    }
  } catch { /* fall through */ }
  return null;
}
const MODE = ['shadow', 'sketch', 'plate', 'plate'];

/** The engraved picture of an entry, scaled to fit w x h by a whole number. */
function plateArt(tab, def, id, lvl, w, h, maxK = tab === 'relic' ? 6 : 4, force = true) {
  const src = rawArt(tab, def, id, force);
  if (src === undefined) return undefined;
  if (!src) return null;
  let k = Math.floor(Math.min((w - 2) / src.width, (h - 2) / src.height));
  k = clamp(k, 1, lvl === 0 ? Math.min(3, maxK) : maxK);
  return engrave(src, k, MODE[lvl] || 'shadow', `${tab}:${id}`);
}

/** A thumbnail: the art shrunk to fit and engraved at that size. */
const thumbs = new Map();
function thumbArt(tab, def, id, lvl, s) {
  const key = `${tab}:${id}:${lvl}:${s}`;
  let cv = thumbs.get(key);
  if (cv) return cv;
  const src = rawArt(tab, def, id);
  if (src === undefined) return undefined;
  if (!src) return null;
  const k = Math.min(1, (s - 2) / src.width, (s - 2) / src.height);
  let small = src;
  if (k < 1) {
    small = makeCanvas(Math.max(2, Math.round(src.width * k)), Math.max(2, Math.round(src.height * k)));
    const g = small.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(src, 0, 0, small.width, small.height);
  }
  cv = engrave(small, k < 1 ? 1 : Math.max(1, Math.floor((s - 2) / Math.max(src.width, src.height))), MODE[lvl] || 'shadow', `t:${key}`);
  thumbs.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// type-setting helpers

function T(g, s, x, y, o = {}) { return drawText(g, s, x, y, { color: o.color || INK, align: o.align, scale: o.scale }); }

/** A wrapped paragraph, stopping at maxY. Returns the y under it. */
function para(g, s, x, y, w, o = {}) {
  const lh = o.lh || LINE_H;
  let lines = wrapText(s, w);
  const room = o.maxY ? Math.max(0, Math.floor((o.maxY - y) / lh)) : lines.length;
  if (lines.length > room) {
    lines = lines.slice(0, room);
    if (lines.length) lines[lines.length - 1] = ellipsize(lines[lines.length - 1] + '...', w);
  }
  const indent = o.indent || 0;
  lines.forEach((l, n) => drawText(g, l, x + (n < (o.indentLines || 0) ? indent : 0), y + n * lh,
    { color: o.color || INK, align: o.align }));
  return y + lines.length * lh;
}
/** A paragraph opening with a red initial, its first two lines set beside it. */
function dropPara(g, text, x, y, w, o = {}) {
  initial(g, text[0], x, y);
  const words = text.slice(1).split(' ');
  const beside = [];
  let line = '';
  while (words.length && beside.length < 2) {
    const test = line ? line + ' ' + words[0] : words[0];
    if (textWidth(test) > w - 23 && line) { beside.push(line); line = ''; } else { line = test; words.shift(); }
  }
  if (line && beside.length < 2) { beside.push(line); line = ''; }
  beside.forEach((l, n) => drawText(g, l, x + 23, y + 2 + n * LINE_H, { color: o.color || INK }));
  const after = (line ? line + ' ' : '') + words.join(' ');
  const yy = y + 2 + beside.length * LINE_H;
  return after.trim() ? para(g, after, x, Math.max(yy, y + 21), w, o) : Math.max(yy, y + 21);
}
const paraH = (s, w, lh = LINE_H) => wrapText(s, w).length * lh;

/** A labelled line of the data table: small caps on the left, the value wrapped beside it. */
function field(g, label, value, x, y, w, o = {}) {
  const lw = o.lw || 46;
  drawText(g, label, x, y, { color: RUBRIC });
  const lines = wrapText(String(value), w - lw);
  const maxL = o.maxLines || 3;
  lines.slice(0, maxL).forEach((l, n) => drawText(g, l, x + lw, y + n * LINE_H, { color: o.color || INK }));
  // a dotted leader under the label, the way old tables are ruled
  g.fillStyle = 'rgba(90,64,38,0.22)';
  for (let k = x; k < x + w; k += 2) g.fillRect(k, y + Math.min(lines.length, maxL) * LINE_H - 1, 1, 1);
  return y + Math.min(lines.length, maxL) * LINE_H + 2;
}
const fieldH = (value, w, lw = 46, maxL = 3) => Math.min(wrapText(String(value), w - lw).length, maxL) * LINE_H + 2;

function stars(g, n, of, x, y) { for (let k = 0; k < of; k++) star(g, x + k * 8, y, k < n, true); }

function check(g, x, y, on) {
  g.fillStyle = INK2; g.fillRect(x, y, 7, 1); g.fillRect(x, y + 6, 7, 1); g.fillRect(x, y, 1, 7); g.fillRect(x + 6, y, 1, 7);
  if (on) {
    g.fillStyle = HAND;
    g.fillRect(x + 1, y + 3, 1, 2); g.fillRect(x + 2, y + 4, 1, 2); g.fillRect(x + 3, y + 3, 1, 2);
    g.fillRect(x + 4, y + 1, 1, 2); g.fillRect(x + 5, y, 1, 2); g.fillRect(x + 6, y - 1, 1, 2);
  }
}

// ---------------------------------------------------------------------------
// what is known about an entry

function biomesWith(list, id) {
  return BIOMES.filter((b) => (b[list] || []).includes(id)).map((b) => b.name.replace(/^The /, ''));
}

function creatureFacts(def, lvl, game) {
  const x = CREATURE_TEXT[def.id] || {};
  const tier = def.tier ?? 0;
  const obs = game?.research?.[def.id] || 0;
  const notesN = OBSERVE_STEPS.filter((s) => obs >= s).length;
  return {
    sub: def.sci, cls: `${(def.clade || '').replace(/^./, (c) => c.toUpperCase())}${def.flies ? ', flying' : ''}`,
    tier, rarity: RARITY[Math.min(4, tier)],
    where: x.where || biomesWith('fauna', def.id).join(', ') || 'Unrecorded.',
    active: x.active || (def.night ? 'Night' : 'Day'),
    diet: x.diet || 'Unrecorded.', size: x.size || '-', behave: x.behave || '',
    margin: x.margin || '', notes: def.notes || [], notesN,
    nature: def.boss ? 'Territorial. Lethal.' : def.hostile ? 'Hostile. Will attack.' : 'Wary. Can be tamed.',
    gene: def.gene ? (GENE_BY_ID[def.gene]?.name || def.gene) : null,
  };
}

// ---------------------------------------------------------------------------
// the pages themselves

/**
 * Bake one page. Returns { cv, hits, partial }. `hits` are click targets in
 * page coordinates, each { x, y, w, h, act, tip }.
 */
function bakePage(P, side, pw, ph, game) {
  const cv = makeCanvas(pw, ph);
  const g = cv.getContext('2d');
  const hits = [];
  const ctx = { g, side, w: pw, h: ph, hits, game, book: game.book, partial: false };
  // the gutter side has the wider margin
  ctx.x0 = side === 'left' ? 13 : side === 'right' ? 18 : 16;
  ctx.x1 = side === 'left' ? pw - 18 : pw - 13;
  ctx.cw = ctx.x1 - ctx.x0;
  ctx.y0 = 24;
  ctx.y1 = ph - 20;
  if (P.kind === 'endpaper') {
    g.drawImage(marbled(pw, ph, P.front ? 7 : 19), 0, 0);
    // the gutter shades the marbling too
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(10,8,14,${(0.42 * (1 - k / 14)).toFixed(3)})`;
      g.fillRect(side === 'left' ? pw - 1 - k : k, 0, 1, ph);
    }
    if (P.front) bookplate(ctx);
    return { cv, hits, partial: false };
  }
  g.drawImage(paperSheet(pw, ph, side === 'single' ? 'right' : side, P.idx * 7 + 3), 0, 0);
  // the running head and the folio
  const head = P.tab ? BOOK_TAB_BY_ID[P.tab].name : 'THE BOOK OF THE OLD SEA';
  if (P.kind !== 'title' && P.kind !== 'opener') {
    T(g, head, Math.round((ctx.x0 + ctx.x1) / 2), 9, { color: INK2, align: 'center' });
    g.fillStyle = 'rgba(70,48,26,0.4)';
    g.fillRect(ctx.x0, 18, ctx.cw, 1);
  }
  if (P.num) {
    const fx = side === 'left' ? ctx.x0 : ctx.x1;
    T(g, P.num, fx, ph - 14, { color: INK2, align: side === 'left' ? 'left' : 'right' });
    const ox = side === 'left' ? ctx.x0 + textWidth(P.num) + 4 : ctx.x1 - textWidth(P.num) - 10;
    g.fillStyle = 'rgba(70,48,26,0.35)';
    g.fillRect(ox, ph - 11, 6, 1);
  }
  switch (P.kind) {
    case 'title': titlePage(ctx); break;
    case 'guide': guidePage(ctx); break;
    case 'contents': contentsPage(ctx); break;
    case 'opener': openerPage(ctx, P); break;
    case 'index': indexPage(ctx, P); break;
    case 'plate': platePage(ctx, P); break;
    case 'text': textPage(ctx, P); break;
    case 'colophon': colophonPage(ctx); break;
    default: break;
  }
  return { cv, hits, partial: ctx.partial };
}

function bookplate(c) {
  const { g, w, h } = c;
  const bw = Math.min(w - 36, 176), bh = 92;
  const x = Math.round((w - bw) / 2 - (c.side === 'left' ? 4 : 0)), y = Math.round(h * 0.36);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 2, y + 2, bw, bh);
  g.drawImage(paperSheet(bw, bh, 'single', 5), x, y);
  plateFrame(g, x + 4, y + 4, bw - 8, bh - 8);
  T(g, 'EX LIBRIS', x + bw / 2, y + 12, { align: 'center', color: RUBRIC });
  orRule(g, x + 16, y + 24, bw - 32);
  T(g, 'DR. VESS', x + bw / 2, y + 32, { align: 'center', scale: 2 });
  T(g, 'naturalist, wandering', x + bw / 2, y + 50, { align: 'center', color: INK2 });
  handText(g, 'If found, return to the crab.', x + 12, y + 66, bw - 24, { color: HAND });
}

function titlePage(c) {
  const { g, x0, x1, cw, h, book } = c;
  const cx = Math.round((x0 + x1) / 2);
  let y = 26;
  T(g, 'THE BOOK', cx, y, { align: 'center', scale: 2 }); y += 18;
  T(g, 'OF THE', cx, y, { align: 'center', color: INK2 }); y += 11;
  T(g, 'OLD SEA', cx, y, { align: 'center', scale: 2, color: RUBRIC }); y += 20;
  orRule(g, x0 + 10, y, cw - 20); y += 8;
  y = para(g, 'Being a field encyclopedia of the creatures, plants, fishes, fossils and minerals of the basin, and of what became of the sea.', cx, y, cw - 8, { align: 'center', color: INK2 });
  // the frontispiece: an ammonite, engraved
  const fh = Math.min(96, h - y - 90);
  if (fh > 30) {
    const R = Math.min(fh * 0.42, cw * 0.3);
    ammoniteStamp(g, cx, Math.round(y + 6 + fh / 2), R, ['#7a5a34', '#5a4026', '#2e1d10', '#2e1d10', '#2e1d10'], 'rgba(90,64,38,0.35)');
    y += fh + 6;
  }
  T(g, 'by DR. VESS', cx, y, { align: 'center' }); y += 10;
  T(g, 'compiled in the field', cx, y, { align: 'center', color: INK2 }); y += 16;
  const tot = book.total;
  handText(g, `${tot.have} of ${tot.total} pages written so far.`, x0 + 6, Math.min(y, h - 46), cw - 12);
  T(g, 'VOLUME THE FIRST', cx, h - 30, { align: 'center', color: INK2 });
}

function guidePage(c) {
  const { g, x0, cw, y1 } = c;
  let y = 26;
  T(g, 'HOW TO READ THIS BOOK', x0, y); y += 12;
  y = para(g, 'Every living thing in the basin has a page, and every page fills in by stages, as the thing itself is found, studied and kept.', x0, y, cw, { color: INK2 }) + 6;
  const rows = [
    ['shadow', 'Not yet found. A pencilled shadow, from the rumours.'],
    ['sketch', 'Seen. A field sketch, in ink, and its name.'],
    ['plate', 'Studied. The tinted plate and the full entry.'],
    ['seal', 'Mastered: tamed, grown, caught or hatched. Sealed.'],
  ];
  const src = rawArt('creature', FAUNA_BY_ID.duneskink, 'duneskink', true);
  for (const [mode, text] of rows) {
    const bx = x0, by = y;
    g.fillStyle = 'rgba(120,90,50,0.1)'; g.fillRect(bx, by, 34, 22);
    plateFrame(g, bx, by, 34, 22);
    if (src) {
      const art = thumbArt('creature', FAUNA_BY_ID.duneskink, 'duneskink', mode === 'shadow' ? 0 : mode === 'sketch' ? 1 : 2, 28);
      if (art === undefined) c.partial = true;
      if (art) g.drawImage(art, Math.round(bx + 17 - art.width / 2), Math.round(by + 11 - art.height / 2));
    }
    if (mode === 'seal') waxSeal(g, bx + 30, by + 4, 5);
    para(g, text, bx + 40, by + 3, cw - 40, { color: INK });
    y += 28;
  }
  y += 2;
  orRule(g, x0 + 20, y, cw - 40); y += 9;
  T(g, 'TURNING THE PAGES', x0, y); y += 11;
  y = para(g, 'Q and E, the arrow keys, the wheel, or take hold of a corner and drag the leaf over. The leather tabs on the fore-edge open each chapter. J or Esc shuts the book.', x0, y, cw, { color: INK2, maxY: y1 - 30 }) + 6;
  if (y < y1 - 24) handText(g, 'Every page you fill feeds the crab. Every chapter you finish, a great deal more.', x0, y, cw, { maxLines: 3 });
}

function contentsPage(c) {
  const { g, x0, x1, cw, hits, book, y1 } = c;
  let y = 26;
  T(g, 'CONTENTS', Math.round((x0 + x1) / 2), y, { align: 'center', scale: 2 }); y += 20;
  orRule(g, x0 + 20, y, cw - 40); y += 10;
  const P = buildPages();
  const row = (label, num, sub, act, prog) => {
    const ry = y;
    T(g, label, x0, y);
    const nw = textWidth(num);
    T(g, num, x1, y, { align: 'right' });
    g.fillStyle = 'rgba(70,48,26,0.45)';
    for (let k = x0 + textWidth(label) + 4; k < x1 - nw - 4; k += 3) g.fillRect(k, y + 6, 1, 1);
    y += 10;
    if (sub) { T(g, sub, x0 + 8, y, { color: INK2 }); y += 9; }
    if (prog) {
      const bw = cw - 8;
      g.fillStyle = 'rgba(90,64,38,0.25)'; g.fillRect(x0 + 8, y, bw - 8, 2);
      g.fillStyle = GOLD[2]; g.fillRect(x0 + 8, y, Math.round((bw - 8) * prog.f), 2);
      g.fillStyle = GOLD[1]; g.fillRect(x0 + 8, y, Math.round((bw - 8) * prog.f), 1);
      y += 6;
    }
    hits.push({ x: x0 - 2, y: ry - 2, w: cw + 4, h: y - ry + 1, act });
    y += 4;
  };
  row('How to read this book', 'ii', null, { go: 2 });
  BOOK_TABS.forEach((t, n) => {
    const oi = openerOf(t.id);
    const pr = book.progress(t.id);
    const sub = `${pr.have} of ${pr.total} written${pr.mastered ? `, ${pr.mastered} mastered` : ''}${book.claimed.has(t.id) ? ' - complete' : ''}`;
    row(`${roman(n + 1)}.  ${CHAPTER_TEXT[t.id].title}`, P[oi].num, y < y1 - 60 ? sub : null, { go: oi }, { f: pr.total ? pr.have / pr.total : 0 });
  });
  const col = P.find((p) => p.kind === 'colophon');
  row('Colophon', col.num, null, { go: col.idx });
}

function openerPage(c, P) {
  const { g, x0, x1, cw, hits, book, y1 } = c;
  const tab = BOOK_TAB_BY_ID[P.tab];
  const ct = CHAPTER_TEXT[P.tab];
  const cx = Math.round((x0 + x1) / 2);
  let y = 22;
  T(g, `CHAPTER ${roman(P.ci + 1)}`, cx, y, { align: 'center', color: RUBRIC }); y += 12;
  const big = textWidth(ct.title, 2) <= cw;
  T(g, ct.title, cx, y, { align: 'center', scale: big ? 2 : 1 }); y += big ? 18 : 11;
  orRule(g, x0 + 16, y, cw - 32); y += 8;
  // the vignette: the chapter's first few entries, sketched where they are known
  const all = chapterPages(P.tab);
  const vh = Math.min(70, Math.round(c.h * 0.24));
  const known = all.filter((e) => book.get(P.tab, e.id) >= 1);
  const picks = [...known, ...all.filter((e) => !known.includes(e))].slice(0, 3);
  const slotW = Math.floor(cw / picks.length);
  picks.forEach((e, n) => {
    const lvl = Math.min(1, book.get(P.tab, e.id));
    const art = plateArt(P.tab, e.def, e.id, lvl, slotW - 4, vh - 6, 3, false);
    if (art === undefined) c.partial = true;
    if (art) g.drawImage(art, Math.round(x0 + n * slotW + (slotW - art.width) / 2), Math.round(y + vh - 4 - art.height));
  });
  g.fillStyle = 'rgba(70,48,26,0.5)';
  g.fillRect(x0 + 6, y + vh - 3, cw - 12, 1);
  y += vh + 6;
  // the opening paragraph, with a red initial
  y = dropPara(g, ct.intro, x0, y, cw, { maxY: y1 - 44 });
  y += 5;
  y = handText(g, ct.hand, x0 + 4, y, cw - 8, { maxLines: 2 });
  // the reward, at the foot of the page
  const fy = y1 - 30;
  g.fillStyle = 'rgba(70,48,26,0.4)'; g.fillRect(x0, fy - 4, cw, 1);
  const pr = book.progress(P.tab);
  if (book.canClaim(P.tab)) {
    const bw = Math.min(cw, 120), bx = Math.round(cx - bw / 2);
    K.button(g, bx, fy + 2, bw, 18, `CLAIM +${tab.reward}`, { tint: '#5eaa3a' });
    hits.push({ x: bx, y: fy + 2, w: bw, h: 18, act: { claim: P.tab } });
  } else if (book.claimed.has(P.tab)) {
    waxSeal(g, x0 + 10, fy + 11, 8);
    T(g, 'CHAPTER COMPLETE', x0 + 24, fy + 3, { color: '#3e5e1e' });
    T(g, `${tab.reward} growth paid`, x0 + 24, fy + 13, { color: INK2 });
  } else {
    drawIcon(g, 'growth', x0 + 7, fy + 10, 1);
    T(g, `Fill every page: +${tab.reward}`, x0 + 18, fy + 3);
    T(g, `${pr.have} of ${pr.total} so far`, x0 + 18, fy + 13, { color: INK2 });
  }
}

function indexPage(c, P) {
  const { g, x0, x1, cw, hits, book, y1 } = c;
  let y = 26;
  T(g, `INDEX OF ${BOOK_TAB_BY_ID[P.tab].name}`, x0, y);
  const pr = book.progress(P.tab);
  T(g, `${pr.have}/${pr.total}`, x1, y, { align: 'right', color: INK2 });
  y += 12;
  const all = chapterPages(P.tab);
  const PG = buildPages();
  const S = 26, gap = 3, lab = 8;
  const cols = Math.max(3, Math.floor((cw + gap) / (S + gap)));
  const gx0 = x0 + Math.round((cw - (cols * (S + gap) - gap)) / 2);
  const fresh = book.fresh || [];
  all.forEach((e, n) => {
    const cx = gx0 + (n % cols) * (S + gap);
    const cy = y + Math.floor(n / cols) * (S + gap + lab);
    if (cy + S > y1 - 22) return;
    const lvl = book.get(P.tab, e.id);
    g.fillStyle = lvl >= 2 ? 'rgba(255,250,230,0.5)' : 'rgba(120,90,50,0.08)';
    g.fillRect(cx, cy, S, S);
    plateFrame(g, cx, cy, S, S);
    const art = thumbArt(P.tab, e.def, e.id, lvl, S - 4);
    if (art === undefined) c.partial = true;
    if (art) g.drawImage(art, Math.round(cx + S / 2 - art.width / 2), Math.round(cy + S / 2 - art.height / 2));
    if (lvl === 0) T(g, '?', cx + S / 2, cy + S / 2 - 3, { align: 'center', color: 'rgba(70,48,26,0.5)' });
    if (lvl >= 3) waxSeal(g, cx + S - 3, cy + 3, 3);
    const pi = plateOf(P.tab, e.id);
    T(g, PG[pi].num, cx + S / 2, cy + S + 1, { align: 'center', color: INK2 });
    if (fresh.some((f) => f.tab === P.tab && f.id === e.id)) {
      g.fillStyle = RUBRIC; g.fillRect(cx - 1, cy - 1, 4, 4);
      g.fillStyle = '#e05a3a'; g.fillRect(cx, cy, 2, 2);
    }
    hits.push({ x: cx, y: cy, w: S, h: S + lab, act: { go: pi }, tip: lvl >= 1 ? e.name : '???' });
  });
  const rows = Math.ceil(all.length / cols);
  y += rows * (S + gap + lab) + 2;
  if (y < y1 - 26) {
    orRule(g, x0 + 20, y, cw - 40); y += 8;
    const seen = all.filter((e) => book.get(P.tab, e.id) >= 1).length;
    para(g, `${seen} found, ${pr.have} studied, ${pr.mastered} mastered. Touch an entry to turn to it.`, x0, y, cw, { color: INK2, maxY: y1 - 4 });
  }
}

/** The plate: the picture, its caption, and Vess's notes under it. */
function platePage(c, P) {
  const { g, x0, x1, cw, book, game, y1 } = c;
  const lvl = book.get(P.tab, P.id);
  const e = P.entry;
  const cx = Math.round((x0 + x1) / 2);
  let y = 25;
  T(g, `PLATE ${roman(P.plate)}`, cx, y, { align: 'center', color: RUBRIC }); y += 11;
  const fh = P.tab === 'creature' ? Math.min(Math.round(c.h * 0.36), 120) : Math.min(Math.round(c.h * 0.48), 156);
  const fx = x0, fw = cw;
  // the plate's ground: a faint wash, and a horizon for things that stand
  g.fillStyle = 'rgba(255,248,226,0.55)';
  g.fillRect(fx + 3, y + 3, fw - 6, fh - 6);
  plateFrame(g, fx, y, fw, fh);
  const art = plateArt(P.tab, e.def, P.id, lvl, fw - 14, fh - 20);
  const ground = P.tab === 'creature' || P.tab === 'plant' || P.tab === 'mineral';
  if (art) {
    const ax = Math.round(fx + (fw - art.width) / 2);
    const flying = P.tab === 'creature' && e.def?.flies;
    const ay = ground && !flying ? Math.round(y + fh - 10 - art.height) : Math.round(y + (fh - art.height) / 2);
    // an engraver's sky: ruled lines that thin out toward the ground
    g.fillStyle = 'rgba(70,48,26,0.16)';
    for (let ly = y + 5, n = 0; ly < y + fh * 0.55; ly += 2 + Math.floor(n / 4), n++) {
      for (let q = fx + 5; q < fx + fw - 5; q++) if ((q + n * 3) % (n > 8 ? 3 : 1) === 0) g.fillRect(q, ly, 1, 1);
    }
    if (ground) {
      // the ground it stands on, as engravers draw it: a hatched shadow, a stroke and some tufts
      const gy = y + fh - 9;
      if (!flying) {
        const sw2 = Math.round(art.width * 0.42);
        for (let q = -sw2; q <= sw2; q++) {
          const hh = Math.round(2.2 * Math.sqrt(1 - (q / sw2) ** 2));
          for (let r = 0; r < hh; r++) if ((q + r) % 2 === 0) { g.fillStyle = 'rgba(46,29,16,0.45)'; g.fillRect(Math.round(fx + fw / 2 + q), gy - r, 1, 1); }
        }
      }
      g.fillStyle = 'rgba(70,48,26,0.6)';
      g.fillRect(fx + 8, gy, fw - 16, 1);
      for (let k = fx + 12; k < fx + fw - 12; k += 7 + (k % 5)) {
        g.fillRect(k, gy + 2, 3, 1);
        if (k % 3 === 0) g.fillRect(k + 1, gy - 1, 1, 1);
      }
    }
    if (P.tab === 'fish') {
      g.fillStyle = 'rgba(31,74,102,0.35)';
      for (let k = 0; k < 4; k++) {
        const wy = y + 10 + k * Math.round((fh - 20) / 3);
        for (let q = fx + 8; q < fx + fw - 8; q++) if (Math.sin(q * 0.35 + k) > 0.6) g.fillRect(q, wy + Math.round(Math.sin(q * 0.2 + k * 2)), 1, 1);
      }
    }
    g.drawImage(art, ax, ay);
    if (lvl === 0) T(g, '?', cx, y + fh / 2 - 7, { align: 'center', scale: 2, color: 'rgba(70,48,26,0.55)' });
  } else c.partial = true;
  if (lvl >= 3) waxSeal(g, fx + fw - 12, y + 12, 9);
  y += fh + 6;
  // the caption
  const name = lvl >= 1 ? e.name : 'Unidentified';
  T(g, ellipsize(name.toUpperCase(), cw), cx, y, { align: 'center' }); y += 10;
  const sub = P.tab === 'creature' ? e.def.sci : P.tab === 'fish' ? e.def.latin : P.tab === 'plant' ? (PLANT_TEXT[P.id]?.habit || '') : P.tab === 'relic' ? (RELIC_TEXT[P.id]?.age || '') : (MINERAL_TEXT[P.id]?.host || '');
  if (lvl >= 1 && sub) {
    const sw = textWidth(sub) + 3;
    handText(g, sub, Math.round(cx - sw / 2), y, sw + 4, { color: INK2 });
    y += 10;
  } else y += 2;
  const stage = ['From the rumours only', 'Sketched in the field', 'Drawn from life', 'Drawn from life; kept'][lvl];
  T(g, stage, cx, y, { align: 'center', color: INK3 }); y += 12;
  orRule(g, x0 + 24, y, cw - 48); y += 8;
  // what Vess wrote under it
  if (P.tab === 'creature') {
    const f = creatureFacts(e.def, lvl, game);
    T(g, 'FIELD NOTES', x0, y, { color: RUBRIC });
    T(g, `${f.notesN}/${f.notes.length}`, x1, y, { align: 'right', color: INK2 });
    y += 11;
    for (let n = 0; n < f.notes.length; n++) {
      if (y > y1 - 10) break;
      if (n < f.notesN && lvl >= 2) {
        T(g, `${n + 1}.`, x0, y, { color: HAND_SOFT });
        const room = Math.max(1, Math.floor((y1 - y) / 9));
        y = handText(g, f.notes[n], x0 + 12, y, cw - 12, { maxLines: Math.min(4, room) }) + 2;
      } else {
        // a note not written yet: a ruled line to write it on
        T(g, `${n + 1}.`, x0, y, { color: 'rgba(41,54,92,0.3)' });
        g.fillStyle = 'rgba(41,54,92,0.18)';
        for (let k = x0 + 12; k < x1; k += 2) g.fillRect(k, y + 6, 1, 1);
        y += 11;
      }
    }
    if (lvl >= 1 && f.notesN < f.notes.length && y < y1 - 8) {
      handText(g, 'Stand with me and watch it. I write as I see.', x0, y + 2, cw, { color: HAND_SOFT, maxLines: 2 });
    }
  } else {
    const t = { plant: PLANT_TEXT, fish: FISH_TEXT, relic: RELIC_TEXT, mineral: MINERAL_TEXT }[P.tab]?.[P.id] || {};
    T(g, 'IN THE MARGIN', x0, y, { color: RUBRIC }); y += 11;
    if (lvl >= 2 && t.margin) y = handText(g, t.margin, x0 + 4, y, cw - 8, { maxLines: 4 }) + 4;
    else if (lvl >= 1) y = handText(g, 'Seen. Not yet studied - more when I have looked properly.', x0 + 4, y, cw - 8, { color: HAND_SOFT, maxLines: 3 }) + 4;
    else y = handText(g, 'Nothing yet. I have heard of it. That is all.', x0 + 4, y, cw - 8, { color: HAND_SOFT, maxLines: 2 }) + 4;
    // and a few more lines of what the thing is good for, in print
    if (lvl >= 2 && y < y1 - 20) {
      const extra = P.tab === 'plant' ? e.def.boonText : P.tab === 'fish' ? (FISH_TEXT[P.id]?.how || '') : P.tab === 'relic' ? relicHatchLine(e.def, book) : mineralUseLine(P.id);
      if (extra) para(g, extra, x0, y + 2, cw, { color: INK2, maxY: y1 });
    }
  }
}

function relicHatchLine(def, book) {
  const h = FAUNA_BY_ID[def.hatch];
  if (!h) return '';
  const known = book.get('creature', h.id) >= 1;
  return `Kept warm in the basin for ${def.incubate} seconds, it hatches into ${known ? 'a ' + h.name : 'something not yet in this book'}.`;
}

function mineralUseLine(id) {
  const outs = RECIPES.filter((r) => r.need.some(([n]) => n === id)).map((r) => ITEM_BY_ID[r.out[0]]?.name || r.out[0]);
  return outs.length ? `Worked into: ${[...new Set(outs)].join(', ')}.` : '';
}

/** The entry: everything known, as a field guide sets it out. */
function textPage(c, P) {
  const { g, x0, x1, cw, book, game, y1 } = c;
  const lvl = book.get(P.tab, P.id);
  const e = P.entry, def = e.def;
  const tab = BOOK_TAB_BY_ID[P.tab];
  let y = 25;
  const name = lvl >= 1 ? e.name : '???';
  const big = textWidth(name.toUpperCase(), 2) <= cw;
  T(g, name.toUpperCase(), x0, y, { scale: big ? 2 : 1 }); y += big ? 17 : 10;
  // the stars of rarity sit at the right of the name line
  const rar = P.tab === 'fish' ? (def.rarity || 1) : (def.tier ?? 0) + 1;
  // the descriptive paragraph
  const facts = P.tab === 'creature' ? creatureFacts(def, lvl, game) : null;
  const cls = P.tab === 'creature' ? (lvl >= 1 ? `${facts.cls} - ${facts.sub}` : 'Unknown')
    : P.tab === 'plant' ? (PLANT_TEXT[P.id]?.habit || def.arch)
      : P.tab === 'fish' ? (lvl >= 1 ? def.latin : 'Unknown')
        : P.tab === 'relic' ? (def.kind === 'amber' ? 'Amber' : 'Fossil') : 'Mineral';
  T(g, ellipsize(cls, cw - 40), x0, y, { color: INK2 });
  stars(g, lvl >= 1 ? rar : 0, 5, x1 - 39, y - 1);
  y += 10;
  g.fillStyle = 'rgba(70,48,26,0.5)'; g.fillRect(x0, y, cw, 1); y += 5;
  const desc = lvl >= 2 ? e.desc : lvl === 1 ? 'Seen, and sketched, but not yet properly studied. The full account will follow.' : 'Not yet found. What is written here is rumour, and rumour is not science.';
  if (lvl >= 2 && desc) y = dropPara(g, desc, x0, y, cw, { maxY: y1 - 80 }) + 2;
  else y = para(g, desc, x0, y, cw, { color: INK2 }) + 2;
  y += 3;
  // the table
  const rows = factRows(P, lvl, game, facts);
  const q = '?';
  for (const [label, val, keep] of rows) {
    const v = val == null ? q : val;
    const h = fieldH(v, cw, 46, keep ? 4 : 3);
    if (y + h > y1 - 40 && !keep) continue;
    if (y + h > y1 - 30) break;
    y = field(g, label, v, x0, y, cw, { maxLines: keep ? 4 : 3 });
  }
  // what is left of the page: an aside in his hand, or the company it keeps
  const room = (y1 - 36) - y;
  if (lvl >= 2 && P.tab === 'creature' && facts.margin && room > 20) {
    y = handText(g, facts.margin, x0 + 6, y + 4, cw - 10, { maxLines: Math.floor((room - 4) / 9) });
  } else if (lvl >= 2 && (P.tab === 'plant' || P.tab === 'relic') && room > 36) {
    const ids = P.tab === 'plant' ? (def.attracts || []) : [def.hatch].filter(Boolean);
    T(g, P.tab === 'plant' ? 'VISITORS' : 'HATCHLING', x0, y + 4, { color: RUBRIC });
    let tx = x0 + 52;
    for (const id of ids) {
      const f = FAUNA_BY_ID[id];
      if (!f || tx + 24 > x1) continue;
      const fl = book.get('creature', id);
      const show = P.tab === 'relic' && lvl < 3 ? 0 : fl;
      plateFrame(g, tx, y + 2, 24, 24);
      const art = thumbArt('creature', f, id, Math.min(2, show), 20);
      if (art === undefined) c.partial = true;
      if (art) g.drawImage(art, Math.round(tx + 12 - art.width / 2), Math.round(y + 14 - art.height / 2));
      c.hits.push({ x: tx, y: y + 2, w: 24, h: 24, act: { go: plateOf('creature', id) }, tip: show >= 1 ? f.name : '???' });
      tx += 28;
    }
    y += 30;
  }
  // the how-to: a checklist of what fills the page
  const fy = Math.max(y + 4, y1 - 32);
  if (fy + 30 <= y1 + 2) {
    g.fillStyle = 'rgba(70,48,26,0.4)'; g.fillRect(x0, fy - 3, cw, 1);
    let cy = fy + 1;
    const steps = tab.how.map((s, n) => [s, n]).filter(([s]) => s && s !== '-');
    const lw = Math.floor(cw / 1);
    for (const [s, n] of steps) {
      check(g, x0, cy, lvl > n);
      T(g, ellipsize(s, lw - 12), x0 + 11, cy, { color: lvl > n ? INK2 : INK });
      cy += 9;
    }
  }
}

/** The data table for an entry, as [label, value, keep]. A null value is shown as '?'. */
function factRows(P, lvl, game, f) {
  const def = P.entry.def;
  const k1 = lvl >= 1, k2 = lvl >= 2;
  switch (P.tab) {
    case 'creature': {
      const tame = def.hostile ? (def.boss ? 'Cannot be tamed. Avoid, or fight it with everything.' : 'Cannot be tamed. Beaten, it leaves a fruit and 4 growth.')
        : def.tame ? `${def.tame.berries} fruit and ${def.tame.water} water, offered by Vess. Joins as ${def.role}: ${def.ability || ''}` : 'Unknown.';
      return [
        ['HABITAT', f.where, true],
        ['ACTIVE', k1 ? f.active : null],
        ['SIZE', k1 ? f.size : null],
        ['DIET', k2 ? f.diet : null],
        ['NATURE', k2 ? f.nature : null],
        ['HABITS', k2 ? f.behave : null],
        [def.hostile ? 'DANGER' : 'TO TAME', k2 ? tame : null, true],
        ['GENE', k2 && f.gene ? f.gene : null],
      ];
    }
    case 'plant': {
      const t = PLANT_TEXT[P.id] || {};
      const where = t.where || biomesWith('plants', P.id).join(', ') || 'Unrecorded.';
      const ripe = `${def.ripen}s${def.needs ? ', ' + NEEDS_TEXT[def.needs] : ''}`;
      const attracts = (def.attracts || []).map((id) => FAUNA_BY_ID[id]?.name).filter(Boolean).join(', ');
      const plant = def.hands?.by === 'tool' ? 'Vess plants it, with a tool.' : def.hands?.by === 'digger' ? 'Needs a digger on your back.' : def.hands ? 'Vess plants it by hand.' : 'You can plant it yourself.';
      return [
        ['HABITAT', where, true],
        ['HEIGHT', k1 ? `${Math.round(def.h * 2.5)} cm` : null],
        ['LIFE', k1 ? (isAnnual(def) ? 'Annual: one crop, then gone.' : 'Perennial.') : null],
        ['RIPENS', k2 ? ripe : null],
        ['YIELD', k2 ? `${def.pay} growth a pick` : null],
        ['WATER', k2 ? `${def.cost} to plant` : null],
        ['GENE', k2 ? (GENE_BY_ID[def.gene]?.name || def.gene) : null],
        ['DRAWS', k2 && attracts ? attracts : null],
        ['SOWING', k2 ? plant : null, true],
      ];
    }
    case 'fish': {
      const t = FISH_TEXT[P.id] || {};
      const caught = game.book.count.fish?.[P.id] || 0;
      const water = def.where === 'oasis' ? 'Oasis pools' : def.where === 'sea' ? 'The open sea, west' : 'The deep sea, west';
      return [
        ['WATERS', water, true],
        ['LENGTH', k2 ? t.size || `${def.cm[0]}-${def.cm[1]} cm` : null],
        ['HABITS', k2 ? `${def.school ? 'Schools' : 'Solitary'}; ${def.wary > 0.6 ? 'very wary' : def.wary > 0.35 ? 'wary' : 'bold'}.` : null],
        ['WORTH', k2 ? `${def.value} growth` : null],
        ['CAUGHT', String(caught)],
        ['CATCH', t.how || null, true],
      ];
    }
    case 'relic': {
      const t = RELIC_TEXT[P.id] || {};
      const h = FAUNA_BY_ID[def.hatch];
      return [
        ['KIND', def.kind === 'amber' ? 'Amber' : 'Fossil', true],
        ['FOUND', t.where || null, true],
        ['AGE', k2 ? t.age : null],
        ['WARMING', k2 ? `${def.incubate} seconds in the basin` : null],
        ['HATCHES', lvl >= 3 && h ? h.name : k2 ? 'Something. Keep it warm.' : null],
      ];
    }
    default: {
      const t = MINERAL_TEXT[P.id] || {};
      const o = ORES.find((q) => q.id === P.id) || {};
      const mined = game.book.count.mineral?.[P.id] || 0;
      const outs = RECIPES.filter((r) => r.need.some(([n]) => n === P.id)).map((r) => ITEM_BY_ID[r.out[0]]?.name || r.out[0]);
      return [
        ['FOUND', t.where || null, true],
        ['HOST', t.host || null],
        ['DEPTH', o.depth ? `${o.depth[0]}-${o.depth[1]} under the sand` : null],
        ['STRIKES', o.hits ? `${o.hits}${o.need ? '; needs a copper pick' : ''}` : null],
        ['MAKES', k2 && outs.length ? [...new Set(outs)].join(', ') : null],
        ['MINED', String(mined)],
      ];
    }
  }
}

function colophonPage(c) {
  const { g, x0, x1, cw, book, y1 } = c;
  const cx = Math.round((x0 + x1) / 2);
  let y = 30;
  T(g, 'COLOPHON', cx, y, { align: 'center', scale: 2 }); y += 20;
  orRule(g, x0 + 20, y, cw - 40); y += 10;
  y = para(g, 'Written by lamplight on the back of a walking crab, in iron ink that the heat turns blue. The plates were drawn from life wherever life would hold still, and from memory where it would not.', cx, y, cw - 6, { align: 'center', color: INK2 }) + 10;
  const tot = book.total;
  T(g, `${Math.round(tot.f * 100)}%`, cx, y, { align: 'center', scale: 2, color: RUBRIC }); y += 18;
  T(g, `${tot.have} of ${tot.total} pages`, cx, y, { align: 'center' }); y += 14;
  const bw = cw - 20;
  g.fillStyle = 'rgba(90,64,38,0.25)'; g.fillRect(x0 + 10, y, bw, 3);
  g.fillStyle = GOLD[2]; g.fillRect(x0 + 10, y, Math.round(bw * tot.f), 3);
  g.fillStyle = GOLD[1]; g.fillRect(x0 + 10, y, Math.round(bw * tot.f), 1);
  y += 14;
  if (y < y1 - 20) handText(g, 'The last page, when it is written, is the proof that this desert was a sea.', x0 + 4, y, cw - 8, { maxLines: 4 });
}

// ---------------------------------------------------------------------------
// state

function state(ui) {
  return ui.bookState || (ui.bookState = { at: 3, anim: null, drag: null, press: null, cache: new Map(), t: 0, wheelT: 0, hits: [], flipQ: 0 });
}

/** Called by ui.openBook: start the open, at a chapter or an entry if one is named. */
export function bookOpening(ui, tab, pick) {
  const st = state(ui);
  const P = buildPages();
  st.cache = new Map();
  let at = st.at ?? 3;
  if (tab && pick) at = plateOf(tab, pick) ?? openerOf(tab);
  else if (tab) at = openerOf(tab);
  st.at = clamp(at, 0, P.length - 1);
  st.anim = { kind: 'open', t: 0, dur: 1.15 };
  st.drag = null; st.press = null; st.flipQ = 0;
  st.warm = 0;
}

function spreadOf(L, at) { return L.single ? at : at & ~1; }

function page(st, L, idx, game) {
  const P = buildPages();
  if (idx < 0 || idx >= P.length) return null;
  const side = L.single ? 'single' : (idx % 2 === 0 ? 'left' : 'right');
  const key = `${idx}:${side}:${L.pw}x${L.ph}`;
  let pg = st.cache.get(key);
  if (pg && !(pg.partial && st.t - pg.t > 0.12)) return pg;
  pg = bakePage(P[idx], side, L.pw, L.ph, game);
  pg.t = st.t;
  st.cache.set(key, pg);
  if (st.cache.size > 40) st.cache.delete(st.cache.keys().next().value);
  return pg;
}

/** Start turning toward page `to`. */
function goTo(ui, to, L) {
  const st = state(ui);
  const P = buildPages();
  to = clamp(to, L.single ? 1 : 0, P.length - (L.single ? 2 : 1));
  const from = spreadOf(L, st.at);
  const target = spreadOf(L, to);
  if (target === from || st.anim) return false;
  const dir = target > from ? 1 : -1;
  const far = Math.abs(target - from) > (L.single ? 1 : 2);
  st.anim = { kind: 'flip', dir, from, to: target, p0: 0, p1: 1, t: 0, dur: far ? 0.62 : 0.5, far };
  ui.game.audio?.play('ui', { pitch: 0.7 + Math.random() * 0.15 });
  return true;
}

function step(ui, dir, L) {
  const st = state(ui);
  const s = spreadOf(L, st.at);
  return goTo(ui, s + dir * (L.single ? 1 : 2), L);
}

/** Close: the board swings back over and the book goes. */
function startClose(ui) {
  const st = state(ui);
  if (st.anim?.kind === 'close') { ui.closeBook(); return; }
  st.anim = { kind: 'close', t: 0, dur: 0.7 };
  st.drag = null;
}

// ---------------------------------------------------------------------------
// input, run from ui.update while the book is open

export function bookUpdate(ui, dt) {
  const g = ui.game, i = g.input;
  const st = state(ui);
  const L = layout(g.renderer.vw, g.renderer.vh);
  st.t += dt;
  st.wheelT = Math.max(0, st.wheelT - dt);
  // a long frame (a page being baked) slows the animation rather than skipping it
  const adt = Math.min(dt, 1 / 30);
  if (L.single && st.at === 0) st.at = 1;
  const a = st.anim;
  if (a) {
    if (!st.freeze) a.t += adt;
    if (a.kind === 'open') {
      // anything at all hurries it along
      if (i.clicked || i.justPressed('Escape') || i.justPressed('e') || i.justPressed('ArrowRight')) {
        if (i.justPressed('Escape')) { i.consumeKey('Escape'); startClose(ui); return; }
        a.t = Math.max(a.t, a.dur);
        i.clicked = false;
      }
      if (a.t >= a.dur) st.anim = null;
      return;
    }
    if (a.kind === 'close') {
      if (a.t >= a.dur) { st.anim = null; ui.closeBook(); }
      return;
    }
    if (a.kind === 'flip' && a.t >= a.dur) {
      if (a.p1 >= 1) st.at = a.to;
      st.anim = null;
      if (st.flipQ) { const q = st.flipQ; st.flipQ = 0; step(ui, q, L); }
    }
  }
  if (i.justPressed('Escape') || i.justPressed('j')) { i.consumeKey('Escape'); i.consumeKey('j'); startClose(ui); return; }
  const fwd = i.justPressed('ArrowRight') || i.justPressed('e') || i.justPressed('d') || i.justPressed('PageDown');
  const back = i.justPressed('ArrowLeft') || i.justPressed('q') || i.justPressed('a') || i.justPressed('PageUp');
  for (const k of ['ArrowRight', 'e', 'd', 'ArrowLeft', 'q', 'a', 'PageUp', 'PageDown']) i.consumeKey(k);
  if (fwd || back) {
    const dir = fwd ? 1 : -1;
    if (st.anim) st.flipQ = dir; else step(ui, dir, L);
  }
  if (i.justPressed('Home')) { i.consumeKey('Home'); goTo(ui, 3, L); }
  ['1', '2', '3', '4', '5'].forEach((k, n) => {
    if (i.justPressed(k)) { i.consumeKey(k); if (BOOK_TABS[n]) goTo(ui, openerOf(BOOK_TABS[n].id), L); }
  });
  if (i.wheel && !st.anim && st.wheelT <= 0) { step(ui, Math.sign(i.wheel), L); st.wheelT = 0.28; }
  i.wheel = 0;

  // dragging a leaf over
  const P = buildPages();
  const bookRect = L.single ? { x: L.lx - L.m, y: L.top - L.m, w: L.pw + L.m * 2, h: L.ph + L.m * 2 }
    : { x: L.lx - L.m, y: L.top - L.m, w: L.pw * 2 + L.m * 2, h: L.ph + L.m * 2 };
  const onBook = (x, y) => x >= bookRect.x && x <= bookRect.x + bookRect.w && y >= bookRect.y && y <= bookRect.y + bookRect.h;
  if (i.down && !st.press) st.press = { x: i.sx, y: i.sy, on: onBook(i.sx, i.sy) };
  if (st.press && i.down && st.press.on && !st.anim) {
    const dx = i.sx - st.press.x;
    if (!st.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(i.sy - st.press.y)) {
      const dir = dx < 0 ? 1 : -1;
      const s = spreadOf(L, st.at);
      const to = s + dir * (L.single ? 1 : 2);
      if (to >= (L.single ? 1 : 0) && to <= P.length - (L.single ? 2 : 1)) st.drag = { dir, from: s, to, p: 0 };
    }
    if (st.drag) {
      const span = L.single ? L.pw * 0.85 : L.pw * 1.4;
      st.drag.p = clamp01((-dx * st.drag.dir) / span);
    }
  }
  if (!i.down && st.press) {
    if (st.drag) {
      const d = st.drag;
      const done = d.p > 0.28;
      st.anim = { kind: 'flip', dir: d.dir, from: d.from, to: d.to, p0: d.p, p1: done ? 1 : 0, t: 0, dur: 0.32 };
      if (done) g.audio?.play('ui', { pitch: 0.75 });
      st.drag = null;
      i.clicked = false;
    }
    st.press = null;
  }

  // clicks, against what the last frame drew
  if (i.clicked && !st.anim) {
    const hit = st.hits.find((h) => i.sx >= h.x && i.sx <= h.x + h.w && i.sy >= h.y && i.sy <= h.y + h.h);
    i.clicked = false;
    if (hit) {
      const act = hit.act;
      if (act.close) startClose(ui);
      else if (act.step) step(ui, act.step, L);
      else if (act.go != null) goTo(ui, act.go, L);
      else if (act.claim) { g.book.claim(act.claim); st.cache = new Map(); }
    } else if (!onBook(i.sx, i.sy)) startClose(ui);
  }
  // the leaves either side are baked ahead, one a frame, while nothing is moving
  if (!st.anim && !st.drag && !st.press) {
    const s = spreadOf(L, st.at);
    const near = L.single ? [s + 1, s - 1, s + 2] : [s + 2, s + 3, s - 2, s - 1];
    for (const idx of near) {
      if (idx < 0 || idx >= P.length) continue;
      const side = L.single ? 'single' : (idx % 2 === 0 ? 'left' : 'right');
      if (!st.cache.has(`${idx}:${side}:${L.pw}x${L.ph}`)) { ART_BUDGET = performance.now() + 4; page(st, L, idx, g); break; }
    }
  }
  // pages you have looked at are not news any more
  if (!st.anim && g.book?.fresh?.length) {
    const s = spreadOf(L, st.at);
    const seen = [P[s], L.single ? null : P[s + 1]].filter((p) => p && p.id);
    if (seen.length) g.book.fresh = g.book.fresh.filter((f) => !seen.some((p) => p.tab === f.tab && p.id === f.id));
  }
}

// ---------------------------------------------------------------------------
// drawing

const boards = new Map();
function board(kind, w, h) {
  const key = `${kind}:${w}x${h}`;
  let cv = boards.get(key);
  if (cv) return cv;
  if (kind === 'cover') cv = coverFace(w, h);
  else if (kind === 'inside') cv = insideCover(w, h, 'left');
  else cv = leatherBoard(w, h, kind === 'L' ? 3 : 5);
  boards.set(key, cv);
  return cv;
}

/** A page drawn flat, dipping a pixel or two into the spine. */
function drawPageFlat(ctx, cv, x, y, side) {
  if (!cv) return;
  const w = cv.width, h = cv.height;
  const D = 12;
  if (side === 'left') {
    ctx.drawImage(cv, 0, 0, w - D, h, x, y, w - D, h);
    for (let k = 0; k < D; k++) {
      const u = (k + 1) / D;
      const dip = Math.round(2.4 * u * u);
      ctx.drawImage(cv, w - D + k, 0, 1, h, x + w - D + k, y + dip, 1, h);
    }
  } else {
    ctx.drawImage(cv, D, 0, w - D, h, x + D, y, w - D, h);
    for (let k = 0; k < D; k++) {
      const u = 1 - k / D;
      const dip = Math.round(2.4 * u * u);
      ctx.drawImage(cv, k, 0, 1, h, x + k, y + dip, 1, h);
    }
  }
}

/** The edges of the leaves under a page: a line per few dozen pages. */
function drawStack(ctx, x, y, w, h, n, side) {
  for (let k = n; k >= 1; k--) {
    ctx.fillStyle = k % 2 ? '#d8c08a' : '#efe0b8';
    const ox = side === 'left' ? -k : side === 'right' ? k : k;
    // the foot of the block
    ctx.fillRect(x + (side === 'left' ? ox : 0), y + h - 1 + k, w, 1);
    // the fore-edge
    ctx.fillRect(side === 'left' ? x + ox : x + w - 1 + ox, y + k, 1, h);
  }
  ctx.fillStyle = 'rgba(90,64,38,0.5)';
  ctx.fillRect(side === 'left' ? x - n - 1 : x + w + n, y + n + 1, 1, h - 1);
}

function shadow(ctx, x, y, w, h, a = 0.45) {
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = `rgba(0,0,0,${(a * (1 - k / 6) * 0.35).toFixed(3)})`;
    ctx.fillRect(x - k + 3, y - k + 5, w + k * 2, h + k * 2);
  }
}

/** The silk ribbon, lying down the gutter and hanging out of the foot. */
function ribbon(ctx, x, y, h, t, drift = 22) {
  const sway = Math.sin(t * 1.3) * 1.2;
  for (let yy = 0; yy < h; yy++) {
    const u = yy / h;
    // it lies down the gutter and drifts out over the left page toward the foot
    const dx = Math.round(-drift * u * u * u + sway * u * u);
    ctx.fillStyle = '#5a0e0e'; ctx.fillRect(x + dx - 1, y + yy, 1, 1);
    ctx.fillStyle = '#b82a2a'; ctx.fillRect(x + dx, y + yy, 3, 1);
    ctx.fillStyle = '#e8584a'; ctx.fillRect(x + dx, y + yy, 1, 1);
    ctx.fillStyle = '#7a1414'; ctx.fillRect(x + dx + 3, y + yy, 1, 1);
  }
  const ex = x + Math.round(-drift + sway), ey = y + h;
  ctx.fillStyle = '#b82a2a';
  ctx.fillRect(ex - 1, ey, 2, 4); ctx.fillRect(ex + 2, ey, 2, 4);
  ctx.fillStyle = '#7a1414';
  ctx.fillRect(ex - 1, ey + 4, 1, 1); ctx.fillRect(ex + 3, ey + 4, 1, 1);
}

/** A leather thumb tab. Returns its rect. */
function thumbTab(ctx, id, x, y, w, h, side, hot, on) {
  const col = CH_COLOR[id] || CH_COLOR.contents;
  ctx.fillStyle = '#120a06';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col[1]; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = col[0]; ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(side === 'right' ? x + w - 2 : x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = col[2]; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  // gold tooling
  ctx.fillStyle = on ? GOLD[1] : 'rgba(230,165,28,0.55)';
  ctx.fillRect(x + 2, y + 3, w - 4, 1); ctx.fillRect(x + 2, y + h - 4, w - 4, 1);
  drawIcon(ctx, tabIcon(id), x + w / 2 + (side === 'right' ? 1 : -1), y + h / 2, 1, { alpha: hot || on ? 1 : 0.85 });
}

function hintBar(ctx, L, text) {
  const y = L.top + L.ph + L.m + 6;
  if (y + 9 > L.H - 1) return;
  drawText(ctx, text, Math.round(L.W / 2), y, { color: 'rgba(246,234,208,0.8)', align: 'center', outline: true, outlineColor: 'rgba(12,8,5,0.8)' });
}

export function drawBook(ui, ctx, W, H) {
  const g = ui.game;
  if (!g.book) return;
  const st = state(ui);
  const L = layout(W, H);
  const P = buildPages();
  const a = st.anim;
  st.hits = [];
  ART_BUDGET = performance.now() + 5;
  ctx.imageSmoothingEnabled = false;

  // what the open is doing
  let rise = 1, cover = Math.PI, shift = 0, alpha = 1;
  if (a && (a.kind === 'open' || a.kind === 'close')) {
    const t = a.kind === 'open' ? a.t : a.dur - a.t;
    const d = a.kind === 'open' ? 1 : 0.7 / 1.15;
    rise = easeOutCubic(clamp01(t / (0.3 * d)));
    const f = easeInOutCubic(clamp01((t - 0.42 * d) / (0.62 * d)));
    cover = Math.PI * f;
    shift = L.single ? 0 : -Math.round((L.pw + L.m) / 2 * (1 - f));
    alpha = rise;
  }
  ctx.save();
  ctx.globalAlpha = 0.62 * alpha;
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  const dy = Math.round((1 - rise) * 46);
  ctx.translate(shift, dy);
  const s = spreadOf(L, st.at);
  const opening = a && (a.kind === 'open' || a.kind === 'close');
  if (L.single) drawSingle(ui, ctx, L, st, s, opening ? cover : null, a);
  else drawSpread(ui, ctx, L, st, s, opening ? cover : null, a);
  ctx.restore();

  if (!opening) {
    // the close button: a brass stud with a cross cut in it
    const cs = 13;
    const cx = L.single ? W - cs - 4 : L.rx + L.pw + L.m - cs + 3, cy = L.single ? 4 : L.top - L.m - 7;
    const hot = ui._hit(cx, cy, cs, cs);
    K.bezel(ctx, cx, cy, cs, cs, { rim: 1, curls: false,
      body: hot ? ['#f05a48', '#d8402e', '#b82a2a', '#701818'] : ['#d84a38', '#b82a2a', '#8a1e1e', '#5a1010'] });
    for (let n = 0; n < cs - 7; n++) {
      ctx.fillStyle = '#fff0e0';
      ctx.fillRect(cx + 3 + n, cy + 3 + n, 2, 1);
      ctx.fillRect(cx + cs - 5 - n, cy + 3 + n, 2, 1);
    }
    st.hits.push({ x: cx, y: cy, w: cs, h: cs, act: { close: true } });
    if (!L.single) hintBar(ctx, L, 'Q  E  or drag a corner to turn       J  close');
    else {
      drawText(ctx, 'swipe to turn', Math.round(W / 2), L.top + L.ph + L.m + 5, { color: 'rgba(246,234,208,0.7)', align: 'center', outline: true, outlineColor: 'rgba(12,8,5,0.8)' });
    }
  }
  // a name over an index entry, as the pointer finds it
  const tipHit = st.hits.find((h) => h.tip && ui._hit(h.x, h.y, h.w, h.h));
  if (tipHit && !st.anim && !st.drag) {
    const tw = textWidth(tipHit.tip) + 8;
    const tx = clamp(Math.round(tipHit.x + tipHit.w / 2 - tw / 2), 2, W - tw - 2), ty = tipHit.y - 13;
    K.parchment(ctx, tx, ty, tw, 12);
    drawText(ctx, tipHit.tip, tx + 4, ty + 3, { color: K.INK });
  }
}

/** Where the flip is, from the animation or the finger. */
function flipNow(st) {
  if (st.drag) return { dir: st.drag.dir, from: st.drag.from, to: st.drag.to, p: st.drag.p, far: false };
  const a = st.anim;
  if (a && a.kind === 'flip') {
    const k = clamp01(a.t / a.dur);
    const e = a.p1 > a.p0 ? easeInOutCubic(k) : easeOutCubic(k);
    return { dir: a.dir, from: a.from, to: a.to, p: lerp(a.p0, a.p1, e), far: a.far };
  }
  return null;
}

function drawSpread(ui, ctx, L, st, s, cover, a) {
  const g = ui.game;
  const P = buildPages();
  const { pw, ph, m, cx, top } = L;
  const bw = pw + m, bh = ph + m * 2;
  const N = P.length;
  const closed = cover !== null && cover < Math.PI;
  const fl = closed ? null : flipNow(st);
  // which pages lie where
  let underL = s, underR = s + 1;
  if (fl) {
    if (fl.dir > 0) { underL = fl.from; underR = fl.to + 1; } else { underL = fl.to; underR = fl.from + 1; }
  }
  const frac = clamp01(s / (N - 2));
  const stL = closed ? 0 : 1 + Math.round(frac * 4), stR = closed ? 6 : 1 + Math.round((1 - frac) * 4);
  // shadow and boards
  const showL = !closed || cover > Math.PI / 2;
  shadow(ctx, showL ? cx - bw - stL : cx, top - m, showL ? bw * 2 + stL + stR : bw + stR, bh);
  if (!closed) ctx.drawImage(board('L', bw + 3, bh), cx - bw - 3, top - m);
  ctx.drawImage(board('R', bw + 3, bh), cx, top - m);
  // the spine between the boards
  ctx.fillStyle = '#2a120a'; ctx.fillRect(cx - 2, top - m, 4, bh);
  ctx.fillStyle = '#5a2a16'; ctx.fillRect(cx - 1, top - m, 1, bh);
  if (!closed) drawStack(ctx, cx - pw, top, pw, ph, stL, 'left');
  drawStack(ctx, cx, top, pw, ph, stR, 'right');
  // the pages that lie flat
  const pL = !closed ? page(st, L, underL, g) : null;
  const pR = page(st, L, underR, g);
  if (pL) drawPageFlat(ctx, pL.cv, cx - pw, top, 'left');
  if (pR) drawPageFlat(ctx, pR.cv, cx, top, 'right');
  // the crease
  ctx.fillStyle = 'rgba(40,24,10,0.55)'; ctx.fillRect(cx - 1, top + 2, 2, ph - 2);
  if (closed || (a && a.kind === 'close')) {
    // the front board swinging on its hinge; its back is the page it opens on
    const back = makeBack(st, L, s, g);
    const coverCv = board('cover', bw, bh);
    drawLeaf(ctx, coverCv, back, cx, top - m, bw, bh, cover, { bend: 0.12 });
    if (cover < 0.05) strap(ctx, cx, top - m, bw, bh, a);
    return;
  }
  if (fl) {
    const front = page(st, L, fl.dir > 0 ? fl.from + 1 : fl.to + 1, g);
    const backPg = page(st, L, fl.dir > 0 ? fl.to : fl.from, g);
    const theta = fl.dir > 0 ? Math.PI * fl.p : Math.PI * (1 - fl.p);
    if (fl.far) {
      ribbon(ctx, cx - 3, top - 3, ph + 14, st.t);
      // a riffle: a few blank leaves go over ahead of the one you are reading
      const blankF = paperSheet(pw, ph, 'right', 2), blankB = paperSheet(pw, ph, 'left', 2);
      for (const lag of [0.55, 0.3]) {
        const th = fl.dir > 0 ? Math.PI * clamp01(fl.p * 1.25 - lag * (1 - fl.p)) : Math.PI * (1 - clamp01(fl.p * 1.25 - lag * (1 - fl.p)));
        if (th > 0.03 && th < Math.PI - 0.03) drawLeaf(ctx, blankF, blankB, cx, top, pw, ph, th, { shadow: false });
      }
    }
    ribbon(ctx, cx - 3, top - 3, ph + 14, st.t);
    drawLeaf(ctx, front?.cv, backPg?.cv, cx, top, pw, ph, theta);
    return;
  }
  ribbon(ctx, cx - 3, top - 3, ph + 14, st.t);
  // what can be pressed on the two pages
  const hits = [];
  if (pL) for (const h of pL.hits) hits.push({ ...h, x: h.x + cx - pw, y: h.y + top });
  if (pR) for (const h of pR.hits) hits.push({ ...h, x: h.x + cx, y: h.y + top });
  for (const h of hits) {
    if (ui._hit(h.x, h.y, h.w, h.h)) {
      ctx.fillStyle = 'rgba(216,156,60,0.22)';
      ctx.fillRect(h.x, h.y, h.w, h.h);
      ctx.fillStyle = 'rgba(156,106,36,0.8)';
      ctx.fillRect(h.x, h.y + h.h, h.w, 1);
    }
  }
  st.hits.push(...hits);
  // corners to turn by
  corner(ui, ctx, st, cx + pw, top + ph, 'right', s + 2 < N);
  corner(ui, ctx, st, cx - pw, top + ph, 'left', s > 0);
  // the thumb index
  const ids = ['contents', ...BOOK_TABS.map((t) => t.id)];
  const th = Math.min(26, Math.floor((ph - 20) / ids.length) - 2);
  const here = chapterAt(s + 1);
  ids.forEach((id, n) => {
    const oi = id === 'contents' ? 3 : openerOf(id);
    const ahead = oi > s + 1;
    const ty = top + 8 + n * (th + 2);
    const hot = ui._hit(ahead ? cx + bw : cx - bw - 16, ty, 16, th);
    const on = here === id;
    const tw = 12 + (hot ? 3 : 0) + (on ? 1 : 0);
    const tx = ahead ? cx + bw + 2 : cx - bw - 3 - tw;
    thumbTab(ctx, id, tx, ty, tw, th, ahead ? 'right' : 'left', hot, on);
    st.hits.push({ x: Math.min(tx, ahead ? cx + bw : tx), y: ty, w: tw + 3, h: th, act: { go: oi }, tip: id === 'contents' ? 'Contents' : CHAPTER_TEXT[id].title });
  });
}

/** The page the front board turns over onto: the left page of the spread, on the inside board. */
function makeBack(st, L, s, g) {
  const key = `back:${s}:${L.pw}x${L.ph}`;
  let cv = st.cache.get(key)?.cv;
  if (cv) return cv;
  const bw = L.pw + L.m, bh = L.ph + L.m * 2;
  cv = makeCanvas(bw, bh);
  const c = cv.getContext('2d');
  c.drawImage(board('L', bw + 3, bh), -3, 0);
  if (!L.single) {
    drawStack(c, 0 + L.m, L.m, L.pw, L.ph, 1 + Math.round(clamp01(s / (buildPages().length - 2)) * 4), 'left');
    const pg = page(st, L, s, g);
    if (pg) drawPageFlat(c, pg.cv, L.m, L.m, 'left');
  } else {
    c.drawImage(insideCover(bw, bh, 'left'), 0, 0);
  }
  st.cache.set(key, { cv, hits: [] });
  return cv;
}

/** The strap and its buckle, round the fore-edge of the closed book. */
function strap(ctx, x, y, bw, bh, a) {
  const t = a ? (a.kind === 'open' ? a.t : a.dur - a.t) : 0;
  const slip = clamp01((t - 0.24) / 0.18);
  const sx = x + bw - 40 + Math.round(slip * 30);
  const sy = y + Math.round(bh / 2) - 6;
  ctx.save();
  ctx.globalAlpha *= 1 - slip;
  ctx.fillStyle = '#120a06'; ctx.fillRect(sx, sy, bw - (sx - x) + 5, 12);
  ctx.fillStyle = '#6a3018'; ctx.fillRect(sx + 1, sy + 1, bw - (sx - x) + 3, 10);
  ctx.fillStyle = '#8a4422'; ctx.fillRect(sx + 1, sy + 1, bw - (sx - x) + 3, 2);
  ctx.fillStyle = '#3a1808'; ctx.fillRect(sx + 1, sy + 9, bw - (sx - x) + 3, 1);
  // stitching
  ctx.fillStyle = 'rgba(240,210,160,0.5)';
  for (let k = sx + 4; k < x + bw + 2; k += 3) { ctx.fillRect(k, sy + 3, 1, 1); ctx.fillRect(k, sy + 8, 1, 1); }
  // the buckle
  ctx.fillStyle = '#5a3e18'; ctx.fillRect(sx - 2, sy - 2, 9, 16);
  ctx.fillStyle = '#c9a24a'; ctx.fillRect(sx - 1, sy - 1, 7, 14);
  ctx.fillStyle = '#6a3018'; ctx.fillRect(sx + 1, sy + 1, 3, 10);
  ctx.fillStyle = '#f2d48a'; ctx.fillRect(sx - 1, sy - 1, 7, 1); ctx.fillRect(sx - 1, sy - 1, 1, 14);
  ctx.fillStyle = '#8f6a2a'; ctx.fillRect(sx + 2, sy + 2, 1, 8);
  ctx.restore();
}

/** A dog-eared corner: lifts under the pointer, and turns the page when pressed. */
function corner(ui, ctx, st, x, y, side, live) {
  if (!live) return;
  const hot = ui._hit(side === 'right' ? x - 20 : x, y - 20, 20, 20);
  const s = hot ? 9 : 5;
  for (let k = 0; k < s; k++) {
    // the turned-up triangle: the back of the page, lighter, with a shadow under it
    const len = s - k;
    ctx.fillStyle = 'rgba(40,24,10,0.25)';
    if (side === 'right') ctx.fillRect(x - s - 1, y - 1 - k, len + 1, 1);
    else ctx.fillRect(x + k, y - 1 - k, len + 1, 1);
    ctx.fillStyle = k === 0 ? '#c8ac78' : '#efe0bc';
    if (side === 'right') ctx.fillRect(x - s + k, y - 1 - k, len, 1);
    else ctx.fillRect(x, y - 1 - k, len, 1);
  }
  st.hits.push({ x: side === 'right' ? x - 22 : x, y: y - 22, w: 22, h: 22, act: { step: side === 'right' ? 1 : -1 } });
}

function drawSingle(ui, ctx, L, st, s, cover, a) {
  const g = ui.game;
  const P = buildPages();
  const { pw, ph, m, lx, top, W } = L;
  const closed = cover !== null && cover < Math.PI;
  const fl = closed ? null : flipNow(st);
  const N = P.length;
  shadow(ctx, lx - m, top - m, pw + m * 2, ph + m * 2);
  ctx.drawImage(board('R', pw + m + 3, ph + m * 2), lx - 3, top - m);
  // the spine, down the left
  ctx.fillStyle = '#2a120a'; ctx.fillRect(lx - m - 1, top - m, m + 1, ph + m * 2);
  ctx.fillStyle = '#5a2a16'; ctx.fillRect(lx - m, top - m, 1, ph + m * 2);
  for (let k = 0; k < 4; k++) { ctx.fillStyle = '#7a3e1c'; ctx.fillRect(lx - m - 1, top + Math.round(ph * (0.15 + k * 0.23)), m + 1, 2); }
  drawStack(ctx, lx, top, pw, ph, closed ? 5 : 1 + Math.round((1 - s / (N - 1)) * 4), 'right');
  const under = fl ? (fl.dir > 0 ? fl.to : fl.from) : s;
  const pg = page(st, L, under, g);
  if (pg) drawPageFlat(ctx, pg.cv, lx, top, 'right');
  if (closed || (a && a.kind === 'close')) {
    const coverCv = board('cover', pw + m, ph + m * 2);
    drawLeaf(ctx, coverCv, board('inside', pw + m, ph + m * 2), lx - 1, top - m, pw + m, ph + m * 2, cover, { bend: 0.12 });
    if (cover < 0.05) strap(ctx, lx - 1, top - m, pw + m, ph + m * 2, a);
    return;
  }
  if (fl) {
    const front = page(st, L, fl.dir > 0 ? fl.from : fl.to, g);
    const verso = paperSheet(pw, ph, 'left', 1);
    const theta = fl.dir > 0 ? Math.PI * fl.p : Math.PI * (1 - fl.p);
    drawLeaf(ctx, front?.cv, verso, lx, top, pw, ph, theta);
    return;
  }
  ribbon(ctx, lx + 6, top - 3, ph + 12, st.t, 0);
  if (pg) {
    for (const h of pg.hits) {
      const hh = { ...h, x: h.x + lx, y: h.y + top };
      if (ui._hit(hh.x, hh.y, hh.w, hh.h)) { ctx.fillStyle = 'rgba(216,156,60,0.22)'; ctx.fillRect(hh.x, hh.y, hh.w, hh.h); }
      st.hits.push(hh);
    }
  }
  corner(ui, ctx, st, lx + pw, top + ph, 'right', s + 1 < N - 1);
  // a strip at the left of the page turns back
  if (s > 1) {
    const hot = ui._hit(lx, top + ph - 22, 22, 22);
    drawText(ctx, '<', lx + 4, top + ph - 12, { color: hot ? RUBRIC : 'rgba(70,48,26,0.55)' });
    st.hits.push({ x: lx, y: top + ph - 22, w: 22, h: 22, act: { step: -1 } });
  }
  // the thumb index runs along the head of the page
  const ids = ['contents', ...BOOK_TABS.map((t) => t.id)];
  const tw = Math.floor((pw - 4) / ids.length) - 2;
  const here = chapterAt(s);
  ids.forEach((id, n) => {
    const oi = id === 'contents' ? 3 : openerOf(id);
    const tx = lx + 2 + n * (tw + 2), on = here === id;
    const thh = on ? 18 : 15;
    const ty = top - m - thh + 2;
    const hot = ui._hit(tx, ty, tw, thh);
    thumbTab(ctx, id, tx, ty, tw, thh, 'right', hot, on);
    st.hits.push({ x: tx, y: ty - 3, w: tw, h: thh + 3, act: { go: oi } });
  });
  void W;
}
