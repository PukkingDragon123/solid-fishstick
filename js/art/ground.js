// CRABDEN - sitting IN the ground.
//
// A sprite drawn at the right height can still float. What the eye checks is
// the join: is there a gap under either edge, is the bottom a ruler-straight
// line across a slope, is there sand banked against it, is there a dark patch
// where the light cannot get. This file is the four answers:
//
//   1. THE LINE.   The terrain's own silhouette, sampled once a frame at
//                  world-pixel resolution and turned into a clip, so anything
//                  drawn in front of the ground is cut exactly where the
//                  ground is - nothing ever hangs below it.
//   2. THE SEAT.   Each prop is sunk to the lowest ground under its whole
//                  footprint (it carries buried pixels below its anchor for
//                  exactly this), and plants are sheared to the slope, so no
//                  edge of anything is ever over air.
//   3. THE DRIFT.  A low bank of the ground's own sand piled against the
//                  foot, drawn over the join and following the real surface.
//   4. THE SHADOW. A soft pixel shadow on the crust, longest on the side
//                  away from the sun.
//
// The terrain is drawn from `cam.x`/`cam.y` (no shake), so everything here is
// too - a prop glued to the ground has to move with the ground.

import { clamp, clamp01 } from '../lib/math.js';
import { MATERIALS } from '../lib/palette.js';
import { biomeAt } from '../world/biomes.js';

const BAYER4 = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

/** Screen x of a world x, the way the terrain places its chunks. */
export function gsx(cam, x) { return (x - cam.x) * cam.zoom + cam.vw / 2; }
/** Screen y of a world y, likewise. */
export function gsy(cam, y) { return (y - cam.y) * cam.zoom + cam.vh / 2; }

/**
 * The top of the ground at a world column, as the baked terrain draws it:
 * one world pixel per column, the surface rounded the way the chunk rounds.
 */
export function lineY(terrain, x) {
  return Math.ceil(terrain.baseY(Math.floor(x)) - 0.5);
}

export class Ground {
  constructor() {
    this.key = '';
    this.x0 = 0;
    this.n = 0;
    this.ys = new Float32Array(0);    // world surface row per column
    this.terrain = null;
  }

  /** Make sure the line is sampled for this frame's camera. Cheap to repeat. */
  frame(cam, terrain) {
    const key = cam.x + '|' + cam.y + '|' + cam.zoom + '|' + cam.vw + '|' + cam.vh;
    if (key === this.key && terrain === this.terrain) return this;
    this.key = key;
    this.terrain = terrain;
    const hw = cam.vw / 2 / cam.zoom + 4;
    const x0 = Math.floor(cam.x - hw), x1 = Math.ceil(cam.x + hw);
    const n = x1 - x0 + 1;
    if (this.ys.length < n) this.ys = new Float32Array(n + 64);
    for (let i = 0; i < n; i++) this.ys[i] = lineY(terrain, x0 + i);
    this.x0 = x0; this.n = n;
    return this;
  }

  /** World surface row at a world x - from the frame cache when it can be. */
  at(x) {
    const i = Math.floor(x) - this.x0;
    if (i >= 0 && i < this.n) return this.ys[i];
    return lineY(this.terrain, x);
  }

  /**
   * Clip `ctx` to everything above the ground line (plus `extra` screen
   * pixels into it, to cover the rounding at the join). Built from whole-pixel
   * rectangles, so the cut is as hard-edged as the terrain itself.
   */
  clipAbove(ctx, cam, extra = 1, x0 = -Infinity, x1 = Infinity) {
    const z = cam.zoom;
    ctx.beginPath();
    let runStart = -1, runY = 0;
    const flush = (sxEnd) => {
      if (runStart < 0) return;
      ctx.rect(runStart, -4, sxEnd - runStart, runY + 4);
    };
    const i0 = Math.max(0, Math.floor(x0) - this.x0), i1 = Math.min(this.n - 1, Math.ceil(x1) - this.x0);
    for (let i = i0; i <= i1; i++) {
      const wx = this.x0 + i;
      const sx = Math.round(gsx(cam, wx));
      const y = Math.round(gsy(cam, this.ys[i])) + extra;
      if (runStart < 0) { runStart = sx; runY = y; continue; }
      if (y !== runY) { flush(sx); runStart = sx; runY = y; }
    }
    flush(Math.round(gsx(cam, this.x0 + i1 + 1)));
    ctx.clip();
  }

