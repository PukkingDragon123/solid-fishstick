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
  { id: 'sandswim', name: 'Sand Swimming', from: 'Dune Skink', desc: 'A body shaped to treat a dune as water.' },
  { id: 'nocturne', name: 'Night Eye', from: 'Glasstail Gecko', desc: 'A pupil that opens to almost the whole eye.' },
  { id: 'burrow', name: 'Burrow Sense', from: 'Quill Jerboa', desc: 'Hearing water through two metres of sand.' },
  { id: 'wing', name: 'Wing', from: 'Glasswing', desc: 'Flight, kept alive by something small enough to afford it.' },
  { id: 'thornhide', name: 'Thorn Hide', from: 'Horned Pebbler', desc: 'Scales grown into spines that comb dew into the mouth.' },
  { id: 'dusk', name: 'Dusk Sight', from: 'Sun Moth', desc: 'Antennae that read a single molecule at a kilometre.' },
  { id: 'lumen', name: 'Lumen Organ', from: 'Lantern Beetle', desc: 'Cold light, made on purpose.' },
  { id: 'bulwark', name: 'Bulwark', from: 'Ridgeback Grazer', desc: 'Bone plate that grew because it had to.' },
  { id: 'watch', name: "Watcher's Eye", from: 'Bone Heron', desc: 'Stillness, then certainty.' },
  { id: 'ferrous', name: 'Ferrous Sense', from: 'Copper Scarab', desc: 'Navigation by the polarisation of the sky.' },
  { id: 'song', name: 'Song', from: 'Salt Lark', desc: 'The first new song in a thousand years.' },
  { id: 'signal', name: 'Signal Skin', from: 'Ribbon Agama', desc: 'Colour under nervous control, changing in seconds.' },
  { id: 'apex', name: 'Apex Nerve', from: 'Salt Monitor', desc: 'A reptile that caches food and comes back for it.' },
  { id: 'gut', name: 'Ferment Gut', from: 'Thorn Iguana', desc: 'A stomach that turns ironwood into soil.' },
  { id: 'mimic', name: 'Mimic Skin', from: 'Ash Chameleon', desc: 'Tunable photonic crystals instead of pigment.' },
  { id: 'strike', name: 'Strike Reflex', from: 'Mirror Mantis', desc: 'Fifty milliseconds from still to closed.' },
  { id: 'hearing', name: 'Deep Hearing', from: 'Dust Fennec', desc: 'An insect moving under a hand-span of sand.' },
];

export const GENE_BY_ID = Object.fromEntries(GENES.map((g) => [g.id, g]));

// ---------------------------------------------------------------------------

/**
 * What you can grow into.
 *
 * Five limbs come off the seed, one per system, and each is a real chain: the
 * first node is cheap and obvious, and nothing past it exists until you have
 * it. `x` is how far along its limb a node sits and `y` is which fork of that
 * limb, so a limb branches once and then comes back together at its last node.
 *
 * Every node does exactly one thing that nothing else does. If two nodes would
 * have the same effect, one of them should not be here.
 */
