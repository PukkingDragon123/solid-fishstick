// CRABDEN - heads-up display, panels and on-screen controls.
//
// Immediate mode: widgets hit-test the pointer as they draw, which works
// because input.endFrame() runs after the frame is drawn. The same code path
// serves mouse and touch - the on-screen controls press virtual keys, and
// nothing downstream knows the difference.

import { clamp, clamp01, lerp, TAU } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { FLORA, FLORA_BY_ID, STAGE_NAME } from '../data/flora.js';
import { FAUNA, FAUNA_BY_ID } from '../data/fauna.js';
import { SKILLS, SKILL_BY_ID, BRANCHES, EVOLUTIONS, BUILDINGS, GENES, GENE_BY_ID } from '../data/progress.js';
import { buildPlant } from '../art/floraart.js';
import { buildStructure } from '../art/buildart.js';

const C = {
  ink: '#f2e4c2', dim: 'rgba(238,222,186,0.62)', faint: 'rgba(238,222,186,0.34)',
  panel: 'rgba(22,16,11,0.975)', panelEdge: 'rgba(226,200,150,0.40)',
  bar: '#5fc6d8', bar2: '#8cc468', bar3: '#e2b74a', bad: '#c8425c',
  btn: 'rgba(52,40,26,0.90)', btnHot: 'rgba(96,74,44,0.95)', btnOn: 'rgba(120,150,80,0.9)',
};

