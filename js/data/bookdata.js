// CRABDEN - what the book says that the rest of the game does not.
//
// The animals, plants, fish, fossils and ores already carry most of what Vess
// knows about them as data: names, Latin, a description, field notes. What
// they do not carry is the part of an encyclopedia entry a reader actually
// looks for first - what it eats, how big it is, where to go and when - and
// the little aside in the margin where the author stops being a naturalist
// for a line. That lives here, keyed by id, read only by the book.

/** Rarity, from a tier (0..4) or a fish's 1..5. */
export const RARITY = ['Common', 'Frequent', 'Uncommon', 'Rare', 'Very rare'];

/** A creature's life, in the terms a field guide uses. */
export const CREATURE_TEXT = {
  duneskink: {
    diet: 'Beetle larvae and seed, taken from under the surface.',
    size: '18 cm, half of it tail', active: 'Day; hottest hours',
    where: 'Loose sand in the Sleeping Dunes and the Salt Pan.',
    behave: 'Swims rather than walks. Surfaces to breathe and to look, and vanishes when looked at.',
    margin: 'Held one for a minute. It tried to swim into my sleeve.',
  },
  glasstail: {
    diet: 'Moths, larvae, soft-bodied insects.',
    size: '16 cm; the tail holds 9 ml', active: 'Night only',
    where: 'Shaded rock in the Shallows and the Bone Reef; any garden with leaves.',
    behave: 'Climbs anything. Sleeps upside down by day and hunts the underside of leaves after dark.',
    margin: 'Watched the level in the tail drop a hair all evening. It drank at dawn.',
  },
  pebbler: {
    diet: 'Ants and small beetles - two thousand a day.',
    size: '12 cm across the disc', active: 'Day',
    where: 'Gravel and hardpan near water. Every lasting oasis has some.',
    behave: 'Sits. Sits more. Inflates and hisses only when sitting has failed.',
    margin: 'Stood on one. Apologised. It did not accept.',
  },
  agama: {
    diet: 'Flowers in the morning, insects in the afternoon.',
    size: '24 cm with the ribbon', active: 'Day; displays at dawn',
    where: 'High rock on the Glass Flats. Any lookout it can claim.',
    behave: 'Holds the highest point there is and bobs at anything that disputes it.',
    margin: 'Its bob has a rhythm. I have started to recognise them by it.',
  },
  saltmonitor: {
    diet: 'Eggs, carrion, other reptiles, anything it can swallow whole.',
    size: '1.4 m nose to tail', active: 'Day, slowly',
    where: 'The salt crust and the edges of the pan, following old trails.',
    behave: 'Walks its range on a schedule, caches food, and comes back for it days later.',
    margin: 'It looked at my satchel and then at me, in that order.',
  },
  thorniguana: {
    diet: 'Leaves, fruit, flowers - an entire garden, overnight.',
    size: '70 cm', active: 'Day; basks at noon',
    where: 'The Ashwood, among the standing trunks.',
    behave: 'Grazes in a slow line, then lies flat on hot rock four degrees warmer than everything else.',
    margin: 'The flowers on its back were visited by a moth while I watched. The iguana did not mind.',
  },
  ashchameleon: {
    diet: 'Flies, moths, anything in tongue range.',
    size: '14 cm, plus the tongue', active: 'Day',
    where: 'The Ashwood canopy, rocking with the dead branches.',
    behave: 'Moves like a leaf in wind so as not to move like an animal. Each eye on its own business.',
    margin: 'One eye on the moth. One eye on me. Both, I think, unimpressed.',
  },
  sandserpent: {
    diet: 'Lizards, jerboas, anything warm that passes.',
    size: '90 cm', active: 'Night',
    where: 'Buried in the Salt Pan and the Dunes, eyes and horns clear.',
    behave: 'Ambush. Lies under the sand for hours and strikes once. Sidewinds away afterwards.',
    margin: 'Its tracks were on top of ours in the morning. I have not mentioned this to the crab.',
  },
  stonebasilisk: {
    diet: 'Unknown. Possibly anything.',
    size: '3 m and growing', active: 'Any hour it pleases',
    where: 'The Deep Well, patrolling eleven kilometres of it.',
    behave: 'Not hunting. Checking. Runs on its hind legs across open ground faster than anything alive.',
    margin: 'There are perhaps forty left. I have named this one. I will not write the name down.',
  },
  copperscarab: {
    diet: 'Dung, carrion, leaf litter - the basin\'s dead.',
    size: '4 cm', active: 'Day; not on overcast days',
    where: 'The Dunes and the Bone Reef; anywhere something has died.',
    behave: 'Rolls a ball, buries it, walks home by the light of the sky. Gives up if there is cloud.',
    margin: 'The most important animal in the desert. I will keep saying so until someone agrees.',
  },
  mirrormantis: {
    diet: 'Insects, on a strike of fifty milliseconds.',
    size: '9 cm', active: 'Day',
    where: 'Flowering plants on the Glass Flats, and in good gardens.',
    behave: 'Sways with its plant, stays put for days, and closes on whatever lands in front of it.',
    margin: 'It reflected me back at myself. I looked tired.',
  },
  dunescorpion: {
    diet: 'Insects; one large one a year will do.',
    size: '11 cm', active: 'Night; glows by moonlight',
    where: 'Under every stone in the Dunes and the Pan, after dark.',
    behave: 'Not aggressive. Simply always under the exact place you were about to put a hand.',
    margin: 'Under the moon the joints glow cyan. Pretty, from three metres.',
  },
  lanternbeetle: {
    diet: 'Whatever the lamp brings - moths, mostly.',
    size: '5 cm, lamp included', active: 'Night',
    where: 'The Deep Well, where it is always night enough.',
    behave: 'Hangs its light out on a stalk and waits. The flashes are conversations.',
    margin: 'I answered one with my torch. It came to me. Then it saw me and left.',
  },
  glasswing: {
    diet: 'Midges and gnats, taken in the air.',
    size: '9 cm wingspan', active: 'Day, near water',
    where: 'Over any standing water, from oases to the shell pond.',
    behave: 'Hovers, darts backward, guards a patch of air as if it were land.',
    margin: 'Two of them fought over the pond for an hour. The pond is the size of a dinner plate.',
  },
  bonecentipede: {
    diet: 'Insects, small reptiles, prey many times its weight.',
    size: '26 cm', active: 'Two hours after dark',
    where: 'Old bone and rubble: bonefields, ruins, the Bone Reef.',
    behave: 'Blind. Hunts by touch, fast, and for a very short window each night.',
    margin: 'The white ones are not albino. They are old. I do not want to meet the oldest.',
  },
  ironback: {
    diet: 'Blood. Feeds for hours, then nothing for years.',
    size: '2 cm', active: 'Whenever something warm arrives',
    where: 'Ruins in the Rustlands, where the shade holds.',
    behave: 'Waits in a sealed pause for carbon dioxide and heat together. Then drops.',
    margin: 'Found three on my boot. The rivets on their backs are rust. They are made of the ruins.',
  },
  sunmoth: {
    diet: 'None. The adult has no mouth.',
    size: '12 cm wingspan', active: 'Dusk and night',
    where: 'The Glass Flats and the Ashwood, at night-flowering plants.',
    behave: 'Lives eight days on stored fat, searching for one scent across kilometres.',
    margin: 'It does not eat. It does not need to. It has exactly one thing to do.',
  },
  diggerwasp: {
    diet: 'Larvae eat paralysed prey; adults sip nectar.',
    size: '4 cm', active: 'Day; hottest hours',
    where: 'Packed sand in the Dunes, near its burrow.',
    behave: 'Digs, hunts, inspects, provisions. Repeats the inspection if anything is moved, forever.',
    margin: 'I moved the cricket four times. It started over four times. I felt worse than it did.',
  },
  quilljerboa: {
    diet: 'Dry seed. It never drinks.',
    size: '11 cm body, 18 cm tail', active: 'Night',
    where: 'Burrows in the Dunes, plugged behind it by day.',
    behave: 'Hops two metres at a time, ears glowing red against the moon.',
    margin: 'It heard water through the sand before I did. I dug where it stopped. It was right.',
  },
  dustfennec: {
    diet: 'Insects, eggs, fruit, small reptiles, your supper.',
    size: '38 cm, 4 ears', active: 'Night; twilight',
    where: 'Anywhere it can watch you from. Dunes, Pan, ruins.',
    behave: 'Pairs for life. Follows a stranger for three days before letting itself be seen.',
    margin: 'Third night. It sat at the edge of the lamp and watched me write this.',
  },
  ridgeback: {
    diet: 'Ironwood leaf and bark; tannins nothing else can take.',
    size: '2.1 m at the sail', active: 'Day; walks old routes',
    where: 'The Ashwood, along herd paths centuries old.',
    behave: 'Herds of nine to fourteen under an old female. Drinks eighty litres in ten minutes.',
    margin: 'The ashwood grows where they walk. Not the other way round.',
  },
  huskhound: {
    diet: 'Anything it can outlast over nine kilometres.',
    size: '85 cm at the shoulder', active: 'Night',
    where: 'The Dunes and the Rustlands, in pairs or fours.',
    behave: 'Follows for a night without approaching. Decides on the second night.',
    margin: 'Did not sleep. It did not come. I am told this is the good outcome.',
  },
  boneheron: {
    diet: 'Fish, where there are any. Lizards, where there are not.',
    size: '1.3 m standing', active: 'Day',
    where: 'Standing water: the Shallows, oases, the Bone Reef, your pond.',
    behave: 'Absolute stillness, then one strike of a folded neck.',
    margin: 'A heron in water is the oldest sign that the water is real.',
  },
  saltlark: {
    diet: 'Seed; a fifth passes through to grow.',
    size: '14 cm, plus 20 cm of streamer', active: 'Dawn song',
    where: 'Open ground everywhere: Shallows, Dunes, Rustlands.',
    behave: 'Sings for twenty minutes forty metres up without going anywhere.',
    margin: 'It is the first new song in a thousand years. It needs work.',
  },
  carrionkite: {
    diet: 'Carrion; anything slow enough to become it.',
    size: '1.6 m wingspan', active: 'Day; on thermals',
    where: 'Over the Rustlands, circling anything that is failing.',
    behave: 'Soars six hours a day. Two eyes on the horizon, two straight down.',
    margin: 'Follow the kite to find water. Or what died looking for it.',
  },
};

