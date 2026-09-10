// CRABDEN - sky and parallax scenery.
//
// Five depths: sky, far mesas, mid buttes, near dunes, and a foreground band
// drawn over everything. Each is separated by a wash of the biome's haze
// colour, which is what actually sells the distance - the sprites themselves
// are painted once and reused.

import { clamp, clamp01, lerp, mixHex, rgba, hashStr } from '../lib/math.js';
import { Painter, makeCanvas, fbmTex, hash2i } from './pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { biomeAt, biomeMix } from '../world/biomes.js';

// fogTint: how far each layer is pulled toward the sky, and toward what.
// This is aerial perspective - distance reads as *colour shift*, not as a
// grey veil over the whole screen, so the sky stays blue.
const LAYERS = {
  far: { p: 0.09, scale: 1.05, fog: 0.72, cool: 0.62, yOff: 26, spacing: 190 },
  mid: { p: 0.24, scale: 0.82, fog: 0.42, cool: 0.34, yOff: 40, spacing: 138 },
  near: { p: 0.5, scale: 0.55, fog: 0.17, cool: 0.12, yOff: 54, spacing: 104 },
};

export class Backdrop {
  constructor(seed = 'sky') {
    this.seed = hashStr(String(seed));
    this.mesas = new Map();     // mat -> [canvas]
    this.dunes = new Map();
    this.clouds = null;
    this.tufts = new Map();
    this.stars = null;
  }

  // -- baked pieces --------------------------------------------------------

  mesaSet(mat) {
    let set = this.mesas.get(mat);
    if (set) return set;
    set = [];
    for (let i = 0; i < 5; i++) set.push(paintMesa(mat, this.seed + i * 313, i));
    this.mesas.set(mat, set);
    return set;
  }

  duneSet(mat) {
    let set = this.dunes.get(mat);
    if (set) return set;
    set = [];
    for (let i = 0; i < 4; i++) set.push(paintDune(mat, this.seed + i * 71));
    this.dunes.set(mat, set);
    return set;
  }

  tuftSet(mat) {
    let set = this.tufts.get(mat);
    if (set) return set;
    set = [];
    for (let i = 0; i < 5; i++) set.push(paintTuft(mat, this.seed + i * 199));
    this.tufts.set(mat, set);
    return set;
  }

  cloudSet() {
    if (this.clouds) return this.clouds;
    this.clouds = [];
    for (let i = 0; i < 4; i++) this.clouds.push(paintCloud(this.seed + i * 617));
    return this.clouds;
  }

  // -- sky -----------------------------------------------------------------

  drawSky(ctx, cam, weather) {
    const vw = cam.vw, vh = cam.vh;
    const { a, b, t } = biomeMix(cam.x);
    const sky = a.sky.map((c, i) => mixHex(c, b.sky[i], t));
    const night = weather.nightMix;

    // night colours pull the whole gradient down and blue
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    const zen = mixHex(sky[0], '#080d1c', night * 0.85);
    const upper = mixHex(sky[1], '#111a30', night * 0.8);
    const lower = mixHex(sky[2], '#1d2338', night * 0.72);
    const horiz = mixHex(sky[3], '#2b2c3e', night * 0.6);
    grad.addColorStop(0, zen);
    grad.addColorStop(0.38, upper);
    grad.addColorStop(0.72, lower);
    grad.addColorStop(1, horiz);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

    if (night > 0.25) this._drawStars(ctx, cam, night);
    this._drawSun(ctx, cam, weather, vw, vh);
    this._drawClouds(ctx, cam, weather, vw, vh);
  }

  _drawStars(ctx, cam, night) {
    if (!this.stars) {
      this.stars = [];
      for (let i = 0; i < 130; i++) {
        this.stars.push({
          x: hash2i(i, 3, this.seed) * 2000,
          y: hash2i(i, 91, this.seed) * 0.62,
          b: 0.3 + hash2i(i, 17, this.seed) * 0.7,
        });
      }
    }
    const a = clamp01((night - 0.25) / 0.5);
    for (const s of this.stars) {
      const x = ((s.x - cam.x * 0.02) % 2000 + 2000) % 2000;
      if (x > cam.vw) continue;
      const tw = 0.7 + Math.sin(performance.now() * 0.001 + s.x) * 0.3;
      ctx.fillStyle = rgba('#dce6ff', a * s.b * tw);
      ctx.fillRect(Math.round(x), Math.round(s.y * cam.vh), 1, 1);
    }
  }

