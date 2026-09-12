// CRABDEN - the small print of the desert.
//
// The bestiary is the things big enough to matter to you. This is everything
// under that: the layer you are not supposed to notice until you stop and look,
// and then cannot stop noticing.
//
// None of them can be tamed, fought, eaten or collected. They are not content.
// They are the reason a frame with nothing happening in it is still worth
// looking at - and the reason the desert reads as a place that was here before
// you woke up and will carry on after you have gone.
//
// Each one is its own animal, not a recolour: its own silhouette, its own way
// of moving, its own hours, and its own opinion about wind. They live in a
// deterministic band around the camera, so the same stretch of desert has the
// same small life in it every time you walk back down it.

import { clamp, clamp01, lerp, damp, TAU, mulberry32, hashStr } from '../lib/math.js';

const CELL = 120;             // one colony per cell of desert
const MAX_LIVE = 140;         // hard cap on how many are simulated at once

/**
 * The catalogue. `n` is how many turn up together, `band` is where in the
 * frame it lives (0 on the ground, 1 in the air), `hours` is when it is out,
 * and `draw` is the whole animal - eight or ten pixels, done by hand.
 */
export const CRITTERS = [
  {
    id: 'skitterling', name: 'Skitterling', n: [3, 7], band: 0, weight: 16,
    hours: [5, 20], wind: 0.4, col: ['#6b4a28', '#8a6338', '#c9a06a'],
    desc: 'Runs in short bursts and stops dead. It is never in the middle of anything.',
    move: 'dart', size: 1,
  },
  {
    id: 'glassmite', name: 'Glass Mite', n: [5, 12], band: 0, weight: 13,
    hours: [9, 16], wind: 0.2, col: ['#9fc4cc', '#c6e2e8', '#f0fbff'],
    desc: 'Almost transparent. You see the shadow before you see the animal.',
    move: 'drift', size: 0.7,
  },
  {
    id: 'saltflea', name: 'Salt Flea', n: [6, 14], band: 0, weight: 15,
    hours: [0, 24], wind: 0.6, col: ['#cfc6ae', '#e8e0cc', '#fffaf0'],
    desc: 'Lives in the crust. Jumps the length of its own body forty times a minute.',
    move: 'hop', size: 0.6,
  },
  {
    id: 'dustmoth', name: 'Dust Moth', n: [2, 5], band: 1, weight: 11,
    hours: [17, 6], wind: 0.8, col: ['#8c7f9a', '#b3a6c0', '#ded2e8'],
    desc: 'Flies badly and on purpose. Nothing that eats it can predict it either.',
    move: 'flutter', size: 1,
  },
  {
    id: 'threadworm', name: 'Thread Worm', n: [1, 3], band: 0, weight: 8,
    hours: [0, 24], wind: 0.1, col: ['#a4566a', '#c07084', '#dc95a5'],
    desc: 'Comes up where the sand is damp and goes down again before you reach it.',
    move: 'wriggle', size: 1.2,
  },
  {
    id: 'pipergnat', name: 'Piper Gnat', n: [8, 20], band: 1, weight: 12,
    hours: [4, 9], wind: 0.9, col: ['#c8b46a', '#e2d08a', '#fff0b4'],
    desc: 'A column of them stands over one spot all morning for reasons of its own.',
    move: 'swarm', size: 0.5,
  },
  {
    id: 'ashtick', name: 'Ash Tick', n: [1, 2], band: 0, weight: 7,
    hours: [0, 24], wind: 0, col: ['#4a4038', '#6a5c4e', '#8d7d6a'],
    desc: 'Holds absolutely still on a stone until something warm goes past.',
    move: 'still', size: 0.9,
  },
  {
    id: 'quillhopper', name: 'Quill Hopper', n: [2, 4], band: 0, weight: 10,
    hours: [6, 19], wind: 0.3, col: ['#5c6b3a', '#7e9150', '#a8bd74'],
    desc: 'Green, which out here is either a lie or a very good idea.',
    move: 'hop', size: 1.4,
  },
  {
    id: 'sunmite', name: 'Ember Mite', n: [4, 9], band: 0, weight: 9,
    hours: [10, 15], wind: 0.2, col: ['#a8341c', '#d0562c', '#f08a4a'],
    desc: 'Only out in the worst of the heat. Nothing else is competing for it.',
    move: 'dart', size: 0.6,
  },
  {
    id: 'lanternfly', name: 'Lantern Fly', n: [2, 6], band: 1, weight: 8,
    hours: [19, 5], wind: 0.5, col: ['#3a6a5a', '#5ca88a', '#9ef0c8'],
    desc: 'Cold green, and it goes out the moment you look straight at it.',
    move: 'flutter', size: 0.8, glow: '#7fe8b4',
  },
  {
    id: 'boneburrower', name: 'Bone Burrower', n: [1, 2], band: 0, weight: 6,
    hours: [20, 4], wind: 0, col: ['#cbc2ae', '#e0d8c4', '#f4eeda'],
    desc: 'Surfaces, turns its head once, and is gone before you are sure.',
    move: 'surface', size: 1.1,
  },
  {
    id: 'ribbonshrimp', name: 'Sand Shrimp', n: [2, 5], band: 0, weight: 7,
    hours: [0, 24], wind: 0.3, col: ['#b06a8a', '#d08aa8', '#eeb0c6'],
    desc: 'A thousand years and it has still not accepted that the sea has gone.',
    move: 'wriggle', size: 0.9, wet: true,
  },
];

