// CRABDEN - the animals.
//
// A creature is a body plan, a spine and a handful of decisions. The spine is
// a curve with a radius profile; the painter walks it and solves a real tube,
// so a monitor is long and low with a heavy tail root, a beetle is a lacquered
// dome on a waist, and a jerboa is a ball of fur on two springs - and all of
// them are the same few dozen lines of description in data/fauna.js.
//
// What a thousand years of drought did to these animals is mostly in the
// silhouette, so that is where the effort goes. Every species is a familiar
// body pushed somewhere strange - a gecko that keeps its water in a glass
// tail, a lizard wearing a crown, a beetle carrying its own lantern on a
// stalk - and it has to read as itself at forty pixels long.
//
// The shading is deliberately quiet: broad form in a few confident tones, one
// sun for the whole animal whichever way each part is turned, a hard dark
// line round the edge, and pattern laid down as clean shapes of a second
// colour rather than as noise. Eyes are big and wet and always carry a
// highlight, because an animal you are meant to want to keep has to look
// back at you.
//
// Everything is painted facing RIGHT.

import { Painter, makeCanvas, bezier } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { clamp, clamp01, lerp, hexToRgb } from '../lib/math.js';

// ---------------------------------------------------------------------------
// colour
//
// Ramps are mixed in OKLab between three anchors - a shadow, the animal's own
// colour and a highlight - so a ramp can cool into its shadows and warm into
// its lights without a hand-picked list of eight hexes for every animal.

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toLab(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function fromLab(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  const ch = (v) => Math.round(clamp01(toGam(clamp01(v))) * 255);
  const r = ch(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = ch(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = ch(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Eight steps: shadow -> the animal's own colour -> highlight. */
function ramp(dark, mid, light, at = 0.55) {
  const A = toLab(dark), B = toLab(mid), C = toLab(light);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const lo = t <= at;
    const k = lo ? t / at : (t - at) / (1 - at);
    const P = lo ? A : B, Q = lo ? B : C;
    out.push(fromLab(lerp(P[0], Q[0], k), lerp(P[1], Q[1], k), lerp(P[2], Q[2], k)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// materials
//
// The creature palette lives here rather than in lib/palette.js because these
// are the only things in the game that are allowed to be this colourful. They
// are registered into MATERIALS as well, so anything that looks a creature
// material up by name finds it.

const FZ = {};
function fz(name, dark, mid, light, props = {}) {
  const r = ramp(dark, mid, light, props.at ?? 0.55);
  FZ[name] = {
    ramp: r, diffuse: 0.72, rim: 0.2, ao: 0.07, spec: 0, shine: 26,
    normalScale: 0.6, bounce: 0.09, wrap: 0.2, outline: r[0], ...props,
  };
}

// pale, neutral and dark
fz('fzIvory', '#3d2c24', '#e6d6b6', '#fffcf2', { spec: 0.18 });
fz('fzCream', '#4b3024', '#efd2a2', '#fff7e4');
fz('fzBone', '#35302e', '#d2c9b6', '#fbf8ef', { spec: 0.12 });
fz('fzChalk', '#2b3542', '#dde4ea', '#ffffff', { spec: 0.2 });
fz('fzAsh', '#16151b', '#8b8990', '#f1eee8');
fz('fzSlate', '#0d121b', '#566a80', '#d4e3f0', { spec: 0.15 });
fz('fzCharcoal', '#09080b', '#38353f', '#aaa4b4');
fz('fzInk', '#04050b', '#1d2437', '#7c8bb0', { spec: 0.45, shine: 30 });
fz('fzCocoa', '#160a08', '#5b3322', '#bb8765');
fz('fzUmber', '#0f0806', '#4a3226', '#b49078');
fz('fzSoot', '#08070a', '#2e2a33', '#958d9e');
fz('fzBasalt', '#07070a', '#33333b', '#a2a2b0', { normalScale: 0.75 });
fz('fzHorn', '#120d0a', '#5d4c3c', '#d2c2a8', { spec: 0.25 });
// warm
fz('fzRust', '#290c07', '#c25a2f', '#ffdcb6');
fz('fzBrick', '#240906', '#9a3a26', '#f4b690');
fz('fzOrange', '#3a1004', '#f36c1e', '#fff1ba');
fz('fzScarlet', '#2c0508', '#d6262e', '#ffc4aa');
fz('fzGold', '#391c02', '#e9a61d', '#fff7c6', { spec: 0.3 });
fz('fzAmber', '#4a1d00', '#ff9b1b', '#fff3b2');
fz('fzApricot', '#391a0b', '#eba66a', '#fff3df');
fz('fzPeach', '#3d2220', '#efbf9a', '#fff7ee');
fz('fzCopper', '#1e0703', '#b4521d', '#ffd68c', { spec: 0.85, shine: 16, rim: 0.3 });
fz('fzBeak', '#3a2404', '#efbe3e', '#fff8d6', { spec: 0.3 });
// cool
fz('fzTurq', '#03212a', '#1ea6a9', '#c6fff5', { spec: 0.3 });
fz('fzTeal', '#03171c', '#15717b', '#a0e9e1');
fz('fzCobalt', '#060a2b', '#2b5bd2', '#d1e7ff', { spec: 0.3 });
fz('fzSky', '#0a2440', '#4ba1e2', '#e2f7ff');
fz('fzViolet', '#0f0821', '#5c4099', '#ddcdff');
fz('fzLilac', '#2a1e3e', '#b8a3e2', '#f7f1ff');
fz('fzIndigo', '#05061d', '#2c3290', '#b9c5ff');
fz('fzSapphire', '#030a29', '#2050d9', '#c0e3ff', { spec: 0.7, shine: 30 });
fz('fzEmerald', '#02170c', '#15a15b', '#c9ffd9', { spec: 0.7, shine: 30 });
fz('fzVerdigris', '#031f19', '#30a68b', '#d1fff1');
fz('fzSage', '#0c1f13', '#5f9b63', '#e9f9cd');
fz('fzOlive', '#131908', '#6f7d35', '#e9efb1');
fz('fzJade', '#0a2116', '#79cd99', '#f3fff3', { spec: 0.25 });
fz('fzGunmetal', '#070a0f', '#47576b', '#e5eff9', { spec: 0.75, shine: 20, rim: 0.3 });
// pink and purple
fz('fzPink', '#390623', '#ef5098', '#ffe3f1');
fz('fzFlamingo', '#3d0a1e', '#f66e9f', '#ffe7f0');
fz('fzRose', '#390c14', '#da596b', '#ffd7d1', { spec: 0.2 });
fz('fzEarPink', '#4a1626', '#f08fa5', '#fff1f5', { translucent: 0.4 });
fz('fzMagenta', '#290221', '#d1259b', '#ffd1f1');
fz('fzCoral', '#390c08', '#f3714f', '#ffe3cd');
// clear things
fz('fzGlass', '#0b2931', '#6ccbd3', '#f3ffff', { spec: 0.95, shine: 40, rim: 0.35, diffuse: 0.5 });
fz('fzWater', '#05303e', '#2a99b9', '#c0f5ff', { spec: 0.6, shine: 30, diffuse: 0.55 });
fz('fzWingGlass', '#2c3a40', '#b4cfd4', '#ffffff', { spec: 0.6, diffuse: 0.45, rim: 0.3 });
fz('fzSmoke', '#110d1b', '#4c4067', '#c9bde7', { spec: 0.4 });
fz('fzMirror', '#131723', '#9ba9be', '#ffffff', { spec: 1.0, shine: 12, rim: 0.4 });
fz('fzCrystal', '#2a0c2a', '#e98bc9', '#fff3fd', { spec: 0.9, shine: 22, rim: 0.4 });
// glow: bright ramps that hardly care about the sun, pushed up by emissive
fz('fzGlowCyan', '#0b5869', '#3ff0ff', '#ffffff', { glow: true });
fz('fzGlowLime', '#2a5908', '#b7ff4b', '#ffffff', { glow: true });
fz('fzGlowGold', '#694100', '#ffd33b', '#ffffff', { glow: true });
fz('fzGlowEmber', '#591400', '#ff7b1b', '#fff7c9', { glow: true });
fz('fzGlowRed', '#490408', '#ff3b3b', '#ffd9c9', { glow: true });
fz('fzGlowViolet', '#2a0a59', '#b06bff', '#ffffff', { glow: true });
// eyes and mouths: placed, not lit
fz('fzEyeRing', '#0a0609', '#0a0609', '#0a0609', { flat: 0 });
fz('fzPupil', '#050407', '#050407', '#050407', { flat: 0 });
fz('fzShine', '#ffffff', '#ffffff', '#ffffff', { flat: 7 });
fz('fzEyeBlack', '#040308', '#241d33', '#9a8fb3', { spec: 1.0, shine: 18, diffuse: 0.5 });
fz('fzMouth', '#1c0807', '#1c0807', '#1c0807', { flat: 0 });

Object.assign(MATERIALS, FZ);

const matSpec = (name) => FZ[name] || MATERIALS[name] || MATERIALS.default;
const rgbCache = new Map();
function rgbOf(name) {
  let r = rgbCache.get(name);
  if (!r) { r = matSpec(name).ramp.map(hexToRgb); rgbCache.set(name, r); }
  return r;
}

// ---------------------------------------------------------------------------
// light
//
// One sun for the whole animal. Each part is painted in its own frame and
// then turned by creature.js - a tail by half a turn, a wing back along the
// flank, a leg straight down - so the sun is turned into each part's frame
// before it is lit, and the highlight on a tail is on the same side as the
// highlight on the back it hangs off.

const SUN = { x: -0.6, y: -0.68, z: 0.42 };
const AMBIENT = 0.3;
const DITHER = 0.2;
const OUTLINE = '#170e0b';
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
  .map((r) => r.map((v) => (v + 0.5) / 16));

/**
 * Shade a painter to a canvas.
 * o.rot      - how creature.js will turn this part (so the light can be turned back)
 * o.far      - the far side of the animal: a step darker
 * o.outline  - the line colour
 * o.cut      - [{x, y, r}] where the outline is left off (a tail root inside the body)
 */
function shade(p, o = {}) {
  const { w, h } = p;
  const n = w * h;
  const cv = makeCanvas(w, h);
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const mat = p.mat, hgt = p.hgt;

  const rot = o.rot || 0;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  let Lx = SUN.x * cr + SUN.y * sr, Ly = -SUN.x * sr + SUN.y * cr, Lz = SUN.z;
  let l = Math.hypot(Lx, Ly, Lz); Lx /= l; Ly /= l; Lz /= l;
  const Lxy = Math.hypot(Lx, Ly) || 1;
  let Hx = Lx, Hy = Ly, Hz = Lz + 1;
  l = Math.hypot(Hx, Hy, Hz); Hx /= l; Hy /= l; Hz /= l;
  const Dx = sr, Dy = cr;   // the ground, in this part's own frame
  const amb = (o.ambient ?? AMBIENT) - (o.far ? 0.1 : 0);
  const dither = o.dither ?? DITHER;
  const specs = p.mats.map((nm) => (nm ? matSpec(nm) : null));
  const rgbs = p.mats.map((nm) => (nm ? rgbOf(nm) : null));

  // local mean height, for the crease term
  const blur = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mat[i]) continue;
      let s = 0, c = 0;
      for (let dy = -2; dy <= 2; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (!mat[j]) continue;
          s += hgt[j]; c++;
        }
      }
      blur[i] = c ? s / c : hgt[i];
    }
  }
  const hAt = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0;
    const i = y * w + x;
    return mat[i] ? hgt[i] : 0;
  };

  const kOf = new Int8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mat[i];
      if (!m) continue;
      const M = specs[m], R = rgbs[m], nR = R.length;
      let k;
      if (M.flat !== undefined) k = M.flat;
      else {
        const ns = M.normalScale ?? 0.6;
        const dhx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5;
        const dhy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5;
        let nx = -dhx * ns, ny = -dhy * ns, nz = 1;
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        const ndl = nx * Lx + ny * Ly + nz * Lz;
        const wrap = M.wrap ?? 0.2;
        const diff = clamp01((ndl + wrap) / (1 + wrap));
        let v;
        if (M.glow) {
          v = 0.4 + diff * 0.28 + p.emis[i] * 0.7 + p.tint[i];
        } else {
          const nxy = Math.hypot(nx, ny);
          const toward = nxy > 1e-4 ? clamp01((nx * Lx + ny * Ly) / (nxy * Lxy)) : 0;
          const rim = Math.pow(1 - nz, 1.5) * toward * (M.rim ?? 0.2);
          const down = clamp01(nx * Dx + ny * Dy);
          const bounce = down * (1 - diff) * (M.bounce ?? 0.09);
          const spc = M.spec ? Math.pow(clamp01(nx * Hx + ny * Hy + nz * Hz), M.shine ?? 26) * M.spec : 0;
          const cav = clamp((hgt[i] - blur[i]) * (M.ao ?? 0.07), -0.3, 0.2);
          const back = M.translucent ? Math.max(0, -(nx * Lx + ny * Ly)) * M.translucent * 0.5 : 0;
          v = amb + diff * (M.diffuse ?? 0.72) + rim + bounce + spc + cav + back + p.tint[i] + p.emis[i];
          if (o.far) v *= 0.86;
        }
        v = clamp01(v);
        k = Math.round(v * (nR - 1) + (BAYER[y & 3][x & 3] - 0.5) * dither);
      }
      k = clamp(k, 0, nR - 1);
      kOf[i] = k;
      const c = R[k];
      const o4 = i * 4;
      d[o4] = c[0]; d[o4 + 1] = c[1]; d[o4 + 2] = c[2]; d[o4 + 3] = 255;
    }
  }

  // contours: where a layer that asked for one lies over something beneath
  if (p.layer) {
    const lay = p.layer, ring = p.ring;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mat[i]) continue;
        const L0 = lay[i];
        let hit = false;
        if (x > 0 && mat[i - 1] && lay[i - 1] > L0 && ring[lay[i - 1]]) hit = true;
        else if (x < w - 1 && mat[i + 1] && lay[i + 1] > L0 && ring[lay[i + 1]]) hit = true;
        else if (y > 0 && mat[i - w] && lay[i - w] > L0 && ring[lay[i - w]]) hit = true;
        else if (y < h - 1 && mat[i + w] && lay[i + w] > L0 && ring[lay[i + w]]) hit = true;
        if (!hit) continue;
        const M = specs[mat[i]];
        if (M.flat !== undefined) continue;
        const c = rgbs[mat[i]][M.glow ? 1 : 0];
        const o4 = i * 4;
        d[o4] = c[0]; d[o4 + 1] = c[1]; d[o4 + 2] = c[2];
      }
    }
  }

  // the outline: a hard dark line on the empty pixels round the sprite
  const outC = hexToRgb(o.outline || OUTLINE);
  const cut = o.cut || [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mat[i]) continue;
      let src = 0;
      if (x > 0 && mat[i - 1]) src = i - 1;
      else if (x < w - 1 && mat[i + 1]) src = i + 1;
      else if (y > 0 && mat[i - w]) src = i - w;
      else if (y < h - 1 && mat[i + w]) src = i + w;
      if (!src && !(x > 0 && mat[i - 1])) continue;
      let skip = false;
      for (const c of cut) if ((x + 0.5 - c.x) ** 2 + (y + 0.5 - c.y) ** 2 < c.r * c.r) { skip = true; break; }
      if (skip) continue;
      const M = specs[mat[src]];
      if (M.noOutline) continue;
      const o4 = i * 4;
      d[o4] = outC[0]; d[o4 + 1] = outC[1]; d[o4 + 2] = outC[2]; d[o4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// the painter, with layers and body coordinates

class CP extends Painter {
  constructor(w, h) {
    super(w, h);
    const n = this.w * this.h;
    this.layer = new Uint16Array(n);
    this.U = new Float32Array(n);     // along the body, px from the tail end
    this.V = new Float32Array(n);     // across: -1 the back, +1 the belly
    this.W = new Float32Array(n);     // across, in px
    this.uv = new Uint8Array(n);
    this.uvLen = 1;
    this.lay = 1;
    this.ring = [false, false];
  }

  /** Start a new layer; `contour` puts a dark line where it overlaps what is already there. */
  next(contour = true) { this.lay++; this.ring[this.lay] = contour; return this; }

  _put(x, y, o, h, extraTint = 0) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    const had = this.mat[i];
    if (o.under && had) return;
    if ((o.onlyOver || o.mask) && !had) return;
    if (o._only !== undefined && had !== o._only) return;
    const hh = h + (o.lift || 0);
    if (o.keepHigher && had && this.hgt[i] > hh) return;
    this.mat[i] = o._m;
    this.cov[i] = 1;
    this.hgt[i] = o.addHeight ? this.hgt[i] + hh : o.setHeight ? hh : Math.max(had ? this.hgt[i] : 0, hh);
    this.tint[i] = (o.tint || 0) + extraTint;
    this.emis[i] = o.emissive || 0;
    if (!(o.mask || o._only !== undefined) || o.relayer) this.layer[i] = o.under ? 0 : this.lay;
  }

  /** One pixel, exactly. */
  px(x, y, mat, o = {}) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (o.mask && !this.mat[i]) return;
    this.mat[i] = this._mid(mat);
    this.cov[i] = 1;
    if (o.h !== undefined) this.hgt[i] = o.h;
    this.tint[i] = o.tint || 0;
    this.emis[i] = o.emissive || 0;
    if (!o.keepLayer) this.layer[i] = this.lay;
  }
}

