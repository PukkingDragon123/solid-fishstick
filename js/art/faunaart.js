// CRABDEN - the animals.
//
// A creature is described by a body plan and a spine, not by a stack of
// ellipses. The spine is a curve with a radius profile; the painter walks it
// and solves a real tube, so a monitor lizard is long and low with a heavy
// tail root, a beetle is three hard tagmata, and a jerboa is a deep chest on
// thin legs - and all three are the same twenty lines of description.
//
// Skin is not a noise pass either: scales are laid in rows that follow the
// spine, fur is grown as strands that break the silhouette, chitin gets hard
// plate seams and a tight specular.
//
// Everything is painted facing RIGHT.

import { Painter, makeCanvas, bezier, fbmTex } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.58, lightY: -0.64, lightZ: 0.4, ambient: 0.37, dither: 0.68 };

function rng(seed) {
  let s = (seed | 0) || 7;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; };
}

// ---------------------------------------------------------------------------
// spine + tube

/** Sample a curve given as control points into {x, y, r, t, nx, ny} stations. */
function spine(pts, radius, n = 34) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = bezier(pts, t);
    out.push({ x: p.x, y: p.y, t, r: radius(t) });
  }
  for (let i = 0; i <= n; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(n, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    out[i].tx = dx / l; out[i].ty = dy / l;
    out[i].nx = -dy / l; out[i].ny = dx / l;
  }
  return out;
}

/**
 * Paint a spine as a solid body. `squash` flattens the tube vertically, which
 * is what makes a lizard read as low-slung rather than as a sausage.
 */
function tube(p, sp, o = {}) {
  const squash = o.squash ?? 1;
  const dome = o.dome ?? 1;
  const belly = o.belly ?? 0.16;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sp) {
    x0 = Math.min(x0, s.x - s.r - 2); x1 = Math.max(x1, s.x + s.r + 2);
    y0 = Math.min(y0, s.y - s.r * squash - 2); y1 = Math.max(y1, s.y + s.r * squash + 2);
  }
  p.field(x0, y0, x1, y1, (px, py) => {
    let bestD = Infinity, bestS = null, bestSide = 0;
    for (const s of sp) {
      const dx = px - s.x, dy = (py - s.y) / squash;
      const d = Math.hypot(dx, dy);
      const k = d / (s.r || 0.001);
      if (k < bestD) { bestD = k; bestS = s; bestSide = dy; }
    }
    if (!bestS || bestD > 1) return null;
    const dz = Math.sqrt(clamp01(1 - bestD * bestD));
    // counter-shading: bellies catch bounce light, backs are the lit surface
    const under = clamp01(bestSide / (bestS.r || 1));
    let tint = (o.tint ?? 0) + under * belly - (1 - under) * 0.02;
    if (o.taperShade) tint -= (1 - bestS.t) * o.taperShade;
    return { h: dz * bestS.r * dome, tint };
  }, { mat: o.mat, mask: o.mask, under: o.under });
  return p;
}

// ---------------------------------------------------------------------------
// skin

/**
 * Body coordinates for a pixel: `u` runs along the animal from nose to tail,
 * `v` across it. Every texture that has to follow the body rather than the
 * screen goes through this, which is why the scales on a serpent curve with it
 * instead of sitting on it like wallpaper.
 */
function bodyUV(sp, x, y) {
  let best = null, bd = Infinity;
  for (const s of sp) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  if (!best) return { u: x, v: y };
  return {
    u: (x - best.x) * best.tx + (y - best.y) * best.ty + best.t * 90,
    v: (x - best.x) * best.nx + (y - best.y) * best.ny,
  };
}

/** Run a function over every pixel of one material. */
function overMat(p, mat, fn) {
  const m = p._matIndex.get(mat);
  if (!m) return false;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (p.mat[i] === m) fn(i, x, y);
    }
  }
  return true;
}

/**
 * Irregular patches of light and dark. Nothing alive is one colour: a lizard
 * has blotches, a mammal has a dark saddle and a pale belly, and it is this,
 * more than any amount of scale detail, that stops an animal reading as a
 * plastic toy.
 */
function mottle(p, mat, S, seed, amp = 0.20, scale = 1) {
  overMat(p, mat, (i, x, y) => {
    const f = 0.055 / (S * scale);
    const n = fbmTex(x * f, y * f, seed, 3) - 0.5;
    const n2 = fbmTex(x * f * 3.1, y * f * 3.1, seed + 71, 2) - 0.5;
    p.tint[i] += n * amp * 2 + n2 * amp * 0.7;
  });
}

/** Bands running across the animal, the way a snake or a skink is marked. */
function banding(p, mat, S, seed, sp, n = 9, amp = 0.24) {
  const R = rng(seed * 13 + 5);
  // not every animal is banded; the ones that are should stand out for it
  if (R() < 0.45) return;
  const phase = R() * 10, warp = 0.5 + R();
  overMat(p, mat, (i, x, y) => {
    const { u, v } = bodyUV(sp, x, y);
    const w = Math.sin(u * 0.09 * n / 6 + phase + Math.sin(v * 0.11) * warp);
    const k = Math.pow(Math.max(0, w), 2.2);
    p.tint[i] -= k * amp;
    p.hgt[i] += k * 0.20 * S;
  });
}

/** A pale underside: sunlight comes from above, so life counter-shades. */
function counterShade(p, mat, S, sp, amp = 0.22) {
  overMat(p, mat, (i, x, y) => {
    p.tint[i] += clamp(bodyUV(sp, x, y).v * 0.05, -1, 1) * amp;
  });
}