const TOTAL_W = CRITTERS.reduce((t, c) => t + c.weight, 0);
const BY_ID = Object.fromEntries(CRITTERS.map((c) => [c.id, c]));

/** Is this thing out at this hour? Bands can wrap past midnight. */
function awake(def, hour) {
  const [a, b] = def.hours;
  if (a === 0 && b === 24) return 1;
  if (a < b) return hour >= a && hour < b ? 1 : 0;
  return hour >= a || hour < b ? 1 : 0;
}

export class Critters {
  constructor(game, seed) {
    this.game = game;
    this.seed = String(seed);
    this.live = [];
    this.cells = new Map();       // ci -> the colony there, once decided
    this.t = 0;
  }

  /** What lives in this cell, decided once and for ever. */
  colony(ci) {
    let c = this.cells.get(ci);
    if (c !== undefined) return c;
    const r = mulberry32((hashStr(this.seed + 'crit') ^ (ci * 2654435761)) >>> 0);
    if (r() > 0.74) { this.cells.set(ci, null); return null; }
    let roll = r() * TOTAL_W;
    let def = CRITTERS[0];
    for (const d of CRITTERS) { roll -= d.weight; if (roll <= 0) { def = d; break; } }
    const n = def.n[0] + Math.floor(r() * (def.n[1] - def.n[0] + 1));
    c = { ci, def, n, x: ci * CELL + r() * CELL, seed: r() * TAU };
    this.cells.set(ci, c);
    return c;
  }

  update(dt, weather) {
    this.t += dt;
    const cam = this.game.cam;
    if (!cam) return;
    const hour = this.game.weather ? this.game.weather.hour : 12;
    const wind = weather ? weather.windVec().x : 0.3;
    const sand = weather ? (weather.sand || 0) : 0;
    const b = cam.bounds(140);

    // ---- bring in what should be here, let go of what should not ----------
    const wantCells = new Set();
    for (let ci = Math.floor(b.x0 / CELL); ci <= Math.floor(b.x1 / CELL); ci++) wantCells.add(ci);
    const have = new Set(this.live.map((q) => q.ci));
    for (const ci of wantCells) {
      if (have.has(ci)) continue;
      const col = this.colony(ci);
      if (!col) continue;
      if (!awake(col.def, hour)) continue;
      if (this.live.length >= MAX_LIVE) break;
      this._hatch(col);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const q = this.live[i];
      if (q.x < b.x0 - 60 || q.x > b.x1 + 60 || !awake(q.def, hour)) this.live.splice(i, 1);
    }

    // ---- and move them ----------------------------------------------------
    const t = this.game.terrain;
    for (const q of this.live) {
      q.t += dt;
      const d = q.def;
      // wind pushes the light ones about, and a storm puts most of them away
      const blow = wind * 26 * d.wind;
      switch (d.move) {
        case 'dart':
          // still, still, still, gone
          q.wait -= dt;
          if (q.wait <= 0) {
            q.wait = 0.5 + Math.random() * 2.2;
            q.vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 60);
            q.run = 0.18 + Math.random() * 0.2;
          }
          q.run -= dt;
          if (q.run <= 0) q.vx = 0;
          break;
        case 'hop':
          q.wait -= dt;
          if (q.wait <= 0 && q.z <= 0) {
            q.wait = 0.25 + Math.random() * 0.8;
            q.zv = 26 + Math.random() * 34;
            q.vx = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 26);
          }
          break;
        case 'drift':
          q.vx = damp(q.vx, blow + Math.sin(q.t * 0.7 + q.seed) * 8, 0.02, dt);
          break;
        case 'flutter':
          // a moth does not fly, it falls in a direction
          q.vx = damp(q.vx, blow + Math.sin(q.t * 2.3 + q.seed) * 34, 0.05, dt);
          q.zv = Math.sin(q.t * 5.1 + q.seed * 2) * 40;
          q.z = clamp(q.z + q.zv * dt, 4, 44);
          break;
        case 'swarm': {
          // it belongs to the column, not to itself
          const home = q.homeX + Math.sin(q.t * 0.9 + q.seed) * 9;
          q.vx = damp(q.vx, (home - q.x) * 3 + blow * 0.3, 0.02, dt);
          q.z = clamp(14 + Math.sin(q.t * 3.4 + q.seed * 3) * 12 + (q.uid % 5) * 3, 4, 40);
          break;
        }
        case 'wriggle':
          q.vx = damp(q.vx, Math.sin(q.t * 1.6 + q.seed) * 18, 0.03, dt);
          break;
        case 'surface':
          // up for a moment, then gone under again
          q.wait -= dt;
          if (q.wait <= 0) {
            q.wait = 3 + Math.random() * 7;
            q.up = 1.4;
            q.x = q.homeX + (Math.random() - 0.5) * 60;
          }
          q.up = Math.max(0, (q.up || 0) - dt);
          break;
        case 'still':
        default:
          q.vx = 0;
          break;
      }

