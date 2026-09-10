// CRABDEN - the archaeologist's curriculum, plus the story milestones that
// fire for the rest of the game.

import { getScene } from '../cutscenes/script.js';

const STEPS = [
  {
    id: 'pump',
    title: 'Make water',
    hint: 'Click and hold the glowing organ on your back (or hold F).',
    touchHint: 'Hold the PUMP button, bottom right.',
    scene: 'tutWater',
    enter: (g) => { g.pell.followCrab(true); g.pell.point(g.crab); },
    check: (g) => g.crab.water >= 5,
  },
  {
    id: 'pour',
    title: 'Water the sand',
    hint: 'Hold right mouse (or Q) on bare ground to pour.',
    touchHint: 'Hold POUR. Water lands just in front of you.',
    scene: 'tutPour',
    check: (g) => g.eco.cells.size > 6,
  },
  {
    id: 'moss',
    title: 'Grow moss',
    hint: 'Keep a wet patch wet. Moss finds it on its own.',
    touchHint: 'Keep a wet patch wet. Moss finds it on its own.',
    check: (g) => g.eco.plants.some((p) => p.type === 'moss' && p.growth > 0.85 && !p.dead),
    onDone: (g) => { g.tutorial.lastPlant = g.eco.plants.find((p) => p.type === 'moss' && p.growth > 0.85); },
    doneScene: 'tutMoss',
  },
  {
    id: 'berry',
    title: 'Grow a berry bush',
    hint: 'Water ground that already has grown moss on it.',
    touchHint: 'Water ground that already has grown moss on it.',
    scene: 'tutBerry',
    check: (g) => g.eco.plants.some((p) => p.type === 'berry' && p.growth > 0.85 && !p.dead),
  },
  {
    id: 'bird',
    title: 'Attract a bird',
    hint: 'Ripe berries bring birds. Wait, or plant more bushes.',
    touchHint: 'Ripe berries bring birds. Wait, or plant more bushes.',
    check: (g) => g.creatures.some((c) => c.sp.form === 'bird' && !c.dead),
    onDone: (g) => { g.tutorial.lastBird = g.creatures.find((c) => c.sp.form === 'bird' && !c.dead); },
    doneScene: 'tutBird',
  },
  {
    id: 'harvest',
    title: 'Pick some berries',
    hint: 'Stand next to a ripe bush and press H. Birds want paying.',
    touchHint: 'Stand by a ripe bush and tap the round PICK button.',
    check: (g) => (g.res.food || 0) >= 1,
  },
  {
    id: 'tame',
    title: 'Befriend the bird',
    hint: 'Walk close to it and press T to offer berries.',
    touchHint: 'Walk up to it and tap the round TAME button.',
    check: (g) => g.creatures.some((c) => c.tamed && !c.dead),
  },
  {
    id: 'work',
    title: 'Give it a job',
    hint: 'Open your companions with C and assign a task.',
    touchHint: 'Tap the menu button, then PALS, and give it a job.',
    check: (g) => g.creatures.some((c) => c.tamed && c.work),
  },
  {
    id: 'evolve',
    title: 'Evolve',
    hint: 'Press E and spend nutrients on your first trait.',
    touchHint: 'Tap the menu button, then EVO, and spend nutrients.',
    scene: 'tutEvolve',
    check: (g) => g.evo.unlocked.size > 0,
  },
  {
    id: 'night',
    title: 'Survive the night',
    hint: 'Click yourself to take control. Left click swings your claw.',
    touchHint: 'The stick walks you. The first square button swings your claw.',
    scene: 'tutNight',
    enter: (g) => { g.pell.followCrab(false); },
    startWhen: (g) => g.weather.isNight,
    check: (g) => !g.weather.isNight && g.weather.hour > 7,
  },
  {
    id: 'explore',
    title: 'Find an oasis',
    hint: 'Leave the grove. Look for green on the horizon.',
    touchHint: 'Leave the grove. Look for green on the horizon.',
    check: (g) => g.world.pois.some((p) => p.kind === 'oasis' && p.discovered),
  },
];

const MILESTONES = [
  { id: 'firstOasis', scene: 'firstOasis', once: true, check: (g) => g.world.pois.some((p) => p.kind === 'oasis' && p.discovered) },
  { id: 'monolith', scene: 'monolith', once: true, check: (g) => g.world.pois.some((p) => p.kind === 'monolith' && p.discovered) },
  { id: 'wreck', scene: 'wreck', once: true, check: (g) => g.world.pois.some((p) => p.kind === 'wreck' && p.discovered) },
  { id: 'well', scene: 'well', once: true, check: (g) => g.world.pois.some((p) => p.kind === 'well' && p.discovered) },
  { id: 'nautilus', scene: 'nautilus', once: true, check: (g) => g.creatures.some((c) => c.sp.id === 'nautilus' && c.tamed) },
  { id: 'ending', scene: 'ending', once: true, check: (g) => g.eco.tier.t >= 6 },
];

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.index = 0;
    this.active = true;
    this.started = false;
    this.done = new Set();
    this.fired = new Set();
    this.lastPlant = null;
    this.lastBird = null;
    this.lastPoi = null;
    this.cooldown = 0;
    this.goalFlash = 0;
  }

  get step() { return this.active ? STEPS[this.index] : null; }

  begin() {
    this.started = true;
    this.index = 0;
    this._enterStep();
  }

  _enterStep() {
    const s = this.step;
    if (!s) { this.active = false; this.game.onTutorialComplete?.(); return; }
    this.pendingStart = true;
  }

  update(dt, game) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.goalFlash = Math.max(0, this.goalFlash - dt);
    if (game.state !== 'play') return;

    // milestones run forever
    for (const m of MILESTONES) {
      if (this.fired.has(m.id)) continue;
      if (m.check(game)) {
        this.fired.add(m.id);
        if (m.id === 'firstOasis' || m.id === 'well' || m.id === 'monolith' || m.id === 'wreck') {
          this.lastPoi = game.world.pois.find((p) =>
            (m.id === 'firstOasis' ? p.kind === 'oasis' : p.kind === m.id) && p.discovered) || null;
        }
        const sc = getScene(m.scene, game);
        if (sc) { game.cutscene.play(sc); return; }
      }
    }

    if (!this.active || !this.started) return;
    const s = this.step;
    if (!s) return;

    if (this.pendingStart) {
      if (s.startWhen && !s.startWhen(game)) return;
      this.pendingStart = false;
      if (s.enter) s.enter(game);
      this.goalFlash = 1.2;
      if (s.scene) {
        const sc = getScene(s.scene, game);
        if (sc) { game.cutscene.play(sc); return; }
      }
    }

    if (this.cooldown > 0) return;
    if (s.check(game)) {
      this.done.add(s.id);
      if (s.onDone) s.onDone(game);
      game.audio.play('uiBig');
      game.notify('Objective complete: ' + s.title, 'good');
      this.index++;
      this.cooldown = 0.6;
      const next = () => this._enterStep();
      if (s.doneScene) {
        const sc = getScene(s.doneScene, game);
        if (sc) { game.cutscene.play(sc, next); return; }
      }
      next();
    }
  }

  serialize() {
    return { index: this.index, active: this.active, started: this.started, done: [...this.done], fired: [...this.fired] };
  }
  deserialize(d) {
    if (!d) return;
    this.index = d.index || 0;
    this.active = d.active !== false;
    this.started = !!d.started;
    this.done = new Set(d.done || []);
    this.fired = new Set(d.fired || []);
    this.pendingStart = false;
  }
}

export { STEPS, MILESTONES };
