// CRABDEN - the Oasis Crab.
//
// A thousand-year-old crab whose shell has become a hill: bedded rock, eroded
// terraces, a spring welling out of the back, and whatever the player chooses
// to plant on it. Shell, body, limbs and eyes bake separately so the legs can
// be solved with IK at runtime and the garden composited on top from live
// game state.
//
// Everything is painted pointing RIGHT. Facing left is a flip of the whole rig.

import { Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp } from '../lib/math.js';

const LIGHT = { lightX: -0.6, lightY: -0.62, lightZ: 0.4, ambient: 0.36, dither: 0.7 };

export const CRAB_STAGES = ['hatchling', 'juvenile', 'adult', 'ancient'];
const STAGE_T = { hatchling: 0, juvenile: 0.36, adult: 0.74, ancient: 1 };

const rnd = (n) => {
  let h = Math.imul(n | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

/** Every number that describes one crab, in sprite pixels. */
export function crabMetrics(stage = 'adult') {
  const t = STAGE_T[stage] ?? 0.74;
  const shellW = Math.round(lerp(36, 84, t));
  const shellH = Math.round(shellW * lerp(0.60, 0.49, t));
  const bodyW = Math.round(shellW * 0.88);
  const bodyH = Math.round(shellH * lerp(0.62, 0.52, t));
  const S = shellW / 92;

  const eyeRise = Math.round(lerp(7, 13, t));
  const pad = Math.round(6 + 6 * t);
  const w = shellW + pad * 2;
  const h = shellH + bodyH + eyeRise + pad * 2;

  const ox = Math.round(w * 0.5);
  const sbase = pad + eyeRise + shellH;
  const oy = Math.round(sbase + bodyH * 0.62);

  const legLen = [shellW * 0.170, shellW * 0.185, shellW * 0.115];
  return {
    stage, t, S, w, h, ox, oy,
    shellW, shellH, bodyW, bodyH, eyeRise, pad, sbase,
    sx0: ox - shellW / 2,
    sx1: ox + shellW / 2,
    speak: lerp(0.46, 0.41, t),
    legN: t < 0.2 ? 3 : 4,
    legLen,
    reach: (legLen[0] + legLen[1] + legLen[2] * 1.1) * 0.88,
    clawLen: [shellW * 0.170, shellW * 0.135],
    clawScale: lerp(0.30, 0.40, t),
    organU: 0.285,
    basin: [0.13, 0.36],
    spillU: 0.045,
  };
}

// ---------------------------------------------------------------------------
// shell profile - the single source of truth for both the art and the garden

function shellTopOffset(m, u) {
  if (u <= 0 || u >= 1) return 0;
  const k = u < m.speak ? (u / m.speak) * 0.5 : 0.5 + ((u - m.speak) / (1 - m.speak)) * 0.5;
  let v = Math.pow(Math.sin(k * Math.PI), lerp(0.62, 0.46, m.t));
  v += Math.exp(-Math.pow((u - 0.75) / 0.15, 2)) * 0.075;   // eroded hip behind the face
  v -= Math.exp(-Math.pow((u - 0.06) / 0.10, 2)) * 0.07;    // broken-off tail corner
  v -= Math.exp(-Math.pow((u - 0.235) / 0.085, 2)) * 0.26;  // the basin the spring fills
  v += Math.exp(-Math.pow((u - 0.095) / 0.055, 2)) * 0.26;  // and the stone rim that holds it
  v += Math.sin(u * 11.3 + 1.7) * 0.016 + Math.sin(u * 23.1) * 0.008;  // rough silhouette
  return clamp01(v) * m.shellH;
}

function shellBotOffset(m, u) {
  return m.shellH * 0.06 * Math.pow(Math.sin(clamp01(u) * Math.PI), 0.45);
}

/** Point + outward normal on the shell's upper surface, anchor-relative. */
export function shellPoint(m, u) {
  u = clamp01(u);
  const x = lerp(m.sx0, m.sx1, u);
  const y = m.sbase - shellTopOffset(m, u);
  const e = 0.02;
  const ax = lerp(m.sx0, m.sx1, clamp01(u - e)), ay = m.sbase - shellTopOffset(m, clamp01(u - e));
  const bx = lerp(m.sx0, m.sx1, clamp01(u + e)), by = m.sbase - shellTopOffset(m, clamp01(u + e));
  let nx = by - ay, ny = -(bx - ax);
  const l = Math.hypot(nx, ny) || 1;
  return { u, x: x - m.ox, y: y - m.oy, nx: nx / l, ny: ny / l, sx: x, sy: y };
}

// ---------------------------------------------------------------------------

function paintBody(m, seed = 3) {
  const p = new Painter(m.w, m.h);
  const S = m.S;

  // -- under-body: the chitin slab the shell rides on ----------------------
  const bx0 = m.ox - m.bodyW * 0.52, bx1 = m.ox + m.bodyW * 0.50;
  const btop = m.sbase - m.shellH * 0.06;
  const bw = bx1 - bx0;
  p.field(bx0 - 3, btop - 2, bx1 + 4, btop + m.bodyH + 4, (x, y) => {
    const u = (x - bx0) / bw;
    if (u < 0 || u > 1) return null;
    const taper = Math.pow(Math.sin(Math.pow(u, 0.78) * Math.PI * 0.97 + 0.09), 0.40);
    const half = m.bodyH * 0.5 * (0.55 + 0.45 * taper);
    const mid = btop + m.bodyH * 0.5 + Math.pow(u, 2.4) * m.bodyH * 0.24;
    const dy = (y - mid) / half;
    if (Math.abs(dy) > 1) return null;
    const dz = Math.sqrt(clamp01(1 - dy * dy));
    const su = Math.sqrt(clamp01(1 - Math.pow((u - 0.5) * 2, 4)));
    return { h: dz * m.bodyH * 0.46 * (0.35 + 0.65 * su), tint: -0.06 };
  }, { mat: 'chitin' });

  p.ridges('chitin', { angle: 0.30, freq: 0.70 / S, amp: 0.15, height: 1.0 * S, seed: seed + 4, warp: 0.6 });
  // the shell overhangs, so the top of the body sits in its shadow
  {
    const m0 = p._matIndex.get('chitin');
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        if (p.mat[i] !== m0) continue;
        const d = (y - btop) / Math.max(1, m.bodyH);
        if (d < 0.52) p.tint[i] -= (1 - d / 0.52) * 0.30;
      }
    }
  }
  p.grain('chitin', { freq: 0.36 / S, amp: 0.16, seed: seed + 9 });
  // overlapping abdominal plates, each with a lit leading edge
  for (let i = 0; i < 4; i++) {
    const px = lerp(bx0 + bw * 0.16, bx1 - bw * 0.20, i / 3);
    p.capsule(px, btop + m.bodyH * 0.30, px - m.bodyH * 0.22, btop + m.bodyH * 0.98,
      1.5 * S, 1.1 * S, { mat: 'chitin', mask: true, tint: -0.24, dome: 0 });
    p.capsule(px + 1.6 * S, btop + m.bodyH * 0.30, px - m.bodyH * 0.22 + 1.6 * S, btop + m.bodyH * 0.98,
      1.0 * S, 0.8 * S, { mat: 'chitinPale', mask: true, tint: 0.10, dome: 0 });
  }

  // the head: a brow of plate over two sockets, then the mouth field
  const fx = bx1 - bw * 0.09, fy = btop + m.bodyH * 0.46;
  p.ellipse(fx - bw * 0.02, fy - m.bodyH * 0.20, bw * 0.13, m.bodyH * 0.26,
    { mat: 'chitinPale', dome: 3.0 * S, tint: 0.06 });                 // brow
  p.ellipse(fx - bw * 0.015, fy - m.bodyH * 0.10, bw * 0.055, m.bodyH * 0.13,
    { mat: 'chitinDark', dome: -2.2 * S, tint: -0.28 });                // socket
  p.ellipse(fx - bw * 0.075, fy - m.bodyH * 0.12, bw * 0.045, m.bodyH * 0.11,
    { mat: 'chitinDark', dome: -2.0 * S, tint: -0.34 });                // far socket
  for (let i = 0; i < 3; i++) {
    p.capsule(fx - 5 * S - i * 2.0 * S, fy + m.bodyH * 0.26 - i * 2.6 * S,
      fx + 2.6 * S, fy + m.bodyH * 0.22 - i * 2.4 * S,
      1.7 * S, 1.1 * S, { mat: 'chitinDark', dome: 1.6 * S, tint: -0.04 - i * 0.06 });
  }
  p.ellipse(fx - 1 * S, fy + m.bodyH * 0.34, 3.0 * S, 2.1 * S, { mat: 'flesh', dome: 1.3 * S, tint: -0.2 });

  // -- the shell -----------------------------------------------------------
  const gully = [];
  for (let i = 0; i < 4; i++) gully.push(0.16 + i * 0.21 + (rnd(seed * 31 + i * 7) - 0.5) * 0.07);
  const ledges = [0.30, 0.55, 0.79];

  p.field(m.sx0 - 3, m.sbase - m.shellH - 5, m.sx1 + 3, m.sbase + m.shellH * 0.16, (x, y) => {
    const u = (x - m.sx0) / m.shellW;
    if (u < 0 || u > 1) return null;
    const top = m.sbase - shellTopOffset(m, u);
    const bot = m.sbase + shellBotOffset(m, u);
    if (y < top || y > bot) return null;
    const th = Math.max(1, bot - top);
    const tz = (y - top) / th;                       // 0 crest, 1 rim
    const q = (y - top) / m.shellH;                  // depth below the crest

    const vert = Math.sqrt(clamp01(1 - Math.pow(tz * 2 - 1, 2)));
    const horiz = Math.sqrt(clamp01(1 - Math.pow((u - 0.5) * 2, 2)));
    let h = m.shellH * 0.44 * (0.26 + 0.74 * horiz) * (0.30 + 0.70 * vert);
    let tint = -0.06;

    // horizontal bedding, the way the mesas it slept among are bedded
    const g = (y - (m.sbase - m.shellH)) / m.shellH;          // 0 at the crest line
    const gw = g + Math.sin(u * 5.3) * 0.014 + Math.sin(u * 11.7 + 2.0) * 0.007;
    const bs = Math.sin(gw / 0.155 * Math.PI * 2 + Math.sin(gw * 9.0) * 0.5);
    h += bs * 0.5 * S;
    tint += bs * 0.032;

    // eroded shelves: a lit ledge with a shadowed overhang beneath it
    for (const L of ledges) {
      const lg = L + Math.sin(u * 4.4 + L * 17) * 0.022;
      const d = g - lg;
      if (d > -0.045 && d < 0.065) {
        if (d < 0) { tint += (1 + d / 0.045) * 0.15; h += (1 + d / 0.045) * 2.8 * S; }
        else { const k = 1 - d / 0.065; tint -= k * k * 0.22; h -= k * 2.4 * S; }
      }
    }

    // hard cap along the crest
    if (tz < 0.13) { const k = 1 - tz / 0.13; tint += k * 0.34; h += k * 3.6 * S; }
    // the rim rolls under into deep shadow
    if (tz > 0.78) { const k = (tz - 0.78) / 0.22; tint -= k * k * 0.50; h -= k * 3.4 * S; }
    // vertical erosion gullies down the flank
    for (const c of gully) {
      const d = Math.abs(u - c) * m.shellW;
      const wdt = 2.6 * S;
      if (d < wdt) {
        const k = (1 - d / wdt) * clamp01((tz - 0.14) * 2.4);
        tint -= k * 0.26; h -= k * 2.8 * S;
      }
    }
    // two deep fractures cut across the bedding
    for (let f = 0; f < 2; f++) {
      const fg = 0.30 + f * 0.34 + Math.sin(u * 3.3 + f * 2.1) * 0.05;
      const d = Math.abs(g - fg);
      if (d < 0.018) { const k = 1 - d / 0.018; tint -= k * 0.24; h -= k * 2.4 * S; }
    }
    return { h, tint };
  }, { mat: 'shellRock' });

  // big weathered blotches, then fine tooth
  p.grain('shellRock', { freq: 0.055 / S, amp: 0.30, seed: seed + 77, oct: 2 });
  p.grain('shellRock', { freq: 0.28 / S, amp: 0.18, seed, oct: 3, height: 0.55 * S });
  p.grain('shellRock', { freq: 0.95 / S, amp: 0.09, seed: seed + 51, oct: 2 });
  p.speckle('shellRock', { density: 0.045, amp: 0.32, seed: seed + 13, size: 1 });

  // -- desert varnish: iron staining bleeding down the flank ---------------
  {
    const mid = p._matIndex.get('shellRock');
    const streaks = [];
    for (let i = 0; i < 11; i++) {
      streaks.push({
        u: 0.06 + rnd(seed * 401 + i * 11) * 0.88,
        y0: m.shellH * (0.20 + rnd(seed * 91 + i) * 0.34),
        len: m.shellH * (0.24 + rnd(seed * 133 + i) * 0.46),
        w: (1.4 + rnd(seed * 55 + i) * 2.4) * S,
        a: 0.10 + rnd(seed * 17 + i) * 0.13,
      });
    }
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = y * p.w + x;
        if (p.mat[i] !== mid) continue;
        const u = (x - m.sx0) / m.shellW;
        const g = y - (m.sbase - m.shellH);
        for (const st of streaks) {
          const dx = Math.abs(u - st.u) * m.shellW;
          if (dx > st.w) continue;
          const dy = g - st.y0;
          if (dy < 0 || dy > st.len) continue;
          const k = (1 - dx / st.w) * Math.min(1, dy / (st.len * 0.3)) * (1 - dy / st.len);
          p.tint[i] -= k * st.a;
        }
      }
    }
  }

  // -- crest spikes --------------------------------------------------------
  const spikeN = Math.round(lerp(3, 6, m.t));
  for (let i = 0; i < spikeN; i++) {
    const u = 0.09 + (i / Math.max(1, spikeN - 1)) * 0.46;
    const pt = shellPoint(m, u);
    const hgt = (3.0 + rnd(seed * 7 + i * 13) * 4.0) * S;
    const wid = (2.4 + rnd(seed * 17 + i) * 1.6) * S;
    p.poly([
      { x: pt.sx - wid, y: pt.sy + 2.0 * S },
      { x: pt.sx + pt.nx * hgt - 1.2 * S, y: pt.sy + pt.ny * hgt },
      { x: pt.sx + wid, y: pt.sy + 2.0 * S },
    ], { mat: 'shellRock', dome: wid * 1.1, feather: 2.2, tint: 0.10 });
  }

  // -- the water organ: a chitin crater on the back of the shell -----------
  const org = shellPoint(m, m.organU);
  const orr = 5.6 * S;
  p.ellipse(org.sx, org.sy - orr * 0.24, orr * 1.32, orr * 0.78, { mat: 'chitinDark', dome: orr * 0.62, tint: 0.02 });
  p.ellipse(org.sx, org.sy - orr * 0.34, orr * 0.88, orr * 0.46, { mat: 'chitinDark', dome: -orr * 0.55, tint: -0.30 });
  p.ellipse(org.sx, org.sy - orr * 0.36, orr * 0.60, orr * 0.30, { mat: 'flesh', dome: -0.4, tint: -0.36 });
  p.ridges('chitinDark', { angle: 1.35, freq: 1.5 / S, amp: 0.17, height: 0.9 * S, seed: seed + 3, warp: 0.4 });

  // -- fossil barnacles on the flank ---------------------------------------
  for (let i = 0; i < Math.round(5 + m.t * 8); i++) {
    const u = 0.10 + rnd(seed * 101 + i * 7) * 0.80;
    const tz = 0.24 + rnd(seed * 211 + i * 3) * 0.58;
    const top = m.sbase - shellTopOffset(m, u);
    const x = m.sx0 + u * m.shellW;
    const y = top + tz * (m.sbase + shellBotOffset(m, u) - top);
    const r = (1.4 + rnd(seed * 53 + i) * 2.2) * S;
    p.ellipse(x, y, r, r * 0.84, { mat: 'bone', mask: true, dome: r * 0.9, tint: 0.06 });
    p.ellipse(x, y, r * 0.40, r * 0.32, { mat: 'bone', mask: true, dome: -r * 0.6, tint: -0.34 });
  }

  p.smoothHeight(1, 0.5);
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
  return { cv, ox: m.ox, oy: m.oy };
}

