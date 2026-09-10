// CRABDEN - heads-up display. Drawn to the UI layer so the heat haze never
// touches it.

import { TAU, clamp01, rgba, formatTime } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize } from '../lib/font.js';
import { panel, bar } from '../render/sprites.js';
import { ABILITIES } from '../systems/evolution.js';
import { WORKS } from '../entities/species.js';
const R = Math.round;

/** Compact number so the HUD never overflows its panel. */
function fmt(n) {
  n = Math.floor(n);
  if (n >= 100000) return Math.round(n / 1000) + 'k';
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.notes = [];
    this.objectivePulse = 0;
    this.hintAlpha = 0;
  }

  notify(text, kind = 'info') {
    this.notes.push({ text, kind, life: 4.2, max: 4.2, y: 0 });
    if (this.notes.length > 5) this.notes.shift();
  }

  update(dt) {
    for (let i = this.notes.length - 1; i >= 0; i--) {
      this.notes[i].life -= dt;
      if (this.notes[i].life <= 0) this.notes.splice(i, 1);
    }
    this.objectivePulse = Math.max(0, this.objectivePulse - dt);
  }

  draw(ctx, game) {
    const vw = game.renderer.vw, vh = game.renderer.vh;
    if (game.state === 'title' || game.state === 'cutscene') return;
    if (game.panels.open) return;

    // narrow viewports (a phone held upright) get a slimmer set of panels
    this.compact = vw < 300;
    this.touch = game.touch.active;

    this._drawVitals(ctx, game, vw, vh);
    this._drawWorldInfo(ctx, game, vw, vh);
    if (!this.touch) this._drawAbilities(ctx, game, vw, vh);
    const objBottom = this._drawObjective(ctx, game, vw, vh);
    this._drawContext(ctx, game, vw, vh, objBottom);
    this._drawNotes(ctx, game, vw, vh);
    this._drawCompass(ctx, game, vw, vh);
    if (game.spawner.raid) this._drawRaid(ctx, game, vw, vh);
    if (game.selected && !game.selected.dead) this._drawSelected(ctx, game, vw, vh);
  }

  // -- vitals ---------------------------------------------------------------

  _drawVitals(ctx, game, vw, vh) {
    const c = game.crab;
    const compact = this.compact;
    const x = 6, y = 6;
    const w = compact ? 80 : 96;
    const h = compact ? 42 : 50;
    panel(ctx, x, y, w, h, 'rgba(22,16,12,0.78)', 'rgba(201,160,106,0.6)');
    const inner = w - 12;

    drawText(ctx, 'WATER', x + 6, y + 3, { color: '#9fe4f4', scale: 1 });
    drawText(ctx, `${fmt(c.water)}/${fmt(c.waterMax)}`, x + w - 6, y + 3, { color: '#cfeff8', align: 'right', scale: 1 });
    bar(ctx, x + 6, y + 11, inner, 4, c.water / Math.max(1, c.waterMax), '#57c8d8', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)', { gloss: true });

    const vigorW = compact ? inner : 40;
    bar(ctx, x + 6, y + 18, vigorW, 3, c.vigor, c.vigor > 0.25 ? '#9fd45c' : '#e2683c', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)');
    if (!compact) {
      drawText(ctx, c.pumping ? 'pumping' : 'vigor', x + 50, y + 17, { color: 'rgba(214,226,190,0.75)', scale: 1 });
    }

    const shellY = compact ? y + 24 : y + 25;
    if (!compact) {
      drawText(ctx, 'SHELL', x + 6, shellY, { color: '#f0b8ac', scale: 1 });
      drawText(ctx, `${fmt(Math.ceil(c.hp))}/${fmt(c.hpMax)}`, x + w - 6, shellY, { color: '#f0b8ac', align: 'right', scale: 1 });
    }
    bar(ctx, x + 6, compact ? y + 24 : y + 33, inner, 4, c.hp / Math.max(1, c.hpMax),
      '#d8543c', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)', { gloss: true });

    const nutY = compact ? y + 32 : y + 40;
    if (!compact) drawText(ctx, 'nutrients', x + 6, nutY, { color: 'rgba(224,200,144,0.7)', scale: 1 });
    else drawText(ctx, 'nut', x + 6, nutY, { color: 'rgba(224,200,144,0.7)', scale: 1 });
    drawText(ctx, fmt(game.res.nutrients), x + w - 6, nutY, { color: '#e0c890', align: 'right', scale: 1 });
    if (game.res.food >= 1) {
      drawText(ctx, `berries ${fmt(game.res.food)}`, x + 6, y + h + 4, { color: '#e2707a', scale: 1 });
    }
  }

  // -- world info -----------------------------------------------------------

  _drawWorldInfo(ctx, game, vw, vh) {
    const w = game.weather;
    const compact = this.compact;
    const pw = compact ? 80 : 104;
    const bx = vw - pw - 6, by = 6;
    const ph = compact ? 28 : 34;
    panel(ctx, bx, by, pw, ph, 'rgba(22,16,12,0.78)', 'rgba(201,160,106,0.6)');

    const name = game.currentRegion.name.replace(/^The /, '');
    drawText(ctx, ellipsize(name, pw - 10, 1), bx + 5, by + 4, { color: '#f0e2c0', scale: 1 });
    if (compact) {
      drawText(ctx, `D${w.day}`, bx + 5, by + 13, { color: '#cbb896', scale: 1 });
      drawText(ctx, formatTime(w.hour), bx + pw - 5, by + 13, { color: '#cbb896', align: 'right', scale: 1 });
      drawText(ctx, ellipsize(w.label(), pw - 10, 1), bx + 5, by + 21, {
        color: w.dangerous ? '#ff9a7a' : '#a8c4d0', scale: 1,
      });
    } else {
      drawText(ctx, `Day ${w.day}`, bx + 5, by + 13, { color: '#cbb896', scale: 1 });
      drawText(ctx, formatTime(w.hour), bx + 35, by + 13, { color: '#cbb896', scale: 1 });
      drawText(ctx, w.label(), bx + 5, by + 22, { color: w.dangerous ? '#ff9a7a' : '#a8c4d0', scale: 1 });

      // sun / moon dial
      const dx = bx + pw - 12, dy = by + 19;
      const ang = (w.hour / 24) * TAU - Math.PI / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(dx + 0.5, dy + 0.5, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(R(dx) - 7, R(dy), 15, 1);
      ctx.fillStyle = w.isNight ? '#cfd8e8' : '#ffd06a';
      ctx.fillRect(R(dx + Math.cos(ang) * 5) - 1, R(dy + Math.sin(ang) * 5) - 1, 3, 3);
    }

    // ecosystem tier
    const t = game.eco.tier;
    const ty = by + ph + 2;
    panel(ctx, bx, ty, pw, compact ? 18 : 20, 'rgba(22,16,12,0.7)', 'rgba(122,190,120,0.5)');
    drawText(ctx, ellipsize(t.name, pw - 10, 1), bx + 5, ty + 3, { color: '#a8e090', scale: 1 });
    const nextTier = game.nextTierAt();
    const frac = nextTier ? clamp01((game.eco.biomass - t.at) / (nextTier - t.at)) : 1;
    bar(ctx, bx + 5, ty + 12, pw - 10, 3, frac, '#7fd05a', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)');
    this._panelBottom = ty + (compact ? 18 : 20);
  }

  // -- abilities ------------------------------------------------------------

  _drawAbilities(ctx, game, vw, vh) {
    const evo = game.evo;
    const n = evo.slotCount;
    const sz = 18, gap = 3;
    const total = n * sz + (n - 1) * gap;
    const x0 = 6;
    const y = vh - sz - 6;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (sz + gap);
      const id = evo.equipped[i];
      const ab = id ? ABILITIES[id] : null;
      const cd = ab ? evo.cooldownFor(id) : 0;
      const ready = ab && cd <= 0;
      panel(ctx, x, y, sz, sz, ready ? 'rgba(38,30,22,0.9)' : 'rgba(20,16,14,0.85)',
        ready ? '#c9a06a' : 'rgba(120,100,80,0.6)');
      if (ab) {
        drawText(ctx, ab.icon, x + sz / 2, y + 4, { color: ready ? '#ffe0a8' : '#8a7a66', align: 'center', scale: 1 });
        drawText(ctx, String(i + 1), x + 2, y + sz - 7, { color: 'rgba(240,226,192,0.6)', scale: 1 });
        if (cd > 0) {
          const f = clamp01(cd / (ab.cd || 1));
          ctx.fillStyle = 'rgba(10,8,6,0.62)';
          ctx.fillRect(R(x + 1), R(y + 1), sz - 2, R((sz - 2) * f));
          drawText(ctx, cd.toFixed(1), x + sz / 2, y + sz / 2 - 3, { color: '#ffd0a0', align: 'center', scale: 1 });
        }
        if (ab.cost) {
          drawText(ctx, String(ab.cost), x + sz - 2, y + sz - 7, { color: '#9fe4f4', align: 'right', scale: 1 });
        }
      } else {
        drawText(ctx, '-', x + sz / 2, y + 5, { color: 'rgba(120,100,80,0.6)', align: 'center', scale: 1 });
      }
    }

    // control mode pip
    const cx = x0 + total + 8;
    const controlled = game.crab.controlled;
    drawText(ctx, controlled ? 'DIRECT  wasd' : 'COMMAND  click to move', cx, y + 6, {
      color: controlled ? '#ffd9a0' : 'rgba(220,206,180,0.6)', scale: 1,
    });
  }

  // -- objective ------------------------------------------------------------

  _drawObjective(ctx, game, vw, vh) {
    const t = game.tutorial;
    const step = t.step;
    if (!step || t.pendingStart) return 0;

    const hintText = (this.touch && step.touchHint) ? step.touchHint : step.hint;
    // the corners belong to the vitals and world panels; live between them,
    // or below them when the screen is too narrow for a middle column
    const band = this.compact
      ? { x0: 4, x1: vw - 4, y: (this._panelBottom || 62) + 4 }
      : { x0: 106, x1: vw - 112, y: 6 };
    const maxW = Math.max(90, band.x1 - band.x0);
    const hintLines = wrapText(hintText, maxW - 12, 1);
    const w = Math.min(maxW, Math.max(
      textWidth(step.title, 1),
      ...hintLines.map((l) => textWidth(l, 1))
    ) + 14);
    const cx = (band.x0 + band.x1) / 2;
    const x = Math.round(cx - w / 2);
    const y = band.y;
    const h = 14 + hintLines.length * 9;
    const pulse = t.goalFlash > 0 ? 0.5 + Math.sin(game.time * 22) * 0.5 : 0;
    panel(ctx, x, y, w, h, 'rgba(22,16,12,0.82)', pulse > 0.5 ? '#ffe9a0' : 'rgba(201,160,106,0.55)');
    drawText(ctx, step.title, cx, y + 3, { color: '#ffe9a0', align: 'center', scale: 1 });
    hintLines.forEach((line, i) => {
      drawText(ctx, line, cx, y + 12 + i * 9, { color: 'rgba(220,206,180,0.8)', align: 'center', scale: 1 });
    });
    return y + h;
  }

  // -- context prompt -------------------------------------------------------

  _drawContext(ctx, game, vw, vh, objBottom) {
    const h = game.uiHover;
    if (!h || !h.prompt) return;

    // With a mouse the prompt belongs under the cursor's half of the screen.
    // With thumbs on the bottom corners it has to live up top instead.
    const band = this.touch
      ? (this.compact
        ? { x0: 4, x1: vw - 4, y: (objBottom || (this._panelBottom || 62) + 4) + 3 }
        : { x0: 106, x1: vw - 112, y: (objBottom || 4) + 3 })
      : { x0: 8, x1: vw - 8, y: vh - 32 };
    const maxW = Math.max(80, band.x1 - band.x0);
    const text = ellipsize(h.prompt, maxW - 12, 1);
    const w = Math.min(maxW, textWidth(text, 1) + 12);
    const cx = (band.x0 + band.x1) / 2;
    panel(ctx, Math.round(cx - w / 2), band.y, w, 13, 'rgba(22,16,12,0.85)', 'rgba(201,160,106,0.6)');
    drawText(ctx, text, cx, band.y + 3, { color: '#f0e2c0', align: 'center', scale: 1 });
  }

  // -- notifications --------------------------------------------------------

  _drawNotes(ctx, game, vw, vh) {
    let y = (this._panelBottom || 62) + 4;
    const colors = { info: '#e0d4b8', good: '#a8e090', bad: '#ff9a8a', rare: '#e2c0ff' };
    for (const n of this.notes) {
      const a = clamp01(n.life / 0.6) * clamp01((n.max - n.life) / 0.2 + 0.2);
      const w = textWidth(n.text, 1) + 10;
      const x = vw - w - 6;
      ctx.globalAlpha = a;
      panel(ctx, x, y, w, 12, 'rgba(22,16,12,0.72)', 'rgba(201,160,106,0.35)');
      drawText(ctx, n.text, x + 5, y + 3, { color: colors[n.kind] || colors.info, scale: 1 });
      ctx.globalAlpha = 1;
      y += 14;
    }
  }

  // -- compass --------------------------------------------------------------

  _drawCompass(ctx, game, vw, vh) {
    const targets = [];
    const grove = game.groveCenter;
    if (Math.hypot(grove.x - game.crab.x, grove.y - game.crab.y) > 260) {
      targets.push({ x: grove.x, y: grove.y, color: '#7fd05a', label: 'grove' });
    }
    for (const p of game.world.pois) {
      if (!p.discovered) continue;
      const d = Math.hypot(p.x - game.crab.x, p.y - game.crab.y);
      if (d > 1100 || d < 120) continue;
      targets.push({ x: p.x, y: p.y, color: p.kind === 'oasis' ? '#6fd8ee' : '#c9a06a', label: '' });
    }
    if (game.spawner.raid) targets.push({ x: grove.x, y: grove.y, color: '#ff5a4a', label: 'raid' });

    for (const t of targets) {
      const a = Math.atan2(t.y - game.crab.y, t.x - game.crab.x);
      // clamp the marker to the screen edge
      const margin = 14;
      const hw = vw / 2 - margin, hh = vh / 2 - margin;
      const s = game.cam.worldToScreen(t.x, t.y);
      if (s.x > margin && s.x < vw - margin && s.y > margin && s.y < vh - margin) continue;
      const dx = Math.cos(a), dy = Math.sin(a);
      const scale = Math.min(hw / Math.max(0.0001, Math.abs(dx)), hh / Math.max(0.0001, Math.abs(dy)));
      const ex = vw / 2 + dx * scale, ey = vh / 2 + dy * scale;
      ctx.fillStyle = t.color;
      ctx.fillRect(R(ex) - 1, R(ey) - 1, 3, 3);
      ctx.fillStyle = rgba(t.color, 0.45);
      ctx.fillRect(R(ex - dx * 4) - 1, R(ey - dy * 4) - 1, 2, 2);
    }
  }

  _drawRaid(ctx, game, vw, vh) {
    const left = game.spawner.raidRemaining();
    const text = `RAID  ${left} left`;
    const w = textWidth(text, 1) + 14;
    const x = vw / 2 - w / 2, y = 32;
    const blink = Math.floor(game.time * 3) % 2 === 0;
    panel(ctx, x, y, w, 13, 'rgba(40,12,10,0.85)', blink ? '#ff5a4a' : 'rgba(180,60,50,0.7)');
    drawText(ctx, text, vw / 2, y + 3, { color: '#ffb0a0', align: 'center', scale: 1 });
  }

  _drawSelected(ctx, game, vw, vh) {
    const c = game.selected;
    const w = 96, h = 34;
    const x = vw / 2 - w / 2, y = vh - 54;
    panel(ctx, x, y, w, h, 'rgba(22,16,12,0.82)', 'rgba(201,160,106,0.6)');
    drawText(ctx, c.name || c.sp.name, x + 4, y + 3, { color: '#f0e2c0', scale: 1 });
    bar(ctx, x + 4, y + 12, 60, 3, c.hp / c.hpMax, '#7fd05a', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.6)');
    const workName = c.work ? WORKS[c.work].name : 'idle';
    drawText(ctx, `job: ${workName}`, x + 4, y + 18, { color: '#cbb896', scale: 1 });
    drawText(ctx, 'right click: send  |  C: jobs', x + 4, y + 26, { color: 'rgba(200,186,160,0.6)', scale: 1 });
  }
}
