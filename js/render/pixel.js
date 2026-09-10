// CRABDEN - the pixel painter.
//
// Sprites are not drawn as strokes and fills. Each one is built as a set of
// fields - coverage, height, material, tint - and then *shaded*: normals come
// from the height field, lighting is a lambert term plus rim and cavity, and
// the result is quantised onto a per-material colour ramp with ordered
// dithering. That is what makes the art read as rendered form rather than
// flat shapes, and it costs nothing at runtime because every sprite is baked
// once into a canvas.

import { clamp, clamp01, lerp, hexToRgb } from '../lib/math.js';

const BAYER8 = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
].map((r) => r.map((v) => (v + 0.5) / 64));

function hash2i(x, y, s) {
  let h = (s | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise, used for material texture rather than terrain. */
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2i(xi, yi, s), b = hash2i(xi + 1, yi, s);
  const c = hash2i(xi, yi + 1, s), d = hash2i(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbmTex(x, y, s, oct = 3) {
  let a = 1, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * vnoise(x * f, y * f, s + i * 1013);
    norm += a; a *= 0.5; f *= 2.1;
  }
  return sum / norm;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return c;
}

// ---------------------------------------------------------------------------

export class Painter {
  constructor(w, h) {
    this.w = w | 0;
    this.h = h | 0;
    const n = this.w * this.h;
    this.cov = new Float32Array(n);
    this.hgt = new Float32Array(n);
    this.mat = new Uint8Array(n);
    this.tint = new Float32Array(n);
    this.emis = new Float32Array(n);
    this.mats = ['']; // index 0 is empty
    this._matIndex = new Map();
  }

  _mid(name) {
    let i = this._matIndex.get(name);
    if (i === undefined) {
      i = this.mats.length;
      this.mats.push(name);
      this._matIndex.set(name, i);
    }
    return i;
  }

  _put(x, y, o, h, extraTint = 0) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (o.under && this.mat[i]) return;
    if (o.onlyOver && !this.mat[i]) return;
    if (o.mask && !this.mat[i]) return;
    // `onlyMat` is the strict form of `mask`: touch this material and nothing
    // else, so a texture pass over one layer of a laminate cannot eat the rest
    if (o._only !== undefined && this.mat[i] !== o._only) return;
    const hh = h + (o.lift || 0);
    if (o.keepHigher && this.mat[i] && this.hgt[i] > hh) return;
    this.mat[i] = o._m;
    this.cov[i] = 1;
    this.hgt[i] = o.addHeight ? this.hgt[i] + hh : Math.max(this.hgt[i], hh);
    this.tint[i] = (o.tint || 0) + extraTint;
    if (o.emissive) this.emis[i] = o.emissive;
  }

  _prep(o) {
    o._m = this._mid(o.mat || 'default');
    o._only = o.onlyMat ? this._mid(o.onlyMat) : undefined;
    return o;
  }

  // -- primitives ---------------------------------------------------------

  ellipse(cx, cy, rx, ry, o = {}) {
    this._prep(o);
    const rot = o.rot || 0;
    const cs = Math.cos(-rot), sn = Math.sin(-rot);
    const R = Math.max(rx, ry) + 2;
    const dome = o.dome ?? Math.min(rx, ry) * 0.85;
    const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R);
    const y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const lx = dx * cs - dy * sn, ly = dx * sn + dy * cs;
        const d2 = (lx / rx) ** 2 + (ly / ry) ** 2;
        if (d2 > 1) continue;
        this._put(x, y, o, dome * Math.sqrt(Math.max(0, 1 - d2)));
      }
    }
    return this;
  }

  /** Tapered capsule; the workhorse for limbs, stems and roots. */
  capsule(x0, y0, x1, y1, r0, r1, o = {}) {
    this._prep(o);
    const r1v = r1 ?? r0;
    const maxR = Math.max(r0, r1v) + 2;
    const bx0 = Math.floor(Math.min(x0, x1) - maxR), bx1 = Math.ceil(Math.max(x0, x1) + maxR);
    const by0 = Math.floor(Math.min(y0, y1) - maxR), by1 = Math.ceil(Math.max(y0, y1) + maxR);
    const vx = x1 - x0, vy = y1 - y0;
    const len2 = vx * vx + vy * vy || 1;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const px = x + 0.5 - x0, py = y + 0.5 - y0;
        let t = (px * vx + py * vy) / len2;
        t = clamp01(t);
        const qx = px - vx * t, qy = py - vy * t;
        const d = Math.hypot(qx, qy);
        const r = lerp(r0, r1v, t);
        if (d > r) continue;
        const k = r > 0 ? d / r : 0;
        const dome = (o.dome ?? r * 0.9) * Math.sqrt(Math.max(0, 1 - k * k));
        this._put(x, y, o, dome + (o.along ? o.along * t : 0));
      }
    }
    return this;
  }

  /** Quadratic curve as a chain of capsules. */
  curve(pts, r0, r1, o = {}) {
    const steps = Math.max(2, o.steps || 14);
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = bezier(pts, t);
      if (prev) {
        const ra = lerp(r0, r1 ?? r0, (i - 1) / steps);
        const rb = lerp(r0, r1 ?? r0, t);
        this.capsule(prev.x, prev.y, p.x, p.y, ra, rb, o);
      }
      prev = p;
    }
    return this;
  }

  poly(pts, o = {}) {
    this._prep(o);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const feather = o.feather ?? 3;
    const dome = o.dome ?? 3;
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y1) + 1; y++) {
      for (let x = Math.floor(x0) - 1; x <= Math.ceil(x1) + 1; x++) {
        const px = x + 0.5, py = y + 0.5;
        if (!pointInPoly(px, py, pts)) continue;
        const d = distToPoly(px, py, pts);
        const k = clamp01(d / feather);
        this._put(x, y, o, dome * Math.sqrt(k));
      }
    }
    return this;
  }

  rect(x, y, w, h, o = {}) {
    this._prep(o);
    const dome = o.dome ?? 0;
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) {
        const fx = Math.min(xx - x, x + w - 1 - xx) / Math.max(1, w / 2);
        const fy = Math.min(yy - y, y + h - 1 - yy) / Math.max(1, h / 2);
        this._put(xx, yy, o, dome * Math.sqrt(clamp01(Math.min(fx, fy))));
      }
    }
    return this;
  }

  /**
   * Arbitrary field: fn(x, y) returns null or {h, tint}. A returned `mat`
   * overrides the material for that pixel, which is how a laminate - rock over
   * chitin over pearl - gets painted in a single pass.
   */
  field(x0, y0, x1, y1, fn, o = {}) {
    this._prep(o);
    const base = o._m;
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const r = fn(x + 0.5, y + 0.5);
        if (!r) continue;
        o._m = r.mat ? this._mid(r.mat) : base;
        this._put(x, y, o, r.h || 0, r.tint || 0);
      }
    }
    o._m = base;
    return this;
  }

  // -- surface texture ----------------------------------------------------

  /** Fractal grain across a material: rock, chitin, bark. */
  grain(mat, { freq = 0.25, amp = 0.22, seed = 1, oct = 3, height = 0 } = {}) {
    const m = this._matIndex.get(mat);
    if (!m) return this;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.mat[i] !== m) continue;
        const n = fbmTex(x * freq, y * freq, seed, oct) - 0.5;
        this.tint[i] += n * amp * 2;
        if (height) this.hgt[i] += n * height;
      }
    }
    return this;
  }

  /** Hard speckles: mineral flecks, lichen, freckling. */
  speckle(mat, { density = 0.06, amp = 0.4, seed = 7, size = 1 } = {}) {
    const m = this._matIndex.get(mat);
    if (!m) return this;
    for (let y = 0; y < this.h; y += size) {
      for (let x = 0; x < this.w; x += size) {
        if (hash2i(x, y, seed) > density) continue;
        const t = (hash2i(x, y, seed + 91) - 0.5) * 2 * amp;
        for (let dy = 0; dy < size; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const i = (y + dy) * this.w + (x + dx);
            if (i < 0 || i >= this.mat.length) continue;
            if (this.mat[i] !== m) continue;
            this.tint[i] += t;
          }
        }
      }
    }
    return this;
  }

  /** Ridges along a direction: shell plates, bark, scutes. */
  ridges(mat, { angle = 0, freq = 0.5, amp = 0.3, height = 1.2, seed = 3, warp = 2 } = {}) {
    const m = this._matIndex.get(mat);
    if (!m) return this;
    const cs = Math.cos(angle), sn = Math.sin(angle);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.mat[i] !== m) continue;
        const w = (fbmTex(x * 0.08, y * 0.08, seed, 2) - 0.5) * warp * 6;
        const u = (x * cs + y * sn) + w;
        const s = Math.sin(u * freq);
        this.tint[i] += s * amp;
        this.hgt[i] += s * height;
      }
    }
    return this;
  }

  /** Scale/plate pattern for reptiles and insects. */
  scales(mat, { sx = 4, sy = 3, amp = 0.26, height = 1.0, seed = 5 } = {}) {
    const m = this._matIndex.get(mat);
    if (!m) return this;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.mat[i] !== m) continue;
        const row = Math.floor(y / sy);
        const off = (row & 1) ? sx / 2 : 0;
        const fx = ((x + off) % sx) / sx - 0.5;
        const fy = (y % sy) / sy - 0.5;
        const d = Math.sqrt(fx * fx + fy * fy * 1.6);
        const s = clamp01(1 - d * 2.2);
        const j = hash2i(Math.floor((x + off) / sx), row, seed) * 0.3;
        this.tint[i] += (s - 0.4) * amp + j - 0.15;
        this.hgt[i] += s * height;
      }
    }
    return this;
  }

  /** Lift or drop the height inside a material, e.g. to emboss a plate. */
  emboss(mat, fn) {
    const m = this._matIndex.get(mat);
    if (!m) return this;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.mat[i] !== m) continue;
        this.hgt[i] += fn(x, y) || 0;
      }
    }
    return this;
  }

  /** Smooth the height field so lighting reads as soft form, not stair steps. */
  smoothHeight(passes = 1, strength = 1) {
    const { w, h } = this;
    for (let p = 0; p < passes; p++) {
      const src = this.hgt.slice();
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!this.mat[i]) continue;
          let sum = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const j = i + dy * w + dx;
              if (!this.mat[j]) continue;
              sum += src[j]; n++;
            }
          }
          if (n) this.hgt[i] = lerp(src[i], sum / n, strength);
        }
      }
    }
    return this;
  }

  mirrorX(from = 'left') {
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < Math.floor(w / 2); x++) {
        const a = y * w + x;
        const b = y * w + (w - 1 - x);
        const src = from === 'left' ? a : b;
        const dst = from === 'left' ? b : a;
        this.mat[dst] = this.mat[src];
        this.hgt[dst] = this.hgt[src];
        this.cov[dst] = this.cov[src];
        this.tint[dst] = this.tint[src];
      }
    }
    return this;
  }

  // -- shading ------------------------------------------------------------

  /**
   * Resolve to a canvas.
   * materials: { name: { ramp: [hex...], spec, rim, ao, translucent } }
   */
  resolve(materials, opts = {}) {
    const { w, h } = this;
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;

    const lx = opts.lightX ?? -0.55;
    const ly = opts.lightY ?? -0.72;
    const lz = opts.lightZ ?? 0.42;
    const ll = Math.hypot(lx, ly, lz) || 1;
    const Lx = lx / ll, Ly = ly / ll, Lz = lz / ll;
    const ambient = opts.ambient ?? 0.38;
    const dither = opts.dither ?? 0.85;
    const outlineAlpha = opts.outline ?? 1;

    // cavity term: local height minus blurred height
    const blur = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!this.mat[i]) continue;
        let s = 0, n = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (!this.mat[j]) continue;
            s += this.hgt[j]; n++;
          }
        }
        blur[i] = n ? s / n : this.hgt[i];
      }
    }

    const rampCache = new Map();
    const getRamp = (name) => {
      let r = rampCache.get(name);
      if (r) return r;
      const spec = materials[name] || materials.default;
      r = { rgb: spec.ramp.map(hexToRgb), spec };
      rampCache.set(name, r);
      return r;
    };

    const hAt = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      const i = y * w + x;
      return this.mat[i] ? this.hgt[i] : 0;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = i * 4;
        const m = this.mat[i];
        if (!m) continue;
        const name = this.mats[m];
        const { rgb, spec } = getRamp(name);

        // normal from the height field
        const dhx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5;
        const dhy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5;
        const scaleN = spec.normalScale ?? 0.55;
        let nx = -dhx * scaleN, ny = -dhy * scaleN, nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;

        const diff = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        const rim = Math.pow(1 - clamp01(nz), 2.4) * (spec.rim ?? 0.35);
        const cav = clamp((this.hgt[i] - blur[i]) * (spec.ao ?? 0.09), -0.45, 0.45);
        const spc = spec.spec ? Math.pow(diff, 14) * spec.spec : 0;

        let v = ambient + diff * (spec.diffuse ?? 0.78) + rim + cav + spc + this.tint[i];
        if (spec.translucent) {
          // light bleeding through leaves and membranes
          const back = Math.max(0, -(nx * Lx + ny * Ly)) * spec.translucent;
          v += back;
        }
        v = clamp01(v);

        const n = rgb.length;
        const bay = BAYER8[y & 7][x & 7];
        let idx = Math.floor(v * (n - 1) + (bay - 0.5) * dither);
        idx = clamp(idx, 0, n - 1);
        const c = rgb[idx];
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }

    // outline: dark rim on empty pixels touching the sprite
    if (outlineAlpha > 0) {
      const outCol = opts.outlineColor ? hexToRgb(opts.outlineColor) : null;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (this.mat[i]) continue;
          let src = 0;
          if (x > 0 && this.mat[i - 1]) src = this.mat[i - 1];
          else if (x < w - 1 && this.mat[i + 1]) src = this.mat[i + 1];
          else if (y > 0 && this.mat[i - w]) src = this.mat[i - w];
          else if (y < h - 1 && this.mat[i + w]) src = this.mat[i + w];
          if (!src) continue;
          const spec = materials[this.mats[src]] || materials.default;
          if (spec.noOutline) continue;
          const c = outCol || hexToRgb(spec.outline || spec.ramp[0]);
          const o2 = i * 4;
          d[o2] = c[0] * 0.62; d[o2 + 1] = c[1] * 0.62; d[o2 + 2] = c[2] * 0.62;
          d[o2 + 3] = Math.round(235 * outlineAlpha);
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    return cv;
  }
}

