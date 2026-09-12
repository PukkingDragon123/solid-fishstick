// CRABDEN - the interface, such as it is.
//
// There are no panels on the world screen. Water is a shell with water in it,
// nutrients are a flower that is either blooming or losing leaves, fruit is a
// sprig of fruit, and your genome is an orb on your own back that you can look
// into. Everything else lives in a drawer that slides out of the right edge
// when you want it and is not there when you do not.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic } from '../lib/math.js';
import * as Save from '../core/save.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { FLORA, FLORA_BY_ID, NEEDS_TEXT, NEEDS_ICON } from '../data/flora.js';
import { FAUNA, FAUNA_BY_ID, CLADES, OBSERVE_STEPS } from '../data/fauna.js';
import { BUILDINGS, BUILD_BY_ID, GENES, GENE_BY_ID, SKILL_BY_ID } from '../data/progress.js';
import { buildPlant } from '../art/floraart.js';
import { buildStructure } from '../art/buildart.js';
import { drawShell, drawBloom, drawSprig, drawOrb, drawTab, drawPanel, drawGlyph, drawValve, drawGauge, drawNodeIcon, drawPlate } from './icons.js';
import { TreeScreen } from './tree.js';
import { WORLD_NOTES, ERAS } from '../data/lore.js';
import { biomeAt } from '../world/biomes.js';

const INK = '#f2e4c2';
const DIM = 'rgba(240,226,192,0.66)';
const FAINT = 'rgba(240,226,192,0.36)';
const OUT = 'rgba(12,8,5,0.72)';

// The popup is for things you read. Anything you *do* to your own shell now
// happens on the shell itself, in build mode.
const TABS = [
  { id: 'map', icon: 'map', name: 'MAP', sub: 'the basin, and what is left standing in it' },
  { id: 'fleet', icon: 'fauna', name: 'FLEET', sub: 'what lives on you, and where it is' },
  { id: 'codex', icon: 'codex', name: 'FIELD', sub: "Dr. Vess's notes - you have to be with her to read them" },
];

// and build mode has its own two, down the side
const BUILD_TABS = [
  { id: 'flora', icon: 'flora', name: 'SEED' },
  { id: 'build', icon: 'build', name: 'BUILD' },
];

