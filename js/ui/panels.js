// CRABDEN - full-screen panels: evolution tree, companions, codex, map, menu.
// Immediate-mode: every widget reads game.input directly and returns a click.

import { TAU, clamp, rgba, shadeHex } from '../lib/math.js';
import { drawText, drawTextBlock, textWidth, wrapText, ellipsize } from '../lib/font.js';
import { panel, bar, pxEllipse, pxLine } from '../render/sprites.js';
import { NODES, NODE_BY_ID, BRANCHES, ABILITIES, TREE_W, TREE_H } from '../systems/evolution.js';
import { SPECIES_LIST, WORKS } from '../entities/species.js';
import { drawCreature } from '../render/creatureart.js';
import { REGIONS } from '../world/regions.js';
const R = Math.round;

export class Panels {
  constructor(game) {
    this.game = game;
    this.open = null;
    this.treeX = 0; this.treeY = 0;
    this.hoverNode = null;
    this.codexIndex = 0;
    this.codexOpen = false;
    this.pickedNode = null;
    this.evoTab = 'tree';
    this.codexScroll = 0;
    this.palScroll = 0;
    this.mapCache = null;
    this.tab = 0;
    this.t = 0;
  }

  toggle(which) {
    this.open = this.open === which ? null : which;
    this.game.audio.play('uiBig');
    if (this.open === 'evo') { this.treeX = 0; this.treeY = 0; }
    this.game.state = this.open ? 'panel' : 'play';
  }

  close() {
    if (!this.open) return;
    this.open = null;
    this.game.state = 'play';
    this.game.audio.play('ui');
  }

  // -- widgets --------------------------------------------------------------

  _hit(x, y, w, h) {
    const i = this.game.input;
    return i.sx >= x && i.sx <= x + w && i.sy >= y && i.sy <= y + h;
  }

  btn(ctx, x, y, w, h, label, opts = {}) {
    const hov = this._hit(x, y, w, h);
    const on = opts.active;
    const dis = opts.disabled;
    const fill = dis ? 'rgba(28,24,20,0.8)' : on ? '#c9a06a' : hov ? 'rgba(62,50,38,0.95)' : 'rgba(34,26,20,0.9)';
    const border = dis ? 'rgba(90,78,64,0.5)' : on ? '#f0d8a8' : hov ? '#e0c088' : 'rgba(160,128,88,0.7)';
    panel(ctx, x, y, w, h, fill, border);
    drawText(ctx, label, x + w / 2, y + (h - 7) / 2, {
      color: dis ? 'rgba(160,146,124,0.5)' : on ? '#241810' : '#f0e2c0',
      align: 'center', scale: opts.scale || 1,
    });
    if (hov && !dis && this.game.input.clicked) {
      this.game.input.clicked = false;
      this.game.audio.play('ui');
      return true;
    }
    return false;
  }

  // -- main -----------------------------------------------------------------

  update(dt) {
    this.t += dt;
    const i = this.game.input;
    if (!this.open) return;
    // while a panel is open it owns the panel keys, and consumes them
    if (i.justPressed('Escape')) { i.consumeKey('Escape'); this.close(); return; }
    for (const [key, id] of [['e', 'evo'], ['c', 'pals'], ['b', 'codex'], ['m', 'map']]) {
      if (!i.justPressed(key)) continue;
      i.consumeKey(key);
      if (this.open === id) { this.close(); return; }
      this.open = id;
      this.game.audio.play('ui');
      return;
    }
    if (this.open === 'evo') {
      if ((i.dragging || i.down) && i.moved) {
        this.treeX += i.dragDX;
        this.treeY += i.dragDY;
      }
      if (i.wheel) this.treeY -= i.wheel * 16;
      const spd = 220 * dt;
      if (i.key('a') || i.key('ArrowLeft')) this.treeX += spd;
      if (i.key('d') || i.key('ArrowRight')) this.treeX -= spd;
      if (i.key('w') || i.key('ArrowUp')) this.treeY += spd;
      if (i.key('s') || i.key('ArrowDown')) this.treeY -= spd;
    }
    const dragging = (i.dragging || i.down) && i.moved;
    if (this.open === 'codex') {
      this.codexScroll -= i.wheel * 12;
      if (dragging) this.codexScroll -= i.dragDY;
    }
    if (this.open === 'pals') {
      this.palScroll = clamp(this.palScroll + i.wheel * 12 - (dragging ? i.dragDY : 0), 0, 600);
    }
  }

