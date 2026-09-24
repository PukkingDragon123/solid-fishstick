// CRABDEN - the people, drawn.
//
// Every version of Dr. Vess before this one was made of bitmaps turned to
// whatever angle his joints happened to be at, and turning pixel art to an
// arbitrary angle is how you shred it. So nothing here is ever rotated:
//
//   The HEAD, the TORSO, the PACK, the BOOTS and everything he holds are
//   hand-placed pixel sprites, laid out below as text, drawn at TWICE the
//   world's resolution so a face has room to be a face - a brow, an eye with
//   its white showing, a nose with a nostril, lips, a jaw with stubble on it.
//   They move by whole pixels and lean by shearing a row at a time.
//
//   The LIMBS are solid strokes laid between the joints the poser solves -
//   shoulder, elbow, hand, hip, knee, ankle - in three tones each: the cloth,
//   the side turned away from the light, and a lit edge down the front.
//
//   Then ONE outline goes round the whole figure, with a darker line wherever
//   a nearer part crosses a further one - which is what turns a stack of
//   parts into a single drawn character.
//
// Everything faces right and is measured from the hip, in world pixels; the
// figure multiplies by HR internally and is blitted at half size.

import { makeCanvas } from '../render/pixel.js';

/** Art pixels per world pixel. */
export const HR = 2;

// ---------------------------------------------------------------------------
// the palette

