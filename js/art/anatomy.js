// CRABDEN - the inside of you.
//
// The gene orb is not a menu. Looking into it takes you through your own shell
// and into the body cavity underneath, which is where the tree actually lives:
// a seed sitting in the middle of you, roots in the gut, branches running out
// to the four organs that do the work.
//
// Everything here is baked once with the same height-field painter the rest of
// the game uses, so the organs are lit, textured and dithered like real pixel
// art rather than drawn as flat vector shapes. They are lit from inside - you
// glow - so the light rig is dimmer and rimmier than the desert one.

import { Painter } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp01, lerp, TAU } from '../lib/math.js';

const LIGHT = {
  lightX: -0.34, lightY: -0.62, lightZ: 0.70,
  ambient: 0.42, dither: 0.72,
};

const rnd = (n) => {
  let h = Math.imul(n | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
};

const bake = (p, opts = {}) => p.resolve(MATERIALS, {
  ...LIGHT, outline: 1, outlineColor: '#0a0f10', ...opts,
});

// ---------------------------------------------------------------------------
// the shell you are standing inside

/**
 * The carapace in cross-section, as an arch over the whole cavity: rock crust
 * outside, the chitin laminate under it, and the pearl layer facing in. This
 * is the ceiling of the world when the world is the inside of you.
 *
 * Baked in body-space units so it zooms with everything else: `S` is the
 * camera scale, and the arch is 940 x 520 body units with its springing line
 * along the bottom edge.
 */
function paintVault(S) {
  const apron = Math.round(760 * S);     // shell continues below the springing line
  const w = Math.max(80, Math.round(1420 * S));
  const h = Math.max(60, Math.round(760 * S)) + apron;
  const p = new Painter(w, h);
  const cx = w / 2;
  const base = h - apron;                // body y = VAULT_Y sits here
  const rx = 508 * S, ry = 566 * S;      // the inner face of the shell

  // Not a ring: everything outside the inner face is shell, so this reads as a
  // ceiling you are standing under rather than a hoop floating in a room.
  p.field(0, 0, w, h, (x, y) => {
    const a2 = (x - cx) / rx, b2 = (Math.min(y, base) - base) / ry;
    // an eroded inner face, because a thousand years of water lived in here
    const th = Math.atan2(-b2, a2);
    const wob = 1 + Math.sin(th * 9) * 0.011 + Math.sin(th * 23 + 1.4) * 0.006;
    const d = Math.hypot(a2, b2) / wob;
    if (d < 1) return null;
    const k = d - 1;
    if (k < 0.028) return { mat: 'nacre', h: 6 + k * 40, tint: 0.02 - k * 3 };
    if (k < 0.105) return { mat: 'chitinDark', h: 5, tint: -0.40 - (k - 0.028) * 1.4 };
    return { mat: 'shellRock', h: 3, tint: -0.68 - Math.min(0.20, (k - 0.105) * 0.6) };
  }, { mat: 'shellRock' });

  p.grain('shellRock', { freq: 0.016 / S, amp: 0.28, seed: 91, oct: 3 });
  p.grain('shellRock', { freq: 0.075 / S, amp: 0.15, seed: 4, oct: 2, height: 1.4 * S });
  p.speckle('shellRock', { density: 0.028, amp: 0.32, seed: 12 });
  p.grain('chitinDark', { freq: 0.06 / S, amp: 0.20, seed: 17 });

  // the laminate is laid down in seasons, so it bands along the curve
  p.field(0, 0, w, h, (x, y) => {
    const a2 = (x - cx) / rx, b2 = (Math.min(y, base) - base) / ry;
    const band = Math.sin(Math.hypot(a2, b2) * 210);
    return { h: band * 0.9 * S, tint: band * 0.11 };
  }, { mat: 'chitinDark', onlyMat: 'chitinDark', addHeight: true });

  // and the nacre is iridescent, fine bands running round the arch
  p.field(0, 0, w, h, (x, y) => {
    const a2 = (x - cx) / rx, b2 = (Math.min(y, base) - base) / ry;
    const d = Math.hypot(a2, b2), th = Math.atan2(-b2, a2);
    const band = Math.sin(th * 26 + d * 120) * 0.5 + Math.sin(th * 53) * 0.28;
    return { h: band * 0.8 * S, tint: band * 0.22 };
  }, { mat: 'nacre', onlyMat: 'nacre', addHeight: true });
  p.speckle('nacre', { density: 0.05, amp: 0.36, seed: 5 });

  p.smoothHeight(1, 0.5);
  return { cv: bake(p, { outline: 0 }), ox: cx, oy: base, S };
}

/**
 * The muscle wall the organs are slung from: a dark bag of fibre with the
 * bundles fanning up out of the floor. Deliberately dim - it is behind
 * everything, and the light in here comes from the animal, not from it.
 */
function paintCavity(S) {
  const w = Math.max(60, Math.round(1060 * S)), h = Math.max(50, Math.round(1010 * S));
  const p = new Painter(w, h);
  const cx = w / 2, cy = h / 2;
  const rx = w * 0.5, ry = h * 0.5;
  // an organic bag, not a coin: the edge wanders and falls away into the dark
  p.field(0, 0, w, h, (x, y) => {
    const a = (x - cx) / rx, b = (y - cy) / ry;
    const th = Math.atan2(b, a);
    const wob = 1 + Math.sin(th * 5 + 0.7) * 0.045 + Math.sin(th * 11) * 0.022;
    const d = Math.hypot(a, b) / wob;
    if (d > 1) return null;
    return { h: 2 + (1 - d) * 4, tint: -0.52 + (1 - d * d) * 0.30 };
  }, { mat: 'organPale' });

  // fibre: short bundles lying along the wall rather than rays from a centre
  for (let i = 0; i < 46; i++) {
    const th = rnd(i * 13) * TAU;
    const rr = 0.34 + rnd(i * 29) * 0.62;
    const len = (0.026 + rnd(i * 51) * 0.050);
    const ax = Math.cos(th), ay = Math.sin(th);
    const tx = -ay, ty = ax;                    // along the wall, not across it
    p.curve([
      { x: cx + (ax * rr - tx * len) * rx, y: cy + (ay * rr - ty * len) * ry },
      { x: cx + (ax * (rr + 0.03) * rx), y: cy + ay * (rr + 0.03) * ry },
      { x: cx + (ax * rr + tx * len) * rx, y: cy + (ay * rr + ty * len) * ry },
    ], 2.2 * S, 1.1 * S, { mat: 'organPale', onlyMat: 'organPale', dome: 1.6 * S, steps: 8, tint: -0.10 });
  }
  p.grain('organPale', { freq: 0.030 / S, amp: 0.30, seed: 43, oct: 4 });
  p.grain('organPale', { freq: 0.14 / S, amp: 0.16, seed: 8, oct: 2, height: 0.8 * S });
  p.speckle('organPale', { density: 0.05, amp: 0.30, seed: 61 });
  p.smoothHeight(2, 0.8);
  return { cv: bake(p, { outline: 0 }), ox: cx, oy: cy, S };
}

// ---------------------------------------------------------------------------
// the organs. Each takes a level 0..1 and comes back bigger and brighter.

/** BODY - the heart. Three chambers and the vessels leaving them. */
function paintHeart(S, lv) {
  const w = Math.ceil(150 * S) + 12, h = Math.ceil(146 * S) + 12;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h * 0.54;
  const R = 39 * S * lerp(0.72, 1.12, lv);

  // the vessels first, so the muscle covers where they enter
  for (let i = 0; i < 7; i++) {
    const th = -Math.PI * (0.18 + (i / 6) * 0.64) + (i % 2 ? 0.12 : -0.12);
    const len = R * (1.5 + rnd(i * 19) * 1.1);
    p.curve([
      { x: cx, y: cy - R * 0.3 },
      { x: cx + Math.cos(th) * len * 0.6, y: cy + Math.sin(th) * len * 0.7 },
      { x: cx + Math.cos(th) * len, y: cy + Math.sin(th) * len },
    ], R * 0.20, R * 0.07, { mat: 'organ', dome: R * 0.16, steps: 12, tint: -0.12 });
  }
  // two lower vessels, returning
  for (const sgn of [-1, 1]) {
    p.curve([
      { x: cx + sgn * R * 0.4, y: cy + R * 0.6 },
      { x: cx + sgn * R * 1.1, y: cy + R * 1.4 },
      { x: cx + sgn * R * 0.8, y: cy + R * 2.1 },
    ], R * 0.17, R * 0.06, { mat: 'organ', dome: R * 0.14, steps: 10, tint: -0.16 });
  }

  // the muscle: two lobes and a lower point, one solid mass
  p.ellipse(cx - R * 0.36, cy - R * 0.24, R * 0.74, R * 0.80, { mat: 'organ', dome: R * 0.78, tint: 0.04 });
  p.ellipse(cx + R * 0.36, cy - R * 0.24, R * 0.74, R * 0.80, { mat: 'organ', dome: R * 0.78, tint: 0.06 });
  p.poly([
    { x: cx - R * 1.02, y: cy - R * 0.14 },
    { x: cx + R * 1.02, y: cy - R * 0.14 },
    { x: cx + R * 0.30, y: cy + R * 1.30 },
    { x: cx, y: cy + R * 1.48 },
    { x: cx - R * 0.30, y: cy + R * 1.30 },
  ], { mat: 'organ', dome: R * 0.72, feather: R * 0.55, tint: 0.02 });

  // the seam between the chambers, and the coronary vessels over the surface
  p.capsule(cx, cy - R * 0.72, cx, cy + R * 1.30, R * 0.10, R * 0.05,
    { mat: 'organ', mask: true, dome: -R * 0.4, tint: -0.30 });
  for (let i = 0; i < 9; i++) {
    const sgn = i % 2 ? 1 : -1;
    const t = (i + 1) / 10;
    p.curve([
      { x: cx + sgn * R * 0.12, y: cy - R * 0.5 + t * R * 1.5 },
      { x: cx + sgn * R * (0.5 + t * 0.3), y: cy - R * 0.3 + t * R * 1.3 },
      { x: cx + sgn * R * (0.9 - t * 0.4), y: cy - R * 0.1 + t * R * 1.2 },
    ], R * 0.07, R * 0.03, { mat: 'organ', mask: true, dome: R * 0.06, steps: 8, tint: -0.22 });
  }

  p.grain('organ', { freq: 0.34 / S, amp: 0.15, seed: 3, oct: 2 });
  p.speckle('organ', { density: 0.045, amp: 0.26, seed: 29 });
  p.smoothHeight(1, 0.45);
  return { cv: bake(p), ox: cx, oy: cy, r: R };
}

/** WATER - the spring bladder, a translucent sac with the duct leaving it. */
function paintSpring(S, lv) {
  const w = Math.ceil(146 * S) + 12, h = Math.ceil(162 * S) + 12;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h * 0.60;
  const R = 39 * S * lerp(0.70, 1.14, lv);

  // the duct, running up out of the top
  p.curve([
    { x: cx, y: cy - R * 0.6 },
    { x: cx - R * 0.3, y: cy - R * 1.6 },
    { x: cx + R * 0.1, y: cy - R * 2.5 },
  ], R * 0.26, R * 0.16, { mat: 'membrane', dome: R * 0.22, steps: 12, tint: -0.06 });

  // the sac
  p.ellipse(cx, cy, R * 1.05, R * 1.18, { mat: 'membrane', dome: R * 0.95, tint: 0.02 });
  // the water inside it, showing through
  const fill = lerp(0.42, 0.86, lv);
  p.field(cx - R * 1.1, cy - R * 1.3, cx + R * 1.1, cy + R * 1.3, (x, y) => {
    const a = (x - cx) / (R * 0.86), b = (y - cy) / (R * 0.98);
    if (a * a + b * b > 1) return null;
    const top = cy + R * 1.0 - R * 2.1 * fill;
    if (y < top) return null;
    const dz = Math.sqrt(clamp01(1 - a * a - b * b));
    return { h: dz * R * 0.5, tint: -0.06 + dz * 0.22 };
  }, { mat: 'water' });
  // the rings of muscle that squeeze it
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const yy = cy - R * 1.05 + t * R * 2.1;
    const hw = R * Math.sqrt(Math.max(0, 1 - Math.pow((yy - cy) / (R * 1.18), 2))) * 1.05;
    p.capsule(cx - hw, yy, cx + hw, yy, R * 0.06, R * 0.06,
      { mat: 'membrane', mask: true, dome: R * 0.1, tint: 0.12 });
  }
  p.ellipse(cx - R * 0.38, cy - R * 0.44, R * 0.26, R * 0.18,
    { mat: 'membrane', mask: true, dome: R * 0.2, tint: 0.34 });

  p.grain('membrane', { freq: 0.30 / S, amp: 0.12, seed: 13 });
  p.smoothHeight(1, 0.5);
  return { cv: bake(p), ox: cx, oy: cy, r: R };
}

