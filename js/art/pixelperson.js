// CRABDEN - the people, drawn.
//
// Every version of Dr. Vess before this one was made of bitmaps turned to
// whatever angle his joints happened to be at, and turning pixel art to an
// arbitrary angle is how you shred it: the outline doubles, the edges go to
// staircases, and a thigh becomes a sausage made of noise. No amount of
// repainting the bitmaps fixes that, because the damage is done by the turn.
//
// So nothing here is ever rotated.
//
//   The HEAD, the TORSO, the PACK, the BOOTS and everything he holds are
//   hand-placed pixel sprites, laid out below as text. They move by whole
//   pixels and they lean by shearing a row at a time, which is what an
//   animator would do by hand.
//
//   The LIMBS are solid pixel strokes laid between the joints the poser
//   already solves - shoulder, elbow, hand, hip, knee, ankle - so every pose
//   he has ever had still works, and every one of them comes out as clean
//   single-pixel geometry at the game's own grid.
//
//   And then ONE outline goes round the whole figure, with a darker line
//   wherever a nearer part crosses a further one. That last pass is what
//   turns a stack of parts into one drawn character.
//
// Everything faces right and is measured from the hip, in world pixels.

import { makeCanvas } from '../render/pixel.js';

// ---------------------------------------------------------------------------
// the palette

const VESS = {
  outline: '#26160f',
  skin: '#e6a676', skinL: '#f6c79a', skinD: '#bd7851', stubble: '#c28c6c',
  hair: '#6b3f27', hairL: '#91603e', hairD: '#44271a',
  eyeW: '#f3ead8', eye: '#22140e', mouth: '#8a3a30', brow: '#4a2c1c',
  hat: '#d4b482', hatL: '#efd6a6', hatD: '#a6875b', band: '#8e3a30',
  brass: '#d9a94f', brassD: '#94692b', lens: '#72bcd0',
  shirt: '#e4dac0', shirtL: '#faf4e4', shirtD: '#b5a786',
  vest: '#76502f', vestL: '#9a6d44', vestD: '#4f331e',
  scarf: '#a83f2e', scarfD: '#74281d',
  belt: '#3a2618', buckle: '#e2b74a', strap: '#4b301e',
  trouser: '#898458', trouserL: '#a6a172', trouserD: '#605d3d',
  boot: '#4e3322', bootL: '#72503a', sole: '#21140c',
  canvas: '#a48d60', canvasL: '#c4ad7e', canvasD: '#776342', roll: '#6b7c58', rollD: '#4b5a3e',
  wood: '#86582f', woodL: '#b07a48', steel: '#c9ced3', steelD: '#858c95',
  paper: '#f0e8d4', leather: '#5a3a24', glass: '#4f8f4a', glassL: '#9fd896', label: '#e8d8a8',
  flask: '#667758', flaskL: '#8fa37a', bristle: '#d8c090', red: '#b03a30', pencil: '#e2b74a',
};