/** A plant's life. */
export const PLANT_TEXT = {
  dustmoss: { habit: 'Cushion moss', where: 'Every shaded crack from the Shallows to the Well.', margin: 'One drop of water and it went green in front of me. I nearly wept.' },
  saltgrass: { habit: 'Tussock grass', where: 'Salt crust; the Pan, the Shallows, the Dunes.', margin: 'Chewed a blade. Salty. Of course it is.' },
  emberberry: { habit: 'Low fruiting shrub', where: 'Sheltered hollows in the Dunes, the Bone Reef and the Rustlands.', margin: 'The fruit glows at dusk. The jerboas know the exact minute.' },
  bluefern: { habit: 'Fern, blue-leaved', where: 'Under rock on the Glass Flats and in the Ashwood.', margin: 'Sat in its shade for an hour. Measurably cooler. Wrote this there.' },
  sunspindle: { habit: 'Tall composite flower', where: 'Open sand in the Sleeping Dunes.', margin: 'Every head faces the same way. I checked forty.' },
  thornmelon: { habit: 'Pad succulent', where: 'Deep sand in the Dunes, over a taproot two metres long.', margin: 'Cut a pad in an emergency. A week of water. Forgive me, plant.' },
  cloudcap: { habit: 'Shelf fungus', where: 'The deep shade of the Ashwood.', margin: 'The dawn mist off it wet my notebook. The garden drank the rest.' },
  glasslily: { habit: 'Water lily, glass petals', where: 'The edges of the Glass Flats, where the lightning water pools.', margin: 'It rings. A faint, high note when the wind turns. Real glass.' },
  ribbonkelp: { habit: 'Kelp, rooted on rock', where: 'The Shallows and the Bone Reef: the sea that stayed.', margin: 'A sea plant, alive. The sea is not as gone as everyone says.' },
  pipereed: { habit: 'Hollow reed', where: 'Brackish water on the Pan and in the Shallows.', margin: 'It whistles off the saltpan. A lark answered it. So did I.' },
  sandwheat: { habit: 'Annual grass', where: 'Open sand in the Dunes and the Pan.', margin: 'Born, seeds, dies, inside a fortnight. Has done since before the water went.' },
  sunpod: { habit: 'Annual succulent', where: 'The Dunes and the Bone Reef, in full sun.', margin: 'Splits at noon, exactly. You can set a watch by it. I did.' },
  ashroot: { habit: 'Root shrub', where: 'Burnt ground in the Ashwood and the Rustlands.', margin: 'Dug one up. It went on, and on. I gave up before the root did.' },
  saltpetal: { habit: 'Annual flower', where: 'Crust on the Pan and the Glass Flats.', margin: 'Opens white, closes grey, once. I was there for both.' },
  stonefig: { habit: 'Rock-splitting tree', where: 'Cracked rock in the Rustlands and the Deep Well.', margin: 'This one is older than me by a lifetime, and still cropping.' },
  nightcup: { habit: 'Night fungus', where: 'The Ashwood and the Deep Well, one night at a time.', margin: 'Nobody has seen one in daylight. I tried. I fell asleep at four.' },
  ironwood: { habit: 'Hardwood tree', where: 'The Ashwood, where the herds walk.', margin: 'Sinks in water. Floats in nothing. Grows a hand a decade.' },
  ghostpalm: { habit: 'Pale palm', where: 'The Deep Well, along the drop.', margin: 'Its shade is the coolest place I have measured outside a cave.' },
  mindcap: { habit: 'Parasitic fungus', where: 'Shade in the Ashwood - be careful where you kneel.', margin: 'It fruited something that looked at me. I have moved my bedroll.' },
  heartbloom: { habit: 'Great flower', where: 'The Deep Well, rarely.', margin: 'Opens for one minute a day. I have seen it twice. Everything came.' },
  worldvine: { habit: 'Spreading vine', where: 'The Rustlands, over the old works.', margin: 'Under it the sand is soil again. I took a sample. It is alive.' },
};

