// CRABDEN - the ancient crab.
//
// No walk cycle sprites anywhere in here. Every leg picks its own footholds,
// solves two-bone IK against the dune it is standing on, and the body rides on
// the average of where its feet ended up. Claws, eye stalks and the water
// organ are all springs.

import {
  TAU, clamp, clamp01, lerp, damp, angleLerp, dist, wobble, mixHex, rgba, easeOutCubic,
} from '../lib/math.js';
import {
  ik2, limb, pxLine, pxEllipse, pxEllipseRot, ditherBlob, groundShadow, px,
} from '../render/sprites.js';
const LEG_PAIRS = 4;

export class Crab {
  constructor(game) {
    this.game = game;
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.facing = -Math.PI / 2;
    this.bodyAngle = this.facing;

    this.stage = 1;
    this.size = 4.2;             // carapace half-length in world px
    this.targetSize = 4.2;

    this.hpMax = 40; this.hp = 40;
    this.water = 0; this.waterMax = 20;
    this.vigor = 1;              // pumping stamina, 0..1
    this.strain = 0;

    this.mode = 'idle';
    this.controlled = false;
    this.moveTarget = null;
    this.lookAt = null;
    this.attackTarget = null;

    this.pumping = false;
    this.pumpAmount = 0;
    this.pouring = false;
    this.pourPoint = null;
    this.organPulse = 0;
    this.organSquash = 0;
    this.sloshT = 0;

    this.clawSwing = [0, 0];
    this.clawCooldown = 0;
    this.clawSide = 0;
    this.dashT = 0;
    this.dashCooldown = 0;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.emote = null;
    this.emoteT = 0;

    this.bodyZ = 0;
    this.bodyZv = 0;
    this.tiltX = 0; this.tiltY = 0;
    this.stepSound = 0;
    this.distanceWalked = 0;
    this.buried = 0;             // 1 = fully buried (intro)

    this.legs = [];
    this.legPairs = LEG_PAIRS;
    this._buildLegs();

    this.eyes = [
      { x: 0, y: 0, vx: 0, vy: 0, side: -1 },
      { x: 0, y: 0, vx: 0, vy: 0, side: 1 },
    ];
    this.claws = [
      { side: -1, x: 0, y: 0, vx: 0, vy: 0, open: 0.25, swing: 0 },
      { side: 1, x: 0, y: 0, vx: 0, vy: 0, open: 0.25, swing: 0 },
    ];

    this.pal = {
      shell: '#b8543a', shellHi: '#e08a5c', shellLo: '#7a3324',
      rim: '#40170f', leg: '#a34a34', legHi: '#cf7a56',
      organ: '#57c8d8', organHi: '#c6f6ff', organLo: '#2a6f80',
      eye: '#1b1016', eyeHi: '#ffffff',
    };
  }

  // -- setup ----------------------------------------------------------------

  _buildLegs() {
    this.legs.length = 0;
    const pairs = Math.max(2, Math.round((this.game.evo ? this.game.evo.stats.legPairs : LEG_PAIRS)));
    this.legPairs = pairs;
    for (const side of [-1, 1]) {
      for (let i = 0; i < pairs; i++) {
        const spread = (i - (pairs - 1) / 2) * 0.46;
        this.legs.push({
          side, i,
          restAngle: side * (Math.PI / 2) + spread * -side,
          restDist: 2.15 - Math.abs(i - (pairs - 1) / 2) * 0.16,
          fx: this.x, fy: this.y, fz: 0,
          stepping: false, t: 0, dur: 0.2,
          ax: 0, ay: 0, bx: 0, by: 0,
          lift: 0,
          group: (i + (side > 0 ? 1 : 0)) % 2,
          planted: true,
        });
      }
    }
    this._resetFeet();
  }

  _resetFeet() {
    for (const leg of this.legs) {
      const a = this.facing + leg.restAngle;
      leg.fx = this.x + Math.cos(a) * this.size * leg.restDist;
      leg.fy = this.y + Math.sin(a) * this.size * leg.restDist;
      leg.stepping = false;
    }
  }

  get stats() { return this.game.evo ? this.game.evo.stats : DEFAULT_STATS; }

  get speedMax() { return this.stats.speed * (this.game.hazardSlow ?? 1); }

