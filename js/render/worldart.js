// CRABDEN - drawing for plants, scenery and landmarks.
// Plants are grown from their `growth` value, so a seedling and a mature bush
// are the same code at different scales, and everything leans in the wind.

import { TAU, clamp01, lerp, mixHex, shadeHex, rgba, Rng } from '../lib/math.js';
import {
  px, pxLine, pxEllipse, pxEllipseRot, pxBlob, ditherBlob, groundShadow, taper, sparkle,
  puddle,
} from './sprites.js';
import { PLANTS } from '../world/regions.js';
import { drawText } from '../lib/font.js';
const R = Math.round;

let _scratch = null;
/** Shared offscreen layer, resized on demand. */
function scratch(w, h) {
  if (!_scratch) _scratch = document.createElement('canvas');
  if (_scratch.width !== w || _scratch.height !== h) {
    _scratch.width = w; _scratch.height = h;
    _scratch.getContext('2d').imageSmoothingEnabled = false;
  }
  return _scratch;
}

/** Integer hash with properly mixed low bits - needed for grid jitter. */
function ihash(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

// ---------------------------------------------------------------------------
// moisture overlay
// ---------------------------------------------------------------------------

export function drawWetGround(ctx, cam, game) {
  const cells = game.eco.cellsInBounds(cam.bounds(32));
  if (!cells.length) return;
  const z = cam.zoom;

  // Damp sand is the same sand, darker and cooler. Multiply keeps the dune
  // shading underneath instead of pasting flat discs over it.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const c of cells) {
    // deterministic jitter so the 16px grid stops reading as a grid
    const h = ihash(c.gx, c.gy);
    const jx = ((h & 255) / 255 - 0.5) * 11;
    const jy = (((h >>> 8) & 255) / 255 - 0.5) * 11;
    const s = cam.worldToScreen(c.x + jx, c.y + jy);
    const m = clamp01(c.m);
    const r = (11 + m * 6) * z;
    ctx.globalAlpha = 0.1 + m * 0.26;
    ctx.fillStyle = '#a8b4ba';
    ctx.beginPath();
    ctx.ellipse(R(s.x) + 0.5, R(s.y) + 0.5, r, r * 0.66, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // Standing water. Drawn opaque into a scratch layer first, then composited
  // once - otherwise overlapping blobs stack their alpha and the 16px cell
  // grid shows through as a quilt.
  let anyPool = false;
  for (const c of cells) { if (c.m >= 0.7) { anyPool = true; break; } }
  if (anyPool) {
    const sc = scratch(cam.vw, cam.vh);
    const sx2 = sc.getContext('2d');
    sx2.clearRect(0, 0, cam.vw, cam.vh);
    for (const c of cells) {
      if (c.m < 0.7) continue;
      const h = ihash(c.gx - 9, c.gy + 3);
      const jx = ((h & 255) / 255 - 0.5) * 9;
      const jy = (((h >>> 8) & 255) / 255 - 0.5) * 9;
      const grow = clamp01((c.m - 0.7) * 5);
      const rr = (7 + grow * (5 + ((h >>> 16) & 63) / 63 * 5)) * z;
      const s = cam.worldToScreen(c.x + jx, c.y + jy);
      // depth is carried by the colour of each opaque blob, not by a second
      // layer of discs - stacked discs re-introduce the grid
      const wet = game.world.wetColorAt(c.x, c.y);
      sx2.fillStyle = mixHex(wet, shadeHex(wet, -0.32), clamp01((c.m - 0.76) / 0.24));
      sx2.beginPath();
      sx2.ellipse(R(s.x) + 0.5, R(s.y) + 0.5, rr, rr * 0.72, 0, 0, TAU);
      sx2.fill();
    }
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.drawImage(sc, 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  for (const c of cells) {
    if (c.m < 0.82) continue;
    const h = ihash(c.gx + 31, c.gy - 17);
    if (h % 6 !== 0) continue;
    const s = cam.worldToScreen(c.x, c.y);
    const t = game.time * 0.8 + (h & 63) * 0.1;
    ctx.fillStyle = rgba('#ffffff', 0.28 + Math.sin(t * 2.1) * 0.22);
    ctx.fillRect(R(s.x + Math.sin(t) * 4 * z), R(s.y - 1), Math.max(1, R(3 * z)), 1);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// plants
// ---------------------------------------------------------------------------

export function drawPlantShadow(ctx, cam, weather, p) {
  const s = cam.worldToScreen(p.x, p.y);
  const sh = weather.shadow;
  const z = cam.zoom;
  const r = p.r * z;
  groundShadow(ctx, s.x + sh.x * z * 0.5, s.y + sh.y * z * 0.4, r * 0.9, r * 0.45,
    sh.strength * 0.45 * (p.dead ? 0.5 : 1));
}

export function drawPlant(ctx, cam, game, p) {
  const spec = PLANTS[p.type];
  const s = cam.worldToScreen(p.x, p.y);
  const z = cam.zoom;
  const g = clamp01(p.growth);
  const w = game.weather.windVec();
  const sway = Math.sin(game.time * 1.6 + p.sway) * w.s * (0.25 + spec.tier * 0.2);
  const cols = p.dead
    ? spec.colors.map((c) => mixHex(c, '#6b5a45', 0.72))
    : spec.colors.map((c) => p.health < 0.6 ? mixHex(c, '#9a8a5a', (1 - p.health) * 0.7) : c);

  const fn = PLANT_ART[p.type] || PLANT_ART.moss;
  fn(ctx, s.x, s.y, p.r * (p.vary || 1) * z, g, cols, sway, z, game, p);

  if (p.type === 'berry' && p.berries >= 1 && !p.dead) {
    // ripe marker
    if (Math.floor(game.time * 2) % 2 === 0) {
      sparkle(ctx, s.x + 3 * z, s.y - p.r * z * 1.2, 1, '#ffe9a0');
    }
  }
}

const PLANT_ART = {};

PLANT_ART.moss = (ctx, x, y, r, g, c, sway, z) => {
  const n = 3 + Math.floor(g * 5);
  const rng = new Rng(Math.round(x * 13 + y * 7));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.float(0.4);
    const d = rng.float(0.2, 1) * r;
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d * 0.55;
    const br = Math.max(1, r * rng.float(0.28, 0.5) * (0.4 + g * 0.6));
    pxEllipse(ctx, bx, by + 1, br + 0.5, br * 0.6 + 0.5, c[0]);
    pxEllipse(ctx, bx, by, br, br * 0.6, c[1]);
    px(ctx, bx - br * 0.3, by - br * 0.3, c[2], Math.max(1, R(z * 0.6)), Math.max(1, R(z * 0.4)));
  }
};

PLANT_ART.berry = (ctx, x, y, r, g, c, sway, z, game, p) => {
  const h = r * (0.9 + g * 0.5);
  const rng = new Rng(p.seed);
  // one short woody stub at the base
  pxLine(ctx, x, y, x + sway * 0.8, y - h * 0.35, c[0], Math.max(1, R(z * 0.9)));
  // three overlapping clumps of leaf, so no two bushes read the same
  const lobes = 3;
  for (let i = 0; i < lobes; i++) {
    const a = rng.float(TAU);
    const d = rng.float(0, 0.34) * r;
    const lr = r * rng.float(0.46, 0.66);
    ditherBlob(ctx,
      x + sway * 1.5 + Math.cos(a) * d,
      y - h * 0.55 + Math.sin(a) * d * 0.6,
      lr, lr * 0.78, c[0], c[1], -0.4, -0.75);
  }
  // berries
  if (g > 0.55) {
    const n = 2 + Math.round(p.berries || 0);
    for (let i = 0; i < n; i++) {
      const a = rng.float(TAU);
      const d = rng.float(0.15, 0.8) * r;
      px(ctx, x + sway * 1.5 + Math.cos(a) * d, y - h * 0.55 + Math.sin(a) * d * 0.65,
        c[2], Math.max(1, R(z)), Math.max(1, R(z)));
    }
  }
};

PLANT_ART.palm = (ctx, x, y, r, g, c, sway, z, game, p) => {
  const h = r * (1.55 + g * 1.0);
  const tipX = x + sway * 3;
  const tipY = y - h;
  const trunk = shadeHex(c[0], -0.12);
  const trunkDark = shadeHex(c[0], -0.45);

  // trunk: leans with the wind, thins toward the crown
  const pts = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push({ x: lerp(x, tipX, t * t), y: lerp(y, tipY, t) });
  }
  taper(ctx, pts, Math.max(2, R(z * 1.5)), Math.max(1, R(z)), trunk, trunkDark);
  // segment rings
  ctx.fillStyle = trunkDark;
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    ctx.fillRect(R(lerp(x, tipX, t * t) - z), R(lerp(y, tipY, t)), Math.max(1, R(z * 2)), 1);
  }

  // fronds: arc out from the crown then fall
  const n = 5 + (p.seed % 3);
  const fl = r * (0.72 + g * 0.5);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + 0.35 + (i / (n - 1)) * (Math.PI - 0.7) + sway * 0.18;
    const fp = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      fp.push({
        x: tipX + Math.cos(a) * fl * t,
        y: tipY + Math.sin(a) * fl * t * 0.75 + t * t * fl * 0.8,
      });
    }
    taper(ctx, fp, Math.max(2, R(z * 1.1)), 1, i % 2 ? c[1] : c[2], shadeHex(c[1], -0.45));
  }
  // crown
  pxEllipse(ctx, tipX, tipY, r * 0.26 + 1, r * 0.2 + 1, trunkDark);
  pxEllipse(ctx, tipX, tipY, r * 0.26, r * 0.2, c[1]);
  // a couple of dates once it is grown
  if (g > 0.85) {
    for (let i = -1; i <= 1; i += 2) {
      px(ctx, tipX + i * r * 0.2, tipY + r * 0.22, '#c98a3a', Math.max(1, R(z)), Math.max(1, R(z)));
    }
  }
};

PLANT_ART.waterwood = (ctx, x, y, r, g, c, sway, z, game, p) => {
  const h = r * (2.4 + g * 1.5);
  const tipX = x + sway * 3;
  const tipY = y - h;
  taper(ctx, [{ x, y }, { x: lerp(x, tipX, 0.5), y: y - h * 0.5 }, { x: tipX, y: tipY }],
    Math.max(3, R(z * 2.2)), Math.max(2, R(z * 1.2)), c[0], shadeHex(c[0], -0.45));
  // weeping canopy
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const fl = r * (1.1 + g * 0.8);
    const ex = tipX + Math.cos(a) * fl;
    const ey = tipY + Math.sin(a) * fl * 0.5;
    const fp = [{ x: tipX, y: tipY }, { x: ex, y: ey }, { x: ex + sway, y: ey + fl * 0.7 }];
    taper(ctx, fp, Math.max(2, R(z)), 1, c[1], shadeHex(c[1], -0.4));
    px(ctx, ex + sway, ey + fl * 0.7, c[2], Math.max(1, R(z)), Math.max(1, R(z)));
  }
  ditherBlob(ctx, tipX, tipY, r * 0.9, r * 0.6, c[1], c[2], -0.5, -0.7);
  // it drips
  if (g > 0.9 && Math.random() < 0.04) {
    game.particles.spawn('drop', x + (Math.random() - 0.5) * r * 2, y - h * 0.6, {
      color: '#9fe4f4', life: 0.9, vz: 0, grav: 60, glow: 3, layer: 'over',
      onLand: () => game.eco.addWater(x, y, 1.2, 14),
    });
  }
};

