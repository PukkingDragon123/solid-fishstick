// CRABDEN - the archaeologist, drawn.
//
// He used to be a skeleton with shaded blobs hung off it: a height field per
// limb, lit and rotated into place by a two-bone solver. That is the right way
// to build a fifty-pixel animal with eight legs and it is the wrong way to
// build a thirty-pixel person, because at that size a lit gradient is not
// shading - it is noise, and the joints between the blobs are mush. No amount
// of tuning fixes it. A person this size has to be DRAWN.
//
// So this is a sprite sheet, laid out as text: eleven body frames, flat
// colour, one hard outline, every pixel placed. The head is stamped on top at
// a per-frame neck pixel so his twenty-one expressions still work and he can
// still lose his hat, and whatever he is holding goes on the hand pixel the
// same way.
//
// Facing right. Everything is mirrored for left.

import { makeCanvas } from '../render/pixel.js';
import { mixHex } from '../lib/math.js';

export const BODY_W = 18;
export const BODY_H = 21;

/**
 * The colour key. Three tones to a garment and no more: what a sprite this
 * size has is a colour and an edge, and the edge does most of the work.
 */
const KEY = {
  o: '#1c1209',   // the outline, and it is the same one everywhere
  c: '#d8caa4',   // shirt
  C: '#f0e6c6',   // shirt, lit
  v: '#a99a76',   // shirt, in shadow
  l: '#4a3018',   // the leather placket down the front
  L: '#5c3c1e',   // belt
  g: '#c2954f',   // brass
  b: '#8f3a2e',   // the maroon: neckerchief and bedroll
  n: '#241c12',   // pack, deep
  N: '#4b3c26',   // pack
  p: '#5a5236',   // trousers
  P: '#746a45',   // trousers, lit
  k: '#2a1d12',   // boots
  K: '#4a3320',   // boots, lit
  s: '#cd8e69',   // skin
  d: '#a56b4c',   // skin, in shadow
};

/** The Elder is the same cut of person in a red hat over a slate coat. */
const ELDER_KEY = {
  c: '#b9a586', C: '#d8c9ad', v: '#8e7c60',
  p: '#4f3339', P: '#66444a',
  b: '#7c3226', N: '#3d404d', n: '#1e1f26',
};

export const BODY = {
  stand: [
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclco.....',
    '..oNbbNCcclcco....',
    '..oNbbNCcclcco....',
    '..onNNnCcclcco....',
    '..onNNnCcclcsso...',
    '..onNNnCccldsdo...',
    '...onnoLLLLgo.....',
    '....oopppppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oPpoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....okkokko......',
    '....oKkkoKkko.....',
    '....okkkokkko.....',
    '....ooooooooo.....',
    '..................',
  ],
  walk0: [
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclco.....',
    '..oNbbNCcclccco...',
    '..oNbbNCcclccco...',
    '..onNNnCcclccco...',
    '..onNNnCccldssdo..',
    '..onNNnCccldo.....',
    '...onnoLLLLgo.....',
    '....oopppppo......',
    '....oppoppo.......',
    '....oppoppo.......',
    '...oPpo.oppo......',
    '...oppo..oppo.....',
    '...opo...oppo.....',
    '..oppo....opo.....',
    '..okko....okko....',
    '.oKkko....oKkko...',
    '.okkko....okkko...',
    '.ooooo....ooooo...',
    '..................',
  ],
  walk1: [
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclco.....',
    '..oNbbNCcclcco....',
    '..oNbbNCcclcco....',
    '..onNNnCcclcco....',
    '..onNNnCcclcsso...',
    '..onNNnCccldsdo...',
    '...onnoLLLLgo.....',
    '....oopppppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oPpoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....okkokko......',
    '....oKkkoKkko.....',
    '....okkkokkko.....',
    '....ooooooooo.....',
    '..................',
  ],
  walk2: [
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclco.....',
    '..oNbbNCccloo.....',
    '..oNbbNCcclco.....',
    '..onNNnCcclcco....',
    '..onNNnCcclcsdo...',
    '..onNNnCccldo.....',
    '...onnoLLLLgo.....',
    '....oopppppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '....oppo.oPpo.....',
    '...oppo...opo.....',
    '...opo....oppo....',
    '..oppo.....oppo...',
    '..okko.....okko...',
    '.oKkko.....oKkko..',
    '.okkko.....okkko..',
    '.ooooo.....ooooo..',
    '..................',
  ],
  walk3: [
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclco.....',
    '..oNbbNCcclcco....',
    '..oNbbNCcclcco....',
    '..onNNnCcclcco....',
    '..onNNnCcclcsso...',
    '..onNNnCccldsdo...',
    '...onnoLLLLgo.....',
    '....oopppppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oPpoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....okkokko......',
    '....oKkkoKkko.....',
    '....okkkokkko.....',
    '....ooooooooo.....',
    '..................',
  ],
  hold: [
    '......occcco...o..',
    '.....ocbbbbco.os..',
    '...oNNoCcclcoosdo.',
    '..oNbbNCcclcosso..',
    '..oNbbNCcclccco...',
    '..onNNnCcclcco....',
    '..onNNnCccldo.....',
    '..onNNnCccldo.....',
    '...onnoLLLLgo.....',
    '....oopppppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oPpoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....oppoppo......',
    '.....okkokko......',
    '....oKkkoKkko.....',
    '....okkkokkko.....',
    '....ooooooooo.....',
    '..................',
  ],
  crouch: [
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclcco....',
    '..oNbbNCcclcsso...',
    '..oNbbNCccldsdo...',
    '..onNNnCccldo.....',
    '..onnoLLLLgo......',
    '...ooppppppppo....',
    '...opppppppppo....',
    '...oppo..opppPo...',
    '..oppo...opppPo...',
    '..okko...oppppo...',
    '.oKkko...oKkkkko..',
    '.okkko...okkkkko..',
    '.ooooo...okkkkko..',
    '.........ooooooo..',
  ],
  dig: [
    '..................',
    '..................',
    '..................',
    '..............o...',
    '.............oso..',
    '......occcco.osdo.',
    '.....ocbbbbcosso..',
    '...oNNoCcclccco...',
    '..oNbbNCcclcco....',
    '..oNbbNCccldo.....',
    '..onNNnCccldo.....',
    '..onnoLLLLgo......',
    '...ooppppppppo....',
    '...opppppppppo....',
    '...oppo..opppPo...',
    '..oppo...opppPo...',
    '..okko...oppppo...',
    '.oKkko...oKkkkko..',
    '.okkko...okkkkko..',
    '.ooooo...okkkkko..',
    '.........ooooooo..',
  ],
  sit: [
    '..................',
    '..................',
    '..................',
    '..................',
    '......occcco......',
    '.....ocbbbbco.....',
    '...oNNoCcclco.....',
    '..oNbbNCcclcco....',
    '..oNbbNCcclcsso...',
    '..onNNnCccldsdo...',
    '..onNNnCccldo.....',
    '..onnoLLLLgo......',
    '...ooppppppppo....',
    '...opppppppppo....',
    '...oppppppppPo....',
    '...ooooppppPPo....',
    '.......oPPPPPo....',
    '.......oooPPPo....',
    '..........okkko...',
    '.........oKkkko...',
    '.........ooooooo..',
  ],
  down: [
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..............o...',
    '.............oso..',
    '............osdo..',
    '...........osso...',
    '.oNNo.....occo....',
    'oNbbNo...occco....',
    'oNbbNoocccCcco....',
    'onNNnoCcclccppo...',
    '.onnoLLLLgpppPPo..',
    '..ooopppppppPPPo..',
    '.....ookkkkkkkko..',
    '.......oKkkkkkko..',
    '.......ooooooooo..',
    '..................',
  ],
  shock: [
    'o.................',
    'so..............o.',
    'sdo............oso',
    'cso...........osdo',
    'occo.........ocso.',
    '.occo.......occo..',
    '..occooocccoco....',
    '...occcccccco.....',
    '...ocbbbbbco......',
    '..oNNoCcclco......',
    '.oNbbNCcclco......',
    '.oNbbNCcclco......',
    '.onNNnLLLLgo......',
    '..onnopppppo......',
    '...oppoppo........',
    '...oppoppo........',
    '...oppoppo........',
    '...okkokko........',
    '..oKkkoKkko.......',
    '..okkkokkko.......',
    '..ooooooooo.......',
  ],
};

