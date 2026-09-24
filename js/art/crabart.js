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

import { Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.52, lightY: -0.70, lightZ: 0.44, ambient: 0.36, dither: 0.7 };

export const CRAB_STAGES = ['hatchling', 'juvenile', 'adult', 'ancient'];
const STAGE_T = { hatchling: 0, juvenile: 0.34, adult: 0.72, ancient: 1 };

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
  // a hatchling is genuinely tiny - a coin with legs
  const shellW = Math.round(lerp(22, 92, Math.pow(t, 0.86)));
  const S = shellW / 92;
  const rx = shellW * 0.5;
  const ry = rx * lerp(0.54, 0.46, t);           // young shells are rounder
  const domeH = rx * lerp(0.58, 0.52, t);
  const skirtH = rx * lerp(0.28, 0.33, t);       // a lip, not a cliff
  const faceH = rx * lerp(0.36, 0.30, t);
  const eyeRise = rx * lerp(0.30, 0.22, t);

  const pad = Math.round(6 + 8 * t);
  const crownLift = domeH * KZ;
  const w = Math.ceil(shellW + pad * 2);
  const h = Math.ceil(crownLift + ry * 2 + skirtH + faceH + pad * 2);

  const ox = Math.round(w / 2);
  const topCy = Math.round(pad + crownLift + ry);   // centre of the top ellipse
  const rimY = topCy + ry + skirtH;                 // the bottom edge of the shell
  const oy = Math.round(rimY + faceH * 0.30);       // anchor: the hip line

  const legN = t < 0.25 ? 3 : 4;
  const legLen = [shellW * 0.120, shellW * 0.245, shellW * 0.190];   // short and sturdy

  return {
    stage, t, S, w, h, ox, oy,
    shellW, rx, ry, domeH, skirtH, faceH, eyeRise, pad, topCy, rimY,
    // kept so old callers still resolve; the surface is the real API
    sbase: rimY, sx0: ox - rx, sx1: ox + rx, shellH: Math.round(ry * 2 + domeH),
    bodyW: Math.round(shellW * 0.80), bodyH: Math.round(faceH),
    legN, legLen,
    reach: (legLen[0] + legLen[1] + legLen[2] * 1.1) * 0.88,
    clawLen: [shellW * 0.120, shellW * 0.100],
    clawScale: lerp(0.26, 0.32, t),
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

  // -- the carapace, stamped as a height field over the ground plane --------
  // Points are placed back to front so the near surface covers  the far one, and the
  // lowest pixel in each column is remembered: the wall hangs off exactly that,
  // which is what makes the silhouette read as one solid shell.
  const maxY = new Int32Array(p.w).fill(-1);
  const step = 1 / Math.max(14, Math.round(rx * 2.0));
  for (let b2 = -1; b2 <= 1.0001; b2 += step) {
    for (let a2 = -1; a2 <= 1.0001; a2 += step) {
      const r2 = a2 * a2 + b2 * b2;
      if (r2 > 1) continue;
      const s = shellSurface(m, a2, b2);
      const q = Math.sqrt(Math.max(0, 1 - r2));
      const inBasin = basinCut(m, a2, b2) > 0.4;
      // lit from above and to the left, so the crown is bright and the far
      // lip falls away
      let tint = 0.04 + q * 0.20 - Math.abs(a2 + 0.25) * 0.13 + b2 * 0.05;
      if (inBasin) tint -= 0.26;
      // bedding, read as rings because you are looking down on layered rock
      tint += Math.sin(r2 * 9.5 + b2 * 1.2) * 0.045;
      const px = Math.round(s.sx), py = Math.round(s.sy);
      p.ellipse(s.sx, s.sy, 1.05, 1.05, {
        mat: 'shellRock', dome: 0, addHeight: false, tint,
        lift: domeH * 0.62 * q + (inBasin ? -2.4 : 0) + b2 * 1.2,
      });
      for (let dx = -1; dx <= 1; dx++) {
        const cx2 = px + dx;
        if (cx2 >= 0 && cx2 < p.w && py > maxY[cx2]) maxY[cx2] = py;
      }
    }
  }

  // -- the wall of the carapace, hung off the silhouette --------------------
  const wallBase = new Int32Array(p.w).fill(-1);
  for (let x = 0; x < p.w; x++) {
    if (maxY[x] < 0) continue;
    const sa = (x - ox) / rx;
    const q = Math.sqrt(Math.max(0, 1 - Math.min(1, sa * sa)));
    const wh = skirtH * (0.18 + 0.82 * Math.pow(q, 1.15));
    const y0 = maxY[x] + 1, y1 = maxY[x] + wh;
    wallBase[x] = Math.round(y1);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / Math.max(1, y1 - y0);
      let h = domeH * 0.42 * q * (1 - t * 0.42);
      let tint = -0.06 - Math.pow(Math.abs(sa), 2.0) * 0.22;
      const g = (y - topCy) / (ry * 2 + skirtH);
      const bs = Math.sin(g / 0.115 * Math.PI * 2 + Math.sin(g * 8) * 0.5);
      h += bs * 0.5 * S; tint += bs * 0.038;
      for (const L of [0.34, 0.66]) {
        const d = t - (L + Math.sin(sa * 3.6 + L * 15) * 0.03);
        if (d > -0.07 && d < 0.09) {
          if (d < 0) { tint += (1 + d / 0.07) * 0.14; h += (1 + d / 0.07) * 2.4 * S; }
          else { const k = 1 - d / 0.09; tint -= k * k * 0.22; h -= k * 2.0 * S; }
        }
      }
      if (t > 0.78) { const k = (t - 0.78) / 0.22; tint -= k * k * 0.48; h -= k * 3 * S; }
      p.rect(x, y, 1, 1, { mat: 'shellRock', dome: 0, addHeight: false, tint, lift: h });
    }
  }

  p.grain('shellRock', { freq: 0.055 / S, amp: 0.26, seed: seed + 77, oct: 2 });
  p.grain('shellRock', { freq: 0.28 / S, amp: 0.16, seed, oct: 3, height: 0.5 * S });
  p.speckle('shellRock', { density: 0.045, amp: 0.30, seed: seed + 13, size: 1 });

  // -- desert varnish streaking down the wall -------------------------------
  {
    const mid = p._matIndex.get('shellRock');
    const streaks = [];
    for (let i = 0; i < 9; i++) {
      streaks.push({
        sa: -0.9 + rnd(seed * 401 + i * 11) * 1.8,
        drop: 0.15 + rnd(seed * 91 + i) * 0.4,
        len: skirtH * (0.4 + rnd(seed * 133 + i) * 0.7),
        w: (1.2 + rnd(seed * 55 + i) * 2.0) * S,
        amp: 0.08 + rnd(seed * 17 + i) * 0.11,
      });
    }
    for (let x = 0; x < p.w; x++) {
      if (maxY[x] < 0) continue;
      const sa = (x - ox) / rx;
      for (const st of streaks) {
        const dx = Math.abs(sa - st.sa) * rx;
        if (dx > st.w) continue;
        const y0 = maxY[x] + st.drop * skirtH;
        for (let y = y0; y < y0 + st.len; y++) {
          const i = Math.round(y) * p.w + x;
          if (i < 0 || i >= p.mat.length || p.mat[i] !== mid) continue;
          const dy = y - y0;
          const k = (1 - dx / st.w) * Math.min(1, dy / (st.len * 0.3)) * (1 - dy / st.len);
          p.tint[i] -= k * st.amp;
        }
      }
    }
  }

  // -- the stone rim around the basin, and spikes around the far edge -------
  for (let i = 0; i <= 52; i++) {
    const th = (i / 52) * TAU;
    const a2 = m.basin.a + Math.cos(th) * m.basin.r * 1.16;
    const b2 = m.basin.b + Math.sin(th) * m.basin.r * 1.06;
    if (a2 * a2 + b2 * b2 > 0.94) continue;
    const s = shellSurface(m, a2, b2);
    p.ellipse(s.sx, s.sy, Math.max(1, 1.4 * S), Math.max(1, 1.2 * S), {
      mat: 'shellRock', dome: 1.3 * S, tint: Math.sin(th) < 0 ? 0.18 : -0.06,
      lift: domeH * 0.62 * Math.sqrt(Math.max(0, 1 - a2 * a2 - b2 * b2)) + 2.6 * S,
    });
  }
  const spikeN = Math.round(lerp(3, 8, m.t));
  for (let i = 0; i < spikeN; i++) {
    const th = Math.PI * (1.10 + (i / Math.max(1, spikeN - 1)) * 0.80);
    const a2 = Math.cos(th) * 0.88, b2 = Math.sin(th) * 0.88;
    const s = shellSurface(m, a2, b2);
    const hgt = (2.2 + rnd(seed * 7 + i * 13) * 3.2) * S;
    const wid = Math.max(1, (1.8 + rnd(seed * 17 + i) * 1.3) * S);
    p.poly([
      { x: s.sx - wid, y: s.sy + 1.4 * S },
      { x: s.sx + wid * 0.2, y: s.sy - hgt },
      { x: s.sx + wid, y: s.sy + 1.4 * S },
    ], { mat: 'shellRock', dome: wid, feather: 2, tint: 0.10 });
  }

  // -- the water organ, a chitin crater in the floor of the basin ----------
  const org = shellSurface(m, m.organ.a, m.organ.b);
  const orr = Math.max(2.2, 4.6 * S);
  p.ellipse(org.sx, org.sy, orr * 1.30, orr * 0.68, { mat: 'chitinDark', dome: orr * 0.5, tint: 0.02 });
  p.ellipse(org.sx, org.sy, orr * 0.82, orr * 0.40, { mat: 'chitinDark', dome: -orr * 0.5, tint: -0.30 });
  p.ellipse(org.sx, org.sy, orr * 0.50, orr * 0.24, { mat: 'flesh', dome: -0.4, tint: -0.36 });

  // -- fossil barnacles on the wall ----------------------------------------
  for (let i = 0; i < Math.round(3 + m.t * 7); i++) {
    const sa = -0.8 + rnd(seed * 101 + i * 7) * 1.6;
    const x = Math.round(ox + sa * rx);
    if (x < 0 || x >= p.w || maxY[x] < 0) continue;
    const y = maxY[x] + (0.2 + rnd(seed * 211 + i * 3) * 0.5) * skirtH;
    const r = Math.max(1, (1.0 + rnd(seed * 53 + i) * 1.8) * S);
    p.ellipse(x, y, r, r * 0.84, { mat: 'bone', mask: true, dome: r * 0.9, tint: 0.06 });
    p.ellipse(x, y, r * 0.40, r * 0.32, { mat: 'bone', mask: true, dome: -r * 0.6, tint: -0.34 });
  }

  // -- the face, tucked under the front of the shell -----------------------
  let frontY = 0;
  for (let x = Math.round(ox - rx * 0.4); x <= Math.round(ox + rx * 0.4); x++) {
    if (x >= 0 && x < p.w) frontY = Math.max(frontY, wallBase[x]);
  }
  m.faceTop = frontY;
  const faceW = rx * 0.34;
  const faceMid = frontY - skirtH * 0.30;
  p.field(ox - faceW - 2, faceMid - m.faceH, ox + faceW + 2, frontY + 2, (x, y) => {
    const sa = (x - ox) / faceW;
    if (Math.abs(sa) > 1) return null;
    const half = m.faceH * 0.62 * (0.55 + 0.45 * Math.sqrt(1 - sa * sa));
    const dy = (y - faceMid) / half;
    if (Math.abs(dy) > 1) return null;
    const dz = Math.sqrt(clamp01(1 - dy * dy)) * Math.sqrt(clamp01(1 - sa * sa * 0.8));
    return { h: dz * m.faceH * 0.34, tint: -0.16 + dz * 0.14 };
  }, { mat: 'chitin' });
  // two shallow orbits for the eyes to sit in
  for (const sgn of [-1, 1]) {
    p.ellipse(ox + sgn * faceW * 0.46, faceMid - m.faceH * 0.30, faceW * 0.26, m.faceH * 0.18,
      { mat: 'chitinDark', mask: true, dome: -1.6 * S, tint: -0.30 });
  }
  m.faceMid = faceMid;
  p.grain('chitin', { freq: 0.36 / S, amp: 0.14, seed: seed + 9 });

  p.smoothHeight(1, 0.5);
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
  return { cv, ox: m.ox, oy: m.oy, faceTop: frontY };
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
  p.grain(mat, { freq: 0.5 / S, amp: 0.13, seed: Math.round(len * 7) });
  p.smoothHeight(1, 0.4);
  const cv = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient,
    outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });
  return { cv, ox: pad, oy: cy, len };
}

