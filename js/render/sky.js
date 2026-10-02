// CRABDEN - the sky over the wasteland.
//
// Everything here is drawn out of flat colour and an ordered dither, the same
// two things every sprite in the game is made of. The gradient is a stack of
// bands with the boundaries broken up by a 4x4 Bayer matrix; the sun, the moon
// and the glow at the horizon are concentric bands done the same way; the
// clouds are painted once as shade indices and re-coloured for the hour.
//
// One thing matters more than it looks: the renderer multiplies the whole
// frame by the ambient colour of the hour. That is right for the ground and
// wrong for the sky, which IS the light - a dusk sky multiplied by an orange
// ambient comes out the colour of a paper bag. So every colour in here is
// designed as the colour it should end up, and divided by the ambient on the
// way in (`comp`). What goes on the screen is what was chosen.

import { clamp, clamp01, lerp, mixHex, hexToRgb, rgbToHex, smoothstep } from '../lib/math.js';
import { Painter, makeCanvas, hash2i, fbmTex } from './pixel.js';
import { biomeMix } from '../world/biomes.js';

export const B4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

// stops: zenith, upper, lower, glow, horizon
const DUSK = ['#1a1a44', '#43316a', '#a4506c', '#ea7a4c', '#ffc27a'];
const DAWN = ['#1f2c5a', '#4f5288', '#b9748c', '#ee9c76', '#ffd9a0'];
const NIGHT = ['#04060f', '#080e22', '#10183a', '#182143', '#232a4a'];
const STOPS = [0, 0.5, 0.8, 0.93, 1];

// cloud ramps, shadow -> lit
const CLOUD_DAY = ['#8c97ad', '#a6b1c4', '#c3ccda', '#dfe5ec', '#f6f7f6'];
const CLOUD_GOLD = ['#4e3656', '#7e4660', '#b85a5c', '#ec8c56', '#ffcb86'];
const CLOUD_NIGHT = ['#10152a', '#161d33', '#1d253e', '#252e4a', '#303a58'];

const bell = (h, c, w) => { const d = (h - c) / w; return d * d >= 1 ? 0 : (1 - d * d) * (1 - d * d); };

/** How much of a sunrise or sunset the hour is, and which. */
export function goldenHour(h) {
  const dawn = bell(h, 6.4, 1.35);
  const dusk = bell(h, 18.75, 1.45);
  return { w: Math.max(dawn, dusk), dusk: dusk >= dawn };
}

/** The ambient the renderer will multiply this frame by, as 0..1 channels. */
export function ambientMul(weather) {
  const a = hexToRgb(mixHex(weather.ambientColor || '#ffffff', '#ffffff', 0.2 + (weather.daylight ?? 1) * 0.08));
  return [Math.max(0.05, a[0] / 255), Math.max(0.05, a[1] / 255), Math.max(0.05, a[2] / 255)];
}

/** A colour, divided by the ambient so that it survives the light pass. */
export function comp(hex, amb) {
  const c = hexToRgb(hex);
  return rgbToHex(Math.min(255, c[0] / amb[0]), Math.min(255, c[1] / amb[1]), Math.min(255, c[2] / amb[2]));
}

function mixRamp(a, b, t) { return a.map((c, i) => mixHex(c, b[i], t)); }

function lum(hex) { const c = hexToRgb(hex); return (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15); }

/**
 * The colours of the sky right now, as they should appear on screen.
 * Exported because the haze on every layer of the backdrop is taken from it.
 */
