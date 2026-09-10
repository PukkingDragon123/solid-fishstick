// CRABDEN - what is over the next dune.
//
// The desert is not empty and it is not random either: points of interest are
// generated deterministically from the world seed, so the ruin you walked past
// is still there tomorrow. Walking into one gives you something; some of them
// give you something with teeth.

import { clamp, clamp01, lerp, mulberry32, hashStr, TAU } from '../lib/math.js';
import { Painter, makeCanvas } from '../render/pixel.js';
import { MATERIALS } from '../lib/palette.js';
import { buildPlant } from '../art/floraart.js';
import { FLORA, FLORA_BY_ID } from '../data/flora.js';
import { biomeAt } from '../world/biomes.js';

const CELL = 340;          // one point of interest per stretch of desert

const KINDS = [
  { id: 'relic', name: 'Buried Relic', w: 0.20, verb: 'Excavate' },
  { id: 'wildpatch', name: 'Wild Patch', w: 0.22, verb: 'Harvest' },
  { id: 'seep', name: 'Water Seep', w: 0.16, verb: 'Drink' },
  { id: 'ruin', name: 'Ruin', w: 0.16, verb: 'Salvage' },
  { id: 'carcass', name: 'Old Kill', w: 0.10, verb: 'Search' },
  { id: 'nest', name: 'Nest', w: 0.10, verb: 'Approach' },
  { id: 'trap', name: 'Disturbed Sand', w: 0.06, verb: 'Investigate' },
];

export class Encounters {
  constructor(game, seed) {
    this.game = game;
    this.seed = hashStr(String(seed) + '-poi');
    this.cells = new Map();
    this.taken = new Set();
    this.art = new Map();
    this.active = null;
    this.hint = null;
  }

  // -- generation -----------------------------------------------------------

  cell(ci) {
    const key = String(ci);
    let c = this.cells.get(key);
    if (c !== undefined) return c;
    const r = mulberry32(this.seed ^ (ci * 2654435761));
    if (ci === 0 || r() < 0.22) { this.cells.set(key, null); return null; }
    let roll = r(), pick = KINDS[0];
    let acc = 0;
    for (const k of KINDS) { acc += k.w; if (roll <= acc) { pick = k; break; } }
    const x = ci * CELL + CELL * (0.25 + r() * 0.5);
    const biome = biomeAt(x);
    const poi = {
      id: `${ci}`, ci, kind: pick.id, name: pick.name, verb: pick.verb,
      x, seed: (this.seed ^ (ci * 40503)) >>> 0, biome: biome.id,
      variant: Math.floor(r() * 3),
      plant: pick.id === 'wildpatch'
        ? (biome.plants && biome.plants.length
          ? biome.plants[Math.floor(r() * biome.plants.length)]
          : FLORA[Math.floor(r() * 6)].id)
        : null,
      scale: 0.8 + r() * 0.5,
    };
    this.cells.set(key, poi);
    return poi;
  }

  near(x, radius = CELL) {
    const out = [];
    const c0 = Math.floor((x - radius) / CELL), c1 = Math.floor((x + radius) / CELL);
    for (let ci = c0; ci <= c1; ci++) {
      const p = this.cell(ci);
      if (p && Math.abs(p.x - x) <= radius) out.push(p);
    }
    return out;
  }

  isTaken(p) { return this.taken.has(p.id + ':' + p.kind); }

  // -- interaction ----------------------------------------------------------

  update(dt) {
    const g = this.game;
    const cx = g.crab.x;
    this.hint = null;
    let best = null, bd = 34;
    for (const p of this.near(cx, 200)) {
      if (this.isTaken(p)) continue;
      const d = Math.abs(p.x - cx);
      if (d < bd) { bd = d; best = p; }
    }
    this.active = best;
    if (best) this.hint = `${best.verb} ${best.name}`;

    // a scout in the fleet calls out what is ahead
    if (g.economy.stat('warn') > 0) {
      const dir = g.crab.facing || 1;
      for (const p of this.near(cx + dir * 150, 130)) {
        if (this.isTaken(p) || p.kind !== 'trap') continue;
        this.warned = p;
      }
    }
  }

