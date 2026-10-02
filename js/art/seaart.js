// CRABDEN - what lived here when there was water.
//
// Painted the same way as everything else: height fields, material ramps, one
// light from above, a hard outline in each material's own darkest colour. The
// reef is not a backdrop - every rock, coral head, sponge, anemone, urchin and
// crablet is a baked sprite that stands on the same terrain the desert stands
// on, because it is the same terrain. That is the whole point of the opening:
// you are looking at the seabed you will spend the game walking across.
//
// The big pieces are ROCK - pillars, arches, tables, piles of boulders, reef
// walls - built as one mass of stone (see rockgen.js) and then grown over:
// algae and pink coralline crust on every upward face, and on the shoulders
// brain coral, staghorn, table coral, tube and barrel sponges, sea fans, soft
// coral and anemones. Each one also carries a mask of its lit top, so the
// caustics can crawl over it, and a mask of everything alive on it, so the
// reef can bleach as the sea goes.

import { Painter, makeCanvas } from '../render/pixel.js';
import { withMaterials } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU, mulberry32 } from '../lib/math.js';
import { rockMass, topOf, nz } from './rockgen.js';

const LIGHT = { lightX: -0.25, lightY: -0.9, lightZ: 0.45, ambient: 0.44, dither: 0.6 };

const MATS = withMaterials({
  reefRock: { ramp: ['#141b28', '#1d2636', '#283346', '#344157', '#425068', '#53627a', '#67768d', '#7e8da2', '#98a6b8'],
    diffuse: 0.8, rim: 0.22, ao: 0.16, normalScale: 0.6, outline: '#0a0f18' },
  reefRockWarm: { ramp: ['#1e1a22', '#2a2430', '#38303f', '#473d4f', '#574c60', '#6a5e72', '#7f7386', '#978b9c', '#b0a6b4'],
    diffuse: 0.8, rim: 0.22, ao: 0.16, normalScale: 0.6, outline: '#0e0b12' },
  algae: { ramp: ['#132616', '#1b351e', '#244628', '#2f5a32', '#3b6e3c', '#4a8448', '#5c9a56', '#74b06a'],
    diffuse: 0.78, rim: 0.3, ao: 0.12, normalScale: 0.5, outline: '#0a160c' },
  coralline: { ramp: ['#3a1a2a', '#542638', '#703448', '#8c465a', '#a65a6e', '#bc7284', '#d08e9c', '#e2aab6'],
    diffuse: 0.78, rim: 0.3, ao: 0.12, normalScale: 0.5, outline: '#200c18' },
  coralOrange: { ramp: ['#4a1606', '#6e240a', '#94360e', '#b84a16', '#d66420', '#ec8432', '#f6a650', '#fcc87e'],
    diffuse: 0.8, rim: 0.36, ao: 0.12, normalScale: 0.6, outline: '#2a0c02' },
  coralPink: { ramp: ['#4a1228', '#6c1c3a', '#8e2a50', '#b03c66', '#ca5880', '#e07a9c', '#ee9eb8', '#f8c4d4'],
    diffuse: 0.8, rim: 0.36, ao: 0.12, normalScale: 0.6, outline: '#2a0816' },
  coralPurple: { ramp: ['#24123a', '#341c52', '#48286c', '#5e3886', '#764ea0', '#9068b8', '#ac8ad0', '#ccb0e4'],
    diffuse: 0.8, rim: 0.38, ao: 0.12, normalScale: 0.6, outline: '#140a22' },
  coralYellow: { ramp: ['#38320e', '#544a14', '#72661c', '#908428', '#aca238', '#c4bc52', '#dad476', '#ece8a6'],
    diffuse: 0.8, rim: 0.32, ao: 0.14, normalScale: 0.6, outline: '#201c06' },
  coralTeal: { ramp: ['#0a3032', '#104444', '#185c5a', '#227672', '#2e908a', '#42aaa2', '#62c4ba', '#94dcd2'],
    diffuse: 0.8, rim: 0.36, ao: 0.12, normalScale: 0.6, outline: '#041a1a' },
  coralWhite: { ramp: ['#4a4a52', '#66666e', '#82828a', '#9e9ea4', '#b8b8bc', '#d0d0d0', '#e4e2de', '#f6f4ee'],
    diffuse: 0.78, rim: 0.4, ao: 0.1, normalScale: 0.6, outline: '#2a2a30' },
  fanRed: { ramp: ['#360a10', '#521218', '#701c22', '#902a2c', '#ae3c38', '#c8564a', '#dc7864', '#ec9e88'],
    diffuse: 0.75, rim: 0.4, ao: 0.08, normalScale: 0.5, outline: '#1e0408' },
  fanPurple: { ramp: ['#200c34', '#30144a', '#442064', '#5a2e7e', '#724298', '#8c5cb2', '#a87cca', '#c8a2e0'],
    diffuse: 0.75, rim: 0.4, ao: 0.08, normalScale: 0.5, outline: '#12061e' },
  spongeYellow: { ramp: ['#463606', '#6a520a', '#8e7010', '#b28e18', '#cead26', '#e2c642', '#f0dc70', '#f8eea6'],
    diffuse: 0.8, rim: 0.34, ao: 0.14, normalScale: 0.6, outline: '#281e02' },
  spongeRed: { ramp: ['#360e0a', '#521610', '#702016', '#8e2c1e', '#aa3c28', '#c25236', '#d6704e', '#e6946e'],
    diffuse: 0.8, rim: 0.32, ao: 0.16, normalScale: 0.65, outline: '#1e0604' },
  anemone: { ramp: ['#401c38', '#5c2852', '#7c386e', '#9c4c8c', '#b866a8', '#cc86c0', '#dea8d6', '#eecae8'],
    diffuse: 0.72, rim: 0.42, ao: 0.08, normalScale: 0.45, translucent: 0.3, outline: '#24101e' },
  anemoneGreen: { ramp: ['#16301e', '#20442a', '#2c5a36', '#3a7244', '#4c8a54', '#62a468', '#80bc82', '#a6d4a2'],
    diffuse: 0.72, rim: 0.42, ao: 0.08, normalScale: 0.45, translucent: 0.3, outline: '#0a1a0e' },
  anemoneBase: { ramp: ['#3a1e1a', '#542c24', '#703c30', '#8c4e3e', '#a6644e', '#bc7c62', '#d0987c'],
    diffuse: 0.8, rim: 0.3, ao: 0.12, outline: '#200e0a' },
  urchin: { ramp: ['#0e0a16', '#181222', '#221a30', '#2e2440', '#3c3052', '#4e4066', '#64547e', '#7e6c98'],
    diffuse: 0.7, rim: 0.5, spec: 0.4, ao: 0.1, outline: '#06040a' },
  starOrange: { ramp: ['#4a1a06', '#6c280a', '#903a10', '#b44e18', '#d06624', '#e48238', '#f2a052', '#f8c27c'],
    diffuse: 0.8, rim: 0.3, ao: 0.12, outline: '#2a0c02' },
  shellPale: { ramp: ['#4a4038', '#665a4e', '#827466', '#9e8e7e', '#b8a898', '#d0c2b2', '#e4d8ca', '#f6eee4'],
    diffuse: 0.78, rim: 0.4, spec: 0.3, ao: 0.1, outline: '#2a2420' },
  shellPink: { ramp: ['#4e2a2a', '#6c3c3a', '#8a504c', '#a66860', '#c08276', '#d69e90', '#e8bcae', '#f6dcd0'],
    diffuse: 0.78, rim: 0.4, spec: 0.4, ao: 0.1, outline: '#2a1414' },
  cucumber: { ramp: ['#24140c', '#361e12', '#4a2a18', '#5e3820', '#74482a', '#8a5a36', '#a27046'],
    diffuse: 0.78, rim: 0.3, ao: 0.12, outline: '#140a06' },
  whale: { ramp: ['#142c3c', '#1c3d52', '#255068', '#30647e', '#3e7994', '#5090a8', '#6ca8bc', '#92c2d0'],
    diffuse: 0.84, rim: 0.26, ao: 0.1, normalScale: 0.45, outline: '#0a1824' },
  whaleDark: { ramp: ['#0c1e2c', '#132a3c', '#1a374e', '#224662', '#2c5674', '#386886', '#4a7c98', '#6292ac'],
    diffuse: 0.8, rim: 0.2, ao: 0.14, normalScale: 0.5, outline: '#06121c' },
  whalePale: { ramp: ['#3a5a6c', '#4a6c7e', '#5c7e90', '#7092a2', '#86a6b4', '#9cbac6', '#b4ccd6', '#cee0e8'],
    diffuse: 0.8, rim: 0.3, ao: 0.1, normalScale: 0.45, outline: '#1c3040' },
  shark: { ramp: ['#1e2a34', '#2a3844', '#384856', '#485a68', '#5a6e7c', '#6e8290', '#8698a4', '#a2b2bc'],
    diffuse: 0.84, rim: 0.3, spec: 0.25, ao: 0.1, normalScale: 0.45, outline: '#0c141a' },
  sharkBelly: { ramp: ['#6e7a82', '#8a969c', '#a6b0b4', '#c0c8ca', '#d6dcdc', '#e8ecea', '#f6f8f6'],
    diffuse: 0.75, rim: 0.3, ao: 0.08, normalScale: 0.4, outline: '#3a4248' },
  sharkTip: { ramp: ['#06080a', '#0c1014', '#14181e', '#1e242a'],
    diffuse: 0.7, rim: 0.2, ao: 0.08, outline: '#020304' },
  wshark: { ramp: ['#101c2c', '#16263a', '#1e324a', '#28405c', '#34506e', '#426282', '#567696', '#6e8eaa'],
    diffuse: 0.82, rim: 0.28, ao: 0.1, normalScale: 0.45, outline: '#08101a' },
  wsharkSpot: { ramp: ['#7e98aa', '#9cb2c0', '#bacad4', '#d6e2e8', '#eef4f6'],
    diffuse: 0.7, rim: 0.2, ao: 0.06, normalScale: 0.3, outline: '#28384a' },
  wsharkBelly: { ramp: ['#6a7e8c', '#8496a2', '#a0b0ba', '#bccad0', '#d6e0e4', '#eaf0f2'],
    diffuse: 0.75, rim: 0.3, ao: 0.08, outline: '#2c3a44' },
  jelly: { ramp: ['#3a3a6a', '#4a4c82', '#5e6298', '#7478ae', '#8e92c2', '#aaaed6', '#c8cce6', '#e8eaf8'],
    diffuse: 0.5, rim: 0.85, spec: 0.7, ao: 0.04, normalScale: 0.4, outline: '#2a2a52' },
  jellyRing: { ramp: ['#6a3a6a', '#8a4c86', '#a862a2', '#c47ebc', '#d89cd2', '#e8bce4', '#f6dcf2'],
    diffuse: 0.5, rim: 0.6, ao: 0.04, normalScale: 0.4, outline: '#4a2a4a' },
});