function skinPass(p, mat, kind, S, seed, sp) {
  switch (kind) {
    case 'scale': {
      // rows that follow the body, not the screen, each scale keeled down the
      // middle and shadowed where it overlaps the one behind it
      const sx = Math.max(2, 2.8 * S), sy = Math.max(2, 2.2 * S);
      const ok = overMat(p, mat, (i, x, y) => {
        const { u, v } = bodyUV(sp, x, y);
        const row = Math.floor(v / sy);
        const off = (row & 1) ? sx / 2 : 0;
        const fx = ((u + off) % sx + sx) % sx / sx - 0.5;
        const fy = ((v % sy) + sy) % sy / sy - 0.5;
        const d = Math.sqrt(fx * fx + fy * fy * 1.7);
        const k = clamp01(1 - d * 2.0);
        // the keel: a raised line down the centre of each scale
        const keel = clamp01(1 - Math.abs(fx) * 6) * clamp01(1 - Math.abs(fy) * 2.2);
        // and the seam where the next row laps over this one
        const seam = clamp01(1 - Math.abs(fy + 0.5) * 5.5);
        p.tint[i] += (k - 0.44) * 0.30 + keel * 0.13 - seam * 0.22;
        p.hgt[i] += k * 0.9 * S + keel * 0.4 * S - seam * 0.6 * S;
      });
      if (!ok) break;
      mottle(p, mat, S, seed + 17, 0.16);
      banding(p, mat, S, seed, sp, 5, 0.13);
      p.grain(mat, { freq: 0.55 / S, amp: 0.12, seed: seed + 3, oct: 2 });
      counterShade(p, mat, S, sp, 0.16);
      p.speckle(mat, { density: 0.02, amp: 0.30, seed: seed + 41 });
      break;
    }
    case 'fur': {
      // three layers: a soft undercoat, clumped guard hairs that lie along the
      // body, and blotchy colour over the top of both
      p.grain(mat, { freq: 0.8 / S, amp: 0.18, seed, oct: 2, height: 0.4 * S });
      const R = rng(seed * 7 + 3);
      const clumps = [];
      for (let i = 0; i < 90; i++) clumps.push({ a: R() * TAU, l: 0.5 + R() });
      overMat(p, mat, (i, x, y) => {
        const { u, v } = bodyUV(sp, x, y);
        // hairs lie backwards along the body and fan away from the spine
        const lie = u * 0.75 + v * 0.42 + Math.sin(v * 0.18 + u * 0.05) * 3.4;
        const strand = Math.sin(lie / Math.max(0.9, 1.15 * S));
        const clump = fbmTex(x * 0.09 / S, y * 0.09 / S, seed + 9, 2) - 0.5;
        p.tint[i] += strand * 0.13 + clump * 0.26;
        p.hgt[i] += strand * 0.45 * S + clump * 0.7 * S;
      });
      mottle(p, mat, S, seed + 31, 0.22, 1.6);
      counterShade(p, mat, S, sp, 0.20);
      p.grain(mat, { freq: 0.16 / S, amp: 0.16, seed: seed + 21, oct: 2 });
      break;
    }
    case 'chitin':
      // segment seams across the body, pitting over the plates, and a waxy
      // sheen where the light catches the top of each segment
      p.ridges(mat, { angle: 1.42, freq: 0.44 / S, amp: 0.24, height: 1.5 * S, seed, warp: 0.35 });
      overMat(p, mat, (i, x, y) => {
        const { u, v } = bodyUV(sp, x, y);
        const seg = Math.sin(u / Math.max(1.4, 3.4 * S));
        const k = Math.pow(clamp01(seg), 2);
        p.tint[i] += k * 0.16 - clamp01(-seg) * 0.22;
        p.hgt[i] += k * 1.1 * S;
        // punctures, the little pits that cover an insect's cuticle
        const pit = fbmTex(x * 0.9 / S, y * 0.9 / S, seed + 55, 1);
        if (pit > 0.72) { p.tint[i] -= 0.22; p.hgt[i] -= 0.7 * S; }
      });
      mottle(p, mat, S, seed + 13, 0.16, 1.3);
      p.grain(mat, { freq: 0.9 / S, amp: 0.09, seed: seed + 5 });
      p.speckle(mat, { density: 0.03, amp: 0.3, seed: seed + 11 });
      break;
    case 'shell':
      // growth rings, laid down from a centre, plus the pitting of a thing
      // that has been dragged through sand for years
      overMat(p, mat, (i, x, y) => {
        const { u, v } = bodyUV(sp, x, y);
        const r = Math.hypot(u * 0.7, v);
        const ring = Math.sin(r / Math.max(1.2, 2.6 * S));
        p.tint[i] += ring * 0.13;
        p.hgt[i] += ring * 0.8 * S;
      });
      mottle(p, mat, S, seed + 5, 0.24, 0.8);
      p.grain(mat, { freq: 0.17 / S, amp: 0.24, seed, oct: 3, height: 0.8 * S });
      p.speckle(mat, { density: 0.06, amp: 0.34, seed: seed + 11 });
      break;
    case 'plate':
      // overlapping osteoderms rather than a corrugated sheet
      p.ridges(mat, { angle: 1.5, freq: 0.30 / S, amp: 0.16, height: 1.5 * S, seed, warp: 0.2 });
      overMat(p, mat, (i, x, y) => {
        const { u, v } = bodyUV(sp, x, y);
        const cx2 = Math.round(u / Math.max(3, 5.2 * S));
        const cy2 = Math.round(v / Math.max(3, 4.4 * S));
        const du = u - cx2 * Math.max(3, 5.2 * S);
        const dv = v - cy2 * Math.max(3, 4.4 * S);
        const d = Math.hypot(du / Math.max(3, 5.2 * S), dv / Math.max(3, 4.4 * S)) * 2;
        const k = clamp01(1 - d);
        p.tint[i] += (k - 0.35) * 0.26;
        p.hgt[i] += k * k * 1.6 * S;
      });
      mottle(p, mat, S, seed + 23, 0.18);
      p.grain(mat, { freq: 0.5 / S, amp: 0.12, seed: seed + 7 });
      break;
    default:
      mottle(p, mat, S, seed + 3, 0.18);
      p.grain(mat, { freq: 0.42 / S, amp: 0.15, seed });
  }
}

/** Strands that break the outline. This is what makes fur read as fur. */
function furFringe(p, mat, S, seed, density = 0.55) {
  const m = p._matIndex.get(mat);
  if (!m) return;
  const R = rng(seed * 31 + 7);
  const edges = [];
  for (let y = 1; y < p.h - 1; y++) {
    for (let x = 1; x < p.w - 1; x++) {
      const i = y * p.w + x;
      if (p.mat[i] !== m) continue;
      let ex = 0, ey = 0, open = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!p.mat[i + dy * p.w + dx]) { open = true; ex -= dx; ey -= dy; }
      }
      if (open) edges.push({ x, y, ex, ey });
    }
  }
  for (const e of edges) {
    if (R() > density) continue;
    const l = (1.2 + R() * 3.0) * S;
    const a = Math.atan2(-e.ey, -e.ex) + (R() - 0.5) * 0.9;
    p.capsule(e.x, e.y, e.x + Math.cos(a) * l, e.y + Math.sin(a) * l,
      0.62 * S, 0.28 * S, { mat, dome: 0.5 * S, tint: 0.04 + (R() - 0.5) * 0.36 });
  }
}

