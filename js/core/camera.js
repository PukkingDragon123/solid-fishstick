// CRABDEN - free camera with follow, smooth zoom, shake and cinematic control.
import { clamp, damp, lerp, easeInOutCubic } from '../lib/math.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.tx = 0; this.ty = 0;
    this.zoom = 2;
    this.targetZoom = 2;
    this.minZoom = 1;
    this.maxZoom = 4;
    this.follow = null;          // entity with {x,y}
    this.followLead = 0.35;
    this.shake = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.vw = 320; this.vh = 180;
    this.cine = null;            // active cinematic tween
    this.freeMode = false;       // player has panned away from the crab
  }

  setViewport(vw, vh) { this.vw = vw; this.vh = vh; }

  snapTo(x, y) { this.x = this.tx = x; this.y = this.ty = y; }

  followEntity(e, snap = false) {
    this.follow = e;
    this.freeMode = false;
    if (snap && e) this.snapTo(e.x, e.y);
  }

  pan(dxScreen, dyScreen) {
    this.tx -= dxScreen / this.zoom;
    this.ty -= dyScreen / this.zoom;
    this.freeMode = true;
  }

  nudge(dx, dy) { this.tx += dx; this.ty += dy; this.freeMode = true; }

  zoomBy(steps, focusSX, focusSY) {
    const before = this.screenToWorld(focusSX, focusSY);
    this.targetZoom = clamp(this.targetZoom * Math.pow(1.35, -steps), this.minZoom, this.maxZoom);
    // keep the point under the cursor stable
    const kz = this.targetZoom;
    const afterX = this.tx + (focusSX - this.vw / 2) / kz;
    const afterY = this.ty + (focusSY - this.vh / 2) / kz;
    this.tx += before.x - afterX;
    this.ty += before.y - afterY;
  }

  addShake(amount) { this.shake = Math.min(14, this.shake + amount); }

  /** Cinematic move: to {x,y,zoom} over `dur` seconds. */
  cineTo(x, y, zoom, dur = 1.4) {
    this.cine = { fx: this.x, fy: this.y, fz: this.zoom, x, y, zoom: zoom ?? this.zoom, t: 0, dur };
  }
  cineCancel() { this.cine = null; }

  update(dt, world) {
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = easeInOutCubic(clamp(c.t / c.dur, 0, 1));
      this.x = this.tx = lerp(c.fx, c.x, k);
      this.y = this.ty = lerp(c.fy, c.y, k);
      this.zoom = this.targetZoom = lerp(c.fz, c.zoom, k);
      if (c.t >= c.dur) this.cine = null;
    } else {
      if (this.follow && !this.freeMode) {
        const f = this.follow;
        const leadX = (f.vx || 0) * this.followLead;
        const leadY = (f.vy || 0) * this.followLead;
        this.tx = f.x + leadX;
        this.ty = f.y + leadY;
      }
      this.x = damp(this.x, this.tx, 0.0006, dt);
      this.y = damp(this.y, this.ty, 0.0006, dt);
      this.zoom = damp(this.zoom, this.targetZoom, 0.0001, dt);
    }

    if (world) {
      const m = 64;
      this.tx = clamp(this.tx, -world.halfSize - m, world.halfSize + m);
      this.ty = clamp(this.ty, -world.halfSize - m, world.halfSize + m);
    }

    if (this.shake > 0.01) {
      this.shake *= Math.pow(0.0012, dt);
      const a = Math.random() * Math.PI * 2;
      this.shakeX = Math.cos(a) * this.shake;
      this.shakeY = Math.sin(a) * this.shake;
    } else { this.shake = 0; this.shakeX = 0; this.shakeY = 0; }
  }

  get renderX() { return this.x + this.shakeX; }
  get renderY() { return this.y + this.shakeY; }

  worldToScreen(x, y) {
    return {
      x: (x - this.renderX) * this.zoom + this.vw / 2,
      y: (y - this.renderY) * this.zoom + this.vh / 2,
    };
  }
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.vw / 2) / this.zoom + this.renderX,
      y: (sy - this.vh / 2) / this.zoom + this.renderY,
    };
  }

  /** World-space rect currently visible (with margin). */
  bounds(margin = 32) {
    const hw = this.vw / 2 / this.zoom + margin;
    const hh = this.vh / 2 / this.zoom + margin;
    return { x0: this.renderX - hw, y0: this.renderY - hh, x1: this.renderX + hw, y1: this.renderY + hh };
  }

  isVisible(x, y, r = 16) {
    const b = this.bounds(r);
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }
}
