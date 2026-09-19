// CRABDEN - the readouts, painted as objects rather than widgets.
//
// A bar is a bar. A shell with water sloshing in it is a shell with water in
// it, and you can read it from across the room without being told what it is.
// Everything here is baked once with the same painter that makes the world, so
// the HUD is lit by the same sun as the desert behind it.

import { Painter, makeCanvas, hash2i } from '../render/pixel.js';
import { buildCreature } from '../art/faunaart.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';
import { pxDisc, pxGlow } from '../render/pix.js';

const LIGHT = { lightX: -0.55, lightY: -0.68, lightZ: 0.42, ambient: 0.42, dither: 0.6 };

const cache = new Map();
const once = (key, make) => {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); }
  return v;
};

// ---------------------------------------------------------------------------
// the water shell: a moulted carapace used as a cup

function buildShell(W = 38) {
  const H = Math.round(W * 0.78);
  const pad = 3;
  const w = W + pad * 2, h = H + 8;
  const cx = w / 2, base = h - 4;
  const domeAt = (u) => Math.pow(Math.sin(clamp01(u) * Math.PI), 0.52);

  // the vessel is a moulted carapace used as a cup, so you are looking into
  // it: the far wall is in shadow, the water sits in front of that, and only
  // the near rim is drawn over the top
  const inner = new Painter(w, h);
  inner.field(cx - W / 2, base - H, cx + W / 2, base + 2, (x, y) => {
    const u = (x - (cx - W / 2)) / W;
    const dome = domeAt(u);
    const top = base - H * 0.86 * dome;
    if (y < top || y > base) return null;
    const t = (y - top) / Math.max(1, base - top);
    const band = Math.sin((y - top) / 2.6 * Math.PI * 2);
    // deep in the cup, dark; up at the rim, catching light
    return { h: 1.5 + band * 0.4, tint: -0.42 + t * 0.10 + band * 0.04 };
  }, { mat: 'shellRock' });
  inner.grain('shellRock', { freq: 0.34, amp: 0.14, seed: 7 });
  const back = inner.resolve(MATERIALS, { ...LIGHT, ambient: 0.30, outline: 1, outlineColor: '#191108' });

  // water shape: the same interior, inset so it never overruns the wall
  const q = new Painter(w, h);
  q.field(cx - W / 2, base - H, cx + W / 2, base + 2, (x, y) => {
    const u = (x - (cx - W / 2)) / W;
    const dome = domeAt(u);
    const top = base - H * 0.86 * dome + 2.2;
    const bot = base - 2.5;
    if (y < top || y > bot) return null;
    const t = (y - top) / Math.max(1, bot - top);
    return { h: 3 - t * 3, tint: 0.16 - t * 0.55 };
  }, { mat: 'water' });
  const water = q.resolve(MATERIALS, { ...LIGHT, ambient: 0.52, outline: 0 });

  // the near wall: an outer ring and a base, drawn over the water
  const front = new Painter(w, h);
  front.field(cx - W / 2 - 2, base - H - 2, cx + W / 2 + 2, base + 3, (x, y) => {
    const u = (x - (cx - W / 2)) / W;
    if (u < -0.06 || u > 1.06) return null;
    const dome = domeAt(clamp01(u));
    const top = base - H * 0.86 * dome;
    if (y < top - 1 || y > base) return null;
    // distance to the silhouette, measured both ways
    const edgeU = Math.min(u, 1 - u) * W;
    const dEdge = Math.min(edgeU, y - top, base - y);
    const wall = 2.6;
    if (dEdge > wall && y < base - 3) return null;
    const k = clamp01(1 - dEdge / wall);
    const band = Math.sin((y - top) / 2.6 * Math.PI * 2);
    return { h: 2.4 + k * 2 + band * 0.5, tint: 0.06 + k * 0.10 + band * 0.05 };
  }, { mat: 'shellRock' });
  front.grain('shellRock', { freq: 0.30, amp: 0.20, seed: 5, height: 0.5 });
  front.speckle('shellRock', { density: 0.06, amp: 0.3, seed: 9 });
  for (const sgn of [-1, 1]) {
    front.capsule(cx + sgn * W * 0.34, base - 2, cx + sgn * W * 0.50, base + 1.5, 1.8, 1.2,
      { mat: 'chitin', dome: 1.4, tint: sgn > 0 ? 0 : -0.14 });
  }
  const cv = front.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#191108' });

  let top = q.h, bot = 0, left = q.w, right = 0;
  for (let y = 0; y < q.h; y++) {
    for (let x = 0; x < q.w; x++) {
      if (!q.mat[y * q.w + x]) continue;
      if (y < top) top = y; if (y > bot) bot = y;
      if (x < left) left = x; if (x > right) right = x;
    }
  }
  return { cv, back, water, w, h, top, bot, left, right };
}

/** Draw the shell with `f` of it full. `t` drives the slosh. */
export function drawShell(ctx, x, y, f, t, scale = 1) {
  const S = once('shell', () => buildShell(38));
  const lvl = S.bot - (S.bot - S.top) * clamp01(f);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(S.back, 0, 0);
  if (f > 0.005) {
    // water: the interior sprite, clipped to everything below the waterline,
    // with the surface itself drawn as a bright moving lip
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, lvl, S.w, S.bot - lvl + 2);
    ctx.clip();
    ctx.drawImage(S.water, 0, 0);
    ctx.restore();
    ctx.fillStyle = '#bfeaf2';
    for (let x2 = S.left; x2 <= S.right; x2++) {
      const wob = Math.sin(t * 2.6 + x2 * 0.5) * 0.9 + Math.sin(t * 1.3 + x2 * 0.22) * 0.6;
      const yy = Math.round(lvl + wob);
      if (yy < S.top - 1 || yy > S.bot) continue;
      ctx.fillRect(x2, yy, 1, 1);
    }
  }
  ctx.drawImage(S.cv, 0, 0);
  ctx.restore();
  return { w: S.w, h: S.h };
}

// ---------------------------------------------------------------------------
// the nutrient flower: it gains a petal as you gain, and drops a leaf as you lose

function buildBloom(stage) {
  const p = new Painter(34, 40);
  const cx = 17, base = 37;
  const grow = stage / 8;
  const h = 8 + grow * 22;

  // stem
  p.curve([{ x: cx, y: base }, { x: cx - 1.5, y: base - h * 0.55 }, { x: cx, y: base - h }],
    1.5, 1.0, { mat: 'leaf', dome: 1.3, steps: 12, tint: -0.04 });

  // leaves: one pair per two stages, alternating
  const leaves = Math.min(4, Math.ceil(stage / 2));
  for (let i = 0; i < leaves; i++) {
    const sgn = i % 2 ? 1 : -1;
    const ly = base - h * (0.22 + i * 0.17);
    const ll = 5 + grow * 5;
    p.curve([{ x: cx, y: ly }, { x: cx + sgn * ll * 0.6, y: ly - ll * 0.5 },
      { x: cx + sgn * ll, y: ly - ll * 0.15 }], 2.4, 0.6,
      { mat: 'leaf', dome: 1.6, steps: 10, tint: sgn > 0 ? 0.06 : -0.10 });
  }

  const ty = base - h;
  if (stage === 0) {
    p.ellipse(cx, ty, 2.0, 2.6, { mat: 'leaf', dome: 1.8, tint: 0.05 });
  } else {
    const petals = Math.min(9, 2 + stage);
    const pr = 2.6 + grow * 4.4;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU;
      const sx = Math.cos(a), sy = Math.sin(a) * 0.5;
      p.ellipse(cx + sx * pr, ty + sy * pr, pr * 0.52, pr * 0.36,
        { mat: stage >= 6 ? 'petalGold' : 'petalPink', rot: a,
          dome: pr * 0.5, tint: sy < 0 ? -0.16 : 0.08 });
    }
    p.ellipse(cx, ty, pr * 0.44, pr * 0.34, { mat: 'fruitGold', dome: pr * 0.5, tint: 0.1 });
    p.speckle('fruitGold', { density: 0.35, amp: 0.4, seed: 3 });
  }
  return { cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#141c0e' }), w: 34, h: 40 };
}

