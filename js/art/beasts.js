// CRABDEN - what lives out there, far off.
//
// The backdrop is not empty. Herds of long-legged grazers walk the far
// ridges, birds wheel over something dead, dust devils wander across the
// flats, and every so often something very much bigger than any of it walks
// slowly through the haze at the edge of the world.
//
// All of it is deterministic in time and place, a handful of pixels drawn
// live (no sprites to bake), and tinted by how far away it is the same way
// the strip it walks on is.

import { clamp01, mixHex } from '../lib/math.js';
import { hash2i } from '../render/pixel.js';
import { DEPTH, groundTop } from './wasteland.js';

const SIL = '#2e2224';       // a silhouette against the light, before the haze

function pingPong(u0, span, v, t) {
  const p = ((v * t) % (span * 2) + span * 2) % (span * 2);
  return p < span ? { u: u0 + p, dir: 1 } : { u: u0 + span * 2 - p, dir: -1 };
}

export class Life {
  constructor(seed) { this.seed = seed; }

  /** Sky things that are not weather: nothing yet besides what strips carry. */
  drawSky() {}

  /** Called after each strip is drawn, so a creature sits at its own depth. */
  drawAfter(ctx, cam, weather, geo, id, bd) {
    const t = bd.t;
    if (id === 'range') this._walker(ctx, geo, bd, t);
    else if (id === 'buttes') this._herds(ctx, geo, bd, t, 'buttes', 0.55);
    else if (id === 'mesas') this._herds(ctx, geo, bd, t, 'mesas', 1.3);
    else if (id === 'wrecks') { this._devils(ctx, geo, bd, t, weather); this._birds(ctx, geo, bd, t); }
  }

  _strip(geo, id) { return geo.strips[DEPTH[id].index]; }

  _col(bd, id, extra = 0) {
    const d = DEPTH[id];
    const a = clamp01(bd.air.k(d) * 0.9 + extra);
    return mixHex(SIL, bd.air.tints[d.index], a);
  }

  // -- the walker ---------------------------------------------------------

  /**
   * A colossal strider: a long hunched body slung between four legs taller
   * than the mesas, walking the far haze at the pace of a cloud. It crosses
   * the whole horizon in a few minutes and then, eventually, comes back.
   */
  _walker(ctx, geo, bd, t) {
    const st = this._strip(geo, 'range');
    const d = st.d;
    const vw = geo.vw;
    const { u, dir } = pingPong(-60, 900, 1.6, t + 40);
    const g = st.g;
    const sx = vw / 2 + (u - st.uCam) * g;
    if (sx < -120 || sx > vw + 120) return;
    const gy = st.base - groundTop(d, u) * g;
    const col = this._col(bd, 'range', 0.04);
    ctx.fillStyle = col;
    const H = 46 * g;                       // hip height
    const ph = t * 0.55;                    // stride
    const bob = Math.sin(ph * 2) * 1.2 * g;
    const bodyY = gy - H + bob;
    // legs: two pairs, each a thigh up from the foot and a shin down to it
    const feet = [-14, -6, 8, 16];
    for (let i = 0; i < 4; i++) {
      const phase = ph + (i % 2 ? Math.PI : 0) + (i >= 2 ? Math.PI / 2 : 0);
      const lift = Math.max(0, Math.sin(phase)) * 5 * g;
      const fx = sx + (feet[i] + Math.cos(phase) * 6) * g * dir;
      const hx = sx + feet[i] * 0.55 * g * dir;
      const kx = (fx + hx) / 2 + 7 * g * dir, ky = bodyY - 8 * g;
      line(ctx, hx, bodyY + 2, kx, ky);
      line(ctx, hx + 1, bodyY + 2, kx + 1, ky);
      line(ctx, kx, ky, fx, gy - lift);
      ctx.fillRect(Math.round(fx - 1), Math.round(gy - lift - 1), 3, 2);
    }
    // body: a long hunched hull, round above and below, and a head hanging
    // forward on a neck
    for (let k = -18; k <= 18; k++) {
      const x = Math.round(sx + k * g * dir);
      const e = Math.sqrt(Math.max(0, 1 - (k / 18.5) ** 2));
      const up = e * 8 + Math.max(0, 1 - Math.abs(k + 4) / 10) * 4;
      const dn = e * 5;
      ctx.fillRect(x, Math.round(bodyY - up), Math.max(1, Math.ceil(g)), Math.max(1, Math.round(up + dn)));
    }
    const nx = sx + 18 * g * dir, ny = bodyY - 4;
    const hx2 = sx + 27 * g * dir, hy2 = bodyY + 6 + Math.sin(ph) * 1.5;
    line(ctx, nx, ny, hx2, hy2);
    line(ctx, nx, ny + 1, hx2, hy2 + 1);
    ctx.fillRect(Math.round(hx2 - 2), Math.round(hy2 - 1), 4, 3);
  }

