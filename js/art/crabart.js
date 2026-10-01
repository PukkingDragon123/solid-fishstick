// CRABDEN - the Oasis Crab, seen head-on.
//
// A crab does not walk the way it faces. It faces you and goes sideways, so
// that is how it is drawn: a wide carapace seen from slightly above, eight legs
// radiating out from under it, two claws held forward, and a face underneath
// the shell's front lip.
//
// Because the camera sits a little above the animal, the top of the shell is a
// real foreshortened surface rather than a silhouette - which is where the
// garden, the basin and the spring all live. `shellSurface(a, b)` is the
// single source of truth for that surface: the art is painted from it and the
// garden is planted on it, so a plant can never float off the rock.

import { fbmTex, Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.52, lightY: -0.70, lightZ: 0.44, ambient: 0.37, dither: 0.42 };

export const CRAB_STAGES = ['hatchling', 'juvenile', 'adult', 'ancient'];
const STAGE_T = { hatchling: 0, juvenile: 0.5, adult: 0.76, ancient: 1 };

const rnd = (n) => {
  let h = Math.imul(n | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

// how far the camera is tilted over the animal
const KY = 0.44;      // depth foreshortening
const KZ = 0.86;      // how much height lifts a point up the screen

/** Every number that describes one crab, in sprite pixels. */
export function crabMetrics(stage = 'adult') {
  const t = STAGE_T[stage] ?? 0.72;
  // a hatchling is a pebble of a thing in a shell the size of a thimble
  const shellW = Math.round(lerp(36, 92, Math.pow(t, 0.86)));
  const S = shellW / 92;
  const rx = shellW * 0.5;
  const ry = rx * lerp(0.56, 0.48, t);
  const domeH = rx * 0.62;
  const skirtH = rx * lerp(0.30, 0.34, t);       // the body whorl's flank
  const faceH = rx * lerp(0.36, 0.30, t);        // the animal, under and in front
  // long eye stalks: the young are mostly eyes
  const eyeRise = rx * lerp(0.46, 0.32, t);
  const spireLen = rx * 1.10;                    // the shell's point, behind

  const pad = Math.round(6 + 8 * t);
  const crownLift = domeH * KZ;
  const w = Math.ceil(shellW + pad * 2 + spireLen + rx * 0.25);
  const h = Math.ceil(crownLift + ry * 2 + skirtH + faceH + pad * 2);

  const ox = Math.round(pad + spireLen + rx);
  const topCy = Math.round(pad + crownLift + ry);   // centre of the top ellipse
  const rimY = topCy + ry + skirtH;                 // the bottom edge of the shell
  const oy = Math.round(rimY + faceH * 0.15);       // anchor: the hip line

  const legN = 2;
  const legLen = [shellW * 0.06, shellW * 0.27, shellW * 0.26];

  return {
    stage, t, S, w, h, ox, oy, hermit: true, spireLen,
    shellW, rx, ry, domeH, skirtH, faceH, eyeRise, pad, topCy, rimY,
    sbase: rimY, sx0: ox - rx, sx1: ox + rx, shellH: Math.round(ry * 2 + domeH),
    bodyW: Math.round(shellW * 0.80), bodyH: Math.round(faceH),
    legN, legLen,
    reach: (legLen[0] + legLen[1] + legLen[2] * 1.1) * 0.88,
    clawLen: [shellW * 0.065, shellW * 0.070],
    clawScale: lerp(0.30, 0.36, t),
    basin: { a: 0, b: -0.30, r: 0.44 },
    organ: { a: 0, b: -0.30 },
  };
}

// ---------------------------------------------------------------------------
// the top surface

/** How deep the basin cuts into the dome at (a, b). */
function basinCut(m, a, b) {
  const d = Math.hypot((a - m.basin.a) / m.basin.r, (b - m.basin.b) / (m.basin.r * 0.9));
  if (d >= 1) return 0;
  const k = 1 - d;
  return m.domeH * 0.42 * k * k * (3 - 2 * k);
}

/**
 * A point on the shell's upper surface. `a` runs across the animal (-1 left,
 * +1 right), `b` runs away from you (-1 far, +1 near). Returns sprite-space
 * coordinates relative to the anchor, plus the surface normal.
 */
export function shellSurface(m, a, b) {
  const r2 = a * a + b * b;
  const inside = r2 <= 1;
  const q = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)));
  const z = m.domeH * q - basinCut(m, a, b);
  const sx = m.ox + a * m.rx;
  const sy = m.topCy + b * m.ry * KY * (m.ry / m.ry) * 1 - z * KZ;
  // normal of the dome, tilted into screen space
  const nx = a, ny = b * 0.5, nz = Math.max(0.2, q);
  const l = Math.hypot(nx, ny, nz) || 1;
  return {
    a, b, inside, z,
    x: sx - m.ox, y: sy - m.oy, sx, sy,
    nx: nx / l, ny: -nz / l, nz: nz / l,
    depth: b,
  };
}

