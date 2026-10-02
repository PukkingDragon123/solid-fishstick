// CRABDEN - the water that used to be here.
//
// This is not a separate screen. It is the world you already have - the same
// terrain, the same camera, the same crab - with a sea put on top of it. The
// seabed in the prologue is the desert floor you will spend the rest of the
// game walking across, one thousand years earlier and thirty metres down.
//
// It does three jobs:
//
//   water    the column itself - turquoise under the surface going to navy at
//            depth, four ranks of rock going back into the blue, shafts of
//            light, the surface seen from underneath, snow and bubbles
//   life     rock, coral and weed placed along the bed a stretch at a time;
//            a handful of fish in view at once, a bait ball, the residents
//            of each reef, and now and then something big
//   drain    the thousand years: the surface walks down, the reef bleaches
//            and dies back, the blue comes out of the light, and the desert
//            is left
//
// The sea is wide and mostly empty, because that is what the sea is. What is
// in it is spaced out so each thing can be looked at.

import { clamp, clamp01, lerp, damp, smoothstep, TAU, mulberry32, hashStr } from '../lib/math.js';
import { pxRing } from '../render/pix.js';
import { drawText, textWidth } from '../lib/font.js';
import { causticFrame, CTILE } from '../render/waterfx.js';
import { swimFrame, hasSwimFrame, SWIM_FRAMES } from '../art/fishart.js';
import { seaSpecies } from './fishing.js';
import {
  formationArt, reefArt, anemoneArt, ANEMONE_FRAMES, FORMATIONS, REEF_KINDS, FLOOR_KINDS,
  jellyArt, JELLY_FRAMES, whaleArt, WHALE_FRAMES, sharkArt, SHARK_FRAMES, whaleSharkArt, WSHARK_FRAMES,
} from '../art/seaart.js';
import {
  paintWater, rankTile, RANKS, raySprite, RAY_KINDS, surfaceStrip, mirrorTile, SURF_FRAMES,
  kelpJoint, kelpCrown, KELP_JOINT, grassClump, GRASS_FRAMES, paintBedChunk, BED_W, BED_FILL,
  foreShape, FORE_KINDS, mantaArt, MANTA_FRAMES, turtleArt, TURTLE_FRAMES,
} from '../art/seascape.js';

const ZONE = 420;              // one stretch of reef, in world units
const DEPTH = 280;             // how far the surface is above the seabed
const DRAIN_SECS = 9.0;        // how long the sea takes to leave

// who lives where: the open-water fish cruise, the reef fish keep house
const CRUISERS = ['snapper', 'bream', 'tuna', 'barracuda', 'snapper', 'bream', 'mackerel', 'parrot'];
const RESIDENTS = ['tang', 'butterfly', 'idol', 'tang', 'butterfly', 'lionfish', 'parrot', 'grouper'];
const PELAGIC = new Set(['tuna', 'barracuda', 'mackerel', 'sardine', 'anchovy', 'snapper', 'bream']);

