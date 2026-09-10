// CRABDEN - the plants you can buy, and what each one does for you.
//
// A plant costs water up front and drinks a trickle for ever after. In return
// it fixes nutrients, expresses a gene the evolution tree needs, and draws
// particular creatures out of the desert. Nothing here is decoration only.

export const FLORA = [
  {
    id: 'dustmoss', name: 'Dustmoss', arch: 'moss', tier: 0,
    w: 26, h: 8, mat: 'moss', mat2: 'leaf', seed: 11,
    cost: 8, upkeep: 0.012, yield: 0.05, grow: 26,
    gene: 'chlorophyll', attracts: ['sandhopper'],
    desc: 'It waited a thousand years as a spore. Water it once and it remembers everything.',
  },
  {
    id: 'saltgrass', name: 'Saltgrass', arch: 'grass', tier: 0,
    w: 22, h: 20, mat: 'leafDry', seedHead: true, seedMat: 'leafDry', seed: 23,
    cost: 14, upkeep: 0.018, yield: 0.09, grow: 32,
    gene: 'chlorophyll', attracts: ['sandhopper', 'dunefowl'],
    desc: 'Grows in the crust the old sea left behind. Tastes of the ocean that is not there.',
  },
  {
    id: 'emberberry', name: 'Emberberry', arch: 'bush', tier: 1,
    w: 30, h: 30, mat: 'leaf', stemMat: 'wood', fruitMat: 'berry', fruit: 6, fruitR: 1.5,
    trunks: 3, depth: 3, spread: 0.66, seed: 37,
    cost: 46, upkeep: 0.05, yield: 0.28, grow: 60,
    gene: 'sugar', attracts: ['dunefowl', 'glasswing', 'quillhare'],
    desc: 'Fruits at dusk and glows faintly. Everything with a mouth wants one.',
  },
  {
    id: 'bluefern', name: 'Bluefern', arch: 'fern', tier: 1,
    w: 38, h: 34, mat: 'leafBlue', stemMat: 'wood', seed: 43,
    cost: 38, upkeep: 0.06, yield: 0.22, grow: 55,
    gene: 'shade', attracts: ['glasswing', 'mistsnail'],
    desc: 'Photosynthesises in the blue end of the light. Casts real shade, which out here is a currency.',
  },
  {
    id: 'sunspindle', name: 'Sunspindle', arch: 'flower', tier: 1,
    w: 20, h: 30, mat: 'petalGold', stemMat: 'leaf', coreMat: 'fruitGold', petals: 9, headR: 3.4,
    stems: 3, seed: 51,
    cost: 42, upkeep: 0.04, yield: 0.20, grow: 50,
    gene: 'pollen', attracts: ['glasswing', 'sunmoth'],
    desc: 'Tracks a sun that has not moved in a thousand years. Persistent, like you.',
  },
  {
    id: 'thornmelon', name: 'Thornmelon', arch: 'succulent', tier: 1,
    w: 24, h: 20, mat: 'leaf', fruitMat: 'fruitGold', fruitR: 2.6, seed: 67,
    cost: 52, upkeep: 0.02, yield: 0.26, grow: 65,
    gene: 'reservoir', attracts: ['quillhare', 'ridgeback'],
    desc: 'Stores a week of water in each pad. Everyone in the desert knows this, including you.',
  },
  {
    id: 'cloudcap', name: 'Cloudcap', arch: 'fungus', tier: 2,
    w: 22, h: 20, mat: 'petalWhite', stemMat: 'bone', gillMat: 'leafDry', stems: 4, seed: 71,
    cost: 78, upkeep: 0.09, yield: 0.42, grow: 80,
    gene: 'mycelium', attracts: ['mistsnail', 'lanternbug'],
    desc: 'Fruits only in shade, and puts out a mist at dawn that other plants drink.',
  },
  {
    id: 'glasslily', name: 'Glass Lily', arch: 'flower', tier: 2,
    w: 22, h: 34, mat: 'petalWhite', stemMat: 'leafBlue', coreMat: 'glow', petals: 7, headR: 4.2,
    stems: 2, seed: 83,
    cost: 96, upkeep: 0.11, yield: 0.40, grow: 90,
    gene: 'luminance', attracts: ['sunmoth', 'lanternbug'],
    desc: 'The petals are actual glass. Nobody knows how. It rings faintly in the wind.',
  },
  {
    id: 'ribbonkelp', name: 'Ribbon Kelp', arch: 'vine', tier: 2,
    w: 32, h: 44, mat: 'leafBlue', stemMat: 'leaf', fruitMat: 'water', fruitR: 1.6, seed: 97,
    cost: 110, upkeep: 0.20, yield: 0.55, grow: 100, needsPond: true,
    gene: 'ocean', attracts: ['mistsnail', 'tidewader'],
    desc: 'A survivor of the sea, growing down your shell as if it were a rock on the reef.',
  },
  {
    id: 'pipereed', name: 'Pipe Reed', arch: 'reed', tier: 2,
    w: 22, h: 36, mat: 'leaf', seedMat: 'leafDry', seed: 103,
    cost: 84, upkeep: 0.16, yield: 0.36, grow: 78, needsPond: true,
    gene: 'ocean', attracts: ['tidewader', 'dunefowl'],
    desc: 'Whistles when the wind comes off the saltpan. The birds answer it.',
  },
  {
    id: 'ironwood', name: 'Ironwood', arch: 'tree', tier: 3,
    w: 40, h: 46, mat: 'leaf', stemMat: 'wood', fruitMat: 'fruitGold', fruit: 6, fruitR: 1.9,
    depth: 4, seed: 113,
    cost: 190, upkeep: 0.22, yield: 0.95, grow: 150,
    gene: 'heartwood', attracts: ['ridgeback', 'dunefowl', 'boneheron'],
    desc: 'Wood so dense it sinks in water. A century of growth, if you keep it drinking.',
  },
  {
    id: 'ghostpalm', name: 'Ghost Palm', arch: 'tree', tier: 3,
    w: 38, h: 52, mat: 'leafBlue', stemMat: 'woodPale', leafW: 0.3, leafFat: 0.4,
    depth: 3, seed: 127,
    cost: 220, upkeep: 0.26, yield: 0.88, grow: 165,
    gene: 'canopy', attracts: ['boneheron', 'sunmoth', 'glasswing'],
    desc: 'Pale as bone and twice as patient. Its shade is measurably cooler than any other shade.',
  },
  {
    id: 'heartbloom', name: 'Heartbloom', arch: 'flower', tier: 4,
    w: 26, h: 40, mat: 'petalPink', stemMat: 'leaf', coreMat: 'glow', petals: 11, headR: 5.0,
    stems: 1, seed: 149,
    cost: 340, upkeep: 0.30, yield: 1.35, grow: 200,
    gene: 'bloom', attracts: ['sunmoth', 'lanternbug', 'skylark'],
    desc: 'It opens once a day, for about a minute. Creatures come from kilometres away to see it.',
  },
  {
    id: 'worldvine', name: 'Worldvine', arch: 'vine', tier: 4,
    w: 40, h: 60, mat: 'leaf', stemMat: 'wood', fruitMat: 'berry', fruitR: 2.0, seed: 163,
    cost: 420, upkeep: 0.42, yield: 1.70, grow: 240,
    gene: 'genesis', attracts: ['ridgeback', 'boneheron', 'skylark'],
    desc: 'Grows down your shell and into the sand, and the sand under it comes back to life.',
  },
];

export const FLORA_BY_ID = Object.fromEntries(FLORA.map((f) => [f.id, f]));

/** Growth stage names, used by the codex and the tooltips. */
export const STAGE_NAME = ['seed', 'sprout', 'young', 'mature'];
