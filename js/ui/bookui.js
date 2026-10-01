// CRABDEN - the book, open.
//
// Dr. Vess's encyclopedia as an object: a leather book lying open, two pages
// of parchment, a ribbon down the gutter, and five leather tabs standing out
// of the fore-edge - one per chapter. The left page is the chapter: every
// entry a little framed square, a blank, a silhouette, or the thing itself.
// The right page is the entry you touched: its picture, what it is, what Vess
// knows about it, and what you have to do to fill in the rest.
//
// On a phone held upright there is room for one page, so it shows one at a
// time and the entry slides over the chapter when you touch it.

import * as K from './kit.js';
import { drawIcon, hasIcon } from './iconcore.js';

/** Each chapter's tab picture: the first of these that has been painted. */
const TAB_ICONS = {
  creature: ['paw', 'beast', 'claw'], plant: ['flower', 'leaf', 'seed'], fish: ['fish', 'fishsilver'],
  relic: ['fossil', 'trilobite', 'ammonite'], mineral: ['pickaxe', 'pickcopper', 'copperore'],
};
const tabIcon = (t) => (TAB_ICONS[t.id] || [t.icon]).find((n) => hasIcon(n)) || t.icon;
import { drawText, textWidth, ellipsize, wrapText, LINE_H } from '../lib/font.js';
import { clamp, clamp01, easeOutCubic, TAU } from '../lib/math.js';
import { BOOK_TABS, BOOK_TAB_BY_ID, pages } from '../systems/book.js';
import { creaturePortrait, plantPortrait, fishPortrait, drawPortrait } from './portraits.js';

const INK = '#3a2210';
const INK_SOFT = '#7a5a34';
const INK_FAINT = 'rgba(58,34,16,0.35)';
const PAPER = ['#fffbe8', '#f2e2b4', '#e4cf98', '#c8a870', '#a88c58'];
const COVER = ['#7a3e1c', '#5a2e14', '#3a1c09', '#24100a'];

/** Where the book lies on the screen. */
export function bookBox(W, H) {
  const narrow = W < 300;
  const w = Math.min(W - 8, narrow ? W - 8 : 432);
  const h = Math.min(H - 8, narrow ? H - 40 : 240);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2) + (narrow ? 8 : 0), w, h, narrow };
}

function art(tab, p) {
  try {
    if (tab === 'creature') return creaturePortrait(p.def);
    if (tab === 'plant') return plantPortrait(p.def);
    if (tab === 'fish') return fishPortrait(p.def);
  } catch { /* fall through to an icon */ }
  return null;
}

/**
 * Draw the open book and answer its input. `ui.bookState` holds which
 * chapter is open, which page is picked and the scroll.
 */