const ELDER = {
  ...VESS,
  hat: '#95412f', hatL: '#c3735c', hatD: '#63251d', band: '#3d2a20',
  hair: '#b8b2a8', hairL: '#e2ded6', hairD: '#8a847b', brow: '#8a847b', stubble: '#e4ded4',
  vest: '#4f5364', vestL: '#686d80', vestD: '#373a47',
  scarf: '#dcd4c2', scarfD: '#b0a892',
  trouser: '#7e4347', trouserL: '#985a5b', trouserD: '#52292c',
};

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const palCache = new Map();
function palette(kind, spore) {
  const key = kind + (spore ? ':s' : '');
  let p = palCache.get(key);
  if (p) return p;
  const src = kind === 'elder' ? ELDER : VESS;
  p = {};
  for (const [k, v] of Object.entries(src)) p[k] = hex(v);
  if (spore) {
    // it shows in exactly one place, and it is the place you look
    p.eye = hex('#8a52e8');
    p.eyeW = hex('#dcc8ff');
  }
  palCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// the sprites. '.' is nothing; every other character is a palette slot.

/**
 * His head, facing right, fourteen by fifteen: a pith helmet with a maroon
 * band and brass goggles pushed up on it, a brim that stands off the front
 * of his face, brown hair behind the ear, a brow, one eye with its white
 * showing, a nose that actually stands out of the profile, a mouth under it
 * and stubble along the jaw. The neck is the bottom row.
 */
const HEAD_KEY = {
  o: 'outline', T: 'hatL', t: 'hat', u: 'hatD', b: 'band', g: 'brass', e: 'lens',
  k: 'hairD', h: 'hair', H: 'hairL', s: 'skin', S: 'skinL', d: 'skinD',
  w: 'eyeW', p: 'eye', r: 'brow', m: 'mouth', q: 'stubble',
};
const HEAD = [
  '....oooooo....',
  '...oTTTTTtto..',
  '...oTTTTttto..',
  '..obbbbbbgeo..',
  '.otttttttttto.',
  'ouuuuuuuuuuuuo',
  '..okhhddddddo.',
  '..okhhssrrsso.',
  '..okhdsswpsSo.',
  '..okhddsssssSo',
  '..okhhdsssdso.',
  '..okhhdssmmso.',
  '...okhdqqqso..',
  '....okdqqoo...',
  '.....oddo.....',
];
const HEAD_NECK = { x: 7, y: 14 };
const HEAD_SHUT = { 8: '..okhdssddsSo.' };
const HEAD_OPEN = { 11: '..okhhdsmmmso.', 12: '...okhdqmqso..' };
const HEAD_BARE = {
  0: '..............', 1: '..............', 2: '..............',
  3: '....oooooo....', 4: '...okhhhhHHo..', 5: '..okhhhhhHHHo.',
  6: '..okhhhhhhsso.',
};
/** Frowning or fed up: the brow comes down over the eye. */
const HEAD_BROW = { 7: '..okhhsrrrsso.' };

/**
 * The torso, nine by sixteen, from the neckerchief to the top of the
 * trousers: an open leather work vest over a cream shirt, the pack strap
 * coming over the shoulder and across the chest, and a belt with a brass
 * buckle. The hip is the middle of the bottom edge.
 */
const TORSO_KEY = {
  o: 'outline', c: 'scarf', C: 'scarfD', i: 'shirt', f: 'shirtL', j: 'shirtD',
  v: 'vest', V: 'vestL', x: 'vestD', a: 'strap', l: 'belt', y: 'buckle', t: 'trouser', T: 'trouserD',
};
const TORSO = [
  '...occo..',
  '..ocCcco.',
  '.oxvaCifo',
  'oxvvaiifo',
  'oxvvaiifo',
  'oxvvviafo',
  'oxvVviiao',
  'oxvVvijio',
  'oxvvvijio',
  'oxvvvvjio',
  'oxvvvvjio',
  'oxxvvvjjo',
  'olllllylo',
  'oTtttttto',
  'oTtttttto',
  '.oTtttto.',
];
const TORSO_HIP = { x: 4, y: 16 };

/** The pack on his back: a bedroll strapped across the top of a canvas bag. */
const PACK_KEY = {
  o: 'outline', A: 'roll', E: 'rollD', K: 'canvasL', M: 'canvas', N: 'canvasD', L: 'strap', y: 'buckle',
};
const PACK = [
  '.ooooo.',
  'oAAAAEo',
  'oEEEEEo',
  'ooooooo',
  'oKKKKMo',
  'oKMMMMo',
  'oLLLLLo',
  'oMMyMNo',
  'oMMMMNo',
  'oNNNNNo',
  '.ooooo.',
];
const PACK_ANCHOR = { x: 6, y: 1 };

const BOOT_KEY = { o: 'outline', O: 'boot', Q: 'bootL', U: 'sole' };
const BOOT = [
  'oQOo..',
  'oQOOo.',
  'oOOOOo',
  'oUUUUo',
];
const BOOT_ANKLE = { x: 2, y: 1 };

/** Everything he holds, each drawn once in the way that pose holds it. */
const PROP_KEY = {
  o: 'outline', w: 'wood', W: 'woodL', S: 'steel', s: 'steelD', B: 'brass', b: 'brassD',
  l: 'lens', L: 'leather', p: 'paper', g: 'glass', G: 'glassL', n: 'label', C: 'flaskL',
  c: 'flask', h: 'bristle', r: 'red', y: 'pencil', k: 'outline',
};
const PROPS = {
  trowel: { at: { x: 1, y: 0 }, rows: [
    'ow...',
    'oWo..',
    '.oso.',
    'oSSso',
    'oSSso',
    '.oSo.',
    '..o..',
  ] },
  brush: { at: { x: 1, y: 1 }, rows: [
    '.o..',
    'oWo.',
    'owo.',
    'oBBo',
    'ohho',
    'ohho',
    '.oo.',
  ] },
  pencil: { at: { x: 2, y: 2 }, rows: [
    '....o',
    '...oy',
    '..oyo',
    '.oyo.',
    'oko..',
  ] },
  notebook: { at: { x: 2, y: 3 }, rows: [
    'ooooo',
    'oLLpo',
    'oLLpo',
    'oLLpo',
    'oLLpo',
    'ooooo',
  ] },
  canteen: { at: { x: 2, y: 2 }, rows: [
    '.oo...',
    'oCCo..',
    'oCcco.',
    '.occco',
    '..occo',
    '...oo.',
  ] },
  beer: { at: { x: 2, y: 3 }, rows: [
    '....oo',
    '...oGo',
    '..oggo',
    '.ongo.',
    'ogo...',
    'oo....',
  ] },
  lens: { at: { x: 1, y: 1 }, rows: [
    '.oooooo.',
    'obBbbBlo',
    '.oooooo.',
  ] },
  peg: { at: { x: 1, y: 1 }, rows: [
    'orro',
    'owo.',
    'owo.',
    'owo.',
    '.o..',
  ] },
};

// ---------------------------------------------------------------------------
// the compositor

const CW = 60, CH = 80;
const OX = 30, OY = 48;           // where the hip sits in the canvas

export class PixelFigure {
  constructor(kind = 'vess') {
    this.kind = kind;
    this.cv = makeCanvas(CW, CH);
    this.g = this.cv.getContext('2d');
    this.img = this.g.createImageData(CW, CH);
    this.col = new Array(CW * CH);
    this.pid = new Uint8Array(CW * CH);
    this.ox = OX;
    this.oy = OY;
  }

  _clear() {
    this.pid.fill(0);
    this.col.fill(null);
  }

  _put(x, y, rgb, id) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= CW || y >= CH || !rgb) return;
    const i = y * CW + x;
    this.col[i] = rgb;
    this.pid[i] = id;
  }

  /** A sprite at a body-space point, optionally sheared by a lean. */
  _sprite(rows, key, pal, bx, by, anchor, id, lean = 0, dark = 0) {
    const H = rows.length;
    for (let y = 0; y < H; y++) {
      const row = rows[y];
      // shear: each row moves over by how high it is above the anchor
      const up = anchor.y - y;
      const sx = lean ? Math.round(up * Math.sin(lean)) : 0;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        let c = pal[key[ch]];
        if (!c) continue;
        if (dark) c = mix(c, pal.outline, dark);
        this._put(OX + bx + x - anchor.x + sx, OY + by + y - anchor.y, c, id);
      }
    }
  }

  /**
   * A limb: a solid stroke from a to b, `w` pixels across, coloured with a
   * shaded back edge. `cuff` paints the first stretch near `a` another colour,
   * which is how a rolled sleeve ends at the elbow.
   */
  _limb(a, b, w, base, shade, id, opts = {}) {
    const ax = OX + a.x, ay = OY + a.y, bx = OX + b.x, by = OY + b.y;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.ceil(len * 2));
    const r = w / 2;
    const mask = new Map();
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
      const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
      const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > r * r + 0.15) continue;
          const key = y * CW + x;
          const along = t * len;
          const prev = mask.get(key);
          if (prev === undefined || along < prev) mask.set(key, along);
        }
      }
    }
    const inside = (x, y) => mask.has(y * CW + x);
    for (const [key, along] of mask) {
      const x = key % CW, y = (key / CW) | 0;
      let c = base;
      if (opts.cuff && along < opts.cuff) c = opts.cuffCol;
      else if (opts.tip && along > len - opts.tip) c = opts.tipCol;
      // the back edge and the underside are in shade
      if (!inside(x - 1, y) || (!inside(x, y + 1) && Math.abs(by - ay) < Math.abs(bx - ax))) c = mix(c, shade, 0.85);
      this._put(x, y, c, id);
    }
  }

  /** The finishing pass: one outline round the lot, and lines between parts. */
  _finish(pal) {
    const { col, pid, img } = this;
    const d = img.data;
    const out = pal.outline;
    // parts that cross over parts drawn before them get a darker line along
    // the join, on the further part - the classic hand-pixelled separation
    const sel = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < CW; x++) {
        const i = y * CW + x;
        const a = pid[i];
        if (!a) continue;
        const n4 = [x > 0 ? i - 1 : -1, x < CW - 1 ? i + 1 : -1, y > 0 ? i - CW : -1, y < CH - 1 ? i + CW : -1];
        for (const j of n4) {
          if (j >= 0 && pid[j] > a + 0) { sel[i] = 1; break; }
        }
      }
    }
    for (let i = 0; i < CW * CH; i++) {
      const o = i * 4;
      let c = col[i];
      if (c) {
        if (sel[i]) c = mix(c, out, 0.6);
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        continue;
      }
      // empty: outline if anything touches it
      const x = i % CW, y = (i / CW) | 0;
      const touch = (x > 0 && pid[i - 1]) || (x < CW - 1 && pid[i + 1])
        || (y > 0 && pid[i - CW]) || (y < CH - 1 && pid[i + CW]);
      if (touch) { d[o] = out[0]; d[o + 1] = out[1]; d[o + 2] = out[2]; d[o + 3] = 255; }
      else d[o + 3] = 0;
    }
    this.g.putImageData(img, 0, 0);
  }

  /**
   * Draw one frame.
   *
   * `s` is the solved skeleton in body space (hip at 0,0, y down, facing
   * right): lean, breath, the two arms as {sh, el, ha}, the two legs as
   * {hip, knee, ankle, air}, what is held, and the face.
   */
  render(s) {
    const pal = palette(this.kind, !!s.spore);
    this._clear();
    const L = s.lean || 0;
    const br = Math.round(s.breath || 0);
    const FAR = 0.30;
    const far = (k) => mix(pal[k], pal.outline, FAR);
    let id = 1;

    // ---- far leg ------------------------------------------------------------
    const leg = (lg, dark, idl) => {
      const base = dark ? far('trouser') : pal.trouser;
      const shade = dark ? far('trouserD') : pal.trouserD;
      this._limb(lg.hip, lg.knee, 4, base, shade, idl);
      this._limb(lg.knee, lg.ankle, 3.2, base, shade, idl);
      const tip = lg.air > 0.05 ? -1 : 0;
      this._sprite(BOOT, BOOT_KEY, pal, Math.round(lg.ankle.x), Math.round(lg.ankle.y) + tip,
        BOOT_ANKLE, idl + 1, 0, dark ? FAR : 0);
    };
    leg(s.legF, true, id); id += 2;

    // ---- far arm, and the pack behind everything else ----------------------
    const bag = s.bag;
    this._sprite(PACK, PACK_KEY, pal, Math.round(bag.x), Math.round(bag.y) + br, PACK_ANCHOR, id++, 0, 0);
    const arm = (a, dark, idl, tool) => {
      const sh = { x: a.sh.x, y: a.sh.y + br }, el = { x: a.el.x, y: a.el.y + br }, ha = { x: a.ha.x, y: a.ha.y + br };
      this._limb(sh, el, 3, dark ? far('shirt') : pal.shirt, dark ? far('shirtD') : pal.shirtD, idl);
      this._limb(el, ha, 2.6, dark ? far('skin') : pal.skin, dark ? far('skinD') : pal.skinD, idl,
        { cuff: 1.6, cuffCol: dark ? far('shirtL') : pal.shirtL });
      this._limb(ha, ha, 3.2, dark ? far('skin') : pal.skin, dark ? far('skinD') : pal.skinD, idl);
      if (tool && PROPS[tool]) {
        const P = PROPS[tool];
        this._sprite(P.rows, PROP_KEY, pal, Math.round(ha.x), Math.round(ha.y), P.at, idl + 1, 0, dark ? FAR : 0);
      }
    };
    arm(s.armF, true, id); id += 2;

    // ---- torso and head -----------------------------------------------------
    this._sprite(TORSO, TORSO_KEY, pal, 0, br, TORSO_HIP, id++, L);
    const rows = HEAD.slice();
    const f = s.face || {};
    const patch = f.shut ? HEAD_SHUT : null;
    if (patch) for (const k of Object.keys(patch)) rows[+k] = patch[k];
    if (f.brow && !f.shut) for (const k of Object.keys(HEAD_BROW)) rows[+k] = HEAD_BROW[k];
    if (f.open) for (const k of Object.keys(HEAD_OPEN)) rows[+k] = HEAD_OPEN[k];
    if (f.bare) for (const k of Object.keys(HEAD_BARE)) rows[+k] = HEAD_BARE[k];
    this._sprite(rows, HEAD_KEY, pal, Math.round(s.neck.x), Math.round(s.neck.y) + br + (s.nod || 0),
      HEAD_NECK, id++, 0);

    // ---- near leg, whatever is held to the chest, the near arm -------------
    leg(s.legN, false, id); id += 2;
    if (s.hold && PROPS[s.hold]) {
      const P = PROPS[s.hold];
      this._sprite(P.rows, PROP_KEY, pal, Math.round(s.chest.x), Math.round(s.chest.y) + br, P.at, id++, 0);
    }
    arm(s.armN, false, id, s.tool); id += 2;

    this._finish(pal);
    return this.cv;
  }
}

