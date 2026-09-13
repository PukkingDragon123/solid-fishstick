// CRABDEN - what lived here when there was water.
//
// Painted the same way as everything else: height fields, material ramps, one
// light, a hard outline. The reef is not a backdrop - every coral head, fish,
// urchin and crablet is a baked sprite that stands on the same terrain the
// desert stands on, because it is the same terrain. That is the whole point of
// the opening: you are looking at the seabed you will spend the game walking
// across.

import { Painter } from '../render/pixel.js';
import { withMaterials } from '../lib/palette.js';
import { clamp01, lerp, TAU, mulberry32 } from '../lib/math.js';

const LIGHT = { lightX: -0.4, lightY: -0.78, lightZ: 0.5, ambient: 0.46, dither: 0.7 };

const MATS = withMaterials({
  coralPink: { ramp: ['#4a1b2c', '#67273c', '#85354c', '#a2465c', '#bc5d70', '#d17a88', '#e29ca4', '#f0c2c4'],
    diffuse: 0.80, rim: 0.34, ao: 0.12, normalScale: 0.6, outline: '#2a0e1a' },
  coralGold: { ramp: ['#4a3410', '#664819', '#846024', '#a17a32', '#bb9645', '#d0b263', '#e2cd8c', '#f2e6bd'],
    diffuse: 0.82, rim: 0.30, ao: 0.11, normalScale: 0.58, outline: '#2b1d08' },
  coralTeal: { ramp: ['#0e3a3c', '#16514f', '#216a63', '#2f8479', '#439d8e', '#5eb5a4', '#83ccbc', '#b2e4d7'],
    diffuse: 0.80, rim: 0.36, ao: 0.11, normalScale: 0.6, outline: '#06211f' },
  coralViolet: { ramp: ['#2c1c46', '#402860', '#55377a', '#6b4894', '#845dab', '#9e79c0', '#b99bd4', '#d7c4e8'],
    diffuse: 0.78, rim: 0.38, ao: 0.12, normalScale: 0.6, outline: '#180e28' },
  whale: { ramp: ['#16303f', '#1e4257', '#28566e', '#356b85', '#45839c', '#5b9cb2', '#7cb8c9', '#a8d5e0'],
    diffuse: 0.84, rim: 0.26, ao: 0.10, normalScale: 0.45, outline: '#0b1f2c' },
  whaleDark: { ramp: ['#0e2130', '#152e41', '#1d3d53', '#264d66', '#325f79', '#42738d', '#598aa4', '#7aa8bd'],
    diffuse: 0.80, rim: 0.20, ao: 0.14, normalScale: 0.5, outline: '#08161f' },
  weed: { ramp: ['#123322', '#1b4830', '#265e3e', '#33754d', '#438d5d', '#57a672', '#77c08e', '#a3dab2'],
    diffuse: 0.80, rim: 0.34, ao: 0.10, normalScale: 0.5, outline: '#0a1d13' },
  scaleSilver: { ramp: ['#20303c', '#2f4553', '#425c6c', '#587687', '#7191a1', '#8fadba', '#b2c9d2', '#dceaef'],
    diffuse: 0.72, rim: 0.52, spec: 0.7, ao: 0.08, normalScale: 0.55, outline: '#101a22' },
  scaleGold: { ramp: ['#4b3208', '#6b470e', '#8c5f17', '#ac7a22', '#c69633', '#dab353', '#ead184', '#f7ecc2'],
    diffuse: 0.76, rim: 0.48, spec: 0.6, ao: 0.09, normalScale: 0.55, outline: '#2a1c05' },
  scaleBlue: { ramp: ['#12253f', '#1a355a', '#244878', '#315d95', '#4276b0', '#5a92c6', '#7fb2d9', '#b0d5ea'],
    diffuse: 0.74, rim: 0.50, spec: 0.65, ao: 0.08, normalScale: 0.55, outline: '#08111f' },
  jelly: { ramp: ['#2a2140', '#3a2f58', '#4c3f72', '#60528c', '#7768a4', '#9184bc', '#b0a6d2', '#d6cfe8'],
    diffuse: 0.55, rim: 0.85, spec: 0.7, ao: 0.05, normalScale: 0.4, outline: '#1a1328' },
});

const cache = new Map();
const bake = (p, ox, oy, outline = '#14101a', extra = {}) => ({
  cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: outline }), ox, oy, ...extra,
});

// ---------------------------------------------------------------------------
// corals and the things fixed to the rock

const CORAL_MATS = ['coralPink', 'coralGold', 'coralTeal', 'coralViolet'];

