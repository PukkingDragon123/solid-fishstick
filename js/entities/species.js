// CRABDEN - the bestiary. Every animal is a plausible descendant of something
// that exists today, 1,000 years of desert later.
//
// form   -> which procedural body plan sprites.js draws
// role   -> wild (neutral), companion (tameable), hostile, rare (mechanic key)
// work   -> ecosystem ability granted when the creature is assigned to a grove

export const WORKS = {
  forage:   { name: 'Forage',        desc: 'Flies out and brings back water, berries or scrap.' },
  seed:     { name: 'Seed Spread',   desc: 'Drops seeds around the grove. New moss and bushes, free.' },
  digwater: { name: 'Dowse',         desc: 'Sniffs out underground water and opens a seep.' },
  guard:    { name: 'Guard',         desc: 'Attacks anything hostile that comes near the grove.' },
  pollinate:{ name: 'Pollinate',     desc: 'Plants in range grow noticeably faster.' },
  compost:  { name: 'Compost',       desc: 'Turns dead matter into nutrients instead of dust.' },
  scout:    { name: 'Scout',         desc: 'Reveals landmarks and oases across the region.' },
  purify:   { name: 'Purify',        desc: 'Cleans brine. Increases your water storage.' },
  refract:  { name: 'Refract',       desc: 'Bends daylight onto the grove. Growth bonus while the sun is up.' },
  nightsee: { name: 'Nightlight',    desc: 'Lights the grove and spots hostiles before they arrive.' },
  till:     { name: 'Till',          desc: 'Breaks the crust so plants spread much further.' },
  rain:     { name: 'Seed the Sky',  desc: 'Calls actual rain over your grove. Yes. Rain.' },
  aquifer:  { name: 'Aquifer Tap',   desc: 'Opens a permanent line to the water under the world.' },
  haul:     { name: 'Haul',          desc: 'Carries water between oases and your grove.' },
};

const S = [];
const def = (o) => { S.push(o); return o; };

// --- friendly / neutral ----------------------------------------------------

def({
  id: 'skimmer', name: 'Dune Skimmer', latin: 'Calidris arenae',
  ancestor: 'sandpiper',
  desc: 'Still runs along a shoreline that has not existed for ten centuries. Nobody has told it. Nobody will.',
  regions: ['dunes', 'bonereef', 'saltpan'], role: 'companion', rarity: 1, ecoTier: 1,
  form: 'bird', size: 7, hp: 14, speed: 42, dmg: 3, sense: 90,
  pal: ['#d8c39a', '#f0e3c2', '#8a6b45', '#e2683c'],
  body: { legs: 2, legLen: 6, wings: true, beak: 5, tail: 4, crest: 0 },
  behavior: 'flock', tame: { item: 'berry', cost: 3 },
  work: 'forage', flying: true,
});

def({
  id: 'wirefinch', name: 'Wirefinch', latin: 'Carduelis ferrum',
  ancestor: 'finch',
  desc: 'Nests exclusively in rebar. Sings in a key best described as "structural".',
  regions: ['rustlands', 'dunes'], role: 'companion', rarity: 1, ecoTier: 2,
  form: 'bird', size: 5, hp: 10, speed: 50, dmg: 2, sense: 80,
  pal: ['#b8663c', '#e8a86a', '#4a2f22', '#f2d24a'],
  body: { legs: 2, legLen: 4, wings: true, beak: 3, tail: 5, crest: 2 },
  behavior: 'flock', tame: { item: 'berry', cost: 4 },
  work: 'seed', flying: true,
});

def({
  id: 'dustmoth', name: 'Dust Moth', latin: 'Noctua pulveris',
  ancestor: 'moth',
  desc: 'Drinks the sweat off other animals. Deeply unpopular. Excellent pollinator.',
  regions: ['dunes', 'ashwood', 'bonereef'], role: 'companion', rarity: 1, ecoTier: 1,
  form: 'moth', size: 5, hp: 8, speed: 34, dmg: 1, sense: 60,
  pal: ['#c9bda4', '#efe6d0', '#6f6553', '#c98fb4'],
  body: { legs: 6, legLen: 3, wings: true, antennae: true },
  behavior: 'drift', tame: { item: 'water', cost: 6 },
  work: 'pollinate', flying: true, nocturnal: true,
});