const cache = new Map();
const bake = (p, ox, oy, extra = {}, light = LIGHT) => ({
  cv: p.resolve(MATS, { ...light, outline: 1 }), ox: Math.round(ox), oy: Math.round(oy), ...extra,
});

/** Everything alive on a sprite, as one pale silhouette - the bleached reef. */
const ALIVE = new Set(['algae', 'coralline', 'coralOrange', 'coralPink', 'coralPurple', 'coralYellow', 'coralTeal',
  'coralWhite', 'fanRed', 'fanPurple', 'spongeYellow', 'spongeRed', 'anemone', 'anemoneGreen', 'anemoneBase']);
function bleachMask(p) {
  const cv = makeCanvas(p.w, p.h);
  const g = cv.getContext('2d');
  const img = g.createImageData(p.w, p.h);
  const live = p.mats.map((m) => ALIVE.has(m));
  for (let i = 0; i < p.w * p.h; i++) {
    if (!live[p.mat[i]]) continue;
    const o = i * 4;
    const v = 214 + ((i * 7919) % 5) * 6;
    img.data[o] = v; img.data[o + 1] = v - 6; img.data[o + 2] = v - 16; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

/** The lit top of a sprite - the first few pixels down from the sky in each column. */
function topMask(p, depth = 4) {
  const cv = makeCanvas(p.w, p.h);
  const g = cv.getContext('2d');
  const img = g.createImageData(p.w, p.h);
  for (let x = 0; x < p.w; x++) {
    let run = -1;
    for (let y = 0; y < p.h; y++) {
      const m = p.mat[y * p.w + x];
      if (!m) { run = -1; continue; }
      if (run < 0) run = 0;
      if (run < depth) {
        const o = (y * p.w + x) * 4;
        img.data[o] = 255; img.data[o + 1] = 255; img.data[o + 2] = 255; img.data[o + 3] = run < 2 ? 255 : 150;
      }
      run++;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// the things that grow, painted into whatever Painter they are given
//
// Each takes the point it stands on (x, y), a size S and a generator, and
// paints upward from there.

function grow(p, kind, x, y, S, rng, mat) {
  switch (kind) {
    case 'brain': return brain(p, x, y, S, rng, mat || pickOf(rng, ['coralYellow', 'coralYellow', 'coralTeal', 'coralPink']));
    case 'stag': return stag(p, x, y, S, rng, mat || pickOf(rng, ['coralOrange', 'coralPink', 'coralPurple', 'coralYellow']));
    case 'table': return table(p, x, y, S, rng, mat || pickOf(rng, ['coralTeal', 'coralYellow', 'coralPurple']));
    case 'fan': return fan(p, x, y, S, rng, mat || pickOf(rng, ['fanRed', 'fanPurple', 'fanRed', 'coralOrange']));
    case 'tube': return tubes(p, x, y, S, rng, mat || pickOf(rng, ['spongeYellow', 'coralPurple', 'coralOrange', 'spongeRed']));
    case 'barrel': return barrel(p, x, y, S, rng, mat || pickOf(rng, ['spongeRed', 'spongeYellow', 'coralPurple']));
    case 'soft': return soft(p, x, y, S, rng, mat || pickOf(rng, ['coralPink', 'coralWhite', 'coralPurple']));
    case 'whip': return whips(p, x, y, S, rng, mat || pickOf(rng, ['coralOrange', 'fanRed', 'spongeYellow']));
    case 'anemone': return anemone(p, x, y, S, rng, 0, mat);
    case 'urchin': return urchin(p, x, y, S, rng);
    case 'star': return star(p, x, y, S, rng);
    case 'shell': return shell(p, x, y, S, rng);
    case 'conch': return conch(p, x, y, S, rng);
    case 'cucumber': return cucumber(p, x, y, S, rng);
    case 'duster': return duster(p, x, y, S, rng);
    default: return brain(p, x, y, S, rng, 'coralYellow');
  }
}
const pickOf = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function brain(p, x, y, S, rng, mat) {
  const W = (7 + rng() * 5) * S, H = W * (0.55 + rng() * 0.2);
  p.ellipse(x, y - H * 0.5, W, H, { mat, dome: W * 0.6, tint: 0.02 });
  // the meandering grooves that make it a brain and not a bun
  for (let k = 0; k < 5 + S * 2; k++) {
    const yy = y - H * (0.15 + (k / (5 + S * 2)) * 0.8);
    const ww = W * Math.sqrt(Math.max(0, 1 - Math.pow((y - H * 0.5 - yy) / H, 2))) * 0.9;
    const pts = [{ x: x - ww, y: yy + 1 }, { x: x + (rng() - 0.5) * W * 0.5, y: yy - 1.4 * S }, { x: x + ww, y: yy + 1 }];
    p.curve(pts, 0.45 * S, 0.45 * S, { mat, mask: true, dome: -0.6 * S, steps: 10, tint: -0.24 });
  }
}

function stag(p, x, y, S, rng, mat) {
  const branch = (x0, y0, a, len, r, d) => {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    p.capsule(x0, y0, x1, y1, r, r * 0.78, { mat, dome: r * 0.9, tint: -0.04 + d * 0.04 });
    if (d >= 3 || r < 0.8) { p.ellipse(x1, y1, r * 0.85, r * 0.85, { mat, dome: r, tint: 0.16 }); return; }
    const n = rng() < 0.35 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const spread = (i - (n - 1) / 2) * (0.5 + rng() * 0.35);
      branch(x1, y1, a + spread + (rng() - 0.5) * 0.2, len * (0.68 + rng() * 0.2), r * 0.72, d + 1);
    }
  };
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) branch(x + (i - (n - 1) / 2) * 4 * S, y + 1, -Math.PI / 2 + (rng() - 0.5) * 0.5, (5 + rng() * 2) * S, 1.9 * S, 0);
}

function table(p, x, y, S, rng, mat) {
  const h = (5 + rng() * 5) * S, w = (10 + rng() * 8) * S;
  p.capsule(x, y + 1, x + (rng() - 0.5) * 2, y - h, 1.6 * S, 1.2 * S, { mat, dome: 1.4 * S, tint: -0.1 });
  p.ellipse(x, y - h - 1 * S, w, 2.2 * S, { mat, dome: 1.8 * S, tint: 0.06 });
  // the plate is made of a thousand little branches: speckle the top
  for (let k = 0; k < w * 1.2; k++) {
    const xx = x - w + rng() * w * 2;
    p.ellipse(xx, y - h - 2.4 * S, 0.7 * S, 0.7 * S, { mat, dome: 0.6 * S, tint: 0.14 });
  }
}

function fan(p, x, y, S, rng, mat) {
  // a gorgonian, edge-on to the current and face-on to you: a lattice of
  // branches spreading from one short stem
  const H = (12 + rng() * 8) * S, W = H * (0.7 + rng() * 0.3);
  const stem = { x: x + (rng() - 0.5) * 2, y: y - H * 0.18 };
  p.capsule(x, y + 1, stem.x, stem.y, 1.3 * S, 1.0 * S, { mat, dome: 1.1 * S, tint: -0.08 });
  const tips = [];
  const ribs = 7 + Math.floor(S * 2);
  for (let i = 0; i < ribs; i++) {
    const u = i / (ribs - 1);
    const a = -Math.PI / 2 + (u - 0.5) * 1.7;
    const len = H * (0.62 + Math.sin(u * Math.PI) * 0.36);
    const x1 = stem.x + Math.cos(a) * len * (W / H), y1 = stem.y + Math.sin(a) * len;
    p.curve([stem, { x: stem.x + Math.cos(a) * len * 0.5 * (W / H) + (rng() - 0.5) * 2, y: stem.y + Math.sin(a) * len * 0.5 }, { x: x1, y: y1 }],
      0.85 * S, 0.45 * S, { mat, dome: 0.7 * S, steps: 9, tint: 0.02 });
    tips.push({ x: x1, y: y1 });
  }
  for (let i = 1; i < ribs; i++) {
    for (const k of [0.4, 0.62, 0.82]) {
      const a = tips[i - 1], b = tips[i];
      p.capsule(lerp(stem.x, a.x, k), lerp(stem.y, a.y, k), lerp(stem.x, b.x, k), lerp(stem.y, b.y, k), 0.45 * S, 0.45 * S,
        { mat, dome: 0.4 * S, tint: -0.06 });
    }
  }
}

function tubes(p, x, y, S, rng, mat) {
  const n = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const dx = (i - (n - 1) / 2) * 3.4 * S + (rng() - 0.5) * 2;
    const h = (6 + rng() * 10) * S;
    const r = (1.5 + rng() * 0.8) * S;
    const lean = (rng() - 0.5) * 3 * S;
    p.capsule(x + dx, y + 1, x + dx + lean, y - h, r * 0.9, r, { mat, dome: r, tint: -0.04 + i * 0.03 });
    p.ellipse(x + dx + lean, y - h, r * 0.7, r * 0.45, { mat, mask: true, dome: -r, tint: -0.36 });
  }
}

function barrel(p, x, y, S, rng, mat) {
  const h = (9 + rng() * 6) * S, w = (5 + rng() * 2) * S;
  p.field(x - w * 1.4, y - h - 2, x + w * 1.4, y + 1, (px, py) => {
    const t = (y - py) / h;
    if (t < 0 || t > 1) return null;
    const ww = w * (0.75 + t * 0.5) * (t > 0.92 ? 1.05 : 1);
    const d = Math.abs(px - x) / ww;
    if (d > 1) return null;
    const rib = Math.sin(t * 22) > 0.55 ? -0.1 : 0.03;
    return { h: Math.sqrt(1 - d * d) * w * 0.8, tint: rib };
  }, { mat });
  p.ellipse(x, y - h, w * 1.1, 1.6 * S, { mat, mask: true, dome: -w, tint: -0.42 });
}

function soft(p, x, y, S, rng, mat) {
  // soft coral: a trunk breaking into knobbly florets
  const h = (7 + rng() * 6) * S;
  p.capsule(x, y + 1, x, y - h * 0.5, 2.2 * S, 1.6 * S, { mat, dome: 1.8 * S, tint: -0.06 });
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.2;
    const r = (2 + rng() * 2) * S;
    p.ellipse(x + Math.cos(a) * h * 0.4, y - h * 0.5 + Math.sin(a) * h * 0.5, r, r * 0.85, { mat, dome: r, tint: 0.06 });
  }
  p.speckle(mat, { density: 0.25, amp: 0.2, seed: 3 });
}

function whips(p, x, y, S, rng, mat) {
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const len = (10 + rng() * 14) * S, bend = (rng() - 0.5) * 8 * S;
    p.curve([{ x: x + i * 1.6 * S, y: y + 1 }, { x: x + i * 1.6 * S + bend * 0.3, y: y - len * 0.5 }, { x: x + i * 1.6 * S + bend, y: y - len }],
      0.8 * S, 0.5 * S, { mat, dome: 0.6 * S, steps: 10, tint: (i % 2) * 0.05 });
  }
}

