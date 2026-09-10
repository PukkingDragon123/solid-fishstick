// CRABDEN - the Tree of Life.
//
// Everything you can become is one tree. The genes you express are its roots;
// the trunk is what you physically are; the four boughs are what you have
// learned to do. Buying a node does not tick a checkbox - the branch actually
// grows out to it, puts on bark, and leafs.
//
// You get here by looking into the gene orb on your own shell, which is a more
// honest description of the mechanic than a menu would be.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic, easeInOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, ellipsize, LINE_H } from '../lib/font.js';
import { SKILLS, SKILL_BY_ID, BRANCHES, EVOLUTIONS, EVO_BY_ID, GENES, GENE_BY_ID } from '../data/progress.js';

const TRUNK_STEP = 96;
const BOUGH_LEN = 210;

/** Lay the whole tree out once: trunk, boughs, roots. */
function layout() {
  const nodes = [];
  const links = [];

  // trunk: the evolutions, stacked
  EVOLUTIONS.forEach((e, i) => {
    nodes.push({
      id: e.id, kind: 'evo', data: e, tier: i,
      x: (i % 2 ? 1 : -1) * (i === 0 ? 0 : 14),
      y: -70 - i * TRUNK_STEP,
      r: 11, color: '#c9e08a',
    });
  });
  nodes.push({ id: '__root', kind: 'root', x: 0, y: 0, r: 17, color: '#8cc468' });
  for (let i = 0; i < EVOLUTIONS.length; i++) {
    const prev = i === 0 ? '__root' : EVOLUTIONS[i - 1].id;
    links.push({ from: prev, to: EVOLUTIONS[i].id, w: 26 - i * 2.6 });
  }

  // boughs: one per skill branch, leaving the trunk at a set height
  BRANCHES.forEach((br, bi) => {
    const side = bi % 2 ? 1 : -1;
    const attach = EVOLUTIONS[Math.min(EVOLUTIONS.length - 1, bi)];
    const ay = -70 - bi * TRUNK_STEP;
    const list = SKILLS.filter((s) => s.branch === br.id);
    // s.x is the depth along the bough, s.y the fork it sits on
    list.forEach((s) => {
      const t = s.x / 3;
      const spread = s.y * 42 * (0.4 + t);
      nodes.push({
        id: s.id, kind: 'skill', data: s, branch: br.id, tier: s.x,
        x: side * (52 + t * BOUGH_LEN),
        y: ay - 30 - t * 92 + spread,
        r: 8.5, color: br.color,
      });
    });
    for (const s of list) {
      if (!s.req.length) links.push({ from: attach.id, to: s.id, w: 11 });
      else for (const r of s.req) links.push({ from: r, to: s.id, w: 8.5 - s.x * 1.6 });
    }
    nodes.push({ id: '__lbl_' + br.id, kind: 'label', label: br.name, color: br.color,
      x: side * 46, y: ay - 6, r: 0 });
  });

  // roots: the genes, fanned out below ground
  GENES.forEach((g, i) => {
    const t = (i + 0.5) / GENES.length;
    const a = Math.PI * (0.10 + t * 0.80);
    const d = 60 + (i % 4) * 34;
    nodes.push({
      id: 'gene:' + g.id, kind: 'gene', data: g,
      x: -Math.cos(a) * d, y: Math.sin(a) * d * 0.62 + 24,
      r: 6, color: '#7fe0c8',
    });
    links.push({ from: '__root', to: 'gene:' + g.id, w: 6.5, root: true });
  });

  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return { nodes, links, by };
}

export class TreeScreen {
  constructor(game) {
    this.game = game;
    this.L = layout();
    this.cam = { x: 0, y: -230, z: 0.7 };
    this.target = { x: 0, y: -230, z: 0.7 };
    this.grow = {};              // node id -> 0..1 growth of the branch into it
    this.t = 0;
    this.dive = 0;               // 0 outside, 1 fully inside
    this.diving = false;
    this.sel = null;
    this.toast = null;
    this.toastT = 0;
    this.leafSeed = 1;
  }

