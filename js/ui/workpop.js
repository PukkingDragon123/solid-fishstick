// CRABDEN - the work popup.
//
// Digging, mining, cutting, studying and searching all open the same little
// window in the middle of the screen: the crab at work on one side, the thing
// being worked on the other, and under them a bar with a needle sweeping
// across it. Strike when the needle is in the green - in the gold for a
// perfect - and every good strike takes a pip off the job. Miss and the
// thing you are working takes a knock.
//
// It is one big target on purpose. On a phone the whole screen is the strike
// button, and on a desktop it is a click, E, space or enter - so there is no
// "hold this key while you also aim" anywhere in it, which is what made the
// old in-world bar unplayable on a touch screen.

import * as K from './kit.js';
import { drawIcon, hasIcon } from './iconcore.js';
import { drawText, textWidth, ellipsize, wrapText, LINE_H } from '../lib/font.js';
import { clamp, clamp01, easeOutCubic, TAU } from '../lib/math.js';

import { drawChibi } from './chibi.js';
let chibiDraw = drawChibi;
/** The chibi crab drawer, once it is loaded (see chibi.js). */
export function setChibi(fn) { chibiDraw = fn; }

const TITLE = { dig: 'DIGGING', mine: 'MINING', fell: 'CUTTING', study: 'STUDYING', search: 'SEARCHING' };
const TARGET = { dig: 'spade', mine: 'pickaxe', fell: 'tree', study: 'leaf', search: 'chest' };

/** Where the popup sits, so input and drawing agree. */
export function popupBox(W, H, reward = false) {
  const w = Math.min(W - 12, reward ? 200 : 236);
  const h = reward ? 128 : 138;
  const x = Math.round((W - w) / 2);
  const y = Math.round(clamp(H * 0.46 - h / 2, 18, H - h - 8));
  return { x, y, w, h };
}

/**
 * Draw it, and answer its input. `ui` is the interface (for buttons, hit
 * tests and the game); returns true if it drew anything.
 */