export function skyColours(camX, weather) {
  const { a, b, t } = biomeMix(camX);
  const sky = a.sky.map((c, i) => mixHex(c, b.sky[i], t));
  const fog = mixHex(a.fog, b.fog, t);
  let day = [sky[0], sky[1], sky[2], mixHex(sky[2], sky[3], 0.62), sky[3]];
  const h = weather.hour;
  const g = goldenHour(h);
  const gold = g.dusk ? DUSK : DAWN;
  // a golden hour borrows the biome's own horizon a little, so the salt pan
  // still sets pale and the rust still sets red
  const goldB = gold.map((c, i) => mixHex(c, day[i], i >= 3 ? 0.18 : 0.1));
  let col = mixRamp(day, goldB, g.w);
  const nightK = smoothstep(clamp01((weather.nightMix - 0.18) / 0.72));
  // the horizon keeps the afterglow a little longer than the zenith does
  col = col.map((c, i) => mixHex(c, NIGHT[i], nightK * (i >= 3 ? 0.86 : 1)));

  // weather: dust lifts the whole sky toward the colour of the dust, and an
  // overcast sky loses its colour to grey
  const dust = clamp01((weather.sand || 0) * 0.95 + (weather.fog || 0) * 0.3);
  if (dust > 0.01) {
    const dz = mixHex(mixHex(fog, '#8a6448', 0.35), '#1c1a22', nightK * 0.85);
    const dh = mixHex(mixHex(fog, '#e0a868', 0.2), '#2c2a34', nightK * 0.8);
    col = col.map((c, i) => mixHex(c, mixHex(dz, dh, STOPS[i]), dust * (0.55 + STOPS[i] * 0.35)));
  }
  const over = clamp01(((weather.cloudCover || 0) - 0.45) / 0.45);
  if (over > 0.01) {
    col = col.map((c) => {
      const L = lum(c);
      return mixHex(c, rgbToHex(L * 0.98, L, L * 1.04), over * 0.55);
    });
  }
  return { col, fog, golden: g.w, dusk: g.dusk, night: nightK, dust };
}

// ---------------------------------------------------------------------------

export class Sky {
  constructor(seed) {
    this.seed = seed;
    this._strip = null;
    this._stripKey = '';
    this._glows = new Map();
    this._cloudMasks = null;
    this._cloudCv = new Map();
    this._stars = null;
    this._moon = null;
  }

  /**
   * Paint the sky. H is the horizon line in screen pixels: the gradient is
   * built down to it, and everything below it is the horizon colour.
   */
  draw(ctx, cam, weather, H, t) {
    const vw = cam.vw, vh = cam.vh;
    const amb = ambientMul(weather);
    const sc = skyColours(cam.x, weather);
    this.last = sc;
    const cols = sc.col.map((c) => comp(c, amb));
    this._drawGradient(ctx, vw, vh, H, cols);

    const nightK = sc.night;
    if (nightK > 0.05) this._drawStars(ctx, vw, H, nightK * (1 - sc.dust * 0.9), t, amb);
    this._drawSunMoon(ctx, cam, weather, H, sc, amb, t);
    this._drawClouds(ctx, cam, weather, H, sc, amb, t);
    this._drawBolt(ctx, cam, weather, H, amb);
  }

  // -- lightning ------------------------------------------------------------

  /**
   * The bolt itself, in the sky and behind everything on the ground, so the
   * ranges stand black against it. A new one is grown the frame a strike
   * lands; it hangs for as long as the flash does.
   */
  _drawBolt(ctx, cam, weather, H, amb) {
    const f = weather.lightningFlash || 0;
    if (f - (this._boltPrev ?? 0) > 0.3) this.bolt = growBolt(cam.vw, H, Math.random);
    this._boltPrev = f;
    if (!this.bolt || f < 0.25) return;
    const a = clamp01((f - 0.25) / 0.5);
    ctx.globalAlpha = a * 0.45;
    ctx.fillStyle = comp('#8ea6ff', amb);
    for (const [x, y] of this.bolt) ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.globalAlpha = a;
    ctx.fillStyle = comp('#f4f6ff', amb);
    for (const [x, y] of this.bolt) ctx.fillRect(x, y, 1, 1);
    ctx.globalAlpha = 1;
  }

  // -- the gradient -------------------------------------------------------

  _drawGradient(ctx, vw, vh, H, cols) {
    const key = cols.join('') + '|' + Math.round(H) + '|' + vh;
    if (key !== this._stripKey) {
      this._stripKey = key;
      this._strip = this._bakeStrip(vh, Math.max(24, H), cols);
      this._pattern = ctx.createPattern(this._strip, 'repeat');
    }
    ctx.fillStyle = this._pattern;
    ctx.fillRect(0, 0, vw, vh);
  }

