// CRABDEN - light in water.
//
// Underwater is where a game gets to show off, and what makes it look like
// the deep rather than a blue filter is the LIGHT: shafts of it coming down
// from a surface you can see rippling overhead, a moving web of caustics
// laid across the sand where the waves focus it, everything further away
// going bluer and dimmer, and the bright things glowing.
//
// All of it is additive light over the scene the world already drew, so none
// of the art has to know it is wet.

import { clamp, clamp01 } from '../lib/math.js';
import { raySprite, RAY_KINDS, surfaceStrip, SURF_FRAMES } from '../art/seascape.js';

// ---------------------------------------------------------------------------
// caustics: a tileable, animated web, baked once

const TILE = 96;
const FRAMES = 12;
let tiles = null;

function bakeCaustics() {
  // A caustic web is the edges of a Voronoi diagram, near enough: light
  // focused into bright lines where cells of the wave meet. Twelve points
  // wander in small circles, and each frame is the edge field of where they
  // are - so the web crawls, which is the whole look.
  const pts = [];
  let s = 1234567;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 12; i++) pts.push({ x: rnd() * TILE, y: rnd() * TILE, r: 4 + rnd() * 7, ph: rnd() * 6.283, sp: rnd() < 0.5 ? 1 : -1 });
  const out = [];
  for (let f = 0; f < FRAMES; f++) {
    const cv = document.createElement('canvas');
    cv.width = TILE; cv.height = TILE;
    const g = cv.getContext('2d');
    const img = g.createImageData(TILE, TILE);
    const a = (f / FRAMES) * Math.PI * 2;
    const P = pts.map((p) => ({ x: p.x + Math.cos(a * p.sp + p.ph) * p.r, y: p.y + Math.sin(a * p.sp + p.ph) * p.r }));
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        let d1 = 1e9, d2 = 1e9;
        for (const p of P) {
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const dx = x - (p.x + ox * TILE), dy = y - (p.y + oy * TILE);
              const d = dx * dx + dy * dy;
              if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
            }
          }
        }
        const e = Math.sqrt(d2) - Math.sqrt(d1);          // 0 on an edge
        let v = clamp01(1 - e / 3.2);
        v = v * v;
        // quantise into three steps so it stays a pixel-art light
        v = v > 0.62 ? 1 : v > 0.3 ? 0.55 : v > 0.12 ? 0.22 : 0;
        const o = (y * TILE + x) * 4;
        img.data[o] = 210; img.data[o + 1] = 250; img.data[o + 2] = 255;
        img.data[o + 3] = Math.round(v * 255);
      }
    }
    g.putImageData(img, 0, 0);
    out.push(cv);
  }
  return out;
}

/** The caustic web for this moment, as a tile CTILE pixels square. */
export const CTILE = TILE;
export function causticFrame(t) {
  if (!tiles) tiles = bakeCaustics();
  return tiles[Math.floor(t * 9) % FRAMES];
}

/**
 * The water pass, over the world and under the interface.
 *
 * `surf(x)` is the screen Y of the surface at a screen X, `bed(x)` the
 * screen Y of the bottom there.
 */
export function drawWaterLight(ctx, vw, vh, opts) {
  const { t, wet, surf, bed, camX, camY, zoom } = opts;
  if (wet <= 0.02) return;
  const frame = causticFrame(t);
  const z = zoom;

  // ---- 1. depth: everything further down is bluer and darker -------------
  const top = clamp(surf(vw / 2), -vh, vh);
  const y0 = Math.max(0, Math.round(top));
  const fog = ctx.createLinearGradient(0, y0, 0, vh);
  fog.addColorStop(0, `rgba(60,190,220,${0.03 * wet})`);
  fog.addColorStop(0.6, `rgba(20,100,160,${0.08 * wet})`);
  fog.addColorStop(1, `rgba(8,36,90,${0.18 * wet})`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, y0, vw, vh - y0);

  ctx.save();
  // ---- 2. caustics, crawling over the sand ---------------------------------
  // The web is pinned to the world, so it stays on the ground as the camera
  // moves; it is laid into a band following the seabed, cut out with a path.
  const sc = Math.max(1, Math.round(z * 0.9));
  const T = CTILE * sc;
  const band = Math.max(10, Math.round(22 * z));
  const step = 6;
  ctx.beginPath();
  let any = false, ymin = vh, ymax = 0;
  for (let x = 0; x <= vw + step; x += step) {
    const by = bed(x);
    const yy = isFinite(by) ? by - 1 : vh + 50;
    if (isFinite(by)) any = true;
    if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy);
  }
  for (let x = vw + step; x >= 0; x -= step) {
    const by = bed(x);
    ctx.lineTo(x, isFinite(by) ? by + band : vh + 50);
  }
  ctx.closePath();
  if (any && ymin < vh) {
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    const depth = clamp01((bed(vw / 2) - top) / (vh * 1.6));
    ctx.globalAlpha = wet * (0.42 - depth * 0.2);
    const offX = ((-camX * z) % T + T) % T, offY = ((-camY * z) % T + T) % T;
    const ya = Math.floor((ymin - offY) / T) * T + offY, yb = Math.min(vh, ymax + band);
    for (let y = ya; y < yb; y += T) {
      for (let x = offX - T; x < vw; x += T) ctx.drawImage(frame, Math.round(x), Math.round(y), T, T);
    }
  }
  ctx.restore();

  // ---- 3. a couple of shafts of light in FRONT of everything ---------------
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sy = Math.max(-30, Math.round(top) - 4);
  const span = vw + 300;
  for (let i = 0; i < 2; i++) {
    const r = raySprite((i * 2 + 1) % RAY_KINDS);
    const ph = i * 3.3;
    let x = (i / 2) * span + 90 + Math.sin(t * 0.1 + ph) * 26 - camX * z * 0.12;
    x = ((x % span) + span) % span - 200;
    ctx.globalAlpha = wet * (0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.3 + ph)));
    ctx.drawImage(r.cv, Math.round(x), sy);
  }
  ctx.restore();

  // ---- 4. the surface from underneath: a bright, rippling ceiling ---------
  if (top > -12 && top < vh) {
    const s = surfaceStrip(Math.floor(t * 5) % SURF_FRAMES);
    const off = ((Math.round(camX * z * 0.4) % s.W) + s.W) % s.W;
    ctx.save();
    ctx.globalAlpha = wet * 0.7;
    for (let x = -off; x < vw; x += s.W) ctx.drawImage(s.cv, x, Math.round(top) - s.line);
    ctx.restore();
  }
}
