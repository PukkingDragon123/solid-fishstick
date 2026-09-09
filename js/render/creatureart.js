// CRABDEN - procedural creature rendering.
// Each body plan is drawn from parameters, so a new species is a data entry
// rather than a sprite sheet. Everything animates off velocity and phase.

import { TAU, clamp01, wobble, shadeHex, rgba } from '../lib/math.js';
import {
  px, pxLine, pxEllipse, pxEllipseRot, pxBlob, ditherBlob, groundShadow, ik2, limb, taper,
  sparkle,
} from './sprites.js';
import { drawText } from '../lib/font.js';
const R = Math.round;

export function drawCreatureShadow(ctx, cam, weather, e) {
  if (e.dead && e.deathT > 1.2) return;
  const s = cam.worldToScreen(e.x, e.y);
  const sh = weather.shadow;
  const z = cam.zoom;
  const hover = e.sp.flying ? clamp01(e.z / 30) : 0;
  groundShadow(
    ctx,
    s.x + sh.x * z * (0.5 + hover),
    s.y + sh.y * z * (0.5 + hover),
    e.size * z * (0.8 - hover * 0.3),
    e.size * z * (0.42 - hover * 0.16),
    sh.strength * (0.5 - hover * 0.22)
  );
}

export function drawCreature(ctx, cam, game, e) {
  const z = cam.zoom;
  const s = cam.worldToScreen(e.x, e.y - e.z);
  const x = s.x, y = s.y;
  const size = e.size * z;
  const sp = e.sp;
  const flash = e.hurtFlash > 0.02 && (Math.floor(game.time * 20) % 2 === 0);
  const p = flash
    ? ['#ffffff', '#ffffff', '#ffd0d0', e.pal[3]]
    : e.pal;
  const dark = flash ? '#ffb0b0' : shadeHex(p[2], -0.35);

  ctx.save();
  if (e.dead) {
    ctx.globalAlpha = clamp01(1 - (e.deathT - 0.6) / 1.2);
    ctx.translate(0, Math.min(3, e.deathT * 4) * z);
  }
  if (sp.body?.translucent) ctx.globalAlpha *= 0.72;

  const fn = FORMS[sp.form] || FORMS.mammal;
  fn(ctx, cam, game, e, x, y, size, p, dark, z);

  ctx.restore();

  if (!e.dead) drawStatus(ctx, cam, game, e, x, y, size, z);
}

// ---------------------------------------------------------------------------

function drawStatus(ctx, cam, game, e, x, y, size, z) {
  // health bar when hurt
  if (e.hp < e.hpMax * 0.98) {
    const w = Math.max(8, Math.round(size * 1.6));
    const bx = R(x - w / 2), by = R(y - size * 2 - 4);
    ctx.fillStyle = 'rgba(20,12,10,0.75)';
    ctx.fillRect(bx - 1, by - 1, w + 2, 3);
    ctx.fillStyle = e.hostile ? '#d8503c' : '#7fd05a';
    ctx.fillRect(bx, by, Math.round(w * clamp01(e.hp / e.hpMax)), 1);
  }
  // alerted hostile
  if (e.hostile && (e.state === 'hunt' || e.state === 'attack') && Math.floor(game.time * 4) % 2 === 0) {
    drawText(ctx, '!', x, y - size * 2.6 - 8, { color: '#ff5a4a', align: 'center', outline: true, scale: 1 });
  }
  // companion work badge
  if (e.tamed && e.work && game.settings.showWorkIcons !== false) {
    const icon = WORK_ICON[e.work] || '*';
    const by = R(y - size * 2.2 - 9);
    ctx.fillStyle = 'rgba(24,18,12,0.75)';
    ctx.fillRect(R(x) - 4, by - 1, 9, 9);
    ctx.fillStyle = 'rgba(201,160,106,0.8)';
    ctx.fillRect(R(x) - 4, by - 1, 9, 1);
    ctx.fillRect(R(x) - 4, by + 7, 9, 1);
    drawText(ctx, icon, x, by + 1, { color: '#ffe9a0', align: 'center', scale: 1 });
  } else if (e.tamed && game.settings.showWorkIcons !== false) {
    px(ctx, x, y - size * 2.2 - 6, 'rgba(255,233,160,0.7)', 2, 2);
  }
  // taming prompt handled by HUD
  if (e.tamed && e.mood === 'happy' && game.time - (e._happyAt || 0) < 0) { /* reserved */ }
}

// Single capitals read far better than punctuation at 5px.
const WORK_ICON = {
  forage: 'F', seed: 'S', digwater: 'D', guard: 'G', pollinate: 'P',
  compost: 'C', scout: 'E', purify: 'U', refract: 'R', nightsee: 'N',
  till: 'T', rain: 'W', aquifer: 'A', haul: 'H',
};

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