/**
 * Turn everything painted so far about (ox, oy), before it is lit. Used for a
 * folded wing: creature.js hangs every wing off the shoulder at the same angle,
 * and a wing at rest should lie along the flank, not across it.
 */
function turn(p, ang, ox, oy) {
  if (!ang) return p;
  const q = new CP(p.w, p.h);
  q.mats = p.mats; q._matIndex = p._matIndex; q.ring = p.ring; q.lay = p.lay; q.uvLen = p.uvLen;
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let y = 0; y < q.h; y++) {
    for (let x = 0; x < q.w; x++) {
      const dx = x + 0.5 - ox, dy = y + 0.5 - oy;
      const sx = Math.floor(ox + dx * c + dy * s), sy = Math.floor(oy - dx * s + dy * c);
      if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) continue;
      const i = y * q.w + x, j = sy * p.w + sx;
      if (!p.mat[j]) continue;
      q.mat[i] = p.mat[j]; q.hgt[i] = p.hgt[j]; q.tint[i] = p.tint[j]; q.emis[i] = p.emis[j];
      q.layer[i] = p.layer[j]; q.cov[i] = 1;
    }
  }
  return q;
}

/** A crisp one-pixel line, laid over pixels that are already there. */
function line(p, a, b, mat, o = {}) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
  const mi = p._mid(mat);
  const only = o.only ? p._matIndex.get(o.only) : undefined;
  for (let k = 0; k <= n; k++) {
    const x = Math.floor(lerp(a.x, b.x, k / n)), y = Math.floor(lerp(a.y, b.y, k / n));
    if (x < 0 || y < 0 || x >= p.w || y >= p.h) continue;
    const i = y * p.w + x;
    if (!p.mat[i] && !o.free) continue;
    if (only !== undefined && p.mat[i] !== only) continue;
    p.mat[i] = mi; p.cov[i] = 1;
    if (o.tint !== undefined) p.tint[i] = o.tint;
    p.emis[i] = o.emissive || 0;
    if (o.free) { p.hgt[i] = o.h ?? p.hgt[i]; p.layer[i] = p.lay; }
  }
}

/** A small clean disc: spots, photophores, nostrils. */
function blob(p, x, y, r, mat, o = {}) {
  if (r < 0.8) { p.px(x, y, mat, { mask: o.mask ?? true, keepLayer: true, emissive: o.emissive, tint: o.tint, h: o.h }); return; }
  p.ellipse(Math.floor(x) + 0.5, Math.floor(y) + 0.5, r, r, {
    mat, mask: o.mask ?? true, dome: o.dome ?? r * 0.4, tint: o.tint, emissive: o.emissive, onlyMat: o.onlyMat,
  });
}

// ---------------------------------------------------------------------------
// spine + tube

function spine(pts, radius, n = 34) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const q = bezier(pts, t);
    out.push({ x: q.x, y: q.y, t, r: Math.max(0.01, radius(t)) });
  }
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(n, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    out[i].tx = dx / l; out[i].ty = dy / l;
    out[i].nx = -dy / l; out[i].ny = dx / l;
    if (i) acc += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
    out[i].s = acc;
  }
  return out;
}

/** An interpolated station at fraction t along a spine. */
function at(sp, t) {
  const f = clamp01(t) * (sp.length - 1);
  const i = Math.min(sp.length - 2, Math.floor(f));
  const k = f - i;
  const a = sp[i], b = sp[i + 1];
  const tx = lerp(a.tx, b.tx, k), ty = lerp(a.ty, b.ty, k);
  const l = Math.hypot(tx, ty) || 1;
  return {
    x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k), t: lerp(a.t, b.t, k),
    tx: tx / l, ty: ty / l, nx: -ty / l, ny: tx / l,
  };
}

/** A point on the skin: v = -1 is the top of the back, +1 the bottom of the belly. */
function surf(s, v, sq = 1) {
  const k = s.r * (Math.abs(s.ny) * sq + Math.abs(s.nx));
  return { x: s.x + s.nx * v * k, y: s.y + s.ny * v * k };
}

/** Smooth radius profile through evenly spaced control values. */
function prof(vals) {
  const n = vals.length - 1;
  return (t) => {
    const f = clamp01(t) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
    const a = vals[Math.max(0, i - 1)], b = vals[i], c = vals[i + 1], d = vals[Math.min(n, i + 2)];
    return 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  };
}

/** Paint a spine as a solid body, recording body coordinates for pattern. */
function tube(p, sp, o = {}) {
  const sq = o.squash ?? 1;
  const dome = o.dome ?? 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sp) {
    x0 = Math.min(x0, s.x - s.r - 2); x1 = Math.max(x1, s.x + s.r + 2);
    y0 = Math.min(y0, s.y - s.r * sq - 2); y1 = Math.max(y1, s.y + s.r * sq + 2);
  }
  if (o.uv) p.uvLen = sp[sp.length - 1].s || 1;
  p.field(x0, y0, x1, y1, (px, py) => {
    let best = Infinity, bs = null;
    for (const s of sp) {
      const dx = px - s.x, dy = (py - s.y) / sq;
      const k = (dx * dx + dy * dy) / (s.r * s.r);
      if (k < best) { best = k; bs = s; }
    }
    if (!bs || best > 1) return null;
    const dz = Math.sqrt(1 - best);
    if (o.uv) {
      const i = Math.floor(py) * p.w + Math.floor(px);
      const ax = px - bs.x, ay = py - bs.y;
      const across = ax * bs.nx + ay * bs.ny;
      const k = bs.r * (Math.abs(bs.ny) * sq + Math.abs(bs.nx)) || 1;
      const f = o.flipV ? -1 : 1;
      p.U[i] = bs.s + ax * bs.tx + ay * bs.ty;
      p.V[i] = clamp(across / k, -1, 1) * f;
      p.W[i] = across * f;
      p.uv[i] = 1;
    }
    return { h: dz * bs.r * dome, tint: o.tint || 0 };
  }, { mat: o.mat, mask: o.mask, under: o.under, emissive: o.emissive });
  return p;
}

/** Body coordinates for an ellipse-built part (a skull, a segment). */
function ellipseUV(p, mat, cx, cy, rx, ry, rot = 0) {
  const m = p._matIndex.get(mat);
  if (!m) return;
  const c = Math.cos(-rot), s = Math.sin(-rot);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (p.mat[i] !== m || p.uv[i]) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const lx = dx * c - dy * s, ly = dx * s + dy * c;
      p.U[i] = lx + rx; p.V[i] = clamp(ly / ry, -1, 1); p.W[i] = ly; p.uv[i] = 1;
    }
  }
  p.uvLen = Math.max(p.uvLen, rx * 2);
}

// ---------------------------------------------------------------------------
// pattern: clean shapes of a second colour, laid by body coordinates

/** Switch `base` to `to` wherever test(t, v, u, w) says so. */
function zone(p, base, to, test) {
  const bases = (Array.isArray(base) ? base : [base]).map((b) => p._matIndex.get(b)).filter(Boolean);
  if (!bases.length) return;
  const m = p._mid(to);
  for (let i = 0; i < p.mat.length; i++) {
    if (!p.uv[i] || !bases.includes(p.mat[i])) continue;
    if (test(p.U[i] / p.uvLen, p.V[i], p.U[i], p.W[i])) p.mat[i] = m;
  }
}

/**
 * The species' colour scheme over one part: a pale belly, a dark back,
 * crossbands, lengthwise stripes, spots. `part` is 'body', 'tail', 'neck' or
 * 'head', and each scheme can say which parts it is on.
 */
function scheme(p, D, base, part) {
  const on = (c) => c && (!c.parts || c.parts.includes(part));
  const B = D.belly;
  if (on(B)) {
    zone(p, base, B.mat, (t, v, u) => v > (B.edge ?? 0.3) + (B.wave || 0) * Math.sin(u * (B.freq ?? 0.7)));
  }
  const K = D.back;
  if (on(K)) {
    zone(p, base, K.mat, (t, v, u) => v < (K.edge ?? -0.3) + (K.wave || 0) * Math.sin(u * (K.freq ?? 0.6) + 1.3));
  }
  const all = [base, B?.mat, K?.mat].filter(Boolean);
  for (const st of [].concat(D.stripe || [])) {
    if (!on(st)) continue;
    zone(p, st.over ? all : base, st.mat, (t, v) => Math.abs(v - (st.v ?? 0)) < (st.w ?? 0.15)
      && t >= (st.from ?? 0) && t <= (st.to ?? 1));
  }
  for (const bd of [].concat(D.bands || [])) {
    if (!on(bd)) continue;
    const n = bd.n || 5, from = bd.from ?? 0.1, to = bd.to ?? 0.9, wd = bd.w ?? 0.4;
    zone(p, bd.under ? all : all.filter((m) => m !== B?.mat), bd.mat, (t, v) => {
      if (v > (bd.vmax ?? 0.7) || v < (bd.vmin ?? -2)) return false;
      const s = ((t - from) / (to - from)) * n + (bd.slant || 0) * v + (bd.bow || 0) * v * v;
      if (s < 0 || s >= n) return false;
      return s - Math.floor(s) < wd;
    });
  }
  for (const sp of [].concat(D.spots || [])) {
    if (!on(sp)) continue;
    const cell = sp.cell || 4, r = sp.r || 1.2, seed = sp.seed || 7;
    zone(p, sp.under ? all : all.filter((m) => m !== B?.mat), sp.mat, (t, v, u, w) => {
      if (v < (sp.vmin ?? -1) || v > (sp.vmax ?? 0.6) || t < (sp.from ?? 0) || t > (sp.to ?? 1)) return false;
      const iu = Math.floor(u / cell);
      const off = (iu & 1) ? cell * 0.5 : 0;
      const iw = Math.floor((w + off) / cell);
      const j = hash(iu, iw, seed);
      if (j > (sp.density ?? 0.8)) return false;
      const cu = (iu + 0.5 + (hash(iu, iw, seed + 1) - 0.5) * (sp.jitter ?? 0.4)) * cell;
      const cw = (iw + 0.5) * cell - off;
      const rr = r * (0.8 + hash(iu, iw, seed + 2) * 0.4);
      return (u - cu) ** 2 + (w - cw) ** 2 < rr * rr;
    });
  }
}

function hash(a, b, s) {
  let h = (s | 0) ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Photophores: a row of glowing dots along the flank. The light is made, not
 * reflected, so it is painted bright and pushed up past whatever the sun is
 * doing to the skin around it.
 */
function photophores(p, sp, c, S, sq) {
  const n = c.n || 5;
  for (let k = 0; k < n; k++) {
    const t = lerp(c.from ?? 0.15, c.to ?? 0.85, n > 1 ? k / (n - 1) : 0.5);
    const s = at(sp, t);
    const v = (c.v ?? 0.2) + (c.zig ? (k & 1 ? c.zig : -c.zig) : 0);
    const q = surf(s, v, sq);
    const r = (c.r ?? 0.7) * (c.grow ? lerp(0.7, 1.2, Math.sin(Math.PI * k / Math.max(1, n - 1))) : 1);
    blob(p, q.x, q.y, r * Math.max(1, S), c.mat || 'fzGlowCyan', { emissive: c.glow ?? 0.35, dome: 0.4 });
  }
}

/** Soft surface relief so a big plain flank does not read as plastic. */
function relief(p, mat, amp, freq = 0.35, seed = 3) {
  const m = p._matIndex.get(mat);
  if (!m) return;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = y * p.w + x;
      if (p.mat[i] !== m) continue;
      const n = Math.sin(x * freq + Math.sin(y * freq * 1.3 + seed) * 1.7) * Math.cos(y * freq * 0.9 - seed);
      p.hgt[i] += n * amp;
    }
  }
}

// ---------------------------------------------------------------------------
// eyes

