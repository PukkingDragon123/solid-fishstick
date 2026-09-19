// CRABDEN - the people, painted from the reference sheets.
//
// The sheets in assets/ are the design document: a young field archaeologist
// in a cream shirt and a wide tan bush hat with a maroon band and brass
// goggles pushed up on it, a big canvas pack with a bedroll across the top,
// a maroon map tube on the hip, and dark boots. The Elder is the same build
// under a red feathered hat, a shawl and a white beard.
//
// None of that is a sprite sheet at runtime. Every piece here is a height
// field that gets shaded, quantised to a material ramp and outlined - the
// same treatment as the crab and the desert - so the people are lit by the
// same sun as the ground they stand on and can be *posed* rather than flipped
// through. The sheet supplies the design; the painter supplies the pixels.
//
// Proportions come straight off the sheet: the head with its hat is about a
// third of the figure, the legs are short, the boots are heavy, and the pack
// is nearly as wide as he is. Everything faces RIGHT and is measured from
// the hip, which is where the skeleton is rooted.

import { Painter, makeCanvas } from '../render/pixel.js';
import { withMaterials } from '../lib/palette.js';
import { clamp01, lerp, mixHex, TAU } from '../lib/math.js';

const LIGHT = { lightX: -0.58, lightY: -0.66, lightZ: 0.42, ambient: 0.42, dither: 0.62 };
const FAR = { ...LIGHT, ambient: 0.28 };

/**
 * The sheet's own colour bar, turned into ramps. Cream shirt, olive-khaki
 * trousers, dark leather everywhere it wears, tan canvas for the hat and the
 * pack, and one maroon that the band, the tube and the neckerchief share so
 * the figure has a single accent instead of five.
 */
const BASE = {
  skin: { ramp: ['#5e3627', '#7a4733', '#985c42', '#b47353', '#cd8e69', '#e0a982', '#eec39d', '#f7dcbc'],
    diffuse: 0.80, rim: 0.30, spec: 0.10, ao: 0.09, normalScale: 0.46, outline: '#3a1f16' },
  hair: { ramp: ['#120b08', '#1e130d', '#2c1d14', '#3d291c', '#4f3626', '#654733', '#7d5a43', '#987258'],
    diffuse: 0.70, rim: 0.46, ao: 0.13, normalScale: 0.56, outline: '#0b0605' },
  shirt: { ramp: ['#5c503c', '#73664d', '#8b7d60', '#a39575', '#bbad8c', '#d2c5a6', '#e6dcc2', '#f6efdc'],
    diffuse: 0.82, rim: 0.24, ao: 0.11, normalScale: 0.46, outline: '#332c20' },
  leather: { ramp: ['#1c110b', '#2b1a10', '#3d2717', '#51351f', '#674629', '#7e5935', '#976f46', '#b08a5e'],
    diffuse: 0.74, rim: 0.32, spec: 0.18, ao: 0.14, normalScale: 0.60, outline: '#100906' },
  trouser: { ramp: ['#2e2b1d', '#3f3b28', '#524d34', '#666043', '#7c7554', '#948c68', '#ada481', '#c6bd9f'],
    diffuse: 0.78, rim: 0.26, ao: 0.12, normalScale: 0.52, outline: '#1c1a11' },
  hat: { ramp: ['#4a3a24', '#5f4c30', '#76603e', '#8e764e', '#a88e61', '#c0a878', '#d6c095', '#ecd9b6'],
    diffuse: 0.78, rim: 0.28, ao: 0.12, normalScale: 0.58, outline: '#2a2014' },
  pack: { ramp: ['#3c3020', '#4e402b', '#635337', '#786745', '#8e7c55', '#a59367', '#bcab80', '#d3c3a0'],
    diffuse: 0.76, rim: 0.26, ao: 0.14, normalScale: 0.62, outline: '#241c12' },
  maroon: { ramp: ['#2c0f0e', '#401614', '#571f1b', '#6f2a23', '#88372c', '#a04a3a', '#b7644e', '#cd8368'],
    diffuse: 0.78, rim: 0.36, ao: 0.11, normalScale: 0.52, outline: '#1a0807' },
  brass: { ramp: ['#372413', '#4d331b', '#664526', '#805831', '#9c6f3e', '#b88a50', '#d2a768', '#e8c68c'],
    diffuse: 0.70, rim: 0.55, spec: 0.70, ao: 0.08, normalScale: 0.70, outline: '#201406' },
  lens: { ramp: ['#13303a', '#1b4450', '#265c68', '#337781', '#43929a', '#5db0b6', '#84cfd3', '#bceaec'],
    diffuse: 0.52, rim: 0.82, spec: 0.95, ao: 0.05, normalScale: 0.6, outline: '#0a1a20' },
  boot: { ramp: ['#170f0a', '#241811', '#342319', '#463022', '#5a402d', '#70543b', '#886b4c', '#a28763'],
    diffuse: 0.72, rim: 0.30, spec: 0.22, ao: 0.15, normalScale: 0.58, outline: '#0c0705' },
  paper: { ramp: ['#544f45', '#6d675a', '#868070', '#9f9887', '#b7b09e', '#cfc8b6', '#e4dece', '#f6f2e6'],
    diffuse: 0.84, rim: 0.20, ao: 0.08, normalScale: 0.4, outline: '#2a2620' },
  // what the eye goes when the spore is in it: a cold blue that lights itself
  spore: { ramp: ['#06202c', '#0a3244', '#0f4a60', '#16667e', '#20889c', '#35aebd', '#68d6e2', '#b4f2f8'],
    diffuse: 0.34, rim: 0.90, spec: 0.9, ao: 0.02, normalScale: 0.5, outline: '#04141c' },
};

/**
 * The Elder off the second sheet: the same cut of person in a red hat with a
 * quill in the band, a pale shawl over a slate coat, and a white beard. Only
 * the ramps change - the rig underneath is identical, which is the whole
 * point of painting people instead of drawing them.
 */
const ELDER = {
  hair: { ramp: ['#4c4740', '#605b53', '#767068', '#8d867d', '#a49d93', '#bcb5ab', '#d3cdc4', '#eae6df'],
    diffuse: 0.78, rim: 0.42, ao: 0.10, normalScale: 0.5, outline: '#2c2823' },
  shirt: { ramp: ['#5b4b3a', '#72604b', '#8a765d', '#a28d70', '#b9a586', '#cfbd9f', '#e2d3ba', '#f2e7d4'],
    diffuse: 0.82, rim: 0.24, ao: 0.11, normalScale: 0.46, outline: '#332920' },
  trouser: { ramp: ['#2a1418', '#3c1d21', '#51282c', '#673439', '#7e4347', '#955557', '#ac6d6c', '#c48d8a'],
    diffuse: 0.76, rim: 0.28, ao: 0.12, normalScale: 0.52, outline: '#190b0e' },
  leather: { ramp: ['#1e1f26', '#2c2e38', '#3d404d', '#4f5364', '#65697c', '#7d8296', '#989db0', '#b5bac9'],
    diffuse: 0.76, rim: 0.32, ao: 0.12, normalScale: 0.55, outline: '#12131a' },
  hat: { ramp: ['#35110f', '#4b1a15', '#63251d', '#7c3226', '#954232', '#ad5743', '#c3735c', '#d7947c'],
    diffuse: 0.76, rim: 0.32, ao: 0.12, normalScale: 0.58, outline: '#200907' },
};

const MATS = withMaterials(BASE);
const MATS_ELDER = withMaterials({ ...BASE, ...ELDER });
const matsFor = (kind) => (kind === 'elder' ? MATS_ELDER : MATS);

// ---------------------------------------------------------------------------
// the parts
//
// Every part comes back the same shape - a canvas plus the pixel its joint
// sits on - so the poser can hang them off a skeleton without knowing what
// any of them are.

function bake(p, ox, oy, far, kind, extra = {}) {
  return {
    cv: p.resolve(matsFor(kind), { ...(far ? FAR : LIGHT), outline: 1,
      outlineColor: far ? '#0f0a07' : '#191008' }),
    ox, oy, ...extra,
  };
}

/**
 * The torso. A cream shirt with the sleeves already rolled, a dark leather
 * work vest over it that stops at the waist and hangs open down the front, a
 * belt with a brass buckle and a pouch on it, and the two pack straps coming
 * over the shoulders - which is the detail that makes the silhouette his
 * even when he is a hundred pixels away.
 */
