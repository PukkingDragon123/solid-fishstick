// CRABDEN - Dr. Pell, field archaeologist, the only human for 200km, and the
// reason you are awake.

import { clamp01, lerp, dist, rgba, shadeHex } from '../lib/math.js';
import { px, pxLine, pxEllipse, pxEllipseRot, groundShadow } from '../render/sprites.js';
import { drawText } from '../lib/font.js';
const R = Math.round;

export class Pell {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;             // -1 left, 1 right
    this.t = Math.random() * 10;
    this.target = null;
    this.follow = false;
    this.pointAt = null;
    this.emote = null;
    this.emoteT = 0;
    this.state = 'idle';
    this.bobPhase = 0;
    this.hidden = false;
    this.busy = 0;
    this.size = 1;
    this.speak = null;
    this.speakT = 0;
  }

  goTo(x, y) { this.target = { x, y }; }
  followCrab(on = true) { this.follow = on; }
  point(target) { this.pointAt = target; this.emoteT = 2.5; }

  /** Small overhead speech line (not a full cutscene). */
  chirp(text, time = 3.5) { this.speak = text; this.speakT = time; }

  update(dt, game) {
    this.t += dt;
    this.emoteT = Math.max(0, this.emoteT - dt);
    if (this.emoteT <= 0) this.pointAt = null;
    this.speakT = Math.max(0, this.speakT - dt);
    if (this.speakT <= 0) this.speak = null;

    let tx = null, ty = null;
    if (this.target) {
      tx = this.target.x; ty = this.target.y;
      if (dist(this.x, this.y, tx, ty) < 6) this.target = null;
    } else if (this.follow) {
      const c = game.crab;
      const d = dist(this.x, this.y, c.x, c.y);
      if (d > 46) { tx = c.x; ty = c.y; }
    }

    if (tx !== null) {
      const d = Math.hypot(tx - this.x, ty - this.y) || 1;
      this.vx += (tx - this.x) / d * 340 * dt;
      this.vy += (ty - this.y) / d * 340 * dt;
      this.state = 'walk';
    } else this.state = 'idle';

    const fr = Math.pow(0.002, dt);
    this.vx *= fr; this.vy *= fr;
    const sp = Math.hypot(this.vx, this.vy);
    const max = 58;
    if (sp > max) { this.vx = this.vx / sp * max; this.vy = this.vy / sp * max; }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    game.world.clampToWorld(this);

    if (Math.abs(this.vx) > 4) this.facing = this.vx > 0 ? 1 : -1;
    this.bobPhase += sp * dt * 0.22;
    this.speed = sp;
  }

  drawShadow(ctx, cam, weather) {
    if (this.hidden) return;
    const s = cam.worldToScreen(this.x, this.y);
    const sh = weather.shadow;
    const z = cam.zoom;
    groundShadow(ctx, s.x + sh.x * z * 0.7, s.y + sh.y * z * 0.5, 5 * z, 2.4 * z, sh.strength * 0.55);
  }

  draw(ctx, cam, game) {
    if (this.hidden) return;
    const s = cam.worldToScreen(this.x, this.y);
    const z = cam.zoom;
    const el = game.world.elevAt(this.x, this.y) * 0.55 * z;
    const x = s.x, y = s.y - el;
    const bob = Math.sin(this.bobPhase * 2) * 0.8 * z;
    const f = this.facing;

    const skin = '#d8a377', hat = '#8a6a44', hatLo = '#6a4f31';
    const shirt = '#7d8a6a', pants = '#4e5a46', pack = '#8a5a3a', rim = '#2a1e16';

    const H = 15 * z;             // total height
    const by = y - bob;

    // legs
    const stride = this.state === 'walk' ? Math.sin(this.bobPhase * 4) * 2.2 * z : 0;
    for (const side of [-1, 1]) {
      const lx = x + side * 1.4 * z;
      const fx = lx + stride * side;
      pxLine(ctx, lx, by - H * 0.42, fx, by, rim, Math.max(2, R(z * 1.6)));
      pxLine(ctx, lx, by - H * 0.42, fx, by, pants, Math.max(1, R(z * 1.1)));
    }
    // backpack
    pxEllipse(ctx, x - f * 3 * z, by - H * 0.62, 2.6 * z, 3.2 * z, pack);
    px(ctx, x - f * 3 * z - z, by - H * 0.66, shadeHex(pack, 0.2), Math.max(1, R(z)), Math.max(1, R(z)));
    // torso
    pxEllipse(ctx, x, by - H * 0.58, 3.4 * z + 1, 4.4 * z + 1, rim);
    pxEllipse(ctx, x, by - H * 0.58, 3.4 * z, 4.4 * z, shirt);
    // scarf
    ctx.fillStyle = '#c25a4a';
    ctx.fillRect(R(x - 3 * z), R(by - H * 0.76), R(6 * z), Math.max(1, R(z * 1.2)));
    const flutter = Math.sin(this.t * 3) * 2 * z;
    pxLine(ctx, x - f * 2 * z, by - H * 0.74, x - f * 5 * z, by - H * 0.66 + flutter, '#a8483c', Math.max(1, R(z)));
    // arms
    const armA = this.pointAt ? Math.atan2(this.pointAt.y - this.y, this.pointAt.x - this.x) : 0;
    for (const side of [-1, 1]) {
      const sx = x + side * 3 * z;
      const sy = by - H * 0.7;
      let ex, ey;
      if (this.pointAt && side === f) {
        ex = sx + Math.cos(armA) * 6 * z;
        ey = sy + Math.sin(armA) * 3 * z - 2 * z;
      } else if (this.state === 'walk') {
        ex = sx + Math.sin(this.bobPhase * 4 + (side > 0 ? Math.PI : 0)) * 2 * z;
        ey = sy + 4.5 * z;
      } else {
        ex = sx + side * 1.2 * z;
        ey = sy + 4.5 * z + Math.sin(this.t * 1.4 + side) * 0.6 * z;
      }
      pxLine(ctx, sx, sy, ex, ey, rim, Math.max(2, R(z * 1.3)));
      pxLine(ctx, sx, sy, ex, ey, shirt, Math.max(1, R(z * 0.8)));
      px(ctx, ex, ey, skin, Math.max(1, R(z * 1.2)), Math.max(1, R(z * 1.2)));
    }
    // head
    const hy = by - H * 0.86;
    pxEllipse(ctx, x, hy, 2.8 * z + 1, 2.8 * z + 1, rim);
    pxEllipse(ctx, x, hy, 2.8 * z, 2.8 * z, skin);
    px(ctx, x + f * 2.4 * z, hy, skin, Math.max(1, R(z)), Math.max(1, R(z))); // nose
    px(ctx, x + f * 1.1 * z, hy - 0.4 * z, '#2a1d16', Math.max(1, R(z * 0.8)), Math.max(1, R(z * 0.8)));
    // hat
    pxEllipseRot(ctx, x, hy - 1.6 * z, 6 * z, 1.8 * z, 0, hatLo);
    pxEllipseRot(ctx, x, hy - 1.9 * z, 5.6 * z, 1.5 * z, 0, hat);
    pxEllipse(ctx, x - f * 0.4 * z, hy - 3.2 * z, 2.6 * z, 2.1 * z, hat);
    ctx.fillStyle = hatLo;
    ctx.fillRect(R(x - 2.6 * z), R(hy - 2.6 * z), R(5.2 * z), Math.max(1, R(z * 0.6)));

    // pointing beam
    if (this.pointAt) {
      const ts = cam.worldToScreen(this.pointAt.x, this.pointAt.y);
      if (Math.floor(game.time * 6) % 2 === 0) {
        ctx.fillStyle = rgba('#ffe9a0', 0.55);
        for (let i = 0; i < 6; i++) {
          const t = i / 6;
          ctx.fillRect(R(lerp(x + f * 6 * z, ts.x, t)), R(lerp(by - H * 0.8, ts.y, t)), 1, 1);
        }
      }
    }

    // overhead chirp
    if (this.speak) {
      const a = clamp01(this.speakT / 0.5);
      drawText(ctx, this.speak, x, by - H - 12, {
        color: '#f4ead6', align: 'center', outline: true, outlineColor: 'rgba(18,12,8,0.85)', alpha: a,
      });
    }
  }
}