/** Back-compatible 1D walk across the shell, back to front. */
export function shellPoint(m, u) {
  const b = lerp(-0.86, 0.86, clamp01(u));
  return shellSurface(m, 0, b);
}

// ---------------------------------------------------------------------------

function paintBody(m, seed = 3) {
  const p = new Painter(m.w, m.h);
  const S = Math.max(0.45, m.S);
  const { ox, topCy, rx, ry, domeH, skirtH, rimY } = m;

  // -- the body whorl: a whelk shell's last and biggest turn ---------------
  // Its top is the same surface the garden has always stood on, so nothing
  // planted needs to move. It is painted as shell now: glossy olive, combed
  // with fine axial ribs and broad spiral bands, worn through to pearl in
  // places, with a little green growing in the grooves.
  const maxY = new Int32Array(p.w).fill(-1);
  const step = 1 / Math.max(14, Math.round(rx * 2.0));
  for (let b2 = -1; b2 <= 1.0001; b2 += step) {
    for (let a2 = -1; a2 <= 1.0001; a2 += step) {
      const r2 = a2 * a2 + b2 * b2;
      if (r2 > 1) continue;
      const s0 = shellSurface(m, a2, b2);
      const q = Math.sqrt(Math.max(0, 1 - r2));
      const inBasin = basinCut(m, a2, b2) > 0.4;
      let tint = 0.04 + q * 0.22 - Math.abs(a2 + 0.25) * 0.12 + b2 * 0.05;
      if (inBasin) tint -= 0.26;
      let lift = domeH * 0.62 * q + (inBasin ? -2.4 : 0) + b2 * 1.2;
      let mat = 'conch';
      if (!inBasin) {
        const rib = Math.sin((a2 * 0.9 + b2 * 0.3) * rx * 1.3);
        tint += rib * 0.022; lift += rib * 0.18 * S;
        const band = Math.sin((b2 - a2 * 0.55) * 9 + 0.7);
        tint += band * 0.03;
        const wear = fbmTex(a2 * 3.1 + 4.4, b2 * 3.1 - 1.3, seed + 31, 3);
        const alg = fbmTex(a2 * 5.3 + 7.1, b2 * 5.3 + 2.2, seed + 5, 3);
        if (wear > 0.70) { mat = 'conchPearl'; tint += (wear - 0.7) * 0.8; }
        else if (alg > 0.70 && r2 > 0.25 && rib < 0.2) { mat = 'moss'; tint += 0.04; lift += 0.4 * S; }
      }
      const px = Math.round(s0.sx), py = Math.round(s0.sy);
      p.ellipse(s0.sx, s0.sy, 1.05, 1.05, { mat, dome: 0, addHeight: false, tint, lift });
      for (let dx = -1; dx <= 1; dx++) {
        const cx2 = px + dx;
        if (cx2 >= 0 && cx2 < p.w && py > maxY[cx2]) maxY[cx2] = py;
      }
    }
  }

  // -- its flank, hung off the silhouette -----------------------------------
  const wallBase = new Int32Array(p.w).fill(-1);
  for (let x = 0; x < p.w; x++) {
    if (maxY[x] < 0) continue;
    const sa = (x - ox) / rx;
    const q = Math.sqrt(Math.max(0, 1 - Math.min(1, sa * sa)));
    const wh = skirtH * (0.25 + 0.75 * Math.pow(q, 0.9));
    const y0 = maxY[x] + 1, y1 = maxY[x] + wh;
    wallBase[x] = Math.round(y1);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      // the flank bulges out and round under the top: no ledge where the
      // two meet, because on a shell they are the same surface
      let h = domeH * 0.5 * q * Math.sin(Math.PI * (0.12 + 0.80 * t));
      let tint = -0.02 - Math.pow(Math.abs(sa), 2.0) * 0.2 - t * 0.10;
      const rib = Math.sin((sa * 0.9) * rx * 1.3 + t * 2.2);
      tint += rib * 0.022; h += rib * 0.15 * S;
      // the suture: where this turn of the shell meets the one under it
      const sut = t - (0.55 + Math.sin(sa * 2.4) * 0.08);
      if (Math.abs(sut) < 0.05) { tint -= 0.14; h -= 0.6 * S; }
      else if (sut > 0.05 && sut < 0.10) tint += 0.05;
      if (t > 0.82) { const k = (t - 0.82) / 0.18; tint -= k * k * 0.42; }
      p.rect(x, y, 1, 1, { mat: 'conch', dome: 0, addHeight: false, tint, lift: h });
    }
  }

  // -- the spire, running back to its point ---------------------------------
  // Each turn smaller than the last, stacked back and a little up, with the
  // dark seam of a suture between them. It goes in behind the body whorl.
  const spN = 5;
  let prev = null;
  for (let k = 1; k <= spN; k++) {
    const u = k / spN;
    const r = (ry + skirtH * 0.55) * Math.pow(0.70, k) * 1.05;
    const cx = ox - rx * (0.62 + 0.96 * Math.pow(u, 0.85));
    const cy = topCy + ry * 0.55 - u * ry * 0.75;
    p.ellipse(cx, cy, r * 1.2, r, { mat: 'conch', dome: r * 0.95, tint: 0.04 - u * 0.05, under: true });
    // ribs across the whorl
    for (let j = -2; j <= 2; j++) {
      p.capsule(cx + j * r * 0.32, cy - r * 0.85, cx + j * r * 0.32 - r * 0.15, cy + r * 0.85, 0.35 * S + 0.3, 0.35 * S + 0.3,
        { mat: 'conch', mask: true, dome: 0.4, tint: -0.12, onlyMat: 'conch' });
    }
    if (prev) {
      // the seam against the bigger whorl in front of it
      p.ellipse(cx + r * 1.05, cy + r * 0.05, r * 0.16 + 0.4, r * 0.9, { mat: 'conch', mask: true, dome: -0.6, tint: -0.32, onlyMat: 'conch' });
    }
    prev = { cx, cy, r };
  }
  // the very tip
  p.capsule(prev.cx - prev.r * 0.9, prev.cy - prev.r * 0.1, prev.cx - prev.r * 2.0, prev.cy - prev.r * 0.45,
    prev.r * 0.6, 0.6, { mat: 'conchPearl', dome: prev.r * 0.5, tint: -0.04, under: true });

  p.grain('conch', { freq: 0.07 / S, amp: 0.10, seed: seed + 77, oct: 2 });
  p.grain('conch', { freq: 0.3 / S, amp: 0.06, seed, oct: 3, height: 0.3 * S });
  p.grain('moss', { freq: 0.7 / S, amp: 0.12, seed: seed + 4 });

  // -- the basin the spring wells up in, its rim and the water organ -------
  for (let i = 0; i <= 52; i++) {
    const th = (i / 52) * TAU;
    const a2 = m.basin.a + Math.cos(th) * m.basin.r * 1.16;
    const b2 = m.basin.b + Math.sin(th) * m.basin.r * 1.06;
    if (a2 * a2 + b2 * b2 > 0.94) continue;
    const s0 = shellSurface(m, a2, b2);
    p.ellipse(s0.sx, s0.sy, Math.max(1, 1.3 * S), Math.max(1, 1.1 * S), {
      mat: 'conchPearl', dome: 1.2 * S, tint: Math.sin(th) < 0 ? 0.14 : -0.08,
      lift: domeH * 0.62 * Math.sqrt(Math.max(0, 1 - a2 * a2 - b2 * b2)) + 2.2 * S,
    });
  }
  const org = shellSurface(m, m.organ.a, m.organ.b);
  const orr = Math.max(2.2, 4.6 * S);
  p.ellipse(org.sx, org.sy, orr * 1.30, orr * 0.68, { mat: 'conchPearl', dome: orr * 0.5, tint: 0.0 });
  p.ellipse(org.sx, org.sy, orr * 0.82, orr * 0.40, { mat: 'conch', dome: -orr * 0.5, tint: -0.45 });
  p.ellipse(org.sx, org.sy, orr * 0.46, orr * 0.22, { mat: 'glowTeal', dome: -0.3, tint: -0.1, emissive: 0.3 });
  const poreN = Math.round(6 + m.t * 6);
  for (let i = 0; i < poreN; i++) {
    const th = (i / poreN) * TAU + 0.3;
    const a2 = m.basin.a + Math.cos(th) * m.basin.r * 1.42;
    const b2 = m.basin.b + Math.sin(th) * m.basin.r * 1.30;
    if (a2 * a2 + b2 * b2 > 0.82) continue;
    const s0 = shellSurface(m, a2, b2);
    const pr = Math.max(0.7, (0.8 + rnd(seed * 3 + i * 5) * 0.6) * S);
    const lift = domeH * 0.62 * Math.sqrt(Math.max(0, 1 - a2 * a2 - b2 * b2)) + 0.5 * S;
    p.ellipse(s0.sx, s0.sy, pr * 1.5, pr * 1.1, { mat: 'conch', dome: -pr, tint: -0.3, lift });
    p.ellipse(s0.sx, s0.sy, pr * 0.8, pr * 0.6, { mat: 'glowTeal', dome: 0.3, tint: 0.1, emissive: 0.35, lift });
  }
  // a few barnacles have settled on the flank
  for (let i = 0; i < Math.round(3 + m.t * 6); i++) {
    const sa = -0.85 + rnd(seed * 101 + i * 7) * 1.2;
    const x = Math.round(ox + sa * rx);
    if (x < 0 || x >= p.w || maxY[x] < 0) continue;
    const y = maxY[x] + (0.3 + rnd(seed * 211 + i * 3) * 0.4) * skirtH;
    const r = Math.max(1, (0.9 + rnd(seed * 53 + i) * 1.3) * S);
    p.ellipse(x, y, r, r * 0.84, { mat: 'bone', mask: true, dome: r * 0.9, tint: 0.06 });
    p.ellipse(x, y, r * 0.40, r * 0.32, { mat: 'bone', mask: true, dome: -r * 0.6, tint: -0.34 });
  }

  // -- the aperture, and the animal in it ----------------------------------
  // The mouth of the shell opens at the front and low down, lipped with
  // pearl, dark inside - and in the dark, the front of a hermit crab: its
  // head shield, orange-red and studded pale.
  const ax = ox + rx * 0.66, ay = rimY - skirtH * 0.55;
  const arx = rx * 0.32, ary = (skirtH + ry * 0.45) * 0.62;
  p.ellipse(ax, ay, arx * 1.2, ary * 1.14, { mat: 'conchPearl', dome: arx * 0.55, tint: 0.08 });
  p.ellipse(ax + arx * 0.1, ay + ary * 0.06, arx * 0.94, ary * 0.92, { mat: 'conch', dome: -arx * 0.6, tint: -0.66 });
  p.ellipse(ax + arx * 0.18, ay - ary * 0.30, arx * 0.62, ary * 0.42, { mat: 'hermitRed', dome: arx * 0.5, tint: 0.02 });
  for (let i = 0; i < 9; i++) {
    const gx = ax + arx * (0.18 + (rnd(seed * 9 + i) - 0.5) * 1.0), gy = ay - ary * (0.30 + (rnd(seed * 13 + i) - 0.5) * 0.6);
    p.ellipse(gx, gy, 0.6 * S + 0.3, 0.6 * S + 0.3, { mat: 'crabBelly', onlyMat: 'hermitRed', dome: 0.5, tint: 0.15 });
  }
  m.ap = { x: ax - m.ox, y: ay - m.oy, rx: arx, ry: ary };
  m.faceTop = Math.round(ay);
  m.faceMid = ay;

  p.smoothHeight(1, 0.5);
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#141210' });
  return { cv, ox: m.ox, oy: m.oy, faceTop: Math.round(ay) };
}

