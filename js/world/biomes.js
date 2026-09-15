// CRABDEN - biomes are stretches of the world, laid end to end along X.
// You walk out of one and into the next; everything from the sky colour to
// which animals ambush you comes from here.

export const BIOMES = [
  {
    // The part of it that never left. Past the salt pan the shelf goes over
    // and the water is still standing on it, with the same animals in it that
    // the prologue had - they simply stayed where the water was.
    id: 'theshallows', name: 'The Shallows',
    x0: -26000, x1: -14000,
    blurb: 'The sea did not go everywhere. It went almost everywhere.',
    groundMat: 'sandPale', crustMat: 'bone', pebbleMat: 'bone', mesaMat: 'bone',
    baseY: 10, flatten: 0.55, pebbles: 11,
    sky: ['#12283c', '#3f6a86', '#89b4bd', '#c6e2e2'],
    fog: '#a9cdd2', heat: 0.3,
    plants: ['ribbonkelp', 'pipereed', 'saltgrass'],
    fauna: ['boneheron', 'glasstail', 'saltlark'],
    props: ['coral', 'driftwood', 'rock'],
  },
  {
    id: 'saltpan', name: 'The Weeping Salt Pan',
    x0: -14000, x1: -6200,
    blurb: 'The floor of the old sea. It still tastes like it.',
    groundMat: 'sandPale', crustMat: 'bone', pebbleMat: 'bone', mesaMat: 'bone',
    baseY: 26, flatten: 0.8, pebbles: 9,
    sky: ['#2c3f56', '#7f93a4', '#cbb7ac', '#efd9c4'],
    fog: '#e6dcd0', heat: 1.2,
    plants: ['saltgrass', 'dustmoss', 'pipereed'],
    fauna: ['boneheron', 'duneskink', 'sandserpent'],
    props: ['saltcrust', 'driftwood', 'bonerib'],
  },
  {
    id: 'bonereef', name: 'The Bone Reef',
    x0: -6200, x1: -1600,
    blurb: 'A coral reef that died standing up and never fell over.',
    groundMat: 'sand', crustMat: 'bone', pebbleMat: 'bone', mesaMat: 'bone',
    baseY: -8, flatten: 0.2, pebbles: 14,
    sky: ['#2a3a52', '#6f86a0', '#c3b49c', '#e9dcc0'],
    fog: '#ded3b8', heat: 0.9,
    plants: ['ribbonkelp', 'dustmoss', 'emberberry'],
    fauna: ['boneheron', 'glasstail', 'copperscarab'],
    props: ['coral', 'bonerib', 'skull', 'rock'],
  },
  {
    id: 'dunes', name: 'The Sleeping Dunes',
    x0: -1600, x1: 5200,
    blurb: 'Where the ocean used to be. Now it is very much not.',
    groundMat: 'sand', crustMat: 'sandPale', pebbleMat: 'rock', mesaMat: 'rockRed',
    baseY: 0, flatten: 0, pebbles: 8,
    sky: ['#2b3f66', '#7c93b4', '#d9b58a', '#f2d9a8'],
    fog: '#e6bc84', heat: 1.0,
    plants: ['dustmoss', 'saltgrass', 'emberberry', 'sunspindle', 'thornmelon'],
    fauna: ['saltlark', 'duneskink', 'quilljerboa', 'copperscarab', 'huskhound'],
    props: ['rock', 'boulder', 'cactus', 'deadtree', 'bonerib'],
  },
  {
    id: 'glassflats', name: 'The Glass Flats',
    x0: 5200, x1: 10400,
    blurb: 'A thousand years of lightning, fused into one enormous mirror.',
    groundMat: 'sandPale', crustMat: 'glass', pebbleMat: 'glass', mesaMat: 'rock',
    baseY: 18, flatten: 0.75, pebbles: 12,
    sky: ['#22344f', '#6c8bab', '#bfd2dc', '#e6f1f5'],
    fog: '#d3e6ef', heat: 1.4,
    plants: ['glasslily', 'dustmoss', 'bluefern'],
    fauna: ['glasswing', 'sunmoth', 'agama'],
    props: ['shard', 'rock', 'crater'],
  },
  {
    id: 'rustlands', name: 'The Rustlands',
    x0: 10400, x1: 15600,
    blurb: 'Whatever the humans built, the desert has been chewing on it.',
    groundMat: 'sand', crustMat: 'rust', pebbleMat: 'metal', mesaMat: 'rockRed',
    baseY: -6, flatten: 0.1, pebbles: 16,
    sky: ['#33263a', '#8a6a72', '#c98a5e', '#e8b276'],
    fog: '#c08a58', heat: 1.05,
    plants: ['worldvine', 'dustmoss', 'emberberry'],
    fauna: ['saltlark', 'ironback', 'huskhound', 'carrionkite'],
    props: ['ruinwall', 'pillar', 'car', 'rock'],
  },
  {
    id: 'ashwood', name: 'The Ashwood',
    x0: 15600, x1: 20800,
    blurb: 'A forest that burned so long ago it forgot it was ever wood.',
    groundMat: 'rock', crustMat: 'sand', pebbleMat: 'rock', mesaMat: 'rock',
    baseY: -20, flatten: 0, pebbles: 11,
    sky: ['#231b2c', '#5a4a63', '#94748a', '#c9a4ac'],
    fog: '#8e7d92', heat: 0.7,
    plants: ['bluefern', 'cloudcap', 'ironwood'],
    fauna: ['sunmoth', 'ashchameleon', 'ridgeback', 'thorniguana'],
    props: ['deadtree', 'boulder', 'rock'],
  },
  {
    id: 'deepwell', name: 'The Deep Well',
    x0: 20800, x1: 27000,
    blurb: 'The hole the ocean went down. Something there is still awake.',
    groundMat: 'rock', crustMat: 'rockRed', pebbleMat: 'rock', mesaMat: 'rock',
    baseY: 40, flatten: 0.35, pebbles: 13,
    sky: ['#101c26', '#294453', '#3f6b7c', '#5e97a6'],
    fog: '#3f6d80', heat: 0.5,
    plants: ['dustmoss', 'heartbloom', 'ghostpalm'],
    fauna: ['lanternbeetle', 'boneheron', 'stonebasilisk'],
    props: ['pillar', 'coral', 'boulder'],
  },
];

const FALLBACK = BIOMES[2];
const BLEND = 700;

export function biomeAt(x) {
  for (const b of BIOMES) if (x >= b.x0 && x < b.x1) return b;
  return x < BIOMES[0].x0 ? BIOMES[0] : BIOMES[BIOMES.length - 1];
}

export const BIOME_BY_ID = Object.fromEntries(BIOMES.map((b) => [b.id, b]));

/** 0 at a biome edge, 1 well inside it. */
export function biomeBlend(x) {
  const b = biomeAt(x);
  const d = Math.min(x - b.x0, b.x1 - x);
  return Math.max(0, Math.min(1, d / BLEND));
}

/** The two biomes in play at x and how far between them we are. */
export function biomeMix(x) {
  const a = biomeAt(x);
  const t = biomeBlend(x);
  if (t >= 1) return { a, b: a, t: 0 };
  const nearStart = x - a.x0 < a.x1 - x;
  const b = nearStart ? biomeAt(a.x0 - 1) : biomeAt(a.x1 + 1);
  return { a, b, t: (1 - t) * 0.5 };
}
