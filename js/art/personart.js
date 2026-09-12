// CRABDEN - the people, painted.
//
// Dr. Vess used to be a downsampled photograph of a sprite sheet. She is now
// made the same way as everything else in this world: height fields, material
// ramps, one light, a hard outline. That means she can be posed rather than
// flipped through - every joint is a separate baked piece and the animation is
// a skeleton, so she can crouch over a dig, write while riding a moving crab,
// point at a thing she has just noticed, and carry whatever she is holding in
// a hand that is actually at the end of her arm.
//
// Everything faces RIGHT and is drawn relative to the hip.

import { Painter } from '../render/pixel.js';
import { withMaterials } from '../lib/palette.js';
import { clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.58, lightY: -0.66, lightZ: 0.42, ambient: 0.40, dither: 0.7 };
const FAR = { ...LIGHT, ambient: 0.27 };

/**
 * Field kit bleached by eleven years of sun, over a lot of dust. Each person
 * gets the same materials with different ramps swapped in, so the Elder is
 * recognisably the same species of drawing.
 */
const MATS = withMaterials({
  coat: { ramp: ['#221f14', '#33301d', '#464227', '#5a5533', '#6f6941', '#857e51', '#9c9466', '#b4ac80'],
    diffuse: 0.80, rim: 0.30, ao: 0.12, normalScale: 0.58, outline: '#221e12' },
  shirt: { ramp: ['#43301f', '#5b432c', '#74583a', '#8d6e4a', '#a5865d', '#bda074', '#d3bb92', '#e7d6b6'],
    diffuse: 0.78, rim: 0.26, ao: 0.11, normalScale: 0.52, outline: '#241a10' },
  trouser: { ramp: ['#20222a', '#2f323d', '#414553', '#545a6b', '#6a7183', '#828a9d', '#9ea5b6', '#bec4d0'],
    diffuse: 0.76, rim: 0.32, ao: 0.12, normalScale: 0.55, outline: '#14161d' },
  scarf: { ramp: ['#3a1212', '#541c1a', '#712a23', '#8e3a2c', '#a85039', '#c06a4d', '#d48a69', '#e6ae8f'],
    diffuse: 0.80, rim: 0.36, ao: 0.10, normalScale: 0.50, outline: '#240a0a' },
  hat: { ramp: ['#2c2317', '#413523', '#594931', '#726040', '#8b7852', '#a49169', '#bdab86', '#d5c6a9'],
    diffuse: 0.76, rim: 0.28, ao: 0.13, normalScale: 0.62, outline: '#1a1410' },
  hair: { ramp: ['#140e0b', '#221610', '#322219', '#432e22', '#553c2d', '#6a4d3a', '#82644c', '#9d8166'],
    diffuse: 0.72, rim: 0.42, ao: 0.13, normalScale: 0.52, outline: '#0d0806' },
  lens: { ramp: ['#111c22', '#1a2c34', '#264048', '#33565f', '#437078', '#5a8e96', '#7cb0b8', '#aad6dc'],
    diffuse: 0.55, rim: 0.80, spec: 0.95, ao: 0.05, normalScale: 0.6, outline: '#0a1114' },
  boot: { ramp: ['#20140c', '#331f13', '#48301d', '#5e4127', '#755534', '#8d6c45', '#a5855b', '#bda078' ],
    diffuse: 0.74, rim: 0.30, ao: 0.14, normalScale: 0.58, outline: '#140c07' },
  paper: { ramp: ['#544f45', '#6d675a', '#868070', '#9f9887', '#b7b09e', '#cfc8b6', '#e4dece', '#f6f2e6'],
    diffuse: 0.84, rim: 0.20, ao: 0.08, normalScale: 0.4, outline: '#2a2620' },
});

// ---------------------------------------------------------------------------
// the parts

/** Every part comes back the same shape: a canvas and where its joint is. */
function bake(p, ox, oy, far, extra = {}) {
  return {
    cv: p.resolve(MATS, { ...(far ? FAR : LIGHT), outline: 1,
      outlineColor: far ? '#100b07' : '#191308' }),
    ox, oy, ...extra,
  };
}

/**
 * The torso: shoulders, a chest, a waist and hips, in that order, with a coat
 * over a shirt and the coat cut away down the front so there is something
 * underneath it. Painted from the hip up, because the hip is where the
 * skeleton is rooted.
 */