  /** Start the dive from a screen point (the orb on the HUD). */
  open(fromX, fromY, vw = 460, vh = 258) {
    // frame the whole tree, roots to crown, whatever shape the window is
    const z = clamp(Math.min(vh / 900, vw / 1000), 0.28, 0.9);
    this.target.z = this.cam.z = z;
    this.target.x = this.cam.x = 0;
    this.target.y = this.cam.y = -360 + 120 / z * 0.35;
    this.diving = true;
    this.dive = 0;
    this.from = { x: fromX, y: fromY };
    this.t = 0;
    for (const n of this.L.nodes) {
      if (this.owned(n)) this.grow[n.id] = 1;
    }
    this.game.audio?.play('discover');
  }

  close() { this.diving = false; }

  owned(n) {
    const e = this.game.economy;
    if (n.kind === 'skill') return e.skills.has(n.id);
    if (n.kind === 'evo') return e.evolutions.has(n.id);
    if (n.kind === 'gene') return e.genes.has(n.data.id);
    return n.kind === 'root';
  }

  state(n) {
    const e = this.game.economy;
    if (n.kind === 'skill') return e.skillState(n.id);
    if (n.kind === 'evo') return e.evoState(n.id);
    if (n.kind === 'gene') return e.genes.has(n.data.id) ? 'owned' : 'locked';
    return 'owned';
  }

  say(msg, secs = 3.5) { this.toast = msg; this.toastT = secs; }

  // -------------------------------------------------------------------------

  update(dt, vw, vh) {
    this.t += dt;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
    this.dive = damp(this.dive, this.diving ? 1 : 0, 0.0006, dt);
    if (!this.diving && this.dive < 0.02) return false;

    for (const n of this.L.nodes) {
      const want = this.owned(n) ? 1 : 0;
      const cur = this.grow[n.id] ?? 0;
      if (cur !== want) this.grow[n.id] = damp(cur, want, 0.02, dt);
    }

    const i = this.game.input;
    if (this.diving && this.dive > 0.7) {
      if (i.dragging) { this.target.x -= i.dragDX / this.cam.z; this.target.y -= i.dragDY / this.cam.z; }
      if (i.wheel) this.target.z = clamp(this.target.z * Math.pow(1.22, -i.wheel), 0.45, 2.4);
      const ax = i.axis();
      if (ax.len > 0.1) { this.target.x += ax.x * 220 * dt; this.target.y += ax.y * 220 * dt; }
      this.target.x = clamp(this.target.x, -430, 430);
      this.target.y = clamp(this.target.y, -820, 140);
      if (i.justPressed('Escape') || i.justPressed('Tab')) {
        i.consumeKey('Escape'); i.consumeKey('Tab');
        this.close();
      }
    }
    this.cam.x = damp(this.cam.x, this.target.x, 0.0006, dt);
    this.cam.y = damp(this.cam.y, this.target.y, 0.0006, dt);
    this.cam.z = damp(this.cam.z, this.target.z, 0.0004, dt);
    return true;
  }

  _toScreen(n, vw, vh) {
    return {
      x: vw / 2 + (n.x - this.cam.x) * this.cam.z,
      y: vh / 2 + (n.y - this.cam.y) * this.cam.z,
    };
  }

  // -------------------------------------------------------------------------