export function drawBloom(ctx, x, y, stage, sway = 0, scale = 1) {
  const st = clamp(Math.round(stage), 0, 8);
  const B = once('bloom' + st, () => buildBloom(st));
  ctx.save();
  ctx.translate(Math.round(x) + 17, Math.round(y) + 37);
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.rotate(sway);
  ctx.drawImage(B.cv, -17, -37);
  ctx.restore();
  return { w: B.w, h: B.h };
}

// ---------------------------------------------------------------------------
// a sprig of fruit for the berry count

function buildSprig(n) {
  const p = new Painter(26, 22);
  const cx = 13, base = 20;
  p.curve([{ x: cx - 8, y: base }, { x: cx, y: base - 8 }, { x: cx + 8, y: base - 5 }],
    1.3, 0.8, { mat: 'wood', dome: 1.1, steps: 10 });
  for (let i = 0; i < 3; i++) {
    const a = -0.4 - i * 0.5;
    p.ellipse(cx - 4 + i * 5, base - 7 - i, 3.4, 2.2,
      { mat: 'leaf', rot: a, dome: 1.6, tint: (i - 1) * 0.07 });
  }
  const shown = Math.min(5, n);
  for (let i = 0; i < shown; i++) {
    const bx = cx - 6 + i * 3.4, by = base - 3 - (i % 2) * 2.6;
    p.ellipse(bx, by, 2.3, 2.3, { mat: 'berry', dome: 2.6, tint: 0.02 });
    p.ellipse(bx - 0.7, by - 0.8, 0.8, 0.7, { mat: 'berry', mask: true, dome: 2, tint: 0.5 });
  }
  return { cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#1a0d10' }), w: 26, h: 22 };
}

export function drawSprig(ctx, x, y, n, scale = 1) {
  const k = clamp(n, 0, 5);
  const S = once('sprig' + k, () => buildSprig(k));
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (scale !== 1) ctx.scale(scale, scale);
  ctx.drawImage(S.cv, 0, 0);
  ctx.restore();
  return { w: S.w, h: S.h };
}

// ---------------------------------------------------------------------------
// your tames: the animals that are actually yours, as their own faces
//
// A number of berries told you nothing - it was a count of a thing you spend.
// What belongs in that corner is what you have made out here: the animals that
// came to you, each drawn as its own head, with the thread of health it is on
// and a mark for the one you are currently riding.

const tameHeads = new Map();

/**
 * The head sprite of a species, cropped to the animal and cached at token
 * size. The crop matters: a painted head sits in a canvas with a lot of
 * padding round it, and fitting the whole canvas into fourteen pixels leaves
 * the actual face about three pixels across.
 */
function tameHead(def, size = 14) {
  const key = def.id + ':' + size;
  let cv = tameHeads.get(key);
  if (cv) return cv;
  const rig = buildCreature(def);
  const src = rig.head.cv;
  const box = opaqueBox(src);
  cv = makeCanvas(size, size);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  // fit the cropped head into the token, biggest side first
  const k = Math.min((size - 1) / box.w, (size - 1) / box.h);
  const w = Math.max(1, Math.round(box.w * k));
  const h = Math.max(1, Math.round(box.h * k));
  g.drawImage(src, box.x, box.y, box.w, box.h,
    Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  if (tameHeads.size > 64) tameHeads.clear();
  tameHeads.set(key, cv);
  return cv;
}

const boxes = new WeakMap();

/** The bounding box of everything that is not transparent in a canvas. */
function opaqueBox(cv) {
  let b = boxes.get(cv);
  if (b) return b;
  const g = cv.getContext('2d');
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  try {
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] < 8) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  } catch { /* a tainted canvas is not a reason to fail to draw a token */ }
  b = x1 < 0
    ? { x: 0, y: 0, w: cv.width, h: cv.height }
    : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  boxes.set(cv, b);
  return b;
}

/**
 * One animal, as a token: its face on a plate, a health thread under it, and a
 * ring if you are riding it. Returns the box it drew in so the caller can
 * hit-test it.
 */
export function drawTame(ctx, x, y, c, opts = {}) {
  const S = opts.size || 16;
  const on = !!opts.on;
  const t = opts.t || 0;
  drawPlate(ctx, x, y, S, S, {
    edge: on ? '#ffe9a8' : 'rgba(120,96,58,0.45)',
    top: on ? 'rgba(64,52,26,0.95)' : undefined,
    rivets: false,
  });
  const def = c.def || c;
  try {
    if (def && def.headL) {
      ctx.drawImage(tameHead(def, S - 2), x + 1, y + 1);
    } else {
      // Dr. Vess, when he is the one on the nerve, has no creature rig
      ctx.fillStyle = on ? '#e8c3aa' : '#a8846a';
      ctx.fillRect(x + 5, y + 4, 6, 7);
      ctx.fillStyle = '#5b3a24';
      ctx.fillRect(x + 4, y + 3, 8, 2);
    }
  } catch { /* a species with no art is still a tame; the plate is enough */ }
  // health, as a thread along the bottom edge
  const hp = clamp01((c.hp ?? 1) / (c.hpMax ?? 1));
  ctx.fillStyle = 'rgba(10,8,5,0.8)';
  ctx.fillRect(x + 2, y + S - 3, S - 4, 1);
  ctx.fillStyle = hp > 0.4 ? '#8cc468' : '#e2564f';
  ctx.fillRect(x + 2, y + S - 3, Math.round((S - 4) * hp), 1);
  if (on) {
    // the one you are riding breathes
    const b = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.globalAlpha = 0.35 + b * 0.5;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(x - 1, y - 1, S + 2, 1);
    ctx.fillRect(x - 1, y + S, S + 2, 1);
    ctx.globalAlpha = 1;
  }
  return { x, y, w: S, h: S };
}

// ---------------------------------------------------------------------------
// the spore gland: what the water shell becomes while you are in SPORE mode
//
// It is not a tank bolted to you - it is an organ, a sac of violet fluid slung
// under a ring of chitin with a nozzle at the bottom of it, and it swells and
// settles as the pressure in it changes. The fluid level reads the same way
// the water in the shell does, so you never have to learn a second gauge.