function legsIK(ctx, cam, e, x, y, size, color, dark, z, hipSpread = 0.85, thick = 1) {
  if (!e.feet.length) return;
  for (const f of e.feet) {
    const fs = cam.worldToScreen(f.fx, f.fy);
    const fy = fs.y - (f.ground * 0.55 + f.fz) * z;
    const a = e.facing + f.side * (Math.PI / 2) + f.spread * -f.side;
    const hx = x + Math.cos(a) * size * hipSpread * 0.5;
    const hy = y + Math.sin(a) * size * hipSpread * 0.3;
    const len = Math.hypot(fs.x - hx, fy - hy);
    const seg = Math.max(len * 0.55, size * 0.5);
    const j = ik2(hx, hy, fs.x, fy, seg, seg, f.side);
    const w = Math.max(1, Math.round(z * thick * 0.8));
    limb(ctx, hx, hy, j.x, j.y, j.tx, j.ty, w + 1, w, color, dark);
  }
}

function wingPair(ctx, x, y, size, phase, color, dark, span = 1.9, thin = false) {
  const flap = Math.sin(phase);
  for (const side of [-1, 1]) {
    const wy = y - size * 0.25 + flap * size * 0.55;
    const wx = x + side * size * span * (0.55 + Math.abs(Math.cos(phase)) * 0.45);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(R(x), R(y - size * 0.3));
    ctx.quadraticCurveTo(R(x + side * size), R(wy - size * 0.7), R(wx), R(wy));
    ctx.quadraticCurveTo(R(x + side * size * 0.6), R(y + size * 0.2), R(x), R(y));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(R(x), R(y - size * 0.3));
    ctx.quadraticCurveTo(R(x + side * size * 0.9), R(wy - size * 0.6), R(wx - side), R(wy - 1));
    ctx.quadraticCurveTo(R(x + side * size * 0.55), R(y + size * 0.1), R(x), R(y - 1));
    ctx.closePath();
    ctx.fill();
  }
}

function tailCurve(ctx, x, y, len, facing, phase, w0, w1, color, dark, arch = 0) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = facing + Math.PI + Math.sin(phase + t * 2.4) * 0.32 * t;
    pts.push({
      x: x + Math.cos(a) * len * t,
      y: y + Math.sin(a) * len * t - arch * Math.sin(Math.PI * t) * len * 0.5,
    });
  }
  taper(ctx, pts, w0, w1, color, dark);
  return pts[pts.length - 1];
}

// ---------------------------------------------------------------------------
// body plans
// ---------------------------------------------------------------------------

const FORMS = {};

FORMS.bird = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const b = e.sp.body;
  const flying = e.z > 6;
  const bob = Math.sin(e.gait * 2) * size * 0.12;
  const by = y - bob;
  // legs
  if (!flying) {
    for (const side of [-1, 1]) {
      const hx = x + side * size * 0.28;
      const fy = y + size * (b.legLen ? b.legLen * 0.09 : 0.5) * 1.6;
      const step = Math.sin(e.gait * 3 + (side > 0 ? Math.PI : 0)) * size * 0.35;
      const fx2 = x + step;
      const j = ik2(hx, by + size * 0.3, fx2, fy, size * 0.55, size * 0.6, side);
      limb(ctx, hx, by + size * 0.3, j.x, j.y, j.tx, j.ty, 2, 1, p[2], dark);
      pxLine(ctx, j.tx, j.ty, j.tx + size * 0.25, j.ty, dark, 1);
    }
  }
  // tail
  const tailA = e.facing + Math.PI;
  const tl = size * (b.tail || 4) * 0.16;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(R(x), R(by));
  ctx.lineTo(R(x + Math.cos(tailA - 0.3) * tl), R(by + Math.sin(tailA - 0.3) * tl));
  ctx.lineTo(R(x + Math.cos(tailA + 0.3) * tl), R(by + Math.sin(tailA + 0.3) * tl));
  ctx.closePath();
  ctx.fill();
  // wings behind
  if (flying || e.state === 'flee') wingPair(ctx, x, by, size, e.wing, p[1], p[2], 1.7);
  // body
  ditherBlob(ctx, x, by, size * 0.85, size * 0.66, p[0], p[1], -0.5, -0.7);
  pxEllipseRot(ctx, x, by, size * 0.86, size * 0.67, 0, rgba(dark, 0.0));
  // neck + head
  const hd = e.facing;
  const neck = size * (b.neck ? b.neck * 0.07 : 0.55);
  const hx = x + Math.cos(hd) * neck;
  const hy = by + Math.sin(hd) * neck - size * (b.neck ? 0.9 : 0.45);
  pxLine(ctx, x, by - size * 0.2, hx, hy, p[2], Math.max(2, R(z * 1.2)));
  pxLine(ctx, x, by - size * 0.2, hx, hy, p[0], Math.max(1, R(z * 0.8)));
  pxBlob(ctx, hx, hy, size * 0.42, size * 0.38, p[0], dark);
  if (b.crest) {
    ctx.fillStyle = p[3];
    ctx.fillRect(R(hx - 1), R(hy - size * 0.7), 2, R(size * 0.35));
  }
  // beak
  const bl = size * (b.beak || 4) * 0.13;
  ctx.fillStyle = p[3];
  ctx.beginPath();
  ctx.moveTo(R(hx + Math.cos(hd) * size * 0.3), R(hy + Math.sin(hd) * size * 0.3 - 1));
  ctx.lineTo(R(hx + Math.cos(hd) * (size * 0.3 + bl)), R(hy + Math.sin(hd) * (size * 0.3 + bl)));
  ctx.lineTo(R(hx + Math.cos(hd) * size * 0.3), R(hy + Math.sin(hd) * size * 0.3 + 2));
  ctx.closePath();
  ctx.fill();
  // eye
  px(ctx, hx + Math.cos(hd) * size * 0.16, hy + Math.sin(hd) * size * 0.16 - size * 0.1, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
  if (e.sp.body.crystal) {
    for (let i = 0; i < 3; i++) sparkle(ctx, x + (i - 1) * size * 0.5, by - size * 0.4, 1, '#ffffff');
  }
};

