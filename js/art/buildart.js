// CRABDEN - the things you build on your own back.
//
// Salvage architecture: stone the crab already had, driftwood from a sea that
// is gone, cloth and rusted metal out of the ruins. Small, because everything
// has to fit between the plants.

import { Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.6, lightY: -0.62, lightZ: 0.4, ambient: 0.38, dither: 0.7 };

function rng(seed) {
  let s = (seed | 0) || 3;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; };
}

const KIND = {
  /** Sealed stone tank with a metal collar and a spigot. */
  tank(p, W, H, x, y, K, R) {
    p.field(x - W / 2, y - H, x + W / 2, y, (px, py) => {
      const u = (px - (x - W / 2)) / W;
      const v = (py - (y - H)) / H;
      if (u < 0 || u > 1 || v < 0 || v > 1) return null;
      const bulge = Math.sin(v * Math.PI * 0.9 + 0.2);
      const half = 0.5 * (0.72 + 0.28 * bulge);
      if (Math.abs(u - 0.5) > half) return null;
      const dz = Math.sqrt(clamp01(1 - Math.pow((u - 0.5) / half, 2)));
      return { h: dz * W * 0.42, tint: -0.04 + (v < 0.12 ? 0.14 : 0) };
    }, { mat: 'shellRock' });
    p.grain('shellRock', { freq: 0.5 / K, amp: 0.2, seed: 5 });
    // banding
    for (let i = 0; i < 3; i++) {
      const yy = y - H * (0.22 + i * 0.28);
      p.rect(x - W * 0.52, yy, W * 1.04, 1.4 * K, { mat: 'metal', mask: true, tint: 0.05, dome: 1.2 * K });
    }
    p.capsule(x + W * 0.42, y - H * 0.18, x + W * 0.66, y - H * 0.10, 1.2 * K, 0.9 * K,
      { mat: 'metal', dome: 1.1 * K, tint: 0.06 });
    p.ellipse(x, y - H, W * 0.34, 2.2 * K, { mat: 'wood', dome: 2 * K, tint: 0.06 });
  },

  /** A slender mast with vanes, guyed with rope. */
  tower(p, W, H, x, y, K, R) {
    const legs = 3;
    for (let i = 0; i < legs; i++) {
      const f = (i / (legs - 1) - 0.5) * 2;
      p.capsule(x + f * W * 0.45, y, x + f * W * 0.09, y - H * 0.72, 1.3 * K, 1.0 * K,
        { mat: 'wood', dome: 1.2 * K, tint: -0.04 + i * 0.04 });
    }
    for (let i = 0; i < 3; i++) {
      const yy = y - H * (0.2 + i * 0.22);
      const w = W * (0.42 - i * 0.10);
      p.capsule(x - w, yy, x + w, yy - 0.6 * K, 0.9 * K, 0.9 * K, { mat: 'wood', dome: 0.8 * K, tint: -0.1 });
    }
    p.capsule(x, y - H * 0.66, x, y - H, 1.4 * K, 1.0 * K, { mat: 'wood', dome: 1.2 * K, tint: 0.04 });
    // vanes
    for (let i = 0; i < 4; i++) {
      const a = -0.5 + i * 0.5;
      p.poly([
        { x, y: y - H },
        { x: x + Math.cos(a) * W * 0.7, y: y - H + Math.sin(a) * W * 0.5 },
        { x: x + Math.cos(a) * W * 0.62, y: y - H + Math.sin(a) * W * 0.5 + 2.4 * K },
      ], { mat: 'cloth', dome: 1.2 * K, feather: 1.6, tint: (i - 1.5) * 0.06 });
    }
    p.capsule(x, y - H * 0.55, x - W * 0.7, y, 0.55 * K, 0.4 * K, { mat: 'rope', dome: 0.5 * K, tint: -0.05 });
    p.capsule(x, y - H * 0.55, x + W * 0.7, y, 0.55 * K, 0.4 * K, { mat: 'rope', dome: 0.5 * K, tint: -0.05 });
  },

  /** Slatted crate, open at the top, full of leaf litter. */
  crate(p, W, H, x, y, K, R) {
    p.rect(x - W / 2, y - H, W, H, { mat: 'wood', dome: 3.2 * K, tint: -0.05 });
    for (let i = 1; i < 5; i++) {
      const xx = x - W / 2 + (W * i) / 5;
      p.capsule(xx, y - H + 1, xx, y - 1, 0.7 * K, 0.7 * K, { mat: 'wood', mask: true, tint: -0.22, dome: 0 });
    }
    p.rect(x - W / 2 - 0.8 * K, y - H, W + 1.6 * K, 1.8 * K, { mat: 'wood', dome: 1.6 * K, tint: 0.10 });
    p.rect(x - W / 2 - 0.8 * K, y - 2.2 * K, W + 1.6 * K, 1.8 * K, { mat: 'wood', dome: 1.6 * K, tint: 0.06 });
    // litter mounded above the rim
    for (let i = 0; i < 16; i++) {
      const px = x + (R() - 0.5) * W * 0.86;
      const py = y - H - R() * 2.4 * K;
      p.ellipse(px, py, 1.5 * K, 1.0 * K, { mat: R() < 0.4 ? 'leafDry' : 'moss', dome: 1.3 * K,
        tint: (R() - 0.5) * 0.3 });
    }
    p.grain('wood', { freq: 0.7 / K, amp: 0.18, seed: 11 });
  },

  /** Woven hut on stilts - a roost. */
  hut(p, W, H, x, y, K, R) {
    p.capsule(x - W * 0.34, y, x - W * 0.30, y - H * 0.28, 1.1 * K, 1.0 * K, { mat: 'wood', dome: 1.0 * K });
    p.capsule(x + W * 0.34, y, x + W * 0.30, y - H * 0.28, 1.1 * K, 1.0 * K, { mat: 'wood', dome: 1.0 * K, tint: -0.08 });
    p.rect(x - W * 0.44, y - H * 0.72, W * 0.88, H * 0.46, { mat: 'canvasBag', dome: 3.4 * K, tint: -0.02 });
    p.ridges('canvasBag', { angle: 0.2, freq: 1.1 / K, amp: 0.16, height: 0.8 * K, seed: 7, warp: 0.6 });
    // thatched roof
    p.poly([
      { x: x - W * 0.56, y: y - H * 0.70 },
      { x, y: y - H },
      { x: x + W * 0.56, y: y - H * 0.70 },
    ], { mat: 'leafDry', dome: 3.6 * K, feather: 2.4, tint: 0.05 });
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      p.capsule(lerp(x - W * 0.52, x, t), lerp(y - H * 0.70, y - H, t),
        lerp(x - W * 0.46, x + 1, t), lerp(y - H * 0.66, y - H * 0.94, t),
        0.5 * K, 0.4 * K, { mat: 'leafDry', mask: true, tint: -0.2, dome: 0 });
    }
    // doorway
    p.ellipse(x + W * 0.06, y - H * 0.46, W * 0.16, H * 0.14, { mat: 'canvasBag', mask: true, tint: -0.42, dome: -2 * K });
  },

  /** An A-frame of poles for climbers. */
  frame(p, W, H, x, y, K, R) {
    for (const f of [-1, 1]) {
      p.capsule(x + f * W * 0.44, y, x - f * W * 0.06, y - H, 1.2 * K, 0.9 * K,
        { mat: 'wood', dome: 1.1 * K, tint: f > 0 ? 0 : -0.1 });
    }
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + i * 0.22;
      const yy = y - H * t;
      const w = W * (0.46 - t * 0.34);
      p.capsule(x - w, yy, x + w, yy, 0.7 * K, 0.7 * K, { mat: 'rope', dome: 0.7 * K, tint: -0.04 });
    }
    for (let i = 0; i < 12; i++) {
      const t = R();
      const px = x + (R() - 0.5) * W * 0.8, py = y - H * (0.15 + t * 0.8);
      p.ellipse(px, py, 1.6 * K, 1.1 * K, { mat: 'leaf', dome: 1.4 * K, tint: (R() - 0.5) * 0.3 });
    }
  },

  /** Salvaged ruin-stone, standing. */
  shrine(p, W, H, x, y, K, R) {
    p.poly([
      { x: x - W * 0.34, y },
      { x: x - W * 0.28, y: y - H * 0.92 },
      { x: x + W * 0.10, y: y - H },
      { x: x + W * 0.30, y: y - H * 0.80 },
      { x: x + W * 0.36, y },
    ], { mat: 'rock', dome: W * 0.4, feather: 3, tint: -0.02 });
    p.grain('rock', { freq: 0.35 / K, amp: 0.24, seed: 3, height: 0.6 * K });
    // carved glyph rows
    for (let i = 0; i < 5; i++) {
      const yy = y - H * (0.18 + i * 0.15);
      for (let k = 0; k < 3; k++) {
        p.rect(x - W * 0.18 + k * W * 0.14, yy, W * 0.08, 1.1 * K,
          { mat: 'rock', mask: true, tint: -0.34, dome: -1.4 * K });
      }
    }
    p.ellipse(x + W * 0.02, y - H * 0.86, W * 0.13, W * 0.13, { mat: 'glow', dome: W * 0.16, tint: 0.3, emissive: 0.8 });
    p.rect(x - W * 0.46, y - 2.4 * K, W * 0.92, 2.6 * K, { mat: 'rock', dome: 2.2 * K, tint: 0.06 });
  },
};

const cache = new Map();

export function buildStructure(def, size = 1) {
  const K = Math.round(size * 20) / 20;
  const key = `${def.id}|${K}`;
  if (cache.has(key)) return cache.get(key);
  const W = def.w * K, H = def.h * K;
  const pad = Math.ceil(6 * K) + 5;
  const p = new Painter(Math.ceil(W * 1.9) + pad * 2, Math.ceil(H) + pad * 2);
  const x = p.w / 2, y = p.h - pad;
  const R = rng(def.id.length * 977 + def.w);
  (KIND[def.kind] || KIND.crate)(p, W, H, x, y, K, R);
  p.smoothHeight(1, 0.4);
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#170f09' });
  const out = { cv, ox: x, oy: y, w: W, h: H };
  cache.set(key, out);
  return out;
}

export function clearBuildCache() { cache.clear(); }