/** GARDEN - the gut: a coil that turns what the shell grows into nutrients. */
function paintGut(S, lv) {
  const w = Math.ceil(188 * S) + 12, h = Math.ceil(146 * S) + 12;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h * 0.54;
  const R = 39 * S * lerp(0.74, 1.10, lv);
  const turns = 2.3;
  const steps = 84;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const th = t * turns * TAU;
    const rr = R * (1.30 - t * 0.86);
    pts.push({ x: cx + Math.cos(th) * rr * 1.24, y: cy + Math.sin(th) * rr * 0.82 });
  }
  for (let i = 1; i < pts.length; i++) {
    const t = i / pts.length;
    const r = R * lerp(0.30, 0.17, t);
    p.capsule(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, r, r,
      { mat: 'organPale', dome: r * 0.95, tint: 0.02 + Math.sin(t * 24) * 0.05 });
  }
  // haustra: the pinches that make a gut read as a gut
  for (let i = 4; i < pts.length; i += 5) {
    const t = i / pts.length;
    const r = R * lerp(0.30, 0.17, t);
    p.ellipse(pts[i].x, pts[i].y, r * 0.34, r * 1.02,
      { mat: 'organPale', mask: true, dome: -r * 0.5, tint: -0.24 });
  }
  // the lobes of the digestive gland, packed into the outer turn
  for (let i = 0; i < 9; i++) {
    const th = (i / 9) * TAU + 0.4;
    const rr = R * 1.52;
    p.ellipse(cx + Math.cos(th) * rr * 1.16, cy + Math.sin(th) * rr * 0.74,
      R * 0.30, R * 0.24, { mat: 'organ', dome: R * 0.26, rot: th, tint: -0.06 });
  }
  p.grain('organPale', { freq: 0.36 / S, amp: 0.15, seed: 7 });
  p.speckle('organ', { density: 0.05, amp: 0.28, seed: 37 });
  p.smoothHeight(1, 0.5);
  return { cv: bake(p), ox: cx, oy: cy, r: R };
}