def({
  id: 'tumbler', name: 'Tumbler Beetle', latin: 'Scarabaeus rotundus',
  ancestor: 'dung beetle',
  desc: 'Rolls a ball of compost the size of its own regrets. Will not be helped.',
  regions: ['dunes', 'rustlands', 'saltpan'], role: 'companion', rarity: 1, ecoTier: 1,
  form: 'beetle', size: 6, hp: 22, speed: 20, dmg: 3, sense: 50,
  pal: ['#3b3a44', '#5f5e70', '#22212a', '#7fa05a'],
  body: { legs: 6, legLen: 4, shell: true, horn: 2 },
  behavior: 'push', tame: { item: 'water', cost: 8 },
  work: 'compost',
});

def({
  id: 'humprat', name: 'Humprat', latin: 'Rattus dromedarius',
  ancestor: 'rat',
  desc: 'Grew two humps and a smug expression. Can smell water through forty feet of rock.',
  regions: ['dunes', 'saltpan', 'bonereef'], role: 'companion', rarity: 2, ecoTier: 2,
  form: 'mammal', size: 9, hp: 34, speed: 38, dmg: 5, sense: 140,
  pal: ['#a98a63', '#d8c09a', '#5e4732', '#e8a0a8'],
  body: { legs: 4, legLen: 6, tail: 10, ears: 4, humps: 2 },
  behavior: 'scurry', tame: { item: 'water', cost: 14 },
  work: 'digwater',
});

def({
  id: 'sunlicker', name: 'Sunlicker', latin: 'Gekko solaris',
  ancestor: 'gecko',
  desc: 'Absorbs heat all day, spends it all in one four-second burst of violence.',
  regions: ['dunes', 'glassflats', 'rustlands'], role: 'companion', rarity: 2, ecoTier: 2,
  form: 'lizard', size: 10, hp: 46, speed: 34, dmg: 11, sense: 110,
  pal: ['#c8823c', '#f0c168', '#5f3a1c', '#38b0a0'],
  body: { legs: 4, legLen: 5, tail: 14, frill: 4 },
  behavior: 'bask', tame: { item: 'water', cost: 18 },
  work: 'guard',
});

def({
  id: 'glasswing', name: 'Glasswing Fox', latin: 'Vulpes vitrea',
  ancestor: 'fennec fox',
  desc: 'Ears went translucent to shed heat. Now it hears the shape of the horizon.',
  regions: ['glassflats', 'dunes'], role: 'companion', rarity: 3, ecoTier: 3,
  form: 'mammal', size: 12, hp: 52, speed: 62, dmg: 12, sense: 220,
  pal: ['#e7d9bd', '#fbf3e2', '#8d7a5e', '#9fd8ee'],
  body: { legs: 4, legLen: 8, tail: 16, ears: 9, glassEars: true },
  behavior: 'prowl', tame: { item: 'berry', cost: 12 },
  work: 'scout',
});

def({
  id: 'reefstrider', name: 'Reefstrider', latin: 'Ligia altipes',
  ancestor: 'sea slater',
  desc: 'Walks the dead reef on stilts, eating fossils. A distant, embarrassing cousin of yours.',
  regions: ['bonereef'], role: 'companion', rarity: 2, ecoTier: 2,
  form: 'crustacean', size: 11, hp: 60, speed: 26, dmg: 8, sense: 90,
  pal: ['#b3ab92', '#ded6bb', '#726a56', '#c46a5c'],
  body: { legs: 8, legLen: 11, shell: true, antennae: true },
  behavior: 'graze', tame: { item: 'water', cost: 16 },
  work: 'purify',
});