PLANT_ART.cactus = (ctx, x, y, r, g, c, sway, z) => {
  const h = r * (1.2 + g * 0.8);
  pxEllipseRot(ctx, x, y - h * 0.5, r * 0.6 + 1, h * 0.55 + 1, 0, shadeHex(c[0], -0.4));
  ditherBlob(ctx, x, y - h * 0.5, r * 0.6, h * 0.55, c[0], c[1], -0.5, -0.6);
  // ridges + spines
  ctx.fillStyle = shadeHex(c[0], -0.3);
  for (let i = -1; i <= 1; i++) ctx.fillRect(R(x + i * r * 0.3), R(y - h), 1, R(h));
  ctx.fillStyle = c[2];
  for (let i = 0; i < 6; i++) {
    const yy = y - h * (0.15 + i * 0.15);
    px(ctx, x - r * 0.65, yy, c[2], 1, 1);
    px(ctx, x + r * 0.65, yy, c[2], 1, 1);
  }
  if (g > 0.9) px(ctx, x, y - h - 1, '#e8d05a', Math.max(1, R(z)), Math.max(1, R(z)));
};

PLANT_ART.reefweed = (ctx, x, y, r, g, c, sway, z) => {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + sway * 0.2;
    const fl = r * (1.1 + g * 0.9);
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      pts.push({ x: x + Math.cos(a) * fl * t + Math.sin(t * 3) * 1.5, y: y + Math.sin(a) * fl * t });
    }
    taper(ctx, pts, Math.max(2, R(z * 1.3)), 1, i % 2 ? c[0] : c[1], shadeHex(c[0], -0.4));
  }
  pxEllipse(ctx, x, y, r * 0.5, r * 0.24, c[2]);
};