function paintFoot(len, r0, opts = {}) {
  const far = !!opts.far, S = Math.max(0.4, opts.S ?? 1);
  const mat = far ? 'chitinDark' : 'chitin';
  const ft = far ? -0.17 : 0;
  const pad = Math.ceil(r0 + 4);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) * 0.5, y: cy - r0 * 0.55 }, { x: x1, y: cy + r0 * 0.25 }],
    r0, Math.max(0.5, 0.7 * S), { mat, dome: r0 * 0.92, steps: 14, tint: ft });
  p.ellipse(x0, cy, r0 * 1.14, r0 * 1.08, { mat, dome: r0, tint: ft + 0.04 });
  p.capsule(x1 - len * 0.34, cy - r0 * 0.12, x1, cy + r0 * 0.25, r0 * 0.55, Math.max(0.5, 0.6 * S),
    { mat: 'horn', dome: r0 * 0.5, tint: ft + 0.02 });
  for (let i = 0; i < 4; i++) {
    const t = 0.2 + i * 0.2;
    const x = lerp(x0, x1, t), y = cy + lerp(r0, 1 * S, t) * 0.85;
    p.capsule(x, y, x - 1.1 * S, y + 1.4 * S, 0.55 * S, 0.32 * S,
      { mat: 'chitinDark', dome: 0.4, tint: ft - 0.2 });
  }
  p.grain(mat, { freq: 0.6 / S, amp: 0.12, seed: 21 });
  const cv = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });
  return { cv, ox: pad, oy: cy, len };
}