def({
  id: 'stiltwader', name: 'Stiltwader', latin: 'Phoenicopterus siccus',
  ancestor: 'flamingo',
  desc: 'Still stands in water up to its knees. There is no water. It stands anyway.',
  regions: ['saltpan', 'bonereef'], role: 'companion', rarity: 3, ecoTier: 3,
  form: 'bird', size: 16, hp: 48, speed: 30, dmg: 7, sense: 130,
  pal: ['#e8a6b0', '#f8d6da', '#8c5560', '#2f2f38'],
  body: { legs: 2, legLen: 18, wings: true, beak: 7, neck: 12, tail: 5 },
  behavior: 'wade', tame: { item: 'water', cost: 24 },
  work: 'purify',
});

def({
  id: 'brineling', name: 'Brineling', latin: 'Artemia magna',
  ancestor: 'brine shrimp',
  desc: 'Got very big when nothing was left to eat it. Filters salt out of anything, including you.',
  regions: ['saltpan'], role: 'companion', rarity: 2, ecoTier: 3,
  form: 'crustacean', size: 8, hp: 30, speed: 30, dmg: 4, sense: 70,
  pal: ['#f0b8a0', '#ffe0cd', '#a06a58', '#6fd8e8'],
  body: { legs: 10, legLen: 4, antennae: true, translucent: true },
  behavior: 'drift', tame: { item: 'water', cost: 10 },
  work: 'purify',
});

def({
  id: 'prismling', name: 'Prismling', latin: 'Mantis refringens',
  ancestor: 'mantis',
  desc: 'Carapace grew crystal facets. Prays constantly. Nobody knows to what.',
  regions: ['glassflats'], role: 'companion', rarity: 3, ecoTier: 3,
  form: 'mantis', size: 9, hp: 36, speed: 32, dmg: 14, sense: 100,
  pal: ['#9fd0dc', '#e6fbff', '#4f7a88', '#f6f0a0'],
  body: { legs: 6, legLen: 7, scythes: true, crystal: true },
  behavior: 'stalk', tame: { item: 'water', cost: 20 },
  work: 'refract',
});

def({
  id: 'scrapmole', name: 'Scrapmole', latin: 'Talpa metallica',
  ancestor: 'mole',
  desc: 'Digs through the old cities. Brings back objects it does not understand and neither do you.',
  regions: ['rustlands'], role: 'companion', rarity: 2, ecoTier: 3,
  form: 'mammal', size: 10, hp: 58, speed: 22, dmg: 9, sense: 60,
  pal: ['#5a4638', '#8a6b52', '#332720', '#c08a3a'],
  body: { legs: 4, legLen: 3, tail: 4, ears: 1, claws: 5 },
  behavior: 'burrow', tame: { item: 'berry', cost: 8 },
  work: 'haul',
});

def({
  id: 'emberbat', name: 'Emberbat', latin: 'Pipistrellus cineris',
  ancestor: 'bat',
  desc: 'Roosts in petrified trees and glows faintly at the ribs. Nobody has asked why.',
  regions: ['ashwood'], role: 'companion', rarity: 3, ecoTier: 3,
  form: 'bat', size: 7, hp: 26, speed: 58, dmg: 8, sense: 200,
  pal: ['#4a3a48', '#7a6274', '#241e28', '#ff8c46'],
  body: { legs: 2, legLen: 3, wings: true, membrane: true, ears: 5 },
  behavior: 'flock', tame: { item: 'berry', cost: 10 },
  work: 'nightsee', flying: true, nocturnal: true,
});

def({
  id: 'ashsnail', name: 'Ashsnail', latin: 'Helix carbonis',
  ancestor: 'garden snail',
  desc: 'Leaves a trail of unbelievably good soil. Moves at a speed best measured in seasons.',
  regions: ['ashwood', 'bonereef'], role: 'companion', rarity: 2, ecoTier: 2,
  form: 'snail', size: 8, hp: 70, speed: 7, dmg: 1, sense: 40,
  pal: ['#6b5f6e', '#a08fa0', '#3a323e', '#8fd47a'],
  body: { shell: true, spiral: true, antennae: true },
  behavior: 'crawl', tame: { item: 'water', cost: 6 },
  work: 'till',
});

