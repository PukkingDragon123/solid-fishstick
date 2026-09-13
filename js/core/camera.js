// CRABDEN - side-scrolling camera. Follows X with lookahead, eases Y, and
// keeps the horizon roughly where the eye expects it.

import { clamp, damp, lerp, easeInOutCubic } from '../lib/math.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.tx = 0; this.ty = 0;
    this.zoom = 2;
    this.targetZoom = 2;
    this.minZoom = 1;
    this.maxZoom = 3;
    this.vw = 460; this.vh = 258;
    // Where the thing you are following sits in the frame, as a fraction of
    // the frame below its middle. On a wide screen it sits low and you look
    // ahead over the dunes; on a phone that would be all sky, so the game
    // pulls this toward zero and the bottom of the screen becomes ground for
    // the controls to sit on.
    this.yBias = 0.16;
    this.follow = null;
    this.lead = 0;
    this.shakeAmt = 0;
    this.sx = 0; this.sy = 0;
    this.cine = null;
    this.free = false;
    this.freeT = 0;
  }

  setViewport(vw, vh) { this.vw = vw; this.vh = vh; }
  followEntity(e, snap = false) {
    this.follow = e;
    this.free = false;
    if (snap && e) { this.x = this.tx = e.x; this.y = this.ty = e.y - 30; }
  }
  snapTo(x, y) { this.x = this.tx = x; this.y = this.ty = y; }
  shake(a) { this.shakeAmt = Math.min(16, this.shakeAmt + a); }
  pan(dx, dy) { this.tx -= dx / this.zoom; this.ty -= dy / this.zoom; this.free = true; this.freeT = 3; }
  cineTo(x, y, zoom, dur = 1.4) {
    this.cine = { fx: this.x, fy: this.y, fz: this.zoom, x, y, zoom: zoom ?? this.zoom, t: 0, dur };
  }
  cineCancel() { this.cine = null; }

  zoomBy(steps, fx, fy) {
    const before = this.screenToWorld(fx, fy);
    this.targetZoom = clamp(this.targetZoom * Math.pow(1.3, -steps), this.minZoom, this.maxZoom);
    const after = { x: this.tx + (fx - this.vw / 2) / this.targetZoom, y: this.ty + (fy - this.vh / 2) / this.targetZoom };
    this.tx += before.x - after.x;
    this.ty += before.y - after.y;
  }

  update(dt) {
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = easeInOutCubic(clamp(c.t / c.dur, 0, 1));
      this.x = this.tx = lerp(c.fx, c.x, k);
      this.y = this.ty = lerp(c.fy, c.y, k);
      this.zoom = this.targetZoom = lerp(c.fz, c.zoom, k);
      if (c.t >= c.dur) this.cine = null;
    } else {
      if (this.free) {
        this.freeT -= dt;
        if (this.freeT <= 0) this.free = false;
      }
      if (this.follow && !this.free) {
        const f = this.follow;
        this.lead = damp(this.lead, clamp((f.vx || 0) * 0.34, -46, 46), 0.02, dt);
        this.tx = f.x + this.lead;
        this.ty = f.y - this.vh * this.yBias / this.zoom;
      }
      this.x = damp(this.x, this.tx, 0.0009, dt);
      this.y = damp(this.y, this.ty, 0.004, dt);
      this.zoom = damp(this.zoom, this.targetZoom, 0.0002, dt);
    }

    if (this.shakeAmt > 0.02) {
      this.shakeAmt *= Math.pow(0.0015, dt);
      const a = Math.random() * Math.PI * 2;
      this.sx = Math.cos(a) * this.shakeAmt;
      this.sy = Math.sin(a) * this.shakeAmt;
    } else { this.shakeAmt = 0; this.sx = 0; this.sy = 0; }
  }

  get rx() { return this.x + this.sx; }
  get ry() { return this.y + this.sy; }

  worldToScreen(x, y) {
    return { x: (x - this.rx) * this.zoom + this.vw / 2, y: (y - this.ry) * this.zoom + this.vh / 2 };
  }
  screenToWorld(sx, sy) {
    return { x: (sx - this.vw / 2) / this.zoom + this.rx, y: (sy - this.vh / 2) / this.zoom + this.ry };
  }
  bounds(m = 40) {
    const hw = this.vw / 2 / this.zoom + m, hh = this.vh / 2 / this.zoom + m;
    return { x0: this.rx - hw, x1: this.rx + hw, y0: this.ry - hh, y1: this.ry + hh };
  }
  isVisible(x, y, r = 24) {
    const b = this.bounds(r);
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }
}
