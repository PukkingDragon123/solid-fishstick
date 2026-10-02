// CRABDEN - the lens. Everything that happens to the frame after the world
// has been painted and lit: the grade of the hour, the sun leaning on the
// air, shafts of light through the dust, glow off the bright things, the
// frame closing in at the edges, and the storm.
//
// The rule is the same as everywhere else in the game: square pixels. Glow
// and shafts are worked out at a quarter of the frame, where they are cheap,
// then laid back over the top through an ordered dither so they arrive as
// the same Bayer-broken bands the sky is made of, not as a smooth smear.
//
// And a frame-rate governor, because a phone that cannot hold its frame rate
// should lose the shafts before it loses the game. Quality 2 is everything,
// 1 drops the shafts and the dither, 0 keeps only the grade (a few flat
// fills), the sun's wash (one draw) and the vignette.
//
// Pin it from the console or the URL: renderer.fxQuality = 0..2, ?fx=0..2,
// or localStorage 'crabden.fx'.

import { clamp, clamp01, lerp, mixHex, smoothstep } from '../lib/math.js';
import { goldenHour } from './sky.js';
import { bakeDisc } from './light.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// -- the grade of the hour ---------------------------------------------------
//
//   tint   soft-light wash: warm gold by day, rose at the ends, blue at night
//   tone   a 'color' blend: night takes the colour out and puts moonlight in
//   lift   what black is: navy at night, plum at dusk, warm brown by day
//   wash   the sun leaning on the air near it, screened
//   sat    how much colour the heat bleaches out at midday (saturation blend)
//   vig    vignette colour and strength
const GRADE = [
  //  hour  tint       tA    tone       oA    lift       lA    wash       wA    sat   vig        vA
  [0.0, '#4058a0', 0.22, '#4a5a84', 0.20, '#060c20', 0.50, '#8aa4e0', 0.12, 0.00, '#01030c', 0.66],
  [4.6, '#4058a0', 0.22, '#4a5a84', 0.18, '#060c20', 0.50, '#8aa4e0', 0.12, 0.00, '#01030c', 0.64],
  [5.4, '#7460a0', 0.16, '#5a5488', 0.08, '#0e0a1c', 0.42, '#ff9a80', 0.10, 0.00, '#0a0414', 0.58],
  [6.2, '#ff9868', 0.26, '#000000', 0.00, '#140a10', 0.32, '#ffa878', 0.44, 0.00, '#1c0a10', 0.52],
  [8.0, '#ffd090', 0.16, '#000000', 0.00, '#0c0806', 0.20, '#ffe4b0', 0.16, 0.00, '#22120a', 0.46],
  [12.0, '#fff0d4', 0.08, '#000000', 0.00, '#0a0806', 0.16, '#fff6dc', 0.06, 0.08, '#2a160c', 0.40],
  [15.5, '#ffd8a0', 0.12, '#000000', 0.00, '#0c0806', 0.20, '#ffe6b0', 0.12, 0.04, '#2a140a', 0.44],
  [17.5, '#ffac60', 0.22, '#000000', 0.00, '#120808', 0.26, '#ffc078', 0.32, 0.00, '#2a100a', 0.48],
  [18.7, '#ff7a4a', 0.28, '#000000', 0.00, '#180a12', 0.34, '#ff9058', 0.46, 0.00, '#22060c', 0.54],
  [19.7, '#8a5aa0', 0.22, '#5a5088', 0.10, '#100a22', 0.44, '#c06a80', 0.10, 0.00, '#0a0418', 0.60],
  [21.0, '#4058a0', 0.22, '#4a5a84', 0.18, '#060c20', 0.50, '#8aa4e0', 0.12, 0.00, '#01030c', 0.66],
  [24.0, '#4058a0', 0.22, '#4a5a84', 0.20, '#060c20', 0.50, '#8aa4e0', 0.12, 0.00, '#01030c', 0.66],
];

