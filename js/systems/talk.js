import { offerCards } from './quests.js';

// CRABDEN - saying something.
//
// You have no voice, no hands you can write with, and a face that does not
// move the way his mouth does. He has spent eleven years listening to
// nothing, and he is very good at reading an animal.
//
// There used to be a code here: a morse table, a key you held down with your
// pincer, and a grid of stone tablets with the dots and dashes cut under
// every word you were allowed to say. Then there was a grid of SEVENTEEN
// BUTTONS, which was worse - a wall of questions you had to read all of to
// find the one that did anything, and fifteen of them were a manual.
//
// So there are THREE THINGS you can say, and they are the three things
// anybody says to a man who is giving them work:
//
//   THE JOB    - what am I doing, how far through am I, what do I press
//   ASK HIM    - tell me the one thing I most need to know right now
//   BYE        - I am going
//
// The manual did not go anywhere. It is behind ASK HIM, and he picks which
// page of it you get, because he is standing right there and he can see what
// you have and have not worked out. A button that says "How do I grow
// something?" when you cannot yet grow anything is worth fifteen buttons
// that say everything.

// ---------------------------------------------------------------------------
// the manual
//
// Each of these is one thing he knows, and the only place in the game where
// you are actually taught anything: not a tooltip, not a tutorial step, but a
// man who has been out here eleven years telling you how to grow a plant.
//
// `want` is how badly he wants to tell you this one NOW. Highest wins, and
// anything he has already told you drops to nearly nothing - so the one
// button in front of you is always the next useful sentence and never the
// same sentence twice.

