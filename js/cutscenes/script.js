// CRABDEN - the script.
// Beats are consumed by ui/cutscene.js. `say` with an empty name is narration.

export function getScene(id, game) {
  const S = SCENES[id];
  return S ? S(game) : null;
}

const CRAB = (mood) => ({ portrait: 'crab', say: 'THE CRAB', face: mood, voice: 0.7 });
const PELL = (mood) => ({ portrait: 'pell', say: 'DR. PELL', face: mood, voice: 1.15 });
const NARR = { say: '', voice: 0.9, speed: 34 };

const SCENES = {};

// ---------------------------------------------------------------------------
// OPENING
// ---------------------------------------------------------------------------
SCENES.intro = (game) => [
  { do: (g) => { g.crab.buried = 1; g.pell.hidden = true; g.weather.hour = 6.4; g.weather.paused = true; } },
  { cam: { at: (g) => g.crab, zoom: 4, snap: true }, letterbox: true },
  { fade: 'in', dur: 1.6, mood: 'calm' },
  { ...NARR, text: 'There was an ocean here.', wait: 0 },
  { ...NARR, text: 'You are almost certain about this. You remember the weight of it. The cold at the bottom. The way light arrived in pieces.' },
  { ...NARR, text: 'You dug in for a nap.' },
  { stinger: 'ONE THOUSAND YEARS', stingerSub: 'that was a long nap', dur: 2.4, color: '#ffd9a0', stingerSfx: 'uiBig' },
  { wait: 0.5 },

  // the drop
  { do: (g) => {
      g.particles.spawn('drop', g.crab.x + 2, g.crab.y - 60, {
        color: '#c8f0ff', life: 1.4, vz: 0, grav: 90, glow: 5, layer: 'over',
      });
    }, wait: 0.85 },
  { sfx: 'drip', shake: 1.6, flash: 0.18, flashColor: '#9fe8ff',
    do: (g) => {
      g.particles.ring(g.crab.x, g.crab.y, { r0: 1, r1: 16, life: 0.5, color: '#9fe8ff' });
      g.particles.burst('drop', g.crab.x, g.crab.y, 8, { color: '#c8f0ff', speedMin: 6, speedMax: 24, life: 0.6, grav: 70, glow: 3 });
    }, wait: 0.6 },

  { ...CRAB('sleepy'), text: '...' },
  { ...CRAB('sleepy'), text: '...water?' },

  // the wake-up
  { sfx: 'splash', shake: 6, flash: 0.5,
    do: (g) => {
      g.crab.buried = 0;
      g.particles.burst('sand', g.crab.x, g.crab.y, 46, {
        color: g.currentRegion.pal.crest, speedMin: 30, speedMax: 110, life: 1.1, grav: 90, lift: 46,
      });
      g.audio.play('water');
    }, wait: 0.7 },
  { cam: { at: (g) => g.crab, zoom: 3, dur: 0.8 }, wait: 0.9 },

  // the reveal
  { cam: { at: (g) => ({ x: g.crab.x, y: g.crab.y - 40 }), zoom: 1, dur: 3.2 }, mood: 'wonder', wait: 1.4 },
  { stinger: 'THE OCEAN IS GONE', stingerSub: 'all of it', dur: 2.6, color: '#ffb060' },
  { wait: 0.8 },
  { ...CRAB('shock'), text: 'WHERE IS THE OCEAN.' },
  { ...CRAB('shock'), text: 'It was RIGHT HERE. It was two hundred metres deep and it was RIGHT HERE.' },

  // enter Pell
  { do: (g) => {
      g.pell.hidden = false;
      g.pell.x = g.crab.x + 46;
      g.pell.y = g.crab.y - 8;
      g.pell.facing = -1;
    } },
  { cam: { at: (g) => ({ x: (g.crab.x + g.pell.x) / 2, y: g.crab.y }), zoom: 3, dur: 1.1 }, wait: 1.2 },
  { ...NARR, text: 'There is a man standing three metres away. He is whistling. He is facing the other way.' },
  { wait: 0.4 },
  { do: (g) => { g.pell.facing = -1; g.pell.chirp('...oh.', 2); }, sfx: 'ui', wait: 0.7 },
  { ...PELL('shock'), text: 'Oh. Oh no. Hello.' },
  { ...PELL('embarrassed'), text: 'Hello. Hi. You are a crab and you are awake and you are looking at me.' },
  { ...CRAB('angry'), text: 'The water. That fell on me. Where did it come from.' },
  { ...PELL('panic'), text: 'Right, so, context: I have been in the field for eleven days. The nearest water is two hundred and six kilometres away and it is technically a rumour.' },
  { ...PELL('embarrassed'), text: 'And a body has to... recycle.' },
  { ...CRAB('shock'), text: '...' },
  { ...CRAB('shock'), text: '...' },
  { stinger: 'YOU WERE WOKEN BY A MAN PEEING ON YOU', stingerSub: 'this is your inciting incident', dur: 3.0, color: '#ffe9a0', shake: 3 },
  { ...CRAB('angry'), text: 'One thousand years. And THAT is how it ends.' },
  { ...PELL('embarrassed'), text: 'In fairness, it is also how it starts.' },

  // the hook
  { ...PELL('think'), text: 'Hang on. Hang on. Cancer pagurus. Edible crab. You have been extinct for a thousand years. You are extinct RIGHT NOW, while I look at you.' },
  { cam: { at: (g) => g.crab, zoom: 4, dur: 0.9 }, wait: 1.0 },
  { ...PELL('shock'), text: 'And your back is... doing something. Is your back making water?' },
  { do: (g) => {
      g.crab.water = Math.min(g.crab.waterMax, 4);
      g.particles.burst('spark', g.crab.x, g.crab.y - 6, 12, { color: '#c6f6ff', speedMin: 4, speedMax: 18, life: 1.0, glow: 6, grav: -4 });
      g.audio.play('grow');
    }, sfx: 'water', wait: 1.0 },
  { ...PELL('delight'), text: 'That is a functioning gland. On a crab. In a desert.' },
  { ...PELL('delight'), text: 'Do you understand what you are? You are the wettest object on this entire planet.' },
  { ...CRAB('idle'), text: 'I am a crab.' },
  { ...PELL('delight'), text: 'You are a crab with a WATER GLAND, and I have a shovel and eleven days of notes and absolutely nothing left to lose.' },
  { ...PELL('happy'), text: 'Stay right there. I am going to teach you how to bring an ocean back.' },

  { cam: { at: (g) => ({ x: g.crab.x, y: g.crab.y - 30 }), zoom: 1.4, dur: 2.0 }, wait: 1.0 },
  { stinger: 'CRABDEN', stingerSub: 'wake up. make water. fix everything.', dur: 3.2, color: '#6fd8ee', stingerSfx: 'discover' },
  { letterbox: false, do: (g) => { g.weather.paused = false; g.cam.followEntity(g.crab); g.audio.setMood('hopeful'); } },
];

