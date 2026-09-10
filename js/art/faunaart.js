// CRABDEN - the animals.
//
// One generator, many descendants. A creature is described by a handful of
// proportions - how deep the chest is, how long the neck runs, whether it has
// feathers or fur or a carapace - and the painter builds the body, head, limbs,
// wings and tail as separate sprites so they can be posed at runtime.
//
// Everything faces RIGHT.

import { Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.6, lightY: -0.62, lightZ: 0.4, ambient: 0.38, dither: 0.7 };

function rng(seed) {
  let s = (seed | 0) || 7;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; };
}

function texture(p, mat, kind, S, seed) {
  switch (kind) {
    case 'fur':
      p.grain(mat, { freq: 0.55 / S, amp: 0.22, seed, oct: 2, height: 0.5 * S });
      p.ridges(mat, { angle: 0.35, freq: 1.5 / S, amp: 0.10, height: 0.5 * S, seed: seed + 3, warp: 1.4 });
      break;
    case 'feather':
      p.scales(mat, { sx: Math.max(2, 3 * S), sy: Math.max(2, 2 * S), amp: 0.20, height: 0.8 * S, seed });
      p.grain(mat, { freq: 0.3 / S, amp: 0.14, seed: seed + 9 });
      break;
    case 'scale':
      p.scales(mat, { sx: Math.max(2, 2.5 * S), sy: Math.max(2, 2 * S), amp: 0.26, height: 0.9 * S, seed });
      break;
    case 'chitin':
      p.ridges(mat, { angle: 1.4, freq: 0.7 / S, amp: 0.20, height: 1.1 * S, seed, warp: 0.5 });
      p.grain(mat, { freq: 0.4 / S, amp: 0.13, seed: seed + 5 });
      break;
    case 'shell':
      p.grain(mat, { freq: 0.2 / S, amp: 0.24, seed, oct: 3, height: 0.7 * S });
      p.speckle(mat, { density: 0.05, amp: 0.3, seed: seed + 11 });
      break;
    default:
      p.grain(mat, { freq: 0.45 / S, amp: 0.16, seed });
  }
}

// ---------------------------------------------------------------------------

function paintBody(D, S, R) {
  const L = D.bodyL * S, H = D.bodyH * S;
  const pad = Math.ceil(6 * S + 5);
  const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 1.9) + pad * 2);
  const cx = p.w / 2, cy = p.h / 2;

  // torso: a deep chest tapering to the hips, hunched by `arch`
  p.field(cx - L / 2 - 3, cy - H - 3, cx + L / 2 + 3, cy + H + 3, (x, y) => {
    const u = (x - (cx - L / 2)) / L;
    if (u < 0 || u > 1) return null;
    const chest = Math.pow(Math.sin(Math.pow(u, D.chest ?? 0.82) * Math.PI), D.plump ?? 0.44);
    const half = H * 0.5 * (0.28 + 0.72 * chest);
    const spine = cy - Math.sin(u * Math.PI) * H * (D.arch ?? 0.16) + (u - 0.5) * H * (D.rake ?? 0);
    const dy = (y - spine) / half;
    if (Math.abs(dy) > 1) return null;
    const dz = Math.sqrt(clamp01(1 - dy * dy));
    return { h: dz * H * 0.5 * (0.3 + 0.7 * chest), tint: dy < -0.4 ? 0.05 : -0.05 };
  }, { mat: D.mat });

  // belly counter-shading, the way a real desert animal is lit from below
  {
    const mid = p._matIndex.get(D.mat);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        if (p.mat[i] !== mid) continue;
        const d = (y - cy) / H;
        if (d > 0.05) p.tint[i] += clamp01((d - 0.05) * 1.6) * (D.belly ?? 0.16);
      }
    }
  }

  texture(p, D.mat, D.skin, S, D.seed || 3);

  // dorsal markings
  if (D.stripes) {
    for (let i = 0; i < D.stripes; i++) {
      const u = 0.18 + (i / D.stripes) * 0.68;
      const x = cx - L / 2 + u * L;
      p.capsule(x, cy - H * 0.5, x - H * 0.16, cy + H * 0.1, 1.3 * S, 0.9 * S,
        { mat: D.mat, mask: true, tint: -0.28, dome: 0 });
    }
  }
  if (D.spots) {
    p.speckle(D.mat, { density: 0.03, amp: 0.42, seed: 91, size: Math.max(1, Math.round(1.6 * S)) });
  }
  if (D.plateMat) {
    // a run of armour scutes down the back
    for (let i = 0; i < 5; i++) {
      const u = 0.16 + i * 0.16;
      const x = cx - L / 2 + u * L;
      const yy = cy - Math.sin(u * Math.PI) * H * (D.arch ?? 0.16) - H * 0.42;
      const r = (1.6 + Math.sin(i) * 0.4) * S * (D.plateR ?? 1);
      p.poly([{ x: x - r, y: yy + r * 0.8 }, { x: x + r * 0.2, y: yy - r * 1.5 }, { x: x + r, y: yy + r * 0.8 }],
        { mat: D.plateMat, dome: r, feather: 1.6, tint: 0.06 });
    }
  }
  p.smoothHeight(1, 0.4);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: D.outline || '#160f0a' }),
    ox: cx, oy: cy, L, H,
  };
}