export function gradeAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < GRADE.length - 2 && h > GRADE[i + 1][0]) i++;
  const a = GRADE[i], b = GRADE[i + 1];
  const t = smoothstep(clamp01((h - a[0]) / (b[0] - a[0])));
  const m = (j) => mixHex(a[j], b[j], t);
  const n = (j) => lerp(a[j], b[j], t);
  // a tone with no strength at one end should not drag its colour through black
  const tone = a[4] < 0.01 ? b[3] : b[4] < 0.01 ? a[3] : m(3);
  return {
    tint: m(1), tA: n(2), tone, oA: n(4), lift: m(5), lA: n(6),
    wash: m(7), wA: n(8), sat: n(9), vig: m(10), vA: n(11),
  };
}

// -- feature probes ------------------------------------------------------------

let _caps = null;
/** What this browser's canvas can do, found out once. */
export function caps() {
  if (_caps) return _caps;
  _caps = { filter: false, quant: false };
  try {
    const c = canvas(2, 1).getContext('2d');
    c.filter = 'blur(1px)';
    _caps.filter = c.filter === 'blur(1px)';
  } catch (e) { /* no filters */ }
  if (_caps.filter) _caps.quant = installQuant();
  return _caps;
}

const QN = 15;  // dither levels for the glow
const GRAIN = 2; // the glow's dither, in frame pixels
/**
 * An SVG filter that posterises each channel into QN flat steps. With a
 * Bayer matrix added to the image first, posterising is ordered dithering -
 * the one operation a 2D canvas cannot do on its own without reading pixels.
 */
function installQuant() {
  try {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    const vals = [];
    for (let i = 0; i <= QN; i++) vals.push((i / QN).toFixed(4));
    const tv = vals.join(' ');
    svg.innerHTML = `<filter id="crabden-quant" x="0" y="0" width="100%" height="100%"
      filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="${tv}"/>
        <feFuncG type="discrete" tableValues="${tv}"/>
        <feFuncB type="discrete" tableValues="${tv}"/>
      </feComponentTransfer></filter>`;
    document.body.appendChild(svg);
    // prove it: a mid grey has to come out on a step
    const a = canvas(4, 1), b = canvas(4, 1);
    const ga = a.getContext('2d'), gb = b.getContext('2d', { willReadFrequently: true });
    ga.fillStyle = 'rgb(128,128,128)'; ga.fillRect(0, 0, 4, 1);
    gb.filter = 'url(#crabden-quant)';
    gb.drawImage(a, 0, 0);
    gb.filter = 'none';
    const v = gb.getImageData(1, 0, 1, 1).data[0];
    const step = Math.round(Math.floor(128 / 255 * (QN + 1)) / QN * 255);
    if (Math.abs(v - step) <= 3 && v !== 128) return true;
    svg.remove();
  } catch (e) { /* fall back to a smooth glow */ }
  return false;
}

// -- the governor ----------------------------------------------------------------

export class Governor {
  constructor() {
    this.q = 2;
    this.max = 2;
    this.force = null;
    this._bad = 0;
    this._good = 0;
    this._drops = 0;
    this._warm = 0;
    try {
      const u = new URLSearchParams(location.search).get('fx');
      const s = u ?? localStorage.getItem('crabden.fx');
      if (s != null && s !== '' && !isNaN(+s)) this.force = clamp(Math.round(+s), 0, 2);
    } catch (e) { /* no storage */ }
  }

  get level() { return this.force ?? this.q; }

  /** Fed the real frame time every update. */
  tick(dt) {
    if (!(dt > 0) || dt > 0.25) return;      // a stalled tab says nothing
    this._warm += dt;
    if (this._warm < 3) return;              // the first seconds are all loading
    this._avg = this._avg ? this._avg * 0.93 + dt * 0.07 : dt;
    if (this._avg > 1 / 42) {
      this._bad += dt; this._good = 0;
      if (this._bad > 2.5 && this.q > 0) { this.q--; this._drops++; this._bad = 0; this._avg = 1 / 60; }
    } else if (this._avg < 1 / 57) {
      this._good += dt; this._bad = Math.max(0, this._bad - dt);
      // try the better passes again now and then, but give up on a device
      // that keeps proving it cannot carry them
      if (this._good > 12 && this.q < this.max && this._drops < 3) { this.q++; this._good = 0; }
    } else {
      this._bad = Math.max(0, this._bad - dt * 0.5);
    }
  }
}

