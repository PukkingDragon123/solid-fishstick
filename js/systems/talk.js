// CRABDEN - saying something.
//
// You have no voice, no hands you can write with, and a face that does not
// move the way his mouth does. What you do have is a claw and a hard shell, and a
// man who has spent eleven years listening to nothing.
//
// So you tap. He works out, faster than he has any right to, that the taps
// are not random - and from then on the two of you have a language. It is a
// terrible language. It is enough.

export const CODE = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F',
  '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L',
  '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R',
  '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
  '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2',
  '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7',
  '---..': '8', '----.': '9',
};

/** What he says back when a word actually lands. */
const REPLIES = {
  WATER: "Water. You're asking about water. There's a seep two ridges east - I'll show you.",
  SEA: 'The sea. Yes. It was here. You were here when it was here.',
  HELP: "Help. Right. Tell me what's wrong and I will do the digging.",
  YES: 'Yes. Good. That is a yes. I am writing that down.',
  NO: 'No. Fine. Noted, and I will stop asking.',
  FOOD: 'Food. There are berries setting on your own back, you enormous idiot.',
  NAME: 'My name is Vess. Elias Vess. You have just asked me my name.',
  HOME: 'Home. This was home. It is going to be again, at the rate you are going.',
  GO: "Go. Where? Point with a leg, I'll follow.",
  STOP: 'Stopping. Stopped. I am a very good listener.',
  VESS: 'That is my name. You just tapped my name. I need to sit down.',
  HELLO: 'Hello. Hello. A thousand years and the first thing you say is hello.',
  RAIN: 'Rain. Not for eleven years. But your basin is filling, so.',
  SAND: 'Sand. Yes. Extensive notes on the sand. Ask me something harder.',
  DIG: "Dig. Now you're talking. Where?",
  UP: 'Up? Oh - up. You want me to climb on. Give me a moment.',
  DOWN: 'Down. Putting me down. Fine.',
  OK: 'Okay. Okay. We understand each other.',
};

/**
 * The tap channel. Hold the key for a long tap, release for a short one; a
 * pause ends a letter, a longer pause ends the word and he reads it back.
 */
export class Morse {
  constructor(game) {
    this.game = game;
    this.letter = '';       // dots and dashes of the letter being tapped
    this.word = '';         // letters decoded so far
    this.gap = 0;           // seconds since the last tap
    this.held = 0;          // how long the key has been down
    this.down = false;
    this.learned = false;   // whether he has worked out it is a code
    this.taps = 0;
    this.show = 0;          // fades the bubble over the crab
  }

  /** Called every frame with whether the tap key is held. */
  update(dt, held) {
    if (held && !this.down) { this.down = true; this.held = 0; }
    else if (held) this.held += dt;
    else if (this.down) {
      this.down = false;
      this.push(this.held > 0.22 ? '-' : '.');
    }

    if (!this.down && (this.letter || this.word)) {
      this.gap += dt;
      if (this.letter && this.gap > 0.55) this._endLetter();
      else if (this.word && this.gap > 1.5) this._endWord();
    }
    this.show = Math.max(0, this.show - dt * (this.letter || this.word ? 0 : 1.2));
  }

  push(mark) {
    const g = this.game;
    this.letter += mark;
    this.gap = 0;
    this.taps++;
    this.show = 1;
    g.crab.tap(mark === '-');
    g.audio?.play('ui', { pitch: mark === '-' ? 0.7 : 1.4 });
    if (!this.learned && this.taps >= 6) this._learn();
  }

  _endLetter() {
    const ch = CODE[this.letter] || '?';
    this.word += ch;
    this.letter = '';
    this.gap = 0;
    if (this.word.length > 14) this._endWord();
  }

  _endWord() {
    const word = this.word;
    this.word = '';
    this.letter = '';
    this.gap = 0;
    if (!word) return;
    const npc = this.game.npc;
    const near = Math.abs(npc.x - this.game.crab.x) < 140 || npc.riding;
    if (!near) {
      this.game.ui.say(`You tap out ${word}. Nobody is close enough to hear it.`, 3.5);
      return;
    }
    if (!this.learned) this._learn();
    const reply = REPLIES[word];
    if (reply) {
      npc.say(reply, 6);
      this.game.onSaid?.(word);
    } else if (word.includes('?')) {
      npc.say(`That was... something. Slower. Long taps and short ones, and a gap between letters.`, 5.5);
    } else {
      npc.say(`"${word}". You just spelled ${word}. I have no idea what you mean by it, but you spelled it.`, 6);
      this.game.onSaid?.(word);
    }
    this.game.audio?.play('discover');
  }

  /** The moment he stops hearing noise and starts hearing language. */
  _learn() {
    this.learned = true;
    const npc = this.game.npc;
    npc.say('Wait. Wait. That is not random. Long, short, long - that is code. '
      + 'You are TAPPING AT ME. You are a person. Oh, you are a person.', 8);
    this.game.ui.say('Dr. Vess has understood you. Hold and release to tap; pause to end a letter.', 7);
    this.game.audio?.play('evolve');
    this.game.cam.shake(3);
    this.game.onLearnedCode?.();
  }

  /** What is currently on the wire, for the bubble over your own head. */
  render() {
    const cur = this.letter ? ` ${this.letter}` : this.down ? ' _' : '';
    return (this.word + cur).trim();
  }

  toJSON() { return { learned: this.learned, taps: this.taps }; }
  fromJSON(d) { if (d) { this.learned = !!d.learned; this.taps = d.taps || 0; } }
}

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

const REVERSE = (() => {
  const out = {};
  for (const [marks, ch] of Object.entries(CODE)) out[ch] = marks;
  return out;
})();

/** A word as dots and dashes, letters separated by a space. */
export function morseFor(word) {
  return String(word).toUpperCase().split('').map((ch) => REVERSE[ch] || '?').join(' ');
}

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
    ask: 'Where does the water come from?',
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
    id: 'help', word: 'HELP', group: 'him',
    ask: 'Help me.',
    lines: [
      { icon: 'hand', t: "Always. Say where and I will do the digging - I have the hands and you have the reach." },
    ],
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
export const TOPIC_BY_WORD = Object.fromEntries(TOPICS.map((t) => [t.word, t]));
