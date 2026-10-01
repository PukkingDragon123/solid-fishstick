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
  // a hatchling is genuinely tiny - a coin with legs
  const shellW = Math.round(lerp(22, 92, Math.pow(t, 0.86)));
  const S = shellW / 92;
  const rx = shellW * 0.5;
  const ry = rx * lerp(0.54, 0.46, t);           // young shells are rounder
  const domeH = rx * lerp(0.62, 0.62, t);
  const skirtH = rx * lerp(0.20, 0.24, t);       // the rock's own lip, short
  const faceH = rx * lerp(0.50, 0.46, t);        // the crab itself, under the rock
  const eyeRise = rx * lerp(0.20, 0.15, t);

  const pad = Math.round(6 + 8 * t);
  const crownLift = domeH * KZ;
  const w = Math.ceil(shellW + pad * 2);
  const h = Math.ceil(crownLift + ry * 2 + skirtH + faceH + pad * 2);

  const ox = Math.round(w / 2);
  const topCy = Math.round(pad + crownLift + ry);   // centre of the top ellipse
  const rimY = topCy + ry + skirtH;                 // the bottom edge of the shell
  const oy = Math.round(rimY + faceH * 0.52);       // anchor: the hip line

  const legN = t < 0.25 ? 3 : 4;
  // a crab's walking leg: a short coxa, a long flat merus that rises to the
  // knee, and the carpus-propodus-dactyl coming down to a point
  const legLen = [shellW * 0.060, shellW * 0.200, shellW * 0.195];

  return {
    stage, t, S, w, h, ox, oy,
    shellW, rx, ry, domeH, skirtH, faceH, eyeRise, pad, topCy, rimY,
    // kept so old callers still resolve; the surface is the real API
    sbase: rimY, sx0: ox - rx, sx1: ox + rx, shellH: Math.round(ry * 2 + domeH),
    bodyW: Math.round(shellW * 0.80), bodyH: Math.round(faceH),
    legN, legLen,
    reach: (legLen[0] + legLen[1] + legLen[2] * 1.1) * 0.88,
    clawLen: [shellW * 0.120, shellW * 0.100],
    clawScale: lerp(0.34, 0.40, t),
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

  // A shell a thousand years old is not one smooth dome. It is PLATES - scutes
  // grown in rings, each one a little domed, with a groove of grit between
  // them - and it has been cracked, and things have grown on it.
  const plates = [];
  const nPlates = Math.round(7 + m.t * 9);
  for (let i = 0; i < nPlates; i++) {
    const ang = rnd(seed * 31 + i * 17) * TAU;
    const rad = Math.sqrt(rnd(seed * 59 + i * 23)) * 0.97;
    plates.push({ a: Math.cos(ang) * rad, b: Math.sin(ang) * rad, t: (rnd(seed * 7 + i * 3) - 0.5) * 0.10 });
  }
  const cracks = [];
  for (let c = 0; c < Math.round(3 + m.t * 4); c++) {
    let a = -0.8 + rnd(seed * 3 + c * 41) * 1.6, b = -0.8 + rnd(seed * 5 + c * 43) * 1.6;
    let ang = rnd(seed * 11 + c * 7) * TAU;
    const n = 5 + Math.floor(rnd(seed + c * 19) * 5);
    for (let k = 0; k < n; k++) {
      ang += (rnd(seed * 13 + c * 29 + k) - 0.5) * 1.3;
      const l = 0.05 + rnd(seed * 17 + c * 31 + k) * 0.07;
      const a2 = a + Math.cos(ang) * l, b2 = b + Math.sin(ang) * l;
      cracks.push([a, b, a2, b2]);
      a = a2; b = b2;
    }
  }
  const segD = (px, py, s0) => {
    const [ax, ay, bx, by] = s0;
    const vx = bx - ax, vy = by - ay;
    const t2 = clamp01(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1));
    return Math.hypot(px - (ax + vx * t2), py - (ay + vy * t2));
  };
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
      tint += Math.sin(r2 * 9.5 + b2 * 1.2) * 0.03;
      let lift = domeH * 0.62 * q + (inBasin ? -2.4 : 0) + b2 * 1.2;
      let mat = 'shellRock';
      if (!inBasin) {
        // the plates: nearest two seeds, and the groove where they meet
        let d1 = 9, d2 = 9, pl = null;
        for (const P of plates) {
          const d = Math.hypot(a2 - P.a, (b2 - P.b) * 1.15);
          if (d < d1) { d2 = d1; d1 = d; pl = P; } else if (d < d2) d2 = d;
        }
        const edge = d2 - d1;
        if (edge < 0.055) {
          const k = 1 - edge / 0.055;
          tint -= 0.20 * k; lift -= 1.3 * S * k;
        } else if (pl) {
          tint += pl.t;
          lift += Math.max(0, 1 - d1 / 0.42) * 1.1 * S;
          // the lit lip of each plate, on the side toward the light
          if (edge < 0.09 && (a2 - pl.a) + (b2 - pl.b) < 0) tint += 0.06;
        }
        // cracks: thin and dark, and the stone either side a little lifted
        let cd = 9;
        for (const c of cracks) { const d = segD(a2, b2, c); if (d < cd) cd = d; }
        if (cd < 0.016) { tint -= 0.32; lift -= 0.9 * S; } else if (cd < 0.03) tint += 0.04;
        // lichen and moss, out toward the edge where it is always damp
        if (r2 > 0.30) {
          // small crusts, not paint: a few patches high on the shell, broken
          // up at the edges so they read as something growing
          const n = fbmTex(a2 * 5.2 + 7.3, b2 * 5.2 - 2.1, seed + 5, 3);
          const fleck = fbmTex(a2 * 19 + 1.1, b2 * 19 + 3.3, seed + 9, 1);
          if (n > 0.72 && fleck > 0.35) { mat = 'lichen'; tint += (n - 0.72) * 0.6 - 0.12; lift += 0.3 * S; }
          else if (n < 0.40 && fleck > 0.22) { mat = 'moss'; tint += 0.04 + (0.40 - n) * 0.5; lift += 0.7 * S; }
        }
      }
      const px = Math.round(s.sx), py = Math.round(s.sy);
      p.ellipse(s.sx, s.sy, 1.05, 1.05, { mat, dome: 0, addHeight: false, tint, lift });
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

  p.grain('shellRock', { freq: 0.055 / S, amp: 0.16, seed: seed + 77, oct: 2 });
  p.grain('shellRock', { freq: 0.28 / S, amp: 0.09, seed, oct: 3, height: 0.4 * S });
  p.speckle('shellRock', { density: 0.03, amp: 0.22, seed: seed + 13, size: 1 });
  p.grain('lichen', { freq: 0.6 / S, amp: 0.10, seed: seed + 3 });
  p.grain('moss', { freq: 0.7 / S, amp: 0.12, seed: seed + 4 });

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
  // Along the far rim, where the old stone spikes were: CRYSTAL. The spring
  // inside the animal has been leaching salts up through the shell for a
  // thousand years, and they have come out the top as spires - pale teal,
  // lit from inside, faceted like a geode.
  const spikeN = Math.round(lerp(3, 7, m.t));
  for (let i = 0; i < spikeN; i++) {
    const th = Math.PI * (1.16 + (i / Math.max(1, spikeN - 1)) * 0.68);
    const a2 = Math.cos(th) * 0.84, b2 = Math.sin(th) * 0.84;
    const s = shellSurface(m, a2, b2);
    const big = i === Math.floor(spikeN / 2) || i === 1;
    const hgt = (big ? 6.5 : 3.6 + rnd(seed * 7 + i * 13) * 2.6) * S;
    const wid = Math.max(1.2, (big ? 2.4 : 1.6 + rnd(seed * 17 + i) * 0.8) * S);
    const lean = (a2 * 0.8 + (rnd(seed * 23 + i) - 0.5) * 0.6) * S * 2;
    const base = s.sy + 1.2 * S;
    // two facets: the lit one and the shaded one, meeting at the ridge
    p.poly([
      { x: s.sx - wid, y: base }, { x: s.sx + lean, y: base - hgt }, { x: s.sx, y: base + 0.5 },
    ], { mat: 'crystal', dome: wid * 1.2, feather: 1.4, tint: 0.16 });
    p.poly([
      { x: s.sx, y: base + 0.5 }, { x: s.sx + lean, y: base - hgt }, { x: s.sx + wid, y: base },
    ], { mat: 'crystal', dome: wid * 0.9, feather: 1.4, tint: -0.10 });
    // a glint where the light comes through it
    p.ellipse(s.sx + lean * 0.55 - 0.3, base - hgt * 0.62, 0.6, 0.9, { mat: 'glowTeal', dome: 0.4, emissive: 0.25 });
  }

  // -- the water organ, a chitin crater in the floor of the basin ----------
  const org = shellSurface(m, m.organ.a, m.organ.b);
  const orr = Math.max(2.2, 4.6 * S);
  p.ellipse(org.sx, org.sy, orr * 1.30, orr * 0.68, { mat: 'chitinDark', dome: orr * 0.5, tint: 0.02 });
  p.ellipse(org.sx, org.sy, orr * 0.82, orr * 0.40, { mat: 'chitinDark', dome: -orr * 0.5, tint: -0.30 });
  p.ellipse(org.sx, org.sy, orr * 0.50, orr * 0.24, { mat: 'flesh', dome: -0.4, tint: -0.36 });
  // the spring breathes through pores in a ring round the basin: little
  // vents of teal light, which is the one thing about you that is plainly
  // not from this world
  const poreN = Math.round(6 + m.t * 6);
  for (let i = 0; i < poreN; i++) {
    const th = (i / poreN) * TAU + 0.3;
    const a2 = m.basin.a + Math.cos(th) * m.basin.r * 1.42;
    const b2 = m.basin.b + Math.sin(th) * m.basin.r * 1.30;
    if (a2 * a2 + b2 * b2 > 0.82) continue;
    const s = shellSurface(m, a2, b2);
    const pr = Math.max(0.7, (0.8 + rnd(seed * 3 + i * 5) * 0.6) * S);
    const lift = domeH * 0.62 * Math.sqrt(Math.max(0, 1 - a2 * a2 - b2 * b2)) + 0.5 * S;
    p.ellipse(s.sx, s.sy, pr * 1.5, pr * 1.1, { mat: 'chitinDark', dome: -pr, tint: -0.2, lift });
    p.ellipse(s.sx, s.sy, pr * 0.8, pr * 0.6, { mat: 'glowTeal', dome: 0.3, tint: 0.1, emissive: 0.35, lift });
  }

  // -- fossil barnacles on the wall ----------------------------------------
  for (let i = 0; i < Math.round(7 + m.t * 12); i++) {
    // they come in clusters: every third one starts a new patch, the rest
    // crowd round the last
    const cl = Math.floor(i / 3);
    const sa = clamp(-0.85 + rnd(seed * 101 + cl * 7) * 1.7 + (rnd(seed * 3 + i) - 0.5) * 0.16, -0.9, 0.9);
    const x = Math.round(ox + sa * rx);
    if (x < 0 || x >= p.w || maxY[x] < 0) continue;
    const y = maxY[x] + (0.2 + rnd(seed * 211 + i * 3) * 0.5) * skirtH;
    const r = Math.max(1, (1.0 + rnd(seed * 53 + i) * 1.8) * S);
    p.ellipse(x, y, r, r * 0.84, { mat: 'bone', mask: true, dome: r * 0.9, tint: 0.06 });
    p.ellipse(x, y, r * 0.40, r * 0.32, { mat: 'bone', mask: true, dome: -r * 0.6, tint: -0.34 });
  }

  // -- moss hanging off the rock ------------------------------------------
  // A rock that has sat on a seabed and then a desert for a thousand years
  // is not clean: moss has crept over the rim and hangs down the face of it
  // in beards, with the odd tuft standing proud on the lip.
  for (let x = 0; x < p.w; x++) {
    if (maxY[x] < 0) continue;
    const sa = (x - ox) / rx;
    const n = fbmTex(sa * 4.1 + 2.3, 1.7, seed + 21, 3);
    if (n < 0.40) continue;
    const len = (n - 0.40) * 2 * skirtH * 1.4 * (0.6 + 0.4 * fbmTex(x * 0.4, 9.1, seed + 3, 1));
    const y0 = maxY[x] - 1;
    for (let y = y0; y < y0 + len; y++) {
      const k = (y - y0) / Math.max(1, len);
      // beards thin out toward their ends
      if (k > 0.55 && fbmTex(x * 0.9, y * 0.9, seed + 8, 1) > 1.2 - k) continue;
      p.rect(x, y, 1, 1, { mat: 'moss', dome: 0, addHeight: false, tint: 0.12 - k * 0.3, lift: domeH * 0.3 + 1.2 * S });
    }
    if (n > 0.55) p.ellipse(x, y0 - 0.6, 1.0 * S + 0.4, 0.9 * S + 0.3, { mat: 'moss', dome: 1.0 * S, tint: 0.14, lift: domeH * 0.3 });
  }
  p.grain('moss', { freq: 0.8 / S, amp: 0.14, seed: seed + 6 });

  // -- the crab under the rock ---------------------------------------------
  // The rock is what it carries. This is the animal: a broad carapace held
  // up under it, brick red and granular, with a row of teeth down each
  // front edge, a notched brow with the eyes sitting in sockets either side
  // of it, and the whole thing darker where the rock shades it.
  let frontY = 0;
  for (let x = Math.round(ox - rx * 0.4); x <= Math.round(ox + rx * 0.4); x++) {
    if (x >= 0 && x < p.w) frontY = Math.max(frontY, wallBase[x]);
  }
  const carH = m.faceH;
  const cw = rx * 0.88;
  const cTop = frontY - carH * 0.30;            // tucked up under the rock
  const cBot = cTop + carH;
  m.carTop = cTop; m.carBot = cBot; m.carW = cw;
  const granules = [];
  for (let i = 0; i < Math.round(30 + m.t * 40); i++) {
    granules.push({ a: rnd(seed * 71 + i * 13) * 2 - 1, v: rnd(seed * 37 + i * 7), r: (0.5 + rnd(i * 5 + seed) * 0.6) * S });
  }
  p.field(ox - cw - 3, cTop - 2, ox + cw + 3, cBot + carH * 0.2, (x, y) => {
    const sa = (x - ox) / cw;
    const aa = Math.abs(sa);
    if (aa > 1.04) return null;
    // the outline: an arched top, sides that bulge out, and a front margin
    // that sweeps up to the corners with teeth along it
    const top = cTop + sa * sa * carH * 0.10;
    let bot = cBot - Math.pow(aa, 1.6) * carH * 0.42;
    if (aa > 0.38) bot += Math.max(0, Math.sin((aa - 0.38) * 26)) * carH * 0.10 * (1.1 - aa);
    // the brow: two small lobes and a notch between them
    if (aa < 0.12) bot -= (0.12 - aa) * carH * 0.9;
    if (y < top || y > bot) return null;
    const v = (y - top) / Math.max(1, bot - top);
    const side = Math.sqrt(clamp01(1 - aa * aa));
    let h = side * carH * 0.42 * (1 - v * 0.55);
    let tint = 0.02 + side * 0.10 - v * 0.08;
    let mat = 'crabShell';
    // in the shadow of the rock
    if (v < 0.18) tint -= (0.18 - v) * 1.6;
    // the regions of a crab's back, as soft grooves
    const gr = Math.abs(aa - 0.42);
    if (gr < 0.03 && v < 0.7) { tint -= 0.16; h -= 0.8 * S; }
    // the pale front margin and the teeth along it
    if (v > 0.86) { mat = 'crabBelly'; tint -= 0.08; }
    // granules, which is what makes it a crab and not a pebble
    for (const gq of granules) {
      const d = Math.hypot((sa - gq.a) * cw, (v - gq.v) * carH);
      if (d < gq.r) { tint += 0.18 * (1 - d / gq.r); h += 0.5 * S; }
    }
    return { h, tint, mat };
  }, { mat: 'crabShell' });
  // the eye sockets either side of the brow
  const faceMid = cTop + carH * 0.42;
  for (const sgn of [-1, 1]) {
    p.ellipse(ox + sgn * cw * 0.24, cTop + carH * 0.40, cw * 0.11, carH * 0.15,
      { mat: 'crabShellDark', mask: true, dome: -1.4 * S, tint: -0.32 });
  }
  m.faceTop = frontY;
  m.faceMid = faceMid;
  p.grain('crabShell', { freq: 0.45 / S, amp: 0.10, seed: seed + 9 });
  p.speckle('crabShell', { density: 0.05, amp: 0.22, seed: seed + 15 });

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
  const mat = far ? 'crabShellDark' : 'crabShell';
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
  const len = Math.max(3, m.eyeRise * 0.95);
  const r = Math.max(2.4, 5.0 * S);
  const pad = Math.ceil(r + 4);
  const p = new Painter(Math.ceil(len + r) + pad * 2, pad * 2 + 2);
  const cy = p.h / 2, x0 = pad;
  p.capsule(x0, cy, x0 + len - r * 0.2, cy, Math.max(1.0, 2.0 * S), Math.max(1.0, 1.8 * S),
    { mat: 'crabShell', dome: 1.6 * S, tint: 0.02 });
  // only a nub: the eyeball itself is drawn over it, unrotated, by the crab
  p.ellipse(x0 + len, cy, r * 0.45, r * 0.45, { mat: 'crabShell', dome: r * 0.6, tint: 0.06 });
  const cv = p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: '#171009' });
  return { cv, ox: pad, oy: cy, len, r, globe: len };
}