function paintTorso(K, far) {
  const W = 9.5 * K, H = 12.2 * K;
  const pad = Math.ceil(7 * K) + 5;
  const p = new Painter(Math.ceil(W * 2.0) + pad, Math.ceil(H) + pad * 2);
  const cx = p.w * 0.5, hipY = p.h - pad;
  const topY = hipY - H;

  // the profile of a person: wide at the shoulder, in at the waist, out again
  const PROF = [[0.00, 0.44], [0.10, 0.60], [0.26, 0.56], [0.46, 0.48],
    [0.68, 0.44], [0.88, 0.48], [1.00, 0.48]];
  const half = (v) => {
    for (let i = 1; i < PROF.length; i++) {
      if (v <= PROF[i][0]) {
        const t = (v - PROF[i - 1][0]) / (PROF[i][0] - PROF[i - 1][0]);
        return W * lerp(PROF[i - 1][1], PROF[i][1], t * t * (3 - 2 * t));
      }
    }
    return W * PROF[PROF.length - 1][1];
  };
  const mid = (v) => cx + (0.40 - v) * W * 0.12;

  const body = (mat, shrink, cut) => {
    p.field(cx - W, topY - 1, cx + W, hipY + 2, (x, y) => {
      const v = clamp01((y - topY) / H);
      const hw = half(v) * shrink;
      const d = (x - mid(v)) / hw;
      if (Math.abs(d) > 1) return null;
      if (cut) {
        // the coat hangs open, wider the further down it falls
        const o = 0.04 + v * 0.30;
        if (d > o && d < o + 0.40 && v > 0.20) return null;
      }
      const dz = Math.sqrt(clamp01(1 - d * d));
      return { h: dz * W * 0.46 * shrink, tint: -0.03 + (v < 0.14 ? 0.09 : 0) + (d < -0.55 ? -0.09 : 0) };
    }, { mat });
  };
  body('shirt', 0.80, false);
  body('coat', 1.0, true);

  // shoulder caps, so an arm has something to come out of
  for (const sx of [-0.44, 0.36]) {
    p.ellipse(cx + W * sx, topY + H * 0.11, W * 0.20, H * 0.075,
      { mat: 'coat', dome: W * 0.24, tint: sx < 0 ? -0.04 : 0.08 });
  }

  p.grain('coat', { freq: 0.5 / K, amp: 0.15, seed: 7 });
  p.ridges('coat', { angle: 1.32, freq: 0.85 / K, amp: 0.11, height: 0.55 * K, seed: 3, warp: 1.5 });
  p.grain('shirt', { freq: 0.8 / K, amp: 0.14, seed: 11 });

  // lapels, turned back off the opening
  p.curve([{ x: cx + W * 0.02, y: topY + H * 0.10 }, { x: cx + W * 0.26, y: topY + H * 0.28 },
    { x: cx + W * 0.16, y: topY + H * 0.52 }], 1.5 * K, 0.8 * K,
    { mat: 'coat', dome: 1.4 * K, steps: 10, tint: 0.13 });
  p.curve([{ x: cx - W * 0.24, y: topY + H * 0.09 }, { x: cx - W * 0.38, y: topY + H * 0.26 },
    { x: cx - W * 0.32, y: topY + H * 0.48 }], 1.3 * K, 0.7 * K,
    { mat: 'coat', dome: 1.3 * K, steps: 10, tint: 0.07 });

  // sweat, because it is forty-six degrees and she will not stop working
  p.field(cx - W, topY + H * 0.22, cx + W, hipY, (x, y) => {
    const d = Math.hypot((x - cx + W * 0.22) / (W * 0.34), (y - topY - H * 0.50) / (H * 0.28));
    if (d > 1) return null;
    return { h: 0, tint: -(1 - d) * 0.20 };
  }, { mat: 'coat', mask: true });

  // satchel strap one way, sample bandolier the other
  p.capsule(cx - W * 0.34, topY + H * 0.10, cx + W * 0.24, hipY - H * 0.08, 1.3 * K, 1.2 * K,
    { mat: 'boot', dome: 1.2 * K, tint: 0.06 });
  p.capsule(cx + W * 0.28, topY + H * 0.11, cx - W * 0.22, hipY - H * 0.12, 1.1 * K, 1.0 * K,
    { mat: 'canvasBag', dome: 1.0 * K, tint: -0.02 });
  for (let i = 0; i < 4; i++) {
    const t = 0.22 + i * 0.17;
    const vx = lerp(cx + W * 0.26, cx - W * 0.20, t), vy = lerp(topY + H * 0.20, hipY - H * 0.14, t);
    p.capsule(vx + 0.9 * K, vy, vx - 0.2 * K, vy + 2.0 * K, 0.8 * K, 0.7 * K,
      { mat: 'glass', dome: 0.8 * K, tint: 0.12 });
  }

  // collar, scarf tail, belt, buckle
  p.capsule(cx - W * 0.22, topY + H * 0.04, cx + W * 0.20, topY + H * 0.06, 1.3 * K, 1.2 * K,
    { mat: 'scarf', dome: 1.3 * K, tint: 0.06 });
  p.curve([{ x: cx + W * 0.10, y: topY + H * 0.10 }, { x: cx + W * 0.36, y: topY + H * 0.26 },
    { x: cx + W * 0.24, y: topY + H * 0.46 }], 1.3 * K, 0.6 * K,
    { mat: 'scarf', dome: 1.2 * K, steps: 10, tint: -0.05 });
  p.rect(cx - W * 0.48, hipY - H * 0.17, W * 0.96, 1.9 * K,
    { mat: 'boot', mask: true, dome: 1.5 * K, tint: 0.05 });
  p.ellipse(cx + W * 0.06, hipY - H * 0.14, 1.5 * K, 1.3 * K, { mat: 'metal', dome: 1.3 * K, tint: 0.14 });

  p.smoothHeight(1, 0.4);
  return bake(p, cx, hipY, far, { W, H, topY: topY - hipY });
}

