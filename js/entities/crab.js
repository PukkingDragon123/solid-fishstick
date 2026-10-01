// CRABDEN - the player crab.
//
// It faces you. Crabs do not turn to walk, so the body stays square to the
// camera and the animal goes sideways underneath it: the legs on the leading
// side reach out and pull, the trailing side pushes, and the shell rocks
// across the gait. Nothing is a sprite animation - every foot is planted in
// world space and every joint is solved.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { pxDisc, pxGlow, pxEllipse } from '../render/pix.js';
import { buildCrab, crabMetrics } from '../art/crabart.js';
import { MATERIALS } from '../lib/palette.js';

// colours as packed pixels, so a leg is written straight into a buffer
const u32 = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
};
const OUT_NEAR = u32('#171009'), OUT_FAR = u32('#100a06');
const BARN_HI = u32('#e8e0cc'), BARN_LO = u32('#a89c84'), GRAN_HI = u32('#f6dcc0');
const rampCache = new Map();
function rampU32(ramp) {
  let r = rampCache.get(ramp);
  if (!r) { r = ramp.map(u32); rampCache.set(ramp, r); }
  return r;
}
const LIMB = 256;
let limb = null;
function limbBuf() {
  if (!limb) {
    const cv = document.createElement('canvas');
    cv.width = LIMB; cv.height = LIMB;
    const g = cv.getContext('2d');
    const img = g.createImageData(LIMB, LIMB);
    limb = { cv, g, img, u32: new Uint32Array(img.data.buffer) };
  }
  return limb;
}

const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map((r) => r.map((v) => (v + 0.5) / 16));

/** Two-bone IK. `up` picks which side the joint folds toward. */
export function ik2(hx, hy, tx, ty, l1, l2, up = 1) {
  const dx = tx - hx, dy = ty - hy;
  const d = Math.hypot(dx, dy) || 0.001;
  const dmin = Math.abs(l1 - l2) + 0.01;
  const dmax = l1 + l2 - 0.01;
  const dc = clamp(d, dmin, dmax);
  const a = Math.atan2(dy, dx);
  const cosB = (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc);
  const b = Math.acos(clamp(cosB, -1, 1));
  const a1 = a - b * up;
  const kx = hx + Math.cos(a1) * l1, ky = hy + Math.sin(a1) * l1;
  const a2 = Math.atan2((hy + Math.sin(a) * dc) - ky, (hx + Math.cos(a) * dc) - kx);
  return { a1, a2, kx, ky, reached: d <= dmax };
}

export class Crab {
  constructor(game, stage = 'hatchling') {
    this.game = game;

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.facing = 1;            // which way it is travelling
    this.faceT = 1;             // kept for callers; the body turns instead
    this.turnDir = 1;           // which shoulder is leading
    this.turnFrom = 1;
    this.turnP = 1;             // 0..1 through the pivot; 1 is settled
    this.lean = 0;
    this.roll = 0;
    this.lurch = 0;
    this.breathe = Math.random() * TAU;
    this.bodyAngle = 0;
    this.bob = 0;
    this.bobT = 0;
    this.crouch = 0;

    this.pumping = 0;
    this.pumpT = 0;
    this.clawT = 0;
    this.clawOpen = 0;
    this.tapT = 0;
    this.tapLong = false;
    this.look = { x: 0, y: -0.2 };
    this.lookT = 0;
    this.idleLook = null;
    this.blink = 0;
    this.blinkT = 2;
    this.mouthT = Math.random() * TAU;
    this.alarm = 0;
    this.threat = null;

    this.hp = 120;
    this.hpMax = 120;
    this.iframe = 0;

    this.setStage(stage, true);
  }

  setStage(stage, snap = false) {
    this.stage = stage;
    this.rig = buildCrab(stage);
    this.m = this.rig.m;
    this.S = this.rig.S;
    this.standH = this.m.faceH * 0.45 + this.m.shellW * 0.025;   // the shell carried just clear of the sand
    this.speed = lerp(48, 100, this.m.t);
    this._buildLegs();
    if (snap && this.game && this.game.terrain) this.snapToGround();
  }

  _buildLegs() {
    this.legs = this.rig.sockets.legs.map((s, i) => ({
      def: s,
      foot: { x: 0, y: 0 },
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      stepping: false,
      t: 0,
      dur: 0.22,
      lift: 0,
      // opposite sides alternate, so it never has both leading legs in the air
      group: (i + (s.side > 0 ? 1 : 0)) % 2,
    }));
  }

