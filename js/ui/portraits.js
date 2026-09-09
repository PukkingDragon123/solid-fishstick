// CRABDEN - procedural cutscene portraits.
// Drawn centred on (x, y) inside a box `w` wide. Moods change eyebrows, mouth
// and a couple of props; `talking` flaps the mouth.

import { TAU, clamp01, rgba } from '../lib/math.js';
import { px, pxEllipse, pxLine, pxBlob } from '../render/sprites.js';
const R = Math.round;

export function drawPortrait(ctx, id, x, y, w, t, mood = 'idle', talking = false) {
  const fn = PORTRAITS[id] || PORTRAITS.pell;
  ctx.save();
  ctx.translate(R(x), R(y));
  // background wash
  const bg = BG[id] || '#2a2018';
  ctx.fillStyle = bg;
  ctx.fillRect(R(-w / 2), R(-w / 2 - 2), R(w), R(w + 4));
  fn(ctx, w, t, mood, talking);
  ctx.restore();
}

const BG = {
  pell: '#3a2c22',
  crab: '#402018',
  crabbaby: '#402018',
  nautilus: '#122028',
  jelly: '#16303c',
  duneback: '#2e2a1e',
};

const PORTRAITS = {};

// --- Dr. Pell --------------------------------------------------------------
PORTRAITS.pell = (ctx, w, t, mood, talking) => {
  const s = w / 32;              // one "portrait pixel"
  const bob = Math.sin(t * 1.6) * s * 0.4;
  const P = (px2, py, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(R(-w / 2 + px2 * s), R(-w / 2 + (py + bob / s) * s), Math.max(1, R(ww * s)), Math.max(1, R(hh * s))); };

  const skin = '#d8a377', skinLo = '#b07f56', hair = '#3a2a1e';
  const hat = '#8a6a44', hatLo = '#6a4f31', shirt = '#7d8a6a', goggle = '#4a6a78';

  // shoulders
  P(4, 26, 24, 8, shirt);
  P(4, 26, 24, 1, '#5f6a4e');
  // scarf
  P(8, 24, 16, 3, '#c25a4a');
  P(9, 26, 6, 4, '#a8483c');
  // neck
  P(14, 22, 5, 4, skinLo);
  // head
  P(9, 8, 15, 15, skin);
  P(9, 8, 15, 2, skinLo);
  P(22, 10, 2, 12, skinLo);
  // ears
  P(7, 14, 2, 4, skin);
  P(24, 14, 2, 4, skin);
  // hair + stubble
  P(9, 7, 15, 3, hair);
  P(8, 9, 2, 5, hair);
  P(11, 19, 11, 3, rgba('#4a3524', 0.35));
  // hat brim + crown
  P(5, 5, 23, 3, hat);
  P(5, 7, 23, 1, hatLo);
  P(10, 1, 13, 5, hat);
  P(10, 4, 13, 1, hatLo);
  P(10, 1, 13, 1, '#a8845c');
  // goggles pushed up on the brim
  P(9, 3, 6, 3, goggle);
  P(18, 3, 6, 3, goggle);
  P(15, 4, 3, 1, '#2e3a42');
  P(10, 3, 2, 1, '#9fd8e8');
  P(19, 3, 2, 1, '#9fd8e8');

  // eyes
  const blink = (Math.sin(t * 0.9) > 0.985) ? 1 : 0;
  const shock = mood === 'shock' || mood === 'panic';
  const eyeY = 13;
  const eyeH = blink ? 1 : (shock ? 4 : 2);
  P(11, eyeY, 4, eyeH, '#f4ead6');
  P(18, eyeY, 4, eyeH, '#f4ead6');
  if (!blink) {
    const look = mood === 'think' ? 1 : 0;
    P(12 + look, eyeY + (shock ? 1 : 0), 2, shock ? 2 : 2, '#2a1d16');
    P(19 + look, eyeY + (shock ? 1 : 0), 2, shock ? 2 : 2, '#2a1d16');
  }
  // brows
  if (mood === 'shock' || mood === 'panic') { P(11, eyeY - 3, 4, 1, hair); P(18, eyeY - 3, 4, 1, hair); }
  else if (mood === 'sad' || mood === 'embarrassed') { P(11, eyeY - 2, 4, 1, hair); P(18, eyeY - 1, 4, 1, hair); }
  else if (mood === 'angry') { P(11, eyeY - 1, 4, 1, hair); P(18, eyeY - 1, 4, 1, hair); P(13, eyeY - 2, 2, 1, hair); }
  else { P(11, eyeY - 2, 4, 1, hair); P(18, eyeY - 2, 4, 1, hair); }

  // nose
  P(15, 15, 2, 4, skinLo);
  P(15, 18, 3, 1, '#9a6c47');

  // mouth
  const open = talking ? (Math.floor(t * 14) % 2 ? 3 : 1) : (mood === 'shock' ? 4 : 1);
  if (mood === 'happy' || mood === 'delight') {
    P(13, 20, 6, 1, '#7d4a38');
    P(12, 19, 1, 1, '#7d4a38'); P(19, 19, 1, 1, '#7d4a38');
    if (open > 1) P(14, 20, 4, 2, '#5a2f26');
  } else if (mood === 'embarrassed') {
    P(13, 20, 5, 1, '#7d4a38');
    // blush
    P(10, 17, 3, 2, rgba('#e2705a', 0.5));
    P(20, 17, 3, 2, rgba('#e2705a', 0.5));
  } else {
    P(14, 20, Math.max(3, open + 1), open, '#5a2f26');
  }

  // sweat drop when panicking
  if (mood === 'panic' || mood === 'embarrassed') {
    const dy = (t * 6) % 6;
    P(25, 8 + dy, 2, 3, '#9fd8e8');
  }
  if (mood === 'delight') {
    for (let i = 0; i < 3; i++) {
      const a = t * 3 + i * 2;
      P(4 + Math.sin(a) * 2, 6 + i * 6, 1, 1, '#ffe9a0');
      P(27 + Math.cos(a) * 2, 8 + i * 5, 1, 1, '#ffe9a0');
    }
  }
};

