// CRABDEN - catching something.
//
// The oases are the last of the sea, and some of the sea is still in them.
// Every pool you walk down into has fish in it - pupfish mostly, a perch or
// two, and in the deep ones something pale that came up out of the rock - and
// off the west edge the sea proper has the rest, all the way down to the one
// fish that should not be alive at all.
//
// You catch them with the claw, and the claw is not quick. A fish that sees
// you coming is gone before you get there, so the whole of it is COMING SLOWLY:
// walk into a pool at a run and everything in it scatters; ease in and they
// go on about their business right up until you close on one. That is the
// only rule, and it is a real one.

import { FISH, FISH_BY_ID } from '../data/fish.js';
import { fishFrame, FISH_FRAMES } from '../art/fishart.js';
import { landmarksNear, poolSurface } from '../world/landmarks.js';
import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

const OASIS = FISH.filter((f) => f.where === 'oasis');
const SEA = FISH.filter((f) => f.where === 'sea');
const DEEP = FISH.filter((f) => f.where === 'deep');

/** Pick one kind, weighted toward the common ones. */
function pick(list, r) {
  let tot = 0;
  for (const f of list) tot += 1 / f.rarity;
  let k = r * tot;
  for (const f of list) { k -= 1 / f.rarity; if (k <= 0) return f; }
  return list[list.length - 1];
}

export class Fishing {
  constructor(game) {
    this.game = game;
    this.pools = new Map();    // oasis id -> { lm, fish: [] }
    this.log = {};             // species -> { n, best }
    this.card = null;          // the catch, held up for a moment
    this.t = 0;
  }

  // -- the pools -----------------------------------------------------------

  _stock(lm) {
    const g = this.game;
    const t = g.terrain;
    const surface = poolSurface(lm, t);
    const fish = [];
    const n = clamp(Math.round(lm.size / 26), 3, 10);
    let seed = (Math.abs(Math.round(lm.x)) * 2654435761) >>> 0;
    const rnd = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
    const deepPool = lm.depth > 40;
    for (let i = 0; i < n; i++) {
      const pool = deepPool ? OASIS : OASIS.filter((f) => !f.deep);
      const def = pick(pool, rnd());
      const x = lm.x + (rnd() - 0.5) * lm.size * 1.2;
      const bottom = t.baseY(x);
      if (bottom < surface + 8) continue;
      fish.push(this._fish(def, x, surface + 4 + rnd() * (bottom - surface - 8)));
      // pupfish are never alone
      if (def.school) for (let k = 0; k < 3; k++) fish.push(this._fish(def, x + (rnd() - 0.5) * 16, surface + 5 + rnd() * Math.max(2, bottom - surface - 10)));
    }
    return { lm, surface, fish };
  }

  _fish(def, x, y) {
    return {
      def, x, y, vx: 0, vy: 0, dir: Math.random() < 0.5 ? -1 : 1,
      ph: Math.random() * TAU, tx: x, ty: y, wait: Math.random() * 2,
      flee: 0, s: 0.85 + Math.random() * 0.3,
    };
  }

  // -- the loop --------------------------------------------------------------

