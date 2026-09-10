// CRABDEN - the Tree of Life.
//
// Everything you can become is one tree, and at the start it is not a tree at
// all: it is a seed with four buds on it. Nothing is laid out in advance and
// greyed out. A branch only exists once it has somewhere to go, and buying a
// node makes the wood actually push out, thicken, and leaf.
//
// The tree is genetic before it is botanical. A double helix runs up the
// inside of the trunk, the roots are the genes you have expressed, and every
// purchase sends a bright pulse of sap up from the roots into the new growth.
//
// You get here by looking into the gene orb on your own shell, which is a more
// honest description of the mechanic than a menu would be.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, LINE_H } from '../lib/font.js';
import { SKILLS, SKILL_BY_ID, BRANCHES, EVOLUTIONS, GENES, GENE_BY_ID } from '../data/progress.js';

// how the tree is shaped, in tree-space units
const TRUNK_BASE = -118;     // first evolution above the seed
const TRUNK_STEP = 94;       // and the ones after it
const BOUGH_BASE = 112;      // where a bough's first skill sits
const BOUGH_STEP = 88;       // and the spacing along it
const BOUGH_ANGLE = [-156, -124, -56, -24];   // degrees, upward-outward

const D2R = Math.PI / 180;

/** Lay the whole tree out once. Positions never move; visibility does. */
function layout() {
  const nodes = [];
  const links = [];

  const seed = { id: '__root', kind: 'root', x: 0, y: 0, r: 12, color: '#a8e878' };
  nodes.push(seed);

  // -- trunk: the evolutions, stacked straight up ---------------------------
  EVOLUTIONS.forEach((e, i) => {
    nodes.push({
      id: 'evo:' + e.id, kind: 'evo', data: e, tier: i,
      x: (i % 2 ? 1 : -1) * 13,
      y: TRUNK_BASE - i * TRUNK_STEP,
      r: 11.5, color: '#c9e08a',
    });
    links.push({
      from: i === 0 ? '__root' : 'evo:' + EVOLUTIONS[i - 1].id, to: 'evo:' + e.id,
      w: 27 - i * 2.4, trunk: true,
    });
  });

  // -- boughs: four, forking low off the seed like a desert tree ------------
  BRANCHES.forEach((br, bi) => {
    const th = BOUGH_ANGLE[bi % BOUGH_ANGLE.length] * D2R;
    const dx = Math.cos(th), dy = Math.sin(th);
    const px = -dy, py = dx;                       // perpendicular, for forks
    const list = SKILLS.filter((s) => s.branch === br.id);

    for (const s of list) {
      const along = BOUGH_BASE + s.x * BOUGH_STEP;
      const off = s.y * 36 * (0.62 + s.x * 0.16);
      nodes.push({
        id: 'skill:' + s.id, kind: 'skill', data: s, branch: br.id, tier: s.x,
        x: dx * along + px * off,
        y: dy * along + py * off - s.x * 44,       // boughs lift as they run
        r: 8.5, color: br.color,
      });
      if (!s.req.length) links.push({ from: '__root', to: 'skill:' + s.id, w: 12, branch: br.id });
      else for (const r of s.req) {
        links.push({ from: 'skill:' + r, to: 'skill:' + s.id, w: 10 - s.x * 1.7, branch: br.id });
      }
    }

    nodes.push({
      id: '__lbl_' + br.id, kind: 'label', label: br.name, color: br.color,
      x: dx * (BOUGH_BASE - 38) + px * 42, y: dy * (BOUGH_BASE - 38) + py * 42, r: 0,
    });
  });

  // -- roots: the genes, fanned out under the ground ------------------------
  GENES.forEach((g, i) => {
    const t = (i + 0.5) / GENES.length;
    const a = Math.PI * (0.08 + t * 0.84);
    const d = 40 + (i % 4) * 19;
    nodes.push({
      id: 'gene:' + g.id, kind: 'gene', data: g,
      x: -Math.cos(a) * d, y: Math.sin(a) * d * 0.62 + 22,
      r: 5, color: '#7fe0c8',
    });
    links.push({ from: '__root', to: 'gene:' + g.id, w: 7, root: true });
  });

  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  for (const ln of links) {
    const c = by[ln.to];
    if (c) c.parent = ln.from;
  }
  return { nodes, links, by };
}