const VESS = {
  outline: '#26160e',
  hatL: '#f2dfb4', hat: '#d9ba8a', hatD: '#b39262', hatDD: '#7e6240',
  band: '#963c30', bandD: '#62251c', brass: '#e8bb58', brassD: '#9a7030', lens: '#5aa8c4', lensL: '#d8f4fa',
  hair: '#704128', hairL: '#9e6842', hairD: '#472616',
  skinL: '#f4c89c', skin: '#dfa074', skinD: '#b87450', skinDD: '#84492f', stubble: '#c08560',
  eyeW: '#f6efe2', eye: '#1a100c', brow: '#3e2416', mouth: '#7c3428', lip: '#d0866a',
  scarf: '#b04432', scarfD: '#7a2a1e',
  shirtL: '#fbf5e6', shirt: '#e7dcc2', shirtD: '#b9aa88', shirtDD: '#8e8064',
  vest: '#7a5232', vestL: '#a0703f', vestD: '#56361f', vestDD: '#3c2414',
  strap: '#4a2e1c', strapL: '#6e4a2e', belt: '#3a2416', buckle: '#f0c050', buckleD: '#9a7028',
  trouser: '#8c8759', trouserD: '#65613f', trouserL: '#aca676',
  canvasL: '#c9b183', canvas: '#a68d5f', canvasD: '#7a6442', roll: '#71825c', rollD: '#4f5e3f', packStrap: '#5a3a22',
  boot: '#553624', bootL: '#7a5238', sole: '#1e130c',
  wood: '#86582f', woodL: '#b07a48', steel: '#c9ced3', steelD: '#858c95',
  paper: '#f0e8d4', leather: '#5a3a24', glass: '#4f8f4a', glassL: '#9fd896', label: '#e8d8a8',
  flask: '#667758', flaskL: '#8fa37a', bristle: '#d8c090', red: '#b03a30', pencil: '#e2b74a',
};
const ELDER = {
  ...VESS,
  hatL: '#d8826a', hat: '#a8492f', hatD: '#7a2f1e', hatDD: '#4e1c12', band: '#3d2a20', bandD: '#241810',
  hair: '#b8b2a8', hairL: '#e2ded6', hairD: '#8a847b', brow: '#8a847b', stubble: '#dcd6cc',
  vest: '#4f5364', vestL: '#686d80', vestD: '#373a47', vestDD: '#262833',
  scarf: '#dcd4c2', scarfD: '#b0a892',
  trouser: '#7e4347', trouserL: '#985a5b', trouserD: '#52292c',
};

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const palCache = new Map();
function palette(kind, spore) {
  const key = kind + (spore ? ':s' : '');
  let p = palCache.get(key);
  if (p) return p;
  const src = kind === 'elder' ? ELDER : VESS;
  p = {};
  for (const [k, v] of Object.entries(src)) p[k] = hex(v);
  if (spore) { p.eye = hex('#8a52e8'); p.eyeW = hex('#dcc8ff'); }
  palCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// the body, built to proportion
//
// The last version of him was a big head on a box on two sausages, which is
// a cartoon's anatomy and it looked like one. These are a person's: the head
// (hat off) about an eighth of his height, the legs half of it, the elbow at
// the waist, the wrist at the crotch and the fingertips halfway down the
// thigh. The torso has a CHEST that stands forward, a WAIST that goes in, a
// lower back that curves and a seat that stands back out; the thigh is thick
// at the hip and narrows to the knee, the calf swells under it and narrows
// to the ankle.
//
// The head and torso are BUILT rather than typed - a front edge and a back
// edge per row, filled and shaded - so the curves are curves, and then the
// features and the kit are laid on top by hand.

// ---- the head --------------------------------------------------------------

const HW = 20, HH = 22;
const HEAD_KEY = {
  o: 'outline', 1: 'hatL', 2: 'hat', 3: 'hatD', 4: 'hatDD', b: 'band', B: 'bandD',
  g: 'brass', G: 'brassD', e: 'lens', E: 'lensL', h: 'hair', H: 'hairL', k: 'hairD',
  S: 'skinL', s: 'skin', d: 'skinD', D: 'skinDD', q: 'stubble',
  w: 'eyeW', p: 'eye', r: 'brow', m: 'mouth', n: 'lip', y: 'pencil',
};
const HEAD_NECK = { x: 10, y: 21 };

/**
 * What his face is doing, for each of the twenty-one faces on his portrait
 * sheet - so the man in the desert pulls the same face as the man on the
 * card when he says the same line.
 */
const EXPR = {
  flat:   { eye: 'open', brow: 'mid', mouth: 'shut' },
  talk:   { eye: 'open', brow: 'mid', mouth: 'open' },
  grin:   { eye: 'squint', brow: 'mid', mouth: 'grin' },
  laugh:  { eye: 'shut', brow: 'up', mouth: 'open' },
  joy:    { eye: 'shut', brow: 'up', mouth: 'smile' },
  drink:  { eye: 'shut', brow: 'mid', mouth: 'shut' },
  smug:   { eye: 'squint', brow: 'mid', mouth: 'smile' },
  squint: { eye: 'squint', brow: 'frown', mouth: 'shut' },
  frown:  { eye: 'open', brow: 'frown', mouth: 'down' },
  glare:  { eye: 'squint', brow: 'frown', mouth: 'shut' },
  shut:   { eye: 'shut', brow: 'mid', mouth: 'shut' },
  peer:   { eye: 'squint', brow: 'up', mouth: 'shut' },
  gasp:   { eye: 'wide', brow: 'up', mouth: 'open' },
  blank:  { eye: 'open', brow: 'mid', mouth: 'shut' },
  shout:  { eye: 'wide', brow: 'frown', mouth: 'open' },
  scowl:  { eye: 'squint', brow: 'frown', mouth: 'down' },
  dull:   { eye: 'squint', brow: 'mid', mouth: 'shut' },
  sad:    { eye: 'open', brow: 'sad', mouth: 'down' },
  tired:  { eye: 'squint', brow: 'sad', mouth: 'shut' },
  sleep:  { eye: 'shut', brow: 'sad', mouth: 'shut' },
  spore:  { eye: 'wide', brow: 'mid', mouth: 'open' },
};

const headCache = new Map();
function buildHead(e, bare) {
  const key = `${e.eye}:${e.brow}:${e.mouth}:${bare ? 1 : 0}`;
  let G = headCache.get(key);
  if (G) return G;
  G = [];
  for (let y = 0; y < HH; y++) G.push(new Array(HW).fill('.'));
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < HW && y < HH) G[y][x] = c; };
  const run = (y, x0, str) => { for (let i = 0; i < str.length; i++) if (str[i] !== ' ') put(x0 + i, y, str[i]); };

  // the skull, row by row: where the face stops and where the head stops.
  // A man's head in profile: a flat brow, a square jaw that comes back level
  // under the chin, and a neck as wide as the jaw is deep.
  const FRONT = { 6: 14, 7: 15, 8: 15, 9: 16, 10: 15, 11: 16, 12: 17, 13: 16, 14: 15, 15: 15, 16: 15, 17: 15, 18: 13 };
  const BACK = { 6: 5, 7: 4, 8: 3, 9: 3, 10: 3, 11: 3, 12: 3, 13: 3, 14: 4, 15: 5, 16: 6, 17: 7, 18: 7 };
  // short back and sides: the hair stops above the ear and is cut close at
  // the nape - it used to hang to the jaw, which is most of what read female
  const HAIR = { 6: 13, 7: 10, 8: 8, 9: 7, 10: 6, 11: 5, 12: 4, 13: 4 };
  for (let y = 6; y <= 18; y++) {
    for (let x = BACK[y]; x <= FRONT[y]; x++) {
      let c = 's';
      if (HAIR[y] !== undefined && x <= HAIR[y]) c = x === BACK[y] ? 'k' : (x * 3 + y) % 7 === 0 ? 'H' : 'h';
      put(x, y, c);
    }
  }
  // the cut line of the hair, a darker edge where it meets the skin
  for (const [y, x] of [[9, 7], [10, 6], [11, 5], [12, 4], [13, 4]]) put(x, y, 'k');
  // a thick neck, straight down from the back of the jaw, with an Adam's apple
  for (let y = 19; y < HH; y++) run(y, 7, 'dsssd');
  run(18, 7, 'dddddd');
  put(12, 19, 'S');
  // light and shade: the brim shadows the brow, the jaw shadows the neck
  for (let x = 9; x <= 15; x++) put(x, 7, 'd');
  run(8, 13, 'SSS');
  run(11, 12, 'SS');
  for (let x = 8; x <= 14; x++) put(x, 17, 'd');
  // stubble: along the jaw, on the chin, over the lip
  for (let y = 13; y <= 16; y++) for (let x = 9; x <= 15; x++) {
    if (G[y][x] !== 's' || (y === 13 && x < 13)) continue;
    // a solid shadow down the jawline, broken stubble toward the mouth
    if (x <= 10 || y === 16 || (x + y) % 2 === 0) put(x, y, 'q');
  }
  for (let x = 9; x <= 14; x++) if ((x + 1) % 2 === 0) put(x, 17, 'q');
  // the ear, set where a man's ear is, just behind the jaw hinge
  run(10, 7, 'dd'); run(11, 7, 'dD'); run(12, 7, 'dd');
  // the nose: a lit bridge, a tip that stands off the face, a nostril
  put(16, 11, 'S'); run(12, 16, 'ss'); put(15, 13, 'D'); put(16, 13, 'd');
  // the chin, square, catching the light
  put(15, 16, 'S'); put(14, 16, 'S');

  // ---- the face he is making ----
  // brows
  if (e.brow === 'up') run(8, 13, 'rrr');
  else if (e.brow === 'frown') { run(9, 13, 'rrr'); }
  else if (e.brow === 'sad') { put(14, 8, 'r'); put(13, 9, 'r'); }
  else { run(9, 13, 'rrr'); }
  // eyes
  if (e.eye === 'shut') run(10, 13, 'rr');
  else if (e.eye === 'squint') { put(13, 10, 'r'); put(14, 10, 'p'); }
  else if (e.eye === 'wide') { put(13, 9, 'w'); put(13, 10, 'w'); put(14, 10, 'p'); put(14, 9, 'w'); }
  else { put(13, 10, 'w'); put(14, 10, 'p'); }
  // mouth
  if (e.mouth === 'open') { run(14, 13, 'mm'); run(15, 13, 'mm'); put(14, 16, 'n'); }
  else if (e.mouth === 'grin') { run(14, 13, 'ww'); run(15, 13, 'mm'); }
  else if (e.mouth === 'smile') { put(14, 14, 'm'); put(13, 13, 'm'); put(12, 13, 'd'); }
  else if (e.mouth === 'down') { put(14, 14, 'm'); put(13, 14, 'm'); put(12, 15, 'm'); }
  else { run(14, 13, 'mm'); put(14, 15, 'n'); }

  // ---- the hat ----
  if (!bare) {
    run(0, 6, '111122');
    run(1, 5, '11111222');
    run(2, 4, '1111122223');
    run(3, 4, 'bBbBbbbGeG');
    run(4, 4, 'BBBBBBBGGG');
    run(5, 2, '22222222222221');
    run(6, 1, '4444444444444443');
  } else {
    // hat off: the hair is swept back off the brow
    run(3, 6, 'kkhhh');
    run(4, 5, 'khhHhhh');
    run(5, 4, 'khhhHHhhh');
    for (let x = 4; x <= 13; x++) put(x, 6, (x % 3 === 0) ? 'H' : 'h');
  }
  headCache.set(key, G);
  return G;
}

