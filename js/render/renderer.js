// CRABDEN - layered renderer.
//   scene  the world at low resolution
//   light  ambient tint plus additive lights, multiplied over the scene
//   ui     HUD and dialogue, blitted last so the heat haze never wobbles text

import { clamp, clamp01, lerp, mixHex, rgba } from '../lib/math.js';
import { hash2i } from './pixel.js';
import { pxVignette } from './pix.js';

const BASE_W = 460;
const BASE_H = 258;

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export class Renderer {
  constructor(canvas) {
    this.display = canvas;
    this.dctx = canvas.getContext('2d');
    this.vw = BASE_W; this.vh = BASE_H;
    this.scale = 2;
    this.time = 0;
    this.haze = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.fade = 0;
    this.fadeColor = '#000000';
    // What you are holding colours the whole world, not a chip in the corner.
    // `mode` names the grade and `modeK` eases it in and out so switching
    // hands is a wash rather than a cut.
    this.mode = null;
    this.modeK = 0;
    this.modePulse = 0;     // rises on a hit or a release, decays on its own
    this.motes = [];        // spore motes drifting over the frame
    this._vignette = null;
    this._makeLayers();
    this.resize();
  }

  _makeLayers() {
    this.sceneC = newCanvas(this.vw, this.vh);
    this.lightC = newCanvas(this.vw, this.vh);
    this.uiC = newCanvas(this.vw, this.vh);
    this.scene = this.sceneC.getContext('2d');
    this.light = this.lightC.getContext('2d');
    this.ui = this.uiC.getContext('2d');
    for (const c of [this.scene, this.light, this.ui]) c.imageSmoothingEnabled = false;
  }

  resize() {
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(200, window.innerHeight);
    let scale = Math.max(2, Math.floor(Math.min(w / BASE_W, h / BASE_H)));
    scale = Math.min(scale, 6);
    const vw = Math.ceil(w / scale);
    // A phone held upright is much taller than any game wants to be. The first
    // answer here was a letterbox, and it was worse than the problem: two fat
    // black bars and the game floating between them. So the frame is the whole
    // screen, and the tallness is dealt with where it actually comes from -
    // the camera puts the horizon higher and pulls in a little (see
    // `Game.autoZoom` and `cam.yBias`), so the bottom half is ground with the
    // controls sitting on it instead of a hundred rows of empty sky.
    //
    // The cap that is left only exists so a freakishly narrow window cannot
    // ask for a buffer taller than it is wide twice over.
    const vh = Math.min(Math.ceil(h / scale), Math.ceil(vw * 2.1));
    this.scale = scale;
    /** True when the frame is meaningfully taller than it is wide. */
    this.tall = vh > vw * 1.05;
    if (vw !== this.vw || vh !== this.vh) {
      this.vw = vw; this.vh = vh;
      this._makeLayers();
      this._vignette = null;
    }
    this.display.width = vw * scale;
    this.display.height = vh * scale;
    this.display.style.width = vw * scale + 'px';
    this.display.style.height = vh * scale + 'px';
    this.dctx = this.display.getContext('2d');
    this.dctx.imageSmoothingEnabled = false;
  }

  beginFrame(dt) {
    this.time += dt;
    this.scene.clearRect(0, 0, this.vw, this.vh);
    this.ui.clearRect(0, 0, this.vw, this.vh);
  }

  beginLights(weather) {
    const l = this.light;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.vw, this.vh);
    const base = mixHex(weather.ambientColor, '#ffffff', 0.2 + weather.daylight * 0.08);
    l.fillStyle = base;
    l.fillRect(0, 0, this.vw, this.vh);
    l.globalCompositeOperation = 'lighter';
  }
  endLights() { this.light.globalCompositeOperation = 'source-over'; }

  addLight(x, y, r, color, alpha = 1) {
    if (r <= 0 || alpha <= 0.004) return;
    const l = this.light;
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(0.5, rgba(color, alpha * 0.4));
    g.addColorStop(1, rgba(color, 0));
    l.fillStyle = g;
    l.fillRect(x - r, y - r, r * 2, r * 2);
  }

  _buildVignette() {
    const c = newCanvas(this.vw, this.vh);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(
      this.vw / 2, this.vh * 0.52, Math.min(this.vw, this.vh) * 0.3,
      this.vw / 2, this.vh * 0.52, Math.max(this.vw, this.vh) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(14,8,6,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.vw, this.vh);
    this._vignette = c;
  }

  update(dt, weather) {
    this.haze = lerp(this.haze, weather.haze * 1.7, 1 - Math.pow(0.06, dt));
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const want = this.mode ? 1 : 0;
    this.modeK = lerp(this.modeK, want, 1 - Math.pow(0.02, dt));
    this.modePulse = Math.max(0, this.modePulse - dt * 1.8);
    if (this.mode === 'spore' && this.modeK > 0.05) this._motes(dt);
    else if (this.motes.length) this.motes.length = 0;
  }

  /** Which grade the frame is under. Called every frame by the game. */
  setMode(id) { this.mode = id || null; }

  /** A hit, a release, a kill - something that should hit the frame itself. */
  modeHit(a = 1) { this.modePulse = Math.min(1.4, this.modePulse + a); }

  /** Spores in the air, drifting up and across, for the dreamy grade. */
  _motes(dt) {
    const M = this.motes;
    if (M.length < 60 && Math.random() < dt * 70) {
      M.push({
        x: Math.random() * this.vw, y: this.vh + 6,
        vy: -6 - Math.random() * 16, ph: Math.random() * 6.3,
        r: Math.random() < 0.22 ? 2 : 1, life: 0,
      });
    }
    for (let i = M.length - 1; i >= 0; i--) {
      const m = M[i];
      m.life += dt;
      m.y += m.vy * dt;
      m.ph += dt * 1.3;
      if (m.y < -8) M.splice(i, 1);
    }
  }

  doFlash(color = '#ffffff', a = 0.6) { this.flashColor = color; this.flash = a; }

  /** Weather that lives in front of the world: rain, blown sand, lightning. */
  drawWeatherOverlay(weather, game) {
    const s = this.scene;
    const vw = this.vw, vh = this.vh;
    if (weather.sand > 0.02) {
      const n = Math.round(weather.sand * 70);
      s.globalAlpha = clamp01(weather.sand * 0.45);
      s.fillStyle = '#e8cfa2';
      for (let i = 0; i < n; i++) {
        const sp = 220 + (i % 9) * 90;
        const x = ((i * 137 + this.time * sp) % (vw + 120)) - 60;
        const y = (i * 71) % vh;
        s.fillRect(Math.round(x), Math.round(y), 7 + (i % 6) * 4, 1);
      }
      s.globalAlpha = 1;
    }
    if (weather.rain > 0.02) {
      const n = Math.round(weather.rain * 90);
      s.globalAlpha = 0.42;
      s.fillStyle = '#b6dbe8';
      for (let i = 0; i < n; i++) {
        const x = ((i * 97 + this.time * 60) % (vw + 40)) - 20;
        const y = ((i * 53 + this.time * 620) % (vh + 30)) - 15;
        s.fillRect(Math.round(x), Math.round(y), 1, 6);
      }
      s.globalAlpha = 1;
    }
    if (weather.lightningFlash > 0.01) {
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = weather.lightningFlash * 0.75;
      s.fillStyle = '#dde6ff';
      s.fillRect(0, 0, vw, vh);
      s.globalAlpha = 1;
      s.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * The mode grade. HUNT drops the whole frame into a hot red, closes it down
   * at the edges and puts a bar of heat top and bottom that beats with the
   * strike timer; SPORE lifts it into violet, throws a soft bloom over
   * everything and hangs spores in the air. Both are made of the same square
   * pixels as the rest of the game - a canvas gradient here would be the one
   * smooth thing on the screen.
   */
  _drawModeGrade(s) {
    const k = this.modeK;
    if (!this.mode || k < 0.02) return;
    const vw = this.vw, vh = this.vh;
    const t = this.time;

    if (this.mode === 'hunt') {
      const beat = 0.5 + 0.5 * Math.sin(t * 6.2);
      const heat = k * (0.78 + this.modePulse * 0.40);
      // the wash: multiplied, so the sand goes bloody rather than pink
      s.globalCompositeOperation = 'multiply';
      s.globalAlpha = heat * 0.46;
      s.fillStyle = '#b83a2e';
      s.fillRect(0, 0, vw, vh);
      s.globalCompositeOperation = 'source-over';
      // a thin hot layer over the top, so the reds stay reds and do not just
      // go dark - blood, not a brown filter
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = heat * 0.10;
      s.fillStyle = '#8a1a10';
      s.fillRect(0, 0, vw, vh);
      s.globalCompositeOperation = 'source-over';
      // and the frame closing in, hard
      s.globalAlpha = 1;
      pxVignette(s, vw, vh, '#3a0704', heat * (0.82 + beat * 0.12), { p: 2, steps: 5, inner: 0.24 });
      // two bars of heat, top and bottom, breathing on the beat
      const bh = Math.round(vh * 0.075 * (0.7 + beat * 0.5));
      s.fillStyle = '#e2564f';
      for (let y = 0; y < bh; y += 1) {
        s.globalAlpha = heat * 0.62 * Math.pow(1 - y / bh, 1.6);
        s.fillRect(0, y, vw, 1);
        s.fillRect(0, vh - 1 - y, vw, 1);
      }
      // and a scanline crawl, which is what makes it feel like a state you
      // are in rather than a colour someone put on the lens
      s.globalAlpha = heat * 0.10;
      s.fillStyle = '#ff6a58';
      for (let y = Math.round(t * 40) % 4; y < vh; y += 4) s.fillRect(0, y, vw, 1);
      // and the pulse itself: a bright rim when something lands
      if (this.modePulse > 0.02) {
        s.globalCompositeOperation = 'lighter';
        s.globalAlpha = Math.min(0.5, this.modePulse * 0.4) * k;
        s.fillStyle = '#ff8a72';
        s.fillRect(0, 0, vw, vh);
        s.globalCompositeOperation = 'source-over';
      }
      s.globalAlpha = 1;
      return;
    }

    if (this.mode === 'spore') {
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.9);
      // the wash: screened, so it lifts the shadows into violet instead of
      // dirtying the highlights - the dream is brighter than the world
      s.globalCompositeOperation = 'lighter';
      s.globalAlpha = k * (0.10 + breathe * 0.05);
      s.fillStyle = '#6a3a88';
      s.fillRect(0, 0, vw, vh);
      s.globalCompositeOperation = 'multiply';
      s.globalAlpha = k * 0.22;
      s.fillStyle = '#b48ad0';
      s.fillRect(0, 0, vw, vh);
      s.globalCompositeOperation = 'source-over';
      s.globalAlpha = 1;
      pxVignette(s, vw, vh, '#2a1038', k * (0.44 + breathe * 0.10), { p: 2, steps: 5, inner: 0.34 });
      // spores hanging in the air, drifting up across the whole frame
      s.globalCompositeOperation = 'lighter';
      for (const m of this.motes) {
        const x = m.x + Math.sin(m.ph) * 9;
        const fade = Math.min(1, m.life * 1.5);
        s.globalAlpha = k * fade * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(m.ph * 2.1)));
        s.fillStyle = m.r > 1 ? '#e6c0f2' : '#c98ade';
        s.fillRect(Math.round(x), Math.round(m.y), m.r, m.r);
      }
      s.globalCompositeOperation = 'source-over';
      s.globalAlpha = 1;
      return;
    }
  }

  composite(weather, game) {
    const s = this.scene;
    s.globalCompositeOperation = 'multiply';
    s.drawImage(this.lightC, 0, 0);
    s.globalCompositeOperation = 'source-over';

    this.drawWeatherOverlay(weather, game);

    if (!this._vignette) this._buildVignette();
    s.drawImage(this._vignette, 0, 0);

    this._drawModeGrade(s);

    if (this.flash > 0.004) {
      s.globalAlpha = clamp01(this.flash);
      s.fillStyle = this.flashColor;
      s.fillRect(0, 0, this.vw, this.vh);
      s.globalAlpha = 1;
    }

    const d = this.dctx;
    const sc = this.scale;
    d.fillStyle = '#07050a';
    d.fillRect(0, 0, this.display.width, this.display.height);

    const haze = this.haze;
    // The dream is a warp, not a filter: in SPORE the whole frame breathes in
    // long slow waves, and in HUNT it jolts on the beat. Both ride the same
    // per-row redraw the heat shimmer already uses.
    const k = this.modeK;
    const dream = this.mode === 'spore' ? k : 0;
    const jolt = this.mode === 'hunt' ? k * (0.25 + this.modePulse * 0.75) : 0;
    if (haze < 0.02 && dream < 0.02 && jolt < 0.02) {
      d.drawImage(this.sceneC, 0, 0, this.vw, this.vh, 0, 0, this.vw * sc, this.vh * sc);
    } else {
      d.drawImage(this.sceneC, 0, 0, this.vw, this.vh, 0, 0, this.vw * sc, this.vh * sc);
      const band = 2;
      const t = this.time;
      const horizon = this.vh * 0.5;
      for (let y = 0; y < this.vh; y += band) {
        // shimmer is strongest just above the ground, where the air is hottest
        const depth = clamp01(1 - Math.abs(y - horizon) / (this.vh * 0.55));
        const amp = haze * (0.35 + depth * 1.5);
        let off = (Math.sin(y * 0.23 + t * 2.4) * 0.7 + Math.sin(y * 0.08 - t * 1.4) * 0.5) * amp;
        if (dream > 0.02) {
          // long, low-frequency, slightly out of phase top to bottom
          off += (Math.sin(y * 0.035 + t * 0.8) * 2.6 + Math.sin(y * 0.013 - t * 0.5) * 1.8) * dream;
        }
        if (jolt > 0.02) {
          // short, hard, and only on some rows, so it reads as a flinch
          if ((y >> 1) % 3 === 0) off += Math.sin(t * 30 + y * 0.9) * 1.8 * jolt;
        }
        off = Math.round(off);
        if (!off) continue;
        const hh = Math.min(band, this.vh - y);
        d.drawImage(this.sceneC, 0, y, this.vw, hh, off * sc, y * sc, this.vw * sc, hh * sc);
      }
    }

    d.drawImage(this.uiC, 0, 0, this.vw, this.vh, 0, 0, this.vw * sc, this.vh * sc);

    if (this.fade > 0.002) {
      d.globalAlpha = clamp01(this.fade);
      d.fillStyle = this.fadeColor;
      d.fillRect(0, 0, this.display.width, this.display.height);
      d.globalAlpha = 1;
    }
  }
}