const TABS = [
  { id: 'plant', name: 'PLANT', key: '1' },
  { id: 'build', name: 'BUILD', key: '2' },
  { id: 'skills', name: 'SKILL', key: '3' },
  { id: 'evolve', name: 'EVOLVE', key: '4' },
  { id: 'fleet', name: 'FLEET', key: '5' },
  { id: 'codex', name: 'CODEX', key: '6' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.open = null;
    this.tab = 'plant';
    this.scroll = 0;
    this.sel = null;
    this.toast = null;
    this.toastT = 0;
    this.hover = null;
    this.touch = false;
    this.stick = null;
    this.buttons = [];
    this._installTouch();
  }

  say(text, secs = 3.6) { this.toast = text; this.toastT = secs; }

  // -- on-screen controls ---------------------------------------------------

  _installTouch() {
    const i = this.game.input;
    i.claimHandler = (p) => {
      if (!this.touchEnabled) return null;
      // explicit buttons win over the stick's generous grab radius
      for (const b of this.buttons) {
        if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) {
          if (b.key) i.pulseVirtual(b.key);
          if (b.hold) i.setVirtual(b.hold, true);
          b.flash = 1;
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
      if (!p.control) return;
      if (p.control.kind === 'stick' && this.stick) {
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
    const s = this.stick;
    const dx = clamp((s.x - s.ox) / 26, -1, 1);
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

  // -- frame ----------------------------------------------------------------

  update(dt) {
    const i = this.game.input;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
    if (i.justPressed('Tab')) { i.consumeKey('Tab'); this.toggle(this.tab); }
    if (i.justPressed('Escape')) { i.consumeKey('Escape'); if (this.open) this.open = null; }
    if (!this.open) {
      for (const t of TABS) {
        if (i.justPressed(t.key)) { i.consumeKey(t.key); this.toggle(t.id); }
      }
    } else {
      for (const t of TABS) {
        if (i.justPressed(t.key)) { i.consumeKey(t.key); this.tab = t.id; this.scroll = 0; }
      }
      if (i.wheel) { this.scroll = Math.max(0, this.scroll + i.wheel * 22); }
    }
  }

  toggle(tab) {
    if (this.open && this.tab === tab) { this.open = null; return; }
    this.open = true; this.tab = tab; this.scroll = 0;
  }

  // -- widgets --------------------------------------------------------------

  _hit(x, y, w, h) {
    const i = this.game.input;
    return i.sx >= x && i.sx <= x + w && i.sy >= y && i.sy <= y + h;
  }

  btn(ctx, x, y, w, h, label, opts = {}) {
    const hot = this._hit(x, y, w, h);
    const on = opts.on;
    const dis = opts.disabled;
    ctx.fillStyle = dis ? 'rgba(40,32,22,0.75)' : on ? C.btnOn : hot ? C.btnHot : C.btn;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = dis ? 'rgba(150,130,100,0.16)' : hot ? 'rgba(240,220,170,0.65)' : C.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    drawText(ctx, label, x + w / 2, y + (h - 7) / 2 + 1, {
      color: dis ? 'rgba(230,214,180,0.35)' : opts.color || C.ink, align: 'center', scale: opts.scale || 1,
    });
    if (hot && !dis) this.hover = opts.tip || null;
    const clicked = hot && !dis && this.game.input.clicked;
    if (clicked) this.game.input.clicked = false;
    return clicked;
  }

  frame(ctx, x, y, w, h, title) {
    ctx.fillStyle = C.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.panelEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (title) {
      ctx.fillStyle = 'rgba(226,200,150,0.14)';
      ctx.fillRect(x + 1, y + 1, w - 2, 11);
      drawText(ctx, title, x + 5, y + 3, { color: C.ink });
    }
  }

  bar(ctx, x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(16,12,8,0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * clamp01(frac))), h - 2);
    ctx.strokeStyle = 'rgba(226,200,150,0.28)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (label) drawText(ctx, label, x + w / 2, y + (h - 7) / 2, { color: '#120d07', align: 'center' });
  }

  // -- HUD ------------------------------------------------------------------

  draw(ctx, r) {
    const g = this.game;
    this.hover = null;
    this.buttons.length = 0;
    // the stick's grab zone only exists on frames that actually draw it,
    // otherwise a stale zone swallows taps meant for the panel
    this.stickZone = null;
    const W = r.vw, H = r.vh;

    this._hud(ctx, W, H);
    if (this.open) this._panel(ctx, W, H);
    else if (this.touchEnabled) this._touchControls(ctx, W, H);

    if (this.toast) {
      const w = Math.min(W - 24, textWidth(this.toast) + 16);
      const x = (W - w) / 2, y = H - (this.touchEnabled ? 94 : 42);
      ctx.fillStyle = 'rgba(20,15,10,0.86)';
      ctx.fillRect(x, y, w, 13);
      ctx.strokeStyle = C.panelEdge;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 12);
      drawText(ctx, this.toast, x + w / 2, y + 3, { color: C.ink, align: 'center' });
    }
    if (this.hover) {
      const lines = wrapText(this.hover, 150);
      const w = Math.min(160, Math.max(...lines.map((l) => textWidth(l))) + 10);
      const h = lines.length * LINE_H + 6;
      let x = clamp(g.input.sx + 8, 2, W - w - 2);
      let y = clamp(g.input.sy - h - 4, 2, H - h - 2);
      ctx.fillStyle = 'rgba(14,10,7,0.94)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = C.panelEdge;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      lines.forEach((l, i) => drawText(ctx, l, x + 5, y + 4 + i * LINE_H, { color: C.dim }));
    }
  }

  _hud(ctx, W, H) {
    const g = this.game;
    const e = g.economy;
    const maxW = e.stat('waterMax');

    ctx.fillStyle = 'rgba(18,13,9,0.66)';
    ctx.fillRect(0, 0, 122, 38);

    drawText(ctx, 'WATER', 4, 4, { color: C.faint });
    this.bar(ctx, 32, 3, 44, 8, e.water / maxW, C.bar);
    drawText(ctx, `${Math.round(e.water)}/${Math.round(maxW)}`, 79, 4, { color: C.ink });

    drawText(ctx, 'NUTRI', 4, 14, { color: C.faint });
    this.bar(ctx, 32, 13, 44, 8, clamp01(e.nutrients / 300), C.bar2);
    drawText(ctx, `${Math.round(e.nutrients)}`, 79, 14, { color: C.ink });

    drawText(ctx, 'FRUIT', 4, 24, { color: C.faint });
    this.bar(ctx, 32, 23, 20, 6, clamp01(e.berries / 20), C.bar3);
    drawText(ctx, `${e.berries}`, 55, 24, { color: C.ink });
    drawText(ctx, 'POND', 70, 24, { color: C.faint });
    this.bar(ctx, 94, 23, 24, 6, g.garden.pond, '#37a7bd');
    drawText(ctx, `plots ${g.garden.planted.length}/${g.garden.unlockedCount}`, 4, 31, { color: C.faint });

    // place and time: top right when there is room, under the bars when not
    const wlabel = `${g.biome.name}  ${g.weather.label()}  ${String(Math.floor(g.weather.hour)).padStart(2, '0')}:00`;
    const narrow = textWidth(wlabel) > W - 132;
    const ox = narrow ? 4 : W - 4;
    const oy = narrow ? 40 : 4;
    const oal = narrow ? 'left' : 'right';
    drawText(ctx, wlabel, ox, oy, { color: C.dim, align: oal, outline: true, outlineColor: 'rgba(0,0,0,0.55)' });
    drawText(ctx, `genes ${e.genes.size}/${GENES.length}`, ox, oy + 9,
      { color: C.faint, align: oal, outline: true, outlineColor: 'rgba(0,0,0,0.55)' });

    // fleet strip
    const fleet = g.wildlife.fleet;
    if (fleet.length) {
      const fy = narrow ? oy + 19 : 22;
      let fx = narrow ? 4 : W - 4;
      for (let i = 0; i < Math.min(8, fleet.length); i++) {
        const c = fleet[i];
        const bx = narrow ? fx + i * 9 : fx - (i + 1) * 9;
        ctx.fillStyle = c.onShell ? 'rgba(140,196,104,0.9)' : 'rgba(226,183,74,0.85)';
        ctx.fillRect(bx, fy, 7, 7);
        if (this._hit(bx, fy, 7, 7)) this.hover = `${c.def.name} - ${c.def.ability || c.def.role}`;
      }
      drawText(ctx, g.wildlife.orders.toUpperCase(), ox, fy + 9,
        { color: C.faint, align: oal, outline: true, outlineColor: 'rgba(0,0,0,0.55)' });
    }

    // hp, only when it matters
    const crab = g.crab;
    if (crab.hp < crab.hpMax) {
      this.bar(ctx, 4, H - 12, 78, 6, crab.hp / crab.hpMax, C.bad, `${Math.round(crab.hp)}`);
    }

    // encounter / action prompt
    const hint = g.actionHint();
    if (hint && !this.touchEnabled) {
      const w = textWidth(hint) + 14;
      const x = (W - w) / 2;
      ctx.fillStyle = 'rgba(20,15,10,0.8)';
      ctx.fillRect(x, H - 27, w, 12);
      ctx.strokeStyle = C.panelEdge;
      ctx.strokeRect(x + 0.5, H - 26.5, w - 1, 11);
      drawText(ctx, hint, x + w / 2, H - 24, { color: C.ink, align: 'center' });
    }

    if (!this.touchEnabled) {
      drawText(ctx, 'A/D walk   SPACE pump   E act   1-6 panels   TAB menu', W / 2, H - 9,
        { color: C.faint, align: 'center' });
    }
  }

  // -- touch ----------------------------------------------------------------

  _touchControls(ctx, W, H) {
    const R = 26;
    const sx = 6, sy = H - 2 * R - 8;
    this.stickZone = { x: 0, y: H - 2 * R - 16, w: 2 * R + 22, h: 2 * R + 16 };

    const cx = this.stick ? this.stick.ox : sx + R;
    const cy = this.stick ? this.stick.oy : sy + R;
    ctx.globalAlpha = this.stick ? 0.55 : 0.30;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    if (this.stick) {
      const dx = clamp(this.stick.x - this.stick.ox, -R, R);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(cx + dx, cy, 9, 0, TAU); ctx.fill();
    } else {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const add = (x, y, w, h, label, key, hold, on) => {
      const b = { x, y, w, h, label, key, hold, on };
      this.buttons.push(b);
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = on ? C.btnOn : C.btn;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = C.panelEdge;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.globalAlpha = 1;
      drawText(ctx, label, x + w / 2, y + (h - 7) / 2, { color: C.ink, align: 'center' });
      // mouse users can click these too
      if (this._hit(x, y, w, h) && this.game.input.clicked) {
        this.game.input.clicked = false;
        if (key) this.game.input.pulseVirtual(key);
      }
    };

    const bw = 46, bh = 20;
    add(W - bw - 6, H - bh - 6, bw, bh, 'PUMP', ' ');
    const hint = this.game.actionHint();
    add(W - bw * 2 - 12, H - bh - 6, bw, bh, hint ? 'ACT' : '-', 'e');
    add(W - bw - 6, H - bh * 2 - 12, bw, bh, 'MENU', 'Tab');
    if (hint) {
      const w = textWidth(hint) + 12;
      drawText(ctx, hint, W - bw - 12 - w / 2, H - bh * 2 - 24, { color: C.ink, align: 'center', outline: true });
    }
  }

  // -- panels ---------------------------------------------------------------

  _panel(ctx, W, H) {
    ctx.fillStyle = 'rgba(8,5,4,0.72)';
    ctx.fillRect(0, 0, W, H);
    const px = 6, py = 6, pw = W - 12, ph = H - 12;
    this.frame(ctx, px, py, pw, ph);

    // tab rail
    const tw = 46;
    for (let i = 0; i < TABS.length; i++) {
      const t = TABS[i];
      const y = py + 14 + i * 18;
      if (this.btn(ctx, px + 5, y, tw, 15, t.name, { on: this.tab === t.id })) {
        this.tab = t.id; this.scroll = 0;
      }
    }
    if (this.btn(ctx, px + 5, py + ph - 20, tw, 15, 'CLOSE')) this.open = null;

    const cx = px + tw + 12, cy = py + 6, cw = pw - tw - 18, ch = ph - 12;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, cw, ch);
    ctx.clip();
    switch (this.tab) {
      case 'plant': this._plantTab(ctx, cx, cy, cw, ch); break;
      case 'build': this._buildTab(ctx, cx, cy, cw, ch); break;
      case 'skills': this._skillTab(ctx, cx, cy, cw, ch); break;
      case 'evolve': this._evoTab(ctx, cx, cy, cw, ch); break;
      case 'fleet': this._fleetTab(ctx, cx, cy, cw, ch); break;
      case 'codex': this._codexTab(ctx, cx, cy, cw, ch); break;
      default: break;
    }
    ctx.restore();
  }

  _plantTab(ctx, x, y, w, h) {
    const g = this.game;
    const tier = this._tier();
    drawText(ctx, 'SEED STOCK - water buys it, your shell grows it', x, y, { color: C.dim });
    const cardW = 92, cardH = 42, gap = 4;
    const cols = Math.max(1, Math.floor((w + gap) / (cardW + gap)));
    FLORA.forEach((f, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = x + col * (cardW + gap);
      const by = y + 12 + row * (cardH + gap) - this.scroll;
      if (by > y + h || by + cardH < y) return;
      const known = f.tier <= tier;
      const afford = g.economy.water >= f.cost;
      const plot = g.garden.freeFor(f);
      const ok = known && afford && plot && (!f.needsPond || g.garden.pond > 0.35);
      const hot = this._hit(bx, by, cardW, cardH);
      ctx.fillStyle = hot && known ? C.btnHot : 'rgba(38,29,19,0.95)';
      ctx.fillRect(bx, by, cardW, cardH);
      ctx.strokeStyle = ok ? 'rgba(140,196,104,0.6)' : known ? C.panelEdge : 'rgba(150,130,100,0.16)';
      ctx.strokeRect(bx + 0.5, by + 0.5, cardW - 1, cardH - 1);
      // icon well
      ctx.fillStyle = 'rgba(14,10,7,0.6)';
      ctx.fillRect(bx + 1, by + 1, 26, cardH - 2);
      const art = buildPlant(f, known ? 3 : 1, 0, 0.40);
      ctx.save();
      if (!known) ctx.globalAlpha = 0.32;
      ctx.drawImage(art.cv, bx + 14 - art.ox, by + cardH - 4 - art.oy);
      ctx.restore();
      const tx = bx + 30;
      drawText(ctx, ellipsize(known ? f.name : '???', cardW - 34), tx, by + 4,
        { color: known ? (ok ? C.ink : C.dim) : C.faint });
      if (known) {
        drawText(ctx, `${f.cost}w`, tx, by + 13, { color: afford ? C.bar : C.bad });
        drawText(ctx, `+${f.yield.toFixed(2)}n`, tx + 26, by + 13, { color: C.bar2 });
        const gene = GENE_BY_ID[f.gene];
        drawText(ctx, ellipsize(gene ? gene.name : f.gene, cardW - 34), tx, by + 22, { color: C.faint });
        drawText(ctx, `owned ${g.garden.countOf(f.id)}`, tx, by + 31, { color: C.faint });
        if (f.needsPond) drawText(ctx, 'POOL', bx + cardW - 4, by + 31, { color: '#5fc6d8', align: 'right' });
      } else {
        drawText(ctx, `tier ${f.tier}`, tx, by + 15, { color: C.faint });
        drawText(ctx, 'more genes', tx, by + 26, { color: C.faint });
      }
      if (hot) {
        this.hover = known
          ? `${f.desc}  Attracts: ${(f.attracts || []).map((a) => FAUNA_BY_ID[a]?.name || a).join(', ')}`
          : `Locked. Express more genes to unlock tier ${f.tier} seeds.`;
        if (known && g.input.clicked) {
          g.input.clicked = false;
          this.say(g.tryPlant(f.id));
        }
      }
    });
    const rows = Math.ceil(FLORA.length / cols);
    this.scroll = clamp(this.scroll, 0, Math.max(0, rows * (cardH + gap) - h + 16));
  }

  _tier() {
    const n = this.game.economy.genes.size;
    return n >= 10 ? 4 : n >= 7 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
  }

  _buildTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, 'STRUCTURES - built into the shell, permanent', x, y, { color: C.dim });
    const cardW = 124, cardH = 34, gap = 4;
    const cols = Math.max(1, Math.floor((w + gap) / (cardW + gap)));
    BUILDINGS.forEach((b, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = x + col * (cardW + gap), by = y + 12 + row * (cardH + gap) - this.scroll;
      if (by > y + h || by + cardH < y) return;
      const ok = g.economy.canBuild(b.id);
      const built = g.garden.plots.some((p) => p.build && p.build.id === b.id);
      const hot = this._hit(bx, by, cardW, cardH);
      ctx.fillStyle = hot ? C.btnHot : 'rgba(38,29,19,0.9)';
      ctx.fillRect(bx, by, cardW, cardH);
      ctx.strokeStyle = built ? 'rgba(140,196,104,0.6)' : ok ? 'rgba(226,183,74,0.5)' : C.panelEdge;
      ctx.strokeRect(bx + 0.5, by + 0.5, cardW - 1, cardH - 1);
      const art = buildStructure(b, 0.45);
      ctx.drawImage(art.cv, bx + 14 - art.ox, by + cardH - 3 - art.oy);
      drawText(ctx, b.name, bx + 28, by + 4, { color: ok || built ? C.ink : C.faint });
      drawText(ctx, `${b.cost}w  ${b.nut}n`, bx + 28, by + 14, { color: ok ? C.bar : C.bad });
      drawText(ctx, built ? 'BUILT' : 'tap to build', bx + 28, by + 24, { color: built ? C.bar2 : C.faint });
      if (hot) {
        this.hover = b.desc;
        if (g.input.clicked) { g.input.clicked = false; this.say(g.tryBuild(b.id)); }
      }
    });
    this.scroll = clamp(this.scroll, 0, Math.max(0, Math.ceil(BUILDINGS.length / cols) * (cardH + gap) - h + 16));
  }

  _skillTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, `SKILLS - ${Math.round(g.economy.nutrients)} nutrients banked`, x, y, { color: C.dim });
    const colW = w / BRANCHES.length;
    const halfW = Math.floor((colW - 9) / 2);
    const fullW = colW - 6;
    const nodeH = 20, stepY = 26;
    const laneW = (s2) => (s2.y === 0 ? fullW : halfW);
    const top = y + 24;
    BRANCHES.forEach((br, bi) => {
      const bx = x + bi * colW;
      drawText(ctx, br.name, bx + colW / 2, y + 12, { color: br.color, align: 'center' });
      const at = (s2) => ({
        x: bx + 3 + (s2.y > 0 ? halfW + 3 : 0),
        y: top + s2.x * stepY - this.scroll,
        w: laneW(s2),
      });
      for (const s2 of SKILLS) {
        if (s2.branch !== br.id) continue;
        const n = at(s2);
        for (const rq of s2.req) {
          const p = SKILL_BY_ID[rq];
          if (!p) continue;
          const q = at(p);
          ctx.strokeStyle = g.economy.skills.has(s2.id) ? br.color : 'rgba(226,200,150,0.20)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(q.x + q.w / 2, q.y + nodeH);
          ctx.lineTo(n.x + n.w / 2, n.y);
          ctx.stroke();
        }
      }
      for (const s2 of SKILLS) {
        if (s2.branch !== br.id) continue;
        const n = at(s2);
        const st = g.economy.skillState(s2.id);
        const hot = this._hit(n.x, n.y, n.w, nodeH);
        ctx.fillStyle = st === 'owned' ? 'rgba(66,92,44,0.95)'
          : st === 'ready' ? (hot ? C.btnHot : 'rgba(58,46,28,0.96)') : 'rgba(32,25,18,0.95)';
        ctx.fillRect(n.x, n.y, n.w, nodeH);
        ctx.strokeStyle = st === 'owned' ? br.color : st === 'locked' ? 'rgba(150,130,100,0.20)' : C.panelEdge;
        ctx.strokeRect(n.x + 0.5, n.y + 0.5, n.w - 1, nodeH - 1);
        drawText(ctx, ellipsize(s2.name, n.w - 6), n.x + 3, n.y + 3,
          { color: st === 'locked' ? C.faint : C.ink });
        drawText(ctx, st === 'owned' ? 'learned' : `${s2.cost}n`, n.x + 3, n.y + 12,
          { color: st === 'ready' ? C.bar2 : st === 'costly' ? C.bad : C.faint });
        if (hot) {
          this.hover = st === 'locked'
            ? `${s2.desc}  (needs ${s2.req.map((r) => SKILL_BY_ID[r].name).join(', ')})`
            : s2.desc;
          if (g.input.clicked) {
            g.input.clicked = false;
            if (g.economy.buySkill(s2.id)) this.say(`${s2.name} learned.`);
            else this.say(st === 'locked' ? 'An earlier skill first.' : 'Not enough nutrients.');
          }
        }
      }
    });
    this.scroll = clamp(this.scroll, 0, Math.max(0, 4 * stepY + 30 - h));
  }

  _evoTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, 'EVOLUTION - genes come from what lives on you', x, y, { color: C.dim });
    const rowH = 34;
    EVOLUTIONS.forEach((e, i) => {
      const by = y + 12 + i * (rowH + 3) - this.scroll;
      if (by > y + h || by + rowH < y) return;
      const st = g.economy.evoState(e.id);
      const hot = this._hit(x, by, w, rowH);
      ctx.fillStyle = st === 'owned' ? 'rgba(64,90,44,0.85)' : hot ? C.btnHot : 'rgba(38,29,19,0.9)';
      ctx.fillRect(x, by, w, rowH);
      ctx.strokeStyle = st === 'ready' ? '#8cc468' : C.panelEdge;
      ctx.strokeRect(x + 0.5, by + 0.5, w - 1, rowH - 1);
      drawText(ctx, e.name, x + 5, by + 4, { color: st === 'locked' ? C.faint : C.ink });
      drawText(ctx, `${e.nutrients}n`, x + w - 5, by + 4,
        { color: g.economy.nutrients >= e.nutrients ? C.bar2 : C.bad, align: 'right' });
      drawText(ctx, ellipsize(e.desc, w - 12), x + 5, by + 13, { color: C.dim });
      let gx = x + 5;
      for (const gid of e.genes) {
        const have = g.economy.genes.has(gid);
        const gn = GENE_BY_ID[gid];
        const label = (gn ? gn.name : gid).toUpperCase();
        const gw = textWidth(label) + 6;
        ctx.fillStyle = have ? 'rgba(140,196,104,0.35)' : 'rgba(200,66,92,0.22)';
        ctx.fillRect(gx, by + 22, gw, 9);
        drawText(ctx, label, gx + 3, by + 23, { color: have ? '#b6de8f' : '#e08c9c' });
        if (this._hit(gx, by + 22, gw, 9) && gn) this.hover = `${gn.name}: ${gn.desc}  (from ${gn.from})`;
        gx += gw + 3;
      }
      if (st === 'owned') drawText(ctx, 'EVOLVED', x + w - 5, by + 23, { color: '#b6de8f', align: 'right' });
      if (hot && g.input.clicked) {
        g.input.clicked = false;
        if (g.economy.evolve(e.id)) this.say(`You are ${e.name} now.`);
        else if (st === 'genes') this.say(`Missing: ${g.economy.missingGenes(e.genes).map((k) => GENE_BY_ID[k]?.name || k).join(', ')}`);
        else if (st === 'locked') this.say('An earlier evolution first.');
        else if (st !== 'owned') this.say('Not enough nutrients.');
      }
    });
    this.scroll = clamp(this.scroll, 0, Math.max(0, EVOLUTIONS.length * (rowH + 3) - h + 16));
  }

  _fleetTab(ctx, x, y, w, h) {
    const g = this.game;
    const fleet = g.wildlife.fleet;
    drawText(ctx, `FLEET ${fleet.length}/${g.economy.stat('fleetSlots')}`, x, y, { color: C.dim });
    const orders = [['follow', 'FOLLOW'], ['guard', 'GUARD'], ['ride', 'RIDE']];
    const canOrder = g.economy.stat('orders');
    orders.forEach((o, i) => {
      if (this.btn(ctx, x + w - 150 + i * 50, y - 2, 46, 12, o[1],
        { on: g.wildlife.orders === o[0], disabled: !canOrder,
          tip: canOrder ? null : 'Learn Command in the skill tree.' })) {
        g.wildlife.setOrders(o[0]);
        this.say(`Fleet: ${o[1].toLowerCase()}.`);
      }
    });
    if (!fleet.length) {
      const lines = wrapText('Nothing has joined you yet. Grow something worth walking across a desert for, then get close to whatever comes and offer it fruit.', w - 8);
      lines.forEach((l, i) => drawText(ctx, l, x + 4, y + 22 + i * LINE_H, { color: C.faint }));
      return;
    }
    const rowH = 26;
    fleet.forEach((c, i) => {
      const by = y + 14 + i * (rowH + 2) - this.scroll;
      if (by > y + h || by + rowH < y) return;
      const hot = this._hit(x, by, w, rowH);
      ctx.fillStyle = hot ? C.btnHot : 'rgba(38,29,19,0.9)';
      ctx.fillRect(x, by, w, rowH);
      ctx.strokeStyle = C.panelEdge;
      ctx.strokeRect(x + 0.5, by + 0.5, w - 1, rowH - 1);
      drawText(ctx, c.def.name, x + 5, by + 3, { color: C.ink });
      drawText(ctx, c.def.role, x + w - 5, by + 3, { color: C.faint, align: 'right' });
      drawText(ctx, ellipsize(c.def.ability || '', w - 12), x + 5, by + 13, { color: C.dim });
      this.bar(ctx, x + w - 44, by + 14, 40, 5, c.hp / c.hpMax, c.hp > c.hpMax * 0.4 ? C.bar2 : C.bad);
      if (hot) this.hover = c.def.desc;
    });
    this.scroll = clamp(this.scroll, 0, Math.max(0, fleet.length * (rowH + 2) - h + 20));
  }

  _codexTab(ctx, x, y, w, h) {
    const g = this.game;
    drawText(ctx, 'CODEX', x, y, { color: C.dim });
    let ry = y + 12 - this.scroll;
    const line = (label, val, col) => {
      drawText(ctx, label, x + 4, ry, { color: C.dim });
      drawText(ctx, val, x + w - 4, ry, { color: col || C.ink, align: 'right' });
      ry += LINE_H;
    };
    drawText(ctx, 'GENES EXPRESSED', x, ry, { color: '#8cc468' }); ry += 11;
    for (const gn of GENES) {
      const have = g.economy.genes.has(gn.id);
      if (ry > y + h) break;
      drawText(ctx, gn.name, x + 4, ry, { color: have ? C.ink : C.faint });
      drawText(ctx, have ? gn.from : 'not expressed', x + w - 4, ry,
        { color: have ? C.dim : C.faint, align: 'right' });
      if (this._hit(x, ry - 1, w, LINE_H)) this.hover = gn.desc;
      ry += LINE_H;
    }
    ry += 6;
    drawText(ctx, 'SIGHTED', x, ry, { color: '#e2b74a' }); ry += 11;
    for (const f of FAUNA) {
      if (ry > y + h) break;
      const seen = g.wildlife.seen.has(f.id);
      drawText(ctx, seen ? f.name : '???????', x + 4, ry, { color: seen ? C.ink : C.faint });
      drawText(ctx, seen ? (f.hostile ? 'hostile' : f.role) : '', x + w - 4, ry,
        { color: f.hostile ? C.bad : C.dim, align: 'right' });
      if (seen && this._hit(x, ry - 1, w, LINE_H)) this.hover = f.desc;
      ry += LINE_H;
    }
    const total = (GENES.length + FAUNA.length) * LINE_H + 40;
    this.scroll = clamp(this.scroll, 0, Math.max(0, total - h + 16));
  }
}