  /** Take whatever is here. Returns a short line to show the player. */
  interact() {
    const p = this.active;
    if (!p) return null;
    const g = this.game;
    this.taken.add(p.id + ':' + p.kind);
    const r = mulberry32(p.seed);
    switch (p.kind) {
      case 'relic': {
        const n = 12 + Math.floor(r() * 26);
        g.economy.nutrients += n;
        g.fx.spark(p.x, g.terrain.surfaceY(p.x) - 8, '#e2b74a', 14, 50);
        g.fx.popup(p.x, g.terrain.surfaceY(p.x) - 16, `+${n} nutrients`, '#e2b74a');
        return `Something manufactured, and older than you. +${n} nutrients.`;
      }
      case 'wildpatch': {
        const id = p.plant || 'dustmoss';
        const def = FLORA_BY_ID[id];
        g.seeds[id] = (g.seeds[id] || 0) + 1 + Math.floor(r() * 2);
        g.economy.berries += 1 + Math.floor(r() * 3);
        g.fx.spark(p.x, g.terrain.surfaceY(p.x) - 6, '#8cc468', 10, 34);
        return `${def ? def.name : id} seed, taken clean. It will grow on you.`;
      }
      case 'seep': {
        const w = 40 + Math.floor(r() * 60);
        g.economy.water = Math.min(g.economy.stat('waterMax'), g.economy.water + w);
        g.garden.pumpInto(0.25);
        g.fx.splash(p.x, g.terrain.surfaceY(p.x), 10, 30);
        g.fx.popup(p.x, g.terrain.surfaceY(p.x) - 14, `+${w} water`, '#9de3ee');
        return `Groundwater, close enough to the surface to reach. +${w} water.`;
      }
      case 'ruin': {
        const n = 8 + Math.floor(r() * 16);
        const w = 20 + Math.floor(r() * 30);
        g.economy.nutrients += n;
        g.economy.water = Math.min(g.economy.stat('waterMax'), g.economy.water + w);
        g.fx.dust(p.x, g.terrain.surfaceY(p.x), 3);
        return `Salvage: +${n} nutrients, +${w} water. Somebody lived here once.`;
      }
      case 'carcass': {
        const b = 2 + Math.floor(r() * 4);
        g.economy.berries += b;
        g.fx.blood(p.x, g.terrain.surfaceY(p.x) - 4, 6);
        return `Picked over, but the seed cache in its crop is intact. +${b} berries.`;
      }
      case 'nest': {
        const pool = g.wildlife ? ['duneskink', 'saltlark', 'quilljerboa', 'glasswing', 'glasstail', 'copperscarab', 'pebbler'] : [];
        const id = pool[Math.floor(r() * pool.length)];
        const c = g.wildlife.spawn(id, p.x + 20);
        if (c) c.trust = 0.55;
        return 'Something is living here, and it has decided you are interesting.';
      }
      case 'trap': {
        g.wildlife.ambush(g.weather.nightMix > 0.4);
        g.cam.shake(6);
        return 'The sand was disturbed for a reason.';
      }
      default: return null;
    }
  }

  // -- art ------------------------------------------------------------------

  _sprite(p) {
    const key = `${p.kind}|${p.variant}|${p.plant || ''}`;
    let a = this.art.get(key);
    if (a) return a;
    a = paintPOI(p);
    this.art.set(key, a);
    return a;
  }

  draw(ctx, cam) {
    const t = this.game.terrain;
    const z = cam.zoom;
    for (const p of this.near(cam.rx, cam.vw / z + CELL)) {
      const taken = this.isTaken(p);
      const art = this._sprite(p);
      if (!art) continue;
      const gy = t.surfaceY(p.x);
      const s = cam.worldToScreen(p.x, gy);
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z, z);
      if (taken) ctx.globalAlpha = 0.55;
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }
}

