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

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic, easeInOutCubic, mulberry32 } from '../lib/math.js';
import { drawText, textWidth, wrapText, LINE_H } from '../lib/font.js';
import { SKILLS, SKILL_BY_ID, BRANCHES, EVOLUTIONS, GENES, GENE_BY_ID } from '../data/progress.js';
import { organArt, orbArt } from '../art/anatomy.js';
import { crabPlates } from '../art/crabpose.js';
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
const ORGAN_GAP = 165;        // how far past the last bead its organ hangs

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
      x: p.x, y: p.y, r: 25, color: '#c9e08a', big: true,
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
        x: p.x, y: p.y, r: s.x >= 3 ? 24 : 18, color: arm.colour, big: s.x >= 3,
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
      r: 8, color: '#7fe0c8',
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
    this.rings = [];
    this.spores = [];
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
    this.rings.length = 0;
    this.spores = [];
    for (let i = 0; i < 46; i++) {
      this.spores.push({
        a: Math.random() * TAU, r: 120 + Math.random() * 620,
        sp: (0.05 + Math.random() * 0.16) * (Math.random() < 0.5 ? -1 : 1),
        rise: 6 + Math.random() * 22, p: Math.random() * TAU,
        c: ARMS[(Math.random() * ARMS.length) | 0].colour,
      });
    }
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
      const r = n.r + 34;
      x0 = Math.min(x0, n.x - r); x1 = Math.max(x1, n.x + r);
      y0 = Math.min(y0, n.y - r); y1 = Math.max(y1, n.y + r);
    }
    // the organs hang past the end of each arm; frame them too, or they sit
    // half off the screen with their labels under the chrome
    for (const arm of ARMS) {
      if (arm.id === 'form' || this.armLevel(arm.id) <= 0.001) continue;
      let reach = R_TIER[0];
      for (const n of this.L.nodes) {
        if (n.arm !== arm.id) continue;
        if ((this.seen[n.id] ?? 0) < 0.4) continue;
        reach = Math.max(reach, Math.hypot(n.x, n.y));
      }
      const d = armDir(arm.deg);
      const ox = d.x * (reach + ORGAN_GAP), oy = d.y * (reach + ORGAN_GAP);
      const r = 72;
      x0 = Math.min(x0, ox - r); x1 = Math.max(x1, ox + r);
      y0 = Math.min(y0, oy - r); y1 = Math.max(y1, oy + r);
    }
    const w = Math.max(240, x1 - x0), h = Math.max(200, y1 - y0);
    const z = clamp(Math.min((vw - 20) / w, (vh - 52) / h), 0.26, 2.2);
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
    // a paced journey in - a second and a bit of falling through your own
    // shell - and a quick snap back out, because waking up is not a journey
    this.dive = this.diving
      ? Math.min(1, this.dive + dt / 1.25)
      : Math.max(0, this.dive - dt / 0.30);
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
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt / r.dur;
      if (r.t >= 1) this.rings.splice(i, 1);
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
    // a pool of light under the genome, so beads read off the body, and a
    // vignette to keep the eye in the middle
    {
      const O = this._S(0, 0, vw, vh);
      const R = Math.max(vw, vh) * 0.52;
      const g = ctx.createRadialGradient(O.x, O.y, 0, O.x, O.y, R);
      g.addColorStop(0, 'rgba(120,190,210,0.15)');
      g.addColorStop(0.45, 'rgba(60,110,140,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(O.x, O.y, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const v = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32,
        vw / 2, vh / 2, Math.max(vw, vh) * 0.74);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(2,3,7,0.62)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, vw, vh);
    }

    this._drawArms(ctx, vw, vh, fade);
    this._drawLinks(ctx, vw, vh, fade);
    this._drawOrgans(ctx, vw, vh, fade);
    const hover = this._drawNodes(ctx, vw, vh, fade);
    this._drawPulses(ctx, vw, vh);
    this._drawChrome(ctx, vw, vh, fade, hover);

    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * this.flash * this.flash * 0.30;
      ctx.fillStyle = '#9fe8c0';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
    }

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

    // you, rushing up at the camera. The same plates the genome is drawn on,
    // scaled from a speck to bigger than the screen, so the thing you dive
    // into is visibly yourself
    {
      const pl = this._plates();
      const kk = (Math.pow(t, 2.1) * 5.4 + 0.05) * Math.max(vw / pl.w, vh / pl.h);
      const w = pl.w * kk, h = pl.h * kk;
      const a = clamp01(1.35 - t * 1.7) * clamp01(t * 5);
      if (a > 0.01) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = a * 0.92;
        ctx.drawImage(pl.fill, cx - w / 2, cy - h / 2, w, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(pl.ghost, cx - w / 2, cy - h / 2, w, h);
        const rw = pl.rim.width * kk, rh = pl.rim.height * kk;
        ctx.globalAlpha = a;
        ctx.shadowColor = 'rgba(150,240,255,0.9)';
        ctx.shadowBlur = 18;
        ctx.drawImage(pl.rim, cx - rw / 2, cy - rh / 2, rw, rh);
        ctx.restore();
      }
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
    const S = Math.ceil(Math.hypot(vw, vh) * 1.12);
    if (this._plate && this._plate.width === S) return this._plate;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    this._paintSky(c, S);
    this._plate = cv;
    return cv;
  }

  /**
   * Outside you is a galaxy, painted once into a square plate so it can be
   * turned. It is built the way one actually looks: a bulge, two logarithmic
   * arms scattered with stars rather than drawn as bands, pink nurseries
   * strung along their leading edges, dust lanes eating the inside of each
   * arm, and a halo of old stars around the whole thing - all of it tipped
   * over so you are looking at it from slightly above its plane.
   */
  _paintSky(ctx, S) {
    const R = S / 2;
    const rng = mulberry32(0x5eed1e);
    const px = (x, y, col, a, w = 1) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x), Math.round(y), w, w);
    };

    // deep space
    const deep = ctx.createRadialGradient(R, R, 0, R, R, R);
    deep.addColorStop(0, '#0d0a1c');
    deep.addColorStop(0.45, '#080612');
    deep.addColorStop(1, '#030308');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, S, S);

    // far field, before anything else: the universe behind the galaxy
    for (let i = 0; i < 2600; i++) {
      const x = rng() * S, y = rng() * S;
      const b = rng();
      px(x, y, b > 0.94 ? '#ffd9b0' : b > 0.86 ? '#b8d0ff' : '#e8ecf8', 0.10 + b * 0.35);
    }

    ctx.save();
    ctx.translate(R, R);
    ctx.rotate(-0.38);
    ctx.scale(1, 0.46);                 // the tilt of the disc

    const RG = R * 0.90;
    // the disc glow the arms sit in
    const disc = ctx.createRadialGradient(0, 0, 0, 0, 0, RG);
    disc.addColorStop(0, 'rgba(255,242,214,0.30)');
    disc.addColorStop(0.10, 'rgba(255,206,150,0.20)');
    disc.addColorStop(0.34, 'rgba(150,160,230,0.13)');
    disc.addColorStop(0.72, 'rgba(88,104,190,0.06)');
    disc.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(0, 0, RG, 0, TAU); ctx.fill();

    // two arms, each a stream of stars scattered around a logarithmic spiral
    const B = 0.30;
    const arm = (turn, tint) => {
      const N = 5200;
      for (let i = 0; i < N; i++) {
        const u = Math.pow(rng(), 0.62);
        const th = u * 5.0 + turn;
        const r = RG * 0.085 * Math.exp(B * th);
        if (r > RG) continue;
        // scatter: tight near the core, loose out in the fringe
        const spread = RG * (0.018 + u * 0.085);
        const g1 = (rng() + rng() + rng() - 1.5) * spread;
        const g2 = (rng() + rng() + rng() - 1.5) * spread;
        const x = Math.cos(th) * r + g1, y = Math.sin(th) * r + g2;
        const d = Math.hypot(x, y) / RG;
        const b = rng();
        let col = '#dfe6ff';
        if (b > 0.965) col = '#ff9ec0';               // a nursery
        else if (b > 0.90) col = '#9fc4ff';
        else if (d < 0.30 && b > 0.55) col = tint;
        px(x, y, col, (0.16 + rng() * 0.62) * (1 - d * 0.45), b > 0.988 ? 2 : 1);
        if (b > 0.9955) {
          // the big ones bloom
          const gg = ctx.createRadialGradient(x, y, 0, x, y, RG * 0.02);
          gg.addColorStop(0, 'rgba(255,190,220,0.55)');
          gg.addColorStop(1, 'rgba(255,120,180,0)');
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(x, y, RG * 0.02, 0, TAU); ctx.fill();
        }
      }
    };
    arm(0, '#ffd9a8');
    arm(Math.PI, '#ffd0b0');

    // dust, laid along the inside edge of each arm
    ctx.globalAlpha = 1;
    for (const turn of [0.36, Math.PI + 0.36]) {
      for (let i = 0; i < 1700; i++) {
        const u = Math.pow(rng(), 0.5);
        const th = u * 4.6 + turn;
        const r = RG * 0.085 * Math.exp(B * th) * 0.90;
        if (r > RG) continue;
        const spread = RG * (0.010 + u * 0.038);
        const x = Math.cos(th) * r + (rng() + rng() - 1) * spread;
        const y = Math.sin(th) * r + (rng() + rng() - 1) * spread;
        px(x, y, '#0a0714', 0.10 + rng() * 0.30, rng() > 0.7 ? 2 : 1);
      }
    }

    // the bulge, over the top of the arms where they wind into it
    ctx.globalAlpha = 1;
    for (const [rr, col, a] of [[0.30, '255,224,170', 0.16], [0.17, '255,238,200', 0.24], [0.075, '255,252,236', 0.5]]) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, RG * rr);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(0.5, `rgba(${col},${a * 0.5})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, RG * rr, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 2200; i++) {
      const a = rng() * TAU, r = Math.pow(rng(), 2.4) * RG * 0.30;
      px(Math.cos(a) * r, Math.sin(a) * r, rng() > 0.6 ? '#fff4d8' : '#ffd9a8', 0.18 + rng() * 0.6);
    }
    ctx.restore();

    // the halo: old stars, well off the plane, and globular knots
    ctx.save();
    ctx.translate(R, R);
    for (let i = 0; i < 900; i++) {
      const a = rng() * TAU, r = Math.pow(rng(), 0.7) * R * 0.95;
      px(Math.cos(a) * r, Math.sin(a) * r * 0.86, '#ffe8c8', 0.06 + rng() * 0.22);
    }
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU, r = (0.35 + rng() * 0.55) * R;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.035);
      g.addColorStop(0, 'rgba(255,240,210,0.35)');
      g.addColorStop(1, 'rgba(255,220,180,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R * 0.035, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // cold gas, hanging in front of everything
    for (const c of [
      { x: 0.14, y: 0.74, r: 0.50, c: '118,58,168' },
      { x: 0.86, y: 0.78, r: 0.40, c: '28,108,158' },
      { x: 0.30, y: 0.12, r: 0.34, c: '178,66,108' },
      { x: 0.92, y: 0.24, r: 0.30, c: '58,150,148' },
    ]) {
      const cx = c.x * S, cy = c.y * S, r = c.r * S * 0.5;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${c.c},0.20)`);
      g.addColorStop(0.4, `rgba(${c.c},0.08)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The sky, turning. The galaxy is a plate on a very slow spin; four layers
   * of near stars slide across it at different rates as you pan, so the
   * distance between you and it reads. Once in a while something falls.
   */
  _drawSky(ctx, vw, vh, fade) {
    const plate = this._skyPlate(vw, vh);
    ctx.fillStyle = '#03040a';
    ctx.fillRect(0, 0, vw, vh);

    const S = plate.width;
    ctx.save();
    ctx.translate(vw * 0.80 - this.cam.x * 0.012, vh * 0.22 - this.cam.y * 0.012);
    ctx.rotate(this.t * 0.0045);
    ctx.globalAlpha = fade;
    ctx.drawImage(plate, -S / 2, -S / 2);
    ctx.restore();

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

    // something falling, every twelve seconds or so
    const period = 11.5;
    const ph = (this.t % period) / period;
    if (ph < 0.10) {
      const seed = Math.floor(this.t / period);
      const r1 = ((Math.sin(seed * 91.17) * 43758.5) % 1 + 1) % 1;
      const r2 = ((Math.sin(seed * 33.71) * 24634.1) % 1 + 1) % 1;
      const k = ph / 0.10;
      const x0 = r1 * vw, y0 = r2 * vh * 0.5;
      const len = vw * 0.28;
      const hx = x0 + len * k, hy = y0 + len * 0.42 * k;
      ctx.globalAlpha = fade * Math.sin(k * Math.PI) * 0.9;
      const g = ctx.createLinearGradient(hx - len * 0.22, hy - len * 0.09, hx, hy);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.95)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx - len * 0.22, hy - len * 0.09);
      ctx.lineTo(hx, hy);
      ctx.stroke();
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
   * The body you are standing in. Not a drawing of a crab: the crab. The same
   * rig the animal in the desert is assembled from, posed standing and baked
   * once, so the silhouette around the genome is the silhouette you walk
   * around in - every leg joint, both claws, the eyestalks, the shell.
   *
   * The shape is filled dark and lit at the rim; the full-colour render sits
   * inside it as a ghost, so you can see your own plating through yourself.
   */
  _plates() {
    const stage = this.game.crab.stage;
    if (!this._pl || this._pl.stage !== stage) this._pl = crabPlates(stage, 3);
    return this._pl;
  }

  /**
   * Where the animal sits on screen. It is not laid out in tree units: it is
   * fitted to the view, so that however far into the genome you have zoomed
   * you are still looking at the whole of yourself. It drifts a little against
   * the camera so it reads as a body you are inside rather than wallpaper.
   */
  _fit(vw, vh) {
    const pl = this._plates();
    // never blow one sprite pixel up past a certain size: a hatchling is a
    // coin with legs, and stretched over the whole screen it stops looking
    // like an animal. It grows here as it grows out there.
    const cap = 6 / pl.sc;
    const k = Math.min((vw * 0.97) / pl.w, (vh * 0.84) / pl.h, cap);
    const breathe = 1 + Math.sin(this.t * 0.55) * 0.008;
    const kk = k * breathe;
    const px = clamp(-this.cam.x * 0.055 * this.cam.z, -vw * 0.14, vw * 0.14);
    const py = clamp(-this.cam.y * 0.055 * this.cam.z, -vh * 0.12, vh * 0.12);
    const w = pl.w * kk, h = pl.h * kk;
    // centred on the animal's bounding box, not on its hip line, or the shell
    // walks off the top of the screen
    const x = vw / 2 + px - w / 2;
    // line the middle of the carapace up with the middle of the genome, then
    // hold the whole animal on screen
    const shellY = (pl.oy + pl.shell.y * pl.sc) * kk;
    let y = vh * 0.47 + py - shellY;
    if (h < vh - 26) y = clamp(y, 24, vh - h - 2);
    else y = vh / 2 - h / 2;
    const rw = pl.rimOx - pl.ox, rh = pl.rimOy - pl.oy;
    return {
      pl, k: kk, x, y, w, h,
      rx: x - rw * kk, ry: y - rh * kk,
      rw: pl.rim.width * kk, rh: pl.rim.height * kk,
    };
  }

  /** A point on the shell's top surface, in screen pixels. */
  _shellPt(a, b, vw, vh) {
    const f = this._fit(vw, vh);
    const p = f.pl.rig.shellSurface(a, b);
    return { x: f.x + (f.pl.ox + p.x * f.pl.sc) * f.k, y: f.y + (f.pl.oy + p.y * f.pl.sc) * f.k };
  }

  _drawBody(ctx, vw, vh, fade) {
    const f = this._fit(vw, vh);
    const pl = f.pl;
    const m = pl.m;
    const beat = Math.pow(1 - Math.abs(this.beat * 2 - 1), 3);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // the halo the animal throws onto the dark
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * (0.20 + beat * 0.12);
    ctx.shadowColor = 'rgba(120,224,244,0.95)';
    ctx.shadowBlur = 26;
    ctx.drawImage(pl.rim, f.rx, f.ry, f.rw, f.rh);
    ctx.shadowBlur = 0;

    // the body, solid
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * 0.96;
    ctx.drawImage(pl.fill, f.x, f.y, f.w, f.h);

    // your own plating, showing faintly through
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * (0.30 + beat * 0.10);
    ctx.drawImage(pl.ghost, f.x, f.y, f.w, f.h);
    ctx.globalAlpha = fade * (0.10 + beat * 0.16);
    ctx.drawImage(pl.glow, f.x, f.y, f.w, f.h);

    // a slow band of light travelling down you, shaped by your own outline
    const bandH = Math.max(16, vh * 0.20);
    const bandY = ((this.t * 0.13) % 1.5 - 0.25) * (vh + bandH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandY, vw, bandH);
    ctx.clip();
    ctx.globalAlpha = fade * 0.22;
    ctx.drawImage(pl.glow, f.x, f.y, f.w, f.h);
    ctx.restore();

    // and the outline, lit
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade * (0.66 + beat * 0.24);
    ctx.drawImage(pl.rim, f.rx, f.ry, f.rw, f.rh);
    ctx.restore();

    // the basin on your back, where it actually is, with what is in it
    const b0 = this._shellPt(m.basin.a, m.basin.b, vw, vh);
    const b1 = this._shellPt(m.basin.a + m.basin.r, m.basin.b, vw, vh);
    const b2 = this._shellPt(m.basin.a, m.basin.b + m.basin.r, vw, vh);
    const brx = Math.abs(b1.x - b0.x), bry = Math.max(2, Math.abs(b2.y - b0.y));
    ctx.globalAlpha = fade * 0.55;
    ctx.beginPath();
    ctx.ellipse(b0.x, b0.y, brx, bry, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(140,208,224,0.34)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const pond = clamp01(this.game.garden.pond);
    if (pond > 0.02) {
      const q = Math.sqrt(pond);
      ctx.globalAlpha = fade * (0.12 + pond * 0.26);
      ctx.fillStyle = '#5fc6d8';
      ctx.beginPath();
      ctx.ellipse(b0.x, b0.y, brx * q, bry * q, 0, 0, TAU);
      ctx.fill();
    }

    // haemolymph, drifting inside the carapace
    const cx = f.x + pl.ox * f.k, cy = f.y + (pl.oy + pl.shell.y * pl.sc) * f.k;
    const hrx = m.rx * pl.sc * f.k, hry = (m.ry + m.domeH * 0.7) * pl.sc * f.k;
    for (const mo of this.motes) {
      const yy = (mo.y - this.t * 0.010 * mo.s + 2) % 1;
      const xx = (mo.x + Math.sin(this.t * 0.26 * mo.s + mo.p) * 0.014 + 1) % 1;
      const dx = (xx - 0.5) * 2, dy = (yy - 0.5) * 2;
      if (dx * dx + dy * dy > 0.86) continue;
      const sx = cx + dx * hrx, sy = cy + dy * hry;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + mo.p)) + beat * 0.4;
      ctx.globalAlpha = fade * 0.42 * tw * mo.s;
      ctx.fillStyle = mo.r ? '#cd7a6c' : '#9fe8d4';
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
    ctx.globalAlpha = fade;
  }

  // -- the tree itself ------------------------------------------------------

  /**
   * The frame the whole thing hangs on: rings at each tier so depth is
   * visible at a glance, six spokes so a direction always means the same
   * system, and a name with a filled bar at the end of each so you can read
   * how far you have taken it without counting beads.
   */
  _drawArms(ctx, vw, vh, fade) {
    const z = this.cam.z;
    const O = this._S(0, 0, vw, vh);

    // the tiers, as rings. Reached ones are lit; the next one is a promise.
    const deepest = {};
    for (const n of this.L.nodes) {
      if (!n.arm || (this.grow[n.id] ?? 0) < 0.5) continue;
      deepest[n.arm] = Math.max(deepest[n.arm] ?? -1, n.tier ?? 0);
    }
    const maxTier = Math.max(-1, ...Object.values(deepest));
    for (let i = 0; i < R_TIER.length; i++) {
      const r = R_TIER[i];
      const on = i <= maxTier;
      const near = i === maxTier + 1;
      if (!on && !near) continue;
      ctx.globalAlpha = fade * (on ? 0.16 : 0.07 + 0.04 * Math.sin(this.t * 1.6));
      ctx.strokeStyle = on ? 'rgba(190,232,226,0.9)' : 'rgba(150,180,190,0.9)';
      ctx.lineWidth = 1;
      if (!on) ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.ellipse(O.x, O.y, r * z, r * 0.86 * z, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const arm of ARMS) {
      const lv = this.armLevel(arm.id);
      const d = armDir(arm.deg);
      const a = this._S(d.x * (R_GENE + 26), d.y * (R_GENE + 26), vw, vh);
      let reach = R_TIER[0] + 40;
      let far = R_GENE + 40;
      for (const n of this.L.nodes) {
        if (n.arm !== arm.id) continue;
        if ((this.seen[n.id] ?? 0) < 0.4) continue;
        const dd = Math.hypot(n.x, n.y);
        reach = Math.max(reach, dd + 70);
        far = Math.max(far, dd + 18);
      }
      const b = this._S(d.x * reach, d.y * reach, vw, vh);
      // the spoke: a dark bed with the arm's colour laid into it
      ctx.lineCap = 'round';
      ctx.globalAlpha = fade * 0.30;
      ctx.strokeStyle = 'rgba(4,7,12,0.9)';
      ctx.lineWidth = Math.max(2, 13 * z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const gr = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      gr.addColorStop(0, arm.colour);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = fade * (0.14 + lv * 0.26);
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(1, 9 * z);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

      // the name, set beside the spoke so it never lands on an organ, with a
      // bar underneath it that fills as the system grows
      const px2 = -d.y, py2 = d.x;
      const lp = this._S(d.x * far + px2 * 124, d.y * far + py2 * 124, vw, vh);
      if (lp.x > 30 && lp.x < vw - 30 && lp.y > 28 && lp.y < vh - 16) {
        const nw = textWidth(arm.name);
        ctx.globalAlpha = fade * 0.62;
        ctx.fillStyle = 'rgba(4,7,11,0.78)';
        ctx.fillRect(Math.round(lp.x - nw / 2) - 4, Math.round(lp.y) - 10, nw + 8, 19);
        ctx.globalAlpha = fade * (0.24 + lv * 0.3);
        ctx.strokeStyle = arm.colour;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(lp.x - nw / 2) - 3.5, Math.round(lp.y) - 9.5, nw + 7, 18);
        ctx.globalAlpha = fade * (0.62 + lv * 0.38);
        drawText(ctx, arm.name, lp.x, lp.y - 7, { color: arm.colour, align: 'center' });
        const bw = 34, bx = Math.round(lp.x - bw / 2), by = Math.round(lp.y + 3);
        ctx.globalAlpha = fade * 0.32;
        ctx.fillStyle = 'rgba(8,12,16,0.9)';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
        ctx.fillStyle = 'rgba(150,170,175,0.45)';
        ctx.fillRect(bx, by, bw, 2);
        ctx.globalAlpha = fade * (0.55 + lv * 0.45);
        ctx.fillStyle = arm.colour;
        ctx.fillRect(bx, by, Math.max(lv > 0 ? 1 : 0, Math.round(bw * lv)), 2);
      }
    }

    // spores, turning slowly round the middle of you
    for (const sp of this.spores) {
      const a = sp.a + this.t * sp.sp * 0.12;
      const r = sp.r + Math.sin(this.t * 0.5 + sp.p) * sp.rise;
      const p = this._S(Math.cos(a) * r, Math.sin(a) * r * 0.86, vw, vh);
      if (p.x < 0 || p.x > vw || p.y < 0 || p.y > vh) continue;
      ctx.globalAlpha = fade * (0.12 + 0.16 * (0.5 + 0.5 * Math.sin(this.t * 1.4 + sp.p)));
      ctx.fillStyle = sp.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
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
   * The connections. A grown one is a cord: a dark bed, the arm's colour laid
   * into it, a bright filament down the middle and something running out
   * along it, always away from the seed. An ungrown one is a dashed lead with
   * a chevron at the end, so an unbought choice still reads as a choice.
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
      const steps = 18;
      const pts = [];
      for (let i = 0; i <= steps; i++) pts.push(curveAt(pa, pb, mx, my, (i / steps) * Math.max(0.06, g > 0.5 ? 1 : seen)));
      const trace = () => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      };
      const w = Math.max(1.6, ln.w * z * lerp(0.55, 1, g));

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (g > 0.35) {
        ctx.globalAlpha = fade * g;
        trace(); ctx.strokeStyle = 'rgba(4,6,11,0.92)'; ctx.lineWidth = w + 4 * z + 1.5; ctx.stroke();
        trace(); ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.stroke();
        ctx.globalAlpha = fade * g * 0.55;
        trace(); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1, w * 0.26); ctx.stroke();
        // sap, running outward
        for (let k = 0; k < 2; k++) {
          const flow = (this.t * 0.30 + ln.w * 0.13 + k * 0.5) % 1;
          const bead = curveAt(pa, pb, mx, my, flow);
          const rad = Math.max(2, w * 2.4);
          ctx.globalAlpha = fade * g * (0.30 + 0.25 * Math.sin(flow * Math.PI));
          const gg = ctx.createRadialGradient(bead.x, bead.y, 0, bead.x, bead.y, rad);
          gg.addColorStop(0, '#ffffff');
          gg.addColorStop(0.35, colour);
          gg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(bead.x, bead.y, rad, 0, TAU); ctx.fill();
        }
      } else {
        ctx.globalAlpha = fade * seen * (0.45 + 0.18 * Math.sin(this.t * 2.2 + pb.x * 0.01));
        ctx.setLineDash([4 * z + 1, 4 * z + 2]);
        ctx.lineDashOffset = -this.t * 16 * z;
        trace();
        ctx.strokeStyle = 'rgba(176,196,206,0.75)';
        ctx.lineWidth = Math.max(1, w * 0.65);
        ctx.stroke();
        ctx.setLineDash([]);
        // a chevron pointing at what you could grow next
        const p1 = pts[pts.length - 1], p0 = pts[pts.length - 3] || pts[0];
        const an = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const L = Math.max(3, 5 * z);
        ctx.beginPath();
        ctx.moveTo(p1.x - Math.cos(an - 0.5) * L, p1.y - Math.sin(an - 0.5) * L);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p1.x - Math.cos(an + 0.5) * L, p1.y - Math.sin(an + 0.5) * L);
        ctx.strokeStyle = 'rgba(210,230,238,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
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
      const p = this._S(d.x * (reach + ORGAN_GAP), d.y * (reach + ORGAN_GAP), vw, vh);
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
      const grown = this.grow[n.id] ?? 0;

      // the halo says the state before you have read anything
      ctx.globalAlpha = fade * seen * (on ? 0.40 : ready ? 0.20 + pulse * 0.34 : 0.14);
      const gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.8);
      gg.addColorStop(0, on || ready ? n.color : '#7a8a90');
      gg.addColorStop(0.45, on || ready ? n.color : '#5a6a70');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 2.8, 0, TAU); ctx.fill();

      // a socket behind it, so a bead sits in the tree instead of on it
      ctx.globalAlpha = fade * seen * 0.85;
      ctx.fillStyle = 'rgba(5,8,12,0.85)';
      ctx.beginPath(); ctx.arc(p.x, p.y, rr + 2.5 * z + 1, 0, TAU); ctx.fill();

      // the bead
      ctx.globalAlpha = fade * seen;
      const art = orbArt(n.color, rr * (on ? 1 : 0.86), on);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (ready) ctx.scale(1 + pulse * 0.07, 1 + pulse * 0.07);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();

      // what it does, stamped into it
      const ico = n.data && n.data.icon;
      if (ico && rr > 6) {
        drawNodeIcon(ctx, ico, p.x, p.y,
          on ? 'rgba(10,13,10,0.86)' : ready ? 'rgba(246,242,226,0.92)' : 'rgba(176,186,190,0.55)',
          Math.max(1, Math.round(rr / 5.8)));
      }

      // owned: a closed ring with three lights going round it, which is the
      // clearest way to say "this one is running"
      if (on) {
        ctx.globalAlpha = fade * (0.55 + 0.2 * Math.sin(this.t * 1.5 + n.x * 0.01));
        ctx.strokeStyle = n.color;
        ctx.lineWidth = Math.max(1, 1.4 * z);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 3.5 * z, 0, TAU); ctx.stroke();
        if (rr > 7) {
          for (let k = 0; k < 3; k++) {
            const a2 = this.t * 0.7 + (k / 3) * TAU + n.x * 0.01;
            const sx = p.x + Math.cos(a2) * (rr + 3.5 * z);
            const sy = p.y + Math.sin(a2) * (rr + 3.5 * z);
            ctx.globalAlpha = fade * 0.85;
            ctx.fillStyle = '#f6fff0';
            ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
          }
        }
      } else if (rr > 6) {
        // not owned: an arc that fills with how much of the price you have
        const c = Math.max(1, this.cost(n));
        const k = clamp01(this.game.economy.nutrients / c);
        ctx.globalAlpha = fade * seen * 0.30;
        ctx.strokeStyle = 'rgba(170,186,190,0.8)';
        ctx.lineWidth = Math.max(1, 1.6 * z);
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 3.5 * z, 0, TAU); ctx.stroke();
        ctx.globalAlpha = fade * seen * (ready ? 0.95 : 0.7);
        ctx.strokeStyle = ready ? '#d8f0a4' : '#e2b74a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr + 3.5 * z, -Math.PI / 2, -Math.PI / 2 + TAU * k);
        ctx.stroke();
      }

      // a keystone gets a second ring, so the big decisions read as big
      if (n.big) {
        ctx.globalAlpha = fade * seen * (on ? 0.5 : 0.3);
        ctx.strokeStyle = on ? n.color : 'rgba(180,190,190,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 7.5 * z, 0, TAU); ctx.stroke();
        if (on) {
          for (let k = 0; k < 4; k++) {
            const a2 = -this.t * 0.35 + (k / 4) * TAU;
            const sx = p.x + Math.cos(a2) * (rr + 7.5 * z);
            const sy = p.y + Math.sin(a2) * (rr + 7.5 * z);
            ctx.globalAlpha = fade * 0.7;
            ctx.fillStyle = n.color;
            ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);
          }
        }
      }

      // hovering it lights it up and names it
      if (hot) {
        ctx.globalAlpha = fade * (0.5 + 0.3 * Math.sin(this.t * 6));
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr + 11 * z, 0, TAU); ctx.stroke();
      }

      // the price, under anything you do not own yet
      if (!on && z > 0.34) {
        const c = this.cost(n);
        const label = `${c}`;
        const tw = textWidth(label);
        ctx.globalAlpha = fade * seen * 0.8;
        ctx.fillStyle = 'rgba(6,9,12,0.8)';
        ctx.fillRect(Math.round(p.x - tw / 2) - 2, Math.round(p.y + rr + 5.5 * z), tw + 4, 9);
        ctx.globalAlpha = fade * seen;
        drawText(ctx, label, p.x, p.y + rr + 6.5 * z, {
          color: ready ? '#dff0a8' : costly ? '#e08c9c' : 'rgba(200,206,206,0.7)',
          align: 'center',
        });
      }
      // and the name of a keystone, because keystones are decisions
      if (n.big && (on || ready) && z > 0.45) {
        drawText(ctx, n.data.name, p.x, p.y - rr - 13 * z - 4,
          { color: arm.colour || n.color, align: 'center', alpha: fade * 0.85 });
      }

      // a stub where the chain keeps going, so you know there is more
      if (on && this._hasMore(n) && z > 0.3) {
        const d = armDir((arm.deg ?? 0));
        const s2 = this._S(n.x + d.x * 52, n.y + d.y * 52, vw, vh);
        ctx.globalAlpha = fade * (0.22 + 0.2 * Math.sin(this.t * 2 + n.x));
        ctx.strokeStyle = n.color;
        ctx.lineWidth = Math.max(1, 2 * z);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(s2.x, s2.y);
        ctx.stroke();
        ctx.setLineDash([]);
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

    // what a purchase looks like: the ring opening out of the node, and a
    // handful of sparks thrown off it
    for (const R of this.rings) {
      const t = clamp01(R.t);
      const p = this._S(R.x, R.y, vw, vh);
      const rad = lerp(R.r0, R.r1, easeOutCubic(t)) * this.cam.z;
      const a = 1 - t;
      ctx.globalAlpha = a * a * 0.9;
      ctx.strokeStyle = R.color;
      ctx.lineWidth = Math.max(1, 3 * (1 - t) * this.cam.z);
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * a * 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad * 0.72, 0, TAU); ctx.stroke();
      for (let k = 0; k < 10; k++) {
        const an = (k / 10) * TAU + R.seed;
        const d = rad * (0.9 + 0.35 * ((k * 7 + R.seed * 3) % 1));
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = k % 3 === 0 ? '#ffffff' : R.color;
        ctx.fillRect(Math.round(p.x + Math.cos(an) * d), Math.round(p.y + Math.sin(an) * d * 0.9), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
  }

  // -- chrome ---------------------------------------------------------------

  _drawChrome(ctx, vw, vh, fade, hover) {
    const e = this.game.economy;
    const total = EVOLUTIONS.length + SKILLS.length;
    const open = e.evolutions.size + e.skills.size;

    // a bar across the top: what you have to spend, and how far you have got.
    // The line under it is the whole genome, filling as you grow it.
    ctx.fillStyle = 'rgba(6,8,12,0.80)';
    ctx.fillRect(0, 0, vw, 20);
    ctx.fillStyle = 'rgba(150,208,220,0.18)';
    ctx.fillRect(0, 20, vw, 1);
    const done = clamp01(open / Math.max(1, total));
    const grad = ctx.createLinearGradient(0, 0, vw * done, 0);
    grad.addColorStop(0, '#5fc6d8');
    grad.addColorStop(0.5, '#8cc468');
    grad.addColorStop(1, '#e2d07a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 20, Math.round(vw * done), 1);
    drawText(ctx, 'YOUR GENOME', 6, 3, { color: '#cfe8d8' });
    // a bead of nutrient beside the count, so the currency has a face
    const label = `${Math.round(e.nutrients)} nutrients`;
    const lw = textWidth(label);
    const bx = Math.round(vw / 2 - lw / 2) - 7, by = 8;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    ctx.fillStyle = '#cfe89a';
    ctx.fillRect(bx - 1, by - 2, 3, 5);
    ctx.fillRect(bx - 2, by - 1, 5, 3);
    ctx.globalAlpha = fade * (0.3 + pulse * 0.4);
    ctx.fillStyle = '#f4ffd0';
    ctx.fillRect(bx - 1, by - 1, 2, 2);
    ctx.globalAlpha = fade;
    drawText(ctx, label, vw / 2, 3, { color: '#cfe89a', align: 'center' });
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
    const n = this.L.by[id];
    if (n) {
      this.rings.push({ x: n.x, y: n.y, r0: n.r, r1: n.r + 190, dur: 0.9, t: -chain.length * 0.4,
        color: n.color, seed: Math.random() });
      this.rings.push({ x: n.x, y: n.y, r0: n.r, r1: n.r + 96, dur: 0.6, t: -chain.length * 0.4 - 0.1,
        color: '#ffffff', seed: Math.random() });
    }
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