/** An anemone: a fleshy column with a crown of tentacles. `f` sways them. */
function anemone(p, x, y, S, rng, f = 0, mat) {
  const tm = mat || (rng() < 0.6 ? 'anemone' : 'anemoneGreen');
  const W = (8 + rng() * 4) * S, H = (6 + rng() * 3) * S;
  p.ellipse(x, y - H * 0.25, W * 0.42, H * 0.3, { mat: 'anemoneBase', dome: W * 0.3, tint: -0.04 });
  const n = 16 + Math.floor(S * 4);
  const ph = f * TAU;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const a = -Math.PI / 2 + (u - 0.5) * 2.5;
    const len = H * (0.8 + rng() * 0.5) * (0.75 + 0.25 * Math.sin(u * Math.PI));
    const sway = Math.sin(ph + u * 3) * 0.35;
    const bx = x + Math.cos(a) * W * 0.25, by = y - H * 0.45;
    const tip = { x: bx + Math.cos(a + sway) * len, y: by + Math.sin(a + sway * 0.5) * len * 0.9 };
    p.curve([{ x: bx, y: by }, { x: bx + Math.cos(a) * len * 0.5 + sway * 2 * S, y: by + Math.sin(a) * len * 0.55 }, tip],
      0.95 * S, 0.5 * S, { mat: tm, dome: 0.8 * S, steps: 8, tint: 0.04 + (i % 3) * 0.04 });
    p.ellipse(tip.x, tip.y, 0.9 * S, 0.9 * S, { mat: tm, dome: 0.8 * S, tint: 0.22 });
  }
}

function urchin(p, x, y, S, rng) {
  const R = (3.4 + rng() * 1.5) * S;
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI - 0.15 + (i / 25) * (Math.PI + 0.3);
    const len = R * (1.6 + rng() * 1.1);
    p.capsule(x, y - R * 0.6, x + Math.cos(a) * len, y - R * 0.6 + Math.sin(a) * len, 0.55 * S, 0.22 * S, { mat: 'urchin', dome: 0.5 * S, tint: -0.06 });
  }
  p.ellipse(x, y - R * 0.6, R, R * 0.8, { mat: 'urchin', dome: R * 0.8, tint: 0.04 });
}

function star(p, x, y, S, rng) {
  const R = (4.5 + rng() * 2) * S;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI + (i / 4) * Math.PI + (rng() - 0.5) * 0.2;
    p.capsule(x, y - R * 0.18, x + Math.cos(a) * R, y - R * 0.18 + Math.sin(a) * R * 0.5, 1.5 * S, 0.6 * S, { mat: 'starOrange', dome: 1.2 * S, tint: 0.04 });
  }
  p.ellipse(x, y - R * 0.2, R * 0.4, R * 0.28, { mat: 'starOrange', dome: R * 0.35, tint: 0.1 });
  p.speckle('starOrange', { density: 0.22, amp: 0.36, seed: 3 });
}

