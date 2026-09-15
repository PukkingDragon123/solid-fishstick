// CRABDEN - the sea that is still there.
//
// The whole game is about a sea that left. Walk far enough west, past the salt
// pan and off the end of the old shelf, and you find the part of it that
// never did: a standing ocean, shallow at the lip and then going down and
// down, with the same corals and shoals and drifting things the prologue had -
// because they are the same animals. They just stayed where the water was.
//
// It is not a different screen and it is not swimming. You are a crab. You
// walk in, the light goes green and then blue, the water slows you down, and
// everything you do down there you do on the bottom.

import { clamp, clamp01, smoothstep, TAU } from '../lib/math.js';

/** Where the sand stops being sand. */
export const SHORE_X = -14200;
const RAMP = 3200;            // how far out the shelf takes to reach the bottom
const MAX_DEPTH = 300;        // and how deep the bottom is
const WAVE = 2.2;

/**
 * How far the seabed drops below the shoreline at this point.
 *
 * Folded into `Terrain.baseY` exactly like the boulders and the cliffs are,
 * so the seabed is the same heightfield as the desert and everything that
 * walks on one walks on the other.
 */
export function shelfOffset(x) {
  if (x >= SHORE_X) return 0;
  const u = clamp01((SHORE_X - x) / RAMP);
  // shallow and flat at the lip, then it falls away - the shape of every
  // continental shelf there has ever been
  return Math.pow(u, 1.45) * MAX_DEPTH;
}

export class Ocean {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.level = null;        // world Y of the surface, worked out once
    this.on = false;
    this.wet = 0;             // how far under you are, 0..1, smoothed
  }

  /** The waterline, which is simply the height of the shore. */
  surfaceY() {
    if (this.level === null) {
      this.level = this.game.terrain.baseY(SHORE_X) - 4;
    }
    return this.level;
  }

  /** The surface with the swell on it, for drawing and for foam. */
  waveY(x) {
    return this.surfaceY()
      + Math.sin(x * 0.012 + this.t * 1.1) * WAVE
      + Math.sin(x * 0.037 - this.t * 1.7) * WAVE * 0.45;
  }

  /** How deep something is, in world units. Zero or less means it is dry. */
  depth(x, y) { return y - this.waveY(x); }

  /** Is this point in the water at all? */
  under(x, y) { return this.depth(x, y) > 0; }

  update(dt) {
    this.t += dt;
    const g = this.game;
    const c = g.crab;
    // measured at the shoulder, so you are "in" when the water is over your
    // back rather than when it is round your feet
    const d = this.depth(c.x, c.y - c.m.rx * 0.2);
    const want = clamp01(d / 26);
    this.wet += (want - this.wet) * Math.min(1, dt * 3.2);
    const on = this.wet > 0.02;
    if (on !== this.on) {
      this.on = on;
      if (on) {
        g.sea.startStanding(this.surfaceY());
        g.audio?.play('splash');
      } else {
        g.sea.stop();
        g.audio?.play('splash', { pitch: 1.4 });
      }
    }
    if (on) g.sea.flat = this.surfaceY();
  }

  /**
   * The waterline seen from outside it: a lit edge, the swell, and the foam
   * where it runs up the sand. Drawn after the world and before the UI, and
   * only when you are not already under it - from underneath the sea system's
   * own surface does the job.
   */
  draw(ctx, cam, vw, vh) {
    const sy = this.surfaceY();
    const b = cam.bounds(40);
    if (b.x0 > SHORE_X + 60) return;
    const t = this.game.terrain;
    const z = cam.zoom;
    const step = Math.max(2, Math.round(3 / z));
    const x1 = Math.min(b.x1, SHORE_X + 40);

    // the body of it, between the swell and the bed
    ctx.save();
    ctx.beginPath();
    let started = false;
    for (let x = b.x0; x <= x1; x += step) {
      const s = cam.worldToScreen(x, this.waveY(x));
      if (!started) { ctx.moveTo(s.x, s.y); started = true; } else ctx.lineTo(s.x, s.y);
    }
    if (!started) { ctx.restore(); return; }
    for (let x = x1; x >= b.x0; x -= step) {
      const s = cam.worldToScreen(x, Math.max(t.surfaceY(x), this.waveY(x)));
      ctx.lineTo(s.x, s.y);
    }
    ctx.closePath();
    const top = cam.worldToScreen(0, sy).y;
    const grd = ctx.createLinearGradient(0, top, 0, vh);
    grd.addColorStop(0, 'rgba(96,186,204,0.62)');
    grd.addColorStop(0.45, 'rgba(38,132,166,0.80)');
    grd.addColorStop(1, 'rgba(10,58,88,0.92)');
    ctx.fillStyle = grd;
    ctx.fill();
    ctx.restore();

    // the lit edge of the swell, and the foam where it meets the sand
    for (let x = b.x0; x <= x1; x += step) {
      const wy = this.waveY(x);
      const gy = t.surfaceY(x);
      if (gy < wy) continue;                 // dry land: no waterline here
      const s = cam.worldToScreen(x, wy);
      const lit = 0.5 + 0.5 * Math.sin(x * 0.05 + this.t * 2.4);
      ctx.fillStyle = `rgba(214,246,252,${0.30 + lit * 0.45})`;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.max(1, step * z), Math.max(1, Math.round(z)));
      // the shore break: where the bed comes up to meet the surface it goes
      // white and stays white
      const shallow = clamp01(1 - (gy - wy) / 26);
      if (shallow > 0.04 && Math.sin(x * 0.09 + this.t * 3.1) > 0.1) {
        ctx.fillStyle = `rgba(240,252,255,${0.5 * shallow})`;
        ctx.fillRect(Math.round(s.x), Math.round(s.y - z), Math.max(1, step * z), Math.max(1, Math.round(z * 2)));
      }
    }
  }
}
