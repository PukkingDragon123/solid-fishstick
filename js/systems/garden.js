// CRABDEN - the shell garden.
//
// The crab's back is the board. Water buys plants, plants are set into plots
// along the shell, and what grows there decides which creatures walk out of
// the desert to live on you. The spring fills a basin behind the crest; when
// the basin overflows the water runs off the back as a fall, and the plants
// that need standing water can finally be planted.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { buildPlant } from '../art/floraart.js';
import { FLORA_BY_ID, STAGE_NAME } from '../data/flora.js';
import { MATERIALS } from '../lib/palette.js';

const GROW_STAGES = 4;

export class Garden {
  constructor(game) {
    this.game = game;
    this.plots = [];
    this.pond = 0;            // 0..1 how full the basin is
    this.pondTarget = 0;
    this.spring = 0;          // spring plume intensity
    this.t = 0;
    this.falls = [];          // active waterfall strands
    this.lushness = 0;        // 0..1 smoothed cover, drives creature spawns
    this.buildPlots(6);
  }

  /** Plots run along the shell; growing the crab unlocks more of them. */
  buildPlots(n) {
    // dry plots run along the crest and the front slope; two wet plots sit
    // in the basin itself and only take plants that want their feet wet
    const spots = [
      { u: 0.48, row: 1 }, { u: 0.64, row: 1 }, { u: 0.56, row: 0 },
      { u: 0.75, row: 0 }, { u: 0.82, row: 1 }, { u: 0.40, row: 0 },
      { u: 0.91, row: 1 }, { u: 0.88, row: 0 }, { u: 0.70, row: 1 },
      { u: 0.44, row: 1 },
      { u: 0.17, row: 1, wet: true }, { u: 0.29, row: 0, wet: true },
    ];
    this.plots = spots.map((s, i) => ({
      ...s, i, unlocked: i < n, plant: null,
      sway: Math.random() * TAU, variant: i % 3,
    }));
  }

  /** Plants are grown to fit the shell they live on. */
  plantScale(crab) { return clamp(crab.m.shellH / 84, 0.3, 1.3); }

  get unlockedCount() { return this.plots.filter((p) => p.unlocked).length; }
  freeFor(def) {
    return this.plots.find((p) => p.unlocked && !p.plant && !!p.wet === !!def.needsPond) || null;
  }
  get freePlot() { return this.plots.find((p) => p.unlocked && !p.plant && !p.wet) || null; }
  get planted() { return this.plots.filter((p) => p.plant); }

  countOf(id) { return this.plots.reduce((n, p) => n + (p.plant && p.plant.id === id ? 1 : 0), 0); }
  hasMature(id) {
    return this.plots.some((p) => p.plant && p.plant.id === id && p.plant.stage >= 3);
  }

  unlockPlot() {
    const p = this.plots.find((q) => !q.unlocked);
    if (p) { p.unlocked = true; return true; }
    return false;
  }

  /** Put a plant in a plot. Returns the plant, or null if it will not take. */
  plant(plotIndex, floraId) {
    const plot = this.plots[plotIndex];
    const def = FLORA_BY_ID[floraId];
    if (!plot || !plot.unlocked || plot.plant || !def) return null;
    if (def.needsPond && !(plot.wet && this.pond > 0.35)) return null;
    if (plot.wet && !def.needsPond) return null;
    plot.plant = {
      id: floraId, def, stage: 0, growth: 0, health: 1, thirst: 0,
      age: 0, born: this.t, variant: (plot.i * 7 + plotIndex) % 3,
    };
    return plot.plant;
  }

  uproot(plotIndex) {
    const plot = this.plots[plotIndex];
    if (!plot || !plot.plant) return null;
    const p = plot.plant;
    plot.plant = null;
    return p;
  }

  // -- simulation -----------------------------------------------------------

