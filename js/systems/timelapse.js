// CRABDEN - a thousand years, in twenty seconds.
//
// The animal has just dug itself in. Everything from here to the black is a
// single wide shot of the basin with time let off the leash: the sun and the
// moon going over faster and faster, the sea walking down the frame a step at
// a time and leaving its strandline on the far country, the reef bleaching
// where the water leaves it and then slumping into the sand, the bed drying
// white to salt and then going under dunes - and life coming back in waves,
// none of which is the life that was here.
//
// Nothing in here is a separate scene. It is the world, with dials turned:
//
//   sea       is put into `lapse` mode (a body of water with a surface seen
//             from outside it) and handed the level, the bleach, the
//             collapse, how much is still alive in it, and how wet the bed is
//   weather   has its hour wound forward, so the sky does its own day/night
//   backdrop  is washed toward the colour of the air of each age, faded, and
//             starts sunk so the country comes up out of the water
//
// What it draws itself: the salt crust, the dunes walking over it, the plants
// that come up and die back in three waves, and the animals - shorebirds over
// the going water, then the desert's own birds and a herd crossing the flat.

import { clamp, clamp01, lerp, smoothstep, TAU, mulberry32, hashStr, mixHex } from '../lib/math.js';
import { makeCanvas } from '../render/pixel.js';
import { drawText, textWidth } from '../lib/font.js';
import { MATERIALS } from '../lib/palette.js';
import { beast, bird } from '../art/beasts.js';
import {
  bunchgrass, saltbush, creosote, deadbrush, ocotillo, barrel, pricklypear, agave, yucca,
} from '../art/desertflora.js';

/** How long the thousand years takes, in seconds of film. */
export const LAPSE_SECS = 20;
/** How far down the far country starts, in world units, before it comes up. */
const SINK = 120;

/** 0 before a, 1 after b, smooth between. */
const ss = (a, b, x) => smoothstep((x - a) / (b - a));

// the steps the sea goes down in: [start, end] of each drop, as a fraction of
// the whole lapse. Short drops, long holds - a coast that stays a coast for a
// few hundred years and then is not one. The first waits for the camera to
// have pulled all the way out.
const STEPS = [[0.15, 0.19], [0.22, 0.26], [0.29, 0.33], [0.36, 0.40], [0.43, 0.47], [0.50, 0.54], [0.57, 0.62]];
// and how far down each one leaves it (fraction of the way to dry)
const DEPTHS = [0.16, 0.31, 0.46, 0.60, 0.74, 0.88, 1.0];

// three waves of plants: what comes up first on the salt does not last
const WAVES = [
  { grow: [0.50, 0.58], die: [0.64, 0.72], kinds: ['saltbush', 'bunchgrass', 'saltbush'] },
  { grow: [0.63, 0.71], die: [0.79, 0.87], kinds: ['creosote', 'ocotillo', 'deadbrush', 'creosote'] },
  { grow: [0.78, 0.93], die: null, kinds: ['barrel', 'pricklypear', 'agave', 'yucca', 'bunchgrass', 'creosote'] },
];
const DEEP = '#3a2416';
const DEEP_A = 0.9;
const ART = { bunchgrass, saltbush, creosote, deadbrush, ocotillo, barrel, pricklypear, agave, yucca };