export const SKILLS = [
  // -- SPRING: the organ that makes water ----------------------------------
  { id: 'deepwell', name: 'Deep Well', branch: 'water', icon: 'drop', cost: 12, x: 0, y: 0, req: [],
    effect: { pumpGain: 3 }, desc: 'The duct opens wider. Every second on the valve brings up more.' },
  { id: 'cistern', name: 'Cistern', branch: 'water', icon: 'tank', cost: 22, x: 1, y: -1, req: ['deepwell'],
    effect: { waterMax: 90 }, desc: 'A second chamber behind the first. You can hold far more before it spills.' },
  { id: 'condenser', name: 'Night Condenser', branch: 'water', icon: 'moon', cost: 34, x: 1, y: 1, req: ['deepwell'],
    effect: { nightWater: 1.4 }, desc: 'The shell sweats. Cold night air goes in and water comes out of it.' },
  { id: 'artesian', name: 'Artesian Pressure', branch: 'water', icon: 'jet', cost: 40, x: 2, y: -1, req: ['cistern'],
    effect: { pumpGain: 5, pondGain: 0.04 }, desc: 'It runs on its own between pumps, and the basin fills while you walk.' },
  { id: 'greening', name: 'Greening', branch: 'water', icon: 'sprout', cost: 66, x: 2, y: 1, req: ['condenser'],
    effect: { green: 1 }, desc: 'What spills off your shell soaks in instead of evaporating. The ground behind you comes back.' },
  { id: 'aquifer', name: 'Aquifer Tap', branch: 'water', icon: 'well', cost: 96, x: 3, y: 0, req: ['artesian', 'greening'],
    effect: { pumpGain: 8, waterMax: 160, green: 1 }, desc: 'You have found what is left of the water table, and it knows you.' },

  // -- SHELL: what grows on your back ---------------------------------------
  { id: 'terrace', name: 'Terracing', branch: 'garden', icon: 'step', cost: 18, x: 0, y: 0, req: [],
    effect: { plots: 1 }, desc: 'Cut ledges into the rock. You can carry noticeably more without listing.' },
  { id: 'mulch', name: 'Mulching', branch: 'garden', icon: 'leaf', cost: 26, x: 1, y: -1, req: ['terrace'],
    effect: { upkeep: -0.25 }, desc: 'Everything that falls stays. Plants on your back drink a quarter less.' },
  { id: 'terrace2', name: 'Upper Terrace', branch: 'garden', icon: 'step', cost: 48, x: 1, y: 1, req: ['terrace'],
    effect: { plots: 2 }, desc: 'Beds high on the crest, where nothing shades anything else.' },
  { id: 'grafting', name: 'Grafting', branch: 'garden', icon: 'graft', cost: 44, x: 2, y: -1, req: ['mulch'],
    effect: { grow: 0.7 }, desc: 'Cut and bound. Everything reaches maturity a third sooner.' },
  { id: 'quickfruit', name: 'Quickfruit', branch: 'garden', icon: 'fruit', cost: 58, x: 2, y: 1, req: ['terrace2'],
    effect: { ripen: 0.72 }, desc: 'Your plants come ripe far more often, so there is always something to pick.' },
  { id: 'orchard', name: 'Orchard', branch: 'garden', icon: 'tree', cost: 96, x: 3, y: 0, req: ['grafting', 'quickfruit'],
    effect: { yield: 1.5, berryRate: 1.6 }, desc: 'A closed canopy on the back of a walking animal. It should not work.' },

  // -- BROOD: everything that decides to live on you ------------------------
  { id: 'calling', name: 'Calling', branch: 'fleet', icon: 'call', cost: 16, x: 0, y: 0, req: [],
    effect: { attract: 1.25 }, desc: 'You have learned to be worth the walk across open sand.' },
  { id: 'trust', name: 'Patience', branch: 'fleet', icon: 'hand', cost: 28, x: 1, y: -1, req: ['calling'],
    effect: { trust: 1.6 }, desc: 'You have learned to stand still. Wild things settle much quicker.' },
  { id: 'roost', name: 'Roosting', branch: 'fleet', icon: 'nest', cost: 38, x: 1, y: 1, req: ['calling'],
    effect: { fleetSlots: 2 }, desc: 'Hollows in the rock, out of the sun. Room for two more residents.' },
  { id: 'command', name: 'Command', branch: 'fleet', icon: 'point', cost: 46, x: 2, y: -1, req: ['trust'],
    effect: { orders: true }, desc: 'They watch you now. Point, and something goes where you pointed.' },
  { id: 'brooding', name: 'Brooding', branch: 'fleet', icon: 'egg', cost: 72, x: 2, y: 1, req: ['roost'],
    effect: { breed: 1 }, desc: 'What lives on you breeds on you. Your fleet replaces its own dead.' },
  { id: 'symbiosis', name: 'Symbiosis', branch: 'fleet', icon: 'link', cost: 104, x: 3, y: 0, req: ['command', 'brooding'],
    effect: { fleetSlots: 3, yield: 1.3 }, desc: 'They work the garden without being asked, and it is not clear who decided.' },

  // -- PINCER: the end of your arm ------------------------------------------
  { id: 'pincer', name: 'Crushing Pincer', branch: 'claw', icon: 'claw', cost: 24, x: 0, y: 0, req: [],
    effect: { dmg: 12 }, desc: 'The claw closes hard enough to matter to something with a shell.' },
  { id: 'serrate', name: 'Serration', branch: 'claw', icon: 'saw', cost: 34, x: 1, y: -1, req: ['pincer'],
    effect: { dmg: 10, armourPierce: 0.3 }, desc: 'A cutting edge along the inside. Armour stops helping.' },
  { id: 'digger', name: 'Digging Claw', branch: 'claw', icon: 'spade', cost: 30, x: 1, y: 1, req: ['pincer'],
    effect: { dig: true, fossil: 1 }, desc: 'Broad and flat. You can open the sand, and find what is under it.' },
  { id: 'snapshock', name: 'Snapping Shock', branch: 'claw', icon: 'bolt', cost: 62, x: 2, y: -1, req: ['serrate'],
    effect: { dmg: 20, stun: 1 }, desc: 'It shuts fast enough to leave a hole in the air. Whatever is in the way stops.' },
  { id: 'sifter', name: 'Sifting Comb', branch: 'claw', icon: 'comb', cost: 54, x: 2, y: 1, req: ['digger'],
    effect: { fossil: 2, berryRate: 1.15 }, desc: 'Comb the spoil instead of dropping it. Far more comes up whole.' },
  { id: 'breaker', name: 'Wall Breaker', branch: 'claw', icon: 'hammer', cost: 100, x: 3, y: 0, req: ['snapshock', 'sifter'],
    effect: { dmg: 26, breach: true }, desc: 'You can take a ruin apart. There is usually something inside worth the noise.' },

  // -- LEGS: how you carry all of it ---------------------------------------
  { id: 'stride', name: 'Long Stride', branch: 'legs', icon: 'leg', cost: 14, x: 0, y: 0, req: [],
    effect: { speed: 1.2 }, desc: 'A longer step for the same water. You cover ground.' },
  { id: 'carapace', name: 'Thick Carapace', branch: 'legs', icon: 'shield', cost: 30, x: 1, y: -1, req: ['stride'],
    effect: { armour: 0.25, hp: 40 }, desc: 'Laminate under the rock. A quarter of what hits you does nothing at all.' },
  { id: 'burrowing', name: 'Burrowing', branch: 'legs', icon: 'burrow', cost: 36, x: 1, y: 1, req: ['stride'],
    effect: { dig: true }, desc: 'Fold the legs and go under. Storms and ambushes pass over the top of you.' },
  { id: 'porter', name: 'Porter Frame', branch: 'legs', icon: 'load', cost: 56, x: 2, y: -1, req: ['carapace'],
    effect: { plots: 3 }, desc: 'The legs take the weight instead of the shell. You can carry a great deal more.' },
  { id: 'sandskate', name: 'Sand Skating', branch: 'legs', icon: 'skate', cost: 52, x: 2, y: 1, req: ['burrowing'],
    effect: { speed: 1.3, slope: 1 }, desc: 'Wide feet, no sinking. Dunes stop being hills.' },
  { id: 'ancient', name: 'Ancient Frame', branch: 'legs', icon: 'crown', cost: 112, x: 3, y: 0, req: ['porter', 'sandskate'],
    effect: { hp: 120, armour: 0.2, speed: 1.15, plots: 2 }, desc: 'You remember being very much larger than this.' },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const BRANCHES = [
  { id: 'water', name: 'Spring', color: '#5fc6d8' },
  { id: 'garden', name: 'Shell', color: '#8cc468' },
  { id: 'fleet', name: 'Brood', color: '#e2b74a' },
  { id: 'claw', name: 'Pincer', color: '#d87a6a' },
  { id: 'legs', name: 'Legs', color: '#c8925f' },
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
    genes: ['chlorophyll', 'thornhide'], req: ['juvenile'],
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