// ---------------------------------------------------------------------------
// limbs

function paintSegment(len, r0, r1, opts = {}) {
  const mat = opts.mat || 'chitin';
  const far = !!opts.far;
  const bow = opts.bow ?? 0;
  const S = Math.max(0.4, opts.S ?? 1);
  const pad = Math.ceil(Math.max(r0, r1) + Math.abs(bow) + 5);
  const w = Math.ceil(len) + pad * 2;
  const h = pad * 2 + Math.ceil(Math.abs(bow)) + 2;
  const p = new Painter(w, h);
  const cy = h / 2 - bow * 0.25;
  const x0 = pad, x1 = pad + len;
  const ft = far ? -0.17 : 0;

  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - bow }, { x: x1, y: cy }],
    r0, r1, { mat, dome: r0 * 0.95, steps: 16, tint: ft });
  p.ellipse(x0, cy, r0 * 1.18, r0 * 1.12, { mat, dome: r0 * 1.05, tint: ft + 0.05 });
  p.ellipse(x0, cy, r0 * 0.5, r0 * 0.46, { mat, dome: -r0 * 0.7, tint: ft - 0.24 });

  const rings = Math.max(2, Math.round(len / (5.0 * S)));
  for (let i = 1; i < rings; i++) {
    const t = i / rings;
    const x = lerp(x0, x1, t), y = cy - bow * 4 * t * (1 - t), r = lerp(r0, r1, t);
    p.ellipse(x, y, r * 0.32, r * 1.0, { mat, mask: true, dome: r * 0.3, tint: ft - 0.14 });
  }
  if (opts.spines) {
    const n = Math.max(2, Math.round(len / (5.5 * S)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = lerp(x0, x1, t);
      const y = cy - bow * 4 * t * (1 - t) - lerp(r0, r1, t) * 0.8;
      const sl = (1.2 + rnd(i * 37 + Math.round(len)) * 1.5) * S;
      p.poly([{ x: x - 1.3 * S, y: y + 1.1 * S }, { x: x + 0.4 * S, y: y - sl }, { x: x + 1.4 * S, y: y + 1.1 * S }],
        { mat, dome: 1.1 * S, feather: 1.4, tint: ft + 0.08 });
    }
  }
  // the knuckle at the far end, so every joint reads as a joint
  p.ellipse(x1, cy, r1 * 1.15, r1 * 1.1, { mat, dome: r1 * 1.0, tint: ft + 0.06 });
  // a thousand years of sitting still: barnacles on the upper face
  if (!far && len > 8 * S) {
    const n = 1 + Math.floor(rnd(Math.round(len * 13)) * 2.2);
    for (let i = 0; i < n; i++) {
      const t = 0.25 + rnd(Math.round(len * 7) + i * 31) * 0.5;
      const x = lerp(x0, x1, t), y = cy - bow * 4 * t * (1 - t) - lerp(r0, r1, t) * 0.55;
      const br = Math.max(0.8, (0.9 + rnd(i * 17 + Math.round(len)) * 0.6) * S);
      p.ellipse(x, y, br, br * 0.85, { mat: 'bone', dome: br, tint: 0.08 });
      p.ellipse(x, y, br * 0.4, br * 0.34, { mat: 'bone', dome: -br * 0.5, tint: -0.32 });
    }
  }
  p.grain(mat, { freq: 0.5 / S, amp: 0.08, seed: Math.round(len * 7) });
  p.smoothHeight(1, 0.4);
  const cv = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient,
    outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });
  return { cv, ox: pad, oy: cy, len, r0, r1, mat, far, bow, barn: !far && len > 8 * S };
}

