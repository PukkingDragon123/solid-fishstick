# CRABDEN

You are a crab. You have been asleep for a thousand years. The ocean you fell
asleep in is gone, the seabed above you is now a desert, and the thing that
woke you was an archaeologist relieving herself on what she took to be a rock.

There is a spring in your back. There used to be a sea here because of it.

**CRABDEN** is a side-scrolling pixel-art ecosystem tycoon. Water is currency.
You pump it out of the organ in your shell, spend it on seeds, and grow the
plants *on your own back*. Plants fix nutrients and express genes; genes are
the only thing that unlocks evolution; the garden you are carrying decides
which of the desert's thousand-year descendants walk out of the dunes to live
on you. Some of them join your fleet. Some of them come up out of the sand at
night with their mouths open.

![The oasis on your back](docs/shot-03-oasis.png)

---

## Play it

**Single file, no install, no server.** Open `dist/crabden.html` in any
browser — including straight off the filesystem.

```
git clone https://github.com/PukkingDragon123/solid-fishstick
open solid-fishstick/dist/crabden.html
```

To run from source, or to rebuild the bundle after a change:

```
npm install       # esbuild only, used for the bundle
npm start         # http://localhost:8080
npm run build     # -> dist/crabden.html + dist/crabden.body.html
```

## Controls

|  | keyboard | touch |
| --- | --- | --- |
| scuttle | `A` / `D` or arrows | left thumbstick (drag anywhere in the lower-left) |
| the spring | `Space` | **SPRING** |
| act — dig, harvest, win over, strike | `E` | **ACT** |
| the drawer | `Tab`, or `1`–`4` for a tab | **DRAWER** |
| the genome | `G` | tap the orb |
| control mode | `M` | **MODE** |
| zoom / pan | wheel, drag | pinch, drag |
| back out | `Esc` | the drawer's X |

A crab does not turn round to walk. It stays side-on and scuttles, leaning into
the direction of travel, and its eyes follow whatever it thinks is worth
watching.

The game autosaves every twenty seconds and reloads where you left off.

---

## The loop

**Water → plants → genes → evolution → more water — and the whole time, keep
walking, because the only thing out here worth having is over the next dune.**

1. **Pump.** The organ on your back brings up water, and overflow fills the
   stone basin behind your crest. When the basin is full it runs off the back
   of your shell as a waterfall and wets the sand you are standing on.
2. **Plant.** Water buys seeds. Seeds go into plots along your shell — ten dry
   beds on the rock and two wet beds in the basin, which only take plants that
   want their feet wet. Everything grows in place as you walk.
3. **Mature.** A mature plant fixes nutrients every second and expresses a
   **gene**. Genes are not purchasable. The only way to hold a gene is to be
   carrying something alive that expresses it.
4. **Attract.** Every species scores your shell — which genes it expresses,
   how lush it is, whether there is standing water — and only makes the walk
   when the score is worth it. Get close, offer fruit and water, and it joins
   your fleet and starts working.
5. **Evolve.** Evolutions cost nutrients *and* a specific set of genes. Growing
   from juvenile to adult to ancient makes the shell bigger, the basin deeper,
   and the garden on your back larger in every sense.

### The Tree of Life

There is no skill menu. There is an orb on your own back, and you can look into
it — the screen is swallowed by the orb and you wake up inside your own genome.

Everything you can become is one tree. The genes you express are its **roots**,
glowing where a plant or an animal on your back is currently expressing them.
Your physical form is the **trunk**: hatchling, juvenile, adult, ancient, with
the structural evolutions stacked up it. Four **boughs** carry what you have
learned — Spring, Garden, Fleet, Body. Buying a node does not tick a checkbox:
the branch grows out to it, puts on bark, and leafs.

![The Tree of Life](docs/shot-04-tree.png)

### Three ways to move

**WALK** — you steer. **ROAM** — the crab walks itself toward whatever is over
the next dune, and you watch. **FLEET** — click one of your own and click where
to send it. The last two unlock in the tree.

### Building on yourself