// --- the crab --------------------------------------------------------------
function crabFace(ctx, w, t, mood, talking, scale) {
  const s = w / 32;
  const bob = Math.sin(t * 2.1) * s * 0.5;
  const P = (px2, py, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(R(-w / 2 + px2 * s), R(-w / 2 + (py + bob / s) * s), Math.max(1, R(ww * s)), Math.max(1, R(hh * s))); };

  const shell = '#b8543a', shellHi = '#e08a5c', shellLo = '#7a3324', rim = '#40170f';
  const cy = 20 - scale * 3;

  // claws at the bottom corners
  const clawWave = mood === 'angry' ? Math.sin(t * 14) * 2 : Math.sin(t * 2) * 1;
  P(1, 24 + clawWave, 7, 6, shell);
  P(1, 24 + clawWave, 7, 1, shellHi);
  P(1, 27 + clawWave, 4, 1, rim);
  P(24, 24 - clawWave, 7, 6, shell);
  P(24, 24 - clawWave, 7, 1, shellHi);
  P(27, 27 - clawWave, 4, 1, rim);

  // carapace
  const cw = 20 * scale, cx = 16 - cw / 2;
  P(cx - 1, cy - 1, cw + 2, 13, rim);
  P(cx, cy, cw, 11, shell);
  P(cx + 1, cy + 1, cw - 2, 3, shellHi);
  P(cx + 2, cy + 6, cw - 4, 1, shellLo);
  // water organ peeking over the top
  const fill = 0.55 + Math.sin(t * 1.4) * 0.12;
  P(13, cy - 5, 6, 5, '#2a6f80');
  P(13, cy - 5 + 5 * (1 - fill), 6, 5 * fill, '#57c8d8');
  P(14, cy - 5, 2, 1, '#c6f6ff');

  // eye stalks
  const sleepy = mood === 'sleepy';
  const stalkH = sleepy ? 4 : 8;
  const sway = Math.sin(t * 2.4) * 1.2;
  for (const side of [-1, 1]) {
    const ex = 16 + side * 5;
    P(ex - 1, cy - stalkH, 2, stalkH, shellLo);
    const eyX = ex - 2 + side * sway * 0.4;
    const eyY = cy - stalkH - 4;
    P(eyX - 1, eyY - 1, 6, 6, rim);
    P(eyX, eyY, 4, 4, '#f5efe2');
    if (sleepy) {
      P(eyX, eyY + 1, 4, 2, rim);
    } else if (mood === 'shock') {
      P(eyX + 1, eyY + 1, 2, 2, '#1b1016');
    } else if (mood === 'angry') {
      P(eyX + (side > 0 ? 0 : 1), eyY + 2, 3, 2, '#1b1016');
      P(eyX, eyY, 4, 1, rim);
    } else if (mood === 'happy') {
      P(eyX, eyY + 1, 4, 1, '#1b1016');
      P(eyX + 1, eyY, 2, 1, '#1b1016');
    } else {
      P(eyX + 1, eyY + 1, 2, 2, '#1b1016');
    }
    if (!sleepy) P(eyX + 1, eyY, 1, 1, '#ffffff');
  }

  // mouthparts
  const flap = talking ? (Math.floor(t * 16) % 2) : 0;
  P(14, cy + 8 + flap, 4, 2, rim);
  P(13, cy + 8, 1, 2, shellLo);
  P(18, cy + 8, 1, 2, shellLo);

  if (mood === 'shock') {
    for (let i = 0; i < 4; i++) {
      const a = t * 6 + i * 1.6;
      P(16 + Math.cos(a) * 13, cy + 4 + Math.sin(a) * 9, 1, 1, '#ffe9a0');
    }
  }
  if (mood === 'sleepy') {
    const zt = (t * 0.6) % 3;
    P(24, cy - 8 - zt * 3, 2, 2, rgba('#cfe8f0', clamp01(1 - zt / 3)));
  }
}

