// CRABDEN - the lid.
//
// The people who capped these vents were not fools. A plug you can knock out
// with a rock is not a lid, it is an invitation - so the cap is only the last
// of it. Under the collar there is a lock: a grid of dressed stones, each one
// with a channel cut into it, and until the channels line up from the spring
// side to the plug, the water behind the plug has nowhere to go and the plug
// will not move for anything.
//
// So you turn the stones. Tap one and it turns a quarter. When there is a run
// of channel all the way across, the water finds it before you do - it floods
// through, lights every stone it passes, and hits the back of the plug. Then
// the plug is yours to break.
//
// The first lock is three by three and can be done by accident. The last one
// is six across, and it cannot.

import { clamp, clamp01, damp, easeOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, LINE_H } from '../lib/font.js';
import { drawNodeIcon } from './icons.js';
import * as K from './kit.js';

// connections: N E S W
const N = 1, E = 2, S = 4, W = 8;
const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;
const DIRS = [[0, -1, N, S], [1, 0, E, W], [0, 1, S, N], [-1, 0, W, E]];

const SIZES = [[3, 3], [4, 3], [4, 4], [5, 4], [5, 5], [6, 5]];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 4294967296; };
}

/**
 * A lock that can be opened: a path is walked across the grid first, the
 * stones along it are cut to carry it, every other stone gets a random cut,
 * and then every stone is turned at random - so there is always an answer,
 * and it is never the one you are shown.
 */
export function makeLock(level, seed) {
  const [cols, rows] = SIZES[clamp(level, 0, SIZES.length - 1)];
  const r = rng(seed);
  const src = Math.floor(r() * rows), dst = Math.floor(r() * rows);
  // walk a path from the spring side to the plug side
  let path = null;
  for (let tries = 0; tries < 400 && !path; tries++) {
    const seen = new Set();
    const p = [[0, src]];
    seen.add(`0,${src}`);
    let x = 0, y = src, ok = true;
    while (!(x === cols - 1 && y === dst)) {
      const opts = DIRS.filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen.has(`${nx},${ny}`);
      });
      if (!opts.length) { ok = false; break; }
      // lean toward the plug, but wander
      opts.sort(() => r() - 0.5);
      let d = opts[0];
      if (r() < 0.55) d = opts.find((o) => o[0] === 1) || (dst > y ? opts.find((o) => o[1] === 1) : opts.find((o) => o[1] === -1)) || d;
      x += d[0]; y += d[1];
      seen.add(`${x},${y}`);
      p.push([x, y]);
      if (p.length > cols * rows) { ok = false; break; }
    }
    if (ok) path = p;
  }
  const grid = [];
  for (let y = 0; y < rows; y++) { grid.push([]); for (let x = 0; x < cols; x++) grid[y].push(0); }
  // cut the path into the stones
  for (let i = 0; i < path.length; i++) {
    const [x, y] = path[i];
    let m = 0;
    if (i === 0) m |= W;
    if (i === path.length - 1) m |= E;
    for (const q of [path[i - 1], path[i + 1]]) {
      if (!q) continue;
      const dx = q[0] - x, dy = q[1] - y;
      m |= dx === 1 ? E : dx === -1 ? W : dy === 1 ? S : N;
    }
    grid[y][x] = m;
  }
  // every other stone gets a cut of its own, so the answer does not show
  const CUTS = [N | S, E | W, N | E, E | S, S | W, W | N, N | E | S, E | S | W];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) if (!grid[y][x]) grid[y][x] = CUTS[Math.floor(r() * CUTS.length)];
  }
  // and turn them all
  const lock = { cols, rows, src, dst, grid, level };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const n = Math.floor(r() * 4);
      for (let k = 0; k < n; k++) grid[y][x] = rotCW(grid[y][x]);
    }
  }
  if (flow(lock).solved) grid[src][0] = rotCW(grid[src][0]);
  return lock;
}