/** FLEET - the ganglion: the knot that hears the desert and answers it. */
function paintGanglion(S, lv) {
  const w = Math.ceil(168 * S) + 12, h = Math.ceil(152 * S) + 12;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h * 0.52;
  const R = 34 * S * lerp(0.72, 1.12, lv);

  // nerves out to everywhere, drawn first
  const n = 10;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU + 0.2;
    const len = R * (1.7 + rnd(i * 41) * 1.4);
    p.curve([
      { x: cx, y: cy },
      { x: cx + Math.cos(th) * len * 0.6, y: cy + Math.sin(th) * len * 0.6 + Math.sin(i) * R * 0.2 },
      { x: cx + Math.cos(th) * len, y: cy + Math.sin(th) * len },
    ], R * 0.14, R * 0.05, { mat: 'nerve', dome: R * 0.12, steps: 12, tint: -0.10 });
    // and the branchlets off each
    for (let j = 0; j < 2; j++) {
      const t = 0.55 + j * 0.28;
      const bx = cx + Math.cos(th) * len * t, by = cy + Math.sin(th) * len * t;
      const bt = th + (j ? 0.6 : -0.6);
      p.capsule(bx, by, bx + Math.cos(bt) * R * 0.7, by + Math.sin(bt) * R * 0.7,
        R * 0.05, R * 0.02, { mat: 'nerve', dome: R * 0.05, tint: -0.14 });
    }
  }
  // the ganglion itself: several fused bodies
  for (let i = 0; i < 5; i++) {
    const th = (i / 5) * TAU;
    p.ellipse(cx + Math.cos(th) * R * 0.42, cy + Math.sin(th) * R * 0.34,
      R * 0.62, R * 0.56, { mat: 'nerve', dome: R * 0.62, tint: 0.06 });
  }
  p.ellipse(cx, cy, R * 0.70, R * 0.62, { mat: 'nerve', dome: R * 0.70, tint: 0.14, emissive: 0.30 * lv });
  p.speckle('nerve', { density: 0.07, amp: 0.32, seed: 23 });
  p.grain('nerve', { freq: 0.44 / S, amp: 0.13, seed: 11 });
  p.smoothHeight(1, 0.5);
  return { cv: bake(p), ox: cx, oy: cy, r: R };
}

