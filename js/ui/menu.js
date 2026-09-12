// CRABDEN - the front door.
//
// A title screen is a promise about the game behind it, so this one is the
// game: your actual crab, out of your actual save, standing in a storm with
// Dr. Vess beside it - and she is not posing. She is drinking a beer, and
// when she finishes it she throws the bottle away, and then she opens
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
import * as Save from '../core/save.js';

const ITEMS = [
  { id: 'start', name: 'START' },
  { id: 'settings', name: 'SETTINGS' },
];

const CREDIT = 'PUKKINGDRAGON';

export class Menu {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.pick = 0;
    this.page = 'main';        // main | settings | wipe
    this.fade = 1;
    // her evening: drink, drink, finish it, throw it, open another
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

  // -- her evening ----------------------------------------------------------

  _beer(dt) {
    const b = this.beer;
    const g = this.game;
    const npc = g.npc;
    b.t += dt;
    if (b.phase === 'drink') {
      // a pull every couple of seconds, and the bottle empties as she takes them
      if (b.t > 2.2) {
        b.t = 0;
        b.level = Math.max(0, b.level - 0.34);
        g.audio?.play('drip', { pitch: 0.5 + b.level * 0.4 });
        if (b.level <= 0.001) { b.phase = 'finish'; b.t = 0; }
      }
    } else if (b.phase === 'finish') {
      // she looks at the empty bottle for a moment, which is the joke
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

  /** The bottle, wherever it is: in her hand, in the air, or in the sand. */
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

    // ---- the title -------------------------------------------------------
    const ty = Math.round(H * 0.17 + Math.sin(this.t * 0.9) * 1.5);
    const title = 'CRABDEN';
    const scale = W < 420 ? 3 : 4;
    const tw = textWidth(title, scale);
    // a warm bloom behind the letters that comes and goes with the gusts
    ctx.globalAlpha = 0.10 + this.gust * 0.13;
    ctx.fillStyle = '#e2b74a';
    ctx.fillRect(Math.round(W / 2 - tw / 2) - 8, ty - 5, tw + 16, scale * 8 + 11);
    ctx.globalAlpha = 1;
    // a shadow behind it, offset with the wind
    drawText(ctx, title, W / 2 + 2, ty + 2, { color: 'rgba(10,6,4,0.7)', align: 'center', scale });
    drawText(ctx, title, W / 2, ty, { color: '#f2e4c2', align: 'center', scale });
    ctx.globalAlpha = 0.45 + this.gust * 0.55;
    ctx.fillStyle = '#e2b74a';
    ctx.fillRect(Math.round(W / 2 - tw / 2), ty + scale * 8 + 3, tw, 1);
    ctx.globalAlpha = 1;

    // ---- the menu itself, down the left, out of the animal's way ---------
    const items = this._items();
    const mx = Math.round(W * 0.08);
    const my = Math.round(H * 0.58);
    const rows = [];
    items.forEach((it, i) => {
      const y = my + i * 24;
      const on = i === this.pick;
      const w = Math.max(132, textWidth(it.name) + 52);
      rows.push({ i, id: it.id, x: mx - 4, y: y - 5, w, h: 21 });
      // the selected plate leans out toward you a little, and breathes
      const b = 0.5 + 0.5 * Math.sin(this.t * 3.1);
      const push = on ? Math.round(1 + b * 3) : 0;
      if (on) {
        ctx.globalAlpha = 0.10 + b * 0.14;
        ctx.fillStyle = '#e2b74a';
        ctx.fillRect(mx - 8 + push, y - 9, w + 8, 29);
        ctx.globalAlpha = 1;
      }
      drawPlate(ctx, mx - 4 + push, y - 5, w, 21, {
        edge: on ? '#e2b74a' : 'rgba(120,96,58,0.4)',
        top: on ? 'rgba(64,50,30,0.96)' : undefined,
        rivets: false,
      });
      if (on) {
        ctx.fillStyle = '#e2b74a';
        ctx.fillRect(mx - 4 + push, y - 5, 2, 21);
      }
      drawText(ctx, it.name, mx + 11 + push, y, { color: on ? '#f7ecd0' : '#b49c70' });
      if (it.sub) {
        drawText(ctx, it.sub, mx + push + w - 9, y,
          { color: on ? '#e2b74a' : 'rgba(150,128,92,0.7)', align: 'right' });
      }
    });
    this._rows = rows;

    if (this.page === 'wipe') {
      drawText(ctx, 'Everything. The map, the notes, the animals, the garden.',
        mx - 4, my - 18, { color: '#e2564f' });
    }

    // ---- whose desert this is --------------------------------------------
    ctx.globalAlpha = 0.55 + this.gust * 0.35;
    drawText(ctx, CREDIT, W / 2, H - 13, { color: '#e2b74a', align: 'center' });
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