def({
  id: 'cinderboar', name: 'Cinderroot Boar', latin: 'Sus carbonarius',
  ancestor: 'wild boar',
  desc: 'Roots for buried charcoal. Aggressive until fed, at which point it is aggressively loyal.',
  regions: ['ashwood', 'rustlands'], role: 'companion', rarity: 3, ecoTier: 4,
  form: 'mammal', size: 16, hp: 130, speed: 44, dmg: 22, sense: 120,
  pal: ['#4a3c3a', '#6e5a54', '#2a2222', '#e07040'],
  body: { legs: 4, legLen: 7, tail: 5, ears: 4, tusks: 5, mane: true },
  behavior: 'charge', tame: { item: 'berry', cost: 20 }, hostileUntilTamed: true,
  work: 'till',
});

def({
  id: 'duneback', name: 'Duneback', latin: 'Testudo montana',
  ancestor: 'tortoise',
  desc: 'A tortoise the size of a hill, with a hill on its back. Things live up there. It permits this.',
  regions: ['dunes', 'ashwood'], role: 'rare', rarity: 5, ecoTier: 5,
  form: 'tortoise', size: 42, hp: 600, speed: 6, dmg: 0, sense: 60,
  pal: ['#7a6a4e', '#a3946f', '#4a3f2c', '#6f9a4a'],
  body: { legs: 4, legLen: 16, shell: true, dome: true, neck: 14 },
  behavior: 'wander', tame: { item: 'water', cost: 120 },
  work: 'haul', unlock: 'roamingGrove',
});

def({
  id: 'miragejelly', name: 'Mirage Jelly', latin: 'Aurelia caeli',
  ancestor: 'moon jellyfish',
  desc: 'When the sea evaporated, some of it kept going up. So did they.',
  regions: ['glassflats', 'deepwell', 'saltpan'], role: 'rare', rarity: 5, ecoTier: 4,
  form: 'jelly', size: 14, hp: 90, speed: 16, dmg: 0, sense: 150,
  pal: ['#8fd8e8', '#d8f6ff', '#4a7f96', '#f0a0d8'],
  body: { bell: true, tentacles: 7, translucent: true },
  behavior: 'float', tame: { item: 'water', cost: 60 },
  work: 'rain', flying: true, unlock: 'cloudSeeding',
});

def({
  id: 'nautilus', name: 'The Last Nautilus', latin: 'Nautilus ultimus',
  ancestor: 'nautilus',
  desc: 'Walked out of the sea on its tentacles when the sea left. It has been walking ever since.',
  regions: ['deepwell'], role: 'rare', rarity: 6, ecoTier: 5,
  form: 'nautilus', size: 20, hp: 200, speed: 14, dmg: 6, sense: 180,
  pal: ['#e8dcc0', '#fff6e2', '#8a5a4a', '#c04a3c'],
  body: { shell: true, spiral: true, tentacles: 9, eyes: 2 },
  behavior: 'wander', tame: { item: 'water', cost: 150 },
  work: 'aquifer', unlock: 'aquiferTap',
});

// --- hostiles --------------------------------------------------------------

def({
  id: 'thirstmite', name: 'Thirst Mite', latin: 'Acarus sitiens',
  ancestor: 'dust mite',
  desc: 'Individually harmless. There is never one.',
  regions: ['dunes', 'saltpan', 'bonereef', 'rustlands'], role: 'hostile', rarity: 1, ecoTier: 0,
  form: 'mite', size: 4, hp: 8, speed: 52, dmg: 3, sense: 150,
  pal: ['#7a5a3c', '#a8845c', '#3c2c1c', '#d84a4a'],
  body: { legs: 8, legLen: 3 },
  behavior: 'swarm', nocturnal: true, drain: 0.6,
});

def({
  id: 'huskscorpion', name: 'Husk Scorpion', latin: 'Androctonus vacuus',
  ancestor: 'fat-tailed scorpion',
  desc: 'Died a long time ago. Nobody informed the tail.',
  regions: ['dunes', 'bonereef', 'glassflats'], role: 'hostile', rarity: 2, ecoTier: 0,
  form: 'arachnid', size: 13, hp: 70, speed: 40, dmg: 18, sense: 200,
  pal: ['#8a6f3c', '#c4a464', '#3f3018', '#d8e04a'],
  body: { legs: 8, legLen: 8, claws: 6, stinger: true },
  behavior: 'stalk', nocturnal: true,
});