PORTRAITS.crab = (ctx, w, t, mood, talking) => crabFace(ctx, w, t, mood, talking, 1);
PORTRAITS.crabbaby = (ctx, w, t, mood, talking) => crabFace(ctx, w, t, mood, talking, 0.62);

// --- the Last Nautilus -----------------------------------------------------
PORTRAITS.nautilus = (ctx, w, t, mood, talking) => {
  const s = w / 32;
  const cx = 0, cy = 0;
  const drift = Math.sin(t * 0.8) * s;
  ctx.save();
  ctx.translate(0, drift);
  // spiral shell
  pxBlob(ctx, cx - w * 0.08, cy - w * 0.05, w * 0.34, w * 0.32, '#e8dcc0', '#8a5a4a');
  ctx.fillStyle = '#c04a3c';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU * 1.7 + 0.4;
    pxLine(ctx, cx - w * 0.08, cy - w * 0.05,
      cx - w * 0.08 + Math.cos(a) * w * 0.3, cy - w * 0.05 + Math.sin(a) * w * 0.28, '#c04a3c', 1);
  }
  pxEllipse(ctx, cx - w * 0.08, cy - w * 0.05, w * 0.1, w * 0.09, '#fff6e2');
  // tentacle fringe
  for (let i = 0; i < 9; i++) {
    const a = -0.8 + (i / 8) * 1.9;
    const ln = w * (0.24 + Math.sin(t * 3 + i) * 0.04);
    pxLine(ctx, cx + w * 0.16, cy + w * 0.1,
      cx + w * 0.16 + Math.cos(a) * ln, cy + w * 0.1 + Math.sin(a) * ln, '#8a5a4a', 2);
  }
  // eye
  const ex = cx + w * 0.14, ey = cy + w * 0.02;
  pxEllipse(ctx, ex, ey, w * 0.09, w * 0.09, '#fff6e2');
  const blink = Math.sin(t * 0.4) > 0.97;
  if (!blink) pxEllipse(ctx, ex + w * 0.02, ey, w * 0.05, w * 0.05, '#1a1016');
  else { ctx.fillStyle = '#8a5a4a'; ctx.fillRect(R(ex - w * 0.09), R(ey), R(w * 0.18), 1); }
  ctx.restore();
};

// --- mirage jelly ----------------------------------------------------------
PORTRAITS.jelly = (ctx, w, t, mood, talking) => {
  const pulse = Math.sin(t * 1.5) * 0.1;
  ctx.globalAlpha = 0.85;
  pxEllipse(ctx, 0, -w * 0.08, w * (0.34 + pulse), w * (0.26 - pulse * 0.6), '#8fd8e8');
  pxEllipse(ctx, 0, -w * 0.1, w * 0.24, w * 0.17, '#d8f6ff');
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f0a0d8';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + t * 0.5;
    px(ctx, Math.cos(a) * w * 0.17, -w * 0.08 + Math.sin(a) * w * 0.12, '#f0a0d8', 1, 1);
  }
  for (let i = 0; i < 7; i++) {
    const bx = -w * 0.24 + (i / 6) * w * 0.48;
    for (let k = 0; k < 7; k++) {
      px(ctx, bx + Math.sin(t * 2 + i + k * 0.5) * 2, w * 0.08 + k * w * 0.05, rgba('#9fe8ff', 0.8), 1, 1);
    }
  }
};

export { PORTRAITS };