/**
 * The head. A skull with a jaw, an ear, a nose, one eye you can read, hair
 * tied back, and a hat that sits on top of it rather than swallowing it.
 * `mood` runs 0..7 and moves only the brow, the lid and the mouth, which is
 * all a face this size needs.
 */
/**
 * Every expression she has. `lid` closes the eye, `brow` tilts it, `open`
 * turns the mouth into a hole, `curl` bows a closed mouth, `wide` opens the
 * eye past normal, and the two flags add a blush or a bead of sweat.
 */
const FACES = [
  { lid: 0.00, brow: 0.00, open: 0.00, curl: 0.00, wide: 0 },                       // level
  { lid: 0.14, brow: -0.05, open: 0.00, curl: 0.06, wide: 0 },                      // wry
  { lid: -0.20, brow: -0.14, open: 0.55, curl: 0.00, wide: 0.7, sweat: 1 },         // alarmed
  { lid: 0.02, brow: 0.06, open: 0.30, curl: 0.10, wide: 0.2, blush: 1 },           // delighted
  { lid: 0.34, brow: -0.10, open: 0.00, curl: -0.09, wide: 0 },                     // sour
  { lid: -0.06, brow: 0.10, open: 0.10, curl: 0.03, wide: 0.2 },                    // asking
  { lid: 0.12, brow: 0.03, open: 0.00, curl: 0.07, wide: 0 },                       // proud
  { lid: 0.48, brow: 0.00, open: 0.00, curl: -0.04, wide: 0 },                      // weary
  { lid: -0.35, brow: -0.18, open: 0.95, curl: 0.00, wide: 1, sweat: 1 },           // shocked
  { lid: 0.40, brow: 0.04, open: 0.62, curl: 0.12, wide: 0, blush: 1 },             // laughing
  { lid: 0.20, brow: 0.12, open: 0.00, curl: 0.02, wide: 0 },                       // thinking
  { lid: -0.10, brow: 0.16, open: 0.22, curl: -0.06, wide: 0.4, sweat: 1 },         // stricken
  { lid: 0.10, brow: -0.16, open: 0.00, curl: -0.10, wide: 0 },                     // grim
  { lid: 0.30, brow: 0.05, open: 0.00, curl: 0.09, wide: 0, blush: 1 },             // fond
];
export const FACE_COUNT = FACES.length;