def({
  id: 'rusthound', name: 'Rust Hound', latin: 'Canis oxidatus',
  ancestor: 'feral dog',
  desc: 'Its coat is not fur. Do not let it bite you, and do not let it lick you either.',
  regions: ['rustlands', 'dunes'], role: 'hostile', rarity: 3, ecoTier: 0,
  form: 'mammal', size: 14, hp: 110, speed: 68, dmg: 20, sense: 260,
  pal: ['#8a4a2c', '#c47a44', '#402214', '#ff5a30'],
  body: { legs: 4, legLen: 9, tail: 12, ears: 5, mane: true, spikes: true },
  behavior: 'pack',
});

def({
  id: 'glasscrawler', name: 'Glass Crawler', latin: 'Solifugae vitrea',
  ancestor: 'camel spider',
  desc: 'Transparent. You will see it only as a smear of moving horizon. Good luck.',
  regions: ['glassflats'], role: 'hostile', rarity: 4, ecoTier: 0,
  form: 'arachnid', size: 12, hp: 85, speed: 78, dmg: 16, sense: 220,
  pal: ['#a8c8d8', '#e0f4ff', '#5a7a8a', '#ff7a9a'],
  body: { legs: 8, legLen: 10, jaws: 5, translucent: true },
  behavior: 'ambush',
});

def({
  id: 'saltwraith', name: 'Salt Wraith', latin: 'Larus salis',
  ancestor: 'seagull',
  desc: 'A gull that crystallised mid-scream and kept flying. Still wants your food.',
  regions: ['saltpan', 'bonereef'], role: 'hostile', rarity: 4, ecoTier: 0,
  form: 'bird', size: 15, hp: 90, speed: 74, dmg: 15, sense: 240,
  pal: ['#e2e6ea', '#ffffff', '#93a0aa', '#ff4a6a'],
  body: { legs: 2, legLen: 6, wings: true, beak: 8, tail: 7, crystal: true },
  behavior: 'dive', nocturnal: true, flying: true,
});

def({
  id: 'ashstalker', name: 'Ashstalker', latin: 'Felis cineris',
  ancestor: 'sand cat',
  desc: 'Hunts by holding perfectly still inside a column of falling ash. It is very good at this.',
  regions: ['ashwood'], role: 'hostile', rarity: 4, ecoTier: 0,
  form: 'mammal', size: 13, hp: 120, speed: 72, dmg: 24, sense: 250,
  pal: ['#4e4450', '#7a6c7c', '#2a242e', '#ffb03a'],
  body: { legs: 4, legLen: 8, tail: 15, ears: 6, whisk: true },
  behavior: 'ambush', nocturnal: true,
});

def({
  id: 'leviathan', name: 'Husk of the Last Leviathan', latin: 'Balaena finis',
  ancestor: 'blue whale',
  desc: 'It beached itself at the exact moment the ocean drained. Something else lives in it now.',
  regions: ['deepwell'], role: 'boss', rarity: 6, ecoTier: 5,
  form: 'leviathan', size: 60, hp: 1500, speed: 26, dmg: 34, sense: 400,
  pal: ['#3a4a54', '#6e8290', '#1e2830', '#7fe0d0'],
  body: { ribs: 9, jaw: true, tail: 30 },
  behavior: 'boss',
});

export const SPECIES = Object.fromEntries(S.map((s) => [s.id, s]));
export const SPECIES_LIST = S;

export function speciesForRegion(regionId, { role = null, ecoTier = 99, night = false } = {}) {
  return S.filter((s) => {
    if (!s.regions.includes(regionId)) return false;
    if (role && s.role !== role) return false;
    if ((s.ecoTier || 0) > ecoTier) return false;
    if (s.nocturnal && !night && s.role === 'hostile') return false;
    return true;
  });
}

export function isHostile(s) { return s.role === 'hostile' || s.role === 'boss'; }
