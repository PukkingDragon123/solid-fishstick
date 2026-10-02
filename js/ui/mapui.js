// CRABDEN - the map.
//
// Vess's chart of the basin, drawn on a sheet of parchment: the old sea off
// the west edge with its coast ruled in parallel lines the way old charts did,
// the biomes washed in watercolour, the ground in hill-shading and contour
// lines, dunes and ruins and dead woods as little ink marks, and every place
// worth walking to drawn and named. It only shows what has been walked: the
// rest of the sheet is blank paper, with the fog edge stippled in by hand.
//
// The world is a line along X, so the second axis of the chart is a fiction
// made carefully: the track you walk is a road meandering across the sheet,
// and the ground along the road is the real ground - its relief is read off
// `Terrain.baseY` - fading out into a procedural country either side of it
// that obeys the same biome. Under the chart a cross-section strip shows the
// true profile of the ground along the road for the stretch on screen.
//
// The chart is baked in 128-pixel tiles at five levels of detail, a few tiles
// a frame, and drawn from whatever is ready (a coarser level stands in for a
// tile that is still being drawn). Everything that must stay crisp - places,
// labels, the crab, Vess, his camps, the compass - is drawn on top at screen
// resolution.

import * as K from './kit.js';
import { drawIcon } from './iconcore.js';
import { drawText, textWidth } from '../lib/font.js';
import { clamp, clamp01, lerp, smoothstep, fbm2, valueNoise2, ridge2, hashStr, easeOutCubic } from '../lib/math.js';
import { makeCanvas } from '../render/pixel.js';
import { BIOMES, biomeAt } from '../world/biomes.js';
import { landmarkAt, KIND_NOTE, LANDMARK_CELL } from '../world/landmarks.js';
import { SHORE_X, shelfOffset } from '../world/ocean.js';
import { formNear } from '../world/props.js';
import { ventAt } from '../systems/fountains.js';
import { ATLAS_X0 as X0, ATLAS_X1 as X1 } from '../systems/atlas.js';

const V = 8000;             // the chart runs this far north and south of the line
const T = 128;              // tile size, in chart pixels
const INK = '#3a2614';
const INK_SOFT = 'rgba(58,38,20,0.55)';
const RED = '#9a2e1c';
const SEA_INK = '#1f4a66';