function paintTorso(K, far, kind) {
  // He is a tall thin man who has been living on tinned food in a desert for
  // eleven years, and he should read that way from across the basin: narrow
  // through the shoulders, long in the trunk, longer in the thigh. The trunk
  // is a sixth longer than it was and a fifth NARROWER, which is the change
  // that does the work - a figure reads as thin off its silhouette, and the
  // silhouette is mostly this box.
  const W = 6.9 * K, H = 15.6 * K;
  const pad = Math.ceil(7 * K) + 5;
  const p = new Painter(Math.ceil(W * 2.0) + pad, Math.ceil(H) + pad * 2);
  const cx = p.w * 0.5, hipY = p.h - pad;
  const topY = hipY - H;
  const elder = kind === 'elder';

  // The profile off the sheet: narrow shoulders that slope, a short waist,
  // and hips only slightly wider. A young person carrying too much.
  // Narrow shoulders that slope, almost no waist, and hips barely wider than
  // the waist. There is nothing on this man.
  const PROF = [[0.00, 0.38], [0.09, 0.50], [0.32, 0.44], [0.58, 0.38],
    [0.80, 0.40], [1.00, 0.44]];
  const half = (v) => {
    for (let i = 1; i < PROF.length; i++) {
      if (v <= PROF[i][0]) {
        const t = (v - PROF[i - 1][0]) / (PROF[i][0] - PROF[i - 1][0]);
        return W * lerp(PROF[i - 1][1], PROF[i][1], t * t * (3 - 2 * t));
      }
    }
    return W * PROF[PROF.length - 1][1];
  };
  // the spine leans very slightly forward, so the chest is over the toes
  const mid = (v) => cx + (0.34 - v) * W * 0.10;

  const body = (mat, shrink, opts = {}) => {
    p.field(cx - W, topY - 1, cx + W, hipY + 2, (x, y) => {
      const v = clamp01((y - topY) / H);
      if (v < (opts.from || 0) || v > (opts.to ?? 1)) return null;
      const hw = half(v) * shrink;
      const d = (x - mid(v)) / hw;
      if (Math.abs(d) > 1) return null;
      if (opts.open) {
        // the shawl is cut away down the front so the coat shows under it
        if (d > 0.30) return null;
      }
      const dz = Math.sqrt(clamp01(1 - d * d));
      // the back is in shadow, the chest catches the sun
      return { h: dz * W * 0.44 * shrink,
        tint: -0.02 + (v < 0.12 ? 0.08 : 0) + (d < -0.5 ? -0.10 : d > 0.3 ? 0.05 : 0) };
    }, { mat });
  };
  // The shirt is the body, and stays the body: on the sheet he is a pale
  // shape against the sand and everything dark on him is an edge, a strap or
  // a buckle. A full leather vest would lose him against the ground.
  body('shirt', 1.0);
  if (elder) {
    body('leather', 0.94, { from: 0.05 });        // the slate coat
    body('shirt', 1.04, { open: true, to: 0.60 }); // the shawl over it
  } else {
    // the waistcoat, reduced to the placket down the front edge of the shirt
    p.capsule(cx + W * 0.36, topY + H * 0.10, cx + W * 0.30, hipY - H * 0.16,
      1.5 * K, 1.7 * K, { mat: 'leather', mask: true, dome: 1.3 * K, tint: 0.06 });
    for (let i = 0; i < 3; i++) {
      p.ellipse(cx + W * 0.36, topY + H * (0.22 + i * 0.20), 0.8 * K, 0.7 * K,
        { mat: 'brass', dome: 0.8 * K, tint: 0.18 });
    }
  }

  // shoulder caps, so an arm has something to come out of
  for (const sx of [-0.40, 0.32]) {
    p.ellipse(cx + W * sx, topY + H * 0.10, W * 0.19, H * 0.08,
      { mat: 'shirt', dome: W * 0.24, tint: sx < 0 ? -0.05 : 0.09 });
  }

  p.grain('leather', { freq: 0.55 / K, amp: 0.13, seed: 7 });
  p.grain('shirt', { freq: 0.85 / K, amp: 0.13, seed: 11 });
  // the shirt creases where it is tucked in
  p.ridges('shirt', { angle: 1.42, freq: 0.9 / K, amp: 0.10, height: 0.45 * K, seed: 3, warp: 1.4 });

  // the two pack straps, over the shoulders and down to the belt
  for (const [sx, tint] of [[-0.30, -0.02], [0.22, 0.10]]) {
    p.capsule(cx + W * sx, topY + H * 0.03, cx + W * (sx * 0.5 + 0.06), hipY - H * 0.14,
      1.25 * K, 1.15 * K, { mat: 'leather', dome: 1.1 * K, tint: 0.04 + tint });
  }
  // and a brass slider on the near one
  p.rect(cx + W * 0.16, topY + H * 0.40, 2.0 * K, 1.3 * K,
    { mat: 'brass', dome: 1.0 * K, tint: 0.14 });

  // collar: the shirt turned out, with the neckerchief knotted under it
  p.capsule(cx - W * 0.20, topY + H * 0.02, cx + W * 0.20, topY + H * 0.05, 1.35 * K, 1.2 * K,
    { mat: elder ? 'shirt' : 'maroon', dome: 1.3 * K, tint: 0.08 });
  p.curve([{ x: cx + W * 0.10, y: topY + H * 0.06 },
    { x: cx + W * 0.28, y: topY + H * 0.20 },
    { x: cx + W * 0.18, y: topY + H * 0.34 }], 1.1 * K, 0.5 * K,
    { mat: elder ? 'shirt' : 'maroon', dome: 1.0 * K, steps: 9, tint: -0.04 });
  p.capsule(cx - W * 0.26, topY + H * 0.01, cx - W * 0.02, topY + H * 0.07, 1.1 * K, 1.0 * K,
    { mat: 'shirt', dome: 1.2 * K, tint: 0.16 });

  // belt, buckle, and the pouch that hangs off it
  p.rect(cx - W * 0.46, hipY - H * 0.20, W * 0.94, 2.0 * K,
    { mat: 'leather', mask: true, dome: 1.5 * K, tint: 0.08 });
  p.rect(cx + W * 0.02, hipY - H * 0.21, 2.4 * K, 2.3 * K,
    { mat: 'brass', dome: 1.4 * K, tint: 0.16 });
  p.rect(cx - W * 0.36, hipY - H * 0.16, 3.2 * K, 3.4 * K,
    { mat: 'leather', dome: 1.6 * K, tint: -0.04 });
  p.rect(cx - W * 0.36, hipY - H * 0.16, 3.2 * K, 1.3 * K,
    { mat: 'leather', mask: true, dome: 1.3 * K, tint: 0.14 });

  if (elder) {
    // a lamp on a thong, which is how you find an elder in the dark
    p.capsule(cx - W * 0.30, hipY - H * 0.18, cx - W * 0.34, hipY - H * 0.02, 0.5 * K, 0.5 * K,
      { mat: 'leather', dome: 0.5 * K });
    p.ellipse(cx - W * 0.35, hipY + H * 0.04, 1.6 * K, 2.0 * K,
      { mat: 'brass', dome: 1.5 * K, tint: 0.10 });
  }

  p.smoothHeight(1, 0.4);
  return bake(p, cx, hipY, far, kind, { W, H, topY: topY - hipY });
}

/**
 * Every expression on the sheet's close-up row, as four numbers each. `lid`
 * closes the eye, `brow` tilts it, `open` turns the mouth into a hole, `curl`
 * bows a closed mouth, `wide` opens the eye past normal, and the flags add a
 * blush, a bead of sweat or the little shocked catchlight.
 */
const FACES = [
  { lid: 0.00, brow: 0.00, open: 0.00, curl: 0.00, wide: 0 },                       // level
  { lid: 0.14, brow: -0.05, open: 0.00, curl: 0.06, wide: 0 },                      // wry
  { lid: -0.20, brow: -0.14, open: 0.55, curl: 0.00, wide: 0.7, sweat: 1 },         // alarmed
  { lid: 0.02, brow: 0.06, open: 0.30, curl: 0.10, wide: 0.2, blush: 1 },           // delighted
  { lid: 0.34, brow: -0.10, open: 0.00, curl: -0.09, wide: 0 },                     // sour
  { lid: -0.06, brow: 0.10, open: 0.10, curl: 0.03, wide: 0.2 },                    // asking
  { lid: 0.12, brow: 0.03, open: 0.00, curl: 0.07, wide: 0 },                       // proud
  { lid: 0.48, brow: 0.00, open: 0.00, curl: -0.04, wide: 0 },                      // weary
  { lid: -0.35, brow: -0.18, open: 0.95, curl: 0.00, wide: 1, sweat: 1 },           // shocked
  { lid: 0.40, brow: 0.04, open: 0.62, curl: 0.12, wide: 0, blush: 1 },             // laughing
  { lid: 0.20, brow: 0.12, open: 0.00, curl: 0.02, wide: 0 },                       // thinking
  { lid: -0.10, brow: 0.16, open: 0.22, curl: -0.06, wide: 0.4, sweat: 1 },         // stricken
  { lid: 0.10, brow: -0.16, open: 0.00, curl: -0.10, wide: 0 },                     // grim
  { lid: 0.30, brow: 0.05, open: 0.00, curl: 0.09, wide: 0, blush: 1 },             // fond
];
export const FACE_COUNT = FACES.length;