/**
 * An eye, placed pixel by pixel. At this size a shaded sphere turns to mush,
 * so the eye is a stamp: a dark lid line, a lit iris, a pupil set a little
 * forward (it is looking where it is going), and a highlight that is always
 * pure white - the one pixel that makes the animal look back at you.
 */
function eyeStamp(p, ex, ey, r, D, o = {}) {
  const kind = o.kind || D.eyeKind || 'round';
  const iris = o.iris || D.iris || 'fzGold';
  const dia = Math.max(2, Math.round(r * 2));
  const x0 = Math.round(ex - dia / 2), y0 = Math.round(ey - dia / 2);
  const c = dia / 2;
  p.next(false);
  const H = o.h ?? 0;
  if (dia <= 2) {
    p.px(x0, y0, 'fzShine');
    p.px(x0 + 1, y0, 'fzEyeBlack', { h: H + 1 });
    p.px(x0, y0 + 1, 'fzEyeBlack', { h: H + 1 });
    p.px(x0 + 1, y0 + 1, 'fzEyeBlack', { h: H + 0.5 });
    return;
  }
  const inside = (ix, iy) => {
    const dx = ix + 0.5 - c, dy = iy + 0.5 - c;
    return dx * dx + dy * dy <= c * c + 0.15;
  };
  const dark = kind === 'bead' || kind === 'black' || dia <= 3;
  const pcx = c + dia * (o.look ?? 0.1), pcy = c + dia * 0.04;
  for (let iy = 0; iy < dia; iy++) {
    for (let ix = 0; ix < dia; ix++) {
      if (!inside(ix, iy)) continue;
      const edge = !inside(ix - 1, iy) || !inside(ix + 1, iy) || !inside(ix, iy - 1) || !inside(ix, iy + 1);
      const dx = ix + 0.5 - c, dy = iy + 0.5 - c;
      const dome = Math.sqrt(Math.max(0, c * c - dx * dx - dy * dy)) * 1.3;
      let m;
      if (dark) m = edge && dia >= 5 ? 'fzEyeRing' : 'fzEyeBlack';
      else {
        m = edge ? 'fzEyeRing' : iris;
        const qx = ix + 0.5 - pcx, qy = iy + 0.5 - pcy;
        if (kind === 'slit') {
          if (Math.abs(qx) < Math.max(0.5, dia * 0.1) && Math.abs(qy) < c * 0.75) m = 'fzPupil';
        } else if (kind !== 'compound') {
          const pr = dia * (o.pupil ?? D.pupil ?? 0.24);
          if (qx * qx + qy * qy < pr * pr) m = 'fzPupil';
        }
      }
      p.px(x0 + ix, y0 + iy, m, { h: H + dome });
    }
  }
  // the highlight, toward the sun
  const s = dia >= 7 ? 2 : 1;
  const hx = x0 + Math.max(dark ? 0 : 1, Math.floor(c - dia * 0.25) - (s - 1));
  const hy = y0 + Math.max(dark ? 0 : 1, Math.floor(c - dia * 0.28) - (s - 1));
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) p.px(hx + i, hy + j, 'fzShine');
  if (dia >= 6 && kind !== 'compound') p.px(x0 + Math.floor(c + dia * 0.2), y0 + Math.floor(c + dia * 0.2), 'fzShine');
}

// ---------------------------------------------------------------------------
// heads

/** creature.js tips a head on a neck down by this; the paint tips it back. */
const NECK_HEAD = 0.42;
const HEAD_KIND = { sprawler: 'wedge', serpent: 'snake', beast: 'round', bird: 'bird', insect: 'bug', arachnid: 'bug', myriapod: 'bug' };

function featureReach(D, S) {
  let m = 0;
  for (const k of ['ears', 'horns', 'crest', 'frill', 'antennae', 'lure', 'beak', 'jaws', 'chelae', 'dewlap', 'stalks', 'plume']) {
    const f = D[k];
    if (!f) continue;
    m = Math.max(m, (f.len ?? f.size ?? 0) * S * (k === 'chelae' ? 1.6 : 1));
  }
  return m;
}

