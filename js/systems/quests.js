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

const JOBS = [
  {
    id: 'water',
    name: 'FILL THE SHELL',
    ask: 'Stand on the spring and hold the valve until that shell is full. All of it. I want to see the top of the water.',
    note: 'Fill your shell to the brim',
    done: (g) => g.economy.water >= g.economy.stat('waterMax') - 1,
    count: (g) => ({ have: Math.floor(g.economy.water), need: Math.floor(g.economy.stat('waterMax')) }),
    say: 'Full. Eleven years I have been drinking out of a canteen and you are walking around with a lake.',
    reward: (g) => { g.economy.nutrients += 6; },
    gain: '+6 nutrients',
  },
  {
    id: 'plant',
    name: 'SOMETHING ALIVE',
    ask: 'Your back is soil. I want one living thing standing in it by tonight - I do not care what.',
    note: 'Get one plant growing on your shell',
    done: (g) => g.garden.plots.some((p) => p.plant),
    count: (g) => ({ have: g.garden.plots.filter((p) => p.plant).length ? 1 : 0, need: 1 }),
    say: 'There. That is the first thing to grow on that shell since the sea left. Do not let it die.',
    reward: (g) => { g.economy.nutrients += 10; },
    gain: '+10 nutrients',
  },
  {
    id: 'bone',
    name: 'A CLEAN BONE',
    ask: 'Find a dig and take what is in it out without breaking it. Steady strokes. A cracked vertebra tells me nothing.',
    note: 'Dig up a fossil without damaging it',
    done: (g) => (g.quests.flags.cleanDig || 0) > 0,
    count: (g) => ({ have: Math.min(1, g.quests.flags.cleanDig || 0), need: 1 }),
    say: 'Not a mark on it. You have better hands than I do and you do not have hands.',
    reward: (g) => { g.economy.nutrients += 14; },
    gain: '+14 nutrients',
  },
  {
    id: 'green',
    name: 'BRING IT BACK',
    ask: 'Pick a patch of dead ground and pour water on it until something comes up on its own. Three things. Then I will believe it.',
    note: 'Water dead sand until three things grow',
    done: (g) => g.green.plants.size >= 3,
    count: (g) => ({ have: Math.min(3, g.green.plants.size), need: 3 }),
    say: 'Three. Out of ground I surveyed and wrote off. I am going to have to write a letter about this.',
    reward: (g) => { g.economy.nutrients += 18; },
    gain: '+18 nutrients',
  },
  {
    id: 'seam',
    name: 'OPEN A SEAM',
    ask: 'There is metal in this basin. Find a seam, get it open, and put what is in it in my pack.',
    note: 'Take ore out of a seam',
    done: (g) => g.craft && g.craft.list().length > 0,
    count: (g) => ({ have: Math.min(1, g.craft?.list().length || 0), need: 1 }),
    say: 'Copper. In a basin that is supposed to be nothing but sandstone. Nothing out here is what the survey says it is.',
    reward: (g) => { g.economy.nutrients += 16; },
    gain: '+16 nutrients',
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
            t: 'Good. It is written down, which in my experience is the only reason anything ever gets done.' }] },
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
  }

  /** The next job he has not given you yet, or null when he is out of them. */
  next() {
    return JOBS.find((j) => !this.done.has(j.id) && j.id !== this.active?.id) || null;
  }

  /** Whether there is anything to ask him for. */
  get hasWork() { return !!this.next() || !!this.active; }

  take(job) {
    if (!job || this.done.has(job.id)) return false;
    this.active = job;
    this.tookT = 2.8;
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
    this.doneT = Math.max(0, this.doneT - dt);
    this.tookT = Math.max(0, this.tookT - dt);
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
    this.game.audio?.play('discover');
    this.game.npc?.say(a.say, 6);
    this.game.ui?.say(`${a.name} - ${a.gain}`, 4);
  }

  save() { return { active: this.active?.id || null, done: [...this.done], flags: this.flags }; }
  load(d) {
    if (!d) return;
    this.active = d.active ? QUEST_BY_ID[d.active] || null : null;
    this.done = new Set(d.done || []);
    this.flags = d.flags || {};
  }
}