  /** Sizes that change between a mouse pointer and a thumb. */
  _metrics(game, vw, vh) {
    const touch = game.touch.active;
    const narrow = vw < 330;
    const tabH = touch ? 18 : 12;
    this.m = {
      touch, narrow, tabH,
      tabY: vh - tabH - 2,
      rowH: touch ? 15 : 11,
      btnH: touch ? 17 : 12,
      nodeR: touch ? 13 : 8,
      bottom: vh - tabH - 6,       // usable area above the tab strip
    };
    return this.m;
  }

  draw(ctx, game) {
    if (!this.open) return;
    const vw = game.renderer.vw, vh = game.renderer.vh;
    const m = this._metrics(game, vw, vh);
    ctx.fillStyle = 'rgba(10,7,5,0.93)';
    ctx.fillRect(0, 0, vw, vh);

    switch (this.open) {
      case 'evo': this._drawEvo(ctx, game, vw, vh); break;
      case 'pals': this._drawPals(ctx, game, vw, vh); break;
      case 'codex': this._drawCodex(ctx, game, vw, vh); break;
      case 'map': this._drawMap(ctx, game, vw, vh); break;
      case 'menu': this._drawMenu(ctx, game, vw, vh); break;
      default: break;
    }

    // tab strip - short labels once there are no keys to name
    const tabs = m.touch || m.narrow
      ? [['evo', 'EVO'], ['pals', 'PALS'], ['codex', 'CODEX'], ['map', 'MAP'], ['menu', 'MENU']]
      : [['evo', 'EVOLUTION  E'], ['pals', 'COMPANIONS  C'], ['codex', 'CODEX  B'], ['map', 'MAP  M'], ['menu', 'MENU  esc']];
    const widths = tabs.map(([, l]) => textWidth(l, 1) + 10);
    const total = widths.reduce((a, b) => a + b, 0) + (tabs.length - 1) * 3;
    let tx = Math.max(4, Math.round((vw - total) / 2));
    tabs.forEach(([id, label], k) => {
      if (this.btn(ctx, tx, m.tabY, widths[k], m.tabH, label, { active: this.open === id })) this.open = id;
      tx += widths[k] + 3;
    });
  }

  // -- evolution ------------------------------------------------------------

  _drawEvo(ctx, game, vw, vh) {
    const evo = game.evo;
    const m = this.m;

    if (m.narrow) {
      // no room for tree and slots side by side: switch between them.
      // Title drops to one scale so it cannot run under the buttons, and the
      // buttons stop short of the corner where the close X lives.
      drawText(ctx, 'EVOLUTION', 8, 5, { color: '#ffe9a0', scale: 1 });
      drawText(ctx, `${Math.floor(game.res.nutrients)}n`, (m.touch ? vw - 30 : vw - 6), 5,
        { color: '#e0c890', align: 'right', scale: 1 });
      // the switch gets its own row; side by side it ran under the title
      const w = 44;
      if (this.btn(ctx, 8, 15, w, m.btnH, 'TREE', { active: this.evoTab !== 'slots' })) this.evoTab = 'tree';
      if (this.btn(ctx, 8 + w + 4, 15, w, m.btnH, 'SLOTS', { active: this.evoTab === 'slots' })) this.evoTab = 'slots';
    } else {
      drawText(ctx, 'EVOLUTION', 8, 5, { color: '#ffe9a0', scale: 2 });
      drawText(ctx, `${Math.floor(game.res.nutrients)} nutrients`, vw - 126, 5, { color: '#e0c890', align: 'right', scale: 1 });
      drawText(ctx, `stage ${evo.stage}  -  ${evo.unlocked.size}/${NODES.length} traits`, vw - 126, 14,
        { color: 'rgba(200,186,160,0.7)', align: 'right', scale: 1 });
    }

    const showSlots = m.narrow ? this.evoTab === 'slots' : true;
    const showTree = m.narrow ? this.evoTab !== 'slots' : true;

    if (showTree) this._drawEvoTree(ctx, game, vw, vh);
    if (showSlots) {
      const sx = m.narrow ? 4 : vw - 120;
      const sw = m.narrow ? vw - 8 : 116;
      const sy = m.narrow ? 15 + m.btnH + 4 : 26;
      this._drawEvoSlots(ctx, game, sx, sy, sw, m.bottom - sy);
    }
  }

