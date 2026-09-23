// CRABDEN - the capped springs, and the things standing over them.
//
// The water did not all leave. Some of it is still down there, under pressure,
// and the people who were here before you knew exactly where: they found the
// vents, and they CAPPED them - a collar of cut stone over the mouth and a
// plug driven into it - because a spring you can turn on is worth more than a
// spring that runs. Then they died, and the caps stayed shut, and the basin
// went to sand with the water sitting underneath it the whole time.
//
// So: find a cap, break it, and what comes out does not stop. It floods, the
// ground drinks it, and everything that has been waiting a thousand years for
// exactly that comes up at once. It is the largest thing you can do to this
// world and it is permanent.
//
// Naturally they are guarded. Not by anything the humans left - by something
// that moved in afterwards and has been walking the same eleven kilometres
// ever since, and does not like new arrivals. You do not get the water until
// you deal with the animal, and that is the whole shape of the thing: a fight
// you have to win for a reward that changes the map.

import { clamp, clamp01, lerp, mulberry32, hashStr, TAU } from '../lib/math.js';
import { Painter, makeCanvas } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { biomeAt } from '../world/biomes.js';

const CELL = 5200;            // one capped vent per this much desert
const CAP_HP = 5;             // how many good hits the plug takes
const FLOOD_SECS = 26;        // how long the flood runs before it settles
const REACH = 34;             // how close you have to be to swing at it
const GUARD_WAKE = 300;       // how far off the guardian notices you

const cache = new Map();
let cacheSeed = null;

/** The vent that belongs to this stretch, or null. */
export function ventAt(seed, ci) {
  if (seed !== cacheSeed) { cacheSeed = seed; cache.clear(); }
  let v = cache.get(ci);
  if (v !== undefined) return v;
  const r = mulberry32((hashStr(String(seed) + 'vent') ^ (ci * 1597334677)) >>> 0);
  if (ci === 0 || r() < 0.22) { cache.set(ci, null); return null; }
  const x = ci * CELL + CELL * (0.25 + r() * 0.5);
  const b = biomeAt(x);
  v = {
    id: 'vent' + ci, ci, x,
    size: 26 + r() * 14,
    seed: (hashStr(String(seed)) ^ (ci * 99991)) >>> 0,
    red: b.mesaMat === 'rockRed',
    guard: r() < 0.82 ? 'stonebasilisk' : 'ironback',
  };
  cache.set(ci, v);
  return v;
}

