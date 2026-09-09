// CRABDEN - low-level pixel drawing primitives.
// All of these assume the target context has image smoothing disabled and is
// working in virtual (low-res) pixels, so coordinates get snapped.

import { TAU, clamp01, lerp, rgba, shadeHex } from '../lib/math.js';

const R = Math.round;

export function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(R(x), R(y), w, h);
}

/** Bresenham-ish thick line. Reads as hand-placed pixels rather than a stroke. */
export function pxLine(ctx, x0, y0, x1, y1, color, w = 1) {
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = w > 1 ? -((w / 2) | 0) : 0;
  for (let guard = 0; guard < 4096; guard++) {
    ctx.fillRect(x0 + o, y0 + o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled ellipse, snapped. */
export function pxEllipse(ctx, cx, cy, rx, ry, color) {
  if (rx < 0.5 || ry < 0.5) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(R(cx) + 0.5, R(cy) + 0.5, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU);
  ctx.fill();
}

export function pxEllipseRot(ctx, cx, cy, rx, ry, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(R(cx) + 0.5, R(cy) + 0.5, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, TAU);
  ctx.fill();
}

/** Ellipse with a 1px darker rim - the classic pixel-art read. */
export function pxBlob(ctx, cx, cy, rx, ry, fill, outline, rot = 0) {
  if (outline) pxEllipseRot(ctx, cx, cy, rx + 1, ry + 1, rot, outline);
  pxEllipseRot(ctx, cx, cy, rx, ry, rot, fill);
}

const BAYER4 = [
  [0.06, 0.53, 0.18, 0.65], [0.78, 0.31, 0.90, 0.43],
  [0.24, 0.71, 0.12, 0.59], [0.96, 0.49, 0.84, 0.37],
];

/** Two-tone dithered ellipse: `hi` on the light side, `lo` elsewhere. */
export function ditherBlob(ctx, cx, cy, rx, ry, lo, hi, lightX = -0.5, lightY = -0.6) {
  pxEllipse(ctx, cx, cy, rx, ry, lo);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(R(cx) + 0.5, R(cy) + 0.5, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = hi;
  const x0 = R(cx - rx - 1), y0 = R(cy - ry - 1);
  const x1 = R(cx + rx + 1), y1 = R(cy + ry + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const d = nx * lightX + ny * lightY;
      // dome-ish falloff so the highlight wraps instead of cutting a diagonal
      const lit = d * 1.7 + (1 - Math.min(1, nx * nx + ny * ny)) * 0.5 + 0.1;
      const thr = BAYER4[y & 3][x & 3];
      if (lit > thr) ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();
}

/** Soft ground shadow. `skew` slides it with the sun. */
export function groundShadow(ctx, x, y, rx, ry, alpha, skewX = 0, skewY = 0) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = '#221a12';
  ctx.beginPath();
  ctx.ellipse(R(x + skewX) + 0.5, R(y + skewY) + 0.5, Math.max(0.6, rx), Math.max(0.4, ry), 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Analytic 2-bone IK. Returns the elbow/knee position. */
export function ik2(ax, ay, tx, ty, l1, l2, flip = 1) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.001;
  const min = Math.abs(l1 - l2) + 0.001;
  if (d > max) { const s = max / d; dx *= s; dy *= s; d = max; }
  if (d < min) { const s = min / (d || 0.0001); dx *= s; dy *= s; d = min; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  return {
    x: ax + ux * a - uy * h * flip,
    y: ay + uy * a + ux * h * flip,
    tx: ax + dx, ty: ay + dy,
  };
}

/** Draw a 2-segment limb with tapering thickness. */
export function limb(ctx, ax, ay, jx, jy, bx, by, w1, w2, color, outline) {
  if (outline) {
    pxLine(ctx, ax, ay, jx, jy, outline, w1 + 2);
    pxLine(ctx, jx, jy, bx, by, outline, w2 + 2);
  }
  pxLine(ctx, ax, ay, jx, jy, color, w1);
  pxLine(ctx, jx, jy, bx, by, color, w2);
}

/** A tapered polygon tail/tentacle following a list of points. */
export function taper(ctx, pts, w0, w1, color, outline) {
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1);
    const w = Math.max(1, Math.round(lerp(w0, w1, t)));
    if (outline) pxLine(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, outline, w + 2);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1);
    const w = Math.max(1, Math.round(lerp(w0, w1, t)));
    pxLine(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, color, w);
  }
}

/** Radial glow, additive. Used on the light layer and for water organs. */
export function glow(ctx, x, y, r, color, alpha = 1) {
  if (r <= 0 || alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.45, rgba(color, alpha * 0.45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Small pixel star / sparkle. */
export function sparkle(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  const R2 = Math.round;
  ctx.fillRect(R2(x - s), R2(y), s * 2 + 1, 1);
  ctx.fillRect(R2(x), R2(y - s), 1, s * 2 + 1);
}

/** Chunky rounded panel used across the UI. */
export function panel(ctx, x, y, w, h, fill, border, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, w, h - 2);
  if (border) {
    ctx.fillStyle = border;
    ctx.fillRect(x + 1, y, w - 2, 1);
    ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
    ctx.fillRect(x, y + 1, 1, h - 2);
    ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
    ctx.fillRect(x + 1, y + 1, 1, 1);
    ctx.fillRect(x + w - 2, y + 1, 1, 1);
    ctx.fillRect(x + 1, y + h - 2, 1, 1);
    ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
  }
  if (opts.highlight) {
    ctx.fillStyle = opts.highlight;
    ctx.fillRect(x + 2, y + 1, w - 4, 1);
  }
}

/** Horizontal bar with a pixel border. */
export function bar(ctx, x, y, w, h, t, fill, back, border, opts = {}) {
  x = R(x); y = R(y); w = R(w); h = R(h);
  if (border) { ctx.fillStyle = border; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); }
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * clamp01(t));
  if (fw > 0) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, fw, h);
    if (opts.gloss) {
      ctx.fillStyle = shadeHex(fill, 0.3);
      ctx.fillRect(x, y, fw, 1);
    }
  }
  if (opts.ghost !== undefined && opts.ghost > t) {
    ctx.fillStyle = rgba('#ffffff', 0.25);
    const gw = Math.round(w * clamp01(opts.ghost));
    ctx.fillRect(x + fw, y, gw - fw, h);
  }
}

/** Dashed selection ring, rotating. */
export function selectionRing(ctx, x, y, r, color, t, segments = 12) {
  ctx.fillStyle = color;
  for (let i = 0; i < segments; i++) {
    if (i % 2) continue;
    const a = (i / segments) * TAU + t;
    const px2 = x + Math.cos(a) * r;
    const py2 = y + Math.sin(a) * r * 0.55;
    ctx.fillRect(R(px2), R(py2), 1, 1);
    const a2 = a + 0.13;
    ctx.fillRect(R(x + Math.cos(a2) * r), R(y + Math.sin(a2) * r * 0.55), 1, 1);
  }
}

/** Water surface puddle with animated rim. */
export function puddle(ctx, x, y, r, t, colDeep, colMid, colRim) {
  const wob = Math.sin(t * 1.7) * 0.5;
  pxEllipse(ctx, x, y, r + wob, r * 0.55 + wob * 0.4, colRim);
  pxEllipse(ctx, x, y, r - 1, r * 0.5, colMid);
  pxEllipse(ctx, x - r * 0.15, y - r * 0.08, r * 0.6, r * 0.28, colDeep);
  // glint
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const gx = x + Math.sin(t * 0.9) * r * 0.3;
  ctx.fillRect(R(gx), R(y - r * 0.22), Math.max(1, R(r * 0.35)), 1);
}