// watercolour for each biome, laid thin over the paper
const WASH = {
  theshallows: [222, 214, 180], saltpan: [236, 232, 214], bonereef: [232, 214, 178],
  dunes: [236, 200, 140], glassflats: [206, 222, 222], rustlands: [214, 160, 116],
  ashwood: [176, 164, 168], deepwell: [150, 176, 176],
};
const PAPER = [241, 226, 184];

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));
function h32(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// the country

class Land {
  constructor(game) {
    this.game = game;
    this.seedKey = String(game.seed);
    this.s = hashStr(this.seedKey + 'chart') % 9973;
    this.STEP = 20;
    this.n = Math.ceil((X1 - X0) / this.STEP) + 2;
    this.base = new Float32Array(this.n).fill(NaN);
    this.forms = null;
    this.places = null;
  }

  /** The real height of the ground at x, read off the terrain (up is positive). */
  ground(x) {
    const f = (clamp(x, X0, X1) - X0) / this.STEP;
    const i = Math.floor(f);
    const a = this._b(i), b = this._b(i + 1);
    return lerp(a, b, f - i);
  }
  _b(i) {
    i = clamp(i, 0, this.n - 1);
    let v = this.base[i];
    if (Number.isNaN(v)) {
      const x = X0 + i * this.STEP;
      try { v = -this.game.terrain.baseY(x); } catch { v = 0; }
      this.base[i] = v;
    }
    return v;
  }

  /** Where the road runs, north (-) or south (+) of the middle of the sheet. */
  route(x) {
    return 2300 * Math.sin(x / 7400 + 1.3) + 900 * Math.sin(x / 2700 + 0.4) + 1100 * (valueNoise2(x / 4200, 3.7, this.s) - 0.5);
  }

  /** Where the coast is, for a line of latitude v. */
  coast(v) {
    return SHORE_X + 700 * Math.sin(v / 2300 + 0.8) + 1100 * (fbm2(v / 2600, 1.3, 3, this.s + 5) - 0.5);
  }

  /** The biome at a point of the sheet: the world's own along the road, wandering off it. */
  biomeX(x, v) {
    const d = Math.abs(v - this.route(x));
    const warp = 2600 * (fbm2(v / 4300, x / 4300, 2, this.s + 9) - 0.5) * clamp01(d / 2200);
    return x + warp;
  }

  /** The shape of the ground in a biome, away from the road. */
  regional(id, x, v) {
    const s = this.s;
    switch (id) {
      case 'dunes': return ridge2(x / 760 + v / 2600, v / 1150 - x / 5200, 3, s + 1) * 90 - 30;
      case 'saltpan': return (fbm2(x / 1200, v / 1200, 2, s + 2) - 0.5) * 10;
      case 'bonereef': return (fbm2(x / 520, v / 520, 3, s + 3) - 0.4) * 60;
      case 'glassflats': return (fbm2(x / 1700, v / 1700, 2, s + 4) - 0.5) * 18;
      case 'rustlands': {
        const q = fbm2(x / 1500, v / 1500, 3, s + 5) * 170;
        return Math.floor(q / 28) * 28 * 0.85 + q * 0.15 - 60;
      }
      case 'ashwood': return (fbm2(x / 1100, v / 1100, 4, s + 6) - 0.45) * 150;
      case 'deepwell': {
        const dx = (x - 24400) / 3200, dv = (v - this.route(x)) / 3600;
        const r = Math.hypot(dx, dv);
        return -280 * clamp01(1 - r) ** 1.5 + (fbm2(x / 700, v / 700, 3, s + 7) - 0.5) * 50;
      }
      default: return (fbm2(x / 900, v / 900, 2, s + 8) - 0.5) * 16;
    }
  }

  /** Height of the chart at (x, v), and whether it is sea. */
  height(x, v, rv, coastX) {
    const d = v - rv;
    // the real ground holds along the road and frays out into the country:
    // off the road it is read from further along it, so a dune on the road
    // runs on as a dune off it instead of as a stripe down the sheet
    const near = Math.exp(-((d / 1100) ** 2));
    const bx = this.biomeX(x, v);
    const b = biomeAt(bx);
    // blend across a biome edge so the hill-shading does not step
    let reg = this.regional(b.id, x, v);
    const e0 = bx - b.x0, e1 = b.x1 - bx, BL = 700;
    let o = b, t = 0;
    if (e0 < BL || e1 < BL) {
      const other = biomeAt(e0 < e1 ? b.x0 - 1 : b.x1 + 1);
      if (other !== b) {
        t = 0.5 - 0.5 * clamp01(Math.min(e0, e1) / BL);
        o = other;
        reg = lerp(reg, this.regional(other.id, x, v), t);
      }
    }
    const fray = clamp01(Math.abs(d) / 700);
    const gx = x + (fbm2(x / 1800, v / 1800, 2, this.s + 21) - 0.5) * 3200 * fray + d * 0.35 * fray;
    let h = lerp(reg, this.ground(gx) * (1 - fray * 0.5) + reg * 0.3, near);
    const sea = x < coastX;
    if (sea) h = -shelfOffset(SHORE_X - (coastX - x)) - 6;
    return { h, sea, b, o, t };
  }

  /** The rock formations along the road, found once. */
  formations() {
    if (this.forms) return this.forms;
    const seen = new Map();
    for (let x = X0; x < X1; x += 2400) {
      for (const f of formNear(this.seedKey, x, 1400)) seen.set(f.id, f);
    }
    this.forms = [...seen.values()];
    return this.forms;
  }

  /** Every landmark and capped spring in the basin. */
  placesAll() {
    if (this.places) return this.places;
    const out = [];
    for (let ci = Math.floor(X0 / LANDMARK_CELL); ci <= Math.ceil(X1 / LANDMARK_CELL); ci++) {
      const lm = landmarkAt(this.seedKey, ci);
      if (lm && lm.x > X0 && lm.x < X1 && lm.x > SHORE_X) out.push({ kind: lm.kind, x: lm.x, name: lm.name, note: KIND_NOTE[lm.kind] || '' });
    }
    for (let ci = Math.floor(X0 / 5200); ci <= Math.ceil(X1 / 5200); ci++) {
      let v = null;
      try { v = ventAt(this.seedKey, ci); } catch { v = null; }
      if (v && v.x > SHORE_X && v.x < X1) out.push({ kind: 'vent', x: v.x, name: 'Capped spring', note: 'a plug driven into the water' });
    }
    this.places = out;
    return out;
  }
}

// ---------------------------------------------------------------------------
// ink marks, for the tiles

const GLYPH = {
  dune: ['..####..', '.#....#.', '#..::..#', '..::::..'],
  salt: ['.#.#.', '#...#', '.#.#.'],
  coral: ['#.#.#', '.###.', '..#..', '..#..'],
  glass: ['..#..', '..#..', '##.##', '..#..', '..#..'],
  ruin: ['#...#', '#.#.#', '#####'],
  tree: ['#.#.#', '.#.#.', '..#..', '..#..', '.:#:.'],
  well: ['.###.', '#...#', '#.#.#', '.#...', '..##.'],
  tuft: ['#.#.#', '.#.#.'],
};
const BIOME_GLYPH = {
  dunes: ['dune', 0.62], saltpan: ['salt', 0.38], bonereef: ['coral', 0.5], glassflats: ['glass', 0.36],
  rustlands: ['ruin', 0.32], ashwood: ['tree', 0.68], deepwell: ['well', 0.22], theshallows: ['tuft', 0.4],
};

function glyph(g, name, x, y, col, soft) {
  const rows = GLYPH[name];
  if (!rows) return;
  const w = rows[0].length;
  x = Math.round(x - w / 2); y = Math.round(y - rows.length / 2);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch === '.') continue;
      g.fillStyle = ch === ':' ? soft : col;
      g.fillRect(x + c, y + r, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// the chart, a tile at a time

function bakeTile(land, k, tx, ty, U0) {
  const upp = U0 / (1 << k);
  const cv = makeCanvas(T, T);
  const g = cv.getContext('2d');
  const img = g.createImageData(T, T);
  const d = img.data;
  const W2 = T + 2;
  const H = new Float32Array(W2 * W2);
  const SEA = new Uint8Array(W2 * W2);
  const BI = new Array(W2 * W2);
  const BO = new Array(W2 * W2);
  const BT = new Float32Array(W2 * W2);
  const wx0 = X0 + tx * T * upp, wv0 = -V + ty * T * upp;
  const routes = new Float32Array(W2);
  for (let i = 0; i < W2; i++) routes[i] = land.route(wx0 + (i - 1) * upp);
  const coasts = new Float32Array(W2);
  for (let j = 0; j < W2; j++) coasts[j] = land.coast(wv0 + (j - 1) * upp);
  for (let j = 0; j < W2; j++) {
    const v = wv0 + (j - 1) * upp;
    for (let i = 0; i < W2; i++) {
      const x = wx0 + (i - 1) * upp;
      const r = land.height(x, v, routes[i], coasts[j]);
      H[j * W2 + i] = r.h; SEA[j * W2 + i] = r.sea ? 1 : 0; BI[j * W2 + i] = r.b; BO[j * W2 + i] = r.o; BT[j * W2 + i] = r.t;
    }
  }
  // contour interval: finer as you zoom, so a hill always has a few rings
  const CI = clamp(Math.round(upp * 0.6), 10, 40);
  const ex = 4.5;
  for (let py = 0; py < T; py++) {
    for (let px = 0; px < T; px++) {
      const i = (py + 1) * W2 + px + 1;
      const o = (py * T + px) * 4;
      const h = H[i];
      const x = wx0 + px * upp, v = wv0 + py * upp;
      const bay = BAYER4[(py + ty * T) & 3][(px + tx * T) & 3];
      let r, gg, b;
      if (SEA[i]) {
        // the sea: deeper is darker, in bands, with the swell ruled across it
        const depth = clamp01(-h / 440);
        const ramp = [[170, 204, 192], [126, 178, 180], [84, 140, 160], [52, 100, 132], [34, 70, 104]];
        const f = depth * (ramp.length - 1);
        const q = Math.min(ramp.length - 1, Math.floor(f) + (f - Math.floor(f) > bay ? 1 : 0));
        [r, gg, b] = ramp[q];
        // parallel coast lines, the old way
        const dc = (coasts[py + 1] - x) / upp;
        const ring = [2, 5, 9, 14];
        for (let n = 0; n < ring.length; n++) {
          if (Math.abs(dc - ring[n]) < 0.5 && (n < 2 || (px + py) % (n + 1) !== 0)) { r = r * 0.6 + 31 * 0.4; gg = gg * 0.6 + 74 * 0.4; b = b * 0.6 + 102 * 0.4; }
        }
        if (dc < 1) { r = 31; gg = 74; b = 102; }
        // the swell
        const wv = (py + ty * T) % 6 === 0 && ((px + tx * T + Math.floor((py + ty * T) / 6) * 3) % 9) < 4;
        if (wv && dc > 3) { r += 26; gg += 26; b += 22; }
      } else {
        const bio = BI[i];
        const w1 = WASH[bio.id] || PAPER, w2 = WASH[BO[i].id] || PAPER, wt = BT[i];
        const wash = [lerp(w1[0], w2[0], wt), lerp(w1[1], w2[1], wt), lerp(w1[2], w2[2], wt)];
        // paper under watercolour
        const grain = h32(px + tx * T, py + ty * T, 7) * 0.08 - 0.04;
        r = lerp(PAPER[0], wash[0], 0.55) * (1 + grain);
        gg = lerp(PAPER[1], wash[1], 0.55) * (1 + grain);
        b = lerp(PAPER[2], wash[2], 0.55) * (1 + grain);
        // hill-shading, light from the north-west
        const gx = (H[i + 1] - H[i - 1]) / (2 * upp), gy = (H[i + W2] - H[i - W2]) / (2 * upp);
        const sh = clamp((gx * 0.7 + gy * 0.7) * ex, -1, 1);
        const tone = 0.5 + sh * 0.5;
        const steps = [0.74, 0.83, 0.91, 0.98, 1.03, 1.07];
        const f = tone * (steps.length - 1);
        const q = Math.min(steps.length - 1, Math.floor(f) + (f - Math.floor(f) > bay ? 1 : 0));
        const m = steps[q];
        r *= m; gg *= m; b *= m;
        // contours
        const c0 = Math.floor(h / CI);
        const cR = Math.floor(H[i + 1] / CI), cD = Math.floor(H[i + W2] / CI);
        if (c0 !== cR || c0 !== cD) {
          const index = (c0 % 5 === 0 || cR % 5 === 0) ? 0.42 : 0.2;
          r = r * (1 - index) + 70 * index; gg = gg * (1 - index) + 46 * index; b = b * (1 - index) + 24 * index;
        }
        // the shore: a dark line and a lick of sand
        if (SEA[i - 1] || SEA[i + 1] || SEA[i - W2] || SEA[i + W2]) { r = 46; gg = 36; b = 24; }
      }
      d[o] = clamp(r, 0, 255); d[o + 1] = clamp(gg, 0, 255); d[o + 2] = clamp(b, 0, 255); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // ink marks on a jittered grid, the same marks at every level of detail
  const S = 15;
  const gx0 = Math.floor((tx * T - 8) / S), gx1 = Math.ceil((tx * T + T + 8) / S);
  const gy0 = Math.floor((ty * T - 8) / S), gy1 = Math.ceil((ty * T + T + 8) / S);
  for (let gj = gy0; gj <= gy1; gj++) {
    for (let gi = gx0; gi <= gx1; gi++) {
      const hsh = h32(gi, gj, 31 + k);
      const px = gi * S + (gj % 2 ? S / 2 : 0) + (h32(gi, gj, 3) - 0.5) * 8 - tx * T;
      const py = gj * S + (h32(gi, gj, 4) - 0.5) * 6 - ty * T;
      const x = wx0 + px * upp, v = wv0 + py * upp;
      if (x < land.coast(v) + 4 * upp) continue;
      const rv = land.route(x);
      if (Math.abs(v - rv) < 7 * upp) continue;
      const bio = biomeAt(land.biomeX(x, v));
      const gl = BIOME_GLYPH[bio.id];
      if (!gl || hsh > gl[1]) continue;
      glyph(g, gl[0], px, py, 'rgba(58,38,20,0.62)', 'rgba(58,38,20,0.25)');
    }
  }
  return cv;
}

// ---------------------------------------------------------------------------
// state

function layout(W, H) {
  const tall = W < 400 || H > W * 1.12;
  if (!tall) {
    const sx = 8, sy = 6, sw = W - 16, sh = H - 12;
    const mx = sx + 12, my = sy + 26, mw = sw - 24, mh = sh - 26 - 60;
    return { tall, sx, sy, sw, sh, mx, my, mw, mh, secY: my + mh + 6, secH: 38, W, H };
  }
  const sx = 3, sy = 4, sw = W - 6, sh = H - 8;
  const mx = sx + 7, my = sy + 30, mw = sw - 14, mh = sh - 30 - 50;
  return { tall, sx, sy, sw, sh, mx, my, mw, mh, secY: my + mh + 6, secH: 34, W, H };
}

function state(ui) {
  return ui.mapState || (ui.mapState = { cx: 0, cv: 0, z: 2, zt: 2, t: 0, anim: null, tiles: new Map(), U0: 0, press: null, sel: null, hits: [], fogKey: '', fog: null, queue: [] });
}

let LAND = null;
function land(game) {
  if (!LAND || LAND.game !== game) LAND = new Land(game);
  return LAND;
}

const ZMAX = 16;

/** Called by ui.openMap. */
export function mapOpening(ui) {
  const g = ui.game;
  const st = state(ui);
  const L = layout(g.renderer.vw, g.renderer.vh);
  const ld = land(g);
  st.anim = { kind: 'open', t: 0, dur: 0.42 };
  st.sel = null;
  st.cx = g.crab.x;
  st.cv = ld.route(g.crab.x);
  // show what has been walked, but not so little of it that the chart is a smear
  const rs = g.atlas?.ranges() || [];
  const lo = rs.length ? rs[0][0] : g.crab.x - 2000, hi = rs.length ? rs[rs.length - 1][1] : g.crab.x + 2000;
  const U0 = (X1 - X0) / L.mw;
  const want = (L.mw * 0.8 * U0) / Math.max(4000, hi - lo);
  const z = L.tall ? 8 : clamp(2 ** Math.floor(Math.log2(want)), 1, 4);
  st.z = st.zt = z;
  if (!L.tall) st.cx = clamp((lo + hi) / 2, g.crab.x - L.mw * U0 / z * 0.35, g.crab.x + L.mw * U0 / z * 0.35);
  st.press = null;
}

function startClose(ui) {
  const st = state(ui);
  if (st.anim?.kind === 'close') return;
  st.anim = { kind: 'close', t: 0, dur: 0.3 };
}

function clampView(st, L) {
  const upp = st.U0 / st.z;
  const hw = (L.mw / 2) * upp, hh = (L.mh / 2) * upp;
  st.cx = hw * 2 >= X1 - X0 ? (X0 + X1) / 2 : clamp(st.cx, X0 + hw, X1 - hw);
  st.cv = hh * 2 >= V * 2 ? 0 : clamp(st.cv, -V + hh, V - hh);
}

function zoomAt(st, L, nz, sx, sy) {
  nz = clamp(nz, 1, ZMAX);
  // keep the point under the pointer where it is
  const upp0 = st.U0 / st.z, upp1 = st.U0 / nz;
  const ox = sx - (L.mx + L.mw / 2), oy = sy - (L.my + L.mh / 2);
  st.cx += ox * (upp0 - upp1);
  st.cv += oy * (upp0 - upp1);
  st.z = nz;
}

export function mapUpdate(ui, dt) {
  const g = ui.game, i = g.input;
  const st = state(ui);
  const L = layout(g.renderer.vw, g.renderer.vh);
  const U0 = (X1 - X0) / L.mw;
  if (Math.abs(U0 - st.U0) > 1e-6) { st.U0 = U0; st.tiles = new Map(); }
  st.t += dt;
  const a = st.anim;
  if (a) {
    a.t += Math.min(dt, 1 / 30);
    if (a.t >= a.dur) {
      st.anim = null;
      if (a.kind === 'close') { ui.closeMap(); return; }
    }
    if (a.kind === 'close') return;
  }
  if (i.justPressed('Escape') || i.justPressed('n')) { i.consumeKey('Escape'); i.consumeKey('n'); startClose(ui); return; }
  // keys pan and zoom
  const upp = st.U0 / st.z;
  const pan = 220 * dt * upp;
  if (i.key('ArrowLeft') || i.key('a')) st.cx -= pan;
  if (i.key('ArrowRight') || i.key('d')) st.cx += pan;
  if (i.key('ArrowUp') || i.key('w')) st.cv -= pan;
  if (i.key('ArrowDown') || i.key('s')) st.cv += pan;
  const mid = { x: L.mx + L.mw / 2, y: L.my + L.mh / 2 };
  if (i.justPressed('=') || i.justPressed('+') || i.justPressed('e')) { st.zt = clamp(st.zt * 2, 1, ZMAX); st.zp = mid; }
  if (i.justPressed('-') || i.justPressed('_') || i.justPressed('q')) { st.zt = clamp(st.zt / 2, 1, ZMAX); st.zp = mid; }
  for (const k2 of ['=', '+', '-', '_', 'e', 'q']) i.consumeKey(k2);
  if (i.justPressed('c') || i.justPressed('Home')) { i.consumeKey('c'); i.consumeKey('Home'); st.cx = g.crab.x; st.cv = land(g).route(g.crab.x); }
  // the wheel, and a pinch (which the input turns into wheel steps)
  if (i.wheel) {
    const over = i.sx >= L.mx && i.sx <= L.mx + L.mw && i.sy >= L.my && i.sy <= L.my + L.mh;
    st.zt = clamp(st.zt * (i.wheel < 0 ? 2 : 0.5), 1, ZMAX);
    st.zp = over && !i.isTouch ? { x: i.sx, y: i.sy } : mid;
    i.wheel = 0;
  }
  // ease the zoom toward its target
  if (Math.abs(st.z - st.zt) > 1e-3) {
    const nz = Math.exp(lerp(Math.log(st.z), Math.log(st.zt), 1 - Math.pow(0.0005, dt)));
    zoomAt(st, L, Math.abs(nz - st.zt) < 0.01 ? st.zt : nz, st.zp?.x ?? mid.x, st.zp?.y ?? mid.y);
  }
  // drag to pan
  const inMap = (x, y) => x >= L.mx && x <= L.mx + L.mw && y >= L.my && y <= L.my + L.mh + L.secH + 8;
  if (i.down && !st.press) st.press = { x: i.sx, y: i.sy, cx: st.cx, cv: st.cv, on: inMap(i.sx, i.sy) };
  if (st.press && i.down && st.press.on && !i.pinchDist) {
    const dx = i.sx - st.press.x, dy = i.sy - st.press.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) st.press.moved = true;
    if (st.press.moved) { st.cx = st.press.cx - dx * upp; st.cv = st.press.cv - dy * upp; }
  }
  if (!i.down && st.press) st.press = null;
  clampView(st, L);
  // clicks against what was drawn last frame
  if (i.clicked) {
    i.clicked = false;
    const hit = st.hits.find((h) => i.sx >= h.x && i.sx <= h.x + h.w && i.sy >= h.y && i.sy <= h.y + h.h);
    if (hit) {
      const act = hit.act;
      if (act.close) startClose(ui);
      else if (act.zoom) { st.zt = clamp(st.zt * act.zoom, 1, ZMAX); st.zp = mid; }
      else if (act.home) { st.cx = g.crab.x; st.cv = land(g).route(g.crab.x); }
      else if (act.place) st.sel = st.sel === act.place ? null : act.place;
    } else if (!inMap(i.sx, i.sy) && !(i.sx >= L.sx && i.sx <= L.sx + L.sw && i.sy >= L.sy && i.sy <= L.sy + L.sh)) startClose(ui);
    else st.sel = null;
  }
  if (i.dblClicked && inMap(i.sx, i.sy)) { st.zt = clamp(st.zt * 2, 1, ZMAX); st.zp = { x: i.sx, y: i.sy }; }
}

// ---------------------------------------------------------------------------
// drawing

function tileFor(st, ld, k, tx, ty, budget) {
  const key = `${k}:${tx}:${ty}`;
  let cv = st.tiles.get(key);
  if (cv) return cv;
  if (performance.now() > budget) return null;
  cv = bakeTile(ld, k, tx, ty, st.U0);
  st.tiles.set(key, cv);
  if (st.tiles.size > 260) st.tiles.delete(st.tiles.keys().next().value);
  return cv;
}

/** The chart under the overlay: tiles at the right level, coarser ones standing in. */
function drawBase(ctx, st, ld, L) {
  const upp = st.U0 / st.z;
  const k = clamp(Math.floor(Math.log2(st.z + 1e-6)), 0, 4);
  const toSX = (x) => L.mx + L.mw / 2 + (x - st.cx) / upp;
  const toSY = (v) => L.my + L.mh / 2 + (v - st.cv) / upp;
  const budget = performance.now() + (st.firstFrame ? 30 : 7);
  st.firstFrame = false;
  const draw = (lvl, pass) => {
    const uk = st.U0 / (1 << lvl);
    const tw = T * uk;
    const vx0 = st.cx - (L.mw / 2) * upp, vx1 = st.cx + (L.mw / 2) * upp;
    const vv0 = st.cv - (L.mh / 2) * upp, vv1 = st.cv + (L.mh / 2) * upp;
    const tx0 = Math.max(0, Math.floor((vx0 - X0) / tw)), tx1 = Math.floor((vx1 - X0) / tw);
    const ty0 = Math.floor((vv0 + V) / tw), ty1 = Math.floor((vv1 + V) / tw);
    let missing = 0;
    // nearest the middle first
    const list = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) list.push([tx, ty]);
    const mxT = (st.cx - X0) / tw, myT = (st.cv + V) / tw;
    list.sort((p, q) => Math.hypot(p[0] + 0.5 - mxT, p[1] + 0.5 - myT) - Math.hypot(q[0] + 0.5 - mxT, q[1] + 0.5 - myT));
    for (const [tx, ty] of list) {
      const cv = pass ? tileFor(st, ld, lvl, tx, ty, budget) : st.tiles.get(`${lvl}:${tx}:${ty}`);
      if (!cv) { missing++; continue; }
      const x0 = Math.round(toSX(X0 + tx * tw)), x1 = Math.round(toSX(X0 + (tx + 1) * tw));
      const y0 = Math.round(toSY(-V + ty * tw)), y1 = Math.round(toSY(-V + (ty + 1) * tw));
      ctx.drawImage(cv, x0, y0, x1 - x0, y1 - y0);
    }
    return missing;
  };
  // the coarsest level is always there underneath; the right one goes on top as it arrives
  for (let lvl = 0; lvl < k; lvl++) draw(lvl, lvl === 0);
  return draw(k, true);
}

/** The fog: blank paper over everything not walked, with a hand-stippled edge. */
function drawFog(ctx, st, ld, L, atlas) {
  const upp = st.U0 / st.z;
  const B = 2;                                // fog is worked out in 2x2 blocks
  const fw = Math.ceil(L.mw / B), fh = Math.ceil(L.mh / B);
  const key = `${Math.round(st.cx)}:${Math.round(st.cv)}:${st.z.toFixed(3)}:${atlas?.version}:${L.mw}x${L.mh}`;
  if (st.fogKey !== key || !st.fog) {
    st.fogKey = key;
    if (!st.fog || st.fog.width !== fw || st.fog.height !== fh) st.fog = makeCanvas(fw, fh);
    const g = st.fog.getContext('2d');
    const img = g.createImageData(fw, fh);
    const d = img.data;
    const cols = new Float32Array(fw), routes = new Float32Array(fw);
    for (let i = 0; i < fw; i++) {
      const x = st.cx + ((i + 0.5) * B - L.mw / 2) * upp;
      cols[i] = atlas ? atlas.seenAt(x, 900) : 1;
      if (x < X0 || x > X1) cols[i] = 0;
      routes[i] = ld.route(x);
    }
    // blurred along the road, so the ends of a walked stretch taper into a lens
    {
      const R = clamp(Math.ceil(1300 / (upp * B)), 1, 80);
      const pre = new Float32Array(fw + 1);
      for (let i = 0; i < fw; i++) pre[i + 1] = pre[i] + cols[i];
      const out = new Float32Array(fw);
      for (let i = 0; i < fw; i++) {
        const a = Math.max(0, i - R), b = Math.min(fw, i + R + 1);
        // off the edges of the sheet's view, assume what is at the edge carries on
        const extra = (i - R < 0 ? (R - i) * cols[0] : 0) + (i + R + 1 > fw ? (i + R + 1 - fw) * cols[fw - 1] : 0);
        out[i] = Math.min(cols[i], 1) * 0.35 + 0.65 * (pre[b] - pre[a] + extra) / (2 * R + 1);
      }
      cols.set(out);
    }
    for (let j = 0; j < fh; j++) {
      const v = st.cv + ((j + 0.5) * B - L.mh / 2) * upp;
      for (let i = 0; i < fw; i++) {
        const o = (j * fw + i) * 4;
        const x = st.cx + ((i + 0.5) * B - L.mw / 2) * upp;
        // how far off the road you could have seen: a ragged corridor
        const reach = (L.tall ? 6500 : 4000) + 1400 * (valueNoise2(x / 2600, v / 2600, 77) - 0.5) * 2;
        const ad = Math.abs(v - routes[i]);
        // the corridor narrows toward the edge of what was walked, so a seen stretch is a lens, not a slot
        const rc = reach * (0.25 + 0.75 * Math.sqrt(cols[i]));
        let r = Math.min(1, cols[i] * 3) * (1 - smoothstep((ad - rc * 0.7) / (rc * 0.6)));
        r += (valueNoise2(x / 700, v / 700, 91) - 0.5) * 0.22;
        // paper, a stipple at the edge, nothing inside
        if (r > 0.55) { d[o + 3] = 0; continue; }
        const wx = Math.floor(x / (upp * B)), wv = Math.floor(v / (upp * B));
        const n = h32(wx, wv, 5);
        if (r > 0.42) {
          if (n < (r - 0.42) * 6) { d[o + 3] = 0; continue; }
          d[o] = 92; d[o + 1] = 66; d[o + 2] = 40; d[o + 3] = n < 0.5 ? 190 : 90;
          continue;
        }
        const t = n * 0.06;
        d[o] = 238 - t * 200; d[o + 1] = 223 - t * 200; d[o + 2] = 184 - t * 200; d[o + 3] = 255;
        // the hatching of an unknown country
        if (((wx + wv) % 7 === 0) && r > 0.1) { d[o] = 214; d[o + 1] = 196; d[o + 2] = 154; }
      }
    }
    g.putImageData(img, 0, 0);
  }
  ctx.drawImage(st.fog, L.mx, L.my, fw * B, fh * B);
}

// little pictures of places, drawn at screen resolution
const PLACE = {
  oasis: (c, x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) {
      if ((dx * dx) / 30 + (dy * dy) / 6 > 1) continue;
      c.fillStyle = (dx * dx) / 30 + (dy * dy) / 6 > 0.6 ? SEA_INK : dy < 0 ? '#9ad0e0' : '#5aa0c0';
      c.fillRect(x + dx, y + dy + 2, 1, 1);
    }
    c.fillStyle = '#3e5e1e';
    c.fillRect(x - 4, y - 4, 1, 5); c.fillRect(x - 6, y - 5, 5, 1); c.fillRect(x - 5, y - 6, 3, 1);
    c.fillRect(x + 4, y - 3, 1, 4); c.fillRect(x + 2, y - 4, 5, 1); c.fillRect(x + 3, y - 5, 3, 1);
  },
  ruin: (c, x, y) => {
    c.fillStyle = INK;
    c.fillRect(x - 5, y + 2, 11, 1);
    for (const [cx, h] of [[-4, 6], [-1, 4], [2, 7], [5, 3]]) { c.fillRect(x + cx, y + 2 - h, 2, h); }
    c.fillRect(x - 4, y - 4, 4, 1);
    c.fillStyle = '#c8a870'; c.fillRect(x - 3, y - 3, 1, 4); c.fillRect(x + 3, y - 4, 1, 5);
  },
  wreck: (c, x, y) => {
    c.fillStyle = INK;
    for (let dx = -6; dx <= 6; dx++) { const yy = Math.round(Math.abs(dx) * 0.4); c.fillRect(x + dx, y + 2 - yy, 1, 1); }
    c.fillRect(x - 6, y - 1, 13, 1);
    c.fillRect(x, y - 7, 1, 6); c.fillRect(x + 1, y - 6, 3, 1); c.fillRect(x + 1, y - 4, 2, 1);
    c.fillStyle = '#8a6a48'; c.fillRect(x - 4, y, 9, 1);
  },
  spire: (c, x, y) => {
    c.fillStyle = INK;
    for (let k = 0; k < 9; k++) { const w = Math.max(1, Math.round(k * 0.45)); c.fillRect(x - Math.floor(w / 2), y - 6 + k, w, 1); }
    c.fillStyle = '#c87a4a'; c.fillRect(x, y - 2, 1, 4);
  },
  bonefield: (c, x, y) => {
    c.fillStyle = INK;
    c.fillRect(x - 5, y, 11, 1);
    for (let k = -4; k <= 4; k += 2) { c.fillRect(x + k, y - 3, 1, 3); }
    c.fillStyle = '#f0e6cc';
    for (let k = -4; k <= 4; k += 2) c.fillRect(x + k, y - 4, 1, 1);
  },
  vent: (c, x, y) => {
    c.fillStyle = SEA_INK;
    c.fillRect(x - 2, y - 3, 5, 1); c.fillRect(x - 2, y + 1, 5, 1); c.fillRect(x - 3, y - 2, 1, 3); c.fillRect(x + 3, y - 2, 1, 3);
    c.fillStyle = '#7ad4f8'; c.fillRect(x - 1, y - 2, 3, 3);
    c.fillStyle = INK; c.fillRect(x, y - 1, 1, 1);
  },
  camp: (c, x, y) => {
    c.fillStyle = RED;
    for (let k = 0; k < 6; k++) c.fillRect(x - k, y - 4 + k, k * 2 + 1, 1);
    c.fillStyle = '#f0d8b0'; c.fillRect(x, y - 1, 1, 3);
    c.fillStyle = INK; c.fillRect(x, y - 8, 1, 4); c.fillStyle = '#e2b74a'; c.fillRect(x + 1, y - 8, 3, 2);
  },
};

/** The rock benches along the road, as an engraver's tableland: a flat top ringed with hachures. */
function mesa(c, x, y, w, h) {
  const rx = Math.max(3, w / 2), ry = Math.max(2, w / 4.5);
  const ix = rx * 0.55, iy = ry * 0.55;
  const cy = y - h * 0.3;
  // the flat top, a pale rock tint with an ink rim
  for (let dy = -Math.ceil(iy); dy <= Math.ceil(iy); dy++) {
    for (let dx = -Math.ceil(ix); dx <= Math.ceil(ix); dx++) {
      const q = (dx * dx) / (ix * ix) + (dy * dy) / (iy * iy);
      if (q > 1) continue;
      c.fillStyle = q > 0.62 ? INK : 'rgba(200,154,110,0.9)';
      c.fillRect(Math.round(x + dx), Math.round(cy + dy), 1, 1);
    }
  }
  // hachures: short strokes running down the slope, longer and darker on the shadow side
  const n = Math.max(8, Math.round(rx * 2.4));
  for (let k = 0; k < n; k++) {
    const an = (k / n) * Math.PI * 2;
    const ca = Math.cos(an), sa = Math.sin(an);
    const shade = ca + sa > 0 ? 1 : 0.6;
    const len = 1 + (rx - ix) * shade;
    c.fillStyle = shade > 0.8 ? 'rgba(58,38,20,0.85)' : 'rgba(58,38,20,0.45)';
    for (let t = 0; t < len; t += 1) {
      c.fillRect(Math.round(x + ca * (ix + 1 + t)), Math.round(cy + sa * (iy + 1 + t * (ry / rx))), 1, 1);
    }
  }
}

function spaced(str) { return str.toUpperCase().split('').join(' ').replace(/ {3}/g, '  '); }

function compass(c, x, y, r) {
  c.fillStyle = 'rgba(58,38,20,0.35)';
  for (let a = 0; a < Math.PI * 2; a += 0.03) c.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
  const pts = [[0, -1, RED], [1, 0, INK], [0, 1, INK], [-1, 0, INK]];
  for (const [dx, dy, col] of pts) {
    for (let k = 0; k < r; k++) {
      const w = Math.round((1 - k / r) * 2.5);
      for (let q = -w; q <= w; q++) {
        c.fillStyle = q < 0 ? col : 'rgba(240,224,190,0.95)';
        if (q === 0) c.fillStyle = col;
        c.fillRect(Math.round(x + dx * k + dy * q), Math.round(y + dy * k - dx * q), 1, 1);
      }
    }
  }
  for (const [dx, dy] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    for (let k = 0; k < r * 0.55; k++) { c.fillStyle = INK_SOFT; c.fillRect(Math.round(x + dx * k), Math.round(y + dy * k), 1, 1); }
  }
  drawText(c, 'N', x, y - r - 9, { color: RED, align: 'center' });
}

function scaleBar(c, x, y, upp) {
  // 10 world units to the metre
  const opts = [50, 100, 250, 500, 1000, 2000];
  let m = opts[0];
  for (const o of opts) if ((o * 10) / upp <= 60) m = o;
  const px = Math.round((m * 10) / upp);
  c.fillStyle = INK;
  c.fillRect(x, y, px, 1); c.fillRect(x, y - 2, 1, 4); c.fillRect(x + px - 1, y - 2, 1, 4);
  for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? INK : 'rgba(240,224,190,1)'; c.fillRect(x + Math.round(k * px / 4), y + 1, Math.round(px / 4), 2); }
  c.fillStyle = INK; c.fillRect(x, y + 3, px, 1);
  drawText(c, m >= 1000 ? `${m / 1000} km` : `${m} m`, x + px + 4, y - 2, { color: INK });
}