/**
 * The head, three-quarters on, off the close-up row of the sheet: a round
 * skull with a soft jaw, a small nose, two big readable eyes - the far one
 * cut short by the bridge - dark hair in thick chunks rather than a helmet,
 * and the hat sitting *on* it with the goggles pushed up on the band.
 *
 * At this size a face is four numbers, so the fourteen moods above move the
 * lid, the brow and the mouth and nothing else.
 */

// ---------------------------------------------------------------------------
// his head, drawn from his own portrait
//
// Everything else about this person is a height field that gets lit, and that
// is fine for a body. It is not fine for a head: a head in this game is about
// twelve pixels across, and a lit gradient over twelve pixels is not shading,
// it is noise - which is why his face never looked like the man on the sheet.
//
// So the head, and only the head, is drawn. Sixteen by fifteen, laid out as
// text, in the colours sampled out of his own portrait frames: the same pale
// pith helmet, the same maroon band, the same brass goggles pushed up on the
// brim, the same round blue-grey lenses with a dark rim, the same brown hair
// and the same stubble. Three variants is all it needs out in the desert -
// eyes open, eyes shut, mouth open - because the twenty-one real expressions
// live on the portrait card where there is room for them.

const HEAD_KEY = {
  o: '#301d1f',   // his outline, off the darkest of his own tones
  h: '#7c4c36',   // hair
  H: '#a8724e',   // hair, lit
  s: '#df8b69',   // skin
  S: '#e5936f',   // skin, lit
  d: '#c8765c',   // skin, shaded
  q: '#b4755f',   // the stubble along his jaw
  t: '#c89574',   // the helmet
  T: '#d5a37d',   // the helmet, lit
  u: '#a4735c',   // the helmet, under the brim
  b: '#9a433d',   // the band
  g: '#946958',   // the brass of the goggles
  e: '#4f5c76',   // the goggle lens, up on the crown and in its own shade
  l: '#6d7b96',   // the round lens over his eye, which catches the sky
  L: '#aebbcf',   // the catch of light in it
  r: '#4a3134',   // the rim of the glasses, and the pupil behind it
  m: '#6d2c27',   // mouth
};

// 16 x 18, facing right. The neck joint is the middle of the bottom row.
//
// The shape is the whole job, and a head this size is a silhouette before it
// is anything else. Reading round it from the top: a low domed crown NARROWER
// than the brim, a red band at its foot, the goggles strapped up over it, a
// brim whose tips droop a row below where it meets the crown, the fringe
// hanging out under it, the brow, the round lens set back beneath the brow,
// the NOSE off the front edge, the mouth tucked under it, a chin, and the
// jaw running back into the hair. Take any one of those away and he is a
// blob in a hat again.
//
// The one rule that matters: the hair stays BEHIND the face. It hangs down
// the back of his head and it does not creep round over his cheek, because
// the moment it does he is a brown mass with a nose stuck on the side.
const HEAD_ART = [
  '....oTTTTo...',
  '...otTTTgeo..',
  '..obbbbbbbbo.',
  '.ouTTTTTTTTuo',
  'ouuuuuuuuuuuo',
  '.ohhhhHHHSoo.',
  'oHhhhhssrrro.',
  'oHhhhhsdLlro.',
  'oHhhhhssssso.',
  'ohhhhhssssSso',
  'ohHhhhssssdso',
  '.ohhhhssmmoo.',
  '.ohhhsqqqso..',
  '..ohhqqqso...',
  '...oobbso....',
];

/** Shut: the lid comes down and the lens goes dark behind the glass. */
const HEAD_SHUT = {
  7: 'oHhhhhsdrrro.',
};
/** Talking: the jaw drops and the mouth is a hole rather than a line. */
const HEAD_OPEN = {
  11: '.ohhhhsmmmoo.',
  12: '.ohhhsqmmso..',
};

const sideHeads = new Map();

// 8x8 ordered dither, the same one the painter uses, so the head breaks up
// along the same grid as everything else in the game.
const HEAD_BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21],
].map((r) => r.map((v) => (v + 0.5) / 64));

/**
 * The height of the head at one art cell.
 *
 * The rest of the game's art is a height field that gets lit, and a flat
 * sprite dropped into the middle of it reads as a sticker. So the drawn art
 * gets a height field of its own: the crown is a dome, the brim is a thin
 * plate that falls away at its edges, the skull and the hair are a bigger
 * dome behind it, and the nose stands off the front of the face. Light it
 * with the painter's own lamp and it belongs to the same world.
 */
function headHeight(x, y, ch, W) {
  if (ch === 'o') return 0;
  const dome = (cx, cy, rx, ry) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return d >= 1 ? 0 : Math.sqrt(1 - d);
  };
  if (y <= 1) return 0.56 + dome(6.5, 1.6, 3.6, 3.0) * 0.44;    // the crown
  if (y === 2) return 0.66;                                     // the band
  if (y <= 4) {                                                 // the brim
    const t = 1 - Math.abs(x - 6) / (W / 2);
    return (y === 3 ? 0.64 : 0.46) + t * t * 0.18;
  }
  // The skull is nearly FLAT. The lamp is here to round the hat and to catch
  // the nose; the face itself is painted, not lit.
  let h = 0.62 + dome(5.4, 9.4, 6.0, 6.8) * 0.26;
  // the brow, the nose and the lips stand off the front of it
  if (y === 6 && x >= 9) h += 0.06;
  if (y >= 9 && y <= 10 && x >= 10) h += 0.20;
  if (y >= 11 && y <= 12 && x >= 8) h += 0.05;
  // and the eye is a hollow under the brow, not a flat patch
  if (y >= 6 && y <= 7 && x >= 8 && x <= 10) h -= 0.11;
  return h;
}

function paintHeadSide(K, far, kind, opts = {}) {
  // Drawn slightly UNDER the body's own pixel now. It was a third larger,
  // which made the hat and the glasses legible and made him a doll: the head
  // came out half his height. At this scale he reads as a man in a hat, and
  // the hat is still the thing you recognise across the desert.
  const px = Math.max(1, Math.round(K * 0.92));
  const rows = HEAD_ART.slice();
  const mood = opts.mood | 0;
  // 7 weary and 12 grim read as shut at this size; 2, 3, 8 and 9 are open
  const shut = (mood === 7 || mood === 12) && !opts.open;
  // `open` is forced while he is actually saying something, so the sprite out
  // in the desert moves its mouth for as long as the words are arriving
  // rather than being a photograph with a speech bubble next to it
  const open = !!opts.open || mood === 2 || mood === 3 || mood === 8 || mood === 9;
  const patch = shut ? HEAD_SHUT : open ? HEAD_OPEN : null;
  if (patch) for (const k of Object.keys(patch)) rows[+k] = patch[k];

  const W = rows[0].length, H = rows.length;
  const cv = makeCanvas(W * px, H * px);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const elder = kind === 'elder';

  // the height field first, so the lighting can read slopes off it
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      hgt[y * W + x] = (ch === '.' || ch === 'o') ? 0 : headHeight(x, y, ch, W);
    }
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : hgt[y * W + x];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      let col = HEAD_KEY[ch];
      if (!col) continue;
      if (elder) {
        // the same cut of hat in red, over white hair
        if (ch === 't') col = '#95412f'; else if (ch === 'T') col = '#c3735c';
        else if (ch === 'u') col = '#63251d'; else if (ch === 'b') col = '#3d2a20';
        else if (ch === 'h') col = '#8d867d'; else if (ch === 'H') col = '#bcb5ab';
        else if (ch === 'q') col = '#cbb9ad';
      }
      if (opts.spore && (ch === 'l' || ch === 'L' || ch === 'e')) {
        col = ch === 'L' ? '#d8b4ff' : '#a86cd8';
      }
      if (ch !== 'o') {
        // the painter's lamp: over his left shoulder and well above him
        const dx = (at(x + 1, y) - at(x - 1, y)) * 1.7;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 1.7;
        const nl = Math.hypot(dx, dy, 1) || 1;
        let lam = (-dx * -0.55 + -dy * -0.72 + 0.42) / (nl * 0.99);
        lam = clamp01(lam * 0.86 + at(x, y) * 0.30);
        // quantised through the same dither, so it bands like the rest
        const bay = HEAD_BAYER[y & 7][x & 7];
        const step = 0.16;
        const q = Math.round((lam + (bay - 0.5) * step * 0.34) / step) * step;
        const s = clamp01(q) - 0.60;
        col = s > 0 ? mixHex(col, '#fff1cf', Math.min(0.20, s * 0.44))
                    : mixHex(col, '#2a1a20', Math.min(0.24, -s * 0.40));
      }
      if (far) col = mixHex(col, '#8a7a63', 0.34);
      g.fillStyle = col;
      g.fillRect(x * px, y * px, px, px);
    }
  }
  // the hat can come off, and when it does the brim goes with it
  if (opts.noHat) g.clearRect(0, 0, W * px, 5 * px);
  return {
    cv,
    ox: (W / 2) * px,
    oy: (H - 1) * px,
    W: W * px, H: H * px,
    eye: { x: 3 * px, y: -6 * px },
  };
}

