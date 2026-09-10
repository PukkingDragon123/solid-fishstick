// CRABDEN - people.
//
// Currently there is exactly one, and she is very tired. Dr. Vess is painted
// in parts so she can walk, crouch, dig, write and point without a sprite
// sheet: hat, head, torso, two arms, two legs, satchel and whatever she is
// holding.
//
// Facing RIGHT.

import { Painter } from '../render/pixel.js';
import { MATERIALS, withMaterials } from '../lib/palette.js';
import { clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.6, lightY: -0.62, lightZ: 0.4, ambient: 0.38, dither: 0.7 };

// She has her own palette: sun-bleached field kit against a lot of dust.
const MATS = withMaterials({
  shirtKhaki: { ramp: ['#3d3a26', '#565239', '#706b4c', '#8b8562', '#a5a07b', '#bfba97', '#d7d3b5', '#eeebd6'],
    diffuse: 0.78, rim: 0.28, ao: 0.10, normalScale: 0.55, outline: '#241f14' },
  trouser: { ramp: ['#221f24', '#33303a', '#474452', '#5c596a', '#727083', '#8a889c', '#a5a3b4', '#c3c1cd'],
    diffuse: 0.76, rim: 0.3, ao: 0.11, normalScale: 0.55, outline: '#15131a' },
  scarfRed: { ramp: ['#341012', '#4e1a1a', '#6c2723', '#89372c', '#a44c39', '#bd664c', '#d18567', '#e4aa8c'],
    diffuse: 0.78, rim: 0.34, ao: 0.10, normalScale: 0.5, outline: '#22090b' },
  hatFelt: { ramp: ['#2e2519', '#443826', '#5d4e34', '#766544', '#8f7d57', '#a8976e', '#c1b18b', '#d9ccae'],
    diffuse: 0.76, rim: 0.26, ao: 0.12, normalScale: 0.6, outline: '#1c1610' },
  hairDark: { ramp: ['#160f0c', '#241813', '#35241c', '#463026', '#583e31', '#6d503f', '#856754', '#a08471'],
    diffuse: 0.72, rim: 0.4, ao: 0.12, normalScale: 0.5, outline: '#0f0a08' },
  goggle: { ramp: ['#1a2226', '#243238', '#31454d', '#405c66', '#527680', '#6b939d', '#8db4bd', '#bcdbe1'],
    diffuse: 0.6, rim: 0.7, spec: 0.9, ao: 0.06, normalScale: 0.6, outline: '#101619' },
});

