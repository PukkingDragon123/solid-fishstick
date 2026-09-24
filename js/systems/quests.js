// CRABDEN - what he wants you to do.
//
// He has been out here eleven years with a notebook and no hands worth
// speaking of - by which he means no shell, no claw and no back you could
// grow anything on. You have all three. So the work he cannot do is the work
// he asks you to do, and that is the whole of the quest system: a man with a
// theory and an animal that can test it.
//
// Nothing here is a marker floating over a thing. A job is a sentence he says
// to you, a line in the corner while it is open, and a sentence he says when
// it is done. The check runs on the world you already have - fill the shell,
// put something alive on your back, bring a bone out clean - so there is
// nothing to "turn in" and no quest state living anywhere but here.

import { baseRank } from './economy.js';
import { SHORE_X } from '../world/ocean.js';

/**
 * THE STORY, in five chapters.
 *
 * It was five loose jobs; it is a story now, with a shape. You wake up in a
 * desert that used to be a sea, and a man who has spent eleven years trying
 * to prove that tells you what he needs. Every chapter is his theory getting
 * one step closer to true, and the last one is the proof swimming in front
 * of him.
 */
export const CHAPTERS = [
  null,
  { n: 1, title: 'THE DRY', sub: 'You are awake, and there is nothing to drink.' },
  { n: 2, title: 'WHAT THE SAND KEPT', sub: 'Everything that drowned here is still here.' },
  { n: 3, title: 'A HOME ON YOUR BACK', sub: 'He cannot carry a camp across a desert. You can.' },
  { n: 4, title: 'THE LIDS', sub: 'The water did not leave. Somebody shut it in.' },
  { n: 5, title: 'THE OLD SEA', sub: 'West, to the part of it that never went.' },
];

