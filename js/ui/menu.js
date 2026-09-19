// CRABDEN - the front door.
//
// A title screen is a promise about the game behind it, so this one is the
// game: your actual crab, out of your actual save, standing in a storm with
// Dr. Vess beside it - and he is not posing. He is drinking a beer, and
// when he finishes it he throws the bottle away, and then he opens
// another, because there is nothing else to do out here and there has not
// been for eleven years.
//
// Everything on it is drawn by the same painter that draws the world. The
// storm is real weather; the sand goes past in sheets; the bottle is a real
// object on a real arc that bounces once and stays where it lands.
//
// There are two doors and a name on it, and nothing else. START carries on
// from your save if you have one and wakes you out of the sand if you do
// not; the game says which by being that game. Nothing here explains itself.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { drawText, textWidth, LINE_H } from '../lib/font.js';
import { drawPlate, drawGauge } from './icons.js';
import * as K from './kit.js';
import * as Save from '../core/save.js';

const ITEMS = [
  { id: 'start', name: 'START' },
  { id: 'settings', name: 'SETTINGS' },
];

/** How tall a menu plate is, which four other things need to know. */
const ROW = 22;

const CREDIT = 'PUKKINGDRAGON';

export class Menu {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.pick = 0;
    this.page = 'main';        // main | settings | wipe
    this.fade = 1;
    // his evening: drink, drink, finish it, throw it, open another
    this.beer = { t: 0, phase: 'drink', level: 1, bottle: null, thrown: 0 };
    this.gust = 0;
    this._rows = [];           // last frame's plate boxes, for the mouse
    this.embers = [];          // grit lit by the low sun, blowing past
  }

  /**
   * Every part of the title is reset here rather than left over from the last
   * time it was open, because the menu can be re-entered after a wipe and a
   * stale selection or a bottle mid-flight is a bug you can see.
   */
  open() {
    this.on = true;
    this.t = 0;
    this.page = 'main';
    this.pick = 0;
    this.fade = 1;
    this._rows = [];
    this.embers = [];
    this.beer = { t: 0, phase: 'drink', level: 1, bottle: null, thrown: 0 };
  }

  close() { this.on = false; this.page = 'main'; this._rows = []; }

  get hasSave() { return !!Save.readSave(); }

  /** What is in the save, for the line under START. */
  get saveInfo() { return Save.saveInfo?.() || null; }

  // -- his evening ----------------------------------------------------------

  _beer(dt) {
    const b = this.beer;
    const g = this.game;
    const npc = g.npc;
    b.t += dt;
    if (b.phase === 'drink') {
      // a pull every couple of seconds, and the bottle empties as he takes them
      if (b.t > 2.2) {
        b.t = 0;
        b.level = Math.max(0, b.level - 0.34);
        g.audio?.play('drip', { pitch: 0.5 + b.level * 0.4 });
        if (b.level <= 0.001) { b.phase = 'finish'; b.t = 0; }
      }
    } else if (b.phase === 'finish') {
      // he looks at the empty bottle for a moment, which is the joke
      if (b.t > 1.1) {
        b.phase = 'throw';
        b.t = 0;
        const dir = npc.facing || -1;
        b.bottle = {
          x: npc.x + dir * 6, y: npc.y - 20,
          vx: dir * (120 + Math.random() * 60), vy: -170 - Math.random() * 50,
          spin: dir * (6 + Math.random() * 4), a: 0, rest: 0,
        };
        g.audio?.play('claw', { pitch: 1.6 });
      }
    } else if (b.phase === 'throw') {
      if (b.t > 2.6) { b.phase = 'drink'; b.t = 0; b.level = 1; b.thrown++; }
    }

    // the bottle, once it is in the air
    const bo = b.bottle;
    if (bo) {
      if (bo.rest <= 0) {
        bo.vy += 620 * dt;
        bo.x += bo.vx * dt;
        bo.y += bo.vy * dt;
        bo.a += bo.spin * dt;
        const gy = g.terrain.surfaceY(bo.x);
        if (bo.y >= gy) {
          bo.y = gy;
          if (Math.abs(bo.vy) > 90) {
            // one bounce, then it lies there
            bo.vy = -bo.vy * 0.36;
            bo.vx *= 0.5;
            bo.spin *= 0.5;
            g.audio?.play('ui');
            g.fx?.dust(bo.x, gy, 0.4);
          } else {
            bo.rest = 1;
            bo.vy = 0; bo.vx = 0;
            bo.a = Math.PI / 2;
          }
        }
      } else {
        bo.rest += dt;
        // the sand takes it back after a while, like it takes everything
        if (bo.rest > 12) b.bottle = null;
      }
    }
  }

  /**
   * Grit picked out by the low sun. It is not the weather - the weather is
   * real and behind this - it is the handful of bright specks over the top
   * that keep a still frame from looking like a photograph.
   */
  _embers(dt) {
    const E = this.embers;
    if (E.length < 36 && Math.random() < dt * 44) {
      E.push({ x: -30, y: Math.random(), v: 40 + Math.random() * 170,
        r: Math.random() < 0.18 ? 2 : 1, bob: Math.random() * TAU });
    }
    for (let k = E.length - 1; k >= 0; k--) {
      const e = E[k];
      e.x += e.v * dt;
      e.bob += dt * 2.4;
      if (e.x > 1500) E.splice(k, 1);
    }
  }

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    this.fade = damp(this.fade, 0, 0.0008, dt);
    this._beer(dt);
    this._embers(dt);
    // the storm comes in gusts, so the title is never evenly lit
    this.gust = 0.5 + 0.5 * Math.sin(this.t * 0.37) * Math.sin(this.t * 0.83 + 1.1);

    const i = this.game.input;
    const n = this._items().length;
    if (this.pick >= n) this.pick = 0;

    // The mouse is read here, not in draw(). The title branch of the game
    // loop ends the input frame before anything is drawn, so a click handled
    // during the draw had already been thrown away - which is why the menu
    // could only ever be worked with the keyboard.
    for (const r of this._rows) {
      if (i.sx < r.x || i.sx > r.x + r.w || i.sy < r.y || i.sy > r.y + r.h) continue;
      if (this.pick !== r.i) { this.pick = r.i; this.game.audio?.play('ui'); }
      if (i.clicked) {
        i.clicked = false;
        this._choose(r.id);
      }
      break;
    }

    if (i.justPressed('ArrowDown') || i.justPressed('s')) { this.pick = (this.pick + 1) % n; this.game.audio?.play('ui'); }
    if (i.justPressed('ArrowUp') || i.justPressed('w')) { this.pick = (this.pick + n - 1) % n; this.game.audio?.play('ui'); }
    if (i.justPressed('Enter') || i.justPressed(' ')) {
      i.consumeKey('Enter'); i.consumeKey(' ');
      this._choose(this._items()[this.pick].id);
    }
    if (i.justPressed('Escape') && this.page !== 'main') { i.consumeKey('Escape'); this.page = 'main'; this.pick = 0; }
  }

  _items() {
    if (this.page === 'settings') {
      return [
        { id: 'sound', name: 'SOUND', sub: this.game.audio.enabled ? 'ON' : 'OFF' },
        { id: 'touch', name: 'TOUCH',
          sub: this.game.settings.touchControls === undefined ? 'AUTO'
            : this.game.settings.touchControls ? 'ON' : 'OFF' },
        { id: 'wipe', name: 'ERASE EVERYTHING', sub: '' },
        { id: 'back', name: 'BACK', sub: '' },
      ];
    }
    if (this.page === 'wipe') {
      return [
        { id: 'no', name: 'NO', sub: '' },
        { id: 'yes', name: 'YES, ERASE IT', sub: '' },
      ];
    }
    return ITEMS.slice();
  }

  _choose(id) {
    const g = this.game;
    g.audio?.resume();
    g.audio?.play('uiBig');
    switch (id) {
      case 'start':
        this.close();
        if (this.hasSave) g.resumeSave(); else g.startFresh();
        break;
      case 'settings': this.page = 'settings'; this.pick = 0; this._rows = []; break;
      case 'back': this.page = 'main'; this.pick = 0; this._rows = []; break;
      case 'sound':
        g.audio.setMuted(g.audio.enabled);
        g.settings.muted = !g.audio.enabled;
        Save.writeSettings?.(g.settings);
        break;
      case 'touch': {
        const cur = g.settings.touchControls;
        g.settings.touchControls = cur === undefined ? true : cur ? false : undefined;
        Save.writeSettings?.(g.settings);
        break;
      }
      case 'wipe': this.page = 'wipe'; this.pick = 0; this._rows = []; break;
      case 'no': this.page = 'settings'; this.pick = 0; this._rows = []; break;
      case 'yes':
        Save.clearSave();
        g.wipeAll();
        this.page = 'main';
        this.pick = 0;
        this._rows = [];
        g.audio?.play('thunder');
        break;
      default: break;
    }
  }

  // -- drawing --------------------------------------------------------------

  /** The bottle, wherever it is: in his hand, in the air, or in the sand. */
  drawBottle(ctx, cam) {
    if (!this.on) return;
    const bo = this.beer.bottle;
    if (!bo) return;
    const s = cam.worldToScreen(bo.x, bo.y);
    const z = cam.zoom;
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.scale(z, z);
    ctx.rotate(bo.a);
    // brown glass, a paler neck, and a label
    ctx.fillStyle = '#5a3a16';
    ctx.fillRect(-1.5, -5, 3, 6);
    ctx.fillStyle = '#7a5220';
    ctx.fillRect(-0.8, -8, 1.6, 3);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(-1.5, -3.4, 3, 1.6);
    ctx.fillStyle = 'rgba(255,240,200,0.5)';
    ctx.fillRect(-1.2, -4.6, 0.7, 4);
    ctx.restore();
  }

  draw(ctx, W, H) {
    if (!this.on) return;
    const g = this.game;

    // ---- the sky darkens toward the top so the title has something to sit on
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `rgba(24,16,10,${0.58 + this.gust * 0.12})`);
    sky.addColorStop(0.45, `rgba(54,36,20,${0.16 + this.gust * 0.12})`);
    sky.addColorStop(1, 'rgba(20,13,8,0.40)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // a soft shadow down the left so the two words stay readable over
    // whatever the desert happens to be doing behind them
    const col = ctx.createLinearGradient(0, 0, W * 0.46, 0);
    col.addColorStop(0, 'rgba(12,8,5,0.62)');
    col.addColorStop(1, 'rgba(12,8,5,0)');
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, Math.round(W * 0.46), H);

    // ---- the storm, in sheets, over the whole frame ----------------------
    ctx.save();
    for (let L = 0; L < 4; L++) {
      const speed = 120 + L * 260;
      const n = 14 + L * 16;
      ctx.globalAlpha = (0.04 + L * 0.045) * (0.6 + this.gust * 0.8);
      ctx.fillStyle = L === 3 ? '#f6e6c0' : L === 2 ? '#e0c896' : '#bfa478';
      for (let i = 0; i < n; i++) {
        const seed = i * 97 + L * 311;
        const yy = ((seed * 37) % 1000) / 1000 * H;
        const xx = ((((seed * 13) % 1000) / 1000) * (W + 400) - this.t * speed) % (W + 400);
        ctx.fillRect(Math.round(xx - 200), Math.round(yy + Math.sin(this.t * 2 + seed) * 4),
          6 + L * 14, 1);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // ---- the lit grit, over the top of the sheets ------------------------
    for (const e of this.embers) {
      const xx = (e.x % (W + 80)) - 40;
      const yy = e.y * H + Math.sin(e.bob) * 9;
      ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(e.bob * 1.7));
      ctx.fillStyle = e.r > 1 ? '#ffd88a' : '#e8c88e';
      ctx.fillRect(Math.round(xx), Math.round(yy), e.r, e.r);
    }
    ctx.globalAlpha = 1;

    // ---- THE TITLE, ON A BOARD -------------------------------------------
    // It used to be two words floating on the sky with a wash behind them,
    // which is a title card rather than a front door. It is a board now: the
    // same wood, clasps and brass every other screen in this game is made
    // of, hung in the storm.
    const narrow = W < 420;
    const scale = narrow ? 3 : 4;
    const title = 'CRABDEN';
    const tw = textWidth(title, scale);
    const bw = Math.min(W - 24, tw + 44);
    const bh = scale * 8 + 20;
    const bx = Math.round(W / 2 - bw / 2);
    const by = Math.round(H * 0.11 + Math.sin(this.t * 0.9) * 1.5);

    // a warm bloom behind the board, thrown as a stack of shrinking rings
    // rather than a rectangle - a hard-edged lighter box round the title was
    // the most obviously wrong thing on the whole screen
    for (let r = 5; r >= 1; r--) {
      ctx.globalAlpha = (0.035 + this.gust * 0.04) * (r / 5);
      ctx.fillStyle = K.C.frame;
      const p2 = r * 4;
      ctx.fillRect(bx - p2, by - p2 * 0.6, bw + p2 * 2, bh + p2 * 1.2);
    }
    ctx.globalAlpha = 1;

    K.slab(ctx, bx, by, bw, bh, { face: K.C.wood, lit: K.C.woodLit, dim: K.C.woodDim });
    const cs = 8;
    K.clasp(ctx, bx + 1, by + 1, cs, 1, 1);
    K.clasp(ctx, bx + bw - 2, by + 1, cs, -1, 1);
    K.clasp(ctx, bx + 1, by + bh - 2, cs, 1, -1);
    K.clasp(ctx, bx + bw - 2, by + bh - 2, cs, -1, -1);
    // the name, burnt into the board
    const ty = by + 8;
    drawText(ctx, title, W / 2 + 1, ty + 1, { color: '#20120a', align: 'center', scale });
    drawText(ctx, title, W / 2, ty, { color: K.C.frameLit, align: 'center', scale });
    // and a brass rule under it that catches the wind
    ctx.globalAlpha = 0.5 + this.gust * 0.5;
    K.px(ctx, Math.round(W / 2 - tw / 2), ty + scale * 8 + 2, tw, 1, K.C.frame);
    ctx.globalAlpha = 1;

    // ---- the doors, down the left, out of the animal's way ---------------
    const items = this._items();
    const mx = Math.round(W * 0.07);
    const mw = Math.max(128, Math.min(Math.round(W * 0.38), 176));
    const my = Math.round(H - 30 - items.length * (ROW + 4));
    const rows = [];

    // a heading plank over them, which is what says what these doors are for
    if (this.page !== 'main') {
      K.plank(ctx, mx, my - ROW - 2, mw, 14, {
        label: this.page === 'wipe' ? 'ERASE EVERYTHING?' : 'SETTINGS', seed: 4,
      });
    }

    items.forEach((it, i) => {
      const y = my + i * (ROW + 4);
      const on = i === this.pick;
      rows.push({ i, id: it.id, x: mx, y, w: mw, h: ROW });
      // the one under the pointer leans out toward you and breathes
      const b = 0.5 + 0.5 * Math.sin(this.t * 3.1);
      const push = on ? Math.round(1 + b * 2) : 0;
      // The one you are on is BRASS. The rest are wood. Every button being
      // the same gold meant the selection was a shade, and a shade is not a
      // selection - you could not tell what pressing Enter would do.
      const danger = it.id === 'yes' || it.id === 'wipe';
      if (on) {
        K.button(ctx, mx + push, y, mw, ROW, null, {
          hot: !danger, on: danger, tint: danger ? '#d05a44' : undefined,
        });
      } else {
        K.slab(ctx, mx, y, mw, ROW, { face: K.C.wood, lit: K.C.woodLit, dim: K.C.woodDim });
      }
      const col = on ? K.C.ink : '#d8bb8e';
      drawText(ctx, it.name, mx + push + 10, y + (ROW - 7) / 2, { color: col });
      if (it.sub) {
        drawText(ctx, it.sub, mx + push + mw - 9, y + (ROW - 7) / 2,
          { color: on ? '#3a2408' : 'rgba(216,187,142,0.7)', align: 'right' });
      }
    });
    this._rows = rows;

    // ---- and what START is actually going to do --------------------------
    // The old screen had one door labelled START whether it was going to
    // wake you out of the sand or drop you back where you left off, and you
    // could not tell which until it had already happened.
    if (this.page === 'main') {
      const save = this.saveInfo;
      const line = save
        ? `CONTINUE - DAY ${save.day + 1}, ${save.stage.toUpperCase()}`
        : 'A NEW ANIMAL, IN AN OLD SEA';
      K.plank(ctx, mx, my - 18, mw, 14, { label: line, seed: 9 });
    }

    if (this.page === 'wipe') {
      const warn = 'The garden, the notes, the animals. All of it.';
      drawText(ctx, warn, mx, my - ROW - 14, { color: '#f0a08c' });
    }

    // ---- whose desert this is --------------------------------------------
    ctx.globalAlpha = 0.55 + this.gust * 0.35;
    drawText(ctx, CREDIT, W / 2, H - 13, { color: K.C.frame, align: 'center' });
    ctx.globalAlpha = 1;

    // ---- the fade up from black on the very first frame ------------------
    if (this.fade > 0.004) {
      ctx.globalAlpha = clamp01(this.fade);
      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  _hit(x, y, w, h) {
    const i = this.game.input;
    return i.sx >= x && i.sx <= x + w && i.sy >= y && i.sy <= y + h;
  }
}