function paintTorso(K) {
  const W = 11 * K, H = 15 * K;
  const pad = Math.ceil(7 * K) + 4;
  const p = new Painter(Math.ceil(W * 2.4) + pad, Math.ceil(H) + pad * 2);
  const cx = p.w / 2, cy = p.h / 2;

  // ribcage tapering to the waist, leaning forward a touch from years of it
  p.field(cx - W, cy - H / 2 - 2, cx + W, cy + H / 2 + 2, (x, y) => {
    const v = (y - (cy - H / 2)) / H;
    if (v < 0 || v > 1) return null;
    const half = W * 0.5 * (0.94 - 0.26 * v + 0.16 * Math.sin(v * Math.PI));
    const mid = cx + (0.5 - v) * W * 0.10;
    const d = (x - mid) / half;
    if (Math.abs(d) > 1) return null;
    const dz = Math.sqrt(clamp01(1 - d * d));
    return { h: dz * W * 0.44, tint: -0.04 + (v < 0.2 ? 0.07 : 0) };
  }, { mat: 'shirtKhaki' });
  p.grain('shirtKhaki', { freq: 0.5 / K, amp: 0.16, seed: 7 });
  p.ridges('shirtKhaki', { angle: 1.3, freq: 0.9 / K, amp: 0.10, height: 0.6 * K, seed: 3, warp: 1.4 });

  // sweat-dark under the arms and along the spine, because it is 46 degrees
  p.field(cx - W, cy - H * 0.3, cx + W, cy + H * 0.4, (x, y) => {
    const d = Math.hypot((x - cx + W * 0.32) / (W * 0.42), (y - cy + H * 0.02) / (H * 0.3));
    if (d > 1) return null;
    return { h: 0, tint: -(1 - d) * 0.22 };
  }, { mat: 'shirtKhaki', mask: true });

  // strap over the shoulder, and the sample bandolier
  p.capsule(cx - W * 0.42, cy - H * 0.44, cx + W * 0.30, cy + H * 0.42, 1.5 * K, 1.4 * K,
    { mat: 'leather', dome: 1.3 * K, tint: 0.04 });
  p.capsule(cx + W * 0.34, cy - H * 0.42, cx - W * 0.28, cy + H * 0.40, 1.2 * K, 1.1 * K,
    { mat: 'canvasBag', dome: 1.1 * K, tint: -0.02 });
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.19;
    p.capsule(lerp(cx + W * 0.30, cx - W * 0.24, t) + 1.2 * K, lerp(cy - H * 0.36, cy + H * 0.34, t),
      lerp(cx + W * 0.30, cx - W * 0.24, t) - 0.4 * K, lerp(cy - H * 0.36, cy + H * 0.34, t) + 2.4 * K,
      1.0 * K, 0.9 * K, { mat: 'glass', dome: 1.0 * K, tint: 0.08 });
  }
  // collar and rolled scarf
  p.capsule(cx - W * 0.34, cy - H * 0.46, cx + W * 0.34, cy - H * 0.44, 2.0 * K, 1.8 * K,
    { mat: 'scarfRed', dome: 1.8 * K, tint: 0.04 });
  p.capsule(cx + W * 0.10, cy - H * 0.40, cx + W * 0.46, cy - H * 0.12, 1.4 * K, 0.9 * K,
    { mat: 'scarfRed', dome: 1.2 * K, tint: -0.06 });
  // belt
  p.rect(cx - W * 0.52, cy + H * 0.30, W * 1.04, 2.0 * K, { mat: 'leather', mask: true, dome: 1.6 * K, tint: 0.02 });
  p.ellipse(cx + W * 0.06, cy + H * 0.34, 1.6 * K, 1.4 * K, { mat: 'metal', dome: 1.4 * K, tint: 0.1 });

  p.smoothHeight(1, 0.4);
  return { cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: '#1a140d' }), ox: cx, oy: cy, W, H };
}