const JOBS = [
  // ---- I. THE DRY ----------------------------------------------------------
  {
    id: 'water', chapter: 1,
    name: 'FILL THE SHELL',
    ask: 'Stand on the spring and work that valve until your shell is full. All of it. I want to see the top of the water.',
    note: 'Fill your shell to the brim',
    how: 'Press the valve when the needle is in the green - the bright middle pays double.',
    done: (g) => g.economy.water >= g.economy.stat('waterMax') - 1,
    count: (g) => ({ have: Math.floor(g.economy.water), need: Math.floor(g.economy.stat('waterMax')) }),
    say: 'Full. Eleven years I have been drinking out of a canteen and you are walking around with a lake.',
    reward: (g) => { g.economy.nutrients += 6; },
    gain: '+6 growth',
  },
  {
    id: 'plant', chapter: 1,
    name: 'SOMETHING ALIVE',
    ask: 'Your back is soil. I want one living thing standing in it by tonight - I do not care what.',
    note: 'Get one plant growing on your shell',
    how: 'Click yourself to open your back. Drag a seed onto a plot, then pour water on it.',
    done: (g) => g.garden.plots.some((p) => p.plant),
    count: (g) => ({ have: g.garden.plots.filter((p) => p.plant).length ? 1 : 0, need: 1 }),
    say: 'There. That is the first thing to grow on that shell since the sea left. Do not let it die.',
    reward: (g) => { g.economy.nutrients += 10; },
    gain: '+10 growth',
  },
  // ---- II. WHAT THE SAND KEPT ---------------------------------------------
  {
    id: 'bone', chapter: 2,
    name: 'A CLEAN BONE',
    ask: 'Find a dig and take what is in it out without breaking it. Steady strokes. A cracked vertebra tells me nothing.',
    note: 'Dig up a fossil without damaging it',
    how: 'Walk until the sand shows a dig, then hit DIG and keep your stroke steady.',
    done: (g) => (g.quests.flags.cleanDig || 0) > 0,
    count: (g) => ({ have: Math.min(1, g.quests.flags.cleanDig || 0), need: 1 }),
    say: 'Not a mark on it. You have better hands than I do and you do not have hands.',
    reward: (g) => { g.economy.nutrients += 14; },
    gain: '+14 growth',
  },
  {
    id: 'fish', chapter: 2,
    name: 'SOMETHING SWIMMING',
    ask: 'The oasis to the east has fish in it. FISH. In a desert. If they are what I think they are, they were stranded when the sea went and never died out. Bring me one.',
    note: 'Catch a fish in an oasis pool',
    how: 'Walk down into a pool slowly - run and they scatter - then press E when one is at your claw.',
    done: (g) => (g.quests.flags.fish || 0) > 0,
    count: (g) => ({ have: Math.min(1, g.quests.flags.fish || 0), need: 1 }),
    say: 'A sea fish, in a pond, in a desert, ten thousand years after the sea. I am going to need a bigger notebook.',
    reward: (g) => { g.economy.nutrients += 12; },
    gain: '+12 growth',
  },
  {
    id: 'seam', chapter: 2,
    name: 'OPEN A SEAM',
    ask: 'There is metal in this basin. Find a seam, get it open, and put what is in it in my pack.',
    note: 'Take ore out of a seam',
    how: 'Dig straight down until you hit rock, then swing at the ore showing in it.',
    done: (g) => g.craft && g.craft.list().length > 0,
    count: (g) => ({ have: Math.min(1, g.craft?.list().length || 0), need: 1 }),
    say: 'Copper. In a basin that is supposed to be nothing but sandstone. Nothing out here is what the survey says it is.',
    reward: (g) => { g.economy.nutrients += 16; },
    gain: '+16 growth',
  },
  // ---- III. A HOME ON YOUR BACK -------------------------------------------
  {
    id: 'camp', chapter: 3,
    name: 'MAKE CAMP',
    ask: 'I have been sleeping on sand for eleven years. You have a back the size of a cart. Build something on it - anything with a roof.',
    note: 'Build a structure on your back',
    how: 'Click yourself, open BUILD, pick a structure and drop it on a free plot.',
    done: (g) => baseRank(g.garden).i >= 1,
    count: (g) => ({ have: Math.min(1, baseRank(g.garden).built), need: 1 }),
    say: 'A roof. On a crab. My mother would be so confused.',
    reward: (g) => { g.economy.nutrients += 14; g.economy.water += 40; },
    gain: '+14 growth, +40 water',
  },
  {
    id: 'green', chapter: 3,
    name: 'BRING IT BACK',
    ask: 'Pick a patch of dead ground and pour water on it until something comes up on its own. Three things. Then I will believe it.',
    note: 'Water dead sand until three things grow',
    how: 'Carry a full shell out onto dead ground and hit POUR. Keep pouring on the same patch.',
    done: (g) => g.green.plants.size >= 3,
    count: (g) => ({ have: Math.min(3, g.green.plants.size), need: 3 }),
    say: 'Three. Out of ground I surveyed and wrote off. I am going to have to write a letter about this.',
    reward: (g) => { g.economy.nutrients += 18; },
    gain: '+18 growth',
  },
  {
    id: 'outpost', chapter: 3,
    name: 'AN OUTPOST',
    ask: 'One roof is a camp. I want an outpost - three things built, two different kinds. Somewhere a person could actually live while we do this.',
    note: 'Make your back an outpost',
    how: 'Build three structures on your back, at least two different kinds. Watch the rank on the build rail.',
    done: (g) => baseRank(g.garden).i >= 2,
    count: (g) => ({ have: Math.min(3, baseRank(g.garden).built), need: 3 }),
    say: 'Look at it. A town walking across a dead sea. Nobody is going to believe a word of this paper.',
    reward: (g) => { g.economy.nutrients += 24; },
    gain: '+24 growth',
  },
  // ---- IV. THE LIDS ---------------------------------------------------------
  {
    id: 'lid', chapter: 4,
    name: 'THE FIRST LID',
    ask: 'The stone caps. They are not wells, they are LIDS - somebody shut the water in. Find one, get past whatever lives on it, open the lock under the collar, and break the plug.',
    note: 'Open a vent lock and break the cap',
    how: 'Beat the guardian, press E at the cap, turn the stones until the water reaches the plug, then hit it.',
    done: (g) => g.fountains.brokenCount >= 1,
    count: (g) => ({ have: Math.min(1, g.fountains.brokenCount), need: 1 }),
    say: 'Listen to it. That is a thousand years of water that has been waiting for somebody to take the lid off.',
    reward: (g) => { g.economy.nutrients += 30; },
    gain: '+30 growth',
  },
  {
    id: 'lids', chapter: 4,
    name: 'EVERY LID',
    ask: 'One vent greens a mile. Three would change the water table under the whole basin. Find two more. The locks get worse the further you go - they wanted these shut.',
    note: 'Break three caps in all',
    how: 'The caps are far apart. Walk east and west; each lock has more stones than the last.',
    done: (g) => g.fountains.brokenCount >= 3,
    count: (g) => ({ have: Math.min(3, g.fountains.brokenCount), need: 3 }),
    say: 'Three. The whole basin is sitting higher in the water than it was this morning. I can feel it in my boots.',
    reward: (g) => { g.economy.nutrients += 40; },
    gain: '+40 growth',
  },
  // ---- V. THE OLD SEA -------------------------------------------------------
  {
    id: 'sea', chapter: 5,
    name: 'WALK TO THE SEA',
    ask: 'There is a sea to the west. Not a pond - the sea. The part that never left. I have never been, because I cannot walk into it. You can.',
    note: 'Walk west until you reach the sea',
    how: 'Keep walking west, past the salt pan, off the end of the old shelf. You will know.',
    done: (g) => g.crab.x < SHORE_X + 60,
    count: null,
    say: 'It is REAL. Eleven years. It is real, it is right there, and it is full of fish.',
    reward: (g) => { g.economy.nutrients += 20; },
    gain: '+20 growth',
  },
  {
    id: 'coel', chapter: 5, final: true,
    name: 'THE LIVING FOSSIL',
    ask: 'Out in the deep water there is a fish with bones in its fins. A coelacanth. They were meant to be gone for sixty-six million years. If there is one down there, the sea never left at all - it just went where we could not see it. Bring me one and I will never ask you for anything again.',
    note: 'Catch a coelacanth in the deep sea',
    how: 'Walk out on the sea floor to where it is deepest. Go slowly. It is big, slow and old, and it does not spook easily.',
    done: (g) => (g.quests.flags['fish:coelacanth'] || 0) > 0,
    count: (g) => ({ have: Math.min(1, g.quests.flags['fish:coelacanth'] || 0), need: 1 }),
    say: 'That is it. That is the whole paper. That is the whole eleven years.',
    reward: (g) => { g.economy.nutrients += 80; },
    gain: '+80 growth',
  },
];

