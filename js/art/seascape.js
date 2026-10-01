// CRABDEN - the sea, from further off.
//
// The reef in sea.js is what grows where you are standing. This is the rest
// of it: the drop-off walls going back into the blue in two ranks, the kelp
// standing up out of them, the bait balls that turn all at once, a manta
// going over, a turtle, and the near fronds that sway across the bottom of
// the shot. Three depths, each one bluer than the last - which is the whole
// trick of making flat pixels read as a hundred metres of water.
//
// Everything far off is drawn at the scene's own pixel size rather than the
// world's zoom, the same way the desert backdrop is: a wall half a mile away
// does not get bigger because the camera leaned in.

import { Painter, makeCanvas, fbmTex } from '../render/pixel.js';
import { withMaterials } from '../lib/palette.js';
import { clamp01, lerp, TAU, mulberry32 } from '../lib/math.js';

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));

/** Noise that wraps at W, so a tile repeats without a seam. */
function loopNoise(x, y, W, s, oct = 3) {
  const t = x / W;
  return lerp(fbmTex(x, y, s, oct), fbmTex(x - W, y, s, oct), t);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------------------------------------------------------------------------
// the walls: two ranks of reef going back into the blue

const WALLS = [
  { // far: low contrast, tall spires, one arch
    W: 512, H: 168, seed: 173, spires: 8, top: 0.20, tall: 0.92, arch: true,
    col: { rim: '#73c6da', lit: '#4ba2c0', base: '#3487ab', shade: '#2a7499', deep: '#1f5f84', fuzz: '#4597b6' },
  },
  { // mid: darker, broader, with coral heads on the shoulders
    W: 560, H: 128, seed: 311, spires: 6, top: 0.26, tall: 0.78, arch: true,
    col: { rim: '#7dd0d8', lit: '#4697ad', base: '#2f7792', shade: '#25637d', deep: '#1a4c66', fuzz: '#3f8aa3' },
    heads: ['#8d6c9e', '#a98a52', '#6f9d8c', '#a0677c'],
  },
];
const wallCache = [];

/**
 * One rank of wall as a tile that repeats. Light comes from straight up, so
 * the lip of every ledge is the brightest thing in it and everything under an
 * overhang goes dark; the bottom third fades toward the deep colour, because
 * nothing at the foot of a wall that far off is lit.
 */
export function wallTile(layer) {
  if (wallCache[layer]) return wallCache[layer];
  const L = WALLS[layer];
  const { W, H, seed } = L;
  const rng = mulberry32(seed * 7919);
  const wrap = (d) => (((d % W) + W * 1.5) % W) - W / 2;

  const spires = [];
  for (let i = 0; i < L.spires; i++) {
    spires.push({
      x: (i + 0.15 + rng() * 0.7) * (W / L.spires),
      w: 9 + rng() * 24,
      h: (0.42 + rng() * 0.58) * H * L.tall,
      lean: (rng() - 0.5) * 0.6,
      cap: rng() < 0.4,           // a flat-topped mesa rather than a point
    });
  }
  // the broadest spire gets an arch through it
  const arches = [];
  if (L.arch) {
    const s = spires.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    arches.push({ x: s.x, y: H - s.h * 0.34, rx: s.w * 0.42, ry: s.h * 0.2 });
  }

  const top = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const u = x / W;
    let h = H * L.top
      + Math.sin(u * TAU * 2 + seed) * 7
      + Math.sin(u * TAU * 5 + seed * 0.3) * 3.5
      + Math.sin(u * TAU * 13 + 1.1) * 1.4;
    for (const s of spires) {
      const d = wrap(x - s.x + s.lean * 10);
      const k = Math.abs(d) / s.w;
      if (k >= 1.6) continue;
      const shape = s.cap
        ? (k < 0.7 ? 1 : Math.pow(clamp01(1 - (k - 0.7) / 0.9), 0.7))
        : Math.pow(clamp01(1 - k * k / 2.56), 0.9);
      h = Math.max(h, s.h * shape);
    }
    h += (loopNoise(x * 0.09, 3.3, W * 0.09, seed, 3) - 0.5) * 9;
    top[x] = Math.round(H - h);
  }

  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const C = {};
  for (const k of Object.keys(L.col)) C[k] = hex(L.col[k]);
  const put = (x, y, c, a = 255) => {
    const o = (y * W + x) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = a;
  };
  const inArch = (x, y) => {
    for (const a of arches) {
      const dx = wrap(x - a.x) / a.rx, dy = (y - a.y) / a.ry;
      if (dx * dx + dy * dy < 1) return dx * dx + dy * dy;
    }
    return -1;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = top[x];
      if (y < t) continue;
      const ah = inArch(x, y);
      if (ah >= 0) continue;
      const d = y - t;
      const b = BAYER4[y & 3][x & 3];
      const blot = loopNoise(x * 0.07, y * 0.07, W * 0.07, seed + 5, 3);
      const strata = loopNoise(x * 0.02, y * 0.32, W * 0.02, seed + 9, 2);
      const fall = clamp01((y - H * 0.55) / (H * 0.45));
      // the edge facing the light, and the edge an overhang puts in shade
      const left = x > 0 ? top[x - 1] : top[W - 1];
      const right = x < W - 1 ? top[x + 1] : top[0];
      const sideL = y < left + 1, sideR = y < right + 1;
      let c;
      if (d < 1) c = C.rim;
      else if (d < 3) c = b < 0.55 ? C.rim : C.lit;
      else if (d < 7) c = b < 0.35 ? C.lit : C.base;
      else if (fall > b * 1.1) c = fall > 0.6 + b * 0.4 ? C.deep : C.shade;
      else if (blot > 0.6) c = C.shade;
      else if (blot < 0.3 && b < 0.4) c = C.lit;
      else c = C.base;
      if (sideL && d >= 1) c = b < 0.6 ? C.lit : C.base;
      if (sideR && d >= 1) c = C.shade;
      // ledges: a bright lip with a dark band under it
      if (d > 8 && strata > 0.66 && strata < 0.70) c = C.lit;
      else if (d > 8 && strata >= 0.70 && strata < 0.76) c = C.shade;
      // under an arch it is in its own shadow
      for (const a of arches) {
        const dx = wrap(x - a.x) / (a.rx + 2.5), dy = (y - a.y) / (a.ry + 2.5);
        const q = dx * dx + dy * dy;
        if (q < 1) c = y < a.y ? C.shade : (b < 0.5 ? C.lit : C.base);
      }
      put(x, y, c);
    }
  }
  // coral heads and fans on the shoulders, so it reads as reef and not rock
  const heads = L.heads;
  for (let i = 0; i < (heads ? 46 : 30); i++) {
    const x = Math.floor(rng() * W);
    const y0 = top[x];
    if (y0 >= H - 4) continue;
    const r = 1 + Math.floor(rng() * (heads ? 3 : 2));
    const col = heads ? hex(heads[Math.floor(rng() * heads.length)]) : C.fuzz;
    const fan = rng() < 0.35;
    for (let yy = -r * (fan ? 3 : 1); yy <= 0; yy++) {
      for (let xx = -r - (fan ? 2 : 0); xx <= r + (fan ? 2 : 0); xx++) {
        const px = (x + xx + W) % W, py = y0 + yy;
        if (py < 0 || py >= H) continue;
        const k = fan ? (Math.abs(xx) / (r + 2)) + (-yy / (r * 3)) * 0.6 : (xx * xx + yy * yy) / (r * r + 0.5);
        if (k > 1) continue;
        if (fan && (BAYER4[py & 3][px & 3] > 0.62)) continue;
        put(px, py, (yy === -r * (fan ? 3 : 1) || k > 0.8) && !fan ? C.rim : col);
      }
    }
  }
  g.putImageData(img, 0, 0);
  wallCache[layer] = { cv, W, H, deep: L.col.deep, top };
  return wallCache[layer];
}