PLANT_ART.glasslily = (ctx, x, y, r, g, c, sway, z) => {
  const h = r * (1.3 + g);
  pxLine(ctx, x, y, x + sway * 2, y - h, c[0], Math.max(1, R(z)));
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + sway * 0.5;
    const pr = r * (0.5 + g * 0.5);
    ctx.fillStyle = i % 2 ? c[1] : c[2];
    ctx.beginPath();
    ctx.moveTo(R(x + sway * 2), R(y - h));
    ctx.lineTo(R(x + sway * 2 + Math.cos(a) * pr), R(y - h + Math.sin(a) * pr * 0.6));
    ctx.lineTo(R(x + sway * 2 + Math.cos(a + 0.5) * pr * 0.6), R(y - h + Math.sin(a + 0.5) * pr * 0.4));
    ctx.closePath();
    ctx.fill();
  }
  if (g > 0.8) sparkle(ctx, x + sway * 2, y - h, 1, '#ffffff');
};

PLANT_ART.ironvine = (ctx, x, y, r, g, c, sway, z) => {
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push({ x: x - r + t * r * 2, y: y - Math.sin(t * Math.PI * 1.5) * r * 0.7 * g + sway });
  }
  taper(ctx, pts, Math.max(2, R(z * 1.2)), Math.max(1, R(z)), c[0], shadeHex(c[0], -0.4));
  for (let i = 1; i < 6; i++) {
    const pt = pts[i];
    pxEllipseRot(ctx, pt.x, pt.y - 2, r * 0.3, r * 0.16, i * 0.7, c[1]);
    if (g > 0.75 && i % 2) px(ctx, pt.x, pt.y - 3, c[2], Math.max(1, R(z)), Math.max(1, R(z)));
  }
};