  /**
   * `supply` is how much water the crab can spare this tick; the garden
   * returns what it drank and what it fixed as nutrients.
   */
  update(dt, supply, weather) {
    this.t += dt;
    const crab = this.game.crab;

    // basin: fills from the spring, loses to evaporation and to the plants
    const evap = 0.010 * (0.4 + (weather ? weather.haze : 0.4)) * (1 + (weather?.heat || 0));
    this.pond = clamp01(this.pond - evap * dt);
    this.spring = Math.max(0, this.spring - dt * 1.6);

    let drank = 0, fixed = 0, cover = 0;
    for (const plot of this.plots) {
      const pl = plot.plant;
      if (!pl) continue;
      pl.age += dt;
      const want = pl.def.upkeep * dt;
      const got = Math.min(want, Math.max(0, supply - drank));
      drank += got;
      const short = want > 0 ? 1 - got / want : 0;
      pl.thirst = clamp01(pl.thirst + (short - 0.5) * dt * 0.22);
      // standing water keeps everything on the shell alive for free
      if (this.pond > 0.35) pl.thirst = Math.max(0, pl.thirst - dt * 0.28);
      pl.health = clamp01(pl.health + (pl.thirst > 0.7 ? -dt * 0.09 : dt * 0.06));

      if (pl.stage < GROW_STAGES - 1) {
        const rate = (1 - pl.thirst * 0.8) * (0.6 + this.pond * 0.7) * (pl.def.growBoost || 1);
        pl.growth += (dt / pl.def.grow) * Math.max(0.06, rate);
        if (pl.growth >= 1) {
          pl.growth = 0; pl.stage++;
          this.game.onPlantGrew?.(plot, pl);
        }
      } else {
        fixed += pl.def.yield * dt * pl.health * (0.65 + this.pond * 0.5);
        cover += 1;
        if (Math.random() < dt * 0.10 && this.game.fx) {
          const w = this.plotWorld(plot);
          const col = MATERIALS[pl.def.mat]?.ramp[6] || '#b6de8f';
          this.game.fx.drift(w.x, w.y - 4, pl.def.fruitMat ? '#dc6379' : col, 1);
        }
      }
    }

    this.lushness = damp(this.lushness, clamp01(cover / Math.max(3, this.plots.length * 0.6)), 0.05, dt);

    // waterfall strands live while the basin is over the rim
    const over = this.pond > 0.88;
    const crabRef = crab;
    if (over && this.falls.length < 3 && Math.random() < dt * 6) {
      this.falls.push({ u: (crab && crab.m.spillU || 0.045) + Math.random() * 0.03, t: 0, life: 1.6 + Math.random() * 2.6, w: 1 + Math.random() * 1.4 });
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t += dt;
      if (f.t > f.life || (!over && f.t > 0.6)) this.falls.splice(i, 1);
    }
    if (over && crab && this.game.fx && Math.random() < dt * 22) {
      const lip = crab.shellWorld(0.07);
      const gy = this.game.terrain.surfaceY(lip.x);
      this.game.fx.splash(lip.x, gy, 1, 16);
      if (Math.random() < 0.35) this.game.fx.mist(lip.x, gy - 6, 1, 10);
      this.game.wetSand?.(lip.x, 1.4 * dt * 60);
    }
    return { drank, fixed };
  }

  /** The spring pumping: fills the basin and throws a plume. */
  pumpInto(amount) {
    this.pondTarget = 1;
    this.pond = clamp01(this.pond + amount);
    this.spring = Math.min(1.6, this.spring + 0.8);
  }

  // -- placement ------------------------------------------------------------

  plotWorld(plot) {
    const crab = this.game.crab;
    const p = crab.shellWorld(plot.u);
    return p;
  }