// ---------------------------------------------------------------------------
// kelp

/**
 * One strand of kelp, drawn live because it moves: a stipe that leans with
 * the swell and more the higher it goes, a blade off it every few pixels on
 * alternate sides, and a float at the base of each. `o` carries the colours
 * and the size; everything is in screen pixels.
 */
export function drawKelp(ctx, x0, y0, len, t, ph, o) {
  const lw = o.lw || 1;
  const step = o.step || 3;
  const n = Math.max(3, Math.round(len / step));
  const amp = o.amp ?? 1;
  let px = x0, py = y0;
  let side = (ph * 10) & 1 ? 1 : -1;
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    const sway = (Math.sin(t * 0.75 + ph + f * 2.6) * (1.5 + 9 * f * f)
      + Math.sin(t * 0.31 + ph * 1.7) * 4 * f) * amp;
    const nx = x0 + sway, ny = y0 - f * len;
    // the stipe
    ctx.fillStyle = o.stipe;
    const dy = Math.max(1, Math.round(py - ny));
    for (let k = 0; k < dy; k++) {
      const q = k / dy;
      ctx.fillRect(Math.round(lerp(px, nx, q) - lw / 2), Math.round(py - k), lw, 1);
    }
    // a blade every few joints, alternating sides, drooping with the current
    if (i % (o.every || 2) === 0 && f > 0.08) {
      const bl = (o.leaf || 5) * (0.75 + 0.5 * Math.sin(ph * 3 + i)) * (1 - f * 0.35);
      const droop = 0.35 + Math.sin(t * 0.9 + ph + i) * 0.25;
      const bw = o.bw || 2;
      for (let k = 0; k <= bl; k++) {
        const q = k / bl;
        const bx = nx + side * k * (1 - q * 0.25);
        const by = ny + k * droop - Math.sin(q * Math.PI) * 1.2;
        const w = Math.max(1, Math.round(bw * Math.sin(Math.max(0.25, q) * Math.PI)));
        ctx.fillStyle = o.leaf2 && k > bl * 0.5 ? o.leaf2 : o.leafCol;
        ctx.fillRect(Math.round(bx), Math.round(by), 1, w);
        if (o.hi && w > 1) { ctx.fillStyle = o.hi; ctx.fillRect(Math.round(bx), Math.round(by), 1, 1); }
      }
      if (o.float) { ctx.fillStyle = o.float; ctx.fillRect(Math.round(nx + side), Math.round(ny), 1, 1); }
      side = -side;
    }
    px = nx; py = ny;
  }
  // a crown of blades at the top, streaming the way the swell is going
  if (o.crown) {
    const lean = Math.sin(t * 0.75 + ph + 2.6) > 0 ? 1 : -1;
    for (let j = 0; j < 3; j++) {
      const bl = (o.leaf || 5) * (1.1 - j * 0.2);
      for (let k = 0; k <= bl; k++) {
        ctx.fillStyle = o.leafCol;
        ctx.fillRect(Math.round(px + lean * k * 0.8 + (j - 1)), Math.round(py - 1 + k * (0.3 + j * 0.25)), 1, 2);
      }
    }
  }
}