export class Timelapse {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.L = null;
    this._art = new Map();
    this._queue = [];
  }

  get p() { return clamp01(this.t / LAPSE_SECS); }

  start() {
    const g = this.game;
    const c = g.crab;
    this.on = true;
    this.t = 0;
    this.x0 = c.x;
    this.g0 = g.terrain.surfaceY(c.x);
    const top = g.sea.level(c.x);
    this.top0 = top;
    // dry means below the bed here by a margin, so the shallows round the
    // animal go first and the hollows hold on as lagoons
    this.bottom = this.g0 + 64;
    this.L = { level: top, wet: 1, bleach: 0, collapse: 0, life: 1, bed: 1 };
    g.sea.beginLapse(this.L);
    g.weather.force('clear', 120);
    this.hour = g.weather.hour;
    this._stepSound = -1;
    this._rumbled = false;
    // the plants, decided once: where each is, which wave, which kind
    const r = mulberry32(hashStr('lapse-flora'));
    this.plants = [];
    for (let i = 0; i < 70; i++) {
      const w = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;
      const wave = WAVES[w];
      const kind = wave.kinds[Math.floor(r() * wave.kinds.length)];
      this.plants.push({
        x: this.x0 - 1100 + r() * 2200, w, kind,
        v: Math.floor(r() * 3), lag: r() * 0.35, dlag: r() * 0.4, s: 0.85 + r() * 0.5, flip: r() < 0.5,
      });
    }
    this.plants.sort((a, b) => a.x - b.x);
    // paint the plant art a piece at a time over the first seconds, long
    // before any of it is needed
    this._queue = [];
    for (const k of Object.keys(ART)) for (let v = 0; v < 3; v++) this._queue.push(`${k}:${v}`);
    // the frame: wide enough to see the surface come all the way down to the
    // bed, and the country on the far side of it
    const vw = g.renderer.vw, vh = g.renderer.vh;
    const span = (this.g0 - top) / 0.5;
    this.zoom = clamp(Math.min(vh / span, vw / 320), 0.26, 1.2);
    this.cy = this.g0 - (this.g0 - top) * 0.46;
    // a held camera, not one following the animal: it is under the sand
    g.cam.follow = null;
    g.shot(c.x + 30, this.cy, this.zoom, 3.2, { x: 4, z: -this.zoom * 0.006 });
    const bd = g.backdrop;
    bd.sink = SINK;
    bd.lifeOn = false;
  }

  stop() {
    if (!this.on) return;
    this.on = false;
    const bd = this.game.backdrop;
    bd.sink = 0; bd.wash = null; bd.fade = 0; bd.lifeOn = true;
    this.game.quake = 0;
    if (this.game.sea.lapse === this.L) this.game.sea.lapse = null;
  }

  _level(p) {
    let f = 0;
    for (let i = 0; i < STEPS.length; i++) {
      const [a, b] = STEPS[i];
      const prev = i ? DEPTHS[i - 1] : 0;
      if (p >= b) f = DEPTHS[i];
      else if (p > a) { f = lerp(prev, DEPTHS[i], ss(a, b, p)); break; }
      else break;
    }
    return lerp(this.top0, this.bottom, f);
  }

  update(dt) {
    if (!this.on) return;
    const g = this.game;
    this.t += dt;
    const p = this.p;
    const L = this.L;
    L.level = this._level(p);
    L.bleach = ss(0.08, 0.34, p);
    L.collapse = ss(0.34, 0.6, p);
    L.life = 1 - ss(0.06, 0.42, p);
    L.bed = 1 - ss(0.4, 0.58, p);
    // the last of it is the lagoons in the hollows, and they go to salt
    L.wet = 1 - ss(0.6, 0.74, p);

    // the sea going down a step is the only sound the sea makes in here
    for (let i = 0; i < STEPS.length; i++) {
      if (p > STEPS[i][0] && this._stepSound < i) {
        this._stepSound = i;
        if (i < 6) g.audio.play('water', { pitch: 0.45 + i * 0.05 });
      }
    }

    // the light: barely moving while the camera pulls out, then a day every
    // few seconds, then two a second by the end
    const rate = lerp(0.5, 5, ss(0.06, 0.16, p)) + 40 * Math.pow(ss(0.16, 1, p), 1.4);
    this.hour = (this.hour + rate * dt) % 24;
    g.weather.hour = this.hour;
    // and the clouds and everything walking the far country go with it
    g.backdrop.warp = (g.backdrop.warp || 0) + dt * rate * 2.2;

    // the far country: a sea haze, then the white of the salt, then the
    // desert's own air - and it comes up out of the water as it goes
    const bd = g.backdrop;
    // The ground gets up. Most of the way it rises with the water going
    // down, and then the last of it comes in one push, with the noise and
    // the shaking that a whole country makes moving.
    bd.sink = SINK * (1 - 0.55 * ss(0.16, 0.6, p) - 0.45 * ss(0.62, 0.84, p));
    const sea = 1 - ss(0.1, 0.5, p), salt = ss(0.4, 0.56, p) * (1 - ss(0.74, 0.92, p));
    if (sea > 0.02) bd.wash = { col: '#7fb4c0', a: Math.round(sea * 0.42 * 10) / 10 };
    else if (salt > 0.02) bd.wash = { col: '#efe6d2', a: Math.round(salt * 0.32 * 10) / 10 };
    else bd.wash = null;
    bd.fade = Math.round((sea * 0.25 + salt * 0.18) * 10) / 10;
    bd.lifeOn = p > 0.8;

    const up = ss(0.62, 0.84, p);
    if (p > 0.62 && !this._rumbled) { this._rumbled = true; g.audio.play('rumble'); }
    if (up > 0.02 && up < 0.98) {
      g.quake = 0.35;
      g.cam.shake(dt * 7 * Math.sin(up * Math.PI));
      if (Math.random() < dt * 8) {
        const wx = g.cam.x + (Math.random() - 0.5) * g.cam.vw / g.cam.zoom;
        g.fx.dust(wx, g.terrain.surfaceY(wx), 1.4 + Math.random() * 1.4);
      }
    } else g.quake = 0;

    // wind over the dunes: sand going past, low and fast
    if (p > 0.66 && Math.random() < dt * 14 * ss(0.66, 0.8, p)) {
      const wx = g.cam.x + (Math.random() - 0.5) * g.cam.vw / g.cam.zoom;
      g.fx.drift(wx, g.terrain.surfaceY(wx) - this._dune(wx) - 2, '#e6cd9c', 1);
    }

    // paint a little plant art each frame until it is all there
    if (this._queue.length) {
      const k = this._queue.shift();
      this._plantArt(k);
    }
  }

  // -- the plants ----------------------------------------------------------

  _plantArt(key) {
    let a = this._art.get(key);
    if (a) return a;
    const [kind, v] = key.split(':');
    const base = ART[kind](hashStr(`lapse:${key}`) >>> 0, kind === 'barrel' || kind === 'agave' ? 1.3 : 1.15);
    // and a dead one, the same plant gone to straw
    const dead = makeCanvas(base.cv.width, base.cv.height);
    const d = dead.getContext('2d');
    d.drawImage(base.cv, 0, 0);
    d.globalCompositeOperation = 'source-atop';
    d.globalAlpha = 0.78;
    d.fillStyle = '#8a7152';
    d.fillRect(0, 0, dead.width, dead.height);
    a = { cv: base.cv, dead, ox: base.ox, oy: base.oy };
    this._art.set(key, a);
    return a;
  }

  /** A strip of earth going dark, stretched under every column of ground. */
  _depth() {
    if (this._depthCv) return this._depthCv;
    const cv = makeCanvas(1, 64);
    const g = cv.getContext('2d');
    for (let y = 0; y < 64; y++) {
      const k = Math.pow(y / 63, 1.3);
      // in four flat steps, dithered by row, like everything else
      const band = clamp(Math.floor(k * 4 + ((y % 2) ? 0.25 : -0.25)), 0, 4);
      if (band === 0) continue;
      g.globalAlpha = band / 4 * DEEP_A;
      g.fillStyle = DEEP;
      g.fillRect(0, y, 1, 1);
    }
    this._depthCv = cv;
    return cv;
  }

  /** How tall the moving dunes are at x. */
  _dune(x) {
    const p = this.p;
    const A = ss(0.68, 0.94, p);
    if (A <= 0) return 0;
    // they walk downwind while they grow
    const u0 = (x - this.t * 14) / 310;
    const k = Math.floor(u0);
    const u = u0 - k;
    const h1 = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
    const amp = 0.45 + (h1 - Math.floor(h1)) * 0.75;
    // a long windward back and a shorter, steeper slip face, both rounded
    const q = u < 0.66 ? Math.sin((u / 0.66) * Math.PI / 2) : Math.cos(((u - 0.66) / 0.34) * Math.PI / 2);
    return q * q * amp * 22 * A;
  }

  // -- drawing -------------------------------------------------------------

  /**
   * On the ground: the bed going white with salt where the water has left
   * it, and then the dunes coming over the salt.
   */
  drawGround(ctx, cam) {
    if (!this.on) return;
    const p = this.p;
    const T = this.game.terrain;
    const z = cam.zoom;
    const vw = cam.vw, vh = cam.vh;
    const salt = ss(0.44, 0.6, p) * (1 - ss(0.8, 0.96, p));
    const duneK = ss(0.68, 0.94, p);
    const lvl = this.L.level;
    const px = Math.max(1, Math.round(z));
    const step = 2;
    const sand = MATERIALS.sand.ramp;
    for (let sx = 0; sx < vw; sx += step) {
      const wx = cam.screenToWorld(sx + 1, 0).x;
      const gy = T.surfaceY(wx);
      const s = cam.worldToScreen(wx, gy);
      const y0 = Math.round(s.y);
      if (y0 > vh + 4) continue;
      // the ground goes dark with depth, the way a cut through it does
      const dy = Math.round(y0 + 16 * z);
      if (dy < vh) {
        const dh = Math.max(8, Math.round(56 * z));
        ctx.globalAlpha = 1;
        ctx.drawImage(this._depth(), 0, 0, 1, 64, sx, dy, step, dh);
        if (dy + dh < vh) { ctx.fillStyle = DEEP; ctx.globalAlpha = DEEP_A; ctx.fillRect(sx, dy + dh, step, vh - dy - dh); }
      }
      // still under water here: nothing has dried on it yet
      if (gy > lvl - 2 && this.L.wet > 0.2) continue;
      if (salt > 0.01) {
        // a crust a few pixels deep, broken by a polygon of cracks
        const h1 = Math.sin(Math.floor(wx / 9) * 78.233) * 43758.5453;
        const r = h1 - Math.floor(h1);
        const th = Math.max(px, Math.round((3 + r * 3) * z * 1.2));
        ctx.globalAlpha = salt * 0.85;
        ctx.fillStyle = '#efe9da';
        ctx.fillRect(sx, y0 - 1, step, th);
        ctx.globalAlpha = salt;
        ctx.fillStyle = '#fbf8ef';
        ctx.fillRect(sx, y0 - 1, step, px);
        if (r < 0.18) {
          ctx.globalAlpha = salt * 0.6;
          ctx.fillStyle = '#a99c84';
          ctx.fillRect(sx, y0 - 1, 1, th);
        }
      }
      if (duneK > 0.01) {
        const h = this._dune(wx);
        if (h > 0.4) {
          const hs = Math.round(h * z);
          // Lit by its slope, not by a rule: the windward back takes the
          // light, the slip face is in its own shadow, and the crest between
          // them catches a line of it. Flat bands of the desert's own sand,
          // the same ramp the ground is painted in, so it reads as more of it.
          const slope = (this._dune(wx + 4) - this._dune(wx - 4)) / 8;
          // dithered across the band edges, so the light rolls over the
          // back of the dune instead of stepping down it in stripes
          const lit = clamp01(0.5 + slope * 2.2 + (((sx >> 1) + (y0 >> 1)) & 1 ? 0.05 : -0.05));
          const col = lit > 0.72 ? sand[6] : lit > 0.52 ? sand[5] : lit > 0.3 ? sand[4] : sand[3];
          ctx.globalAlpha = Math.min(1, duneK * 1.6);
          ctx.fillStyle = col;
          ctx.fillRect(sx, y0 - hs, step, hs + 2);
          if (Math.abs(slope) < 0.08 && h > 6) {
            ctx.globalAlpha = Math.min(1, duneK * 1.6);
            ctx.fillStyle = sand[7];
            ctx.fillRect(sx, y0 - hs, step, px);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** In front of the ground: plants, then animals. */
  drawFront(ctx, cam) {
    if (!this.on) return;
    const p = this.p;
    const T = this.game.terrain;
    const z = cam.zoom;
    const b = cam.bounds(60);
    for (const pl of this.plants) {
      if (pl.x < b.x0 || pl.x > b.x1) continue;
      const W = WAVES[pl.w];
      const grow = ss(W.grow[0] + pl.lag * 0.06, W.grow[1] + pl.lag * 0.06, p);
      if (grow <= 0.01) continue;
      const die = W.die ? ss(W.die[0] + pl.dlag * 0.05, W.die[1] + pl.dlag * 0.05, p) : 0;
      if (die >= 0.99) continue;
      const a = this._art.get(`${pl.kind}:${pl.v}`);
      if (!a) continue;
      const gy = T.surfaceY(pl.x) - this._dune(pl.x);
      const s = cam.worldToScreen(pl.x, gy);
      const k = z * pl.s;
      // it comes up out of the ground and, dying, goes back down into it
      const h = grow * (1 - die * 0.55);
      ctx.setTransform(k * (pl.flip ? -1 : 1), 0, 0, k * h, Math.round(s.x), Math.round(s.y) + 1);
      ctx.globalAlpha = 1 - die * die;
      ctx.drawImage(a.cv, -a.ox, -a.oy);
      if (die > 0.01) {
        ctx.globalAlpha = Math.min(1, die * 1.6) * (1 - die * die);
        ctx.drawImage(a.dead, -a.ox, -a.oy);
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this._drawAnimals(ctx, cam);
  }

  _drawAnimals(ctx, cam) {
    const p = this.p;
    const t = this.t;
    const z = cam.zoom;
    const T = this.game.terrain;
    const b = cam.bounds(80);
    const span = b.x1 - b.x0;
    const night = this.game.weather.nightMix || 0;
    const sz = Math.max(1.2, z * 3);
    // shorebirds over the water while there is a shore: pale, in a loose line
    const shore = ss(0.12, 0.2, p) * (1 - ss(0.5, 0.6, p));
    if (shore > 0.02) {
      ctx.fillStyle = mixHex('#f4f1e6', '#5c6670', night * 0.7);
      ctx.globalAlpha = shore;
      for (let i = 0; i < 7; i++) {
        const u = ((t * 0.09 + i * 0.045) % 1.3) - 0.15;
        const wx = b.x0 + u * span;
        const wy = this.L.level - 60 - Math.sin(i * 1.7) * 22 - Math.sin(t * 0.8 + i) * 6;
        const s = cam.worldToScreen(wx, wy);
        bird(ctx, s.x, s.y, 1, Math.sin(t * 11 + i * 2) > 0, sz * 0.6);
      }
    }
    // the desert's birds, turning slow circles over something
    const kites = ss(0.74, 0.84, p);
    if (kites > 0.02) {
      ctx.fillStyle = '#2e2420';
      ctx.globalAlpha = kites * 0.9;
      const cx = this.x0 + 220, cy = this.g0 - 230;
      for (let i = 0; i < 4; i++) {
        const a = t * (0.9 + i * 0.07) + i * 1.6;
        const s = cam.worldToScreen(cx + Math.cos(a) * (90 - i * 12), cy + Math.sin(a) * 26 + i * 10);
        bird(ctx, s.x, s.y, Math.sin(a) > 0 ? 1 : -1, Math.sin(t * 9 + i) > 0.5, sz * 0.6);
      }
    }
    // and a herd going across the flat, at a timelapse's idea of a walk
    const herd = ss(0.84, 0.9, p);
    if (herd > 0.02) {
      ctx.fillStyle = mixHex('#3c2a20', '#141016', night * 0.6);
      ctx.globalAlpha = herd;
      for (let j = 0; j < 2; j++) {
        const dir = j ? -1 : 1;
        const lead = j ? b.x1 + 60 - (t - LAPSE_SECS * 0.84) * 150 : b.x0 - 60 + (t - LAPSE_SECS * 0.84) * 120;
        const n = j ? 4 : 6;
        for (let i = 0; i < n; i++) {
          const wx = lead - dir * i * (24 + (i % 3) * 6);
          if (wx < b.x0 - 40 || wx > b.x1 + 40) continue;
          const gy = T.surfaceY(wx) - this._dune(wx);
          const s = cam.worldToScreen(wx, gy);
          beast(ctx, s.x, s.y + 1, sz * 0.7 * (i === n - 1 ? 0.65 : 1), t * 14 + i * 1.7, dir, j);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The years, held up to the camera under the top bar. */
  drawUI(ctx, vw, vh, bar = 0) {
    if (!this.on) return;
    const p = this.p;
    const yr = Math.round(Math.pow(p, 0.8) * 1000);
    const label = `${yr.toLocaleString('en-US')} YEARS`;
    const fade = clamp01(this.t / 1.6) * clamp01((LAPSE_SECS + 0.6 - this.t) / 0.8);
    if (fade <= 0.01) return;
    // on a narrow screen SKIP has the top right, so the years go under it
    const ty = bar + (vw < 360 ? 32 : 10);
    const w = textWidth(label);
    ctx.globalAlpha = fade * 0.8;
    drawText(ctx, label, Math.round(vw / 2), ty, {
      color: '#f6ecd2', align: 'center', outline: true, outlineColor: 'rgba(0,0,0,0.65)',
    });
    const rw = Math.max(60, w + 30);
    ctx.globalAlpha = fade * 0.25;
    ctx.fillStyle = '#f6ecd2';
    ctx.fillRect(Math.round(vw / 2 - rw / 2), ty + 10, rw, 1);
    ctx.globalAlpha = fade * 0.7;
    ctx.fillStyle = '#e2b74a';
    ctx.fillRect(Math.round(vw / 2 - rw / 2), ty + 10, Math.round(rw * p), 1);
    ctx.globalAlpha = 1;
  }
}
