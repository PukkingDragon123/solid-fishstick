// CRABDEN - sitting down with her.
//
// Everything else she says, she says over her shoulder while you are both
// doing something else. This is the one place where you both stop.
//
// The rule of it: you have no voice, so you tap. Every word you can say has
// its code written underneath it, because the code IS the language and hiding
// it would be like hiding the words. Tap it out on the key and she hears it.
// Point at it instead if your hands are busy - it is the same sentence either
// way, and she does not treat you differently for pointing.
//
// She answers a card at a time, with her face on each one. Some of the
// answers are lessons, and those are the only place in the game where you are
// actually taught anything: not a tooltip, not a tutorial step, but a woman
// who has been out here eleven years telling you how to grow a plant.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { drawPlate, drawNodeIcon } from './icons.js';
import { portrait } from '../art/personart.js';
import { CODE, TOPICS, TOPIC_BY_WORD, morseFor } from '../systems/talk.js';

const INK = '#f2e4c2';
const DIM = 'rgba(240,226,192,0.66)';
const FAINT = 'rgba(240,226,192,0.34)';
const OUT = 'rgba(12,8,5,0.72)';
const TAP = '#8fe0cc';

/** How far she has to be for the conversation to be possible at all. */
export const TALK_RANGE = 64;

export class TalkScreen {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.fade = 0;
    this.pick = 0;
    this.rows = [];          // the topic boxes, for the mouse
    this.said = new Set();   // which topics you have been through