function paintHead(D, S, R) {
  const HL = D.headL * S, HH = D.headH * S;
  const pad = Math.ceil(5 * S + 5);
  const p = new Painter(Math.ceil(HL + (D.beak || 0) * S) + pad * 2, Math.ceil(HH * 1.7) + pad * 2);
  const cx = pad + HL * 0.4, cy = p.h / 2;

  // skull
  p.ellipse(cx, cy, HL * 0.55, HH * 0.5, { mat: D.mat, dome: HH * 0.5, tint: 0.02 });
  // muzzle or beak
  if (D.beak) {
    const bl = D.beak * S;
    p.curve([{ x: cx + HL * 0.35, y: cy + HH * 0.02 },
      { x: cx + HL * 0.35 + bl * 0.55, y: cy + HH * (D.beakDroop ?? 0.06) },
      { x: cx + HL * 0.35 + bl, y: cy + HH * (D.beakDroop ?? 0.06) * 2 }],
      HH * 0.26, 0.7 * S, { mat: D.beakMat || 'horn', dome: HH * 0.22, steps: 12, tint: 0.02 });
  } else if (D.muzzle) {
    const ml = D.muzzle * S;
    p.ellipse(cx + HL * 0.34 + ml * 0.4, cy + HH * 0.12, ml * 0.6, HH * 0.30,
      { mat: D.muzzleMat || D.mat, dome: HH * 0.3, tint: 0.03 });
    p.ellipse(cx + HL * 0.34 + ml * 0.9, cy + HH * 0.14, 1.4 * S, 1.1 * S,
      { mat: 'flesh', dome: 1.2 * S, tint: -0.12 });
  }
  // jaw
  if (D.jaw) {
    p.ellipse(cx + HL * 0.18, cy + HH * 0.30, HL * 0.34, HH * 0.20,
      { mat: D.mat, dome: HH * 0.22, tint: -0.10 });
  }
  texture(p, D.mat, D.skin, S, (D.seed || 3) + 17);

  // ears / horns / crest
  if (D.ear) {
    for (const sgn of [1, 0]) {
      const ex = cx - HL * 0.10 - sgn * 1.6 * S, ey = cy - HH * 0.36;
      const el = D.ear * S;
      p.curve([{ x: ex, y: ey }, { x: ex - el * 0.24, y: ey - el * 0.62 }, { x: ex + el * 0.12, y: ey - el }],
        HH * 0.20, 0.9 * S, { mat: sgn ? D.mat : (D.earFar || D.mat), dome: HH * 0.16, steps: 10,
          tint: sgn ? 0.04 : -0.20 });
      if (sgn) {
        p.curve([{ x: ex, y: ey }, { x: ex - el * 0.20, y: ey - el * 0.60 }, { x: ex + el * 0.10, y: ey - el * 0.92 }],
          HH * 0.10, 0.5 * S, { mat: 'flesh', mask: true, dome: 0, steps: 10, tint: -0.14 });
      }
    }
  }
  if (D.horn) {
    const hl = D.horn * S;
    p.curve([{ x: cx + HL * 0.05, y: cy - HH * 0.40 },
      { x: cx + HL * 0.30, y: cy - HH * 0.40 - hl * 0.7 },
      { x: cx + HL * 0.10, y: cy - HH * 0.40 - hl }],
      1.7 * S, 0.6 * S, { mat: 'horn', dome: 1.5 * S, steps: 10, tint: 0.06 });
  }
  if (D.crest) {
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const x = cx - HL * 0.30 + t * HL * 0.5;
      const y = cy - HH * 0.42;
      const cl = D.crest * S * (0.6 + Math.sin(t * Math.PI) * 0.8);
      p.curve([{ x, y }, { x: x - cl * 0.5, y: y - cl * 0.7 }, { x: x - cl * 0.9, y: y - cl }],
        1.2 * S, 0.4 * S, { mat: D.crestMat || 'feather', dome: 1.0 * S, steps: 8, tint: 0.05 });
    }
  }
  if (D.mane) {
    for (let i = 0; i < 7; i++) {
      const a = -2.6 + i * 0.28;
      const ml = D.mane * S * (0.7 + Math.random() * 0.5);
      p.capsule(cx - HL * 0.30, cy + (i - 3) * HH * 0.11,
        cx - HL * 0.30 + Math.cos(a) * ml, cy + (i - 3) * HH * 0.11 + Math.sin(a) * ml,
        1.3 * S, 0.5 * S, { mat: D.maneMat || D.mat, dome: 1.1 * S, tint: -0.06 });
    }
  }

  // eye
  const ex = cx + HL * (D.eyeX ?? 0.16), ey = cy - HH * (D.eyeY ?? 0.12);
  const er = (D.eyeR ?? 1.8) * S;
  p.ellipse(ex, ey, er * 1.15, er * 1.15, { mat: D.mat, dome: er, tint: -0.16 });
  p.ellipse(ex, ey, er, er, { mat: 'eye', dome: er * 1.3, tint: 0 });
  p.ellipse(ex - er * 0.34, ey - er * 0.36, er * 0.34, er * 0.30, { mat: 'eye', mask: true, dome: er, tint: 0.65 });

  p.smoothHeight(1, 0.4);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: D.outline || '#160f0a' }),
    ox: cx - HL * 0.16, oy: cy, HL, HH,
  };
}

