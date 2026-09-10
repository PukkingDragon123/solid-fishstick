// CRABDEN - the ground you walk on.
//
// Side-scrolling, so the world is a heightfield over X. The surface is baked
// into 256px chunks by the pixel painter (strata, crust, ripples, pebbles) and
// cached; on top of that sits a live sand-deformation layer that footsteps
// push down and wind pulls back up.

import { clamp, clamp01, lerp, fbm2, valueNoise2, hashStr } from '../lib/math.js';
import { Painter, makeCanvas, fbmTex, hash2i } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { BIOMES, biomeAt, biomeBlend } from './biomes.js';
import { groundOffset } from './landmarks.js';

export const CHUNK_W = 256;
const CHUNK_H = 224;
const MAX_CHUNKS = 48;
const SAND_CELL = 4;          // world px per deformation sample

export class Terrain {
  constructor(seed = 'crabden-side') {
    this.seedKey = String(seed);
    this.seed = hashStr(String(seed));
    this.chunks = new Map();
    this.order = [];
    this.sand = new Map();     // cell index -> depression depth (px)
    this.grains = [];          // live blown/kicked sand
  }

  // -- height -------------------------------------------------------------

  /** Base ground surface, world Y (larger = lower on screen). */
  baseY(x) {
    const s = this.seed;
    let y = 0;
    y += (fbm2(x * 0.0016, 11.3, 4, s) - 0.5) * 130;        // long rolling dunes
    y += (fbm2(x * 0.0075, 3.1, 3, s + 71) - 0.5) * 34;     // medium
    y += (valueNoise2(x * 0.03, 7.7, s + 17) - 0.5) * 7;    // fine ripple
    const b = biomeAt(x);
    if (b.flatten) {
      y = lerp(y, y * (1 - b.flatten) + b.baseY * b.flatten, biomeBlend(x));
    }
    y += b.baseY * 0.35;
    // oases are real bowls sunk into the ground, baked in with everything else
    y += groundOffset(this.seedKey, x);
    return y;
  }

  /** Surface including live sand deformation. */
  surfaceY(x) {
    return this.baseY(x) + this.depression(x);
  }

  depression(x) {
    const i = Math.round(x / SAND_CELL);
    return this.sand.get(i) || 0;
  }

  /** Push the sand down; feet, landings and burrowing all use this. */
  deform(x, depth, radius = 10) {
    const i0 = Math.round((x - radius) / SAND_CELL);
    const i1 = Math.round((x + radius) / SAND_CELL);
    for (let i = i0; i <= i1; i++) {
      const dx = i * SAND_CELL - x;
      const k = 1 - clamp01(Math.abs(dx) / radius);
      if (k <= 0) continue;
      const cur = this.sand.get(i) || 0;
      this.sand.set(i, clamp(cur + depth * k * k, -14, 16));
    }
  }

  /** Slope in radians, for standing the crab on the surface. */
  slope(x, e = 7) {
    return Math.atan2(this.baseY(x + e) - this.baseY(x - e), e * 2);
  }

  update(dt, wind = 0.3) {
    // sand creeps back: wind fills holes and flattens piles
    const relax = Math.pow(0.55, dt * (0.5 + wind));
    for (const [i, v] of this.sand) {
      const nv = v * relax;
      if (Math.abs(nv) < 0.06) this.sand.delete(i);
      else this.sand.set(i, nv);
    }
  }

  // -- baked chunks --------------------------------------------------------

  _paintChunk(cx) {
    const x0 = cx * CHUNK_W;
    const heights = new Float32Array(CHUNK_W + 1);
    let minY = Infinity;
    for (let i = 0; i <= CHUNK_W; i++) {
      const h = this.baseY(x0 + i);
      heights[i] = h;
      minY = Math.min(minY, h);
    }
    const top = Math.floor(minY) - 6;
    const p = new Painter(CHUNK_W, CHUNK_H);
    const b = biomeAt(x0 + CHUNK_W / 2);
    const bodyMat = b.groundMat;
    const crustMat = b.crustMat;
    const seed = this.seed + cx * 977;

    // body of the ground, with strata that follow the surface loosely
    p.field(0, 0, CHUNK_W - 1, CHUNK_H - 1, (fx, fy) => {
      const gx = Math.floor(fx);
      const surf = heights[clamp(gx, 0, CHUNK_W)] - top;
      if (fy < surf) return null;
      const depth = fy - surf;
      // crust catches the light, so give the first few pixels real height
      const dome = depth < 3 ? 4 - depth : 0;
      const strat = fbmTex((x0 + fx) * 0.02, fy * 0.11, seed + 3, 3);
      const band = Math.sin((fy + strat * 9) * 0.22) * 0.5 + 0.5;
      let tint = (strat - 0.5) * 0.22 + (band - 0.5) * 0.1;
      tint -= Math.pow(clamp01(depth / 190), 0.75) * 0.42;   // darker as it goes down
      return { h: dome + strat * 1.2, tint };
    }, { mat: bodyMat });

    // sunlit crust
    p.field(0, 0, CHUNK_W - 1, CHUNK_H - 1, (fx, fy) => {
      const gx = Math.floor(fx);
      const surf = heights[clamp(gx, 0, CHUNK_W)] - top;
      const depth = fy - surf;
      if (depth < 0 || depth > 2.4) return null;
      const n = fbmTex((x0 + fx) * 0.16, fy * 0.3, seed + 41, 2);
      return { h: 5 - depth * 1.4, tint: (n - 0.4) * 0.3 + 0.1 };
    }, { mat: crustMat });

    // wind ripples running across the surface
    p.field(0, 0, CHUNK_W - 1, CHUNK_H - 1, (fx, fy) => {
      const gx = Math.floor(fx);
      const surf = heights[clamp(gx, 0, CHUNK_W)] - top;
      const depth = fy - surf;
      if (depth < 1 || depth > 16) return null;
      // ripples drift in spacing and fade with depth, so they read as
      // wind-blown sand rather than a repeated stamp
      const w = fbmTex((x0 + fx) * 0.009, 5, seed + 9, 2) * 40;
      const freq = 0.055 + fbmTex((x0 + fx) * 0.004, 2, seed + 29, 2) * 0.05;
      const r = Math.sin(((x0 + fx) * freq) + w + depth * 0.08);
      if (r < 0.6) return null;
      const fade = 1 - clamp01((depth - 2) / 12);
      return { h: (r - 0.6) * 1.9 * fade, tint: (r - 0.6) * 0.14 * fade };
    }, { mat: crustMat, mask: true });

    // pebbles and mineral flecks
    for (let i = 0; i < b.pebbles; i++) {
      const px = hash2i(cx, i, seed) * CHUNK_W;
      const gx = clamp(Math.floor(px), 0, CHUNK_W);
      const surf = heights[gx] - top;
      const py = surf + hash2i(cx, i + 500, seed) * 30 + 1;
      const r = 1 + hash2i(cx, i + 900, seed) * 2.4;
      p.ellipse(px, py, r, r * 0.75, { mat: b.pebbleMat, dome: r * 1.1, tint: (hash2i(cx, i + 71, seed) - 0.5) * 0.3 });
    }

    p.smoothHeight(1, 0.6);
    const canvas = p.resolve(MATERIALS, {
      lightX: -0.5, lightY: -0.78, lightZ: 0.38,
      ambient: 0.42, dither: 0.7, outline: 0,
    });
    return { canvas, top, cx };
  }