// ---------------------------------------------------------------------------

function bezier(pts, t) {
  if (pts.length === 2) {
    return { x: lerp(pts[0].x, pts[1].x, t), y: lerp(pts[0].y, pts[1].y, t) };
  }
  if (pts.length === 3) {
    const u = 1 - t;
    return {
      x: u * u * pts[0].x + 2 * u * t * pts[1].x + t * t * pts[2].x,
      y: u * u * pts[0].y + 2 * u * t * pts[1].y + t * t * pts[2].y,
    };
  }
  const u = 1 - t;
  return {
    x: u * u * u * pts[0].x + 3 * u * u * t * pts[1].x + 3 * u * t * t * pts[2].x + t * t * t * pts[3].x,
    y: u * u * u * pts[0].y + 3 * u * u * t * pts[1].y + 3 * u * t * t * pts[2].y + t * t * t * pts[3].y,
  };
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToPoly(px, py, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j].x, ay = pts[j].y, bx = pts[i].x, by = pts[i].y;
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy || 1;
    let t = ((px - ax) * vx + (py - ay) * vy) / l2;
    t = clamp01(t);
    best = Math.min(best, Math.hypot(px - (ax + vx * t), py - (ay + vy * t)));
  }
  return best;
}

export { bezier, hash2i, vnoise };
