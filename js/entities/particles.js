// CRABDEN - pooled particles, ground decals and floating text.

import { TAU, clamp01, lerp, rgba } from '../lib/math.js';
import { drawText } from '../lib/font.js';
import { pxEllipse, sparkle } from '../render/sprites.js';
const MAX = 900;
const MAX_DECALS = 260;

export class Particles {
  constructor() {
    this.list = [];
    this.decals = [];
    this.texts = [];
    this.rings = [];
  }

  clear() { this.list.length = 0; this.decals.length = 0; this.texts.length = 0; this.rings.length = 0; }

  spawn(kind, x, y, opts = {}) {
    if (this.list.length >= MAX) this.list.shift();
    const p = {
      kind, x, y,
      vx: opts.vx ?? 0, vy: opts.vy ?? 0,
      z: opts.z ?? 0, vz: opts.vz ?? 0,
      life: opts.life ?? 1, maxLife: opts.life ?? 1,
      size: opts.size ?? 1,
      color: opts.color ?? '#ffffff',
      color2: opts.color2 ?? null,
      drag: opts.drag ?? 0.9,
      grav: opts.grav ?? 0,
      wind: opts.wind ?? 0,
      rot: opts.rot ?? 0,
      spin: opts.spin ?? 0,
      layer: opts.layer ?? 'over',
      glow: opts.glow ?? 0,
      seed: Math.random() * 1000,
    };
    this.list.push(p);
    return p;
  }