function paintHead(K, far, opts = {}) {
  const W = 7.4 * K, H = 7.8 * K;
  const pad = Math.ceil(8 * K) + 6;
  const p = new Painter(Math.ceil(W * 2.8) + pad, Math.ceil(H * 3.0) + pad);
  const cx = p.w * 0.46, cy = p.h * 0.52;
  const mood = opts.mood | 0;
  const neckY = cy + H * 0.68;

  // neck first, so the jaw sits over it
  p.capsule(cx - W * 0.10, cy + H * 0.28, cx - W * 0.04, neckY, 1.7 * K, 1.9 * K,
    { mat: 'skin', dome: 1.5 * K, tint: -0.18 });
  // the bun, behind everything
  p.ellipse(cx - W * 0.48, cy - H * 0.02, W * 0.23, H * 0.25, { mat: 'hair', dome: W * 0.28, tint: -0.03 });

  // skull, jaw, ear
  p.ellipse(cx, cy, W * 0.50, H * 0.50, { mat: 'skin', dome: W * 0.48, tint: 0.02 });
  p.ellipse(cx + W * 0.10, cy + H * 0.21, W * 0.35, H * 0.20, { mat: 'skin', dome: W * 0.30 });
  p.ellipse(cx - W * 0.26, cy + H * 0.06, W * 0.10, H * 0.13, { mat: 'skin', dome: W * 0.14, tint: 0.04 });

  // hair over the back and crown, and strands coming loose downwind. It goes
  // on before the face does, so nothing important ends up underneath it.
  p.field(cx - W * 0.72, cy - H * 0.58, cx + W * 0.06, cy + H * 0.20, (x, y) => {
    const a2 = (x - cx + W * 0.22) / (W * 0.46), b2 = (y - cy + H * 0.18) / (H * 0.40);
    const d = a2 * a2 + b2 * b2;
    if (d > 1) return null;
    return { h: Math.sqrt(1 - d) * W * 0.26, tint: 0.03 };
  }, { mat: 'hair' });
  // a fringe, just along the hairline
  p.capsule(cx - W * 0.18, cy - H * 0.34, cx + W * 0.24, cy - H * 0.27, 1.5 * K, 0.9 * K,
    { mat: 'hair', dome: 1.2 * K, tint: 0.06 });
  for (let i = 0; i < 4; i++) {
    p.curve([{ x: cx - W * 0.34, y: cy - H * 0.32 + i * 1.1 * K },
      { x: cx - W * 0.60, y: cy - H * 0.20 + i * 1.3 * K },
      { x: cx - W * 0.76, y: cy + H * 0.02 + i * 1.5 * K }], 0.7 * K, 0.28 * K,
      { mat: 'hair', dome: 0.7 * K, steps: 8, tint: 0.07 });
  }

  // the face, over the top of all of it
  p.capsule(cx - W * 0.02, cy - H * 0.16, cx + W * 0.36, cy - H * 0.13, 1.2 * K, 0.9 * K,
    { mat: 'skin', mask: true, dome: 1.4 * K, tint: 0.10 });
  p.ellipse(cx + W * 0.46, cy + H * 0.06, W * 0.11, H * 0.09, { mat: 'skin', dome: W * 0.26, tint: 0.13 });
  p.ellipse(cx + W * 0.28, cy + H * 0.34, W * 0.13, H * 0.09,
    { mat: 'skin', mask: true, dome: W * 0.15, tint: 0.07 });
  p.speckle('skin', { density: 0.05, amp: 0.24, seed: 19 });

  // The face. Fourteen of them, and each is only four numbers: how far the
  // lid is down, how the brow is angled, how wide the mouth opens and which
  // way its corners go. At this size that is everything a face has.
  //
  //  0 level   1 wry     2 alarmed  3 delighted  4 sour      5 asking  6 proud
  //  7 weary   8 shocked 9 laughing 10 thinking 11 stricken 12 grim   13 fond
  const F = FACES[mood] || FACES[0];
  if (!opts.goggles) {
    const open = clamp01(1 - F.lid);
    p.ellipse(cx + W * 0.25, cy - H * 0.03, W * (0.13 + F.wide * 0.05), H * 0.115 * open,
      { mat: 'eye', dome: 1.8 * K, tint: -0.08 });
    if (F.lid < 0.34) {
      p.ellipse(cx + W * 0.21, cy - H * 0.065, W * 0.055, H * 0.042,
        { mat: 'eye', mask: true, dome: 1.8 * K, tint: 0.66 });
    }
    // a lower lid, which is what makes a squint read as a squint
    if (F.lid > 0.2) {
      p.capsule(cx + W * 0.14, cy + H * 0.02, cx + W * 0.36, cy + H * 0.02, 0.7 * K, 0.6 * K,
        { mat: 'skin', mask: true, dome: 0.7 * K, tint: 0.12 });
    }
  }
  // the brow, angled
  p.capsule(cx + W * 0.09, cy - H * (0.16 - F.brow), cx + W * 0.42, cy - H * (0.14 + F.brow * 0.6),
    0.85 * K, 0.65 * K, { mat: 'hair', dome: 0.8 * K, tint: 0.05 });
  // the mouth: a line that bows, or a hole with a tongue in it
  if (F.open > 0.12) {
    p.ellipse(cx + W * 0.31, cy + H * (0.20 + F.open * 0.05), W * (0.09 + F.open * 0.06),
      H * (0.05 + F.open * 0.13), { mat: 'eye', dome: -1.2 * K, tint: -0.30 });
    p.ellipse(cx + W * 0.31, cy + H * (0.24 + F.open * 0.08), W * 0.06, H * 0.04 * F.open,
      { mat: 'scarf', mask: true, dome: 0.8 * K, tint: 0.10 });
  } else {
    p.curve([{ x: cx + W * 0.22, y: cy + H * 0.20 }, { x: cx + W * 0.32, y: cy + H * (0.20 + F.curl) },
      { x: cx + W * 0.42, y: cy + H * 0.20 }], 0.65 * K, 0.5 * K,
      { mat: 'skin', mask: true, dome: -1.1 * K, steps: 8, tint: -0.32 });
  }
  // and the extras that sell the strong ones
  if (F.blush) {
    p.ellipse(cx + W * 0.30, cy + H * 0.08, W * 0.14, H * 0.07,
      { mat: 'skin', mask: true, dome: 0.6 * K, tint: 0.22 });
  }
  if (F.sweat) {
    p.ellipse(cx - W * 0.02, cy - H * 0.30, W * 0.06, H * 0.08,
      { mat: 'lens', dome: 1.4 * K, tint: 0.34 });
  }

  // goggles: pushed up on the hat band, or pulled down over the eye
  if (!opts.noGoggles) {
    const gy = opts.goggles ? cy - H * 0.05 : cy - H * 0.44;
    p.capsule(cx - W * 0.36, gy, cx + W * 0.38, gy, 1.6 * K, 1.6 * K,
      { mat: 'boot', dome: 1.4 * K, tint: -0.05 });
    p.ellipse(cx + W * 0.26, gy, W * 0.18, H * 0.14, { mat: 'lens', dome: 2.1 * K, tint: 0.08 });
    p.ellipse(cx + W * 0.20, gy - H * 0.04, W * 0.06, H * 0.042,
      { mat: 'lens', mask: true, dome: 1.9 * K, tint: 0.55 });
  }

  // the hat: a brim above the brow and a crown sitting on it
  if (!opts.noHat) {
    const hy = cy - H * 0.54;
    p.ellipse(cx - W * 0.04, hy, W * 0.80, H * 0.110, { mat: 'hat', dome: W * 0.14, tint: 0.02 });
    p.ellipse(cx + W * 0.34, hy + H * 0.035, W * 0.42, H * 0.080,
      { mat: 'hat', dome: W * 0.11, tint: -0.05 });
    p.ellipse(cx - W * 0.06, hy - H * 0.18, W * 0.39, H * 0.21, { mat: 'hat', dome: W * 0.38, tint: 0.08 });
    p.ellipse(cx - W * 0.20, hy - H * 0.26, W * 0.16, H * 0.07,
      { mat: 'hat', mask: true, dome: -W * 0.20, tint: -0.18 });
    p.rect(cx - W * 0.40, hy - H * 0.10, W * 0.72, 1.2 * K,
      { mat: 'boot', mask: true, dome: 1.1 * K, tint: 0.03 });
    p.grain('hat', { freq: 0.55 / K, amp: 0.15, seed: 23 });
  }

  p.smoothHeight(1, 0.4);
  return bake(p, cx, neckY, far, { W, H, eye: { x: W * 0.25, y: -H * 0.03 } });
}