  /** Which plot is nearest a world point, for tap-to-plant. */
  pickPlot(wx, wy, maxDist = 18) {
    let best = null, bd = maxDist * maxDist;
    for (const p of this.plots) {
      if (!p.unlocked) continue;
      const w = this.plotWorld(p);
      const d = (w.x - wx) ** 2 + (w.y - wy) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // -- drawing --------------------------------------------------------------

  /** Plants on the far side of the shell, behind the crab's body. */
  drawFar(ctx, crab) { this._drawRow(ctx, crab, 0); }
  /** Plants on the near side, plus the water. */
  drawNear(ctx, crab) {
    this._drawWater(ctx, crab);
    this._drawRow(ctx, crab, 1);
  }

  _drawRow(ctx, crab, row) {
    const m = crab.m;
    const f = crab.faceT < 0 ? -1 : 1;
    const wind = this.game.weather ? this.game.weather.windSpeed : 0.3;
    ctx.save();
    ctx.rotate(crab.bodyAngle);
    const list = this.plots.filter((p) => p.row === row && p.plant);
    list.sort((a, b) => (a.u - b.u) * f);
    for (const plot of list) {
      const pl = plot.plant;
      const sp = crab.rig.shellPoint(plot.u);
      const art = buildPlant(pl.def, pl.stage, pl.variant, this.plantScale(crab), row === 0 ? 0.34 : 0);
      const sway = Math.sin(this.t * (1.3 + plot.i * 0.13) + plot.sway) * (0.035 + wind * 0.07)
        + Math.sin(this.t * 3.1 + plot.sway) * 0.012;
      // plants stand up, but lean a little with the rock they root in
      const tilt = Math.atan2(sp.nx, -sp.ny) * 0.26 * f;
      ctx.save();
      ctx.translate(sp.x * f, sp.y + 1);
      ctx.rotate(tilt + sway);
      const wilt = 1 - pl.thirst * 0.22;
      ctx.scale(f * wilt, wilt);
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
      // a dry plant sheds
      if (pl.thirst > 0.75 && Math.random() < 0.02) {
        const w = this.plotWorld(plot);
        this.game.fx?.drift(w.x, w.y - 3, '#8a7338', 1);
      }
    }
    ctx.restore();
  }

  /** The basin, the spring and the fall - all of the shell's water. */
  _drawWater(ctx, crab) {
    const m = crab.m;
    const f = crab.faceT < 0 ? -1 : 1;
    const [b0, b1] = m.basin;
    ctx.save();
    ctx.rotate(crab.bodyAngle);

    if (this.pond > 0.02) {
      // the basin is a real dip in the shell, held by a stone rim behind it.
      // water fills to whichever rim is lower - that is the one it spills over.
      const dip = (b0 + b1) * 0.5;
      const uAt = (u) => crab.rig.shellPoint(u);
      const floorY = uAt(dip).y;
      const spillY = Math.max(uAt(b0 - 0.045).y, uAt(b1 + 0.035).y);
      const level = lerp(floorY - 0.4, spillY, clamp01(this.pond));

      if (level < floorY - 0.2) {
        // walk out from the dip until the rock climbs above the waterline
        let uL = dip, uR = dip;
        for (let u = dip; u >= 0.01; u -= 0.006) { if (uAt(u).y < level) break; uL = u; }
        for (let u = dip; u <= 0.99; u += 0.006) { if (uAt(u).y < level) break; uR = u; }
        const N = 30;
        const pts = [];
        for (let i = 0; i <= N; i++) pts.push(uAt(lerp(uL, uR, i / N)));
        ctx.beginPath();
        ctx.moveTo(pts[0].x * f, level);
        for (const sp of pts) ctx.lineTo(sp.x * f, Math.max(sp.y, level));
        ctx.lineTo(pts[pts.length - 1].x * f, level);
        ctx.closePath();
        const deep = Math.max(...pts.map((q) => q.y));
        const grad = ctx.createLinearGradient(0, level - 1, 0, deep + 1);
        grad.addColorStop(0, '#8adcea');
        grad.addColorStop(0.35, '#2d93a9');
        grad.addColorStop(1, '#0f3b49');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.save();
        ctx.clip();
        const xa = pts[0].x * f, xb = pts[pts.length - 1].x * f;
        const x0 = Math.min(xa, xb), wpx = Math.max(2, Math.abs(xb - xa));
        ctx.fillStyle = '#d6f2f8';
        ctx.fillRect(Math.round(x0), Math.round(level), Math.round(wpx), 1);
        for (let i = 0; i < 6; i++) {
          const ph = this.t * (0.6 + i * 0.13) + i * 1.9;
          const gx = x0 + (Math.sin(ph) * 0.5 + 0.5) * wpx;
          ctx.globalAlpha = 0.5 - (i % 3) * 0.13;
          ctx.fillStyle = '#eafbfd';
          ctx.fillRect(Math.round(gx - 2), Math.round(level + 1 + (i % 3)), 3 + (i % 2) * 2, 1);
        }
        // ripple rings where the spring breaks the surface
        if (this.spring > 0.05) {
          const org = crab.rig.sockets.organ;
          ctx.globalAlpha = clamp01(this.spring) * 0.7;
          ctx.strokeStyle = '#eafbfd';
          ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            const r = ((this.t * 14 + i * 5) % 15) + 1;
            ctx.globalAlpha = clamp01(this.spring) * (1 - r / 16) * 0.6;
            ctx.beginPath();
            ctx.ellipse(org.x * f, level + 1, r, r * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    // the spring itself: a plume out of the organ
    if (this.spring > 0.02) {
      const org = crab.rig.sockets.organ;
      const x = org.x * f, y = org.y;
      const h = 4 + this.spring * 9;
      ctx.globalAlpha = clamp01(this.spring);
      ctx.fillStyle = '#c4ecf1';
      for (let i = 0; i < 5; i++) {
        const ph = this.t * 9 + i * 1.3;
        const w = 3 - i * 0.4;
        ctx.fillRect(Math.round(x - w / 2 + Math.sin(ph) * 1.2), Math.round(y - h * (i / 5)), Math.max(1, w), 2);
      }
      ctx.globalAlpha = 1;
    }

    // overflow: strands falling off the back edge of the shell
    if (this.falls.length) {
      for (const fl of this.falls) {
        const sp = crab.rig.shellPoint(fl.u);
        const x = sp.x * f, y0 = sp.y;
        const drop = crab.standH + m.bodyH * 0.6;
        const age = clamp01(fl.t / 0.4);
        ctx.globalAlpha = 0.72 * age * clamp01((fl.life - fl.t) / 0.5);
        const g = ctx.createLinearGradient(0, y0, 0, y0 + drop);
        g.addColorStop(0, '#c4ecf1');
        g.addColorStop(0.3, '#5fc6d8');
        g.addColorStop(1, 'rgba(120,214,228,0.18)');
        ctx.fillStyle = g;
        const wob = Math.sin(this.t * 4 + fl.u * 20) * 1.2;
        ctx.fillRect(Math.round(x - fl.w / 2), Math.round(y0), Math.max(1, fl.w), Math.round(drop * age));
        ctx.fillRect(Math.round(x - fl.w / 2 + wob), Math.round(y0 + drop * 0.55 * age),
          Math.max(1, fl.w * 0.7), Math.round(drop * 0.45 * age));
        // white water at the lip
        ctx.fillStyle = '#eafbfd';
        ctx.fillRect(Math.round(x - fl.w / 2 - 1), Math.round(y0 - 1), Math.max(1, fl.w) + 2, 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // -- save -----------------------------------------------------------------

  toJSON() {
    return {
      pond: this.pond,
      plots: this.plots.map((p) => ({
        u: p.u, unlocked: p.unlocked,
        plant: p.plant ? { id: p.plant.id, stage: p.plant.stage, growth: p.plant.growth,
          health: p.plant.health, thirst: p.plant.thirst, variant: p.plant.variant } : null,
      })),
    };
  }

  fromJSON(d) {
    if (!d) return;
    this.pond = d.pond || 0;
    (d.plots || []).forEach((s, i) => {
      const plot = this.plots[i];
      if (!plot) return;
      plot.unlocked = !!s.unlocked;
      plot.plant = null;
      if (s.plant && FLORA_BY_ID[s.plant.id]) {
        plot.plant = { ...s.plant, def: FLORA_BY_ID[s.plant.id], age: 0, born: 0 };
      }
    });
  }
}
