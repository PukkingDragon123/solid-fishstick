// CRABDEN - the people, drawn.
//
// Every version of Dr. Vess before this one was made of bitmaps turned to
// whatever angle his joints happened to be at, and turning pixel art to an
// arbitrary angle is how you shred it. So nothing here is ever rotated:
//
//   The HEAD, the TORSO, the PACK, the BOOTS and everything he holds are
//   hand-placed pixel sprites, laid out below as text, on the SAME grid as
//   the rest of the world - one of his pixels is one pixel of sand or shell,
//   so he never looks pasted in at a finer resolution than the crab he is
//   standing next to. They move by whole pixels and lean by shearing rows.
//
//   The LIMBS are solid strokes laid between the joints the poser solves -
//   shoulder, elbow, hand, hip, knee, ankle - in three tones each: the cloth,
//   the side turned away from the light, and a lit edge down the front.
//
//   Then ONE outline goes round the whole figure, with a darker line wherever
//   a nearer part crosses a further one - which is what turns a stack of
//   parts into a single drawn character.
//
// Everything faces right and is measured from the hip, in world pixels.

import { makeCanvas } from '../render/pixel.js';

/** Art pixels per world pixel. */
export const HR = 1;

// ---------------------------------------------------------------------------
// the palette

const VESS = {
  outline: '#26160e',
  hatL: '#efdcb0', hat: '#d2b384', hatD: '#a88a5e', hatDD: '#745b3c',
  band: '#a23a2e', bandD: '#6a241c', brass: '#d9a452', brassD: '#8a6030', lens: '#6f93d6', lensL: '#c4d8ff', frame: '#5a4a3e',
  hair: '#7a4a2c', hairL: '#a56e44', hairD: '#4a2a18',
  skinL: '#f4c89c', skin: '#dfa074', skinD: '#b87450', skinDD: '#84492f', stubble: '#b97c58',
  eyeW: '#f6efe2', eye: '#1a100c', brow: '#3e2416', mouth: '#7c3428', lip: '#d0866a',
  scarf: '#b04432', scarfD: '#7a2a1e',
  shirtL: '#fbf5e6', shirt: '#e7dcc2', shirtD: '#b9aa88', shirtDD: '#8e8064',
  vest: '#7a5232', vestL: '#a0703f', vestD: '#56361f', vestDD: '#3c2414',
  strap: '#4a2e1c', strapL: '#6e4a2e', belt: '#3a2416', buckle: '#f0c050', buckleD: '#9a7028',
  trouser: '#8c8759', trouserD: '#65613f', trouserL: '#aca676',
  canvasL: '#a2714a', canvas: '#7e5234', canvasD: '#583620', roll: '#c9b183', rollD: '#96805a', packStrap: '#5a3a22',
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
//
// Drawn on the world's own grid - one of his pixels is one pixel of sand -
// and copied from his portrait: the wide safari hat with its red band and
// the brass goggles pushed up on it, the shaggy brown hair out from under
// the brim, the round blue glasses, the stubble, the red neckerchief.

const HW = 16, HH = 15;
const HEAD_KEY = {
  o: 'outline', 1: 'hatL', 2: 'hat', 3: 'hatD', 4: 'hatDD', b: 'band', B: 'bandD',
  g: 'brass', G: 'brassD', e: 'lens', E: 'lensL', f: 'frame', h: 'hair', H: 'hairL', k: 'hairD',
  S: 'skinL', s: 'skin', d: 'skinD', D: 'skinDD', q: 'stubble',
  w: 'eyeW', p: 'eye', r: 'brow', m: 'mouth', n: 'lip', y: 'pencil',
};
const HEAD_NECK = { x: 8, y: 14 };
const HAT_KEYS = '1234bBgGeE';
const HAT_ROWS = 5;

const HEAD_BASE = [
  '......11122.....',
  '....11111Ggg3...',
  '....bBbbbgeEg...',
  '1112222222222223',
  '4..khhHhhhhhdd.4',
  '..hkhHhhhsSrrd..',
  '..kkhhhkfffpE...',
  '..hkhhkdssfees..',
  '...khksDssSssS..',
  '...hkhsdssssd...',
  '.....ssdssssm...',
  '......dqqqsqS...',
  '.......qdddd....',
  '......dsssS.....',
  '......dsssd.....',
];
const HEAD_BARE_TOP = [
  '................',
  '.....kkhhhh.....',
  '....khhHhhhhh...',
  '...khhhhHhhhhd..',
  '...khhHhhhhhdd..',
];

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
  G = HEAD_BASE.map((r) => [...r]);
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < HW && y < HH) G[y][x] = c; };

  // brows: the base has them level, just under the fringe
  if (e.brow === 'up') { put(11, 4, 'r'); put(12, 4, 'r'); put(10, 5, 'S'); put(11, 5, 's'); }
  else if (e.brow === 'frown') { put(12, 6, 'r'); put(10, 5, 'S'); }
  else if (e.brow === 'sad') { put(12, 4, 'r'); put(11, 5, 'r'); put(10, 5, 'S'); }
  // the eye, behind the blue of his glasses
  if (e.eye === 'shut') put(11, 6, 'D');
  else if (e.eye === 'squint') { put(11, 6, 'p'); put(12, 6, e.brow === 'frown' ? 'r' : 'e'); }
  else if (e.eye === 'wide') { put(11, 6, 'w'); put(12, 6, 'p'); }
  // the mouth, and the jaw that drops with it
  if (e.mouth === 'open') { put(12, 10, 'm'); put(12, 11, 'm'); put(12, 12, 'S'); put(11, 11, 'q'); }
  else if (e.mouth === 'grin') { put(12, 10, 'w'); put(11, 10, 'm'); }
  else if (e.mouth === 'smile') { put(12, 10, 'n'); put(11, 10, 'm'); put(11, 9, 'm'); }
  else if (e.mouth === 'down') { put(12, 10, 'm'); put(11, 11, 'm'); }

  if (bare) for (let y = 0; y < HEAD_BARE_TOP.length; y++) G[y] = [...HEAD_BARE_TOP[y]];
  headCache.set(key, G);
  return G;
}

