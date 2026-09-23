// CRABDEN - side-scrolling build. Owns the frame: update every system, then a
// strict back-to-front draw.

import { clamp, clamp01, lerp, damp, TAU, easeOutCubic, mulberry32, hashStr } from './lib/math.js';
import { pxGlow, pxDisc, pxEllipse, pxRing, pxArc, pxLine, pxSize } from './render/pix.js';
import { Audio } from './lib/audio.js';
import { drawText, drawTextBlock, textWidth, wrapText, LINE_H } from './lib/font.js';
import { Input } from './core/input.js';
import { Camera } from './core/camera.js';
import * as Save from './core/save.js';
import { Renderer } from './render/renderer.js';
import { Backdrop } from './render/backdrop.js';
import { drawPlate } from './ui/icons.js';
import { Terrain } from './world/terrain.js';
import { Ocean } from './world/ocean.js';
import { Fountains } from './systems/fountains.js';
import { formDepth } from './world/props.js';
import { Weather } from './world/weather.js';
import { biomeAt } from './world/biomes.js';
import { World } from './world/landmarks.js';
import { Crab } from './entities/crab.js';
import { Archaeologist, Elder, POSE } from './entities/npc.js';
import { TalkScreen, TALK_RANGE } from './ui/talkscreen.js';
import { Pump } from './systems/pump.js';
import { Sea } from './systems/sea.js';
import { Green } from './systems/green.js';
import { Digs, RELIC_BY_ID } from './systems/digs.js';
import { Mining } from './systems/mining.js';
import { Work } from './systems/work.js';
import { Craft } from './systems/craft.js';
import { Mind } from './systems/mind.js';
import { Combat } from './systems/combat.js';
import { Taming } from './systems/taming.js';
import { Hive } from './systems/hive.js';
import { Quests } from './systems/quests.js';
import { Critters } from './systems/critters.js';
import { Fishing } from './systems/fishing.js';
import { VentPuzzle } from './ui/ventpuzzle.js';
import { Ending } from './systems/ending.js';
import { Menu } from './ui/menu.js';
import { ITEM_BY_ID } from './data/craft.js';
import { Fx } from './systems/fx.js';
import { Garden } from './systems/garden.js';
import { Economy } from './systems/economy.js';
import { Wildlife } from './systems/wildlife.js';
import { Encounters } from './systems/encounters.js';
import { UI, MODES } from './ui/ui.js';
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
    // before the first frame, so the title screen it opens on is framed
    // against the real window rather than the camera's default guess
    this.cam.setViewport(this.renderer.vw, this.renderer.vh);
    // On a phone a good part of the screen is controls, so the animal is
    // lifted clear above them and the ground - not the sky - is what ends up
    // underneath the stick and the band. The interface says how much room it
    // is taking and the camera answers, which means starting a job lifts the
    // shot rather than burying the hole under the band.
    let bias = this.renderer.tall ? -0.10 : 0.16;
    if (this.ui?.touchEnabled) {
      const top = this.ui.furnitureTop(this.renderer.vw, this.renderer.vh);
      const want = clamp((top - 42) / this.renderer.vh, 0.3, 0.66) - 0.5;
      bias = Math.min(bias, want);
    }
    this.cam.yBias = bias;

    this.menu = new Menu(this);
    this.newRun();
    // The front door. Whatever is behind it, you arrive at the title first -
    // with the crab out of your own save standing in it, so the menu is a
    // picture of the game rather than a picture of a logo.
    const saved = Save.readSave();
    if (saved) { this.load(saved); this.state = 'play'; }
    this.enterMenu();

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.input.scale = this.renderer.scale;
      this.cam.setViewport(this.renderer.vw, this.renderer.vh);
    // On a phone a good part of the screen is controls, so the animal is
    // lifted clear above them and the ground - not the sky - is what ends up
    // underneath the stick and the band. The interface says how much room it
    // is taking and the camera answers, which means starting a job lifts the
    // shot rather than burying the hole under the band.
    let bias = this.renderer.tall ? -0.10 : 0.16;
    if (this.ui?.touchEnabled) {
      const top = this.ui.furnitureTop(this.renderer.vw, this.renderer.vh);
      const want = clamp((top - 42) / this.renderer.vh, 0.3, 0.66) - 0.5;
      bias = Math.min(bias, want);
    }
    this.cam.yBias = bias;
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
    this.talk = new TalkScreen(this);
    this.pump = new Pump(this);
    this.sea = new Sea(this);
    // and the one that never left, out past the salt pan
    this.shallows = new Ocean(this);
    // the capped springs, and whatever moved in on top of them
    this.fountains = new Fountains(this);
    // sand in the claw. The desert is a material, not a backdrop.
    this.sandHeld = 0;
    this.sandT = 0;
    this.green = new Green(this);
    this.digs = new Digs(this, this.seed);
    this.mining = new Mining(this, this.seed);
    this.work = new Work(this);
    this.craft = new Craft(this);
    this.mind = new Mind(this);
    this.combat = new Combat(this);
    this.taming = new Taming(this);
    this.hive = new Hive(this);
    this.quests = new Quests(this);
    this.critters = new Critters(this, this.seed);
    this.fishing = new Fishing(this);
    this.puzzle = new VentPuzzle(this);
    this.ending = new Ending(this);
    // What you have been given. You wake up able to walk and dig; everything
    // else arrives when the world first gives you a reason for it, and the
    // mode column in the corner grows as this set does.
    this.unlocked = new Set();
    this.unlockCard = null;      // { name, desc, got, tint, glyph, t }
    this.ui = new UI(this);

    this.seeds = { dustmoss: 3, saltgrass: 2 };
    // flora id -> how many wild specimens of it you have actually studied
    this.studied = { dustmoss: 9, saltgrass: 9 };
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
    // the cinematic layer: a black to fade through, a card to hold on it, and
    // a slow drift so a held shot is still moving
    this.fade = 0;
    this.fadeWant = 0;
    this.fadeRate = 2.2;
    this.card = null;
    this.drift = null;
    this.tutorial = 0;
    // the thousand years, as three numbers: how far the rock has come up out
    // of the basin, how hard the ground is moving while it does, and how much
    // has grown back on top of it afterwards
    this.uplift = 0;
    this.quake = 0;
    this.lifeK = 0;
    this._mesaList = null;
    // the montage left the camera off on its own somewhere; the wake-up is
    // about the animal again, so it comes back to it
    this.cam.free = false;
    this.cam.freeT = 0;
    this.cam.followEntity(this.crab, true);
    this.attackT = 0;
    this.lids = 0;
    this.startIntro();
  }

  /** Frame the crab sensibly whatever shape the window is. */
  /**
   * How close the camera sits. On a wide screen this is about the width of
   * the frame; on a phone held upright it cannot be, because a tall frame at
   * that zoom is nine tenths sky. So a tall aspect is framed off the shorter
   * side instead, and the animal stays the size it is meant to be.
   */
  /**
   * How close the camera sits, from the shape of the window. A wide screen is
   * framed off its width. A phone held upright gets pulled in a little and
   * the horizon pushed up, because the alternative is a strip of desert under
   * four hundred rows of sky.
   */
  autoZoom() {
    const r = this.renderer;
    if (r.tall) return clamp(Math.max(r.vw, r.vh * 0.46) / 300, 1.35, 2.6);
    return clamp(r.vw / 300, 1.15, 2.6);
  }

  get currentBiome() { return this.biome; }

  /** Close enough to read over his shoulder, or he is riding you. */
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

  /**
   * The opening. It is in two halves and they are a thousand years apart.
   *
   * The first half you play. You are a hand-sized crab on a reef, and the reef
   * is the desert: the same terrain, the same camera, the same everything,
   * with a sea put on top of it by `js/systems/sea.js`. You can walk around in
   * it, look at the coral, and choose where to lie down - and when you dig in,
   * the water starts leaving, and it takes a thousand years.
   *
   * The second half is this morning, and a man who has been wrong about a
   * rock for eleven years.
   */
  startIntro() {
    this.state = 'prologue';
    this.cut = null;
    this.dialog = null;
    this.letterbox = 0;
    this.buried = 0;
    this.crab.setStage('hatchling');
    this.crab.x = 0;
    this.crab.snapToGround();
    this.sea.start();
    this.weather.hour = 10;
    this.npc.hidden = true;
    this.npc.x = this.crab.x + 900;
    this.cam.followEntity(this.crab, true);
    this.cam.targetZoom = this.cam.zoom = clamp(this.autoZoom() * 1.25, this.cam.minZoom, this.cam.maxZoom);
    this.say('narrator', 'Thirty metres of water. Every one of them warm.');
    this._proT = 0;
    this._whaleShot = 0;
  }

  /**
   * While you are still choosing a spot.
   *
   * It is shot like a nature film, because that is what it is: long held
   * takes, a narrator who is interested rather than excited, and one moment
   * where the camera pulls back to put the animal in the frame next to
   * something that makes it look like nothing at all.
   */
  _runPrologue(dt) {
    this.sea.update(dt);
    this._proT = (this._proT || 0) + dt;
    const t = this._proT;
    const N = (line) => this.say('narrator', line);
    if (t > 6 && !this._pro1) { this._pro1 = 1; N('Everything here is alive. Most of it is smaller than your claw.'); }
    if (t > 13 && !this._pro2) {
      this._pro2 = 1;
      N('And some of it is not.');
      // the shot: pull out and up, and bring them across
      this._whaleShot = 1;
      const c = this.crab;
      for (const wh of this.sea.whales) {
        // near enough to cross the whole frame inside the shot, and high
        // enough that they are clearly above everything on the bottom
        wh.x = c.x - 620 - (wh.s < 0.8 ? 210 : 0);
        // a quarter of the way down from the surface: under the light, well
        // over the reef, and unmistakably in the water rather than on it
        const top = this.sea.level(c.x);
        const bed = this.terrain.surfaceY(c.x);
        wh.y = top + (bed - top) * (wh.s < 0.8 ? 0.34 : 0.26);
        wh.dir = 1;
        wh.sp = 62;
      }
      this.cam.cineTo(c.x + 60, c.y - 150, Math.max(this.cam.minZoom, this.autoZoom() * 0.46), 4.2);
    }
    if (t > 20 && !this._pro2b) {
      this._pro2b = 1;
      N('Two hundred tonnes of animal, and it has never once had to hide from anything.');
    }
    if (t > 28 && !this._pro2c) {
      this._pro2c = 1;
      this._whaleShot = 0;
      for (const wh of this.sea.whales) wh.sp = 26;
      this.cam.followEntity(this.crab);
      this.cam.targetZoom = clamp(this.autoZoom() * 1.25, this.cam.minZoom, this.cam.maxZoom);
      N('You will never see one again. Nothing here will.');
    }
    // the other thing that is bigger than you, and the only one that has
    // ever had a reason to look at you
    if (t > 31 && !this._pro2s) {
      this._pro2s = 1;
      const c = this.crab;
      const top = this.sea.level(c.x), bed = this.terrain.surfaceY(c.x);
      const sh = this.sea.sharks[0];
      if (sh) {
        sh.x = c.x - 260;
        sh.y = top + (bed - top) * 0.42;
        sh.dir = 1; sh.sp = 64; sh.turn = 14;
      }
      N('This one has been here longer than the reef has. It is not interested in you.');
    }
    if (t > 36 && !this._pro2d) { this._pro2d = 1; N('Your kind does this once. You pick a hollow, and you stay in it.'); }
    if (t > 44 && !this._pro3) { this._pro3 = 1; this.dialog = null; }
    if (this.dialog) this.dialog.t += dt;
    this.crab.pumping = 0;
    // bubbles come off you while you walk
    if (Math.abs(this.crab.vx) > 8 && Math.random() < dt * 6) {
      this.sea.puff(this.crab.x + (Math.random() - 0.5) * 14, this.crab.y - 4, 1);
    }
  }

  /**
   * Digging in. The whole animal goes down into the sand it will spend a
   * thousand years under, and the sea starts to leave while it does.
   */
  buryIn() {
    if (this.state !== 'prologue') return;
    this.state = 'burying';
    this.dialog = null;
    this.buryT = 0;
    this.cam.free = false;
    this.audio.play('splash');
    this.fx.digBurst(this.crab.x, this.crab.y + this.crab.m.rx * 0.3, 1.3, true);
    this.sea.puff(this.crab.x, this.crab.y, 26);
    this.say('narrator', 'It dug in. Slowly. With enormous certainty.');
  }

  _runBury(dt) {
    this._buryBars(dt);
    this.sea.update(dt);
    this.buryT += dt;
    const t = this.buryT;
    if (this.dialog) this.dialog.t += dt;

    // ---- act one: it goes down, and the camera goes down with it ----------
    this.buried = clamp01(t / 3.0);
    if (t < 3.0 && Math.random() < dt * 6) {
      this.fx.digBurst(this.crab.x + (Math.random() - 0.5) * 22,
        this.crab.y + this.crab.m.rx * 0.2, 0.4 + Math.random() * 0.4, true);
      this.sea.puff(this.crab.x + (Math.random() - 0.5) * 20, this.crab.y, 2);
    }
    const beat = (from, run) => {
      const k = `_b${Math.round(from * 10)}`;
      if (t > from && !this[k]) { this[k] = 1; run(); }
    };

    beat(0.1, () => {
      // in close on the animal while it works itself under
      this.shot(this.crab.x, this.crab.y + 4, this.autoZoom() * 2.0, 2.4, { z: -0.02 });
    });

    // ---- act two: the sea leaves, and we pull back to watch it go ---------
    beat(2.0, () => { this.sea.beginDrain(); });
    beat(3.2, () => {
      this.shot(this.crab.x + 30, this.terrain.surfaceY(this.crab.x) - 54,
        this.autoZoom() * 0.62, 4.5, { x: 5, z: -0.006 });
      this.say('narrator', 'And the sea, as it turned out, was in a hurry.');
    });
    beat(8.0, () => this.say('narrator', 'Coast. Lagoon. Salt pan. Dust.'));

    // ---- the cut. A thousand years does not get a dissolve. ---------------
    beat(11.4, () => { this.toBlack(1.5); this.dialog = null; });
    beat(12.8, () => {
      this.hold('ONE THOUSAND YEARS', 'and nothing at all happens');
      this.sleep = 0.001;
      this.cam.cineCancel();
      this.cam.snapTo(this.crab.x, this.terrain.surfaceY(this.crab.x) - 12);
      this.cam.targetZoom = this.cam.zoom = this.autoZoom() * 1.9;
    });
    beat(16.2, () => { this.card = null; this.fromBlack(0.9); });

    // ---- act three: four shots, cut together, none of them where you are --
    //
    // This used to be one held frame with the camera drifting over the mound
    // you are buried in, which is the same framing the game plays in - so it
    // read as the game paused rather than as a scene. It is staged now: four
    // set-ups at four places along the basin, hard cuts between them, and all
    // of them much wider than the game ever gets. You are not in most of it.
    // A thousand years is not about you.
    const GY = this.terrain.surfaceY(this.crab.x);
    const WIDE = Math.max(0.26, this.autoZoom() * 0.26);

    // SHOT A - dusk, the salt still drying, from west of where you went down
    beat(16.4, () => {
      this.card = null;
      this.weather.hour = 19.2;
      this.sleep = 0.4;
      this.uplift = 0; this.quake = 0; this.lifeK = 0;
      this._mesaList = null;
      this.cutTo(this.crab.x - 300, GY - 120, WIDE, { x: 3.0, z: 0.0006, in: 1.1 });
      this.say('narrator', 'It did not dream. There was nothing down there to dream about.');
    });

    // SHOT B - night, low and long, looking down the flat
    beat(20.8, () => {
      this.weather.hour = 2.6;
      this.sleep = 0.7;
      this.cutTo(this.crab.x + 260, GY - 60, WIDE * 1.15, { x: -2.4, z: 0.0005 });
      this.say('narrator', 'Sand went over it. Then more sand. Then the sand went hard.');
    });

    // SHOT C - somewhere else entirely, on bare ground, and the ground is
    // about to stop being bare. The foreshock first: one small knock and a
    // long silence, because that is what an earthquake actually does.
    beat(24.8, () => {
      this.weather.hour = 7.6;
      this.cutTo(this.crab.x + 620, GY - 150, WIDE * 0.92, { x: 0.6, z: -0.0004 });
      this.audio.play('hit', { pitch: 0.3 });
      this.cam.shake(3.2);
      this.say('narrator', 'Then something a long way underneath it let go.');
    });
    if (t > 24.8 && t < 26.4) {
      // the trickle between the foreshock and the main shock: nothing moves
      // except a little sand off the tops, which is the part that frightens
      if (Math.random() < dt * 5) {
        const wx = this.crab.x + 300 + Math.random() * 700;
        this.fx.drift(wx, this.terrain.surfaceY(wx) - 8, '#d8c49a', 1);
      }
    }

    // THE SHOCK. Six seconds: a build, a break, and a settle.
    beat(26.4, () => {
      this.audio.play('growl', { pitch: 0.28 });
      this.say('narrator', '');
    });
    if (t > 26.4 && t < 33.2) {
      const q = t - 26.4;
      // 0-1.2 build, 1.2-4.6 the break, 4.6-6.8 settling
      this.quake = q < 1.2 ? clamp01(q / 1.2) * 0.55
        : q < 4.6 ? 1
        : clamp01((6.8 - q) / 2.2);
      this.uplift = clamp01((q - 0.8) / 4.2);
      // the camera does not jitter, it LURCHES - a slow heavy sway with the
      // jitter on top of it, which is what standing on moving ground is like
      this.cam.shake(this.quake * 3.2);
      this.cam.tx += Math.sin(t * 5.3) * this.quake * 26 * dt;
      this.cam.ty += Math.sin(t * 3.1 + 1.2) * this.quake * 18 * dt;
      if (Math.random() < dt * 26 * this.quake) {
        const wx = this.crab.x + 100 + Math.random() * 1300;
        this.fx.dust(wx, this.terrain.surfaceY(wx), 1.4 + Math.random() * 1.8);
      }
      if (Math.random() < dt * 2.2 * this.quake) {
        this.audio.play('hit', { pitch: 0.26 + Math.random() * 0.2 });
      }
      if (q > 1.2 && q < 1.32) { this.cam.shake(9); this.audio.play('growl', { pitch: 0.2 }); }
    }

    // SHOT D - midday, from the other side, and the skyline is different
    beat(33.4, () => {
      this.uplift = 1;
      this.quake = 0;
      this.weather.hour = 12.4;
      this.cutTo(this.crab.x - 520, GY - 190, WIDE * 0.85, { x: 2.0, z: 0.0004 });
      this.say('narrator', 'Two hundred metres of seabed, standing up in the sun.');
    });

    // SHOT E - the part that takes the longest and shows the least
    beat(37.8, () => {
      this.weather.hour = 17.4;
      this.sleep = 1;
      this.cutTo(this.crab.x + 120, GY - 130, WIDE * 1.05, { x: -1.6, z: 0.0005 });
      this.say('narrator', 'Nothing lived here for four hundred years. And then a little did.');
    });
    if (t > 37.8) this.lifeK = clamp01((t - 37.8) / 4.2);
    beat(42.4, () => {
      this.say('narrator', 'A thousand years is not a long time to something that was not counting.');
    });

    beat(46.2, () => { this.toBlack(1.4); this.dialog = null; });
    if (t > 48.0) { this.dialog = null; this.sleep = 0; this.startWake(); }
  }

  /**
   * The rock that was not there before.
   *
   * The basin does not simply dry out - it comes up. Over the thousand years
   * the whole floor of the sea is pushed out of the water and the hard beds
   * under it stand up out of the salt as mesas, which is why this desert is
   * full of flat-topped rock with sea shells in the top of it.
   *
   * It is one held wide shot with the ground moving in it. Seven of them come
   * up on a stagger, so the skyline arrives in pieces rather than rising like
   * a lift, and while they are moving the camera cannot hold still.
   */
  _mesas() {
    if (this._mesaList) return this._mesaList;
    const r = mulberry32(hashStr(`uplift:${this.seedKey || this.seed}`));
    const cx = this.crab.x;
    const out = [];
    for (let i = 0; i < 7; i++) {
      out.push({
        x: cx - 980 + i * 320 + (r() - 0.5) * 140,
        w: 58 + r() * 90,
        h: 48 + r() * 84,
        t: i * 0.085 + r() * 0.09,        // when in the rise it starts
        tone: r(),
        seed: Math.floor(r() * 9999),
      });
    }
    // one of them is much bigger than the rest, because a skyline of equals
    // is a fence and a skyline with a landmark in it is a place
    out[3].w = 150; out[3].h = 168; out[3].t = 0.02;
    this._mesaList = out;
    return out;
  }

  _drawUplift(ctx, cam) {
    const K = clamp01(this.uplift || 0);
    if (K <= 0.001) return;
    const z = cam.zoom;
    const px = Math.max(1, Math.round(z));
    const vh = cam.vh;
    for (const m of this._mesas()) {
      const k = easeOutCubic(clamp01((K - m.t) / Math.max(0.08, 1 - m.t)));
      if (k <= 0.001) continue;
      const gy = this.terrain.surfaceY(m.x);
      const H = m.h * k;
      const hw = m.w / 2;
      // Columns are stepped in SCREEN pixels, not world ones. Stepping in
      // world units and filling one screen pixel each leaves a comb of gaps
      // at any zoom under 1, which is exactly the zoom this shot is at.
      const sL = cam.worldToScreen(m.x - hw, gy).x;
      const sR = cam.worldToScreen(m.x + hw, gy).x;
      if (sR < -20 || sL > cam.vw + 20) continue;
      const sBot = cam.worldToScreen(m.x, gy + 10).y;
      const x0 = Math.floor(Math.max(sL, -px) / px) * px;
      const x1 = Math.min(sR, cam.vw + px);
      for (let sx = x0; sx <= x1; sx += px) {
        const u = clamp(((sx - sL) / Math.max(1, sR - sL)) * 2 - 1, -1, 1);
        const a = Math.abs(u);
        // a flat top, shoulders that fall away in two steps, and the odd
        // notch out of the rim - a mesa is a broken thing, not a box
        const shoulder = a > 0.82 ? (1 - a) / 0.18 : 1;
        const step = a > 0.62 && a <= 0.82 ? 0.88 : 1;
        const notch = Math.sin(u * 9 + m.seed) > 0.86 ? 0.9 : 1;
        const topW = gy - H * Math.max(0, shoulder) * step * notch;
        const sTop = Math.round(cam.worldToScreen(m.x, topW).y / px) * px;
        if (sTop >= sBot) continue;
        const edge = a > 0.9 ? -0.18 : a > 0.78 ? -0.09 : 0;
        // and the weathering runs the other way: rain has cut gullies down
        // the face, so the beds are crossed by verticals rather than being
        // clean stripes on a cake
        const flute = Math.sin(u * 23 + m.seed * 0.7) * 0.05
          + (Math.sin(u * 41 + m.seed) > 0.88 ? -0.13 : 0);
        // strata: the rock is in beds, and the beds are what you read it by
        for (let y = sTop; y < sBot; y += px) {
          const world = cam.ry + (y - vh / 2) / z;
          const band = Math.floor((gy - world) / 11);
          const lit = band % 3 === 0 ? 0.14 : band % 3 === 1 ? 0 : -0.10;
          const v = clamp01(0.42 + m.tone * 0.14 + lit + edge + flute);
          ctx.fillStyle = `rgb(${Math.round(96 + v * 120)},${Math.round(62 + v * 78)},${Math.round(56 + v * 62)})`;
          ctx.fillRect(sx, y, px, px);
        }
        // the lip catches the light
        ctx.fillStyle = 'rgba(238,206,168,0.45)';
        ctx.fillRect(sx, sTop, px, px);
      }
      // while it is moving it throws everything it is pushing through
      if (this.quake > 0.05 && Math.random() < this.quake * 0.5) {
        this.fx?.dust(m.x + (Math.random() - 0.5) * m.w, gy + 2, 1.4 + Math.random());
      }
    }
  }

  /**
   * What came back. Not a forest - a few tufts, a few stems, and a line of
   * birds going somewhere, because the point of the shot is that this took a
   * thousand years and is still almost nothing.
   */
  _drawNewLife(ctx, cam) {
    const k = clamp01(this.lifeK || 0);
    if (k <= 0.001) return;
    const z = cam.zoom;
    const px = Math.max(1, Math.round(z));
    const b = cam.bounds(60);
    const r = mulberry32(hashStr('newlife'));
    for (let i = 0; i < 90; i++) {
      const wx = this.crab.x - 900 + r() * 1800;
      if (wx < b.x0 || wx > b.x1) { r(); r(); continue; }
      const when = r();
      const g = clamp01((k - when * 0.7) / 0.3);
      if (g <= 0) { r(); continue; }
      const gy = this.terrain.surfaceY(wx);
      const h = (5 + r() * 9) * g;
      const s = cam.worldToScreen(wx, gy);
      const sway = Math.sin(this.time * 1.4 + wx * 0.05) * 1.4 * z;
      ctx.fillStyle = `rgba(${Math.round(96 + g * 30)},${Math.round(118 + g * 40)},58,${0.5 + g * 0.4})`;
      for (let bl = 0; bl < 3; bl++) {
        const lean = (bl - 1) * 0.6;
        for (let t = 0; t < h; t += 1) {
          const x = s.x + (lean * t * 0.3 + sway * (t / h)) * z * 0.4;
          ctx.fillRect(Math.round(x), Math.round(s.y - t * z), px, px);
        }
      }
    }
    // and a line of birds, high up, going somewhere else
    if (k > 0.55) {
      const fk = clamp01((k - 0.55) / 0.45);
      const gy = this.terrain.surfaceY(this.crab.x);
      for (let i = 0; i < 7; i++) {
        const wx = this.crab.x - 500 + ((this.time * 42 + i * 46) % 1400);
        const wy = gy - 230 - Math.sin(i * 1.1) * 26;
        const s = cam.worldToScreen(wx, wy);
        const flap = Math.sin(this.time * 7 + i) > 0 ? 1 : -1;
        ctx.globalAlpha = fk * 0.7;
        ctx.fillStyle = '#3a3128';
        ctx.fillRect(Math.round(s.x), Math.round(s.y), px, px);
        ctx.fillRect(Math.round(s.x - px * 2), Math.round(s.y - flap * px), px, px);
        ctx.fillRect(Math.round(s.x + px * 2), Math.round(s.y - flap * px), px, px);
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * The held shot. Sand drifts across the mound in the wind, the light wheels
   * over it far too fast, and the only thing moving on the animal is a breath
   * you would miss if you were not watching for it.
   */
  _drawSleep(ctx, cam) {
    const k = this.sleep || 0;
    if (k <= 0.001) return;
    const c = this.crab;
    const gy = this.terrain.surfaceY(c.x);
    const z = cam.zoom;
    // sand going past, low and fast
    for (let i = 0; i < 46; i++) {
      const ph = i * 0.7;
      const u = ((this.time * (0.25 + (i % 5) * 0.08) + i * 0.21) % 1);
      const wx = c.x - 180 + u * 360;
      const wy = gy - 2 - ((i * 7) % 26) * (0.3 + Math.sin(this.time * 0.6 + ph) * 0.2);
      const s = cam.worldToScreen(wx, wy);
      ctx.globalAlpha = 0.10 + 0.22 * Math.sin(u * Math.PI);
      ctx.fillStyle = i % 6 === 0 ? '#f2dcae' : '#d8bb84';
      ctx.fillRect(Math.round(s.x), Math.round(s.y), Math.max(1, Math.round(z * 0.7)), 1);
    }
    // the years themselves are the light: the day/night cycle is running far
    // too fast overhead, and all this adds is the flicker of it going past
    ctx.globalAlpha = 0.05 + 0.05 * Math.sin(this.time * 9);
    ctx.fillStyle = '#ffe9c0';
    ctx.fillRect(0, 0, this.renderer.vw, this.renderer.vh);
    ctx.globalAlpha = 1;
  }

  /**
   * Waking up. Sand runs off the shell in sheets, the way it does off anything
   * that has been buried and has just decided not to be, and the whole animal
   * carries a slow warm rim on the breath before it goes anywhere. Both are
   * drawn rather than simulated: this happens once, and it wants to look right
   * once.
   */
  /**
   * The inside of a shut eye.
   *
   * You do not wake up looking at something. You wake up in the dark, with
   * one sense back before the others, and the last thing that arrives is the
   * picture. So for a few seconds the frame is two lids, almost closed, with
   * a slit of the world between them - and the sound has already told you
   * more than you wanted to know.
   *
   * They are drawn as lids rather than as letterbox bars: the inner edge
   * curves, there is a rim of wet along it, and the lashes break the line.
   */
  _drawLids(ctx, vw, vh) {
    // `lids` is how SHUT they are, which is what every line that sets it has
    // always assumed - but the maths in here used it as the aperture, so
    // "eyes closed" drew a fully open eye and the whole wake-up happened with
    // nothing over it. One minus, and the scene works the way it reads.
    if ((this.lids || 0) <= 0.002) return;
    const k = 1 - clamp01(this.lids);
    const mid = vh * 0.5;
    // how far each lid reaches toward the middle
    const reach = mid * k;
    ctx.save();
    ctx.fillStyle = '#050302';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, side > 0 ? 0 : vh);
      for (let x = 0; x <= vw; x += 4) {
        const t = x / vw;
        // the lid sags in the middle, the way a lid does
        const bow = Math.sin(t * Math.PI) * reach * 0.14;
        ctx.lineTo(x, mid - side * (reach - bow));
      }
      ctx.lineTo(vw, side > 0 ? 0 : vh);
      ctx.closePath();
      ctx.fill();
    }
    // the wet rim along each edge, and the lashes coming off it
    ctx.globalAlpha = 0.55 * k;
    for (const side of [-1, 1]) {
      for (let x = 0; x <= vw; x += 1) {
        const t = x / vw;
        const bow = Math.sin(t * Math.PI) * reach * 0.14;
        const y = Math.round(mid - side * (reach - bow));
        ctx.fillStyle = '#6a5236';
        ctx.fillRect(x, y + (side > 0 ? 0 : -1), 1, 1);
        // lashes: short, irregular, only every few pixels
        if ((x * 7 + side) % 11 === 0) {
          const len = 2 + ((x * 13) % 3);
          ctx.fillStyle = 'rgba(12,8,5,0.9)';
          ctx.fillRect(x, side > 0 ? y - len : y, 1, len);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawWaking(ctx, cam) {
    const k = clamp01(this.waking || 0);
    if (k <= 0.002) return;
    const c = this.crab;
    const z = cam.zoom;
    const gy = this.terrain.surfaceY(c.x);
    const n = Math.round(10 + k * 22);
    for (let i = 0; i < n; i++) {
      const ph = i * 0.83 + this.time * (1.4 + (i % 4) * 0.5);
      const u = ph % 1;
      const wx = c.x + (((i * 37) % 100) / 100 - 0.5) * c.m.rx * 2.0;
      const wy = lerp(c.y - c.m.rx * 0.22, gy + 2, u * u);
      const s = cam.worldToScreen(wx, wy);
      ctx.globalAlpha = (0.14 + 0.5 * k) * (1 - u) * (0.5 + 0.5 * Math.sin(ph * 3));
      ctx.fillStyle = i % 5 === 0 ? '#f2dcae' : '#cdae7c';
      ctx.fillRect(Math.round(s.x), Math.round(s.y),
        Math.max(1, Math.round(z * 0.8)), Math.max(1, Math.round(z * (1 + u * 2))));
    }
    if (k > 0.4) {
      const b = Math.sin(this.time * 1.5) * 0.5 + 0.5;
      const s = cam.worldToScreen(c.x, c.y - c.m.rx * 0.42);
      pxGlow(ctx, s.x, s.y, c.m.rx * 1.5 * z, '#ffe8b4',
        0.10 * (k - 0.4) * 1.6 * b, { p: pxSize(z), steps: 3 });
    }
    ctx.globalAlpha = 1;
  }

  /** A thousand years later, and someone has walked into the basin. */
  startWake() {
    this.state = 'intro';
    this.sea.stop();
    // the thousand years is over: the rock that came up in the wide shot was
    // that shot's rock, and the world has its own now
    this.uplift = 0;
    this.quake = 0;
    this.lifeK = 0;
    this._mesaList = null;
    // it is still under the sand, and stays there until it decides not to be
    this.buried = 1;
    this.buryTarget = 0.90;          // a mound, not an animal, until he is close
    this.weather.hour = 9.4;
    const c = this.crab;
    const npc = this.npc;
    npc.hidden = false;
    npc.x = c.x + 320;
    npc.facing = -1;
    npc.faceT = -1;
    npc.hatOff = null;
    npc.setPose(POSE.WALK);
    // Open wide. A thousand years of nothing, a dry basin, and one person
    // walking across it who is far too small for the frame. Then cut in.
    this.cam.cineCancel();
    this.cam.follow = null;
    this.cam.snapTo(c.x + 150, this.terrain.surfaceY(c.x) - 40);
    this.cam.targetZoom = this.cam.zoom = this.autoZoom() * 0.55;
    this.drift = { x: -7, y: 0, z: 0.004, after: 0 };
    this.fade = 1; this.fadeWant = 1;
    const N = (text) => this.say('narrator', text);
    const V = (text, mood) => { this.say('Dr. Vess', text); npc.face = mood ?? npc._moodFor(text); };
    this.cut = {
      t: 0,
      steps: [
        { at: 0.2, run: () => { this.fromBlack(0.55); npc.moveTo = c.x + 120; } },
        { at: 1.4, run: () =>
          N('Basin nineteen. A thousand years later. Nobody has any reason to be here.') },
        { at: 6.0, run: () => {
          // cut in: the wide has done its job
          this.shot(c.x + 44, c.y - 12, this.autoZoom() * 1.15, 2.2, { x: -2 });
          npc.moveTo = c.x + 46;
          this.buryTarget = 0.66;      // close up, the mound has edges to it
        } },
        { at: 7.4, run: () => V('Survey day four thousand and six. Elevation, wrong. Salinity, wrong.', 7) },
        { at: 10.6, run: () => { npc.moveTo = c.x + 30; npc.setPose(POSE.WRITE); V('One large rock. Sedimentary. Roughly hill-shaped. As per the last four thousand entries.', 4); } },
        { at: 14.4, run: () => { npc.setPose(POSE.IDLE); V('There was an inland sea here. I can prove it. I have the shells, the terraces, the strandlines.', 10); } },
        { at: 18.2, run: () => V('What I do not have is water. Which is, apparently, the only part anybody funds.', 12) },
        { at: 21.6, run: () => { npc.setFacing(1); npc.setPose(POSE.SIT); V('Eleven years. Nobody is watching. Nobody has been watching for a thousand years.', 7); } },
        // ---- you are still asleep, and the first thing you get back is
        // hearing. The lids stay shut through all of this.
        { at: 25.0, run: () => {
          this.lids = 1;
          this.shot(c.x + 6, c.y - 14, this.autoZoom() * 2.2, 1.4, { z: 0.006 });
          N('');
        } },
        { at: 26.4, run: () => {
          // He sits down on the rock, the way he has sat down on it every
          // evening for eleven years, and opens a beer.
          npc.x = c.x + 20;
          npc.moveTo = undefined;
          npc.vx = 0;
          npc.setFacing(-1);
          npc.turnT = 1;
          npc.faceT = -1;
          npc.setPose(POSE.BEER);
          this.beerLevel = 1;
          this.audio.play('claw', { pitch: 1.4 });
          N('Something is sitting on it.');
        } },
        { at: 28.0, run: () => {
          this.beerLevel = 0.5;
          this.lids = 0.93;
          this.audio.play('drip', { pitch: 0.7 });
          V('To the inland sea. Which was here. Which I can prove.', 3.4);
        } },
        { at: 30.0, run: () => {
          this.beerLevel = 0;
          this.audio.play('drip', { pitch: 0.45 });
          N('It has been warm all day and it is warm now. That is the part it notices first.');
        } },
        { at: 31.4, run: () => {
          // and then he throws it over his shoulder without looking, which is
          // the entire reason any of the rest of this game happens
          this.throwBottle(npc, 1, { vx: 34, vy: -230 });
          npc.setPose(POSE.REST);
          this.onBottleHit = () => {
            this.onBottleHit = null;
            this.lids = 0.30;
            this.crab.blink = 1;
            N('And then something hits it.');
          };
        } },
        { at: 33.2, run: () => {
          // whatever the bottle did, the lids are up by now and there he is
          this.lids = 0;
          this.onBottleHit = null;
          this.shot(c.x + 16, c.y - 10, this.autoZoom() * 2.4, 1.2, { z: 0.004 });
          V('Sorry. Sorry, rock.', 0);
        } },
        { at: 34.0, run: () => {
          npc.setPose(POSE.IDLE);
          V('Four thousand days and I still apologise to the geology.', 4);
        } },
        { at: 34.6, run: () => {
          // in very close, on the part of it that is about to move
          this.shot(c.x - 4, c.y - 18, this.autoZoom() * 2.9, 1.4, { z: 0.012 });
          this.waking = 0.001;
          N('It has been waiting a very long time for that.');
        } },
        { at: 36.0, run: () => {
          // the eye. One slow open, and nothing else in the frame moves.
          this.crab.blink = 1;
          this.waking = 0.35;
          this.audio.play('drip', { pitch: 0.5 });
          this.fx.drift(c.x - 8, c.y - 16, '#d8c49a', 3);
          N('');
        } },
        { at: 37.6, run: () => {
          // the first breath in a thousand years, and the sand that has been
          // lying on it since slides off in sheets
          this.waking = 0.7;
          this.audio.play('growl', { pitch: 0.42 });
          this.cam.shake(1.6);
          this.buryTarget = 0.44;
          for (let i = 0; i < 14; i++) {
            this.fx.drift(c.x + (Math.random() - 0.5) * this.crab.m.rx * 1.7,
              c.y - 6 - Math.random() * 10, '#e0c99c', 1);
          }
          N('Something under the sand takes a breath.');
        } },
        { at: 39.2, run: () => {
          // it braces. The shot pulls out to leave room for what is coming.
          this.waking = 1;
          this.shot(c.x + 12, c.y - 18, this.autoZoom() * 1.5, 1.1, { z: -0.012 });
          this.cam.shake(3);
          this.terrain.deform(c.x, 2.4, 34);
          this.audio.play('hit', { pitch: 0.5 });
          N('');
        } },
        { at: 40.6, run: () => {
          // the eruption: snap wider and shake, so the animal has room to be big
          this.shot(c.x, c.y - 20, this.autoZoom() * 0.95, 0.7, { z: -0.02 });
          this.cam.shake(9);
          this.terrain.deform(c.x, 6, 40);
          this.fx.digBurst(c.x, c.y + 14, 2.4, false);
          this.audio.play('thunder');
          npc.setFacing(-1);
          // a thousand years of sand comes off it
          this.buryTarget = 0;
        } },
        { at: 41.2, run: () => { npc.startle(1.25); this.cam.shake(4); N(''); } },
        { at: 41.9, run: () => { npc.moveTo = c.x + 108; npc.setPose(POSE.WALK); V('NOT A ROCK. NOT A ROCK. THAT IS NOT A ROCK -', 8); } },
        { at: 44.6, run: () => {
          npc.moveTo = undefined; npc.setPose(POSE.IDLE); npc.setFacing(-1);
          this.shot(c.x + 34, c.y - 14, this.autoZoom() * 1.25, 1.8, { z: 0.004 });
          V('...you are awake.', 2);
        } },
        { at: 47.4, run: () => { npc.setPose(POSE.TALK); V('And I have just urinated on you.', 4); } },
        { at: 50.4, run: () => V('Oh. Oh, that is what the water table was for. It was never the rainfall. It was you.', 3) },
        { at: 54.6, run: () => V('You lay down in a sea and the sea kept coming, because you were in it.', 5) },
        { at: 58.8, run: () => { npc.setPose(POSE.POINT); V('There is a spring in your back. I can hear it from here and it is the loudest thing in this desert.', 3); } },
        { at: 63.0, run: () => { npc.setPose(POSE.TALK); V('So get up. Walk. Put it back.', 6); } },
        { at: 66.2, run: () => V('I have eleven years of notes, one canteen, and absolutely nothing else to do.', 1) },
        { at: 69.6, run: () => this.endIntro() },
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
    // he walks with you while he is teaching you
    this.npc.mode = 'follow';
    this.npc.keepAway = true;
    this.tutorial = 0;
    this.teach(1);
  }

  /**
   * Stand the animal and the archaeologist up in a storm and point a camera
   * at them. Nothing here is a separate scene: it is the world, paused, with
   * the weather turned up and him given something to do with his hands.
   */
  enterMenu() {
    this.menuReturn = this.state;
    this.state = 'title';
    this.clearCutscene();
    this.weather.hour = 17.4;
    this.weather.sand = 0.62;
    this.weather.wind = 1.35;
    const c = this.crab;
    c.vx = 0;
    this.npc.hidden = false;
    this.npc.mode = 'free';
    this.npc.keepAway = false;
    this.npc.moveTo = undefined;
    this.npc.x = c.x + c.m.shellW * 0.5 + 104;
    this.npc.setFacing(-1);
    this.npc.turnT = 1;
    this.npc.setPose('beer');
    // the front door shows a grown animal even before you have grown one
    if (!Save.readSave()) { c.setStage('adult'); c.snapToGround(); }
    this.buried = 0;
    this.buryTarget = 0;
    this.cam.cineCancel();
    this.cam.follow = null;
    // framed wide, and off to one side, so the title has sky to sit in and
    // the two of them are both in shot without either standing on the words
    this.cam.snapTo(c.x + 30, c.y - 10);
    this.cam.targetZoom = this.cam.zoom = this.autoZoom() * 0.66;
    this.menu.open();
  }

  /** While the bottle is in the air his hand is empty, so the pose changes. */
  _menuPose() {
    const b = this.menu.beer;
    const want = b.phase === 'throw' ? 'point' : b.phase === 'finish' ? 'survey' : 'beer';
    if (this.npc.pose !== want) this.npc.setPose(want);
  }

  /** Carry on from the save that is already loaded. */
  resumeSave() {
    this.state = 'play';
    this.weather.sand = 0;
    this.npc.mode = 'follow';
    this.npc.keepAway = true;
    this.npc.setPose('idle');
    this.cam.followEntity(this.crab, true);
    this.cam.targetZoom = this.autoZoom();
  }

  /** A fresh animal, a fresh basin, and the whole opening again. */
  startFresh() {
    Save.clearSave();
    this.newRun();
  }

  /** Erase everything and put the title back the way it was on day one. */
  wipeAll() {
    Save.clearSave();
    this.newRun();
    this.enterMenu();
    this.ui.say('Erased.', 3);
  }

  say(who, text) { this.dialog = { who, text, t: 0 }; }

  /**
   * The sea only exists in the two states that own it. Asking the sea whether
   * it is active is not enough on its own: if anything ever leaves it running,
   * this keeps it off the desert anyway.
   */
  get seaShowing() {
    return this.sea.active
      && (this.state === 'prologue' || this.state === 'burying' || this.shallows.on);
  }

  /**
   * A shot, not a camera move. Frame it, and then keep drifting - a held shot
   * that is perfectly still reads as a paused game, and one that creeps in a
   * few pixels a second reads as a camera someone is holding.
   */
  shot(x, y, zoom, dur = 2.2, drift = {}) {
    this.cam.cineTo(x, y, zoom, dur);
    this.drift = { x: drift.x || 0, y: drift.y || 0, z: drift.z || 0, after: dur };
  }

  /**
   * A CUT.
   *
   * The difference between a cutscene and gameplay with the camera nudged
   * about is whether the camera ever cuts. Everything in here used to glide
   * from one framing to the next, which meant every shot was visibly the shot
   * you play the game in, moved slightly - so nothing ever felt staged.
   *
   * This is a hard cut: black for a frame, the camera somewhere genuinely
   * else, and a slow drift on the new framing so the held shot still breathes.
   * `zoom` is absolute, and it is allowed to be far wider than the game ever
   * gets, because that is the point.
   *
   * (It is `cutTo` and not `cut` because `this.cut` is already the running
   * cutscene, and an instance property quietly wins over a method.)
   */
  cutTo(x, y, zoom, drift = {}) {
    this.cam.cineCancel();
    this.cam.free = true;
    this.cam.freeT = 999;
    this.cam.follow = null;
    this.cam.snapTo(x, y);
    this.cam.targetZoom = this.cam.zoom = zoom;
    this.drift = { x: drift.x || 0, y: drift.y || 0, z: drift.z || 0, after: 0 };
    // one frame of black on the join, which is what a cut sounds like
    this.fade = 1;
    this.fadeWant = 0;
    this.fadeRate = drift.in ?? 5.0;
  }

  /** Fade the frame down to black, or back up out of it. */
  toBlack(rate = 2.2) { this.fadeWant = 1; this.fadeRate = rate; }
  fromBlack(rate = 1.4) { this.fadeWant = 0; this.fadeRate = rate; }

  /** Words held on the black between two acts. */
  hold(text, sub = '') { this.card = { text, sub, t: 0 }; }

  _cineTick(dt) {
    this.fade += clamp(this.fadeWant - this.fade, -this.fadeRate * dt, this.fadeRate * dt);
    if (this.card) this.card.t += dt;
    const d = this.drift;
    if (d) {
      // the drift only takes over once the framing move has landed
      if (d.after > 0) d.after -= dt;
      else if (!this.cam.cine) {
        this.cam.tx += d.x * dt;
        this.cam.ty += d.y * dt;
        this.cam.x += d.x * dt;
        this.cam.y += d.y * dt;
        // A cutscene is not bound by the gameplay zoom floor. This clamp was
        // quietly dragging every wide shot back to 1x the moment the drift
        // took over, which is why the basin never actually looked wide.
        const zmin = this.state === 'play' ? this.cam.minZoom : 0.22;
        this.cam.targetZoom = clamp(this.cam.targetZoom + d.z * dt, zmin, this.cam.maxZoom);
      }
    }
  }

  /**
   * The tutorial is Dr. Vess. There are no instruction cards: he walks with
   * you for the first few minutes and tells you what to do next, one step at a
   * time, in the same speech bubble he says everything else in. Each step
   * fires once, in order, and only when you have actually reached it.
   */
  teach(step) {
    if (this.state !== 'play') return;
    if ((this.tutorial || 0) >= step) return;
    this.tutorial = step;
    const say = (text, mood) => { this.npc.say(text, 6.5, mood); };
    switch (step) {
      case 1: say('Your back is a spring. Tap in time with the band - the middle of it pays double.', 10); break;
      case 2: say('Good. Now get up on yourself: tap your own shell.', 3); break;
      case 3: say('Drag a seed out and drop it on a bed. It is your back, you can put it where you like.', 5); break;
      case 4: say('It is a seed until it has drunk. Run the spring again and it will come up.', 0); break;
      case 5: say('There. When the bead shows, take it - nothing on you pays out on its own.', 13); break;
      case 6: say('That is the whole of it. Water, plants, genes, you. Walk east and I will keep up.', 6); break;
      case 7: this.ui.say('E swings his pick. B opens the bench.', 6); break;
      default: break;
    }
  }

  /**
   * Everything the opening turns on, turned off again. There are three ways
   * out of the opening - skipping it, finishing it, and loading a save over
   * the top of it - and all three have to leave the world in the same state.
   * Loading did not, which is why a reloaded desert still had a sea in it.
   */
  clearCutscene() {
    this.sea.stop();
    this.cut = null;
    this.dialog = null;
    this.card = null;
    this.drift = null;
    this.fade = 0;
    this.fadeWant = 0;
    this.letterbox = 0;
    this.sleep = 0;
    this.waking = 0;
    this.buried = 0;
    this.buryTarget = 0;
    this.bottle = null;
    this.onBottleHit = null;
    this.lids = 0;
    this.ocean = null;
    this.npc.hidden = false;
    this.npc.hatOff = null;
    this.cam.cineCancel();
  }

  skipIntro() {
    this.clearCutscene();
    this.weather.hour = 9.4;
    this.endIntro();
    this.npc.x = this.crab.x + 130;
    this.npc.facing = -1;
    this.npc.faceT = -1;
    this.npc.turnT = 1;
  }

  // -- loop -----------------------------------------------------------------

  update(dt) {
    this.time += dt;
    // The camera has to know how big the window is before anything reads it.
    // This used to live at the bottom of the play path, which meant the title
    // screen ran on a stale 460x258 viewport - the backdrop painted a scratch
    // buffer narrower than the frame and left a bright band down one side,
    // and every screen-to-world sum on the menu was off by the difference.
    this.cam.setViewport(this.renderer.vw, this.renderer.vh);
    // On a phone a good part of the screen is controls, so the animal is
    // lifted clear above them and the ground - not the sky - is what ends up
    // underneath the stick and the band. The interface says how much room it
    // is taking and the camera answers, which means starting a job lifts the
    // shot rather than burying the hole under the band.
    let bias = this.renderer.tall ? -0.10 : 0.16;
    if (this.ui?.touchEnabled) {
      const top = this.ui.furnitureTop(this.renderer.vw, this.renderer.vh);
      const want = clamp((top - 42) / this.renderer.vh, 0.3, 0.66) - 0.5;
      bias = Math.min(bias, want);
    }
    this.cam.yBias = bias;
    // how long you have actually been playing, which is what the control hints
    // fade against - a cutscene does not count as practice
    if (this.state === 'play') this.playT = (this.playT || 0) + dt;
    const i = this.input;
    const slow = this.state === 'dead' ? 0.3 : 1;
    const sdt = dt * slow;

    this.ui.update(dt);
    if (this.state === 'intro') this._runCut(dt);
    if (this.state === 'prologue') this._runPrologue(dt);
    if (this.state === 'burying') this._runBury(dt);
    if (this.state !== 'play') this._cineTick(dt);
    this._bottleTick(dt);
    if (this.state === 'title') {
      // the world keeps breathing behind the menu, but nothing in it is
      // playable: no input reaches the animal, and the clock does not run
      this.menu.update(dt);
      this._menuPose();
      this.npc.update(dt);
      this.crab.update(dt, { move: 0 });
      this.fx.update(dt, this.weather);
      this.critters.update(dt, this.weather);
      this.terrain.update(dt, 1.1);
      this.cam.update(dt);
      this.input.endFrame();
      return;
    }
    // Sitting down with him stops everything else. The world keeps breathing
    // behind the conversation, but nothing you press reaches the animal.
    this.talk.update(dt);
    this.puzzle.update(dt);
    this.ending.update(dt);
    if (this.talk.on || this.puzzle.on || this.ending.on) {
      this.npc.update(dt);
      this.crab.update(dt, { move: 0 });
      this.fx.update(dt, this.weather);
      this.critters.update(dt, this.weather);
      this.terrain.update(dt, 1.1);
      this.cam.update(dt);
      this.input.endFrame();
      return;
    }

    if (this.state !== 'play') {
      // the plate, or the two keys anybody would try. A tap anywhere used to
      // count, which skipped the opening whenever you reached for the screen.
      const b = this.skipRect;
      const skipTap = !!(i.clicked && b && i.sx >= b.x && i.sx <= b.x + b.w
        && i.sy >= b.y && i.sy <= b.y + b.h);
      if (i.justPressed('Escape') || i.justPressed(' ') || skipTap) {
        i.consumeKey('Escape'); i.consumeKey(' ');
        if (skipTap) i.clicked = false;
        this.skipIntro();
      }
    }

    // paused: the world stops, the card does not
    if (this.ui.paused) return;

    const play = this.state === 'play';
    // you can walk in the prologue: it is a place, not a film
    const roam = play || this.state === 'prologue';

    let move = 0;
    // You cannot walk while you are stood on your own shell planting things.
    // It is your shell; you are on it; the legs are not available.
    // the valve's tap is read every frame whether or not it can be used, so a
    // press made while a panel was open does not fire when the panel closes
    const tapped = this.ui.valveTapped;
    this.ui.valveTapped = false;

    if (roam && !this.ui.busy && !this.ui.building) {
      const ax = i.axis();
      move = ax.x;
      // while you are riding one of your own, the keys are its keys
      if (this.ui.driving) {
        const d = this.ui.driving;
        if (!d.alive) this.ui.release();
        else { d.driveX = move; move = 0; }
      }
      // the spring is not a key you hold. It is a muscle with a rhythm, and
      // every stroke either catches the chamber full or does not.
      if (play && (i.justPressed(' ') || i.justPressed('Space') || tapped)) {
        i.consumeKey(' '); i.consumeKey('Space');
        this.pumpStroke();
      }
      if (!play) {
        // the prologue has exactly one verb
        if (i.justPressed('e') || i.justPressed('Enter')) { i.consumeKey('e'); this.buryIn(); }
      } else if (i.justPressed('e')) this.act();
      if (play && i.justPressed('r')) this.harvestAll();
      if (play && i.justPressed('f')) this.callVess();
      // C sits you down in front of him - G is already the way into your own
      // genome. So does clicking on him, which is what anyone tries first.
      if (play && i.justPressed('c')) { i.consumeKey('c'); this.openTalk(); }
      if (play && i.clicked && !this.ui.busy && this.talk.near) {
        const sp = this.cam.worldToScreen(this.npc.x, this.npc.y - 14);
        const rr = 14 * this.cam.zoom;
        if (Math.abs(i.sx - sp.x) < rr && Math.abs(i.sy - sp.y) < rr * 1.6) {
          i.clicked = false;
          this.openTalk();
        }
      }
      if (play && i.justPressed('x')) this.infest();
      if (play && i.justPressed('k')) this.incubateBest();
      // the song: 1-5 are the pitches you answer with
      if (play && this.taming.live && this.taming.phase === 'answer') {
        for (let n = 0; n < 5; n++) {
          if (i.justPressed(String(n + 1))) { i.consumeKey(String(n + 1)); this.taming.answer(n); }
        }
      }
      if (play && i.justPressed('l')) this.lureVess();
      if (play && i.justPressed('v')) this.sprayVess();
      // While the spore has him, he is the one with the hands: the movement
      // keys go to him instead of to you, and the dig key is his pick.
      if (play && this.mind.owned) {
        if (Math.abs(move) > 0.05) {
          this.npc.moveTo = undefined;
          this.npc.driveX = move;
          this.mind.work = null;
          move = 0;
        } else this.npc.driveX = 0;
        if (i.justPressed('e')) { i.consumeKey('e'); this.mind.order('mine', this.npc.x + (this.npc.facing || 1) * 8); }
      }
      // T is the tap key: hold for a long tap, release for a short one. It
      // means one thing out in the world and another sitting in front of him,
      // and the conversation gets it while the conversation is open.
      // Q is the claw. In HUNT it is the timed strike; anywhere else it is
      // the old flat swipe, so you are never without a way to defend yourself.
      // HUNT is a duel and it has exactly three verbs. Q swings, SHIFT rolls,
      // and holding the guard key puts the claw up - and a guard raised in
      // the quarter second before a hit lands is a parry rather than a block,
      // which is the whole skill of the thing.
      if (play && this.ui.mode === 'hunt') {
        const st = this.ui.clawVec;
        if (i.justPressed('q')) {
          this.strike(st ? st.x : (this.crab.facing || 1), st ? st.y : 0);
        }
        this.combat.setGuard(i.key('s') || !!this.ui.guardHeld);
        if (i.justPressed('Shift') || this.ui.rollWant) {
          this.ui.rollWant = false;
          this.combat.roll();
        }
      } else {
        this.combat.setGuard(false);
        if (play && i.justPressed('q')) this.attack();
      }
      // The sand. Z takes it, shift-Z puts it back - held, because moving sand
      // is something you do for a while rather than something you trigger, and
      // one key rather than two because your other hand is on the walk keys.
      this.sandT = Math.max(0, this.sandT - dt);
      if (play && !this.ui.building) {
        const pour = (i.key('z') && i.key('Shift')) || this.ui.pourHeld;
        if (pour) this.pourSand(sdt);
        else if (i.key('z') || this.ui.scoopHeld || this.ui.scoopTap) this.scoopSand(sdt);
      }
      // SPORE mode: hold V to charge, let go to throw
      // the nozzle in the corner and the V key are the same muscle
      if (play && this.ui.mode === 'spore') this.hive.hold(i.key('v') || !!this.ui.nozzleHeld);
      else if (this.hive.holding) this.hive.hold(false);
      // HIVE mode: A/D walks whichever of yours you have picked
      if (play && this.ui.mode === 'hive' && this.hive.pick) {
        const p = this.hive.pick;
        if (Math.abs(move) > 0.05) {
          if (p === this.npc) { p.driveX = move; p.moveTo = undefined; }
          else { p.driveX = move; p.puppet = true; }
          move = 0;
        } else if (p.driveX) p.driveX = 0;
      }
    }
    this.crab.update(sdt, {
      move, sprint: i.key('Shift'), grab: i.key('e'),
      // an overloaded animal is a slower animal
      speedMul: (this.economy ? this.economy.stat('speed') : 1)
        * (1 - (this.garden ? this.garden.overload : 0) * 0.45),
      list: this.garden ? this.garden.list : 0,
    });

    if (this.ui.building) {
      // up on your own back, nothing moves: not you, not the view. The camera
      // is pinned to the shell so a drag is a drag on a plant and a pinch is
      // not a way to lose the thing you are planting on.
      this.cam.cineCancel();
      this.cam.free = false;
      this.cam.freeT = 0;
      this.cam.followEntity(this.crab);
      i.wheel = 0;
    } else {
      if (i.wheel && !this.ui.busy) this.cam.zoomBy(i.wheel, i.sx, i.sy);
      if (i.dragging && !this.ui.busy && i.touchPan) this.cam.pan(i.dragDX, i.dragDY);
    }

    if (this.state === 'play') this.sea.update(sdt);
    this.pump.update(sdt);
    this.pumpHold = this.pump.power;
    if (this.pumpHold > 0.02) this.pumpTick(sdt);

    this.biome = biomeAt(this.crab.x);
    this.weather.update(sdt, this);
    this.terrain.update(sdt, this.weather.windSpeed);
    this.green.update(sdt, this.weather);
    this.green.tick(sdt);
    this.digs.update(sdt);
    this.mining.update(sdt);
    this._plantTick(sdt);
    // a job is held with the same key that started it
    this.work.update(sdt, i.key('e') || !!this.ui.actHeld);
    this.quests.update(sdt);
    this._checkUnlocks();
    if (this.unlockCard) {
      this.unlockCard.t += dt;
      if (this.unlockCard.t > 4) this.unlockCard = null;
    }
    this.craft.update(sdt);
    this.mind.update(sdt);
    this.combat.update(sdt);
    this.economy.tickAbilities(sdt);
    this.taming.update(sdt);
    this.hive.update(sdt, this.ui.mode === 'hive');
    this.critters.update(sdt, this.weather);
    this.fishing.update(sdt);
    // the claw only comes up against something that is actually in reach
    if (this.ui.mode === 'hunt' && this.state === 'play') {
      const foe = this.wildlife.nearest(this.crab.x, this.crab.y, 150,
        (q) => q.alive && q.hostile);
      if (foe) this.combat.engage(foe); else this.combat.stop();
    }

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
    this.shallows.update(sdt);
    this.fountains.update(sdt);
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

    this.cam.update(dt);
    const w = this.cam.screenToWorld(i.sx, i.sy);
    i.wx = w.x; i.wy = w.y;
    // the frame takes the colour of what you are holding
    this.renderer.setMode(
      this.state === 'play' && (this.ui.mode === 'hunt' || this.ui.mode === 'spore')
        ? this.ui.mode : null);
    this.renderer.update(dt, this.weather);
    this.audio.updateMusic(dt);

    this._autosave += dt;
    if (this._autosave > 20 && play) { this._autosave = 0; this.save(); }
  }

  _runCut(dt) {
    const bt = this.buryTarget || 0;
    if (Math.abs((this.buried || 0) - bt) > 0.002) {
      this.buried = damp(this.buried || 0, bt, 0.0006, dt);
    }
    if (this.ocean) {
      this.ocean.update(dt);
      if (!this.ocean.active) this.ocean = null;
    }
    const c = this.cut;
    if (!c) return;
    c.t += dt;
    while (c.i < c.steps.length && c.t >= c.steps[c.i].at) {
      c.steps[c.i].run();
      c.i++;
    }
    this.letterbox = damp(this.letterbox, 1, 0.002, dt);
  }

  /** The bars ride the bury sequence too, so the cut into it is continuous. */
  _buryBars(dt) { this.letterbox = damp(this.letterbox, 1, 0.0015, dt); }

  // -- actions --------------------------------------------------------------

  /**
   * Start singing at something. It has to be willing first - which means it
   * has had what its species comes for and has stuck around long enough to
   * half trust you - and then it is a conversation, not a purchase.
   */
  singTo(c) {
    const res = this.taming.begin(c);
    if (!res.ok) { this.ui.say(res.why, 3.5); this.audio.play('deny'); return false; }
    this.cam.cineTo(c.x, c.y - 16, Math.max(this.autoZoom(), 2.4), 0.8);
    this.audio.play('uiBig');
    return true;
  }

  onSungTame(c) {
    if (!c) return;
    c.tamed = true;
    c.trust = 1;
    if (!this.wildlife.fleet.includes(c)) this.wildlife.fleet.push(c);
    this.fx.ring(c.x, c.y - 10, '#ffe9a8', 20);
    this.fx.spark(c.x, c.y - 10, '#ffe9a8', 22, 50);
    this.fx.popup(c.x, c.y - 20, c.def.name, '#ffe9a8');
    this.audio.play('discover');
    this.cam.cineCancel();
    this.cam.followEntity(this.crab, false);
    this.cam.targetZoom = this.autoZoom();
    this.economy.markDirty();
    this.npc.say(`It answered you. Do you have the faintest idea how rare that is.`, 6, 3);
  }

  onSongLost(c) {
    this.cam.cineCancel();
    this.cam.followEntity(this.crab, false);
    this.cam.targetZoom = this.autoZoom();
    if (!c) return;
    this.fx.drift(c.x, c.y - 10, '#9a8a70', 4);
    this.ui.say('It lost interest.', 3);
    this.audio.play('deny');
  }

  /**
   * Fire one of the things your genome grew. Each is a short window rather
   * than a number: the animal does something for a few seconds and you make
   * that window count.
   */
  useAbility(id) {
    const a = this.economy.useAbility(id);
    if (!a) { this.audio.play('deny'); return false; }
    const c = this.crab;
    this.buff = this.buff || {};
    this.buff[id] = 6;
    this.fx.ring(c.x, c.y - c.m.rx * 0.4, '#ffe9a8', 22);
    this.fx.popup(c.x, c.y - c.m.rx, a.name, '#ffe9a8');
    this.audio.play('uiBig');
    this.cam.shake(2);
    if (id === 'lumen') {
      // everything looking at you flinches
      for (const q of this.wildlife.hostiles) {
        if (Math.abs(q.x - c.x) < 160) { q.stagger = 0.7; q.recoil = 1.4; }
      }
      this.fx.ring(c.x, c.y - c.m.rx * 0.4, '#fff4d0', 48);
    }
    return true;
  }

  /**
   * The colour of whatever you are holding, or null in plain walk mode. The
   * animal's own eyes wear it, which is the only HUD that is actually on the
   * animal.
   */
  get modeTint() {
    const m = this.ui.mode;
    if (m === 'hunt') return { iris: '#ff8a5e', glow: 'rgba(226,86,79,0.55)' };
    if (m === 'spore') return { iris: '#e0a8f4', glow: 'rgba(201,138,222,0.55)' };
    if (m === 'hive') return { iris: '#9ff0ff', glow: 'rgba(111,216,238,0.6)' };
    return null;
  }

  /** Take one of yours, or put it back down. */
  takeHive(q) {
    if (this.hive.pick === q) {
      this.hive.pick = null;
      if (q.driveX !== undefined) q.driveX = 0;
      this.ui.say('Back on its own.', 2);
      return;
    }
    this.hive.pick = q;
    this.cam.shake(1.5);
    this.fx.ring(q.x, q.y - 8, '#6fd8ee', 16);
    this.audio.play('uiBig');
    this.ui.say(`${q.name || q.def?.name}. A / D.`, 3);
  }

  /** The old flat auto-walk, kept for the encounter hint. */
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
    this.garden.pumpInto(0.05 * push * dt);
    const o = this.crab.shellWorldAB(this.crab.m.organ.a, this.crab.m.organ.b);
    this.fx.spring(o.x, o.y, o.nx, o.ny, 0.35 + push * 0.9);
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
    if (this._pumpSfx <= 0) { this._pumpSfx = 0.42; }
  }

  /**
   * One stroke of the spring. The gauge decides how much of it landed; the
   * water goes in here, and `pumpTick` handles the spray that follows it.
   */
  pumpStroke() {
    const e = this.economy;
    const push = this.pump.stroke();
    if (push <= 0) return;
    const maxW = e.stat('waterMax');
    const before = e.water;
    e.water = clamp(e.water + e.stat('pumpGain') * 1.35 * push, 0, maxW);
    const took = e.water - before;
    this.garden.pumpInto(0.06 * push);
    const o = this.crab.shellWorldAB(this.crab.m.organ.a, this.crab.m.organ.b);
    this.fx.spring(o.x, o.y, o.nx, o.ny, 0.5 + push * 0.5);
    if (took >= 1) {
      this.fx.popup(o.x, o.y - 8, `+${Math.round(took)}`,
        this.pump.combo >= 4 ? '#cfe89a' : '#9de3ee');
    }
    this.crab.pump();
    if (this.pump.combo > 0 && this.pump.combo % 5 === 0) {
      this.fx.popup(o.x, o.y - 18, `${this.pump.combo} in a row`, '#e2d07a');
    }
    if (e.water > 70) this.teach(2);
  }

  /** Kept for the tutorial and for anything that wants a single tap. */
  pump() { this.pumpStroke(); }

  /** What E does right now, and what the prompt says. */
  /**
   * What the thing in front of you is, in ONE OR TWO WORDS.
   *
   * These used to be sentences - "Sing with the Dune Skink", "Study the
   * saltgrass", "C: talk to Dr. Vess" - a line of prose across the bottom of
   * the screen every time you walked past anything. The button beside it
   * already says ACT. This only has to say what.
   */
  /** The last job is done: bring the sea back. */
  startEnding() {
    if (this.ending.on) return;
    this.ending.start();
  }

  actionHint() {
    if (this.state !== 'play') return null;
    const c = this.crab;
    if (this.wildlife.nearest(c.x, c.y, 44, (q) => q.hostile)) return 'STRIKE';
    const wildOne = this.wildlife.nearest(c.x, c.y, 46, (q) => !q.hostile && !q.tamed);
    if (wildOne) return this.taming.why(wildOne) ? null : 'SING';
    if (this.fountains.reachable(c.x)) return 'BREAK';
    if (this.fishing.catchable()) return 'CATCH';
    if (this.world.mastAt(c.x + (c.facing || 1) * 16)) return 'CUT';
    const wild = this.world.wildPlantAt(c.x + (c.facing || 1) * 12, 22);
    if (wild && FLORA_BY_ID[wild.id]) return 'STUDY';
    if (this.encounters.hint) return this.encounters.hint;
    if (Math.abs(this.npc.x - c.x) < TALK_RANGE) return 'TALK';
    return null;
  }

  /** Pick the ripest thing on your back, if anything is ready. */
  /**
   * Picking. One bed at a time, and taking it off the stem properly is the
   * difference between this fruit and the next one - a torn plant sulks.
   */
  harvestAll() {
    const ready = this.garden.plots.filter((p) => p.plant && p.plant.ripe >= 1);
    if (ready.length) {
      const plot = ready[0];
      const w = this.garden.plotWorld(plot);
      this.work.begin('pick', {
        tag: 'pick:' + plot.i, x: w.x, y: w.y,
        label: plot.plant.def.name,
        skill: 1 + this.economy.stat('yield') * 0.2,
        onDone: (r) => {
          const paid = this.harvestPlot(plot, true, r.quality);
          if (r.quality < 0.5) {
            this.fx.popup(w.x, w.y - 14, 'torn', '#d8a09a');
            plot.plant.sulk = 1;
          }
          // and straight on to the next one that is ready, so a row of them
          // is a rhythm rather than five separate button presses
          if (this.garden.ripeCount) this.harvestAll();
        },
      });
      return 0;
    }
    if (!ready.length) {
      const soon = this.garden.plots
        .filter((p) => p.plant && p.plant.stage >= 3)
        .sort((a, b) => b.plant.ripe - a.plant.ripe)[0];
      if (!soon) this.ui.say('Nothing grown yet.', 2);
      else {
        const why = this.garden.blockedText(soon.plant.def);
        this.ui.say(why ? `${soon.plant.def.name} ${why}.` : 'Not ripe yet.', 2);
      }
      return 0;
    }
    let total = 0;
    for (const plot of ready) total += this.harvestPlot(plot, true);
    return total;
  }

  /** Pick one bed. Returns what it paid, which a clean pick improves. */
  harvestPlot(plot, quiet = false, quality = 1) {
    const res = this.garden.harvest(plot);
    if (!res.ok) { if (!quiet) this.ui.say(res.msg); return 0; }
    res.amount = Math.max(1, Math.round(res.amount * (0.55 + quality * 0.55)));
    this.economy.nutrients += res.amount;
    if (res.parasite) {
      this.economy.parasites += res.parasite;
      if (!quiet) this.ui.say('A parasite. X puts it on something.', 6);
    }
    const w = this.garden.plotWorld(plot);
    this.fx.popup(w.x, w.y - 8, res.parasite ? `+${res.parasite} parasite` : `+${res.amount}`,
      res.parasite ? '#d79ae8' : '#cfe89a');
    // seed saved off your own crop, which is how an annual pays for the next
    // one without you ever going near a shop
    if (res.seed) this.fx.popup(w.x, w.y - 18, `+${res.seed} seed`, '#e0c188');
    if (res.spent && !quiet) this.ui.say('One crop only. The bed is free.', 3.5);
    this.fx.spark(w.x, w.y - 3, res.parasite ? '#c98ade' : '#e2f0a8', 14, 44);
    this.audio.play('pickup', { pitch: 0.9 + Math.random() * 0.3 });
    this.cam.shake(1.2);
    this.teach(6);
    return res.amount;
  }

  /** A plant coming ready is worth noticing without being nagged about. */
  onRipe(plot, pl) {
    const w = this.garden.plotWorld(plot);
    this.fx.ring(w.x, w.y - 4, '#ffe9a8', 13);
    this.fx.spark(w.x, w.y - 4, '#ffe9a8', 10, 30);
    this.audio.play('chirp', { pitch: 1.25 });
    this.teach(5);
  }

  /** Ask him to come along, get on, or get off. */
  /**
   * Put bait down in front of you. He cannot walk past an artefact lying on
   * the surface - eleven years of nothing has seen to that - so it is the one
   * reliable way to get his head down and still.
   */
  lureVess() {
    // close in: he has to end up inside spraying range, not just nearby
    const x = this.crab.x + (this.crab.facing || 1) * (this.crab.m.shellW * 0.5 + 16);
    const res = this.mind.lure(x);
    if (!res.ok) { this.ui.say(res.why, 3); this.audio.play('deny'); return false; }
    this.audio.play('ui');
    return true;
  }

  /** The cloud. Close range, while he is down over the bait. */
  sprayVess() {
    if (this.mind.owned) { this.mind.release(); this.ui.say('Let him go.', 2.5); return true; }
    const res = this.mind.spray();
    if (!res.ok) { this.ui.say(res.why, 3.5); this.audio.play('deny'); return false; }
    return true;
  }

  /**
   * THE SAND.
   *
   * Everything else in this game treats the ground as a surface. It is not a
   * surface, it is a material - it has already got slumping, wind fill and
   * live deformation in it, and the only thing missing was a pair of hands.
   * So: scoop it into the claw, carry it, and pour it out somewhere else. The
   * hole you leave collapses at the angle of repose and fills on the wind over
   * days; the heap you make spreads out the same way. Nothing here is a
   * command to the terrain, it is sand being moved from one place to another,
   * and it conserves - you cannot pour out more than you picked up.
   */
  get sandMax() { return 90; }

  /** Dig a bite out of the ground in front of you and put it in the claw. */
  scoopSand(dt) {
    if (this.sandHeld >= this.sandMax) {
      if (this.sandT <= 0) { this.sandT = 1.4; this.ui.say('The claw is full. Pour it somewhere.', 2.4); }
      return false;
    }
    const c = this.crab;
    const x = c.x + (c.facing || 1) * (c.m.shellW * 0.34);
    // you cannot scoop rock, and the game should say so rather than let you
    // quietly mine a mountain with your hands
    if (formDepth(this.world.seed, x) > 2) {
      if (this.sandT <= 0) { this.sandT = 1.4; this.ui.say('That is rock. It wants a pick.', 2.4); }
      return false;
    }
    const bite = 26 * dt;
    this.terrain.deform(x, bite, 13);
    this.sandHeld = Math.min(this.sandMax, this.sandHeld + bite);
    c.clawOpen = 0.9;
    c.pumping = Math.max(c.pumping, 0.12);
    if (Math.random() < dt * 22) {
      this.fx.dust(x, this.terrain.surfaceY(x), 0.7);
      this.audio.play('step', { pitch: 0.7 });
    }
    return true;
  }

  /** And tip it back out. It lands where you are standing and then spreads. */
  pourSand(dt) {
    if (this.sandHeld <= 0) return false;
    const c = this.crab;
    const x = c.x + (c.facing || 1) * (c.m.shellW * 0.34);
    const give = Math.min(this.sandHeld, 30 * dt);
    this.terrain.deform(x, -give, 15);
    this.sandHeld -= give;
    c.clawOpen = 1;
    if (Math.random() < dt * 26) {
      this.fx.dust(x, this.terrain.surfaceY(x) - 4, 0.6);
      this.audio.play('step', { pitch: 1.2 });
    }
    return true;
  }

  /**
   * One swing of his pick. It takes a bite out of the ground whatever
   * happens, and if there is a seam under it that his pick can touch, the
   * seam gives something up.
   */
  mineSwing(x) {
    const n = this.npc;
    const power = this.craft.pickPower;
    const res = this.mining.swing(x, power);
    const gy = this.terrain.surfaceY(x);
    this.fx.digBurst(x, gy, 0.55 + power * 0.2, false);
    this.audio.play('hit', { pitch: 0.9 + Math.random() * 0.25 });
    this.cam.shake(1.1);
    this.shakeOutBugs(x, 0.7);

    if (res.blocked === -1 && !this._softSaid) {
      this._softSaid = 1;
      n.say('This wants a better pick than the one you gave me.', 4, 4);
      return res;
    }
    let got = 0;
    for (const [id, n2] of Object.entries(res.drops)) {
      this.craft.add(id, n2);
      got += n2;
      const d = ITEM_BY_ID[id];
      if (d) this.fx.popup(x, gy - 10 - got * 3, `+${n2} ${d.name}`, d.tint);
    }
    if (res.broke) {
      this.fx.ring(x, gy + res.broke.depth, res.broke.ore.colour, 14);
      this.fx.spark(x, gy + res.broke.depth, res.broke.ore.colour, 16, 44);
      this.audio.play('pickup', { pitch: 1.2 });
    } else if (res.cracked) {
      this.fx.spark(x, gy + res.cracked.depth, res.cracked.ore.colour, 5, 22);
    }
    this.economy.markDirty();
    return res;
  }

  /**
   * Break ground anywhere and something that was living in it comes out. The
   * desert looks empty because everything in it is underneath.
   */
  shakeOutBugs(x, power = 1) {
    const gy = this.terrain.surfaceY(x);
    const n = Math.random() < 0.42 * power ? 1 + Math.floor(Math.random() * 3) : 0;
    for (let i = 0; i < n; i++) {
      this.fx.bug(x + (Math.random() - 0.5) * 16, gy - 1,
        Math.random() < 0.5 ? -1 : 1, Math.random());
    }
    if (n) this.audio.play('chirp', { pitch: 1.5 + Math.random() * 0.5 });
  }

  onCrafted(r) {
    const out = ITEM_BY_ID[r.out[0]];
    const n = this.npc;
    this.fx.popup(n.x, n.y - 26, `${out.name} x${r.out[1]}`, out.tint);
    this.fx.spark(n.x, n.y - 20, out.tint, 12, 30);
    this.audio.play('uiBig');
  }

  onOwned() {
    this.ui.say('His no longer.', 3);
    this.teach(7);
  }

  /** Sit down with him, if he is close enough and in a state to talk. */
  openTalk() {
    if (!this.talk.near) {
      this.ui.say('He is too far to hear you tap.', 2.2);
      return;
    }
    if (this.mind?.owned) {
      this.npc.say('...', 2);
      return;
    }
    this.talk.open();
  }

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
      this.ui.say('No parasites. Grow a mindcap.');
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
    this.ui.say(`${target.def.name} is yours.`, 5);
    this.npc.say('You just put one of your own children inside a lizard. '
      + 'I am writing that down and then I am going to think about it for a long time.', 7);
    this.economy.markDirty();
    return true;
  }

  /** Put the best thing in your pack into the water on your back. */
  incubateBest() {
    const have = Object.entries(this.relics || {}).filter(([, n]) => n > 0);
    if (!have.length) { this.ui.say('Pack is empty.'); return; }
    if (this.garden.pond < 0.25) { this.ui.say('Basin is dry.'); return; }
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
      this.ui.say(`${made.def.name}. Alive.`, 7);
      this.npc.say('It hatched. A thousand years in a rock and it hatched. '
        + 'I am going to need a bigger notebook.', 8);
      this.economy.markDirty();
    }
  }

  /**
   * The action key. If a job is already running this is another stroke of it;
   * otherwise it is whatever is in front of you, and most of those are jobs
   * rather than instants now.
   */
  act() {
    const c = this.crab;
    if (this.work.live) { this.work.strike(); return; }
    // a fish in reach comes before anything on the ground: it will not wait
    if (!this.fountains.reachable(c.x) && this.fishing.tryCatch()) return;

    // something in the ground right under you comes first: it is the only
    // thing here you can lose by walking past
    // A wild plant you have not finished learning. Studying it is how a
    // species stops being scenery and becomes something you can grow - and it
    // is where seed comes from, because nothing here is bought.
    const wild = this.world.wildPlantAt(c.x + (c.facing || 1) * 12, 22);
    if (wild && FLORA_BY_ID[wild.id]) {
      const def = FLORA_BY_ID[wild.id];
      this.work.begin('study', {
        tag: 'study:' + wild.id + ':' + Math.round(wild.x),
        x: wild.x, y: this.terrain.surfaceY(wild.x),
        label: `Study the ${def.name}`,
        onDone: () => {
          const before = this.studied[wild.id] || 0;
          this.studied[wild.id] = before + 1;
          const seed = 1 + (Math.random() < 0.45 ? 1 : 0);
          this.seeds[wild.id] = (this.seeds[wild.id] || 0) + seed;
          this.fx.spark(wild.x, this.terrain.surfaceY(wild.x) - 6, '#cfe89a', 12, 30);
          this.audio.play('discover');
          const u = def.unlock?.study;
          if (u !== undefined && before < u && before + 1 >= u) {
            this.ui.say(`${def.name}  +${seed} seed`, 4.5);
            this.npc?.say(`${def.name}. Write that down - we can grow that.`, 4.5, 4);
          } else {
            this.ui.say(`${def.name}: +${seed} seed.`, 3);
          }
        },
      });
      return;
    }

    // A mast standing next to you. Cutting one is a job, not a keypress: it
    // takes a while, it throws chips, and it is the only source of a long
    // straight stiff thing in the whole basin.
    const mast = this.world.mastAt(c.x + (c.facing || 1) * 16);
    if (mast) {
      this.work.begin('fell', {
        tag: 'fell:' + mast.id,
        x: mast.x, y: this.terrain.surfaceY(mast.x),
        label: 'Cut the mast',
        onDone: () => {
          const got = this.world.fell(mast);
          this.craft.add('timber', got.timber);
          this.craft.add('fibre', got.fibre);
          this.cam.shake(4);
          this.audio.play('hit', { pitch: 0.6 });
          this.fx.dust(mast.x, this.terrain.surfaceY(mast.x), 1.6);
          this.ui.say(`${got.timber} timber, ${got.fibre} fibre.`, 3);
          this.npc?.say('Careful with that. There are not many.', 3.6, 7);
        },
      });
      return;
    }

    // A capped vent beats everything else you could be doing here, because
    // everything else you could be doing here is smaller than a river.
    const vent = this.fountains.reachable(c.x);
    if (vent) {
      const res = this.fountains.strike(vent);
      if (res.puzzle) { this.puzzle.open(vent, res.level); return; }
      if (!res.ok) { this.ui.say(res.why, 3); this.audio.play('deny'); }
      else {
        this.crab.clawOpen = 1;
        this.attackT = 0.45;
        this.fx.dust(vent.x, this.terrain.surfaceY(vent.x), 1.4);
      }
      return;
    }
    const site = this.digs.reachable(c.x);
    if (site) { this.startDig(site); return; }
    if (this.garden.ripeCount) { this.harvestAll(); return; }
    const foe = this.wildlife.nearest(c.x, c.y, 44, (q) => q.hostile);
    if (foe) { this.attack(); return; }
    // something willing close by: sing to it rather than buy it
    const sing = this.wildlife.nearest(c.x, c.y, 46,
      (q) => q.alive && !q.hostile && !q.tamed && this.taming.willing(q));
    if (sing) { this.singTo(sing); return; }
    const wildOne = this.wildlife.nearest(c.x, c.y, 40, (q) => !q.hostile && !q.tamed && q.trust > 0.45);
    if (wildOne) {
      const res = this.wildlife.tryTame(wildOne);
      this.ui.say(res.ok ? `${wildOne.def.name} joins you.` : `${wildOne.def.name} ${res.why}.`);
      return;
    }
    if (this.encounters.active) {
      // searching a ruin is not a glance. You turn the place over.
      const site = this.encounters.active;
      this.work.begin('search', {
        tag: 'search:' + (site.id ?? site.x ?? 0),
        x: site.x ?? c.x, y: this.terrain.surfaceY(site.x ?? c.x),
        label: site.name || 'What is left of it',
        onDone: () => {
          const line = this.encounters.interact();
          if (line) this.ui.say(line, 5);
        },
      });
      return;
    }
    if (Math.abs(this.npc.x - c.x) < 46) this.talkToVess();
  }

  /**
   * A fossil comes out of the ground over about five seconds of somebody
   * kneeling in the sand, and how it comes out depends on how you dug. Strike
   * in the band and you are taking sand off it; strike outside and that is a
   * crack, and a cracked relic is worth less and reads as broken.
   */
  startDig(site) {
    const can = this.digs.dig(site, true);
    if (!can.ok) { this.ui.say(can.msg); return; }
    const gy = this.terrain.surfaceY(site.x);
    this.work.begin('dig', {
      tag: site.id, x: site.x, y: gy,
      by: this.mind?.owned ? this.npc : this.crab,
      label: site.relic.kind === 'amber' ? 'Amber' : site.relic.name,
      skill: 0.8 + this.economy.stat('fossil') * 0.25,
      onStroke: () => { this.terrain.deform(site.x, 2, 5); },
      onDone: (r) => {
        const res = this.digs.dig(site);
        if (!res.ok) return;
        this.relics = this.relics || {};
        this.relics[res.relic.id] = (this.relics[res.relic.id] || 0) + 1;
        this.terrain.deform(site.x, 6, 26);
        this.fx.digBurst(site.x, gy, 1.8, false);
        this.fx.spark(site.x, gy - 6,
          res.relic.kind === 'amber' ? '#eec66c' : '#c6bea7', 16, 40);
        const broken = r.quality < 0.55;
        this.fx.popup(site.x, gy - 14,
          broken ? `${res.relic.name} (cracked)` : res.relic.name,
          broken ? '#d8a09a' : '#dcd6c3');
        this.audio.play('discover');
        if (broken) {
          this.npc.say('You have broken it. It was eleven thousand years old and you have broken it.', 6);
        } else if (r.clean) {
          this.quests?.flag('cleanDig');
          this.npc.say(`Clean. Not a mark on it. ${res.relic.desc}`, 7);
        } else {
          this.npc.say(res.relic.desc, 7);
        }
        this.ui.say(`${res.relic.name}. K puts it in the basin.`, 6);
      },
    });
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
    // the further you have travelled with him, the more he has worked out
    const found = this.world.found.size;
    for (const l of VESS_LORE) if (found >= l.need) out.push(l.line);
    return out.slice(-6);
  }

  /**
   * One timed swing. The gauge decides what it was worth: on the band it does
   * damage, on the core it does a great deal of it and staggers the animal,
   * and off it entirely you are stood there with the claw open.
   */
  strike(dx = (this.crab.facing || 1), dy = 0) {
    const c = this.crab;
    const res = this.combat.strike(dx, dy);
    if (res.kind === 'early') return;
    if (res.kind === 'rolling') return;
    if (res.kind === 'spent') { this.ui.say('Winded.', 1.6); this.audio.play('deny'); return; }
    this.attackT = 0.4;
    if (!res.hit) {
      this.fx.popup(c.x, c.y - c.m.rx, 'wide', '#9a8a70');
      return;
    }
    this.renderer.modeHit(res.kind === 'crit' ? 1.1 : 0.5);
  }

  /**
   * Something bled. Gore is a spray of it in the direction it was hit from,
   * and a stain that stays on the sand afterwards, because a desert keeps
   * what you spill on it.
   */
  gore(c, power = 1, fromX = null) {
    if (!c) return;
    const dir = fromX === null ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(c.x - fromX) || 1;
    const col = c.def.blood || (c.def.clade === 'insect' || c.def.clade === 'arachnid'
      ? '#c8d07a' : '#8e1f22');
    this.fx.blood(c.x, c.y - 8, dir, power, col);
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

  /**
   * Who can actually put this one in the ground. A crab is a magnificent
   * animal with a claw the size of a door and no way at all to hold a seed
   * the size of a grain of sand, so most of the interesting plants need
   * somebody else: his hands, a real tool, or something that digs for a
   * living. Returns the worker, or why there isn't one.
   */
  plantWorker(def) {
    const req = def.hands;
    const there = this.npc && !this.npc.hidden && this.npc.alive !== false;
    const near = there && Math.abs(this.npc.x - this.crab.x) < 420;
    if (!req) {
      // anything you can do yourself, he will still do if he is on your back
      return { by: this.npc.riding ? this.npc : this.crab, ok: true };
    }
    if (req.by === 'hands') {
      if (!near) return { ok: false, why: `${req.why} Call him over (F).` };
      return { by: this.npc, ok: true };
    }
    if (req.by === 'tool') {
      const has = this.craft?.bag?.get('trowel') || this.craft?.bag?.get('copperpick')
        || this.craft?.bag?.get('ironpick');
      if (!has) return { ok: false, why: `${req.why} Make one at his bench.` };
      if (!near) return { ok: false, why: `${req.why} He has the tool - call him over (F).` };
      return { by: this.npc, ok: true };
    }
    if (req.by === 'digger') {
      const dig = this.wildlife.fleet.find((c) => c.alive
        && (c.def.role === 'digger' || c.def.role === 'forager' || c.def.dig));
      if (!dig) return { ok: false, why: `${req.why} You would need something of yours that digs.` };
      return { by: dig, ok: true };
    }
    return { by: this.crab, ok: true };
  }

  /**
   * Planting is not a purchase. You pick the bed and the seed, and then
   * somebody walks over, climbs up, opens the ground, puts it in and covers
   * it - and that takes the better part of ten seconds of real work you can
   * help with. What goes in is a seed, and a seed does nothing until it has
   * been watered.
   */
  tryPlant(id, plotIndex) {
    const def = FLORA_BY_ID[id];
    if (!def) return { ok: false, msg: 'No such seed.' };
    const plot = plotIndex !== undefined ? this.garden.plots[plotIndex] : this.garden.freeFor(def);
    if (!plot) return { ok: false, msg: def.needsPond ? 'No free pool bed.' : 'Nowhere left to put it.' };
    if (plot.pending) return { ok: false, msg: 'Something is already going in there.' };
    if (this.planting) return { ok: false, msg: 'One bed at a time.' };
    if (def.needsPond && this.garden.pond < 0.35) return { ok: false, msg: 'That one needs standing water.' };
    if (this.economy.water < def.cost) return { ok: false, msg: `Needs ${def.cost} water.` };
    if (plot.plant || plot.build) return { ok: false, msg: 'It will not take there.' };
    // and you have to actually have one. Nothing here is bought; a seed is a
    // thing you found, studied out of a wild plant, or saved off your own.
    if ((this.seeds[id] || 0) <= 0) {
      return { ok: false, msg: `No ${def.name} seed. Study a wild one.` };
    }

    const hand = this.plantWorker(def);
    if (!hand.ok) return { ok: false, msg: hand.why };

    this.economy.water -= def.cost;
    this.seeds[id] = (this.seeds[id] || 1) - 1;
    if (!this.seeds[id]) delete this.seeds[id];
    this.economy.markDirty();
    plot.pending = { id, def, by: hand.by };
    this.planting = { plot, def, by: hand.by, phase: 'coming', t: 0 };
    if (hand.by === this.npc) {
      this.npc.mode = 'follow';
      this.npc.keepAway = false;
      this.npc.say(`${def.name}. Right. Give me a moment to get up there.`, 4);
    }
    this.teach(3);
    return { ok: true, msg: `${def.name}: ${hand.by === this.npc ? 'he is on his way' : 'going in'}.` };
  }

  /** Cancel whatever is being planted and hand the water back. */
  stopPlanting(why) {
    const j = this.planting;
    if (!j) return;
    j.plot.pending = null;
    this.planting = null;
    if (this.work.live && this.work.job.kind === 'plant') this.work.stop(why);
    this.economy.water += j.def.cost;
    this.seeds[j.def.id] = (this.seeds[j.def.id] || 0) + 1;
    this.economy.markDirty();
    this.ui.say(why || 'Left it.', 3);
  }

  /**
   * The worker getting to the bed, and then doing the work. He has to climb
   * on, because the garden is on your back and he is a person.
   */
  _plantTick(dt) {
    const j = this.planting;
    if (!j) return;
    j.t += dt;
    const w = j.by;
    if (w === this.npc && (this.npc.hidden || this.mind?.owned)) {
      this.stopPlanting('He cannot do it like this.');
      return;
    }
    if (w && w.alive === false) { this.stopPlanting('It died on the way.'); return; }

    if (j.phase === 'coming') {
      if (w === this.crab) { j.phase = 'working'; return; }
      if (w === this.npc) {
        if (this.npc.riding) { j.phase = 'working'; return; }
        const room = this.crab.m.shellW * 0.5 + 18;
        this.npc.moveTo = this.crab.x + Math.sign(this.npc.x - this.crab.x || 1) * room;
        if (Math.abs(this.npc.x - this.crab.x) < room + 16) this.npc.board();
        // he is not going to jog for ever
        if (j.t > 30) this.stopPlanting('He never got there.');
        return;
      }
      // an animal of yours: it walks to you and that is close enough
      w.commanded = { x: this.crab.x };
      if (Math.abs(w.x - this.crab.x) < this.crab.m.shellW * 0.7) j.phase = 'working';
      else if (j.t > 30) this.stopPlanting('It never came.');
      return;
    }

    if (j.phase === 'working') {
      if (this.work.live) return;
      const pw = this.garden.plotWorld(j.plot);
      const plot = j.plot;
      this.work.begin('plant', {
        tag: 'plant:' + plot.i, x: pw.x, y: pw.y, by: w,
        label: j.def.name,
        skill: w === this.npc ? 1.25 : 1,
        onDone: (r) => {
          this.planting = null;
          plot.pending = null;
          const pl = this.garden.plant(plot.i, j.def.id);
          if (!pl) { this.ui.say('It would not take.', 3); return; }
          // a bed opened badly is a bed the plant starts behind in
          pl.health = 0.55 + r.quality * 0.45;
          this.fx.spark(pw.x, pw.y - 4, '#9ad86a', 16, 40);
          this.fx.popup(pw.x, pw.y - 12, r.clean ? 'well in' : 'in', '#cfe89a');
          if (this.garden.load > this.garden.capacity) this.ui.say('Overloaded.', 2.5);
          if (w === this.npc) {
            this.npc.say(r.clean
              ? 'In, and in properly. Now water it, or all of that was me digging a hole.'
              : 'In. Not my finest hole. Water it.', 6);
          } else {
            this.ui.say('In. Water it.', 5);
          }
          this.teach(4);
        },
      });
      j.phase = 'busy';
      return;
    }

    // busy: the work system owns it now, and if the job went away so did this
    if (j.phase === 'busy' && !this.work.live) this.planting = null;
  }

  /**
   * Watering a bed. Pour in the band and it soaks; pour badly and it runs off
   * the top of the hole and you have wasted it.
   */
  startWatering(plot) {
    if (!plot || !plot.plant) return;
    if (this.work.live) return;
    const need = plot.plant.soaked < 1;
    if (!need) { this.ui.say('That one has had enough.', 2); return; }
    if (this.economy.water < 8) { this.ui.say('Nothing in the basin to pour.', 2.5); return; }
    const pw = this.garden.plotWorld(plot);
    this.work.begin('water', {
      tag: 'water:' + plot.i, x: pw.x, y: pw.y,
      label: plot.plant.def.name,
      onStroke: (core) => {
        const pour = core ? 0.30 : 0.18;
        plot.plant.soaked = clamp01((plot.plant.soaked || 0) + pour);
        this.economy.water = Math.max(0, this.economy.water - (core ? 3 : 4));
        this.economy.markDirty();
      },
      onDone: () => {
        plot.plant.soaked = 1;
        plot.plant.thirst = 0;
        this.fx.splash(pw.x, pw.y, 8, 20);
        this.fx.popup(pw.x, pw.y - 12, 'soaked', '#9de3ee');
        this.audio.play('splash');
      },
    });
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
    if (u.study !== undefined) {
      const have = this.studied[def.id] || 0;
      if (have < u.study) {
        const n = u.study - have;
        missing.push(`study ${n} more wild ${n === 1 ? 'one' : 'ones'}`);
      }
    }
    return missing.length ? { ok: false, why: 'Unlocks when you ' + missing.join(', ') + '.' } : { ok: true, why: '' };
  }

  floraEffect(def) { return def.boonText || 'Fixes nutrients.'; }

  /** In plain words, what a creature is waiting for before it walks over. */
  /**
   * How strongly the thing this species actually comes for is on offer right
   * now. Berries for the birds, standing water for the reptiles, a flower in
   * bloom for the insects, shade for the small nocturnal things - each is
   * something already on your back, so putting a bird's bait out means growing
   * the plant a bird wants rather than buying a bird.
   */
  baitFor(def) {
    const l = this.taming.lureFor(def);
    const e = this.economy, gd = this.garden;
    switch (l.bait) {
      case 'berries': return clamp01(e.berries / Math.max(1, l.n)) * 0.9;
      case 'water': return gd.pond >= 0.3 ? clamp01(gd.pond * 1.4) * 0.9 : 0;
      case 'nectar': return clamp01(gd.bloom || gd.lushness * 1.6) * 0.8;
      case 'shade': return clamp01((gd.lushness || 0) * 2.2) * 0.7;
      default: return 0;
    }
  }

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

  /**
   * A seed on your back has taken up enough water to start. This is the first
   * thing in the game that is properly yours, so it gets a moment: the husk
   * splits, a ring goes out, and something green comes up out of it.
   */
  onGerminate(plot, pl) {
    const w = this.garden.plotWorld(plot);
    this.fx.ring(w.x, w.y - 1, '#b6de8f', 16);
    this.fx.spark(w.x, w.y - 2, '#cfe89a', 14, 34);
    this.fx.drift(w.x, w.y - 5, '#dff0c0', 3);
    this.fx.popup(w.x, w.y - 10, pl.def.name, '#b6de8f');
    this.audio.play('grow', { pitch: 1.2 });
    pl.pop = 1;
    this.teach(4);
  }

  /** Every stage up is a small pop, so growing is something you can see. */
  onPlantGrew(plot, pl) {
    const w = this.garden.plotWorld(plot);
    this.fx.spark(w.x, w.y - 3, '#cfe89a', 6, 22);
    this.audio.play('grow', { pitch: 0.9 + pl.stage * 0.12, vol: 0.5 });
    pl.pop = 1;
    if (pl.stage >= 3) {
      this.economy.recomputeGenes();
      this.fx.ring(w.x, w.y - 4, '#b6de8f', 15);
      this.fx.spark(w.x, w.y - 4, '#b6de8f', 12, 32);
      this.fx.popup(w.x, w.y - 12, 'mature', '#b6de8f');
    }
  }

  attraction(def) { return this.wildlife.attraction(def) * this.economy.stat('attract'); }
  nearestHostile(x, r) { return this.wildlife.nearestHostile(x, r); }

  // -- hooks ----------------------------------------------------------------

  onCreatureAttack(c) {
    const crab = this.crab;
    if (this.state !== 'play') return;
    if (Math.abs(c.x - crab.x) > 24 + crab.m.shellW * 0.34) return;
    if ((crab.iframe || 0) > 0) return;
    let dmg = c.def.dmg * (1 - this.economy.stat('armour'));
    // a roll, a raised claw, or a claw raised at exactly the right moment -
    // this is where the fight is actually decided
    const res = this.combat.incoming(dmg, c);
    dmg = res.dmg;
    if (res.kind === 'dodge' || res.kind === 'parry') { crab.iframe = 0.35; return; }
    crab.iframe = 0.55;
    if (dmg <= 0) return;
    crab.hp = Math.max(0, crab.hp - dmg);
    this.cam.shake(res.kind === 'block' ? 2 : 4);
    this.audio.play('hurt');
    this.fx.blood(crab.x + (c.x - crab.x) * 0.4, crab.y, 5);
    if (crab.hp <= 0) this.onDown();
  }

  onDown() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.ui.say('You pull in and stop.', 8);
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
        this.fx.popup(this.npc.x, this.npc.y - 26, 'noted', '#e2b74a');
        this.npc.say(c.def.notes[n] || '...', 6);
        this.audio.play('discover');
      }
    }
  }

  onGene(g) { this.ui.say(g.name, 3); this.economy.markDirty(); }
  onTamed(c) { this.economy.markDirty(); }
  onBoard() {}
  onSkill(s) { this.economy.markDirty(); }
  onEvolve(e) { this.ui.say(e.name, 3.5); this.economy.markDirty(); }
  onBuilt() { this.economy.markDirty(); }
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
        this.fx.popup(c.x, c.y - 12, c.name, '#c6bea7');
        this.npc.say(this._eulogy(c), 6);
      }
    } else if (mine) {
      this.fx.popup(c.x, c.y - 12, c.name, '#d08a7a');
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
    this.fx.popup(c.x, c.y - 10, `${c.def.name} hatched`, '#ffe9a8');
    this.economy.markDirty();
  }

  /**
   * Hand over a mode. Once only, with a card that stops long enough to be
   * read, because a new verb appearing silently in the corner is a verb
   * nobody ever presses.
   */
  unlock(id) {
    if (this.unlocked.has(id)) return false;
    const m = MODES.find((x) => x.need === id);
    if (!m) return false;
    this.unlocked.add(id);
    this.unlockCard = { m, t: 0 };
    this.audio?.play('evolve');
    this.cam.shake(3);
    return true;
  }

  /** The world reporting things that a mode is the answer to. */
  _checkUnlocks() {
    if (this.state !== 'play') return;
    // a claw, the moment anything is actually coming at you
    if (!this.unlocked.has('hunt') && this.wildlife.hostiles.some(
      (c) => Math.abs(c.x - this.crab.x) < 190)) this.unlock('hunt');
    // the gland, once you are carrying something to put in it
    if (!this.unlocked.has('spore') && (this.economy.parasites > 0
      || this.garden.plots.some((p) => p.plant?.def?.id === 'mindcap'))) this.unlock('spore');
    // and the two that were always skills
    if (!this.unlocked.has('hive') && this.economy.skills.has('command')) this.unlock('hive');
  }

  onFirstSighting(def) {
    if (!def.hostile) this.ui.say(`${def.name} - new`, 3);
  }
  onAmbush(def, n) {
    this.ui.say(n > 1 ? `${def.name} x${n}!` : `${def.name}!`, 2.5);
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
    this.ui.say(lm.name, 4);
    // he is the one who gets to be wordy about a place
    this.npc.say(lm.kind === 'oasis'
      ? `Water. Mark it: ${lm.name}. Eleven years of survey undone in an afternoon.`
      : `${lm.name}. ${kindLine}`, 6);
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
  onDusk() {}
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
      research: this.research, studied: this.studied,
      mode: this.ui.mode, insc: this.readInscriptions,
      green: this.green.toJSON(), pump: this.pump.toJSON(),
      digs: this.digs.toJSON(), relics: this.relics,
      mining: this.mining.toJSON(), craft: this.craft.toJSON(), mind: this.mind.toJSON(),
      combat: this.combat.toJSON(), quests: this.quests.save(),
      fountains: this.fountains.save(), unlocked: [...this.unlocked],
      fishing: this.fishing.save(),
    });
  }

  load(d) {
    try {
      // a save is loaded straight over a fresh run, which has already started
      // the opening - so the opening has to be torn down first
      this.clearCutscene();
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
      this.studied = d.studied || this.studied;
      this.readInscriptions = d.insc || 0;
      this.pump.fromJSON(d.pump);
      this.green.fromJSON(d.green);
      this.digs.fromJSON(d.digs);
      this.mining.fromJSON(d.mining);
      this.craft.fromJSON(d.craft);
      this.mind.fromJSON(d.mind);
      this.combat.fromJSON(d.combat);
      this.quests.load(d.quests);
      this.relics = d.relics || {};
      this.fountains.load(d.fountains);
      this.fishing.load(d.fishing);
      this.unlocked = new Set(d.unlocked || []);
      if (d.mode && this.ui.modeUnlocked(d.mode)) this.ui.mode = d.mode;
      else this.ui.mode = 'direct';
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
    // the sea, if there is one, replaces the sky before anything in it is drawn
    if (this.seaShowing) this.sea.drawColumn(ctx, cam, r.vw, r.vh);
    // the ground coming up out of the basin, drawn before the terrain so the
    // dunes in front of it hide their feet
    if (this.uplift) this._drawUplift(ctx, cam);
    this.world.drawProps(ctx, cam);
    this.terrain.draw(ctx, cam);
    this.world.drawWater(ctx, cam);
    if (this.state === 'play') this.fishing.draw(ctx, cam);
    this.terrain.drawSand(ctx, cam);
    this.green.drawGround(ctx, cam, this.terrain);
    this.world.drawProps2(ctx, cam, 'far');
    this.fountains.draw(ctx, cam);
    this.world.drawScatter(ctx, cam, 'far');
    // the giants go behind even the far reef: they are thirty metres up and
    // several hundred metres off, and everything on the bottom is in front
    if (this.seaShowing) this.sea.drawDeep(ctx, cam, r.vw, r.vh);
    if (this.seaShowing) this.sea.drawReef(ctx, cam, true);
    this.encounters.draw(ctx, cam);
    if (this.state === 'play') this.mining.draw(ctx, cam);
    this.critters.draw(ctx, cam);
    this.fx.draw(ctx, cam, 'far');

    // creatures behind the crab, then the crab, then whatever rides on it
    this.wildlife.draw(ctx, cam, 'ground');
    if (!this.npc.riding && !this.npc.hidden) this.npc.draw(ctx, cam);
    this._drawCrab(ctx, cam);
    if (this.npc.riding && !this.npc.hidden) this.npc.draw(ctx, cam);
    this._workMark(ctx, cam);
    if (this.state === 'title') this.menu.drawBottle(ctx, cam);
    if (this.lifeK) this._drawNewLife(ctx, cam);
    if (this.sleep) this._drawSleep(ctx, cam);
    if (this.waking) this._drawWaking(ctx, cam);
    if (this.bottle) this._drawBottle(ctx, cam);
    if (this.state === 'play') {
      this.mind.draw(ctx, cam);
      this.hive.drawAim(ctx, cam);
      // how far along you are with everything wild that is near you
      for (const q of this.wildlife.list) {
        if (cam.isVisible(q.x, q.y, 40)) q.drawTame?.(ctx, cam);
      }
    }
    this.ui.drawGhost(ctx, cam);
    this.wildlife.draw(ctx, cam, 'shell');
    if (this.state === 'play') this.ui.drawCrop(ctx, cam);
    this.fx.draw(ctx, cam, 'near');
    this.world.drawScatter(ctx, cam, 'near');
    this.world.drawProps2(ctx, cam, 'near');
    this.world.weeds.draw(ctx, cam);
    if (this.state === 'play') this.shallows.draw(ctx, cam, r.vw, r.vh);
    this.ending.drawWorld(ctx, cam, r.vw, r.vh);
    this._drawGreenPlants(ctx, cam);
    this._drawDigs(ctx, cam);
    if (this.seaShowing) { this.sea.drawReef(ctx, cam, false); this.sea.drawSwimmers(ctx, cam); }
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
    // the water is between you and the world, so it goes on after the world is
    // lit and before anything that is not in the water with you
    if (this.seaShowing) this.sea.overlay(ui, cam, r.vw, r.vh);
    if (this.state === 'play' || this.state === 'title') {
      this.fx.drawDust(ui, cam, r.vw, r.vh, this.weather);
    }
    if (this.state === 'play') this.hive.drawDream(ui, cam, r.vw, r.vh);
    // The title is not a separate screen. It is the world, with the weather
    // turned up and a menu laid over the top of it, so what you are looking at
    // on the front door is the animal you are about to play.
    if (this.lids > 0.002) this._drawLids(ui, r.vw, r.vh);
    if (this.state === 'title') { this.menu.draw(ui, r.vw, r.vh); }
    else if (this.state === 'intro' || this.state === 'burying') this._drawCutscene(ui, r);
    else if (this.state === 'prologue') this._drawPrologue(ui, r);
    if (this.state === 'title') { /* the menu is its own chrome */ }
    else if (this.state !== 'play' && this.state !== 'dead') this._drawCine(ui, r);
    else if (!this.talk.on && !this.puzzle.on && !this.ending.on) this.ui.draw(ui, r);
    this._drawSkip(ui, r);
    if (this.talk.fade > 0.01) this.talk.draw(ui, r.vw, r.vh);
    if (this.puzzle.fade > 0.01) this.puzzle.draw(ui, r.vw, r.vh);
    this.ending.drawUI(ui, r.vw, r.vh);
    this.fx.drawText(ui, cam, (c, t, x, y, o) => drawText(c, t, x, y, o));
    if (this.state === 'dead') this._drawDead(ui, r);
    // Anything that belongs to the WORLD stops at the edge of a screen. A
    // speech bubble floating over an open bench is the single thing that made
    // the panels read as an overlay somebody forgot to finish.
    const inside = this.ui.tree.dive > 0.4 || this.ui.drawer > 0.02
      || this.ui.paused || !!this.unlockCard;
    if (this.npc.speech && this.state === 'play' && !inside && !this.talk.on && !this.puzzle.on
      && !(this.ending.on && this.ending.t > 3) && !this.quests.chapterCard) this._drawSpeech(ui, cam, this.npc);
    r.dctx.drawImage(r.uiC, 0, 0, r.vw, r.vh, 0, 0, r.vw * r.scale, r.vh * r.scale);
  }

  /**
   * He has work, and you have none.
   *
   * There is no quest log in this game and no marker floating over a thing -
   * except this one, because the whole system runs through one man and a
   * player who never walks up to him never sees any of it. So when he has a
   * job waiting there is a mark over his hat: his own notebook, bobbing.
   */
  _workMark(ctx, cam) {
    if (this.state !== 'play' || this.npc.hidden || this.talk.on || this.coverShot) return;
    const q = this.quests;
    if (!q || q.active || !q.next()) return;
    if (!cam.isVisible(this.npc.x, this.npc.y, 60)) return;
    // clear of his hat, and small - it is a badge, not a billboard
    const s = cam.worldToScreen(this.npc.x, this.npc.y - 60);
    const p = Math.min(2, pxSize(cam.zoom));
    const bob = Math.sin(this.time * 3.2) * p;
    const x = Math.round(s.x), y = Math.round(s.y + bob);
    const W = 7 * p, H = 9 * p;
    const x0 = x - Math.round(W / 2), y0 = y - H;
    ctx.fillStyle = 'rgba(12,8,5,0.75)';
    ctx.fillRect(x0 - p, y0 - p, W + p * 2, H + p * 2);
    ctx.fillStyle = '#e8dcbc';
    ctx.fillRect(x0, y0, W, H);
    ctx.fillStyle = '#9a433d';
    ctx.fillRect(x0, y0, W, p);                       // the red board along its top
    ctx.fillStyle = 'rgba(58,47,30,0.55)';
    for (let r = 0; r < 3; r++) ctx.fillRect(x0 + p, y0 + p * (2 + r * 2), W - p * 2, p);
    // a tail, so the badge belongs to the man under it
    ctx.fillStyle = 'rgba(12,8,5,0.75)';
    ctx.fillRect(x - p, y0 + H + p, p * 2, p * 2)
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
  /**
   * A dig site is not a marker. It is the end of something sticking out of
   * the ground - a bone, the lip of a shell, a nodule of amber - with the
   * sand heaped up round where it broke the surface, and a shadow under the
   * overhang. The deeper it is, the less of it there is to see.
   */
  _drawDigs(ctx, cam) {
    const power = this.economy.stat('fossil');
    for (const site of this.digs.near(this.crab.x, 520)) {
      if (site.deep > 0.55 && power < 2) continue;
      const y = this.terrain.surfaceY(site.x);
      const s = cam.worldToScreen(site.x, y);
      const z = cam.zoom;
      const kind = site.relic.kind;
      const amber = kind === 'amber';
      // how proud of the sand it sits
      const out = (1 - site.deep) * 0.8 + 0.2;
      const w = (5.0 + out * 3.4) * z;
      const h = (3.0 + out * 2.6) * z;

      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));

      // the sand heaped round it, wider than the thing itself. Everything in
      // here is stamped on the world's own pixel grid - a fossil half out of
      // the sand next to a dithered dune should not be the one smooth,
      // anti-aliased shape on the screen.
      const pp = pxSize(z);
      // A heap, not a disc: the sand only exists above the ground line, so it
      // is clipped flat at the bottom and lit along the top. A whole ellipse
      // lying on the sand just reads as a circle someone drew there.
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w * 2, -h * 2, w * 4, h * 2 + 1);
      ctx.clip();
      pxEllipse(ctx, 0, 1, w * 1.45, h * 0.86, 'rgba(186,152,100,0.5)', { p: pp, soft: 0.45 });
      pxEllipse(ctx, -w * 0.18, 1, w * 1.05, h * 0.66, 'rgba(214,184,130,0.45)', { p: pp, soft: 0.4 });
      ctx.restore();
      // the shadow the heap casts along its own foot
      ctx.fillStyle = 'rgba(120,92,56,0.26)';
      ctx.fillRect(Math.round(-w * 1.3), 0, Math.round(w * 2.6), Math.max(1, Math.round(z * 0.6)));

      // and the thing itself, clipped at the sand line
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w * 2, -h * 3, w * 4, h * 3 + 1);
      ctx.clip();
      if (amber) {
        // a nodule in three bands, lit from the top left, with a dark core
        pxEllipse(ctx, 0, -h * 0.15, w * 0.85, h * 0.95, '#8a5a14', { p: pp });
        pxEllipse(ctx, -w * 0.05, -h * 0.30, w * 0.66, h * 0.72, '#d79a2a', { p: pp });
        pxEllipse(ctx, -w * 0.20, -h * 0.52, w * 0.34, h * 0.38, '#fae19f', { p: pp });
        pxEllipse(ctx, w * 0.25, -h * 0.10, w * 0.16, h * 0.22, 'rgba(60,34,6,0.55)', { p: pp });
      } else if (site.relic.id === 'vertebra') {
        // a bone end: a shaft with two knobs on it
        pxEllipse(ctx, -w * 0.42, -h * 0.50, w * 0.36, h * 0.42, '#cdc4ab', { p: pp });
        pxEllipse(ctx, w * 0.42, -h * 0.32, w * 0.30, h * 0.36, '#cdc4ab', { p: pp });
        ctx.fillStyle = '#b3a88d';
        ctx.beginPath();
        ctx.moveTo(-w * 0.42, -h * 0.72);
        ctx.lineTo(w * 0.42, -h * 0.54);
        ctx.lineTo(w * 0.42, -h * 0.1);
        ctx.lineTo(-w * 0.42, -h * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(60,50,34,0.4)';
        ctx.fillRect(Math.round(-w * 0.42), Math.round(-h * 0.34), Math.round(w * 0.84), Math.max(1, Math.round(z * 0.5)));
        // and the grain of it
        ctx.fillStyle = 'rgba(255,250,235,0.35)';
        ctx.fillRect(Math.round(-w * 0.3), Math.round(-h * 0.62), Math.round(w * 0.5), Math.max(1, Math.round(z * 0.4)));
      } else {
        // A coiled shell, half of it still in the sand. It is a solid object
        // with ribs cut across it and a lip that catches the light - a thin
        // ring of outline out here just reads as a circle drawn on the ground.
        pxEllipse(ctx, 0, -h * 0.30, w * 0.92, h * 0.86, '#7d7663', { p: pp });
        pxEllipse(ctx, -w * 0.06, -h * 0.38, w * 0.78, h * 0.72, '#9a927e', { p: pp });
        pxEllipse(ctx, -w * 0.16, -h * 0.52, w * 0.46, h * 0.44, '#b8b09a', { p: pp });
        // the whorl: a darker eye where the coil goes in
        pxEllipse(ctx, -w * 0.10, -h * 0.44, w * 0.20, h * 0.20, '#655e4e', { p: pp });
        // the ribs, running out from the whorl to the rim. Thin - a rib at the
        // full pixel size is a black bar and the shell stops being a shell.
        const rp = Math.max(1, Math.round(z * 0.5));
        for (let k = 0; k < 6; k++) {
          const a = Math.PI * 1.02 + k * 0.36;
          pxLine(ctx, -w * 0.10 + Math.cos(a) * w * 0.24, -h * 0.40 + Math.sin(a) * h * 0.22,
            -w * 0.10 + Math.cos(a) * w * 0.92, -h * 0.40 + Math.sin(a) * h * 0.86,
            'rgba(96,88,70,0.40)', { p: rp });
        }
        // and the lip, lit along the top edge
        pxArc(ctx, 0, -h * 0.30, Math.max(w, h), Math.PI * 1.08, TAU * 0.96, '#e0d8c2',
          { p: pp, rx: w * 0.92, ry: h * 0.86, thick: pp });
      }
      ctx.restore();

      // a shadow in the hollow the sand makes round it
      ctx.globalAlpha = 0.35;
      pxEllipse(ctx, 0, 0, w * 0.95, Math.max(1, h * 0.22), 'rgba(60,44,26,0.6)', { p: pp, soft: 0.4 });
      ctx.globalAlpha = 1;
      ctx.restore();

      if (amber) {
        // amber catches the light, which is how you spot it from a way off
        const tw = 0.5 + 0.5 * Math.sin(this.time * 2.6 + site.ci);
        ctx.globalAlpha = 0.18 + tw * 0.34;
        pxGlow(ctx, s.x, s.y - h * 0.5, w * 3, '#fae19f', 0.9, { p: pxSize(z), steps: 3 });
        ctx.globalAlpha = 1;
      }
      if (Math.abs(site.x - this.crab.x) < 40) {
        // on a phone there is no E, and the ACT plate is already saying it -
        // so the only thing worth writing over the hole is the bad news
        const touch = this.ui?.touchEnabled;
        const label = power ? (touch ? null : 'E to dig') : 'you would need a digging claw';
        if (label) {
          drawText(ctx, label, s.x, s.y - 18 * z, { color: '#dcd6c3', align: 'center' });
        }
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

  /**
   * The yellow line. It is the first water to land on this animal in a
   * thousand years and the whole game turns on it, so it gets drawn properly:
   * an arc with weight to it, a bright core, and a wet patch where it lands.
   */
  /**
   * The stream.
   *
   * It used to be four stroked beziers whose clock ticked inside the draw,
   * anchored to the wrong side of him, which meant it hung in the air when the
   * frame stalled and came out of his back when he turned round. It is drops
   * now: real ones, with velocity, that leave him, arc, land on the shell,
   * splash and steam, and stop existing when the beat is over. The clock lives
   * in update with everything else's.
   */
  /**
   * THE BOTTLE.
   *
   * He has been sitting on this rock every evening for eleven years, and what
   * he does while he sits on it is drink. So the thing that wakes the animal
   * after a thousand years is not geology and it is not rain: it is a man
   * throwing an empty bottle over his shoulder without looking, and the bottle
   * bouncing off the rock, and the rock turning out to have been listening.
   *
   * It is a real object - thrown, spinning, under gravity - so where it lands
   * is not scripted and the clonk happens when it actually happens.
   */
  throwBottle(from, dir = -1, opts = {}) {
    this.bottle = {
      x: from.x, y: from.y - 20,
      vx: dir * (opts.vx ?? 52), vy: opts.vy ?? -215,
      spin: dir * (7 + Math.random() * 3), a: 0, rest: 0, hit: 0,
    };
    this.audio?.play('claw', { pitch: 1.6 });
  }

  _bottleTick(dt) {
    const bo = this.bottle;
    if (!bo) return;
    if (bo.rest > 0) {
      bo.rest += dt;
      if (bo.rest > 14) this.bottle = null;
      return;
    }
    bo.vy += 620 * dt;
    bo.x += bo.vx * dt;
    bo.y += bo.vy * dt;
    bo.a += bo.spin * dt;

    // the shell, which is what it is meant to hit
    const c = this.crab;
    const rx = c.m ? c.m.rx : 16;
    const shellTop = c.y - rx * 0.62;
    if (!bo.hit && bo.vy > 0 && Math.abs(bo.x - c.x) < rx * 1.05 && bo.y >= shellTop) {
      bo.hit = 1;
      bo.y = shellTop;
      bo.vy = -bo.vy * 0.42;
      bo.vx = (bo.vx + (bo.x < c.x ? -30 : 30)) * 0.6;
      bo.spin *= 1.4;
      this.audio?.play('hit', { pitch: 1.5 });
      this.audio?.play('ui', { pitch: 1.8 });
      this.cam?.shake(2.4);
      this.fx?.spark(bo.x, shellTop, '#e8d7a8', 7, 30);
      this.onBottleHit?.();
      return;
    }
    const gy = this.terrain.surfaceY(bo.x);
    if (bo.y >= gy) {
      bo.y = gy;
      if (Math.abs(bo.vy) > 80) {
        bo.vy = -bo.vy * 0.34;
        bo.vx *= 0.5;
        bo.spin *= 0.5;
        this.audio?.play('ui');
        this.fx?.dust(bo.x, gy, 0.4);
      } else {
        bo.rest = 0.001;
        bo.vx = 0; bo.vy = 0;
        bo.a = Math.PI / 2;
      }
    }
  }

  /** Brown glass, a paler neck, a label, and one highlight down the side. */
  _drawBottle(ctx, cam) {
    const bo = this.bottle;
    if (!bo) return;
    const s = cam.worldToScreen(bo.x, bo.y);
    const z = cam.zoom;
    ctx.save();
    ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.scale(z, z);
    ctx.rotate(bo.a);
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(-2, -6.5, 4, 8);
    ctx.fillStyle = '#5a3a16';
    ctx.fillRect(-1.5, -5, 3, 6);
    ctx.fillStyle = '#7a5220';
    ctx.fillRect(-0.8, -8, 1.6, 3);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(-1.5, -3.4, 3, 1.6);
    ctx.fillStyle = 'rgba(255,240,200,0.5)';
    ctx.fillRect(-1.2, -4.6, 0.7, 4);
    ctx.restore();
  }

  /**
   * The animal, and - while it is digging itself in - only as much of it as is
   * still above the sand. It goes down; the ground does not come up.
   */
  _drawCrab(ctx, cam) {
    const b = this.buried || 0;
    if (b <= 0.001) { this.crab.draw(ctx, cam, this.garden); return; }
    const gy = this.terrain.surfaceY(this.crab.x);
    const line = cam.worldToScreen(this.crab.x, gy).y;
    const drop = b * this.crab.m.rx * 1.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.renderer.vw, line + 2);
    ctx.clip();
    ctx.translate(0, drop * cam.zoom);
    this.crab.draw(ctx, cam, this.garden);
    ctx.restore();
    // sand banked up against whatever is left showing
    if (b > 0.2) {
      const s = cam.worldToScreen(this.crab.x, gy);
      const w = this.crab.m.rx * 1.5 * cam.zoom;
      ctx.globalAlpha = clamp01((b - 0.2) * 1.6);
      const g = ctx.createLinearGradient(0, s.y - 8 * cam.zoom, 0, s.y + 4 * cam.zoom);
      g.addColorStop(0, '#d8b98a');
      g.addColorStop(1, '#a8875a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(s.x - w, s.y + 2);
      ctx.quadraticCurveTo(s.x - w * 0.4, s.y - 6 * cam.zoom * b, s.x, s.y - 7 * cam.zoom * b);
      ctx.quadraticCurveTo(s.x + w * 0.4, s.y - 6 * cam.zoom * b, s.x + w, s.y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** The prologue's only chrome: what you can do, and a button to do it. */
  _drawPrologue(ctx, r) {
    const vw = r.vw, vh = r.vh;
    const bar = Math.round(18 * clamp01(this._proT / 2));
    ctx.fillStyle = 'rgba(4,10,14,0.8)';
    ctx.fillRect(0, 0, vw, bar);
    ctx.fillRect(0, vh - bar, vw, bar);
    if (this.dialog) {
      const lines = wrapText(this.dialog.text, vw - 60);
      const cps = 48;
      const shown = Math.floor(this.dialog.t * cps);
      let used = 0;
      lines.forEach((l, i) => {
        const room = Math.max(0, shown - used);
        used += l.length;
        const ty = vh - bar - lines.length * LINE_H - (this.ui.touchEnabled ? 46 : 10);
        drawText(ctx, l.slice(0, room), 26, ty + i * LINE_H,
          { color: 'rgba(232,244,248,0.9)', outline: true, outlineColor: 'rgba(0,0,0,0.7)' });
      });
    }
    if (this._proT > 3) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 3);
      const label = this.ui.touchEnabled ? 'tap DIG IN to lie down' : 'walk with A / D    press E to dig in';
      ctx.globalAlpha = 0.55 + pulse * 0.45;
      drawText(ctx, label, vw / 2, bar + 6,
        { color: '#cfeef6', align: 'center', outline: true, outlineColor: 'rgba(0,0,0,0.7)' });
      ctx.globalAlpha = 1;
    }
    this.ui.drawPrologueControls(ctx, vw, vh);
  }

  /**
   * What he says, on a page out of his own notebook. This is the one piece
   * of interface the game uses constantly, so it is not a rounded rectangle:
   * it is cream paper with a ruled margin, a torn lower edge, his face pinned
   * to it behind brass tacks, and a dog-eared corner pointing at whoever is
   * talking. Tapped code gets the same card in ink-blue, because a signal is
   * still something written down.
   */
  _drawSpeech(ctx, cam, who, code = false) {
    const s = cam.worldToScreen(who.x, who.y - 40);
    // his face goes on the card at four times his walking size: the whole
    // point of a close-up is that you can see what he thinks of you
    // His face on the card is his own portrait, cropped to the head - a card
    // two words wide has no room for shoulders, and the head is the part you
    // are reading anyway.
    // A card that appears whole is a caption. A card that fills in is a man
    // saying something, so the line arrives a letter at a time out here too,
    // and his jaw moves for exactly as long as letters are still arriving.
    const age = code ? 99 : (who.speechAge || 0);
    const CPS = 34;
    const said = code ? 1e9 : Math.floor(Math.max(0, age - 0.10) * CPS);
    const talking = !code && said < (who.speech || '').length;
    const port = !code && who.portrait ? who.portrait(1, talking) : null;
    const pw = port ? 40 : 0;
    const lines = wrapText(who.speech, 132 - (port ? pw + 6 : 0));
    const w = Math.max(...lines.map((l) => textWidth(l))) + 14 + (port ? pw + 6 : 0);
    // The card is at least as tall as he is. The window used to be cropped
    // tight to his face, which meant a card of him talking was a pair of
    // eyes: the hat, the pack strap and what his shoulders are doing are all
    // part of what he is saying.
    const h = Math.max(lines.length * LINE_H + 10, port ? 56 : 0);
    const x = clamp(Math.round(s.x - w / 2), 3, this.renderer.vw - w - 3);
    const y = clamp(Math.round(s.y - h), 3, this.renderer.vh - h - 12);
    const tailX = clamp(Math.round(s.x), x + 8, x + w - 8);

    // A yell is not a bigger page - it is a different one: hot paper, a hard
    // red edge, and the whole card shaking on the spot.
    const shout = !code && who.shout > 0;
    const PAPER = code ? '#0e2226' : shout ? '#f6e0c4' : '#e9dcbc';
    const SHADE = code ? '#0a1a1d' : shout ? '#e0b48e' : '#d2c29c';
    const INKC = code ? '#8fe0cc' : shout ? '#7a1c12' : '#2a2016';
    const RULE = code ? 'rgba(143,224,204,0.20)' : 'rgba(42,32,22,0.13)';
    const EDGE = code ? 'rgba(143,224,204,0.55)' : shout ? '#c8402e' : 'rgba(92,70,44,0.75)';
    if (shout) {
      // it jitters, and the jitter dies down as the line runs out
      const k = clamp01(who.speechT / 1.2);
      ctx.save();
      ctx.translate(Math.round(Math.sin(this.time * 47) * 2 * k),
        Math.round(Math.cos(this.time * 39) * 1.6 * k));
    }

    // the dog-ear pointing at the speaker, drawn first so the page covers its root
    ctx.fillStyle = SHADE;
    ctx.beginPath();
    ctx.moveTo(tailX - 5, y + h - 2);
    ctx.lineTo(tailX + 5, y + h - 2);
    ctx.lineTo(tailX + (code ? 0 : 3), y + h + 7);
    ctx.closePath();
    ctx.fill();

    // the page, with a shadow under it and a torn bottom edge
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x + 2, y + 3, w, h);
    ctx.fillStyle = PAPER;
    ctx.fillRect(x, y, w, h);
    // torn: a row of one-pixel bites along the bottom
    for (let i = 0; i < w; i += 2) {
      const bite = (i * 37 % 5) < 2 ? 1 : 0;
      if (bite) { ctx.fillStyle = SHADE; ctx.fillRect(x + i, y + h - 1, 2, 1); }
    }
    ctx.strokeStyle = EDGE;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    let tx = x + 7;
    if (port) {
      // his face, pinned to the page behind four brass tacks
      const ph = Math.min(54, h - 4);
      const px = x + 4, py = y + 4;
      ctx.save();
      ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
      ctx.fillStyle = code ? '#0a1a1d' : '#c8b590';
      ctx.fillRect(px, py, pw, ph);
      // the window lands on the top of his hat and runs down past his collar
      ctx.drawImage(port.cv, Math.round(px + pw / 2 - port.ox),
        Math.round(py + ph * 0.40 - port.oy));
      ctx.restore();
      ctx.strokeStyle = 'rgba(60,44,26,0.55)';
      ctx.strokeRect(px - 0.5, py - 0.5, pw + 1, ph + 1);
      ctx.fillStyle = code ? '#5fbfae' : '#c9a24a';
      for (const [tx2, ty2] of [[px, py], [px + pw - 1, py], [px, py + ph - 1], [px + pw - 1, py + ph - 1]]) {
        ctx.fillRect(tx2 - 1, ty2 - 1, 2, 2);
      }
      tx = px + pw + 6;
    }
    // the ruled margin the text is written against, and a faint rule per line
    ctx.fillStyle = code ? 'rgba(143,224,204,0.35)' : 'rgba(150,52,42,0.45)';
    ctx.fillRect(tx - 3, y + 3, 1, h - 6);
    ctx.fillStyle = RULE;
    lines.forEach((l, i) => ctx.fillRect(tx, y + 5 + i * LINE_H + 8, w - (tx - x) - 6, 1));
    // only as much of it as he has actually got out
    let left = said;
    lines.forEach((l, i) => {
      if (left <= 0) return;
      const cut = l.slice(0, left);
      left -= l.length;
      drawText(ctx, cut, tx, y + 6 + i * LINE_H, { color: INKC });
    });
    if (shout) {
      // spikes round the card, so it reads as loud with the sound off
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const a3 = (i / 14) * TAU + this.time * 0.6;
        const ex = x + w / 2 + Math.cos(a3) * (w / 2 + 2);
        const ey = y + h / 2 + Math.sin(a3) * (h / 2 + 2);
        const ex2 = x + w / 2 + Math.cos(a3) * (w / 2 + 6);
        const ey2 = y + h / 2 + Math.sin(a3) * (h / 2 + 6);
        ctx.beginPath();
        ctx.moveTo(Math.round(ex), Math.round(ey));
        ctx.lineTo(Math.round(ex2), Math.round(ey2));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * What makes a cutscene look like one: a vignette that closes the corners
   * down, the black we cut through between acts, and the card that is held on
   * that black. Drawn over everything, including the letterbox, so a cut is a
   * real cut and not a dimmer switch.
   */
  _drawCine(ctx, r) {
    const vw = r.vw, vh = r.vh;
    // vignette: the corners of a frame someone is pointing at something
    const g = ctx.createRadialGradient(vw / 2, vh * 0.48, Math.min(vw, vh) * 0.22,
      vw / 2, vh * 0.48, Math.max(vw, vh) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(6,4,3,0.46)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    if (this.fade > 0.002) {
      ctx.globalAlpha = clamp01(this.fade);
      ctx.fillStyle = '#050403';
      ctx.fillRect(0, 0, vw, vh);
      ctx.globalAlpha = 1;
    }
    const card = this.card;
    if (card && this.fade > 0.4) {
      // the title holds still while the black does the moving
      const a = clamp01(card.t / 0.7) * clamp01((this.fade - 0.4) / 0.3);
      ctx.globalAlpha = a;
      drawText(ctx, card.text, vw / 2, Math.round(vh / 2 - 14),
        { color: '#e8d9b4', align: 'center', scale: 2 });
      // a rule under it, drawn out from the middle
      const w = Math.round(textWidth(card.text, 2) * clamp01((card.t - 0.35) / 0.8));
      ctx.fillStyle = 'rgba(226,183,74,0.55)';
      ctx.fillRect(Math.round(vw / 2 - w / 2), Math.round(vh / 2 + 4), w, 1);
      if (card.sub) {
        ctx.globalAlpha = a * clamp01((card.t - 0.9) / 0.7) * 0.75;
        drawText(ctx, card.sub, vw / 2, Math.round(vh / 2 + 12),
          { color: '#b8a683', align: 'center' });
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * SKIP.
   *
   * There was a skip before this, but it was a line of faint grey text saying
   * what you could press, and a rule that any tap in the top of the frame
   * counted - which meant it was invisible on a phone and went off by accident
   * on a desk. A thing you are allowed to do needs somewhere to press.
   *
   * It sits under the top letterbox, out of the picture, and it is offered for
   * every scene that is not the game itself - the prologue included, because
   * the fourth time you see the sea you have seen the sea.
   */
  _skipBox(r) {
    const w = 62, h = 17;
    const bar = Math.round(24 * (this.letterbox || 0));
    return { x: r.vw - w - 8, y: bar + 8, w, h };
  }

  _drawSkip(ctx, r) {
    if (this.state === 'play' || this.state === 'dead' || this.state === 'title') {
      this.skipRect = null;
      return;
    }
    const b = this._skipBox(r);
    this.skipRect = b;
    const i = this.input;
    const hot = i.sx >= b.x && i.sx <= b.x + b.w && i.sy >= b.y && i.sy <= b.y + b.h;
    drawPlate(ctx, b.x, b.y, b.w, b.h, {
      mat: 'stone', edge: hot ? '#e2b74a' : 'rgba(226,200,150,0.35)', top: hot ? 1 : undefined,
    });
    drawText(ctx, 'SKIP  >>', b.x + b.w / 2, b.y + 5,
      { color: hot ? '#f7ecd0' : 'rgba(230,214,180,0.72)', align: 'center' });
  }

  _drawCutscene(ctx, r) {
    const bar = Math.round(24 * this.letterbox);
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
