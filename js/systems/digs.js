// CRABDEN - what is under the sand.
//
// Everything that lived in this basin is still here. It is just under a metre
// of what used to be the seabed. A crab with a broad enough claw can open the
// ground and take out whatever the sea left, and some of what the sea left is
// not as dead as it looks.
//
// Sites are deterministic: the same seed puts the same fossil in the same
// place for ever, so digging somewhere twice is never rewarded and a place you
// remember is still there when you come back.

import { mulberry32, hashStr, clamp01 } from '../lib/math.js';

const CELL = 300;             // one possible site per cell of desert

export const RELICS = [
  {
    id: 'trilobite', name: 'Trilobite Plate', kind: 'fossil', incubate: 70,
    hatch: 'copperscarab',
    desc: 'A segmented back the size of your palm, pressed flat into shale. '
      + 'Whatever it was, something very like it is still walking around out here.',
  },
  {
    id: 'ammonite', name: 'Coiled Shell', kind: 'fossil', incubate: 90,
    hatch: 'bonecentipede',
    desc: 'A spiral with chambers in it. It floated. There is nothing left in this '
      + 'basin for a thing like this to float in.',
  },
  {
    id: 'amberfly', name: 'Amber, with something in it', kind: 'amber', incubate: 60,
    hatch: 'glasswing',
    desc: 'Resin from a tree that has not existed for a thousand years, with a '
      + 'wing still folded inside it.',
  },
  {
    id: 'amberegg', name: 'Amber, with an egg in it', kind: 'amber', incubate: 120,
    hatch: 'duneskink',
    desc: 'Not resin. Not entirely. Something laid this and then sealed it, and it '
      + 'has been waiting in the dark about as long as you have.',
  },
  {
    id: 'vertebra', name: 'Vertebra', kind: 'fossil', incubate: 140,
    hatch: 'ridgeback',
    desc: 'One bone out of a spine, and the spine was longer than you are.',
  },
];

export const RELIC_BY_ID = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export class Digs {
  constructor(game, seed) {
    this.game = game;
    this.seed = String(seed);
    this.taken = new Set();
    this.brood = [];        // relics incubating on your back
  }

  /** The site in this cell, or null. Same answer for ever. */
  siteAt(ci) {
    const r = mulberry32((hashStr(this.seed + 'dig') ^ (ci * 2246822519)) >>> 0);
    if (r() > 0.34) return null;
    const relic = RELICS[Math.floor(r() * RELICS.length)];
    const x = ci * CELL + CELL * (0.15 + r() * 0.7);
    return { id: 'dig' + ci, ci, x, relic, deep: 0.3 + r() * 0.7 };
  }

  near(x, radius = 260) {
    const out = [];
    for (let ci = Math.floor((x - radius) / CELL); ci <= Math.floor((x + radius) / CELL); ci++) {
      const s = this.siteAt(ci);
      if (s && !this.taken.has(s.id) && Math.abs(s.x - x) <= radius) out.push(s);
    }
    return out;
  }

  /** The one you could dig up right now, if any. */
  reachable(x) {
    const list = this.near(x, 40);
    if (!list.length) return null;
    return list.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  }

  /**
   * Open the ground and take what is in it. A broad claw finds more: without
   * one you can only reach the shallow sites at all.
   */
  /**
   * Take it out of the ground. `check` asks whether you could, without doing
   * it - the work system needs to know before it starts five seconds of
   * somebody kneeling in the sand.
   */
  dig(site, check = false) {
    const e = this.game.economy;
    const power = e.stat('fossil');
    if (!power) return { ok: false, msg: 'You would need a claw made for digging.' };
    if (site.deep > 0.55 && power < 2) return { ok: false, msg: 'It is deeper than you can reach.' };
    if (this.taken.has(site.id)) return { ok: false, msg: 'Already out.' };
    if (!check) this.taken.add(site.id);
    return { ok: true, relic: site.relic };
  }

  // -- incubation -----------------------------------------------------------

  /** Put a relic in the wet of your own basin and wait. */
  incubate(relicId) {
    const relic = RELIC_BY_ID[relicId];
    if (!relic) return { ok: false, msg: 'Nothing like that in your pack.' };
    if (this.brood.length >= 3) return { ok: false, msg: 'Three at once is all the basin holds.' };
    this.brood.push({ id: relicId, t: 0, a: (Math.random() - 0.5) * 0.7, b: -0.30 });
    return { ok: true, msg: `${relic.name} is in the water. Keep the basin full.` };
  }

  update(dt) {
    const pond = this.game.garden.pond;
    for (let i = this.brood.length - 1; i >= 0; i--) {
      const b = this.brood[i];
      const relic = RELIC_BY_ID[b.id];
      if (!relic) { this.brood.splice(i, 1); continue; }
      // it only develops in standing water, which is the whole point
      if (pond < 0.25) continue;
      b.t += dt * (0.5 + pond);
      if (b.t >= relic.incubate) {
        this.brood.splice(i, 1);
        this.game.onHatched?.(relic);
      }
    }
  }

  progress(b) {
    const relic = RELIC_BY_ID[b.id];
    return relic ? clamp01(b.t / relic.incubate) : 0;
  }

  toJSON() { return { taken: [...this.taken], brood: this.brood }; }
  fromJSON(d) {
    if (!d) return;
    this.taken = new Set(d.taken || []);
    this.brood = d.brood || [];
  }
}
