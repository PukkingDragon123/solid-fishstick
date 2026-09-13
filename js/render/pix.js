// CRABDEN - round things, drawn square.
//
// Everything in this game is painted on a grid: the crab, the plants, the
// letters, the sand. The one thing that kept escaping the grid was circles.
// A glow round an eye, the sun in the sky, a ring off a splash - those were
// all going through the canvas arc/ellipse/radial-gradient path, which is
// smooth, anti-aliased and continuous, and next to a dithered pixel sprite it
// reads as a sticker somebody put on the screen.
//
// So: no arcs anywhere that the world can see. These draw the same shapes out
// of square pixels, on the same grid the sprites are on, with an ordered
// dither on the soft edges instead of an alpha ramp. A pixel here is `p`
// screen pixels - pass the camera zoom and a disc in the world snaps to the
// world's own grid, which is what stops it crawling when the camera moves.

import { clamp01 } from '../lib/math.js';

// The same 4x4 ordered matrix the sprite painter quantises with, so a glow
// breaks up into exactly the pattern the art is already made of.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

/** The pixel size to snap to: one world pixel, never smaller than a screen one. */
export function pxSize(zoom) { return Math.max(1, Math.round(zoom || 1)); }

/**
 * A filled disc on the pixel grid. `soft` fades the last ring or two with the
 * dither rather than with alpha, which is what keeps it looking painted.
 */
export function pxDisc(ctx, cx, cy, r, color, opts = {}) {
  const p = opts.p || 1;
  if (r <= 0) return;
  const soft = opts.soft || 0;
  // snap the centre to the grid so the disc does not crawl as the camera moves
  const gx = Math.round(cx / p) * p;
  const gy = Math.round(cy / p) * p;
  const n = Math.ceil(r / p);
  ctx.fillStyle = color;
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const d = Math.hypot(i, j) * p;
      if (d > r) continue;
      if (soft > 0 && d > r - soft) {
        // the rim is dithered out instead of faded out
        const k = 1 - (d - (r - soft)) / soft;
        const th = BAYER4[(j + 64) & 3][(i + 64) & 3];
        if (k < th) continue;
      }
      ctx.fillRect(gx + i * p, gy + j * p, p, p);
    }
  }
}

/** The same, squashed. Shadows and splash rings are ellipses, not circles. */
export function pxEllipse(ctx, cx, cy, rx, ry, color, opts = {}) {
  const p = opts.p || 1;
  if (rx <= 0 || ry <= 0) return;
  const soft = opts.soft || 0;
  const gx = Math.round(cx / p) * p;
  const gy = Math.round(cy / p) * p;
  const ni = Math.ceil(rx / p), nj = Math.ceil(ry / p);
  ctx.fillStyle = color;
  for (let j = -nj; j <= nj; j++) {
    for (let i = -ni; i <= ni; i++) {
      const d = Math.hypot((i * p) / rx, (j * p) / ry);
      if (d > 1) continue;
      if (soft > 0 && d > 1 - soft) {
        const k = 1 - (d - (1 - soft)) / soft;
        const th = BAYER4[(j + 64) & 3][(i + 64) & 3];
        if (k < th) continue;
      }
      ctx.fillRect(gx + i * p, gy + j * p, p, p);
    }
  }
}

/** A hollow ring, one pixel band wide by default. */
export function pxRing(ctx, cx, cy, rx, ry, color, opts = {}) {
  const p = opts.p || 1;
  const thick = Math.max(p, opts.thick || p);
  const gx = Math.round(cx / p) * p;
  const gy = Math.round(cy / p) * p;
  const ni = Math.ceil((rx + thick) / p), nj = Math.ceil((ry + thick) / p);
  ctx.fillStyle = color;
  for (let j = -nj; j <= nj; j++) {
    for (let i = -ni; i <= ni; i++) {
      const x = i * p, y = j * p;
      const dOut = Math.hypot(x / (rx + thick), y / (ry + thick));
      const dIn = Math.hypot(x / rx, y / ry);
      if (dOut > 1 || dIn < 1) continue;
      ctx.fillRect(gx + x, gy + y, p, p);
    }
  }
}

/**
 * A wedge of a ring - a progress dial, drawn as pixels on the same grid.
 * Angles are the canvas ones: 0 is east, positive is clockwise.
 */
export function pxArc(ctx, cx, cy, r, a0, a1, color, opts = {}) {
  const p = opts.p || 1;
  const thick = Math.max(p, opts.thick || p);
  if (a1 <= a0) return;
  // an arc can be squashed too - the rim of a pool is an ellipse, not a circle
  const rx = opts.rx ?? r, ry = opts.ry ?? r;
  // step along the arc in whole pixels so nothing is skipped and nothing is
  // drawn twice
  const steps = Math.max(6, Math.ceil((a1 - a0) * Math.max(rx, ry) / p) * 2);
  ctx.fillStyle = color;
  const seen = new Set();
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    for (let w = 0; w < thick; w += p) {
      const k = (Math.max(rx, ry) - thick / 2 + w) / Math.max(rx, ry);
      const x = Math.round((cx + Math.cos(a) * rx * k) / p) * p;
      const y = Math.round((cy + Math.sin(a) * ry * k) / p) * p;
      const key = x * 65536 + y;
      if (seen.has(key)) continue;
      seen.add(key);
      ctx.fillRect(x, y, p, p);
    }
  }
}