function shell(p, x, y, S, rng) {
  const W = (4 + rng() * 2.5) * S;
  const mat = rng() < 0.5 ? 'shellPale' : 'shellPink';
  p.ellipse(x, y - W * 0.3, W * 0.6, W * 0.45, { mat, dome: W * 0.4, tint: 0.04 });
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI + (i / 5) * Math.PI;
    p.capsule(x, y, x + Math.cos(a) * W * 0.55, y + Math.sin(a) * W * 0.45, 0.45 * S, 0.35 * S, { mat, mask: true, dome: 0.4 * S, tint: -0.2 });
  }
}

function conch(p, x, y, S, rng) {
  const W = (6 + rng() * 2) * S;
  p.ellipse(x, y - W * 0.36, W * 0.62, W * 0.4, { mat: 'shellPink', dome: W * 0.42, tint: 0.02, rot: -0.2 });
  for (let k = 0; k < 4; k++) p.ellipse(x - W * (0.3 + k * 0.12), y - W * (0.45 + k * 0.08), W * (0.22 - k * 0.04), W * (0.18 - k * 0.03), { mat: 'shellPale', dome: W * 0.2, tint: 0.06 });
  p.ellipse(x + W * 0.2, y - W * 0.25, W * 0.25, W * 0.12, { mat: 'shellPink', mask: true, dome: -W * 0.2, tint: 0.2 });
}

function cucumber(p, x, y, S, rng) {
  const L = (9 + rng() * 4) * S;
  p.capsule(x - L / 2, y - 1.6 * S, x + L / 2, y - 1.8 * S, 2.2 * S, 1.8 * S, { mat: 'cucumber', dome: 2 * S, tint: 0.02 });
  p.speckle('cucumber', { density: 0.3, amp: 0.3, seed: 4 });
}

function duster(p, x, y, S, rng) {
  // a feather-duster worm: a tube with a fan of feathery gill on top
  const h = (3 + rng() * 3) * S;
  p.capsule(x, y + 1, x, y - h, 0.8 * S, 0.7 * S, { mat: 'shellPale', dome: 0.6 * S, tint: -0.1 });
  const mat = pickOf(rng, ['coralOrange', 'coralPurple', 'coralPink', 'spongeYellow']);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.2;
    p.capsule(x, y - h, x + Math.cos(a) * 3 * S, y - h + Math.sin(a) * 3 * S, 0.5 * S, 0.4 * S, { mat, dome: 0.4 * S, tint: 0.08 });
  }
}

// ---------------------------------------------------------------------------
// the rock

/**
 * The big formations, standing in the plane you walk in. Each is a mass of
 * reef rock sunk into the sand at its foot, with life grown over every top.
 */
export const FORMATIONS = ['pillar', 'arch', 'boulders', 'table', 'wall', 'outcrop', 'pillars'];

function formationPrims(kind, cx, base, rng, S = 1) {
  const prims = [];
  const lump = (x, y, r, sq = 0.8) => prims.push({ k: 'bld', x, y, r, sq, seed: rng() * 9 });
  switch (kind) {
    case 'pillar': {
      const h = (70 + rng() * 50) * S, w = (20 + rng() * 10) * S, lean = (rng() - 0.5) * 14 * S;
      prims.push({ k: 'cap', x0: cx, y0: base + 8, x1: cx + lean, y1: base - h + w * 0.4, r0: w * 1.0, r1: w * 0.62 });
      for (let k = 0; k < 6; k++) { const t = rng(); lump(cx + lean * t + (rng() - 0.5) * w * 1.4, base - h * t, w * (0.4 + rng() * 0.3)); }
      lump(cx + lean, base - h + w * 0.3, w * 0.9, 0.62);
      // a ledge sticking out one side
      const side = rng() < 0.5 ? -1 : 1, ly = base - h * (0.45 + rng() * 0.2);
      prims.push({ k: 'slab', x: cx + side * w * 1.1, y: ly, w: w * 1.6, h: 7 * S, r: 3 * S });
      lump(cx - w * 0.8, base, w * 0.8, 0.6); lump(cx + w * 0.9, base + 1, w * 0.7, 0.6);
      return { prims, w: w * 4 + 30, h: h + 20 };
    }
    case 'pillars': {
      // two or three of them close together, different heights
      const n = 2 + (rng() < 0.4 ? 1 : 0);
      let x = cx - (n - 1) * 18 * S;
      let maxH = 0;
      for (let k = 0; k < n; k++) {
        const h = (40 + rng() * 60) * S, w = (12 + rng() * 8) * S;
        maxH = Math.max(maxH, h);
        prims.push({ k: 'cap', x0: x, y0: base + 8, x1: x + (rng() - 0.5) * 10 * S, y1: base - h + w * 0.5, r0: w, r1: w * 0.6 });
        lump(x, base - h + w * 0.4, w * 0.85, 0.6);
        x += (30 + rng() * 14) * S;
      }
      lump(cx, base + 2, 26 * S, 0.45);
      return { prims, w: n * 46 * S + 50, h: maxH + 20 };
    }
    case 'arch': {
      const span = (60 + rng() * 40) * S, h = (56 + rng() * 34) * S, w = (14 + rng() * 6) * S;
      const lx = cx - span / 2, rx = cx + span / 2, hr = h * (0.75 + rng() * 0.25);
      prims.push({ k: 'cap', x0: lx, y0: base + 8, x1: lx + span * 0.1, y1: base - h, r0: w * 1.1, r1: w * 0.8 });
      prims.push({ k: 'cap', x0: rx, y0: base + 8, x1: rx - span * 0.1, y1: base - hr, r0: w * 1.1, r1: w * 0.8 });
      prims.push({ k: 'cap', x0: lx + span * 0.1, y0: base - h, x1: rx - span * 0.1, y1: base - hr, r0: w * 0.85, r1: w * 0.8 });
      lump(cx, base - (h + hr) / 2 - w * 0.4, w * 1.1, 0.55);
      lump(lx - w * 0.5, base, w * 0.9, 0.6); lump(rx + w * 0.5, base, w * 0.9, 0.6);
      prims.push({ k: 'hole', x: cx, y: base - Math.min(h, hr) * 0.36, rx: span * 0.32, ry: Math.min(h, hr) * 0.4 });
      return { prims, w: span + w * 4 + 30, h: h + 24 };
    }
    case 'table': {
      const h = (46 + rng() * 26) * S, w = (12 + rng() * 6) * S, lean = (rng() - 0.5) * 10 * S;
      prims.push({ k: 'cap', x0: cx, y0: base + 8, x1: cx + lean, y1: base - h * 0.85, r0: w * 1.2, r1: w * 0.7 });
      const cw = (54 + rng() * 26) * S, side = rng() < 0.5 ? -1 : 1;
      prims.push({ k: 'slab', x: cx + lean + side * 8 * S, y: base - h * 0.88, w: cw, h: 14 * S, r: 6 * S });
      lump(cx + lean + side * cw * 0.3, base - h * 0.94, 10 * S, 0.6);
      lump(cx - w, base, w, 0.55); lump(cx + w, base + 1, w * 0.8, 0.55);
      return { prims, w: cw + 50, h: h + 24 };
    }
    case 'wall': {
      // a long low reef, mostly something for coral to grow on
      const L = (110 + rng() * 80) * S, h = (26 + rng() * 18) * S;
      for (let x = -L / 2; x <= L / 2; x += 14 * S) lump(cx + x, base - h * (0.2 + rng() * 0.3), (14 + rng() * 10) * S, 0.7);
      prims.push({ k: 'slab', x: cx, y: base - h * 0.3, w: L, h: h * 0.9, r: 8 * S });
      return { prims, w: L + 50, h: h + 30 };
    }
    case 'outcrop': {
      const r = (18 + rng() * 10) * S;
      lump(cx, base - r * 0.5, r, 0.72);
      lump(cx + r * (0.8 + rng() * 0.4) * (rng() < 0.5 ? -1 : 1), base - r * 0.25, r * 0.65, 0.65);
      if (rng() < 0.6) lump(cx + (rng() - 0.5) * r, base - r * 1.2, r * 0.5, 0.7);
      return { prims, w: r * 4 + 40, h: r * 2 + 26 };
    }
    case 'boulders': default: {
      let n = 3 + Math.floor(rng() * 3);
      let y = base + 4, r = (20 + rng() * 8) * S, x = cx;
      let top = 0;
      while (n-- > 0) {
        lump(x, y - r * 0.6, r, 0.78);
        if (rng() < 0.7) lump(x + (rng() < 0.5 ? -1 : 1) * r * 1.2, y - r * 0.3, r * 0.68, 0.72);
        top = Math.max(top, base - (y - r * 1.4));
        y -= r * 1.05; r *= 0.74; x += (rng() - 0.5) * r;
      }
      return { prims, w: 120 * S, h: top + 26 };
    }
  }
}