function paintFoot(len, r0, opts = {}) {
  const far = !!opts.far, S = Math.max(0.4, opts.S ?? 1);
  const mat = far ? 'hermitDark' : 'hermitRed';
  const ft = far ? -0.17 : 0;
  const pad = Math.ceil(r0 + 4);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) * 0.5, y: cy - r0 * 0.55 }, { x: x1, y: cy + r0 * 0.25 }],
    r0, Math.max(0.5, 0.7 * S), { mat, dome: r0 * 0.92, steps: 14, tint: ft });
  p.ellipse(x0, cy, r0 * 1.14, r0 * 1.08, { mat, dome: r0, tint: ft + 0.04 });
  p.capsule(x1 - len * 0.34, cy - r0 * 0.12, x1, cy + r0 * 0.25, r0 * 0.55, Math.max(0.5, 0.6 * S),
    { mat: 'horn', dome: r0 * 0.5, tint: ft + 0.02 });
  // a rounded, worn tip - a thousand years of walking has taken the point off
  p.ellipse(x1 - 0.5, cy + r0 * 0.2, Math.max(0.9, r0 * 0.62), Math.max(0.8, r0 * 0.55),
    { mat: 'horn', dome: r0 * 0.5, tint: ft + 0.04 });
  p.grain(mat, { freq: 0.6 / S, amp: 0.07, seed: 21 });
  const cv = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });
  return { cv, ox: pad, oy: cy, len, r0, r1: Math.max(0.5, 0.7 * S), mat, far, foot: true };
}