function paintBranch(S, rng, mat) {
  const H = 22 * S, W = 20 * S;
  const p = new Painter(Math.ceil(W) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, base = p.h - 5;
  // a staghorn: each fork a little thinner and a little more sideways
  const grow = (x, y, a, len, r, depth) => {
    const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
    p.capsule(x, y, nx, ny, r, r * 0.72, { mat, dome: r * 0.9, tint: -0.04 + depth * 0.05 });
    if (depth >= 3 || r < 0.9 * S) {
      p.ellipse(nx, ny, r * 0.9, r * 0.9, { mat, dome: r, tint: 0.16 });
      return;
    }
    const n = rng() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.5 + rng() * 0.35);
      grow(nx, ny, a + spread + (rng() - 0.5) * 0.2, len * (0.68 + rng() * 0.2),
        r * 0.70, depth + 1);
    }
  };
  grow(cx, base, -Math.PI / 2 + (rng() - 0.5) * 0.3, 6 * S, 2.6 * S, 0);
  p.grain(mat, { freq: 0.9 / S, amp: 0.18, seed: 11 });
  p.speckle(mat, { density: 0.08, amp: 0.3, seed: 5 });
  return bake(p, cx, base, '#20101c');
}

function paintFan(S, rng, mat) {
  const H = 20 * S, W = 22 * S;
  const p = new Painter(Math.ceil(W) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, base = p.h - 5;
  // a sea fan: ribs off a stem, then cross-ties between them
  p.capsule(cx, base, cx, base - H * 0.28, 1.8 * S, 1.5 * S, { mat, dome: 1.6 * S });
  const ribs = 9;
  const tips = [];
  for (let i = 0; i < ribs; i++) {
    const u = i / (ribs - 1);
    const a = -Math.PI / 2 + (u - 0.5) * 1.5;
    const len = H * (0.52 + Math.sin(u * Math.PI) * 0.34);
    const x1 = cx + Math.cos(a) * len, y1 = base - H * 0.24 + Math.sin(a) * len;
    p.curve([{ x: cx, y: base - H * 0.24 },
      { x: cx + Math.cos(a) * len * 0.55 + (rng() - 0.5) * 2, y: base - H * 0.24 + Math.sin(a) * len * 0.5 },
      { x: x1, y: y1 }], 1.3 * S, 0.55 * S, { mat, dome: 1.1 * S, steps: 8, tint: 0.02 });
    tips.push({ x: x1, y: y1 });
  }
  for (let i = 1; i < ribs; i++) {
    const a = tips[i - 1], b = tips[i];
    for (const k of [0.45, 0.75]) {
      p.capsule(lerp(cx, a.x, k), lerp(base - H * 0.24, a.y, k),
        lerp(cx, b.x, k), lerp(base - H * 0.24, b.y, k), 0.5 * S, 0.5 * S,
        { mat, dome: 0.5 * S, tint: -0.05 });
    }
  }
  p.speckle(mat, { density: 0.1, amp: 0.34, seed: 9 });
  return bake(p, cx, base, '#20101c');
}

function paintBrain(S, rng, mat) {
  const W = 18 * S, H = 12 * S;
  const p = new Painter(Math.ceil(W) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, base = p.h - 5;
  p.ellipse(cx, base - H * 0.45, W * 0.5, H * 0.55, { mat, dome: W * 0.42, tint: 0.02 });
  // grooves: the thing that makes it a brain and not a bun
  for (let i = 0; i < 7; i++) {
    const y = base - H * 0.20 - i * H * 0.11;
    const w = W * 0.46 * Math.sqrt(Math.max(0, 1 - Math.pow((i - 1.6) / 5.2, 2)));
    p.curve([{ x: cx - w, y }, { x: cx + (rng() - 0.5) * 4 * S, y: y - 1.4 * S }, { x: cx + w, y }],
      0.7 * S, 0.7 * S, { mat, mask: true, dome: -1.0 * S, steps: 8, tint: -0.28 });
  }
  p.grain(mat, { freq: 1.1 / S, amp: 0.2, seed: 17 });
  return bake(p, cx, base, '#20101c');
}

function paintTubes(S, rng, mat) {
  const W = 16 * S, H = 20 * S;
  const p = new Painter(Math.ceil(W) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, base = p.h - 5;
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 3.6 * S + (rng() - 0.5) * 2;
    const h = H * (0.45 + rng() * 0.5);
    const r = (1.5 + rng() * 0.9) * S;
    p.capsule(cx + dx, base, cx + dx + (rng() - 0.5) * 3, base - h, r, r * 0.92,
      { mat, dome: r * 0.95, tint: -0.02 + i * 0.03 });
    p.ellipse(cx + dx + (rng() - 0.5) * 3, base - h, r * 0.62, r * 0.42,
      { mat, mask: true, dome: -r * 0.8, tint: -0.34 });
  }
  p.grain(mat, { freq: 1.0 / S, amp: 0.16, seed: 23 });
  return bake(p, cx, base, '#20101c');
}

function paintAnemone(S, rng, mat) {
  const W = 16 * S, H = 14 * S;
  const p = new Painter(Math.ceil(W) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, base = p.h - 5;
  p.ellipse(cx, base - H * 0.12, W * 0.26, H * 0.16, { mat, dome: W * 0.2, tint: -0.06 });
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.4;
    const len = H * (0.45 + rng() * 0.4);
    const bend = (rng() - 0.5) * 0.8;
    p.curve([{ x: cx, y: base - H * 0.16 },
      { x: cx + Math.cos(a + bend) * len * 0.5, y: base - H * 0.16 + Math.sin(a) * len * 0.55 },
      { x: cx + Math.cos(a + bend * 2) * len, y: base - H * 0.16 + Math.sin(a) * len }],
      0.9 * S, 0.35 * S, { mat, dome: 0.9 * S, steps: 7, tint: 0.10 });
  }
  return bake(p, cx, base, '#20101c');
}

/** Soft weed: a clump of blades that lean together and lift in the current. */
function paintWeed(S, rng) {
  const H = 26 * S, W = 14 * S;
  const p = new Painter(Math.ceil(W * 2) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, base = p.h - 5;
  const n = 7 + Math.floor(rng() * 6);
  for (let i = 0; i < n; i++) {
    const dx = (rng() - 0.5) * W * 0.7;
    const h = H * (0.45 + rng() * 0.55);
    const bend = (rng() - 0.5) * W * 0.8;
    p.curve([{ x: cx + dx, y: base },
      { x: cx + dx + bend * 0.4, y: base - h * 0.55 },
      { x: cx + dx + bend, y: base - h }], 1.3 * S, 0.35 * S,
      { mat: 'weed', dome: 1.1 * S, steps: 9, tint: -0.08 + (i % 3) * 0.07 });
  }
  p.grain('weed', { freq: 1.0 / S, amp: 0.16, seed: 29 });
  return bake(p, cx, base, '#0a1d13');
}

// ---------------------------------------------------------------------------
// the small fixed things

function paintUrchin(S, rng) {
  const R = 5 * S;
  const p = new Painter(Math.ceil(R * 4) + 8, Math.ceil(R * 4) + 8);
  const cx = p.w / 2, base = p.h - 4;
  for (let i = 0; i < 22; i++) {
    const a = -Math.PI + (i / 21) * Math.PI;
    const len = R * (1.3 + rng() * 0.9);
    p.capsule(cx, base - R * 0.5, cx + Math.cos(a) * len, base - R * 0.5 + Math.sin(a) * len,
      0.7 * S, 0.25 * S, { mat: 'coralViolet', dome: 0.6 * S, tint: -0.1 });
  }
  p.ellipse(cx, base - R * 0.5, R, R * 0.82, { mat: 'coralViolet', dome: R * 0.8, tint: 0.06 });
  return bake(p, cx, base, '#160c1e');
}

function paintStar(S, rng) {
  const R = 6 * S;
  const p = new Painter(Math.ceil(R * 2.6) + 8, Math.ceil(R * 1.8) + 8);
  const cx = p.w / 2, base = p.h - 4;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI + (i / 4) * Math.PI;
    p.capsule(cx, base - R * 0.22, cx + Math.cos(a) * R, base - R * 0.22 + Math.sin(a) * R * 0.55,
      1.5 * S, 0.7 * S, { mat: 'coralGold', dome: 1.2 * S, tint: 0.04 });
  }
  p.ellipse(cx, base - R * 0.22, R * 0.42, R * 0.3, { mat: 'coralGold', dome: R * 0.35, tint: 0.1 });
  p.speckle('coralGold', { density: 0.16, amp: 0.4, seed: 3 });
  return bake(p, cx, base, '#241804');
}

function paintShell(S, rng) {
  const W = 7 * S;
  const p = new Painter(Math.ceil(W * 2) + 8, Math.ceil(W * 1.6) + 8);
  const cx = p.w / 2, base = p.h - 4;
  p.ellipse(cx, base - W * 0.28, W * 0.55, W * 0.42, { mat: 'petalWhite', dome: W * 0.4, tint: 0.04 });
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI;
    p.capsule(cx, base - W * 0.06, cx + Math.cos(a) * W * 0.5, base - W * 0.06 + Math.sin(a) * W * 0.42,
      0.5 * S, 0.4 * S, { mat: 'petalWhite', mask: true, dome: 0.4 * S, tint: -0.2 });
  }
  return bake(p, cx, base, '#2a2620');
}

/** A crab the size of a coin, which is what everything here used to be. */
function paintCrablet(S, rng) {
  const W = 9 * S, H = 6 * S;
  const p = new Painter(Math.ceil(W * 2.4) + 8, Math.ceil(H * 2.4) + 8);
  const cx = p.w / 2, base = p.h - 4;
  const mat = rng() < 0.5 ? 'coralPink' : 'coralGold';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const a = -0.3 - t * 0.7;
      p.capsule(cx + side * W * 0.22, base - H * 0.5,
        cx + side * (W * 0.5 + t * W * 0.32), base - H * 0.5 + Math.sin(a) * -H * 0.1 + H * 0.5,
        0.75 * S, 0.4 * S, { mat, dome: 0.7 * S, tint: -0.12 });
    }
    // one claw each side, held up
    p.capsule(cx + side * W * 0.3, base - H * 0.62, cx + side * W * 0.64, base - H * 0.88,
      1.0 * S, 0.8 * S, { mat, dome: 0.9 * S, tint: 0.04 });
    p.ellipse(cx + side * W * 0.72, base - H * 0.96, 1.5 * S, 1.1 * S, { mat, dome: 1.2 * S, tint: 0.12 });
  }
  p.ellipse(cx, base - H * 0.62, W * 0.46, H * 0.42, { mat, dome: W * 0.34, tint: 0.06 });
  for (const side of [-1, 1]) {
    p.ellipse(cx + side * W * 0.14, base - H * 0.86, 0.8 * S, 0.9 * S,
      { mat: 'eye', dome: 0.8 * S, tint: 0.1 });
  }
  p.grain(mat, { freq: 1.2 / S, amp: 0.16, seed: 7 });
  return bake(p, cx, base, '#20101c');
}

