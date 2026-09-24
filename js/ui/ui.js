// CRABDEN - the interface, such as it is.
//
// There are no panels on the world screen. Water is a shell with water in it,
// nutrients are a flower that is either blooming or losing leaves, fruit is a
// sprig of fruit, and your genome is an orb on your own back that you can look
// into. Everything else lives in a drawer that slides out of the right edge
// when you want it and is not there when you do not.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic, mixHex } from '../lib/math.js';
import * as Save from '../core/save.js';
import { pxDisc, pxGlow, pxRing, pxSize } from '../render/pix.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { FLORA, FLORA_BY_ID, NEEDS_TEXT, NEEDS_ICON, isAnnual } from '../data/flora.js';
import { ITEM_BY_ID, STATIONS } from '../data/craft.js';
import { FAUNA, FAUNA_BY_ID, CLADES, OBSERVE_STEPS } from '../data/fauna.js';
import { BUILDINGS, BUILD_BY_ID, GENES, GENE_BY_ID, SKILL_BY_ID } from '../data/progress.js';
import { buildPlant } from '../art/floraart.js';
import { buildStructure } from '../art/buildart.js';
import { drawShell, drawBloom, drawSprig, drawOrb, drawTab, drawPanel, drawGlyph, drawValve, drawGauge, drawNodeIcon, drawPlate, drawModeArt, drawGland, drawTame, drawNozzle } from './icons.js';
import * as K from './kit.js';
import { TreeScreen } from './tree.js';
import { WORLD_NOTES, ERAS } from '../data/lore.js';
import { baseRank } from '../systems/economy.js';
import { FISH, FISH_BY_ID } from '../data/fish.js';
import { fishFrame } from '../art/fishart.js';
import { biomeAt } from '../world/biomes.js';

const INK = '#f2e4c2';
const DIM = 'rgba(240,226,192,0.66)';
const FAINT = 'rgba(240,226,192,0.36)';
const OUT = 'rgba(12,8,5,0.72)';
/** The faint tone inside a board. Kept as its own name because the notes
 * page has its own rhythm and wants to be tuned on its own. */
const PAPER_FAINT = 'rgba(240,226,192,0.36)';

/** How long the controls take to hand over when you change mode. */
const MODE_SWAP = 0.3;

// The popup is for things you read. Anything you *do* to your own shell now
// happens on the shell itself, in build mode.
const TABS = [
  { id: 'fleet', icon: 'fauna', name: 'FLEET', tint: '#9ad86a',
    sub: 'what lives on you, and where it has got to' },
  { id: 'craft', icon: 'build', name: 'BENCH', tint: '#e2b74a',
    sub: 'his pack, and what his hands can make out of it' },
  { id: 'codex', icon: 'codex', name: 'FIELD', tint: '#7fd0dd',
    sub: 'his notes - you have to be standing with him to read them' },
];

// and build mode has its own two, down the side
const BUILD_TABS = [
  { id: 'flora', icon: 'flora', name: 'SEED' },
  { id: 'build', icon: 'build', name: 'BUILD' },
];

/**
 * The five things you can be doing. Each one owns the bottom-right corner of
 * the screen while it is on: its own buttons, its own colour and its own
 * glyph, so what you are holding is never a word you have to remember.
 */
