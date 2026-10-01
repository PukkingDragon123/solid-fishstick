// CRABDEN - the work, played on the thing itself.
//
// Mining, digging, cutting, studying and searching used to open a window in
// the middle of the screen. Now there is no window. Over the rock you are
// breaking - or the patch of sand, or the tree - a short stone bar stands in
// the air with a crack running through part of it, and your tool rides back
// and forth along it. Bring the tool down when it is over the crack and the
// crab brings its claw down on the rock in the same instant; the bright heart
// of the crack is a clean break. Miss, and the stone just rings.
//
// It is still one big target: on a phone the whole screen is the strike, on a
// desktop it is a click, E, space or enter. The only other thing on screen is
// a little stone with an X on it, for putting the tool down.

import * as K from './kit.js';
import { iconCanvas } from './iconcore.js';
import { drawText, textWidth } from '../lib/font.js';
import { clamp, clamp01, easeOutCubic, lerp } from '../lib/math.js';

const OUT = '#0e0b09';
const TOOL = { mine: 'pickaxe', dig: 'spade', fell: 'axe', study: 'magnifier', search: 'magnifier' };
const CORE = 0.32;   // must match work.js

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

function h32(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Lighten or darken a #rrggbb colour by k (-1..1). */
function shade(hex, k) {
  const p = parseInt(String(hex).replace('#', '').slice(0, 6), 16);
  if (Number.isNaN(p)) return hex;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = f((p >> 16) & 255), g = f((p >> 8) & 255), b = f(p & 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Where the bar goes, so the game's own click test and the drawing agree. */
export function workBarBox(ui, W, H) {
  const g = ui.game;
  const j = g.work?.job;
  if (!j) return null;
  const touch = !!ui.touchEnabled;
  const bw = touch ? 124 : 100, bh = touch ? 13 : 11;
  // just over the rock, and leaning away from whoever is swinging at it so
  // the tool is never lost against the animal's own face
  const s = g.cam.worldToScreen(j.x, j.top ?? j.y - 18);
  const away = j.by ? (j.x >= j.by.x ? 1 : -1) : 0;
  const cx = s.x + away * bw * 0.30;
  const x = Math.round(clamp(cx - bw / 2, 8, W - bw - 22));
  const y = Math.round(clamp(s.y - bh - (touch ? 22 : 18), 30, H - bh - 70));
  return { x, y, w: bw, h: bh, touch };
}

/**
 * Draw the bar and everything that belongs to it, and the loot that bursts
 * out of a finished job. Returns true while a timing job is on, so the caller
 * knows the screen is a strike button.
 */
export function drawWorldWork(ui, ctx, W, H) {
  const g = ui.game;
  const work = g.work;
  if (!work) return false;
  if (work.result) drawLoot(ui, ctx, W, H, work.result);
  const j = work.job;
  if (!j || !j.def.popup) { ui.workStopRect = null; return false; }
  const box = workBarBox(ui, W, H);
  const t = ui.t;
  // it rises into place when the job starts, and shakes when a stroke rings off
  const rise = easeOutCubic(clamp01(j.t / 0.28));
  const sh = j.shake > 0 ? Math.round(Math.sin(t * 61) * j.shake * 2) : 0;
  const x = box.x + sh, y = Math.round(box.y + (1 - rise) * 10);
  ctx.save();
  ctx.globalAlpha *= rise;

  // ---- the bar: a short slab of stone with a groove along it -------------
  const bw = box.w, bh = box.h;
  R(ctx, x + 2, y + bh, bw - 2, 2, 'rgba(0,0,0,0.30)');            // its shadow
  R(ctx, x + 2, y, bw - 4, bh, OUT);
  R(ctx, x + 1, y + 1, bw - 2, bh - 2, OUT);
  R(ctx, x, y + 2, bw, bh - 4, OUT);
  K.texture(ctx, 'stone', x + 2, y + 1, bw - 4, bh - 2, x, y);
  K.texture(ctx, 'stone', x + 1, y + 2, bw - 2, bh - 4, x, y);
  R(ctx, x + 2, y + 1, bw - 4, 1, '#dccfb4');
  R(ctx, x + 1, y + 2, 1, bh - 4, '#b6a98f');
  R(ctx, x + 2, y + bh - 2, bw - 4, 1, '#3c3630');
  R(ctx, x + bw - 2, y + 2, 1, bh - 4, '#564e44');
  // the ends are broken off rather than cut
  for (const [ex, dir] of [[x, 1], [x + bw - 1, -1]]) {
    R(ctx, ex, y + 2, 1, 1, OUT);
    R(ctx, ex + dir, y + bh - 3, 1, 1, OUT);
  }
  // the groove the tool rides in
  const gx = x + 4, gw = bw - 8, gy = y + Math.floor(bh / 2) - 2, gh = 4;
  R(ctx, gx, gy, gw, gh, '#1d1a17');
  R(ctx, gx, gy, gw, 1, OUT);
  R(ctx, gx, gy + gh, gw, 1, '#918572');

  // ---- the crack: the part of the bar worth hitting -----------------------
  const half = j.band / 2;
  const c0 = gx + Math.round((j.centre - half) * gw), c1 = gx + Math.round((j.centre + half) * gw);
  const k0 = gx + Math.round((j.centre - half * CORE) * gw), k1 = gx + Math.round((j.centre + half * CORE) * gw);
  const col = j.chip || j.def.tint || '#d89c3c';
  const lit = shade(col, 0.35), deep = shade(col, -0.35);
  R(ctx, c0, gy, c1 - c0, gh, deep);
  R(ctx, c0, gy + 1, c1 - c0, gh - 2, col);
  R(ctx, c0, gy + 1, c1 - c0, 1, lit);
  // the heart of it glows, and a glint runs along it
  const pulse = 0.55 + 0.45 * Math.sin(t * 7);
  R(ctx, k0, gy, Math.max(1, k1 - k0), gh, shade(col, 0.55 + pulse * 0.25));
  R(ctx, k0, gy + 1, Math.max(1, k1 - k0), 1, '#fffbe8');
  // the crack runs out into the stone above and below the groove
  for (let i = 0; i < 3; i++) {
    const cx = Math.round(lerp(c0 + 1, c1 - 2, (i + 0.5) / 3));
    const up = i % 2 === 0;
    let px = cx, py = up ? gy - 1 : gy + gh + 1;
    for (let k = 0; k < 2 + (i === 1 ? 1 : 0); k++) {
      R(ctx, px, py, 1, 1, '#0e0b09');
      px += h32(i, k) > 0.5 ? 1 : -1;
      py += up ? -1 : 1;
    }
  }
  // how far through the job you are: the cracks spreading along the bar's face
  const n = j.strikes || 4;
  const got = Math.min(n, Math.round(j.done * n));
  for (let i = 0; i < n; i++) {
    const px = Math.round(x + bw / 2 + (i - (n - 1) / 2) * 7) - 2;
    const py = y + bh + 3;
    R(ctx, px, py, 5, 4, OUT);
    R(ctx, px + 1, py, 3, 4, OUT);
    if (i < got) {
      R(ctx, px + 1, py + 1, 3, 2, i === got - 1 && j.last && j.last.t < 0.3 ? '#fff0c4' : '#f4c96a');
      R(ctx, px + 1, py + 1, 3, 1, '#fff7dc');
    } else {
      R(ctx, px + 1, py + 1, 3, 2, '#3c3630');
      R(ctx, px + 1, py + 1, 3, 1, '#564e44');
    }
  }

  // ---- the tool, riding along it -------------------------------------------
  const nx = gx + Math.round(j.needle * gw);
  const cv = iconCanvas(TOOL[j.kind] || 'pickaxe', 1);
  // a stroke brings it down hard and it lifts off again
  const since = j.last ? j.last.t : 9;
  const hit = since < 0.06 ? since / 0.06 : since < 0.22 ? 1 - (since - 0.06) / 0.16 : 0;
  const idle = Math.sin(t * 5.2) * 0.07 + (j.dir > 0 ? 0.05 : -0.05);
  const ang = -0.42 + idle + hit * 0.62;
  if (cv) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // In its picture the handle runs down to the bottom-left corner and the
    // head is up at the top-right. Hold it by the end of the handle, off to
    // the left of the tick, and the head swings down onto the groove.
    const px = nx - 10, py = gy + 1 + Math.round(hit * 2);
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.drawImage(cv, -1, -cv.height + 2);
    ctx.restore();
  }
  // a tick under the tool, so you can see exactly where it is
  R(ctx, nx - 1, gy - 1, 3, gh + 2, OUT);
  R(ctx, nx, gy, 1, gh, j.last && since < 0.25 ? '#fffbe8' : '#f6ead0');

  // ---- what that stroke was ------------------------------------------------
  if (j.last && since < 0.7) {
    const kind = j.last.kind;
    const word = kind === 'core' ? 'CRACK!' : kind === 'hit' ? 'GOOD' : 'CLANG';
    const wc = kind === 'core' ? '#ffe27a' : kind === 'hit' ? '#b4ec8a' : '#f08060';
    ctx.save();
    ctx.globalAlpha *= clamp01((0.7 - since) / 0.3);
    const wy = y - 22 - Math.round(easeOutCubic(clamp01(since / 0.7)) * 8);
    const wx = clamp(nx, textWidth(word) / 2 + 4, W - textWidth(word) / 2 - 4);
    drawText(ctx, word, wx, wy, { color: wc, align: 'center', outline: true, outlineColor: OUT });
    ctx.restore();
  }

  // ---- what to press, for the first couple of strokes ----------------------
  if (j.strokes < 2) {
    const blink = Math.sin(t * 6) > -0.3;
    const msg = box.touch ? 'TAP when the tool is on the crack' : 'when the tool is on the crack';
    const tw = textWidth(msg) + (box.touch ? 0 : 12);
    const mx = Math.round(clamp(x + bw / 2 - tw / 2, 4, W - tw - 4)), my = y + bh + 10;
    if (!box.touch) {
      K.pebble(ctx, mx, my - 2, 9, 10, { dark: !blink });
      drawText(ctx, 'E', mx + 3, my, { color: blink ? '#38261a' : '#f6ead0' });
    }
    drawText(ctx, msg, mx + (box.touch ? 0 : 12), my, { color: '#f6ead0', outline: true, outlineColor: OUT });
  }

  // ---- the X: put the tool down ---------------------------------------------
  const s = box.touch ? 14 : 11;
  const sx = x + bw + 4, sy = y + Math.round((bh - s) / 2);
  const hot = ui._hit ? ui._hit(sx, sy, s, s) : false;
  K.bezel(ctx, sx, sy, s, s, {
    rim: 1, moss: false, state: hot ? 'hot' : 'rest',
    body: ['#b8402e', '#9a3022', '#7a2218', '#4e140c'],
  });
  for (let i = 0; i < s - 6; i++) {
    R(ctx, sx + 3 + i, sy + 3 + i, 1, 1, '#fde8d0');
    R(ctx, sx + s - 4 - i, sy + 3 + i, 1, 1, '#fde8d0');
  }
  ui.workStopRect = { x: sx, y: sy, w: s, h: s };
  ctx.restore();
  return true;
}

/**
 * The thing a finished job turned up, bursting out of where it was: the
 * picture of it jumps up out of the rock, and a strip of scroll under it says
 * what it is and how many. Nothing stops for it.
 */
function drawLoot(ui, ctx, W, H, r) {
  const g = ui.game;
  const t = r.t;
  if (t > 2.6) return;
  const s = g.cam.worldToScreen(r.x, r.y);
  const a = Math.min(clamp01(t / 0.12), clamp01((2.6 - t) / 0.5));
  ctx.save();
  ctx.globalAlpha *= a;
  // the jump: up out of the rock, a bounce, then it hangs there
  const up = t < 0.35 ? easeOutCubic(t / 0.35) : 1 + Math.sin(clamp01((t - 0.35) / 0.3) * Math.PI) * 0.08;
  const ix = Math.round(clamp(s.x, 14, W - 14));
  const iy = Math.round(clamp(s.y - 10 - up * 22, 18, H - 30));
  // a burst of light behind it as it comes out
  if (t < 0.6) {
    const k = 1 - t / 0.6;
    const col = r.chip || '#f4c96a';
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2 + t * 2;
      const rr = 6 + (1 - k) * 12;
      R(ctx, ix + Math.cos(an) * rr, iy + Math.sin(an) * rr, 2, 2, i % 2 ? '#fff7dc' : col);
    }
  }
  const cv = r.icon ? iconCanvas(r.icon, 1) : null;
  if (cv) {
    R(ctx, ix - Math.ceil(cv.width / 2) + 1, iy + Math.ceil(cv.height / 2) + 2, cv.width - 2, 2, 'rgba(0,0,0,0.25)');
    ctx.drawImage(cv, Math.round(ix - cv.width / 2), Math.round(iy - cv.height / 2));
  }
  // the scroll with its name on it
  if (t > 0.25) {
    const k = easeOutCubic(clamp01((t - 0.25) / 0.25));
    const line = (r.count ? `+${r.count} ` : '') + (r.name || '');
    const note = r.fresh ? 'NEW - in the book' : '';
    const tw = Math.max(textWidth(line), note ? textWidth(note) : 0);
    const w = tw + 20, h = note ? 22 : 13;
    const x = Math.round(clamp(ix - w / 2, 4, W - w - 4));
    const y = Math.round(iy + 11 + (1 - k) * 4);
    ctx.save();
    ctx.globalAlpha *= k;
    K.scroll(ctx, x, y, w, h, { seed: tw });
    drawText(ctx, line, x + w / 2, y + 3, { color: K.INK, align: 'center' });
    if (note) drawText(ctx, note, x + w / 2, y + 12, { color: K.INK_RED, align: 'center' });
    ctx.restore();
  }
  ctx.restore();
}