// ---------------------------------------------------------------------------
// swimmers

/**
 * A fish, in two pieces so the tail can beat. Both face +x and are drawn from
 * the middle of the body; the tail pivots about the base of the caudal
 * peduncle, which is the only joint a fish this size needs.
 */
function paintFish(kind, S, rng) {
  const spec = {
    dart: { L: 9, H: 3.2, mat: 'scaleSilver', fin: 0.5, stripe: 0 },
    reef: { L: 10, H: 5.6, mat: 'scaleGold', fin: 1.0, stripe: 3 },
    blue: { L: 12, H: 4.4, mat: 'scaleBlue', fin: 0.8, stripe: 1 },
    big: { L: 22, H: 8.5, mat: 'scaleSilver', fin: 1.1, stripe: 0 },
  }[kind] || { L: 10, H: 4, mat: 'scaleSilver', fin: 0.8, stripe: 0 };
  const L = spec.L * S, H = spec.H * S;
  const mat = spec.mat;

  const body = new Painter(Math.ceil(L * 2.2) + 10, Math.ceil(H * 3.2) + 10);
  const bx = body.w * 0.44, by = body.h / 2;
  // the fish itself: a teardrop, fattest a third of the way back
  body.field(bx - L * 0.6, by - H, bx + L * 0.6, by + H, (x, y) => {
    const u = (x - (bx - L * 0.52)) / L;
    if (u < 0 || u > 1) return null;
    const half = H * 0.5 * Math.sin(Math.pow(u, 0.62) * Math.PI) * (1.05 - u * 0.25);
    const d = (y - by) / Math.max(0.4, half);
    if (Math.abs(d) > 1) return null;
    const dz = Math.sqrt(clamp01(1 - d * d));
    return { h: dz * H * 0.42, tint: -0.05 + (d < -0.2 ? 0.12 : 0) + (d > 0.4 ? -0.10 : 0) };
  }, { mat });
  // dorsal and pelvic fins
  body.poly([{ x: bx - L * 0.16, y: by - H * 0.42 }, { x: bx + L * 0.06, y: by - H * (0.5 + spec.fin * 0.42) },
    { x: bx + L * 0.24, y: by - H * 0.36 }], { mat, dome: 0.9 * S, tint: 0.08 });
  body.poly([{ x: bx - L * 0.04, y: by + H * 0.3 }, { x: bx + L * 0.10, y: by + H * (0.42 + spec.fin * 0.34) },
    { x: bx + L * 0.22, y: by + H * 0.26 }], { mat, dome: 0.8 * S, tint: -0.06 });
  // pectoral, set back from the gill
  body.ellipse(bx - L * 0.12, by + H * 0.14, L * 0.10, H * 0.20,
    { mat, dome: 0.8 * S, rot: 0.5, tint: 0.14 });
  // eye and gill
  body.ellipse(bx - L * 0.38, by - H * 0.10, Math.max(0.8, 0.9 * S), Math.max(0.8, 0.9 * S),
    { mat: 'eye', dome: 1.1 * S, tint: 0.1 });
  body.capsule(bx - L * 0.26, by - H * 0.26, bx - L * 0.28, by + H * 0.24, 0.45 * S, 0.45 * S,
    { mat, mask: true, dome: 0.5 * S, tint: -0.22 });
  for (let i = 0; i < spec.stripe; i++) {
    const u = 0.1 + i * 0.22;
    body.capsule(bx - L * 0.4 + u * L, by - H * 0.5, bx - L * 0.46 + u * L, by + H * 0.45,
      0.9 * S, 0.9 * S, { mat, mask: true, dome: 0.6 * S, tint: -0.26 });
  }
  body.grain(mat, { freq: 1.4 / S, amp: 0.12, seed: 13 });

  const tail = new Painter(Math.ceil(L * 0.9) + 8, Math.ceil(H * 2.4) + 8);
  const tx = 4, ty = tail.h / 2;
  tail.poly([{ x: tx, y: ty }, { x: tx + L * 0.34, y: ty - H * (0.55 + spec.fin * 0.4) },
    { x: tx + L * 0.24, y: ty }, { x: tx + L * 0.34, y: ty + H * (0.55 + spec.fin * 0.4) }],
    { mat, dome: 0.9 * S, tint: 0.02 });
  return {
    body: bake(body, bx, by, '#0d141a', { L, H }),
    tail: bake(tail, tx, ty, '#0d141a'),
    joint: { x: L * 0.5, y: 0 },
    L, H,
  };
}

