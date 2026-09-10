// CRABDEN - the game object. Owns every system, the frame loop body, the
// render order, and all the little callbacks the systems fire back into.

import { TAU, clamp01, lerp, damp, dist } from './lib/math.js';
import { Audio } from './lib/audio.js';
import { drawText, textWidth } from './lib/font.js';
import { Input } from './core/input.js';
import { Camera } from './core/camera.js';
import * as Save from './core/save.js';

import { World } from './world/world.js';
import { Weather } from './world/weather.js';
import { Ecosystem } from './world/ecosystem.js';
import { REGION_BY_ID, PLANTS, ECO_TIERS } from './world/regions.js';
import { Renderer } from './render/renderer.js';
import {
  drawWetGround, drawPlant, drawPlantShadow, drawDecor, drawDecorShadow, drawPoi, drawPoiLabel,
} from './render/worldart.js';
import { drawCreatureShadow } from './render/creatureart.js';
import { panel, pxEllipse, pxLine, selectionRing } from './render/sprites.js';
import { Crab } from './entities/crab.js';
import { creatureFromSave } from './entities/creature.js';
import { Particles } from './entities/particles.js';
import { Pell } from './entities/npc.js';
import { SPECIES } from './entities/species.js';
import { Evolution, ABILITIES } from './systems/evolution.js';
import { Combat } from './systems/combat.js';
import { Spawner } from './systems/spawner.js';
import { Tutorial } from './systems/tutorial.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { Cutscene } from './ui/cutscene.js';
import { TouchControls } from './ui/touch.js';