  /**
   * One column of the sky, four pixels wide (the period of the dither), as
   * flat bands that get thinner toward the horizon where the colour moves
   * fastest. Repeated across the screen as a pattern.
   */
  _bakeStrip(vh, H, cols) {
    const W = 4;
    const cv = makeCanvas(W, vh);
    const g = cv.getContext('2d');
    const img = g.createImageData(W, vh);
    const d = img.data;
    const rgb = cols.map(hexToRgb);
    const N = clamp(Math.round(H / 8), 7, 20);
    const POW = 1.65;
    const bands = [];
    for (let i = 0; i < N; i++) {
      const v = Math.pow((i + 0.5) / N, 1 / POW);
      bands.push(gradAt(rgb, v));
    }
    // below the horizon: the horizon colour going a touch duskier, which
    // only shows through gaps in the far ranges
    const below = gradAt(rgb, 1);
    for (let y = 0; y < vh; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        let c;
        if (v >= 1) c = below;
        else {
          const w = Math.pow(v, POW) * N;
          const i = clamp(Math.floor(w + (B4[y & 3][x & 3] - 0.5) * 0.9), 0, N - 1);
          c = bands[i];
        }
        const o = (y * W + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // -- glows --------------------------------------------------------------

  /**
   * A glow made of flat rings: `steps` alpha levels, the boundaries between
   * them dithered. Baked and cached by its parameters.
   */
  glow(rx, ry, color, alpha, steps = 4, fall = 1.5) {
    const key = `${rx}|${ry}|${color}|${alpha.toFixed(2)}|${steps}|${fall}`;
    let cv = this._glows.get(key);
    if (cv) return cv;
    cv = bakeGlow(rx, ry, color, alpha, steps, fall);
    if (this._glows.size > 24) this._glows.delete(this._glows.keys().next().value);
    this._glows.set(key, cv);
    return cv;
  }

  // -- sun and moon -------------------------------------------------------

  _drawSunMoon(ctx, cam, weather, H, sc, amb, t) {
    const vw = cam.vw;
    const h = weather.hour;
    const rise = 5.55, set = 18.95;
    const dusty = sc.dust;
    this.sunPos = null;
    this.moonPos = null;
    if (h > rise && h < set) {
      const k = (h - rise) / (set - rise);
      const arc = Math.sin(Math.PI * k);
      const x = Math.round(vw * (0.12 + k * 0.76));
      const y = Math.round(H + 5 - arc * (H - 26) * 0.9);
      const low = 1 - clamp01(arc / 0.45);
      // the colour of the sun is the colour of the air it comes through
      const core = mixHex('#fffdf0', '#ffd890', low);
      const rim = mixHex('#ffe7a4', '#ff8a3c', low);
      const halo = mixHex('#ffe2a0', '#ff8048', low);
      const q = (c) => quantHex(comp(c, amb), 12);
      const vis = 1 - dusty * 0.75;
      // where the sun is, for the lens: the renderer throws its shafts and
      // leans its warm wash from here
      this.sunPos = { x, y, low, vis: vis * (1 - clamp01(((weather.cloudCover || 0) - 0.55) / 0.35) * 0.8) };
      ctx.globalAlpha = vis;
      // the wide glow: the sky is brighter for a long way round the sun
      const wide = this.glow(150, 150, q(halo), 0.2 + low * 0.14, 5, 1.8);
      ctx.drawImage(wide, x - 150, y - 150);
      // at the ends of the day the light lies along the horizon
      if (sc.golden > 0.05) {
        const hz = this.glow(320, 60, q(mixHex(halo, '#ffb070', 0.4)), 0.5 * sc.golden, 5, 1.2);
        ctx.drawImage(hz, x - 320, Math.round(H) - 60);
      }
      const mid = this.glow(58, 58, q(mixHex(halo, core, 0.3)), 0.42, 4, 1.4);
      ctx.drawImage(mid, x - 58, y - 58);
      const tight = this.glow(22, 22, q(mixHex(rim, core, 0.5)), 0.7, 3, 1.1);
      ctx.drawImage(tight, x - 22, y - 22);
      const R = Math.round(7 + low * 3);
      ctx.drawImage(this._disc(R, q(rim), q(core)), x - R - 1, y - R - 1);
      ctx.globalAlpha = 1;
    }
    // the moon: up from the late afternoon, gone by morning
    const mk = moonPhase(h);
    if (mk > 0) {
      const x = Math.round(vw * (0.86 - mk * 0.7));
      const arc = Math.sin(Math.PI * mk);
      const y = Math.round(H + 4 - arc * (H - 30) * 0.85);
      const a = clamp01(sc.night * 1.4) * (1 - dusty * 0.8);
      if (a > 0.02) {
        this.moonPos = { x, y, vis: a };
        ctx.globalAlpha = a;
        const halo = this.glow(46, 46, quantHex(comp('#9fb4e0', amb), 10), 0.22, 3, 1.6);
        ctx.drawImage(halo, x - 46, y - 46);
        if (!this._moon) this._moon = bakeMoon();
        ctx.drawImage(this._moon, x - 8, y - 8);
        ctx.globalAlpha = 1;
      }
    }
  }

  _disc(R, rim, core) {
    const key = `disc|${R}|${rim}|${core}`;
    let cv = this._glows.get(key);
    if (cv) return cv;
    const S = R * 2 + 3;
    cv = makeCanvas(S, S);
    const g = cv.getContext('2d');
    const c = R + 1;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x + 0.5 - c - 0.5, y + 0.5 - c - 0.5);
        if (d > R + 0.3) continue;
        g.fillStyle = d > R - 1.6 ? rim : core;
        g.fillRect(x, y, 1, 1);
      }
    }
    if (this._glows.size > 24) this._glows.delete(this._glows.keys().next().value);
    this._glows.set(key, cv);
    return cv;
  }