function paintJelly(S) {
  const R = 7 * S;
  const p = new Painter(Math.ceil(R * 2.6) + 8, Math.ceil(R * 5) + 8);
  const cx = p.w / 2, cy = R + 4;
  p.ellipse(cx, cy, R, R * 0.78, { mat: 'jelly', dome: R * 0.9, tint: 0.05 });
  p.ellipse(cx, cy + R * 0.4, R * 0.9, R * 0.3, { mat: 'jelly', mask: true, dome: -R * 0.4, tint: -0.2 });
  for (let i = 0; i < 7; i++) {
    const dx = (i - 3) * R * 0.25;
    p.curve([{ x: cx + dx, y: cy + R * 0.5 },
      { x: cx + dx * 1.6, y: cy + R * 1.6 },
      { x: cx + dx * 0.7, y: cy + R * 2.9 }], 0.6 * S, 0.25 * S,
      { mat: 'jelly', dome: 0.5 * S, steps: 8, tint: 0.16 });
  }
  return bake(p, cx, cy, '#1a1328', { R });
}

// ---------------------------------------------------------------------------

/** Anything fixed to the seabed. `seed` picks the variant and the colour. */
export function reefArt(kind, S = 1, seed = 0) {
  const k = `${kind}:${S.toFixed(2)}:${seed}`;
  let v = cache.get(k);
  if (v) return v;
  const rng = mulberry32((seed * 2654435761) >>> 0);
  // colour follows the kind as well as the seed, so a reef is not all one hue
  const PALETTE = {
    branch: ['coralPink', 'coralGold', 'coralPink', 'coralTeal'],
    fan: ['coralTeal', 'coralViolet', 'coralGold'],
    brain: ['coralGold', 'coralTeal', 'coralGold'],
    tubes: ['coralViolet', 'coralTeal', 'coralGold'],
    anemone: ['coralPink', 'coralViolet', 'coralTeal'],
  }[kind] || CORAL_MATS;
  const mat = PALETTE[Math.floor(rng() * PALETTE.length)];
  switch (kind) {
    case 'branch': v = paintBranch(S, rng, mat); break;
    case 'fan': v = paintFan(S, rng, mat); break;
    case 'brain': v = paintBrain(S, rng, mat); break;
    case 'tubes': v = paintTubes(S, rng, mat); break;
    case 'anemone': v = paintAnemone(S, rng, mat); break;
    case 'weed': v = paintWeed(S, rng); break;
    case 'urchin': v = paintUrchin(S, rng); break;
    case 'star': v = paintStar(S, rng); break;
    case 'shell': v = paintShell(S, rng); break;
    case 'crablet': v = paintCrablet(S, rng); break;
    default: v = paintBrain(S, rng, mat); break;
  }
  cache.set(k, v);
  return v;
}