    // what she is in the middle of answering
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
    this.game.audio?.play('ui');
    // she turns to face you, because you are talking to her
    const g = this.game;
    g.npc.setFacing(Math.sign(g.crab.x - g.npc.x) || -1);
    g.npc.moveTo = undefined;
    g.npc.speech = null;
  }

  close() {
    if (!this.on) return;
    this.on = false;
    this.topic = null;
    this.game.audio?.play('ui', { pitch: 0.7 });
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
   * is one she knows, that is what you said.
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
    // the moment the letters spell something she knows, she answers - there is
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
    const hit = TOPIC_BY_WORD[word];
    if (hit && this.list().includes(hit)) {
      this.flash = 1;
      this.game.morse.learned = true;
      this.ask(hit, true);
    } else {
      // she does not pretend to understand - she tells you she did not
      this.topic = {
        id: '_miss', word,
        lines: [{ icon: 'close', t: `"${word}". I have no idea. Slower - long taps and short ones, and a gap between the letters.` }],
      };
      this.line = 0;
      this.type = 0;
      this.game.audio?.play('deny');
    }
  }

  /** Say a topic, however you said it. */
  ask(tp, tapped = false) {
    this.topic = tp;
    this.line = 0;
    this.type = 0;
    this.said.add(tp.id);
    this.game.audio?.play(tapped ? 'discover' : 'uiBig');
    if (tp.id === 'bye') { this._byeAfter = true; }
  }

  /** Next card, or back to the list when the answer has run out. */
  advance() {
    const tp = this.topic;
    if (!tp) return;
    // a part-typed line completes instead of advancing, so a fast reader is
    // never punished and a slow one is never rushed
    if (this.type < 1) { this.type = 1; return; }
    if (this.line < tp.lines.length - 1) {
      this.line++;
      this.type = 0;
      this.game.audio?.play('talk');
      return;
    }
    tp.then?.(this.game);
    this.topic = null;
    if (this._byeAfter) { this._byeAfter = false; this.close(); }
  }

  // -- the frame ------------------------------------------------------------

  update(dt) {
    const g = this.game;
    this.fade = damp(this.fade, this.on ? 1 : 0, 0.0004, dt);
    if (!this.on) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.type < 1) this.type = Math.min(1, this.type + dt * 2.4);

    // walk away and the conversation ends, because she is a person standing
    // in a place and not a menu
    if (!this.near || g.state !== 'play') { this.close(); return; }

    const i = g.input;
    this._tap(dt, i.key('t'));

    if (i.justPressed('Escape')) { i.consumeKey('Escape'); this.close(); return; }
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
    // clicking anywhere else while she is talking turns the card
    if (i.clicked && this.topic) { i.clicked = false; this.advance(); }
  }

  draw(ctx, W, H) {
    if (this.fade < 0.01) return;
    const g = this.game;
    const a = clamp01(this.fade);

    // ---- the world goes quiet behind her ---------------------------------
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
    // she stands at the side of the frame and what passes between you is next
    // to her; narrow, she is at the top of it looking down at you and the
    // talking happens underneath, which is also roughly what is happening.
    const narrow = W < 360;
    const K = narrow ? Math.min(4.4, Math.max(3, W / 46)) : Math.min(5.6, Math.max(4, H / 52));
    const spore = (g.mind?.blue || 0) > 0.35;
    let port = null;
    try { port = portrait(g.npc.kind, g.npc.face | 0, K, spore); } catch { port = null; }
    // far enough in that neither the brim of her hat nor her name runs off
    // the left edge of a short, wide frame
    const px = Math.round(narrow ? W * 0.5
      : Math.max(W * 0.085, (port ? port.ox : 0) + 4, textWidth('DR. ILSA VESS') / 2 + 4));
    // narrow: hung from the top of the frame, so the hat is never cropped
    const py = Math.round(narrow ? lb + 4 + (port ? port.oy : 24) : H * 0.30);
    if (port) {
      // a breath, so she is not a still image while she is talking
      const br = Math.sin(this.t * 1.4) * 0.6 + (this.type < 1 ? Math.sin(this.t * 16) * 0.5 : 0);
      ctx.drawImage(port.cv, Math.round(px - port.ox), Math.round(py - port.oy + br));
    }
    const nameY = Math.round(py + (port ? port.H * 0.62 : 30));
    drawText(ctx, 'DR. ILSA VESS', px, nameY,
      { color: DIM, align: 'center', outline: true, outlineColor: OUT });

    // ---- what she is saying, or what you could say -----------------------
    const cx = Math.round(W * (narrow ? 0.06 : 0.34));
    const cw = Math.round(W - cx - W * 0.06);
    const cy = narrow ? nameY + 26 : Math.round(H * 0.30);

    if (this.topic) {
      this.rows = [];
      this._card(ctx, cx, cy, cw, H);
    } else {
      // a phone on its side has almost no height, so the grid starts right
      // under the letterbox instead of a fifth of the way down
      const top = narrow ? cy : H < 210 ? lb + 14 : Math.round(H * 0.18);
      this._topics(ctx, cx, top, cw, H, narrow);
    }

    // ---- and the wire you are talking on ---------------------------------
    this._wire(ctx, W, H, lb);
    ctx.globalAlpha = 1;
  }

  /** One card of her answer, with its icon and the line typing itself in. */
  _card(ctx, x, y, w, H) {
    const tp = this.topic;
    const ln = tp.lines[this.line];
    const lines = wrapText(ln.t, w - 34);
    const h = Math.max(46, lines.length * LINE_H + 20);
    // what she says is on paper, because she is the one who writes things down
    drawPlate(ctx, x, y, w, h, { mat: 'paper', edge: 'rgba(120,96,58,0.5)', alpha: 0.98 });

    // the icon down the left of the card, on its own margin
    if (ln.icon) {
      ctx.globalAlpha = 0.92;
      drawNodeIcon(ctx, ln.icon, x + 15, y + h / 2, '#7a5a2a', 2);
      ctx.globalAlpha = 1;
      // a hairline between the icon's margin and what she is saying
      ctx.fillStyle = 'rgba(168,64,52,0.35)';
      ctx.fillRect(x + 25, y + 6, 1, h - 12);
    }
    const tx = x + 28;
    // the line arrives a character at a time - she is talking, not printing
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
   * Everything you could say, each with its code under it. The code is not a
   * hint - it is the control. Tap it and she hears it; point at it and she
   * hears the same thing.
   */
  _topics(ctx, x, y, w, H, narrow) {
    const list = this.list();
    // a word you say with a thumb is a thumb tall - unless the screen is a
    // phone on its side, where there is no such thing as a spare row
    const short = H < 210;
    const cellH = short ? 24 : this.game.ui?.touchEnabled ? 30 : 21;
    const floor = H - (short ? 22 : 40);
    const fits = Math.max(1, Math.floor((floor - y) / (cellH + 4)));
    // and if the words would fall off the bottom they go into more columns
    // rather than quietly not existing
    const maxCols = Math.max(1, Math.min(4, Math.floor(w / 84)));
    let cols = narrow ? 1 : w > 300 ? 3 : 2;
    while (cols < maxCols && Math.ceil(list.length / cols) > fits) cols++;
    const cellW = Math.floor((w - (cols - 1) * 6) / cols);
    const rows = [];
    list.forEach((tp, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = x + col * (cellW + 6);
      const by = y + row * (cellH + 4);
      if (by + cellH > floor) return;
      const on = i === this.pick;
      const done = this.said.has(tp.id);
      const lit = this.flash > 0 && this.word === '' && this.said.has(tp.id);
      rows.push({ i, x: bx, y: by, w: cellW, h: cellH });
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
      drawText(ctx, tp.word, bx + 6, by + (cellH - 19) / 2,
        { color: on ? '#f7ecd0' : done ? 'rgba(180,156,112,0.8)' : '#b49c70' });
      // its code, in the colour the tap channel uses everywhere else
      drawText(ctx, morseFor(tp.word), bx + 6, by + (cellH - 19) / 2 + 10,
        { color: on ? TAP : 'rgba(143,224,204,0.45)' });
    });
    this.rows = rows;

    // what she is waiting for you to say, under the whole grid
    const b = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2));
    ctx.globalAlpha = b;
    drawText(ctx, this.said.size ? '' : 'tap it, or point at it', x, y - 11, { color: FAINT });
    ctx.globalAlpha = 1;
  }

  /**
   * The wire: what is currently on it. Every mark you make shows up here the
   * instant you make it, so the code is never something happening off-screen.
   */
  _wire(ctx, W, H, lb) {
    const x = Math.round(W * 0.06);
    const y = H - lb - 16;
    const cur = this.marks ? ` ${this.marks}` : this.down ? ' _' : '';
    const on = (this.word + cur).trim();
    const w = Math.max(120, textWidth(on) + 24);
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
