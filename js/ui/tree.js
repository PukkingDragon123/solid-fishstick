// CRABDEN - the genome.
//
// You click yourself and the camera goes *into* you: through the shell, past
// the rock and the chitin and the pearl, and out into the cavity where the
// thing that decides what you become is sitting.
//
// It is a skill tree, and it tries to obey the rules that make skill trees
// legible rather than impressive:
//
//   - Six arms, evenly spaced, so every direction means a different system and
//     you can learn where things are by where they are.
//   - Growth runs outward from a seed, so distance from the middle is exactly
//     how deep into a system you have gone.
//   - Nothing is drawn that you cannot reach. You see what you own and what is
//     one step away, and a stub where a chain continues, and nothing else -
//     because a wall of grey nodes teaches you nothing.
//   - State is readable without reading: owned is lit and filled, affordable
//     pulses and shows its price, unaffordable shows its price in red.
//   - Every node carries a picture of what it does. Words are for the hover.
//   - Buying one is an event: the ring closes, sap runs out from the middle,
//     and the organ at the end of that arm visibly grows.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic, easeInOutCubic } from '../lib/math.js';
import { drawText, textWidth, wrapText, LINE_H } from '../lib/font.js';
import { SKILLS, SKILL_BY_ID, BRANCHES, EVOLUTIONS, GENES, GENE_BY_ID } from '../data/progress.js';
import { organArt, orbArt } from '../art/anatomy.js';
import { drawNodeIcon } from './icons.js';

// -- the six arms -----------------------------------------------------------
// One per system plus one for your own form, evenly spaced so that "up" always
// means the same thing and you stop having to read the labels.

const ARMS = [
  { id: 'form', deg: 0, name: 'FORM', colour: '#c9e08a', organ: 'seed', blurb: 'what you physically are' },
  { id: 'water', deg: 60, name: 'SPRING', colour: '#5fc6d8', organ: 'spring', blurb: 'the organ that makes water' },
  { id: 'garden', deg: 120, name: 'SHELL', colour: '#8cc468', organ: 'gut', blurb: 'what grows on your back' },
  { id: 'fleet', deg: 180, name: 'BROOD', colour: '#e2b74a', organ: 'ganglion', blurb: 'what lives on you' },
  { id: 'claw', deg: 240, name: 'PINCER', colour: '#d87a6a', organ: 'muscle', blurb: 'the end of your arm' },
  { id: 'legs', deg: 300, name: 'LEGS', colour: '#c8925f', organ: 'heart', blurb: 'how you carry it' },
];
const ARM_BY_ID = Object.fromEntries(ARMS.map((a) => [a.id, a]));

const R_GENE = 92;            // the ring of genes around the seed
const R_TIER = [210, 330, 450, 570];   // how far out each tier sits
const R_ORGAN = 700;          // and the organ that the arm ends in
const FORK = [34, 46, 58, 70];         // how far a fork steps off the axis

/** Where an arm points. 0 is straight up. */
function armDir(deg) {
  const th = (deg - 90) * Math.PI / 180;
  return { x: Math.cos(th), y: Math.sin(th) * 0.86 };
}

function place(deg, r, off) {
  const d = armDir(deg);
  const px = -d.y, py = d.x;
  return { x: d.x * r + px * off, y: d.y * r + py * off };
}