// ---- the torso ---------------------------------------------------------------

const TW = 20, TH = 34;
const TORSO_HIP = { x: 10, y: TH };
const TORSO_KEY = {
  o: 'outline', c: 'scarf', C: 'scarfD', f: 'shirtL', i: 'shirt', j: 'shirtD', J: 'shirtDD',
  v: 'vest', V: 'vestL', x: 'vestD', X: 'vestDD', a: 'strap', A: 'strapL',
  l: 'belt', y: 'buckle', Y: 'buckleD', t: 'trouser', T: 'trouserD', U: 'trouserL',
  p: 'paper', L: 'leather', g: 'brass',
};
const lerpPts = (pts, y) => {
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i][0]) {
      const [y0, v0] = pts[i - 1], [y1, v1] = pts[i];
      const k = (y - y0) / Math.max(1e-6, y1 - y0);
      const e = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * e;
    }
  }
  return pts[pts.length - 1][1];
};
// facing right: the front edge and the back edge, from the shoulders down
const T_FRONT = [[0, 4.6], [3, 6.8], [9, 7.2], [15, 6.8], [22, 6.4], [28, 6.2], [34, 5.8]];
const T_BACK = [[0, -6.0], [4, -7.6], [10, -7.2], [16, -6.2], [22, -5.8], [28, -5.8], [34, -5.6]];
let torsoGrid = null;
function buildTorso() {
  if (torsoGrid) return torsoGrid;
  const G = [];
  for (let y = 0; y < TH; y++) G.push(new Array(TW).fill('.'));
  const cx = 10;
  for (let y = 0; y < TH; y++) {
    const f = Math.round(cx + lerpPts(T_FRONT, y + 0.5));
    const b = Math.round(cx + lerpPts(T_BACK, y + 0.5));
    for (let x = b; x < f; x++) {
      const fromB = x - b, fromF = f - 1 - x;
      let c;
      if (y >= 22 && y <= 24) {
        // the belt, with the buckle at the front
        c = fromF <= 2 ? (y === 24 ? 'Y' : 'y') : 'l';
      } else if (y > 24) {
        // trousers: the seat in shade, a lit edge down the front
        c = fromB <= 1 ? 'T' : fromF === 0 ? 'U' : 't';
        if (y > 28 && fromB === 2) c = 'T';
      } else {
        // the shirt shows down the open front of the vest
        const shirt = fromF <= 2 || y < 2;
        if (shirt) c = fromF === 0 ? 'f' : y > 11 && y < 15 ? 'j' : 'i';
        else if (fromF === 3) c = 'V';
        else c = fromB === 0 ? 'X' : fromB <= 2 ? 'x' : 'v';
      }
      G[y][x] = c;
    }
  }
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < TW && y < TH && G[y][x] !== '.') G[y][x] = c; };
  // the neckerchief, knotted at the front of the throat, a tail hanging
  for (let x = 7; x <= 13; x++) put(x, 0, 'c');
  for (let x = 8; x <= 14; x++) put(x, 1, x === 14 ? 'C' : 'c');
  put(14, 2, 'c'); put(15, 2, 'C'); put(15, 3, 'C'); put(15, 4, 'c');
  // the pack strap, over the shoulder and down to under the arm
  for (let y = 0; y <= 13; y++) {
    const x = Math.round(9 + y * 0.32);
    put(x, y, 'a'); put(x + 1, y, y % 3 === 0 ? 'A' : 'a');
  }
  // a breast pocket with a notebook in it
  put(12, 11, 'p'); put(13, 11, 'p');
  for (let x = 10; x <= 13; x++) { put(x, 12, 'V'); put(x, 13, 'x'); }
  // the shirt collar, standing up at the front of the neckerchief
  put(15, 0, 'f'); put(16, 1, 'f'); put(16, 2, 'j');
  // the vest's buttons down its front edge
  for (let y = 5; y <= 19; y += 4) {
    const x = Math.round(cx + lerpPts(T_FRONT, y + 0.5)) - 4;
    put(x, y, 'g');
  }
  // a flapped hip pocket
  for (let x = 9; x <= 13; x++) { put(x, 17, 'V'); put(x, 18, 'X'); }
  put(11, 18, 'g');
  // belt loops, and the fly seam
  for (const x of [4, 9, 14]) { put(x, 22, 'L'); put(x, 24, 'L'); }
  for (let y = 25; y < TH; y++) put(Math.round(cx + lerpPts(T_FRONT, y + 0.5)) - 2, y, 'T');
  // and the vest stitched down its seams
  for (let y = 4; y < 21; y += 2) put(Math.round(cx + lerpPts(T_BACK, y) + 3), y, 'V');
  // a leather pouch on the back of the belt, with a brass stud
  for (let y = 23; y <= 28; y++) for (let x = 2; x <= 5; x++) put(x, y, y === 23 ? 'A' : 'L');
  put(4, 25, 'g');
  torsoGrid = G;
  return G;
}