/** What grows where on each kind of rock. */
const GROWTH = {
  pillar: ['stag', 'fan', 'tube', 'brain', 'soft', 'anemone', 'whip'],
  pillars: ['stag', 'fan', 'tube', 'soft', 'whip', 'brain'],
  arch: ['stag', 'fan', 'soft', 'tube', 'brain', 'table'],
  table: ['table', 'stag', 'brain', 'soft', 'fan', 'tube'],
  wall: ['brain', 'stag', 'table', 'soft', 'fan', 'tube', 'anemone', 'barrel', 'whip'],
  outcrop: ['brain', 'anemone', 'tube', 'stag', 'soft', 'barrel'],
  boulders: ['brain', 'stag', 'tube', 'fan', 'urchin', 'soft'],
};

function paintFormation(kind, seed) {
  const rng = mulberry32((seed * 2654435761) >>> 0);
  // lay it out once to find how big a canvas it needs
  const probe = formationPrims(kind, 0, 0, mulberry32((seed * 2654435761) >>> 0));
  const W = Math.ceil(probe.w + 40), H = Math.ceil(probe.h + 40);
  const cx = W / 2, base = H - 14;
  const { prims } = formationPrims(kind, cx, base, rng);
  const p = new Painter(W, H);
  const rockMat = rng() < 0.7 ? 'reefRock' : 'reefRockWarm';
  rockMass(p, prims, { mat: rockMat, seed: seed % 997 + 1, rough: 0.5, crag: 14, round: 6, relief: 7, strata: 9 + Math.floor(rng() * 5),
    cracks: 3, floor: base + 4 });

  // algae and pink crust over the lit faces, in patches
  const rk = p._matIndex.get(rockMat);
  const alg = p._mid('algae'), crust = p._mid('coralline');
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (p.mat[i] !== rk) { run = 0; continue; }
      run++;
      if (run > 4) continue;
      const n = nz(x, y, 14, seed);
      if (n > 0.56) p.mat[i] = alg;
      else if (n < 0.34 && run < 3) p.mat[i] = crust;
    }
  }
  // and on the shoulders, the reef proper
  const kinds = GROWTH[kind] || GROWTH.boulders;
  const tops = [];
  for (let x = 4; x < W - 4; x += 2) {
    const y = topOf(p, x, rockMat) >= 0 ? firstSolid(p, x) : -1;
    if (y > 4 && y < base + 2) tops.push({ x, y });
  }
  const used = [];
  const nGrow = Math.round(tops.length / 9) + 2;
  for (let k = 0; k < nGrow && tops.length; k++) {
    const t = tops[Math.floor(rng() * tops.length)];
    if (used.some((u) => Math.abs(u - t.x) < 9)) continue;
    used.push(t.x);
    const g = kinds[Math.floor(rng() * kinds.length)];
    grow(p, g, t.x, t.y + 2, g === 'fan' || g === 'whip' ? 1.1 : 0.85 + rng() * 0.4, rng);
  }
  // little things: feather dusters and urchins in the cracks
  for (let k = 0; k < 4; k++) {
    const t = tops[Math.floor(rng() * tops.length)];
    if (!t) break;
    grow(p, rng() < 0.6 ? 'duster' : 'urchin', t.x, t.y + 2, 0.7, rng);
  }
  const v = bake(p, cx, base);
  v.top = topMask(p, 4);
  v.bleach = bleachMask(p);
  v.w = W; v.h = H;
  return v;
}

function firstSolid(p, x) {
  for (let y = 0; y < p.h; y++) if (p.mat[y * p.w + x]) return y;
  return -1;
}

/** A rock formation for the reef. `seed` picks the variant. */
export function formationArt(kind, seed = 0) {
  const k = `form:${kind}:${seed}`;
  let v = cache.get(k);
  if (!v) { v = paintFormation(kind, seed); cache.set(k, v); }
  return v;
}

// ---------------------------------------------------------------------------
// the small fixed things, on their own

function paintSmall(kind, S, seed) {
  const rng = mulberry32((seed * 2654435761) >>> 0);
  const size = { fan: 30, whip: 30, stag: 30, table: 30, tube: 26, barrel: 26, soft: 24, anemone: 22, brain: 26 }[kind] || 18;
  const W = Math.ceil(size * 1.6 * S) + 12, H = Math.ceil(size * 1.3 * S) + 10;
  const p = new Painter(W, H);
  const cx = W / 2, base = H - 4;
  // a little rock or sand under it, so it is standing on something
  if (kind !== 'shell' && kind !== 'star' && kind !== 'cucumber' && kind !== 'conch') {
    p.ellipse(cx, base + 1, (4 + rng() * 3) * S, 2.6 * S, { mat: 'reefRock', dome: 2 * S, tint: 0.02 });
  }
  grow(p, kind, cx, base, S, rng);
  const v = bake(p, cx, base + 1);
  v.bleach = bleachMask(p);
  return v;
}

/** Anything fixed to the seabed. `seed` picks the variant and the colour. */
export function reefArt(kind, S = 1, seed = 0) {
  const k = `${kind}:${S.toFixed(2)}:${seed}`;
  let v = cache.get(k);
  if (v) return v;
  v = kind === 'crablet' ? paintCrablet(S, mulberry32((seed * 2654435761) >>> 0)) : paintSmall(kind, S, seed);
  cache.set(k, v);
  return v;
}

export const ANEMONE_FRAMES = 6;
/** An anemone in one of six frames of its tentacles moving in the swell. */
export function anemoneArt(seed, frame, S = 1) {
  const k = `anem:${seed}:${frame}:${S}`;
  let v = cache.get(k);
  if (v) return v;
  const W = Math.ceil(30 * S) + 10, H = Math.ceil(24 * S) + 8;
  const p = new Painter(W, H);
  const cx = W / 2, base = H - 4;
  p.ellipse(cx, base + 1, 6 * S, 2.6 * S, { mat: 'reefRock', dome: 2 * S, tint: 0.02 });
  anemone(p, cx, base, S * 1.15, mulberry32(seed * 7 + 3), frame / ANEMONE_FRAMES, seed % 3 === 2 ? 'anemoneGreen' : 'anemone');
  v = bake(p, cx, base + 1);
  v.bleach = bleachMask(p);
  cache.set(k, v);
  return v;
}

/** A crab the size of a coin, which is what everything here used to be. */
function paintCrablet(S, rng) {
  const W = 9 * S, H = 6 * S;
  const p = new Painter(Math.ceil(W * 2.4) + 8, Math.ceil(H * 2.4) + 8);
  const cx = p.w / 2, base = p.h - 4;
  const mat = rng() < 0.5 ? 'coralOrange' : 'coralPink';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      p.capsule(cx + side * W * 0.22, base - H * 0.5, cx + side * (W * 0.5 + t * W * 0.32), base - H * 0.5 + H * 0.5 + Math.sin(-0.3 - t * 0.7) * -H * 0.1,
        0.75 * S, 0.4 * S, { mat, dome: 0.7 * S, tint: -0.12 });
    }
    p.capsule(cx + side * W * 0.3, base - H * 0.62, cx + side * W * 0.64, base - H * 0.88, 1.0 * S, 0.8 * S, { mat, dome: 0.9 * S, tint: 0.04 });
    p.ellipse(cx + side * W * 0.72, base - H * 0.96, 1.5 * S, 1.1 * S, { mat, dome: 1.2 * S, tint: 0.12 });
  }
  p.ellipse(cx, base - H * 0.62, W * 0.46, H * 0.42, { mat, dome: W * 0.34, tint: 0.06 });
  for (const side of [-1, 1]) p.ellipse(cx + side * W * 0.14, base - H * 0.86, 0.8 * S, 0.9 * S, { mat: 'eye', dome: 0.8 * S, tint: 0.1 });
  return bake(p, cx, base);
}