export const MODES = [
  { id: 'direct', name: 'CRAB', glyph: 'crab', tint: '#e2b74a',
    desc: 'Walk. Dig. Touch your own shell to plant.' },
  { id: 'hunt', name: 'HUNT', glyph: 'claw', tint: '#e2564f', need: 'hunt',
    desc: 'Swing. Guard. Roll.',
    got: 'Something came at you.' },
  { id: 'spore', name: 'SPORE', glyph: 'jet', tint: '#c98ade', need: 'spore',
    desc: 'Hold to charge. Release at pressure.',
    got: 'The gland under your shell has filled.' },
  { id: 'hive', name: 'HIVE', glyph: 'link', tint: '#6fd8ee', need: 'hive', skill: 'command',
    desc: 'Click one of yours and you are it.',
    got: 'There are enough of them on your nerve to hold at once.' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.tree = new TreeScreen(game);
    this.drawer = 0;             // 0 closed, 1 fully open
    this.drawerOpen = false;
    this.paused = false;
    this.tab = 'flora';
    this.scroll = 0;
    this.pick = null;            // the item shown in the detail pane
    this.build = 0;              // 0..1 how far into build mode
    this.buildOn = false;
    this.buildTab = 'flora';
    this.buildScroll = 0;
    this.savedZoom = null;
    this.driving = null;         // a creature you have taken the reins of
    this.drag = null;            // a seed being carried from the rail to a bed
    this.placing = null;         // { kind, id }
    this.ghostPlot = null;
    this.toast = null;
    this.toastT = 0;
    this.hover = null;
    this.buttons = [];
    this.stick = null;
    this.stickZone = null;
    this.mode = 'direct';
    this.modeT = 0;
    this.valveHeld = false;
    this.valveTapped = false;
    this.t = 0;
    this.bloomShown = 0;
    this.codexPick = null;
    this._installTouch();
  }

  say(text, secs = 3.6) { this.toast = text; this.toastT = secs; this.toastMax = secs; }

  // -- on-screen controls ---------------------------------------------------

  _installTouch() {
    const i = this.game.input;
    this.holdKeys = new Set();
    i.claimHandler = (p) => {
      if (!this.touchEnabled) return null;
      for (const b of this.buttons) {
        if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) {
          if (b.key) i.pulseVirtual(b.key);
          if (b.hold) i.setVirtual(b.hold, true);
          return { kind: 'btn', b };
        }
      }
      const s = this.stickZone;
      if (s && p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
        this.stick = { ox: p.x, oy: p.y, x: p.x, y: p.y };
        this._applyStick(i);
        return { kind: 'stick' };
      }
      return null;
    };
    i.moveHandler = (p) => {
      if (p.control && p.control.kind === 'stick' && this.stick) {
        this.stick.x = p.x; this.stick.y = p.y;
        this._applyStick(i);
      }
    };
    i.releaseHandler = (p) => {
      if (!p.control) return;
      if (p.control.kind === 'stick') { this.stick = null; i.setVirtual('a', false); i.setVirtual('d', false); }
      if (p.control.kind === 'btn' && p.control.b.hold) i.setVirtual(p.control.b.hold, false);
    };
  }

  _applyStick(i) {
    const dx = clamp((this.stick.x - this.stick.ox) / 26, -1, 1);
    i.setVirtual('a', dx < -0.22);
    i.setVirtual('d', dx > 0.22);
    i.virtualAxis = { x: dx, y: 0, len: Math.abs(dx) };
  }

  get touchEnabled() {
    const s = this.game.settings.touchControls;
    if (s === true) return true;
    if (s === false) return false;
    return this.game.input.isTouch || matchMedia('(pointer: coarse)').matches;
  }

  get busy() { return this.tree.diving || this.drawerOpen; }

  /** True while the camera is pulled in on the shell to plant things. */
  get building() { return this.buildOn; }

  /**
   * You start as an animal that can walk and dig, and nothing else.
   *
   * Five modes on the first screen was five things to learn before you had
   * done anything, and four of them did nothing until much later anyway - a
   * claw with nothing to fight, a nerve with nothing on it. So the column
   * grows: each mode arrives at the moment the world first hands you the
   * thing it is for, and it arrives with a card saying so.
   */
  modeUnlocked(id) {
    const m = MODES.find((x) => x.id === id);
    if (!m || !m.need) return true;
    return this.game.unlocked.has(m.need);
  }

  cycleMode() {
    const avail = MODES.filter((m) => this.modeUnlocked(m.id));
    const i = avail.findIndex((m) => m.id === this.mode);
    this.setMode(avail[(i + 1) % avail.length].id);
  }

  setMode(id) {
    if (this.mode === id) return;
    const m = MODES.find((x) => x.id === id);
    if (!m || !this.modeUnlocked(id)) return;
    // leaving a mode puts down whatever it had you holding
    this.game.combat?.stop();
    this.game.hive?.hold(false);
    if (id !== 'hive') this.game.hive && (this.game.hive.pick = null);
    this.mode = id;
    // A mode change swapped one set of controls for another between two
    // frames, which reads as a glitch rather than as putting something down
    // and picking something else up. So the bar goes out and comes back.
    this.modeT = MODE_SWAP;
    this.say(m.name, 1.6);
    this.game.audio?.play('ui');
  }

  // -- frame ----------------------------------------------------------------

  update(dt) {
    // the conversation owns the keyboard while it is up
    if (this.game.talk && this.game.talk.on) { this.t += dt; return; }
    this.t += dt;
    if (this.modeT > 0) this.modeT = Math.max(0, this.modeT - dt);
    const i = this.game.input;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
    this.drawer = damp(this.drawer, this.drawerOpen ? 1 : 0, 0.0009, dt);

    if (this.paused) {
      if (i.justPressed('Escape')) { i.consumeKey('Escape'); this.paused = false; }
      return;
    }

    const inTree = this.tree.update(dt, this.game.renderer.vw, this.game.renderer.vh);
    if (this.tree.diving) return;

    this.build = damp(this.build, this.buildOn ? 1 : 0, 0.0009, dt);
    // There is no button for this. You climb onto your own back by touching
    // your own back, and you climb off it by stepping off.
    if (i.justPressed('Tab')) { i.consumeKey('Tab'); this.toggleBuild(); }
    if (i.justPressed('Escape')) {
      i.consumeKey('Escape');
      this.back();
    }
    // Touching the animal. WHERE you touch it decides what happens, which is
    // the only version of this that makes sense once digging exists: the
    // shell is the garden and always has been, and the body underneath it is
    // the animal - so the shell opens your back and the legs start digging.
    if (!this.buildOn && !this.drawerOpen && !this.placing && !this.driving
      && this.game.state === 'play' && i.clicked && this._overCrab() && !this._overRipe()) {
      i.clicked = false;
      const g = this.game;
      const s = g.cam.worldToScreen(g.crab.x, g.crab.y - g.crab.m.rx * 0.35);
      if (i.sy > s.y && this.mode !== 'hunt') {
        // the low half: it digs, at once, and keeps digging while you hold
        this.digTap = 0.45;
        g.scoopSand(0.05);
      } else this.toggleBuild();
    }
    // a tap on the body keeps scooping for a moment, so one tap is a real
    // bite out of the sand rather than a single frame of one
    if (this.digTap > 0) {
      this.digTap -= dt;
      this.scoopTap = true;
    } else this.scoopTap = false;
    if (i.justPressed('g')) { i.consumeKey('g'); this._openTree(); }
    if (i.justPressed('m')) { i.consumeKey('m'); this.cycleMode(); }
    // B is the bench, because that is the one you reach for most once he is
    // yours, and it should not be a number you have to remember
    if (i.justPressed('b')) {
      i.consumeKey('b');
      if (this.drawerOpen && this.tab === 'craft') this.drawerOpen = false;
      else { this.drawerOpen = true; this.tab = 'craft'; this.scroll = 0; this.pick = null; }
    }
    const keys = ['1', '2', '3', '4'];
    keys.forEach((k, n) => {
      if (i.justPressed(k)) {
        i.consumeKey(k);
        if (!TABS[n]) return;
        if (this.drawerOpen && this.tab === TABS[n].id) this.drawerOpen = false;
        else { this.drawerOpen = true; this.tab = TABS[n].id; this.scroll = 0; this.pick = null; }
      }
    });
    if (this.drawerOpen && i.wheel) this.scroll = Math.max(0, this.scroll + i.wheel * 22);
    if (this.buildOn && !this.drawerOpen && i.wheel && i.sx < 120) {
      this.buildScroll = Math.max(0, this.buildScroll + i.wheel * 22);
      i.wheel = 0;
    }

    // placement follows the pointer over the shell
    // the ghost only makes sense when you are looking at your own back
    if (this.placing && !this.buildOn) this.placing = null;
    if (this.placing) this._updatePlacing();
    this._updateDrag(dt);
    // fleet mode: click a creature, then click the ground to send it
    if (!this.drawerOpen && !this.paused) {
      if (this.mode === 'hive') this._updateHive();
    }

    const b = this.game.economy.nutrients;
    this.bloomShown = damp(this.bloomShown, b, 0.05, dt);
  }

  /** Is the pointer over the animal? Generously, because it is a big animal. */
  _overCrab() {
    const g = this.game;
    const c = g.crab;
    const s = g.cam.worldToScreen(c.x, c.y);
    const hw = c.m.rx * 1.15 * g.cam.zoom;
    const hh = (c.m.rx * 1.1 + c.standH) * g.cam.zoom;
    return g.input.sx > s.x - hw && g.input.sx < s.x + hw
      && g.input.sy > s.y - hh && g.input.sy < s.y + hh * 0.6;
  }

  /** Over something ready to pick? Picking it beats climbing on top of it. */
  _overRipe() {
    const g = this.game;
    const i = g.input;
    for (const plot of g.garden.plots) {
      const pl = plot.plant;
      if (!pl || pl.stage < 3 || pl.ripe < 1) continue;
      const w = g.garden.plotWorld(plot);
      const s = g.cam.worldToScreen(w.x, w.y - 9);
      if (Math.hypot(i.sx - s.x, i.sy - s.y) < 12) return true;
    }
    return false;
  }

  /**
   * Build mode: the camera comes in on the shell and the seeds come out down
   * the side. Everything you can do to your own back happens here, on your
   * own back, rather than in a shop.
   */
  /** One step out of whatever you are in. The exit chip does this too. */
  back() {
    if (this.paused) { this.paused = false; return true; }
    if (this.placing) { this.placing = null; this.say('Cancelled.'); return true; }
    if (this.drawerOpen) { this.drawerOpen = false; return true; }
    if (this.buildOn) { this.toggleBuild(); return true; }
    if (this.driving) { this.release(); return true; }
    if (this.tree.diving) { this.tree.close(); return true; }
    this.paused = true;
    this.game.audio?.play('ui');
    return true;
  }

  /** Is there anything to back out of? Decides what the chip looks like. */
  get nested() {
    return !!(this.placing || this.drawerOpen || this.buildOn || this.driving || this.tree.diving);
  }

  toggleBuild(tab) {
    const g = this.game;
    if (!this.buildOn && g.state !== 'play') return;
    this.buildOn = !this.buildOn;
    if (this.buildOn && tab) { this.buildTab = tab; this.buildScroll = 0; this.pick = null; }
    this.drawerOpen = false;
    this.placing = null;
    if (this.buildOn) {
      this.savedZoom = g.cam.targetZoom;
      const want = clamp(g.renderer.vh * 0.42 / Math.max(18, g.crab.m.rx * 2.2), 2.2, 6);
      g.cam.targetZoom = clamp(want, g.cam.minZoom, g.cam.maxZoom);
      this.buildScroll = 0;
      // the world stops here: the camera is nailed to the shell and stays
      g.cam.cineCancel();
      g.cam.free = false;
      g.cam.freeT = 0;
      g.cam.followEntity(g.crab);
      this.say('On your own back.', 4);
      g.audio?.play('uiBig');
    } else {
      if (this.savedZoom) g.cam.targetZoom = this.savedZoom;
      this.savedZoom = null;
      g.audio?.play('ui');
    }
  }

  /** Take the reins of one of your own. */
  drive(c) {
    this.driving = c;
    this.drawerOpen = false;
    this.savedZoom = this.savedZoom ?? this.game.cam.targetZoom;
    this.game.cam.followEntity(c, false);
    this.game.cam.targetZoom = clamp(3.2, this.game.cam.minZoom, this.game.cam.maxZoom);
    this.say(`${c.name}. A/D to move it, Esc to let go.`, 5);
    this.game.audio?.play('uiBig');
  }

  release() {
    if (!this.driving) return;
    this.say(`${this.driving.name} is its own again.`, 3);
    this.driving.commanded = null;
    this.driving = null;
    this.game.cam.followEntity(this.game.crab, false);
    if (this.savedZoom) { this.game.cam.targetZoom = this.savedZoom; this.savedZoom = null; }
  }

  _openTree() {
    const g = this.game;
    const r = g.renderer;
    this.drawerOpen = false;
    this.placing = null;
    this.buildOn = false;
    // the dive starts from the animal itself, wherever it is on screen, so it
    // reads as going into the crab rather than into a button
    const s = g.cam.worldToScreen(g.crab.x, g.crab.y);
    this.tree.open(clamp(s.x, 0, r.vw), clamp(s.y, 0, r.vh), r.vw, r.vh);
  }

  /**
   * Carrying a seed from the rail to a bed. Dropping it on a legal bed plants
   * it; dropping it anywhere else puts it back, which is what a person expects
   * from picking something up and letting go of it.
   */
  _updateDrag(dt) {
    const d = this.drag;
    if (!d) return;
    const g = this.game;
    d.t += dt;
    if (!this.buildOn) { this.drag = null; return; }
    if (g.input.down) {
      // the bed under the pointer, if the thing will take there
      this.placing = { kind: d.kind, id: d.id };
      this._pickGhost();
      return;
    }
    // let go
    const plot = this.ghostPlot;
    const overRail = g.input.sx < this.railW(g.renderer.vw) + 6;
    this.drag = null;
    if (!plot || overRail || d.t < 0.05) { this.placing = null; this.ghostPlot = null; return; }
    const res = d.kind === 'flora' ? g.tryPlant(d.id, plot.i) : g.tryBuild(d.id, plot.i);
    this.say(res.msg || res);
    if (res.ok !== false) {
      const wp = g.garden.plotWorld(plot);
      g.fx.spark(wp.x, wp.y, d.kind === 'flora' ? '#8cc468' : '#e2b74a', 14, 34);
      g.fx.dust(wp.x, wp.y, 1.4);
      g.cam.shake(1.2);
      g.audio?.play('grow');
    } else g.audio?.play('deny');
    this.placing = null;
    this.ghostPlot = null;
  }

  /** Which bed the thing being carried would land in. */
  _pickGhost() {
    const g = this.game;
    const w = g.cam.screenToWorld(g.input.sx, g.input.sy);
    const wantWet = this.placing.kind === 'flora' && FLORA_BY_ID[this.placing.id]?.needsPond;
    let best = null, bd = 1e9;
    for (const p of g.garden.plots) {
      if (this.placing.kind === 'build' && (p.wet || p.plant || p.build)) continue;
      if (this.placing.kind === 'flora' && (p.plant || p.build || !!p.wet !== !!wantWet)) continue;
      const wp = g.garden.plotWorld(p);
      const dd = (wp.x - w.x) ** 2 + (wp.y - w.y) ** 2;
      if (dd < bd) { bd = dd; best = p; }
    }
    // you have to actually be over the animal, not merely nearest to a bed
    this.ghostPlot = bd < (60 * 60) ? best : null;
  }

  _updatePlacing() {
    if (this.drag) return;          // the drag drives the ghost itself
    const g = this.game;
    const w = g.cam.screenToWorld(g.input.sx, g.input.sy);
    const wantWet = this.placing.kind === 'flora' && FLORA_BY_ID[this.placing.id]?.needsPond;
    let best = null, bd = 1e9;
    for (const p of g.garden.plots) {
      if (!p.unlocked) continue;
      if (this.placing.kind === 'build' && (p.wet || p.plant || p.build)) continue;
      if (this.placing.kind === 'flora' && (p.plant || p.build || !!p.wet !== !!wantWet)) continue;
      const wp = g.garden.plotWorld(p);
      const d = (wp.x - w.x) ** 2 + (wp.y - w.y) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    this.ghostPlot = best;
    if (g.input.clicked) {
      g.input.clicked = false;
      if (!best) { this.say('Nowhere to put it.'); return; }
      const res = this.placing.kind === 'flora'
        ? g.tryPlant(this.placing.id, best.i)
        : g.tryBuild(this.placing.id, best.i);
      this.say(res.msg || res);
      if (res.ok !== false) {
        const wp = g.garden.plotWorld(best);
        g.fx.spark(wp.x, wp.y, this.placing.kind === 'flora' ? '#8cc468' : '#e2b74a', 14, 34);
        g.fx.dust(wp.x, wp.y, 1.4);
        g.cam.shake(1.4);
        g.audio?.play('grow');
        if (!g.input.key('Shift')) this.placing = null;
      }
    }
    if (g.input.rightClicked) { g.input.rightClicked = false; this.placing = null; }
  }

  /** HIVE: a click on one of yours takes it. A click on the ground sends it. */
  _updateHive() {
    const g = this.game;
    if (!g.input.clicked) return;
    const w = g.cam.screenToWorld(g.input.sx, g.input.sy);
    const list = g.hive.roster();
    let best = null, bd = 34;
    for (const q of list) {
      const d = Math.hypot(q.x - w.x, (q.y - 8) - w.y);
      if (d < bd) { bd = d; best = q; }
    }
    // Click one and you ARE it. Clicking the sand used to send it walking to
    // a pin instead, which is a second way of moving that is not the way you
    // move anything else in this game.
    if (best) { g.input.clicked = false; g.takeHive(best); }
  }

  // -- drawing --------------------------------------------------------------

  draw(ctx, r) {
    this.hover = null;
    this.buttons.length = 0;
    this.stickZone = null;
    const W = r.vw, H = r.vh;

    if (this.tree.diving || this.tree.dive > 0.01) {
      this.tree.draw(ctx, W, H);
      // the world's chrome goes as soon as the dive takes hold, so nothing is
      // floating over the top of you while you fall into yourself
      if (this.tree.dive > 0.14) { this._exitChip(ctx, W, H); return; }
    }

    this._hud(ctx, W, H);
    if (this.build > 0.005) this._buildRail(ctx, W, H);
    if (this.placing) this._placingHud(ctx, W, H);

    // A screen is a SCREEN. While one is open nothing from the world gets to
    // carry on drawing on top of it - not the band, not the note pinned to
    // the shell, not a toast. That was the whole of why the panels read as a
    // debug overlay: there was always something else on top of them.
    if (this.drawer > 0.005) {
      this._panel(ctx, W, H);
      this._exitChip(ctx, W, H);
      if (this.hover && !this.drag) this._tooltip(ctx, W, H);
      return;
    }
    if (this.touchEnabled) this._touchControls(ctx, W, H);

    // on touch the thumb band replaces the little tablet at the work: one
    // control, thumb-sized, in the one place a thumb already is
    if (this.game.work?.live && !this.touchEnabled) this._workBar(ctx, W, H);
    this._thumbBand(ctx, W, H);
    this._questNote(ctx, W, H);
    this._catchCard(ctx, W, H);
    this._chapterCard(ctx, W, H);
    if (this.toast) this._toast(ctx, W, H);
    if (this.game.taming?.live) this._songCard(ctx, W, H);
    if (this.drag) this._drawCarried(ctx, W, H);
    this._unlockCard(ctx, W, H);
    this._exitChip(ctx, W, H);
    if (this.paused) this._pauseCard(ctx, W, H);
    if (this.hover && !this.drag) this._tooltip(ctx, W, H);
  }

  // The bottom of a phone screen is the only real estate there is, and four
  // different things want it: the walking stick, the spring valve, a row of
  // action plates, and the band. They are all measured from here so that
  // nothing computes its own position any more - which is what let the valve
  // end up sitting on the band and the MODE plate end up stranded in the
  // middle of the desert.
  //
  // There are two arrangements, because a phone on its side is a different
  // shape of problem. Upright there is height to spare, so they stack: stick
  // row, button row, band. On its side there is almost no height at all, so
  // they spread out along the bottom instead - stick in one corner, valve in
  // the other, buttons in a column beside it, and the band in the gap in the
  // middle, which is exactly where neither thumb is.
  /** True when the screen is too short to stack anything. */
  compact(H) { return H < 210; }
  stickR(W, H) { return clamp(Math.round(Math.min(W, H) * 0.17), 22, 34); }
  /** How much of the bottom the walking stick wants, so nothing lands on it. */
  stickSpan(W, H) { return this.buildOn ? 0 : this.stickR(W, H) * 2 + 24; }
  buttonSize(W, H) {
    return this.compact(H) ? { w: 74, h: 26 } : { w: 88, h: W < 300 ? 34 : 36 };
  }
  /** The top of the row of action plates, when they are in a row. */
  buttonRowY(W, H) {
    if (!this.touchEnabled || this.buildOn) return H;
    return H - this.stickSpan(W, H) - this.buttonSize(W, H).h - 6;
  }
  /** Where the spring valve sits - on the stick's line, at the other end. */
  valveBox(W, H) {
    const size = 34;
    if (!this.touchEnabled) return { x: W - size - 8, y: H - size - 26, size };
    if (this.compact(H)) return { x: W - size - 8, y: H - size - 16, size };
    const R = this.stickR(W, H);
    return { x: W - size - 8, y: H - this.stickSpan(W, H) + 10 + R - size / 2, size };
  }
  /** The ceiling everything else has to stay above. */
  furnitureTop(W, H) {
    if (!this.touchEnabled || this.buildOn) return H;
    if (this.compact(H)) {
      const b = this.buttonSize(W, H);
      return H - 6 - b.h * 2 - 4;   // a column two deep is what usually shows
    }
    return this._bandBox(W, H)?.y ?? this.buttonRowY(W, H);
  }

  /** Whatever is asking for a stroke right now, in the order it would matter. */
  _bandSpec() {
    const g = this.game;
    let band = null;
    if (g.work?.live) {
      const j = g.work.job;
      band = { kind: 'work', label: j.label.toUpperCase(), tint: j.def.tint,
        needle: j.needle, centre: j.centre, width: j.band,
        hit: () => g.work.strike(), hold: true };
    } else if (this.mode === 'hunt' && g.combat?.live) {
      const c = g.combat;
      band = { kind: 'hunt', label: 'STRIKE', tint: '#e2564f',
        needle: c.pos ?? 0, centre: c.band ?? 0.5, width: c.width ?? 0.26,
        hit: () => g.strike() };
    }
    // The spring does not get a band. It used to throw a slider across the
    // middle of a phone every time you pumped - a second copy of the gauge
    // that is already on the dial under your thumb.
    return band;
  }

  /** Where the band sits, or null when nothing is asking. Wanted by the
   * button row too, which has to keep out of it. */
  _bandBox(W, H) {
    if (!this.touchEnabled || !this._bandSpec()) return null;
    if (this.compact(H) && !this.buildOn) {
      // sideways: it goes in the gap between the two thumbs
      const span = this.stickSpan(W, H);
      const x = this.stickR(W, H) * 2 + 36;
      const right = W - 8 - this.buttonSize(W, H).w - 12 - 34;
      return { x, y: H - span - 2, w: Math.max(110, right - x), h: span - 8 };
    }
    // upright: it sits above the button row rather than over it, so you can
    // still walk away from a job you have changed your mind about.
    //
    // It used to be a slab fourteen percent of the screen tall running the
    // whole width, which on a phone was a third of the desert gone. A thumb
    // needs a target it can hit, not the whole bottom of the window: this is
    // as small as one comfortably is, and centred, so the world is still
    // visible on both sides of it.
    const h = clamp(Math.round(H * 0.095), 38, 52);
    const w = Math.min(W - 12, 260);
    const floor = this.buildOn ? H - 8 : this.buttonRowY(W, H) - 6;
    return { x: Math.round((W - w) / 2), y: Math.max(24, floor - h), w, h };
  }

  /**
   * What he asked you to do, on a scrap out of his notebook, pinned to the
   * left edge under the shell. It is one line - the job, not a checklist -
   * because he gives you one thing at a time and the thing itself is the
   * objective. When it is done the scrap goes green for a few seconds and
   * then it is gone, the way a note you can throw away should be.
   */
  _questNote(ctx, W, H) {
    const q = this.game.quests;
    if (!q) return;
    const done = q.doneT > 0 ? q.justDone : null;
    const job = done || q.active;
    // Nothing on, and there IS something on: say so, and say where he is.
    // A job you never heard about is a job that does not exist.
    if (!job) { this._questCall(ctx, W, H); return; }

    const took = !done && q.tookT > 0;
    const prog = done ? null : q.progress;
    // ONE LINE, a bar, and the two numbers that say how far through it you
    // are - because "a bar that is a third full" and "one of three" are not
    // the same fact, and the second one is the one you can act on.
    const label = done ? `${job.name}  ${job.gain}` : job.name;
    const count = prog && prog.need > 1 ? `${prog.have}/${prog.need}` : '';
    const w = Math.min(W - 16, Math.max(104, textWidth(label) + 26 + textWidth(count)));
    const h = prog ? 23 : 15;
    const x = 6, y = this.build > 0.005 ? 6 : 56;
    // landing and finishing both get a beat where the card is bigger and lit
    const beat = done ? clamp01(q.doneT / 4) : took ? clamp01(q.tookT / 6) : 0;
    const pop = 1 + easeOutCubic(clamp01(beat * 1.6)) * 0.08;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.translate(-x, -y);
    const tint = done ? K.C.good : took ? K.C.warn : '#c8a05a';
    K.plaque(ctx, x, y, w, h, { tint });
    drawNodeIcon(ctx, done ? 'sun' : 'hand', x + 9, y + 7, tint, 1);
    drawText(ctx, ellipsize(label, w - 24 - textWidth(count)), x + 17, y + 4,
      { color: done ? '#d6f0b8' : '#f0e2c0' });
    if (count) {
      drawText(ctx, count, x + w - 5, y + 4,
        { color: 'rgba(240,226,192,0.66)', align: 'right' });
    }
    if (prog) {
      K.gauge(ctx, x + 4, y + h - 8, w - 8, 5,
        clamp01(prog.have / prog.need), done ? K.C.good : K.C.warn);
    }
    ctx.restore();

    // And for as long as it is new, WHAT TO PRESS. A job you have agreed to
    // and cannot start is worse than no job, and the one sentence that fixes
    // that belongs on the screen for six seconds and then never again.
    if (took && job.how && !q.chapterCard) {
      const a = clamp01(q.tookT / 1.2);
      const hw = Math.min(W - 16, 210);
      const hl = wrapText(job.how, hw - 12);
      const hh = hl.length * LINE_H + 8;
      ctx.globalAlpha = a;
      K.slab(ctx, x, y + h + 3, hw, hh, {});
      hl.forEach((l, i) => drawText(ctx, l, x + 6, y + h + 7 + i * LINE_H,
        { color: K.C.ink }));
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * A chapter starting. The story has five of them, and each one gets its
   * title across the middle of the screen once, the way a book does - the
   * number small, the name large, one line under it saying what it is about.
   */
  _chapterCard(ctx, W, H) {
    const c = this.game.quests?.chapterCard;
    if (!c) return;
    const a = Math.min(clamp01((c.max - c.t) / 0.6), clamp01(c.t / 0.9));
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
    const sc = W > 420 ? 2 : 1;
    const y = Math.round(H * 0.26 - (1 - a) * 8);
    const subL = wrapText(c.sub, W - 24);
    ctx.save();
    ctx.globalAlpha = a * 0.55;
    ctx.fillStyle = '#0b0806';
    ctx.fillRect(0, y - 16, W, 32 + 9 * sc + subL.length * LINE_H);
    ctx.globalAlpha = a;
    drawText(ctx, `CHAPTER ${ROMAN[c.n] || c.n}`, W / 2, y - 10, { color: K.C.gold, align: 'center' });
    drawText(ctx, c.title, W / 2, y + 1, { color: '#fff3d2', align: 'center', scale: sc, outline: true, outlineColor: OUT });
    const lw = Math.min(W - 40, textWidth(c.title, sc) + 30);
    K.rule(ctx, Math.round(W / 2 - lw / 2), y + 3 + 8 * sc, Math.round(lw));
    subL.forEach((l, i) => drawText(ctx, l, W / 2, y + 7 + 8 * sc + i * LINE_H, { color: K.C.ink, align: 'center' }));
    ctx.restore();
  }

  /**
   * THE CATCH.
   *
   * A fish you caught is held up for a moment, the way anybody holds up a
   * fish: big, in its own colours, swimming in the air, with its name, what
   * it is properly called, and how long it is - because the length is the
   * whole point of telling anyone.
   */
  _catchCard(ctx, W, H) {
    const c = this.game.fishing?.card;
    if (!c) return;
    const def = FISH_BY_ID[c.id];
    if (!def) return;
    const aIn = clamp01((c.max - c.t) / 0.28), aOut = clamp01(c.t / 0.5);
    const a = Math.min(aIn, aOut);
    // held up big: every fish gets about the same room, the pupfish included
    const S = clamp(Math.round(96 / def.L), 2, 7);
    const art = fishFrame(def.id, Math.floor(this.t * 7) % 4, S);
    const w = Math.min(W - 20, Math.max(200, art.w + 30));
    const fit = Math.min(1, (w - 24) / art.w);
    const ah = Math.round(art.h * fit);
    const h = ah + 58;
    const x = Math.round((W - w) / 2), y = Math.round(34 - (1 - easeOutCubic(aIn)) * 24);
    ctx.save();
    ctx.globalAlpha = a;
    K.slab(ctx, x, y, w, h, {});
    K.slot(ctx, x + 6, y + 6, w - 12, ah + 12, { back: '#15394a' });
    // a little water behind it, lit from above
    for (let k = 0; k < ah + 8; k += 2) {
      K.px(ctx, x + 9, y + 9 + k, w - 18, 1, `rgba(120,210,230,${0.10 * (1 - k / (ah + 8))})`);
    }
    const bob = Math.round(Math.sin(this.t * 3) * 1.5);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art.cv, Math.round(x + w / 2 - (art.w * fit) / 2), y + 12 + bob, Math.round(art.w * fit), ah);
    const ty = y + ah + 22;
    drawText(ctx, def.name.toUpperCase(), x + 10, ty, { color: K.C.gold });
    drawText(ctx, def.latin, x + 10, ty + 11, { color: K.C.inkSoft });
    drawText(ctx, `${c.cm} cm`, x + w - 10, ty, { color: K.C.ink, align: 'right' });
    const tag = c.first ? 'NEW' : c.best ? 'BEST' : null;
    if (tag) {
      const tw = textWidth(tag) + 10;
      K.plaque(ctx, x + w - 10 - tw, ty + 9, tw, 13, { tint: c.first ? '#8cc468' : '#e2b74a' });
      drawText(ctx, tag, x + w - 10 - tw / 2, ty + 12, { color: '#fff3d2', align: 'center' });
    }
    ctx.restore();
  }

  /**
   * No job, and he has one.
   *
   * The card does not go blank when you finish something - it turns into the
   * thing that sends you back to him, with an arrow that says which way he
   * is. Quests in this game only exist because a man says them out loud, so
   * the interface's job when you have none is to point at the man.
   */
  _questCall(ctx, W, H) {
    const g = this.game;
    const q = g.quests;
    if (!q.next() || g.state !== 'play' || g.npc?.hidden) return;
    const d = Math.abs(g.npc.x - g.crab.x);
    // Two words and an arrow. It used to be a whole sentence, and a sentence
    // that is always on the screen stops being read on the second day.
    const near = d < 90;
    const x = 6, y = this.build > 0.005 ? 6 : 56;
    const label = 'WORK';
    // laid out left to right so nothing can land on anything else:
    // [icon] WORK  12m >
    const dist = near ? '' : `${Math.max(1, Math.round(d / 10))}m`;
    const lw = textWidth(label), dw = dist ? textWidth(dist) : 0;
    const w = 17 + lw + (near ? 6 : 6 + dw + 4 + 6 + 4);
    const h = 15;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    ctx.save();
    K.plaque(ctx, x, y, w, h, { tint: mixHex('#8a6a28', K.C.warn, pulse) });
    drawNodeIcon(ctx, 'call', x + 9, y + h / 2, K.C.warn, 1);
    drawText(ctx, label, x + 17, y + (h - 7) / 2, { color: '#f0e2c0' });
    // which way, and how far
    if (!near) {
      const east = g.npc.x > g.crab.x;
      const dx = x + 17 + lw + 6;
      drawText(ctx, dist, dx, y + (h - 7) / 2, { color: 'rgba(240,226,192,0.75)' });
      ctx.fillStyle = K.C.warn;
      const ax0 = dx + dw + 4 + (east ? 0 : 3);
      for (let k = 0; k < 4; k++) {
        const ax = Math.round(ax0 + (east ? k : -k));
        ctx.fillRect(ax, Math.round(y + h / 2 - k), 1, 1 + k * 2);
      }
    }
    ctx.restore();
  }

  /**
   * A mode arriving.
   *
   * The column in the corner grows over the run, and something appearing in
   * a corner is something nobody notices. So the moment it lands the world
   * dims, its own glyph comes up at four times size in its own colour, and
   * the card says what happened and what the thing is for. It holds for four
   * seconds and then folds away - long enough to read, short enough that it
   * is not a dialog you have to dismiss.
   */
  _unlockCard(ctx, W, H) {
    const u = this.game.unlockCard;
    if (!u) return;
    const m = u.m;
    // in, hold, out
    const k = u.t < 0.34 ? easeOutCubic(u.t / 0.34)
      : u.t > 3.5 ? 1 - easeOutCubic(clamp01((u.t - 3.5) / 0.5)) : 1;
    if (k <= 0.01) return;
    // What it is, in one line. It used to be two paragraphs - the thing that
    // happened AND a description of the mode AND a line about where to find
    // it - which is a wall of text over a game you were in the middle of.
    const cw = Math.min(250, W - 36);
    const lines = wrapText(m.desc, cw - 62);
    const ch = Math.max(66, 13 + 10 + Math.max(lines.length * LINE_H, 40) + 6);
    const cx = Math.round((W - cw) / 2);
    const cy = Math.round(H * 0.3 - ch / 2 + (1 - k) * 14);

    ctx.globalAlpha = k * 0.62;
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;
    const page = K.windowFrame(ctx, cx, cy, cw, ch, { title: `NEW: ${m.name}` });
    // the glyph at size, in a slot, in its own colour
    K.slot(ctx, page.x + 2, page.y + 2, 40, 40, { back: mixHex(m.tint, '#181009', 0.76) });
    drawModeArt(ctx, m.glyph, page.x + 22, page.y + 22,
      m.tint, mixHex(m.tint, '#120c08', 0.55), 2);
    const tx = page.x + 48;
    let ty = page.y + Math.round((40 - lines.length * LINE_H) / 2) + 2;
    for (const ln of lines) { drawText(ctx, ln, tx, ty, { color: K.C.ink }); ty += LINE_H; }
    ctx.globalAlpha = 1;
  }

  /**
   * THE BAND.
   *
   * Four different things in this game are the same thing: a needle sweeping
   * across a bar with a band on it that you have to hit. The spring, the
   * claw, the spore and every job. On a keyboard they are four keys. On a
   * phone they were four small buttons in four different corners, which is
   * four ways to lose.
   *
   * So on touch there is one control, and it is enormous: a band across the
   * bottom third of the screen that you hit with the thumb you are already
   * holding the phone with. It says what it is doing, it shows the same
   * needle and the same band as the tablet does, and whatever is live takes
   * it. Nothing else needs to be aimed at.
   */
  _thumbBand(ctx, W, H) {
    const band = this.touchEnabled ? this._bandSpec() : null;
    if (!band) { this.thumbRect = null; return; }
    const g = this.game;
    const box = this._bandBox(W, H);
    const { x, y, w, h } = box;
    const hot = this._hit(x, y, w, h);
    this.buttons.push({ x, y, w, h, key: band.kind === 'work' ? 'e' : ' ' });

    drawPlate(ctx, x, y, w, h, { mat: 'stone', edge: 'none' });
    drawText(ctx, band.label, x + w / 2, y + 5,
      { color: '#e6dcc0', align: 'center', scale: 2 });

    // the bar, thumb-sized
    const bx = x + 10, bw = w - 20, bh = Math.max(14, Math.round(h * 0.30));
    const by = y + h - bh - 8;
    ctx.fillStyle = 'rgba(14,11,7,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    const half = band.width / 2;
    const b0 = Math.round(bx + clamp01(band.centre - half) * bw);
    const b1 = Math.round(bx + clamp01(band.centre + half) * bw);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = band.tint;
    ctx.fillRect(b0, by, b1 - b0, bh);
    const c0 = Math.round(bx + clamp01(band.centre - half * 0.32) * bw);
    const c1 = Math.round(bx + clamp01(band.centre + half * 0.32) * bw);
    ctx.globalAlpha = 0.7;
    ctx.fillRect(c0, by, Math.max(2, c1 - c0), bh);
    ctx.globalAlpha = 1;
    const nx = Math.round(bx + clamp01(band.needle) * bw);
    ctx.fillStyle = '#f7ecd0';
    ctx.fillRect(nx - 1, by - 3, 3, bh + 6);

    // and the whole plate lights when your thumb is on it
    if (hot && g.input.down) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = band.tint;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
    if (band.hold) this.actHeld = hot && g.input.down;
    if (hot && g.input.clicked) {
      g.input.clicked = false;
      band.hit();
    }
    this.thumbRect = { x, y, w, h };
  }

  /**
   * The job you are in the middle of. It is drawn at the work, not in a
   * corner, because the thing you are looking at while you dig is the hole.
   *
   * A stone tablet with a sunk bar in it: a band where the stroke lands, a
   * brighter core inside that, and a needle sweeping. Under it, how much of
   * the job is done and how well it is going - and the "how well" is the
   * number that matters, because a fossil dug badly comes out in pieces.
   */
  _workBar(ctx, W, H) {
    const wk = this.game.work;
    const j = wk && wk.job;
    if (!j) return;
    const cam = this.game.cam;
    const s = cam.worldToScreen(j.x, j.y);
    // wide enough for the whole name and the quality pips beside it
    const title = j.label.toUpperCase();
    const w = Math.min(W - 12, Math.max(104, textWidth(title) + 18 + 24)), h = 30;
    const sh = j.shake > 0 ? Math.round(Math.sin(this.t * 46) * j.shake * 2) : 0;
    const x = Math.round(clamp(s.x - w / 2, 6, W - w - 6)) + sh;
    const y = Math.round(clamp(s.y - 56 * cam.zoom, 20, H - h - 40));

    drawPlate(ctx, x, y, w, h, { mat: 'stone', edge: 'none' });
    // what is being done, and what it is being done to
    drawNodeIcon(ctx, j.def.icon, x + 9, y + 8, j.def.tint, 1);
    drawText(ctx, ellipsize(title, w - 42), x + 18, y + 4,
      { color: '#e6dcc0' });

    // the sunk bar
    const bx = x + 5, by = y + 15, bw = w - 10, bh = 7;
    ctx.fillStyle = 'rgba(14,11,7,0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(150,138,112,0.25)';
    ctx.fillRect(bx, by + bh, bw, 1);
    // the band, and the core of it
    const half = j.band / 2;
    const b0 = Math.round(bx + clamp01(j.centre - half) * bw);
    const b1 = Math.round(bx + clamp01(j.centre + half) * bw);
    ctx.fillStyle = j.def.tint;
    ctx.globalAlpha = 0.30;
    ctx.fillRect(b0, by, b1 - b0, bh);
    const c0 = Math.round(bx + clamp01(j.centre - half * 0.32) * bw);
    const c1 = Math.round(bx + clamp01(j.centre + half * 0.32) * bw);
    ctx.globalAlpha = 0.62;
    ctx.fillRect(c0, by, Math.max(1, c1 - c0), bh);
    ctx.globalAlpha = 1;
    // the needle
    const nx = Math.round(bx + clamp01(j.needle) * bw);
    ctx.fillStyle = j.flash > 0.05 ? '#fff2cf' : j.flash < -0.05 ? '#e2564f' : '#f2e4c2';
    ctx.fillRect(nx, by - 2, 1, bh + 4);
    ctx.fillRect(nx - 1, by - 3, 3, 1);

    // how far through, as a line filling along the bottom of the tablet
    ctx.fillStyle = 'rgba(14,11,7,0.8)';
    ctx.fillRect(x + 5, y + h - 5, w - 10, 2);
    ctx.fillStyle = j.def.tint;
    ctx.fillRect(x + 5, y + h - 5, Math.round((w - 10) * clamp01(j.done)), 2);
    // and how well, as pips lost off the right
    const pips = 5;
    for (let i = 0; i < pips; i++) {
      const lost = j.quality < (pips - i) / pips;
      ctx.fillStyle = lost ? 'rgba(226,86,79,0.7)' : '#e6dcc0';
      ctx.fillRect(x + w - 8 - i * 3, y + 5, 2, 2);
    }
    // if it has been put down, say so rather than leaving it looking broken
    if (!j.held) {
      const b = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 3));
      ctx.globalAlpha = b;
      drawText(ctx, 'HOLD E', x + w / 2, y + h + 3,
        { color: FAINT, align: 'center', outline: true, outlineColor: OUT });
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The mode bar. Five of them down the left-hand edge - a glyph each, lit in
   * its own colour when it is the one you are in - and then, beside it,
   * whatever that mode actually gives you to press. Nothing here is a word you
   * have to remember: the walking crab is roam, the claw is hunt, the jet is
   * spore, the link is the hive.
   */
  _modeBar(ctx, W, H) {
    const g = this.game;
    const avail = MODES.filter((m) => this.modeUnlocked(m.id));
    // On a phone this column is something you press with a thumb, so the
    // tiles grow and the whole rail climbs to sit clear of the band and the
    // stick instead of under them.
    const touch = this.touchEnabled && !this.buildOn;
    const bottom = touch ? this.furnitureTop(W, H) - 8 : H - 11;
    // On a phone these are things you press with a thumb, so they grow - but
    // only as far as the room above the rest of the furniture allows, which
    // on a phone lying on its side is not very far.
    const gap = touch ? 4 : 2;
    const room = bottom - 4;
    const n = avail.length;
    const S = touch
      ? clamp(Math.floor((room - (n - 1) * gap) / n), 14, 22)
      : 17;
    const bx = 3;
    const by = bottom - S - (n - 1) * (S + gap);
    avail.forEach((m, i) => {
      const y = by + i * (S + gap);
      const on = this.mode === m.id;
      const hot = this._hit(bx, y, S, S);
      // the one you are in is HELD DOWN, in its own colour. Everything else
      // is a button sitting up waiting to be pressed.
      K.button(ctx, bx, y, S, S, null, {
        on, hot, sticky: true, down: hot && g.input.down && !on, tint: m.tint,
      });
      const o = on ? 1 : 0;
      drawModeArt(ctx, m.glyph, bx + S / 2 + o, y + S / 2 + o,
        on ? m.tint : hot ? '#e0c79a' : 'rgba(190,166,120,0.72)',
        'rgba(10,7,4,0.8)');
      if (hot) {
        this.hover = { title: m.name, body: `${m.desc}   (M cycles)` };
        if (g.input.clicked) { g.input.clicked = false; this.setMode(m.id); }
      }
    });

    // and the mode's own controls, to the right of the column - fading up
    // out of nothing for a third of a second, so what you are holding is
    // handed over rather than swapped between two frames
    const swap = this.modeT > 0 ? easeOutCubic(1 - this.modeT / MODE_SWAP) : 1;
    const ax = bx + S + 7, ay = bottom - S;
    ctx.save();
    ctx.globalAlpha *= swap;
    ctx.translate(0, (1 - swap) * 5);
    if (this.mode === 'hunt') this._huntBar(ctx, ax, ay, W, H);
    else if (this.mode === 'spore') this._sporeBar(ctx, ax, ay, W, H);
    else if (this.mode === 'hive') this._hiveBar(ctx, ax, ay, W, H);
    ctx.restore();
  }

  /**
   * The song. It sings a phrase at you as a row of blocks climbing and
   * falling, and then you give it back on the number keys - and the row fills
   * in under it as you do, green for right and red for wrong. Neither of you
   * has words, so nothing here is a word.
   */
  _songCard(ctx, W, H) {
    const t = this.game.taming;
    const c = t.target;
    if (!c) return;
    const notes = t.lureFor(c.def).notes;
    const cw = Math.min(190, W - 24);
    const ch = 62;
    const x = Math.round(W / 2 - cw / 2);
    const y = Math.round(H * 0.62);
    drawPlate(ctx, x, y, cw, ch);

    drawText(ctx, c.def.name, x + 6, y + 4, { color: '#ffe9a8' });
    drawText(ctx, `${t.round + 1}/4`, x + cw - 6, y + 4, { color: FAINT, align: 'right' });

    // the phrase, as a staircase: each block's height is its pitch
    const gx = x + 8, gy = y + 16, gw = cw - 16, gh = 20;
    const n = Math.max(1, t.call.length);
    const bw = Math.floor(gw / n) - 2;
    for (let i = 0; i < t.call.length; i++) {
      const p = t.call[i];
      const bh = Math.round((p + 1) / notes * gh);
      const bx = gx + i * (bw + 2);
      const sounding = t.phase === 'listen' && t.idx === i;
      // what it sang
      ctx.fillStyle = sounding ? '#fff4d0' : 'rgba(226,183,74,0.55)';
      ctx.fillRect(bx, gy + gh - bh, bw, bh);
      // what you sang back
      if (i < t.said.length) {
        const right = t.said[i] === p;
        ctx.fillStyle = right ? 'rgba(140,220,130,0.9)' : 'rgba(226,86,79,0.9)';
        ctx.fillRect(bx, gy + gh + 3, bw, 3);
      } else if (t.phase === 'answer' && i === t.said.length) {
        // the note it is waiting on, blinking
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 6));
        ctx.fillStyle = '#9fe8d4';
        ctx.fillRect(bx, gy + gh + 3, bw, 3);
        ctx.globalAlpha = 1;
      }
    }

    // the pitches you have, as numbered keys
    const ky = y + ch - 14;
    for (let p = 0; p < notes; p++) {
      const kx = x + 8 + p * 17;
      const hot = this._hit(kx, ky, 15, 11);
      const live = t.phase === 'answer';
      drawPlate(ctx, kx, ky, 15, 11, {
        edge: live ? 'rgba(160,130,78,0.6)' : 'rgba(80,66,44,0.35)',
        top: hot && live ? 'rgba(66,52,30,0.95)' : undefined,
        rivets: false,
      });
      ctx.globalAlpha = live ? 1 : 0.45;
      // a block whose height is the pitch, so the key looks like the note
      const bh2 = Math.round((p + 1) / notes * 7);
      ctx.fillStyle = '#e2b74a';
      ctx.fillRect(kx + 3, ky + 9 - bh2, 3, bh2);
      drawText(ctx, `${p + 1}`, kx + 10, ky + 2, { color: DIM });
      ctx.globalAlpha = 1;
      if (hot && live && this.game.input.clicked) {
        this.game.input.clicked = false;
        t.answer(p);
      }
    }
    const say = t.phase === 'listen' ? 'listen' : t.phase === 'answer' ? 'sing it back' : '...';
    drawText(ctx, say, x + cw - 6, ky + 2, { color: FAINT, align: 'right' });
  }

  /** A button that says what it is with a picture and a key. */
  /**
   * An action button.
   *
   * The one control the player touches most, so it is a real button: mint
   * face, lit along the top, and it goes DOWN under the pointer. The picture
   * of what it does sits on the left, the word next to it, and the key that
   * also does it in the corner - so a keyboard player learns the key from
   * the button rather than from a legend somewhere else.
   */
  _actBtn(ctx, x, y, w, h, glyph, label, key, opts = {}) {
    const hot = this._hit(x, y, w, h);
    const on = !!opts.on;
    const dim = !!opts.dim;
    const down = (hot && this.game.input.down) || !!opts.held;
    K.button(ctx, x, y, w, h, null, {
      hot: hot && !dim, on, sticky: on, down: down && !dim,
      disabled: dim, tint: opts.tint,
    });
    const o = (down && !dim) || (on) ? 1 : 0;
    drawGlyph(ctx, glyph, x + 9 + o, y + h / 2 + o,
      { color: dim ? 'rgba(40,34,26,0.4)' : K.C.ink, scale: 1 });
    drawText(ctx, label, x + 17 + o, y + (h - 7) / 2 + o,
      { color: dim ? '#5b6156' : K.C.ink });
    if (key) drawText(ctx, key, x + w - 4 + o, y + (h - 7) / 2 + o,
      { color: dim ? '#5b6156' : 'rgba(36,28,21,0.5)', align: 'right' });
    if (hot && !dim) this.hover = opts.hover || null;
    return hot && this.game.input.clicked;
  }

  /**
   * Hunt: the strike gauge, the claw, and a row of whatever abilities your
   * genome has actually grown.
   */
  _huntBar(ctx, x, y, W, H) {
    const g = this.game;
    const cb = g.combat;
    const foe = cb.target || g.nearestHostile?.(g.crab.x, 150);
    const w = 92;

    // THE ONLY NUMBER IN THE FIGHT. Not a sweeping needle - what is about to
    // happen to you. The wind-up of whatever is in front of you, filling, and
    // the three things you can do about it.
    if (cb.live) {
      const gy = y - 16;
      drawPlate(ctx, x, gy, w, 13);
      const iw = w - 6, ix = x + 3, iy = gy + 3;
      ctx.fillStyle = 'rgba(12,8,5,0.9)';
      ctx.fillRect(ix, iy, iw, 7);
      const th = cb.threat;
      // it goes yellow as it fills and red at the top, because the top of it
      // is the quarter second the parry lives in
      ctx.fillStyle = th > 0.78 ? '#e2564f' : th > 0.4 ? '#e2b74a' : '#8a7a52';
      ctx.fillRect(ix, iy, Math.round(iw * th), 7);
      if (th > 0.78) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.sin(this.t * 18);
        ctx.fillStyle = '#ffd678';
        ctx.fillRect(ix + Math.round(iw * 0.78), iy - 1, Math.round(iw * 0.22), 9);
        ctx.globalAlpha = 1;
      }
      drawText(ctx, foe ? ellipsize(foe.def.name, w - 8) : '', x + 3, gy - 9,
        { color: 'rgba(226,200,150,0.75)' });
      if (cb.chain > 1) {
        drawText(ctx, `x${cb.chain}`, x + w - 3, gy - 9, { color: '#ffd678', align: 'right' });
      }
    }

    const guarding = cb.guard > 0.5;
    const label = cb.dodgeT > 0 ? 'ROLLING' : guarding ? 'GUARD'
      : cb.live ? 'SWING' : 'NOTHING NEAR';
    if (this._actBtn(ctx, x, y, w, 14, 'claw', label, 'Q', {
      tint: guarding ? '#9de3ee' : '#e2564f', dim: !cb.live,
      hover: {
        title: 'The claw',
        body: foe
          ? `${foe.def.name}. Drag the claw and flick it - low takes the legs, high staggers. `
            + 'S guards, and a guard raised just as it swings is a parry. Shift rolls.'
          : 'Nothing close enough to hit.',
      },
    })) { g.input.clicked = false; g.strike(g.crab.facing || 1, 0); }

    // stamina, under the button, because every verb spends it
    const st = clamp01(cb.stam / 100);
    ctx.fillStyle = 'rgba(12,8,5,0.8)';
    ctx.fillRect(x, y + 15, w, 3);
    ctx.fillStyle = st > 0.3 ? '#8fe0cc' : '#e2564f';
    ctx.fillRect(x, y + 15, Math.round(w * st), 3);

    // abilities, as a row of slots to the right
    const abil = g.economy.abilities ? g.economy.abilities() : [];
    let ax = x + w + 5;
    abil.slice(0, 4).forEach((a) => {
      const hot = this._hit(ax, y, 15, 14);
      const ready = !a.cool || a.cool <= 0;
      drawPlate(ctx, ax, y, 15, 14, { edge: ready ? 'rgba(160,130,78,0.6)' : 'rgba(80,66,44,0.4)' });
      drawGlyph(ctx, a.icon || 'bolt', ax + 8, y + 7, { color: ready ? '#e2b74a' : '#6b5a3c', scale: 1 });
      if (!ready) {
        ctx.fillStyle = 'rgba(8,6,4,0.6)';
        ctx.fillRect(ax + 1, y + 1, 13, 12 * clamp01(a.cool / (a.cd || 1)));
      }
      if (hot) {
        this.hover = { title: a.name, body: ready ? a.desc : `${a.desc}\n\nComing back.` };
        if (ready && g.input.clicked) { g.input.clicked = false; g.useAbility(a.id); }
      }
      ax += 17;
    });
  }

  /** Spore: a charge bar that tells you where pressure is. */
  /**
   * The nozzle in the corner is the hand. This is the eye: who is in range,
   * and whether the spore would actually take in them. A second charge bar
   * beside a charge bar taught you nothing; knowing that the thing in front
   * of you is not willing yet, and why, is the whole game.
   */
  _sporeBar(ctx, x, y, W, H) {
    const g = this.game;
    const hv = g.hive;
    const w = Math.min(168, Math.max(120, W - x - 10));
    // two lines of it, so the plate sits over the action row rather than
    // spilling its label out above itself
    const py = y - 10;
    const ph = 24;
    const c = g.wildlife?.nearest
      ? g.wildlife.nearest(g.crab.x, g.crab.y, 190, (q) => q.alive && !q.tamed && !q.puppet)
      : null;
    const npcNear = g.npc && !g.npc.hidden && Math.abs(g.npc.x - g.crab.x) < 190
      && g.mind && g.mind.stage !== 'owned';
    const willing = !!c && hv.willing(c);

    K.plaque(ctx, x, py, w, ph, { tint: willing ? K.C.gem : undefined });
    // how many are left in the gland, top right of the plate
    drawText(ctx, `${g.economy.parasites}`, x + w - 5, py + 3,
      { color: g.economy.parasites > 0 ? '#c98ade' : FAINT, align: 'right' });

    if (!c && !npcNear) {
      drawText(ctx, 'nothing in range', x + 6, py + 9, { color: FAINT });
      return;
    }
    if (!c && npcNear) {
      drawText(ctx, 'Dr. Vess', x + 6, py + 3, { color: '#c98ade' });
      drawText(ctx, 'L to lure him in', x + 6, py + 13, { color: DIM });
      return;
    }

    // a token for what it is, then its name, then the one thing in the way
    drawTame(ctx, x + 3, py + 4, c, { size: 16, on: false, t: this.t });
    drawText(ctx, ellipsize(c.def?.name || 'it', w - 48), x + 22, py + 3,
      { color: willing ? '#e6c0f2' : DIM });
    if (willing) {
      const b = 0.5 + 0.5 * Math.sin(this.t * 4);
      ctx.globalAlpha = 0.6 + b * 0.4;
      drawText(ctx, 'WILLING', x + 22, py + 13, { color: '#e6c0f2' });
      ctx.globalAlpha = 1;
    } else {
      // the three ways in, as filled or hollow marks: hurt it, feed it, earn it
      const chip = (i, on, icon, tip) => {
        const cx2 = x + 26 + i * 13;
        ctx.globalAlpha = on ? 1 : 0.3;
        drawNodeIcon(ctx, icon, cx2, py + 16, on ? '#c98ade' : '#8a7a62', 1);
        ctx.globalAlpha = 1;
        if (this._hit(cx2 - 6, py + 10, 12, 12)) this.hover = { title: 'Not willing yet', body: tip };
      };
      chip(0, c.hp < c.hpMax * 0.45, 'claw', 'Worn down. Take it below half and it stops arguing.');
      chip(1, c.mood === 'feed', 'fruit', 'Fed. Put fruit down and let it eat.');
      chip(2, c.trust > 0.35, 'call', 'Half trusting. Stand near it, and do not be a threat.');
    }
  }

  /** Hive: everything on your nerve, as a row you can click. */
  _hiveBar(ctx, x, y, W, H) {
    const g = this.game;
    const list = g.hive.roster();
    if (!list.length) {
      drawPlate(ctx, x, y, 104, 14, { rivets: false });
      drawText(ctx, 'nothing on the nerve', x + 5, y + 3, { color: FAINT });
      return;
    }
    let cx2 = x;
    for (const q of list.slice(0, 8)) {
      const on = g.hive.pick === q;
      const hot = this._hit(cx2, y, 15, 14);
      drawPlate(ctx, cx2, y, 15, 14, {
        edge: on ? '#6fd8ee' : 'rgba(120,150,160,0.4)',
        top: hot ? 'rgba(40,60,72,0.95)' : undefined,
      });
      // a token in its own colour, and a thread of health under it
      ctx.fillStyle = on ? '#9fe8f4' : q.hostile ? '#d88a7a' : '#8ec8d8';
      ctx.fillRect(cx2 + 5, y + 4, 5, 5);
      const hp = clamp01((q.hp ?? 1) / (q.hpMax ?? 1));
      ctx.fillStyle = 'rgba(10,20,24,0.8)';
      ctx.fillRect(cx2 + 2, y + 11, 11, 1);
      ctx.fillStyle = hp > 0.4 ? '#6fd8ee' : '#e2564f';
      ctx.fillRect(cx2 + 2, y + 11, Math.round(11 * hp), 1);
      if (hot) {
        this.hover = { title: q.name || q.def?.name || 'One of yours',
          body: on ? 'You are this one. A / D walks it; click it again to let go.'
            : 'Click to be this one.' };
        if (g.input.clicked) { g.input.clicked = false; g.takeHive(q); }
      }
      cx2 += 17;
    }
  }

  /** Roam: it does not move until you say where. */
  /**
   * A line of text, on a slab, with a lit edge down one side. It slides up as
   * it arrives and thins out as it goes, so it reads as a thing that happened
   * rather than a label that is always on.
   */
  _toast(ctx, W, H) {
    const lines = wrapText(this.toast, Math.min(220, W - (this.touchEnabled ? 96 : 40)));
    const tw = Math.max(...lines.map((l) => textWidth(l)));
    const max = this.toastMax || 3.6;
    const inK = clamp01((max - this.toastT) / 0.18);
    const out = clamp01(this.toastT / 0.5);
    const a = Math.min(inK, out);
    const bw = tw + 14, bh = lines.length * LINE_H + 7;
    const bx = Math.round(W / 2 - bw / 2);
    // on a phone there is no clear band at the bottom, so it sits in the sky
    const by = Math.round((this.touchEnabled ? H * 0.30 : H - 50)
      - (lines.length - 1) * LINE_H) + Math.round((1 - inK) * 5);
    ctx.save();
    ctx.globalAlpha = a;
    K.plaque(ctx, bx, by, bw, bh, { tint: K.C.warn });
    lines.forEach((l, i) => drawText(ctx, l, W / 2 + 1, by + 4 + i * LINE_H,
      { color: '#f3e6c6', align: 'center' }));
    ctx.restore();
  }

  /**
   * The way out. One chip, top right, always there: an arrow while you are
   * inside something, and a pair of bars when you are not - which is the only
   * button in the game that is always in the same place.
   */
  _exitChip(ctx, W, H) {
    const s = this.touchEnabled ? 20 : 16;
    const x = W - s - 3, y = 3;
    const hot = this._hit(x - 2, y - 2, s + 4, s + 4);
    const down = hot && this.game.input.down;
    const nest = this.nested;
    K.button(ctx, x, y, s, s, null, { hot, down });
    const o = down ? 1 : 0;
    const cx = Math.round(x + s / 2) + o, cy = Math.round(y + s / 2) + o;
    ctx.fillStyle = K.C.ink;
    if (nest) {
      // a left-pointing arrow: out of this, back to that
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 4 + i, cy - i, 1, i * 2 + 1);
      ctx.fillRect(cx - 1, cy - 1, 6, 2);
    } else {
      ctx.fillRect(cx - 3, cy - 4, 2, 8);
      ctx.fillRect(cx + 1, cy - 4, 2, 8);
    }
    if (hot) {
      this.hover = { title: nest ? 'Back' : 'Pause', body: 'esc' };
      if (this.game.input.clicked) { this.game.input.clicked = false; this.back(); }
    }
  }

  /** Paused. Three words and three buttons. */
  _pauseCard(ctx, W, H) {
    const g = this.game;
    const i = g.input;
    ctx.fillStyle = 'rgba(8,6,4,0.78)';
    ctx.fillRect(0, 0, W, H);

    const bh = this.touchEnabled ? 22 : 18;
    const rows = [
      ['RESUME', null, () => { this.paused = false; }],
      [g.audio.enabled ? 'SOUND: ON' : 'SOUND: OFF', g.audio.enabled, () => {
        g.audio.setMuted(g.audio.enabled);
        g.settings.muted = !g.audio.enabled;
        Save.writeSettings?.(g.settings);
      }],
      [this.touchEnabled ? 'TOUCH: ON' : 'TOUCH: OFF', this.touchEnabled, () => {
        g.settings.touchControls = !this.touchEnabled;
        Save.writeSettings?.(g.settings);
      }],
      [this._confirmNew ? 'SURE? START OVER' : 'NEW RUN', null, () => {
        if (!this._confirmNew) { this._confirmNew = 1; return; }
        this._confirmNew = 0;
        this.paused = false;
        g.reset();
      }],
    ];
    const w = 148;
    const h = 12 + rows.length * (bh + 4) + 4 + 13 + 8;
    const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    const cs = 11, cbx = x + w - 4 - cs, cby = y + 4;
    const closeHot = this._hit(cbx - 4, cby - 4, cs + 8, cs + 8);
    const page = K.windowFrame(ctx, x, y, w, h, {
      title: 'PAUSED', closeHot, closeDown: closeHot && i.down,
    });
    if (closeHot && i.clicked) { i.clicked = false; this.paused = false; g.audio?.play('ui'); }

    rows.forEach(([label, on, run], n) => {
      const bx = page.x + 4, by = page.y + 4 + n * (bh + 4), bw = page.w - 8;
      const hot = this._hit(bx, by, bw, bh);
      this.buttons.push({ x: bx, y: by, w: bw, h: bh });
      K.button(ctx, bx, by, bw, bh, label, {
        hot, down: hot && i.down, on: !!on, sticky: !!on,
        tint: n === rows.length - 1 && this._confirmNew ? '#e9968a' : undefined,
      });
      if (hot && i.clicked) { i.clicked = false; g.audio?.play('ui'); run(); }
    });
    // and what day you are on, because a pause screen should tell you where
    // you had got to
    const fy = page.y + page.h - 13;
    K.rule(ctx, page.x + 4, fy - 4, page.w - 8);
    const stat = `${g.garden.planted.length} grown  ${g.wildlife.fleet.length} tame`;
    drawText(ctx, ellipsize(`DAY ${g.weather.day + 1}`, page.w - 12 - textWidth(stat)),
      page.x + 5, fy, { color: K.C.inkSoft });
    drawText(ctx, stat, page.x + page.w - 5, fy, { color: K.C.inkSoft, align: 'right' });
  }

  /** The thing in your claw while you are carrying it to a bed. */
  _drawCarried(ctx, W, H) {
    const g = this.game;
    const d = this.drag;
    const i = g.input;
    const def = d.kind === 'flora' ? FLORA_BY_ID[d.id] : BUILD_BY_ID[d.id];
    if (!def) return;
    const art = d.kind === 'flora'
      ? buildPlant(def, 0, 0, Math.min(1.0, 20 / Math.max(10, def.h)))
      : buildStructure(def, 0.5);
    const bob = Math.sin(this.t * 9) * 1.2;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(art.cv, Math.round(i.sx - art.ox), Math.round(i.sy - art.oy + bob));
    ctx.globalAlpha = 1;
    drawText(ctx, this.ghostPlot ? 'let go to plant' : 'over a bed', i.sx, i.sy + 6,
      { color: this.ghostPlot ? '#b6de8f' : FAINT, align: 'center', outline: true, outlineColor: OUT });
  }

  // -- HUD ------------------------------------------------------------------

  /**
   * Balance, when it matters. Tipping over into overload is the one moment
   * the number is worth saying out loud, so it is said once, then left alone.
   */
  _balanceWarn(gd) {
    const heavy = gd.overload > 0;
    if (heavy && !this._wasHeavy) this.say?.('Too heavy - you slow down', 3);
    else if (gd.listed && !this._wasListed && !heavy) this.say?.('Listing - even out your back', 3);
    this._wasHeavy = heavy;
    this._wasListed = gd.listed;
  }

  _hud(ctx, W, H) {
    const g = this.game;
    const e = g.economy;
    const maxW = e.stat('waterMax');
    // the build rail owns the left edge while it is out, so the readouts move
    // over rather than sitting underneath it and stealing its taps
    const L = this.buildOn ? this.railW(W) + 6 : 5;

    // on a phone the build rail takes most of the width, so the readouts
    // collapse to one line rather than fighting it for room
    if (this.buildOn && W < 320) {
      drawText(ctx, `${Math.round(e.water)} water   ${Math.round(e.nutrients)} growth`,
        W - 5, 4, { color: INK, align: 'right', outline: true, outlineColor: OUT });
      this._pumpStub(ctx, W, H);
      return;
    }

    // The first slot is whatever the mode actually spends. In SPORE that is
    // not water at all - it is the gland, and the number under it is how many
    // spores are in you, not how much water is.
    const spore = this.mode === 'spore';
    let sh;
    if (spore) {
      const cap = Math.max(4, e.stat('sporeMax') || 8);
      const have = e.parasites || 0;
      const press = clamp01((g.hive?.charge || 0) / 1.35);
      sh = drawGland(ctx, L, 2, have / cap, this.t, press);
      drawText(ctx, `${have}`, L + sh.w / 2, 4 + sh.h - 5,
        { color: have > 0 ? '#e6c0f2' : '#8a6a94', align: 'center', outline: true, outlineColor: OUT });
      if (this._hit(L, 2, sh.w, sh.h)) {
        this.hover = { title: 'The gland', body: `${have} / ${cap} spores. It fruits from a mindcap; hold the nozzle to build pressure.` };
      }
    } else {
      // water: a moulted shell with the water actually in it
      sh = drawShell(ctx, L, 4, e.water / maxW, this.t);
      drawText(ctx, `${Math.round(e.water)}`, L + sh.w / 2, 4 + sh.h - 1,
        { color: INK, align: 'center', outline: true, outlineColor: OUT });
      if (this._hit(L, 4, sh.w, sh.h)) this.hover = { title: 'Spring', body: `${Math.round(e.water)} / ${Math.round(maxW)}` };
    }

    // nutrients: a flower that blooms as you bank them and sheds when you spend
    const stage = clamp(Math.round(Math.pow(clamp01(this.bloomShown / 260), 0.62) * 8), 0, 8);
    const sway = Math.sin(this.t * 1.1) * 0.04 + (g.weather ? g.weather.windSpeed * 0.02 : 0);
    const bx = L + sh.w + 2;
    drawBloom(ctx, bx, 2, stage, sway);
    drawText(ctx, `${Math.round(e.nutrients)}`, bx + 17, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(bx, 2, 34, 40)) {
      this.hover = { title: 'Growth', body: `${Math.round(e.nutrients)} banked` };
    }

    // parasites, when you have any: a thing you keep, not a thing you spend
    if (e.parasites > 0) {
      const px2 = L + 1, py2 = 78;
      const pulse = 0.7 + Math.sin(this.t * 2.2) * 0.3;
      ctx.globalAlpha = pulse;
      drawGlyph(ctx, 'seed', px2, py2, { color: '#c98ade' });
      ctx.globalAlpha = 1;
      drawText(ctx, `${e.parasites}   X`, px2 + 15, py2 + 3,
        { color: '#d79ae8', outline: true, outlineColor: OUT });
      if (this._hit(px2, py2, 60, 12)) {
        this.hover = {
          title: 'Parasites',
          body: 'Fruited by a mindcap. Get close to an animal and press X to put one on it. '
            + 'What it takes over, you steer.',
        };
      }
    }

    // What is yours. Not a number of berries - the animals themselves, each
    // as its own face, with what is left of it drawn under it. Click one and
    // you are it.
    const fx = bx + 34;
    const mine = g.hive ? g.hive.roster() : [];
    if (mine.length) {
      let tx = fx;
      const row = Math.min(mine.length, W < 320 ? 3 : 5);
      for (let i = 0; i < row; i++) {
        const q = mine[i];
        const on = g.hive.pick === q;
        const box = drawTame(ctx, tx, 14, q, { size: 16, on, t: this.t });
        if (this._hit(box.x, box.y, box.w, box.h)) {
          this.hover = {
            title: q.name || q.def?.name || 'Dr. Vess',
            body: on ? 'You are this one. Click again to let go.' : 'Yours. Click to be it.',
          };
          if (g.input.clicked) { g.input.clicked = false; g.takeHive(q); }
        }
        tx += 18;
      }
      if (mine.length > row) {
        drawText(ctx, `+${mine.length - row}`, tx + 1, 18, { color: FAINT });
      }
    } else {
      // nothing yet: the sprig, so the slot still tells you what makes tames
      ctx.globalAlpha = 0.55;
      drawSprig(ctx, fx, 16, e.berries);
      ctx.globalAlpha = 1;
      drawText(ctx, `${e.berries}`, fx + 13, 4 + sh.h - 1,
        { color: FAINT, align: 'center', outline: true, outlineColor: OUT });
      if (this._hit(fx, 16, 26, 22)) {
        this.hover = { title: 'Nothing is yours yet', body: 'Fruit brings the birds in. Once one trusts you, sing with it - and it stands here.' };
      }
    }

    this._topRowX = mine.length ? fx + Math.min(mine.length, W < 320 ? 3 : 5) * 18 + 6 : fx + 30;
    // What is in the claw. It only exists while there is sand in it, because a
    // permanent empty gauge for a thing you may never do is furniture.
    const sand = g.sandHeld || 0;
    if (sand > 0.5) this._topRowX += 30;
    if (sand > 0.5) {
      const k = clamp01(sand / g.sandMax);
      const sx = fx + 34, sy = 16;
      // a heap, growing, rather than a bar with a number on it
      const hh = Math.round(2 + k * 9);
      for (let i = 0; i < hh; i++) {
        const w = Math.round((hh - i) * 2.1);
        ctx.fillStyle = i < 2 ? '#e6cd95' : i < hh - 2 ? '#cbab74' : '#a98b5c';
        ctx.fillRect(sx - Math.round(w / 2), sy + 11 - i, w, 1);
      }
      ctx.fillStyle = 'rgba(40,28,16,0.5)';
      ctx.fillRect(sx - 12, sy + 12, 24, 1);
      if (this._hit(sx - 12, sy, 24, 14)) {
        this.hover = { title: 'Sand in the claw',
          body: `${Math.round(sand)} of ${g.sandMax}. Pour it out and it stays where you put it - for a while.` };
      }
    }

    // place, weather, and a clock you can actually read at a glance. On a
    // phone there is no room for all of it across the top, so the place name
    // gets the space that is left and the rest moves down.
    const narrow = W < 320;
    const room = W - (L + 96) - 10;
    const label = narrow ? ellipsize(g.biome.name, Math.max(40, room))
      : `${g.biome.name}   ${g.weather.label()}`;
    // Everything the HUD knows about the world outside you - where you are,
    // what the sky is doing, what day it is - hangs off one riveted plate in
    // the corner, instead of three sizes of outlined text over the sky.
    const lw = Math.max(textWidth(label), 62) + 12;
    K.plaque(ctx, W - 22 - lw, 1, lw + 20, narrow ? 30 : 44);
    drawText(ctx, label, W - 26, 4, { color: '#dfd0ab', align: 'right' });
    K.px(ctx, W - 20 - lw, 13, lw + 16, 1, 'rgba(148,118,68,0.45)');
    this._clock(ctx, W - 15, narrow ? 20 : 23);
    if (!narrow) this._compass(ctx, W, H);

    // the gene orb: the way into the tree
    const ox = W - 32, oy = narrow ? 42 : 48;
    const ready = this._treeReady();
    drawOrb(ctx, ox, oy, this.t, ready ? 0.5 + Math.sin(this.t * 3) * 0.5 : 0);
    drawText(ctx, `${e.genes.size}`, ox + 15, oy + 32,
      { color: '#9fe8d4', align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(ox, oy, 30, 30)) {
      this.hover = { title: 'Genome', body: `${e.genes.size} genes expressed. Look into it to see the Tree of Life.${ready ? ' Something is ready to grow.' : ''}` };
      if (g.input.clicked) { g.input.clicked = false; this._openTree(); }
    }

    // fleet, as a row of little tokens under the orb
    const fleet = g.wildlife.fleet;
    if (fleet.length) {
      for (let i = 0; i < Math.min(9, fleet.length); i++) {
        const c = fleet[i];
        const cx = W - 8 - (i + 1) * 8, cy = oy + 32;
        ctx.fillStyle = c.onShell ? 'rgba(140,196,104,0.95)' : 'rgba(226,183,74,0.9)';
        ctx.fillRect(cx, cy, 6, 6);
        ctx.strokeStyle = OUT;
        ctx.strokeRect(cx - 0.5, cy - 0.5, 7, 7);
        if (this._hit(cx, cy, 6, 6)) this.hover = { title: c.name, body: c.def.ability || c.def.desc };
      }
    }

    // The shell's balance used to be a gauge and a needle hung under the
    // water shell, where it sat on top of the job card and read as a broken
    // bar. The rail shows balance while you are up there building, which is
    // the only time you can do anything about it; out here it only speaks up
    // when it matters - see _balanceWarn.
    const gd = g.garden;
    this._balanceWarn(gd);

    // how many are ready to pick: a chip in the top row, after whatever is
    // already in it, rather than a line of text under the shell
    const ripe = gd.ripeCount;
    if (ripe && !this.buildOn) {
      const rx0 = this._topRowX ?? (L + 120), ry0 = 16;
      const pulse = 0.6 + Math.sin(this.t * 3.2) * 0.4;
      const cw = textWidth(`${ripe}`) + 22;
      K.plaque(ctx, rx0, ry0 - 2, cw, 15, { tint: '#8cc468' });
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      drawNodeIcon(ctx, 'fruit', rx0 + 8, ry0 + 5, '#cfe89a', 1);
      ctx.globalAlpha = 1;
      drawText(ctx, `${ripe}`, rx0 + 16, ry0 + 2, { color: '#e6f4c8' });
      if (this._hit(rx0, ry0 - 2, cw, 15)) {
        this.hover = { title: `${ripe} ready to pick`, body: 'R, or tap here.' };
        if (g.input.clicked) { g.input.clicked = false; g.harvestAll(); }
      }
    }

    // the spring: a valve you stroke. Not while you are up on your own back,
    // because up there you are not running anything.
    if (!this.buildOn) this._pumpButton(ctx, W, H);
    else this.valveRect = null;

    // health, only when it is not full
    const crab = g.crab;
    if (crab.hp < crab.hpMax) {
      const w = 54, x = 6, y = H - 10;
      ctx.fillStyle = 'rgba(20,10,8,0.6)';
      ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = crab.hp > crab.hpMax * 0.35 ? '#c8425c' : '#e2564f';
      ctx.fillRect(x, y, Math.round(w * (crab.hp / crab.hpMax)), 4);
    }

    // the mode, and whatever that mode puts in your hand
    if (this.buildOn) return;
    this._modeBar(ctx, W, H);
    if (this.touchEnabled) return;

    const hint = g.actionHint();
    if (hint && !this.touchEnabled) {
      drawText(ctx, `E   ${hint}`, W / 2, H - 30,
        { color: INK, align: 'center', outline: true, outlineColor: OUT });
    }
    if (!this.touchEnabled) this._keys(ctx, W, H);
  }

  /**
   * The controls, as keycaps rather than a sentence. Five of them, centred,
   * each a cut key with one word under it - and they go quiet once you have
   * been playing a while, because by then you know.
   */
  _keys(ctx, W, H) {
    // Five keycaps, and no words at all after the first minute.
    //
    // It used to read "A D walk  SPC spring  R pick  E dig  M mode" - five
    // labels across the bottom of the screen for five things you learn in
    // thirty seconds. Now the words fade out on their own and the keys stay,
    // because a row of keys is a reminder and a row of sentences is a manual.
    const caps = [['A D', 'walk'], ['SPC', 'pump'], ['R', 'pick'],
      ['E', 'dig'], ['M', 'mode']];
    const age = this.game.playT || 0;
    const near = this._hit(0, H - 16, W, 16);
    const a = near ? 1 : clamp01(1.3 - Math.max(0, age - 100) / 90);
    if (a < 0.04) return;
    // the words go first, and much sooner than the keys
    const wa = near ? 1 : clamp01(1.2 - Math.max(0, age - 30) / 30);
    const capW = caps.map(([k]) => Math.max(11, textWidth(k) + 6));
    const wordW = caps.map(([, t], i) => (wa > 0.04 ? textWidth(t) : 0));
    const gap = 4, pad = wa > 0.04 ? 11 : 6;
    const total = capW.reduce((t, w, i) => t + w + (wordW[i] ? gap + wordW[i] : 0), 0)
      + pad * (caps.length - 1);
    let x = Math.round(W / 2 - total / 2);
    const y = H - 14;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    caps.forEach(([k, word], i) => {
      const w = capW[i];
      K.slab(ctx, x, y, w, 11, {});
      drawText(ctx, k, x + w / 2, y + 2, { color: K.C.ink, align: 'center' });
      x += w;
      if (wordW[i]) {
        x += gap;
        ctx.globalAlpha = Math.min(1, a) * wa;
        drawText(ctx, word, x, y + 2,
          { color: 'rgba(196,172,128,0.92)', outline: true, outlineColor: OUT });
        ctx.globalAlpha = Math.min(1, a);
        x += wordW[i];
      }
      x += pad;
    });
    ctx.restore();
  }


  /** Nothing but the escape hatch, while the rail owns a narrow screen. */
  _pumpStub(ctx, W, H) {
    if (!this.touchEnabled) return;
    const bw = 62, bh = 24, x = W - bw - 6, y = H - bh - 6;
    this.buttons.push({ x, y, w: bw, h: bh, key: 'Escape' });
    ctx.fillStyle = 'rgba(46,34,22,0.92)';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = 'rgba(214,186,138,0.55)';
    ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
    drawText(ctx, 'CLIMB DOWN', x + bw / 2, y + (bh - 7) / 2, { color: INK, align: 'center' });
  }

  /**
   * THE CLAW.
   *
   * In HUNT the corner is not a valve. It is the claw itself, and you do not
   * press it - you DRAG it. Push your thumb out from the middle and the claw
   * goes with it; flick and it swings where you flicked. Low sweeps the legs,
   * level goes for the body, high is a hook. It is the same hand and the same
   * corner as the spring, which is the point: one thumb, one place, and the
   * mode decides what is under it.
   */
  _clawStick(ctx, W, H) {
    const g = this.game;
    const b = this.valveBox(W, H);
    const R = Math.round(b.size * 0.92);
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    const i = g.input;
    const live = g.state === 'play' && !this.drawerOpen;
    const hot = Math.hypot(i.sx - cx, i.sy - cy) < R * 1.5;

    // grab it, drag it, let go
    if (live && hot && i.down && !this._claw) {
      this._claw = { x: 0, y: 0, peak: 0 };
      i.clicked = false;
    }
    if (this._claw) {
      if (i.down) {
        const dx = clamp((i.sx - cx) / R, -1, 1);
        const dy = clamp((i.sy - cy) / R, -1, 1);
        const len = Math.hypot(dx, dy);
        this._claw.x = dx; this._claw.y = dy;
        this._claw.peak = Math.max(this._claw.peak, len);
        this.clawVec = len > 0.25 ? { x: dx, y: dy } : null;
        i.clicked = false;
      } else {
        // a flick is a swing; a nudge is nothing
        if (this._claw.peak > 0.42) g.strike(this._claw.x || (g.crab.facing || 1), this._claw.y);
        this._claw = null;
        this.clawVec = null;
      }
    }

    const c = this._claw;
    const k = c ? Math.hypot(c.x, c.y) : 0;
    // the ring it lives in
    ctx.globalAlpha = 0.55 + k * 0.3;
    pxRing(ctx, cx, cy, R, c ? '#e2564f' : 'rgba(226,86,79,0.6)', { p: 1 });
    ctx.globalAlpha = 0.18;
    pxDisc(ctx, cx, cy, R - 1, '#3a1410', { p: 1 });
    ctx.globalAlpha = 1;
    // the three arcs it can take, drawn faintly so the verbs are visible
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = '#e2b74a';
    for (const a of [-0.9, 0, 0.9]) {
      ctx.fillRect(Math.round(cx + Math.cos(a) * (R - 6)), Math.round(cy + Math.sin(a) * (R - 6)), 2, 2);
    }
    ctx.globalAlpha = 1;
    // the claw itself, sitting where your thumb has pushed it
    const hx = cx + (c ? c.x : 0) * (R - 7);
    const hy = cy + (c ? c.y : 0) * (R - 7);
    const cool = g.combat ? g.combat.swingCool : 0;
    drawGlyph(ctx, 'claw', hx - 6, hy - 6, { color: cool > 0 ? '#8a5a52' : '#f0a49a' });
    if (c && k > 0.42) {
      // it is loaded: show which arc
      ctx.globalAlpha = 0.5 + Math.sin(this.t * 14) * 0.2;
      pxRing(ctx, hx, hy, 9, '#ffd678', { p: 1 });
      ctx.globalAlpha = 1;
    }
    // stamina, as a short arc under it - the only number the fight has
    const st = g.combat ? g.combat.stam / 100 : 1;
    ctx.fillStyle = 'rgba(12,8,6,0.75)';
    ctx.fillRect(Math.round(cx - R), Math.round(cy + R + 3), R * 2, 3);
    ctx.fillStyle = st > 0.3 ? '#8fe0cc' : '#e2564f';
    ctx.fillRect(Math.round(cx - R), Math.round(cy + R + 3), Math.round(R * 2 * st), 3);
    if (this.touchEnabled) this.clawRect = { x: cx - R * 1.5, y: cy - R * 1.5, w: R * 3, h: R * 3 };
  }

  /**
   * THE SPOUT.
   *
   * It used to be a 34-pixel valve, a ten-pixel bar floating over it and two
   * anti-aliased curves pretending to be water. Three things that did not
   * look like they belonged to each other, and none of them looked like a
   * spring.
   *
   * It is one instrument now, off the side of a steam engine:
   *
   *   A PRESSURE DIAL. A brass-rimmed face with the needle sweeping round it
   *   and the band painted on the face where the chamber is full - a dial is
   *   the thing everybody already knows how to read as "pressure", and a bar
   *   is not.
   *   A VALVE WHEEL in the middle of it that turns a notch on every stroke,
   *   so pressing it is mechanical and not a click.
   *   A GLASS TANK beside it with the shell's water standing in it.
   *   And a FOUNTAIN out of the top: every stroke throws water, and how high
   *   it goes is how well you timed it. A perfect one on a long chain goes
   *   over the top of the screen furniture; a slip dribbles.
   */
  _pumpButton(ctx, W, H) {
    if (this.mode === 'spore') return this._sprayButton(ctx, W, H);
    if (this.mode === 'hunt') return this._clawStick(ctx, W, H);
    const g = this.game;
    const p = g.pump;
    const e = g.economy;
    const vb = this.valveBox(W, H);
    const size = this.touchEnabled ? 58 : 46;
    // anchored on the same bottom-right corner the old valve used, one size up
    const x = Math.round(vb.x + vb.size - size), y = Math.round(vb.y + vb.size - size);
    const cx = x + size / 2, cy = y + size / 2;
    const R = size / 2 - 1;
    const i = g.input;
    const hot = Math.hypot(i.sx - cx, i.sy - cy) <= R + 3;
    const play = g.state === 'play' && !this.drawerOpen;
    this.valveRect = { x, y, w: size, h: size };
    if (this.touchEnabled && play) {
      this.buttons.push({ x: x - 4, y: y - 4, w: size + 8, h: size + 8, key: ' ' });
    }
    const live = hot && i.down && play;
    if (live && !this._valveDown) this.valveTapped = true;
    if (hot && i.clicked && play) { i.clicked = false; this.valveTapped = true; }
    this._valveDown = live;
    this.valveHeld = live;
    if (hot) this.hover = { title: 'The spring', body: 'Press when the needle is in the green. The bright middle pays double.' };

    // ---- what just happened ----------------------------------------------
    // a stroke is read off the pump's own counter, so the fountain answers
    // the key, the valve and a finger identically
    const struck = p.strokes !== this._spoutSeen;
    if (struck) {
      const kind = p.flash?.text || 'GOOD';
      const power = kind === 'PERFECT' ? 1 : kind === 'GOOD' ? 0.62 : kind === 'SLIPPED' ? 0.16 : 0;
      this._spoutSeen = p.strokes;
      if (this._spoutSeen > 0 && power > 0) this._throwSpout(cx, y + 5, power * (0.8 + Math.min(p.combo, 10) * 0.04), kind);
      this._wheelTo = (this._wheelTo || 0) + (power > 0 ? Math.PI / 4 : 0);
      this._stamp = { text: kind, t: 0.9, col: p.flash?.colour || '#9de3ee' };
    }
    this._wheel = damp(this._wheel || 0, this._wheelTo || 0, 0.0005, 1 / 60);
    if (this._stamp) { this._stamp.t -= 1 / 60; if (this._stamp.t <= 0) this._stamp = null; }

    // ---- the tank, beside it ---------------------------------------------
    const maxW = e.stat('waterMax');
    const fill = clamp01(e.water / Math.max(1, maxW));
    const tw = 9, th = size - 8;
    const tx = x - tw - 4, ty = y + 4;
    K.px(ctx, tx - 1, ty - 1, tw + 2, th + 2, 'rgba(10,7,4,0.85)');
    K.px(ctx, tx, ty, tw, th, K.C.goldDim);
    K.px(ctx, tx + 1, ty + 1, tw - 2, th - 2, '#0d1a1f');
    const wh = Math.round((th - 2) * fill);
    if (wh > 0) {
      K.px(ctx, tx + 1, ty + th - 1 - wh, tw - 2, wh, '#2b7f92');
      K.px(ctx, tx + 1, ty + th - 1 - wh, tw - 2, 1, '#c9f2fa');           // meniscus
      K.px(ctx, tx + 2, ty + th - wh, 1, Math.max(0, wh - 2), 'rgba(201,242,250,0.35)');
      // bubbles, rising while it runs
      if (p.live) {
        for (let k = 0; k < 3; k++) {
          const ph = (this.t * (0.9 + k * 0.37) + k * 0.31) % 1;
          const by = Math.round(ty + th - 2 - ph * (wh - 2));
          if (by > ty + th - 1 - wh) K.px(ctx, tx + 3 + (k * 2) % (tw - 4), by, 1, 1, '#9de3ee');
        }
      }
    }
    // the gradations etched on the glass
    for (let k = 1; k < 4; k++) K.px(ctx, tx + tw - 3, Math.round(ty + (th * k) / 4), 2, 1, 'rgba(226,183,74,0.5)');
    K.px(ctx, tx, ty - 2, tw, 2, K.C.gold);

    // ---- the dial ---------------------------------------------------------
    ctx.save();
    const glow = Math.max(g.pumpHold || 0, p.open * 0.35);
    if (glow > 0.02) pxGlow(ctx, cx, cy, R + 8, '#9fe8ee', 0.35 * glow, { p: 1, steps: 3 });
    // brass rim, a dark bezel, the face
    pxDisc(ctx, cx, cy, R + 1, 'rgba(10,7,4,0.9)');
    pxDisc(ctx, cx, cy, R, hot ? '#f0d89a' : K.C.gold);
    pxDisc(ctx, cx, cy, R - 1, K.C.goldDim);
    pxDisc(ctx, cx, cy, R - 3, 'rgba(10,7,4,0.9)');
    pxDisc(ctx, cx, cy, R - 4, '#1b2226');
    // a lit crescent on the rim, top-left, so it is a thing and not a circle
    for (let k = 0; k < 10; k++) {
      const an = Math.PI * (1.05 + k * 0.05);
      K.px(ctx, Math.round(cx + Math.cos(an) * (R - 0.5)), Math.round(cy + Math.sin(an) * (R - 0.5)), 1, 1, K.C.goldLit);
    }
    // the sweep runs round the bottom-open three-quarters of the face
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    const ang = (f) => A0 + clamp01(f) * (A1 - A0);
    const arc = (f0, f1, r, col, thick = 1) => {
      const n = Math.max(3, Math.ceil((f1 - f0) * 60));
      for (let k = 0; k <= n; k++) {
        const an = ang(f0 + (f1 - f0) * (k / n));
        for (let t2 = 0; t2 < thick; t2++) {
          K.px(ctx, Math.round(cx + Math.cos(an) * (r - t2)), Math.round(cy + Math.sin(an) * (r - t2)), 1, 1, col);
        }
      }
    };
    const rr = R - 5;
    // ticks, every tenth
    for (let k = 0; k <= 10; k++) {
      const an = ang(k / 10);
      const l = k % 5 === 0 ? 3 : 2;
      for (let d = 0; d < l; d++) {
        K.px(ctx, Math.round(cx + Math.cos(an) * (rr - d)), Math.round(cy + Math.sin(an) * (rr - d)), 1, 1, 'rgba(214,186,138,0.55)');
      }
    }
    // the band, painted on the face - only while the chamber is drawn
    if (p.open > 0.05) {
      ctx.globalAlpha = clamp01(p.open);
      const half = p.band / 2;
      arc(p.centre - half, p.centre + half, rr - 1, '#5e9f55', 3);
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 6);
      ctx.globalAlpha = clamp01(p.open) * (0.7 + pulse * 0.3);
      arc(p.centre - half * 0.34, p.centre + half * 0.34, rr - 1, '#d8f5a4', 3);
      ctx.globalAlpha = 1;
    }
    // the valve wheel: a hub and four spokes, turning a notch on each stroke
    const wr = 7;
    for (let k = 0; k < 4; k++) {
      const an = this._wheel + k * Math.PI / 2;
      for (let d = 2; d <= wr; d++) {
        K.px(ctx, Math.round(cx + Math.cos(an) * d), Math.round(cy + Math.sin(an) * d), 1, 1, '#b8543a');
      }
    }
    pxRing(ctx, cx, cy, wr, wr, '#c2702e', { p: 1 });
    pxDisc(ctx, cx, cy, 2.2, K.C.gold);
    K.px(ctx, Math.round(cx) - 1, Math.round(cy) - 1, 1, 1, K.C.goldLit);
    // the needle, with a counterweight behind the pivot
    const na = ang(p.open > 0.05 ? p.pos : 0);
    const shake = p.shake > 0 ? Math.sin(p.shake * 50) * p.shake * 0.08 : 0;
    const nx = Math.cos(na + shake), ny = Math.sin(na + shake);
    for (let d = -3; d <= rr - 1; d++) {
      const col = d > rr - 5 ? '#ff6b5a' : d < 0 ? '#8a6a3a' : '#f6efe0';
      K.px(ctx, Math.round(cx + nx * d), Math.round(cy + ny * d), 1, 1, col);
      if (d > 2 && d < rr - 4) K.px(ctx, Math.round(cx + nx * d + ny), Math.round(cy + ny * d - nx), 1, 1, 'rgba(246,239,224,0.4)');
    }
    // the chain, as rivets round the rim that light one by one
    const pips = 10;
    for (let k = 0; k < pips; k++) {
      const an = ang(k / (pips - 1));
      const on = k < Math.min(p.combo, pips);
      K.px(ctx, Math.round(cx + Math.cos(an) * (R - 2)) , Math.round(cy + Math.sin(an) * (R - 2)), 1, 1,
        on ? (k >= 7 ? '#fff0a0' : '#d8f5a4') : 'rgba(40,30,18,0.9)');
    }
    // the throat at the top, where the water comes out
    K.px(ctx, Math.round(cx) - 3, y - 1, 7, 3, K.C.goldDim);
    K.px(ctx, Math.round(cx) - 2, y - 2, 5, 1, K.C.gold);
    K.px(ctx, Math.round(cx) - 1, y - 1, 3, 1, '#0d1a1f');
    ctx.restore();

    // ---- the fountain ------------------------------------------------------
    this._drawSpout(ctx, cx, y);

    // ---- what it says ------------------------------------------------------
    const full = e.water >= maxW - 0.5;
    const lab = full ? 'FULL' : this.touchEnabled ? 'PUMP' : 'PUMP  SPC';
    const lw = textWidth(lab) + 10;
    const ly = y + size + 2;
    K.px(ctx, Math.round(cx - lw / 2), ly, lw, 11, 'rgba(10,7,4,0.72)');
    drawText(ctx, lab, cx, ly + 2, { color: full ? '#9de3ee' : p.live ? '#d8f5a4' : INK, align: 'center' });
    if (p.combo > 1) {
      drawText(ctx, `x${p.mult.toFixed(1)}`, this.touchEnabled ? x - tw - 8 : x - tw - 6,
        this.touchEnabled ? y + 20 : y - 9,
        { color: '#d8f5a4', align: this.touchEnabled ? 'right' : 'left', outline: true, outlineColor: OUT });
    }
    if (this._stamp) {
      const s = this._stamp;
      const k = clamp01(s.t / 0.9);
      const lift = (1 - k) * 8;
      ctx.globalAlpha = Math.min(1, k * 2);
      // on a phone the row of buttons is right above the dial, so the word
      // comes out of the side of it instead of the top
      const sx2 = this.touchEnabled ? x - tw - 8 : cx, sy2 = this.touchEnabled ? y + 8 - lift : y - 20 - lift;
      drawText(ctx, s.text, sx2, sy2,
        { color: s.col, align: this.touchEnabled ? 'right' : 'center', outline: true, outlineColor: OUT,
          scale: s.text === 'PERFECT' && k > 0.75 && !this.touchEnabled ? 2 : 1 });
      ctx.globalAlpha = 1;
    }
  }

  /** A stroke landed: throw water up out of the throat of the dial. */
  _throwSpout(x, y, power, kind) {
    this.spout = this.spout || [];
    const n = Math.round(10 + power * 34);
    const up = 60 + power * 150;
    for (let k = 0; k < n; k++) {
      const spread = (Math.random() - 0.5) * (18 + power * 30);
      this.spout.push({
        x: x + (Math.random() - 0.5) * 3, y,
        vx: spread, vy: -up * (0.72 + Math.random() * 0.38),
        t: 0, life: 0.7 + Math.random() * 0.6 + power * 0.4,
        r: Math.random() < 0.3 ? 2 : 1,
        c: kind === 'PERFECT' && Math.random() < 0.35 ? '#ffffff' : Math.random() < 0.5 ? '#c9f2fa' : '#5fc6d8',
      });
    }
    // and a ring of splash at the throat
    for (let k = 0; k < 8; k++) {
      const an = Math.PI + (k / 7) * Math.PI;
      this.spout.push({ x, y, vx: Math.cos(an) * 40, vy: Math.sin(an) * 30, t: 0, life: 0.35, r: 1, c: '#9de3ee' });
    }
    if (this.spout.length > 320) this.spout.splice(0, this.spout.length - 320);
  }

  _drawSpout(ctx, cx, top) {
    const sp = this.spout;
    if (!sp || !sp.length) return;
    const dt = 1 / 60;
    for (let k = sp.length - 1; k >= 0; k--) {
      const d = sp[k];
      d.t += dt;
      if (d.t > d.life) { sp.splice(k, 1); continue; }
      d.vy += 330 * dt;
      d.vx *= 0.985;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const a = clamp01(1 - d.t / d.life);
      ctx.globalAlpha = 0.35 + a * 0.65;
      K.px(ctx, Math.round(d.x), Math.round(d.y), d.r, d.r + (Math.abs(d.vy) > 60 ? 1 : 0), d.c);
      // a streak behind the fast ones, so a drop reads as moving
      if (Math.abs(d.vy) > 90) {
        ctx.globalAlpha *= 0.4;
        K.px(ctx, Math.round(d.x - d.vx * 0.012), Math.round(d.y - d.vy * 0.018), 1, 2, d.c);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The nozzle. Hold it and the pressure behind it climbs; let go inside the
   * band and the spore goes out on an arc. Hold it too long and it lets go on
   * its own, on you. Everything it throws is violet and alive - none of it is
   * water, and none of it behaves like water either: spores hang, drift up,
   * and fade rather than arcing down and soaking in.
   */
  _sprayButton(ctx, W, H) {
    const g = this.game;
    const hv = g.hive;
    const e = g.economy;
    const size = 34;
    const { x, y } = this.valveBox(W, H);
    const hot = this._hit(x, y, size, size);
    const i = g.input;
    this.valveRect = { x, y, w: size, h: size };
    const empty = (e.parasites || 0) < 1;

    // Holding this is exactly holding V - it feeds the same charge, so the
    // skill is the same skill whichever hand you are using.
    const live = hot && i.down && !this.drawerOpen && g.state === 'play' && !empty;
    this.nozzleHeld = live;
    if (this.touchEnabled && g.state === 'play' && !this.drawerOpen) {
      this.buttons.push({ x: x - 4, y: y - 4, w: size + 8, h: size + 8, key: 'v' });
    }
    if (hot && i.clicked) i.clicked = false;
    if (hot) {
      this.hover = empty
        ? { title: 'The gland is empty', body: 'Spores fruit from a mindcap. Grow one, and pick it.' }
        : { title: 'The nozzle', body: 'Hold to build pressure. Let go in the band. Too long and it goes off in you.' };
    }

    const k = clamp01((hv?.charge || 0) / 1.35);
    const press = hv?.holding ? k : 0;

    // the cloud it is putting out while it is held
    this.motes = this.motes || [];
    if (press > 0.03) {
      const n = 1 + Math.floor(press * 4);
      for (let q = 0; q < n; q++) {
        if (Math.random() > press) continue;
        this.motes.push({
          x: x + size / 2 + (Math.random() - 0.5) * 10,
          y: y + size / 2 - 6,
          vx: (Math.random() - 0.5) * 34 * (0.4 + press),
          vy: -16 - Math.random() * 40 * (0.4 + press),
          life: 0.7 + Math.random() * 0.8, t: 0,
          r: Math.random() < 0.3 ? 2 : 1,
        });
      }
    }
    for (let q = this.motes.length - 1; q >= 0; q--) {
      const d = this.motes[q];
      d.t += 1 / 60;
      if (d.t > d.life) { this.motes.splice(q, 1); continue; }
      // spores do not fall - they hang and wander, which is the whole point
      d.vy += 6 / 60;
      d.vx += Math.sin(this.t * 3 + d.life * 9) * 14 / 60;
      d.x += d.vx / 60;
      d.y += d.vy / 60;
      const a = clamp01(1 - d.t / d.life);
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = d.r > 1 ? '#f0d4ff' : '#c98ade';
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.r, d.r);
    }
    if (this.motes.length > 200) this.motes.splice(0, this.motes.length - 200);
    ctx.globalAlpha = 1;

    ctx.globalAlpha = empty ? 0.4 : (hot || press > 0 ? 1 : 0.76);
    drawNozzle(ctx, x, y, press, this.t, hot);
    ctx.globalAlpha = 1;

    const label = empty ? 'EMPTY' : hv?.holding ? (hv.pressured ? 'LET GO' : 'HOLD') : 'SPRAY';
    drawText(ctx, label, x + size / 2, y + size + 1, {
      color: empty ? FAINT : hv?.pressured ? '#f0d4ff' : '#c98ade',
      align: 'center', outline: true, outlineColor: OUT,
    });
    this._sprayGauge(ctx, W, H, x + size / 2, y - 10);
  }

  /**
   * The pressure gauge: how hard the gland is being squeezed, where the band
   * is that actually throws, and the red at the end where it bursts.
   */
  _sprayGauge(ctx, W, H, cx, by) {
    const hv = this.game.hive;
    if (!hv || (!hv.holding && hv.charge < 0.01)) return;
    const k = clamp01(hv.charge / 1.35);
    const w = Math.min(112, Math.max(80, Math.round(W * 0.20)));
    const h = 10;
    const sh = hv.pressured ? Math.round(Math.sin(this.t * 40) * 1.4) : 0;
    const x = Math.round(clamp(cx - w / 2, 4, W - w - 4)) + sh;
    const y = Math.round(by - h);

    drawPlate(ctx, x, y, w, h, { edge: 'rgba(150,92,180,0.5)', rivets: false });
    const iw = w - 6, ix = x + 3, iy = y + 3;
    ctx.fillStyle = 'rgba(14,8,18,0.92)';
    ctx.fillRect(ix, iy, iw, h - 6);
    // the band that throws, and the red past it
    ctx.fillStyle = 'rgba(201,138,222,0.40)';
    ctx.fillRect(Math.round(ix + iw * 0.62), iy, Math.round(iw * 0.26), h - 6);
    ctx.fillStyle = 'rgba(226,86,79,0.55)';
    ctx.fillRect(Math.round(ix + iw * 0.88), iy, Math.round(iw * 0.12), h - 6);
    // and the pressure itself
    ctx.fillStyle = hv.pressured ? '#f0d4ff' : k > 0.88 ? '#e2564f' : '#c98ade';
    ctx.fillRect(ix, iy, Math.round(iw * Math.min(1, k)), h - 6);
    if (hv.pressured) {
      const b = 0.5 + 0.5 * Math.sin(this.t * 14);
      ctx.globalAlpha = 0.3 + b * 0.5;
      ctx.fillStyle = '#f6e2ff';
      ctx.fillRect(ix, iy, Math.round(iw * Math.min(1, k)), 1);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * The stroke gauge. A needle sweeping a bore, and a band where the chamber
   * is actually full. Land a stroke inside it and the spring pushes; land them
   * in a row and it pushes much harder - while the band narrows and the needle
   * speeds up, so a chain is something you have to keep earning.
   */
  _pumpGauge(ctx, W, H, cx, by) {
    const p = this.game.pump;
    if (!p || p.open < 0.01) return;
    const a = clamp01(p.open);
    const w = Math.min(112, Math.max(80, Math.round(W * 0.20)));
    const h = 10;
    const sh = p.shake > 0 ? Math.round(Math.sin(p.shake * 40) * p.shake * 2) : 0;
    const x = Math.round(clamp(cx - w / 2, 4, W - w - 4)) + sh;
    const y = Math.round(by - h);

    ctx.globalAlpha = a;
    // the bore
    ctx.fillStyle = 'rgba(10,14,18,0.90)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(150,208,220,0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (let i = 1; i < 8; i++) {
      ctx.fillStyle = 'rgba(150,208,220,0.14)';
      ctx.fillRect(Math.round(x + (w * i) / 8), y + h - 4, 1, 3);
    }

    // the band: where the chamber is full
    const half = p.band / 2;
    const b0 = Math.round(x + clamp01(p.centre - half) * w);
    const b1 = Math.round(x + clamp01(p.centre + half) * w);
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 5);
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = '#6fbf6a';
    ctx.fillRect(b0, y + 2, b1 - b0, h - 4);
    // and the sweet middle of it
    const c0 = Math.round(x + clamp01(p.centre - half * 0.34) * w);
    const c1 = Math.round(x + clamp01(p.centre + half * 0.34) * w);
    ctx.globalAlpha = a * (0.55 + pulse * 0.3);
    ctx.fillStyle = '#cfe89a';
    ctx.fillRect(c0, y + 2, Math.max(1, c1 - c0), h - 4);

    // the needle
    const nx = Math.round(x + clamp01(p.pos) * w);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#f6fbff';
    ctx.fillRect(nx - 1, y + 1, 2, h - 2);
    ctx.globalAlpha = a * 0.4;
    ctx.fillStyle = '#9de3ee';
    ctx.fillRect(nx - 3, y + 1, 6, h - 2);

    // the chain, as pips under the bore
    ctx.globalAlpha = a;
    for (let i = 0; i < Math.min(12, p.combo); i++) {
      ctx.fillStyle = i >= 8 ? '#e2d07a' : '#cfe89a';
      ctx.fillRect(x + 1 + i * 5, y + h + 2, 3, 2);
    }
    if (p.combo > 0) {
      drawText(ctx, `x${p.mult.toFixed(2)}`, x + w - 1, y - 9,
        { color: '#cfe89a', align: 'right', outline: true, outlineColor: OUT });
    }
    if (p.flash) {
      ctx.globalAlpha = a * clamp01(p.flash.t / 0.7);
      drawText(ctx, p.flash.text, x + w / 2 - 14, y - 9,
        { color: p.flash.colour, align: 'center', outline: true, outlineColor: OUT });
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The clock. A dial with the sun and the moon actually going round it, the
   * lit part of the day drawn light and the dark part dark, so you can see how
   * long you have before the things that hunt at night come out.
   */
  _clock(ctx, cx, cy) {
    const g = this.game;
    const w = g.weather;
    const R = 9;
    const hour = w.hour;
    const day = Math.floor(w.day ?? 1);

    // the face: day on top, night under
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(120,158,196,0.55)';
    ctx.fillRect(cx - R, cy - R, R * 2, R);
    ctx.fillStyle = 'rgba(26,28,54,0.78)';
    ctx.fillRect(cx - R, cy, R * 2, R);
    ctx.restore();
    ctx.strokeStyle = 'rgba(214,186,138,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(214,186,138,0.35)';
    ctx.fillRect(cx - R, Math.round(cy), R * 2, 1);

    // the sun goes round once a day; the moon is always opposite it
    const a = ((hour - 6) / 24) * TAU;
    const sx = cx + Math.cos(a) * (R - 2.6), sy = cy + Math.sin(a) * (R - 2.6);
    const mx = cx - Math.cos(a) * (R - 2.6), my = cy - Math.sin(a) * (R - 2.6);
    ctx.fillStyle = 'rgba(190,190,210,0.85)';
    ctx.beginPath(); ctx.arc(mx, my, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,246,196,0.35)';
    ctx.beginPath(); ctx.arc(sx, sy, 4.2, 0, TAU); ctx.fill();

    drawText(ctx, `DAY ${day}`, cx - R - 4, cy - 8, { color: INK, align: 'right' });
    drawText(ctx, `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`,
      cx - R - 4, cy + 1, { color: DIM, align: 'right' });

    if (this._hit(cx - R - 44, cy - R, R * 2 + 44, R * 2)) {
      const toNight = hour < 20 ? 20 - hour : 24 - hour + 20;
      this.hover = {
        title: `Day ${day}`,
        body: hour >= 20 || hour < 5
          ? 'Night. Things come up out of the sand at night.'
          : `${toNight.toFixed(1)} hours of light left.`,
      };
    }
  }

  /** A mark at the edge of the screen for the next place you have not been. */
  _compass(ctx, W, H) {
    const g = this.game;
    const lm = g.world.nextUnfound(g.crab.x);
    drawText(ctx, `${g.world.found.size} found`, W - 6, 34, { color: FAINT, align: 'right' });
    if (!lm) return;
    const d = lm.x - g.crab.x;
    const dir = Math.sign(d) || 1;
    const s = g.cam.worldToScreen(lm.x, g.terrain.surfaceY(lm.x));
    const onScreen = s.x > 8 && s.x < W - 8;
    const y = clamp(onScreen ? s.y - 26 : H * 0.42, 30, H - 60);
    const x = onScreen ? s.x : (dir > 0 ? W - 10 : 10);
    const pulse = 0.6 + Math.sin(this.t * 2.4) * 0.4;
    const col = lm.kind === 'oasis' ? '#7fd0dd' : '#e2b74a';
    if (!onScreen) {
      // A small plate pinned to the edge: what it is, how far, which way.
      // It used to be a bare chevron and a number, which read as a glitch.
      // say what kind of place it is, so the plate means something at a glance
      const what = lm.kind === 'oasis' ? 'OASIS' : 'EXPLORE';
      const label = `${what} ${Math.round(Math.abs(d) / 10)}m`;
      const pw = textWidth(label) + 24, ph = 15;
      const px = dir > 0 ? W - pw - 6 : 6;
      const py = Math.round(y - ph / 2);
      ctx.globalAlpha = 0.78 + pulse * 0.22;
      K.plaque(ctx, px, py, pw, ph, { tint: col });
      drawNodeIcon(ctx, lm.kind === 'oasis' ? 'drop' : 'crown', dir > 0 ? px + 8 : px + pw - 8, py + ph / 2, col, 1);
      drawText(ctx, label, px + pw / 2 + (dir > 0 ? 3 : -3), py + 4, { color: INK, align: 'center' });
      // the arrow, off the outside edge of the plate
      ctx.fillStyle = col;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(dir > 0 ? px + pw + 1 + i : px - 2 - i, py + 4 + i, 1, Math.max(1, 7 - i * 2));
      }
      ctx.globalAlpha = 1;
      if (this._hit(px, py, pw, ph)) this.hover = { title: lm.name || 'Somewhere new', body: `${Math.round(Math.abs(d) / 10)}m ${dir > 0 ? 'east' : 'west'}.` };
      return;
    }
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    ctx.fillStyle = col;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(Math.round(x - dir * i), Math.round(y - 3 + i), 1, Math.max(1, 7 - i * 2));
    }
    ctx.globalAlpha = 1;
    drawText(ctx, lm.name, x, y - 12, { color: INK, align: 'center', outline: true, outlineColor: OUT });
  }

  _treeReady() {
    const e = this.game.economy;
    for (const id of Object.keys(SKILL_BY_ID)) if (e.canBuySkill(id)) return true;
    return this.game.economy.evolutions.size < 7
      && ['juvenile', 'mossback', 'adult', 'springheart', 'ironshell', 'lantern', 'ancient']
        .some((id) => e.canEvolve(id));
  }

  // -- placement ------------------------------------------------------------

  /**
   * Drawn over the shell in world space: how close each plant is to being
   * worth picking. A full ring with a bead on it means take it.
   */
  /**
   * A bed going in. A small plate over it with the seed on one end and a bar
   * that fills while he digs - the only thing on screen while it happens,
   * because the thing to watch is him.
   */
  _plantTimer(ctx, cam) {
    const j = this.game.planting;
    if (!j) return;
    const g = this.game;
    const w = g.garden.plotWorld(j.plot);
    const s = cam.worldToScreen(w.x, w.y - 18);
    const bw = 30, bh = 9;
    const x = Math.round(s.x - bw / 2), y = Math.round(s.y - bh);
    const p = j.phase === 'planting' ? j.p : 0;
    const bob = Math.round(Math.sin(this.t * 2.4) * 1);
    K.slab(ctx, x, y + bob, bw, bh, {});
    drawNodeIcon(ctx, 'sprout', x + 5, y + bob + bh / 2, j.phase === 'planting' ? '#9ad86a' : '#b8a878', 1);
    const tx = x + 10, tw = bw - 13;
    K.px(ctx, tx, y + bob + 3, tw, 3, 'rgba(10,7,4,0.8)');
    if (p > 0) {
      K.px(ctx, tx, y + bob + 3, Math.max(1, Math.round(tw * p)), 3, '#8cc468');
      K.px(ctx, tx, y + bob + 3, Math.max(1, Math.round(tw * p)), 1, '#d8f5a4');
    } else {
      // still walking over: the bar breathes instead of filling
      const k = 0.5 + 0.5 * Math.sin(this.t * 5);
      K.px(ctx, tx, y + bob + 3, tw, 3, `rgba(226,183,74,${0.15 + k * 0.2})`);
    }
    // the little tail pointing down at the bed
    K.px(ctx, Math.round(s.x) - 1, y + bob + bh, 2, 2, 'rgba(10,7,4,0.6)');
  }

  drawCrop(ctx, cam) {
    if (this.placing || this.drawerOpen) return;
    const g = this.game;
    const i = g.input;
    this._plantTimer(ctx, cam);
    let pickHit = null;
    let waterHit = null;
    for (const plot of g.garden.plots) {
      const pl = plot.plant;
      // a seed that has gone in and not been watered is the loudest thing on
      // your back, because nothing at all happens to it until you pour
      if (pl && pl.soaked < 1) {
        const w = g.garden.plotWorld(plot);
        const s = cam.worldToScreen(w.x, w.y - 8);
        if (s.x < -20 || s.x > g.renderer.vw + 20) continue;
        const hot = Math.hypot(i.sx - s.x, i.sy - s.y) < 12;
        if (hot) waterHit = plot;
        const b = 0.5 + 0.5 * Math.sin(this.t * 3.2 + plot.i);
        ctx.globalAlpha = 0.45 + b * 0.5;
        drawNodeIcon(ctx, 'drop', s.x, s.y - 2 - b * 1.5, hot ? '#cdf2fa' : '#5fc6d8', 1);
        ctx.globalAlpha = 1;
        if (cam.zoom > 1.3) {
          drawGauge(ctx, s.x - 6, s.y + 5, 12, 2, pl.soaked, '#5fc6d8');
        }
        continue;
      }
      // THIRST. A plant does not die suddenly, it dies over a minute of you
      // not noticing, so it says so first: a cracked drop over the bed, at
      // every growth stage, before the health starts coming off it.
      if (pl && pl.thirst > 0.42) {
        const w2 = g.garden.plotWorld(plot);
        const s2 = cam.worldToScreen(w2.x, w2.y - 13);
        if (s2.x > -20 && s2.x < g.renderer.vw + 20) {
          const urgent = pl.thirst > 0.72;
          const b = 0.5 + 0.5 * Math.sin(this.t * (urgent ? 7 : 3.4) + plot.i);
          ctx.globalAlpha = 0.5 + b * 0.5;
          const col = urgent ? '#e2564f' : '#e2b74a';
          // an empty drop: the outline of one, with a crack through it
          const r = 3.2;
          pxRing(ctx, s2.x, s2.y - b, r, col, { p: 1 });
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(s2.x), Math.round(s2.y - b - r - 2), 1, 2);
          ctx.fillRect(Math.round(s2.x - 1), Math.round(s2.y - b - 1), 1, 1);
          ctx.fillRect(Math.round(s2.x), Math.round(s2.y - b + 1), 1, 1);
          ctx.globalAlpha = 1;
          if (Math.hypot(i.sx - s2.x, i.sy - s2.y) < 12) {
            this.hover = { title: `${pl.def.name} is dry`,
              body: urgent ? 'It is losing condition. Work the spring.'
                : 'Work the spring, or fill the basin and it will drink on its own.' };
          }
        }
      }

      if (!pl || pl.stage < 3) continue;
      const w = g.garden.plotWorld(plot);
      const s = cam.worldToScreen(w.x, w.y - 9);
      if (s.x < -20 || s.x > g.renderer.vw + 20) continue;
      const ripe = pl.ripe;
      const met = g.garden.needMet(pl.def);
      const hot = Math.hypot(i.sx - s.x, i.sy - s.y) < 12;
      if (hot && ripe >= 1) pickHit = plot;

      if (ripe >= 1) {
        // ready: a bead that bobs, so it reads from across the screen
        const bob = Math.sin(this.t * 3.4 + plot.i) * 1.6;
        const r = 4.0 + Math.sin(this.t * 5 + plot.i) * 0.6;
        ctx.globalAlpha = 0.9;
        pxGlow(ctx, s.x, s.y + bob, r * 3, '#e2f0a8', 0.85, { p: 1, steps: 3 });
        pxDisc(ctx, s.x, s.y + bob, r + 1, 'rgba(20,30,10,0.8)', { p: 1 });
        pxDisc(ctx, s.x, s.y + bob, r, hot ? '#f6ffd8' : '#cfe89a', { p: 1 });
        ctx.globalAlpha = 1;
      } else if (cam.zoom > 1.4 && (this.buildOn || hot || !met) && !g.coverShot) {
        // Still filling: a short bar, and a mark if its condition is not met.
        // Only while you are up on your back looking at it, or pointing at it,
        // or when something is wrong - a row of little bars over every plant
        // all the time was clutter hanging off the shell.
        ctx.globalAlpha = met ? 0.75 : 0.5;
        drawGauge(ctx, s.x - 6, s.y, 12, 2, ripe, met ? '#8cc468' : '#7a6a52');
        if (!met) {
          ctx.fillStyle = '#e2b74a';
          ctx.fillRect(Math.round(s.x - 1), Math.round(s.y - 5), 2, 3);
          ctx.fillRect(Math.round(s.x - 1), Math.round(s.y - 1), 2, 1);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (waterHit && i.clicked) {
      i.clicked = false;
      g.startWatering(waterHit);
    } else if (pickHit && i.clicked) {
      i.clicked = false;
      g.harvestPlot(pickHit);
    }
    if (waterHit) {
      this.hover = { title: `${waterHit.plant.def.name}`, body: 'Dry. Click to pour - land it in the band or it runs off the top.' };
    }
    this.cropHot = !!pickHit || !!waterHit;
  }

  /** Called from the game draw so the ghost sits in the world, not on the HUD. */
  drawGhost(ctx, cam) {
    if (!this.placing) return;
    const g = this.game;
    const crab = g.crab;
    const kind = this.placing.kind;
    const wantWet = kind === 'flora' && FLORA_BY_ID[this.placing.id]?.needsPond;

    for (const p of g.garden.plots) {
      if (!p.unlocked) continue;
      const ok = kind === 'build'
        ? (!p.wet && !p.plant && !p.build)
        : (!p.plant && !p.build && !!p.wet === !!wantWet);
      const wp = g.garden.plotWorld(p);
      const s = cam.worldToScreen(wp.x, wp.y);
      const pulse = 0.5 + Math.sin(this.t * 3 + p.i) * 0.5;
      const r = (2.6 + pulse * 0.8) * cam.zoom;
      ctx.globalAlpha = ok ? 0.55 + pulse * 0.35 : 0.16;
      ctx.strokeStyle = ok ? '#b6de8f' : '#c8425c';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, r * 1.5, r * 0.7, 0, 0, TAU);
      ctx.stroke();
      if (ok) {
        ctx.globalAlpha = 0.25 + pulse * 0.25;
        ctx.fillStyle = '#b6de8f';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r * 1.2, r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const plot = this.ghostPlot;
    if (!plot) return;
    const wp = g.garden.plotWorld(plot);
    const s = cam.worldToScreen(wp.x, wp.y);
    const sp = crab.rig.shellSurface(plot.a, plot.b);
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.scale(cam.zoom, cam.zoom);
    ctx.rotate(Math.atan2(sp.nx, -sp.ny) * 0.30);
    const bob = Math.sin(this.t * 4) * 0.6;
    ctx.translate(0, bob);
    ctx.globalAlpha = 0.62 + Math.sin(this.t * 5) * 0.12;
    if (kind === 'flora') {
      const def = FLORA_BY_ID[this.placing.id];
      const art = buildPlant(def, 3, plot.i % 3, g.garden.plantScale(crab));
      ctx.drawImage(art.cv, -art.ox, -art.oy);
    } else {
      const def = BUILD_BY_ID[this.placing.id];
      const art = buildStructure(def, clamp(crab.m.rx / 52, 0.24, 1.1));
      ctx.drawImage(art.cv, -art.ox, -art.oy);
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // a bracket around the chosen plot so the commit point is unmistakable
    const k = 5 * cam.zoom;
    ctx.strokeStyle = '#f2e4c2';
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(s.x + dx * k, s.y + dy * k - dy * k * 0.55);
      ctx.lineTo(s.x + dx * k, s.y + dy * k);
      ctx.lineTo(s.x + dx * k - dx * k * 0.55, s.y + dy * k);
      ctx.stroke();
    }
  }

  _placingHud(ctx, W, H) {
    const kind = this.placing.kind;
    const def = kind === 'flora' ? FLORA_BY_ID[this.placing.id] : BUILD_BY_ID[this.placing.id];
    const e = this.game.economy;
    const cost = kind === 'flora' ? `${def.cost} water` : `${def.cost} water + ${def.nut} nutrients`;
    const ok = kind === 'flora' ? e.water >= def.cost : e.canBuild(def.id);
    const line = `${def.name}  -  ${cost}`;
    drawText(ctx, line, W / 2, 6, { color: ok ? INK : '#e08c9c', align: 'center', outline: true, outlineColor: OUT });
    drawText(ctx, 'click a marked bed to plant   shift to keep placing   esc to stop',
      W / 2, 16, { color: FAINT, align: 'center', outline: true, outlineColor: OUT });
  }

  // -- the drawer -----------------------------------------------------------

  /**
   * The shop is a popup, not a drawer: a framed panel that lands in the middle
   * of the screen with a rail of tabs across the top, a grid of what you can
   * put on your back down the left, and everything worth knowing about the one
   * you are looking at down the right.
   */
  /**
   * THE PANEL.
   *
   * It used to be a small box with four tabs crammed into a strip along the
   * top and whatever fitted underneath them, which is how the bench ended up
   * as a stack of identical grey bars and the fleet ended up as an empty
   * brown room. It is a menu now, built the way a menu is built:
   *
   *   - a RAIL down the left with one big target per tab, its own colour, its
   *     own picture, and the name under it, which is the one arrangement that
   *     survives being tapped with a thumb;
   *   - a HEADER with the name of the thing you are looking at and a line
   *     saying what it is for;
   *   - and a BODY that each tab lays out for itself, in two columns when
   *     there is room for two, because every one of these screens is a list
   *     of things and one of those things in detail.
   *
   * It opens by growing out of the middle rather than appearing, and the
   * world behind it goes dark and stays dark, so nothing out there draws over
   * the top of it.
   */
  _panel(ctx, W, H) {
    const k = easeOutCubic(this.drawer);
    const pw = Math.min(548, W - 14);
    const ph = Math.min(318, H - 14);
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);
    const i = this.game.input;

    ctx.globalAlpha = k * 0.8;
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.scale(lerp(0.92, 1, k), lerp(0.92, 1, k));
    ctx.translate(-(px + pw / 2), -(py + ph / 2));
    ctx.globalAlpha = k;

    const tab = TABS.find((t) => t.id === this.tab) || TABS[0];
    // the X is hit-tested before the frame draws it, so it can be drawn lit
    const barH = this.touchEnabled ? 16 : 13;
    const cs = barH - 2;
    const cbx = px + pw - 4 - cs, cby = py + 4;
    const pad = this.touchEnabled ? 6 : 2;
    const closeHot = this._hit(cbx - pad, cby - pad, cs + pad * 2, cs + pad * 2);
    const page = K.windowFrame(ctx, px, py, pw, ph, {
      title: tab.name, barH, closeHot, closeDown: closeHot && i.down,
    });
    if (closeHot && i.clicked) { i.clicked = false; this.drawerOpen = false; this.game.audio?.play('ui'); }

    // ---- the rail --------------------------------------------------------
    // Down the left, inside the page, as three big buttons. A tab is a
    // button - it was never anything else - so it is drawn as one.
    const railW = pw < 340 ? 44 : 60;
    const cellH = Math.min(46, Math.floor((page.h - 4) / 3) - 2);
    // the rail is WOOD - it is part of the board, not part of the page, and
    // a column of brass tabs floating on parchment read as three loose
    // buttons somebody had left there
    K.px(ctx, page.x, page.y, railW, page.h, K.C.wood);
    K.px(ctx, page.x + railW, page.y, 1, page.h, K.C.woodDim);
    K.px(ctx, page.x + railW - 1, page.y, 1, page.h, K.C.woodLit);
    TABS.forEach((t, n) => {
      const ty = page.y + 3 + n * (cellH + 3);
      const on = this.tab === t.id;
      const hot = this._hit(page.x + 3, ty, railW - 6, cellH);
      K.button(ctx, page.x + 3, ty, railW - 6, cellH, null, {
        on, hot, sticky: true, tint: t.tint,
      });
      const o = on ? 1 : 0;
      drawTab(ctx, t.icon, page.x + 3 + Math.round((railW - 6 - 18) / 2) - 1 + o,
        ty + Math.round((cellH - 28) / 2) + o);
      drawText(ctx, t.name, page.x + 3 + (railW - 6) / 2 + o, ty + cellH - 11 + o,
        { color: K.C.ink, align: 'center' });
      if (hot && i.clicked) {
        i.clicked = false;
        this.tab = t.id; this.scroll = 0; this.pick = null; this.codexPick = null;
        this.game.audio?.play('ui');
      }
    });

    // ---- the body --------------------------------------------------------
    // No subtitle. The banner says BENCH and the two headings under it say
    // HIS PACK and HE CAN MAKE; a third line of prose over the top of those
    // was the single messiest thing on this screen.
    const bx = page.x + railW + 6;
    const bw = page.x + page.w - 5 - bx;
    const by0 = page.y + 4, bh = page.y + page.h - 4 - by0;
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, by0, bw, bh); ctx.clip();
    if (this.tab === 'craft') this._craftTab(ctx, bx, by0, bw, bh);
    else if (this.tab === 'fleet') this._fleetTab(ctx, bx, by0, bw, bh);
    else this._codexTab(ctx, bx, by0, bw, bh);
    ctx.restore();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * THE BENCH.
   *
   * His pack as real slots on the left, everything he could make as rows on
   * the right, and a detail strip nailed to the bottom that never scrolls -
   * because it is the only part of the screen that can say "you need two more
   * of these", and a thing that can say that should never be off the bottom
   * of a list.
   */
  _craftTab(ctx, x, y, w, h) {
    const g = this.game;
    const craft = g.craft;
    const owned = g.mind.owned;
    const wide = w > 290;
    const detH = wide ? 58 : 70;
    const S = this.touchEnabled ? 26 : 22, gap = 2;

    // ---- his pack --------------------------------------------------------
    const bag = craft.list();
    const packW = wide ? Math.round(w * 0.34) : w;
    K.heading(ctx, x, y, packW, 'HIS PACK');
    const cols = Math.max(1, Math.floor((packW + gap) / (S + gap)));
    const packRows = wide ? 3 : 1;
    for (let n = 0; n < cols * packRows; n++) {
      const cxp = x + (n % cols) * (S + gap);
      const cyp = y + 13 + Math.floor(n / cols) * (S + gap);
      const e = bag[n];
      const hot = !!e && this._hit(cxp, cyp, S, S);
      K.slot(ctx, cxp, cyp, S, S, { empty: !e, hot });
      if (!e) continue;
      drawNodeIcon(ctx, e.def.icon, cxp + S / 2, cyp + S / 2 - 2, e.def.tint, 1);
      drawText(ctx, `${e.n}`, cxp + S - 3, cyp + S - 9,
        { color: '#ffeec0', align: 'right', outline: true, outlineColor: OUT });
      if (hot) this.hover = { title: e.def.name, body: e.def.desc };
    }
    const packBottom = y + 13 + packRows * (S + gap);
    let noteLines = [];
    if (!bag.length) {
      noteLines = wrapText('Empty.', packW - 2);
      noteLines.forEach((l, n) =>
        drawText(ctx, l, x, packBottom + 2 + n * LINE_H, { color: K.C.inkSoft }));
    }

    // ---- what he can make ------------------------------------------------
    const lx = wide ? x + packW + 7 : x;
    const lw = wide ? w - packW - 7 : w;
    const ly = wide ? y : packBottom + 4 + noteLines.length * LINE_H;
    const listBottom = y + h - detH - 4;
    K.heading(ctx, lx, ly, lw, 'HE CAN MAKE');
    const list = craft.recipes();
    if (!this.pick || !list.some((e) => e.r.id === this.pick)) this.pick = list[0]?.r.id || null;
    const rowH = this.touchEnabled ? 18 : 15;
    const top = ly + 13;
    this.scroll = clamp(this.scroll, 0, Math.max(0, list.length * rowH - (listBottom - top)));
    ctx.save();
    ctx.beginPath(); ctx.rect(lx, top, lw, Math.max(0, listBottom - top)); ctx.clip();
    K.px(ctx, lx, top, lw, Math.max(0, listBottom - top), K.C.page);
    list.forEach(({ r, why }, n) => {
      const ry = top + n * rowH - this.scroll;
      if (ry + rowH < top || ry > listBottom) return;
      const out = ITEM_BY_ID[r.out[0]];
      const on = this.pick === r.id;
      const hot = this._hit(lx, Math.max(top, ry), lw, rowH);
      K.row(ctx, lx, ry, lw, rowH, n, { on, hot });
      // a row you cannot make yet is not a GHOST - it is a row with a lock on
      // it. Fading them out made two thirds of this list unreadable and told
      // you nothing about why.
      drawNodeIcon(ctx, out.icon, lx + 9, ry + rowH / 2, out.tint, 1);
      drawText(ctx, ellipsize(`${out.name}${r.out[1] > 1 ? ` x${r.out[1]}` : ''}`, lw - 34),
        lx + 18, ry + (rowH - 7) / 2, { color: why ? K.C.inkSoft : K.C.ink });
      // A tick when he could make it right now. A LOCK only when the thing
      // stopping him is a bench he has not got - a lock on every row you are
      // merely short of copper for is a wall of locks that says nothing.
      if (!why) K.check(ctx, lx + lw - 12, ry + (rowH - 9) / 2, 9, true, false);
      else if (!craft.stationUp(r.at)) K.lock(ctx, lx + lw - 12, ry + (rowH - 9) / 2, 9);
      if (hot && this.game.input.clicked) {
        this.game.input.clicked = false;
        this.pick = r.id;
        this.game.audio?.play('ui');
      }
    });
    ctx.restore();

    // ---- the detail strip, nailed to the bottom --------------------------
    // the strip is its own board, laid on the bottom of the page - a wooden
    // lip above it so it reads as a separate thing rather than as the list
    // having changed colour
    const dy = y + h - detH;
    K.px(ctx, x, dy - 2, w, 2, K.C.wood);
    K.px(ctx, x, dy - 2, w, 1, K.C.woodLit);
    K.px(ctx, x, dy, w, detH, K.C.pageAlt);
    const sel = list.find((e) => e.r.id === this.pick);

    if (craft.job) {
      const out = ITEM_BY_ID[craft.job.r.out[0]];
      K.slot(ctx, x + 2, dy + 8, 22, 22);
      drawNodeIcon(ctx, out.icon, x + 13, dy + 19, out.tint, 1);
      drawText(ctx, `MAKING ${out.name.toUpperCase()}`, x + 28, dy + 10, { color: K.C.ink });
      drawText(ctx, ellipsize('He is doing it by hand. It takes as long as it takes.', w - 34),
        x + 28, dy + 21, { color: K.C.inkSoft });
      K.gauge(ctx, x + 2, dy + detH - 14, w - 4, 8, craft.progress, K.C.cool);
      return;
    }
    if (!sel) return;
    const out = ITEM_BY_ID[sel.r.out[0]];
    const why = sel.why || (!owned ? 'he has to be yours' : null);
    const atName = STATIONS[sel.r.at].name;
    K.slot(ctx, x + 2, dy + 6, 22, 22);
    drawNodeIcon(ctx, out.icon, x + 13, dy + 17, out.tint, 1);
    drawText(ctx, ellipsize(out.name, w - 42 - textWidth(atName)), x + 28, dy + 7,
      { color: K.C.ink });
    drawText(ctx, atName, x + w - 3, dy + 7, { color: K.C.inkSoft, align: 'right' });
    drawText(ctx, ellipsize(out.desc, w - 32), x + 28, dy + 18, { color: K.C.inkSoft });

    // every ingredient, with what he has of it against what it takes
    let cx2 = x + 2;
    const iy = dy + 32;
    for (const [id, n] of sel.r.need) {
      const d = ITEM_BY_ID[id];
      const have = craft.count(id);
      const short = have < n;
      const cnt = `${have}/${n}`;
      const cw2 = 15 + textWidth(cnt);
      if (cx2 + cw2 > x + w - 4) break;
      K.plaque(ctx, cx2, iy, cw2, 12, { tint: short ? K.C.bad : K.C.good });
      drawNodeIcon(ctx, d.icon, cx2 + 8, iy + 6, short ? '#f0a08c' : d.tint, 1);
      drawText(ctx, cnt, cx2 + 13, iy + 3, { color: short ? '#f0a08c' : '#d4f0bc' });
      cx2 += cw2 + 2;
    }

    // ---- and the one button ----------------------------------------------
    const bh2 = this.touchEnabled ? 22 : 18;
    const bw2 = wide ? 76 : w;
    const bx2 = wide ? x + w - bw2 : x;
    const by2 = y + h - bh2 - 1;
    const can = !why;
    const hot = this._hit(bx2, by2, bw2, bh2);
    K.button(ctx, bx2, by2, bw2, bh2, can ? 'MAKE' : why.toUpperCase(),
      { hot: can && hot, down: can && hot && this.game.input.down, disabled: !can });
    if (hot) {
      this.hover = can ? null : { title: 'Not yet', body: `${why}.` };
      if (can && this.game.input.clicked) {
        this.game.input.clicked = false;
        const res = craft.start(sel.r.id);
        if (res.ok) { g.audio.play('uiBig'); g.npc.setPose('write'); }
        else { this.say(res.why, 3); g.audio.play('deny'); }
      }
    }
  }

  /**
   * THE FLEET.
   *
   * Cards, one per animal: its own portrait in a slot, its name, where it has
   * got to, and two labelled verbs. The standing order for all of them is a
   * row of buttons across the top, because it applies to all of them at once
   * and therefore does not belong on any one card.
   */
  _fleetTab(ctx, x, y, w, h) {
    const g = this.game;
    const fleet = g.wildlife.fleet.slice();
    const held = g.wildlife.list.filter((c) => c.puppet);
    const all = fleet.concat(held.filter((c) => !fleet.includes(c)));

    if (!all.length) {
      const cy = y + h / 2;
      // An empty list gets a picture and ONE line. It had four.
      K.slot(ctx, x + w / 2 - 17, cy - 30, 34, 34);
      drawNodeIcon(ctx, 'nest', x + w / 2, cy - 13, '#9ad86a', 2);
      drawText(ctx, 'GROW SOMETHING AND THEY COME', x + w / 2, cy + 12,
        { color: K.C.inkSoft, align: 'center' });
      return;
    }

    const top = y;
    const cols = w > 300 ? 2 : 1;
    const gap = 5;
    const cw = Math.floor((w - gap * (cols - 1)) / cols);
    const ch = 50;
    const rows = Math.ceil(all.length / cols);
    this.scroll = clamp(this.scroll, 0, Math.max(0, rows * (ch + gap) - h));

    all.forEach((c, n) => {
      const cxp = x + (n % cols) * (cw + gap);
      const cyp = top + Math.floor(n / cols) * (ch + gap) - this.scroll;
      if (cyp + ch < top || cyp > y + h) return;
      const on = this.driving === c;
      const puppet = !!c.puppet;
      const tint = puppet ? K.C.gem : c.onShell ? K.C.good : K.C.warn;
      K.px(ctx, cxp, cyp, cw, ch, on ? '#f6d98c' : K.C.page);
      K.px(ctx, cxp, cyp, cw, 1, K.C.pageDim);
      K.px(ctx, cxp, cyp + ch - 1, cw, 1, K.C.pageDim);
      K.px(ctx, cxp, cyp, 2, ch, tint);

      // its own portrait, in a slot, because a card is the ANIMAL. Most of
      // these are long and low, so the window is wider than it is tall and
      // the art is allowed to grow into it rather than only to shrink.
      const pw2 = 46;
      K.slot(ctx, cxp + 4, cyp + 5, pw2, ch - 10);
      const art = c.rig?.body;
      if (art) {
        const sc = Math.min((pw2 - 8) / art.cv.width, (ch - 16) / art.cv.height, 2.4);
        ctx.save();
        ctx.beginPath(); ctx.rect(cxp + 7, cyp + 8, pw2 - 6, ch - 16); ctx.clip();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art.cv, Math.round(cxp + 4 + (pw2 - art.cv.width * sc) / 2),
          Math.round(cyp + 4 + (ch - 10 - art.cv.height * sc) / 2),
          Math.round(art.cv.width * sc), Math.round(art.cv.height * sc));
        ctx.restore();
      }

      const tx = cxp + pw2 + 9;
      const tw2 = cw - pw2 - 14;
      drawText(ctx, ellipsize(c.name, tw2), tx, cyp + 6, { color: K.C.ink });
      const where = puppet ? 'ridden' : c.onShell ? 'aboard'
        : `${Math.round(Math.abs(c.x - g.crab.x) / 10)}m ${c.x > g.crab.x ? 'east' : 'west'}`;
      drawText(ctx, where, tx, cyp + 17, { color: K.C.inkSoft });

      // ONE verb. There was a second - CALL, which walked the animal to you -
      // and an animal that already follows you has nowhere to be called from.
      const bh = this.touchEnabled ? 17 : 14;
      const bw = Math.min(56, tw2);
      const byb = cyp + ch - bh - 5;
      const hot = this._hit(tx, byb, bw, bh);
      K.button(ctx, tx, byb, bw, bh, on ? 'LET GO' : 'DRIVE',
        { hot, down: hot && g.input.down });
      if (hot && g.input.clicked) {
        g.input.clicked = false;
        if (on) this.release(); else this.drive(c);
        g.audio?.play('ui');
      }

      if (this._hit(cxp, cyp, cw, ch - bh - 8)) {
        this.hover = { title: c.name, body: c.def.desc };
      }
    });
  }

  /** How wide the build rail is, which several other things need to know. */
  railW(W) { return Math.min(126, Math.max(96, Math.round(W * 0.26))); }

  /**
   * Build mode's side rail: what you can put on your back, down the left,
   * where it does not cover the animal you are putting it on.
   */
  _buildRail(ctx, W, H) {
    const g = this.game;
    const k = easeOutCubic(this.build);
    const rw = this.railW(W);
    const x = Math.round(-rw * (1 - k));
    const y = 0;

    ctx.globalAlpha = k;
    K.slab(ctx, x - 12, y - 4, rw + 12, H + 8,
      { face: K.C.frame, lit: K.C.frameLit, dim: K.C.frameDim });
    K.px(ctx, x - 12, y + 1, rw + 8, H - 2, K.C.frameDeep);
    K.px(ctx, x - 12, y + 2, rw + 7, H - 4, K.C.page);

    const inX = x + 6, inW = rw - 16;
    let ry = 5;
    // the two things you can do to a shell
    const tbh = this.touchEnabled ? 22 : 18;
    const tw = Math.floor(inW / BUILD_TABS.length);
    BUILD_TABS.forEach((t, i) => {
      const tx = inX + i * tw;
      const on = this.buildTab === t.id;
      const hot = this._hit(tx, ry, tw - 2, tbh);
      K.button(ctx, tx, ry, tw - 2, tbh, null, { on, hot, sticky: true });
      const o = on ? 1 : 0;
      drawTab(ctx, t.icon, tx + 2 + o, ry + (tbh - 22) / 2 + o);
      drawText(ctx, t.name, tx + 20 + o, ry + (tbh - 7) / 2 + o, { color: K.C.ink });
      if (hot && g.input.clicked) {
        g.input.clicked = false;
        this.buildTab = t.id; this.buildScroll = 0; this.pick = null;
        g.audio?.play('ui');
      }
    });
    ry += tbh + 5;

    // what your back has become, and what it takes to be the next thing
    const gd = g.garden;
    const rank = baseRank(gd);
    K.plaque(ctx, inX - 2, ry, inW + 4, 22, { tint: rank.i > 0 ? '#e2b74a' : '#8a7a5a' });
    drawNodeIcon(ctx, rank.i >= 3 ? 'crown' : rank.i > 0 ? 'load' : 'step', inX + 7, ry + 11, K.C.gold, 1);
    drawText(ctx, ellipsize(rank.name, inW - 18), inX + 15, ry + 3, { color: K.C.gold });
    drawText(ctx, rank.next ? `next ${rank.next.need} built, ${rank.next.kinds} kinds` : 'as big as it gets',
      inX + 15, ry + 12, { color: K.C.inkSoft });
    if (this._hit(inX - 2, ry, inW + 4, 22)) {
      this.hover = { title: rank.name, body: `${rank.built} structures, ${rank.kinds} kinds.\n`
        + (rank.i > 0 ? `Growth +${rank.i * 8}%, water +${rank.i * 25}, carries +${rank.i * 0.5}.` : 'Build something on your back and it becomes a camp.') };
    }
    if (this._lastRank !== undefined && rank.i > this._lastRank) {
      this.say(`Your back is a ${rank.name.toLowerCase()} now`, 4);
      g.audio?.play('discover');
    }
    this._lastRank = rank.i;
    ry += 26;

    // what you are carrying, since that is the constraint that matters here
    K.gauge(ctx, inX, ry, inW, 6, gd.load / Math.max(1, gd.capacity),
      gd.overload > 0 ? K.C.bad : K.C.good);
    drawText(ctx, `${gd.load.toFixed(1)}/${gd.capacity.toFixed(0)}`,
      inX, ry + 8, { color: K.C.inkSoft });
    ry += 19;

    // the grid, scrolled
    const gridTop = ry;
    const gridH = H - gridTop - 74;
    ctx.save();
    ctx.beginPath(); ctx.rect(inX - 2, gridTop - 2, inW + 4, gridH + 4); ctx.clip();
    const saved = this.scroll;
    this.scroll = this.buildScroll;
    if (this.buildTab === 'flora') this._floraGrid(ctx, inX, gridTop, inW, gridH);
    else this._buildGrid(ctx, inX, gridTop, inW, gridH);
    this.buildScroll = this.scroll;
    this.scroll = saved;
    ctx.restore();

    // a short card for whatever is selected, and the button that commits it
    const def = this.buildTab === 'build' ? BUILD_BY_ID[this.pick] : FLORA_BY_ID[this.pick];
    const cy = H - 70;
    K.px(ctx, inX - 2, cy - 2, inW + 4, 50, K.C.pageAlt);
    K.rule(ctx, inX - 2, cy - 2, inW + 4);
    if (!def) {
      drawText(ctx, 'Pick one.', inX + 2, cy + 3, { color: K.C.inkSoft });
    } else {
      const isB = this.buildTab === 'build';
      const unlock = isB ? { ok: true } : g.unlockOf(def);
      const afford = isB ? g.economy.canBuild(def.id) : g.economy.water >= def.cost;
      drawText(ctx, ellipsize(def.name, inW - 4), inX + 2, cy + 2,
        { color: unlock.ok ? K.C.ink : K.C.inkSoft });
      if (!unlock.ok) {
        // locked: one lock glyph and one short line, and Vess explains the rest
        drawNodeIcon(ctx, 'link', inX + 7, cy + 20, K.C.gold, 1);
        wrapText(unlock.why, inW - 20).slice(0, 2).forEach((l, i) =>
          drawText(ctx, l, inX + 15, cy + 14 + i * LINE_H, { color: K.C.gold }));
      } else {
        // what it is, as pictograms: what it costs, what it pays, how long it
        // takes and what it wants before it will pay at all
        const chips = isB
          ? [['drop', `${def.cost}`, afford ? '#5fc6d8' : '#e08c9c'],
            ['leaf', `${def.nut}`, '#cfe89a']]
          : [['seed', `${g.seeds[def.id] || 0}`, (g.seeds[def.id] || 0) > 0 ? '#e0c188' : '#e08c9c'],
            ['drop', `${def.cost}`, afford ? '#5fc6d8' : '#e08c9c'],
            ['fruit', `+${def.pay}`, '#8cc468'],
            ['clock', `${Math.round(def.ripen)}s`, 'rgba(214,186,138,0.8)'],
            ['weight', def.mass.toFixed(1), 'rgba(214,186,138,0.6)'],
            // one crop, or for ever - the number you actually plan around
            isAnnual(def) ? ['leaf', 'x1', '#e2b74a'] : ['graft', '\u221e', '#8cc468']];
        if (!isB && def.needs) chips.push([NEEDS_ICON[def.needs] || 'sun', '', '#e2b74a']);
        // and who has to put it in, which is the one that stops you rather
        // than just costing you
        const hand = !isB && def.hands ? g.plantWorker(def) : null;
        if (!isB && def.hands) {
          chips.push([
            def.hands.by === 'digger' ? 'paw' : def.hands.by === 'tool' ? 'hammer' : 'hand',
            '', hand && hand.ok ? '#8cc468' : '#e2564f',
          ]);
        }
        let chx = inX + 2, row = 0;
        for (const [icon, label, col] of chips) {
          const lw = label ? textWidth(label) : 0;
          const cw = 10 + (label ? lw + 2 : 0);
          if (chx + cw > inX + inW - 2) { chx = inX + 2; row++; }
          const chy = cy + 13 + row * 12;
          K.plaque(ctx, chx - 1, chy - 1, cw + 2, 11);
          drawNodeIcon(ctx, icon, chx + 4, chy + 4, col, 1);
          if (label) drawText(ctx, label, chx + 10, chy + 1, { color: col });
          if (this._hit(chx - 1, chy - 1, cw + 2, 11)) {
            const isHand = !isB && def.hands
              && (icon === 'hand' || icon === 'paw' || icon === 'hammer');
            this.hover = isHand
              ? { title: hand && hand.ok ? 'He can do this' : 'Nobody here can plant it',
                body: hand && hand.ok ? def.hands.why : (hand ? hand.why : def.hands.why) }
              : def.needs && icon === NEEDS_ICON[def.needs]
                ? { title: def.name, body: NEEDS_TEXT[def.needs] }
                : { title: def.name, body: `${def.cost} water  ·  pays ${def.pay} every ${Math.round(def.ripen)}s  ·  weighs ${def.mass.toFixed(1)}` };
          }
          chx += cw + 3;
        }
        const bh = this.touchEnabled ? 20 : 16, by = H - bh - 5;
        const hot = this._hit(inX, by, inW, bh);
        const blocked = !isB && hand && !hand.ok;
        K.button(ctx, inX, by, inW, bh,
          !afford ? 'NOT ENOUGH' : blocked ? 'NO HANDS FOR IT'
            : !isB && def.hands ? 'HE WILL PLANT IT' : 'PLACE IT',
          { hot: afford && hot, down: afford && hot && g.input.down, disabled: !afford });
        if (hot && afford && g.input.clicked) {
          g.input.clicked = false;
          this.placing = { kind: this.buildTab === 'build' ? 'build' : 'flora', id: def.id };
          this.say('Now pick a bed.');
          g.audio?.play('uiBig');
        }
      }
    }

    if (!this.touchEnabled) drawText(ctx, 'esc to climb down', inX, 2, { color: FAINT });
    if (this._hit(inX, 0, inW, 9) && g.input.clicked) { g.input.clicked = false; this.toggleBuild(); }
    ctx.globalAlpha = 1;
  }

  /** One slot in the grid: a framed tile with the thing itself sitting in it. */
  /**
   * A slot in a grid. Brass when it holds something you can have, blue-grey
   * when it is locked - which is the difference between "not yet" and
   * "empty" and is worth a whole different metal.
   */
  _slot(ctx, x, y, w, h, opts) {
    const hot = this._hit(x, y, w, h);
    const sel = opts.selected;
    K.slot(ctx, x, y, w, h, { empty: !!opts.locked, hot, on: sel });
    if (opts.accent) K.px(ctx, x + 3, y + h - 5, w - 6, 2, opts.accent);
    return hot;
  }

  _floraGrid(ctx, x, y, w, h) {
    const g = this.game;
    const cols = w < 150 ? 3 : 4, cell = Math.floor((w - 3) / cols), gap = 3;
    const rows = Math.ceil(FLORA.length / cols);
    FLORA.forEach((f, i) => {
      const cxi = x + (i % cols) * (cell + gap * 0);
      const cy = y + Math.floor(i / cols) * (cell + gap) - this.scroll;
      if (cy > y + h || cy + cell < y) return;
      const unlock = g.unlockOf(f);
      const locked = !unlock.ok;
      const seeds = g.seeds[f.id] || 0;
      const afford = g.economy.water >= f.cost && seeds > 0;
      const hot = this._slot(ctx, cxi, cy, cell - 1, cell, {
        locked, selected: this.pick === f.id,
        accent: locked ? null : afford ? '#8cc468' : '#8a4a44',
      });
      const art = buildPlant(f, locked ? 1 : 3, 0, Math.min(1.15, (cell - 12) / Math.max(10, f.h)));
      ctx.save();
      ctx.beginPath(); ctx.rect(cxi + 1, cy + 1, cell - 3, cell - 4); ctx.clip();
      if (locked) ctx.globalAlpha = 0.22;
      ctx.drawImage(art.cv, Math.round(cxi + cell / 2 - art.ox), Math.round(cy + cell - 5 - art.oy));
      ctx.restore();
      // how many are already growing, top right; how many seeds you hold,
      // bottom left - the second one is what decides whether you can plant it
      const have = g.garden.countOf(f.id);
      if (have) drawText(ctx, `${have}`, cxi + cell - 4, cy + 2, { color: '#b6de8f', align: 'right' });
      if (!locked) {
        drawText(ctx, `${seeds}`, cxi + 3, cy + cell - 9,
          { color: seeds > 0 ? '#e0c188' : '#a06a5c' });
        // an annual is marked, because planting one is a different decision
        if (isAnnual(f)) {
          drawText(ctx, 'x1', cxi + cell - 4, cy + cell - 9,
            { color: 'rgba(226,183,74,0.8)', align: 'right' });
        }
        if (!seeds) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = '#15100a';
          ctx.fillRect(cxi, cy, cell - 1, cell);
          ctx.globalAlpha = 1;
        }
      }
      if (locked) {
        // a shut seed case rather than a cross: you have not opened it yet
        ctx.fillStyle = 'rgba(18,13,8,0.55)';
        ctx.fillRect(cxi, cy, cell - 1, cell);
        drawGlyph(ctx, 'seed', cxi + cell / 2 - 6, cy + cell / 2 - 6, { color: '#6a5844', alpha: 0.9 });
      }
      if (hot) {
        this.pickHover = f.id;
        // press and drag lifts the seed straight out of its slot
        if (!locked && seeds > 0 && g.input.down && !this.drag && !g.input.clicked) {
          this.drag = { kind: 'flora', id: f.id, t: 0 };
          this.pick = f.id;
          g.audio?.play('ui');
        }
        if (g.input.clicked) {
          g.input.clicked = false;
          this.pick = f.id;
          g.audio?.play('ui');
        }
      }
    });
    this.scroll = clamp(this.scroll, 0, Math.max(0, rows * (cell + gap) - h));
  }

  _buildGrid(ctx, x, y, w, h) {
    const g = this.game;
    const cols = w < 150 ? 3 : 4, cell = Math.floor((w - 3) / cols), gap = 3;
    const rows = Math.ceil(BUILDINGS.length / cols);
    BUILDINGS.forEach((b, i) => {
      const cxi = x + (i % cols) * cell;
      const cy = y + Math.floor(i / cols) * (cell + gap) - this.scroll;
      if (cy > y + h || cy + cell < y) return;
      const built = g.garden.plots.some((p) => p.build && p.build.id === b.id);
      const ok = g.economy.canBuild(b.id);
      const hot = this._slot(ctx, cxi, cy, cell - 1, cell, {
        selected: this.pick === b.id,
        accent: built ? '#8cc468' : ok ? '#e2b74a' : '#8a4a44',
      });
      const art = buildStructure(b, Math.min(1.05, (cell - 12) / Math.max(10, b.h)));
      ctx.save();
      ctx.beginPath(); ctx.rect(cxi + 1, cy + 1, cell - 3, cell - 4); ctx.clip();
      ctx.drawImage(art.cv, Math.round(cxi + cell / 2 - art.ox), Math.round(cy + cell - 4 - art.oy));
      ctx.restore();
      if (built) drawText(ctx, '*', cxi + cell - 5, cy + 2, { color: '#b6de8f', align: 'right' });
      if (hot) {
        if (ok && g.input.down && !this.drag && !g.input.clicked) {
          this.drag = { kind: 'build', id: b.id, t: 0 };
          this.pick = b.id;
        }
        if (g.input.clicked) {
          g.input.clicked = false;
          this.pick = b.id;
          g.audio?.play('ui');
        }
      }
    });
    this.scroll = clamp(this.scroll, 0, Math.max(0, rows * (cell + gap) - h));
  }

  /**
   * The detail pane. This is where a plant stops being an icon: what it is,
   * what it does to you, how often you can pick it and what it wants first.
   */
  // -- field notes ----------------------------------------------------------

  _codexTab(ctx, x, y, w, h) {
    const g = this.game;
    // They are his notes, in his notebook, in his hands. You have to be with
    // him to read them, which is the whole reason to keep him around.
    if (!g.vessClose) {
      const d = Math.round(Math.abs(g.npc.x - g.crab.x) / 10);
      // He is carrying them. That is the whole of it.
      drawText(ctx, 'HE HAS THE NOTES', x + w / 2, y + h / 2 - 12,
        { color: K.C.gold, align: 'center' });
      drawText(ctx, `${d}m ${g.npc.x > g.crab.x ? 'east' : 'west'}   -   F calls him`,
        x + w / 2, y + h / 2 + 2, { color: K.C.inkSoft, align: 'center' });
      return;
    }
    if (this.codexPick) return this._codexEntry(ctx, x, y, w, h);
    let ry = y + 4 - this.scroll;
    let total = 0;

    // What you have caught, first, as a case of slots: the ones you have in
    // full colour with the biggest you have landed under them, the ones you
    // have not as a shadow of the shape - so an empty slot is a thing to go
    // and find rather than a blank.
    const log = g.fishing?.log || {};
    if (ry > y - 12 && ry < y + h) {
      drawText(ctx, 'FISH', x, ry, { color: '#9de3ee' });
      drawText(ctx, `${Object.keys(log).length} / ${FISH.length}`, x + w, ry, { color: K.C.inkSoft, align: 'right' });
    }
    ry += 11; total += 11;
    {
      const sw = 50, shh = 40, gap = 4;
      const cols = Math.max(1, Math.floor((w + gap) / (sw + gap)));
      FISH.forEach((f, i) => {
        const cx = x + (i % cols) * (sw + gap), cy = ry + Math.floor(i / cols) * (shh + gap);
        if (cy < y - shh || cy > y + h) return;
        const got = log[f.id];
        K.slot(ctx, cx, cy, sw, shh - 10, { empty: !got, back: got ? '#16394a' : undefined });
        const art = fishFrame(f.id, got ? Math.floor(this.t * 5 + i) % 4 : 0, 1);
        const k = Math.min(2, (sw - 10) / art.w, (shh - 16) / art.h);
        ctx.save();
        if (!got) { ctx.filter = 'brightness(0)'; ctx.globalAlpha = 0.45; }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art.cv, Math.round(cx + sw / 2 - (art.w * k) / 2), Math.round(cy + (shh - 10) / 2 - (art.h * k) / 2),
          Math.round(art.w * k), Math.round(art.h * k));
        ctx.restore();
        drawText(ctx, got ? `${got.best}cm` : '?', cx + sw / 2, cy + shh - 8,
          { color: got ? K.C.ink : FAINT, align: 'center' });
        if (this._hit(cx, cy, sw, shh)) {
          this.hover = got
            ? { title: f.name, body: `${f.latin}\nCaught ${got.n}. Best ${got.best} cm.\n${f.note}` }
            : { title: 'Not caught yet', body: f.where === 'oasis' ? 'Lives in the oasis pools.' : f.where === 'sea' ? 'Lives in the sea to the west.' : 'Lives in the deep water, far out to the west.' };
        }
      });
      const rows = Math.ceil(FISH.length / cols);
      ry += rows * (shh + gap) + 4; total += rows * (shh + gap) + 4;
    }

    // what he has worked out about the basin itself
    if (ry > y - 12 && ry < y + h) drawText(ctx, 'THE BASIN', x, ry, { color: '#7fd0dd' });
    ry += 11; total += 11;
    const found = g.world.found.size;
    for (const [name, body] of WORLD_NOTES) {
      const lines = wrapText(body, w - 6);
      if (ry > y - 30 && ry < y + h) {
        drawText(ctx, name, x + 2, ry, { color: K.C.ink });
        lines.forEach((l, i) => drawText(ctx, l, x + 2, ry + 9 + i * LINE_H, { color: PAPER_FAINT }));
      }
      const dh = 11 + lines.length * LINE_H;
      ry += dh; total += dh;
    }
    ry += 4; total += 4;
    if (ry > y - 12 && ry < y + h) drawText(ctx, 'WHAT HAPPENED', x, ry, { color: K.C.gold });
    ry += 11; total += 11;
    ERAS.forEach((e, i) => {
      const open = found >= i * 2;
      const lines = wrapText(open ? e.text : 'Not pieced together yet.', w - 6);
      if (ry > y - 40 && ry < y + h) {
        drawText(ctx, open ? e.name : '???', x + 2, ry, { color: open ? K.C.ink : PAPER_FAINT });
        lines.forEach((l, k) => drawText(ctx, l, x + 2, ry + 9 + k * LINE_H, { color: open ? DIM : FAINT }));
      }
      const dh = 11 + lines.length * LINE_H + 3;
      ry += dh; total += dh;
    });
    ry += 6; total += 6;
    for (const cl of CLADES) {
      const list = FAUNA.filter((f) => f.clade === cl.id);
      if (!list.length) continue;
      if (ry > y - 12 && ry < y + h) drawText(ctx, cl.name.toUpperCase(), x, ry, { color: K.C.gold });
      ry += 11; total += 11;
      for (const f of list) {
        const seen = g.wildlife.seen.has(f.id);
        const obs = g.research[f.id] || 0;
        const level = OBSERVE_STEPS.filter((s) => obs >= s).length;
        if (ry > y - 12 && ry < y + h) {
          const hot = this._hit(x, ry - 1, w, 10);
          if (hot && seen) {
            ctx.fillStyle = 'rgba(88,68,40,0.6)';
            ctx.fillRect(x, ry - 1, w, 10);
          }
          drawText(ctx, seen ? ellipsize(f.name, w - 40) : '???????', x + 2, ry,
            { color: seen ? INK : FAINT });
          // a row of pips for how much he has written down
          for (let i = 0; i < OBSERVE_STEPS.length; i++) {
            ctx.fillStyle = i < level ? '#8cc468' : 'rgba(140,120,90,0.35)';
            ctx.fillRect(x + w - 30 + i * 6, ry + 1, 4, 4);
          }
          if (hot && seen) {
            this.hover = { title: f.name, body: `${f.sci}\n${level}/${OBSERVE_STEPS.length} notes written` };
            if (g.input.clicked) { g.input.clicked = false; this.codexPick = f.id; this.scroll = 0; }
          }
        }
        ry += 10; total += 10;
      }
      ry += 4; total += 4;
    }
    this.scroll = clamp(this.scroll, 0, Math.max(0, total - h + 30));
  }

  /**
   * What a species is waiting for, drawn as the things themselves: a gene orb
   * for every gene it needs, a leaf for how green your back has to be, a drop
   * for how much standing water. Filled means you have it. No sentence.
   */
  _wantRow(ctx, f, x, y, w) {
    const g = this.game;
    const need = f.attract;
    if (!need) return y;
    let cx = x;
    const chip = (icon, ok, label, tip) => {
      const lw = label ? textWidth(label) : 0;
      const cw = 11 + (label ? lw + 2 : 0);
      if (cx + cw > x + w) { cx = x; y += 12; }
      ctx.fillStyle = ok ? 'rgba(70,96,48,0.55)' : 'rgba(56,42,28,0.6)';
      ctx.fillRect(cx, y, cw, 11);
      drawNodeIcon(ctx, icon, cx + 5, y + 5, ok ? '#cfe89a' : 'rgba(190,170,130,0.45)', 1);
      if (label) drawText(ctx, label, cx + 11, y + 2, { color: ok ? '#cfe89a' : FAINT });
      if (this._hit(cx, y, cw, 11)) this.hover = { title: f.name, body: tip };
      cx += cw + 3;
    };
    for (const gene of need.genes || []) {
      const have = g.genes.has(gene);
      chip('link', have, GENE_BY_ID[gene] ? GENE_BY_ID[gene].name.slice(0, 7) : gene,
        have ? 'You are expressing this.' : 'Grow something that expresses this gene.');
    }
    if (need.lush) {
      const ok = g.garden.lushness >= need.lush;
      chip('leaf', ok, `${Math.round(need.lush * 100)}%`,
        `Your shell has to be ${Math.round(need.lush * 100)}% grown over.`);
    }
    if (need.pond) {
      const ok = g.garden.pond >= need.pond;
      chip('drop', ok, `${Math.round(need.pond * 100)}%`, 'It wants standing water in your basin.');
    }
    return y + 11;
  }

  _codexEntry(ctx, x, y, w, h) {
    const g = this.game;
    const f = FAUNA_BY_ID[this.codexPick];
    if (!f) { this.codexPick = null; return; }
    if (this._hit(x, y, 22, 10)) {
      this.hover = { title: 'Back', body: null };
      if (g.input.clicked) { g.input.clicked = false; this.codexPick = null; this.scroll = 0; return; }
    }
    drawText(ctx, '< back', x, y, { color: K.C.inkSoft });
    let ry = y + 14 - this.scroll;
    drawText(ctx, f.name, x, ry, { color: K.C.ink }); ry += 10;
    drawText(ctx, f.sci, x, ry, { color: PAPER_FAINT }); ry += 12;
    const obs = g.research[f.id] || 0;
    const level = OBSERVE_STEPS.filter((s) => obs >= s).length;
    drawText(ctx, `${f.clade}   ${Math.round(obs)}s`, x, ry, { color: K.C.gold }); ry += 12;
    // what it wants, as things rather than as a sentence
    ry = this._wantRow(ctx, f, x, ry, w) + 4;
    wrapText(f.desc, w).forEach((l) => { drawText(ctx, l, x, ry, { color: K.C.inkSoft }); ry += LINE_H; });
    ry += 6;
    f.notes.forEach((n, i) => {
      const got = i < level;
      const lines = wrapText(got ? n : 'Not yet observed closely enough.', w - 8);
      ctx.fillStyle = got ? '#8cc468' : 'rgba(140,120,90,0.5)';
      ctx.fillRect(x, ry + 1, 3, lines.length * LINE_H - 2);
      lines.forEach((l) => {
        drawText(ctx, l, x + 7, ry, { color: got ? DIM : FAINT });
        ry += LINE_H;
      });
      ry += 4;
    });
    if (level < OBSERVE_STEPS.length) {
      const next = OBSERVE_STEPS[level];
      drawText(ctx, `watch ${Math.max(1, Math.round(next - obs))}s more`, x, ry, { color: PAPER_FAINT });
      ry += LINE_H;
    }
    this.scroll = clamp(this.scroll, 0, Math.max(0, (ry + this.scroll) - y - h + 20));
  }

  // -- touch ----------------------------------------------------------------

  /**
   * The prologue has one verb, so it gets one button - and the stick, because
   * the whole point of it is that you can walk around down there.
   */
  drawPrologueControls(ctx, W, H) {
    this.buttons.length = 0;
    this.hover = null;
    if (!this.touchEnabled) { this.stickZone = null; return; }
    const R = W < 320 ? 30 : 27;
    const sx = 8, sy = H - 2 * R - 10;
    this.stickZone = { x: 0, y: H - 2 * R - 20, w: 2 * R + 26, h: 2 * R + 20 };
    const cx = this.stick ? this.stick.ox : sx + R;
    const cy = this.stick ? this.stick.oy : sy + R;
    ctx.globalAlpha = this.stick ? 0.55 : 0.30;
    ctx.strokeStyle = '#cfeef6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = this.stick ? 0.75 : 0.32;
    ctx.fillStyle = '#cfeef6';
    const dx = this.stick ? clamp(this.stick.x - this.stick.ox, -R, R) : 0;
    ctx.beginPath(); ctx.arc(cx + dx, cy, this.stick ? 11 : 10, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    const bw = 76, bh = 28, bx = W - bw - 8, by = H - bh - 8;
    this.buttons.push({ x: bx, y: by, w: bw, h: bh, key: 'e' });
    const hot = this._hit(bx, by, bw, bh);
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 3);
    ctx.fillStyle = hot ? 'rgba(30,86,98,0.95)' : 'rgba(16,52,62,0.9)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = `rgba(190,238,246,${0.4 + pulse * 0.5})`;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    drawText(ctx, 'DIG IN', bx + bw / 2, by + (bh - 7) / 2, { color: '#dff6ff', align: 'center' });
    if (hot && this.game.input.clicked) {
      this.game.input.clicked = false;
      this.game.input.pulseVirtual('e');
    }
  }

  /**
   * The controls you actually get on a phone. A thumbstick big enough to find
   * without looking, and a column of buttons on the other side that only
   * exist when there is something to press - a row of dead dashes teaches you
   * nothing and eats the space the spring needs.
   */
  _touchControls(ctx, W, H) {
    const g = this.game;
    const narrow = W < 300;
    // up on the shell nothing moves and nothing acts, so none of this exists
    if (this.buildOn) { this.stickZone = null; this.stick = null; return; }
    // A thumb is about nine millimetres of certainty. At this scale that is
    // around thirty pixels, so nothing you are meant to hit in a hurry is
    // smaller than that, and the stick is twice it.
    const R = this.stickR(W, H);
    const pad = 10;
    const off = this.buildOn ? this.railW(W) + 4 : 0;
    const span = this.stickSpan(W, H);
    const sx = pad + off, sy = H - span + 10;
    this.stickZone = { x: off, y: H - span, w: 2 * R + 30, h: span };
    const cx = this.stick ? this.stick.ox : sx + R;
    const cy = this.stick ? this.stick.oy : sy + R;
    const p = 2;   // the stick is UI, so it snaps to the UI grid, not the world's

    // The ring used to be three ctx.arc strokes, which is three smooth circles
    // sitting on a screen that has no other smooth anything on it. Same shape,
    // built out of squares.
    ctx.fillStyle = INK;
    ctx.globalAlpha = this.stick ? 0.5 : 0.26;
    pxRing(ctx, cx, cy, R, R, INK, { p, thick: p });
    ctx.globalAlpha = this.stick ? 0.2 : 0.1;
    pxRing(ctx, cx, cy, R - 6, R - 6, INK, { p, thick: p });
    // two chevrons, because this stick only goes two ways
    ctx.globalAlpha = 0.3;
    for (const d of [-1, 1]) {
      const ax = cx + d * (R - 10);
      for (let k = 0; k < 5; k++) {
        const wdt = (5 - k) * p;
        ctx.fillRect(ax - d * k * p - (d < 0 ? 0 : p), cy - wdt / 2, p, wdt);
      }
    }
    ctx.globalAlpha = this.stick ? 0.8 : 0.34;
    const dx = this.stick ? clamp(this.stick.x - this.stick.ox, -R, R) : 0;
    pxDisc(ctx, cx + dx, cy, this.stick ? 13 : 11, INK, { p, soft: p });
    ctx.globalAlpha = 1;

    // THE BUTTONS.
    //
    // There were up to seven of them and they were words. Seven word-plates
    // across a phone is seven plates seventeen pixels wide, which is not a
    // control, it is a decoration - and a row of seven things all made of the
    // same stone with nothing but text to tell them apart is a row you have
    // to READ before you can press, every time.
    //
    // So: FOUR at most, each one a PICTURE of what it does with the word
    // underneath it, and never more than one of them new since last frame.
    // What is on the row is what the world is actually offering you.
    const bs = this.buttonSize(W, H);
    const hint = g.actionHint();
    this.scoopHeld = false;
    this.pourHeld = false;
    this.guardHeld = false;
    const wanted = [];

    if (this.mode === 'hunt') {
      // A duel has three verbs and the claw is the stick in the corner, so
      // the row is the other two. Nothing else belongs here - you are being
      // bitten.
      wanted.push({ icon: 'shield', label: 'GUARD', key: 'zguard',
        colour: '#9de3ee', hold: true });
      const rollReady = g.combat && g.combat.dodgeCool <= 0 && g.combat.stam >= 25;
      wanted.push({ icon: 'skate', label: 'ROLL', key: 'zroll',
        colour: '#e2b74a', dim: !rollReady });
    } else {
      // ONE contextual plate, not three. Talking, picking and acting never
      // happen at once and they were three plates fighting for the same
      // corner; whichever the world is offering, that is the plate.
      if (g.npc && g.talk && !g.talk.on && Math.abs(g.npc.x - g.crab.x) < 64) {
        wanted.push({ icon: 'call', label: 'TALK', key: 'c', colour: '#e8c98a' });
      } else if (g.garden.ripeCount) {
        wanted.push({ icon: 'fruit', label: `PICK ${g.garden.ripeCount}`, key: 'r',
          colour: '#cfe89a' });
      } else if (hint) {
        // the plate says what it will actually do, with a picture of it
        const HINT_ICON = { CATCH: 'fish', STUDY: 'leaf', CUT: 'saw', BREAK: 'hammer', SING: 'call', STRIKE: 'claw' };
        wanted.push({ icon: HINT_ICON[hint] || 'hand', label: hint.length <= 6 ? hint : 'ACT', key: 'e',
          colour: hint === 'CATCH' ? '#9de3ee' : '#e2b74a' });
      }
      // the sand: DIG always, and POUR only beside it - never in front of it,
      // so picking up your first grain cannot slide DIG out from under the
      // thumb that is holding it down.
      //
      // There is no PLANT plate and no BUILT/GROWN/TAME strip. Everything you
      // do to your own back happens ON your own back: you touch the animal
      // and you are up there. One door, and it is the animal.
      wanted.push({ icon: 'spade', label: 'DIG', key: 'zdig',
        colour: '#e0c188', hold: true });
      if ((g.sandHeld || 0) > 0.5) {
        wanted.push({ icon: 'drop', label: 'POUR', key: 'zpour',
          colour: '#cfe89a', hold: true });
      }
    }
    // MODE is not a verb and does not belong in a row of verbs. It is the
    // column down the left-hand edge, which is already a mode switcher, and
    // one tap on the one you want beats two taps cycling to it.

    const gap = 5;
    const plate = (b, bx, by, bw, bh) => {
      this.buttons.push({ x: bx, y: by, w: bw, h: bh, key: b.key });
      const hot = this._hit(bx, by, bw, bh);
      const down = hot && this.game.input.down;
      K.button(ctx, bx, by, bw, bh, null,
        { hot: hot && !b.dim, down: down && !b.dim, disabled: !!b.dim, tint: b.colour });
      const o = down && !b.dim ? 1 : 0;
      // THE PICTURE FIRST. A word under a picture is read once; a word on its
      // own is read every time.
      const sc = bh >= 34 ? 2 : 1;
      const ih = 9 * sc;
      const tall = bh >= ih + 12;
      ctx.globalAlpha = b.dim ? 0.4 : 1;
      drawNodeIcon(ctx, b.icon, bx + bw / 2 + o,
        by + (tall ? 3 + ih / 2 : bh / 2) + o, b.dim ? '#8a8072' : (b.colour || INK), sc);
      if (tall) {
        drawText(ctx, b.label, bx + bw / 2 + o, by + bh - 9 + o,
          { color: b.dim ? 'rgba(240,226,192,0.34)' : INK, align: 'center' });
      }
      ctx.globalAlpha = 1;
      if (b.hold) {
        // a held plate reports while the thumb is down rather than firing once
        if (b.key === 'zdig') this.scoopHeld = down;
        if (b.key === 'zpour') this.pourHeld = down;
        if (b.key === 'zguard') this.guardHeld = down;
        if (down) this.game.input.clicked = false;
      } else if (hot && this.game.input.clicked) {
        this.game.input.clicked = false;
        if (b.key === 'zroll') this.rollWant = true;
        else if (b.key) this.game.input.pulseVirtual(b.key);
      }
    };

    let hintY;
    if (this.compact(H)) {
      // sideways: a column stacked up from the bottom-right, under the thumb
      // that is already holding that corner of the phone
      const v = this.valveBox(W, H);
      const bx = v.x - bs.w - 10;
      let by = H - bs.h - 6;
      for (const b of wanted) { plate(b, bx, by, bs.w, bs.h); by -= bs.h + 4; }
      hintY = by - 2;
    } else {
      // Upright: ONE row, always, hard against the right-hand edge. Four
      // plates is the most this can ever hold, so it never wraps and nothing
      // ever moves except the plate that just appeared.
      const by = this.buttonRowY(W, H);
      const right = W - 6;
      const left = this.stickZone.x + this.stickZone.w + 6;
      const room = right - left;
      const n = Math.max(1, wanted.length);
      const bw = Math.max(38, Math.min(bs.w, Math.floor((room - gap * (n - 1)) / n)));
      let bx = right - n * bw - (n - 1) * gap;
      for (const b of wanted) { plate(b, bx, by, bw, bs.h); bx += bw + gap; }
      hintY = by - 12;
    }
    // ...and the hint is only worth printing when no plate already says it.
    // "TALK" over a plate labelled TALK is the same word twice.
    if (hint && !wanted.some((b) => b.label === hint)) {
      drawText(ctx, hint, W - 6, hintY,
        { color: INK, align: 'right', outline: true, outlineColor: OUT });
    }
  }

  // -- helpers --------------------------------------------------------------

  _hit(x, y, w, h) {
    const i = this.game.input;
    return i.sx >= x && i.sx <= x + w && i.sy >= y && i.sy <= y + h;
  }

  _tooltip(ctx, W, H) {
    const t = this.hover;
    const lines = t.body ? wrapText(t.body, 150) : [];
    const w = Math.min(162, Math.max(textWidth(t.title) + 10, ...lines.map((l) => textWidth(l) + 10), 40));
    const h = (t.title ? 11 : 0) + lines.length * LINE_H + 6;
    const i = this.game.input;
    const x = clamp(i.sx + 8, 2, W - w - 2);
    const y = clamp(i.sy - h - 4, 2, H - h - 2);
    K.plaque(ctx, x, y, w, h, { tint: K.C.frame });
    if (t.title) drawText(ctx, t.title, x + 5, y + 4, { color: '#f0e2c0' });
    lines.forEach((l, k) => drawText(ctx, l, x + 5, y + (t.title ? 15 : 4) + k * LINE_H,
      { color: 'rgba(240,226,192,0.7)' }));
  }
}