export function drawWorkPopup(ui, ctx, W, H) {
  const g = ui.game;
  const work = g.work;
  if (!work || !work.modal) return false;
  const i = g.input;
  const j = work.job;
  const res = work.result;
  const reward = !j && !!res;
  const box = popupBox(W, H, reward);

  // the world goes dim behind it
  ctx.save();
  ctx.globalAlpha = reward ? 0.5 : 0.42;
  ctx.fillStyle = '#0a0604';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // a strike is a PRESS, not a release: timing is the whole game, and a click
  // lands when the button goes down
  const pressed = i.down && !ui._popDown;
  ui._popDown = i.down;

  if (reward) return drawReward(ui, ctx, W, H, box, res, pressed);

  // shake with the stroke
  const sh = j.shake > 0 ? Math.round(Math.sin(ui.t * 61) * j.shake * 2) : 0;
  const x = box.x + sh, y = box.y;
  const closeHot = ui._hit(box.x + box.w - 17, box.y + 2, 15, 15);
  const p = K.windowFrame(ctx, x, y, box.w, box.h, {
    title: TITLE[j.kind] || String(j.def.name).toUpperCase(), closeHot,
  });
  // touch: the X first, so it wins; then the whole screen is the strike
  if (p.close) ui.buttons.push({ ...p.close, key: 'Escape' });
  ui.buttons.push({ x: 0, y: 0, w: W, h: H, key: 'e' });

  // ---- the stage: the crab at work, and the thing it is working ---------
  const artY = p.y + 2;
  const sx = Math.round(p.x + p.w * 0.30), sy = artY + 24;
  const beat = j.last && j.last.t < 0.25 ? 1 - j.last.t / 0.25 : 0;
  const actT = ui.t * (1 + beat * 3);
  if (chibiDraw) {
    chibiDraw(ctx, j.def.chibi || 'dig', sx, sy - beat * 2, actT, 2);
  } else {
    // no crab to show yet: the tool, swinging
    const lift = Math.round(Math.abs(Math.sin(ui.t * 5)) * 3) - beat * 4;
    drawIcon(ctx, j.def.tool || j.def.icon, sx, sy - lift, 2);
  }

  // the target, in a slot, cracking as the job goes
  const ts = 38;
  const tx = Math.round(p.x + p.w * 0.70 - ts / 2), ty = artY + 4;
  K.slot(ctx, tx, ty, ts, ts, { hot: beat > 0.5 });
  const subject = j.subject && hasIcon(j.subject) ? j.subject : TARGET[j.kind] || j.def.icon;
  const jolt = beat > 0 ? Math.round(Math.sin(ui.t * 80) * beat * 2) : 0;
  drawIcon(ctx, subject, tx + ts / 2 + jolt, ty + ts / 2, 2);
  drawCracks(ctx, tx + 4, ty + 4, ts - 8, ts - 8, j.done, j.tag || j.kind);
  // and what flies off it
  for (const h of j.hits) {
    const k = h.t / 0.7;
    const hx = tx + ts / 2 + Math.cos(h.a) * h.v * h.t;
    const hy = ty + ts / 2 + Math.sin(h.a) * h.v * h.t + 90 * h.t * h.t;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = h.core ? '#ffd648' : j.kind === 'mine' ? '#c8c0b0' : '#d8b878';
    ctx.fillRect(Math.round(hx), Math.round(hy), h.core ? 2 : 1, h.core ? 2 : 1);
    ctx.globalAlpha = 1;
  }

  // the name of the thing
  const nameY = artY + 48;
  drawText(ctx, ellipsize(j.label, p.w - 12), p.x + p.w / 2, nameY,
    { color: K.C.ink, align: 'center', outline: true, outlineColor: K.C.out });

  // ---- the bar ------------------------------------------------------------
  const bx = p.x + 10, bw = p.w - 20, bh = 14;
  const by = nameY + 14;
  K.bezel(ctx, bx - 2, by - 2, bw + 4, bh + 4, { rim: 1, curls: false, body: ['#2c190d', '#1e1008', '#1e1008', '#120a06'] });
  const half = j.band / 2;
  const z0 = Math.round(bx + clamp01(j.centre - half) * bw);
  const z1 = Math.round(bx + clamp01(j.centre + half) * bw);
  const c0 = Math.round(bx + clamp01(j.centre - half * 0.32) * bw);
  const c1 = Math.round(bx + clamp01(j.centre + half * 0.32) * bw);
  // the green, lit along the top; the gold core inside it
  ctx.fillStyle = '#3e8a2e'; ctx.fillRect(z0, by + 1, z1 - z0, bh - 2);
  ctx.fillStyle = '#7ad04a'; ctx.fillRect(z0, by + 1, z1 - z0, 2);
  ctx.fillStyle = '#2a5a1e'; ctx.fillRect(z0, by + bh - 3, z1 - z0, 2);
  ctx.fillStyle = '#e6a51c'; ctx.fillRect(c0, by + 1, Math.max(2, c1 - c0), bh - 2);
  ctx.fillStyle = '#fff3a0'; ctx.fillRect(c0, by + 1, Math.max(2, c1 - c0), 2);
  // tick marks, so the speed is something you can read
  ctx.fillStyle = 'rgba(255,214,72,0.18)';
  for (let k = 1; k < 8; k++) ctx.fillRect(Math.round(bx + (bw * k) / 8), by + bh - 4, 1, 3);
  // the needle: a white blade with a brass cap
  const nx = Math.round(bx + clamp01(j.needle) * bw);
  const flash = j.flash > 0.1 ? '#ffffff' : j.flash < -0.1 ? '#ff8070' : '#fbecc8';
  ctx.fillStyle = K.C.out; ctx.fillRect(nx - 2, by - 4, 5, bh + 8);
  ctx.fillStyle = flash; ctx.fillRect(nx - 1, by - 3, 3, bh + 6);
  ctx.fillStyle = '#ffd648'; ctx.fillRect(nx - 2, by - 5, 5, 2);
  ctx.fillStyle = '#a86c14'; ctx.fillRect(nx - 2, by + bh + 3, 5, 2);

  // what the last stroke was, popping up off the bar
  if (j.last && j.last.t < 0.8) {
    const k = j.last.t / 0.8;
    const word = j.last.kind === 'core' ? 'PERFECT!' : j.last.kind === 'hit' ? 'GOOD' : 'MISS';
    const col = j.last.kind === 'core' ? '#ffd648' : j.last.kind === 'hit' ? '#a8e060' : '#f05a48';
    const pop = 1 + (1 - easeOutCubic(clamp01(j.last.t / 0.18))) * 0.6;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    const wy = by - 22 - Math.round(easeOutCubic(k) * 6);
    drawText(ctx, word, Math.round(clamp(nx, bx + 20, bx + bw - 20)), wy,
      { color: col, align: 'center', outline: true, outlineColor: K.C.out, scale: pop > 1.2 ? 2 : 1 });
    ctx.restore();
  }

  // ---- progress, condition, and what to press ------------------------------
  const py = by + bh + 8;
  const n = j.strikes;
  const lit = Math.min(n, Math.floor(j.done * n + 1e-6));
  const pipW = 7;
  for (let k = 0; k < n; k++) {
    const px = bx + k * (pipW + 2);
    pip(ctx, px, py, k < lit);
  }
  if (j.def.care >= 0.3) {
    // the condition of what you are taking out: three marks that crack
    const q = j.quality;
    const qx = bx + bw - 24;
    for (let k = 0; k < 3; k++) {
      const ok = q > (k + 0.5) / 3.2;
      drawIcon(ctx, 'heart', qx + k * 9 + 3, py + 4, 1, { variant: ok ? '' : 'shadow' })
        || heartFallback(ctx, qx + k * 9, py, ok);
    }
  }
  const pulse = 0.55 + 0.45 * Math.sin(ui.t * 6);
  const prompt = ui.touchEnabled ? 'TAP!' : 'CLICK / E';
  ctx.save();
  ctx.globalAlpha = pulse;
  drawText(ctx, prompt, p.x + p.w / 2, py + 1, { color: '#ffd648', align: 'center', outline: true, outlineColor: K.C.out });
  ctx.restore();

  // ---- input -----------------------------------------------------------------
  if (pressed) {
    if (closeHot) work.stop('closed');
    else work.strike();
    i.clicked = false;
  } else if (i.clicked) i.clicked = false;
  return true;
}

