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
  skinL: '#f9d2a8', skin: '#e9aa7a', skinD: '#c47e56', skinDD: '#8c5238', stubble: '#bf8a68',
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
// the sprites, at HR. '.' is nothing.

const HEAD_KEY = {
  o: 'outline', 1: 'hatL', 2: 'hat', 3: 'hatD', 4: 'hatDD', b: 'band', B: 'bandD',
  g: 'brass', G: 'brassD', e: 'lens', E: 'lensL', h: 'hair', H: 'hairL', k: 'hairD',
  S: 'skinL', s: 'skin', d: 'skinD', D: 'skinDD', q: 'stubble',
  w: 'eyeW', p: 'eye', r: 'brow', m: 'mouth', n: 'lip',
};
const HEAD = [
  '..........oooooooo..........',
  '........oo11111122oo........',
  '.......o1111111222223o......',
  '......o11111112222233o......',
  '......o111111122222233o.....',
  '.....o1111111222222233o.....',
  '.....o11111122222222233o....',
  '.....obbbbbbbbbbbbGgggGo....',
  '.....oBBBBBBBBBBBBGeEGGo....',
  '....o33333333333333GGG3o....',
  '..oo2222222222222222222222oo',
  '.o4444444444444444444444444o',
  '...okkkhHhhhdddddddddddo....',
  '...okhhHHHhhdsssssssssso....',
  '...okhHHhhhhdSSSSSSSSSso....',
  '...okhhhhhhhdssssssrrrrso...',
  '...okhHhhhhdDdsssssdwpso....',
  '...okhhHhhhdDdsssssssdSso...',
  '...okhhhhhhdDdssssssSSsSso..',
  '...okkhhhhhdddsssssssssSsso.',
  '...okkhhhhhhddssssssssDddo..',
  '...okkhhhhhhddsssssssssdo...',
  '...okkhhhhhddqqssssssmmso...',
  '...okkhhhhdddqqqsssssnso....',
  '....okkhhhdqqqqqqsssssSo....',
  '.....okkhddqqqqqqqqssso.....',
  '......ookdddqqqqqqdo........',
  '..........oddddDdo..........',
  '..........osssddDo..........',
  '..........osssddDo..........',
];
const HEAD_NECK = { x: 14, y: 29 };
// the face rows are 12..26; patches replace whole rows
const HEAD_SHUT = { 16: HEAD[16].slice(0, 19) + 'rrs' + HEAD[16].slice(22) };
const HEAD_OPEN = { 22: HEAD[22].slice(0, 20) + 'mmm' + HEAD[22].slice(23), 23: HEAD[23].slice(0, 20) + 'mn' + HEAD[23].slice(22) };
const HEAD_BROW = { 16: HEAD[16].slice(0, 19) + 'r' + HEAD[16].slice(20) };
const HEAD_BARE = (() => {
  const b = {};
  for (let y = 0; y < 8; y++) b[y] = '.'.repeat(28);
  b[8] = '......oooooooooo............';
  b[9] = '.....okkhhhhHHhhoo..........';
  b[10] = '....okhhhHHHhhhhhhoo........';
  b[11] = '...okhhHHhhhhhhhhhhhoo......';
  b[12] = HEAD[12].slice(0, 12) + 'hhssssssss' + HEAD[12].slice(22);
  return b;
})();