/** Lay the whole genome out once. Positions never move; visibility does. */
function layout() {
  const nodes = [];
  const links = [];

  nodes.push({ id: '__seed', kind: 'seed', x: 0, y: 0, r: 26, color: '#a8e878', arm: null });

  // -- FORM: your evolutions, straight up ----------------------------------
  EVOLUTIONS.forEach((e, i) => {
    const p = place(0, R_TIER[Math.min(3, i)] + Math.floor(i / 4) * 120, 0);
    nodes.push({
      id: 'evo:' + e.id, kind: 'evo', data: e, arm: 'form', tier: i,
      x: p.x, y: p.y, r: 21, color: '#c9e08a', big: true,
    });
    links.push({
      from: i === 0 ? '__seed' : 'evo:' + EVOLUTIONS[i - 1].id,
      to: 'evo:' + e.id, arm: 'form', w: 7,
    });
  });

  // -- the five systems ----------------------------------------------------
  for (const arm of ARMS) {
    if (arm.id === 'form') continue;
    const list = SKILLS.filter((s) => s.branch === arm.id);
    for (const s of list) {
      const p = place(arm.deg, R_TIER[Math.min(3, s.x)], s.y * FORK[Math.min(3, s.x)]);
      nodes.push({
        id: 'skill:' + s.id, kind: 'skill', data: s, arm: arm.id, tier: s.x,
        x: p.x, y: p.y, r: s.x >= 3 ? 20 : 15, color: arm.colour, big: s.x >= 3,
      });
      if (!s.req.length) links.push({ from: '__seed', to: 'skill:' + s.id, arm: arm.id, w: 6 });
      else for (const r of s.req) links.push({ from: 'skill:' + r, to: 'skill:' + s.id, arm: arm.id, w: 5 });
    }
  }

  // -- the genes, as a ring of nodules round the seed -----------------------
  GENES.forEach((g, i) => {
    const th = (i / GENES.length) * TAU - Math.PI / 2;
    nodes.push({
      id: 'gene:' + g.id, kind: 'gene', data: g, arm: null,
      x: Math.cos(th) * R_GENE, y: Math.sin(th) * R_GENE * 0.86,
      r: 7, color: '#7fe0c8',
    });
  });

  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  for (const ln of links) if (by[ln.to]) by[ln.to].parent = ln.from;
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
    this.cam = { x: 0, y: 0, z: 0.8 };
    this.target = { x: 0, y: 0, z: 0.8 };
    this.grow = {};
    this.seen = {};
    this.pulses = [];
    this.motes = [];
    this.t = 0;
    this.beat = 0;
    this.dive = 0;
    this.diving = false;
    this.manual = false;
    this.toast = null;
    this.toastT = 0;
    this.flash = 0;
    this.hoverId = null;
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
    for (let i = 0; i < 70; i++) {
      this.motes.push({
        x: Math.random(), y: Math.random(), s: 0.3 + Math.random() * 0.9,
        p: Math.random() * TAU, r: Math.random() < 0.22 ? 1 : 0,
      });
    }
    this.game.audio?.play('discover');
  }

  close() { this.diving = false; }

  // -- state ----------------------------------------------------------------

  owned(n) {
    const e = this.game.economy;
    if (n.kind === 'skill') return e.skills.has(n.data.id);
    if (n.kind === 'evo') return e.evolutions.has(n.data.id);
    if (n.kind === 'gene') return e.genes.has(n.data.id);
    return n.kind === 'seed';
  }

  /**
   * What you are allowed to see. You own it, or it is exactly one step away.
   * Nothing else is drawn at all - a screen full of things you cannot reach
   * teaches you nothing and makes the things you can reach harder to find.
   */
  visible(n) {
    if (n.kind === 'seed' || n.kind === 'gene') return true;
    if (this.owned(n)) return true;
    const e = this.game.economy;
    if (n.kind === 'evo') return n.tier === 0 || e.evolutions.has(EVOLUTIONS[n.tier - 1].id);
    return n.data.req.every((r) => e.skills.has(r));
  }

  state(n) {
    const e = this.game.economy;
    if (n.kind === 'skill') return e.skillState(n.data.id);
    if (n.kind === 'evo') return e.evoState(n.data.id);
    if (n.kind === 'gene') return e.genes.has(n.data.id) ? 'owned' : 'locked';
    return 'owned';
  }

  cost(n) {
    if (n.kind === 'skill') return n.data.cost;
    if (n.kind === 'evo') return n.data.nutrients;
    return 0;
  }

  /** How developed one arm is: the fraction of it you have grown. */
  armLevel(id) {
    if (id === 'form') {
      return this.game.economy.evolutions.size / Math.max(1, EVOLUTIONS.length);
    }
    const list = SKILLS.filter((s) => s.branch === id);
    if (!list.length) return 0;
    const e = this.game.economy;
    return list.reduce((k, s) => k + (e.skills.has(s.id) ? 1 : 0), 0) / list.length;
  }

  /** Is there a node past this one that you have not revealed yet? */
  _hasMore(n) {
    if (n.kind === 'evo') return n.tier < EVOLUTIONS.length - 1;
    if (n.kind !== 'skill') return false;
    return SKILLS.some((s) => s.req.includes(n.data.id));
  }

  say(msg, secs = 3.5) { this.toast = msg; this.toastT = secs; }

  // -- camera ---------------------------------------------------------------

  /**
   * Frame what exists. At the start that is a seed and six buds, so the camera
   * is right in on it; as arms grow it pulls back only as far as it must.
   */
  _frame(vw, vh, snap = false) {
    let x0 = -R_GENE * 1.5, x1 = R_GENE * 1.5, y0 = -R_GENE * 1.4, y1 = R_GENE * 1.4;
    for (const n of this.L.nodes) {
      if (n.kind === 'gene') continue;
      const a = Math.max(this.grow[n.id] ?? 0, (this.seen[n.id] ?? 0) * 0.95);
      if (a < 0.08) continue;
      const r = n.r + 54;
      x0 = Math.min(x0, n.x - r); x1 = Math.max(x1, n.x + r);
      y0 = Math.min(y0, n.y - r); y1 = Math.max(y1, n.y + r);
    }
    const w = Math.max(240, x1 - x0), h = Math.max(200, y1 - y0);
    const z = clamp(Math.min((vw - 30) / w, (vh - 76) / h), 0.26, 1.9);
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
    // slow going in - it is a journey through your own shell - and quick on
    // the way out, because waking up is not a journey
    this.dive = damp(this.dive, this.diving ? 1 : 0, this.diving ? 0.14 : 0.0004, dt);
    if (!this.diving && this.dive < 0.02) return false;

    for (const n of this.L.nodes) {
      const w = this.owned(n) ? 1 : 0;
      const c = this.grow[n.id] ?? 0;
      if (c !== w) this.grow[n.id] = damp(c, w, 0.02, dt);
      const v = this.visible(n) ? 1 : 0;
      const s = this.seen[n.id] ?? 0;
      if (s !== v) this.seen[n.id] = damp(s, v, 0.05, dt);
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
        this.target.z = clamp(this.target.z * Math.pow(1.22, -i.wheel), 0.26, 2.8);
      }
      const ax = i.axis();
      if (ax.len > 0.1) {
        this.manual = true;
        this.target.x += ax.x * 260 * dt; this.target.y += ax.y * 260 * dt;
      }
      if (this.manual) {
        this.target.x = clamp(this.target.x, -900, 900);
        this.target.y = clamp(this.target.y, -900, 900);
      }
      if (i.justPressed('Escape') || i.justPressed('Tab') || i.justPressed('g')) {
        i.consumeKey('Escape'); i.consumeKey('Tab'); i.consumeKey('g');
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

  // -- drawing --------------------------------------------------------------

  draw(ctx, vw, vh) {
    const d = this.dive;
    if (d < 0.01) return;
    const k = clamp01(d);

    if (k < 0.60) {
      this._drawDive(ctx, vw, vh, k / 0.60);
      if (k < 0.42) return;
    }

    const fade = clamp01((k - 0.42) / 0.34);
    ctx.save();
    ctx.globalAlpha = fade;

    this._drawSky(ctx, vw, vh, fade);
    this._drawBody(ctx, vw, vh, fade);
    this._drawArms(ctx, vw, vh, fade);
    this._drawLinks(ctx, vw, vh, fade);
    this._drawOrgans(ctx, vw, vh, fade);
    const hover = this._drawNodes(ctx, vw, vh, fade);
    this._drawPulses(ctx, vw, vh);
    this._drawChrome(ctx, vw, vh, fade, hover);

    ctx.restore();
  }

  /**
   * Going in. The camera does not cut - it dives: the point you clicked opens,
   * the shell's three layers rush past you as rings, and the stars stretch into
   * streaks the way they do when you are moving faster than you should be.
   */
  _drawDive(ctx, vw, vh, t) {
    const cx0 = this.from ? this.from.x : vw / 2, cy0 = this.from ? this.from.y : vh / 2;
    const e = easeInOutCubic(clamp01(t));
    const cx = lerp(cx0, vw / 2, e), cy = lerp(cy0, vh / 2, e);
    const R = Math.hypot(vw, vh);

    ctx.save();
    ctx.globalAlpha = clamp01(t * 2.2);
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, vw, vh);

    // the tunnel: streaks pulling past you out of the point you are diving into
    ctx.globalAlpha = clamp01(t * 1.6) * clamp01(2.2 - t * 2.2);
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * TAU + i * 0.7;
      const r0 = R * (0.04 + ((i * 0.137 + t * 1.9) % 1) * 1.1);
      const len = R * (0.05 + t * 0.30);
      ctx.strokeStyle = i % 5 === 0 ? '#9fe8d4' : i % 3 === 0 ? '#a8c8ff' : '#e8f0ff';
      ctx.lineWidth = 1 + (i % 3) * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      ctx.stroke();
    }

    // the three layers of your own shell, passing you on the way through
    const layers = [
      { at: 0.06, c0: '#8a6a44', c1: '#33291f', label: 'ROCK' },
      { at: 0.34, c0: '#7a4c33', c1: '#1d1210', label: 'CHITIN' },
      { at: 0.62, c0: '#b9c2d8', c1: '#2c2b33', label: 'PEARL' },
    ];
    for (const L of layers) {
      const lt = (t - L.at) / 0.36;
      if (lt < 0 || lt > 1.5) continue;
      const r = lerp(10, R * 1.1, easeOutCubic(clamp01(lt)));
      const a = clamp01(1.35 - lt);
      const g = ctx.createRadialGradient(cx, cy, r * 0.70, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, L.c0);
      g.addColorStop(1, L.c1);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
      if (a > 0.4) {
        drawText(ctx, L.label, cx, cy + r * 0.62,
          { color: '#f2e4c2', align: 'center', alpha: (a - 0.4) * 1.3 });
      }
    }
    // and the light at the end of it
    ctx.globalAlpha = clamp01(t * 1.4);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.05 + t * 0.5));
    core.addColorStop(0, `rgba(210,255,235,${0.7 * t})`);
    core.addColorStop(0.4, `rgba(90,190,160,${0.25 * t})`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, R * (0.05 + t * 0.5), 0, TAU); ctx.fill();
    ctx.restore();
  }

  // -- the sky --------------------------------------------------------------

  _skyPlate(vw, vh) {
    const w = Math.ceil(vw * 1.3), h = Math.ceil(vh * 1.3);
    if (this._plate && this._plate.width === w && this._plate.height === h) return this._plate;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    this._paintSky(c, w, h);
    this._plate = cv;
    return cv;
  }

  /**
   * Outside you is the sky you have never been above ground long enough to
   * look at. Painted once: a galaxy on its side, a bright core, dust across
   * it, and cold clouds of gas hanging off the arm.
   */
  _paintSky(ctx, vw, vh) {
    const deep = ctx.createLinearGradient(0, 0, vw * 0.35, vh);
    deep.addColorStop(0, '#06050f');
    deep.addColorStop(0.45, '#0b0718');
    deep.addColorStop(1, '#040509');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, vw, vh);

    const R = Math.max(vw, vh);
    ctx.save();
    ctx.translate(vw * 0.66, vh * 0.30);
    ctx.rotate(-0.46);
    // the arm, as three nested lenses of light
    for (const [flat, a, c] of [[0.46, 0.10, '120,140,215'], [0.26, 0.12, '195,205,250'], [0.12, 0.16, '255,248,232']]) {
      ctx.save();
      ctx.scale(1, flat);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
      g.addColorStop(0, `rgba(${c},${a})`);
      g.addColorStop(0.4, `rgba(${c},${a * 0.72})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.95, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // the core
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.30);
    core.addColorStop(0, 'rgba(255,248,224,0.40)');
    core.addColorStop(0.22, 'rgba(255,214,150,0.22)');
    core.addColorStop(0.65, 'rgba(170,130,200,0.07)');
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 0.30, R * 0.13, 0, 0, TAU); ctx.fill();
    // dust across the front of it
    for (let i = 0; i < 4; i++) {
      const yy = (i - 1.4) * R * 0.048;
      ctx.fillStyle = `rgba(5,3,9,${0.10 + (i % 2) * 0.06})`;
      ctx.beginPath();
      ctx.moveTo(-R * 1.4, yy);
      ctx.quadraticCurveTo(0, yy + R * 0.05 * (i % 2 ? 1 : -1), R * 1.4, yy + R * 0.018);
      ctx.lineTo(R * 1.4, yy + R * 0.042);
      ctx.quadraticCurveTo(0, yy + R * 0.05 * (i % 2 ? 1 : -1) + R * 0.042, -R * 1.4, yy + R * 0.042);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // cold gas, hanging off the arm
    for (const c of [
      { x: 0.16, y: 0.70, r: 0.50, c: '118,58,168' },
      { x: 0.82, y: 0.76, r: 0.42, c: '28,108,158' },
      { x: 0.36, y: 0.14, r: 0.36, c: '178,66,108' },
      { x: 0.94, y: 0.32, r: 0.32, c: '58,150,148' },
    ]) {
      const cx = c.x * vw, cy = c.y * vh, r = c.r * Math.max(vw, vh) * 0.6;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${c.c},0.22)`);
      g.addColorStop(0.4, `rgba(${c.c},0.09)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
  }

  _drawSky(ctx, vw, vh, fade) {
    const plate = this._skyPlate(vw, vh);
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, vw, vh);
    const ox = clamp(-vw * 0.15 - this.cam.x * 0.04, -vw * 0.3, 0);
    const oy = clamp(-vh * 0.15 - this.cam.y * 0.04, -vh * 0.3, 0);
    ctx.drawImage(plate, Math.round(ox), Math.round(oy));

    for (let layer = 0; layer < 4; layer++) {
      const n = 110 - layer * 24;
      const par = 0.02 + layer * 0.05;
      for (let i = 0; i < n; i++) {
        const h1 = Math.sin(i * 12.9898 + layer * 3.7) * 43758.5453;
        const h2 = Math.sin(i * 78.233 + layer * 1.3) * 43758.5453;
        const sx = (((h1 - Math.floor(h1)) * vw - this.cam.x * par) % vw + vw) % vw;
        const sy = (((h2 - Math.floor(h2)) * vh - this.cam.y * par) % vh + vh) % vh;
        const tw = 0.4 + 0.6 * Math.sin(this.t * (0.5 + layer * 0.4) + i * 1.7);
        const X = Math.round(sx), Y = Math.round(sy);
        ctx.globalAlpha = fade * (0.15 + layer * 0.20) * (0.5 + tw * 0.5);
        ctx.fillStyle = i % 9 === 0 ? '#ffd0a0' : i % 5 === 0 ? '#a8c8ff' : '#f4f6ff';
        ctx.fillRect(X, Y, 1, 1);
        if (layer === 3 && i % 6 === 0) {
          ctx.globalAlpha = fade * 0.20 * (0.4 + tw * 0.6);
          ctx.fillRect(X - 2, Y, 5, 1);
          ctx.fillRect(X, Y - 2, 1, 5);
        }
      }
    }
    ctx.globalAlpha = fade;
  }

  // -- the animal -----------------------------------------------------------

  _S(x, y, vw, vh) {
    return {
      x: vw / 2 + (x - this.cam.x) * this.cam.z,
      y: vh / 2 + (y - this.cam.y) * this.cam.z,
    };
  }

  /**
   * The body you are standing in, drawn from the same numbers the crab in the
   * desert is built from: its carapace shape, its leg count, its claws, its
   * basin. It is a dark silhouette with a live rim, because everything that
   * matters on this screen is inside it.
   */
  _drawBody(ctx, vw, vh, fade) {
    const z = this.cam.z;
    const m = this.game.crab.m;
    const P = (x, y) => this._S(x, y, vw, vh);
    const RX = 860, RY = 700;                    // the cavity, in tree units
    const c = P(0, 0);
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);

    // limbs, outside the shell only
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, vw, vh);
    ctx.ellipse(c.x, c.y, RX * z, RY * z, 0, 0, TAU, true);
    ctx.clip('evenodd');
    const legN = m.legN;
    const span = (m.reach / m.rx) * RX * 0.36;
    for (const side of [-1, 1]) {
      for (let i = 0; i < legN; i++) {
        const t = legN === 1 ? 0.5 : i / (legN - 1);
        const th = (-0.70 + t * 1.40) * side;
        const hx = Math.sin(th) * RX * 0.97, hy = Math.cos(th) * RY * -0.34 + RY * 0.10;
        const wob = Math.sin(this.t * 0.8 + i * 1.3 + (side > 0 ? 0 : 2)) * 10;
        const pts = [
          [hx, hy],
          [hx + side * span * 0.46, hy - span * 0.24 - t * 24 + wob],
          [hx + side * span * 0.86, hy + span * 0.18 + wob * 0.6],
          [hx + side * span * 1.06, hy + span * 0.74 + t * 46 + wob],
        ];
        this._limb(ctx, pts, (m.legLen[0] / m.rx) * RX * 0.30 * (1 - i * 0.09), z, P);
      }
      const K = (m.clawLen[0] / m.rx) * RX * 0.34;
      const ax = side * RX * 0.54, ay = RY * 0.62;
      const open = 0.16 + Math.sin(this.t * 0.7 + side) * 0.09;
      const wx = ax + side * K * 2.0, wy = ay + K * 2.0;
      this._limb(ctx, [[ax, ay], [ax + side * K * 1.1, ay + K * 0.4], [wx, wy]], K * 0.32, z, P);
      const wrist = P(wx, wy);
      for (const [ang, len, w] of [[0.28 + open, K * 1.7, K * 0.24], [1.06 - open, K * 1.3, K * 0.17]]) {
        const tip = P(wx + side * Math.sin(ang) * len, wy + Math.cos(ang) * len);
        const bend = P(wx + side * Math.sin(ang * 0.5) * len * 0.6, wy + Math.cos(ang * 0.5) * len * 0.55);
        for (const [col, kind] of [['rgba(5,8,13,0.95)', 'dark'], ['rgba(126,178,200,0.9)', 'mid'], ['rgba(210,244,250,0.5)', 'lit']]) {
          ctx.beginPath();
          ctx.moveTo(wrist.x, wrist.y);
          ctx.quadraticCurveTo(bend.x, bend.y, tip.x, tip.y);
          ctx.strokeStyle = col;
          ctx.lineWidth = kind === 'dark' ? w * z + 4 : kind === 'mid' ? w * z : Math.max(1, w * z * 0.3);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // the cavity itself
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, RX * z, RY * z, 0, 0, TAU);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, RX * z);
    g.addColorStop(0, `rgba(${24 + beat * 20},${17 + beat * 9},${26 + beat * 14},0.92)`);
    g.addColorStop(0.66, 'rgba(13,10,16,0.95)');
    g.addColorStop(1, 'rgba(6,6,11,0.97)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    const ring = (rx, ry, light, w, dark) => {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx * z, ry * z, 0, 0, TAU);
      if (dark) { ctx.strokeStyle = dark; ctx.lineWidth = w + 4; ctx.stroke(); }
      ctx.strokeStyle = light; ctx.lineWidth = w; ctx.stroke();
    };
    ring(RX, RY, 'rgba(150,208,220,0.72)', Math.max(1, 2.4 * z), 'rgba(6,8,14,0.95)');
    ring(RX * 0.93, RY * 0.92, 'rgba(120,178,196,0.20)', Math.max(1, 1.2 * z));

    // the basin on your back, where it actually is, with what is in it
    const br = m.basin.r * RX * 0.9;
    const bp = P(m.basin.a * RX, m.basin.b * RY);
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y, br * z, br * 0.70 * z, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(120,178,196,0.26)';
    ctx.lineWidth = Math.max(1, 1.2 * z);
    ctx.stroke();
    const pond = clamp01(this.game.garden.pond);
    if (pond > 0.02) {
      ctx.globalAlpha = fade * (0.08 + pond * 0.20);
      ctx.fillStyle = '#5fc6d8';
      ctx.beginPath();
      ctx.ellipse(bp.x, bp.y, br * z * Math.sqrt(pond), br * 0.70 * z * Math.sqrt(pond), 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = fade;
    }

    // eyestalks at the front
    for (const side of [-1, 1]) {
      const e0 = P(side * RX * 0.13, RY * 0.82), e1 = P(side * RX * 0.22, RY * 1.16);
      ctx.beginPath();
      ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y);
      ctx.strokeStyle = 'rgba(150,208,220,0.6)';
      ctx.lineWidth = Math.max(1.5, 7 * z);
      ctx.stroke();
      ctx.fillStyle = '#0c0a10';
      ctx.beginPath(); ctx.arc(e1.x, e1.y, Math.max(2.4, 15 * z), 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(215,245,255,0.9)';
      ctx.beginPath(); ctx.arc(e1.x - 5 * z, e1.y - 5 * z, Math.max(1, 4.5 * z), 0, TAU); ctx.fill();
    }

    // haemolymph
    for (const mo of this.motes) {
      const yy = (mo.y - this.t * 0.010 * mo.s + 2) % 1;
      const xx = (mo.x + Math.sin(this.t * 0.26 * mo.s + mo.p) * 0.014 + 1) % 1;
      const bx = lerp(-RX, RX, xx), by = lerp(-RY, RY, yy);
      if ((bx / RX) ** 2 + (by / RY) ** 2 > 0.9) continue;
      const sp = P(bx, by);
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + mo.p)) + beat * 0.4;
      ctx.globalAlpha = fade * 0.38 * tw * mo.s;
      ctx.fillStyle = mo.r ? '#cd7a6c' : '#9fe8d4';
      ctx.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
    }
    ctx.globalAlpha = fade;
  }

  _limb(ctx, pts, w, z, P) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const trace = () => {
      ctx.beginPath();
      const s0 = P(pts[0][0], pts[0][1]);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < pts.length - 1; i++) {
        const a = P(pts[i][0], pts[i][1]);
        const b = P(pts[i + 1][0], pts[i + 1][1]);
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      const last = P(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      ctx.lineTo(last.x, last.y);
    };
    trace(); ctx.strokeStyle = 'rgba(5,8,13,0.95)'; ctx.lineWidth = w * z + 5; ctx.stroke();
    trace(); ctx.strokeStyle = 'rgba(104,150,172,0.85)'; ctx.lineWidth = w * z; ctx.stroke();
    trace(); ctx.strokeStyle = 'rgba(206,244,250,0.5)'; ctx.lineWidth = Math.max(1, w * z * 0.32); ctx.stroke();
  }

  // -- the tree itself ------------------------------------------------------

  /**
   * The six spokes, drawn as faint guides out to the horizon of each system
   * with its name on it. This is the thing that makes a radial tree learnable:
   * a direction always means the same system, whether or not you have grown it.
   */
  _drawArms(ctx, vw, vh, fade) {
    const z = this.cam.z;
    for (const arm of ARMS) {
      const lv = this.armLevel(arm.id);
      const d = armDir(arm.deg);
      const a = this._S(d.x * (R_GENE + 26), d.y * (R_GENE + 26), vw, vh);
      let reach = R_TIER[0] + 40;
      for (const n of this.L.nodes) {
        if (n.arm !== arm.id) continue;
        if ((this.seen[n.id] ?? 0) < 0.4) continue;
        reach = Math.max(reach, Math.hypot(n.x, n.y) + 70);
      }
      const b = this._S(d.x * reach, d.y * reach, vw, vh);
      ctx.globalAlpha = fade * (0.10 + lv * 0.16);
      ctx.strokeStyle = arm.colour;
      ctx.lineWidth = Math.max(1, 10 * z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // the name of the system, just past the furthest thing it has grown, so
      // the label follows the arm out instead of sitting off the screen
      let far = R_GENE + 40;
      for (const n of this.L.nodes) {
        if (n.arm !== arm.id) continue;
        if ((this.seen[n.id] ?? 0) < 0.4) continue;
        far = Math.max(far, Math.hypot(n.x, n.y) + 84);
      }
      // set beside the spoke rather than on it, so it never lands on an organ
      const px2 = -d.y, py2 = d.x;
      const lp = this._S(d.x * far + px2 * 86, d.y * far + py2 * 86, vw, vh);
      if (lp.x > 24 && lp.x < vw - 24 && lp.y > 26 && lp.y < vh - 18) {
        ctx.globalAlpha = fade * (0.40 + lv * 0.5);
        drawText(ctx, arm.name, lp.x, lp.y - 4, { color: arm.colour, align: 'center' });
        ctx.globalAlpha = fade * 0.32;
        drawText(ctx, `${Math.round(lv * 100)}%`, lp.x, lp.y + 6, { color: arm.colour, align: 'center' });
      }
    }
    ctx.globalAlpha = fade;
  }

  _linkPath(ln, vw, vh) {
    const a = this.L.by[ln.from], b = this.L.by[ln.to];
    if (!a || !b) return null;
    const pa = this._toScreen(a, vw, vh), pb = this._toScreen(b, vw, vh);
    // bow the link away from the centre so forks never overlap their sibling
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
    const nx = -(pb.y - pa.y), ny = pb.x - pa.x;
    const l = Math.hypot(nx, ny) || 1;
    const bow = (b.data && b.data.y ? b.data.y : 0) * 10 * this.cam.z;
    return { pa, pb, mx: mx + (nx / l) * bow, my: my + (ny / l) * bow };
  }

  /**
   * The connections. A grown one is a bright cord with the arm's colour
   * running through it; an ungrown one is a dashed lead showing where the next
   * thing would attach, which is how you know a choice exists at all.
   */
  _drawLinks(ctx, vw, vh, fade) {
    const z = this.cam.z;
    for (const ln of this.L.links) {
      const child = this.L.by[ln.to];
      const seen = this.seen[child.id] ?? 0;
      if (seen < 0.03) continue;
      const g = this.grow[child.id] ?? 0;
      const path = this._linkPath(ln, vw, vh);
      if (!path) continue;
      const { pa, pb, mx, my } = path;
      const colour = (ARM_BY_ID[ln.arm] || {}).colour || '#c9e08a';
      const steps = 16;
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(curveAt(pa, pb, mx, my, i / steps));
      const trace = () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      };
      const w = Math.max(1.4, ln.w * z * lerp(0.5, 1, g));

      ctx.lineCap = 'round';
      ctx.globalAlpha = fade * lerp(0.45, 1, Math.max(g, seen * 0.7));
      if (g > 0.5) {
        trace(); ctx.strokeStyle = 'rgba(5,7,12,0.9)'; ctx.lineWidth = w + 4 * z; ctx.stroke();
        trace(); ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.stroke();
        ctx.globalAlpha = fade * 0.5;
        trace(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, w * 0.28); ctx.stroke();
        // something running out along it, always outward
        const flow = (this.t * 0.4 + ln.w * 0.13) % 1;
        const bead = curveAt(pa, pb, mx, my, flow);
        ctx.globalAlpha = fade * 0.55;
        const gg = ctx.createRadialGradient(bead.x, bead.y, 0, bead.x, bead.y, w * 2.6);
        gg.addColorStop(0, '#ffffff');
        gg.addColorStop(0.35, colour);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(bead.x, bead.y, w * 2.6, 0, TAU); ctx.fill();
      } else {
        // not grown: a dashed lead, so an unbought choice still reads as one
        ctx.setLineDash([4 * z, 4 * z]);
        ctx.lineDashOffset = -this.t * 14 * z;
        trace();
        ctx.strokeStyle = 'rgba(160,178,190,0.5)';
        ctx.lineWidth = Math.max(1, w * 0.7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = fade;
    }
  }

  /** The organ at the end of each arm, which is what the arm is growing. */
  _drawOrgans(ctx, vw, vh, fade) {
    const z = this.cam.z;
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);
    for (const arm of ARMS) {
      if (arm.id === 'form') continue;
      const lv = this.armLevel(arm.id);
      if (lv <= 0.001) continue;                  // nothing to show yet
      const d = armDir(arm.deg);
      let reach = R_TIER[0];
      for (const n of this.L.nodes) {
        if (n.arm !== arm.id) continue;
        if ((this.seen[n.id] ?? 0) < 0.4) continue;
        reach = Math.max(reach, Math.hypot(n.x, n.y));
      }
      const p = this._S(d.x * (reach + 210), d.y * (reach + 210), vw, vh);
      if (p.x < -200 || p.x > vw + 200 || p.y < -200 || p.y > vh + 200) continue;
      const art = organArt(arm.organ, clamp(z * 1.4, 0.3, 2), lv);
      let sx = 1, sy = 1, glow = 0.08 + lv * 0.2;
      if (arm.organ === 'heart') { const k = 1 + beat * 0.12; sx = k; sy = k; glow += beat * 0.3; }
      if (arm.organ === 'spring') { sy = 1 + Math.sin(this.t * 1.1) * 0.03; sx = 1 - Math.sin(this.t * 1.1) * 0.02; }
      if (arm.organ === 'gut') { sx = 1 + Math.sin(this.t * 0.8) * 0.02; sy = 1 + Math.sin(this.t * 0.8 + 1.7) * 0.02; }
      if (arm.organ === 'ganglion') {
        const fire = Math.pow(0.5 + 0.5 * Math.sin(this.t * 3.1), 6);
        glow += fire * lv * 0.5; sx = sy = 1 + fire * 0.03;
      }
      ctx.globalAlpha = fade * glow * 0.5;
      const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, art.cv.width * 0.7);
      gg.addColorStop(0, arm.colour);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(p.x, p.y, art.cv.width * 0.7, 0, TAU); ctx.fill();

      ctx.globalAlpha = fade * (0.4 + lv * 0.6);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(sx, sy);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    ctx.globalAlpha = fade;
  }

  // -- nodes ----------------------------------------------------------------

  _drawNodes(ctx, vw, vh, fade) {
    const i = this.game.input;
    const z = this.cam.z;
    let hover = null;

    // the genes first: a ring of nodules round the seed, the things you cannot
    // buy and can only express
    for (const n of this.L.nodes) {
      if (n.kind !== 'gene') continue;
      const p = this._toScreen(n, vw, vh);
      const on = this.owned(n);
      const r = n.r * z;
      if (r < 1.2) continue;
      const hot = Math.hypot(i.sx - p.x, i.sy - p.y) < r + 5;
      ctx.globalAlpha = fade * (on ? 0.9 : 0.30);
      if (on) {
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        gg.addColorStop(0, 'rgba(127,224,200,0.55)');
        gg.addColorStop(1, 'rgba(127,224,200,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = on ? '#9ff0d8' : '#2e3c3a';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = on ? 'rgba(230,255,246,0.7)' : 'rgba(120,150,145,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (hot) hover = { n, p };
      ctx.globalAlpha = fade;
    }

    for (const n of this.L.nodes) {
      if (n.kind === 'gene') continue;
      const seen = this.seen[n.id] ?? 0;
      if (seen < 0.05) continue;
      const p = this._toScreen(n, vw, vh);
      const rr = n.r * z * lerp(0.6, 1, seen);
      if (p.x < -80 || p.x > vw + 80 || p.y < -80 || p.y > vh + 80) continue;

      if (n.kind === 'seed') {
        const art = organArt('seed', clamp(z * 1.6, 0.4, 2.4), clamp01(this.game.economy.genes.size / 8));
        const b = 1 + Math.sin(this.t * 1.6) * 0.04;
        ctx.globalAlpha = fade * 0.5;
        const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 4);
        gg.addColorStop(0, 'rgba(168,232,120,0.4)');
        gg.addColorStop(1, 'rgba(168,232,120,0)');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr * 4, 0, TAU); ctx.fill();
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(b, b);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        ctx.restore();
        continue;
      }

      const st = this.state(n);
      const on = st === 'owned';
      const ready = st === 'ready';
      const costly = st === 'costly';
      const hot = Math.hypot(i.sx - p.x, i.sy - p.y) < rr + 7;
      if (hot) hover = { n, p };
      const pulse = ready ? 0.5 + Math.sin(this.t * 3.0) * 0.5 : 0;
      const arm = ARM_BY_ID[n.arm] || {};

      // the halo says the state before you have read anything
      ctx.globalAlpha = fade * seen * (on ? 0.34 : ready ? 0.20 + pulse * 0.32 : 0.16);
      const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.4);
      gg.addColorStop(0, on || ready ? n.color : '#7a8a90');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 2.4, 0, TAU); ctx.fill();

      // the bead
      ctx.globalAlpha = fade * seen;
      const art = orbArt(n.color, rr * (on ? 1 : 0.88), on);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (ready) ctx.scale(1 + pulse * 0.06, 1 + pulse * 0.06);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();

      // a keystone gets a ring around it, so the big ones read as big
      if (n.big) {
        ctx.strokeStyle = on ? n.color : 'rgba(180,190,190,0.45)';
        ctx.lineWidth = Math.max(1, 1.6 * z);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 5 * z, 0, TAU); ctx.stroke();
        if (on) {
          ctx.globalAlpha = fade * 0.35;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr + 9 * z, 0, TAU); ctx.stroke();
          ctx.globalAlpha = fade * seen;
        }
      }

      // what it does, stamped into it
      const ico = n.data && n.data.icon;
      if (ico && rr > 6) {
        drawNodeIcon(ctx, ico, p.x, p.y,
          on ? 'rgba(10,8,6,0.88)' : ready ? 'rgba(244,238,222,0.9)' : 'rgba(190,196,196,0.55)',
          Math.max(1, Math.round(rr / 4.4)));
      }

      // the price, under anything you do not own yet
      if (!on && z > 0.4) {
        const c = this.cost(n);
        drawText(ctx, `${c}`, p.x, p.y + rr + 4, {
          color: ready ? '#cfe89a' : costly ? '#e08c9c' : 'rgba(200,206,206,0.6)',
          align: 'center',
        });
      }
      // and the name of a keystone, because keystones are decisions
      if (n.big && on && z > 0.5) {
        drawText(ctx, n.data.name, p.x, p.y - rr - 12,
          { color: arm.colour || n.color, align: 'center', alpha: fade * 0.8 });
      }

      // a stub where the chain keeps going, so you know there is more
      if (on && this._hasMore(n) && z > 0.35) {
        const d = armDir((arm.deg ?? 0));
        const s2 = this._S(n.x + d.x * 46, n.y + d.y * 46, vw, vh);
        ctx.globalAlpha = fade * (0.25 + 0.2 * Math.sin(this.t * 2 + n.x));
        ctx.strokeStyle = n.color;
        ctx.lineWidth = Math.max(1, 2 * z);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.globalAlpha = fade;
      }

      if (hot && i.clicked) {
        i.clicked = false;
        this._buy(n);
      }
    }
    ctx.globalAlpha = fade;
    return hover;
  }

  _drawPulses(ctx, vw, vh) {
    for (const p of this.pulses) {
      const path = this._linkPath(p.ln, vw, vh);
      if (!path) continue;
      const t = clamp01(p.t);
      const c = curveAt(path.pa, path.pb, path.mx, path.my, t);
      const a = Math.sin(t * Math.PI);
      const r = Math.max(2, 4 * this.cam.z) * (0.6 + a * 0.7);
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 3.6);
      g.addColorStop(0, `rgba(255,250,232,${0.95 * a})`);
      g.addColorStop(0.35, `rgba(150,236,180,${0.5 * a})`);
      g.addColorStop(1, 'rgba(120,220,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 3.6, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.6, 0, TAU); ctx.fill();
    }
  }

  // -- chrome ---------------------------------------------------------------

  _drawChrome(ctx, vw, vh, fade, hover) {
    const e = this.game.economy;
    const total = EVOLUTIONS.length + SKILLS.length;
    const open = e.evolutions.size + e.skills.size;

    // a bar across the top: what you have to spend, and how far you have got
    ctx.fillStyle = 'rgba(6,8,12,0.72)';
    ctx.fillRect(0, 0, vw, 20);
    ctx.fillStyle = 'rgba(150,208,220,0.20)';
    ctx.fillRect(0, 20, vw, 1);
    drawText(ctx, 'YOUR GENOME', 6, 3, { color: '#cfe8d8' });
    drawText(ctx, `${Math.round(e.nutrients)} nutrients`, vw / 2, 3,
      { color: '#cfe89a', align: 'center' });
    drawText(ctx, `${open}/${total} grown   ${e.genes.size}/${GENES.length} genes`, vw - 6, 3,
      { color: 'rgba(200,226,210,0.7)', align: 'right' });

    drawText(ctx, this.manual ? 'drag to look   scroll to zoom   esc to wake up' : 'esc to wake up',
      vw / 2, vh - 10, { color: 'rgba(200,226,210,0.42)', align: 'center' });

    if (hover) this._card(ctx, hover.n, hover.p, vw, vh);
    if (this.toast) {
      const w = Math.min(vw - 30, textWidth(this.toast) + 18);
      ctx.fillStyle = 'rgba(12,16,18,0.94)';
      ctx.fillRect((vw - w) / 2, vh - 40, w, 14);
      ctx.strokeStyle = 'rgba(150,208,220,0.5)';
      ctx.strokeRect((vw - w) / 2 + 0.5, vh - 39.5, w - 1, 13);
      drawText(ctx, this.toast, vw / 2, vh - 37, { color: '#dff0e8', align: 'center' });
    }
  }

  /**
   * The hover card. Everything you need to decide, in the order you need it:
   * what it is, what it costs, whether you can pay, what it does, and - if you
   * cannot have it - exactly what is in the way.
   */
  _card(ctx, n, p, vw, vh) {
    const e = this.game.economy;
    const d = n.data;
    const arm = ARM_BY_ID[n.arm] || {};
    const st = this.state(n);
    let title = '', sub = '', body = '', need = '';

    if (n.kind === 'skill') {
      title = d.name; sub = arm.name || ''; body = d.desc;
      if (st === 'locked') need = 'needs ' + d.req.map((r) => SKILL_BY_ID[r].name).join(' and ');
      else if (st === 'costly') need = `needs ${d.cost - Math.floor(e.nutrients)} more nutrients`;
    } else if (n.kind === 'evo') {
      title = d.name; sub = 'FORM'; body = d.desc;
      const miss = e.missingGenes(d.genes);
      if (miss.length) need = 'needs genes: ' + miss.map((g) => GENE_BY_ID[g]?.name || g).join(', ');
      else if (st === 'costly') need = `needs ${d.nutrients - Math.floor(e.nutrients)} more nutrients`;
      else if (st === 'locked') need = 'an earlier form first';
    } else if (n.kind === 'gene') {
      title = d.name; sub = 'GENE'; body = d.desc;
      need = e.genes.has(d.id) ? 'expressed right now' : 'from ' + d.from;
    }

    const lines = wrapText(body, 156);
    const needLines = need ? wrapText(need, 156) : [];
    const w = Math.min(180, Math.max(textWidth(title) + 40,
      ...lines.map((l) => textWidth(l) + 12), ...needLines.map((l) => textWidth(l) + 12)));
    const h = 16 + lines.length * LINE_H + (needLines.length ? needLines.length * LINE_H + 4 : 0)
      + (st === 'ready' && n.kind !== 'gene' ? 11 : 0);
    const x = clamp(p.x + 16, 4, vw - w - 4);
    const y = clamp(p.y - h / 2, 24, vh - h - 4);

    ctx.fillStyle = 'rgba(8,11,14,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = n.color;
    ctx.globalAlpha = 0.75;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.globalAlpha = 1;
    // a colour flash down the side, so the card belongs to its arm
    ctx.fillStyle = arm.colour || n.color;
    ctx.fillRect(x, y, 2, h);

    drawText(ctx, title, x + 6, y + 4, { color: '#f2f6ee' });
    drawText(ctx, sub, x + w - 5, y + 4, { color: arm.colour || n.color, align: 'right' });
    let ry = y + 15;
    lines.forEach((l) => { drawText(ctx, l, x + 6, ry, { color: 'rgba(214,230,220,0.78)' }); ry += LINE_H; });
    if (needLines.length) {
      ry += 3;
      needLines.forEach((l) => {
        drawText(ctx, l, x + 6, ry, { color: st === 'owned' ? '#8cc468' : '#e2b74a' });
        ry += LINE_H;
      });
    }
    // the price only where it is not already the reason you cannot have it
    if (n.kind !== 'gene' && st === 'ready') {
      drawText(ctx, 'click to grow', x + w / 2, y + h - 10, { color: '#cfe89a', align: 'center' });
    }
  }

  /** Sap runs from the seed out to whatever just opened, one link at a time. */
  _sap(id) {
    const chain = [];
    let cur = id;
    for (let i = 0; i < 14 && cur && cur !== '__seed'; i++) {
      const ln = this.L.links.find((l) => l.to === cur);
      if (!ln) break;
      chain.unshift(ln);
      cur = ln.from;
    }
    chain.forEach((ln, i) => this.pulses.push({ ln, t: -i * 0.45, dur: 0.5 }));
    this.flash = 1;
  }

  _buy(n) {
    const e = this.game.economy;
    const st = this.state(n);
    if (st === 'owned') return;
    if (n.kind === 'gene') {
      this.say(`${n.data.name} comes from ${n.data.from}. Grow it, or win it over.`);
      this.game.audio?.play('deny');
      return;
    }
    if (n.kind === 'skill') {
      if (e.buySkill(n.data.id)) {
        const arm = ARM_BY_ID[n.arm];
        this.say(arm ? `${n.data.name}. ${arm.name.toLowerCase()} grows.` : `${n.data.name}.`);
        this._sap(n.id);
        this.game.audio?.play('grow');
        if (!this.manual) this._frame(this.game.renderer.vw, this.game.renderer.vh);
      } else {
        this.say(st === 'locked' ? 'Nothing has reached that far yet.'
          : `Not enough. ${n.data.cost - Math.floor(e.nutrients)} nutrients short.`);
        this.game.audio?.play('deny');
      }
      return;
    }
    if (e.evolve(n.data.id)) {
      this.say(`${n.data.name}. Something in you unfolds.`);
      this._sap(n.id);
      this.game.audio?.play('evolve');
      if (!this.manual) this._frame(this.game.renderer.vw, this.game.renderer.vh);
    } else if (st === 'genes') {
      this.say('Missing genes: ' + e.missingGenes(n.data.genes).map((g) => GENE_BY_ID[g]?.name || g).join(', '));
      this.game.audio?.play('deny');
    } else if (st === 'locked') {
      this.say('An earlier form first.');
      this.game.audio?.play('deny');
    } else {
      this.say(`Not enough. ${n.data.nutrients - Math.floor(e.nutrients)} nutrients short.`);
      this.game.audio?.play('deny');
    }
  }
}