export function drawBook(ui, ctx, W, H) {
  const g = ui.game;
  const book = g.book;
  if (!book) return;
  const st = ui.bookState || (ui.bookState = { tab: 'creature', pick: null, scroll: 0, t: 0 });
  st.t += 1 / 60;
  const i = g.input;
  const box = bookBox(W, H);
  const k = easeOutCubic(clamp01(st.t / 0.25));

  ctx.save();
  ctx.globalAlpha = 0.55 * k;
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const x = box.x, y = Math.round(box.y + (1 - k) * 16), w = box.w, h = box.h;
  const tabW = box.narrow ? 0 : 24;
  const bw = w - tabW;

  // ---- the cover --------------------------------------------------------
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 4, y + 5, bw, h);
  ctx.restore();
  K.bezel(ctx, x, y, bw, h, { rim: 1, curls: false, body: COVER });
  // gold caps on the corners of the cover
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + bw - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + bw - 1, y + h - 1, -1, -1]]) {
    for (let a = 0; a < 7; a++) {
      for (let b = 0; b < 7 - a; b++) {
        const c = a + b === 6 ? K.C.out : a === 0 || b === 0 ? '#ffd648' : a + b < 3 ? '#fff6c2' : '#e6a51c';
        ctx.fillStyle = c;
        ctx.fillRect(cx + sx * a, cy + sy * b, 1, 1);
      }
    }
  }

  // ---- the tabs, standing out of the fore-edge ----------------------------
  const tabs = BOOK_TABS;
  if (!box.narrow) {
    const th = Math.min(30, Math.floor((h - 24) / tabs.length));
    tabs.forEach((t, n) => {
      const ty = y + 12 + n * th;
      const on = st.tab === t.id;
      const tx = x + bw - 3;
      const tw = on ? tabW + 2 : tabW - 2;
      const hot = ui._hit(tx, ty, tw, th - 3);
      K.bezel(ctx, tx, ty, tw, th - 3, {
        rim: 1, curls: false,
        body: on ? PAPER.slice(0, 4) : ['#9a5226', '#7a3e1c', '#5a2e14', '#3a1c09'],
        state: hot && !on ? 'hot' : 'rest',
      });
      drawIcon(ctx, tabIcon(t), tx + tw / 2 + (on ? 0 : -1), ty + (th - 3) / 2, 1, { gray: false })
        || drawText(ctx, t.name[0], tx + tw / 2, ty + 8, { color: on ? INK : K.C.ink, align: 'center' });
      const pr = book.progress(t.id);
      if (book.canClaim(t.id)) {
        const b = 0.5 + 0.5 * Math.sin(ui.t * 6);
        ctx.fillStyle = `rgba(255,214,72,${0.4 + b * 0.6})`;
        ctx.fillRect(tx + tw - 5, ty + 2, 3, 3);
      } else if (pr.done) {
        ctx.fillStyle = '#5eaa3a';
        ctx.fillRect(tx + tw - 5, ty + 2, 3, 3);
      }
      if (hot && i.clicked) { i.clicked = false; st.tab = t.id; st.pick = null; st.scroll = 0; g.audio?.play('ui'); }
    });
  }

  // ---- the pages -----------------------------------------------------------
  const px = x + 6, py = y + 6, pw = bw - 12, ph = h - 12;
  const two = !box.narrow;
  const pageW = two ? Math.floor((pw - 6) / 2) : pw;
  const left = { x: px, y: py, w: pageW, h: ph };
  const right = two ? { x: px + pageW + 6, y: py, w: pageW, h: ph } : left;
  paper(ctx, left.x, left.y, left.w, left.h, two ? 'left' : 'single');
  if (two) {
    paper(ctx, right.x, right.y, right.w, right.h, 'right');
    // the gutter between them, and the ribbon lying in it
    const gx = px + pageW;
    ctx.fillStyle = '#7a5a34'; ctx.fillRect(gx, py, 6, ph);
    ctx.fillStyle = '#5a3e1c'; ctx.fillRect(gx + 2, py, 2, ph);
    ctx.fillStyle = '#b82a2a'; ctx.fillRect(gx + 1, py - 2, 4, Math.round(ph * 0.62));
    ctx.fillStyle = '#f05a48'; ctx.fillRect(gx + 1, py - 2, 1, Math.round(ph * 0.62));
    ctx.fillStyle = '#701818';
    ctx.fillRect(gx + 1, py - 2 + Math.round(ph * 0.62), 1, 3);
    ctx.fillRect(gx + 4, py - 2 + Math.round(ph * 0.62), 1, 3);
  }

  // narrow: the chapter tabs go across the top as a row of little bezels
  let top = left.y + 4;
  if (box.narrow) {
    const n = tabs.length, tw = Math.floor((left.w - 8 - (n - 1) * 2) / n);
    tabs.forEach((t, m) => {
      const tx = left.x + 4 + m * (tw + 2), ty = top;
      const on = st.tab === t.id;
      const hot = ui._hit(tx, ty, tw, 20);
      K.bezel(ctx, tx, ty, tw, 20, { rim: 1, curls: false, state: on ? 'on' : hot ? 'hot' : 'rest',
        body: on ? ['#c8804a', '#a8683a', '#8a5228', '#6e3e1c'] : undefined });
      drawIcon(ctx, tabIcon(t), tx + tw / 2, ty + 10, 1);
      if (book.canClaim(t.id)) { ctx.fillStyle = '#ffd648'; ctx.fillRect(tx + tw - 5, ty + 2, 3, 3); }
      if (hot && i.clicked) { i.clicked = false; st.tab = t.id; st.pick = null; st.scroll = 0; g.audio?.play('ui'); }
    });
    top += 24;
  }

  const tab = BOOK_TAB_BY_ID[st.tab];
  const all = pages(st.tab);
  const pr = book.progress(st.tab);

  // the chapter page (or, on a phone with a page picked, the entry page)
  const showEntry = !two && st.pick;
  if (!showEntry) {
    drawText(ctx, tab.name, left.x + 6, top, { color: INK });
    const cnt = `${pr.have}/${pr.total}`;
    drawText(ctx, cnt, left.x + left.w - 6, top, { color: INK_SOFT, align: 'right' });
    top += 10;
    // progress as a gilded thread
    const gw = left.w - 12;
    ctx.fillStyle = '#c8a870'; ctx.fillRect(left.x + 6, top, gw, 3);
    ctx.fillStyle = '#e6a51c'; ctx.fillRect(left.x + 6, top, Math.round(gw * pr.have / Math.max(1, pr.total)), 3);
    ctx.fillStyle = '#fff3a0'; ctx.fillRect(left.x + 6, top, Math.round(gw * pr.have / Math.max(1, pr.total)), 1);
    top += 7;

    // the entries
    const S = 22, gap = 3;
    const cols = Math.max(3, Math.floor((left.w - 10 + gap) / (S + gap)));
    const gx0 = left.x + Math.round((left.w - (cols * (S + gap) - gap)) / 2);
    const rows = Math.ceil(all.length / cols);
    const viewH = left.y + left.h - 28 - top;
    const maxScroll = Math.max(0, rows * (S + gap) - viewH);
    if (i.wheel && ui._hit(left.x, top, left.w, viewH)) { st.scroll = clamp(st.scroll + i.wheel * 14, 0, maxScroll); i.wheel = 0; }
    if (i.dragging && ui._hit(left.x, top, left.w, viewH)) st.scroll = clamp(st.scroll - i.dragDY, 0, maxScroll);
    st.scroll = clamp(st.scroll, 0, maxScroll);
    ctx.save();
    ctx.beginPath(); ctx.rect(left.x + 2, top - 1, left.w - 4, viewH + 2); ctx.clip();
    all.forEach((p, n) => {
      const cx = gx0 + (n % cols) * (S + gap);
      const cy = top + Math.floor(n / cols) * (S + gap) - Math.round(st.scroll);
      if (cy > top + viewH || cy + S < top - 2) return;
      const lvl = book.get(st.tab, p.id);
      const on = st.pick === p.id;
      const hot = ui._hit(cx, cy, S, S) && cy >= top - 2 && cy + S <= top + viewH + 2;
      entrySlot(ctx, cx, cy, S, lvl, on, hot);
      if (lvl >= 1) {
        const pic = p.icon ? null : art(st.tab, p);
        if (pic) drawPortrait(ctx, pic, cx + 3, cy + 3, S - 6, S - 6, { shadow: lvl < 2, max: 2 });
        else if (p.icon && hasIcon(p.icon)) drawIcon(ctx, p.icon, cx + S / 2, cy + S / 2, 1, { variant: lvl < 2 ? 'shadow' : '' });
      } else {
        drawText(ctx, '?', cx + S / 2, cy + 7, { color: INK_FAINT, align: 'center' });
      }
      if (lvl >= 3) star(ctx, cx + S - 6, cy + 1, true);
      if (book.fresh.some((f) => f.tab === st.tab && f.id === p.id)) {
        const b = 0.5 + 0.5 * Math.sin(ui.t * 6 + n);
        ctx.fillStyle = `rgba(94,170,58,${0.5 + 0.5 * b})`;
        ctx.fillRect(cx + 2, cy + 2, 3, 3);
      }
      if (hot && i.clicked) {
        i.clicked = false;
        st.pick = p.id; st.pickT = 0;
        g.audio?.play('ui');
        book.fresh = book.fresh.filter((f) => !(f.tab === st.tab && f.id === p.id));
      }
    });
    ctx.restore();

    // the chapter's reward, at the foot of the page
    const fy = left.y + left.h - 24;
    ctx.fillStyle = 'rgba(168,140,88,0.5)'; ctx.fillRect(left.x + 6, fy - 3, left.w - 12, 1);
    if (book.canClaim(st.tab)) {
      const bw2 = Math.min(left.w - 12, 110), bx2 = left.x + Math.round((left.w - bw2) / 2);
      const hot = ui._hit(bx2, fy, bw2, 18);
      K.button(ctx, bx2, fy, bw2, 18, `CLAIM +${tab.reward}`, { hot, down: hot && i.down, tint: '#5eaa3a' });
      if (hot && i.clicked) { i.clicked = false; book.claim(st.tab); }
    } else if (book.claimed.has(st.tab)) {
      drawText(ctx, 'CHAPTER COMPLETE', left.x + left.w / 2, fy + 5, { color: '#2e6a26', align: 'center' });
    } else {
      drawIcon(ctx, 'growth', left.x + 14, fy + 9, 1);
      drawText(ctx, `Fill every page: +${tab.reward}`, left.x + 24, fy + 5, { color: INK_SOFT });
    }
  }

  // ---- the entry ------------------------------------------------------------
  if (two || showEntry) {
    const pg = right;
    let ey = showEntry ? top : pg.y + 6;
    const p = all.find((q) => q.id === st.pick);
    if (showEntry) {
      const hot = ui._hit(pg.x + 4, ey, 40, 14);
      drawText(ctx, '< BACK', pg.x + 6, ey + 2, { color: hot ? '#a04e0c' : INK_SOFT });
      if (hot && i.clicked) { i.clicked = false; st.pick = null; }
      ey += 14;
    }
    if (!p) {
      // nothing picked: the book's own title page
      const tot = book.total;
      drawText(ctx, 'THE BOOK OF', pg.x + pg.w / 2, ey + 6, { color: INK_SOFT, align: 'center' });
      drawText(ctx, 'THE OLD SEA', pg.x + pg.w / 2, ey + 17, { color: INK, align: 'center', scale: pg.w > 170 ? 2 : 1 });
      drawIcon(ctx, 'book', pg.x + pg.w / 2, ey + 58, 2);
      const lines = wrapText('Everything that lives, grows, swims and lies buried in this basin, one page each. Fill it in and prove it was a sea.', pg.w - 16);
      lines.slice(0, 5).forEach((l, n) => drawText(ctx, l, pg.x + pg.w / 2, ey + 82 + n * LINE_H, { color: INK_SOFT, align: 'center' }));
      const gy = pg.y + pg.h - 24;
      drawText(ctx, `${Math.round(tot.f * 100)}% complete  ${tot.have}/${tot.total}`, pg.x + pg.w / 2, gy, { color: INK, align: 'center' });
      const gw = pg.w - 24;
      ctx.fillStyle = '#c8a870'; ctx.fillRect(pg.x + 12, gy + 10, gw, 4);
      ctx.fillStyle = '#e6a51c'; ctx.fillRect(pg.x + 12, gy + 10, Math.round(gw * tot.f), 4);
    } else {
      const lvl = book.get(st.tab, p.id);
      st.pickT = (st.pickT || 0) + 1 / 60;
      // the name, or what you know of it
      const name = lvl >= 1 ? p.name : '???';
      drawText(ctx, ellipsize(name.toUpperCase(), pg.w - 30), pg.x + 6, ey, { color: INK });
      for (let s = 0; s < 3; s++) star(ctx, pg.x + pg.w - 30 + s * 8, ey - 1, lvl > s);
      ey += 10;
      if (lvl >= 2 && p.sub) { drawText(ctx, ellipsize(p.sub, pg.w - 12), pg.x + 6, ey, { color: INK_SOFT }); ey += 10; }
      // the picture, in a framed window
      const ah = Math.min(70, Math.round(pg.h * 0.34));
      const ax = pg.x + 6, aw = pg.w - 12;
      ctx.fillStyle = '#e4cf98'; ctx.fillRect(ax, ey, aw, ah);
      ctx.fillStyle = '#c8a870'; ctx.fillRect(ax, ey + ah - 8, aw, 8);
      ctx.fillStyle = 'rgba(58,34,16,0.5)';
      ctx.fillRect(ax, ey, aw, 1); ctx.fillRect(ax, ey + ah - 1, aw, 1);
      ctx.fillRect(ax, ey, 1, ah); ctx.fillRect(ax + aw - 1, ey, 1, ah);
      const pic = p.icon ? null : art(st.tab, p);
      const bob = Math.round(Math.sin(ui.t * 2) * 1);
      if (lvl >= 1) {
        if (pic) drawPortrait(ctx, pic, ax + 4, ey + 3 + bob, aw - 8, ah - 8, { shadow: lvl < 2, max: 3, bottom: true });
        else if (p.icon) drawIcon(ctx, p.icon, ax + aw / 2, ey + ah / 2 + bob, ah > 50 ? 3 : 2, { variant: lvl < 2 ? 'shadow' : '' });
      } else {
        drawText(ctx, '?', ax + aw / 2, ey + ah / 2 - 7, { color: INK_FAINT, align: 'center', scale: 2 });
      }
      ey += ah + 5;
      // what it is, if you have recorded it
      const body = lvl >= 2 ? p.desc : lvl === 1 ? 'Seen, but not yet studied.' : 'Not yet found.';
      const maxL = Math.max(1, Math.floor((pg.y + pg.h - 30 - ey) / LINE_H));
      wrapText(body, pg.w - 12).slice(0, maxL).forEach((l, n) =>
        drawText(ctx, l, pg.x + 6, ey + n * LINE_H, { color: lvl >= 2 ? INK : INK_SOFT }));
      // and what to do next, at the foot
      const fy = pg.y + pg.h - 22;
      ctx.fillStyle = 'rgba(168,140,88,0.5)'; ctx.fillRect(pg.x + 6, fy - 3, pg.w - 12, 1);
      const next = lvl >= 3 ? 'Mastered.' : tab.how[lvl] && tab.how[lvl] !== '-' ? tab.how[lvl] : tab.how[Math.min(2, lvl + 1)];
      drawIcon(ctx, lvl >= 3 ? 'star' : 'arrow', pg.x + 12, fy + 8, 1);
      wrapText(next || '', pg.w - 28).slice(0, 2).forEach((l, n) =>
        drawText(ctx, l, pg.x + 22, fy + 2 + n * LINE_H, { color: lvl >= 3 ? '#2e6a26' : '#7a3e1c' }));
    }
  }

  // ---- the X ------------------------------------------------------------------
  const cs = 14;
  const cx = x + bw - cs - 2, cy = y - 4;
  const ch = ui._hit(cx, cy, cs, cs);
  K.bezel(ctx, cx, cy, cs, cs, { rim: 1, curls: false,
    body: ch ? ['#f05a48', '#d8402e', '#b82a2a', '#701818'] : ['#d84a38', '#b82a2a', '#8a1e1e', '#5a1010'] });
  for (let n = 0; n < cs - 7; n++) {
    ctx.fillStyle = '#fff0e0';
    ctx.fillRect(cx + 3 + n, cy + 3 + n, 2, 1);
    ctx.fillRect(cx + cs - 5 - n, cy + 3 + n, 2, 1);
  }
  if (ch && i.clicked) { i.clicked = false; ui.closeBook(); }
  // a click anywhere off the book closes it too
  if (i.clicked && !ui._hit(x - 4, y - 6, w + 8, h + 12)) { i.clicked = false; ui.closeBook(); }
  if (i.clicked) i.clicked = false;
}