  /** Where this leg wants its foot: a little outboard of its own socket. */
  homeX(l, lead = 0) {
    const sp = Math.abs(l.def.spread || 0.6);
    if (this.rig.hermit) {
      // a hermit crab walks forward out of its shell: one pair reaches ahead
      // of the aperture, the other plants back under it
      const f = this.turnDir >= 0 ? 1 : -1;
      const ap = this.m.ap || { x: this.m.rx * 0.66 };
      const fx = l.def.side > 0 ? ap.x + this.m.rx * (0.80 + sp * 0.55) : ap.x - this.m.rx * (0.50 + sp * 0.50);
      return this.x + f * fx + lead;
    }
    return this.x + l.def.side * this.m.rx * (0.80 + sp * 0.80) + lead;
  }

  /** Back legs contact further away, so their feet sit higher on screen. */
  footLift(l) { return (l.def.depth || 0) * this.m.rx * 0.30; }

  snapToGround() {
    const t = this.game.terrain;
    this.y = t.surfaceY(this.x) - this.standH;
    for (const l of this.legs) {
      const fx = this.homeX(l);
      l.foot.x = fx; l.foot.y = t.surfaceY(fx) - this.footLift(l);
      l.from = { ...l.foot }; l.to = { ...l.foot };
    }
  }

  /** Start a pivot onto the other shoulder. Ignored if one is already running. */
  _startTurn(dir) {
    if (dir === this.turnDir || this.turnP < 0.8) return;
    this.turnFrom = this.turnDir;
    this.turnDir = dir;
    this.turnP = 0;
    this.game.audio?.play('step', { vol: 0.5 });
    if (this.game.fx && this.game.terrain) {
      const gy = this.game.terrain.surfaceY(this.x);
      this.game.fx.dust(this.x, gy - 2, 1.4 + this.m.t * 1.6);
      this.game.terrain.deform(this.x, 1.6, 6 + this.m.rx * 0.16);
    }
  }

  /**
   * How wide the animal reads while it turns. It goes edge-on halfway through
   * and comes back out the other way, which is a pivot rather than a mirror.
   */
  get turnScaleX() {
    if (this.turnP >= 1) return this.turnDir;
    const k = this.turnP;
    const sign = k < 0.5 ? this.turnFrom : this.turnDir;
    return sign * Math.max(0.15, Math.abs(Math.cos(k * Math.PI)));
  }

  /** A little lift out of the sand as it comes round. */
  get turnLift() {
    if (this.turnP >= 1) return 0;
    return -Math.sin(this.turnP * Math.PI) * this.m.rx * 0.10;
  }

  get worldY() { return this.y; }

  /** Where a point on the shell's top surface lands in world space. */
  shellWorldAB(a, b) {
    const p = this.rig.shellSurface(a, b);
    return this.localToWorld(p.x, p.y, p.nx, p.ny);
  }

  shellWorld(u) {
    const p = this.rig.shellPoint(u);
    return this.localToWorld(p.x, p.y, p.nx, p.ny);
  }

  localToWorld(lx, ly, nx = 0, ny = 0) {
    const c = Math.cos(this.bodyAngle + this.roll), s = Math.sin(this.bodyAngle + this.roll);
    const px = lx + this.lean * 3, py = ly;
    return {
      x: this.x + this.lurch * 0.35 + px * c - py * s,
      y: this.y + px * s + py * c + this.bob,
      nx: nx * c - ny * s,
      ny: nx * s + ny * c,
    };
  }

  // -------------------------------------------------------------------------

