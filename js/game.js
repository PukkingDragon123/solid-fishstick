// CRABDEN - side-scrolling build. Owns the frame: update every system, then a
// strict back-to-front draw.

import { clamp, clamp01, lerp, damp, TAU } from './lib/math.js';
import { Audio } from './lib/audio.js';
import { drawText, drawTextBlock, textWidth, wrapText, LINE_H } from './lib/font.js';
import { Input } from './core/input.js';
import { Camera } from './core/camera.js';
import * as Save from './core/save.js';
import { Renderer } from './render/renderer.js';
import { Backdrop } from './render/backdrop.js';
import { Terrain } from './world/terrain.js';
import { Weather } from './world/weather.js';
import { biomeAt } from './world/biomes.js';
import { World } from './world/landmarks.js';
import { Crab } from './entities/crab.js';
import { Archaeologist, Elder, POSE } from './entities/npc.js';
import { frame, drawFrame } from './art/people.js';
import { Morse } from './systems/talk.js';
import { Green } from './systems/green.js';
import { Digs, RELIC_BY_ID } from './systems/digs.js';
import { Fx } from './systems/fx.js';
import { Garden } from './systems/garden.js';
import { Economy } from './systems/economy.js';
import { Wildlife } from './systems/wildlife.js';
import { Encounters } from './systems/encounters.js';
import { UI } from './ui/ui.js';
import { FLORA_BY_ID } from './data/flora.js';
import { buildPlant } from './art/floraart.js';
import { OBSERVE_STEPS } from './data/fauna.js';
import { VESS_LORE } from './data/lore.js';
import { BUILD_BY_ID, GENE_BY_ID } from './data/progress.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.state = 'intro';
    this.seed = 'crabden-oasis';

    this.settings = Object.assign({ muted: false, touchControls: undefined }, Save.readSettings() || {});
    this.audio = new Audio();
    if (this.settings.muted) this.audio.enabled = false;

    this.input = new Input(canvas);
    this.renderer = new Renderer(canvas);
    this.input.scale = this.renderer.scale;
    this.cam = new Camera();

    this.newRun();
    const saved = Save.readSave();
    if (saved) { this.load(saved); this.state = 'play'; }

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.input.scale = this.renderer.scale;
      this.cam.targetZoom = this.autoZoom();
    });
    this._autosave = 0;
  }

  newRun() {
    this.terrain = new Terrain(this.seed);
    this.weather = new Weather(11);
    this.backdrop = new Backdrop(this.seed);
    this.fx = new Fx(this);

    this.crab = new Crab(this, 'hatchling');
    this.crab.x = 0;
    this.crab.snapToGround();
    this.player = this.crab;

    this.garden = new Garden(this);
    this.economy = new Economy(this);
    this.wildlife = new Wildlife(this);
    this.encounters = new Encounters(this, this.seed);
    this.world = new World(this, this.seed);
    this.npc = new Archaeologist(this, 62);
    this.morse = new Morse(this);
    this.green = new Green(this);
    this.digs = new Digs(this, this.seed);
    this.ui = new UI(this);

    this.seeds = { dustmoss: 3, saltgrass: 2 };
    this.research = {};
    this.readInscriptions = 0;
    this.biome = biomeAt(0);
    this.cam.followEntity(this.crab, true);
    this.cam.minZoom = 0.85;
    this.cam.maxZoom = 3.4;
    this.cam.targetZoom = this.cam.zoom = this.autoZoom();

    this.cut = null;
    this.letterbox = 0;
    this.dialog = null;
    this.tutorial = 0;
    this.attackT = 0;
    this.startIntro();
  }

  /** Frame the crab sensibly whatever shape the window is. */
  autoZoom() { return clamp(this.renderer.vw / 300, 1.15, 2.3); }

  get currentBiome() { return this.biome; }

  /** Close enough to read over her shoulder, or she is riding you. */
  get vessClose() {
    return this.npc.riding || Math.abs(this.npc.x - this.crab.x) < 120;
  }
  get water() { return this.economy.water; }
  get nutrients() { return this.economy.nutrients; }
  get berries() { return this.economy.berries; }
  set berries(v) { this.economy.berries = v; }
  set water(v) { this.economy.water = v; }
  get genes() { return this.economy.genes; }

  // -- opening --------------------------------------------------------------

  startIntro() {
    this.state = 'intro';
    const c = this.crab;
    const npc = this.npc;
    npc.x = c.x + 190;
    npc.facing = -1;
    npc.faceT = -1;
    this.cam.snapTo(c.x + 30, c.y - 10);
    this.cam.targetZoom = this.cam.zoom = this.autoZoom() * 1.25;
    this.cut = {
      t: 0,
      steps: [
        { at: 0, run: () => { this.dialog = null; this.cam.cineTo(c.x, c.y - 4, 3.0, 2.2); } },
        { at: 0.6, run: () => this.say('narrator', 'A thousand years ago this was thirty metres under water.') },
        { at: 4.2, run: () => { this.cam.cineTo(c.x + 90, c.y - 16, 2.0, 2.0); npc.moveTo = c.x + 30; } },
        { at: 4.6, run: () => this.say('narrator', 'Nothing has moved here since. Nothing at all.') },
        { at: 8.0, run: () => { npc.setPose(POSE.WALK); this.say('Dr. Vess', 'Survey day four thousand and six. Basin nineteen. Still nothing.') } },
        { at: 12.0, run: () => { npc.moveTo = c.x + 24; npc.setPose(POSE.WRITE); this.say('Dr. Vess', 'Correction. One large rock. Sedimentary. Roughly hill-shaped.') } },
        { at: 16.0, run: () => { npc.setPose(POSE.IDLE); this.say('Dr. Vess', "Eleven years. Eleven. And the department wants 'findings'.") } },
        { at: 20.0, run: () => { npc.facing = 1; npc.setPose(POSE.SIT); this.say('Dr. Vess', 'Right. Nobody is watching. Nobody has been watching for a thousand years.') } },
        { at: 24.0, run: () => { this.cam.cineTo(c.x + 6, c.y - 22, 3.2, 1.4); this.say('narrator', '...') } },
        { at: 26.5, run: () => { this._pee = 1; this.say('narrator', 'A single drop of water lands on the rock.') } },
        { at: 29.5, run: () => { this._pee = 0; this.crab.blink = 0.4; this.cam.shake(3); this.say('narrator', 'The rock has been waiting a very long time for that.') } },
        { at: 32.0, run: () => { this.cam.shake(8); this.terrain.deform(c.x, 6, 40); this.fx.dust(c.x, c.y + 20, 6); this.audio.play('thunder'); } },
        { at: 33.4, run: () => { npc.facing = -1; npc.setPose(POSE.IDLE); this.say('Dr. Vess', 'That is not a rock.') } },
        { at: 36.0, run: () => { npc.moveTo = c.x + 74; this.say('Dr. Vess', 'That is not a rock, that is not a rock, that is NOT A ROCK -') } },
        { at: 39.5, run: () => { npc.setPose(POSE.TALK); npc.facing = -1; this.say('Dr. Vess', "...you're awake. Oh. Oh, that's what the water table was for.") } },
        { at: 43.0, run: () => { this.say('Dr. Vess', "There's a spring in your back. You made this whole basin, didn't you.") } },
        { at: 46.5, run: () => { this.say('Dr. Vess', "Then make it again. I'll help. I have eleven years of notes and nothing else.") } },
        { at: 50.0, run: () => this.endIntro() },
      ],
      i: 0,
    };
  }

  endIntro() {
    this.cut = null;
    this.dialog = null;
    this.state = 'play';
    this.cam.cineCancel();
    this.cam.followEntity(this.crab, false);
    this.cam.targetZoom = this.autoZoom();
    this.tutorial = 1;
    this.ui.say('Hold SPACE, or hold the valve, to run the spring in your back.', 6);
  }

  say(who, text) { this.dialog = { who, text, t: 0 }; }

  skipIntro() {
    this.endIntro();
    this.npc.x = this.crab.x + 130;
    this.npc.facing = -1;
    this.npc.faceT = -1;
  }

  // -- loop -----------------------------------------------------------------

  update(dt) {
    this.time += dt;
    const i = this.input;
    const slow = this.state === 'dead' ? 0.3 : 1;
    const sdt = dt * slow;

    this.ui.update(dt);
    if (this.state === 'intro') {
      this._runCut(dt);
      if (i.justPressed('Escape') || i.justPressed(' ') || (i.clicked && i.sy < this.renderer.vh - 40)) {
        i.consumeKey('Escape'); i.consumeKey(' ');
        this.skipIntro();
      }
    }

    const play = this.state === 'play';

    let move = 0;
    if (play && !this.ui.busy) {
      const ax = i.axis();
      move = ax.x;
      // while you are riding one of your own, the keys are its keys
      if (this.ui.driving) {
        const d = this.ui.driving;
        if (!d.alive) this.ui.release();
        else { d.driveX = move; move = 0; }
      }
      if (this.ui.mode === 'auto' && Math.abs(move) < 0.05) move = this._autoWalk(sdt);
      // the spring is held open, not tapped: the longer you hold it the harder
      // it runs, and it spills over the lip when the basin cannot take any more
      const wantPump = i.key(' ') || i.key('Space') || this.ui.valveHeld;
      this.pumpHold = wantPump ? Math.min(1, (this.pumpHold || 0) + dt * 2.6)
        : Math.max(0, (this.pumpHold || 0) - dt * 4);
      if (this.pumpHold > 0) this.pumpTick(sdt);
      if (i.justPressed('e')) this.act();
      if (i.justPressed('r')) this.harvestAll();
      if (i.justPressed('f')) this.callVess();
      if (i.justPressed('x')) this.infest();
      if (i.justPressed('k')) this.incubateBest();
      // T is the tap key: hold for a long tap, release for a short one
      this.morse.update(sdt, i.key('t'));
      if (i.justPressed('q')) this.attack();
    }
    this.crab.update(sdt, {
      move, sprint: i.key('Shift'), grab: i.key('e'),
      // an overloaded animal is a slower animal
      speedMul: (this.economy ? this.economy.stat('speed') : 1)
        * (1 - (this.garden ? this.garden.overload : 0) * 0.45),
      list: this.garden ? this.garden.list : 0,
    });

    if (i.wheel && !this.ui.busy) this.cam.zoomBy(i.wheel, i.sx, i.sy);
    if (i.dragging && !this.ui.busy && i.touchPan) this.cam.pan(i.dragDX, i.dragDY);

    this.biome = biomeAt(this.crab.x);
    this.weather.update(sdt, this);
    this.terrain.update(sdt, this.weather.windSpeed);
    this.green.update(sdt, this.weather);
    this.green.tick(sdt);
    this.digs.update(sdt);

    // garden drinks from the tank, and pays out nutrients and fruit
    const eco = this.economy;
    const up = 1 + eco.stat('upkeep');
    const g = this.garden.update(sdt, eco.water / Math.max(0.001, up), this.weather);
    eco.water = clamp(eco.water - g.drank * up, 0, eco.stat('waterMax'));
    this._berryT = (this._berryT || 0) + sdt * eco.stat('berryRate');
    if (this._berryT > 9) {
      this._berryT = 0;
      const fruiting = this.garden.planted.filter((p) => p.plant.stage >= 3 && p.plant.def.fruitMat);
      if (fruiting.length) {
        eco.berries += fruiting.length;
        const w = this.garden.plotWorld(fruiting[0]);
        this.fx.popup(w.x, w.y - 6, `+${fruiting.length} berries`, '#dc6379');
      }
    }
    // night air condenses on the shell
    const nw = eco.stat('nightWater');
    if (nw > 0 && this.weather.nightMix > 0.4) {
      eco.water = clamp(eco.water + nw * sdt, 0, eco.stat('waterMax'));
    }
    if (eco.stat('pondGain') > 0) this.garden.pond = clamp01(this.garden.pond + eco.stat('pondGain') * sdt * 0.1);

    this._geneT = (this._geneT || 0) + sdt;
    if (this._geneT > 1.2) { this._geneT = 0; eco.recomputeGenes(); eco.markDirty(); }

    this.wildlife.update(sdt);
    // the crab watches whatever is closest and most interesting
    const watcher = this.wildlife.nearest(this.crab.x, this.crab.y, 150,
      (q) => q.alive && (q.hostile || !q.tamed));
    if (watcher) this.crab.alertTo(watcher, (watcher.hostile ? 2.2 : 0.35) * sdt);
    else if (Math.abs(this.npc.x - this.crab.x) < 90) this.crab.alertTo(this.npc, 0.3 * sdt);
    this.encounters.update(sdt);
    this.world.update(sdt);
    this.npc.update(sdt);
    this.fx.update(sdt, this.weather);

    this.attackT = Math.max(0, this.attackT - dt);
    this.crab.iframe = Math.max(0, (this.crab.iframe || 0) - dt);
    const hpMax = 120 + this.economy.stat('hp');
    if (this.crab.hpMax !== hpMax) {
      const frac = this.crab.hp / this.crab.hpMax;
      this.crab.hpMax = hpMax;
      this.crab.hp = Math.min(hpMax, frac * hpMax);
    }
    if (this.state === 'play' && this.crab.hp < this.crab.hpMax) {
      this.crab.hp = Math.min(this.crab.hpMax, this.crab.hp + sdt * (0.8 + this.garden.lushness * 2.4));
    }
    if (this.dialog) this.dialog.t += dt;

    this.cam.setViewport(this.renderer.vw, this.renderer.vh);
    this.cam.update(dt);
    const w = this.cam.screenToWorld(i.sx, i.sy);
    i.wx = w.x; i.wy = w.y;
    this.renderer.update(dt, this.weather);
    this.audio.updateMusic(dt);

    this._autosave += dt;
    if (this._autosave > 20 && play) { this._autosave = 0; this.save(); }
  }

  _runCut(dt) {
    const c = this.cut;
    if (!c) return;
    c.t += dt;
    while (c.i < c.steps.length && c.t >= c.steps[c.i].at) {
      c.steps[c.i].run();
      c.i++;
    }
    if (this._pee) {
      const p = this.npc;
      if (Math.random() < 0.6) {
        this.fx._add({
          k: 'water', x: p.x - 6 * (p.facing || -1), y: p.y - 14,
          vx: -18 * (p.facing || -1) + (Math.random() - 0.5) * 6, vy: 26 + Math.random() * 20,
          life: 0.9, t: 0, r: 1, grav: 210, splash: true,
        });
      }
    }
    this.letterbox = damp(this.letterbox, 1, 0.002, dt);
  }

  // -- actions --------------------------------------------------------------

  /** ROAM mode: the crab walks itself toward the next unvisited thing. */
  _autoWalk(dt) {
    const cx = this.crab.x;
    if (!this._autoTarget || Math.abs(this._autoTarget - cx) < 26) {
      const dir = this._autoDir || 1;
      const ahead = this.encounters.near(cx + dir * 300, 320)
        .filter((p) => !this.encounters.isTaken(p) && Math.sign(p.x - cx) === dir);
      this._autoTarget = ahead.length ? ahead[0].x : cx + dir * 420;
      if (Math.random() < 0.06) this._autoDir = -dir;
      else this._autoDir = dir;
    }
    return clamp((this._autoTarget - cx) / 40, -1, 1);
  }

  /**
   * One frame of the spring running. Water goes into the tank and into the
   * basin; what neither can take goes over the side, which is the whole reason
   * the plants on the far rim get anything at all.
   */
  pumpTick(dt) {
    const e = this.economy;
    const push = this.pumpHold;
    this.crab.pumping = Math.max(this.crab.pumping, push * 0.9);
    this.crab.pumpT += dt * 9;

    const maxW = e.stat('waterMax');
    const rate = e.stat('pumpGain') * 2.4 * push;
    const before = e.water;
    e.water = clamp(e.water + rate * dt, 0, maxW);
    const took = e.water - before;
    this.garden.pumpInto(0.10 * push * dt);

    const o = this.crab.shellWorldAB(this.crab.m.organ.a, this.crab.m.organ.b);
    this.fx.spring(o.x, o.y, o.nx, o.ny, 0.35 + push * 0.9);
    this._pumpAcc = (this._pumpAcc || 0) + took;
    if (this._pumpAcc >= 5) {
      const n = Math.floor(this._pumpAcc);
      this._pumpAcc -= n;
      this.fx.popup(o.x, o.y - 8, `+${n}`, '#9de3ee');
    }
    // the overflow: the tank is full, so it goes over the rim and down the shell
    if (e.water >= maxW - 0.01 && push > 0.4) {
      this.garden.pond = clamp(this.garden.pond + 0.22 * dt, 0, 1);
      if (Math.random() < dt * 26) {
        const lip = this.crab.shellWorldAB((Math.random() - 0.5) * 1.1, 0.85);
        this.fx.splash(lip.x, lip.y, 2, 20);
        this.fx.mist(lip.x, lip.y - 3, 1, 7);
      }
    }
    this._pumpSfx = (this._pumpSfx || 0) - dt;
    if (this._pumpSfx <= 0) { this._pumpSfx = 0.42; this.audio.play('water'); }
    if (this.tutorial === 1 && e.water > 70) {
      this.tutorial = 2; this.ui.say('Click yourself, or press TAB, to climb onto your own back and plant something.', 7);
    }
  }

  /** Kept for the tutorial and for anything that wants a single tap. */
  pump() { this.pumpHold = 1; this.pumpTick(0.2); }

  /** What E does right now, and what the prompt says. */
  actionHint() {
    if (this.state !== 'play') return null;
    const c = this.crab;
    const foe = this.wildlife.nearest(c.x, c.y, 44, (q) => q.hostile);
    if (foe) return `Strike ${foe.def.name}`;
    const wildOne = this.wildlife.nearest(c.x, c.y, 40, (q) => !q.hostile && !q.tamed && q.trust > 0.45);
    if (wildOne) {
      const need = wildOne.def.tame;
      return `Offer to ${wildOne.def.name} (${need.berries} berries, ${need.water} water)`;
    }
    if (this.encounters.hint) return this.encounters.hint;
    if (Math.abs(this.npc.x - c.x) < 46) return 'Talk to Dr. Vess';
    return null;
  }

  /** Pick the ripest thing on your back, if anything is ready. */
  harvestAll() {
    const ready = this.garden.plots.filter((p) => p.plant && p.plant.ripe >= 1);
    if (!ready.length) {
      const soon = this.garden.plots
        .filter((p) => p.plant && p.plant.stage >= 3)
        .sort((a, b) => b.plant.ripe - a.plant.ripe)[0];
      if (!soon) this.ui.say('Nothing on your back is grown yet.');
      else {
        const why = this.garden.blockedText(soon.plant.def);
        this.ui.say(why ? `${soon.plant.def.name} ${why}.` : 'Nothing is ripe yet.');
      }
      return 0;
    }
    let total = 0;
    for (const plot of ready) total += this.harvestPlot(plot, true);
    this.ui.say(ready.length > 1
      ? `Picked ${ready.length}. +${total} nutrients.`
      : `+${total} nutrients.`, 3);
    return total;
  }

  /** Pick one bed. Returns what it paid. */
  harvestPlot(plot, quiet = false) {
    const res = this.garden.harvest(plot);
    if (!res.ok) { if (!quiet) this.ui.say(res.msg); return 0; }
    this.economy.nutrients += res.amount;
    if (res.parasite) {
      this.economy.parasites += res.parasite;
      if (!quiet) this.ui.say('A parasite. Put it on something and see through its eyes. (X)', 6);
    }
    const w = this.garden.plotWorld(plot);
    this.fx.popup(w.x, w.y - 8, res.parasite ? `+${res.parasite} parasite` : `+${res.amount}`,
      res.parasite ? '#d79ae8' : '#cfe89a');
    this.fx.spark(w.x, w.y - 3, res.parasite ? '#c98ade' : '#e2f0a8', 14, 44);
    this.audio.play('pickup', { pitch: 0.9 + Math.random() * 0.3 });
    this.cam.shake(1.2);
    if (!quiet) this.ui.say(res.msg, 2.4);
    return res.amount;
  }

  /** A plant coming ready is worth noticing without being nagged about. */
  onRipe(plot, pl) {
    const w = this.garden.plotWorld(plot);
    this.fx.spark(w.x, w.y - 4, '#ffe9a8', 8, 26);
    this.audio.play('chirp', { pitch: 1.25 });
  }

  /** Ask her to come along, get on, or get off. */
  callVess() {
    const npc = this.npc;
    const near = Math.abs(npc.x - this.crab.x) < 90;
    if (npc.riding) { npc.alight(); return; }
    if (!near) {
      npc.moveTo = this.crab.x + 34;
      npc.mode = 'follow';
      npc.keepAway = true;
      npc.say('Coming. Coming.', 3);
      return;
    }
    if (npc.mode === 'follow') { npc.board(); return; }
    npc.follow();
  }

  /**
   * Put a parasite on something. It is one of yours - it grew on your back and
   * it still remembers being part of you - so what it takes over, you steer.
   */
  infest() {
    const c = this.crab;
    if (this.economy.parasites <= 0) {
      this.ui.say('You have no parasites. Grow a mindcap and pick it.');
      return false;
    }
    const target = this.wildlife.nearest(c.x, c.y, 90, (q) => q.alive && !q.puppet && !q.tamed);
    if (!target) { this.ui.say('Nothing close enough to put it on.'); return false; }
    this.economy.parasites--;
    target.puppet = true;
    target.tamed = true;
    target.trust = 1;
    target.mood = 'follow';
    this.wildlife.fleet.push(target);
    this.fx.spark(target.x, target.y - 8, '#c98ade', 22, 60);
    this.fx.popup(target.x, target.y - 16, 'taken', '#d79ae8');
    this.audio.play('evolve');
    this.cam.shake(3);
    this.ui.say(`${target.def.name} is yours. Open FLEET and drive it.`, 5);
    this.npc.say('You just put one of your own children inside a lizard. '
      + 'I am writing that down and then I am going to think about it for a long time.', 7);
    this.economy.markDirty();
    return true;
  }

  /** Put the best thing in your pack into the water on your back. */
  incubateBest() {
    const have = Object.entries(this.relics || {}).filter(([, n]) => n > 0);
    if (!have.length) { this.ui.say('Nothing in your pack. Dig something up first.'); return; }
    if (this.garden.pond < 0.25) { this.ui.say('Your basin is dry. Nothing will develop in it.'); return; }
    const [id] = have.sort((a, b) =>
      (RELIC_BY_ID[b[0]]?.incubate || 0) - (RELIC_BY_ID[a[0]]?.incubate || 0))[0];
    const res = this.digs.incubate(id);
    if (!res.ok) { this.ui.say(res.msg); return; }
    this.relics[id]--;
    this.ui.say(res.msg, 5);
    this.audio.play('grow');
    this.npc.say('You are going to put a fossil in a puddle on your back and wait. '
      + 'And it is going to work, is it? It is, isn\'t it.', 6);
  }

  /** Something that has been extinct for a thousand years walks off your shell. */
  onHatched(relic) {
    const c = this.crab;
    const spot = c.shellWorldAB(0, 0.5);
    const made = this.wildlife.spawn(relic.hatch, c.x + 20);
    this.fx.spark(spot.x, spot.y, '#fae19f', 26, 64);
    this.cam.shake(4);
    this.audio.play('evolve');
    if (made) {
      made.tamed = true;
      made.trust = 1;
      made.hatched = true;
      this.wildlife.fleet.push(made);
      this.ui.say(`${made.def.name}. Out of the ${relic.kind}. It is alive.`, 7);
      this.npc.say('It hatched. A thousand years in a rock and it hatched. '
        + 'I am going to need a bigger notebook.', 8);
      this.economy.markDirty();
    }
  }

  act() {
    const c = this.crab;
    // something in the ground right under you comes first: it is the only
    // thing here you can lose by walking past
    const site = this.digs.reachable(c.x);
    if (site) {
      const res = this.digs.dig(site);
      if (!res.ok) { this.ui.say(res.msg); return; }
      this.relics = this.relics || {};
      this.relics[res.relic.id] = (this.relics[res.relic.id] || 0) + 1;
      this.terrain.deform(site.x, 5, 22);
      this.fx.dust(site.x, this.terrain.surfaceY(site.x), 3);
      this.fx.spark(site.x, this.terrain.surfaceY(site.x) - 6,
        res.relic.kind === 'amber' ? '#eec66c' : '#c6bea7', 16, 40);
      this.fx.popup(site.x, this.terrain.surfaceY(site.x) - 14, res.relic.name, '#dcd6c3');
      this.audio.play('discover');
      this.ui.say(`${res.relic.name}. Put it in your basin (K) and keep the water up.`, 6);
      this.npc.say(res.relic.desc, 7);
      return;
    }
    if (this.garden.ripeCount) { this.harvestAll(); return; }
    const foe = this.wildlife.nearest(c.x, c.y, 44, (q) => q.hostile);
    if (foe) { this.attack(); return; }
    const wildOne = this.wildlife.nearest(c.x, c.y, 40, (q) => !q.hostile && !q.tamed && q.trust > 0.45);
    if (wildOne) {
      const res = this.wildlife.tryTame(wildOne);
      this.ui.say(res.ok ? `${wildOne.def.name} joins you.` : `${wildOne.def.name} ${res.why}.`);
      return;
    }
    if (this.encounters.active) {
      const line = this.encounters.interact();
      if (line) this.ui.say(line, 5);
      return;
    }
    if (Math.abs(this.npc.x - c.x) < 46) this.talkToVess();
  }

  talkToVess() {
    const lines = this._vessLines();
    const l = lines[Math.floor(Math.random() * lines.length)];
    this.npc.say(l, 5);
    this.npc.facing = Math.sign(this.crab.x - this.npc.x) || 1;
  }

  _vessLines() {
    const e = this.economy;
    const out = [];
    if (this.garden.planted.length === 0) {
      out.push('Your back is bare rock. Put something in it. Anything. I have seeds.');
    }
    if (this.garden.pond > 0.8) out.push("You have a pond. On your back. I've written four pages about it.");
    if (e.genes.size >= 4) out.push('Genes expressing one after another. You are rewriting yourself in real time and I am taking notes.');
    if (this.wildlife.fleet.length) out.push("They follow you now. I don't think they know why either.");
    if (this.weather.nightMix > 0.5) out.push('Things come out at night that were not here in the day. Stay lit.');
    // the further you have travelled with her, the more she has worked out
    const found = this.world.found.size;
    for (const l of VESS_LORE) if (found >= l.need) out.push(l.line);
    return out.slice(-6);
  }

  attack() {
    if (this.attackT > 0) return;
    this.attackT = 0.55;
    const c = this.crab;
    c.clawOpen = 1;
    const reach = c.m.shellW * 0.7;
    const fx = c.x + (c.facing || 1) * reach * 0.6;
    let hit = 0;
    for (const q of this.wildlife.hostiles) {
      if (Math.abs(q.x - fx) < reach * 0.7 && Math.abs(q.y - c.y) < 60) {
        q.hurt(this.economy.stat('dmg'), c.x);
        hit++;
      }
    }
    if (hit) { this.cam.shake(3); this.audio.play('hit'); } else this.audio.play('claw');
    this.fx.dust(fx, c.y + c.standH * 0.6, 1);
  }

  tryPlant(id, plotIndex) {
    const def = FLORA_BY_ID[id];
    if (!def) return { ok: false, msg: 'No such seed.' };
    const plot = plotIndex !== undefined ? this.garden.plots[plotIndex] : this.garden.freeFor(def);
    if (!plot) return { ok: false, msg: def.needsPond ? 'No free pool bed.' : 'Nowhere left to put it.' };
    if (def.needsPond && this.garden.pond < 0.35) return { ok: false, msg: 'That one needs standing water.' };
    if (this.economy.water < def.cost) return { ok: false, msg: `Needs ${def.cost} water.` };
    if (!this.garden.plant(plot.i, id)) return { ok: false, msg: 'It will not take there.' };
    this.economy.water -= def.cost;
    this.economy.markDirty();
    // nothing forbids overloading yourself; you are just told what you did
    const g = this.garden;
    if (g.load > g.capacity) this.ui.say('You are carrying more than you can carry.', 4);
    else if (g.listed) this.ui.say(`Your shell is listing ${g.trim > 0 ? 'right' : 'left'}.`, 4);
    if (this.tutorial === 2) { this.tutorial = 3; this.ui.say('It grows while you walk. Keep the water up.', 5); }
    return { ok: true, msg: `${def.name} planted.` };
  }

  tryBuild(id, plotIndex) {
    const b = BUILD_BY_ID[id];
    if (!b) return { ok: false, msg: 'No such structure.' };
    const plot = plotIndex !== undefined ? this.garden.plots[plotIndex]
      : this.garden.plots.find((p) => !p.plant && !p.build && !p.wet);
    if (!plot) return { ok: false, msg: 'No free spot to build on.' };
    if (!this.economy.canBuild(id)) return { ok: false, msg: `Needs ${b.cost} water and ${b.nut} nutrients.` };
    if (!this.economy.build(plot.i, id)) return { ok: false, msg: 'It will not sit there.' };
    return { ok: true, msg: `${b.name} built into the shell.` };
  }

  /** Is this seed available yet, and if not, what would open it? */
  unlockOf(def) {
    const u = def.unlock;
    if (!u) return { ok: true, why: '' };
    const e = this.economy;
    const missing = [];
    if (u.genes) {
      const need = u.genes.filter((k) => !e.genes.has(k));
      if (need.length) missing.push('express ' + need.map((k) => GENE_BY_ID[k]?.name || k).join(' and '));
    }
    if (u.pond !== undefined && this.garden.pond < u.pond) missing.push('fill the shell pool');
    if (u.nutrients !== undefined && e.nutrients < u.nutrients) missing.push(`bank ${u.nutrients} nutrients`);
    if (u.seen !== undefined && this.wildlife.seen.size < u.seen) missing.push(`record ${u.seen} creatures`);
    return missing.length ? { ok: false, why: 'Unlocks when you ' + missing.join(', ') + '.' } : { ok: true, why: '' };
  }

  floraEffect(def) { return def.boonText || 'Fixes nutrients.'; }

  /** In plain words, what a creature is waiting for before it walks over. */
  attractNeeds(def) {
    if (!def.attract) return 'Comes on its own terms.';
    const e = this.economy;
    const parts = [];
    if (def.attract.genes) {
      const have = def.attract.genes.filter((k) => e.genes.has(k));
      parts.push(have.length
        ? `drawn by ${have.map((k) => GENE_BY_ID[k]?.name || k).join(', ')}`
        : `needs ${def.attract.genes.map((k) => GENE_BY_ID[k]?.name || k).join(' or ')}`);
    }
    if (def.attract.lush) {
      parts.push(this.garden.lushness >= def.attract.lush ? 'shell is lush enough'
        : `wants a greener shell`);
    }
    if (def.attract.pond) {
      parts.push(this.garden.pond >= def.attract.pond ? 'has its water' : 'wants standing water');
    }
    return parts.join(' - ');
  }

  growCrab(stage) {
    const keepX = this.crab.x;
    this.crab.setStage(stage);
    this.crab.x = keepX;
    this.crab.snapToGround();
    this.cam.shake(7);
    this.fx.dust(this.crab.x, this.crab.y, 6);
    this.fx.spark(this.crab.x, this.crab.y, '#b6de8f', 22, 70);
  }

  /** Water hitting the ground: it wets the sand, and it wakes the ground up. */
  wetSand(x, amount) {
    this.terrain.deform(x, -amount * 0.04, 9);
    this.green?.water(x, amount * 0.0026, 34);
  }

  /** Something came up out of the sand behind you. Worth noticing. */
  onGreened(x) {
    if (Math.abs(x - this.crab.x) > 400) return;
    this.fx.spark(x, this.terrain.surfaceY(x) - 3, '#8cc468', 7, 22);
    if (Math.random() < 0.25) {
      this.npc.say(['Something came up. In the open. Out of dead sand.',
        'That is a plant. Nobody planted that.',
        'The ground behind you is not the ground in front of you any more.',
      ][Math.floor(Math.random() * 3)], 5);
    }
  }

  /** A seed on your back has taken up enough water to start. */
  onGerminate(plot, pl) {
    const w = this.garden.plotWorld(plot);
    this.fx.spark(w.x, w.y - 2, '#b6de8f', 9, 26);
    this.audio.play('grow', { pitch: 1.2 });
  }

  attraction(def) { return this.wildlife.attraction(def) * this.economy.stat('attract'); }
  nearestHostile(x, r) { return this.wildlife.nearestHostile(x, r); }

  // -- hooks ----------------------------------------------------------------

  onCreatureAttack(c) {
    const crab = this.crab;
    if (this.state !== 'play') return;
    if (Math.abs(c.x - crab.x) > 24 + crab.m.shellW * 0.34) return;
    if ((crab.iframe || 0) > 0) return;
    crab.iframe = 0.55;
    const dmg = c.def.dmg * (1 - this.economy.stat('armour'));
    crab.hp = Math.max(0, crab.hp - dmg);
    this.cam.shake(4);
    this.audio.play('hurt');
    this.fx.blood(crab.x + (c.x - crab.x) * 0.4, crab.y, 5);
    if (crab.hp <= 0) this.onDown();
  }

  onDown() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.ui.say('You pull in and stop. The desert takes what it takes.', 8);
  }

  onCreatureDown(c) {
    if (!c.hostile) return;
    this.economy.berries += 1;
    this.economy.nutrients += 4;
    this.fx.popup(c.x, c.y - 8, '+4n', '#8cc468');
  }

  /** Watching something is how the field notes get written. */
  onObserved(c, dt) {
    const before = this.research[c.def.id] || 0;
    const after = before + dt;
    this.research[c.def.id] = after;
    for (const step of OBSERVE_STEPS) {
      if (before < step && after >= step) {
        const n = OBSERVE_STEPS.indexOf(step);
        this.ui.say(`Vess writes down a note on the ${c.def.name.toLowerCase()}.`, 3.2);
        this.npc.say(c.def.notes[n] || '...', 6);
        this.audio.play('discover');
      }
    }
  }

  onGene(g) { this.ui.say(`New gene expressed: ${g.name}.`, 5); this.economy.markDirty(); }
  onTamed(c) { this.economy.markDirty(); }
  onBoard() {}
  onSkill(s) { this.economy.markDirty(); }
  onEvolve(e) { this.ui.say(`${e.name}. Something in you unfolds.`, 6); this.economy.markDirty(); }
  onBuilt() { this.economy.markDirty(); }
  onPlantGrew(plot, pl) {
    if (pl.stage >= 3) {
      this.economy.recomputeGenes();
      const w = this.garden.plotWorld(plot);
      this.fx.spark(w.x, w.y - 4, '#b6de8f', 10, 30);
      this.ui.say(`${pl.def.name} is mature.`, 3.5);
    }
  }
  /**
   * Something died. It is not a failure state - it is what happens - and what
   * it leaves behind goes into the ground for whoever comes next.
   */
  onDied(c, cause) {
    const mine = this.wildlife.fleet.includes(c);
    if (mine) {
      const i = this.wildlife.fleet.indexOf(c);
      if (i >= 0) this.wildlife.fleet.splice(i, 1);
      if (this.ui.driving === c) this.ui.release();
      this.economy.markDirty();
    }
    this.fx.dust(c.x, c.y + 4, 1.2);
    if (cause === 'age') {
      this.fx.drift(c.x, c.y - 4, '#c6bea7', 3);
      if (mine) {
        this.ui.say(`${c.name} has died of old age.`, 4.5);
        this.npc.say(this._eulogy(c), 6);
      }
    } else if (mine) {
      this.ui.say(`${c.name} is dead.`, 4);
    }
    // a body in the sand is a fossil in a thousand years, and the ground it
    // lies in is richer tomorrow
    this.green?.water(c.x, 0.05, 26);
  }

  _eulogy(c) {
    const lines = [
      `${c.def.name} is down. Write the date. That one lived its whole life on your back, which is a sentence I never expected to put in a report.`,
      `It got old. Here. On you. In a place where nothing has got old for a thousand years.`,
      `${c.def.name}, deceased. Natural causes. Do you understand how extraordinary "natural causes" is out here?`,
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  /** One of yours has young, because you grew somewhere for them to have them. */
  onBred(c) {
    if (this.wildlife.fleet.length >= this.economy.stat('fleetSlots') + 2) return;
    const baby = this.wildlife.spawn(c.def.id, c.x + (Math.random() - 0.5) * 24);
    if (!baby) return;
    baby.tamed = true;
    baby.trust = 1;
    baby.age = 0;
    baby.born = true;
    this.wildlife.fleet.push(baby);
    this.fx.spark(c.x, c.y - 6, '#ffe9a8', 12, 30);
    this.ui.say(`${c.def.name} has bred on your shell.`, 4.5);
    this.economy.markDirty();
  }

  onFirstSighting(def) {
    if (!def.hostile) this.ui.say(`${def.name} - first sighting.`, 4);
  }
  onAmbush(def, n) {
    this.ui.say(n > 1 ? `${def.name}s! ${n} of them, out of the sand.` : `${def.name}! Out of the sand.`, 4);
    this.cam.shake(5);
  }
  /** Walking into a named place is the point of walking. */
  onLandmark(lm) {
    const kindLine = {
      oasis: 'Standing water. Actual, standing water.',
      ruin: 'Somebody built this, facing the water that used to be here.',
      bonefield: 'A herd died here on the way to somewhere better.',
      spire: 'The wind has been working on this for a very long time.',
      wreck: 'A hull. Kilometres from any sea, and the sea was yours.',
    }[lm.kind] || '';
    this.ui.say(`${lm.name} - ${kindLine}`, 6);
    this.npc.say(lm.kind === 'oasis'
      ? `Water. Mark it: ${lm.name}. That is eleven years of survey undone in an afternoon.`
      : `${lm.name}. I have this on the map as a dot and nothing else.`, 6);
    this.audio.play('discover');
    this.cam.shake(2);
    if (lm.kind === 'oasis') {
      const gain = Math.round(60 + lm.size * 0.6);
      this.economy.water = Math.min(this.economy.stat('waterMax'), this.economy.water + gain);
      this.garden.pumpInto(0.5);
      this.fx.popup(this.crab.x, this.crab.y - 30, `+${gain} water`, '#9de3ee');
      for (let i = 0; i < 14; i++) {
        this.fx.mist(lm.x + (Math.random() - 0.5) * lm.size, this.terrain.surfaceY(lm.x) - 6, 1, 20);
      }
    } else {
      const n = 10 + Math.round(lm.size * 0.25);
      this.economy.nutrients += n;
      this.fx.popup(this.crab.x, this.crab.y - 30, `+${n} nutrients`, '#8cc468');
    }
  }

  onNewDay() {}
  onDusk() { this.ui.say('The light is going.', 3); }
  onDawn() {}
  onWeather() {}

  // -- save -----------------------------------------------------------------

  save() {
    Save.writeSave({
      v: 1, x: this.crab.x, stage: this.crab.stage, hp: this.crab.hp,
      hour: this.weather.hour, day: this.weather.day,
      economy: this.economy.toJSON(), garden: this.garden.toJSON(),
      wildlife: this.wildlife.toJSON(), seeds: this.seeds,
      taken: [...this.encounters.taken], tutorial: this.tutorial,
      world: this.world.toJSON(),
      research: this.research, mode: this.ui.mode, insc: this.readInscriptions,
      morse: this.morse.toJSON(), green: this.green.toJSON(),
      digs: this.digs.toJSON(), relics: this.relics,
    });
  }

  load(d) {
    try {
      this.crab.setStage(d.stage || 'hatchling');
      this.crab.x = d.x || 0;
      this.crab.snapToGround();
      this.crab.hp = d.hp ?? this.crab.hpMax;
      this.weather.hour = d.hour ?? 11;
      this.weather.day = d.day ?? 0;
      this.economy.fromJSON(d.economy);
      this.garden.fromJSON(d.garden);
      this.wildlife.fromJSON(d.wildlife);
      this.seeds = d.seeds || this.seeds;
      this.encounters.taken = new Set(d.taken || []);
      this.world.fromJSON(d.world);
      this.tutorial = d.tutorial || 3;
      this.research = d.research || {};
      this.readInscriptions = d.insc || 0;
      this.morse.fromJSON(d.morse);
      this.green.fromJSON(d.green);
      this.digs.fromJSON(d.digs);
      this.relics = d.relics || {};
      if (d.mode) this.ui.mode = d.mode;
      this.economy.recomputeGenes();
      this.economy.markDirty();
      this.cam.followEntity(this.crab, true);
    } catch (err) { /* a corrupt save should not stop a new game */ }
  }

  reset() {
    Save.clearSave();
    this.newRun();
  }

  // -- draw -----------------------------------------------------------------

  draw() {
    const r = this.renderer;
    const ctx = r.scene;
    const cam = this.cam;
    r.beginFrame(0);

    this.backdrop.drawSky(ctx, cam, this.weather);
    this.backdrop.drawLayer(ctx, cam, this.weather, 'far', this.terrain);
    this.backdrop.drawLayer(ctx, cam, this.weather, 'mid', this.terrain);
    this.backdrop.drawLayer(ctx, cam, this.weather, 'near', this.terrain);
    this.world.drawProps(ctx, cam);
    this.terrain.draw(ctx, cam);
    this.world.drawWater(ctx, cam);
    this.terrain.drawSand(ctx, cam);
    this.green.drawGround(ctx, cam, this.terrain);
    this.world.drawScatter(ctx, cam, 'far');
    this.encounters.draw(ctx, cam);
    this.fx.draw(ctx, cam, 'far');

    // creatures behind the crab, then the crab, then whatever rides on it
    this.wildlife.draw(ctx, cam, 'ground');
    if (!this.npc.riding) this.npc.draw(ctx, cam);
    this.crab.draw(ctx, cam, this.garden);
    if (this.npc.riding) this.npc.draw(ctx, cam);
    this.ui.drawGhost(ctx, cam);
    this.wildlife.draw(ctx, cam, 'shell');
    if (this.state === 'play') this.ui.drawCrop(ctx, cam);
    this.fx.draw(ctx, cam, 'near');
    this.world.drawScatter(ctx, cam, 'near');
    this._drawGreenPlants(ctx, cam);
    this._drawDigs(ctx, cam);
    this.backdrop.drawForeground(ctx, cam, this.weather, this.terrain);

    // lights
    r.beginLights(this.weather);
    const lightPow = this.economy.stat('light');
    if (lightPow > 0) {
      const o = this.crab.shellWorldAB(0, 0.1);
      const s = cam.worldToScreen(o.x, o.y);
      r.addLight(s.x, s.y, 90 * cam.zoom * (0.6 + lightPow * 0.5), '#ffd98a', 0.8);
    }
    for (const c of this.wildlife.list) {
      if (!c.def.glow || !c.alive) continue;
      const s = cam.worldToScreen(c.x, c.y);
      r.addLight(s.x, s.y, 40 * cam.zoom, c.def.glow, 0.7);
    }
    if (this.garden.pond > 0.3) {
      const o = this.crab.shellWorldAB(this.crab.m.basin.a, this.crab.m.basin.b);
      const s = cam.worldToScreen(o.x, o.y);
      r.addLight(s.x, s.y, 34 * cam.zoom, '#9de3ee', 0.25 * this.garden.pond);
    }
    r.endLights();
    r.drawWeatherOverlay(this.weather, this);
    r.composite(this.weather, this);

    const ui = r.ui;
    if (this.state === 'intro') this._drawCutscene(ui, r);
    else this.ui.draw(ui, r);
    this.fx.drawText(ui, cam, (c, t, x, y, o) => drawText(c, t, x, y, o));
    if (this.state === 'dead') this._drawDead(ui, r);
    const inside = this.ui.tree.dive > 0.4;
    if (this.npc.speech && this.state === 'play' && !inside) this._drawSpeech(ui, cam, this.npc);
    if (this.state === 'play' && !inside) {
      const m = this.morse.render();
      if (m) {
        this._drawSpeech(ui, cam,
          { x: this.crab.x, y: this.crab.y - this.crab.m.rx * 0.9, speech: m }, true);
      }
    }
    r.dctx.drawImage(r.uiC, 0, 0, r.vw, r.vh, 0, 0, r.vw * r.scale, r.vh * r.scale);
  }

  /**
   * A speech bubble with a tail, so it belongs to whoever is talking. `code`
   * draws it as the taps you are making rather than as words.
   */
  /**
   * What is showing above the sand: a corner of shale, a bead of amber with
   * the sun behind it. Only the shallow ones show at all until you have a claw
   * that can find the rest.
   */
  _drawDigs(ctx, cam) {
    const power = this.economy.stat('fossil');
    for (const site of this.digs.near(this.crab.x, 520)) {
      if (site.deep > 0.55 && power < 2) continue;
      const y = this.terrain.surfaceY(site.x);
      const s = cam.worldToScreen(site.x, y);
      const z = cam.zoom;
      const amber = site.relic.kind === 'amber';
      const r = (2.2 + (1 - site.deep) * 1.6) * z;
      // the bit sticking out of the sand
      ctx.fillStyle = amber ? '#a5691a' : '#6f6758';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y - r * 0.3, r, r * 0.62, 0.3, Math.PI, TAU);
      ctx.fill();
      ctx.fillStyle = amber ? '#eec66c' : '#c6bea7';
      ctx.beginPath();
      ctx.ellipse(s.x - r * 0.2, s.y - r * 0.45, r * 0.55, r * 0.3, 0.3, Math.PI, TAU);
      ctx.fill();
      if (amber) {
        // amber catches the light, which is how you spot it from a way off
        const tw = 0.5 + 0.5 * Math.sin(this.time * 2.6 + site.ci);
        ctx.globalAlpha = 0.25 + tw * 0.45;
        const g = ctx.createRadialGradient(s.x, s.y - r * 0.5, 0, s.x, s.y - r * 0.5, r * 4);
        g.addColorStop(0, '#fae19f');
        g.addColorStop(1, 'rgba(238,198,108,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y - r * 0.5, r * 4, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (Math.abs(site.x - this.crab.x) < 40) {
        drawText(ctx, power ? 'E to dig' : 'you would need a digging claw',
          s.x, s.y - 16 * z, { color: '#dcd6c3', align: 'center' });
      }
    }
  }

  /** What the desert has put up on its own, where you watered it. */
  _drawGreenPlants(ctx, cam) {
    const b = cam.bounds(40);
    for (const [i, p] of this.green.plants) {
      const x = i * 24;
      if (x < b.x0 || x > b.x1) continue;
      const def = FLORA_BY_ID[p.id];
      if (!def) continue;
      const y = this.terrain.surfaceY(x);
      const s = cam.worldToScreen(x, y);
      const art = buildPlant(def, p.stage, p.variant, p.size);
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.scale(cam.zoom * (p.flip ? -1 : 1), cam.zoom);
      ctx.rotate(Math.sin(this.time * 1.1 + i) * 0.03 * (this.weather.windSpeed + 0.3));
      ctx.drawImage(art.cv, -art.ox, -art.oy);
      ctx.restore();
    }
  }

  _drawSpeech(ctx, cam, who, code = false) {
    const s = cam.worldToScreen(who.x, who.y - 40);
    // her face goes in the bubble: the sheet has eight close-ups and the whole
    // point of a close-up is that you can see what she thinks of you
    const port = !code && who.sheet && who.face !== undefined
      ? frame(who.sheet, 'face', who.face) : null;
    const pw = port ? Math.min(30, port.w) : 0;
    const lines = wrapText(who.speech, 132 - (port ? pw + 4 : 0));
    const w = Math.max(...lines.map((l) => textWidth(l))) + 12 + (port ? pw + 4 : 0);
    const h = Math.max(lines.length * LINE_H + 8, port ? pw + 6 : 0);
    const x = clamp(Math.round(s.x - w / 2), 3, this.renderer.vw - w - 3);
    const y = clamp(Math.round(s.y - h), 3, this.renderer.vh - h - 12);
    const tailX = clamp(Math.round(s.x), x + 6, x + w - 6);

    // the tail first, so the body's edge draws over where it joins
    ctx.fillStyle = code ? 'rgba(10,22,24,0.94)' : 'rgba(18,13,9,0.94)';
    ctx.beginPath();
    ctx.moveTo(tailX - 4, y + h - 1);
    ctx.lineTo(tailX + 4, y + h - 1);
    ctx.lineTo(tailX + (code ? 0 : 2), y + h + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = code ? 'rgba(159,232,212,0.55)' : 'rgba(226,200,150,0.45)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // a lighter inner line: a bubble with an edge reads as drawn, not as a box
    ctx.strokeStyle = code ? 'rgba(159,232,212,0.16)' : 'rgba(226,200,150,0.14)';
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);

    let tx = x + 6;
    if (port) {
      const scale = pw / port.w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 3, y + 3, pw, Math.min(pw, h - 6));
      ctx.clip();
      drawFrame(ctx, who.sheet, 'face', who.face, x + 3 + pw / 2, y + 3 + pw / 2, false, scale);
      ctx.restore();
      ctx.strokeStyle = 'rgba(226,200,150,0.25)';
      ctx.strokeRect(x + 2.5, y + 2.5, pw + 1, Math.min(pw, h - 6) + 1);
      tx = x + 6 + pw + 2;
    }
    lines.forEach((l, i) => drawText(ctx, l, tx, y + 5 + i * LINE_H,
      { color: code ? '#9fe8d4' : '#f2e4c2' }));
    if (code) {
      drawText(ctx, this.morse.learned ? 'she is listening' : 'tapping',
        x + w / 2, y - 9, { color: 'rgba(159,232,212,0.5)', align: 'center' });
    }
  }

  _drawCutscene(ctx, r) {
    const bar = Math.round(22 * this.letterbox);
    ctx.fillStyle = '#080604';
    ctx.fillRect(0, 0, r.vw, bar);
    ctx.fillRect(0, r.vh - bar, r.vw, bar);
    if (this.dialog) {
      const d = this.dialog;
      const nar = d.who === 'narrator';
      const lines = wrapText(d.text, r.vw - 60);
      const h = lines.length * LINE_H + (nar ? 4 : 14);
      const y = r.vh - bar - h - 8;
      const x = 26;
      if (!nar) {
        ctx.fillStyle = 'rgba(16,12,8,0.9)';
        ctx.fillRect(x - 6, y - 4, r.vw - 40, h + 8);
        ctx.strokeStyle = 'rgba(226,200,150,0.35)';
        ctx.strokeRect(x - 5.5, y - 3.5, r.vw - 41, h + 7);
        drawText(ctx, d.who, x, y, { color: '#e2b74a' });
      }
      const cps = 48;
      const shown = Math.floor(d.t * cps);
      let used = 0;
      lines.forEach((l, i) => {
        const room = Math.max(0, shown - used);
        used += l.length;
        drawText(ctx, l.slice(0, room), x, y + (nar ? 0 : 11) + i * LINE_H,
          { color: nar ? 'rgba(230,214,180,0.82)' : '#f2e4c2', outline: nar, outlineColor: 'rgba(0,0,0,0.6)' });
      });
    }
    drawText(ctx, 'space / tap to skip', r.vw - 4, r.vh - bar - 8,
      { color: 'rgba(230,214,180,0.4)', align: 'right' });
  }

  _drawDead(ctx, r) {
    ctx.fillStyle = 'rgba(10,6,4,0.6)';
    ctx.fillRect(0, 0, r.vw, r.vh);
    drawText(ctx, 'THE SAND TAKES WHAT IT TAKES', r.vw / 2, r.vh / 2 - 18,
      { color: '#f2e4c2', align: 'center', scale: 2 });
    const w = 110, x = (r.vw - w) / 2, y = r.vh / 2 + 8;
    const hot = this.input.sx >= x && this.input.sx <= x + w && this.input.sy >= y && this.input.sy <= y + 16;
    ctx.fillStyle = hot ? 'rgba(96,74,44,0.95)' : 'rgba(52,40,26,0.9)';
    ctx.fillRect(x, y, w, 16);
    ctx.strokeStyle = 'rgba(226,200,150,0.4)';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 15);
    drawText(ctx, 'PULL YOURSELF UP', x + w / 2, y + 5, { color: '#f2e4c2', align: 'center' });
    if (hot && this.input.clicked) {
      this.input.clicked = false;
      this.crab.hp = this.crab.hpMax * 0.6;
      this.crab.iframe = 2.5;
      this.state = 'play';
      for (const q of this.wildlife.hostiles) q.x += (q.x - this.crab.x > 0 ? 200 : -200);
    }
  }
}