function buildGland(w = 38) {
  const h = 42;
  const cx = w / 2, base = h - 4;

  // the sac itself, in two layers so the wall reads as a wall
  const q = new Painter(w, h);
  q.ellipse(cx, base - 13, 13, 14, { mat: 'sporeSac', dome: 11, tint: -0.06 });
  const back = q.resolve(MATERIALS, { ...LIGHT, ambient: 0.34, outline: 0 });

  // the fluid: a second pass in the hot violet, drawn clipped to the level
  const f = new Painter(w, h);
  f.ellipse(cx, base - 13, 11.4, 12.6, { mat: 'spore', dome: 9, tint: 0.12 });
  f.grain('spore', { freq: 0.42, amp: 0.24, seed: 12, height: 0.6 });
  // things moving about in it, because it is alive
  for (let i = 0; i < 5; i++) {
    const a = i * 1.31;
    f.ellipse(cx + Math.cos(a) * 5, base - 13 + Math.sin(a) * 6, 1.5, 1.5,
      { mat: 'spore', mask: true, dome: 2, tint: 0.42 });
  }
  const fluid = f.resolve(MATERIALS, { ...LIGHT, ambient: 0.6, outline: 0 });

  // the front: the ring it hangs in, the ribs across it, and the nozzle
  const p = new Painter(w, h);
  // the collar
  p.capsule(cx - 12, base - 24, cx + 12, base - 24, 3.2, 3.2,
    { mat: 'chitin', dome: 2.8, tint: 0.04 });
  for (const sgn of [-1, 1]) {
    p.capsule(cx + sgn * 11, base - 23, cx + sgn * 8.5, base - 6, 2.0, 1.4,
      { mat: 'chitinDark', dome: 1.8, tint: sgn > 0 ? 0.04 : -0.12 });
  }
  // the wall of the sac, as a rim only - the middle stays clear for the fluid
  p.field(cx - 15, base - 29, cx + 15, base + 2, (x, y) => {
    const d = Math.hypot((x - cx) / 13, (y - (base - 13)) / 14);
    if (d > 1.02 || d < 0.80) return null;
    const k = clamp01((d - 0.80) / 0.22);
    return { h: 1.6 + k * 2.4, tint: 0.04 + k * 0.12 };
  }, { mat: 'sporeSac' });
  // the nozzle: a short spout with a lip
  p.capsule(cx, base - 2, cx, base + 3, 2.6, 1.9, { mat: 'chitin', dome: 2.2, tint: -0.04 });
  p.ellipse(cx, base + 3, 2.3, 1.2, { mat: 'chitinDark', dome: -1.2, tint: -0.3 });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#140a1a' });

  return { cv, back, fluid, w, h, top: base - 26, bot: base - 1, left: cx - 12, right: cx + 12 };
}

/**
 * Draw the gland with `f` of it full. `t` drives the churn, and `press` (0-1)
 * swells it while a spore is being charged.
 */