/**
 * The offer, as cards.
 *
 * He says what he wants and then he STOPS, and it does not become a job
 * until you say it does. The same two cards are used whether you asked him
 * for work or he brought it up himself, because they are the same
 * conversation and there is no reason for them to read differently.
 */
export function offerCards(job) {
  return [
    { icon: 'hand', mood: 'talk', t: job.ask },
    { icon: 'clock', mood: 'peer',
      t: `So: ${job.note.toLowerCase()}. ${job.gain} in it for you. Are you taking it?`,
      choices: [
        { word: 'YES', text: "I'll do it.", tint: '#9ad86a', take: job.id,
          go: [{ icon: 'sun', mood: 'grin',
            t: `Good. ${job.how} It is written down, which in my experience is the only reason anything ever gets done.` }] },
        { word: 'NO', text: 'Not now.',
          go: [{ icon: 'dusk', mood: 'dull',
            t: 'Fine. It will still need doing when you change your mind. Everything out here does.' }] },
      ] },
  ];
}

export const QUESTS = JOBS;
export const QUEST_BY_ID = Object.fromEntries(JOBS.map((j) => [j.id, j]));

export class Quests {
  constructor(game) {
    this.game = game;
    this.active = null;        // the one he has given you
    this.done = new Set();
    this.flags = {};           // things the world reports that nothing else tracks
    this.t = 0;
    this.justDone = null;      // for a beat of celebration in the corner
    this.doneT = 0;
    this.tookT = 0;            // and one when you take a job on
    this.chapterShown = 0;     // the last chapter whose title you have seen
    this.chapterCard = null;
    this.ended = false;        // the story is over and the sea is coming back
  }

  /** Which chapter you are in, for the corner card and the pause screen. */
  get chapter() { return this.active?.chapter || this.next()?.chapter || 5; }
  get total() { return JOBS.length; }

  /** The next job he has not given you yet, or null when he is out of them. */
  next() {
    return JOBS.find((j) => !this.done.has(j.id) && j.id !== this.active?.id) || null;
  }

  /** Whether there is anything to ask him for. */
  get hasWork() { return !!this.next() || !!this.active; }

  take(job) {
    if (!job || this.done.has(job.id)) return false;
    this.active = job;
    this.tookT = 6;
    // a new chapter gets its title, once
    if ((job.chapter || 0) > this.chapterShown) {
      this.chapterShown = job.chapter;
      this.chapterCard = { ...CHAPTERS[job.chapter], t: 4.6, max: 4.6 };
      this.game.audio?.play('dawn');
    }
    this.game.audio?.play('discover');
    return true;
  }

  /** How far through the active job you are, when it can be counted. */
  get progress() {
    const a = this.active;
    if (!a || !a.count) return null;
    try { return a.count(this.game); } catch { return null; }
  }

  /** Something happened that a check cannot see on its own. */
  flag(key, n = 1) { this.flags[key] = (this.flags[key] || 0) + n; }

  update(dt) {
    if (this.chapterCard) { this.chapterCard.t -= dt; if (this.chapterCard.t <= 0) this.chapterCard = null; }
    this.doneT = Math.max(0, this.doneT - dt);
    // the what-to-press line waits for the chapter title to finish
    if (!this.chapterCard) this.tookT = Math.max(0, this.tookT - dt);
    const a = this.active;
    if (!a || this.game.state !== 'play') return;
    this.t += dt;
    if (this.t < 0.4) return;
    this.t = 0;
    let ok = false;
    try { ok = !!a.done(this.game); } catch { ok = false; }
    if (!ok) return;
    this.active = null;
    this.done.add(a.id);
    this.justDone = a;
    this.doneT = 4;
    a.reward?.(this.game);
    // and every job done opens another bed on your back
    if (this.game.garden?.unlockPlot()) {
      setTimeout(() => this.game.ui?.say('A new bed on your back', 3.5), 4200);
    }
    this.game.audio?.play('discover');
    this.game.npc?.say(a.say, 6);
    this.game.ui?.say(`${a.name} - ${a.gain}`, 4);
    if (a.final && !this.ended) {
      this.ended = true;
      this.game.startEnding?.();
    }
  }

  save() {
    return { active: this.active?.id || null, done: [...this.done], flags: this.flags,
      chapter: this.chapterShown, ended: this.ended };
  }
  load(d) {
    if (!d) return;
    this.active = d.active ? QUEST_BY_ID[d.active] || null : null;
    this.done = new Set(d.done || []);
    this.flags = d.flags || {};
    this.chapterShown = d.chapter || 0;
    this.ended = !!d.ended;
  }
}