/** One bone. `hand`, `boot` and `cuff` put the ends on. */
function paintBone(len, r0, r1, mat, K, far, opts = {}) {
  const pad = Math.ceil(Math.max(r0, r1) * 2 + 6);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 4);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  const ft = far ? -0.18 : 0;
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - (opts.bow || 0) }, { x: x1, y: cy }],
    r0, r1, { mat, dome: r0 * 0.92, steps: 12, tint: ft });
  p.ellipse(x0, cy, r0 * 1.08, r0 * 1.02, { mat, dome: r0, tint: ft + 0.05 });
  if (opts.cuff) {
    p.capsule(x1 - 2.6 * K, cy - 0.2 * K, x1 - 1.0 * K, cy, r1 * 1.35, r1 * 1.30,
      { mat: 'coat', dome: r1 * 1.1, tint: ft + 0.08 });
  }
  if (opts.hand) {
    p.ellipse(x1 + r1 * 0.45, cy, r1 * 1.30, r1 * 1.10, { mat: 'skin', dome: r1 * 1.2, tint: ft + 0.03 });
    // thumb, so a hand reads as a hand and not a bead
    p.capsule(x1 + r1 * 0.4, cy - r1 * 0.5, x1 + r1 * 1.5, cy - r1 * 0.9, r1 * 0.42, r1 * 0.34,
      { mat: 'skin', dome: r1 * 0.5, tint: ft + 0.06 });
  }
  if (opts.knee) {
    p.ellipse(x0, cy, r0 * 1.15, r0 * 1.10, { mat, mask: true, dome: r0 * 0.6, tint: ft + 0.10 });
  }
  p.grain(mat, { freq: 0.6 / K, amp: 0.11, seed: 31 });
  return bake(p, pad, cy, far, { len });
}

/** The hat on its own, so it can be knocked off her head and land in the sand. */
function paintHat(K, far) {
  const W = 7.4 * K, H = 7.8 * K;
  const p = new Painter(Math.ceil(W * 2.2) + 8, Math.ceil(H * 1.2) + 8);
  const cx = p.w * 0.5, cy = p.h * 0.62;
  p.ellipse(cx - W * 0.04, cy, W * 0.80, H * 0.110, { mat: 'hat', dome: W * 0.14, tint: 0.02 });
  p.ellipse(cx + W * 0.34, cy + H * 0.035, W * 0.42, H * 0.080, { mat: 'hat', dome: W * 0.11, tint: -0.05 });
  p.ellipse(cx - W * 0.06, cy - H * 0.18, W * 0.39, H * 0.21, { mat: 'hat', dome: W * 0.38, tint: 0.08 });
  p.ellipse(cx - W * 0.20, cy - H * 0.26, W * 0.16, H * 0.07,
    { mat: 'hat', mask: true, dome: -W * 0.20, tint: -0.18 });
  p.rect(cx - W * 0.40, cy - H * 0.10, W * 0.72, 1.2 * K,
    { mat: 'boot', mask: true, dome: 1.1 * K, tint: 0.03 });
  p.grain('hat', { freq: 0.55 / K, amp: 0.15, seed: 23 });
  p.smoothHeight(1, 0.4);
  return bake(p, cx, cy, far);
}