/** Seagrass: a tuft of thin blades that all lean together. */
export function drawGrass(ctx, x0, y0, h, t, ph, o) {
  const n = o.n || 6;
  for (let i = 0; i < n; i++) {
    const hh = h * (0.55 + 0.45 * Math.abs(Math.sin(ph * 7 + i * 1.9)));
    const base = x0 + (i - (n - 1) / 2) * (o.gap || 1);
    let px = base, py = y0;
    const segs = Math.max(3, Math.round(hh / 2));
    for (let s = 1; s <= segs; s++) {
      const f = s / segs;
      const nx = base + (Math.sin(t * 1.1 + ph + i * 0.7 + f * 1.8) * 3 + (i - n / 2) * 0.5) * f * f * (o.amp || 1);
      const ny = y0 - f * hh;
      ctx.fillStyle = f > 0.7 && o.tip ? o.tip : (i % 3 === 0 ? o.dark : o.col);
      const dy = Math.max(1, Math.round(py - ny));
      for (let k = 0; k < dy; k++) ctx.fillRect(Math.round(lerp(px, nx, k / dy)), Math.round(py - k), o.w || 1, 1);
      px = nx; py = ny;
    }
  }
}

// ---------------------------------------------------------------------------
// the bait balls: fish small enough to be drawn one pixel at a time