FORMS.moth = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const flap = Math.sin(e.wing * 1.4);
  for (const side of [-1, 1]) {
    for (const pair of [0, 1]) {
      const w = size * (pair ? 0.8 : 1.15) * (0.45 + Math.abs(flap) * 0.75);
      const h = size * (pair ? 0.5 : 0.7);
      const ox = side * w * 0.7;
      const oy = pair ? size * 0.35 : -size * 0.1;
      pxEllipseRot(ctx, x + ox, y + oy, w, h, side * flap * 0.4, pair ? shadeHex(p[0], -0.15) : p[1]);
    }
  }
  // dusty body
  ditherBlob(ctx, x, y, size * 0.32, size * 0.62, p[2], p[0], -0.4, -0.6);
  // antennae
  ctx.fillStyle = p[3];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      px(ctx, x + side * (1 + i * 0.9), y - size * 0.6 - i * 1.1, p[3], 1, 1);
    }
  }
  px(ctx, x - 1, y - size * 0.45, '#241a20', 1, 1);
  px(ctx, x + 1, y - size * 0.45, '#241a20', 1, 1);
};

FORMS.beetle = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  legsIK(ctx, cam, e, x, y, size, p[2], dark, z, 0.9, 0.9);
  // carapace
  ditherBlob(ctx, x, y, size * 0.95, size * 0.8, p[0], p[1], -0.5, -0.7);
  // elytra split
  ctx.fillStyle = dark;
  const a = e.facing;
  ctx.save();
  ctx.translate(R(x), R(y));
  ctx.rotate(a);
  ctx.fillRect(-R(size * 0.9), 0, R(size * 1.8), 1);
  ctx.restore();
  // head + horn
  const hx = x + Math.cos(a) * size * 0.85;
  const hy = y + Math.sin(a) * size * 0.6;
  pxBlob(ctx, hx, hy, size * 0.34, size * 0.3, p[2], dark);
  if (e.sp.body.horn) {
    pxLine(ctx, hx, hy, hx + Math.cos(a) * size * 0.7, hy + Math.sin(a) * size * 0.5, p[3], Math.max(1, R(z)));
  }
  // if it is pushing a compost ball
  if (e.carrying === 'ball' || e.work === 'compost') {
    const bx = x + Math.cos(a) * size * 1.9;
    const by = y + Math.sin(a) * size * 1.3;
    pxBlob(ctx, bx, by, size * 0.7, size * 0.62, '#5a4632', '#2e2318');
    px(ctx, bx - 1, by - 1, '#7d6448', Math.max(1, R(z)), Math.max(1, R(z)));
  }
};