/** The card that says what the job turned up. */
function drawReward(ui, ctx, W, H, box, r, pressed) {
  const g = ui.game;
  const k = clamp01(r.t / 0.3);
  const pop = easeOutCubic(k);
  const x = box.x, y = Math.round(box.y + (1 - pop) * 10);
  const p = K.windowFrame(ctx, x, y, box.w, box.h, { title: r.title || (r.good === false ? 'DONE' : 'FOUND!') });
  ui.buttons.push({ x: 0, y: 0, w: W, h: H, key: 'e' });

  // rays turning behind the prize
  const cx = Math.round(p.x + p.w / 2), cy = p.y + 30;
  ctx.save();
  ctx.globalAlpha = 0.35 * pop;
  ctx.fillStyle = '#ffd648';
  for (let a = 0; a < 12; a++) {
    const ang = ui.t * 0.6 + (a * TAU) / 12;
    for (let s = 14; s < 34; s += 2) {
      ctx.fillRect(Math.round(cx + Math.cos(ang) * s), Math.round(cy + Math.sin(ang) * s * 0.8), 2, 2);
    }
  }
  ctx.restore();
  const ss = 40;
  K.slot(ctx, cx - ss / 2, cy - ss / 2, ss, ss, { on: true });
  const bob = Math.round(Math.sin(ui.t * 3) * 1.5);
  drawIcon(ctx, r.icon || 'star', cx, cy + bob, 2);
  if (r.count > 1) {
    drawText(ctx, `x${r.count}`, cx + ss / 2 - 2, cy + ss / 2 - 9,
      { color: '#ffd648', align: 'right', outline: true, outlineColor: K.C.out });
  }
  // a sparkle or two
  for (let s = 0; s < 3; s++) {
    const tw = (ui.t * 1.4 + s * 0.37) % 1;
    if (tw > 0.4) continue;
    const a = Math.sin((tw / 0.4) * Math.PI);
    drawIcon(ctx, 'sparkle', cx + [-22, 20, 14][s], cy + [-14, -18, 14][s], 1, { alpha: a });
  }

  let ty = cy + ss / 2 + 6;
  drawText(ctx, ellipsize(r.name || '', p.w - 10), cx, ty,
    { color: K.C.ink, align: 'center', outline: true, outlineColor: K.C.out });
  ty += 11;
  if (r.note) {
    const lines = wrapText(r.note, p.w - 14).slice(0, 2);
    lines.forEach((l, n) => drawText(ctx, l, cx, ty + n * LINE_H,
      { color: r.good === false ? '#f0a090' : r.fresh ? '#a8e060' : K.C.inkSoft, align: 'center' }));
  }
  if (r.t > 0.5) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(ui.t * 5);
    drawText(ctx, ui.touchEnabled ? 'TAP' : 'CLICK', cx, p.y + p.h - 10,
      { color: '#ffd648', align: 'center' });
    ctx.restore();
  }
  if (pressed || g.input.clicked) {
    g.input.clicked = false;
    if (r.t > 0.35) g.work.dismiss();
  }
  return true;
}

