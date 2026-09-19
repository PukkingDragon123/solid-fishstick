import { offerCards } from './quests.js';

// CRABDEN - saying something.
//
// You have no voice, no hands you can write with, and a face that does not
// move the way his mouth does. He has spent eleven years listening to
// nothing, and he is very good at reading an animal.
//
// There used to be a code here: a morse table, a key you held down with your
// pincer, and a grid of stone tablets with the dots and dashes cut under
// every word you were allowed to say. It was the best-looking thing in the
// game and the worst thing in it to use - you had to already know which
// words did anything, and the ones that did were a menu with a puzzle bolted
// to the front of it.
//
// What is left is the conversation. He talks, you pick what you say back,
// and the last thing on the list is always BYE.

// ---------------------------------------------------------------------------
// The conversation.
//
// Tapping a word at him and getting a sentence back was a good trick, but it
// was a trick: you had to already know which words did anything. So there is
// a conversation now. You sit down in front of him, he has a face and a
// voice, and the things you can say are laid out with their code written
// under them - because the code is the language, and hiding it would be like
// hiding the words.
//
// You can answer two ways and they are the same answer: tap it out for real
// on the key, or point at it. Tapping is the game; pointing is for when your
// hands are busy. Either way it is you who said it.

/**
 * What you can say to him. `lines` is what he says back, one card at a time.
 * `when` gates a topic on the world - there is no point asking him how to
 * mine before you have a claw that could. `then` runs once the topic is done.
 */