  update(dt) {
    const g = this.game;
    if (g.state !== 'play') return;
    this.t += dt;
    if (this.card) { this.card.t -= dt; if (this.card.t <= 0) this.card = null; }
    const c = g.crab;
    const t = g.terrain;
    // stock the pools you are near, forget the ones you are not
    for (const lm of landmarksNear(g.world.seed, c.x, 900)) {
      if (lm.kind !== 'oasis') continue;
      const id = Math.round(lm.x);
      if (!this.pools.has(id)) this.pools.set(id, this._stock(lm));
    }
    for (const [id, p] of this.pools) if (Math.abs(p.lm.x - c.x) > 1800) this.pools.delete(id);

    const fast = Math.abs(c.vx || 0) > 34;
    for (const p of this.pools.values()) {
      if (Math.abs(p.lm.x - c.x) > 700) continue;
      for (const f of p.fish) this._swim(f, dt, p.surface, (x) => t.baseY(x), p.lm.x - p.lm.size, p.lm.x + p.lm.size, c, fast);
    }
    // the sea keeps its own fish; they only need to know about you
    if (g.shallows?.on && g.sea?.fish) {
      for (const f of g.sea.fish) {
        const d = Math.hypot(f.x - c.x, f.y - (c.y - 8));
        if (d < 30 + (fast ? 50 : 0) * (FISH_BY_ID[f.kind]?.wary ?? 0.5)) f.flee = Math.max(f.flee || 0, 1.2);
        if (f.flee > 0) { f.flee -= dt; f.dir = Math.sign(f.x - c.x) || f.dir; f.x += f.dir * 60 * dt; }
      }
    }
  }

  _swim(f, dt, surface, bottomAt, x0, x1, crab, fast) {
    const def = f.def;
    // you, and how much of a threat you are right now
    const dx = f.x - crab.x, dy = f.y - (crab.y - 8);
    const d = Math.hypot(dx, dy);
    const spook = (fast ? 90 : 22) * (0.4 + def.wary);
    if (d < spook && f.flee <= 0) {
      f.flee = 1.1 + Math.random() * 0.8;
      f.tx = f.x + Math.sign(dx || 1) * (40 + Math.random() * 40);
      f.ty = f.y + (Math.random() - 0.5) * 20;
    }
    f.flee = Math.max(0, f.flee - dt);
    // otherwise, a slow wander between places worth being
    f.wait -= dt;
    if (f.flee <= 0 && (f.wait <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 3)) {
      f.wait = 1.5 + Math.random() * 3.5;
      f.tx = lerp(x0 + 8, x1 - 8, Math.random());
      f.ty = f.y + (Math.random() - 0.5) * 18;
    }
    f.tx = clamp(f.tx, x0 + 6, x1 - 6);
    const bot = bottomAt(f.tx);
    f.ty = clamp(f.ty, surface + 3, Math.max(surface + 3, bot - 3));
    const sp = (f.flee > 0 ? 70 : 12) * def.speed;
    const ax = f.tx - f.x, ay = f.ty - f.y;
    const al = Math.hypot(ax, ay) || 1;
    f.vx += ((ax / al) * sp - f.vx) * Math.min(1, dt * (f.flee > 0 ? 6 : 1.5));
    f.vy += ((ay / al) * sp * 0.5 - f.vy) * Math.min(1, dt * (f.flee > 0 ? 6 : 1.5));
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    // never out of the water, never into the bed
    const here = bottomAt(f.x);
    if (here < surface + 5) { f.x -= f.vx * dt * 2; f.vx *= -0.5; f.tx = f.x - Math.sign(f.vx || 1) * 20; }
    f.y = clamp(f.y, surface + 2.5, Math.max(surface + 2.5, here - 2.5));
    if (Math.abs(f.vx) > 1.5) f.dir = Math.sign(f.vx);
    f.ph += dt * (2 + Math.abs(f.vx) * 0.25);
  }

  // -- catching --------------------------------------------------------------

  /** The claw's reach, in the world. */
  _reach() {
    const c = this.game.crab;
    return { x: c.x + (c.facing || 1) * 14, y: c.y - 8 };
  }

  /** The nearest fish in reach, from either the pools or the sea. */
  catchable() {
    const g = this.game;
    if (g.state !== 'play') return null;
    const r = this._reach();
    let best = null, bd = 26;
    for (const p of this.pools.values()) {
      if (Math.abs(p.lm.x - r.x) > p.lm.size + 30) continue;
      for (const f of p.fish) {
        const d = Math.hypot(f.x - r.x, f.y - r.y);
        if (d < bd) { bd = d; best = { f, list: p.fish, sea: false }; }
      }
    }
    if (g.shallows?.on && g.sea?.fish) {
      for (const f of g.sea.fish) {
        if (!FISH_BY_ID[f.kind]) continue;
        const d = Math.hypot(f.x - r.x, f.y - r.y);
        if (d < bd) { bd = d; best = { f, list: g.sea.fish, sea: true }; }
      }
    }
    return best;
  }

