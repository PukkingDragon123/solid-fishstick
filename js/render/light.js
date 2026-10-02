// CRABDEN - point lights, drawn the way the rest of the game is drawn.
//
// A light is a pre-baked disc of falloff, cut into flat bands with the
// boundaries broken up by the same 4x4 Bayer matrix the sky uses, so the pool
// a lantern throws on the sand is made of square pixels rather than being the
// one smooth thing on the screen. Discs are baked once per radius bucket in
// white and re-coloured once per colour; per frame a light is one drawImage.
//
// Lights are queued and drawn together when the frame is composited, so any
// code can call `renderer.addLight` at any point while it draws - before or
// after `beginLights` - and the light lands on this frame.

import { clamp01 } from '../lib/math.js';

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

/** Radius buckets: fine for small lights, coarse for big ones. */
function bucket(r) {
  if (r <= 24) return Math.max(4, Math.ceil(r / 4) * 4);
  if (r <= 96) return Math.ceil(r / 8) * 8;
  return Math.min(512, Math.ceil(r / 24) * 24);
}

/**
 * A white disc whose alpha falls from 1 at the centre to 0 at R, in `steps`
 * flat bands with a dithered edge between each. `fall` shapes the curve; the
 * default matches the old gradient (1, 0.4 at half, 0 at the edge).
 */
export function bakeDisc(R, steps = 7, fall = 1.35, p = 1) {
  const S = R * 2;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y += p) {
    for (let x = 0; x < S; x += p) {
      const dx = (x + p / 2 - R) / R, dy = (y + p / 2 - R) / R;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= 1) continue;
      const v = Math.pow(1 - r, fall);
      const f = v * steps;
      let band = Math.floor(f);
      if (f - band > BAYER[(y / p) & 3][(x / p) & 3]) band += 1;
      const a = Math.round(255 * Math.min(1, band / steps));
      if (!a) continue;
      for (let yy = 0; yy < p; yy++) {
        for (let xx = 0; xx < p; xx++) {
          const o = ((y + yy) * S + (x + xx)) * 4;
          d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export class LightPool {
  constructor() {
    this.queue = [];
    this._white = new Map();
    this._tint = new Map();
    this.count = 0;
  }

  push(x, y, r, color, alpha, opts) {
    if (!(r > 0) || !(alpha > 0.004)) return;
    this.queue.push({ x, y, r, color: color || '#ffffff', alpha, opts: opts || null });
  }

  /** A disc of radius bucket `rb` in `color`, cached. */
  sprite(rb, color) {
    const key = rb + color;
    let c = this._tint.get(key);
    if (c) { this._tint.delete(key); this._tint.set(key, c); return c; }
    let w = this._white.get(rb);
    if (!w) {
      w = bakeDisc(rb);
      if (this._white.size > 24) this._white.delete(this._white.keys().next().value);
      this._white.set(rb, w);
    }
    c = canvas(w.width, w.height);
    const g = c.getContext('2d');
    g.drawImage(w, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    if (this._tint.size > 48) this._tint.delete(this._tint.keys().next().value);
    this._tint.set(key, c);
    return c;
  }

  /** How bright a light is this frame, 0..~1.15, from its flicker. */
  static flicker(t, amt, seed) {
    if (!amt) return 1;
    const s = seed * 1.7;
    const n = Math.sin(t * 9.1 + s) * 0.45 + Math.sin(t * 23.3 + s * 2.3) * 0.3
      + Math.sin(t * 4.2 + s * 0.7) * 0.25;
    // the odd gutter, like a flame catching a draught
    const gut = Math.max(0, Math.sin(t * 1.3 + s * 3.1)) > 0.985 ? -0.5 : 0;
    return 1 + (n * 0.16 + gut * 0.3) * amt;
  }

  /**
   * Resolve the queue into screen space. World-space lights (`opts.world`)
   * go through the camera; everything else is already in screen pixels.
   */
  resolve(cam, t) {
    const out = [];
    for (const L of this.queue) {
      const o = L.opts;
      let x = L.x, y = L.y, r = L.r;
      if (o && o.world && cam) {
        const s = cam.worldToScreen(x, y);
        x = s.x; y = s.y; r *= cam.zoom;
      }
      const fl = o && o.flicker ? LightPool.flicker(t, o.flicker === true ? 1 : o.flicker,
        o.seed ?? (L.x * 0.013 + L.y * 0.007)) : 1;
      out.push({ x, y, r: r * (1 + (fl - 1) * 0.35), a: L.alpha * fl, color: L.color, o });
    }
    return out;
  }

  /** Draw the lights into the light layer (already in 'lighter'). */
  drawInto(l, lights, vw, vh) {
    let n = 0;
    for (const L of lights) {
      const r = L.r;
      if (L.x + r < 0 || L.y + r < 0 || L.x - r > vw || L.y - r > vh) continue;
      const rb = bucket(r);
      const spr = this.sprite(rb, L.color);
      l.globalAlpha = clamp01(L.a);
      const x0 = Math.round(L.x - r), y0 = Math.round(L.y - r), S = Math.round(r * 2);
      l.drawImage(spr, x0, y0, S, S);
      n++;
    }
    l.globalAlpha = 1;
    this.count = n;
  }

  /**
   * The light in the air: what a fire does to the dust around it, laid over
   * the lit frame. Lights opt in with `opts.glow`; `night` scales it so a
   * lantern in daylight is not a smear.
   */
  drawGlow(s, lights, vw, vh, night, dflt) {
    s.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const g = L.o && L.o.glow != null ? L.o.glow : dflt;
      if (!(g > 0)) continue;
      const a = clamp01(L.a) * g * (0.25 + night * 0.75) * 0.32;
      if (a < 0.01) continue;
      const r = L.r * 0.62;
      if (L.x + r < 0 || L.y + r < 0 || L.x - r > vw || L.y - r > vh) continue;
      const spr = this.sprite(bucket(r), L.color);
      s.globalAlpha = a;
      const S = Math.round(r * 2);
      s.drawImage(spr, Math.round(L.x - r), Math.round(L.y - r), S, S);
    }
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';
  }

  clear() { this.queue.length = 0; }
}