const SCHOOL_ART = {
  // a sardine: blue back, silver side, white belly, and a flash when it turns
  sardine: {
    rows: ['..bbbbb.', 'tssssshe', '..wwwww.'],
    rows2: ['t.bbbbb.', '.ssssshe', 't.wwwww.'],
    pal: { b: '#3a6c97', s: '#a8c6d8', h: '#d8ecf4', w: '#eef8fb', e: '#0e1c26', t: '#6f95b2' },
    flash: { b: '#a8d4ee', s: '#ffffff', h: '#ffffff', w: '#ffffff', t: '#c8e6f6' },
  },
  // a fusilier: electric blue with a yellow back stripe and a yellow tail
  fusilier: {
    rows: ['...yyyy..', 'tbbbbbbbe', 'tyyssssb.', '...wwww..'],
    rows2: ['t..yyyy..', '.bbbbbbbe', '.yyssssb.', 't..wwww..'],
    pal: { y: '#f2c94a', b: '#3b7fd0', s: '#7fb8ea', w: '#dff0fb', e: '#0c1830', t: '#f2c94a' },
    flash: { y: '#fff0a8', b: '#9fd2ff', s: '#ffffff', w: '#ffffff', t: '#fff0a8' },
  },
  // glassfish: barely there, a pale sliver with a dark spine
  glass: {
    rows: ['.ggggg', 'tkkkke', '.ggggg'],
    rows2: ['tggggg', '.kkkke', 'tggggg'],
    pal: { g: '#c9eef2', k: '#7fb7c2', e: '#163038', t: '#a6dce4' },
    flash: { g: '#ffffff', k: '#e0fbff', t: '#ffffff' },
  },
};
const schoolCache = new Map();

function paintRows(rows, pal) {
  const w = rows[0].length, h = rows.length;
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.' || !pal[ch]) continue;
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/** A schooling fish, facing right. `frame` 0/1 beats the tail; `flash` is the turn. */
export function schoolFish(kind, frame, flash) {
  const k = `${kind}:${frame}:${flash ? 1 : 0}`;
  let cv = schoolCache.get(k);
  if (cv) return cv;
  const a = SCHOOL_ART[kind] || SCHOOL_ART.sardine;
  const pal = flash ? { ...a.pal, ...a.flash } : a.pal;
  cv = paintRows(frame ? a.rows2 : a.rows, pal);
  // and the same thing facing left
  const fl = makeCanvas(cv.width, cv.height);
  const fg = fl.getContext('2d');
  fg.translate(cv.width, 0); fg.scale(-1, 1); fg.drawImage(cv, 0, 0);
  const out = { r: cv, l: fl, w: cv.width, h: cv.height };
  schoolCache.set(k, out);
  return out;
}
export const SCHOOL_KINDS = Object.keys(SCHOOL_ART);

// ---------------------------------------------------------------------------
// the big swimmers that are not whales

const LIGHT = { lightX: -0.35, lightY: -0.85, lightZ: 0.5, ambient: 0.48, dither: 0.7 };
const MATS = withMaterials({
  manta: { ramp: ['#0c1626', '#13223a', '#1c3150', '#264266', '#33557c', '#456c93', '#6188aa', '#86a8c2'],
    diffuse: 0.82, rim: 0.30, ao: 0.12, normalScale: 0.5, outline: '#060c16' },
  mantaBelly: { ramp: ['#5c6f7e', '#73889a', '#8ca2b2', '#a5bac8', '#bccfda', '#d2e1e9', '#e4eff4', '#f4fafc'],
    diffuse: 0.7, rim: 0.4, ao: 0.08, normalScale: 0.4, outline: '#28343e' },
  turtleShell: { ramp: ['#241a0c', '#3a2a12', '#523d19', '#6c5222', '#86682e', '#a1823f', '#bb9e57', '#d6bd7c'],
    diffuse: 0.84, rim: 0.28, spec: 0.35, ao: 0.14, normalScale: 0.6, outline: '#140e06' },
  turtleSkin: { ramp: ['#1c2a22', '#28392e', '#354b3b', '#445e49', '#557258', '#6b886c', '#87a283', '#a9bf9f'],
    diffuse: 0.80, rim: 0.32, ao: 0.12, normalScale: 0.55, outline: '#0e1611' },
});
const bigCache = new Map();
const bake = (p, ox, oy, outline, extra = {}) => ({
  cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: outline }), ox, oy, ...extra,
});

/**
 * A manta, seen a little from above as it goes over: the near wing below the
 * body and the far one above it, both beating together. `f` is the phase of
 * the beat, 0..1. Eight frames is enough for something this slow.
 */