/** His head at a given size, baked once per look. */
export function headSide(K = 1, opts = {}) {
  const k = `${Math.max(1, Math.round(K * 0.92))}:${opts.kind || 'vess'}:${opts.mood | 0}:` +
    `${opts.noHat ? 1 : 0}:${opts.spore ? 1 : 0}:${opts.far ? 1 : 0}:${opts.open ? 1 : 0}`;
  let v = sideHeads.get(k);
  if (!v) {
    v = paintHeadSide(K, !!opts.far, opts.kind || 'vess', opts);
    if (sideHeads.size > 120) sideHeads.clear();
    sideHeads.set(k, v);
  }
  return v;
}

function paintHead(K, far, kind, opts = {}) {
  // Laid out in whole units rather than fractions of a bounding box, because
  // a face is a set of distances and you can read them here: the eyes are
  // two units apart, the brim is half as wide again as the head, the chin is
  // four units under the eyes. The numbers come off the sheet's close-up row.
  const u = K;
  const W = 8.6 * K, H = 8.8 * K;                  // kept for the callers
  const pad = Math.ceil(10 * K) + 6;
  const p = new Painter(Math.ceil(16 * K) + pad, Math.ceil(18 * K) + pad);
  const cx = Math.round(p.w * 0.46), cy = Math.round(p.h * 0.54);
  const X = (n) => cx + n * u, Y = (n) => cy + n * u;
  const mood = opts.mood | 0;
  const F = FACES[mood] || FACES[0];
  const elder = kind === 'elder';
  const bare = !!opts.noHat;
  const neckY = Y(4.8);

  // neck first, short and set back, so the jaw sits over it rather than
  // carrying on down from it
  p.capsule(X(-0.5), Y(2.6), X(-0.1), neckY, 1.5 * u, 1.6 * u,
    { mat: 'skin', dome: 1.3 * u, tint: -0.28 });

  // The hair at the back and over the crown, before the face, so the face
  // cuts into it. What is on top never needs painting: the hat is there.
  p.ellipse(X(-1.0), Y(-1.0), 3.6 * u, 3.6 * u, { mat: 'hair', dome: 2.4 * u, tint: -0.03 });
  p.ellipse(X(-2.6), Y(1.2), 1.5 * u, 1.8 * u, { mat: 'hair', dome: 1.6 * u, tint: 0.02 });

  // The face: a rounded square, 8 across and 8 down, barely narrower at the
  // chin. Anything more tapered than this reads as a snout.
  p.field(X(-4.6), Y(-4.6), X(4.8), Y(4.0), (x, y) => {
    const v = (y - cy - 0.2 * u) / (3.5 * u);       // -1 crown .. +1 chin
    const taper = v > 0 ? 1 - Math.pow(v, 3) * 0.26 : 1 - v * v * 0.16;
    const hw = 4.0 * u * taper;
    const d = (x - cx) / hw;
    if (Math.abs(d) > 1) return null;
    return { h: Math.sqrt(clamp01(1 - d * d)) * 3.4 * u * taper,
      tint: 0.04 - Math.max(0, v) * 0.05 + (d < -0.5 ? -0.09 : 0) };
  }, { mat: 'skin' });
  // the ear on the back edge, the nose on the front one
  p.ellipse(X(-3.3), Y(-0.1), 0.8 * u, 1.0 * u, { mat: 'skin', dome: 1.0 * u, tint: 0.02 });
  p.capsule(X(3.3), Y(0.5), X(3.9), Y(1.0), 0.75 * u, 0.55 * u,
    { mat: 'skin', dome: 1.5 * u, tint: 0.22 });
  // and a shade under the jaw, so the chin has a corner
  p.field(X(-4.2), Y(1.6), X(4.2), Y(4.0), (x, y) =>
    ({ h: 0, tint: -clamp01((y - Y(1.6)) / (2.2 * u)) * 0.20 }), { mat: 'skin', mask: true });
  p.speckle('skin', { density: 0.04, amp: 0.16, seed: 19 });

  // The fringe: hair hanging out from under the brim across the forehead,
  // ending in chunks well clear of the brows. This is the hair you see.
  if (!elder) {
    p.field(X(-4.4), Y(-4.9), X(4.4), Y(-1.2), (x, y) => {
      const t = (x - cx) / (4.2 * u);
      if (Math.abs(t) > 1) return null;
      const edge = Y(-2.1 - Math.abs(Math.sin(t * 4.2)) * 0.5 + t * 0.25);
      if (y > edge || y < Y(-4.7 + t * t * 0.7)) return null;
      return { h: 1.7 * u * Math.sqrt(clamp01(1 - t * t * 0.7)), tint: 0.06 - t * 0.05 };
    }, { mat: 'hair' });
    // two heavy locks down past the cheek, one each side of the face
    for (const [x0, y0, x1, y1, r] of [[-3.2, -2.4, -3.8, 1.6, 1.3], [3.0, -2.2, 3.4, -0.2, 0.85]]) {
      p.curve([{ x: X(x0), y: Y(y0) }, { x: X((x0 + x1) / 2 - 0.4), y: Y((y0 + y1) / 2) },
        { x: X(x1), y: Y(y1) }], r * u, 0.4 * u,
        { mat: 'hair', dome: r * 0.9 * u, steps: 9, tint: 0.08 });
    }
  } else {
    // the beard, which on the sheet is most of the Elder's face
    p.field(X(-3.2), Y(0.0), X(4.0), Y(3.6), (x, y) => {
      const v = clamp01((y - Y(0.0)) / (3.6 * u));
      const hw = lerp(3.4, 1.4, v * v) * u;
      const d = (x - X(0.3)) / hw;
      if (Math.abs(d) > 1) return null;
      return { h: Math.sqrt(clamp01(1 - d * d)) * 1.9 * u, tint: -0.10 - v * 0.06 };
    }, { mat: 'hair' });
    p.capsule(X(0.2), Y(0.5), X(3.4), Y(0.8), 1.2 * u, 0.85 * u,
      { mat: 'hair', dome: 1.1 * u, tint: 0.14 });          // moustache
    p.capsule(X(-0.4), Y(-2.2), X(3.0), Y(-1.9), 1.2 * u, 0.85 * u,
      { mat: 'hair', dome: 1.0 * u, tint: 0.12 });          // brows to hide in
  }

  // ---- the face itself --------------------------------------------------
  // Two big eyes: the near one full, the far one narrower and further round
  // the cheek. The pair is what turns a profile into a three-quarter view.
  const open = clamp01(1 - F.lid);
  const EYES = elder ? [[1.8, 0.6]] : [[2.05, 1.0], [-1.15, 0.78]];
  for (const [ex, sc] of EYES) {
    if (opts.goggles) break;
    const ew = (1.05 + F.wide * 0.3) * u * sc, eh = 1.6 * u * open * sc;
    if (eh < 0.6) {
      // shut: a lash line, bowed the way a closed eye bows
      p.curve([{ x: X(ex) - ew, y: Y(-0.4) }, { x: X(ex), y: Y(-0.15) }, { x: X(ex) + ew, y: Y(-0.4) }],
        0.6 * u, 0.5 * u, { mat: 'hair', mask: true, dome: 0.5 * u, steps: 7, tint: 0.04 });
      continue;
    }
    p.ellipse(X(ex), Y(-0.35), ew, eh, { mat: 'paper', dome: 1.5 * u, tint: 0.32 });
    if (opts.spore) {
      // the iris fills with it, and lights from behind
      p.ellipse(X(ex + 0.1), Y(-0.30), ew * 0.86, eh * 0.92,
        { mat: 'spore', dome: 1.7 * u, tint: 0.30, emissive: 0.9 });
      p.ellipse(X(ex + 0.1), Y(-0.30), ew * 0.46, eh * 0.50,
        { mat: 'spore', mask: true, dome: 1.7 * u, tint: 0.85, emissive: 1 });
    } else {
      p.ellipse(X(ex + 0.22), Y(-0.28), ew * 0.62, eh * 0.84, { mat: 'eye', dome: 1.7 * u, tint: -0.04 });
      p.ellipse(X(ex - 0.18), Y(-0.72), ew * 0.32, eh * 0.28,
        { mat: 'eye', mask: true, dome: 1.7 * u, tint: 0.80 });
    }
    // the upper lash, which is what gives an eye this size any weight
    p.capsule(X(ex) - ew, Y(-1.0), X(ex) + ew * 0.9, Y(-1.05), 0.5 * u, 0.42 * u,
      { mat: 'hair', dome: 0.5 * u, tint: 0.02 });
  }
  // brows over the fringe, angled by the mood
  if (!elder && !opts.goggles) {
    for (const [bx, sc] of [[2.05, 1.0], [-1.15, 0.8]]) {
      p.capsule(X(bx - 0.9 * sc), Y(-2.0 - F.brow * 8), X(bx + 0.9 * sc), Y(-1.8 - F.brow * 5),
        0.7 * u, 0.55 * u, { mat: 'hair', mask: true, dome: 0.7 * u, tint: 0.10 });
    }
  }
  // the mouth: a line that bows, or a hole with a tongue in it
  const mx = X(2.0), my = Y(1.55);
  if (F.open > 0.12) {
    p.ellipse(mx, my + F.open * 0.4 * u, (0.65 + F.open * 0.45) * u, (0.4 + F.open * 1.0) * u,
      { mat: 'eye', dome: -1.1 * u, tint: -0.34 });
    p.ellipse(mx, my + (0.35 + F.open * 0.5) * u, 0.45 * u, 0.3 * u * F.open,
      { mat: 'maroon', mask: true, dome: 0.8 * u, tint: 0.18 });
  } else {
    p.curve([{ x: mx - 0.8 * u, y: my }, { x: mx, y: my + F.curl * 8 * u },
      { x: mx + 0.8 * u, y: my }], 0.58 * u, 0.44 * u,
      { mat: 'skin', mask: true, dome: -1.0 * u, steps: 8, tint: -0.36 });
  }
  if (F.blush) {
    for (const bx of [2.5, -0.5]) {
      p.ellipse(X(bx), Y(0.6), 0.9 * u, 0.42 * u,
        { mat: 'skin', mask: true, dome: 0.6 * u, tint: 0.26 });
    }
  }
  if (F.sweat) {
    p.ellipse(X(-0.2), Y(-3.6), 0.5 * u, 0.7 * u, { mat: 'lens', dome: 1.3 * u, tint: 0.34 });
  }

  // Goggles: brass rims on a leather band, either pushed up onto the hat brim
  // - which is where the sheet keeps them - or pulled down over the eyes.
  if (!opts.noGoggles && !elder) {
    const gy = opts.goggles ? Y(-0.35) : Y(bare ? -3.5 : -4.0);
    p.capsule(X(-3.4), gy, X(3.4), gy, 1.3 * u, 1.3 * u,
      { mat: 'leather', dome: 1.1 * u, tint: -0.04 });
    for (const [gx, sc] of [[2.05, 1.0], [-1.15, 0.8]]) {
      p.ellipse(X(gx), gy, 1.35 * u * sc, 1.25 * u * sc, { mat: 'brass', dome: 1.9 * u, tint: 0.12 });
      p.ellipse(X(gx), gy, 0.95 * u * sc, 0.88 * u * sc, { mat: 'lens', dome: 1.6 * u, tint: 0.10 });
      p.ellipse(X(gx - 0.4), gy - 0.4 * u, 0.4 * u * sc, 0.3 * u * sc,
        { mat: 'lens', mask: true, dome: 1.5 * u, tint: 0.62 });
    }
  }

  // The hat: a brim half as wide again as the head, dipping front and back, a
  // rounded crown with a dent in it, the band round its base, and on the Elder
  // a quill through the band.
  if (!bare) {
    const hy = Y(-3.6);
    p.ellipse(X(0), hy, 6.0 * u, 0.95 * u, { mat: 'hat', dome: 1.1 * u, tint: 0.05 });
    p.ellipse(X(3.4), hy + 0.45 * u, 2.9 * u, 0.65 * u, { mat: 'hat', dome: 0.9 * u, tint: -0.07 });
    p.ellipse(X(-3.6), hy + 0.35 * u, 2.4 * u, 0.55 * u, { mat: 'hat', dome: 0.8 * u, tint: -0.13 });
    p.ellipse(X(-0.3), hy - 1.8 * u, 3.1 * u, 2.0 * u, { mat: 'hat', dome: 3.4 * u, tint: 0.11 });
    p.ellipse(X(-1.2), hy - 2.9 * u, 1.3 * u, 0.6 * u,
      { mat: 'hat', mask: true, dome: -2.0 * u, tint: -0.22 });
    p.rect(X(-3.3), hy - 1.0 * u, 6.3 * u, 1.4 * u,
      { mat: elder ? 'leather' : 'maroon', mask: true, dome: 1.3 * u, tint: 0.08 });
    if (elder) {
      p.curve([{ x: X(-1.8), y: hy - 1.0 * u }, { x: X(-3.0), y: hy - 4.0 * u },
        { x: X(-3.4), y: hy - 7.2 * u }], 1.0 * u, 0.3 * u,
        { mat: 'paper', dome: 1.0 * u, steps: 9, tint: 0.22 });
    }
    p.grain('hat', { freq: 0.55 / K, amp: 0.13, seed: 23 });
  }

  p.smoothHeight(1, 0.4);
  return bake(p, cx, neckY, far, kind, { W, H, eye: { x: 2.05 * u, y: -0.35 * u } });
}

