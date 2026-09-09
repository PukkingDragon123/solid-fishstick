// CRABDEN - the desert itself.
//
// Terrain is a continuous noise field. For rendering it is rasterised into
// 128px chunks and cached as two canvases: an albedo pass and a separate
// shadow mask. The mask is drawn back with a time-of-day offset, so dune
// shadows stretch and swing through the day for almost no cost.

import {
  Rng, hashStr, fbm2, ridge2, valueNoise2, clamp, clamp01, lerp, mixHex, hexToRgb, smoothstep,
  TAU,
} from '../lib/math.js';
import { REGIONS, REGION_BY_ID, POI_KINDS } from './regions.js';
export const CHUNK = 128;
const MAX_CHUNKS = 150;

const DECOR_KINDS = {
  rock:      { r: 5,  solid: true,  h: 6 },
  boulder:   { r: 11, solid: true,  h: 14 },
  deadtree:  { r: 3,  solid: true,  h: 22 },
  bone_rib:  { r: 4,  solid: true,  h: 18 },
  bone_skull:{ r: 9,  solid: true,  h: 10 },
  coral:     { r: 6,  solid: true,  h: 16 },
  ruin_wall: { r: 12, solid: true,  h: 18 },
  pillar:    { r: 5,  solid: true,  h: 26 },
  car:       { r: 10, solid: true,  h: 9 },
  shard:     { r: 3,  solid: false, h: 12 },
  crust:     { r: 6,  solid: false, h: 2 },
  pebbles:   { r: 3,  solid: false, h: 1 },
  driftwood: { r: 7,  solid: true,  h: 5 },
};

export class World {
  constructor(seed = 'crabden') {
    this.seed = typeof seed === 'string' ? hashStr(seed) : seed | 0;
    this.halfSize = 5200;
    this.chunks = new Map();
    this.chunkOrder = [];
    this.decorCache = new Map();
    this.pois = [];
    this.homeX = 0; this.homeY = 0;
    this._genPois();
    this._regionCacheKey = -1;
  }

  // -- field sampling -------------------------------------------------------

  /** Warped distance field pick of the dominant region + blend weight. */
  regionAt(x, y) {
    // two octaves of domain warp; without this the Voronoi cells read as a pie chart
    const wx = x
      + (valueNoise2(x * 0.00035, y * 0.00035, this.seed + 31) - 0.5) * 1500
      + (valueNoise2(x * 0.0013, y * 0.0013, this.seed + 131) - 0.5) * 320;
    const wy = y
      + (valueNoise2(x * 0.00035 + 5.5, y * 0.00035 + 2.1, this.seed + 77) - 0.5) * 1500
      + (valueNoise2(x * 0.0013 + 1.7, y * 0.0013 + 4.3, this.seed + 177) - 0.5) * 320;
    let best = REGIONS[0], bestD = Infinity, secondD = Infinity;
    for (const r of REGIONS) {
      const d = Math.hypot(wx - r.cx, wy - r.cy) / r.pull;
      if (d < bestD) { secondD = bestD; bestD = d; best = r; }
      else if (d < secondD) secondD = d;
    }
    // 0 at a hard border, 1 deep inside the region
    const blend = clamp01((secondD - bestD) / 420);
    return { region: best, blend };
  }

  regionIdAt(x, y) { return this.regionAt(x, y).region.id; }

  heightAt(x, y) {
    const s = 0.0013;
    let h = fbm2(x * s, y * s, 5, this.seed);
    h = h * 0.66 + ridge2(x * s * 2.3, y * s * 2.3, 3, this.seed + 911) * 0.34;
    // wind ripples running roughly NW-SE
    h += (valueNoise2(x * 0.055 + y * 0.014, y * 0.085 - x * 0.01, this.seed + 7) - 0.5) * 0.028;
    // regions with a flat floor
    const { region, blend } = this.regionAt(x, y);
    if (region.id === 'saltpan' || region.id === 'glassflats') h = lerp(h, 0.42 + (h - 0.5) * 0.22, blend * 0.9);
    if (region.id === 'deepwell') {
      const d = Math.hypot(x - region.cx, y - region.cy);
      h -= smoothstep(1 - clamp01(d / 900)) * 0.55; // the crater
    }
    return clamp01(h);
  }

