// CRABDEN - genes, skills, evolutions and the things you build on your back.
//
// The through-line: plants and animals express genes, genes unlock evolutions,
// evolutions change what the crab physically is. Skills are bought with
// nutrients and are cheap and broad; evolutions are gated by genes and are
// rare and structural.

export const GENES = [
  { id: 'chlorophyll', name: 'Chlorophyll', from: 'Dustmoss, Saltgrass', desc: 'The oldest trick: light into sugar.' },
  { id: 'sugar', name: 'Fructose', from: 'Emberberry', desc: 'Fruit. The reason anything comes to visit.' },
  { id: 'shade', name: 'Canopy Shade', from: 'Bluefern', desc: 'Cool air under leaves - a habitat all by itself.' },
  { id: 'pollen', name: 'Pollen', from: 'Sunspindle', desc: 'Plants that need a courier, and couriers that need paying.' },
  { id: 'reservoir', name: 'Reservoir', from: 'Thornmelon', desc: 'Tissue that holds a week of water.' },
  { id: 'mycelium', name: 'Mycelium', from: 'Cloudcap', desc: 'A network under the soil that shares what it finds.' },
  { id: 'luminance', name: 'Luminance', from: 'Glass Lily', desc: 'Living light. Nothing out here had this before.' },
  { id: 'ocean', name: 'Ocean Memory', from: 'Ribbon Kelp, Pipe Reed', desc: 'Genes that still expect salt water.' },
  { id: 'heartwood', name: 'Heartwood', from: 'Ironwood', desc: 'Structure. Something to build against.' },
  { id: 'canopy', name: 'High Canopy', from: 'Ghost Palm', desc: 'Shade thrown far enough to shelter a whole camp.' },
  { id: 'bloom', name: 'Bloom', from: 'Heartbloom', desc: 'A signal loud enough to cross a desert.' },
  { id: 'genesis', name: 'Genesis', from: 'Worldvine', desc: 'The sand under it comes back to life. Nobody knows why.' },
  { id: 'hop', name: 'Spring Joint', from: 'Sand Hopper', desc: 'A leg that stores energy instead of spending it.' },
  { id: 'plume', name: 'Plume', from: 'Dunefowl', desc: 'Feathers, and what feathers imply.' },
  { id: 'burrow', name: 'Burrow Sense', from: 'Quillhare', desc: 'Hearing water through two metres of sand.' },
  { id: 'wing', name: 'Wing', from: 'Glasswing', desc: 'Flight, kept alive by something small enough to afford it.' },
  { id: 'moist', name: 'Mucus Film', from: 'Mist Snail', desc: 'A skin that refuses to let water leave.' },
  { id: 'dusk', name: 'Dusk Sight', from: 'Sun Moth', desc: 'Eyes tuned for the hour everything comes out.' },
  { id: 'lumen', name: 'Lumen Organ', from: 'Lanternbug', desc: 'Cold light, made on purpose.' },
  { id: 'bulwark', name: 'Bulwark', from: 'Ridgeback', desc: 'Bone plate that grew because it had to.' },
  { id: 'watch', name: "Watcher's Eye", from: 'Bone Heron', desc: 'Stillness, then certainty.' },
  { id: 'tide', name: 'Tide Sense', from: 'Tidewader', desc: 'A body that still keeps tide time.' },
  { id: 'song', name: 'Song', from: 'Skylark', desc: 'The first new song in a thousand years.' },
];

export const GENE_BY_ID = Object.fromEntries(GENES.map((g) => [g.id, g]));

// ---------------------------------------------------------------------------

