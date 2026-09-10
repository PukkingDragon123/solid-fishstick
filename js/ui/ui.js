// CRABDEN - the interface, such as it is.
//
// There are no panels on the world screen. Water is a shell with water in it,
// nutrients are a flower that is either blooming or losing leaves, fruit is a
// sprig of fruit, and your genome is an orb on your own back that you can look
// into. Everything else lives in a drawer that slides out of the right edge
// when you want it and is not there when you do not.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { FLORA, FLORA_BY_ID } from '../data/flora.js';
import { FAUNA, FAUNA_BY_ID, CLADES, OBSERVE_STEPS } from '../data/fauna.js';
import { BUILDINGS, BUILD_BY_ID, GENES, GENE_BY_ID, SKILL_BY_ID } from '../data/progress.js';
import { buildPlant } from '../art/floraart.js';
import { buildStructure } from '../art/buildart.js';
import { drawShell, drawBloom, drawSprig, drawOrb, drawTab } from './icons.js';
import { TreeScreen } from './tree.js';
import { WORLD_NOTES, ERAS } from '../data/lore.js';

const INK = '#f2e4c2';
const DIM = 'rgba(240,226,192,0.66)';
const FAINT = 'rgba(240,226,192,0.36)';
const OUT = 'rgba(12,8,5,0.72)';

