// CRABDEN - the inside of you.
//
// The gene orb on your back is not a menu button. Looking into it takes you
// down through your own shell - rock, then chitin, then pearl - and into the
// body cavity, and what you find there is the tree: a seed in the middle of
// you with roots in your gut and branches running out to the four organs that
// actually do the work.
//
// So an upgrade is not a checkbox. Buying into the Spring bough grows the
// bladder that holds your water. Buying into Fleet thickens the ganglion that
// hears the desert. The organ on screen is the upgrade, and the tree is your
// nervous system reaching it.
//
// Everything you can become is one animal, and it is this one.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic, easeInOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, LINE_H } from '../lib/font.js';
import { SKILLS, SKILL_BY_ID, BRANCHES, EVOLUTIONS, GENES, GENE_BY_ID } from '../data/progress.js';
import { organArt, orbArt } from '../art/anatomy.js';

// where each organ hangs in the body cavity, in body-space units
const ORGANS = {
  water:  { organ: 'spring',   x: -246, y: -118, name: 'The Spring', colour: '#5fc6d8' },
  garden: { organ: 'gut',      x: -238, y:  148, name: 'The Gut',    colour: '#8cc468' },
  fleet:  { organ: 'ganglion', x:  238, y:  146, name: 'The Knot',   colour: '#e2b74a' },
  body:   { organ: 'heart',    x:  246, y: -122, name: 'The Heart',  colour: '#c8925f' },
};

// The animal, seen from above and through, in body-space units. Everything
// inside is arranged to fit under this carapace.
const CARA = { cx: 0, cy: -30, rx: 430, ry: 300 };
const GILL_X = 344;

const TRUNK_BASE = -96;      // first evolution, above the seed
const TRUNK_STEP = 36;       // the last one all but touches the shell