// -- the lens ----------------------------------------------------------------------

export class Post {
  constructor(r) {
    this.r = r;
    this.gov = new Governor();
    this.caps = caps();
    this._size = '';
    this.strike = { t: 9, prev: 0, env: 0 };
    this.stats = { bloom: 0, rays: 0, q: 2 };
    this.off = {};    // passes switched off by hand, for profiling
  }

  _ensure(vw, vh) {
    const key = vw + 'x' + vh;
    if (key === this._size) return;
    this._size = key;
    const bw = Math.max(8, Math.ceil(vw / 4)), bh = Math.max(8, Math.ceil(vh / 4));
    this.bw = bw; this.bh = bh;
    this.qa = canvas(bw, bh); this.qb = canvas(bw, bh); this.qr = canvas(bw, bh);
    this.ew = Math.max(4, Math.ceil(bw / 2)); this.eh = Math.max(4, Math.ceil(bh / 2));
    this.qe = canvas(this.ew, this.eh);
    this.hw = Math.ceil(vw / GRAIN); this.hh = Math.ceil(vh / GRAIN);
    this.glow = canvas(this.hw, this.hh); this.glowQ = canvas(this.hw, this.hh);
    this.vigMask = null; this.vigTint = null; this._vigKey = '';
    this._washSpr = null;
    this._bayer = null;
  }

  /** The lightning envelope: a strike is three flickers, not one fade. */
  updateStrike(dt, weather) {
    const S = this.strike;
    const f = weather.lightningFlash || 0;
    if (f - S.prev > 0.3) S.t = 0;   // a rise, however slow the frame that saw it
    S.prev = f;
    S.t += dt;
    const t = S.t;
    let e = 0;
    if (t < 0.05) e = 1;
    else if (t < 0.10) e = 0.2;
    else if (t < 0.16) e = 0.8;
    else if (t < 0.21) e = 0.15;
    else if (t < 1.2) e = 0.55 * Math.exp(-(t - 0.21) * 5.5);
    S.env = e;
  }

  /** Raise the light layer: the whole world, lit cold for a moment. */
  strikeLight(l, vw, vh, horizon) {
    const e = this.strike.env;
    if (e < 0.01) return;
    // the ground takes the full flash; the sky less, or the bolt in it is
    // white on white
    const H = clamp(horizon ?? vh * 0.5, 0, vh);
    const g = l.createLinearGradient(0, H - 40, 0, H + 16);
    g.addColorStop(0, 'rgba(184,196,236,0.42)');
    g.addColorStop(1, 'rgba(184,196,236,0.85)');
    l.fillStyle = g;
    l.globalAlpha = e;
    l.fillRect(0, 0, vw, vh);
    l.globalAlpha = 1;
  }