function paintClaw(m, far = false) {
  const S = Math.max(0.4, m.S);
  const K = Math.max(8, m.shellW * m.clawScale);
  const mat = far ? 'crabShellDark' : 'crabShell';
  const ft = far ? -0.17 : 0;
  const L = K * 0.52, Hh = K * 0.33, tip = K * 0.50;
  const pad = 5;
  const p = new Painter(Math.ceil(L + tip) + pad * 2, Math.ceil(Hh * 2) + pad * 2);
  const cy = p.h * 0.5, x0 = pad;

  p.field(x0 - 2, cy - Hh - 1, x0 + L + 2, cy + Hh + 1, (x, y) => {
    const u = (x - x0) / L;
    if (u < -0.04 || u > 1.02) return null;
    const uu = clamp01(u);
    const half = Hh * (0.30 + 0.70 * Math.pow(Math.sin(Math.pow(uu, 0.60) * Math.PI * 0.86 + 0.24), 0.5));
    const mid = cy + Hh * 0.22 * uu;
    const dy = (y - mid) / half;
    if (Math.abs(dy) > 1) return null;
    const dz = Math.sqrt(clamp01(1 - dy * dy));
    return { h: dz * K * 0.20, tint: ft - 0.03 };
  }, { mat });

  p.curve([
    { x: x0 + L * 0.86, y: cy + Hh * 0.42 },
    { x: x0 + L + tip * 0.52, y: cy + Hh * 0.72 },
    { x: x0 + L + tip, y: cy + Hh * 0.16 },
  ], K * 0.085, K * 0.024, { mat, dome: K * 0.075, steps: 16, tint: ft });
  for (let i = 0; i < 4; i++) {
    const t = 0.16 + i * 0.21;
    const bx = lerp(x0 + L * 0.86, x0 + L + tip, t);
    const by = lerp(cy + Hh * 0.44, cy + Hh * 0.26, t) - K * 0.030;
    const s = K * 0.042;
    p.poly([{ x: bx - s, y: by + s }, { x: bx, y: by - s * 1.3 }, { x: bx + s, y: by + s }],
      { mat: 'horn', dome: s, feather: 1.2, tint: ft + 0.05 });
  }

  p.ridges(mat, { angle: 0.9, freq: 0.55 / S, amp: 0.08, height: 0.8 * S, seed: 5, warp: 1.1 });
  p.grain(mat, { freq: 0.30 / S, amp: 0.09, seed: 29 });
  p.smoothHeight(1, 0.45);
  const palm = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });

  const dw = Math.ceil(tip + K * 0.2) + pad * 2, dh = Math.ceil(K * 0.34) + pad * 2;
  const q = new Painter(dw, dh);
  const qy = dh * 0.68, qx = pad;
  q.curve([
    { x: qx, y: qy },
    { x: qx + tip * 0.48, y: qy - K * 0.20 },
    { x: qx + tip, y: qy - K * 0.03 },
  ], K * 0.105, K * 0.030, { mat, dome: K * 0.09, steps: 16, tint: ft });
  q.ellipse(qx, qy, K * 0.115, K * 0.105, { mat, dome: K * 0.10, tint: ft + 0.05 });
  for (let i = 0; i < 4; i++) {
    const t = 0.20 + i * 0.21;
    const bx = lerp(qx + K * 0.05, qx + tip, t);
    const by = lerp(qy + K * 0.04, qy - K * 0.01, t) + K * 0.035;
    const s = K * 0.040;
    q.poly([{ x: bx - s, y: by - s }, { x: bx, y: by + s * 1.3 }, { x: bx + s, y: by - s }],
      { mat: 'horn', dome: s, feather: 1.2, tint: ft + 0.05 });
  }
  q.grain(mat, { freq: 0.4 / S, amp: 0.14, seed: 63 });
  q.smoothHeight(1, 0.4);
  const dactyl = q.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });

  return {
    palm: { cv: palm, ox: pad, oy: cy, len: L },
    dactyl: { cv: dactyl, ox: pad, oy: qy },
    hinge: { x: L * 0.84, y: -Hh * 0.10 },
  };
}

