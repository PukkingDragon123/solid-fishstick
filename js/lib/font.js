// CRABDEN - hand-drawn 5x7 bitmap font.
// Glyphs are authored as pixel rows ('#' = ink) so the UI stays crisp at any
// integer upscale. Rendering goes through a pre-baked atlas, tinted on demand.

const G = {};
function def(ch, rows) { G[ch] = rows.split('/'); }

// --- uppercase (rows 0-5) --------------------------------------------------
def('A', '.###./#...#/#...#/#####/#...#/#...#');
def('B', '####./#...#/####./#...#/#...#/####.');
def('C', '.####/#..../#..../#..../#..../.####');
def('D', '####./#...#/#...#/#...#/#...#/####.');
def('E', '#####/#..../####./#..../#..../#####');
def('F', '#####/#..../####./#..../#..../#....');
def('G', '.####/#..../#..##/#...#/#...#/.###.');
def('H', '#...#/#...#/#####/#...#/#...#/#...#');
def('I', '#####/..#../..#../..#../..#../#####');
def('J', '...##/....#/....#/....#/#...#/.###.');
def('K', '#...#/#..#./###../#..#./#...#/#...#');
def('L', '#..../#..../#..../#..../#..../#####');
def('M', '#...#/##.##/#.#.#/#...#/#...#/#...#');
def('N', '#...#/##..#/#.#.#/#..##/#...#/#...#');
def('O', '.###./#...#/#...#/#...#/#...#/.###.');
def('P', '####./#...#/####./#..../#..../#....');
def('Q', '.###./#...#/#...#/#.#.#/#..#./.##.#');
def('R', '####./#...#/####./#.#../#..#./#...#');
def('S', '.####/#..../.###./....#/....#/####.');
def('T', '#####/..#../..#../..#../..#../..#..');
def('U', '#...#/#...#/#...#/#...#/#...#/.###.');
def('V', '#...#/#...#/#...#/#...#/.#.#./..#..');
def('W', '#...#/#...#/#...#/#.#.#/##.##/#...#');
def('X', '#...#/.#.#./..#../..#../.#.#./#...#');
def('Y', '#...#/.#.#./..#../..#../..#../..#..');
def('Z', '#####/....#/...#./..#../.#.../#####');

// --- lowercase (x-height rows 1-5, ascenders 0-5, descenders to 6) ---------
def('a', '...../.###./....#/.####/#...#/.####');
def('b', '#..../#..../####./#...#/#...#/####.');
def('c', '...../.###./#..../#..../#..../.###.');
def('d', '....#/....#/.####/#...#/#...#/.####');
def('e', '...../.###./#...#/#####/#..../.###.');
def('f', '..##./.#.../####./.#.../.#.../.#...');
def('g', '...../.####/#...#/#...#/.####/....#/.###.');
def('h', '#..../#..../####./#...#/#...#/#...#');
def('i', '..#../...../.##../..#../..#../.###.');
def('j', '...#./...../..##./...#./...#./#..#./.##..');
def('k', '#..../#..../#..#./###../#..#./#...#');
def('l', '.##../..#../..#../..#../..#../.###.');
def('m', '...../##.#./#.#.#/#.#.#/#...#/#...#');
def('n', '...../####./#...#/#...#/#...#/#...#');
def('o', '...../.###./#...#/#...#/#...#/.###.');
def('p', '...../####./#...#/#...#/####./#..../#....');
def('q', '...../.####/#...#/#...#/.####/....#/....#');
def('r', '...../#.##./##..#/#..../#..../#....');
def('s', '...../.####/#..../.###./....#/####.');
def('t', '.#.../.#.../####./.#.../.#..#/..##.');
def('u', '...../#...#/#...#/#...#/#...#/.####');
def('v', '...../#...#/#...#/#...#/.#.#./..#..');
def('w', '...../#...#/#...#/#.#.#/#.#.#/.#.#.');
def('x', '...../#...#/.#.#./..#../.#.#./#...#');
def('y', '...../#...#/#...#/#...#/.####/....#/.###.');
def('z', '...../#####/...#./..#../.#.../#####');

// --- digits ----------------------------------------------------------------
def('0', '.###./#..##/#.#.#/##..#/#...#/.###.');
def('1', '..#../.##../..#../..#../..#../.###.');
def('2', '.###./#...#/...#./..#../.#.../#####');
def('3', '####./....#/.###./....#/....#/####.');
def('4', '#..#./#..#./#..#./#####/...#./...#.');
def('5', '#####/#..../####./....#/#...#/.###.');
def('6', '..##./.#.../####./#...#/#...#/.###.');
def('7', '#####/....#/...#./..#../.#.../.#...');
def('8', '.###./#...#/.###./#...#/#...#/.###.');
def('9', '.###./#...#/#...#/.####/...#./.##..');

