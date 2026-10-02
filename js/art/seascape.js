// CRABDEN - the sea, from further off.
//
// The reef in sea.js is what grows where you are standing. This is the rest
// of it: the water itself, banded from turquoise under the surface to navy at
// the bottom of the column; four ranks of rock going back into the blue, each
// one paler, bluer and flatter than the one in front, which is the whole trick
// of making flat pixels read as a hundred metres of water; the shafts of light;
// the surface seen from underneath; kelp and seagrass; the seabed itself; the
// dark shapes across the front of the frame; and the turtle and the manta.
//
// Everything far off is drawn at the scene's own pixel size rather than the
// world's zoom, the same way the desert backdrop is: a wall half a mile away
// does not get bigger because the camera leaned in. Everything is baked once
// and only blitted per frame.

import { Painter, makeCanvas, fbmTex, hash2i, vnoise } from '../render/pixel.js';
import { withMaterials } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU, mulberry32 } from '../lib/math.js';
import { rockMass, topOf } from './rockgen.js';

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
].map((r) => r.map((v) => (v + 0.5) / 64));
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------------------
// the water column
//
// The colour is pinned to depth below the surface, not to the screen: a metre
// down is the same turquoise wherever the camera is. It is painted in flat
// bands BAND world units deep, and each band runs into the next over three
// rows of ordered dither - a gradient made of pixels.

const WATER_STOPS = [
  [0, '#aef6ee'], [22, '#84eaee'], [60, '#5ad6ea'], [115, '#3cbee2'], [185, '#2ca4d8'],
  [265, '#2389ca'], [355, '#1d6fb8'], [455, '#1958a2'], [575, '#15448a'], [720, '#10326e'], [900, '#0b2252'],
];
const WS = WATER_STOPS.map(([d, h]) => [d, rgb(h)]);
export const BAND = 22;
const NBANDS = 48;

/** The colour of open water at a depth below the surface, as [r, g, b]. */
export function waterAt(depth) {
  if (depth <= 0) return WS[0][1].slice();
  for (let i = 1; i < WS.length; i++) {
    if (depth <= WS[i][0]) {
      const t = (depth - WS[i - 1][0]) / (WS[i][0] - WS[i - 1][0]);
      return mixc(WS[i - 1][1], WS[i][1], t);
    }
  }
  return WS[WS.length - 1][1].slice();
}
const bandRGB = [];
for (let k = 0; k <= NBANDS; k++) bandRGB.push(waterAt((k + 0.5) * BAND).map(Math.round));
export const bandColor = (k) => bandRGB[clamp(k, 0, NBANDS)];

