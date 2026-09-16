// CRABDEN - the plants, and what each one does for you.
//
// A plant costs water up front and drinks a trickle for ever after. In return
// it fixes nutrients, expresses a gene the evolution tree needs, and draws
// particular creatures out of the desert. Nothing here is decoration only.
//
// Two things gate a species, and they are different things:
//
//   RESEARCH  you have to have studied a wild one. Knowing what a plant is
//             comes from kneeling next to one in the desert and looking at
//             it, not from a menu unlocking.
//   SEED      and then you have to have a seed of it in the pack. Studying a
//             wild one gives you seed; so does picking your own, sometimes.
//             Nothing here is bought.
//
// `crops` is the other new number, and it is the one you plan around. A plant
// with `crops: 1` is an ANNUAL - one pick and it is spent, and you get the
// bed back. Everything else is a perennial that goes on cropping until it
// dies of thirst or you pull it up. An annual has to pay much better per pick
// to be worth the bed, and they do.

export const FLORA = [
  {
    id: 'dustmoss', name: 'Dustmoss', arch: 'moss', tier: 0,
    w: 26, h: 8, mat: 'moss', mat2: 'leaf', seed: 11,
    cost: 14, upkeep: 0.012, yield: 0.05, grow: 26,
    gene: 'chlorophyll', attracts: ['duneskink', 'copperscarab'],
    desc: 'It waited a thousand years as a spore. Water it once and it remembers everything.',
    boon: { upkeep: -0.05 }, boonText: 'Holds moisture. Everything on the shell drinks a little less.',
    unlock: null,
  },
  {
    id: 'saltgrass', name: 'Saltgrass', arch: 'grass', tier: 0,
    w: 22, h: 20, mat: 'leafDry', seedHead: true, seedMat: 'leafDry', seed: 23,
    cost: 26, upkeep: 0.018, yield: 0.09, grow: 32,
    gene: 'chlorophyll', attracts: ['duneskink', 'saltlark'],
    desc: 'Grows in the crust the old sea left behind. Tastes of the ocean that is not there.',
    boon: { berryRate: 1.08 }, boonText: 'Seeds constantly. A touch more fruit sets.',
    unlock: null,
  },
  {
    id: 'emberberry', name: 'Emberberry', arch: 'bush', tier: 1,
    w: 30, h: 30, mat: 'leaf', stemMat: 'wood', fruitMat: 'berry', fruit: 6, fruitR: 1.5,
    trunks: 3, depth: 3, spread: 0.66, seed: 37,
    cost: 88, upkeep: 0.05, yield: 0.28, grow: 60,
    gene: 'sugar', attracts: ['saltlark', 'glasswing', 'quilljerboa'],
    desc: 'Fruits at dusk and glows faintly. Everything with a mouth wants one.',
    boon: { berryRate: 1.35, attract: 1.10 }, boonText: 'Fruit. More of it, and more visitors for it.',
    hands: { by: "hands", why: "The seed is the size of a grain of sand. You have a claw the size of a door." },
    unlock: { genes: ['chlorophyll'] },
  },
  {
    id: 'bluefern', name: 'Bluefern', arch: 'fern', tier: 1,
    w: 38, h: 34, mat: 'leafBlue', stemMat: 'wood', seed: 43,
    cost: 72, upkeep: 0.06, yield: 0.22, grow: 55,
    gene: 'shade', attracts: ['glasswing', 'glasstail'],
    desc: 'Photosynthesises in the blue end of the light. Casts real shade, which out here is a currency.',
    boon: { grow: 0.90 }, boonText: 'Real shade. Everything beside it matures sooner.',
    hands: { by: "hands", why: "The rhizome goes in at an angle, and a claw cannot hold an angle." },
    unlock: { genes: ['chlorophyll'] },
  },
  {
    id: 'sunspindle', name: 'Sunspindle', arch: 'flower', tier: 1,
    w: 20, h: 30, mat: 'petalGold', stemMat: 'leaf', coreMat: 'fruitGold', petals: 9, headR: 3.4,
    stems: 3, seed: 51,
    cost: 80, upkeep: 0.04, yield: 0.20, grow: 50,
    gene: 'pollen', attracts: ['glasswing', 'sunmoth'],
    desc: 'Tracks a sun that has not moved in a thousand years. Persistent, like you.',
    boon: { attract: 1.20 }, boonText: 'Pollen on the wind. Fliers come from further away.',
    unlock: { genes: ['chlorophyll'] },
  },
  {
    id: 'thornmelon', name: 'Thornmelon', arch: 'succulent', tier: 1,
    w: 24, h: 20, mat: 'leaf', fruitMat: 'fruitGold', fruitR: 2.6, seed: 67,
    cost: 100, upkeep: 0.02, yield: 0.26, grow: 65,
    gene: 'reservoir', attracts: ['quilljerboa', 'ridgeback'],
    desc: 'Stores a week of water in each pad. Everyone in the desert knows this, including you.',
    boon: { waterMax: 40 }, boonText: 'Stores water in the pads. Your tank is bigger.',
    hands: { by: "digger", why: "The taproot goes deeper than anything here reaches by hand." },
    unlock: { genes: ['chlorophyll'], seen: 3 },
  },
  {
    id: 'cloudcap', name: 'Cloudcap', arch: 'fungus', tier: 2,
    w: 22, h: 20, mat: 'petalWhite', stemMat: 'bone', gillMat: 'leafDry', stems: 4, seed: 71,
    cost: 155, upkeep: 0.09, yield: 0.42, grow: 80,
    gene: 'mycelium', attracts: ['glasstail', 'lanternbeetle'],
    desc: 'Fruits only in shade, and puts out a mist at dawn that other plants drink.',
    boon: { upkeep: -0.12, grow: 0.94 }, boonText: 'Mists at dawn. The whole shell stops being thirsty.',
    hands: { by: "hands", why: "Spawn. Touch it with a claw and there is no spawn." },
    unlock: { genes: ['shade'] },
  },
  {
    id: 'glasslily', name: 'Glass Lily', arch: 'flower', tier: 2,
    w: 22, h: 34, mat: 'petalWhite', stemMat: 'leafBlue', coreMat: 'glow', petals: 7, headR: 4.2,
    stems: 2, seed: 83,
    cost: 195, upkeep: 0.11, yield: 0.40, grow: 90,
    gene: 'luminance', attracts: ['sunmoth', 'lanternbeetle'],
    desc: 'The petals are actual glass. Nobody knows how. It rings faintly in the wind.',
    boon: { light: 0.4, attract: 1.15 }, boonText: 'Glows faintly. Night things approach, night things keep off.',
    hands: { by: "hands", why: "The bulb has a skin on it you could break by looking at it." },
    unlock: { genes: ['pollen'] },
  },
  {
    id: 'ribbonkelp', name: 'Ribbon Kelp', arch: 'vine', tier: 2,
    w: 32, h: 44, mat: 'leafBlue', stemMat: 'leaf', fruitMat: 'water', fruitR: 1.6, seed: 97,
    cost: 230, upkeep: 0.20, yield: 0.55, grow: 100, needsPond: true,
    gene: 'ocean', attracts: ['glasstail', 'boneheron'],
    desc: 'A survivor of the sea, growing down your shell as if it were a rock on the reef.',
    boon: { pondGain: 0.03, waterMax: 30 }, boonText: 'Keeps the pool alive and slows evaporation.',
    unlock: { pond: 0.5 },
  },
  {
    id: 'pipereed', name: 'Pipe Reed', arch: 'reed', tier: 2,
    w: 22, h: 36, mat: 'leaf', seedMat: 'leafDry', seed: 103,
    cost: 170, upkeep: 0.16, yield: 0.36, grow: 78, needsPond: true,
    gene: 'ocean', attracts: ['boneheron', 'saltlark'],
    desc: 'Whistles when the wind comes off the saltpan. The birds answer it.',
    boon: { pondGain: 0.02, attract: 1.12 }, boonText: 'Whistles. Birds answer reeds.',
    hands: { by: "digger", why: "It wants a trench dug along the bed, not a hole punched in it." },
    unlock: { pond: 0.5 },
  },
  {
    id: 'sandwheat', name: 'Sandwheat', arch: 'grass', tier: 1,
    w: 20, h: 26, mat: 'leafDry', seedHead: true, seedMat: 'fruitGold', seed: 181,
    cost: 54, upkeep: 0.03, yield: 0.30, grow: 34,
    gene: 'sugar', attracts: ['saltlark', 'quilljerboa'],
    desc: 'Runs up, sets a head, and dies, all inside a fortnight. It has been doing that '
      + 'since before the water went, which is why it is still here.',
    boon: { berryRate: 1.18 }, boonText: 'Sets a heavy head. More fruit, for one season.',
    unlock: { study: 1 },
  },
  {
    id: 'sunpod', name: 'Sunpod', arch: 'succulent', tier: 1,
    w: 22, h: 18, mat: 'leaf', fruitMat: 'fruitGold', fruitR: 2.8, seed: 191,
    cost: 96, upkeep: 0.02, yield: 0.34, grow: 52,
    gene: 'reservoir', attracts: ['duneskink', 'copperscarab'],
    desc: 'Swells all day and splits at noon. Everything in the pod is the water it '
      + 'has spent a month not losing.',
    boon: { waterMax: 24 }, boonText: 'Holds a day of water in each pod.',
    unlock: { study: 1 },
  },
  {
    id: 'ashroot', name: 'Ashroot', arch: 'bush', tier: 2,
    w: 28, h: 24, mat: 'leafDry', stemMat: 'wood', trunks: 4, depth: 2, spread: 0.8, seed: 197,
    cost: 150, upkeep: 0.04, yield: 0.46, grow: 72,
    gene: 'mycelium', attracts: ['huskhound', 'ashchameleon'],
    desc: 'Grows on burnt ground and puts everything into the root. The part above the '
      + 'sand is an apology for the part below it.',
    boon: { upkeep: -0.12 }, boonText: 'Roots run wide. The whole shell drinks less.',
    hands: { by: "digger", why: "The root ball is wider than the bed. Something has to open it." },
    unlock: { study: 2, genes: ['chlorophyll'] },
  },
  {
    id: 'saltpetal', name: 'Saltpetal', arch: 'flower', tier: 2,
    w: 18, h: 26, mat: 'petalWhite', stemMat: 'leafDry', coreMat: 'petalPink',
    petals: 6, headR: 3.0, stems: 2, seed: 199,
    cost: 168, upkeep: 0.06, yield: 0.52, grow: 66,
    gene: 'pollen', attracts: ['sunmoth', 'glasswing', 'saltlark'],
    desc: 'Opens white and closes grey, once, and that is the whole of its life. '
      + 'The crust it grows out of would kill anything else.',
    boon: { attract: 1.28 }, boonText: 'One enormous flowering. Everything with wings notices.',
    unlock: { study: 2, genes: ['chlorophyll'] },
  },
  {
    id: 'stonefig', name: 'Stonefig', arch: 'tree', tier: 3,
    w: 34, h: 40, mat: 'leaf', stemMat: 'woodPale', fruitMat: 'berry', fruit: 7, fruitR: 2.1,
    depth: 3, seed: 223,
    cost: 360, upkeep: 0.18, yield: 0.86, grow: 130,
    gene: 'heartwood', attracts: ['boneheron', 'ridgeback', 'quilljerboa'],
    desc: 'Cracks rock to get at what is under it and then lives in the crack. Fruits '
      + 'twice a season, for about ninety years.',
    boon: { hp: 22, yield: 1.10 }, boonText: 'Splits the hardpan. Everything beside it does better.',
    hands: { by: "tool", why: "It wants a slot cut in rock, and you have a claw." },
    unlock: { study: 3, genes: ['reservoir'] },
  },
  {
    id: 'nightcup', name: 'Nightcup', arch: 'fungus', tier: 3,
    w: 20, h: 22, mat: 'petalPink', stemMat: 'bone', gillMat: 'glow', capMat: 'petalPink',
    stems: 3, seed: 227,
    cost: 320, upkeep: 0.12, yield: 0.70, grow: 108,
    gene: 'luminance', attracts: ['lanternbeetle', 'sunmoth'],
    desc: 'Fruits in one night, lights up, drops, and is gone by morning. Nobody has '
      + 'ever seen one in daylight.',
    boon: { attract: 1.20, trust: 1.08 }, boonText: 'A light in the dark. Night things come to it.',
    hands: { by: "hands", why: "The stipe is the width of a hair until it is not." },
    unlock: { study: 3, genes: ['mycelium'] },
  },
  {
    id: 'ironwood', name: 'Ironwood', arch: 'tree', tier: 3,
    w: 40, h: 46, mat: 'leaf', stemMat: 'wood', fruitMat: 'fruitGold', fruit: 6, fruitR: 1.9,
    depth: 4, seed: 113,
    cost: 400, upkeep: 0.22, yield: 0.95, grow: 150,
    gene: 'heartwood', attracts: ['ridgeback', 'saltlark', 'boneheron'],
    desc: 'Wood so dense it sinks in water. A century of growth, if you keep it drinking.',
    boon: { armour: 0.08, hp: 30 }, boonText: 'Roots into the shell itself. You are harder to hurt.',
    hands: { by: "tool", why: "That bed is hardpan. Somebody needs a real tool and a real swing." },
    unlock: { genes: ['reservoir'], nutrients: 60 },
  },
  {
    id: 'ghostpalm', name: 'Ghost Palm', arch: 'tree', tier: 3,
    w: 38, h: 52, mat: 'leafBlue', stemMat: 'woodPale', leafW: 0.3, leafFat: 0.4,
    depth: 3, seed: 127,
    cost: 470, upkeep: 0.26, yield: 0.88, grow: 165,
    gene: 'canopy', attracts: ['boneheron', 'sunmoth', 'glasswing'],
    desc: 'Pale as bone and twice as patient. Its shade is measurably cooler than any other shade.',
    boon: { grow: 0.86, speed: 1.06 }, boonText: 'Deep shade. You move in the cool of your own canopy.',
    hands: { by: "tool", why: "Hardpan again, and twice as deep." },
    unlock: { genes: ['shade', 'mycelium'] },
  },
  {
    id: 'mindcap', name: 'Mindcap', arch: 'fungus', tier: 3,
    w: 26, h: 26, mat: 'petalWhite', stemMat: 'woodPale', capMat: 'petalPink', seed: 211,
    cost: 520, upkeep: 0.20, yield: 0.0, grow: 150,
    gene: 'mycelium', attracts: ['ironbacktick', 'duneskink'],
    desc: 'It fruits things that are almost animals. They hatch looking for a nervous system, '
      + 'and yours is already taken.',
    boon: { trust: 1.15 }, boonText: 'Fruits parasites instead of food. They ride other animals for you.',
    hands: { by: "hands", why: "Nobody is putting a mindcap in the ground with their mouth." },
    unlock: { genes: ['mycelium', 'shade'], nutrients: 140 },
  },
  {
    id: 'heartbloom', name: 'Heartbloom', arch: 'flower', tier: 4,
    w: 26, h: 40, mat: 'petalPink', stemMat: 'leaf', coreMat: 'glow', petals: 11, headR: 5.0,
    stems: 1, seed: 149,
    cost: 760, upkeep: 0.30, yield: 1.35, grow: 200,
    gene: 'bloom', attracts: ['sunmoth', 'lanternbeetle', 'saltlark'],
    desc: 'It opens once a day, for about a minute. Creatures come from kilometres away to see it.',
    boon: { attract: 1.45, yield: 1.15 }, boonText: 'Opens once a day. Things cross a desert for it.',
    hands: { by: "tool", why: "It goes in a metre down or it does not go in at all." },
    unlock: { genes: ['luminance'], nutrients: 180 },
  },
  {
    id: 'worldvine', name: 'Worldvine', arch: 'vine', tier: 4,
    w: 40, h: 60, mat: 'leaf', stemMat: 'wood', fruitMat: 'berry', fruitR: 2.0, seed: 163,
    cost: 980, upkeep: 0.42, yield: 1.70, grow: 240,
    gene: 'genesis', attracts: ['ridgeback', 'boneheron', 'saltlark'],
    desc: 'Grows down your shell and into the sand, and the sand under it comes back to life.',
    boon: { yield: 1.30, pondGain: 0.02, upkeep: -0.10 }, boonText: 'The sand under it comes back to life.',
    hands: { by: "digger", why: "Something with claws has to open the whole bed first." },
    unlock: { genes: ['heartwood', 'canopy'], nutrients: 320 },
  },
];