function paintHead(K, opts = {}) {
  const W = 8 * K, H = 9 * K;
  const pad = Math.ceil(9 * K) + 5;
  const p = new Painter(Math.ceil(W * 2.6) + pad, Math.ceil(H * 2.2) + pad);
  const cx = p.w * 0.46, cy = p.h * 0.58;

  // neck
  p.capsule(cx - W * 0.06, cy + H * 0.42, cx - W * 0.02, cy + H * 0.66, 2.0 * K, 2.2 * K,
    { mat: 'skin', dome: 1.8 * K, tint: -0.14 });
  // skull and jaw
  p.ellipse(cx, cy, W * 0.5, H * 0.48, { mat: 'skin', dome: W * 0.46, tint: 0.02 });
  p.ellipse(cx + W * 0.14, cy + H * 0.20, W * 0.34, H * 0.26, { mat: 'skin', dome: W * 0.30, tint: 0.0 });
  // nose and mouth
  p.ellipse(cx + W * 0.40, cy + H * 0.04, W * 0.13, H * 0.10, { mat: 'skin', dome: W * 0.24, tint: 0.09 });
  p.rect(cx + W * 0.22, cy + H * 0.22, W * 0.20, 1.0 * K, { mat: 'skin', mask: true, dome: -1.2 * K, tint: -0.28 });
  // eye, half-lidded, with dust lines around it
  if (!opts.goggles) {
    p.ellipse(cx + W * 0.24, cy - H * 0.06, W * 0.11, H * 0.09, { mat: 'eye', dome: 1.6 * K, tint: -0.1 });
    p.ellipse(cx + W * 0.22, cy - H * 0.10, W * 0.05, H * 0.04, { mat: 'eye', mask: true, dome: 1.6 * K, tint: 0.6 });
  }
  p.rect(cx + W * 0.10, cy - H * 0.20, W * 0.30, 1.0 * K, { mat: 'skin', mask: true, dome: 1.0 * K, tint: -0.24 });
  p.speckle('skin', { density: 0.05, amp: 0.28, seed: 19 });

  // hair: a tied-back mass, blown by the wind
  p.ellipse(cx - W * 0.14, cy - H * 0.22, W * 0.46, H * 0.36, { mat: 'hairDark', dome: W * 0.4, tint: 0.03 });
  p.curve([{ x: cx - W * 0.40, y: cy - H * 0.06 }, { x: cx - W * 0.86, y: cy + H * 0.10 },
    { x: cx - W * 1.05, y: cy + H * 0.42 }], 2.4 * K, 1.1 * K,
    { mat: 'hairDark', dome: 2.0 * K, steps: 12, tint: -0.04 });
  for (let i = 0; i < 4; i++) {
    p.curve([{ x: cx - W * 0.30, y: cy - H * 0.34 + i * 1.6 * K },
      { x: cx - W * 0.66, y: cy - H * 0.30 + i * 1.9 * K },
      { x: cx - W * 0.92, y: cy - H * 0.10 + i * 2.1 * K }], 0.9 * K, 0.4 * K,
      { mat: 'hairDark', dome: 0.8 * K, steps: 8, tint: 0.06 });
  }

  // goggles pushed up on the forehead, or worn
  const gy = opts.goggles ? cy - H * 0.08 : cy - H * 0.40;
  p.capsule(cx - W * 0.42, gy, cx + W * 0.44, gy, 2.2 * K, 2.2 * K,
    { mat: 'leather', dome: 1.6 * K, tint: -0.04 });
  p.ellipse(cx + W * 0.26, gy, W * 0.20, H * 0.15, { mat: 'goggle', dome: 2.2 * K, tint: 0.06 });
  p.ellipse(cx + W * 0.20, gy - H * 0.04, W * 0.07, H * 0.05, { mat: 'goggle', mask: true, dome: 2 * K, tint: 0.5 });

  // wide felt hat, crushed on one side
  if (!opts.noHat) {
    const hy = cy - H * 0.52;
    p.field(cx - W * 1.5, hy - 1, cx + W * 1.5, hy + 3.2 * K, (x, y) => {
      const u = (x - cx) / (W * 1.32);
      if (Math.abs(u) > 1) return null;
      const brim = hy + Math.pow(Math.abs(u), 2.2) * 3.4 * K - Math.abs(u) * 0.6 * K;
      const d = y - brim;
      if (d < 0 || d > 2.0 * K) return null;
      return { h: 2.4 * K - d, tint: 0.03 - Math.abs(u) * 0.06 };
    }, { mat: 'hatFelt' });
    p.ellipse(cx - W * 0.04, hy - H * 0.26, W * 0.52, H * 0.30, { mat: 'hatFelt', dome: W * 0.42, tint: 0.05 });
    p.rect(cx - W * 0.58, hy - H * 0.16, W * 1.1, 1.6 * K, { mat: 'leather', mask: true, dome: 1.4 * K, tint: 0.0 });
    p.grain('hatFelt', { freq: 0.6 / K, amp: 0.16, seed: 23 });
  }

  p.smoothHeight(1, 0.4);
  return { cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: '#1a120c' }), ox: cx, oy: cy + H * 0.62, W, H };
}