let ditherAtlas = null;
const AW = 1024;
/** Rows of 2x2 ordered dither in each band's colour, for the seams between bands. */
function bandDither() {
  if (ditherAtlas) return ditherAtlas;
  const cv = makeCanvas(AW, NBANDS * 6);
  const g = cv.getContext('2d');
  const img = g.createImageData(AW, NBANDS * 6);
  const B2 = [[0, 2], [3, 1]];
  for (let k = 0; k < NBANDS; k++) {
    const c = bandRGB[k + 1];
    for (let l = 1; l <= 3; l++) {
      for (let par = 0; par < 2; par++) {
        const row = k * 6 + (l - 1) * 2 + par;
        for (let x = 0; x < AW; x++) {
          if (B2[par][x & 1] >= l) continue;
          const o = (row * AW + x) * 4;
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  ditherAtlas = cv;
  return cv;
}

/**
 * Paint the open water into `g` (a canvas the size of the frame): flat bands
 * from `surfY` (the screen row of the surface) downward, `zoom` screen pixels
 * per world unit of depth. Above the surface nothing is painted.
 */
export function paintWater(g, vw, vh, surfY, zoom) {
  const atlas = bandDither();
  const step = BAND * zoom;
  const k0 = Math.max(0, Math.floor((0 - surfY) / step));
  for (let k = k0; k <= NBANDS; k++) {
    const y0 = Math.round(surfY + k * step);
    const y1 = k === NBANDS ? vh : Math.round(surfY + (k + 1) * step);
    if (y0 >= vh) break;
    if (y1 <= 0) continue;
    const top = Math.max(0, y0);
    g.fillStyle = css(bandRGB[k]);
    g.fillRect(0, top, vw, Math.min(vh, y1) - top);
    // three rows of the next band's colour, thickening, at the foot of this one
    if (k < NBANDS && y1 - y0 >= 6) {
      for (let l = 1; l <= 3; l++) {
        const y = y1 - 4 + l;
        if (y < 0 || y >= vh) continue;
        const row = k * 6 + (l - 1) * 2 + (y & 1);
        for (let x = 0; x < vw; x += AW) g.drawImage(atlas, 0, row, Math.min(AW, vw - x), 1, x, y, Math.min(AW, vw - x), 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// shading for the far ranks: the painter's height field, lit cheaply
//
// The sprite painter's own resolve does a cavity blur per pixel, which is
// what makes a crab's shell read as carved; a cliff half a mile off does not
// need it and four screens of it is too slow to bake. This is the same light
// and the same ordered dither, without the blur.

function fastResolve(p, ramps, o = {}) {
  const { w, h } = p;
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const lx = o.lx ?? -0.25, ly = o.ly ?? -0.9, lz = o.lz ?? 0.45;
  const ll = Math.hypot(lx, ly, lz);
  const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;
  const amb = o.ambient ?? 0.4, dif = o.diffuse ?? 0.7, rimK = o.rim ?? 0.25, ns = o.normalScale ?? 0.6;
  const dither = o.dither ?? 0.75;
  const R = p.mats.map((m) => (ramps[m] || ramps.rock || [[0, 0, 0]]));
  const hAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : (p.mat[y * w + x] ? p.hgt[y * w + x] : 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = p.mat[i];
      if (!m) continue;
      const dx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5 * ns, dy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5 * ns;
      let nx = -dx, ny = -dy, nz = 1;
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
      const rim = Math.pow(1 - nz, 2.2) * rimK * (ny < 0 ? 1 : 0.3);
      let v = amb + diff * dif + rim + p.tint[i];
      v = clamp01(v);
      const r = R[m];
      const n = r.length;
      let idx = Math.floor(v * (n - 1) + 0.5 + (BAYER8[y & 7][x & 7] - 0.5) * dither);
      idx = idx < 0 ? 0 : idx >= n ? n - 1 : idx;
      const c = r[idx];
      const oo = i * 4;
      d[oo] = c[0]; d[oo + 1] = c[1]; d[oo + 2] = c[2]; d[oo + 3] = 255;
    }
  }
  if (o.outline) {
    const oc = rgb(o.outline);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (p.mat[i]) continue;
        if ((x > 0 && p.mat[i - 1]) || (x < w - 1 && p.mat[i + 1]) || (y > 0 && p.mat[i - w]) || (y < h - 1 && p.mat[i + w])) {
          const oo = i * 4;
          d[oo] = oc[0]; d[oo + 1] = oc[1]; d[oo + 2] = oc[2]; d[oo + 3] = o.outlineAlpha ?? 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}
const rampOf = (...hs) => hs.map(rgb);

// ---------------------------------------------------------------------------
// the far ranks: rock going back into the blue
//
// Each rank is a strip that repeats: a ground mass along the bottom and, out
// of it, the shapes rock takes under the sea - spires, arches, mesas, piles of
// boulders, tables standing on a stem - with the nearer ranks carrying coral,
// sponges, fans and kelp on their shoulders. Light from straight up, so the
// top of everything is lit and every overhang has its own shadow.

export const RANKS = [
  { // the furthest: barely there, tall
    W: 1180, H: 250, seed: 11, p: 0.06, pv: 0.14, lift: -36, n: 10, hmin: 0.38, hmax: 0.98,
    kinds: ['spire', 'mesa', 'spire', 'arch', 'spire', 'table', 'spire', 'mesa'],
    rock: rampOf('#2b8bc6', '#2f92cb', '#3399cf', '#37a0d3', '#3ca7d7', '#43aedb'),
    ambient: 0.5, coral: 0, kelp: 0,
  },
  {
    W: 1060, H: 220, seed: 23, p: 0.15, pv: 0.28, lift: -22, n: 9, hmin: 0.32, hmax: 0.92,
    kinds: ['arch', 'spire', 'boulders', 'mesa', 'table', 'spire', 'boulders'],
    rock: rampOf('#1f72b0', '#2379b6', '#2882bc', '#2e8bc2', '#3595c8', '#3d9fce', '#47a9d4'),
    coralR: [rampOf('#3a7cb4', '#4288bc', '#4c94c4', '#58a0ca')],
    ambient: 0.44, coral: 0.4, kelp: 0,
  },
  {
    W: 980, H: 190, seed: 37, p: 0.29, pv: 0.46, lift: -8, n: 8, hmin: 0.28, hmax: 0.86,
    kinds: ['boulders', 'arch', 'table', 'spire', 'boulders', 'mesa', 'spire'],
    rock: rampOf('#14588c', '#186196', '#1d6ba0', '#2376aa', '#2a81b3', '#338dbc', '#3e99c4', '#4ca6cc'),
    coralR: [rampOf('#4a6aa4', '#5676ac', '#6484b4', '#7292bc'), rampOf('#3f7f9e', '#4a8ca8', '#5698b0', '#64a4b8'),
      rampOf('#6a6a9e', '#7676a8', '#8484b2', '#9292bc')],
    ambient: 0.4, coral: 0.9, kelp: 3,
    kelpR: rampOf('#2a6a7e', '#307688', '#388292', '#428e9a'),
  },
  { // the nearest of the background: darker, fuller, the coral showing colour
    W: 900, H: 160, seed: 53, p: 0.5, pv: 0.66, lift: 4, n: 7, hmin: 0.26, hmax: 0.78,
    kinds: ['boulders', 'table', 'boulders', 'arch', 'mesa', 'boulders'],
    rock: rampOf('#0b3a5e', '#0f436a', '#134d76', '#185882', '#1e638d', '#256f98', '#2e7ca2', '#3a8aac', '#4a9ab6'),
    coralR: [rampOf('#7a4a7e', '#8c5888', '#9e6894', '#b07aa0', '#c28eac'), rampOf('#9a6a48', '#ac7a54', '#be8c62', '#cea072'),
      rampOf('#3c7e86', '#468c92', '#529a9e', '#60a8aa'), rampOf('#5a5aa0', '#6868ac', '#7878b8', '#8a8ac2')],
    ambient: 0.36, coral: 1.6, kelp: 2, outline: '#08304e',
    kelpR: rampOf('#2c5a4a', '#346854', '#3e765e', '#4a8468', '#5a9272'),
  },
];
const rankCache = [];

/** One rank of far rock as a strip that repeats without a seam. */
export function rankTile(i) {
  if (rankCache[i]) return rankCache[i];
  const R = RANKS[i];
  const { W, H } = R;
  const PADX = 40;
  const p = new Painter(W + PADX * 2, H);
  const rng = mulberry32(R.seed * 7919 + 13);
  const ramps = { rock: R.rock };
  (R.coralR || []).forEach((r, k) => { ramps['coral' + k] = r; });
  if (R.kelpR) ramps.kelp = R.kelpR;
  // everything is laid down three times, a strip apart, and the middle kept -
  // that is what makes it tile
  const base = H + 4;
  const prims = [];
  const at = (fn) => { for (const off of [-W, 0, W]) fn(off + PADX); };
  // the ground mass all of it stands on: a rolling bank of rubble
  at((ox) => {
    for (let x = -30; x < W + 30; x += 30) {
      const hh = 8 + fbmTex(x * 0.01, 3.1, R.seed, 2) * 30;
      prims.push({ k: 'bld', x: ox + x, y: base, r: 20 + hh * 0.7, sq: hh / (20 + hh * 0.7) + 0.2, seed: x });
    }
  });
  const forms = [];
  for (let k = 0; k < R.n; k++) {
    const x = (k + 0.2 + rng() * 0.6) * (W / R.n);
    const kind = R.kinds[Math.floor(rng() * R.kinds.length)];
    const hh = H * lerp(R.hmin, R.hmax, Math.pow(rng(), 0.8));
    forms.push({ x, kind, h: hh, w: 16 + rng() * 22, seed: Math.floor(rng() * 1e6) });
  }
  for (const f of forms) at((ox) => formation(prims, ox + f.x, base, f, mulberry32(f.seed)));
  rockMass(p, prims, {
    mat: 'rock', seed: R.seed, rough: 0.55, crag: 16 + i * 2, round: 5 + i * 1.5, relief: 5 + i,
    strata: i >= 2 ? 11 : 15, cracks: i >= 2 ? 2 : 0, grounded: true,
  });

  // what grows on the shoulders, on the ranks near enough to see it
  if (R.coral > 0) {
    const n = Math.round(W / 26 * R.coral);
    for (let k = 0; k < n; k++) {
      const x = Math.floor(rng() * W);
      const y = topOf(p, x + PADX);
      if (y < 4 || y > H - 6) continue;
      const mat = 'coral' + Math.floor(rng() * (R.coralR.length));
      const s = (i >= 3 ? 1.1 : 0.8) * (0.6 + rng() * 0.8);
      at((ox) => paintFarCoral(p, ox + x, y + 1, s, mat, mulberry32(k * 31 + R.seed)));
    }
  }
  if (R.kelp > 0) {
    for (let k = 0; k < R.kelp; k++) {
      const x0 = W * (0.12 + rng() * 0.76), n = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) {
        const x = x0 + (j - n / 2) * (5 + rng() * 6);
        const len = H * (0.45 + rng() * 0.45);
        at((ox) => paintFarKelp(p, ox + x, base - 6, len, mulberry32(k * 97 + j * 7 + R.seed)));
      }
    }
  }
  const full = fastResolve(p, ramps, { ambient: R.ambient, dither: 0.8, outline: R.outline, outlineAlpha: 200, normalScale: 0.5 });
  const cv = makeCanvas(W, H);
  const cg = cv.getContext('2d');
  cg.drawImage(full, PADX, 0, W, H, 0, 0, W, H);
  // the colour under the strip, so a rank never shows its own bottom edge:
  // what the foot of the rubble bank averages out to
  const row = cg.getImageData(0, H - 3, W, 3).data;
  const sum = [0, 0, 0];
  let n = 0;
  for (let k = 0; k < row.length; k += 4) {
    if (row[k + 3] < 200) continue;
    sum[0] += row[k]; sum[1] += row[k + 1]; sum[2] += row[k + 2]; n++;
  }
  const foot = n ? [sum[0] / n, sum[1] / n, sum[2] / n] : R.rock[1];
  rankCache[i] = { cv, W, H, foot: css(foot), p: R.p, pv: R.pv, lift: R.lift };
  return rankCache[i];
}

/** The primitives of one rock formation standing on the ground at (x, base). */
function formation(prims, x, base, f, rng) {
  const { h, w } = f;
  const lumps = (x0, y0, x1, y1, r, n) => {
    // knobs and shoulders down the sides of a column, so it is not a pipe
    for (let k = 0; k < n; k++) {
      const t = rng();
      const side = rng() < 0.5 ? -1 : 1;
      prims.push({ k: 'bld', x: lerp(x0, x1, t) + side * r * (0.5 + rng() * 0.4), y: lerp(y0, y1, t), r: r * (0.35 + rng() * 0.35), sq: 0.7 + rng() * 0.4, seed: rng() * 9 });
    }
  };
  switch (f.kind) {
    case 'spire': {
      const lean = (rng() - 0.5) * h * 0.25;
      const r0 = w * 0.75, r1 = w * (0.22 + rng() * 0.16);
      prims.push({ k: 'cap', x0: x, y0: base, x1: x + lean, y1: base - h + r1, r0, r1 });
      lumps(x, base - h * 0.1, x + lean, base - h * 0.9, w * 0.6, 4);
      if (rng() < 0.45) prims.push({ k: 'bld', x: x + lean, y: base - h + r1 * 0.5, r: r1 * 1.9, sq: 0.6, seed: rng() * 9 });
      break;
    }
    case 'arch': {
      const span = w * (1.8 + rng() * 1.4);
      const hl = h * 0.86, hr = h * (0.68 + rng() * 0.3);
      const lx = x - span / 2, rx = x + span / 2;
      prims.push({ k: 'cap', x0: lx, y0: base, x1: lx + span * 0.12, y1: base - hl, r0: w * 0.75, r1: w * 0.48 });
      prims.push({ k: 'cap', x0: rx, y0: base, x1: rx - span * 0.12, y1: base - hr, r0: w * 0.75, r1: w * 0.48 });
      prims.push({ k: 'cap', x0: lx + span * 0.12, y0: base - hl, x1: rx - span * 0.12, y1: base - hr, r0: w * 0.55, r1: w * 0.5 });
      prims.push({ k: 'bld', x: x, y: base - (hl + hr) / 2 - w * 0.2, r: w * 0.7, sq: 0.55, seed: rng() * 9 });
      prims.push({ k: 'hole', x: x, y: base - Math.min(hl, hr) * 0.42, rx: span * 0.34, ry: Math.min(hl, hr) * 0.42 });
      lumps(lx, base, lx, base - hl, w * 0.5, 2);
      lumps(rx, base, rx, base - hr, w * 0.5, 2);
      break;
    }
    case 'mesa': {
      const ww = w * (2.4 + rng() * 1.8);
      prims.push({ k: 'slab', x, y: base - h / 2, w: ww, h: h, r: w * 0.5 });
      prims.push({ k: 'slab', x: x + (rng() - 0.5) * w, y: base - h * 0.92, w: ww * 1.08, h: h * 0.16, r: h * 0.06 });
      for (let k = 0; k < 4; k++) prims.push({ k: 'bld', x: x + (rng() - 0.5) * ww, y: base - h * (0.2 + rng() * 0.5), r: w * 0.5, sq: 0.8, seed: rng() * 9 });
      if (rng() < 0.5) prims.push({ k: 'hole', x: x + (rng() - 0.5) * ww * 0.4, y: base - h * 0.3, rx: w * 0.45, ry: h * 0.16 });
      break;
    }
    case 'table': {
      const lean = (rng() - 0.5) * w * 0.6;
      prims.push({ k: 'cap', x0: x, y0: base, x1: x + lean, y1: base - h * 0.8, r0: w * 0.6, r1: w * 0.36 });
      const cw = w * (2.2 + rng() * 1.2), side = rng() < 0.5 ? -1 : 1;
      prims.push({ k: 'slab', x: x + lean + side * w * 0.4, y: base - h * 0.86, w: cw, h: Math.max(10, h * 0.2), r: Math.max(4, h * 0.08) });
      prims.push({ k: 'bld', x: x + lean + side * cw * 0.3, y: base - h * 0.92, r: w * 0.5, sq: 0.6, seed: rng() * 9 });
      break;
    }
    case 'boulders': default: {
      // a pile: big ones at the bottom, smaller ones balanced on top
      let n = 3 + Math.floor(rng() * 4);
      let y = base, r = w * 1.2, xx = x;
      while (n-- > 0 && y > base - h) {
        prims.push({ k: 'bld', x: xx, y: y - r * 0.6, r, sq: 0.7 + rng() * 0.25, seed: rng() * 9 });
        if (rng() < 0.6) prims.push({ k: 'bld', x: xx + (rng() < 0.5 ? -1 : 1) * r * 1.2, y: y - r * 0.35, r: r * 0.66, sq: 0.75, seed: rng() * 9 });
        y -= r * 1.05; r *= 0.74; xx += (rng() - 0.5) * r * 0.9;
      }
      break;
    }
  }
}

/** Coral on a far ledge: a branch, a fan, a tube or a dome. */
function paintFarCoral(p, x, y, s, mat, rng) {
  const k = rng();
  if (k < 0.3) {
    // branching
    const grow = (x0, y0, a, len, r, d) => {
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      p.capsule(x0, y0, x1, y1, r, r * 0.8, { mat, dome: r });
      if (d >= 2) return;
      grow(x1, y1, a - 0.45 - rng() * 0.2, len * 0.75, r * 0.75, d + 1);
      grow(x1, y1, a + 0.45 + rng() * 0.2, len * 0.75, r * 0.75, d + 1);
    };
    grow(x, y, -Math.PI / 2 + (rng() - 0.5) * 0.3, 4 * s, 1.3 * s, 0);
  } else if (k < 0.55) {
    // a fan, side on: a semicircle of fine mesh
    const R = 6 * s + rng() * 4 * s;
    for (let a = 0; a < 9; a++) {
      const an = -Math.PI + (a / 8) * Math.PI;
      p.capsule(x, y, x + Math.cos(an) * R, y + Math.sin(an) * R * 1.1, 0.7, 0.5, { mat, dome: 0.6 });
    }
    p.ellipse(x, y - R * 0.55, R * 0.8, R * 0.55, { mat, dome: 0.5, tint: -0.05 });
  } else if (k < 0.78) {
    // tubes
    const n = 2 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const hh = (4 + rng() * 7) * s;
      p.capsule(x + j * 2.4 * s, y, x + j * 2.4 * s + (rng() - 0.5) * 2, y - hh, 1.1 * s, 1.0 * s, { mat, dome: 1.0 * s });
    }
  } else {
    // a dome
    p.ellipse(x, y - 2 * s, 4.5 * s, 3.2 * s, { mat, dome: 3 * s });
  }
}

/** A strand of kelp on a far rank, still: at that distance it barely moves. */
function paintFarKelp(p, x, base, len, rng) {
  let px = x, py = base;
  const bend = (rng() - 0.5) * 0.5;
  const n = Math.round(len / 4);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const nx = x + Math.sin(t * 2.2 + bend * 3) * 3 + bend * t * 14, ny = base - t * len;
    p.capsule(px, py, nx, ny, 0.7, 0.6, { mat: 'kelp', dome: 0.6 });
    if (k % 2 === 0 && t > 0.1) {
      const side = (k & 2) ? 1 : -1;
      p.capsule(nx, ny, nx + side * (3 + rng() * 2), ny + 2 + rng() * 2, 1.2, 0.5, { mat: 'kelp', dome: 0.8, tint: 0.04 });
    }
    px = nx; py = ny;
  }
}

// ---------------------------------------------------------------------------
// light

const rayCache = [];
/**
 * A shaft of light from the surface: a long leaning wedge, brightest at the
 * top, fading out downward and at its edges, in four steps of ordered dither.
 * Drawn additively, so where two cross they are brighter.
 */
export function raySprite(i) {
  if (rayCache[i]) return rayCache[i];
  const rng = mulberry32(331 + i * 977);
  const H = 560;
  const w0 = 8 + rng() * 18, w1 = 46 + rng() * 70, lean = 0.22 + rng() * 0.22;
  const W = Math.ceil(w1 + H * lean + 8);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const fall = 1.2 + rng() * 0.8;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const cx = 4 + w1 / 2 + y * lean;
    const half = lerp(w0, w1, t) / 2;
    const along = Math.pow(1 - t, fall);
    for (let x = Math.floor(cx - half - 1); x <= cx + half + 1; x++) {
      if (x < 0 || x >= W) continue;
      const e = 1 - Math.abs(x + 0.5 - cx) / half;
      if (e <= 0) continue;
      let a = along * Math.pow(e, 0.7);
      // a few streaks running down inside it
      a *= 0.8 + 0.2 * Math.sin((x - y * lean) * 0.35 + i);
      const q = Math.floor(a * 4 + BAYER4[y & 3][x & 3] - 0.5);
      if (q <= 0) continue;
      const o = (y * W + x) * 4;
      img.data[o] = 228; img.data[o + 1] = 252; img.data[o + 2] = 255; img.data[o + 3] = Math.min(255, q * 64);
    }
  }
  g.putImageData(img, 0, 0);
  rayCache[i] = { cv, W, H, lean, w1 };
  return rayCache[i];
}
export const RAY_KINDS = 5;

const surfCache = [];
export const SURF_FRAMES = 8;
const SURF_W = 512;
/**
 * The surface from underneath: a bright line that rolls with the swell and a
 * glow hanging under it, as a strip that tiles sideways. `frame` steps the
 * swell along.
 */
export function surfaceStrip(frame) {
  if (surfCache[frame]) return surfCache[frame];
  const H = 14;
  const cv = makeCanvas(SURF_W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(SURF_W, H);
  const ph = (frame / SURF_FRAMES) * TAU;
  const put = (x, y, c, a) => {
    if (y < 0 || y >= H) return;
    const o = (y * SURF_W + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = a;
  };
  const white = [246, 255, 255], pale = [190, 246, 248], glow = [140, 228, 240];
  for (let x = 0; x < SURF_W; x++) {
    const u = (x / SURF_W) * TAU;
    // whole numbers of waves across the strip so it tiles
    const w = Math.sin(u * 9 + ph) * 1.3 + Math.sin(u * 23 - ph * 2) * 0.7 + Math.sin(u * 4 + ph) * 0.6;
    const y = Math.round(4 + w);
    const sparkle = Math.sin(u * 37 + ph * 3) > 0.7;
    put(x, y, white, 255);
    put(x, y - 1, sparkle ? white : pale, sparkle ? 230 : 120);
    put(x, y + 1, pale, 200);
    for (let k = 2; k < 9; k++) {
      if (BAYER4[(y + k) & 3][x & 3] > (1 - k / 9) * 0.9) continue;
      put(x, y + k, glow, Math.round(150 * (1 - k / 9)));
    }
  }
  g.putImageData(img, 0, 0);
  surfCache[frame] = { cv, W: SURF_W, H, line: 4 };
  return surfCache[frame];
}

const mirrorCache = [];
/**
 * What is over the surface line when you look up at it from underneath: the
 * underside of the waves, a bright shifting sheet. Tiles sideways; it is laid
 * above the surface line and runs out into flat colour further up.
 */
export function mirrorTile(frame) {
  if (mirrorCache[frame]) return mirrorCache[frame];
  const W = SURF_W, H = 64;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const ph = (frame / SURF_FRAMES) * TAU;
  const lo = rgb('#76dbe8'), mid = rgb('#97ebef'), hi = rgb('#c4f8f4'), dk = rgb('#4fb9d8');
  for (let y = 0; y < H; y++) {
    const t = y / H;                    // 0 far up .. 1 at the line
    for (let x = 0; x < W; x++) {
      const u = (x / W) * TAU;
      // wave after wave, packed tighter toward the line
      const k = 6 + Math.round(t * 10);
      const w = Math.sin(u * k + ph * (1 + t) + y * 0.9) + Math.sin(u * (k + 5) - ph * 1.3 + y * 0.4) * 0.6;
      let c = t > 0.6 ? mid : lo;
      if (w > 0.9 - t * 0.3) c = hi;
      else if (w < -1.1) c = dk;
      if (BAYER4[y & 3][x & 3] < (t - 0.85) * 3) c = hi;
      const o = (y * W + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  mirrorCache[frame] = { cv, W, H, top: css(lo) };
  return mirrorCache[frame];
}

// ---------------------------------------------------------------------------
// kelp: drawn a joint at a time, because it moves
//
// A strand is a stack of baked joints - a length of stipe with a blade off
// one side and a float at its base - and each joint is drawn shifted by the
// swell at its height, so the whole strand bends smoothly without anything
// being rotated.

const KELP_MATS = withMaterials({
  kelp: { ramp: ['#2a2a0c', '#3e3c12', '#57511a', '#706824', '#8a8030', '#a69a40', '#c2b45a', '#dccc7c'],
    diffuse: 0.78, rim: 0.36, translucent: 0.4, ao: 0.08, normalScale: 0.55, outline: '#1a1806' },
  kelpStipe: { ramp: ['#241a0a', '#36280e', '#4a3814', '#5e4a1c', '#745e26', '#8a7232', '#a28842'],
    diffuse: 0.7, rim: 0.3, ao: 0.1, normalScale: 0.5, outline: '#160f04' },
  kelpFloat: { ramp: ['#4a3a10', '#6a5418', '#8c7222', '#ae9030', '#ccae48', '#e4ca6c', '#f4e0a0'],
    diffuse: 0.7, rim: 0.5, spec: 0.5, ao: 0.06, outline: '#2a2006' },
  grass: { ramp: ['#14301e', '#1c4428', '#265a32', '#32723e', '#40894a', '#52a058', '#6cb86a', '#90d084'],
    diffuse: 0.75, rim: 0.3, translucent: 0.5, outline: '#0a1e10' },
});
export const KELP_JOINT = 7;
const kelpCache = new Map();
/** One joint of kelp, `side` -1/1 for the blade, `v` the variant. */
export function kelpJoint(v, side) {
  const key = v * 2 + (side > 0 ? 1 : 0);
  let k = kelpCache.get(key);
  if (k) return k;
  const rng = mulberry32(911 + v * 131);
  const W = 30, H = KELP_JOINT + 10;
  const p = new Painter(W, H);
  const cx = W / 2, by = H - 3;
  // the stipe
  p.capsule(cx, by + 1, cx, by - KELP_JOINT - 1, 1.1, 1.0, { mat: 'kelpStipe', dome: 1.1 });
  if (v < 5) {
    // a blade: long, ruffled, drooping away from the stipe on one side
    const len = 9 + rng() * 6, droop = 2 + rng() * 3;
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.1) {
      pts.push({ x: cx + side * (2 + t * len), y: by - KELP_JOINT * 0.6 + t * droop - Math.sin(t * Math.PI) * 2.5 });
    }
    for (let j = 1; j < pts.length; j++) {
      const t = j / (pts.length - 1);
      const r = 0.6 + Math.sin(Math.min(1, t * 1.1) * Math.PI) * (1.8 + rng() * 0.3);
      p.capsule(pts[j - 1].x, pts[j - 1].y, pts[j].x, pts[j].y, r, r, { mat: 'kelp', dome: r * 0.8, tint: (j % 2 ? 0.04 : -0.03) });
    }
    // the gas float at the base of the blade
    p.ellipse(cx + side * 2, by - KELP_JOINT * 0.6, 1.5, 1.6, { mat: 'kelpFloat', dome: 1.6 });
    p.ridges('kelp', { angle: 0.3 * side, freq: 1.3, amp: 0.08, height: 0.3, seed: v });
  }
  const cv = p.resolve(KELP_MATS, { lightX: -0.3, lightY: -0.9, lightZ: 0.5, ambient: 0.5, dither: 0.6, outline: 1 });
  k = { cv, ox: cx, oy: by, W, H };
  kelpCache.set(key, k);
  return k;
}

/** The fronds at the very top of a strand, streaming. */
export function kelpCrown(v) {
  const key = 100 + v;
  let k = kelpCache.get(key);
  if (k) return k;
  const rng = mulberry32(4441 + v * 17);
  const W = 34, H = 20;
  const p = new Painter(W, H);
  const cx = W / 2, by = H - 3;
  for (let j = 0; j < 3; j++) {
    const side = j === 1 ? 0.3 : j === 0 ? -1 : 1;
    const len = 8 + rng() * 6;
    for (let t = 0.1; t <= 1; t += 0.12) {
      const x0 = cx + side * (t - 0.1) * len, y0 = by - (t - 0.1) * 9 - Math.sin(t * 3) * 1.5;
      const x1 = cx + side * t * len, y1 = by - t * 9 - Math.sin((t + 0.12) * 3) * 1.5;
      const r = 0.6 + Math.sin(t * Math.PI) * 1.9;
      p.capsule(x0, y0, x1, y1, r, r, { mat: 'kelp', dome: r * 0.8 });
    }
  }
  p.capsule(cx, by + 1, cx, by - 4, 1.0, 0.8, { mat: 'kelpStipe', dome: 1 });
  const cv = p.resolve(KELP_MATS, { lightX: -0.3, lightY: -0.9, lightZ: 0.5, ambient: 0.5, dither: 0.6, outline: 1 });
  k = { cv, ox: cx, oy: by, W, H };
  kelpCache.set(key, k);
  return k;
}

const grassCache = new Map();
export const GRASS_FRAMES = 8;
/**
 * A clump of seagrass, in eight frames of the swell going through it. Every
 * blade has its own height and its own lag, so the clump ripples rather than
 * nodding all at once.
 */
export function grassClump(v, frame) {
  const key = v * 16 + frame;
  let k = grassCache.get(key);
  if (k) return k;
  const rng = mulberry32(2203 + v * 71);
  const W = 30, H = 26;
  const p = new Painter(W, H);
  const cx = W / 2, by = H - 2;
  const n = 5 + Math.floor(rng() * 5);
  const ph = (frame / GRASS_FRAMES) * TAU;
  for (let j = 0; j < n; j++) {
    const x0 = cx + (j - (n - 1) / 2) * 1.6 + (rng() - 0.5);
    const hh = 10 + rng() * 12;
    const lag = rng() * 1.5;
    const lean = (j - (n - 1) / 2) * 0.35;
    let px = x0, py = by;
    const segs = 6;
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      const sw = (Math.sin(ph + lag + t * 1.4) * 2.4 + lean * 2.2) * t * t;
      const nx = x0 + sw, ny = by - t * hh;
      p.capsule(px, py, nx, ny, 0.75, 0.6, { mat: 'grass', dome: 0.6, tint: (j % 3 === 0 ? -0.08 : 0.02) + t * 0.12 });
      px = nx; py = ny;
    }
  }
  const cv = p.resolve(KELP_MATS, { lightX: -0.3, lightY: -0.9, lightZ: 0.5, ambient: 0.48, dither: 0.6, outline: 1 });
  k = { cv, ox: cx, oy: by, W, H };
  grassCache.set(key, k);
  return k;
}

// ---------------------------------------------------------------------------
// the seabed
//
// The ground under the sea is the desert's ground, a thousand years earlier,
// when it was pale sea sand: so wherever the water covers it, it is painted
// again here - a lit lip, ripples combed into the top by the swell, shell and
// pebble in the sand under that, and then the sediment going down cold and
// blue. Baked a chunk at a time against the terrain's own heights, in world
// pixels, exactly like the terrain is.

export const BED_W = 256;
export const BED_DEEP = 96;
const BED = {
  lip: rgb('#e8e0bc'), lit: rgb('#d8cfa8'), sand: rgb('#c8bf98'), sand2: rgb('#b8b18e'),
  crest: rgb('#e2dab6'), trough: rgb('#a29e84'), mid: rgb('#9ea38c'), low: rgb('#7d8e86'),
  sed: rgb('#6c8a8c'), sed2: rgb('#4f7480'), deep: rgb('#365e72'), deeper: rgb('#284d64'),
  peb: [rgb('#8e8878'), rgb('#a69c86'), rgb('#6e6c64'), rgb('#c8bca0')], shell: rgb('#fbf6ea'), shell2: rgb('#e8c8b8'),
  stone: [rgb('#4e5e66'), rgb('#62747a'), rgb('#7a8c8e'), rgb('#98a8a4')],
};
export const BED_FILL = css(BED.deeper);

/**
 * A chunk of seabed. `top(x)` is the ground's world Y at world X (or null
 * where it is dry), for the chunk starting at world x0.
 */
export function paintBedChunk(x0, top) {
  const tops = new Array(BED_W);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < BED_W; i++) {
    const t = top(x0 + i);
    tops[i] = t;
    if (t === null) continue;
    lo = Math.min(lo, t); hi = Math.max(hi, t);
  }
  if (lo === Infinity) return null;
  const y0 = Math.floor(lo) - 2;
  const H = Math.ceil(hi - y0) + BED_DEEP;
  const cv = makeCanvas(BED_W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(BED_W, H);
  const D = img.data;
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= BED_W || y >= H) return;
    const o = (y * BED_W + x) * 4;
    D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255;
  };
  const ramp = (d, wx, y) => {
    // the colour of the bed d pixels under its own surface
    const b = BAYER4[y & 3][wx & 3];
    const stops = [[0, BED.lip], [1, BED.lit], [3, BED.sand], [9, BED.sand2], [16, BED.mid], [26, BED.low],
      [38, BED.sed], [52, BED.sed2], [68, BED.deep], [88, BED.deeper]];
    for (let k = 1; k < stops.length; k++) {
      if (d < stops[k][0]) {
        const t = (d - stops[k - 1][0]) / (stops[k][0] - stops[k - 1][0]);
        return t > b * 0.9 + 0.05 ? stops[k][1] : stops[k - 1][1];
      }
    }
    return BED.deeper;
  };
  for (let i = 0; i < BED_W; i++) {
    const t = tops[i];
    if (t === null) continue;
    const wx = x0 + i;
    // ripple marks in profile: a low sawtooth on the lip itself
    const rip = Math.sin(wx * 0.62 + Math.sin(wx * 0.05) * 2) > 0.55 ? 1 : 0;
    const ty = Math.round(t) - y0 - rip;
    for (let y = Math.max(0, ty); y < H; y++) {
      const d = y - ty;
      let c = ramp(d, wx, y);
      // ripples combed into the sand just under the lip
      if (d >= 2 && d < 12) {
        const row = (d - 2) % 3;
        const w = Math.sin(wx * 0.3 + (d - row) * 1.7 + Math.sin(wx * 0.04 + d) * 1.6);
        if (row === 0 && w > 0.35) c = BED.crest;
        else if (row === 1 && w > 0.35) c = BED.trough;
      }
      put(i, y, c);
    }
  }
  // pebbles, grit, shell, and stones half sunk in it
  const rng = mulberry32(((x0 / BED_W) | 0) * 2654435761 >>> 0);
  for (let k = 0; k < 70; k++) {
    const i = Math.floor(rng() * BED_W);
    if (tops[i] === null) continue;
    const d = Math.floor(Math.pow(rng(), 1.6) * 40) + 3;
    const y = Math.round(tops[i]) - y0 + d;
    const r = rng();
    if (r < 0.6) {
      const c = BED.peb[Math.floor(rng() * 4)];
      put(i, y, c);
      if (rng() < 0.5) put(i + 1, y, c);
      put(i, y - 1, mixc(c, [255, 255, 240], 0.35));
    } else if (r < 0.8) {
      put(i, y, BED.shell); if (rng() < 0.6) put(i + 1, y, BED.shell2);
    }
  }
  for (let k = 0; k < 7; k++) {
    const i = Math.floor(rng() * BED_W);
    if (tops[i] === null) continue;
    const d = 6 + Math.floor(rng() * 50);
    const R = 2 + rng() * 4;
    const cy = Math.round(tops[i]) - y0 + d;
    for (let y = Math.floor(cy - R); y <= cy + R; y++) {
      for (let x = Math.floor(i - R * 1.4); x <= i + R * 1.4; x++) {
        const q = ((x - i) / (R * 1.4)) ** 2 + ((y - cy) / R) ** 2;
        if (q > 1 || x < 0 || x >= BED_W || tops[x] === null || y < Math.round(tops[x]) - y0 + 1) continue;
        const lit = (y - cy) / R;
        const idx = clamp(Math.floor((1 - lit) * 1.6 + (d < 24 ? 1 : 0) + BAYER4[y & 3][x & 3] - 0.5), 0, 3);
        put(x, y, q > 0.8 ? BED.stone[0] : BED.stone[idx]);
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { cv, x0, y0, H };
}

// ---------------------------------------------------------------------------
// the near side of the frame: out of focus, dark, across the bottom

const foreCache = [];
export const FORE_KINDS = 6;
/**
 * A dark shape for the very front of the frame: a lump of rock with coral and
 * weed standing up off it, nearly black, soft-edged with a dither, so it
 * frames the shot without being something to look at.
 */
export function foreShape(i) {
  if (foreCache[i]) return foreCache[i];
  const rng = mulberry32(4243 + i * 977);
  const W = 90 + Math.floor(rng() * 80), H = 46 + Math.floor(rng() * 40);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const field = new Float32Array(W * H);
  const lobes = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) lobes.push({ x: W * (0.15 + rng() * 0.7), y: H * (0.7 + rng() * 0.45), r: H * (0.26 + rng() * 0.3) });
  // fronds and branches standing up off it
  const stems = [];
  for (let k = 0; k < 5 + Math.floor(rng() * 6); k++) {
    stems.push({ x: W * (0.08 + rng() * 0.84), h: H * (0.4 + rng() * 0.6), w: 1.4 + rng() * 1.6, bend: (rng() - 0.5) * 14, fan: rng() < 0.3 });
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (const l of lobes) v = Math.max(v, 1 - Math.hypot(x - l.x, (y - l.y) * 1.25) / l.r);
      for (const s of stems) {
        const t = (H - y) / s.h;
        if (t < 0 || t > 1) continue;
        const cx = s.x + s.bend * t * t;
        const ww = s.fan ? s.w + Math.sin(t * Math.PI) * 9 : s.w * (1 - t * 0.5);
        const d = Math.abs(x - cx) / ww;
        if (d < 1) v = Math.max(v, (1 - d) * 0.7 * (s.fan && Math.sin(y * 1.3 + x * 0.9) > 0.4 ? 0.3 : 1));
      }
      field[y * W + x] = v;
    }
  }
  const dark = rgb('#031420'), mid = rgb('#06202f'), rim = rgb('#0c3346');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = field[y * W + x];
      if (v <= 0) continue;
      const b = BAYER4[y & 3][x & 3];
      if (v < 0.14 && b > v * 7) continue;          // the soft edge
      const up = y > 1 ? field[(y - 2) * W + x] : 0;
      const c = up <= 0.02 && v < 0.5 ? rim : v < 0.3 ? mid : dark;
      const o = (y * W + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  foreCache[i] = cv;
  return cv;
}

// ---------------------------------------------------------------------------
// the big swimmers that are not whales

const LIGHT = { lightX: -0.3, lightY: -0.88, lightZ: 0.5, ambient: 0.5, dither: 0.6 };
const MATS = withMaterials({
  manta: { ramp: ['#0a1220', '#101c30', '#172842', '#203654', '#2c4766', '#3d5c7c', '#567896', '#7898b2'],
    diffuse: 0.8, rim: 0.32, ao: 0.1, normalScale: 0.5, outline: '#04080e' },
  mantaBelly: { ramp: ['#5c6f7e', '#73889a', '#8ca2b2', '#a5bac8', '#bccfda', '#d2e1e9', '#e8f2f6', '#f8fcfd'],
    diffuse: 0.7, rim: 0.4, ao: 0.08, normalScale: 0.4, outline: '#28343e' },
  turtleShell: { ramp: ['#1e1608', '#33260e', '#4a3814', '#634c1c', '#7c6226', '#967a34', '#b09448', '#caae64'],
    diffuse: 0.84, rim: 0.3, spec: 0.4, ao: 0.14, normalScale: 0.6, outline: '#120c04' },
  turtleScute: { ramp: ['#2a2008', '#45340e', '#5e4814', '#7a5e1c', '#967626', '#b09034', '#c8aa4c', '#dec46c'],
    diffuse: 0.84, rim: 0.3, spec: 0.45, ao: 0.14, normalScale: 0.6, outline: '#120c04' },
  turtleSkin: { ramp: ['#1a2620', '#24362a', '#304834', '#3e5c40', '#4e704c', '#62865c', '#7c9e72', '#9eba90'],
    diffuse: 0.8, rim: 0.34, ao: 0.12, normalScale: 0.55, outline: '#0c140e' },
  turtlePale: { ramp: ['#4a4a34', '#62624a', '#7c7c60', '#969678', '#b0b092', '#c8c8ac', '#dedec6'],
    diffuse: 0.75, rim: 0.3, ao: 0.1, outline: '#2a2a1c' },
});
const bigCache = new Map();

/**
 * A manta going over, a little from above: the far wing above the body, the
 * near one below it, both beating together, the white shoulder patches and
 * the horns curled forward. `f` 0..1 is the phase of the beat.
 */
function paintManta(f, S) {
  const L = 52 * S, span = 34 * S;
  const p = new Painter(Math.ceil(L * 1.9) + 12, Math.ceil(span * 2.5) + 12);
  const cx = p.w * 0.42, cy = p.h / 2;
  const beat = Math.sin(f * TAU);
  const farTip = { x: cx + L * 0.24, y: cy - span * (0.58 + beat * 0.42) };
  const nearTip = { x: cx + L * 0.26, y: cy + span * (0.64 - beat * 0.5) };
  p.poly([
    { x: cx - L * 0.34, y: cy - 2 * S },
    { x: farTip.x - L * 0.14, y: lerp(cy, farTip.y, 0.62) - 2 * S },
    { x: farTip.x, y: farTip.y },
    { x: cx + L * 0.30, y: cy - 1 * S },
  ], { mat: 'manta', dome: 2.6 * S, feather: 2.6 * S, tint: -0.16 });
  p.ellipse(cx, cy, L * 0.40, 5.6 * S, { mat: 'manta', dome: 4.8 * S, tint: 0.03 });
  for (const k of [-1, 1]) {
    p.curve([{ x: cx - L * 0.36, y: cy + k * 2 * S }, { x: cx - L * 0.48, y: cy + k * 3.4 * S }, { x: cx - L * 0.51, y: cy + k * 1 * S }],
      1.5 * S, 0.8 * S, { mat: 'manta', dome: 1.2 * S, steps: 8, tint: 0.05 });
  }
  const under = beat > 0.15;
  p.poly([
    { x: cx - L * 0.32, y: cy + 2 * S },
    { x: nearTip.x - L * 0.14, y: lerp(cy, nearTip.y, 0.62) + 1 * S },
    { x: nearTip.x, y: nearTip.y },
    { x: cx + L * 0.32, y: cy + 1 * S },
  ], { mat: under ? 'mantaBelly' : 'manta', dome: 3.2 * S, feather: 2.6 * S, tint: under ? -0.08 : 0.02 });
  p.ellipse(cx - L * 0.08, cy - 2.4 * S, L * 0.12, 1.7 * S, { mat: 'mantaBelly', dome: 1.3 * S, tint: -0.04 });
  p.curve([{ x: cx + L * 0.36, y: cy }, { x: cx + L * 0.62, y: cy + beat * 1.5 * S }, { x: cx + L * 0.92, y: cy - beat * 2 * S }],
    1.0 * S, 0.4 * S, { mat: 'manta', dome: 0.6 * S, steps: 12, tint: -0.06 });
  p.ellipse(cx - L * 0.30, cy - 1.2 * S, Math.max(0.8, 0.9 * S), Math.max(0.8, 0.9 * S), { mat: 'eye', dome: 0.9 * S, tint: 0.1 });
  p.grain('manta', { freq: 0.45 / S, amp: 0.08, seed: 21 });
  return { cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: '#04080e' }), ox: Math.round(cx), oy: Math.round(cy), L };
}

export const MANTA_FRAMES = 8;
export function mantaArt(frame, S = 1) {
  const k = `manta:${frame}:${S}`;
  let v = bigCache.get(k);
  if (!v) { v = paintManta(frame / MANTA_FRAMES, S); bigCache.set(k, v); }
  return v;
}

/**
 * A green turtle: the high domed carapace with its plates each edged a shade
 * darker, the beaked head held forward, the long front flipper doing all the
 * work and the back ones steering. `f` 0..1 is the stroke.
 */
function paintTurtle(f, S) {
  const L = 34 * S, H = 16 * S;
  const p = new Painter(Math.ceil(L * 2) + 16, Math.ceil(H * 3.2) + 14);
  const cx = p.w * 0.5, cy = p.h * 0.5;
  const st = Math.sin(f * TAU);
  const st2 = Math.sin(f * TAU - 0.9);
  // the far flippers, behind
  p.curve([{ x: cx - L * 0.2, y: cy - 1 * S }, { x: cx - L * 0.02, y: cy - H * (0.78 + st * 0.34) },
    { x: cx + L * 0.2, y: cy - H * (1.0 + st * 0.5) }], 3.6 * S, 1.0 * S, { mat: 'turtleSkin', dome: 2 * S, steps: 10, tint: -0.2 });
  p.capsule(cx + L * 0.34, cy + 1 * S, cx + L * 0.52, cy - 3 * S - st2 * 1.5 * S, 2.4 * S, 1.0 * S, { mat: 'turtleSkin', dome: 1.4 * S, tint: -0.18 });
  // the head and neck
  p.capsule(cx - L * 0.38, cy + 1.2 * S, cx - L * 0.6, cy + 0.2 * S, 3.6 * S, 3.2 * S, { mat: 'turtleSkin', dome: 2.8 * S, tint: 0.02 });
  p.ellipse(cx - L * 0.66, cy - 0.4 * S, 4.6 * S, 3.6 * S, { mat: 'turtleSkin', dome: 3.2 * S, tint: 0.06 });
  p.ellipse(cx - L * 0.72, cy + 0.6 * S, 2.2 * S, 1.6 * S, { mat: 'turtlePale', dome: 1.4 * S, tint: 0.02 });
  p.ellipse(cx - L * 0.69, cy - 1.3 * S, Math.max(0.9, 1.0 * S), Math.max(0.9, 1.0 * S), { mat: 'eye', dome: 1 * S, tint: 0.1 });
  // the scales on the head
  p.scales('turtleSkin', { sx: Math.max(2, Math.round(2.4 * S)), sy: Math.max(2, Math.round(2 * S)), amp: 0.2, height: 0.5, seed: 5 });
  // the carapace: high and domed, flat underneath, plates on it
  const shellTop = (u) => cy - H * 0.92 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - u * 0.12);
  const shellBot = (u) => cy + H * 0.2 * Math.sqrt(Math.max(0, 1 - u * u));
  p.field(cx - L * 0.47, cy - H, cx + L * 0.47, cy + H * 0.3, (x, y) => {
    const u = (x - cx) / (L * 0.47);
    if (Math.abs(u) > 1) return null;
    const ty = shellTop(u), by = shellBot(u);
    if (y < ty || y > by) return null;
    const v = (y - ty) / Math.max(1, by - ty);
    // plates: a row down the spine and a row of side plates, and the rim
    const px = u * 3.2 + 0.4, row = v < 0.42 ? 0 : 1;
    const cell = Math.floor(px + (row ? 0.5 : 0));
    const fx = px + (row ? 0.5 : 0) - cell;
    const seam = fx < 0.09 || fx > 0.93 || Math.abs(v - 0.42) < 0.05 || v > 0.86;
    const mat = seam ? 'turtleShell' : 'turtleScute';
    const centre = 1 - Math.abs(fx - 0.5) * 2;
    return { h: (1 - v * 0.65) * 7 * S * Math.sqrt(Math.max(0, 1 - u * u)) + centre * 0.8 * S, tint: seam ? -0.24 : (v > 0.8 ? -0.1 : 0.03) + centre * 0.05, mat };
  }, { mat: 'turtleScute' });
  // the plastron edge
  p.capsule(cx - L * 0.4, cy + H * 0.22, cx + L * 0.38, cy + H * 0.2, 1.5 * S, 1.2 * S, { mat: 'turtlePale', dome: 1 * S, tint: 0.04 });
  // the near front flipper: long and swept, the whole stroke
  p.curve([{ x: cx - L * 0.26, y: cy + 3 * S }, { x: cx - L * 0.02, y: cy + H * (0.58 - st * 0.48) },
    { x: cx + L * 0.28, y: cy + H * (0.8 - st * 0.8) }], 4.0 * S, 1.1 * S, { mat: 'turtleSkin', dome: 2.4 * S, steps: 12, tint: 0.04 });
  p.capsule(cx + L * 0.36, cy + 4 * S, cx + L * 0.55, cy + 6 * S + st2 * 1.6 * S, 2.6 * S, 1.1 * S, { mat: 'turtleSkin', dome: 1.6 * S, tint: 0.0 });
  p.speckle('turtleSkin', { density: 0.14, amp: 0.26, seed: 5 });
  p.grain('turtleScute', { freq: 0.5 / S, amp: 0.14, seed: 9 });
  return { cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: '#0c120a' }), ox: Math.round(cx), oy: Math.round(cy), L };
}

export const TURTLE_FRAMES = 8;
export function turtleArt(frame, S = 1) {
  const k = `turtle:${frame}:${S}`;
  let v = bigCache.get(k);
  if (!v) { v = paintTurtle(frame / TURTLE_FRAMES, S); bigCache.set(k, v); }
  return v;
}
export { BAYER4, rgb as hexRGB, css as cssRGB };
