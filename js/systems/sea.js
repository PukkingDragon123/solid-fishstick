// CRABDEN - the water that used to be here.
//
// This is not a separate screen. It is the world you already have - the same
// terrain, the same camera, the same crab - with a sea put on top of it. The
// seabed in the prologue is the desert floor you will spend the rest of the
// game walking across, one thousand years earlier and thirty metres down.
//
// It does three jobs:
//
//   life     corals, urchins, crablets and shoals of fish, placed on the
//            terrain the same deterministic way the dig sites are
//   water    the column itself - depth tint, god rays, caustics crawling over
//            the ground, the surface seen from underneath, silt and bubbles
//   drain    the thousand years: the surface walks down, the reef dies back,
//            the blue comes out of the light, and the desert is left

import { clamp, clamp01, lerp, damp, smoothstep, TAU, mulberry32, hashStr } from '../lib/math.js';
import { pxRing } from '../render/pix.js';
import { drawText, textWidth } from '../lib/font.js';
import { reefArt, jellyArt, whaleArt, sharkArt, REEF_KINDS, FLOOR_KINDS } from '../art/seaart.js';
import { fishFrame, FISH_FRAMES } from '../art/fishart.js';
import { seaSpecies } from './fishing.js';
import { wallTile, drawKelp, drawGrass, schoolFish, SCHOOL_KINDS, mantaArt, MANTA_FRAMES, turtleArt, TURTLE_FRAMES, foreCoral } from '../art/seascape.js';

const CELL = 90;               // one cell of reef, in world units
const DEPTH = 150;             // how far the surface is above the seabed
const DRAIN_SECS = 9.0;        // how long the sea takes to leave