export function drawGland(ctx, x, y, f, t, press = 0, scale = 1) {
  const G = once('gland', () => buildGland(38));
  const lvl = G.bot - (G.bot - G.top) * clamp01(f);
  ctx.save();
  ctx.translate(Math.round(x) + G.w / 2, Math.round(y) + G.h / 2);
  // pressure swells it, and the swell has a wobble on it so it reads as soft
  const k = (scale) * (1 + press * 0.10 + Math.sin(t * 9) * press * 0.03);
  ctx.scale(k, k * (1 - press * 0.03));
  ctx.translate(-G.w / 2, -G.h / 2);
  ctx.drawImage(G.back, 0, 0);
  if (f > 0.005) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, lvl, G.w, G.bot - lvl + 3);
    ctx.clip();
    ctx.drawImage(G.fluid, 0, 0);
    ctx.restore();
    // the meniscus, wobbling
    ctx.fillStyle = press > 0.05 ? '#f0d4ff' : '#d5a3dd';
    for (let x2 = G.left; x2 <= G.right; x2++) {
      const wob = Math.sin(t * 3.4 + x2 * 0.6) * 0.8 + Math.sin(t * 1.7 + x2 * 0.2) * 0.5;
      const yy = Math.round(lvl + wob);
      if (yy < G.top - 1 || yy > G.bot) continue;
      ctx.fillRect(x2, yy, 1, 1);
    }
    // and spores coming off the surface while it is under pressure
    if (press > 0.08) {
      for (let i = 0; i < 5; i++) {
        const ph = (t * (1.3 + i * 0.4) + i * 0.7) % 1;
        ctx.globalAlpha = press * (1 - ph) * 0.85;
        ctx.fillStyle = '#e6c0f2';
        ctx.fillRect(Math.round(G.left + 3 + i * 4), Math.round(lvl - ph * 12), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.drawImage(G.cv, 0, 0);
  ctx.restore();
  return { w: G.w, h: G.h };
}

// ---------------------------------------------------------------------------
// the gene orb: the way into the Tree of Life

function buildOrb() {
  const p = new Painter(30, 30);
  const cx = 15, cy = 15, r = 11;
  p.ellipse(cx, cy, r, r, { mat: 'glass', dome: r * 1.25, tint: 0.02 });
  // a helix suspended inside it
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const a = t * Math.PI * 3.1;
    const yy = cy - r * 0.72 + t * r * 1.44;
    for (const sgn of [1, -1]) {
      const xx = cx + Math.cos(a) * r * 0.46 * sgn;
      p.ellipse(xx, yy, 1.1, 1.1, { mat: 'glow', dome: 1.3, tint: 0.2 + Math.sin(a) * 0.2 });
    }
    if (i % 3 === 0) {
      p.capsule(cx + Math.cos(a) * r * 0.46, yy, cx - Math.cos(a) * r * 0.46, yy,
        0.5, 0.5, { mat: 'glow', dome: 0.4, tint: -0.1 });
    }
  }
  p.ellipse(cx - r * 0.34, cy - r * 0.40, r * 0.26, r * 0.22, { mat: 'glass', mask: true, dome: r, tint: 0.7 });
  return { cv: p.resolve(MATERIALS, { ...LIGHT, ambient: 0.5, outline: 1, outlineColor: '#0e1a1e' }), w: 30, h: 30 };
}

export function drawOrb(ctx, x, y, t, pulse = 0, scale = 1) {
  const O = once('orb', buildOrb);
  ctx.save();
  ctx.translate(Math.round(x) + 15, Math.round(y) + 15);
  if (scale !== 1) ctx.scale(scale, scale);
  const s = 1 + Math.sin(t * 1.7) * 0.03 + pulse * 0.22;
  ctx.globalAlpha = 0.30 + pulse * 0.5 + Math.sin(t * 2.3) * 0.06;
  pxDisc(ctx, 0, 0, 13 * s, '#7fe0c8', { p: 1, soft: 4 });
  ctx.globalAlpha = 1;
  ctx.scale(s, s);
  ctx.drawImage(O.cv, -15, -15);
  ctx.restore();
  return { w: O.w, h: O.h };
}

// ---------------------------------------------------------------------------
// small pictograms for the drawer tabs

function buildTab(kind) {
  const p = new Painter(22, 22);
  const cx = 11, base = 19;
  switch (kind) {
    case 'flora':
      p.curve([{ x: cx, y: base }, { x: cx - 1, y: base - 8 }, { x: cx, y: base - 14 }],
        1.3, 0.8, { mat: 'leaf', dome: 1.1, steps: 8 });
      for (const sgn of [-1, 1]) {
        p.curve([{ x: cx, y: base - 6 }, { x: cx + sgn * 4, y: base - 10 }, { x: cx + sgn * 6, y: base - 7 }],
          2.4, 0.6, { mat: 'leaf', dome: 1.5, steps: 8, tint: sgn > 0 ? 0.06 : -0.1 });
      }
      p.ellipse(cx, base - 14, 3.2, 2.6, { mat: 'petalPink', dome: 2.2, tint: 0.06 });
      break;
    case 'fauna':
      p.ellipse(cx - 1, base - 6, 6.5, 3.6, { mat: 'scaleGreen', dome: 3.4, tint: 0.02 });
      p.ellipse(cx + 6, base - 8, 3.2, 2.4, { mat: 'scaleGreen', dome: 2.4, tint: 0.06 });
      p.curve([{ x: cx - 7, y: base - 6 }, { x: cx - 10, y: base - 9 }, { x: cx - 9, y: base - 13 }],
        1.4, 0.5, { mat: 'scaleGreen', dome: 1.2, steps: 8 });
      for (let i = 0; i < 3; i++) {
        p.capsule(cx - 4 + i * 4, base - 4, cx - 5 + i * 4, base, 0.9, 0.6,
          { mat: 'scaleGreen', dome: 0.8, tint: -0.1 });
      }
      p.ellipse(cx + 7, base - 9, 0.9, 0.9, { mat: 'eye', dome: 1.1, tint: 0.3 });
      break;
    case 'build':
      p.rect(cx - 7, base - 9, 14, 9, { mat: 'wood', dome: 2.6, tint: -0.02 });
      p.poly([{ x: cx - 9, y: base - 9 }, { x: cx, y: base - 16 }, { x: cx + 9, y: base - 9 }],
        { mat: 'leafDry', dome: 2.6, feather: 2, tint: 0.06 });
      p.rect(cx - 2, base - 5, 4, 5, { mat: 'wood', mask: true, dome: -1.5, tint: -0.4 });
      break;
    case 'map':
      // a folded chart: two creases, a route across it, and a mark on the end
      p.rect(cx - 9, base - 14, 18, 14, { mat: 'petalWhite', dome: 2.2, tint: 0.04 });
      for (const d of [-3, 3]) {
        p.rect(cx + d, base - 14, 0.9, 14, { mat: 'petalWhite', mask: true, tint: -0.3, dome: 0 });
      }
      p.curve([{ x: cx - 6, y: base - 3 }, { x: cx - 1, y: base - 10 }, { x: cx + 5, y: base - 5 }],
        0.9, 0.5, { mat: 'petalWhite', mask: true, tint: -0.45, dome: 0, steps: 10 });
      p.ellipse(cx + 5, base - 5, 1.6, 1.6, { mat: 'petalPink', dome: 1.8, tint: 0.22 });
      break;
    case 'codex':
      p.rect(cx - 8, base - 13, 16, 13, { mat: 'leather', dome: 2.6, tint: 0.02 });
      p.rect(cx - 6, base - 11, 12, 9, { mat: 'petalWhite', dome: 1.4, tint: 0.08 });
      for (let i = 0; i < 3; i++) {
        p.rect(cx - 4, base - 9 + i * 2.6, 8, 0.9, { mat: 'petalWhite', mask: true, tint: -0.42, dome: 0 });
      }
      break;
    default: break;
  }
  return p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#1a140c' });
}

export function drawTab(ctx, kind, x, y) {
  const cv = once('tab' + kind, () => buildTab(kind));
  ctx.drawImage(cv, Math.round(x), Math.round(y));
  return { w: 22, h: 22 };
}

// ---------------------------------------------------------------------------
// the popup frame
//
// A panel in this game is a thing Vess would have made: driftwood battens
// lashed at the corners with a stretched hide behind them. It is baked once as
// four edges and four corners and then tiled, so it fits any size without ever
// being stretched.

function buildFrame() {
  const T = 10;               // batten thickness
  const L = 16;               // tile length

  const edge = (horizontal) => {
    const w = horizontal ? L : T, h = horizontal ? T : L;
    const p = new Painter(w, h);
    p.field(0, 0, w, h, (x, y) => {
      const across = horizontal ? y / T : x / T;
      const along = horizontal ? x / L : y / L;
      const d = Math.min(across, 1 - across);
      // a rounded batten with the grain running along it
      const dz = Math.sqrt(Math.max(0, 1 - Math.pow(1 - d * 2, 2)));
      const grain = Math.sin(along * 22 + across * 3) * 0.5 + Math.sin(along * 61) * 0.2;
      return { h: 1.4 + dz * 3.4 + grain * 0.4, tint: -0.10 + dz * 0.22 + grain * 0.07 };
    }, { mat: 'wood' });
    p.grain('wood', { freq: 0.6, amp: 0.16, seed: horizontal ? 3 : 9 });
    return p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#1a1109' });
  };

  const corner = () => {
    const p = new Painter(T + 4, T + 4);
    p.field(0, 0, T + 4, T + 4, (x, y) => {
      const a = Math.min(x, T + 3 - x) / T, b = Math.min(y, T + 3 - y) / T;
      const d = Math.min(a, b);
      if (d < -0.1) return null;
      const dz = Math.sqrt(Math.max(0, 1 - Math.pow(1 - clamp01(d * 2), 2)));
      return { h: 1.6 + dz * 3.6, tint: -0.06 + dz * 0.20 };
    }, { mat: 'wood' });
    // the lashing that holds the corner together
    for (let i = -1; i < 4; i++) {
      p.capsule(1 + i * 2.6, T + 2 - i * 1.2, T + 2 - i * 1.2, 1 + i * 2.6, 1.0, 1.0,
        { mat: 'rope', dome: 1.1, tint: i % 2 ? 0.10 : -0.06 });
    }
    p.grain('wood', { freq: 0.5, amp: 0.18, seed: 21 });
    return p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#1a1109' });
  };

  return { top: edge(true), side: edge(false), corner: corner(), T, L };
}

/**
 * Draw a framed panel. The hide behind it is painted flat because it is meant
 * to sit back; every bit of relief in a panel is in the frame.
 */
export function drawPanel(ctx, x, y, w, h, opts = {}) {
  const F = once('frame', buildFrame);
  const T = F.T;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);

  // the hide
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, opts.top || 'rgba(38,28,18,0.975)');
  g.addColorStop(1, opts.bottom || 'rgba(24,17,11,0.985)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // a stitched inner line, so the hide reads as stretched onto the frame
  ctx.strokeStyle = 'rgba(214,186,138,0.16)';
  ctx.strokeRect(x + T - 1.5, y + T - 1.5, w - (T - 1.5) * 2, h - (T - 1.5) * 2);

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let i = 0; i < Math.ceil(w / F.L); i++) {
    ctx.drawImage(F.top, x + i * F.L, y);
    ctx.drawImage(F.top, x + i * F.L, y + h - T);
  }
  for (let i = 0; i < Math.ceil(h / F.L); i++) {
    ctx.drawImage(F.side, x, y + i * F.L);
    ctx.drawImage(F.side, x + w - T, y + i * F.L);
  }
  ctx.restore();
  const c = F.corner;
  ctx.drawImage(c, x - 2, y - 2);
  ctx.drawImage(c, x + w - T - 2, y - 2);
  ctx.drawImage(c, x - 2, y + h - T - 2);
  ctx.drawImage(c, x + w - T - 2, y + h - T - 2);
}