export const LESSONS = [
  {
    id: 'plant', ask: 'How do I grow something?',
    want: (g) => (g.garden?.plots?.some((p) => p.plant) ? 1 : 9),
    lines: [
      { icon: 'seed', t: "Right. Listen, because this is the only thing out here that matters. Your back is soil. Actual soil - there is a basin in that shell with a thousand years of silt in it." },
      { icon: 'hand', t: "Click yourself. That opens your own back, and you will see the plots. Drag a seed out of the tray onto one. It will not take if the plot is already full." },
      { icon: 'drop', t: "Then water it. A seed that is dry does nothing for ever. Work the valve until the shell has water in it, then pour - the ring round the seed fills as it drinks." },
      { icon: 'fruit', t: "When it is ripe it goes gold and the bead lifts. R picks everything that is ready. That is the whole of it. Go and grow something." },
    ],
    then: (g) => { g.taughtPlant = true; },
  },
  {
    id: 'water', ask: 'Where is the water?',
    want: (g) => (g.economy?.water > 4 ? 1 : 8),
    lines: [
      { icon: 'drop', t: "From you. There is a spring under that shell and it has been sitting on it since before there were people." },
      { icon: 'pump', t: "The valve in the corner is the muscle. Press it when the needle on the dial is in the green - in the green it pays, the bright middle pays double, and a run of good ones pays far more than a run of bad ones." },
      { icon: 'well', t: "Fill the shell and everything on your back drinks out of it. Let it run dry and everything on your back dies. That is the whole economy of this place." },
    ],
  },
  {
    id: 'dig', ask: 'What is under the sand?',
    want: () => 6,
    lines: [
      { icon: 'spade', t: "Everything. This was a sea floor. What you are walking on is eleven thousand years of things that drowned." },
      { icon: 'claw', t: "Stand on a site and press E, or hit DIG with your thumb. The shallow ones show; the deep ones do not until your claw is better." },
      { icon: 'egg', t: "Bone, shell, amber. Amber is the good one - there are things asleep in amber that have been asleep since the water went, and some of them wake up." },
    ],
  },
  {
    id: 'mine', ask: 'How do I get the ore out?',
    want: (g) => (g.craft?.list()?.length ? 1 : 5),
    lines: [
      { icon: 'burrow', t: "Dig straight down. The hole follows you - hold it and it goes deeper, and the sides slump back if you leave it, so finish what you start." },
      { icon: 'bolt', t: "When you reach a seam the ore shows in the rock. Swing at it. Grit first - grit is everywhere - then copper, and then the ladder opens up." },
      { icon: 'hammer', t: "You cannot swing at iron with a trowel. If the seam will not chip, it is telling you to go and make a better tool, not to swing harder." },
    ],
  },
  {
    id: 'craft', ask: 'What can you make?',
    want: (g) => (g.craft?.list()?.length ? 6 : 3),
    lines: [
      { icon: 'hammer', t: "With a bench and a bag of the right rubbish? A great deal. Click yourself, then BENCH. It is my bag, so I will be doing the actual work." },
      { icon: 'load', t: "Recipes light up when you have what they need. What you have is on the left; what it makes is on the right. Start it and it takes a moment - it is not magic, it is me with a file." },
    ],
  },
  {
    id: 'tame', ask: 'How do I make one of them stay?',
    want: (g) => (g.wildlife?.tamed?.length ? 1 : 4),
    lines: [
      { icon: 'fruit', t: "You do not make it. You put out the one thing its kind crosses a desert for and you wait. Berries for the birds, standing water for the reptiles, a flower for the insects, shade for the small warm ones." },
      { icon: 'call', t: "It eats, it sticks to you, and then the hard part. It sings you a phrase and you sing it back. Four of them, longer each time. Fumble one and you lose ground, not the animal." },
      { icon: 'nest', t: "Get most of them right and it is yours. It walks with you and it works - some of them dig, some find water, some just keep the smaller things off you." },
    ],
  },
  {
    id: 'vent', ask: 'What are the stone caps?',
    want: () => 5,
    lines: [
      { icon: 'well', mood: 'squint',
        t: "A collar of dressed block over a hole in the rock, with a plug driven into it. That is not a well. That is a lid." },
      { icon: 'drop', mood: 'talk',
        t: "The water never went anywhere. It went DOWN. The people here found the vents and capped them, because a spring you can turn on is worth more than a spring that runs, and then they died and the lids stayed shut." },
      { icon: 'claw', mood: 'grin',
        t: "So break one. Stand at it and swing - five good hits and the plug goes. What comes out does not stop." },
      { icon: 'shield', mood: 'frown',
        t: "One thing. Something always moves in on top of them, and it does not like new arrivals. Deal with the animal first." },
    ],
  },
  {
    id: 'spore', ask: 'What is the spore?',
    when: (g) => (g.economy?.parasites || 0) > 0 || g.mind?.stage !== 'free',
    want: () => 7,
    lines: [
      { icon: 'seed', t: "A mindcap fruits it. It is a parasite, and I want to be very clear that I am not comfortable with any of this." },
      { icon: 'jet', t: "Hold the nozzle, let the pressure build, let go inside the band. Too short and it falls in the sand. Too long and it goes off in you, and you will not enjoy that." },
      { icon: 'link', t: "And it only takes in something willing - hurt, or fed, or half trusting you already. A healthy animal that owes you nothing will simply shrug it off." },
    ],
  },
  {
    id: 'green', ask: 'Is any of this working?',
    want: (g) => ((g.green?.plants?.size || 0) > 0 ? 4 : 2),
    lines: [
      { icon: 'leaf', t: "Look behind you. Where you have walked with things growing on your back, the ground is coming back. Not much. Some." },
      { icon: 'tree', t: "Seeds fall off you. Water gets spilled. Something eats and leaves something behind. That is all a desert ever needed - it did not want to be a desert." },
      { icon: 'sun', t: "Keep going east. There is more water that way than anyone has written down." },
    ],
  },
  {
    id: 'sea', ask: 'There was a sea here.', want: () => 2,
    lines: [
      { icon: 'well', t: "There was. Right here, over our heads, for about nine thousand years." },
      { icon: 'sun', t: "Then it went. Not dramatically - it just stopped being replaced. Took four centuries. Nobody alive noticed it happening." },
      { icon: 'crab', t: "You were here when it was here. I have spent eleven years proving that to people who stopped answering, and here you are, walking about." },
    ],
  },
  {
    id: 'name', ask: 'Who are you?', want: () => 3,
    lines: [
      { icon: 'hand', t: "Elias Vess. Doctor, if the funding body is listening, which it is not." },
      { icon: 'clock', t: "Eleven years on a sea that dried up before there was anyone to see it. Three papers. One reviewer. He said the timeline was implausible." },
      { icon: 'crab', t: "I am going to put you in the fourth one and he is going to have a very bad afternoon." },
    ],
  },
  {
    id: 'me', ask: 'What am I?', want: () => 3,
    lines: [
      { icon: 'crab', t: "You are an Oasis Crab, which is a thing I named last Tuesday, and you are the only one." },
      { icon: 'egg', t: "You went under when the water did. Something in you decided to wait it out rather than die, and then it waited a thousand years, and then it stopped waiting." },
      { icon: 'clock', t: "I do not know why now. I have theories. None of them are any good." },
    ],
  },
];

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

/**
 * The one thing he most wants to tell you.
 *
 * He can see you. He knows whether there is anything growing on your back and
 * whether that shell has water in it, so the single ASK HIM button is always
 * pointed at the gap - and once he has said a thing he does not open with it
 * again, he just keeps it on the shelf in case you come back for it.
 */