// ---------------------------------------------------------------------------
// parts

function eye(p, x, y, r, D, tint = 0) {
  p.ellipse(x, y, r * 1.35, r * 1.30, { mat: D.mat, dome: r * 0.8, tint: tint - 0.22 });
  p.ellipse(x, y, r, r * (D.eyeSlit ? 1.05 : 1), { mat: 'eye', dome: r * 1.4, tint });
  if (D.eyeSlit) {
    p.capsule(x, y - r * 0.85, x, y + r * 0.85, r * 0.24, r * 0.18,
      { mat: 'eye', mask: true, dome: 0, tint: -0.75 });
  }
  p.ellipse(x - r * 0.36, y - r * 0.40, r * 0.32, r * 0.28, { mat: 'eye', mask: true, dome: r, tint: 0.72 });
}

function paintHead(D, S, R) {
  const L = D.headL * S, H = D.headH * S;
  const pad = Math.ceil(Math.max(L, H) * 0.7) + 6;
  const p = new Painter(Math.ceil(L * 1.6) + pad * 2, Math.ceil(H * 2.0) + pad * 2);
  const cx = pad + L * 0.30, cy = p.h / 2;

  const plan = D.plan;
  if (plan === 'insect' || plan === 'arachnid' || plan === 'myriapod') {
    // hard head capsule with compound eyes and working mouthparts
    p.ellipse(cx + L * 0.10, cy, L * 0.50, H * 0.46, { mat: D.mat, dome: H * 0.52, tint: 0.03 });
    if (D.mandible) {
      for (const sgn of [1, -1]) {
        p.curve([
          { x: cx + L * 0.42, y: cy + sgn * H * 0.16 },
          { x: cx + L * 0.72, y: cy + sgn * H * 0.34 },
          { x: cx + L * 0.96, y: cy + sgn * H * 0.06 },
        ], H * 0.15, H * 0.05, { mat: D.jawMat || 'horn', dome: H * 0.16, steps: 12,
          tint: sgn > 0 ? 0.04 : -0.16 });
      }
    }
    if (D.palps) {
      for (const sgn of [1, -1]) {
        p.capsule(cx + L * 0.34, cy + sgn * H * 0.28, cx + L * 0.66, cy + sgn * H * 0.46,
          H * 0.10, H * 0.06, { mat: D.mat, dome: H * 0.1, tint: sgn > 0 ? 0 : -0.16 });
      }
    }
    const er = (D.eyeR ?? 2.0) * S;
    eye(p, cx + L * 0.28, cy - H * 0.14, er, D, 0);
    if (D.ocelli) {
      for (let i = 0; i < 3; i++) {
        p.ellipse(cx + L * (0.02 + i * 0.09), cy - H * 0.34, er * 0.28, er * 0.28,
          { mat: 'eye', dome: er * 0.4, tint: 0.1 });
      }
    }
  } else if (plan === 'sprawler') {
    // wedge skull, long jaw line, brow ridge over the eye
    const sp = spine([
      { x: cx - L * 0.34, y: cy },
      { x: cx + L * 0.20, y: cy - H * 0.06 },
      { x: cx + L * 0.86, y: cy + H * 0.10 },
    ], (t) => H * (0.52 - 0.30 * Math.pow(t, 1.5)), 16);
    tube(p, sp, { mat: D.mat, squash: 0.94, dome: 0.95, belly: 0.14 });
    p.ellipse(cx + L * 0.06, cy - H * 0.28, L * 0.26, H * 0.16,
      { mat: D.mat, dome: H * 0.3, tint: 0.10 });                       // brow
    p.capsule(cx - L * 0.18, cy + H * 0.20, cx + L * 0.80, cy + H * 0.16,
      H * 0.09, H * 0.05, { mat: D.mat, mask: true, dome: 0, tint: -0.34 });  // jaw line
    p.ellipse(cx + L * 0.84, cy + H * 0.06, H * 0.10, H * 0.08,
      { mat: 'flesh', dome: H * 0.1, tint: -0.1 });                     // nostril
    eye(p, cx + L * 0.12, cy - H * 0.14, (D.eyeR ?? 2.0) * S, D, 0);
  } else {
    // mammal / bird skull
    p.ellipse(cx, cy, L * 0.46, H * 0.46, { mat: D.mat, dome: H * 0.52, tint: 0.02 });
    if (D.beak) {
      const bl = D.beak * S;
      p.curve([{ x: cx + L * 0.32, y: cy + H * 0.02 },
        { x: cx + L * 0.32 + bl * 0.6, y: cy + H * (D.beakDroop ?? 0.06) },
        { x: cx + L * 0.32 + bl, y: cy + H * (D.beakDroop ?? 0.06) * 2.2 }],
        H * 0.24, 0.65 * S, { mat: D.beakMat || 'horn', dome: H * 0.2, steps: 12 });
    } else if (D.muzzle) {
      const ml = D.muzzle * S;
      p.ellipse(cx + L * 0.30 + ml * 0.42, cy + H * 0.14, ml * 0.62, H * 0.30,
        { mat: D.muzzleMat || D.mat, dome: H * 0.3, tint: 0.04 });
      p.ellipse(cx + L * 0.30 + ml * 0.94, cy + H * 0.16, 1.3 * S, 1.05 * S,
        { mat: 'flesh', dome: 1.2 * S, tint: -0.12 });
    }
    eye(p, cx + L * (D.eyeX ?? 0.14), cy - H * (D.eyeY ?? 0.12), (D.eyeR ?? 2.0) * S, D, 0);
  }

  skinPass(p, D.mat, D.skin, S, D.seed || 3, [{ x: cx, y: cy, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.5 }]);

  // headgear
  if (D.ear) {
    for (const near of [false, true]) {
      const ex = cx - L * 0.16 - (near ? 0 : 1.5 * S), ey = cy - H * 0.34;
      const el = D.ear * S;
      p.curve([{ x: ex, y: ey }, { x: ex - el * 0.26, y: ey - el * 0.60 }, { x: ex + el * 0.14, y: ey - el }],
        H * 0.22, 0.85 * S, { mat: near ? D.mat : (D.matFar || D.mat), dome: H * 0.17, steps: 10,
          tint: near ? 0.05 : -0.22 });
      if (near) {
        p.curve([{ x: ex, y: ey }, { x: ex - el * 0.22, y: ey - el * 0.58 }, { x: ex + el * 0.12, y: ey - el * 0.9 }],
          H * 0.11, 0.45 * S, { mat: 'flesh', mask: true, dome: 0, steps: 10, tint: -0.16 });
      }
    }
  }
  if (D.horn) {
    const hl = D.horn * S;
    for (const sgn of [1, 0]) {
      p.curve([{ x: cx + L * 0.02 - sgn * 1.4 * S, y: cy - H * 0.36 },
        { x: cx + L * 0.28, y: cy - H * 0.36 - hl * 0.68 },
        { x: cx + L * 0.08, y: cy - H * 0.36 - hl }],
        1.6 * S, 0.55 * S, { mat: 'horn', dome: 1.4 * S, steps: 10, tint: sgn ? 0.06 : -0.2 });
    }
  }
  if (D.frill) {
    // a bony collar - the horned-lizard silhouette
    const fr = D.frill * S;
    for (let i = 0; i < 7; i++) {
      const a = -1.9 + i * 0.42;
      p.poly([
        { x: cx - L * 0.24, y: cy + Math.sin(a) * H * 0.3 },
        { x: cx - L * 0.24 + Math.cos(a) * fr, y: cy + Math.sin(a) * fr },
        { x: cx - L * 0.16, y: cy + Math.sin(a) * H * 0.42 },
      ], { mat: D.hornMat || 'horn', dome: 1.4 * S, feather: 1.6, tint: 0.04 - i * 0.02 });
    }
  }
  if (D.crest) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = cx - L * 0.26 + t * L * 0.5;
      const y = cy - H * 0.40;
      const cl = D.crest * S * (0.5 + Math.sin(t * Math.PI) * 0.9);
      p.curve([{ x, y }, { x: x - cl * 0.4, y: y - cl * 0.7 }, { x: x - cl * 0.8, y: y - cl }],
        1.15 * S, 0.35 * S, { mat: D.crestMat || 'horn', dome: 1.0 * S, steps: 8, tint: 0.05 });
    }
  }
  if (D.antenna) {
    for (const sgn of [1, 0]) {
      const al = D.antenna * S;
      p.curve([{ x: cx + L * 0.30, y: cy - H * 0.30 - sgn * 1.2 * S },
        { x: cx + L * 0.30 + al * 0.55, y: cy - H * 0.30 - al * 0.75 },
        { x: cx + L * 0.30 + al * 1.05, y: cy - H * 0.30 - al * 0.45 }],
        0.95 * S, 0.35 * S, { mat: D.antMat || D.mat, dome: 0.8 * S, steps: 12,
          tint: sgn ? 0.02 : -0.2 });
      if (D.antClub) {
        p.ellipse(cx + L * 0.30 + al * 1.05, cy - H * 0.30 - al * 0.45, 1.5 * S, 1.1 * S,
          { mat: D.antMat || D.mat, dome: 1.3 * S, tint: 0.06 });
      }
    }
  }
  if (D.skin === 'fur') furFringe(p, D.mat, S, (D.seed || 3) + 5, 0.5);
  p.smoothHeight(1, 0.38);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: D.outline || '#160f0a' }),
    ox: cx - L * 0.30, oy: cy, L, H,
  };
}