const PACK_KEY = { o: 'outline', K: 'canvasL', M: 'canvas', N: 'canvasD', R: 'roll', Q: 'rollD', L: 'packStrap', y: 'buckle', Y: 'buckleD' };
const PACK = [
  '..ooooooooo.',
  '.oRRRRRRRQQo',
  'oRRQRRRRRQQo',
  'oQQQQQQQQQQo',
  '.ooooooooooo',
  '.oKKKKKKKMMo',
  '.oKKMMMMMMNo',
  '.oLLLLLLLLLo',
  '.oKMMyMMMMNo',
  '.oKMMYMMMMNo',
  '.oKMMMMMMMNo',
  '.oKMMMMMMNNo',
  '.oMMMMMMMNNo',
  '.oMMMMMMNNNo',
  '.oNNNNNNNNNo',
  '..ooooooooo.',
];
const PACK_ANCHOR = { x: 11, y: 2 };

const BOOT_KEY = { o: 'outline', O: 'boot', P: 'bootL', Z: 'sole', W: 'shirtD' };
const BOOT = [
  '.oPOOOOo.......',
  '.oPOWOOo.......',
  '.oPOOOWOoo.....',
  '.oPOOWOOOOoo...',
  '.oPOOOOWOOOOoo.',
  '.oPPOOOOOOOOOOo',
  '.oZZZZZZZZZZZZo',
  '..oZZoooooooZo.',
];
const BOOT_ANKLE = { x: 5, y: 1 };