/** A point on the quadratic that a branch follows. */
function curveAt(pa, pb, mx, my, t) {
  const u = 1 - t;
  return {
    x: u * u * pa.x + 2 * u * t * mx + t * t * pb.x,
    y: u * u * pa.y + 2 * u * t * my + t * t * pb.y,
  };
}

export class TreeScreen {
  constructor(game) {
    this.game = game;
    this.L = layout();
    this.cam = { x: 0, y: -60, z: 1.4 };
    this.target = { x: 0, y: -60, z: 1.4 };
    this.grow = {};              // node id -> 0..1, how far the wood has run
    this.seen = {};              // node id -> 0..1, how faded-in a bud is
    this.pulses = [];            // sap racing up a branch after a purchase
    this.motes = [];
    this.t = 0;
    this.dive = 0;
    this.diving = false;
    this.manual = false;         // the player has taken the camera
    this.toast = null;
    this.toastT = 0;
    this.flash = 0;
  }

  /** Start the dive from a screen point (the orb on the HUD). */
  open(fromX, fromY, vw = 460, vh = 258) {
    this.diving = true;
    this.dive = 0;
    this.manual = false;
    this.from = { x: fromX, y: fromY };
    this.t = 0;
    this.pulses.length = 0;
    for (const n of this.L.nodes) {
      const on = this.owned(n);
      this.grow[n.id] = on ? 1 : 0;
      this.seen[n.id] = this.visible(n) ? 1 : 0;
    }
    this._frame(vw, vh, true);
    this.motes = [];
    for (let i = 0; i < 70; i++) {
      this.motes.push({
        x: Math.random(), y: Math.random(), s: 0.3 + Math.random() * 0.9,
        p: Math.random() * TAU, r: Math.random() < 0.16 ? 1 : 0,
      });
    }
    this.game.audio?.play('discover');
  }

  close() { this.diving = false; }

  owned(n) {
    const e = this.game.economy;
    if (n.kind === 'skill') return e.skills.has(n.data.id);
    if (n.kind === 'evo') return e.evolutions.has(n.data.id);
    if (n.kind === 'gene') return e.genes.has(n.data.id);
    return n.kind === 'root';
  }

  /**
   * Whether the tree has any business showing this node yet. The rule is one
   * step of foresight: you see what you own, and the buds directly on it.
   * Everything past that does not exist until the wood gets there.
   */
  visible(n) {
    if (n.kind === 'root' || n.kind === 'gene' || n.kind === 'label') return true;
    if (this.owned(n)) return true;
    const e = this.game.economy;
    if (n.kind === 'evo') {
      const i = n.tier;
      return i === 0 || e.evolutions.has(EVOLUTIONS[i - 1].id);
    }
    return n.data.req.every((r) => e.skills.has(r));
  }

  state(n) {
    const e = this.game.economy;
    if (n.kind === 'skill') return e.skillState(n.data.id);
    if (n.kind === 'evo') return e.evoState(n.data.id);
    if (n.kind === 'gene') return e.genes.has(n.data.id) ? 'owned' : 'locked';
    return 'owned';
  }

  say(msg, secs = 3.5) { this.toast = msg; this.toastT = secs; }

  // -------------------------------------------------------------------------