/** Where the water can get to from the spring side. */
export function flow(lock) {
  const { cols, rows, src, dst, grid } = lock;
  const wet = new Set();
  if (!(grid[src][0] & W)) return { wet, solved: false };
  const q = [[0, src]];
  wet.add(`0,${src}`);
  while (q.length) {
    const [x, y] = q.shift();
    const m = grid[y][x];
    for (const [dx, dy, out, back] of DIRS) {
      if (!(m & out)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (!(grid[ny][nx] & back)) continue;
      const k = `${nx},${ny}`;
      if (wet.has(k)) continue;
      wet.add(k);
      q.push([nx, ny]);
    }
  }
  const solved = wet.has(`${cols - 1},${dst}`) && !!(grid[dst][cols - 1] & E);
  return { wet, solved };
}

export class VentPuzzle {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.fade = 0;
    this.lock = null;
    this.vent = null;
    this.spin = new Map();     // cell -> turn animation 0..1
    this.cur = { x: 0, y: 0 };
    this.moves = 0;
    this.done = 0;             // counts up once it is solved
    this.t = 0;
    this.cells = [];
  }

  open(vent, level) {
    this.vent = vent;
    this.lock = makeLock(level, vent.seed ^ 0x5eed);
    this.on = true;
    this.moves = 0;
    this.done = 0;
    this.spin.clear();
    this.cur = { x: 0, y: this.lock.src };
    this.game.audio?.play('uiBig');
    this.game.npc?.say?.('There is a lock under the collar. Turn the stones until the channel runs through.', 5, 5);
  }

  close() {
    if (!this.on) return;
    this.on = false;
    this.game.audio?.play('ui', { pitch: 0.7 });
  }

  _turn(x, y) {
    const L = this.lock;
    L.grid[y][x] = rotCW(L.grid[y][x]);
    this.spin.set(`${x},${y}`, 1);
    this.moves++;
    this.game.audio?.play('claw', { pitch: 0.9 + Math.random() * 0.2 });
    if (flow(L).solved) {
      this.done = 0.001;
      this.game.audio?.play('splash');
      this.game.audio?.play('discover');
    }
  }

  update(dt) {
    this.fade = damp(this.fade, this.on ? 1 : 0, 0.0005, dt);
    if (!this.on) return;
    this.t += dt;
    for (const [k, v] of this.spin) { const n = v - dt * 7; if (n <= 0) this.spin.delete(k); else this.spin.set(k, n); }
    const g = this.game;
    const i = g.input;
    if (this.done > 0) {
      this.done += dt;
      if (this.done > 2.2 || (this.done > 0.8 && (i.clicked || i.justPressed('Enter') || i.justPressed(' ') || i.justPressed('e')))) {
        i.clicked = false;
        g.fountains.unlock(this.vent);
        this.close();
      }
      return;
    }
    if (i.justPressed('Escape')) { i.consumeKey('Escape'); this.close(); return; }
    const L = this.lock;
    if (i.justPressed('ArrowLeft') || i.justPressed('a')) this.cur.x = Math.max(0, this.cur.x - 1);
    if (i.justPressed('ArrowRight') || i.justPressed('d')) this.cur.x = Math.min(L.cols - 1, this.cur.x + 1);
    if (i.justPressed('ArrowUp') || i.justPressed('w')) this.cur.y = Math.max(0, this.cur.y - 1);
    if (i.justPressed('ArrowDown') || i.justPressed('s')) this.cur.y = Math.min(L.rows - 1, this.cur.y + 1);
    if (i.justPressed(' ') || i.justPressed('e') || i.justPressed('Enter')) {
      i.consumeKey(' '); i.consumeKey('e'); i.consumeKey('Enter');
      this._turn(this.cur.x, this.cur.y);
    }
    if (i.clicked) {
      for (const c of this.cells) {
        if (i.sx >= c.x && i.sx < c.x + c.s && i.sy >= c.y && i.sy < c.y + c.s) {
          i.clicked = false;
          this.cur = { x: c.gx, y: c.gy };
          this._turn(c.gx, c.gy);
          return;
        }
      }
      if (this.closeBtn && i.sx >= this.closeBtn.x && i.sx < this.closeBtn.x + this.closeBtn.w
        && i.sy >= this.closeBtn.y && i.sy < this.closeBtn.y + this.closeBtn.h) {
        i.clicked = false; this.close(); return;
      }
      i.clicked = false;
    }
  }

  draw(ctx, W, H) {
    if (this.fade < 0.01 || !this.lock) return;
    const a = clamp01(this.fade);
    const L = this.lock;
    ctx.save();
    ctx.globalAlpha = a * 0.74;
    ctx.fillStyle = '#0b0806';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;

    // the board: as big as it can be and still leave room to read
    const cs = Math.floor(Math.min((W - 70) / L.cols, (H - 96) / L.rows, 46));
    const gw = cs * L.cols, gh = cs * L.rows;
    const bw = Math.min(W - 8, Math.max(gw + 56, textWidth('Turn the stones until the water reaches the plug.') + 24)), bh = gh + 70;
    const bx = Math.round((W - bw) / 2), by = Math.round((H - bh) / 2) + Math.round((1 - easeOutCubic(a)) * 20);
    const fr = K.windowFrame(ctx, bx, by, bw, bh, { title: 'THE LID' });
    this.closeBtn = fr?.close || { x: bx + bw - 22, y: by + 3, w: 18, h: 16 };
    const gx0 = Math.round(bx + (bw - gw) / 2), gy0 = by + 28;

    const { wet, solved } = flow(L);
    const fl = this.done > 0 ? clamp01(this.done / 0.9) : 0;

    // the spring coming in on the left, the plug on the right
    const srcY = gy0 + L.src * cs + cs / 2, dstY = gy0 + L.dst * cs + cs / 2;
    K.px(ctx, gx0 - 20, Math.round(srcY - 4), 20, 8, 'rgba(10,7,4,0.9)');
    K.px(ctx, gx0 - 19, Math.round(srcY - 2), 19, 4, '#5fc6d8');
    drawNodeIcon(ctx, 'drop', gx0 - 14, srcY - 12, '#9de3ee', 1);
    K.px(ctx, gx0 + gw, Math.round(dstY - 4), 20, 8, 'rgba(10,7,4,0.9)');
    K.px(ctx, gx0 + gw, Math.round(dstY - 2), 19, 4, solved ? '#5fc6d8' : '#2a2018');
    // the plug itself
    const px0 = gx0 + gw + 10;
    K.px(ctx, px0, Math.round(dstY - 9), 10, 18, 'rgba(10,7,4,0.9)');
    K.px(ctx, px0 + 1, Math.round(dstY - 8), 8, 16, solved ? '#c9ced3' : '#858c95');
    K.px(ctx, px0 + 1, Math.round(dstY - 8), 8, 1, '#e6ebee');

    this.cells = [];
    for (let y = 0; y < L.rows; y++) {
      for (let x = 0; x < L.cols; x++) {
        const cx = gx0 + x * cs, cy = gy0 + y * cs;
        const k = `${x},${y}`;
        const sp = this.spin.get(k) || 0;
        const hot = (this.cur.x === x && this.cur.y === y);
        const inset = Math.round(sp * 2);
        K.slab(ctx, cx + 1 + inset, cy + 1 + inset, cs - 2 - inset * 2, cs - 2 - inset * 2,
          { face: hot ? '#5a4f40' : K.C.frame, lit: K.C.frameLit, dim: K.C.frameDim });
        this._channel(ctx, cx, cy, cs, L.grid[y][x], wet.has(k), fl, sp);
        if (hot && this.done <= 0) {
          const pulse = 0.55 + 0.45 * Math.sin(this.t * 6);
          ctx.globalAlpha = a * pulse;
          K.px(ctx, cx + 1, cy + 1, cs - 2, 1, K.C.goldLit);
          K.px(ctx, cx + 1, cy + cs - 2, cs - 2, 1, K.C.gold);
          K.px(ctx, cx + 1, cy + 1, 1, cs - 2, K.C.goldLit);
          K.px(ctx, cx + cs - 2, cy + 1, 1, cs - 2, K.C.gold);
          ctx.globalAlpha = a;
        }
        this.cells.push({ x: cx, y: cy, s: cs, gx: x, gy: y });
      }
    }

    // what to do, in one line, and how many turns it took
    const msg = this.done > 0 ? 'IT RUNS. The plug will give now.' : 'Turn the stones until the water reaches the plug.';
    drawText(ctx, msg, bx + bw / 2, by + bh - 24, { color: this.done > 0 ? '#9de3ee' : K.C.ink, align: 'center' });
    drawText(ctx, this.game.ui?.touchEnabled ? `${this.moves} turns` : `${this.moves} turns   -   click or arrows + space`,
      bx + bw / 2, by + bh - 13, { color: K.C.inkSoft, align: 'center' });
    ctx.restore();
  }

  /** The channel cut in one stone, and the water in it if there is any. */
  _channel(ctx, cx, cy, cs, m, wet, fl, sp) {
    const mid = cs / 2;
    const cw = Math.max(4, Math.round(cs * 0.22));
    const h0 = Math.round(mid - cw / 2);
    const water = wet ? (fl > 0 ? '#c9f2fa' : '#4fb4c8') : null;
    const cut = (x, y, w, h) => {
      K.px(ctx, cx + x, cy + y, w, h, 'rgba(10,7,4,0.85)');
      K.px(ctx, cx + x + 1, cy + y + 1, Math.max(1, w - 2), Math.max(1, h - 2), water || '#1e1710');
      if (water) K.px(ctx, cx + x + 1, cy + y + 1, Math.max(1, w - 2), 1, 'rgba(255,255,255,0.45)');
    };
    // the hub in the middle, then an arm out to each open side
    if (m & N) cut(h0, 0, cw, h0 + cw);
    if (m & S) cut(h0, h0, cw, cs - h0);
    if (m & W) cut(0, h0, h0 + cw, cw);
    if (m & E) cut(h0, h0, cs - h0, cw);
    // a glint running along wet channels once it is solved
    if (wet && fl > 0) {
      const ph = (this.t * 2 + (cx + cy) * 0.01) % 1;
      K.px(ctx, cx + Math.round(mid - 1), cy + Math.round(mid - 1), 2, 2, `rgba(255,255,255,${0.4 + ph * 0.5})`);
    }
  }
}