/** The parchment sheet: aged paper, a burnt and torn edge, and a double rule. */
const sheets = new Map();
function sheet(w, h) {
  const key = `${w}x${h}`;
  let cv = sheets.get(key);
  if (cv) return cv;
  cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const rag = 2.5 + 2.5 * valueNoise2(x / 5 + y / 7, (x + y) / 9, 3);
      if (edge < rag - 2) { d[o + 3] = 0; continue; }
      const burn = clamp01(1 - (edge - rag + 2) / 9);
      const m = fbm2(x / 30, y / 30, 3, 11) * 0.5 + valueNoise2(x / 3, y / 2, 4) * 0.12;
      let v = 0.15 + m * 0.4 + burn * burn * 0.9;
      // fold creases, one down and one across
      if (Math.abs(x - Math.round(w / 2)) < 1 || Math.abs(y - Math.round(h / 2)) < 1) v += 0.12;
      const bay = BAYER4[y & 3][x & 3];
      const ramp = [[248, 236, 202], [240, 224, 184], [228, 208, 162], [206, 180, 130], [150, 110, 64], [80, 52, 28]];
      const f = clamp01(v) * (ramp.length - 1);
      const q = Math.min(ramp.length - 1, Math.floor(f) + (f - Math.floor(f) > bay ? 1 : 0));
      const c = ramp[q];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  sheets.set(key, cv);
  return cv;
}

