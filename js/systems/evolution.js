// CRABDEN - the evolution tree.
//
// Six branches. Unlocking a node is permanent; ACTIVE abilities still have to
// be slotted, and slots are scarce, so two players with the same tree can play
// very differently.

import { clamp } from '../lib/math.js';
export const BRANCHES = [
  { id: 'hydro',  name: 'Hydrology',  short: 'HYDRO', color: '#5fc8dc', x: 30,  blurb: 'Make water. Keep water. Throw water.' },
  { id: 'shell',  name: 'Carapace',   short: 'SHELL', color: '#e0a05c', x: 82, blurb: 'Get bigger. Get harder to eat.' },
  { id: 'claw',   name: 'Claws',      short: 'CLAWS', color: '#e2685c', x: 134, blurb: 'The pointy end of the food chain.' },
  { id: 'loco',   name: 'Locomotion', short: 'LEGS',  color: '#9fd45c', x: 186, blurb: 'Legs, and what to do with them.' },
  { id: 'symb',   name: 'Symbiosis',  short: 'BONDS', color: '#c58fd8', x: 238, blurb: 'Other animals, and how to make them like you.' },
  { id: 'mut',    name: 'Mutation',   short: 'MUTATE',color: '#8fe0b0', x: 290, blurb: 'The parts of you that nobody can explain.' },
];

const N = [];
const node = (o) => { N.push(o); return o; };

// --- HYDROLOGY -------------------------------------------------------------
node({ id: 'h1', b: 'hydro', tier: 0, name: 'Second Gland', cost: { nutrients: 8 },
  desc: 'A second water gland buds off the first. Production doubles. It also gurgles.',
  add: { waterRate: 0.2 } });
node({ id: 'h2', b: 'hydro', tier: 1, name: 'Deeper Bladder', req: ['h1'], cost: { nutrients: 18 },
  desc: 'Store more. Slosh audibly when you walk.', add: { waterMax: 22 } });
node({ id: 'h3', b: 'hydro', tier: 2, name: 'Pressure Pump', req: ['h2'], cost: { nutrients: 34 },
  desc: 'Pumping the organ is far more efficient. Your shell creaks alarmingly.',
  mul: { pumpMult: 1.8 }, add: { vigorEff: 0.4 } });
node({ id: 'h4', b: 'hydro', tier: 2, name: 'Osmotic Skin', req: ['h2'], cost: { nutrients: 30, salt: 4 },
  desc: 'You leak far less into the desert. The desert is annoyed.', mul: { thirst: 0.5 } });
node({ id: 'h5', b: 'hydro', tier: 3, name: 'Wide Spray', req: ['h3'], cost: { nutrients: 48 },
  desc: 'Water a much larger patch in one go.', add: { pourRadius: 16, pourRate: 1.4 } });
node({ id: 'h6', b: 'hydro', tier: 3, name: 'Long Throw', req: ['h3'], cost: { nutrients: 46 },
  desc: 'Spray further than you can walk. Deeply satisfying.', add: { pourReach: 40 } });
node({ id: 'h7', b: 'hydro', tier: 4, name: 'Aquifer Sense', req: ['h4'], cost: { nutrients: 70, calcium: 6 },
  desc: 'You can feel water moving under the rock. Hidden seeps show on your map.',
  flag: 'senseWater' });
node({ id: 'h8', b: 'hydro', tier: 5, name: 'Cloud Memory', req: ['h5', 'h6'], cost: { nutrients: 130, silica: 8 },
  desc: 'Your organ remembers what a sky full of water felt like, and asks for it back.',
  flag: 'cloudCall', ability: 'rainCall' });
node({ id: 'h9', b: 'hydro', tier: 6, name: 'Ocean Bladder', req: ['h8'], cost: { nutrients: 260 },
  desc: 'You are, functionally, a small portable sea.', add: { waterMax: 140, waterRate: 0.9 } });

// --- CARAPACE --------------------------------------------------------------
node({ id: 'c1', b: 'shell', tier: 0, name: 'Thicker Shell', cost: { nutrients: 10 },
  desc: 'Chitin, but more of it.', add: { hpMax: 25 } });
node({ id: 'c2', b: 'shell', tier: 1, name: 'Salt Glaze', req: ['c1'], cost: { nutrients: 24, salt: 3 },
  desc: 'A crust of crystallised brine. Ugly. Effective.', add: { armor: 0.12 } });