export const REEF_KINDS = ['brain', 'stag', 'fan', 'tube', 'soft', 'barrel', 'whip', 'stag', 'brain', 'fan'];
export const FLOOR_KINDS = ['urchin', 'star', 'shell', 'conch', 'cucumber', 'shell'];
export const FISH_KINDS = ['tang', 'clown', 'butterfly'];

// ---------------------------------------------------------------------------
// jellyfish

export const JELLY_FRAMES = 6;
/**
 * A moon jelly: a clear bell with the four pale rings showing through it, a
 * fringe of short tentacles and four frilled arms trailing. `f` is the pulse:
 * the bell squeezes narrow and tall, then relaxes wide and flat.
 */
function paintJelly(S, f) {
  const R = 8 * S;
  const p = new Painter(Math.ceil(R * 3) + 8, Math.ceil(R * 4.6) + 8);
  const cx = p.w / 2, cy = R + 5;
  const pulse = Math.sin(f * TAU);
  const rx = R * (1 + pulse * 0.12), ry = R * (0.66 - pulse * 0.1);
  p.ellipse(cx, cy, rx, ry, { mat: 'jelly', dome: R * 0.8, tint: 0.02 });
  p.ellipse(cx, cy + ry * 0.62, rx * 0.92, ry * 0.32, { mat: 'jelly', mask: true, dome: -R * 0.3, tint: -0.16 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    p.ellipse(cx + Math.cos(a) * rx * 0.32, cy - ry * 0.05 + Math.sin(a) * ry * 0.22, rx * 0.17, ry * 0.15, { mat: 'jellyRing', mask: true, dome: R * 0.1, tint: 0.1 });
  }
  // the fringe
  for (let i = 0; i < 11; i++) {
    const u = i / 10;
    const x0 = cx - rx * 0.95 + u * rx * 1.9;
    const y0 = cy + ry * 0.55 * Math.sqrt(1 - Math.pow(u * 2 - 1, 2)) + 1;
    p.capsule(x0, y0, x0 + Math.sin(f * TAU + u * 5) * 1.5 * S, y0 + (3 + Math.sin(u * 7) * 1) * S, 0.4 * S, 0.3 * S, { mat: 'jelly', dome: 0.3 * S, tint: 0.12 });
  }
  // the oral arms, frilled, trailing
  for (let k = 0; k < 4; k++) {
    const dx = (k - 1.5) * rx * 0.2;
    p.curve([{ x: cx + dx, y: cy + ry * 0.5 }, { x: cx + dx * 1.4 + Math.sin(f * TAU + k) * 2 * S, y: cy + R * 1.5 },
      { x: cx + dx * 0.8 + Math.sin(f * TAU + k + 1) * 3 * S, y: cy + R * 2.8 }], 1.0 * S, 0.4 * S, { mat: 'jellyRing', dome: 0.6 * S, steps: 10, tint: 0.06 });
  }
  return bake(p, cx, cy, { R }, { ...LIGHT, ambient: 0.62 });
}

export function jellyArt(S = 1, frame = 0) {
  const k = `jelly:${S}:${frame}`;
  let v = cache.get(k);
  if (!v) { v = paintJelly(S, frame / JELLY_FRAMES); cache.set(k, v); }
  return v;
}

// ---------------------------------------------------------------------------
// the giants

export const WHALE_FRAMES = 8;
/**
 * A blue whale, which is the largest animal that has ever lived and is
 * therefore the correct thing to put over the head of a crab the size of a
 * dinner plate: long and low, the mouth line running a third of its length,
 * the throat pleated, a dorsal fin so small it is nearly an apology, and
 * flukes wider than the crab is long. Whales beat their tails up and down,
 * so the stroke is a wave going down the back half of the body.
 */
function paintWhale(S, f) {
  const L = 220 * S, H = 40 * S;
  const pad = Math.ceil(16 * S) + 4;
  const p = new Painter(Math.ceil(L + 46 * S) + pad * 2, Math.ceil(H * 2.6) + pad * 2);
  const cy = p.h / 2 - H * 0.1;
  const x0 = pad + 4 * S;
  const ph = f * TAU;
  const bend = (t) => Math.sin(ph - t * 2.2) * H * 0.22 * Math.pow(Math.max(0, (t - 0.45) / 0.55), 1.6);
  const N = 30;
  const spine = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const prof = t < 0.3 ? 0.5 + 0.5 * Math.sin((t / 0.3) * Math.PI / 2) : Math.pow(1 - (t - 0.3) / 0.7, 1.15);
    spine.push({ x: x0 + t * L, y: cy + t * 3 * S + bend(t), r: prof * H * 0.5 + 1.6 * S, t });
  }
  for (let i = 1; i < spine.length; i++) {
    const a = spine[i - 1], b = spine[i];
    p.capsule(a.x, a.y, b.x, b.y, Math.max(0.8, a.r), Math.max(0.8, b.r), { mat: 'whale', dome: Math.max(1, a.r * 0.9), tint: -0.02 });
  }
  // the rostrum: a broad flat head, the lower jaw a little deeper
  p.capsule(x0 + 1 * S, cy + 2 * S, x0 + L * 0.2, cy + 4 * S, H * 0.16, H * 0.4, { mat: 'whale', dome: H * 0.22, tint: 0.03 });
  // the pale throat, pleated
  p.field(x0, cy, x0 + L * 0.46, cy + H * 0.55, (x, y) => {
    const t = (x - x0) / L;
    const s = spine[Math.min(N, Math.round(t * N))];
    const bot = s.y + s.r;
    if (y > bot || y < bot - s.r * 0.55) return null;
    const pleat = Math.floor((y - (bot - s.r * 0.55)) / Math.max(1.5, 1.4 * S)) % 2 === 0;
    return { h: 0, tint: pleat ? -0.08 : 0.06, mat: 'whalePale' };
  }, { mat: 'whalePale', mask: true });
  // the mouth line, running back and down past the eye
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    p.rect(x0 + 2 * S + t * L * 0.29, cy + H * (0.13 + t * 0.07) + Math.sin(t * Math.PI) * 1.5 * S, Math.max(1, S), Math.max(1, S * 0.8),
      { mat: 'whaleDark', dome: 0.5, lift: 2 });
  }
  p.ellipse(x0 + L * 0.21, cy + H * 0.14, Math.max(1, 1.5 * S), Math.max(1, 1.2 * S), { mat: 'eye', dome: 1.4 * S, tint: 0.1, lift: 2 });
  p.capsule(x0 + L * 0.1, cy - H * 0.3, x0 + L * 0.16, cy - H * 0.32, 1.8 * S, 1.2 * S, { mat: 'whaleDark', dome: 1.2, tint: 0.06, lift: 1 });
  // the flipper, long and thin and swept back
  p.curve([{ x: x0 + L * 0.27, y: cy + H * 0.25 }, { x: x0 + L * 0.34, y: cy + H * 0.58 }, { x: x0 + L * 0.42, y: cy + H * 0.76 }],
    3.6 * S, 1.0 * S, { mat: 'whaleDark', dome: 2 * S, steps: 12, tint: -0.04, lift: 3 });
  // the dorsal fin, tiny and three quarters of the way back
  const sd = spine[Math.round(0.76 * N)];
  p.poly([{ x: sd.x - 6 * S, y: sd.y - sd.r + 1 }, { x: sd.x + 3 * S, y: sd.y - sd.r - 6 * S }, { x: sd.x + 5 * S, y: sd.y - sd.r + 1 }],
    { mat: 'whale', dome: 2 * S, feather: 1.5, tint: 0.02 });
  // the flukes, a little turned toward you, rising and falling with the stroke
  const te = spine[N];
  const tilt = Math.cos(ph - 2.2) * 0.5;
  const fl = 34 * S;
  p.poly([{ x: te.x - 8 * S, y: te.y + 1 * S }, { x: te.x + fl * 0.75, y: te.y - fl * (0.55 + tilt * 0.3) }, { x: te.x + fl * 0.9, y: te.y - fl * (0.4 + tilt * 0.3) },
    { x: te.x + 8 * S, y: te.y + 2 * S }], { mat: 'whale', dome: 2.4 * S, feather: 1.6, tint: 0.04 });
  p.poly([{ x: te.x - 8 * S, y: te.y + 1 * S }, { x: te.x + fl * 0.75, y: te.y + fl * (0.5 - tilt * 0.3) }, { x: te.x + fl * 0.9, y: te.y + fl * (0.36 - tilt * 0.3) },
    { x: te.x + 8 * S, y: te.y }], { mat: 'whaleDark', dome: 2.4 * S, feather: 1.6, tint: -0.02 });
  // mottling: pale blotches, which is how one blue whale is told from another
  p.speckle('whale', { density: 0.1, amp: 0.26, seed: 41, size: Math.max(1, Math.round(S * 1.5)) });
  p.grain('whale', { freq: 0.18 / S, amp: 0.14, seed: 7, height: 0.5 });
  p.smoothHeight(1, 0.4);
  return { cv: p.resolve(MATS, { ...LIGHT, ambient: 0.52, outline: 1, outlineColor: '#0a1824' }), ox: Math.round(x0 + L * 0.45), oy: Math.round(cy), L, H };
}

