// CRABDEN - a camp: the things a man puts down where he means to sleep.
//
// Dr. Vess has been out here eleven years and it shows in his kit. The tent is
// canvas bleached to cream with a faded red hem, patched where the wind got
// in; the crates are stencilled and nailed and have had things leant against
// them for a decade; the fire has a proper ring of stones and a bed of ash a
// hand deep. Everything is painted through the same height-field shader as
// the rest of the world (render/pixel.js), so a crate is lit by the same sun
// as the rock it is sitting next to.
//
// Each sprite is baked once. Its anchor (ox, oy) is the point on the ground
// under its middle, and it carries a couple of rows of itself BELOW the
// anchor, so camp.js can sink it into the sand and let the ground cut it -
// nothing out here stands on the surface like a sticker.
//
// The fire is the only thing that moves. Its flames are baked as a short
// seamless loop of frames (see `flameFrames`), and the embers and smoke over
// it are a handful of rectangles drawn by camp.js each frame.

import { Painter, makeCanvas, hash2i, fbmTex } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';
import { registerIcons } from '../ui/iconcore.js';

const LIGHT = { lightX: -0.6, lightY: -0.62, lightZ: 0.42, ambient: 0.4, dither: 0.62 };
const OUTLINE = '#170f09';
const cache = new Map();

function bake(p, extra = {}) {
  p.smoothHeight(1, 0.35);
  return p.resolve(MATERIALS, { ...LIGHT, outline: 1, outlineColor: OUTLINE, ...extra });
}

/** One pixel, straight onto a baked canvas. */
function dot(g, x, y, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); }

/** A pixel line (Bresenham), optionally sagging like a rope. */
function line(g, x0, y0, x1, y1, c, sag = 0) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  let px = null, py = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(lerp(x0, x1, t));
    const y = Math.round(lerp(y0, y1, t) + Math.sin(t * Math.PI) * sag);
    if (x === px && y === py) continue;
    dot(g, x, y, c);
    px = x; py = y;
  }
}

