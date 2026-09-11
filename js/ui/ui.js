// CRABDEN - the interface, such as it is.
//
// There are no panels on the world screen. Water is a shell with water in it,
// nutrients are a flower that is either blooming or losing leaves, fruit is a
// sprig of fruit, and your genome is an orb on your own back that you can look
// into. Everything else lives in a drawer that slides out of the right edge
// when you want it and is not there when you do not.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { FLORA, FLORA_BY_ID, NEEDS_TEXT } from '../data/flora.js';
import { FAUNA, FAUNA_BY_ID, CLADES, OBSERVE_STEPS } from '../data/fauna.js';
import { BUILDINGS, BUILD_BY_ID, GENES, GENE_BY_ID, SKILL_BY_ID } from '../data/progress.js';
import { buildPlant } from '../art/floraart.js';
import { buildStructure } from '../art/buildart.js';
import { drawShell, drawBloom, drawSprig, drawOrb, drawTab, drawPanel, drawGlyph, drawValve, drawGauge } from './icons.js';
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
    this.selected = null;        // a commanded creature
    this.t = 0;
    this.bloomShown = 0;
    this.codexPick = null;
    this._installTouch();
  }

  say(text, secs = 3.6) { this.toast = text; this.toastT = secs; }

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

    const inTree = this.tree.update(dt, this.game.renderer.vw, this.game.renderer.vh);
    if (this.tree.diving) return;

    this.build = damp(this.build, this.buildOn ? 1 : 0, 0.0009, dt);
    if (i.justPressed('Tab')) { i.consumeKey('Tab'); this.toggleBuild(); }
    if (i.justPressed('b')) { i.consumeKey('b'); this.toggleBuild(); }
    if (i.justPressed('Escape')) {
      i.consumeKey('Escape');
      if (this.placing) { this.placing = null; this.say('Cancelled.'); }
      else if (this.drawerOpen) this.drawerOpen = false;
      else if (this.buildOn) this.toggleBuild();
      else if (this.driving) this.release();
    }
    // clicking the animal itself is how you get onto its back
    if (!this.buildOn && !this.drawerOpen && !this.placing && !this.driving
      && this.game.state === 'play' && i.clicked && this._overCrab()) {
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

  /**
   * Build mode: the camera comes in on the shell and the seeds come out down
   * the side. Everything you can do to your own back happens here, on your
   * own back, rather than in a shop.
   */
  toggleBuild() {
    const g = this.game;
    this.buildOn = !this.buildOn;
    this.drawerOpen = false;
    this.placing = null;
    if (this.buildOn) {
      this.savedZoom = g.cam.targetZoom;
      const want = clamp(g.renderer.vh * 0.42 / Math.max(18, g.crab.m.rx * 2.2), 2.2, 6);
      g.cam.targetZoom = clamp(want, g.cam.minZoom, g.cam.maxZoom);
      this.buildScroll = 0;
      this.say('Your back. Put something in it.', 3);
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
    const r = this.game.renderer;
    this.drawerOpen = false;
    this.placing = null;
    this.tree.open(r.vw - 17, 31, r.vw, r.vh);
  }

  _updatePlacing() {
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
      if (this.tree.dive > 0.5) return;
    }

    this._hud(ctx, W, H);
    if (this.build > 0.005) this._buildRail(ctx, W, H);
    if (this.placing) this._placingHud(ctx, W, H);
    if (this.drawer > 0.005) this._panel(ctx, W, H);
    else if (this.touchEnabled) this._touchControls(ctx, W, H);

    if (this.toast) {
      const lines = wrapText(this.toast, Math.min(220, W - 40));
      const w = Math.max(...lines.map((l) => textWidth(l))) + 4;
      const y = H - (this.touchEnabled ? 96 : 46) - (lines.length - 1) * LINE_H;
      lines.forEach((l, i) => drawText(ctx, l, W / 2, y + i * LINE_H,
        { color: INK, align: 'center', outline: true, outlineColor: OUT }));
    }
    if (this.hover) this._tooltip(ctx, W, H);
  }

  // -- HUD ------------------------------------------------------------------

  _hud(ctx, W, H) {
    const g = this.game;
    const e = g.economy;
    const maxW = e.stat('waterMax');
    // the build rail owns the left edge while it is out, so the readouts move
    // over rather than sitting underneath it and stealing its taps
    const L = this.buildOn ? this.railW(W) + 6 : 5;

    // water: a moulted shell with the water actually in it
    const sh = drawShell(ctx, L, 4, e.water / maxW, this.t);
    drawText(ctx, `${Math.round(e.water)}`, L + sh.w / 2, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(L, 4, sh.w, sh.h)) this.hover = { title: 'Spring', body: `${Math.round(e.water)} of ${Math.round(maxW)} water. Hold space to run it.` };

    // nutrients: a flower that blooms as you bank them and sheds when you spend
    const stage = clamp(Math.round(Math.pow(clamp01(this.bloomShown / 260), 0.62) * 8), 0, 8);
    const sway = Math.sin(this.t * 1.1) * 0.04 + (g.weather ? g.weather.windSpeed * 0.02 : 0);
    const bx = L + sh.w + 2;
    drawBloom(ctx, bx, 2, stage, sway);
    drawText(ctx, `${Math.round(e.nutrients)}`, bx + 17, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(bx, 2, 34, 40)) {
      this.hover = { title: 'Growth', body: `${Math.round(e.nutrients)} nutrients. The flower opens as you bank them and drops a leaf when you spend.` };
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
    if (this._hit(fx, 16, 26, 22)) this.hover = { title: 'Fruit', body: 'What your mature plants set. Animals will come a long way for it.' };

    // place, time, weather, and how much of the basin you have actually stood in
    const label = `${g.biome.name}   ${g.weather.label()}   ${String(Math.floor(g.weather.hour)).padStart(2, '0')}:00`;
    drawText(ctx, label, W - 6, 5, { color: DIM, align: 'right', outline: true, outlineColor: OUT });
    this._compass(ctx, W, H);

    // the gene orb: the way into the tree
    const ox = W - 32, oy = 16;
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
        const cx = W - 8 - (i + 1) * 8, cy = 46;
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
        this.hover = { title: 'Ready to pick', body: 'Nothing pays out on its own. Press R, or tap the bead over a plant.' };
        if (g.input.clicked) { g.input.clicked = false; g.harvestAll(); }
      }
    }

    // the spring: a valve you hold open, not a button you tap
    this._pumpButton(ctx, W, H);

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
    drawText(ctx, modeDef.name, 6, H - 20, { color: FAINT, outline: true, outlineColor: OUT });
    if (this._hit(4, H - 22, 34, 10)) {
      this.hover = { title: modeDef.name, body: modeDef.desc + '   (M to switch)' };
      if (this.game.input.clicked) { this.game.input.clicked = false; this.cycleMode(); }
    }

    const hint = g.actionHint();
    if (hint && !this.touchEnabled) {
      drawText(ctx, hint, W / 2, H - 30, { color: INK, align: 'center', outline: true, outlineColor: OUT });
    }
    if (!this.touchEnabled) {
      drawText(ctx, 'A/D move  SPACE spring  R pick  TAB build  1 map  2 fleet  3 notes  X parasite  G inside',
        W / 2, H - 10, { color: FAINT, align: 'center', outline: true, outlineColor: OUT });
    }
    if (this.selected) {
      drawText(ctx, `${this.selected.name} - click where to send it`, W / 2, H - 42,
        { color: '#ffe9a8', align: 'center', outline: true, outlineColor: OUT });
    }
  }

  /**
   * The pump. It is a valve in your own shell, so it is drawn as one, and it
   * behaves like one: hold it and it runs, let go and it shuts.
   */
  _pumpButton(ctx, W, H) {
    const g = this.game;
    const size = 34;
    const x = W - size - 8, y = H - size - (this.touchEnabled ? 70 : 26);
    const hold = g.pumpHold || 0;
    const hot = this._hit(x, y, size, size);
    const i = g.input;

    // held with a finger or the mouse as well as with the key; the game loop
    // does the actual pumping so both routes ramp and decay the same way
    if (hot && i.down && !this.drawerOpen && g.state === 'play') this._valveDown = true;
    if (!i.down) this._valveDown = false;
    this.valveHeld = this._valveDown;

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
    drawText(ctx, full ? 'SPILLING' : 'HOLD', x + size / 2, y + size + 1, {
      color: full ? '#9de3ee' : hold > 0 ? '#9de3ee' : FAINT,
      align: 'center', outline: true, outlineColor: OUT,
    });
    if (hot) {
      this.hover = { title: 'The spring', body: 'Hold to run it. It fills the tank, then the basin, then it goes over the side.' };
    }
  }

  /** A mark at the edge of the screen for the next place you have not been. */
  _compass(ctx, W, H) {
    const g = this.game;
    const lm = g.world.nextUnfound(g.crab.x);
    drawText(ctx, `${g.world.found.size} places found`, W - 6, 14,
      { color: FAINT, align: 'right', outline: true, outlineColor: OUT });
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
        wrapText(unlock.why, inW - 4).slice(0, 3).forEach((l, i) =>
          drawText(ctx, l, inX + 2, cy + 12 + i * LINE_H, { color: '#e2b74a' }));
      } else {
        drawText(ctx, isB ? `${def.cost}w ${def.nut}n` : `${def.cost} water`, inX + 2, cy + 12,
          { color: afford ? '#5fc6d8' : '#e08c9c' });
        if (!isB) {
          drawText(ctx, `+${def.pay} every ${Math.round(def.ripen)}s`, inX + 2, cy + 21, { color: '#8cc468' });
          const need = def.needs ? (NEEDS_TEXT[def.needs] || '') : `weighs ${def.mass.toFixed(1)}`;
          drawText(ctx, ellipsize(need, inW - 4), inX + 2, cy + 30, { color: FAINT });
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

    drawText(ctx, 'esc to climb down', inX, 2, { color: FAINT });
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
      if (hot && g.input.clicked) {
        g.input.clicked = false;
        this.pick = b.id;
        g.audio?.play('ui');
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
      wrapText('Nothing lives on you yet. Grow something worth the walk, then get close and offer it fruit and water.', w - 4)
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
      drawText(ctx, ellipsize(c.def.ability || c.def.role || '', w - 8), x + 6, by + 13, { color: FAINT });
      const d = Math.round(Math.abs(c.x - g.crab.x) / 10);
      drawText(ctx, `${d}m away`, x + 6, by + 23, { color: FAINT });
      drawText(ctx, on ? 'DRIVING' : 'click to drive', x + w - 4, by + 23,
        { color: on ? '#ffe9a8' : FAINT, align: 'right' });
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
    drawText(ctx, `${f.clade}   observed ${Math.round(obs)}s`, x, ry, { color: '#e2b74a' }); ry += 12;
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

  _touchControls(ctx, W, H) {
    const R = 26;
    // in build mode the rail owns the left edge, so the stick steps aside
    const off = this.buildOn ? this.railW(W) + 4 : 0;
    const sx = 6 + off, sy = H - 2 * R - 8;
    this.stickZone = { x: off, y: H - 2 * R - 16, w: 2 * R + 22, h: 2 * R + 16 };
    const cx = this.stick ? this.stick.ox : sx + R;
    const cy = this.stick ? this.stick.oy : sy + R;
    ctx.globalAlpha = this.stick ? 0.5 : 0.26;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.globalAlpha = this.stick ? 0.6 : 0.22;
    ctx.fillStyle = INK;
    const dx = this.stick ? clamp(this.stick.x - this.stick.ox, -R, R) : 0;
    ctx.beginPath(); ctx.arc(cx + dx, cy, this.stick ? 9 : 8, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;

    const add = (x, y, w, h, label, key) => {
      this.buttons.push({ x, y, w, h, key });
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = 'rgba(52,40,26,0.9)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(214,186,138,0.4)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.globalAlpha = 1;
      drawText(ctx, label, x + w / 2, y + (h - 7) / 2, { color: INK, align: 'center' });
      if (this._hit(x, y, w, h) && this.game.input.clicked) {
        this.game.input.clicked = false;
        if (key) this.game.input.pulseVirtual(key);
      }
    };
    const bw = 44, bh = 19;
    add(W - bw * 2 - 10, H - bh - 6, bw, bh, this.game.garden.ripeCount ? 'PICK' : '-', 'r');
    add(W - bw - 6, H - bh * 2 - 11, bw, bh, this.buildOn ? 'DOWN' : 'BUILD', 'Tab');
    add(W - bw * 2 - 10, H - bh * 2 - 11, bw, bh, 'MODE', 'm');
    add(W - bw - 6, H - bh * 3 - 16, bw, bh, this.game.actionHint() ? 'ACT' : '-', 'e');
    const hint = this.game.actionHint();
    if (hint) {
      drawText(ctx, hint, W - bw - 12 - 30, H - bh * 2 - 22,
        { color: INK, align: 'center', outline: true, outlineColor: OUT });
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