// ---------------------------------------------------------------------------
// TUTORIAL INTERLUDES
// ---------------------------------------------------------------------------

SCENES.tutWater = () => [
  { letterbox: true },
  { ...PELL('happy'), text: 'Right. Lesson one, and it is the only lesson that matters.' },
  { ...PELL('think'), text: 'That gland on your back is an organ. Squeeze it and it makes water. Click it. Hold it. Feel productive.' },
  { ...PELL('idle'), text: 'It will tire you out, so watch your vigor. Rest and it comes back.' },
  { letterbox: false },
];

SCENES.tutPour = () => [
  { letterbox: true },
  { ...PELL('happy'), text: 'Now put it in the ground. Right mouse button, or hold Q. Aim at the sand and let go of your dignity.' },
  { ...PELL('idle'), text: 'Water makes the sand wet. Wet sand is not sand. Wet sand is soil that has not been told yet.' },
  { letterbox: false },
];

SCENES.tutMoss = (game) => [
  { letterbox: true, cam: { at: (g) => g.tutorial.lastPlant || g.crab, zoom: 4, dur: 0.8 }, sfx: 'grow' },
  { stinger: 'MOSS', stingerSub: 'the first living thing in a thousand years', dur: 2.4, color: '#8fd47a' },
  { ...PELL('delight'), text: 'THAT IS MOSS. THAT IS ACTUAL MOSS.' },
  { ...PELL('delight'), text: 'Do you know how long I have looked for a green thing? I have photographed lichen. Twice. Both times it was paint.' },
  { ...CRAB('happy'), text: 'It is very small.' },
  { ...PELL('happy'), text: 'Everything is, at first. Moss makes nutrients. Nutrients make YOU. Keep it wet and it will spread on its own.' },
  { letterbox: false, do: (g) => { g.cam.followEntity(g.crab); g.audio.setMood('hopeful'); } },
];