/** Where a fish is caught, and how. */
export const FISH_TEXT = {
  pupfish: { size: '3-6 cm', how: 'Any oasis pool. Cast short; they come in schools.', margin: 'A whole species in a pool the size of a kitchen.' },
  perch: { size: '12-24 cm', how: 'Larger oases. Patient casts near the bottom.', margin: 'Carries its eggs in its mouth. Fasts the whole time.' },
  cavefish: { size: '6-11 cm', how: 'Only the deepest oases, where the water comes up through rock.', margin: 'No eyes. It found my bait anyway.' },
  sardine: { size: '9-15 cm', how: 'The open sea past the Salt Pan. Shoals near the surface.', margin: 'A thousand turned at once. Nobody told them to.' },
  mackerel: { size: '25-40 cm', how: 'Off the shelf in the Shallows, mid-water.', margin: 'Fast. Lost three before I landed one.' },
  parrot: { size: '30-55 cm', how: 'Over the coral of the Shallows.', margin: 'The beach I walked in on is mostly what these have eaten.' },
  grouper: { size: '60-110 cm', how: 'Deep water off the end of the shelf. Wait for it.', margin: 'It was there when the sea left. It did not move. It is still there.' },
  coelacanth: { size: '150-190 cm', how: 'The very bottom of the Shallows. Very rarely.', margin: 'Its fins have bones in them. I held its hand.' },
};