// ---------------------------------------------------------------------------
// pictograms
//
// One 12x12 stamp per idea, drawn as pixels rather than as glyphs so the
// interface never has to fall back on a letter standing for a thing.

/**
 * Node icons. Each one is 9x9 and says what its node does with a picture
 * rather than a word, because a bead with a word on it is a button and a bead
 * with a picture on it is a gene.
 */
const NODE = {
  // spring
  drop:   '...1.../..111../.11111./1111111/1111111/1111111/.11111./..111../...1...',
  tank:   '1111111/1.....1/1.111.1/1.111.1/1.111.1/1.....1/1111111/.11111./..111..',
  moon:   '..111../.11..1./11....1/11...../11...../11....1/.11..1./..111../.......',
  jet:    '...1.../...1.../..111../..111../.11111./.11111./11...11/1.....1/.......',
  sprout: '....11./...11../1.11.../11111../..1..../..1..../..1..../.11111./.......',
  well:   '1111111/1.....1/1.111.1/1.1.1.1/1.111.1/1.....1/.11111./..111../...1...',
  // shell
  step:   '.....11/.....11/....111/...1111/..11111/.111111/1111111/1111111/.......',
  leaf:   '.....11/....111/...1111/..11.11/.11..11/11...11/11..11./.1111../.......',
  graft:  '11...11/.11.11./..111../...1.../..111../.11.11./11...11/......./.......',
  fruit:  '...1.../..11.../.11111./111.111/11...11/11...11/.11.11./..111../.......',
  tree:   '..111../.11111./1111111/.11111./..111../...1.../...1.../..111../.......',
  // brood
  call:   '..1..../.11..11/.11.1.1/.111..1/.111..1/.11.1.1/.11..11/..1..../.......',
  hand:   '.1.1.1./1111111/1111111/1111111/1111111/.111111/..1111./...11../.......',
  nest:   '......./1111111/11...11/1.111.1/1.....1/.11111./..111../......./.......',
  point:  '...11../...11../11.11../1.111../1.1111./.11111./..1111./...111./.......',
  egg:    '...11../..1111./.111111/1111111/1111111/.111111/..1111./...11../.......',
  link:   '.11..../1..1.11/1..111./.11...1/11...11/1.111../.11..1./.....11/.......',
  // pincer
  claw:   '11...11/.11.11./..111../.11111./11...11/1.....1/11...11/.11.11./..111..',
  saw:    '1.1.1.1/11111.1/.11111./..111../.11111./11111.1/1.1.1.1/......./.......',
  spade:  '...1.../...1.../..111../.11111./1111111/1111111/.11111./..111../.......',
  bolt:   '....11./...11../..11.../.11111./..111../.11..../11...../1....../.......',
  comb:   '1111111/1111111/1.1.1.1/1.1.1.1/1.1.1.1/1.1.1.1/1.1.1.1/......./.......',
  hammer: '.111111/.111111/...11../...11../...11../...11../...11../..1111./.......',
  // legs
  leg:    '11...../.11..../..11.../..11.../...11../...111./....111/...1111/.......',
  shield: '1111111/1111111/1111111/.11111./.11111./..111../..111../...1.../.......',
  burrow: '1111111/1.....1/1.....1/.1...1./..1.1../...1.../..111../.11111./.......',
  load:   '1111111/11...11/1111111/11...11/1111111/..111../..111../.11111./.......',
  skate:  '..11.../.1111../11111../1111111/.111111/..11111/1111111/......./.......',
  crown:  '1.....1/11...11/11.1.11/1111111/1111111/.11111./.11111./1111111/.......',
  // conditions a plant will only ripen under
  sun:    '1..1..1/.1.1.1./..111../11111.1/..111../.1.1.1./1..1..1/......./.......',
  dusk:   '...1.../..111../.11111./1111111/......./1111111/......./......./.......',
  shade:  '..111../.11111./1111111/......./..1.1../..1.1../..1.1../.11111./.......',
  weight: '..111../.11111./..1.1../.11111./1111111/1111111/.11111./......./.......',
  clock:  '..111../.1...1./1..1..1/1..11.1/1....11/.1...1./..111../......./.......',
  // the modes: an animal standing, an animal walking
  crab:   '.11111./1111111/1.1.1.1/1111111/.11111./1.1.1.1/1.1.1.1/......./.......',
  crabwalk: '.11111./1111111/1.1.1.1/1111111/.11111./1..1..1/11...11/......./.......',
};

/** Stamp a node icon into an orb. Tiny, so it is drawn flat and hard. */
/**
 * Names that were asked for before they were drawn. An icon that silently
 * draws nothing is worse than the wrong icon: the card just looks broken and
 * nobody can tell why.
 */
const NODE_ALIAS = {
  seed: 'sprout', beast: 'nest', pump: 'well', spade: 'burrow', flora: 'leaf',
  fauna: 'nest', build: 'load', codex: 'comb', map: 'comb', close: 'bolt',
  paw: 'leg', pick: 'hammer', water: 'drop', ore: 'weight', gear: 'comb',
};

export function drawNodeIcon(ctx, name, cx, cy, color, scale = 1) {
  const rows = NODE[name] || NODE[NODE_ALIAS[name]];
  if (!rows) return;
  const lines = rows.split('/');
  const w = Math.max(...lines.map((l) => l.length));
  const s = Math.max(1, Math.round(scale));
  const x0 = Math.round(cx - (w * s) / 2), y0 = Math.round(cy - (lines.length * s) / 2);
  ctx.fillStyle = color;
  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] === '1') ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
    }
  }
}