SCENES.tutBerry = () => [
  { letterbox: true },
  { ...PELL('think'), text: 'Moss is a floor. Now build a second storey. Water a patch that already has moss in it and a bush will take.' },
  { ...PELL('happy'), text: 'Bushes make berries. Berries make birds arrive, and birds make everything else arrive, and that is the whole trick. Water, moss, berries, birds, world.' },
  { letterbox: false },
];

SCENES.tutBird = (game) => [
  { letterbox: true, cam: { at: (g) => g.tutorial.lastBird || g.crab, zoom: 3, dur: 0.9 }, sfx: 'chirp' },
  { stinger: 'A BIRD', stingerSub: 'it came for the berries. it stayed for you.', dur: 2.4, color: '#ffe9a0' },
  { ...PELL('delight'), text: 'A BIRD. A BIRD CAME.' },
  { ...PELL('happy'), text: 'Feed it and it will stay. Walk up and offer berries — it will decide you are furniture, and then it will decide you are family.' },
  { ...PELL('think'), text: 'Give a bird a job at your grove and it will fetch things all day. Nobody knows why. Do not ask them.' },
  { letterbox: false, do: (g) => g.cam.followEntity(g.crab) },
];

SCENES.tutEvolve = () => [
  { letterbox: true },
  { ...PELL('think'), text: 'You have eaten enough nutrients to change shape. Open your evolution tree — press E.' },
  { ...PELL('happy'), text: 'Bigger bladder. Longer legs. A claw you could open a door with. Pick what suits you; you will not get everything.' },
  { ...PELL('idle'), text: 'Some of it comes with abilities. You only have so many slots, so choose a build and live with it.' },
  { letterbox: false },
];

SCENES.tutNight = () => [
  { letterbox: true, mood: 'night' },
  { ...PELL('panic'), text: 'Ah. Right. The sun is going.' },
  { ...PELL('shock'), text: 'Things live out here. They have been very hungry for a very long time, and you have just built the only restaurant.' },
  { ...PELL('think'), text: 'Click yourself to take direct control. Left click swings your claw. Anything with a job at the grove will fight for it.' },
  { ...CRAB('angry'), text: 'And you?' },
  { ...PELL('embarrassed'), text: 'I will be in the tent. Loudly believing in you.' },
  { letterbox: false },
];

// ---------------------------------------------------------------------------
// MILESTONES
// ---------------------------------------------------------------------------

SCENES.moult = (game) => [
  { letterbox: true, cam: { at: (g) => g.crab, zoom: 4, dur: 0.7 }, mood: 'wonder' },
  { do: (g) => {
      g.particles.burst('spark', g.crab.x, g.crab.y, 30, { color: '#ffe9a0', speedMin: 10, speedMax: 46, life: 1.4, glow: 7, grav: -6 });
      g.renderer.doFlash('#ffe9a0', 0.6);
      g.audio.play('evolve');
      g.cam.addShake(4);
    }, wait: 1.6 },
  { stinger: 'MOULT', stingerSub: 'you climbed out of yourself. bigger.', dur: 2.6, color: '#ffd9a0' },
  { ...PELL('delight'), text: 'You split down the back and stepped out. That was revolting. Do it again.' },
  { letterbox: false, do: (g) => g.cam.followEntity(g.crab) },
];

SCENES.firstOasis = (game) => [
  { letterbox: true, cam: { at: (g) => g.tutorial.lastPoi || g.crab, zoom: 2, dur: 1.4 }, mood: 'wonder', sfx: 'discover' },
  { stinger: 'AN OASIS', stingerSub: 'somebody else survived', dur: 2.6, color: '#6fd8ee' },
  { ...PELL('shock'), text: 'It held. Something down there held for a thousand years.' },
  { ...PELL('happy'), text: 'Drink it. All of it. Take the plants too — anything still green comes home with us.' },
  { ...CRAB('idle'), text: 'Is that not stealing.' },
  { ...PELL('think'), text: 'It is rehousing. Legally there is nobody left to disagree.' },
  { letterbox: false, do: (g) => g.cam.followEntity(g.crab) },
];