  draw(ctx, vw, vh) {
    const d = this.dive;
    if (d < 0.01) return;

    // the dive itself: the orb swallows the screen, then the inside fades up
    const k = clamp01(d);
    ctx.save();
    ctx.globalAlpha = clamp01(k * 1.6);
    ctx.fillStyle = '#060a0c';
    ctx.fillRect(0, 0, vw, vh);
    if (k < 0.62) {
      const r = lerp(10, Math.hypot(vw, vh), easeOutCubic(k / 0.62));
      const cx = lerp(this.from ? this.from.x : vw / 2, vw / 2, k / 0.62);
      const cy = lerp(this.from ? this.from.y : vh / 2, vh / 2, k / 0.62);
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#0a1518');
      g.addColorStop(0.72, '#0d2a2c');
      g.addColorStop(1, 'rgba(10,20,22,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      ctx.restore();
      if (k < 0.34) return;
    } else ctx.restore();

    const fade = clamp01((k - 0.34) / 0.5);
    ctx.save();
    ctx.globalAlpha = fade;

    // the inside of the orb: a slow green deep with motes in it
    const bg = ctx.createRadialGradient(vw / 2, vh * 0.62, 10, vw / 2, vh * 0.62, Math.max(vw, vh) * 0.8);
    bg.addColorStop(0, '#123032');
    bg.addColorStop(0.5, '#0c1e22');
    bg.addColorStop(1, '#060d10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);
    for (let i = 0; i < 40; i++) {
      const s = Math.sin(i * 12.9898) * 43758.5453;
      const fx = ((s - Math.floor(s)) * vw + this.t * (6 + (i % 5) * 3)) % vw;
      const fy = (((Math.sin(i * 78.233) * 43758.5453) % 1 + 1) % 1) * vh
        + Math.sin(this.t * 0.5 + i) * 6;
      ctx.globalAlpha = fade * (0.10 + (i % 4) * 0.05);
      ctx.fillStyle = '#9fe8d4';
      ctx.fillRect(Math.round(fx), Math.round(fy % vh), 1, 1);
    }
    ctx.globalAlpha = fade;

    // ground line: everything below it is root
    const gy = vh / 2 + (12 - this.cam.y) * this.cam.z;
    ctx.fillStyle = 'rgba(40,28,18,0.55)';
    ctx.fillRect(0, gy, vw, vh - gy);
    ctx.fillStyle = 'rgba(120,96,64,0.5)';
    ctx.fillRect(0, Math.round(gy), vw, 1);

    // -- branches -----------------------------------------------------------
    // drawn as tapered wood, wide where it leaves the parent and narrow at the
    // tip, so an unbought branch still reads as a twig on a real tree
    const curveAt = (pa, pb, mx, my, t) => {
      const u = 1 - t;
      return {
        x: u * u * pa.x + 2 * u * t * mx + t * t * pb.x,
        y: u * u * pa.y + 2 * u * t * my + t * t * pb.y,
      };
    };
    for (const ln of this.L.links) {
      const a = this.L.by[ln.from], b = this.L.by[ln.to];
      if (!a || !b) continue;
      const g = this.grow[b.id] ?? 0;
      const alive = g > 0.02;
      const pa = this._toScreen(a, vw, vh), pb = this._toScreen(b, vw, vh);
      const mx = (pa.x + pb.x) / 2 + (b.x - a.x) * 0.10;
      const my = (pa.y + pb.y) / 2 - 16 * this.cam.z;
      const tip = alive ? Math.max(0.04, g) : 0.9;
      const w0 = ln.w * this.cam.z * (alive ? 1 : 0.46);
      const w1 = w0 * 0.45;
      const steps = 14;
      const left = [], right = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * tip;
        const p1 = curveAt(pa, pb, mx, my, t);
        const p2 = curveAt(pa, pb, mx, my, Math.min(1, t + 0.02));
        let nx = -(p2.y - p1.y), ny = p2.x - p1.x;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const w = lerp(w0, w1, t / Math.max(0.001, tip)) * 0.5;
        left.push({ x: p1.x + nx * w, y: p1.y + ny * w });
        right.push({ x: p1.x - nx * w, y: p1.y - ny * w });
      }
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (const p1 of left) ctx.lineTo(p1.x, p1.y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fillStyle = ln.root
        ? (alive ? '#5f9a86' : 'rgba(84,110,100,0.30)')
        : (alive ? '#5c3f26' : 'rgba(116,100,78,0.26)');
      ctx.fill();
      if (alive) {
        ctx.fillStyle = ln.root ? 'rgba(160,232,210,0.45)' : 'rgba(150,116,74,0.55)';
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (const p1 of left) ctx.lineTo(p1.x, p1.y);
        for (let i = left.length - 1; i >= 0; i--) {
          const t = i / steps;
          ctx.lineTo(lerp(left[i].x, right[i].x, 0.34), lerp(left[i].y, right[i].y, 0.34));
        }
        ctx.closePath();
        ctx.fill();
        if (!ln.root) {
          const leaves = Math.round(3 + ln.w);
          for (let i = 0; i < leaves; i++) {
            const t = ((i + 0.5) / leaves) * tip;
            if (t > g) continue;
            const p1 = curveAt(pa, pb, mx, my, t);
            const sgn = i % 2 ? 1 : -1;
            const sw = Math.sin(this.t * 1.6 + i * 2.1) * 1.2;
            ctx.fillStyle = i % 3 === 0 ? '#8cc468' : '#5c8f43';
            const sz = Math.max(1.5, 2.8 * this.cam.z);
            ctx.beginPath();
            ctx.ellipse(p1.x + sgn * sz * 1.5 + sw, p1.y - sz * 0.5, sz * 1.25, sz * 0.6, sgn * 0.6, 0, TAU);
            ctx.fill();
          }
        }
      }
    }

    // -- nodes --------------------------------------------------------------
    const i = this.game.input;
    let hover = null;
    for (const n of this.L.nodes) {
      const p = this._toScreen(n, vw, vh);
      if (n.kind === 'label') {
        drawText(ctx, n.label.toUpperCase(), p.x, p.y, { color: n.color, align: 'center', alpha: fade * 0.8 });
        continue;
      }
      const r = n.r * this.cam.z;
      if (p.x < -40 || p.x > vw + 40 || p.y < -40 || p.y > vh + 40) continue;
      const st = this.state(n);
      const g = this.grow[n.id] ?? 0;
      const on = st === 'owned';
      const ready = st === 'ready';
      const hot = Math.hypot(i.sx - p.x, i.sy - p.y) < r + 6;
      if (hot && n.kind !== 'root') hover = { n, p };

      const pulse = ready ? 0.5 + Math.sin(this.t * 3.4) * 0.5 : 0;
      // halo
      ctx.globalAlpha = fade * (on ? 0.34 : ready ? 0.18 + pulse * 0.22 : 0.07);
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.9 + pulse * 0.4), 0, TAU); ctx.fill();

      ctx.globalAlpha = fade;
      // shell
      ctx.fillStyle = on ? n.color : ready ? '#3d5140' : '#25302c';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * lerp(0.7, 1, Math.max(g, 0.6)), 0, TAU); ctx.fill();
      ctx.strokeStyle = on ? 'rgba(255,255,255,0.55)' : hot ? '#cfe8d8' : 'rgba(190,220,205,0.35)';
      ctx.lineWidth = Math.max(1, 1.4 * this.cam.z);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      // inner spark
      ctx.fillStyle = on ? 'rgba(255,255,255,0.8)' : 'rgba(200,230,215,0.35)';
      ctx.beginPath();
      ctx.arc(p.x - r * 0.28, p.y - r * 0.30, Math.max(1, r * 0.22), 0, TAU);
      ctx.fill();

      if (n.kind === 'evo' && this.cam.z > 0.7) {
        drawText(ctx, n.data.name, p.x, p.y + r + 4,
          { color: on ? '#e8f2d8' : 'rgba(220,236,210,0.55)', align: 'center', alpha: fade });
      }

      if (hot && i.clicked && n.kind !== 'root') {
        i.clicked = false;
        this._buy(n);
      }
    }
    ctx.globalAlpha = fade;