  // -- herds ---------------------------------------------------------------

  /** Grazers on the far dunes: humped, long-legged, walking in a loose file. */
  _herds(ctx, geo, bd, t, id, scale) {
    const st = this._strip(geo, id);
    const d = st.d;
    const vw = geo.vw, g = st.g;
    const half = vw / 2 / g + 60;
    const SP = id === 'mesas' ? 520 : 700;
    const j0 = Math.floor((st.uCam - half - 300) / SP), j1 = Math.floor((st.uCam + half + 300) / SP);
    const col = this._col(bd, id);
    ctx.fillStyle = col;
    for (let j = j0; j <= j1; j++) {
      const hs = this.seed + j * 31 + d.index * 977;
      if (hash2i(j, 1, hs) > 0.55) continue;
      const n = 3 + Math.floor(hash2i(j, 2, hs) * 5);
      const speed = 2.2 + hash2i(j, 3, hs) * 2;
      const { u: hu, dir } = pingPong(j * SP, SP * 0.7, speed, t + hash2i(j, 4, hs) * 400);
      const kind = hash2i(j, 5, hs) < 0.6 ? 0 : 1;
      for (let i = 0; i < n; i++) {
        const u = hu - dir * (i * (13 + hash2i(i, 6, hs) * 8)) + (hash2i(i, 7, hs) - 0.5) * 6;
        const sx = vw / 2 + (u - st.uCam) * g;
        if (sx < -20 || sx > vw + 20) continue;
        const gy = st.base - groundTop(d, u) * g;
        const sz = scale * g * (0.85 + hash2i(i, 8, hs) * 0.3) * (i === n - 1 && n > 4 ? 0.6 : 1);
        beast(ctx, sx, gy, sz, t * speed * 0.9 + i * 1.7, dir, kind);
      }
    }
  }

  // -- birds ---------------------------------------------------------------

  /** Carrion birds turning slow circles over something that has stopped moving. */
  _birds(ctx, geo, bd, t) {
    const st = this._strip(geo, 'wrecks');
    const vw = geo.vw, g = st.g;
    const SP = 760;
    const half = vw / 2 / g + 80;
    const j0 = Math.floor((st.uCam - half) / SP), j1 = Math.floor((st.uCam + half) / SP);
    ctx.fillStyle = this._col(bd, 'wrecks', -0.1);
    for (let j = j0; j <= j1; j++) {
      const hs = this.seed + j * 53;
      if (hash2i(j, 1, hs) > 0.6) continue;
      const cu = j * SP + hash2i(j, 2, hs) * SP * 0.6;
      const cx = vw / 2 + (cu - st.uCam) * g;
      const cy = st.base - (54 + hash2i(j, 3, hs) * 30) * g;
      const n = 2 + Math.floor(hash2i(j, 4, hs) * 3);
      const R = (26 + hash2i(j, 5, hs) * 18) * g;
      for (let i = 0; i < n; i++) {
        const a = t * (0.32 + i * 0.03) + i * 2.3;
        const x = cx + Math.cos(a) * R * (1 - i * 0.12);
        const y = cy + Math.sin(a) * R * 0.28 + i * 4;
        // gliding mostly, a few beats of the wings now and then
        const flap = Math.sin(t * 9 + i) > 0.6 && Math.sin(t * 0.7 + i * 3) > 0.3;
        bird(ctx, x, y, Math.sin(a) > 0 ? 1 : -1, flap, g);
      }
    }
  }

  // -- dust devils ---------------------------------------------------------