FORMS.mammal = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const b = e.sp.body;
  const a = e.facing;
  const bob = Math.sin(e.gait * 2.4) * size * 0.09;
  const by = y - bob;
  legsIK(ctx, cam, e, x, by, size, p[2], dark, z, 1.0, 1.0);
  // tail
  if (b.tail) {
    const tx = x - Math.cos(a) * size * 0.8;
    const ty = by - Math.sin(a) * size * 0.5;
    tailCurve(ctx, tx, ty, size * b.tail * 0.09, a, e.t * 3, Math.max(2, R(z * 1.4)), 1, p[0], dark, b.tail > 12 ? 0.5 : 0.2);
  }
  // body
  const rx = size * 0.95, ry = size * 0.66;
  pxEllipseRot(ctx, x, by, rx + 1, ry + 1, a, dark);
  ditherBlob(ctx, x, by, rx, ry, p[0], p[1], -Math.cos(a) * 0.4 - 0.3, -0.7);
  if (b.mane) {
    ctx.fillStyle = p[2];
    for (let i = -2; i <= 2; i++) {
      const mx = x + Math.cos(a + Math.PI / 2) * i * size * 0.22 + Math.cos(a) * size * 0.2;
      const my = by + Math.sin(a + Math.PI / 2) * i * size * 0.16 - size * 0.5;
      ctx.fillRect(R(mx), R(my), 1, R(size * 0.4));
    }
  }
  if (b.spikes) {
    ctx.fillStyle = p[3];
    for (let i = -2; i <= 2; i++) {
      const mx = x + Math.cos(a) * i * size * 0.3;
      const my = by + Math.sin(a) * i * size * 0.2 - size * 0.6;
      ctx.fillRect(R(mx), R(my), 1, 2);
    }
  }
  if (b.humps) {
    for (let i = 0; i < b.humps; i++) {
      const hx2 = x - Math.cos(a) * (i - 0.5) * size * 0.5;
      const hy2 = by - Math.sin(a) * (i - 0.5) * size * 0.35 - size * 0.45;
      pxBlob(ctx, hx2, hy2, size * 0.36, size * 0.3, p[1], dark);
    }
  }
  // head - deliberately oversized; a small head disappears at this scale
  const hx = x + Math.cos(a) * size * 1.05;
  const hy = by + Math.sin(a) * size * 0.68 - size * 0.24;
  pxBlob(ctx, hx, hy, size * 0.58, size * 0.5, p[1], dark);
  pxEllipse(ctx, hx - Math.cos(a) * size * 0.14, hy - size * 0.14, size * 0.36, size * 0.28, p[0]);
  // ears
  if (b.ears) {
    const el = size * b.ears * 0.11;
    for (const side of [-1, 1]) {
      const ea = a + side * 0.7;
      const ex = hx + Math.cos(ea) * size * 0.3;
      const ey = hy + Math.sin(ea) * size * 0.2 - size * 0.3;
      if (b.glassEars) {
        ctx.globalAlpha *= 0.75;
        pxEllipseRot(ctx, ex, ey - el * 0.4, size * 0.2, el * 0.55, ea, p[3]);
        ctx.globalAlpha /= 0.75;
        pxEllipseRot(ctx, ex, ey - el * 0.4, size * 0.12, el * 0.4, ea, p[1]);
      } else {
        pxEllipseRot(ctx, ex, ey - el * 0.35, size * 0.16, el * 0.5, ea, p[0]);
        pxEllipseRot(ctx, ex, ey - el * 0.35, size * 0.09, el * 0.32, ea, p[2]);
      }
    }
  }
  // snout / tusks
  const sx = hx + Math.cos(a) * size * 0.46;
  const sy = hy + Math.sin(a) * size * 0.34;
  pxEllipse(ctx, sx, sy, size * 0.26, size * 0.2, dark);
  pxEllipse(ctx, sx, sy - size * 0.05, size * 0.18, size * 0.13, p[1]);
  if (b.tusks) {
    ctx.fillStyle = '#e8e0cc';
    for (const side of [-1, 1]) {
      const ta = a + side * 0.35;
      pxLine(ctx, sx, sy, sx + Math.cos(ta) * size * 0.4, sy + Math.sin(ta) * size * 0.28 - size * 0.2, '#e8e0cc', Math.max(1, R(z)));
    }
  }
  if (b.claws) {
    ctx.fillStyle = '#ded2b8';
    for (const side of [-1, 1]) {
      px(ctx, x + Math.cos(a + side * 1.1) * size * 0.9, by + Math.sin(a + side * 1.1) * size * 0.6, '#ded2b8', Math.max(1, R(z)), Math.max(1, R(z)));
    }
  }
  // eyes, with a white so they read from a distance
  const eye = Math.max(1, R(z));
  for (const side of [-1, 1]) {
    const ea = a + side * 0.5;
    const ex = hx + Math.cos(ea) * size * 0.3;
    const ey = hy + Math.sin(ea) * size * 0.22 - size * 0.12;
    px(ctx, ex, ey, '#f2ead6', eye + 1, eye + 1);
    px(ctx, ex, ey, e.hostile ? p[3] : '#1a1016', eye, eye);
  }
  if (b.whisk) {
    ctx.fillStyle = rgba('#ffffff', 0.5);
    for (const side of [-1, 1]) pxLine(ctx, sx, sy, sx + Math.cos(a + side * 0.9) * size * 0.7, sy + Math.sin(a + side * 0.9) * size * 0.5, rgba('#ffffff', 0.45), 1);
  }
};