  /** Fit the camera to whatever of the tree currently exists. */
  _frame(vw, vh, snap = false) {
    let x0 = -60, x1 = 60, y0 = -40, y1 = 60;
    for (const n of this.L.nodes) {
      if (n.kind === 'label') continue;
      // dormant genes are a root ball under the seed, not something to frame
      if (n.kind === 'gene' && (this.grow[n.id] ?? 0) < 0.5) continue;
      const a = Math.max(this.grow[n.id] ?? 0, (this.seen[n.id] ?? 0) * 0.9);
      if (a < 0.05) continue;
      const r = n.r + 22;
      x0 = Math.min(x0, n.x - r); x1 = Math.max(x1, n.x + r);
      y0 = Math.min(y0, n.y - r); y1 = Math.max(y1, n.y + r);
    }
    const w = Math.max(120, x1 - x0), h = Math.max(120, y1 - y0);
    const z = clamp(Math.min((vw - 40) / w, (vh - 70) / h), 0.26, 1.9);
    this.target.x = (x0 + x1) / 2;
    this.target.y = (y0 + y1) / 2;
    this.target.z = z;
    if (snap) { this.cam.x = this.target.x; this.cam.y = this.target.y; this.cam.z = this.target.z; }
  }

  update(dt, vw, vh) {
    this.t += dt;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.dive = damp(this.dive, this.diving ? 1 : 0, 0.0006, dt);
    if (!this.diving && this.dive < 0.02) return false;

    for (const n of this.L.nodes) {
      const w = this.owned(n) ? 1 : 0;
      const c = this.grow[n.id] ?? 0;
      if (c !== w) this.grow[n.id] = damp(c, w, 0.02, dt);
      const v = this.visible(n) ? 1 : 0;
      const s = this.seen[n.id] ?? 0;
      if (s !== v) this.seen[n.id] = damp(s, v, 0.06, dt);
    }

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.t += dt / p.dur;
      if (p.t >= 1) this.pulses.splice(i, 1);
    }

    const i = this.game.input;
    if (this.diving && this.dive > 0.7) {
      if (i.dragging && (Math.abs(i.dragDX) + Math.abs(i.dragDY)) > 0.4) {
        this.manual = true;
        this.target.x -= i.dragDX / this.cam.z;
        this.target.y -= i.dragDY / this.cam.z;
      }
      if (i.wheel) {
        this.manual = true;
        this.target.z = clamp(this.target.z * Math.pow(1.22, -i.wheel), 0.28, 2.6);
      }
      const ax = i.axis();
      if (ax.len > 0.1) {
        this.manual = true;
        this.target.x += ax.x * 220 * dt; this.target.y += ax.y * 220 * dt;
      }
      if (this.manual) {
        this.target.x = clamp(this.target.x, -520, 520);
        this.target.y = clamp(this.target.y, -900, 200);
      }
      if (i.justPressed('Escape') || i.justPressed('Tab')) {
        i.consumeKey('Escape'); i.consumeKey('Tab');
        this.close();
      }
    }
    if (!this.manual) this._frame(vw, vh);
    this.cam.x = damp(this.cam.x, this.target.x, 0.0006, dt);
    this.cam.y = damp(this.cam.y, this.target.y, 0.0006, dt);
    this.cam.z = damp(this.cam.z, this.target.z, 0.0006, dt);
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
    const k = clamp01(d);

    // -- the dive: the orb swallows the screen, then the inside fades up -----
    ctx.save();
    ctx.globalAlpha = clamp01(k * 1.6);
    ctx.fillStyle = '#050a0b';
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

    this._drawDeep(ctx, vw, vh, fade);
    const gy = vh / 2 + (10 - this.cam.y) * this.cam.z;
    this._drawGround(ctx, vw, vh, gy);
    this._drawHelix(ctx, vw, vh);
    this._drawBranches(ctx, vw, vh, fade);
    const hover = this._drawNodes(ctx, vw, vh, fade);
    this._drawPulses(ctx, vw, vh);
    this._drawChrome(ctx, vw, vh, fade, hover);

