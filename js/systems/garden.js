// CRABDEN - the shell garden.
//
// The crab's back is the board. Water buys plants, plants are set into plots
// along the shell, and what grows there decides which creatures walk out of
// the desert to live on you. The spring fills a basin behind the crest; when
// the basin overflows the water runs off the back as a fall, and the plants
// that need standing water can finally be planted.

import { clamp, clamp01, lerp, damp, TAU } from '../lib/math.js';
import { buildPlant } from '../art/floraart.js';
import { buildStructure } from '../art/buildart.js';
import { FLORA_BY_ID, STAGE_NAME, NEEDS_TEXT } from '../data/flora.js';
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
    this.list = 0;            // smoothed lean from an unevenly loaded shell
    this.buildPlots();
  }

  /**
   * Beds are laid across the whole shell and none of them are locked. What
   * stops you filling every one is not a slot count, it is what the animal can
   * carry and how evenly you have loaded it.
   */
  buildPlots() {
    // dry plots run along the crest and the front slope; two wet plots sit
    // in the basin itself and only take plants that want their feet wet
    // beds are laid across the top of the shell: `a` runs left to right,
    // `b` runs from the far rim to the near one. Two sit in the basin itself
    // and only take plants that want their feet wet.
    const spots = [
      { a: 0.00, b: 0.52 }, { a: -0.44, b: 0.40 }, { a: 0.44, b: 0.40 },
      { a: -0.66, b: 0.02 }, { a: 0.66, b: 0.02 }, { a: -0.26, b: 0.76 },
      { a: 0.26, b: 0.76 }, { a: -0.74, b: -0.34 }, { a: 0.74, b: -0.34 },
      { a: 0.00, b: 0.18 },
      { a: -0.52, b: 0.64 }, { a: 0.52, b: 0.64 },
      { a: -0.86, b: 0.22 }, { a: 0.86, b: 0.22 },
      { a: -0.40, b: -0.62 }, { a: 0.40, b: -0.62 },
      { a: -0.19, b: -0.30, wet: true }, { a: 0.19, b: -0.30, wet: true },
      { a: 0.00, b: -0.58, wet: true },
    ];
    this.plots = spots.map((s, i) => ({
      ...s, i, unlocked: true, plant: null,
      u: (s.b + 1) / 2,
      sway: Math.random() * TAU, variant: i % 3,
    }));
  }

  /** Plants are grown to fit the shell they live on. */
  plantScale(crab) { return clamp(crab.m.rx / 78, 0.16, 0.95); }

  // -- what the animal is carrying -----------------------------------------

  /** What one thing on the shell weighs. */
  massOf(plot) {
    if (plot.plant) return (plot.plant.def.mass || 1.4) * (0.45 + plot.plant.stage * 0.185);
    if (plot.build) return 2.6;
    return 0;
  }

  /** Everything on your back, added up. */
  get load() {
    let m = 0;
    for (const p of this.plots) m += this.massOf(p);
    return m;
  }

  /** What you can carry: mostly how big you are, plus what you have grown. */
  get capacity() {
    const t = this.game.crab ? this.game.crab.m.t : 0;
    return 5.5 + t * 26 + (this.game.economy ? this.game.economy.stat('plots') * 2.4 : 0);
  }

  /** 0 while you are within it, rising as you go over. */
  get overload() { return clamp01((this.load - this.capacity) / Math.max(4, this.capacity * 0.6)); }

  /**
   * Trim: -1 all the weight on the left, +1 all on the right. A crab walks
   * sideways on eight legs and does not care much, but it cares a little.
   */
  get trim() {
    let m = 0, sum = 0;
    for (const p of this.plots) { const w = this.massOf(p); m += w; sum += w * p.a; }
    return m > 0.5 ? clamp(sum / m, -1, 1) : 0;
  }

  get listed() { return Math.abs(this.trim) > 0.42; }

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
    if (!plot || plot.plant || plot.build || !def) return null;
    if (def.needsPond && !(plot.wet && this.pond > 0.35)) return null;
    if (plot.wet && !def.needsPond) return null;
    plot.plant = {
      id: floraId, def, stage: 0, growth: 0, health: 1, thirst: 0,
      age: 0, born: this.t, ripe: 0, variant: (plot.i * 7 + plotIndex) % 3,
    };
    return plot.plant;
  }

  // -- harvesting -----------------------------------------------------------

  /** Whether a plant's condition is being met right now. */
  needMet(def) {
    if (!def.needs) return true;
    const w = this.game.weather;
    const hour = w ? w.hour : 12;
    switch (def.needs) {
      case 'sun': return hour > 7 && hour < 17 && (w ? w.haze < 0.7 : true);
      case 'dusk': return (hour >= 17 && hour < 20) || (hour >= 5 && hour < 8);
      case 'night': return hour >= 20 || hour < 5;
      case 'pond': return this.pond > 0.30;
      case 'fleet': return (this.game.wildlife?.fleet.length || 0) > 0;
      case 'shade': return this.plots.some((p) => p.plant && p.plant.stage >= 3
        && (p.plant.def.arch === 'tree' || p.plant.def.h >= 40));
      default: return true;
    }
  }

  /** Why a plant is not ripening, in words. */
  blockedText(def) {
    return this.needMet(def) ? '' : (NEEDS_TEXT[def.needs] || '');
  }

  /** Everything ready to pick right now. */
  get ripeCount() {
    return this.plots.reduce((n, p) => n + (p.plant && p.plant.ripe >= 1 ? 1 : 0), 0);
  }

  /**
   * Pick one plant. Nothing on your back pays out on its own - you have to
   * notice it and take it, which is the whole loop.
   */
  harvest(plot) {
    const pl = plot && plot.plant;
    if (!pl || pl.stage < GROW_STAGES - 1) return { ok: false, msg: 'Not grown yet.' };
    if (pl.ripe < 1) {
      const why = this.blockedText(pl.def);
      return { ok: false, msg: why || 'Not ripe yet.' };
    }
    const mul = this.game.economy ? this.game.economy.stat('yield') : 1;
    const amount = Math.round(pl.def.pay * mul * (0.55 + pl.health * 0.45));
    const parasite = pl.def.parasite || 0;
    pl.ripe = 0;
    pl.picked = (pl.picked || 0) + 1;
    return {
      ok: true, amount, parasite,
      msg: parasite ? `+${parasite} parasite` : `+${amount} nutrients`,
    };
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

    // an overloaded shell grows everything slower, and a badly trimmed one
    // wears down whatever is stacked on the heavy side
    const over = this.overload;
    const trim = this.trim;
    this.list = damp(this.list, trim * 0.10 * (0.4 + Math.abs(trim)), 0.02, dt);

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
      const heavySide = Math.abs(trim) > 0.42 && Math.sign(plot.a) === Math.sign(trim);
      pl.health = clamp01(pl.health + (pl.thirst > 0.7 ? -dt * 0.09 : dt * 0.06)
        - (heavySide ? dt * 0.05 * (Math.abs(trim) - 0.42) * 3 : 0));

      if (pl.stage < GROW_STAGES - 1) {
        const rate = (1 - pl.thirst * 0.8) * (0.6 + this.pond * 0.7) * (pl.def.growBoost || 1)
          * (1 - over * 0.55);
        pl.growth += (dt / pl.def.grow) * Math.max(0.06, rate);
        if (pl.growth >= 1) {
          pl.growth = 0; pl.stage++;
          this.game.onPlantGrew?.(plot, pl);
        }
      } else {
        // A mature plant ripens rather than trickling: the nutrients only
        // arrive when you pick it, and only once its condition is met.
        cover += 1;
        if (pl.ripe < 1 && this.needMet(pl.def)) {
          const rate = (0.55 + pl.health * 0.45) * (0.8 + this.pond * 0.35) * (1 - over * 0.5);
          pl.ripe = clamp01(pl.ripe + (dt / pl.def.ripen) * rate);
          if (pl.ripe >= 1 && !pl.rang) { pl.rang = true; this.game.onRipe?.(plot, pl); }
        }
        if (pl.ripe < 1) pl.rang = false;
        if (Math.random() < dt * 0.10 && this.game.fx) {
          const w = this.plotWorld(plot);
          const col = MATERIALS[pl.def.mat]?.ramp[6] || '#b6de8f';
          this.game.fx.drift(w.x, w.y - 4, pl.def.fruitMat ? '#dc6379' : col, 1);
        }
      }
    }

    this.lushness = damp(this.lushness, clamp01(cover / Math.max(3, this.plots.length * 0.6)), 0.05, dt);

    // waterfall strands live while the basin is over the rim
    const spill = this.pond > 0.88;
    const crabRef = crab;
    if (spill && this.falls.length < 3 && Math.random() < dt * 6) {
      this.falls.push({ a: (Math.random() - 0.5) * 0.5, t: 0, life: 1.6 + Math.random() * 2.6, w: 1 + Math.random() * 1.4 });
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t += dt;
      if (f.t > f.life || (!spill && f.t > 0.6)) this.falls.splice(i, 1);
    }
    if (spill && crab && this.game.fx && Math.random() < dt * 22) {
      const lip = crab.shellWorldAB(0, crab.m.basin.b + crab.m.basin.r);
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
    return this.game.crab.shellWorldAB(plot.a, plot.b);
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

  /** Anything rooted beyond the crown, which the shell itself occludes. */
  drawFar(ctx, crab) { this._drawRow(ctx, crab, 0); }
  /** The basin, then everything on the near half of the dome. */
  drawNear(ctx, crab) {
    this._drawWater(ctx, crab);
    this._drawRow(ctx, crab, 1);
  }

  _drawRow(ctx, crab, row) {
    const wind = this.game.weather ? this.game.weather.windSpeed : 0.3;
    ctx.save();
    ctx.rotate(crab.bodyAngle + crab.roll);
    const list = this.plots
      .filter((p) => (p.plant || p.build) && (p.b < -0.05 ? 0 : 1) === row)
      .sort((x, y) => x.b - y.b);
    for (const plot of list) {
      const sp = crab.rig.shellSurface(plot.a, plot.b);
      // things further away are smaller and cooler, the same as any other depth
      const depth = (plot.b + 1) / 2;
      const scale = lerp(0.80, 1.06, depth);
      const sway = Math.sin(this.t * (1.3 + plot.i * 0.13) + plot.sway) * (0.03 + wind * 0.06)
        + Math.sin(this.t * 3.1 + plot.sway) * 0.010;
      const tilt = Math.atan2(sp.nx, -sp.ny) * 0.30;
      ctx.save();
      ctx.translate(sp.x, sp.y + 1);
      ctx.rotate(tilt + sway);
      if (plot.plant) {
        const pl = plot.plant;
        const wilt = 1 - pl.thirst * 0.22;
        const art = buildPlant(pl.def, pl.stage, pl.variant,
          this.plantScale(crab) * scale, plot.b < -0.05 ? 0.30 : 0);
        ctx.scale(wilt, wilt);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
        if (pl.thirst > 0.75 && Math.random() < 0.02) {
          const w = this.plotWorld(plot);
          this.game.fx?.drift(w.x, w.y - 3, '#8a7338', 1);
        }
      } else if (plot.build) {
        const art = buildStructure(plot.build.def,
          clamp(crab.m.rx / 52, 0.24, 1.1) * scale);
        ctx.drawImage(art.cv, -art.ox, -art.oy);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** The basin, the spring and the fall - all of the shell's water. */
  _drawWater(ctx, crab) {
    const m = crab.m;
    ctx.save();
    ctx.rotate(crab.bodyAngle + crab.roll);

    if (this.pond > 0.02) {
      // seen from above the pool is an ellipse that widens as it fills
      const c = crab.rig.shellSurface(m.basin.a, m.basin.b);
      const fill = Math.pow(clamp01(this.pond), 0.55);
      const rx = m.rx * m.basin.r * 0.98 * fill;
      const ry = rx * 0.42;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, 0, 0, TAU);
      const g = ctx.createLinearGradient(0, c.y - ry, 0, c.y + ry);
      g.addColorStop(0, '#1d6f86');
      g.addColorStop(0.45, '#2f9db4');
      g.addColorStop(1, '#8adcea');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.clip();
      // the far lip catches the sky, the near lip is bright
      ctx.fillStyle = 'rgba(200,238,246,0.30)';
      ctx.fillRect(c.x - rx, c.y + ry * 0.35, rx * 2, ry);
      for (let i = 0; i < 7; i++) {
        const ph = this.t * (0.5 + i * 0.12) + i * 1.7;
        const gx = c.x + Math.sin(ph) * rx * 0.66;
        const gy = c.y + ((i % 3) - 1) * ry * 0.42;
        ctx.globalAlpha = 0.55 - (i % 3) * 0.14;
        ctx.fillStyle = '#eafbfd';
        ctx.fillRect(Math.round(gx - rx * 0.16), Math.round(gy), Math.max(1, rx * 0.32), 1);
      }
      // the spring breaking the surface
      if (this.spring > 0.05) {
        const org = crab.rig.sockets.organ;
        ctx.strokeStyle = '#eafbfd';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const rr = ((this.t * 16 + i * 6) % 18) + 1;
          ctx.globalAlpha = clamp01(this.spring) * (1 - rr / 19) * 0.7;
          ctx.beginPath();
          ctx.ellipse(org.x, org.y, rr, rr * 0.42, 0, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // rim highlight so the pool sits in a bowl rather than on a plate
      ctx.strokeStyle = 'rgba(230,248,252,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, TAU);
      ctx.stroke();
    }

    // the spring itself: a plume out of the organ
    if (this.spring > 0.02) {
      const org = crab.rig.sockets.organ;
      const h = 4 + this.spring * 10;
      ctx.globalAlpha = clamp01(this.spring);
      ctx.fillStyle = '#c4ecf1';
      for (let i = 0; i < 5; i++) {
        const ph = this.t * 9 + i * 1.3;
        const w = 3 - i * 0.4;
        ctx.fillRect(Math.round(org.x - w / 2 + Math.sin(ph) * 1.2),
          Math.round(org.y - h * (i / 5)), Math.max(1, w), 2);
      }
      ctx.globalAlpha = 1;
    }

    // overflow: it comes over the near lip of the basin and down the shell
    for (const fl of this.falls) {
      const spill = crab.rig.shellSurface(fl.a, m.basin.b + m.basin.r * 0.92);
      const drop = crab.standH + m.faceH * 0.4;
      const age = clamp01(fl.t / 0.4);
      ctx.globalAlpha = 0.72 * age * clamp01((fl.life - fl.t) / 0.5);
      const g = ctx.createLinearGradient(0, spill.y, 0, spill.y + drop);
      g.addColorStop(0, '#c4ecf1');
      g.addColorStop(0.3, '#5fc6d8');
      g.addColorStop(1, 'rgba(120,214,228,0.16)');
      ctx.fillStyle = g;
      const wob = Math.sin(this.t * 4 + fl.a * 20) * 1.1;
      ctx.fillRect(Math.round(spill.x - fl.w / 2), Math.round(spill.y),
        Math.max(1, fl.w), Math.round(drop * age));
      ctx.fillRect(Math.round(spill.x - fl.w / 2 + wob), Math.round(spill.y + drop * 0.55 * age),
        Math.max(1, fl.w * 0.7), Math.round(drop * 0.45 * age));
      ctx.fillStyle = '#eafbfd';
      ctx.fillRect(Math.round(spill.x - fl.w / 2 - 1), Math.round(spill.y - 1),
        Math.max(1, fl.w) + 2, 2);
      ctx.globalAlpha = 1;
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