/**
 * The gills. A crab's are books of thin plates, but at this size a stack of
 * bars reads as a barcode, so each one is drawn as what it actually behaves
 * like: a plume with a rachis and a hundred fine barbs off it, still moving
 * water that has not been there for a thousand years.
 */
function paintGill(S, lv, flip = 1) {
  const w = Math.ceil(150 * S) + 10, h = Math.ceil(210 * S) + 10;
  const p = new Painter(w, h);
  const cx = w * 0.5 - flip * w * 0.16, cy = h * 0.5;
  const H = 84 * S * lerp(0.82, 1.06, lv);
  const plumes = 4;

  for (let k = 0; k < plumes; k++) {
    const t = plumes === 1 ? 0.5 : k / (plumes - 1);
    const y0 = cy - H * 0.86 + t * H * 1.72;
    const len = H * (0.66 + Math.sin(t * Math.PI) * 0.44);
    const droop = H * (0.10 + t * 0.14);
    const rach = [
      { x: cx, y: y0 },
      { x: cx + flip * len * 0.55, y: y0 - H * 0.06 },
      { x: cx + flip * len, y: y0 + droop },
    ];
    // the barbs first, so the rachis lies over their roots
    const barbs = 22;
    for (let i = 1; i < barbs; i++) {
      const bt = i / barbs;
      const u = 1 - bt;
      const bx = u * u * rach[0].x + 2 * u * bt * rach[1].x + bt * bt * rach[2].x;
      const by = u * u * rach[0].y + 2 * u * bt * rach[1].y + bt * bt * rach[2].y;
      const bl = H * 0.20 * Math.sin(Math.pow(bt, 0.7) * Math.PI) * (0.7 + rnd(k * 31 + i) * 0.5);
      for (const sgn of [-1, 1]) {
        p.curve([
          { x: bx, y: by },
          { x: bx + flip * bl * 0.35, y: by + sgn * bl * 0.62 },
          { x: bx + flip * bl * 0.30, y: by + sgn * bl },
        ], H * 0.016, H * 0.006,
          { mat: 'gill', dome: H * 0.014, steps: 6, tint: -0.14 + bt * 0.26 + sgn * 0.05 });
      }
    }
    p.curve(rach, H * 0.038, H * 0.012,
      { mat: 'gill', dome: H * 0.034, steps: 14, tint: 0.10 + t * 0.06 });
  }

  // the vessel they all hang off, running down the body wall
  p.curve([
    { x: cx - flip * H * 0.06, y: cy - H * 1.00 },
    { x: cx + flip * H * 0.04, y: cy },
    { x: cx - flip * H * 0.06, y: cy + H * 1.00 },
  ], H * 0.062, H * 0.050, { mat: 'organPale', dome: H * 0.055, steps: 12, tint: -0.06 });

  p.grain('gill', { freq: 0.22 / S, amp: 0.16, seed: 19 });
  p.smoothHeight(1, 0.5);
  return { cv: bake(p), ox: cx, oy: cy };
}