function paintHead(D, S, necked) {
  const kind = D.headKind || HEAD_KIND[D.plan] || 'round';
  const L = D.headL * S, H = D.headH * S;
  const reach = featureReach(D, S);
  const pad = Math.ceil(Math.max(L, H) * 0.6 + reach * 1.15) + 5;
  const p = new CP(Math.ceil(L * 1.2) + pad * 2, Math.ceil(H * 1.2) + pad * 2);
  const hx = pad + L * 0.5, hy = Math.floor(p.h / 2) + 0.5;
  const tilt = (necked ? -NECK_HEAD : 0) + (D.headPitch || 0);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = (x, y) => ({ x: hx + x * ct - y * st, y: hy + x * st + y * ct });
  const hm = D.headMat || D.mat;
  const E = (x, y, rx, ry, o) => { const q = P(x, y); p.ellipse(q.x, q.y, rx, ry, { ...o, rot: tilt + (o.rot || 0) }); };
  const C = (x0, y0, x1, y1, r0, r1, o) => { const a = P(x0, y0), b = P(x1, y1); p.capsule(a.x, a.y, b.x, b.y, r0, r1, o); };
  const Q = (pts, r0, r1, o) => p.curve(pts.map(([x, y]) => P(x, y)), r0, r1, { steps: 10, ...o });
  const G = (pts, o) => p.poly(pts.map(([x, y]) => P(x, y)), o);
  const Ln = (x0, y0, x1, y1, m, o) => line(p, P(x0, y0), P(x1, y1), m, o);

  const eyeX = (D.eyeX ?? (kind === 'bug' ? 0.2 : kind === 'round' ? 0.12 : 0.08)) * L;
  const eyeY = -(D.eyeY ?? (kind === 'bug' ? 0.1 : 0.12)) * H;
  const eyeR = (D.eyeR ?? 2) * S;

  // -- the far side, behind everything -------------------------------------
  p.next(false);
  const far = { tint: -0.2 };
  if (D.ears) ears(true);
  if (D.horns) horns(true);
  if (D.antennae) antennae(true);
  if (D.chelae) chelae(true);
  if (D.jaws) jaws(true);
  if (D.stalks) stalks(true);

  // -- the skull ------------------------------------------------------------
  p.next(true);
  if (kind === 'wedge' || kind === 'snake') {
    const snake = kind === 'snake';
    const sp = spine([P(-0.5 * L, 0.02 * H), P(0.08 * L, -0.08 * H), P(0.56 * L, (D.snoutDrop ?? 0.12) * H)],
      (t) => H * 0.5 * (snake ? 1.08 - 0.62 * t ** 1.1 : 1.0 - (D.snoutTaper ?? 0.52) * t ** 1.25), 18);
    tube(p, sp, { mat: hm, squash: D.headSquash ?? (snake ? 0.82 : 0.92), uv: true });
    // the brow: a hard ridge over the eye
    E(eyeX - 0.04 * L, eyeY - 0.16 * H, 0.26 * L, 0.14 * H, { mat: hm, dome: H * 0.34, tint: 0.03 });
  } else if (kind === 'round') {
    E(0, 0, 0.46 * L, 0.47 * H, { mat: hm, dome: H * 0.5 });
    const ml = (D.muzzle ?? 4) * S;
    if (ml > 0) {
      E(0.3 * L + ml * 0.4, 0.16 * H, ml * 0.55 + 0.1 * L, 0.29 * H, { mat: D.muzzleMat || hm, dome: H * 0.3, tint: 0.02 });
    }
    ellipseUV(p, hm, P(0, 0).x, P(0, 0).y, 0.5 * L + ml, 0.47 * H, tilt);
  } else if (kind === 'bird') {
    E(0, 0, 0.5 * L, 0.48 * H, { mat: hm, dome: H * 0.5 });
    ellipseUV(p, hm, P(0, 0).x, P(0, 0).y, 0.5 * L, 0.48 * H, tilt);
  } else {
    // a hard head capsule
    E(0.04 * L, 0, 0.5 * L, 0.46 * H, { mat: hm, dome: H * 0.5 });
    ellipseUV(p, hm, P(0, 0).x, P(0, 0).y, 0.5 * L, 0.46 * H, tilt);
  }
  scheme(p, D, hm, 'head');
  if (D.mask) {
    const mk = D.mask;
    zone(p, [hm, D.belly?.mat, D.back?.mat].filter(Boolean), mk.mat, (t, v, u, w) => {
      if (mk.kind === 'band') return Math.abs(w - eyeY * 0.9) < (mk.w ?? 0.22) * H && u > L * 0.15;
      if (mk.kind === 'cap') return v < (mk.edge ?? -0.2);
      if (mk.kind === 'face') return u > (mk.from ?? 0.45) * L * 1.1;
      if (mk.kind === 'chin') return v > (mk.edge ?? 0.2);
      return false;
    });
  }

  // -- frills, dewlaps and crests that hang behind the skull ---------------
  if (D.frill) frill();
  if (D.dewlap) dewlap();
  if (D.crest && D.crest.behind) crest();

  // -- mouth and nose -------------------------------------------------------
  if (kind === 'wedge' || kind === 'snake') {
    Ln(-0.12 * L, 0.26 * H, 0.5 * L, 0.2 * H, 'fzMouth', { only: undefined });
    blob(p, P(0.48 * L, -0.02 * H).x, P(0.48 * L, -0.02 * H).y, 0.5, 'fzMouth');
    if (D.pits) {
      // heat pits along the lip: they see you in the dark
      const n = D.pits.n || 3;
      for (let k = 0; k < n; k++) {
        const q = P(lerp(0.42, 0.05, k / Math.max(1, n - 1)) * L, 0.12 * H);
        p.px(q.x, q.y, D.pits.mat || 'fzGlowRed', { mask: true, keepLayer: true, emissive: 0.3 });
      }
    }
  } else if (kind === 'round') {
    const ml = (D.muzzle ?? 4) * S;
    const nq = P(0.3 * L + ml * 0.9, 0.06 * H);
    blob(p, nq.x, nq.y, Math.max(0.7, 0.13 * H), D.noseMat || 'fzSoot', { dome: 1 });
    Ln(0.3 * L + ml * 0.35, 0.36 * H, 0.3 * L + ml * 0.85, 0.3 * H, 'fzMouth');
  }

  // -- the near side ---------------------------------------------------------
  p.next(true);
  if (D.horns) horns(false);
  if (D.crest && !D.crest.behind) crest();
  if (D.beak) beak();
  if (D.jaws) jaws(false);
  if (D.ears) ears(false);
  if (D.lure) lure();
  if (D.antennae) antennae(false);
  if (D.chelae) chelae(false);
  if (D.stalks) stalks(false);

  // -- eyes ----------------------------------------------------------------
  if (!D.stalks) {
    if (D.turret) turret();
    else {
      const q = P(eyeX, eyeY);
      eyeStamp(p, q.x, q.y, eyeR, D, { h: H * 0.5 });
    }
    if (D.extraEyes) {
      // a second row of smaller eyes, for the animals that look at everything
      const n = D.extraEyes;
      for (let k = 0; k < n; k++) {
        const q = P(eyeX - (k + 1) * eyeR * 1.15, eyeY - eyeR * 0.6 + (k & 1) * eyeR * 0.5);
        eyeStamp(p, q.x, q.y, Math.max(0.9, eyeR * 0.5), D, { kind: 'bead', h: H * 0.5 });
      }
    }
  }
  if (D.brow) {
    // a lid line over the eye says more about temper than anything else
    const q0 = P(eyeX - eyeR * 1.1, eyeY - eyeR * (D.brow === 'angry' ? 1.25 : 1.05));
    const q1 = P(eyeX + eyeR * 1.0, eyeY - eyeR * (D.brow === 'angry' ? 0.65 : 1.05));
    line(p, q0, q1, 'fzEyeRing');
  }

  p.smoothHeight(1, 0.25);
  const piv = P(-(D.pivot ?? 0.34) * L, 0.06 * H);
  return {
    cv: shade(p, { rot: necked ? NECK_HEAD : 0, outline: D.outline }),
    ox: piv.x, oy: piv.y, L, H,
  };

  // -- the furniture ---------------------------------------------------------

  function ears(isFar) {
    const e = D.ears;
    const pairs = e.pairs || 1;
    for (let k = pairs - 1; k >= 0; k--) {
      const len = e.len * S * (k ? 0.62 : 1), wd = (e.w ?? 0.36) * len;
      const bx = (e.x ?? -0.1) * L - k * 0.36 * L - (isFar ? 1.2 * S : 0);
      const by = -0.34 * H + k * 0.1 * H;
      const a = -Math.PI / 2 - (e.tilt ?? 0.3) - k * 0.6 - (isFar ? 0.12 : 0);
      const tip = [bx + Math.cos(a) * len, by + Math.sin(a) * len];
      const mid = [bx + Math.cos(a + 0.12) * len * 0.55, by + Math.sin(a + 0.12) * len * 0.55];
      const o = { mat: e.mat || hm, dome: wd * 0.6, ...(isFar ? far : {}) };
      Q([[bx, by], mid, tip], wd, Math.max(0.6, wd * 0.18), o);
      if (!isFar && e.inner) {
        const tip2 = [bx + Math.cos(a) * len * 0.82, by + Math.sin(a) * len * 0.82];
        Q([[bx + 0.3, by - 0.5], mid, tip2], wd * 0.5, 0.5, { mat: e.inner, mask: true, dome: 0, tint: 0.04 });
      }
      if (e.tip && !isFar) {
        const tq = P(tip[0], tip[1]);
        p.ellipse(tq.x, tq.y, Math.max(0.9, wd * 0.35), Math.max(1.1, len * 0.14), { mat: e.tip, mask: true, rot: a + tilt, dome: 0 });
      }
    }
  }

  function horns(isFar) {
    const hn = D.horns;
    const len = hn.len * S, w = (hn.w ?? 0.9) * S;
    const m = hn.mat || 'fzIvory';
    const o = { mat: m, dome: w, ...(isFar ? far : {}) };
    const sx = isFar ? -1.3 * S : 0;
    if (hn.kind === 'crown') {
      // a halo of horns round the back of the skull
      const n = hn.n || 7;
      if (isFar) return;
      for (let k = 0; k < n; k++) {
        const a = lerp(-Math.PI * 0.98, -Math.PI * 0.28, k / (n - 1));
        const l = len * (0.62 + 0.38 * Math.sin(Math.PI * k / (n - 1)));
        const bx = -0.18 * L + Math.cos(a) * 0.34 * L, by = Math.sin(a) * 0.4 * H;
        Q([[bx, by], [bx + Math.cos(a - 0.15) * l * 0.6, by + Math.sin(a - 0.15) * l * 0.6], [bx + Math.cos(a - 0.3) * l, by + Math.sin(a - 0.3) * l]],
          w * 1.1, 0.5, { ...o, tint: (k & 1) ? 0.04 : -0.04 });
        if (hn.tip) { const tq = P(bx + Math.cos(a - 0.3) * l, by + Math.sin(a - 0.3) * l); p.px(tq.x, tq.y, hn.tip, { mask: true, keepLayer: true }); }
      }
    } else if (hn.kind === 'rhino') {
      if (isFar) return;
      Q([[0.24 * L, -0.24 * H], [0.5 * L, -0.3 * H - len * 0.55], [0.22 * L, -0.3 * H - len]], w * 1.4, 0.5, o);
    } else if (hn.kind === 'brow') {
      const bx = eyeX + sx - eyeR * 0.2, by = eyeY - eyeR * 0.9;
      Q([[bx, by], [bx - len * 0.1, by - len * 0.6], [bx - len * 0.32, by - len]], w, 0.4, o);
    } else if (hn.kind === 'lyre') {
      const bx = -0.05 * L + sx, by = -0.4 * H;
      Q([[bx, by], [bx - len * 0.5, by - len * 0.55], [bx - len * 0.15, by - len]], w * 1.2, 0.5, o);
    } else {
      // swept: back along the skull and up, the way a goat carries them
      const bx = -0.05 * L + sx, by = -0.38 * H;
      Q([[bx, by], [bx - len * 0.55, by - len * 0.25], [bx - len * 0.85, by - len * 0.75]], w * 1.2, 0.45, o);
      if (hn.rings && !isFar) {
        for (let k = 1; k < 4; k++) {
          const t = k / 4;
          const q = bezier([P(bx, by), P(bx - len * 0.55, by - len * 0.25), P(bx - len * 0.85, by - len * 0.75)], t);
          p.ellipse(q.x, q.y, w * 1.2 * (1 - t * 0.6), 0.5, { mat: m, mask: true, tint: -0.18, dome: 0, rot: tilt - 0.6 });
        }
      }
    }
  }

  function crest() {
    const c = D.crest;
    const sz = c.size * S;
    const m = c.mat || hm;
    if (c.kind === 'casque') {
      // a bony helmet rising off the back of the skull
      G([[0.16 * L, -0.34 * H], [-0.12 * L, -0.42 * H - sz * 0.75], [-0.42 * L, -0.42 * H - sz], [-0.5 * L, -0.12 * H]],
        { mat: m, dome: H * 0.35, feather: 2 * S, tint: 0.02 });
      if (c.mat2) zone(p, m, c.mat2, () => false);
    } else if (c.kind === 'fan') {
      // a fan of rays with skin between, raised like a flag
      const n = c.n || 5;
      const cx2 = (c.x ?? -0.15) * L, cy2 = -0.3 * H;
      const pts = [[cx2, cy2]];
      for (let k = 0; k <= 12; k++) {
        const a = lerp(-Math.PI * 0.95, -Math.PI * 0.4, k / 12);
        const r = sz * (0.82 + 0.18 * Math.cos((k / 12) * Math.PI * (n - 1)));
        pts.push([cx2 + Math.cos(a) * r, cy2 + Math.sin(a) * r]);
      }
      G(pts, { mat: c.mat2 || m, dome: 1.2 * S, feather: 1.5 * S, under: !!c.behind });
      for (let k = 0; k < n; k++) {
        const a = lerp(-Math.PI * 0.95, -Math.PI * 0.4, k / (n - 1));
        Ln(cx2, cy2, cx2 + Math.cos(a) * sz, cy2 + Math.sin(a) * sz, m, { only: c.mat2 || m });
      }
    } else if (c.kind === 'plume') {
      // a few long feathers swept back off the crown
      const n = c.n || 3;
      for (let k = 0; k < n; k++) {
        const bx = -0.1 * L - k * 0.08 * L, by = -0.36 * H;
        const l = sz * (1 - k * 0.18);
        Q([[bx, by], [bx - l * 0.55, by - l * 0.35], [bx - l, by - l * 0.12 + k * 0.6 * S]], 0.75 * S, 0.45 * S,
          { mat: m, dome: 0.6 * S, tint: -k * 0.06 });
      }
    } else {
      // comb: a row of soft spikes along the top of the head
      const n = c.n || 5;
      for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const x = lerp(0.18, -0.48, t) * L, y = -0.38 * H + t * 0.06 * H;
        const l = sz * (0.55 + 0.6 * Math.sin(Math.PI * (0.2 + t * 0.7)));
        G([[x - 0.9 * S, y + 0.5], [x - l * 0.35, y - l], [x + 0.9 * S, y + 0.5]], { mat: m, dome: 0.9 * S, feather: 1.1 });
      }
    }
  }

  function frill() {
    // a collar of skin on rays round the back of the skull, held up like a fan
    const f = D.frill;
    const sz = f.size * S, n = f.n || 7;
    const cx2 = (f.x ?? -0.34) * L, cy2 = 0.1 * H;
    const a0 = -Math.PI * (f.span ?? 0.62), a1 = Math.PI * (f.low ?? 0.5);
    const pts = [[cx2, cy2]];
    const N = 28;
    for (let k = 0; k <= N; k++) {
      const a = Math.PI + lerp(a0, a1, k / N);
      const scal = 0.86 + 0.14 * Math.abs(Math.cos((k / N) * Math.PI * (n - 1)));
      pts.push([cx2 + Math.cos(a) * sz * scal, cy2 + Math.sin(a) * sz * scal]);
    }
    G(pts, { mat: f.mat2 || f.mat, dome: 1.6 * S, feather: 2 * S, under: true });
    for (let k = 0; k < n; k++) {
      const a = Math.PI + lerp(a0, a1, k / (n - 1));
      Ln(cx2, cy2, cx2 + Math.cos(a) * sz * 0.98, cy2 + Math.sin(a) * sz * 0.98, f.mat, { only: f.mat2 || f.mat });
    }
    if (f.rim) {
      // a bright edge band
      zone(p, f.mat2 || f.mat, f.rim, () => false);
      for (let k = 0; k <= N; k++) {
        const a = Math.PI + lerp(a0, a1, k / N);
        const q = P(cx2 + Math.cos(a) * sz * 0.86, cy2 + Math.sin(a) * sz * 0.86);
        p.px(q.x, q.y, f.rim, { mask: true, keepLayer: true });
      }
    }
  }

  function dewlap() {
    const dw = D.dewlap;
    const sz = dw.size * S;
    E(0.02 * L, 0.36 * H + sz * 0.42, sz * 0.62, sz * 0.55, { mat: dw.mat, dome: sz * 0.3, under: true });
  }

  function beak() {
    const b = D.beak;
    const len = b.len * S, m = b.mat || 'fzBeak';
    const bx = 0.36 * L, top = -0.2 * H, bot = 0.2 * H;
    if (b.kind === 'hook') {
      // a raptor's hook: deep at the base, curled over at the tip
      G([[bx - 0.05 * L, top], [bx + len * 0.55, top - 0.02 * H], [bx + len * 0.95, top + 0.18 * H],
        [bx + len, bot + 0.12 * H], [bx + len * 0.78, 0.06 * H], [bx - 0.02 * L, bot]], { mat: m, dome: H * 0.24, feather: 1.4 * S });
      Ln(bx, 0.04 * H, bx + len * 0.76, 0.06 * H, 'fzMouth');
      if (b.cere) E(bx, -0.04 * H, 0.12 * L, 0.2 * H, { mat: b.cere, dome: H * 0.2 });
    } else if (b.kind === 'cone') {
      G([[bx - 0.04 * L, top], [bx + len, 0.02 * H], [bx - 0.04 * L, bot]], { mat: m, dome: H * 0.24, feather: 1.2 * S });
      Ln(bx, 0.02 * H, bx + len * 0.86, 0.02 * H, 'fzMouth');
    } else {
      // spear: long, straight and very nearly a weapon
      G([[bx - 0.04 * L, top + 0.04 * H], [bx + len, 0.04 * H], [bx - 0.04 * L, bot - 0.02 * H]],
        { mat: m, dome: H * 0.22, feather: 1.2 * S });
      Ln(bx + 0.02 * L, 0.03 * H, bx + len * 0.92, 0.04 * H, 'fzMouth');
      if (b.tip) {
        zone(p, m, b.tip, () => false);
        for (let k = 0; k < 3; k++) {
          const q = P(bx + len * (0.86 + k * 0.05), 0.04 * H);
          p.px(q.x, q.y, b.tip, { mask: true, keepLayer: true });
        }
      }
    }
  }

  function jaws(isFar) {
    const j = D.jaws;
    const len = j.len * S;
    const sgn = isFar ? -1 : 1;
    const o = { mat: j.mat || 'fzHorn', dome: 0.8 * S, ...(isFar ? far : {}) };
    Q([[0.38 * L, 0.12 * H * sgn + 0.1 * H], [0.42 * L + len * 0.7, 0.24 * H * sgn + 0.16 * H], [0.42 * L + len, 0.02 * H + 0.12 * H]],
      Math.max(0.8, 0.14 * H), 0.4, o);
  }

  function chelae(isFar) {
    // the scorpion's hands: the arm, a swollen palm and two fingers
    const c = D.chelae;
    const len = c.len * S;
    const m = c.mat || hm;
    const o = { mat: m, dome: len * 0.2, ...(isFar ? far : {}) };
    const dy = isFar ? -0.3 * H : 0.08 * H;
    const b0 = [0.3 * L, 0.2 * H + dy];
    const el = [0.5 * L + len * 0.25, 0.42 * H + dy];
    const pa = [0.5 * L + len * 0.75, 0.2 * H + dy];
    Q([b0, [b0[0] + len * 0.1, el[1]], el], len * 0.11, len * 0.1, o);
    Q([el, [el[0] + len * 0.2, el[1] + 0.1 * H], pa], len * 0.11, len * 0.16, o);
    E(pa[0], pa[1], len * 0.26, len * 0.17, { ...o, dome: len * 0.2, rot: -0.3 });
    Q([[pa[0] + len * 0.2, pa[1] - len * 0.1], [pa[0] + len * 0.45, pa[1] - len * 0.14], [pa[0] + len * 0.58, pa[1] + len * 0.02]],
      len * 0.09, 0.4, o);
    Q([[pa[0] + len * 0.18, pa[1] + len * 0.06], [pa[0] + len * 0.38, pa[1] + len * 0.14], [pa[0] + len * 0.52, pa[1] + len * 0.06]],
      len * 0.07, 0.4, o);
    if (c.glow && !isFar) {
      const q = P(pa[0] - len * 0.05, pa[1] - len * 0.06);
      p.px(q.x, q.y, c.glow, { mask: true, keepLayer: true, emissive: 0.3 });
    }
  }

  function antennae(isFar) {
    const a = D.antennae;
    const len = a.len * S;
    const m = a.mat || hm;
    const o = { mat: m, dome: 0.5 * S, ...(isFar ? far : {}) };
    const bx = (a.x ?? 0.28) * L - (isFar ? 1.2 * S : 0), by = -0.32 * H;
    const lift = a.lift ?? 0.75, fwd = a.fwd ?? 1.0;
    const tip = [bx + len * fwd, by - len * lift * 0.55 + (a.droop || 0) * len];
    const mid = [bx + len * 0.4 * fwd, by - len * lift];
    if (a.kind === 'elbow') {
      const el = [bx - len * 0.05, by - len * 0.45];
      Q([[bx, by], [bx - len * 0.02, by - len * 0.25], el], 0.55 * S, 0.45 * S, o);
      Q([el, [el[0] + len * 0.35, el[1] - len * 0.15], [el[0] + len * 0.7, el[1] + len * 0.08]], 0.45 * S, 0.4 * S, o);
      return;
    }
    Q([[bx, by], mid, tip], Math.max(0.5, 0.55 * S), Math.max(0.4, 0.4 * S), o);
    if (a.kind === 'plume' && !isFar) {
      // feathered, like a fern: barbs off one side of the shaft
      for (let k = 2; k < 9; k++) {
        const t = k / 9;
        const q = bezier([P(bx, by), P(mid[0], mid[1]), P(tip[0], tip[1])], t);
        const l = len * 0.24 * Math.sin(Math.PI * t);
        line(p, q, { x: q.x - l * 0.5, y: q.y + l * 0.85 }, a.barb || m, { free: true, h: 0.5 });
        line(p, q, { x: q.x + l * 0.6, y: q.y + l * 0.6 }, a.barb || m, { free: true, h: 0.5 });
      }
    } else if (a.kind === 'club') {
      const q = P(tip[0], tip[1]);
      p.ellipse(q.x, q.y, 1.2 * S, 0.9 * S, { ...o, dome: S, tint: (o.tint || 0) + 0.05 });
    } else if (a.kind === 'bead' && !isFar) {
      const q = P(tip[0], tip[1]);
      blob(p, q.x, q.y, Math.max(0.9, 0.8 * S), a.bead || 'fzGlowCyan', { mask: false, emissive: 0.3 });
    }
  }

  function lure() {
    // a stalk off the forehead carrying a light: the lantern is a lure, and a lamp
    const u = D.lure;
    const len = u.len * S;
    const bx = 0.05 * L, by = -0.38 * H;
    const top = [bx - len * 0.15, by - len * 0.95];
    const end = [bx + len * 0.62, by - len * 0.62];
    Q([[bx, by], top, end], 0.65 * S, 0.45 * S, { mat: u.mat || hm, dome: 0.6 * S, steps: 14 });
    const q = P(end[0], end[1] + (u.r ?? 1.6) * S * 0.7);
    p.next(true);
    p.ellipse(q.x, q.y, (u.r ?? 1.6) * S, (u.r ?? 1.6) * S * 1.15, { mat: u.bulb || 'fzGlowGold', dome: (u.r ?? 1.6) * S, emissive: 0.32 });
    p.px(q.x - 0.5 * S, q.y - 0.6 * S, 'fzShine');
  }

  function stalks(isFar) {
    // eyes held up on stalks, each looking its own way
    const k = D.stalks;
    const len = k.len * S;
    const bx = eyeX - (isFar ? 1.4 * S : 0), by = -0.3 * H;
    const tip = [bx + len * 0.3, by - len];
    Q([[bx, by], [bx + len * 0.05, by - len * 0.5], tip], 0.8 * S, 0.6 * S, { mat: k.mat || hm, dome: 0.6 * S, ...(isFar ? far : {}) });
    const q = P(tip[0], tip[1]);
    eyeStamp(p, q.x, q.y, eyeR * (isFar ? 0.85 : 1), D, { h: 2 });
  }

  function turret() {
    // a chameleon's eye: a cone of skin with a pinhole, swivelling on its own
    const t = D.turret;
    const R = eyeR * 1.35;
    const q = P(eyeX, eyeY);
    p.next(true);
    p.ellipse(q.x, q.y, R, R, { mat: t.mat || hm, dome: R * 1.6 });
    if (t.ring) {
      p.ellipse(q.x, q.y, R * 0.98, R * 0.98, { mat: t.ring, mask: true, dome: 0 });
      p.ellipse(q.x + R * 0.2, q.y, R * 0.7, R * 0.7, { mat: t.mat || hm, mask: true, dome: R * 1.4 });
    }
    eyeStamp(p, q.x + R * 0.42, q.y + R * 0.05, Math.max(1, R * 0.45), D, { kind: 'bead', h: R * 1.6 });
  }
}

