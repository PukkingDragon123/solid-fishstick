// CRABDEN - pictures of things, for the book.
//
// Every page of the encyclopedia has a picture on it, and the picture is the
// thing itself as the world draws it: the creature is posed by its own rig
// (a real Creature, standing on a flat line in an empty world), the plant is
// the plant at full growth, the fish is the fish. So when a creature is
// redrawn, its page is redrawn with it, and the book can never disagree with
// the desert about what anything looks like.

import { makeCanvas } from '../render/pixel.js';
import { Creature } from '../entities/creature.js';
import { buildPlant } from '../art/floraart.js';
import { fishFrame } from '../art/fishart.js';

const cache = new Map();

/** The bounding box of the opaque pixels in a canvas. */
function opaqueBox(cv) {
  const g = cv.getContext('2d');
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  try {
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] < 8) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  } catch { /* tainted: just use the whole thing */ }
  return x1 < 0 ? { x: 0, y: 0, w: cv.width, h: cv.height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Crop a canvas to what is in it, with a pixel of air round the edge. */
function crop(cv) {
  const b = opaqueBox(cv);
  const out = makeCanvas(b.w + 2, b.h + 2);
  out.getContext('2d').drawImage(cv, b.x, b.y, b.w, b.h, 1, 1, b.w, b.h);
  return out;
}

/** A stand-in world: flat ground, no weather, nothing watching. */
const STUB = {
  terrain: { surfaceY: () => 0, deform() {} },
  weather: { shadowAlpha: 0, daylight: 1 },
  time: 0,
  cam: { isVisible: () => false, zoom: 1 },
  crab: null,
};

/** A creature standing still, facing right, as the world would draw it. */
export function creaturePortrait(def) {
  const key = 'c:' + def.id;
  let cv = cache.get(key);
  if (cv) return cv;
  const W = 220, H = 150;
  const big = makeCanvas(W, H);
  const g = big.getContext('2d');
  g.imageSmoothingEnabled = false;
  try {
    const c = new Creature(STUB, def, 0);
    c.faceT = 1; c.facing = 1;
    c.vx = 0;
    const gy = 112;
    const cam = { zoom: 1, worldToScreen: (x, y) => ({ x: x + W / 2, y: y + gy }), isVisible: () => true, bounds: () => ({ x0: -999, x1: 999 }) };
    if (c.flies) c.y = -40;
    c.draw(g, cam);
  } catch (e) {
    // a species the stand-in world cannot pose still gets its head
    try {
      const { buildCreature } = STUB.fauna || {};
      if (buildCreature) g.drawImage(buildCreature(def).head.cv, W / 2, H / 2);
    } catch { /* nothing to draw */ }
  }
  cv = crop(big);
  cache.set(key, cv);
  return cv;
}

/** A plant at full growth. */
export function plantPortrait(def) {
  const key = 'p:' + def.id;
  let cv = cache.get(key);
  if (cv) return cv;
  try {
    const art = buildPlant(def, 3, 0, 1);
    cv = crop(art.cv);
  } catch { cv = makeCanvas(2, 2); }
  cache.set(key, cv);
  return cv;
}

/** A fish, side on. */
export function fishPortrait(def) {
  const key = 'f:' + def.id;
  let cv = cache.get(key);
  if (cv) return cv;
  try { cv = crop(fishFrame(def.id, 0, 1).cv); } catch { cv = makeCanvas(2, 2); }
  cache.set(key, cv);
  return cv;
}

/**
 * Draw a portrait canvas fitted into a box, whole-pixel scaled where it fits
 * and shrunk smoothly-free where it does not. `shadow` draws it as a dark
 * silhouette, for a page you have not filled in.
 */
export function drawPortrait(ctx, cv, x, y, w, h, opts = {}) {
  if (!cv) return;
  let k = Math.min(w / cv.width, h / cv.height);
  if (k >= 1) k = Math.floor(k);
  k = Math.min(k, opts.max || 4);
  const dw = Math.max(1, Math.round(cv.width * k)), dh = Math.max(1, Math.round(cv.height * k));
  const dx = Math.round(x + (w - dw) / 2), dy = Math.round(y + (h - dh) / (opts.bottom ? 1 : 2));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opts.shadow) {
    const s = shadowOf(cv);
    ctx.drawImage(s, dx, dy, dw, dh);
  } else ctx.drawImage(cv, dx, dy, dw, dh);
  ctx.restore();
}

const shadows = new WeakMap();
function shadowOf(cv) {
  let s = shadows.get(cv);
  if (s) return s;
  s = makeCanvas(cv.width, cv.height);
  const g = s.getContext('2d');
  g.drawImage(cv, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#4a3a26';
  g.fillRect(0, 0, s.width, s.height);
  shadows.set(cv, s);
  return s;
}
