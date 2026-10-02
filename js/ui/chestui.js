// CRABDEN - the camp's interface: the chest, the kit you pitch, the night.
//
// The chest is a stone window like every other one (ui/kit.js): the chest's
// own slots on one side, his pack on the other, and a click or a tap on a
// stack carries it across. Nothing in it is a list of words; every slot is
// the thing itself with a count on it.
//
// The kit is a short bar of five stones - fire, bedroll, tent, chest, torch -
// with what the chosen one costs written under it. The night is a black
// screen and a card with the day on it.

import { clamp, clamp01, lerp, easeOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { ITEM_BY_ID } from '../data/craft.js';
import { drawNodeIcon } from './icons.js';
import { drawIcon } from './iconcore.js';
import * as K from './kit.js';
import { campArt } from '../art/campart.js';

const OUT = 'rgba(12,8,5,0.8)';
const hit = (i, r, pad = 0) => !!r && i.sx >= r.x - pad && i.sx <= r.x + r.w + pad && i.sy >= r.y - pad && i.sy <= r.y + r.h + pad;

// ---------------------------------------------------------------------------
// the chest

export class ChestUI {
  constructor(camp) {
    this.camp = camp;
    this.open = false;
    this.piece = null;
    this.items = null;
    this.t = 0;
    this.rects = [];
    this.flies = [];
    this.hoverId = null;
  }

  show(piece, items) {
    this.open = true;
    this.piece = piece;
    this.items = items;
    this.t = 0;
    this.flies.length = 0;
  }

  close() {
    if (this.open) this.camp.game.audio?.play('ui', { pitch: 0.8 });
    this.open = false;
    this.piece = null;
    this.items = null;
  }

  update(dt) {
    this.t += dt;
    if (this.note && (this.note.t -= dt) <= 0) this.note = null;
    for (let n = this.flies.length - 1; n >= 0; n--) {
      this.flies[n].t += dt * 3.2;
      if (this.flies[n].t >= 1) this.flies.splice(n, 1);
    }
  }

  input(i) {
    const g = this.camp.game;
    for (const k of ['Escape', 'e', 'Tab', 'Enter']) {
      if (i.justPressed(k)) { for (const c of ['Escape', 'e', 'Tab', 'Enter']) i.consumeKey(c); this.close(); return; }
    }
    // the window owns every key while it is up
    for (const k of [' ', 'Space', 'q', 'r', 'f', 'c', 'x', 'k', 'l', 'v', 'z', 'p', 'b', 'g', 'j', 'm', '1', '2', '3', '4']) i.consumeKey(k);
    const one = i.key('Shift') || i.rightClicked;
    if (!(i.clicked || i.rightClicked)) return;
    const was = i.clicked;
    i.clicked = false; i.rightClicked = false;
    if (this.t < 0.15) return;
    for (const r of this.rects) {
      if (r.kind === 'window' || r.kind === 'chestArea' || r.kind === 'packArea' || !hit(i, r)) continue;
      if (r.kind === 'close') { this.close(); return; }
      if (r.kind === 'takeAll' || r.kind === 'storeAll') {
        const toChest = r.kind === 'storeAll';
        const ids = toChest ? g.craft.list().map((e) => e.def.id) : this.items.map((e) => e[0]);
        let moved = 0;
        for (const id of ids) if (this.camp.moveStack(this.items, id, toChest)) moved++;
        if (!moved) g.audio?.play('deny');
        else this.note = { text: toChest ? 'Everything in the chest.' : 'Everything in the pack.', t: 2.2 };
        return;
      }
      if (!r.id) return;
      const toChest = r.kind === 'pack';
      const had = g.craft.count(r.id);
      if (this.camp.moveStack(this.items, r.id, toChest, one ? 1 : Infinity)) {
        const def = ITEM_BY_ID[r.id];
        const n = Math.abs(g.craft.count(r.id) - had);
        this.note = { text: `${toChest ? 'Stored' : 'Took'} ${n} ${def ? def.name : r.id}`, t: 2.2 };
        const dest = this.rects.find((q) => q.kind === (toChest ? 'chestArea' : 'packArea'));
        if (def && dest) this.flies.push({ icon: def.icon, tint: def.tint, x0: r.x + r.w / 2, y0: r.y + r.h / 2,
          x1: dest.x + dest.w / 2, y1: dest.y + 6, t: 0 });
      }
      return;
    }
    // a click outside the window closes it, the way a click off any card does
    const box = this.rects.find((q) => q.kind === 'window');
    if (was && box && !hit(i, box)) this.close();
  }

  draw(ctx, W, H) {
    const g = this.camp.game;
    const i = g.input;
    const touch = g.ui.touchEnabled;
    this.rects = [];
    const a = easeOutCubic(clamp01(this.t / 0.22));
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = '#0b0806';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const narrow = W < 330;
    const S = touch ? 26 : 22, gap = 2;
    const w = narrow ? W - 10 : Math.min(W - 16, 372);
    const h = narrow ? Math.min(H - 24, 332) : Math.min(H - 16, 212);
    const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2 + (1 - a) * 10);
    const camp = this.piece?.camp;
    const title = camp?.kind === 'main' ? "VESS'S CHEST" : camp?.kind === 'player' ? 'YOUR CHEST' : 'AN OLD CHEST';
    const closeR0 = { x: x + w - 16, y: y + 3, w: 13, h: 13 };
    const pg = K.windowFrame(ctx, x, y, w, h, { title, closeHot: hit(i, closeR0), closeDown: hit(i, closeR0) && i.down });
    this.rects.push({ kind: 'window', x, y, w, h });
    if (pg.close) this.rects.push({ kind: 'close', ...pg.close });

    const footH = narrow ? 54 : touch ? 46 : 40;
    const items = this.items || [];
    const bag = g.craft.list();
    const slotsN = this.camp.slots;
    // chest slots, then the pack
    let chestBox, packBox;
    if (narrow) {
      const fit = Math.max(1, Math.floor((pg.w + gap) / (S + gap)));
      let cols = fit;
      for (let c = fit; c >= 3; c--) if (slotsN % c === 0) { cols = c; break; }
      const crow = Math.ceil(slotsN / cols);
      chestBox = { x: pg.x, y: pg.y + 2, w: pg.w, cols, rows: crow };
      const py = chestBox.y + 12 + crow * (S + gap) + 8;
      const fitRows = Math.max(1, Math.floor((pg.y + pg.h - footH - py - 12) / (S + gap)));
      const prow = Math.min(fitRows, Math.max(2, Math.ceil((g.craft.list().length + 1) / fit)));
      packBox = { x: pg.x, y: py, w: pg.w, cols: fit, rows: prow };
    } else {
      const half = Math.floor((pg.w - 8) / 2);
      const fit = Math.max(1, Math.floor((half + gap) / (S + gap)));
      let ccols = fit;
      for (let c = fit; c >= 3; c--) if (slotsN % c === 0) { ccols = c; break; }
      chestBox = { x: pg.x, y: pg.y + 2, w: half, cols: ccols, rows: Math.ceil(slotsN / ccols) };
      const pcols = fit;
      const prow = Math.max(1, Math.floor((pg.h - footH - 14) / (S + gap)));
      packBox = { x: pg.x + half + 8, y: pg.y + 2, w: half, cols: pcols, rows: prow };
      // the divide between them: a chain hung down the slab
      K.chain(ctx, pg.x + half + 3, pg.y + 4, pg.h - footH - 6, true);
    }
    const grid = (box, list, kind, cap, label) => {
      K.heading(ctx, box.x, box.y, box.w, label);
      const gw = box.cols * (S + gap) - gap;
      const ox = box.x + Math.floor((box.w - gw) / 2);
      this.rects.push({ kind: kind + 'Area', x: ox, y: box.y + 12, w: gw, h: box.rows * (S + gap) });
      const n = Math.min(cap, box.cols * box.rows);
      for (let k = 0; k < n; k++) {
        const sx = ox + (k % box.cols) * (S + gap), sy = box.y + 12 + Math.floor(k / box.cols) * (S + gap);
        const e = list[k];
        const r = { kind, id: e ? e.id : null, x: sx, y: sy, w: S, h: S };
        const hot = !!e && hit(i, r) && !touch;
        K.slot(ctx, sx, sy, S, S, { empty: !e, hot });
        if (!e) continue;
        this.rects.push(r);
        drawNodeIcon(ctx, e.def.icon, sx + S / 2, sy + S / 2 - 1, e.def.tint, 1);
        drawText(ctx, `${e.n}`, sx + S - 3, sy + S - 9, { color: '#ffeec0', align: 'right', outline: true, outlineColor: OUT });
        if (hot) this.hoverId = e.id;
      }
      if (list.length > n) drawText(ctx, `+${list.length - n} more`, box.x + box.w, box.y + 1, { color: K.C.inkSoft, align: 'right' });
    };
    this.hoverId = null;
    const chestList = items.map(([id, n]) => ({ id, n, def: ITEM_BY_ID[id] })).filter((e) => e.def);
    const packList = bag.map((e) => ({ id: e.def.id, n: e.n, def: e.def }));
    grid(chestBox, chestList, 'chest', slotsN, `IN THE CHEST  ${chestList.length}/${slotsN}`);
    grid(packBox, packList, 'pack', 99, 'HIS PACK');
    if (!packList.length) {
      const pa = this.rects.find((q) => q.kind === 'packArea');
      if (pa) drawText(ctx, 'Nothing in his pack.', pa.x + pa.w / 2, pa.y + Math.min(pa.h, S * 2) / 2 - 3,
        { color: K.C.inkSoft, align: 'center', outline: true, outlineColor: OUT });
    }
    // the chest itself, open, in the room under its slots
    {
      const art = campArt('chestOpen');
      const under = narrow ? packBox : chestBox;
      const top = under.y + 12 + under.rows * (S + gap) + 4;
      const room = pg.y + pg.h - footH - 6 - top;
      const sc = clamp(Math.floor(Math.min(room / (art.h + 6), (under.w - 20) / art.w)), 1, 4);
      if (sc >= 2) {
        const ax = Math.round(under.x + under.w / 2 - art.w * sc / 2), ay = Math.round(top + (room - art.h * sc - 8) / 2);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#0b0806';
        ctx.fillRect(ax + 2 * sc, ay + (art.oy + 1) * sc, (art.w - 4) * sc, 2 * sc);
        ctx.restore();
        ctx.drawImage(art.cv, ax, ay, art.w * sc, art.h * sc);
        const nm = camp?.name || '';
        drawText(ctx, ellipsize(nm, under.w - 4), under.x + under.w / 2, ay + (art.oy + 3) * sc,
          { color: 'rgba(246,234,208,0.45)', align: 'center' });
      }
    }

    // the foot: what is under the pointer, and the two move-everything stones
    const fy = pg.y + pg.h - footH + 4;
    K.rule(ctx, pg.x, fy - 3, pg.w);
    const bw = touch ? 72 : 64, bh = touch ? 20 : 16;
    const takeR = { kind: 'takeAll', x: pg.x + pg.w - bw * 2 - 4, y: fy + footH - bh - 8, w: bw, h: bh };
    const storeR = { kind: 'storeAll', x: pg.x + pg.w - bw, y: takeR.y, w: bw, h: bh };
    for (const r of [takeR, storeR]) {
      const hot = hit(i, r);
      K.button(ctx, r.x, r.y, r.w, r.h, r.kind === 'takeAll' ? 'TAKE ALL' : 'STORE ALL',
        { hot, down: hot && i.down, disabled: r.kind === 'takeAll' ? !chestList.length : !packList.length });
      this.rects.push(r);
    }
    const hov = this.hoverId ? ITEM_BY_ID[this.hoverId] : null;
    const tw = narrow ? pg.w : takeR.x - pg.x - 6;
    if (hov) {
      drawText(ctx, ellipsize(hov.name, tw), pg.x, fy + 2, { color: K.C.goldLit });
      const ls = wrapText(hov.desc || '', tw);
      ls.slice(0, 2).forEach((l, n) => drawText(ctx, n === 1 && ls.length > 2 ? ellipsize(l + ' ...', tw) : l, pg.x, fy + 2 + LINE_H * (n + 1), { color: K.C.inkSoft }));
    } else if (this.note) {
      drawText(ctx, ellipsize(this.note.text, tw), pg.x, fy + 2, { color: '#b8e08a' });
    } else {
      const lines = wrapText(touch ? 'Tap a stack to carry it across.' : 'Click a stack to carry it across.  Shift-click: just one.', tw);
      lines.slice(0, 2).forEach((l, n) => drawText(ctx, l, pg.x, fy + 2 + n * LINE_H, { color: K.C.inkSoft }));
    }
    if (!touch && !hov) drawText(ctx, 'E / ESC  close', pg.x, fy + footH - 14, { color: 'rgba(246,234,208,0.4)' });

    // whatever is in the air between them
    for (const f of this.flies) {
      const u = easeOutCubic(f.t);
      const fx = lerp(f.x0, f.x1, u), fy2 = lerp(f.y0, f.y1, u) - Math.sin(u * Math.PI) * 14;
      ctx.save();
      ctx.globalAlpha = 1 - f.t * 0.6;
      drawNodeIcon(ctx, f.icon, Math.round(fx), Math.round(fy2), f.tint, 1);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// the kit

/**
 * Where the kit bar goes. On a phone it sits over the thumbs, under the
 * ground; on a desk it hangs from the top of the screen, well clear of the
 * ground you click to put things on.
 */
export function kitLayout(W, H, camp) {
  const g = camp.game;
  const touch = g.ui.touchEnabled;
  const S = touch ? 30 : 26, gap = 3, n = 5;
  const w = Math.min(W - 8, Math.max(n * S + (n - 1) * gap + 14, 214));
  const h = S + 42;
  const y = touch ? Math.max(60, Math.round(g.ui.furnitureTop(W, H) - 10 - h)) : 18;
  return { x: Math.round((W - w) / 2), y, w, h, S, gap };
}

function xStone(ctx, x, y, s, hot, down) {
  K.bezel(ctx, x, y, s, s, { rim: 1, moss: false, state: down ? 'down' : hot ? 'hot' : 'rest',
    body: hot ? ['#e2563e', '#c8402e', '#a82e22', '#6a1a12'] : ['#b8402e', '#9a3022', '#7a2218', '#4e140c'] });
  const o = down ? 1 : 0;
  ctx.fillStyle = '#fde8d0';
  for (let k = 0; k < s - 6; k++) {
    ctx.fillRect(x + 3 + k + o, y + 3 + k + o, 1, 1);
    ctx.fillRect(x + s - 4 - k + o, y + 3 + k + o, 1, 1);
  }
}

export function drawCampKit(ctx, W, H, camp, L) {
  const g = camp.game, i = g.input, pl = camp.placing;
  const touch = g.ui.touchEnabled;
  const { x, y, w, h, S, gap } = L;
  const out = { box: { x, y: y - 8, w, h: h + 8 }, slots: [], close: null };
  K.plaque(ctx, x, y, w, h, {});
  K.banner(ctx, x + w / 2, y - 7, 'PITCH CAMP', { minW: 84 });
  const kit = KIT_REF.list;
  const n = kit.length;
  const sx0 = x + Math.round((w - (n * S + (n - 1) * gap)) / 2);
  const sy = y + 8;
  kit.forEach((e, k) => {
    const sx = sx0 + k * (S + gap);
    const r = { k: e.k, x: sx, y: sy, w: S, h: S };
    const on = pl.k === e.k;
    const can = camp.afford(e.k);
    const hot = hit(i, r) && !touch;
    K.slot(ctx, sx, sy, S, S, { on, hot });
    drawIcon(ctx, e.k, sx + S / 2, sy + S / 2, 1, { gray: !can });
    out.slots.push(r);
  });
  // what the chosen one is, and what it costs
  const sel = kit.find((e) => e.k === pl.k);
  const ty = sy + S + 8;
  if (sel) {
    const name = PIECE_NAMES[sel.k] || sel.k;
    drawText(ctx, name, x + 7, ty, { color: K.C.goldLit, outline: true, outlineColor: OUT });
    // what it costs, right-aligned: the thing, how many you have of how many
    let tx = x + w - 6;
    for (const [id, need] of [...sel.cost].reverse()) {
      const have = g.craft.count(id);
      const def = ITEM_BY_ID[id];
      const s = `${Math.min(have, 99)}/${need}`;
      tx -= textWidth(s);
      drawText(ctx, s, tx, ty, { color: have >= need ? '#b8e08a' : '#f08a6a', outline: true, outlineColor: OUT });
      tx -= 9;
      if (def) drawNodeIcon(ctx, def.icon, tx, ty + 3, def.tint, 1);
      tx -= 14;
    }
    const why = pl.why;
    const tip = why || (touch ? 'Tap the ground, then PLACE.' : 'Click the ground, or E.');
    drawText(ctx, ellipsize(tip, w - 14), x + 7, ty + 13, { color: why ? '#f0a080' : K.C.inkSoft });
  }
  const cs = 12;
  const cr = { x: x + w - cs - 2, y: y - 4, w: cs, h: cs };
  xStone(ctx, cr.x, cr.y, cs, hit(i, cr), hit(i, cr) && i.down);
  out.close = cr;
  return out;
}

// the kit list and piece names, handed over by camp.js so this file does not
// import it back (camp.js imports this one)
const KIT_REF = { list: [] };
const PIECE_NAMES = {};
export function setKit(list, pieces) {
  KIT_REF.list = list;
  for (const [k, v] of Object.entries(pieces)) PIECE_NAMES[k] = v.name;
}

/** The stone in the corner that opens the kit. Returns its rectangle. */
export function drawCampButton(ctx, W, H, camp) {
  const g = camp.game, i = g.input;
  const bs = 30;
  const x = W - 33, y = 24 + 44 + bs + 14;
  if (y + bs + 10 > H * 0.5) return null;
  const r = { x, y, w: bs, h: bs };
  const hot = hit(i, r) && !g.ui.touchEnabled;
  K.slot(ctx, x, y, bs, bs, { hot, on: !!camp.placing });
  drawIcon(ctx, 'tent', x + bs / 2, y + bs / 2, 1);
  drawText(ctx, 'CAMP', x + bs / 2, y + bs + 2, { color: '#f4c96a', align: 'center', outline: true, outlineColor: OUT });
  if (!g.ui.touchEnabled) {
    K.pebble(ctx, x - 2, y - 2, 9, 9, {});
    drawText(ctx, 'P', x + 2, y, { color: K.C.ink, align: 'center' });
  }
  return r;
}

// ---------------------------------------------------------------------------
// the night

export function drawSleepCard(ctx, W, H, camp) {
  const s = camp.sleep;
  const a = camp.blackout;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  if (s.phase === 'out') {
    // the last of the firelight, closing like an eye
    ctx.save();
    ctx.globalAlpha = clamp01(s.t / 1.1) * 0.6;
    const r = Math.round(Math.max(W, H) * (1 - clamp01(s.t / 1.1)) * 0.7);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, Math.max(0, H / 2 - r));
    ctx.fillRect(0, H / 2 + r, W, H);
    ctx.restore();
    return;
  }
  const t = s.phase === 'card' ? s.t : 2.8 + s.t;
  const ca = Math.min(clamp01(t / 0.6), clamp01((3.6 - t) / 0.7));
  if (ca <= 0.01) return;
  const sc = W > 420 ? 3 : 2;
  const cy = Math.round(H * 0.42 - (1 - ca) * 6);
  ctx.save();
  ctx.globalAlpha = ca;
  // a little window onto the morning: the sun coming up over the dunes
  const k = clamp01(t / 2.6);
  const vw = 72, vh = 26;
  const vx = Math.round(W / 2 - vw / 2), vy = Math.round(cy - 4 * sc - vh - 12);
  sunrise(ctx, vx, vy, vw, vh, easeOutCubic(k), camp.game.time);
  ctx.globalAlpha = ca;
  drawText(ctx, `DAY ${s.day}`, W / 2, cy - 4 * sc, { color: '#fff3d2', align: 'center', scale: sc, outline: true, outlineColor: '#000' });
  const lw = Math.min(W - 40, textWidth(`DAY ${s.day}`, sc) + 40);
  K.rule(ctx, Math.round(W / 2 - lw / 2), cy + 4 * sc + 3, Math.round(lw));
  const hrs = Math.round(s.hours || 0);
  drawText(ctx, `${hrs} hours slept. Saved.`, W / 2, cy + 4 * sc + 8, { color: K.C.gold, align: 'center' });
  const lines = wrapText(s.line || '', Math.min(W - 30, 260));
  lines.forEach((l, n) => drawText(ctx, l, W / 2, cy + 4 * sc + 10 + LINE_H * (n + 1), { color: K.C.inkSoft, align: 'center' }));
  ctx.restore();
}

const SKY = [[0.0, '#1a1f38'], [0.45, '#4a3a58'], [0.75, '#b0605a'], [1.0, '#f2a560']];
function skyAt(v, k) {
  // the whole sky warms as the sun comes up
  const u = clamp01(v * (0.7 + k * 0.4));
  let a = SKY[0], b = SKY[SKY.length - 1];
  for (let n = 0; n < SKY.length - 1; n++) if (u >= SKY[n][0] && u <= SKY[n + 1][0]) { a = SKY[n]; b = SKY[n + 1]; break; }
  const f = (u - a[0]) / Math.max(0.001, b[0] - a[0]);
  const pa = parseInt(a[1].slice(1), 16), pb = parseInt(b[1].slice(1), 16);
  const ch = (sh) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, f));
  return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}