  /**
   * Where to put something whose foot spans [x - footL, x + footR] and which
   * carries `bury` pixels of itself below its anchor: the anchor row, and the
   * slope of the ground across the foot (for plants to shear to).
   */
  seat(x, footL, footR, bury) {
    const c = this.at(x);
    let low = c;
    const n = Math.max(2, Math.ceil((footL + footR) / 3));
    for (let k = 0; k <= n; k++) {
      const wx = x - footL + (footL + footR) * (k / n);
      const y = this.at(wx);
      if (y > low) low = y;
    }
    const yl = this.at(x - footL), yr = this.at(x + footR);
    const slope = (yr - yl) / Math.max(1, footL + footR);
    return { y: Math.max(c, low - bury + 1), slope, low, c };
  }

  /**
   * A soft shadow on the crust: darkest under the foot, stretched away from
   * the sun. Dithered rather than blended, so it is made of the same square
   * pixels as everything round it.
   */
  shadow(ctx, cam, x, halfW, strength = 1, sun = 1, dir = 1) {
    const z = cam.zoom;
    const reach = halfW * (1.2 + 0.5 * sun);
    const off = dir * halfW * 0.25 * sun;
    const x0 = Math.floor(x - reach + off), x1 = Math.ceil(x + reach + off);
    const a = clamp01(0.42 * strength * (0.45 + sun * 0.55));
    if (a < 0.02) return;
    ctx.fillStyle = '#1c120a';
    for (let wx = x0; wx < x1; wx++) {
      const u = Math.abs(wx + 0.5 - (x + off)) / reach;
      if (u >= 1) continue;
      const k = (1 - u * u);
      const depth = Math.max(1, Math.round(k * (1.2 + halfW * 0.06) * 2) / 2);
      const sx = Math.round(gsx(cam, wx)), sw = Math.round(gsx(cam, wx + 1)) - sx;
      const gy = this.at(wx);
      const sy = Math.round(gsy(cam, gy));
      // two bands: a darker core right under it, a lighter skirt
      ctx.globalAlpha = a * (0.45 + 0.55 * k);
      ctx.fillRect(sx, sy, sw, Math.max(1, Math.round(depth * z)));
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A bank of sand against the foot of something: up to `h` world pixels
   * high at its crest, `halfW` either side of `x`, a touch higher on the
   * windward side. Coloured from the biome's own crust and body ramps, so
   * it is the same sand it is lying on.
   */
  drift(ctx, cam, x, halfW, h, wind = 1, seed = 0) {
    if (h < 0.4 || halfW < 1) return;
    const z = cam.zoom;
    const b = biomeAt(x);
    const crust = (MATERIALS[b.crustMat] || MATERIALS.sandPale).ramp;
    const body = (MATERIALS[b.groundMat] || MATERIALS.sand).ramp;
    const lit = crust[Math.min(crust.length - 1, 6)], mid = crust[Math.min(crust.length - 1, 5)];
    const dark = body[Math.min(body.length - 1, 4)];
    const x0 = Math.floor(x - halfW), x1 = Math.ceil(x + halfW);
    for (let wx = x0; wx < x1; wx++) {
      const u = (wx + 0.5 - x) / halfW;
      if (u <= -1 || u >= 1) continue;
      // the windward side is the fuller one; ripple the crest a little
      const lean = 1 + clamp(-u * wind, -1, 1) * 0.35;
      const hh = h * (1 - u * u) * (1 - u * u) * lean * (0.85 + 0.3 * frac(Math.sin((wx + seed) * 12.9898) * 43758.5));
      if (hh < 0.35) continue;
      const gy = this.at(wx);
      const top = gy - hh;
      const sx = Math.round(gsx(cam, wx)), sw = Math.round(gsx(cam, wx + 1)) - sx;
      if (sw <= 0) continue;
      const sy0 = Math.round(gsy(cam, top)), sy1 = Math.round(gsy(cam, gy)) + Math.max(1, Math.round(z));
      if (sy1 <= sy0) continue;
      // body of the bank, then the lit crest, then a darker lee flank
      ctx.fillStyle = u > 0.35 ? dark : mid;
      ctx.fillRect(sx, sy0, sw, sy1 - sy0);
      ctx.fillStyle = lit;
      ctx.fillRect(sx, sy0, sw, Math.max(1, Math.round(z)));
      // dither the edge of the bank into the ground below it
      const th = BAYER4[wx & 3][(sy0 >> 0) & 3];
      if (th < 0.5 && sy1 - sy0 > 2 * z) {
        ctx.fillStyle = dark;
        ctx.fillRect(sx, sy1 - Math.max(1, Math.round(z)), sw, Math.max(1, Math.round(z)));
      }
    }
  }
}

function frac(v) { return v - Math.floor(v); }

/** One shared line per frame, for everybody who draws on the ground. */
export const GROUND = new Ground();
