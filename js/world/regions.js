// CRABDEN - region definitions, hazards and the plant tech-tree.
// Every region owns a palette, a hazard, a plant list and a creature table.

export const REGIONS = [
  {
    id: 'dunes',
    name: 'The Sleeping Dunes',
    blurb: 'Where the ocean used to be. Now it is very much not.',
    cx: 0, cy: 0, pull: 1.35,
    pal: {
      lo: '#8a6a44', mid: '#c49a63', hi: '#e8c88d', crest: '#f6e0ae',
      shadow: '#6b4a30', rock: '#7d5f45', detail: '#a87d4f', wet: '#4f6b64',
    },
    fog: '#e2b877',
    hazard: null,
    heat: 1.0,
    plants: ['moss', 'berry', 'palm', 'cactus'],
    ambience: 'calm',
  },
  {
    id: 'bonereef',
    name: 'The Bone Reef',
    blurb: 'A coral reef that died standing up, and never fell over.',
    cx: -2600, cy: -1100, pull: 1.0,
    pal: {
      lo: '#7b7566', mid: '#b7b09b', hi: '#ddd7c1', crest: '#f2eddc',
      shadow: '#5c5749', rock: '#9c937c', detail: '#cfc6ac', wet: '#5f7a74',
    },
    fog: '#d6d0b8',
    hazard: { id: 'bonedust', name: 'Bone Dust', desc: 'Clogs the gills. Slows you until you find clean air.', slow: 0.55, dps: 0 },
    heat: 0.85,
    plants: ['moss', 'berry', 'reefweed'],
    ambience: 'wonder',
  },
  {
    id: 'glassflats',
    name: 'The Glass Flats',
    blurb: 'A thousand years of lightning, fused into one enormous mirror.',
    cx: 2600, cy: -1700, pull: 0.95,
    pal: {
      lo: '#5e6f7d', mid: '#9db4c2', hi: '#d3e4ee', crest: '#f2fbff',
      shadow: '#43515d', rock: '#7f96a5', detail: '#b9d2e0', wet: '#5a8ea0',
    },
    fog: '#cfe6f2',
    hazard: { id: 'glare', name: 'Mirror Glare', desc: 'The flats reflect the sun back at you. Water boils off fast.', slow: 1, dps: 0, waterDrain: 0.55 },
    heat: 1.45,
    plants: ['moss', 'glasslily', 'berry'],
    ambience: 'wonder',
  },
  {
    id: 'rustlands',
    name: 'The Rustlands',
    blurb: 'Whatever the humans built, the desert has been chewing on it.',
    cx: 2400, cy: 2000, pull: 1.0,
    pal: {
      lo: '#6b3f2c', mid: '#a5613c', hi: '#cd8a54', crest: '#e6ab74',
      shadow: '#4e2c1f', rock: '#7a4a33', detail: '#8f5738', wet: '#4a6357',
    },
    fog: '#c08153',
    hazard: { id: 'rustspore', name: 'Rust Spores', desc: 'Eats shell. Eats everything, really.', slow: 0.85, dps: 1.6 },
    heat: 1.05,
    plants: ['moss', 'berry', 'ironvine'],
    ambience: 'danger',
  },
  {
    id: 'saltpan',
    name: 'The Weeping Salt Pan',
    blurb: 'The floor of the old sea. It still tastes like it.',
    cx: -2200, cy: 2300, pull: 1.0,
    pal: {
      lo: '#9a9098', mid: '#d6cfd4', hi: '#f0eaee', crest: '#ffffff',
      shadow: '#7a7078', rock: '#b3a9b0', detail: '#e5dbe2', wet: '#6f8f9c',
    },
    fog: '#eee6ec',
    hazard: { id: 'saltburn', name: 'Salt Burn', desc: 'Dries you out from the outside in.', slow: 1, dps: 0.9, waterDrain: 0.35 },
    heat: 1.25,
    plants: ['moss', 'saltgrass', 'berry'],
    ambience: 'calm',
  },
  {
    id: 'ashwood',
    name: 'The Ashwood',
    blurb: 'A forest that burned so long ago it forgot it was ever wood.',
    cx: -600, cy: -3500, pull: 0.95,
    pal: {
      lo: '#3f3644', mid: '#6a5c6e', hi: '#948394', crest: '#b8a6b6',
      shadow: '#2c252f', rock: '#544858', detail: '#7d6d80', wet: '#4a6b6d',
    },
    fog: '#8e7d8f',
    hazard: { id: 'ashfall', name: 'Ash Fall', desc: 'Warm, soft, constant. Do not breathe it.', slow: 0.8, dps: 1.1 },
    heat: 0.7,
    plants: ['moss', 'ashfern', 'berry', 'palm'],
    ambience: 'night',
  },
  {
    id: 'deepwell',
    name: 'The Deep Well',
    blurb: 'The hole the ocean went down. Something down there is still awake.',
    cx: 600, cy: 4300, pull: 0.9,
    pal: {
      lo: '#20323c', mid: '#37596a', hi: '#4f8296', crest: '#6fb0c4',
      shadow: '#14212a', rock: '#2b4451', detail: '#3f6d81', wet: '#3aa0b8',
    },
    fog: '#3d6d80',
    hazard: { id: 'pressure', name: 'Deep Silence', desc: 'The air here presses on your shell like water used to.', slow: 0.75, dps: 0.6 },
    heat: 0.5,
    plants: ['moss', 'berry', 'palm', 'waterwood'],
    ambience: 'wonder',
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------
// Plants. `needs` gates growth on neighbouring plant types; `gives` is the
// per-second yield once mature.
// ---------------------------------------------------------------------------

export const PLANTS = {
  moss: {
    id: 'moss', name: 'Thirstmoss', tier: 1,
    desc: 'The first thing to come back. Green, damp, deeply smug about it.',
    grow: 20, water: 0.5, spread: 0.6, spreadRange: 34, maxR: 7,
    needs: [], gives: { nutrients: 0.055 }, attracts: [],
    colors: ['#3f6b3a', '#5d8f47', '#86b45c'],
  },
  berry: {
    id: 'berry', name: 'Ashberry Bush', tier: 2,
    desc: 'Sour, gritty, and the single most exciting thing to happen to birds in 1,000 years.',
    grow: 44, water: 1.0, spread: 0.2, spreadRange: 52, maxR: 8,
    needs: ['moss'], gives: { nutrients: 0.13, food: 0.09 }, attracts: ['skimmer', 'wirefinch'],
    colors: ['#3b5a34', '#6b8f45', '#b5354b'],
  },
  palm: {
    id: 'palm', name: 'Stiltpalm', tier: 3,
    desc: 'Grew tall to find water. Found none. Kept the attitude.',
    grow: 96, water: 1.7, spread: 0.06, spreadRange: 80, maxR: 15,
    needs: ['berry'], gives: { nutrients: 0.28, shade: 1 }, attracts: ['glasswing', 'stiltwader'],
    colors: ['#6a5334', '#4f7a3c', '#7fae54'],
  },
  waterwood: {
    id: 'waterwood', name: 'Waterwood', tier: 4,
    desc: 'A tree that sweats. Genuinely revolting. Genuinely priceless.',
    grow: 150, water: 2.6, spread: 0.02, spreadRange: 110, maxR: 18,
    needs: ['palm'], gives: { nutrients: 0.35, water: 0.22 }, attracts: ['miragejelly'],
    colors: ['#3f5d55', '#4f8f7c', '#8fd4bd'],
  },
  cactus: {
    id: 'cactus', name: 'Barrel Cactus', tier: 1, native: true,
    desc: 'Survived the whole apocalypse without comment.',
    grow: 40, water: 0.35, spread: 0.05, spreadRange: 60, maxR: 8,
    needs: [], gives: { nutrients: 0.05, water: 0.03 }, attracts: [],
    colors: ['#3c5c3a', '#5a8a4c', '#c9d86a'],
  },
  reefweed: {
    id: 'reefweed', name: 'Fossil Reefweed', tier: 2, native: true,
    desc: 'Technically still alive. Has not moved since the Cretaceous, emotionally.',
    grow: 60, water: 0.8, spread: 0.12, spreadRange: 48, maxR: 10,
    needs: ['moss'], gives: { nutrients: 0.14, calcium: 0.05 }, attracts: ['reefstrider'],
    colors: ['#6d7a6a', '#9fb08d', '#d8e0b8'],
  },
  glasslily: {
    id: 'glasslily', name: 'Glass Lily', tier: 2, native: true,
    desc: 'Blooms only in reflected light. Cuts you if you are rude about it.',
    grow: 70, water: 0.9, spread: 0.09, spreadRange: 56, maxR: 9,
    needs: ['moss'], gives: { nutrients: 0.16, silica: 0.05 }, attracts: ['prismling'],
    colors: ['#5c7f92', '#a8cede', '#f0fbff'],
  },
  ironvine: {
    id: 'ironvine', name: 'Ironvine', tier: 2, native: true,
    desc: 'Feeds on rusted steel. Tastes like a coin. Birds love it, which is worrying.',
    grow: 74, water: 0.95, spread: 0.1, spreadRange: 60, maxR: 11,
    needs: ['moss'], gives: { nutrients: 0.17, iron: 0.05 }, attracts: ['wirefinch'],
    colors: ['#4e3a2c', '#7d5a3a', '#c2703f'],
  },
  saltgrass: {
    id: 'saltgrass', name: 'Weeping Saltgrass', tier: 2, native: true,
    desc: 'Pulls salt out of the ground and cries it onto the sand. Very dramatic.',
    grow: 58, water: 0.85, spread: 0.14, spreadRange: 50, maxR: 9,
    needs: ['moss'], gives: { nutrients: 0.15, salt: 0.05 }, attracts: ['brineling'],
    colors: ['#7d8a86', '#b6c4bb', '#e8f0ea'],
  },
  ashfern: {
    id: 'ashfern', name: 'Ashfern', tier: 2, native: true,
    desc: 'Only sprouts where something burned. There is a lot of choice.',
    grow: 64, water: 0.85, spread: 0.12, spreadRange: 54, maxR: 10,
    needs: ['moss'], gives: { nutrients: 0.16, ash: 0.05 }, attracts: ['emberbat'],
    colors: ['#3c333f', '#6b5f6e', '#a58ea0'],
  },
};

export const PLANT_ORDER = ['moss', 'berry', 'palm', 'waterwood'];

// ---------------------------------------------------------------------------
// Ecosystem tiers - drive spawn tables, music and the ending.
// ---------------------------------------------------------------------------

export const ECO_TIERS = [
  { t: 0, at: 0,    name: 'Dead Sand',    blurb: 'Nothing. Not even regret.' },
  { t: 1, at: 8,    name: 'Damp Patch',   blurb: 'Technically an ecosystem. Legally, barely.' },
  { t: 2, at: 30,   name: 'Green Smear',  blurb: 'Moss. Actual moss. You did that.' },
  { t: 3, at: 90,   name: 'Thicket',      blurb: 'Something ate a berry here and did not die.' },
  { t: 4, at: 220,  name: 'Grove',        blurb: 'Shade. Real shade. Sit in it, you have earned it.' },
  { t: 5, at: 480,  name: 'Oasis',        blurb: 'Birds argue here now. That is what winning sounds like.' },
  { t: 6, at: 950,  name: 'Young Sea',    blurb: 'The desert is nervous. Good.' },
];

export function ecoTierFor(biomass) {
  let cur = ECO_TIERS[0];
  for (const t of ECO_TIERS) if (biomass >= t.at) cur = t;
  return cur;
}

// ---------------------------------------------------------------------------
// Point-of-interest kinds scattered through the world.
// ---------------------------------------------------------------------------

export const POI_KINDS = {
  oasis:     { name: 'Dry Oasis',        water: 260, icon: 'oasis' },
  seep:      { name: 'Underground Seep', water: 90,  icon: 'seep', hidden: true },
  ruin:      { name: 'Human Ruin',       water: 0,   icon: 'ruin' },
  bones:     { name: 'Whale Fall',       water: 40,  icon: 'bones' },
  monolith:  { name: 'Monolith',         water: 0,   icon: 'monolith' },
  wreck:     { name: 'Beached Wreck',    water: 120, icon: 'wreck' },
  crater:    { name: 'Glass Crater',     water: 70,  icon: 'crater' },
  well:      { name: 'The Deep Well',    water: 900, icon: 'well' },
};