/** A boot, drawn from the ankle, toe pointing along +x. */
function paintBoot(K, far) {
  const p = new Painter(Math.ceil(11 * K) + 8, Math.ceil(8 * K) + 8);
  const ax = 4 + 2.6 * K, ay = 4 + 3.0 * K;
  const ft = far ? -0.18 : 0;
  // ankle, then the foot forward, then a heel behind it
  p.capsule(ax, ay - 1.6 * K, ax, ay + 1.4 * K, 1.9 * K, 1.7 * K,
    { mat: 'boot', dome: 1.7 * K, tint: ft + 0.05 });
  p.capsule(ax - 0.4 * K, ay + 1.9 * K, ax + 4.6 * K, ay + 2.1 * K, 1.5 * K, 1.1 * K,
    { mat: 'boot', dome: 1.3 * K, tint: ft });
  p.capsule(ax - 1.6 * K, ay + 2.2 * K, ax - 0.6 * K, ay + 2.2 * K, 1.2 * K, 1.3 * K,
    { mat: 'boot', dome: 1.1 * K, tint: ft - 0.05 });
  // the sole, worn pale
  p.rect(ax - 2.0 * K, ay + 2.7 * K, 7.0 * K, 0.9 * K,
    { mat: 'boot', mask: true, tint: ft - 0.26, dome: 0 });
  // a strap over the instep
  p.capsule(ax + 1.2 * K, ay + 0.8 * K, ax + 1.8 * K, ay + 2.6 * K, 0.7 * K, 0.6 * K,
    { mat: 'boot', mask: true, dome: 0.8 * K, tint: ft + 0.14 });
  p.grain('boot', { freq: 0.6 / K, amp: 0.12, seed: 37 });
  return bake(p, ax, ay, far);
}

function paintSatchel(K, far) {
  const W = 6.6 * K, H = 6.2 * K;
  const p = new Painter(Math.ceil(W) + 12, Math.ceil(H) + 12);
  const cx = p.w / 2, cy = p.h / 2;
  p.rect(cx - W / 2, cy - H / 2, W, H, { mat: 'canvasBag', dome: 3.4 * K, tint: -0.02 });
  p.rect(cx - W / 2, cy - H / 2, W, H * 0.44, { mat: 'boot', dome: 2.8 * K, tint: 0.06 });
  p.ellipse(cx, cy + H * 0.02, 1.5 * K, 1.3 * K, { mat: 'metal', dome: 1.3 * K, tint: 0.14 });
  p.rect(cx - W * 0.34, cy + H * 0.18, W * 0.30, H * 0.22, { mat: 'paper', dome: 1.0 * K, tint: 0.10 });
  p.ridges('canvasBag', { angle: 0.1, freq: 1.0 / K, amp: 0.14, height: 0.6 * K, seed: 5, warp: 0.5 });
  return bake(p, cx, cy, far);
}

/**
 * Things she carries or leaves lying about. Each one is drawn from its grip
 * end, so a hand can simply be put at (ox, oy) and the tool points the way the
 * arm does.
 */