  // -- stars --------------------------------------------------------------

  _drawStars(ctx, vw, H, a, t, amb) {
    if (a <= 0.01) return;
    const key = vw + 'x' + Math.round(H);
    if (!this._stars || this._stars.key !== key) this._stars = { key, cv: bakeStars(vw, Math.round(H), this.seed) };
    ctx.globalAlpha = clamp01(a);
    ctx.drawImage(this._stars.cv, 0, 0);
    // and a handful that twinkle, drawn live
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(hash2i(i, 401, this.seed) * vw);
      const y = Math.floor(Math.pow(hash2i(i, 402, this.seed), 1.3) * H * 0.8);
      const tw = 0.5 + 0.5 * Math.sin(t * (1.3 + hash2i(i, 403, this.seed) * 2.4) + i * 7.1);
      ctx.globalAlpha = clamp01(a) * (0.25 + tw * 0.75);
      ctx.fillStyle = i % 5 === 0 ? '#ffe9c8' : '#e4ecff';
      ctx.fillRect(x, y, 1, 1);
      if (i % 4 === 0 && tw > 0.8) {
        ctx.globalAlpha = clamp01(a) * 0.45;
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // -- clouds -------------------------------------------------------------

  _cloudRamp(sc, amb) {
    let ramp = mixRamp(CLOUD_DAY, CLOUD_GOLD, sc.golden * 0.9);
    ramp = mixRamp(ramp, CLOUD_NIGHT, sc.night * 0.95);
    if (sc.dust > 0.01) {
      const dust = mixHex(sc.col[3], sc.col[1], 0.4);
      ramp = ramp.map((c, i) => mixHex(c, mixHex(dust, '#000000', 0.25 - i * 0.05), sc.dust * 0.6));
    }
    // clouds pick up the colour of the sky they are in, a little
    ramp = ramp.map((c, i) => mixHex(c, sc.col[1], 0.12 - i * 0.015));
    return ramp.map((c) => quantHex(comp(c, amb), 6));
  }

  _cloudCanvas(i, ramp) {
    const key = i + '|' + ramp.join('');
    let cv = this._cloudCv.get(key);
    if (cv) return cv;
    const m = this._cloudMasks[i];
    cv = colourize(m, ramp);
    if (this._cloudCv.size > 64) this._cloudCv.delete(this._cloudCv.keys().next().value);
    this._cloudCv.set(key, cv);
    return cv;
  }

  _drawClouds(ctx, cam, weather, H, sc, amb, t) {
    if (!this._cloudMasks) this._cloudMasks = bakeCloudMasks(this.seed);
    const cover = clamp01(weather.cloudCover ?? 0.25);
    const ramp = this._cloudRamp(sc, amb);
    const vw = cam.vw;
    const masks = this._cloudMasks;
    const wind = 1 + (weather.windSpeed || 0.4) * 1.5;
    // budget for re-colouring: at most a few new canvases a frame
    let budget = 3;
    const pick = (i) => {
      const key = i + '|' + ramp.join('');
      if (this._cloudCv.has(key)) return this._cloudCv.get(key);
      if (budget-- > 0 || !this._lastCloud?.[i]) return this._cloudCanvas(i, ramp);
      return this._lastCloud[i];
    };
    this._lastCloud = this._lastCloud || [];

    // high streaks: thin, slow, near the top of the sky
    const nHigh = 3 + Math.round(cover * 4);
    const spanH = vw + 520;
    for (let k = 0; k < nHigh; k++) {
      const mi = k % 5;
      const cv = pick(mi);
      this._lastCloud[mi] = cv;
      const u = hash2i(k, 11, this.seed) * spanH - cam.x * 0.008 - t * (1.2 + hash2i(k, 12, this.seed)) * wind;
      const x = Math.round(((u % spanH) + spanH) % spanH - 260);
      if (x > vw || x + cv.width < 0) continue;
      const y = Math.round(H * (0.06 + hash2i(k, 13, this.seed) * 0.32));
      ctx.globalAlpha = 0.42 + cover * 0.3;
      ctx.drawImage(cv, x, y);
    }
    // the puffs: lower, bigger, quicker
    const nPuff = Math.round(1 + cover * 9);
    const spanP = vw + 700;
    for (let k = 0; k < nPuff; k++) {
      const mi = 5 + (k % (masks.length - 5));
      const cv = pick(mi);
      this._lastCloud[mi] = cv;
      const u = hash2i(k, 21, this.seed) * spanP - cam.x * 0.022 - t * (2.6 + hash2i(k, 22, this.seed) * 2) * wind;
      const x = Math.round(((u % spanP) + spanP) % spanP - 350);
      if (x > vw || x + cv.width < 0) continue;
      // lower ones sit nearer the horizon and get smaller with it
      const yk = hash2i(k, 23, this.seed);
      const y = Math.round(H * (0.18 + yk * 0.5) - cv.height * 0.6);
      ctx.globalAlpha = clamp01(0.62 + cover * 0.38);
      ctx.drawImage(cv, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// bakers

function gradAt(rgb, v) {
  v = clamp01(v);
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (v <= STOPS[i + 1]) {
      const t = (v - STOPS[i]) / (STOPS[i + 1] - STOPS[i]);
      const a = rgb[i], b = rgb[i + 1];
      return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
    }
  }
  return rgb[rgb.length - 1];
}

/** Snap a colour to a coarser grid so caches keyed on it do not churn. */
export function quantHex(hex, q = 8) {
  const c = hexToRgb(hex);
  return rgbToHex(Math.round(c[0] / q) * q, Math.round(c[1] / q) * q, Math.round(c[2] / q) * q);
}

export function bakeGlow(rx, ry, color, alpha, steps, fall) {
  const W = rx * 2, H = ry * 2;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  const [r, gg, b] = hexToRgb(color);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - rx) / rx, dy = (y + 0.5 - ry) / ry;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd >= 1) continue;
      const k = Math.pow(1 - dd, fall) * steps;
      const band = Math.floor(k + (B4[y & 3][x & 3] - 0.5) * 0.9);
      if (band <= 0) continue;
      const o = (y * W + x) * 4;
      d[o] = r; d[o + 1] = gg; d[o + 2] = b;
      d[o + 3] = Math.round(255 * alpha * Math.min(1, band / steps));
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** A forked path of pixels from the top of the sky to just past the horizon. */
function growBolt(vw, H, rnd) {
  const pts = [];
  const line = (x0, y0, x1, y1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      pts.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)]);
    }
  };
  const walk = (x, y, yEnd, spread, depth) => {
    while (y < yEnd) {
      const nx = x + Math.round((rnd() - 0.5) * spread), ny = y + 3 + Math.round(rnd() * 6);
      line(x, y, nx, ny);
      if (depth < 2 && rnd() < 0.09) {
        walk(nx, ny, Math.min(yEnd, ny + (yEnd - ny) * (0.3 + rnd() * 0.4)), spread * 1.3, depth + 1);
      }
      x = nx; y = ny;
    }
  };
  walk(Math.round(vw * (0.12 + rnd() * 0.76)), -2, H + 12, 9, 0);
  return pts;
}