export function nextLesson(g) {
  const heard = g.talk?.heard;
  let best = null, bestW = -1;
  for (const l of LESSONS) {
    if (l.when && !l.when(g)) continue;
    let w = 0;
    try { w = l.want ? l.want(g) : 1; } catch { w = 1; }
    // told you once is told you: it drops behind everything he has not said
    if (heard?.has(l.id)) w = w * 0.01 - LESSONS.indexOf(l) * 0.0001;
    if (w > bestW) { bestW = w; best = l; }
  }
  return best;
}

/**
 * What you can say to him.
 *
 * `ask` is what the button says, and it is a function on the two that change
 * with the world - so the door into the manual is labelled with the actual
 * question you are about to ask rather than the word MANUAL.
 */
export const TOPICS = [
  {
    // The job. Not a list of jobs, not a board: THE job, the one you are on,
    // read back to you with how far through it you are and which button it
    // wants - or, when you are on nothing, the next one, offered.
    id: 'work', word: 'WORK', group: 'work',
    ask: (g) => {
      const q = g.quests;
      if (q?.active) return 'About the job.';
      return q?.next() ? 'What needs doing?' : 'Anything else?';
    },
    build: (g) => {
      const q = g.quests;
      if (q.active) {
        const a = q.active;
        const c = q.progress;
        const far = c && c.need > 1 ? ` You are at ${c.have} of ${c.need}.` : '';
        return [
          { icon: 'hand', mood: 'talk', t: `${a.name}. ${a.note}.${far}` },
          { icon: 'point', mood: 'peer', t: a.how,
            choices: [
              { word: 'ON IT', text: "I'm on it.", tint: '#9ad86a' },
              { word: 'AGAIN', text: 'Say the whole thing again.',
                go: [{ icon: 'clock', mood: 'flat', t: a.ask }] },
            ] },
        ];
      }
      const next = q.next();
      if (!next) {
        return [
          { icon: 'sun', mood: 'laugh',
            t: 'Nothing. You have done every single thing I could think of and two I could not.' },
          { icon: 'sprout', mood: 'grin',
            t: 'Go and grow something for yourself. That is the job now.' },
        ];
      }
      // the same two cards he uses when he brings work up himself, because it
      // is the same conversation
      return offerCards(next);
    },
  },
  {
    // The manual, behind one door. He picks the page.
    id: 'ask', word: 'ASK', group: 'him',
    ask: (g) => nextLesson(g)?.ask || 'Tell me something.',
    build: (g) => {
      const l = nextLesson(g);
      if (!l) return [{ icon: 'dusk', mood: 'dull', t: 'I have told you everything I know. Twice.' }];
      return l.lines;
    },
    then: (g) => {
      const l = g.talk?._asked;
      if (l) { g.talk.heard.add(l.id); l.then?.(g); }
    },
  },
  {
    // The door into the ugly thing. You do not need a relic and a patch of
    // sand for this: you need him close enough and low enough, and the way
    // you get a man to put his head next to yours is to ask him to.
    id: 'closer', word: 'CLOSER', group: 'him',
    ask: 'Come closer.',
    when: (g) => (g.mind?.stage === 'free' || g.mind?.stage === 'lured') && !g.mind?.owned,
    lines: [
      { icon: 'hand', mood: 'squint',
        t: "Closer? I am a foot away from something that could take my arm off. ...Fine. Fine." },
      { icon: 'point', mood: 'peer',
        t: "There. Down at your level. What is it - is there something on the shell? Hold still, let me look." },
    ],
    then: (g) => { g.mind?.leanIn(); },
  },
  {
    // Not a thing you say. It only appears once he is actually down in front
    // of you with a spore in your gland, and taking it is the whole of the
    // ugly thing in one tile.
    id: 'spray', word: 'SPRAY', group: 'him',
    ask: 'SPRAY HIM',
    tint: '#c98ade',
    when: (g) => !!g.mind?.ready && (g.economy?.parasites || 0) > 0 && !g.mind?.owned,
    lines: [
      { icon: 'jet', mood: 'gasp', t: 'He is looking at your shell. His head is level with the gland.' },
    ],
    then: (g) => { g.talk?.close(); g.sprayVess(); },
  },
  {
    id: 'bye', word: 'BYE', group: 'him',
    ask: 'Enough.',
    lines: [
      { icon: 'close', t: "Go on, then. I will be here. I am always here." },
    ],
  },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