function paintProps(K) {
  const mk = (w, h, fn) => {
    const p = new Painter(Math.ceil(w) + 10, Math.ceil(h) + 10);
    fn(p, 5, p.h / 2);
    return bake(p, 5, p.h / 2, false);
  };
  return {
    notebook: mk(8 * K, 10 * K, (p, x, y) => {
      p.rect(x, y - 4.6 * K, 6.6 * K, 9.2 * K, { mat: 'boot', dome: 1.9 * K, tint: 0.03 });
      p.rect(x + 1.0 * K, y - 3.6 * K, 5.0 * K, 7.2 * K, { mat: 'paper', dome: 1.0 * K, tint: 0.06 });
      for (let i = 0; i < 5; i++) {
        p.rect(x + 1.7 * K, y - 2.9 * K + i * 1.4 * K, 3.4 * K, 0.6 * K,
          { mat: 'paper', mask: true, tint: -0.42, dome: 0 });
      }
      p.capsule(x + 0.5 * K, y - 4.6 * K, x + 0.5 * K, y + 4.6 * K, 0.5 * K, 0.5 * K,
        { mat: 'scarf', dome: 0.5 * K, tint: 0.1 });
    }),
    pencil: mk(9 * K, 3 * K, (p, x, y) => {
      p.capsule(x, y, x + 7 * K, y, 0.75 * K, 0.7 * K, { mat: 'wood', dome: 0.7 * K });
      p.capsule(x + 7 * K, y, x + 8.6 * K, y, 0.7 * K, 0.25 * K, { mat: 'hair', dome: 0.5 * K, tint: -0.1 });
    }),
    trowel: mk(13 * K, 6 * K, (p, x, y) => {
      p.capsule(x, y, x + 5 * K, y, 1.3 * K, 1.0 * K, { mat: 'wood', dome: 1.2 * K });
      p.poly([{ x: x + 5 * K, y: y - 2.4 * K }, { x: x + 10 * K, y: y - 1.1 * K },
        { x: x + 12.6 * K, y }, { x: x + 10 * K, y: y + 1.1 * K }, { x: x + 5 * K, y: y + 2.4 * K }],
        { mat: 'metal', dome: 1.5 * K, tint: 0.08 });
    }),
    brush: mk(12 * K, 5 * K, (p, x, y) => {
      p.capsule(x, y, x + 7 * K, y, 1.2 * K, 1.0 * K, { mat: 'wood', dome: 1.1 * K });
      p.capsule(x + 7 * K, y, x + 11 * K, y, 1.9 * K, 1.2 * K, { mat: 'fur', dome: 1.5 * K, tint: 0.10 });
    }),
    canteen: mk(9 * K, 11 * K, (p, x, y) => {
      p.ellipse(x + 4 * K, y, 4 * K, 4.8 * K, { mat: 'metal', dome: 3.4 * K, tint: -0.02 });
      p.ellipse(x + 4 * K, y, 2.4 * K, 2.9 * K, { mat: 'metal', mask: true, dome: -1.6 * K, tint: -0.14 });
      p.capsule(x + 4 * K, y - 4.8 * K, x + 4 * K, y - 6.4 * K, 1.3 * K, 1.2 * K, { mat: 'wood', dome: 1.1 * K });
    }),
    lens: mk(11 * K, 7 * K, (p, x, y) => {
      p.capsule(x, y, x + 4 * K, y, 1.0 * K, 0.9 * K, { mat: 'wood', dome: 0.9 * K });
      p.ellipse(x + 7.6 * K, y, 3.2 * K, 3.2 * K, { mat: 'metal', dome: 1.6 * K, tint: 0.06 });
      p.ellipse(x + 7.6 * K, y, 2.3 * K, 2.3 * K, { mat: 'lens', dome: 1.2 * K, tint: 0.22 });
    }),
    pick: mk(14 * K, 8 * K, (p, x, y) => {
      p.capsule(x, y + 2 * K, x + 8 * K, y - 1.4 * K, 1.1 * K, 1.0 * K, { mat: 'wood', dome: 1.0 * K });
      p.capsule(x + 5.6 * K, y - 3.2 * K, x + 12.4 * K, y - 1.0 * K, 1.3 * K, 0.7 * K,
        { mat: 'metal', dome: 1.2 * K, tint: 0.08 });
      p.capsule(x + 6.6 * K, y - 2.8 * K, x + 4.4 * K, y - 4.6 * K, 1.1 * K, 0.6 * K,
        { mat: 'metal', dome: 1.0 * K, tint: 0.04 });
    }),
    lantern: mk(10 * K, 14 * K, (p, x, y) => {
      p.capsule(x + 4 * K, y - 6.4 * K, x + 4 * K, y - 4.4 * K, 0.7 * K, 0.9 * K, { mat: 'metal', dome: 0.8 * K });
      p.rect(x + 1.3 * K, y - 4.4 * K, 5.6 * K, 7.2 * K, { mat: 'glass', dome: 2.4 * K, tint: 0.12 });
      p.ellipse(x + 4 * K, y - 0.8 * K, 2.0 * K, 2.5 * K,
        { mat: 'glow', dome: 2.0 * K, tint: 0.45, emissive: 1 });
      p.rect(x + 0.9 * K, y + 2.6 * K, 6.4 * K, 1.7 * K, { mat: 'metal', dome: 1.4 * K, tint: 0.07 });
    }),
    peg: mk(6 * K, 9 * K, (p, x, y) => {
      p.capsule(x + 2 * K, y - 4 * K, x + 2.6 * K, y + 4 * K, 0.8 * K, 0.5 * K, { mat: 'wood', dome: 0.8 * K });
      p.rect(x, y - 5 * K, 4.4 * K, 2 * K, { mat: 'scarf', dome: 0.9 * K, tint: 0.14 });
    }),
    bedroll: mk(15 * K, 7 * K, (p, x, y) => {
      p.capsule(x + 2.5 * K, y, x + 12 * K, y, 3.0 * K, 3.0 * K, { mat: 'canvasBag', dome: 2.8 * K });
      for (let i = 0; i < 3; i++) {
        p.capsule(x + 4 * K + i * 3.2 * K, y - 3 * K, x + 4 * K + i * 3.2 * K, y + 3 * K,
          0.5 * K, 0.5 * K, { mat: 'boot', mask: true, dome: 0.6 * K, tint: 0.05 });
      }
    }),
    skull: mk(11 * K, 9 * K, (p, x, y) => {
      p.ellipse(x + 5 * K, y - 0.6 * K, 4.4 * K, 3.8 * K, { mat: 'paper', dome: 3.4 * K, tint: 0.02 });
      p.ellipse(x + 8.2 * K, y + 1.6 * K, 2.4 * K, 2.0 * K, { mat: 'paper', dome: 2.0 * K });
      p.ellipse(x + 6.4 * K, y - 0.8 * K, 1.2 * K, 1.1 * K,
        { mat: 'paper', mask: true, dome: -2.0 * K, tint: -0.55 });
      p.ellipse(x + 3.4 * K, y - 1.0 * K, 1.1 * K, 1.0 * K,
        { mat: 'paper', mask: true, dome: -2.0 * K, tint: -0.5 });
    }),
    spoil: mk(14 * K, 6 * K, (p, x, y) => {
      p.field(x, y - 4 * K, x + 14 * K, y + 2.5 * K, (px, py) => {
        const u = (px - x) / (14 * K);
        const top = y + 2 * K - Math.sin(u * Math.PI) * 5.2 * K;
        if (py < top || py > y + 2.5 * K) return null;
        return { h: (y + 2.5 * K - py) * 0.7, tint: -0.04 };
      }, { mat: 'sand' });
    }),
  };
}