    ctx.restore();
  }

  /** Inside the orb: a warm green deep, with genetic motes suspended in it. */
  _drawDeep(ctx, vw, vh, fade) {
    const bg = ctx.createRadialGradient(vw / 2, vh * 0.58, 10, vw / 2, vh * 0.58, Math.max(vw, vh) * 0.85);
    bg.addColorStop(0, `rgb(${18 + this.flash * 40},${52 + this.flash * 46},${52 + this.flash * 30})`);
    bg.addColorStop(0.5, '#0b1d21');
    bg.addColorStop(1, '#050c0f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, vw, vh);

    for (const m of this.motes) {
      const y = (m.y - this.t * 0.012 * m.s + 2) % 1;
      const x = (m.x + Math.sin(this.t * 0.3 * m.s + m.p) * 0.012 + 1) % 1;
      const px = Math.round(x * vw), py = Math.round(y * vh);
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.2 + m.p));
      ctx.globalAlpha = fade * 0.42 * tw * m.s;
      ctx.fillStyle = m.r ? '#ffe9a8' : '#9fe8d4';
      ctx.fillRect(px, py, 1, 1);
      if (m.s > 0.9) {
        ctx.globalAlpha = fade * 0.14 * tw;
        ctx.fillRect(px - 1, py, 3, 1);
        ctx.fillRect(px, py - 1, 1, 3);
      }
    }
    ctx.globalAlpha = fade;
  }

  _drawGround(ctx, vw, vh, gy) {
    const g = ctx.createLinearGradient(0, gy - 6, 0, vh);
    g.addColorStop(0, 'rgba(46,34,22,0.0)');
    g.addColorStop(0.12, 'rgba(40,30,20,0.62)');
    g.addColorStop(1, 'rgba(14,12,10,0.86)');
    ctx.fillStyle = g;
    ctx.fillRect(0, gy - 6, vw, vh - gy + 6);
    ctx.fillStyle = 'rgba(150,124,82,0.45)';
    ctx.fillRect(0, Math.round(gy), vw, 1);
  }

  /**
   * The helix: two strands winding up inside the trunk, as tall as the trunk
   * has actually grown. This is the tree's genome, and it is why the thing
   * reads as a gene and not as a plant.
   */
  _drawHelix(ctx, vw, vh) {
    let topY = 0;
    for (const n of this.L.nodes) {
      if (n.kind !== 'evo') continue;
      const g = this.grow[n.id] ?? 0;
      if (g > 0.05) topY = Math.min(topY, n.y * g);
    }
    topY = Math.min(topY, TRUNK_BASE * 0.72);   // the sprout still has a genome
    const seed = this.L.by.__root;
    const base = this._toScreen(seed, vw, vh);
    const top = this._toScreen({ x: 0, y: topY - 46 }, vw, vh);
    const h = base.y - top.y;
    if (h < 8) return;
    const z = this.cam.z;
    const amp = 9 * z;
    const turns = h / (34 * z);
    const steps = Math.max(12, Math.round(h / 2));
    const expressed = this.game.economy.genes.size / Math.max(1, GENES.length);

    for (const dir of [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ph = t * turns * TAU + dir * Math.PI + this.t * 0.55;
        const x = base.x + Math.sin(ph) * amp;
        const y = base.y - t * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = dir ? 'rgba(120,224,200,0.30)' : 'rgba(168,232,140,0.34)';
      ctx.lineWidth = Math.max(1, 1.6 * z);
      ctx.stroke();
    }
    // rungs, brighter where the genome is actually filled in
    const rungs = Math.max(4, Math.round(turns * 5));
    for (let i = 0; i <= rungs; i++) {
      const t = i / rungs;
      const ph = t * turns * TAU + this.t * 0.55;
      const s = Math.sin(ph);
      const depth = Math.cos(ph);
      if (depth < -0.1) continue;
      const x0 = base.x + s * amp, x1 = base.x - s * amp;
      const y = base.y - t * h;
      const lit = t < expressed ? 1 : 0.28;
      ctx.globalAlpha = (0.10 + 0.32 * lit) * (0.4 + 0.6 * clamp01(depth));
      ctx.strokeStyle = t < expressed ? '#c9ffe4' : '#6f9a90';
      ctx.lineWidth = Math.max(1, 1.2 * z);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Geometry of one branch, shared by the wood and by the sap pulses. */
  _branchPath(ln, vw, vh) {
    const a = this.L.by[ln.from], b = this.L.by[ln.to];
    if (!a || !b) return null;
    const pa = this._toScreen(a, vw, vh), pb = this._toScreen(b, vw, vh);
    const bend = ln.root ? 10 : ln.trunk ? 6 : 22;
    const mx = (pa.x + pb.x) / 2 + (b.x - a.x) * 0.09;
    const my = (pa.y + pb.y) / 2 - bend * this.cam.z * (ln.root ? -1 : 1);
    return { pa, pb, mx, my };
  }

  _drawBranches(ctx, vw, vh, fade) {
    for (const ln of this.L.links) {
      const child = this.L.by[ln.to];
      const seen = this.seen[child.id] ?? 0;
      if (seen < 0.03) continue;
      const g = this.grow[child.id] ?? 0;
      const path = this._branchPath(ln, vw, vh);
      if (!path) continue;
      const { pa, pb, mx, my } = path;

      // a bud's twig is a stub; a bought node's branch runs the whole way
      const reach = Math.max((ln.root ? 0.85 : 0.58) * seen, g);
      const w0 = ln.w * this.cam.z * lerp(0.42, 1, g);
      const w1 = w0 * (ln.root ? 0.30 : 0.42);
      const steps = 16;
      const left = [], right = [], mid = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * reach;
        const p1 = curveAt(pa, pb, mx, my, t);
        const p2 = curveAt(pa, pb, mx, my, Math.min(1, t + 0.02));
        let nx = -(p2.y - p1.y), ny = p2.x - p1.x;
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const w = lerp(w0, w1, t / Math.max(0.001, reach)) * 0.5;
        left.push({ x: p1.x + nx * w, y: p1.y + ny * w });
        right.push({ x: p1.x - nx * w, y: p1.y - ny * w });
        mid.push(p1);
      }

      ctx.globalAlpha = fade * lerp(0.4, 1, Math.max(g, seen * 0.6)) * (ln.root && g < 0.5 ? 0.5 : 1);
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (const p of left) ctx.lineTo(p.x, p.y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fillStyle = ln.root
        ? (g > 0.5 ? '#4f8f7d' : '#3a5a52')
        : (g > 0.5 ? '#523823' : '#4a3e2c');
      ctx.fill();

      // the lit side of the wood
      if (g > 0.05) {
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (const p of left) ctx.lineTo(p.x, p.y);
        for (let i = left.length - 1; i >= 0; i--) {
          ctx.lineTo(lerp(left[i].x, right[i].x, 0.36), lerp(left[i].y, right[i].y, 0.36));
        }
        ctx.closePath();
        ctx.fillStyle = ln.root ? 'rgba(158,232,208,0.42)' : 'rgba(148,114,72,0.55)';
        ctx.fill();
      }

      // living wood glows faintly along its core
      if (g > 0.4 && !ln.root) {
        ctx.globalAlpha = fade * 0.16 * (0.6 + 0.4 * Math.sin(this.t * 1.3 + ln.w));
        ctx.strokeStyle = '#a8e878';
        ctx.lineWidth = Math.max(1, w1 * 0.8);
        ctx.beginPath();
        mid.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        ctx.globalAlpha = fade;
      }

      // leaves, only on wood that has finished growing
      if (!ln.root && g > 0.25) {
        const leaves = Math.round(3 + ln.w * 1.3);
        const col = ln.branch ? (BRANCHES.find((b) => b.id === ln.branch)?.color || '#8cc468') : '#8cc468';
        for (let i = 0; i < leaves; i++) {
          const t = ((i + 0.6) / leaves) * g;
          if (t > g - 0.06) continue;
          const p1 = curveAt(pa, pb, mx, my, t);
          const sgn = i % 2 ? 1 : -1;
          const sw = Math.sin(this.t * 1.5 + i * 2.1 + ln.w) * 1.3;
          const sz = Math.max(1.4, 2.9 * this.cam.z);
          ctx.globalAlpha = fade * lerp(0.5, 1, g);
          ctx.fillStyle = i % 3 === 0 ? col : '#4f8340';
          ctx.beginPath();
          ctx.ellipse(p1.x + sgn * sz * 1.5 + sw, p1.y - sz * 0.5, sz * 1.25, sz * 0.58, sgn * 0.6, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = fade;
    }
  }

  _drawNodes(ctx, vw, vh, fade) {
    const i = this.game.input;
    let hover = null;

    for (const n of this.L.nodes) {
      const seen = this.seen[n.id] ?? 0;
      if (n.kind === 'label') {
        const anyBud = SKILLS.some((s) => s.branch === n.id.slice(6) && (this.seen['skill:' + s.id] ?? 0) > 0.4);
        if (!anyBud || this.cam.z < 0.45 || this.cam.z > 1.15) continue;
        const p = this._toScreen(n, vw, vh);
        drawText(ctx, n.label.toUpperCase(), p.x, p.y, { color: n.color, align: 'center', alpha: fade * 0.75 });
        continue;
      }
      if (seen < 0.05) continue;
      const p = this._toScreen(n, vw, vh);
      if (p.x < -50 || p.x > vw + 50 || p.y < -50 || p.y > vh + 50) continue;

      const st = this.state(n);
      const g = this.grow[n.id] ?? 0;
      const on = st === 'owned';
      const ready = st === 'ready';
      // a dormant gene is a nodule on a root hair, not a thing to shout about
      const dim = n.kind === 'gene' && !on ? 0.42 : 1;
      const r = n.r * this.cam.z * lerp(0.55, 1, Math.max(g, 0.55)) * seen * (dim < 1 ? 0.82 : 1);
      const hot = Math.hypot(i.sx - p.x, i.sy - p.y) < r + 7;
      if (hot && n.kind !== 'root') hover = { n, p };

      const pulse = ready ? 0.5 + Math.sin(this.t * 3.2 + n.x * 0.02) * 0.5 : 0;

      // halo - owned nodes bloom, buds breathe
      ctx.globalAlpha = fade * seen * dim * (on ? 0.30 : ready ? 0.14 + pulse * 0.24 : 0.06);
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * (2.0 + pulse * 0.5), 0, TAU); ctx.fill();

      ctx.globalAlpha = fade * seen * dim;
      if (on || n.kind === 'root') {
        // an opened node: a glassy bead with the branch colour inside it
        ctx.fillStyle = n.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1, 1.4 * this.cam.z);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.30, p.y - r * 0.32, Math.max(1, r * 0.24), 0, TAU);
        ctx.fill();
      } else {
        // a bud: a closed teardrop, still folded shut
        const rot = -0.5 + Math.sin(this.t * 0.9 + n.x * 0.03) * 0.10;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        ctx.fillStyle = ready ? '#3f5c44' : '#26332e';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.78, r * 1.10, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = hot ? '#dff4e6' : ready ? 'rgba(190,230,170,0.75)' : 'rgba(150,182,168,0.35)';
        ctx.lineWidth = Math.max(1, 1.2 * this.cam.z);
        ctx.stroke();
        // the seam down the bud, lit when it is affordable
        ctx.strokeStyle = ready
          ? `rgba(200,255,190,${0.35 + pulse * 0.5})`
          : 'rgba(160,200,180,0.22)';
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95); ctx.lineTo(0, r * 0.85);
        ctx.stroke();
        ctx.restore();
      }

      if (n.kind === 'evo' && this.cam.z > 0.62) {
        drawText(ctx, n.data.name, p.x, p.y + r + 4,
          { color: on ? '#e8f2d8' : 'rgba(220,236,210,0.55)', align: 'center', alpha: fade * seen });
      }

      if (hot && i.clicked && n.kind !== 'root') {
        i.clicked = false;
        this._buy(n);
      }
    }
    ctx.globalAlpha = fade;
    return hover;
  }

  /** Sap: a bright bead running from the roots into whatever just opened. */
  _drawPulses(ctx, vw, vh) {
    for (const p of this.pulses) {
      const ln = p.ln;
      const path = this._branchPath(ln, vw, vh);
      if (!path) continue;
      const t = clamp01(p.t);
      const c = curveAt(path.pa, path.pb, path.mx, path.my, t);
      const a = Math.sin(t * Math.PI);
      const r = Math.max(1.6, 3.4 * this.cam.z) * (0.6 + a * 0.6);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3.6);
      g.addColorStop(0, `rgba(226,255,224,${0.85 * a})`);
      g.addColorStop(0.35, `rgba(150,236,180,${0.45 * a})`);
      g.addColorStop(1, 'rgba(120,220,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.6, 0, TAU); ctx.fill();
    }
  }

  _drawChrome(ctx, vw, vh, fade, hover) {
    const e = this.game.economy;
    const total = EVOLUTIONS.length + SKILLS.length;
    const open = e.evolutions.size + e.skills.size;
    drawText(ctx, 'THE TREE OF LIFE', vw / 2, 8, { color: '#cfe8d8', align: 'center' });
    drawText(ctx,
      `${Math.round(e.nutrients)} nutrients   ${e.genes.size}/${GENES.length} genes expressed   ${open}/${total} grown`,
      vw / 2, 20, { color: 'rgba(200,226,210,0.6)', align: 'center' });
    drawText(ctx, this.manual ? 'drag to look around   esc to wake up' : 'esc to wake up',
      vw / 2, vh - 12, { color: 'rgba(200,226,210,0.4)', align: 'center' });

    if (hover) this._tip(ctx, hover.n, hover.p, vw, vh);
    if (this.toast) {
      const w = Math.min(vw - 30, textWidth(this.toast) + 18);
      ctx.fillStyle = 'rgba(8,20,20,0.9)';
      ctx.fillRect((vw - w) / 2, vh - 42, w, 14);
      ctx.strokeStyle = 'rgba(140,196,104,0.5)';
      ctx.strokeRect((vw - w) / 2 + 0.5, vh - 41.5, w - 1, 13);
      drawText(ctx, this.toast, vw / 2, vh - 39, { color: '#cfe8d8', align: 'center' });
    }
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
      title = d.name; cost = e.genes.has(d.id) ? 'expressed' : 'dormant';
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

  /** Sap runs from the seed out to whatever just opened, one branch at a time. */
  _sap(id) {
    const chain = [];
    let cur = id;
    for (let i = 0; i < 12 && cur && cur !== '__root'; i++) {
      const node = this.L.by[cur];
      const ln = this.L.links.find((l) => l.to === cur);
      if (!ln) break;
      chain.unshift(ln);
      cur = ln.from;
    }
    chain.forEach((ln, i) => this.pulses.push({ ln, t: -i * 0.55, dur: 0.55 }));
    this.flash = 1;
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
      if (e.buySkill(n.data.id)) {
        this.say(`${n.data.name} learned.`);
        this._sap(n.id);
        this.game.audio?.play('grow');
      } else this.say(st === 'locked' ? 'The branch has not reached that far yet.' : 'Not enough nutrients.');
      return;
    }
    if (n.kind === 'evo') {
      if (e.evolve(n.data.id)) {
        this.say(`${n.data.name}. Something in you unfolds.`);
        this._sap(n.id);
        this.game.audio?.play('evolve');
      } else if (st === 'genes') {
        this.say('Missing genes: ' + e.missingGenes(n.data.genes).map((g) => GENE_BY_ID[g]?.name || g).join(', '));
      } else if (st === 'locked') this.say('An earlier form first.');
      else this.say('Not enough nutrients.');
    }
  }
}