export function ventsNear(seed, x, radius = CELL) {
  const out = [];
  const c0 = Math.floor((x - radius) / CELL), c1 = Math.floor((x + radius) / CELL);
  for (let ci = c0; ci <= c1; ci++) {
    const v = ventAt(seed, ci);
    if (v && Math.abs(v.x - x) <= radius) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// art

const art = new Map();

/**
 * A collar of cut stone round a hole in the rock, with a plug in it. Human
 * work, and it looks it: the rock is weathered and the collar is not, because
 * one of them was shaped and one of them was not.
 */
function paintCap(v, broken) {
  const key = `${v.seed}:${v.size | 0}:${v.red ? 1 : 0}:${broken ? 1 : 0}`;
  let a = art.get(key);
  if (a) return a;
  const r = mulberry32(v.seed);
  const S = v.size;
  const W = Math.ceil(S * 2.6), H = Math.ceil(S * 1.9);
  const p = new Painter(W, H);
  const cx = W / 2, base = H - 2;
  const rock = v.red ? 'rockRed' : 'rock';

  // the outcrop it comes out of: lumps of native rock, unshaped
  for (let i = 0; i < 4; i++) {
    const ox = (r() - 0.5) * S * 1.5;
    p.ellipse(cx + ox, base - S * (0.10 + r() * 0.18), S * (0.45 + r() * 0.34),
      S * (0.30 + r() * 0.26), { mat: rock, dome: S * 0.34, tint: (r() - 0.5) * 0.16 });
  }
  p.grain(rock, { freq: 0.26, amp: 0.22, seed: v.seed & 511 });

  // the collar: three courses of dressed block, square where the rock is not
  const cw = S * 0.62, ch = S * 0.52;
  p.field(cx - cw, base - S * 0.42 - ch, cx + cw, base - S * 0.30, (x, y) => {
    const u = (x - (cx - cw)) / (cw * 2);
    const row = Math.floor((base - S * 0.30 - y) / (ch / 3));
    const off = (row & 1) ? cw * 0.34 : 0;
    const bx = ((x - cx + off + 999) % (cw * 0.68));
    const joint = bx < 1.0 || ((base - S * 0.30 - y) % (ch / 3)) < 1.0;
    return { h: joint ? 1.0 : 3.2, tint: joint ? -0.34 : 0.10 + Math.sin(row * 2.3 + u * 6) * 0.05 };
  }, { mat: 'bone' });

  // the mouth
  const my = base - S * 0.42 - ch * 0.42;
  if (broken) {
    // blown out: the plug is gone and the collar is cracked open
    p.ellipse(cx, my, S * 0.30, S * 0.20, { mat: 'bone', mask: true, dome: -S * 0.5, tint: -0.8 });
    for (let i = 0; i < 5; i++) {
      const a2 = -Math.PI * (0.15 + r() * 0.7);
      p.capsule(cx, my, cx + Math.cos(a2) * S * 0.62, my + Math.sin(a2) * S * 0.5,
        0.8, 0.4, { mat: 'bone', mask: true, dome: -1.4, tint: -0.55 });
    }
  } else {
    // the plug: a disc of a different, harder stone, with a lifting eye in it
    p.ellipse(cx, my, S * 0.32, S * 0.22, { mat: 'metal', dome: S * 0.26, tint: 0.06 });
    p.ellipse(cx, my - S * 0.06, S * 0.12, S * 0.08, { mat: 'metal', dome: -S * 0.1, tint: -0.42 });
    p.speckle('metal', { density: 0.07, amp: 0.5, seed: v.seed & 255 });
  }
  p.smoothHeight(1, 0.3);
  a = { cv: p.resolve(MATERIALS, { outline: 0.9, outlineColor: '#161010' }), ox: cx, oy: base, my: base - my };
  art.set(key, a);
  return a;
}

// ---------------------------------------------------------------------------

export class Fountains {
  constructor(game) {
    this.game = game;
    this.state = new Map();   // vent id -> { hp, broken, flood, guard }
    this.guards = new Map();  // vent id -> the creature standing over it
    this.t = 0;
  }

  get seed() { return this.game.world.seed; }

  _st(v) {
    let s = this.state.get(v.id);
    if (!s) { s = { hp: CAP_HP, broken: false, flood: 0, dead: false, solved: false }; this.state.set(v.id, s); }
    return s;
  }

  /** The vent close enough to swing at, or null. */
  reachable(x) {
    for (const v of ventsNear(this.seed, x, REACH * 2)) {
      if (Math.abs(v.x - x) < REACH) return v;
    }
    return null;
  }

  /**
   * One hit on a plug. It will not move at all while the thing guarding it is
   * still on its feet - that is not a rule about damage, it is a rule about
   * having your back to something that weighs a quarter of a tonne.
   */
  strike(v) {
    const s = this._st(v);
    const g = this.game;
    if (s.broken) return { ok: false, why: 'It is already open.' };
    const guard = this.guards.get(v.id);
    if (guard && guard.alive) {
      return { ok: false, why: 'Not with that thing behind you.' };
    }
    // and it will not move until the lock under the collar lets the water
    // through to the back of it
    if (!s.solved) return { ok: false, puzzle: true, level: this.solvedCount };
    s.hp -= 1;
    const y = g.terrain.surfaceY(v.x) - v.size * 0.6;
    g.cam.shake(3.5);
    g.audio?.play('hit', { pitch: 0.7 });
    g.fx?.spark(v.x, y, '#cfd8dc', 12, 40);
    if (s.hp > 0) {
      if (s.hp === 1) g.npc?.say('It is going. One more.', 3, 2);
      return { ok: true, hp: s.hp };
    }
    this._break(v, s);
    return { ok: true, broken: true };
  }

  _break(v, s) {
    const g = this.game;
    s.broken = true;
    s.flood = FLOOD_SECS;
    const y = g.terrain.surfaceY(v.x) - v.size * 0.6;
    g.cam.shake(9);
    g.audio?.play('splash');
    g.audio?.play('thunder');
    g.fx?.ring(v.x, y, '#9fe8ff', 30);
    for (let i = 0; i < 40; i++) g.fx?.spark(v.x, y, '#bfefff', 3, 120);
    g.npc?.yell('IT IS UNDER PRESSURE - GET BACK -', 3.4);
    g.ui?.say('The cap is off. It is coming up.', 4.5);
    g.quests?.flag?.('fountain');
  }

  /** The lock is open: the plug will take a hit now. */
  unlock(v) {
    const s = this._st(v);
    s.solved = true;
    this.game.npc?.say('That is it - hear it? The water is right behind the plug. Hit it.', 4.5, 3);
    this.game.ui?.say('The lock is open. Break the plug.', 3.5);
  }

  get solvedCount() { let n = 0; for (const s of this.state.values()) if (s.solved) n++; return n; }
  get brokenCount() { let n = 0; for (const s of this.state.values()) if (s.broken) n++; return n; }

  update(dt) {
    this.t += dt;
    const g = this.game;
    const cx = g.crab.x;

    for (const v of ventsNear(this.seed, cx, GUARD_WAKE)) {
      const s = this._st(v);
      // the guardian, which turns up once you are close enough to matter and
      // is not respawned once it is down
      if (!s.dead && !this.guards.has(v.id) && Math.abs(v.x - cx) < GUARD_WAKE) {
        const c = g.wildlife.spawn(v.guard, v.x + (Math.sign(v.x - cx) || 1) * 90);
        if (c) {
          c.guardOf = v.id;
          this.guards.set(v.id, c);
          g.npc?.yell('THAT IS ITS VENT. IT HAS BEEN SITTING ON IT.', 3.6);
        }
      }
      const guard = this.guards.get(v.id);
      if (guard && !guard.alive && !s.dead) {
        s.dead = true;
        g.ui?.say('It is down. The cap is yours.', 4);
      }

      // the flood: everything within reach of the vent comes back, and the
      // ground keeps drinking long after the jet has stopped throwing
      if (s.broken && s.flood > 0) {
        s.flood = Math.max(0, s.flood - dt);
        const k = clamp01(s.flood / FLOOD_SECS);
        // the front of the water, walking outwards
        const reach = 60 + (1 - k) * 520;
        g.green?.flood(v.x, reach, 1);
        // the water itself, thrown up and falling back
        const y = g.terrain.surfaceY(v.x) - v.size * 0.6;
        this._emit = (this._emit || 0) + dt * (30 + k * 90);
        const n = Math.floor(this._emit);
        if (n > 0) { this._emit -= n; g.fx?.jet(v.x, y, n, 110 + k * 150); }
        // and it digs its own basin out, because that much water does
        g.terrain.deform(v.x, dt * 5 * k, 30 + (1 - k) * 40);
        if (s.flood <= 0) {
          g.ui?.say('It has found its level. Look at it.', 5);
          g.npc?.say('That is a spring. That is an actual spring, running.', 6, 4);
        }
      }
    }
  }

  // -- drawing --------------------------------------------------------------

  draw(ctx, cam) {
    const g = this.game;
    const t = g.terrain;
    const z = cam.zoom;
    const b = cam.bounds(120);
    for (const v of ventsNear(this.seed, cam.rx, cam.vw / cam.zoom + CELL * 0.5)) {
      if (v.x < b.x0 - 120 || v.x > b.x1 + 120) continue;
      const s = this._st(v);
      const a = paintCap(v, s.broken);
      const gy = t.surfaceY(v.x);
      const sc = cam.worldToScreen(v.x, gy);
      ctx.save();
      ctx.translate(Math.round(sc.x), Math.round(sc.y));
      ctx.scale(z, z);
      ctx.drawImage(a.cv, -a.ox, -a.oy);
      ctx.restore();

      if (s.broken) this._jet(ctx, cam, v, s, gy - a.my);
      else if (!s.dead) this._mark(ctx, cam, v, gy - a.my);
    }
  }

  /**
   * The water, once it is out. A jet under pressure is not a line: it goes up
   * as a column, comes apart at the top, and falls back on both sides in two
   * arcs that land where the ground is already going green.
   */
  _jet(ctx, cam, v, s, wy) {
    const k = clamp01(s.flood / FLOOD_SECS);
    const h = 26 + k * 104;                 // it dies down as the pressure goes
    const z = cam.zoom;
    const bot = cam.worldToScreen(v.x, wy);
    const topY = bot.y - h * z;
    const w = Math.max(2, (2.5 + k * 4) * z);

    // the column
    const grd = ctx.createLinearGradient(0, topY, 0, bot.y);
    grd.addColorStop(0, `rgba(236,252,255,${0.20 + k * 0.45})`);
    grd.addColorStop(1, `rgba(120,206,232,${0.30 + k * 0.5})`);
    ctx.fillStyle = grd;
    const seg = Math.max(2, Math.ceil((bot.y - topY) / 10));
    for (let i = 0; i < 10; i++) {
      const u = i / 9;
      const y = lerp(bot.y, topY, u);
      const sway = Math.sin(this.t * 5.5 + u * 4 + v.ci) * u * 3.5 * z;
      const ww = w * (1 - u * 0.45);
      ctx.fillRect(Math.round(bot.x - ww / 2 + sway), Math.round(y - seg), Math.max(1, ww), seg + 1);
    }

    // and what comes down: two arcs of spray, thrown out and falling back
    ctx.fillStyle = `rgba(214,244,252,${0.30 + k * 0.35})`;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 12; i++) {
        const u = (i + ((this.t * 0.9 + side) % 1)) / 12;
        const dx = side * u * (34 + k * 46) * z;
        const dy = -h * z * (1 - (u * 2 - 1) * (u * 2 - 1)) * 0.82;
        const r = Math.max(1, Math.round(z * (1.4 - u * 0.7)));
        ctx.fillRect(Math.round(bot.x + dx), Math.round(bot.y + dy), r, r);
      }
    }

    // the boil where it lands back on itself
    ctx.globalAlpha = 0.35 + k * 0.3;
    ctx.fillStyle = '#e6fbff';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + this.t * 1.4;
      const r = (5 + Math.sin(this.t * 5 + i) * 3) * z;
      ctx.fillRect(Math.round(bot.x + Math.cos(a) * r), Math.round(bot.y + Math.sin(a) * r * 0.32),
        Math.max(1, Math.round(z)), Math.max(1, Math.round(z)));
    }
    ctx.globalAlpha = 1;
  }

  /**
   * It is not subtle about it. There is water under pressure the other side
   * of that plug, and a plug with water under it weeps - a bead works out of
   * the seam, hangs, and falls, over and over, for a thousand years.
   */
  _mark(ctx, cam, v, wy) {
    const z = cam.zoom;
    const s = cam.worldToScreen(v.x, wy);
    const cycle = (this.t * 0.9 + v.ci * 0.37) % 1;
    const r = Math.max(1, Math.round(z));
    // the bead, swelling on the seam and then dropping
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#bfeeff';
    if (cycle < 0.6) {
      const sw = Math.round(r * (1 + cycle));
      ctx.fillRect(Math.round(s.x - sw / 2), Math.round(s.y), sw, sw);
    } else {
      const f = (cycle - 0.6) / 0.4;
      ctx.fillRect(Math.round(s.x - r / 2), Math.round(s.y + f * f * 16 * z), r, r * 2);
    }
    // and the damp patch under it, which is the only wet thing for miles
    ctx.globalAlpha = 0.22 + 0.1 * Math.sin(this.t * 2);
    ctx.fillStyle = '#4c7a86';
    ctx.fillRect(Math.round(s.x - 5 * z), Math.round(s.y + 15 * z), Math.round(10 * z), Math.max(1, Math.round(z)));
    ctx.globalAlpha = 1;
  }

  // -- save -----------------------------------------------------------------

  save() {
    const out = {};
    for (const [k, s] of this.state) {
      if (s.broken || s.dead || s.solved || s.hp < CAP_HP) out[k] = [s.hp, s.broken ? 1 : 0, s.dead ? 1 : 0, s.solved ? 1 : 0];
    }
    return out;
  }

  load(d) {
    this.state.clear();
    for (const k of Object.keys(d || {})) {
      const [hp, broken, dead, solved] = d[k];
      // a spring that was already running has finished running: the ground
      // round it is green and it stays green
      this.state.set(k, { hp, broken: !!broken, flood: 0, dead: !!dead, solved: !!solved || !!broken });
    }
  }
}