  applyStats() {
    const s = this.stats;
    this.targetSize = s.size;
    this.waterMax = s.waterMax + (this.game.bonusWaterMax || 0);
    if (this.legPairs !== Math.round(s.legPairs)) this._buildLegs();
    const newMax = s.hpMax;
    if (newMax !== this.hpMax) {
      const frac = this.hp / this.hpMax;
      this.hpMax = newMax;
      this.hp = Math.min(newMax, Math.max(this.hp, frac * newMax));
    }
  }

  // -- commands -------------------------------------------------------------

  commandMoveTo(x, y) {
    this.moveTarget = { x, y };
    this.mode = 'move';
  }
  stop() { this.moveTarget = null; this.mode = 'idle'; }

  say(emote, time = 1.6) { this.emote = emote; this.emoteT = time; }

  // -- combat ---------------------------------------------------------------

  swingClaw(targetX, targetY) {
    if (this.clawCooldown > 0) return false;
    const s = this.stats;
    this.clawCooldown = 0.42 / s.attackSpeed;
    this.clawSide = 1 - this.clawSide;
    const c = this.claws[this.clawSide];
    c.swing = 1;
    const ang = Math.atan2(targetY - this.y, targetX - this.x);
    this.targetFacingOverride = ang;
    this.game.combat.crabSwing(this, ang);
    this.game.audio.play('claw');
    return true;
  }

  dash() {
    if (this.dashCooldown > 0 || !this.stats.canDash) return false;
    this.dashCooldown = 1.5;
    this.dashT = 0.24;
    this.invuln = Math.max(this.invuln, 0.2);
    this.game.audio.play('step', { pitch: 0.6 });
    this.game.particles.burst('sand', this.x, this.y, 10, {
      color: this.game.currentRegion.pal.hi, speedMin: 20, speedMax: 60, life: 0.5, grav: 40, lift: 12, layer: 'over',
    });
    return true;
  }

  hurt(amount, fromX, fromY, source) {
    // Cinematics are a safe space. Taking damage mid-cutscene used to leave
    // the cutscene and the death screen both waiting for the same click.
    if (this.invuln > 0 || this.game.state === 'dead' || this.game.state === 'cutscene') return false;
    const armor = this.stats.armor;
    const dmg = Math.max(1, amount * (1 - clamp01(armor)));
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = 0.55;
    this.hurtFlash = 1;
    this.game.audio.play('hurt');
    this.game.cam.addShake(2.2 + dmg * 0.12);
    this.game.particles.text('-' + Math.round(dmg), this.x, this.y - 14, { color: '#ff8a8a', scale: 1, shake: 2 });
    if (fromX !== undefined) {
      const a = Math.atan2(this.y - fromY, this.x - fromX);
      this.vx += Math.cos(a) * 70;
      this.vy += Math.sin(a) * 70;
    }
    if (this.hp <= 0) this.game.onCrabDown(source);
    return true;
  }

  heal(n) {
    this.hp = Math.min(this.hpMax, this.hp + n);
    this.game.particles.text('+' + Math.round(n), this.x, this.y - 14, { color: '#9fe27a' });
  }

  // -- water ----------------------------------------------------------------

  addWater(n) {
    const before = this.water;
    this.water = clamp(this.water + n, 0, this.waterMax);
    return this.water - before;
  }

  /** Hold the organ: manufacture water out of nutrients and effort. */
  pump(dt) {
    const s = this.stats;
    if (this.vigor <= 0.02 || this.water >= this.waterMax) {
      this.pumping = false;
      return 0;
    }
    this.pumping = true;
    const rate = s.waterRate * s.pumpMult;
    const made = Math.min(rate * dt, this.waterMax - this.water);
    this.water += made;
    this.vigor = clamp01(this.vigor - dt * 0.26 / s.vigorEff);
    this.pumpAmount = Math.min(1, this.pumpAmount + dt * 3);
    this.organSquash = Math.min(1, this.organSquash + dt * 4);
    return made;
  }

  /** Spray stored water onto the ground. Returns litres delivered. */
  pour(dt, tx, ty) {
    if (this.water <= 0.02) return 0;
    const s = this.stats;
    const amount = Math.min(this.water, s.pourRate * dt);
    this.water -= amount;
    const d = dist(this.x, this.y, tx, ty);
    const reach = s.pourReach;
    let px2 = tx, py2 = ty;
    if (d > reach) {
      px2 = this.x + (tx - this.x) / d * reach;
      py2 = this.y + (ty - this.y) / d * reach;
    }
    this.pourPoint = { x: px2, y: py2 };
    this.pouring = true;
    this.game.eco.addWater(px2, py2, amount * 70, s.pourRadius);
    return amount;
  }