function paintLimb(len, r0, r1, mat, K, far, opts = {}) {
  const pad = Math.ceil(Math.max(r0, r1) + 5);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 4);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  const ft = far ? -0.2 : 0;
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - (opts.bow || 0) }, { x: x1, y: cy }],
    r0, r1, { mat, dome: r0 * 0.9, steps: 12, tint: ft });
  p.ellipse(x0, cy, r0 * 1.1, r0 * 1.0, { mat, dome: r0, tint: ft + 0.04 });
  if (opts.cuff) p.rect(x1 - 2.4 * K, cy - r1 * 1.3, 2.4 * K, r1 * 2.6, { mat: 'leather', dome: 1.4 * K, tint: ft + 0.04 });
  if (opts.hand) {
    p.ellipse(x1 + r1 * 0.5, cy, r1 * 1.35, r1 * 1.15, { mat: 'skin', dome: r1 * 1.2, tint: ft + 0.02 });
  }
  if (opts.boot) {
    p.ellipse(x1, cy, r1 * 1.5, r1 * 1.3, { mat: 'leather', dome: r1 * 1.2, tint: ft + 0.02 });
    p.capsule(x1, cy + r1 * 0.5, x1 + r1 * 2.6, cy + r1 * 0.7, r1 * 0.9, r1 * 0.7,
      { mat: 'leather', dome: r1 * 0.8, tint: ft });
  }
  p.grain(mat, { freq: 0.6 / K, amp: 0.12, seed: 31 });
  return {
    cv: p.resolve(MATS, { ...LIGHT, ambient: far ? 0.29 : LIGHT.ambient, outline: 1,
      outlineColor: far ? '#120c07' : '#1a140d' }),
    ox: pad, oy: cy, len,
  };
}

function paintSatchel(K) {
  const W = 9 * K, H = 8 * K;
  const p = new Painter(Math.ceil(W) + 10, Math.ceil(H) + 10);
  const cx = p.w / 2, cy = p.h / 2;
  p.rect(cx - W / 2, cy - H / 2, W, H, { mat: 'canvasBag', dome: 3.2 * K, tint: -0.02 });
  p.rect(cx - W / 2, cy - H / 2, W, H * 0.42, { mat: 'leather', dome: 2.6 * K, tint: 0.05 });
  p.ellipse(cx, cy + H * 0.02, 1.5 * K, 1.3 * K, { mat: 'metal', dome: 1.3 * K, tint: 0.12 });
  p.ridges('canvasBag', { angle: 0.1, freq: 1.0 / K, amp: 0.14, height: 0.6 * K, seed: 5, warp: 0.5 });
  return { cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: '#1a140d' }), ox: cx, oy: cy };
}

