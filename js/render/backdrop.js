// CRABDEN - sky and parallax scenery.
//
// Behind the ground you walk on there are six depths of country, and in front
// of it one more. Each depth is a long strip of painted wasteland (see
// art/wasteland.js), baked a tile at a time as the camera comes up on it.
//
// What makes it read as distance rather than as stacked cardboard:
//
//   - The strips move at the rate a real camera would move them. One over the
//     scale of a strip is how far away it is; the camera's zoom is a dolly,
//     so zooming in grows the near strips and leaves the far ones where they
//     were (`stripScale`).
//   - They sit on a horizon, not on the ground. The horizon is a fixed height
//     above the line the camera keeps the animal on, and every strip's ground
//     line falls toward it with distance - so when you climb a dune the near
//     ridges sink and the far ones do not move.
//   - Each strip is pulled toward the colour of the air at the horizon by how
//     far off it is (aerial perspective), and a band of dust lies along the
//     foot of each one.
//
// Nothing is painted per frame. Tiles are painted once, tinted when the light
// changes enough to notice, and drawn with drawImage.

import { clamp, clamp01, lerp, mixHex, hexToRgb, rgbToHex, hashStr } from '../lib/math.js';
import { Painter, makeCanvas, fbmTex, hash2i } from './pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { biomeAt, biomeMix } from '../world/biomes.js';
import { Sky, ambientMul, comp, quantHex, B4 } from './sky.js';
import { DEPTHS, DEPTH, TILE_W, TILE_MARGIN, paintTile, styleOf, biomeOnStrip } from '../art/wasteland.js';
import { Life } from '../art/beasts.js';

const Z_REF = 1.6;
const CALLS = { far: ['skyline', 'range', 'buttes'], mid: ['mesas', 'wrecks'], near: ['ridge', 'dunes', 'foot'] };
const MAX_TILES = 18;
// the dust along the foot of each strip: how tall the fade is (strip px) and
// how thick it gets at the bottom
const BAND = {
  skyline: { h: 8, a: 0.86 }, range: { h: 12, a: 0.8 }, buttes: { h: 16, a: 0.72 },
  mesas: { h: 22, a: 0.6 }, wrecks: { h: 22, a: 0.46 }, ridge: { h: 24, a: 0.3 }, dunes: { h: 22, a: 0.18 },
  foot: { h: 18, a: 0.08 },
};

for (const d of DEPTHS) d.e = 1 / d.s - 1 / Z_REF;

/** How big a strip is drawn, relative to how it was painted, at this zoom. */
function stripScale(d, z) {
  const s = 1 / (1 / Math.max(0.05, z) + d.e);
  const g = s / d.s;
  // a little either way is drawn at 1:1 so the pixel art stays crisp
  const gd = g > 1.1 ? g - 0.1 : g < 0.9 ? g + 0.1 : 1;
  return { s, g: gd };
}

export class Backdrop {
  constructor(seed = 'sky') {
    this.seed = hashStr(String(seed));
    this.sky = new Sky(this.seed);
    this.tiles = DEPTHS.map(() => new Map());
    this.bands = new Map();
    this.tufts = new Map();
    this.life = new Life(this.seed);
    this.frames = 0;
    this._geo = null;
    this._budget = 0;
    this._t0 = performance.now();
    // Three dials for a scene that wants the country to be somewhere else
    // for a while (the thousand-year timelapse drives them; play leaves them
    // alone): `wash` pulls every strip toward a colour, `fade` pushes them
    // further into the air, and `sink` lowers the whole skyline, in world
    // units, so the land can be seen coming up. `lifeOn` false empties it.
    this.wash = null;          // { col: '#rrggbb', a: 0..1 }
    this.fade = 0;
    this.sink = 0;
    this.lifeOn = true;
    this.warp = 0;
  }

  /** Seconds since the backdrop was made: the clock everything alive runs on. */
  // `warp` is seconds added on top, for a scene that runs the clouds and the
  // herds faster than the wall clock (it only ever goes forward)
  get t() { return (performance.now() - this._t0) / 1000 + (this.warp || 0); }

  // -- per-frame geometry -------------------------------------------------