function frame(c, x, y, w, h) {
  c.fillStyle = INK;
  c.fillRect(x - 3, y - 3, w + 6, 1); c.fillRect(x - 3, y + h + 2, w + 6, 1);
  c.fillRect(x - 3, y - 3, 1, h + 6); c.fillRect(x + w + 2, y - 3, 1, h + 6);
  c.fillStyle = INK_SOFT;
  c.fillRect(x - 1, y - 1, w + 2, 1); c.fillRect(x - 1, y + h, w + 2, 1);
  c.fillRect(x - 1, y - 1, 1, h + 2); c.fillRect(x + w, y - 1, 1, h + 2);
  // a degree scale along the top and bottom rules, chequered
  for (let k = 0; k < w; k += 6) {
    c.fillStyle = (k / 6) % 2 ? INK : 'rgba(240,224,190,1)';
    c.fillRect(x + k, y - 2, Math.min(6, w - k), 1);
    c.fillRect(x + k, y + h + 1, Math.min(6, w - k), 1);
  }
}

export function drawMap(ui, ctx, W, H) {
  const g = ui.game;
  const st = state(ui);
  const L = layout(W, H);
  const ld = land(g);
  if (!st.U0) { st.U0 = (X1 - X0) / L.mw; st.firstFrame = true; clampView(st, L); }
  st.hits = [];
  ctx.imageSmoothingEnabled = false;
  const a = st.anim;
  let k = 1;
  if (a) k = a.kind === 'open' ? easeOutCubic(clamp01(a.t / a.dur)) : 1 - clamp01(a.t / a.dur);
  ctx.save();
  ctx.globalAlpha = 0.66 * k;
  ctx.fillStyle = '#0a0604'; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  // the sheet unrolls from the middle
  const openH = Math.max(4, Math.round(L.sh * k));
  const oy = L.sy + Math.round((L.sh - openH) / 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, oy, W, openH); ctx.clip();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(L.sx + 3, L.sy + 4, L.sw, L.sh);
  ctx.drawImage(sheet(L.sw, L.sh), L.sx, L.sy);
  // the chart
  ctx.save();
  ctx.beginPath(); ctx.rect(L.mx, L.my, L.mw, L.mh); ctx.clip();
  ctx.fillStyle = '#efe0b8'; ctx.fillRect(L.mx, L.my, L.mw, L.mh);
  drawBase(ctx, st, ld, L);
  drawOverlay(ui, ctx, st, ld, L);
  drawFog(ctx, st, ld, L, g.atlas);
  drawMarkers(ui, ctx, st, ld, L);
  ctx.restore();
  frame(ctx, L.mx, L.my, L.mw, L.mh);
  drawChrome(ui, ctx, st, ld, L);
  drawSection(ctx, st, ld, L, g);
  ctx.restore();
  // rolled ends while it opens
  if (k < 1) {
    for (const yy of [oy - 3, oy + openH - 3]) {
      ctx.fillStyle = '#5a3e1c'; ctx.fillRect(L.sx - 2, yy, L.sw + 4, 6);
      ctx.fillStyle = '#c8a870'; ctx.fillRect(L.sx - 2, yy + 1, L.sw + 4, 2);
      ctx.fillStyle = '#f0e0b8'; ctx.fillRect(L.sx - 2, yy + 1, L.sw + 4, 1);
    }
  }
}