/** Everything he holds, drawn at world scale and doubled on the way in. */
const PROP_KEY = {
  o: 'outline', w: 'wood', W: 'woodL', S: 'steel', s: 'steelD', B: 'brass', b: 'brassD',
  l: 'lens', L: 'leather', p: 'paper', g: 'glass', G: 'glassL', n: 'label', C: 'flaskL',
  c: 'flask', h: 'bristle', r: 'red', y: 'pencil', k: 'outline',
};
const PROPS_1X = {
  trowel: { at: { x: 1, y: 0 }, rows: ['ow...', 'oWo..', '.oso.', 'oSSso', 'oSSso', '.oSo.', '..o..'] },
  brush: { at: { x: 1, y: 1 }, rows: ['.o..', 'oWo.', 'owo.', 'oBBo', 'ohho', 'ohho', '.oo.'] },
  pencil: { at: { x: 2, y: 2 }, rows: ['....o', '...oy', '..oyo', '.oyo.', 'oko..'] },
  notebook: { at: { x: 2, y: 3 }, rows: ['ooooo', 'oLLpo', 'oLLpo', 'oLLpo', 'oLLpo', 'ooooo'] },
  canteen: { at: { x: 2, y: 2 }, rows: ['.oo...', 'oCCo..', 'oCcco.', '.occco', '..occo', '...oo.'] },
  beer: { at: { x: 2, y: 3 }, rows: ['....oo', '...oGo', '..oggo', '.ongo.', 'ogo...', 'oo....'] },
  lens: { at: { x: 1, y: 1 }, rows: ['.oooooo.', 'obBbbBlo', '.oooooo.'] },
  peg: { at: { x: 1, y: 1 }, rows: ['orro', 'owo.', 'owo.', 'owo.', '.o..'] },
};
const PROPS = Object.fromEntries(Object.entries(PROPS_1X).map(([k, v]) => {
  const rows = [];
  for (const r of v.rows) { const d = [...r].map((c) => c + c).join(''); rows.push(d, d); }
  return [k, { at: { x: v.at.x * 2, y: v.at.y * 2 }, rows }];
}));