  geometry(cam) {
    const vw = cam.vw, vh = cam.vh, z = cam.zoom;
    const yb = cam.yBias ?? 0.16;
    const sink = this.sink || 0;
    const key = `${cam.x}|${cam.y}|${z}|${vw}|${vh}|${yb}|${sink}`;
    if (this._geo && this._geo.key === key) return this._geo;
    // where the camera keeps the animal's feet, and the horizon above that
    const R = vh / 2 + vh * yb;
    // on a tall phone the eye height follows the width, or the horizon ends
    // up at the top of the screen and there is no sky left
    const lift = clamp(Math.round(Math.min(vh, vw * 0.75) * 0.24), 40, 140);
    const H = Math.round(R - lift);
    // how far the ground under the camera's subject is above world y=0
    const dY = (0 - cam.y) - vh * yb / z;
    const strips = DEPTHS.map((d) => {
      const { s, g } = stripScale(d, z);
      const base = H + s * (lift / z + dY + sink);
      return { d, s, g, base, uCam: cam.x * d.s };
    });
    this._geo = { key, R, H, lift, dY, strips, vw, vh, z };
    return this._geo;
  }

  // -- sky -----------------------------------------------------------------

  drawSky(ctx, cam, weather) {
    this.frames++;
    // A frame's worth of painting time. The first frames paint everything;
    // after that a few milliseconds a frame keeps ahead of walking, and if
    // the last frame had holes in it (a cut, a teleport) it gets more.
    this._budget = this.frames < 4 ? 400 : this._missing ? 22 : 6;
    this._missing = false;
    this._frameStart = performance.now();
    const geo = this.geometry(cam);
    this.sky.draw(ctx, cam, weather, geo.H, this.t);
    this._air(cam, weather);
    this.life.drawSky(ctx, cam, weather, geo, this);
  }

  /** The colour of the air this frame, and how much of it each strip gets. */
  _air(cam, weather) {
    const sc = this.sky.last;
    const amb = ambientMul(weather);
    // What the strips fade into. Near the ground the air is dust, the colour
    // of the horizon; the further off a strip is, the more of the sky above
    // the horizon it takes on - which is why distant ranges go blue.
    const hz = mixHex(sc.col[4], sc.col[3], 0.35);
    const cool = mixHex(sc.col[1], sc.col[2], 0.6);
    const dust = sc.dust;
    const haze = clamp01(weather.haze ?? 0.5);
    const wash = this.wash && this.wash.a > 0.01 ? this.wash : null;
    const fade = this.fade || 0;
    this.air = {
      amb, hz, sc,
      tints: DEPTHS.map((d) => {
        let c = comp(mixHex(hz, cool, d.cool * (1 - dust * 0.8)), amb);
        if (wash) c = mixHex(c, wash.col, clamp01(wash.a));
        return quantHex(c, 4);
      }),
      k: (d) => clamp01(d.fog * (0.86 + haze * 0.18) + dust * (0.25 + (6 - d.index) * 0.07) + (weather.fog || 0) * 0.2
        + fade * (0.4 + d.fog * 0.6)),
      night: sc.night,
    };
  }

  // -- strips --------------------------------------------------------------

  _tile(di, k) {
    const map = this.tiles[di];
    let t = map.get(k);
    if (t) { t.used = this.frames; return t; }
    const left = this._budget - (performance.now() - this._frameStart);
    if (left <= 0) return null;
    const cv = paintTile(DEPTHS[di], k, this.seed);
    t = { cv, tinted: null, key: '', used: this.frames };
    map.set(k, t);
    if (map.size > MAX_TILES) {
      let oldK = null, oldU = Infinity;
      for (const [kk, v] of map) if (v.used < oldU) { oldU = v.used; oldK = kk; }
      if (oldK !== null) map.delete(oldK);
    }
    return t;
  }