  // -- update ---------------------------------------------------------------

  update(dt, game) {
    const world = game.world;
    const s = this.stats;
    this.applyStats();

    this.clawCooldown = Math.max(0, this.clawCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.4);
    this.emoteT = Math.max(0, this.emoteT - dt);
    if (this.emoteT <= 0) this.emote = null;
    this.sloshT += dt * (1 + Math.hypot(this.vx, this.vy) * 0.02);
    this.size = damp(this.size, this.targetSize, 0.2, dt);

    // vigor + passive water
    if (!this.pumping) this.vigor = clamp01(this.vigor + dt * 0.24 * s.vigorEff);
    this.pumpAmount = Math.max(0, this.pumpAmount - dt * 2.2);
    this.organSquash = Math.max(0, this.organSquash - dt * 2.4);
    if (!this.pumping) this.addWater(s.waterRate * s.passiveMult * dt);
    this.organPulse += dt * (1.6 + this.pumpAmount * 5);

    // desiccation: the desert takes water back
    const drain = game.state === 'dead' ? 0 : s.thirst * game.weather.waterDrainMult * (game.hazardDrain ?? 1);
    if (drain > 0) {
      if (this.water > 0) this.water = Math.max(0, this.water - drain * dt * 0.35);
      else this.hp = Math.max(1, this.hp - drain * dt * 0.9);   // thirst never finishes you off
    }

    // -- movement ----------------------------------------------------------
    let ax = 0, ay = 0;
    const speed = this.speedMax * (this.dashT > 0 ? 3.1 : 1);

    if (this.controlled) {
      const axis = game.input.axis();
      if (axis.len > 0) {
        ax = axis.x; ay = axis.y;
        this.moveTarget = null;
        this.mode = 'move';
      } else if (!this.moveTarget) this.mode = 'idle';
    }

    if (this.moveTarget) {
      const d = dist(this.x, this.y, this.moveTarget.x, this.moveTarget.y);
      if (d < 5) { this.moveTarget = null; this.mode = 'idle'; }
      else {
        ax = (this.moveTarget.x - this.x) / d;
        ay = (this.moveTarget.y - this.y) / d;
        if (d < 22) { ax *= d / 22; ay *= d / 22; }
      }
    }

    const accel = 520;
    this.vx += ax * accel * dt;
    this.vy += ay * accel * dt;

    // drag + clamp
    const fr = Math.pow(0.0012, dt);
    this.vx *= fr; this.vy *= fr;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > speed) { this.vx = this.vx / sp * speed; this.vy = this.vy / sp * speed; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.distanceWalked += sp * dt;
    world.clampToWorld(this);

    // collide with solid scenery
    for (const d of world.solidsNear(this.x, this.y, this.size * 1.6)) {
      const dd = Math.hypot(d.x - this.x, d.y - this.y);
      const min = d.r + this.size * 0.9;
      if (dd < min && dd > 0.001) {
        const push = (min - dd);
        this.x -= (d.x - this.x) / dd * push;
        this.y -= (d.y - this.y) / dd * push;
      }
    }

    // -- facing -------------------------------------------------------------
    let want = this.facing;
    if (this.targetFacingOverride !== undefined) {
      want = this.targetFacingOverride;
      this.targetFacingOverride = undefined;
    } else if (sp > 6) {
      want = Math.atan2(this.vy, this.vx);
    } else if (this.lookAt) {
      want = Math.atan2(this.lookAt.y - this.y, this.lookAt.x - this.x);
    }
    this.facing = angleLerp(this.facing, want, 1 - Math.pow(0.0009, dt));
    // the shell lags a touch behind the heading; that sells the weight
    this.bodyAngle = angleLerp(this.bodyAngle, this.facing, 1 - Math.pow(0.02, dt));

    this._updateLegs(dt, game, sp);
    this._updateBody(dt, game, sp);
    this._updateClaws(dt, game);
    this._updateEyes(dt, game, sp);

    if (this.pouring && !this._pourHeld) { this.pouring = false; this.pourPoint = null; }
    this._pourHeld = false;
  }

  markPouring() { this._pourHeld = true; }

