// CRABDEN - the sea, while there still was one.
//
// The game opens thirty metres under water, because that is where the animal
// went to sleep. None of this is the world renderer: it is a self-contained
// scene drawn straight to the screen, so the sea can have its own light, its
// own colour and its own physics for eleven seconds and then stop existing.
//
// It runs on one clock and reads three numbers off it:
//
//   settle  the crab coming down out of the blue and landing
//   bury    the crab digging itself into the seabed until only a mound shows
//   drain   the sea going away, which takes a thousand years and eight seconds
//
// Everything else - kelp, shoals, god rays, caustics, silt - is a function of
// time and a seed, so it costs nothing to keep and nothing to skip.

import { clamp, clamp01, lerp, smoothstep, TAU, mulberry32 } from '../lib/math.js';
import { drawText, textWidth } from '../lib/font.js';
import { crabPlates } from '../art/crabpose.js';

// the timeline, in seconds
const T_LAND = 3.2;          // the crab touches down
const T_DIG = 4.4;           // it starts to dig
const T_BURIED = 9.0;        // only a mound left
const T_DRAIN = 11.0;        // the sea starts to go
const T_DRY = 20.5;          // the sea is gone
const T_END = 23.0;          // hand back to the desert

export class OceanIntro {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.done = false;
    this.rng = mulberry32(0x0cea11);
    this._build();
  }

  get active() { return !this.done; }
  /** 0 while the sea is whole, 1 once it has gone. */
  get drain() { return smoothstep(clamp01((this.t - T_DRAIN) / (T_DRY - T_DRAIN))); }
  /** 1 once the animal is under the sand. */
  get bury() { return clamp01((this.t - T_DIG) / (T_BURIED - T_DIG)); }
  /** How far through the handover to the desert we are. */
  get handover() { return clamp01((this.t - T_DRY) / (T_END - T_DRY)); }

  _build() {
    const r = this.rng;
    // kelp: rooted on the seabed, each with its own sway and length
    this.kelp = [];
    for (let i = 0; i < 26; i++) {
      this.kelp.push({
        x: r(), h: 0.30 + r() * 0.50, w: 1 + r() * 2.2,
        ph: r() * TAU, sp: 0.5 + r() * 0.7, hue: r(),
        leaves: 4 + Math.floor(r() * 5), lean: (r() - 0.5) * 0.5,
      });
    }
    // three shoals, each a cloud of darts following one path
    this.shoals = [];
    for (let i = 0; i < 3; i++) {
      const n = 14 + Math.floor(r() * 12);
      const fish = [];
      for (let k = 0; k < n; k++) {
        fish.push({ dx: (r() - 0.5) * 0.16, dy: (r() - 0.5) * 0.09, ph: r() * TAU, s: 0.7 + r() * 0.7 });
      }
      this.shoals.push({
        fish, y: 0.18 + r() * 0.44, sp: 0.035 + r() * 0.05,
        dir: r() < 0.5 ? -1 : 1, off: r(), amp: 0.05 + r() * 0.06, hue: r(),
      });
    }
    // silt and plankton
    this.motes = [];
    for (let i = 0; i < 150; i++) {
      this.motes.push({ x: r(), y: r(), s: 0.4 + r() * 1.3, ph: r() * TAU, sp: 0.2 + r() * 0.6 });
    }
    // the seabed profile, as a handful of low dunes
    this.bed = [];
    for (let i = 0; i < 9; i++) this.bed.push({ x: r(), w: 0.10 + r() * 0.22, h: r() * 0.05 });
    // rocks and coral heads
    this.rocks = [];
    for (let i = 0; i < 14; i++) {
      this.rocks.push({ x: r(), w: 0.01 + r() * 0.035, h: 0.008 + r() * 0.03, k: r() });
    }
    this.puffs = [];
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    // silt thrown up by the digging
    if (this.t > T_DIG && this.t < T_BURIED && Math.random() < dt * 26) {
      this.puffs.push({
        x: 0.5 + (Math.random() - 0.5) * 0.22, y: 0.70 + (Math.random() - 0.5) * 0.04,
        r: 0.01 + Math.random() * 0.02, t: 0, life: 2.2 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * 0.03, vy: -0.006 - Math.random() * 0.012,
      });
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.99; p.vy *= 0.99;
      if (p.t > p.life) this.puffs.splice(i, 1);
    }
    if (this.t > T_END) this.done = true;
  }

  // -------------------------------------------------------------------------

  /** Where the seabed is at x (0..1), in screen pixels. */
  _bedY(x, vh) {
    let y = 0.755;
    for (const b of this.bed) {
      const d = Math.abs(x - b.x) / b.w;
      if (d < 1) y -= b.h * (1 - d * d) * (3 - 2 * d) * 0.5;
    }
    return y * vh;
  }

  /** The waterline, which starts above the screen and ends below the bed. */
  _waterY(vh) {
    const d = this.drain;
    return lerp(-vh * 0.10, vh * 1.06, d * d * (3 - 2 * d));
  }

  draw(ctx, vw, vh) {
    const t = this.t;
    const wy = this._waterY(vh);
    const dr = this.drain;

    // -- what is above the water: sky, and eventually a desert sun ----------
    this._sky(ctx, vw, vh, wy, dr);

    // -- the water column ---------------------------------------------------
    if (wy < vh) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, Math.max(0, wy), vw, vh - Math.max(0, wy));
      ctx.clip();
      this._water(ctx, vw, vh, wy, dr);
      ctx.restore();
    }

    // -- the seabed, wet below the line and dry above it --------------------
    this._bed(ctx, vw, vh, wy, dr);

    // -- the animal ---------------------------------------------------------
    this._crab(ctx, vw, vh, wy);

    // -- silt, and the surface seen from underneath -------------------------
    if (wy < vh) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, Math.max(0, wy), vw, vh - Math.max(0, wy));
      ctx.clip();
      this._silt(ctx, vw, vh);
      this._surface(ctx, vw, vh, wy);
      ctx.restore();
    }

    // -- the years going past ------------------------------------------------
    if (t > T_DRAIN - 0.4 && t < T_DRY + 1.6) this._years(ctx, vw, vh);

    // the handover to the desert is a dissolve, and the game does it by
    // fading this whole scene out over the world it has already drawn
  }

  /** Above the waterline: first a bright surface, later a desert sky. */
  _sky(ctx, vw, vh, wy, dr) {
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, wy));
    if (dr < 0.5) {
      g.addColorStop(0, '#bfe9f2');
      g.addColorStop(1, '#6fc4d6');
    } else {
      const k = (dr - 0.5) * 2;
      g.addColorStop(0, k > 0.5 ? '#7fb4d8' : '#9fd0e0');
      g.addColorStop(1, k > 0.5 ? '#e6c898' : '#bfd8d2');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, Math.max(0, wy));
    // the sun burns through as the water goes
    if (dr > 0.25) {
      const a = clamp01((dr - 0.25) / 0.5);
      const sx = vw * 0.72, sy = vh * 0.18;
      const rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, vh * 0.5);
      rg.addColorStop(0, `rgba(255,244,206,${0.55 * a})`);
      rg.addColorStop(0.3, `rgba(255,226,158,${0.20 * a})`);
      rg.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, vw, Math.max(0, wy));
      ctx.fillStyle = `rgba(255,250,228,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(sx, sy, vh * 0.035, 0, TAU); ctx.fill();
    }
  }

  /** Thirty metres of water, with the light coming down through it. */
  _water(ctx, vw, vh, wy, dr) {
    const top = wy, depth = vh - wy;
    const g = ctx.createLinearGradient(0, top, 0, vh);
    g.addColorStop(0, '#4fb2c6');
    g.addColorStop(0.35, '#1d7f9c');
    g.addColorStop(0.75, '#0d4c68');
    g.addColorStop(1, '#07303f');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, vw, vh - top);

    // god rays: wide wedges leaning off the vertical, swaying
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const ph = i * 1.7;
      const x = vw * ((i + 0.5) / 7) + Math.sin(this.t * 0.22 + ph) * vw * 0.03;
      const lean = Math.sin(this.t * 0.17 + ph) * 0.10 + 0.08;
      const w0 = vw * 0.016, w1 = vw * (0.05 + (i % 3) * 0.015);
      const a = (0.05 + 0.035 * (0.5 + 0.5 * Math.sin(this.t * 0.5 + ph))) * (1 - dr * 0.7);
      const gg = ctx.createLinearGradient(x, top, x + depth * lean, vh);
      gg.addColorStop(0, `rgba(210,246,255,${a})`);
      gg.addColorStop(0.6, `rgba(150,220,240,${a * 0.4})`);
      gg.addColorStop(1, 'rgba(120,200,225,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(x - w0, top);
      ctx.lineTo(x + w0, top);
      ctx.lineTo(x + depth * lean + w1, vh);
      ctx.lineTo(x + depth * lean - w1, vh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // the far kelp forest, then the shoals, then the near kelp
    this._kelp(ctx, vw, vh, 0, dr);
    this._shoals(ctx, vw, vh, dr);
    this._kelp(ctx, vw, vh, 1, dr);
  }

  /**
   * Kelp. Each strand is a chain of segments that lags behind the one below
   * it, so the whole thing rolls rather than wags, and it browns and folds
   * over as the water goes.
   */
  _kelp(ctx, vw, vh, near, dr) {
    for (const k of this.kelp) {
      if ((k.hue > 0.5 ? 1 : 0) !== near) continue;
      const x0 = k.x * vw;
      const base = this._bedY(k.x, vh);
      const wy = this._waterY(vh);
      // out of the water it wilts flat
      const dry = clamp01((wy - (base - k.h * vh)) / (k.h * vh * 0.9));
      const len = k.h * vh * (1 - dry * 0.55);
      const segs = 9;
      ctx.lineCap = 'round';
      let px = x0, py = base;
      for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        const sway = Math.sin(this.t * k.sp + k.ph - u * 2.2) * (10 + u * 26) * (1 - dr * 0.6);
        const fall = dry * u * u * 46 * (k.lean < 0 ? -1 : 1);
        const nx = x0 + sway * u + k.lean * u * 30 + fall;
        const ny = base - len * u;
        const lit = 0.35 + u * 0.5;
        ctx.strokeStyle = dry > 0.5
          ? `rgba(${Math.round(120 + lit * 60)},${Math.round(96 + lit * 40)},${Math.round(52 + lit * 24)},0.95)`
          : `rgba(${Math.round(24 + lit * 40)},${Math.round(78 + lit * 70)},${Math.round(52 + lit * 40)},0.95)`;
        ctx.lineWidth = k.w * (1 - u * 0.45) * (near ? 1.5 : 1);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        // blades
        if (i % 2 === 0 && i < segs) {
          const bl = 5 + u * 9;
          const side = i % 4 === 0 ? 1 : -1;
          ctx.lineWidth = Math.max(1, k.w * 0.7);
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.quadraticCurveTo(nx + side * bl, ny + 1, nx + side * bl * 1.5, ny + bl * 0.55);
          ctx.stroke();
        }
        px = nx; py = ny;
      }
    }
  }

  /** Shoals: a cloud of darts holding formation around a moving centre. */
  _shoals(ctx, vw, vh, dr) {
    if (dr > 0.55) return;
    const a = 1 - clamp01(dr / 0.55);
    for (const s of this.shoals) {
      const u = (s.off + this.t * s.sp * s.dir + 2) % 1;
      const cx = u * (vw * 1.3) - vw * 0.15;
      const cy = s.y * vh + Math.sin(this.t * 0.5 + s.off * 6) * s.amp * vh;
      for (const f of s.fish) {
        const fx = cx + f.dx * vw + Math.sin(this.t * 2.2 + f.ph) * 3;
        const fy = cy + f.dy * vh + Math.cos(this.t * 1.8 + f.ph) * 2.5;
        if (fx < -10 || fx > vw + 10) continue;
        const L = 3.2 * f.s, H = 1.3 * f.s;
        const d = s.dir;
        ctx.globalAlpha = a * (0.55 + 0.45 * f.s);
        ctx.fillStyle = s.hue > 0.6 ? '#e9d9a8' : s.hue > 0.3 ? '#bcd8e0' : '#8fb8c4';
        ctx.beginPath();
        ctx.ellipse(fx, fy, L, H, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(fx - d * L, fy);
        ctx.lineTo(fx - d * L * 2.0, fy - H * 1.3);
        ctx.lineTo(fx - d * L * 2.0, fy + H * 1.3);
        ctx.closePath();
        ctx.fill();
        // the flash off one flank as it turns
        const tw = Math.sin(this.t * 3.4 + f.ph);
        if (tw > 0.86) {
          ctx.globalAlpha = a;
          ctx.fillStyle = '#fbfdff';
          ctx.fillRect(Math.round(fx - L * 0.3), Math.round(fy - H * 0.5), Math.max(1, L * 0.6), 1);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The seabed: ripples, rocks, and caustics crawling over all of it. */
  _bed(ctx, vw, vh, wy, dr) {
    // the whole bed wet first, then the part that is above the waterline
    // painted dry over the top of it - the split is a horizon, not a column
    const step = 3;
    const paint = (dry) => {
      for (let x = 0; x < vw; x += step) {
        const y = this._bedY(x / vw, vh);
        const g = ctx.createLinearGradient(0, y, 0, vh);
        if (dry) { g.addColorStop(0, '#e2c288'); g.addColorStop(1, '#a07f52'); }
        else { g.addColorStop(0, '#a9906a'); g.addColorStop(1, '#3d3a30'); }
        ctx.fillStyle = g;
        ctx.fillRect(x, y, step + 1, vh - y);
      }
    };
    paint(false);
    if (wy > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, vw, wy);
      ctx.clip();
      paint(true);
      ctx.restore();
      // a damp band just under the line, where the water has only just left
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#8a7350';
      ctx.fillRect(0, Math.round(wy), vw, 3);
      ctx.globalAlpha = 1;
    }
    // ripples in the sand
    for (let i = 0; i < 90; i++) {
      const u = (i * 0.0139 + 0.03) % 1;
      const y = this._bedY(u, vh) + (i % 7) * (vh * 0.014) + vh * 0.012;
      if (y > vh) continue;
      const wet = y > wy;
      ctx.globalAlpha = wet ? 0.16 : 0.12;
      ctx.fillStyle = wet ? '#d8c49a' : '#f2dcae';
      ctx.fillRect(u * vw - 12, Math.round(y), 24 + (i % 5) * 8, 1);
    }
    ctx.globalAlpha = 1;
    // rocks and coral heads
    for (const r of this.rocks) {
      const x = r.x * vw, y = this._bedY(r.x, vh);
      const w = r.w * vw, h = r.h * vh;
      const wet = y > wy;
      ctx.fillStyle = wet ? (r.k > 0.6 ? '#7a5a6c' : '#4e5a52') : '#8a7355';
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, 0, Math.PI, TAU);
      ctx.fill();
      if (wet && r.k > 0.6) {
        // coral: a few fingers off the top
        ctx.strokeStyle = 'rgba(196,108,124,0.9)';
        ctx.lineWidth = Math.max(1, w * 0.16);
        for (let i = 0; i < 4; i++) {
          const fx = x + (i - 1.5) * w * 0.4;
          ctx.beginPath();
          ctx.moveTo(fx, y - h * 0.6);
          ctx.lineTo(fx + (i % 2 ? 2 : -2), y - h * 1.9);
          ctx.stroke();
        }
      }
    }
    // caustics: bright nets of light crawling over whatever is still wet
    if (wy < vh) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, Math.max(0, wy), vw, vh);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const a = 0.16 * (1 - dr * 0.8);
      for (let i = 0; i < 40; i++) {
        const u = (i / 40 + Math.sin(this.t * 0.5 + i) * 0.02) % 1;
        const x = u * vw;
        const y = this._bedY(u, vh) + Math.sin(this.t * 1.1 + i * 2.3) * vh * 0.02 + vh * 0.02;
        const w = 10 + Math.sin(this.t * 1.7 + i) * 7;
        ctx.globalAlpha = a * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + i * 1.3)));
        ctx.fillStyle = '#cdf4ff';
        ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(2, w), 1);
        ctx.fillRect(Math.round(x - w / 3), Math.round(y + 2), Math.max(2, w * 0.6), 1);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /**
   * The animal: the real rig, painted blue by thirty metres of water, coming
   * down out of the dark, landing, and digging itself in until there is
   * nothing left of it but a shape in the sand.
   */
  _crab(ctx, vw, vh, wy) {
    const pl = crabPlates('ancient', 3);
    const k = Math.min((vw * 0.54) / pl.w, (vh * 0.38) / pl.h);
    const w = pl.w * k, h = pl.h * k;
    const cx = vw * 0.5;
    const bedY = this._bedY(0.5, vh);
    // it comes down out of the blue, slowing as it lands
    const fall = clamp01(this.t / T_LAND);
    const ease = 1 - Math.pow(1 - fall, 2.4);
    const restY = bedY - h * 0.52;
    const y = lerp(-h * 0.7, restY, ease) + Math.sin(this.t * 0.7) * (1 - ease) * 6;
    // then it sinks
    const sink = this.bury * 0.86;
    const by = y + sink * h * 0.46;
    const x = cx - w / 2;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // clipped off at the sand line once it is digging in
    if (sink > 0) {
      ctx.beginPath();
      ctx.rect(0, 0, vw, bedY + 2);
      ctx.clip();
    }
    // thirty metres of water takes the red out of everything
    const wet = by + h * 0.5 > wy;
    ctx.globalAlpha = 1;
    ctx.drawImage(pl.body, x, by, w, h);
    if (wet) {
      ctx.globalAlpha = 0.42;
      ctx.drawImage(pl.ghost, x, by, w, h);
      ctx.globalAlpha = 0.16;
      ctx.drawImage(pl.fill, x, by, w, h);
      // and the caustics crawl over its back like they do over the sand
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const u = (i / 10 + Math.sin(this.t * 0.6 + i) * 0.03) % 1;
        ctx.globalAlpha = 0.10 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2 + i * 1.7)));
        ctx.fillStyle = '#d8f6ff';
        ctx.fillRect(Math.round(x + u * w - 6), Math.round(by + h * (0.18 + (i % 4) * 0.10)), 12, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();

    // the mound it leaves, and the sand banked against it
    if (sink > 0.25) {
      const a = clamp01((sink - 0.25) / 0.75);
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, bedY - h * 0.30, 0, bedY + h * 0.2);
      g.addColorStop(0, by + h * 0.5 > wy ? '#b39972' : '#e8c894');
      g.addColorStop(1, by + h * 0.5 > wy ? '#7d6a4e' : '#b89463');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.54, bedY + 2);
      ctx.quadraticCurveTo(cx - w * 0.26, bedY - h * 0.07 * a, cx, bedY - h * 0.10 * a);
      ctx.quadraticCurveTo(cx + w * 0.26, bedY - h * 0.07 * a, cx + w * 0.54, bedY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // silt, thrown up by the digging
    for (const p of this.puffs) {
      const u = clamp01(p.t / p.life);
      const r = (p.r + u * 0.05) * vw;
      const px = p.x * vw, py = p.y * vh;
      ctx.globalAlpha = (1 - u) * 0.22;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(196,176,142,0.9)');
      g.addColorStop(1, 'rgba(150,132,104,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Everything suspended in the water, drifting up past you. */
  _silt(ctx, vw, vh) {
    for (const m of this.motes) {
      const y = ((m.y - this.t * 0.012 * m.sp) % 1 + 1) % 1;
      const x = ((m.x + Math.sin(this.t * 0.3 * m.sp + m.ph) * 0.01) % 1 + 1) % 1;
      const sx = Math.round(x * vw), sy = Math.round(y * vh);
      ctx.globalAlpha = 0.12 + 0.22 * (0.5 + 0.5 * Math.sin(this.t * 1.4 + m.ph));
      ctx.fillStyle = m.s > 1.2 ? '#dff6ff' : '#a9d6e4';
      ctx.fillRect(sx, sy, m.s > 1.2 ? 2 : 1, m.s > 1.2 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The underside of the surface: crests, and the sky coming through them. */
  _surface(ctx, vw, vh, wy) {
    if (wy > vh || wy < -30) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, wy + 18);
    for (let x = 0; x <= vw; x += 6) {
      const y = wy + Math.sin(x * 0.05 + this.t * 1.6) * 3 + Math.sin(x * 0.11 - this.t * 2.3) * 1.6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(vw, wy - 30);
    ctx.lineTo(0, wy - 30);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, wy - 20, 0, wy + 14);
    g.addColorStop(0, 'rgba(222,250,255,0.85)');
    g.addColorStop(0.6, 'rgba(150,226,240,0.45)');
    g.addColorStop(1, 'rgba(110,200,220,0)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    // bright chop riding along it
    for (let x = 0; x < vw; x += 9) {
      const y = wy + Math.sin(x * 0.05 + this.t * 1.6) * 3 + Math.sin(x * 0.11 - this.t * 2.3) * 1.6;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(x * 0.2 + this.t * 3);
      ctx.fillStyle = '#f2ffff';
      ctx.fillRect(x, Math.round(y) - 1, 5, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** A thousand years, counted off while the water goes. */
  _years(ctx, vw, vh) {
    const u = clamp01((this.t - T_DRAIN) / (T_DRY - T_DRAIN));
    const yr = Math.round(Math.pow(u, 0.72) * 1000);
    const fade = clamp01((this.t - T_DRAIN + 0.4) / 0.6) * clamp01((T_DRY + 1.6 - this.t) / 1.2);
    const label = `${yr} YEARS`;
    const w = textWidth(label, 2);
    ctx.globalAlpha = fade * 0.85;
    drawText(ctx, label, Math.round(vw / 2), Math.round(vh * 0.42), {
      color: '#f6ecd2', align: 'center', scale: 2, outline: true, outlineColor: 'rgba(0,0,0,0.65)',
    });
    ctx.globalAlpha = fade * 0.5;
    ctx.fillStyle = '#f6ecd2';
    ctx.fillRect(Math.round(vw / 2 - w / 2), Math.round(vh * 0.42 + 18), Math.round(w * u), 1);
    ctx.globalAlpha = 1;
  }
}