// ---------------------------------------------------------------------------
// the compositor

const CW = 132, CH = 172;
const OX = 66, OY = 100;           // where the hip sits in the canvas, in art px

export class PixelFigure {
  constructor(kind = 'vess') {
    this.kind = kind;
    this.cv = makeCanvas(CW, CH);
    this.g = this.cv.getContext('2d');
    this.img = this.g.createImageData(CW, CH);
    this.col = new Array(CW * CH);
    this.pid = new Uint8Array(CW * CH);
    this.ox = OX / HR;
    this.oy = OY / HR;
    this.w = CW / HR;
    this.h = CH / HR;
  }

  _put(x, y, rgb, id) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= CW || y >= CH || !rgb) return;
    const i = y * CW + x;
    this.col[i] = rgb;
    this.pid[i] = id;
  }

  /** A grid of palette keys (rows of strings or arrays) with its anchor at a body-space point. */
  _sprite(rows, key, pal, wx, wy, anchor, id, lean = 0, dark = 0) {
    const bx = Math.round(OX + wx * HR), by = Math.round(OY + wy * HR);
    const H = rows.length;
    for (let y = 0; y < H; y++) {
      const row = rows[y];
      const up = anchor.y - y;
      const sx = lean ? Math.round(up * Math.sin(lean)) : 0;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        let c = pal[key[ch]];
        if (!c) continue;
        if (dark) c = mix(c, pal.outline, dark);
        this._put(bx + x - anchor.x + sx, by + y - anchor.y, c, id);
      }
    }
  }

  /**
   * A limb from a to b (world units). `prof` is its width in art pixels at
   * the top, at the swell, and at the bottom, and where the swell sits - a
   * thigh is thick at the hip, a calf swells under the knee.
   */
  _limb(a, b, prof, tone, id, opts = {}) {
    const ax = OX + a.x * HR, ay = OY + a.y * HR, bx = OX + b.x * HR, by = OY + b.y * HR;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.ceil(len * 2));
    const [w0, wm, w1, tm] = prof;
    const width = (t) => t < tm ? w0 + (wm - w0) * (t / tm) : wm + (w1 - wm) * ((t - tm) / Math.max(1e-6, 1 - tm));
    const mask = new Map();
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
      const r = width(t) / 2;
      const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
      const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > r * r + 0.2) continue;
          const key = y * CW + x;
          const along = t * len;
          const prev = mask.get(key);
          if (prev === undefined || along < prev) mask.set(key, along);
        }
      }
    }
    const inside = (x, y) => mask.has(y * CW + x);
    const ux = (bx - ax) / (len || 1), uy = (by - ay) / (len || 1);
    for (const [key, along] of mask) {
      const x = key % CW, y = (key / CW) | 0;
      let c = tone.base;
      // a seam down the limb, a pixel off its axis: the side seam of a
      // trouser leg, the fold of a sleeve
      if (opts.seam !== undefined && along > 2 && along < len - 2) {
        const perp = (x + 0.5 - ax) * -uy + (y + 0.5 - ay) * ux;
        if (Math.abs(perp - opts.seam) < 0.5) c = mix(c, tone.shade, 0.7);
      }
      if (opts.cuff && along < opts.cuff) c = opts.cuffCol;
      if (opts.band && Math.abs(along - opts.band[0]) < opts.band[1]) c = opts.bandCol;
      const back = !inside(x - 1, y) || !inside(x - 2, y);
      const under = !inside(x, y + 1) && Math.abs(by - ay) < Math.abs(bx - ax) * 1.2;
      if (back || under) c = mix(c, tone.shade, !inside(x - 1, y) ? 0.95 : 0.55);
      else if (!inside(x + 1, y) && tone.light) c = tone.light;
      if (opts.crease && Math.abs(along - opts.crease) < 0.9 && inside(x - 2, y) && inside(x + 2, y)) c = mix(c, tone.shade, 0.6);
      this._put(x, y, c, id);
    }
  }

  _finish(pal) {
    const { col, pid, img } = this;
    const d = img.data;
    const out = pal.outline;
    const sel = new Uint8Array(CW * CH);
    for (let y = 1; y < CH - 1; y++) {
      for (let x = 1; x < CW - 1; x++) {
        const i = y * CW + x;
        const a = pid[i];
        if (!a) continue;
        if (pid[i - 1] > a || pid[i + 1] > a || pid[i - CW] > a || pid[i + CW] > a) sel[i] = 1;
      }
    }
    for (let i = 0; i < CW * CH; i++) {
      const o = i * 4;
      let c = col[i];
      if (c) {
        if (sel[i]) c = mix(c, out, 0.55);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        continue;
      }
      const x = i % CW, y = (i / CW) | 0;
      const touch = (x > 0 && pid[i - 1]) || (x < CW - 1 && pid[i + 1])
        || (y > 0 && pid[i - CW]) || (y < CH - 1 && pid[i + CW]);
      if (touch) { d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255; }
      else d[o + 3] = 0;
    }
    this.g.putImageData(img, 0, 0);
  }

  /**
   * One frame. `s` is the solved skeleton in body space (hip at 0,0, world
   * units, y down, facing right); `s.face.mood` is one of his portrait faces.
   */
  render(s) {
    const pal = palette(this.kind, !!s.spore);
    this.pid.fill(0);
    this.col.fill(null);
    const L = s.lean || 0;
    const br = s.breath || 0;
    const FAR = 0.32;
    const tone = (base, shade, light, dark) => ({
      base: dark ? mix(pal[base], pal.outline, FAR) : pal[base],
      shade: dark ? mix(pal[shade], pal.outline, FAR) : pal[shade],
      light: light ? (dark ? mix(pal[light], pal.outline, FAR) : pal[light]) : null,
    });
    let id = 1;

    const leg = (lg, dark, idl) => {
      const tr = tone('trouser', 'trouserD', 'trouserL', dark);
      // thick at the hip, narrowing to the knee
      this._limb(lg.hip, lg.knee, [10.2, 9.4, 8.2, 0.4], tr, idl, { seam: 1.2 });
      // the calf swells just under the knee and narrows to the ankle
      this._limb(lg.knee, lg.ankle, [8.2, 7.8, 7.0, 0.5], tr, idl, { crease: 3, seam: 1.2 });
      const lift = lg.air > 0.4 ? -1 : 0;
      this._sprite(BOOT, BOOT_KEY, pal, lg.ankle.x, lg.ankle.y + lift / HR, BOOT_ANKLE, idl + 1, 0, dark ? FAR : 0);
    };
    const arm = (a, dark, idl, tool, watch) => {
      const sh = { x: a.sh.x, y: a.sh.y + br }, el = { x: a.el.x, y: a.el.y + br }, ha = { x: a.ha.x, y: a.ha.y + br };
      // the shoulder is round and the sleeve is loose; rolled at the elbow
      this._limb(sh, el, [8.6, 7.8, 6.8, 0.3], tone('shirt', 'shirtD', 'shirtL', dark), idl, { crease: 10, seam: -1.5 });
      this._limb(el, ha, [6.8, 6.6, 5.2, 0.4], tone('skin', 'skinD', 'skinL', dark), idl,
        { cuff: 3.4, cuffCol: dark ? mix(pal.shirtL, pal.outline, FAR) : pal.shirtL,
          band: watch ? [Math.hypot(ha.x - el.x, ha.y - el.y) * HR - 2.2, 0.8] : null, bandCol: pal.leather });
      this._limb(ha, ha, [6.6, 6.6, 6.6, 0.5], tone('skin', 'skinD', 'skinL', dark), idl);
      // knuckles
      this._put(OX + ha.x * HR + 1, OY + ha.y * HR + 2, dark ? mix(pal.skinD, pal.outline, FAR) : pal.skinD, idl);
      if (tool && PROPS[tool]) {
        const P = PROPS[tool];
        this._sprite(P.rows, PROP_KEY, pal, ha.x, ha.y, P.at, idl + 1, 0, dark ? FAR : 0);
      }
    };

    leg(s.legF, true, id); id += 2;
    this._sprite(PACK, PACK_KEY, pal, s.bag.x, s.bag.y + br, PACK_ANCHOR, id++, 0, 0);
    arm(s.armF, true, id); id += 2;

    const f = s.face || {};
    const e = { ...(EXPR[f.mood] || EXPR.flat) };
    if (f.shut) e.eye = 'shut';
    if (f.open) e.mouth = 'open';
    this._sprite(buildHead(e, !!f.bare), HEAD_KEY, pal, s.neck.x, s.neck.y + br + (s.nod || 0) / HR, HEAD_NECK, id++, 0);
    this._sprite(buildTorso(), TORSO_KEY, pal, 0, br, TORSO_HIP, id++, L);

    leg(s.legN, false, id); id += 2;
    if (s.hold && PROPS[s.hold]) {
      const P = PROPS[s.hold];
      this._sprite(P.rows, PROP_KEY, pal, s.chest.x, s.chest.y + br, P.at, id++, 0);
    }
    arm(s.armN, false, id, s.tool, true); id += 2;

    this._finish(pal);
    return this.cv;
  }
}