// ---- the torso ---------------------------------------------------------------

const TW = 12, TH = 17;
const TORSO_HIP = { x: 6, y: TH };
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
// facing right: the front edge and the back edge, from the shoulders down -
// a man's: broad, flat-chested and straight, no waist and no seat
const T_FRONT = [[0, 2.4], [1.5, 3.5], [4.5, 3.7], [8, 3.4], [11, 3.2], [14, 3.1], [17, 2.9]];
const T_BACK = [[0, -3.0], [2, -3.9], [5, -3.7], [8, -3.2], [11, -3.0], [14, -3.0], [17, -2.9]];
let torsoGrid = null;
function buildTorso() {
  if (torsoGrid) return torsoGrid;
  const G = [];
  for (let y = 0; y < TH; y++) G.push(new Array(TW).fill('.'));
  const cx = 6;
  const frontAt = (y) => Math.round(cx + lerpPts(T_FRONT, y + 0.5));
  for (let y = 0; y < TH; y++) {
    const f = frontAt(y);
    const b = Math.round(cx + lerpPts(T_BACK, y + 0.5));
    for (let x = b; x < f; x++) {
      const fromB = x - b, fromF = f - 1 - x;
      let c;
      if (y === 11 || y === 12) {
        c = fromF === 0 ? (y === 12 ? 'Y' : 'y') : 'l';
      } else if (y > 12) {
        c = fromB === 0 ? 'T' : fromF === 0 ? 'U' : 't';
      } else {
        // the shirt shows down the open front of the vest
        if (fromF <= 1 || y < 1) c = fromF === 0 ? 'f' : y > 5 && y < 8 ? 'j' : 'i';
        else if (fromF === 2) c = 'V';
        else c = fromB === 0 ? 'X' : fromB === 1 ? 'x' : 'v';
      }
      G[y][x] = c;
    }
  }
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < TW && y < TH && G[y][x] !== '.') G[y][x] = c; };
  // the red neckerchief, knotted at the throat, a tail down the shirt
  for (let x = 3; x <= 8; x++) put(x, 0, 'c');
  for (let x = 4; x <= 8; x++) put(x, 1, x === 8 ? 'C' : 'c');
  put(frontAt(2) - 1, 2, 'C'); put(frontAt(3) - 1, 3, 'c');
  // the pack strap, over the shoulder and down under the arm
  for (let y = 1; y <= 8; y++) put(Math.round(4 + y * 0.3), y, y === 4 ? 'A' : 'a');
  // the vest's buttons down its front edge
  for (const y of [4, 7, 10]) put(frontAt(y) - 3, y, 'g');
  // a breast pocket with his notebook in it
  put(frontAt(4) - 5, 4, 'p'); put(frontAt(5) - 5, 5, 'x');
  // a leather pouch on the back of the belt, with a brass stud
  for (let y = 11; y <= 14; y++) for (let x = 2; x <= 3; x++) put(x, y, y === 11 ? 'A' : 'L');
  put(2, 12, 'g');
  torsoGrid = G;
  return G;
}