/**
 * How each plant actually pays you.
 *
 * Nothing on your back trickles nutrients into a counter while you are not
 * looking. A plant ripens, you notice, and you pick it - so every plant needs
 * a cadence of its own, and the interesting ones need a condition instead of a
 * clock. `ripen` is seconds to ready, `pay` is nutrients per pick, `mass` is
 * what it weighs on the shell, and `needs` is a condition that has to hold
 * before it will ripen at all.
 */
const HARVEST = {
  dustmoss:   { ripen: 14, pay: 3, mass: 0.6 },
  saltgrass:  { ripen: 18, pay: 5, mass: 0.7 },
  sandwheat:  { ripen: 20, pay: 26, mass: 0.8, crops: 1 },
  sunpod:     { ripen: 30, pay: 40, mass: 1.1, crops: 1, needs: 'sun' },
  ashroot:    { ripen: 40, pay: 30, mass: 1.9 },
  saltpetal:  { ripen: 34, pay: 58, mass: 1.0, crops: 1, needs: 'dusk' },
  stonefig:   { ripen: 56, pay: 46, mass: 3.4 },
  nightcup:   { ripen: 44, pay: 74, mass: 1.2, crops: 1, needs: 'night' },
  emberberry: { ripen: 26, pay: 14, mass: 1.5, needs: 'dusk' },
  bluefern:   { ripen: 30, pay: 13, mass: 1.6, needs: 'shade' },
  sunspindle: { ripen: 22, pay: 12, mass: 1.2, needs: 'sun' },
  thornmelon: { ripen: 46, pay: 26, mass: 2.2 },
  cloudcap:   { ripen: 24, pay: 18, mass: 1.3, needs: 'night' },
  glasslily:  { ripen: 34, pay: 24, mass: 1.4, needs: 'pond' },
  ribbonkelp: { ripen: 28, pay: 20, mass: 1.8, needs: 'pond' },
  pipereed:   { ripen: 32, pay: 22, mass: 1.7, needs: 'pond' },
  ironwood:   { ripen: 68, pay: 58, mass: 4.2 },
  ghostpalm:  { ripen: 60, pay: 52, mass: 3.8, needs: 'night' },
  mindcap:    { ripen: 64, pay: 0, mass: 2.4, needs: 'shade', parasite: 1 },
  heartbloom: { ripen: 78, pay: 96, mass: 3.0, needs: 'fleet' },
  worldvine:  { ripen: 92, pay: 130, mass: 5.0 },
};

/** What a condition wants, in words, for the tooltip and the ripeness pip. */
/** The pictogram for each condition, drawn instead of the sentence. */
export const NEEDS_ICON = {
  sun: 'sun', dusk: 'dusk', night: 'moon', shade: 'shade', pond: 'drop', fleet: 'nest',
};

export const NEEDS_TEXT = {
  sun: 'ripens in daylight',
  dusk: 'ripens at dusk and dawn',
  night: 'ripens after dark',
  shade: 'ripens under something taller',
  pond: 'ripens with water in the basin',
  fleet: 'ripens while something lives on you',
};

for (const f of FLORA) Object.assign(f, HARVEST[f.id] || { ripen: 30, pay: 10, mass: 1.4 });

/** True when picking this one uses it up. */
export function isAnnual(def) { return !!def && (def.crops || 0) === 1; }

export const FLORA_BY_ID = Object.fromEntries(FLORA.map((f) => [f.id, f]));

/** Growth stage names, used by the codex and the tooltips. */
export const STAGE_NAME = ['seed', 'sprout', 'young', 'mature'];