// ---------------------------------------------------------------------------
// limbs

/**
 * One limb segment, painted along +x from the joint. creature.js swings it to
 * wherever the IK says, which for a standing animal is about straight down,
 * so a foot's toes are painted toward -y (forward, once it is turned).
 */
function paintLimb(len, r0, r1, D, S, far, o = {}) {
  const mat = o.mat || D.legMat || D.mat;
  const foot = o.foot;
  const fr = Math.max(r1, 0.7);
  const footExt = foot ? fr * 4.4 + 3 : 1;
  const pad = Math.ceil(Math.max(r0, r1) + footExt) + 3;
  const p = new CP(Math.ceil(len) + pad * 2 + 2, pad * 2 + 2);
  const cy = Math.floor(p.h / 2) + 0.5, x0 = pad + 0.5, x1 = x0 + len;
  const ft = far ? -0.04 : 0;
  p.next(true);
  if (o.style === 'chitin') {
    p.capsule(x0, cy, x1, cy, r0, r1, { mat, dome: r0 * 0.9, tint: ft });
    if (o.joint) p.ellipse(x1, cy, r1 * 1.25, r1 * 1.2, { mat: o.joint, dome: r1, tint: ft });
    if (o.barbs) {
      for (let i = 0; i < 4; i++) {
        const x = lerp(x0 + len * 0.2, x1 - 1, i / 3);
        p.capsule(x, cy + r0 * 0.6, x - r0 * 1.4, cy + r0 * 2.1, 0.55 * S, 0.3, { mat: o.barbMat || 'fzHorn', dome: 0.5 * S, tint: ft });
      }
    }
  } else if (o.style === 'stilt') {
    p.capsule(x0, cy, x1, cy, r0, r1, { mat, dome: r0, tint: ft });
    p.ellipse(x1, cy, r1 * 1.5, r1 * 1.4, { mat, dome: r1, tint: ft });
  } else {
    p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - (o.bow || 0) }, { x: x1, y: cy }],
      r0, r1, { mat, dome: r0 * 0.9, steps: 10, tint: ft });
  }
  if (!o.noKnob) p.ellipse(x0, cy, r0 * 1.08, r0 * 1.04, { mat, dome: r0, tint: ft });
  if (o.cuff) {
    // a band of another colour round the joint: a sock, a garter, a warning
    p.capsule(x1 - len * 0.22, cy, x1, cy, r1 * 1.15, r1 * 1.1, { mat: o.cuff, dome: r1, tint: ft, mask: true });
  }

  const fm = o.footMat || mat;
  if (foot === 'paw') {
    p.next(true);
    p.ellipse(x1 + fr * 0.15, cy - fr * 0.55, fr * 1.05, fr * 1.6, { mat: fm, dome: fr, tint: ft });
    line(p, { x: x1 + fr * 0.9, y: cy - fr * 1.2 }, { x: x1 + fr * 0.9, y: cy - fr * 2.0 }, 'fzMouth');
  } else if (foot === 'hoof') {
    p.next(true);
    p.poly([{ x: x1 - fr * 0.6, y: cy - fr * 1.25 }, { x: x1 + fr * 1.5, y: cy - fr * 1.55 },
      { x: x1 + fr * 1.5, y: cy + fr * 1.0 }, { x: x1 - fr * 0.6, y: cy + fr * 0.9 }],
    { mat: o.hoofMat || 'fzHorn', dome: fr, feather: 1.2, tint: ft });
  } else if (foot === 'splay' || foot === 'pad') {
    p.next(true);
    const toes = [[-0.95, 3.0], [-0.55, 3.4], [-0.15, 2.6], [0.55, 1.9]];
    for (const [a, l] of toes) {
      const dx = Math.sin(a + 0.25) * 0.55, dy = -Math.cos(a) * 1;
      const tx = x1 + fr * 0.6 + dx * fr * l * 0.4, ty = cy + dy * fr * l;
      p.capsule(x1, cy, tx, ty, fr * 0.6, fr * 0.32, { mat: fm, dome: fr * 0.5, tint: ft - 0.02 });
      if (foot === 'pad') p.ellipse(tx, ty, fr * 0.62, fr * 0.62, { mat: o.padMat || fm, dome: fr * 0.5, tint: ft + 0.05 });
    }
  } else if (foot === 'bird' || foot === 'talon') {
    p.next(true);
    const k = foot === 'talon' ? 1.35 : 1;
    const toes = [[-1, 4.2], [-0.6, 3.4], [0.9, 2.2]];
    for (const [a, l] of toes) {
      const tx = x1 + fr * 0.9, ty = cy + a * fr * l;
      p.capsule(x1, cy, tx, ty, fr * 0.55 * k, fr * 0.3 * k, { mat: fm, dome: fr * 0.4, tint: ft });
      if (foot === 'talon') {
        p.capsule(tx, ty, tx + fr * 1.1, ty + Math.sign(a) * fr * 0.7, fr * 0.42, 0.3, { mat: 'fzInk', dome: fr * 0.4 });
      }
    }
  } else if (foot === 'claw') {
    p.next(true);
    for (const a of [-1, -0.45]) {
      p.capsule(x1, cy, x1 + fr * 0.7, cy + a * fr * 2.6, fr * 0.6, fr * 0.3, { mat: fm, dome: fr * 0.5, tint: ft });
      p.capsule(x1 + fr * 0.7, cy + a * fr * 2.6, x1 + fr * 1.5, cy + a * fr * 3.1, fr * 0.36, 0.3,
        { mat: o.clawMat || 'fzHorn', dome: fr * 0.3 });
    }
  } else if (foot === 'hook') {
    p.capsule(x1, cy, x1 + fr * 1.4, cy - fr * 1.2, fr * 0.6, 0.35, { mat: o.clawMat || fm, dome: fr * 0.4, tint: ft });
  }
  if (o.bands && o.bandMat) {
    for (let i = 1; i <= o.bands; i++) {
      const x = lerp(x0, x1, i / (o.bands + 1));
      p.capsule(x - 0.5, cy, x + 0.5, cy, r0 * 1.2, r0 * 1.2, { mat: o.bandMat, mask: true, dome: 0 });
    }
  }
  p.smoothHeight(1, 0.2);
  return {
    cv: shade(p, { rot: o.rot ?? Math.PI / 2, far, outline: D.outline }),
    ox: x0, oy: cy, len,
  };
}

// ---------------------------------------------------------------------------
// tails
//
// creature.js hangs a tail off its socket turned half a turn, so on this
// canvas +x runs away from the body and +y is UP once it is on the animal.
// Everything below is written in those terms through T(back, up).

function paintTail(D, S) {
  const style = D.tailStyle || D.tailKind || 'whip';
  const L = D.tail * S;
  const W = (D.tailW ?? 0.26) * L;
  const tipR = (D.tailTip?.size ?? 0) * S;
  const pad = Math.ceil(W * 2 + tipR * 2 + L * (style === 'sting' ? 0.9 : style === 'streamer' || style === 'fan' ? 0.6 : 0.35)) + 6;
  const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(W * 2) + pad * 2);
  const x0 = pad + 0.5, cy = Math.floor(p.h / 2) + 0.5;
  const T = (back, up) => ({ x: x0 + back, y: cy + up });
  const m = D.tailMat || D.mat;
  const cut = [{ x: x0, y: cy, r: Math.max(1.5, W * (style === 'whip' ? 1.15 : 0.6)) }];
  p.next(true);

  if (style === 'sting') {
    // a scorpion's tail: segments climbing up and over the back
    const pts = [T(0, 0), T(L * 0.25, L * 0.62), T(-L * 0.18, L * 1.0), T(-L * 0.42, L * 0.72)];
    const sp = spine(pts, (t) => W * (0.62 - 0.18 * t), 30);
    tube(p, sp, { mat: m, uv: true, flipV: true });
    for (let k = 1; k < 6; k++) {
      const s = at(sp, k / 6);
      p.ellipse(s.x, s.y, W * 0.6, W * 0.6, { mat: m, dome: W * 0.55, tint: 0.03 });
      line(p, surf(s, -1), surf(s, 1), D.seam || 'fzMouth', { only: m });
    }
    scheme(p, D, m, 'tail');
    const tip = sp[sp.length - 1];
    p.next(true);
    const vm = D.stingMat || m;
    p.ellipse(tip.x, tip.y, W * 0.85, W * 0.72, { mat: vm, dome: W * 0.7, emissive: D.stingGlow || 0 });
    p.curve([{ x: tip.x, y: tip.y }, { x: tip.x - W * 0.9, y: tip.y - W * 0.3 }, { x: tip.x - W * 0.8, y: tip.y - W * 1.5 }],
      W * 0.36, 0.35, { mat: 'fzInk', dome: W * 0.3, steps: 8 });
  } else if (style === 'bulb') {
    // a glass flask of water hung off the hips
    const sp = spine([T(0, 0), T(L * 0.3, -L * 0.02), T(L * 0.62, L * 0.02)], (t) => W * (0.55 + 0.1 * t), 12);
    tube(p, sp, { mat: m, uv: true, flipV: true });
    scheme(p, D, m, 'tail');
    const bc = T(L * 0.62, 0.02 * L), br = (D.sac?.r ?? 0.36) * L;
    p.next(true);
    p.ellipse(bc.x, bc.y, br * 1.15, br, { mat: D.sac?.mat || 'fzGlass', dome: br * 1.1 });
    // the water inside, settled to the bottom of the bulb (which is +y-down... the paint is flipped, so up)
    p.ellipse(bc.x + br * 0.1, bc.y - br * 0.18, br * 0.92, br * 0.66, { mat: D.sac?.water || 'fzWater', mask: true, dome: br * 0.9 });
    p.capsule(bc.x + br * 1.0, bc.y, x0 + L, cy - 0.04 * L, br * 0.36, 0.5, { mat: m, dome: br * 0.3 });
    p.px(bc.x + br * 0.45, bc.y + br * 0.5, 'fzShine');
    p.px(bc.x + br * 0.25, bc.y + br * 0.62, 'fzShine');
  } else if (style === 'plume' || style === 'fan') {
    // a fan of tail feathers
    const n = style === 'fan' ? 7 : 5;
    const spread = style === 'fan' ? 0.75 : 0.4;
    for (let k = 0; k < n; k++) {
      const a = lerp(-spread, spread * 0.4, k / (n - 1)) + (D.tailDroop ?? -0.15);
      const l = L * (0.75 + 0.25 * Math.sin(Math.PI * k / (n - 1)));
      const e = T(Math.cos(a) * l, Math.sin(a) * l);
      p.capsule(x0, cy, e.x, e.y, W * 0.35, W * 0.42, { mat: m, dome: W * 0.35, tint: (k & 1) ? -0.04 : 0.02 });
      if (D.tailTip) p.ellipse(e.x, e.y, W * 0.42, W * 0.42, { mat: D.tailTip.mat, mask: true, dome: W * 0.2 });
    }
  } else if (style === 'streamer') {
    // two long thin feathers with paddles on the ends, for showing off
    p.capsule(x0, cy, x0 + L * 0.3, cy - L * 0.05, W * 0.55, W * 0.4, { mat: m, dome: W * 0.4 });
    for (const [a, k] of [[-0.12, 1], [-0.24, 0.88]]) {
      const e = T(Math.cos(a) * L * k, Math.sin(a) * L * k);
      p.curve([T(L * 0.25, -L * 0.04), T(L * 0.6 * k, Math.sin(a) * L * 0.4 + L * 0.06), e], 0.55 * S, 0.45 * S,
        { mat: D.streamerMat || m, dome: 0.5 * S, steps: 14 });
      p.ellipse(e.x, e.y, (D.tailTip?.size ?? 1.6) * S * 1.3, (D.tailTip?.size ?? 1.6) * S * 0.8,
        { mat: D.tailTip?.mat || m, dome: S, rot: -a });
    }
  } else if (style === 'tuft' || style === 'brush') {
    const brush = style === 'brush';
    const sp = spine([T(0, 0), T(L * 0.45, L * (D.tailLift ?? 0.1)), T(L, L * (D.tailLift ?? 0.1) * 0.6)],
      (t) => (brush ? W * (0.5 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.05))) : Math.max(0.8, W * (0.5 - 0.25 * t))), 20);
    tube(p, sp, { mat: m, uv: true, flipV: true });
    scheme(p, D, m, 'tail');
    if (!brush) {
      const e = sp[sp.length - 1];
      p.next(true);
      const tr = (D.tailTip?.size ?? 2.4) * S;
      p.ellipse(e.x + tr * 0.2, e.y, tr * 1.4, tr * 0.95, { mat: D.tailTip?.mat || m, dome: tr * 0.9 });
      if (D.tailTip?.mat2) p.ellipse(e.x + tr * 0.8, e.y, tr * 0.8, tr * 0.7, { mat: D.tailTip.mat2, mask: true, dome: tr * 0.7 });
    } else if (D.tailTip) {
      zone(p, [m, D.belly?.mat, D.back?.mat].filter(Boolean), D.tailTip.mat, (t) => t > (D.tailTip.from ?? 0.8));
    }
  } else if (style === 'segmented') {
    // an insect's long abdomen: a chain of hard rings
    const n = D.tailSegs || 7;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const q = T(L * t, L * (D.tailLift ?? 0.05) * Math.sin(Math.PI * t));
      const r = W * (0.5 - 0.18 * t);
      p.ellipse(q.x, q.y, r * 1.35, r, { mat: k % 2 ? m : (D.tailMat2 || m), dome: r * 1.1 });
    }
    if (D.tailTip) {
      const q = T(L * 1.02, L * (D.tailLift ?? 0.05) * 0.1);
      p.next(true);
      p.ellipse(q.x, q.y, D.tailTip.size * S * 1.2, D.tailTip.size * S * 0.7, { mat: D.tailTip.mat, dome: S, emissive: D.tailTip.glow || 0 });
    }
  } else {
    // whip: thick at the root, thin at the tip, carried a little lifted
    const lift = D.tailLift ?? 0.06, curl = D.tailCurl ?? 0;
    const pts = curl
      ? [T(0, 0), T(L * 0.55, L * 0.05), T(L * 0.95, L * curl * 0.6), T(L * 0.7, L * curl)]
      : [T(0, 0), T(L * 0.48, L * lift), T(L, -L * 0.04)];
    const sp = spine(pts, (t) => Math.max(0.8, W * (1 - t) ** (D.tailTaper ?? 0.72)), 30);
    tube(p, sp, { mat: m, squash: D.tailSquash ?? 1, uv: true, flipV: true });
    scheme(p, D, m, 'tail');
    for (const tb of [].concat(D.tailBands || [])) {
      const n = tb.n || 5;
      zone(p, [m, D.belly?.mat, D.back?.mat].filter(Boolean), tb.mat, (t) => {
        const s = ((t - (tb.from ?? 0.2)) / ((tb.to ?? 1) - (tb.from ?? 0.2))) * n;
        return s >= 0 && s < n && s - Math.floor(s) < (tb.w ?? 0.45);
      });
    }
    if (D.tailCrest) {
      for (let i = 3; i < sp.length - 4; i += 3) {
        const s = sp[i];
        const a = surf(s, -0.85);
        const k = D.tailCrest.h * S * (1 - s.t * 0.7);
        p.poly([{ x: a.x - 1.1 * S, y: a.y }, { x: a.x + 0.6 * S, y: a.y + k }, { x: a.x + 1.2 * S, y: a.y }],
          { mat: D.tailCrest.mat || 'fzHorn', dome: 0.8 * S, feather: 1, under: true });
      }
    }
    if (D.tailTip) {
      const e = sp[sp.length - 1];
      const tr = D.tailTip.size * S;
      p.next(true);
      if (D.tailTip.kind === 'flag') {
        p.poly([{ x: e.x - tr * 1.6, y: e.y }, { x: e.x - tr * 0.4, y: e.y + tr * 1.3 }, { x: e.x + tr * 0.8, y: e.y + tr * 0.2 },
          { x: e.x + tr * 0.2, y: e.y - tr * 1.0 }], { mat: D.tailTip.mat, dome: tr * 0.5, feather: 1.2 });
      } else {
        p.ellipse(e.x, e.y, tr, tr, { mat: D.tailTip.mat, dome: tr, emissive: D.tailTip.glow || 0 });
      }
    }
    if (D.tailDots) photophores(p, sp, { ...D.tailDots, v: -(D.tailDots.v ?? 0) }, S, 1);
  }
  p.smoothHeight(1, 0.25);
  return {
    cv: shade(p, { rot: Math.PI, cut, outline: D.outline }),
    ox: x0, oy: cy, len: L,
  };
}