/**
 * The eye: a stalk with a big round eye on the end of it - white, a large
 * dark pupil, a catchlight. The crab drawing puts the eyeball on top of this
 * bead, so it can look where it is going and blink.
 */
function paintEye(m) {
  const S = Math.max(0.4, m.S);
  const len = Math.max(4, m.eyeRise * 0.95);
  const r = Math.max(2.6, 4.6 * S);
  const pad = Math.ceil(r + 4);
  const p = new Painter(Math.ceil(len + r) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad;
  // a long, thin stalk, pale coral ringed with white
  p.capsule(x0, cy, x0 + len - r * 0.2, cy, Math.max(0.9, 1.25 * S), Math.max(0.8, 1.0 * S),
    { mat: 'hermitRed', dome: 1.2 * S, tint: 0.16 });
  for (let k = 1; k <= 3; k++) {
    const x = x0 + len * (k / 4);
    p.ellipse(x, cy, 0.5 * S + 0.3, 1.2 * S + 0.3, { mat: 'crabBelly', onlyMat: 'hermitRed', dome: 0.6, tint: 0.2 });
  }
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#1e0a06' });
  return { cv, ox: pad, oy: cy, len, r, globe: len };
}

function paintMouth(m) {
  const S = Math.max(0.4, m.S);
  const w = Math.ceil(14 * S) + 8, h = Math.ceil(11 * S) + 8;
  const p = new Painter(w, h);
  const cx = w * 0.5, cy = h * 0.42;
  // the frame of the mouth, and the third maxillipeds closed over it like a
  // pair of doors - jointed, hairy along the edges, never quite still
  p.ellipse(cx, cy + 1 * S, 5.6 * S, 4.2 * S, { mat: 'crabShellDark', dome: 1.6 * S, tint: -0.22 });
  for (const sgn of [-1, 1]) {
    const x0 = cx + sgn * 2.5 * S;
    p.capsule(x0, cy - 2.6 * S, x0 + sgn * 0.4 * S, cy + 0.6 * S, 2.3 * S, 2.1 * S,
      { mat: 'crabShell', dome: 1.4 * S, tint: sgn > 0 ? 0.06 : -0.04 });
    p.capsule(x0 + sgn * 0.4 * S, cy + 0.8 * S, x0 + sgn * 0.2 * S, cy + 3.6 * S, 2.0 * S, 1.5 * S,
      { mat: 'crabShell', dome: 1.2 * S, tint: sgn > 0 ? 0.0 : -0.1 });
    // the joint between the two plates
    p.capsule(x0 - 2 * S, cy + 0.7 * S, x0 + 2 * S, cy + 0.7 * S, 0.45 * S, 0.45 * S,
      { mat: 'crabShellDark', mask: true, dome: -0.4, tint: -0.3 });
    // bristles along the inner edge
    for (let k = 0; k < 4; k++) {
      p.ellipse(cx + sgn * 0.5 * S, cy - 2 * S + k * 1.6 * S, 0.5 * S + 0.3, 0.5 * S + 0.3,
        { mat: 'crabBelly', dome: 0.4, tint: 0.2 });
    }
  }
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#140806' });
  return { cv, ox: cx, oy: cy };
}

// ---------------------------------------------------------------------------

const cache = new Map();

export function buildCrab(stage = 'adult') {
  if (cache.has(stage)) return cache.get(stage);
  const m = crabMetrics(stage);
  const S = Math.max(0.4, m.S);
  const body = paintBody(m);

  const seg = (len, r0, r1, far, extra) =>
    paintSegment(Math.max(3, len), Math.max(1, r0), Math.max(0.8, r1),
      { mat: far ? 'hermitDark' : 'hermitRed', far, S, ...extra });

  const legArt = {};
  for (const far of [false, true]) {
    legArt[far ? 'far' : 'near'] = {
      coxa: seg(m.legLen[0], 4.4 * S, 4.2 * S, far, { bow: 0 }),
      femur: seg(m.legLen[1], 4.3 * S, 3.4 * S, far, { bow: 0.8 * S }),
      tibia: paintFoot(Math.max(3, m.legLen[2] * 1.1), Math.max(1.2, 3.2 * S), { far, S }),
    };
  }

  // Everything comes out of the aperture. Facing +x: the walking legs, two
  // pairs, step out of its lower lip - one pair reaching forward, the other
  // back under the shell - and the two claws hang in front of it, the near
  // one much the bigger, the way a hermit crab's are.
  const ap = m.ap;
  const hipY = ap.y + ap.ry * 0.62;
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < m.legN; i++) {
      const far = i === 1;
      legs.push({
        x: ap.x - ap.rx * (side > 0 ? 0.05 : 0.55) - (far ? ap.rx * 0.25 : 0),
        y: hipY - (far ? ap.ry * 0.25 : 0),
        side, depth: far ? 1 : 0, far,
        spread: side * (far ? 0.75 : 0.35),
        reach: m.reach, order: i,
      });
    }
  }

  const rig = {
    stage, m, S, hermit: true,
    body,
    legArt,
    claw: {
      near: { arm: seg(m.clawLen[0], 3.0 * S, 2.8 * S, false, { bow: 0 }),
        fore: seg(m.clawLen[1], 2.9 * S, 3.4 * S, false, { bow: 0.6 * S }) },
      far: { arm: seg(m.clawLen[0], 2.4 * S, 2.2 * S, true, { bow: 0 }),
        fore: seg(m.clawLen[1], 2.3 * S, 2.7 * S, true, { bow: 0.6 * S }) },
    },
    eye: paintEye(m),
    mouth: null,
    sockets: {
      legs,
      claws: [
        { x: ap.x + ap.rx * 0.05, y: ap.y + ap.ry * 0.25, side: 1, near: false, k: 0.66 },
        { x: ap.x + ap.rx * 0.50, y: ap.y + ap.ry * 0.40, side: 1, near: true, k: 1 },
      ],
      eyes: [
        { x: ap.x + ap.rx * 0.10, y: ap.y - ap.ry * 0.55, side: -1 },
        { x: ap.x + ap.rx * 0.48, y: ap.y - ap.ry * 0.50, side: 1 },
      ],
      mouth: { x: ap.x + ap.rx * 0.3, y: ap.y },
      organ: shellSurface(m, m.organ.a, m.organ.b),
    },
    shellSurface: (a, b) => shellSurface(m, a, b),
    shellPoint: (u) => shellPoint(m, u),
    hipY,
  };
  cache.set(stage, rig);
  return rig;
}

export function clearCrabCache() { cache.clear(); }
