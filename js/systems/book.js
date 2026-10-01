// CRABDEN - the encyclopedia.
//
// Dr. Vess came out here to write one book, and this is it: everything that
// lives, grows, swims, lies buried and is dug out of the old seabed, one page
// each. Filling it in is the long game. Every page you fill pays out a little,
// every chapter you finish pays out a lot, and the last page is the proof that
// this desert was a sea.
//
// A page has four states:
//   0  nothing - a blank, a question mark
//   1  SEEN    - a silhouette and a name; you have seen it but not studied it
//   2  RECORDED - the full entry: the picture, the description, the notes
//   3  MASTERED - you have tamed it, grown it, caught a few, hatched one
//
// Everything that makes a page move is something you were already doing:
// looking at an animal, studying a plant, catching a fish, digging, mining.

import { FAUNA, FAUNA_BY_ID } from '../data/fauna.js';
import { FLORA, FLORA_BY_ID } from '../data/flora.js';
import { FISH, FISH_BY_ID } from '../data/fish.js';
import { RELICS, RELIC_BY_ID } from './digs.js';
import { ITEM_BY_ID } from '../data/craft.js';

const MINERALS = ['copperore', 'ironore', 'silica', 'saltcake', 'shellchip', 'amberchunk'];
const RELIC_ICON = { trilobite: 'trilobite', ammonite: 'ammonite', amberfly: 'amberfly', amberegg: 'amberchunk', vertebra: 'vertebra' };

/**
 * The chapters. `reward` is the growth a finished chapter pays; `how` is what
 * each level of a page asks of you, said on the page so the book is its own
 * instructions.
 */
export const BOOK_TABS = [
  { id: 'creature', name: 'CREATURES', icon: 'paw', reward: 160,
    how: ['Find one.', 'Stand near it with Vess and watch.', 'Tame one.'] },
  { id: 'plant', name: 'PLANTS', icon: 'flower', reward: 120,
    how: ['Find one growing wild.', 'Study it (stand at it and act).', 'Grow and pick it on your back.'] },
  { id: 'fish', name: 'FISH', icon: 'fish', reward: 100,
    how: ['-', 'Catch one in an oasis or the sea.', 'Catch three.'] },
  { id: 'relic', name: 'FOSSILS', icon: 'fossil', reward: 120,
    how: ['-', 'Dig one up.', 'Hatch it in your basin.'] },
  { id: 'mineral', name: 'MINERALS', icon: 'pickaxe', reward: 80,
    how: ['-', 'Mine an outcrop.', 'Mine ten.'] },
];
export const BOOK_TAB_BY_ID = Object.fromEntries(BOOK_TABS.map((t) => [t.id, t]));

/** Every page in a chapter, as { id, name, sub, desc, icon? }. */
export function pages(tab) {
  switch (tab) {
    case 'creature':
      return FAUNA.map((f) => ({ id: f.id, name: f.name, sub: f.sci || '', desc: f.desc || '', notes: f.notes || [], def: f }));
    case 'plant':
      return FLORA.map((f) => ({ id: f.id, name: f.name, sub: f.boonText || '', desc: f.desc || '', def: f }));
    case 'fish':
      return FISH.map((f) => ({ id: f.id, name: f.name, sub: f.latin || '', desc: f.note || '', def: f }));
    case 'relic':
      return RELICS.map((r) => ({ id: r.id, name: r.name, sub: r.kind === 'amber' ? 'Amber' : 'Fossil', desc: r.desc || '', icon: RELIC_ICON[r.id] || 'fossil', def: r }));
    case 'mineral':
      return MINERALS.map((id) => {
        const d = ITEM_BY_ID[id] || { name: id, desc: '' };
        return { id, name: d.name, sub: 'Mineral', desc: d.desc || '', icon: id, def: d };
      });
    default: return [];
  }
}

export function pageDef(tab, id) {
  switch (tab) {
    case 'creature': return FAUNA_BY_ID[id];
    case 'plant': return FLORA_BY_ID[id];
    case 'fish': return FISH_BY_ID[id];
    case 'relic': return RELIC_BY_ID[id];
    default: return ITEM_BY_ID[id];
  }
}

