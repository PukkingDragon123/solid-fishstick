// CRABDEN - the crab, held still.
//
// The genome screen needs a picture of *you*, and the only honest picture is
// the animal itself: the same rig the desert crab is assembled from, in the
// same draw order, posed standing. Nothing here is a drawing of a crab. It is
// the crab, with its clock stopped.
//
// It bakes three plates out of that pose:
//
//   body  - the full colour render, used as a ghost of your own anatomy
//   mask  - the flat silhouette, used to fill and to clip
//   rim   - the outline, grown one ring outward off the mask
//
// Everything is cached per stage and scale, because none of it moves.

import { buildCrab, crabMetrics } from './crabart.js';
import { ik2 } from '../entities/crab.js';
import { lerp, TAU } from '../lib/math.js';

const cache = new Map();

function cv2(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  return { cv, c };
}

function seg(ctx, s, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(s.cv, -s.ox, -s.oy);
  ctx.restore();
}

/** Where a standing foot lands, relative to the rig anchor. */
function stance(m, def, standH) {
  const sp = Math.abs(def.spread || 0.6);
  return {
    x: def.side * m.rx * (1.05 + sp * 0.78),
    y: standH - (def.depth || 0) * m.rx * 0.30,
  };
}

function drawLegs(ctx, rig, m, standH, far, phase) {
  for (const def of rig.sockets.legs) {
    if (!!def.far !== far) continue;
    const art = far ? rig.legArt.far : rig.legArt.near;
    const l1 = art.coxa.len, l2 = art.femur.len, l3 = art.tibia.len;
    const f = stance(m, def, standH);
    // a breath of sway, so the animal reads as alive rather than mounted
    const sw = Math.sin(phase + def.order * 0.9 + (def.side > 0 ? 0 : 1.7)) * m.rx * 0.020;
    const lx = f.x + sw, ly = f.y;
    const side = def.side;
    const ankX = lx - side * l3 * 0.40;
    const ankY = ly - l3 * 0.80;
    const sol = ik2(def.x, def.y, ankX, ankY, l1, l2, side);
    seg(ctx, art.coxa, def.x, def.y, sol.a1);
    seg(ctx, art.femur, sol.kx, sol.ky, sol.a2);
    const fx = sol.kx + Math.cos(sol.a2) * l2, fy = sol.ky + Math.sin(sol.a2) * l2;
    seg(ctx, art.tibia, fx, fy, Math.atan2(ly - fy, lx - fx));
  }
}

function drawClaws(ctx, rig, open) {
  for (const side of [-1, 1]) {
    const art = side > 0 ? rig.claw.near : rig.claw.far;
    const so = rig.sockets.claws.find((q) => q.side === side);
    const raise = open * 0.5;
    ctx.save();
    ctx.translate(so.x, so.y);
    ctx.scale(side, 1);
    const a1 = 0.92 - raise * 0.62;
    const ex = Math.cos(a1) * art.arm.len, ey = Math.sin(a1) * art.arm.len;
    const a2 = a1 - 1.10 - raise * 0.34;
    const fx = ex + Math.cos(a2) * art.fore.len, fy = ey + Math.sin(a2) * art.fore.len;
    const a3 = a2 + 0.18 - raise * 0.22;
    seg(ctx, art.arm, 0, 0, a1);
    seg(ctx, art.fore, ex, ey, a2);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(a3);
    ctx.drawImage(art.palm.cv, -art.palm.ox, -art.palm.oy);
    ctx.save();
    ctx.translate(art.hinge.x, art.hinge.y);
    ctx.rotate(-0.28 - open * 0.55);
    ctx.drawImage(art.dactyl.cv, -art.dactyl.ox, -art.dactyl.oy);
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }
}

function drawFace(ctx, rig, m) {
  const mo = rig.sockets.mouth;
  if (rig.mouth) {
    ctx.save();
    ctx.translate(mo.x, mo.y);
    ctx.drawImage(rig.mouth.cv, -rig.mouth.ox, -rig.mouth.oy);
    ctx.restore();
  }
  const art = rig.eye;
  for (const e of rig.sockets.eyes) {
    const a = -Math.PI / 2 + e.side * 0.34 - 0.036;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(a);
    ctx.drawImage(art.cv, -art.ox, -art.oy);
    ctx.restore();
    const r = art.r;
    const ex = e.x + Math.cos(a) * art.globe, ey = e.y + Math.sin(a) * art.globe;
    ctx.fillStyle = 'rgba(246,242,248,0.95)';
    ctx.fillRect(Math.round(ex - r * 0.34), Math.round(ey - r * 0.36),
      Math.max(1, Math.round(r * 0.42)), Math.max(1, Math.round(r * 0.42)));
  }
}

/** The whole animal, in the order the live one draws it. */
function paintPose(ctx, rig, m, standH, phase) {
  drawLegs(ctx, rig, m, standH, true, phase);
  ctx.drawImage(rig.body.cv, -rig.body.ox, -rig.body.oy);
  drawLegs(ctx, rig, m, standH, false, phase);
  drawFace(ctx, rig, m);
  drawClaws(ctx, rig, 0.34);
}