  /**
   * Everything between the lit world and the vignette. `info` carries what
   * the renderer gathered from the game: the sun, the horizon, how wet.
   */
  apply(s, weather, info) {
    const vw = this.r.vw, vh = this.r.vh;
    this._ensure(vw, vh);
    const q = this.gov.level;
    this.stats.q = q;
    const dry = 1 - clamp01(info.wet);
    const G = gradeAt(weather.hour ?? 12);
    this.G = G;

    // weather takes colour out: storms go slate, sand goes ochre
    const storm = clamp01(((weather.cloudCover || 0) - 0.5) / 0.4);
    const sand = clamp01(weather.sand || 0);

    if (dry > 0.02 && !this.off.grade) this._grade(s, vw, vh, G, dry, storm, sand, weather);

    // the sun leaning on the air around it
    const sun = info.sun;
    const gold = goldenHour(weather.hour ?? 12).w;
    // (or at night the moon, much more gently, in its own cold colour)
    const lamp = sun || (info.moon && { x: info.moon.x, y: info.moon.y, low: 0, vis: info.moon.vis });
    if (!this.off.wash && lamp && lamp.vis > 0.05 && dry > 0.05 && G.wA > 0.01) {
      this._sunWash(s, vw, vh, lamp, G, dry * (1 - storm * 0.7));
    }

    // glow and shafts
    if (q >= 1 && !this.off.glow) {
      const night = clamp01(weather.nightMix ?? 0);
      const wet = clamp01(info.wet);
      let bloom = 0.15 + night * 0.10 + wet * 0.26 + gold * 0.06;
      bloom *= 1 - storm * 0.3;
      let rays = 0;
      if (q >= 2 && !this.off.rays && sun && sun.vis > 0.05 && dry > 0.3) {
        // low sun, and the dustier the air the more of it you can see
        const low = clamp01(sun.low);
        const air = 0.6 + clamp01(weather.haze || 0) * 0.35 + sand * 0.8;
        const lowK = Math.max(smoothstep(clamp01(low * 1.5)), gold);
        rays = lowK * 0.85 * sun.vis * dry * air * (1 - storm * 0.6);
        rays = clamp01(rays);
      }
      this.stats.bloom = bloom; this.stats.rays = rays;
      this._glow(s, vw, vh, bloom, rays, sun, q, night, wet);
    } else {
      this.stats.bloom = 0; this.stats.rays = 0;
    }

    // the storm's own light, after the grade so it is not graded away
    const e = this.strike.env;
    if (e > 0.01) {
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = e * 0.22;
      s.fillStyle = '#c8d4ff';
      s.fillRect(0, 0, vw, vh);
      s.globalCompositeOperation = 'source-over';
      s.globalAlpha = 1;
    }
  }

  _grade(s, vw, vh, G, k, storm, sand, weather) {
    s.save();
    // the tint
    let tint = G.tint, tA = G.tA;
    if (storm > 0.01) { tint = mixHex(tint, '#6a7890', storm * 0.6); tA += storm * 0.08; }
    if (sand > 0.01) { tint = mixHex(tint, '#e09048', sand * 0.6); tA += sand * 0.1; }
    s.globalCompositeOperation = 'soft-light';
    s.globalAlpha = clamp01(tA * k);
    s.fillStyle = tint;
    s.fillRect(0, 0, vw, vh);
    // moonlight: luminance kept, colour replaced
    if (G.oA > 0.01) {
      s.globalCompositeOperation = 'color';
      s.globalAlpha = clamp01(G.oA * k);
      s.fillStyle = G.tone;
      s.fillRect(0, 0, vw, vh);
    }
    // the midday bleach, and an overcast sky's grey
    const sat = G.sat + storm * 0.28;
    if (sat > 0.01) {
      s.globalCompositeOperation = 'saturation';
      s.globalAlpha = clamp01(sat * k);
      s.fillStyle = '#808080';
      s.fillRect(0, 0, vw, vh);
    }
    // what black is
    if (G.lA > 0.01) {
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = clamp01(G.lA * k);
      s.fillStyle = G.lift;
      s.fillRect(0, 0, vw, vh);
    }
    s.restore();
  }