/** A fossil's story. */
export const RELIC_TEXT = {
  trilobite: { age: 'Shale, very old', where: 'Dig sites anywhere the old seabed shows.', margin: 'Something very like it is still walking about. I have one on my boot.' },
  ammonite: { age: 'Limestone, the sea\'s floor', where: 'Dig sites on the Bone Reef and the Pan.', margin: 'It floated. The chambers were its buoyancy. Nothing here floats now.' },
  amberfly: { age: 'Resin, a thousand years', where: 'Dig sites near the Ashwood\'s old trees.', margin: 'The wing still has its veins. I can see the light through them.' },
  amberegg: { age: 'Not resin; something laid it', where: 'Deep dig sites, rarely.', margin: 'It was warm. I am almost certain it was warm.' },
  vertebra: { age: 'Bone, mineralised', where: 'Bonefields, and dig sites near them.', margin: 'One bone of a spine longer than the crab. Whatever it was walked here.' },
};

/** A mineral's story. */
export const MINERAL_TEXT = {
  saltcake: { host: 'Limestone', where: 'Shallow seams everywhere; thick on the Salt Pan.', margin: 'The whole Pan is this. The sea left it lying about in sheets.' },
  silica: { host: 'Limestone, quartz knuckles', where: 'Pale outcrops; best on the Glass Flats.', margin: 'Melt it with salt and it turns clear. That is glass. That is a window.' },
  copperore: { host: 'Granite', where: 'Green-streaked outcrops in the Dunes and the Rustlands.', margin: 'Malachite green, azurite blue. It was dissolved in the sea once.' },
  ironore: { host: 'Banded shale', where: 'Red-and-steel outcrops, deep, in the Rustlands.', margin: 'Rusted before anyone dug it. Then rusted again after.' },
  shellchip: { host: 'Shell bed', where: 'Near the surface on the Bone Reef and the Pan.', margin: 'Every chip of it was alive once. All of it.' },
  amberchunk: { host: 'Black shale', where: 'Deep seams near the Ashwood; needs a copper pick.', margin: 'Warm to the touch, even in the shade. Resin remembers the sun.' },
};