  _updateLegs(dt, game, speed) {
    const world = game.world;
    const s = this.stats;
    const legLen = this.size * s.legLength;
    const stepThresh = this.size * (0.85 + speed * 0.004);
    let stepping = 0;
    for (const leg of this.legs) if (leg.stepping) stepping++;

    // lead the footfall in the direction of travel
    const leadX = this.vx * 0.11;
    const leadY = this.vy * 0.11;

    for (const leg of this.legs) {
      const a = this.bodyAngle + leg.restAngle;
      const anchorX = this.x + Math.cos(a) * this.size * leg.restDist * s.stanceWidth + leadX;
      const anchorY = this.y + Math.sin(a) * this.size * leg.restDist * s.stanceWidth + leadY;
      leg.anchorX = anchorX; leg.anchorY = anchorY;

      if (leg.stepping) {
        leg.t += dt / leg.dur;
        const t = clamp01(leg.t);
        const e = easeOutCubic(t);
        leg.fx = lerp(leg.ax, leg.bx, e);
        leg.fy = lerp(leg.ay, leg.by, e);
        leg.fz = Math.sin(Math.PI * t) * leg.lift;
        if (t >= 1) {
          leg.stepping = false;
          leg.fz = 0;
          leg.planted = true;
          this._footPlant(leg, game, speed);
        }
      } else {
        const d = dist(leg.fx, leg.fy, anchorX, anchorY);
        const opposite = this.legs[(leg.side < 0 ? this.legPairs : 0) + leg.i];
        const canStep = stepping < 4 && !(opposite && opposite.stepping);
        if (d > stepThresh && canStep) {
          leg.stepping = true;
          stepping++;
          leg.t = 0;
          leg.dur = clamp(0.2 - speed * 0.0016, 0.075, 0.24);
          leg.ax = leg.fx; leg.ay = leg.fy;
          // overshoot slightly past the anchor so the gait has some snap
          leg.bx = anchorX + (anchorX - leg.fx) * 0.32;
          leg.by = anchorY + (anchorY - leg.fy) * 0.32;
          leg.lift = this.size * (0.55 + Math.min(1, speed * 0.006));
          leg.planted = false;
        }
      }
      leg.ground = world.elevAt(leg.fx, leg.fy);
      leg.maxReach = legLen * 2;
    }
  }

  _footPlant(leg, game, speed) {
    if (this.buried > 0.4) return;
    const region = game.world.regionAt(leg.fx, leg.fy).region;
    if (speed > 12) {
      game.particles.spawn('sand', leg.fx, leg.fy, {
        color: region.pal.hi, life: 0.4, size: 1, vz: 6, grav: 30,
        vx: -this.vx * 0.06, vy: -this.vy * 0.06, wind: 0.2,
      });
    }
    const wet = game.eco.moistureAt(leg.fx, leg.fy);
    game.particles.decal('footprint', leg.fx, leg.fy, {
      size: this.size * 0.5,
      life: wet > 0.2 ? 40 : 16,
      color: wet > 0.2 ? rgba(region.pal.wet, 0.5) : rgba(region.pal.shadow, 0.32),
    });
    this.stepSound -= 1;
    if (this.stepSound <= 0 && speed > 8) {
      this.stepSound = 2;
      game.audio.play('step');
    }
  }

  _updateBody(dt, game, speed) {
    // body rides the average foot height, with a spring so it bobs
    let sum = 0, n = 0, fl = 0, fr = 0, ff = 0, fb = 0;
    const half = Math.max(1, this.legPairs);
    for (const leg of this.legs) {
      sum += leg.ground; n++;
      if (leg.side < 0) fl += leg.ground; else fr += leg.ground;
      if (leg.i < half / 2) ff += leg.ground; else fb += leg.ground;
    }
    const avg = n ? sum / n : 0;
    const targetZ = avg + this.size * 0.55 + (this.dashT > 0 ? this.size * 0.4 : 0);
    const k = 190, damping = 19;
    this.bodyZv += (targetZ - this.bodyZ) * k * dt - this.bodyZv * damping * dt;
    this.bodyZ += this.bodyZv * dt;

    // roll/pitch from the terrain under the feet
    this.tiltX = damp(this.tiltX, (fr / half - fl / half) * 0.035, 0.05, dt);
    this.tiltY = damp(this.tiltY, (fb / half - ff / half) * 0.03, 0.05, dt);
  }