/** One limb segment. `style` changes the whole read of the animal. */
function paintLimb(len, r0, r1, D, S, far, o = {}) {
  const mat = far ? (D.matFar || D.mat) : D.mat;
  const ft = far ? -0.20 : 0;
  const pad = Math.ceil(Math.max(r0, r1) * 2.4 + 6);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 4);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;

  if (o.style === 'chitin') {
    // thin, hard, faintly barbed
    p.capsule(x0, cy, x1, cy, r0, r1, { mat, dome: r0 * 0.85, tint: ft });
    for (let i = 1; i < 4; i++) {
      const x = lerp(x0, x1, i / 4);
      p.ellipse(x, cy, r0 * 0.28, lerp(r0, r1, i / 4) * 1.02,
        { mat, mask: true, dome: r0 * 0.2, tint: ft - 0.2 });
    }
    if (o.barbs) {
      for (let i = 0; i < 4; i++) {
        const x = lerp(x0 + len * 0.15, x1, i / 4);
        p.capsule(x, cy + r0 * 0.5, x - r0 * 1.3, cy + r0 * 2.0, 0.5 * S, 0.3 * S,
          { mat: 'horn', dome: 0.5 * S, tint: ft });
      }
    }
  } else {
    p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - (o.bow || 0) }, { x: x1, y: cy }],
      r0, r1, { mat, dome: r0 * 0.9, steps: 12, tint: ft });
  }
  p.ellipse(x0, cy, r0 * 1.12, r0 * 1.06, { mat, dome: r0, tint: ft + 0.05 });

  if (o.foot === 'splay') {
    // reptile foot: long spread toes
    for (let i = 0; i < 4; i++) {
      const a = -0.55 + i * 0.38;
      const tl = r1 * (3.4 - Math.abs(i - 1.5) * 0.6);
      p.curve([{ x: x1, y: cy }, { x: x1 + Math.cos(a) * tl * 0.6, y: cy + Math.sin(a) * tl * 0.6 },
        { x: x1 + Math.cos(a) * tl, y: cy + Math.sin(a) * tl * 0.8 }],
        r1 * 0.62, r1 * 0.22, { mat, dome: r1 * 0.5, steps: 8, tint: ft - i * 0.03 });
    }
  } else if (o.foot === 'claw') {
    p.curve([{ x: x1, y: cy }, { x: x1 + r1 * 2.0, y: cy + r1 * 0.5 }, { x: x1 + r1 * 3.2, y: cy + r1 * 1.7 }],
      r1 * 0.85, 0.45, { mat: 'horn', dome: r1 * 0.7, steps: 8, tint: ft + 0.05 });
  } else if (o.foot === 'paw') {
    p.ellipse(x1 + r1 * 0.5, cy + r1 * 0.2, r1 * 1.7, r1 * 1.15, { mat, dome: r1 * 1.1, tint: ft + 0.03 });
    for (let i = 0; i < 3; i++) {
      p.ellipse(x1 + r1 * (0.9 + i * 0.5), cy + r1 * 0.55, r1 * 0.5, r1 * 0.4,
        { mat: 'horn', dome: r1 * 0.5, tint: ft });
    }
  } else if (o.foot === 'hoof') {
    p.ellipse(x1, cy, r1 * 1.5, r1 * 1.25, { mat: 'horn', dome: r1 * 1.2, tint: ft + 0.02 });
  } else if (o.foot === 'hook') {
    p.curve([{ x: x1, y: cy }, { x: x1 + r1 * 1.6, y: cy + r1 * 1.2 }, { x: x1 + r1 * 1.1, y: cy + r1 * 2.6 }],
      r1 * 0.7, 0.4, { mat: 'horn', dome: r1 * 0.6, steps: 8, tint: ft + 0.04 });
  }

  skinPass(p, mat, D.skin, S, 41, [{ x: (x0 + x1) / 2, y: cy, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.5 }]);
  if (D.skin === 'fur' && !far) furFringe(p, mat, S, 61, 0.34);
  return {
    cv: p.resolve(MATERIALS, {
      ...LIGHT, ambient: far ? 0.28 : LIGHT.ambient,
      outline: 1, outlineColor: far ? '#100a06' : (D.outline || '#160f0a'),
    }),
    ox: pad, oy: cy, len,
  };
}

