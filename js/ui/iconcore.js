// CRABDEN - painted icons.
//
// Every icon in the interface is a small hand-placed sprite: a grid of
// palette characters, a dark line round it, three or four tones of each
// material and a glint where the light catches it - the way the objects in a
// brass-bezelled inventory slot are drawn, rather than a one-colour stencil
// tinted to taste.
//
// The art lives in data files (iconart.js, iconart_items.js) that register
// themselves here; this file only turns a grid into a cached canvas and puts
// it on the screen. Variants are baked from the same grid:
//   'gray'   - a disabled control, desaturated and dimmed
//   'shadow' - a solid silhouette, for an entry in the book you have not found
//   'white'  - a flash, for the frame something is picked up

import { makeCanvas } from '../render/pixel.js';

const REG = new Map();
const cache = new Map();

/**
 * Add icons. `defs` is { name: { pal, rows } } where `pal` is a string of
 * space-separated `c#rrggbb` pairs (one character, then its colour) and
 * `rows` is an array of equal-length strings; '.' is transparent.
 */
export function registerIcons(defs) {
  for (const [name, def] of Object.entries(defs)) {
    REG.set(name, def);
    for (const k of [...cache.keys()]) if (k.startsWith(name + '|')) cache.delete(k);
  }
}

/** Names that point at another icon, so older call sites keep working. */
const ALIAS = new Map();
export function aliasIcons(map) { for (const [a, b] of Object.entries(map)) ALIAS.set(a, b); }

function resolve(name) {
  if (REG.has(name)) return name;
  const a = ALIAS.get(name);
  return a && REG.has(a) ? a : null;
}

export function hasIcon(name) { return !!resolve(name); }
export function iconNames() { return [...REG.keys()]; }

function parsePal(str) {
  const pal = {};
  for (const tok of String(str).trim().split(/\s+/)) {
    if (tok.length < 3) continue;
    pal[tok[0]] = tok.slice(1);
  }
  return pal;
}

const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The icon as a canvas, `scale` whole pixels per art pixel. Cached. */
export function iconCanvas(name, scale = 1, variant = '') {
  const id = resolve(name);
  if (!id) return null;
  const s = Math.max(1, Math.round(scale));
  const key = `${id}|${s}|${variant}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const def = REG.get(id);
  const pal = def._pal || (def._pal = parsePal(def.pal));
  const rows = def.rows;
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  cv = makeCanvas(W * s, H * s);
  const g = cv.getContext('2d');
  const img = g.createImageData(W * s, H * s);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const row = rows[y];
    for (let x = 0; x < W; x++) {
      const ch = row[x];
      if (!ch || ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      let [r, gg, b] = hex(col);
      if (variant === 'gray') {
        const l = r * 0.3 + gg * 0.55 + b * 0.15;
        r = gg = b = l * 0.62 + 18;
      } else if (variant === 'shadow') {
        // a silhouette: the outline stays, everything inside it goes to one
        // dark tone with a faint rim so the shape still reads as a shape
        const l = r * 0.3 + gg * 0.55 + b * 0.15;
        const v = l < 40 ? 14 : 44;
        r = v; gg = v - 4; b = v - 8;
      } else if (variant === 'white') {
        r = gg = b = 255;
      }
      for (let yy = 0; yy < s; yy++) {
        for (let xx = 0; xx < s; xx++) {
          const o = ((y * s + yy) * W * s + (x * s + xx)) * 4;
          d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}

/** The size of an icon in art pixels. */
export function iconSize(name) {
  const id = resolve(name);
  if (!id) return { w: 0, h: 0 };
  const rows = REG.get(id).rows;
  return { w: Math.max(...rows.map((r) => r.length)), h: rows.length };
}

/**
 * Draw an icon centred on (cx, cy). Returns false if there is no such icon,
 * so a caller can fall back on something else rather than draw nothing.
 */
export function drawIcon(ctx, name, cx, cy, scale = 1, opts = {}) {
  const cv = iconCanvas(name, scale, opts.variant || (opts.gray ? 'gray' : ''));
  if (!cv) return false;
  const a = opts.alpha;
  if (a !== undefined) { ctx.save(); ctx.globalAlpha *= a; }
  ctx.drawImage(cv, Math.round(cx - cv.width / 2), Math.round(cy - cv.height / 2));
  if (a !== undefined) ctx.restore();
  return true;
}
