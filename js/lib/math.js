// CRABDEN - math, noise and easing helpers.
// Everything deterministic runs off explicit seeds so the desert regenerates
// identically between sessions.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp01(inv(a, b, v)));
export const smoothstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smootherstep = (t) => { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); };

// Frame-rate independent exponential approach. `rate` = fraction remaining per second.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.pow(rate, dt));

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
export function angleDelta(a, b) {
  return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = TAU / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32) + string hashing
// ---------------------------------------------------------------------------

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Small convenience wrapper around a seeded stream. */
export class Rng {
  constructor(seed) {
    this.next = mulberry32(typeof seed === 'string' ? hashStr(seed) : seed | 0);
  }
  float(a = 1, b) { return b === undefined ? this.next() * a : a + this.next() * (b - a); }
  int(a, b) { return b === undefined ? Math.floor(this.next() * a) : a + Math.floor(this.next() * (b - a + 1)); }
  bool(p = 0.5) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  /** Gaussian-ish via sum of uniforms. */
  gauss(mean = 0, sd = 1) {
    const u = (this.next() + this.next() + this.next() + this.next() - 2) * 0.8660254;
    return mean + u * sd;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted(entries) {
    // entries: [{w, ...}] -> picks one respecting weights
    let total = 0;
    for (const e of entries) total += e.w || 1;
    let r = this.next() * total;
    for (const e of entries) { r -= (e.w || 1); if (r <= 0) return e; }
    return entries[entries.length - 1];
  }
}

// ---------------------------------------------------------------------------
// Value noise / fbm. Hash based, no tables to allocate, stable across reloads.
// ---------------------------------------------------------------------------

function hash2(x, y, seed) {
  let h = seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Fractal brownian motion in [0,1]. */
export function fbm2(x, y, octaves = 4, seed = 0, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged noise, good for dune crests and rock spines. */
export function ridge2(x, y, octaves = 4, seed = 0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(x * freq, y * freq, seed + i * 7717) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/** Cheap 1D wobble for wind, flags, tails. */
export function wobble(t, seed = 0) {
  return Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 6.7 + seed * 5.1) * 0.1;
}

// ---------------------------------------------------------------------------
// Colour helpers (pixel palettes are authored as hex, mixed at runtime)
// ---------------------------------------------------------------------------

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r, g, b) {
  return '#' + ((1 << 24) | (clamp(r | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(b | 0, 0, 255)).toString(16).slice(1);
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
export function shadeHex(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) return rgbToHex(lerp(r, 255, amt), lerp(g, 255, amt), lerp(b, 255, amt));
  return rgbToHex(lerp(r, 0, -amt), lerp(g, 0, -amt), lerp(b, 0, -amt));
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Uniform point in a disc. */
export function inDisc(rng, radius) {
  const a = rng.float(TAU);
  const r = Math.sqrt(rng.next()) * radius;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export function formatTime(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m < 10 ? '0' : ''}${m}${ampm}`;
}

export function roman(n) {
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}