FORMS.lizard = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const b = e.sp.body;
  const a = e.facing;
  legsIK(ctx, cam, e, x, y, size, p[0], dark, z, 1.15, 0.9);
  // tail with a travelling wave
  const tx = x - Math.cos(a) * size * 0.8;
  const ty = y - Math.sin(a) * size * 0.5;
  tailCurve(ctx, tx, ty, size * b.tail * 0.1, a, e.t * 4 + e.gait, Math.max(2, R(z * 1.6)), 1, p[0], dark);
  // body
  pxEllipseRot(ctx, x, y, size * 0.85 + 1, size * 0.5 + 1, a, dark);
  ditherBlob(ctx, x, y, size * 0.85, size * 0.5, p[0], p[1], -0.4, -0.7);
  // stripes
  ctx.save();
  ctx.translate(R(x), R(y));
  ctx.rotate(a);
  ctx.fillStyle = shadeHex(p[0], -0.25);
  for (let i = -2; i <= 2; i++) ctx.fillRect(R(i * size * 0.3), -R(size * 0.4), 1, R(size * 0.8));
  ctx.restore();
  // head
  const hx = x + Math.cos(a) * size * 0.95;
  const hy = y + Math.sin(a) * size * 0.6;
  if (b.frill) {
    pxEllipseRot(ctx, hx, hy, size * 0.55, size * 0.5, a, p[3]);
  }
  pxEllipseRot(ctx, hx, hy, size * 0.42, size * 0.3, a, p[1]);
  px(ctx, hx + Math.cos(a + 0.7) * size * 0.2, hy + Math.sin(a + 0.7) * size * 0.14, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
  px(ctx, hx + Math.cos(a - 0.7) * size * 0.2, hy + Math.sin(a - 0.7) * size * 0.14, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
};

FORMS.crustacean = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  legsIK(ctx, cam, e, x, y, size, p[2], dark, z, 1.05, 0.8);
  // segmented back
  for (let i = 2; i >= -2; i--) {
    const sx = x - Math.cos(a) * i * size * 0.3;
    const sy = y - Math.sin(a) * i * size * 0.2;
    const w = size * (0.85 - Math.abs(i) * 0.11);
    pxEllipseRot(ctx, sx, sy, w + 1, w * 0.62 + 1, a, dark);
    pxEllipseRot(ctx, sx, sy, w, w * 0.62, a, i % 2 ? p[0] : p[1]);
  }
  // antennae
  if (e.sp.body.antennae) {
    for (const side of [-1, 1]) {
      const aa = a + side * 0.5 + wobble(e.t * 2 + side) * 0.25;
      pxLine(ctx, x + Math.cos(a) * size * 0.7, y + Math.sin(a) * size * 0.45,
        x + Math.cos(a) * size * 0.7 + Math.cos(aa) * size * 1.1,
        y + Math.sin(a) * size * 0.45 + Math.sin(aa) * size * 0.8, p[2], 1);
    }
  }
  px(ctx, x + Math.cos(a + 0.5) * size * 0.7, y + Math.sin(a + 0.5) * size * 0.45, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
  px(ctx, x + Math.cos(a - 0.5) * size * 0.7, y + Math.sin(a - 0.5) * size * 0.45, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
};

FORMS.mantis = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  legsIK(ctx, cam, e, x, y, size, p[2], dark, z, 1.0, 0.8);
  // abdomen
  const ax2 = x - Math.cos(a) * size * 0.7;
  const ay2 = y - Math.sin(a) * size * 0.45;
  pxEllipseRot(ctx, ax2, ay2, size * 0.75, size * 0.4, a, p[0]);
  // thorax
  pxEllipseRot(ctx, x, y, size * 0.45, size * 0.3, a, p[1]);
  // raptorial arms
  const swing = e.state === 'attack' ? Math.sin(e.t * 18) * 0.6 : Math.sin(e.t * 2) * 0.15;
  for (const side of [-1, 1]) {
    const sh = { x: x + Math.cos(a + side * 0.7) * size * 0.4, y: y + Math.sin(a + side * 0.7) * size * 0.28 };
    const ta = a + side * (0.5 + swing);
    const tip = { x: sh.x + Math.cos(ta) * size * 1.1, y: sh.y + Math.sin(ta) * size * 0.8 };
    const j = ik2(sh.x, sh.y, tip.x, tip.y, size * 0.62, size * 0.66, side);
    limb(ctx, sh.x, sh.y, j.x, j.y, j.tx, j.ty, Math.max(2, R(z)), Math.max(1, R(z)), p[1], dark);
  }
  // triangular head
  const hx = x + Math.cos(a) * size * 0.6;
  const hy = y + Math.sin(a) * size * 0.4;
  ctx.fillStyle = p[1];
  ctx.beginPath();
  ctx.moveTo(R(hx + Math.cos(a) * size * 0.4), R(hy + Math.sin(a) * size * 0.3));
  ctx.lineTo(R(hx + Math.cos(a + 2.3) * size * 0.4), R(hy + Math.sin(a + 2.3) * size * 0.3));
  ctx.lineTo(R(hx + Math.cos(a - 2.3) * size * 0.4), R(hy + Math.sin(a - 2.3) * size * 0.3));
  ctx.closePath();
  ctx.fill();
  px(ctx, hx + Math.cos(a + 0.8) * size * 0.28, hy + Math.sin(a + 0.8) * size * 0.2, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
  px(ctx, hx + Math.cos(a - 0.8) * size * 0.28, hy + Math.sin(a - 0.8) * size * 0.2, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
  if (e.sp.body.crystal) for (let i = 0; i < 2; i++) sparkle(ctx, ax2 + (i - 0.5) * size * 0.5, ay2 - size * 0.2, 1, '#ffffff');
};

FORMS.bat = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const flap = Math.sin(e.wing);
  for (const side of [-1, 1]) {
    const span = size * 2.1 * (0.4 + Math.abs(Math.cos(e.wing)) * 0.75);
    const tipY = y - size * 0.3 + flap * size * 0.9;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(R(x), R(y - size * 0.2));
    ctx.lineTo(R(x + side * span), R(tipY));
    ctx.lineTo(R(x + side * span * 0.75), R(tipY + size * 0.55));
    ctx.lineTo(R(x + side * span * 0.42), R(y + size * 0.35));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(p[1], 0.55);
    ctx.beginPath();
    ctx.moveTo(R(x), R(y - size * 0.15));
    ctx.lineTo(R(x + side * span * 0.9), R(tipY + 1));
    ctx.lineTo(R(x + side * span * 0.4), R(y + size * 0.25));
    ctx.closePath();
    ctx.fill();
  }
  pxBlob(ctx, x, y, size * 0.4, size * 0.5, p[0], dark);
  // glowing ribs
  ctx.fillStyle = p[3];
  for (let i = -1; i <= 1; i++) ctx.fillRect(R(x - size * 0.25), R(y + i * 2), R(size * 0.5), 1);
  for (const side of [-1, 1]) {
    ctx.fillStyle = p[0];
    ctx.beginPath();
    ctx.moveTo(R(x + side * size * 0.2), R(y - size * 0.4));
    ctx.lineTo(R(x + side * size * 0.35), R(y - size * 0.95));
    ctx.lineTo(R(x + side * size * 0.05), R(y - size * 0.5));
    ctx.closePath();
    ctx.fill();
  }
  px(ctx, x - 1, y - size * 0.2, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
  px(ctx, x + 1, y - size * 0.2, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
};

FORMS.snail = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  // foot
  pxEllipseRot(ctx, x, y + size * 0.2, size * 1.0, size * 0.4, a, p[1]);
  // spiral shell
  pxBlob(ctx, x - Math.cos(a) * size * 0.2, y - size * 0.3, size * 0.8, size * 0.75, p[0], dark);
  ctx.fillStyle = dark;
  for (let i = 0; i < 22; i++) {
    const t = i / 22;
    const ang = t * TAU * 2.1 + e.t * 0.05;
    const rr = size * 0.72 * (1 - t);
    px(ctx, x - Math.cos(a) * size * 0.2 + Math.cos(ang) * rr, y - size * 0.3 + Math.sin(ang) * rr * 0.92, dark, 1, 1);
  }
  // head + eyestalks
  const hx = x + Math.cos(a) * size * 0.9;
  const hy = y + Math.sin(a) * size * 0.55 + size * 0.1;
  pxEllipseRot(ctx, hx, hy, size * 0.3, size * 0.22, a, p[1]);
  for (const side of [-1, 1]) {
    const sa = a + side * 0.35;
    const ex = hx + Math.cos(sa) * size * 0.4;
    const ey = hy + Math.sin(sa) * size * 0.3 - size * 0.5 - Math.sin(e.t * 1.4 + side) * 1.5;
    pxLine(ctx, hx, hy, ex, ey, p[1], Math.max(1, R(z)));
    px(ctx, ex, ey, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
  }
  // fertile slime trail
  if (e.work === 'till' || e.tamed) {
    ctx.fillStyle = rgba(p[3], 0.28);
    ctx.fillRect(R(x - Math.cos(a) * size * 1.8), R(y + size * 0.35), R(size * 1.4), 1);
  }
};

FORMS.tortoise = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  legsIK(ctx, cam, e, x, y, size, p[2], dark, z, 1.15, 2.2);
  // dome shell
  pxBlob(ctx, x, y - size * 0.25, size * 1.25, size * 0.95, p[0], dark);
  ditherBlob(ctx, x, y - size * 0.3, size * 1.15, size * 0.85, p[0], p[1], -0.5, -0.8);
  // scutes
  ctx.fillStyle = dark;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU;
    px(ctx, x + Math.cos(ang) * size * 0.7, y - size * 0.3 + Math.sin(ang) * size * 0.5, dark, Math.max(1, R(z)), Math.max(1, R(z)));
  }
  // a whole little ecosystem living up there
  ctx.fillStyle = p[3];
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * TAU + e.id;
    const rx2 = x + Math.cos(ang) * size * 0.75;
    const ry2 = y - size * 0.55 + Math.sin(ang) * size * 0.4;
    ctx.fillRect(R(rx2), R(ry2 - size * 0.2), Math.max(1, R(z)), R(size * 0.22));
    px(ctx, rx2, ry2 - size * 0.28, '#8fd47a', Math.max(1, R(z)), Math.max(1, R(z)));
  }
  // neck + head
  const nl = size * (e.sp.body.neck || 10) * 0.055;
  const hx = x + Math.cos(a) * (size * 1.1 + nl);
  const hy = y + Math.sin(a) * (size * 0.7 + nl * 0.6);
  pxLine(ctx, x + Math.cos(a) * size * 0.9, y + Math.sin(a) * size * 0.55, hx, hy, p[2], Math.max(2, R(z * 2)));
  pxBlob(ctx, hx, hy, size * 0.32, size * 0.26, p[1], dark);
  px(ctx, hx + Math.cos(a + 0.6) * size * 0.16, hy + Math.sin(a + 0.6) * size * 0.12, '#1a1016', Math.max(1, R(z)), Math.max(1, R(z)));
};

FORMS.jelly = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const pulse = Math.sin(e.t * 1.6) * 0.16;
  const rx = size * (0.95 + pulse), ry = size * (0.72 - pulse * 0.6);
  // tentacles first
  const n = e.sp.body.tentacles || 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const tx = x + t * rx * 1.5;
    const pts = [];
    for (let k = 0; k <= 5; k++) {
      const kk = k / 5;
      pts.push({
        x: tx + Math.sin(e.t * 2 + i + kk * 3) * size * 0.28 * kk,
        y: y + ry * 0.5 + kk * size * 1.5,
      });
    }
    taper(ctx, pts, Math.max(1, R(z)), 1, rgba(p[0], 0.8), null);
  }
  // bell
  ctx.globalAlpha *= 0.8;
  pxEllipse(ctx, x, y, rx + 1, ry + 1, p[2]);
  pxEllipse(ctx, x, y, rx, ry, p[0]);
  pxEllipse(ctx, x, y - ry * 0.25, rx * 0.7, ry * 0.55, p[1]);
  ctx.globalAlpha /= 0.8;
  // internal glow ring
  ctx.fillStyle = p[3];
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * TAU + e.t * 0.4;
    px(ctx, x + Math.cos(ang) * rx * 0.55, y + Math.sin(ang) * ry * 0.5, p[3], 1, 1);
  }
};

