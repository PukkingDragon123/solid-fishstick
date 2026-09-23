// CRABDEN - what lives in the water that is left.
//
// Every one of these is a real kind of animal, or close enough to one that a
// biologist would nod. The oases hold the ones that got stranded when the sea
// went - pupfish are exactly that, in real deserts, in pools the size of a
// kitchen - and the sea off the west edge holds the ones that never left. And
// at the very bottom of it there is one fish that should not be alive at all.
//
//   L, H      body length and depth in world pixels at scale 1
//   cm        the range a caught one measures, which is what you brag about
//   where     'oasis', 'sea' or 'deep'
//   look      colours: back, side, belly, fin, and an accent
//   pattern   how the flank is marked
//   tail      'fork', 'round', 'lobe' (three-lobed, the old way)
//   wary      how easily it spooks, 0..1
//   value     growth it gives you, because a crab eats what it catches

export const FISH = [
  {
    id: 'pupfish', name: 'Desert Pupfish', latin: 'Cyprinodon salinus',
    where: 'oasis', L: 12, H: 5, cm: [3, 6], rarity: 1, school: true, speed: 1.25, wary: 0.7, value: 3,
    look: { back: '#2c5a8e', side: '#5fa8e0', belly: '#e4ecf2', fin: '#243a6a', accent: '#f0c040' },
    pattern: 'bars', tail: 'round',
    note: 'Stranded when the sea went, and still here. The males turn bright blue in spring and fight over a square foot of gravel.',
  },
  {
    id: 'perch', name: 'Salt Perch', latin: 'Oreochromis relictus',
    where: 'oasis', L: 19, H: 8, cm: [12, 24], rarity: 2, school: false, speed: 0.9, wary: 0.5, value: 6,
    look: { back: '#4f5a2c', side: '#8e9a58', belly: '#e0dcb4', fin: '#5a4a2a', accent: '#c04a30' },
    pattern: 'bars', tail: 'round',
    note: 'Takes water saltier than the sea and hotter than a bath. Guards its eggs in its mouth.',
  },
  {
    id: 'cavefish', name: 'Blind Vent Fish', latin: 'Astyanax obscurus',
    where: 'oasis', L: 15, H: 5.5, cm: [6, 11], rarity: 3, school: false, speed: 0.8, wary: 0.2, value: 9, deep: true,
    look: { back: '#d8a8a0', side: '#f0c8c0', belly: '#fbe8e4', fin: '#e0b0a8', accent: '#c07068' },
    pattern: 'none', tail: 'fork', blind: true,
    note: 'Came up out of the rock with the water. It has never seen light, and it has no eyes to start now.',
  },
  {
    id: 'sardine', name: 'Old Sea Sardine', latin: 'Sardina antiqua',
    where: 'sea', L: 11, H: 3.6, cm: [9, 15], rarity: 1, school: true, speed: 1.4, wary: 0.8, value: 2,
    look: { back: '#2a5870', side: '#a8c8d4', belly: '#f2f6f8', fin: '#6a8a98', accent: '#1a3444' },
    pattern: 'spots', tail: 'fork',
    note: 'A thousand of them turn at once and nobody tells them to.',
  },
  {
    id: 'mackerel', name: 'Tiger Mackerel', latin: 'Scomber tigris',
    where: 'sea', L: 22, H: 6, cm: [25, 40], rarity: 2, school: true, speed: 1.3, wary: 0.6, value: 5,
    look: { back: '#1f4a5a', side: '#8ec0c8', belly: '#eef4f0', fin: '#2a4a50', accent: '#0e2a34' },
    pattern: 'wavy', tail: 'fork',
    note: 'The stripes are for breaking up its outline against the ripples on the surface overhead.',
  },
  {
    id: 'parrot', name: 'Reef Parrotfish', latin: 'Scarus reliquus',
    where: 'sea', L: 25, H: 10, cm: [30, 55], rarity: 2, school: false, speed: 0.8, wary: 0.4, value: 8,
    look: { back: '#1f8a7a', side: '#48c8b0', belly: '#f0a8c0', fin: '#c85a8a', accent: '#f2d060' },
    pattern: 'scales', tail: 'fork', beak: true,
    note: 'Bites coral and grinds it to sand. Most of the white beach you walked in on came out of one of these.',
  },
  {
    id: 'grouper', name: 'Mottled Grouper', latin: 'Epinephelus vetus',
    where: 'deep', L: 34, H: 14, cm: [60, 110], rarity: 3, school: false, speed: 0.55, wary: 0.3, value: 14,
    look: { back: '#4a3424', side: '#8a6a48', belly: '#d8c098', fin: '#5a4030', accent: '#2a1c12' },
    pattern: 'mottle', tail: 'round',
    note: 'Sits in one crack for thirty years. It was here when the sea went and it simply did not move.',
  },
  {
    id: 'coelacanth', name: 'Coelacanth', latin: 'Latimeria perpetua',
    where: 'deep', L: 46, H: 15, cm: [150, 190], rarity: 5, school: false, speed: 0.4, wary: 0.15, value: 40,
    look: { back: '#23405e', side: '#3c6a90', belly: '#7a9ab4', fin: '#2a4a6a', accent: '#e8eef0' },
    pattern: 'blotch', tail: 'lobe', lobed: true,
    note: 'Four hundred million years old as a family, and thought extinct for sixty-six million of them. Its fins have bones in. It is the closest thing in this sea to the thing that first walked out of one.',
  },
];

export const FISH_BY_ID = Object.fromEntries(FISH.map((f) => [f.id, f]));