PLANT_ART.saltgrass = (ctx, x, y, r, g, c, sway, z) => {
  const n = 5 + Math.floor(g * 4);
  const rng = new Rng(Math.round(x * 19 + y * 23));
  for (let i = 0; i < n; i++) {
    const ox = rng.float(-r * 0.8, r * 0.8);
    const h = r * rng.float(0.8, 1.6) * (0.4 + g * 0.6);
    pxLine(ctx, x + ox, y, x + ox + sway * 3, y - h, c[0], 1);
    px(ctx, x + ox + sway * 3, y - h, c[2], 1, 1);
  }
  pxEllipse(ctx, x, y, r * 0.6, r * 0.2, rgba(c[1], 0.5));
};

PLANT_ART.ashfern = (ctx, x, y, r, g, c, sway, z) => {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.55 + sway * 0.25;
    const fl = r * (1 + g);
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push({ x: x + Math.cos(a) * fl * t, y: y + Math.sin(a) * fl * t + t * t * fl * 0.3 });
    }
    taper(ctx, pts, Math.max(2, R(z)), 1, i % 2 ? c[1] : c[2], shadeHex(c[0], -0.3));
    // leaflets
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      const bx = x + Math.cos(a) * fl * t;
      const by = y + Math.sin(a) * fl * t + t * t * fl * 0.3;
      px(ctx, bx - 2, by, c[1], 1, 1);
      px(ctx, bx + 2, by, c[1], 1, 1);
    }
  }
};

// ---------------------------------------------------------------------------
// scenery
// ---------------------------------------------------------------------------

export function drawDecorShadow(ctx, cam, weather, d) {
  const s = cam.worldToScreen(d.x, d.y);
  const sh = weather.shadow;
  const z = cam.zoom;
  groundShadow(ctx, s.x + sh.x * z * 0.8, s.y + sh.y * z * 0.6,
    d.r * z * 1.1, d.r * z * 0.5, sh.strength * 0.5);
}