function paintTail(D, S) {
  const L = D.tail * S;
  const W = (D.tailW ?? 0.26) * L;
  const pad = Math.ceil(W * 2.2) + 6;
  const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(W * 3.2) + pad * 2);
  const x0 = pad, cy = p.h / 2;
  const kind = D.tailKind || 'taper';

  if (kind === 'sting') {
    // scorpion: segmented, arched forward over the back
    const sp = spine([
      { x: x0, y: cy + W },
      { x: x0 + L * 0.55, y: cy - W * 1.6 },
      { x: x0 + L, y: cy + W * 0.2 },
    ], () => W * 0.55, 22);
    tube(p, sp, { mat: D.tailMat || D.mat, squash: 1, dome: 1 });
    for (let i = 1; i < 6; i++) {
      const s = sp[Math.round((i / 6) * sp.length)];
      p.ellipse(s.x, s.y, W * 0.6, W * 0.6, { mat: D.tailMat || D.mat, dome: W * 0.55, tint: 0.06 });
    }
    const tip = sp[sp.length - 1];
    p.ellipse(tip.x, tip.y, W * 0.8, W * 0.7, { mat: D.tailMat || D.mat, dome: W * 0.7, tint: 0.04 });
    p.curve([{ x: tip.x, y: tip.y }, { x: tip.x + W * 1.1, y: tip.y + W * 0.6 },
      { x: tip.x + W * 0.5, y: tip.y + W * 2.0 }], W * 0.42, 0.4, { mat: 'horn', dome: W * 0.4, steps: 8 });
  } else if (kind === 'plume') {
    for (let i = 0; i < 7; i++) {
      const a = -0.55 + i * 0.19;
      p.capsule(x0, cy, x0 + Math.cos(a) * L, cy + Math.sin(a) * L * 0.7, W * 0.42, W * 0.16,
        { mat: D.tailMat || D.mat, dome: W * 0.4, tint: (i - 3) * 0.045 });
    }
  } else if (kind === 'tuft') {
    p.curve([{ x: x0, y: cy }, { x: x0 + L * 0.5, y: cy - L * 0.2 }, { x: x0 + L, y: cy - L * 0.05 }],
      W * 0.55, W * 0.22, { mat: D.mat, dome: W * 0.5, steps: 12 });
    p.ellipse(x0 + L, cy - L * 0.05, W * 0.95, W * 0.85, { mat: D.tailMat || D.mat, dome: W * 0.9, tint: 0.06 });
  } else if (kind === 'club') {
    p.curve([{ x: x0, y: cy }, { x: x0 + L * 0.55, y: cy - L * 0.12 }, { x: x0 + L, y: cy }],
      W * 0.6, W * 0.5, { mat: D.tailMat || D.mat, dome: W * 0.55, steps: 12 });
    p.ellipse(x0 + L, cy, W * 1.15, W * 1.0, { mat: D.tailMat || D.mat, dome: W * 1.0, tint: 0.04 });
    for (let i = 0; i < 5; i++) {
      const a = -1.5 + i * 0.7;
      p.poly([{ x: x0 + L, y: cy }, { x: x0 + L + Math.cos(a) * W * 2.1, y: cy + Math.sin(a) * W * 2.1 },
        { x: x0 + L + Math.cos(a + 0.4) * W * 0.9, y: cy + Math.sin(a + 0.4) * W * 0.9 }],
        { mat: 'horn', dome: W * 0.5, feather: 1.4, tint: 0.05 });
    }
  } else {
    // a real tail: thick at the root, whip-thin at the tip, with a slight lift
    const sp = spine([
      { x: x0, y: cy },
      { x: x0 + L * 0.48, y: cy - L * (D.tailLift ?? 0.10) },
      { x: x0 + L, y: cy + L * 0.04 },
    ], (t) => Math.max(0.55, W * Math.pow(1 - t, 0.72)), 26);
    tube(p, sp, { mat: D.tailMat || D.mat, squash: D.tailSquash ?? 1, dome: 1, belly: 0.14 });
    skinPass(p, D.tailMat || D.mat, D.skin, S, 73, sp);
    if (D.tailCrest) {
      for (let i = 2; i < sp.length - 2; i += 2) {
        const s = sp[i];
        p.poly([{ x: s.x - 1.2 * S, y: s.y - s.r }, { x: s.x, y: s.y - s.r - D.tailCrest * S },
          { x: s.x + 1.2 * S, y: s.y - s.r }], { mat: D.crestMat || 'horn', dome: 0.9 * S, feather: 1.2, tint: 0.05 });
      }
    }
  }
  if (D.skin === 'fur') furFringe(p, D.tailMat || D.mat, S, 91, 0.45);
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, outline: 0.95, outlineColor: D.outline || '#160f0a' }),
    ox: x0, oy: cy, len: L,
  };
}