  _drawSun(ctx, cam, weather, vw, vh) {
    const h = weather.hour;
    const day = h > 5.5 && h < 18.6;
    const t = day ? (h - 5.5) / 13.1 : ((h + 24 - 18.6) % 24) / 10.9;
    const x = vw * (0.08 + t * 0.84);
    const arc = Math.sin(Math.PI * clamp01(t));
    const y = vh * (0.86 - arc * 0.72);

    if (day) {
      const warm = arc < 0.35 ? mixHex('#ff9a4a', '#ffd98a', arc / 0.35) : '#fff3cf';
      const r = 7;
      // glow
      const g = ctx.createRadialGradient(x, y, 0, x, y, 64);
      g.addColorStop(0, rgba(warm, 0.5));
      g.addColorStop(0.35, rgba(warm, 0.16));
      g.addColorStop(1, rgba(warm, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 64, y - 64, 128, 128);
      ctx.fillStyle = warm;
      ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fffdf2';
      ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r - 2.5, 0, Math.PI * 2); ctx.fill();
    } else {
      const r = 6;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 46);
      g.addColorStop(0, rgba('#cfe0ff', 0.28));
      g.addColorStop(1, rgba('#cfe0ff', 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 46, y - 46, 92, 92);
      ctx.fillStyle = '#e8eeff';
      ctx.beginPath(); ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba('#b9c6e0', 0.7);
      ctx.beginPath(); ctx.arc(Math.round(x) + 2, Math.round(y) - 1, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  _drawClouds(ctx, cam, weather, vw, vh) {
    const set = this.cloudSet();
    const day = 1 - weather.nightMix;
    const cover = weather.cloudCover;
    if (cover < 0.02) return;
    const drift = cam.x * 0.035 + weather.time * 3.2;
    ctx.save();
    ctx.globalAlpha = clamp01(cover) * (0.5 + day * 0.45);
    for (let i = 0; i < 14; i++) {
      const sprite = set[i % set.length];
      const span = 620;
      const bx = ((i * 197 + hash2i(i, 5, this.seed) * 400) - drift) % span;
      const x = ((bx % span) + span) % span - 120;
      if (x > vw + 40) continue;
      const y = vh * (0.06 + hash2i(i, 41, this.seed) * 0.34);
      const s = 0.7 + hash2i(i, 77, this.seed) * 0.9;
      ctx.drawImage(sprite, Math.round(x), Math.round(y),
        Math.round(sprite.width * s), Math.round(sprite.height * s));
    }
    ctx.restore();
  }

  // -- parallax scenery ----------------------------------------------------

  _scratch(w, h) {
    if (!this._tmp || this._tmp.width !== w || this._tmp.height !== h) {
      this._tmp = makeCanvas(w, h);
      this._tmpCtx = this._tmp.getContext('2d');
      this._tmpCtx.imageSmoothingEnabled = false;
    }
    return this._tmpCtx;
  }

  drawLayer(ctx, cam, weather, name, terrain) {
    const L = LAYERS[name];
    const vw = cam.vw, vh = cam.vh;
    const px = cam.x * L.p;
    const horizon = (terrain ? terrain.baseY(cam.x) : 0 - cam.y) * 0 + (0 - cam.y) * cam.zoom + vh / 2;

    // Layers are painted into a scratch buffer so the haze can be applied to
    // the silhouettes only - source-atop - instead of over the whole sky.
    const t = this._scratch(vw, vh);
    t.clearRect(0, 0, vw, vh);

    const first = Math.floor((px - vw) / L.spacing) - 1;
    const last = Math.ceil((px + vw) / L.spacing) + 1;
    for (let i = first; i <= last; i++) {
      const wx = i * L.spacing + (hash2i(i, name.length * 7, this.seed) - 0.5) * L.spacing * 0.6;
      const screenX = Math.round(wx - px);
      if (screenX < -300 || screenX > vw + 300) continue;
      const worldX = cam.x + (screenX - vw / 2) / Math.max(0.05, L.p);
      const biome = biomeAt(worldX);

      const r = hash2i(i, 31, this.seed);
      const useDune = name === 'near' ? r < 0.62 : r < 0.2;
      const set = useDune ? this.duneSet(biome.groundMat) : this.mesaSet(biome.mesaMat);
      const sprite = set[Math.floor(hash2i(i, 63, this.seed) * set.length)];
      const s = L.scale * (0.7 + hash2i(i, 11, this.seed) * 0.7);
      const w = Math.round(sprite.width * s);
      const h = Math.round(sprite.height * s);
      const y = Math.round(horizon + L.yOff + hash2i(i, 89, this.seed) * 16 - h);
      t.drawImage(sprite, screenX - Math.round(w / 2), y, w, h);
    }

    // aerial perspective: pull the silhouettes toward the sky near the horizon
    const biome = biomeAt(cam.x);
    const skyLow = mixHex(biome.sky[3], biome.sky[2], 0.35);
    const cool = mixHex(skyLow, '#9db4cc', L.cool);
    const fogCol = mixHex(cool, '#1b2338', weather.nightMix * 0.8);
    const amount = clamp01(L.fog * (0.75 + weather.haze * 0.3) + weather.fog * 0.35);
    t.save();
    t.globalCompositeOperation = 'source-atop';
    t.globalAlpha = amount;
    t.fillStyle = fogCol;
    t.fillRect(0, 0, vw, vh);
    t.restore();

    ctx.drawImage(this._tmp, 0, 0);
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
    // foreground sits in its own shade
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#3a2c34';
    ctx.fillRect(0, vh - 26, vw, 26);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// baked sprites
// ---------------------------------------------------------------------------

function paintMesa(mat, seed, variant) {
  // Five archetypes so a ridgeline never reads as the same trapezoid twice.
  const kind = variant % 5;
  const w = [168, 132, 96, 200, 236][kind];
  const h = [150, 176, 196, 120, 104][kind];
  const p = new Painter(w, h);
  const r = (k) => hash2i(variant, k, seed);

  // --- silhouette --------------------------------------------------------
  const capY = h * (0.10 + r(1) * 0.14);
  const shoulderL = w * (0.10 + r(2) * 0.14);
  const shoulderR = w * (0.86 - r(3) * 0.14);
  const notchX = w * (0.3 + r(4) * 0.4);
  const notchW = w * (0.05 + r(5) * 0.1);
  const notchD = h * (0.05 + r(6) * 0.16);
  const tier2 = h * (0.30 + r(7) * 0.2);

  const profile = (x) => {
    let top;
    if (x < shoulderL) {
      const t = clamp01(x / shoulderL);
      top = lerp(h * 0.98, capY + 8, Math.pow(t, kind === 2 ? 0.8 : 0.42));
    } else if (x > shoulderR) {
      const t = clamp01((w - x) / (w - shoulderR));
      top = lerp(h * 0.98, capY + 8, Math.pow(t, kind === 2 ? 0.8 : 0.42));
    } else {
      top = capY + fbmTex(x * 0.05, 3, seed, 2) * 5;
      // a stepped second tier on some silhouettes
      if (kind === 1 && x > w * 0.52) top = tier2;
      if (kind === 3) top += Math.sin(x * 0.13 + r(8) * 6) * 7 + fbmTex(x * 0.12, 9, seed + 4, 2) * 9;
    }
    // a cleft cut down through the cap
    if (kind !== 2 && x > notchX && x < notchX + notchW) {
      const t = (x - notchX) / notchW;
      top += Math.sin(t * Math.PI) * notchD;
    }
    return top;
  };

  // --- body --------------------------------------------------------------
  p.field(0, 0, w - 1, h - 1, (fx, fy) => {
    const top = profile(fx);
    if (fy < top) return null;
    const depth = fy - top;
    // vertical erosion channels dominate; that is what makes a cliff a cliff
    const gully = fbmTex(fx * 0.16, fy * 0.008, seed + 5, 3);
    const gully2 = fbmTex(fx * 0.42, fy * 0.02, seed + 15, 2);
    // strata sit under them, subtle
    const strat = Math.sin((fy + fbmTex(fx * 0.02, 1, seed + 9, 2) * 16) * 0.17);
    let tint = (gully - 0.5) * 0.5 + (gully2 - 0.5) * 0.2 + strat * 0.08;
    tint -= clamp01(depth / (h * 0.85)) * 0.3;
    const dome = depth < 3 ? (3 - depth) * 2.2 : 0;
    return { h: dome + (gully - 0.5) * 5 + (gully2 - 0.5) * 2, tint };
  }, { mat });

  // --- cap rock, lighter and slightly proud ------------------------------
  const capH = 5 + r(11) * 7;
  p.field(0, 0, w - 1, h - 1, (fx, fy) => {
    const top = profile(fx);
    const depth = fy - top;
    if (depth < 0 || depth > capH) return null;
    const n = fbmTex(fx * 0.2, fy * 0.2, seed + 27, 2);
    return { h: 6 - depth * 0.5, tint: 0.2 - depth * 0.02 + (n - 0.5) * 0.16 };
  }, { mat, mask: true });

  // --- talus skirt -------------------------------------------------------
  const skirtTop = h * (0.72 + r(12) * 0.1);
  p.field(0, 0, w - 1, h - 1, (fx, fy) => {
    const edge = Math.min(fx, w - fx) / (w * 0.5);
    const sk = skirtTop + (1 - Math.pow(edge, 0.6)) * -h * 0.18
      + fbmTex(fx * 0.05, 9, seed + 21, 2) * 12;
    if (fy < sk) return null;
    const n = fbmTex(fx * 0.28, fy * 0.28, seed + 33, 2);
    return { h: n * 3.2, tint: (n - 0.5) * 0.34 - 0.1 };
  }, { mat });

  // --- boulders at the foot ---------------------------------------------
  for (let i = 0; i < 7; i++) {
    const bx = r(40 + i) * w;
    const by = h - 4 - r(60 + i) * 12;
    const br = 2 + r(80 + i) * 5;
    p.ellipse(bx, by, br, br * 0.78, { mat, dome: br * 1.2, tint: (r(90 + i) - 0.5) * 0.3 });
  }

  p.smoothHeight(1, 0.45);
  return p.resolve(MATERIALS, { ambient: 0.4, lightX: -0.66, lightY: -0.5, lightZ: 0.35, dither: 0.62, outline: 0 });
}

function paintDune(mat, seed) {
  const w = 190, h = 60;
  const p = new Painter(w, h);
  p.field(0, 0, w - 1, h - 1, (fx, fy) => {
    const t = fx / w;
    const crest = h * 0.34 + Math.sin(t * Math.PI) * -h * 0.24
      + fbmTex(fx * 0.02, 2, seed, 2) * 10;
    if (fy < crest) return null;
    const d = fy - crest;
    const n = fbmTex(fx * 0.05, fy * 0.08, seed + 7, 2);
    return { h: d < 3 ? (3 - d) * 2 : n * 1.4, tint: (n - 0.5) * 0.2 - clamp01(d / h) * 0.12 };
  }, { mat });
  p.smoothHeight(1, 0.7);
  return p.resolve(MATERIALS, { ambient: 0.48, dither: 0.55, outline: 0 });
}

function paintCloud(seed) {
  const w = 110, h = 46;
  const p = new Painter(w, h);
  const baseY = h * 0.78;
  const puffs = 6 + Math.floor(hash2i(1, 2, seed) * 5);
  // a flat underside with piled tops reads as cumulus rather than cotton wool
  for (let i = 0; i < puffs; i++) {
    const t = i / (puffs - 1);
    const bell = Math.sin(t * Math.PI);
    const x = 12 + t * (w - 24) + (hash2i(i, 3, seed) - 0.5) * 10;
    const r = 7 + bell * 11 + hash2i(i, 21, seed) * 5;
    const y = baseY - r * (0.45 + bell * 0.3);
    p.ellipse(x, y, r, r * 0.86, { mat: 'petalWhite', dome: r * 1.15 });
  }
  // shave the bottom flat
  for (let y = Math.ceil(baseY); y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      p.mat[i] = 0; p.hgt[i] = 0;
    }
  }
  p.smoothHeight(2, 0.85);
  return p.resolve(MATERIALS, {
    ambient: 0.62, lightX: -0.35, lightY: -0.85, lightZ: 0.4, dither: 0.45, outline: 0,
  });
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