/** Growth paid for a page reaching each level. */
const PAY = [0, 2, 6, 12];

export class Book {
  constructor(game) {
    this.game = game;
    this.level = {};          // tab -> { id: level }
    this.count = {};          // tab -> { id: how many } for the "three of them" pages
    this.claimed = new Set(); // chapters whose reward has been taken
    this.fresh = [];          // pages filled since you last opened the book
    for (const t of BOOK_TABS) { this.level[t.id] = {}; this.count[t.id] = {}; }
  }

  get(tab, id) { return this.level[tab]?.[id] || 0; }
  has(tab, id) { return this.get(tab, id) >= 2; }

  /** One more of something, for the pages that want several. */
  tally(tab, id, n = 1) {
    const c = this.count[tab] || (this.count[tab] = {});
    c[id] = (c[id] || 0) + n;
    return c[id];
  }

  /**
   * Move a page up to `lvl` (never down). Returns true if it moved. Pays the
   * growth for every level it passed, tells you, and checks the chapter.
   */
  record(tab, id, lvl) {
    if (!this.level[tab] || !pageDef(tab, id)) return false;
    // the "several of them" pages count themselves up
    if (lvl >= 2 && (tab === 'fish' || tab === 'mineral')) {
      const n = this.tally(tab, id, 1);
      if (tab === 'fish' && n >= 3) lvl = 3;
      if (tab === 'mineral' && n >= 10) lvl = 3;
    }
    const cur = this.get(tab, id);
    if (lvl <= cur) return false;
    this.level[tab][id] = lvl;
    const g = this.game;
    let pay = 0;
    for (let k = cur + 1; k <= lvl; k++) pay += PAY[k] || 0;
    if (g.economy && pay) { g.economy.nutrients += pay; g.economy.markDirty?.(); }
    if (lvl >= 2) {
      this.fresh.push({ tab, id, lvl, t: 0 });
      if (this.fresh.length > 12) this.fresh.shift();
      const name = pageDef(tab, id)?.name || id;
      g.ui?.bookNote?.(lvl >= 3 ? `${name} - mastered!` : `${name} - into the book`, pay, tab, id);
      g.audio?.play('discover', { pitch: lvl >= 3 ? 1.3 : 1.1 });
      g.quests?.flag?.('book');
    }
    return true;
  }

  /** How far through a chapter you are. */
  progress(tab) {
    const all = pages(tab);
    let have = 0, mastered = 0;
    for (const p of all) {
      const l = this.get(tab, p.id);
      if (l >= 2) have++;
      if (l >= 3) mastered++;
    }
    return { have, mastered, total: all.length, done: have >= all.length };
  }

  /** The whole book, as a fraction and as page counts. */
  get total() {
    let have = 0, total = 0;
    for (const t of BOOK_TABS) { const p = this.progress(t.id); have += p.have; total += p.total; }
    return { have, total, f: total ? have / total : 0 };
  }

  canClaim(tab) { return this.progress(tab).done && !this.claimed.has(tab); }

  /** Take a finished chapter's reward. */
  claim(tab) {
    if (!this.canClaim(tab)) return 0;
    const t = BOOK_TAB_BY_ID[tab];
    this.claimed.add(tab);
    const g = this.game;
    if (g.economy) { g.economy.nutrients += t.reward; g.economy.markDirty?.(); }
    g.audio?.play('evolve');
    g.npc?.say?.(`The ${t.name.toLowerCase()} chapter. Finished. Do you know how long I have waited to write that?`, 6, 3);
    return t.reward;
  }

  toJSON() {
    return { level: this.level, count: this.count, claimed: [...this.claimed] };
  }

  fromJSON(d) {
    if (!d) return;
    for (const t of BOOK_TABS) {
      this.level[t.id] = { ...(d.level?.[t.id] || {}) };
      this.count[t.id] = { ...(d.count?.[t.id] || {}) };
    }
    this.claimed = new Set(d.claimed || []);
  }
}