Cisterns, windcatchers, compost frames, roosts, trellises, a watchpost and a
salvaged shrine are built into free shell plots and stay there. Placing
anything — a plant or a structure — puts you in a placement mode: every legal
bed on the shell pulses, a ghost of the thing follows the nearest one, and a
bracket marks where it will land.

![The drawer](docs/shot-05-drawer.png)

---

## What is out there

Seven biomes run for forty thousand strides: the Weeping Salt Pan, the Bone
Reef, the Sleeping Dunes, the Glass Flats, the Rustlands, the Ashwood and the
Deep Well. Each has its own sky, ground, rock and residents.

**Landmarks** are the point of walking. They are generated from the world seed
and sunk into the terrain itself, so an oasis is a real bowl you walk down into
with water standing in it, not a decal — and it is exactly where you left it
tomorrow. Oases, ruined shore towns, bone fields where a herd died on the way
somewhere better, and wind-cut spires. Each one has a name, and a chevron at
the edge of the screen points at the nearest one you have not stood in.

![Water](docs/shot-07-water.png)

Smaller finds sit between them: buried relics, wild seed patches, water seeps,
old kills, nests — and disturbed sand, which is not a find so much as a warning
you probably will not read in time.

### The bestiary

Nearly everything alive here is a reptile or an arthropod, because those are
what a drying world leaves: a waterproof skin and a way of excreting waste
without spending water on it. Nine reptiles, nine bugs and arachnids, four
furred survivors that never drink, three birds.

You do not read their entries. You **watch** them, and Dr. Vess writes them
down — five field notes per species, unlocked by observation, spoken aloud as
she works them out. Real behaviour: the skink dives into a dune rather than
running across it, the pebbler's spines comb dew into its own mouth, the digger
wasp restarts its entire sequence if you move the prey a few centimetres.

![Field notes](docs/shot-06-notes.png)

Hostiles do not bother a bare rock. Once you are carrying something worth
taking they start arriving, faster at night: dune scorpions in pairs, a bone
centipede with twenty-two pairs of legs all going the same way, a pale serpent
that is already where you are going, and a stone basilisk that is not hunting
you — it is checking whether you are new.

![Night](docs/shot-08-night.png)

### What actually happened here

This was a shallow shelf sea. It did not dry up because of a catastrophe. It
dried up because the artesian system that filled it ran through the body of one
very large animal, and that animal went to sleep. Eleven shore towns cut their
cisterns facing the water, moved twice, and stopped. The lore is found rather
than given: fragments come off ruins one at a time, and Vess assembles the rest
as you find places.

---

## How it is built

No engine, no framework, no dependencies at runtime, and **no asset files at
all**. Every pixel in the game is generated in the browser when it starts.

### The painter

`js/render/pixel.js` is the reason the art looks the way it does. Sprites are
not drawn with strokes and fills — each one is built as a set of fields
(coverage, height, material, tint) and then *shaded*:

- surface normals come from the gradient of the height field
- lighting is lambert + rim + a cavity term (local height minus blurred height)
  + specular + subsurface translucency for leaves and membranes
- the result is quantised onto a per-material eight-colour ramp with 8×8 Bayer
  ordered dithering, then given a dark outline

`js/lib/palette.js` holds about forty materials — chitin, shell rock, claw,
leaf, moss, petal, berry, sand, bone, rust, water, fur, feather, scale,
carapace, membrane, horn, rope, cloth, metal, glass, skin, khaki, leather — so
a fern frond and a crab's leg are lit by the same sun and sit in the same
desert. Everything is baked once into a canvas at load.

### The crab

`js/art/crabart.js` builds the shell from a single profile function that is
also the source of truth for where you can plant: horizontal bedding like the
mesas it slept among, eroded shelves, fracture lines, desert varnish streaking
down the flank, crest spikes, fossil barnacles, and a real stone basin behind
the crest for the spring to fill.

`js/entities/crab.js` walks it. Nothing is a sprite animation: each leg keeps a
planted foot in world space, takes a step when the body has carried it too far,
and every joint is solved with two-bone IK — so a leg on a dune slope and a leg
in a hollow bend differently on the same frame. The body then rides on a line
fitted through whichever feet are currently on the ground, which is what makes
it tilt going uphill, and rocks across its own gait as it scuttles. The eyes
are pale globes with the pupils drawn live, so the stalks actually track.

