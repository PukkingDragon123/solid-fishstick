// CRABDEN - sitting down with him.
//
// Everything else he says, he says over his shoulder while you are both
// doing something else. This is the one place where you both stop.
//
// The rule of it: you have no voice, so you tap. Every word you can say has
// its code written underneath it, because the code IS the language and hiding
// it would be like hiding the words. Tap it out on the key and he hears it.
// Point at it instead if your hands are busy - it is the same sentence either
// way, and he does not treat you differently for pointing.
//
// He answers a card at a time, with his face on each one. Some of the
// answers are lessons, and those are the only place in the game where you are
// actually taught anything: not a tooltip, not a tutorial step, but a man
// who has been out here eleven years telling you how to grow a plant.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { drawPlate, drawNodeIcon } from './icons.js';
import { facePortrait } from '../art/faces.js';
import { CODE, TOPICS, TOPIC_BY_WORD, morseFor } from '../systems/talk.js';
import { QUEST_BY_ID, offerCards } from '../systems/quests.js';

const INK = '#f2e4c2';
const DIM = 'rgba(240,226,192,0.66)';
const FAINT = 'rgba(240,226,192,0.34)';
const OUT = 'rgba(12,8,5,0.72)';
const TAP = '#8fe0cc';

/**
 * Two frames make a jaw. Whatever face he is wearing, talking flips between
 * it and its opposite number - a shut mouth opens, an open one closes - so he
 * is never a still picture with words appearing beside it.
 */
const JAW = {
  flat: 'talk', talk: 'flat', grin: 'laugh', laugh: 'grin', joy: 'grin',
  smug: 'talk', squint: 'talk', frown: 'gasp', gasp: 'frown', glare: 'scowl',
  scowl: 'glare', shout: 'flat', peer: 'talk', blank: 'talk', dull: 'talk',
  sad: 'talk', tired: 'talk', drink: 'flat', spore: 'gasp',
};
/** The frames that already have his eyes shut, which must not blink again. */
const EYES_SHUT = new Set(['shut', 'sleep', 'laugh', 'joy']);

/**
 * A board to pin things to. Everything on this screen used to float on the
 * darkened world, which is why it read as a debug overlay: a portrait with no
 * frame, slabs with nothing behind them. Now each group sits on a piece of his
 * kit - tooled leather with a lip along the top and the shadow of one along
 * the bottom - and the screen reads as his field desk instead of a menu.
 */
function board(ctx, x, y, w, h) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 4 || h < 4) return;
  drawPlate(ctx, x, y, w, h, { mat: 'leather', edge: 'rgba(16,10,6,0.8)' });
  ctx.fillStyle = 'rgba(236,212,160,0.16)';
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = 'rgba(8,5,3,0.45)';
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
}

/** The brass tack in each corner of a board. */
function tacks(ctx, x, y, w, h) {
  for (const [tx, ty] of [[x + 3, y + 3], [x + w - 5, y + 3],
                          [x + 3, y + h - 5], [x + w - 5, y + h - 5]]) {
    ctx.fillStyle = '#9a7a3e';
    ctx.fillRect(Math.round(tx), Math.round(ty), 2, 2);
    ctx.fillStyle = 'rgba(246,226,170,0.7)';
    ctx.fillRect(Math.round(tx), Math.round(ty), 1, 1);
  }
}

/** How far he has to be for the conversation to be possible at all. */
export const TALK_RANGE = 64;

export class TalkScreen {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.fade = 0;
    this.pick = 0;
    this.rows = [];          // the topic boxes, for the mouse
    this.arows = [];         // and the answer plates, when he asks you one
    this.apick = 0;
    this.said = new Set();   // which topics you have been through

    // what he is in the middle of answering
    this.topic = null;
    this.line = 0;
    this.type = 0;           // how much of the current line has arrived

    // the tap channel, which is its own little morse decoder so it cannot
    // fight with the one out in the world
    this.marks = '';
    this.word = '';
    this.gap = 0;
    this.held = 0;
    this.down = false;
    this.flash = 0;          // lights the matched topic for a moment