export function drawDecor(ctx, cam, game, d) {
  const s = cam.worldToScreen(d.x, d.y);
  const z = cam.zoom;
  const region = game.currentRegion;
  const pal = region.pal;
  const w = game.weather.windVec();
  const fn = DECOR_ART[d.kind];
  if (fn) fn(ctx, s.x, s.y, d, z, pal, game, w);
}

const DECOR_ART = {};

DECOR_ART.rock = (ctx, x, y, d, z, pal) => {
  const r = d.r * z;
  ditherBlob(ctx, x, y - r * 0.3, r, r * 0.8, pal.rock, shadeHex(pal.rock, 0.22), -0.5, -0.7);
  pxEllipseRot(ctx, x, y - r * 0.3, r + 1, r * 0.8 + 1, 0, rgba(shadeHex(pal.rock, -0.5), 0));
};

DECOR_ART.boulder = (ctx, x, y, d, z, pal) => {
  const r = d.r * z;
  pxEllipse(ctx, x, y - r * 0.4, r + 1, r * 0.9 + 1, shadeHex(pal.rock, -0.45));
  ditherBlob(ctx, x, y - r * 0.45, r, r * 0.88, pal.rock, shadeHex(pal.rock, 0.28), -0.55, -0.7);
  ctx.fillStyle = shadeHex(pal.rock, -0.3);
  ctx.fillRect(R(x - r * 0.4), R(y - r * 0.6), R(r * 0.5), 1);
};

DECOR_ART.pebbles = (ctx, x, y, d, z, pal) => {
  const rng = new Rng(d.seed);
  for (let i = 0; i < 5; i++) {
    px(ctx, x + rng.float(-d.r, d.r) * z, y + rng.float(-d.r, d.r) * z * 0.5,
      rng.bool() ? pal.detail : pal.rock, Math.max(1, R(z)), Math.max(1, R(z)));
  }
};

DECOR_ART.deadtree = (ctx, x, y, d, z, pal, game, w) => {
  const h = d.h * z;
  const sway = Math.sin(game.time * 1.1 + d.sway) * w.s * 1.4;
  const rng = new Rng(d.seed);
  const trunkTop = { x: x + sway, y: y - h };
  taper(ctx, [{ x, y }, { x: x + sway * 0.4, y: y - h * 0.5 }, trunkTop],
    Math.max(2, R(z * 2)), Math.max(1, R(z)), shadeHex(pal.shadow, 0.15), shadeHex(pal.shadow, -0.3));
  const branches = 3 + rng.int(3);
  for (let i = 0; i < branches; i++) {
    const t = rng.float(0.35, 1);
    const bx = lerp(x, trunkTop.x, t);
    const by = lerp(y, trunkTop.y, t);
    const a = rng.float(-2.6, -0.5);
    const bl = h * rng.float(0.2, 0.45);
    const ex = bx + Math.cos(a) * bl + sway * t;
    const ey = by + Math.sin(a) * bl * 0.9;
    taper(ctx, [{ x: bx, y: by }, { x: ex, y: ey }], Math.max(1, R(z * 1.2)), 1,
      shadeHex(pal.shadow, 0.2), shadeHex(pal.shadow, -0.35));
  }
};

DECOR_ART.bone_rib = (ctx, x, y, d, z, pal) => {
  const h = d.h * z;
  const rng = new Rng(d.seed);
  const lean = rng.float(-0.5, 0.5);
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push({ x: x + Math.sin(t * 1.7) * h * 0.32 * (d.flip ? -1 : 1) + lean * t * 6, y: y - t * h });
  }
  taper(ctx, pts, Math.max(2, R(z * 1.6)), Math.max(1, R(z)), '#e0d8c0', '#8b8270');
};

DECOR_ART.bone_skull = (ctx, x, y, d, z) => {
  const r = d.r * z;
  pxBlob(ctx, x, y - r * 0.4, r, r * 0.75, '#e4dcc4', '#8b8270');
  ctx.fillStyle = '#3a352c';
  ctx.fillRect(R(x - r * 0.5), R(y - r * 0.6), Math.max(1, R(r * 0.3)), Math.max(1, R(r * 0.25)));
  ctx.fillRect(R(x + r * 0.2), R(y - r * 0.6), Math.max(1, R(r * 0.3)), Math.max(1, R(r * 0.25)));
  ctx.fillStyle = '#c9c0a8';
  ctx.fillRect(R(x - r * 0.35), R(y - r * 0.05), Math.max(1, R(r * 0.7)), 1);
};

