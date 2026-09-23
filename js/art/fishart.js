// CRABDEN - fish, painted.
//
// The old fish were a teardrop of height field with a tail bitmap bolted on
// and swung about a pivot, which is the same mistake the people used to make:
// a rotated sprite is a shredded one. These are painted a pixel at a time
// from what a fish actually is, and each one is baked in four swim frames
// with its whole spine flexing - so it swims by changing frame, not by being
// turned, and every frame is as crisp as the first.
//
// What makes a fish read as a fish at forty pixels, in the order it matters:
//
//   the SILHOUETTE - blunt head, deepest a third of the way back, a narrow
//     wrist before the tail, and the right tail for the animal (forked for
//     the fast ones, round for the ones that sit, three-lobed for the one
//     that should be extinct);
//   COUNTERSHADING - dark back, silver side, pale belly, because that is how
//     every open-water fish on earth is coloured;
//   the EYE, big and ringed, with a catchlight in it;
//   the GILL COVER as a curved line behind it, and the LATERAL LINE running
//     down the flank;
//   SCALES, as a fine diamond lattice with the odd one catching the light;
//   and translucent FINS with their rays showing through.

import { makeCanvas } from '../render/pixel.js';
import { FISH_BY_ID } from '../data/fish.js';

export const FISH_FRAMES = 4;

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => (k >= 0 ? mix(c, [255, 250, 236], k) : mix(c, [8, 10, 16], -k));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const cache = new Map();

/** One frame of one fish, facing right. */
export function fishFrame(id, frame = 0, S = 1) {
  const key = `${id}:${frame % FISH_FRAMES}:${S}`;
  let v = cache.get(key);
  if (!v) { v = paint(FISH_BY_ID[id] || FISH_BY_ID.sardine, frame % FISH_FRAMES, S); cache.set(key, v); }
  return v;
}