function paintProps(K) {
  const mk = (w, h, fn) => {
    const p = new Painter(Math.ceil(w) + 8, Math.ceil(h) + 8);
    fn(p, p.w / 2, p.h / 2);
    return { cv: p.resolve(MATS, { ...LIGHT, outline: 1, outlineColor: '#1a140d' }), ox: 4, oy: p.h / 2 };
  };
  return {
    brush: mk(12 * K, 5 * K, (p, x, y) => {
      p.capsule(4, y, 4 + 7 * K, y, 1.2 * K, 1.0 * K, { mat: 'wood', dome: 1.1 * K });
      p.capsule(4 + 7 * K, y, 4 + 11 * K, y, 1.8 * K, 1.2 * K, { mat: 'fur', dome: 1.4 * K, tint: 0.08 });
    }),
    notebook: mk(9 * K, 11 * K, (p, x, y) => {
      p.rect(4, y - 5 * K, 8 * K, 10 * K, { mat: 'leather', dome: 2.0 * K, tint: 0.02 });
      p.rect(4 + 1.2 * K, y - 4 * K, 6 * K, 8 * K, { mat: 'petalWhite', dome: 1.2 * K, tint: 0.06 });
      for (let i = 0; i < 5; i++) {
        p.rect(4 + 2 * K, y - 3.2 * K + i * 1.6 * K, 4 * K, 0.7 * K,
          { mat: 'petalWhite', mask: true, tint: -0.4, dome: 0 });
      }
    }),
    canteen: mk(8 * K, 10 * K, (p, x, y) => {
      p.ellipse(4 + 4 * K, y, 4 * K, 4.6 * K, { mat: 'metal', dome: 3.4 * K, tint: -0.02 });
      p.ellipse(4 + 4 * K, y, 2.4 * K, 2.8 * K, { mat: 'metal', mask: true, dome: -1.6 * K, tint: -0.12 });
      p.capsule(4 + 4 * K, y - 4.6 * K, 4 + 4 * K, y - 6.2 * K, 1.3 * K, 1.2 * K, { mat: 'wood', dome: 1.1 * K });
    }),
    lantern: mk(9 * K, 13 * K, (p, x, y) => {
      p.capsule(4 + 4 * K, y - 6 * K, 4 + 4 * K, y - 4 * K, 0.7 * K, 0.9 * K, { mat: 'metal', dome: 0.8 * K });
      p.rect(4 + 1.4 * K, y - 4 * K, 5.4 * K, 7 * K, { mat: 'glass', dome: 2.4 * K, tint: 0.1 });
      p.ellipse(4 + 4 * K, y - 0.6 * K, 2.0 * K, 2.4 * K, { mat: 'glow', dome: 2.0 * K, tint: 0.4, emissive: 1 });
      p.rect(4 + 1.0 * K, y + 2.6 * K, 6.2 * K, 1.6 * K, { mat: 'metal', dome: 1.4 * K, tint: 0.06 });
    }),
    hammer: mk(12 * K, 6 * K, (p, x, y) => {
      p.capsule(4, y, 4 + 8 * K, y, 1.1 * K, 1.0 * K, { mat: 'wood', dome: 1.0 * K });
      p.rect(4 + 7.5 * K, y - 2.2 * K, 3.5 * K, 4.4 * K, { mat: 'metal', dome: 2.0 * K, tint: 0.06 });
    }),
  };
}

let cached = null;

export function buildArchaeologist(K = 1) {
  if (cached && cached.K === K) return cached;
  const rig = {
    K,
    torso: paintTorso(K),
    head: paintHead(K),
    headGoggles: paintHead(K, { goggles: true }),
    satchel: paintSatchel(K),
    props: paintProps(K),
    arm: {
      near: {
        upper: paintLimb(7 * K, 2.1 * K, 1.8 * K, 'shirtKhaki', K, false, { bow: 0.6 * K }),
        lower: paintLimb(7 * K, 1.8 * K, 1.5 * K, 'skin', K, false, { bow: -0.4 * K, hand: true, cuff: true }),
      },
      far: {
        upper: paintLimb(7 * K, 2.1 * K, 1.8 * K, 'shirtKhaki', K, true, { bow: 0.6 * K }),
        lower: paintLimb(7 * K, 1.8 * K, 1.5 * K, 'skin', K, true, { bow: -0.4 * K, hand: true, cuff: true }),
      },
    },
    leg: {
      near: {
        upper: paintLimb(8 * K, 2.6 * K, 2.2 * K, 'trouser', K, false, { bow: 0.5 * K }),
        lower: paintLimb(8 * K, 2.2 * K, 1.6 * K, 'trouser', K, false, { bow: -0.5 * K, boot: true }),
      },
      far: {
        upper: paintLimb(8 * K, 2.6 * K, 2.2 * K, 'trouser', K, true, { bow: 0.5 * K }),
        lower: paintLimb(8 * K, 2.2 * K, 1.6 * K, 'trouser', K, true, { bow: -0.5 * K, boot: true }),
      },
    },
  };
  rig.sockets = {
    neck: { x: 0.6 * K, y: -rig.torso.H * 0.48 },
    shoulder: { x: 0.4 * K, y: -rig.torso.H * 0.34 },
    hip: { x: -0.4 * K, y: rig.torso.H * 0.44 },
    bag: { x: -rig.torso.W * 0.62, y: rig.torso.H * 0.30 },
  };
  rig.standH = 16 * K + rig.torso.H * 0.5;
  cached = rig;
  return rig;
}

export { MATS as HUMAN_MATERIALS };