  _tinted(t, d, tint, a) {
    const key = tint + '|' + a.toFixed(2);
    if (t.key === key && t.tinted) return t.tinted;
    // re-tinting is cheap but not free; a stale tint for a frame is invisible
    if (t.tinted && this._tints-- <= 0) return t.tinted;
    if (!t.tinted) t.tinted = makeCanvas(TILE_W, d.th);
    const g = t.tinted.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, TILE_W, d.th);
    g.drawImage(t.cv, TILE_MARGIN, 0, TILE_W, d.th, 0, 0, TILE_W, d.th);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = a;
    g.fillStyle = tint;
    g.fillRect(0, 0, TILE_W, d.th);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    t.key = key;
    return t.tinted;
  }

  _band(id, vw, h, col, a) {
    const key = `${id}|${vw}|${h}|${col}|${a.toFixed(2)}`;
    let cv = this.bands.get(key);
    if (cv) return cv;
    cv = makeCanvas(vw, h);
    const g = cv.getContext('2d');
    const img = g.createImageData(vw, h);
    const dd = img.data;
    const [r, gg, b] = hexToRgb(col);
    const steps = 4;
    for (let y = 0; y < h; y++) {
      const k = Math.pow((y + 1) / h, 1.6) * steps;
      for (let x = 0; x < vw; x++) {
        const band = Math.floor(k + (B4[y & 3][x & 3] - 0.5) * 0.95);
        if (band <= 0) continue;
        const o = (y * vw + x) * 4;
        dd[o] = r; dd[o + 1] = gg; dd[o + 2] = b;
        dd[o + 3] = Math.round(255 * a * Math.min(1, band / steps));
      }
    }
    g.putImageData(img, 0, 0);
    if (this.bands.size > 24) this.bands.delete(this.bands.keys().next().value);
    this.bands.set(key, cv);
    return cv;
  }

  drawLayer(ctx, cam, weather, name, terrain) {
    const ids = CALLS[name];
    if (!ids) return;
    const geo = this.geometry(cam);
    if (!this.air) this._air(cam, weather);
    this._tints = 6;
    for (const id of ids) {
      const di = DEPTH[id].index;
      this._drawStrip(ctx, geo, di);
      if (this.lifeOn) this.life.drawAfter(ctx, cam, weather, geo, id, this);
    }
  }

  _drawStrip(ctx, geo, di) {
    const st = geo.strips[di];
    const d = st.d;
    const vw = geo.vw, vh = geo.vh;
    const g = st.g;
    const air = this.air;
    const a = Math.round(air.k(d) * 50) / 50;
    const half = vw / 2 / g;
    const k0 = Math.floor((st.uCam - half) / TILE_W), k1 = Math.floor((st.uCam + half) / TILE_W);
    const top = Math.round(st.base - d.base * g);
    const th = Math.ceil(d.th * g);
    const tint = air.tints[di];
    for (let k = k0; k <= k1; k++) {
      const t = this._tile(di, k);
      if (!t) { this._missing = true; continue; }
      const cv = this._tinted(t, d, tint, a);
      const x0 = Math.round(vw / 2 + (k * TILE_W - st.uCam) * g);
      const x1 = Math.round(vw / 2 + ((k + 1) * TILE_W - st.uCam) * g);
      ctx.drawImage(cv, 0, 0, TILE_W, d.th, x0, top, x1 - x0, th);
    }
    // and one tile ahead either side, if there is time, so walking never
    // waits on the painter
    this._tile(di, k0 - 1); this._tile(di, k1 + 1);

    // the dust along its foot, and the ground under it down to the next strip
    const B = BAND[d.id];
    const bh = Math.max(2, Math.round(B.h * g));
    const by = Math.round(st.base) - bh + 2;
    const ba = clamp01(B.a * (0.7 + air.k(d) * 0.5));
    const band = this._band(d.id, vw, bh, tint, Math.round(ba * 20) / 20);
    ctx.drawImage(band, 0, by);
    const next = geo.strips[di + 1];
    const bottom = next ? Math.round(next.base) + 3 : vh;
    const tileBottom = top + th;
    if (bottom > by + bh) {
      // below the tile there is only ground; under the dust, ground and air
      const sand = MATERIALS[styleOf(biomeOnStrip(d, st.uCam)).sand] || MATERIALS.sand;
      const ground = mixHex(sand.ramp[4], tint, a);
      if (bottom > tileBottom) {
        ctx.fillStyle = ground;
        ctx.fillRect(0, tileBottom, vw, bottom - tileBottom);
      }
      ctx.globalAlpha = Math.round(ba * 20) / 20;
      ctx.fillStyle = tint;
      ctx.fillRect(0, by + bh, vw, bottom - by - bh);
      ctx.globalAlpha = 1;
    }
  }

  /** Grass and rubble silhouettes in front of everything. */
  drawForeground(ctx, cam, weather, terrain) {
    const vw = cam.vw, vh = cam.vh;
    const p = 1.55;
    const px = cam.x * p;
    const spacing = 74;
    const first = Math.floor((px - vw) / spacing) - 1;
    const last = Math.ceil((px + vw) / spacing) + 1;
    const biome = biomeAt(cam.x);
    const set = this.tuftSet(biome.groundMat);
    ctx.save();
    for (let i = first; i <= last; i++) {
      if (hash2i(i, 909, this.seed) > 0.5) continue;
      const jitter = (hash2i(i, 17, this.seed) - 0.5) * spacing * 0.8;
      const screenX = Math.round(i * spacing + jitter - px);
      if (screenX < -80 || screenX > vw + 80) continue;
      const sprite = set[Math.floor(hash2i(i, 55, this.seed) * set.length)];
      const s = 1.5 + hash2i(i, 23, this.seed) * 1.3;
      const w = Math.round(sprite.width * s), h = Math.round(sprite.height * s);
      const y = vh - h + Math.round(hash2i(i, 71, this.seed) * 18) + 6;
      ctx.globalAlpha = 0.92;
      ctx.drawImage(sprite, screenX, y, w, h);
    }
    ctx.restore();
  }

  tuftSet(mat) {
    let set = this.tufts.get(mat);
    if (set) return set;
    set = [];
    for (let i = 0; i < 5; i++) set.push(paintTuft(mat, this.seed + i * 199));
    this.tufts.set(mat, set);
    return set;
  }
}