FORMS.nautilus = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  // tentacle walk
  const n = e.sp.body.tentacles || 8;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    const ang = a + t * 1.5;
    const ln = size * (0.9 + Math.sin(e.t * 3 + i) * 0.2);
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const kk = k / 4;
      pts.push({
        x: x + Math.cos(ang) * ln * kk * 1.2,
        y: y + Math.sin(ang) * ln * kk * 0.8 + Math.sin(e.t * 4 + i + kk * 2) * 1.5 * kk,
      });
    }
    taper(ctx, pts, Math.max(2, R(z * 1.2)), 1, p[2], dark);
  }
  // spiral shell
  const sx = x - Math.cos(a) * size * 0.5;
  const sy = y - Math.sin(a) * size * 0.35 - size * 0.2;
  pxBlob(ctx, sx, sy, size * 0.95, size * 0.9, p[0], dark);
  ctx.fillStyle = p[3];
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * TAU * 1.6 + 0.6;
    pxLine(ctx, sx, sy, sx + Math.cos(ang) * size * 0.85, sy + Math.sin(ang) * size * 0.8, p[3], 1);
  }
  pxEllipse(ctx, sx, sy, size * 0.3, size * 0.28, p[1]);
  // eye
  const hx = x + Math.cos(a) * size * 0.4;
  const hy = y + Math.sin(a) * size * 0.3;
  px(ctx, hx, hy, '#1a1016', Math.max(2, R(z * 1.4)), Math.max(2, R(z * 1.4)));
  px(ctx, hx, hy, '#f0e6d0', Math.max(1, R(z * 0.6)), Math.max(1, R(z * 0.6)));
};