const GLYPHS = {
  // . transparent, 1 dark, 2 mid, 3 light, 4 accent
  drop: '....11....../...1221...../..122211..../.12222211.../.12222211.../1222222221../1222222331./1222222331./1222222221./.12222221.../..122221..../....1111....',
  hand: '..1..1..1.../.121.121.12./.122.122.122/.1222222222./.1222222222./112222222221/122222222221/.12222222221/.1222222222./..122222221./...12222221./....111111..',
  scale:'.....11...../.....11...../..111111111./.1.1.....1.1/1..1.....1..1/1..1.....1..1/.11.......11./.....11...../.....11...../....1111..../...111111.../..11111111..',
  map:  '111111111111/1..........1/1.11....11..1/1.1.1..1..1.1/1.1..11...1.1/1..1....1.1.1/1...1..1..1.1/1....11...1.1/1.........1.1/1..........1/1..........1/111111111111',
  seed: '.....11...../....1221..../...122221.../..12222221../.1222222221./.1222222221./.1222222221./.1222222221./..12222221../...122221..../....1221..../.....11.....',
  paw:  '.11...11..../1221.1221.../1221.1221.../.11...11..../......11..11/.....1221122/.....12211221/......11..11/..1111111...:/.122222211../.12222222 1./..11111111..',
  close:'1..........1/11........11/121......121/.121....121./..121..121../...121121.../....12121..../....12121.../...121121.../..121..121../.121....121./1..........1',
  pump: '....1111..../...122221.../..12222221../.1222222221./1222222222 1/1224444422 1/1224444422 1/1222222222 1/.1222222221./..12222221../...122221.../....1111....',
};

const GLYPH_COLS = {
  1: '#1c130b', 2: '#d6ba8a', 3: '#f5e7c6', 4: '#5fc6d8',
};

/** Stamp a 12x12 pictogram. `tint` recolours the mid tone. */
export function drawGlyph(ctx, name, x, y, opts = {}) {
  const rows = GLYPHS[name];
  if (!rows) {
    // There are two pictogram sets in here: these twelve-pixel ones, and the
    // nine-pixel NODE set the genome and the bench draw from. Asking for a
    // name that only exists in the other one used to draw nothing at all,
    // silently - which is how a whole screen of recipes ended up with no
    // icons on it. If the name is over there, draw it from over there.
    if (NODE[name]) {
      const s = Math.max(1, Math.round((opts.scale || 1) * 1.2));
      const prev = ctx.globalAlpha;
      if (opts.alpha !== undefined) ctx.globalAlpha = prev * opts.alpha;
      drawNodeIcon(ctx, name, x + 6 * (opts.scale || 1), y + 6 * (opts.scale || 1),
        opts.color || GLYPH_COLS[2], s);
      ctx.globalAlpha = prev;
    }
    return 12;
  }
  const s = opts.scale || 1;
  const cols = { ...GLYPH_COLS, ...(opts.colors || {}) };
  if (opts.color) cols[2] = opts.color;
  if (opts.accent) cols[4] = opts.accent;
  if (opts.alpha !== undefined) { ctx.save(); ctx.globalAlpha = opts.alpha; }
  const lines = rows.split('/');
  for (let ry = 0; ry < lines.length; ry++) {
    const line = lines[ry];
    for (let rx = 0; rx < line.length; rx++) {
      const c = cols[line[rx]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x + rx * s), Math.round(y + ry * s), s, s);
    }
  }
  if (opts.alpha !== undefined) ctx.restore();
  return 12 * s;
}

// ---------------------------------------------------------------------------
// the pump: a valve in your own shell that you hold open