export function fishArt(kind, S = 1) {
  const k = `fish:${kind}:${S.toFixed(2)}`;
  let v = cache.get(k);
  if (!v) { v = paintFish(kind, S, mulberry32(99)); cache.set(k, v); }
  return v;
}

export function jellyArt(S = 1) {
  const k = `jelly:${S.toFixed(2)}`;
  let v = cache.get(k);
  if (!v) { v = paintJelly(S); cache.set(k, v); }
  return v;
}

/**
 * A blue whale, which is the largest animal that has ever lived and is
 * therefore the correct thing to put over the head of a crab the size of a
 * dinner plate. Painted long and low with the mouth line running most of its
 * length, ventral pleats under the throat, a dorsal fin so small it is nearly
 * an apology, and flukes wider than the crab is long.
 *
 * The point of it is scale. It is drawn at one size and then thrown across the
 * top of the column a very long way off, moving slowly, and the only thing you
 * are supposed to take from it is that you are small.
 */
function paintWhale(S = 1) {
  const L = 210 * S, H = 46 * S;
  const pad = Math.ceil(14 * S);
  const p = new Painter(Math.ceil(L + 40 * S) + pad * 2, Math.ceil(H * 2.2) + pad * 2);
  const cy = p.h / 2;
  const x0 = pad + 8 * S;

  // the spine: a long curve with the mass forward of the middle
  const spine = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    spine.push({
      x: x0 + t * L,
      y: cy + Math.sin(t * Math.PI) * -1.5 * S + t * 2.5 * S,
      r: (1 - Math.pow(Math.abs(t - 0.26) / 0.74, 1.55)) * H * 0.5 + 1.2 * S,
    });
  }
  for (let i = 1; i < spine.length; i++) {
    const a2 = spine[i - 1], b2 = spine[i];
    p.capsule(a2.x, a2.y, b2.x, b2.y, Math.max(0.8, a2.r), Math.max(0.8, b2.r),
      { mat: 'whale', dome: Math.max(1, a2.r * 0.9), tint: -0.02 });
  }
  // the rostrum: the head is a flattened wedge, not a point
  p.capsule(x0 + 2 * S, cy - 1 * S, x0 + L * 0.17, cy, H * 0.20, H * 0.42,
    { mat: 'whale', dome: H * 0.24, tint: 0.04 });
  // the mouth line, running back past the eye
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    const x = x0 + t * L * 0.30;
    p.rect(x, cy + H * (0.10 + t * 0.06), Math.max(1, S), Math.max(1, S),
      { mat: 'whaleDark', dome: 0.5, lift: 2 });
  }
  // ventral pleats under the throat, which is what makes it a rorqual
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const x = x0 + L * (0.05 + t * 0.26);
    p.capsule(x, cy + H * 0.12, x + 1.5 * S, cy + H * 0.40, 0.7 * S, 0.5 * S,
      { mat: 'whaleDark', mask: true, dome: 0.6, tint: -0.18 });
  }
  // the eye, small and low and behind the jaw
  p.ellipse(x0 + L * 0.135, cy + H * 0.13, 1.5 * S, 1.2 * S,
    { mat: 'eye', dome: 1.4 * S, tint: 0.1 });
  // the blowhole ridge
  p.capsule(x0 + L * 0.10, cy - H * 0.26, x0 + L * 0.16, cy - H * 0.27, 1.6 * S, 1.1 * S,
    { mat: 'whaleDark', dome: 1.2, tint: 0.06 });
  // the flipper, long and thin and swept back
  p.curve([{ x: x0 + L * 0.24, y: cy + H * 0.22 },
    { x: x0 + L * 0.33, y: cy + H * 0.55 },
    { x: x0 + L * 0.40, y: cy + H * 0.72 }], 3.4 * S, 0.9 * S,
    { mat: 'whaleDark', dome: 2 * S, steps: 10, tint: -0.06 });
  // the dorsal fin, tiny and three quarters of the way back
  p.poly([
    { x: x0 + L * 0.74, y: cy - H * 0.30 },
    { x: x0 + L * 0.79, y: cy - H * 0.48 },
    { x: x0 + L * 0.80, y: cy - H * 0.26 },
  ], { mat: 'whale', dome: 2 * S, feather: 1.5, tint: 0.02 });
  // the peduncle flattens, and then the flukes
  const tx = x0 + L;
  p.poly([
    { x: tx - 6 * S, y: cy + 2 * S },
    { x: tx + 24 * S, y: cy - 18 * S },
    { x: tx + 30 * S, y: cy - 12 * S },
    { x: tx + 6 * S, y: cy + 3 * S },
  ], { mat: 'whale', dome: 2.4 * S, feather: 1.6, tint: 0.05 });
  p.poly([
    { x: tx - 6 * S, y: cy + 2 * S },
    { x: tx + 24 * S, y: cy + 20 * S },
    { x: tx + 30 * S, y: cy + 14 * S },
    { x: tx + 6 * S, y: cy + 1 * S },
  ], { mat: 'whale', dome: 2.4 * S, feather: 1.6, tint: -0.04 });

  // mottling: a blue whale is grey with a wash of paler blotches, and that
  // pattern is how individuals are told apart
  p.speckle('whale', { density: 0.10, amp: 0.30, seed: 41 });
  p.grain('whale', { freq: 0.22, amp: 0.16, seed: 7, height: 0.5 });
  p.smoothHeight(1, 0.4);
  return {
    cv: p.resolve(MATS, { ...LIGHT, ambient: 0.52, outline: 1, outlineColor: '#0b1f2c' }),
    ox: x0, oy: cy, L, H,
  };
}