function view(st, L) {
  const upp = st.U0 / st.z;
  return {
    upp,
    sx: (x) => L.mx + L.mw / 2 + (x - st.cx) / upp,
    sy: (v) => L.my + L.mh / 2 + (v - st.cv) / upp,
    x0: st.cx - (L.mw / 2) * upp, x1: st.cx + (L.mw / 2) * upp,
  };
}

/** The road, the rock, and the names of the country, under the fog. */
function drawOverlay(ui, ctx, st, ld, L) {
  const g = ui.game;
  const vw = view(st, L);
  const atlas = g.atlas;
  // the track: dashes where you have been
  for (let px = 0; px < L.mw; px++) {
    const x = vw.x0 + px * vw.upp;
    if (x < SHORE_X || x > X1) continue;
    const seen = atlas ? atlas.isSeen(x) : true;
    if (!seen) continue;
    const y = Math.round(vw.sy(ld.route(x)));
    if (((px + Math.round(st.cx / vw.upp)) % 6) < 4) {
      ctx.fillStyle = 'rgba(122,40,24,0.85)';
      ctx.fillRect(L.mx + px, y, 1, 1);
    }
  }
  // tablelands
  for (const f of ld.formations()) {
    if (f.x < vw.x0 - 400 || f.x > vw.x1 + 400) continue;
    const x = Math.round(vw.sx(f.x)), y = Math.round(vw.sy(ld.route(f.x))) - 2;
    mesa(ctx, x, y, (f.w * 2) / vw.upp, clamp(f.h / 18 * Math.min(2, st.z / 2), 2, 9));
  }
  // the biome names, letter-spaced across their country
  for (const b of BIOMES) {
    const lo = Math.max(b.x0, vw.x0), hi = Math.min(b.x1, vw.x1);
    if (hi - lo < 400) continue;
    const x = (lo + hi) / 2;
    if (atlas && atlas.seenAt(x, 2600) <= 0 && !rangeSeen(atlas, lo, hi)) continue;
    const name = b.id === 'theshallows' ? 'THE OLD SEA' : b.name.toUpperCase();
    let txt = spaced(name);
    if (textWidth(txt) > (hi - lo) / vw.upp - 8) txt = name;
    if (textWidth(txt) > (hi - lo) / vw.upp - 4) continue;
    let y = Math.round(vw.sy(ld.route(x) + (b.id === 'theshallows' ? 0 : -2900)));
    const lx0 = vw.sx(x) - textWidth(txt) / 2;
    if (!L.tall && lx0 < L.mx + 54 && y < L.my + 90) y = L.my + 92;
    const col = b.id === 'theshallows' ? 'rgba(31,74,102,0.8)' : 'rgba(58,38,20,0.66)';
    drawText(ctx, txt, Math.round(vw.sx(x)), y, { color: col, align: 'center' });
  }
  // a sea serpent, because a chart of an unknown sea has one
  if (vw.x0 < SHORE_X - 2000 && (!atlas || rangeSeen(atlas, X0, SHORE_X))) {
    const x = Math.round(vw.sx(SHORE_X - 5200)), y = Math.round(vw.sy(ld.route(SHORE_X - 5200) + 2400));
    serpent(ctx, x, y, st.t);
  }
}