export const SKILLS = [
  // -- water ----------------------------------------------------------------
  { id: 'deepwell', name: 'Deep Well', branch: 'water', cost: 12, x: 0, y: 0, req: [],
    effect: { pumpGain: 3 }, desc: 'Each pump brings up more water.' },
  { id: 'cistern', name: 'Cistern', branch: 'water', cost: 22, x: 1, y: -1, req: ['deepwell'],
    effect: { waterMax: 90 }, desc: 'You can hold a great deal more before it spills.' },
  { id: 'artesian', name: 'Artesian Pressure', branch: 'water', cost: 40, x: 2, y: -1, req: ['cistern'],
    effect: { pumpGain: 5, pondGain: 0.04 }, desc: 'The spring runs on its own between pumps.' },
  { id: 'condenser', name: 'Night Condenser', branch: 'water', cost: 34, x: 1, y: 1, req: ['deepwell'],
    effect: { nightWater: 1.4 }, desc: 'The shell sweats water out of the cold night air.' },
  { id: 'aquifer', name: 'Aquifer Tap', branch: 'water', cost: 70, x: 3, y: 0, req: ['artesian', 'condenser'],
    effect: { pumpGain: 8, waterMax: 160 }, desc: 'You have found what is left of the water table.' },

  // -- garden ---------------------------------------------------------------
  { id: 'terrace', name: 'Terracing', branch: 'garden', cost: 18, x: 0, y: 0, req: [],
    effect: { plots: 1 }, desc: 'Cut a ledge into the shell. One more planting bed.' },
  { id: 'mulch', name: 'Mulching', branch: 'garden', cost: 26, x: 1, y: -1, req: ['terrace'],
    effect: { upkeep: -0.25 }, desc: 'Plants on your back drink a quarter less.' },
  { id: 'grafting', name: 'Grafting', branch: 'garden', cost: 44, x: 2, y: -1, req: ['mulch'],
    effect: { grow: 0.7 }, desc: 'Everything reaches maturity noticeably sooner.' },
  { id: 'terrace2', name: 'Upper Terrace', branch: 'garden', cost: 48, x: 1, y: 1, req: ['terrace'],
    effect: { plots: 2 }, desc: 'Two more beds, high on the crest.' },
  { id: 'orchard', name: 'Orchard', branch: 'garden', cost: 86, x: 3, y: 0, req: ['grafting', 'terrace2'],
    effect: { yield: 1.5, berryRate: 1.6 }, desc: 'Fruit sets heavily, and keeps setting.' },

  // -- creatures ------------------------------------------------------------
  { id: 'calling', name: 'Calling', branch: 'fleet', cost: 16, x: 0, y: 0, req: [],
    effect: { attract: 1.25 }, desc: 'You have learned to be worth approaching.' },
  { id: 'trust', name: 'Patience', branch: 'fleet', cost: 28, x: 1, y: -1, req: ['calling'],
    effect: { trust: 1.6 }, desc: 'Wild things settle around you far quicker.' },
  { id: 'command', name: 'Command', branch: 'fleet', cost: 46, x: 2, y: -1, req: ['trust'],
    effect: { orders: true }, desc: 'Give your fleet standing orders: follow, guard, ride.' },
  { id: 'roost', name: 'Roosting', branch: 'fleet', cost: 38, x: 1, y: 1, req: ['calling'],
    effect: { fleetSlots: 2 }, desc: 'Room on the shell for two more residents.' },
  { id: 'symbiosis', name: 'Symbiosis', branch: 'fleet', cost: 90, x: 3, y: 0, req: ['command', 'roost'],
    effect: { fleetSlots: 3, yield: 1.3 }, desc: 'The animals work the garden without being asked.' },

  // -- body -----------------------------------------------------------------
  { id: 'stride', name: 'Long Stride', branch: 'body', cost: 14, x: 0, y: 0, req: [],
    effect: { speed: 1.2 }, desc: 'Cover ground without spending more water.' },
  { id: 'carapace', name: 'Thick Carapace', branch: 'body', cost: 30, x: 1, y: -1, req: ['stride'],
    effect: { armour: 0.25, hp: 40 }, desc: 'A quarter of what hits you does nothing.' },
  { id: 'pincer', name: 'Crushing Pincer', branch: 'body', cost: 42, x: 2, y: -1, req: ['carapace'],
    effect: { dmg: 12 }, desc: 'The claw closes hard enough to matter.' },
  { id: 'burrowing', name: 'Burrowing', branch: 'body', cost: 36, x: 1, y: 1, req: ['stride'],
    effect: { dig: true }, desc: 'Dig into the sand. Storms and ambushes pass over you.' },
  { id: 'ancient', name: 'Ancient Frame', branch: 'body', cost: 96, x: 3, y: 0, req: ['pincer', 'burrowing'],
    effect: { hp: 120, armour: 0.2, speed: 1.15 }, desc: 'You remember being much larger than this.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const BRANCHES = [
  { id: 'water', name: 'Spring', color: '#5fc6d8' },
  { id: 'garden', name: 'Garden', color: '#8cc468' },
  { id: 'fleet', name: 'Fleet', color: '#e2b74a' },
  { id: 'body', name: 'Body', color: '#c8925f' },
];

// ---------------------------------------------------------------------------
// Evolutions: gated by genes you can only get by actually growing things.

export const EVOLUTIONS = [
  {
    id: 'juvenile', name: 'Juvenile', stage: 'juvenile', nutrients: 40,
    genes: ['chlorophyll'], req: [],
    desc: 'The shell thickens and the basin deepens. You can carry more life.',
  },
  {
    id: 'mossback', name: 'Mossback', stage: null, nutrients: 55,
    genes: ['chlorophyll', 'moist'], req: ['juvenile'],
    effect: { upkeep: -0.2, plots: 1 },
    desc: 'Your shell holds moisture on its own. Plants stop being thirsty.',
  },
  {
    id: 'adult', name: 'Adult', stage: 'adult', nutrients: 140,
    genes: ['sugar', 'shade'], req: ['juvenile'],
    desc: 'Full size. The garden on your back is now a landscape.',
  },
  {
    id: 'springheart', name: 'Springheart', stage: null, nutrients: 180,
    genes: ['reservoir', 'ocean'], req: ['adult'],
    effect: { pumpGain: 10, pondGain: 0.05, waterMax: 200 },
    desc: 'The organ reaches something deep. It does not run dry any more.',
  },
  {
    id: 'ironshell', name: 'Ironshell', stage: null, nutrients: 210,
    genes: ['heartwood', 'bulwark'], req: ['adult'],
    effect: { armour: 0.3, hp: 150, dmg: 14 },
    desc: 'Wood and bone grown into the shell. Very little gets through it.',
  },
  {
    id: 'lantern', name: 'Lantern Crab', stage: null, nutrients: 190,
    genes: ['luminance', 'lumen'], req: ['adult'],
    effect: { light: 1, nightWater: 1.5 },
    desc: 'You glow. Nothing that hunts by dark wants to be near you.',
  },
  {
    id: 'ancient', name: 'Ancient', stage: 'ancient', nutrients: 420,
    genes: ['genesis', 'bloom', 'song'], req: ['springheart', 'ironshell'],
    desc: 'You are what the desert grows around now. The map redraws itself behind you.',
  },
];

export const EVO_BY_ID = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------
// Buildings sit in shell plots alongside plants.

export const BUILDINGS = [
  { id: 'cistern', name: 'Cistern', kind: 'tank', w: 14, h: 12, cost: 60, nut: 6,
    effect: { waterMax: 70 }, desc: 'A sealed stone tank. Holds water you would otherwise lose.' },
  { id: 'windcatcher', name: 'Windcatcher', kind: 'tower', w: 12, h: 22, cost: 90, nut: 12,
    effect: { nightWater: 1.2 }, desc: 'Catches the night wind and wrings it out.' },
  { id: 'compost', name: 'Compost Frame', kind: 'crate', w: 14, h: 10, cost: 70, nut: 8,
    effect: { yield: 1.3 }, desc: 'Everything that falls goes back in. Nutrients up a third.' },
  { id: 'roostbox', name: 'Roost', kind: 'hut', w: 15, h: 14, cost: 110, nut: 16,
    effect: { fleetSlots: 2, trust: 1.3 }, desc: 'Somewhere for your fleet to sleep out of the sun.' },
  { id: 'trellis', name: 'Trellis', kind: 'frame', w: 16, h: 16, cost: 80, nut: 10,
    effect: { grow: 0.82 }, desc: 'Climbing plants grow along it and mature sooner.' },
  { id: 'watchtower', name: 'Watchpost', kind: 'tower', w: 11, h: 24, cost: 140, nut: 22,
    effect: { warn: 1 }, desc: 'You see an ambush being set instead of walking into it.' },
  { id: 'shrine', name: 'Old Shrine', kind: 'shrine', w: 13, h: 18, cost: 200, nut: 40,
    effect: { attract: 1.4, yield: 1.2 }, desc: 'Salvaged from a ruin. Everything likes it and nobody knows why.' },
];

export const BUILD_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
