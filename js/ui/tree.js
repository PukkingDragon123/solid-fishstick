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
import { organArt, cavityArt } from '../art/anatomy.js';

// where each organ hangs in the body cavity, in body-space units
const ORGANS = {
  water:  { organ: 'spring',   x: -252, y: -156, name: 'The Spring', colour: '#5fc6d8' },
  garden: { organ: 'gut',      x: -258, y:  158, name: 'The Gut',    colour: '#8cc468' },
  fleet:  { organ: 'ganglion', x:  258, y:  150, name: 'The Knot',   colour: '#e2b74a' },
  body:   { organ: 'heart',    x:  248, y: -164, name: 'The Heart',  colour: '#c8925f' },
};

// the cavity itself, in body-space units
const VAULT_Y = 60;          // where the shell's arch springs from
const FLOOR_Y = 250;         // and where the floor of you is
const GILL_X = 372;

const TRUNK_BASE = -96;      // first evolution, above the seed
const TRUNK_STEP = 62;       // the last one all but touches the shell

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
    const d = 58 + (i % 4) * 26;
    nodes.push({
      id: 'gene:' + g.id, kind: 'gene', data: g,
      x: -Math.cos(a) * d * 1.3, y: Math.sin(a) * d * 0.72 + 74,
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
    let x0 = -300, x1 = 300, y0 = -250, y1 = 250;
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
    const z = clamp(Math.min((vw - 46) / w, (vh - 80) / h), 0.24, 0.98);
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

    this._drawCavity(ctx, vw, vh, fade);
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

  /** The shell overhead, the muscle wall behind, the haemolymph between. */
  _drawCavity(ctx, vw, vh, fade) {
    const g = ctx.createRadialGradient(vw / 2, vh * 0.48, 8, vw / 2, vh * 0.48, Math.max(vw, vh) * 0.8);
    const f = this.flash;
    g.addColorStop(0, `rgb(${30 + f * 40},${22 + f * 34},${28 + f * 26})`);
    g.addColorStop(0.48, '#180e12');
    g.addColorStop(1, '#080508');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // the cavity is baked in body units, so it pans and zooms with everything
    const art = cavityArt(this.cam.z);
    const k = this.cam.z / art.S;
    ctx.save();
    const o = this._toScreen({ x: 0, y: 0 }, vw, vh);
    ctx.translate(o.x, o.y);
    ctx.scale(k, k);
    ctx.globalAlpha = fade * 0.85;
    ctx.drawImage(art.wall.cv, -art.wall.ox, -art.wall.oy - 60 * art.S);
    ctx.globalAlpha = fade * 0.95;
    ctx.drawImage(art.vault.cv, -art.vault.ox, -art.vault.oy + VAULT_Y * art.S);
    ctx.restore();
    ctx.globalAlpha = fade;

    // haemolymph: cells drifting through you, and the pulse the heart sends
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);
    for (const m of this.motes) {
      const y = (m.y - this.t * 0.010 * m.s + 2) % 1;
      const x = (m.x + Math.sin(this.t * 0.26 * m.s + m.p) * 0.014 + 1) % 1;
      const px = Math.round(x * vw), py = Math.round(y * vh);
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + m.p)) + beat * 0.4;
      ctx.globalAlpha = fade * 0.38 * tw * m.s;
      ctx.fillStyle = m.r ? '#cd7a6c' : '#9fe8d4';
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.globalAlpha = fade;
  }

  /**
   * The organs. `front` splits them either side of the branches, so a bough
   * runs behind the gill stacks but in front of the wall.
   */
  _drawOrgans(ctx, vw, vh, fade, front) {
    const z = this.cam.z;
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);

    if (!front) {
      // the gills hang either side, always there, always working
      const lv = clamp01(this.organLevel('water') * 0.5 + this.organLevel('body') * 0.5);
      for (const side of [-1, 1]) {
        const p = this._toScreen({ x: side * GILL_X, y: -20 }, vw, vh);
        if (p.x < -140 || p.x > vw + 140) continue;
        const art = organArt(side < 0 ? 'gillL' : 'gillR', z, lv);
        const br = 0.5 + 0.5 * Math.sin(this.t * 0.9 + side);
        ctx.globalAlpha = fade * (0.42 + lv * 0.34);
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
      if (p.x < -160 || p.x > vw + 160 || p.y < -160 || p.y > vh + 160) continue;
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

      // an organ you have not started on is barely there
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

      if (z > 0.5) {
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
   * The tree itself, which inside a body is nerve and vessel rather than wood:
   * a grown branch is a live cord with something running through it, and an
   * ungrown one is the stub it has not pushed past yet.
   */
  _drawBranches(ctx, vw, vh, fade) {
    for (const ln of this.L.links) {
      const child = this.L.by[ln.to];
      const seen = this.seen[child.id] ?? 0;
      if (seen < 0.03) continue;
      const g = this.grow[child.id] ?? 0;
      const path = this._branchPath(ln, vw, vh);
      if (!path) continue;
      const { pa, pb, mx, my } = path;

      const reach = Math.max((ln.root ? 0.85 : 0.55) * seen, g);
      const w0 = ln.w * this.cam.z * lerp(0.40, 1, g);
      const w1 = w0 * (ln.root ? 0.28 : 0.44);
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

      const colour = ln.branch ? (BRANCHES.find((b) => b.id === ln.branch)?.color || '#8cc468') : null;
      ctx.globalAlpha = fade * lerp(0.42, 1, Math.max(g, seen * 0.6)) * (ln.root && g < 0.5 ? 0.5 : 1);
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (const p of left) ctx.lineTo(p.x, p.y);
      for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fillStyle = ln.root
        ? (g > 0.5 ? '#3f7a68' : '#2c4a44')
        : (g > 0.5 ? '#4a2f34' : '#33272a');
      ctx.fill();

      if (g > 0.05) {
        // the lit face of the cord
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (const p of left) ctx.lineTo(p.x, p.y);
        for (let i = left.length - 1; i >= 0; i--) {
          ctx.lineTo(lerp(left[i].x, right[i].x, 0.38), lerp(left[i].y, right[i].y, 0.38));
        }
        ctx.closePath();
        ctx.fillStyle = ln.root ? 'rgba(150,232,206,0.40)' : 'rgba(206,152,132,0.42)';
        ctx.fill();

        // and what is running through it, in the colour of the organ it feeds
        const flow = (this.t * 0.5 + ln.w * 0.3) % 1;
        ctx.globalAlpha = fade * (0.20 + 0.26 * Math.sin(flow * TAU) ** 2) * g;
        ctx.strokeStyle = colour || (ln.root ? '#9fe8d4' : '#a8e878');
        ctx.lineWidth = Math.max(1, w1 * 0.9);
        ctx.beginPath();
        mid.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
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
        const b = 1 + Math.sin(this.t * 1.6) * 0.04;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(b, b);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
      } else if (on) {
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
        // an ungrown node is a bud on the cord, still shut
        const rot = -0.5 + Math.sin(this.t * 0.9 + n.x * 0.03) * 0.10;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rot);
        ctx.fillStyle = ready ? '#4a3540' : '#2a2029';
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.78, r * 1.10, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = hot ? '#f4e6e0' : ready ? 'rgba(230,200,190,0.75)' : 'rgba(170,150,150,0.35)';
        ctx.lineWidth = Math.max(1, 1.2 * this.cam.z);
        ctx.stroke();
        ctx.strokeStyle = ready ? `rgba(255,225,215,${0.35 + pulse * 0.5})` : 'rgba(190,170,170,0.22)';
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95); ctx.lineTo(0, r * 0.85);
        ctx.stroke();
        ctx.restore();
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