function paintManta(f) {
  const S = 1;
  const L = 46 * S, span = 30 * S;
  const p = new Painter(Math.ceil(L * 1.9) + 12, Math.ceil(span * 2.6) + 12);
  const cx = p.w * 0.42, cy = p.h / 2;
  const beat = Math.sin(f * TAU);               // -1 down .. 1 up
  const farTip = { x: cx + L * 0.20, y: cy - span * (0.55 + beat * 0.45) };
  const nearTip = { x: cx + L * 0.22, y: cy + span * (0.62 - beat * 0.5) };
  // the far wing first: it is behind the body
  p.poly([
    { x: cx - L * 0.34, y: cy - 2 },
    { x: farTip.x - L * 0.10, y: lerp(cy, farTip.y, 0.6) - 2 },
    { x: farTip.x, y: farTip.y },
    { x: cx + L * 0.30, y: cy - 1 },
  ], { mat: 'manta', dome: 2.4, feather: 2.5, tint: -0.14 });
  // the body: a flat diamond with the head forward
  p.ellipse(cx, cy, L * 0.40, 5.2 * S, { mat: 'manta', dome: 4.5, tint: 0.04 });
  // the cephalic fins, curled forward like horns
  for (const k of [-1, 1]) {
    p.curve([{ x: cx - L * 0.36, y: cy + k * 2 }, { x: cx - L * 0.47, y: cy + k * 3.2 }, { x: cx - L * 0.50, y: cy + k * 1 }],
      1.4, 0.8, { mat: 'manta', dome: 1.1, steps: 6, tint: 0.06 });
  }
  // the near wing, with the pale underside showing when it lifts
  const under = beat > 0.2;
  p.poly([
    { x: cx - L * 0.32, y: cy + 2 },
    { x: nearTip.x - L * 0.12, y: lerp(cy, nearTip.y, 0.62) + 1 },
    { x: nearTip.x, y: nearTip.y },
    { x: cx + L * 0.32, y: cy + 1 },
  ], { mat: under ? 'mantaBelly' : 'manta', dome: 3, feather: 2.5, tint: under ? -0.1 : 0.02 });
  // white shoulder patches - the thing everyone remembers about a manta
  p.ellipse(cx - L * 0.08, cy - 2.2, L * 0.12, 1.6, { mat: 'mantaBelly', dome: 1.2, tint: -0.05 });
  // the tail: long, thin, trailing
  p.curve([{ x: cx + L * 0.36, y: cy }, { x: cx + L * 0.62, y: cy + beat * 1.5 }, { x: cx + L * 0.92, y: cy - beat * 2 }],
    1.0, 0.4, { mat: 'manta', dome: 0.6, steps: 10, tint: -0.06 });
  p.ellipse(cx - L * 0.30, cy - 1.2, 0.8, 0.8, { mat: 'eye', dome: 0.8, tint: 0.1 });
  p.grain('manta', { freq: 0.5, amp: 0.10, seed: 21 });
  return bake(p, cx, cy, '#060c16', { L });
}

export const MANTA_FRAMES = 8;
export function mantaArt(frame) {
  const k = 'manta:' + frame;
  let v = bigCache.get(k);
  if (!v) { v = paintManta(frame / MANTA_FRAMES); bigCache.set(k, v); }
  return v;
}

/**
 * A green turtle: the high domed carapace with its plates, the beaked head
 * held forward, and the long front flipper doing all the work. `f` 0..1 is
 * the stroke.
 */