// ---------------------------------------------------------------------------

function paintPOI(p) {
  const r = mulberry32(p.seed);
  const K = p.scale;
  switch (p.kind) {
    case 'wildpatch': {
      const def = FLORA_BY_ID[p.plant] || FLORA[0];
      const base = buildPlant(def, 3, p.variant, 0.9);
      const w = base.cv.width * 2.2, h = base.cv.height * 1.2;
      const cv = makeCanvas(w, h);
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      const ox = w / 2, oy = h - 4;
      for (let i = 0; i < 4; i++) {
        const a = buildPlant(def, 2 + (i % 2), (p.variant + i) % 3, 0.62 + (i % 2) * 0.3);
        g.drawImage(a.cv, ox - a.ox + (i - 1.5) * 11, oy - a.oy - (i % 2) * 2);
      }
      return { cv, ox, oy };
    }
    case 'relic': {
      const pt = new Painter(Math.ceil(26 * K), Math.ceil(16 * K));
      const cx = pt.w / 2, cy = pt.h - 3;
      pt.ellipse(cx, cy + 2, 10 * K, 4 * K, { mat: 'sandPale', dome: 3 * K, tint: -0.06 });
      pt.poly([{ x: cx - 7 * K, y: cy }, { x: cx - 5 * K, y: cy - 9 * K },
        { x: cx + 4 * K, y: cy - 11 * K }, { x: cx + 7 * K, y: cy }],
        { mat: 'metal', dome: 4 * K, feather: 2.4, tint: 0.02 });
      pt.grain('metal', { freq: 0.5, amp: 0.24, seed: 3 });
      pt.rect(cx - 3 * K, cy - 7 * K, 5 * K, 1.4 * K, { mat: 'metal', mask: true, tint: -0.36, dome: -1.4 });
      pt.ellipse(cx + 2 * K, cy - 8 * K, 1.6 * K, 1.6 * K, { mat: 'glow', dome: 1.6 * K, tint: 0.3, emissive: 1 });
      return { cv: pt.resolve(MATERIALS, { outline: 1, outlineColor: '#181009', ambient: 0.4 }), ox: cx, oy: cy + 3 };
    }
    case 'seep': {
      const pt = new Painter(Math.ceil(34 * K), Math.ceil(14 * K));
      const cx = pt.w / 2, cy = pt.h - 4;
      pt.ellipse(cx, cy, 14 * K, 4.4 * K, { mat: 'rock', dome: 3 * K, tint: -0.1 });
      pt.ellipse(cx, cy - 0.6, 10 * K, 2.8 * K, { mat: 'water', dome: -2 * K, tint: 0.1 });
      pt.ellipse(cx - 3 * K, cy - 1.2, 3 * K, 1.0 * K, { mat: 'waterFoam', mask: true, dome: 0, tint: 0.3 });
      for (let i = 0; i < 5; i++) {
        const a = r() * TAU;
        pt.ellipse(cx + Math.cos(a) * 12 * K, cy + Math.sin(a) * 3 * K, 1.6 * K, 1.2 * K,
          { mat: 'moss', dome: 1.4 * K, tint: (r() - 0.5) * 0.3 });
      }
      return { cv: pt.resolve(MATERIALS, { outline: 1, outlineColor: '#152025', ambient: 0.42 }), ox: cx, oy: cy + 4 };
    }
    case 'ruin': {
      const pt = new Painter(Math.ceil(44 * K), Math.ceil(30 * K));
      const cx = pt.w / 2, cy = pt.h - 3;
      for (let i = 0; i < 3; i++) {
        const px = cx + (i - 1) * 13 * K + (r() - 0.5) * 4;
        const h = (10 + r() * 16) * K;
        pt.poly([{ x: px - 4 * K, y: cy }, { x: px - 3.4 * K, y: cy - h },
          { x: px + 3.2 * K, y: cy - h * (0.7 + r() * 0.3) }, { x: px + 4 * K, y: cy }],
          { mat: 'rock', dome: 4 * K, feather: 2.6, tint: (i - 1) * 0.05 });
      }
      pt.grain('rock', { freq: 0.3, amp: 0.26, seed: 11, height: 0.6 });
      pt.rect(cx - 18 * K, cy - 2.6 * K, 36 * K, 3 * K, { mat: 'rock', dome: 2.4 * K, tint: 0.06 });
      return { cv: pt.resolve(MATERIALS, { outline: 1, outlineColor: '#1a140d', ambient: 0.4 }), ox: cx, oy: cy + 3 };
    }
    case 'carcass': {
      const pt = new Painter(Math.ceil(32 * K), Math.ceil(14 * K));
      const cx = pt.w / 2, cy = pt.h - 4;
      pt.curve([{ x: cx - 11 * K, y: cy }, { x: cx, y: cy - 6 * K }, { x: cx + 11 * K, y: cy - 1 * K }],
        2.0 * K, 1.2 * K, { mat: 'bone', dome: 1.8 * K, steps: 14 });
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const x = lerp(cx - 9 * K, cx + 9 * K, t);
        const y = lerp(cy, cy - 4 * K, Math.sin(t * Math.PI));
        pt.curve([{ x, y }, { x: x - 2 * K, y: y + 4 * K }, { x: x - 1 * K, y: y + 7 * K }],
          1.1 * K, 0.6 * K, { mat: 'bone', dome: 1.0 * K, steps: 8, tint: -0.06 });
      }
      pt.ellipse(cx + 12 * K, cy - 2 * K, 3.4 * K, 2.6 * K, { mat: 'bone', dome: 3 * K, tint: 0.06 });
      return { cv: pt.resolve(MATERIALS, { outline: 1, outlineColor: '#1c1a12', ambient: 0.44 }), ox: cx, oy: cy + 4 };
    }
    case 'nest': {
      const pt = new Painter(Math.ceil(24 * K), Math.ceil(14 * K));
      const cx = pt.w / 2, cy = pt.h - 4;
      for (let i = 0; i < 22; i++) {
        const a = r() * Math.PI - Math.PI;
        const rr = 8 * K;
        pt.capsule(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.4,
          cx + Math.cos(a + 0.7) * rr * 0.8, cy + Math.sin(a + 0.7) * rr * 0.35,
          0.9 * K, 0.6 * K, { mat: 'leafDry', dome: 0.9 * K, tint: (r() - 0.5) * 0.34 });
      }
      for (let i = 0; i < 3; i++) {
        pt.ellipse(cx + (i - 1) * 3.2 * K, cy - 2 * K, 2.2 * K, 2.6 * K,
          { mat: 'bone', dome: 2.4 * K, tint: 0.08 });
      }
      return { cv: pt.resolve(MATERIALS, { outline: 1, outlineColor: '#20180e', ambient: 0.42 }), ox: cx, oy: cy + 4 };
    }
    case 'trap': {
      const pt = new Painter(Math.ceil(30 * K), Math.ceil(8 * K));
      const cx = pt.w / 2, cy = pt.h - 3;
      pt.ellipse(cx, cy, 13 * K, 3.2 * K, { mat: 'sand', dome: -3 * K, tint: -0.16 });
      for (let i = 0; i < 5; i++) {
        pt.ellipse(cx + (r() - 0.5) * 20 * K, cy - r() * 2, 1.4 * K, 0.9 * K,
          { mat: 'sandPale', dome: 1.2 * K, tint: 0.1 });
      }
      return { cv: pt.resolve(MATERIALS, { outline: 0.5, outlineColor: '#6d492a', ambient: 0.44 }), ox: cx, oy: cy + 3 };
    }
    default: return null;
  }
}