function paintWing(D, S, far) {
  const L = D.wing * S, W = L * (D.wingW ?? 0.5);
  const pad = 6;
  const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(W * 2) + pad * 2);
  const x0 = pad, cy = p.h / 2;
  const mat = D.wingMat || (far ? (D.matFar || D.mat) : D.mat);
  const ft = far ? -0.20 : 0;

  if (D.wingKind === 'elytra') {
    // hard wing cases: two shells over the abdomen
    p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
      const u = (x - x0) / L;
      if (u < 0 || u > 1) return null;
      const span = W * Math.pow(Math.sin(Math.pow(u, 0.62) * Math.PI * 0.9 + 0.2), 0.55);
      const dy = (y - cy) / span;
      if (Math.abs(dy) > 1) return null;
      const dz = Math.sqrt(clamp01(1 - dy * dy));
      return { h: dz * W * 0.8, tint: ft + (dy < -0.2 ? 0.06 : -0.04) };
    }, { mat });
    p.ridges(mat, { angle: 0, freq: 0.55 / S, amp: 0.14, height: 0.8 * S, seed: 17, warp: 0.2 });
    p.capsule(x0, cy - W * 0.9, x0 + L * 0.96, cy - W * 0.2, 0.7 * S, 0.4 * S,
      { mat, mask: true, dome: 0, tint: ft - 0.3 });
  } else if (D.wingKind === 'membrane') {
    p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
      const u = (x - x0) / L;
      if (u < 0 || u > 1) return null;
      const span = W * Math.pow(Math.sin(Math.pow(u, 0.7) * Math.PI * 0.92 + 0.16), 0.6);
      const mid = cy + W * 0.15 * u;
      const dy = (y - mid) / span;
      if (dy < -1 || dy > 1) return null;
      return { h: 1.4 - Math.abs(dy) * 1.0, tint: ft + (1 - Math.abs(dy)) * 0.12 - 0.05 };
    }, { mat });
    for (let i = 0; i < 5; i++) {
      const a = -0.55 + i * 0.30;
      p.capsule(x0, cy, x0 + Math.cos(a) * L * 0.96, cy + Math.sin(a) * L * 0.52,
        0.85 * S, 0.35 * S, { mat, mask: true, tint: ft - 0.26, dome: 0 });
    }
  } else {
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
  return {
    cv: p.resolve(MATERIALS, { ...LIGHT, ambient: far ? 0.28 : LIGHT.ambient,
      outline: 0.85, outlineColor: D.outline || '#160f0a' }),
    ox: x0, oy: cy, len: L,
  };
}

// ---------------------------------------------------------------------------
// body plans