function paintLimb(len, r0, r1, D, S, far, opts = {}) {
  const mat = far ? (D.matFar || D.mat) : D.mat;
  const pad = Math.ceil(Math.max(r0, r1) + 5);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 4);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  const ft = far ? -0.18 : 0;
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - (opts.bow || 0) }, { x: x1, y: cy }],
    r0, r1, { mat, dome: r0 * 0.9, steps: 12, tint: ft });
  p.ellipse(x0, cy, r0 * 1.1, r0 * 1.05, { mat, dome: r0, tint: ft + 0.04 });
  if (opts.hoof) {
    p.ellipse(x1, cy, r1 * 1.5, r1 * 1.2, { mat: 'horn', dome: r1 * 1.2, tint: ft + 0.02 });
  }
  if (opts.paw) {
    p.ellipse(x1 + r1 * 0.4, cy + r1 * 0.2, r1 * 1.7, r1 * 1.1, { mat, dome: r1 * 1.1, tint: ft + 0.02 });
    for (let i = 0; i < 3; i++) {
      p.ellipse(x1 + r1 * (0.9 + i * 0.5), cy + r1 * 0.5, r1 * 0.5, r1 * 0.4,
        { mat: 'horn', dome: r1 * 0.5, tint: ft });
    }
  }
  if (opts.claw) {
    p.curve([{ x: x1, y: cy }, { x: x1 + r1 * 2, y: cy + r1 * 0.4 }, { x: x1 + r1 * 3, y: cy + r1 * 1.5 }],
      r1 * 0.8, 0.5, { mat: 'horn', dome: r1 * 0.7, steps: 8, tint: ft + 0.04 });
  }
  texture(p, mat, D.skin, S, 41);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, ambient: far ? 0.29 : LIGHT.ambient, outline: 1,
      outlineColor: D.outline || '#160f0a' }),
    ox: pad, oy: cy, len,
  };
}

function paintWing(D, S, far) {
  const L = D.wing * S, W = L * (D.wingW ?? 0.5);
  const pad = 5;
  const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(W * 2) + pad * 2);
  const x0 = pad, cy = p.h / 2;
  const mat = D.wingMat || (far ? (D.matFar || D.mat) : D.mat);
  const ft = far ? -0.18 : 0;

  if (D.wingKind === 'membrane') {
    p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
      const u = (x - x0) / L;
      if (u < 0 || u > 1) return null;
      const span = W * Math.pow(Math.sin(Math.pow(u, 0.7) * Math.PI * 0.92 + 0.16), 0.6);
      const mid = cy + W * 0.15 * u;
      const dy = (y - mid) / span;
      if (dy < -1 || dy > 1) return null;
      return { h: 1.4 - Math.abs(dy) * 1.0, tint: ft + (1 - Math.abs(dy)) * 0.12 - 0.05 };
    }, { mat });
    for (let i = 0; i < 4; i++) {
      const a = -0.5 + i * 0.34;
      p.capsule(x0, cy, x0 + Math.cos(a) * L * 0.95, cy + Math.sin(a) * L * 0.5,
        1.0 * S, 0.4 * S, { mat, mask: true, tint: ft - 0.22, dome: 0 });
    }
  } else {
    // feathered: overlapping primaries
    const n = Math.round(6 + 4 * (D.wingFeathers ?? 1));
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = -0.42 + t * 0.85;
      const fl = L * (0.55 + 0.45 * Math.sin(t * Math.PI * 0.8 + 0.3));
      p.capsule(x0 + L * 0.06 * t, cy - W * 0.18 + t * W * 0.5,
        x0 + Math.cos(a) * fl, cy - W * 0.18 + t * W * 0.5 + Math.sin(a) * fl * 0.8,
        W * 0.20, W * 0.09, { mat, dome: W * 0.18, tint: ft + (t - 0.5) * 0.22 });
    }
    p.ellipse(x0 + L * 0.16, cy, L * 0.22, W * 0.5, { mat, dome: W * 0.4, tint: ft + 0.06 });
  }
  texture(p, mat, D.wingKind === 'membrane' ? 'none' : 'feather', S, 57);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, ambient: far ? 0.29 : LIGHT.ambient, outline: 0.85,
      outlineColor: D.outline || '#160f0a' }),
    ox: x0, oy: cy, len: L,
  };
}