function rangeSeen(atlas, lo, hi) {
  for (const [a, b] of atlas.ranges()) if (b > lo && a < hi) return true;
  return false;
}

function serpent(c, x, y, t) {
  c.fillStyle = 'rgba(31,74,102,0.85)';
  for (let k = 0; k < 3; k++) {
    const bx = x + k * 7;
    for (let q = 0; q <= 5; q++) { const yy = Math.round(Math.sin((q / 5) * Math.PI) * 3); c.fillRect(bx + q, y - yy, 1, 1); }
  }
  c.fillRect(x - 2, y - 4, 2, 2); c.fillRect(x - 4, y - 3, 2, 1);
  c.fillStyle = '#f0e0b8'; c.fillRect(x - 2, y - 4, 1, 1);
  c.fillStyle = 'rgba(31,74,102,0.85)'; c.fillRect(x + 21, y - 1, 2, 1); c.fillRect(x + 23, y - 2, 1, 1);
  void t;
}

/** Places, camps, Vess and the crab, over the fog so they read. */
function drawMarkers(ui, ctx, st, ld, L) {
  const g = ui.game;
  const vw = view(st, L);
  const atlas = g.atlas;
  const labels = [];
  const places = ld.placesAll();
  for (const p of places) {
    if (p.x < vw.x0 - 50 || p.x > vw.x1 + 50) continue;
    if (atlas && !atlas.isSeen(p.x)) continue;
    const x = Math.round(vw.sx(p.x)), y = Math.round(vw.sy(ld.route(p.x)));
    PLACE[p.kind]?.(ctx, x, y - 4);
    st.hits.push({ x: x - 7, y: y - 12, w: 14, h: 14, act: { place: p } });
    if (p.kind !== 'vent' && (st.z >= 2 || p.kind === 'oasis')) labels.push({ x, y: y + 4, text: p.name, col: p.kind === 'oasis' ? SEA_INK : INK });
  }
  // his camps, if he has made any
  const camps = g.camp && Array.isArray(g.camp.list) ? g.camp.list : [];
  for (const c of camps) {
    if (!c || typeof c.x !== 'number' || c.x < vw.x0 - 50 || c.x > vw.x1 + 50) continue;
    const x = Math.round(vw.sx(c.x)), y = Math.round(vw.sy(ld.route(c.x)));
    PLACE.camp(ctx, x, y - 5);
    const kind = String(c.kind || 'camp');
    const p = { kind: 'camp', x: c.x, name: c.name || 'Vess\'s camp', note: kind };
    st.hits.push({ x: x - 7, y: y - 13, w: 14, h: 14, act: { place: p } });
    if (st.z >= 2) labels.push({ x, y: y + 3, text: c.name || 'Camp', col: RED });
  }
  // labels, dropped where they would collide
  const placed = L.tall ? [] : [{ x: L.mx, y: L.my, w: 52, h: 86 }];
  // nothing is written over the crab
  if (g.crab) placed.push({ x: Math.round(vw.sx(g.crab.x)) - 8, y: Math.round(vw.sy(ld.route(g.crab.x))) - 12, w: 16, h: 14 });
  for (const lb of labels) {
    const w = textWidth(lb.text);
    const r = { x: lb.x - w / 2 - 1, y: lb.y, w: w + 2, h: 8 };
    const hits = () => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    // try under it, then over it, before giving the name up
    if (hits()) { r.y = lb.y + 9; if (hits()) { r.y = lb.y - 22; if (hits()) continue; } }
    lb.y = r.y;
    placed.push(r);
    ctx.fillStyle = 'rgba(240,226,188,0.75)'; ctx.fillRect(Math.round(r.x), r.y, Math.round(r.w), 8);
    drawText(ctx, lb.text, lb.x, lb.y, { color: lb.col, align: 'center' });
  }
  // Vess: a little hat
  if (g.npc) {
    const x = Math.round(vw.sx(g.npc.x)), y = Math.round(vw.sy(ld.route(g.npc.x)));
    ctx.fillStyle = INK; ctx.fillRect(x - 3, y - 6, 7, 1); ctx.fillRect(x - 1, y - 9, 3, 3);
    ctx.fillStyle = '#c8945a'; ctx.fillRect(x - 2, y - 7, 5, 1); ctx.fillRect(x, y - 8, 1, 2);
    ctx.fillStyle = INK; ctx.fillRect(x, y - 5, 1, 4);
    st.hits.push({ x: x - 4, y: y - 10, w: 9, h: 10, act: { place: { kind: 'vess', x: g.npc.x, name: 'Dr. Vess', note: 'where he has got to' } } });
  }
  // the crab, with a ring that breathes
  if (g.crab) {
    const x = Math.round(vw.sx(g.crab.x)), y = Math.round(vw.sy(ld.route(g.crab.x)));
    const rr = 6 + Math.round((Math.sin(st.t * 3) * 0.5 + 0.5) * 3);
    ctx.fillStyle = 'rgba(154,46,28,0.7)';
    for (let q = 0; q < 40; q++) {
      const an = (q / 40) * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(an) * rr), Math.round(y - 3 + Math.sin(an) * rr * 0.8), 1, 1);
    }
    if (!drawIcon(ctx, 'crab', x, y - 4, 1)) { ctx.fillStyle = RED; ctx.fillRect(x - 2, y - 5, 5, 4); }
    st.hits.push({ x: x - 7, y: y - 11, w: 14, h: 14, act: { place: { kind: 'crab', x: g.crab.x, name: 'You', note: 'the crab, and everything on it' } } });
  }
}