/** A page of parchment. */
function paper(ctx, x, y, w, h, side) {
  ctx.fillStyle = PAPER[1]; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAPER[0]; ctx.fillRect(x + 1, y + 1, w - 2, 2);
  // the page curls down into the gutter and away at the fore-edge
  ctx.fillStyle = PAPER[2];
  if (side === 'left') ctx.fillRect(x + w - 4, y, 4, h);
  if (side === 'right') ctx.fillRect(x, y, 4, h);
  ctx.fillStyle = PAPER[3];
  if (side === 'left') ctx.fillRect(x + w - 1, y, 1, h);
  if (side === 'right') ctx.fillRect(x, y, 1, h);
  // the stack of pages under this one, showing at the foot
  ctx.fillStyle = PAPER[2]; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillStyle = PAPER[3]; ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
  // a few fibres, so it is paper and not a fill
  ctx.fillStyle = 'rgba(168,140,88,0.25)';
  for (let n = 0; n < Math.floor((w * h) / 900); n++) {
    const fx = x + 4 + ((n * 53) % Math.max(1, w - 8));
    const fy = y + 6 + ((n * 97) % Math.max(1, h - 12));
    ctx.fillRect(fx, fy, 2, 1);
  }
}

/** An entry square on the page: a sunk frame of darker paper. */
function entrySlot(ctx, x, y, s, lvl, on, hot) {
  ctx.fillStyle = on ? '#a86c14' : hot ? '#c8a870' : '#a88c58';
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = lvl >= 2 ? '#fffbe8' : '#e4cf98';
  ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
  ctx.fillStyle = lvl >= 2 ? '#f2e2b4' : '#d8c088';
  ctx.fillRect(x + 1, y + s - 5, s - 2, 4);
  if (on) {
    ctx.fillStyle = '#ffd648';
    ctx.fillRect(x, y, s, 1); ctx.fillRect(x, y, 1, s);
  }
}

/** A small gold star, lit or not. */
function star(ctx, x, y, on) {
  const rows = ['..1..', '.121.', '12321', '.232.', '2...2'];
  const col = on ? { 1: '#fff6c2', 2: '#e6a51c', 3: '#ffd648' } : { 1: '#d8c088', 2: '#a88c58', 3: '#c8a870' };
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = col[ch];
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
}