import { getScene } from './cutscenes/script.js';
export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.time = 0;
    this.state = 'title';         // title | cutscene | play | panel | dead
    this.seed = 'crabden-1000';

    this.settings = Object.assign({
      muted: false, showWorkIcons: true, attackNeutrals: false,
    }, Save.readSettings() || {});

    this.audio = new Audio();
    if (this.settings.muted) this.audio.enabled = false;

    this.input = new Input(canvas);
    this.renderer = new Renderer(canvas);
    this.input.scale = this.renderer.scale;
    this.cam = new Camera();

    this.hud = new Hud(this);
    this.panels = new Panels(this);
    this.cutscene = new Cutscene(this);
    this.touch = new TouchControls(this);
    if (this.settings.touchControls !== undefined) this.touch.forced = this.settings.touchControls;

    this.newRun();

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.input.scale = this.renderer.scale;
    });
  }

  // -- lifecycle ------------------------------------------------------------

  newRun() {
    this.world = new World(this.seed);
    this.weather = new Weather(this.world, 7);
    this.eco = new Ecosystem(this.world, this);
    this.particles = new Particles();
    this.crab = new Crab(this);
    this.creatures = [];
    this.evo = new Evolution(this);
    this.combat = new Combat(this);
    this.spawner = new Spawner(this);
    this.tutorial = new Tutorial(this);
    this.pell = new Pell(this, 40, -10);

    this.res = { nutrients: 0, food: 0, silica: 0, calcium: 0, iron: 0, salt: 0, ash: 0 };
    this.discovered = new Set();
    this.visitedRegions = new Set(['dunes']);
    this.groveCenter = { x: 0, y: 0 };
    this.selected = null;
    this.uiHover = null;
    this.hoverTarget = null;
    this.hazardSlow = 1;
    this.hazardDrain = 1;
    this.bonusWaterMax = 0;
    this.burrowT = 0;
    this.deathT = 0;
    this.statsRun = { tamed: 0, killed: 0, planted: 0, waterMade: 0, oases: 0 };
    this.seedBag = {};

    this.crab.x = 0; this.crab.y = 0;
    this.crab._resetFeet();
    this.cam.followEntity(this.crab, true);
    this.cam.targetZoom = this.cam.zoom = 2;
    this.currentRegion = REGION_BY_ID.dunes;
    this.currentRegionId = 'dunes';
    this._bonusT = 0;
  }

  start() {
    this.audio.resume();
    this.audio.setMood('calm');
    this.state = 'play';
    const scene = getScene('intro', this);
    this.cutscene.play(scene, () => {
      this.tutorial.begin();
      this.pell.followCrab(true);
    });
  }

  restart() {
    Save.clearSave();
    this.newRun();
    this.start();
  }

  hasSave() { return Save.hasSave(); }

  save() {
    const data = {
      seed: this.seed,
      crab: this.crab.serialize(),
      weather: this.weather.serialize(),
      eco: this.eco.serialize(),
      evo: this.evo.serialize(),
      tutorial: this.tutorial.serialize(),
      res: this.res,
      discovered: [...this.discovered],
      visited: [...this.visitedRegions],
      grove: this.groveCenter,
      creatures: this.creatures.filter((c) => c.tamed && !c.dead).map((c) => c.serialize()),
      seedBag: this.seedBag,
      pois: this.world.pois.map((p) => [p.discovered ? 1 : 0, p.waterLeft, p.looted ? 1 : 0]),
      stats: this.statsRun,
      pell: { x: this.pell.x, y: this.pell.y },
    };
    if (Save.writeSave(data)) this.notify('Game saved.', 'good');
    else this.notify('Could not save (storage blocked).', 'bad');
    Save.writeSettings(this.settings);
  }

  load() {
    const d = Save.readSave();
    if (!d) { this.notify('No save found.', 'bad'); return false; }
    this.newRun();
    this.crab.deserialize(d.crab);
    this.weather.deserialize(d.weather);
    this.eco.deserialize(d.eco);
    this.evo.deserialize(d.evo);
    this.tutorial.deserialize(d.tutorial);
    Object.assign(this.res, d.res || {});
    this.discovered = new Set(d.discovered || []);
    this.visitedRegions = new Set(d.visited || ['dunes']);
    this.groveCenter = d.grove || { x: 0, y: 0 };
    this.statsRun = Object.assign(this.statsRun, d.stats || {});
    this.seedBag = d.seedBag || {};
    for (const cd of d.creatures || []) {
      try { this.creatures.push(creatureFromSave(this, cd)); } catch { /* unknown species */ }
    }
    (d.pois || []).forEach((row, i) => {
      const p = this.world.pois[i];
      if (!p) return;
      p.discovered = !!row[0];
      p.waterLeft = row[1];
      p.looted = !!row[2];
    });
    if (d.pell) { this.pell.x = d.pell.x; this.pell.y = d.pell.y; }
    this.pell.hidden = false;
    this.pell.followCrab(true);
    this.cam.followEntity(this.crab, true);
    this.state = 'play';
    this.crab.applyStats();
    this.notify('Loaded.', 'good');
    return true;
  }

  // -- helpers --------------------------------------------------------------

  notify(text, kind) { this.hud.notify(text, kind); }

  gain(resource, amount, x, y) {
    if (resource === 'water') { this.crab.addWater(amount); return; }
    if (!(resource in this.res)) this.res[resource] = 0;
    this.res[resource] += amount;
    if (x !== undefined && amount >= 1) {
      this.particles.text(`+${Math.round(amount)} ${resource}`, x, y, { color: '#e0c890' });
    }
  }

  spend(resource, amount) {
    if ((this.res[resource] || 0) < amount) return false;
    this.res[resource] -= amount;
    return true;
  }

  discoverSpecies(id) {
    if (this.discovered.has(id)) return;
    this.discovered.add(id);
    const sp = SPECIES[id];
    if (sp) {
      this.notify(`New species: ${sp.name}`, sp.role === 'rare' ? 'rare' : 'info');
      this.audio.play('discover');
    }
  }

  nextTierAt() {
    const cur = this.eco.tier.t;
    const next = ECO_TIERS.find((t) => t.t === cur + 1);
    return next ? next.at : null;
  }

  /**
   * Where an attack or a blast is pointed. With a mouse that is the cursor;
   * on touch there is no cursor, so aim at the nearest thing worth hitting and
   * fall back to straight ahead.
   */
  aimPoint() {
    if (!this.touch.active) return this.cam.screenToWorld(this.input.sx, this.input.sy);
    const crab = this.crab;
    let best = null, bd = 120;
    for (const c of this.creatures) {
      if (c.dead || !c.hostile) continue;
      const d = dist(crab.x, crab.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return { x: best.x, y: best.y };
    return { x: crab.x + Math.cos(crab.facing) * 34, y: crab.y + Math.sin(crab.facing) * 34 };
  }

  /** Where poured water lands. On touch you aim by walking. */
  pourPoint() {
    if (!this.touch.active) return this.cam.screenToWorld(this.input.sx, this.input.sy);
    const crab = this.crab;
    const reach = this.evo.stats.pourReach * 0.45;
    return { x: crab.x + Math.cos(crab.facing) * reach, y: crab.y + Math.sin(crab.facing) * reach };
  }

  abilityById(id) { return ABILITIES[id]; }

  /**
   * What the single context button on the touch pad should do right now.
   * Mirrors the T / R / H keys, chosen by what is actually in reach.
   */
  touchContext() {
    const crab = this.crab;
    const range = this.evo.stats.tameRange + 14;
    let best = null, bd = range;
    for (const c of this.creatures) {
      if (c.dead || c.tamed || !c.canTame()) continue;
      const d = dist(crab.x, crab.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) return { key: 't', label: 'TAME', tint: '#c58fd8', target: best };

    if (crab.water < crab.waterMax - 0.5) {
      const poi = this.world.nearestPoi(crab.x, crab.y, 140, (p) => p.waterLeft > 0);
      if (poi && dist(crab.x, crab.y, poi.x, poi.y) <= poi.radius + 24) {
        return { key: 'r', label: 'DRINK', tint: '#5fc8dc', target: poi };
      }
    }

    const ripe = this.eco.plantsNear(crab.x, crab.y, 34)
      .some((p) => !p.dead && p.type === 'berry' && (p.berries || 0) >= 1);
    if (ripe) return { key: 'h', label: 'PICK', tint: '#e2685c' };

    return null;
  }

  // -- update ---------------------------------------------------------------

  update(dt) {
    this.time += dt;
    const input = this.input;

    if (this.state === 'title') {
      this.touch.update(dt);
      this.weather.update(dt * 0.4, null);
      this.particles.update(dt, this.weather);
      this.renderer.update(dt, this.weather);
      // a tappable Continue, since a phone has no L key
      const cb = this._titleContinue;
      if (cb && input.clicked
        && input.sx >= cb.x && input.sx <= cb.x + cb.w
        && input.sy >= cb.y && input.sy <= cb.y + cb.h) {
        input.clicked = false;
        this.audio.resume();
        this.load();
      } else if (input.consumeClick() || input.justPressed(' ') || input.justPressed('Enter')) {
        this.start();
      }
      if (input.justPressed('l') && Save.hasSave()) { this.audio.resume(); this.load(); }
      return;
    }

    // Global hotkeys, only while no panel is open - an open panel owns these
    // keys itself. Whichever key wins is consumed, or the same press would be
    // read again further down the frame and undo itself.
    if (this.state !== 'cutscene' && !this.panels.open) {
      const PANEL_KEYS = { e: 'evo', c: 'pals', b: 'codex', m: 'map', Escape: 'menu' };
      const hot = ['e', 'c', 'b', 'm', 'Escape', 'p'].find((k) => input.justPressed(k));
      if (hot) {
        input.consumeKey(hot);
        if (hot === 'p') this.paused = !this.paused;
        else this.panels.toggle(PANEL_KEYS[hot]);
      }
    }

    this.panels.update(dt);
    this.hud.update(dt);
    this.touch.update(dt);
    this.cutscene.update(dt, this);
    this.evo.update(dt);
    this.combat.update(dt);

    const frozen = this.state === 'panel' || this.combat.hitStop > 0;
    const simDt = this.state === 'cutscene' ? dt * 0.35
      : this.state === 'dead' ? dt * 0.25
      : frozen ? 0 : dt;

    this._updateRegion();
    this._updateCamera(dt);

    if (this.state === 'play') this._handleInput(dt);

    if (simDt > 0) {
      this.weather.update(simDt, this);
      this.eco.update(simDt, this);
      this.crab.update(simDt, this);
      this.pell.update(simDt, this);
      for (const c of this.creatures) c.update(simDt, this);
      this.spawner.update(simDt);
      this._hazards(simDt);
      this._passive(simDt);
      this._discoverPois();
    }
    // cutscene beats still need the crab animated, just slowly
    if (this.state === 'cutscene') {
      this.crab.update(dt * 0.6, this);
      this.pell.update(dt * 0.6, this);
    }

    this.particles.update(dt, this.weather);
    this.tutorial.update(dt, this);
    this.renderer.update(dt, this.weather);
    this.audio.updateMusic(dt);
    this.audio.setWind(this.weather.windSpeed, this.weather.sand);

    this._bonusT -= dt;
    if (this._bonusT <= 0) { this._bonusT = 1; this._recomputeBonuses(); }

    if (this.state === 'dead') {
      if (this.cutscene.active) this.cutscene.finish();
      this.deathT += dt;
      if (this.deathT > 3 && (input.consumeClick() || input.justPressed(' '))) this._revive();
    }
    // NB: input.endFrame() is deliberately NOT called here. The panels do
    // their hit-testing while drawing, so a click has to survive the whole
    // frame - update and draw. main.js clears it once both are done.
  }

  _updateRegion() {
    const r = this.world.regionAt(this.crab.x, this.crab.y).region;
    if (r.id !== this.currentRegionId) {
      this.currentRegionId = r.id;
      this.currentRegion = r;
      if (!this.visitedRegions.has(r.id)) {
        this.visitedRegions.add(r.id);
        this.notify(`Entering ${r.name}`, 'rare');
        this.audio.play('discover');
        this.particles.text(r.name, this.crab.x, this.crab.y - 26, { color: '#ffe9a0', scale: 2, life: 2.6 });
      } else {
        this.notify(r.name, 'info');
      }
      this.audio.setMood(this.weather.isNight ? 'night' : r.ambience);
    }
  }

  _updateCamera(dt) {
    const i = this.input;
    if (this.state === 'panel') { this.cam.update(dt, this.world); return; }
    if (this.state !== 'cutscene') {
      if (i.midDown && i.moved) this.cam.pan(i.dragDX, i.dragDY);
      if (i.touchPan && !this.touch.stick.active) this.cam.pan(i.dragDX, i.dragDY);
      if (i.wheel) this.cam.zoomBy(i.wheel, i.sx, i.sy);
      if (i.key('z') || i.justPressed('z')) this.cam.followEntity(this.crab);
      // edge-key panning
      const spd = 220 * dt / this.cam.zoom;
      if (!this.crab.controlled) {
        if (i.key('ArrowLeft')) this.cam.nudge(-spd, 0);
        if (i.key('ArrowRight')) this.cam.nudge(spd, 0);
        if (i.key('ArrowUp')) this.cam.nudge(0, -spd);
        if (i.key('ArrowDown')) this.cam.nudge(0, spd);
      }
    }
    this.cam.setViewport(this.renderer.vw, this.renderer.vh);
    this.cam.update(dt, this.world);
    const w = this.cam.screenToWorld(i.sx, i.sy);
    i.wx = w.x; i.wy = w.y;
  }

  // -- gameplay input -------------------------------------------------------

  _handleInput(dt) {
    const i = this.input;
    const crab = this.crab;
    const pointer = this.cam.screenToWorld(i.sx, i.sy);

    if (this.touch.active) {
      // no cursor to hover with: describe what the context button would do
      const act = this.touchContext();
      this.uiHover = act
        ? { type: 'context', ref: act.target || null, prompt: `${act.label}: ${this._contextName(act)}` }
        : null;
      this.hoverTarget = act && act.target && act.target.sp ? act.target : this._nearestHostile();
    } else {
      this.uiHover = this._pick(pointer.x, pointer.y);
      this.hoverTarget = this.uiHover && (this.uiHover.type === 'creature') ? this.uiHover.ref : null;
    }

    // pumping the organ
    const organ = this.organScreenPos();
    const touchR = this.touch.active ? 10 : 0;
    const overOrgan = Math.hypot(i.sx - organ.x, i.sy - organ.y)
      < Math.max(5, crab.size * this.cam.zoom * 0.9) + touchR;
    if (overOrgan && !this.uiHover && !this.touch.active) {
      this.uiHover = { type: 'organ', prompt: 'hold to pump water' };
    }

    const organHeld = i.down && !i.touchPan && (overOrgan || this._pumpLatch);
    const pumping = organHeld || i.key('f');
    if (pumping) {
      if (i.down) this._pumpLatch = true;
      const made = crab.pump(dt);
      this.statsRun.waterMade += made;
      if (made > 0 && Math.random() < 0.25) this.audio.play('drip', { pitch: 1 + crab.water / crab.waterMax });
    } else {
      crab.pumping = false;
      this._pumpLatch = false;
    }

    // pouring
    const pourHeld = (i.rightDown && !this.selected) || i.key('q');
    if (pourHeld && !pumping) {
      crab.markPouring();
      const aim = this.pourPoint();
      const got = crab.pour(dt, aim.x, aim.y);
      if (got > 0 && Math.random() < 0.12) this.audio.play('water');
    }

    // abilities
    for (let k = 0; k < 4; k++) {
      if (i.justPressed(String(k + 1))) this.evo.useSlot(k);
    }
    if (i.justPressed(' ')) this.evo.useSlot(0);
    if (i.justPressed('Shift') && this.evo.stats.canDash) crab.dash();

    // taming / harvesting
    if (i.justPressed('t')) this._tryTame();
    if (i.justPressed('h')) this._tryHarvest();
    if (i.justPressed('r')) this._tryAbsorb();

    // clicks
    if (i.clicked) {
      i.clicked = false;
      this._onClick(pointer);
    }
    if (i.rightClicked) {
      i.rightClicked = false;
      if (this.selected && !this.selected.dead) {
        const h = this._pick(pointer.x, pointer.y);
        if (h && h.type === 'creature' && h.ref.hostile) {
          this.selected.orderTarget = h.ref;
          this.selected.orderPoint = null;
          this.notify(`${this.selected.sp.name} attacks!`, 'info');
        } else {
          this.selected.orderPoint = { x: pointer.x, y: pointer.y };
          this.selected.orderTarget = null;
        }
        this.particles.ring(pointer.x, pointer.y, { r0: 2, r1: 12, life: 0.35, color: '#ffb45a' });
        this.audio.play('ui');
      }
    }
  }

  _onClick(world) {
    const crab = this.crab;
    const z = this.cam.zoom;
    const organ = this.organScreenPos();
    const overOrgan = Math.hypot(this.input.sx - organ.x, this.input.sy - organ.y) < Math.max(5, crab.size * z * 0.9);
    if (overOrgan) return;      // handled by the hold logic

    const onCrab = dist(world.x, world.y, crab.x, crab.y) < crab.size * 2.2;
    if (onCrab) {
      crab.controlled = !crab.controlled;
      crab.moveTarget = null;
      this.cam.followEntity(crab);
      this.notify(crab.controlled ? 'Direct control. WASD to move, click to strike.' : 'Command mode. Click the ground to send the crab.', 'info');
      this.audio.play('uiBig');
      return;
    }

    const hit = this._pick(world.x, world.y);
    if (hit && hit.type === 'creature') {
      const c = hit.ref;
      if (c.tamed) {
        this.selected = this.selected === c ? null : c;
        this.audio.play('ui');
        return;
      }
      if (crab.controlled && c.hostile) { crab.swingClaw(c.x, c.y); return; }
      if (c.canTame() && dist(crab.x, crab.y, c.x, c.y) < this.evo.stats.tameRange + 12) { this._tame(c); return; }
    }
    if (hit && hit.type === 'plant' && hit.ref.type === 'berry') { this._tryHarvest(hit.ref); return; }
    if (hit && hit.type === 'poi') { this._tryAbsorb(hit.ref); return; }

    if (crab.controlled) {
      crab.swingClaw(world.x, world.y);
    } else {
      crab.commandMoveTo(world.x, world.y);
      this.selected = null;
      this.particles.ring(world.x, world.y, { r0: 2, r1: 10, life: 0.3, color: '#9fe4f4' });
    }
  }

  _contextName(act) {
    if (!act.target) return 'berries';
    if (act.target.sp) {
      const cost = Math.ceil(act.target.sp.tame.cost * this.evo.stats.tameCost);
      return `${act.target.sp.name} (${cost} ${act.target.sp.tame.item})`;
    }
    return act.target.name || 'water';
  }

  _nearestHostile() {
    let best = null, bd = 140;
    for (const c of this.creatures) {
      if (c.dead || !c.hostile) continue;
      const d = dist(this.crab.x, this.crab.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  _pick(x, y) {
    let best = null, bd = Infinity;
    for (const c of this.creatures) {
      if (c.dead) continue;
      const d = dist(x, y, c.x, c.y - c.z * 0.5);
      const r = Math.max(7, c.radius + 5);
      if (d < r && d < bd) { bd = d; best = { type: 'creature', ref: c }; }
    }
    if (best) {
      const c = best.ref;
      const near = dist(this.crab.x, this.crab.y, c.x, c.y) < this.evo.stats.tameRange + 12;
      if (c.tamed) best.prompt = `${c.name || c.sp.name} - click to select`;
      else if (c.hostile) best.prompt = `${c.sp.name} - hostile`;
      else if (c.canTame()) best.prompt = near
        ? `${c.sp.name} - T to offer ${Math.ceil(c.sp.tame.cost * this.evo.stats.tameCost)} ${c.sp.tame.item}`
        : `${c.sp.name} - get closer to befriend`;
      else best.prompt = c.sp.name;
      return best;
    }
    for (const p of this.eco.plantsNear(x, y, 14)) {
      const d = dist(x, y, p.x, p.y);
      if (d < Math.max(6, p.r) && d < bd) {
        bd = d;
        best = { type: 'plant', ref: p };
        const spec = PLANTS[p.type];
        best.prompt = p.dead ? `${spec.name} (dead)`
          : p.growth < 1 ? `${spec.name} - growing ${Math.floor(p.growth * 100)}%`
          : p.type === 'berry' && p.berries >= 1 ? `${spec.name} - H to harvest`
          : spec.name;
      }
    }
    if (best) return best;
    for (const poi of this.world.pois) {
      const d = dist(x, y, poi.x, poi.y);
      if (d < poi.radius && d < bd) {
        bd = d;
        best = { type: 'poi', ref: poi };
        best.prompt = poi.waterLeft > 0
          ? `${poi.name} - R to absorb water (${Math.round(poi.waterLeft)})`
          : poi.name;
      }
    }
    return best;
  }

  // -- verbs ----------------------------------------------------------------

  _tryTame(target) {
    const crab = this.crab;
    let c = target;
    if (!c) {
      let bd = this.evo.stats.tameRange + 14;
      for (const o of this.creatures) {
        if (o.dead || o.tamed || !o.canTame()) continue;
        const d = dist(crab.x, crab.y, o.x, o.y);
        if (d < bd) { bd = d; c = o; }
      }
    }
    if (!c) { this.notify('Nothing nearby to befriend.', 'bad'); this.audio.play('deny'); return; }
    this._tame(c);
  }

  _tame(c) {
    const pals = this.creatures.filter((x) => x.tamed && !x.dead).length;
    if (pals >= this.evo.stats.companionSlots) {
      this.notify('No room for another companion. (Nest Builder helps.)', 'bad');
      this.audio.play('deny');
      return;
    }
    const cost = Math.ceil(c.sp.tame.cost * this.evo.stats.tameCost);
    const item = c.sp.tame.item;
    const have = item === 'water' ? this.crab.water : (this.res.food || 0);
    if (have < cost) {
      this.notify(`Need ${cost} ${item}. You have ${Math.floor(have)}.`, 'bad');
      this.audio.play('deny');
      return;
    }
    if (item === 'water') this.crab.water -= cost; else this.res.food -= cost;
    c.tame();
    c.home = { x: this.groveCenter.x, y: this.groveCenter.y };
    this.statsRun.tamed++;
    this.audio.play('pickup');
    this.notify(`${c.sp.name} joined you.`, 'good');
    if (c.sp.unlock) this._unlockMechanic(c.sp.unlock, c);
  }

  _unlockMechanic(id, c) {
    const msgs = {
      cloudSeeding: 'The Mirage Jelly can call rain over your grove.',
      aquiferTap: 'The Nautilus can open a permanent water line.',
      roamingGrove: 'The Duneback will carry part of your grove with it.',
    };
    this.notify(msgs[id] || 'Something new is possible.', 'rare');
    this.audio.play('evolve');
    this.renderer.doFlash('#9fe8ff', 0.5);
  }

  _tryHarvest(target) {
    let got = 0;
    const list = target ? [target] : this.eco.plantsNear(this.crab.x, this.crab.y, 34);
    for (const p of list) {
      const r = this.eco.harvest(p);
      if (r && r.food) {
        got += r.food;
        this.particles.burst('chunk', p.x, p.y - p.r, 4, { color: '#b5354b', speedMin: 8, speedMax: 24, life: 0.5, grav: 80 });
      }
    }
    if (got > 0) {
      this.gain('food', got, this.crab.x, this.crab.y - 14);
      this.audio.play('pickup');
    } else {
      this.notify('No ripe berries in reach.', 'bad');
      this.audio.play('deny');
    }
  }

  _tryAbsorb(target) {
    const crab = this.crab;
    const poi = target || this.world.nearestPoi(crab.x, crab.y, 90, (p) => p.waterLeft > 0);
    if (!poi) { this.notify('No water source in reach.', 'bad'); this.audio.play('deny'); return; }
    if (dist(crab.x, crab.y, poi.x, poi.y) > poi.radius + 24) {
      this.notify('Too far. Get closer to the water.', 'bad');
      return;
    }
    const room = crab.waterMax - crab.water;
    if (room <= 0.5) { this.notify('You are completely full of water.', 'bad'); return; }
    const take = Math.min(room, poi.waterLeft, 40);
    poi.waterLeft -= take;
    crab.addWater(take);
    this.particles.burst('drop', poi.x, poi.y, 16, { color: '#9fe4f4', speedMin: 10, speedMax: 30, life: 0.7, grav: 30, glow: 4 });
    this.particles.text(`+${Math.round(take)} water`, crab.x, crab.y - 16, { color: '#9fe4f4' });
    this.audio.play('water');

    if (!poi.looted) {
      poi.looted = true;
      // surviving plants come home with you
      const region = this.world.regionAt(poi.x, poi.y).region;
      const native = region.plants.filter((p) => PLANTS[p].native);
      if (native.length) {
        const seed = native[Math.floor(Math.random() * native.length)];
        this.seedBag[seed] = (this.seedBag[seed] || 0) + 4;
        this.notify(`Collected ${PLANTS[seed].name} cuttings.`, 'good');
      }
      this.statsRun.oases++;
    }
  }

  startBurrow() {
    const crab = this.crab;
    this.burrowT = 3.2;
    crab.invuln = Math.max(crab.invuln, 3.2);
    crab.buried = 1;
    this.particles.burst('sand', crab.x, crab.y, 20, {
      color: this.currentRegion.pal.hi, speedMin: 20, speedMax: 60, life: 0.7, grav: 80, lift: 20,
    });
    this.audio.play('step', { pitch: 0.5 });
    for (const c of this.creatures) if (c.hostile) { c.target = null; c.state = 'wander'; }
    return true;
  }

  callRain() {
    this.weather.force('rain', 55);
    this.notify('The sky agrees.', 'rare');
    this.audio.play('discover');
    this.renderer.doFlash('#9fe8ff', 0.3);
    return true;
  }

  // -- passive ticks --------------------------------------------------------

  _hazards(dt) {
    const h = this.currentRegion.hazard;
    this.hazardSlow = 1;
    this.hazardDrain = 1;
    if (!h) return;
    if (h.id === 'glare' && this.evo.flag('glareProof')) return;
    if (h.id === 'rustspore' && this.evo.flag('rustProof')) return;
    // shade from your own plants protects you
    const shaded = this.eco.plantsNear(this.crab.x, this.crab.y, 40)
      .some((p) => !p.dead && p.growth > 0.7 && PLANTS[p.type].gives.shade);
    const mult = shaded ? 0.25 : 1;
    if (h.slow) this.hazardSlow = lerp(1, h.slow, mult);
    if (h.waterDrain) this.hazardDrain = 1 + h.waterDrain * mult;
    if (h.dps && this.state !== 'dead') {
      this.crab.hp = Math.max(0, this.crab.hp - h.dps * dt * mult);
      if (Math.random() < dt * 1.4 * mult) {
        this.particles.spawn('dust', this.crab.x + (Math.random() - 0.5) * 12, this.crab.y - 6, {
          color: h.id === 'ashfall' ? '#8e7d8f' : '#c47a44', life: 0.7, vz: 4, grav: 8, wind: 0.4,
        });
      }
      if (this.crab.hp <= 0) this.onCrabDown({ hazard: h });
    }
    if (this.burrowT > 0) {
      this.burrowT -= dt;
      this.crab.buried = clamp01(this.burrowT / 0.4);
      if (this.burrowT <= 0) this.crab.buried = 0;
    }
  }

  _passive(dt) {
    const s = this.evo.stats;
    if (s.passiveNutrients) this.gain('nutrients', s.passiveNutrients * dt);
    if (this.evo.flag('rootFeet')) {
      const wet = this.eco.moistureAt(this.crab.x, this.crab.y);
      const moss = this.eco.plantsNear(this.crab.x, this.crab.y, 16).some((p) => p.type === 'moss' && !p.dead);
      if (wet > 0.2 && moss && this.crab.hp < this.crab.hpMax) {
        this.crab.hp = Math.min(this.crab.hpMax, this.crab.hp + dt * 2.4);
        if (Math.random() < dt * 3) {
          this.particles.spawn('spark', this.crab.x + (Math.random() - 0.5) * 8, this.crab.y, {
            color: '#8fd47a', life: 0.6, vz: 10, grav: 4, glow: 3,
          });
        }
      }
    }
    // thorns
    if (s.thorns > 0) {
      for (const c of this.creatures) {
        if (!c.hostile || c.dead) continue;
        if (dist(c.x, c.y, this.crab.x, this.crab.y) < this.crab.size * 1.6 && c.attackCd > 1.0) {
          c.hurt(s.thorns * dt * 4, this.crab.x, this.crab.y, this.crab);
        }
      }
    }
    // grove drifts toward where you actually planted things
    if (this.eco.plants.length > 6) {
      let sx = 0, sy = 0, n = 0;
      for (const p of this.eco.plants) { if (p.dead) continue; sx += p.x; sy += p.y; n++; }
      if (n) {
        this.groveCenter.x = damp(this.groveCenter.x, sx / n, 0.5, dt);
        this.groveCenter.y = damp(this.groveCenter.y, sy / n, 0.5, dt);
      }
    }
    if (this.weather.rain > 0.4 && Math.random() < dt * 8) {
      const b = this.cam.bounds(40);
      this.particles.spawn('rain', lerp(b.x0, b.x1, Math.random()), lerp(b.y0, b.y1, Math.random()), {
        color: '#a8d8e8', life: 0.7, vz: -140, z: 60, grav: -220, layer: 'over',
      });
    }
    if (this.weather.sand > 0.3 && Math.random() < dt * 22) {
      const b = this.cam.bounds(40);
      this.particles.spawn('sand', lerp(b.x0, b.x1, Math.random()), lerp(b.y0, b.y1, Math.random()), {
        color: this.currentRegion.pal.crest, life: 1.2, wind: 3, size: 1, drag: 0.99,
      });
    }
  }

  _discoverPois() {
    for (const p of this.world.pois) {
      if (p.discovered) continue;
      const d = dist(p.x, p.y, this.crab.x, this.crab.y);
      const reveal = p.kind === 'seep' ? (this.evo.flag('senseWater') ? 200 : 40) : 210;
      if (d < reveal) {
        p.discovered = true;
        this.tutorial.lastPoi = p;
        this.notify(`Found: ${p.name}`, 'rare');
        this.audio.play('discover');
        this.particles.text(p.name, p.x, p.y - 24, { color: '#ffe9a0', scale: 1, life: 3 });
      }
    }
  }

  _recomputeBonuses() {
    const b = { growth: 1, spread: 1, waterUse: 1, dayGrowth: 1, compost: false };
    this.bonusWaterMax = 0;
    let nightLight = 0;
    for (const c of this.creatures) {
      if (!c.tamed || c.dead || !c.work) continue;
      switch (c.work) {
        case 'pollinate': b.growth += 0.35; break;
        case 'till': b.spread += 0.5; break;
        case 'refract': b.dayGrowth += 0.4; break;
        case 'purify': this.bonusWaterMax += 12; b.waterUse *= 0.9; break;
        case 'compost': b.compost = true; break;
        case 'nightsee': nightLight += 1; break;
        default: break;
      }
    }
    this.eco.bonuses = b;
    this.nightLight = nightLight;
  }

  /** One tick of a companion doing its job. Called by Creature. */
  doCreatureWork(c) {
    const grove = this.groveCenter;
    const rand = (a, b) => a + Math.random() * (b - a);
    switch (c.work) {
      case 'forage': {
        const pool = ['nutrients', 'food', 'nutrients', 'silica', 'iron', 'salt', 'calcium', 'ash'];
        const kind = pool[Math.floor(Math.random() * pool.length)];
        const amt = kind === 'nutrients' ? rand(2, 6) : 1;
        this.gain(kind, amt, c.x, c.y - 10);
        c.workTarget = { x: grove.x + rand(-80, 80), y: grove.y + rand(-80, 80) };
        this.particles.spawn('spark', c.x, c.y, { color: '#ffe9a0', life: 0.8, glow: 4, vz: 10, grav: 6 });
        break;
      }
      case 'seed': {
        const parents = this.eco.plants.filter((p) => !p.dead && p.growth > 0.8);
        if (!parents.length) break;
        const p = parents[Math.floor(Math.random() * parents.length)];
        const a = Math.random() * TAU, d = rand(16, 46);
        const nx = p.x + Math.cos(a) * d, ny = p.y + Math.sin(a) * d;
        if (this.eco.moistureAt(nx, ny) > 0.08 && this.eco.canPlant(p.type, nx, ny)) {
          this.eco.plant(p.type, nx, ny);
          this.particles.spawn('spark', nx, ny, { color: '#8fd47a', life: 0.8, glow: 3, vz: 8, grav: 5 });
        }
        c.workTarget = { x: nx, y: ny };
        break;
      }
      case 'digwater': {
        const a = Math.random() * TAU, d = rand(30, 120);
        const x = grove.x + Math.cos(a) * d, y = grove.y + Math.sin(a) * d;
        this.eco.addWater(x, y, 22, 26);
        this.particles.burst('drop', x, y, 8, { color: '#9fe4f4', speedMin: 6, speedMax: 22, life: 0.6, grav: 40, glow: 3 });
        c.workTarget = { x, y };
        if (Math.random() < 0.12) {
          const seep = this.world.nearestPoi(x, y, 900, (p) => p.kind === 'seep' && !p.discovered);
          if (seep) { seep.discovered = true; this.notify(`${c.sp.name} sniffed out ${seep.name}.`, 'good'); }
        }
        break;
      }
      case 'haul': {
        const src = this.world.nearestPoi(grove.x, grove.y, 1400, (p) => p.waterLeft > 4);
        if (src) {
          const take = Math.min(12, src.waterLeft);
          src.waterLeft -= take;
          this.eco.addWater(grove.x + rand(-40, 40), grove.y + rand(-40, 40), take * 3, 28);
          this.particles.text('+water', c.x, c.y - 10, { color: '#9fe4f4' });
        }
        break;
      }
      case 'scout': {
        const undisc = this.world.pois.filter((p) => !p.discovered);
        if (undisc.length) {
          undisc.sort((a, b2) => dist(a.x, a.y, c.x, c.y) - dist(b2.x, b2.y, c.x, c.y));
          const p = undisc[0];
          if (dist(p.x, p.y, grove.x, grove.y) < 1800) {
            p.discovered = true;
            this.notify(`${c.sp.name} spotted ${p.name}.`, 'good');
            this.audio.play('chirp');
          }
        }
        break;
      }
      case 'rain': {
        if (this.weather.kind !== 'rain' && Math.random() < 0.4) {
          this.weather.force('rain', 40);
          this.notify(`${c.sp.name} pulled a cloud over.`, 'rare');
        }
        break;
      }
      case 'aquifer': {
        this.crab.addWater(6);
        this.eco.addWater(grove.x, grove.y, 30, 40);
        this.particles.ring(grove.x, grove.y, { r0: 4, r1: 44, life: 0.6, color: '#7fe0d0' });
        break;
      }
      case 'guard': case 'nightsee': case 'pollinate': case 'till': case 'refract': case 'purify': case 'compost':
      default:
        c.workTarget = { x: grove.x + rand(-70, 70), y: grove.y + rand(-70, 70) };
        break;
    }
  }

  organScreenPos() {
    const crab = this.crab;
    const z = this.cam.zoom;
    const s = this.cam.worldToScreen(crab.x, crab.y);
    const R = crab.size * z;
    const rot = crab.bodyAngle + crab.tiltX;
    return {
      x: s.x - Math.cos(rot) * R * 0.42,
      y: s.y - crab.bodyZ * 0.55 * z - Math.sin(rot) * R * 0.42 - R * 0.28,
    };
  }

  // -- events ---------------------------------------------------------------

  onEvolve(node) {
    this.audio.play('evolve');
    this.renderer.doFlash('#ffe9a0', 0.45);
    this.cam.addShake(2);
    this.notify(`Evolved: ${node.name}`, 'rare');
    this.particles.burst('spark', this.crab.x, this.crab.y, 20, {
      color: node.color, speedMin: 8, speedMax: 40, life: 1.2, glow: 6, grav: -4,
    });
    this.crab.applyStats();
    if (node.add && node.add.legPairs) this.crab._buildLegs();
    // several moult nodes can be bought in one frame; only stage one scene
    if (node.moult && !this.cutscene.active && this.state === 'play') {
      const sc = getScene('moult', this);
      if (sc) this.cutscene.play(sc);
    }
  }

  onPlantMature(p) {
    const spec = PLANTS[p.type];
    if (this.cam.isVisible(p.x, p.y, 40)) {
      this.audio.play('grow');
      this.particles.burst('leaf', p.x, p.y - p.r, 6, {
        color: spec.colors[1], speedMin: 5, speedMax: 18, life: 1.1, grav: 10, wind: 1, spin: 4,
      });
    }
    this.statsRun.planted++;
  }

  onPlantDied(p) {
    if (this.cam.isVisible(p.x, p.y, 40)) {
      this.particles.burst('dust', p.x, p.y, 5, { color: '#9a8a5a', speedMin: 4, speedMax: 14, life: 0.9, wind: 1 });
    }
  }

  onEcoTierUp(t) {
    this.audio.play('discover');
    this.renderer.doFlash('#8fd47a', 0.4);
    this.notify(`Ecosystem: ${t.name}`, 'rare');
    this.particles.text(t.name, this.groveCenter.x, this.groveCenter.y - 30, { color: '#a8e090', scale: 2, life: 3 });
    this.particles.text(t.blurb, this.groveCenter.x, this.groveCenter.y - 16, { color: '#e8dcc4', scale: 1, life: 3.4 });
  }

  onCreatureDied(c, source) {
    if (c.hostile) {
      this.statsRun.killed++;
      this.gain('nutrients', 2 + c.sp.size * 0.35, c.x, c.y - 10);
    } else {
      this.gain('nutrients', 1, c.x, c.y - 10);
      if (c.tamed) this.notify(`${c.sp.name} died.`, 'bad');
    }
    if (c === this.selected) this.selected = null;
    this.audio.play('hit');
  }

  onCrabDown(source) {
    if (this.state === 'dead') return;
    // never leave a cutscene half-played holding onto input
    if (this.cutscene.active) this.cutscene.finish();
    if (this.panels.open) this.panels.close();
    this.state = 'dead';
    this.deathT = 0;
    this.crab.hp = 0;
    this.crab.invuln = 9999;
    this.crab.controlled = false;
    this.crab.moveTarget = null;
    this.selected = null;
    // everything that was chewing on you loses interest
    for (const c of this.creatures) {
      if (!c.hostile) continue;
      c.target = null;
      c.orderTarget = null;
      c.state = 'wander';
      c.stateT = 0;
    }
    this.audio.play('growl');
    this.renderer.doFlash('#802020', 0.7);
    this.cam.addShake(8);
    this.particles.burst('chunk', this.crab.x, this.crab.y, 20, {
      color: '#b8543a', speedMin: 20, speedMax: 60, life: 1.2, grav: 120, lift: 30,
    });
  }

  _revive() {
    this.state = 'play';
    this.crab.hp = this.crab.hpMax * 0.5;
    this.crab.water = Math.max(2, this.crab.water * 0.5);
    this.crab.invuln = 3;
    this.crab.buried = 0;
    this.burrowT = 0;
    this.crab.x = this.groveCenter.x;
    this.crab.y = this.groveCenter.y;
    this.crab._resetFeet();
    this.cam.followEntity(this.crab, true);
    // the desert takes a cut
    this.res.nutrients = Math.floor(this.res.nutrients * 0.75);
    this.notify('You woke up again. Something dragged you home.', 'info');
    for (const c of this.creatures) if (c.hostile) c.state = 'wander';
  }

  onRaidStart(n) {
    this.notify(`Something is coming for the grove. (${n})`, 'bad');
    this.audio.play('growl');
    this.audio.setMood('danger');
    this.renderer.doFlash('#601818', 0.35);
    this.cam.addShake(3);
  }

  onRaidCleared(dawn) {
    this.notify(dawn ? 'The sun came up. They scattered.' : 'The grove held.', 'good');
    this.audio.setMood(this.weather.isNight ? 'night' : this.currentRegion.ambience);
    this.gain('nutrients', 12, this.crab.x, this.crab.y - 16);
    this.audio.play('discover');
  }

  onDusk() {
    this.audio.setMood('night');
    this.audio.play('night');
    this.notify('Night.', 'info');
    if (Math.random() < 0.62) this.spawner.startRaid();
  }

  onDawn() {
    this.audio.setMood(this.currentRegion.ambience);
    this.audio.play('dawn');
    this.notify('Dawn.', 'good');
    this.crab.vigor = 1;
  }

  onNewDay(day) {
    this.notify(`Day ${day}.`, 'info');
    if (day % 2 === 0) this.save();
  }

  onWeather(kind) {
    const msg = {
      sandstorm: 'Sandstorm rolling in.',
      heatwave: 'The air is boiling.',
      rain: 'It is raining. Actual rain.',
      lightning: 'Dry lightning over the flats.',
      fogbank: 'Fog, thick as wool.',
    }[kind];
    if (msg) this.notify(msg, kind === 'rain' ? 'rare' : 'info');
  }

  onTutorialComplete() {
    this.notify('Dr. Pell has taught you everything he knows. Which was six things.', 'good');
    this.pell.chirp('You have got this. I will be over here, digging.', 5);
  }

  // -- render ---------------------------------------------------------------

  draw() {
    const r = this.renderer;
    const ctx = r.scene;
    const cam = this.cam;
    r.beginFrame(0);

    if (this.state === 'title') { this._drawTitle(ctx, r); return; }

    // 1. terrain
    this.world.draw(ctx, cam, this.weather.shadow);
    // 2. moisture + decals
    drawWetGround(ctx, cam, this);
    this.particles.drawDecals(ctx, cam);
    // 3. flat landmarks
    const bounds = cam.bounds(80);
    const visiblePois = this.world.pois.filter((p) =>
      p.x > bounds.x0 - 160 && p.x < bounds.x1 + 160 && p.y > bounds.y0 - 160 && p.y < bounds.y1 + 160);
    const FLAT = ['oasis', 'seep', 'crater', 'well'];
    for (const p of visiblePois) if (FLAT.includes(p.kind)) drawPoi(ctx, cam, this, p);

    // 4. build the sorted entity list
    const list = [];
    for (const d of this.world.decorNear(bounds)) list.push({ y: d.y, kind: 'decor', ref: d });
    for (const p of this.eco.plantsInBounds(bounds)) list.push({ y: p.y, kind: 'plant', ref: p });
    for (const c of this.creatures) {
      if (!cam.isVisible(c.x, c.y, 60)) continue;
      list.push({ y: c.y, kind: 'creature', ref: c });
    }
    for (const p of visiblePois) if (!FLAT.includes(p.kind)) list.push({ y: p.y, kind: 'poi', ref: p });
    list.push({ y: this.crab.y, kind: 'crab', ref: this.crab });
    if (!this.pell.hidden && cam.isVisible(this.pell.x, this.pell.y, 60)) {
      list.push({ y: this.pell.y, kind: 'pell', ref: this.pell });
    }
    list.sort((a, b) => a.y - b.y);

    // 5. shadows first, so nothing casts onto a sprite
    for (const e of list) {
      switch (e.kind) {
        case 'decor': drawDecorShadow(ctx, cam, this.weather, e.ref); break;
        case 'plant': drawPlantShadow(ctx, cam, this.weather, e.ref); break;
        case 'creature': drawCreatureShadow(ctx, cam, this.weather, e.ref); break;
        case 'crab': e.ref.drawShadow(ctx, cam, this.weather); break;
        case 'pell': e.ref.drawShadow(ctx, cam, this.weather); break;
        default: break;
      }
    }

    // 6. particles that belong under everything
    this.particles.draw(ctx, cam, 'under');

    // 7. entities
    for (const e of list) {
      switch (e.kind) {
        case 'decor': drawDecor(ctx, cam, this, e.ref); break;
        case 'plant': drawPlant(ctx, cam, this, e.ref); break;
        case 'creature': e.ref.draw(ctx, cam, this); break;
        case 'poi': drawPoi(ctx, cam, this, e.ref); break;
        case 'crab': e.ref.draw(ctx, cam, this); break;
        case 'pell': e.ref.draw(ctx, cam, this); break;
        default: break;
      }
    }

    // 8. selection + hover rings
    if (this.selected && !this.selected.dead) {
      const s = cam.worldToScreen(this.selected.x, this.selected.y);
      selectionRing(ctx, s.x, s.y, this.selected.radius * cam.zoom + 4, '#ffb45a', this.time * 2);
    }
    if (this.uiHover && this.uiHover.type === 'creature' && this.uiHover.ref !== this.selected) {
      const s = cam.worldToScreen(this.uiHover.ref.x, this.uiHover.ref.y);
      selectionRing(ctx, s.x, s.y, this.uiHover.ref.radius * cam.zoom + 4, 'rgba(255,233,160,0.6)', -this.time * 1.4);
    }
    if (this.crab.controlled) {
      const s = cam.worldToScreen(this.crab.x, this.crab.y);
      selectionRing(ctx, s.x, s.y, this.crab.size * cam.zoom * 2, 'rgba(159,228,244,0.5)', this.time);
    }

    // 9. overlay particles + text
    this.particles.draw(ctx, cam, 'over');
    for (const p of visiblePois) drawPoiLabel(ctx, cam, this, p);
    this.particles.drawTexts(ctx, cam);

    // 10. lights
    r.beginLights(this.weather);
    this.crab.drawLights(r, cam, this);
    for (const c of this.creatures) {
      if (cam.isVisible(c.x, c.y, 80)) c.drawLights(r, cam);
    }
    for (const p of visiblePois) {
      if (p.waterLeft > 0 && (p.kind === 'oasis' || p.kind === 'seep' || p.kind === 'well')) {
        const s = cam.worldToScreen(p.x, p.y);
        r.addLight(s.x, s.y, p.radius * cam.zoom * 0.8, '#6fd8ee', 0.28);
      }
    }
    if (this.nightLight && this.weather.isNight) {
      const s = cam.worldToScreen(this.groveCenter.x, this.groveCenter.y);
      r.addLight(s.x, s.y, 120 * cam.zoom, '#ffb45a', 0.35 * Math.min(2, this.nightLight));
    }
    this.particles.drawLights(r.light, cam);
    r.endLights();

    // 11. UI onto its own crisp layer, then one composite pass
    const ui = r.ui;
    this.hud.draw(ui, this);
    this.panels.draw(ui, this);
    this.cutscene.draw(ui, this);
    this.touch.draw(ui, this);
    if (this.state === 'dead') this._drawDeath(ui, r);
    r.composite(this.weather, this);
  }

  _drawDeath(ctx, r) {
    ctx.fillStyle = 'rgba(40,8,8,0.5)';
    ctx.fillRect(0, 0, r.vw, r.vh);
    drawText(ctx, 'YOU WERE EATEN', r.vw / 2, r.vh / 2 - 16, {
      color: '#ff8a7a', align: 'center', scale: 3, outline: true, outlineColor: '#1a0808',
    });
    drawText(ctx, 'a thousand years of sleep, ended by a scorpion', r.vw / 2, r.vh / 2 + 8, {
      color: '#e8c0b8', align: 'center', scale: 1,
    });
    if (this.deathT > 3 && Math.floor(this.time * 2) % 2 === 0) {
      drawText(ctx, 'click to wake up again', r.vw / 2, r.vh / 2 + 22, {
        color: '#ffe9a0', align: 'center', scale: 1,
      });
    }
  }

  _drawTitle(ctx, r) {
    const vw = r.vw, vh = r.vh;
    const t = this.time;
    // sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#2a1f38');
    g.addColorStop(0.45, '#8a4a44');
    g.addColorStop(0.62, '#e08a4a');
    g.addColorStop(1, '#e8c88d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // sun
    const sy = vh * 0.6;
    ctx.fillStyle = '#ffd68a';
    ctx.beginPath(); ctx.arc(vw * 0.5, sy, 26, 0, TAU); ctx.fill();
    // dune silhouettes
    for (let layer = 0; layer < 4; layer++) {
      const yBase = vh * (0.58 + layer * 0.11);
      const col = ['#a8683c', '#8a5230', '#6b3d24', '#4a281a'][layer];
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, vh);
      for (let x = 0; x <= vw; x += 4) {
        const yy = yBase + Math.sin(x * 0.013 + layer * 2.1 + t * 0.02 * (layer + 1)) * (8 + layer * 4)
          + Math.sin(x * 0.031 + layer) * 3;
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(vw, vh);
      ctx.closePath();
      ctx.fill();
    }
    // a little crab walking across the near dune
    const cx = ((t * 14) % (vw + 60)) - 30;
    const cy = vh * 0.9 + Math.sin(cx * 0.02) * 4;
    ctx.fillStyle = '#2a170f';
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const ph = t * 9 + i * 1.1;
      const lx = cx + side * (5 + Math.sin(ph) * 3);
      const ly = cy + 3 + Math.abs(Math.cos(ph)) * -2;
      pxLine(ctx, cx, cy, lx, ly, '#2a170f', 1);
    }
    pxEllipse(ctx, cx, cy, 6, 4, '#2a170f');
    pxEllipse(ctx, cx - 1, cy - 4, 2, 2, '#4fd0e0');
    // title text lives on the UI layer so the shimmer never touches it
    const ui = r.ui;
    const bob = Math.sin(t * 1.2) * 1.5;
    drawText(ui, 'CRABDEN', vw / 2, vh * 0.2 + bob, {
      color: '#ffe9c0', align: 'center', scale: 5, outline: true, outlineColor: '#3a1a10',
    });
    drawText(ui, 'wake up. make water. fix everything.', vw / 2, vh * 0.2 + 42 + bob, {
      color: '#ffd9a0', align: 'center', scale: 1, outline: true, outlineColor: '#3a1a10',
    });
    const touch = this.touch.active;
    if (Math.floor(t * 1.6) % 2 === 0) {
      drawText(ui, touch ? 'tap to begin' : 'click to begin', vw / 2, vh * 0.78, {
        color: '#fff4dc', align: 'center', scale: 2, outline: true, outlineColor: '#3a1a10',
      });
    }
    this._titleContinue = null;
    if (Save.hasSave()) {
      const info = Save.saveInfo();
      const label = `continue - day ${info?.day ?? 1}`;
      if (touch) {
        const bw = textWidth(label, 1) + 20;
        const bh = 18;
        const bx = Math.round(vw / 2 - bw / 2), by = Math.round(vh * 0.87);
        this._titleContinue = { x: bx, y: by, w: bw, h: bh };
        panel(ui, bx, by, bw, bh, 'rgba(28,18,12,0.85)', '#e0c088');
        drawText(ui, label, vw / 2, by + (bh - 7) / 2, { color: '#ffe9c0', align: 'center', scale: 1 });
      } else {
        drawText(ui, `press L to continue  (day ${info?.day ?? 1})`, vw / 2, vh * 0.88, {
          color: 'rgba(255,244,220,0.75)', align: 'center', scale: 1, outline: true, outlineColor: '#3a1a10',
        });
      }
    }
    if (touch && vw < vh) {
      drawText(ui, 'turn your phone sideways for more room', vw / 2, vh * 0.94, {
        color: 'rgba(255,240,214,0.6)', align: 'center', scale: 1, outline: true, outlineColor: '#3a1a10',
      });
    }
    drawText(ui, 'a game about a very old crab and a very dry planet', vw / 2, vh - 12, {
      color: 'rgba(255,240,214,0.55)', align: 'center', scale: 1,
    });

    r.hazeAmount = 0.9;
    r.composite(this.weather, this);
  }
}
