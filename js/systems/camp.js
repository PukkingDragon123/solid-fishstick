// CRABDEN - camps.
//
// Dr. Vess does not live anywhere. He lives in a tent near the rock he has
// been wrong about for eleven years, and before that he lived in a dozen
// other places out in the basin, every one of them next to water or next to
// something people built - because those are the only two reasons anybody
// stops out here. The main camp is a short walk from where you wake; the old
// ones are generated from the world seed, so the same camp is always on the
// same side of the same oasis.
//
// A camp is a place, not a menu. Its fire is lit at night and throws real
// light (renderer.addLight), and nothing that hunts will come into that
// light (creature.js asks `wardFor`). Its bedroll or tent is where you can
// sleep the night off - the screen goes dark, the clock runs on to morning,
// the game saves, and the new day is announced. Its chest holds things for
// you. And you can pitch your own: a fire, a bedroll, a tent, a chest and a
// torch, paid for out of the pack (P, or the CAMP stone in the corner).
//
// `game.camp.list` is every camp in the world as
//   { id, x, kind: 'main'|'outpost'|'player', name, found, items: [{ uid, k, x, flip }] }
// (`found` is whether you have walked into it yet; the main camp is a short
// walk east of where you wake, the rest sit beside the basin's oases)
// for anything that wants to put them on a map.

import { clamp, clamp01, lerp, damp, mulberry32, hashStr } from '../lib/math.js';
import { GROUND, gsx, gsy } from '../art/ground.js';
import { campArt, flameFrames } from '../art/campart.js';
import { landmarkAt, poolAt, LANDMARK_CELL } from '../world/landmarks.js';
import { formDepth, addPropGuard, clearPropCaches, propBump } from '../world/props.js';
import { ITEM_BY_ID } from '../data/craft.js';
import { ChestUI, drawCampKit, drawSleepCard, drawCampButton, kitLayout, setKit } from '../ui/chestui.js';
import { POSE } from '../entities/npc.js';

/**
 * Everything a camp can have in it. `w` is half its footprint, `layer` is
 * the order a camp is drawn in (back to front), `ward` is how far its light
 * keeps hunters off at night, `light` is the glow it throws.
 */
export const PIECES = {
  cart: { name: 'Handcart', art: 'cart', w: 22, layer: 0 },
  tent: { name: 'Tent', art: 'tent', w: 28, layer: 0, sleep: true },
  rack: { name: 'Drying rack', art: 'rack', w: 18, layer: 0 },
  crates: { name: 'Crates', art: 'crates', w: 15, layer: 1 },
  lantern: { name: 'Lantern', art: 'lantern', w: 5, layer: 1, lamp: true,
    light: { r: 52, col: '#ffcf7a', a: 0.6 } },
  log: { name: 'Log seat', art: 'log', w: 9, layer: 2 },
  bedroll: { name: 'Bedroll', art: 'bedroll', w: 15, layer: 2, sleep: true },
  chest: { name: 'Chest', art: 'chest', w: 9, layer: 2, chest: true },
  campfire: { name: 'Campfire', art: 'fireBase', w: 11, layer: 3, fire: true, ward: 86, sleepNear: true,
    light: { r: 104, col: '#ff9a48', a: 0.95 } },
  torch: { name: 'Torch', art: 'torch', w: 3, layer: 3, torch: true, ward: 44,
    light: { r: 50, col: '#ffb060', a: 0.7 } },
};

/** What you can pitch yourself, and what it costs out of the pack. */
export const KIT = [
  { k: 'campfire', cost: [['grit', 3], ['timber', 1]], note: 'Light and warmth. Nothing hunts inside it at night.' },
  { k: 'bedroll', cost: [['fibre', 3]], note: 'Somewhere to sleep the night off.' },
  { k: 'tent', cost: [['fibre', 5], ['timber', 2]], note: 'A proper roof. Sleep in it.' },
  { k: 'chest', cost: [['timber', 3]], note: 'Leave things here; they will be here.' },
  { k: 'torch', cost: [['timber', 1], ['fibre', 1]], note: 'A small light. A small safety.' },
];
export const KIT_BY_ID = Object.fromEntries(KIT.map((e) => [e.k, e]));
setKit(KIT, PIECES);

// the main camp is laid out by hand, the fire at 0
// (the rack stands off on its own past the ironstone outcrop he has been
// chipping at, which is the kind of thing that happens to a camp)
const MAIN_LAYOUT = [
  ['rack', -188, false], ['cart', -110, false], ['tent', -58, false], ['log', -17, false],
  ['campfire', 0, false], ['lantern', 18, false], ['crates', 38, false], ['chest', 61, false],
];
const OUTPOST_LAYOUTS = [
  [['bedroll', -30, false], ['campfire', 0, false], ['chest', 21, false], ['torch', 35, false], ['crates', 56, true]],
  [['tent', -50, false], ['campfire', 0, false], ['log', 17, true], ['chest', 36, false], ['lantern', 52, true]],
  [['cart', -64, true], ['bedroll', -24, false], ['campfire', 0, false], ['crates', 30, false], ['torch', 54, false]],
];
const MAIN_NEAR = 272;               // where his fire is, a short walk east of where you wake
const NIGHT_FROM = 18.4, NIGHT_TO = 5.2;
const WEST_LIMIT = -13400;           // past here is the sea that never left
const CHEST_SLOTS = 12;

const LOOT = ['grit', 'saltcake', 'fibre', 'timber', 'shellchip', 'silica', 'copperore'];

// The ground a camp stands on is cleared of scrub and loose rock, the way
// anybody clears a place to sleep. One guard for the whole game, keyed by the
// world seed, because the camps are the same every time for the same seed.
const CLEARED = new Map();     // seed -> [[x0, x1], ...]
addPropGuard((seed, x, hw) => {
  const z = CLEARED.get(seed);
  if (!z) return false;
  for (const [a, b] of z) if (x + hw > a && x - hw < b) return true;
  return false;
});

export class Camp {
  constructor(game) {
    this.game = game;
    this.seed = String(game.seed);
    this.list = [];
    this.chests = new Map();      // uid -> [[id, n], ...]
    this.touched = new Set();     // chests whose contents belong in the save
    this.placedN = 0;
    this.placing = null;          // { k, x, ok, why }
    this.sleep = null;            // { phase, t, day, ... }
    this.chestUI = new ChestUI(this);
    this.parts = [];              // embers and smoke, in world space
    this._lastT = 0;
    this._crackleT = 0;
    this._steamT = 0;
    this._generate();
  }