/** Where the head's neck pixel lands, per frame. */
export const NECK = {
  stand: { x: 9, y: 0 },
  walk0: { x: 9, y: 0 },
  walk1: { x: 9, y: 0 },
  walk2: { x: 9, y: 0 },
  walk3: { x: 9, y: 0 },
  hold: { x: 9, y: 0 },
  crouch: { x: 9, y: 5 },
  dig: { x: 9, y: 5 },
  sit: { x: 9, y: 4 },
  down: { x: 12, y: 11 },
  shock: { x: 9, y: 6 },
};

/** Where whatever he is holding goes, per frame. */
export const HAND = {
  stand: { x: 13, y: 6 },
  walk0: { x: 13, y: 6 },
  walk1: { x: 13, y: 6 },
  walk2: { x: 13, y: 6 },
  walk3: { x: 13, y: 6 },
  hold: { x: 15, y: 2 },
  crouch: { x: 14, y: 9 },
  dig: { x: 16, y: 4 },
  sit: { x: 14, y: 9 },
  down: { x: 14, y: 8 },
  shock: { x: 15, y: 2 },
};

const cache = new Map();

/**
 * One body frame as a canvas, `px` screen pixels per art pixel.
 *
 * `spore` washes him toward the violet the takeover puts in everything, and
 * `far` hazes him back into the distance. Both are done to the palette rather
 * than with a globalAlpha, so he never goes translucent.
 */
export function bodyFrame(name, px = 1, opts = {}) {
  const rows = BODY[name] || BODY.stand;
  const p = Math.max(1, Math.round(px));
  const elder = opts.kind === 'elder';
  const spore = Math.max(0, Math.min(1, opts.spore || 0));
  const key = `${name}:${p}:${elder ? 1 : 0}:${opts.far ? 1 : 0}:${spore.toFixed(2)}`;
  let cv = cache.get(key);
  if (cv) return cv;

  cv = makeCanvas(BODY_W * p, BODY_H * p);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      let col = (elder && ELDER_KEY[ch]) || KEY[ch];
      if (!col) continue;
      if (spore > 0.01 && ch !== 'o') col = mixHex(col, '#a26cd0', spore * 0.4);
      if (opts.far) col = mixHex(col, '#8a7a63', 0.34);
      g.fillStyle = col;
      g.fillRect(x * p, y * p, p, p);
    }
  }
  if (cache.size > 160) cache.clear();
  cache.set(key, cv);
  return cv;
}

/**
 * Which frame a pose wants. `phase` is 0..1 through the walk cycle and
 * nothing else uses it.
 */
export function frameFor(pose, phase = 0) {
  switch (pose) {
    case 'walk': case 'wander':
      return ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(phase * 4) & 3];
    case 'crouch': return 'crouch';
    case 'dig': return 'dig';
    case 'sit': case 'rest': return 'sit';
    case 'beer': case 'drink': case 'survey': case 'write':
    case 'point': case 'wave': case 'measure':
      return 'hold';
    case 'down': return 'down';
    case 'shock': return 'shock';
    default: return 'stand';
  }
}