    // -- header + tooltip ---------------------------------------------------
    const e = this.game.economy;
    drawText(ctx, 'THE TREE OF LIFE', vw / 2, 8, { color: '#cfe8d8', align: 'center', scale: 1 });
    drawText(ctx, `${Math.round(e.nutrients)} nutrients   ${e.genes.size}/${GENES.length} genes expressed`,
      vw / 2, 20, { color: 'rgba(200,226,210,0.6)', align: 'center' });
    drawText(ctx, 'drag to look around   esc to wake up', vw / 2, vh - 12,
      { color: 'rgba(200,226,210,0.4)', align: 'center' });

    if (hover) this._tip(ctx, hover.n, hover.p, vw, vh);
    if (this.toast) {
      const w = Math.min(vw - 30, textWidth(this.toast) + 18);
      ctx.fillStyle = 'rgba(8,20,20,0.9)';
      ctx.fillRect((vw - w) / 2, vh - 42, w, 14);
      ctx.strokeStyle = 'rgba(140,196,104,0.5)';
      ctx.strokeRect((vw - w) / 2 + 0.5, vh - 41.5, w - 1, 13);
      drawText(ctx, this.toast, vw / 2, vh - 39, { color: '#cfe8d8', align: 'center' });
    }
    ctx.restore();
  }

  _tip(ctx, n, p, vw, vh) {
    const e = this.game.economy;
    const d = n.data;
    let title = '', cost = '', body = '', extra = '';
    if (n.kind === 'skill') {
      title = d.name; cost = `${d.cost} nutrients`; body = d.desc;
      if (this.state(n) === 'locked') extra = 'needs ' + d.req.map((r) => SKILL_BY_ID[r].name).join(', ');
    } else if (n.kind === 'evo') {
      title = d.name; cost = `${d.nutrients} nutrients`; body = d.desc;
      const miss = e.missingGenes(d.genes);
      extra = miss.length
        ? 'needs genes: ' + miss.map((g) => GENE_BY_ID[g]?.name || g).join(', ')
        : 'genes: ' + d.genes.map((g) => GENE_BY_ID[g]?.name || g).join(', ');
    } else if (n.kind === 'gene') {
      title = d.name; cost = e.genes.has(d.id) ? 'expressed' : 'not expressed';
      body = d.desc; extra = 'from ' + d.from;
    }
    const lines = wrapText(body, 150).concat(extra ? wrapText(extra, 150) : []);
    const w = Math.min(168, Math.max(textWidth(title) + 12, ...lines.map((l) => textWidth(l) + 12)));
    const h = 22 + lines.length * LINE_H;
    const x = clamp(p.x + 14, 4, vw - w - 4);
    const y = clamp(p.y - h / 2, 4, vh - h - 4);
    ctx.fillStyle = 'rgba(6,16,16,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = n.color;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.globalAlpha = 1;
    drawText(ctx, title, x + 5, y + 4, { color: '#e8f4e2' });
    drawText(ctx, cost, x + w - 5, y + 4, { color: n.color, align: 'right' });
    lines.forEach((l, i) => drawText(ctx, l, x + 5, y + 15 + i * LINE_H, { color: 'rgba(210,232,216,0.72)' }));
  }

  _buy(n) {
    const e = this.game.economy;
    const st = this.state(n);
    if (st === 'owned') return;
    if (n.kind === 'gene') {
      this.say(`${n.data.name} comes from ${n.data.from}. Grow it, or win it over.`);
      return;
    }
    if (n.kind === 'skill') {
      if (e.buySkill(n.id)) { this.say(`${n.data.name} learned.`); this.game.audio?.play('grow'); }
      else this.say(st === 'locked' ? 'The branch has not reached that far yet.' : 'Not enough nutrients.');
      return;
    }
    if (n.kind === 'evo') {
      if (e.evolve(n.id)) { this.say(`${n.data.name}. Something in you unfolds.`); this.game.audio?.play('evolve'); }
      else if (st === 'genes') this.say('Missing genes: ' + e.missingGenes(n.data.genes).map((g) => GENE_BY_ID[g]?.name || g).join(', '));
      else if (st === 'locked') this.say('An earlier form first.');
      else this.say('Not enough nutrients.');
    }
  }
}