/** A scale on a fixed ladder, so sprites are painted at a few sizes, not hundreds. */
const qs = (k, step = 0.125) => Math.max(step * 2, Math.round(k / step) * step);

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
    this.giants = [];          // a whale shark, a long way off
    this.cells = new Map();
    this.beds = new Map();
    this.homes = new Set();    // reef stretches whose residents are out
    this.yearShow = 0;
    this.budget = 0;
    // When the sea is the one that never left, its surface does not track the
    // ground - it is a level, the way a real body of water is.
    this.flat = null;
    // The thousand years, while it is being shown as a timelapse (see
    // js/systems/timelapse.js): { level, wet, bleach, collapse, life, bed }.
    // The sea is a body of water with a surface you can see from outside it
    // for the length of it, and that surface is what goes down.
    this.lapse = null;
    this._col = null;
    this._scratch = null;
    this._prebake();
  }

  get active() { return this.on; }
  /** How much of the underwater treatment is still applied. */
  get wet() {
    if (!this.on) return 0;
    if (this.lapse) return this.lapse.wet;
    return 1 - smoothstep(clamp01(this.drain * 1.15));
  }

  /**
   * The far ranks take a moment each to paint, so they are painted while the
   * title screen is up rather than the moment the sea first appears.
   */
  _prebake() {
    if (typeof window === 'undefined') return;
    const jobs = [
      () => rankTile(0), () => rankTile(1), () => rankTile(2), () => rankTile(3),
      () => { for (let i = 0; i < RAY_KINDS; i++) raySprite(i); },
      () => { for (let f = 0; f < SURF_FRAMES; f++) { surfaceStrip(f); mirrorTile(f); } },
      () => { for (let i = 0; i < FORE_KINDS; i++) foreShape(i); },
    ];
    const next = () => {
      const j = jobs.shift();
      if (!j) return;
      try { j(); } catch (e) { /* painted on demand instead */ }
      setTimeout(next, 40);
    };
    setTimeout(next, 120);
  }

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
    this.giants = [];
    this.homes.clear();
    this.budget = 400;          // the first frame may paint what it needs
    const cx = this.game.crab.x;
    const top = this.level(cx);
    const bed = this.game.terrain.surfaceY(cx);
    const deep = (k) => top + (bed - top) * k;
    // two of them, a long way up, crossing in opposite directions - a mother
    // and a calf, because one of them being smaller is the only way the size
    // of the other one lands
    this.whales.push({ x: cx - 1500, y: deep(0.26), dir: 1, sp: 26, s: 1.0, ph: 0, blow: 0 });
    this.whales.push({ x: cx - 1660, y: deep(0.34), dir: 1, sp: 26, s: 0.52, ph: 1.2, blow: 0 });
    // Sharks work the middle of the water column, and they turn - a shark's
    // day is one long circuit of the same drop-off.
    for (let i = 0; i < 2; i++) {
      this.sharks.push({
        x: cx + (i ? 900 : -700), y: deep(0.5 + i * 0.12),
        dir: i % 2 ? -1 : 1, sp: 40 + i * 8, s: 0.85 + i * 0.15,
        ph: Math.random() * 6, turn: 8 + Math.random() * 6, bank: 0,
      });
    }
    for (let i = 0; i < 70; i++) {
      this.snow.push({ x: cx + (Math.random() - 0.5) * 1000, y: top + Math.random() * (bed - top),
        v: 2 + Math.random() * 5, ph: Math.random() * TAU, r: Math.random() < 0.15 ? 2 : 1, a: 0.3 + Math.random() * 0.5 });
    }
    // one bait ball near, another further along
    this._spawnSchool(cx + 240, 0);
    this._spawnSchool(cx - 900, 1);
    // a manta going over, slow and high; a turtle lower down, in no hurry
    this.mantas.push({ x: cx + 520, y: deep(0.28), dir: -1, sp: 13, ph: 0, s: 1 });
    this.turtles.push({ x: cx - 380, y: deep(0.55), dir: 1, sp: 10, ph: Math.random(), bob: Math.random() * TAU, s: 1 });
    for (let i = 0; i < 3; i++) {
      this.jellies.push({ x: cx + (i - 1) * 520 + (Math.random() - 0.5) * 200, y: deep(0.25 + Math.random() * 0.4),
        ph: Math.random() * TAU, sp: 0.6 + Math.random() * 0.4, s: 0.8 + Math.random() * 0.5, drift: (Math.random() - 0.5) * 4 });
    }
    // a whale shark, crossing the far blue, every so often
    this.giants.push({ px: -400, y: 0.36, dir: 1, sp: 7, ph: 0, wait: 6 });
    const b = this.game.cam.bounds(200);
    const n = this._cruiserTarget(b);
    for (let i = 0; i < n; i++) this._spawnFish(lerp(b.x0, b.x1, (i + 0.5) / n + (Math.random() - 0.5) * 0.1));
  }

  stop() { this.on = false; this.flat = null; this.lapse = null; }
  beginDrain() { this.draining = true; }

  /** Hand the level over to the timelapse; it drives everything from here. */
  beginLapse(lapse) {
    this.lapse = lapse;
    this.flat = lapse.level;
    this.draining = false;
    this.drain = 0;
  }

  /**
   * What is still exposed at x: 0 under the water, 1 once the surface has
   * been gone from here for a while. The reef dies where the water leaves,
   * not everywhere at once.
   */
  _dry(x) {
    if (!this.lapse) return 0;
    return clamp01((this.lapse.level - this.game.terrain.surfaceY(x)) / 46);
  }

  /** The sea emptying of animals while the timelapse runs. */
  _lapseLife(dt, b) {
    const L = this.lapse;
    const life = L.life;
    const cx = this.game.cam.x;
    // the big ones go first, and they go somewhere: they turn for open water
    const leave = (a, far) => {
      if (life > 0.86 || a.left) return;
      a.left = true;
      a.dir = a.x < cx ? -1 : 1;
      a.sp = Math.max(a.sp || 0, far);
    };
    for (const wh of this.whales) leave(wh, 150);
    for (const sh of this.sharks) { leave(sh, 130); if (sh.left) sh.turn = 99; }
    for (const m of this.mantas) leave(m, 60);
    for (const tu of this.turtles) leave(tu, 40);
    if (life < 0.8) this.giants.length = 0;
    if (life < 0.62) this.schools.length = 0;
    if (life < 0.5) this.jellies.length = 0;
    const T = this.game.terrain;
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      const shallow = T.surfaceY(f.x) - this.level(f.x) < 18;
      if (shallow || Math.random() < dt * (1 - life) * 1.6) this.fish.splice(i, 1);
    }
    if (life < 0.3) {
      this.whales.length = 0; this.sharks.length = 0; this.mantas.length = 0; this.turtles.length = 0;
    }
  }

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
   * The standing ocean out west. Same water, same animals, no drain - the
   * surface is a level rather than a depth below the ground.
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

  // -- budgets -----------------------------------------------------------------

  /** Paint something only if this frame still has time for it. */
  _can() { return this.budget > 0; }
  _spend(fn) {
    const t0 = performance.now();
    const v = fn();
    this.budget -= performance.now() - t0;
    return v;
  }
  /** A swim frame at scale S, painted now if there is time, or null. */
  _fishArt(id, frame, S) {
    if (hasSwimFrame(id, frame, S)) return swimFrame(id, frame, S);
    if (!this._can()) return hasSwimFrame(id, 0, S) ? swimFrame(id, 0, S) : null;
    return this._spend(() => swimFrame(id, frame, S));
  }
  _big(key, fn) {
    this._bigSeen = this._bigSeen || new Set();
    if (this._bigSeen.has(key)) return fn();
    if (!this._can()) return null;
    const v = this._spend(fn);
    this._bigSeen.add(key);
    return v;
  }

  // -- the swimmers -------------------------------------------------------------

  _cruiserTarget(b) { return clamp(Math.round((b.x1 - b.x0) / 170), 3, 7); }

  _spawnFish(x, kind) {
    const [top, bed] = this._band(x);
    if (bed - top < 30) return;
    const depth = bed - top;
    if (!kind) {
      // in the sea you can fish, most of what swims past is something you can
      // catch; in the prologue it is whatever the reef had
      if (this.flat !== null && !this.lapse && Math.random() < 0.7) kind = seaSpecies(depth);
      else kind = CRUISERS[Math.floor(Math.random() * CRUISERS.length)];
    }
    const pel = PELAGIC.has(kind);
    const lo = pel ? 0.2 : 0.55, hi = pel ? 0.8 : 0.92;
    this.fish.push({
      kind, x, y: top + depth * lerp(lo, hi, Math.random()),
      dir: Math.random() < 0.5 ? -1 : 1, s: 0.85 + Math.random() * 0.3,
      sp: (pel ? 22 : 12) + Math.random() * 12, ph: Math.random() * 8,
      ty: null, turnT: 3 + Math.random() * 6, flee: 0, flip: 0, home: null,
    });
  }

  _spawnSchool(x, i = 0) {
    const [top, bed] = this._band(x);
    if (bed - top < 60) return;
    const kind = i % 2 ? 'anchovy' : 'sardine';
    const n = kind === 'anchovy' ? 46 : 36;
    const cy = top + (bed - top) * (0.35 + Math.random() * 0.25);
    const sc = { kind, x, y: cy, vx: (Math.random() < 0.5 ? -1 : 1) * 14, vy: 0, tx: x, ty: cy, retarget: 0,
      sp: 18, swirl: Math.random() < 0.5 ? 0.5 : -0.5, m: [] };
    for (let k = 0; k < n; k++) {
      sc.m.push({ x: x + (Math.random() - 0.5) * 50, y: cy + (Math.random() - 0.5) * 22,
        vx: sc.vx, vy: 0, ph: Math.random() * 8, dir: sc.vx < 0 ? -1 : 1, flash: 0 });
    }
    this.schools.push(sc);
  }

  /**
   * A bait ball is three rules and nothing else: stay with the others, swim
   * the way they swim, do not touch. Add a slow swirl round the middle and a
   * scatter when something big comes through, and it turns as one.
   */
  _updateSchools(dt, b) {
    const crab = this.game.crab;
    for (const sc of this.schools) {
      const [top, bed] = this._band(sc.x);
      sc.retarget -= dt;
      if (sc.retarget <= 0 || Math.hypot(sc.tx - sc.x, sc.ty - sc.y) < 20) {
        sc.retarget = 5 + Math.random() * 6;
        sc.tx = clamp(sc.x + (Math.random() - 0.5) * 420, b.x0 - 200, b.x1 + 200);
        const [t2, g2] = this._band(sc.tx);
        sc.ty = t2 + (g2 - t2) * (0.25 + Math.random() * 0.45);
      }
      const dx = sc.tx - sc.x, dy = sc.ty - sc.y, d = Math.hypot(dx, dy) || 1;
      sc.vx = damp(sc.vx, (dx / d) * sc.sp, 0.3, dt);
      sc.vy = damp(sc.vy, (dy / d) * sc.sp * 0.5, 0.3, dt);
      sc.x += sc.vx * dt; sc.y = clamp(sc.y + sc.vy * dt, top + 20, bed - 20);
      const ms = sc.m;
      for (let i = 0; i < ms.length; i++) {
        const f = ms[i];
        const ox = f.x - sc.x, oy = f.y - sc.y;
        let ax = -ox * 0.35 + (sc.vx - f.vx) * 1.4 - oy * sc.swirl;
        let ay = -oy * 0.9 + (sc.vy - f.vy) * 1.4 + ox * sc.swirl * 0.5;
        for (let j = 0; j < ms.length; j++) {
          if (j === i) continue;
          const q = ms[j];
          const ex = f.x - q.x, ey = f.y - q.y;
          const e2 = ex * ex + ey * ey;
          if (e2 < 64 && e2 > 0.01) { ax += ex / e2 * 110; ay += ey / e2 * 110; }
        }
        // the crab coming through makes a hole in it
        const cx = f.x - crab.x, cy = f.y - (crab.y - 10);
        const c2 = cx * cx + cy * cy;
        if (c2 < 2500) { const k = 1600 / Math.max(60, c2); ax += cx * k * 0.05; ay += cy * k * 0.05; f.flash = 0.3; }
        f.vx += ax * dt; f.vy += ay * dt;
        const v = Math.hypot(f.vx, f.vy), vmax = sc.sp * 2.2;
        if (v > vmax) { f.vx *= vmax / v; f.vy *= vmax / v; }
        f.x += f.vx * dt; f.y = clamp(f.y + f.vy * dt, top + 8, bed - 6);
        f.ph += dt * (8 + v * 0.25);
        const want = f.vx < -2 ? -1 : f.vx > 2 ? 1 : f.dir;
        if (want !== f.dir) { f.dir = want; f.flash = 0.22; }
        f.flash = Math.max(0, f.flash - dt);
      }
      // a school that has wandered right off goes round the other way
      if (sc.x < b.x0 - 900 || sc.x > b.x1 + 900) {
        const nx = sc.x < b.x0 ? b.x1 + 500 : b.x0 - 500;
        const shift = nx - sc.x;
        sc.x = nx; sc.tx = nx;
        for (const f of ms) f.x += shift;
      }
    }
  }

  _updateFish(dt, b, wet) {
    const T = this.game.terrain;
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      f.flip = Math.max(0, f.flip - dt * 5);
      const ground = T.surfaceY(f.x);
      const top = this.level(f.x);
      if (f.flee > 0) {
        // the fishing system is chasing it off; it keeps its own course
        f.ph += dt * 14;
      } else if (f.home) {
        // a reef fish keeps house: a slow wander between places near home,
        // a pause at each, never far from the rock
        const h = f.home;
        f.turnT -= dt;
        if (f.ty === null || f.turnT <= 0) {
          f.turnT = 2 + Math.random() * 4;
          f.tx = h.x + (Math.random() - 0.5) * h.r * 2;
          const gy = T.surfaceY(f.tx);
          f.ty = gy - 8 - Math.random() * h.up;
        }
        const dx = f.tx - f.x, dy = f.ty - f.y;
        const d = Math.hypot(dx, dy);
        const sp = d > 4 ? f.sp : 0;
        if (Math.abs(dx) > 3) {
          const want = dx < 0 ? -1 : 1;
          if (want !== f.dir) { f.dir = want; f.flip = 1; }
        }
        f.x += (dx / (d || 1)) * sp * dt;
        f.y += (dy / (d || 1)) * sp * 0.6 * dt;
        f.ph += dt * (sp > 0 ? 9 : 4);
      } else {
        // a cruiser: on across the frame, a slow rise and fall, and now and
        // then it thinks better of it and turns
        f.x += f.dir * f.sp * dt * (0.6 + wet * 0.4);
        f.turnT -= dt;
        if (f.ty === null || f.turnT <= 0) {
          f.turnT = 4 + Math.random() * 8;
          f.ty = top + (ground - top) * (0.2 + Math.random() * 0.68);
          if (Math.random() < 0.25) { f.dir *= -1; f.flip = 1; }
        }
        f.y += clamp(f.ty - f.y, -1, 1) * 6 * dt;
        f.ph += dt * (6 + f.sp * 0.12);
        if (f.x < b.x0 - 260 || f.x > b.x1 + 260) { this.fish.splice(i, 1); continue; }
      }
      // stay in the water column, and drop with the ceiling as it falls
      f.y = clamp(f.y, top + 10, ground - 6);
      if (wet < 0.25 && Math.random() < dt * 2) this.fish.splice(i, 1);
    }
    const cruisers = this.fish.reduce((n, f) => n + (f.home ? 0 : 1), 0);
    if (wet > 0.3 && (!this.lapse || this.lapse.life > 0.85)
      && cruisers < this._cruiserTarget(b) && Math.random() < dt * 0.8) {
      this._spawnFish(Math.random() < 0.5 ? b.x0 - 180 : b.x1 + 180);
      const f = this.fish[this.fish.length - 1];
      if (f && !f.home) f.dir = f.x < this.game.cam.x ? 1 : -1;
    }
  }

  /** The reef stretches near you put their residents out; far ones take them in. */
  _updateHomes(b) {
    const z0 = Math.floor((b.x0 - 200) / ZONE), z1 = Math.floor((b.x1 + 200) / ZONE);
    for (const zi of this.homes) {
      if (zi < z0 - 1 || zi > z1 + 1) {
        this.homes.delete(zi);
        this.fish = this.fish.filter((f) => !f.home || f.home.zi !== zi);
      }
    }
    if (this.wet < 0.4 || (this.lapse && this.lapse.life < 0.9)) return;
    for (let zi = z0; zi <= z1; zi++) {
      if (this.homes.has(zi)) continue;
      this.homes.add(zi);
      for (const h of this._zone(zi).homes) {
        const gy = this.game.terrain.surfaceY(h.x);
        if (this.flat !== null && gy < this.level(h.x) + 30) continue;
        for (let k = 0; k < h.n; k++) {
          const kind = h.kind || RESIDENTS[Math.floor(Math.random() * RESIDENTS.length)];
          this.fish.push({
            kind, x: h.x + (Math.random() - 0.5) * h.r, y: gy - 10 - Math.random() * h.up,
            dir: Math.random() < 0.5 ? -1 : 1, s: 0.85 + Math.random() * 0.25, sp: kind === 'clown' ? 9 : 11 + Math.random() * 6,
            ph: Math.random() * 8, ty: null, turnT: Math.random() * 2, flee: 0, flip: 0, home: { ...h, zi },
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    this.budget = this.t < 1.5 ? 40 : 6;
    if (this.lapse) this.flat = this.lapse.level;
    if (this.draining) {
      this.drain = Math.min(1, this.drain + dt / DRAIN_SECS);
      this.yearShow = 1;
      if (this.drain >= 1) { this.draining = false; this.on = false; }
    }
    const cam = this.game.cam;
    const b = cam.bounds(260);
    const wet = this.wet;
    const T = this.game.terrain;

    // the whales: they do not react to you and they do not turn round. They
    // cross, and while they are crossing nothing else in the frame matters.
    for (const wh of this.whales) {
      wh.x += wh.dir * wh.sp * dt;
      wh.ph += dt * 0.45;
      wh.y += Math.sin(wh.ph * 0.6) * 3 * dt;
      if (wh.x > b.x1 + 2600 && !wh.left) {
        wh.x = b.x0 - 2600;
        const t2 = this.level(wh.x), g2 = T.surfaceY(wh.x);
        wh.y = t2 + (g2 - t2) * (0.2 + Math.random() * 0.2);
      }
      const t2 = this.level(wh.x), g2 = T.surfaceY(wh.x);
      wh.y = clamp(wh.y, t2 + 26, g2 - 60);
    }
    // the sharks patrol: they run, they lean into a turn, and they come back
    for (const sh of this.sharks) {
      sh.x += sh.dir * sh.sp * dt;
      sh.ph += dt * 1.4;
      sh.turn -= dt;
      if (!sh.left && (sh.turn <= 0 || sh.x < b.x0 - 900 || sh.x > b.x1 + 900)) {
        sh.dir *= -1;
        sh.turn = 9 + Math.random() * 8;
        const t2 = this.level(sh.x), g2 = T.surfaceY(sh.x);
        sh.y = t2 + (g2 - t2) * (0.38 + Math.random() * 0.36);
      }
      sh.y += Math.sin(sh.ph * 0.33) * 5 * dt;
      const t3 = this.level(sh.x), g3 = T.surfaceY(sh.x);
      sh.y = clamp(sh.y, t3 + 30, g3 - 20);
    }
    // marine snow, falling for ever
    for (const sn of this.snow) {
      sn.y += sn.v * dt;
      sn.ph += dt * 0.6;
      if (sn.y > T.surfaceY(sn.x) - 2 || sn.x < b.x0 - 100 || sn.x > b.x1 + 100) {
        sn.x = b.x0 + Math.random() * (b.x1 - b.x0);
        sn.y = this.level(sn.x) + Math.random() * 120;
      }
    }
    this._updateSchools(dt, b);
    for (const m of this.mantas) {
      m.x += m.dir * m.sp * dt;
      m.ph += dt * 0.5;
      const [t2, g2] = this._band(m.x);
      m.y = clamp(m.y + Math.sin(m.ph * 0.7) * 4 * dt, t2 + 30, g2 - 60);
      if (!m.left && (m.x < b.x0 - 1200 || m.x > b.x1 + 1200)) { m.dir *= -1; m.x = clamp(m.x, b.x0 - 1180, b.x1 + 1180); }
    }
    for (const tu of this.turtles) {
      tu.x += tu.dir * tu.sp * dt;
      tu.ph += dt * 0.3;
      tu.bob += dt * 0.6;
      const [t2, g2] = this._band(tu.x);
      tu.y = clamp(tu.y + Math.sin(tu.bob) * 3 * dt, t2 + 30, g2 - 30);
      if (!tu.left && (tu.x < b.x0 - 900 || tu.x > b.x1 + 900)) { tu.dir *= -1; tu.x = clamp(tu.x, b.x0 - 880, b.x1 + 880); }
    }
    for (const gi of this.giants) {
      gi.ph += dt * 0.35;
      if (gi.wait > 0) { gi.wait -= dt; continue; }
      gi.px += gi.dir * gi.sp * dt;
      if (gi.px > 1600 || gi.px < -1600) { gi.dir *= -1; gi.wait = 40 + Math.random() * 40; gi.y = 0.3 + Math.random() * 0.15; }
    }
    if (wet < 0.3) { this.schools.length = 0; this.mantas.length = 0; this.turtles.length = 0; this.giants.length = 0; }

    if (this.lapse) this._lapseLife(dt, b);
    this._updateHomes(b);
    this._updateFish(dt, b, wet);

    for (const j of this.jellies) {
      j.ph += dt * j.sp * 1.6;
      // a jelly rises on the stroke and sinks between them
      j.y += (Math.sin(j.ph) > 0.2 ? -9 : 3) * dt;
      j.x += j.drift * dt;
      const [t2, g2] = this._band(j.x);
      if (j.y < t2 + 20) j.y = g2 - 40;
      if (j.y > g2 - 20) j.y = g2 - 20;
      if (j.x < b.x0 - 600) j.x = b.x1 + 400; else if (j.x > b.x1 + 600) j.x = b.x0 - 400;
    }

    // bubbles come up out of the sand, and off you
    if (wet > 0.2 && Math.random() < dt * 2.5) {
      const x = lerp(b.x0, b.x1, Math.random());
      const n = 2 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        this.bubbles.push({ x: x + (Math.random() - 0.5) * 3, y: T.surfaceY(x) - 2 + k * 5, r: 0.5 + Math.random() * 0.9,
          sp: 14 + Math.random() * 14, ph: Math.random() * TAU, t: 0 });
      }
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const u = this.bubbles[i];
      u.t += dt;
      u.y -= u.sp * dt;
      u.x += Math.sin(u.t * 3 + u.ph) * 6 * dt;
      if (u.y < this.level(u.x) + 2 || u.t > 14) this.bubbles.splice(i, 1);
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
  //
  // The bed is laid out a stretch at a time, the same deterministic way the
  // dig sites are, and each stretch is one thing: a rock with its reef, a
  // coral garden, open sand, a seagrass meadow or a kelp forest. That is what
  // stops it being an even smear of everything.

  _zone(zi) {
    let c = this.cells.get(zi);
    if (c) return c;
    const rng = mulberry32(hashStr('reef2:' + zi));
    const items = [], homes = [];
    const x0 = zi * ZONE;
    const at = (lo, hi) => x0 + ZONE * lerp(lo, hi, rng());
    const r = rng();
    const kind = zi === 0 ? 'garden' : r < 0.3 ? 'rocks' : r < 0.5 ? 'garden' : r < 0.7 ? 'sand' : r < 0.86 ? 'meadow' : 'kelp';
    const small = (x, far, S = 1.2 + rng() * 0.5, k) => items.push({
      x, kind: 'small', what: k || REEF_KINDS[Math.floor(rng() * REEF_KINDS.length)], S: Math.round(S * 4) / 4,
      seed: Math.floor(rng() * 12), flip: rng() < 0.5, far });
    const floor = (x) => items.push({ x, kind: 'small', what: FLOOR_KINDS[Math.floor(rng() * FLOOR_KINDS.length)],
      S: 1.25, seed: Math.floor(rng() * 12), flip: rng() < 0.5, far: rng() < 0.5 });
    const grass = (x, far) => items.push({ x, kind: 'grass', v: Math.floor(rng() * 6), ph: rng() * 8, s: 1 + rng() * 0.5, flip: rng() < 0.5, far });
    if (kind === 'rocks') {
      const fx = at(0.3, 0.7);
      const fk = FORMATIONS[Math.floor(rng() * FORMATIONS.length)];
      items.push({ x: fx, kind: 'form', what: fk, seed: Math.floor(rng() * 6), flip: rng() < 0.5, far: true });
      for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) small(fx + (rng() - 0.5) * 160, rng() < 0.7);
      if (rng() < 0.4) { const ax = fx + (rng() < 0.5 ? -1 : 1) * (70 + rng() * 30); items.push({ x: ax, kind: 'anem', seed: Math.floor(rng() * 6), far: true }); homes.push({ x: ax, r: 10, up: 14, n: 2, kind: 'clown' }); }
      homes.push({ x: fx, r: 60, up: 70, n: 2 + Math.floor(rng() * 2) });
      if (rng() < 0.5) floor(at(0, 1));
    } else if (kind === 'garden') {
      const n = 4 + Math.floor(rng() * 4);
      for (let k = 0; k < n; k++) small(at(0.1, 0.9), rng() < 0.75);
      if (rng() < 0.6) items.push({ x: at(0.2, 0.8), kind: 'form', what: 'outcrop', seed: Math.floor(rng() * 6), flip: rng() < 0.5, far: true });
      const ax = at(0.2, 0.8);
      items.push({ x: ax, kind: 'anem', seed: Math.floor(rng() * 6), far: true });
      homes.push({ x: ax, r: 10, up: 14, n: 2, kind: 'clown' });
      homes.push({ x: at(0.3, 0.7), r: 90, up: 50, n: 2 + Math.floor(rng() * 2) });
      for (let k = 0; k < 3; k++) grass(at(0, 1), rng() < 0.5);
      floor(at(0, 1));
    } else if (kind === 'sand') {
      for (let k = 0; k < 2 + Math.floor(rng() * 3); k++) floor(at(0, 1));
      for (let k = 0; k < 2; k++) grass(at(0, 1), true);
      if (rng() < 0.35) small(at(0.2, 0.8), true);
    } else if (kind === 'meadow') {
      const a = rng() * 0.3, w = 0.5 + rng() * 0.2;
      for (let k = 0; k < 22; k++) grass(at(a, a + w), rng() < 0.6);
      floor(at(0, 1));
      if (rng() < 0.4) homes.push({ x: at(0.3, 0.7), r: 90, up: 30, n: 1, kind: 'parrot' });
    } else {
      const c0 = at(0.2, 0.6), n = 5 + Math.floor(rng() * 6);
      for (let k = 0; k < n; k++) {
        items.push({ x: c0 + k * (14 + rng() * 14), kind: 'kelp', h: 90 + rng() * 120, seed: Math.floor(rng() * 999), ph: rng() * TAU, far: rng() < 0.75 });
      }
      for (let k = 0; k < 5; k++) grass(c0 + rng() * n * 20, rng() < 0.5);
      homes.push({ x: c0 + n * 10, r: 80, up: 90, n: 1 + Math.floor(rng() * 2) });
    }
    c = { kind, items, homes };
    this.cells.set(zi, c);
    if (this.cells.size > 120) this.cells.clear();
    return c;
  }

  near(x0, x1) {
    const out = [];
    for (let zi = Math.floor((x0 - 200) / ZONE); zi <= Math.floor((x1 + 200) / ZONE); zi++) {
      for (const it of this._zone(zi).items) if (it.x >= x0 - 160 && it.x <= x1 + 160) out.push(it);
    }
    return out;
  }

  /** The ground under something wide: its lowest point, so it never floats. */
  _foot(x, half) {
    const T = this.game.terrain;
    return Math.max(T.surfaceY(x - half), T.surfaceY(x), T.surfaceY(x + half));
  }

  // -- the water itself ------------------------------------------------------

  _surfY(cam) { return cam.worldToScreen(cam.x, this.level(cam.x)).y; }
  _bedY(cam) {
    const T = this.game.terrain;
    let g = 0;
    for (let k = -2; k <= 2; k++) g += T.surfaceY(cam.x + k * 120);
    return cam.worldToScreen(cam.x, g / 5).y;
  }

  /** The open water, painted into its own frame-sized canvas when it moves. */
  _column(cam, vw, vh) {
    if (!this._col || this._col.width !== vw || this._col.height !== vh) {
      this._col = document.createElement('canvas');
      this._col.width = vw; this._col.height = vh;
      this._colKey = '';
    }
    const surfY = Math.round(this._surfY(cam));
    const key = `${surfY}:${cam.zoom.toFixed(3)}`;
    if (key !== this._colKey) {
      const g = this._col.getContext('2d');
      g.clearRect(0, 0, vw, vh);
      paintWater(g, vw, vh, surfY, cam.zoom);
      this._colKey = key;
    }
    return this._col;
  }

  /**
   * The column: everything above the seabed is water, so the desert sky and
   * the far dunes are painted out of the frame entirely. This happens before
   * the reef and the animal are drawn, because they are in the water, not
   * behind it - which is the whole difference between a sea and a blue filter.
   */
  drawColumn(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.01) return;
    const z = cam.zoom;
    const col = this._column(cam, vw, vh);
    const surfY = this._surfY(cam);
    const solid = this.flat === null;
    const top = solid ? 0 : clamp(Math.round(surfY), 0, vh);
    const t = this.t;
    ctx.save();
    if (!solid) { ctx.beginPath(); ctx.rect(0, top, vw, vh - top); ctx.clip(); }
    ctx.globalAlpha = wet;
    ctx.drawImage(col, 0, 0);
    // the underside of the surface, when it is in shot
    if (solid && surfY > -16) this._drawCeiling(ctx, vw, surfY, wet);

    const bedY = this._bedY(cam);
    // nothing in the far blue stands up out of the sea
    if (solid && surfY > 0) { ctx.save(); ctx.beginPath(); ctx.rect(0, Math.round(surfY) + 2, vw, vh); ctx.clip(); }
    const rank = (i) => {
      const r = rankTile(i);
      const base = Math.round(vh / 2 + (bedY - vh / 2) * r.pv + r.lift);
      const y0 = base - r.H;
      if (y0 > vh) return;
      const off = ((Math.round(cam.x * r.p * 1.4) % r.W) + r.W) % r.W;
      ctx.globalAlpha = wet;
      for (let x = -off; x < vw; x += r.W) ctx.drawImage(r.cv, x, y0);
      if (base < vh) { ctx.fillStyle = r.foot; ctx.fillRect(0, base, vw, vh - base); }
    };
    const haze = (a) => { ctx.globalAlpha = wet * a; ctx.drawImage(col, 0, 0); };
    rank(0);
    rank(1);
    haze(0.38);
    this._drawRays(ctx, vw, vh, surfY, wet, 0.7, 0.18);
    this._drawGiants(ctx, cam, vw, vh, bedY, wet);
    rank(2);
    haze(0.22);
    rank(3);
    haze(0.08);
    // the whales are a long way up and in front of all of it, but washed
    // well into the water: a hundred feet of animal is mostly blue
    this._drawWhales(ctx, cam, vw, vh, wet);
    this._drawRays(ctx, vw, vh, surfY, wet, 0.45, 0.32);
    if (solid && surfY > 0) ctx.restore();
    ctx.restore();
    if (this.lapse) this._drawSurface(ctx, cam, vw, vh, wet);
  }

  /**
   * The surface, seen from the side and from above it: a bright lit edge
   * with the swell on it, a darker line just under that, and white where it
   * runs up onto the sand. Only where there is water under it - this is what
   * walks down the frame in the timelapse, and it should read as the sea's
   * edge, not as a line ruled across the picture.
   */
  _drawSurface(ctx, cam, vw, vh, wet) {
    const T = this.game.terrain;
    const z = cam.zoom;
    const L = this.lapse.level;
    const p = Math.max(1, Math.round(z));
    const step = 2;
    ctx.save();
    for (let sx = 0; sx < vw; sx += step) {
      const wx = cam.screenToWorld(sx, 0).x;
      const swell = Math.sin(wx * 0.011 + this.t * 1.3) * 1.6 + Math.sin(wx * 0.031 - this.t * 2.1) * 0.7;
      const wy = L + swell;
      const gy = T.surfaceY(wx);
      if (gy < wy - 1) continue;
      const sy = Math.round(cam.worldToScreen(wx, wy).y);
      if (sy < -2 || sy > vh) continue;
      const lit = 0.5 + 0.5 * Math.sin(wx * 0.07 + this.t * 2.6);
      ctx.globalAlpha = wet * (0.55 + lit * 0.4);
      ctx.fillStyle = '#e8fbff';
      ctx.fillRect(sx, sy, step, p);
      ctx.globalAlpha = wet * 0.5;
      ctx.fillStyle = '#2d8fb0';
      ctx.fillRect(sx, sy + p, step, p);
      // the shore: where the bed comes up to meet it, it breaks white
      const shallow = clamp01(1 - (gy - wy) / 22);
      if (shallow > 0.05 && Math.sin(wx * 0.13 + this.t * 3.4) > -0.2) {
        ctx.globalAlpha = wet * 0.75 * shallow;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx, sy - p, step, p * 2);
      }
    }
    ctx.restore();
  }

  /** Shafts of light from the surface, swaying, drawn additively. */
  _drawRays(ctx, vw, vh, surfY, wet, k, p) {
    const sy = Math.max(-40, Math.round(surfY) - 4);
    if (sy > vh) return;
    // deeper down, the light that gets this far is weaker
    const depthK = clamp01(1 - (-surfY) / (vh * 3));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = 5;
    const span = vw + 240;
    for (let i = 0; i < n; i++) {
      const r = raySprite((i + Math.round(k * 10)) % RAY_KINDS);
      const ph = i * 2.1 + k * 5;
      let x = (i / n) * span + Math.sin(this.t * 0.12 + ph) * 22 - this.game.cam.x * p * 0.6;
      x = ((x % span) + span) % span - 160;
      const a = (0.12 + 0.1 * (0.5 + 0.5 * Math.sin(this.t * 0.35 + ph))) * wet * k * (0.45 + depthK * 0.55);
      ctx.globalAlpha = a;
      ctx.drawImage(r.cv, Math.round(x), sy);
    }
    ctx.restore();
  }

  /**
   * Looking up at the surface from under it: past the bright line the water
   * is a mirror, and what it mirrors is wave after wave of itself.
   */
  _drawCeiling(ctx, vw, surfY, wet) {
    const f = Math.floor(this.t * 5) % SURF_FRAMES;
    const m = mirrorTile(f), s = surfaceStrip(f);
    const sy = Math.round(surfY);
    const off = ((Math.round(this.game.cam.x * 0.4) % m.W) + m.W) % m.W;
    ctx.globalAlpha = wet;
    if (sy - m.H > 0) { ctx.fillStyle = m.top; ctx.fillRect(0, 0, vw, sy - m.H); }
    for (let x = -off; x < vw; x += m.W) ctx.drawImage(m.cv, x, sy - m.H);
    for (let x = -off; x < vw; x += s.W) ctx.drawImage(s.cv, x, sy - s.line);
  }

  /** The giants: a whale shark crossing the far blue between the ranks. */
  _drawGiants(ctx, cam, vw, vh, bedY, wet) {
    for (const gi of this.giants) {
      if (gi.wait > 0) continue;
      const art = this._big('wshark:' + (Math.floor(gi.ph * 4) % WSHARK_FRAMES), () => whaleSharkArt(Math.floor(gi.ph * 4) % WSHARK_FRAMES));
      if (!art) continue;
      const x = Math.round(vw / 2 + gi.px);
      const y = Math.round(lerp(this._surfY(cam), bedY, gi.y));
      if (x + art.cv.width < 0 || x - art.cv.width > vw) continue;
      ctx.save();
      ctx.globalAlpha = wet * 0.7;
      ctx.translate(x, y);
      // painted nose-left, like the shark and the whale: mirror it to go right
      if (gi.dir > 0) ctx.scale(-1, 1);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
  }

  _drawWhales(ctx, cam, vw, vh, wet) {
    const z = cam.zoom;
    for (const wh of this.whales) {
      const s = cam.worldToScreen(wh.x, wh.y);
      const k = z * 0.95 * wh.s;
      if (s.x + 250 * k < -40 || s.x - 250 * k > vw + 40) continue;
      const S = qs(k, 0.05);
      const fr = Math.floor(wh.ph * 4) % WHALE_FRAMES;
      const art = this._big(`whale:${S}:${fr}`, () => whaleArt(S, fr));
      if (!art) continue;
      const sc = k / S;
      ctx.save();
      ctx.globalAlpha = wet * 0.78;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      // the whale is painted facing left, so it is mirrored to swim right
      ctx.scale(sc * (wh.dir > 0 ? -1 : 1), sc);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
  }

  /**
   * The seabed. The ground under the sea is the desert's ground, but a
   * thousand years earlier it was pale sea sand; so it is painted again, a
   * chunk at a time against the terrain's own heights, wherever the water
   * covers it.
   */
  drawBed(ctx, cam, vw, vh) {
    // in the timelapse the whole bed is painted, wet or dry, and dries out
    // (fades back to the desert under it) on its own clock
    const wet = this.lapse ? this.lapse.bed : this.wet;
    if (wet <= 0.02) return;
    const T = this.game.terrain;
    const z = cam.zoom;
    const b = cam.bounds(10);
    const flat = this.lapse ? null : this.flat;
    // Chunks overlap by a pixel so they never leave a gap, which is fine
    // opaque and a ladder of seams half see-through. A bed that is fading is
    // laid down whole first and faded as one.
    const out = ctx;
    let sc = null;
    if (wet < 0.995) {
      if (!this._bedCv || this._bedCv.width !== vw || this._bedCv.height !== vh) {
        this._bedCv = document.createElement('canvas');
        this._bedCv.width = vw; this._bedCv.height = vh;
      }
      sc = this._bedCv;
      ctx = sc.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, vw, vh);
    }
    ctx.save();
    ctx.globalAlpha = sc ? 1 : wet;
    for (let ci = Math.floor(b.x0 / BED_W); ci <= Math.floor(b.x1 / BED_W); ci++) {
      const key = `${ci}:${flat === null ? 'p' : Math.round(flat)}`;
      let c = this.beds.get(key);
      if (c === undefined) {
        if (!this._can() && this.beds.size) continue;
        const x0 = ci * BED_W;
        c = this._spend(() => paintBedChunk(x0, (x) => {
          const y = T.baseY(x);
          return flat !== null && y < flat + 2 ? null : y;
        }));
        this.beds.set(key, c);
        if (this.beds.size > 40) this.beds.delete(this.beds.keys().next().value);
      }
      if (!c) continue;
      const s = cam.worldToScreen(c.x0, c.y0);
      const sx = Math.floor(s.x), sy = Math.round(s.y);
      const w = Math.ceil((c.x0 + BED_W) * z - c.x0 * z) + 1;
      const h = Math.ceil(c.H * z);
      ctx.drawImage(c.cv, sx, sy, w, h);
      if (sy + h < vh) { ctx.fillStyle = BED_FILL; ctx.fillRect(sx, sy + h - 1, w, vh - sy - h + 1); }
    }
    // dents in the sand you made, which the baked bed does not know about
    if (T.sand && T.sand.size) {
      ctx.fillStyle = 'rgba(40,52,60,0.45)';
      for (const [i, d] of T.sand) {
        if (d < 0.6) continue;
        const wx = i * 4;
        if (wx < b.x0 || wx > b.x1) continue;
        const s = cam.worldToScreen(wx, T.baseY(wx));
        ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.ceil(4 * z), Math.ceil(d * z) + 1);
      }
    }
    ctx.restore();
    if (sc) {
      out.save();
      out.globalAlpha = wet;
      out.drawImage(sc, 0, 0);
      out.restore();
    }
  }

  /**
   * The middle distance: the sharks, the manta and the turtle. They go in
   * behind the reef on the bottom; everything on the bottom is in front.
   */
  drawDeep(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const z = cam.zoom;
    ctx.save();
    if (this.flat !== null) { const top = Math.max(0, Math.round(this._surfY(cam))); ctx.beginPath(); ctx.rect(0, top, vw, vh - top); ctx.clip(); }
    const blit = (art, x, y, k, S, flip, a) => {
      ctx.globalAlpha = a;
      ctx.translate(Math.round(x), Math.round(y));
      const sc = k / S;
      ctx.scale(sc * (flip ? -1 : 1), sc);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };
    for (const sh of this.sharks) {
      const s = cam.worldToScreen(sh.x, sh.y);
      const k = z * 0.9 * sh.s;
      if (s.x < -160 * k || s.x > vw + 160 * k) continue;
      const S = qs(k, 0.1), fr = Math.floor(sh.ph * 1.3) % SHARK_FRAMES;
      const art = this._big(`shark:${S}:${fr}`, () => sharkArt(S, fr));
      // Painted nose-left (see paintShark: the head is at x0). Flipping it
      // when it swam LEFT is what had every shark in the sea going tail first.
      if (art) blit(art, s.x, s.y, k, S, sh.dir > 0, wet * 0.95);
    }
    for (const m of this.mantas) {
      const s = cam.worldToScreen(m.x, m.y);
      const k = z * 1.1;
      if (s.x < -140 || s.x > vw + 140) continue;
      const S = qs(k, 0.125), fr = Math.floor(m.ph * MANTA_FRAMES) % MANTA_FRAMES;
      const art = this._big(`manta:${S}:${fr}`, () => mantaArt(fr, S));
      if (art) blit(art, s.x, s.y, k, S, m.dir > 0, wet * 0.92);
    }
    for (const tu of this.turtles) {
      const s = cam.worldToScreen(tu.x, tu.y);
      const k = z * 1.25;
      if (s.x < -120 || s.x > vw + 120) continue;
      const S = qs(k, 0.125), fr = Math.floor(tu.ph * TURTLE_FRAMES) % TURTLE_FRAMES;
      const art = this._big(`turtle:${S}:${fr}`, () => turtleArt(fr, S));
      if (art) blit(art, s.x, s.y, k, S, tu.dir > 0, wet);
    }
    ctx.restore();
  }

  /** Everything growing on the bottom. `far` is the layer behind the animal. */
  drawReef(ctx, cam, far) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const b = cam.bounds(60);
    const z = cam.zoom;
    const T = this.game.terrain;
    const L = this.lapse;
    const bleach0 = L ? L.bleach : clamp01(this.drain * 2.4);
    const r = this.game.renderer;
    // In the timelapse the reef is drawn whether or not the water still
    // covers it: it does not vanish when the surface goes past, it bleaches
    // where it is left standing in the air and then slumps into the sand.
    const vis = L ? 1 : wet;
    ctx.save();
    if (this.flat !== null && !L) { const top = Math.max(0, Math.round(this._surfY(cam))); ctx.beginPath(); ctx.rect(0, top, r.vw, r.vh - top); ctx.clip(); }
    const items = this.near(b.x0, b.x1);
    for (const it of items) {
      if (!!it.far !== far) continue;
      const lvl = L ? null : this.flat;
      const dry = L ? this._dry(it.x) : 0;
      const bleach = Math.max(bleach0, dry);
      // how far it has fallen down: the general die-back, and sooner where dry
      const fall = L ? clamp01(Math.max(L.collapse, dry * 1.4 - 0.5)) : 0;
      if (fall >= 0.98) continue;
      if (it.kind === 'kelp') { this._drawKelp(ctx, cam, it, vis * (1 - fall), bleach, fall); continue; }
      if (it.kind === 'grass') {
        const y = T.surfaceY(it.x);
        if (lvl !== null && y < lvl + 4) continue;
        const fr = Math.floor(this.t * 2.2 + it.ph) % GRASS_FRAMES;
        const g = grassClump(it.v, fr);
        const s = cam.worldToScreen(it.x, y);
        const k = z * it.s;
        ctx.globalAlpha = vis * (1 - bleach * 0.6) * (1 - fall);
        ctx.setTransform(k * (it.flip ? -1 : 1), 0, 0, k * (1 - fall * 0.85), Math.round(s.x), Math.round(s.y) + 1);
        ctx.drawImage(g.cv, -g.ox, -g.oy);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        continue;
      }
      let art;
      let half = 6;
      if (it.kind === 'form') {
        const key = `form:${it.what}:${it.seed}`;
        art = this._big(key, () => formationArt(it.what, it.seed));
        if (art) half = art.w * 0.3;
      } else if (it.kind === 'anem') {
        const fr = Math.floor(this.t * 3 + it.seed) % ANEMONE_FRAMES;
        art = this._big(`anem:${it.seed}:${fr}`, () => anemoneArt(it.seed, fr, 1.2));
      } else {
        art = this._big(`small:${it.what}:${it.S}:${it.seed}`, () => reefArt(it.what, it.S, it.seed));
      }
      if (!art) continue;
      const y = it.kind === 'form' ? this._foot(it.x, half) : T.surfaceY(it.x);
      // a standing sea has a shoreline, and coral does not grow past it
      if (lvl !== null && T.surfaceY(it.x) < lvl + 6) continue;
      const s = cam.worldToScreen(it.x, y);
      const fx = it.flip ? -1 : 1;
      const ox = Math.round(s.x), oy = Math.round(s.y) + 1;
      // rock does not slump the way coral does: it goes grey and the sand
      // comes up round it
      const sag = it.kind === 'form' ? fall * 0.5 : fall;
      const fade = it.kind === 'form' ? 1 - fall : 1 - fall * 0.7;
      ctx.globalAlpha = vis * fade;
      ctx.setTransform(z * fx, 0, 0, z * (1 - sag * 0.8), ox, oy);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      if (bleach > 0.01 && art.bleach) {
        ctx.globalAlpha = vis * fade * bleach * 0.85;
        ctx.drawImage(art.bleach, -art.ox, -art.oy);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (art.top && wet > 0.3 && dry < 0.2) this._causticOn(ctx, cam, art, ox, oy, fx, wet);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** The caustic web crawling over the lit top of a rock. */
  _causticOn(ctx, cam, art, ox, oy, fx, wet) {
    const z = cam.zoom;
    const w = Math.ceil(art.cv.width * z), h = Math.ceil(art.cv.height * z);
    if (!this._scratch) this._scratch = document.createElement('canvas');
    const sc = this._scratch;
    if (sc.width < w || sc.height < h) { sc.width = Math.max(sc.width, w); sc.height = Math.max(sc.height, h); }
    const g = sc.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.setTransform(z * fx, 0, 0, z, fx < 0 ? w : 0, 0);
    g.drawImage(art.top, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    const tile = causticFrame(this.t);
    const left = ox - (fx < 0 ? w - art.ox * z : art.ox * z);
    const topY = oy - art.oy * z;
    const T = CTILE * Math.max(1, Math.round(z * 0.9));
    const wx = cam.screenToWorld(left, topY);
    const offX = ((-wx.x * z) % T + T) % T, offY = ((-wx.y * z) % T + T) % T;
    for (let y = offY - T; y < h; y += T) for (let x = offX - T; x < w; x += T) g.drawImage(tile, Math.round(x), Math.round(y), T, T);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = wet * 0.5;
    ctx.drawImage(sc, 0, 0, w, h, Math.round(left), Math.round(topY), w, h);
    ctx.restore();
  }

  /** A strand of kelp, a joint at a time, each joint shifted by the swell. */
  _drawKelp(ctx, cam, it, wet, bleach, fall = 0) {
    const T = this.game.terrain;
    const z = cam.zoom;
    const y0 = T.surfaceY(it.x);
    if (this.flat !== null && !this.lapse && y0 < this.flat + 10) return;
    // out of the water a kelp forest cannot stand up: it lies down
    const n = Math.max(1, Math.round(it.h / KELP_JOINT * (1 - fall * 0.9)));
    const base = cam.worldToScreen(it.x, y0);
    ctx.globalAlpha = wet * (1 - bleach * 0.7);
    let px = 0;
    for (let k = 0; k < n; k++) {
      const f = k / n;
      const sway = (Math.sin(this.t * 0.7 + it.ph + f * 2.4) * (1.5 + 10 * f * f) + Math.sin(this.t * 0.29 + it.ph * 1.7) * 5 * f);
      const j = kelpJoint((it.seed + k * 7) % 6, (k + it.seed) % 2 ? 1 : -1);
      px = sway;
      ctx.setTransform(z, 0, 0, z, Math.round(base.x + px * z), Math.round(base.y - k * KELP_JOINT * z));
      ctx.drawImage(j.cv, -j.ox, -j.oy);
    }
    const c = kelpCrown(it.seed % 3);
    ctx.setTransform(z, 0, 0, z, Math.round(base.x + px * z), Math.round(base.y - n * KELP_JOINT * z));
    ctx.drawImage(c.cv, -c.ox, -c.oy);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** The swimmers, and the bubbles going up past them. */
  drawSwimmers(ctx, cam) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const vw = this.game.renderer.vw, vh = this.game.renderer.vh;
    const ceil = this.flat === null ? -1e9 : this.flat + 4;
    const z = cam.zoom;
    ctx.save();
    for (const f of this.fish) {
      if (f.y < ceil) continue;
      const s = cam.worldToScreen(f.x, f.y);
      if (s.x < -80 || s.x > vw + 80 || s.y < -40 || s.y > vh + 40) continue;
      const S = qs(z * f.s);
      const art = this._fishArt(f.kind, Math.floor(f.ph) % SWIM_FRAMES, S);
      if (!art) continue;
      // a turn is a quick squash through edge-on, not a mirror flip
      const sx = f.flip > 0 ? Math.max(0.15, Math.abs(1 - 2 * f.flip)) : 1;
      ctx.globalAlpha = wet;
      ctx.setTransform(f.dir * sx, 0, 0, 1, Math.round(s.x), Math.round(s.y));
      ctx.drawImage(art.cv, -art.ox, -art.oy);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // the bait balls, which glint as they turn
    for (const sc of this.schools) {
      const S = qs(z * 0.85);
      for (const f of sc.m) {
        if (f.y < ceil) continue;
        const s = cam.worldToScreen(f.x, f.y);
        if (s.x < -20 || s.x > vw + 20) continue;
        const art = this._fishArt(sc.kind, (Math.floor(f.ph) % 4) * 2, S);
        if (!art) continue;
        ctx.globalAlpha = wet;
        ctx.setTransform(f.dir, 0, 0, 1, Math.round(s.x), Math.round(s.y));
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        // the flash of a flank catching the light
        const glint = f.flash > 0 ? 0.8 : Math.sin(this.t * 2.2 + f.x * 0.05 + f.y * 0.03) > 0.93 ? 0.5 : 0;
        if (glint) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = wet * glint;
          ctx.drawImage(art.cv, -art.ox, -art.oy);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const j of this.jellies) {
      const s = cam.worldToScreen(j.x, j.y);
      if (s.x < -60 || s.x > vw + 60) continue;
      const S = qs(z * j.s, 0.25);
      const fr = Math.floor(((j.ph / TAU) % 1 + 1) % 1 * JELLY_FRAMES);
      const art = this._big(`jelly:${S}:${fr}`, () => jellyArt(S, fr));
      if (!art) continue;
      ctx.globalAlpha = wet * 0.62;
      ctx.drawImage(art.cv, Math.round(s.x - art.ox), Math.round(s.y - art.oy));
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = wet * 0.22;
      ctx.drawImage(art.cv, Math.round(s.x - art.ox), Math.round(s.y - art.oy));
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const u of this.bubbles) {
      const s = cam.worldToScreen(u.x, u.y);
      const r = Math.max(1, u.r * z);
      ctx.globalAlpha = wet * 0.6;
      pxRing(ctx, s.x, s.y, r, r, '#e4f9ff', { p: 1, thick: 1 });
      ctx.globalAlpha = wet * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(s.x - r * 0.4), Math.round(s.y - r * 0.5), 1, 1);
    }
    // marine snow, drifting down through all of it
    ctx.fillStyle = '#d6f2f8';
    for (const sn of this.snow) {
      const s = cam.worldToScreen(sn.x + Math.sin(sn.ph) * 4, sn.y);
      if (s.x < 0 || s.x > vw || s.y < 0 || s.y > vh) continue;
      ctx.globalAlpha = wet * sn.a * 0.6;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sn.r, sn.r);
    }
    ctx.restore();
  }

  /**
   * The front of the frame: dark, out-of-focus rock and weed across the
   * bottom corners, so the shot has a foreground and the reef has a near side.
   */
  drawForeground(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.3) return;
    const px = cam.x * cam.zoom * 1.5;
    const spacing = 300;
    const first = Math.floor((px - 200) / spacing), last = Math.ceil((px + vw + 200) / spacing);
    ctx.save();
    ctx.globalAlpha = wet * 0.95;
    for (let i = first; i <= last; i++) {
      const h1 = Math.sin(i * 78.233 + 4.1) * 43758.5453;
      const r = h1 - Math.floor(h1);
      if (r < 0.5) continue;
      const cv = foreShape(Math.floor(r * 1000) % FORE_KINDS);
      const x = Math.round(i * spacing + r * 120 - px);
      ctx.drawImage(cv, x - (cv.width >> 1), vh - Math.round(cv.height * (0.55 + r * 0.3)));
    }
    ctx.restore();
  }

  /**
   * On top of the lit frame: a little silt drifting close to the lens, and -
   * while the sea is leaving - the years.
   */
  overlay(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.01) return;
    // silt, hanging close to the lens
    for (let i = 0; i < 40; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453;
      const h2 = Math.sin(i * 78.233) * 43758.5453;
      const px = (((h1 - Math.floor(h1)) * vw - cam.x * cam.zoom * 1.3 - this.t * 3) % vw + vw) % vw;
      const py = (((h2 - Math.floor(h2)) * vh + this.t * 4 - cam.y * cam.zoom * 1.3) % vh + vh) % vh;
      if (this.flat !== null && py < this._surfY(cam)) continue;
      ctx.globalAlpha = wet * (0.08 + 0.14 * (0.5 + 0.5 * Math.sin(this.t * 1.4 + i)));
      ctx.fillStyle = i % 5 === 0 ? '#f0fcff' : '#b4dce8';
      ctx.fillRect(Math.round(px), Math.round(py), i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    // the years, while the sea is leaving
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
  }
}