  _sunWash(s, vw, vh, sun, G, k) {
    // a big disc in fine dithered bands, baked once per frame size
    // sized by the width: on a phone held upright the frame is tall, and a
    // wash sized by the height would take the whole floor with it
    const R = Math.round(Math.min(Math.max(vw, vh), vw * 1.25) * 0.84);
    if (!this._washSpr || this._washSpr.R !== R) {
      // baked at half size and drawn doubled: a 2px grain, a quarter of the
      // memory, and a quarter of the time to make
      const c = bakeDisc(Math.ceil(R / 2), 16, 1.7, 1);
      c.R = R;
      this._washSpr = c;
      this._washTint = canvas(c.width, c.height);
      this._washKey = '';
    }
    if (this._washKey !== G.wash) {
      const g = this._washTint.getContext('2d');
      g.clearRect(0, 0, this._washTint.width, this._washTint.height);
      g.globalCompositeOperation = 'source-over';
      g.drawImage(this._washSpr, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = G.wash;
      g.fillRect(0, 0, this._washTint.width, this._washTint.height);
      this._washKey = G.wash;
    }
    s.save();
    s.imageSmoothingEnabled = false;
    s.globalCompositeOperation = 'screen';
    s.globalAlpha = clamp01(G.wA * k * sun.vis);
    const D = this._washTint.width * 2;
    s.drawImage(this._washTint, Math.round(sun.x - D / 2), Math.round(sun.y - D / 2), D, D);
    s.restore();
  }

  /** Angular streaks round a centre: white shafts with grey air between. */
  _streaks() {
    if (this._st) return this._st;
    const S = 160, c = canvas(S, S);
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2;
        const a = Math.atan2(dy, dx);
        const r = Math.hypot(dx, dy) / (S / 2);
        let v = 0.5 + 0.30 * Math.sin(a * 7 + 1.3) + 0.22 * Math.sin(a * 13 + 0.4)
          + 0.16 * Math.sin(a * 23 + 2.1) + 0.1 * Math.sin(a * 41 + 0.7);
        v = clamp01(v);
        v = v * v * v;
        // no streaks right on the sun, where it is all just glare
        const core = clamp01(1 - r * 5);
        v = lerp(0.06 + v * 0.94, 1, core);
        const o = (y * S + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = Math.round(v * 255); d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this._st = c;
    return c;
  }

  _bayerPattern(s) {
    if (this._bayer) return this._bayer;
    const c = canvas(4, 4);
    const g = c.getContext('2d');
    const img = g.createImageData(4, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        // an offset of under one quantisation step, so flat black stays black
        const v = Math.round(((BAYER4[y][x] + 0.5) / 16) * (255 / (QN + 1)));
        const o = (y * 4 + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this._bayer = s.createPattern(c, 'repeat');
    return this._bayer;
  }

  /**
   * Bloom and shafts in one buffer. The frame at a quarter, cut down to its
   * brightest parts; for the shafts, only what is near the sun, smeared
   * outward from it in a few doubling passes so anything dark in front of
   * the sun - a dune, a rock, the crab - throws a shadow through the air.
   *
   * No CSS filters on the way: they are slow on exactly the devices that
   * need this to be cheap. Grey is a 'saturation' blend, the threshold is a
   * 'color-burn' (1 - (1 - v) / c is a ramp that starts at 1 - c), and the
   * blur is a trip down to an eighth and back.
   */
  _glow(s, vw, vh, bloom, rays, sun, q, night, wet) {
    const bw = this.bw, bh = this.bh;
    const A = this.qa.getContext('2d'), B = this.qb.getContext('2d');
    const E = this.qe.getContext('2d');
    const src = this.r.sceneC;

    // bright pass: grey, cut, and given back the colour of what was bright
    A.save();
    A.imageSmoothingEnabled = true;
    A.globalCompositeOperation = 'copy';
    A.drawImage(src, 0, 0, bw, bh);
    A.globalCompositeOperation = 'saturation';
    A.fillStyle = '#808080';
    A.fillRect(0, 0, bw, bh);
    A.globalCompositeOperation = 'color-burn';
    // the cut: lower at night, when a lantern is the brightest thing about
    const cut = night > 0.5 ? 0.42 : wet > 0.5 ? 0.3 : 0.17;
    const cv = Math.round(cut * 255);
    A.fillStyle = `rgb(${cv},${cv},${cv})`;
    A.fillRect(0, 0, bw, bh);
    A.globalCompositeOperation = 'multiply';
    A.drawImage(src, 0, 0, bw, bh);
    A.restore();

    // blurred: down to an eighth and back up, plus a little of the sharp one
    E.save();
    E.imageSmoothingEnabled = true;
    E.globalCompositeOperation = 'copy';
    E.drawImage(this.qa, 0, 0, this.ew, this.eh);
    E.restore();
    B.save();
    B.imageSmoothingEnabled = true;
    B.globalCompositeOperation = 'copy';
    B.drawImage(this.qe, 0, 0, bw, bh);
    B.globalCompositeOperation = 'lighter';
    B.globalAlpha = 0.45;
    B.drawImage(this.qa, 0, 0);
    B.restore();

    const R = this.qr.getContext('2d');
    let haveRays = false;
    if (rays > 0.02 && sun) {
      haveRays = true;
      const sx = sun.x / 4, sy = sun.y / 4;
      R.save();
      // the shafts are cut lower than the bloom: all the bright sky round
      // the sun goes in, so every dark thing in front of it casts one
      R.imageSmoothingEnabled = true;
      R.globalCompositeOperation = 'copy';
      R.drawImage(src, 0, 0, bw, bh);
      R.globalCompositeOperation = 'saturation';
      R.fillStyle = '#808080';
      R.fillRect(0, 0, bw, bh);
      R.globalCompositeOperation = 'color-burn';
      R.fillStyle = '#6a6a6a';
      R.fillRect(0, 0, bw, bh);
      // only the light near the sun goes into the shafts
      R.globalCompositeOperation = 'destination-in';
      const rr = Math.max(bw, bh) * 0.7;
      const g = R.createRadialGradient(sx, sy, 0, sx, sy, rr);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(0.35, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      R.fillStyle = g;
      R.fillRect(0, 0, bw, bh);
      R.globalCompositeOperation = 'destination-over';
      R.fillStyle = '#000';
      R.fillRect(0, 0, bw, bh);
      // and the sun itself, whether or not a mesa is in front of it: a sun
      // just gone behind the ranges still fills the air above them
      R.globalCompositeOperation = 'lighter';
      const sr = Math.max(bw, bh) * 0.11;
      const sg = R.createRadialGradient(sx, sy, 0, sx, sy, sr);
      sg.addColorStop(0, 'rgba(255,250,235,0.85)');
      sg.addColorStop(1, 'rgba(255,250,235,0)');
      R.fillStyle = sg;
      R.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      // the smear, outward from the sun: each pass doubles the samples
      R.globalCompositeOperation = 'source-over';
      R.imageSmoothingEnabled = true;
      for (const k of [1.06, 1.12, 1.25, 1.5, 2.0]) {
        R.globalAlpha = 0.5;
        R.drawImage(this.qr, sx - sx * k, sy - sy * k, bw * k, bh * k);
      }
      R.globalAlpha = 1;
      // dust: the air is not evenly full, so the light comes through it in
      // shafts even where nothing stands in front of the sun
      const st = this._streaks();
      const D = Math.max(bw, bh) * 2.6;
      R.globalCompositeOperation = 'multiply';
      R.translate(sx, sy);
      R.rotate(Math.sin(this.r.time * 0.05) * 0.12);
      R.drawImage(st, -D / 2, -D / 2, D, D);
      R.setTransform(1, 0, 0, 1, 0, 0);
      // shafts are the colour of the sun that makes them
      R.globalCompositeOperation = 'multiply';
      R.fillStyle = mixHex('#ffd8a0', '#ff9a58', clamp01(sun.low));
      R.fillRect(0, 0, bw, bh);
      R.restore();
    }

    const dither = q >= 2 && this.caps.quant && !this.off.dither;
    s.save();
    s.imageSmoothingEnabled = true;
    if (!dither) {
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = clamp01(bloom);
      s.drawImage(this.qb, 0, 0, vw, vh);
      if (haveRays) { s.globalAlpha = clamp01(rays * 0.9); s.drawImage(this.qr, 0, 0, vw, vh); }
      s.restore();
      return;
    }
    // into a half-size buffer, through the dither into another, and onto
    // the frame doubled - the same 2px grain as the vignette and the sun
    const hw = this.hw, hh = this.hh;
    const Gc = this.glow.getContext('2d');
    Gc.save();
    Gc.imageSmoothingEnabled = true;
    // opaque black first: the blends below need a backdrop with no holes
    Gc.globalCompositeOperation = 'copy';
    Gc.fillStyle = '#000';
    Gc.fillRect(0, 0, hw, hh);
    Gc.globalCompositeOperation = 'lighter';
    Gc.globalAlpha = clamp01(bloom * 1.1);
    Gc.drawImage(this.qb, 0, 0, hw, hh);
    if (haveRays) { Gc.globalAlpha = clamp01(rays * 1.3); Gc.drawImage(this.qr, 0, 0, hw, hh); }
    Gc.globalAlpha = 1;
    // a dead zone: the faint wide edge of a glow is invisible anyway, and
    // dithered it is a screen door over the whole sky. color-burn against
    // (1 - d) is exactly max(0, v - d) / (1 - d).
    Gc.globalCompositeOperation = 'color-burn';
    Gc.fillStyle = '#f0f0f0';
    Gc.fillRect(0, 0, hw, hh);
    Gc.globalCompositeOperation = 'lighter';
    Gc.fillStyle = this._bayerPattern(Gc);
    Gc.fillRect(0, 0, hw, hh);
    Gc.restore();
    const Q = this.glowQ.getContext('2d');
    Q.globalCompositeOperation = 'copy';
    Q.filter = 'url(#crabden-quant)';
    Q.drawImage(this.glow, 0, 0);
    Q.filter = 'none';
    s.imageSmoothingEnabled = false;
    s.globalCompositeOperation = 'lighter';
    s.drawImage(this.glowQ, 0, 0, hw, hh, 0, 0, hw * GRAIN, hh * GRAIN);
    s.restore();
  }

  /** The edges of the frame, in the colour of the hour, dithered. */
  vignette(s, vw, vh, G, extra = 0, mul = 1) {
    this._ensure(vw, vh);
    if (!this.vigMask) {
      // a white mask in fine bands, each edge broken by the dither, made once
      // per frame size. Fine, because a coarse dither over this much of the
      // frame reads as a screen door rather than as the edge of a lens.
      const c = canvas(vw, vh);
      const g = c.getContext('2d');
      const img = g.createImageData(vw, vh);
      const d = img.data;
      const cx = vw / 2, cy = vh * 0.52;
      const R = Math.hypot(vw / 2, vh / 2);
      const inner = 0.36, steps = 14;
      for (let y = 0; y < vh; y++) {
        for (let x = 0; x < vw; x++) {
          const dd = Math.hypot((x + 0.5 - cx) / R, (y + 0.5 - cy) / R * 1.12);
          const kk = clamp01((dd - inner) / (1 - inner));
          if (kk <= 0) continue;
          const f = Math.pow(kk, 1.6) * steps;
          let band = Math.floor(f);
          if (f - band > (BAYER4[y & 3][x & 3] + 0.5) / 16) band++;
          const a = Math.round(255 * Math.min(1, band / steps));
          if (!a) continue;
          const o = (y * vw + x) * 4;
          d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = a;
        }
      }
      g.putImageData(img, 0, 0);
      this.vigMask = c;
      this.vigTint = canvas(vw, vh);
      this._vigKey = '';
    }
    const col = G ? G.vig : '#0e0806';
    if (col !== this._vigKey) {
      const g = this.vigTint.getContext('2d');
      g.globalCompositeOperation = 'copy';
      g.drawImage(this.vigMask, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = col;
      g.fillRect(0, 0, vw, vh);
      g.globalCompositeOperation = 'source-over';
      this._vigKey = col;
    }
    s.globalAlpha = clamp01((G ? G.vA : 0.5) + extra) * mul;
    s.drawImage(this.vigTint, 0, 0);
    s.globalAlpha = 1;
  }
}
