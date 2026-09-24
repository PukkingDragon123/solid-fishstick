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

let scratch = null;
function scratchFor(vw, vh) {
  if (!scratch || scratch.width !== vw || scratch.height !== vh) {
    scratch = document.createElement('canvas');
    scratch.width = vw; scratch.height = vh;
  }
  return scratch;
}

/**
 * The water pass, over the world and under the interface.
 *
 * `surf(x)` is the screen Y of the surface at a screen X (or -Infinity for a
 * sea with no surface in view), `bed(x)` the screen Y of the bottom there.
 */
export function drawWaterLight(ctx, vw, vh, opts) {
  const { t, wet, surf, bed, camX, camY, zoom } = opts;
  if (wet <= 0.02) return;
  if (!tiles) tiles = bakeCaustics();
  const frame = tiles[Math.floor(t * 9) % FRAMES];
  const z = zoom;

  // ---- 1. depth: everything further down is bluer and darker -------------
  const top = clamp(surf(vw / 2), -vh, vh);
  const fog = ctx.createLinearGradient(0, Math.max(0, top), 0, vh);
  fog.addColorStop(0, `rgba(40,170,196,${0.10 * wet})`);
  fog.addColorStop(0.55, `rgba(16,92,140,${0.26 * wet})`);
  fog.addColorStop(1, `rgba(6,30,70,${0.46 * wet})`);
  ctx.fillStyle = fog;
  ctx.fillRect(0, Math.max(0, top), vw, vh - Math.max(0, top));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // ---- 2. caustics, projected onto the sand -------------------------------
  // The tile is pinned to the world, not the screen, so the web stays on the
  // ground as the camera moves; it is laid down a strip at a time, a band a
  // few pixels deep following the seabed, and faintly up the water column.
  const sc = Math.max(1, Math.round(z * 0.9));
  const T = TILE * sc;
  const offX = ((-camX * z) % T + T) % T, offY = ((-camY * z) % T + T) % T;
  const layer = scratchFor(vw, vh);
  const lg = layer.getContext('2d');
  lg.clearRect(0, 0, vw, vh);
  lg.imageSmoothingEnabled = false;
  for (let y = offY - T; y < vh; y += T) {
    for (let x = offX - T; x < vw; x += T) lg.drawImage(frame, Math.round(x), Math.round(y), T, T);
  }
  const step = 3;
  for (let x = 0; x < vw; x += step) {
    const by = bed(x);
    if (!isFinite(by)) continue;
    const s0 = surf(x);
    // brighter in the shallows, where the waves are close enough to focus
    const depth = clamp01((by - s0) / (vh * 1.1));
    const k = wet * (0.95 - depth * 0.55);
    if (k <= 0.02) continue;
    const band = Math.round(10 * z);
    ctx.globalAlpha = k * 0.85;
    ctx.drawImage(layer, x, Math.round(by - 2), step, band, x, Math.round(by - 2), step, band);
    // and a faint echo of it hanging in the water above the sand
    ctx.globalAlpha = k * 0.06;
    const up = Math.round(Math.min(by - Math.max(s0, 0), 70 * z));
    if (up > 2) ctx.drawImage(layer, x, Math.round(by - up), step, up, x, Math.round(by - up), step, up);
  }

  // ---- 3. light shafts in FRONT of everything -------------------------------
  // The column already puts soft shafts behind the reef; these are the few
  // bright ones that cross in front of the animal, which is what makes the
  // light feel like it is between you and it.
  const sy = Math.max(-10, top);
  for (let i = 0; i < 5; i++) {
    const ph = i * 2.3;
    const x = vw * ((i + 0.3) / 5) + Math.sin(t * 0.13 + ph) * vw * 0.06 - (camX * z * 0.05) % (vw / 5);
    const lean = 0.30 + Math.sin(t * 0.11 + ph) * 0.06;
    const w0 = vw * 0.018, w1 = vw * (0.06 + 0.03 * Math.sin(ph));
    const a = (0.05 + 0.05 * Math.pow(0.5 + 0.5 * Math.sin(t * 0.7 + ph * 1.7), 2)) * wet;
    const len = vh * 0.95;
    const g = ctx.createLinearGradient(x, sy, x + len * lean, sy + len);
    g.addColorStop(0, `rgba(230,255,255,${a * 1.6})`);
    g.addColorStop(0.5, `rgba(180,236,248,${a * 0.6})`);
    g.addColorStop(1, 'rgba(120,200,230,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w0, sy);
    ctx.lineTo(x + w0, sy);
    ctx.lineTo(x + len * lean + w1, sy + len);
    ctx.lineTo(x + len * lean - w1, sy + len);
    ctx.closePath();
    ctx.fill();
  }

  // ---- 4. the surface from underneath: a bright, rippling ceiling ---------
  if (top > -vh && top < vh) {
    for (let x = 0; x < vw; x += 2) {
      const yy = surf(x);
      if (!isFinite(yy) || yy < -4 || yy > vh) continue;
      const r = 0.5 + 0.5 * Math.sin(x * 0.09 + t * 2.1) * Math.sin(x * 0.031 - t * 1.3);
      ctx.globalAlpha = wet * (0.25 + r * 0.55);
      ctx.fillStyle = '#e8fdff';
      ctx.fillRect(x, Math.round(yy), 2, Math.max(1, Math.round(z)));
      // the glow hanging just under it
      ctx.globalAlpha = wet * 0.10 * (0.5 + r);
      ctx.fillStyle = '#7fe0f0';
      ctx.fillRect(x, Math.round(yy) + Math.round(z), 2, Math.round(6 * z));
    }
  }
  ctx.restore();
}
