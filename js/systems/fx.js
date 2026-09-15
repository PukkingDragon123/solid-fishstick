// CRABDEN - particles, and the sand they land in.
//
// Grains are real: they are thrown with a velocity, dragged by the wind,
// bounce once, and then push the terrain's deformation map where they settle.
// Walk the same line twice and you will see the track.

import { clamp, clamp01, lerp, TAU } from '../lib/math.js';
import { pxBlob, pxRing, pxEllipse, pxSize } from '../render/pix.js';

const MAX = 900;
const WIND_PX = 34;      // px/s of drift per unit of reported wind

export class Fx {
  constructor(game) {
    this.game = game;
    this.p = [];
    this.decals = [];
  }

  _add(o) {
    if (this.p.length >= MAX) this.p.shift();
    this.p.push(o);
    return o;
  }

  clear() { this.p.length = 0; this.decals.length = 0; }

  // -- emitters -------------------------------------------------------------

  /** Sand kicked up by a foot landing. */
  footPuff(x, y, speed, far = false) {
    const n = 2 + Math.floor(clamp(speed / 22, 0, 5));
    for (let i = 0; i < n; i++) {
      this._add({
        k: 'grain', x: x + (Math.random() - 0.5) * 5, y: y - 1,
        vx: (Math.random() - 0.5) * (16 + speed * 0.5),
        vy: -12 - Math.random() * (14 + speed * 0.3),
        life: 0.5 + Math.random() * 0.7, t: 0, r: Math.random() < 0.3 ? 2 : 1,
        far, settle: true,
      });
    }
    if (speed > 30) this.dust(x, y - 2, 1 + speed / 90, far);
  }

  /** Soft dust cloud - reads as displaced air rather than grains. */
  dust(x, y, amount = 1, far = false) {
    const n = Math.round(2 + amount * 3);
    for (let i = 0; i < n; i++) {
      this._add({
        k: 'dust', x: x + (Math.random() - 0.5) * 10, y: y - Math.random() * 4,
        vx: (Math.random() - 0.5) * 14, vy: -5 - Math.random() * 9,
        life: 0.7 + Math.random() * 0.9, t: 0, r: 2 + Math.random() * 3 * amount, far,
      });
    }
  }

  /**
   * Something going into the ground. Not a puff: a burst. A low ring of smoke
   * that spreads outward along the sand, a column of it going up through the
   * middle, and a spray of actual grains thrown clear that fall back down.
   * `wet` makes it silt instead of dust, which drifts instead of settling.
   */
  digBurst(x, y, power = 1, wet = false) {
    const ring = Math.round(6 + power * 8);
    for (let i = 0; i < ring; i++) {
      const side = i % 2 ? 1 : -1;
      const sp = (24 + Math.random() * 46) * power;
      this._add({
        k: 'dust', x: x + side * (2 + Math.random() * 6), y: y - Math.random() * 3,
        vx: side * sp, vy: -(4 + Math.random() * 10) * (wet ? 1.6 : 1),
        life: (wet ? 1.6 : 0.9) + Math.random() * 1.1,
        t: 0, r: 2.4 + Math.random() * 4 * power, far: false,
      });
    }
    // the column
    for (let i = 0; i < Math.round(4 + power * 6); i++) {
      this._add({
        k: 'dust', x: x + (Math.random() - 0.5) * 12, y: y - Math.random() * 6,
        vx: (Math.random() - 0.5) * 18, vy: -(26 + Math.random() * 40) * power * (wet ? 0.5 : 1),
        life: (wet ? 2.2 : 1.1) + Math.random() * 1.2,
        t: 0, r: 3 + Math.random() * 5 * power, far: false,
      });
    }
    // grains, thrown clear and coming back
    for (let i = 0; i < Math.round(6 + power * 10); i++) {
      const a = -Math.PI * (0.15 + Math.random() * 0.7);
      const sp = (40 + Math.random() * 90) * power;
      this._add({
        k: 'grit', x, y: y - 2,
        vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.7, t: 0, r: 1, grav: wet ? 90 : 260,
      });
    }
  }