/**
 * A reef shark. It is not a whale and it must not read as a small one - so
 * everything about it is the opposite shape: a pointed snout, a body whose
 * widest point is right at the shoulder and which tapers all the way to the
 * tail, a tall hooked dorsal fin, wing-like pectorals held out flat, and a
 * tail that is a scythe rather than a pair of flukes. Grey over, white under,
 * with the counter-shading line running the length of it.
 *
 * It patrols the drop-off: not interested in you, not interested in anything,
 * doing the one long circuit it does every day of its life.
 */
function paintShark(S = 1) {
  const L = 96 * S, H = 22 * S;
  const pad = Math.ceil(10 * S);
  const p = new Painter(Math.ceil(L + 30 * S) + pad * 2, Math.ceil(H * 2.6) + pad * 2);
  const cy = p.h / 2;
  const x0 = pad + 6 * S;

  // the body: widest at a quarter and tapering hard to the peduncle
  const N = 24;
  const spine = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const taper = t < 0.22
      ? Math.pow(t / 0.22, 0.62)
      : Math.pow(1 - (t - 0.22) / 0.78, 1.25);
    spine.push({ x: x0 + t * L, y: cy + t * 1.6 * S, r: taper * H * 0.5 + 0.8 * S });
  }
  for (let i = 1; i < spine.length; i++) {
    const a2 = spine[i - 1], b2 = spine[i];
    p.capsule(a2.x, a2.y, b2.x, b2.y, Math.max(0.8, a2.r), Math.max(0.8, b2.r),
      { mat: 'whale', dome: Math.max(1, a2.r * 0.95), tint: -0.06 });
  }
  // the snout, which on a reef shark is a blunt point rather than a beak
  p.capsule(x0 - 2 * S, cy - 0.6 * S, x0 + L * 0.10, cy, H * 0.14, H * 0.34,
    { mat: 'whale', dome: H * 0.2, tint: 0.02 });
  // Counter-shading, which is the whole read of a shark from the side: dark
  // over, white under, and a hard wavering line between them.
  p.field(x0 - 4 * S, cy - H * 0.6, x0 + L * 0.95, cy + H * 0.02, (x, y) => {
    const t = clamp01((x - x0) / L);
    const edge = cy + H * (0.04 + Math.sin(t * 2.4) * 0.04);
    if (y > edge) return null;
    return { h: 0, tint: -0.30 - clamp01((edge - y) / (H * 0.5)) * 0.16 };
  }, { mat: 'whale', mask: true });
  p.field(x0, cy + H * 0.02, x0 + L * 0.92, cy + H * 0.55, (x, y) => {
    const t = (x - x0) / L;
    const edge = cy + H * (0.04 + Math.sin(t * 2.4) * 0.04);
    if (y < edge) return null;
    return { h: 0, tint: 0.40 };
  }, { mat: 'whale', mask: true });
  // gill slits
  for (let i = 0; i < 5; i++) {
    const x = x0 + L * (0.19 + i * 0.028);
    p.capsule(x, cy - H * 0.10, x - 0.6 * S, cy + H * 0.16, 0.55 * S, 0.5 * S,
      { mat: 'whaleDark', mask: true, dome: 0.6, tint: -0.22 });
  }
  // the eye: small, black, and set forward on the side of the head
  p.ellipse(x0 + L * 0.11, cy - H * 0.06, 1.3 * S, 1.1 * S,
    { mat: 'eye', dome: 1.3 * S, tint: 0.06 });
  // Every fin comes to a point. A fin with a flat end is a rectangle, and a
  // rectangle stuck on a fish is the thing that makes it look like a toy.
  // the dorsal: tall, raked hard back, hooked at the tip
  p.poly([
    { x: x0 + L * 0.32, y: cy - H * 0.40 },
    { x: x0 + L * 0.47, y: cy - H * 1.22 },
    { x: x0 + L * 0.49, y: cy - H * 1.18 },
    { x: x0 + L * 0.50, y: cy - H * 0.36 },
  ], { mat: 'whale', dome: 2.4 * S, feather: 1, tint: -0.22 });
  // a second, small dorsal far back - the detail that says shark and not fish
  p.poly([
    { x: x0 + L * 0.75, y: cy - H * 0.18 },
    { x: x0 + L * 0.83, y: cy - H * 0.46 },
    { x: x0 + L * 0.84, y: cy - H * 0.16 },
  ], { mat: 'whale', dome: 1.3 * S, feather: 0.8, tint: -0.20 });
  // the pectorals, held out flat and swept, tapering to a tip
  p.poly([
    { x: x0 + L * 0.21, y: cy + H * 0.18 },
    { x: x0 + L * 0.40, y: cy + H * 1.02 },
    { x: x0 + L * 0.42, y: cy + H * 0.96 },
    { x: x0 + L * 0.31, y: cy + H * 0.16 },
  ], { mat: 'whaleDark', dome: 1.6 * S, feather: 0.9, tint: -0.04 });
  // the anal fin
  p.poly([
    { x: x0 + L * 0.70, y: cy + H * 0.16 },
    { x: x0 + L * 0.80, y: cy + H * 0.48 },
    { x: x0 + L * 0.81, y: cy + H * 0.14 },
  ], { mat: 'whaleDark', dome: 1.1 * S, feather: 0.8, tint: -0.02 });
  // the tail: the upper lobe far longer than the lower, both to a point -
  // the one silhouette nobody mistakes for anything else
  const tx = x0 + L;
  p.poly([
    { x: tx - 5 * S, y: cy + 1 * S },
    { x: tx + 26 * S, y: cy - 24 * S },
    { x: tx + 27 * S, y: cy - 21 * S },
    { x: tx + 5 * S, y: cy + 3 * S },
  ], { mat: 'whale', dome: 2 * S, feather: 1, tint: -0.16 });
  p.poly([
    { x: tx - 5 * S, y: cy + 1 * S },
    { x: tx + 15 * S, y: cy + 13 * S },
    { x: tx + 15 * S, y: cy + 10 * S },
    { x: tx + 3 * S, y: cy },
  ], { mat: 'whale', dome: 1.6 * S, feather: 0.8, tint: -0.22 });

  p.speckle('whale', { density: 0.05, amp: 0.18, seed: 23 });
  p.grain('whale', { freq: 0.30, amp: 0.12, seed: 13, height: 0.5 });
  p.smoothHeight(1, 0.4);
  return {
    cv: p.resolve(MATS, { ...LIGHT, ambient: 0.48, outline: 1, outlineColor: '#0b1f2c' }),
    ox: x0, oy: cy, L, H,
  };
}

export function sharkArt(S = 1) {
  const k = `shark:${S.toFixed(2)}`;
  let v = cache.get(k);
  if (!v) { v = paintShark(S); cache.set(k, v); }
  return v;
}

export function whaleArt(S = 1) {
  const k = `whale:${S.toFixed(2)}`;
  let v = cache.get(k);
  if (!v) { v = paintWhale(S); cache.set(k, v); }
  return v;
}

export const REEF_KINDS = ['branch', 'fan', 'brain', 'tubes', 'anemone', 'weed', 'weed', 'branch', 'fan'];
export const FLOOR_KINDS = ['urchin', 'star', 'shell'];
export const FISH_KINDS = ['dart', 'reef', 'blue'];