  /** Gradient of the height field; used for shading and for leg placement. */
  slopeAt(x, y, e = 3) {
    const hx = this.heightAt(x + e, y) - this.heightAt(x - e, y);
    const hy = this.heightAt(x, y + e) - this.heightAt(x, y - e);
    return { dx: hx / (2 * e), dy: hy / (2 * e) };
  }

  /** Visual elevation in pixels (used to lift feet / entities). */
  elevAt(x, y) { return this.heightAt(x, y) * 18; }

  /** How buildable/fertile the ground is: 0 = bare rock, 1 = soft sand. */
  fertilityAt(x, y) {
    const n = fbm2(x * 0.004, y * 0.004, 3, this.seed + 404);
    const { region } = this.regionAt(x, y);
    let base = n;
    if (region.id === 'glassflats') base *= 0.55;
    if (region.id === 'saltpan') base *= 0.7;
    if (region.id === 'deepwell') base = Math.max(base, 0.65);
    return clamp01(base);
  }

  inBounds(x, y) { return Math.abs(x) < this.halfSize && Math.abs(y) < this.halfSize; }

  clampToWorld(p) {
    p.x = clamp(p.x, -this.halfSize, this.halfSize);
    p.y = clamp(p.y, -this.halfSize, this.halfSize);
    return p;
  }

  // -- points of interest ---------------------------------------------------

  _genPois() {
    const rng = new Rng(this.seed ^ 0x51ab);
    const push = (kind, x, y, extra = {}) => {
      const k = POI_KINDS[kind];
      const reg = this.regionAt(x, y).region;
      this.pois.push({
        id: 'poi' + this.pois.length,
        kind, name: k.name, x, y,
        region: reg.id,
        water: k.water, waterLeft: k.water,
        discovered: false, looted: false, cleared: false,
        radius: kind === 'well' ? 150 : kind === 'oasis' ? 60 : 34,
        seed: rng.int(1e9),
        ...extra,
      });
    };

    // hand-placed story beats
    push('ruin', 210, -150, { story: 'dig', name: "Pell's Dig Site" });
    push('oasis', -560, 380, { story: 'firstOasis', name: 'The First Puddle' });
    push('well', REGION_BY_ID.deepwell.cx, REGION_BY_ID.deepwell.cy, { story: 'well' });
    push('monolith', -2540, -1180, { story: 'monolith1' });
    push('wreck', -2150, 2260, { story: 'ark' });

    // scattered per region
    for (const r of REGIONS) {
      const count = r.id === 'deepwell' ? 5 : 13;
      for (let i = 0; i < count; i++) {
        const a = rng.float(TAU);
        const rad = Math.sqrt(rng.next()) * 1500 * r.pull;
        const x = r.cx + Math.cos(a) * rad;
        const y = r.cy + Math.sin(a) * rad;
        if (!this.inBounds(x, y)) continue;
        if (Math.hypot(x, y) < 320) continue; // keep home clear
        const table = {
          dunes:      ['oasis', 'seep', 'bones', 'ruin', 'monolith'],
          bonereef:   ['bones', 'bones', 'seep', 'oasis', 'monolith'],
          glassflats: ['crater', 'crater', 'seep', 'oasis', 'monolith'],
          rustlands:  ['ruin', 'ruin', 'wreck', 'seep', 'oasis'],
          saltpan:    ['wreck', 'seep', 'oasis', 'bones', 'crater'],
          ashwood:    ['ruin', 'seep', 'oasis', 'bones', 'monolith'],
          deepwell:   ['oasis', 'seep', 'monolith', 'bones', 'wreck'],
        }[r.id];
        push(rng.pick(table), Math.round(x), Math.round(y));
      }
    }
  }