function alphaBounds(c, w, h) {
  const d = c.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return { x0, y0, x1, y1 };
}

/**
 * Bake the plates for one stage.
 *
 * `sc` is how many plate pixels to a sprite pixel. Everything is returned in
 * plate pixels, with `ox`/`oy` giving where the rig anchor (the hip line,
 * centre of the animal) sits inside them, and `shell` giving where the middle
 * of the carapace's top surface is - which is the point the genome grows from.
 */
export function crabPlates(stage = 'adult', sc = 3) {
  const key = stage + ':' + sc;
  if (cache.has(key)) return cache.get(key);

  const rig = buildCrab(stage);
  const m = rig.m;
  const standH = m.faceH * 0.90 + m.shellW * 0.13;
  const phase = 0.6;

  // generous scratch, then trimmed to what was actually painted
  const W = Math.ceil((m.rx * 5.0 + m.w) * sc);
  const H = Math.ceil((standH * 2.6 + m.h) * sc);
  const a = cv2(W, H);
  const ax = Math.round(W / 2), ay = Math.round(H * 0.46);
  a.c.save();
  a.c.translate(ax, ay);
  a.c.scale(sc, sc);
  paintPose(a.c, rig, m, standH, phase);
  a.c.restore();

  const b = alphaBounds(a.c, W, H);
  const pad = 2;
  const w = b.x1 - b.x0 + 1 + pad * 2, h = b.y1 - b.y0 + 1 + pad * 2;
  const ox = ax - b.x0 + pad, oy = ay - b.y0 + pad;

  const body = cv2(w, h);
  body.c.drawImage(a.cv, b.x0 - pad, b.y0 - pad, w, h, 0, 0, w, h);

  // the flat shape of you
  const mask = cv2(w, h);
  mask.c.drawImage(body.cv, 0, 0);
  mask.c.globalCompositeOperation = 'source-in';
  mask.c.fillStyle = '#ffffff';
  mask.c.fillRect(0, 0, w, h);

  // and one ring grown off it, hollowed out again
  const rimW = Math.max(1, Math.round(sc * 0.8));
  const rim = cv2(w + rimW * 2, h + rimW * 2);
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * TAU;
    rim.c.drawImage(mask.cv, rimW + Math.round(Math.cos(th) * rimW),
      rimW + Math.round(Math.sin(th) * rimW));
  }
  rim.c.globalCompositeOperation = 'destination-out';
  rim.c.drawImage(mask.cv, rimW, rimW);

  // a tinted copy of the shape: the body you read as solid
  const fill = cv2(w, h);
  {
    const g = fill.c.createRadialGradient(ox, oy - m.ry * sc, 0, ox, oy, Math.max(w, h) * 0.62);
    g.addColorStop(0, '#1a1526');
    g.addColorStop(0.42, '#0e0b16');
    g.addColorStop(1, '#05050a');
    fill.c.fillStyle = g;
    fill.c.fillRect(0, 0, w, h);
    fill.c.globalCompositeOperation = 'destination-in';
    fill.c.drawImage(mask.cv, 0, 0);
  }

  // the same render with your own browns taken out of it: an x-ray, so what
  // shows through the shell reads as anatomy and not as a sprite pasted on
  const ghost = cv2(w, h);
  ghost.c.drawImage(body.cv, 0, 0);
  ghost.c.globalCompositeOperation = 'color';
  ghost.c.fillStyle = '#3f8fa8';
  ghost.c.fillRect(0, 0, w, h);
  ghost.c.globalCompositeOperation = 'destination-in';
  ghost.c.drawImage(mask.cv, 0, 0);

  const glow = cv2(w, h);
  glow.c.drawImage(mask.cv, 0, 0);
  glow.c.globalCompositeOperation = 'source-in';
  {
    const g = glow.c.createRadialGradient(ox, oy - m.ry * sc, 0, ox, oy, Math.max(w, h) * 0.55);
    g.addColorStop(0, '#4e7f8c');
    g.addColorStop(0.5, '#22404c');
    g.addColorStop(1, '#0d1a22');
    glow.c.fillStyle = g;
    glow.c.fillRect(0, 0, w, h);
  }

  rim.c.globalCompositeOperation = 'source-in';
  rim.c.fillStyle = '#aff0fb';
  rim.c.fillRect(0, 0, rim.cv.width, rim.cv.height);

  const s0 = rig.shellSurface(0, 0);
  const out = {
    stage, sc, m, rig, w, h, ox, oy,
    body: body.cv, ghost: ghost.cv, mask: mask.cv, fill: fill.cv, glow: glow.cv,
    rim: rim.cv, rimOx: ox + rimW, rimOy: oy + rimW,
    // anchor-relative sprite coordinates of useful landmarks
    shell: { x: s0.x, y: s0.y },
    standH,
    // half-extents of the whole animal in sprite pixels, from the anchor
    ext: { l: ox / sc, r: (w - ox) / sc, t: oy / sc, b: (h - oy) / sc },
  };
  cache.set(key, out);
  return out;
}

export function clearPoseCache() { cache.clear(); }