const TORSO_KEY = {
  o: 'outline', c: 'scarf', C: 'scarfD', f: 'shirtL', i: 'shirt', j: 'shirtD', J: 'shirtDD',
  v: 'vest', V: 'vestL', x: 'vestD', X: 'vestDD', a: 'strap', A: 'strapL',
  l: 'belt', y: 'buckle', Y: 'buckleD', t: 'trouser', T: 'trouserD', U: 'trouserL',
};
const TORSO = [
  '......occco.....',
  '.....ocCccco....',
  '....oxcCccifo...',
  '...oxvACcciifo..',
  '..oxvvaAcCiiifo.',
  '.oxvvvvaACiiifo.',
  '.oxvvvvvaAiiijfo',
  '.oxvVvvvvaAiijfo',
  '.oxvVvvvvvaAijfo',
  '.oxvVvvvvvvaAjfo',
  '.oxvvvvvvvvvaAio',
  '.oxvvVVVVvvvviao',
  '.oxvvxxxxvvvvijo',
  '.oxvvvvvvvvvvijo',
  '.oxvvvvvvvvvvijo',
  '.oxvVvvvvvvvvjfo',
  '.oxvVvvvvvvvvjio',
  '.oxvvvvvvvvvvjio',
  '.oxxvvvvvvvvvjio',
  '.oxxvvvvvvvvvvjo',
  '.oxxvVvvvvvvvvjo',
  '.oxxvvvvvvvvvvjo',
  '.oxxxvvvvvvvvvjo',
  '.oXxxxvvvvvvvvjo',
  '.olllllllllyYlo.',
  '.olAlllllllyYlo.',
  '.oTtttttttttUto.',
  '.oTttttttttttto.',
  '..oTtttttttttto.',
  '..oTTtttttttto..',
];
const TORSO_HIP = { x: 8, y: 30 };

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

const BOOT_KEY = { o: 'outline', O: 'boot', P: 'bootL', Z: 'sole', W: 'bootL' };
const BOOT = [
  'oOOOOo....',
  'oPOOOo....',
  'oPOOOOo...',
  'oPOOOOOo..',
  'oPPOOOOOo.',
  'oZZZZZZZZo',
  '.oooooooo.',
];
const BOOT_ANKLE = { x: 3, y: 1 };

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

const CW = 124, CH = 156;
const OX = 62, OY = 92;            // where the hip sits in the canvas, in art px

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

  /** A sprite with its anchor at a body-space point (world units). */
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
   * A limb: a solid stroke from a to b (world units), `w` art pixels across,
   * in three tones - the cloth, a shaded back edge two pixels deep, and a lit
   * pixel down the front. `cuff` paints the stretch nearest `a` another
   * colour, which is how a rolled sleeve ends at the elbow.
   */
  _limb(a, b, w, tone, id, opts = {}) {
    const ax = OX + a.x * HR, ay = OY + a.y * HR, bx = OX + b.x * HR, by = OY + b.y * HR;
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.ceil(len * 2));
    const w0 = w, w1 = opts.taper ? w * opts.taper : w;
    const mask = new Map();
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
      const r = (w0 + (w1 - w0) * t) / 2;
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
    for (const [key, along] of mask) {
      const x = key % CW, y = (key / CW) | 0;
      let c = tone.base;
      if (opts.cuff && along < opts.cuff) c = opts.cuffCol;
      // the back edge and the underside are turned away from the sun; the
      // front edge catches it
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
   * units, y down, facing right).
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
      this._limb(lg.hip, lg.knee, 8.4, tr, idl, { taper: 0.86 });
      this._limb(lg.knee, lg.ankle, 7.0, tr, idl, { taper: 0.84, crease: 3 });
      const lift = lg.air > 0.4 ? -1 : 0;
      this._sprite(BOOT, BOOT_KEY, pal, lg.ankle.x, lg.ankle.y + lift / HR, BOOT_ANKLE, idl + 1, 0, dark ? FAR : 0);
    };
    const arm = (a, dark, idl, tool) => {
      const sh = { x: a.sh.x, y: a.sh.y + br }, el = { x: a.el.x, y: a.el.y + br }, ha = { x: a.ha.x, y: a.ha.y + br };
      this._limb(sh, el, 6.2, tone('shirt', 'shirtD', 'shirtL', dark), idl, { taper: 0.9, crease: 6 });
      this._limb(el, ha, 5.0, tone('skin', 'skinD', 'skinL', dark), idl,
        { taper: 0.9, cuff: 3.2, cuffCol: dark ? mix(pal.shirtL, pal.outline, FAR) : pal.shirtL });
      this._limb(ha, ha, 5.6, tone('skin', 'skinD', 'skinL', dark), idl);
      if (tool && PROPS[tool]) {
        const P = PROPS[tool];
        this._sprite(P.rows, PROP_KEY, pal, ha.x, ha.y, P.at, idl + 1, 0, dark ? FAR : 0);
      }
    };

    leg(s.legF, true, id); id += 2;
    this._sprite(PACK, PACK_KEY, pal, s.bag.x, s.bag.y + br, PACK_ANCHOR, id++, 0, 0);
    arm(s.armF, true, id); id += 2;

    // the head goes under the torso, so the neckerchief sits over the neck
    const rows = HEAD.slice();
    const f = s.face || {};
    if (f.bare) for (const k of Object.keys(HEAD_BARE)) rows[+k] = HEAD_BARE[k];
    if (f.brow && !f.shut) for (const k of Object.keys(HEAD_BROW)) rows[+k] = HEAD_BROW[k];
    if (f.shut) for (const k of Object.keys(HEAD_SHUT)) rows[+k] = HEAD_SHUT[k];
    if (f.open) for (const k of Object.keys(HEAD_OPEN)) rows[+k] = HEAD_OPEN[k];
    this._sprite(rows, HEAD_KEY, pal, s.neck.x, s.neck.y + br + (s.nod || 0) / HR, HEAD_NECK, id++, 0);
    this._sprite(TORSO, TORSO_KEY, pal, 0, br, TORSO_HIP, id++, L);

    leg(s.legN, false, id); id += 2;
    if (s.hold && PROPS[s.hold]) {
      const P = PROPS[s.hold];
      this._sprite(P.rows, PROP_KEY, pal, s.chest.x, s.chest.y + br, P.at, id++, 0);
    }
    arm(s.armN, false, id, s.tool); id += 2;

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
  const cv = bake(HEAD.slice(0, 12), HEAD_KEY, palette(kind, false));
  // halve it back to world pixels so it matches everything else it lies next to
  const small = makeCanvas(Math.ceil(cv.width / HR), Math.ceil(cv.height / HR));
  const g = small.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(cv, 0, 0, small.width, small.height);
  return { cv: small, ox: small.width / 2, oy: small.height };
}