  nearestPoi(x, y, maxDist = 1e9, filter = null) {
    let best = null, bd = maxDist * maxDist;
    for (const p of this.pois) {
      if (filter && !filter(p)) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  poisInRadius(x, y, r) {
    return this.pois.filter((p) => Math.hypot(p.x - x, p.y - y) <= r);
  }

  // -- decor ----------------------------------------------------------------

  decorFor(cx, cy) {
    const key = cx + ',' + cy;
    let list = this.decorCache.get(key);
    if (list) return list;
    list = [];
    const rng = new Rng(hashStr('d' + key) ^ this.seed);
    const ox = cx * CHUNK, oy = cy * CHUNK;
    const { region } = this.regionAt(ox + CHUNK / 2, oy + CHUNK / 2);

    const tables = {
      dunes:      [['rock', 3], ['boulder', 1], ['pebbles', 4], ['bone_rib', 0.6], ['deadtree', 0.5]],
      bonereef:   [['coral', 3], ['bone_rib', 2.5], ['bone_skull', 0.7], ['rock', 1], ['pebbles', 2]],
      glassflats: [['shard', 5], ['crust', 2], ['rock', 0.8], ['pebbles', 1.5]],
      rustlands:  [['car', 1.1], ['ruin_wall', 1.6], ['pillar', 1.2], ['rock', 1.5], ['pebbles', 2]],
      saltpan:    [['crust', 4], ['driftwood', 1.4], ['bone_rib', 0.8], ['pebbles', 2]],
      ashwood:    [['deadtree', 3.4], ['rock', 1.2], ['pebbles', 2], ['boulder', 0.6]],
      deepwell:   [['pillar', 1.4], ['coral', 1.6], ['rock', 1.4], ['bone_rib', 1.2], ['driftwood', 0.8]],
    };
    const table = tables[region.id] || tables.dunes;
    const density = region.id === 'saltpan' || region.id === 'glassflats' ? 0.55 : 1;

    for (const [kind, w] of table) {
      const n = Math.round(w * density * (0.5 + rng.next()));
      for (let i = 0; i < n; i++) {
        const x = ox + rng.float(CHUNK);
        const y = oy + rng.float(CHUNK);
        if (Math.hypot(x, y) < 190) continue;        // keep the home grove clear
        const spec = DECOR_KINDS[kind];
        list.push({
          kind, x, y, decor: true,
          r: spec.r * rng.float(0.7, 1.3),
          h: spec.h * rng.float(0.75, 1.35),
          solid: spec.solid,
          seed: rng.int(1e9),
          flip: rng.bool(),
          sway: rng.float(TAU),
        });
      }
    }
    if (this.decorCache.size > 400) this.decorCache.clear();
    this.decorCache.set(key, list);
    return list;
  }

  decorNear(b) {
    const out = [];
    const c0x = Math.floor(b.x0 / CHUNK), c1x = Math.floor(b.x1 / CHUNK);
    const c0y = Math.floor(b.y0 / CHUNK), c1y = Math.floor(b.y1 / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cx = c0x; cx <= c1x; cx++)
        for (const d of this.decorFor(cx, cy)) out.push(d);
    return out;
  }

  /** Solid decor near a point, for collision. */
  solidsNear(x, y, r = 40) {
    const out = [];
    const c0x = Math.floor((x - r) / CHUNK), c1x = Math.floor((x + r) / CHUNK);
    const c0y = Math.floor((y - r) / CHUNK), c1y = Math.floor((y + r) / CHUNK);
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cx = c0x; cx <= c1x; cx++)
        for (const d of this.decorFor(cx, cy))
          if (d.solid && Math.hypot(d.x - x, d.y - y) < r + d.r) out.push(d);
    return out;
  }

  // -- chunk rasterisation --------------------------------------------------

  _makeChunk(cx, cy) {
    const base = document.createElement('canvas');
    base.width = base.height = CHUNK;
    const shade = document.createElement('canvas');
    shade.width = shade.height = CHUNK;

    const bctx = base.getContext('2d');
    const sctx = shade.getContext('2d');
    const bimg = bctx.createImageData(CHUNK, CHUNK);
    const simg = sctx.createImageData(CHUNK, CHUNK);
    const bd = bimg.data, sd = simg.data;

    const ox = cx * CHUNK, oy = cy * CHUNK;

    // Region palettes sampled on a coarse grid, bilinearly blended per pixel.
    const GS = 4, GN = GS + 1;
    const grid = [];
    for (let gy = 0; gy < GN; gy++) {
      for (let gx = 0; gx < GN; gx++) {
        const wx = ox + (gx / GS) * CHUNK;
        const wy = oy + (gy / GS) * CHUNK;
        const { region, blend } = this.regionAt(wx, wy);
        const neighbour = this._secondRegion(wx, wy, region);
        const t = 1 - blend;
        const p = region.pal, q = neighbour.pal;
        grid.push({
          lo: hexToRgb(mixHex(p.lo, q.lo, t * 0.5)),
          mid: hexToRgb(mixHex(p.mid, q.mid, t * 0.5)),
          hi: hexToRgb(mixHex(p.hi, q.hi, t * 0.5)),
          crest: hexToRgb(mixHex(p.crest, q.crest, t * 0.5)),
          shadow: hexToRgb(mixHex(p.shadow, q.shadow, t * 0.5)),
          detail: hexToRgb(mixHex(p.detail, q.detail, t * 0.5)),
        });
      }
    }
    const sampleGrid = (fx, fy, key, out) => {
      const gx = fx * GS, gy = fy * GS;
      const x0 = Math.min(GS - 1, gx | 0), y0 = Math.min(GS - 1, gy | 0);
      const tx = gx - x0, ty = gy - y0;
      const a = grid[y0 * GN + x0][key], b = grid[y0 * GN + x0 + 1][key];
      const c = grid[(y0 + 1) * GN + x0][key], d = grid[(y0 + 1) * GN + x0 + 1][key];
      for (let i = 0; i < 3; i++) {
        out[i] = lerp(lerp(a[i], b[i], tx), lerp(c[i], d[i], tx), ty);
      }
      return out;
    };

    // height cache with a 2px skirt so gradients can be taken over a wider
    // baseline; a 1px baseline picks up the ripple noise and looks blotchy
    const SK = 2;
    const HN = CHUNK + SK * 2;
    const hbuf = new Float32Array(HN * HN);
    for (let y = 0; y < HN; y++) {
      for (let x = 0; x < HN; x++) {
        hbuf[y * HN + x] = this.heightAt(ox + x - SK, oy + y - SK);
      }
    }

    const colA = [0, 0, 0], colB = [0, 0, 0], out = [0, 0, 0];
    const BAYER = [
      [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
    ];

    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const hi = (y + SK) * HN + (x + SK);
        const h = hbuf[hi];
        const gx = (hbuf[hi + 2] - hbuf[hi - 2]) * 0.5;
        const gy = (hbuf[hi + HN * 2] - hbuf[hi - HN * 2]) * 0.5;

        const fx = x / CHUNK, fy = y / CHUNK;
        const dith = (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.055;
        const hv = clamp01(h + dith);

        // 4-stop ramp: shadow -> lo -> mid -> hi -> crest
        let t;
        if (hv < 0.34) { sampleGrid(fx, fy, 'shadow', colA); sampleGrid(fx, fy, 'lo', colB); t = hv / 0.34; }
        else if (hv < 0.55) { sampleGrid(fx, fy, 'lo', colA); sampleGrid(fx, fy, 'mid', colB); t = (hv - 0.34) / 0.21; }
        else if (hv < 0.74) { sampleGrid(fx, fy, 'mid', colA); sampleGrid(fx, fy, 'hi', colB); t = (hv - 0.55) / 0.19; }
        else { sampleGrid(fx, fy, 'hi', colA); sampleGrid(fx, fy, 'crest', colB); t = (hv - 0.74) / 0.26; }
        t = clamp01(t);
        for (let i = 0; i < 3; i++) out[i] = lerp(colA[i], colB[i], t);

        // Wind ripples: high frequency across the wind, low along it, so the
        // pattern reads as drifted sand rather than a checkerboard.
        const rip = valueNoise2((ox + x) * 0.11 + (oy + y) * 0.03, (oy + y) * 0.44 - (ox + x) * 0.05, this.seed + 55);
        const ripq = (Math.round(rip * 2) / 2 - 0.5) * 2;
        const ripAmt = 5 * (0.45 + hv * 0.9);
        for (let i = 0; i < 3; i++) out[i] = clamp(out[i] + ripq * ripAmt, 0, 255);

        const o = (y * CHUNK + x) * 4;
        bd[o] = out[0]; bd[o + 1] = out[1]; bd[o + 2] = out[2]; bd[o + 3] = 255;

        // Shadow mask: slopes facing away from an upper-left key light.
        // The gradient is tiny in absolute terms, so it needs a big gain.
        const lit = -(gx * 0.7 + gy * 0.7) * 215;
        let sh = clamp01(lit);
        sh = Math.round(sh * 5) / 5;             // quantise into visible bands
        const so = o;
        sd[so] = 14; sd[so + 1] = 11; sd[so + 2] = 20;
        sd[so + 3] = Math.round(sh * 175);
      }
    }
    bctx.putImageData(bimg, 0, 0);
    sctx.putImageData(simg, 0, 0);
    return { base, shade, cx, cy };
  }

  _secondRegion(x, y, exclude) {
    const wx = x
      + (valueNoise2(x * 0.00035, y * 0.00035, this.seed + 31) - 0.5) * 1500
      + (valueNoise2(x * 0.0013, y * 0.0013, this.seed + 131) - 0.5) * 320;
    const wy = y
      + (valueNoise2(x * 0.00035 + 5.5, y * 0.00035 + 2.1, this.seed + 77) - 0.5) * 1500
      + (valueNoise2(x * 0.0013 + 1.7, y * 0.0013 + 4.3, this.seed + 177) - 0.5) * 320;
    let best = exclude, bd = Infinity;
    for (const r of REGIONS) {
      if (r === exclude) continue;
      const d = Math.hypot(wx - r.cx, wy - r.cy) / r.pull;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  getChunk(cx, cy, budget) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (c) return c;
    if (budget && budget.left <= 0) return null;
    if (budget) budget.left--;
    c = this._makeChunk(cx, cy);
    this.chunks.set(key, c);
    this.chunkOrder.push(key);
    while (this.chunkOrder.length > MAX_CHUNKS) {
      const old = this.chunkOrder.shift();
      this.chunks.delete(old);
    }
    return c;
  }

  /**
   * Draw visible terrain. `sun` = {x, y, strength}: x/y is the shadow offset
   * in world pixels, strength is 0..1.
   */
  draw(ctx, cam, sun) {
    const b = cam.bounds(CHUNK);
    const c0x = Math.floor(b.x0 / CHUNK), c1x = Math.floor(b.x1 / CHUNK);
    const c0y = Math.floor(b.y0 / CHUNK), c1y = Math.floor(b.y1 / CHUNK);
    const budget = { left: 3 };
    const z = cam.zoom;

    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        const wx = cx * CHUNK, wy = cy * CHUNK;
        const sx = Math.round((wx - cam.renderX) * z + cam.vw / 2);
        const sy = Math.round((wy - cam.renderY) * z + cam.vh / 2);
        const size = Math.ceil(CHUNK * z);
        const c = this.getChunk(cx, cy, budget);
        if (!c) {
          // not baked yet - fill with the region's mid tone so nothing flashes
          const { region } = this.regionAt(wx + 64, wy + 64);
          ctx.fillStyle = region.pal.mid;
          ctx.fillRect(sx, sy, size, size);
          continue;
        }
        ctx.drawImage(c.base, sx, sy, size, size);
        if (sun.strength > 0.01) {
          ctx.save();
          ctx.globalAlpha = sun.strength;
          ctx.drawImage(c.shade, sx + Math.round(sun.x * z), sy + Math.round(sun.y * z), size, size);
          ctx.restore();
        }
      }
    }
  }

  /** Cheap warm/cool tint used by the ecosystem overlay for wet sand. */
  wetColorAt(x, y) {
    return this.regionAt(x, y).region.pal.wet;
  }
}