// ---------------------------------------------------------------------------
// limbs

function paintSegment(len, r0, r1, opts = {}) {
  const mat = opts.mat || 'chitin';
  const far = !!opts.far;
  const bow = opts.bow ?? 0;
  const S = opts.S ?? 1;
  const pad = Math.ceil(Math.max(r0, r1) + Math.abs(bow) + 5);
  const w = Math.ceil(len) + pad * 2;
  const h = pad * 2 + Math.ceil(Math.abs(bow)) + 2;
  const p = new Painter(w, h);
  const cy = h / 2 - bow * 0.25;
  const x0 = pad, x1 = pad + len;
  const ft = far ? -0.16 : 0;

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
      const sl = (1.4 + rnd(i * 37 + Math.round(len)) * 1.7) * S;
      p.poly([{ x: x - 1.4 * S, y: y + 1.2 * S }, { x: x + 0.5 * S, y: y - sl }, { x: x + 1.5 * S, y: y + 1.2 * S }],
        { mat, dome: 1.2 * S, feather: 1.5, tint: ft + 0.08 });
    }
  }
  if (opts.bristle) {
    const n = Math.max(2, Math.round(len / (4.2 * S)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.4) / n;
      const x = lerp(x0, x1, t), y = cy + lerp(r0, r1, t) * 0.8;
      p.capsule(x, y, x - 1.3 * S, y + (1.3 + rnd(i * 11) * 1.4) * S, 0.7 * S, 0.4 * S,
        { mat: 'chitinDark', dome: 0.5, tint: ft - 0.2 });
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
  const far = !!opts.far, S = opts.S ?? 1;
  const mat = far ? 'chitinDark' : 'chitin';
  const ft = far ? -0.16 : 0;
  const pad = Math.ceil(r0 + 4);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) * 0.5, y: cy - r0 * 0.55 }, { x: x1, y: cy + r0 * 0.25 }],
    r0, 0.7 * S, { mat, dome: r0 * 0.92, steps: 14, tint: ft });
  p.ellipse(x0, cy, r0 * 1.14, r0 * 1.08, { mat, dome: r0, tint: ft + 0.04 });
  p.capsule(x1 - len * 0.34, cy - r0 * 0.12, x1, cy + r0 * 0.25, r0 * 0.55, 0.6 * S,
    { mat: 'horn', dome: r0 * 0.5, tint: ft + 0.02 });
  // hair fringe, the way a real crab's dactyl is combed for sand
  for (let i = 0; i < 4; i++) {
    const t = 0.2 + i * 0.2;
    const x = lerp(x0, x1, t), y = cy + lerp(r0, 1 * S, t) * 0.85;
    p.capsule(x, y, x - 1.2 * S, y + 1.6 * S, 0.6 * S, 0.35 * S, { mat: 'chitinDark', dome: 0.4, tint: ft - 0.2 });
  }
  p.grain(mat, { freq: 0.6 / S, amp: 0.12, seed: 21 });
  const cv = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });
  return { cv, ox: pad, oy: cy, len };
}