/**
 * One bone. The options are what turns a sausage into a limb: `sleeve` puts a
 * rolled cuff where the shirt ends and the arm begins, `hand` puts a hand with
 * a thumb on the end, `knee` creases the shin.
 */
function paintBone(len, r0, r1, mat, K, far, kind, opts = {}) {
  const pad = Math.ceil(Math.max(r0, r1) * 2 + 6);
  const p = new Painter(Math.ceil(len) + pad * 2, pad * 2 + 4);
  const cy = p.h / 2, x0 = pad, x1 = pad + len;
  const ft = (far ? -0.18 : 0) + (opts.shade || 0);
  p.curve([{ x: x0, y: cy }, { x: (x0 + x1) / 2, y: cy - (opts.bow || 0) }, { x: x1, y: cy }],
    r0, r1, { mat, dome: r0 * 0.92, steps: 12, tint: ft });
  p.ellipse(x0, cy, r0 * 1.08, r0 * 1.02, { mat, dome: r0, tint: ft + 0.05 });
  if (opts.sleeve) {
    // the shirt sleeve, rolled and sitting proud of the forearm
    p.capsule(x0 - r0 * 0.2, cy, x0 + len * 0.26, cy - (opts.bow || 0) * 0.3, r0 * 1.22, r0 * 1.16,
      { mat: 'shirt', dome: r0 * 1.1, tint: ft + 0.08 });
    p.capsule(x0 + len * 0.24, cy, x0 + len * 0.30, cy, r0 * 1.26, r0 * 1.20,
      { mat: 'shirt', dome: r0 * 1.0, tint: ft + 0.18 });
  }
  if (opts.hand) {
    // The palm, then four fingers off the front of it and a thumb off the
    // side. Curled when there is something in the hand, open when there is
    // not - which is the difference between a hand on a pick and a bead.
    const curl = opts.grip ?? 0.35;
    p.ellipse(x1 + r1 * 0.42, cy, r1 * 1.22, r1 * 1.08,
      { mat: 'skin', dome: r1 * 1.15, tint: ft + 0.04 });
    for (let f = 0; f < 4; f++) {
      // they fan across the palm and shorten toward the little finger
      const spread = (f - 1.5) * r1 * 0.52;
      const len = r1 * (1.26 - Math.abs(f - 1.1) * 0.17);
      const fr = r1 * (0.30 - f * 0.022);
      const bx = x1 + r1 * 0.95, by = cy + spread * 0.55;
      // a curled finger comes back toward the palm instead of straight out
      const tx = bx + len * (1 - curl * 1.25);
      const ty = by + spread * 0.35 + len * curl * 0.95;
      p.capsule(bx, by, tx, ty, fr * 1.05, fr * 0.82,
        { mat: 'skin', dome: fr * 1.2, tint: ft + 0.10 - f * 0.02 });
      // a knuckle, so the finger has a joint in it
      p.ellipse(bx, by, fr * 1.1, fr * 1.0,
        { mat: 'skin', mask: true, dome: fr * 1.1, tint: ft + 0.16 });
    }
    // the thumb, off the top of the palm and opposing the rest
    p.capsule(x1 + r1 * 0.3, cy - r1 * 0.62, x1 + r1 * (1.25 - curl * 0.5), cy - r1 * (0.95 - curl * 0.7),
      r1 * 0.40, r1 * 0.30, { mat: 'skin', dome: r1 * 0.5, tint: ft + 0.14 });
  }
  if (opts.knee) {
    p.ellipse(x0, cy, r0 * 1.14, r0 * 1.08, { mat, mask: true, dome: r0 * 0.6, tint: ft + 0.10 });
  }
  p.grain(mat, { freq: 0.6 / K, amp: 0.10, seed: 31 });
  return bake(p, pad, cy, far, kind, { len });
}