/** The hat on its own, for when it has come off. */
export function hatSprite(kind = 'vess') {
  const pal = palette(kind, false);
  const rows = HEAD.slice(0, 6);
  const W = rows[0].length, H = rows.length;
  const cv = makeCanvas(W + 2, H + 2);
  const g = cv.getContext('2d');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const c = pal[HEAD_KEY[ch]];
      if (!c) continue;
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  return { cv, ox: (W + 2) / 2, oy: H + 1 };
}

/** The head on its own, for tokens and speech bubbles that want a face. */
export function headSprite(kind = 'vess', opts = {}) {
  const pal = palette(kind, !!opts.spore);
  const rows = HEAD.slice();
  if (opts.bare) for (const k of Object.keys(HEAD_BARE)) rows[+k] = HEAD_BARE[k];
  const W = rows[0].length, H = rows.length;
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const c = pal[HEAD_KEY[ch]];
      if (!c) continue;
      g.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return { cv, ox: HEAD_NECK.x, oy: HEAD_NECK.y, W, H };
}

export const FIGURE_SOCKETS = {
  shoulder: { x: 0.4, y: -13.4 },
  neck: { x: 0.6, y: -16 },
  bag: { x: -3.4, y: -14 },
  chest: { x: 2.6, y: -8.5 },
};