  /** A jet of water from the crab's organ. */
  spring(x, y, nx, ny, power = 1) {
    for (let i = 0; i < 2 + Math.round(power * 3); i++) {
      const spread = (Math.random() - 0.5) * 0.7;
      const sp = (26 + Math.random() * 40) * power;
      this._add({
        k: 'water', x, y,
        vx: (nx * Math.cos(spread) - ny * Math.sin(spread)) * sp,
        vy: (nx * Math.sin(spread) + ny * Math.cos(spread)) * sp,
        life: 0.7 + Math.random() * 0.8, t: 0, r: Math.random() < 0.35 ? 2 : 1,
        grav: 150, splash: true,
      });
    }
  }

  splash(x, y, n = 5, up = 26) {
    for (let i = 0; i < n; i++) {
      this._add({
        k: 'water', x: x + (Math.random() - 0.5) * 4, y,
        vx: (Math.random() - 0.5) * 26, vy: -up * (0.4 + Math.random() * 0.8),
        life: 0.35 + Math.random() * 0.45, t: 0, r: 1, grav: 190,
      });
    }
  }

  mist(x, y, n = 3, spread = 8) {
    for (let i = 0; i < n; i++) {
      this._add({
        k: 'mist', x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.5,
        vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 5,
        life: 0.8 + Math.random() * 0.9, t: 0, r: 1.8 + Math.random() * 2.4,
      });
    }
  }

  /** Petals, spores, seeds - the drifting life of a growing shell. */
  drift(x, y, color, n = 1) {
    for (let i = 0; i < n; i++) {
      this._add({
        k: 'drift', x, y, vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 6,
        life: 2.4 + Math.random() * 2.6, t: 0, r: 1, color,
        sway: Math.random() * TAU, swayR: 6 + Math.random() * 12,
      });
    }
  }

  /** A ring going out from a point: something happened exactly here. */
  /**
   * Something that was living in the sand, leaving. It comes out running, it
   * runs along the surface rather than through the air, and it goes down
   * again a little way off - which is why the desert looks empty.
   */
  bug(x, y, dir = 1, kind = 0) {
    this._add({
      k: 'bug', x, y, vx: dir * (34 + Math.random() * 46), vy: -18 - Math.random() * 26,
      life: 1.1 + Math.random() * 1.4, t: 0, dir, leg: Math.random() * TAU,
      kind: kind < 0.34 ? 0 : kind < 0.7 ? 1 : 2, r: 1,
    });
  }