export const TOPICS = [
  {
    id: 'plant', word: 'PLANT', group: 'work',
    ask: 'How do I grow something?',
    lines: [
      { icon: 'seed', t: "Right. Listen, because this is the only thing out here that matters. Your back is soil. Actual soil - there is a basin in that shell with a thousand years of silt in it." },
      { icon: 'hand', t: "Open your back - the shell button, or B. You will see the plots. Drag a seed out of the tray and drop it on one. It will not take if the plot is already full." },
      { icon: 'drop', t: "Then water it. A seed that is dry does nothing for ever. Work the valve until the basin has water in it, then pour - the ring round the seed fills as it drinks." },
      { icon: 'sun', t: "Then leave it alone. It wants time, and some of them want particular things - shade, salt, standing water. The chips on the seed tell you which, and they fill in as you have them." },
      { icon: 'fruit', t: "When it is ripe it goes gold and the bead lifts. R picks everything that is ready. That is the whole of it. Go and grow something." },
    ],
    then: (g) => { g.taughtPlant = true; },
  },
  {
    id: 'water', word: 'WATER', group: 'work',
    ask: 'Where is the water?',
    lines: [
      { icon: 'drop', t: "From you. There is a spring under that shell and it has been sitting on it since before there were people." },
      { icon: 'pump', t: "The valve in the corner is the muscle. Tap it in time with the band on the gauge - in the band it pays, in the middle of the band it pays double, and a run of good ones pays much more than a run of bad ones." },
      { icon: 'well', t: "Fill the basin and everything on your back drinks out of it. Let it run dry and everything on your back dies. That is the whole economy of this place." },
    ],
  },
  {
    id: 'dig', word: 'DIG', group: 'work',
    ask: 'What is under the sand?',
    lines: [
      { icon: 'spade', t: "Everything. This was a sea floor. What you are walking on is eleven thousand years of things that drowned." },
      { icon: 'claw', t: "You need a claw that can find them - the genome has one. Then stand on a site and press E. The shallow ones show; the deep ones do not until your claw is better." },
      { icon: 'egg', t: "Bone, shell, amber. Amber is the good one - there are things asleep in amber that have been asleep since the water went, and some of them wake up." },
    ],
  },
  {
    id: 'mine', word: 'MINE', group: 'work',
    ask: 'How do I get the ore out?',
    lines: [
      { icon: 'burrow', t: "Dig straight down. The hole follows you - press and hold and it goes deeper, and the sides slump back if you leave it, so finish what you start." },
      { icon: 'bolt', t: "When you reach a seam the ore shows in the rock. Swing at it. Grit first - grit is everywhere - then copper, and then the ladder opens up: a copper pick reaches amber and iron." },
      { icon: 'hammer', t: "You cannot swing at iron with a trowel. If the seam will not chip, it is telling you to go and make a better tool, not to swing harder." },
    ],
  },
  {
    id: 'craft', word: 'CRAFT', group: 'work',
    ask: 'What can you make?',
    lines: [
      { icon: 'hammer', t: "With a bench and a bag of the right rubbish? A great deal. B, then BENCH. It is my bag, so I will be doing the actual work." },
      { icon: 'load', t: "Recipes light up when you have what they need. What you have is on the left; what it makes is on the right. Start it and it takes a moment - it is not magic, it is me with a file." },
      { icon: 'link', t: "Build the bench onto your own back and I can work while you walk. Which I would enjoy, if you are asking." },
    ],
  },
  {
    id: 'tame', word: 'TAME', group: 'life',
    ask: 'How do I make one of them stay?',
    lines: [
      { icon: 'fruit', t: "You do not make it. You put out the one thing its kind crosses a desert for and you wait. Berries for the birds, standing water for the reptiles, a flower for the insects, shade for the small warm ones." },
      { icon: 'call', t: "It eats, it sticks to you, and then the hard part. It sings you a phrase and you sing it back. Four of them, longer each time. Fumble one and you lose ground, not the animal." },
      { icon: 'nest', t: "Get most of them right and it is yours. It walks with you and it works - some of them dig, some of them find water, some of them just keep the smaller things off you." },
    ],
  },
  {
    id: 'spore', word: 'SPORE', group: 'life',
    ask: 'What is the spore?',
    lines: [
      { icon: 'seed', t: "A mindcap fruits it. It is a parasite, and I want to be very clear that I am not comfortable with any of this." },
      { icon: 'jet', t: "Hold the nozzle, let the pressure build, let go inside the band. Too short and it falls in the sand. Too long and it goes off in you, and you will not enjoy that." },
      { icon: 'link', t: "And it only takes in something willing - hurt, or fed, or half trusting you already. A healthy animal that owes you nothing will simply shrug it off." },
      { icon: 'close', t: "Including me. You have already done it to me once. I remember all of it." },
    ],
    when: (g) => (g.economy?.parasites || 0) > 0 || g.mind?.stage !== 'free',
  },
  {
    id: 'sea', word: 'SEA', group: 'world',
    ask: 'There was a sea here.',
    lines: [
      { icon: 'well', t: "There was. Right here, over our heads, for about nine thousand years." },
      { icon: 'sun', t: "Then it went. Not dramatically - it just stopped being replaced. Took four centuries. Nobody alive noticed it happening." },
      { icon: 'map', t: "You were here when it was here. I have spent eleven years proving that to people who stopped answering, and here you are, walking about." },
    ],
  },
  {
    id: 'green', word: 'GREEN', group: 'world',
    ask: 'Is any of this working?',
    lines: [
      { icon: 'leaf', t: "Look behind you. Where you have walked with things growing on your back, the ground is coming back. Not much. Some." },
      { icon: 'tree', t: "Seeds fall off you. Water gets spilled. Something eats and leaves something behind. That is all a desert ever needed - it did not want to be a desert." },
      { icon: 'sun', t: "Keep going east. There is more water that way than anyone has written down." },
    ],
  },
  {
    id: 'name', word: 'NAME', group: 'him',
    ask: 'Who are you?',
    lines: [
      { icon: 'hand', t: "Elias Vess. Doctor, if the funding body is listening, which it is not." },
      { icon: 'clock', t: "Eleven years on a sea that dried up before there was anyone to see it. Three papers. One reviewer. He said the timeline was implausible." },
      { icon: 'crab', t: "I am going to put you in the fourth one and he is going to have a very bad afternoon." },
    ],
  },
  {
    id: 'me', word: 'ME', group: 'him',
    ask: 'What am I?',
    lines: [
      { icon: 'crab', t: "You are an Oasis Crab, which is a thing I named last Tuesday, and you are the only one." },
      { icon: 'egg', t: "You went under when the water did. Something in you decided to wait it out rather than die, and then it waited a thousand years, and then it stopped waiting." },
      { icon: 'clock', t: "I do not know why now. I have theories. None of them are any good." },
    ],
  },
  {
    // The one topic whose answer is not written down anywhere: it is whatever
    // he wants doing next. Ask and he tells you; when he has finished telling
    // you, you are doing it.
    id: 'work', word: 'WORK', group: 'him',
    ask: 'What needs doing?',
    build: (g) => {
      const q = g.quests;
      if (q.active) {
        return [
          { icon: 'hand', mood: 'squint',
            t: `You are in the middle of something. ${q.active.ask}` },
          { icon: 'clock', mood: 'flat',
            t: 'Go and do that, and then come back and ask me again.',
            choices: [
              { word: 'YES', text: "I'm on it." },
              { word: 'DROP', text: 'Give me a different one.',
                go: [{ icon: 'close', mood: 'glare',
                  t: 'No. You asked, I answered, and I am not running a menu. Finish it.' }] },
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
      // The offer, which is the same two cards he uses when he brings work
      // up himself - because it is the same conversation.
      return offerCards(next);
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
    id: 'vent', word: 'VENT', group: 'work',
    ask: 'The stone caps?',
    lines: [
      { icon: 'well', mood: 'squint',
        t: "You have seen one. Good. A collar of dressed block over a hole in the rock, with a plug driven into it. That is not a well. That is a lid." },
      { icon: 'drop', mood: 'talk',
        t: "The water never went anywhere. It went DOWN. The people here found the vents and capped them, because a spring you can turn on is worth more than a spring that runs, and then they died and the lids stayed shut." },
      { icon: 'claw', mood: 'grin',
        t: "So break one. Stand at it and swing - five good hits and the plug goes. What comes out does not stop, and everything within four hundred metres that has been waiting a thousand years comes up at once." },
      { icon: 'shield', mood: 'frown',
        t: "One thing. Something always moves in on top of them. It has been walking the same ground since before I got here and it does not like new arrivals. Deal with the animal first - it will not let you turn your back on it." },
    ],
  },
  {
    id: 'help', word: 'HELP', group: 'him',
    ask: 'Help me.',
    lines: [
      { icon: 'hand', t: "Always. Say where and I will do the digging - I have the hands and you have the reach." },
    ],
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