  update(dt, ctrl = {}) {
    const t = this.game.terrain;
    const move = clamp(ctrl.move || 0, -1, 1);
    const speed = this.speed * (ctrl.speedMul || 1) * (ctrl.sprint ? 1.5 : 1) * (1 - this.crouch * 0.6);

    // A crab still goes sideways, but it does not reverse like a lift: to lead
    // with the other shoulder it has to pivot, and while it is pivoting it is
    // not going anywhere much.
    if (move > 0.1) { this.facing = 1; this._startTurn(1); }
    else if (move < -0.1) { this.facing = -1; this._startTurn(-1); }
    if (this.turnP < 1) this.turnP = Math.min(1, this.turnP + dt / 0.42);

    // -- climbing ----------------------------------------------------------
    // The ground is not flat and the animal weighs what it weighs. Going up a
    // boulder or a rock bench costs you speed, and the steeper it is the more
    // it costs - which is what makes a step in the ground a decision rather
    // than a texture you slide over. Coming back down is free; gravity is on
    // your side and always has been.
    const dir = move > 0.1 ? 1 : move < -0.1 ? -1 : (this.facing || 1);
    const LOOK = this.m.shellW * 0.42 + 8;
    const rise = (t.baseY(this.x) - t.baseY(this.x + dir * LOOK)) / LOOK;
    const grade = clamp01((rise - 0.28) / 1.05);
    this.climb = damp(this.climb || 0, Math.abs(move) > 0.1 ? grade : 0, 0.0008, dt);
    const climbMul = 1 - grade * 0.76;

    // -- and under water ---------------------------------------------------
    // You are a crab. You do not swim; you walk on the bottom, and the water
    // pushes back on everything you do - which is the whole difference in
    // feel between the desert and the shelf.
    const wet = this.game.shallows?.wet || 0;
    const wetMul = 1 - wet * 0.42;

    const pivot = this.turnP < 1 ? 0.16 : 1;
    this.vx = damp(this.vx, move * speed * pivot * climbMul * wetMul, 0.0002, dt);
    if (Math.abs(this.vx) < 0.6) this.vx = 0;
    this.x += this.vx * dt;
    this.lean = damp(this.lean, clamp(this.vx / this.speed, -1, 1) * 0.7, 0.0009, dt);

    this._stepLegs(dt, t);
    this._rideFeet(dt, t);

    const spd = Math.abs(this.vx);
    const run = clamp01(spd / (this.speed * 0.85));
    this.bobT += dt * (2.4 + spd * 0.085);
    this.breathe += dt * (1.1 + run * 1.4);
    const walkBob = Math.sin(this.bobT * 2) * run * this.S * 1.5;
    const idleBob = Math.sin(this.breathe) * this.S * 0.5;
    this.bob = damp(this.bob, walkBob + idleBob, 0.001, dt);
    this.lurch = damp(this.lurch, Math.sin(this.bobT * 2 + 0.9) * run * this.S * 1.6 * this.facing, 0.001, dt);
    // a shell loaded heavier on one side makes the animal walk with a list
    const list = ctrl.list || 0;
    this.roll = damp(this.roll, Math.sin(this.bobT) * run * 0.05 * this.facing + list, 0.0012, dt);
    // going up a face the animal rears: the front comes up, the back stays
    // down, and the legs on the rock throw grit
    // buoyancy: the shell wants to float and the legs will not let it
    if (wet > 0.02) {
      this.bob -= Math.sin(this.breathe * 0.7) * wet * this.S * 1.7;
      this.roll += Math.sin(this.breathe * 0.5) * wet * 0.02;
    }
    if (this.climb > 0.05) {
      this.roll -= this.climb * 0.13 * this.facing;
      this.bob -= this.climb * this.S * 1.4;
      if (Math.random() < dt * this.climb * 14) {
        this.game.fx?.spark?.(this.x + this.facing * this.m.shellW * 0.34,
          t.surfaceY(this.x + this.facing * this.m.shellW * 0.34) - 2, '#b39a74', 2, 22);
      }
    }

    // the eyes go where the attention is, which is usually the way it is going
    this.lookT -= dt;
    let tx = clamp(this.vx / this.speed, -1, 1) * 0.85, ty = -0.30;
    if (this.alarm > 0.1 && this.threat) {
      tx = clamp((this.threat.x - this.x) / 70, -1.2, 1.2);
      ty = clamp((this.threat.y - this.y) / 70, -1, 0.6);
    } else if (this.lookT <= 0) {
      this.lookT = 0.6 + Math.random() * 1.6;
      this.idleLook = { x: (Math.random() - 0.5) * 1.8, y: -0.1 - Math.random() * 0.6 };
    }
    if (spd < 6 && this.alarm < 0.1 && this.idleLook) { tx = this.idleLook.x; ty = this.idleLook.y; }
    this.look.x = damp(this.look.x, tx, 0.0004, dt);
    this.look.y = damp(this.look.y, ty, 0.0004, dt);
    this.eyeLook = this.look.x;
    this.alarm = Math.max(0, this.alarm - dt * 0.7);

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2.2 + Math.random() * 4.5; this.blink = 0.16; }
    this.blink = Math.max(0, this.blink - dt);
    this.mouthT += dt * (5.5 + (this.pumping > 0 ? 9 : 0));

    this.clawT += dt;
    const wantOpen = ctrl.grab ? 1
      : this.alarm > 0.2 ? 0.85 + Math.sin(this.clawT * 9) * 0.15
        : this.pumping > 0 ? 0.7 : 0.34 + Math.sin(this.clawT * 1.3) * 0.10;
    this.clawOpen = damp(this.clawOpen, wantOpen, 0.001, dt);