// ---------------------------------------------------------------------------

const cache = new Map();

/**
 * One person, in pieces. `K` scales everything; the near and far copies differ
 * only in how much light they get, so an arm on the far side of the body
 * reads as behind it without being redrawn.
 */
export function buildPerson(kind = 'vess', K = 1) {
  const key = kind + ':' + K;
  if (cache.has(key)) return cache.get(key);

  const bone = (len, r0, r1, mat, far, o) => paintBone(len * K, r0 * K, r1 * K, mat, K, far, o);
  const rig = {
    kind, K,
    torso: { near: paintTorso(K, false), far: paintTorso(K, true) },
    hat: paintHat(K, false),
    satchel: paintSatchel(K, false),
    boot: { near: paintBoot(K, false), far: paintBoot(K, true) },
    props: paintProps(K),
    arm: {
      near: {
        upper: bone(6.6, 1.9, 1.6, 'coat', false, { bow: 0.6 * K }),
        lower: bone(6.4, 1.5, 1.25, 'skin', false, { bow: -0.4 * K, hand: true, cuff: true }),
      },
      far: {
        upper: bone(6.6, 1.9, 1.6, 'coat', true, { bow: 0.6 * K }),
        lower: bone(6.4, 1.5, 1.25, 'skin', true, { bow: -0.4 * K, hand: true, cuff: true }),
      },
    },
    leg: {
      near: {
        upper: bone(10.4, 2.5, 2.0, 'trouser', false, { bow: 0.5 * K }),
        lower: bone(10.0, 2.0, 1.5, 'trouser', false, { bow: -0.5 * K, knee: true }),
      },
      far: {
        upper: bone(10.4, 2.5, 2.0, 'trouser', true, { bow: 0.5 * K }),
        lower: bone(10.0, 2.0, 1.5, 'trouser', true, { bow: -0.5 * K, knee: true }),
      },
    },
  };
  // heads are baked the first time a face is worn, which is cheap enough that
  // she can change expression in the world and not only in a speech bubble
  const heads = new Map();
  rig.headFor = (mood = 0, goggles = false, bare = false) => {
    const k = `${mood}:${goggles ? 1 : 0}:${bare ? 1 : 0}`;
    let v = heads.get(k);
    if (!v) { v = paintHead(K, false, { mood, goggles, noHat: bare }); heads.set(k, v); }
    return v;
  };
  rig.head = rig.headFor(0, false);
  rig.headGoggles = rig.headFor(0, true);

  const T = rig.torso.near;
  rig.sockets = {
    neck: { x: 0.7 * K, y: T.topY + T.H * 0.01 },
    shoulder: { x: 0.3 * K, y: T.topY + T.H * 0.16 },
    hip: { x: -0.3 * K, y: -T.H * 0.03 },
    bag: { x: -T.W * 0.46, y: -T.H * 0.20 },
  };
  // hip height above the ground when standing: both leg bones, a touch bent
  rig.standH = (rig.leg.near.upper.len + rig.leg.near.lower.len) * 0.93;
  cache.set(key, rig);
  return rig;
}

const portraits = new Map();

/**
 * The close-up that goes in a speech bubble: the same head, painted four times
 * larger, with the mood baked in. Eight of them, made on demand.
 */
export function portrait(kind, mood = 0, K = 2.6) {
  const key = `${kind}:${mood}:${K}`;
  let v = portraits.get(key);
  if (!v) {
    v = paintHead(K, false, { mood, goggles: mood === 2 });
    portraits.set(key, v);
  }
  return v;
}

export function clearPersonCache() { cache.clear(); portraits.clear(); }