  burst(kind, x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread ?? TAU) : Math.random() * TAU;
      const sp = lerp(opts.speedMin ?? 8, opts.speedMax ?? 32, Math.random());
      this.spawn(kind, x + (Math.random() - 0.5) * (opts.jitter ?? 2), y + (Math.random() - 0.5) * (opts.jitter ?? 2), {
        ...opts,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * (opts.flat ?? 0.5),
        vz: opts.vz ?? Math.random() * (opts.lift ?? 18),
        life: (opts.life ?? 0.8) * lerp(0.6, 1.3, Math.random()),
        size: (opts.size ?? 1) * (Math.random() < 0.3 ? 2 : 1),
      });
    }
  }

  decal(kind, x, y, opts = {}) {
    this.decals.push({
      kind, x, y,
      life: opts.life ?? 22, maxLife: opts.life ?? 22,
      rot: opts.rot ?? 0,
      size: opts.size ?? 2,
      color: opts.color ?? 'rgba(60,42,26,0.35)',
      seed: Math.random() * 1000,
    });
    if (this.decals.length > MAX_DECALS) this.decals.shift();
  }

  text(str, x, y, opts = {}) {
    this.texts.push({
      str, x, y,
      vy: opts.vy ?? -14,
      life: opts.life ?? 1.4, maxLife: opts.life ?? 1.4,
      color: opts.color ?? '#ffffff',
      scale: opts.scale ?? 1,
      shake: opts.shake ?? 0,
    });
    if (this.texts.length > 60) this.texts.shift();
  }

  ring(x, y, opts = {}) {
    this.rings.push({
      x, y,
      r: opts.r0 ?? 2, r1: opts.r1 ?? 30,
      life: opts.life ?? 0.5, maxLife: opts.life ?? 0.5,
      color: opts.color ?? '#9fe8ff',
      flat: opts.flat ?? 0.5,
      width: opts.width ?? 1,
    });
  }

  update(dt, weather) {
    const w = weather ? weather.windVec() : { x: 0, y: 0 };
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vx += w.x * p.wind * dt * 60;
      p.vy += w.y * p.wind * dt * 60;
      p.vz -= p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.z < 0) {
        p.z = 0;
        if (p.kind === 'drop' || p.kind === 'rain') {
          p.life = Math.min(p.life, 0.001);
          if (p.onLand) p.onLand(p);
        } else { p.vz = -p.vz * 0.32; if (Math.abs(p.vz) < 3) p.vz = 0; }
      }
    }
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life <= 0) this.decals.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.15, dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  }

  drawDecals(ctx, cam) {
    for (const d of this.decals) {
      if (!cam.isVisible(d.x, d.y, 24)) continue;
      const s = cam.worldToScreen(d.x, d.y);
      const a = clamp01(d.life / d.maxLife);
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      if (d.kind === 'footprint') {
        ctx.fillStyle = d.color;
        const z = cam.zoom;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.max(1, Math.round(d.size * z * 0.5)), Math.max(1, Math.round(d.size * z * 0.4)));
      } else if (d.kind === 'scorch') {
        pxEllipse(ctx, s.x, s.y, d.size * cam.zoom, d.size * cam.zoom * 0.5, d.color);
      } else if (d.kind === 'wet') {
        pxEllipse(ctx, s.x, s.y, d.size * cam.zoom, d.size * cam.zoom * 0.55, d.color);
      }
      ctx.restore();
    }
    for (const r of this.rings) {
      if (!cam.isVisible(r.x, r.y, 60)) continue;
      const s = cam.worldToScreen(r.x, r.y);
      const t = 1 - r.life / r.maxLife;
      const rad = lerp(r.r, r.r1, t) * cam.zoom;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.ellipse(Math.round(s.x) + 0.5, Math.round(s.y) + 0.5, rad, rad * r.flat, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  draw(ctx, cam, layer = 'over') {
    const z = cam.zoom;
    for (const p of this.list) {
      if (p.layer !== layer) continue;
      if (!cam.isVisible(p.x, p.y, 40)) continue;
      const s = cam.worldToScreen(p.x, p.y - p.z);
      const a = clamp01(p.life / p.maxLife);
      const sz = Math.max(1, Math.round(p.size * z));
      switch (p.kind) {
        case 'sand':
        case 'dust': {
          ctx.globalAlpha = a * 0.75;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
          break;
        }
        case 'puff': {
          ctx.globalAlpha = a * 0.5;
          pxEllipse(ctx, s.x, s.y, (1 - a) * 7 * z + 2, ((1 - a) * 7 * z + 2) * 0.6, p.color);
          break;
        }
        case 'drop': {
          ctx.globalAlpha = Math.min(1, a * 2);
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz + 1);
          break;
        }
        case 'rain': {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, Math.max(2, Math.round(4 * z * 0.5)));
          break;
        }
        case 'spark': {
          ctx.globalAlpha = a;
          sparkle(ctx, Math.round(s.x), Math.round(s.y), Math.max(1, Math.round(p.size * a * z)), p.color);
          break;
        }
        case 'leaf': {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          const ww = Math.max(1, Math.round(2 * z * (0.5 + Math.abs(Math.cos(p.rot)))));
          ctx.fillRect(Math.round(s.x), Math.round(s.y), ww, Math.max(1, Math.round(z)));
          break;
        }
        case 'ember': {
          ctx.globalAlpha = a;
          ctx.fillStyle = a > 0.5 ? p.color : (p.color2 || p.color);
          ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
          break;
        }
        case 'chunk': {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), sz + 1, sz + 1);
          break;
        }
        default: {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx, cam) {
    for (const t of this.texts) {
      if (!cam.isVisible(t.x, t.y, 60)) continue;
      const s = cam.worldToScreen(t.x, t.y);
      const a = clamp01(t.life / t.maxLife);
      const sh = t.shake ? (Math.random() - 0.5) * t.shake * a : 0;
      drawText(ctx, t.str, s.x + sh, s.y, {
        color: t.color, scale: t.scale, align: 'center', outline: true,
        outlineColor: 'rgba(20,12,8,0.85)', alpha: Math.min(1, a * 1.6),
      });
    }
  }

  /** Additive glows onto the light layer. */
  drawLights(ctx, cam) {
    for (const p of this.list) {
      if (!p.glow) continue;
      if (!cam.isVisible(p.x, p.y, 40)) continue;
      const s = cam.worldToScreen(p.x, p.y - p.z);
      const a = clamp01(p.life / p.maxLife);
      const r = p.glow * cam.zoom * a;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(1, r));
      g.addColorStop(0, rgba(p.color, 0.9 * a));
      g.addColorStop(1, rgba(p.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
    }
  }
}