  /**
   * Blood. It comes out in the direction the blow came from, arcs, and lands -
   * and where it lands it stays, because a desert keeps what you spill on it.
   * Insects bleed the wrong colour on purpose.
   */
  blood(x, y, dir = 1, power = 1, color = '#8e1f22') {
    dir = Math.sign(dir) || 1;
    const n = Math.round(6 + power * 12);
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 1.5;
      const sp = (50 + Math.random() * 150) * power;
      this._add({
        k: 'blood', x, y, color,
        vx: dir * Math.cos(a) * sp, vy: Math.sin(a) * sp - 40 - Math.random() * 90,
        life: 0.5 + Math.random() * 0.7, t: 0, r: 0.6 + Math.random() * 1.5, grav: 420,
      });
    }
    // a fine mist that hangs for a moment
    for (let i = 0; i < Math.round(3 + power * 4); i++) {
      this._add({
        k: 'gore', x, y, color,
        vx: dir * (10 + Math.random() * 50), vy: -20 - Math.random() * 30,
        life: 0.45 + Math.random() * 0.4, t: 0, r: 1 + Math.random() * 2.4,
      });
    }
  }

  /** A stain, left where blood landed. It fades over a long time. */
  stain(x, y, r, color) {
    this.stains = this.stains || [];
    if (this.stains.length > 90) this.stains.shift();
    this.stains.push({ x, y, r, color, t: 0, life: 42 });
  }

  ring(x, y, color = '#b6de8f', r = 14) {
    this._add({ k: 'ring', x, y, r0: 2, r1: r, life: 0.5, t: 0, color });
  }

  /**
   * Earth coming out of a hole. Not dust - clods, thrown up and back over the
   * shoulder of whoever is digging, landing and staying landed.
   */
  digSpray(x, y, power = 1, dir = -1) {
    const n = Math.round(4 + power * 7);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.22 + Math.random() * 0.42);
      const sp = (40 + Math.random() * 90) * power;
      this.p.push({
        kind: Math.random() < 0.3 ? 'dust' : 'chip',
        x: x + (Math.random() - 0.5) * 5, y: y - 1,
        vx: Math.cos(a) * sp * dir, vy: Math.sin(a) * sp,
        grav: 460,
        r: Math.random() < 0.35 ? 2 : 1,
        life: 0.5 + Math.random() * 0.7, t: 0,
        color: Math.random() < 0.5 ? '#8a5f38' : '#a67848',
      });
    }
    this.dust(x, y, power * 0.7);
  }

  spark(x, y, color = '#ffe9a8', n = 6, power = 40) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this._add({
        k: 'spark', x, y, vx: Math.cos(a) * power * (0.4 + Math.random()),
        vy: Math.sin(a) * power * (0.4 + Math.random()) - 10,
        life: 0.3 + Math.random() * 0.5, t: 0, r: 1, color, grav: 60,
      });
    }
  }

  /**
   * Water under pressure. Not a burst in every direction like a spark - a jet
   * goes up, in a narrow cone, and then gravity has it and it comes back
   * down, which is the only reason a fountain looks like a fountain.
   */
  jet(x, y, n, power = 140) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      const sp = power * (0.5 + Math.random() * 0.8);
      this._add({
        k: 'spark', x: x + (Math.random() - 0.5) * 5, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.8 + Math.random() * 1.1, t: 0, r: Math.random() < 0.3 ? 2 : 1,
        color: Math.random() < 0.35 ? '#eafcff' : '#8fd8f0', grav: 170,
      });
    }
  }

  popup(x, y, text, color = '#f4e2b4') {
    this._add({ k: 'text', x, y, vx: 0, vy: -18, life: 1.25, t: 0, text, color });
  }

  // -- simulation -----------------------------------------------------------

  update(dt, weather) {
    this.t = (this.t || 0) + dt;
    const t = this.game.terrain;
    // stains dry out and the sand takes them back
    if (this.stains) {
      for (let i = this.stains.length - 1; i >= 0; i--) {
        const st = this.stains[i];
        st.t += dt;
        if (st.t >= st.life) this.stains.splice(i, 1);
      }
    }
    // the weather reports wind as a unitless strength; particles want px/s
    const wv = weather ? weather.windVec() : { x: 0.4, y: 0 };
    const wind = { x: wv.x * WIND_PX, y: 0 };

    // saltation: above a certain wind the surface itself starts moving
    const w = Math.abs(wind.x);
    if (w > 34 && this.game.cam) {
      const rate = clamp((w - 34) / 70, 0, 1) * 30 * (1 + (weather?.sand || 0) * 2.2);
      this._salt = (this._salt || 0) + rate * dt;
      const b = this.game.cam.bounds(40);
      while (this._salt >= 1) {
        this._salt -= 1;
        const x = wind.x > 0 ? b.x0 : b.x1;
        const gy = t.surfaceY(x);
        this._add({
          k: 'grain', x, y: gy - Math.random() * 9,
          vx: wind.x * (0.8 + Math.random() * 0.7),
          vy: -Math.random() * 14,
          life: 0.8 + Math.random() * 1.0, t: 0, r: 1,
          far: Math.random() < 0.5, settle: false,
        });
      }
    }
    for (let i = this.p.length - 1; i >= 0; i--) {
      const q = this.p[i];
      q.t += dt;
      if (q.t >= q.life) { this.p.splice(i, 1); continue; }
      const k = q.t / q.life;

      switch (q.k) {
        case 'grain':
        case 'chip':
          q.vy += (q.grav ?? 240) * dt;
          q.vx += wind.x * 0.55 * dt;
          break;
        case 'water':
          q.vy += (q.grav ?? 170) * dt;
          q.vx += wind.x * 0.30 * dt;
          break;
        case 'dust':
          q.vx = lerp(q.vx, wind.x * 0.5, 1 - Math.pow(0.2, dt));
          q.vy = lerp(q.vy, -3, 1 - Math.pow(0.3, dt));
          q.r += dt * 5;
          break;
        case 'ring':
          break;
        case 'gore':
          q.vy += 40 * dt;
          q.vx *= Math.pow(0.3, dt);
          q.r += dt * 7;
          break;
        case 'blood': {
          q.vy += (q.grav || 420) * dt;
          const gy = this.game.terrain.surfaceY(q.x);
          if (q.y >= gy && q.vy > 0) {
            // it lands, and what lands stays
            this.stain(q.x, gy, q.r * (1.4 + Math.random()), q.color);
            q.t = q.life;
          }
          break;
        }
        case 'bug': {
          // it falls to the sand, then scuttles along it in a hurry
          const gy = this.game.terrain.surfaceY(q.x);
          q.leg += dt * 22;
          if (q.y < gy - 0.5) { q.vy += 380 * dt; } else {
            q.y = gy;
            q.vy = 0;
            q.vx = lerp(q.vx, q.dir * (28 + q.kind * 14), 1 - Math.pow(0.5, dt));
            // and dives back under near the end of its life
            if (q.t > q.life * 0.72) q.vx *= Math.pow(0.02, dt);
          }
          break;
        }
        case 'grit':
          // a thrown grain: gravity, and it stops when it hits the sand
          q.vy += (q.grav || 260) * dt;
          if (q.y > this.game.terrain.surfaceY(q.x) && q.vy > 0) {
            q.vy = -q.vy * 0.22;
            q.vx *= 0.4;
            if (Math.abs(q.vy) < 24) q.t = q.life;
          }
          break;
        case 'mist':
          q.vx = lerp(q.vx, wind.x * 0.35, 1 - Math.pow(0.25, dt));
          q.vy -= 4 * dt;
          q.r += dt * 4;
          break;
        case 'drift':
          q.sway += dt * 3.1;
          q.vx = lerp(q.vx, wind.x * 0.6 + Math.cos(q.sway) * q.swayR, 1 - Math.pow(0.4, dt));
          q.vy = lerp(q.vy, 9, 1 - Math.pow(0.7, dt));
          break;
        case 'spark':
          q.vy += (q.grav ?? 60) * dt;
          q.vx *= Math.pow(0.2, dt);
          break;
        case 'text':
          q.vy = lerp(q.vy, -6, 1 - Math.pow(0.2, dt));
          break;
        default: break;
      }

      q.x += q.vx * dt;
      q.y += q.vy * dt;

      // ground contact
      if (q.k === 'grain' || q.k === 'chip' || q.k === 'water') {
        const g = t.surfaceY(q.x);
        if (q.y >= g) {
          if (q.k === 'water') {
            if (q.splash && Math.random() < 0.5) this.splash(q.x, g, 2, 12);
            this.game.wetSand?.(q.x, 0.5);
            this.p.splice(i, 1);
            continue;
          }
          if (q.bounced || Math.abs(q.vy) < 22) {
            if (q.settle) t.deform(q.x, -0.28, 4);
            this.p.splice(i, 1);
            continue;
          }
          q.bounced = true;
          q.y = g - 0.5;
          q.vy *= -0.28;
          q.vx *= 0.55;
          if (q.settle) t.deform(q.x, -0.18, 3);
        }
      }
      q.alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    }
  }

  // -- drawing --------------------------------------------------------------

  /**
   * The air itself. Above a breeze the desert stops being still: sheets of
   * grain go past in long streaks at three different speeds, and in a real
   * storm a wall of it crosses the frame. Drawn in screen space over the
   * world, because that is where you would see it from.
   */
  drawDust(ctx, cam, vw, vh, weather) {
    const wv = weather ? weather.windVec() : { x: 0.4, y: 0 };
    const sand = weather ? (weather.sand || 0) : 0;
    const w = Math.abs(wv.x);
    const heavy = clamp01((w - 0.25) / 0.9) * (0.35 + sand * 1.4);
    if (heavy < 0.02) return;
    const dir = Math.sign(wv.x) || 1;
    const t = this.t || 0;
    ctx.save();
    // three sheets, each faster and brighter than the one behind it
    for (let L = 0; L < 3; L++) {
      const speed = 160 + L * 240;
      const n = Math.round((10 + L * 14) * heavy);
      const alpha = (0.05 + L * 0.05) * heavy;
      const len = 6 + L * 12;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = L === 2 ? '#f4e2ba' : L === 1 ? '#dcc49a' : '#c8ab78';
      for (let i = 0; i < n; i++) {
        const seed = i * 97 + L * 311;
        const yy = ((seed * 37) % 1000) / 1000 * vh;
        const xx = (((seed * 13) % 1000) / 1000 * (vw + 400)
          + dir * t * speed) % (vw + 400) - 200;
        const x = dir > 0 ? xx : vw - xx;
        const bob = Math.sin(t * 2 + seed) * 3;
        ctx.fillRect(Math.round(x), Math.round(yy + bob), len, 1);
      }
    }
    // and in a storm, a wash over the whole frame
    if (sand > 0.25) {
      ctx.globalAlpha = (sand - 0.25) * 0.42;
      const g = ctx.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, 'rgba(214,178,120,0.5)');
      g.addColorStop(0.6, 'rgba(196,158,104,0.75)');
      g.addColorStop(1, 'rgba(160,124,78,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  draw(ctx, cam, layer = 'near') {
    const z = cam.zoom;
    const b = cam.bounds(30);
    // stains go down first, under everything, because they are on the ground
    if (layer === 'far' && this.stains) {
      for (const st of this.stains) {
        if (st.x < b.x0 || st.x > b.x1) continue;
        const s = cam.worldToScreen(st.x, st.y);
        ctx.globalAlpha = 0.5 * (1 - st.t / st.life);
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, st.r * z, st.r * 0.42 * z, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const q of this.p) {
      if ((q.far ? 'far' : 'near') !== layer) continue;
      if (q.x < b.x0 || q.x > b.x1 || q.y < b.y0 || q.y > b.y1) continue;
      const s = cam.worldToScreen(q.x, q.y);
      const a = q.alpha ?? 1;
      switch (q.k) {
        case 'grain':
          ctx.globalAlpha = a * 0.95;
          ctx.fillStyle = q.far ? '#a87f4e' : '#e0c188';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), q.r * z, q.r * z);
          break;
        case 'chip':
          ctx.globalAlpha = a;
          ctx.fillStyle = q.color || '#8d4a3a';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), q.r * z, q.r * z);
          break;
        case 'dust':
          ctx.globalAlpha = a * 0.26;
          pxBlob(ctx, s.x, s.y, q.r * z, '#e8d3ad', { p: pxSize(z) });
          break;
        case 'ring': {
          const k = clamp01(q.t / q.life);
          ctx.globalAlpha = (1 - k) * 0.85;
          {
            const rr = lerp(q.r0, q.r1, k) * z;
            const p = pxSize(z);
            pxRing(ctx, s.x, s.y, rr, rr * 0.45, q.color,
              { p, thick: Math.max(p, Math.round((1 - k) * 2 * z)) });
          }
          break;
        }
        case 'bug': {
          // three of them, and all three are two pixels and some legs
          const COL = ['#3a2a18', '#5a3a1c', '#2c3a20'];
          const px = Math.round(s.x), py = Math.round(s.y);
          const w = Math.max(1, Math.round(z * (q.kind === 2 ? 2.4 : 1.8)));
          const h = Math.max(1, Math.round(z * 1.2));
          ctx.globalAlpha = a * (q.t > q.life * 0.72 ? 0.5 : 1);
          // legs first, under the body
          ctx.fillStyle = 'rgba(20,14,8,0.85)';
          for (let L = -1; L <= 1; L++) {
            const kick = Math.sin(q.leg + L * 2.1) * z;
            ctx.fillRect(px + L * Math.round(z), py + h, 1, Math.max(1, Math.round(z * 0.8 + kick * 0.3)));
          }
          ctx.fillStyle = COL[q.kind];
          ctx.fillRect(px - Math.round(w / 2), py, w, h);
          // a shell shine, which is what makes a beetle a beetle
          ctx.fillStyle = 'rgba(220,200,150,0.5)';
          ctx.fillRect(px - Math.round(w / 2) + (q.dir > 0 ? w - 1 : 0), py, 1, 1);
          break;
        }
        case 'blood': {
          // a drop stretches along the way it is going, which is what makes a
          // spray read as a spray and not as confetti
          ctx.globalAlpha = a;
          ctx.fillStyle = q.color;
          const sp = Math.hypot(q.vx, q.vy);
          const len = Math.max(1, Math.round(Math.min(5, sp / 60) * z));
          const ang = Math.atan2(q.vy, q.vx);
          ctx.save();
          ctx.translate(s.x, s.y);
          ctx.rotate(ang);
          ctx.fillRect(0, 0, len, Math.max(1, Math.round(q.r * z * 0.7)));
          ctx.restore();
          break;
        }
        case 'gore':
          ctx.globalAlpha = a * 0.42;
          pxBlob(ctx, s.x, s.y, q.r * z, q.color, { p: pxSize(z) });
          break;
        case 'grit':
          ctx.globalAlpha = a;
          ctx.fillStyle = Math.random() < 0.3 ? '#f0dcb2' : '#b9955f';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.max(1, Math.round(z * 0.6)),
            Math.max(1, Math.round(z * 0.6)));
          break;
        case 'mist':
          ctx.globalAlpha = a * 0.11;
          pxBlob(ctx, s.x, s.y, q.r * z, '#cfeef6', { p: pxSize(z) });
          break;
        case 'water': {
          ctx.globalAlpha = a;
          const fast = Math.abs(q.vy) > 60;
          ctx.fillStyle = fast ? '#9de3ee' : '#5fc6d8';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), q.r * z, (fast ? q.r * 2 : q.r) * z);
          break;
        }
        case 'drift':
          ctx.globalAlpha = a * 0.9;
          ctx.fillStyle = q.color || '#e8b0c4';
          ctx.fillRect(Math.round(s.x), Math.round(s.y), z, z);
          break;
        case 'spark':
          ctx.globalAlpha = a;
          ctx.fillStyle = q.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), z, z);
          break;
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Floating numbers and words sit above everything, in UI space. */
  drawText(ctx, cam, drawTextFn) {
    for (const q of this.p) {
      if (q.k !== 'text') continue;
      const s = cam.worldToScreen(q.x, q.y);
      drawTextFn(ctx, q.text, Math.round(s.x - q.text.length * 2), Math.round(s.y),
        { color: q.color, outline: true, alpha: q.alpha ?? 1 });
    }
  }
}