function moonPhase(h) {
  // rises at 17.5, sets at 6.5 - eleven hours across
  const hh = h >= 17.5 ? h - 17.5 : h < 6.5 ? h + 6.5 : -1;
  if (hh < 0) return 0;
  return clamp(hh / 13, 0.001, 0.999);
}

function bakeMoon() {
  const S = 17;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  const c = 8;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - c - 0.5, dy = y + 0.5 - c - 0.5;
      const d = Math.hypot(dx, dy);
      if (d > 6.6) continue;
      // lit from the lower left, a waxing gibbous
      const lit = dx * -0.55 + dy * 0.25 + 3.2;
      let col = lit > 0 ? '#eef2ff' : '#9aa6c8';
      if (lit > 0 && lit < 1.4) col = '#c9d3ee';
      // seas
      const sea = fbmTex(x * 0.35, y * 0.35, 77, 2);
      if (lit > 0 && sea > 0.58) col = '#b3bedc';
      if (d > 5.8) col = lit > 0 ? '#d7def4' : '#8a96b8';
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

function bakeStars(W, H, seed) {
  const cv = makeCanvas(W, Math.max(1, H));
  const g = cv.getContext('2d');
  // the band of the galaxy, a long diagonal smear of dust and dimmer stars
  const img = g.createImageData(W, Math.max(1, H));
  const d = img.data;
  const ang = -0.42;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x - W * 0.55) * cs - (y - H * 0.35) * sn;
      const v = (x - W * 0.55) * sn + (y - H * 0.35) * cs;
      const band = Math.exp(-(v * v) / (2 * 26 * 26));
      if (band < 0.08) continue;
      const n = fbmTex(u * 0.03, v * 0.06, seed + 5, 3);
      const rift = fbmTex(u * 0.05, v * 0.09, seed + 9, 2);
      let k = band * (0.35 + n * 0.9) - (rift > 0.62 ? 0.5 : 0);
      // fade toward the horizon, where the air is thick
      k *= clamp01((H - y) / (H * 0.35));
      if (k <= 0) continue;
      const th = B4[y & 3][x & 3];
      const o = (y * W + x) * 4;
      if (k * 0.55 > th) {
        d[o] = 150; d[o + 1] = 160; d[o + 2] = 205; d[o + 3] = 70;
      }
      if (hash2i(x, y, seed + 31) < k * 0.05) {
        d[o] = 210; d[o + 1] = 220; d[o + 2] = 255; d[o + 3] = 200;
      }
    }
  }
  g.putImageData(img, 0, 0);
  // the stars themselves
  const n = Math.round(W * H / 260);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash2i(i, 1, seed) * W);
    const y = Math.floor(Math.pow(hash2i(i, 2, seed), 1.25) * H);
    const b = hash2i(i, 3, seed);
    const fade = clamp01((H - y) / (H * 0.3));
    g.globalAlpha = (0.25 + b * 0.75) * fade;
    g.fillStyle = b > 0.9 ? '#fff4dc' : b > 0.7 ? '#dfe8ff' : '#b8c4e8';
    g.fillRect(x, y, 1, 1);
    if (b > 0.965) {
      g.globalAlpha = 0.35 * fade;
      g.fillRect(x - 1, y, 3, 1);
      g.fillRect(x, y - 1, 1, 3);
    }
  }
  g.globalAlpha = 1;
  return cv;
}