export class Sea {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.drain = 0;            // 0 full sea, 1 gone
    this.draining = false;
    this.fish = [];
    this.jellies = [];
    this.bubbles = [];
    this.whales = [];          // the biggest animals that have ever lived
    this.sharks = [];          // and the ones that were already old when they arrived
    this.snow = [];            // marine snow: the sea is full of falling bits
    this.schools = [];         // bait balls
    this.mantas = [];
    this.turtles = [];
    this.cells = new Map();
    this.yearShow = 0;
    // When the sea is the one that never left, its surface does not track the
    // ground - it is a level, the way a real body of water is.
    this.flat = null;
  }

  get active() { return this.on; }
  /** How much of the underwater treatment is still applied. */
  get wet() { return this.on ? 1 - smoothstep(clamp01(this.drain * 1.15)) : 0; }

  start() {
    this.on = true;
    this.t = 0;
    this.drain = 0;
    this.draining = false;
    this.fish.length = 0;
    this.jellies.length = 0;
    this.bubbles.length = 0;
    this.whales.length = 0;
    this.sharks.length = 0;
    this.snow.length = 0;
    this.schools = [];
    this.mantas = [];
    this.turtles = [];
    const cx = this.game.crab.x;
    for (let i = 0; i < 40; i++) this._spawnFish(cx + (Math.random() - 0.5) * 900);
    // two of them, a long way up, crossing in opposite directions - a mother
    // and a calf, because that is what you see and because one of them being
    // smaller is the only way the size of the other one lands
    const top = this.level(cx);
    const bed = this.game.terrain.surfaceY(cx);
    const deep = (k) => top + (bed - top) * k;
    this.whales.push({ x: cx - 1500, y: deep(0.26), dir: 1, sp: 26, s: 1.0, ph: 0, blow: 0 });
    this.whales.push({ x: cx - 1660, y: deep(0.34), dir: 1, sp: 26, s: 0.52, ph: 1.2, blow: 0 });
    // Sharks work the middle of the water column rather than the top of it,
    // and they turn - a shark's day is one long circuit of the same drop-off,
    // which is why they keep coming back past you instead of crossing once.
    for (let i = 0; i < 3; i++) {
      this.sharks.push({
        x: cx + (i - 1) * 420 + (Math.random() - 0.5) * 200,
        y: deep(0.48 + i * 0.09),
        dir: i % 2 ? -1 : 1, sp: 46 + i * 7, s: 0.72 + i * 0.14,
        ph: Math.random() * 6, turn: 4 + Math.random() * 5, bank: 0,
      });
    }
    // and the water is full of things falling through it
    for (let i = 0; i < 120; i++) {
      this.snow.push({
        x: cx + (Math.random() - 0.5) * 1200, y: -Math.random() * 420,
        v: 3 + Math.random() * 9, ph: Math.random() * TAU,
        r: Math.random() < 0.18 ? 2 : 1,
      });
    }
    // bait balls: a few hundred fish that turn as one, which is the thing that
    // makes water look alive from across a room
    for (let i = 0; i < 4; i++) this._spawnSchool(cx + (i - 1.5) * 260 + (Math.random() - 0.5) * 120, i);
    // a manta going over, slow, high in the column
    this.mantas.push({ x: cx + 380, y: deep(0.22), dir: -1, sp: 14, ph: 0, s: 1 });
    // and a turtle or two, lower down, in no hurry at all
    for (let i = 0; i < 2; i++) {
      this.turtles.push({ x: cx - 260 + i * 620, y: deep(0.5 + i * 0.18), dir: i ? -1 : 1, sp: 9 + i * 3, ph: Math.random(), bob: Math.random() * TAU });
    }
    for (let i = 0; i < 4; i++) {
      this.jellies.push({
        x: cx + (Math.random() - 0.5) * 800, y: -60 - Math.random() * 90,
        ph: Math.random() * TAU, sp: 0.5 + Math.random() * 0.5, s: 0.7 + Math.random() * 0.7,
      });
    }
  }

  stop() { this.on = false; this.flat = null; }
  beginDrain() { this.draining = true; }

  /** Where the surface is, in world Y. It walks down as the sea goes. */
  level(x = this.game.crab.x) {
    if (this.flat !== null) return this.flat;
    // A sea surface is level, whatever the bottom is doing: so it sits a
    // depth above the bed averaged over a long way, not above the bed here.
    const T = this.game.terrain;
    const q = Math.round(x / 40) * 40;
    let g = 0;
    for (let k = -3; k <= 3; k++) g += T.surfaceY(q + k * 220);
    g /= 7;
    return g - DEPTH * (1 - this.drain) + this.drain * 40;
  }

  /**
   * Everything the sea draws over the whole frame - the tint, the column, the
   * silt - has to stop at the waterline once the sea is a body of water with
   * a top to it rather than something you are thirty metres under. In the
   * prologue the surface is above the frame and this is a no-op.
   *
   * Returns true when it pushed a clip, so the caller knows to restore.
   */
  _clipWater(ctx, cam, vw, vh) {
    if (this.flat === null) return false;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, vh);
    for (let x = 0; x <= vw; x += 6) {
      const w = cam.screenToWorld(x, 0).x;
      ctx.lineTo(x, cam.worldToScreen(w, this.level(w)).y);
    }
    ctx.lineTo(vw, vh);
    ctx.closePath();
    ctx.clip();
    return true;
  }

  /**
   * The standing ocean out west. Same water, same animals, no drain - the
   * surface is a level rather than a depth below the ground, and everything
   * that already knew how to draw a sea carries on as it was.
   */
  startStanding(level) {
    this.flat = level;
    this.start();
    this.flat = level;
    this.draining = false;
    this.drain = 0;
  }

  /** Where the water is at x, as [top, bottom] in world Y. */
  _band(x) {
    const g = this.game.terrain.surfaceY(x);
    const top = this.flat !== null ? this.level(x) : g - DEPTH;
    return [top, g];
  }

  _spawnSchool(x, i = 0) {
    const [top, bed] = this._band(x);
    if (bed - top < 40) return;
    const kind = SCHOOL_KINDS[i % SCHOOL_KINDS.length];
    const n = kind === 'glass' ? 34 : kind === 'fusilier' ? 22 : 30;
    const cy = top + (bed - top) * (0.3 + Math.random() * 0.4);
    const sc = { kind, x, y: cy, vx: (Math.random() < 0.5 ? -1 : 1) * 16, vy: 0, tx: x, ty: cy, retarget: 0,
      sp: kind === 'fusilier' ? 26 : 20, swirl: Math.random() < 0.5 ? 0.6 : -0.6, m: [] };
    for (let k = 0; k < n; k++) {
      sc.m.push({ x: x + (Math.random() - 0.5) * 40, y: cy + (Math.random() - 0.5) * 20,
        vx: sc.vx, vy: 0, ph: Math.random() * 4, dir: sc.vx < 0 ? -1 : 1, flash: 0 });
    }
    this.schools.push(sc);
  }

  /**
   * A bait ball is three rules and nothing else: stay with the others, swim
   * the way they swim, do not touch. Add a slow swirl round the middle and
   * a scatter when something big comes through, and it turns as one.
   */
  _updateSchools(dt, b) {
    const crab = this.game.crab;
    for (const sc of this.schools) {
      const [top, bed] = this._band(sc.x);
      sc.retarget -= dt;
      if (sc.retarget <= 0 || Math.hypot(sc.tx - sc.x, sc.ty - sc.y) < 20) {
        sc.retarget = 4 + Math.random() * 6;
        sc.tx = clamp(sc.x + (Math.random() - 0.5) * 360, b.x0 - 100, b.x1 + 100);
        const [t2, g2] = this._band(sc.tx);
        sc.ty = t2 + (g2 - t2) * (0.18 + Math.random() * 0.6);
      }
      const dx = sc.tx - sc.x, dy = sc.ty - sc.y, d = Math.hypot(dx, dy) || 1;
      sc.vx = damp(sc.vx, (dx / d) * sc.sp, 0.3, dt);
      sc.vy = damp(sc.vy, (dy / d) * sc.sp * 0.5, 0.3, dt);
      sc.x += sc.vx * dt; sc.y = clamp(sc.y + sc.vy * dt, top + 14, bed - 12);
      const ms = sc.m;
      for (let i = 0; i < ms.length; i++) {
        const f = ms[i];
        const ox = f.x - sc.x, oy = f.y - sc.y;
        let ax = -ox * 0.9 + (sc.vx - f.vx) * 1.6 - oy * sc.swirl;
        let ay = -oy * 1.4 + (sc.vy - f.vy) * 1.6 + ox * sc.swirl * 0.5;
        for (let j = 0; j < ms.length; j++) {
          if (j === i) continue;
          const q = ms[j];
          const ex = f.x - q.x, ey = f.y - q.y;
          const e2 = ex * ex + ey * ey;
          if (e2 < 25 && e2 > 0.01) { ax += ex / e2 * 60; ay += ey / e2 * 60; }
        }
        // the crab coming through makes a hole in it
        const cx = f.x - crab.x, cy = f.y - (crab.y - 10);
        const c2 = cx * cx + cy * cy;
        if (c2 < 2500) { const k = 1600 / Math.max(60, c2); ax += cx * k * 0.05; ay += cy * k * 0.05; f.flash = 0.3; }
        f.vx += ax * dt; f.vy += ay * dt;
        const v = Math.hypot(f.vx, f.vy), vmax = sc.sp * 2.2;
        if (v > vmax) { f.vx *= vmax / v; f.vy *= vmax / v; }
        f.x += f.vx * dt; f.y = clamp(f.y + f.vy * dt, top + 6, bed - 4);
        f.ph += dt * (6 + v * 0.2);
        const want = f.vx < -2 ? -1 : f.vx > 2 ? 1 : f.dir;
        if (want !== f.dir) { f.dir = want; f.flash = 0.18; }
        f.flash = Math.max(0, f.flash - dt);
      }
      // a school that has wandered right off goes round the other way
      if (sc.x < b.x0 - 500 || sc.x > b.x1 + 500) {
        const nx = sc.x < b.x0 ? b.x1 + 200 : b.x0 - 200;
        const shift = nx - sc.x;
        sc.x = nx; sc.tx = nx;
        for (const f of ms) f.x += shift;
      }
    }
    for (const m of this.mantas) {
      m.x += m.dir * m.sp * dt;
      m.ph += dt * 0.55;
      const [t2, g2] = this._band(m.x);
      m.y = clamp(m.y + Math.sin(m.ph * 0.7) * 4 * dt, t2 + 24, g2 - 40);
      if (m.x < b.x0 - 900 || m.x > b.x1 + 900) { m.dir *= -1; m.x = clamp(m.x, b.x0 - 880, b.x1 + 880); }
    }
    for (const tu of this.turtles) {
      tu.x += tu.dir * tu.sp * dt;
      tu.ph += dt * 0.32;
      tu.bob += dt * 0.6;
      const [t2, g2] = this._band(tu.x);
      tu.y = clamp(tu.y + Math.sin(tu.bob) * 3 * dt, t2 + 20, g2 - 20);
      if (tu.x < b.x0 - 600 || tu.x > b.x1 + 600) { tu.dir *= -1; tu.x = clamp(tu.x, b.x0 - 580, b.x1 + 580); }
    }
  }

  _spawnFish(x) {
    const g = this.game.terrain.surfaceY(x);
    // what lives here depends on how far down here is: shoals near the top,
    // the big slow things on the bottom of the deep water
    const kind = seaSpecies(this.flat !== null ? g - this.level(x) : 80);
    // in a standing sea a fish lives between the bed and the surface, and
    // the surface is a level rather than a fixed distance up
    const top = this.flat !== null ? this.level(x) + 8 : g - DEPTH + 20;
    if (this.flat !== null && g <= top + 6) return;
    this.fish.push({
      kind, x, y: this.flat !== null
        ? top + Math.random() * Math.max(10, g - 10 - top)
        : g - 20 - Math.random() * (DEPTH - 40),
      dir: Math.random() < 0.5 ? -1 : 1,
      sp: 16 + Math.random() * 30, s: 0.55 + Math.random() * 0.6,
      ph: Math.random() * TAU, bob: 3 + Math.random() * 7, turn: 2 + Math.random() * 6,
      school: Math.random() < 0.6,
    });
  }

  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.draining) {
      this.drain = Math.min(1, this.drain + dt / DRAIN_SECS);
      this.yearShow = 1;
      if (this.drain >= 1) { this.draining = false; this.on = false; }
    }

    const cam = this.game.cam;
    const b = cam.bounds(260);
    const wet = this.wet;

    // the whales: they do not react to you and they do not turn round. They
    // cross, and while they are crossing nothing else in the frame matters.
    for (const wh of this.whales) {
      wh.x += wh.dir * wh.sp * dt;
      wh.ph += dt * 0.42;
      wh.y += Math.sin(wh.ph * 0.6) * 3 * dt;
      wh.blow = Math.max(0, wh.blow - dt);
      // once they are well past, put them back a long way behind
      if (wh.x > b.x1 + 2600) {
        wh.x = b.x0 - 2600;
        const top2 = this.level(wh.x);
        const bed2 = this.game.terrain.surfaceY(wh.x);
        wh.y = top2 + (bed2 - top2) * (0.2 + Math.random() * 0.22);
      }
      // and they never leave the water, whatever the camera is doing
      const t2 = this.level(wh.x), g2 = this.game.terrain.surfaceY(wh.x);
      wh.y = clamp(wh.y, t2 + 26, g2 - 60);
    }
    // The sharks. They do not hunt you - you are armoured, boring and on the
    // bottom - they patrol, and the patrol is a circuit: they run, they lean
    // into a turn at the edge of the shot, and they come back.
    for (const sh of this.sharks) {
      sh.x += sh.dir * sh.sp * dt;
      sh.ph += dt * 1.6;
      sh.turn -= dt;
      sh.bank = damp(sh.bank, 0, 0.02, dt);
      if (sh.turn <= 0 || sh.x < b.x0 - 700 || sh.x > b.x1 + 700) {
        sh.dir *= -1;
        sh.turn = 7 + Math.random() * 7;
        sh.bank = 0.5 * sh.dir;
        // a turn is also a change of depth, which is what stops them looking
        // like three things on three rails
        const t2 = this.level(sh.x), g2 = this.game.terrain.surfaceY(sh.x);
        sh.y = t2 + (g2 - t2) * (0.34 + Math.random() * 0.42);
      }
      sh.y += Math.sin(sh.ph * 0.33) * 5 * dt;
      const t3 = this.level(sh.x), g3 = this.game.terrain.surfaceY(sh.x);
      sh.y = clamp(sh.y, t3 + 30, g3 - 14);
    }
    // marine snow, falling for ever
    for (const sn of this.snow) {
      sn.y += sn.v * dt;
      sn.ph += dt * 0.7;
      const ground = this.game.terrain.surfaceY(sn.x);
      if (sn.y > ground - 2) { sn.y = this.level(sn.x) - 20 - Math.random() * 200; sn.x = b.x0 + Math.random() * (b.x1 - b.x0); }
    }

    this._updateSchools(dt, b);
    if (wet < 0.3) { this.schools.length = 0; this.mantas.length = 0; this.turtles.length = 0; }

    // fish: they cruise, they turn at the edge of where you can see, and as
    // the water goes they go with it
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      f.x += f.dir * f.sp * dt * (0.6 + wet * 0.4);
      f.ph += dt * (2 + f.sp * 0.06);
      const ground = this.game.terrain.surfaceY(f.x);
      const top = this.level(f.x);
      // stay in the water column, and drop with the ceiling as it falls
      f.y = clamp(f.y + Math.sin(f.ph * 0.4) * f.bob * dt, top + 10, ground - 8);
      f.turn -= dt;
      if (f.turn <= 0) { f.turn = 3 + Math.random() * 7; if (Math.random() < 0.4) f.dir *= -1; }
      if (f.x < b.x0 - 120 || f.x > b.x1 + 120) { f.dir *= -1; f.x = clamp(f.x, b.x0 - 110, b.x1 + 110); }
      if (wet < 0.25 && Math.random() < dt * 2) this.fish.splice(i, 1);
    }
    while (this.fish.length < 40 && wet > 0.3) this._spawnFish(Math.random() < 0.5 ? b.x0 - 80 : b.x1 + 80);

    for (const j of this.jellies) {
      j.ph += dt * j.sp;
      j.y -= (6 + Math.sin(j.ph) * 8) * dt;
      j.x += Math.sin(j.ph * 0.3) * 5 * dt;
      const top = this.level(j.x);
      if (j.y < top + 16) j.y = this.game.terrain.surfaceY(j.x) - 30;
    }

    // bubbles come up out of the sand, and off you
    if (wet > 0.2 && Math.random() < dt * 8) {
      const x = lerp(b.x0, b.x1, Math.random());
      this.bubbles.push({
        x, y: this.game.terrain.surfaceY(x) - 2, r: 0.4 + Math.random() * 0.9,
        sp: 12 + Math.random() * 22, ph: Math.random() * TAU, t: 0,
      });
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const u = this.bubbles[i];
      u.t += dt;
      u.y -= u.sp * dt;
      u.x += Math.sin(u.t * 3 + u.ph) * 6 * dt;
      if (u.y < this.level(u.x) + 2 || u.t > 12) this.bubbles.splice(i, 1);
    }
  }

  /** Bubbles off a point, for digging and for anything that moves fast. */
  puff(x, y, n = 8) {
    if (!this.on) return;
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 6,
        r: 0.4 + Math.random() * 1.1, sp: 16 + Math.random() * 30,
        ph: Math.random() * TAU, t: 0,
      });
    }
  }

  // -- the reef, placed on the ground ---------------------------------------

  _cell(ci) {
    let c = this.cells.get(ci);
    if (c) return c;
    const rng = mulberry32(hashStr('reef:' + ci));
    const items = [];
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const x = (ci + rng()) * CELL;
      const big = rng() < 0.55;
      const size = big ? 0.9 + rng() * 1.1 : 0.5 + rng() * 0.55;
      items.push({
        x,
        kind: big ? REEF_KINDS[Math.floor(rng() * REEF_KINDS.length)]
          : FLOOR_KINDS[Math.floor(rng() * FLOOR_KINDS.length)],
        s: size,
        seed: Math.floor(rng() * 9999),
        flip: rng() < 0.5,
        sway: rng() * TAU,
        // anything big enough to hide you goes behind you
        far: size > 1.15 || rng() < 0.45,
      });
    }
    // kelp, in stands, and seagrass round the feet of everything
    if (rng() < 0.55) {
      const kx = (ci + rng()) * CELL, n = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        items.push({ x: kx + (i - n / 2) * (5 + rng() * 6), kind: 'kelp', h: 60 + rng() * 80,
          seed: Math.floor(rng() * 9999), sway: rng() * TAU, far: true, live: true });
      }
    }
    for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) {
      items.push({ x: (ci + rng()) * CELL, kind: 'grass', h: 7 + rng() * 9, n: 4 + Math.floor(rng() * 5),
        seed: Math.floor(rng() * 9999), sway: rng() * TAU, far: rng() < 0.5, live: true });
    }
    // and a crablet or two, walking about on the sand
    if (rng() < 0.5) {
      items.push({
        x: (ci + rng()) * CELL, kind: 'crablet', s: 0.4 + rng() * 0.35,
        seed: Math.floor(rng() * 9999), flip: rng() < 0.5, sway: rng() * TAU,
        walk: 6 + rng() * 10, far: false,
      });
    }
    c = items;
    this.cells.set(ci, c);
    if (this.cells.size > 200) this.cells.clear();
    return c;
  }

  near(x0, x1) {
    const out = [];
    for (let ci = Math.floor(x0 / CELL); ci <= Math.ceil(x1 / CELL); ci++) {
      for (const it of this._cell(ci)) if (it.x >= x0 && it.x <= x1) out.push(it);
    }
    return out;
  }

  /**
   * The giants, and the snow. Both go in behind everything else and a long
   * way off: a whale is drawn at a fraction of the camera's zoom and hazed
   * into the column, because a hundred feet of animal thirty metres over your
   * head is mostly water between you and it.
   */
  drawDeep(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    // the underside of the surface, when it is in shot - drawn here rather
    // than with the column so it goes over the desert's far props too
    if (this.flat === null) {
      const surfAt = (x) => { const w = cam.screenToWorld(x, 0).x; return cam.worldToScreen(w, this.level(w)).y; };
      const hi = Math.max(surfAt(0), surfAt(vw / 2), surfAt(vw));
      if (hi > -4) this._drawCeiling(ctx, vw, surfAt, wet);
    }
    const clipped = this._clipWater(ctx, cam, vw, vh);
    const z = cam.zoom;

    // marine snow first, so the whale passes in front of it
    ctx.globalAlpha = wet * 0.30;
    for (const sn of this.snow) {
      const s = cam.worldToScreen(sn.x + Math.sin(sn.ph) * 5, sn.y);
      if (s.x < -8 || s.x > vw + 8 || s.y < -8 || s.y > vh + 8) continue;
      ctx.fillStyle = sn.r > 1 ? '#dff4fa' : '#b8dbe6';
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sn.r, sn.r);
    }
    ctx.globalAlpha = 1;

    // the sharks first: they work lower down and the whales pass over them
    for (const sh of this.sharks) {
      const s = cam.worldToScreen(sh.x, sh.y);
      const art = sharkArt(1);
      const k = z * 0.9 * sh.s;
      const w = art.cv.width * k;
      if (s.x + w < -80 || s.x - w > vw + 80) continue;
      ctx.save();
      ctx.globalAlpha = wet * 0.8;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(k * (sh.dir < 0 ? -1 : 1), k);
      // the tail beat is a whole-body waggle on a shark, not a fluke stroke,
      // and a turn puts it over on one side
      ctx.rotate(Math.sin(sh.ph) * 0.05 + sh.bank * 0.5);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // the manta: far up, flying rather than swimming
    for (const m of this.mantas) {
      const s = cam.worldToScreen(m.x, m.y);
      const art = mantaArt(Math.floor(m.ph * MANTA_FRAMES) % MANTA_FRAMES);
      const k = Math.max(0.5, z * 0.9);
      if (s.x < -120 || s.x > vw + 120) continue;
      ctx.save();
      ctx.globalAlpha = wet * 0.82;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(k * (m.dir < 0 ? 1 : -1), k);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    // turtles, nearer, in no hurry
    for (const tu of this.turtles) {
      const s = cam.worldToScreen(tu.x, tu.y);
      if (s.x < -80 || s.x > vw + 80) continue;
      const art = turtleArt(Math.floor(tu.ph * TURTLE_FRAMES) % TURTLE_FRAMES);
      const k = Math.max(0.6, z);
      ctx.save();
      ctx.globalAlpha = wet * 0.94;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(k * (tu.dir < 0 ? 1 : -1), k);
      ctx.rotate(Math.sin(tu.ph * TAU) * 0.05);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (const wh of this.whales) {
      const s = cam.worldToScreen(wh.x, wh.y);
      const art = whaleArt(1);
      // they are far off, so they are drawn small and washed into the water
      const k = z * 0.95 * wh.s;
      const w = art.cv.width * k;
      if (s.x + w < -80 || s.x - w > vw + 80) continue;
      ctx.save();
      ctx.globalAlpha = wet * 0.74;
      ctx.translate(Math.round(s.x), Math.round(s.y + Math.sin(wh.ph) * 4 * z));
      ctx.scale(k * (wh.dir < 0 ? -1 : 1), k);
      // the fluke beat: the whole body rolls slowly through it
      ctx.rotate(Math.sin(wh.ph) * 0.035);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      // and the water it is pushing, which is how you know it is enormous
      ctx.globalAlpha = wet * 0.16;
      ctx.fillStyle = '#cfeef8';
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const bx = s.x - wh.dir * (60 + t * 200) * k;
        const by = s.y + Math.sin(wh.ph + t * 2) * 9 * z;
        ctx.fillRect(Math.round(bx), Math.round(by), Math.max(1, Math.round(3 * z)), 1);
      }
      ctx.globalAlpha = 1;
    }
    if (clipped) ctx.restore();
  }

  /** Everything growing on the bottom. `far` is the layer behind the animal. */
  drawReef(ctx, cam, far) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const b = cam.bounds(90);
    const z = cam.zoom;
    const r = this.game.renderer;
    const clipped = this._clipWater(ctx, cam, r.vw, r.vh);
    for (const it of this.near(b.x0, b.x1)) {
      if (!!it.far !== far) continue;
      let x = it.x;
      if (it.walk) x += Math.sin(this.t * 0.5 + it.sway) * it.walk;
      const y = this.game.terrain.surfaceY(x);
      // A standing sea has a shoreline, and coral does not grow past it.
      // (In the prologue the whole world is under water and this is free.)
      if (this.flat !== null && y < this.level(x) + 3) continue;
      const s = cam.worldToScreen(x, y);
      if (it.live) {
        ctx.globalAlpha = wet;
        if (it.kind === 'kelp') {
          drawKelp(ctx, s.x, s.y + 1, it.h * z, this.t, it.sway, {
            stipe: '#6b5a22', leafCol: '#a38f33', leaf2: '#8a7a2a', hi: '#d4c25e', float: '#d8c870',
            lw: Math.max(1, Math.round(z * 1.4)), leaf: 6 * Math.max(0.7, z), bw: Math.max(2, Math.round(2.4 * z)),
            every: 2, step: Math.max(3, 4 * z), amp: Math.max(0.7, z), crown: true });
        } else {
          drawGrass(ctx, s.x, s.y + 1, it.h * z, this.t, it.sway, {
            n: it.n, gap: Math.max(1, Math.round(z)), w: Math.max(1, Math.round(z * 0.8)),
            col: '#4f9a52', dark: '#2f6e3e', tip: '#8fd078', amp: z });
        }
        continue;
      }
      const art = reefArt(it.kind, Math.max(0.35, it.s * (far ? 0.8 : 1)), it.seed);
      const sway = Math.sin(this.t * 0.8 + it.sway) * 0.05 * wet;
      ctx.save();
      ctx.globalAlpha = wet * (far ? 0.72 : 1);
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * (it.flip ? -1 : 1), z);
      if (!it.walk) ctx.rotate(sway);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (clipped) ctx.restore();
  }

  /** The swimmers, and the bubbles going up past them. */
  drawSwimmers(ctx, cam) {
    // fish out of water is a saying for a reason
    const ceil = this.flat === null ? -1e9 : this.level(0) + 4;
    const wet = this.wet;
    if (wet <= 0.02) return;
    const z = cam.zoom;
    for (const f of this.fish) {
      if (f.y < ceil) continue;
      const s = cam.worldToScreen(f.x, f.y);
      if (s.x < -40 || s.x > this.game.renderer.vw + 40) continue;
      // a swim frame, not a rotated tail: the whole spine flexes in the art
      const art = fishFrame(f.kind, Math.floor(f.ph * 1.6) % FISH_FRAMES, 1);
      ctx.save();
      ctx.globalAlpha = wet;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * f.dir * Math.min(1.1, f.s + 0.25), z * Math.min(1.1, f.s + 0.25));
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    // the bait balls, a pixel to a pixel whatever the zoom: they are small
    const sk = z >= 1.7 ? 2 : 1;
    for (const sc of this.schools) {
      for (const f of sc.m) {
        if (f.y < ceil) continue;
        const s = cam.worldToScreen(f.x, f.y);
        if (s.x < -10 || s.x > this.game.renderer.vw + 10) continue;
        const art = schoolFish(sc.kind, Math.floor(f.ph) & 1, f.flash > 0);
        ctx.globalAlpha = wet;
        ctx.drawImage(f.dir < 0 ? art.l : art.r, Math.round(s.x - art.w * sk / 2), Math.round(s.y - art.h * sk / 2), art.w * sk, art.h * sk);
      }
    }
    ctx.globalAlpha = 1;
    for (const j of this.jellies) {
      const s = cam.worldToScreen(j.x, j.y);
      const art = jellyArt(Math.max(0.4, j.s));
      const pulse = 1 + Math.sin(j.ph) * 0.10;
      ctx.save();
      ctx.globalAlpha = wet * 0.8;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * pulse, z / pulse);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    for (const u of this.bubbles) {
      const s = cam.worldToScreen(u.x, u.y);
      const r = Math.max(1, u.r * z);
      ctx.globalAlpha = wet * 0.55;
      pxRing(ctx, s.x, s.y, r, r, '#dff6ff', { p: 1, thick: 1 });
      ctx.globalAlpha = wet * 0.35;
      ctx.fillStyle = '#bfeaf6';
      ctx.fillRect(Math.round(s.x - r * 0.3), Math.round(s.y - r * 0.5), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // -- the water itself ------------------------------------------------------

  /**
   * Everything that makes it read as water rather than as a blue filter: the
   * column above the ground painted out, the light coming down through it in
   * shafts, a net of caustics crawling over whatever the light lands on, the
   * surface seen from underneath, and silt hanging in between.
   */
  /**
   * The column: everything above the seabed is water, so the desert sky and
   * the far dunes are painted out of the frame entirely. This happens *before*
   * the reef and the animal are drawn, because they are in the water, not
   * behind it - which is the whole difference between a sea and a blue filter.
   */
  drawColumn(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.01) return;
    const terr = this.game.terrain;
    const z = cam.zoom;
    const surfW = cam.worldToScreen(cam.x, this.level(cam.x)).y;
    const solid = this.flat === null;

    // The colour is pinned to depth, not to the screen: a metre down is the
    // same turquoise wherever the camera is, and it goes to navy by the time
    // you are three hundred down.
    const col = ctx.createLinearGradient(0, surfW, 0, surfW + 330 * z);
    const A = (solid ? 0.97 : 0.93) * wet;
    col.addColorStop(0, `rgba(132,226,236,${A})`);
    col.addColorStop(0.16, `rgba(72,192,222,${A})`);
    col.addColorStop(0.42, `rgba(36,142,200,${A})`);
    col.addColorStop(0.72, `rgba(22,98,164,${A})`);
    col.addColorStop(1, `rgba(12,58,118,${A})`);

    ctx.save();
    ctx.beginPath();
    const topAt = (x) => {
      const w = cam.screenToWorld(x, 0).x;
      return cam.worldToScreen(w, this.level(w)).y;
    };
    // in the prologue the column runs all the way up: what is over the
    // surface is the underside of the surface, which the reflection paints
    ctx.moveTo(0, solid ? Math.min(0, surfW) : topAt(0));
    if (solid) ctx.lineTo(vw, Math.min(0, surfW));
    else for (let x = 0; x <= vw; x += 6) ctx.lineTo(x, topAt(x));
    for (let x = vw; x >= 0; x -= 6) {
      const w = cam.screenToWorld(x, 0).x;
      ctx.lineTo(x, cam.worldToScreen(w, terr.surfaceY(w)).y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, vw, vh);

    // the bed under the middle of the shot, which the far ranks stand on
    const bedW = terr.surfaceY(cam.x);
    const ranks = [
      { layer: 0, p: 0.16, pv: 0.55, lift: 26, haze: 0.42 },
      { layer: 1, p: 0.34, pv: 0.75, lift: 10, haze: 0.18 },
    ];
    for (const R of ranks) {
      const tile = wallTile(R.layer);
      // stand it on the bed, moving less than the bed does
      const base = Math.round(vh / 2 + (bedW - cam.y) * z * R.pv + (cam.y - bedW) * 0 - R.lift);
      const y0 = base - tile.H;
      const off = ((cam.x * R.p) % tile.W + tile.W) % tile.W;
      ctx.globalAlpha = wet;
      for (let x = -Math.round(off); x < vw; x += tile.W) ctx.drawImage(tile.cv, x, y0);
      ctx.fillStyle = tile.deep;
      ctx.fillRect(0, base - 1, vw, vh - base + 1);
      // kelp standing up out of this rank
      this._drawKelpRank(ctx, cam, vw, base, R);
      ctx.globalAlpha = 1;
      // and the water between you and it
      ctx.globalAlpha = R.haze;
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
      if (R.layer === 0) this._drawRays(ctx, vw, vh, surfW, wet, 0.8);
    }
    this._drawRays(ctx, vw, vh, surfW, wet, 0.45);

    ctx.restore();
  }

  /** Shafts of light from the surface, behind everything on the bottom. */
  _drawRays(ctx, vw, vh, surfW, wet, k) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sy = Math.max(-20, surfW);
    for (let i = 0; i < 6; i++) {
      const ph = i * 1.9 + k * 3;
      const x = vw * ((i + 0.5) / 6) + Math.sin(this.t * 0.2 + ph) * vw * 0.05 - (this.game.cam.x * 0.08) % (vw / 6);
      const lean = Math.sin(this.t * 0.15 + ph) * 0.10 + 0.14;
      const a = (0.06 + 0.05 * (0.5 + 0.5 * Math.sin(this.t * 0.5 + ph))) * wet * k;
      const g = ctx.createLinearGradient(0, sy, 0, vh);
      g.addColorStop(0, `rgba(230,255,255,${a})`);
      g.addColorStop(0.6, `rgba(170,232,248,${a * 0.45})`);
      g.addColorStop(1, 'rgba(150,220,240,0)');
      ctx.fillStyle = g;
      const w0 = vw * (0.010 + 0.008 * Math.sin(ph * 2)), w1 = vw * (0.045 + 0.02 * Math.sin(ph));
      const len = vh - sy;
      ctx.beginPath();
      ctx.moveTo(x - w0, sy);
      ctx.lineTo(x + w0, sy);
      ctx.lineTo(x + len * lean + w1, vh);
      ctx.lineTo(x + len * lean - w1, vh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Looking up at the surface from under it: past the bright line the water
   * is a mirror, and what it mirrors is wave after wave of itself, packed
   * tighter the further off they are.
   */
  _drawCeiling(ctx, vw, surfAt, wet) {
    const t = this.t;
    const camX = this.game.cam.x * 0.4;
    for (let x = 0; x < vw; x += 2) {
      const sy = Math.round(surfAt(x));
      if (sy <= 0) continue;
      // the mirror: brightest at the line, deepening up the frame
      for (let y = 0; y < sy; y += 1) {
        const d = sy - y;
        const k = Math.min(1, d / 120);
        const r = Math.round(196 - 126 * k), gg = Math.round(246 - 68 * k), bb = Math.round(248 - 34 * k);
        ctx.fillStyle = `rgb(${r},${gg},${bb})`;
        // runs of one colour, not a pixel at a time
        let run = 1;
        while (y + run < sy && Math.floor(Math.min(1, (sy - y - run) / 120) * 24) === Math.floor(k * 24)) run++;
        ctx.globalAlpha = 0.96 * wet;
        ctx.fillRect(x, y, 2, run);
        y += run - 1;
      }
      // wave after wave of it, packed tighter toward the line
      for (let k = 0; k < 18; k++) {
        const y0 = sy - 2 - Math.pow(k, 1.55) * 1.6;
        if (y0 < -4) break;
        const w = Math.sin((x + camX) * (0.07 - k * 0.002) + t * (1.4 + k * 0.05) + k * 1.7);
        const y = Math.round(y0 + w * (0.6 + k * 0.18));
        const fade = 1 - k / 18;
        if (w > 0.55) { ctx.globalAlpha = wet * 0.55 * fade; ctx.fillStyle = '#f4ffff'; ctx.fillRect(x, y, 2, 1); }
        else if (w < -0.6) { ctx.globalAlpha = wet * 0.22 * fade; ctx.fillStyle = '#2f93bd'; ctx.fillRect(x, y, 2, 1); }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** A rank of kelp stood on one of the far walls. */
  _drawKelpRank(ctx, cam, vw, base, R) {
    const spacing = R.layer === 0 ? 38 : 54;
    const px = cam.x * R.p;
    const first = Math.floor((px - 40) / spacing), last = Math.ceil((px + vw + 40) / spacing);
    const far = R.layer === 0;
    const o = far
      ? { stipe: '#2e6f74', leafCol: '#3a7f78', lw: 1, leaf: 4, every: 2, step: 3, amp: 0.7 }
      : { stipe: '#3e6a3c', leafCol: '#5a8443', leaf2: '#4c7a3e', hi: '#7aa25a', lw: 1, leaf: 5, bw: 2, every: 2, step: 3, amp: 0.9, crown: true };
    for (let i = first; i <= last; i++) {
      const h1 = Math.sin(i * 12.9898 + R.layer * 7.1) * 43758.5453;
      const r = h1 - Math.floor(h1);
      if (r < (far ? 0.45 : 0.55)) continue;
      const x = Math.round(i * spacing + r * spacing * 0.8 - px);
      const len = (far ? 40 : 54) + r * (far ? 46 : 64);
      drawKelp(ctx, x, base + 2, len, this.t, i * 1.37, o);
    }
  }

  /**
   * The seabed. The ground under the sea is the desert's ground, but a
   * thousand years earlier it was pale sea sand, combed into ripples by the
   * swell and lit from above: so it is recoloured where the water covers it,
   * the lip catches the light, and the cut face below goes dark and blue.
   */
  drawBed(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const terr = this.game.terrain;
    const z = cam.zoom;
    const step = 3;
    const ys = [];
    for (let x = 0; x <= vw + step; x += step) {
      const w = cam.screenToWorld(x, 0).x;
      const gy = terr.surfaceY(w);
      // a standing sea only owns the ground that is under it
      const dry = this.flat !== null && gy < this.level(w) + 2;
      ys.push(dry ? null : cam.worldToScreen(w, gy).y);
    }
    ctx.save();
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < ys.length; i++) {
      const x = i * step;
      if (ys[i] === null) {
        if (open) { ctx.lineTo(x, vh); ctx.closePath(); open = false; }
        continue;
      }
      if (!open) { ctx.moveTo(x, vh); open = true; }
      ctx.lineTo(x, ys[i]);
    }
    if (open) { ctx.lineTo(vw + step, vh); ctx.closePath(); }
    ctx.clip();
    // pale sea sand going down to a cold, dark cut face
    const top = Math.min(...ys.filter((v) => v !== null), vh);
    const g = ctx.createLinearGradient(0, top, 0, top + 90 * z);
    g.addColorStop(0, `rgba(226,214,170,${0.72 * wet})`);
    g.addColorStop(0.12, `rgba(196,186,148,${0.70 * wet})`);
    g.addColorStop(0.45, `rgba(120,132,124,${0.72 * wet})`);
    g.addColorStop(1, `rgba(34,62,84,${0.86 * wet})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, top - 2, vw, vh - top + 2);
    ctx.restore();

    // the lit lip, and the ripples combed into the top of it
    const camX = cam.x;
    for (let i = 0; i < ys.length - 1; i++) {
      const y = ys[i];
      if (y === null) continue;
      const x = i * step;
      ctx.globalAlpha = wet * 0.85;
      ctx.fillStyle = '#f4ecc8';
      ctx.fillRect(x, Math.round(y), step, 1);
      ctx.globalAlpha = wet * 0.5;
      ctx.fillStyle = '#fff8dc';
      if (((x + Math.round(camX * z)) / step) % 4 === 0) ctx.fillRect(x, Math.round(y) - 1, 1, 1);
      for (let r = 0; r < 3; r++) {
        const wx = camX + (x - vw / 2) / z;
        const ry = Math.round(y + (2 + r * 3) * Math.max(1, z * 0.9));
        const w = Math.sin(wx * 0.32 + r * 2.1 + Math.sin(wx * 0.05 + r) * 1.4);
        if (w > 0.45) { ctx.globalAlpha = wet * (0.5 - r * 0.12); ctx.fillStyle = '#efe4bc'; ctx.fillRect(x, ry, step, 1); }
        else if (w < -0.55) { ctx.globalAlpha = wet * (0.35 - r * 0.08); ctx.fillStyle = '#7f7a64'; ctx.fillRect(x, ry, step, 1); }
      }
      // pebbles and shell grit
      const h1 = Math.sin(Math.floor((camX + (x - vw / 2) / z) / 7) * 91.7) * 43758.5;
      const r1 = h1 - Math.floor(h1);
      if (r1 > 0.86) {
        ctx.globalAlpha = wet * 0.8;
        ctx.fillStyle = r1 > 0.95 ? '#f6f0e0' : r1 > 0.9 ? '#8c8270' : '#b9ad8a';
        ctx.fillRect(x + 1, Math.round(y + 3 + r1 * 8 * z), Math.max(1, Math.round(z)), Math.max(1, Math.round(z)));
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The front of the frame: dark, out-of-focus coral and fronds swaying
   * across the bottom corners, so the shot has a foreground and the reef has
   * a near side. Replaces the desert's grass tufts while you are under.
   */
  drawForeground(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.3) return;
    const p = 1.6;
    const px = cam.x * p;
    const spacing = 120;
    const first = Math.floor((px - 160) / spacing), last = Math.ceil((px + vw + 160) / spacing);
    ctx.save();
    ctx.globalAlpha = wet * 0.94;
    for (let i = first; i <= last; i++) {
      const h1 = Math.sin(i * 78.233 + 4.1) * 43758.5453;
      const r = h1 - Math.floor(h1);
      if (r < 0.35) continue;
      const x = Math.round(i * spacing + r * 60 - px);
      if (r > 0.62) {
        const cv = foreCoral(Math.floor(r * 100) % 6);
        ctx.drawImage(cv, x - (cv.width >> 1), vh - cv.height + 8 + Math.round(r * 10));
      }
      // fronds, thick and nearly black
      const n = 2 + Math.floor(r * 3);
      for (let k = 0; k < n; k++) {
        drawKelp(ctx, x + (k - n / 2) * 7, vh + 4, 34 + r * 40 + k * 9, this.t * 0.8, i * 2.3 + k,
          { stipe: '#041b25', leafCol: '#062430', leaf2: '#041b25', lw: 3, leaf: 9, bw: 4, every: 2, step: 4, amp: 1.2 });
      }
    }
    ctx.restore();
  }

  /**
   * And everything that hangs between you and what you are looking at: the
   * depth wash, caustics crawling over the sand, silt, the surface seen from
   * underneath, and - while the sea is leaving - the years.
   */
  overlay(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.01) return;
    const clipped = this._clipWater(ctx, cam, vw, vh);
    const terr = this.game.terrain;
    const z = cam.zoom;
    const surfW = cam.worldToScreen(cam.x, this.level(cam.x)).y;

    // 1. the water you are looking through
    ctx.globalAlpha = 0.08 * wet;
    ctx.fillStyle = '#1c7aa6';
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    // 3. caustics, crawling over the sand
    for (let i = 0; i < 54; i++) {
      const sx = ((i * 37 + Math.sin(this.t * 0.5 + i) * 14) % vw + vw) % vw;
      const w = cam.screenToWorld(sx, 0).x;
      const gy = cam.worldToScreen(w, terr.surfaceY(w)).y;
      const y = gy + ((i % 5) - 1) * 3 * z + Math.sin(this.t * 1.1 + i * 2.3) * 3;
      const ww = (8 + Math.sin(this.t * 1.7 + i) * 6) * z * 0.6;
      ctx.globalAlpha = wet * 0.30 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + i * 1.3)));
      ctx.fillStyle = '#d8f8ff';
      ctx.fillRect(Math.round(sx - ww / 2), Math.round(y), Math.max(2, ww), 1);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 4. silt, hanging in the water
    for (let i = 0; i < 90; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453;
      const h2 = Math.sin(i * 78.233) * 43758.5453;
      const px = (((h1 - Math.floor(h1)) * vw - cam.x * z * 0.3 - this.t * 2) % vw + vw) % vw;
      const py = (((h2 - Math.floor(h2)) * vh - this.t * 5 - cam.y * z * 0.3) % vh + vh) % vh;
      ctx.globalAlpha = wet * (0.10 + 0.18 * (0.5 + 0.5 * Math.sin(this.t * 1.4 + i)));
      ctx.fillStyle = i % 7 === 0 ? '#eafaff' : '#a9d6e4';
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
    ctx.globalAlpha = 1;

    // 5. the surface, seen from below: a bright wobbling line, and the
    // glow hanging just under it
    if (surfW > -30 && surfW < vh) {
      for (let x = 0; x < vw; x += 2) {
        const w = Math.sin(x * 0.05 + this.t * 1.6) * 2.2 + Math.sin(x * 0.11 - this.t * 2.3) * 1.2;
        const wx = cam.screenToWorld(x, 0).x;
        const y = Math.round(cam.worldToScreen(wx, this.level(wx)).y + w);
        ctx.globalAlpha = wet * (0.55 + 0.35 * Math.sin(x * 0.2 + this.t * 3));
        ctx.fillStyle = '#f4ffff';
        ctx.fillRect(x, y, 2, 1);
        ctx.globalAlpha = wet * 0.25;
        ctx.fillStyle = '#bff2fa';
        ctx.fillRect(x, y + 1, 2, 2);
        ctx.globalAlpha = wet * 0.10;
        ctx.fillRect(x, y + 3, 2, 5);
      }
      ctx.globalAlpha = 1;
    }

    // 6. and the years, while the sea is leaving
    if (this.yearShow > 0 && this.drain > 0) {
      const yr = Math.round(Math.pow(clamp01(this.drain), 0.72) * 1000);
      const label = `${yr} YEARS`;
      const fade = clamp01(this.drain * 6) * clamp01((1.05 - this.drain) * 6);
      // It sits high and small, just under the top bar, like a slate held up
      // to the camera - in the middle of the frame it competes with the shot.
      const w = textWidth(label);
      const ty = Math.round(vh * 0.115);
      ctx.globalAlpha = fade * 0.55;
      drawText(ctx, label, Math.round(vw / 2), ty, {
        color: '#f6ecd2', align: 'center', outline: true, outlineColor: 'rgba(0,0,0,0.6)',
      });
      ctx.globalAlpha = fade * 0.32;
      ctx.fillStyle = '#f6ecd2';
      ctx.fillRect(Math.round(vw / 2 - w / 2), ty + 10, Math.round(w * this.drain), 1);
      ctx.globalAlpha = 1;
    }
    if (clipped) ctx.restore();
  }
}