    this.pumping = Math.max(0, this.pumping - dt);
    this.tapT = Math.max(0, this.tapT - dt * 3.2);
    this.crouch = damp(this.crouch, this.pumping > 0 ? 1 : 0, 0.0009, dt);
  }

  _stepLegs(dt, t) {
    const lead = this.vx * 0.20;
    const trigger = this.m.rx * 0.24 + Math.abs(this.vx) * 0.05;
    let lifting = 0;
    for (const l of this.legs) if (l.stepping) lifting++;

    for (const l of this.legs) {
      const home = this.homeX(l, lead);
      if (l.stepping) {
        l.t += dt / l.dur;
        if (l.t >= 1) {
          l.t = 1; l.stepping = false;
          l.foot.x = l.to.x; l.foot.y = l.to.y;
          this._land(l, t);
        } else {
          const k = l.t;
          l.foot.x = lerp(l.from.x, l.to.x, k);
          const base = lerp(l.from.y, l.to.y, k);
          l.lift = Math.sin(k * Math.PI) * (this.m.legLen[1] * 0.50 + Math.abs(this.vx) * 0.04);
          l.foot.y = base - l.lift;
        }
      } else {
        l.lift = damp(l.lift, 0, 0.0001, dt);
        const off = Math.abs(l.foot.x - home);
        const partnerBusy = this.legs.some((o) => o !== l && o.stepping && o.group === l.group);
        // a foot left far behind steps whatever its partner is doing: a
        // crab never drags a leg out to twice its length
        const dragging = off > trigger * 1.9;
        if (off > trigger && (lifting < 3 || dragging) && (!partnerBusy || dragging)) {
          l.stepping = true; l.t = 0;
          l.dur = clamp(0.30 - Math.abs(this.vx) * 0.0016, 0.13, 0.30);
          l.from = { x: l.foot.x, y: l.foot.y };
          const tx = home + Math.sign(home - l.foot.x) * trigger * 0.75;
          l.to = { x: tx, y: t.surfaceY(tx) - this.footLift(l) };
          lifting++;
        } else {
          l.foot.y = damp(l.foot.y, t.surfaceY(l.foot.x) - this.footLift(l), 0.0005, dt);
        }
      }
    }
  }

  _land(l, t) {
    const w = Math.abs(this.vx);
    t.deform(l.foot.x, 1.2 + w * 0.010, 4 + this.m.rx * 0.08);
    if (this.game.fx && (l.def.far || Math.random() < 0.4)) {
      this.game.fx.footPuff(l.foot.x, l.foot.y + this.footLift(l), w * 0.5, l.def.far);
    }
    if (this.game.audio && w > 12 && !l.def.far) this.game.audio.play('step', { vol: 0.3 });
  }

  _rideFeet(dt, t) {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (const l of this.legs) {
      if (l.stepping) continue;
      const dx = l.foot.x - this.x;
      const fy = l.foot.y + this.footLift(l);
      sx += dx; sy += fy; sxx += dx * dx; sxy += dx * fy; n++;
    }
    let groundY = t.surfaceY(this.x), slope = 0;
    if (n >= 2) {
      const denom = n * sxx - sx * sx;
      if (Math.abs(denom) > 0.001) slope = (n * sxy - sx * sy) / denom;
      groundY = (sy - slope * sx) / n;
    }
    const targetY = groundY - this.standH * (1 - this.crouch * 0.28);
    this.y = damp(this.y, targetY, 0.0008, dt);
    this.bodyAngle = damp(this.bodyAngle, clamp(Math.atan(slope), -0.5, 0.5), 0.0009, dt);
  }

  /** Something worth watching: sets the gaze and lifts a claw. */
  alertTo(ent, amount = 1) {
    this.threat = ent;
    this.alarm = Math.min(1.4, this.alarm + amount);
  }

  pump() { this.pumping = 0.55; this.pumpT = 0; }

  /** One tap of a claw against your own shell. Long taps swing further. */
  tap(long) {
    this.clawT = 0;
    this.tapT = 1;
    this.tapLong = !!long;
    this.game.audio?.play('claw', { pitch: long ? 0.8 : 1.3 });
  }

  // -------------------------------------------------------------------------

  draw(ctx, cam, garden) {
    const rig = this.rig;
    const sc = cam.zoom;
    const p = cam.worldToScreen(this.x + this.lurch * 0.35, this.y + this.bob);

    this._drawShadow(ctx, cam);

    ctx.save();
    ctx.translate(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2 + this.turnLift * sc);
    ctx.scale(sc, sc);
    // the pivot: everything hanging off the body squashes and comes back out
    // the other way together, so the garden turns with the animal carrying it
    const tsx = this.turnScaleX;
    if (tsx !== 1) ctx.scale(tsx, 1 + (1 - Math.abs(tsx)) * 0.06);
    const rot = (this.bodyAngle + this.roll) * (tsx < 0 ? -1 : 1);

    // ---- the two rear legs on each side, and anything on the far shell ----
    ctx.save();
    ctx.rotate(rot);
    this._drawLegs(ctx, true);
    ctx.restore();
    if (garden) garden.drawFar(ctx, this);

    // ---- body -------------------------------------------------------------
    ctx.save();
    ctx.rotate(rot);
    ctx.translate(this.lean * 3, 0);
    ctx.scale(1, 1 + Math.sin(this.breathe) * 0.012);
    ctx.drawImage(rig.body.cv, -rig.body.ox, -rig.body.oy);
    ctx.restore();

    // ---- everything growing on the near half of the shell ------------------
    if (garden) garden.drawNear(ctx, this);

    // ---- front legs, claws, face ------------------------------------------
    ctx.save();
    ctx.rotate(rot);
    this._drawLegs(ctx, false);
    this._drawFace(ctx);
    this._drawClaws(ctx);
    ctx.restore();

    ctx.restore();
  }

  _drawLegs(ctx, far) {
    const rig = this.rig;
    // The body is drawn mirrored when it faces the other way, so the feet
    // have to be taken into that mirrored frame too - the old crab was the
    // same both ways round and got away without it; this one is not.
    const tsx = this.turnScaleX;
    const sg = tsx < 0 ? -1 : 1;
    const a = -(this.bodyAngle + this.roll) * sg;
    const c = Math.cos(a), s = Math.sin(a);
    const mx = Math.abs(tsx) < 0.2 ? 0.2 * sg : tsx;

    for (const leg of this.legs) {
      if (!!leg.def.far !== far) continue;
      const art = far ? rig.legArt.far : rig.legArt.near;
      const l1 = art.coxa.len, l2 = art.femur.len, l3 = art.tibia.len;
      const wx = (leg.foot.x - (this.x + this.lurch * 0.35)) / mx;
      const wy = leg.foot.y - (this.y + this.bob);
      const lx = wx * c - wy * s, ly = wx * s + wy * c;
      const hx = leg.def.x, hy = leg.def.y;
      const side = leg.def.side;

      // the ankle sits above the contact point and outboard of it, so the
      // knee comes up and out the way a crab's does
      const ankX = lx - side * l3 * 0.40;
      const ankY = ly - l3 * 0.80;
      const sol = ik2(hx, hy, ankX, ankY, l1, l2, side);

      const fx = sol.kx + Math.cos(sol.a2) * l2, fy = sol.ky + Math.sin(sol.a2) * l2;
      // drawn live on the screen's own pixels rather than as rotated
      // bitmaps: a rotated sprite resamples its pixels unevenly at every
      // angle, which is what made the legs look chewed
      this._limb(ctx, art.coxa, hx, hy, sol.kx, sol.ky);
      this._limb(ctx, art.femur, sol.kx, sol.ky, fx, fy);
      // the last segment is a fixed length: it points at the foot, and if
      // the foot has got away it stops short rather than stretching
      const tdx = lx - fx, tdy = ly - fy, tl = Math.hypot(tdx, tdy) || 1;
      const tk = Math.min(1, (l3 * 1.08) / tl);
      this._limb(ctx, art.tibia, fx, fy, fx + tdx * tk, fy + tdy * tk);
    }
  }

  /**
   * One leg segment as a shaded capsule, painted pixel by pixel in screen
   * space: a dark outline, lit from above along the top, a cool underside,
   * a ring at each joint, a horn tip on the foot and the odd barnacle.
   */
  _limb(ctx, seg, ax, ay, bx, by) {
    const m = ctx.getTransform();
    const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const p0x = m.a * ax + m.c * ay + m.e, p0y = m.b * ax + m.d * ay + m.f;
    const p1x = m.a * bx + m.c * by + m.e, p1y = m.b * bx + m.d * by + m.f;
    const R0 = Math.max(1.2, seg.r0 * sc), R1 = Math.max(0.9, seg.r1 * sc);
    const ramp = MATERIALS[seg.mat]?.ramp || MATERIALS.chitin.ramp;
    const horn = MATERIALS.horn?.ramp || ramp;
    const far = seg.far;
    const vx = p1x - p0x, vy = p1y - p0y;
    const len2 = vx * vx + vy * vy || 1;
    const len = Math.sqrt(len2);
    // a slight bow, the way the art had it
    const bow = (seg.bow || 0) * sc;
    const nx = -vy / len, ny = vx / len;
    const pad = Math.max(R0, R1) + Math.abs(bow) + 2;
    // the sprite's own pixel size on screen: limbs are laid on that grid so
    // they are exactly as chunky as the body they hang off
    const cell = Math.max(1, sc);
    const x0 = Math.floor((Math.min(p0x, p1x) - pad) / cell), x1 = Math.ceil((Math.max(p0x, p1x) + pad) / cell);
    const y0 = Math.floor((Math.min(p0y, p1y) - pad) / cell), y1 = Math.ceil((Math.max(p0y, p1y) + pad) / cell);
    const out = far ? OUT_FAR : OUT_NEAR;
    const rings = seg.foot ? 1 : 2;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw <= 0 || bh <= 0 || bw > LIMB || bh > LIMB) return;
    const buf = limbBuf();
    const px32 = buf.u32;
    for (let r = 0; r < bh; r++) px32.fill(0, r * LIMB, r * LIMB + bw);
    const pal = rampU32(ramp), hpal = rampU32(horn);
    for (let y = y0; y <= y1; y++) {
      const row = (y - y0) * LIMB;
      for (let x = x0; x <= x1; x++) {
        const px = (x + 0.5) * cell - p0x, py = (y + 0.5) * cell - p0y;
        let t = (px * vx + py * vy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const off = bow * 4 * t * (1 - t);
        const qx = px - vx * t + nx * off, qy = py - vy * t + ny * off;
        const d2 = qx * qx + qy * qy;
        const r = seg.foot ? lerp(R0, R1, Math.pow(t, 0.8)) : lerp(R0, R1, t);
        const rr = r + (!seg.foot && t < 0.12 ? r * 0.12 : 0);
        if (d2 > (rr + 0.35 * cell) * (rr + 0.35 * cell)) {
          // stiff bristles along the top edge of the leg, every few pixels
          if (!seg.foot && qy < 0 && d2 < (rr + 1.6 * cell) * (rr + 1.6 * cell) && Math.abs(qx) < rr * 0.5
            && ((Math.floor(t * len / (2.5 * cell))) & 1) === 0 && t > 0.15 && t < 0.92) px32[row + (x - x0)] = out;
          continue;
        }
        const d = Math.sqrt(d2);
        let c;
        if (d > rr - 0.75 * cell) c = out;
        else {
          const ux = qx / rr, uy = qy / rr;
          const z = Math.sqrt(Math.max(0, 1 - ux * ux - uy * uy));
          let l = -uy * 0.55 - ux * 0.25 + z * 0.55 + 0.18;
          if (far) l -= 0.22;
          const ringT = (t * rings) % 1;
          if (!seg.foot && rings > 1 && t > 0.15 && ringT < 0.12) l -= 0.25;
          const b = BAYER4[y & 3][x & 3];
          let k = Math.floor(clamp01(l) * 6.99 + (b - 0.5) * 0.9);
          k = k < 1 ? 1 : k > 7 ? 7 : k;
          c = (seg.foot && t > 0.72 ? hpal : pal)[k];
          if (seg.gran && !(seg.foot && t > 0.72)) {
            // studs: a grid of round bumps along the limb, each tipped pale
            const gu = t * len / (2.6 * cell), gv = (uy + 1) * rr / (2.6 * cell) + (Math.floor(gu) & 1) * 0.5;
            const du = gu - Math.floor(gu) - 0.5, dv = gv - Math.floor(gv) - 0.5;
            const gd = du * du + dv * dv;
            if (gd < 0.05 && l > 0.3) c = GRAN_HI; else if (gd < 0.11) c = (seg.foot ? hpal : pal)[Math.min(7, k + 1)];
          }
          if (seg.barn && uy < -0.35 && Math.abs(t - 0.5) < 0.06 && ux * ux < 0.15) c = uy < -0.7 ? BARN_HI : BARN_LO;
        }
        px32[row + (x - x0)] = c;
      }
    }
    buf.g.putImageData(buf.img, 0, 0, 0, 0, bw, bh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf.cv, 0, 0, bw, bh, Math.round(x0 * cell), Math.round(y0 * cell), Math.round(bw * cell), Math.round(bh * cell));
    ctx.restore();
  }

  _seg(ctx, seg, x, y, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.drawImage(seg.cv, -seg.ox, -seg.oy);
    ctx.restore();
  }

  _drawClaws(ctx) {
    const rig = this.rig;
    const tm = this.game.time || 0;
    // the small claw behind, the big one in front
    for (const so of rig.sockets.claws) {
      const near = !!so.near;
      const art = near ? rig.claw.near : rig.claw.far;
      const k = so.k || 1;
      const sw = Math.sin(this.clawT * (near ? 1.07 : 0.83)) * 0.06;
      const raise = this.clawOpen * 0.5 + this.pumping * 0.6 + this.alarm * 0.5
        + (near ? Math.sin(this.tapT * Math.PI) * (this.tapLong ? 0.85 : 0.5) : 0);
      ctx.save();
      ctx.translate(so.x, so.y);
      // they hang down in front of the shell, the palm upright and the
      // fingers to the ground - lifted when it is busy
      // the whole limb swings up as one piece about the shoulder - lifting
      // each joint by its own amount is what folded it into a knot
      const lift = Math.min(1, raise) * 0.75;
      const a1 = 0.40 + sw - lift + this.crouch * 0.12;
      const ex = Math.cos(a1) * art.arm.len, ey = Math.sin(a1) * art.arm.len;
      const a2 = a1 + 0.50;
      const fx = ex + Math.cos(a2) * art.fore.len * k, fy = ey + Math.sin(a2) * art.fore.len * k;
      const a3 = a2 + 0.35 + Math.sin(this.clawT * 1.9 + (near ? 0 : 2)) * 0.04;
      this._limb(ctx, art.arm, 0, 0, ex, ey);
      this._limb(ctx, art.fore, ex, ey, fx, fy);
      const K = Math.max(8, this.m.shellW * this.m.clawScale) * k;
      const PL = K * 0.46, PR = K * 0.26, FL = K * 0.40;
      const mat = near ? 'hermitRed' : 'hermitDark';
      const cs = Math.cos(a3), sn = Math.sin(a3);
      const px1 = fx + cs * PL, py1 = fy + sn * PL;
      // the palm: big, round-backed and studded
      this._limb(ctx, { r0: PR * 0.7, r1: PR, mat, far: !near, bow: -PR * 0.3, gran: true }, fx, fy, px1, py1);
      const lx = px1 - sn * PR * 0.35, ly = py1 + cs * PR * 0.35;
      this._limb(ctx, { r0: PR * 0.55, r1: Math.max(0.6, PR * 0.15), mat, far: !near, foot: true, gran: true },
        lx, ly, lx + cs * FL, ly + sn * FL);
      const op = -0.2 - this.clawOpen * 0.6;
      const hx = px1 + sn * PR * 0.45, hy = py1 - cs * PR * 0.45;
      const da = a3 + op;
      this._limb(ctx, { r0: PR * 0.48, r1: Math.max(0.6, PR * 0.14), mat, far: !near, foot: true, bow: PR * 0.2, gran: true },
        hx, hy, hx + Math.cos(da) * FL, hy + Math.sin(da) * FL);
      ctx.restore();
    }
    void tm;
  }

  /** Mouthparts, then two small black beads on short stalks. */
  _drawFace(ctx) {
    const rig = this.rig;
    const S = this.S;
    const mo = rig.sockets.mouth;
    if (rig.mouth) {
      ctx.save();
      ctx.translate(mo.x, mo.y + Math.sin(this.mouthT) * 0.4 * S);
      ctx.rotate(Math.sin(this.mouthT * 1.3) * 0.12);
      ctx.drawImage(rig.mouth.cv, -rig.mouth.ox, -rig.mouth.oy);
      ctx.restore();
    }

    const art = rig.eye;
    // two long antennae, banded red and white, sweeping forward and up and
    // never still - feeling the air for water
    {
      const tm = this.game.time || 0;
      const T = ctx.getTransform();
      const E = rig.sockets.eyes;
      ctx.save();
      for (let k = 0; k < 2; k++) {
        const e = E[k];
        const L = this.m.rx * (1.5 + k * 0.2);
        let x = e.x + 1, y = e.y + 1;
        const base = -0.55 - k * 0.3 + Math.sin(tm * 1.3 + k * 2) * 0.12 + this.look.y * 0.1;
        const n = 18;
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const f = i / n;
          const ang = base + f * (0.9 + Math.sin(tm * 2.1 + k + f * 3) * 0.18);
          pts.push({ x, y });
          x += Math.cos(ang) * L / n; y += Math.sin(ang) * L / n;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const ac = Math.max(1, Math.round(Math.hypot(T.a, T.b)));
        let px = null, py = null;
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          const sx = Math.round((T.a * q.x + T.c * q.y + T.e) / ac), sy = Math.round((T.b * q.x + T.d * q.y + T.f) / ac);
          ctx.fillStyle = (i >> 1) & 1 ? '#f0d8c4' : (k ? '#8c2a16' : '#b0391c');
          if (px === null) ctx.fillRect(sx * ac, sy * ac, ac, ac);
          else {
            // join the dots, a pixel at a time
            const n2 = Math.max(Math.abs(sx - px), Math.abs(sy - py), 1);
            for (let j = 1; j <= n2; j++) ctx.fillRect(Math.round(px + (sx - px) * j / n2) * ac, Math.round(py + (sy - py) * j / n2) * ac, ac, ac);
          }
          px = sx; py = sy;
        }
        ctx.setTransform(T);
      }
      ctx.restore();
    }
    for (const e of rig.sockets.eyes) {
      // stalks splay out and up, and both lean the way the crab is looking
      // Stalks splay out and up and both lean the way the crab is looking.
      // Each one also has a life of its own: a slow sway out of step with
      // the other, a bob while it walks, and a little springy stretch.
      const tm = this.game.time || 0;
      const walk = clamp01(Math.abs(this.vx) / Math.max(1, this.speed));
      const base = -Math.PI / 2 + e.side * 0.34;
      const a = base + this.look.x * 0.45 + this.look.y * 0.12 * e.side
        + Math.sin(tm * 2.1 + e.side * 1.7) * 0.10
        + Math.sin(tm * 9.0 + e.side) * 0.14 * walk;
      const st = 1 + Math.sin(tm * 3.3 + e.side * 2.2) * 0.07 + walk * Math.abs(Math.sin(tm * 9.0)) * 0.08;
      const shrink = this.blink > 0
        ? 1 - Math.sin(clamp01(this.blink / 0.16) * Math.PI) * 0.7 : 1;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(a);
      ctx.scale(st, shrink);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      // the eyeball, placed in body space so it does not swing with the
      // stalk: a dark rim, the white, a big pupil that follows the look, and
      // two catchlights - which is most of what makes it a face you like
      // a plain bead of pitch black on the end of each stalk, centred on a
      // whole pixel so it is a clean round dot
      const r = Math.max(2, Math.round(art.r * 0.7));
      const ex = Math.round(e.x + Math.cos(a) * art.globe * st) + 0.5;
      const ey = Math.round(e.y + Math.sin(a) * art.globe * st) + 0.5;
      if (shrink > 0.55) {
        // What you are holding still shows in the animal: the mode's colour
        // burns faintly round the bead, harder while something is happening.
        const tint = this.game.modeTint;
        if (tint) {
          const heat = 0.55 + 0.45 * Math.sin(this.game.time * 3.2);
          ctx.save();
          ctx.globalAlpha = 0.30 + heat * 0.35;
          pxGlow(ctx, ex, ey, r * 2.6, tint.glow, 1, { p: 1, steps: 3 });
          ctx.restore();
        }
        // drawn on the screen's own grid: the body rocks and tilts, and a
        // disc laid out in its tilted space comes out furry
        const T = ctx.getTransform();
        const sx = T.a * ex + T.c * ey + T.e, sy = T.b * ex + T.d * ey + T.f;
        const sr = r * Math.hypot(T.a, T.b);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const bx = Math.round(sx), by = Math.round(sy);
        // A crab's eye is a compound eye on the end of the stalk: a dark,
        // slightly long bulb, faceted, catching the light in one small wet
        // point and a dull sheen across its top. Drawn on the screen grid.
        const ang = Math.atan2(T.b * Math.cos(a) + T.d * Math.sin(a), T.a * Math.cos(a) + T.c * Math.sin(a));
        const ca = Math.cos(ang), sa2 = Math.sin(ang);
        const cell = Math.max(1, Math.round(Math.hypot(T.a, T.b)));
        const ra = sr * 1.2 / cell, rb = sr * 0.92 / cell;
        const R = Math.ceil(ra) + 1;
        for (let yy = -R; yy <= R; yy++) {
          for (let xx = -R; xx <= R; xx++) {
            const u = (xx * ca + yy * sa2) / ra, w2 = (-xx * sa2 + yy * ca) / rb;
            const d = u * u + w2 * w2;
            if (d > 1) continue;
            // a hermit crab's eye: a gold-green globe with a dark band of
            // pupil across it, glassy at the top
            const up = -yy / R;
            let c;
            if (d > 0.80) c = '#1a1408';
            else if (Math.abs(w2) < 0.28) c = '#10120c';
            else if (up > 0.2) c = ((xx + yy) & 1) ? '#d9e3a0' : '#c4d08a';
            else c = ((xx + yy) & 1) ? '#9fae62' : '#8a9a52';
            ctx.fillStyle = c;
            ctx.fillRect(bx + xx * cell, by + yy * cell, cell, cell);
          }
        }
        // the wet highlight, and its dim twin on the far side
        const gs = Math.max(cell, Math.round(sr * 0.32 / cell) * cell);
        ctx.fillStyle = '#f4f8f8';
        ctx.fillRect(Math.round(bx - sr * 0.45), Math.round(by - sr * 0.55), gs, gs);
        ctx.fillStyle = '#7f949a';
        ctx.fillRect(Math.round(bx + sr * 0.35), Math.round(by + sr * 0.1), cell, cell);
        ctx.restore();
      } else {
        // shut: a happy little arc
        ctx.fillStyle = '#000000';
        for (let k = -2; k <= 2; k++) {
          ctx.fillRect(Math.round(ex + k * r * 0.4), Math.round(ey - (2 - Math.abs(k)) * 0.5 * S), 1, 1);
        }
      }
    }

  }

  _drawShadow(ctx, cam) {
    const t = this.game.terrain;
    const sun = this.game.weather ? this.game.weather.shadowAlpha : 0.4;
    if (sun <= 0.02) return;
    const w = this.m.rx * 1.05;
    const steps = 10;
    ctx.save();
    ctx.globalAlpha = sun * 0.55;
    ctx.fillStyle = '#2a1a10';
    for (let i = 0; i < steps; i++) {
      const k = (i + 0.5) / steps;
      const wx = this.x + lerp(-w, w, k);
      const gy = t.surfaceY(wx);
      const s0 = cam.worldToScreen(wx, gy);
      const hgt = Math.sqrt(Math.max(0, 1 - Math.pow((k - 0.5) * 2, 2)));
      const hw = (w * 2 / steps) * cam.zoom * 0.62;
      ctx.fillRect(Math.round(s0.x - hw / 2), Math.round(s0.y - 1 * cam.zoom),
        Math.ceil(hw) + 1, Math.ceil(hgt * 3.4 * cam.zoom) + 1);
    }
    ctx.restore();
  }
}
