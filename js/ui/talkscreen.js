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

const INK = '#f2e4c2';
const DIM = 'rgba(240,226,192,0.66)';
const FAINT = 'rgba(240,226,192,0.34)';
const OUT = 'rgba(12,8,5,0.72)';
const TAP = '#8fe0cc';

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
    // he turns to face you, because you are talking to his
    const g = this.game;
    g.npc.setFacing(Math.sign(g.crab.x - g.npc.x) || -1);
    g.npc.moveTo = undefined;
    g.npc.speech = null;
    // and the camera comes in on the pair of you. A conversation is a
    // two-shot; the wide shot is for walking.
    g.cam.follow = null;
    g.cam.free = true;
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
      this.type = 0;
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
    this.type = 0;
    this._wear();
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
      this._wear();
      this.game.audio?.play('talk');
      return;
    }
    tp.then?.(this.game);
    this.topic = null;
    if (this._byeAfter) { this._byeAfter = false; this.close(); }
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
    if (this.type < 1) this.type = Math.min(1, this.type + dt * 2.4);

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
      const limit = this._keyBox(W, H, lb).y - 6;
      while (K > 1 && lb + 4 + 21 * K + 64 * K * 0.62 + need > limit) K--;
    } else {
      K = Math.max(1, Math.min(4, Math.floor(Math.min(W * 0.30 / 59, H * 0.58 / 64))));
    }
    const spore = (g.mind?.blue || 0) > 0.35 ? 1 : 0;
    let port = null;
    try { port = facePortrait(g.npc.mood || 'flat', K, spore); } catch { port = null; }
    // far enough in that neither the brim of his hat nor his name runs off
    // the left edge of a short, wide frame
    const px = Math.round(narrow ? W * 0.5
      : Math.max(W * 0.085, (port ? port.ox : 0) + 4, textWidth('DR. ELIAS VESS') / 2 + 4));
    // narrow: hung from the top of the frame, so the hat is never cropped
    const py = Math.round(narrow ? lb + 4 + (port ? port.oy : 24) : H * 0.30);
    if (port) {
      // a breath, so he is not a still image while he is talking
      const br = Math.sin(this.t * 1.4) * 0.6 + (this.type < 1 ? Math.sin(this.t * 16) * 0.5 : 0);
      ctx.drawImage(port.cv, Math.round(px - port.ox), Math.round(py - port.oy + br));
    }
    const nameY = Math.round(py + (port ? port.H * 0.62 : 30));
    drawText(ctx, 'DR. ELIAS VESS', px, nameY,
      { color: DIM, align: 'center', outline: true, outlineColor: OUT });

    // ---- what he is saying, or what you could say -----------------------
    const cx = Math.round(W * (narrow ? 0.06 : 0.34));
    const cw = Math.round(W - cx - W * 0.06);
    const cy = narrow ? nameY + 16 : Math.round(H * 0.30);

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
    // what he says is on paper, because he is the one who writes things down
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
   * hint - it is the control. Tap it and he hears it; point at it and he
   * hears the same thing.
   */
  _topics(ctx, x, y, w, H, narrow) {
    const list = this.list();
    const short = H < 210;
    // the key owns the bottom of the screen, so the words stop above it
    const floor = this._keyBox(this.game.renderer.vw, H, Math.round(H * 0.055)).y - 6;
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
    drawText(ctx, this.said.size ? '' : 'tap it, or point at it', x, y - 11, { color: FAINT });
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

  _key(ctx, W, H, lb) {
    const b = this._keyBox(W, H, lb);
    const dash = this.down && this.held > 0.22;
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