function paintClaw(m, far = false) {
  const S = Math.max(0.4, m.S);
  const K = Math.max(8, m.shellW * m.clawScale);
  const mat = far ? 'chitinDark' : 'claw';
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

  p.ridges(mat, { angle: 0.9, freq: 0.55 / S, amp: 0.12, height: 1.0 * S, seed: 5, warp: 1.1 });
  p.grain(mat, { freq: 0.30 / S, amp: 0.17, seed: 29 });
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
  const len = Math.max(3, m.eyeRise * 0.95);
  const r = Math.max(2.4, 5.0 * S);
  const pad = Math.ceil(r + 4);
  const p = new Painter(Math.ceil(len + r) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad;
  p.capsule(x0, cy, x0 + len - r * 0.2, cy, Math.max(0.8, 1.5 * S), Math.max(0.9, 1.7 * S),
    { mat: 'chitin', dome: 1.4 * S, tint: 0 });
  // only a nub: the eyeball itself is drawn over it, unrotated, by the crab
  p.ellipse(x0 + len, cy, r * 0.4, r * 0.4, { mat: 'chitin', dome: r * 0.6, tint: 0 });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
  return { cv, ox: pad, oy: cy, len, r, globe: len };
}

/** The maxillipeds: the plates over the mouth, which never stop moving. */
function paintMouth(m) {
  const S = Math.max(0.4, m.S);
  const w = Math.ceil(9 * S) + 8, h = Math.ceil(8 * S) + 8;
  const p = new Painter(w, h);
  const cx = w * 0.5, cy = h * 0.5;
  p.ellipse(cx, cy, 3.2 * S, 2.6 * S, { mat: 'chitinDark', dome: 2.0 * S, tint: -0.04 });
  for (const sgn of [-1, 1]) {
    p.capsule(cx + sgn * 0.6 * S, cy - 1.4 * S, cx + sgn * 2.6 * S, cy + 1.6 * S,
      1.1 * S, 0.7 * S, { mat: 'chitinPale', dome: 1.0 * S, tint: sgn > 0 ? 0.08 : -0.02 });
  }
  p.ellipse(cx, cy + 1.0 * S, 1.5 * S, 1.0 * S, { mat: 'flesh', dome: 0.8 * S, tint: -0.2 });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
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
      { mat: far ? 'chitinDark' : 'chitin', far, S, ...extra });

  const legArt = {};
  for (const far of [false, true]) {
    legArt[far ? 'far' : 'near'] = {
      coxa: seg(m.legLen[0], 3.8 * S, 3.3 * S, far, { bow: -0.8 * S }),
      femur: seg(m.legLen[1], 3.4 * S, 2.6 * S, far, { bow: 1.2 * S }),
      tibia: paintFoot(Math.max(3, m.legLen[2] * 1.1), Math.max(1, 2.5 * S), { far, S }),
    };
  }

  // sockets, anchor-relative. legs radiate out from under the shell, four to a
  // side; `side` is which way the limb points, not which layer it draws on
  const faceTop = body.faceTop || m.rimY;
  const faceMid = m.faceMid ?? (faceTop - m.skirtH * 0.30);
  const hipY = faceTop - m.oy - m.skirtH * 0.18;
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < m.legN; i++) {
      const t = m.legN === 1 ? 0.5 : i / (m.legN - 1);
      // legs emerge from under the shell, the outer ones from nearer the edge
      const spread = lerp(0.40, 0.96, t);
      // the front pair are nearest the camera; the back pair sit further away,
      // which on screen means higher up and behind the shell
      const back = i >= Math.floor(m.legN / 2);
      const depth = back ? 1 : 0;
      legs.push({
        x: side * m.rx * spread * 0.80,
        y: hipY - m.skirtH * (back ? 0.34 : 0.10) - depth * m.rx * 0.05,
        side, depth,
        far: back,
        spread: side * spread,
        reach: m.reach,
        order: i,
      });
    }
  }

  const rig = {
    stage, m, S,
    body,
    legArt,
    claw: {
      near: { arm: seg(m.clawLen[0], 3.4 * S, 3.0 * S, false, { bow: -1.2 * S }),
        fore: seg(m.clawLen[1], 3.2 * S, 3.5 * S, false, { bow: 1.0 * S, spines: true }),
        ...paintClaw(m, false) },
      far: { arm: seg(m.clawLen[0], 3.4 * S, 3.0 * S, true, { bow: -1.2 * S }),
        fore: seg(m.clawLen[1], 3.2 * S, 3.5 * S, true, { bow: 1.0 * S }),
        ...paintClaw(m, true) },
    },
    eye: paintEye(m),
    mouth: paintMouth(m),
    sockets: {
      legs,
      claws: [
        { x: -m.rx * 0.40, y: hipY - m.skirtH * 0.10, side: -1 },
        { x: m.rx * 0.40, y: hipY - m.skirtH * 0.10, side: 1 },
      ],
      eyes: [
        { x: -m.rx * 0.20, y: faceMid - m.oy - m.faceH * 0.26, side: -1 },
        { x: m.rx * 0.20, y: faceMid - m.oy - m.faceH * 0.26, side: 1 },
      ],
      mouth: { x: 0, y: faceMid - m.oy + m.faceH * 0.16 },
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