// --- punctuation -----------------------------------------------------------
def(' ', '...../...../...../...../...../.....');
def('.', '...../...../...../...../...../..#..');
def(',', '...../...../...../...../..#../..#../.#...');
def('!', '..#../..#../..#../..#../...../..#..');
def('?', '.###./#...#/...#./..#../...../..#..');
def(':', '...../...../..#../...../..#../.....');
def(';', '...../...../..#../...../..#../..#../.#...');
def("'", '..#../..#../...../...../...../.....');
def('"', '.#.#./.#.#./...../...../...../.....');
def('-', '...../...../...../.###./...../.....');
def('+', '...../..#../..#../#####/..#../..#..');
def('=', '...../...../.###./...../.###./.....');
def('_', '...../...../...../...../...../...../#####');
def('/', '....#/....#/...#./..#../.#.../#....');
def('\\', '#..../#..../.#.../..#../...#./....#');
def('(', '..##./.#.../.#.../.#.../.#.../..##.');
def(')', '.##../...#./...#./...#./...#./.##..');
def('[', '.###./.#.../.#.../.#.../.#.../.###.');
def(']', '.###./...#./...#./...#./...#./.###.');
def('<', '...#./..#../.#.../.#.../..#../...#.');
def('>', '.#.../..#../...#./...#./..#../.#...');
def('*', '...../#.#.#/.###./#####/.###./#.#.#');
def('#', '.#.#./#####/.#.#./#####/.#.#./.....');
def('%', '##..#/##.#./..#../.#.##/#..##/.....');
def('&', '.##../#..../.##../#.#.#/#..#./.##.#');
def('@', '.###./#...#/#.###/#.#.#/#.###/#..../.###.');
def('$', '..#../.####/#.#../.###./..#.#/####./..#..');
def('~', '...../...../.#..#/#.##./...../.....');
def('^', '..#../.#.#./#...#/...../...../.....');
def('|', '..#../..#../..#../..#../..#../..#..');
def('°', '.##../#..#./.##../...../...../.....');
def('•', '...../...../..#../..#../...../.....');
def('→', '...../..#../...#./#####/...#./..#..');
def('♥', '...../.#.#./#####/#####/.###./..#..');
def('▲', '...../..#../.###./#####/...../.....');
def('▼', '...../...../#####/.###./..#../.....');

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const LINE_H = 9;

const ORDER = Object.keys(G);
const INDEX = new Map(ORDER.map((c, i) => [c, i]));
const COLS = 24;
const CELL_W = GLYPH_W + 1;
const CELL_H = GLYPH_H + 1;

let baseAtlas = null;
const tintCache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

function buildAtlas() {
  const rows = Math.ceil(ORDER.length / COLS);
  const c = makeCanvas(COLS * CELL_W, rows * CELL_H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ORDER.forEach((ch, i) => {
    const ox = (i % COLS) * CELL_W;
    const oy = Math.floor(i / COLS) * CELL_H;
    const rowsData = G[ch];
    for (let y = 0; y < rowsData.length; y++) {
      const line = rowsData[y];
      for (let x = 0; x < line.length; x++) {
        if (line[x] === '#') ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  });
  return c;
}

function atlasFor(color) {
  if (!baseAtlas) baseAtlas = buildAtlas();
  if (color === '#ffffff') return baseAtlas;
  let c = tintCache.get(color);
  if (c) return c;
  c = makeCanvas(baseAtlas.width, baseAtlas.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(baseAtlas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
  if (tintCache.size > 48) tintCache.clear();
  tintCache.set(color, c);
  return c;
}

/** Advance width of a single character, in pixels (including 1px spacing). */
function charWidth(ch) {
  if (ch === ' ') return 4;
  if (ch === 'i' || ch === 'l' || ch === '.' || ch === ',' || ch === ':' || ch === ';' || ch === '!' || ch === '|' || ch === "'") return 4;
  return GLYPH_W + 1;
}

export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of str) w += charWidth(ch);
  return (w - 1) * scale;
}

/**
 * Draw a single line of text. Returns the advance width.
 * opts: {color, scale, shadow, shadowColor, align, alpha}
 */
export function drawText(ctx, str, x, y, opts = {}) {
  const scale = opts.scale || 1;
  const color = opts.color || '#ffffff';
  const align = opts.align || 'left';
  const w = textWidth(str, scale);
  let px = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const py = Math.round(y);
  if (opts.alpha !== undefined) { ctx.save(); ctx.globalAlpha = opts.alpha; }

  if (opts.shadow) {
    const sc = opts.shadowColor || 'rgba(0,0,0,0.55)';
    blit(ctx, str, px + scale, py + scale, scale, sc);
  }
  if (opts.outline) {
    const oc = opts.outlineColor || '#000000';
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) blit(ctx, str, px + dx * scale, py + dy * scale, scale, oc);
    }
  }
  blit(ctx, str, px, py, scale, color);
  if (opts.alpha !== undefined) ctx.restore();
  return w;
}

function blit(ctx, str, px, py, scale, color) {
  const atlas = atlasFor(color);
  let cx = px;
  for (const ch of str) {
    const idx = INDEX.get(ch);
    if (idx === undefined) {
      if (ch !== '\n') cx += charWidth('?') * scale;
      continue;
    }
    if (ch !== ' ') {
      const sx = (idx % COLS) * CELL_W;
      const sy = Math.floor(idx / COLS) * CELL_H;
      ctx.drawImage(atlas, sx, sy, GLYPH_W, GLYPH_H, cx, py, GLYPH_W * scale, GLYPH_H * scale);
    }
    cx += charWidth(ch) * scale;
  }
}

/** Truncate with an ellipsis so a label can never overrun its column. */
export function ellipsize(str, maxWidth, scale = 1) {
  if (textWidth(str, scale) <= maxWidth) return str;
  let out = str;
  while (out.length > 1 && textWidth(out + '..', scale) > maxWidth) out = out.slice(0, -1);
  return out + '..';
}

/** Greedy word wrap. Returns array of lines. */
export function wrapText(str, maxWidth, scale = 1) {
  const out = [];
  for (const para of String(str).split('\n')) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (textWidth(test, scale) > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Draw wrapped text block; returns total height used. */
export function drawTextBlock(ctx, str, x, y, maxWidth, opts = {}) {
  const scale = opts.scale || 1;
  const lh = (opts.lineHeight || LINE_H) * scale;
  const lines = Array.isArray(str) ? str : wrapText(str, maxWidth, scale);
  lines.forEach((line, i) => drawText(ctx, line, x, y + i * lh, opts));
  return lines.length * lh;
}