function paintTail(D, S) {
  const L = D.tail * S, W = (D.tailW ?? 0.28) * L;
  const pad = 5;
  const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(W * 2.4) + pad * 2);
  const x0 = pad, cy = p.h / 2;
  if (D.tailKind === 'plume') {
    for (let i = 0; i < 7; i++) {
      const a = -0.55 + i * 0.19;
      p.capsule(x0, cy, x0 + Math.cos(a) * L, cy + Math.sin(a) * L * 0.7, W * 0.42, W * 0.16,
        { mat: D.tailMat || D.mat, dome: W * 0.4, tint: (i - 3) * 0.04 });
    }
  } else if (D.tailKind === 'tuft') {
    p.curve([{ x: x0, y: cy }, { x: x0 + L * 0.5, y: cy - L * 0.2 }, { x: x0 + L, y: cy - L * 0.05 }],
      W * 0.55, W * 0.24, { mat: D.mat, dome: W * 0.5, steps: 12 });
    p.ellipse(x0 + L, cy - L * 0.05, W * 0.9, W * 0.8, { mat: D.tailMat || D.mat, dome: W * 0.9, tint: 0.05 });
  } else {
    p.curve([{ x: x0, y: cy }, { x: x0 + L * 0.55, y: cy - L * 0.18 }, { x: x0 + L, y: cy + L * 0.08 }],
      W * 0.6, W * 0.16, { mat: D.tailMat || D.mat, dome: W * 0.55, steps: 14 });
  }
  texture(p, D.tailMat || D.mat, D.skin, S, 73);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, outline: 0.9, outlineColor: D.outline || '#160f0a' }),
    ox: x0, oy: cy, len: L,
  };
}

// ---------------------------------------------------------------------------

const cache = new Map();

export function buildCreature(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const S = def.scale ?? 1;
  const R = rng(def.seed || 5);
  const D = def;

  const rig = {
    id: def.id, def, S,
    body: paintBody(D, S, R),
    head: paintHead(D, S, R),
    neck: (D.neck || 0) > 2 ? paintLimb((D.neck + 2) * S, (D.neckR ?? 2.7) * S, (D.neckR ?? 2.7) * S * 0.85,
      D, S, false, { bow: 0.6 * S }) : null,
    legs: {},
    wing: D.wing ? { near: paintWing(D, S, false), far: paintWing(D, S, true) } : null,
    tail: D.tail ? paintTail(D, S) : null,
  };

  for (const far of [false, true]) {
    const k = far ? 'far' : 'near';
    rig.legs[k] = {
      upper: paintLimb(D.legU * S, (D.limbR ?? 1.9) * S, (D.limbR ?? 1.9) * S * 0.82, D, S, far, { bow: 0.7 * S }),
      lower: paintLimb(D.legL * S, (D.limbR ?? 1.9) * S * 0.8, (D.limbR ?? 1.9) * S * 0.5, D, S, far,
        { bow: -0.8 * S, hoof: D.foot === 'hoof', paw: D.foot === 'paw', claw: D.foot === 'claw' }),
    };
  }

  rig.sockets = {
    hip: { x: -rig.body.L * 0.28, y: rig.body.H * 0.22 },
    shoulder: { x: rig.body.L * 0.26, y: rig.body.H * 0.20 },
    neck: { x: rig.body.L * 0.32, y: -rig.body.H * (D.neckY ?? 0.18) },
    neckLen: (D.neck || 0) * S,
    tail: { x: -rig.body.L * 0.48, y: -rig.body.H * 0.08 },
    wing: { x: rig.body.L * 0.06, y: -rig.body.H * 0.30 },
  };
  rig.standH = (D.legU + D.legL) * S * 0.86 + rig.body.H * 0.4;
  rig.width = rig.body.L;
  cache.set(def.id, rig);
  return rig;
}

export function clearFaunaCache() { cache.clear(); }