export function whaleArt(S = 1, frame = 0) {
  const k = `whale:${S}:${frame}`;
  let v = cache.get(k);
  if (!v) { v = paintWhale(S, frame / WHALE_FRAMES); cache.set(k, v); }
  return v;
}

export const SHARK_FRAMES = 8;
/**
 * A blacktip reef shark. It is not a whale and must not read as a small one,
 * so everything about it is the opposite shape: a pointed snout, the body
 * deepest at the shoulder and tapering all the way back, a tall raked dorsal,
 * wing-like pectorals, and a tail that is a scythe - and every fin tipped in
 * black, which is the one thing everybody knows about this shark. It swims
 * side to side, so the stroke shows as the tail turning and foreshortening.
 */
function paintShark(S, f) {
  const L = 104 * S, H = 20 * S;
  const pad = Math.ceil(12 * S) + 4;
  const p = new Painter(Math.ceil(L + 36 * S) + pad * 2, Math.ceil(H * 3.2) + pad * 2);
  const cy = p.h / 2 - H * 0.2;
  const x0 = pad + 4 * S;
  const ph = f * TAU;
  const wig = (t) => Math.sin(ph - t * 2.6) * H * 0.08 * Math.pow(Math.max(0, (t - 0.3) / 0.7), 1.4);
  const N = 28;
  const sp = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const taper = t < 0.24 ? Math.pow(t / 0.24, 0.6) : Math.pow(1 - (t - 0.24) / 0.76, 1.2);
    sp.push({ x: x0 + t * L, y: cy + t * 1.6 * S + wig(t), r: taper * H * 0.5 + 0.9 * S });
  }
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    p.capsule(a.x, a.y, b.x, b.y, Math.max(0.8, a.r), Math.max(0.8, b.r), { mat: 'shark', dome: Math.max(1, a.r * 0.95), tint: -0.04 });
  }
  p.capsule(x0 - 3 * S, cy - 0.4 * S, x0 + L * 0.1, cy, H * 0.12, H * 0.34, { mat: 'shark', dome: H * 0.2, tint: 0.02 });
  // white under, with the pale band reaching back along the flank
  p.field(x0 - 4 * S, cy - H, x0 + L, cy + H, (x, y) => {
    const t = clamp01((x - x0) / L);
    const s = sp[Math.round(t * N)];
    const edge = s.y + s.r * (0.12 + Math.sin(t * 3.0) * 0.12) - (t > 0.45 && t < 0.7 ? s.r * 0.25 * Math.sin((t - 0.45) / 0.25 * Math.PI) : 0);
    if (y < edge) return null;
    return { h: 0, tint: 0.1 - clamp01((y - edge) / (H * 0.3)) * 0.06, mat: 'sharkBelly' };
  }, { mat: 'sharkBelly', mask: true });
  for (let i = 0; i < 5; i++) {
    const s = sp[Math.round((0.17 + i * 0.026) * N)];
    p.capsule(s.x, s.y - H * 0.12, s.x - 0.6 * S, s.y + H * 0.16, 0.5 * S, 0.45 * S, { mat: 'shark', mask: true, dome: 0.6, tint: -0.24 });
  }
  p.ellipse(x0 + L * 0.1, cy - H * 0.06, Math.max(0.9, 1.3 * S), Math.max(0.9, 1.1 * S), { mat: 'eye', dome: 1.3 * S, tint: 0.06, lift: 2 });
  // the fins, every one to a point, every one tipped black
  const fin = (pts, mat, tipFrom) => {
    p.poly(pts, { mat, dome: 2 * S, feather: 1, tint: -0.06 });
    if (tipFrom) p.poly(tipFrom, { mat: 'sharkTip', dome: 2 * S, feather: 1, lift: 0.5 });
  };
  const sd = sp[Math.round(0.36 * N)];
  fin([{ x: sd.x - 8 * S, y: sd.y - sd.r + 1 }, { x: sd.x + 6 * S, y: sd.y - sd.r - 20 * S }, { x: sd.x + 8 * S, y: sd.y - sd.r - 19 * S }, { x: sd.x + 10 * S, y: sd.y - sd.r + 1 }],
    'shark', [{ x: sd.x + 3.5 * S, y: sd.y - sd.r - 15 * S }, { x: sd.x + 6 * S, y: sd.y - sd.r - 20 * S }, { x: sd.x + 8 * S, y: sd.y - sd.r - 19 * S }, { x: sd.x + 8.6 * S, y: sd.y - sd.r - 14 * S }]);
  const s2 = sp[Math.round(0.76 * N)];
  fin([{ x: s2.x - 4 * S, y: s2.y - s2.r + 1 }, { x: s2.x + 2 * S, y: s2.y - s2.r - 6 * S }, { x: s2.x + 4 * S, y: s2.y - s2.r + 1 }], 'shark', null);
  const sp1 = sp[Math.round(0.23 * N)];
  fin([{ x: sp1.x - 4 * S, y: sp1.y + sp1.r * 0.5 }, { x: sp1.x + 16 * S, y: sp1.y + sp1.r + 16 * S }, { x: sp1.x + 18 * S, y: sp1.y + sp1.r + 15 * S }, { x: sp1.x + 9 * S, y: sp1.y + sp1.r * 0.4 }],
    'shark', [{ x: sp1.x + 12 * S, y: sp1.y + sp1.r + 11 * S }, { x: sp1.x + 16 * S, y: sp1.y + sp1.r + 16 * S }, { x: sp1.x + 18 * S, y: sp1.y + sp1.r + 15 * S }, { x: sp1.x + 15 * S, y: sp1.y + sp1.r + 10 * S }]);
  const sa = sp[Math.round(0.72 * N)];
  fin([{ x: sa.x - 3 * S, y: sa.y + sa.r - 1 }, { x: sa.x + 4 * S, y: sa.y + sa.r + 6 * S }, { x: sa.x + 5 * S, y: sa.y + sa.r - 1 }], 'shark', null);
  const sv = sp[Math.round(0.56 * N)];
  fin([{ x: sv.x - 3 * S, y: sv.y + sv.r - 1 }, { x: sv.x + 5 * S, y: sv.y + sv.r + 7 * S }, { x: sv.x + 6 * S, y: sv.y + sv.r - 1 }], 'shark', null);
  // the tail: the upper lobe far longer than the lower, turning as it beats
  const te = sp[N];
  const turn = 0.75 + 0.25 * Math.cos(ph - 2.6);
  const flick = Math.sin(ph - 2.8) * 3 * S;
  fin([{ x: te.x - 6 * S, y: te.y + 1 * S }, { x: te.x + 26 * S * turn, y: te.y - 24 * S + flick }, { x: te.x + 28 * S * turn, y: te.y - 21 * S + flick }, { x: te.x + 5 * S, y: te.y + 3 * S }],
    'shark', [{ x: te.x + 20 * S * turn, y: te.y - 18 * S + flick }, { x: te.x + 26 * S * turn, y: te.y - 24 * S + flick }, { x: te.x + 28 * S * turn, y: te.y - 21 * S + flick }, { x: te.x + 22 * S * turn, y: te.y - 14 * S + flick }]);
  fin([{ x: te.x - 5 * S, y: te.y + 1 * S }, { x: te.x + 15 * S * turn, y: te.y + 13 * S + flick * 0.5 }, { x: te.x + 15 * S * turn, y: te.y + 10 * S + flick * 0.5 }, { x: te.x + 3 * S, y: te.y }],
    'shark', [{ x: te.x + 10 * S * turn, y: te.y + 8 * S }, { x: te.x + 15 * S * turn, y: te.y + 13 * S + flick * 0.5 }, { x: te.x + 15 * S * turn, y: te.y + 10 * S + flick * 0.5 }]);
  p.speckle('shark', { density: 0.04, amp: 0.14, seed: 23 });
  p.smoothHeight(1, 0.35);
  return { cv: p.resolve(MATS, { ...LIGHT, ambient: 0.5, outline: 1, outlineColor: '#0c141a' }), ox: Math.round(x0 + L * 0.45), oy: Math.round(cy), L, H };
}