node({ id: 'c3', b: 'shell', tier: 2, name: 'Second Moult', req: ['c1'], cost: { nutrients: 42 },
  desc: 'You split your shell down the back and climb out bigger. It is disgusting and wonderful.',
  add: { size: 2.1, hpMax: 40 }, moult: 2 });
node({ id: 'c4', b: 'shell', tier: 3, name: 'Spines', req: ['c2'], cost: { nutrients: 55, calcium: 5 },
  desc: 'Anything that bites you regrets it immediately.', add: { spikes: 8, thorns: 5 } });
node({ id: 'c5', b: 'shell', tier: 3, name: 'Mirror Plating', req: ['c2'], cost: { nutrients: 60, silica: 6 },
  desc: 'Reflects the Glass Flats right back at them. Glare no longer boils you.',
  add: { armor: 0.1 }, flag: 'glareProof' });
node({ id: 'c6', b: 'shell', tier: 4, name: 'Oxide Skin', req: ['c5'], cost: { nutrients: 82, iron: 6 },
  desc: 'Rust spores find nothing to chew on.', flag: 'rustProof', add: { armor: 0.08 } });
node({ id: 'c7', b: 'shell', tier: 5, name: 'Third Moult', req: ['c3'], cost: { nutrients: 140 },
  desc: 'Bigger again. Small creatures now shelter in your shadow, which is a responsibility.',
  add: { size: 3.4, hpMax: 90 }, moult: 3 });
node({ id: 'c8', b: 'shell', tier: 6, name: 'Ancient Carapace', req: ['c7', 'c4'], cost: { nutrients: 280, calcium: 12 },
  desc: 'The shell you were always going to have, given a thousand more years.',
  add: { size: 3.0, hpMax: 200, armor: 0.18 }, moult: 4 });

// --- CLAWS -----------------------------------------------------------------
node({ id: 'k1', b: 'claw', tier: 0, name: 'Sharper Edge', cost: { nutrients: 9 },
  desc: 'Same claw. Meaner.', add: { clawDmg: 5 } });
node({ id: 'k2', b: 'claw', tier: 1, name: 'Crusher Claw', req: ['k1'], cost: { nutrients: 26 },
  desc: 'One claw grows enormous. You are now slightly lopsided and much more dangerous.',
  add: { clawSize: 0.45, clawDmg: 6, knockback: 0.3 } });
node({ id: 'k3', b: 'claw', tier: 2, name: 'Fast Twitch', req: ['k1'], cost: { nutrients: 32 },
  desc: 'Swing faster than you can think about swinging.', mul: { attackSpeed: 1.5 } });
node({ id: 'k4', b: 'claw', tier: 3, name: 'Hairline Fracture', req: ['k2'], cost: { nutrients: 54 },
  desc: 'You learn exactly where a carapace wants to break.', add: { critChance: 0.22 } });
node({ id: 'k5', b: 'claw', tier: 3, name: 'Shell Slam', req: ['k3'], cost: { nutrients: 58 },
  desc: 'Throw your whole body at the ground. Everything nearby leaves.',
  ability: 'shellSlam' });
node({ id: 'k6', b: 'claw', tier: 4, name: 'Hydro Cannon', req: ['k5'], cost: { nutrients: 88 },
  desc: 'Fire stored water hard enough to knock a Rust Hound over. Waters the ground on impact.',
  ability: 'waterBlast', add: { blastDmg: 16 } });
node({ id: 'k7', b: 'claw', tier: 5, name: 'Titan Claw', req: ['k4', 'k6'], cost: { nutrients: 190, iron: 8 },
  desc: 'A claw the size of your original body. It has its own weather.',
  add: { clawDmg: 26, clawSize: 0.5, knockback: 0.5 } });

// --- LOCOMOTION ------------------------------------------------------------
node({ id: 'l1', b: 'loco', tier: 0, name: 'Longer Legs', cost: { nutrients: 9 },
  desc: 'Ground clearance. Dignity.', add: { speed: 12, legLength: 0.25 } });
node({ id: 'l2', b: 'loco', tier: 1, name: 'Wide Stance', req: ['l1'], cost: { nutrients: 22 },
  desc: 'Plant your feet further out. Dunes stop knocking you over.',
  add: { stanceWidth: 0.22, legThickness: 0.3 } });