/** The seed the tree comes out of: a hard case with a live heart in it. */
function paintSeed(S, lv) {
  const w = Math.ceil(74 * S) + 10, h = Math.ceil(84 * S) + 10;
  const p = new Painter(w, h);
  const cx = w / 2, cy = h / 2;
  const R = 23 * S * lerp(0.86, 1.10, lv);
  p.ellipse(cx, cy, R * 0.86, R * 1.06, { mat: 'seedcoat', dome: R * 0.9, tint: 0.02 });
  // the ridges down the coat
  for (let i = 0; i < 5; i++) {
    const a = -0.7 + i * 0.35;
    p.capsule(cx + Math.sin(a) * R * 0.62, cy - R * 0.9, cx + Math.sin(a) * R * 0.44, cy + R * 0.9,
      R * 0.07, R * 0.05, { mat: 'seedcoat', mask: true, dome: R * 0.08, tint: i === 2 ? 0.16 : -0.12 });
  }
  // the split, and the living green showing through it
  p.capsule(cx, cy - R * 0.86, cx, cy + R * 0.86, R * 0.13, R * 0.09,
    { mat: 'sap', mask: true, dome: -R * 0.3, tint: 0.30, emissive: 0.5 });
  p.ellipse(cx, cy, R * 0.24, R * 0.34, { mat: 'sap', mask: true, dome: R * 0.3, tint: 0.42, emissive: 0.75 });
  p.grain('seedcoat', { freq: 0.5 / S, amp: 0.18, seed: 71 });
  p.smoothHeight(1, 0.4);
  return { cv: bake(p), ox: cx, oy: cy, r: R };
}

