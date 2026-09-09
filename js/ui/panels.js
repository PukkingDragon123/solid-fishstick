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
    if (i.justPressed('Escape')) { this.close(); return; }
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
    if (this.open === 'codex') this.codexScroll -= i.wheel * 12;
    if (this.open === 'pals') this.palScroll = clamp(this.palScroll + i.wheel * 12, 0, 400);
  }

  draw(ctx, game) {
    if (!this.open) return;
    const vw = game.renderer.vw, vh = game.renderer.vh;
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

    // tab strip
    const tabs = [['evo', 'EVOLUTION  E'], ['pals', 'COMPANIONS  C'], ['codex', 'CODEX  B'], ['map', 'MAP  M'], ['menu', 'MENU  esc']];
    let tx = 6;
    for (const [id, label] of tabs) {
      const w = textWidth(label, 1) + 10;
      if (this.btn(ctx, tx, vh - 14, w, 12, label, { active: this.open === id })) {
        this.open = id;
      }
      tx += w + 3;
    }
  }

  // -- evolution ------------------------------------------------------------

  _drawEvo(ctx, game, vw, vh) {
    const evo = game.evo;
    drawText(ctx, 'EVOLUTION', 8, 5, { color: '#ffe9a0', scale: 2 });
    drawText(ctx, `${Math.floor(game.res.nutrients)} nutrients`, vw - 126, 5, { color: '#e0c890', align: 'right', scale: 1 });
    drawText(ctx, `stage ${evo.stage}  -  ${evo.unlocked.size}/${NODES.length} traits`, vw - 126, 14, { color: 'rgba(200,186,160,0.7)', align: 'right', scale: 1 });

    const viewX = 4, viewY = 26, viewW = vw - 128, viewH = vh - 42;
    // keep the tree reachable no matter how small the window is
    this.treeX = clamp(this.treeX, Math.min(0, viewW - TREE_W - 10), 10);
    this.treeY = clamp(this.treeY, Math.min(0, viewH - TREE_H - 6), 6);
    ctx.save();
    ctx.beginPath();
    ctx.rect(viewX, viewY, viewW, viewH);
    ctx.clip();

    const ox = viewX + this.treeX + 6;
    const oy = viewY + this.treeY + 2;

    // branch headers, staggered so short columns cannot collide
    BRANCHES.forEach((b, i) => {
      drawText(ctx, b.short || b.name, ox + b.x, oy + 2 + (i % 2) * 9, { color: b.color, align: 'center', scale: 1 });
    });

    // links
    for (const n of NODES) {
      if (!n.req) continue;
      for (const r of n.req) {
        const p = NODE_BY_ID[r];
        if (!p) continue;
        const ok = evo.has(r);
        pxLine(ctx, ox + p.x, oy + p.y, ox + n.x, oy + n.y,
          ok ? rgba(n.color, 0.75) : 'rgba(90,78,64,0.45)', 1);
      }
    }

    // nodes
    this.hoverNode = null;
    for (const n of NODES) {
      const x = ox + n.x, y = oy + n.y;
      if (y < viewY - 12 || y > viewY + viewH + 12) continue;
      const unlocked = evo.has(n.id);
      const avail = evo.available(n);
      const afford = avail && evo.canAfford(n);
      const hov = Math.hypot(game.input.sx - x, game.input.sy - y) < 8;
      if (hov) this.hoverNode = n;

      const rr = unlocked ? 6 : 5;
      const ring = unlocked ? shadeHex(n.color, 0.4)
        : afford ? n.color
        : avail ? shadeHex(n.color, -0.35)
        : 'rgba(84,74,62,0.9)';
      const fill = unlocked ? n.color
        : afford ? shadeHex(n.color, -0.55)
        : 'rgba(26,21,17,0.95)';

      // glow behind a node you can afford right now
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
      if (hov) {
        ctx.strokeStyle = '#ffe9a0';
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

    // tooltip
    if (this.hoverNode) {
      const n = this.hoverNode;
      const unlocked = evo.has(n.id);
      const avail = evo.available(n);
      const afford = evo.canAfford(n);
      const lines = wrapText(n.desc, 150, 1);
      const h = 30 + lines.length * 9;
      const tx = clamp(game.input.sx + 8, 4, vw - 164);
      const ty = clamp(game.input.sy + 8, 4, vh - h - 18);
      panel(ctx, tx, ty, 160, h, 'rgba(20,15,11,0.96)', n.color);
      drawText(ctx, n.name, tx + 5, ty + 4, { color: n.color, scale: 1 });
      drawTextBlock(ctx, lines, tx + 5, ty + 14, 150, { color: '#e8dcc4', scale: 1, lineHeight: 9 });
      const cost = evo.costText(n);
      drawText(ctx, unlocked ? 'OWNED' : cost, tx + 5, ty + h - 10, {
        color: unlocked ? '#a8e090' : afford ? '#e0c890' : '#ff9a8a', scale: 1,
      });
      if (!unlocked && avail) {
        drawText(ctx, afford ? 'click to evolve' : 'not enough', tx + 155, ty + h - 10, {
          color: afford ? '#ffe9a0' : 'rgba(200,150,140,0.8)', align: 'right', scale: 1,
        });
      } else if (!unlocked && !avail) {
        drawText(ctx, 'locked', tx + 155, ty + h - 10, { color: 'rgba(160,146,124,0.7)', align: 'right', scale: 1 });
      }
      if (!unlocked && avail && afford && game.input.clicked) {
        game.input.clicked = false;
        evo.unlock(n.id);
      }
    }

    // ability slots
    const sx = vw - 120, sy = 26;
    panel(ctx, sx, sy, 116, vh - 42, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.5)');
    drawText(ctx, 'ABILITIES', sx + 5, sy + 4, { color: '#ffe9a0', scale: 1 });
    drawText(ctx, `${evo.equipped.length}/${evo.slotCount} slots used`, sx + 5, sy + 13, { color: 'rgba(200,186,160,0.7)', scale: 1 });
    let ay = sy + 24;
    for (const id of evo.ownedAbilities) {
      const ab = ABILITIES[id];
      const eq = evo.isEquipped(id);
      const innate = ab.innate;
      const hov = this._hit(sx + 4, ay, 108, 20);
      panel(ctx, sx + 4, ay, 108, 20, eq ? 'rgba(70,58,40,0.95)' : hov ? 'rgba(48,40,32,0.95)' : 'rgba(30,24,20,0.9)',
        eq ? '#ffe0a8' : 'rgba(150,124,88,0.6)');
      drawText(ctx, ab.icon + '  ' + ab.name, sx + 8, ay + 3, { color: eq ? '#ffe9a0' : '#e0d4b8', scale: 1 });
      drawText(ctx, innate ? 'always equipped' : eq ? 'equipped - click to remove' : 'click to equip',
        sx + 8, ay + 12, { color: 'rgba(190,176,150,0.65)', scale: 1 });
      if (hov && game.input.clicked && !innate) {
        game.input.clicked = false;
        if (!evo.toggleEquip(id)) { game.audio.play('deny'); game.notify('No free ability slots.', 'bad'); }
        else game.audio.play('ui');
      }
      ay += 22;
      if (ay > vh - 40) break;
    }

    drawText(ctx, 'drag or wasd to pan', sx + 5, vh - 34, { color: 'rgba(180,166,140,0.55)', scale: 1 });
    drawText(ctx, 'hover a node for details', sx + 5, vh - 26, { color: 'rgba(180,166,140,0.55)', scale: 1 });
  }

  // -- companions -----------------------------------------------------------

  _drawPals(ctx, game, vw, vh) {
    drawText(ctx, 'COMPANIONS', 8, 6, { color: '#ffe9a0', scale: 2 });
    const pals = game.creatures.filter((c) => c.tamed && !c.dead);
    const cap = game.evo.stats.companionSlots;
    drawText(ctx, `${pals.length}/${cap} bonded`, 8, 22, { color: 'rgba(200,186,160,0.8)', scale: 1 });

    if (!pals.length) {
      drawText(ctx, 'Nobody yet. Feed a wild animal (walk close, press T) and it will stay.', 8, 40, { color: '#cbb896', scale: 1 });
      return;
    }

    let y = 34 - this.palScroll;
    for (const c of pals) {
      if (y > vh - 20) break;
      if (y > 20) {
        const h = 34;
        panel(ctx, 6, y, vw - 12, h, 'rgba(24,18,14,0.9)', 'rgba(201,160,106,0.45)');
        drawText(ctx, c.name || c.sp.name, 12, y + 4, { color: '#f0e2c0', scale: 1 });
        drawText(ctx, ellipsize(c.sp.latin, 78, 1), 12, y + 13, { color: 'rgba(180,166,140,0.6)', scale: 1 });
        bar(ctx, 12, y + 23, 52, 3, c.hp / c.hpMax, '#7fd05a', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)');

        // job buttons
        const jobs = [null, c.sp.work].filter((v, i2, a) => a.indexOf(v) === i2);
        let bx = 96;
        for (const j of jobs) {
          const label = j ? WORKS[j].name : 'Follow';
          const w = textWidth(label, 1) + 10;
          if (this.btn(ctx, bx, y + 6, w, 12, label, { active: c.work === j })) {
            c.assignWork(j);
            game.notify(`${c.sp.name}: ${label}`, 'good');
          }
          bx += w + 4;
        }
        if (c.sp.work) {
          drawText(ctx, WORKS[c.sp.work].desc, 96, y + 22, { color: 'rgba(190,176,150,0.7)', scale: 1 });
        }
        // release
        if (this.btn(ctx, vw - 52, y + 6, 42, 12, 'Release')) {
          c.tamed = false;
          c.work = null;
          c.state = 'wander';
          game.notify(`${c.sp.name} wandered off.`, 'info');
        }
      }
      y += 36;
    }
  }

  // -- codex ----------------------------------------------------------------

  _drawCodex(ctx, game, vw, vh) {
    drawText(ctx, 'CODEX', 8, 6, { color: '#ffe9a0', scale: 2 });
    const known = SPECIES_LIST.filter((s) => game.discovered.has(s.id));
    drawText(ctx, `${known.length}/${SPECIES_LIST.length} species recorded`, 8, 22, { color: 'rgba(200,186,160,0.8)', scale: 1 });

    // list
    const listW = 108;
    const listX = 6, listY = 32;
    panel(ctx, listX, listY, listW, vh - 50, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.45)');
    let y = listY + 4 - this.codexScroll;
    this.codexScroll = clamp(this.codexScroll, 0, Math.max(0, SPECIES_LIST.length * 11 - (vh - 60)));
    SPECIES_LIST.forEach((s, idx) => {
      if (y > listY + vh - 60 || y < listY - 10) { y += 11; return; }
      const seen = game.discovered.has(s.id);
      const hov = this._hit(listX + 2, y, listW - 4, 10);
      if (hov && game.input.clicked) { game.input.clicked = false; this.codexIndex = idx; game.audio.play('ui'); }
      if (this.codexIndex === idx) {
        ctx.fillStyle = 'rgba(201,160,106,0.22)';
        ctx.fillRect(listX + 2, R(y) - 1, listW - 4, 10);
      }
      drawText(ctx, seen ? s.name : '???????', listX + 5, y, {
        color: seen ? (s.role === 'hostile' || s.role === 'boss' ? '#ff9a8a' : s.role === 'rare' ? '#e2c0ff' : '#e8dcc4') : 'rgba(120,108,92,0.7)',
        scale: 1,
      });
      y += 11;
    });

    // detail
    const s = SPECIES_LIST[this.codexIndex];
    const dx = listX + listW + 6;
    const dw = vw - dx - 6;
    panel(ctx, dx, listY, dw, vh - 50, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.45)');
    if (!game.discovered.has(s.id)) {
      drawText(ctx, 'Not yet observed.', dx + 6, listY + 8, { color: 'rgba(160,146,124,0.8)', scale: 1 });
      drawText(ctx, `Rumoured in: ${s.regions.map((r) => REGIONS.find((x) => x.id === r)?.name || r).join(', ')}`,
        dx + 6, listY + 20, { color: 'rgba(140,128,110,0.7)', scale: 1 });
      return;
    }
    const artW = 68;
    const textX = dx + 6;
    const textW = dw - 12 - artW;
    drawText(ctx, s.name, textX, listY + 5, { color: '#ffe9a0', scale: 2 });
    drawText(ctx, s.latin, textX, listY + 21, { color: 'rgba(180,166,140,0.7)', scale: 1 });
    drawText(ctx, `descended from: ${s.ancestor}`, textX, listY + 31, { color: '#cbb896', scale: 1 });

    // live portrait, drawn with exactly the same code the world uses
    this._drawSpeciesArt(ctx, game, s, dx + dw - artW / 2 - 6, listY + 44, artW);

    drawTextBlock(ctx, s.desc, textX, listY + 44, textW, { color: '#e8dcc4', scale: 1, lineHeight: 9 });
    let iy = listY + 44 + wrapText(s.desc, textW, 1).length * 9 + 8;

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
    drawText(ctx, 'THE WORLD', 8, 6, { color: '#ffe9a0', scale: 2 });

    const size = Math.min(vw - 120, vh - 44);
    const mx = 8, my = 26;
    ctx.drawImage(this.mapCache, 0, 0, 128, 128, mx, my, size, size);
    ctx.strokeStyle = 'rgba(201,160,106,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, size - 1, size - 1);

    const H = game.world.halfSize;
    const toMap = (x, y) => ({ x: mx + ((x + H) / (H * 2)) * size, y: my + ((y + H) / (H * 2)) * size });

    // region labels
    for (const r of REGIONS) {
      const p = toMap(r.cx, r.cy);
      const seen = game.visitedRegions.has(r.id);
      drawText(ctx, seen ? r.name : '?', p.x, p.y - 4, {
        color: seen ? 'rgba(255,240,210,0.85)' : 'rgba(120,108,92,0.8)',
        align: 'center', scale: 1, outline: true, outlineColor: 'rgba(10,7,5,0.8)',
      });
    }

    // POIs
    for (const p of game.world.pois) {
      if (!p.discovered) continue;
      const q = toMap(p.x, p.y);
      const col = p.kind === 'oasis' ? '#6fd8ee' : p.kind === 'well' ? '#7fe0d0' : p.kind === 'seep' ? '#4a9fb0' : '#e0c890';
      ctx.fillStyle = col;
      ctx.fillRect(R(q.x) - 1, R(q.y) - 1, 3, 3);
    }

    // grove + crab
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

    // side info
    const sx = mx + size + 8;
    const sw = vw - sx - 6;
    panel(ctx, sx, my, sw, size, 'rgba(20,15,11,0.9)', 'rgba(201,160,106,0.45)');
    const r = game.currentRegion;
    drawText(ctx, r.name, sx + 5, my + 5, { color: '#ffe9a0', scale: 1 });
    drawTextBlock(ctx, r.blurb, sx + 5, my + 16, sw - 10, { color: '#cbb896', scale: 1, lineHeight: 9 });
    let iy = my + 16 + wrapText(r.blurb, sw - 10, 1).length * 9 + 6;
    if (r.hazard) {
      drawText(ctx, 'HAZARD: ' + r.hazard.name, sx + 5, iy, { color: '#ff9a8a', scale: 1 }); iy += 10;
      drawTextBlock(ctx, r.hazard.desc, sx + 5, iy, sw - 10, { color: 'rgba(220,170,160,0.8)', scale: 1, lineHeight: 9 });
      iy += wrapText(r.hazard.desc, sw - 10, 1).length * 9 + 4;
    }
    drawText(ctx, `regions visited: ${game.visitedRegions.size}/${REGIONS.length}`, sx + 5, iy, { color: '#a8c4d0', scale: 1 }); iy += 10;
    drawText(ctx, `landmarks found: ${game.world.pois.filter((p) => p.discovered).length}`, sx + 5, iy, { color: '#a8c4d0', scale: 1 });
  }

  // -- menu -----------------------------------------------------------------

  _drawMenu(ctx, game, vw, vh) {
    drawText(ctx, 'CRABDEN', vw / 2, 18, { color: '#6fd8ee', scale: 3, align: 'center' });
    const bw = 110, bx = vw / 2 - bw / 2;
    let by = 54;

    if (this.btn(ctx, bx, by, bw, 14, 'Resume')) this.close();
    by += 18;
    if (this.btn(ctx, bx, by, bw, 14, 'Save game')) { game.save(); }
    by += 18;
    if (this.btn(ctx, bx, by, bw, 14, 'Load last save', { disabled: !game.hasSave() })) { game.load(); this.close(); }
    by += 18;
    if (this.btn(ctx, bx, by, bw, 14, game.audio.enabled ? 'Sound: on' : 'Sound: off')) {
      game.audio.setMuted(game.audio.enabled);
      game.settings.muted = !game.audio.enabled;
    }
    by += 18;
    if (this.btn(ctx, bx, by, bw, 14, 'Abandon and restart')) {
      if (this._confirm) { game.restart(); this.close(); this._confirm = false; }
      else { this._confirm = true; game.notify('Click again to confirm a full restart.', 'bad'); }
    }
    by += 22;

    const controls = [
      'left click ....... select / move / attack',
      'click the crab ... take direct control (wasd)',
      'click the organ .. pump water  (or hold F)',
      'right click / Q .. pour water on the ground',
      'T ................ offer food to a nearby animal',
      'H ................ harvest berries nearby',
      'space / 1-4 ...... use equipped abilities',
      'middle drag ...... pan camera   wheel: zoom   arrows: pan',
      'Z ................ snap the camera back to the crab',
      'E C B M .......... evolution, pals, codex, map',
    ];
    for (const line of controls) {
      drawText(ctx, line, vw / 2, by, { color: 'rgba(200,186,160,0.8)', align: 'center', scale: 1 });
      by += 9;
    }
  }
}