    // what makes him look like somebody sitting opposite you rather than a
    // string arriving in a box
    this.think = 0;          // a beat before he answers, because he thinks
    this.hold = 0;           // the pause the last character earned
    this.mouth = 0;          // drives the open/shut of his jaw while he talks
    this.blink = 2 + Math.random() * 3;
    this.lean = 0;           // the settle when a new card starts
    this.idle = 0;           // how long you have left him waiting
  }

  get near() {
    const g = this.game;
    return !!g.npc && !g.npc.hidden && Math.abs(g.npc.x - g.crab.x) < TALK_RANGE;
  }

  open() {
    if (this.on) return;
    this.on = true;
    this.t = 0;
    this.pick = 0;
    this.topic = null;
    this.line = 0;
    this.marks = '';
    this.word = '';
    this.rows = [];
    this.arows = [];
    this.apick = 0;
    this.game.audio?.play('ui');
    // He turns to face you, and he WALKS OVER. Two people having a
    // conversation stand within arm's length of each other; he used to hold
    // his ground at forty pixels and shout across it, which is also why you
    // could never reach him with anything.
    const g = this.game;
    g.npc.setFacing(Math.sign(g.crab.x - g.npc.x) || -1);
    const side = Math.sign(g.npc.x - g.crab.x) || 1;
    g.npc.moveTo = g.crab.x + side * (g.crab.m.shellW * 0.5 + 18);
    g.npc.keepAway = false;
    g.npc.speech = null;
    // and the camera comes in on the pair of you. A conversation is a
    // two-shot; the wide shot is for walking.
    g.cam.follow = null;
    g.cam.free = true;
    // and he does not wait to be asked
    this._offerWork();
  }

  close() {
    if (!this.on) return;
    this.on = false;
    this.topic = null;
    const g = this.game;
    g.cam.free = false;
    g.cam.followEntity(g.crab);
    g.cam.targetZoom = g.autoZoom();
    g.audio?.play('ui', { pitch: 0.7 });
  }

  /** Hold the two-shot: both of you in frame, closer than the game ever is. */
  _hold() {
    const g = this.game;
    const cam = g.cam;
    if (cam.cine) return;
    cam.free = true;
    cam.freeT = 9;
    cam.tx = (g.crab.x + g.npc.x) / 2;
    cam.ty = (g.crab.y + g.npc.y) / 2 - 16;
    cam.targetZoom = clamp(g.autoZoom() * 1.5, 1.2, 3.2);
  }

  /** Which topics are on the table right now. */
  list() {
    const g = this.game;
    return TOPICS.filter((tp) => !tp.when || tp.when(g));
  }

  // -- saying something -----------------------------------------------------

  /**
   * The tap key, decoded locally. A short press is a dot, a long one a dash, a
   * pause ends the letter and a longer pause ends the word - and if the word
   * is one he knows, that is what you said.
   */
  _tap(dt, held) {
    if (held && !this.down) { this.down = true; this.held = 0; }
    else if (held) this.held += dt;
    else if (this.down) {
      this.down = false;
      this._push(this.held > 0.22 ? '-' : '.');
    }
    if (!this.down && (this.marks || this.word)) {
      this.gap += dt;
      if (this.marks && this.gap > 0.55) this._endLetter();
      else if (this.word && this.gap > 1.1) this._endWord();
    }
  }

  _push(mark) {
    this.marks += mark;
    this.gap = 0;
    this.game.crab.tap(mark === '-');
    this.game.audio?.play('ui', { pitch: mark === '-' ? 0.7 : 1.4 });
  }

  _endLetter() {
    this.word += CODE[this.marks] || '?';
    this.marks = '';
    this.gap = 0;
    // the moment the letters spell something he knows, he answers - there is
    // no need to make you sit through the trailing pause
    const hit = TOPIC_BY_WORD[this.word];
    if (hit && this.list().includes(hit)) this._endWord();
    else if (this.word.length > 8) this._endWord();
  }

  _endWord() {
    const word = this.word;
    this.word = '';
    this.marks = '';
    this.gap = 0;
    if (!word) return;
    // while he is waiting on an answer the key answers HIM, not the topic
    // list - the same word, tapped, means the same thing
    const ch = this.choices;
    if (ch) {
      const c = ch.find((o) => o.word === word);
      if (c) { this.flash = 1; this.game.morse.learned = true; this.choose(c); return; }
      this.game.audio?.play('deny');
      return;
    }
    const hit = TOPIC_BY_WORD[word];
    if (hit && this.list().includes(hit)) {
      this.flash = 1;
      this.game.morse.learned = true;
      this.ask(hit, true);
    } else {
      // he does not pretend to understand - he tells you he did not
      this.topic = {
        id: '_miss', word,
        lines: [{ icon: 'close', t: `"${word}". I have no idea. Slower - long taps and short ones, and a gap between the letters.` }],
      };
      this.line = 0;
      this._begin();
      this.game.npc.mood = 'blank';
      this.game.audio?.play('deny');
    }
  }

  /** Say a topic, however you said it. */
  ask(tp, tapped = false) {
    // most answers are written down; one of them is whatever he wants doing
    // next, which is only knowable at the moment you ask
    this.topic = tp.build ? { ...tp, lines: tp.build(this.game) } : tp;
    this.line = 0;
    this._begin();
    this._wear();
    this.said.add(tp.id);
    this.game.audio?.play(tapped ? 'discover' : 'uiBig');
    if (tp.id === 'bye') { this._byeAfter = true; }
  }

  /**
   * Is he waiting on an answer?
   *
   * A card can end on a question, and when it does the conversation stops
   * being a thing you click through: the answers come up underneath it and
   * one of them has to be chosen. This is the only kind of card that does not
   * advance on a tap anywhere.
   */
  get choices() {
    const ln = this.topic?.lines?.[this.line];
    if (!ln?.choices) return null;
    if (this.think > 0 || this.type < 1) return null;
    return ln.choices;
  }

  /**
   * You answered.
   *
   * An answer can take a job, run something in the world, and put words in
   * his mouth - and if it does put words in his mouth those words become the
   * rest of the card stack, so a conversation can actually go somewhere
   * rather than stopping dead the moment you choose.
   */
  choose(c) {
    if (!c) return;
    const g = this.game;
    if (c.take) {
      const job = QUEST_BY_ID[c.take];
      if (job && g.quests.take(job)) {
        g.ui?.say(`TAKEN: ${job.name}`, 3.4);
        g.quests.tookT = 2.6;
      }
    }
    c.then?.(g);
    this.arows = [];
    this.apick = 0;
    if (c.go && c.go.length) {
      // he answers your answer
      this.topic = { ...this.topic, lines: c.go };
      this.line = 0;
      this._begin();
      this._wear();
      g.audio?.play('uiBig');
      return;
    }
    const tp = this.topic;
    tp?.then?.(g);
    this.topic = null;
    g.audio?.play('ui');
    if (this._byeAfter) { this._byeAfter = false; this.close(); }
  }

  /**
   * He puts work in front of you.
   *
   * Asking a man with a clipboard what he wants is not something a player
   * thinks to do, and a quest nobody ever asks for is a quest that does not
   * exist. So he does not wait to be asked: the moment you sit down with
   * nothing on your plate, the first thing out of his mouth is the job, and
   * it comes with the same two answers as if you had asked.
   */
  _offerWork() {
    const g = this.game;
    const q = g.quests;
    if (!q || q.active) return false;
    const next = q.next();
    if (!next) return false;
    const cards = offerCards(next);
    // he opens it himself, so the first card gets a line saying he brought it
    this.topic = { id: '_offer', word: 'WORK', lines: [
      { icon: 'call', mood: 'peer',
        t: 'Before you go. There is a thing I cannot do with these hands and you can do with yours.' },
      ...cards,
    ] };
    this.line = 0;
    this._begin();
    this._wear();
    g.audio?.play('uiBig');
    return true;
  }

  /** Next card, or back to the list when the answer has run out. */
  advance() {
    const tp = this.topic;
    if (!tp) return;
    // a part-typed line completes instead of advancing, so a fast reader is
    // never punished and a slow one is never rushed
    // tapping through a line he has not finished saying finishes it, and
    // tapping through the beat before it skips his thinking about it
    if (this.think > 0) { this.think = 0; return; }
    if (this.type < 1) { this.type = 1; this.hold = 0; return; }
    // a question is not something you can click past
    if (this.choices) return;
    if (this.line < tp.lines.length - 1) {
      this.line++;
      this._begin();
      this._wear();
      this.game.audio?.play('talk');
      return;
    }
    tp.then?.(this.game);
    this.topic = null;
    if (this._byeAfter) { this._byeAfter = false; this.close(); return; }
    if (tp.id !== '_offer' && tp.id !== 'work') this._offerWork();
  }

  /**
   * Starting a card. Nobody answers the instant they are asked, so there is a
   * beat first - a short one for a short line, a longer one when he has to
   * think about it - and he wears a face while he does it.
   */
  _begin() {
    const ln = this.topic?.lines?.[this.line];
    const n = (ln?.t || '').length;
    this.type = 0;
    this.hold = 0;
    this.mouth = 0;
    this.think = this.line === 0 ? 0.30 + Math.min(0.42, n * 0.0022) : 0.13;
    this.lean = 1;
    this.arows = [];
    this.apick = 0;
  }

  /**
   * The face he is wearing for the line he is on. A line can name its own -
   * some of them are written for one particular look - and anything that
   * does not gets read the same way his shouted lines out in the desert do.
   */
  _wear() {
    const ln = this.topic?.lines?.[this.line];
    if (!ln) return;
    this.game.npc.mood = ln.mood || this.game.npc._faceFor(ln.t);
  }

  // -- the frame ------------------------------------------------------------

  update(dt) {
    const g = this.game;
    this.fade = damp(this.fade, this.on ? 1 : 0, 0.0004, dt);
    if (!this.on) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2);
    this.lean = Math.max(0, this.lean - dt * 2.6);

    // He blinks. It is one frame of the sheet every few seconds and it is the
    // difference between a man and a photograph of one.
    this.blink -= dt;
    if (this.blink < -0.12) this.blink = 2.4 + Math.random() * 3.4;

    // The line arrives a character at a time, and it does NOT arrive at a
    // constant rate: a full stop is worth a fifth of a second and a comma is
    // worth half of that, which is the whole difference between somebody
    // talking and a teleprinter.
    if (this.think > 0) {
      this.think -= dt;
    } else if (this.type < 1) {
      if (this.hold > 0) {
        this.hold -= dt;
      } else {
        const t = this.topic?.lines?.[this.line]?.t || '';
        const n = Math.max(1, t.length);
        const was = Math.floor(this.type * n);
        this.type = Math.min(1, this.type + (dt * 30) / n);
        const now = Math.floor(this.type * n);
        for (let k = was; k < now; k++) {
          const c = t[k];
          if (c === '.' || c === '!' || c === '?') this.hold = Math.max(this.hold, 0.20);
          else if (c === ',' || c === ';' || c === '-') this.hold = Math.max(this.hold, 0.09);
          // his voice, such as it is: one blip every few letters, never on a
          // space, so it reads as speech rather than as a machine
          if (c && c !== ' ' && k % 3 === 0) {
            g.audio?.play('talk', { pitch: 0.82 + Math.random() * 0.2 });
          }
        }
        this.mouth += dt;
      }
    }

    // and when he has nothing to answer he does not freeze: he looks away,
    // looks back, and eventually says something unprompted
    if (!this.topic) {
      this.idle += dt;
      if (this.idle > 9) {
        this.idle = 0;
        g.npc.mood = ['flat', 'squint', 'peer', 'dull', 'smug'][Math.floor(Math.random() * 5)];
      }
    } else {
      this.idle = 0;
    }

    // walk away and the conversation ends, because he is a person standing
    // in a place and not a menu
    if (!this.near || g.state !== 'play') { this.close(); return; }
    this._hold();

    const i = g.input;
    // The key is held, not clicked, so it is read off the pointer being down
    // inside it rather than off a click event - a click has no length and the
    // length is the entire point.
    const kb = this._keyBox(g.renderer.vw, g.renderer.vh, Math.round(g.renderer.vh * 0.055));
    const onKey = i.sx >= kb.x && i.sx <= kb.x + kb.w && i.sy >= kb.y && i.sy <= kb.y + kb.h;
    const pressing = onKey && i.down;
    if (pressing) i.clicked = false;    // so it never also turns the card
    this._tap(dt, i.key('t') || pressing);

    if (i.justPressed('Escape')) { i.consumeKey('Escape'); this.close(); return; }

    // ---- he asked you something -----------------------------------------
    const ch = this.choices;
    if (ch) {
      if (i.justPressed('ArrowDown') || i.justPressed('s')) { this.apick = (this.apick + 1) % ch.length; g.audio?.play('ui'); }
      if (i.justPressed('ArrowUp') || i.justPressed('w')) { this.apick = (this.apick + ch.length - 1) % ch.length; g.audio?.play('ui'); }
      for (let n = 0; n < ch.length && n < 4; n++) {
        if (i.justPressed(String(n + 1))) { i.consumeKey(String(n + 1)); this.choose(ch[n]); return; }
      }
      if (i.justPressed('Enter') || i.justPressed(' ')) {
        i.consumeKey('Enter'); i.consumeKey(' ');
        this.choose(ch[this.apick]);
        return;
      }
      for (const r of this.arows) {
        if (i.sx < r.x || i.sx > r.x + r.w || i.sy < r.y || i.sy > r.y + r.h) continue;
        if (this.apick !== r.i) { this.apick = r.i; g.audio?.play('ui'); }
        if (i.clicked) { i.clicked = false; this.choose(ch[r.i]); }
        return;
      }
      // and a click anywhere else does NOTHING, because a question is a
      // question and clicking past it is how you end up with a quest you
      // never agreed to
      if (i.clicked) i.clicked = false;
      return;
    }

    if (i.justPressed('Enter') || i.justPressed(' ')) {
      i.consumeKey('Enter'); i.consumeKey(' ');
      if (this.topic) this.advance();
      else this.ask(this.list()[this.pick]);
      return;
    }
    if (!this.topic) {
      const n = this.list().length;
      if (i.justPressed('ArrowDown') || i.justPressed('s')) { this.pick = (this.pick + 1) % n; g.audio?.play('ui'); }
      if (i.justPressed('ArrowUp') || i.justPressed('w')) { this.pick = (this.pick + n - 1) % n; g.audio?.play('ui'); }
    }

    // the mouse, read here rather than in the draw so a click is never eaten
    // by the frame ending first
    for (const r of this.rows) {
      if (i.sx < r.x || i.sx > r.x + r.w || i.sy < r.y || i.sy > r.y + r.h) continue;
      if (this.pick !== r.i) { this.pick = r.i; g.audio?.play('ui'); }
      if (i.clicked) { i.clicked = false; this.ask(this.list()[r.i]); }
      return;
    }
    // clicking anywhere else while he is talking turns the card
    if (i.clicked && this.topic) { i.clicked = false; this.advance(); }
  }

  draw(ctx, W, H) {
    if (this.fade < 0.01) return;
    const g = this.game;
    const a = clamp01(this.fade);

    // ---- the world goes quiet behind him ---------------------------------
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = '#0b0806';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = a;
    // letterbox, so it reads as a scene and not a panel
    const lb = Math.round(H * 0.055);
    ctx.fillStyle = '#070503';
    ctx.fillRect(0, 0, W, lb);
    ctx.fillRect(0, H - lb, W, lb);

    // A phone held upright has no left-hand column to put anybody in. Wide,
    // he stands at the side of the frame and what passes between you is next
    // to him; narrow, he is at the top of it looking down at you and the
    // talking happens underneath, which is also roughly what is happening.
    const narrow = W < 360;
    // The card is his portrait sheet, as large as the frame will take it -
    // whole pixels only, so his hat has edges. Sitting down with somebody is
    // the one time you get to look at their face.
    // How large he gets is decided by what has to fit under him. Upright, his
    // portrait is above everything, so a list of twelve words takes priority
    // over a bigger face and a card of one sentence does not.
    let K;
    if (narrow) {
      const rows = this.topic ? 3 : Math.ceil(this.list().length / 2);
      const need = rows * 34 + 22;
      K = Math.min(3, Math.floor((W - 24) / 66) || 1);
      const limit = this._floorY(W, H, lb);
      while (K > 1 && lb + 4 + 21 * K + 64 * K * 0.62 + need > limit) K--;
    } else {
      // and never taller than the room left above the wire and the key, or
      // his nameplate ends up behind them
      const room = this._floorY(W, H, lb) - lb - 22;
      K = Math.max(1, Math.min(4, Math.floor(Math.min(W * 0.30 / 59, H * 0.58 / 64, room / 64))));
    }
    const spore = (g.mind?.blue || 0) > 0.35 ? 1 : 0;
    // the face he is actually wearing this frame: his mood, with a jaw on it
    // while the line is arriving and a blink over the top of both
    let face = g.npc.mood || 'flat';
    const saying = this.topic && this.think <= 0 && this.type < 1 && this.hold <= 0;
    if (saying && Math.floor(this.mouth * 9) % 2 === 1) face = JAW[face] || 'talk';
    if (this.blink < 0 && !EYES_SHUT.has(face)) face = 'shut';
    let port = null;
    try { port = facePortrait(face, K, spore); } catch { port = null; }

    // He sits in a frame, the way a photograph pinned in a field notebook
    // does: a leather board, a stone mount cut into it, his face in the
    // mount and his name on a plate across the bottom. Loose on the dimmed
    // world he was just an image that had wandered into the corner.
    const pw = port ? port.W : 52, ph = port ? port.H : 58;
    const PAD = 4, NAME = 12;
    const cardW = pw + PAD * 2, cardH = ph + PAD * 2 + NAME;
    const cardX = Math.round(narrow ? W / 2 - cardW / 2
      : clamp(W * 0.055, 6, W - cardW - 8));
    const floorY = this._floorY(W, H, lb);
    const cardY = Math.round(narrow ? lb + 4
      : clamp(H * 0.5 - cardH * 0.55, lb + 6, Math.max(lb + 6, floorY - cardH)));
    board(ctx, cardX, cardY, cardW, cardH);
    tacks(ctx, cardX, cardY, cardW, cardH);
    // the mount he is pinned to: flat and dark, because anything with a
    // texture of its own fights the drawing sitting on top of it
    ctx.fillStyle = '#231a16';
    ctx.fillRect(cardX + PAD - 1, cardY + PAD - 1, pw + 2, ph + 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(cardX + PAD - 1, cardY + PAD - 1, pw + 2, 1);
    ctx.fillStyle = 'rgba(226,198,146,0.10)';
    ctx.fillRect(cardX + PAD - 1, cardY + PAD + ph, pw + 2, 1);
    if (port) {
      // a breath, so he is not a still image while he is talking, and a clip
      // so the breath never pushes his hat out through the frame
      // breathing, plus the settle he makes when he starts a new sentence
      const br = Math.sin(this.t * 1.4) * 0.6
        + (saying ? Math.sin(this.t * 17) * 0.45 : 0)
        - this.lean * this.lean * 3;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cardX + PAD, cardY + PAD, pw, ph);
      ctx.clip();
      ctx.drawImage(port.cv, cardX + PAD, Math.round(cardY + PAD + br));
      ctx.restore();
    }
    // his name, cut into a strip of the same stone as everything you say
    const npY = cardY + cardH - NAME - 2;
    drawPlate(ctx, cardX + 3, npY, cardW - 6, NAME, { mat: 'stone', edge: 'rgba(18,12,8,0.5)' });
    // his whole name if the card is wide enough for it, and the half of it
    // that matters if it is not
    const nm = textWidth('DR. ELIAS VESS') + 8 <= cardW ? 'DR. ELIAS VESS' : 'DR. VESS';
    drawText(ctx, nm, cardX + cardW / 2, npY + 3, { color: '#d9c08a', align: 'center' });
    const px = cardX + cardW / 2;
    const nameY = npY;

    // ---- what he is saying, or what you could say -----------------------
    const cx = Math.round(narrow ? W * 0.06 : cardX + cardW + 12);
    const cw = Math.round(W - cx - W * 0.06);
    const cy = narrow ? cardY + cardH + 21 : Math.round(H * 0.24);

    if (this.topic) {
      this.rows = [];
      this._card(ctx, cx, cy, cw, H);
    } else {
      // a phone on its side has almost no height, so the grid starts right
      // under the letterbox instead of a fifth of the way down
      const top = narrow ? cy : H < 210 ? lb + 6 : Math.round(H * 0.18);
      this._topics(ctx, cx, top, cw, H, narrow);
    }

    // ---- the key, and the wire you are talking on ------------------------
    this._key(ctx, W, H, lb);
    this._wire(ctx, W, H, lb);
    ctx.globalAlpha = 1;
  }

  /** One card of his answer, with its icon and the line typing itself in. */
  _card(ctx, x, y, w, H) {
    const tp = this.topic;
    const ln = tp.lines[this.line];
    const lines = wrapText(ln.t, w - 34);
    const h = Math.max(46, lines.length * LINE_H + 20);
    // what he says is on paper, and the paper is pinned to the board rather
    // than hanging in the air
    board(ctx, x - 5, y - 5, w + 10, h + 10);
    tacks(ctx, x - 5, y - 5, w + 10, h + 10);
    drawPlate(ctx, x, y, w, h, { mat: 'paper', edge: 'rgba(120,96,58,0.5)', alpha: 0.98 });

    // the icon down the left of the card, on its own margin
    if (ln.icon) {
      ctx.globalAlpha = 0.92;
      drawNodeIcon(ctx, ln.icon, x + 15, y + h / 2, '#7a5a2a', 2);
      ctx.globalAlpha = 1;
      // a hairline between the icon's margin and what he is saying
      ctx.fillStyle = 'rgba(168,64,52,0.35)';
      ctx.fillRect(x + 25, y + 6, 1, h - 12);
    }
    const tx = x + 28;
    // while he is thinking, the card is blank but for the three dots anybody
    // makes when they are about to say something
    if (this.think > 0) {
      const n = 1 + Math.floor((0.7 - this.think) * 7) % 3;
      drawText(ctx, '.'.repeat(Math.max(1, n)), tx, y + 10, { color: '#7a6a4c' });
      return;
    }
    // the line arrives a character at a time - he is talking, not printing
    const total = lines.join('').length;
    let budget = Math.ceil(total * this.type);
    lines.forEach((l, i) => {
      if (budget <= 0) return;
      const cut = l.slice(0, budget);
      budget -= l.length;
      drawText(ctx, cut, tx, y + 10 + i * LINE_H, { color: '#332a1c' });
    });

    // how far through the answer you are, as pips rather than "3 / 5"
    const n = tp.lines.length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i <= this.line ? '#7a5a2a' : 'rgba(140,122,90,0.5)';
      ctx.fillRect(x + w - 8 - (n - i) * 5, y + h - 6, 3, 3);
    }

    // ---- and if he asked you something, the answers ---------------------
    const ch = this.choices;
    if (ch) { this._answers(ctx, x, y + h + 8, w, ch); return; }

    // a caret that breathes, meaning there is more
    const b = 0.5 + 0.5 * Math.sin(this.t * 4);
    ctx.globalAlpha = 0.3 + b * 0.6;
    ctx.fillStyle = '#7a5a2a';
    for (let k = 0; k < 4; k++) {
      ctx.fillRect(Math.round(x + w - 14 + k), Math.round(y + h + 4 + k), 4 - k, 1);
      ctx.fillRect(Math.round(x + w - 14 + k), Math.round(y + h + 4 - k), 4 - k, 1);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * WHAT YOU SAY BACK.
   *
   * He stops, and the things you could say to him come up underneath what he
   * just said - on the same stone every word you can say is cut into, with
   * the code under each one, because you have no voice and the code is the
   * language. Pick one with the mouse, the arrows, a number, or by tapping
   * the word out on the key, which is the answer that actually costs you
   * something and is therefore the one that counts.
   *
   * Nothing dismisses these. A question you can click past is a question the
   * game answered for you.
   */
  _answers(ctx, x, y, w, ch) {
    this.arows = [];
    const touch = !!this.game.ui?.touchEnabled;
    const h = touch ? 30 : 24;
    const gap = 4;
    ch.forEach((c, i) => {
      const by = y + i * (h + gap);
      const on = this.apick === i;
      const tint = c.tint || (on ? '#e8d3a2' : '#c2ab80');
      drawPlate(ctx, x, by, w, h, {
        mat: 'stone',
        top: on ? 'rgba(96,84,60,0.98)' : 'rgba(54,46,32,0.94)',
        edge: on ? tint : 'rgba(140,118,80,0.45)',
      });
      if (on) { ctx.fillStyle = tint; ctx.fillRect(x, by, 2, h); }
      // the number, so a keyboard can answer without moving a cursor
      drawText(ctx, `${i + 1}`, x + 8, by + (h - 7) / 2, { color: on ? tint : FAINT });
      drawText(ctx, ellipsize(c.text, w - 32 - textWidth(morseFor(c.word))),
        x + 17, by + (h - 7) / 2 - (c.word ? 3 : 0), { color: on ? '#f4e6c4' : DIM });
      // and its code, down in the corner, because that is how you say it
      if (c.word) {
        drawText(ctx, morseFor(c.word), x + w - 6, by + h - 10,
          { color: on ? TAP : 'rgba(143,224,204,0.4)', align: 'right' });
      }
      this.arows.push({ i, x, y: by, w, h });
    });
    // and a line saying that this one is on you
    const fy = y + ch.length * (h + gap) + 1;
    const hint = touch ? 'he is waiting on you' : 'he is waiting on you - 1/2, or tap it';
    drawText(ctx, ellipsize(hint, w), x + w, fy,
      { color: 'rgba(240,226,192,0.34)', align: 'right' });
  }

  /**
   * Everything you could say, each with its code under it. The code is not a
   * hint - it is the control. Tap it and he hears it; point at it and he
   * hears the same thing.
   */
  _topics(ctx, x, y, w, H, narrow) {
    const list = this.list();
    const short = H < 210;
    // the key owns the bottom of the screen, so the words stop above it
    const floor = this._floorY(this.game.renderer.vw, H, Math.round(H * 0.055));
    const room = Math.max(40, floor - y);
    // A word you say with a thumb is a thumb tall, and every word he will
    // listen to has to be on the screen - so the grid takes as many columns
    // as it needs and only then starts giving up height.
    const maxH = short ? 24 : this.game.ui?.touchEnabled ? 30 : 21;
    const maxCols = Math.max(1, Math.min(4, Math.floor(w / 56)));
    let cols = narrow ? 1 : w > 300 ? 3 : 2;
    let cellH = maxH;
    for (;;) {
      const rows = Math.ceil(list.length / cols);
      cellH = Math.min(maxH, Math.floor(room / rows) - 4);
      if (cellH >= 22 || cols >= maxCols) break;
      cols++;
    }
    cellH = Math.max(20, Math.min(maxH, cellH));
    const cellW = Math.floor((w - (cols - 1) * 6) / cols);
    // the code goes under each word where it fits, and on one line of its own
    // under the whole grid where it does not - it is never simply not there
    const codeFits = Math.max(...list.map((tp) => textWidth(morseFor(tp.word)))) + 12 <= cellW
      && cellH >= 24;
    // lay the grid out first, so the board can be cut to fit it rather than
    // the tablets floating on the dimmed world with nothing behind them
    const rows = [];
    list.forEach((tp, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = x + col * (cellW + 6);
      const by = y + row * (cellH + 4);
      if (by + cellH > floor) return;
      rows.push({ i, x: bx, y: by, w: cellW, h: cellH });
    });
    if (rows.length) {
      const gx = rows[0].x, gy = rows[0].y;
      const gw = Math.max(...rows.map((r) => r.x + r.w)) - gx;
      const gh = Math.max(...rows.map((r) => r.y + r.h)) - gy;
      const bh = gh + 21 + (codeFits ? 0 : 9);
      board(ctx, gx - 6, gy - 15, gw + 12, bh);
      tacks(ctx, gx - 6, gy - 15, gw + 12, bh);
      // a carved header, so the board says what it is
      drawText(ctx, 'SAY', gx, gy - 12, { color: 'rgba(214,184,124,0.75)' });
    }
    rows.forEach(({ i, x: bx, y: by }) => {
      const tp = list[i];
      const on = i === this.pick;
      const done = this.said.has(tp.id);
      const lit = this.flash > 0 && this.word === '' && this.said.has(tp.id);
      // what you can say is cut into stone, because you say it by hitting
      // something hard with a claw
      drawPlate(ctx, bx, by, cellW, cellH, {
        mat: 'stone',
        edge: on ? '#e2b74a' : lit ? TAP : 'none',
        top: on ? 1 : undefined,
      });
      if (on) {
        ctx.fillStyle = '#e2b74a';
        ctx.fillRect(bx, by, 2, cellH);
      }
      const wy = codeFits ? by + (cellH - 19) / 2 : by + (cellH - 7) / 2;
      drawText(ctx, ellipsize(tp.word, cellW - 10), bx + 6, wy,
        { color: on ? '#f7ecd0' : done ? 'rgba(180,156,112,0.8)' : '#b49c70' });
      // its code, in the colour the tap channel uses everywhere else
      if (codeFits) {
        drawText(ctx, morseFor(tp.word), bx + 6, wy + 10,
          { color: on ? TAP : 'rgba(143,224,204,0.45)' });
      }
    });
    if (!codeFits && rows.length) {
      const last = rows[rows.length - 1];
      const sel = list[this.pick];
      if (sel) {
        drawText(ctx, morseFor(sel.word), x + w / 2, last.y + last.h + 5,
          { color: TAP, align: 'center' });
      }
    }
    this.rows = rows;

    // what he is waiting for you to say, under the whole grid
    const b = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2));
    ctx.globalAlpha = b;
    drawText(ctx, this.said.size ? '' : 'tap it, or point at it',
      x + w - 4, y - 12, { color: FAINT, align: 'right' });
    ctx.globalAlpha = 1;
  }

  /**
   * THE KEY.
   *
   * You have no mouth. You have a claw, and the claw is hard, and there is a
   * flat stone in front of you - which is how anybody without a voice has
   * ever sent a sentence over a distance. So there is a key, and you hold it
   * down with the pincer: a short press is a dot, a long one is a dash, and
   * letting go for a moment ends the letter.
   *
   * It is one enormous plate because it is one thing you do with one thumb,
   * and it is the only control on this screen that needs any timing at all.
   */
  _keyBox(W, H, lb) {
    const touch = !!this.game.ui?.touchEnabled;
    if (H < 210) {
      // a phone on its side has no spare rows at all, so the key moves onto
      // the bottom line beside the wire instead of sitting above it
      const x = Math.round(W * 0.46);
      const h = 28;
      return { x, y: H - lb - h - 4, w: W - x - 8, h };
    }
    const w = Math.min(220, Math.max(120, Math.round(W * (touch ? 0.62 : 0.34))));
    const h = touch ? 56 : 34;
    return { x: Math.round(W / 2 - w / 2), y: H - lb - 24 - h, w, h };
  }

  /** The top of the wire strip, which the key sits under and the words above. */
  _wireY(W, H, lb) {
    return Math.min(H - lb - 20, this._keyBox(W, H, lb).y - 26);
  }

  /** Everything you can be shown has to stop above the key and the wire. */
  _floorY(W, H, lb) {
    return Math.min(this._keyBox(W, H, lb).y, this._wireY(W, H, lb) - 4) - 8;
  }

  _key(ctx, W, H, lb) {
    const b = this._keyBox(W, H, lb);
    const dash = this.down && this.held > 0.22;
    // the key is bedded in leather, the way a telegraph key is screwed to a
    // board so it does not walk across the desk while you are sending
    board(ctx, b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    tacks(ctx, b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    drawPlate(ctx, b.x, b.y, b.w, b.h, {
      mat: 'stone',
      edge: this.down ? TAP : 'rgba(90,130,120,0.5)',
      top: this.down ? 1 : undefined,
    });
    // the mark you are making right now, growing from a dot into a dash under
    // your own claw - the whole language, happening in your hand
    const tight = b.h < 34;
    const cx = b.x + b.w / 2, cy = b.y + Math.round(b.h * (tight ? 0.34 : 0.42));
    const grow = this.down ? clamp01(this.held / 0.22) : 0;
    const mw = Math.round(4 + grow * (b.w * 0.28));
    ctx.fillStyle = this.down ? (dash ? TAP : '#cfeee4') : 'rgba(120,160,150,0.4)';
    ctx.fillRect(Math.round(cx - mw / 2), Math.round(cy - 2), mw, 5);
    if (!this.down) {
      // at rest it says what it is for, in the only two symbols it makes
      drawText(ctx, 'TAP  .    HOLD  -', cx, cy + 8, { color: FAINT, align: 'center' });
    } else {
      drawText(ctx, dash ? 'DASH' : 'DOT', cx, cy + 8, { color: TAP, align: 'center' });
    }
    // and the letter it is spelling, right under the claw
    const letter = CODE[this.marks];
    if (this.marks) {
      drawText(ctx, letter ? letter : this.marks, cx, b.y + b.h - (tight ? 8 : 12),
        { color: letter ? '#f7ecd0' : 'rgba(200,120,110,0.9)',
          align: 'center', scale: tight ? 1 : 2 });
    }
    return b;
  }

  /**
   * The wire: what is currently on it. Every mark you make shows up here the
   * instant you make it, so the code is never something happening off-screen.
   */
  _wire(ctx, W, H, lb) {
    const x = Math.round(Math.max(12, W * 0.055));
    // above the key, never under it - the two of them used to share the same
    // corner of a phone and the boards sat on top of each other
    const y = this._wireY(W, H, lb);
    const cur = this.marks ? ` ${this.marks}` : this.down ? ' _' : '';
    const on = (this.word + cur).trim();
    const w = Math.max(120, textWidth(on) + 24);
    board(ctx, x - 4, y - 4, w + 8, 22);
    drawPlate(ctx, x, y, w, 14, {
      edge: this.down || on ? TAP : 'rgba(60,90,84,0.45)', rivets: false,
    });
    // a bead that lights while the key is down, so the long/short of it is
    // something you can see rather than something you have to feel
    ctx.fillStyle = this.down ? (this.held > 0.22 ? TAP : '#cfeee4') : 'rgba(90,130,120,0.5)';
    ctx.fillRect(x + 5, y + 5, this.down && this.held > 0.22 ? 7 : 3, 3);
    drawText(ctx, on || '', x + 16, y + 3, { color: TAP });
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash;
      drawText(ctx, 'heard', x + w + 6, y + 3, { color: TAP });
      ctx.globalAlpha = 1;
    }
  }
}