/** A progress pip: a little brass diamond, lit when that strike is in. */
function pip(ctx, x, y, on) {
  const rows = ['..k..', '.k1k.', 'k123k', '.k3k.', '..k..'];
  const col = on ? { k: '#120a06', 1: '#fff6c2', 2: '#ffd648', 3: '#a86c14' }
    : { k: '#120a06', 1: '#5a3e18', 2: '#3a2414', 3: '#2a1a0c' };
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = col[ch];
      ctx.fillRect(x + c + 1, y + r, 1, 1);
    }
  }
}

function heartFallback(ctx, x, y, ok) {
  ctx.fillStyle = ok ? '#f05a48' : '#3a2414';
  ctx.fillRect(x + 1, y + 1, 2, 2); ctx.fillRect(x + 4, y + 1, 2, 2);
  ctx.fillRect(x, y + 2, 7, 2); ctx.fillRect(x + 1, y + 4, 5, 1); ctx.fillRect(x + 2, y + 5, 3, 1);
  return true;
}

/**
 * Cracks across the thing being worked, growing with the job: a few jagged
 * lines from a point, seeded by the job so they do not crawl.
 */
function drawCracks(ctx, x, y, w, h, f, seedStr) {
  if (f <= 0.02) return;
  let s = 0;
  for (let n = 0; n < String(seedStr).length; n++) s = (s * 31 + String(seedStr).charCodeAt(n)) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const ox = x + w * (0.35 + rnd() * 0.3), oy = y + h * (0.35 + rnd() * 0.3);
  const arms = 5;
  ctx.fillStyle = 'rgba(18,10,6,0.85)';
  for (let a = 0; a < arms; a++) {
    const reach = clamp01(f * 1.2 - a * 0.12);
    if (reach <= 0) continue;
    let ang = (a / arms) * TAU + rnd() * 0.8;
    let cx = ox, cy = oy;
    const len = Math.min(w, h) * 0.55 * reach;
    for (let d = 0; d < len; d += 1) {
      ang += (rnd() - 0.5) * 0.5;
      cx += Math.cos(ang); cy += Math.sin(ang);
      if (cx < x || cy < y || cx > x + w || cy > y + h) break;
      ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
    }
  }
}