function paintTurtle(f) {
  const L = 30, H = 15;
  const p = new Painter(L * 2 + 14, H * 3 + 12);
  const cx = p.w * 0.48, cy = p.h * 0.5;
  const st = Math.sin(f * TAU);
  // the far flippers, behind
  p.curve([{ x: cx - L * 0.22, y: cy - 2 }, { x: cx - L * 0.05, y: cy - H * (0.7 + st * 0.35) }, { x: cx + L * 0.16, y: cy - H * (0.95 + st * 0.5) }],
    3.2, 0.9, { mat: 'turtleSkin', dome: 1.8, steps: 8, tint: -0.18 });
  p.capsule(cx + L * 0.34, cy + 1, cx + L * 0.50, cy - 3 - st * 1.5, 2.2, 0.9, { mat: 'turtleSkin', dome: 1.4, tint: -0.16 });
  // the head and neck, forward
  p.capsule(cx - L * 0.40, cy + 1, cx - L * 0.62, cy, 3.4, 3.0, { mat: 'turtleSkin', dome: 2.6, tint: 0.02 });
  p.ellipse(cx - L * 0.66, cy - 0.3, 4.2, 3.4, { mat: 'turtleSkin', dome: 3, tint: 0.06 });
  p.ellipse(cx - L * 0.70, cy - 1.0, 0.9, 0.9, { mat: 'eye', dome: 0.9, tint: 0.1 });
  // the carapace: high and domed, flat underneath
  p.field(cx - L * 0.46, cy - H * 0.9, cx + L * 0.46, cy + H * 0.25, (x, y) => {
    const u = (x - cx) / (L * 0.46);
    if (Math.abs(u) > 1) return null;
    const topY = cy - H * 0.85 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - u * 0.15);
    const botY = cy + H * 0.22 * Math.sqrt(Math.max(0, 1 - u * u));
    if (y < topY || y > botY) return null;
    const v = (y - topY) / Math.max(1, botY - topY);
    // the scutes: a row down the spine and a row of side plates
    const ring = Math.abs(Math.sin(u * 4.2 + 0.4)) < 0.16 || Math.abs(v - 0.42) < 0.05;
    return { h: (1 - v * 0.7) * 6 * Math.sqrt(Math.max(0, 1 - u * u)), tint: ring ? -0.3 : (v > 0.8 ? -0.12 : 0.04) };
  }, { mat: 'turtleShell' });
  // the plastron edge
  p.capsule(cx - L * 0.40, cy + H * 0.2, cx + L * 0.38, cy + H * 0.18, 1.4, 1.2, { mat: 'turtleSkin', dome: 1, tint: 0.14 });
  // the near front flipper: long and swept, the whole stroke
  p.curve([{ x: cx - L * 0.26, y: cy + 3 }, { x: cx - L * 0.02, y: cy + H * (0.55 - st * 0.45) }, { x: cx + L * 0.24, y: cy + H * (0.75 - st * 0.75) }],
    3.6, 1.0, { mat: 'turtleSkin', dome: 2.2, steps: 10, tint: 0.04 });
  p.capsule(cx + L * 0.36, cy + 4, cx + L * 0.54, cy + 6 + st * 1.5, 2.4, 1.0, { mat: 'turtleSkin', dome: 1.6, tint: 0.0 });
  p.speckle('turtleSkin', { density: 0.18, amp: 0.3, seed: 5 });
  p.grain('turtleShell', { freq: 0.6, amp: 0.16, seed: 9 });
  return bake(p, cx, cy, '#0e1209', { L });
}

export const TURTLE_FRAMES = 8;
export function turtleArt(frame) {
  const k = 'turtle:' + frame;
  let v = bigCache.get(k);
  if (!v) { v = paintTurtle(frame / TURTLE_FRAMES); bigCache.set(k, v); }
  return v;
}

// ---------------------------------------------------------------------------
// the near fronds: out of focus, dark, across the bottom of the shot

const foreCache = [];
/**
 * A dark coral head for the very front of the frame: big, soft-edged with a
 * dither, nearly black, so it frames the shot without being something to
 * look at.
 */
export function foreCoral(i) {
  if (foreCache[i]) return foreCache[i];
  const rng = mulberry32(4243 + i * 977);
  const W = 70 + Math.floor(rng() * 50), H = 34 + Math.floor(rng() * 26);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const lobes = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < n; k++) {
    lobes.push({ x: W * (0.15 + rng() * 0.7), y: H * (0.55 + rng() * 0.5), r: H * (0.32 + rng() * 0.4) });
  }
  // and a few branch tips sticking up off it
  const tips = [];
  for (let k = 0; k < 4 + Math.floor(rng() * 4); k++) {
    tips.push({ x: W * (0.1 + rng() * 0.8), h: H * (0.35 + rng() * 0.5), r: 2 + rng() * 2.5 });
  }
  const dark = hex('#03161f'), mid = hex('#062431'), rim = hex('#0d3a48');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let inside = 0;
      for (const l of lobes) {
        const d = Math.hypot(x - l.x, (y - l.y) * 1.2) / l.r;
        inside = Math.max(inside, 1 - d);
      }
      for (const t of tips) {
        const dx = Math.abs(x - t.x) / t.r;
        if (y > H - t.h && dx < 1) inside = Math.max(inside, (1 - dx) * 0.6);
        const d2 = Math.hypot(x - t.x, y - (H - t.h)) / (t.r * 1.3);
        if (d2 < 1) inside = Math.max(inside, 1 - d2);
      }
      if (inside <= 0) continue;
      const b = BAYER4[y & 3][x & 3];
      if (inside < 0.12 && b > inside * 6) continue;   // the soft edge
      const o = (y * W + x) * 4;
      const c = inside < 0.18 ? rim : inside < 0.4 ? mid : dark;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  foreCache[i] = cv;
  return cv;
}