FORMS.mite = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  ctx.fillStyle = dark;
  for (let i = 0; i < 8; i++) {
    const ang = a + (i / 8) * TAU + Math.sin(e.t * 14 + i) * 0.3;
    pxLine(ctx, x, y, x + Math.cos(ang) * size * 1.3, y + Math.sin(ang) * size * 0.9, dark, 1);
  }
  pxBlob(ctx, x, y, size * 0.75, size * 0.62, p[0], dark);
  px(ctx, x + Math.cos(a) * size * 0.4, y + Math.sin(a) * size * 0.3, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
};

FORMS.arachnid = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  const b = e.sp.body;
  legsIK(ctx, cam, e, x, y, size, p[0], dark, z, 1.1, 0.85);
  // abdomen / tail
  if (b.stinger) {
    const segs = 5;
    let px2 = x - Math.cos(a) * size * 0.6;
    let py2 = y - Math.sin(a) * size * 0.4;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const arch = Math.sin(t * Math.PI * 0.8) * size * 1.4;
      const ang = a + Math.PI + Math.sin(e.t * 2) * 0.12;
      px2 += Math.cos(ang) * size * 0.36;
      py2 += Math.sin(ang) * size * 0.24 - arch * 0.16;
      pxBlob(ctx, px2, py2, size * (0.3 - t * 0.09), size * (0.28 - t * 0.08), p[1], dark);
    }
    // stinger
    ctx.fillStyle = p[3];
    ctx.beginPath();
    ctx.moveTo(R(px2), R(py2 - size * 0.2));
    ctx.lineTo(R(px2 + Math.cos(a) * size * 0.5), R(py2 + size * 0.25));
    ctx.lineTo(R(px2 - size * 0.2), R(py2 + size * 0.2));
    ctx.closePath();
    ctx.fill();
  } else {
    pxEllipseRot(ctx, x - Math.cos(a) * size * 0.7, y - Math.sin(a) * size * 0.45, size * 0.7, size * 0.55, a, p[1]);
  }
  // cephalothorax
  ditherBlob(ctx, x, y, size * 0.72, size * 0.55, p[0], p[1], -0.4, -0.7);
  // pincers or jaws
  const reach = size * ((b.claws || b.jaws || 4) * 0.13);
  const snap = e.state === 'attack' ? Math.abs(Math.sin(e.t * 16)) * 0.5 : 0.18;
  for (const side of [-1, 1]) {
    const sa = a + side * 0.55;
    const cx2 = x + Math.cos(sa) * size * 0.8;
    const cy2 = y + Math.sin(sa) * size * 0.55;
    pxLine(ctx, x, y, cx2, cy2, p[0], Math.max(1, R(z)));
    if (b.claws) {
      pxBlob(ctx, cx2 + Math.cos(a) * reach * 0.5, cy2 + Math.sin(a) * reach * 0.4, reach * 0.5, reach * 0.34, p[1], dark);
      for (const sg of [-1, 1]) {
        const ta = a + sg * snap;
        pxLine(ctx, cx2 + Math.cos(a) * reach * 0.5, cy2 + Math.sin(a) * reach * 0.4,
          cx2 + Math.cos(a) * reach * 0.5 + Math.cos(ta) * reach * 0.7,
          cy2 + Math.sin(a) * reach * 0.4 + Math.sin(ta) * reach * 0.5, dark, 1);
      }
    } else {
      pxLine(ctx, cx2, cy2, cx2 + Math.cos(a + side * snap) * reach, cy2 + Math.sin(a + side * snap) * reach * 0.7, p[3], Math.max(1, R(z)));
    }
  }
  // eyes
  for (const side of [-1, 1]) {
    px(ctx, x + Math.cos(a + side * 0.35) * size * 0.42, y + Math.sin(a + side * 0.35) * size * 0.3, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
  }
};