      if (d.band === 0) {
        // on the ground, and hopping ones come back down to it
        if (q.zv || q.z > 0) {
          q.zv -= 260 * dt;
          q.z = Math.max(0, q.z + q.zv * dt);
          if (q.z <= 0) { q.zv = 0; q.vx *= 0.3; }
        }
      }
      q.x += q.vx * dt;
      q.y = t.surfaceY(q.x);
      // a storm drives everything small into the sand
      q.hide = damp(q.hide, sand > 0.3 ? 1 : 0, 0.002, dt);
    }
  }

  _hatch(col) {
    const d = col.def;
    for (let i = 0; i < col.n && this.live.length < MAX_LIVE; i++) {
      const x = col.x + (Math.random() - 0.5) * CELL * 0.8;
      this.live.push({
        ci: col.ci, def: d, uid: this.live.length + i,
        x, homeX: x, y: this.game.terrain.surfaceY(x),
        vx: 0, z: d.band === 1 ? 8 + Math.random() * 24 : 0, zv: 0,
        t: Math.random() * 10, seed: Math.random() * TAU,
        wait: Math.random() * 2, run: 0, up: 0, hide: 0,
        flip: Math.random() < 0.5 ? -1 : 1,
      });
    }
  }

  // -- drawing --------------------------------------------------------------

  /**
   * Every one of these is drawn by hand at its own size, because the whole
   * point is that they are not the same animal in different colours. At this
   * scale an animal is a silhouette and two accents, so that is what each one
   * gets.
   */
  draw(ctx, cam) {
    const z = cam.zoom;
    for (const q of this.live) {
      if (q.hide > 0.85) continue;
      const d = q.def;
      const s = cam.worldToScreen(q.x, q.y - q.z - (d.band === 1 ? 0 : 1));
      const S = Math.max(1, z * d.size);
      const px = Math.round(s.x), py = Math.round(s.y);
      const [dark, mid, lit] = d.col;
      ctx.save();
      ctx.globalAlpha = (1 - q.hide) * (d.id === 'glassmite' ? 0.55 : 1);
      const dir = q.vx < -2 ? -1 : q.vx > 2 ? 1 : q.flip;
      const wag = Math.sin(q.t * 14) * S * 0.5;

      switch (d.id) {
        case 'skitterling': {
          // a body and six legs, and the legs only show while it is moving
          ctx.fillStyle = mid;
          ctx.fillRect(px - S, py - S, S * 2, S);
          ctx.fillStyle = lit;
          ctx.fillRect(px + (dir > 0 ? S : -S - 1), py - S, 1, 1);
          if (Math.abs(q.vx) > 4) {
            ctx.fillStyle = dark;
            for (let L = -1; L <= 1; L++) ctx.fillRect(px + L * S, py, 1, Math.max(1, S * 0.7));
          }
          break;
        }
        case 'glassmite': {
          // you see the shadow first
          ctx.globalAlpha *= 0.5;
          ctx.fillStyle = '#6a553a';
          ctx.fillRect(px, py + 1, Math.max(1, S), 1);
          ctx.globalAlpha = (1 - q.hide) * 0.5;
          ctx.fillStyle = lit;
          ctx.fillRect(px - S * 0.5, py - S, Math.max(1, S), Math.max(1, S));
          break;
        }
        case 'saltflea': {
          ctx.fillStyle = q.z > 1 ? lit : mid;
          ctx.fillRect(px, py - S, Math.max(1, S * 0.9), Math.max(1, S * 0.9));
          break;
        }
        case 'dustmoth': {
          // two wings beating out of phase with each other
          const beat = Math.abs(Math.sin(q.t * 11));
          ctx.fillStyle = mid;
          ctx.fillRect(px - S * 1.4, py - S * beat, Math.max(1, S * 1.2), Math.max(1, S * 0.8));
          ctx.fillRect(px + S * 0.3, py - S * (1 - beat) * 0.8, Math.max(1, S * 1.2), Math.max(1, S * 0.8));
          ctx.fillStyle = dark;
          ctx.fillRect(px - S * 0.2, py - S * 0.4, Math.max(1, S * 0.6), Math.max(1, S));
          break;
        }
        case 'threadworm': {
          // a curve of segments, and it keeps its head up
          ctx.fillStyle = mid;
          for (let i = 0; i < 5; i++) {
            const a = q.t * 4 + i * 0.9;
            ctx.fillRect(Math.round(px + i * S * 0.7 * dir),
              Math.round(py - S * 0.6 - Math.sin(a) * S * 0.7), Math.max(1, S * 0.7), Math.max(1, S * 0.7));
          }
          ctx.fillStyle = lit;
          ctx.fillRect(px, Math.round(py - S * 1.3), Math.max(1, S * 0.7), Math.max(1, S * 0.7));
          break;
        }
        case 'pipergnat': {
          ctx.fillStyle = lit;
          ctx.fillRect(px, py, Math.max(1, S), Math.max(1, S));
          break;
        }
        case 'ashtick': {
          // a wedge that does not move at all
          ctx.fillStyle = dark;
          ctx.fillRect(px - S, py - S * 1.2, Math.max(1, S * 2), Math.max(1, S * 1.2));
          ctx.fillStyle = mid;
          ctx.fillRect(px - S, py - S * 1.2, Math.max(1, S * 2), 1);
          break;
        }
        case 'quillhopper': {
          // a body, two long back legs, and spines along the top
          ctx.fillStyle = mid;
          ctx.fillRect(px - S, py - S * 1.3, Math.max(1, S * 2), Math.max(1, S * 1.3));
          ctx.fillStyle = dark;
          ctx.fillRect(px - S * 1.4 * dir, py - S * 0.6, Math.max(1, S * 0.8), Math.max(1, S * 1.4));
          ctx.fillStyle = lit;
          for (let i = -1; i <= 1; i++) ctx.fillRect(px + i * S * 0.8, py - S * 1.8, 1, Math.max(1, S * 0.6));
          break;
        }
        case 'sunmite': {
          ctx.fillStyle = mid;
          ctx.fillRect(px - S * 0.5, py - S, Math.max(1, S), Math.max(1, S));
          ctx.fillStyle = lit;
          ctx.fillRect(px - S * 0.5, py - S, 1, 1);
          break;
        }
        case 'lanternfly': {
          // the light first, then the animal inside it
          const on = 0.35 + 0.65 * Math.abs(Math.sin(q.t * 1.7 + q.seed));
          const gr = ctx.createRadialGradient(px, py, 0, px, py, S * 6);
          gr.addColorStop(0, `rgba(127,232,180,${0.5 * on})`);
          gr.addColorStop(1, 'rgba(127,232,180,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(px, py, S * 6, 0, TAU); ctx.fill();
          ctx.fillStyle = lit;
          ctx.fillRect(px, py, Math.max(1, S), Math.max(1, S));
          break;
        }
        case 'boneburrower': {
          const up = clamp01(q.up / 1.4);
          if (up <= 0.01) break;
          const h = S * 3 * up;
          ctx.fillStyle = mid;
          ctx.fillRect(px - S * 0.6, Math.round(py - h), Math.max(1, S * 1.2), Math.max(1, h));
          ctx.fillStyle = dark;
          ctx.fillRect(px - S * 0.6 + (dir > 0 ? S * 0.8 : 0), Math.round(py - h), 1, 1);
          // the sand it pushed up coming out
          ctx.fillStyle = 'rgba(198,166,112,0.5)';
          ctx.fillRect(px - S * 1.6, py, Math.max(1, S * 3.2), 1);
          break;
        }
        case 'ribbonshrimp': {
          // a curl of segments with a fan on the end
          ctx.fillStyle = mid;
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(Math.round(px + i * S * 0.6 * dir),
              Math.round(py - S * 0.8 - i * S * 0.18), Math.max(1, S * 0.6), Math.max(1, S * 0.7));
          }
          ctx.fillStyle = lit;
          ctx.fillRect(Math.round(px - S * 0.7 * dir), Math.round(py - S * 0.9 + wag * 0.3),
            Math.max(1, S * 0.7), Math.max(1, S * 0.5));
          break;
        }
        default:
          ctx.fillStyle = mid;
          ctx.fillRect(px, py - S, Math.max(1, S), Math.max(1, S));
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** How many of what is on screen right now, for the field notes. */
  census() {
    const out = new Map();
    for (const q of this.live) out.set(q.def.id, (out.get(q.def.id) || 0) + 1);
    return [...out.entries()].map(([id, n]) => ({ def: BY_ID[id], n }));
  }
}
