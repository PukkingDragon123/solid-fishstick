// CRABDEN - the sea comes back.
//
// The last job is a fish that should have been extinct for sixty-six million
// years, and when you bring it to him the whole of his eleven years is true
// at once: the sea never left, it went down, and you have spent the game
// taking the lids off it. So it comes back.
//
// Nothing about this is a cutscene you watch from outside. The camera pulls
// out from where you are standing, the water comes up out of the ground all
// round you - clear, and full of the fish you have been catching - and the
// desert you walked across goes green under it. Then a card, the numbers of
// your run, and the world is yours to keep walking about in.

import { clamp, clamp01, lerp, easeOutCubic, easeInOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, LINE_H } from '../lib/font.js';
import { fishFrame, FISH_FRAMES } from '../art/fishart.js';
import { FISH } from '../data/fish.js';
import { baseRank } from './economy.js';
import * as K from '../ui/kit.js';

const RISE = 7.5;          // how long the water takes to come up
const TITLE = 3.2;         // when the title arrives
const CARD = 10.5;         // when the end card arrives
const ACCEPT = 12.5;       // when a key press lets you go

export class Ending {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.out = 0;          // the water settling back after you carry on
    this.fish = [];
  }

  start() {
    const g = this.game;
    this.on = true;
    this.t = 0;
    this.out = 0;
    this.x0 = g.crab.x;
    this.ground = g.terrain.surfaceY(g.crab.x);
    this.zoom0 = g.cam.zoom;
    g.talk?.close?.();
    g.cam.follow = null;
    g.cam.free = true;
    g.cam.freeT = 999;
    g.audio?.play('thunder');
    g.audio?.setMood?.('wonder');
    g.npc?.say('Oh. Oh, look at it. It is coming UP.', 6, 3);
    // what swims up with it: one of everything you have caught
    const got = FISH.filter((f) => g.fishing?.log?.[f.id]);
    const kinds = got.length ? got : FISH.slice(0, 3);
    this.fish = [];
    for (let i = 0; i < 26; i++) {
      const f = kinds[i % kinds.length];
      this.fish.push({ id: f.id, x: this.x0 + (Math.random() - 0.5) * 700, dy: 12 + Math.random() * 70,
        dir: Math.random() < 0.5 ? -1 : 1, sp: 12 + Math.random() * 20, ph: Math.random() * 4 });
    }
  }

  /** The level of the water, in world Y, right now. */
  level() {
    const k = easeInOutCubic(clamp01(this.t / RISE));
    const top = this.ground - 34;
    const lv = lerp(this.ground + 140, top, k);
    return lerp(lv, this.ground + 160, easeInOutCubic(clamp01(this.out / 2.4)));
  }

  update(dt) {
    const g = this.game;
    if (!this.on) {
      if (this.out > 0 && this.out < 2.4) this.out += dt;
      return;
    }
    this.t += dt;
    // the camera comes out wide, off to one side, low
    const c = g.cam;
    c.tx = this.x0; c.ty = this.ground - 50;
    c.targetZoom = lerp(this.zoom0, Math.max(0.9, this.zoom0 * 0.55), easeOutCubic(clamp01(this.t / 5)));
    // and the ground goes green under it, spreading
    if (this.t < RISE + 2 && Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) {
      g.green?.flood(this.x0, 200 + this.t * 120, 1);
    }
    if (Math.random() < dt * 6) g.fx?.spark?.(this.x0 + (Math.random() - 0.5) * 400, this.level(), '#c9f2fa', 3, 30);
    for (const f of this.fish) { f.x += f.dir * f.sp * dt; f.ph += dt * 3; if (Math.abs(f.x - this.x0) > 420) f.dir *= -1; }
    if (this.t > 1.2 && this.t < 1.2 + dt * 1.5) g.npc?.say('The sea never left. It went DOWN. And you took the lids off it.', 7, 3);
    const i = g.input;
    if (this.t > ACCEPT && (i.clicked || i.justPressed('Enter') || i.justPressed(' ') || i.justPressed('e') || i.justPressed('Escape'))) {
      i.clicked = false;
      this.on = false;
      this.out = 0.001;
      c.free = false;
      c.followEntity(g.crab);
      c.targetZoom = g.autoZoom();
      g.audio?.play('dawn');
      g.ui?.say('The world is yours. Keep walking.', 5);
    }
  }

  /** The water itself, over the world. */
  drawWorld(ctx, cam, vw, vh) {
    if (!this.on && !(this.out > 0 && this.out < 2.4)) return;
    const lv = this.level();
    const sy = Math.round(cam.worldToScreen(0, lv).y);
    if (sy >= vh) return;
    const z = cam.zoom;
    ctx.save();
    const grd = ctx.createLinearGradient(0, sy, 0, vh);
    grd.addColorStop(0, 'rgba(110,200,214,0.50)');
    grd.addColorStop(0.4, 'rgba(40,140,172,0.66)');
    grd.addColorStop(1, 'rgba(12,62,92,0.84)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, sy, vw, vh - sy);
    // the fish that came up with it
    for (const f of this.fish) {
      const y = lv + f.dy;
      const s = cam.worldToScreen(f.x, y);
      if (s.y < sy + 2 || s.y > vh + 20) continue;
      const art = fishFrame(f.id, Math.floor(f.ph) % FISH_FRAMES, 1);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * f.dir, z);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    // the surface: a lit line with the swell in it, and foam
    const t = this.game.time || 0;
    for (let x = 0; x < vw; x += 2) {
      const w = Math.round(Math.sin(x * 0.04 + t * 2) * 1.5 + Math.sin(x * 0.11 - t * 3) * 0.8);
      ctx.fillStyle = `rgba(226,250,255,${0.55 + 0.35 * Math.sin(x * 0.07 + t * 2.6)})`;
      ctx.fillRect(x, sy + w, 2, Math.max(1, Math.round(z)));
    }
    ctx.restore();
  }

  /** The title, and then the card. */
  drawUI(ctx, W, H) {
    if (!this.on) return;
    const g = this.game;
    // letterbox, sliding in
    const lb = Math.round(H * 0.08 * easeOutCubic(clamp01(this.t / 1.5)));
    ctx.fillStyle = '#070503';
    ctx.fillRect(0, 0, W, lb);
    ctx.fillRect(0, H - lb, W, lb);

    if (this.t > TITLE && this.t < CARD + 0.6) {
      const a = Math.min(clamp01((this.t - TITLE) / 1.2), clamp01((CARD + 0.6 - this.t) / 0.8));
      ctx.globalAlpha = a;
      const sc = W > 420 ? 3 : 2;
      const title = 'THE SEA COMES BACK';
      drawText(ctx, title, W / 2, H * 0.22, { color: '#e8f6fa', align: 'center', scale: sc, outline: true, outlineColor: 'rgba(8,20,30,0.85)' });
      drawText(ctx, 'It never left. It went down, and you took the lids off it.', W / 2, H * 0.22 + 9 * sc + 6,
        { color: '#bfe6ee', align: 'center', outline: true, outlineColor: 'rgba(8,20,30,0.85)' });
      ctx.globalAlpha = 1;
    }

    if (this.t > CARD) {
      const a = easeOutCubic(clamp01((this.t - CARD) / 0.8));
      ctx.globalAlpha = a;
      const days = Math.max(1, Math.floor(g.weather?.day ?? 1) + 1);
      const rank = baseRank(g.garden);
      const rows = [
        ['Days', `${days}`],
        ['Fish', `${Object.values(g.fishing?.log || {}).reduce((n, v) => n + v.n, 0)} (${g.fishing?.kinds || 0}/${FISH.length} kinds)`],
        ['Vents opened', `${g.fountains?.brokenCount || 0}`],
        ['Your back', rank.name.toLowerCase()],
        ['Animals', `${g.wildlife?.fleet?.length || 0}`],
        ['Dug up', `${Object.keys(g.relics || {}).length}`],
      ];
      const w = Math.min(W - 24, 300), h = 64 + rows.length * 12 + 34;
      const x = Math.round((W - w) / 2), y = Math.round(H * 0.5 - h / 2 + (1 - a) * 14);
      K.windowFrame(ctx, x, y, w, h, { title: 'THE END' });
      let ry = y + 22;
      const paper = wrapText('Dr. Elias Vess, paper four: "An Oasis Crab, and the Sea That Never Left."', w - 24);
      paper.forEach((l, i) => drawText(ctx, l, x + w / 2, ry + i * LINE_H, { color: K.C.gold, align: 'center' }));
      ry += paper.length * LINE_H + 8;
      K.rule(ctx, x + 12, ry - 3, w - 24);
      for (const [k2, v] of rows) {
        drawText(ctx, k2, x + 14, ry, { color: K.C.inkSoft });
        drawText(ctx, v, x + w - 14, ry, { color: K.C.ink, align: 'right' });
        ry += 12;
      }
      if (this.t > ACCEPT) {
        const p = 0.5 + 0.5 * Math.sin(this.t * 4);
        ctx.globalAlpha = a * (0.55 + p * 0.45);
        drawText(ctx, g.ui?.touchEnabled ? 'tap to keep walking' : 'press any key to keep walking', x + w / 2, y + h - 16,
          { color: K.C.ink, align: 'center' });
      }
      ctx.globalAlpha = 1;
    }
  }
}