FORMS.leviathan = (ctx, cam, game, e, x, y, size, p, dark, z) => {
  const a = e.facing;
  const sway = Math.sin(e.t * 0.8) * 0.2;
  // tail
  tailCurve(ctx, x - Math.cos(a) * size * 0.9, y - Math.sin(a) * size * 0.6, size * 2.2, a, e.t * 1.2, Math.max(3, R(z * 3)), 2, p[0], dark);
  // ribcage
  const ribs = e.sp.body.ribs || 8;
  for (let i = 0; i < ribs; i++) {
    const t = i / (ribs - 1);
    const rx2 = x - Math.cos(a) * (t - 0.4) * size * 1.8;
    const ry2 = y - Math.sin(a) * (t - 0.4) * size * 1.2;
    const h = size * (0.9 - Math.abs(t - 0.45) * 1.1);
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const kk = k / 4;
        const ang = a + side * (Math.PI / 2) * (0.3 + kk * 0.8) + sway * side;
        pts.push({ x: rx2 + Math.cos(ang) * h * kk * 1.4, y: ry2 + Math.sin(ang) * h * kk - h * kk * 0.9 });
      }
      taper(ctx, pts, Math.max(2, R(z * 1.6)), 1, p[1], dark);
    }
  }
  // spine
  pxEllipseRot(ctx, x, y, size * 1.7, size * 0.42, a, p[0]);
  // skull + jaw
  const hx = x + Math.cos(a) * size * 1.7;
  const hy = y + Math.sin(a) * size * 1.1;
  pxEllipseRot(ctx, hx, hy, size * 0.9, size * 0.55, a, p[1]);
  const jawOpen = e.state === 'attack' ? 0.5 : 0.16;
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(R(hx), R(hy));
  ctx.lineTo(R(hx + Math.cos(a + jawOpen) * size * 1.5), R(hy + Math.sin(a + jawOpen) * size * 1.0));
  ctx.lineTo(R(hx + Math.cos(a - jawOpen) * size * 1.5), R(hy + Math.sin(a - jawOpen) * size * 1.0));
  ctx.closePath();
  ctx.fill();
  // whatever is glowing inside it
  for (let i = 0; i < 5; i++) {
    const ang = e.t * 0.7 + i;
    px(ctx, x + Math.cos(ang) * size * 0.9, y + Math.sin(ang) * size * 0.4, p[3], Math.max(1, R(z)), Math.max(1, R(z)));
  }
};

export { FORMS };