/** The hat on its own, so it can be knocked off his head and land in the sand. */
function paintHat(K, far, kind) {
  const W = 8.6 * K, H = 8.8 * K;
  const p = new Painter(Math.ceil(W * 2.2) + 8, Math.ceil(H * 1.2) + 8);
  const cx = p.w * 0.5, cy = p.h * 0.62;
  const elder = kind === 'elder';
  p.ellipse(cx - W * 0.02, cy, W * 0.88, H * 0.115, { mat: 'hat', dome: W * 0.13, tint: 0.03 });
  p.ellipse(cx + W * 0.40, cy + H * 0.045, W * 0.44, H * 0.075, { mat: 'hat', dome: W * 0.10, tint: -0.06 });
  p.ellipse(cx - W * 0.04, cy - H * 0.19, W * 0.38, H * 0.22, { mat: 'hat', dome: W * 0.40, tint: 0.09 });
  p.ellipse(cx - W * 0.14, cy - H * 0.30, W * 0.15, H * 0.07,
    { mat: 'hat', mask: true, dome: -W * 0.22, tint: -0.20 });
  p.rect(cx - W * 0.40, cy - H * 0.10, W * 0.74, 1.4 * K,
    { mat: elder ? 'leather' : 'maroon', mask: true, dome: 1.2 * K, tint: 0.06 });
  // the goggles ride up with it, because they live on the band
  if (!elder) {
    p.capsule(cx - W * 0.34, cy - H * 0.09, cx + W * 0.34, cy - H * 0.09, 1.2 * K, 1.2 * K,
      { mat: 'leather', dome: 1.0 * K, tint: -0.04 });
    p.ellipse(cx + W * 0.22, cy - H * 0.09, W * 0.15, H * 0.12, { mat: 'brass', dome: 1.7 * K, tint: 0.10 });
    p.ellipse(cx + W * 0.22, cy - H * 0.09, W * 0.11, H * 0.085, { mat: 'lens', dome: 1.4 * K, tint: 0.14 });
  }
  p.grain('hat', { freq: 0.55 / K, amp: 0.14, seed: 23 });
  p.smoothHeight(1, 0.4);
  return bake(p, cx, cy, far, kind);
}

/**
 * A boot, drawn from the ankle with the toe pointing along +x. The sheet's
 * boots are heavy, come up the shin, and have a pale turned-down cuff at the
 * top - which is the only light thing below the belt and so does most of the
 * work of reading the legs against the sand.
 */
function paintBoot(K, far, kind) {
  const p = new Painter(Math.ceil(12 * K) + 8, Math.ceil(9 * K) + 8);
  const ax = 4 + 2.8 * K, ay = 4 + 3.4 * K;
  const ft = far ? -0.18 : 0;
  // the shaft up the shin, then the foot forward, then a heel behind it
  p.capsule(ax, ay - 2.8 * K, ax, ay + 1.4 * K, 2.0 * K, 1.8 * K,
    { mat: 'boot', dome: 1.8 * K, tint: ft + 0.04 });
  p.capsule(ax - 0.4 * K, ay + 1.9 * K, ax + 4.4 * K, ay + 2.1 * K, 1.6 * K, 1.1 * K,
    { mat: 'boot', dome: 1.4 * K, tint: ft });
  p.capsule(ax - 1.7 * K, ay + 2.2 * K, ax - 0.6 * K, ay + 2.2 * K, 1.3 * K, 1.4 * K,
    { mat: 'boot', dome: 1.1 * K, tint: ft - 0.06 });
  // the turned-down cuff at the top
  p.capsule(ax - 0.6 * K, ay - 3.1 * K, ax + 0.7 * K, ay - 2.6 * K, 2.5 * K, 2.4 * K,
    { mat: 'boot', dome: 2.0 * K, tint: ft + 0.42 });
  p.capsule(ax - 0.6 * K, ay - 2.2 * K, ax + 0.7 * K, ay - 2.0 * K, 2.2 * K, 2.1 * K,
    { mat: 'boot', mask: true, dome: 1.4 * K, tint: ft - 0.12 });
  // the sole, worn pale
  p.rect(ax - 2.1 * K, ay + 2.7 * K, 6.9 * K, 1.0 * K,
    { mat: 'boot', mask: true, tint: ft - 0.28, dome: 0 });
  // a strap and buckle over the instep
  p.capsule(ax + 1.0 * K, ay + 0.7 * K, ax + 1.6 * K, ay + 2.6 * K, 0.7 * K, 0.6 * K,
    { mat: 'boot', mask: true, dome: 0.8 * K, tint: ft + 0.16 });
  p.rect(ax + 0.6 * K, ay - 0.4 * K, 1.5 * K, 1.1 * K, { mat: 'brass', dome: 0.9 * K, tint: 0.12 });
  p.grain('boot', { freq: 0.6 / K, amp: 0.11, seed: 37 });
  return bake(p, ax, ay, far, kind);
}

/**
 * The pack. On the sheet it is the biggest single shape he has: a tall
 * canvas body with a buckled flap, a bedroll strapped across the top, a side
 * pocket, and a tin cup hanging off it. Drawn from its centre, hung behind
 * the shoulder.
 */
function paintPack(K, far, kind) {
  const W = 8.2 * K, H = 10.0 * K;
  const p = new Painter(Math.ceil(W) + 16, Math.ceil(H) + 18);
  const cx = p.w / 2, cy = p.h / 2;
  const x0 = cx - W / 2, y0 = cy - H / 2;

  // the body: a rounded box that bulges, because it is full
  p.field(x0, y0, x0 + W, y0 + H, (x, y) => {
    const u = (x - x0) / W, v = (y - y0) / H;
    const bulge = 1 - Math.pow(Math.abs(v - 0.5) * 2, 3) * 0.35;
    const d = (u - 0.5) * 2 / bulge;
    if (Math.abs(d) > 1) return null;
    return { h: Math.sqrt(clamp01(1 - d * d)) * W * 0.44, tint: -0.02 + (d < -0.4 ? -0.08 : 0) };
  }, { mat: 'pack' });
  p.ridges('pack', { angle: 0.08, freq: 1.0 / K, amp: 0.13, height: 0.55 * K, seed: 5, warp: 0.6 });

  // the flap over the top, with two buckles on it
  p.field(x0, y0, x0 + W, y0 + H * 0.42, (x, y) => {
    const u = (x - x0) / W, v = (y - y0) / (H * 0.42);
    const d = (u - 0.5) * 2 / (1 - v * v * 0.18);
    if (Math.abs(d) > 1) return null;
    return { h: Math.sqrt(clamp01(1 - d * d)) * W * 0.40 + 0.8 * K, tint: 0.04 };
  }, { mat: 'leather' });
  for (const bx of [0.30, 0.68]) {
    p.capsule(x0 + W * bx, y0 + H * 0.30, x0 + W * bx, y0 + H * 0.52, 0.9 * K, 0.85 * K,
      { mat: 'leather', dome: 0.8 * K, tint: 0.14 });
    p.rect(x0 + W * bx - 1.0 * K, y0 + H * 0.44, 2.0 * K, 1.5 * K,
      { mat: 'brass', dome: 1.1 * K, tint: 0.16 });
  }

  // the bedroll strapped across the top
  p.capsule(x0 + W * 0.02, y0 - H * 0.03, x0 + W * 0.98, y0 - H * 0.03, 2.4 * K, 2.4 * K,
    { mat: 'shirt', dome: 2.2 * K, tint: 0.08 });
  for (const sx of [0.26, 0.72]) {
    p.capsule(x0 + W * sx, y0 - H * 0.10, x0 + W * sx, y0 + H * 0.06, 0.7 * K, 0.7 * K,
      { mat: 'leather', mask: true, dome: 0.7 * K, tint: 0.12 });
  }
  p.ellipse(x0 + W * 0.02, y0 - H * 0.03, 2.2 * K, 2.3 * K,
    { mat: 'shirt', dome: -1.4 * K, tint: -0.14 });

  // a side pocket and the tin cup that hangs off it
  p.rect(x0 + W * 0.58, y0 + H * 0.58, W * 0.38, H * 0.26,
    { mat: 'pack', dome: 1.8 * K, tint: 0.10 });
  p.ellipse(x0 + W * 0.18, y0 + H * 0.86, 2.0 * K, 1.8 * K, { mat: 'brass', dome: 1.5 * K, tint: 0.08 });

  p.smoothHeight(1, 0.4);
  return bake(p, cx, cy, far, kind);
}

