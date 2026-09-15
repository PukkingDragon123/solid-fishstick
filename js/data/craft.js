// CRABDEN - what is in the ground, and what it turns into.
//
// The desert used to be a seabed, so what is under it is what a seabed leaves:
// salt, silica, shell, and the metal that was dissolved in the water when it
// dried. You cannot pick any of it up - you have claws the size of a door and
// no thumbs. He has thumbs.
//
// Items are ids and counts, nothing more. A recipe says what it needs, what it
// makes, and whether it can be done in the hand or wants a bench, and the
// whole tree is three tiers deep on purpose: ore, bar, thing.

/**
 * Everything that can sit in a stack. `icon` names a glyph in js/ui/icons.js,
 * `tint` is what it is drawn in, and `tier` is only used for sorting the bag.
 */
export const ITEMS = [
  // -- raw, straight out of the ground --------------------------------------
  { id: 'grit', name: 'Grit', icon: 'spade', tint: '#c2a271', tier: 0,
    desc: 'Coarse sand with the salt still in it. Everything starts here.' },
  { id: 'saltcake', name: 'Salt Cake', icon: 'comb', tint: '#e6e2d4', tier: 0,
    desc: 'The sea left this lying in sheets. It cuts, it preserves, and it '
      + 'makes glass behave.' },
  { id: 'silica', name: 'Silica', icon: 'well', tint: '#bfe0e4', tier: 0,
    desc: 'White sand, almost nothing else in it. Melts clear.' },
  { id: 'copperore', name: 'Copper Ore', icon: 'link', tint: '#c97a4a', tier: 0,
    desc: 'Green-crusted lumps in a seam. It was in the water once.' },
  { id: 'ironore', name: 'Iron Ore', icon: 'shield', tint: '#8d7a70', tier: 0,
    desc: 'Heavier than it looks, and rusted through before anyone dug it up.' },
  { id: 'shellchip', name: 'Shell Chip', icon: 'nest', tint: '#e4d6b4', tier: 0,
    desc: 'A piece of something that lived here when there was a here to live in.' },
  { id: 'amberchunk', name: 'Raw Amber', icon: 'egg', tint: '#e0a93a', tier: 0,
    desc: 'Resin from a tree that has been gone a thousand years.' },
  { id: 'timber', name: 'Mast Timber', icon: 'tree', tint: '#9a7a48', tier: 0,
    desc: 'The dry inner ribs of a mast. Light, straight, and the only long '
      + 'stiff thing growing within four hundred kilometres.' },
  { id: 'fibre', name: 'Mast Fibre', icon: 'graft', tint: '#a8b06a', tier: 0,
    desc: 'The stringy part, pulled off in lengths and left in the sun. '
      + 'Ties things together and does not care about salt.' },

  // -- refined --------------------------------------------------------------
  { id: 'copperbar', name: 'Copper Bar', icon: 'load', tint: '#e08a4a', tier: 1,
    desc: 'Soft, and it takes an edge badly, but it takes one.' },
  { id: 'ironbar', name: 'Iron Bar', icon: 'load', tint: '#b0a49c', tier: 1,
    desc: 'A bar of it will outlast everyone who has ever handled it.' },
  { id: 'glass', name: 'Glass', icon: 'well', tint: '#9fe8d4', tier: 1,
    desc: 'Silica and salt, held over a fire until it gives up.' },
  { id: 'brick', name: 'Salt Brick', icon: 'burrow', tint: '#d8cdb2', tier: 1,
    desc: 'Grit and salt, pressed and dried. It will do until it rains.' },

  // -- parts ----------------------------------------------------------------
  { id: 'gearset', name: 'Gear Set', icon: 'comb', tint: '#d2a768', tier: 2,
    desc: 'Teeth cut into copper. Something in the ruins was full of these.' },
  { id: 'pipe', name: 'Pipe', icon: 'tank', tint: '#b0a49c', tier: 2,
    desc: 'Iron rolled round a rod. Water goes in one end.' },
  { id: 'pane', name: 'Pane', icon: 'shade', tint: '#9fe8d4', tier: 2,
    desc: 'Flat glass. You can put the sun through it or keep it out.' },
  { id: 'spool', name: 'Spool', icon: 'graft', tint: '#c3bb8d', tier: 2,
    desc: 'Wound fibre. Holds anything to anything.' },
  { id: 'plank', name: 'Plank', icon: 'step', tint: '#c2a06a', tier: 1,
    desc: 'Mast ribs split and laid edge to edge. Flat, which nothing out '
      + 'here is.' },
  { id: 'haft', name: 'Haft', icon: 'hammer', tint: '#b08a52', tier: 2,
    desc: 'A handle. Everything with a head on it needs one, and until there '
      + 'were masts there was nothing to make one out of.' },

  // -- tools he carries ----------------------------------------------------
  { id: 'pickcopper', name: 'Copper Pick', icon: 'hammer', tint: '#e08a4a', tier: 2,
    tool: 'pick', power: 1, desc: 'A pick. It will break sandstone and shell.' },
  { id: 'pickiron', name: 'Iron Pick', icon: 'hammer', tint: '#c6ccd4', tier: 3,
    tool: 'pick', power: 2, desc: 'A better pick. It will break anything down there.' },
  { id: 'sprayer', name: 'Spore Sprayer', icon: 'jet', tint: '#c98ade', tier: 2,
    tool: 'spray', power: 1,
    desc: 'A pipe, a bladder and a pane. It puts a cloud where you point it.' },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/**
 * What each ore is worth taking. `hits` is how many swings it stands, `need`
 * is the pick power that will touch it at all, and `depth` is how far under
 * the surface the seam sits - which is the whole reason a better pick matters,
 * because the deep seams are the ones worth having.
 */
// The ladder has to close, so nothing needs a pick made out of itself: him
// trowel (power 0) gets everything down to copper, copper buys the copper pick
// (power 1), and the copper pick is what opens iron and amber. The iron pick
// is not a gate - it is just faster, and it drops an extra lump.
export const ORES = [
  { id: 'grit', hits: 1, need: 0, depth: [0, 8], weight: 34, colour: '#c2a271' },
  { id: 'shellchip', hits: 2, need: 0, depth: [2, 14], weight: 18, colour: '#e4d6b4' },
  { id: 'saltcake', hits: 2, need: 0, depth: [6, 20], weight: 16, colour: '#e6e2d4' },
  { id: 'silica', hits: 3, need: 0, depth: [10, 26], weight: 12, colour: '#bfe0e4' },
  { id: 'copperore', hits: 4, need: 0, depth: [12, 30], weight: 11, colour: '#c97a4a' },
  { id: 'amberchunk', hits: 4, need: 1, depth: [16, 34], weight: 3, colour: '#e0a93a' },
  { id: 'ironore', hits: 6, need: 1, depth: [20, 40], weight: 6, colour: '#8d7a70' },
];

/**
 * The tree. Three tiers: ore melts into bar, bar becomes part, part becomes a
 * thing that goes on your back. `at` is what it has to be done on - nothing at
 * all, the fire, or the bench - and both of those are things he builds.
 */
export const RECIPES = [
  // hand
  { id: 'brick', at: 'hand', out: ['brick', 1], need: [['grit', 3], ['saltcake', 1]], secs: 1.2 },
  { id: 'spool', at: 'hand', out: ['spool', 1], need: [['fibre', 2]], secs: 1.0 },
  { id: 'spoolshell', at: 'hand', out: ['spool', 1], need: [['shellchip', 3]], secs: 1.4 },
  { id: 'haft', at: 'hand', out: ['haft', 1], need: [['timber', 2], ['fibre', 1]], secs: 1.4 },

  // fire
  { id: 'copperbar', at: 'fire', out: ['copperbar', 1], need: [['copperore', 3]], secs: 2.2 },
  { id: 'ironbar', at: 'fire', out: ['ironbar', 1], need: [['ironore', 4]], secs: 3.0 },
  { id: 'glass', at: 'fire', out: ['glass', 2], need: [['silica', 3], ['saltcake', 1]], secs: 2.0 },

  // bench
  { id: 'plank', at: 'bench', out: ['plank', 2], need: [['timber', 3]], secs: 1.8 },
  { id: 'gearset', at: 'bench', out: ['gearset', 1], need: [['copperbar', 2]], secs: 2.0 },
  { id: 'pipe', at: 'bench', out: ['pipe', 1], need: [['ironbar', 2]], secs: 2.4 },
  { id: 'pane', at: 'bench', out: ['pane', 1], need: [['glass', 2]], secs: 1.6 },
  { id: 'pickcopper', at: 'bench', out: ['pickcopper', 1],
    need: [['copperbar', 2], ['haft', 1]], secs: 2.6 },
  { id: 'pickiron', at: 'bench', out: ['pickiron', 1],
    need: [['ironbar', 3], ['haft', 1], ['gearset', 1]], secs: 3.4 },
  { id: 'sprayer', at: 'bench', out: ['sprayer', 1],
    need: [['pipe', 1], ['pane', 1], ['spool', 2], ['plank', 1]], secs: 3.0 },
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

/** Where a recipe can be worked. The fire and the bench are both shell builds. */
export const STATIONS = {
  hand: { name: 'By hand', build: null },
  fire: { name: 'Kiln', build: 'kiln' },
  bench: { name: 'Bench', build: 'bench' },
};