function paintClaw(m, far = false) {
  const S = m.S * (m.clawScale / 0.62) * 1.0;
  const K = m.shellW * m.clawScale;          // overall claw size in px
  const mat = far ? 'chitinDark' : 'claw';
  const ft = far ? -0.16 : 0;
  const L = K * 0.52, Hh = K * 0.33, tip = K * 0.50;
  const pad = 5;
  const w = Math.ceil(L + tip) + pad * 2, h = Math.ceil(Hh * 2) + pad * 2;
  const p = new Painter(w, h);
  const cy = h * 0.5, x0 = pad;

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

  // fixed lower finger
  p.curve([
    { x: x0 + L * 0.86, y: cy + Hh * 0.42 },
    { x: x0 + L + tip * 0.52, y: cy + Hh * 0.72 },
    { x: x0 + L + tip, y: cy + Hh * 0.16 },
  ], K * 0.085, K * 0.024, { mat, dome: K * 0.09, steps: 16, tint: ft });
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
  p.speckle(mat, { density: 0.04, amp: 0.3, seed: 41, size: 1 });
  p.smoothHeight(1, 0.45);
  const palm = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });

  // movable upper finger
  const dw = Math.ceil(tip + K * 0.2) + pad * 2, dh = Math.ceil(K * 0.34) + pad * 2;
  const q = new Painter(dw, dh);
  const qy = dh * 0.68, qx = pad;
  q.curve([
    { x: qx, y: qy },
    { x: qx + tip * 0.48, y: qy - K * 0.20 },
    { x: qx + tip, y: qy - K * 0.03 },
  ], K * 0.105, K * 0.030, { mat, dome: K * 0.095, steps: 16, tint: ft });
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