### Plants and animals

Plants are grown, not drawn (`js/art/floraart.js`): a stem is traced, branches
split off it with a seeded angle, and leaves, petals and fruit hang on the
tips. The same generator runs at every growth stage and at any size, so a bush
you planted as a seed really is the same bush when it fruits, and a plant on an
ancient crab's shell is a bigger version of the same individual. The same
generator scatters the ground vegetation, thickening as you approach water.

Animals (`js/art/faunaart.js`) are a **body plan and a spine**, not a stack of
ellipses. The spine is a curve with a radius profile and the painter solves it
as a real tube, so a monitor lizard is long and low with a heavy tail root, a
beetle is three hard tagmata, a serpent is one smooth tube laid in an S, and a
jerboa is a deep chest on thin legs — all from twenty lines of description.
Skin is grown rather than noised: scales lie in rows that follow the spine, fur
is strands that break the silhouette, chitin gets plate seams and a tight
specular. Gaits follow the plan too — sprawlers throw their knees out and swing
the spine, insects walk an alternating tripod, reptiles bask.

### Dr. Vess

She is the one hand-drawn thing here. `tools/sheets.mjs` takes the sheets in
`assets/`, keys out the background, slices every animation row into frames,
downsamples them hard and snaps the result to one median-cut palette — which is
what lets a drawn character stand next to procedural art without either looking
out of place, and buries the artefacts of how the sheet was made. Idle, walk,
sit, talk, command, wander, dig, and eight facial expressions, at 34 pixels.

### The rest

- **Terrain** is a heightfield over X, baked into 256px chunks, with a live
  deformation map that footsteps push down and wind pulls back up.
- **Parallax** is three layers with real aerial perspective: each layer is
  painted into a scratch canvas and hazed toward the sky colour with
  `source-atop`, so distance desaturates the buttes without washing the sky.
- **Heat shimmer** blits the scene to the display in 2px horizontal bands with
  per-band sine offsets, strongest near the horizon. The UI is composited after
  it, so text never wobbles.
- **Weather** runs a real clock: clear, sandstorm, heatwave, rain, overcast and
  lightning, each with its own light colour, shadow length and haze.
- **Input** routes mouse, keyboard, multi-touch and the on-screen controls into
  the same virtual keys, so no gameplay code knows which one you used.
- **The HUD is not a HUD.** Water is a moulted shell with the water visibly in
  it; nutrients are a flower that opens as you bank them and drops a leaf when
  you spend; fruit is a sprig of fruit; your genome is an orb. All four are
  painted by the same height-field painter as the world, so the readouts are
  lit by the same sun as the desert behind them.

### Layout

```
assets/      the two character sheets, as uploaded
tools/       sheets.mjs - slices and downsamples them into js/art/people.js
js/
  art/       crabart floraart faunaart buildart people (generated)
  core/      camera input save
  data/      flora fauna progress lore
  entities/  crab creature npc
  lib/       math font audio palette
  render/    pixel renderer backdrop
  systems/   garden economy wildlife encounters fx
  ui/        ui icons tree
  world/     terrain biomes weather landmarks
```

---

## Screens

| | |
| --- | --- |
| ![Waking up](docs/shot-01-waking.png) | ![The first garden](docs/shot-02-first-garden.png) |
| ![The drawer](docs/shot-05-drawer.png) | ![Field notes](docs/shot-06-notes.png) |
| ![The Tree of Life](docs/shot-04-tree.png) | ![Night](docs/shot-08-night.png) |

---

## Notes

Runs at 60fps from 320×200 up to 4K, on desktop and on a phone. Tested against
landscape phone, portrait phone and tablet profiles with real touch events.
Save data lives in `localStorage` under `crabden.save.v1`; clearing it starts a
new run.

The two character sheets in `assets/` were supplied for this project; everything
else in the game — every plant, every animal, the crab, the terrain, the sky,
the font and the sound — is generated at runtime from code.