/**
 * A glow: concentric bands, each a flat alpha, with the boundaries dithered
 * into each other. No gradient anywhere. `steps` is how many bands - three is
 * usually enough and four is as many as reads as deliberate.
 */
export function pxGlow(ctx, cx, cy, r, color, alpha = 0.5, opts = {}) {
  const p = opts.p || 1;
  const steps = opts.steps || 3;
  const prev = ctx.globalAlpha;
  for (let s = steps; s >= 1; s--) {
    const k = s / steps;
    ctx.globalAlpha = prev * alpha * Math.pow(1 - k, 1.2) * 1.4;
    if (ctx.globalAlpha <= 0.01) continue;
    pxDisc(ctx, cx, cy, r * k, color, { p, soft: r * k * 0.45 });
  }
  ctx.globalAlpha = prev;
}

/**
 * A soft blob for dust, mist and gore - one flat colour, dithered out at the
 * edge so it sits in the sand instead of on top of it.
 */
export function pxBlob(ctx, cx, cy, r, color, opts = {}) {
  pxDisc(ctx, cx, cy, r, color, { p: opts.p || 1, soft: opts.soft ?? r * 0.7 });
}

/**
 * A line of pixels between two points - Bresenham on the grid, so a jet or a
 * tether is made of the same squares as everything else instead of being a
 * stroked path.
 */
export function pxLine(ctx, x0, y0, x1, y1, color, opts = {}) {
  const p = opts.p || 1;
  ctx.fillStyle = color;
  const ax = Math.round(x0 / p), ay = Math.round(y0 / p);
  const bx = Math.round(x1 / p), by = Math.round(y1 / p);
  let dx = Math.abs(bx - ax), dy = -Math.abs(by - ay);
  let sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy, x = ax, y = ay;
  const thick = Math.max(1, opts.thick || 1);
  for (let guard = 0; guard < 4096; guard++) {
    ctx.fillRect(x * p, y * p, p * thick, p * thick);
    if (x === bx && y === by) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * A quadratic curve as pixels - the same shape ctx.quadraticCurveTo would
 * give, walked and stamped instead of stroked.
 */
export function pxCurve(ctx, x0, y0, cx, cy, x1, y1, color, opts = {}) {
  const p = opts.p || 1;
  const steps = opts.steps || 18;
  let px = x0, py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    pxLine(ctx, px, py, x, y, color, { p, thick: opts.thick });
    px = x; py = y;
  }
}

/**
 * A full-screen wash that is still made of pixels: a flat colour whose
 * strength falls off toward the middle of the frame, dithered in bands. Used
 * for the mode grades, where a canvas gradient would be the one smooth thing
 * on an otherwise dithered screen.
 */
const vignettes = new Map();

/**
 * A full-screen wash that is still made of pixels: a flat colour whose
 * strength falls off toward the middle of the frame, dithered in bands. Used
 * for the mode grades, where a canvas gradient would be the one smooth thing
 * on an otherwise dithered screen.
 *
 * The bands are baked into an offscreen canvas once per (size, colour, shape)
 * and then blitted, because building one out of forty thousand fillRects
 * every frame costs more than the whole rest of the renderer put together.
 * `amount` scales the baked alphas on the way out.
 */
export function pxVignette(ctx, W, H, color, amount, opts = {}) {
  if (amount <= 0.004) return;
  const p = opts.p || 2;
  const steps = opts.steps || 5;
  const inner = opts.inner ?? 0.42;
  const cyf = opts.cy ?? 0.5;
  const key = `${W}x${H}:${color}:${p}:${steps}:${inner}:${cyf}`;
  let cv = vignettes.get(key);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const cx = W / 2, cy = H * cyf;
    const R = Math.hypot(W / 2, H / 2);
    g.fillStyle = color;
    for (let y = 0; y < H; y += p) {
      for (let x = 0; x < W; x += p) {
        const d = Math.hypot((x + p / 2 - cx) / R, (y + p / 2 - cy) / R);
        const k = clamp01((d - inner) / (1 - inner));
        if (k <= 0) continue;
        // quantise into bands, then break each boundary with the dither so
        // the steps do not read as rings
        const f = k * steps;
        let band = Math.floor(f) / steps;
        const th = BAYER4[(y / p) & 3][(x / p) & 3];
        if (f % 1 > th) band += 1 / steps;
        if (band <= 0) continue;
        g.globalAlpha = Math.min(1, band);
        g.fillRect(x, y, p, p);
      }
    }
    if (vignettes.size > 8) vignettes.clear();
    vignettes.set(key, cv);
  }
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * Math.min(1, amount);
  ctx.drawImage(cv, 0, 0);
  ctx.globalAlpha = prev;
}