/** The maxillipeds: the plates over the mouth, which never stop moving. */
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
      { mat: far ? 'crabShellDark' : 'crabShell', far, S, ...extra });

  const legArt = {};
  for (const far of [false, true]) {
    legArt[far ? 'far' : 'near'] = {
      coxa: seg(m.legLen[0], 4.4 * S, 4.2 * S, far, { bow: 0 }),
      femur: seg(m.legLen[1], 4.3 * S, 3.4 * S, far, { bow: 1.0 * S }),
      tibia: paintFoot(Math.max(3, m.legLen[2] * 1.1), Math.max(1, 3.2 * S), { far, S }),
    };
  }

  // sockets, anchor-relative. legs radiate out from under the shell, four to a
  // side; `side` is which way the limb points, not which layer it draws on
  const faceTop = body.faceTop || m.rimY;
  const faceMid = m.faceMid ?? (faceTop - m.skirtH * 0.30);
  const carTop = m.carTop ?? (faceTop - m.faceH * 0.3), carH = m.faceH, cw = m.carW ?? m.rx * 0.88;
  const hipY = carTop + carH * 0.62 - m.oy;
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
        x: side * cw * spread * 0.92,
        y: hipY - carH * (back ? 0.22 : 0.0),
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
        { x: -cw * 0.42, y: carTop + carH * 0.80 - m.oy, side: -1 },
        { x: cw * 0.42, y: carTop + carH * 0.80 - m.oy, side: 1 },
      ],
      eyes: [
        { x: -cw * 0.24, y: carTop + carH * 0.40 - m.oy, side: -1 },
        { x: cw * 0.24, y: carTop + carH * 0.40 - m.oy, side: 1 },
      ],
      mouth: { x: 0, y: carTop + carH * 0.92 - m.oy },
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