/** What each chapter opens with. */
export const CHAPTER_TEXT = {
  creature: {
    title: 'Of the Creatures',
    intro: 'When the sea went, it went slowly enough that things had time to answer it. What answered best were the animals that were already good at being dry - reptiles and the arthropods - and a handful of small, careful, furred and feathered survivors. A thousand years has bent every one of them without breaking it.',
    hand: 'Watch them with me. Notes come a line at a time.',
  },
  plant: {
    title: 'Of the Plants',
    intro: 'Nothing grows here that is not paying for itself. Every plant on these pages costs water to start and a trickle for ever after, and every one gives something back: shade, fruit, a gene, a visitor. They are the reason anything else in this book is alive.',
    hand: 'Kneel by a wild one and look. Then grow it on your back.',
  },
  fish: {
    title: 'Of the Fishes',
    intro: 'Pupfish stranded in pools the size of a kitchen; perch in water saltier than the sea; and, off the west end of everything, the sea itself, which never left at all. At the very bottom of it there is one fish that should not be alive.',
    hand: 'Cast where the water is. Three of a kind and it is yours.',
  },
  relic: {
    title: 'Of the Fossils',
    intro: 'Everything that lived in this basin is still here, under a metre of what used to be the seabed. Dig carefully and the sea gives back its dead - and some of what it gives back is not as dead as it looks.',
    hand: 'Keep them warm in the basin. Some of them hatch.',
  },
  mineral: {
    title: 'Of the Minerals',
    intro: 'A seabed leaves salt, silica, shell, and the metal that was dissolved in its water. You have no thumbs; he does. Between you, the ground becomes bars, the bars become tools, and the tools open deeper ground.',
    hand: 'Strike clean. The deep seams are the ones worth having.',
  },
};
