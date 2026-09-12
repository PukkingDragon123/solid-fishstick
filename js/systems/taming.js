// CRABDEN - how you make a friend out here.
//
// You do not buy an animal. There is nothing to buy it with and nothing that
// wants what you have. What you do is put out the one thing its species
// actually crosses a desert for - berries for the birds, standing water for
// the reptiles, shade for the small nocturnal things, carrion for the ones
// that follow carrion - and wait for it to decide.
//
// Once it has decided, it sticks to you. Then you have to talk to it, and
// neither of you has words, so you do what two animals without words have
// always done: it gives you a phrase and you give it back. Four phrases,
// getting longer, getting faster, and if you fumble one you lose ground but
// not the animal. It is a conversation, not a transaction.

import { clamp, clamp01, lerp, TAU } from '../lib/math.js';

/**
 * What each kind of animal will come for. `bait` is what has to be on your
 * back or in your hand, `tone` is the voice it answers in, and `notes` is how
 * many pitches its phrases are drawn from - a bird has a wider range than a
 * lizard, which is most of why a bird is harder.
 */
export const LURES = {
  bird:    { bait: 'berries', n: 3, tone: 1.9, notes: 5, name: 'berries' },
  reptile: { bait: 'water',   n: 14, tone: 0.8, notes: 3, name: 'standing water' },
  insect:  { bait: 'nectar',  n: 2, tone: 2.4, notes: 4, name: 'a flower in bloom' },
  mammal:  { bait: 'shade',   n: 1, tone: 1.2, notes: 4, name: 'shade on your back' },
  default: { bait: 'berries', n: 2, tone: 1.4, notes: 4, name: 'berries' },
};

const PHRASES = 4;              // how many rounds of call and response
const HEAR_SECS = 0.42;         // how long each note of the call is held
const WINDOW = 0.34;            // how far off the beat still counts

export class Taming {
  constructor(game) {
    this.game = game;
    this.live = false;
    this.target = null;
    this.round = 0;
    this.call = [];             // the phrase it just sang
    this.said = [];             // what you have sung back so far
    this.phase = 'listen';      // listen | answer | won | lost
    this.t = 0;
    this.idx = 0;               // which note of the call is sounding
    this.score = 0;
    this.wobble = 0;            // how badly the last note went
  }

  lureFor(def) {
    return LURES[def.clade] || LURES[def.plan] || LURES.default;
  }

  /**
   * Is this animal close enough to being willing? It has to have eaten what
   * its species eats and stuck around long enough to trust you a little.
   */
  willing(c) {
    return !!c && c.alive && !c.tamed && !c.hostile && c.trust >= 0.55;
  }

  /** Why it is not willing yet, in one line, for the prompt. */
  why(c) {
    if (!c) return 'Nothing close enough.';
    if (c.tamed) return 'Already yours.';
    if (c.hostile) return 'That one is not going to sing with you.';
    const l = this.lureFor(c.def);
    if (c.trust < 0.55) return `Not yet. It wants ${l.name}, and time.`;
    return null;
  }

  // -- the song -------------------------------------------------------------

  begin(c) {
    const why = this.why(c);
    if (why) return { ok: false, why };
    this.live = true;
    this.target = c;
    this.round = 0;
    this.score = 0;
    this.phase = 'listen';
    this._nextPhrase();
    this.game.audio?.play('chirp', { pitch: this.lureFor(c.def).tone });
    return { ok: true };
  }

  stop(won = false) {
    const c = this.target;
    this.live = false;
    this.target = null;
    this.phase = won ? 'won' : 'lost';
    return c;
  }

  _nextPhrase() {
    const l = this.lureFor(this.target.def);
    const len = 2 + this.round;             // 2, 3, 4, 5 notes
    this.call = [];
    for (let i = 0; i < len; i++) this.call.push(Math.floor(Math.random() * l.notes));
    this.said = [];
    this.idx = -1;
    this.t = 0;
    this.phase = 'listen';
  }

  /** How long the call takes to sing, so the UI can draw it as a strip. */
  get callSecs() { return this.call.length * HEAR_SECS; }

  /**
   * You answer with a pitch: 0 is the lowest note it uses, `notes-1` the
   * highest. Right note, roughly on the beat, and you are still in it.
   */
  answer(note) {
    if (!this.live || this.phase !== 'answer') return { ok: false };
    const want = this.call[this.said.length];
    const beat = this.said.length * HEAR_SECS;
    const late = Math.abs(this.t - beat);
    const right = note === want && late <= WINDOW;
    this.said.push(note);
    this.wobble = right ? 0 : 1;
    const l = this.lureFor(this.target.def);
    this.game.audio?.play('chirp', { pitch: l.tone * (0.8 + note * 0.16) });
    if (!right) {
      this.score = Math.max(0, this.score - 1);
      this.game.audio?.play('deny');
    } else {
      this.score++;
    }
    if (this.said.length >= this.call.length) this._endPhrase();
    return { ok: true, right };
  }

  _endPhrase() {
    const clean = this.said.every((n, i) => n === this.call[i]);
    const c = this.target;
    if (clean) {
      c.trust = clamp01(c.trust + 0.12);
      this.game.fx?.spark(c.x, c.y - 10, '#ffe9a8', 10, 30);
    } else {
      c.trust = Math.max(0, c.trust - 0.06);
      this.game.fx?.drift(c.x, c.y - 10, '#9a8a70', 2);
    }
    this.round++;
    if (this.round >= PHRASES) {
      // it takes most of the phrases right to actually join you
      const won = this.score >= this.call.length * 2;
      const animal = this.stop(won);
      if (won) this.game.onSungTame?.(animal);
      else this.game.onSongLost?.(animal);
      return;
    }
    this.phase = 'gap';
    this.t = 0;
  }

  update(dt) {
    if (!this.live) return;
    this.t += dt;
    this.wobble = Math.max(0, this.wobble - dt * 2.5);
    const c = this.target;
    if (!c || !c.alive || Math.abs(c.x - this.game.crab.x) > 170) {
      const animal = this.stop(false);
      this.game.onSongLost?.(animal);
      return;
    }
    const l = this.lureFor(c.def);

    if (this.phase === 'listen') {
      const i = Math.floor(this.t / HEAR_SECS);
      if (i !== this.idx && i < this.call.length) {
        this.idx = i;
        this.game.audio?.play('chirp', { pitch: l.tone * (0.8 + this.call[i] * 0.16) });
        this.game.fx?.popup(c.x, c.y - 16 - this.call[i] * 3, '.', '#ffe9a8');
      }
      if (this.t >= this.callSecs + 0.25) { this.phase = 'answer'; this.t = 0; }
      return;
    }
    if (this.phase === 'answer') {
      // run out of time on a note and it counts as a fumble
      const beat = this.said.length * HEAR_SECS;
      if (this.t > beat + WINDOW + 0.18) this.answer(-1);
      return;
    }
    if (this.phase === 'gap' && this.t > 0.7) this._nextPhrase();
  }
}
