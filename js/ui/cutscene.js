// CRABDEN - cutscene player.
//
// A scene is a flat list of beats the player walks through. Beats can move the
// camera, letterbox, fade, punch a comic-book stinger onto the screen, run
// arbitrary game code, or say a line with a portrait and a typewriter.

import { TAU, clamp01, lerp, easeOutBack, easeOutElastic, rgba } from '../lib/math.js';
import { drawText, textWidth, wrapText } from '../lib/font.js';
import { panel } from '../render/sprites.js';
import { drawPortrait } from './portraits.js';
export class Cutscene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.script = null;
    this.i = 0;
    this.beat = null;
    this.t = 0;
    this.letterbox = 0;
    this.targetLetterbox = 0;
    this.chars = 0;
    this.lines = [];
    this.stinger = null;
    this.onDone = null;
    this.skippable = true;
    this.talkT = 0;
    this.portraitPop = 0;
    this.speaker = null;
    this.name = '';
  }

  play(script, onDone) {
    this.script = script.slice();
    this.i = -1;
    this.active = true;
    this.onDone = onDone || null;
    this.game.state = 'cutscene';
    this.game.input.consumeClick();
    this._enterZoom = this.game.cam.targetZoom;
    this.next();
  }

  finish() {
    this.active = false;
    this.beat = null;
    this.targetLetterbox = 0;
    this.stinger = null;
    this.speaker = null;
    this.game.state = 'play';
    this.game.cam.cineCancel();
    const cb = this.onDone;
    this.onDone = null;
    if (cb) cb();
  }

  skip() {
    if (!this.skippable) return;
    // run any remaining side effects so the world ends up in the right state
    for (let k = this.i; k < this.script.length; k++) {
      const b = this.script[k];
      if (b && b.do) b.do(this.game);
    }
    this.game.renderer.fade = 0;
    // camera moves are not side effects, so a skip would otherwise strand the
    // view wherever the last played beat left it
    const cam = this.game.cam;
    cam.cineCancel();
    cam.targetZoom = this._enterZoom || 2;
    cam.followEntity(this.game.crab, false);
    this.finish();
  }

  next() {
    this.i++;
    this.t = 0;
    this.chars = 0;
    if (this.i >= this.script.length) { this.finish(); return; }
    const b = this.script[this.i];
    this.beat = b;
    const g = this.game;

    if (b.letterbox !== undefined) this.targetLetterbox = b.letterbox ? 1 : 0;
    if (b.cam) {
      const c = b.cam;
      const target = typeof c.at === 'function' ? c.at(g) : c.at;
      const x = target ? target.x : (c.x ?? g.cam.x);
      const y = target ? target.y : (c.y ?? g.cam.y);
      if (c.snap) { g.cam.snapTo(x, y); if (c.zoom) g.cam.zoom = g.cam.targetZoom = c.zoom; }
      else g.cam.cineTo(x, y, c.zoom, c.dur ?? 1.2);
    }
    if (b.follow) g.cam.followEntity(typeof b.follow === 'function' ? b.follow(g) : b.follow, false);
    if (b.sfx) g.audio.play(b.sfx, b.sfxOpts || {});
    if (b.mood) g.audio.setMood(b.mood);
    if (b.shake) g.cam.addShake(b.shake);
    if (b.flash) g.renderer.doFlash(b.flashColor || '#ffffff', b.flash);
    if (b.fade === 'out') { this._fadeFrom = g.renderer.fade; this._fadeTo = 1; }
    if (b.fade === 'in') { this._fadeFrom = g.renderer.fade; this._fadeTo = 0; }
    if (b.stinger) {
      this.stinger = { text: b.stinger, sub: b.stingerSub || '', t: 0, dur: b.dur ?? 2.2, color: b.color || '#ffe9a0' };
      g.audio.play(b.stingerSfx || 'uiBig');
    }
    if (b.do) b.do(g);
    if (b.say !== undefined) {
      this.speaker = b.portrait || null;
      this.name = b.say;
      this.portraitPop = 1;
      this.lines = wrapText(b.text, this.game.renderer.vw - 118, 1);
      this.mood = b.mood2 || b.face || 'idle';
    } else {
      this.speaker = null;
      this.lines = [];
    }
    // beats with no wait and no dialogue advance immediately next frame
    if (b.say === undefined && b.stinger === undefined && !b.wait && !b.fade) {
      this.next();
    }
  }

  update(dt, game) {
    this.letterbox = lerp(this.letterbox, this.targetLetterbox, 1 - Math.pow(0.001, dt));
    if (this.letterbox < 0.002) this.letterbox = 0;
    if (!this.active) return;
    this.t += dt;
    this.portraitPop = Math.max(0, this.portraitPop - dt * 3);
    const b = this.beat;
    if (!b) return;

    if (b.fade) {
      const dur = b.dur ?? 0.8;
      const k = clamp01(this.t / dur);
      game.renderer.fade = lerp(this._fadeFrom, this._fadeTo, k);
      if (k >= 1) { this.next(); return; }
    }

    if (this.stinger) {
      this.stinger.t += dt;
      if (this.stinger.t > this.stinger.dur) {
        this.stinger = null;
        if (b.say === undefined) { this.next(); return; }
      }
    }

    if (b.say !== undefined) {
      const total = this.lines.join(' ').length;
      const speed = b.speed || 42;
      if (this.chars < total) {
        const before = Math.floor(this.chars);
        this.chars = Math.min(total, this.chars + dt * speed);
        if (Math.floor(this.chars) > before && Math.floor(this.chars) % 2 === 0) {
          this.talkT = 0.09;
          game.audio.play('talk', { pitch: b.voice || 1 });
        }
      }
      this.talkT = Math.max(0, this.talkT - dt);

      if (game.input.consumeClick() || game.input.justPressed(' ') || game.input.justPressed('Enter')) {
        if (this.chars < total) this.chars = total;
        else this.next();
        return;
      }
    } else if (b.wait !== undefined) {
      if (this.t >= b.wait) { this.next(); return; }
      if (b.skipOnClick && (game.input.consumeClick() || game.input.justPressed(' '))) { this.next(); return; }
    }

    if (game.input.justPressed('Escape')) this.skip();
  }

  draw(ctx, game) {
    if (!this.active && this.letterbox < 0.01) return;
    const vw = game.renderer.vw, vh = game.renderer.vh;

    // letterbox
    const lb = Math.round(this.letterbox * vh * 0.13);
    if (lb > 0) {
      ctx.fillStyle = '#0a0806';
      ctx.fillRect(0, 0, vw, lb);
      ctx.fillRect(0, vh - lb, vw, lb);
    }

    // comic stinger
    if (this.stinger) {
      const st = this.stinger;
      const k = clamp01(st.t / 0.42);
      const scale = 3 + easeOutElastic(k) * 1.2;
      const alpha = st.t > st.dur - 0.4 ? clamp01((st.dur - st.t) / 0.4) : 1;
      const shake = st.t < 0.25 ? (Math.random() - 0.5) * 5 : Math.sin(st.t * 3) * 0.8;
      const cy = vh * 0.36;
      drawText(ctx, st.text, vw / 2 + shake, cy, {
        color: st.color, align: 'center', scale: Math.round(scale),
        outline: true, outlineColor: '#1a0f08', alpha,
      });
      if (st.sub) {
        drawText(ctx, st.sub, vw / 2, cy + 12 * Math.round(scale) + 4, {
          color: '#f2e2c0', align: 'center', scale: 1, outline: true, outlineColor: '#1a0f08', alpha,
        });
      }
      // radiating comic lines
      if (st.t < 0.5) {
        const a2 = (0.5 - st.t) * 2;
        ctx.fillStyle = rgba(st.color, a2 * 0.5);
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * TAU + st.t;
          const r0 = 30 + st.t * 160;
          for (let d = 0; d < 8; d++) {
            ctx.fillRect(
              Math.round(vw / 2 + Math.cos(ang) * (r0 + d * 2)),
              Math.round(cy + Math.sin(ang) * (r0 + d * 2) * 0.6), 1, 1
            );
          }
        }
      }
    }

    // dialogue
    if (this.beat && this.beat.say !== undefined) {
      this._drawDialogue(ctx, game, vw, vh, lb);
    }

    // on touch the on-screen SKIP button says this instead
    if (this.active && this.skippable && !game.touch.active) {
      drawText(ctx, 'esc  skip', vw - 6, vh - lb - 10, {
        color: 'rgba(240,226,192,0.5)', align: 'right', scale: 1,
      });
    }
  }

  _drawDialogue(ctx, game, vw, vh, lb) {
    const bh = 52;
    const by = vh - lb - bh - 6;
    const bx = 8;
    const bw = vw - 16;
    panel(ctx, bx, by, bw, bh, 'rgba(24,18,14,0.92)', '#c9a06a', { highlight: 'rgba(255,240,210,0.12)' });

    // portrait
    const pw = 44;
    if (this.speaker) {
      const pop = 1 + easeOutBack(clamp01(1 - this.portraitPop)) * 0 + this.portraitPop * 0.18;
      ctx.save();
      ctx.translate(bx + 4 + pw / 2, by + bh / 2);
      ctx.scale(pop, 2 - pop);
      drawPortrait(ctx, this.speaker, 0, 0, pw, game.time, this.mood, this.talkT > 0);
      ctx.restore();
      ctx.strokeStyle = 'rgba(201,160,106,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 4.5, by + 4.5, pw - 1, bh - 9);
    }

    const tx = bx + (this.speaker ? pw + 12 : 8);
    // name plate
    if (this.name) {
      const nw = textWidth(this.name, 1) + 8;
      panel(ctx, tx - 2, by - 7, nw, 11, '#c9a06a', '#5a3f28');
      drawText(ctx, this.name, tx + 2, by - 4, { color: '#241810', scale: 1 });
    }

    // typed text
    let budget = Math.floor(this.chars);
    let yy = by + 8;
    for (const line of this.lines) {
      const take = Math.max(0, Math.min(line.length, budget));
      if (take > 0) drawText(ctx, line.slice(0, take), tx, yy, { color: '#f4ead6', scale: 1 });
      budget -= line.length;
      yy += 10;
      if (budget <= 0) break;
    }

    // continue arrow
    const total = this.lines.join(' ').length;
    if (this.chars >= total && Math.floor(game.time * 3) % 2 === 0) {
      drawText(ctx, '▼', bx + bw - 10, by + bh - 11, { color: '#ffd9a0', scale: 1 });
    }
  }
}