const PLAN = {
  /** Lizards: long, low, heavy at the hips, head carried out front. */
  sprawler(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 1.4) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 2.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const sp = spine([
      { x: cx - L / 2, y: cy + H * 0.10 },
      { x: cx - L * 0.10, y: cy - H * (D.arch ?? 0.14) },
      { x: cx + L * 0.24, y: cy - H * (D.arch ?? 0.14) * 0.7 },
      { x: cx + L / 2, y: cy + H * 0.04 },
    ], (t) => H * 0.5 * (0.46 + 0.54 * Math.pow(Math.sin(Math.pow(t, 0.86) * Math.PI), 0.42)), 30);
    tube(p, sp, { mat: D.mat, squash: D.squash ?? 0.86, dome: 0.92, belly: D.belly ?? 0.20 });
    skinPass(p, D.mat, D.skin, S, D.seed || 3, sp);
    if (D.dorsal) {
      for (let i = 4; i < sp.length - 3; i += 2) {
        const s = sp[i];
        const k = D.dorsal * S * (0.6 + Math.sin(s.t * Math.PI) * 0.7);
        p.poly([{ x: s.x - 1.3 * S, y: s.y - s.r * (D.squash ?? 0.86) },
          { x: s.x - 0.2 * S, y: s.y - s.r * (D.squash ?? 0.86) - k },
          { x: s.x + 1.3 * S, y: s.y - s.r * (D.squash ?? 0.86) }],
          { mat: D.crestMat || 'horn', dome: 1.0 * S, feather: 1.3, tint: 0.05 });
      }
    }
    if (D.bands) {
      for (let i = 0; i < D.bands; i++) {
        const s = sp[Math.round(lerp(6, sp.length - 6, i / Math.max(1, D.bands - 1)))];
        p.capsule(s.x + s.nx * s.r, s.y + s.ny * s.r, s.x - s.nx * s.r, s.y - s.ny * s.r,
          1.5 * S, 1.1 * S, { mat: D.mat, mask: true, tint: -0.30, dome: 0 });
      }
    }
    return { p, cx, cy, sp, L, H };
  },

  /** Six legs, three tagmata, a waist you can see. */
  insect(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 1.5) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 2.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const ab = { x: cx - L * 0.26, y: cy + H * 0.04, rx: L * 0.28, ry: H * (D.abdomen ?? 0.52) };
    const th = { x: cx + L * 0.20, y: cy - H * 0.04, rx: L * 0.22, ry: H * 0.40 };
    p.ellipse(ab.x, ab.y, ab.rx, ab.ry, { mat: D.mat, dome: ab.ry * 1.1, tint: 0 });
    p.ellipse(th.x, th.y, th.rx, th.ry, { mat: D.mat, dome: th.ry * 1.15, tint: 0.05 });
    p.capsule(ab.x + ab.rx * 0.7, ab.y - H * 0.04, th.x - th.rx * 0.6, th.y + H * 0.02,
      H * 0.16, H * 0.18, { mat: D.mat, dome: H * 0.18, tint: -0.08 });
    skinPass(p, D.mat, D.skin, S, D.seed || 3, [{ x: cx, y: cy, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.5 }]);
    if (D.segments) {
      for (let i = 1; i < D.segments; i++) {
        const t = i / D.segments;
        const x = ab.x - ab.rx + t * ab.rx * 2;
        p.ellipse(x, ab.y, 0.7 * S, ab.ry * Math.sqrt(clamp01(1 - Math.pow(t * 2 - 1, 2))) * 1.02,
          { mat: D.mat, mask: true, dome: 0.4 * S, tint: -0.22 });
      }
    }
    const sp = [{ x: ab.x, y: ab.y, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.3, r: ab.ry },
      { x: th.x, y: th.y, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.7, r: th.ry }];
    return { p, cx, cy, sp, L, H, thorax: th, abdomen: ab };
  },

  /** Eight legs on a fused front, a soft bulb behind. */
  arachnid(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 1.5) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 2.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const ab = { x: cx - L * 0.24, y: cy + H * 0.02, rx: L * 0.30, ry: H * 0.52 };
    const ce = { x: cx + L * 0.24, y: cy - H * 0.02, rx: L * 0.26, ry: H * 0.44 };
    p.ellipse(ab.x, ab.y, ab.rx, ab.ry, { mat: D.mat, dome: ab.ry * 1.15 });
    p.ellipse(ce.x, ce.y, ce.rx, ce.ry, { mat: D.mat, dome: ce.ry * 1.2, tint: 0.05 });
    skinPass(p, D.mat, D.skin, S, D.seed || 3, [{ x: cx, y: cy, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.5 }]);
    const sp = [{ x: ab.x, y: ab.y, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.3, r: ab.ry },
      { x: ce.x, y: ce.y, tx: 1, ty: 0, nx: 0, ny: 1, t: 0.7, r: ce.ry }];
    return { p, cx, cy, sp, L, H, thorax: ce, abdomen: ab };
  },

  /** Legless: one long smooth tube laid in an S. */
  serpent(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 2.2) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const sp = spine([
      { x: cx - L / 2, y: cy + H * 0.9 },
      { x: cx - L * 0.18, y: cy - H * 1.1 },
      { x: cx + L * 0.20, y: cy + H * 1.0 },
      { x: cx + L / 2, y: cy - H * 0.2 },
    ], (t) => H * 0.5 * (0.30 + 0.70 * Math.pow(Math.sin(Math.pow(t, 1.5) * Math.PI * 0.96), 0.30)), 40);
    tube(p, sp, { mat: D.mat, squash: 0.94, dome: 0.95, belly: 0.22 });
    skinPass(p, D.mat, D.skin, S, D.seed || 3, sp);
    if (D.bands) {
      for (let i = 0; i < D.bands; i++) {
        const s2 = sp[Math.round(lerp(4, sp.length - 5, i / Math.max(1, D.bands - 1)))];
        p.capsule(s2.x + s2.nx * s2.r, s2.y + s2.ny * s2.r, s2.x - s2.nx * s2.r, s2.y - s2.ny * s2.r,
          1.4 * S, 1.0 * S, { mat: D.mat, mask: true, tint: -0.28, dome: 0 });
      }
    }
    return { p, cx, cy, sp, L, H };
  },

  /** Long, many-segmented, many-legged. */
  myriapod(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 1.6) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 2.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const n = D.segments || 9;
    const sp = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = cx - L / 2 + t * L;
      const y = cy + Math.sin(t * Math.PI * 2.2) * H * 0.10;
      const r = H * 0.5 * (0.55 + 0.45 * Math.sin(Math.pow(t, 0.8) * Math.PI));
      p.ellipse(x, y, r * 1.16, r, { mat: D.mat, dome: r * 1.15, tint: (i % 2) * 0.06 - 0.02 });
      sp.push({ x, y, r, t, tx: 1, ty: 0, nx: 0, ny: 1 });
    }
    skinPass(p, D.mat, D.skin, S, D.seed || 3, sp);
    return { p, cx, cy, sp, L, H };
  },

  /** Furred quadruped: deep chest, tucked belly, erect limbs. */
  beast(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 1.5) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 2.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const sp = spine([
      { x: cx - L / 2, y: cy - H * 0.02 },
      { x: cx - L * 0.14, y: cy - H * (D.arch ?? 0.20) },
      { x: cx + L * 0.22, y: cy - H * (D.arch ?? 0.20) * 0.8 },
      { x: cx + L / 2, y: cy - H * 0.10 },
    ], (t) => H * 0.5 * (0.38 + 0.62 * Math.pow(Math.sin(Math.pow(t, 1.15) * Math.PI * 0.98), 0.34)), 30);
    tube(p, sp, { mat: D.mat, squash: D.squash ?? 1.0, dome: 0.95, belly: D.belly ?? 0.20 });
    skinPass(p, D.mat, D.skin, S, D.seed || 3, sp);
    if (D.stripes) {
      for (let i = 0; i < D.stripes; i++) {
        const s = sp[Math.round(lerp(6, sp.length - 7, i / Math.max(1, D.stripes - 1)))];
        p.capsule(s.x, s.y - s.r, s.x - s.r * 0.5, s.y + s.r * 0.5, 1.3 * S, 0.9 * S,
          { mat: D.mat, mask: true, tint: -0.30, dome: 0 });
      }
    }
    if (D.spots) p.speckle(D.mat, { density: 0.028, amp: 0.42, seed: 91, size: Math.max(1, Math.round(1.6 * S)) });
    furFringe(p, D.mat, S, (D.seed || 3) + 9, 0.5);
    return { p, cx, cy, sp, L, H };
  },

  /** Upright, two legs, wings folded. */
  bird(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 1.5) + 6;
    const p = new Painter(Math.ceil(L) + pad * 2, Math.ceil(H * 2.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const sp = spine([
      { x: cx - L * 0.48, y: cy - H * 0.16 },
      { x: cx - L * 0.06, y: cy + H * 0.10 },
      { x: cx + L * 0.46, y: cy - H * 0.22 },
    ], (t) => H * 0.5 * (0.34 + 0.66 * Math.pow(Math.sin(t * Math.PI), 0.4)), 26);
    tube(p, sp, { mat: D.mat, squash: 1, dome: 1, belly: 0.20 });
    skinPass(p, D.mat, D.skin, S, D.seed || 3, sp);
    return { p, cx, cy, sp, L, H };
  },
};

