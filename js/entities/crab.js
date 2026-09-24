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
    this.standH = this.m.faceH * 0.90 + this.m.shellW * 0.05;   // sits low: a squat, round animal
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
    return this.x + l.def.side * this.m.rx * (0.95 + sp * 0.58) + lead;
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
      this.lookT = 1.2 + Math.random() * 2.6;
      this.idleLook = { x: (Math.random() - 0.5) * 1.3, y: -0.15 - Math.random() * 0.5 };
    }
    if (spd < 6 && this.alarm < 0.1 && this.idleLook) { tx = this.idleLook.x; ty = this.idleLook.y; }
    this.look.x = damp(this.look.x, tx, 0.002, dt);
    this.look.y = damp(this.look.y, ty, 0.002, dt);
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
        if (off > trigger && lifting < 3 && !partnerBusy) {
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
    const a = -(this.bodyAngle + this.roll);
    const c = Math.cos(a), s = Math.sin(a);

    for (const leg of this.legs) {
      if (!!leg.def.far !== far) continue;
      const art = far ? rig.legArt.far : rig.legArt.near;
      const l1 = art.coxa.len, l2 = art.femur.len, l3 = art.tibia.len;
      const wx = leg.foot.x - (this.x + this.lurch * 0.35);
      const wy = leg.foot.y - (this.y + this.bob);
      const lx = wx * c - wy * s, ly = wx * s + wy * c;
      const hx = leg.def.x, hy = leg.def.y;
      const side = leg.def.side;

      // the ankle sits above the contact point and outboard of it, so the
      // knee comes up and out the way a crab's does
      const ankX = lx - side * l3 * 0.40;
      const ankY = ly - l3 * 0.80;
      const sol = ik2(hx, hy, ankX, ankY, l1, l2, side);

      this._seg(ctx, art.coxa, hx, hy, sol.a1);
      this._seg(ctx, art.femur, sol.kx, sol.ky, sol.a2);
      const fx = sol.kx + Math.cos(sol.a2) * l2, fy = sol.ky + Math.sin(sol.a2) * l2;
      this._seg(ctx, art.tibia, fx, fy, Math.atan2(ly - fy, lx - fx));
    }
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
    // the trailing claw is the one further from the direction of travel
    const order = this.turnDir >= 0 ? [-1, 1] : [1, -1];
    for (const side of order) {
      const near = side === (this.turnDir >= 0 ? 1 : -1);
      const art = near ? rig.claw.near : rig.claw.far;
      const so = rig.sockets.claws.find((q) => q.side === side);
      const sw = Math.sin(this.clawT * (near ? 1.07 : 0.83)) * 0.07;
      const raise = this.clawOpen * 0.5 + this.pumping * 0.6 + this.alarm * 0.5
        + (side > 0 ? Math.sin(this.tapT * Math.PI) * (this.tapLong ? 0.85 : 0.5) : 0);
      // mirrored: the left claw is the right claw drawn backwards
      ctx.save();
      ctx.translate(so.x, so.y);
      ctx.scale(side, 1);
      const a1 = 0.92 + sw - raise * 0.62 + this.crouch * 0.2;
      const ex = Math.cos(a1) * art.arm.len, ey = Math.sin(a1) * art.arm.len;
      const a2 = a1 - 1.10 - raise * 0.34;
      const fx = ex + Math.cos(a2) * art.fore.len, fy = ey + Math.sin(a2) * art.fore.len;
      const a3 = a2 + 0.18 - raise * 0.22 + Math.sin(this.clawT * 1.9 + side) * 0.04;
      this._seg(ctx, art.arm, 0, 0, a1);
      this._seg(ctx, art.fore, ex, ey, a2);
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(a3);
      ctx.drawImage(art.palm.cv, -art.palm.ox, -art.palm.oy);
      ctx.save();
      ctx.translate(art.hinge.x, art.hinge.y);
      ctx.rotate(-0.28 - this.clawOpen * 0.55);
      ctx.drawImage(art.dactyl.cv, -art.dactyl.ox, -art.dactyl.oy);
      ctx.restore();
      ctx.restore();
      ctx.restore();
    }
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
    for (const e of rig.sockets.eyes) {
      // stalks splay out and up, and both lean the way the crab is looking
      const base = -Math.PI / 2 + e.side * 0.34;
      const a = base + this.look.x * 0.22 * e.side + this.look.y * 0.18;
      const shrink = this.blink > 0
        ? 1 - Math.sin(clamp01(this.blink / 0.16) * Math.PI) * 0.7 : 1;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(a);
      ctx.scale(1, shrink);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      // the eyeball, placed in body space so it does not swing with the
      // stalk: a dark rim, the white, a big pupil that follows the look, and
      // two catchlights - which is most of what makes it a face you like
      // a plain bead of pitch black on the end of each stalk, centred on a
      // whole pixel so it is a clean round dot
      const r = Math.max(2, Math.round(art.r * 0.7));
      const ex = Math.round(e.x + Math.cos(a) * art.globe) + 0.5;
      const ey = Math.round(e.y + Math.sin(a) * art.globe) + 0.5;
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
        pxDisc(ctx, Math.round(sx), Math.round(sy), sr, '#000000', { p: 1 });
        ctx.restore();
      } else {
        // shut: a happy little arc
        ctx.fillStyle = '#000000';
        for (let k = -2; k <= 2; k++) {
          ctx.fillRect(Math.round(ex + k * r * 0.4), Math.round(ey - (2 - Math.abs(k)) * 0.5 * S), 1, 1);
        }
      }
    }

    // pink cheeks under the eyes
    const E = rig.sockets.eyes;
    const fy = E[0].y + 1.5 * S;
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (const e of E) pxEllipse(ctx, e.x + e.side * art.r * 1.1, fy + 0.5 * S, 2.6 * S, 1.5 * S, '#f07c86', { p: 1 });
    ctx.restore();
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