const PACK_KEY = { o: 'outline', K: 'canvasL', M: 'canvas', N: 'canvasD', R: 'roll', Q: 'rollD', L: 'packStrap', y: 'buckle', Y: 'buckleD' };
const PACK = [
  '.RRRRR.',
  'RRRQRRQ',
  'QQQQQQQ',
  'KKKKKKM',
  'KLLLLLN',
  'KMMyMMN',
  'KMMMMMN',
  'KMMMMNN',
  'MMMMMNN',
  'NNNNNNN',
];
const PACK_ANCHOR = { x: 6, y: 1 };

const BOOT_KEY = { o: 'outline', O: 'boot', P: 'bootL', Z: 'sole', W: 'shirtD' };
const BOOT = [
  'PO.....',
  'POWO...',
  'POOOOO.',
  'ZZZZZZZ',
];
const BOOT_ANKLE = { x: 1, y: 0 };

/** Everything he holds, on the same grid as he is. */
const PROP_KEY = {
  w: 'wood', W: 'woodL', S: 'steel', s: 'steelD', B: 'brass', b: 'brassD',
  l: 'lens', L: 'leather', p: 'paper', g: 'glass', G: 'glassL', n: 'label', C: 'flaskL',
  c: 'flask', h: 'bristle', r: 'red', y: 'pencil', k: 'outline',
};
const PROPS = {
  trowel: { at: { x: 1, y: 0 }, rows: ['.w...', '.Wo..', '..s..', '.SSs.', '.SSs.', '..S..'] },
  brush: { at: { x: 1, y: 1 }, rows: ['....', '.W..', '.w..', '.BB.', '.hh.', '.hh.'] },
  pencil: { at: { x: 2, y: 2 }, rows: ['.....', '....y', '...y.', '..y..', '.k...'] },
  notebook: { at: { x: 2, y: 3 }, rows: ['.....', '.LLp.', '.LLp.', '.LLp.', '.LLp.'] },
  canteen: { at: { x: 2, y: 2 }, rows: ['......', '.CC...', '.Ccc..', '..ccc.', '...cc.'] },
  beer: { at: { x: 2, y: 3 }, rows: ['......', '....G.', '...gg.', '..ng..', '.g....'] },
  lens: { at: { x: 1, y: 1 }, rows: ['........', '.bBbbBl.'] },
  peg: { at: { x: 1, y: 1 }, rows: ['.rr.', '.w..', '.w..', '.w..'] },
};

// ---------------------------------------------------------------------------
// the compositor

const CW = 66, CH = 86;
const OX = 33, OY = 50;           // where the hip sits in the canvas, in art px

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
      const back = !inside(x - 1, y) || (HR > 1 && !inside(x - 2, y));
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
      this._limb(lg.hip, lg.knee, [5.2, 4.8, 4.2, 0.4], tr, idl);
      // the calf swells just under the knee and narrows to the ankle
      this._limb(lg.knee, lg.ankle, [4.2, 3.9, 3.4, 0.5], tr, idl);
      const lift = lg.air > 0.4 ? -1 : 0;
      this._sprite(BOOT, BOOT_KEY, pal, lg.ankle.x, lg.ankle.y + lift / HR, BOOT_ANKLE, idl + 1, 0, dark ? FAR : 0);
    };
    const arm = (a, dark, idl, tool, watch) => {
      const sh = { x: a.sh.x, y: a.sh.y + br }, el = { x: a.el.x, y: a.el.y + br }, ha = { x: a.ha.x, y: a.ha.y + br };
      // the shoulder is round and the sleeve is loose; rolled at the elbow
      this._limb(sh, el, [4.4, 4.0, 3.4, 0.3], tone('shirt', 'shirtD', 'shirtL', dark), idl);
      this._limb(el, ha, [3.4, 3.2, 2.6, 0.4], tone('skin', 'skinD', 'skinL', dark), idl,
        { cuff: 1.8, cuffCol: dark ? mix(pal.shirtL, pal.outline, FAR) : pal.shirtL,
          band: watch ? [Math.hypot(ha.x - el.x, ha.y - el.y) * HR - 1.2, 0.5] : null, bandCol: pal.leather });
      this._limb(ha, ha, [3.4, 3.4, 3.4, 0.5], tone('skin', 'skinD', 'skinL', dark), idl);
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
  const rows = buildHead(EXPR.flat, false).slice(0, HAT_ROWS).map((r) => r.map((c) => (HAT_KEYS.includes(c) ? c : '.')));
  const cv = bake(rows, HEAD_KEY, palette(kind, false));
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
export const ARM = { upper: 8.0, lower: 7.2 };

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