DECOR_ART.coral = (ctx, x, y, d, z, pal) => {
  const h = d.h * z;
  const rng = new Rng(d.seed);
  const branch = (bx, by, a, len, depth) => {
    if (depth <= 0 || len < 2) return;
    const ex = bx + Math.cos(a) * len;
    const ey = by + Math.sin(a) * len;
    taper(ctx, [{ x: bx, y: by }, { x: ex, y: ey }], Math.max(1, R(z * depth * 0.7)), 1, '#d8cfae', '#8a8168');
    branch(ex, ey, a - rng.float(0.3, 0.8), len * 0.68, depth - 1);
    branch(ex, ey, a + rng.float(0.3, 0.8), len * 0.68, depth - 1);
  };
  branch(x, y, -Math.PI / 2 + rng.float(-0.3, 0.3), h * 0.45, 3);
};

DECOR_ART.ruin_wall = (ctx, x, y, d, z, pal) => {
  const w2 = d.r * z, h = d.h * z;
  const rng = new Rng(d.seed);
  const rows = 3 + rng.int(3);
  for (let r2 = 0; r2 < rows; r2++) {
    const yy = y - (r2 + 1) * (h / rows);
    const ww = w2 * (1 - r2 * 0.12) * rng.float(0.8, 1);
    ctx.fillStyle = r2 % 2 ? shadeHex(pal.rock, -0.15) : shadeHex(pal.rock, 0.05);
    ctx.fillRect(R(x - ww), R(yy), R(ww * 2), Math.max(1, R(h / rows)));
    ctx.fillStyle = shadeHex(pal.rock, -0.4);
    ctx.fillRect(R(x - ww), R(yy), R(ww * 2), 1);
  }
  ctx.fillStyle = shadeHex(pal.rock, -0.35);
  ctx.fillRect(R(x - w2), R(y - 1), R(w2 * 2), 1);
};

DECOR_ART.pillar = (ctx, x, y, d, z, pal) => {
  const h = d.h * z, w2 = d.r * z * 0.5;
  ctx.fillStyle = shadeHex(pal.rock, -0.35);
  ctx.fillRect(R(x - w2 - 1), R(y - h), R(w2 * 2 + 2), R(h));
  ctx.fillStyle = shadeHex(pal.rock, 0.12);
  ctx.fillRect(R(x - w2), R(y - h), R(w2 * 2), R(h));
  ctx.fillStyle = shadeHex(pal.rock, 0.3);
  ctx.fillRect(R(x - w2), R(y - h), Math.max(1, R(w2 * 0.6)), R(h));
  ctx.fillStyle = shadeHex(pal.rock, -0.2);
  for (let i = 1; i < 4; i++) ctx.fillRect(R(x - w2), R(y - h * i / 4), R(w2 * 2), 1);
};

DECOR_ART.car = (ctx, x, y, d, z, pal) => {
  const w2 = d.r * z, h = d.h * z;
  ditherBlob(ctx, x, y - h * 0.4, w2, h * 0.55, '#8a4a30', '#b86a44', -0.5, -0.7);
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(R(x - w2 * 0.5), R(y - h * 0.95), R(w2), Math.max(1, R(h * 0.4)));
  ctx.fillStyle = '#5a7a80';
  ctx.fillRect(R(x - w2 * 0.42), R(y - h * 0.9), R(w2 * 0.85), Math.max(1, R(h * 0.25)));
  ctx.fillStyle = '#241a14';
  ctx.fillRect(R(x - w2 * 0.8), R(y - 2), Math.max(1, R(w2 * 0.4)), 2);
  ctx.fillRect(R(x + w2 * 0.4), R(y - 2), Math.max(1, R(w2 * 0.4)), 2);
};

DECOR_ART.shard = (ctx, x, y, d, z, pal, game) => {
  const h = d.h * z;
  const glint = 0.4 + Math.abs(Math.sin(game.time * 0.7 + d.seed)) * 0.6;
  ctx.fillStyle = rgba('#cfe8f6', 0.75);
  ctx.beginPath();
  ctx.moveTo(R(x), R(y - h));
  ctx.lineTo(R(x + d.r * z * 0.7), R(y));
  ctx.lineTo(R(x - d.r * z * 0.6), R(y));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', glint * 0.8);
  ctx.fillRect(R(x - 1), R(y - h + 1), 1, Math.max(1, R(h * 0.6)));
};