  getChunk(cx, budget) {
    const key = String(cx);
    let c = this.chunks.get(key);
    if (c) return c;
    if (budget && budget.left <= 0) return null;
    if (budget) budget.left--;
    c = this._paintChunk(cx);
    this.chunks.set(key, c);
    this.order.push(key);
    while (this.order.length > MAX_CHUNKS) this.chunks.delete(this.order.shift());
    return c;
  }

  /** Draw the walkable ground, plus the deep fill below it. */
  draw(ctx, cam) {
    const b = cam.bounds(CHUNK_W);
    const c0 = Math.floor(b.x0 / CHUNK_W), c1 = Math.floor(b.x1 / CHUNK_W);
    const budget = { left: 2 };
    const z = cam.zoom;

    for (let cx = c0; cx <= c1; cx++) {
      const chunk = this.getChunk(cx, budget);
      const wx = cx * CHUNK_W;
      const sx = Math.round((wx - cam.x) * z + cam.vw / 2);
      if (!chunk) {
        const bi = biomeAt(wx + 128);
        ctx.fillStyle = MATERIALS[bi.groundMat].ramp[3];
        const sy = Math.round((this.baseY(wx + 128) - cam.y) * z + cam.vh / 2);
        ctx.fillRect(sx, sy, Math.ceil(CHUNK_W * z), cam.vh);
        continue;
      }
      const sy = Math.round((chunk.top - cam.y) * z + cam.vh / 2);
      ctx.drawImage(chunk.canvas, sx, sy, Math.ceil(CHUNK_W * z), Math.ceil(CHUNK_H * z));
      // everything below the baked strip is deep, dark ground
      const bottom = sy + Math.ceil(CHUNK_H * z);
      if (bottom < cam.vh) {
        const bi = biomeAt(wx + 128);
        const g = ctx.createLinearGradient(0, bottom - 2, 0, cam.vh);
        g.addColorStop(0, MATERIALS[bi.groundMat].ramp[1]);
        g.addColorStop(1, MATERIALS[bi.groundMat].ramp[0]);
        ctx.fillStyle = g;
        ctx.fillRect(sx, bottom - 2, Math.ceil(CHUNK_W * z), cam.vh - bottom + 4);
      }
    }
  }

  /** Live deformation drawn over the baked chunk: dents, piles, wet marks. */
  drawSand(ctx, cam, eco) {
    const z = cam.zoom;
    const b = cam.bounds(20);
    const i0 = Math.round(b.x0 / SAND_CELL), i1 = Math.round(b.x1 / SAND_CELL);
    for (let i = i0; i <= i1; i++) {
      const d = this.sand.get(i);
      if (!d || Math.abs(d) < 0.2) continue;
      const wx = i * SAND_CELL;
      const base = this.baseY(wx);
      const sx = Math.round((wx - cam.x) * z + cam.vw / 2);
      const sy = Math.round((base - cam.y) * z + cam.vh / 2);
      const bi = biomeAt(wx);
      if (d > 0) {
        // a depression: shadowed hollow
        ctx.fillStyle = `rgba(40,26,14,${clamp01(d / 9) * 0.5})`;
        ctx.fillRect(sx, sy, Math.ceil(SAND_CELL * z), Math.ceil(d * z) + 1);
      } else {
        // a heap: lit crest
        ctx.fillStyle = MATERIALS[bi.crustMat].ramp[6];
        ctx.fillRect(sx, sy + Math.floor(d * z), Math.ceil(SAND_CELL * z), Math.ceil(-d * z) + 1);
      }
    }
  }
}