// ---------------------------------------------------------------------------
// baked sprites kept for anything that still wants them

function paintMesa(mat, seed, variant) {
  const kind = variant % 5;
  const w = [168, 132, 96, 200, 236][kind];
  const h = [150, 176, 196, 120, 104][kind];
  const p = new Painter(w, h);
  const r = (k) => hash2i(variant, k, seed);
  const capY = h * (0.10 + r(1) * 0.14);
  const shoulderL = w * (0.10 + r(2) * 0.14);
  const shoulderR = w * (0.86 - r(3) * 0.14);
  const profile = (x) => {
    if (x < shoulderL) return lerp(h * 0.98, capY + 8, Math.pow(clamp01(x / shoulderL), 0.42));
    if (x > shoulderR) return lerp(h * 0.98, capY + 8, Math.pow(clamp01((w - x) / (w - shoulderR)), 0.42));
    return capY + fbmTex(x * 0.05, 3, seed, 2) * 5;
  };
  p.field(0, 0, w - 1, h - 1, (fx, fy) => {
    const top = profile(fx);
    if (fy < top) return null;
    const depth = fy - top;
    const gully = fbmTex(fx * 0.16, fy * 0.008, seed + 5, 3);
    const strat = Math.sin((fy + fbmTex(fx * 0.02, 1, seed + 9, 2) * 16) * 0.17);
    let tint = (gully - 0.5) * 0.5 + strat * 0.08 - clamp01(depth / (h * 0.85)) * 0.3;
    return { h: (depth < 3 ? (3 - depth) * 2.2 : 0) + (gully - 0.5) * 5, tint };
  }, { mat });
  p.smoothHeight(1, 0.45);
  return p.resolve(MATERIALS, { ambient: 0.4, lightX: -0.66, lightY: -0.5, lightZ: 0.35, dither: 0.62, outline: 0 });
}

function paintDune(mat, seed) {
  const w = 190, h = 60;
  const p = new Painter(w, h);
  p.field(0, 0, w - 1, h - 1, (fx, fy) => {
    const t = fx / w;
    const crest = h * 0.34 + Math.sin(t * Math.PI) * -h * 0.24 + fbmTex(fx * 0.02, 2, seed, 2) * 10;
    if (fy < crest) return null;
    const d = fy - crest;
    const n = fbmTex(fx * 0.05, fy * 0.08, seed + 7, 2);
    return { h: d < 3 ? (3 - d) * 2 : n * 1.4, tint: (n - 0.5) * 0.2 - clamp01(d / h) * 0.12 };
  }, { mat });
  p.smoothHeight(1, 0.7);
  return p.resolve(MATERIALS, { ambient: 0.48, dither: 0.55, outline: 0 });
}

function paintTuft(mat, seed) {
  const w = 26, h = 20;
  const p = new Painter(w, h);
  const blades = 5 + Math.floor(hash2i(2, 3, seed) * 5);
  for (let i = 0; i < blades; i++) {
    const bx = 4 + hash2i(i, 11, seed) * (w - 8);
    const bh = 7 + hash2i(i, 23, seed) * 11;
    const lean = (hash2i(i, 37, seed) - 0.5) * 8;
    p.curve([{ x: bx, y: h }, { x: bx + lean * 0.4, y: h - bh * 0.6 }, { x: bx + lean, y: h - bh }],
      1.5, 0.5, { mat: 'leafDry', dome: 1.6, tint: (hash2i(i, 53, seed) - 0.5) * 0.3 });
  }
  p.ellipse(w / 2, h - 1, 7, 2.4, { mat, dome: 2 });
  return p.resolve(MATERIALS, { ambient: 0.42, dither: 0.6, outline: 0.75, outlineColor: '#241a10' });
}

export { paintMesa, paintDune, paintTuft };