// ---------------------------------------------------------------------------
// wings
//
// A wing hangs off the shoulder turned back along the flank (about PI - 0.5),
// so on this canvas +x runs to the wingtip and +y is the leading edge - the
// top of a folded wing.

function paintWing(D, S, far) {
  const kind = D.wingKind || 'feather';
  const L = D.wing * S, W = L * (D.wingW ?? 0.45);
  const tail = (D.wingTail || 0) * S;
  // at rest a wing lies along the flank; in the air the fold is smaller so the
  // beat swings about level
  const fold = D.wingFold ?? (D.flies ? 0.28 : D.plan === 'bird' ? 0.42 : 0.56);
  const pad = Math.ceil(Math.max(W * 0.6 + tail, (L + tail) * Math.sin(Math.abs(fold)) + W * 0.5)) + 5;
  const p0 = new CP(Math.ceil(L + tail) + pad * 2, Math.ceil(W * 2) + pad * 2);
  let p = p0;
  const x0 = pad + 0.5, cy = Math.floor(p.h / 2) + 0.5;
  const m = D.wingMat || D.mat, m2 = D.wingMat2 || m;
  const ROT = Math.PI - 0.5;
  let outline = D.outline;
  p.next(true);

  if (kind === 'feather') {
    // coverts along the leading edge, flight feathers behind and past them
    const lead = (u) => cy + W * 0.32 * Math.sqrt(Math.max(0, 1 - u)) * (0.6 + 0.4 * (1 - u));
    const trail = (u) => cy - W * 0.62 * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.7;
    const nF = Math.round(5 + 3 * (D.wingFeathers ?? 1));
    p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
      const u = (x - x0) / L;
      if (u < 0 || u > 1) return null;
      const yl = lead(u), yt = trail(u);
      // the trailing edge is scalloped feather by feather
      const f = (u * nF) % 1;
      const scal = 1 - 0.22 * (1 - Math.sin(Math.PI * f));
      const yt2 = cy - (cy - yt) * (u > 0.15 ? scal : 1);
      if (y > yl || y < yt2) return null;
      const across = (y - yt2) / Math.max(1, yl - yt2);
      const cov = across > (D.covert ?? 0.5) && u < 0.72;
      return { h: 1.2 + across * W * 0.35, tint: 0, mat: cov ? m : m2 };
    }, { mat: m });
    // a line between the coverts and the flight feathers, and a few feather shafts
    for (let k = 1; k < nF; k++) {
      const u = k / nF;
      if (u < 0.2) continue;
      const a = { x: x0 + u * L, y: trail(u) + 1 }, b = { x: x0 + (u - 0.06) * L, y: lead(u) - 1 };
      line(p, a, { x: lerp(a.x, b.x, 0.45), y: lerp(a.y, b.y, 0.45) }, m2, { tint: -0.22 });
    }
    if (D.wingBar) {
      zone(p, m, D.wingBar, () => false);
      for (let x = Math.floor(x0 + L * 0.12); x < x0 + L * 0.6; x++) {
        const u = (x - x0) / L;
        p.px(x, Math.floor(lerp(trail(u), lead(u), D.covert ?? 0.5)), D.wingBar, { mask: true, keepLayer: true });
      }
    }
    if (D.wingTip) {
      const b = p._matIndex.get(m2), t = p._mid(D.wingTip);
      for (let i = 0; i < p.mat.length; i++) if (p.mat[i] === b && (i % p.w) > x0 + L * 0.72) p.mat[i] = t;
    }
  } else if (kind === 'glass' || kind === 'membrane') {
    // two clear blades, fore and hind, veined, with colour at the tips
    outline = D.wingOutline || '#2c4048';
    const blades = [[0.06, 1.0, 1.0], [-0.12, 0.86, 0.9]];
    for (const [a, lk, wk] of blades) {
      const l = L * lk, wd = W * 0.5 * wk;
      p.next(true);
      p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
        const dx = x - x0, dy = y - cy;
        const u = (dx * Math.cos(a) + dy * Math.sin(a)) / l;
        const v = (-dx * Math.sin(a) + dy * Math.cos(a));
        if (u < 0 || u > 1) return null;
        const half = wd * Math.sin(Math.PI * Math.pow(u, 0.62)) ** 0.7;
        if (Math.abs(v + wd * 0.15) > half) return null;
        const tipZone = D.wingSpot && u > (D.wingSpot.from ?? 0.7);
        return { h: 1 + (1 - Math.abs(v) / (half || 1)) * 0.8, mat: tipZone ? D.wingSpot.mat : m };
      }, { mat: m });
      // veins
      for (let k = 0; k < 3; k++) {
        const va = a + (k - 1) * 0.12 * (wd / l) * 4;
        line(p, { x: x0, y: cy }, { x: x0 + Math.cos(va) * l * 0.94, y: cy + Math.sin(va) * l * 0.94 - wd * 0.15 }, D.veinMat || 'fzSlate', { only: m, tint: 0 });
      }
    }
  } else if (kind === 'moth') {
    // broad and patterned: a forewing like a sail, a hindwing trailing a tail
    const P2 = (u, v) => ({ x: x0 + u * L, y: cy + v * W });
    p.poly([P2(0, 0.14), P2(0.55, 0.26), P2(1.0, 0.3), P2(0.96, -0.12), P2(0.72, -0.62), P2(0.3, -0.56), P2(0.08, -0.24)],
      { mat: m, dome: 2.4 * S, feather: 2.4 * S });
    if (D.wingBand) {
      const bm = p._mid(D.wingBand.mat), base = p._matIndex.get(m);
      for (let i = 0; i < p.mat.length; i++) {
        if (p.mat[i] !== base) continue;
        const u = ((i % p.w) - x0) / L, v = (Math.floor(i / p.w) - cy) / W;
        if (u - v * 0.25 > (D.wingBand.from ?? 0.8)) p.mat[i] = bm;
      }
    }
    // the hindwing, behind, with its tail
    p.ellipse(x0 + L * 0.34, cy - W * 0.72, L * 0.3, W * 0.42, { mat: m2, dome: 2 * S, under: true });
    if (tail > 0) {
      const tq = P2(1 + tail / L, -1.25);
      p.curve([P2(0.4, -0.95), P2(0.72, -1.3), tq], W * 0.16, 0.8 * S, { mat: m2, dome: S, steps: 16, under: true });
      p.ellipse(tq.x, tq.y, 1.7 * S, 1.2 * S, { mat: D.wingBand?.mat || m2, dome: S, under: true });
    }
    if (D.wingSpot) {
      // an eyespot: a ring, an iris and a pupil that are not looking at anything
      const sx = x0 + L * (D.wingSpot.u ?? 0.55), sy = cy - W * (D.wingSpot.v ?? 0.2);
      const r = D.wingSpot.r * S;
      p.next(false);
      p.ellipse(sx, sy, r, r, { mat: 'fzInk', mask: true, dome: 1 });
      p.ellipse(sx, sy, r * 0.74, r * 0.74, { mat: D.wingSpot.mat, mask: true, dome: 1, emissive: D.wingSpot.glow || 0 });
      p.ellipse(sx + r * 0.12, sy, r * 0.34, r * 0.34, { mat: 'fzInk', mask: true, dome: 1 });
      p.px(sx - r * 0.3, sy - r * 0.3, 'fzShine', { mask: true });
    }
  } else if (kind === 'leaf') {
    // a folded wing cover like a leaf, with its midrib
    p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
      const u = (x - x0) / L;
      if (u < 0 || u > 1) return null;
      const half = W * 0.5 * Math.sin(Math.PI * Math.pow(u, 0.7)) ** 0.8;
      const dy = y - cy;
      if (Math.abs(dy) > half) return null;
      return { h: 1 + (1 - Math.abs(dy) / (half || 1)) * W * 0.4 };
    }, { mat: m });
    line(p, { x: x0, y: cy }, { x: x0 + L * 0.96, y: cy }, m2, { only: m });
    for (let k = 1; k < 5; k++) {
      const u = k / 5;
      line(p, { x: x0 + u * L, y: cy }, { x: x0 + (u + 0.12) * L, y: cy + W * 0.3 }, m2, { only: m });
      line(p, { x: x0 + u * L, y: cy }, { x: x0 + (u + 0.12) * L, y: cy - W * 0.3 }, m2, { only: m });
    }
  } else if (kind === 'elytra') {
    p.field(x0 - 2, cy - W - 2, x0 + L + 2, cy + W + 2, (x, y) => {
      const u = (x - x0) / L;
      if (u < 0 || u > 1) return null;
      const span = W * Math.pow(Math.sin(Math.pow(u, 0.62) * Math.PI * 0.9 + 0.2), 0.55);
      const dy = (y - cy) / span;
      if (Math.abs(dy) > 1) return null;
      return { h: Math.sqrt(clamp01(1 - dy * dy)) * W * 0.8 };
    }, { mat: m });
  }
  p = turn(p, fold, x0, cy);
  p.smoothHeight(1, 0.3);
  return {
    cv: shade(p, { rot: ROT, far, outline }),
    ox: x0, oy: cy, len: L,
  };
}

// ---------------------------------------------------------------------------
// necks

function paintNeck(D, S, base) {
  const len = (D.neck + 2) * S;
  const r0 = (D.neckR ?? 2.6) * S, r1 = r0 * (D.neckTaper ?? 0.82);
  const pad = Math.ceil(r0 * 2 + (D.ruff ? D.ruff.size * S : 0)) + 4;
  const p = new CP(Math.ceil(len) + pad * 2, Math.ceil(r0 * 2) + pad * 2);
  const x0 = pad + 0.5, cy = Math.floor(p.h / 2) + 0.5;
  const m = D.neckMat || D.mat;
  // which way is the throat, once creature.js has stood this up?
  const flip = Math.cos(base) < 0;
  p.next(true);
  const sp = spine([{ x: x0 - r0 * 0.3, y: cy }, { x: x0 + len * 0.5, y: cy - (D.neckBow ?? 0.5) * S }, { x: x0 + len, y: cy }],
    (t) => lerp(r0, r1, t), 18);
  tube(p, sp, { mat: m, uv: true, flipV: flip });
  scheme(p, D, m, 'neck');
  if (D.neckRings) {
    zone(p, m, D.neckRings.mat, (t) => ((t * (D.neckRings.n || 4)) % 1) < 0.35);
  }
  if (D.ruff) {
    // a collar of plumes where bare skin starts: the vulture's boa
    const rf = D.ruff, rs = rf.size * S;
    p.next(true);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      p.ellipse(x0 + rs * 0.2 + Math.cos(a) * rs * 0.45, cy + Math.sin(a) * rs * 0.75, rs * 0.5, rs * 0.42,
        { mat: rf.mat, dome: rs * 0.5, tint: (k & 1) ? 0.04 : -0.03 });
    }
  }
  p.smoothHeight(1, 0.25);
  return {
    cv: shade(p, { rot: base, cut: [{ x: x0, y: cy, r: r0 * 1.15 }], outline: D.outline }),
    ox: x0, oy: cy, len,
  };
}

// ---------------------------------------------------------------------------
// what grows out of a back

/** How far above the spine the tallest thing on the back reaches, px. */
function backReach(D, S) {
  return Math.max(0, (D.sail?.h || 0), (D.spines?.h || 0), (D.plates?.h || 0), (D.crystals?.h || 0),
    (D.quills?.h || 0), (D.blooms ? 3 : 0), (D.hump || 0)) * S;
}

function backGrowth(p, sp, D, S, sq) {
  if (D.sail) sail(p, sp, D.sail, S, sq);
  if (D.plates) plates(p, sp, D.plates, S, sq);
  if (D.spines) spines(p, sp, D.spines, S, sq, true);
  if (D.crystals) crystals(p, sp, D.crystals, S, sq);
}