  // -- the world's camps ------------------------------------------------------

  /** Something of the world's own is already here: an ore outcrop, a dig, a ruin, a vent. */
  _busy(x, r) {
    const g = this.game;
    return !!(g.mining?.outcropAt(x, r + 14) || g.digs?.near(x, r + 8).length
      || g.encounters?.near(x, r + 8).length || g.fountains?.reachable?.(x));
  }

  /**
   * How bad a spot `x` is for this layout: Infinity on rock, water or a
   * boulder; otherwise how uneven the ground is under it, plus a heavy price
   * for every piece that would stand on something of the world's own.
   */
  _score(x, layout) {
    const t = this.game.terrain;
    let lo = Infinity, hi = -Infinity, a = Infinity, b = -Infinity, clash = 0;
    for (const [k, dx] of layout) {
      const w = PIECES[k].w, px = x + dx;
      a = Math.min(a, px - w); b = Math.max(b, px + w);
      if (this._busy(px, w)) clash++;
    }
    for (let wx = a; wx <= b; wx += 6) {
      if (formDepth(this.seed, wx) > 0 || propBump(this.seed, wx) < -0.5 || poolAt(this.seed, wx, t)) return Infinity;
      const y = t.baseY(wx);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return (hi - lo) + clash * 40;
  }

  /** The best spot for a layout within `reach` of x. */
  _site(x, reach, layout) {
    let best = x, bs = Infinity;
    for (let d = -reach; d <= reach; d += 6) {
      const s = this._score(x + d, layout) + Math.abs(d) * 0.03;
      if (s < bs) { bs = s; best = x + d; }
    }
    return { x: best, score: bs };
  }

  _addCamp(id, kind, name, x, layout, rng) {
    const camp = { id, kind, name, x, items: [], found: false };
    layout.forEach(([k, dx, flip], n) => {
      camp.items.push({ uid: `${id}#${n}`, k, x: x + dx, flip, def: PIECES[k], camp });
    });
    camp.items.sort((a, b) => a.def.layer - b.def.layer);
    camp.rng = rng;
    this.list.push(camp);
    return camp;
  }

  _generate() {
    // his camp, on the flattest ground just east of the rock you wake under
    const main = this._site(MAIN_NEAR, 12, MAIN_LAYOUT);
    this.main = this._addCamp('vess', 'main', "Vess's camp", main.x, MAIN_LAYOUT, null);
    // and the old ones, next to water or walls
    for (let ci = -5; ci <= 6; ci++) {
      if (ci === 0) continue;
      const lm = landmarkAt(this.seed, ci);
      if (!lm || (lm.kind !== 'oasis' && lm.kind !== 'ruin')) continue;
      const r = mulberry32((hashStr(this.seed + 'camp') ^ (ci * 2246822519)) >>> 0);
      if (r() < 0.25) continue;
      const side = r() < 0.5 ? -1 : 1;
      const zone = lm.kind === 'oasis' ? lm.size * 1.45 : lm.size * 0.95;
      const want = lm.x + side * (zone + 70);
      if (want < WEST_LIMIT) continue;
      let lay = OUTPOST_LAYOUTS[Math.floor(r() * OUTPOST_LAYOUTS.length)];
      const s = this._site(want, 70, lay);
      if (!isFinite(s.score)) continue;
      // whatever would stand on an outcrop or a dig is left out; a camp with
      // its fire on one is not a camp
      if (this._busy(s.x, PIECES.campfire.w)) continue;
      lay = lay.filter(([k, dx]) => k === 'campfire' || !this._busy(s.x + dx, PIECES[k].w));
      if (lay.length < 3 || this._score(s.x, lay) > 26) continue;
      this._addCamp('lm' + ci, 'outpost', `Old camp, ${lm.name}`, s.x, lay, r);
    }
    const zones = this.list.map((c) => {
      let a = Infinity, b = -Infinity;
      for (const p of c.items) { a = Math.min(a, p.x - p.def.w - 8); b = Math.max(b, p.x + p.def.w + 8); }
      return [a, b];
    });
    const had = CLEARED.get(this.seed);
    if (!had || had.length !== zones.length || had.some((z, n) => z[0] !== zones[n][0] || z[1] !== zones[n][1])) {
      CLEARED.set(this.seed, zones);
      clearPropCaches();
    }
  }

  /** All the pieces of every camp, flat. */
  *pieces() { for (const c of this.list) yield* c.items; }

  /** What is in a chest. Built the first time anybody looks. */
  chestItems(p) {
    let v = this.chests.get(p.uid);
    if (v) return v;
    v = [];
    if (p.camp.kind === 'main') v.push(['timber', 4], ['fibre', 6], ['grit', 4]);
    else if (p.camp.kind === 'outpost') {
      const r = mulberry32(hashStr(p.uid));
      const n = 2 + Math.floor(r() * 2);
      const used = new Set();
      for (let i = 0; i < n; i++) {
        const id = LOOT[Math.floor(r() * LOOT.length)];
        if (used.has(id)) continue;
        used.add(id);
        v.push([id, 1 + Math.floor(r() * 4)]);
      }
    }
    this.chests.set(p.uid, v);
    return v;
  }

  /** The nearest piece within `reach` that passes `fn`. */
  nearest(x, reach, fn) {
    let best = null, bd = reach;
    for (const p of this.pieces()) {
      if (fn && !fn(p)) continue;
      const d = Math.abs(p.x - x);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** The camp nearest x, within `reach`. */
  campAt(x, reach = 160) {
    let best = null, bd = reach;
    for (const c of this.list) {
      const d = Math.abs(c.x - x);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  get isNight() {
    const h = this.game.weather.hour;
    return h >= NIGHT_FROM || h < NIGHT_TO;
  }

  /** How dark it is, for anything that lights up after dusk. */
  get dark() { return clamp01((this.game.weather.nightMix - 0.08) / 0.5); }

  // -- night ------------------------------------------------------------------

  /**
   * Is a hunter kept off by firelight? Called by a hostile creature every
   * frame. Inside the light it runs for the dark; outside it, if you are in
   * the light, it will come no closer than its edge.
   */
  wardFor(c, crab) {
    if (this.dark < 0.35) return null;
    for (const p of this.pieces()) {
      const r = p.def.ward;
      if (!r) continue;
      const d = c.x - p.x;
      if (Math.abs(d) > r + 180) continue;
      const side = Math.sign(d) || 1;
      if (Math.abs(d) < r) return { x: p.x + side * (r + 46), flee: true };
      if (crab && Math.abs(crab.x - p.x) < r + 8 && Math.abs(d) < r + 80) {
        // it waits at the edge of the light for a while, and then it gives
        // up and goes looking for something that is not sitting by a fire
        const now = this.game.time;
        if (c._wardSince === undefined || now - (c._wardLast ?? now) > 2) c._wardSince = now;
        c._wardLast = now;
        if (now - c._wardSince > 12) return { x: p.x + side * (r + 420), flee: true };
        return { x: p.x + side * (r + 14), flee: false };
      }
    }
    return null;
  }

  /** The fire you are sitting at, if any. */
  fireNear(x, extra = 0) {
    return this.nearest(x, 200, (p) => p.def.fire && Math.abs(p.x - x) < p.def.ward + extra);
  }

  /**
   * After dark he goes home. If he is anywhere near his camp and not doing
   * something for you, he walks back, sits on his log and has the one beer.
   * Returns true while it has him, so his day rota leaves him alone.
   */
  holdVess(npc) {
    const g = this.game;
    if (g.state !== 'play' || npc.riding || g.mind?.owned) return false;
    if (npc.mode !== 'work' && npc.mode !== 'follow') return false;
    const h = g.weather.hour;
    if (!(h >= 19.2 || h < 5.6)) return false;
    const log = this.main.items.find((p) => p.k === 'log');
    const fire = this.main.items.find((p) => p.k === 'campfire');
    if (!log || !fire) return false;
    const crab = g.crab;
    // walking with you, he only stops if you have brought him home
    const range = npc.mode === 'follow' ? 300 : 700;
    if (Math.abs(npc.x - fire.x) > range || (npc.mode === 'follow' && Math.abs(crab.x - fire.x) > 260)) return false;
    // his log, or the far side of the fire if you are sitting on it
    const room = 28 + (crab.m?.shellW || 20) * 0.5;
    const seats = [{ x: log.x - 2, face: 1 }, { x: fire.x + 24, face: -1 }]
      .filter((q) => Math.abs(q.x - crab.x) > room)
      .sort((a, b) => Math.abs(a.x - npc.x) - Math.abs(b.x - npc.x));
    const seat = seats[0];
    if (!seat) return false;
    if (Math.abs(npc.x - seat.x) > 5) {
      if (npc.moveTo === undefined || Math.abs(npc.moveTo - seat.x) > 3) npc.moveTo = seat.x;
      return true;
    }
    npc.moveTo = undefined;
    npc.vx = 0;
    npc.setFacing(seat.face);
    if (npc.pose !== POSE.REST && npc.pose !== POSE.BEER && npc.pose !== POSE.SIT) npc.setPose(POSE.REST);
    if (npc.poseT > 9) npc.setPose(npc.pose === POSE.REST ? POSE.BEER : POSE.REST);
    return true;
  }

  // -- what E does here --------------------------------------------------------

  get modal() { return !!(this.sleep || this.chestUI.open); }

  _reach() { return 14 + (this.game.crab.m?.rx || 10) * 0.55; }

  _hostileNear(r = 150) {
    const c = this.game.crab;
    return this.game.wildlife.nearest(c.x, c.y, r, (q) => q.alive && q.hostile);
  }

  _chestNear() {
    const x = this.game.crab.x, R = this._reach();
    return this.nearest(x, R, (p) => p.def.chest);
  }

  _bedNear() {
    const x = this.game.crab.x, R = this._reach();
    const bed = this.nearest(x, R + 8, (p) => p.def.sleep);
    if (bed) return bed;
    return this.nearest(x, 46, (p) => p.def.sleepNear);
  }

  /** The word on the action plate, or null. */
  hint() {
    const g = this.game;
    if (g.state !== 'play') return null;
    if (this.placing) return 'PLACE';
    if (this._hostileNear(44)) return null;
    if (this._chestNear()) return 'OPEN';
    if (this.isNight && this._bedNear()) return 'SLEEP';
    return null;
  }

  /** E, at a camp. True if it did something. */
  act() {
    const g = this.game;
    if (g.state !== 'play') return false;
    if (this.placing) { this.place(); return true; }
    if (this._hostileNear(44)) return false;
    const chest = this._chestNear();
    if (chest) { this.openChest(chest); return true; }
    const bed = this._bedNear();
    if (bed && this.isNight) { this.trySleep(bed); return true; }
    return false;
  }

  openChest(p) {
    this.chestUI.show(p, this.chestItems(p));
    this.touched.add(p.uid);
    this.game.audio?.play('uiBig');
    this.game.audio?.noiseBurst?.({ dur: 0.22, vol: 0.08, freq: 260, q: 0.8, sweep: 0.6 });
  }

  /** Move a whole stack (or `n` of it) between a chest and the pack. */
  moveStack(items, id, toChest, n = Infinity) {
    const craft = this.game.craft;
    if (toChest) {
      const have = craft.count(id);
      const k = Math.min(have, n);
      if (k <= 0) return false;
      let slot = items.find((e) => e[0] === id);
      if (!slot) {
        if (items.length >= CHEST_SLOTS) { this.game.ui.say('The chest is full.', 2); this.game.audio?.play('deny'); return false; }
        slot = [id, 0]; items.push(slot);
      }
      craft.take(id, k);
      slot[1] += k;
    } else {
      const i = items.findIndex((e) => e[0] === id);
      if (i < 0) return false;
      const k = Math.min(items[i][1], n);
      craft.add(id, k);
      items[i][1] -= k;
      if (items[i][1] <= 0) items.splice(i, 1);
    }
    this.game.audio?.play('pickup', { pitch: toChest ? 0.8 : 1.1 });
    return true;
  }

  get slots() { return CHEST_SLOTS; }

  // -- sleeping --------------------------------------------------------------

  trySleep(bed) {
    const g = this.game;
    if (!this.isNight) { g.ui.say('Not tired yet. Sleep comes after dusk.', 3); g.audio?.play('deny'); return false; }
    const foe = this._hostileNear(130);
    if (foe) { g.ui.say(`Not with that ${foe.def.name.toLowerCase()} about.`, 3); g.audio?.play('deny'); return false; }
    this.chestUI.close();
    this.placing = null;
    const camp = bed.camp;
    this.sleep = { phase: 'out', t: 0, from: g.weather.hour, day: g.weather.day, camp, bed };
    g.audio?.play('night');
    return true;
  }

  _wake() {
    const g = this.game, s = this.sleep, w = g.weather;
    const h = w.hour;
    // into the next morning: past midnight already means this one
    if (h >= 12) { w.day++; g.onNewDay?.(w.day); }
    w.hour = 6.5;
    w.recompute();
    s.hours = ((6.5 - s.from) + 24) % 24;
    s.day = w.day;
    const c = g.crab;
    c.hp = c.hpMax;
    // whatever was sniffing round the edge of the light has gone to ground
    const wl = g.wildlife.list;
    for (let n = wl.length - 1; n >= 0; n--) {
      const q = wl[n];
      if (q.alive && q.hostile && Math.abs(q.x - c.x) < 520) wl.splice(n, 1);
    }
    if (g.npc && s.camp.kind === 'main' && g.npc.mode === 'work') {
      g.npc.x = s.camp.items.find((p) => p.k === 'log')?.x ?? g.npc.x;
      g.npc.setPose(POSE.DRINK);
    }
    s.line = this._morningLine(s);
    g.save();
  }

  _morningLine(s) {
    const lines = s.camp.kind === 'main'
      ? ['Vess is up already, arguing with a map.', 'The fire is down to coals. Somebody has put the kettle on.',
        'You slept by his fire. He says you snore like a landslide.']
      : s.camp.kind === 'player'
        ? ['Your own fire, burned down to a glow.', 'Nothing came near. The sand round the camp is unmarked.',
          'Morning, at a camp of your own.']
        : ['His old camp kept you. The canvas smells of eleven years of dust.', 'The fire held. Out in the dark something waited, and left.'];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  _sleepTick(dt) {
    const s = this.sleep;
    s.t += dt;
    if (s.phase === 'out' && s.t >= 1.1) { this._wake(); s.phase = 'card'; s.t = 0; this.game.audio?.play('dawn'); }
    else if (s.phase === 'card' && s.t >= 2.8) { s.phase = 'in'; s.t = 0; }
    else if (s.phase === 'in' && s.t >= 1.3) {
      const g = this.game;
      if (s.camp.kind === 'main' && g.npc && Math.abs(g.npc.x - g.crab.x) < 200) {
        g.npc.say(['Morning. Coffee is the brown one.', 'Up. The rock is not going to dig itself.',
          'You were twitching. Dreaming about the sea again?'][Math.floor(Math.random() * 3)], 4);
      }
      this.sleep = null;
    }
  }

  /** How black the screen is, 0..1. */
  get blackout() {
    const s = this.sleep;
    if (!s) return 0;
    if (s.phase === 'out') return clamp01(s.t / 1.1);
    if (s.phase === 'card') return 1;
    return 1 - clamp01(s.t / 1.3);
  }

  // -- pitching your own -----------------------------------------------------

  /**
   * You can pitch your own once you have seen how he does it: the kit opens
   * up the first time you walk into one of his camps.
   */
  get kitOpen() { return this.list.some((c) => c.found && c.kind !== 'player'); }

  togglePlacing(on = !this.placing) {
    const g = this.game;
    if (on && (g.state !== 'play' || !this.kitOpen)) return;
    this.placing = on ? { k: this._lastKit || 'campfire', x: g.crab.x, ok: false, why: '' } : null;
    g.audio?.play(on ? 'uiBig' : 'ui');
  }

  pick(k) {
    if (!this.placing) return;
    this.placing.k = k;
    this._lastKit = k;
    this.game.audio?.play('ui');
  }

  afford(k) {
    const e = KIT_BY_ID[k];
    return !!e && e.cost.every(([id, n]) => this.game.craft.count(id) >= n);
  }

  /** Can piece `k` go down at x? Returns null, or the reason it cannot. */
  _blocked(k, x) {
    const g = this.game;
    const def = PIECES[k];
    if (Math.abs(x - g.crab.x) > 130) return 'Too far away.';
    if (!this.afford(k)) {
      const miss = KIT_BY_ID[k].cost.find(([id, n]) => g.craft.count(id) < n);
      return `Needs ${miss[1]} ${ITEM_BY_ID[miss[0]]?.name || miss[0]}.`;
    }
    if (formDepth(this.seed, x) > 0) return 'Not on the rock.';
    if (poolAt(this.seed, x, g.terrain)) return 'Not in the water.';
    const t = g.terrain;
    if (Math.abs(t.baseY(x + def.w) - t.baseY(x - def.w)) > def.w * 0.7 + 3) return 'Too steep here.';
    for (const p of this.pieces()) {
      const gap = def.torch || p.def.torch ? 5 : def.w + p.def.w - 4;
      if (Math.abs(p.x - x) < gap) return `In the way of the ${p.def.name.toLowerCase()}.`;
    }
    return null;
  }

  place() {
    const g = this.game, pl = this.placing;
    if (!pl) return false;
    const why = this._blocked(pl.k, pl.x);
    if (why) { g.ui.say(why, 2.4); g.audio?.play('deny'); return false; }
    for (const [id, n] of KIT_BY_ID[pl.k].cost) g.craft.take(id, n);
    const x = Math.round(pl.x);
    this._addPlaced({ uid: 'p' + (++this.placedN), k: pl.k, x, flip: g.crab.x > x });
    g.fx?.dust(x, g.terrain.surfaceY(x), 1.2);
    g.audio?.play('pickup', { pitch: 0.7 });
    g.ui.say(`${PIECES[pl.k].name} pitched.`, 2.4);
    if (pl.k === 'campfire' && g.npc && Math.abs(g.npc.x - x) < 260) g.npc.say('A fire. Now we are civilised.', 3.5);
    if (!this.afford(pl.k)) this.placing = null;
    return true;
  }

  _addPlaced(d) {
    const def = PIECES[d.k];
    if (!def) return null;
    let camp = this.list.find((c) => c.kind === 'player' && Math.abs(c.x - d.x) < 140)
      || this.list.find((c) => Math.abs(c.x - d.x) < 120);
    if (!camp) {
      camp = { id: 'mine' + d.uid, kind: 'player', name: 'Your camp', x: d.x, items: [], found: true };
      this.list.push(camp);
    }
    const it = { uid: d.uid, k: d.k, x: d.x, flip: !!d.flip, def, camp, placed: true };
    camp.items.push(it);
    camp.items.sort((a, b) => a.def.layer - b.def.layer);
    if (camp.kind === 'player') camp.x = Math.round(camp.items.reduce((s, p) => s + p.x, 0) / camp.items.length);
    return it;
  }

  // -- frame -----------------------------------------------------------------

  /**
   * Input, before anything else in the frame reads it: the chest window,
   * the camp kit, the stone that opens it. Runs whether or not the world is
   * paused behind it.
   */
  input() {
    const g = this.game, i = g.input;
    if (g.state !== 'play') { if (this.placing) this.placing = null; return; }
    if (this.sleep) {
      for (const k of ['e', 'Escape', ' ', 'Enter', 'p']) i.consumeKey(k);
      i.clicked = false;
      return;
    }
    if (this.chestUI.open) { this.chestUI.input(i); return; }
    if (g.ui.paused || g.ui.bookOpen || g.ui.drawerOpen || g.ui.buildOn || g.talk?.on || g.work?.modal) {
      if (this.placing && (g.ui.buildOn || g.ui.drawerOpen)) this.placing = null;
      return;
    }
    if (i.justPressed('p')) { i.consumeKey('p'); this.togglePlacing(); }
    const b = this.btnRect;
    if (b && i.clicked && i.sx >= b.x && i.sx <= b.x + b.w && i.sy >= b.y && i.sy <= b.y + b.h) {
      i.clicked = false;
      this.togglePlacing();
    }
    const pl = this.placing;
    if (!pl) return;
    if (i.justPressed('Escape')) { i.consumeKey('Escape'); this.placing = null; g.audio?.play('ui'); return; }
    if (i.rightClicked) { i.rightClicked = false; this.placing = null; return; }
    // the kit bar
    const lay = this.kitRects;
    if (lay && i.clicked) {
      for (const r of lay.slots) {
        if (i.sx >= r.x && i.sx <= r.x + r.w && i.sy >= r.y && i.sy <= r.y + r.h) {
          i.clicked = false; this.pick(r.k); return;
        }
      }
      const c = lay.close;
      if (c && i.sx >= c.x - 2 && i.sx <= c.x + c.w + 2 && i.sy >= c.y - 2 && i.sy <= c.y + c.h + 2) {
        i.clicked = false; this.placing = null; g.audio?.play('ui'); return;
      }
      if (i.sx >= lay.box.x && i.sx <= lay.box.x + lay.box.w && i.sy >= lay.box.y && i.sy <= lay.box.y + lay.box.h) {
        i.clicked = false; return;
      }
    }
    // the ground: a click puts it down where the ghost is; on a phone a tap
    // only moves the ghost, and the PLACE plate puts it down
    const touch = g.ui.touchEnabled;
    if (i.clicked) {
      const w = g.cam.screenToWorld(i.sx, i.sy);
      if (Math.abs(w.x - g.crab.x) < 140) {
        i.clicked = false;
        pl.pinned = w.x;
        pl.x = w.x;
        if (!touch) this.place();
      }
    }
  }

  update(dt) {
    const g = this.game;
    if (this.sleep) { this._sleepTick(dt); return; }
    if (this.chestUI.open) this.chestUI.update(dt);
    if (g.state !== 'play') return;
    const crab = g.crab;
    // the ghost follows the pointer while it is over the world, otherwise it
    // goes down just in front of you
    const pl = this.placing;
    if (pl) {
      const i = g.input;
      const def = PIECES[pl.k];
      const front = crab.x + (crab.facing || 1) * ((crab.m?.rx || 12) * 0.9 + def.w + 6);
      if (!g.ui.touchEnabled) {
        const w = g.cam.screenToWorld(i.sx, i.sy);
        pl.x = Math.abs(w.x - crab.x) < 140 && !this._overKit(i.sx, i.sy) ? w.x : front;
      } else pl.x = pl.pinned !== undefined && Math.abs(pl.pinned - crab.x) < 130 ? pl.pinned : front;
      if (pl.pinned !== undefined && Math.abs(pl.pinned - crab.x) >= 130) pl.pinned = undefined;
      pl.x = Math.round(pl.x);
      pl.why = this._blocked(pl.k, pl.x);
      pl.ok = !pl.why;
    }
    // walking into a camp for the first time
    this._foundT = (this._foundT || 0) - dt;
    if (this._foundT <= 0) {
      this._foundT = 0.5;
      for (const c of this.list) {
        if (c.found || Math.abs(c.x - crab.x) > 150) continue;
        c.found = true;
        if (c.kind === 'player') continue;
        g.ui.say(c.kind === 'main' ? "Vess's camp. Fire, bed, and a chest." : `${c.name}: one of his. There is a chest.`, 4);
        if (c.kind === 'outpost' && g.npc && Math.abs(g.npc.x - crab.x) < 220) {
          g.npc.say(['I camped here. Years ago. The fire ring is still mine.', 'Ha - my old pitch. I left a chest.',
            'I know this spot. I was wrong about something here too.'][Math.floor(Math.random() * 3)], 4.5);
        }
      }
    }
    // the fire mends you
    if (crab.hp < crab.hpMax && this.fireNear(crab.x)) {
      crab.hp = Math.min(crab.hpMax, crab.hp + dt * 7);
      this._healT = (this._healT || 0) - dt;
      if (this._healT <= 0) { this._healT = 0.5; g.fx?.spark?.(crab.x, crab.y - 14, '#ffcf8a', 2, 10); }
    }
    // and crackles
    const fire = this.nearest(crab.x, 220, (p) => p.def.fire || p.def.torch);
    this._crackleT -= dt;
    if (fire && this._crackleT <= 0 && g.audio?.ctx && g.audio.enabled) {
      const near = 1 - clamp01(Math.abs(fire.x - crab.x) / 220);
      const big = fire.def.fire ? 1 : 0.45;
      this._crackleT = 0.06 + Math.random() * (0.5 - near * 0.3);
      const a = g.audio;
      if (Math.random() < 0.8) a.noiseBurst({ dur: 0.015 + Math.random() * 0.03, vol: (0.02 + Math.random() * 0.06) * near * big, freq: 1800 + Math.random() * 3000, q: 0.9, type: 'highpass' });
      else a.noiseBurst({ dur: 0.07, vol: 0.07 * near * big, freq: 260 + Math.random() * 200, q: 1.2, sweep: 0.5 });
    } else if (!fire) this._crackleT = 0.4;
  }

  _overKit(sx, sy) {
    const b = this.kitRects?.box;
    return !!b && sx >= b.x - 4 && sx <= b.x + b.w + 4 && sy >= b.y - 4 && sy <= b.y + b.h + 4;
  }

  // -- drawing ---------------------------------------------------------------

  _visible(cam) {
    const b = cam.bounds(160);
    return this.list.filter((c) => c.x > b.x0 - 160 && c.x < b.x1 + 160);
  }

  /** Blit `a` with its anchor on world (x, y). */
  _blit(ctx, cam, a, x, y, flip = false, alpha = 1) {
    const z = cam.zoom;
    ctx.save();
    ctx.translate(Math.round(gsx(cam, x)), Math.round(gsy(cam, y)));
    ctx.scale(flip ? -z : z, z);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(a.cv, -a.ox, -a.oy);
    ctx.restore();
  }

  _seatY(p, a) {
    return GROUND.seat(p.x, a.footL ?? a.foot, a.footR ?? a.foot, a.bury ?? 2).y;
  }

  /**
   * Every camp in view, after the far scatter and before anything that
   * walks: shadows, the pieces cut at the ground line, the sand banked
   * against their feet, then the fire's flames and what rises off them.
   */
  draw(ctx, cam) {
    const g = this.game;
    const dt = clamp(g.time - this._lastT, 0, 0.1);
    this._lastT = g.time;
    const camps = this._visible(cam);
    GROUND.frame(cam, g.terrain);
    const w = g.weather;
    const sun = clamp01((w?.daylight ?? 1) * (1 - (w?.haze || 0) * 0.5));
    const sdir = w?.shadowDir || 1;
    const wind = w?.windDir || 1;
    const dark = this.dark;
    const pieces = [];
    for (const c of camps) for (const p of c.items) if (cam.isVisible(p.x, g.terrain.baseY(p.x) - 10, 80)) pieces.push(p);
    // shadows on the crust
    for (const p of pieces) GROUND.shadow(ctx, cam, p.x, p.def.w * 0.9, p.def.layer === 0 ? 1 : 0.8, sun, sdir);
    // the ground a camp is on has been walked on for years
    for (const c of camps) this._groundWear(ctx, cam, c);
    // the fire's own warm patch on the ground
    for (const p of pieces) if (p.def.fire) this._groundGlow(ctx, cam, p, dark);
    ctx.save();
    GROUND.clipAbove(ctx, cam, 1);
    for (const p of pieces) {
      const a = this._art(p, dark);
      if (!a) continue;
      const y = this._seatY(p, a);
      p.seatY = y;
      this._blit(ctx, cam, a, p.x, y, p.flip);
      if (p.def.fire) this._drawFire(ctx, cam, p, y);
      if (p.def.torch) this._drawTorchFlame(ctx, cam, p, a, y);
    }
    ctx.restore();
    for (const p of pieces) {
      const a = this._art(p, dark);
      if (!a) continue;
      GROUND.drift(ctx, cam, p.x, (p.def.w + 2) * 1.05, p.def.layer === 0 ? 1.7 : 1.1, wind, p.x | 0);
    }
    this._particles(ctx, cam, dt, pieces);
  }

  _art(p, dark) {
    if (p.k === 'chest') return campArt(this.chestUI.open && this.chestUI.piece === p ? 'chestOpen' : 'chest');
    if (p.k === 'lantern') return campArt(dark > 0.2 ? 'lanternLit' : 'lantern');
    return campArt(p.def.art);
  }

  /**
   * Trampled sand: a shallow band of darker, packed crust under the whole
   * camp, and ash scattered round each fire. Dithered on world pixels so it
   * is the same grain as the ground it is on.
   */
  _groundWear(ctx, cam, c) {
    if (!c.items.length) return;
    let a = Infinity, b = -Infinity;
    for (const p of c.items) { a = Math.min(a, p.x - p.def.w); b = Math.max(b, p.x + p.def.w); }
    const z = cam.zoom, s1 = Math.max(1, Math.round(z));
    const fires = c.items.filter((p) => p.def.fire);
    const x0 = Math.max(Math.floor(a - 10), Math.floor(cam.x - cam.vw / 2 / z) - 2);
    const x1 = Math.min(Math.ceil(b + 10), Math.ceil(cam.x + cam.vw / 2 / z) + 2);
    for (let wx = x0; wx <= x1; wx++) {
      const edge = Math.min(wx - (a - 10), (b + 10) - wx) / 12;
      const k = clamp01(edge);
      const n = ((wx * 2654435761) >>> 0) / 4294967296;
      const gy = GROUND.at(wx);
      const sx = Math.round(gsx(cam, wx)), sw = Math.max(1, Math.round(gsx(cam, wx + 1)) - sx);
      const sy = Math.round(gsy(cam, gy));
      // packed crust, a pixel or two down into the ground
      if (n < 0.35 + k * 0.55) {
        ctx.fillStyle = 'rgba(70,46,26,0.16)';
        ctx.fillRect(sx, sy + s1, sw, s1 * (1 + (n < 0.3 ? 1 : 0)));
      }
      // ash and charcoal crumbs, thick by the ring and thinning out
      for (const f of fires) {
        const d = Math.abs(wx - f.x);
        if (d > 26) continue;
        const m = 1 - d / 26;
        if (n < m * 0.75) {
          ctx.fillStyle = n < m * 0.25 ? 'rgba(30,24,20,0.55)' : 'rgba(120,112,100,0.45)';
          ctx.fillRect(sx, sy + (n < 0.4 ? 0 : s1), sw, s1);
        }
      }
    }
  }

  _groundGlow(ctx, cam, p, dark) {
    if (dark < 0.05) return;
    const z = cam.zoom;
    const flick = 0.85 + Math.sin(this.game.time * 9.1 + p.x) * 0.08 + Math.sin(this.game.time * 23.7) * 0.05;
    ctx.fillStyle = '#ffb35a';
    for (let wx = -36; wx <= 36; wx++) {
      const u = Math.abs(wx) / 36;
      const k = (1 - u * u) * flick;
      const gy = GROUND.at(p.x + wx);
      const sx = Math.round(gsx(cam, p.x + wx)), sw = Math.max(1, Math.round(gsx(cam, p.x + wx + 1)) - sx);
      ctx.globalAlpha = 0.22 * dark * k;
      ctx.fillRect(sx, Math.round(gsy(cam, gy)), sw, Math.max(1, Math.round((2 + 3 * k) * z)));
    }
    ctx.globalAlpha = 1;
  }

  _drawFire(ctx, cam, p, y) {
    const g = this.game;
    const fr = flameFrames(16, 22, 10, (p.x | 0) & 7);
    const f = ((Math.floor(g.time * 12 + (p.x | 0)) % fr.length) + fr.length) % fr.length;
    const z = cam.zoom;
    const sx = Math.round(gsx(cam, p.x)), sy = Math.round(gsy(cam, y));
    // the flames burn a little lower in the heat of the day
    const k = 0.8 + this.dark * 0.2;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z, z * k);
    ctx.drawImage(fr[f], -8, -23);
    ctx.restore();
    const front = campArt('fireFront');
    this._blit(ctx, cam, front, p.x, y + 1);
    if (p.camp.kind === 'main') this._blit(ctx, cam, campArt('kettle'), p.x + 13, y + 1);
  }

  _drawTorchFlame(ctx, cam, p, a, y) {
    const fr = flameFrames(7, 11, 8, 3, false);
    const f = ((Math.floor(this.game.time * 13 + (p.x | 0)) % fr.length) + fr.length) % fr.length;
    const z = cam.zoom;
    const fl = a.flame;
    ctx.save();
    ctx.translate(Math.round(gsx(cam, p.x)), Math.round(gsy(cam, y)));
    ctx.scale(p.flip ? -z : z, z);
    ctx.drawImage(fr[f], fl.x - a.ox - 3.5, fl.y - a.oy - 9);
    ctx.restore();
  }

  _drawGhost(ctx, cam) {
    const pl = this.placing;
    const def = PIECES[pl.k];
    const a = campArt(def.art);
    if (!a) return;
    const y = GROUND.seat(pl.x, a.footL ?? a.foot, a.footR ?? a.foot, 2).y;
    const pulse = 0.55 + Math.sin(this.game.time * 5) * 0.1;
    const flip = this.game.crab.x > pl.x;
    this._blit(ctx, cam, a, pl.x, y, flip, pulse);
    // a fire shows as a fire, a torch with its flame: you are choosing light
    ctx.save();
    ctx.globalAlpha = pulse;
    if (def.fire) {
      const fr = flameFrames(16, 22, 10, 1);
      const z = cam.zoom;
      ctx.translate(Math.round(gsx(cam, pl.x)), Math.round(gsy(cam, y)));
      ctx.scale(z, z);
      ctx.drawImage(fr[Math.floor(this.game.time * 12) % fr.length], -8, -23);
      ctx.drawImage(campArt('fireFront').cv, -campArt('fireFront').ox, -campArt('fireFront').oy + 1);
    } else if (def.torch) this._drawTorchFlame(ctx, cam, { x: pl.x, flip }, a, y);
    ctx.restore();
    // the footprint, ochre where it can go and red where it cannot
    const z = cam.zoom;
    ctx.fillStyle = pl.ok ? '#f4c96a' : '#e2563e';
    for (let wx = -def.w; wx <= def.w; wx += 2) {
      const gy = GROUND.at(pl.x + wx);
      ctx.fillRect(Math.round(gsx(cam, pl.x + wx)), Math.round(gsy(cam, gy)) + Math.round(z), Math.max(1, Math.round(z)), Math.max(1, Math.round(z)));
    }
  }

  /** Embers going up, smoke drifting off, steam off his pot. */
  _particles(ctx, cam, dt, pieces) {
    const g = this.game;
    const wind = (g.weather?.windDir || 1) * (0.4 + (g.weather?.windSpeed ?? 0.4));
    for (const p of pieces) {
      if (!p.def.fire && !p.def.torch) continue;
      const y = p.seatY ?? g.terrain.baseY(p.x);
      const big = p.def.fire ? 1 : 0.35;
      const topY = p.def.fire ? y - 12 : y - 21;
      if (this.parts.length < 160) {
        if (Math.random() < dt * 9 * big) {
          this.parts.push({ kind: 'ember', x: p.x + (Math.random() - 0.5) * 6 * big, y: topY + 4,
            vx: (Math.random() - 0.5) * 8, vy: -16 - Math.random() * 22, life: 0, max: 0.9 + Math.random() * 1.4, seed: Math.random() * 9 });
        }
        if (Math.random() < dt * 3.2 * big) {
          this.parts.push({ kind: 'smoke', x: p.x + (Math.random() - 0.5) * 3, y: topY - 4,
            vx: wind * 4, vy: -7 - Math.random() * 4, life: 0, max: 2.8 + Math.random() * 1.6, seed: Math.random() * 9 });
        }
        if (p.def.fire && p.camp.kind === 'main' && Math.random() < dt * 1.4) {
          const k = campArt('kettle');
          this.parts.push({ kind: 'steam', x: p.x + 13 - k.ox + k.spout.x, y: y + 1 - k.oy + k.spout.y,
            vx: -3 + wind * 2, vy: -5, life: 0, max: 1.2 + Math.random(), seed: Math.random() * 9 });
        }
      }
    }
    const z = cam.zoom;
    const s1 = Math.max(1, Math.round(z));
    for (let n = this.parts.length - 1; n >= 0; n--) {
      const q = this.parts[n];
      q.life += dt;
      if (q.life >= q.max || !cam.isVisible(q.x, q.y, 60)) { this.parts.splice(n, 1); continue; }
      const u = q.life / q.max;
      if (q.kind === 'ember') {
        q.vx += Math.sin(g.time * 4 + q.seed) * 30 * dt + wind * 6 * dt;
        q.vy *= 1 - dt * 0.6;
        q.x += q.vx * dt; q.y += q.vy * dt;
        ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
        ctx.fillStyle = u < 0.3 ? '#fff0a8' : u < 0.6 ? '#ffa23a' : '#d2481c';
        if (Math.sin(g.time * 30 + q.seed * 7) > -0.6) ctx.fillRect(Math.round(gsx(cam, q.x)), Math.round(gsy(cam, q.y)), s1, s1);
      } else {
        q.vx += wind * 2 * dt;
        q.x += (q.vx + Math.sin(g.time * 0.9 + q.seed) * 2) * dt; q.y += q.vy * dt;
        q.vy *= 1 - dt * 0.15;
        const steam = q.kind === 'steam';
        const r = Math.round((steam ? 1 + u * 2 : 1.5 + u * 4.5) * z);
        ctx.globalAlpha = (steam ? 0.28 : 0.2) * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u * 0.4);
        ctx.fillStyle = steam ? '#e8e4dc' : u < 0.25 ? '#5a4a40' : '#7a7068';
        const sx = Math.round(gsx(cam, q.x)), sy = Math.round(gsy(cam, q.y));
        ctx.fillRect(sx - r, sy - Math.round(r * 0.7), r * 2, Math.max(1, Math.round(r * 1.4)));
        ctx.fillRect(sx - Math.round(r * 0.7), sy - r, Math.round(r * 1.4), r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Into the light layer, between beginLights and endLights. */
  lights(r, cam) {
    const g = this.game;
    const dark = this.dark;
    const t = g.time;
    for (const c of this._visible(cam)) {
      for (const p of c.items) {
        const L = p.def.light;
        if (!L) continue;
        if (p.def.lamp && dark < 0.2) continue;
        const y = (p.seatY ?? g.terrain.baseY(p.x));
        const flick = p.def.lamp ? 0.97 + Math.sin(t * 3.1 + p.x) * 0.03
          : 0.86 + Math.sin(t * 8.3 + p.x) * 0.07 + Math.sin(t * 19.1 + p.x * 3) * 0.05 + (Math.random() - 0.5) * 0.04;
        let ly = y - 8;
        let lx = p.x;
        if (p.def.lamp) { const a = campArt('lanternLit'); ly = y - a.oy + a.lamp.y; lx = p.x + (p.flip ? -1 : 1) * (a.lamp.x - a.ox); }
        if (p.def.torch) ly = y - 21;
        const s = cam.worldToScreen(lx, ly);
        const k = 0.35 + dark * 0.65;
        r.addLight(s.x, s.y, L.r * cam.zoom * (0.94 + flick * 0.06), L.col, L.a * flick * k);
        if (p.def.fire) r.addLight(s.x, s.y + 3 * cam.zoom, 30 * cam.zoom, '#ffe0a0', 0.55 * flick * k);
      }
    }
  }

  /** The interface: the CAMP stone, the kit bar, the chest window, the night. */
  drawUI(ctx, W, H) {
    const g = this.game;
    this.btnRect = null;
    this.kitRects = null;
    if (g.state !== 'play') return;
    // while a chest or the night has the screen, the interface underneath is
    // not drawn - so nothing it left behind (a button, the walking stick's
    // zone) may go on catching fingers
    if (this.modal) { g.ui.buttons.length = 0; g.ui.stickZone = null; }
    if (this.sleep) { drawSleepCard(ctx, W, H, this); return; }
    if (this.chestUI.open) { this.chestUI.draw(ctx, W, H); return; }
    const ui = g.ui;
    const inside = ui.tree.dive > 0.1 || ui.drawer > 0.02 || ui.paused || ui.bookOpen || ui.buildOn
      || g.talk?.on || g.puzzle?.on || g.ending?.on || g.work?.modal || g.work?.timed || !!g.unlockCard;
    if (inside) return;
    if (!this.kitOpen) return;
    this.btnRect = drawCampButton(ctx, W, H, this);
    if (this.btnRect) ui.buttons.push({ ...this.btnRect, key: 'p' });
    if (this.placing) {
      // the ghost goes over everything, the crab included: it is a question
      // you are asking, not a thing in the world yet
      this._drawGhost(ctx, g.cam);
      this.kitRects = drawCampKit(ctx, W, H, this, kitLayout(W, H, this));
      // on a phone the slots are claimed controls; a tap on one comes back as
      // a click where the finger was
      for (const r of this.kitRects.slots) ui.buttons.push({ ...r });
      if (this.kitRects.close) ui.buttons.push({ ...this.kitRects.close });
    }
  }

  // -- save ------------------------------------------------------------------

  toJSON() {
    const placed = [];
    for (const p of this.pieces()) if (p.placed) placed.push({ uid: p.uid, k: p.k, x: p.x, flip: p.flip });
    const chests = {};
    for (const uid of this.touched) if (this.chests.has(uid)) chests[uid] = this.chests.get(uid).map((e) => [e[0], e[1]]);
    const found = this.list.filter((c) => c.found && c.kind !== 'player').map((c) => c.id);
    return { placed, chests, n: this.placedN, found };
  }

  fromJSON(d) {
    // a load lands on a fresh run, so whatever was pitched comes back on top
    // of the world's own camps
    for (const c of this.list) c.items = c.items.filter((p) => !p.placed);
    this.list = this.list.filter((c) => c.kind !== 'player');
    this.chests.clear();
    this.touched.clear();
    this.placing = null;
    this.sleep = null;
    this.chestUI.close();
    if (!d) return;
    this.placedN = d.n || 0;
    for (const p of d.placed || []) {
      if (PIECES[p.k]) this._addPlaced(p);
      const m = /^p(\d+)$/.exec(p.uid || '');
      if (m) this.placedN = Math.max(this.placedN, +m[1]);
    }
    const found = new Set(d.found || []);
    for (const c of this.list) c.found = c.kind === 'player' || found.has(c.id);
    for (const [uid, items] of Object.entries(d.chests || {})) {
      this.chests.set(uid, (items || []).filter((e) => ITEM_BY_ID[e[0]] && e[1] > 0).map((e) => [e[0], e[1] | 0]));
      this.touched.add(uid);
    }
  }
}