function inTri(px, py, a, b, c) {
  const s = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const P = { x: px, y: py };
  const d1 = s(P, a, b), d2 = s(P, b, c), d3 = s(P, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function inQuad(px, py, a, b, c, d) { return inTri(px, py, a, b, c) || inTri(px, py, a, c, d); }

function sprite(cv, ox, oy, foot, extra = {}) {
  return { cv, ox, oy, w: cv.width, h: cv.height, foot, bury: 2, ...extra };
}

// ---------------------------------------------------------------------------
// the pieces

/**
 * The tent. A ridge tent seen three-quarters on: the gable end facing you
 * with its door tied back, the long roof running away behind it, a ridge
 * pole along the top, and guy lines out to pegs in the sand.
 */
function paintTent() {
  const W = 70, H = 40, G = 35;
  const p = new Painter(W, H);
  const F = { x: 27, y: 6 }, B = { x: 44, y: 9 };
  const L = { x: 8, y: G + 2 }, Rr = { x: 46, y: G + 2 }, BR = { x: 63, y: G + 2 };
  // the long side of the roof, in its own shade
  p.field(F.x, F.y, BR.x, BR.y, (x, y) => {
    if (!inQuad(x, y, F, B, BR, Rr)) return null;
    const v = (y - F.y) / (G - F.y);
    // the canvas sags between the poles and hangs in long folds
    const along = (x - lerp(F.x, Rr.x, v)) / Math.max(1, lerp(B.x - F.x, BR.x - Rr.x, v));
    const fold = Math.sin(along * 9.5 + v * 2.2) * 0.5 + Math.sin(along * 21 + 1.3) * 0.2;
    const sag = Math.sin(clamp01(along) * Math.PI) * 0.6 * (1 - v);
    return { h: 1.4 + fold * 0.9 * v - sag, tint: -0.42 + fold * 0.05 * v - (v > 0.9 ? 0.08 : 0) };
  }, { mat: 'campCanvas' });
  // a patch where the wind once got in
  p.rect(51, 20, 6, 5, { mat: 'khaki', onlyMat: 'campCanvas', tint: -0.08, dome: 0.6 });
  // the gable end
  p.field(L.x, F.y, Rr.x, L.y, (x, y) => {
    if (!inTri(x, y, F, L, Rr)) return null;
    const a = Math.atan2(y - F.y, x - F.x);
    const d = Math.hypot(x - F.x, y - F.y);
    const fold = Math.sin(a * 23 + Math.sin(d * 0.21) * 0.8);
    const v = (y - F.y) / (G - F.y);
    // lit from the left: the face goes from cream at its left edge to a
    // dustier khaki at its right, so it reads as cloth stretched over a frame
    const l = lerp(F.x, L.x, v), r = lerp(F.x, Rr.x, v);
    const u = clamp01((x - l) / Math.max(1, r - l));
    return { h: 2 + fold * 0.9 * clamp01(d / 26),
      tint: 0.08 - u * 0.17 - (v > 0.94 ? 0.1 : 0) + (v < 0.2 ? 0.04 : 0) };
  }, { mat: 'campCanvas' });
  // the faded red hem, round the foot of both faces
  p.field(L.x, G - 4, BR.x, G + 2, (x, y) => {
    const onFront = inTri(x, y, F, L, Rr), onSide = inQuad(x, y, F, B, BR, Rr);
    if (!onFront && !onSide) return null;
    if (y < G - 4 || y > G - 2) return null;
    return { h: 1.6, tint: onSide ? -0.2 : 0 };
  }, { mat: 'campRed' });
  // the doorway, and the dark inside it
  const D = { x: F.x, y: 10 }, DL = { x: 18, y: G + 2 }, DR = { x: 36, y: G + 2 };
  p.field(DL.x, D.y, DR.x, DL.y, (x, y) => {
    if (!inTri(x, y, D, DL, DR)) return null;
    const v = (y - D.y) / (G - D.y);
    // the back wall of the tent, catching a little light through the door
    const back = Math.abs(x - D.x - 1.5) < 2.6 - v * 1.4 && v > 0.25 && v < 0.75 ? 0.12 : 0;
    return { h: 0, tint: -0.66 + v * 0.12 + back };
  }, { mat: 'wood' });
  // his bedroll, just visible on the floor of it
  p.rect(22, G - 3, 11, 3, { mat: 'campWool', tint: -0.38, dome: 1.2 });
  p.ellipse(23.5, G - 3.5, 2.6, 1.6, { mat: 'campCanvas', tint: -0.4, dome: 1 });
  // the flaps, rolled back and tied
  p.capsule(25.5, 11.5, 17.5, G - 1, 1.1, 2.4, { mat: 'campCanvas', tint: 0.1, dome: 1.8 });
  p.capsule(28.5, 11.5, 36.5, G - 1, 1.1, 2.4, { mat: 'campCanvas', tint: -0.08, dome: 1.8 });
  // the ridge pole along the top, and the front pole standing proud of it
  p.capsule(F.x - 1, F.y - 0.5, B.x + 2, B.y - 0.5, 0.9, 0.8, { mat: 'wood', tint: 0.06, dome: 0.9 });
  p.capsule(F.x, F.y + 1, F.x, F.y - 4, 0.8, 0.7, { mat: 'wood', tint: 0.1, dome: 0.8 });
  p.capsule(B.x, B.y, B.x, B.y - 3, 0.7, 0.6, { mat: 'wood', tint: -0.05, dome: 0.7 });
  p.grain('campCanvas', { freq: 0.6, amp: 0.05, seed: 11 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  // guy lines out to pegs
  const rope = '#9c8457', ropeD = '#5f4c2e';
  line(g, F.x - 1, F.y - 2, 2, G - 1, rope, 1.5);
  line(g, B.x + 1, B.y - 2, 68, G - 1, rope, 1.4);
  for (const [x, c] of [[2, rope], [68, rope]]) {
    dot(g, x, G - 2, '#c9ad7c'); dot(g, x, G - 1, ropeD); dot(g, x, G, '#3b2a18');
  }
  // the ties round the rolled flaps
  for (const [x, y] of [[21, 22], [22, 23], [32, 22], [31, 23]]) dot(g, x, y, ropeD);
  // the seams between the canvas panels, and the sun along the ridge
  for (const bx of [13, 41]) {
    for (let k = 4; k < 27; k++) {
      const t = k / 29;
      const x = Math.round(lerp(F.x, bx, t)), y = Math.round(lerp(F.y, G, t));
      if ((k & 3) !== 3) dot(g, x, y, 'rgba(70,56,38,0.35)');
    }
  }
  for (let k = 1; k < 16; k++) {
    const x = Math.round(lerp(F.x + 1, B.x, k / 16)), y = Math.round(lerp(F.y + 1, B.y + 1, k / 16));
    dot(g, x, y, 'rgba(255,248,226,0.45)');
  }
  // stitching round the patch, and a darned tear in the gable
  for (let i = 0; i < 6; i += 2) { dot(g, 51 + i, 20, '#5a4a32'); dot(g, 51 + i, 24, '#5a4a32'); }
  dot(g, 51, 22, '#5a4a32'); dot(g, 56, 22, '#5a4a32');
  for (let i = 0; i < 4; i++) dot(g, 14 + i, 27 - (i & 1), '#7d6c50');
  return sprite(cv, 32, G, 30, { footL: 26, footR: 32 });
}

/** A bedroll: a canvas mat laid flat, a wool blanket over it, a pillow roll. */
function paintBedroll() {
  const W = 36, H = 13, G = 10;
  const p = new Painter(W, H);
  p.field(2, G - 3, 33, G + 2, (x, y) => {
    if (x < 2.5 || x > 33.5) return null;
    const top = G - 2 + (x > 31 ? 1 : 0);
    if (y < top) return null;
    return { h: y < top + 1.2 ? 1.6 : 0.6, tint: y < top + 1.2 ? 0.05 : -0.18 };
  }, { mat: 'canvasBag' });
  // the blanket, thrown back at the head end and rumpled
  p.field(11, G - 6, 33, G, (x, y) => {
    const u = (x - 11) / 22;
    const top = G - 4.5 - Math.sin(u * 7.5) * 0.6 - (u > 0.86 ? (u - 0.86) * 14 : 0) + (u < 0.06 ? 1 : 0);
    if (x < 11 || x > 33 || y < top) return null;
    return { h: 2.2 + Math.sin(u * 7.5) * 0.8, tint: 0 };
  }, { mat: 'campWool' });
  // the folded-back edge, catching the light
  p.capsule(11.5, G - 3.6, 12.2, G - 0.5, 1.1, 1.0, { mat: 'campWool', tint: 0.16, dome: 1.2 });
  // the pillow: a rolled coat
  p.capsule(4.5, G - 3.4, 9.5, G - 3.0, 2.6, 2.4, { mat: 'campCanvas', tint: -0.02, dome: 2.4 });
  p.grain('campWool', { freq: 0.9, amp: 0.06, seed: 3 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  // a plaid: two faded lines each way
  for (let x = 14; x < 33; x += 5) for (let y = G - 4; y < G; y++) {
    if (hash2i(x, y, 4) < 0.85) dot(g, x, y, 'rgba(206,150,92,0.45)');
  }
  for (let x = 12; x < 33; x++) if (hash2i(x, 1, 5) < 0.8) dot(g, x, G - 2, 'rgba(30,8,6,0.35)');
  // a rope tie round the pillow
  dot(g, 7, G - 5, '#5f4c2e'); dot(g, 7, G - 4, '#8a7048'); dot(g, 7, G - 3, '#5f4c2e');
  return sprite(cv, 18, G, 16, { footL: 16, footR: 16 });
}

/** The fire's bed: ash, the back half of the ring, and the logs. */
function paintFireBase() {
  const W = 28, H = 18, G = 13;
  const p = new Painter(W, H);
  const cx = 14;
  p.ellipse(cx, G + 0.2, 10.5, 2.4, { mat: 'campAsh', tint: 0.12, dome: 0.8 });
  // the back stones, half sunk
  const back = [[-10, -1.2, 2.4, 2.1], [-6.5, -2.4, 2.6, 2.2], [-2, -2.9, 2.5, 2], [2.6, -2.8, 2.7, 2.2],
    [7, -2.3, 2.4, 2], [10.3, -1.1, 2.3, 2.1]];
  back.forEach(([dx, dy, rx, ry], i) => p.ellipse(cx + dx, G + dy, rx, ry,
    { mat: i % 3 === 1 ? 'sandstoneBuff' : 'rock', tint: -0.08 + (i % 2) * 0.06, dome: ry * 1.1 }));
  // a teepee of split wood, charred at the top where it burns
  const logs = [[4.5, G + 0.5, cx + 0.5, G - 8.5, 1.4], [23.5, G + 0.5, cx - 0.5, G - 8.5, 1.3],
    [9, G + 1, cx + 1.5, G - 9, 1.1], [19, G + 1, cx - 1.5, G - 8.8, 1.1]];
  for (const [x0, y0, x1, y1, r] of logs) {
    p.capsule(x0, y0, x1, y1, r * 1.15, r * 0.8, { mat: 'wood', tint: 0.12, dome: r * 1.2 });
    const mx = lerp(x0, x1, 0.62), my = lerp(y0, y1, 0.62);
    p.capsule(mx, my, x1, y1, r * 0.95, r * 0.8, { mat: 'wlCharcoal', tint: 0.22, dome: r });
  }
  // one split log lying across the front, its bark side up
  p.capsule(6.5, G - 1.2, 21, G - 2, 1.5, 1.4, { mat: 'wood', tint: 0.18, dome: 1.6 });
  p.capsule(12, G - 1.6, 16, G - 1.8, 1.2, 1.2, { mat: 'wlCharcoal', tint: 0.18, dome: 1.2 });
  p.grain('wood', { freq: 0.8, amp: 0.08, seed: 9 });
  p.speckle('campAsh', { density: 0.18, amp: 0.25, seed: 12 });
  const cv = bake(p);
  return sprite(cv, cx, G, 11, { footL: 11, footR: 11 });
}

/** The front of the ring, drawn over the flames' feet. */
function paintFireFront() {
  const W = 28, H = 9, G = 5;
  const p = new Painter(W, H);
  const cx = 14;
  const front = [[-11, -0.4, 2.4, 2.1], [-7, 0.3, 2.9, 2.4], [-2.2, 0.8, 2.7, 2.2], [2.8, 0.7, 2.9, 2.4],
    [7.4, 0.3, 2.6, 2.2], [11.2, -0.4, 2.3, 2]];
  front.forEach(([dx, dy, rx, ry], i) => p.ellipse(cx + dx, G + dy - 1, rx, ry,
    { mat: i % 3 === 2 ? 'sandstoneBuff' : 'rock', tint: 0.02 + ((i * 7) % 3) * 0.04, dome: ry * 1.2 }));
  p.grain('rock', { freq: 0.9, amp: 0.1, seed: 4 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  // soot on the inner faces
  for (let x = 6; x < 22; x++) if (hash2i(x, 2, 8) < 0.5) dot(g, x, G - 3, 'rgba(18,12,8,0.5)');
  return sprite(cv, cx, G, 11, { footL: 11, footR: 11 });
}

/** A blackened kettle sat on a flat stone at the edge of the ring. */
function paintKettle() {
  const W = 16, H = 14, G = 11;
  const p = new Painter(W, H);
  p.ellipse(8, G - 0.5, 6.5, 2, { mat: 'sandstoneBuff', tint: 0.02, dome: 1.6 });
  p.ellipse(8, G - 4.6, 3.6, 3, { mat: 'metal', tint: -0.28, dome: 3 });
  p.rect(5.5, G - 7.6, 5, 1.2, { mat: 'metal', tint: -0.16, dome: 0.8, lift: 0.5 });
  p.ellipse(8, G - 8.6, 1, 0.8, { mat: 'metal', tint: -0.05, dome: 0.8 });
  p.capsule(4.8, G - 4.4, 1.6, G - 7.4, 0.9, 0.55, { mat: 'metal', tint: -0.22, dome: 0.7 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  for (const [x, y] of [[6, G - 9], [7, G - 10], [8, G - 10], [9, G - 10], [10, G - 9], [11, G - 8]]) dot(g, x, y, '#2b2e33');
  dot(g, 9, G - 5, '#7d8590'); dot(g, 10, G - 4, '#5a616c');
  return sprite(cv, 8, G, 6, { footL: 6, footR: 6, spout: { x: 1.5, y: G - 8 } });
}

/** Two crates and a sack, stencilled and nailed, with a shovel leant on them. */
function paintCrates() {
  const W = 36, H = 28, G = 24;
  const p = new Painter(W, H);
  const crate = (x, y, w, h, mat, tint) => {
    p.rect(x, y, w, h, { mat, tint, dome: 1.8 });
    // corner battens
    p.rect(x, y, 2, h, { mat, tint: tint + 0.1, dome: 1.2, lift: 0.6 });
    p.rect(x + w - 2, y, 2, h, { mat, tint: tint - 0.04, dome: 1.2, lift: 0.6 });
    p.rect(x, y, w, 1.6, { mat, tint: tint + 0.14, dome: 0.8, lift: 0.5 });
  };
  crate(4, G - 13, 19, 14, 'wood', 0.04);
  // the top one is open, and packed with straw
  p.field(8, G - 24, 19, G - 21, (x, y) => (hash2i(x | 0, y | 0, 61) < 0.75 - (G - 21 - y) * 0.2 ? { h: 2.6, tint: hash2i(x | 0, 1, 62) * 0.2 - 0.05 } : null), { mat: 'straw' });
  crate(7, G - 22, 13, 9, 'wood', -0.1);
  // the sack, slumped against them
  p.field(21, G - 12, 34, G + 2, (x, y) => {
    const u = (x - 27.5) / 6.2, v = (y - (G - 4.5)) / 7;
    const d = u * u + v * v * (v < 0 ? 1.2 : 0.6);
    if (d > 1 || y > G + 1.5) return null;
    return { h: 4 * Math.sqrt(1 - d), tint: -0.02 };
  }, { mat: 'canvasBag' });
  p.ellipse(27, G - 11.5, 1.9, 1.4, { mat: 'canvasBag', tint: 0.05, dome: 1.4 });
  p.rect(25.5, G - 10.5, 3.4, 1.2, { mat: 'rope', dome: 0.8, lift: 1 });
  // the shovel
  p.capsule(2.2, G - 2, 9.5, G - 21, 0.7, 0.6, { mat: 'woodPale', tint: 0.08, dome: 0.7, lift: 3 });
  p.poly([{ x: 0, y: G + 1 }, { x: 4.5, y: G + 1 }, { x: 4, y: G - 4 }, { x: 1, y: G - 4 }],
    { mat: 'metal', tint: -0.05, dome: 1, lift: 3 });
  p.grain('wood', { freq: 0.7, amp: 0.07, seed: 21 });
  p.grain('woodPale', { freq: 0.7, amp: 0.07, seed: 22 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  const seam = 'rgba(24,14,8,0.9)', lip = 'rgba(214,190,140,0.35)';
  for (let x = 6; x < 21; x++) { dot(g, x, G - 9, seam); dot(g, x, G - 5, seam); dot(g, x, G - 8, lip); dot(g, x, G - 4, lip); }
  for (let x = 9; x < 18; x++) { dot(g, x, G - 18, seam); dot(g, x, G - 17, lip); }
  // a diagonal brace across the big one
  for (let k = 0; k < 13; k++) { dot(g, 7 + k, G - 2 - Math.round(k * 0.62), 'rgba(24,14,8,0.55)'); dot(g, 7 + k, G - 3 - Math.round(k * 0.62), 'rgba(214,190,140,0.3)'); }
  // nails at the batten ends
  for (const [x, y] of [[4, G - 12], [21, G - 12], [4, G - 1], [21, G - 1], [7, G - 21], [18, G - 21]]) {
    dot(g, x + 1, y, '#d9c79c');
  }
  // the stencil: his survey number, half worn off
  const st = 'rgba(40,24,14,0.75)';
  const glyph = ['x.x.xxx', 'x.x...x', '.x...x.', '.x..x..'];
  glyph.forEach((r, j) => [...r].forEach((c, i) => {
    if (c === 'x' && hash2i(i, j, 30) < 0.85) dot(g, 9 + i, G - 7 + j - 4 + 4, st);
  }));
  for (let i = 0; i < 5; i++) if (hash2i(i, 0, 31) < 0.8) dot(g, 10 + i, G - 19, 'rgba(150,40,24,0.7)');
  return sprite(cv, 17, G, 15, { footL: 16, footR: 17 });
}

/** A banded chest: domed lid, brass corners and a lock plate. */
function paintChest(open = false) {
  const W = 24, H = open ? 24 : 18, G = H - 4;
  const p = new Painter(W, H);
  const x0 = 3, x1 = 21, cx = 12;
  if (open) {
    // the lid thrown back: its inside faces you, in shadow
    p.rect(x0, G - 19, x1 - x0, 9, { mat: 'wood', tint: -0.26, dome: 1.2 });
    p.rect(x0, G - 19, x1 - x0, 1.6, { mat: 'brass', tint: -0.1, dome: 0.7, lift: 0.5 });
    for (const bx of [6, 16]) p.rect(bx, G - 19, 2, 9, { mat: 'brass', tint: -0.16, dome: 0.8, lift: 0.4 });
  }
  // the body
  p.rect(x0, G - 8, x1 - x0, 9, { mat: 'wood', tint: 0, dome: 2 });
  if (!open) {
    // the domed lid
    p.field(x0, G - 14, x1, G - 8, (x, y) => {
      const u = (x - cx) / ((x1 - x0) / 2);
      const top = G - 8 - 5.2 * Math.sqrt(clamp01(1 - u * u * 0.85));
      if (y < top || u < -1 || u > 1) return null;
      const v = (y - top) / Math.max(1, G - 8 - top);
      return { h: 2 + (1 - v) * 2.6, tint: 0.06 };
    }, { mat: 'wood' });
  }
  // brass: the bands over the top, the lip, the corners, the lock
  for (const bx of [6, 16]) p.rect(bx, G - 15, 2, 16, { mat: 'brass', onlyMat: 'wood', tint: 0, dome: 1, lift: 0.6 });
  p.rect(x0, G - 8.6, x1 - x0, 1.6, { mat: 'brass', onlyMat: 'wood', tint: 0.04, dome: 0.8, lift: 0.6 });
  for (const bx of [x0, x1 - 2]) p.rect(bx, G - 1.5, 2, 2.5, { mat: 'brass', onlyMat: 'wood', tint: -0.04, dome: 0.8, lift: 0.5 });
  if (!open) p.rect(cx - 1.5, G - 9, 3, 4, { mat: 'brass', tint: 0.1, dome: 1.2, lift: 1 });
  // a rope handle at the side
  p.capsule(x0 - 1.2, G - 6, x0 - 1.2, G - 3.5, 0.7, 0.7, { mat: 'rope', dome: 0.6 });
  p.grain('wood', { freq: 0.75, amp: 0.08, seed: 14 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  for (let x = x0 + 1; x < x1 - 1; x++) if (x < 6 || (x > 7 && x < 16) || x > 17) dot(g, x, G - 4, 'rgba(28,18,10,0.65)');
  if (!open) { dot(g, cx, G - 7, '#20140a'); dot(g, cx, G - 6, '#20140a'); }
  else {
    // the dark inside, and the things in it catching the light
    for (let x = x0 + 1; x < x1 - 1; x++) { dot(g, x, G - 8, '#1a110a'); dot(g, x, G - 7, '#2b1c10'); }
    for (const [x, c] of [[7, '#c2a271'], [8, '#e6e2d4'], [11, '#9a7a48'], [12, '#bfa374'], [15, '#c97a4a'], [17, '#a8b06a']]) dot(g, x, G - 8, c);
  }
  return sprite(cv, cx, G, 9, { footL: 9, footR: 9 });
}

/** A post with a cairn at its foot and a lantern hung off its arm. */
function paintLanternPost(lit = false) {
  const W = 20, H = 40, G = 36;
  const p = new Painter(W, H);
  p.capsule(6, G + 2, 6.4, G - 31, 1.3, 1.0, { mat: 'wood', tint: -0.04, dome: 1.1 });
  p.capsule(5.6, G - 29.5, 14.5, G - 30, 0.8, 0.7, { mat: 'wood', tint: 0.04, dome: 0.8 });
  p.capsule(6.2, G - 25, 10.5, G - 29.5, 0.55, 0.5, { mat: 'wood', tint: -0.08, dome: 0.5 });
  // the cairn that holds it up
  for (const [x, y, rx, ry, m] of [[3.5, G - 0.6, 2.6, 2, 'rock'], [8.8, G - 0.4, 2.8, 2.1, 'sandstoneBuff'],
    [6.2, G - 2.8, 2.4, 1.9, 'rock'], [10.8, G - 1.2, 1.6, 1.4, 'rock']]) {
    p.ellipse(x, y, rx, ry, { mat: m, tint: 0, dome: ry * 1.2 });
  }
  // the lantern
  const lx = 14, ly = G - 22;
  p.ellipse(lx, ly - 4.6, 2.6, 1.2, { mat: 'metal', tint: 0.02, dome: 1 });
  p.rect(lx - 2, ly - 3.6, 4, 5.5, { mat: lit ? 'glow' : 'amber', tint: lit ? 0.12 : -0.45, dome: 1.6, emissive: lit ? 0.32 : 0 });
  p.rect(lx - 2.6, ly + 1.8, 5.2, 1.4, { mat: 'metal', tint: -0.08, dome: 0.8 });
  p.grain('wood', { freq: 0.8, amp: 0.08, seed: 17 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  // the wire cage, the hook, and the flame
  for (let y = ly - 3; y < ly + 2; y++) { dot(g, lx - 2, y, '#2a2d33'); dot(g, lx + 1, y, '#2a2d33'); }
  dot(g, lx, ly - 7, '#3a3e45'); dot(g, lx, ly - 6, '#3a3e45');
  if (lit) { dot(g, lx - 1, ly - 1, '#fff6c4'); dot(g, lx, ly - 1, '#fffbe8'); dot(g, lx - 1, ly, '#ffd25a'); dot(g, lx, ly, '#ffe28a'); }
  else { dot(g, lx - 1, ly, '#3a2a10'); dot(g, lx, ly, '#5f4413'); }
  return sprite(cv, 6, G, 5, { footL: 5, footR: 6, lamp: { x: lx, y: ly - 1 } });
}

/** A drying rack: two crossed-stick frames, a crossbar, and what is on it. */
function paintRack() {
  const W = 42, H = 30, G = 26;
  const p = new Painter(W, H);
  const stick = (x0, x1, t) => p.capsule(x0, G + 2, x1, G - 22, 0.9, 0.7, { mat: 'twig', tint: t, dome: 0.8 });
  stick(2, 9, -0.06); stick(13, 5, 0.06);
  stick(40, 33, -0.06); stick(29, 37, 0.06);
  p.capsule(4, G - 16.6, 38, G - 16.2, 0.9, 0.9, { mat: 'wood', tint: 0.06, dome: 0.9, lift: 1 });
  // a shirt over the bar
  p.field(9, G - 17, 18.5, G - 5, (x, y) => {
    const hem = G - 6 - Math.sin(x * 1.3) * 1.2 - (x > 16 ? (x - 16) * 1.2 : 0);
    if (y > hem || x < 9.5 || x > 18.5) return null;
    const fold = Math.sin(x * 1.7) * 0.6;
    return { h: 1.4 + fold, tint: -0.02 + fold * 0.06 };
  }, { mat: 'khaki' });
  p.rect(9.5, G - 18, 9, 1.4, { mat: 'khaki', tint: 0.1, dome: 0.8, lift: 2 });
  // strips of something drying
  for (const [x, len] of [[21, 7], [23, 9], [25, 6.5]]) {
    p.capsule(x, G - 16, x + 0.3, G - 16 + len, 0.7, 0.55, { mat: 'campRed', tint: -0.2, dome: 0.5 });
  }
  // a fish by the tail
  p.ellipse(29, G - 9.5, 1.9, 4.4, { mat: 'metal', tint: 0.18, dome: 1.6 });
  p.poly([{ x: 27.5, y: G - 16 }, { x: 30.5, y: G - 16 }, { x: 29, y: G - 13.5 }], { mat: 'metal', tint: 0.05, dome: 0.6 });
  // herbs, hung head down
  for (let i = 0; i < 4; i++) p.capsule(33.5 + i * 0.5, G - 16, 32.6 + i, G - 10.5, 0.5, 0.9, { mat: 'leafDry', tint: -0.04 + i * 0.03, dome: 0.6 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  // lashings where the sticks cross
  for (const x of [6, 7, 34, 35]) dot(g, x, G - 16, '#5f4c2e');
  dot(g, 29, G - 11, '#1a1d22'); // the fish's eye, looking at nothing
  for (let x = 23; x < 30; x++) if ((x & 1) === 0) dot(g, x, G - 16 - 1, 'rgba(255,240,200,0.18)');
  return sprite(cv, 21, G, 19, { footL: 19, footR: 19 });
}

/** A two-wheeled handcart resting on its shafts, its load under a tarp. */
function paintCart() {
  const W = 54, H = 33, G = 29;
  const p = new Painter(W, H);
  // the shafts, down to the sand
  p.capsule(36, G - 13, 53, G + 1, 1.0, 0.8, { mat: 'wood', tint: -0.08, dome: 0.9 });
  // the bed
  p.rect(3, G - 18, 37, 7, { mat: 'wood', tint: 0, dome: 1.6 });
  p.rect(3, G - 18, 37, 1.6, { mat: 'wood', tint: 0.14, dome: 0.8, lift: 0.5 });
  p.capsule(5, G - 11, 6, G + 1, 0.9, 0.8, { mat: 'wood', tint: -0.1, dome: 0.8 });
  // the load, roped down under a tarp
  p.field(4, G - 29, 39, G - 17, (x, y) => {
    const u = (x - 21) / 17.5;
    const top = G - 17 - 10.5 * Math.pow(clamp01(1 - u * u), 0.6) - Math.sin(x * 0.55) * 0.6;
    if (y < top || u < -1 || u > 1) return null;
    const v = (y - top) / Math.max(1, G - 17 - top);
    return { h: 2 + (1 - v) * 4 + Math.sin(x * 0.9) * 0.3, tint: -0.05 + Math.sin(x * 0.9 + y * 0.3) * 0.04 };
  }, { mat: 'campCanvas' });
  p.capsule(12, G - 26.5, 15, G - 17.5, 0.6, 0.6, { mat: 'rope', dome: 0.6, lift: 4 });
  p.capsule(28, G - 26.5, 25, G - 17.5, 0.6, 0.6, { mat: 'rope', dome: 0.6, lift: 4 });
  // a pick handle poking out the back
  p.capsule(4, G - 22, -1, G - 28, 0.7, 0.6, { mat: 'woodPale', tint: 0.04, dome: 0.6 });
  p.capsule(-1, G - 30, 2.5, G - 26, 0.7, 0.6, { mat: 'metal', tint: -0.02, dome: 0.6 });
  // the wheel
  const wx = 21, wy = G - 8.5, R = 8.6;
  p.field(wx - R - 1, wy - R - 1, wx + R + 1, wy + R + 1, (x, y) => {
    const d = Math.hypot(x - wx, y - wy);
    if (d > R) return null;
    if (d > R - 1.1) return { h: 1.4, tint: -0.1, mat: 'metal' };
    if (d > R - 2.6) return { h: 1.8, tint: 0.02 };
    const a = Math.atan2(y - wy, x - wx);
    const sp = Math.abs(Math.sin(a * 4 + 0.3));
    if (d < 2.2) return { h: 2.2, tint: 0, mat: 'metal' };
    if (sp < 0.2 * (6 / Math.max(2, d))) return { h: 1.2, tint: -0.06 };
    return null;
  }, { mat: 'wood' });
  p.grain('wood', { freq: 0.7, amp: 0.08, seed: 33 });
  p.grain('campCanvas', { freq: 0.6, amp: 0.05, seed: 34 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  for (let x = 4; x < 39; x++) if (x < wx - R || x > wx + R) dot(g, x, G - 14, 'rgba(28,18,10,0.6)');
  return sprite(cv, 25, G, 24, { footL: 20, footR: 28 });
}

/** A torch: a stake with a tarred rag wrapped round its head. */
function paintTorch() {
  const W = 9, H = 28, G = 24;
  const p = new Painter(W, H);
  p.capsule(4.5, G + 2, 4.5, G - 16, 0.95, 0.75, { mat: 'twig', tint: 0.02, dome: 0.8 });
  p.ellipse(4.5, G - 18, 1.9, 2.8, { mat: 'cloth', tint: -0.42, dome: 1.6 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  dot(g, 3, G - 19, '#5f4c2e'); dot(g, 5, G - 17, '#5f4c2e'); dot(g, 4, G - 15, '#5f4c2e');
  return sprite(cv, 4, G, 3, { footL: 3, footR: 3, flame: { x: 4.5, y: G - 20 } });
}

/** A log to sit on, end grain showing. */
function paintLog() {
  const W = 22, H = 10, G = 8;
  const p = new Painter(W, H);
  p.capsule(4, G - 3, 18, G - 3.2, 3.1, 3.0, { mat: 'wood', tint: -0.02, dome: 3 });
  p.ridges('wood', { angle: Math.PI / 2, freq: 1.6, amp: 0.08, height: 0.4, seed: 5, warp: 1 });
  p.ellipse(3.6, G - 3, 1.7, 3, { mat: 'woodPale', tint: 0.08, dome: 0.8 });
  const cv = bake(p);
  const g = cv.getContext('2d');
  dot(g, 3, G - 3, '#6b5a40'); dot(g, 4, G - 4, '#8a7656'); dot(g, 3, G - 5, '#8a7656');
  return sprite(cv, 11, G, 9, { footL: 9, footR: 9 });
}

const PAINT = {
  tent: paintTent, bedroll: paintBedroll, crates: paintCrates, rack: paintRack, cart: paintCart,
  torch: paintTorch, log: paintLog, kettle: paintKettle,
  fireBase: paintFireBase, fireFront: paintFireFront,
  chest: () => paintChest(false), chestOpen: () => paintChest(true),
  lantern: () => paintLanternPost(false), lanternLit: () => paintLanternPost(true),
};

/** A camp sprite by name, baked the first time it is asked for. */
export function campArt(name) {
  let a = cache.get(name);
  if (a) return a;
  const fn = PAINT[name];
  if (!fn) return null;
  a = fn();
  cache.set(name, a);
  return a;
}

// ---------------------------------------------------------------------------
// fire

const FIRE_RAMP = [
  [0.86, '#fffbe6'], [0.72, '#ffe58a'], [0.56, '#ffbe45'], [0.42, '#ff8a2a'],
  [0.29, '#e5571c'], [0.17, '#a8301a'],
];

/**
 * A seamless loop of flame frames, `w` by `h`, rising out of a bed of coals.
 * The noise climbs one tile a loop and the last frames cross-fade into the
 * first, so the loop has no seam to catch the eye.
 */
export function flameFrames(w = 16, h = 24, n = 10, seed = 1, coals = true) {
  const key = `flame|${w}|${h}|${n}|${seed}|${coals}`;
  let out = cache.get(key);
  if (out) return out;
  out = [];
  const cx = (w - 1) / 2;
  const rise = h * 0.9;
  const sample = (x, y, t) => {
    const v = 1 - (y + 0.5) / h;                 // 0 at the bottom, 1 at the top
    const half = (w * 0.47) * Math.pow(1 - v, 0.5) + 0.5;
    const sway = Math.sin(t * TAU + v * 2.6) * v * v * 2.2;
    const dx = Math.abs(x + 0.5 - cx - sway) / half;
    // low horizontal frequency splits it into tongues; the second octave
    // climbs faster and licks the edges
    const n1 = fbmTex(x * 0.42, (y + t * rise) * 0.22, seed, 3);
    const n2 = fbmTex(x * 0.8 + 7, (y + t * rise * 1.7) * 0.45, seed + 9, 2);
    return (1 - Math.pow(dx, 1.4)) * 1.0 - v * 0.78 + (n1 - 0.5) * 1.15 + (n2 - 0.5) * 0.45 + 0.2;
  };
  for (let f = 0; f < n; f++) {
    const cv = makeCanvas(w, h);
    const g = cv.getContext('2d');
    const t = f / n;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // cross-fade the noise one loop apart, so frame n wraps onto frame 0
        const I = lerp(sample(x, y, t), sample(x, y, t - 1), t);
        let col = null;
        for (const [th, c] of FIRE_RAMP) if (I >= th) { col = c; break; }
        if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
      }
    }
    if (coals) {
      // the coals at its feet, breathing
      for (let x = 1; x < w - 1; x++) {
        const k = hash2i(x, f, seed + 40);
        const edge = Math.abs(x - cx) / (w / 2);
        if (edge > 0.92) continue;
        g.fillStyle = k > 0.7 ? '#ffd36a' : k > 0.35 ? '#ff7a26' : '#b8361a';
        g.fillRect(x, h - 1, 1, 1);
        if (k > 0.55 && edge < 0.7) { g.fillStyle = k > 0.85 ? '#ffe9a0' : '#ff9a3a'; g.fillRect(x, h - 2, 1, 1); }
      }
    }
    out.push(cv);
  }
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------------------
// icons for the kit you can put down (16x16, iconcore's grid format)

registerIcons({
  campfire: {
    pal: 'k#120a06 1#fffbe6 2#ffe58a 3#ffbe45 4#ff8a2a 5#e5571c 6#a8301a a#cec0ae b#9d8974 c#6b5849 d#3a2f26 w#a48657 x#5b4326 y#2f2113',
    rows: [
      '................',
      '.......k........',
      '......k5k.......',
      '......k4k..k....',
      '.....k434kk5k...',
      '....k43234k4k...',
      '....k4322345k...',
      '...k543212345k..',
      '...k542111245k..',
      '..kwk5421124kwk.',
      '..kxwk54445kwxk.',
      '.kkkxwkkkkkwxkkk',
      'kabakxykkkkyxkbak',
      'kbcdbkkabbakkbcdk',
      '.kkkkkkkkkkkkkkk.',
      '................',
    ],
  },
  bedroll: {
    pal: 'k#120a06 a#e4dcc0 b#bcae8c c#87775b r#bd7050 s#94402e t#64211c u#341010 p#c3bb8d q#968959 o#645738',
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.kkkk...........',
      'kaabbk.kkkkkkkk.',
      'kabbckkrrrsrrrsk',
      'kbbcckrsssssstsk',
      'kbcckkssttsstttk',
      '.kkkpkttuttuttuk',
      'kppppqqqqqqqqqqok',
      'kqqqqoooooooooook',
      '.kkkkkkkkkkkkkkk.',
      '................',
      '................',
    ],
  },
  tent: {
    pal: 'k#120a06 1#f1ead4 2#d2c6a6 3#a39373 4#87775b 5#685a44 d#1c130c e#3b2a18 r#ad5a3a s#7e3222 w#a48657',
    rows: [
      '.......w........',
      '.......kk.......',
      '......k12kk.....',
      '......k122k4k...',
      '.....k12d22k44k.',
      '.....k2dd22k445k',
      '....k12ddd2k445k',
      '....k2dddd22k45k',
      '...k12ddedd2k455k',
      '...k2ddeeedd2k45k',
      '..k12deeeeed2k45k',
      '..k2ddeeeeedd2k5k',
      '.krrrdeeeeedrrrsk',
      '.kssseeeeeeesssk.',
      'kkkkkkkkkkkkkkkk.',
      '................',
    ],
  },
  chest: {
    pal: 'k#120a06 1#bfa374 2#a48657 3#8a6c42 4#725632 5#5b4326 y#f7df7f g#d4a72d h#946917 d#20140a',
    rows: [
      '................',
      '................',
      '................',
      '....kkkkkkkk....',
      '...k1gg112gg1k..',
      '..k12gg222gg23k.',
      '..k22gg333gg34k.',
      '..kyyyyyyyyyyyk.',
      '..k33gg3yy3gg5k.',
      '..k33gg3dh3gg5k.',
      '..k44gg444gg45k.',
      '..k44gg444gg45k.',
      '..kgg5gg55ggg5k.',
      '..kkkkkkkkkkkkk.',
      '................',
      '................',
    ],
  },
  torch: {
    pal: 'k#120a06 1#fffbe6 2#ffe58a 3#ffbe45 4#ff8a2a 5#e5571c c#3c2418 d#573528 w#8b7762 x#62513f y#3c3025',
    rows: [
      '.......k........',
      '......k5k.......',
      '......k4k.......',
      '.....k434k......',
      '.....k323k......',
      '....k53214k.....',
      '....k42124k.....',
      '....kkcddkk.....',
      '....kcdcdck.....',
      '....kdcdcdk.....',
      '.....kwxyk......',
      '.....kwxk.......',
      '.....kwxk.......',
      '.....kwxk.......',
      '.....kwyk.......',
      '......kk........',
    ],
  },
});