/** A sail: skin on rays, rising off the spine. */
function sail(p, sp, c, S, sq) {
  const from = c.from ?? 0.2, to = c.to ?? 0.8, h = c.h * S, n = c.rays ?? 7, N = 30;
  const base = [], top = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, t = lerp(from, to, u);
    const s = at(sp, t);
    const b = surf(s, -0.6, sq);
    const peak = c.peak ?? 0.5;
    const k = (u < peak ? Math.sin((u / peak) * Math.PI / 2) : Math.cos(((u - peak) / (1 - peak)) * Math.PI / 2)) ** (c.shape ?? 0.7);
    const sc = 1 - (c.scallop ?? 0.14) * (1 - Math.abs(Math.cos(Math.PI * u * (n - 1))));
    const hh = h * k * sc;
    base.push(b);
    top.push({ x: b.x - s.nx * hh - (c.lean ?? 0.3) * hh * s.tx, y: b.y - s.ny * hh - (c.lean ?? 0.3) * hh * s.ty });
  }
  p.next(false);
  p.poly([...base, ...top.reverse()], { mat: c.mat2 || c.mat, dome: 1.6 * S, feather: 1.6 * S, under: true });
  top.reverse();
  for (let k = 0; k < n; k++) {
    const i = Math.round((k / (n - 1)) * N);
    line(p, base[i], top[i], c.mat, { only: c.mat2 || c.mat });
  }
  if (c.edge) {
    for (let i = 0; i <= N; i++) p.px(top[i].x + 0.5 * Math.sign(-sp[0].nx || 0), top[i].y + 0.6, c.edge, { mask: true, keepLayer: true });
  }
  if (c.stripes) {
    zone(p, c.mat2 || c.mat, c.stripes, () => false);
  }
}

/** Spines, thorns, quills: thin hard triangles off the back. */
function spines(p, sp, c, S, sq, under) {
  const n = c.n || 8;
  p.next(!under);
  for (let k = 0; k < n; k++) {
    const u = n > 1 ? k / (n - 1) : 0.5;
    const t = lerp(c.from ?? 0.15, c.to ?? 0.85, u);
    const s = at(sp, t);
    const b = surf(s, c.v ?? -0.8, sq);
    const l = c.h * S * (c.even ? 1 : 0.55 + 0.6 * Math.sin(Math.PI * (0.15 + u * 0.7))) * (k % 2 && c.alt ? 0.7 : 1);
    const lean = c.lean ?? 0.5;
    const dx = -s.nx - s.tx * lean, dy = -s.ny - s.ty * lean;
    const dl = Math.hypot(dx, dy) || 1;
    const wd = (c.w ?? 1.1) * S;
    p.poly([{ x: b.x - s.tx * wd, y: b.y - s.ty * wd }, { x: b.x + dx / dl * l, y: b.y + dy / dl * l },
      { x: b.x + s.tx * wd, y: b.y + s.ty * wd }], { mat: c.mat || 'fzIvory', dome: wd, feather: 1, under, tint: (k & 1) ? -0.05 : 0.03 });
    if (c.tip) p.px(b.x + dx / dl * (l - 0.6), b.y + dy / dl * (l - 0.6), c.tip, { mask: true, keepLayer: true });
  }
}

/** Plates: big rounded scutes standing up off the back, staggered. */
function plates(p, sp, c, S, sq) {
  const n = c.n || 6;
  p.next(true);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const t = lerp(c.from ?? 0.15, c.to ?? 0.85, u);
    pts.push({ s: at(sp, t), u, k });
  }
  // back row first, so the front row overlaps it
  for (const { s, u, k } of pts.sort((a, b) => (a.k & 1) - (b.k & 1))) {
    const b = surf(s, -0.55, sq);
    const l = c.h * S * (0.6 + 0.5 * Math.sin(Math.PI * (0.1 + u * 0.8)));
    const wd = (c.w ?? 2.6) * S;
    const dx = -s.nx - s.tx * 0.25, dy = -s.ny - s.ty * 0.25;
    const dl = Math.hypot(dx, dy) || 1;
    const tip = { x: b.x + dx / dl * l, y: b.y + dy / dl * l };
    p.next(true);
    p.poly([{ x: b.x - s.tx * wd, y: b.y - s.ty * wd }, { x: lerp(b.x, tip.x, 0.6) - s.tx * wd * 0.8, y: lerp(b.y, tip.y, 0.6) - s.ty * wd * 0.8 },
      tip, { x: lerp(b.x, tip.x, 0.6) + s.tx * wd * 0.6, y: lerp(b.y, tip.y, 0.6) + s.ty * wd * 0.6 },
      { x: b.x + s.tx * wd, y: b.y + s.ty * wd }], { mat: (k & 1) ? (c.mat2 || c.mat) : c.mat, dome: wd * 0.9, feather: wd * 0.8, under: !!(k & 1) });
    if (c.glow) line(p, b, { x: lerp(b.x, tip.x, 0.7), y: lerp(b.y, tip.y, 0.7) }, c.glow, { emissive: 0.3 });
  }
}

/** Crystals: salt grown out of the skin in faceted shards, catching the sun. */
function crystals(p, sp, c, S, sq) {
  const n = c.n || 7;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1);
    const t = lerp(c.from ?? 0.2, c.to ?? 0.85, u);
    const s = at(sp, t);
    const b = surf(s, -0.7, sq);
    const l = c.h * S * (0.5 + 0.5 * Math.sin(Math.PI * (0.1 + u * 0.8))) * (k % 3 === 1 ? 0.6 : 1);
    const lean = ((k * 37) % 7) / 7 - 0.5 + (c.lean ?? 0.3);
    const dx = -s.nx - s.tx * lean, dy = -s.ny - s.ty * lean;
    const dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    const wd = (c.w ?? 1.3) * S;
    const tip = { x: b.x + ux * l, y: b.y + uy * l };
    const sh = { x: b.x + ux * l * 0.72, y: b.y + uy * l * 0.72 };
    p.next(true);
    // two facets: the one facing the sun is bright, the other is not
    p.poly([{ x: b.x - uy * wd, y: b.y + ux * wd }, { x: sh.x - uy * wd, y: sh.y + ux * wd }, tip, b],
      { mat: c.mat || 'fzCrystal', dome: 0.5, feather: 0.5, tint: 0.16 });
    p.poly([b, tip, { x: sh.x + uy * wd, y: sh.y - ux * wd }, { x: b.x + uy * wd, y: b.y - ux * wd }],
      { mat: c.mat || 'fzCrystal', dome: 0.5, feather: 0.5, tint: -0.14 });
  }
}

// ---------------------------------------------------------------------------
// body plans

const PLAN = {
  /** Lizards: long, low, heavy at the hips, head carried out front. */
  sprawler(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const sq = D.squash ?? 0.86;
    const up = backReach(D, S);
    const pad = Math.ceil(H * 0.8) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 1.3 + up) + pad * 2);
    const cx = p.w / 2, cy = pad + up + H * 0.65;
    const arch = D.arch ?? 0.14;
    const sp = spine([
      { x: cx - L / 2, y: cy + H * 0.06 },
      { x: cx - L * 0.12, y: cy - H * arch },
      { x: cx + L * 0.24, y: cy - H * arch * 0.7 },
      { x: cx + L / 2, y: cy + H * (D.neckDrop ?? 0.02) },
    ], (t) => H * 0.5 * prof(D.girth || [0.62, 0.92, 1, 0.96, 0.86, 0.62])(t), 30);
    p.next(true);
    tube(p, sp, { mat: D.mat, squash: sq, dome: 0.95, uv: true });
    scheme(p, D, D.mat, 'body');
    if (D.relief) relief(p, D.mat, D.relief * S);
    backGrowth(p, sp, D, S, sq);
    onBody(p, sp, D, S, sq);
    return { p, cx, cy, sp, L, H, sq };
  },

  /** Furred quadruped: deep chest, tucked belly, erect limbs. */
  beast(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const sq = D.squash ?? 1;
    const up = backReach(D, S);
    const pad = Math.ceil(H * 0.9) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 1.4 + up) + pad * 2);
    const cx = p.w / 2, cy = pad + up + H * 0.7;
    const arch = D.arch ?? 0.2;
    const sp = spine([
      { x: cx - L / 2, y: cy - H * 0.02 },
      { x: cx - L * 0.14, y: cy - H * arch },
      { x: cx + L * 0.22, y: cy - H * arch * 0.85 },
      { x: cx + L / 2, y: cy - H * (D.neckRise ?? 0.12) },
    ], (t) => H * 0.5 * prof(D.girth || [0.66, 0.9, 0.84, 0.94, 1, 0.72])(t), 30);
    p.next(true);
    tube(p, sp, { mat: D.mat, squash: sq, dome: 0.95, uv: true });
    scheme(p, D, D.mat, 'body');
    backGrowth(p, sp, D, S, sq);
    onBody(p, sp, D, S, sq);
    return { p, cx, cy, sp, L, H, sq };
  },

  /** Upright, two legs, wings folded. */
  bird(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 0.9) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 1.4) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const tl = D.tilt ?? 0.2;
    const sp = spine([
      { x: cx - L * 0.48, y: cy + H * 0.1 * tl * 4 - H * 0.05 },
      { x: cx - L * 0.05, y: cy + H * 0.12 },
      { x: cx + L * 0.46, y: cy - H * 0.2 - H * tl * 0.4 },
    ], (t) => H * 0.5 * prof(D.girth || [0.4, 0.82, 1, 0.95, 0.66])(t), 26);
    p.next(true);
    tube(p, sp, { mat: D.mat, squash: 1, uv: true });
    scheme(p, D, D.mat, 'body');
    onBody(p, sp, D, S, 1);
    return { p, cx, cy, sp, L, H, sq: 1 };
  },

  /**
   * Six legs, three tagmata, a waist you can see. Built as one spine with a
   * pinch in it, so a wasp's petiole and a beetle's absent waist are the same
   * line of code with a different number.
   */
  insect(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const up = backReach(D, S);
    const pad = Math.ceil(H * 0.9) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 1.4 + up) + pad * 2);
    const cx = p.w / 2, cy = pad + up + H * 0.7;
    const wt = D.waistT ?? 0.55;           // where the waist is, from the tail end
    const ab = D.abdomen ?? 0.52, th = D.thorax ?? 0.4, wa = D.waist ?? 0.22;
    const ell = (t, a, b) => (t < a || t > b ? 0 : Math.sqrt(Math.max(0, 1 - ((t - (a + b) / 2) / ((b - a) / 2)) ** 2)));
    const radius = (t) => H * Math.max(ab * ell(t, -0.02, wt) ** (D.abShape ?? 0.8), th * ell(t, wt - 0.02, 1.02) ** 0.7,
      t > wt - 0.08 && t < wt + 0.08 ? wa * 0.5 : 0, 0.02);
    const sp = spine([
      { x: cx - L / 2, y: cy + H * (D.abDrop ?? 0.06) },
      { x: cx, y: cy - H * (D.arch ?? 0.02) },
      { x: cx + L / 2, y: cy - H * 0.04 },
    ], radius, 40);
    p.next(true);
    tube(p, sp, { mat: D.mat, squash: D.squash ?? 1, dome: 1.05, uv: true });
    scheme(p, D, D.mat, 'body');
    if (D.elytra) {
      // a beetle's wing cases: a lacquered dome over the abdomen, split down the top
      const e = D.elytra;
      p.next(true);
      const sp2 = spine([
        { x: cx - L * 0.5, y: cy + H * 0.02 },
        { x: cx - L * 0.1, y: cy - H * 0.12 },
        { x: cx + L * (e.reach ?? 0.2), y: cy - H * 0.04 },
      ], (t) => H * (e.r ?? 0.58) * Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.52) ** 2)) ** 0.6, 30);
      const before = p.uvLen;
      tube(p, sp2, { mat: e.mat || D.mat, dome: 1.1, uv: true });
      p.uvLen = before;
      if (e.stripe) zone(p, e.mat || D.mat, e.stripe.mat, (t, v) => Math.abs(v - (e.stripe.v ?? 0)) < (e.stripe.w ?? 0.14));
      // the seam where the two cases meet
      for (let k = 0; k < sp2.length - 2; k++) {
        const s = sp2[k];
        if (s.r < 1.4) continue;
        const q = surf(s, -0.7);
        p.px(q.x, q.y, e.seam || 'fzInk', { mask: true, keepLayer: true });
      }
      if (e.dots) photophores(p, sp2, e.dots, S, 1);
    }
    backGrowth(p, sp, D, S, 1);
    onBody(p, sp, D, S, 1);
    const thorax = at(sp, (wt + 1) / 2), abdomen = at(sp, wt / 2);
    return { p, cx, cy, sp, L, H, sq: 1, thorax, abdomen, wt };
  },

  /** Eight legs on a fused front, a soft bulb behind. */
  arachnid(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const up = backReach(D, S);
    const pad = Math.ceil(H * 0.9) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 1.4 + up) + pad * 2);
    const cx = p.w / 2, cy = pad + up + H * 0.7;
    const wt = D.waistT ?? 0.52;
    const ab = D.abdomen ?? 0.54, th = D.thorax ?? 0.46;
    const ell = (t, a, b) => (t < a || t > b ? 0 : Math.sqrt(Math.max(0, 1 - ((t - (a + b) / 2) / ((b - a) / 2)) ** 2)));
    const radius = (t) => H * Math.max(ab * ell(t, -0.02, wt + 0.06) ** 0.6, th * ell(t, wt - 0.06, 1.02) ** 0.6, 0.02);
    const sp = spine([
      { x: cx - L / 2, y: cy + H * 0.02 },
      { x: cx, y: cy - H * (D.arch ?? 0.06) },
      { x: cx + L / 2, y: cy },
    ], radius, 36);
    p.next(true);
    tube(p, sp, { mat: D.mat, squash: D.squash ?? 0.92, dome: 1.0, uv: true });
    scheme(p, D, D.mat, 'body');
    if (D.segments) {
      // the hard rings of a scorpion's back, or a tick's riveted shield
      for (let k = 1; k <= D.segments; k++) {
        const s = at(sp, (k / (D.segments + 1)) * wt);
        line(p, surf(s, -1, 0.92), surf(s, 0.6, 0.92), D.seam || 'fzMouth', { only: D.mat });
      }
    }
    if (D.rivets) {
      for (let k = 0; k < D.rivets.n; k++) {
        const s = at(sp, lerp(0.12, wt - 0.05, k / Math.max(1, D.rivets.n - 1)));
        for (const v of D.rivets.rows || [-0.5, 0]) {
          const q = surf(s, v + (k & 1) * 0.12, 0.92);
          blob(p, q.x, q.y, (D.rivets.r ?? 0.8) * S, D.rivets.mat, { dome: S, emissive: D.rivets.glow || 0 });
        }
      }
    }
    backGrowth(p, sp, D, S, 0.92);
    onBody(p, sp, D, S, 0.92);
    const thorax = at(sp, (wt + 1) / 2), abdomen = at(sp, wt / 2);
    return { p, cx, cy, sp, L, H, sq: 0.92, thorax, abdomen, wt };
  },

  /** Legless: one long smooth tube laid in an S. */
  serpent(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const pad = Math.ceil(H * 2.2) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 3.6) + pad * 2);
    const cx = p.w / 2, cy = p.h / 2;
    const sp = spine([
      { x: cx - L / 2, y: cy + H * 0.9 },
      { x: cx - L * 0.18, y: cy - H * 1.1 },
      { x: cx + L * 0.2, y: cy + H * 1.0 },
      { x: cx + L / 2, y: cy - H * 0.2 },
    ], (t) => H * 0.5 * (0.32 + 0.68 * Math.pow(Math.sin(Math.pow(t, 1.5) * Math.PI * 0.96), 0.3)), 44);
    p.next(true);
    tube(p, sp, { mat: D.mat, squash: 0.94, dome: 0.95, uv: true });
    scheme(p, D, D.mat, 'body');
    if (D.diamonds) {
      // a row of hard-edged diamonds down the back
      const dm = D.diamonds;
      zone(p, [D.mat, D.back?.mat].filter(Boolean), dm.mat, (t, v, u) => {
        if (t < (dm.from ?? 0.1) || t > (dm.to ?? 0.92)) return false;
        const cell = (dm.cell ?? 7) * S;
        const f = ((u / cell) % 1 + 1) % 1;
        const tri = 1 - Math.abs(f - 0.5) * 2;
        return v < -1 + tri * (dm.depth ?? 1.1) && v > -1 + tri * (dm.depth ?? 1.1) - (dm.w ?? 0.5);
      });
    }
    onBody(p, sp, D, S, 0.94);
    return { p, cx, cy, sp, L, H, sq: 0.94 };
  },

  /** Long, many-segmented, many-legged. */
  myriapod(D, S) {
    const L = D.bodyL * S, H = D.bodyH * S;
    const up = backReach(D, S);
    const pad = Math.ceil(H * 1.2) + 6;
    const p = new CP(Math.ceil(L) + pad * 2, Math.ceil(H * 1.6 + up) + pad * 2);
    const cx = p.w / 2, cy = pad + up + H * 0.8;
    const n = D.segments || 9;
    const sp = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = cx - L / 2 + t * L;
      const y = cy + Math.sin(t * Math.PI * 2.2) * H * 0.1;
      const r = H * 0.5 * (0.55 + 0.45 * Math.sin(Math.pow(t, 0.8) * Math.PI));
      sp.push({ x, y, r, t, tx: 1, ty: 0, nx: 0, ny: 1, s: t * L });
    }
    p.uvLen = L;
    for (let i = 0; i < n; i++) {
      const s = sp[i];
      p.next(true);
      const m = (i % 2 && D.mat2) ? D.mat2 : D.mat;
      p.ellipse(s.x, s.y, s.r * 1.2, s.r, { mat: m, dome: s.r * 1.15 });
      ellipseUV(p, m, s.x, s.y, s.r * 1.2, s.r);
      if (D.flanges) {
        // a hard lateral blade on every segment, like a trilobite's edge
        const f = D.flanges;
        p.poly([{ x: s.x - s.r * 0.9, y: s.y + s.r * 0.3 }, { x: s.x - s.r * 1.3, y: s.y + s.r * (1.2 + (f.h ?? 0.5)) },
          { x: s.x + s.r * 0.4, y: s.y + s.r * 0.6 }], { mat: f.mat || m, dome: s.r * 0.4, feather: 1, under: true });
      }
    }
    for (let i = 0; i < p.mat.length; i++) if (p.uv[i]) p.U[i] = (p.U[i] / (H * 1.2)) * 0 + (i % p.w) - (cx - L / 2);
    scheme(p, D, D.mat, 'body');
    if (D.mat2) scheme(p, D, D.mat2, 'body');
    if (D.dots) photophores(p, sp, D.dots, S, 1);
    return { p, cx, cy, sp, L, H, sq: 1 };
  },
};