/** A sunrise in a stone frame: `k` 0..1 is how far up the sun is. */
function sunrise(ctx, x, y, w, h, k, t) {
  K.bezel(ctx, x - 3, y - 3, w + 6, h + 6, { rim: 2, moss: false });
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const hz = y + h - 8;
  for (let yy = y; yy < hz; yy++) {
    ctx.fillStyle = skyAt((yy - y) / (hz - y), k);
    ctx.fillRect(x, yy, w, 1);
  }
  // the last stars going out
  ctx.fillStyle = '#e8e4f0';
  for (let n = 0; n < 9; n++) {
    const sx = x + ((n * 37) % w), sy = y + 1 + ((n * 13) % 9);
    if ((n * 0.37 + k) % 1 > k * 1.2) ctx.fillRect(sx, sy, 1, 1);
  }
  // the sun, and the light it throws along the horizon
  const sx = Math.round(x + w / 2), sy = Math.round(hz + 6 - k * 13);
  ctx.globalAlpha = 0.35 * k;
  ctx.fillStyle = '#ffd890';
  ctx.fillRect(x, hz - 2, w, 2);
  ctx.globalAlpha = 1;
  const disc = (r, c) => {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.round(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(sx - hw, sy + dy, hw * 2 + 1, 1);
    }
  };
  disc(6, '#f7b850'); disc(5, '#ffd870'); disc(3, '#fff2b8');
  // the dunes, black against it, and the camp's smoke going straight up
  for (let xx = x; xx < x + w; xx++) {
    const u = (xx - x) / w;
    const top = Math.round(hz - 1 - Math.sin(u * 5.2 + 0.6) * 1.6 - Math.sin(u * 13.1) * 0.8
      + (u > 0.62 && u < 0.86 ? -2.5 * Math.sin((u - 0.62) / 0.24 * Math.PI) : 0));
    ctx.fillStyle = '#20140c';
    ctx.fillRect(xx, top, 1, y + h - top);
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(xx, top, 1, 1);
  }
  const fx = x + 16;
  ctx.fillStyle = '#ff9a3a'; ctx.fillRect(fx, hz - 2, 1, 1);
  ctx.fillStyle = '#ffd36a'; ctx.fillRect(fx, hz - 3, 1, 1);
  ctx.fillStyle = 'rgba(200,190,180,0.45)';
  for (let n = 0; n < 5; n++) ctx.fillRect(fx + Math.round(Math.sin(t * 1.3 + n) * 1.2), hz - 5 - n * 3, 1 + (n >> 1), 2);
  ctx.restore();
}