function buildValve() {
  const w = 34, h = 34;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h / 2;
  // the collar, a ring of chitin set into rock
  p.ellipse(cx, cy, 15, 15, { mat: 'shellRock', dome: 6, tint: -0.06 });
  p.ellipse(cx, cy, 12.5, 12.5, { mat: 'chitin', dome: 5, tint: 0.06 });
  p.ellipse(cx, cy, 9, 9, { mat: 'chitinDark', dome: -6, tint: -0.34 });
  // the four leaves of the valve itself
  for (let i = 0; i < 4; i++) {
    const th = (i / 4) * TAU + 0.4;
    p.poly([
      { x: cx + Math.cos(th) * 8.6, y: cy + Math.sin(th) * 8.6 },
      { x: cx + Math.cos(th + 1.2) * 8.6, y: cy + Math.sin(th + 1.2) * 8.6 },
      { x: cx + Math.cos(th + 0.6) * 2.2, y: cy + Math.sin(th + 0.6) * 2.2 },
    ], { mat: 'chitinPale', dome: 2.6, feather: 2, tint: 0.06 - i * 0.03 });
  }
  p.ellipse(cx, cy, 2.4, 2.4, { mat: 'flesh', dome: -1.6, tint: -0.30 });
  p.grain('shellRock', { freq: 0.34, amp: 0.2, seed: 31 });
  p.grain('chitin', { freq: 0.5, amp: 0.14, seed: 13 });
  return { cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#191108' }), w, h };
}

/**
 * The pump valve. `open` 0..1 spreads the leaves and lights the throat, so
 * holding the button visibly holds the valve open.
 */
export function drawValve(ctx, x, y, open, t) {
  const V = once('valve', buildValve);
  ctx.save();
  ctx.translate(x + V.w / 2, y + V.h / 2);
  const k = 1 + open * 0.06 + Math.sin(t * 22) * open * 0.02;
  ctx.scale(k, k);
  if (open > 0.01) {
    pxGlow(ctx, 0, 0, 16, '#9fe8ee', 0.55 * open, { p: 1, steps: 3 });
  }
  ctx.drawImage(V.cv, -V.w / 2, -V.h / 2);
  ctx.restore();
  return { w: V.w, h: V.h };
}

/**
 * The nozzle: what the valve becomes in SPORE mode. It is the far end of the
 * gland - a muscular ring with a spout through it, held shut until you build
 * pressure behind it. The valve throws water; this throws something alive.
 */
function buildNozzle() {
  const w = 34, h = 34;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h / 2;
  // the ring of muscle it sits in
  p.ellipse(cx, cy, 15, 15, { mat: 'sporeSac', dome: 6, tint: -0.10 });
  p.ellipse(cx, cy, 12.2, 12.2, { mat: 'spore', dome: 5, tint: 0.06 });
  // the throat, going back into the animal
  p.ellipse(cx, cy, 8.4, 8.4, { mat: 'spore', dome: -7, tint: -0.40 });
  // three petals of the sphincter, not four - it should not read as the valve
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * TAU - 1.1;
    p.poly([
      { x: cx + Math.cos(th) * 8.2, y: cy + Math.sin(th) * 8.2 },
      { x: cx + Math.cos(th + 1.6) * 8.2, y: cy + Math.sin(th + 1.6) * 8.2 },
      { x: cx + Math.cos(th + 0.8) * 1.8, y: cy + Math.sin(th + 0.8) * 1.8 },
    ], { mat: 'sporeSac', dome: 2.8, feather: 2, tint: 0.10 - i * 0.04 });
  }
  // the spout standing proud of it
  p.capsule(cx, cy - 1, cx, cy - 9, 3.4, 2.2, { mat: 'chitin', dome: 2.6, tint: 0.02 });
  p.ellipse(cx, cy - 9.4, 2.2, 1.3, { mat: 'chitinDark', dome: -1.4, tint: -0.34 });
  // the veins that feed it
  for (const sgn of [-1, 1]) {
    p.curve([{ x: cx + sgn * 13, y: cy + 4 }, { x: cx + sgn * 8, y: cy + 9 },
      { x: cx + sgn * 3, y: cy + 6 }], 1.1, 0.7,
      { mat: 'spore', dome: 1.0, steps: 8, tint: 0.24 });
  }
  p.grain('spore', { freq: 0.44, amp: 0.18, seed: 21 });
  p.speckle('sporeSac', { density: 0.05, amp: 0.35, seed: 7 });
  return { cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#140a1a' }), w, h };
}

/** Draw the nozzle. `open` is how much pressure is behind it. */
export function drawNozzle(ctx, x, y, open, t, hot = false) {
  const N = once('nozzle', buildNozzle);
  ctx.save();
  ctx.translate(x + N.w / 2, y + N.h / 2);
  // it clenches as the pressure rises rather than opening like the valve does
  const k = 1 + open * 0.10 + Math.sin(t * 26) * open * 0.025;
  ctx.scale(k, k * (1 - open * 0.04));
  if (open > 0.01 || hot) {
    pxGlow(ctx, 0, 0, 16, '#c98ade', 0.6 * Math.max(open, hot ? 0.25 : 0), { p: 1, steps: 3 });
  }
  ctx.drawImage(N.cv, -N.w / 2, -N.h / 2);
  // the spout lights up from the inside when it is about to go
  if (open > 0.5) {
    ctx.globalAlpha = (open - 0.5) * 2;
    ctx.fillStyle = '#f0d4ff';
    ctx.fillRect(-2, -N.h / 2 + 6, 4, 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return { w: N.w, h: N.h };
}

/** A small horizontal gauge, used for ripeness and for load. */
/**
 * A gauge as a piece of brass-bound glass rather than a progress bar: end
 * caps you could unscrew, a tick every quarter, a lit top edge on the fill
 * and a shadow under it. It is the shape the whole interface is cut from.
 */
export function drawGauge(ctx, x, y, w, h, f, col, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  // the brass bezel, then the well it is set into
  ctx.fillStyle = opts.rim || 'rgba(132,104,56,0.92)';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = 'rgba(198,162,90,0.55)';
  ctx.fillRect(x - 2, y - 2, w + 4, 1);
  ctx.fillStyle = opts.back || 'rgba(14,10,6,0.90)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(52,40,26,0.95)';
  ctx.fillRect(x, y, w, h);

  const fw = Math.round(w * clamp01(f));
  if (fw > 0) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, fw, h);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillRect(x, y, fw, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(x, y + h - 1, fw, 1);
    // the meniscus at the leading edge, so the fill reads as a level
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + fw - 1, y, 1, h);
  }
  // quarter ticks, cut into the glass
  if (w > 18) {
    for (let q = 1; q < 4; q++) {
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(x + Math.round(w * q / 4), y, 1, h);
    }
  }
  // the two end caps
  ctx.fillStyle = 'rgba(214,176,100,0.75)';
  ctx.fillRect(x - 2, y - 1, 1, h + 2);
  ctx.fillRect(x + w + 1, y - 1, 1, h + 2);
  if (opts.mark !== undefined) {
    ctx.fillStyle = 'rgba(242,228,194,0.85)';
    ctx.fillRect(x + Math.round(w * clamp01(opts.mark)), y - 2, 1, h + 4);
  }
}

/**
 * A brass plate to hang a reading on: a bevelled slab with a rivet in each
 * corner. Everything the HUD says about the world - where you are, what the
 * weather is doing, what time it is - sits on one of these rather than
 * floating as outlined text over the sky.
 */
/**
 * Everything in the interface is made of something he actually has with him.
 *
 * There are three surfaces and no fourth. **Stone** is the default: a slab of
 * the same rock the mesas are cut from, knocked square, with the shape carved
 * into it as a sunk channel - that is what a readout is. **Paper** is a leaf
 * out of his field notebook, ruled, with a red margin and a torn bottom edge -
 * that is what anything he wrote is. **Scroll** is parchment with the roll
 * still on both ends - that is what a long list is.
 *
 * The surface is baked once per size and blitted, because a notebook page
 * rebuilt out of a hundred fill calls every frame is a notebook page nobody
 * can afford. The lit edge and the selection colour go on top, uncached,
 * because those change while you are looking at them.
 */
const plates = new Map();

function bakePlate(mat, w, h, seed) {
  const cv = makeCanvas(w + 4, h + 6);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const R = (n) => hash2i(n * 37, seed, 91);

  // the shadow it throws, on every surface
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fillRect(2, 3, w, h);

  if (mat === 'paper') {
    // a leaf out of the notebook: off-white, slightly warm, never pure
    g.fillStyle = '#e6dcc0';
    g.fillRect(0, 0, w, h);
    // the fibre, as a scatter of slightly darker and lighter specks
    for (let i = 0; i < w * h * 0.04; i++) {
      const x = Math.floor(R(i * 3) * w), y = Math.floor(R(i * 3 + 1) * h);
      g.fillStyle = R(i * 3 + 2) < 0.5 ? 'rgba(198,184,150,0.5)' : 'rgba(246,238,216,0.5)';
      g.fillRect(x, y, 1, 1);
    }
    // the rule, every nine pixels, which is the line height of the font
    g.fillStyle = 'rgba(120,140,150,0.26)';
    for (let y = 8; y < h - 2; y += 9) g.fillRect(2, y, w - 4, 1);
    // and the margin down the left
    if (w > 40) {
      g.fillStyle = 'rgba(168,64,52,0.40)';
      g.fillRect(6, 1, 1, h - 2);
    }
    // a torn bottom edge: one-pixel bites, never the same twice
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, h - 1, w, 1);
    g.fillStyle = '#e6dcc0';
    for (let x = 0; x < w; x++) {
      if (R(x + 500) < 0.55) g.fillRect(x, h - 1, 1, 1);
    }
    g.fillStyle = 'rgba(150,132,96,0.55)';
    for (let x = 0; x < w; x++) {
      if (R(x + 900) < 0.35) g.fillRect(x, h - 2, 1, 1);
    }
    // a soft shadow along the top, so the page reads as lying on something
    g.fillStyle = 'rgba(120,100,66,0.18)';
    g.fillRect(0, 0, w, 1);
  } else if (mat === 'scroll') {
    // parchment, with the roll still on both ends
    const roll = Math.min(7, Math.max(4, Math.round(h * 0.34)));
    g.fillStyle = '#dbc28c';
    g.fillRect(roll, 0, w - roll * 2, h);
    for (let i = 0; i < w * h * 0.05; i++) {
      const x = roll + Math.floor(R(i * 3) * (w - roll * 2));
      const y = Math.floor(R(i * 3 + 1) * h);
      g.fillStyle = R(i * 3 + 2) < 0.5 ? 'rgba(186,158,106,0.45)' : 'rgba(240,220,174,0.4)';
      g.fillRect(x, y, 1, 1);
    }
    // the two rolls: darker at the core, lit along the top of the curl
    for (const side of [0, 1]) {
      const rx = side ? w - roll : 0;
      g.fillStyle = '#8a6a3a';
      g.fillRect(rx, 0, roll, h);
      g.fillStyle = '#b08c50';
      g.fillRect(rx + (side ? 0 : 1), 1, roll - 1, h - 2);
      g.fillStyle = 'rgba(244,226,180,0.6)';
      g.fillRect(rx + (side ? 1 : roll - 2), 1, 1, h - 2);
      g.fillStyle = 'rgba(50,34,14,0.5)';
      g.fillRect(side ? rx : rx + roll - 1, 0, 1, h);
    }
    // and the parchment curls into shadow where it leaves each roll
    g.fillStyle = 'rgba(110,84,44,0.30)';
    g.fillRect(roll, 0, 2, h);
    g.fillRect(w - roll - 2, 0, 2, h);
  } else if (mat === 'leather') {
    // his bag: dark hide with a stitched line just inside the edge
    g.fillStyle = '#3a2718';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.05; i++) {
      const x = Math.floor(R(i * 3) * w), y = Math.floor(R(i * 3 + 1) * h);
      g.fillStyle = R(i * 3 + 2) < 0.5 ? 'rgba(24,16,10,0.5)' : 'rgba(86,60,36,0.4)';
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = 'rgba(198,162,106,0.34)';
    for (let x = 3; x < w - 3; x += 4) { g.fillRect(x, 2, 2, 1); g.fillRect(x, h - 3, 2, 1); }
    for (let y = 3; y < h - 3; y += 4) { g.fillRect(2, y, 1, 2); g.fillRect(w - 3, y, 1, 2); }
    g.fillStyle = 'rgba(240,214,164,0.18)';
    g.fillRect(0, 0, w, 1);
  } else {
    // stone: a slab knocked square out of the same rock as the mesas
    g.fillStyle = '#4a4136';
    g.fillRect(0, 0, w, h);
    // bedding, running across it the way the cliffs do
    for (let y = 0; y < h; y++) {
      const band = Math.sin(y * 0.7 + seed) * 0.5 + 0.5;
      g.fillStyle = band > 0.62 ? 'rgba(92,82,66,0.34)'
        : band < 0.22 ? 'rgba(30,25,18,0.30)' : 'rgba(0,0,0,0)';
      if (g.fillStyle !== 'rgba(0, 0, 0, 0)') g.fillRect(0, y, w, 1);
    }
    // grit, and the odd bright grain of quartz
    for (let i = 0; i < w * h * 0.05; i++) {
      const x = Math.floor(R(i * 3) * w), y = Math.floor(R(i * 3 + 1) * h);
      const r = R(i * 3 + 2);
      g.fillStyle = r < 0.12 ? 'rgba(196,186,162,0.5)'
        : r < 0.5 ? 'rgba(28,23,17,0.45)' : 'rgba(106,96,78,0.4)';
      g.fillRect(x, y, 1, 1);
    }
    // the bevel: lit along the top and the left, in shadow the other two
    g.fillStyle = 'rgba(150,138,112,0.55)';
    g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
    g.fillStyle = 'rgba(16,12,8,0.55)';
    g.fillRect(0, h - 1, w, 1); g.fillRect(w - 1, 0, 1, h);
    // the carved channel: a groove sunk a pixel in from the edge, dark on the
    // side the light comes from and lit on the far side, which is what makes
    // it read as cut into the stone rather than drawn on it
    if (w > 10 && h > 8) {
      g.fillStyle = 'rgba(20,16,11,0.5)';
      g.fillRect(2, 2, w - 4, 1); g.fillRect(2, 2, 1, h - 4);
      g.fillStyle = 'rgba(168,156,128,0.35)';
      g.fillRect(2, h - 3, w - 4, 1); g.fillRect(w - 3, 2, 1, h - 4);
    }
    // and the corners are knocked off, because nobody dressed this stone
    for (const [cx, cy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
      if (R(cx + cy * 7) < 0.7) g.clearRect(cx, cy, 1, 1);
    }
  }
  return cv;
}

function plateFor(mat, w, h) {
  const key = `${mat}:${w}x${h}`;
  let cv = plates.get(key);
  if (!cv) {
    cv = bakePlate(mat, w, h, (w * 31 + h * 17) % 997);
    if (plates.size > 220) plates.clear();
    plates.set(key, cv);
  }
  return cv;
}

/**
 * A slab, a page or a scroll. `mat` picks which; everything else is the
 * highlight, which is never baked because it moves.
 */
export function drawPlate(ctx, x, y, w, h, opts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 2 || h < 2) return;
  const mat = opts.mat || 'stone';
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.drawImage(plateFor(mat, w, h), x, y);
  // the selection: the carved channel fills with light, which is how a stone
  // tablet gets to look pressed
  if (opts.edge && opts.edge !== 'none') {
    ctx.strokeStyle = opts.edge;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (opts.top) {
      ctx.globalAlpha = (opts.alpha ?? 1) * 0.22;
      ctx.fillStyle = opts.edge;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
  }
  ctx.restore();
}

/**
 * The mode badges. Fifteen pixels square is enough room for a picture rather
 * than a symbol, so each of these is the thing itself: the animal standing,
 * the animal mid-stride, the claw closing, the spray head, and the nerve. They
 * are drawn flat and hard, and tinted at draw time so the lit one glows in its
 * own colour without a second copy.
 */
const MODE_ART = {
  // an animal standing square on, shell over six legs
  crab: [
    '...........',
    '..2222222..',
    '.211111112.',
    '.211111112.',
    '.221111122.',
    '..1212121..',
    '.1.1.1.1.1.',
    '1..1.1.1..1',
    '...........',
  ],
  // the same animal mid-stride, legs gathered one way, shell tilted
  crabwalk: [
    '...........',
    '...2222222.',
    '..211111112',
    '..211111112',
    '..221111122',
    '...1212121.',
    '..11.1.1.1.',
    '.1...1..11.',
    '...........',
  ],
  // a claw, open, about to close
  claw: [
    '..11....11.',
    '.1221..1221',
    '.1221..1221',
    '..122..221.',
    '...122221..',
    '....1221...',
    '....1221...',
    '.....11....',
    '.....11....',
  ],
  // a spray head, and what comes out of it
  jet: [
    '.11........',
    '.1221...2.2',
    '.122211.2.2',
    '.1222211.2.',
    '.122211.2.2',
    '.1221...2.2',
    '.11........',
    '...........',
    '...........',
  ],
  // a nerve: one node, and everything strung off it
  link: [
    '.2.......2.',
    '..2.....2..',
    '...12221...',
    '..1222221..',
    '...12221...',
    '..2.....2..',
    '.2.......2.',
    '...........',
    '...........',
  ],
};

/**
 * Stamp a mode badge. `1` is the body, `2` is the edge, so the lit state can
 * push the body up to full colour while the edge stays dark and the shape
 * still reads against a bright plate.
 */
export function drawModeArt(ctx, name, cx, cy, body, edge, s = 1) {
  const rows = MODE_ART[name];
  if (!rows) return;
  const w = rows[0].length, h = rows.length;
  const x0 = Math.round(cx - w * s / 2), y0 = Math.round(cy - h * s / 2);
  for (let y = 0; y < h; y++) {
    const line = rows[y];
    for (let x = 0; x < line.length; x++) {
      const c = line[x];
      if (c === '.') continue;
      ctx.fillStyle = c === '1' ? body : edge;
      ctx.fillRect(x0 + x * s, y0 + y * s, s, s);
    }
  }
}

export function clearIconCache() { cache.clear(); }