/**
 * The map tube: a maroon leather cylinder with brass end caps, slung at the
 * hip at an angle. It is the one saturated thing on him, and on the sheet it
 * is what your eye lands on first.
 */
function paintTube(K, far, kind) {
  const L = 10.4 * K, R = 1.9 * K;
  const p = new Painter(Math.ceil(L) + 12, Math.ceil(R * 2) + 12);
  const cx = p.w / 2, cy = p.h / 2;
  p.capsule(cx - L / 2, cy, cx + L / 2, cy, R, R, { mat: 'maroon', dome: R * 0.95, tint: 0.02 });
  for (const ex of [-0.5, 0.5]) {
    p.capsule(cx + L * ex * 0.92, cy, cx + L * ex, cy, R * 1.12, R * 1.05,
      { mat: 'brass', dome: R * 1.0, tint: 0.14 });
  }
  p.capsule(cx - L * 0.12, cy - R, cx - L * 0.12, cy + R, 0.7 * K, 0.7 * K,
    { mat: 'leather', mask: true, dome: 0.7 * K, tint: 0.12 });
  p.grain('maroon', { freq: 0.7 / K, amp: 0.10, seed: 41 });
  return bake(p, cx, cy, far, kind);
}

/**
 * Things he carries or leaves lying about. Each is drawn from its grip end,
 * so a hand can be put at (ox, oy) and the tool points the way the arm does.
 */
function paintProps(K, kind) {
  const mk = (w, h, fn) => {
    const p = new Painter(Math.ceil(w) + 10, Math.ceil(h) + 10);
    fn(p, 5, p.h / 2);
    return bake(p, 5, p.h / 2, false, kind);
  };
  return {
    notebook: mk(8 * K, 10 * K, (p, x, y) => {
      p.rect(x, y - 4.6 * K, 6.6 * K, 9.2 * K, { mat: 'leather', dome: 1.9 * K, tint: 0.03 });
      p.rect(x + 1.0 * K, y - 3.6 * K, 5.0 * K, 7.2 * K, { mat: 'paper', dome: 1.0 * K, tint: 0.06 });
      for (let i = 0; i < 5; i++) {
        p.rect(x + 1.7 * K, y - 2.9 * K + i * 1.4 * K, 3.4 * K, 0.6 * K,
          { mat: 'paper', mask: true, tint: -0.42, dome: 0 });
      }
      p.capsule(x + 0.5 * K, y - 4.6 * K, x + 0.5 * K, y + 4.6 * K, 0.5 * K, 0.5 * K,
        { mat: 'maroon', dome: 0.5 * K, tint: 0.12 });
    }),
    pencil: mk(9 * K, 3 * K, (p, x, y) => {
      p.capsule(x, y, x + 7 * K, y, 0.75 * K, 0.7 * K, { mat: 'wood', dome: 0.7 * K });
      p.capsule(x + 7 * K, y, x + 8.6 * K, y, 0.7 * K, 0.25 * K, { mat: 'hair', dome: 0.5 * K, tint: -0.1 });
    }),
    // the trowel off the sheet's dig row: a wooden handle and a worn blade
    trowel: mk(13 * K, 6 * K, (p, x, y) => {
      p.capsule(x, y, x + 5 * K, y, 1.3 * K, 1.0 * K, { mat: 'wood', dome: 1.2 * K });
      p.capsule(x + 4.4 * K, y, x + 5.6 * K, y, 1.0 * K, 0.8 * K, { mat: 'brass', dome: 0.9 * K, tint: 0.12 });
      p.poly([{ x: x + 5.4 * K, y: y - 2.3 * K }, { x: x + 10 * K, y: y - 1.1 * K },
        { x: x + 12.6 * K, y }, { x: x + 10 * K, y: y + 1.1 * K }, { x: x + 5.4 * K, y: y + 2.3 * K }],
        { mat: 'metal', dome: 1.5 * K, tint: 0.08 });
    }),
    brush: mk(12 * K, 5 * K, (p, x, y) => {
      p.capsule(x, y, x + 7 * K, y, 1.2 * K, 1.0 * K, { mat: 'wood', dome: 1.1 * K });
      p.capsule(x + 7 * K, y, x + 11 * K, y, 1.9 * K, 1.2 * K, { mat: 'fur', dome: 1.5 * K, tint: 0.10 });
    }),
    // a bottle, held by the neck. The level in it goes down as he drinks it,
    // which is the only prop in the game with a state
    beer: mk(7 * K, 14 * K, (p, x, y) => {
      p.capsule(x + 3 * K, y - 6.2 * K, x + 3 * K, y - 4.2 * K, 1.0 * K, 1.2 * K,
        { mat: 'wood', dome: 0.9 * K, tint: -0.06 });
      p.rect(x + 2.0 * K, y - 7.0 * K, 2.0 * K, 1.0 * K, { mat: 'brass', dome: 0.8 * K, tint: 0.14 });
      p.field(x, y - 4.4 * K, x + 6 * K, y + 5.2 * K, (px, py) => {
        const v = clamp01((py - (y - 4.4 * K)) / (9.6 * K));
        const hw = 2.0 * K * (v < 0.16 ? lerp(0.55, 1, v / 0.16) : 1);
        const d = (px - (x + 3 * K)) / hw;
        if (Math.abs(d) > 1) return null;
        return { h: Math.sqrt(clamp01(1 - d * d)) * 1.8 * K, tint: -0.02 };
      }, { mat: 'wood' });
      // the label, and a highlight down the glass
      p.rect(x + 1.0 * K, y - 1.0 * K, 4.0 * K, 3.0 * K,
        { mat: 'paper', mask: true, dome: 0.8 * K, tint: 0.10 });
      p.capsule(x + 1.8 * K, y - 3.6 * K, x + 1.8 * K, y + 3.6 * K, 0.4 * K, 0.4 * K,
        { mat: 'wood', mask: true, dome: 0.5 * K, tint: 0.34 });
    }),
    canteen: mk(9 * K, 11 * K, (p, x, y) => {
      p.ellipse(x + 4 * K, y, 4 * K, 4.8 * K, { mat: 'metal', dome: 3.4 * K, tint: -0.02 });
      p.ellipse(x + 4 * K, y, 2.4 * K, 2.9 * K, { mat: 'metal', mask: true, dome: -1.6 * K, tint: -0.14 });
      p.capsule(x + 4 * K, y - 4.8 * K, x + 4 * K, y - 6.4 * K, 1.3 * K, 1.2 * K, { mat: 'wood', dome: 1.1 * K });
    }),
    // the map, which is the pose the sheet draws him in most often
    map: mk(14 * K, 10 * K, (p, x, y) => {
      p.field(x, y - 4.4 * K, x + 13 * K, y + 4.4 * K, (px, py) => {
        const u = (px - x) / (13 * K);
        const curl = Math.sin(u * Math.PI) * 0.8 * K;
        if (Math.abs(py - y) > 4.0 * K - curl) return null;
        return { h: 1.2 * K + Math.sin(u * Math.PI * 3) * 0.5 * K, tint: 0.08 };
      }, { mat: 'paper' });
      for (let i = 0; i < 4; i++) {
        p.rect(x + 2.0 * K, y - 2.6 * K + i * 1.6 * K, (4 + i % 2 * 3) * K, 0.6 * K,
          { mat: 'paper', mask: true, tint: -0.40, dome: 0 });
      }
      for (const ex of [0, 12.4]) {
        p.capsule(x + ex * K, y - 4.2 * K, x + ex * K, y + 4.2 * K, 0.8 * K, 0.8 * K,
          { mat: 'maroon', dome: 0.8 * K, tint: 0.06 });
      }
    }),
    lens: mk(11 * K, 7 * K, (p, x, y) => {
      p.capsule(x, y, x + 4 * K, y, 1.0 * K, 0.9 * K, { mat: 'wood', dome: 0.9 * K });
      p.ellipse(x + 7.6 * K, y, 3.2 * K, 3.2 * K, { mat: 'brass', dome: 1.6 * K, tint: 0.10 });
      p.ellipse(x + 7.6 * K, y, 2.3 * K, 2.3 * K, { mat: 'lens', dome: 1.2 * K, tint: 0.22 });
    }),
    pick: mk(14 * K, 8 * K, (p, x, y) => {
      p.capsule(x, y + 2 * K, x + 8 * K, y - 1.4 * K, 1.1 * K, 1.0 * K, { mat: 'wood', dome: 1.0 * K });
      p.capsule(x + 5.6 * K, y - 3.2 * K, x + 12.4 * K, y - 1.0 * K, 1.3 * K, 0.7 * K,
        { mat: 'metal', dome: 1.2 * K, tint: 0.08 });
      p.capsule(x + 6.6 * K, y - 2.8 * K, x + 4.4 * K, y - 4.6 * K, 1.1 * K, 0.6 * K,
        { mat: 'metal', dome: 1.0 * K, tint: 0.04 });
    }),
    staff: mk(4 * K, 30 * K, (p, x, y) => {
      p.curve([{ x: x + 2 * K, y: y - 15 * K }, { x: x + 3.2 * K, y },
        { x: x + 2 * K, y: y + 15 * K }], 1.0 * K, 0.9 * K,
        { mat: 'wood', dome: 0.9 * K, steps: 14 });
      p.ellipse(x + 2 * K, y - 15 * K, 1.6 * K, 1.4 * K, { mat: 'wood', dome: 1.4 * K, tint: 0.12 });
    }),
    lantern: mk(10 * K, 14 * K, (p, x, y) => {
      p.capsule(x + 4 * K, y - 6.4 * K, x + 4 * K, y - 4.4 * K, 0.7 * K, 0.9 * K, { mat: 'metal', dome: 0.8 * K });
      p.rect(x + 1.3 * K, y - 4.4 * K, 5.6 * K, 7.2 * K, { mat: 'glass', dome: 2.4 * K, tint: 0.12 });
      p.ellipse(x + 4 * K, y - 0.8 * K, 2.0 * K, 2.5 * K,
        { mat: 'glow', dome: 2.0 * K, tint: 0.45, emissive: 1 });
      p.rect(x + 0.9 * K, y + 2.6 * K, 6.4 * K, 1.7 * K, { mat: 'metal', dome: 1.4 * K, tint: 0.07 });
    }),
    peg: mk(6 * K, 9 * K, (p, x, y) => {
      p.capsule(x + 2 * K, y - 4 * K, x + 2.6 * K, y + 4 * K, 0.8 * K, 0.5 * K, { mat: 'wood', dome: 0.8 * K });
      p.rect(x, y - 5 * K, 4.4 * K, 2 * K, { mat: 'maroon', dome: 0.9 * K, tint: 0.16 });
    }),
    bedroll: mk(15 * K, 7 * K, (p, x, y) => {
      p.capsule(x + 2.5 * K, y, x + 12 * K, y, 3.0 * K, 3.0 * K, { mat: 'shirt', dome: 2.8 * K });
      for (let i = 0; i < 3; i++) {
        p.capsule(x + 4 * K + i * 3.2 * K, y - 3 * K, x + 4 * K + i * 3.2 * K, y + 3 * K,
          0.5 * K, 0.5 * K, { mat: 'leather', mask: true, dome: 0.6 * K, tint: 0.05 });
      }
    }),
    skull: mk(11 * K, 9 * K, (p, x, y) => {
      p.ellipse(x + 5 * K, y - 0.6 * K, 4.4 * K, 3.8 * K, { mat: 'paper', dome: 3.4 * K, tint: 0.02 });
      p.ellipse(x + 8.2 * K, y + 1.6 * K, 2.4 * K, 2.0 * K, { mat: 'paper', dome: 2.0 * K });
      p.ellipse(x + 6.4 * K, y - 0.8 * K, 1.2 * K, 1.1 * K,
        { mat: 'paper', mask: true, dome: -2.0 * K, tint: -0.55 });
      p.ellipse(x + 3.4 * K, y - 1.0 * K, 1.1 * K, 1.0 * K,
        { mat: 'paper', mask: true, dome: -2.0 * K, tint: -0.5 });
    }),
    spoil: mk(14 * K, 6 * K, (p, x, y) => {
      p.field(x, y - 4 * K, x + 14 * K, y + 2.5 * K, (px, py) => {
        const u = (px - x) / (14 * K);
        const top = y + 2 * K - Math.sin(u * Math.PI) * 5.2 * K;
        if (py < top || py > y + 2.5 * K) return null;
        return { h: (y + 2.5 * K - py) * 0.7, tint: -0.04 };
      }, { mat: 'sand' });
    }),
  };
}