/** Where the limbs hang, per plan. */
function planSockets(plan, r, D, S) {
  const { L, H, cx, cy } = r;
  const rel = (x, y) => ({ x: x - cx, y: y - cy });
  switch (plan) {
    case 'insect':
      return {
        legs: [
          rel(r.thorax.x + r.thorax.rx * 0.62, r.thorax.y + H * 0.20),
          rel(r.thorax.x, r.thorax.y + H * 0.26),
          rel(r.thorax.x - r.thorax.rx * 0.66, r.thorax.y + H * 0.24),
        ],
        head: rel(r.thorax.x + r.thorax.rx * 0.85, r.thorax.y - H * 0.06),
        tail: rel(r.abdomen.x - r.abdomen.rx * 0.9, r.abdomen.y),
        wing: rel(r.thorax.x - r.thorax.rx * 0.2, r.thorax.y - H * 0.28),
      };
    case 'arachnid':
      return {
        legs: [
          rel(r.thorax.x + r.thorax.rx * 0.7, r.thorax.y + H * 0.18),
          rel(r.thorax.x + r.thorax.rx * 0.24, r.thorax.y + H * 0.22),
          rel(r.thorax.x - r.thorax.rx * 0.24, r.thorax.y + H * 0.22),
          rel(r.thorax.x - r.thorax.rx * 0.7, r.thorax.y + H * 0.18),
        ],
        head: rel(r.thorax.x + r.thorax.rx * 0.9, r.thorax.y),
        tail: rel(r.abdomen.x - r.abdomen.rx * 0.8, r.abdomen.y - H * 0.18),
        wing: null,
      };
    case 'serpent': {
      const nose = r.sp[r.sp.length - 1], root = r.sp[0];
      return { legs: [], head: rel(nose.x - nose.r * 0.4, nose.y),
        tail: rel(root.x + root.r * 0.4, root.y), wing: null };
    }
    case 'myriapod': {
      const legs = [];
      const n = Math.min(6, r.sp.length - 2);
      for (let i = 0; i < n; i++) {
        const s = r.sp[1 + Math.round(i * (r.sp.length - 3) / Math.max(1, n - 1))];
        legs.push(rel(s.x, s.y + s.r * 0.6));
      }
      return { legs, head: rel(r.sp[r.sp.length - 1].x, r.sp[r.sp.length - 1].y),
        tail: rel(r.sp[0].x, r.sp[0].y), wing: null };
    }
    case 'bird':
      return {
        legs: [rel(cx - L * 0.02, cy + H * 0.28), rel(cx - L * 0.16, cy + H * 0.26)],
        head: rel(cx + L * 0.40, cy - H * 0.24),
        tail: rel(cx - L * 0.48, cy - H * 0.10),
        wing: rel(cx - L * 0.02, cy - H * 0.22),
      };
    default: {
      const nose = r.sp[r.sp.length - 1], root = r.sp[0];
      const sq = D.squash ?? 1;
      return {
        legs: [rel(cx + L * 0.27, cy + H * (D.plan === 'sprawler' ? 0.30 : 0.16) * sq),
          rel(cx - L * 0.27, cy + H * (D.plan === 'sprawler' ? 0.32 : 0.18) * sq)],
        head: rel(nose.x - nose.r * 0.5, nose.y - H * (D.neckY ?? 0.06)),
        tail: rel(root.x + root.r * 0.4, root.y - H * 0.02),
        wing: rel(cx + L * 0.02, cy - H * 0.26),
      };
    }
  }
}

// ---------------------------------------------------------------------------

const cache = new Map();

export function buildCreature(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const S = def.scale ?? 1;
  const R = rng(def.seed || 5);
  const D = def;
  const plan = D.plan || 'beast';

  const built = (PLAN[plan] || PLAN.beast)(D, S);
  const bodyCv = built.p.smoothHeight(1, 0.36).resolve(MATERIALS, {
    ...LIGHT, outline: 1, outlineColor: D.outline || '#160f0a',
  });
  const body = { cv: bodyCv, ox: built.cx, oy: built.cy, L: built.L, H: built.H };
  const sockets = planSockets(plan, built, D, S);

  const legStyle = plan === 'insect' || plan === 'arachnid' || plan === 'myriapod' ? 'chitin' : 'curve';
  const footFor = D.foot || (plan === 'sprawler' ? 'splay' : plan === 'beast' ? 'paw' : 'hook');
  const limbR = (D.limbR ?? (legStyle === 'chitin' ? 1.15 : 1.9)) * S;

  if (!D.legU) sockets.legs = [];
  const legs = {};
  for (const far of [false, true]) {
    if (!D.legU) { legs[far ? 'far' : 'near'] = null; continue; }
    legs[far ? 'far' : 'near'] = {
      upper: paintLimb(D.legU * S, limbR, limbR * 0.82, D, S, far,
        { style: legStyle, bow: (plan === 'sprawler' ? -1.0 : 0.7) * S }),
      lower: paintLimb(D.legL * S, limbR * 0.82, limbR * 0.5, D, S, far,
        { style: legStyle, bow: (plan === 'sprawler' ? 1.1 : -0.7) * S, foot: footFor, barbs: D.barbs }),
    };
  }

  const arm = D.raptorial ? {
    upper: paintLimb(D.raptorial * S, limbR * 1.35, limbR * 1.05, D, S, false,
      { style: 'chitin', barbs: true }),
    lower: paintLimb(D.raptorial * 0.85 * S, limbR * 1.05, limbR * 0.55, D, S, false,
      { style: 'chitin', barbs: true, foot: 'hook' }),
  } : null;

  const rig = {
    id: def.id, def, S, plan,
    arm,
    body,
    head: paintHead(D, S, R),
    neck: (D.neck || 0) > 2
      ? paintLimb((D.neck + 2) * S, (D.neckR ?? 2.6) * S, (D.neckR ?? 2.6) * S * 0.86, D, S, false, { bow: 0.6 * S })
      : null,
    legs,
    legPairs: sockets.legs.length,
    wing: D.wing && sockets.wing ? { near: paintWing(D, S, false), far: paintWing(D, S, true) } : null,
    tail: D.tail ? paintTail(D, S) : null,
    sockets,
  };
  const stance = plan === 'sprawler' ? 0.68
    : (plan === 'insect' || plan === 'arachnid' || plan === 'myriapod') ? 0.58
      : 0.84;
  rig.standH = D.legU ? (D.legU + D.legL) * S * stance + body.H * 0.40 : body.H * 0.5;
  rig.width = body.L;
  cache.set(def.id, rig);
  return rig;
}

export function clearFaunaCache() { cache.clear(); }
