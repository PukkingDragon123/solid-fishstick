// CRABDEN - layered renderer.
//   scene  the world at low resolution
//   light  ambient tint plus additive lights, multiplied over the scene
//   ui     HUD and dialogue, blitted last so the heat haze never wobbles text
//
// Point lights live in light.js (dithered discs, queued, flickering); the
// lens - grade of the hour, sun wash, shafts, glow, vignette, storm - lives
// in post.js, with the frame-rate governor that sheds the expensive passes.

import { clamp, clamp01, lerp, mixHex } from '../lib/math.js';
import { hash2i } from './pixel.js';
import { pxVignette } from './pix.js';
import { LightPool } from './light.js';
import { Post } from './post.js';

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
    this.lights = new LightPool();
    this.post = new Post(this);
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
    this._overlaid = false;
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

  /**
   * A light. Screen pixels by default, as it always was:
   *   addLight(x, y, r, color, alpha)
   * and for anything that burns, glows or lives in the world:
   *   addLight(wx, wy, r, '#ffb060', 0.9, { world: true, flicker: true, glow: 0.8 })
   * world   x, y and r are world units; the camera puts them on screen
   * flicker true or 0..2: a flame's unsteadiness (seed: keep two apart)
   * glow    0..1: how much it lights the air too, not just the ground
   * It can be called at any point while the frame is drawn; every light is
   * laid down together when the frame is composited.
   */
  addLight(x, y, r, color, alpha = 1, opts = null) {
    this.lights.push(x, y, r, color, alpha, opts);
  }

  /** The quality the lens is running at (0-2), and a way to pin it. */
  get fxQuality() { return this.post.gov.level; }
  set fxQuality(q) { this.post.gov.force = q == null ? null : clamp(Math.round(q), 0, 2); }

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
    // the clock the shimmer, the flames and the grades run on: the game
    // begins each frame with beginFrame(0), so it has to advance here
    this.time += dt;
    this.post.updateStrike(dt, weather);
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
    // once a frame: the game draws it before the light goes on, so the rain
    // is lit by the hour like everything else, and composite's own call is
    // only there for a caller that never made one
    if (this._overlaid) return;
    this._overlaid = true;
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
    // lightning is not drawn here any more: the strike lights the world
    // through the light layer, and the bolt is in the sky (see post.js and
    // Sky._drawBolt)
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

  /** Underwater the water itself is the grade: teal, soft-lit. */
  _gradeWet(s) {
    const wet = this.underwater || 0;
    if (wet < 0.02) return;
    s.save();
    s.globalCompositeOperation = 'soft-light';
    s.globalAlpha = (0.16 + wet * 0.14) * clamp01(wet * 2);
    s.fillStyle = '#3ec8d8';
    s.fillRect(0, 0, this.vw, this.vh);
    s.restore();
  }

  /** What the lens needs to know about the world this frame. */
  _frameInfo(weather, game) {
    const sky = game?.backdrop?.sky;
    const geo = game?.backdrop?._geo;
    return {
      wet: this.underwater || 0,
      sun: sky?.sunPos || null,
      moon: sky?.moonPos || null,
      horizon: geo ? geo.H : this.vh * 0.5,
    };
  }

  /**
   * The lights the world has without anybody asking: at night a broad, cool
   * pool where the animal is, so the dark is dark but you never lose it.
   */
  _autoLights(weather, game, out) {
    const night = clamp01(weather.nightMix ?? 0);
    const dry = 1 - clamp01((this.underwater || 0) * 2);
    if (night < 0.05 || dry < 0.05 || !game?.crab || !game.cam) return;
    if (game.state !== 'play' && game.state !== 'title' && game.state !== 'dead') return;
    const c = game.crab, cam = game.cam;
    const p = cam.worldToScreen(c.x, c.y - 14);
    const r = 96 * cam.zoom;
    out.push({ x: p.x, y: p.y, r, a: 0.24 * night * dry, color: '#8ea8e0', o: { glow: 0 } });
    out.push({ x: p.x, y: p.y - 4, r: r * 0.45, a: 0.14 * night * dry, color: '#c8d6ff', o: { glow: 0 } });
  }

  composite(weather, game) {
    // the governor is fed real frame time from here, not from update(),
    // which the title screen and the menus never call
    const now = performance.now();
    if (this._lastC) this.post.gov.tick((now - this._lastC) / 1000);
    this._lastC = now;
    const s = this.scene;
    const info = this._frameInfo(weather, game);

    // the lights, all at once, then the storm lighting everything cold
    const lights = this.lights.resolve(game?.cam, this.time);
    this._autoLights(weather, game, lights);
    const l = this.light;
    l.globalCompositeOperation = 'lighter';
    this.lights.drawInto(l, lights, this.vw, this.vh);
    this.post.strikeLight(l, this.vw, this.vh, info.horizon);
    l.globalCompositeOperation = 'source-over';

    this.drawWeatherOverlay(weather, game);

    s.globalCompositeOperation = 'multiply';
    s.drawImage(this.lightC, 0, 0);
    s.globalCompositeOperation = 'source-over';

    // the air around a fire is lit too
    this.lights.drawGlow(s, lights, this.vw, this.vh, clamp01(weather.nightMix ?? 0), 0.2);
    this.lights.clear();

    // the grade and the glow, before the vignette closes the frame
    this._gradeWet(s);
    this.post.apply(s, weather, info);

    const dryK = 1 - clamp01(info.wet * 1.5);
    if (dryK > 0.01) {
      this.post.vignette(s, this.vw, this.vh, this.post.G, this.post.strike.env * -0.3, dryK);
    }
    if (dryK < 0.99) {
      if (!this._vignette) this._buildVignette();
      s.globalAlpha = 1 - dryK;
      s.drawImage(this._vignette, 0, 0);
      s.globalAlpha = 1;
    }
    if ((this.underwater || 0) > 0.05) {
      // and underwater the edges go to deep blue rather than to brown
      pxVignette(s, this.vw, this.vh, '#021a33', this.underwater * 0.32, { p: 2, steps: 5, inner: 0.42 });
    }

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
      // the mirage sits on the far horizon, where you look through the
      // most hot air; close to you the ground barely moves
      const horizon = info.horizon + 6;
      for (let y = 0; y < this.vh; y += band) {
        const depth = clamp01(1 - Math.abs(y - horizon) / (this.vh * 0.3));
        const amp = haze * (0.18 + depth * depth * 1.9);
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