node({ id: 'l3', b: 'loco', tier: 2, name: 'Sand Skate', req: ['l1'], cost: { nutrients: 40 },
  desc: 'A short, violent scuttle. Goes through things.', ability: 'dash', flag: 'canDash' });
node({ id: 'l4', b: 'loco', tier: 3, name: 'Fifth Pair', req: ['l2'], cost: { nutrients: 66, calcium: 5 },
  desc: 'Two more legs. Nobody asked for them. They are extremely useful.',
  add: { legPairs: 1, speed: 10, stanceWidth: 0.1 } });
node({ id: 'l5', b: 'loco', tier: 4, name: 'Tireless', req: ['l3'], cost: { nutrients: 74 },
  desc: 'Vigor comes back much faster. Pump all day.', add: { vigorEff: 0.9 } });
node({ id: 'l6', b: 'loco', tier: 4, name: 'Burrow', req: ['l4'], cost: { nutrients: 90 },
  desc: 'Vanish into the sand. Nothing can find you while you are down there.',
  ability: 'burrow' });
node({ id: 'l7', b: 'loco', tier: 5, name: 'Dune Runner', req: ['l5', 'l6'], cost: { nutrients: 170 },
  desc: 'You move like weather now.', add: { speed: 34, legLength: 0.4 } });

// --- SYMBIOSIS -------------------------------------------------------------
node({ id: 's1', b: 'symb', tier: 0, name: 'Friendly Scent', cost: { nutrients: 12 },
  desc: 'You smell like somewhere safe. Animals approach instead of leaving.',
  mul: { tameCost: 0.75 }, add: { tameRange: 12 } });
node({ id: 's2', b: 'symb', tier: 1, name: 'Bird Call', req: ['s1'], cost: { nutrients: 28 },
  desc: 'A whistle you should not physically be able to make. Every bird you own comes running.',
  ability: 'birdCall' });
node({ id: 's3', b: 'symb', tier: 2, name: 'Peck Order', req: ['s2'], cost: { nutrients: 44 },
  desc: 'Your birds attack in formation. It is genuinely frightening.',
  add: { companionDmg: 0.5 }, flag: 'peck' });
node({ id: 's4', b: 'symb', tier: 2, name: 'Nest Builder', req: ['s1'], cost: { nutrients: 40 },
  desc: 'Room for more friends at the grove.', add: { companionSlots: 3 } });
node({ id: 's5', b: 'symb', tier: 3, name: 'Command', req: ['s3'], cost: { nutrients: 62 },
  desc: 'Point at something. Everything you own goes for it.', ability: 'commandStrike' });
node({ id: 's6', b: 'symb', tier: 4, name: 'Shared Sight', req: ['s4'], cost: { nutrients: 80 },
  desc: 'You see what your scouts see. Landmarks appear on your map as they find them.',
  flag: 'sharedSight', add: { companionSlots: 2 } });
node({ id: 's7', b: 'symb', tier: 5, name: 'Deep Bond', req: ['s5', 's6'], cost: { nutrients: 200 },
  desc: 'Even the strange ones will listen to you now.',
  flag: 'deepBond', add: { companionDmg: 0.8, companionSlots: 3 } });

// --- MUTATION --------------------------------------------------------------
node({ id: 'm1', b: 'mut', tier: 0, name: 'Moss Patch', cost: { nutrients: 14 },
  desc: 'Moss grows on your back and pays rent in nutrients.', add: { passiveNutrients: 0.05 } });
node({ id: 'm2', b: 'mut', tier: 1, name: 'Bioluminescence', req: ['m1'], cost: { nutrients: 30 },
  desc: 'You glow. Night stops being quite so aggressive about it.', add: { lantern: 1 } });
node({ id: 'm3', b: 'mut', tier: 2, name: 'Root Feet', req: ['m1'], cost: { nutrients: 38 },
  desc: 'Standing on wet moss slowly heals you. Do not think about the mechanism.',
  flag: 'rootFeet' });
node({ id: 'm4', b: 'mut', tier: 2, name: 'Seed Pouch', req: ['m1'], cost: { nutrients: 36 },
  desc: 'Carry seeds. Plant them anywhere wet enough to take.', flag: 'seedPouch' });
node({ id: 'm5', b: 'mut', tier: 3, name: 'Mist Veil', req: ['m2'], cost: { nutrients: 58 },
  desc: 'Exhale a cloud of your own water and disappear inside it.', ability: 'mistVeil' });
