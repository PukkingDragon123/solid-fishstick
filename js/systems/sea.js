// CRABDEN - the water that used to be here.
//
// This is not a separate screen. It is the world you already have - the same
// terrain, the same camera, the same crab - with a sea put on top of it. The
// seabed in the prologue is the desert floor you will spend the rest of the
// game walking across, one thousand years earlier and thirty metres down.
//
// It does three jobs:
//
//   life     corals, urchins, crablets and shoals of fish, placed on the
//            terrain the same deterministic way the dig sites are
//   water    the column itself - depth tint, god rays, caustics crawling over
//            the ground, the surface seen from underneath, silt and bubbles
//   drain    the thousand years: the surface walks down, the reef dies back,
//            the blue comes out of the light, and the desert is left

import { clamp, clamp01, lerp, damp, smoothstep, TAU, mulberry32, hashStr } from '../lib/math.js';
import { drawText, textWidth } from '../lib/font.js';
import { reefArt, fishArt, jellyArt, REEF_KINDS, FLOOR_KINDS, FISH_KINDS } from '../art/seaart.js';

const CELL = 90;               // one cell of reef, in world units
const DEPTH = 150;             // how far the surface is above the seabed
const DRAIN_SECS = 9.0;        // how long the sea takes to leave

export class Sea {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.t = 0;
    this.drain = 0;            // 0 full sea, 1 gone
    this.draining = false;
    this.fish = [];
    this.jellies = [];
    this.bubbles = [];
    this.cells = new Map();
    this.yearShow = 0;
  }

  get active() { return this.on; }
  /** How much of the underwater treatment is still applied. */
  get wet() { return this.on ? 1 - smoothstep(clamp01(this.drain * 1.15)) : 0; }

  start() {
    this.on = true;
    this.t = 0;
    this.drain = 0;
    this.draining = false;
    this.fish.length = 0;
    this.jellies.length = 0;
    this.bubbles.length = 0;
    const cx = this.game.crab.x;
    for (let i = 0; i < 40; i++) this._spawnFish(cx + (Math.random() - 0.5) * 900);
    for (let i = 0; i < 4; i++) {
      this.jellies.push({
        x: cx + (Math.random() - 0.5) * 800, y: -60 - Math.random() * 90,
        ph: Math.random() * TAU, sp: 0.5 + Math.random() * 0.5, s: 0.7 + Math.random() * 0.7,
      });
    }
  }

  stop() { this.on = false; }
  beginDrain() { this.draining = true; }

  /** Where the surface is, in world Y. It walks down as the sea goes. */
  level(x = this.game.crab.x) {
    const g = this.game.terrain.surfaceY(x);
    return g - DEPTH * (1 - this.drain) + this.drain * 40;
  }

  _spawnFish(x) {
    const kind = FISH_KINDS[Math.floor(Math.random() * FISH_KINDS.length)];
    const g = this.game.terrain.surfaceY(x);
    this.fish.push({
      kind, x, y: g - 20 - Math.random() * (DEPTH - 40),
      dir: Math.random() < 0.5 ? -1 : 1,
      sp: 16 + Math.random() * 30, s: 0.55 + Math.random() * 0.6,
      ph: Math.random() * TAU, bob: 3 + Math.random() * 7, turn: 2 + Math.random() * 6,
      school: Math.random() < 0.6,
    });
  }

  // -------------------------------------------------------------------------

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    if (this.draining) {
      this.drain = Math.min(1, this.drain + dt / DRAIN_SECS);
      this.yearShow = 1;
      if (this.drain >= 1) { this.draining = false; this.on = false; }
    }

    const cam = this.game.cam;
    const b = cam.bounds(260);
    const wet = this.wet;

    // fish: they cruise, they turn at the edge of where you can see, and as
    // the water goes they go with it
    for (let i = this.fish.length - 1; i >= 0; i--) {
      const f = this.fish[i];
      f.x += f.dir * f.sp * dt * (0.6 + wet * 0.4);
      f.ph += dt * (2 + f.sp * 0.06);
      const ground = this.game.terrain.surfaceY(f.x);
      const top = this.level(f.x);
      // stay in the water column, and drop with the ceiling as it falls
      f.y = clamp(f.y + Math.sin(f.ph * 0.4) * f.bob * dt, top + 10, ground - 8);
      f.turn -= dt;
      if (f.turn <= 0) { f.turn = 3 + Math.random() * 7; if (Math.random() < 0.4) f.dir *= -1; }
      if (f.x < b.x0 - 120 || f.x > b.x1 + 120) { f.dir *= -1; f.x = clamp(f.x, b.x0 - 110, b.x1 + 110); }
      if (wet < 0.25 && Math.random() < dt * 2) this.fish.splice(i, 1);
    }
    while (this.fish.length < 40 && wet > 0.3) this._spawnFish(Math.random() < 0.5 ? b.x0 - 80 : b.x1 + 80);

    for (const j of this.jellies) {
      j.ph += dt * j.sp;
      j.y -= (6 + Math.sin(j.ph) * 8) * dt;
      j.x += Math.sin(j.ph * 0.3) * 5 * dt;
      const top = this.level(j.x);
      if (j.y < top + 16) j.y = this.game.terrain.surfaceY(j.x) - 30;
    }

    // bubbles come up out of the sand, and off you
    if (wet > 0.2 && Math.random() < dt * 8) {
      const x = lerp(b.x0, b.x1, Math.random());
      this.bubbles.push({
        x, y: this.game.terrain.surfaceY(x) - 2, r: 0.4 + Math.random() * 0.9,
        sp: 12 + Math.random() * 22, ph: Math.random() * TAU, t: 0,
      });
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const u = this.bubbles[i];
      u.t += dt;
      u.y -= u.sp * dt;
      u.x += Math.sin(u.t * 3 + u.ph) * 6 * dt;
      if (u.y < this.level(u.x) + 2 || u.t > 12) this.bubbles.splice(i, 1);
    }
  }

  /** Bubbles off a point, for digging and for anything that moves fast. */
  puff(x, y, n = 8) {
    if (!this.on) return;
    for (let i = 0; i < n; i++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 6,
        r: 0.4 + Math.random() * 1.1, sp: 16 + Math.random() * 30,
        ph: Math.random() * TAU, t: 0,
      });
    }
  }

  // -- the reef, placed on the ground ---------------------------------------

  _cell(ci) {
    let c = this.cells.get(ci);
    if (c) return c;
    const rng = mulberry32(hashStr('reef:' + ci));
    const items = [];
    const n = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const x = (ci + rng()) * CELL;
      const big = rng() < 0.55;
      const size = big ? 0.9 + rng() * 1.1 : 0.5 + rng() * 0.55;
      items.push({
        x,
        kind: big ? REEF_KINDS[Math.floor(rng() * REEF_KINDS.length)]
          : FLOOR_KINDS[Math.floor(rng() * FLOOR_KINDS.length)],
        s: size,
        seed: Math.floor(rng() * 9999),
        flip: rng() < 0.5,
        sway: rng() * TAU,
        // anything big enough to hide you goes behind you
        far: size > 1.15 || rng() < 0.45,
      });
    }
    // and a crablet or two, walking about on the sand
    if (rng() < 0.5) {
      items.push({
        x: (ci + rng()) * CELL, kind: 'crablet', s: 0.4 + rng() * 0.35,
        seed: Math.floor(rng() * 9999), flip: rng() < 0.5, sway: rng() * TAU,
        walk: 6 + rng() * 10, far: false,
      });
    }
    c = items;
    this.cells.set(ci, c);
    if (this.cells.size > 200) this.cells.clear();
    return c;
  }

  near(x0, x1) {
    const out = [];
    for (let ci = Math.floor(x0 / CELL); ci <= Math.ceil(x1 / CELL); ci++) {
      for (const it of this._cell(ci)) if (it.x >= x0 && it.x <= x1) out.push(it);
    }
    return out;
  }

  /** Everything growing on the bottom. `far` is the layer behind the animal. */
  drawReef(ctx, cam, far) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const b = cam.bounds(90);
    const z = cam.zoom;
    for (const it of this.near(b.x0, b.x1)) {
      if (!!it.far !== far) continue;
      let x = it.x;
      if (it.walk) x += Math.sin(this.t * 0.5 + it.sway) * it.walk;
      const y = this.game.terrain.surfaceY(x);
      const s = cam.worldToScreen(x, y);
      const art = reefArt(it.kind, Math.max(0.35, it.s * (far ? 0.8 : 1)), it.seed);
      const sway = Math.sin(this.t * 0.8 + it.sway) * 0.05 * wet;
      ctx.save();
      ctx.globalAlpha = wet * (far ? 0.72 : 1);
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * (it.flip ? -1 : 1), z);
      if (!it.walk) ctx.rotate(sway);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** The swimmers, and the bubbles going up past them. */
  drawSwimmers(ctx, cam) {
    const wet = this.wet;
    if (wet <= 0.02) return;
    const z = cam.zoom;
    for (const f of this.fish) {
      const s = cam.worldToScreen(f.x, f.y);
      if (s.x < -40 || s.x > this.game.renderer.vw + 40) continue;
      const art = fishArt(f.kind, Math.max(0.4, f.s));
      const beat = Math.sin(f.ph * 2.4) * 0.5;
      ctx.save();
      ctx.globalAlpha = wet;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * f.dir, z);
      ctx.rotate(Math.sin(f.ph * 0.7) * 0.12);
      // the tail beats about the peduncle, the body just leans into the turn
      ctx.save();
      ctx.translate(art.joint.x, art.joint.y);
      ctx.rotate(beat * 0.5);
      ctx.drawImage(art.tail.cv, -art.tail.ox, -art.tail.oy);
      ctx.restore();
      ctx.drawImage(art.body.cv, -art.body.ox, -art.body.oy);
      ctx.restore();
    }
    for (const j of this.jellies) {
      const s = cam.worldToScreen(j.x, j.y);
      const art = jellyArt(Math.max(0.4, j.s));
      const pulse = 1 + Math.sin(j.ph) * 0.10;
      ctx.save();
      ctx.globalAlpha = wet * 0.8;
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(z * pulse, z / pulse);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
    for (const u of this.bubbles) {
      const s = cam.worldToScreen(u.x, u.y);
      const r = Math.max(1, u.r * z);
      ctx.globalAlpha = wet * 0.55;
      ctx.strokeStyle = '#dff6ff';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = wet * 0.35;
      ctx.fillStyle = '#bfeaf6';
      ctx.fillRect(Math.round(s.x - r * 0.3), Math.round(s.y - r * 0.5), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // -- the water itself ------------------------------------------------------

  /**
   * Everything that makes it read as water rather than as a blue filter: the
   * column above the ground painted out, the light coming down through it in
   * shafts, a net of caustics crawling over whatever the light lands on, the
   * surface seen from underneath, and silt hanging in between.
   */
  /**
   * The column: everything above the seabed is water, so the desert sky and
   * the far dunes are painted out of the frame entirely. This happens *before*
   * the reef and the animal are drawn, because they are in the water, not
   * behind it - which is the whole difference between a sea and a blue filter.
   */
  drawColumn(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.01) return;
    const terr = this.game.terrain;
    const surfW = cam.worldToScreen(cam.x, this.level(cam.x)).y;

    const col = ctx.createLinearGradient(0, Math.min(surfW, 0), 0, vh);
    col.addColorStop(0, `rgba(120,212,226,${0.94 * wet})`);
    col.addColorStop(0.40, `rgba(38,140,168,${0.97 * wet})`);
    col.addColorStop(1, `rgba(12,74,102,${0.99 * wet})`);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= vw; x += 6) {
      const w = cam.screenToWorld(x, 0).x;
      ctx.lineTo(x, cam.worldToScreen(w, terr.surfaceY(w)).y);
    }
    ctx.lineTo(vw, 0);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, vw, vh);

    // the light coming down through it, which only exists in the column
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const ph = i * 1.9;
      const x = vw * ((i + 0.5) / 6) + Math.sin(this.t * 0.2 + ph) * vw * 0.04;
      const lean = Math.sin(this.t * 0.15 + ph) * 0.12 + 0.06;
      const a = (0.07 + 0.04 * (0.5 + 0.5 * Math.sin(this.t * 0.5 + ph))) * wet;
      const g = ctx.createLinearGradient(x, surfW, x + vh * lean, vh);
      g.addColorStop(0, `rgba(224,252,255,${a})`);
      g.addColorStop(1, 'rgba(150,220,240,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - vw * 0.012, surfW);
      ctx.lineTo(x + vw * 0.012, surfW);
      ctx.lineTo(x + vh * lean + vw * 0.05, vh);
      ctx.lineTo(x + vh * lean - vw * 0.05, vh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /**
   * And everything that hangs between you and what you are looking at: the
   * depth wash, caustics crawling over the sand, silt, the surface seen from
   * underneath, and - while the sea is leaving - the years.
   */
  overlay(ctx, cam, vw, vh) {
    const wet = this.wet;
    if (wet <= 0.01) return;
    const terr = this.game.terrain;
    const z = cam.zoom;
    const surfW = cam.worldToScreen(cam.x, this.level(cam.x)).y;

    // 1. the water you are looking through
    ctx.globalAlpha = 0.20 * wet;
    ctx.fillStyle = '#1c7a96';
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    // 3. caustics, crawling over the sand
    for (let i = 0; i < 54; i++) {
      const sx = ((i * 37 + Math.sin(this.t * 0.5 + i) * 14) % vw + vw) % vw;
      const w = cam.screenToWorld(sx, 0).x;
      const gy = cam.worldToScreen(w, terr.surfaceY(w)).y;
      const y = gy + ((i % 5) - 1) * 3 * z + Math.sin(this.t * 1.1 + i * 2.3) * 3;
      const ww = (8 + Math.sin(this.t * 1.7 + i) * 6) * z * 0.6;
      ctx.globalAlpha = wet * 0.30 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 2.1 + i * 1.3)));
      ctx.fillStyle = '#d8f8ff';
      ctx.fillRect(Math.round(sx - ww / 2), Math.round(y), Math.max(2, ww), 1);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 4. silt, hanging in the water
    for (let i = 0; i < 90; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453;
      const h2 = Math.sin(i * 78.233) * 43758.5453;
      const px = (((h1 - Math.floor(h1)) * vw - cam.x * z * 0.3 - this.t * 2) % vw + vw) % vw;
      const py = (((h2 - Math.floor(h2)) * vh - this.t * 5 - cam.y * z * 0.3) % vh + vh) % vh;
      ctx.globalAlpha = wet * (0.10 + 0.18 * (0.5 + 0.5 * Math.sin(this.t * 1.4 + i)));
      ctx.fillStyle = i % 7 === 0 ? '#eafaff' : '#a9d6e4';
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }
    ctx.globalAlpha = 1;

    // 5. the surface, seen from below
    if (surfW > -30 && surfW < vh) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, surfW - 40);
      ctx.lineTo(vw, surfW - 40);
      for (let x = vw; x >= 0; x -= 6) {
        ctx.lineTo(x, surfW + Math.sin(x * 0.05 + this.t * 1.6) * 3 + Math.sin(x * 0.11 - this.t * 2.3) * 1.6);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, surfW - 26, 0, surfW + 12);
      g.addColorStop(0, `rgba(228,252,255,${0.9 * wet})`);
      g.addColorStop(0.6, `rgba(150,226,240,${0.5 * wet})`);
      g.addColorStop(1, 'rgba(110,200,220,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      for (let x = 0; x < vw; x += 9) {
        const y = surfW + Math.sin(x * 0.05 + this.t * 1.6) * 3 + Math.sin(x * 0.11 - this.t * 2.3) * 1.6;
        ctx.globalAlpha = wet * (0.3 + 0.35 * Math.sin(x * 0.2 + this.t * 3));
        ctx.fillStyle = '#f2ffff';
        ctx.fillRect(x, Math.round(y) - 1, 5, 1);
      }
      ctx.globalAlpha = 1;
    }

    // 6. and the years, while the sea is leaving
    if (this.yearShow > 0 && this.drain > 0) {
      const yr = Math.round(Math.pow(clamp01(this.drain), 0.72) * 1000);
      const label = `${yr} YEARS`;
      const fade = clamp01(this.drain * 6) * clamp01((1.05 - this.drain) * 6);
      // It sits high and small, just under the top bar, like a slate held up
      // to the camera - in the middle of the frame it competes with the shot.
      const w = textWidth(label);
      const ty = Math.round(vh * 0.115);
      ctx.globalAlpha = fade * 0.55;
      drawText(ctx, label, Math.round(vw / 2), ty, {
        color: '#f6ecd2', align: 'center', outline: true, outlineColor: 'rgba(0,0,0,0.6)',
      });
      ctx.globalAlpha = fade * 0.32;
      ctx.fillStyle = '#f6ecd2';
      ctx.fillRect(Math.round(vw / 2 - w / 2), ty + 10, Math.round(w * this.drain), 1);
      ctx.globalAlpha = 1;
    }
  }
}