  _devils(ctx, geo, bd, t, weather) {
    if ((weather.rain || 0) > 0.2) return;
    const st = this._strip(geo, 'wrecks');
    const d = st.d;
    const vw = geo.vw, g = st.g;
    const SP = 900;
    const half = vw / 2 / g + 60;
    const j0 = Math.floor((st.uCam - half) / SP), j1 = Math.floor((st.uCam + half) / SP);
    const base = mixHex(bd.air.tints[d.index], '#fff2d8', 0.25);
    for (let j = j0; j <= j1; j++) {
      const hs = this.seed + j * 71;
      if (hash2i(j, 1, hs) > 0.5) continue;
      // each one lives for a while, dies down, and spins up again
      const life = Math.sin(t * 0.045 + hash2i(j, 2, hs) * 6.28);
      if (life < 0.15) continue;
      const k = clamp01((life - 0.15) / 0.4);
      const u = j * SP + 200 + Math.sin(t * 0.03 + j) * 160;
      const sx = vw / 2 + (u - st.uCam) * g;
      if (sx < -30 || sx > vw + 30) continue;
      const gy = st.base - groundTop(d, u) * g + 1;
      const Hd = (34 + hash2i(j, 3, hs) * 26) * g * (0.5 + k * 0.5);
      ctx.fillStyle = base;
      for (let y = 0; y < Hd; y++) {
        const f = y / Hd;
        const w = 1.5 + f * f * 9 * g;
        const off = Math.sin(t * 2.6 + y * 0.18) * (1 + f * 3) + f * 4;
        const a = (1 - f * 0.85) * 0.3 * k;
        ctx.globalAlpha = a;
        const yy = Math.round(gy - y);
        for (let x = -w; x <= w; x += 1) {
          if (hash2i(Math.round(x * 3 + t * 20), yy, hs) > 0.55) continue;
          ctx.fillRect(Math.round(sx + off + x), yy, 1, 1);
        }
      }
      // the skirt of dust it kicks up at the bottom
      ctx.globalAlpha = 0.3 * k;
      ctx.fillRect(Math.round(sx - 8 * g), Math.round(gy - 2), Math.round(16 * g), 2);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------------------

function line(ctx, x0, y0, x1, y1) {
  let x = Math.round(x0), y = Math.round(y0);
  const xe = Math.round(x1), ye = Math.round(y1);
  const dx = Math.abs(xe - x), dy = -Math.abs(ye - y);
  const sx = x < xe ? 1 : -1, sy = y < ye ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 400; i++) {
    ctx.fillRect(x, y, 1, 1);
    if (x === xe && y === ye) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

/**
 * One grazer, drawn from pixels: kind 0 is a humped stilt-legged thing with
 * a long neck that it carries low; kind 1 is a broad shelled ox with horns.
 * `ph` is its stride, so the legs scissor as it goes.
 */
function beast(ctx, x, gy, sz, ph, dir, kind) {
  const P = (dx, dy, w = 1, h = 1) => ctx.fillRect(Math.round(x + dx * sz * dir - (dir < 0 ? w - 1 : 0)), Math.round(gy - dy * sz), w, h);
  const legH = kind === 0 ? 6 : 3.5;
  const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
  // legs
  for (const [lx, s] of [[-3, s1], [-2, s2], [3, s2], [4, s1]]) {
    const fx = lx + s * 1.2;
    const top = legH, lift = Math.max(0, s) * 0.8;
    for (let k = 0; k < Math.ceil(legH * sz); k++) {
      const f = k / (legH * sz);
      ctx.fillRect(Math.round(x + (lx + (fx - lx) * (1 - f)) * sz * dir), Math.round(gy - lift * sz - k), 1, 1);
    }
    void top;
  }
  const by = legH + Math.abs(Math.sin(ph * 2)) * 0.3;
  if (kind === 0) {
    // body with a hump
    for (let k = -4; k <= 5; k++) {
      const th = 2.4 + Math.max(0, 1 - Math.abs(k + 0.5) / 3) * 1.8;
      P(k, by + th, 1, Math.max(1, Math.round(th * sz)));
    }
    // neck down and forward, head
    const hy = by + 1 + Math.sin(ph * 0.5) * 0.6;
    for (let k = 0; k < 4; k++) P(5.5 + k, by + 2.6 - (k / 4) * (2.6 - hy + by) );
    P(9.5, hy + 0.5, 2, 2);
  } else {
    for (let k = -5; k <= 5; k++) {
      const th = 2 + Math.sqrt(Math.max(0, 1 - (k / 5.5) ** 2)) * 2.4;
      P(k, by + th, 1, Math.max(1, Math.round(th * sz)));
    }
    P(6, by + 2, 2, 2);
    P(7, by + 3.5, 1, 1);
    P(5.5, by + 4, 1, 1);
  }
}

function bird(ctx, x, y, dir, flap, g) {
  const s = Math.max(1, Math.round(g));
  const X = Math.round(x), Y = Math.round(y);
  ctx.fillRect(X - s, Y, 3 * s, s);                     // body
  if (flap) {
    ctx.fillRect(X - 3 * s, Y - 2 * s, 2 * s, s); ctx.fillRect(X - 2 * s, Y - s, s, s);
    ctx.fillRect(X + 2 * s, Y - 2 * s, 2 * s, s); ctx.fillRect(X + 2 * s, Y - s, s, s);
  } else {
    ctx.fillRect(X - 4 * s, Y - s, 3 * s, s); ctx.fillRect(X + 2 * s, Y - s, 3 * s, s);
    ctx.fillRect(X - 5 * s, Y, s, s); ctx.fillRect(X + 5 * s, Y, s, s);
  }
  ctx.fillRect(X + (dir > 0 ? 2 : -2) * s, Y + s, s, s);   // head down, looking
}