/** Things that sit on the body: glowing dots, a glass sac, blooms, a ruff. */
function onBody(p, sp, D, S, sq) {
  if (D.dots) for (const d of [].concat(D.dots)) photophores(p, sp, d, S, sq);
  if (D.fringe) {
    // a skirt of scales along the belly: the skink's sand-paddles
    const f = D.fringe;
    const n = f.n || 9;
    p.next(false);
    for (let k = 0; k < n; k++) {
      const t = lerp(f.from ?? 0.15, f.to ?? 0.85, k / (n - 1));
      const s = at(sp, t);
      const b = surf(s, 0.75, sq);
      const l = (f.h ?? 2) * S;
      p.poly([{ x: b.x - 1.2 * S, y: b.y }, { x: b.x - 1.6 * S, y: b.y + l }, { x: b.x + 0.6 * S, y: b.y }],
        { mat: f.mat, dome: S, feather: 0.8, under: true });
    }
  }
  if (D.quills) {
    // quills lie back along the body, so they go on top
    const c = D.quills;
    spines(p, sp, { ...c, lean: c.lean ?? 1.4 }, S, sq, false);
  }
  if (D.sac) {
    if (D.sac.on === 'body') {
      const s = at(sp, D.sac.t ?? 0.5);
      const q = surf(s, D.sac.v ?? -0.5, sq);
      const r = D.sac.r * S;
      p.next(true);
      p.ellipse(q.x, q.y, r * 1.2, r, { mat: D.sac.mat || 'fzGlass', dome: r * 1.2 });
      p.ellipse(q.x, q.y + r * 0.25, r * 1.0, r * 0.62, { mat: D.sac.water || 'fzWater', mask: true, dome: r });
      p.px(q.x - r * 0.5, q.y - r * 0.45, 'fzShine');
    }
  }
  if (D.blooms) {
    // flowers grown out of the skin: the iguana is wearing the thing it eats
    const b = D.blooms;
    for (let k = 0; k < (b.n || 3); k++) {
      const s = at(sp, lerp(b.from ?? 0.3, b.to ?? 0.75, k / Math.max(1, (b.n || 3) - 1)));
      const q = surf(s, -0.95, sq);
      p.next(true);
      const r = (b.r ?? 1.4) * S;
      for (let j = 0; j < 5; j++) {
        const a = (j / 5) * Math.PI * 2 - Math.PI / 2;
        p.ellipse(q.x + Math.cos(a) * r * 0.8, q.y - r * 0.6 + Math.sin(a) * r * 0.8, r * 0.62, r * 0.62, { mat: b.mat, dome: r * 0.5, tint: (j & 1) ? 0.05 : -0.04 });
      }
      p.px(q.x, q.y - r * 0.6, b.heart || 'fzGold');
    }
  }
  if (D.prickles) {
    // the white spine clusters of a cactus, in rows, on a lizard
    const c = D.prickles;
    for (let k = 0; k < c.n; k++) {
      const s = at(sp, lerp(c.from ?? 0.12, c.to ?? 0.9, k / (c.n - 1)));
      for (const v of c.rows || [-0.5, 0.05]) {
        const q = surf(s, v + ((k & 1) ? 0.18 : 0), sq);
        p.px(q.x, q.y, c.mat || 'fzIvory', { mask: true, keepLayer: true, tint: 0.1 });
      }
    }
  }
}

/** Where the limbs hang, per plan. */
function planSockets(plan, r, D) {
  const { L, H, cx, cy, sp } = r;
  const rel = (q) => ({ x: q.x - cx, y: q.y - cy });
  const nose = sp[sp.length - 1], root = sp[0];
  switch (plan) {
    case 'insect':
    case 'arachnid': {
      const n = plan === 'insect' ? 3 : 4;
      const legs = [];
      // in side view the legs fan out along the whole body, not just the thorax
      const [la, lb] = D.legSpan || (plan === 'insect' ? [0.36, 0.9] : [0.4, 0.94]);
      for (let i = 0; i < n; i++) {
        const t = lerp(la, lb, n > 1 ? 1 - i / (n - 1) : 0.5);
        const s = at(sp, t);
        legs.push(rel(surf(s, 0.55, r.sq)));
      }
      const hs = at(sp, 0.97);
      return {
        legs,
        head: rel({ x: hs.x + (D.headX ?? 0) * L, y: hs.y - H * (D.neckY ?? 0.04) }),
        tail: rel(surf(at(sp, 0.04), D.tailV ?? 0, r.sq)),
        wing: rel(surf(at(sp, r.wt + (1 - r.wt) * (D.wingT ?? 0.5)), -0.85, r.sq)),
      };
    }
    case 'serpent':
      return { legs: [], head: rel({ x: nose.x - nose.r * 0.4, y: nose.y }), tail: rel({ x: root.x + root.r * 0.4, y: root.y }), wing: null };
    case 'myriapod': {
      const legs = [];
      const n = Math.min(6, sp.length - 2);
      for (let i = 0; i < n; i++) {
        const s = sp[1 + Math.round(i * (sp.length - 3) / Math.max(1, n - 1))];
        legs.push(rel({ x: s.x, y: s.y + s.r * 0.6 }));
      }
      return { legs, head: rel({ x: nose.x + nose.r * 0.2, y: nose.y }), tail: rel({ x: root.x, y: root.y }), wing: null };
    }
    case 'bird': {
      const hs = at(sp, 0.92);
      return {
        legs: [rel(surf(at(sp, D.legT ?? 0.5), 0.6)), rel(surf(at(sp, (D.legT ?? 0.5) - 0.1), 0.62))],
        head: rel({ x: hs.x + (D.headX ?? 0) * L, y: hs.y - H * (D.neckY ?? 0.12) }),
        tail: rel(surf(at(sp, 0.05), D.tailV ?? -0.2)),
        wing: rel(surf(at(sp, D.wingT ?? 0.62), -0.55)),
      };
    }
    default: {
      const sq = r.sq ?? 1;
      const fl = D.plan === 'sprawler';
      return {
        legs: [
          rel(surf(at(sp, D.frontT ?? 0.77), fl ? 0.42 : 0.3, sq)),
          rel(surf(at(sp, D.rearT ?? 0.23), fl ? 0.45 : 0.34, sq)),
        ],
        head: rel({ x: nose.x - nose.r * (D.headIn ?? 0.5), y: nose.y - H * (D.neckY ?? 0.06) }),
        tail: rel({ x: root.x + root.r * 0.4, y: root.y - H * (D.tailY ?? 0.02) }),
        wing: rel(surf(at(sp, 0.55), -0.5, sq)),
      };
    }
  }
}

// ---------------------------------------------------------------------------

const cache = new Map();

export function buildCreature(def) {
  if (cache.has(def.id)) return cache.get(def.id);
  const S = def.scale ?? 1;
  const D = def;
  const plan = D.plan || 'beast';

  const built = (PLAN[plan] || PLAN.beast)(D, S);
  built.p.smoothHeight(1, 0.3);
  const bodyCv = shade(built.p, { rot: 0, outline: D.outline });
  const body = { cv: bodyCv, ox: built.cx, oy: built.cy, L: built.L, H: built.H };
  const sockets = planSockets(plan, built, D);

  const bug = plan === 'insect' || plan === 'arachnid' || plan === 'myriapod';
  const legStyle = D.legStyle || (bug ? 'chitin' : 'curve');
  const footFor = D.foot || (plan === 'sprawler' ? 'splay' : plan === 'beast' ? 'paw' : plan === 'bird' ? 'bird' : 'hook');
  const limbR = (D.limbR ?? (bug ? 1.0 : 1.8)) * S;

  if (!D.legU) sockets.legs = [];
  const legs = {};
  for (const far of [false, true]) {
    if (!D.legU) { legs[far ? 'far' : 'near'] = null; continue; }
    const lo = { style: legStyle, mat: D.legMat, joint: D.jointMat, cuff: D.cuff, bands: D.legBands?.n, bandMat: D.legBands?.mat };
    legs[far ? 'far' : 'near'] = {
      upper: paintLimb(D.legU * S, limbR * (D.thigh ?? (plan === 'sprawler' ? 1.4 : 1)), limbR * 0.8, D, S, far,
        { ...lo, bow: (plan === 'sprawler' ? -1.0 : 0.7) * S, cuff: undefined, rot: plan === 'sprawler' ? 1.2 : Math.PI / 2 }),
      lower: paintLimb(D.legL * S, limbR * 0.8, limbR * (D.shin ?? 0.5), D, S, far,
        { ...lo, bow: (plan === 'sprawler' ? 1.1 : -0.7) * S, foot: footFor, barbs: D.barbs, footMat: D.footMat, padMat: D.padMat, joint: undefined }),
    };
  }

  const arm = D.raptorial ? {
    upper: paintLimb(D.raptorial * S, limbR * 1.3, limbR * 1.1, D, S, false,
      { style: 'chitin', mat: D.armMat, barbs: true, barbMat: D.barbMat, rot: 0.4 }),
    lower: paintLimb(D.raptorial * 0.85 * S, limbR * 1.1, limbR * 0.55, D, S, false,
      { style: 'chitin', mat: D.armMat, barbs: true, barbMat: D.barbMat, foot: 'hook', rot: -1.7 }),
  } : null;

  const neckBase = plan === 'sprawler' ? -0.16 : bug ? -0.5 : -1.05;
  const necked = (D.neck || 0) > 2;
  const rig = {
    id: def.id, def, S, plan,
    arm,
    body,
    head: paintHead(D, S, necked),
    neck: necked ? paintNeck(D, S, neckBase) : null,
    legs,
    legPairs: sockets.legs.length,
    wing: D.wing && sockets.wing ? { near: paintWing(D, S, false), far: paintWing(D, S, true) } : null,
    tail: D.tail ? paintTail(D, S) : null,
    sockets,
  };
  // stand on legs bent to taste: a lizard squats, a heron does not
  const stance = D.stance ?? (plan === 'sprawler' ? 0.66 : bug ? 0.6 : 0.86);
  const hipY = sockets.legs.length ? sockets.legs.reduce((a, l) => a + l.y, 0) / sockets.legs.length : 0;
  rig.standH = D.legU ? hipY + (D.legU + D.legL) * S * stance : body.H * 0.5;
  rig.width = body.L;
  cache.set(def.id, rig);
  return rig;
}

export function clearFaunaCache() { cache.clear(); }