/**
 * Cloud masks: Uint8 shade indices (0 empty, 1..5 shadow..lit). The first five
 * are the high streaks, the rest are puffs.
 */
function bakeCloudMasks(seed) {
  const out = [];
  for (let i = 0; i < 5; i++) out.push(bakeStreak(seed + i * 97, i));
  for (let i = 0; i < 7; i++) out.push(bakePuff(seed + i * 131, i));
  return out;
}

/**
 * A high streak: a few long lens-shaped wisps, laid one under another, each
 * one dense along its middle and dithering away to nothing at its ends and
 * edges. Shade indices only run 3..5 - it is thin, lit cloud, never shadow.
 */
function bakeStreak(seed, v) {
  const W = 110 + Math.floor(hash2i(v, 1, seed) * 170);
  const H = 14 + Math.floor(hash2i(v, 2, seed) * 10);
  const m = new Uint8Array(W * H);
  const strands = 2 + Math.floor(hash2i(v, 3, seed) * 3);
  for (let s = 0; s < strands; s++) {
    const cy = 3 + hash2i(s, 4, seed) * (H - 7);
    const x0 = hash2i(s, 5, seed) * W * 0.35;
    const x1 = W - hash2i(s, 6, seed) * W * 0.35;
    const th = 1.2 + hash2i(s, 7, seed) * 2.4;
    const tilt = (hash2i(s, 8, seed) - 0.5) * 2.5;
    for (let x = Math.floor(x0); x < x1; x++) {
      const t = (x - x0) / (x1 - x0);
      const taper = Math.pow(Math.sin(t * Math.PI), 0.7);
      const yc = cy + tilt * (t - 0.5) + Math.sin(t * 5 + s) * 0.6;
      const half = th * taper;
      for (let y = Math.floor(yc - half - 1); y <= Math.ceil(yc + half + 1); y++) {
        if (y < 0 || y >= H) continue;
        const e = Math.abs(y + 0.5 - yc) / Math.max(0.5, half);
        // density: thick in the middle, broken along its length
        const n = fbmTex(x * 0.07, s * 3.1 + y * 0.2, seed + 3, 2);
        const k = (1 - e) * taper * (0.4 + n * 0.9);
        if (k < B4[y & 3][x & 3] * 0.9) continue;
        const shade = k > 0.7 ? 5 : k > 0.45 ? 4 : 3;
        const i = y * W + x;
        m[i] = Math.max(m[i], shade);
      }
    }
  }
  return { w: W, h: H, m };
}