/** The title, the legend, the compass, the buttons, and the note on whatever is picked. */
function drawChrome(ui, ctx, st, ld, L) {
  const g = ui.game;
  const vw = view(st, L);
  const cx = Math.round(L.sx + L.sw / 2);
  // the cartouche
  const title = L.tall ? 'THE OLD SEA' : 'A CHART OF THE BASIN OF THE OLD SEA';
  const tw = textWidth(title) + 16;
  const ty = L.sy + 7;
  ctx.fillStyle = 'rgba(240,226,188,0.9)'; ctx.fillRect(cx - tw / 2, ty - 2, tw, 12);
  ctx.fillStyle = INK; ctx.fillRect(cx - tw / 2, ty - 2, tw, 1); ctx.fillRect(cx - tw / 2, ty + 10, tw, 1);
  ctx.fillRect(cx - tw / 2 - 2, ty, 2, 8); ctx.fillRect(cx + tw / 2, ty, 2, 8);
  drawText(ctx, title, cx, ty + 1, { color: INK, align: 'center' });
  const frac = g.atlas ? g.atlas.fraction : 0;
  const sub = `${Math.round(frac * 100)}% charted`;
  if (!L.tall) drawText(ctx, sub, L.mx, ty + 1, { color: INK_SOFT });
  else drawText(ctx, sub, cx, ty + 13, { color: INK_SOFT, align: 'center' });
  // the close stud
  const cs = 13;
  const bx = L.sx + L.sw - cs - 3, by = L.sy + 3;
  const hot = ui._hit(bx, by, cs, cs);
  K.bezel(ctx, bx, by, cs, cs, { rim: 1, curls: false,
    body: hot ? ['#f05a48', '#d8402e', '#b82a2a', '#701818'] : ['#d84a38', '#b82a2a', '#8a1e1e', '#5a1010'] });
  for (let n = 0; n < cs - 7; n++) {
    ctx.fillStyle = '#fff0e0';
    ctx.fillRect(bx + 3 + n, by + 3 + n, 2, 1);
    ctx.fillRect(bx + cs - 5 - n, by + 3 + n, 2, 1);
  }
  st.hits.push({ x: bx, y: by, w: cs, h: cs, act: { close: true } });
  // zoom and home, stacked on the right edge of the chart
  const bs = 16;
  const zx = L.mx + L.mw - bs - 4;
  [['+', { zoom: 2 }], ['-', { zoom: 0.5 }], ['@', { home: true }]].forEach(([lab, act], n) => {
    const y = L.my + 4 + n * (bs + 3);
    const h2 = ui._hit(zx, y, bs, bs);
    K.button(ctx, zx, y, bs, bs, '', { hot: h2 });
    if (lab === '@') { if (!drawIcon(ctx, 'crab', zx + bs / 2, y + bs / 2, 1)) drawText(ctx, 'C', zx + bs / 2, y + 5, { align: 'center' }); }
    else drawText(ctx, lab, zx + bs / 2, y + 5, { color: K.C.ink, align: 'center' });
    st.hits.push({ x: zx, y, w: bs, h: bs, act });
  });
  // compass and scale, in the lower corners
  if (L.mh > 120) compass(ctx, L.mx + L.mw - 18, L.my + L.mh - 20, 10);
  scaleBar(ctx, L.mx + 6, L.my + L.mh - 9, vw.upp);
  // a small legend, top left
  if (!L.tall) {
    const items = [['oasis', 'Oasis'], ['ruin', 'Ruin'], ['wreck', 'Wreck'], ['spire', 'Spire'], ['bonefield', 'Bones'], ['vent', 'Spring'], ['camp', 'Camp']];
    const lx = L.mx + 4, ly = L.my + 4;
    const lw2 = 46, lh = items.length * 11 + 4;
    ctx.fillStyle = 'rgba(240,226,188,0.88)'; ctx.fillRect(lx, ly, lw2, lh);
    ctx.fillStyle = INK_SOFT; ctx.fillRect(lx, ly, lw2, 1); ctx.fillRect(lx, ly + lh - 1, lw2, 1); ctx.fillRect(lx, ly, 1, lh); ctx.fillRect(lx + lw2 - 1, ly, 1, lh);
    items.forEach(([kind, name], n) => {
      PLACE[kind](ctx, lx + 8, ly + 9 + n * 11);
      drawText(ctx, name, lx + 17, ly + 3 + n * 11, { color: INK });
    });
  }
  // what you picked
  const p = st.sel;
  if (p) {
    const lines = [p.name, p.note, `${Math.round(Math.abs(p.x - g.crab.x) / 10)} m ${p.x < g.crab.x ? 'west' : 'east'}`];
    const w = Math.max(...lines.map((l) => textWidth(l))) + 10;
    const x = clamp(Math.round(vw.sx(p.x) - w / 2), L.mx + 2, L.mx + L.mw - w - 2);
    const y = clamp(Math.round(vw.sy(ld.route(p.x))) - 44, L.my + 2, L.my + L.mh - 36);
    K.parchment(ctx, x, y, w, 32);
    lines.forEach((l, n) => drawText(ctx, l, x + 5, y + 3 + n * 9, { color: n === 0 ? K.INK : K.INK_SOFT }));
  }
  if (!L.tall) drawText(ctx, 'drag to pan   wheel or + - to zoom   N close', cx, L.sy + L.sh - 15, { color: INK_SOFT, align: 'center' });
}