// ---------------------------------------------------------------------------

const cache = new Map();
const key = (n, S, lv) => `${n}:${S.toFixed(2)}:${Math.round(lv * 4)}`;

/**
 * An organ at a given size and development. Levels are quantised to five
 * steps, so growing one only ever re-bakes four times over a whole game.
 */
export function organArt(name, S = 1, lv = 0) {
  const k = key(name, S, lv);
  let v = cache.get(k);
  if (v) return v;
  const q = Math.round(clamp01(lv) * 4) / 4;
  switch (name) {
    case 'heart': v = paintHeart(S, q); break;
    case 'spring': v = paintSpring(S, q); break;
    case 'gut': v = paintGut(S, q); break;
    case 'ganglion': v = paintGanglion(S, q); break;
    case 'gillL': v = paintGill(S, q, -1); break;
    case 'gillR': v = paintGill(S, q, 1); break;
    case 'seed': v = paintSeed(S, q); break;
    default: v = paintHeart(S, q);
  }
  cache.set(k, v);
  return v;
}

/**
 * The shell overhead and the muscle wall behind it, in body-space units at the
 * given camera scale. Quantised to eighths so panning does not re-bake.
 */
export function cavityArt(S) {
  const q = Math.max(0.25, Math.round(clamp01(S / 2) * 16) / 8);
  const k = `cav:${q}`;
  let v = cache.get(k);
  if (v) return v;
  v = { vault: paintVault(q), wall: paintCavity(q), S: q };
  cache.set(k, v);
  return v;
}

export function clearAnatomyCache() { cache.clear(); }