// ---------------------------------------------------------------------------

const cache = new Map();

/**
 * One person, in pieces. `K` scales everything; the near and far copies of a
 * limb differ only in how much light they get, so an arm on the far side of
 * the body reads as behind it without being redrawn.
 */
export function buildPerson(kind = 'vess', K = 1) {
  const key = kind + ':' + K;
  if (cache.has(key)) return cache.get(key);

  const bone = (len, r0, r1, mat, far, o) => paintBone(len * K, r0 * K, r1 * K, mat, K, far, kind, o);
  const elder = kind === 'elder';
  const rig = {
    kind, K,
    torso: { near: paintTorso(K, false, kind), far: paintTorso(K, true, kind) },
    hat: paintHat(K, false, kind),
    pack: paintPack(K, false, kind),
    tube: elder ? null : paintTube(K, false, kind),
    boot: { near: paintBoot(K, false, kind), far: paintBoot(K, true, kind) },
    props: paintProps(K, kind),
    arm: {
      near: {
        upper: bone(7.9, 1.45, 1.20, 'shirt', false, { bow: -0.45 * K, shade: -0.16 }),
        lower: bone(7.5, 1.12, 0.92, 'skin', false, { bow: 0.30 * K, hand: true, sleeve: true, grip: 0.55 }),
      },
      far: {
        upper: bone(7.9, 1.45, 1.20, 'shirt', true, { bow: -0.45 * K, shade: -0.16 }),
        lower: bone(7.5, 1.12, 0.92, 'skin', true, { bow: 0.30 * K, hand: true, sleeve: true, grip: 0.55 }),
      },
    },
    leg: {
      near: {
        upper: bone(11.6, 1.95, 1.60, 'trouser', false, { bow: 0.45 * K }),
        lower: bone(10.4, 1.60, 1.20, 'trouser', false, { bow: -0.4 * K, knee: true }),
      },
      far: {
        upper: bone(11.6, 1.95, 1.60, 'trouser', true, { bow: 0.45 * K }),
        lower: bone(10.4, 1.60, 1.20, 'trouser', true, { bow: -0.4 * K, knee: true }),
      },
    },
  };
  // the pack is what the old code called a satchel; keep the name working
  rig.satchel = rig.pack;

  // heads are baked the first time a face is worn, which is cheap enough that
  // he can change expression in the world and not only in a speech bubble
  const heads = new Map();
  rig.headFor = (mood = 0, goggles = false, bare = false, spore = false, open = false) => {
    const k = `${mood}:${goggles ? 1 : 0}:${bare ? 1 : 0}:${spore ? 1 : 0}:${open ? 1 : 0}`;
    let v = heads.get(k);
    if (!v) {
      v = paintHeadSide(K, false, kind, { mood, goggles, noHat: bare, spore, open });
      heads.set(k, v);
    }
    return v;
  };
  rig.head = rig.headFor(0, false);
  rig.headGoggles = rig.headFor(0, true);

  const T = rig.torso.near;
  rig.sockets = {
    neck: { x: 0.8 * K, y: T.topY + T.H * 0.02 },
    shoulder: { x: 0.2 * K, y: T.topY + T.H * 0.15 },
    hip: { x: -0.3 * K, y: -T.H * 0.03 },
    bag: { x: -T.W * 0.50, y: -T.H * 0.38 },
    tube: { x: -T.W * 0.10, y: -T.H * 0.06 },
  };
  // Hip height above the ground when standing. Both leg bones nearly straight,
  // PLUS the ankle's height above the sole - the leg solves to the ankle, not
  // to the ground, and leaving that out is what made him walk in a permanent
  // half-crouch.
  rig.standH = (rig.leg.near.upper.len + rig.leg.near.lower.len) * 0.955 + 1.9 * K;
  cache.set(key, rig);
  return rig;
}

const portraits = new Map();

/**
 * The close-up that goes in a speech bubble: the same head, painted larger,
 * with the mood baked in - which is the sheet's own facial-expression row,
 * made on demand instead of stored.
 */
export function portrait(kind, mood = 0, K = 2.6, spore = false) {
  const key = `${kind}:${mood}:${K}:${spore ? 1 : 0}`;
  let v = portraits.get(key);
  if (!v) {
    v = paintHead(K, false, kind, { mood, goggles: mood === 2, spore });
    portraits.set(key, v);
  }
  return v;
}

export function clearPersonCache() { cache.clear(); portraits.clear(); }
