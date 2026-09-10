// CRABDEN - saying something.
//
// You have no voice, no hands you can write with, and a face that does not
// move the way hers does. What you do have is a claw and a hard shell, and a
// woman who has spent eleven years listening to nothing.
//
// So you tap. She works out, faster than she has any right to, that the taps
// are not random - and from then on the two of you have a language. It is a
// terrible language. It is enough.

const CODE = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F',
  '--.': 'G', '....': 'H', '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L',
  '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P', '--.-': 'Q', '.-.': 'R',
  '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
  '-.--': 'Y', '--..': 'Z', '-----': '0', '.----': '1', '..---': '2',
  '...--': '3', '....-': '4', '.....': '5', '-....': '6', '--...': '7',
  '---..': '8', '----.': '9',
};

/** What she says back when a word actually lands. */
const REPLIES = {
  WATER: "Water. You're asking about water. There's a seep two ridges east - I'll show you.",
  SEA: 'The sea. Yes. It was here. You were here when it was here.',
  HELP: "Help. Right. Tell me what's wrong and I will do the digging.",
  YES: 'Yes. Good. That is a yes. I am writing that down.',
  NO: 'No. Fine. Noted, and I will stop asking.',
  FOOD: 'Food. There are berries setting on your own back, you enormous idiot.',
  NAME: 'My name is Vess. Ilsa Vess. You have just asked me my name.',
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
 * pause ends a letter, a longer pause ends the word and she reads it back.
 */
export class Morse {
  constructor(game) {
    this.game = game;
    this.letter = '';       // dots and dashes of the letter being tapped
    this.word = '';         // letters decoded so far
    this.gap = 0;           // seconds since the last tap
    this.held = 0;          // how long the key has been down
    this.down = false;
    this.learned = false;   // whether she has worked out it is a code
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

  /** The moment she stops hearing noise and starts hearing language. */
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