export const MODES = [
  { id: 'direct', name: 'WALK', desc: 'You steer. A crab goes sideways.' },
  { id: 'auto', name: 'ROAM', desc: 'The crab walks itself toward whatever is over the next dune.', skill: 'stride' },
  { id: 'creature', name: 'FLEET', desc: 'Click one of your own and send it somewhere.', skill: 'command' },
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
    this.mapX = null;            // where the map is looking, world x
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
    this.valveHeld = false;
    this.valveTapped = false;
    this.selected = null;        // a commanded creature
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

  modeUnlocked(id) {
    const m = MODES.find((x) => x.id === id);
    if (!m || !m.skill) return true;
    return this.game.economy.skills.has(m.skill);
  }

  cycleMode() {
    const avail = MODES.filter((m) => this.modeUnlocked(m.id));
    const i = avail.findIndex((m) => m.id === this.mode);
    const next = avail[(i + 1) % avail.length];
    this.mode = next.id;
    this.selected = null;
    this.say(`${next.name}: ${next.desc}`, 4);
  }

  // -- frame ----------------------------------------------------------------

  update(dt) {
    this.t += dt;
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
    // clicking the animal itself is how you get onto its back
    if (!this.buildOn && !this.drawerOpen && !this.placing && !this.driving
      && this.game.state === 'play' && i.clicked && this._overCrab() && !this._overRipe()) {
      i.clicked = false;
      this.toggleBuild();
    }
    if (i.justPressed('g')) { i.consumeKey('g'); this._openTree(); }
    if (i.justPressed('m')) { i.consumeKey('m'); this.cycleMode(); }
    const keys = ['1', '2', '3'];
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
    if (this.mode === 'creature' && !this.drawerOpen) this._updateCommand();

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

  toggleBuild() {
    const g = this.game;
    if (!this.buildOn && g.state !== 'play') return;
    this.buildOn = !this.buildOn;
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
      this.say('You climb onto your own back. Nothing moves until you get down.', 4);
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

  _updateCommand() {
    const g = this.game;
    if (!g.input.clicked) return;
    const w = g.cam.screenToWorld(g.input.sx, g.input.sy);
    const hit = g.wildlife.nearest(w.x, w.y, 26, (c) => c.tamed && c.alive);
    if (hit) {
      g.input.clicked = false;
      this.selected = this.selected === hit ? null : hit;
      this.say(this.selected ? `${hit.name}: where?` : 'Stood down.');
      g.audio?.play('ui');
    } else if (this.selected) {
      g.input.clicked = false;
      this.selected.commanded = { x: w.x };
      g.fx.spark(w.x, g.terrain.surfaceY(w.x), '#ffe9a8', 8, 22);
      this.say(`${this.selected.name} on its way.`);
      this.selected = null;
    }
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
    if (this.drawer > 0.005) this._panel(ctx, W, H);
    else if (this.touchEnabled) this._touchControls(ctx, W, H);

    if (this.toast) this._toast(ctx, W, H);
    if (this.drag) this._drawCarried(ctx, W, H);
    this._exitChip(ctx, W, H);
    if (this.paused) this._pauseCard(ctx, W, H);
    if (this.hover && !this.drag) this._tooltip(ctx, W, H);
  }

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
    drawPlate(ctx, bx, by, bw, bh);
    ctx.fillStyle = 'rgba(226,183,74,0.85)';
    ctx.fillRect(bx, by, 2, bh);
    lines.forEach((l, i) => drawText(ctx, l, W / 2 + 1, by + 4 + i * LINE_H,
      { color: INK, align: 'center' }));
    ctx.restore();
  }

  /**
   * The way out. One chip, top right, always there: an arrow while you are
   * inside something, and a pair of bars when you are not - which is the only
   * button in the game that is always in the same place.
   */
  _exitChip(ctx, W, H) {
    const s = 16;
    const x = W - s - 3, y = 3;
    const hot = this._hit(x - 2, y - 2, s + 4, s + 4);
    const nest = this.nested;
    ctx.globalAlpha = hot ? 1 : 0.62;
    ctx.fillStyle = 'rgba(16,12,8,0.85)';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = hot ? 'rgba(242,228,194,0.9)' : 'rgba(214,186,138,0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.fillStyle = hot ? '#f2e4c2' : '#d6ba8a';
    const cx = x + s / 2, cy = y + s / 2;
    if (nest) {
      // a left-pointing arrow: out of this, back to that
      for (let i = 0; i < 4; i++) ctx.fillRect(cx - 4 + i, cy - i, 1, i * 2 + 1);
      ctx.fillRect(cx - 1, cy - 1, 6, 2);
    } else {
      ctx.fillRect(cx - 3, cy - 4, 2, 8);
      ctx.fillRect(cx + 1, cy - 4, 2, 8);
    }
    ctx.globalAlpha = 1;
    if (hot) {
      this.hover = { title: nest ? 'Back' : 'Pause', body: 'esc' };
      if (this.game.input.clicked) { this.game.input.clicked = false; this.back(); }
    }
  }

  /** Paused. Three words and three buttons. */
  _pauseCard(ctx, W, H) {
    const g = this.game;
    ctx.fillStyle = 'rgba(8,6,4,0.72)';
    ctx.fillRect(0, 0, W, H);
    const w = 120, h = 78;
    const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
    drawPanel(ctx, x, y, w, h, { title: 'PAUSED' });
    const rows = [
      ['RESUME', () => { this.paused = false; }],
      [g.audio.enabled ? 'SOUND ON' : 'SOUND OFF', () => {
        g.audio.setMuted(g.audio.enabled);
        g.settings.muted = !g.audio.enabled;
        Save.writeSettings?.(g.settings);
      }],
      [this._confirmNew ? 'SURE? START OVER' : 'NEW RUN', () => {
        if (!this._confirmNew) { this._confirmNew = 1; return; }
        this._confirmNew = 0;
        this.paused = false;
        g.reset();
      }],
    ];
    rows.forEach(([label, run], i) => {
      const bh = 16, bx = x + 8, by = y + 16 + i * (bh + 4), bw = w - 16;
      const hot = this._hit(bx, by, bw, bh);
      this.buttons.push({ x: bx, y: by, w: bw, h: bh });
      ctx.fillStyle = hot ? 'rgba(96,74,44,0.95)' : 'rgba(44,34,22,0.92)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(214,186,138,0.4)';
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      drawText(ctx, label, bx + bw / 2, by + 4,
        { color: i === 2 && this._confirmNew ? '#e08c9c' : INK, align: 'center' });
      if (hot && this.game.input.clicked) {
        this.game.input.clicked = false;
        g.audio?.play('ui');
        run();
      }
    });
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

    // water: a moulted shell with the water actually in it
    const sh = drawShell(ctx, L, 4, e.water / maxW, this.t);
    drawText(ctx, `${Math.round(e.water)}`, L + sh.w / 2, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(L, 4, sh.w, sh.h)) this.hover = { title: 'Spring', body: `${Math.round(e.water)} / ${Math.round(maxW)}` };

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

    // fruit
    const fx = bx + 34;
    drawSprig(ctx, fx, 16, e.berries);
    drawText(ctx, `${e.berries}`, fx + 13, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(fx, 16, 26, 22)) this.hover = { title: 'Fruit', body: 'Fruit. Animals walk a long way for it.' };

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
    drawPlate(ctx, W - 22 - lw, 1, lw + 20, narrow ? 30 : 44, { alpha: 0.90 });
    drawText(ctx, label, W - 26, 4, { color: DIM, align: 'right' });
    ctx.fillStyle = 'rgba(148,118,68,0.35)';
    ctx.fillRect(W - 20 - lw, 13, lw + 16, 1);
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
        ctx.fillStyle = c === this.selected ? '#ffe9a8'
          : c.onShell ? 'rgba(140,196,104,0.95)' : 'rgba(226,183,74,0.9)';
        ctx.fillRect(cx, cy, 6, 6);
        ctx.strokeStyle = OUT;
        ctx.strokeRect(cx - 0.5, cy - 0.5, 7, 7);
        if (this._hit(cx, cy, 6, 6)) this.hover = { title: c.name, body: c.def.ability || c.def.desc };
      }
    }

    // the shell's balance: what you are carrying and how evenly. The rail
    // already shows this while you are up there, so it is not drawn twice.
    const gd = g.garden;
    const load = gd.load, cap = gd.capacity, trim = gd.trim;
    const bx0 = L + 1, by0 = 50;
    if (!this.buildOn) {
    drawGlyph(ctx, 'scale', bx0, by0 - 1, {
      color: gd.overload > 0 ? '#e08c9c' : gd.listed ? '#e2b74a' : '#d6ba8a',
    });
    drawGauge(ctx, bx0 + 15, by0 + 1, 42, 4, load / Math.max(1, cap),
      gd.overload > 0 ? '#c8425c' : load > cap * 0.8 ? '#e2b74a' : '#8cc468');
    // trim: a needle that swings off centre as the load goes to one side
    const tw = 42, tx = bx0 + 15;
    ctx.fillStyle = 'rgba(12,8,5,0.7)';
    ctx.fillRect(tx - 1, by0 + 6, tw + 2, 4);
    ctx.fillStyle = 'rgba(90,72,48,0.9)';
    ctx.fillRect(tx, by0 + 7, tw, 2);
    ctx.fillStyle = gd.listed ? '#e2b74a' : '#d6ba8a';
    ctx.fillRect(Math.round(tx + tw / 2 + trim * tw * 0.5) - 1, by0 + 5, 2, 6);
    ctx.fillStyle = 'rgba(242,228,194,0.4)';
    ctx.fillRect(Math.round(tx + tw / 2), by0 + 6, 1, 4);
    if (this._hit(bx0, by0 - 2, 60, 14)) {
      this.hover = {
        title: 'Balance',
        body: `Carrying ${load.toFixed(1)} of ${cap.toFixed(1)}.\n`
          + (gd.overload > 0 ? 'Overloaded: everything grows slower and you walk slower.\n' : '')
          + (gd.listed ? `Listing ${trim > 0 ? 'right' : 'left'}. Whatever is stacked on the heavy side is suffering.` : 'Evenly loaded.'),
      };
    }

    }

    // how many are ready to pick
    const ripe = gd.ripeCount;
    if (ripe) {
      const rx0 = bx0, ry0 = by0 + 14;
      const pulse = 0.6 + Math.sin(this.t * 3.2) * 0.4;
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      drawGlyph(ctx, 'hand', rx0, ry0, { color: '#cfe89a' });
      ctx.globalAlpha = 1;
      drawText(ctx, `${ripe} ready   R`, rx0 + 15, ry0 + 3,
        { color: '#cfe89a', outline: true, outlineColor: OUT });
      if (this._hit(rx0, ry0, 70, 12)) {
        this.hover = { title: 'Ready to pick', body: 'R, or tap the bead.' };
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

    // mode + prompts
    const modeDef = MODES.find((m) => m.id === this.mode);
    if (this.buildOn) return;
    // on touch the mode is a button of its own, and the label would sit under
    // the thumbstick
    if (this.touchEnabled) return;
    const mw = textWidth(modeDef.name) + 8;
    drawPlate(ctx, 3, H - 22, mw, 11, { alpha: 0.85, rivets: false });
    drawText(ctx, modeDef.name, 7, H - 20, { color: FAINT });
    if (this._hit(4, H - 22, 34, 10)) {
      this.hover = { title: modeDef.name, body: modeDef.desc + '   (M to switch)' };
      if (this.game.input.clicked) { this.game.input.clicked = false; this.cycleMode(); }
    }

    const hint = g.actionHint();
    if (hint && !this.touchEnabled) {
      drawText(ctx, hint, W / 2, H - 30, { color: INK, align: 'center', outline: true, outlineColor: OUT });
    }
    if (!this.touchEnabled) this._keys(ctx, W, H);
    if (this.selected) {
      drawText(ctx, `${this.selected.name} - where?`, W / 2, H - 42,
        { color: '#ffe9a8', align: 'center', outline: true, outlineColor: OUT });
    }
  }

  /**
   * The controls, as keycaps rather than a sentence. Five of them, centred,
   * each a cut key with one word under it - and they go quiet once you have
   * been playing a while, because by then you know.
   */
  _keys(ctx, W, H) {
    const caps = [['A D', 'walk'], ['SPC', 'spring'], ['R', 'pick'],
      ['E', 'dig'], ['M', 'mode']];
    // it fades out over the first few minutes; hovering the row brings it back
    const age = this.game.playT || 0;
    const near = this._hit(0, H - 16, W, 16);
    const a = near ? 1 : clamp01(1.3 - Math.max(0, age - 100) / 90);
    if (a < 0.04) return;
    const capW = caps.map(([k]) => Math.max(11, textWidth(k) + 6));
    const wordW = caps.map(([, t]) => textWidth(t));
    const gap = 4, pad = 11;
    const total = capW.reduce((t, w, i) => t + w + gap + wordW[i], 0) + pad * (caps.length - 1);
    let x = Math.round(W / 2 - total / 2);
    const y = H - 14;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    caps.forEach(([k, word], i) => {
      const w = capW[i];
      drawPlate(ctx, x, y, w, 11, { edge: 'rgba(180,146,86,0.45)' });
      drawText(ctx, k, x + w / 2, y + 2, { color: '#e6d5ad', align: 'center' });
      x += w + gap;
      drawText(ctx, word, x, y + 2,
        { color: 'rgba(196,172,128,0.92)', outline: true, outlineColor: OUT });
      x += wordW[i] + pad;
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
   * The pump. It is a valve in your own shell, so it is drawn as one, and it
   * behaves like one: every tap is one stroke of the muscle behind it.
   */
  _pumpButton(ctx, W, H) {
    const g = this.game;
    const size = 34;
    const x = W - size - 8, y = H - size - (this.touchEnabled ? 70 : 26);
    const hold = g.pumpHold || 0;
    const hot = this._hit(x, y, size, size);
    const i = g.input;
    this.valveRect = { x, y, w: size, h: size };
    // on a touchscreen the valve is a real button, so a finger on it is not
    // stolen by whatever else is near the corner
    if (this.touchEnabled && g.state === 'play' && !this.drawerOpen) {
      this.buttons.push({ x: x - 4, y: y - 4, w: size + 8, h: size + 8, key: ' ' });
    }

    // one tap of the valve is one stroke of the spring, the same as one press
    // of the key. The rising edge is what counts, so hammering it works.
    const live = hot && i.down && !this.drawerOpen && g.state === 'play';
    if (live && !this._valveDown) this.valveTapped = true;
    if (hot && i.clicked && g.state === 'play' && !this.drawerOpen) {
      i.clicked = false;
      this.valveTapped = true;
    }
    this._valveDown = live;
    this.valveHeld = live;
    if (hot) this.hover = { title: 'The spring', body: 'Tap on the band. Chains pay more.' };

    // water: the valve throws it, it arcs, it lands, it runs off the button
    this.spray = this.spray || [];
    if (hold > 0.05) {
      const n = 2 + Math.floor(hold * 5);
      for (let k = 0; k < n; k++) {
        if (Math.random() > hold * 0.9) continue;
        const a = -Math.PI * (0.30 + Math.random() * 0.40);
        const sp = (26 + Math.random() * 54) * (0.5 + hold);
        this.spray.push({
          x: x + size / 2 + (Math.random() - 0.5) * 8,
          y: y + size / 2,
          vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1) * 0.7,
          vy: Math.sin(a) * sp,
          life: 0.55 + Math.random() * 0.55, t: 0,
          r: Math.random() < 0.42 ? 3 : 2,
        });
      }
    }
    for (let k = this.spray.length - 1; k >= 0; k--) {
      const d = this.spray[k];
      d.t += 1 / 60;
      if (d.t > d.life) { this.spray.splice(k, 1); continue; }
      d.vy += 260 / 60;
      d.x += d.vx / 60;
      d.y += d.vy / 60;
      const a = clamp01(1 - d.t / d.life);
      ctx.globalAlpha = 0.40 + a * 0.60;
      ctx.fillStyle = d.r > 2 ? '#c9f2fa' : '#5fc6d8';
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.r, d.r + 1);
      // a short tail, so a droplet reads as moving rather than as a speck
      ctx.globalAlpha *= 0.45;
      ctx.fillRect(Math.round(d.x - d.vx / 90), Math.round(d.y - d.vy / 90), Math.max(1, d.r - 1), Math.max(1, d.r - 1));
    }
    if (this.spray.length > 240) this.spray.splice(0, this.spray.length - 240);

    ctx.globalAlpha = hot || hold > 0 ? 1 : 0.72;
    drawValve(ctx, x, y, hold, this.t);
    // the jet: a bright arc leaving the throat of the valve
    if (hold > 0.05) {
      ctx.globalAlpha = 0.35 + hold * 0.45;
      ctx.strokeStyle = '#9de3ee';
      ctx.lineWidth = Math.max(1, 2 * hold);
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        const jx = x + size / 2, jy = y + size / 2;
        ctx.moveTo(jx, jy);
        ctx.quadraticCurveTo(jx + dir * 16 * hold, jy - 26 * hold,
          jx + dir * 30 * hold, jy - 6 * hold + Math.sin(this.t * 12) * 2);
        ctx.stroke();
      }
    }
    // and it runs down the face of the valve while it is open
    if (hold > 0.1) {
      for (let k = 0; k < 5; k++) {
        const ph = (this.t * (1.4 + k * 0.3) + k * 0.7) % 1;
        ctx.globalAlpha = hold * (1 - ph) * 0.7;
        ctx.fillStyle = '#9de3ee';
        ctx.fillRect(Math.round(x + 6 + k * 6), Math.round(y + size * 0.55 + ph * size * 0.5), 1, 2 + k % 2);
      }
      // a puddle under it, spreading while you hold
      ctx.globalAlpha = Math.min(0.5, hold * 0.5);
      ctx.fillStyle = '#2b7f92';
      const pw = size * (0.4 + hold * 0.7);
      ctx.beginPath();
      ctx.ellipse(x + size / 2, y + size + 3, pw, 2.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const e = g.economy;
    const full = e.water >= e.stat('waterMax') - 0.5;
    drawText(ctx, full ? 'SPILLING' : 'STROKE', x + size / 2, y + size + 1, {
      color: full ? '#9de3ee' : hold > 0 ? '#9de3ee' : FAINT,
      align: 'center', outline: true, outlineColor: OUT,
    });
    this._pumpGauge(ctx, W, H, x + size / 2, y - 10);
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
    const w = Math.min(140, Math.max(96, Math.round(W * 0.28)));
    const h = 13;
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
    ctx.globalAlpha = 0.35 + pulse * 0.4;
    ctx.fillStyle = lm.kind === 'oasis' ? '#7fd0dd' : '#e2b74a';
    // a small chevron, pointing the way
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(Math.round(x - dir * i), Math.round(y - 3 + i), 1, Math.max(1, 7 - i * 2));
    }
    ctx.globalAlpha = 1;
    if (!onScreen) {
      drawText(ctx, `${Math.round(Math.abs(d) / 10)}`, x - dir * 6, y + 6,
        { color: FAINT, align: dir > 0 ? 'right' : 'left', outline: true, outlineColor: OUT });
    } else {
      drawText(ctx, lm.name, x, y - 12,
        { color: INK, align: 'center', outline: true, outlineColor: OUT });
    }
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
  drawCrop(ctx, cam) {
    if (this.placing || this.drawerOpen) return;
    const g = this.game;
    const i = g.input;
    let pickHit = null;
    for (const plot of g.garden.plots) {
      const pl = plot.plant;
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
        const gr = ctx.createRadialGradient(s.x, s.y + bob, 0, s.x, s.y + bob, r * 3);
        gr.addColorStop(0, 'rgba(226,240,168,0.85)');
        gr.addColorStop(1, 'rgba(140,196,104,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(s.x, s.y + bob, r * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = hot ? '#f6ffd8' : '#cfe89a';
        ctx.beginPath(); ctx.arc(s.x, s.y + bob, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20,30,10,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (cam.zoom > 1.4) {
        // still filling: a short bar, and a mark if its condition is not met
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
    if (pickHit && i.clicked) {
      i.clicked = false;
      g.harvestPlot(pickHit);
    }
    this.cropHot = !!pickHit;
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
  _panel(ctx, W, H) {
    const k = easeOutCubic(this.drawer);
    const pw = Math.min(420, W - 20);
    const ph = Math.min(232, H - 20);
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2 + (1 - k) * 26);

    ctx.globalAlpha = k * 0.62;
    ctx.fillStyle = '#0a0705';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k;

    drawPanel(ctx, px, py, pw, ph);

    const inX = px + 12, inY = py + 12, inW = pw - 24, inH = ph - 24;

    // -- the tab rail -------------------------------------------------------
    const tabW = Math.floor(inW / TABS.length);
    TABS.forEach((t, i) => {
      const tx = inX + i * tabW;
      const on = this.tab === t.id;
      const hot = this._hit(tx, inY, tabW, 20);
      if (on) {
        ctx.fillStyle = 'rgba(104,80,48,0.95)';
        ctx.fillRect(tx, inY, tabW - 1, 20);
        ctx.fillStyle = '#d6ba8a';
        ctx.fillRect(tx, inY + 19, tabW - 1, 1);
      } else if (hot) {
        ctx.fillStyle = 'rgba(70,54,34,0.9)';
        ctx.fillRect(tx, inY, tabW - 1, 20);
      }
      ctx.globalAlpha = k * (on ? 1 : 0.62);
      // narrow screens get the pictogram alone; there is no room for both
      const lw = tabW >= 58 ? textWidth(t.name) : 0;
      const gx = tx + Math.round((tabW - 1 - (18 + (lw ? 2 + lw : 0))) / 2);
      drawTab(ctx, t.icon, gx, inY + 3);
      if (lw) drawText(ctx, t.name, gx + 20, inY + 7, { color: on ? INK : DIM });
      ctx.globalAlpha = k;
      if (hot && this.game.input.clicked) {
        this.game.input.clicked = false;
        this.tab = t.id; this.scroll = 0; this.pick = null;
        this.game.audio?.play('ui');
      }
    });

    // -- close --------------------------------------------------------------
    const cx0 = px + pw - 20, cy0 = py + 4;
    const closeHot = this._hit(cx0, cy0, 14, 14);
    drawGlyph(ctx, 'close', cx0 + 1, cy0 + 1, { color: closeHot ? '#f5e7c6' : '#a08a64' });
    if (closeHot) {
      this.hover = { title: 'Close', body: 'esc' };
      if (this.game.input.clicked) { this.game.input.clicked = false; this.drawerOpen = false; }
    }

    const bodyY = inY + 26, bodyH = inH - 26;
    const tab = TABS.find((t) => t.id === this.tab) || TABS[0];
    if (this.tab === 'codex' || this.tab === 'map') {
      drawText(ctx, tab.sub, inX, bodyY - 4, { color: FAINT });
      ctx.save();
      ctx.beginPath(); ctx.rect(inX, bodyY + 6, inW, bodyH - 6); ctx.clip();
      if (this.tab === 'map') this._mapTab(ctx, inX, bodyY + 6, inW, bodyH - 6);
      else this._codexTab(ctx, inX, bodyY + 6, inW, bodyH - 6);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }

    drawText(ctx, tab.sub, inX, bodyY - 4, { color: FAINT });
    ctx.save();
    ctx.beginPath(); ctx.rect(inX, bodyY + 6, inW, bodyH - 6); ctx.clip();
    this._fleetTab(ctx, inX, bodyY + 6, inW, bodyH - 6);
    ctx.restore();
    ctx.globalAlpha = 1;
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
    drawPanel(ctx, x - 12, y - 12, rw + 12, H + 24);

    const inX = x + 8, inW = rw - 18;
    let ry = 6;
    // the two things you can do to a shell
    const tw = Math.floor(inW / BUILD_TABS.length);
    BUILD_TABS.forEach((t, i) => {
      const tx = inX + i * tw;
      const on = this.buildTab === t.id;
      const hot = this._hit(tx, ry, tw - 1, 18);
      ctx.fillStyle = on ? 'rgba(104,80,48,0.95)' : hot ? 'rgba(70,54,34,0.9)' : 'rgba(30,22,14,0.7)';
      ctx.fillRect(tx, ry, tw - 1, 18);
      if (on) { ctx.fillStyle = '#d6ba8a'; ctx.fillRect(tx, ry + 17, tw - 1, 1); }
      ctx.globalAlpha = k * (on ? 1 : 0.6);
      drawTab(ctx, t.icon, tx + 2, ry + 1);
      drawText(ctx, t.name, tx + 20, ry + 6, { color: on ? INK : DIM });
      ctx.globalAlpha = k;
      if (hot && g.input.clicked) {
        g.input.clicked = false;
        this.buildTab = t.id; this.buildScroll = 0; this.pick = null;
        g.audio?.play('ui');
      }
    });
    ry += 22;

    // what you are carrying, since that is the constraint that matters here
    const gd = g.garden;
    drawGauge(ctx, inX, ry, inW, 4, gd.load / Math.max(1, gd.capacity),
      gd.overload > 0 ? '#c8425c' : '#8cc468');
    drawText(ctx, `${gd.load.toFixed(1)}/${gd.capacity.toFixed(0)} carried`, inX, ry + 7, { color: FAINT });
    ry += 18;

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
    ctx.fillStyle = 'rgba(16,11,7,0.8)';
    ctx.fillRect(inX, cy, inW, 46);
    if (!def) {
      wrapText('Pick something. Then pick a bed on your own shell.', inW - 4)
        .forEach((l, i) => drawText(ctx, l, inX + 2, cy + 3 + i * LINE_H, { color: FAINT }));
    } else {
      const isB = this.buildTab === 'build';
      const unlock = isB ? { ok: true } : g.unlockOf(def);
      const afford = isB ? g.economy.canBuild(def.id) : g.economy.water >= def.cost;
      drawText(ctx, ellipsize(def.name, inW - 4), inX + 2, cy + 2, { color: unlock.ok ? INK : FAINT });
      if (!unlock.ok) {
        // locked: one lock glyph and one short line, and Vess explains the rest
        drawNodeIcon(ctx, 'link', inX + 7, cy + 20, '#e2b74a', 1);
        wrapText(unlock.why, inW - 20).slice(0, 2).forEach((l, i) =>
          drawText(ctx, l, inX + 15, cy + 14 + i * LINE_H, { color: '#e2b74a' }));
      } else {
        // what it is, as pictograms: what it costs, what it pays, how long it
        // takes and what it wants before it will pay at all
        const chips = isB
          ? [['drop', `${def.cost}`, afford ? '#5fc6d8' : '#e08c9c'],
            ['leaf', `${def.nut}`, '#cfe89a']]
          : [['drop', `${def.cost}`, afford ? '#5fc6d8' : '#e08c9c'],
            ['fruit', `+${def.pay}`, '#8cc468'],
            ['clock', `${Math.round(def.ripen)}s`, 'rgba(214,186,138,0.8)'],
            ['weight', def.mass.toFixed(1), 'rgba(214,186,138,0.6)']];
        if (!isB && def.needs) chips.push([NEEDS_ICON[def.needs] || 'sun', '', '#e2b74a']);
        let chx = inX + 2, row = 0;
        for (const [icon, label, col] of chips) {
          const lw = label ? textWidth(label) : 0;
          const cw = 10 + (label ? lw + 2 : 0);
          if (chx + cw > inX + inW - 2) { chx = inX + 2; row++; }
          const chy = cy + 13 + row * 12;
          ctx.fillStyle = 'rgba(0,0,0,0.30)';
          ctx.fillRect(chx - 1, chy - 1, cw + 2, 11);
          drawNodeIcon(ctx, icon, chx + 4, chy + 4, col, 1);
          if (label) drawText(ctx, label, chx + 10, chy + 1, { color: col });
          if (this._hit(chx - 1, chy - 1, cw + 2, 11)) {
            this.hover = def.needs && icon === NEEDS_ICON[def.needs]
              ? { title: def.name, body: NEEDS_TEXT[def.needs] }
              : { title: def.name, body: `${def.cost} water  ·  pays ${def.pay} every ${Math.round(def.ripen)}s  ·  weighs ${def.mass.toFixed(1)}` };
          }
          chx += cw + 3;
        }
        const bh = 14, by = H - 20;

        const hot = this._hit(inX, by, inW, bh);
        ctx.fillStyle = !afford ? 'rgba(60,38,34,0.9)' : hot ? '#8cc468' : 'rgba(74,110,52,0.95)';
        ctx.fillRect(inX, by, inW, bh);
        ctx.strokeStyle = afford ? 'rgba(242,228,194,0.6)' : 'rgba(200,66,92,0.5)';
        ctx.strokeRect(inX + 0.5, by + 0.5, inW - 1, bh - 1);
        drawText(ctx, afford ? 'PLACE IT' : 'NOT ENOUGH', inX + inW / 2, by + 4,
          { color: afford ? '#12200c' : '#e08c9c', align: 'center' });
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
  _slot(ctx, x, y, w, h, opts) {
    const hot = this._hit(x, y, w, h);
    const sel = opts.selected;
    ctx.fillStyle = opts.locked ? 'rgba(30,23,15,0.9)'
      : sel ? 'rgba(104,80,48,0.95)' : hot ? 'rgba(80,62,38,0.95)' : 'rgba(44,34,22,0.92)';
    ctx.fillRect(x, y, w, h);
    // a bevel, so a slot reads as a recess in the hide
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = 'rgba(226,204,160,0.14)';
    ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
    if (opts.accent) { ctx.fillStyle = opts.accent; ctx.fillRect(x + 1, y + h - 3, w - 2, 2); }
    if (sel) {
      ctx.strokeStyle = '#f2e4c2';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
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
      const afford = g.economy.water >= f.cost;
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
      // how many you already carry, in the corner
      const have = g.garden.countOf(f.id);
      if (have) drawText(ctx, `${have}`, cxi + cell - 4, cy + 2, { color: '#b6de8f', align: 'right' });
      if (locked) {
        // a shut seed case rather than a cross: you have not opened it yet
        ctx.fillStyle = 'rgba(18,13,8,0.55)';
        ctx.fillRect(cxi, cy, cell - 1, cell);
        drawGlyph(ctx, 'seed', cxi + cell / 2 - 6, cy + cell / 2 - 6, { color: '#6a5844', alpha: 0.9 });
      }
      if (hot) {
        this.pickHover = f.id;
        // press and drag lifts the seed straight out of its slot
        if (!locked && g.input.down && !this.drag && !g.input.clicked) {
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
  /**
   * Your fleet: everything that has decided to live on you. Each one is a card
   * you can point the camera at and then drive yourself, which is the only way
   * to get a jerboa to go somewhere specific.
   */
  _fleetTab(ctx, x, y, w, h) {
    const g = this.game;
    const fleet = g.wildlife.fleet.slice();
    const held = g.wildlife.list.filter((c) => c.puppet);
    const all = fleet.concat(held.filter((c) => !fleet.includes(c)));
    if (!all.length) {
      wrapText('Nothing lives on you yet.', w - 4)
        .forEach((l, i) => drawText(ctx, l, x, y + 6 + i * LINE_H, { color: FAINT }));
      return;
    }
    const ch = 34, gap = 3;
    let row = 0;
    for (const c of all) {
      const by = y + row * (ch + gap) - this.scroll;
      row++;
      if (by > y + h || by + ch < y) continue;
      const on = this.driving === c;
      const puppet = !!c.puppet;
      const hot = this._hit(x, by, w, ch);
      ctx.fillStyle = on ? 'rgba(104,80,48,0.95)' : hot ? 'rgba(80,62,38,0.95)' : 'rgba(44,34,22,0.9)';
      ctx.fillRect(x, by, w, ch);
      ctx.fillStyle = puppet ? '#b46ad0' : c.onShell ? '#8cc468' : '#e2b74a';
      ctx.fillRect(x, by, 2, ch);

      drawText(ctx, ellipsize(c.name, w - 60), x + 6, by + 3, { color: INK });
      drawText(ctx, puppet ? 'RIDDEN' : c.onShell ? 'aboard' : 'out there', x + w - 4, by + 3,
        { color: puppet ? '#d79ae8' : c.onShell ? '#b6de8f' : DIM, align: 'right' });
      const d = Math.round(Math.abs(c.x - g.crab.x) / 10);
      drawNodeIcon(ctx, 'step', x + 10, by + 20, FAINT, 1);
      drawText(ctx, `${d}m`, x + 16, by + 17, { color: FAINT });
      if (on) {
        drawText(ctx, 'DRIVING', x + w - 4, by + 17, { color: '#ffe9a8', align: 'right' });
      } else {
        drawNodeIcon(ctx, 'point', x + w - 8, by + 20, FAINT, 1);
      }
      if (hot) {
        this.hover = { title: c.name, body: c.def.desc };
        if (g.input.clicked) {
          g.input.clicked = false;
          if (on) this.release(); else this.drive(c);
        }
      }
    }
    this.scroll = clamp(this.scroll, 0, Math.max(0, row * (ch + gap) - h));
  }

  /**
   * The map. One long strip of the basin with everything you have found on it,
   * because the world is one long strip of the basin.
   */
  _mapTab(ctx, x, y, w, h) {
    const g = this.game;
    const span = 16000;                       // world units shown across
    if (this.mapX === null) this.mapX = g.crab.x;
    this.mapX = damp(this.mapX, g.crab.x, 0.02, 1 / 60);
    const cx = x + w / 2;
    const toX = (wx) => cx + (wx - this.mapX) * (w / span);

    ctx.fillStyle = 'rgba(14,10,7,0.9)';
    ctx.fillRect(x, y, w, h);
    // survey ruling, so the empty air over the basin still reads as a chart
    ctx.fillStyle = 'rgba(214,186,138,0.055)';
    for (let ry2 = y + 12; ry2 < y + h; ry2 += 9) ctx.fillRect(x, ry2, w, 1);

    // the band of country you are crossing, coloured by biome
    const bandH = 7;
    for (let i = 0; i < w; i += 4) {
      const wx = this.mapX + (i - w / 2) * (span / w);
      const b = biomeAt(wx);
      ctx.fillStyle = (b.sky && b.sky[2]) || '#8a5f38';
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + i, y, 4, bandH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(214,186,138,0.25)';
    ctx.fillRect(x, y + bandH, w, 1);
    drawText(ctx, biomeAt(this.mapX).name.toUpperCase(), cx, y + 1,
      { color: '#f2e4c2', align: 'center' });

    // the ground itself, sampled from the real terrain
    const gy = y + Math.round(h * 0.74);
    const here = g.terrain.surfaceY(this.mapX);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (let i = 0; i <= w; i += 2) {
      const wx = this.mapX + (i - w / 2) * (span / w);
      const sy = gy + (g.terrain.surfaceY(wx) - here) * 0.13;
      ctx.lineTo(x + i, clamp(sy, y + bandH + 10, y + h - 2));
    }
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(112,84,50,0.62)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,175,112,0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // distance ticks, every hundred metres
    for (let m = Math.floor((this.mapX - span / 2) / 2000) * 2000; m < this.mapX + span / 2; m += 2000) {
      const tx = toX(m);
      if (tx < x + 14 || tx > x + w - 14) continue;
      ctx.fillStyle = 'rgba(214,186,138,0.16)';
      ctx.fillRect(Math.round(tx), y + bandH + 2, 1, gy - y - bandH - 2);
      drawText(ctx, `${Math.round(m / 10)}m`, tx, gy + 3, { color: FAINT, align: 'center' });
    }

    // everything worth walking to
    const marks = g.world.marksNear(this.mapX, span);
    const labelled = [];
    for (const m of marks) {
      const mx = toX(m.x);
      if (mx < x - 6 || mx > x + w + 6) continue;
      const found = g.world.found.has(m.key);
      const col = m.kind === 'oasis' ? '#5fc6d8'
        : m.kind === 'ruin' ? '#d6ba8a'
          : m.kind === 'wreck' ? '#c39163'
            : m.kind === 'bonefield' ? '#c8c0ae' : '#e2b74a';
      const mxr = Math.round(mx);
      ctx.globalAlpha = found ? 1 : 0.40;
      ctx.fillStyle = 'rgba(20,14,9,0.85)';
      ctx.fillRect(mxr, gy - 15, 1, 15);
      ctx.fillStyle = col;
      switch (m.kind) {
        case 'oasis':
          ctx.beginPath(); ctx.arc(mxr, gy - 18, 3.2, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(mxr - 1, gy - 19, 1, 1);
          break;
        case 'ruin':
          ctx.fillRect(mxr - 4, gy - 20, 2, 6);
          ctx.fillRect(mxr - 1, gy - 23, 2, 9);
          ctx.fillRect(mxr + 2, gy - 19, 2, 5);
          ctx.fillRect(mxr - 5, gy - 14, 10, 1);
          break;
        case 'wreck':
          ctx.fillRect(mxr - 5, gy - 17, 10, 2);
          ctx.fillRect(mxr - 3, gy - 19, 7, 2);
          ctx.fillRect(mxr, gy - 26, 1, 7);
          ctx.fillRect(mxr + 1, gy - 25, 3, 3);
          break;
        case 'bonefield':
          ctx.fillRect(mxr - 4, gy - 17, 9, 1);
          ctx.fillRect(mxr - 3, gy - 20, 1, 3);
          ctx.fillRect(mxr, gy - 21, 1, 4);
          ctx.fillRect(mxr + 3, gy - 19, 1, 2);
          break;
        default:
          ctx.fillRect(mxr - 1, gy - 26, 3, 12);
          ctx.fillRect(mxr - 2, gy - 16, 5, 2);
      }
      ctx.globalAlpha = 1;
      const hot = Math.abs(this.game.input.sx - mx) < 8
        && this.game.input.sy > gy - 30 && this.game.input.sy < gy + 6;
      if (hot) {
        const d = Math.round(Math.abs(m.x - g.crab.x) / 10);
        this.hover = {
          title: found ? m.name : 'Something out there',
          body: found
            ? `${m.note}\n${d}m ${m.x > g.crab.x ? 'east' : 'west'}`
            : `${d}m ${m.x > g.crab.x ? 'east' : 'west'}. You have not stood in it.`,
        };
      }
      labelled.push({ mx, col, found, name: m.name, hot });
    }
    // labels last, thinned out so they never stack
    let lastX = -1e9;
    for (const L of labelled.sort((p, q) => p.mx - q.mx)) {
      if (!L.hot && L.mx - lastX < 52) continue;
      lastX = L.mx;
      drawText(ctx, L.found ? L.name : '?', L.mx, gy - 34,
        { color: L.found ? L.col : 'rgba(226,183,74,0.55)', align: 'center' });
    }

    // you
    const you = toX(g.crab.x);
    ctx.fillStyle = '#f2e4c2';
    ctx.fillRect(Math.round(you) - 2, gy - 9, 5, 2);
    ctx.fillRect(Math.round(you), gy - 7, 1, 7);
    ctx.fillRect(Math.round(you) - 3, gy - 11, 2, 2);
    ctx.fillRect(Math.round(you) + 2, gy - 11, 2, 2);

    drawText(ctx, `${g.world.found.size} places found`, x, y + h - 9, { color: FAINT });
    drawText(ctx, `${Math.round(g.crab.x / 10)}m from where you woke`, x + w, y + h - 9,
      { color: FAINT, align: 'right' });
  }

  // -- field notes ----------------------------------------------------------

  _codexTab(ctx, x, y, w, h) {
    const g = this.game;
    // They are her notes, in her notebook, in her hands. You have to be with
    // her to read them, which is the whole reason to keep her around.
    if (!g.vessClose) {
      const d = Math.round(Math.abs(g.npc.x - g.crab.x) / 10);
      drawText(ctx, 'HER NOTEBOOK IS NOT HERE', x, y + 6, { color: '#e2b74a' });
      wrapText(`The field notes are Dr. Vess's, and she is carrying them. Get to her - she is ${d}m ${g.npc.x > g.crab.x ? 'east' : 'west'} - and read over her shoulder.`, w - 4)
        .forEach((l, i) => drawText(ctx, l, x, y + 20 + i * LINE_H, { color: DIM }));
      wrapText('F calls her over. She will follow you, and ride on you once you are big enough to carry her.', w - 4)
        .forEach((l, i) => drawText(ctx, l, x, y + 62 + i * LINE_H, { color: FAINT }));
      return;
    }
    if (this.codexPick) return this._codexEntry(ctx, x, y, w, h);
    drawText(ctx, "VESS'S FIELD NOTES", x, y, { color: DIM });
    drawText(ctx, 'watch a thing for long enough and she writes it down', x, y + 9, { color: FAINT });
    let ry = y + 22 - this.scroll;
    let total = 0;

    // what she has worked out about the basin itself
    if (ry > y - 12 && ry < y + h) drawText(ctx, 'THE BASIN', x, ry, { color: '#7fd0dd' });
    ry += 11; total += 11;
    const found = g.world.found.size;
    for (const [name, body] of WORLD_NOTES) {
      const lines = wrapText(body, w - 6);
      if (ry > y - 30 && ry < y + h) {
        drawText(ctx, name, x + 2, ry, { color: INK });
        lines.forEach((l, i) => drawText(ctx, l, x + 2, ry + 9 + i * LINE_H, { color: FAINT }));
      }
      const dh = 11 + lines.length * LINE_H;
      ry += dh; total += dh;
    }
    ry += 4; total += 4;
    if (ry > y - 12 && ry < y + h) drawText(ctx, 'WHAT HAPPENED', x, ry, { color: '#e2b74a' });
    ry += 11; total += 11;
    ERAS.forEach((e, i) => {
      const open = found >= i * 2;
      const lines = wrapText(open ? e.text : 'Not pieced together yet.', w - 6);
      if (ry > y - 40 && ry < y + h) {
        drawText(ctx, open ? e.name : '???', x + 2, ry, { color: open ? INK : FAINT });
        lines.forEach((l, k) => drawText(ctx, l, x + 2, ry + 9 + k * LINE_H, { color: open ? DIM : FAINT }));
      }
      const dh = 11 + lines.length * LINE_H + 3;
      ry += dh; total += dh;
    });
    ry += 6; total += 6;
    for (const cl of CLADES) {
      const list = FAUNA.filter((f) => f.clade === cl.id);
      if (!list.length) continue;
      if (ry > y - 12 && ry < y + h) drawText(ctx, cl.name.toUpperCase(), x, ry, { color: '#e2b74a' });
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
          // a row of pips for how much she has written down
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
    drawText(ctx, '< back', x, y, { color: DIM });
    let ry = y + 14 - this.scroll;
    drawText(ctx, f.name, x, ry, { color: INK }); ry += 10;
    drawText(ctx, f.sci, x, ry, { color: FAINT }); ry += 12;
    const obs = g.research[f.id] || 0;
    const level = OBSERVE_STEPS.filter((s) => obs >= s).length;
    drawText(ctx, `${f.clade}   ${Math.round(obs)}s`, x, ry, { color: '#e2b74a' }); ry += 12;
    // what it wants, as things rather than as a sentence
    ry = this._wantRow(ctx, f, x, ry, w) + 4;
    wrapText(f.desc, w).forEach((l) => { drawText(ctx, l, x, ry, { color: DIM }); ry += LINE_H; });
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
      drawText(ctx, `watch ${Math.max(1, Math.round(next - obs))}s more`, x, ry, { color: FAINT });
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
    const narrow = W < 320;
    // up on the shell nothing moves and nothing acts, so none of this exists
    if (this.buildOn) { this.stickZone = null; this.stick = null; return; }
    const R = narrow ? 30 : 27;
    // in build mode the rail owns the left edge, so the stick steps aside
    const off = this.buildOn ? this.railW(W) + 4 : 0;
    const sx = 8 + off, sy = H - 2 * R - 10;
    this.stickZone = { x: off, y: H - 2 * R - 20, w: 2 * R + 26, h: 2 * R + 20 };
    const cx = this.stick ? this.stick.ox : sx + R;
    const cy = this.stick ? this.stick.oy : sy + R;
    // the ring, with a groove so it reads as a thing rather than a circle
    ctx.globalAlpha = this.stick ? 0.55 : 0.30;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = this.stick ? 0.22 : 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R - 5, 0, TAU); ctx.stroke();
    // two chevrons, because this stick only goes two ways
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = INK;
    for (const d of [-1, 1]) {
      const ax = cx + d * (R - 7);
      ctx.beginPath();
      ctx.moveTo(ax + d * 3, cy);
      ctx.lineTo(ax - d * 2, cy - 4);
      ctx.lineTo(ax - d * 2, cy + 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = this.stick ? 0.75 : 0.30;
    const dx = this.stick ? clamp(this.stick.x - this.stick.ox, -R, R) : 0;
    ctx.beginPath(); ctx.arc(cx + dx, cy, this.stick ? 11 : 10, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    // the buttons: only the live ones, stacked up the right edge above the
    // valve so a thumb never has to cross the spring to reach them
    // laid out along the bottom, right to left from the valve, wrapping up a
    // row rather than ever landing on the stick or on the spring
    const bw = narrow ? 58 : 52, bh = narrow ? 26 : 23;
    const v = this.valveRect;
    const rightEdge = (v ? v.x : W - 6) - 8;
    const leftEdge = (this.stickZone ? this.stickZone.x + this.stickZone.w : 0) + 6;
    const bottom = H - bh - 6;
    let bx = rightEdge - bw;
    let by = bottom;
    const add = (label, key, colour) => {
      if (bx < leftEdge) { bx = rightEdge - bw; by -= bh + 5; }
      this.buttons.push({ x: bx, y: by, w: bw, h: bh, key });
      const hot = this._hit(bx, by, bw, bh);
      ctx.globalAlpha = hot ? 0.95 : 0.80;
      ctx.fillStyle = 'rgba(46,34,22,0.92)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = 'rgba(88,66,42,0.9)';
      ctx.fillRect(bx, by, bw, 2);
      ctx.strokeStyle = colour || 'rgba(214,186,138,0.55)';
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.globalAlpha = 1;
      drawText(ctx, label, bx + bw / 2, by + (bh - 7) / 2,
        { color: colour || INK, align: 'center' });
      if (hot && this.game.input.clicked) {
        this.game.input.clicked = false;
        if (key) this.game.input.pulseVirtual(key);
      }
      bx -= bw + 6;
    };
    const hint = g.actionHint();
    if (g.garden.ripeCount) add(`PICK ${g.garden.ripeCount}`, 'r', '#cfe89a');
    if (hint) add('ACT', 'e');
    add('MODE', 'm');
    if (hint) {
      drawText(ctx, hint, rightEdge, by - 10,
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
    ctx.fillStyle = 'rgba(14,10,7,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(214,186,138,0.4)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (t.title) drawText(ctx, t.title, x + 5, y + 4, { color: INK });
    lines.forEach((l, k) => drawText(ctx, l, x + 5, y + (t.title ? 15 : 4) + k * LINE_H, { color: DIM }));
  }
}