node({ id: 'm6', b: 'mut', tier: 3, name: 'Second Nerve', req: ['m3', 'm4'], cost: { nutrients: 70 },
  desc: 'One more ability slot. Your nervous system files a complaint.', add: { slots: 1 } });
node({ id: 'm7', b: 'mut', tier: 4, name: 'Third Nerve', req: ['m6'], cost: { nutrients: 150 },
  desc: 'And another. The complaint is withdrawn.', add: { slots: 1 } });
node({ id: 'm8', b: 'mut', tier: 5, name: 'Tidal Memory', req: ['m5', 'm7'], cost: { nutrients: 240, ash: 8 },
  desc: 'Somewhere in your shell is the exact shape of a wave. You can feel it looking for the shore.',
  add: { slots: 1, waterRate: 0.6 }, flag: 'tidal' });

export const NODES = N;
export const TREE_W = 330;
export const TREE_H = 32 + 6 * 31 + 20;
export const NODE_BY_ID = Object.fromEntries(N.map((n) => [n.id, n]));

// Lay the tree out: branch column, tier row, with a small stagger.
for (const n of NODES) {
  const br = BRANCHES.find((b) => b.id === n.b);
  const sameTier = NODES.filter((o) => o.b === n.b && o.tier === n.tier);
  const idx = sameTier.indexOf(n);
  n.x = br.x + (idx - (sameTier.length - 1) / 2) * 22;
  n.y = 32 + n.tier * 31;
  n.color = br.color;
}

// ---------------------------------------------------------------------------
// Active abilities
// ---------------------------------------------------------------------------

export const ABILITIES = {
  clawSwipe: {
    id: 'clawSwipe', name: 'Claw Swipe', icon: 'X', cd: 0, cost: 0, innate: true,
    desc: 'Swing at whatever is in front of you.',
    use: (game) => { const p = game.aimPoint(); game.crab.swingClaw(p.x, p.y); return true; },
  },
  dash: {
    id: 'dash', name: 'Sand Skate', icon: '>', cd: 1.5, cost: 0,
    desc: 'A short burst of speed that shrugs off a hit.',
    use: (game) => game.crab.dash(),
  },
  shellSlam: {
    id: 'shellSlam', name: 'Shell Slam', icon: 'O', cd: 4.5, cost: 0,
    desc: 'Smash the ground. Knocks everything nearby away.',
    use: (game) => game.combat.shellSlam(),
  },
  waterBlast: {
    id: 'waterBlast', name: 'Hydro Cannon', icon: '~', cd: 1.2, cost: 3,
    desc: 'Fire water. Hurts, knocks back, and waters where it lands.',
    use: (game) => { const p = game.aimPoint(); return game.combat.waterBlast(p.x, p.y); },
  },
  birdCall: {
    id: 'birdCall', name: 'Bird Call', icon: 'v', cd: 8, cost: 0,
    desc: 'Every bird you own attacks what you are pointing at.',
    use: (game) => game.combat.birdCall(game.hoverTarget),
  },
  commandStrike: {
    id: 'commandStrike', name: 'Command', icon: '!', cd: 6, cost: 0,
    desc: 'Send all companions at one target.',
    use: (game) => game.combat.commandStrike(game.hoverTarget),
  },
  mistVeil: {
    id: 'mistVeil', name: 'Mist Veil', icon: '@', cd: 14, cost: 2,
    desc: 'Vanish in your own mist. Hostiles lose you completely.',
    use: (game) => game.combat.mistVeil(),
  },
  burrow: {
    id: 'burrow', name: 'Burrow', icon: '_', cd: 10, cost: 0,
    desc: 'Dig in. Nothing can reach you while you are under.',
    use: (game) => game.startBurrow(),
  },
  rainCall: {
    id: 'rainCall', name: 'Call Rain', icon: '"', cd: 120, cost: 12,
    desc: 'Ask the sky for what it owes you.',
    use: (game) => game.callRain(),
  },
};

// ---------------------------------------------------------------------------

const BASE = {
  size: 4.2, speed: 46, hpMax: 40, armor: 0, clawDmg: 6, clawSize: 1, attackSpeed: 1,
  critChance: 0.04, knockback: 1, blastDmg: 12, thorns: 0,
  waterRate: 0.34, waterMax: 22, pumpMult: 6, passiveMult: 0.35, pourRate: 1.9, pourRadius: 26,
  pourReach: 34, vigorEff: 1, thirst: 0.14,
  legLength: 1.5, legThickness: 1, stanceWidth: 1, legPairs: 4,
  eyeStalk: 1, organSize: 1, spikes: 0, lantern: 0,
  tameCost: 1, tameRange: 26, companionDmg: 1, companionSlots: 2,
  passiveNutrients: 0, slots: 2,
};