export function sharkArt(S = 1, frame = 0) {
  const k = `shark:${S}:${frame}`;
  let v = cache.get(k);
  if (!v) { v = paintShark(S, frame / SHARK_FRAMES); cache.set(k, v); }
  return v;
}

export const WSHARK_FRAMES = 6;
/**
 * A whale shark, a long way off: the biggest fish there is, slow, with a
 * mouth across the whole front of a flat head and a starfield of pale spots
 * and bars over a dark back. It only ever crosses the far blue.
 */
function paintWhaleShark(f) {
  const S = 1;
  const L = 250, H = 50;
  const pad = 22;
  const p = new Painter(L + 70 + pad * 2, Math.ceil(H * 2.8) + pad * 2);
  const cy = p.h / 2 - 8;
  const x0 = pad + 6;
  const ph = f * TAU;
  const wig = (t) => Math.sin(ph - t * 2.4) * H * 0.06 * Math.pow(Math.max(0, (t - 0.35) / 0.65), 1.4);
  const N = 30;
  const sp = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const prof = t < 0.18 ? 0.62 + 0.38 * Math.sin((t / 0.18) * Math.PI / 2) : Math.pow(1 - (t - 0.18) / 0.82, 1.05);
    sp.push({ x: x0 + t * L, y: cy + t * 4 + wig(t), r: prof * H * 0.5 + 2 });
  }
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i];
    p.capsule(a.x, a.y, b.x, b.y, a.r, b.r, { mat: 'wshark', dome: a.r * 0.85, tint: -0.02 });
  }
  // the flat broad head, the mouth right across the front of it
  p.capsule(x0 - 2, cy + 3, x0 + L * 0.12, cy + 2, H * 0.3, H * 0.44, { mat: 'wshark', dome: H * 0.2, tint: 0.02 });
  p.rect(x0 - 1, cy + H * 0.12, L * 0.07, 2, { mat: 'sharkTip', dome: 0.4, lift: 2 });
  p.field(x0 - 6, cy - H, x0 + L, cy + H, (x, y) => {
    const t = clamp01((x - x0) / L);
    const s = sp[Math.round(t * N)];
    const edge = s.y + s.r * 0.3;
    if (y < edge) return null;
    return { h: 0, tint: 0.08, mat: 'wsharkBelly' };
  }, { mat: 'wsharkBelly', mask: true });
  // the spots and bars, the thing no other animal has
  const rng = mulberry32(777);
  for (let k = 0; k < 150; k++) {
    const t = 0.03 + rng() * 0.9;
    const s = sp[Math.round(t * N)];
    const yy = s.y - s.r * (0.1 + rng() * 0.8);
    const xx = s.x + (rng() - 0.5) * 4;
    const bar = Math.floor(t * 14) % 2 === 0 && rng() < 0.3;
    if (bar) p.capsule(xx, yy, xx + 0.5, yy + s.r * 0.25, 0.6, 0.6, { mat: 'wsharkSpot', mask: true, dome: 0.3, tint: -0.1, lift: 0.4 });
    else p.ellipse(xx, yy, 1.1 + rng() * 0.7, 1.1 + rng() * 0.6, { mat: 'wsharkSpot', mask: true, dome: 0.5, tint: 0.04, lift: 0.4 });
  }
  // ridges along the flank
  for (let r = 0; r < 2; r++) {
    for (let i = 4; i < N - 3; i++) {
      const s = sp[i];
      p.rect(s.x, s.y - s.r * (0.35 + r * 0.25), L / N + 1, 1, { mat: 'wshark', mask: true, dome: 0.5, tint: -0.12, lift: 0.5 });
    }
  }
  for (let i = 0; i < 5; i++) {
    const s = sp[Math.round((0.14 + i * 0.025) * N)];
    p.capsule(s.x, s.y - H * 0.18, s.x - 1, s.y + H * 0.2, 0.7, 0.6, { mat: 'wshark', mask: true, dome: 0.5, tint: -0.22 });
  }
  p.ellipse(x0 + L * 0.075, cy - H * 0.02, 1.4, 1.2, { mat: 'eye', dome: 1.2, tint: 0.06, lift: 2 });
  const sd = sp[Math.round(0.48 * N)];
  p.poly([{ x: sd.x - 14, y: sd.y - sd.r + 2 }, { x: sd.x + 4, y: sd.y - sd.r - 22 }, { x: sd.x + 10, y: sd.y - sd.r + 2 }], { mat: 'wshark', dome: 3, feather: 2, tint: -0.04 });
  const s2 = sp[Math.round(0.8 * N)];
  p.poly([{ x: s2.x - 5, y: s2.y - s2.r + 1 }, { x: s2.x + 3, y: s2.y - s2.r - 8 }, { x: s2.x + 6, y: s2.y - s2.r + 1 }], { mat: 'wshark', dome: 2, feather: 1.5 });
  const sp1 = sp[Math.round(0.24 * N)];
  p.poly([{ x: sp1.x - 6, y: sp1.y + sp1.r * 0.4 }, { x: sp1.x + 22, y: sp1.y + sp1.r + 22 }, { x: sp1.x + 26, y: sp1.y + sp1.r + 19 }, { x: sp1.x + 12, y: sp1.y + sp1.r * 0.3 }],
    { mat: 'wshark', dome: 3, feather: 1.5, tint: -0.1, lift: 2 });
  const te = sp[N];
  const turn = 0.8 + 0.2 * Math.cos(ph - 2.4);
  p.poly([{ x: te.x - 10, y: te.y + 2 }, { x: te.x + 40 * turn, y: te.y - 46 }, { x: te.x + 44 * turn, y: te.y - 40 }, { x: te.x + 8, y: te.y + 4 }], { mat: 'wshark', dome: 3, feather: 2, tint: -0.06 });
  p.poly([{ x: te.x - 8, y: te.y + 2 }, { x: te.x + 28 * turn, y: te.y + 30 }, { x: te.x + 30 * turn, y: te.y + 24 }, { x: te.x + 6, y: te.y }], { mat: 'wshark', dome: 3, feather: 2, tint: -0.1 });
  p.smoothHeight(1, 0.35);
  return { cv: p.resolve(MATS, { ...LIGHT, ambient: 0.52, outline: 1, outlineColor: '#08101a' }), ox: Math.round(x0 + L * 0.45), oy: Math.round(cy), L, H, S };
}

export function whaleSharkArt(frame = 0) {
  const k = `wshark:${frame}`;
  let v = cache.get(k);
  if (!v) { v = paintWhaleShark(frame / WSHARK_FRAMES); cache.set(k, v); }
  return v;
}

/** Old name, kept for anything that still asks for a fish from here. */
export { swimFrame as fishArt } from './fishart.js';