  _updateClaws(dt, game) {
    const s = this.stats;
    const reach = this.size * 2.4 * s.clawSize;
    for (let i = 0; i < this.claws.length; i++) {
      const c = this.claws[i];
      c.swing = Math.max(0, c.swing - dt * 3.4 * s.attackSpeed);
      const base = this.bodyAngle + c.side * 0.62;
      let tx, ty;
      if (c.swing > 0) {
        const sw = Math.sin(c.swing * Math.PI);
        const a = this.bodyAngle + c.side * lerp(1.25, 0.05, 1 - c.swing);
        tx = this.x + Math.cos(a) * reach * (1 + sw * 0.55);
        ty = this.y + Math.sin(a) * reach * (1 + sw * 0.55);
        c.open = lerp(c.open, c.swing > 0.55 ? 1 : 0.05, 1 - Math.pow(0.001, dt));
      } else {
        const idle = wobble(game.time * 1.1 + i * 2.2) * 0.14;
        const a = base + idle;
        const bob = 1 + Math.sin(game.time * 1.6 + i) * 0.06;
        tx = this.x + Math.cos(a) * reach * 0.86 * bob;
        ty = this.y + Math.sin(a) * reach * 0.86 * bob;
        c.open = damp(c.open, 0.22 + Math.sin(game.time * 0.9 + i * 3) * 0.14, 0.2, dt);
      }
      if (this.emote === 'wave' && i === 1) {
        const a = this.bodyAngle - 0.9;
        tx = this.x + Math.cos(a) * reach * 1.1;
        ty = this.y + Math.sin(a) * reach * 1.1 - 6 - Math.sin(game.time * 12) * 3;
        c.open = 0.6 + Math.sin(game.time * 12) * 0.35;
      }
      c.vx += (tx - c.x) * 700 * dt - c.vx * 26 * dt;
      c.vy += (ty - c.y) * 700 * dt - c.vy * 26 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
    }
  }