function bake(rows, key, pal) {
  const W = rows[0].length, H = rows.length;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const c = pal[key[ch]];
      if (!c) continue;
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

/** The hat on its own, for when it has come off. Drawn at world scale. */
export function hatSprite(kind = 'vess') {
  const cv = bake(buildHead(EXPR.flat, false).slice(0, 7), HEAD_KEY, palette(kind, false));
  const small = makeCanvas(Math.ceil(cv.width / HR), Math.ceil(cv.height / HR));
  const g = small.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(cv, 0, 0, small.width, small.height);
  return { cv: small, ox: small.width / 2, oy: small.height };
}

/** The head on its own, at art resolution. */
export function headSprite(kind = 'vess', opts = {}) {
  const cv = bake(buildHead(EXPR[opts.mood] || EXPR.flat, !!opts.bare), HEAD_KEY, palette(kind, !!opts.spore));
  return { cv, ox: HEAD_NECK.x, oy: HEAD_NECK.y, W: cv.width, H: cv.height };
}

/** Where the parts join, in world units from the hip. */
export const FIGURE_SOCKETS = {
  shoulder: { x: -0.2, y: -15.6 },
  neck: { x: 0.2, y: -16.6 },
  bag: { x: -4.4, y: -16.2 },
  chest: { x: 3.4, y: -10.4 },
};
/** Arm bones, in world units: the elbow at the waist, the wrist at the crotch. */
export const ARM = { upper: 8.6, lower: 7.8 };

/**
 * THE WALK, as eight frames - contact, down, passing, up, and the same again
 * on the other foot. Each entry is where one foot is, as a fraction of the
 * leg's length ahead of the hip and above the ground; the other foot runs
 * four frames behind.
 */
export const WALK = [
  [0.40, 0.00], [0.24, 0.00], [0.06, 0.00], [-0.12, 0.00],
  [-0.31, 0.02], [-0.30, 0.12], [0.00, 0.18], [0.28, 0.09],
];
export const WALK_BOB = [0.2, 1.1, 0.4, -0.6, 0.2, 1.1, 0.4, -0.6];
export const WALK_CYCLE = 1.46;
