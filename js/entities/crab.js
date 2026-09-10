// CRABDEN - the player crab.
//
// Movement is a walk cycle solved from the ground, not played back: each leg
// keeps a planted foot in world space and takes a step when the body has
// carried it too far, and the body then rides on the feet it is standing on.
// Two-bone IK bends every joint, so a leg on a dune slope and a leg in a
// hollow bend differently on the same frame.

import { clamp, clamp01, lerp, damp, TAU, angleLerp } from '../lib/math.js';
import { buildCrab, crabMetrics } from '../art/crabart.js';

/** Two-bone IK. `up` picks which side the joint folds toward. */
export function ik2(hx, hy, tx, ty, l1, l2, up = 1) {
  let dx = tx - hx, dy = ty - hy;
  let d = Math.hypot(dx, dy) || 0.001;
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
  constructor(game, stage = 'juvenile') {
    this.game = game;
    this.setStage(stage, true);

    this.x = 0;
    this.y = 0;
    this.vx = 0;
    // a crab does not turn to walk. It is always side-on; `facing` is only
    // which way it is currently scuttling, and the body never flips.
    this.facing = 1;
    this.faceT = 1;
    this.lean = 0;
    this.roll = 0;
    this.lurch = 0;
    this.breathe = Math.random() * TAU;
    this.look = { x: 0.4, y: -0.2 };
    this.lookT = 0;
    this.blinkPhase = 0;
    this.mouthT = Math.random() * TAU;
    this.alarm = 0;

    this.bodyAngle = 0;
    this.bob = 0;
    this.bobT = 0;
    this.crouch = 0;

    this.pumping = 0;
    this.pumpT = 0;
    this.clawT = 0;
    this.clawOpen = 0;
    this.eyeLook = 0;
    this.blink = 0;
    this.blinkT = 2;

    this.hp = 120;
    this.hpMax = 120;
    this.iframe = 0;
    this.threat = null;
    this.idleLook = null;
  }

  setStage(stage, snap = false) {
    this.stage = stage;
    this.rig = buildCrab(stage);
    this.m = this.rig.m;
    this.S = this.rig.S;
    this.standH = this.m.bodyH * 0.40 + this.m.reach * 0.54;
    this.speed = lerp(64, 96, this.m.t);
    this._buildLegs();
    if (snap && this.game && this.game.terrain) this.snapToGround();
  }

  _buildLegs() {
    const rig = this.rig;
    this.legs = rig.sockets.legs.map((s, i) => ({
      def: s,
      foot: { x: 0, y: 0 },
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      stepping: false,
      t: 0,
      dur: 0.22,
      lift: 0,
      order: i,
      planted: true,
    }));
    // interleave so opposite legs never lift together
    this.legs.forEach((l, i) => { l.group = (i + (l.def.far ? 1 : 0)) % 2; });
  }

  snapToGround() {
    const t = this.game.terrain;
    this.y = t.surfaceY(this.x) - this.standH;
    for (const l of this.legs) {
      const fx = this.x + l.def.spread * this.m.bodyW * 0.5;
      l.foot.x = fx; l.foot.y = t.surfaceY(fx);
      l.from = { ...l.foot }; l.to = { ...l.foot };
    }
  }

  get worldY() { return this.y; }

  /** Where the shell surface point `u` lands in world space, this frame. */
  shellWorld(u) {
    const p = this.rig.shellPoint(u);
    return this.localToWorld(p.x, p.y, p.nx, p.ny);
  }

  localToWorld(lx, ly, nx = 0, ny = 0) {
    const f = this.faceT;
    const c = Math.cos(this.bodyAngle), s = Math.sin(this.bodyAngle);
    const px = lx * f, py = ly;
    return {
      x: this.x + px * c - py * s,
      y: this.y + px * s + py * c + this.bob,
      nx: (nx * f) * c - ny * s,
      ny: (nx * f) * s + ny * c,
    };
  }

  // -------------------------------------------------------------------------

  update(dt, ctrl = {}) {
    const t = this.game.terrain;
    const move = clamp(ctrl.move || 0, -1, 1);
    const speed = this.speed * (ctrl.speedMul || 1) * (ctrl.sprint ? 1.5 : 1) * (1 - this.crouch * 0.6);

    this.vx = damp(this.vx, move * speed, 0.0002, dt);
    if (Math.abs(this.vx) < 0.6) this.vx = 0;
    this.x += this.vx * dt;

    if (move > 0.1) this.facing = 1;
    else if (move < -0.1) this.facing = -1;
    // the body leans into the direction of travel instead of turning to face it
    this.lean = damp(this.lean, clamp(this.vx / this.speed, -1, 1) * 0.13, 0.0009, dt);

    this._stepLegs(dt, t);
    this._rideFeet(dt, t);

    // a scuttle is a lurch, not a bob: the shell rocks across the gait and the
    // whole animal breathes between steps
    const spd = Math.abs(this.vx);
    const run = clamp01(spd / (this.speed * 0.85));
    this.bobT += dt * (2.4 + spd * 0.085);
    this.breathe += dt * (1.1 + run * 1.4);
    const walkBob = Math.sin(this.bobT * 2) * run * this.S * 1.6;
    const idleBob = Math.sin(this.breathe) * this.S * 0.5;
    this.bob = damp(this.bob, walkBob + idleBob, 0.001, dt);
    this.lurch = damp(this.lurch, Math.sin(this.bobT * 2 + 0.9) * run * this.S * 1.9 * this.facing, 0.001, dt);
    this.roll = damp(this.roll, Math.sin(this.bobT) * run * 0.045, 0.0012, dt);

    // eyes: the stalks swivel toward whatever matters, which is usually
    // wherever the crab is about to walk
    this.lookT -= dt;
    let tx = clamp(this.vx / this.speed, -1, 1) * 0.9, ty = -0.35;
    if (this.alarm > 0.1 && this.threat) {
      tx = clamp((this.threat.x - this.x) / 70, -1.2, 1.2);
      ty = clamp((this.threat.y - this.y) / 70, -1, 0.6);
    } else if (this.lookT <= 0) {
      this.lookT = 1.2 + Math.random() * 2.6;
      this.idleLook = { x: (Math.random() - 0.5) * 1.4, y: -0.2 - Math.random() * 0.5 };
    }
    if (spd < 6 && this.alarm < 0.1 && this.idleLook) { tx = this.idleLook.x; ty = this.idleLook.y; }
    this.look.x = damp(this.look.x, tx, 0.002, dt);
    this.look.y = damp(this.look.y, ty, 0.002, dt);
    this.eyeLook = this.look.x;
    this.alarm = Math.max(0, this.alarm - dt * 0.7);

    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = 2.2 + Math.random() * 4.5; this.blink = 0.18; }
    this.blink = Math.max(0, this.blink - dt);
    this.mouthT += dt * (5.5 + (this.pumping > 0 ? 9 : 0));

    // claw idle / gesture
    this.clawT += dt;
    const wantOpen = ctrl.grab ? 1
      : this.alarm > 0.2 ? 0.85 + Math.sin(this.clawT * 9) * 0.15
        : this.pumping > 0 ? 0.7 : 0.40 + Math.sin(this.clawT * 1.3) * 0.10;
    this.clawOpen = damp(this.clawOpen, wantOpen, 0.001, dt);

    this.pumpT += dt;
    this.pumping = Math.max(0, this.pumping - dt);
    this.crouch = damp(this.crouch, this.pumping > 0 ? 1 : 0, 0.0009, dt);
  }

  _stepLegs(dt, t) {
    const lead = this.vx * 0.20;
    const trigger = this.m.bodyW * 0.155 + Math.abs(this.vx) * 0.055;
    let lifting = 0;
    for (const l of this.legs) if (l.stepping) lifting++;

    for (const l of this.legs) {
      const homeX = this.x + l.def.spread * this.m.bodyW * 0.52 * this.faceT + lead;
      if (l.stepping) {
        l.t += dt / l.dur;
        if (l.t >= 1) {
          l.t = 1; l.stepping = false; l.planted = true;
          l.foot.x = l.to.x; l.foot.y = l.to.y;
          this._land(l, t);
        } else {
          const k = l.t;
          l.foot.x = lerp(l.from.x, l.to.x, k);
          const base = lerp(l.from.y, l.to.y, k);
          l.lift = Math.sin(k * Math.PI) * (this.m.legLen[1] * 0.52 + Math.abs(this.vx) * 0.045);
          l.foot.y = base - l.lift;
        }
      } else {
        l.lift = damp(l.lift, 0, 0.0001, dt);
        const off = Math.abs(l.foot.x - homeX);
        const partnerBusy = this.legs.some((o) => o !== l && o.stepping && o.group === l.group);
        if (off > trigger && lifting < 3 && !partnerBusy) {
          l.stepping = true; l.planted = false; l.t = 0;
          l.dur = clamp(0.30 - Math.abs(this.vx) * 0.0016, 0.13, 0.30);
          l.from = { x: l.foot.x, y: l.foot.y };
          const tx = homeX + Math.sign(homeX - l.foot.x) * trigger * 0.75;
          l.to = { x: tx, y: t.surfaceY(tx) };
          lifting++;
        } else {
          // planted feet follow the sand as it settles
          l.foot.y = damp(l.foot.y, t.surfaceY(l.foot.x), 0.0005, dt);
        }
      }
    }
  }

  _land(l, t) {
    const w = Math.abs(this.vx);
    t.deform(l.foot.x, 1.5 + w * 0.012, 5 + this.m.bodyW * 0.05);
    // eight legs landing would be a permanent dust storm; only some throw sand
    if (this.game.fx && (l.def.far || Math.random() < 0.45)) {
      this.game.fx.footPuff(l.foot.x, l.foot.y, w * 0.55, l.def.far);
    }
    if (this.game.audio && w > 12 && !l.def.far) this.game.audio.play('step', { vol: 0.3 });
  }

  _rideFeet(dt, t) {
    // fit the body to the feet that are on the ground
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (const l of this.legs) {
      if (l.stepping) continue;
      const dx = l.foot.x - this.x;
      sx += dx; sy += l.foot.y; sxx += dx * dx; sxy += dx * l.foot.y; n++;
    }
    let groundY = t.surfaceY(this.x), slope = 0;
    if (n >= 2) {
      const denom = n * sxx - sx * sx;
      if (Math.abs(denom) > 0.001) slope = (n * sxy - sx * sy) / denom;
      groundY = sy / n - slope * (sx / n) * 0;
      groundY = (sy - slope * sx) / n;
    }
    const targetY = groundY - this.standH * (1 - this.crouch * 0.28);
    this.y = damp(this.y, targetY, 0.0008, dt);
    const targetA = clamp(Math.atan(slope), -0.55, 0.55);
    this.bodyAngle = damp(this.bodyAngle, targetA, 0.0009, dt);
  }

  /** Something worth watching: sets the gaze and lifts the claw. */
  alertTo(ent, amount = 1) {
    this.threat = ent;
    this.alarm = Math.min(1.4, this.alarm + amount);
  }

  pump() {
    this.pumping = 0.55;
    this.pumpT = 0;
  }

  // -------------------------------------------------------------------------

  draw(ctx, cam, garden) {
    const rig = this.rig;
    const f = 1;                       // the crab never turns around
    const sc = cam.zoom;
    const p = cam.worldToScreen(this.x + this.lurch * 0.35, this.y + this.bob);

    // contact shadow first, in screen space, so it hugs the sand
    this._drawShadow(ctx, cam);

    ctx.save();
    ctx.translate(Math.round(p.x * 2) / 2, Math.round(p.y * 2) / 2);
    ctx.scale(sc, sc);

    // ---- far side ----------------------------------------------------------
    ctx.save();
    ctx.rotate(this.bodyAngle + this.roll);
    this._drawLegs(ctx, true);
    this._drawClaw(ctx, true);
    ctx.restore();

    if (garden) garden.drawFar(ctx, this);

    // ---- body --------------------------------------------------------------
    ctx.save();
    ctx.rotate(this.bodyAngle + this.roll);
    ctx.translate(this.lean * 3, 0);
    const br = 1 + Math.sin(this.breathe) * 0.012;
    ctx.scale(1, br);
    ctx.drawImage(rig.body.cv, -rig.body.ox, -rig.body.oy);
    ctx.restore();

    // ---- shell garden (live) -----------------------------------------------
    if (garden) garden.drawNear(ctx, this);

    // ---- near side ---------------------------------------------------------
    ctx.save();
    ctx.rotate(this.bodyAngle + this.roll);
    this._drawLegs(ctx, false);
    this._drawClaw(ctx, false);
    this._drawFace(ctx);
    ctx.restore();

    ctx.restore();
  }

  _drawShadow(ctx, cam) {
    const t = this.game.terrain;
    const sun = this.game.weather ? this.game.weather.shadowAlpha : 0.4;
    if (sun <= 0.02) return;
    const w = this.m.shellW * 0.52;
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

  /** Legs are solved in body space so the whole rig can be flipped at once. */
  _drawLegs(ctx, far) {
    const rig = this.rig;
    const art = far ? rig.legArt.far : rig.legArt.near;
    const l1 = art.coxa.len, l2 = art.femur.len, l3 = art.tibia.len;
    const a = -(this.bodyAngle + this.roll);
    const c = Math.cos(a), s = Math.sin(a);

    for (const leg of this.legs) {
      if (!!leg.def.far !== far) continue;
      // foot in body-local space (undo the translate and the body rotation)
      const wx = leg.foot.x - (this.x + this.lurch * 0.35);
      const wy = leg.foot.y - (this.y + this.bob);
      const lx = wx * c - wy * s, ly = wx * s + wy * c;
      const hx = leg.def.x, hy = leg.def.y;

      // the ankle sits above the contact point, and outer legs splay wider so
      // the coxa reads as a shoulder rather than one more stilt segment
      const dirx = lx - hx;
      const ankX = lx - Math.sign(dirx || 1) * l3 * 0.46 + leg.def.spread * l1 * 0.30;
      const ankY = ly - l3 * 0.88;
      const sol = ik2(hx, hy, ankX, ankY, l1, l2, -1);

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

  _drawClaw(ctx, far) {
    const rig = this.rig;
    const art = far ? rig.claw.far : rig.claw.near;
    const so = rig.sockets.claw;
    const sx = so.x + (far ? -3 * this.S : 1.5 * this.S);
    const sy = so.y + (far ? -2 * this.S : 1.5 * this.S);
    const sw = Math.sin(this.clawT * (far ? 0.83 : 1.07)) * 0.07;
    const raise = this.clawOpen * 0.55 + this.pumping * 0.6 + this.alarm * 0.5;
    const a1 = 1.24 + sw - raise * 0.7 + this.crouch * 0.2;
    const armEnd = { x: sx + Math.cos(a1) * art.arm.len, y: sy + Math.sin(a1) * art.arm.len };
    const a2 = a1 - 1.42 - raise * 0.34 + (far ? 0.10 : 0);
    const foreEnd = { x: armEnd.x + Math.cos(a2) * art.fore.len, y: armEnd.y + Math.sin(a2) * art.fore.len };
    const a3 = a2 + 0.16 - raise * 0.22 + Math.sin(this.clawT * 1.9 + (far ? 1 : 0)) * 0.04;

    this._seg(ctx, art.arm, sx, sy, a1);
    this._seg(ctx, art.fore, armEnd.x, armEnd.y, a2);

    ctx.save();
    ctx.translate(foreEnd.x, foreEnd.y);
    ctx.rotate(a3);
    ctx.drawImage(art.palm.cv, -art.palm.ox, -art.palm.oy);
    ctx.save();
    ctx.translate(art.hinge.x, art.hinge.y);
    ctx.rotate(-0.30 - this.clawOpen * 0.55);
    ctx.drawImage(art.dactyl.cv, -art.dactyl.ox, -art.dactyl.oy);
    ctx.restore();
    ctx.restore();
  }

  /** Eyes on stalks, plus the mouthparts, which never stop moving. */
  _drawFace(ctx) {
    const rig = this.rig;
    const S = this.S;

    const mo = rig.sockets.mouth;
    if (rig.mouth) {
      ctx.save();
      ctx.translate(mo.x, mo.y + Math.sin(this.mouthT) * 0.4 * S);
      ctx.rotate(Math.sin(this.mouthT * 1.3) * 0.14);
      ctx.drawImage(rig.mouth.cv, -rig.mouth.ox, -rig.mouth.oy);
      ctx.restore();
    }

    for (const e of rig.sockets.eyes) {
      const art = e.far ? rig.eye.far : rig.eye.near;
      // the stalk itself leans; the eye on the end does the looking
      const a = -1.02 + this.look.x * 0.22 + this.look.y * 0.30
        + (e.far ? -0.20 : 0.14) + Math.sin(this.clawT * 0.9 + (e.far ? 2 : 0)) * 0.04;
      const shrink = this.blink > 0 ? 1 - Math.sin(clamp01(this.blink / 0.18) * Math.PI) * 0.55 : 1;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(a);
      ctx.scale(1, shrink);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      // pupil, drawn live so it can actually track something
      if (shrink > 0.6) {
        const r = art.r || 4 * S;
        const px = art.globe + this.look.x * r * 0.34;
        const py = this.look.y * r * 0.34;
        ctx.fillStyle = '#120d14';
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.42, r * 0.46, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(244,240,246,0.85)';
        ctx.fillRect(Math.round(px - r * 0.30), Math.round(py - r * 0.34), Math.max(1, r * 0.22), Math.max(1, r * 0.22));
      }
      ctx.restore();
    }
  }
}