function paintEye(m, far = false) {
  const S = m.S;
  const len = 13 * S, r = 5.0 * S;
  const pad = Math.ceil(r + 5);
  const p = new Painter(Math.ceil(len + r) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad;
  const ft = far ? -0.18 : 0;
  p.capsule(x0, cy, x0 + len - r * 0.3, cy, 2.2 * S, 2.9 * S,
    { mat: far ? 'chitinDark' : 'chitin', dome: 2.2 * S, tint: ft });
  // a pale globe; the dark pupil is painted live so the crab can look at things
  p.ellipse(x0 + len, cy, r, r * 1.05, { mat: 'eyeball', dome: r * 1.2, tint: ft + 0.05 });
  p.ellipse(x0 + len - r * 0.34, cy - r * 0.42, r * 0.30, r * 0.26,
    { mat: 'eyeball', mask: true, dome: r, tint: 0.55 });
  const cv = p.resolve(MATERIALS, {
    ...LIGHT, ambient: far ? 0.27 : LIGHT.ambient, outline: 1, outlineColor: far ? '#100a06' : '#171009',
  });
  return { cv, ox: pad, oy: cy, len, r, globe: len };
}

/** The maxillipeds: the plates over the mouth that flutter constantly. */
function paintMouth(m) {
  const S = m.S;
  const w = Math.ceil(9 * S) + 8, h = Math.ceil(7 * S) + 8;
  const p = new Painter(w, h);
  const cx = w * 0.35, cy = h / 2;
  p.ellipse(cx, cy, 3.4 * S, 2.4 * S, { mat: 'chitinDark', dome: 2.0 * S, tint: -0.02 });
  p.capsule(cx - 1.6 * S, cy - 0.6 * S, cx + 3.4 * S, cy - 0.2 * S, 1.2 * S, 0.8 * S,
    { mat: 'chitinPale', dome: 1.1 * S, tint: 0.08 });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
  return { cv, ox: cx, oy: cy };
}

/** Feathery antenna, drawn as a separate wisp so it can trail in the wind. */
function paintAntenna(m) {
  const S = m.S;
  const len = 15 * S;
  const pad = 4;
  const p = new Painter(Math.ceil(len) + pad * 2, Math.ceil(6 * S) + pad * 2);
  const cy = p.h * 0.72, x0 = pad;
  p.curve([{ x: x0, y: cy }, { x: x0 + len * 0.5, y: cy - 4 * S }, { x: x0 + len, y: cy - 5 * S }],
    1.5 * S, 0.5 * S, { mat: 'chitinDark', dome: 1.2 * S, steps: 12 });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
  return { cv, ox: pad, oy: cy, len };
}

// ---------------------------------------------------------------------------

const cache = new Map();

export function buildCrab(stage = 'adult') {
  if (cache.has(stage)) return cache.get(stage);
  const m = crabMetrics(stage);
  const S = m.S;
  const body = paintBody(m);

  const seg = (len, r0, r1, far, extra) =>
    paintSegment(len, r0, r1, { mat: far ? 'chitinDark' : 'chitin', far, S, ...extra });

  const legArt = {};
  for (const far of [false, true]) {
    legArt[far ? 'far' : 'near'] = {
      coxa: seg(m.legLen[0], 3.9 * S, 3.2 * S, far, { bow: -1.1 * S }),
      femur: seg(m.legLen[1], 3.2 * S, 2.3 * S, far, { bow: 2.2 * S, spines: true }),
      tibia: paintFoot(m.legLen[2] * 1.1, 2.2 * S, { far, S }),
    };
  }

  const hipY = m.sbase + m.bodyH * 0.34 - m.oy;
  const legs = [];
  for (let side = 0; side < 2; side++) {
    const far = side === 1;
    for (let i = 0; i < m.legN; i++) {
      const t = m.legN === 1 ? 0.5 : i / (m.legN - 1);
      legs.push({
        x: lerp(-m.bodyW * 0.36, m.bodyW * 0.26, t) + (far ? -2.2 * S : 1.6 * S),
        y: hipY + (far ? -1.4 * S : 0.8 * S),
        far,
        reach: m.reach,
        spread: lerp(-1.10, 0.72, t) + (far ? -0.12 : 0.07),
      });
    }
  }

  const rig = {
    stage, m, S,
    body,
    legArt,
    claw: {
      near: { arm: seg(m.clawLen[0], 3.6 * S, 3.2 * S, false, { bow: -1.4 * S }),
        fore: seg(m.clawLen[1], 3.4 * S, 3.7 * S, false, { bow: 1.2 * S, spines: true }),
        ...paintClaw(m, false) },
      far: { arm: seg(m.clawLen[0], 3.6 * S, 3.2 * S, true, { bow: -1.4 * S }),
        fore: seg(m.clawLen[1], 3.4 * S, 3.7 * S, true, { bow: 1.2 * S }),
        ...paintClaw(m, true) },
    },
    eye: { near: paintEye(m, false), far: paintEye(m, true) },
    mouth: paintMouth(m),
    antenna: paintAntenna(m),
    sockets: {
      legs,
      claw: { x: m.bodyW * 0.40, y: hipY - m.bodyH * 0.18 },
      eyes: [
        { x: m.bodyW * 0.34, y: m.sbase - m.oy - m.bodyH * 0.06, far: true },
        { x: m.bodyW * 0.42, y: m.sbase - m.oy + m.bodyH * 0.06, far: false },
      ],
      antenna: { x: m.bodyW * 0.44, y: m.sbase - m.oy + m.bodyH * 0.18 },
      organ: shellPoint(m, m.organU),
      mouth: { x: m.bodyW * 0.42, y: hipY - m.bodyH * 0.02 },
    },
    shellPoint: (u) => shellPoint(m, u),
    hipY,
  };
  cache.set(stage, rig);
  return rig;
}

export function clearCrabCache() { cache.clear(); }