/** The ground along the road, in section, for the stretch on screen. */
function drawSection(ctx, st, ld, L, g) {
  const vw = view(st, L);
  const x0 = L.mx, y0 = L.secY, w = L.mw, h = L.secH - 8;
  ctx.fillStyle = 'rgba(232,214,170,0.9)'; ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = INK_SOFT;
  ctx.fillRect(x0, y0, w, 1); ctx.fillRect(x0, y0 + h - 1, w, 1); ctx.fillRect(x0, y0, 1, h); ctx.fillRect(x0 + w - 1, y0, 1, h);
  const atlas = g.atlas;
  // the sea floor is squeezed so the dunes still read beside it
  const HI = 130, LO = -150;
  const toY = (e) => Math.round(y0 + 2 + (1 - ((e < 0 ? e * 0.3 : e) - LO) / (HI - LO)) * (h - 4));
  const seaY = toY(-6);
  for (let px = 1; px < w - 1; px++) {
    const x = vw.x0 + px * vw.upp;
    if (x < X0 || x > X1) continue;
    const seen = !atlas || atlas.isSeen(x);
    const e = ld.ground(x);
    const y = toY(e);
    if (!seen) {
      if (px % 3 === 0) { ctx.fillStyle = 'rgba(58,38,20,0.25)'; ctx.fillRect(x0 + px, y, 1, 1); }
      continue;
    }
    if (x < SHORE_X && y > seaY) {
      ctx.fillStyle = 'rgba(84,140,160,0.55)'; ctx.fillRect(x0 + px, seaY, 1, y - seaY);
      if (px % 4 < 2) { ctx.fillStyle = SEA_INK; ctx.fillRect(x0 + px, seaY, 1, 1); }
    }
    ctx.fillStyle = 'rgba(140,100,60,0.4)';
    for (let yy = y + 1; yy < y0 + h - 1; yy++) if ((px + yy) % 3 === 0) ctx.fillRect(x0 + px, yy, 1, 1);
    ctx.fillStyle = INK; ctx.fillRect(x0 + px, y, 1, 1);
  }
  const mark = (x, col) => {
    if (x < vw.x0 || x > vw.x1) return;
    const px = Math.round(vw.sx(x));
    const y = toY(ld.ground(x));
    ctx.fillStyle = col; ctx.fillRect(px - 1, y - 4, 3, 3); ctx.fillRect(px, y - 1, 1, 1);
  };
  if (g.npc) mark(g.npc.x, '#c8945a');
  if (g.crab) mark(g.crab.x, RED);
  drawText(ctx, 'SECTION', x0 + 4, y0 + h - 9, { color: INK_SOFT });
}