  _drawEvoTree(ctx, game, vw, vh) {
    const evo = game.evo;
    const m = this.m;
    const viewX = 4;
    const viewY = m.narrow ? 15 + m.btnH + 4 : 26;
    const viewW = m.narrow ? vw - 8 : vw - 128;
    const viewH = m.bottom - viewY;

    this.treeX = clamp(this.treeX, Math.min(0, viewW - TREE_W - 10), 10);
    this.treeY = clamp(this.treeY, Math.min(0, viewH - TREE_H - 6), 6);

    ctx.save();
    ctx.beginPath();
    ctx.rect(viewX, viewY, viewW, viewH);
    ctx.clip();

    const ox = viewX + this.treeX + 6;
    const oy = viewY + this.treeY + 2;

    BRANCHES.forEach((b, i) => {
      drawText(ctx, b.short || b.name, ox + b.x, oy + 2 + (i % 2) * 9, { color: b.color, align: 'center', scale: 1 });
    });

    for (const n of NODES) {
      if (!n.req) continue;
      for (const r of n.req) {
        const p = NODE_BY_ID[r];
        if (!p) continue;
        pxLine(ctx, ox + p.x, oy + p.y, ox + n.x, oy + n.y,
          evo.has(r) ? rgba(n.color, 0.75) : 'rgba(90,78,64,0.45)', 1);
      }
    }

    this.hoverNode = null;
    const inView = game.input.sx > viewX && game.input.sx < viewX + viewW
      && game.input.sy > viewY && game.input.sy < viewY + viewH;
    for (const n of NODES) {
      const x = ox + n.x, y = oy + n.y;
      if (y < viewY - 12 || y > viewY + viewH + 12) continue;
      const unlocked = evo.has(n.id);
      const avail = evo.available(n);
      const afford = avail && evo.canAfford(n);
      const near = inView && Math.hypot(game.input.sx - x, game.input.sy - y) < m.nodeR;
      const picked = this.pickedNode === n.id;
      if (near && !m.touch) this.hoverNode = n;
      // On touch a tap only *selects*; spending happens on the detail panel's
      // EVOLVE button, so nobody buys a trait they were trying to read about.
      // With a mouse the tooltip is already open on hover, so a click there
      // still means "buy it" - the detail pass below consumes that click.
      if (near && game.input.clicked) {
        this.pickedNode = n.id;
        if (m.touch) {
          game.input.clicked = false;
          game.audio.play('ui');
        }
      }

      const rr = unlocked ? 6 : 5;
      const ring = unlocked ? shadeHex(n.color, 0.4)
        : afford ? n.color
        : avail ? shadeHex(n.color, -0.35)
        : 'rgba(84,74,62,0.9)';
      const fill = unlocked ? n.color
        : afford ? shadeHex(n.color, -0.55)
        : 'rgba(26,21,17,0.95)';

      if (afford) {
        const pulse = 0.4 + Math.sin(this.t * 4 + n.y) * 0.25;
        ctx.fillStyle = rgba(n.color, pulse * 0.35);
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, rr + 4, 0, TAU); ctx.fill();
      }
      pxEllipse(ctx, x, y, rr + 1, rr + 1, ring);
      pxEllipse(ctx, x, y, rr, rr, fill);
      if (unlocked) pxEllipse(ctx, x - 1, y - 1, rr - 2.5, rr - 2.5, shadeHex(n.color, 0.55));

      const glyph = n.ability ? (ABILITIES[n.ability]?.icon || '*') : n.moult ? String(n.moult) : null;
      if (glyph) {
        drawText(ctx, glyph, x, y - 3, {
          color: unlocked ? '#241810' : afford ? '#ffe9a0' : 'rgba(190,176,150,0.7)',
          align: 'center', scale: 1,
        });
      }
      if (near || picked) {
        ctx.strokeStyle = picked ? '#ffffff' : '#ffe9a0';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.5, rr + 2.5, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();

    // edge arrows so it is obvious the tree continues off-screen
    if (this.treeX > Math.min(0, viewW - TREE_W - 10) + 1) {
      drawText(ctx, '<', viewX + 2, viewY + viewH / 2, { color: 'rgba(255,233,160,0.7)', scale: 2 });
    }
    if (this.treeX < 9) {
      drawText(ctx, '>', viewX + viewW - 8, viewY + viewH / 2, { color: 'rgba(255,233,160,0.7)', scale: 2 });
    }
    if (this.treeY > Math.min(0, viewH - TREE_H - 6) + 1) {
      drawText(ctx, '▲', viewX + viewW / 2, viewY + 1, { color: 'rgba(255,233,160,0.6)', align: 'center', scale: 1 });
    }
    if (this.treeY < 5) {
      drawText(ctx, '▼', viewX + viewW / 2, viewY + viewH - 8, { color: 'rgba(255,233,160,0.6)', align: 'center', scale: 1 });
    }

    const info = m.touch ? NODE_BY_ID[this.pickedNode] : (this.hoverNode || NODE_BY_ID[this.pickedNode]);
    if (info) this._drawNodeDetail(ctx, game, info, viewX, viewY, viewW, viewH, vw, vh);
    else if (m.touch) {
      drawText(ctx, m.narrow ? 'tap a trait  -  drag to pan' : 'tap a trait to read it  -  drag to pan',
        viewX + viewW / 2, viewY + viewH - 8, {
          color: 'rgba(180,166,140,0.55)', align: 'center', scale: 1,
        });
    }
  }

  _drawNodeDetail(ctx, game, n, viewX, viewY, viewW, viewH, vw, vh) {
    const evo = game.evo;
    const m = this.m;
    const unlocked = evo.has(n.id);
    const avail = evo.available(n);
    const afford = evo.canAfford(n);
    const pinned = m.touch;                 // touch pins it; a mouse trails it
    const boxW = pinned ? viewW : 160;
    const lines = wrapText(n.desc, boxW - 10, 1);
    const h = (pinned ? 34 : 30) + lines.length * 9;
    const tx = pinned ? viewX : clamp(game.input.sx + 8, 4, vw - boxW - 4);
    const ty = pinned ? viewY + viewH - h : clamp(game.input.sy + 8, 4, m.bottom - h);

    panel(ctx, tx, ty, boxW, h, 'rgba(20,15,11,0.97)', n.color);
    drawText(ctx, n.name, tx + 5, ty + 4, { color: n.color, scale: 1 });
    if (pinned) {
      // a close affordance, since there is no "move the mouse away"
      if (this.btn(ctx, tx + boxW - 16, ty + 2, 14, 11, 'x')) this.pickedNode = null;
    }
    drawTextBlock(ctx, lines, tx + 5, ty + 14, boxW - 10, { color: '#e8dcc4', scale: 1, lineHeight: 9 });

    const cost = evo.costText(n);
    const footY = ty + h - (pinned ? 14 : 10);
    drawText(ctx, unlocked ? 'OWNED' : cost, tx + 5, pinned ? footY + 2 : footY, {
      color: unlocked ? '#a8e090' : afford ? '#e0c890' : '#ff9a8a', scale: 1,
    });

    if (unlocked) return;
    if (!avail) {
      drawText(ctx, 'locked', tx + boxW - 5, pinned ? footY + 2 : footY, {
        color: 'rgba(160,146,124,0.7)', align: 'right', scale: 1,
      });
      return;
    }
    if (pinned) {
      const bw = 54;
      if (this.btn(ctx, tx + boxW - bw - 4, footY - 1, bw, m.btnH, 'EVOLVE', { disabled: !afford })) {
        if (evo.unlock(n.id)) this.pickedNode = null;
      }
    } else {
      drawText(ctx, afford ? 'click to evolve' : 'not enough', tx + boxW - 5, footY, {
        color: afford ? '#ffe9a0' : 'rgba(200,150,140,0.8)', align: 'right', scale: 1,
      });
      if (afford && game.input.clicked) {
        game.input.clicked = false;
        evo.unlock(n.id);
      }
    }
  }

  _drawEvoSlots(ctx, game, sx, sy, sw, sh) {
    const evo = game.evo;
    const m = this.m;
    panel(ctx, sx, sy, sw, sh, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.5)');
    drawText(ctx, 'ABILITIES', sx + 5, sy + 4, { color: '#ffe9a0', scale: 1 });
    drawText(ctx, `${evo.equipped.length}/${evo.slotCount} slots used`, sx + 5, sy + 13,
      { color: 'rgba(200,186,160,0.7)', scale: 1 });

    const rowH = m.touch ? 24 : 20;
    let ay = sy + 24;
    for (const id of evo.ownedAbilities) {
      if (ay + rowH > sy + sh - 2) break;
      const ab = ABILITIES[id];
      const eq = evo.isEquipped(id);
      const innate = ab.innate;
      const hov = this._hit(sx + 4, ay, sw - 8, rowH);
      panel(ctx, sx + 4, ay, sw - 8, rowH,
        eq ? 'rgba(70,58,40,0.95)' : hov ? 'rgba(48,40,32,0.95)' : 'rgba(30,24,20,0.9)',
        eq ? '#ffe0a8' : 'rgba(150,124,88,0.6)');
      drawText(ctx, ab.icon + '  ' + ab.name, sx + 8, ay + 3, { color: eq ? '#ffe9a0' : '#e0d4b8', scale: 1 });
      const verb = m.touch ? (eq ? 'tap to unequip' : 'tap to equip') : (eq ? 'equipped - click to remove' : 'click to equip');
      drawText(ctx, innate ? 'always equipped' : verb, sx + 8, ay + 12,
        { color: 'rgba(190,176,150,0.65)', scale: 1 });
      if (hov && game.input.clicked && !innate) {
        game.input.clicked = false;
        if (!evo.toggleEquip(id)) { game.audio.play('deny'); game.notify('No free ability slots.', 'bad'); }
        else game.audio.play('ui');
      }
      ay += rowH + 2;
    }
  }

  // -- companions -----------------------------------------------------------

  _drawPals(ctx, game, vw, vh) {
    const m = this.m;
    drawText(ctx, m.narrow ? 'COMPANIONS' : 'COMPANIONS', 8, m.narrow ? 5 : 6,
      { color: '#ffe9a0', scale: m.narrow ? 1 : 2 });
    const pals = game.creatures.filter((c) => c.tamed && !c.dead);
    const cap = game.evo.stats.companionSlots;
    drawText(ctx, `${pals.length}/${cap} bonded`, 8, m.narrow ? 16 : 22, { color: 'rgba(200,186,160,0.8)', scale: 1 });

    if (!pals.length) {
      const how = m.touch ? 'walk up to it and use the round action button'
        : 'walk close and press T';
      drawTextBlock(ctx, `Nobody yet. Feed a wild animal (${how}) and it will stay.`,
        8, 40, vw - 16, { color: '#cbb896', scale: 1, lineHeight: 9 });
      return;
    }

    // narrow screens put the job buttons on their own line under the name
    const stack = m.narrow;
    const rowH = stack ? 46 : (m.touch ? 40 : 34);
    let y = 34 - this.palScroll;
    for (const c of pals) {
      if (y > m.bottom) break;
      if (y > 20) {
        panel(ctx, 6, y, vw - 12, rowH, 'rgba(24,18,14,0.9)', 'rgba(201,160,106,0.45)');
        drawText(ctx, c.name || c.sp.name, 12, y + 4, { color: '#f0e2c0', scale: 1 });
        drawText(ctx, ellipsize(c.sp.latin, stack ? vw - 70 : 78, 1), 12, y + 13,
          { color: 'rgba(180,166,140,0.6)', scale: 1 });
        bar(ctx, 12, y + 23, 52, 3, c.hp / c.hpMax, '#7fd05a', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)');

        // job buttons
        const jobs = [null, c.sp.work].filter((v, i2, a) => a.indexOf(v) === i2);
        let bx = stack ? 12 : 96;
        const byy = stack ? y + 30 : y + 6;
        for (const j of jobs) {
          const label = j ? WORKS[j].name : 'Follow';
          const w = textWidth(label, 1) + 12;
          if (this.btn(ctx, bx, byy, w, m.btnH, label, { active: c.work === j })) {
            c.assignWork(j);
            game.notify(`${c.sp.name}: ${label}`, 'good');
          }
          bx += w + 4;
        }
        if (c.sp.work && !stack) {
          drawText(ctx, ellipsize(WORKS[c.sp.work].desc, vw - 160, 1), 96, y + 24,
            { color: 'rgba(190,176,150,0.7)', scale: 1 });
        }
        const rw = 46;
        if (this.btn(ctx, vw - rw - 10, stack ? byy : y + 6, rw, m.btnH, 'Release')) {
          c.tamed = false;
          c.work = null;
          c.state = 'wander';
          game.notify(`${c.sp.name} wandered off.`, 'info');
        }
      }
      y += rowH + 2;
    }
  }

  // -- codex ----------------------------------------------------------------

  _drawCodex(ctx, game, vw, vh) {
    const m = this.m;
    drawText(ctx, 'CODEX', 8, m.narrow ? 5 : 6, { color: '#ffe9a0', scale: m.narrow ? 1 : 2 });
    const known = SPECIES_LIST.filter((s) => game.discovered.has(s.id));
    drawText(ctx, `${known.length}/${SPECIES_LIST.length} recorded`, 8, m.narrow ? 16 : 22,
      { color: 'rgba(200,186,160,0.8)', scale: 1 });

    // On a narrow screen the list and the entry take turns.
    const split = !m.narrow;
    const listY = 32;
    const listH = m.bottom - listY;

    if (split || !this.codexOpen) {
      const listW = split ? 108 : vw - 12;
      this._drawCodexList(ctx, game, 6, listY, listW, listH);
      if (!split) return;
      this._drawCodexEntry(ctx, game, 6 + listW + 6, listY, vw - listW - 18, listH);
    } else {
      if (this.btn(ctx, vw - 56, 4, 50, m.btnH, '< LIST')) this.codexOpen = false;
      this._drawCodexEntry(ctx, game, 6, listY, vw - 12, listH);
    }
  }

  _drawCodexList(ctx, game, x, y, w, h) {
    const m = this.m;
    panel(ctx, x, y, w, h, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.45)');
    const rowH = m.rowH;
    this.codexScroll = clamp(this.codexScroll, 0, Math.max(0, SPECIES_LIST.length * rowH - (h - 8)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y + 1, w - 2, h - 2);
    ctx.clip();
    let ry = y + 4 - this.codexScroll;
    SPECIES_LIST.forEach((sp, idx) => {
      if (ry > y + h || ry < y - rowH) { ry += rowH; return; }
      const seen = game.discovered.has(sp.id);
      const hov = this._hit(x + 2, ry - 1, w - 4, rowH);
      if (hov && game.input.clicked) {
        game.input.clicked = false;
        this.codexIndex = idx;
        this.codexOpen = true;
        game.audio.play('ui');
      }
      if (this.codexIndex === idx) {
        ctx.fillStyle = 'rgba(201,160,106,0.22)';
        ctx.fillRect(x + 2, R(ry) - 1, w - 4, rowH - 1);
      }
      drawText(ctx, seen ? ellipsize(sp.name, w - 12, 1) : '???????', x + 5, ry + (rowH - 7) / 2 - 1, {
        color: seen
          ? (sp.role === 'hostile' || sp.role === 'boss' ? '#ff9a8a' : sp.role === 'rare' ? '#e2c0ff' : '#e8dcc4')
          : 'rgba(120,108,92,0.7)',
        scale: 1,
      });
      ry += rowH;
    });
    ctx.restore();
  }

  _drawCodexEntry(ctx, game, dx, dy, dw, dh) {
    const s = SPECIES_LIST[this.codexIndex];
    panel(ctx, dx, dy, dw, dh, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.45)');
    if (!game.discovered.has(s.id)) {
      drawText(ctx, 'Not yet observed.', dx + 6, dy + 8, { color: 'rgba(160,146,124,0.8)', scale: 1 });
      drawTextBlock(ctx, `Rumoured in: ${s.regions.map((r) => REGIONS.find((x) => x.id === r)?.name || r).join(', ')}`,
        dx + 6, dy + 20, dw - 12, { color: 'rgba(140,128,110,0.7)', scale: 1, lineHeight: 9 });
      return;
    }
    const artW = Math.min(68, Math.round(dw * 0.32));
    const textX = dx + 6;
    const textW = dw - 12 - artW;
    drawText(ctx, ellipsize(s.name, textW, 2), textX, dy + 5, { color: '#ffe9a0', scale: 2 });
    drawText(ctx, s.latin, textX, dy + 21, { color: 'rgba(180,166,140,0.7)', scale: 1 });
    drawText(ctx, `descended from: ${s.ancestor}`, textX, dy + 31, { color: '#cbb896', scale: 1 });

    // live portrait, drawn with exactly the same code the world uses
    this._drawSpeciesArt(ctx, game, s, dx + dw - artW / 2 - 6, dy + 44, artW);

    drawTextBlock(ctx, s.desc, textX, dy + 44, textW, { color: '#e8dcc4', scale: 1, lineHeight: 9 });
    let iy = dy + 44 + wrapText(s.desc, textW, 1).length * 9 + 8;

    const roleLabel = {
      companion: 'can be befriended', hostile: 'hostile',
      rare: 'rare - unlocks something', wild: 'wild', boss: 'apex predator',
    }[s.role] || s.role;
    drawText(ctx, roleLabel, textX, iy, {
      color: s.role === 'hostile' || s.role === 'boss' ? '#ff9a8a' : '#a8e090', scale: 1,
    });
    iy += 11;
    const regionNames = s.regions.map((r) => REGIONS.find((x) => x.id === r)?.name || r).join(', ');
    iy += drawTextBlock(ctx, `regions: ${regionNames}`, textX, iy, dw - 12,
      { color: '#cbb896', scale: 1, lineHeight: 9 }) + 2;
    drawText(ctx, `hp ${s.hp}   speed ${s.speed}   damage ${s.dmg}`, textX, iy, { color: '#cbb896', scale: 1 });
    iy += 11;
    if (s.work) {
      iy += drawTextBlock(ctx, `job - ${WORKS[s.work].name}: ${WORKS[s.work].desc}`, textX, iy, dw - 12,
        { color: '#9fd8ee', scale: 1, lineHeight: 9 }) + 2;
    }
    if (s.tame) drawText(ctx, `befriend with: ${s.tame.cost} ${s.tame.item}`, textX, iy, { color: '#e0c890', scale: 1 });
  }

  /**
   * Render a species using the real creature art, into a fixed box.
   * A fake camera maps the stub entity's local space into the panel.
   */
  _drawSpeciesArt(ctx, game, sp, cx, cy, box) {
    const scale = clamp(box / Math.max(9, sp.size * 3.0), 0.3, 3);
    const midY = cy + box * 0.46;
    const cam = {
      zoom: scale,
      vw: game.renderer.vw, vh: game.renderer.vh,
      isVisible: () => true,
      worldToScreen: (x, y) => ({ x: cx + x * scale, y: midY + y * scale }),
    };
    const legs = (sp.body && sp.body.legs) || 0;
    const feet = [];
    for (let i = 0; i < legs; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const rows = Math.max(1, legs / 2);
      const spread = (row - (rows - 1) / 2) * 0.5;
      const a = 0.5 + side * (Math.PI / 2) + spread * -side;
      feet.push({
        side, row, spread,
        fx: Math.cos(a) * sp.size * 1.05,
        fy: Math.sin(a) * sp.size * 1.05,
        fz: 0, ground: 0, stepping: false,
      });
    }
    const stub = {
      sp, pal: sp.pal, x: 0, y: 0, z: sp.flying ? 6 : 0,
      vx: 0, vy: 0, facing: 0.5, size: sp.size,
      t: this.t, wing: this.t * 6, gait: this.t * 2,
      hurtFlash: 0, dead: false, hp: sp.hp, hpMax: sp.hp,
      state: 'idle', tamed: false, hostile: false, work: null,
      id: 7, carrying: null, feet,
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - box / 2, cy - 6, box, box + 14);
    ctx.clip();
    // soft disc behind the animal so pale species still read
    ctx.fillStyle = 'rgba(255,233,190,0.06)';
    ctx.beginPath();
    ctx.ellipse(cx, midY, box * 0.42, box * 0.4, 0, 0, TAU);
    ctx.fill();
    drawCreature(ctx, cam, game, stub);
    ctx.restore();
  }

  // -- map ------------------------------------------------------------------

  _buildMap(game) {
    const N = 128;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    const d = img.data;
    const H = game.world.halfSize;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const wx = (x / N) * H * 2 - H;
        const wy = (y / N) * H * 2 - H;
        const { region } = game.world.regionAt(wx, wy);
        const h = game.world.heightAt(wx, wy);
        const col = h > 0.62 ? region.pal.hi : h > 0.42 ? region.pal.mid : region.pal.lo;
        const n = parseInt(col.slice(1), 16);
        const o = (y * N + x) * 4;
        d[o] = (n >> 16) & 255; d[o + 1] = (n >> 8) & 255; d[o + 2] = n & 255; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mapCache = c;
  }

  _drawMap(ctx, game, vw, vh) {
    if (!this.mapCache) this._buildMap(game);
    const m = this.m;
    drawText(ctx, 'THE WORLD', 8, m.narrow ? 5 : 6, { color: '#ffe9a0', scale: m.narrow ? 1 : 2 });

    // Narrow screens stack the map above its notes instead of beside them.
    const stack = m.narrow;
    const my = 26;
    const avail = m.bottom - my;
    const size = stack
      ? Math.min(vw - 16, Math.round(avail * 0.62))
      : Math.min(vw - 120, avail);
    const mx = stack ? Math.round((vw - size) / 2) : 8;

    ctx.drawImage(this.mapCache, 0, 0, 128, 128, mx, my, size, size);
    ctx.strokeStyle = 'rgba(201,160,106,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, size - 1, size - 1);

    const H = game.world.halfSize;
    const toMap = (x, y) => ({ x: mx + ((x + H) / (H * 2)) * size, y: my + ((y + H) / (H * 2)) * size });

    for (const r of REGIONS) {
      const p = toMap(r.cx, r.cy);
      const seen = game.visitedRegions.has(r.id);
      drawText(ctx, seen ? (stack ? r.name.replace(/^The /, '') : r.name) : '?', p.x, p.y - 4, {
        color: seen ? 'rgba(255,240,210,0.85)' : 'rgba(120,108,92,0.8)',
        align: 'center', scale: 1, outline: true, outlineColor: 'rgba(10,7,5,0.8)',
      });
    }

    for (const p of game.world.pois) {
      if (!p.discovered) continue;
      const q = toMap(p.x, p.y);
      ctx.fillStyle = p.kind === 'oasis' ? '#6fd8ee'
        : p.kind === 'well' ? '#7fe0d0'
        : p.kind === 'seep' ? '#4a9fb0' : '#e0c890';
      ctx.fillRect(R(q.x) - 1, R(q.y) - 1, 3, 3);
    }

    const gp = toMap(game.groveCenter.x, game.groveCenter.y);
    ctx.fillStyle = '#7fd05a';
    ctx.fillRect(R(gp.x) - 2, R(gp.y) - 2, 5, 5);
    const cp = toMap(game.crab.x, game.crab.y);
    ctx.fillStyle = '#ff8a5a';
    ctx.fillRect(R(cp.x) - 1, R(cp.y) - 1, 3, 3);
    if (Math.floor(this.t * 2) % 2 === 0) {
      ctx.strokeStyle = '#ffe9a0';
      ctx.beginPath(); ctx.arc(cp.x + 0.5, cp.y + 0.5, 5, 0, TAU); ctx.stroke();
    }

    // notes
    const sx = stack ? 6 : mx + size + 8;
    const sy = stack ? my + size + 4 : my;
    const sw = stack ? vw - 12 : vw - sx - 6;
    const sh = stack ? m.bottom - sy : size;
    panel(ctx, sx, sy, sw, sh, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.45)');
    const r = game.currentRegion;
    drawText(ctx, r.name, sx + 5, sy + 5, { color: '#ffe9a0', scale: 1 });
    drawTextBlock(ctx, r.blurb, sx + 5, sy + 16, sw - 10, { color: '#cbb896', scale: 1, lineHeight: 9 });
    let iy = sy + 16 + wrapText(r.blurb, sw - 10, 1).length * 9 + 6;
    if (r.hazard) {
      drawText(ctx, 'HAZARD: ' + r.hazard.name, sx + 5, iy, { color: '#ff9a8a', scale: 1 });
      iy += 10;
      drawTextBlock(ctx, r.hazard.desc, sx + 5, iy, sw - 10, { color: 'rgba(220,170,160,0.8)', scale: 1, lineHeight: 9 });
      iy += wrapText(r.hazard.desc, sw - 10, 1).length * 9 + 4;
    }
    if (iy < sy + sh - 20) {
      drawText(ctx, `regions visited: ${game.visitedRegions.size}/${REGIONS.length}`, sx + 5, iy, { color: '#a8c4d0', scale: 1 });
      iy += 10;
      drawText(ctx, `landmarks found: ${game.world.pois.filter((p) => p.discovered).length}`, sx + 5, iy, { color: '#a8c4d0', scale: 1 });
    }
  }

  // -- menu -----------------------------------------------------------------

  _drawMenu(ctx, game, vw, vh) {
    const m = this.m;
    const touch = m.touch;
    drawText(ctx, 'CRABDEN', vw / 2, 12, { color: '#6fd8ee', scale: m.narrow ? 2 : 3, align: 'center' });

    const bh = touch ? 18 : 14;
    const step = bh + 4;
    const bw = Math.min(140, vw - 24);
    const bx = Math.round(vw / 2 - bw / 2);
    let by = 40;

    if (this.btn(ctx, bx, by, bw, bh, 'Resume')) this.close();
    by += step;
    if (this.btn(ctx, bx, by, bw, bh, 'Save game')) game.save();
    by += step;
    if (this.btn(ctx, bx, by, bw, bh, 'Load last save', { disabled: !game.hasSave() })) { game.load(); this.close(); }
    by += step;
    if (this.btn(ctx, bx, by, bw, bh, game.audio.enabled ? 'Sound: on' : 'Sound: off')) {
      game.audio.setMuted(game.audio.enabled);
      game.settings.muted = !game.audio.enabled;
    }
    by += step;
    if (this.btn(ctx, bx, by, bw, bh, `On-screen controls: ${touch ? 'on' : 'off'}`)) {
      game.touch.toggle();
      game.settings.touchControls = game.touch.forced;
    }
    by += step;
    if (this.btn(ctx, bx, by, bw, bh, 'Abandon and restart')) {
      if (this._confirm) { game.restart(); this.close(); this._confirm = false; }
      else { this._confirm = true; game.notify('Tap again to confirm a full restart.', 'bad'); }
    }
    by += step + 4;

    const controls = touch ? [
      'stick (bottom left) ... walk',
      'PUMP ......... hold to make water',
      'POUR ......... hold to water the ground',
      'round button .. tame / pick / drink',
      'small squares . equipped abilities',
      'tap an animal . select a companion',
      'tap the ground  send the crab there',
      'drag ......... pan   pinch: zoom',
      'crosshair .... recentre on the crab',
    ] : [
      'left click ....... select / move / attack',
      'click the crab ... take direct control (wasd)',
      'click the organ .. pump water  (or hold F)',
      'right click / Q .. pour water on the ground',
      'T ................ offer food to a nearby animal',
      'H ................ harvest berries nearby',
      'R ................ drink from an oasis',
      'space / 1-4 ...... use equipped abilities',
      'middle drag ...... pan camera   wheel: zoom',
      'Z ................ snap the camera back to the crab',
      'E C B M .......... evolution, pals, codex, map',
    ];
    for (const line of controls) {
      if (by > m.bottom - 8) break;
      drawText(ctx, line, vw / 2, by, { color: 'rgba(200,186,160,0.8)', align: 'center', scale: 1 });
      by += 9;
    }
  }
}
