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
import { drawNodeIcon } from './icons.js';
import * as Kit from './kit.js';
import { facePortrait } from '../art/faces.js';
import { TOPICS } from '../systems/talk.js';
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

    this.flash = 0;          // lights whatever you just said, for a moment

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
    this.rows = [];
    this.arows = [];
    this.apick = 0;
    this.nextBtn = null;
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

  /** Say a topic. */
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
    // NEXT turns the card, and so does a click on the card itself - the
    // button is there so the screen SAYS there is more, not because clicking
    // anywhere had to stop working
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
      const limit = H - lb - 6;
      while (K > 1 && lb + 4 + 21 * K + 64 * K * 0.62 + need > limit) K--;
    } else {
      // and never taller than the room left above the wire and the key, or
      // his nameplate ends up behind them
      const room = H - lb * 2 - 16;
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
    const floorY = H - lb - 6;
    const cardY = Math.round(narrow ? lb + 4
      : clamp(H * 0.5 - cardH * 0.55, lb + 6, Math.max(lb + 6, floorY - cardH)));
    // He sits in the same frame everything else in this game sits in, with
    // his name on the bar across the top of it, because a portrait in its own
    // private material is a portrait that has wandered in from another game.
    // the same brass bezel with a flourish in each corner that everything
    // else you own sits in - because he is, by the end of this, something
    // you own
    Kit.slot(ctx, cardX, cardY, cardW, cardH, { back: '#2b2219' });
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
    // his name on the bar under him
    const npY = cardY + cardH - NAME - 3;
    Kit.slab(ctx, cardX + 3, npY, cardW - 6, NAME, {});
    const nm = textWidth('DR. ELIAS VESS') + 8 <= cardW ? 'DR. ELIAS VESS' : 'DR. VESS';
    drawText(ctx, nm, cardX + cardW / 2, npY + 3, { color: Kit.C.gold, align: 'center' });
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
      const top = narrow ? cy : H < 210 ? lb + 6 : Math.round(H * 0.16);
      this._say(ctx, cx, top, cw, H);
    }

    ctx.globalAlpha = 1;
  }

  /** One card of his answer, with its icon and the line typing itself in. */
  _card(ctx, x, y, w, H) {
    const tp = this.topic;
    const ln = tp.lines[this.line];
    const lines = wrapText(ln.t, w - 34);
    const h = Math.max(46, lines.length * LINE_H + 20);
    // what he says is a page in a frame, the same frame as everything else
    Kit.slab(ctx, x - 4, y - 4, w + 8, h + 8,
      { face: Kit.C.frame, lit: Kit.C.frameLit, dim: Kit.C.frameDim });
    Kit.px(ctx, x - 1, y - 1, w + 2, h + 2, Kit.C.frameDeep);
    Kit.px(ctx, x, y, w, h, Kit.C.page);

    // the icon down the left of the card, on its own margin
    if (ln.icon) {
      ctx.globalAlpha = 0.92;
      drawNodeIcon(ctx, ln.icon, x + 15, y + h / 2, Kit.C.gold, 2);
      ctx.globalAlpha = 1;
      // a hairline between the icon's margin and what he is saying
      Kit.px(ctx, x + 25, y + 4, 1, h - 8, Kit.C.pageDim);
    }
    const tx = x + 28;
    // while he is thinking, the card is blank but for the three dots anybody
    // makes when they are about to say something
    if (this.think > 0) {
      const n = 1 + Math.floor((0.7 - this.think) * 7) % 3;
      drawText(ctx, '.'.repeat(Math.max(1, n)), tx, y + 10, { color: Kit.C.inkSoft });
      return;
    }
    // the line arrives a character at a time - he is talking, not printing
    const total = lines.join('').length;
    let budget = Math.ceil(total * this.type);
    lines.forEach((l, i) => {
      if (budget <= 0) return;
      const cut = l.slice(0, budget);
      budget -= l.length;
      drawText(ctx, cut, tx, y + 10 + i * LINE_H, { color: Kit.C.ink });
    });

    // how far through the answer you are, as pips rather than "3 / 5"
    const n = tp.lines.length;
    for (let i = 0; i < n; i++) {
      Kit.px(ctx, x + w - 8 - (n - i) * 5, y + h - 6, 3, 3,
        i <= this.line ? Kit.C.inkSoft : Kit.C.pageDim);
    }

    // ---- and if he asked you something, the answers ---------------------
    const ch = this.choices;
    if (ch) { this._answers(ctx, x, y + h + 8, w, ch); return; }

    // a caret that breathes, meaning there is more
    // a NEXT button, because "click anywhere" is not something a screen can
    // say and a button is
    const bw = 44, bh = this.game.ui?.touchEnabled ? 20 : 16;
    const bx = x + w - bw, by = y + h + 8;
    const hot = this.game.input.sx >= bx && this.game.input.sx <= bx + bw
      && this.game.input.sy >= by && this.game.input.sy <= by + bh;
    const more = this.line < tp.lines.length - 1;
    Kit.button(ctx, bx, by, bw, bh, more ? 'NEXT' : 'DONE', { hot });
    this.nextBtn = { x: bx, y: by, w: bw, h: bh };
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
    const h = touch ? 22 : 18;
    const gap = 3;
    ch.forEach((c, i) => {
      const by = y + i * (h + gap);
      // Brass when you are on it, wood when you are not. Two gold plates
      // with one shade between them is not a choice you can see.
      const on = this.apick === i;
      if (on) Kit.button(ctx, x, by, w, h, null, { hot: true, tint: c.tint });
      else Kit.slab(ctx, x, by, w, h, { face: Kit.C.wood, lit: Kit.C.woodLit, dim: Kit.C.woodDim });
      // the number, so a keyboard answers without moving a cursor
      // the number sits in a channel cut into the slab, not on a coloured
      // block over the top of it
      Kit.px(ctx, x + 3, by + 3, h - 6, h - 6, 'rgba(10,7,4,0.55)');
      Kit.px(ctx, x + 3, by + 3, h - 6, 1, 'rgba(0,0,0,0.5)');
      Kit.px(ctx, x + 3, by + h - 4, h - 6, 1, 'rgba(226,204,160,0.18)');
      drawText(ctx, `${i + 1}`, x + 2 + h / 2, by + (h - 7) / 2,
        { color: on ? Kit.C.goldLit : Kit.C.inkSoft, align: 'center' });
      drawText(ctx, ellipsize(c.text, w - h - 10), x + h + 2, by + (h - 7) / 2,
        { color: on ? '#fff3d2' : Kit.C.ink });
      this.arows.push({ i, x, y: by, w, h });
    });
    const fy = y + ch.length * (h + gap) + 2;
    const hint = touch ? 'he is waiting on you' : 'he is waiting on you - 1, 2';
    drawText(ctx, ellipsize(hint, w), x + w, fy,
      { color: 'rgba(240,226,192,0.4)', align: 'right' });
  }

  /**
   * WHAT YOU CAN SAY.
   *
   * There used to be a grid of stone tablets here with morse cut under every
   * word, and you said one by tapping its code out on a key. It was the best
   * thing in the game to look at and the worst thing in it to use: you had to
   * already know which words did anything, and the ones that did anything
   * were a menu with a puzzle bolted to the front of it.
   *
   * So it is buttons. You press what you want to say, he says it back, and
   * the last one is always BYE - which is the only word left over from the
   * old system, because leaving is the one thing you should always be able
   * to do in one press.
   */
  _say(ctx, x, y, w, H) {
    const list = this.list();
    const touch = !!this.game.ui?.touchEnabled;
    const floor = H - Math.round(H * 0.055) - 6;
    const room = Math.max(40, floor - y - 14);
    // as many columns as it takes to get every word on the screen, and only
    // then start shaving the height off them
    const maxH = touch ? 22 : 18;
    let cols = w > 320 ? 3 : w > 190 ? 2 : 1;
    let h = maxH;
    for (;;) {
      const rows = Math.ceil(list.length / cols);
      h = Math.min(maxH, Math.floor(room / rows) - 3);
      if (h >= 15 || cols >= 4) break;
      cols++;
    }
    h = Math.max(13, Math.min(maxH, h));
    const gap = 3;
    const cw = Math.floor((w - (cols - 1) * gap) / cols);

    drawText(ctx, 'SAY', x, y - 10, { color: 'rgba(240,226,192,0.5)' });
    const rows = [];
    list.forEach((tp, i) => {
      const bx = x + (i % cols) * (cw + gap);
      const by = y + Math.floor(i / cols) * (h + gap);
      if (by + h > floor) return;
      const on = i === this.pick;
      const said = this.said.has(tp.id);
      const bye = tp.id === 'bye';
      // Brass when you are on it, wood when you are not - and leaving is
      // always rust and always the last thing on the list, so it is one
      // press from anywhere in the conversation.
      Kit.button(ctx, bx, by, cw, h, null, {
        hot: on && !bye, on: bye, tint: bye ? '#c2702e' : undefined,
      });
      // a tick in the corner of anything he has already told you about, so a
      // long list stops being a list you have to remember your way through
      if (said && !bye) {
        Kit.px(ctx, bx + cw - 6, by + 3, 3, 1, Kit.C.goldDim);
        Kit.px(ctx, bx + cw - 5, by + 4, 1, 1, Kit.C.goldDim);
      }
      drawText(ctx, ellipsize(tp.ask || tp.word, cw - 10), bx + cw / 2, by + (h - 7) / 2,
        { color: on ? '#fff3d2' : said ? Kit.C.inkSoft : Kit.C.ink, align: 'center' });
      rows.push({ i, x: bx, y: by, w: cw, h });
    });
    this.rows = rows;
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

}