  _updateEyes(dt, game, speed) {
    const look = this.lookAt || (this.moveTarget) || null;
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i];
      const a = this.bodyAngle + e.side * 0.4;
      const stalk = this.size * (1.15 + this.stats.eyeStalk * 0.5);
      let tx = this.x + Math.cos(a) * stalk;
      let ty = this.y + Math.sin(a) * stalk;
      // stalks trail behind acceleration - the wobble is the whole charm
      tx -= this.vx * 0.035;
      ty -= this.vy * 0.035;
      e.vx += (tx - e.x) * 460 * dt - e.vx * 17 * dt;
      e.vy += (ty - e.y) * 460 * dt - e.vy * 17 * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (look) {
        const la = Math.atan2(look.y - e.y, look.x - e.x);
        e.pupilX = Math.cos(la) * 0.9;
        e.pupilY = Math.sin(la) * 0.9;
      } else {
        e.pupilX = damp(e.pupilX || 0, Math.cos(this.bodyAngle) * 0.7, 0.1, dt);
        e.pupilY = damp(e.pupilY || 0, Math.sin(this.bodyAngle) * 0.7, 0.1, dt);
      }
    }
  }

  // -- rendering ------------------------------------------------------------

  drawShadow(ctx, cam, weather) {
    if (this.buried > 0.9) return;
    const sh = weather.shadow;
    const z = cam.zoom;
    const s = cam.worldToScreen(this.x, this.y);
    const lift = (this.bodyZ - this.size * 0.55) * 0.35;
    groundShadow(ctx, s.x + sh.x * z * 0.6, s.y + sh.y * z * 0.6 + lift * z * 0.1,
      this.size * 1.5 * z, this.size * 0.8 * z, sh.strength * 0.55);
    // little shadow under each planted foot
    for (const leg of this.legs) {
      if (leg.fz > 0.4) continue;
      const fs = cam.worldToScreen(leg.fx, leg.fy);
      groundShadow(ctx, fs.x + sh.x * z * 0.3, fs.y + sh.y * z * 0.3, 1.4 * z, 0.9 * z, sh.strength * 0.35);
    }
  }

  draw(ctx, cam, game) {
    const z = cam.zoom;
    const s = this.stats;
    if (this.buried > 0.95) return;

    const bs = cam.worldToScreen(this.x, this.y);
    const bodyLift = this.bodyZ * 0.55 * z;
    const bx = bs.x;
    const by = bs.y - bodyLift;
    const R = this.size * z;
    const buried = this.buried;

    const pal = this.pal;
    const flash = this.hurtFlash > 0 && (Math.floor(game.time * 22) % 2 === 0);
    const shellCol = flash ? '#ffd8d8' : pal.shell;
    const shellHi = flash ? '#ffffff' : pal.shellHi;
    const shellLo = flash ? '#ffc8c8' : pal.shellLo;
    const legCol = flash ? '#ffc0c0' : pal.leg;

    // Carapace is wider than it is long, and everything hangs off its rim.
    const rot = this.bodyAngle + this.tiltX * 0.6;
    const RX = R * (1.02 - Math.abs(this.tiltY) * 0.5);
    const RY = R * 1.32;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    /** Point on (or inside) the shell rim; local angle 0 = straight ahead. */
    const rim = (a, k = 1) => {
      const lx = Math.cos(a) * RX * k, ly = Math.sin(a) * RY * k;
      return { x: bx + lx * cos - ly * sin, y: by + (lx * sin + ly * cos) * 0.86 };
    };

    ctx.save();
    if (buried > 0.01) {
      ctx.beginPath();
      ctx.rect(0, 0, cam.vw, by + R * (1 - buried * 1.8));
      ctx.clip();
    }

    // --- legs, behind the shell -------------------------------------------
    const legLen = this.size * s.legLength * z;
    const legW = Math.max(1, Math.round(z * (0.7 + s.legThickness * 0.35)));
    for (const leg of this.legs) {
      const fs = cam.worldToScreen(leg.fx, leg.fy);
      const fy = fs.y - (leg.ground * 0.55 + leg.fz) * z;
      const hip = rim(leg.restAngle, 0.86);
      const flip = leg.side < 0 ? -1 : 1;
      const front = leg.i < this.legPairs / 2 ? 1 : -1;
      const j = ik2(hip.x, hip.y, fs.x, fy, legLen * 0.56, legLen * 0.6, flip * front);
      limb(ctx, hip.x, hip.y, j.x, j.y, j.tx, j.ty, legW + 1, legW, legCol, pal.rim);
      px(ctx, j.tx - legW * 0.5, j.ty - legW * 0.5, pal.rim, legW, legW);
    }

    // --- carapace ----------------------------------------------------------
    ctx.save();
    ctx.translate(Math.round(bx), Math.round(by));
    ctx.rotate(rot);
    ctx.scale(1, 0.86);
    // outline
    pxEllipse(ctx, 0, 0, RX + 1, RY + 1, pal.rim);
    ditherBlob(ctx, 0, 0, RX, RY, shellCol, shellHi, -0.35, -0.55);
    // plating: three arcs running across the back
    ctx.fillStyle = shellLo;
    for (let i = -1; i <= 1; i++) {
      const xx = i * RX * 0.42;
      const half = Math.sqrt(Math.max(0, 1 - (xx / RX) ** 2)) * RY * 0.82;
      ctx.fillRect(Math.round(xx), Math.round(-half), 1, Math.round(half * 2));
    }
    // front rim highlight and the little mouthparts
    ctx.fillStyle = shellHi;
    ctx.fillRect(Math.round(RX * 0.45), Math.round(-RY * 0.55), 1, Math.round(RY * 1.1));
    ctx.fillStyle = pal.rim;
    ctx.fillRect(Math.round(RX * 0.72), Math.round(-RY * 0.16), Math.max(1, Math.round(z * 1.2)), Math.max(1, Math.round(RY * 0.32)));
    if (s.spikes > 0) {
      ctx.fillStyle = shellHi;
      for (let i = 0; i < s.spikes; i++) {
        const a2 = (i / s.spikes) * TAU;
        ctx.fillRect(Math.round(Math.cos(a2) * RX * 0.95), Math.round(Math.sin(a2) * RY * 0.95),
          Math.max(1, Math.round(z)), Math.max(1, Math.round(z)));
      }
    }
    ctx.restore();

    // --- water organ, sitting on the back ---------------------------------
    const organAt = rim(Math.PI, 0.52);
    this._drawOrgan(ctx, cam, game, organAt.x, organAt.y - R * 0.14, R, rot, z);

    // --- claws, in front ---------------------------------------------------
    const armW = Math.max(1, Math.round(z * (0.8 + s.clawSize * 0.25)));
    for (const c of this.claws) {
      const sh = rim(c.side * 0.5, 0.9);
      const cs = cam.worldToScreen(c.x, c.y);
      const cy = cs.y - bodyLift * 0.7;
      const armLen = this.size * 1.25 * s.clawSize * z;
      const j = ik2(sh.x, sh.y, cs.x, cy, armLen * 0.6, armLen * 0.62, c.side);
      limb(ctx, sh.x, sh.y, j.x, j.y, j.tx, j.ty, armW + 1, armW, legCol, pal.rim);
      // pincer: a palm plus two tapering fingers
      const pa = Math.atan2(j.ty - j.y, j.tx - j.x);
      const pr = this.size * 0.6 * s.clawSize * z;
      const open = 0.12 + c.open * 0.6;
      const palmX = j.tx + Math.cos(pa) * pr * 0.35;
      const palmY = j.ty + Math.sin(pa) * pr * 0.35;
      pxEllipseRot(ctx, palmX, palmY, pr * 0.72 + 1, pr * 0.5 + 1, pa, pal.rim);
      pxEllipseRot(ctx, palmX, palmY, pr * 0.72, pr * 0.5, pa, shellCol);
      pxEllipseRot(ctx, palmX - Math.cos(pa) * pr * 0.2, palmY - Math.sin(pa) * pr * 0.2, pr * 0.38, pr * 0.26, pa, shellHi);
      for (const sgn of [-1, 1]) {
        const ang = pa + sgn * open;
        const tipX = palmX + Math.cos(ang) * pr * 1.05;
        const tipY = palmY + Math.sin(ang) * pr * 1.05;
        pxLine(ctx, palmX, palmY, tipX, tipY, pal.rim, armW + 1);
        pxLine(ctx, palmX, palmY, tipX, tipY, sgn < 0 ? shellHi : shellCol, armW);
      }
    }

    // --- eye stalks --------------------------------------------------------
    const er = Math.max(1.2, R * 0.24);
    for (const e of this.eyes) {
      const es = cam.worldToScreen(e.x, e.y);
      const ey = es.y - bodyLift - R * 0.5;
      const base = rim(e.side * 0.34, 0.45);
      pxLine(ctx, base.x, base.y, es.x, ey, pal.rim, Math.max(2, Math.round(z * 0.9)));
      pxLine(ctx, base.x, base.y, es.x, ey, legCol, Math.max(1, Math.round(z * 0.5)));
      pxEllipse(ctx, es.x, ey, er + 1, er + 1, pal.rim);
      pxEllipse(ctx, es.x, ey, er, er, '#f5efe2');
      pxEllipse(ctx, es.x + (e.pupilX || 0) * er * 0.45, ey + (e.pupilY || 0) * er * 0.45, er * 0.55, er * 0.55, pal.eye);
      px(ctx, es.x - er * 0.4, ey - er * 0.5, pal.eyeHi, 1, 1);
    }

    ctx.restore();

    if (this.pouring && this.pourPoint) this._drawPour(ctx, cam, game, bx, by, R);
    this._drawEmote(ctx, game, bx, by, R, z);
  }

  _drawEmote(ctx, game, bx, by, R, z) {
    if (!this.emote || this.emote === 'wave') return;
    const t = clamp01(this.emoteT / 0.3);
    const ey = by - R * 2.6 - (1 - t) * 3;
    const rr = Math.max(4, R * 0.55);
    pxEllipse(ctx, bx, ey, rr + 1, rr * 0.85 + 1, '#2a1c14');
    pxEllipse(ctx, bx, ey, rr, rr * 0.85, '#fdf6e4');
    px(ctx, bx - 1, ey + rr * 0.85, '#fdf6e4', 2, 3);
    const g = this.emote;
    ctx.fillStyle = '#3a2418';
    if (g === '!') {
      ctx.fillRect(Math.round(bx), Math.round(ey - rr * 0.5), 1, Math.round(rr * 0.7));
      ctx.fillRect(Math.round(bx), Math.round(ey + rr * 0.4), 1, 1);
    } else if (g === '?') {
      ctx.fillRect(Math.round(bx - 1), Math.round(ey - rr * 0.5), 3, 1);
      ctx.fillRect(Math.round(bx + 1), Math.round(ey - rr * 0.3), 1, 2);
      ctx.fillRect(Math.round(bx), Math.round(ey), 1, 1);
      ctx.fillRect(Math.round(bx), Math.round(ey + rr * 0.4), 1, 1);
    } else if (g === 'heart') {
      ctx.fillStyle = '#e2566a';
      ctx.fillRect(Math.round(bx - 2), Math.round(ey - 1), 2, 2);
      ctx.fillRect(Math.round(bx + 1), Math.round(ey - 1), 2, 2);
      ctx.fillRect(Math.round(bx - 1), Math.round(ey + 1), 3, 2);
    }
  }

  _drawOrgan(ctx, cam, game, ox, oy, R, rot, z) {
    const s = this.stats;
    const pal = this.pal;
    const fill = this.waterMax > 0 ? clamp01(this.water / this.waterMax) : 0;
    const baseR = R * (0.34 + s.organSize * 0.16);
    const squash = 1 + this.organSquash * 0.24;
    const orx = baseR * (0.95 + fill * 0.26) * squash;
    const ory = baseR * (0.82 + fill * 0.24) / squash;

    pxEllipse(ctx, ox, oy, orx + 1, ory + 1, pal.rim);
    pxEllipse(ctx, ox, oy, orx, ory, mixHex(pal.organLo, pal.organ, 0.3));
    // sloshing fluid line
    const slosh = Math.sin(this.sloshT * 2.1) * ory * 0.16;
    const lvl = oy + ory - fill * ory * 2;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(Math.round(ox) + 0.5, Math.round(oy) + 0.5, orx, ory, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = pal.organ;
    ctx.fillRect(Math.round(ox - orx - 1), Math.round(lvl + slosh), Math.round(orx * 2 + 2), Math.round(ory * 2 + 2));
    ctx.fillStyle = pal.organHi;
    ctx.fillRect(Math.round(ox - orx - 1), Math.round(lvl + slosh), Math.round(orx * 2 + 2), 1);
    ctx.restore();
    px(ctx, ox - orx * 0.45, oy - ory * 0.5, pal.organHi, Math.max(1, Math.round(z * 0.7)), Math.max(1, Math.round(z * 0.5)));

    if (this.pumping && Math.random() < 0.5) {
      const a = rot + Math.PI;
      game.particles.spawn('spark', this.x + Math.cos(a) * this.size * 0.5, this.y + Math.sin(a) * this.size * 0.5, {
        color: pal.organHi, life: 0.5, size: 1, vz: 12,
        vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, grav: 12, glow: 6, layer: 'over',
      });
    }
  }

  _drawPour(ctx, cam, game, bx, by, R) {
    const p = this.pourPoint;
    const ps = cam.worldToScreen(p.x, p.y);
    const z = cam.zoom;
    const sx = bx, sy = by - R * 1.1;
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const arc = Math.sin(Math.PI * t) * R * 2.2;
      const x = lerp(sx, ps.x, t) + Math.sin(game.time * 22 + i) * 0.8;
      const y = lerp(sy, ps.y, t) - arc;
      px(ctx, x, y, i > steps - 3 ? '#d8f6ff' : this.pal.organ, Math.max(1, Math.round(z * 0.7)), Math.max(1, Math.round(z * 0.7)));
    }
    if (Math.random() < 0.7) {
      game.particles.spawn('drop', p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 4, {
        color: '#9fe4f4', life: 0.4, size: 1, vz: 8, grav: 60, layer: 'over', glow: 3,
      });
    }
  }

  drawLights(renderer, cam, game) {
    const s = cam.worldToScreen(this.x, this.y);
    const fill = clamp01(this.water / Math.max(1, this.waterMax));
    const pulse = 0.75 + Math.sin(this.organPulse) * 0.25;
    const r = (5 + fill * 12 + this.pumpAmount * 12) * cam.zoom;
    renderer.addLight(s.x, s.y - this.size * cam.zoom, r, '#6fd8ee', (0.22 + fill * 0.3 + this.pumpAmount * 0.4) * pulse);
    if (this.stats.lantern > 0) {
      renderer.addLight(s.x, s.y, 60 * cam.zoom * this.stats.lantern, '#ffd9a0', 0.35 * this.stats.lantern);
    }
  }

  serialize() {
    return {
      x: this.x, y: this.y, hp: this.hp, water: this.water, stage: this.stage,
      vigor: this.vigor, facing: this.facing, distanceWalked: this.distanceWalked,
    };
  }
  deserialize(d) {
    if (!d) return;
    Object.assign(this, {
      x: d.x ?? 0, y: d.y ?? 0, hp: d.hp ?? this.hpMax, water: d.water ?? 0,
      stage: d.stage ?? 1, vigor: d.vigor ?? 1, facing: d.facing ?? -Math.PI / 2,
      distanceWalked: d.distanceWalked ?? 0,
    });
    this._resetFeet();
  }
}

const DEFAULT_STATS = {
  size: 4.2, speed: 46, hpMax: 40, armor: 0, clawDmg: 6, clawSize: 1, attackSpeed: 1,
  waterRate: 0.34, waterMax: 22, pumpMult: 6, passiveMult: 0.35, pourRate: 1.9, pourRadius: 26,
  pourReach: 34, vigorEff: 1, thirst: 0.12, legLength: 1.5, legThickness: 1, stanceWidth: 1,
  eyeStalk: 1, organSize: 1, spikes: 0, canDash: false, lantern: 0,
};
export { DEFAULT_STATS };
