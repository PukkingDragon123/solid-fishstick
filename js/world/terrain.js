// CRABDEN - the ground you walk on.
//
// Side-scrolling, so the world is a heightfield over X. The surface is baked
// into 256px chunks by the pixel painter (strata, crust, ripples, pebbles) and
// cached; on top of that sits a live sand-deformation layer that footsteps
// push down and wind pulls back up.

import { clamp, clamp01, lerp, fbm2, valueNoise2, hashStr } from '../lib/math.js';
import { Painter, makeCanvas, fbmTex, hash2i } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { BIOMES, biomeAt, biomeBlend, biomeMix } from './biomes.js';
import { shade, BAYER8 } from '../art/wasteland.js';
import { groundOffset } from './landmarks.js';
import { propBump, cliffOffset, formDepth } from './props.js';
import { shelfOffset } from './ocean.js';

export const CHUNK_W = 256;
// How much ground is baked BELOW the lowest point of a chunk's surface. The
// chunk's canvas is this plus however far the surface itself rises and falls
// across the chunk, worked out per chunk - a fixed height was fine while the
// ground was dunes, and became a row of flat-topped slabs with the sky showing
// under them the moment anything in the world could step further than that.
const CHUNK_DEPTH = 224;
const CHUNK_MAX = 1024;
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
    // and a boulder is not a sprite standing on the sand - it IS the sand,
    // lifted. That is what makes one an obstacle without a line of collision
    // code: the floor goes up, your feet find it, and you climb.
    y += propBump(this.seedKey, x);
    // and the benches the wind cut out of the rock, which are the only
    // places out here you have to climb rather than walk
    y += cliffOffset(this.seedKey, x);
    // and off the west end the ground simply keeps going down, because that
    // is where the water still is
    y += shelfOffset(x);
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
      // a pit can go a long way down now, because somebody is mining in it
      this.sand.set(i, clamp(cur + depth * k * k, -20, 52));
    }
  }

  /** Slope in radians, for standing the crab on the surface. */
  slope(x, e = 7) {
    return Math.atan2(this.baseY(x + e) - this.baseY(x - e), e * 2);
  }

  /**
   * Sand is a fluid that is in no hurry. Two things happen to it every frame.
   *
   * It **slumps**: a pit with a sharp edge pulls its neighbours in, so what
   * you dig turns into a cone rather than staying a slot, and a pile spreads
   * out rather than standing up. That is the part that makes ground feel like
   * ground rather than like a dent in a sheet.
   *
   * And it **fills**, on the wind - but a footprint goes in minutes and a
   * three-metre pit does not, so the rate falls off with how deep the hole is.
   * Dig somewhere and it is still there when you come back.
   */
  update(dt, wind = 0.3) {
    if (!this.sand.size) return;
    const slump = clamp01(dt * (1.1 + wind * 0.8));
    const moved = [];
    for (const [i, v] of this.sand) {
      const l = this.sand.get(i - 1) || 0;
      const r = this.sand.get(i + 1) || 0;
      // only the difference beyond what sand will hold as a slope runs away
      const hold = 1.6;
      let flow = 0;
      if (v - l > hold) flow += (v - l - hold) * 0.5;
      if (v - r > hold) flow += (v - r - hold) * 0.5;
      if (flow !== 0) moved.push([i, flow * slump]);
    }
    for (const [i, f] of moved) {
      this.sand.set(i, (this.sand.get(i) || 0) - f);
      this.sand.set(i - 1, (this.sand.get(i - 1) || 0) + f * 0.5);
      this.sand.set(i + 1, (this.sand.get(i + 1) || 0) + f * 0.5);
    }

    for (const [i, v] of this.sand) {
      // deep holes are slow to fill; a footprint is gone almost at once
      const deep = 1 / (1 + Math.abs(v) * 0.32);
      const nv = v * Math.pow(0.55, dt * (0.5 + wind) * deep);
      if (Math.abs(nv) < 0.06) this.sand.delete(i);
      else this.sand.set(i, nv);
    }
  }

  // -- baked chunks --------------------------------------------------------

  _paintChunk(cx) {
    const x0 = cx * CHUNK_W;
    const heights = new Float32Array(CHUNK_W + 1);
    // how much of the column at each x is rock standing on the sand, rather
    // than sand - a butte that paints as dune is just a very large dune
    const rock = new Float32Array(CHUNK_W + 1);
    let minY = Infinity, maxY = -Infinity, anyRock = false;
    for (let i = 0; i <= CHUNK_W; i++) {
      const h = this.baseY(x0 + i);
      heights[i] = h;
      rock[i] = formDepth(this.seedKey, x0 + i);
      if (rock[i] > 1) anyRock = true;
      if (h < minY) minY = h;
      if (h > maxY) maxY = h;
    }
    const top = Math.floor(minY) - 6;
    const H = Math.min(CHUNK_MAX, Math.ceil(maxY - top) + CHUNK_DEPTH);
    const p = new Painter(CHUNK_W, H);
    // Everything below is a function of WORLD position and one seed, never of
    // the chunk: a chunk-seeded texture is what used to draw a vertical seam
    // down the ground every 256 pixels.
    const S = this.seed;
    const W = CHUNK_W;
    for (let i = 0; i < W; i++) {
      const wx = x0 + i + 0.5;
      const surf = heights[i] - top;
      const rk = rock[i];
      // between biomes the sands interleave on the dither instead of cutting
      const { a, b, t } = biomeMix(wx);
      const bodyA = p._mid(a.groundMat), bodyB = t > 0 ? p._mid(b.groundMat) : bodyA;
      const crustA = p._mid(a.crustMat), crustB = t > 0 ? p._mid(b.crustMat) : crustA;
      const rockM = p._mid(a.mesaMat);
      const hardM = p._mid(a.id === 'saltpan' || a.id === 'theshallows' ? 'wlSaltCrust' : 'wlHardpan');
      const slope = (heights[Math.min(W, i + 2)] - heights[Math.max(0, i - 2)]) * 0.25;
      // the lip faces the sun on a rise and turns away on a fall
      const face = slope < 0 ? Math.min(0.12, -slope * 0.4) : -Math.min(0.16, slope * 0.35);
      // patches of cracked hardpan where the old water stood longest
      const hp = fbmTex(wx * 0.0045, 3.7, S + 5, 2);
      const hardD = rk < 1.5 && hp > 0.6 ? clamp((hp - 0.6) * 60, 2, 8) : 0;
      const warp = fbmTex(wx * 0.01, 5, S + 9, 2) * 9;
      const sw = fbmTex(wx * 0.0035, 1, S + 3, 2) * 16;        // strata undulate
      const set = Math.floor(wx / 70) + Math.floor(fbmTex(wx * 0.01, 9, S, 1) * 3);
      const lean = hash2i(set, 3, S) < 0.5 ? 0.5 : -0.5;      // cross-bedding direction
      for (let yy = Math.max(0, Math.floor(surf)); yy < H; yy++) {
        const y = yy + 0.5;
        const depth = y - surf;
        if (depth < 0) continue;
        const wy = yy + top;
        const k = yy * W + i;
        const dth = BAYER8[yy & 7][i & 7];
        if (depth < rk) {
          // THE ROCK. Beds run level, not parallel to the surface, because a
          // bed was laid down flat and then the wind took the soft stuff off
          // the top of it - which is exactly why the terraces are where they are.
          const bed = fbmTex(wx * 0.006, wy * 0.09, S + 61, 2);
          const course = Math.sin((wy + bed * 5) * 0.33) * 0.5 + 0.5;
          const hard = Math.sin((wy + bed * 3) * 0.075) * 0.5 + 0.5;
          const grit = hash2i(Math.floor(wx), wy, S + 83);
          const lip = depth < 2.2 ? 3.2 - depth : 0;
          p.mat[k] = rockM; p.cov[k] = 1;
          p.hgt[k] = lip + hard * 2.4 + course * 1.1 + grit * 0.6;
          p.tint[k] = (course - 0.5) * 0.22 + (hard - 0.5) * 0.16 + (grit - 0.5) * 0.1 + (depth < 1 ? 0.1 : 0);
          continue;
        }
        let m = t > 0 && dth < t ? bodyB : bodyA;
        let tint = 0, h = 0.5;
        const fade = clamp01(1 - depth / 14);
        if (depth < 1) { m = t > 0 && dth < t ? crustB : crustA; tint = 0.2 + face; h = 5; }
        else if (depth < 2.3) { m = t > 0 && dth < t ? crustB : crustA; tint = 0.04 + face * 0.6; h = 3.5; }
        else if (depth < 3.2) { tint = -0.1; h = 1.5; }        // the shadow under the lip
        else if (hardD && depth < hardD + 3) {
          // hardpan: dark plates with pale cracks between them
          m = hardM;
          const cx2 = Math.floor((wx + yy * 0.35) / 7), cy2 = Math.floor((wy + hash2i(cx2, 1, S) * 4) / 4);
          const fx = (wx + yy * 0.35) / 7 - cx2;
          const edge = fx < 0.13 || ((wy + hash2i(cx2, 1, S) * 4) / 4 - cy2) < 0.2;
          tint = edge ? 0.16 : (hash2i(cx2, cy2, S + 7) - 0.5) * 0.12 - 0.04;
          h = edge ? 0 : 1.2;
        } else {
          // ripples: lines along the slope a few pixels apart, under the crust
          if (depth < 16) {
            const r = (depth + Math.sin(wx * 0.09 + warp) * 1.4) / 3.4;
            const fr = r - Math.floor(r);
            if (fr < 0.2) tint += 0.07 * fade; else if (fr > 0.55 && fr < 0.7) tint -= 0.035 * fade;
          }
          tint += face * fade * 0.7;
        }
        if (depth >= 3.2) {
          // strata: broad bands, a few thin dark seams and pale ones
          const sy = wy + sw;
          tint += (Math.sin(sy * 0.19) * 0.6 + Math.sin(sy * 0.071 + 1.3) * 0.4) * 0.05;
          const s1 = sy / 23 - Math.floor(sy / 23), s2 = sy / 37 - Math.floor(sy / 37);
          if (s1 < 0.05) tint -= 0.1; else if (s2 > 0.5 && s2 < 0.54) tint += 0.07;
          // cross-bedding: fine diagonal laminae inside each set of beds
          if (depth > 18 && Math.floor(sy / 26) % 2 === 0) {
            const l = (sy + wx * lean) / 5;
            if (l - Math.floor(l) < 0.16) tint -= 0.045;
          }
          tint -= Math.pow(clamp01(depth / 200), 0.8) * 0.4;
        }
        tint += (hash2i(Math.floor(wx), wy, S + 11) - 0.5) * 0.05;
        p.mat[k] = m; p.cov[k] = 1; p.hgt[k] = h; p.tint[k] = tint;
      }
    }

    // pebbles: some sunk in the face, some lying on the sand - placed on a
    // world grid so the same stone is in the same place from either chunk
    const b = biomeAt(x0 + CHUNK_W / 2);
    const cell = Math.max(10, Math.round(320 / Math.max(1, b.pebbles)));
    for (let c = Math.floor((x0 - 8) / cell); c <= Math.floor((x0 + W + 8) / cell); c++) {
      for (let j = 0; j < 2; j++) {
        const wx = c * cell + hash2i(c, 11 + j, S) * cell;
        const lx = wx - x0;
        if (lx < -6 || lx > W + 6) continue;
        const gi = clamp(Math.floor(lx), 0, W);
        if (rock[gi] > 1.5) continue;
        const onTop = j === 0 && hash2i(c, 21, S) < 0.6;
        const r = onTop ? 0.9 + hash2i(c, 31 + j, S) * 1.6 : 0.8 + hash2i(c, 31 + j, S) * 2.2;
        const py = heights[gi] - top + (onTop ? -r * 0.35 : 4 + hash2i(c, 41 + j, S) * 44);
        const pm = biomeAt(wx).pebbleMat;
        p.ellipse(lx, py, r * 1.25, r * 0.85, { mat: pm, dome: r * 1.3, tint: (hash2i(c, 51 + j, S) - 0.5) * 0.3 });
      }
    }

    p.smoothHeight(1, 0.5);
    const canvas = shade(p, { ambient: 0.4, dither: 0.7 });
    return { canvas, top, h: H, cx };
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
      const ch = chunk.h;
      ctx.drawImage(chunk.canvas, sx, sy, Math.ceil(CHUNK_W * z), Math.ceil(ch * z));
      // everything below the baked strip is deep, dark ground
      const bottom = sy + Math.ceil(ch * z);
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