function paint(def, frame, S) {
  const L = def.L * S, H = def.H * S;
  const tailLen = def.tail === 'lobe' ? 0.34 : 0.28;
  const finH = H * (def.lobed ? 0.34 : 0.42);
  const cw = Math.ceil(L * (1 + tailLen) + 6 * S + 6);
  const ch = Math.ceil(H * 1.05 + finH * 2 + 8 * S + 4);
  const cv = makeCanvas(cw, ch);
  const g = cv.getContext('2d');
  const img = g.createImageData(cw, ch);
  const D = img.data;

  const C = {
    back: hex(def.look.back), side: hex(def.look.side), belly: hex(def.look.belly),
    fin: hex(def.look.fin), acc: hex(def.look.accent),
  };
  const outline = mix(C.back, [6, 8, 12], 0.72);
  const xn = cw - 3 - S;                  // the nose
  const cy0 = ch / 2;
  const phase = (frame / FISH_FRAMES) * Math.PI * 2;
  const amp = H * 0.13;

  // the spine: nothing at the head, more and more toward the tail, and a
  // travelling wave down it - which is how a fish actually swims
  const spine = (u) => amp * Math.sin(phase - u * 2.4) * Math.pow(Math.max(0, u - 0.18), 1.5);
  // half the body's depth at u (0 nose, 1 the wrist in front of the tail)
  const half = (u) => {
    if (u < 0 || u > 1) return 0;
    // deepest a third of the way back, and the wrist in front of the tail
    // keeps about a third of that depth - a real peduncle, not a stalk
    const f = Math.sin(Math.PI * Math.pow(u, 0.55)) * (1 - 0.1 * u);
    return (H / 2) * Math.max(f, 0.34 * sstep((u - 0.35) / 0.65));
  };

  const col = new Array(cw * ch).fill(null);
  const alpha = new Float32Array(cw * ch);
  const kind = new Uint8Array(cw * ch);      // 1 body, 2 fin
  const put = (i, c, a, k) => { col[i] = c; alpha[i] = a; kind[i] = k; };

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      const xw = x + 0.5, yw = y + 0.5;
      const u = (xn - xw) / L;
      const cy = cy0 + spine(Math.max(0, u));
      const dy = yw - cy;
      const h = half(u);

      // ---- the body -------------------------------------------------------
      if (u >= 0 && u <= 1 && Math.abs(dy) <= h) {
        const d = dy / Math.max(0.5, h);          // -1 back .. +1 belly
        const t = (d + 1) / 2;
        let c = t < 0.46 ? mix(C.back, C.side, sstep(t / 0.46)) : mix(C.side, C.belly, sstep((t - 0.46) / 0.54));
        const px = Math.floor(x / S), py = Math.floor(y / S);
        // the marks on the flank
        switch (def.pattern) {
          case 'bars': {
            const b = Math.sin(u * Math.PI * (def.id === 'pupfish' ? 9 : 7) + 0.6);
            if (b > 0.55 && t < 0.78 && u > 0.2 && u < 0.95) c = mix(c, C.fin, 0.42);
            break;
          }
          case 'spots':
            if (Math.abs(t - 0.36) < 0.09 && u > 0.22 && u < 0.62 && Math.sin(u * 55) > 0.4) c = mix(c, C.acc, 0.8);
            break;
          case 'wavy':
            if (t < 0.46 && Math.sin(u * 46 + Math.sin(t * 11) * 2.2) > 0.25) c = mix(c, C.acc, 0.75);
            break;
          case 'scales':
            if ((px + py) % 4 === 0 || (px - py + 400) % 4 === 0) c = mix(c, C.fin, t > 0.6 ? 0.2 : 0.45);
            if (t < 0.25 && u > 0.1 && u < 0.3) c = mix(c, C.acc, 0.35);
            break;
          case 'mottle': {
            const m = hash(Math.floor(px / 3), Math.floor(py / 2), 7) * 0.6 + hash(px, py, 3) * 0.4;
            if (t < 0.8) c = m > 0.62 ? mix(c, C.acc, 0.55) : m < 0.22 ? shade(c, 0.12) : c;
            break;
          }
          case 'blotch':
            if (hash(Math.floor(px / 2), Math.floor(py / 2), 11) > 0.86 && t < 0.85 && u > 0.12) c = mix(c, C.acc, 0.75);
            break;
          default: break;
        }
        // scales: a fine lattice, and the odd one that catches the light
        if (def.pattern !== 'scales' && t > 0.15 && t < 0.8 && u > 0.22) {
          if ((px * 2 + py) % 4 === 0) c = shade(c, -0.08);
          if (t < 0.5 && hash(px, py, 5) > 0.93) c = shade(c, 0.28);
        }
        // the lateral line, running from the gill to the tail
        if (u > 0.26 && u < 0.96 && Math.abs(t - 0.44 - 0.04 * Math.sin(u * 5)) < 0.55 / Math.max(1, h) && px % 2 === 0) {
          c = shade(c, -0.22);
        }
        // the gill cover, a curved line behind the eye
        const gu = 0.235 + 0.05 * d * d;
        if (Math.abs(u - gu) < 0.55 / L && Math.abs(d) < 0.85) c = shade(c, -0.34);
        // the light comes from above: round the body with it, in whole steps
        const z = Math.sqrt(Math.max(0, 1 - d * d));
        let lit = -d * 0.26 + (z - 0.6) * 0.28;
        lit = Math.round(lit * 5) / 5;
        c = shade(c, lit * 0.5);
        // and a wet highlight along the upper flank
        if (t > 0.16 && t < 0.24 && u > 0.2 && u < 0.72) c = shade(c, 0.2);
        put(i, c, 1, 1);
        continue;
      }

      // ---- the tail ---------------------------------------------------------
      if (u > 1 && u <= 1 + tailLen) {
        const tt = (u - 1) / tailLen;
        let inside = false;
        const base = H * 0.08;
        if (def.tail === 'fork') {
          const hT = base + H * 0.62 * tt;
          const notch = tt > 0.35 ? hT * (tt - 0.35) * 1.3 : 0;
          inside = Math.abs(dy) <= hT && Math.abs(dy) >= notch;
        } else if (def.tail === 'round') {
          const hT = base + H * 0.5 * Math.sin(Math.min(1, tt * 1.15) * Math.PI * 0.62) * (tt > 0.8 ? Math.sqrt(1 - (tt - 0.8) / 0.2) : 1);
          inside = Math.abs(dy) <= hT;
        } else {
          // three lobes: two fleshy ones and a little one in the middle that
          // runs on past them - the oldest tail there is
          const hT = base + H * 0.52 * Math.sin(Math.min(1, tt * 1.3) * Math.PI * 0.55) * (tt > 0.72 ? Math.max(0, 1 - (tt - 0.72) / 0.28) : 1);
          inside = Math.abs(dy) <= hT || (Math.abs(dy) < H * 0.09 + (1 - tt) * H * 0.06);
        }
        if (inside) {
          let c = C.fin;
          // the rays, fanning out from the wrist
          const ang = Math.atan2(dy, (u - 1) * L + 2);
          if (Math.floor(ang * 9 + 20) % 2 === 0) c = shade(c, -0.18);
          if (tt > 0.85) c = shade(c, 0.12);
          put(i, c, 0.88, 2);
        }
        continue;
      }

      // ---- the fins ---------------------------------------------------------
      if (u > 0 && u < 1) {
        let fin = false;
        // dorsal: along the back, rising and then falling away
        const d0 = def.lobed ? 0.34 : 0.3, d1 = def.lobed ? 0.5 : 0.62;
        if (u > d0 && u < d1 && dy < 0) {
          const k = (u - d0) / (d1 - d0);
          const top = h + finH * Math.sin(Math.PI * Math.pow(k, 0.7)) * (def.lobed ? 0.9 : 0.8);
          if (-dy <= top) fin = true;
        }
        // a second dorsal on the old fish, and the fleshy lobe under the tail
        if (def.lobed && u > 0.68 && u < 0.84) {
          const k = (u - 0.68) / 0.16;
          const ext = h + finH * 0.7 * Math.sin(Math.PI * k);
          if (Math.abs(dy) <= ext) fin = true;
        }
        // anal fin, under the back half
        if (!def.lobed && u > 0.62 && u < 0.82 && dy > 0) {
          const k = (u - 0.62) / 0.2;
          if (dy <= h + finH * 0.55 * Math.sin(Math.PI * k)) fin = true;
        }
        // pelvic, a little one under the belly
        if (u > 0.36 && u < 0.46 && dy > 0) {
          const k = (u - 0.36) / 0.1;
          if (dy <= h + finH * 0.45 * Math.sin(Math.PI * k)) fin = true;
        }
        if (fin) {
          let c = C.fin;
          if (Math.floor(x / S) % 2 === 0) c = shade(c, -0.16);   // the rays
          put(i, c, 0.84, 2);
        }
      }
    }
  }

  // ---- the pectoral fin, over the body behind the gill ---------------------
  {
    const u0 = 0.3, cx = xn - u0 * L;
    const cy = cy0 + spine(u0) + half(u0) * 0.32;
    const rx = L * (def.lobed ? 0.12 : 0.09), ry = H * (def.lobed ? 0.16 : 0.13);
    const tilt = 0.5 + Math.sin(phase) * 0.15;
    for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) {
      for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
        if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
        const ex = x + 0.5 - cx, ey = y + 0.5 - cy;
        const rX = ex * Math.cos(tilt) + ey * Math.sin(tilt);
        const rY = -ex * Math.sin(tilt) + ey * Math.cos(tilt);
        const q = (rX / rx) ** 2 + (rY / ry) ** 2;
        if (q > 1) continue;
        const i = y * cw + x;
        // the old fish's fins have a fleshy, scaled base - they have bones in
        let c = def.lobed && q < 0.45 ? C.side : mix(C.fin, C.side, 0.45);
        if (Math.floor((rX + 20) / Math.max(1, S)) % 2 === 0) c = shade(c, -0.1);
        if (q > 0.7) c = shade(c, -0.12);
        col[i] = mix(col[i] || c, c, 0.62);
        alpha[i] = 1; kind[i] = 2;
      }
    }
  }

  // ---- the eye and the mouth ----------------------------------------------
  {
    const ue = 0.09;
    const ex = xn - ue * L, ey = cy0 + spine(ue) - half(ue) * 0.28;
    const r = Math.max(1.1, H * (def.lobed ? 0.11 : 0.14));
    for (let y = Math.floor(ey - r - 1); y <= ey + r + 1; y++) {
      for (let x = Math.floor(ex - r - 1); x <= ex + r + 1; x++) {
        if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
        const i = y * cw + x;
        const dd = Math.hypot(x + 0.5 - ex, y + 0.5 - ey);
        if (dd > r) continue;
        if (def.blind) { col[i] = shade(col[i] || C.side, -0.1); continue; }
        if (dd > r * 0.72) col[i] = mix(C.acc, [240, 200, 90], def.id === 'coelacanth' ? 0.2 : 0.55);
        else col[i] = [14, 12, 18];
        alpha[i] = 1; kind[i] = 1;
      }
    }
    if (!def.blind) {
      const cx2 = Math.round(ex + r * 0.25), cy2 = Math.round(ey - r * 0.35);
      if (cx2 >= 0 && cy2 >= 0 && cx2 < cw && cy2 < ch) col[cy2 * cw + cx2] = [255, 255, 255];
    }
    // the mouth: a short dark cut at the front, a pale beak on the parrot
    const my = Math.round(cy0 + spine(0.02) + half(0.05) * 0.25);
    for (let k = 0; k < Math.max(2, Math.round(2 * S)); k++) {
      const mx = Math.round(xn - 1 - k);
      if (mx < 0 || my < 0 || mx >= cw || my >= ch) continue;
      const i = my * cw + mx;
      if (!col[i]) continue;
      col[i] = def.beak ? [238, 232, 214] : shade(C.back, -0.55);
    }
  }

  // ---- outline, and out ----------------------------------------------------
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x, o = i * 4;
      const c = col[i];
      if (c) {
        D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = Math.round(255 * alpha[i]);
        continue;
      }
      const n = (x > 0 && col[i - 1]) || (x < cw - 1 && col[i + 1]) || (y > 0 && col[i - cw]) || (y < ch - 1 && col[i + cw]);
      if (n) {
        const k = (x > 0 && kind[i - 1] === 1) || (x < cw - 1 && kind[i + 1] === 1) || (y > 0 && kind[i - cw] === 1) || (y < ch - 1 && kind[i + cw] === 1);
        D[o] = outline[0]; D[o + 1] = outline[1]; D[o + 2] = outline[2]; D[o + 3] = k ? 235 : 150;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return { cv, ox: Math.round(xn - L * 0.45), oy: Math.round(cy0), L, H, w: cw, h: ch };
}