/** The head on its own, at art resolution, for tokens and speech bubbles. */
export function headSprite(kind = 'vess', opts = {}) {
  const rows = HEAD.slice();
  if (opts.bare) for (const k of Object.keys(HEAD_BARE)) rows[+k] = HEAD_BARE[k];
  const cv = bake(rows, HEAD_KEY, palette(kind, !!opts.spore));
  return { cv, ox: HEAD_NECK.x, oy: HEAD_NECK.y, W: cv.width, H: cv.height };
}

/** Where the parts join, in world units from the hip. */
export const FIGURE_SOCKETS = {
  shoulder: { x: -0.3, y: -12.4 },
  neck: { x: -0.5, y: -14.2 },
  bag: { x: -3.6, y: -13.6 },
  chest: { x: 2.6, y: -8.6 },
};

/**
 * THE WALK, as eight frames - the way every walk cycle on a pixel-art sheet is
 * drawn: contact, down, passing, up, and the same again on the other foot.
 * Each entry is where one foot is, as a fraction of the leg's length ahead of
 * the hip and above the ground; the other foot runs four frames behind.
 */
export const WALK = [
  [0.44, 0.00], [0.26, 0.00], [0.07, 0.00], [-0.13, 0.00],
  [-0.34, 0.02], [-0.33, 0.13], [0.00, 0.20], [0.31, 0.10],
];
/** How far the hip drops on each frame: lowest on the down, highest on the up. */
export const WALK_BOB = [0.2, 1.0, 0.35, -0.55, 0.2, 1.0, 0.35, -0.55];
/** How far the body travels in one full cycle, in leg lengths. */
export const WALK_CYCLE = 1.56;