  /** Close the claw. True if there was a fish to try for. */
  tryCatch() {
    const g = this.game;
    const hit = this.catchable();
    if (!hit) return false;
    const f = hit.f;
    const def = hit.sea ? FISH_BY_ID[f.kind] : f.def;
    const moving = Math.abs(g.crab.vx || 0) > 20;
    const chance = (f.flee > 0 ? 0.3 : 0.82) - (moving ? 0.2 : 0) - def.wary * 0.15;
    g.crab.pump?.();
    g.audio?.play('claw');
    if (Math.random() > chance) {
      f.flee = 1.6;
      g.fx?.popup(f.x, f.y - 8, 'slipped away', '#9de3ee');
      g.audio?.play('splash', { pitch: 1.3 });
      return true;
    }
    hit.list.splice(hit.list.indexOf(f), 1);
    const cm = Math.round(lerp(def.cm[0], def.cm[1], Math.pow(Math.random(), 1.6)) * 10) / 10;
    const was = this.log[def.id];
    const first = !was;
    const best = !was || cm > was.best;
    this.log[def.id] = { n: (was?.n || 0) + 1, best: Math.max(was?.best || 0, cm) };
    g.economy.nutrients += def.value;
    g.fx?.spark?.(f.x, f.y, '#c9f2fa', 14, 28);
    g.audio?.play('splash');
    g.audio?.play(first ? 'discover' : 'pickup');
    g.quests?.flag('fish');
    g.quests?.flag('fish:' + def.id);
    this.card = { id: def.id, cm, first, best: best && !first, t: 4.2, max: 4.2 };
    if (first && g.npc && !g.npc.hidden && Math.abs(g.npc.x - g.crab.x) < 260) {
      const line = def.id === 'coelacanth'
        ? 'That is a COELACANTH. That is - put it DOWN, no, hold it up, let me look at it. Oh my god.'
        : `${def.name}! ${def.note.split('. ')[0]}.`;
      g.npc.say(line, 5.5, def.id === 'coelacanth' ? 8 : 3);
    }
    return true;
  }

  get kinds() { return Object.keys(this.log).length; }

  // -- drawing ---------------------------------------------------------------

  /** The pool fish: inside the water, which is drawn before them. */
  draw(ctx, cam) {
    const z = cam.zoom;
    for (const p of this.pools.values()) {
      if (!cam.isVisible(p.lm.x, p.surface, p.lm.size + 40)) continue;
      for (const f of p.fish) this._drawOne(ctx, cam, f.def.id, f.x, f.y, f.dir, f.ph, f.s,
        0.55 + 0.4 * clamp01(1 - (f.y - p.surface) / 60));
    }
  }

  _drawOne(ctx, cam, id, x, y, dir, ph, s, alpha) {
    const art = fishFrame(id, Math.floor(ph) % FISH_FRAMES, 1);
    const sp = cam.worldToScreen(x, y);
    const z = cam.zoom * (s || 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(sp.x), Math.round(sp.y));
    ctx.scale(z * dir, z);
    ctx.drawImage(art.cv, -art.ox, -art.oy);
    ctx.restore();
  }

  save() { return { log: this.log }; }
  load(d) { this.log = d?.log || {}; }
}

/** What the sea should put in the water at a given depth below its surface. */
export function seaSpecies(depth) {
  // the old fish only lives in the deepest water, and even there it is rare
  const list = depth > 170 ? [...SEA, ...DEEP] : depth > 90 ? [...SEA, DEEP[0]] : SEA;
  return pick(list, Math.random()).id;
}