/** Lay the whole animal out once. Positions never move; visibility does. */
function layout() {
  const nodes = [];
  const links = [];

  nodes.push({ id: '__root', kind: 'root', x: 0, y: 0, r: 13, color: '#a8e878' });

  // -- the trunk runs up out of the seed toward the shell -------------------
  EVOLUTIONS.forEach((e, i) => {
    nodes.push({
      id: 'evo:' + e.id, kind: 'evo', data: e, tier: i,
      x: (i % 2 ? 1 : -1) * 11,
      y: TRUNK_BASE - i * TRUNK_STEP,
      r: 11, color: '#c9e08a',
    });
    links.push({
      from: i === 0 ? '__root' : 'evo:' + EVOLUTIONS[i - 1].id, to: 'evo:' + e.id,
      w: 25 - i * 2.2, trunk: true,
    });
  });

  // -- a bough per organ, reaching out from the seed and into it ------------
  BRANCHES.forEach((br) => {
    const org = ORGANS[br.id];
    const dist = Math.hypot(org.x, org.y);
    const dx = org.x / dist, dy = org.y / dist;
    const px = -dy, py = dx;
    const list = SKILLS.filter((s) => s.branch === br.id);

    for (const s of list) {
      const along = dist * (0.38 + s.x * 0.225);
      const off = s.y * 42 * (0.55 + s.x * 0.22);
      nodes.push({
        id: 'skill:' + s.id, kind: 'skill', data: s, branch: br.id, tier: s.x,
        x: dx * along + px * off, y: dy * along + py * off,
        r: 8, color: br.color,
      });
      if (!s.req.length) links.push({ from: '__root', to: 'skill:' + s.id, w: 11, branch: br.id });
      else for (const r of s.req) {
        links.push({ from: 'skill:' + r, to: 'skill:' + s.id, w: 9.5 - s.x * 1.6, branch: br.id });
      }
    }
  });

  // -- the roots: the genes, spread under the seed --------------------------
  GENES.forEach((g, i) => {
    const t = (i + 0.5) / GENES.length;
    const a = Math.PI * (0.10 + t * 0.80);
    const d = 62 + (i % 4) * 22;
    nodes.push({
      id: 'gene:' + g.id, kind: 'gene', data: g,
      x: -Math.cos(a) * d * 1.15, y: Math.sin(a) * d * 0.50 + 60,
      r: 5, color: '#7fe0c8',
    });
    links.push({ from: '__root', to: 'gene:' + g.id, w: 6.5, root: true });
  });

  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return { nodes, links, by };
}

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
    this.cam = { x: 0, y: -30, z: 1.3 };
    this.target = { x: 0, y: -30, z: 1.3 };
    this.grow = {};
    this.seen = {};
    this.pulses = [];
    this.motes = [];
    this.t = 0;
    this.beat = 0;               // 0..1 through one heartbeat
    this.dive = 0;
    this.diving = false;
    this.manual = false;
    this.toast = null;
    this.toastT = 0;
    this.flash = 0;
  }

  open(fromX, fromY, vw = 460, vh = 258) {
    this.diving = true;
    this.dive = 0;
    this.manual = false;
    this.from = { x: fromX, y: fromY };
    this.t = 0;
    this.pulses.length = 0;
    for (const n of this.L.nodes) {
      this.grow[n.id] = this.owned(n) ? 1 : 0;
      this.seen[n.id] = this.visible(n) ? 1 : 0;
    }
    this._frame(vw, vh, true);
    this.motes = [];
    for (let i = 0; i < 64; i++) {
      this.motes.push({
        x: Math.random(), y: Math.random(), s: 0.3 + Math.random() * 0.9,
        p: Math.random() * TAU, r: Math.random() < 0.22 ? 1 : 0,
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

  /** One step of foresight: what you own, and the buds directly on it. */
  visible(n) {
    if (n.kind === 'root' || n.kind === 'gene') return true;
    if (this.owned(n)) return true;
    const e = this.game.economy;
    if (n.kind === 'evo') {
      return n.tier === 0 || e.evolutions.has(EVOLUTIONS[n.tier - 1].id);
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

  /** How developed one organ is: the fraction of its bough you have grown. */
  organLevel(branchId) {
    const list = SKILLS.filter((s) => s.branch === branchId);
    if (!list.length) return 0;
    const e = this.game.economy;
    const n = list.reduce((k, s) => k + (e.skills.has(s.id) ? 1 : 0), 0);
    return n / list.length;
  }

  say(msg, secs = 3.5) { this.toast = msg; this.toastT = secs; }

  // -------------------------------------------------------------------------

  _frame(vw, vh, snap = false) {
    let x0 = -560, x1 = 560, y0 = -380, y1 = 340;
    for (const n of this.L.nodes) {
      if (n.kind === 'gene' && (this.grow[n.id] ?? 0) < 0.5) continue;
      const a = Math.max(this.grow[n.id] ?? 0, (this.seen[n.id] ?? 0) * 0.9);
      if (a < 0.05) continue;
      const r = n.r + 26;
      x0 = Math.min(x0, n.x - r); x1 = Math.max(x1, n.x + r);
      y0 = Math.min(y0, n.y - r); y1 = Math.max(y1, n.y + r);
    }
    // an organ you have started growing pulls the frame out to include it
    for (const br of BRANCHES) {
      if (this.organLevel(br.id) <= 0) continue;
      const o = ORGANS[br.id];
      x0 = Math.min(x0, o.x - 96); x1 = Math.max(x1, o.x + 96);
      y0 = Math.min(y0, o.y - 88); y1 = Math.max(y1, o.y + 88);
    }
    const w = Math.max(150, x1 - x0), h = Math.max(150, y1 - y0);
    const z = clamp(Math.min((vw - 30) / w, (vh - 96) / h), 0.20, 0.98);
    this.target.x = (x0 + x1) / 2;
    this.target.y = (y0 + y1) / 2;
    this.target.z = z;
    if (snap) { this.cam.x = this.target.x; this.cam.y = this.target.y; this.cam.z = this.target.z; }
  }

  update(dt, vw, vh) {
    this.t += dt;
    this.beat = (this.beat + dt / 1.05) % 1;
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toast = null; }
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.dive = damp(this.dive, this.diving ? 1 : 0, 0.00055, dt);
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
        this.target.z = clamp(this.target.z * Math.pow(1.22, -i.wheel), 0.24, 2.4);
      }
      const ax = i.axis();
      if (ax.len > 0.1) {
        this.manual = true;
        this.target.x += ax.x * 230 * dt; this.target.y += ax.y * 230 * dt;
      }
      if (this.manual) {
        this.target.x = clamp(this.target.x, -420, 420);
        this.target.y = clamp(this.target.y, -780, 300);
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

    // -- going in ------------------------------------------------------------
    // Three stages, because you are passing through three real things: the orb
    // swallows the screen, the shell's laminate rushes past, and then you are
    // inside and it settles.
    if (k < 0.66) {
      ctx.save();
      ctx.fillStyle = '#050a0b';
      ctx.globalAlpha = clamp01(k * 2.4);
      ctx.fillRect(0, 0, vw, vh);
      if (k < 0.30) {
        const t = k / 0.30;
        const r = lerp(9, Math.hypot(vw, vh) * 0.62, easeOutCubic(t));
        const cx = lerp(this.from ? this.from.x : vw / 2, vw / 2, easeInOutCubic(t));
        const cy = lerp(this.from ? this.from.y : vh / 2, vh / 2, easeInOutCubic(t));
        ctx.globalAlpha = 1;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, '#d8ffe8');
        g.addColorStop(0.28, '#3fae64');
        g.addColorStop(0.7, '#0d2a2c');
        g.addColorStop(1, 'rgba(10,20,22,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
        ctx.restore();
        return;
      }
      // through the shell: bands of rock, chitin and pearl rushing outward
      this._drawDescent(ctx, vw, vh, (k - 0.30) / 0.36);
      ctx.restore();
      if (k < 0.52) return;
    }

    const fade = clamp01((k - 0.52) / 0.34);
    ctx.save();
    ctx.globalAlpha = fade;

    this._drawGalaxy(ctx, vw, vh, fade);
    this._drawAnimal(ctx, vw, vh, fade);
    this._drawOrgans(ctx, vw, vh, fade, false);
    this._drawBranches(ctx, vw, vh, fade);
    this._drawOrgans(ctx, vw, vh, fade, true);
    const hover = this._drawNodes(ctx, vw, vh, fade);
    this._drawPulses(ctx, vw, vh);

    // deep inside something: the corners fall away into nothing
    const vg = ctx.createRadialGradient(
      vw / 2, vh * 0.50, Math.min(vw, vh) * 0.28,
      vw / 2, vh * 0.50, Math.max(vw, vh) * 0.74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.62, 'rgba(6,3,5,0.52)');
    vg.addColorStop(1, 'rgba(4,2,3,0.86)');
    ctx.globalAlpha = fade;
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);

    this._drawSequence(ctx, vw, vh, fade);
    this._drawChrome(ctx, vw, vh, fade, hover);

    ctx.restore();
  }

  /** Falling through your own shell: rock, chitin, nacre, then the cavity. */
  _drawDescent(ctx, vw, vh, t) {
    const cx = vw / 2, cy = vh / 2;
    const layers = [
      { at: 0.00, c0: '#6b563d', c1: '#33291f', label: 'ROCK' },
      { at: 0.34, c0: '#68432c', c1: '#1d1210', label: 'CHITIN' },
      { at: 0.68, c0: '#8d94ab', c1: '#2c2b33', label: 'PEARL' },
    ];
    ctx.globalAlpha = 1;
    for (const L of layers) {
      const lt = (t - L.at) / 0.42;
      if (lt < 0 || lt > 1.6) continue;
      const r = lerp(12, Math.hypot(vw, vh) * 0.95, easeOutCubic(clamp01(lt)));
      const a = clamp01(1.4 - lt);
      const g = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, L.c0);
      g.addColorStop(1, L.c1);
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      // the strata inside the layer, as concentric rings streaking past
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      for (let i = 0; i < 7; i++) {
        const rr = r * (0.62 + i * 0.055);
        ctx.lineWidth = 1 + (i % 3);
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      }
      if (a > 0.35) {
        drawText(ctx, L.label, cx, cy + r * 0.70, {
          color: '#f2e4c2', align: 'center', alpha: (a - 0.35) * 0.9,
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Outside you there is nothing but the sky you have never seen, because you
   * have been under a shell for a thousand years. It is drawn as one: a slow
   * galaxy, parallaxed against the camera so the animal sits in front of it.
   */
  _drawGalaxy(ctx, vw, vh, fade) {
    const px = -this.cam.x * 0.05, py = -this.cam.y * 0.05;
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, vw, vh);

    // the arm of the galaxy: soft coloured clouds lying across the sky
    const clouds = [
      { x: 0.22, y: 0.30, r: 0.62, c: '90,60,150' },
      { x: 0.74, y: 0.24, r: 0.52, c: '40,90,160' },
      { x: 0.52, y: 0.72, r: 0.70, c: '150,60,110' },
      { x: 0.12, y: 0.80, r: 0.44, c: '40,120,140' },
      { x: 0.88, y: 0.66, r: 0.48, c: '110,70,170' },
    ];
    for (const c of clouds) {
      const cx = c.x * vw + px * 0.6, cy = c.y * vh + py * 0.6;
      const r = c.r * Math.max(vw, vh) * (0.55 + Math.sin(this.t * 0.16 + c.x * 9) * 0.03);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${c.c},0.26)`);
      g.addColorStop(0.45, `rgba(${c.c},0.11)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
    // the band of the arm itself, dense with unresolved stars
    ctx.save();
    ctx.translate(vw / 2 + px, vh * 0.46 + py);
    ctx.rotate(-0.30);
    const bg = ctx.createLinearGradient(0, -vh * 0.30, 0, vh * 0.30);
    bg.addColorStop(0, 'rgba(90,110,190,0)');
    bg.addColorStop(0.5, 'rgba(150,160,220,0.11)');
    bg.addColorStop(1, 'rgba(90,110,190,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(-vw, -vh * 0.30, vw * 2, vh * 0.60);
    ctx.restore();

    // stars, in three parallax layers so the sky has depth
    for (let layer = 0; layer < 3; layer++) {
      const n = 90 - layer * 22;
      const par = 0.03 + layer * 0.05;
      for (let i = 0; i < n; i++) {
        const h1 = Math.sin(i * 12.9898 + layer * 3.7) * 43758.5453;
        const h2 = Math.sin(i * 78.233 + layer * 1.3) * 43758.5453;
        const sx = (((h1 - Math.floor(h1)) * vw - this.cam.x * par) % vw + vw) % vw;
        const sy = (((h2 - Math.floor(h2)) * vh - this.cam.y * par) % vh + vh) % vh;
        const tw = 0.45 + 0.55 * Math.sin(this.t * (0.6 + layer * 0.5) + i);
        ctx.globalAlpha = fade * (0.20 + layer * 0.22) * tw;
        ctx.fillStyle = i % 7 === 0 ? '#ffd9a8' : i % 5 === 0 ? '#a8c8ff' : '#ffffff';
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        if (layer === 2 && i % 11 === 0) {
          ctx.globalAlpha = fade * 0.18 * tw;
          ctx.fillRect(Math.round(sx) - 1, Math.round(sy), 3, 1);
          ctx.fillRect(Math.round(sx), Math.round(sy) - 1, 1, 3);
        }
      }
    }
    ctx.globalAlpha = fade;
  }

  /** Body space to screen, for the outline paths. */
  _S(x, y, vw, vh) {
    return {
      x: vw / 2 + (x - this.cam.x) * this.cam.z,
      y: vh / 2 + (y - this.cam.y) * this.cam.z,
    };
  }

  /**
   * You, from above and through: the carapace, eight legs, two claws, the
   * eyestalks. Drawn as a lit outline over a dark body, which is the honest
   * way to show an animal you are standing inside.
   */
  _drawAnimal(ctx, vw, vh, fade) {
    const z = this.cam.z;
    const P = (x, y) => this._S(x, y, vw, vh);
    const lw = Math.max(1, 1.6 * z);
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);

    // a limb is a smooth chain, not a polyline: a crab's leg bends, it does
    // not kink, and at this size a corner reads as a mistake
    const limb = (pts, w) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const trace = () => {
        ctx.beginPath();
        const s0 = P(pts[0][0], pts[0][1]);
        ctx.moveTo(s0.x, s0.y);
        for (let i = 1; i < pts.length - 1; i++) {
          const a2 = P(pts[i][0], pts[i][1]);
          const b2 = P(pts[i + 1][0], pts[i + 1][1]);
          ctx.quadraticCurveTo(a2.x, a2.y, (a2.x + b2.x) / 2, (a2.y + b2.y) / 2);
        }
        const last = P(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        ctx.lineTo(last.x, last.y);
      };
      trace();
      ctx.strokeStyle = 'rgba(6,9,14,0.95)';
      ctx.lineWidth = w * z + lw * 2.4;
      ctx.stroke();
      trace();
      ctx.strokeStyle = 'rgba(104,150,172,0.85)';
      ctx.lineWidth = w * z;
      ctx.stroke();
      trace();
      ctx.strokeStyle = 'rgba(198,238,246,0.50)';
      ctx.lineWidth = Math.max(1, w * z * 0.34);
      ctx.stroke();
    };

    for (const side of [-1, 1]) {
      // four legs a side, each leaving the rim, lifting to a knee and coming
      // back down outside it - which is the shape of a crab from above
      for (let i = 0; i < 4; i++) {
        const t = i / 3;
        const th = (-0.62 + t * 1.30) * side;             // where it leaves the rim
        const hx = Math.sin(th) * CARA.rx * 0.96;
        const hy = CARA.cy + Math.cos(th) * CARA.ry * -0.30 + 30;
        const out = side * (150 + t * 40);
        const wob = Math.sin(this.t * 0.9 + i * 1.3 + (side > 0 ? 0 : 2)) * 8;
        limb([
          [hx, hy],
          [hx + out * 0.75, hy - 34 - t * 26 + wob],       // knee, up and out
          [hx + out * 1.75, hy + 40 + wob * 0.6],
          [hx + out * 2.15, hy + 210 + t * 60 + wob],      // the foot
        ], 24 - i * 2.4);
      }
      // the claw: an arm out in front, then a pincer that actually opens
      const ax = side * CARA.rx * 0.52, ay = CARA.cy + CARA.ry * 0.62;
      const open = 0.16 + Math.sin(this.t * 0.8 + side) * 0.10;
      const wx = ax + side * 210, wy = ay + 210;
      limb([[ax, ay], [ax + side * 120, ay + 40], [wx, wy]], 32);
      const wrist = P(wx, wy);
      for (const [ang, len, w] of [[0.30 + open, 165, 22], [1.05 - open, 130, 16]]) {
        const tipx = wx + side * Math.sin(ang) * len, tipy = wy + Math.cos(ang) * len;
        const bendx = wx + side * Math.sin(ang * 0.5) * len * 0.6, bendy = wy + Math.cos(ang * 0.5) * len * 0.55;
        const bend = P(bendx, bendy), tip = P(tipx, tipy);
        ctx.beginPath();
        ctx.moveTo(wrist.x, wrist.y);
        ctx.quadraticCurveTo(bend.x, bend.y, tip.x, tip.y);
        ctx.strokeStyle = 'rgba(6,9,14,0.95)';
        ctx.lineWidth = w * z + lw * 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wrist.x, wrist.y);
        ctx.quadraticCurveTo(bend.x, bend.y, tip.x, tip.y);
        ctx.strokeStyle = 'rgba(126,178,200,0.9)';
        ctx.lineWidth = w * z;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wrist.x, wrist.y);
        ctx.quadraticCurveTo(bend.x, bend.y, tip.x, tip.y);
        ctx.strokeStyle = 'rgba(206,240,248,0.45)';
        ctx.lineWidth = Math.max(1, w * z * 0.30);
        ctx.stroke();
      }
    }

    // -- the carapace --------------------------------------------------------
    const c = P(CARA.cx, CARA.cy);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, CARA.rx * z, CARA.ry * z, 0, 0, TAU);
    const bg2 = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, CARA.rx * z);
    bg2.addColorStop(0, `rgba(${28 + beat * 22},${20 + beat * 10},${30 + beat * 16},0.90)`);
    bg2.addColorStop(0.7, 'rgba(16,12,18,0.93)');
    bg2.addColorStop(1, 'rgba(8,8,14,0.96)');
    ctx.fillStyle = bg2;
    ctx.fill();
    ctx.restore();

    const ring = (rx, ry, dark, light, w) => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx * z, ry * z, 0, 0, TAU);
      if (dark !== 'none') { ctx.strokeStyle = dark; ctx.lineWidth = w + lw * 2; ctx.stroke(); }
      ctx.strokeStyle = light; ctx.lineWidth = w; ctx.stroke();
    };
    ring(CARA.rx, CARA.ry, 'rgba(8,10,16,0.95)', 'rgba(150,208,220,0.70)', Math.max(1, 2.2 * z));
    ring(CARA.rx * 0.90, CARA.ry * 0.88, 'none', 'rgba(120,178,196,0.22)', Math.max(1, 1.2 * z));

    // the basin on your back, seen through the shell
    const bx = P(0, CARA.cy - 90);
    ctx.beginPath();
    ctx.ellipse(bx.x, bx.y, 150 * z, 96 * z, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(120,178,196,0.26)';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.stroke();

    // segment lines running across the carapace, the way a shell is built
    for (let i = -2; i <= 2; i++) {
      const yy = CARA.cy + i * CARA.ry * 0.32;
      const half = CARA.rx * Math.sqrt(Math.max(0, 1 - Math.pow((yy - CARA.cy) / CARA.ry, 2)));
      const p0 = P(-half * 0.94, yy), p1 = P(half * 0.94, yy);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.strokeStyle = 'rgba(110,164,182,0.13)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // the eyestalks, at the front, which is the bottom of this view
    for (const side of [-1, 1]) {
      const e0 = P(side * 74, CARA.cy + CARA.ry * 0.80);
      const e1 = P(side * 104, CARA.cy + CARA.ry * 1.22);
      ctx.beginPath();
      ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y);
      ctx.strokeStyle = 'rgba(150,208,220,0.6)';
      ctx.lineWidth = Math.max(1.5, 6 * z);
      ctx.stroke();
      ctx.fillStyle = '#0d0b10';
      ctx.beginPath(); ctx.arc(e1.x, e1.y, Math.max(2.4, 13 * z), 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,208,220,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(e1.x, e1.y, Math.max(2.4, 13 * z), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(215,245,255,0.9)';
      ctx.beginPath(); ctx.arc(e1.x - 4 * z, e1.y - 4 * z, Math.max(1, 4 * z), 0, TAU); ctx.fill();
    }

    // haemolymph drifting through the body cavity
    for (const m of this.motes) {
      const yy = (m.y - this.t * 0.010 * m.s + 2) % 1;
      const xx = (m.x + Math.sin(this.t * 0.26 * m.s + m.p) * 0.014 + 1) % 1;
      const bxp = lerp(-CARA.rx, CARA.rx, xx), byp = CARA.cy + lerp(-CARA.ry, CARA.ry, yy);
      if ((bxp / CARA.rx) ** 2 + ((byp - CARA.cy) / CARA.ry) ** 2 > 0.92) continue;
      const sp = P(bxp, byp);
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + m.p)) + beat * 0.4;
      ctx.globalAlpha = fade * 0.40 * tw * m.s;
      ctx.fillStyle = m.r ? '#cd7a6c' : '#9fe8d4';
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
    }
    ctx.globalAlpha = fade;
  }

  /**
   * The genome, read out along the bottom of the screen: one codon per gene,
   * lit where you are expressing it.
   */
  _drawSequence(ctx, vw, vh, fade) {
    const e = this.game.economy;
    const n = GENES.length;
    const w = Math.min(vw - 40, n * 9);
    const x0 = (vw - w) / 2, y0 = vh - 26;
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      const g = GENES[i];
      const on = e.genes.has(g.id);
      const x = x0 + i * cw;
      const pulse = on ? 0.6 + 0.4 * Math.sin(this.t * 2.4 - i * 0.4) : 0;
      ctx.globalAlpha = fade * (on ? 0.55 + pulse * 0.45 : 0.22);
      ctx.fillStyle = on ? '#7fe0c8' : '#3c4a48';
      ctx.fillRect(Math.round(x), Math.round(y0), Math.max(1, Math.round(cw - 2)), 5);
      ctx.fillStyle = on ? '#c9fff0' : '#2b3634';
      ctx.fillRect(Math.round(x), Math.round(y0), Math.max(1, Math.round(cw - 2)), 1);
    }
    ctx.globalAlpha = fade * 0.55;
    drawText(ctx, `GENOME  ${e.genes.size}/${n} EXPRESSED`, vw / 2, y0 - 10,
      { color: '#7fe0c8', align: 'center' });
    ctx.globalAlpha = fade;
  }

  /**
   * The organs. `front` splits them either side of the connections, so a nerve
   * runs behind the gill stacks but in front of the body wall.
   */
  _drawOrgans(ctx, vw, vh, fade, front) {
    const z = this.cam.z;
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);

    if (!front) {
      // the gills sit against the inside of the shell, either side, always
      // there and always working
      const lv = clamp01(this.organLevel('water') * 0.5 + this.organLevel('body') * 0.5);
      for (const side of [-1, 1]) {
        const p = this._toScreen({ x: side * GILL_X, y: CARA.cy + 10 }, vw, vh);
        if (p.x < -160 || p.x > vw + 160) continue;
        const art = organArt(side < 0 ? 'gillL' : 'gillR', z, lv);
        const br = 0.5 + 0.5 * Math.sin(this.t * 0.9 + side);
        ctx.globalAlpha = fade * (0.40 + lv * 0.36);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, 1 + br * 0.035);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
      }
      ctx.globalAlpha = fade;
      return;
    }

    for (const br of BRANCHES) {
      const o = ORGANS[br.id];
      const lv = this.organLevel(br.id);
      const p = this._toScreen(o, vw, vh);
      if (p.x < -180 || p.x > vw + 180 || p.y < -180 || p.y > vh + 180) continue;
      const art = organArt(o.organ, z, lv);

      // each organ moves the way that organ moves
      let sx = 1, sy = 1, glow = 0;
      if (o.organ === 'heart') {
        const k = 1 + beat * 0.11 * (0.6 + lv * 0.6);
        sx = k; sy = k; glow = beat * (0.20 + lv * 0.4);
      } else if (o.organ === 'spring') {
        sy = 1 + Math.sin(this.t * 1.15) * 0.030;
        sx = 1 - Math.sin(this.t * 1.15) * 0.020;
        glow = 0.10 + lv * 0.16;
      } else if (o.organ === 'gut') {
        sx = 1 + Math.sin(this.t * 0.8) * 0.022;
        sy = 1 + Math.sin(this.t * 0.8 + 1.7) * 0.022;
      } else if (o.organ === 'ganglion') {
        const fire = Math.pow(0.5 + 0.5 * Math.sin(this.t * 3.1), 6);
        glow = (0.14 + lv * 0.5) * (0.4 + fire);
        sx = sy = 1 + fire * 0.03;
      }

      const vis = 0.34 + lv * 0.66;
      if (glow > 0.01) {
        ctx.globalAlpha = fade * glow * 0.5;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, art.cv.width * 0.72);
        g.addColorStop(0, o.colour);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, art.cv.width * 0.72, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = fade * vis;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(sx, sy);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();

      if (z > 0.45) {
        drawText(ctx, o.name.toUpperCase(), p.x, p.y + art.cv.height * 0.5 + 4, {
          color: o.colour, align: 'center', alpha: fade * (0.35 + lv * 0.45),
        });
      }
    }
    ctx.globalAlpha = fade;
  }

  _branchPath(ln, vw, vh) {
    const a = this.L.by[ln.from], b = this.L.by[ln.to];
    if (!a || !b) return null;
    const pa = this._toScreen(a, vw, vh), pb = this._toScreen(b, vw, vh);
    const bend = ln.root ? 9 : ln.trunk ? 5 : 18;
    const mx = (pa.x + pb.x) / 2 + (b.x - a.x) * 0.08;
    const my = (pa.y + pb.y) / 2 - bend * this.cam.z * (ln.root ? -1 : 1);
    return { pa, pb, mx, my };
  }

  /**
   * The connections. Inside a body these are nerve and vessel rather than
   * wood, and what matters is that you can see at a glance what leads to what,
   * so each one is a clean bright line with a dark line under it - and a bead
   * of something running along it, in the colour of the organ it feeds.
   */
  _drawBranches(ctx, vw, vh, fade) {
    const z = this.cam.z;
    for (const ln of this.L.links) {
      const child = this.L.by[ln.to];
      const seen = this.seen[child.id] ?? 0;
      if (seen < 0.03) continue;
      const g = this.grow[child.id] ?? 0;
      const path = this._branchPath(ln, vw, vh);
      if (!path) continue;
      const { pa, pb, mx, my } = path;

      const reach = Math.max((ln.root ? 0.9 : 0.62) * seen, g);
      const steps = 18;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        pts.push(curveAt(pa, pb, mx, my, (i / steps) * reach));
      }
      const trace = () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      };

      const colour = ln.branch ? (BRANCHES.find((b) => b.id === ln.branch)?.color || '#8cc468')
        : ln.root ? '#7fe0c8' : '#c9e08a';
      const wide = Math.max(1.4, (ln.trunk ? 4.2 : ln.root ? 2.2 : 2.8) * z * lerp(0.55, 1, g));

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // a dark line under everything, so a connection reads over any organ
      ctx.globalAlpha = fade * lerp(0.5, 1, Math.max(g, seen * 0.7));
      trace();
      ctx.strokeStyle = 'rgba(6,8,12,0.9)';
      ctx.lineWidth = wide + Math.max(1.6, 2.4 * z);
      ctx.stroke();
      // the line itself
      trace();
      ctx.strokeStyle = g > 0.4 ? colour : 'rgba(150,168,178,0.42)';
      ctx.lineWidth = wide;
      ctx.stroke();
      // and a bright core down the middle of a grown one
      if (g > 0.4) {
        ctx.globalAlpha = fade * 0.55;
        trace();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(1, wide * 0.30);
        ctx.stroke();
      }

      // something running along it, always in the same direction: outward
      if (g > 0.5) {
        const flow = ((this.t * 0.42 + ln.w * 0.11) % 1) * reach;
        const bead = curveAt(pa, pb, mx, my, flow);
        ctx.globalAlpha = fade * (0.45 + 0.35 * Math.sin(this.t * 3 + ln.w));
        const gg = ctx.createRadialGradient(bead.x, bead.y, 0, bead.x, bead.y, wide * 2.4);
        gg.addColorStop(0, '#ffffff');
        gg.addColorStop(0.4, colour);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(bead.x, bead.y, wide * 2.4, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = fade;
    }
  }

  _drawNodes(ctx, vw, vh, fade) {
    const i = this.game.input;
    let hover = null;

    for (const n of this.L.nodes) {
      const seen = this.seen[n.id] ?? 0;
      if (seen < 0.05) continue;
      const p = this._toScreen(n, vw, vh);
      if (p.x < -50 || p.x > vw + 50 || p.y < -50 || p.y > vh + 50) continue;

      const st = this.state(n);
      const g = this.grow[n.id] ?? 0;
      const on = st === 'owned';
      const ready = st === 'ready';
      const dim = n.kind === 'gene' && !on ? 0.42 : 1;
      const r = n.r * this.cam.z * lerp(0.55, 1, Math.max(g, 0.55)) * seen * (dim < 1 ? 0.82 : 1);
      const hot = Math.hypot(i.sx - p.x, i.sy - p.y) < r + 7;
      if (hot && n.kind !== 'root') hover = { n, p };

      const pulse = ready ? 0.5 + Math.sin(this.t * 3.2 + n.x * 0.02) * 0.5 : 0;

      ctx.globalAlpha = fade * seen * dim * (on ? 0.30 : ready ? 0.14 + pulse * 0.24 : 0.06);
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * (2.0 + pulse * 0.5), 0, TAU); ctx.fill();

      ctx.globalAlpha = fade * seen * dim;
      if (n.kind === 'root') {
        // the seed itself, which is a painted thing rather than a dot
        const art = organArt('seed', this.cam.z, clamp01(this.game.economy.genes.size / 8));
        const b2 = 1 + Math.sin(this.t * 1.6) * 0.04;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(b2, b2);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
      } else {
        // a real bead: lit from inside when you own it, shut when you do not
        const art = orbArt(n.color, r * (on ? 1 : 0.88), on);
        ctx.save();
        ctx.translate(p.x, p.y);
        if (!on && ready) ctx.rotate(Math.sin(this.t * 0.9 + n.x * 0.03) * 0.10);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
        if (hot) {
          ctx.strokeStyle = 'rgba(246,240,220,0.9)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, art.r + 2.5, 0, TAU); ctx.stroke();
        }
      }

      if (n.kind === 'evo' && this.cam.z > 0.58) {
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

  _drawPulses(ctx, vw, vh) {
    for (const p of this.pulses) {
      const path = this._branchPath(p.ln, vw, vh);
      if (!path) continue;
      const t = clamp01(p.t);
      const c = curveAt(path.pa, path.pb, path.mx, path.my, t);
      const a = Math.sin(t * Math.PI);
      const r = Math.max(1.6, 3.4 * this.cam.z) * (0.6 + a * 0.6);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3.6);
      g.addColorStop(0, `rgba(255,246,224,${0.9 * a})`);
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
    drawText(ctx, 'INSIDE YOU', vw / 2, 8, { color: '#e8cfc8', align: 'center' });
    drawText(ctx,
      `${Math.round(e.nutrients)} nutrients   ${e.genes.size}/${GENES.length} genes expressed   ${open}/${total} grown`,
      vw / 2, 20, { color: 'rgba(226,200,200,0.6)', align: 'center' });
    drawText(ctx, this.manual ? 'drag to look around   esc to wake up' : 'esc to wake up',
      vw / 2, vh - 12, { color: 'rgba(226,200,200,0.4)', align: 'center' });

    if (hover) this._tip(ctx, hover.n, hover.p, vw, vh);
    if (this.toast) {
      const w = Math.min(vw - 30, textWidth(this.toast) + 18);
      ctx.fillStyle = 'rgba(20,10,12,0.92)';
      ctx.fillRect((vw - w) / 2, vh - 42, w, 14);
      ctx.strokeStyle = 'rgba(196,140,140,0.5)';
      ctx.strokeRect((vw - w) / 2 + 0.5, vh - 41.5, w - 1, 13);
      drawText(ctx, this.toast, vw / 2, vh - 39, { color: '#f0dcd4', align: 'center' });
    }
  }

  _tip(ctx, n, p, vw, vh) {
    const e = this.game.economy;
    const d = n.data;
    let title = '', cost = '', body = '', extra = '';
    if (n.kind === 'skill') {
      title = d.name; cost = `${d.cost} nutrients`; body = d.desc;
      const org = ORGANS[n.branch];
      extra = this.state(n) === 'locked'
        ? 'needs ' + d.req.map((r) => SKILL_BY_ID[r].name).join(', ')
        : org ? `grows ${org.name.toLowerCase()}` : '';
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
    ctx.fillStyle = 'rgba(14,8,10,0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = n.color;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.globalAlpha = 1;
    drawText(ctx, title, x + 5, y + 4, { color: '#f4e8e2' });
    drawText(ctx, cost, x + w - 5, y + 4, { color: n.color, align: 'right' });
    lines.forEach((l, i) => drawText(ctx, l, x + 5, y + 15 + i * LINE_H, { color: 'rgba(232,216,216,0.72)' }));
  }

  /** Sap runs from the seed out to whatever just opened, one link at a time. */
  _sap(id) {
    const chain = [];
    let cur = id;
    for (let i = 0; i < 12 && cur && cur !== '__root'; i++) {
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
        const org = ORGANS[n.branch];
        this.say(org ? `${n.data.name}. ${org.name} thickens.` : `${n.data.name} learned.`);
        this._sap(n.id);
        this.game.audio?.play('grow');
      } else this.say(st === 'locked' ? 'Nothing has reached that far yet.' : 'Not enough nutrients.');
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