function bakePuff(seed, v) {
  const W = 56 + Math.floor(hash2i(v, 1, seed) * 90);
  const H = 22 + Math.floor(hash2i(v, 2, seed) * 22);
  const p = new Painter(W, H);
  const base = H - 4;
  const puffs = 5 + Math.floor(hash2i(v, 3, seed) * 6);
  for (let i = 0; i < puffs; i++) {
    const t = puffs > 1 ? i / (puffs - 1) : 0.5;
    const bell = Math.sin(t * Math.PI);
    const x = 8 + t * (W - 16) + (hash2i(i, 4, seed) - 0.5) * 8;
    const r = 4 + bell * (H * 0.34) + hash2i(i, 5, seed) * 4;
    const y = base - r * (0.42 + bell * 0.32);
    p.ellipse(x, y, r * 1.15, r * 0.9, { mat: 'c', dome: r * 1.1 });
  }
  // a flat, slightly ragged bottom
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const cut = base - 1 + Math.round(fbmTex(x * 0.12, 3, seed, 2) * 2);
      if (y > cut) { const i = y * W + x; p.mat[i] = 0; p.hgt[i] = 0; }
    }
  }
  p.smoothHeight(2, 0.8);
  // shade: lit from above and a little from the left, flat underside dark
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!p.mat[i]) continue;
      const hl = x > 0 && p.mat[i - 1] ? p.hgt[i - 1] : 0;
      const hr = x < W - 1 && p.mat[i + 1] ? p.hgt[i + 1] : 0;
      const hu = y > 0 && p.mat[i - W] ? p.hgt[i - W] : 0;
      const hd = y < H - 1 && p.mat[i + W] ? p.hgt[i + W] : 0;
      let nx = -(hr - hl) * 0.5 * 0.6, ny = -(hd - hu) * 0.5 * 0.6;
      const nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      const L = (nx * -0.45 + ny * -0.85 + nz * 0.35) / nl;
      // underside goes dark regardless of normal
      const under = clamp01((y - (base - 7)) / 7);
      let val = 0.35 + L * 0.75 - under * 0.45;
      const q = Math.floor(clamp01(val) * 4.99 + (B4[y & 3][x & 3] - 0.5) * 0.9);
      m[i] = clamp(q, 0, 4) + 1;
    }
  }
  return { w: W, h: H, m };
}

/** Turn a shade-index mask into a canvas with the given ramp. */
export function colourize(mask, ramp) {
  const cv = makeCanvas(mask.w, mask.h);
  const g = cv.getContext('2d');
  const img = g.createImageData(mask.w, mask.h);
  const d = img.data;
  const rgb = ramp.map(hexToRgb);
  const m = mask.m;
  for (let i = 0; i < m.length; i++) {
    const v = m[i];
    if (!v) continue;
    const c = rgb[Math.min(rgb.length - 1, v - 1)];
    const o = i * 4;
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}