export class Evolution {
  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.equipped = ['clawSwipe'];
    this.flags = new Set();
    this.stage = 1;
    this.stats = { ...BASE };
    this.cooldowns = {};
    this.recompute();
  }

  has(id) { return this.unlocked.has(id); }
  flag(f) { return this.flags.has(f); }

  available(n) {
    if (this.unlocked.has(n.id)) return false;
    if (!n.req) return true;
    return n.req.every((r) => this.unlocked.has(r));
  }

  costText(n) {
    return Object.entries(n.cost).map(([k, v]) => `${v} ${k === 'nutrients' ? 'nutrient' + (v === 1 ? '' : 's') : k}`).join(', ');
  }

  canAfford(n) {
    const res = this.game.res;
    return Object.entries(n.cost).every(([k, v]) => (res[k] || 0) >= v);
  }

  unlock(id) {
    const n = NODE_BY_ID[id];
    if (!n || !this.available(n) || !this.canAfford(n)) return false;
    for (const [k, v] of Object.entries(n.cost)) this.game.res[k] -= v;
    this.unlocked.add(id);
    this.recompute();
    this.game.onEvolve(n);
    return true;
  }

  recompute() {
    const s = { ...BASE };
    this.flags.clear();
    const abilities = new Set(['clawSwipe']);
    for (const id of this.unlocked) {
      const n = NODE_BY_ID[id];
      if (!n) continue;
      if (n.add) for (const [k, v] of Object.entries(n.add)) s[k] = (s[k] || 0) + v;
      if (n.flag) this.flags.add(n.flag);
      if (n.ability) abilities.add(n.ability);
      if (n.moult) this.stage = Math.max(this.stage, n.moult);
    }
    for (const id of this.unlocked) {
      const n = NODE_BY_ID[id];
      if (n && n.mul) for (const [k, v] of Object.entries(n.mul)) s[k] = (s[k] || 0) * v;
    }
    s.canDash = this.flags.has('canDash');
    s.armor = clamp(s.armor, 0, 0.75);
    this.stats = s;
    this.ownedAbilities = [...abilities];
    // drop equipped abilities we somehow no longer own
    this.equipped = this.equipped.filter((a) => abilities.has(a));
    if (!this.equipped.includes('clawSwipe')) this.equipped.unshift('clawSwipe');
    this.equipped = this.equipped.slice(0, this.slotCount);
  }

  get slotCount() { return this.stats.slots; }

  isEquipped(id) { return this.equipped.includes(id); }

  toggleEquip(id) {
    if (id === 'clawSwipe') return false;
    const i = this.equipped.indexOf(id);
    if (i >= 0) { this.equipped.splice(i, 1); return true; }
    if (this.equipped.length >= this.slotCount) return false;
    this.equipped.push(id);
    return true;
  }

  cooldownFor(id) { return this.cooldowns[id] || 0; }

  useSlot(index) {
    const id = this.equipped[index];
    if (!id) return false;
    const ab = ABILITIES[id];
    if (!ab) return false;
    if ((this.cooldowns[id] || 0) > 0) { this.game.audio.play('deny'); return false; }
    if (ab.cost && this.game.crab.water < ab.cost) {
      this.game.audio.play('deny');
      this.game.notify('Not enough water.', 'bad');
      return false;
    }
    const ok = ab.use(this.game);
    if (ok !== false) {
      if (ab.cost) this.game.crab.water -= ab.cost;
      this.cooldowns[id] = ab.cd;
    }
    return ok;
  }

  update(dt) {
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
  }

  totalUnlocked() { return this.unlocked.size; }

  serialize() { return { unlocked: [...this.unlocked], equipped: this.equipped, stage: this.stage }; }
  deserialize(d) {
    if (!d) return;
    this.unlocked = new Set(d.unlocked || []);
    this.stage = d.stage || 1;
    this.recompute();
    this.equipped = (d.equipped || ['clawSwipe']).filter((a) => this.ownedAbilities.includes(a));
    if (!this.equipped.includes('clawSwipe')) this.equipped.unshift('clawSwipe');
  }
}

export { BASE as BASE_STATS };