DECOR_ART.crust = (ctx, x, y, d, z, pal) => {
  const r = d.r * z;
  const rng = new Rng(d.seed);
  ctx.fillStyle = rgba(pal.crest, 0.7);
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    const rr = r * rng.float(0.7, 1.1);
    const pxx = x + Math.cos(a) * rr, pyy = y + Math.sin(a) * rr * 0.5;
    if (i === 0) ctx.moveTo(R(pxx), R(pyy)); else ctx.lineTo(R(pxx), R(pyy));
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba(pal.shadow, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
};

DECOR_ART.driftwood = (ctx, x, y, d, z, pal) => {
  const w2 = d.r * z;
  pxEllipseRot(ctx, x, y - 1, w2, w2 * 0.3, d.flip ? 0.3 : -0.25, '#6b5a48');
  pxEllipseRot(ctx, x, y - 2, w2 * 0.9, w2 * 0.22, d.flip ? 0.3 : -0.25, '#8a7660');
  ctx.fillStyle = '#4a3d30';
  for (let i = -2; i <= 2; i++) px(ctx, x + i * w2 * 0.35, y - 2, '#4a3d30', 1, 1);
};

// ---------------------------------------------------------------------------
// landmarks
// ---------------------------------------------------------------------------

export function drawPoi(ctx, cam, game, poi) {
  const s = cam.worldToScreen(poi.x, poi.y);
  const z = cam.zoom;
  const pal = game.currentRegion.pal;
  const t = game.time;

  switch (poi.kind) {
    case 'oasis': {
      const r = poi.radius * z;
      // cracked basin
      ctx.fillStyle = rgba(pal.shadow, 0.35);
      ctx.beginPath();
      ctx.ellipse(R(s.x), R(s.y), r, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.shadow, 0.5);
      ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + poi.seed;
        ctx.beginPath();
        ctx.moveTo(R(s.x), R(s.y));
        ctx.lineTo(R(s.x + Math.cos(a) * r * 0.9), R(s.y + Math.sin(a) * r * 0.45));
        ctx.stroke();
      }
      if (poi.waterLeft > 0) {
        const wr = r * 0.5 * clamp01(poi.waterLeft / Math.max(1, poi.water));
        puddle(ctx, s.x, s.y, wr, t, '#2f6f7a', '#3f96a4', '#6fc8d4');
      }
      break;
    }
    case 'seep': {
      if (!poi.discovered) return;
      const r = poi.radius * z * 0.5;
      ctx.fillStyle = rgba('#3a5f6a', 0.5);
      ctx.beginPath();
      ctx.ellipse(R(s.x), R(s.y), r, r * 0.5, 0, 0, TAU);
      ctx.fill();
      if (poi.waterLeft > 0) puddle(ctx, s.x, s.y, r * 0.5, t, '#2a5f6a', '#3f8f9c', '#7fd0dc');
      break;
    }
    case 'ruin': {
      const rng = new Rng(poi.seed);
      for (let i = 0; i < 5; i++) {
        const a = rng.float(TAU), d = rng.float(0.3, 1) * poi.radius;
        const bx = s.x + Math.cos(a) * d * z, by = s.y + Math.sin(a) * d * z * 0.6;
        const h = rng.float(6, 20) * z;
        ctx.fillStyle = shadeHex(pal.rock, -0.3);
        ctx.fillRect(R(bx - 3 * z), R(by - h), R(6 * z), R(h));
        ctx.fillStyle = shadeHex(pal.rock, 0.05);
        ctx.fillRect(R(bx - 2 * z), R(by - h), R(4 * z), R(h));
      }
      break;
    }
    case 'monolith': {
      const h = 46 * z, w2 = 7 * z;
      ctx.fillStyle = '#1a1620';
      ctx.fillRect(R(s.x - w2), R(s.y - h), R(w2 * 2), R(h));
      ctx.fillStyle = '#2e2838';
      ctx.fillRect(R(s.x - w2 + 1), R(s.y - h + 1), R(w2 * 2 - 2), R(h - 2));
      // glyphs
      ctx.fillStyle = rgba('#7fd8e8', 0.6 + Math.sin(t * 1.3) * 0.3);
      const rng = new Rng(poi.seed);
      for (let i = 0; i < 8; i++) {
        px(ctx, s.x + rng.float(-w2 * 0.6, w2 * 0.6), s.y - rng.float(h * 0.15, h * 0.9), rgba('#7fd8e8', 0.8), Math.max(1, R(z)), Math.max(1, R(z)));
      }
      break;
    }
    case 'bones': {
      const len = poi.radius * z;
      ctx.fillStyle = '#ddd4bc';
      for (let i = 0; i < 9; i++) {
        const t2 = i / 8;
        const bx = s.x - len + t2 * len * 2;
        const h = (1 - Math.abs(t2 - 0.45) * 1.6) * 24 * z;
        if (h <= 1) continue;
        taper(ctx, [{ x: bx, y: s.y }, { x: bx + Math.sin(t2 * 3) * 4 * z, y: s.y - h }],
          Math.max(2, R(z * 1.4)), 1, '#ded5bd', '#8b8270');
      }
      pxBlob(ctx, s.x - len, s.y - 6 * z, 9 * z, 6 * z, '#e4dcc4', '#8b8270');
      break;
    }
    case 'wreck': {
      const w2 = poi.radius * z, h = 22 * z;
      ctx.fillStyle = '#4a3a30';
      ctx.beginPath();
      ctx.moveTo(R(s.x - w2), R(s.y));
      ctx.lineTo(R(s.x + w2), R(s.y - h * 0.3));
      ctx.lineTo(R(s.x + w2 * 0.7), R(s.y + h * 0.25));
      ctx.lineTo(R(s.x - w2 * 0.8), R(s.y + h * 0.3));
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6b5442';
      ctx.fillRect(R(s.x - w2 * 0.6), R(s.y - h * 0.2), R(w2 * 1.2), Math.max(1, R(h * 0.12)));
      ctx.fillStyle = '#2e2622';
      ctx.fillRect(R(s.x + w2 * 0.1), R(s.y - h), Math.max(1, R(z * 2)), R(h));
      break;
    }
    case 'crater': {
      const r = poi.radius * z;
      ctx.fillStyle = rgba('#b8d8e8', 0.35);
      ctx.beginPath();
      ctx.ellipse(R(s.x), R(s.y), r, r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.4);
      ctx.lineWidth = 1;
      ctx.stroke();
      const rng = new Rng(poi.seed);
      for (let i = 0; i < 7; i++) {
        const a = rng.float(TAU), d = rng.float(0.2, 0.9) * r;
        DECOR_ART.shard(ctx, s.x + Math.cos(a) * d, s.y + Math.sin(a) * d * 0.5,
          { r: 3, h: rng.float(5, 12), seed: rng.int(1e6) }, z, pal, game);
      }
      break;
    }
    case 'well': {
      const r = poi.radius * z;
      ctx.fillStyle = '#101a20';
      ctx.beginPath();
      ctx.ellipse(R(s.x), R(s.y), r, r * 0.5, 0, 0, TAU);
      ctx.fill();
      for (let i = 1; i <= 4; i++) {
        ctx.strokeStyle = rgba('#3f7f96', 0.28 * i / 4);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(R(s.x), R(s.y), r * (i / 4), r * 0.5 * (i / 4), 0, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = rgba('#7fe0d0', 0.5 + Math.sin(t * 0.9) * 0.3);
      px(ctx, s.x, s.y, rgba('#7fe0d0', 0.9), Math.max(2, R(z * 2)), Math.max(1, R(z)));
      break;
    }
    default: break;
  }

  // undiscovered landmarks get a "something is over there" shimmer
  if (!poi.discovered && poi.kind !== 'seep') {
    if (Math.floor(t * 1.5) % 2 === 0) {
      sparkle(ctx, s.x, s.y - 22 * z, 1, rgba('#ffe9a0', 0.7));
    }
  }
}

export function drawPoiLabel(ctx, cam, game, poi) {
  if (!poi.discovered) return;
  const s = cam.worldToScreen(poi.x, poi.y);
  const d = Math.hypot(poi.x - game.crab.x, poi.y - game.crab.y);
  if (d > 190) return;
  const a = clamp01((190 - d) / 60);
  drawText(ctx, poi.name, s.x, s.y - poi.radius * cam.zoom * 0.55 - 16, {
    color: '#f0e2c0', align: 'center', outline: true, outlineColor: 'rgba(20,12,8,0.8)', alpha: a,
  });
}