const TABS = [
  { id: 'flora', icon: 'flora', name: 'SEED' },
  { id: 'fauna', icon: 'fauna', name: 'LIFE' },
  { id: 'build', icon: 'build', name: 'BUILD' },
  { id: 'codex', icon: 'codex', name: 'FIELD' },
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
    this.drawer = 0;             // 0 closed, 1 open
    this.drawerOpen = false;
    this.tab = 'flora';
    this.scroll = 0;
    this.placing = null;         // { kind, id }
    this.ghostPlot = null;
    this.toast = null;
    this.toastT = 0;
    this.hover = null;
    this.buttons = [];
    this.stick = null;
    this.stickZone = null;
    this.mode = 'direct';
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

    if (i.justPressed('Tab')) { i.consumeKey('Tab'); this.drawerOpen = !this.drawerOpen; }
    if (i.justPressed('Escape')) {
      i.consumeKey('Escape');
      if (this.placing) { this.placing = null; this.say('Cancelled.'); }
      else if (this.drawerOpen) this.drawerOpen = false;
    }
    if (i.justPressed('g')) { i.consumeKey('g'); this._openTree(); }
    if (i.justPressed('m')) { i.consumeKey('m'); this.cycleMode(); }
    const keys = ['1', '2', '3', '4'];
    keys.forEach((k, n) => {
      if (i.justPressed(k)) {
        i.consumeKey(k);
        if (this.drawerOpen && this.tab === TABS[n].id) this.drawerOpen = false;
        else { this.drawerOpen = true; this.tab = TABS[n].id; this.scroll = 0; }
      }
    });
    if (this.drawerOpen && i.wheel) this.scroll = Math.max(0, this.scroll + i.wheel * 22);

    // placement follows the pointer over the shell
    if (this.placing) this._updatePlacing();
    // fleet mode: click a creature, then click the ground to send it
    if (this.mode === 'creature' && !this.drawerOpen) this._updateCommand();

    const b = this.game.economy.nutrients;
    this.bloomShown = damp(this.bloomShown, b, 0.05, dt);
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
    if (this.placing) this._placingHud(ctx, W, H);
    if (this.drawer > 0.005) this._drawer(ctx, W, H);
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

    // water: a moulted shell with the water actually in it
    const sh = drawShell(ctx, 5, 4, e.water / maxW, this.t);
    drawText(ctx, `${Math.round(e.water)}`, 5 + sh.w / 2, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(5, 4, sh.w, sh.h)) this.hover = { title: 'Spring', body: `${Math.round(e.water)} of ${Math.round(maxW)} water. Space to pump more up.` };

    // nutrients: a flower that blooms as you bank them and sheds when you spend
    const stage = clamp(Math.round(Math.pow(clamp01(this.bloomShown / 260), 0.62) * 8), 0, 8);
    const sway = Math.sin(this.t * 1.1) * 0.04 + (g.weather ? g.weather.windSpeed * 0.02 : 0);
    const bx = 5 + sh.w + 2;
    drawBloom(ctx, bx, 2, stage, sway);
    drawText(ctx, `${Math.round(e.nutrients)}`, bx + 17, 4 + sh.h - 1,
      { color: INK, align: 'center', outline: true, outlineColor: OUT });
    if (this._hit(bx, 2, 34, 40)) {
      this.hover = { title: 'Growth', body: `${Math.round(e.nutrients)} nutrients. The flower opens as you bank them and drops a leaf when you spend.` };
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
      drawText(ctx, 'A/D scuttle   SPACE spring   E act   TAB drawer   G genome   M mode',
        W / 2, H - 10, { color: FAINT, align: 'center', outline: true, outlineColor: OUT });
    }
    if (this.selected) {
      drawText(ctx, `${this.selected.name} - click where to send it`, W / 2, H - 42,
        { color: '#ffe9a8', align: 'center', outline: true, outlineColor: OUT });
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

  _drawer(ctx, W, H) {
    const dw = Math.min(196, Math.round(W * 0.46));
    const x = W - dw * this.drawer;
    const railW = 26;

    // the drawer itself: a hide stretched on a frame, not a dialog box
    ctx.fillStyle = 'rgba(28,20,13,0.96)';
    ctx.fillRect(x, 0, dw, H);
    ctx.fillStyle = 'rgba(58,42,26,0.9)';
    ctx.fillRect(x, 0, railW, H);
    ctx.strokeStyle = 'rgba(214,186,138,0.35)';
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + railW + 0.5, 0); ctx.lineTo(x + railW + 0.5, H); ctx.stroke();
    // stitching down the seam
    ctx.fillStyle = 'rgba(214,186,138,0.30)';
    for (let y = 4; y < H; y += 7) ctx.fillRect(x + railW - 1, y, 2, 3);

    TABS.forEach((t, i) => {
      const ty = 6 + i * 30;
      const on = this.tab === t.id;
      if (on) {
        ctx.fillStyle = 'rgba(96,74,44,0.95)';
        ctx.fillRect(x + 1, ty - 2, railW - 2, 26);
      }
      ctx.globalAlpha = on ? 1 : 0.55;
      drawTab(ctx, t.icon, x + 2, ty);
      ctx.globalAlpha = 1;
      if (this._hit(x + 1, ty - 2, railW - 2, 26)) {
        this.hover = { title: t.name, body: null };
        if (this.game.input.clicked) { this.game.input.clicked = false; this.tab = t.id; this.scroll = 0; }
      }
    });
    if (this._hit(x + 1, H - 26, railW - 2, 22)) {
      if (this.game.input.clicked) { this.game.input.clicked = false; this.drawerOpen = false; }
      this.hover = { title: 'Close', body: null };
    }
    drawText(ctx, 'X', x + railW / 2, H - 20, { color: DIM, align: 'center' });

    const cx = x + railW + 6, cw = dw - railW - 12;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 2, 0, cw + 4, H); ctx.clip();
    switch (this.tab) {
      case 'flora': this._floraTab(ctx, cx, 6, cw, H - 12); break;
      case 'fauna': this._faunaTab(ctx, cx, 6, cw, H - 12); break;
      case 'build': this._buildTab(ctx, cx, 6, cw, H - 12); break;
      case 'codex': this._codexTab(ctx, cx, 6, cw, H - 12); break;
      default: break;
    }
    ctx.restore();
  }

  _card(ctx, x, y, w, h, opts) {
    const hot = this._hit(x, y, w, h);
    ctx.fillStyle = opts.locked ? 'rgba(40,31,21,0.85)' : hot ? 'rgba(88,68,40,0.95)' : 'rgba(48,37,24,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = opts.accent || 'rgba(214,186,138,0.28)';
    ctx.fillRect(x, y, 2, h);
    if (hot && !opts.locked) {
      ctx.strokeStyle = 'rgba(242,228,194,0.55)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    return hot;
  }

  _floraTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, 'SEED STOCK', x, y, { color: DIM });
    drawText(ctx, 'what will grow on your back', x, y + 9, { color: FAINT });
    const ch = 40, gap = 3;
    let row = 0;
    for (const f of FLORA) {
      const by = y + 22 + row * (ch + gap) - this.scroll;
      row++;
      if (by > y + h || by + ch < y) continue;
      const unlock = g.unlockOf(f);
      const locked = !unlock.ok;
      const afford = g.economy.water >= f.cost;
      const hot = this._card(ctx, x, by, w, ch, { locked, accent: locked ? 'rgba(140,120,90,0.2)' : '#8cc468' });
      const art = buildPlant(f, locked ? 1 : 3, 0, 0.36);
      ctx.save();
      if (locked) ctx.globalAlpha = 0.30;
      ctx.drawImage(art.cv, x + 16 - art.ox, by + ch - 4 - art.oy);
      ctx.restore();
      const tx = x + 30;
      drawText(ctx, ellipsize(locked ? '???' : f.name, w - 34), tx, by + 4, { color: locked ? FAINT : INK });
      if (locked) {
        wrapText(unlock.why, w - 34).slice(0, 2).forEach((l, i) =>
          drawText(ctx, l, tx, by + 15 + i * LINE_H, { color: FAINT }));
      } else {
        drawText(ctx, `${f.cost}w`, tx, by + 14, { color: afford ? '#5fc6d8' : '#c8425c' });
        drawText(ctx, `+${f.yield.toFixed(2)}/s`, tx + 28, by + 14, { color: '#8cc468' });
        drawText(ctx, ellipsize(g.floraEffect(f), w - 34), tx, by + 24, { color: FAINT });
        drawText(ctx, `have ${g.garden.countOf(f.id)}`, tx, by + 32, { color: FAINT });
        if (f.needsPond) drawText(ctx, 'POOL', x + w - 4, by + 32, { color: '#5fc6d8', align: 'right' });
      }
      if (hot) {
        this.hover = locked
          ? { title: 'Locked', body: unlock.why }
          : { title: f.name, body: `${f.desc}\nBrings: ${(f.attracts || []).map((a) => FAUNA_BY_ID[a]?.name || a).join(', ')}` };
        if (!locked && g.input.clicked) {
          g.input.clicked = false;
          this.placing = { kind: 'flora', id: f.id };
          this.drawerOpen = false;
          this.say(`Choose a bed for the ${f.name.toLowerCase()}.`);
        }
      }
    }
    this.scroll = clamp(this.scroll, 0, Math.max(0, row * (ch + gap) - h + 30));
  }

  _faunaTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, 'WHAT MIGHT COME', x, y, { color: DIM });
    drawText(ctx, 'you cannot buy an animal. you can be worth the walk.', x, y + 9, { color: FAINT });
    const ch = 40, gap = 3;
    let row = 0;
    const list = FAUNA.filter((f) => !f.hostile);
    for (const f of list) {
      const by = y + 22 + row * (ch + gap) - this.scroll;
      row++;
      if (by > y + h || by + ch < y) continue;
      const seen = g.wildlife.seen.has(f.id);
      const pull = g.attraction(f);
      const here = g.wildlife.list.some((c) => c.def.id === f.id);
      const mine = g.wildlife.fleet.some((c) => c.def.id === f.id);
      const hot = this._card(ctx, x, by, w, ch, {
        accent: mine ? '#8cc468' : pull > 0.2 ? '#e2b74a' : 'rgba(140,120,90,0.25)',
      });
      drawText(ctx, ellipsize(seen ? f.name : '???', w - 8), x + 6, by + 4,
        { color: seen ? INK : FAINT });
      drawText(ctx, mine ? 'WITH YOU' : here ? 'NEARBY' : '', x + w - 4, by + 4,
        { color: mine ? '#b6de8f' : '#e2b74a', align: 'right' });
      const need = g.attractNeeds(f);
      wrapText(need, w - 10).slice(0, 2).forEach((l, i) =>
        drawText(ctx, l, x + 6, by + 14 + i * LINE_H, { color: FAINT }));
      // how close you are to being interesting to it
      const bw = w - 12;
      ctx.fillStyle = 'rgba(16,12,8,0.7)';
      ctx.fillRect(x + 6, by + ch - 8, bw, 4);
      ctx.fillStyle = pull > 0.6 ? '#8cc468' : pull > 0.2 ? '#e2b74a' : '#7a6a52';
      ctx.fillRect(x + 6, by + ch - 8, Math.round(bw * clamp01(pull)), 4);
      if (hot) this.hover = { title: seen ? f.name : 'Unrecorded', body: seen ? f.desc : 'You have not seen one of these yet.' };
    }
    this.scroll = clamp(this.scroll, 0, Math.max(0, row * (ch + gap) - h + 30));
  }

  _buildTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, 'BUILD ON YOURSELF', x, y, { color: DIM });
    drawText(ctx, 'permanent, and visible from a dune away', x, y + 9, { color: FAINT });
    const ch = 36, gap = 3;
    let row = 0;
    for (const b of BUILDINGS) {
      const by = y + 22 + row * (ch + gap) - this.scroll;
      row++;
      if (by > y + h || by + ch < y) continue;
      const built = g.garden.plots.some((p) => p.build && p.build.id === b.id);
      const ok = g.economy.canBuild(b.id);
      const hot = this._card(ctx, x, by, w, ch, { accent: built ? '#8cc468' : ok ? '#e2b74a' : 'rgba(140,120,90,0.25)' });
      const art = buildStructure(b, 0.38);
      ctx.drawImage(art.cv, x + 15 - art.ox, by + ch - 3 - art.oy);
      drawText(ctx, ellipsize(b.name, w - 34), x + 28, by + 4, { color: INK });
      drawText(ctx, `${b.cost}w ${b.nut}n`, x + 28, by + 14, { color: ok ? '#5fc6d8' : '#c8425c' });
      drawText(ctx, built ? 'STANDING' : 'tap to place', x + 28, by + 24,
        { color: built ? '#b6de8f' : FAINT });
      if (hot) {
        this.hover = { title: b.name, body: b.desc };
        if (g.input.clicked) {
          g.input.clicked = false;
          this.placing = { kind: 'build', id: b.id };
          this.drawerOpen = false;
          this.say(`Choose a spot for the ${b.name.toLowerCase()}.`);
        }
      }
    }
    this.scroll = clamp(this.scroll, 0, Math.max(0, row * (ch + gap) - h + 30));
  }

  // -- field notes ----------------------------------------------------------

  _codexTab(ctx, x, y, w, h) {
    const g = this.game;
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
    const sx = 6, sy = H - 2 * R - 8;
    this.stickZone = { x: 0, y: H - 2 * R - 16, w: 2 * R + 22, h: 2 * R + 16 };
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
    add(W - bw - 6, H - bh - 6, bw, bh, 'SPRING', ' ');
    add(W - bw * 2 - 10, H - bh - 6, bw, bh, this.game.actionHint() ? 'ACT' : '-', 'e');
    add(W - bw - 6, H - bh * 2 - 11, bw, bh, 'DRAWER', 'Tab');
    add(W - bw * 2 - 10, H - bh * 2 - 11, bw, bh, 'MODE', 'm');
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