SCENES.monolith = () => [
  { letterbox: true, mood: 'wonder' },
  { ...NARR, text: 'The slab is black and perfectly smooth and older than the desert. Something is written on it in a language of small blue marks.' },
  { ...PELL('think'), text: 'It is a water table marker. They put them up when the sea started going. This one says the shoreline was HERE.' },
  { ...PELL('sad'), text: 'The next one says it was forty kilometres that way. They kept moving the markers. They never stopped to ask why they had to.' },
  { letterbox: false },
];

SCENES.wreck = () => [
  { letterbox: true, mood: 'night' },
  { ...NARR, text: 'A ship, upright, in the middle of nothing. The hull is intact. The name on the bow has been sanded down to four letters.' },
  { ...PELL('think'), text: 'It is an ark ship. They filled these with seed banks and breeding pairs and pointed them at the last deep water.' },
  { ...PELL('sad'), text: 'This one did not make it. Which means the seeds are still in the hold, and they are still seeds.' },
  { ...CRAB('idle'), text: 'Then we plant them.' },
  { ...PELL('happy'), text: 'Then we plant them.' },
  { letterbox: false },
];

SCENES.well = () => [
  { letterbox: true, cam: { at: (g) => g.tutorial.lastPoi || g.crab, zoom: 1, dur: 2.6 }, mood: 'wonder', sfx: 'discover' },
  { stinger: 'THE DEEP WELL', stingerSub: 'the hole the ocean went down', dur: 3.0, color: '#7fe0d0' },
  { ...NARR, text: 'The crater is nine kilometres across and it goes down further than light does. The air coming out of it is cold and smells like the bottom of the sea.' },
  { ...PELL('shock'), text: 'This is it. This is where it went.' },
  { ...PELL('think'), text: 'The ocean did not evaporate. It DRAINED. Something opened the crust and the whole thing went through in eighty years.' },
  { ...CRAB('shock'), text: 'Something opened it.' },
  { ...PELL('sad'), text: 'We did. We were drilling for the water under the water. We found it. We found a great deal of it.' },
  { ...NARR, text: 'Far below, something enormous shifts, and a sound comes up the shaft that is almost exactly the sound of a wave.' },
  { letterbox: false, do: (g) => g.audio.setMood('danger') },
];

SCENES.nautilus = () => [
  { letterbox: true, mood: 'wonder' },
  { ...NARR, text: 'It walks out of the dark on nine tentacles, carrying a shell like a cathedral, and looks at you with one enormous eye.' },
  { portrait: 'nautilus', say: 'THE LAST NAUTILUS', face: 'idle', voice: 0.5, text: 'You slept.' },
  { ...CRAB('idle'), text: 'I did.' },
  { portrait: 'nautilus', say: 'THE LAST NAUTILUS', face: 'idle', voice: 0.5, text: 'I walked. Someone had to watch the water leave. Someone had to remember where it went.' },
  { portrait: 'nautilus', say: 'THE LAST NAUTILUS', face: 'idle', voice: 0.5, text: 'It is not gone. It is only underneath. Bring me to your grove and I will show you how to reach it.' },
  { letterbox: false },
];

SCENES.ending = () => [
  { letterbox: true, mood: 'wonder', cam: { at: (g) => g.groveCenter, zoom: 1, dur: 3.0 } },
  { stinger: 'A YOUNG SEA', stingerSub: 'day one of the next thousand years', dur: 3.2, color: '#7fe0d0' },
  { ...NARR, text: 'Water stands in the low ground and does not sink. Birds argue about a bush. Something with far too many legs is asleep in your shade.' },
  { ...PELL('happy'), text: 'I have measured it four times. The water table is rising. Not much. It is rising.' },
  { ...PELL('delight'), text: 'A thousand years of desert, and it turns out the fix was one crab with a gland and an unreasonable attitude.' },
  { ...CRAB('happy'), text: 'And one man who could not hold it in.' },
  { ...PELL('embarrassed'), text: 'We agreed we were not going to keep bringing that up.' },
  { ...CRAB('happy'), text: 'We did not agree that.' },
  { ...NARR, text: 'Somewhere under the Deep Well, the sea turns over in its sleep, and begins the long climb home.' },
  { stinger: 'THANK YOU FOR PLAYING', stingerSub: 'CRABDEN', dur: 4.0, color: '#6fd8ee' },
  { letterbox: false },
];

export { SCENES };
